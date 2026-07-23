// Tanggung jawab: SSoT daftar source yang ditarik Master Dashboard.
// "internal" itu spesial — data lokal (langsung dari services/summaryService,
// TANPA HTTP), sisanya (sgp, systech) ditarik via HTTP ke endpoint
// /api/external/summary masing-masing (lihat services/sourceClient.js).
//
// Nambah subcont baru = tambah 1 entry di sini + isi env-nya. Ga perlu
// ubah routes/master.js sama sekali.

const SOURCES = {
  internal: {
    label: "Hirose Internal",
    type: "local",
  },
  sgp: {
    label: "Subcont SGP",
    type: "http",
    // Contoh: https://api-sgp.namadomain-lu.com/api/external
    baseUrl: process.env.SGP_API_URL || "",
    apiKey: process.env.SGP_API_KEY || "",
    // active dihitung otomatis — kalau env belum diisi, source ini
    // otomatis "off" (di-stub), gak perlu ubah kode pas kredensial belum ada.
    get active() {
      return Boolean(this.baseUrl && this.apiKey);
    },
  },
  systech: {
    label: "Subcont Systech",
    type: "http",
    baseUrl: process.env.SYSTECH_API_URL || "",
    apiKey: process.env.SYSTECH_API_KEY || "",
    get active() {
      return Boolean(this.baseUrl && this.apiKey);
    },
  },
};

module.exports = { SOURCES };
