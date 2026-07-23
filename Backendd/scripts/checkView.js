// Cek cepat: view_report_25415 ADA gak, ada berapa row, tanggal paling
// baru berapa, dan contoh 5 line_code + tanggal terakhir. Jalanin kalau
// GET /api/lines/discover balik kosong padahal DB katanya konek — buat
// mastiin ini emang DB yang isi datanya, bukan DB kosong/salah.
//
// Jalanin: node scripts/checkView.js

const pool = require("../db");
const { VIEW, COLS } = require("../config/reportColumns");

(async () => {
  try {
    const exists = await pool.query(`SELECT to_regclass($1) AS reg`, [VIEW]);
    console.log(`View "${VIEW}" ada?`, exists.rows[0].reg ? "YA" : "TIDAK ADA");

    if (!exists.rows[0].reg) {
      console.log("→ Nama view salah, atau emang belum ke-create di DB ini.");
      process.exit(0);
    }

    const total = await pool.query(`SELECT COUNT(*) FROM ${VIEW}`);
    console.log("Total row di view:", total.rows[0].count);

    const maxDate = await pool.query(
      `SELECT MAX(${COLS.tanggal}) AS max_tanggal FROM ${VIEW}`,
    );
    console.log("Tanggal paling baru:", maxDate.rows[0].max_tanggal);

    const sample = await pool.query(
      `SELECT DISTINCT ${COLS.line} AS line_code, ${COLS.tanggal} AS tanggal
       FROM ${VIEW}
       ORDER BY ${COLS.tanggal} DESC
       LIMIT 5`,
    );
    console.log("Contoh 5 row terbaru (line_code, tanggal):");
    console.table(sample.rows);
  } catch (err) {
    console.error("ERROR:", err.message);
  } finally {
    process.exit();
  }
})();