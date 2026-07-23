// Dump SEMUA kolom cluster_1_* dari view target (raw, apa adanya) buat
// 2-3 row terbaru — biar bisa dicocokin manual kolom mana yang isinya
// line_code, cell_leader, shift, dst (soalnya cluster ID beda per form/
// report ID ConMas, walau template form-nya keliatan sama).
//
// Jalanin: node scripts/dumpColumns.js
//
// Kalau mau ganti view yang di-dump (bukan yang lagi kepasang di
// reportColumns.js), ubah TARGET_VIEW di bawah manual.

const pool = require("../db");
const { VIEW } = require("../config/reportColumns");

const TARGET_VIEW = VIEW; // ganti manual kalau perlu, misal "view_report_1677"

(async () => {
  try {
    // Ambil daftar kolom dulu (biar tau semua nama cluster_1_X_type yang ada)
    const colsRes = await pool.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_name = $1
       ORDER BY column_name`,
      [TARGET_VIEW],
    );
    console.log(`Total kolom di ${TARGET_VIEW}:`, colsRes.rows.length);

    // Ambil 3 row terbaru berdasarkan kolom tanggal yang UDAH kekonfirmasi
    // bener (cluster_1_44_d, dari hasil checkView.js sebelumnya)
    const dataRes = await pool.query(
      `SELECT * FROM ${TARGET_VIEW}
       ORDER BY cluster_1_44_d DESC NULLS LAST
       LIMIT 3`,
    );

    if (dataRes.rows.length === 0) {
      console.log("Gak ada row ke-ambil.");
      process.exit(0);
    }

    // Print per kolom biar gampang di-scan (bukan console.table yang
    // kepotong lebar kalau kolomnya ratusan)
    for (const col of colsRes.rows) {
      const name = col.column_name;
      if (!name.startsWith("cluster_1_")) continue; // skip metadata non-bisnis
      const values = dataRes.rows.map((r) => r[name]);
      const allNull = values.every((v) => v === null || v === "");
      if (allNull) continue; // skip kolom kosong semua, biar output gak kepanjangan
      console.log(`${name.padEnd(20)} :`, JSON.stringify(values));
    }

    console.log(
      "\n(Kolom yang SEMUA nilainya null/kosong di 3 row ini di-skip biar ringkes." +
        " Kalau field yang lu cari malah gak nongol, hapus filter allNull di script ini.)",
    );
  } catch (err) {
    console.error("ERROR:", err.message);
  } finally {
    process.exit();
  }
})();