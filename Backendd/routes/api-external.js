// Tanggung jawab: endpoint READ-ONLY yang di-expose ke luar (lewat Caddy,
// domain publik) buat dikonsumsi Master Dashboard di Hirose. Instance ini
// (Internal / SGP / Systech — ditentuin dari .env SOURCE_NAME) cuma pernah
// jadi PIHAK YANG DITARIK datanya, gak pernah manggil keluar.
//
// Kontrak response DISAMAIN di semua subcont — Master ga perlu tau struktur
// kolom cluster_1_<row>_<type> masing-masing, cukup terima JSON ini:
//
//   {
//     "status": "ok",
//     "source": "internal",
//     "timestamp": "2026-07-02T03:00:00.000Z",
//     "data": {
//       "lines_total": 29,
//       "lines_running": 27,
//       "lines_not_running": 2,
//       "output_plan": 12000,
//       "output_actual": 11800,
//       "qty_reject": 45,
//       "stoptime_total": 320,
//       "avg_oee": 78.4
//     }
//   }
//
// Kalau ada error internal (DB down dll), tetap balas JSON terstruktur
// (status: "error") — BUKAN 500 polos — biar Master gampang bedain
// "source ini lagi bermasalah" vs "response-nya emang gak valid".

const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");

const pool = require("../db");
const {
  getLocalSummary,
  getLocalDailySummary,
  getDailyTrend,
  getRangeTrend,
  getLocalMonthlySummary,
} = require("../services/summaryService");
const { getLineRangeBreakdown } = require("../services/lineBreakdownService");
const {
  getMockSummary,
  getMockDailyTrend,
  getMockRangeTrend,
} = require("../utils/mockData");

const SOURCE_NAME = process.env.SOURCE_NAME || "internal";
// MOCK_MODE=true → skip DB sama sekali, balikin data karangan. Dipakai buat
// testing lokal (misal simulasiin instance SGP/Systech di laptop tanpa
// perlu bikin skema DB beneran). JANGAN dinyalain di production.
const MOCK_MODE = process.env.MOCK_MODE === "true";

// ── Middleware: API key ─────────────────────────────────────────
// Header wajib: x-api-key: <EXTERNAL_API_KEY>
function requireApiKey(req, res, next) {
  const key = req.headers["x-api-key"];
  if (!process.env.EXTERNAL_API_KEY) {
    // Kesalahan konfigurasi server, bukan salah pemanggil — tetap tolak,
    // jangan pernah "terbuka" cuma karena env lupa diisi.
    console.error(
      "EXTERNAL_API_KEY belum di-set di .env — endpoint external ditutup total.",
    );
    return res
      .status(503)
      .json({ status: "error", message: "Server belum dikonfigurasi" });
  }
  if (!key || key !== process.env.EXTERNAL_API_KEY) {
    return res.status(403).json({ status: "error", message: "Forbidden" });
  }
  next();
}

// ── Middleware: rate limit ──────────────────────────────────────
// Lapisan tambahan di luar rate-limit yang nanti dipasang di Caddy —
// jaga-jaga kalau request nembus proxy langsung ke port Express.
const externalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 menit
  max: 30, // Master paling sering polling tiap beberapa menit, 30 req/menit udah longgar
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Terlalu banyak request, coba lagi sebentar",
  },
});

router.use(externalLimiter);
router.use(requireApiKey);

// ─────────────────────────────────────────────────────────────
//  GET /api/external/summary?date=YYYY-MM-DD — ringkasan teragregasi
//  instance ini. Tanpa ?date, defaultnya SHIFT YANG LAGI JALAN hari ini
//  (getLocalSummary — perilaku lama, gak berubah). Dikasih ?date valid →
//  ringkasan SATU TANGGAL PENUH (semua shift), dipakai filter tanggal
//  panel "Kinerja Produksi Hari Ini" di Master Dashboard Utama.
// ─────────────────────────────────────────────────────────────
router.get("/summary", async (req, res) => {
  try {
    const dateParam = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || "")
      ? req.query.date
      : null;

    const data = MOCK_MODE
      ? getMockSummary()
      : dateParam
        ? await getLocalDailySummary(dateParam)
        : await getLocalSummary();

    res.json({
      status: "ok",
      source: SOURCE_NAME,
      timestamp: new Date().toISOString(),
      data,
      mock: MOCK_MODE || undefined, // cuma nongol kalau true, biar gampang kebedain di response
    });
  } catch (err) {
    console.error("EXTERNAL/SUMMARY ERROR:", err.message);
    res.status(200).json({
      status: "error",
      source: SOURCE_NAME,
      timestamp: new Date().toISOString(),
      message: "Gagal ambil data — lihat log server",
    });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/external/monthly-trend?year=&month= — output harian 1 bulan
//  (SUM lintas semua line instance ini), buat chart di Master Dashboard
//  Utama. year/month default ke bulan berjalan WIB kalau gak dikirim.
// ─────────────────────────────────────────────────────────────
router.get("/monthly-trend", async (req, res) => {
  try {
    const wib = new Date(Date.now() + 7 * 3600 * 1000);
    const year = parseInt(req.query.year) || wib.getUTCFullYear();
    const month = parseInt(req.query.month) || wib.getUTCMonth() + 1;

    const data = MOCK_MODE
      ? getMockDailyTrend(year, month)
      : await getDailyTrend(year, month);

    res.json({
      status: "ok",
      source: SOURCE_NAME,
      timestamp: new Date().toISOString(),
      data,
      mock: MOCK_MODE || undefined,
    });
  } catch (err) {
    console.error("EXTERNAL/MONTHLY-TREND ERROR:", err.message);
    res.status(200).json({
      status: "error",
      source: SOURCE_NAME,
      timestamp: new Date().toISOString(),
      message: "Gagal ambil data — lihat log server",
    });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/external/range-trend?start=&end= — output harian buat RENTANG
//  TANGGAL BEBAS (start/end format YYYY-MM-DD, boleh lintas bulan), plus
//  totals (output_plan, output_actual, bekidoritsu, stoptime_total) buat
//  KPI card. Dipakai halaman "Breakdown Tren" di Master (date-range picker
//  per lokasi) — beda dari /monthly-trend yang terkunci 1 bulan kalender.
// ─────────────────────────────────────────────────────────────
router.get("/range-trend", async (req, res) => {
  try {
    const start = String(req.query.start || "");
    const end = String(req.query.end || "");
    const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

    if (!isValidDate(start) || !isValidDate(end) || start > end) {
      return res.status(200).json({
        status: "error",
        source: SOURCE_NAME,
        timestamp: new Date().toISOString(),
        message: "Parameter start/end wajib format YYYY-MM-DD dan start <= end",
      });
    }

    const data = MOCK_MODE
      ? getMockRangeTrend(start, end)
      : await getRangeTrend(start, end);

    res.json({
      status: "ok",
      source: SOURCE_NAME,
      timestamp: new Date().toISOString(),
      data,
      mock: MOCK_MODE || undefined,
    });
  } catch (err) {
    console.error("EXTERNAL/RANGE-TREND ERROR:", err.message);
    res.status(200).json({
      status: "error",
      source: SOURCE_NAME,
      timestamp: new Date().toISOString(),
      message: "Gagal ambil data — lihat log server",
    });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/external/monthly-summary?year=&month= — ringkasan teragregasi
//  SATU BULAN PENUH instance ini (bukan cuma shift/hari berjalan). Dipakai
//  buat KPI utama & tabel "Ringkasan Bulanan" di Master Dashboard Utama.
//  year/month default ke bulan berjalan WIB kalau gak dikirim.
// ─────────────────────────────────────────────────────────────
router.get("/monthly-summary", async (req, res) => {
  try {
    const wib = new Date(Date.now() + 7 * 3600 * 1000);
    const year = parseInt(req.query.year) || wib.getUTCFullYear();
    const month = parseInt(req.query.month) || wib.getUTCMonth() + 1;

    const data = MOCK_MODE
      ? getMockSummary()
      : await getLocalMonthlySummary(year, month);

    res.json({
      status: "ok",
      source: SOURCE_NAME,
      timestamp: new Date().toISOString(),
      data,
      mock: MOCK_MODE || undefined,
    });
  } catch (err) {
    console.error("EXTERNAL/MONTHLY-SUMMARY ERROR:", err.message);
    res.status(200).json({
      status: "error",
      source: SOURCE_NAME,
      timestamp: new Date().toISOString(),
      message: "Gagal ambil data — lihat log server",
    });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/external/line-range-breakdown?start=&end= — breakdown PER LINE
//  instance ini buat rentang tanggal bebas. Dipakai Master narik data
//  "Breakdown per Line" SGP/Systech dari jauh (lewat routes/master.js),
//  soalnya tabel breakdown lokal (routes/dashboard.js) cuma bisa liat DB
//  instance itu sendiri — Master gak punya akses langsung ke DB subcont.
//
//  SENGAJA gak terima parameter ?tempat= dari caller — endpoint ini SELALU
//  balikin data instance ini doang (SOURCE_NAME-nya sendiri), gak bisa
//  diminta narik tempat lain. Itu tanggung jawab routes/master.js buat
//  milih instance mana yang mau ditembak.
// ─────────────────────────────────────────────────────────────
router.get("/line-range-breakdown", async (req, res) => {
  try {
    const start = String(req.query.start || "");
    const end = String(req.query.end || "");
    const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

    if (!isValidDate(start) || !isValidDate(end) || start > end) {
      return res.status(200).json({
        status: "error",
        source: SOURCE_NAME,
        timestamp: new Date().toISOString(),
        message: "Parameter start/end wajib format YYYY-MM-DD dan start <= end",
      });
    }

    const result = MOCK_MODE
      ? { start, end, dates: [], data: [] } // belum ada mock buat breakdown per-line
      : await getLineRangeBreakdown(null, start, end);

    res.json({
      status: "ok",
      source: SOURCE_NAME,
      timestamp: new Date().toISOString(),
      data: result,
      mock: MOCK_MODE || undefined,
    });
  } catch (err) {
    console.error("EXTERNAL/LINE-RANGE-BREAKDOWN ERROR:", err.message);
    res.status(200).json({
      status: "error",
      source: SOURCE_NAME,
      timestamp: new Date().toISOString(),
      message: "Gagal ambil data — lihat log server",
    });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/external/health — dicek Master sebelum/tanpa narik summary
// ─────────────────────────────────────────────────────────────
router.get("/health", async (_req, res) => {
  if (MOCK_MODE) {
    return res.json({
      status: "ok",
      source: SOURCE_NAME,
      timestamp: new Date().toISOString(),
      mock: true,
    });
  }
  try {
    await pool.query("SELECT 1");
    res.json({
      status: "ok",
      source: SOURCE_NAME,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(200).json({
      status: "error",
      source: SOURCE_NAME,
      timestamp: new Date().toISOString(),
      message: "DB tidak terhubung",
    });
  }
});

module.exports = router;