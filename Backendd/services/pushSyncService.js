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
async function collectPayloads() {
  const timestamp = new Date().toISOString();
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  const year = wib.getUTCFullYear();
  const month = wib.getUTCMonth() + 1;

  const jobs = [
    { type: "summary", fn: () => getLocalSummary() },
    { type: "monthly-trend", fn: () => getDailyTrend(year, month) },
    // Type-nya SENGAJA ikut year-month, bukan cuma "monthly-summary"
    // statis — biar Master (sourceClient.js) cuma pake data ini sebagai
    // fallback buat BULAN YANG SAMA persis, bukan ke-apply asal ke bulan
    // lain yang diminta pas pull HTTP normal gagal.
    { type: `monthly-summary-${year}-${month}`, fn: () => getLocalMonthlySummary(year, month) },
    // "range-trend" sengaja gak dipush rutin — parameternya bebas
    // (start/end custom dari user di Master), gak pas buat cache berkala.
  ];

  const payloads = [];
  for (const job of jobs) {
    try {
      const data = await job.fn();
      payloads.push({ type: job.type, timestamp, data });
    } catch (err) {
      console.error(`PUSHSYNC/collect (${job.type}) gagal:`, err.message);
    }
  }
  return payloads;
}

async function syncCycle() {
  let queue = loadQueue();

  // 1) Coba kosongin antrian lama dulu (retry backlog dari siklus sebelumnya)
  if (queue.length > 0) {
    const stillFailed = [];
    for (const item of queue) {
      try {
        await sendToMaster(item);
      } catch (_) {
        stillFailed.push(item);
      }
    }
    queue = stillFailed;
    if (stillFailed.length < queue.length) {
      console.log(`PUSHSYNC: ${queue.length - stillFailed.length} item backlog berhasil dikirim ulang`);
    }
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