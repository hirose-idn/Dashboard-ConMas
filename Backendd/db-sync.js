// Tanggung jawab: koneksi DB TERPISAH khusus buat data push-sync
// (subcont_push_latest, subcont_push_log). SENGAJA dipisah dari db.js
// (yang connect ke DB ConMas berlisensi) — kita gak mau nambah tabel
// apapun di skema ConMas, sama prinsipnya kayak data/lines.json yang
// juga sengaja disimpan di luar DB vendor.
//
// Kalau SYNC_DB_* belum diisi di .env, semua fungsi di services/pushStore.js
// otomatis no-op (lihat pushStore.js) — instance tetap jalan normal tanpa
// fitur push-sync, gak ada yang crash.

const { Pool } = require("pg");
require("dotenv").config();

const configured = Boolean(
  process.env.SYNC_DB_HOST &&
    process.env.SYNC_DB_NAME &&
    process.env.SYNC_DB_USER,
);

let pool = null;

if (configured) {
  pool = new Pool({
    host: process.env.SYNC_DB_HOST,
    port: process.env.SYNC_DB_PORT || 5432,
    database: process.env.SYNC_DB_NAME,
    user: process.env.SYNC_DB_USER,
    password: process.env.SYNC_DB_PASSWORD,
  });

  pool.connect((err, client, release) => {
    if (err) {
      console.error("❌ Gagal konek ke SYNC DB (push-sync):", err.message);
    } else {
      console.log("✅ Berhasil konek ke SYNC DB (push-sync, DB terpisah dari ConMas)");
      release();
    }
  });
} else {
  console.log(
    "ℹ️  SYNC_DB_* belum diisi di .env — fitur push-sync nonaktif (instance tetap jalan normal).",
  );
}

module.exports = { pool, configured };
