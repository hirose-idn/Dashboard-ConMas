// Jalan di instance Internal/MASTER saja. Ngecek berkala: tiap source
// (sgp/systech) masih nge-push gak? Kalau diam > ambang, catat di log
// harian + (opsional) kirim notif Telegram — jadi outage gak baru ketauan
// berhari-hari kemudian dari warning "Gap push" (yang cuma muncul SETELAH
// pengirim nyambung lagi). Kalau pulih, dicatat juga + durasi downtime.
//
// Yang dicek level SOURCE (push terbaru dari source itu, type apa pun),
// bukan per-type: type yang di-key per hari/bulan memang wajar berhenti
// di-push pas ganti hari/bulan. Gap per-type tetap tercatat event "GAP"
// di pushStore.js dan baris CYCLE di sisi pengirim.
//
// Env (semua opsional):
//   PUSH_WATCHDOG_SOURCES     default "sgp,systech" (isi yang MEMANG dipakai)
//   PUSH_WATCHDOG_INTERVAL_MS default 60000
//   PUSH_WATCHDOG_STALE_MS    default 300000 (5 menit tanpa push = stale)
//   PUSH_WATCHDOG_REMIND_MS   default 1800000 (ingetin tiap 30 menit)
//   PUSH_ALERT_TELEGRAM_BOT_TOKEN / PUSH_ALERT_TELEGRAM_CHAT_ID  notif (kosong = log doang)
//   PUSH_ALERT_LABEL          prefix pesan notif

const axios = require("axios");
const { pool, configured } = require("../db-sync");
const plog = require("../utils/dailyLogger");

const SOURCES = (process.env.PUSH_WATCHDOG_SOURCES || "sgp,systech")
  .split(",")
  .map((x) => x.trim().toLowerCase())
  .filter(Boolean);
const CHECK_MS = Number(process.env.PUSH_WATCHDOG_INTERVAL_MS) || 60 * 1000;
const STALE_MS = Number(process.env.PUSH_WATCHDOG_STALE_MS) || 5 * 60 * 1000;
const REMIND_MS = Number(process.env.PUSH_WATCHDOG_REMIND_MS) || 30 * 60 * 1000;
const TG_TOKEN = process.env.PUSH_ALERT_TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.PUSH_ALERT_TELEGRAM_CHAT_ID;
const LABEL = process.env.PUSH_ALERT_LABEL || "Dashboard-ConMas Master";

// source -> { staleSince: epoch ms (waktu push TERAKHIR) | null, lastRemind }
const state = new Map();
let dbErrorLogged = false;

async function notify(text) {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    await axios.post(
      `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,
      { chat_id: TG_CHAT, text: `[${LABEL}] ${text}` },
      { timeout: 10000 },
    );
  } catch (err) {
    // Jangan sebut URL (ada token di dalamnya) — cukup pesan error-nya.
    plog.warn("ALERT_SEND_FAIL", { msg: err.response?.status ? `http${err.response.status}` : err.code || err.message });
  }
}

async function check() {
  let lastBySource;
  try {
    const res = await pool.query(
      `SELECT source, MAX(received_at) AS last_at
       FROM subcont_push_latest
       WHERE source = ANY($1)
       GROUP BY source`,
      [SOURCES],
    );
    lastBySource = new Map(res.rows.map((r) => [r.source, new Date(r.last_at).getTime()]));
    dbErrorLogged = false;
  } catch (err) {
    if (!dbErrorLogged) {
      dbErrorLogged = true;
      plog.error("WATCHDOG_DB_ERROR", { msg: err.message });
    }
    return;
  }

  const now = Date.now();
  for (const source of SOURCES) {
    const lastAt = lastBySource.get(source); // undefined = belum pernah push
    const ageMs = lastAt ? now - lastAt : Infinity;
    const st = state.get(source) || { staleSince: null, lastRemind: 0 };

    if (ageMs > STALE_MS) {
      const lastIso = lastAt ? new Date(lastAt).toISOString() : "never";
      if (st.staleSince === null) {
        st.staleSince = lastAt || now;
        st.lastRemind = now;
        plog.error("SENDER_STALE", { source, last_push: lastIso, silent_for: plog.fmtDuration(ageMs) });
        console.error(`🚨 Push dari ${source} berhenti (terakhir: ${lastIso}).`);
        await notify(`🚨 Push dari "${source}" berhenti. Terakhir masuk: ${lastIso}. Cek tunnel/PUSH_MASTER_URL & pm2 di server ${source}.`);
      } else if (now - st.lastRemind >= REMIND_MS) {
        st.lastRemind = now;
        plog.error("SENDER_STILL_STALE", { source, last_push: lastIso, silent_for: plog.fmtDuration(ageMs) });
        await notify(`🚨 "${source}" MASIH belum push (diam ${plog.fmtDuration(ageMs)}). Terakhir: ${lastIso}.`);
      }
    } else if (st.staleSince !== null) {
      const downMs = now - st.staleSince;
      plog.info("SENDER_RECOVERED", { source, down: plog.fmtDuration(downMs), down_ms: downMs });
      console.log(`✅ Push dari ${source} pulih (mati ~${plog.fmtDuration(downMs)}).`);
      await notify(`✅ Push dari "${source}" pulih. Mati ~${plog.fmtDuration(downMs)}.`);
      st.staleSince = null;
    }
    state.set(source, st);
  }
}

function start() {
  if (!configured) return; // sync DB gak ada -> gak ada yang dipantau
  console.log(
    `🐕 Push watchdog AKTIF — pantau [${SOURCES.join(", ")}], stale > ${plog.fmtDuration(STALE_MS)}, notif Telegram: ${TG_TOKEN && TG_CHAT ? "ON" : "off (log doang)"}`,
  );
  plog.info("WATCHDOG_START", { sources: SOURCES.join(","), stale_ms: STALE_MS, telegram: Boolean(TG_TOKEN && TG_CHAT) });
  // Cek pertama ditunda 1,5x interval: abis Master restart, kasih waktu
  // pengirim buat push dulu sebelum dianggap stale.
  setTimeout(() => {
    const run = () => check().catch((err) => plog.error("WATCHDOG_CRASH", { msg: err.message }));
    run();
    setInterval(run, CHECK_MS);
  }, CHECK_MS * 1.5);
}

module.exports = { start };
