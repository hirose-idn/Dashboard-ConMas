// Tanggung jawab: endpoint PENERIMA push dari instance SGP/Systech.
// SATU-SATUNYA yang perlu di-expose ke internet lewat Cloudflare Tunnel
// di sisi Hirose — SGP/Systech POST ke sini tiap ~1 menit, dengan data
// hasil query LOKAL mereka sendiri (bentuknya sama persis kayak yang
// biasa mereka balikin di GET /api/external/summary dkk).
//
// Ini FALLBACK, bukan pengganti arsitektur pull yang udah ada
// (config/sources.js + services/sourceClient.js). Kalau pull normal
// (via Tailscale/tunnel) masih jalan, data pushed ini gak kepake —
// baru dipakai sourceClient.js pas pull-nya timeout/unreachable.
//
// Data disimpan di DB TERPISAH dari ConMas (lihat db-sync.js) — bukan
// nambah tabel di DB vendor.

const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");

const { savePush, logRejected } = require("../services/pushStore");
const { configured: syncDbConfigured } = require("../db-sync");

const VALID_SOURCES = ["sgp", "systech"];
const VALID_TYPES = [
  "summary",
  "monthly-trend",
  "range-trend",
  "monthly-summary",
];

// ── Rate limit — longgar tapi tetap ada jaga-jaga ────────────────
const syncLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60, // tiap source push beberapa jenis data tiap ~1 menit, 60/menit cukup longgar
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: "error", message: "Terlalu banyak request" },
});

// ── Auth — 1 key per source, BEDA dari EXTERNAL_API_KEY yang dipakai
// arah pull. Kalau salah satu bocor, yang lain gak ikut kebobol.
// Isi di .env Master: SYNC_KEY_SGP, SYNC_KEY_SYSTECH.
function requireSyncKey(req, res, next) {
  const source = String(req.body?.source || "").toLowerCase();
  const key = req.headers["x-sync-key"];

  if (!VALID_SOURCES.includes(source)) {
    return res
      .status(400)
      .json({ status: "error", message: `source harus salah satu dari: ${VALID_SOURCES.join(", ")}` });
  }

  const expectedKey = process.env[`SYNC_KEY_${source.toUpperCase()}`];
  if (!expectedKey) {
    console.error(
      `SYNC_KEY_${source.toUpperCase()} belum di-set di .env Master — push dari ${source} ditolak.`,
    );
    return res
      .status(503)
      .json({ status: "error", message: "Server belum dikonfigurasi buat source ini" });
  }

  if (!key || key !== expectedKey) {
    logRejected(source, req.body?.type, "sync key salah/kosong");
    return res.status(403).json({ status: "error", message: "Forbidden" });
  }

  next();
}

router.use(syncLimiter);

// ─────────────────────────────────────────────────────────────
//  POST /api/sync
//  Body: { source: "sgp"|"systech", type: "summary"|..., timestamp, data }
// ─────────────────────────────────────────────────────────────
router.post("/", requireSyncKey, async (req, res) => {
  if (!syncDbConfigured) {
    return res.status(503).json({
      status: "error",
      message: "SYNC_DB_* belum dikonfigurasi di server Master",
    });
  }

  const source = String(req.body.source).toLowerCase();
  const type = String(req.body.type || "");
  const timestamp = req.body.timestamp;
  const data = req.body.data;

  if (!VALID_TYPES.includes(type)) {
    logRejected(source, type, "type tidak dikenal");
    return res.status(400).json({
      status: "error",
      message: `type harus salah satu dari: ${VALID_TYPES.join(", ")}`,
    });
  }
  if (!timestamp || Number.isNaN(new Date(timestamp).getTime())) {
    logRejected(source, type, "timestamp tidak valid");
    return res.status(400).json({ status: "error", message: "timestamp tidak valid" });
  }
  if (data === undefined || data === null) {
    logRejected(source, type, "data kosong");
    return res.status(400).json({ status: "error", message: "data wajib diisi" });
  }

  const result = await savePush(source, type, timestamp, data);
  if (!result.ok) {
    console.error(`SYNC/POST ERROR (${source}/${type}):`, result.reason);
    return res.status(500).json({ status: "error", message: "Gagal simpan data push" });
  }

  res.status(200).json({ status: "ok", source, type, received_at: new Date().toISOString() });
});

// ─────────────────────────────────────────────────────────────
//  GET /api/sync/status — dashboard kecil buat lihat kapan terakhir
//  tiap source/type push (berguna buat ngecek "SGP udah berapa lama
//  gak ngirim data?" tanpa buka psql).
// ─────────────────────────────────────────────────────────────
router.get("/status", async (_req, res) => {
  if (!syncDbConfigured) {
    return res.json({ status: "ok", configured: false, sources: [] });
  }
  const { getLatestPush } = require("../services/pushStore");
  const rows = [];
  for (const source of VALID_SOURCES) {
    for (const type of VALID_TYPES) {
      const latest = await getLatestPush(source, type, Infinity); // Infinity: mau tau meski udah basi
      if (latest) {
        rows.push({
          source,
          type,
          received_at: latest.received_at,
          age_ms: Date.now() - new Date(latest.received_at).getTime(),
        });
      }
    }
  }
  res.json({ status: "ok", configured: true, sources: rows });
});

module.exports = router;
