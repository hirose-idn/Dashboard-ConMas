// Tanggung jawab: endpoint buat Executive Dashboard (halaman baru,
// KHUSUS instance Internal — lihat App.jsx gating IS_INTERNAL_INSTANCE).
//
// TARGET: masih manual (planner input) — belum ada sumber data otomatis
// buat angka target/rencana level Executive ini, disimpan di file
// (utils/executiveTargetsRegistry.js).
//
// ACTUAL: SEKARANG OTOMATIS — narik dari output_actual produksi asli,
// sumber yang SAMA persis dipakai Master Hub (`/api/master/monthly-summary`,
// gabungan Internal+SGP+Systech). Ga ada lagi input manual buat Actual —
// dipanggil LANGSUNG (bukan HTTP round-trip ke diri sendiri) biar cepat,
// reuse persis service yang sama kayak routes/master.js.
//
// Route ini SENGAJA tetap di-mount di semua instance (bukan cuma
// Internal) supaya kalau suatu saat mau dibuka dari instance lain juga
// gampang tinggal ganti gating di Frontend — tapi endpoint WRITE (POST,
// cuma buat Target sekarang) gak divalidasi macem-macem soal siapa yang
// boleh akses, karena backend Internal aja yang connect-able dari luar
// (subcont gak expose port ini ke publik). Kalau nanti mau dikunci lebih
// ketat, tambahin cek `SOURCE_NAME !== "internal"` di sini.

const express = require("express");
const router = express.Router();
const {
  getYear,
  getMonth,
  upsertEntry,
  VALID_TEMPAT,
} = require("../utils/executiveTargetsRegistry");

// Kalender kerja per bulan, PER TEMPAT — planner klik tanggal libur
// langsung di grid (bukan input angka lagi) — dasar ngitung "Target Hari
// Ini" (target bulanan ÷ total hari kerja, dikumulatifin s.d. tanggal
// berjalan, dihitung PASTI dari tanggal beneran). Lihat
// utils/executiveCalendarRegistry.js.
const {
  getEntry: getCalendarEntry,
  setLiburDates,
  getElapsedWorkingDays,
} = require("../utils/executiveCalendarRegistry");

// Reuse PERSIS sumber data yang sama dipakai Master Hub buat Actual —
// bukan query/logic baru, biar angkanya SELALU konsisten sama yang
// keliatan di Master Dashboard/Breakdown per Line.
const { SOURCES } = require("../config/sources");
const { getLocalMonthlySummary } = require("../services/summaryService");
const { fetchSourceMonthlySummary } = require("../services/sourceClient");

// tempat di config/sources.js pakai key "internal"/"sgp"/"systech" —
// SAMA persis kayak VALID_TEMPAT di executiveTargetsRegistry.js, jadi
// gak perlu mapping/terjemahan apa-apa di antara keduanya.
//
// ⚠️ CACHE + PARALEL — WAJIB, bukan optimisasi opsional. Tanpa ini,
// /trend manggil fungsi ini 12x BERURUTAN (satu per bulan) dan tiap
// panggilan nunggu HTTP ke SGP+Systech (bisa lambat/timeout kalau
// Tailscale/tunnel lagi bermasalah) — jadi 1x buka halaman Trend =
// sampai 12x jeda ditumpuk jadi satu, itu yang bikin "lama banget".
// Cache 30 detik cukup aman: data produksi disinkronkan tiap ~1 menit
// (lihat services/pushSyncService.js), jadi angka Actual gak akan
// berubah signifikan dalam rentang 30 detik.
const actualCache = new Map(); // key: "year-month" -> { data, expiresAt }
const CACHE_TTL_MS = 30 * 1000;

async function getActualPerTempat(year, month) {
  const cacheKey = `${year}-${month}`;
  const cached = actualCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const results = await Promise.allSettled(
    Object.entries(SOURCES).map(async ([key, source]) => {
      if (source.type === "local") {
        const data = await getLocalMonthlySummary(year, month);
        return { tempat: key, actual: data.output_actual || 0 };
      }
      const res = await fetchSourceMonthlySummary(key, source, year, month);
      return {
        tempat: key,
        actual: res.status === "ok" ? res.data?.output_actual || 0 : 0,
      };
    }),
  );

  const byTempat = {};
  for (const t of VALID_TEMPAT) byTempat[t] = 0;
  for (const r of results) {
    if (r.status === "fulfilled") byTempat[r.value.tempat] = r.value.actual;
    // Source gagal (Tailscale/tunnel putus dkk) -> Actual 0 buat lokasi
    // itu, BUKAN error total. sourceClient.js sendiri udah ada fallback
    // ke data push-sync kalau ada — ini cuma jaring pengaman terakhir.
  }

  actualCache.set(cacheKey, { data: byTempat, expiresAt: Date.now() + CACHE_TTL_MS });
  return byTempat;
}

// Dipanggil dari POST /target setelah save, biar target baru + actual
// (yang mungkin masih relevan dari cache) langsung konsisten di refetch
// berikutnya — TAPI kita SENGAJA gak invalidate actualCache di sini,
// karena target gak pernah mempengaruhi actual sama sekali (dua sumber
// data yang independen). Invalidate cuma perlu kalau actual-nya sendiri
// yang berubah (otomatis expire max 30 detik).

// masaKerja = { workingDays, elapsedWorkingDays } — sama buat semua tempat
// per periode yang diliat (kalender kerja gak dipecah per lokasi, cuma
// per year+month, lihat utils/workCalendarRegistry.js).
function computeAchievement(target, actual, masaKerja) {
  const t = Number(target) || 0;
  const a = Number(actual) || 0;
  const workingDays = masaKerja?.workingDays || 0;
  const elapsedWorkingDays = masaKerja?.elapsedWorkingDays || 0;

  // Target Hari Ini = target harian (target bulanan ÷ masa kerja) dikali
  // berapa hari kerja yang udah lewat s.d. hari ini — KUMULATIF, bukan
  // target 1 hari doang.
  const dailyTarget = workingDays > 0 ? t / workingDays : 0;
  const targetHariIni = Math.round(dailyTarget * elapsedWorkingDays * 100) / 100;

  return {
    target: t,
    actual: a,
    targetHariIni,
    gap: Math.round((a - t) * 100) / 100,
    gapHariIni: Math.round((a - targetHariIni) * 100) / 100,
    achievementPct: t > 0 ? Math.round((a / t) * 1000) / 10 : 0,
    achievementHariIniPct: targetHariIni > 0 ? Math.round((a / targetHariIni) * 1000) / 10 : 0,
  };
}

// ─────────────────────────────────────────────────────────────
//  GET /api/executive/month?year=&month= — buat KPI card + Achievement
//  Ranking (3 lokasi) di 1 bulan tertentu.
//  target: manual (file) | actual: OTOMATIS (data produksi asli)
// ─────────────────────────────────────────────────────────────
router.get("/month", async (req, res) => {
  try {
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: "Parameter year & month (1-12) wajib diisi",
      });
    }

    const targetRows = getMonth(year, month);
    const actualByTempat = await getActualPerTempat(year, month);

    // Masa kerja BEDA per tempat, dihitung PASTI dari tanggal libur yang
    // di-klik planner (default weekend kalau belum pernah disave).
    const byTempat = {};
    for (const t of VALID_TEMPAT) {
      const targetRow = targetRows.find((r) => r.tempat === t);
      const calendar = getCalendarEntry(year, month, t);
      const elapsedWorkingDays = getElapsedWorkingDays(year, month, calendar.liburDates, t);
      byTempat[t] = computeAchievement(targetRow?.target, actualByTempat[t], {
        workingDays: calendar.workingDays,
        elapsedWorkingDays,
      });
      byTempat[t].workingDays = calendar.workingDays;
      byTempat[t].elapsedWorkingDays = elapsedWorkingDays;
      byTempat[t].liburDates = calendar.liburDates; // dikirim ke FE buat render grid kalender edit
      byTempat[t].totalDays = calendar.totalDays;
    }

    const totalTarget = VALID_TEMPAT.reduce(
      (s, t) => s + byTempat[t].target,
      0,
    );
    const totalActual = VALID_TEMPAT.reduce(
      (s, t) => s + byTempat[t].actual,
      0,
    );
    // Target Hari Ini total = JUMLAH targetHariIni per tempat (bukan
    // dihitung ulang dari 1 masa kerja gabungan — masa kerja tiap tempat
    // beda, jadi gak bisa dipukul rata).
    const totalTargetHariIni = Math.round(
      VALID_TEMPAT.reduce((s, t) => s + byTempat[t].targetHariIni, 0) * 100,
    ) / 100;

    const total = {
      target: totalTarget,
      actual: totalActual,
      targetHariIni: totalTargetHariIni,
      gap: Math.round((totalActual - totalTarget) * 100) / 100,
      gapHariIni: Math.round((totalActual - totalTargetHariIni) * 100) / 100,
      achievementPct: totalTarget > 0 ? Math.round((totalActual / totalTarget) * 1000) / 10 : 0,
      achievementHariIniPct:
        totalTargetHariIni > 0 ? Math.round((totalActual / totalTargetHariIni) * 1000) / 10 : 0,
    };

    res.json({
      success: true,
      year,
      month,
      total,
      byTempat,
    });
  } catch (err) {
    console.error("EXECUTIVE/MONTH ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/executive/trend?year=&tempat= — buat grafik "Trend
//  Performance" kumulatif per bulan sepanjang tahun. tempat opsional
//  (kalau gak diisi, jumlahin ketiga lokasi).
//  target: manual (file) | actual: OTOMATIS (data produksi asli, 1
//  query per bulan — 12x query per tahun, wajar buat halaman yang gak
//  di-refresh tiap detik).
// ─────────────────────────────────────────────────────────────
router.get("/trend", async (req, res) => {
  try {
    const year = Number(req.query.year);
    const tempat = req.query.tempat || null;
    if (!year) {
      return res
        .status(400)
        .json({ success: false, message: "Parameter year wajib diisi" });
    }
    if (tempat && !VALID_TEMPAT.includes(tempat)) {
      return res.status(400).json({
        success: false,
        message: `tempat harus salah satu dari: ${VALID_TEMPAT.join(", ")}`,
      });
    }

    const targetRows = getYear(year);

    // ⚠️ FIX lambat: SEBELUMNYA 12 bulan di-fetch BERURUTAN (for-await),
    // jadi kalau SGP/Systech lemot, delaynya numpuk 12x. Sekarang semua
    // bulan di-fetch PARALEL sekaligus (Promise.all) — total waktu
    // tunggu sama kayak nge-fetch 1 bulan doang, bukan dikali 12.
    const actualByMonth = await Promise.all(
      Array.from({ length: 12 }, (_, i) => getActualPerTempat(year, i + 1)),
    );

    const months = [];
    let cumTarget = 0;
    let cumActual = 0;

    for (let m = 1; m <= 12; m++) {
      const monthTargetRows = tempat
        ? targetRows.filter((r) => r.month === m && r.tempat === tempat)
        : targetRows.filter((r) => r.month === m);
      const monthTarget = monthTargetRows.reduce(
        (s, r) => s + (r.target || 0),
        0,
      );

      const actualByTempat = actualByMonth[m - 1];
      const monthActual = tempat
        ? actualByTempat[tempat] || 0
        : VALID_TEMPAT.reduce((s, t) => s + (actualByTempat[t] || 0), 0);

      cumTarget += monthTarget;
      cumActual += monthActual;
      months.push({
        month: m,
        target: monthTarget,
        actual: monthActual,
        cumTarget,
        cumActual,
      });
    }

    res.json({ success: true, year, tempat: tempat || "all", months });
  } catch (err) {
    console.error("EXECUTIVE/TREND ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/executive/target — input/edit manual TARGET doang.
//  body: { year, month, tempat, target }
//  ⚠️ "actual" DIABAIKAN kalau dikirim — actual selalu dihitung otomatis
//  dari data produksi asli (lihat getActualPerTempat di atas), gak
//  disimpan manual lagi. Parameter ini sengaja gak divalidasi/ditolak
//  biar frontend lama yang masih ngirim `actual` gak error — cuma gak
//  ke-pakai aja.
// ─────────────────────────────────────────────────────────────
router.post("/target", (req, res) => {
  try {
    const { year, month, tempat, target } = req.body || {};
    // actual di-set 0 di file registry — field ini gak lagi jadi sumber
    // kebenaran, GET /month & /trend gak pernah baca `actual` dari file.
    const record = upsertEntry({ year, month, tempat, target, actual: 0 });
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/executive/calendar?year=&month=&tempat= — kalender kerja 1
//  tempat di 1 bulan (daftar tanggal libur yang diklik planner), dipakai
//  buat render grid kalender pas Edit di Executive Dashboard.
// ─────────────────────────────────────────────────────────────
router.get("/calendar", (req, res) => {
  try {
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    const tempat = req.query.tempat;
    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: "Parameter year & month (1-12) wajib diisi",
      });
    }
    if (!tempat || !VALID_TEMPAT.includes(tempat)) {
      return res.status(400).json({
        success: false,
        message: `Parameter tempat wajib salah satu dari: ${VALID_TEMPAT.join(", ")}`,
      });
    }
    res.json({ success: true, ...getCalendarEntry(year, month, tempat) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/executive/calendar — simpan daftar tanggal libur (OVERWRITE
//  lengkap) buat 1 tempat di 1 bulan.
//  body: { year, month, tempat, liburDates: ["2026-07-04", "2026-07-05", ...] }
// ─────────────────────────────────────────────────────────────
router.post("/calendar", (req, res) => {
  try {
    const { year, month, tempat, liburDates } = req.body || {};
    const record = setLiburDates({
      year: Number(year),
      month: Number(month),
      tempat,
      liburDates,
    });
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;