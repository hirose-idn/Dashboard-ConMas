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

// ⚠️ Bug yang SAMA PERSIS juga kena kolom `tanggal` di VIEW report, yang
// ternyata bertipe TIMESTAMP (oid 1114), BUKAN DATE (oid 1082) — fix di
// atas gak ke-cover buat kolom ini. Query SQL `DATE(tanggal) = '2026-08-28'`
// di level Postgres udah bener nemu row-nya, tapi begitu row-nya sampai ke
// JS dan kode lain nge-extract tanggal via `.toISOString().slice(0,10)`
// (dipakai berulang di routes/dashboard.js, utils/shiftResolver.js,
// services/lineBreakdownService.js, services/summaryService.js), hasilnya
// geser mundur 1 hari — gagal cocok sama tanggal yang diminta, dikira
// "gak ada data" padahal ADA.
//
// Fix sama: matiin parsing TIMESTAMP juga, balikin string mentah apa
// adanya dari Postgres ("YYYY-MM-DD HH:MM:SS"). Semua pemanggil yang
// baca row.tanggal SUDAH defensif (`row.tanggal instanceof Date ? ... :
// String(row.tanggal).slice(0,10)`) — begitu ini jadi string, otomatis
// masuk ke cabang String(...).slice(0,10) yang ambil 10 karakter pertama
// ("YYYY-MM-DD"), TANPA butuh diubah satu-satu di pemanggilnya.
types.setTypeParser(1114, (val) => val); // timestamp without time zone
types.setTypeParser(1184, (val) => val); // timestamp with time zone (jaga-jaga kalau view-nya pakai ini)

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
