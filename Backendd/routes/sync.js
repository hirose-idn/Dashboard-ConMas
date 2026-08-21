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
const { ipKeyGenerator } = rateLimit;

const { savePush, logRejected } = require("../services/pushStore");
const { configured: syncDbConfigured } = require("../db-sync");

const VALID_SOURCES = ["sgp", "systech"];
const VALID_TYPES = [
  "summary",
  "monthly-trend",
  "range-trend",
  // Dipakai "Dashboard Utama" pas dibuka lewat Master Hub — gak ada
  // parameter (selalu snapshot shift berjalan), jadi statis kayak
  // "summary" di atas, direfresh tiap siklus.
  "dashboard-summary-all",
  "dashboard-summary-by-tempat",
];
// "monthly-summary" sekarang dikirim per-bulan: "monthly-summary-2026-7",
// bukan string statis — biar fallback di sourceClient.js gak ke-apply ke
// bulan yang salah (lihat komentar di sourceClient.js/getPushTypeForPath).
const MONTHLY_SUMMARY_TYPE_RE = /^monthly-summary-\d{4}-(1[0-2]|[1-9])$/;
// "line-range-breakdown" sama polanya kayak monthly-summary di atas —
// Frontend selalu minta 1 bulan PENUH (tgl 1 s.d. akhir bulan) buat
// halaman "Breakdown per Line", jadi aman di-key per year-month juga.
const LINE_BREAKDOWN_TYPE_RE = /^line-range-breakdown-\d{4}-(1[0-2]|[1-9])$/;
// "dashboard-daily-trend" & "dashboard-monthly-summary" — bagian dari
// "Dashboard Utama", sama-sama di-key per year-month kayak di atas.
const DASHBOARD_MONTHLY_TYPE_RE =
  /^dashboard-(daily-trend|monthly-summary)-\d{4}-(1[0-2]|[1-9])$/;
// "dashboard-summary-all-daily" — panel Ranking Line, di-key per HARI
// (bukan bulan), format tanggal PADDED (YYYY-MM-DD) biar gak ambigu.
const DASHBOARD_DAILY_TYPE_RE =
  /^dashboard-summary-all-daily-\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
// "dashboard-line-<CODE>" (snapshot shift berjalan) & "dashboard-line-
// monthly-<CODE>-<Y>-<M>" (akumulasi bulan berjalan) — drill-down per-line
// buat SGP/Systech, satu-satunya jalur karena pull HTTP gak pernah bisa
// jalan di infra ini (lihat komentar panjang di sourceClient.js
// getPushTypeForPath). Line code bebas huruf/angka/underscore/strip (liat
// data/lines.json, contoh "41HR114C"), jadi charset regex-nya dilonggarin.
const DASHBOARD_LINE_TYPE_RE = /^dashboard-line-[A-Za-z0-9_-]+$/;
const DASHBOARD_LINE_MONTHLY_TYPE_RE =
  /^dashboard-line-monthly-[A-Za-z0-9_-]+-\d{4}-(1[0-2]|[1-9])$/;
function isValidPushType(type) {
  return (
    VALID_TYPES.includes(type) ||
    MONTHLY_SUMMARY_TYPE_RE.test(type) ||
    LINE_BREAKDOWN_TYPE_RE.test(type) ||
    DASHBOARD_MONTHLY_TYPE_RE.test(type) ||
    DASHBOARD_DAILY_TYPE_RE.test(type) ||
    DASHBOARD_LINE_MONTHLY_TYPE_RE.test(type) ||
    DASHBOARD_LINE_TYPE_RE.test(type)
  );
}

// ── Rate limit — longgar tapi tetap ada jaga-jaga ────────────────
// keyGenerator pakai `source` (bukan default req.ip): endpoint ini
// diakses lewat Cloudflare Tunnel, jadi kalau ke-key dari IP semua
// caller (SGP, Systech, curl manual, dst) numpuk ke bucket yang sama
// kalau trust-proxy-nya kebetulan salah konfig lagi suatu saat.
// req.body udah keparse duluan di index.js (app.use(express.json())
// dipasang sebelum semua route), jadi aman dipakai di sini.
const syncLimiter = rateLimit({
  windowMs: 60 * 1000,
  // Dulu 60 didesain buat 4 jenis data/source tiap ~1 menit, lalu naik ke
  // 120 pas nambah 9 jenis (breakdown per line + 5 dashboard-*). Sekarang
  // nambah lagi 2 request PER LINE AKTIF (dashboard-line-<CODE> +
  // dashboard-line-monthly-<CODE>-Y-M, lihat pushSyncService.js) — kalau
  // instance ini punya banyak line (puluhan), gampang kelewat 120 dalam 1
  // siklus (apalagi ada retry backlog nambahin sampai 15 lagi). Naikin ke
  // 400 biar ada headroom cukup gede — kalau suatu saat masih kena 429 di
  // log, ini angka pertama yang perlu dicek/naikin lagi.
  max: 400,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.body?.source || ipKeyGenerator(req.ip)),
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

  if (!isValidPushType(type)) {
    logRejected(source, type, "type tidak dikenal");
    return res.status(400).json({
      status: "error",
      message: `type harus salah satu dari: ${VALID_TYPES.join(", ")}, atau monthly-summary-YYYY-M / line-range-breakdown-YYYY-M / dashboard-daily-trend-YYYY-M / dashboard-monthly-summary-YYYY-M / dashboard-summary-all-daily-YYYY-MM-DD / dashboard-line-<CODE> / dashboard-line-monthly-<CODE>-YYYY-M`,
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

  let result;
  try {
    result = await savePush(source, type, timestamp, data);
  } catch (err) {
    // Jaga-jaga lapis kedua — savePush() sendiri udah nangkep errornya,
    // tapi ini biar POST handler ini gak PERNAH ninggalin unhandled
    // rejection ke Express walau ada bug lain yang belum ketauan.
    console.error(`SYNC/POST UNCAUGHT (${source}/${type}):`, err.message);
    return res.status(500).json({ status: "error", message: "Gagal simpan data push" });
  }
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
  const { getLatestPush, getLatestPushByPrefix } = require("../services/pushStore");
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
    // Type yang di-key per-bulan/per-hari (bukan statis), jadi dicari
    // via prefix satu-satu, bukan di-loop kayak VALID_TYPES di atas.
    const keyedPrefixes = [
      "monthly-summary-",
      "line-range-breakdown-",
      "dashboard-daily-trend-",
      "dashboard-monthly-summary-",
      "dashboard-summary-all-daily-",
      // Ambigu sengaja: prefix ini nyangkut baik "dashboard-line-<CODE>"
      // (snapshot) MAUPUN "dashboard-line-monthly-<CODE>-Y-M" (akumulasi
      // bulan) sekaligus — getLatestPushByPrefix cuma ambil YANG PALING
      // BARU dari keduanya gabung jadi 1 baris, jadi /status ini cuma buat
      // "masih ada yg ke-push barusan gak", bukan buat lihat SEMUA line
      // satu-satu (banyak line = banyak baris, gak muat kalau di-expand
      // di sini).
      "dashboard-line-",
    ];
    for (const prefix of keyedPrefixes) {
      const latest = await getLatestPushByPrefix(source, prefix, Infinity);
      if (latest) {
        rows.push({
          source,
          type: latest.type,
          received_at: latest.received_at,
          age_ms: Date.now() - new Date(latest.received_at).getTime(),
        });
      }
    }
  }
  res.json({ status: "ok", configured: true, sources: rows });
});

module.exports = router;