// Tanggung jawab: jalan di instance SGP/Systech (BUKAN di Internal/Master).
// Tiap interval, ambil data LOKAL (fungsi yang sama persis dipakai
// routes/api-external.js buat jawab pull dari Master) dan POST ke
// endpoint /api/sync di Master — via Cloudflare Tunnel, outbound doang,
// gak butuh Tailscale/VPN/port terbuka sama sekali di sisi SGP/Systech.
//
// Ini FALLBACK buat arsitektur pull yang sudah ada — kalau Tailscale/
// tunnel Master lagi putus dan Master gagal PULL dari sini, Master masih
// bisa pakai data terakhir yang kepush lewat sini (lihat sourceClient.js
// tryPushFallback()). Pull tetap jalur utama; ini cuma jaring pengaman.
//
// Gagal kirim? Antrian sederhana di file lokal (sync-push-queue.json)
// biar data gak hilang kalau internet/tunnel Master lagi bermasalah,
// nanti di-retry otomatis di siklus berikutnya.
//
// Aktif HANYA kalau PUSH_MASTER_URL & PUSH_SYNC_KEY diisi di .env
// instance ini — kalau kosong, service ini gak start sama sekali
// (lihat index.js).

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

const SOURCE_NAME = process.env.SOURCE_NAME; // 'sgp' | 'systech'
const MASTER_URL = process.env.PUSH_MASTER_URL; // https://<domain-atau-tunnel>/api/sync
const SYNC_KEY = process.env.PUSH_SYNC_KEY;
const INTERVAL_MS = Number(process.env.PUSH_INTERVAL_MS) || 60 * 1000; // default 1 menit
const REQUEST_TIMEOUT_MS = 10 * 1000;

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

function saveQueue(queue) {
  try {
    // Batasi antrian biar file gak membengkak tanpa batas kalau Master
    // down berhari-hari — simpan 500 item terbaru aja.
    const trimmed = queue.slice(-500);
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(trimmed, null, 2));
  } catch (err) {
    console.error("PUSHSYNC/saveQueue gagal tulis file:", err.message);
  }
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

// Kumpulin data yang mau di-push siklus ini. Ditambah try/catch per-jenis
// biar 1 query gagal (mis. getLocalMonthlySummary lagi lambat) gak bikin
// jenis data lain ikut gak ke-push.
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
  for (const job of jobs) {
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
      console.error(`PUSHSYNC/collect (${job.type}) gagal:`, detail);
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

async function syncCycle() {
  let queue = loadQueue();

  // 1) Coba kosongin antrian lama dulu (retry backlog dari siklus
  // sebelumnya) — MAX_RETRY_PER_CYCLE item terlama duluan (FIFO), sisanya
  // nunggu siklus berikutnya.
  if (queue.length > 0) {
    const toRetry = queue.slice(0, MAX_RETRY_PER_CYCLE);
    const rest = queue.slice(MAX_RETRY_PER_CYCLE);
    const stillFailed = [];
    for (const item of toRetry) {
      try {
        await sendToMaster(item);
      } catch (_) {
        stillFailed.push(item);
      }
    }
    const sentCount = toRetry.length - stillFailed.length;
    if (sentCount > 0) {
      console.log(`PUSHSYNC: ${sentCount} item backlog berhasil dikirim ulang`);
    }
    queue = [...stillFailed, ...rest];
  }

  // 2) Ambil & kirim data terbaru
  const payloads = await collectPayloads();
  for (const item of payloads) {
    try {
      await sendToMaster(item);
      console.log(`PUSHSYNC OK: ${item.type} @ ${item.timestamp}`);
    } catch (err) {
      console.error(`PUSHSYNC GAGAL (${item.type}), masuk antrian:`, err.message);
      queue.push(item);
    }
  }

  saveQueue(queue);
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
  syncCycle(); // jalan sekali langsung pas start
  setInterval(syncCycle, INTERVAL_MS);
}

module.exports = { start };