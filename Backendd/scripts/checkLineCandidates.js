// Cek distinct value dari beberapa kolom KANDIDAT "line_code" — bandingin
// cardinality & pola isinya, biar ketauan mana yang paling masuk akal jadi
// line_code (biasanya: puluhan nilai unik, stabil, kayak kode/nama line —
// BUKAN part number yang berubah-ubah per submission).
//
// Jalanin: node scripts/checkLineCandidates.js
// Edit CANDIDATES di bawah kalau mau nambah/kurang kolom yang dicek.

const pool = require("../db");
const { VIEW } = require("../config/reportColumns");

const CANDIDATES = [
  "cluster_1_56_t",
  "cluster_1_7_t",
  "cluster_1_8_t",
  "cluster_1_17_t", // yang lama, buat pembanding (harusnya kosong/dikit)
];

(async () => {
  try {
    for (const col of CANDIDATES) {
      const res = await pool.query(
        `SELECT ${col} AS val, COUNT(*) AS jumlah
         FROM ${VIEW}
         WHERE ${col} IS NOT NULL AND TRIM(${col}::text) <> ''
         GROUP BY ${col}
         ORDER BY jumlah DESC
         LIMIT 15`,
      );
      console.log(`\n=== ${col} — ${res.rows.length} nilai unik (top 15) ===`);
      console.table(res.rows);
    }
  } catch (err) {
    console.error("ERROR:", err.message);
  } finally {
    process.exit();
  }
})();