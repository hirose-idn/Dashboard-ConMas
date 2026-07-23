// Bikin skema push-sync di DB TERPISAH (SYNC_DB_*, bukan DB ConMas).
// Jalanin sekali di server Hirose (Master) SETELAH bikin database baru:
//
//   createdb subcont_sync_db          (atau CREATE DATABASE lewat psql)
//   isi SYNC_DB_* di .env Master
//   node scripts/initSyncDb.js
//
// Aman dijalanin berkali-kali (pakai IF NOT EXISTS).

const { pool, configured } = require("../db-sync");

if (!configured) {
  console.error(
    "❌ SYNC_DB_* belum diisi di .env. Isi dulu SYNC_DB_HOST/PORT/NAME/USER/PASSWORD sebelum jalanin script ini.",
  );
  process.exit(1);
}

const SQL = `
-- Snapshot data TERBARU per (source, type) — ini yang dibaca live sama
-- Master pas Tailscale/tunnel lagi putus (lihat services/pushStore.js).
CREATE TABLE IF NOT EXISTS subcont_push_latest (
  source            VARCHAR(50) NOT NULL,
  type              VARCHAR(50) NOT NULL,   -- 'summary' | 'monthly-trend' | 'range-trend' | 'monthly-summary'
  payload_timestamp TIMESTAMPTZ NOT NULL,   -- timestamp dari sisi pengirim (SGP/Systech)
  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data              JSONB NOT NULL,
  PRIMARY KEY (source, type)
);

-- History lengkap tiap push masuk — buat audit/debug, bukan dibaca live.
CREATE TABLE IF NOT EXISTS subcont_push_log (
  id                SERIAL PRIMARY KEY,
  source            VARCHAR(50) NOT NULL,
  type              VARCHAR(50) NOT NULL,
  payload_timestamp TIMESTAMPTZ NOT NULL,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status            VARCHAR(20) NOT NULL DEFAULT 'ok',   -- 'ok' | 'rejected'
  reject_reason     TEXT,
  data              JSONB
);

CREATE INDEX IF NOT EXISTS idx_push_log_source_time
  ON subcont_push_log (source, received_at DESC);

-- Auto-cleanup: log lebih dari 30 hari dihapus manual lewat cron/psql kalau
-- perlu nanti — sengaja gak dibikin otomatis dulu di sini biar simpel.
`;

(async () => {
  try {
    await pool.query(SQL);
    console.log("✅ Skema push-sync siap di SYNC DB:");
    console.log("   - subcont_push_latest");
    console.log("   - subcont_push_log");
    process.exit(0);
  } catch (err) {
    console.error("❌ Gagal bikin skema push-sync:", err.message);
    process.exit(1);
  }
})();
