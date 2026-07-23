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

async function savePush(source, type, payloadTimestamp, data) {
  if (!configured) return { ok: false, reason: "SYNC_DB belum dikonfigurasi" };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO subcont_push_latest (source, type, payload_timestamp, received_at, data)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (source, type)
       DO UPDATE SET payload_timestamp = EXCLUDED.payload_timestamp,
                      received_at = NOW(),
                      data = EXCLUDED.data`,
      [source, type, payloadTimestamp, data],
    );

    await client.query(
      `INSERT INTO subcont_push_log (source, type, payload_timestamp, status, data)
       VALUES ($1, $2, $3, 'ok', $4)`,
      [source, type, payloadTimestamp, data],
    );

    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    return { ok: false, reason: err.message };
  } finally {
    client.release();
  }
}

async function logRejected(source, type, reason) {
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

module.exports = { savePush, logRejected, getLatestPush };
