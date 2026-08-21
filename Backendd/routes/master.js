// Tanggung jawab: endpoint buat Master Dashboard di Hirose — gabungin data
// Internal (lokal, langsung query DB) + SGP/Systech (HTTP ke instance
// mereka masing-masing). Kegagalan 1 source TIDAK boleh nge-down-in yang lain
// (Promise.allSettled), dan tiap source stub otomatis kalau kredensialnya
// belum diisi (lihat config/sources.js).

const express = require("express");
const router = express.Router();

const { SOURCES } = require("../config/sources");
const {
  getLocalSummary,
  getLocalDailySummary,
  getDailyTrend,
  getRangeTrend,
  getLocalMonthlySummary,
} = require("../services/summaryService");
const {
  fetchSourceSummary,
  fetchSourceTrend,
  fetchSourceMonthlySummary,
  fetchSourceRangeTrend,
  fetchSourceLineRangeBreakdown,
  fetchSourceDashboardSummaryAll,
  fetchSourceDashboardSummaryByTempat,
  fetchSourceDashboardSummaryAllDaily,
  fetchSourceDashboardDailyTrend,
  fetchSourceDashboardMonthlySummary,
  fetchSourceDashboardLineSummary,
  fetchSourceDashboardLineMonthly,
} = require("../services/sourceClient");
const { getLineRangeBreakdown } = require("../services/lineBreakdownService");
const axios = require("axios");

// Loopback ke /api/dashboard/* PROSES INI SENDIRI — cuma kepake buat
// source.type === "local" (tempat="internal") di 5 route dashboard/*
// di bawah. Beda dari services/pushSyncService.js yang loopback lewat
// /api/external/dashboard/* (butuh lewat situ karena dia proses TERPISAH
// di instance subcont) — di sini Master manggil dirinya sendiri, jadi
// langsung ke /api/dashboard/* aja, gak perlu muter lewat /api/external.
async function fetchLocalDashboardJson(pathName, query = {}) {
  const qs = new URLSearchParams(query).toString();
  const url = `http://localhost:${process.env.PORT || 3000}/api/dashboard/${pathName}${qs ? `?${qs}` : ""}`;
  const r = await axios.get(url, { timeout: 10000 });
  if (!r.data || r.data.success !== true) {
    throw new Error(r.data?.message || `dashboard/${pathName} gagal`);
  }
  return r.data.data;
}

async function collectAllSources(date) {
  const results = await Promise.allSettled(
    Object.entries(SOURCES).map(async ([key, source]) => {
      if (source.type === "local") {
        try {
          const data = date
            ? await getLocalDailySummary(date)
            : await getLocalSummary();
          return {
            source: key,
            label: source.label,
            status: "ok",
            message: null,
            data,
          };
        } catch (err) {
          return {
            source: key,
            label: source.label,
            status: "error",
            message: err.message,
            data: null,
          };
        }
      }
      // type: "http"
      return fetchSourceSummary(key, source, date);
    }),
  );

  // Promise.allSettled selalu "fulfilled" di sini karena tiap fungsi di atas
  // udah nangkep error sendiri dan return object, bukan throw — tapi tetep
  // dijaga (kalau ada bug tak terduga) biar gak keluar 1 stack trace jelek.
  return results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : {
        source: "unknown",
        status: "error",
        message: r.reason?.message || "Unknown error",
        data: null,
      },
  );
}

// ─────────────────────────────────────────────────────────────
//  GET /api/master/summary?date=YYYY-MM-DD — semua source, gagal-isolasi.
//  Tanpa ?date → shift yang lagi jalan hari ini (perilaku lama). Dikasih
//  ?date valid → ringkasan SATU TANGGAL PENUH, dipakai filter tanggal di
//  panel "Kinerja Produksi Hari Ini" Master Dashboard Utama.
// ─────────────────────────────────────────────────────────────
router.get("/summary", async (req, res) => {
  const dateParam = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || "")
    ? req.query.date
    : null;
  const sources = await collectAllSources(dateParam);

  const ok = sources.filter((s) => s.status === "ok" && s.data);
  const totals = ok.reduce(
    (acc, s) => ({
      lines_total: acc.lines_total + (s.data.lines_total || 0),
      lines_running: acc.lines_running + (s.data.lines_running || 0),
      lines_not_running:
        acc.lines_not_running + (s.data.lines_not_running || 0),
      output_plan: acc.output_plan + (s.data.output_plan || 0),
      output_actual: acc.output_actual + (s.data.output_actual || 0),
      qty_reject: acc.qty_reject + (s.data.qty_reject || 0),
      stoptime_total: acc.stoptime_total + (s.data.stoptime_total || 0),
    }),
    {
      lines_total: 0,
      lines_running: 0,
      lines_not_running: 0,
      output_plan: 0,
      output_actual: 0,
      qty_reject: 0,
      stoptime_total: 0,
    },
  );

  res.json({
    timestamp: new Date().toISOString(),
    date: dateParam,
    sources, // detail per source, termasuk yang inactive/error/timeout
    totals: {
      ...totals,
      deviasi: totals.output_plan - totals.output_actual, // positif = kurang dari plan
    },
    sources_ok: ok.length,
    sources_total: Object.keys(SOURCES).length,
  });
});

// ─────────────────────────────────────────────────────────────
//  GET /api/master/monthly-summary?year=&month= — ringkasan teragregasi
//  SATU BULAN PENUH dari SEMUA source (Internal + SGP + Systech), gagal-
//  isolasi sama seperti /summary. Ini yang dipakai KPI utama & tabel
//  "Ringkasan Bulanan" di Master Dashboard Utama — bukan cuma hari berjalan.
//  year/month default ke bulan berjalan WIB.
// ─────────────────────────────────────────────────────────────
router.get("/monthly-summary", async (req, res) => {
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  const year = parseInt(req.query.year) || wib.getUTCFullYear();
  const month = parseInt(req.query.month) || wib.getUTCMonth() + 1;

  const results = await Promise.allSettled(
    Object.entries(SOURCES).map(async ([key, source]) => {
      if (source.type === "local") {
        try {
          const data = await getLocalMonthlySummary(year, month);
          return {
            source: key,
            label: source.label,
            status: "ok",
            message: null,
            data,
          };
        } catch (err) {
          return {
            source: key,
            label: source.label,
            status: "error",
            message: err.message,
            data: null,
          };
        }
      }
      return fetchSourceMonthlySummary(key, source, year, month);
    }),
  );

  const sources = results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : {
        source: "unknown",
        status: "error",
        message: r.reason?.message || "Unknown error",
        data: null,
      },
  );

  const ok = sources.filter((s) => s.status === "ok" && s.data);
  const totals = ok.reduce(
    (acc, s) => ({
      lines_total: acc.lines_total + (s.data.lines_total || 0),
      lines_running: acc.lines_running + (s.data.lines_running || 0),
      lines_not_running:
        acc.lines_not_running + (s.data.lines_not_running || 0),
      output_plan: acc.output_plan + (s.data.output_plan || 0),
      output_actual: acc.output_actual + (s.data.output_actual || 0),
      qty_reject: acc.qty_reject + (s.data.qty_reject || 0),
      stoptime_total: acc.stoptime_total + (s.data.stoptime_total || 0),
    }),
    {
      lines_total: 0,
      lines_running: 0,
      lines_not_running: 0,
      output_plan: 0,
      output_actual: 0,
      qty_reject: 0,
      stoptime_total: 0,
    },
  );

  res.json({
    year,
    month,
    timestamp: new Date().toISOString(),
    sources,
    totals: {
      ...totals,
      deviasi: totals.output_plan - totals.output_actual,
    },
    sources_ok: ok.length,
    sources_total: Object.keys(SOURCES).length,
  });
});

// ─────────────────────────────────────────────────────────────
//  GET /api/master/monthly-trend?year=&month= — output harian 1 bulan,
//  digabung PER TEMPAT (bukan cuma total), buat chart line multi-source
//  di Master Dashboard Utama. year/month default ke bulan berjalan WIB.
// ─────────────────────────────────────────────────────────────
router.get("/monthly-trend", async (req, res) => {
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  const year = parseInt(req.query.year) || wib.getUTCFullYear();
  const month = parseInt(req.query.month) || wib.getUTCMonth() + 1;

  const results = await Promise.allSettled(
    Object.entries(SOURCES).map(async ([key, source]) => {
      if (source.type === "local") {
        try {
          const data = await getDailyTrend(year, month);
          return { source: key, label: source.label, status: "ok", data };
        } catch (err) {
          return {
            source: key,
            label: source.label,
            status: "error",
            message: err.message,
            data: null,
          };
        }
      }
      return fetchSourceTrend(key, source, year, month);
    }),
  );

  const perSource = results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : {
        source: "unknown",
        status: "error",
        message: r.reason?.message || "Unknown error",
        data: null,
      },
  );

  // Gabung jadi 1 array per tanggal, kolom per source, buat langsung
  // dilempar ke recharts (1 <Line> per source) tanpa transform lagi di FE.
  const daysInMonth = new Date(year, month, 0).getDate();
  const merged = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const row = { date: dateStr, day: d };
    let totalActual = 0;
    let totalPlan = 0;
    for (const src of perSource) {
      const dayEntry = src.data?.days?.find((x) => x.date === dateStr);
      row[`${src.source}_actual`] = dayEntry?.actual ?? 0;
      row[`${src.source}_plan`] = dayEntry?.plan ?? 0;
      if (src.status === "ok") {
        totalActual += dayEntry?.actual ?? 0;
        totalPlan += dayEntry?.plan ?? 0;
      }
    }
    row.total_actual = totalActual;
    row.total_plan = totalPlan;
    merged.push(row);
  }

  res.json({
    year,
    month,
    sources: perSource.map(({ source, label, status, message }) => ({
      source,
      label,
      status,
      message,
    })),
    days: merged,
  });
});

// ─────────────────────────────────────────────────────────────
//  GET /api/master/tempat-trend?source=&start=&end= — trend harian +
//  totals (KPI card) buat SATU LOKASI, custom date range bebas. Dipakai
//  halaman "Breakdown Tren" yang dibuka dari popup row lokasi di Hub.
// ─────────────────────────────────────────────────────────────
router.get("/tempat-trend", async (req, res) => {
  const { source: sourceKey, start, end } = req.query;
  const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

  const source = SOURCES[sourceKey];
  if (!source) {
    return res.status(400).json({
      status: "error",
      message: `Source "${sourceKey}" tidak dikenal`,
    });
  }
  if (!isValidDate(start) || !isValidDate(end) || start > end) {
    return res.status(400).json({
      status: "error",
      message: "Parameter start/end wajib format YYYY-MM-DD dan start <= end",
    });
  }

  if (source.type === "local") {
    try {
      const data = await getRangeTrend(start, end);
      return res.json({
        source: sourceKey,
        label: source.label,
        status: "ok",
        data,
      });
    } catch (err) {
      return res.json({
        source: sourceKey,
        label: source.label,
        status: "error",
        message: err.message,
        data: null,
      });
    }
  }

  const result = await fetchSourceRangeTrend(sourceKey, source, start, end);
  res.json(result);
});

// ─────────────────────────────────────────────────────────────
//  GET /api/master/line-range-breakdown?source=&start=&end= — breakdown
//  PER LINE buat SATU LOKASI, custom date range bebas. Dipakai halaman
//  "Breakdown per Line" pas dibuka LEWAT Master Hub buat lokasi SGP/Systech
//  — endpoint lokal (routes/dashboard.js) gak bisa dipakai langsung dari
//  Master karena Master gak punya akses ke DB subcont, jadi harus proxy
//  lewat HTTP ke /api/external/line-range-breakdown instance yang
//  bersangkutan (sama pola persis kayak /tempat-trend di atas).
// ─────────────────────────────────────────────────────────────
router.get("/line-range-breakdown", async (req, res) => {
  const { source: sourceKey, start, end } = req.query;
  const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

  const source = SOURCES[sourceKey];
  if (!source) {
    return res.status(400).json({
      status: "error",
      message: `Source "${sourceKey}" tidak dikenal`,
    });
  }
  if (!isValidDate(start) || !isValidDate(end) || start > end) {
    return res.status(400).json({
      status: "error",
      message: "Parameter start/end wajib format YYYY-MM-DD dan start <= end",
    });
  }

  if (source.type === "local") {
    try {
      const data = await getLineRangeBreakdown(null, start, end);
      return res.json({
        source: sourceKey,
        label: source.label,
        status: "ok",
        data,
      });
    } catch (err) {
      return res.json({
        source: sourceKey,
        label: source.label,
        status: "error",
        message: err.message,
        data: null,
      });
    }
  }

  const result = await fetchSourceLineRangeBreakdown(
    sourceKey,
    source,
    start,
    end,
  );
  res.json(result);
});

// ─────────────────────────────────────────────────────────────
//  GET /api/master/dashboard/* — 5 endpoint proxy buat isi "Dashboard
//  Utama" pas dibuka LEWAT Master Hub buat lokasi SGP/Systech (tombol
//  yang dulu cuma nampilin alert "belum tersedia dari Hub"). Sama pola
//  persis kayak /line-range-breakdown di atas: local -> loopback lokal,
//  http -> HTTP ke instance bersangkutan (otomatis fallback ke data
//  push-sync kalau pull gagal/belum dikonfigurasi, lihat sourceClient.js).
// ─────────────────────────────────────────────────────────────
function resolveSourceOr400(req, res) {
  const sourceKey = req.query.source;
  const source = SOURCES[sourceKey];
  if (!source) {
    res.status(400).json({
      status: "error",
      message: `Source "${sourceKey}" tidak dikenal`,
    });
    return null;
  }
  return { sourceKey, source };
}

router.get("/dashboard/summary-all", async (req, res) => {
  const resolved = resolveSourceOr400(req, res);
  if (!resolved) return;
  const { sourceKey, source } = resolved;
  if (source.type === "local") {
    try {
      const data = await fetchLocalDashboardJson("summary-all");
      return res.json({ source: sourceKey, label: source.label, status: "ok", data });
    } catch (err) {
      return res.json({ source: sourceKey, label: source.label, status: "error", message: err.message, data: null });
    }
  }
  res.json(await fetchSourceDashboardSummaryAll(sourceKey, source));
});

router.get("/dashboard/summary-by-tempat", async (req, res) => {
  const resolved = resolveSourceOr400(req, res);
  if (!resolved) return;
  const { sourceKey, source } = resolved;
  if (source.type === "local") {
    try {
      const data = await fetchLocalDashboardJson("summary-by-tempat");
      return res.json({ source: sourceKey, label: source.label, status: "ok", data });
    } catch (err) {
      return res.json({ source: sourceKey, label: source.label, status: "error", message: err.message, data: null });
    }
  }
  res.json(await fetchSourceDashboardSummaryByTempat(sourceKey, source));
});

router.get("/dashboard/summary-all-daily", async (req, res) => {
  const resolved = resolveSourceOr400(req, res);
  if (!resolved) return;
  const { sourceKey, source } = resolved;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || "") ? req.query.date : null;
  if (source.type === "local") {
    try {
      const data = await fetchLocalDashboardJson("summary-all-daily", date ? { date } : {});
      return res.json({ source: sourceKey, label: source.label, status: "ok", data });
    } catch (err) {
      return res.json({ source: sourceKey, label: source.label, status: "error", message: err.message, data: null });
    }
  }
  res.json(await fetchSourceDashboardSummaryAllDaily(sourceKey, source, date));
});

router.get("/dashboard/daily-trend", async (req, res) => {
  const resolved = resolveSourceOr400(req, res);
  if (!resolved) return;
  const { sourceKey, source } = resolved;
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  const year = parseInt(req.query.year) || wib.getUTCFullYear();
  const month = parseInt(req.query.month) || wib.getUTCMonth() + 1;
  if (source.type === "local") {
    try {
      const data = await fetchLocalDashboardJson("daily-trend", { year, month });
      return res.json({ source: sourceKey, label: source.label, status: "ok", data });
    } catch (err) {
      return res.json({ source: sourceKey, label: source.label, status: "error", message: err.message, data: null });
    }
  }
  res.json(await fetchSourceDashboardDailyTrend(sourceKey, source, year, month));
});

router.get("/dashboard/monthly-summary", async (req, res) => {
  const resolved = resolveSourceOr400(req, res);
  if (!resolved) return;
  const { sourceKey, source } = resolved;
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  const year = parseInt(req.query.year) || wib.getUTCFullYear();
  const month = parseInt(req.query.month) || wib.getUTCMonth() + 1;
  if (source.type === "local") {
    try {
      const data = await fetchLocalDashboardJson("monthly-summary", { year, month });
      return res.json({ source: sourceKey, label: source.label, status: "ok", data });
    } catch (err) {
      return res.json({ source: sourceKey, label: source.label, status: "error", message: err.message, data: null });
    }
  }
  res.json(await fetchSourceDashboardMonthlySummary(sourceKey, source, year, month));
});

// GET /api/dashboard (line detail utama) & GET /api/dashboard/monthly punya
// kontrak response BEDA dari dashboard/* lain (lihat komentar panjang di
// api-external.js proxyLocalDashboardRaw) — makanya loopback lokalnya juga
// pakai helper TERPISAH dari fetchLocalDashboardJson: body mentah dikembaliin
// apa adanya, bukan diasumsikan selalu {success:true, data:{...}}.
async function fetchLocalLineJson(pathName, query = {}) {
  const qs = new URLSearchParams(query).toString();
  const url = `http://localhost:${process.env.PORT || 3000}/api/dashboard/${pathName}${qs ? `?${qs}` : ""}`;
  const r = await axios.get(url, { timeout: 10000 });
  return r.data;
}

// ─────────────────────────────────────────────────────────────
//  GET /api/master/dashboard/line-summary?source=&line=
//  GET /api/master/dashboard/line-monthly?source=&line=
//  — drill-down 1 line (dipanggil dari MasterDashboard.jsx pas user klik
//  row di tabel Ranking Line, buat isi PCBDashboard versi RINGKAS untuk
//  line SGP/Systech — lihat useDashboardData.js mode "remote"). Sama pola
//  local->loopback / http->proxy kayak endpoint dashboard/* lain di atas,
//  cuma pakai fetchLocalLineJson (bukan fetchLocalDashboardJson) buat
//  cabang local karena kontrak response 2 endpoint ini beda.
// ─────────────────────────────────────────────────────────────
router.get("/dashboard/line-summary", async (req, res) => {
  const resolved = resolveSourceOr400(req, res);
  if (!resolved) return;
  const { sourceKey, source } = resolved;
  const line = (req.query.line || "").trim();
  if (!line) {
    return res.status(400).json({ status: "error", message: "Parameter ?line= wajib diisi" });
  }
  if (source.type === "local") {
    try {
      const data = await fetchLocalLineJson("", { line });
      return res.json({ source: sourceKey, label: source.label, status: "ok", data });
    } catch (err) {
      return res.json({ source: sourceKey, label: source.label, status: "error", message: err.message, data: null });
    }
  }
  res.json(await fetchSourceDashboardLineSummary(sourceKey, source, line));
});

router.get("/dashboard/line-monthly", async (req, res) => {
  const resolved = resolveSourceOr400(req, res);
  if (!resolved) return;
  const { sourceKey, source } = resolved;
  const line = (req.query.line || "").trim();
  if (!line) {
    return res.status(400).json({ status: "error", message: "Parameter ?line= wajib diisi" });
  }
  if (source.type === "local") {
    try {
      const data = await fetchLocalLineJson("monthly", { line });
      return res.json({ source: sourceKey, label: source.label, status: "ok", data });
    } catch (err) {
      return res.json({ source: sourceKey, label: source.label, status: "error", message: err.message, data: null });
    }
  }
  res.json(await fetchSourceDashboardLineMonthly(sourceKey, source, line));
});

module.exports = router;