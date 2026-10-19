// Jalan di instance SGP/Systech (BUKAN Internal/Master). Tiap interval,
// ambil data LOKAL dan POST ke /api/sync di Master via Cloudflare Tunnel
// (outbound doang, gak butuh Tailscale/VPN/port terbuka). Ini FALLBACK
// buat arsitektur pull yang sudah ada — kalau Master gagal PULL, dia masih
// bisa pakai data terakhir yang dipush lewat sini (sourceClient.js
// tryPushFallback()).
//
// Gagal kirim? Antrian sederhana di file lokal (sync-push-queue.json),
// di-retry otomatis di siklus berikutnya. Aktif hanya kalau
// PUSH_MASTER_URL & PUSH_SYNC_KEY diisi (lihat index.js).

const axios = require("axios");
const fs = require("fs");
const path = require("path");

const {
  getLocalSummary,
  getDailyTrend,
  getLocalMonthlySummary,
} = require("./summaryService");
const { getLineRangeBreakdown } = require("./lineBreakdownService");
const { getAllLines } = require("../utils/linesRegistry");
const plog = require("../utils/dailyLogger");

const SOURCE_NAME = process.env.SOURCE_NAME; // 'sgp' | 'systech'
const MASTER_URL = process.env.PUSH_MASTER_URL; // https://<domain-atau-tunnel>/api/sync
const SYNC_KEY = process.env.PUSH_SYNC_KEY;
const INTERVAL_MS = Number(process.env.PUSH_INTERVAL_MS) || 60 * 1000; // default 1 menit
const REQUEST_TIMEOUT_MS = Number(process.env.PUSH_REQUEST_TIMEOUT_MS) || 10 * 1000;
// Kirim ke Master PARALEL (bukan satu-satu) biar siklus gak kelamaan —
// ~85 request sekuensial lewat tunnel gampang nembus 60 detik. Collect
// data lokal SENGAJA tetap sekuensial: itu nembak DB ConMas (berlisensi,
// operasional real-time), jangan ditambah bebannya.
const SEND_CONCURRENCY = Math.max(1, Number(process.env.PUSH_SEND_CONCURRENCY) || 4);
const MAX_QUEUE_ITEMS = 500;
// Job collect yang lebih lama dari ini dianggap "lambat" & dicatat di log
// biar ketauan query/endpoint mana yang bikin siklus molor.
const SLOW_JOB_MS = 5000;
// Detail error per-item dibatasi per siklus — sisanya cukup angka di baris
// ringkasan CYCLE (kalau gak, Master down = ~85 baris error tiap menit).
const MAX_ERR_LINES_PER_CYCLE = 3;

const QUEUE_FILE = path.join(__dirname, "..", "data", "sync-push-queue.json");

function loadQueue() {
  try {
    if (!fs.existsSync(QUEUE_FILE)) return [];
    return JSON.parse(fs.readFileSync(QUEUE_FILE, "utf-8"));
  } catch (err) {
    console.error("PUSHSYNC/loadQueue gagal baca file, mulai dari kosong:", err.message);
    return [];
  }
}

// Antrian cuma perlu 1 item TERBARU per type — snapshot lama dari type yang
// sama itu sia-sia (dan di sisi Master udah ditolak kalau lebih tua dari
// yang tersimpan, lihat guard payload_timestamp di pushStore.js).
function dedupeByType(queue) {
  const latest = new Map();
  for (const item of queue) {
    const prev = latest.get(item.type);
    if (!prev || new Date(item.timestamp) >= new Date(prev.timestamp)) {
      latest.set(item.type, item);
    }
  }
  return [...latest.values()];
}

function saveQueue(queue) {
  try {
    const trimmed = dedupeByType(queue).slice(-MAX_QUEUE_ITEMS);
    fs.mkdirSync(path.dirname(QUEUE_FILE), { recursive: true });
    // Tulis atomik (tmp -> rename): kalau proses mati di tengah nulis,
    // file lama tetap utuh, gak jadi JSON separuh yang di-reset diam-diam
    // sama loadQueue().
    const tmp = `${QUEUE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(trimmed));
    fs.renameSync(tmp, QUEUE_FILE);
  } catch (err) {
    console.error("PUSHSYNC/saveQueue gagal tulis file:", err.message);
    plog.error("QUEUE_SAVE_FAIL", { msg: err.message });
  }
}

// Ringkas error axios jadi 1 kunci pendek buat dihitung/dikelompokkan:
// "http530" (tunnel mati/URL salah), "ENOTFOUND" (DNS), "ECONNABORTED"
// (timeout), "http403" (key salah), dst.
function describeError(err) {
  const status = err.response?.status;
  return { key: status ? `http${status}` : err.code || "unknown", message: err.message };
}

function formatErrCounts(counts) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length ? entries.map(([k, n]) => `${k}:${n}`).join(",") : "-";
}

// Jalanin worker untuk tiap item dengan maksimal `limit` yang jalan bareng.
// Worker WAJIB nangkep error sendiri.
async function runPool(items, limit, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      await worker(items[idx]);
    }
  });
  await Promise.all(runners);
}

async function sendToMaster(item) {
  await axios.post(
    MASTER_URL,
    {
      source: SOURCE_NAME,
      type: item.type,
      timestamp: item.timestamp,
      data: item.data,
    },
    {
      headers: { "x-sync-key": SYNC_KEY, "Content-Type": "application/json" },
      timeout: REQUEST_TIMEOUT_MS,
    },
  );
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Rentang 1 bulan PENUH (tgl 1 s.d. hari terakhir) — sama persis pola yang
// dipakai Frontend (BreakdownTempat.jsx `monthRange()`) buat manggil
// /line-range-breakdown, biar type push-nya ketemu pas dicocokkan di
// sourceClient.js.
function fullMonthRange(year, month) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${year}-${pad2(month)}-01`,
    end: `${year}-${pad2(month)}-${pad2(lastDay)}`,
  };
}

// Loopback ke /api/external/dashboard/* (routes/api-external.js) —
// wrapper itu sendiri loopback lagi ke /api/dashboard/* (routes/dashboard.js,
// logic-nya masih nempel di route handler, belum diextract ke service
// function), jadi 1 hop tambahan tapi zero risk ke kode lama.
const LOCAL_PORT = process.env.PORT || 3000;
async function fetchLocalDashboard(pathName, query = {}) {
  const qs = new URLSearchParams(query).toString();
  const url = `http://localhost:${LOCAL_PORT}/api/external/dashboard/${pathName}${qs ? `?${qs}` : ""}`;
  // /api/external/* SEMUANYA di-gate `requireApiKey` (lihat routes/api-
  // external.js), termasuk 5 route dashboard/* yang baru — loopback ke DIRI
  // SENDIRI pun tetep kena, jadi header ini WAJIB dikirim, bukan opsional.
  const r = await axios.get(url, {
    timeout: 10000,
    headers: { "x-api-key": process.env.EXTERNAL_API_KEY || "" },
  });
  if (!r.data || r.data.status !== "ok") {
    throw new Error(r.data?.message || `dashboard/${pathName} proxy gagal`);
  }
  return r.data.data;
}

async function collectPayloads() {
  // Try/catch per-jenis di bawah — biar 1 query gagal (mis.
  // getLocalMonthlySummary lagi lambat) gak bikin jenis data lain ikut
  // gak ke-push.
  const timestamp = new Date().toISOString();
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  const year = wib.getUTCFullYear();
  const month = wib.getUTCMonth() + 1;
  const { start: monthStart, end: monthEnd } = fullMonthRange(year, month);

  const jobs = [
    { type: "summary", fn: () => getLocalSummary() },
    { type: "monthly-trend", fn: () => getDailyTrend(year, month) },
    // Type-nya SENGAJA ikut year-month, bukan cuma "monthly-summary"
    // statis — biar Master (sourceClient.js) cuma pake data ini sebagai
    // fallback buat BULAN YANG SAMA persis, bukan ke-apply asal ke bulan
    // lain yang diminta pas pull HTTP normal gagal.
    { type: `monthly-summary-${year}-${month}`, fn: () => getLocalMonthlySummary(year, month) },
    // Sama polanya kayak monthly-summary di atas — "Breakdown per Line"
    // di Frontend selalu minta 1 bulan PENUH (tgl 1 s.d. akhir bulan),
    // jadi aman di-key per year-month juga. Ini yang bikin halaman
    // "Breakdown per Line" buat SGP/Systech nampilin "Error: Kredensial/
    // URL belum dikonfigurasi" kalau pull lagi mati — sebelumnya type ini
    // gak pernah dipush sama sekali.
    {
      type: `line-range-breakdown-${year}-${month}`,
      fn: () => getLineRangeBreakdown(null, monthStart, monthEnd),
    },
    // 5 jenis di bawah ini buat isi "Dashboard Utama" pas dibuka dari
    // Master Hub buat lokasi ini (lihat routes/master.js dashboard/*
    // proxy). "summary-all" & "summary-by-tempat" gak ada parameter
    // (selalu snapshot shift berjalan), jadi type-nya statis kayak
    // "summary" — direfresh tiap siklus, bukan di-key per-hari/bulan.
    { type: "dashboard-summary-all", fn: () => fetchLocalDashboard("summary-all") },
    { type: "dashboard-summary-by-tempat", fn: () => fetchLocalDashboard("summary-by-tempat") },
    // "summary-all-daily" defaultnya HARI INI (WIB) kalau ?date= gak
    // diisi — cuma tanggal HARI BERJALAN yang di-push tiap siklus, sama
    // keterbatasannya kayak "range-trend": kalau user geser panel Ranking
    // Line ke tanggal lain pas lagi offline, gak ada fallback buat
    // tanggal itu (pull normal tetap satu-satunya jalur buat histori).
    {
      type: `dashboard-summary-all-daily-${year}-${pad2(month)}-${pad2(wib.getUTCDate())}`,
      fn: () => fetchLocalDashboard("summary-all-daily"),
    },
    {
      type: `dashboard-daily-trend-${year}-${month}`,
      fn: () => fetchLocalDashboard("daily-trend", { year, month }),
    },
    {
      type: `dashboard-monthly-summary-${year}-${month}`,
      fn: () => fetchLocalDashboard("monthly-summary", { year, month }),
    },
    // "range-trend" sengaja gak dipush rutin — parameternya bebas
    // (start/end custom dari user di Master), gak pas buat cache berkala.
  ];

  // ⚠️ Drill-down per-line (klik row Ranking Line di Master Hub → buka
  // PCBDashboard versi RINGKAS) — SATU-SATUNYA jalur buat data ini,
  // BUKAN fallback, karena pull HTTP Master→subcont gak pernah bisa jalan
  // di infra ini (gak ada Tailscale, subcont cuma expose lewat tunnel
  // outbound doang — lihat komentar panjang di sourceClient.js
  // getPushTypeForPath). 1 line = 2 request (line-summary + line-monthly),
  // jadi makin banyak line aktif, makin banyak request/siklus — cek
  // syncLimiter di routes/sync.js (Master) masih punya headroom kalau
  // jumlah line nambah banyak.
  for (const line of getAllLines()) {
    jobs.push({
      type: `dashboard-line-${line.line_code}`,
      fn: () => fetchLocalDashboard("line-summary", { line: line.line_code }),
    });
    jobs.push({
      type: `dashboard-line-monthly-${line.line_code}-${year}-${month}`,
      fn: () => fetchLocalDashboard("line-monthly", { line: line.line_code }),
    });
  }

  const payloads = [];
  const failed = [];
  const slow = [];
  for (const job of jobs) {
    const t0 = Date.now();
    try {
      const data = await job.fn();
      payloads.push({ type: job.type, timestamp, data });
    } catch (err) {
      // err.message dari Axios itu generic banget ("Request failed with
      // status code 500") — nutupin body response aslinya yang biasanya
      // ada pesan/stack lebih spesifik. err.response.data itu isinya JSON
      // error dari server (kalau ada), lebih kepake buat debug.
      const detail = err.response?.data
        ? JSON.stringify(err.response.data)
        : err.message;
      failed.push({ type: job.type, detail });
      console.error(`PUSHSYNC/collect (${job.type}) gagal:`, detail);
    }
    const took = Date.now() - t0;
    if (took >= SLOW_JOB_MS) slow.push({ type: job.type, ms: took });
  }
  return { payloads, failed, slow };
}

// ── BACKFILL HISTORI ──────────────────────────────────────────────
// syncCycle() di atas CUMA push tanggal/bulan BERJALAN (lihat komentar
// panjang di collectPayloads) — histori (tanggal/bulan yang udah lewat)
// gak pernah ke-push sama sekali, jadi kalau pull HTTP normal (Tailscale/
// tunnel) gagal buat data lama, gak ada fallback (sourceClient.js balikin
// null/error, BUKAN "data basi").
//
// 2 fungsi di bawah ini dipakai scripts/backfillPush.js buat push data
// LAMA sekali jalan (bukan tiap siklus/menit kayak syncCycle) — abis itu,
// karena bulan/hari yang udah lewat dianggap FINAL sama sourceClient.js
// (isClosedDay/isClosedMonth -> maxAge Infinity), gak akan basi lagi
// SELAMANYA meski backfill cuma dijalanin sekali.

// Backfill 1 HARI spesifik — dipakai buat type `dashboard-summary-all-
// daily-YYYY-MM-DD` (panel Ranking Line by tanggal). dateStr format
// "YYYY-MM-DD".
async function collectDayPayload(dateStr) {
  const timestamp = new Date().toISOString();
  try {
    const data = await fetchLocalDashboard("summary-all-daily", { date: dateStr });
    return { type: `dashboard-summary-all-daily-${dateStr}`, timestamp, data };
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error(`PUSHSYNC/backfill hari (${dateStr}) gagal:`, detail);
    return null;
  }
}

// Backfill 1 BULAN spesifik — 4 type yang di-key per year-month. SENGAJA
// GAK termasuk "monthly-trend" (dipush statis di collectPayloads, gak
// per-bulan sama sekali di sourceClient.js — backfill bulan lama ke type
// itu malah bisa nimpa cache bulan BERJALAN. Itu keterbatasan lain, di
// luar scope backfill ini) dan "dashboard-line-monthly-*" (per-line, bisa
// dipush terpisah lewat collectLineMonthPayloads kalau perlu).
async function collectMonthPayloads(year, month) {
  const timestamp = new Date().toISOString();
  const { start: monthStart, end: monthEnd } = fullMonthRange(year, month);
  const jobs = [
    { type: `monthly-summary-${year}-${month}`, fn: () => getLocalMonthlySummary(year, month) },
    {
      type: `line-range-breakdown-${year}-${month}`,
      fn: () => getLineRangeBreakdown(null, monthStart, monthEnd),
    },
    {
      type: `dashboard-daily-trend-${year}-${month}`,
      fn: () => fetchLocalDashboard("daily-trend", { year, month }),
    },
    {
      type: `dashboard-monthly-summary-${year}-${month}`,
      fn: () => fetchLocalDashboard("monthly-summary", { year, month }),
    },
  ];
  const payloads = [];
  for (const job of jobs) {
    try {
      const data = await job.fn();
      payloads.push({ type: job.type, timestamp, data });
    } catch (err) {
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error(`PUSHSYNC/backfill bulan (${job.type}) gagal:`, detail);
    }
  }
  return payloads;
}

// Batasi berapa item backlog yang dicoba kirim ulang PER SIKLUS — kalau
// backlog gede (misal abis Master down/reject beberapa saat), jangan
// nembak SEMUANYA sekaligus dalam 1 siklus (bisa puluhan/ratusan request
// beruntun, gampang nabrak syncLimiter di Master lagi -> gagal lagi ->
// numpuk lagi, gak pernah abis-abis). Kuras pelan-pelan tiap siklus aja.
const MAX_RETRY_PER_CYCLE = 15;

let cycleSeq = 0;
let skippedTicks = 0; // tick yang di-skip guard isRunning sejak siklus terakhir
let outageSince = null; // epoch ms mulai gagal total kirim ke Master (in-memory)

async function syncCycle() {
  const startedAt = Date.now();
  const cycleId = ++cycleSeq;
  const skipped = skippedTicks;
  skippedTicks = 0;

  let queue = dedupeByType(loadQueue());

  // 1) Collect data lokal (sekuensial, lihat catatan SEND_CONCURRENCY).
  const { payloads, failed, slow } = await collectPayloads();
  const collectMs = Date.now() - startedAt;
  failed.slice(0, MAX_ERR_LINES_PER_CYCLE).forEach((f) =>
    plog.warn("COLLECT_FAIL", { cycle: cycleId, type: f.type, msg: f.detail }),
  );

  // Data baru MENGGANTIKAN backlog untuk type yang sama — gak perlu kirim
  // snapshot basi kalau snapshot segar buat type itu udah ada. Backlog yang
  // tersisa cuma type yang gak di-collect lagi (mis. hari/bulan kemarin).
  const freshTypes = new Set(payloads.map((p) => p.type));
  queue = queue.filter((q) => !freshTypes.has(q.type));

  // 2) Retry backlog: MAX_RETRY_PER_CYCLE item terlama, sisanya nunggu
  // siklus berikutnya (kuras pelan-pelan, jangan nabrak limiter Master).
  const toRetry = queue.slice(0, MAX_RETRY_PER_CYCLE);
  const rest = queue.slice(MAX_RETRY_PER_CYCLE);
  const stillFailed = [];
  let backlogSent = 0;
  await runPool(toRetry, SEND_CONCURRENCY, async (item) => {
    try {
      await sendToMaster(item);
      backlogSent++;
    } catch (_) {
      stillFailed.push(item);
    }
  });

  // 3) Kirim data terbaru (paralel terbatas).
  const sendStart = Date.now();
  const errCounts = {};
  const failedItems = [];
  let sentOk = 0;
  let errLogged = 0;
  await runPool(payloads, SEND_CONCURRENCY, async (item) => {
    try {
      await sendToMaster(item);
      sentOk++;
    } catch (err) {
      failedItems.push(item);
      const { key, message } = describeError(err);
      errCounts[key] = (errCounts[key] || 0) + 1;
      if (errLogged < MAX_ERR_LINES_PER_CYCLE) {
        errLogged++;
        plog.warn("SEND_FAIL", { cycle: cycleId, type: item.type, err: key, msg: message });
        console.error(`PUSHSYNC GAGAL (${item.type}), masuk antrian: ${key} ${message}`);
      }
    }
  });
  const sendMs = Date.now() - sendStart;
  const sendFailed = failedItems.length;

  queue = [...stillFailed, ...rest, ...failedItems];
  saveQueue(queue);

  // 4) Deteksi mulai/selesai outage (gagal TOTAL kirim ke Master).
  const allFailed = payloads.length > 0 && sentOk === 0 && backlogSent === 0;
  if (allFailed && outageSince === null) {
    outageSince = startedAt;
    plog.error("OUTAGE_START", { cycle: cycleId, errs: formatErrCounts(errCounts), master: MASTER_URL });
  } else if (sentOk > 0 && outageSince !== null) {
    const downMs = startedAt - outageSince;
    plog.info("OUTAGE_END", { cycle: cycleId, down: plog.fmtDuration(downMs), down_ms: downMs });
    outageSince = null;
  }

  // 5) Ringkasan 1 baris per siklus — ini bahan utama analisa harian.
  const totalMs = Date.now() - startedAt;
  const hasProblem = sendFailed > 0 || failed.length > 0 || skipped > 0;
  plog[hasProblem ? "warn" : "info"]("CYCLE", {
    id: cycleId,
    ms: totalMs,
    collect_ms: collectMs,
    send_ms: sendMs,
    collected: payloads.length,
    collect_fail: failed.length,
    sent_ok: sentOk,
    send_fail: sendFailed,
    backlog_sent: backlogSent,
    queue: queue.length,
    skipped_before: skipped,
    errs: formatErrCounts(errCounts),
    slow: slow.length
      ? slow
          .sort((x, y) => y.ms - x.ms)
          .slice(0, 3)
          .map((j) => `${j.type}:${j.ms}`)
          .join("|")
      : "-",
  });
  const summary = `PUSHSYNC cycle #${cycleId}: ${sentOk}/${payloads.length} terkirim, ${sendFailed} gagal, antrian ${queue.length}, ${(totalMs / 1000).toFixed(1)}s`;
  (hasProblem ? console.warn : console.log)(summary);
}

function start() {
  if (!MASTER_URL || !SYNC_KEY) {
    console.log(
      "ℹ️  PUSH_MASTER_URL/PUSH_SYNC_KEY belum diisi — push-sync service tidak dijalankan.",
    );
    return;
  }
  if (!SOURCE_NAME || SOURCE_NAME === "internal") {
    console.log(
      "ℹ️  Push-sync cuma untuk instance SGP/Systech, bukan Internal — service tidak dijalankan.",
    );
    return;
  }

  console.log(
    `🔄 Push-sync service AKTIF — kirim data ke ${MASTER_URL} tiap ${INTERVAL_MS / 1000}s (source=${SOURCE_NAME})`,
  );
  plog.info("START", {
    source: SOURCE_NAME,
    master: MASTER_URL,
    interval_ms: INTERVAL_MS,
    timeout_ms: REQUEST_TIMEOUT_MS,
    concurrency: SEND_CONCURRENCY,
    lines: getAllLines().length,
  });

  // Guard anti-tabrakan: tanpa ini, kalau 1 siklus lebih lambat dari
  // INTERVAL_MS (DB berat/network lag), siklus baru numpuk DI ATAS yang
  // lama — makin banyak siklus jalan bareng → makin lambat → makin
  // numpuk lagi (spiral, gak balik normal sampai proses di-restart).
  // Dengan guard ini, siklus baru cuma di-skip (log doang) kalau yang
  // lama masih jalan. Siklus PERTAMA juga lewat guard + try/catch yang
  // sama (sebelumnya dipanggil telanjang: error-nya jadi unhandled
  // rejection dan gak ikut ke-guard).
  let isRunning = false;
  let runningSince = 0;
  let skippedCount = 0;

  const runCycle = async () => {
    if (isRunning) {
      skippedCount++;
      skippedTicks++;
      const runningFor = Date.now() - runningSince;
      console.warn(
        `PUSHSYNC ⚠️  Siklus sebelumnya masih jalan (${Math.round(runningFor / 1000)}s, interval ${INTERVAL_MS / 1000}s) — siklus ini di-skip (total skip: ${skippedCount}). Kalau ini sering muncul, INTERVAL_MS mungkin perlu dinaikin atau jumlah job/line perlu dikurangin per-siklus.`,
      );
      plog.warn("CYCLE_SKIP", { running_for_ms: runningFor, total_skipped: skippedCount });
      return;
    }
    isRunning = true;
    runningSince = Date.now();
    try {
      await syncCycle();
    } catch (err) {
      console.error("PUSHSYNC syncCycle error gak ketangkep:", err.message);
      plog.error("CYCLE_CRASH", { msg: err.message });
    } finally {
      isRunning = false;
    }
  };

  runCycle(); // jalan sekali langsung pas start
  setInterval(runCycle, INTERVAL_MS);
}

module.exports = {
  start,
  // Diekspos khusus buat scripts/backfillPush.js:
  sendToMaster,
  collectDayPayload,
  collectMonthPayloads,
  MASTER_URL,
  SYNC_KEY,
  SOURCE_NAME,
};