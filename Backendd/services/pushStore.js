// Tanggung jawab: baca/tulis data push-sync di DB TERPISAH (db-sync.js).
// Dipakai oleh:
//  - routes/sync.js       → savePush() pas nerima POST dari SGP/Systech
//  - services/sourceClient.js → getLatestPush() buat FALLBACK pas pull
//                                HTTP normal timeout/unreachable (mis.
//                                Tailscale/tunnel lagi putus)
//
// Kalau SYNC_DB_* belum dikonfigurasi (db-sync.js `configured === false`),
// semua fungsi di sini no-op / balikin null — instance tetap jalan normal
// persis kayak sebelum fitur ini ada.

const { pool, configured } = require("../db-sync");
const plog = require("../utils/dailyLogger");

// Threshold buat nge-log WARNING kalau jarak antar push sukses (source+type
// sama) ngelewatin ambang ini — persis threshold yang bikin status di
// dashboard Master flip ke "Belum Dikonfigurasi". Sama env var kayak
// PUSH_FALLBACK_MAX_AGE_MS di sourceClient.js (1 sumber kebenaran).
// Cek riwayat: `pm2 logs <master> | grep "Gap push"`.
const GAP_WARN_MS = Number(process.env.PUSH_FALLBACK_MAX_AGE_MS) || 5 * 60 * 1000;

// Warning gap di console cukup SEKALI per source per menit — pas pengirim
// nyambung lagi abis outage, semua type (~85/source) kena gap barengan dan
// bikin pm2 logs banjir. Detail LENGKAP per-type tetap masuk logs/push-*.log.
function warnGapConsole(source, type, gapMs) {
  const suppressed = plog.throttle(`gap-console:${source}`, 60 * 1000);
  if (suppressed === null) return;
  console.warn(
    `⚠️  Gap push terdeteksi: ${source}/${type} — ${plog.fmtDuration(gapMs)} (${gapMs}ms, ambang: ${GAP_WARN_MS}ms). ` +
      `Status dashboard buat type ini sempat/bakal kelihatan "Belum Dikonfigurasi" di jendela ini. ` +
      `${suppressed > 0 ? `(+${suppressed} type lain di-skip dari console) ` : ""}` +
      `Detail lengkap: ${plog.LOG_DIR}`,
  );
}

async function savePush(source, type, payloadTimestamp, data) {
  if (!configured) return { ok: false, reason: "SYNC_DB belum dikonfigurasi" };

  // Stringify EKSPLISIT — jangan andelin auto-serialize node-pg buat
  // parameter object/array ke kolom json/jsonb. Ini yang bikin
  // "dashboard-summary-all" dkk gagal ("invalid input syntax for type
  // json") padahal type lain (summary, dashboard-monthly-summary) lolos:
  // node-pg auto-stringify itu gak konsisten/gak bisa diandelin buat
  // SEMUA bentuk data (array besar vs object tunggal) — paksa jadi string
  // JSON valid sendiri di sini, baru dikirim ke query, biar independen
  // dari behavior driver.
  let jsonData;
  try {
    jsonData = JSON.stringify(data ?? null);
  } catch (err) {
    return { ok: false, reason: `Gagal serialize data ke JSON: ${err.message}` };
  }

  let client;
  try {
    // pool.connect() DIPINDAH ke dalam try — sebelumnya di luar, jadi
    // kalau connection pool sync-DB penuh/timeout (makin gampang kejadian
    // sejak payload dashboard-* jauh lebih gede dari summary/monthly-trend
    // biasa), exception-nya LOLOS dari try/catch ini DAN gak ketangkep di
    // routes/sync.js juga -> uncaught rejection, bukan response 500 yang
    // rapi (di Express 4, ini bisa bikin request hang/gak konsisten).
    client = await pool.connect();
    await client.query("BEGIN");

    // Ambil received_at LAMA (kalau ada) SEBELUM di-upsert — buat hitung
    // gap. Row lock (FOR UPDATE) biar aman dari race kalau kebetulan ada
    // 2 push nyaris bareng buat source+type yang sama (jarang, tapi murah
    // buat dijamin).
    const prev = await client.query(
      `SELECT received_at FROM subcont_push_latest
       WHERE source = $1 AND type = $2 FOR UPDATE`,
      [source, type],
    );

    // GUARD payload_timestamp: snapshot yang LEBIH TUA dari yang tersimpan
    // gak boleh menimpa (mis. item antrian retry dari pengirim yang baru
    // pulih dari outage) — kalau boleh, data basi bakal kelihatan "fresh"
    // karena received_at selalu di-set NOW(), padahal isinya lama.
    // Pengecualian: kalau yang tersimpan timestamp-nya di MASA DEPAN (>5
    // menit, mis. jam server pengirim sempat ngaco), boleh ditimpa — kalau
    // nggak, semua push normal berikutnya ketolak sampai jamnya "nyusul".
    const upsert = await client.query(
      `INSERT INTO subcont_push_latest (source, type, payload_timestamp, received_at, data)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (source, type)
       DO UPDATE SET payload_timestamp = EXCLUDED.payload_timestamp,
                      received_at = NOW(),
                      data = EXCLUDED.data
       WHERE subcont_push_latest.payload_timestamp <= EXCLUDED.payload_timestamp
          OR subcont_push_latest.payload_timestamp > NOW() + INTERVAL '5 minutes'`,
      [source, type, payloadTimestamp, jsonData],
    );
    // rowCount 0 = konflik ketemu tapi WHERE false -> push ini basi, diabaikan.
    const applied = upsert.rowCount > 0;

    // Push basi tetap dicatat di log (audit) tapi TANPA payload data biar
    // tabel gak bengkak; status 'stale' (kolom VARCHAR(20), gak perlu migrasi).
    await client.query(
      `INSERT INTO subcont_push_log (source, type, payload_timestamp, status, data)
       VALUES ($1, $2, $3, $4, $5)`,
      [source, type, payloadTimestamp, applied ? "ok" : "stale", applied ? jsonData : null],
    );

    await client.query("COMMIT");

    if (!applied) {
      plog.warn("PUSH_STALE_IGNORED", { source, type, payload_ts: payloadTimestamp });
      // Return ok biar pengirim anggap terkirim & buang dari antriannya —
      // kalau dibalas error, dia retry terus selamanya.
      return { ok: true, stale: true };
    }

    if (prev.rows.length > 0) {
      const gapMs = Date.now() - new Date(prev.rows[0].received_at).getTime();
      if (gapMs > GAP_WARN_MS) {
        plog.warn("GAP", {
          source,
          type,
          gap: plog.fmtDuration(gapMs),
          gap_ms: gapMs,
          threshold_ms: GAP_WARN_MS,
        });
        warnGapConsole(source, type, gapMs);
      }
    }

    return { ok: true };
  } catch (err) {
    // client mungkin masih undefined kalau yang gagal itu pool.connect()
    // sendiri (belum sempet dapet client) — ROLLBACK cuma valid kalau
    // udah ada transaksi jalan.
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {
        // Rollback gagal juga jangan sampai nutupin error aslinya.
      }
    }
    return { ok: false, reason: err.message };
  } finally {
    if (client) client.release();
  }
}

async function logRejected(source, type, reason) {
  // Throttle: key salah/spam gak boleh banjirin file log.
  const suppressed = plog.throttle(`reject:${source}:${reason}`, 60 * 1000);
  if (suppressed !== null) {
    plog.warn("PUSH_REJECTED", { source: source || "unknown", type: type || "unknown", reason, suppressed });
  }
  if (!configured) return;
  try {
    await pool.query(
      `INSERT INTO subcont_push_log (source, type, payload_timestamp, status, reject_reason)
       VALUES ($1, $2, NOW(), 'rejected', $3)`,
      [source || "unknown", type || "unknown", reason],
    );
  } catch (_) {
    // Logging gagal jangan sampai ganggu response ke pengirim — diamkan.
  }
}

// maxAgeMs: seberapa "basi" data pushed masih boleh dipakai sebagai
// fallback. Default 5 menit — cukup longgar buat interval push tiap 1
// menit (lihat services/pushSyncService.js) tapi tetap nolak data yang
// udah jelas basi (mis. sync service SGP/Systech ikutan down berjam-jam).
async function getLatestPush(source, type, maxAgeMs = 5 * 60 * 1000) {
  if (!configured) return null;
  try {
    const res = await pool.query(
      `SELECT payload_timestamp, received_at, data
       FROM subcont_push_latest
       WHERE source = $1 AND type = $2`,
      [source, type],
    );
    if (res.rows.length === 0) return null;

    const row = res.rows[0];
    const ageMs = Date.now() - new Date(row.received_at).getTime();
    if (ageMs > maxAgeMs) return null; // ada tapi udah terlalu basi

    return {
      data: row.data,
      payload_timestamp: row.payload_timestamp,
      received_at: row.received_at,
      age_ms: ageMs,
    };
  } catch (err) {
    console.error("PUSHSTORE/getLatestPush ERROR:", err.message);
    return null;
  }
}

// Sama kayak getLatestPush, tapi type-nya dicari pakai PREFIX — dipakai
// buat /api/sync/status nampilin push "monthly-summary-*" (type-nya
// sekarang per-bulan, jadi gak ada 1 nama pasti buat di-loop kayak type
// lain, lihat routes/sync.js).
async function getLatestPushByPrefix(source, typePrefix, maxAgeMs = 5 * 60 * 1000) {
  if (!configured) return null;
  try {
    const res = await pool.query(
      `SELECT type, payload_timestamp, received_at, data
       FROM subcont_push_latest
       WHERE source = $1 AND type LIKE $2
       ORDER BY received_at DESC
       LIMIT 1`,
      [source, `${typePrefix}%`],
    );
    if (res.rows.length === 0) return null;

    const row = res.rows[0];
    const ageMs = Date.now() - new Date(row.received_at).getTime();
    if (ageMs > maxAgeMs) return null;

    return {
      type: row.type,
      data: row.data,
      payload_timestamp: row.payload_timestamp,
      received_at: row.received_at,
      age_ms: ageMs,
    };
  } catch (err) {
    console.error("PUSHSTORE/getLatestPushByPrefix ERROR:", err.message);
    return null;
  }
}

module.exports = { savePush, logRejected, getLatestPush, getLatestPushByPrefix };