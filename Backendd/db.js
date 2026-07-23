const { Pool, types } = require("pg");
require("dotenv").config();

// ⚠️ FIX BUG "tanggal geser -1 hari": secara default, driver `pg` nge-parse
// kolom bertipe DATE (oid 1082) jadi objek `Date` JavaScript memakai jam
// LOKAL SERVER Node ini (bukan UTC). Kalau server-nya di-set timezone WIB
// (UTC+7, kayak kebanyakan server di Indonesia), terus di kode lain ada
// yang manggil `.toISOString()` buat ambil balik string tanggalnya, itu
// convert-nya balik ke UTC — geser MUNDUR 7 jam, yang buat tanggal jatuh
// pas tengah malam bisa ke-baca jadi HARI SEBELUMNYA.
//
// Contoh nyata: DB simpen '2026-07-02', abis lewat pg (parse ke Date jam
// 00:00 WIB) terus .toISOString() → '2026-07-01T17:00:00.000Z' →
// ke-slice jadi "2026-07-01". Data tanggal 2 nyasar ke tanggal 1.
//
// Solusinya: matiin parsing itu SAMA SEKALI buat tipe DATE — biarin balik
// apa adanya sebagai string "YYYY-MM-DD" persis dari Postgres, gak ada
// konversi timezone yang bisa geser sama sekali.
types.setTypeParser(1082, (val) => val);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Test koneksi waktu server start
pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ Gagal konek ke PostgreSQL:", err.message);
  } else {
    console.log("✅ Berhasil konek ke PostgreSQL!");
    release();
  }
});

// Eksperimen lama "1 backend banyak tempat lewat pool berbeda" ditinggalkan
// (lihat catatan di routes/dashboard.js). Ini no-op biar kode lama yang masih
// destructure { getPoolForTempat } dari sini ga crash — selalu balikin pool
// lokal yang sama, karena tiap subcont sekarang punya instance+DB sendiri.
pool.getPoolForTempat = () => pool;

module.exports = pool;
