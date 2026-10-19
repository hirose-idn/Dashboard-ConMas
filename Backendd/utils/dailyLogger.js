// Log harian ke FILE TEKS BIASA (logs/push-YYYY-MM-DD.log) — bisa dibuka
// langsung pakai Notepad, atau di-grep. Dipakai sisi pengirim
// (services/pushSyncService.js) DAN sisi Master (services/pushStore.js,
// routes/sync.js, services/pushWatchdog.js), file-nya terpisah per server
// karena tiap instance punya folder logs/ sendiri.
//
// Sengaja BUKAN pengganti console.log/pm2: pm2 tetap jalan, ini tambahan
// yang ringkas + terstruktur (key=value) biar gampang dianalisa per hari.
// Format satu baris:
//   2026-10-19 14:03:22.123 [WARN] CYCLE id=42 ms=1830 sent_ok=80 ...
// Jam pakai WIB (UTC+7), rollover file ganti hari juga ikut WIB.
//
// Env (opsional):
//   PUSH_LOG_DIR          folder log           (default: <Backendd>/logs)
//   PUSH_LOG_RETAIN_DAYS  umur file sebelum dihapus otomatis (default 30)

const fs = require("fs");
const os = require("os");
const path = require("path");

const LOG_DIR = process.env.PUSH_LOG_DIR || path.join(__dirname, "..", "logs");
const RETAIN_DAYS = Number(process.env.PUSH_LOG_RETAIN_DAYS) || 30;
const FILE_RE = /^push-(\d{4}-\d{2}-\d{2})\.log$/;
const WIB_OFFSET_MS = 7 * 3600 * 1000;
const MAX_VALUE_LEN = 300;

let dirReady = false;
let lastCleanupDay = null;
let warnedWriteFail = false;

function wibParts(ms = Date.now()) {
  const iso = new Date(ms + WIB_OFFSET_MS).toISOString(); // 2026-10-19T14:03:22.123Z
  return { day: iso.slice(0, 10), time: iso.slice(11, 23) };
}

function fmtValue(v) {
  if (v === undefined || v === null) return "-";
  let s = String(v);
  if (s.length > MAX_VALUE_LEN) s = `${s.slice(0, MAX_VALUE_LEN)}…`;
  // Kalau ada spasi/kutip/= /newline, bungkus JSON biar 1 baris tetap 1 baris
  // dan tetap bisa di-parse balik (lihat scripts/summarizeLog.js).
  return s === "" || /[\s"=]/.test(s) ? JSON.stringify(s) : s;
}

// 1100000 -> "18m20s", 1062107609 -> "12d7h"
function fmtDuration(ms) {
  if (!Number.isFinite(ms)) return "n/a";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d${h}h`;
  if (h > 0) return `${h}h${m}m`;
  if (m > 0) return `${m}m${sec}s`;
  return `${sec}s`;
}

function cleanup(todayDay) {
  if (lastCleanupDay === todayDay) return;
  lastCleanupDay = todayDay;
  try {
    const cutoff = wibParts(Date.now() - RETAIN_DAYS * 86400000).day;
    for (const f of fs.readdirSync(LOG_DIR)) {
      const m = FILE_RE.exec(f);
      if (m && m[1] < cutoff) fs.unlinkSync(path.join(LOG_DIR, f));
    }
  } catch (_) {
    // Cleanup gagal jangan ganggu apa-apa.
  }
}

function log(level, event, fields = {}) {
  const { day, time } = wibParts();
  const kv = Object.entries(fields).map(([k, v]) => `${k}=${fmtValue(v)}`);
  const line = `${day} ${time} [${level}] ${event}${kv.length ? ` ${kv.join(" ")}` : ""}${os.EOL}`;
  try {
    if (!dirReady) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      dirReady = true;
    }
    fs.appendFileSync(path.join(LOG_DIR, `push-${day}.log`), line);
    cleanup(day);
  } catch (err) {
    dirReady = false;
    // Gagal nulis file jangan PERNAH nge-crash proses / ganggu push-sync.
    if (!warnedWriteFail) {
      warnedWriteFail = true;
      console.error(`dailyLogger: gagal nulis log ke ${LOG_DIR}:`, err.message);
    }
  }
}

// Throttle sederhana per-key, buat event yang bisa meledak (mis. Master DB
// down -> tiap push gagal). Return null kalau harus di-skip; kalau boleh
// lolos, return jumlah yang ke-skip sejak terakhir lolos (0 kalau gak ada).
const throttleState = new Map();
function throttle(key, intervalMs) {
  const now = Date.now();
  const st = throttleState.get(key) || { last: 0, suppressed: 0 };
  if (now - st.last < intervalMs) {
    st.suppressed += 1;
    throttleState.set(key, st);
    return null;
  }
  const suppressed = st.suppressed;
  throttleState.set(key, { last: now, suppressed: 0 });
  return suppressed;
}

module.exports = {
  info: (event, fields) => log("INFO", event, fields),
  warn: (event, fields) => log("WARN", event, fields),
  error: (event, fields) => log("ERROR", event, fields),
  throttle,
  fmtDuration,
  LOG_DIR,
};
