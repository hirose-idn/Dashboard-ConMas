// Tanggung jawab: SSoT nama view + mapping kolom `cluster_1_<row>_<type>`
// yang dipakai dashboard PCB (semua line pakai view yang sama, dibedain
// lewat kolom Line). Diextract dari routes/dashboard.js supaya bisa dipakai
// bareng sama routes/api-external.js tanpa duplikasi.

// VIEW name beda per instance (Internal/SGP/Systech) — WAJIB di-set lewat
// DB_VIEW_NAME di .env instance masing-masing. Fallback di bawah cuma buat
// jaga-jaga instance lama yang belum sempat di-set (= Internal).
const VIEW = process.env.DB_VIEW_NAME || "view_report_25415";

const COLS = {
  line: "cluster_1_17_t",
  cell_leader: "cluster_1_30_t",
  teknisi: "cluster_1_43_t",
  inspector: "cluster_1_55_t",
  tanggal: "cluster_1_44_d",
  shift: "cluster_1_68_t",

  reject_ppm: "cluster_1_113_n",
  output_plan: "cluster_1_2913_n",
  output_actual: "cluster_1_2914_n",
  deviasi_target: "cluster_1_2915_n",
  qty_reject: "cluster_1_2917_n",
  stoptime_plan: "cluster_1_2918_n", // "jam plan"
  stoptime_actual: "cluster_1_2919_n", // "jam actual"

  // 4M — row asli udah dikonfirmasi
  stoptime_man: "cluster_1_2797_n",
  stoptime_method: "cluster_1_2820_n",
  stoptime_material: "cluster_1_2843_n",
  stoptime_machine: "cluster_1_2866_n",
  oee: "cluster_1_85_n",
};

module.exports = { VIEW, COLS };
