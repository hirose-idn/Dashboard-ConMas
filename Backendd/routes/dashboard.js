const express = require("express");
const router = express.Router();
const pool = require("../db");
const { getPoolForTempat } = pool;

// ─────────────────────────────────────────────────────────────
//  KONFIGURASI — PCB general (semua line pakai view yang sama,
//  dibedain lewat kolom Line). Line aktif + shift scheme-nya
//  (2/3 shift) disimpan di tabel "lines" (lihat routes/lines.js),
//  BUKAN hardcode — supaya nambah line baru gak perlu deploy ulang.
// ─────────────────────────────────────────────────────────────
// VIEW & COLS sekarang di config/reportColumns.js (di-require di bawah,
// dekat COLS lama) supaya bisa dipakai bareng routes/api-external.js.

// ⚠️ Eksperimen lama: satu backend narik banyak "tempat" (Internal/SGP/
// Systech) lewat view/pool berbeda dalam 1 app. DITINGGALKAN — sekarang tiap
// subcont deploy instance Dashboard ConMas SENDIRI (server + DB sendiri),
// dan Hirose narik ringkasan mereka lewat HTTP API (lihat routes/api-external.js
// + Master Dashboard). Fungsi di bawah cuma dipertahankan sebagai no-op biar
// pemanggil lama (getViewForTempat/getPoolForTempat) di file ini tetap jalan
// tanpa perlu diubah satu-satu — semua balik ke VIEW & pool lokal biasa.
function getViewForTempat(_tempat) {
  return VIEW;
}

// getLineConfig & getAllLines di-extract ke utils/linesRegistry.js supaya
// bisa dipakai bareng routes/lines.js & routes/api-external.js tanpa duplikasi.
const { getAllLines, getLineConfig } = require("../utils/linesRegistry");

// ─────────────────────────────────────────────────────────────
//  MAPPING KOLOM
//  (VIEW & COLS di-extract ke config/reportColumns.js — lihat catatan di
//  atas soal getViewForTempat. Row 17/Line masih perlu dicek: form ConMas
//  row itu field text/dropdown, atau ID numeric yang representasiin '41HR101'?)
// ─────────────────────────────────────────────────────────────
const { VIEW, COLS } = require("../config/reportColumns");

// SLOTS & getLineRangeBreakdown sekarang di services/lineBreakdownService.js
// (satu-satunya definisi, dipakai bareng sama endpoint di bawah + api-external.js).
const { SLOTS, getLineRangeBreakdown } = require("../services/lineBreakdownService");

// Rekapitulasi per jam — 25 slot, 06:00 s.d. 07:00 keesokan harinya.
// Row hanya keisi sesuai jam jalan shift terkait; sisanya NULL (otomatis tampil "—" di FE).
const HOURLY = [
  { label: "06-07", plan: "cluster_1_151_n", actual: "cluster_1_152_n" },
  { label: "07-08", plan: "cluster_1_256_n", actual: "cluster_1_257_n" },
  { label: "08-09", plan: "cluster_1_361_n", actual: "cluster_1_362_n" },
  { label: "09-10", plan: "cluster_1_466_n", actual: "cluster_1_467_n" },
  { label: "10-11", plan: "cluster_1_571_n", actual: "cluster_1_572_n" },
  { label: "11-12", plan: "cluster_1_676_n", actual: "cluster_1_677_n" },
  { label: "12-13", plan: "cluster_1_781_n", actual: "cluster_1_782_n" },
  { label: "13-14", plan: "cluster_1_886_n", actual: "cluster_1_887_n" },
  { label: "14-15", plan: "cluster_1_991_n", actual: "cluster_1_992_n" },
  { label: "15-16", plan: "cluster_1_1096_n", actual: "cluster_1_1097_n" },
  { label: "16-17", plan: "cluster_1_1201_n", actual: "cluster_1_1202_n" },
  { label: "17-18", plan: "cluster_1_1306_n", actual: "cluster_1_1307_n" },
  { label: "18-19", plan: "cluster_1_1411_n", actual: "cluster_1_1412_n" },
  { label: "19-20", plan: "cluster_1_1516_n", actual: "cluster_1_1517_n" },
  { label: "20-21", plan: "cluster_1_1621_n", actual: "cluster_1_1622_n" },
  { label: "21-22", plan: "cluster_1_1726_n", actual: "cluster_1_1727_n" },
  { label: "22-23", plan: "cluster_1_1831_n", actual: "cluster_1_1832_n" },
  { label: "23-24", plan: "cluster_1_1936_n", actual: "cluster_1_1937_n" },
  { label: "24-1", plan: "cluster_1_2041_n", actual: "cluster_1_2042_n" },
  { label: "01-02", plan: "cluster_1_2146_n", actual: "cluster_1_2147_n" },
  { label: "02-03", plan: "cluster_1_2251_n", actual: "cluster_1_2252_n" },
  { label: "03-04", plan: "cluster_1_2356_n", actual: "cluster_1_2357_n" },
  { label: "04-05", plan: "cluster_1_2461_n", actual: "cluster_1_2462_n" },
  { label: "05-06", plan: "cluster_1_2566_n", actual: "cluster_1_2567_n" },
  { label: "06-07", plan: "cluster_1_2671_n", actual: "cluster_1_2672_n" },
];

// ─────────────────────────────────────────────────────────────
//  LOGIC SHIFT — generic per shift_scheme (2 atau 3)
//
//  2 Shift: Shift 1: 07:00–16:00 (Jumat s.d. 17:00)
//           Shift 2: 22:00–07:00
//           Jam 16/17:00–22:00 = gap (gak ada shift jalan) → default
//           tampilkan Shift 1 (data terakhir yg baru selesai).
//
//  3 Shift: Shift 1: 06:00–14:00
//           Shift 2: 14:00–22:00
//           Shift 3: 22:00–06:00
//           Gak ada gap — selalu ada shift yang lagi jalan.
//
//  ⚠️ Value kolom `shift` di DB bentuknya "Shift 1 (2 Shift)",
//  "Shift 2 (3 Shift)", dst — ada suffix scheme.
// ─────────────────────────────────────────────────────────────

// resolveShiftAndDate & isLineNotRunning di-extract ke utils/shiftResolver.js
// supaya bisa dipakai bareng routes/api-external.js tanpa duplikasi.
const {
  resolveShiftAndDate,
  isLineNotRunning,
} = require("../utils/shiftResolver");

// ─────────────────────────────────────────────────────────────
//  GET /?line=... — data shift aktif untuk line yang diminta
// ─────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const lineCode = (req.query.line || "").trim();
    if (!lineCode) {
      return res.status(400).json({
        success: false,
        message:
          "Parameter ?line= wajib diisi. Cek GET /api/lines buat daftar line yang valid.",
      });
    }

    const lineConfig = await getLineConfig(lineCode);
    if (!lineConfig) {
      return res.status(404).json({
        success: false,
        message: `Line "${lineCode}" tidak ditemukan / nonaktif. Cek GET /api/lines.`,
      });
    }

    const wib = new Date(Date.now() + 7 * 3600 * 1000);
    const {
      shift,
      tanggal: targetDate,
      shiftStartWIB,
    } = resolveShiftAndDate(wib, lineConfig.shift_scheme);
    const lineNotRunning = isLineNotRunning(wib, shiftStartWIB);

    const slotSelects = SLOTS.flatMap((s, i) => [
      `${s.cl_no} AS slot_${i}_cl_no`,
      `${s.product_name} AS slot_${i}_product`,
      `${s.swi} AS slot_${i}_swi`,
      `${s.actual} AS slot_${i}_actual`,
    ]);
    const hourlySelects = HOURLY.flatMap((h) => [
      `${h.plan} AS hour_${h.label.replace(/-/g, "_")}_plan`,
      `${h.actual} AS hour_${h.label.replace(/-/g, "_")}_actual`,
    ]);

    const query = `
      SELECT
        ${COLS.line} AS line,
        ${COLS.cell_leader} AS cell_leader,
        ${COLS.teknisi} AS teknisi,
        ${COLS.inspector} AS inspector,
        ${COLS.tanggal} AS tanggal,
        ${COLS.shift} AS shift,
        ${COLS.reject_ppm} AS reject_ppm,
        ${COLS.output_plan} AS output_plan,
        ${COLS.output_actual} AS output_actual,
        ${COLS.deviasi_target} AS deviasi_target,
        ${COLS.qty_reject} AS qty_reject,
        ${COLS.stoptime_plan} AS stoptime_plan,
        ${COLS.stoptime_actual} AS stoptime_actual,
        ${COLS.stoptime_man} AS stoptime_man,
        ${COLS.stoptime_machine} AS stoptime_machine,
        ${COLS.stoptime_material} AS stoptime_material,
        ${COLS.stoptime_method} AS stoptime_method,
        ${COLS.oee} AS oee,
        ${slotSelects.join(",\n        ")},
        ${hourlySelects.join(",\n        ")}
      FROM ${getViewForTempat(lineConfig.tempat)}
      WHERE ${COLS.line} = $1
        AND ${COLS.shift} = $2
        AND DATE(${COLS.tanggal}) = $3
      LIMIT 1
    `;

    const result = await getPoolForTempat(lineConfig.tempat).query(query, [
      lineCode,
      shift,
      targetDate,
    ]);
    const row = result.rows[0] || null;

    if (!row) {
      return res.json({
        success: true,
        data: null,
        line: lineCode,
        shift,
        tanggal: targetDate,
        line_not_running: lineNotRunning,
      });
    }

    // ── Slot aktif: ambil slot terakhir yg cl_no-nya keisi ──
    let activeSlot = null;
    for (let i = 0; i < SLOTS.length; i++) {
      if (row[`slot_${i}_cl_no`]) {
        activeSlot = {
          cl_no: row[`slot_${i}_cl_no`],
          product_name: row[`slot_${i}_product`],
          cycle_time_swi:
            row[`slot_${i}_swi`] != null ? Number(row[`slot_${i}_swi`]) : null,
          cycle_time_actual:
            row[`slot_${i}_actual`] != null
              ? Number(row[`slot_${i}_actual`])
              : null,
        };
      }
    }

    // ── Hourly array (dipakai langsung, gak perlu endpoint /trend lagi) ──
    const hourly = HOURLY.map((h) => {
      const key = h.label.replace(/-/g, "_");
      const plan =
        row[`hour_${key}_plan`] != null
          ? Number(row[`hour_${key}_plan`])
          : null;
      const actual =
        row[`hour_${key}_actual`] != null
          ? Number(row[`hour_${key}_actual`])
          : null;
      return {
        slot: h.label,
        output_plan: plan,
        output_actual: actual,
        deviasi: plan != null && actual != null ? actual - plan : null,
        pencapaian:
          plan > 0 && actual != null ? Math.round((actual / plan) * 100) : null,
      };
    });

    const stoptime_total =
      row.stoptime_plan != null && row.stoptime_actual != null
        ? Number(row.stoptime_plan) - Number(row.stoptime_actual)
        : 0;

    res.json({
      success: true,
      shift,
      tanggal: targetDate,
      line_not_running: false,
      line: row.line,
      cell_leader_nama: row.cell_leader,
      pj_teknis_nama: row.teknisi,
      inspector_nama: row.inspector,
      product_name: activeSlot?.product_name || null,
      cl_no: activeSlot?.cl_no || null,
      cycle_time_swi: activeSlot?.cycle_time_swi ?? null,
      cycle_time_actual: activeSlot?.cycle_time_actual ?? null,
      output_plan: Number(row.output_plan) || 0,
      output_total: Number(row.output_actual) || 0,
      deviasi_target:
        (Number(row.output_actual) || 0) - (Number(row.output_plan) || 0),
      reject_qty: Number(row.qty_reject) || 0,
      qty_reject_ppm: Number(row.reject_ppm) || 0,
      stoptime_total,
      stoptime_man: Number(row.stoptime_man) || 0,
      stoptime_machine: Number(row.stoptime_machine) || 0,
      stoptime_material: Number(row.stoptime_material) || 0,
      stoptime_method: Number(row.stoptime_method) || 0,
      oee: row.oee != null ? Number(row.oee) : null,
      hourly,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error query dashboard:", error.message);
    res.status(500).json({
      success: false,
      message: "Gagal ambil data",
      error: error.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /monthly?line=... — akumulasi reject & output sebulan
//  (gabung semua shift, karena qty_reject ada di tiap row)
// ─────────────────────────────────────────────────────────────
router.get("/monthly", async (req, res) => {
  try {
    const lineCode = (req.query.line || "").trim();
    if (!lineCode) {
      return res
        .status(400)
        .json({ success: false, message: "Parameter ?line= wajib diisi." });
    }

    const lineConfig = getLineConfig(lineCode);
    if (!lineConfig) {
      return res.status(404).json({
        success: false,
        message: `Line "${lineCode}" tidak ditemukan / nonaktif.`,
      });
    }

    const wib = new Date(Date.now() + 7 * 3600 * 1000);
    const year = wib.getUTCFullYear();
    const month = wib.getUTCMonth() + 1;

    const query = `
      SELECT
        SUM(CAST(${COLS.qty_reject} AS NUMERIC)) AS total_reject,
        SUM(CAST(${COLS.output_actual} AS NUMERIC)) AS total_output,
        SUM(CAST(${COLS.stoptime_man} AS NUMERIC)) AS total_man,
        SUM(CAST(${COLS.stoptime_machine} AS NUMERIC)) AS total_machine,
        SUM(CAST(${COLS.stoptime_material} AS NUMERIC)) AS total_material,
        SUM(CAST(${COLS.stoptime_method} AS NUMERIC)) AS total_method
      FROM ${getViewForTempat(lineConfig.tempat)}
      WHERE ${COLS.line} = $1
        AND EXTRACT(YEAR FROM ${COLS.tanggal}) = $2
        AND EXTRACT(MONTH FROM ${COLS.tanggal}) = $3
    `;
    const result = await getPoolForTempat(lineConfig.tempat).query(query, [
      lineCode,
      year,
      month,
    ]);
    const total_output = Number(result.rows[0]?.total_output) || 0;
    const total_reject = Number(result.rows[0]?.total_reject) || 0;
    const ppm =
      total_output > 0
        ? Math.round((total_reject / total_output) * 1_000_000)
        : 0;

    res.json({
      total_qty_reject: total_reject,
      total_output,
      ppm,
      man: Number(result.rows[0]?.total_man) || 0,
      machine: Number(result.rows[0]?.total_machine) || 0,
      material: Number(result.rows[0]?.total_material) || 0,
      method: Number(result.rows[0]?.total_method) || 0,
    });
  } catch (err) {
    console.error("MONTHLY ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /reject-detail?line=...&date=YYYY-MM-DD — belum ada kolom
//  reject-per-jenis di DB, tetap return array kosong (FE jatuh ke
//  default defect list). Parameter ?line= diterima buat konsistensi
//  kontrak API begitu kolomnya udah ada nanti.
// ─────────────────────────────────────────────────────────────
router.get("/reject-detail", async (req, res) => {
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  const targetDate = req.query.date || wib.toISOString().slice(0, 10);
  res.json({ success: true, date: targetDate, data: [] });
});

// ─────────────────────────────────────────────────────────────
//  GET /summary-all — ringkasan SEMUA line aktif sekaligus,
//  dipakai buat Master Dashboard (overview banyak line dalam
//  1 layar). Sengaja dipisah dari "GET /" yang detail per-line,
//  query-nya lebih ringan (gak ambil hourly/slot/personel) karena
//  bakal di-poll buat banyak line sekaligus.
//
//  Field yang dibalikin SENGAJA LENGKAP (output, oee, ppm,
//  stoptime, status running) — keputusan KPI mana yang dipakai
//  diserahkan ke frontend, soalnya requirement-nya dari management
//  belum final. Kalau berubah, cukup ubah tampilan kartu di
//  frontend, endpoint ini gak perlu disentuh lagi.
//
//  Urutan hasil: line "TIDAK RUNNING" muncul duluan, sisanya
//  alfabetis. Kalau nanti ada kriteria "bermasalah" lain (reject
//  tinggi dst, begitu ada threshold dari management), tinggal
//  ditambah di bagian sort di bawah.
// ─────────────────────────────────────────────────────────────
router.get("/summary-all", async (req, res) => {
  try {
    const filterTempat = (req.query.tempat || "").trim() || null;
    let lines = getAllLines();
    if (filterTempat) {
      lines = lines.filter(
        (l) =>
          (l.tempat || "Internal").toLowerCase() === filterTempat.toLowerCase(),
      );
    }
    const wib = new Date(Date.now() + 7 * 3600 * 1000);

    const summaries = await Promise.all(
      lines.map(async (line) => {
        const { shift, tanggal, shiftStartWIB } = resolveShiftAndDate(
          wib,
          line.shift_scheme,
        );
        const lineNotRunning = isLineNotRunning(wib, shiftStartWIB);

        const query = `
          SELECT
            ${COLS.output_plan}       AS output_plan,
            ${COLS.output_actual}     AS output_actual,
            ${COLS.qty_reject}        AS qty_reject,
            ${COLS.reject_ppm}        AS reject_ppm,
            ${COLS.stoptime_plan}     AS stoptime_plan,
            ${COLS.stoptime_actual}   AS stoptime_actual,
            ${COLS.stoptime_man}      AS stoptime_man,
            ${COLS.stoptime_machine}  AS stoptime_machine,
            ${COLS.stoptime_material} AS stoptime_material,
            ${COLS.stoptime_method}   AS stoptime_method,
            ${COLS.oee}               AS oee
          FROM ${getViewForTempat(line.tempat)}
          WHERE ${COLS.line} = $1
            AND ${COLS.shift} = $2
            AND DATE(${COLS.tanggal}) = $3
          LIMIT 1
        `;
        const result = await getPoolForTempat(line.tempat).query(query, [
          line.line_code,
          shift,
          tanggal,
        ]);
        const row = result.rows[0] || null;

        const output_plan = Number(row?.output_plan) || 0;
        const output_actual = Number(row?.output_actual) || 0;
        const stoptime_plan = Number(row?.stoptime_plan) || 0;
        const stoptime_actual = Number(row?.stoptime_actual) || 0;

        return {
          line_code: line.line_code,
          description: line.description,
          shift_scheme: line.shift_scheme,
          tempat: line.tempat || "Internal",
          shift,
          tanggal,
          line_not_running: row ? false : lineNotRunning,
          has_data: Boolean(row),
          output_plan,
          output_actual,
          deviasi_target: output_actual - output_plan,
          qty_reject: Number(row?.qty_reject) || 0,
          reject_ppm: Number(row?.reject_ppm) || 0,
          stoptime_total: stoptime_plan - stoptime_actual,
          stoptime_man: Number(row?.stoptime_man) || 0,
          stoptime_machine: Number(row?.stoptime_machine) || 0,
          stoptime_material: Number(row?.stoptime_material) || 0,
          stoptime_method: Number(row?.stoptime_method) || 0,
          oee: Number(row?.oee) || 0,
        };
      }),
    );

    // Bermasalah (tidak running) duluan, sisanya alfabetis
    summaries.sort((a, b) => {
      if (a.line_not_running !== b.line_not_running) {
        return a.line_not_running ? -1 : 1;
      }
      return a.line_code.localeCompare(b.line_code);
    });

    res.json({ success: true, data: summaries });
  } catch (err) {
    console.error("SUMMARY-ALL ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /summary-by-tempat — agregasi per tempat (Internal/SGP/Systech)
//  Dipakai buat tabel akumulasi Master Dashboard baru.
//  Return 3 row maks, masing-masing berisi:
//    - jumlah_line, running_count, not_running_count
//    - total output_plan, output_actual, pct_achievement
//    - avg_oee, total_qty_reject, total_stoptime
//    - preview: 5 line teratas (prioritas tidak running)
// ─────────────────────────────────────────────────────────────
router.get("/summary-by-tempat", async (req, res) => {
  try {
    const allLines = getAllLines();
    const wib = new Date(Date.now() + 7 * 3600 * 1000);

    // Ambil data tiap line (sama seperti summary-all tapi kita group sendiri)
    const lineResults = await Promise.all(
      allLines.map(async (line) => {
        const { shift, tanggal, shiftStartWIB } = resolveShiftAndDate(
          wib,
          line.shift_scheme,
        );
        const lineNotRunning = isLineNotRunning(wib, shiftStartWIB);

        const query = `
          SELECT
            ${COLS.output_plan}     AS output_plan,
            ${COLS.output_actual}   AS output_actual,
            ${COLS.qty_reject}      AS qty_reject,
            ${COLS.stoptime_plan}   AS stoptime_plan,
            ${COLS.stoptime_actual} AS stoptime_actual,
            ${COLS.oee}             AS oee
          FROM ${getViewForTempat(line.tempat)}
          WHERE ${COLS.line} = $1
            AND ${COLS.shift} = $2
            AND DATE(${COLS.tanggal}) = $3
          LIMIT 1
        `;
        const result = await getPoolForTempat(line.tempat).query(query, [
          line.line_code,
          shift,
          tanggal,
        ]);
        const row = result.rows[0] || null;

        const output_plan = Number(row?.output_plan) || 0;
        const output_actual = Number(row?.output_actual) || 0;
        const stoptime_plan = Number(row?.stoptime_plan) || 0;
        const stoptime_actual = Number(row?.stoptime_actual) || 0;
        const not_running = row ? false : lineNotRunning;

        return {
          line_code: line.line_code,
          description: line.description,
          tempat: line.tempat || "Internal",
          shift,
          tanggal,
          line_not_running: not_running,
          has_data: Boolean(row),
          output_plan,
          output_actual,
          qty_reject: Number(row?.qty_reject) || 0,
          stoptime_total: stoptime_plan - stoptime_actual,
          oee: Number(row?.oee) || 0,
        };
      }),
    );

    // Group by tempat
    const ORDER = ["Internal", "SGP", "Systech"];
    const grouped = {};
    for (const tempat of ORDER) {
      grouped[tempat] = [];
    }
    for (const lr of lineResults) {
      const t = lr.tempat;
      if (!grouped[t]) grouped[t] = [];
      grouped[t].push(lr);
    }

    const result = ORDER.filter((t) => grouped[t].length > 0).map((tempat) => {
      const lines = grouped[tempat];
      const jumlah_line = lines.length;
      const running_count = lines.filter((l) => !l.line_not_running).length;
      const not_running_count = jumlah_line - running_count;
      const total_output_plan = lines.reduce((s, l) => s + l.output_plan, 0);
      const total_output_actual = lines.reduce(
        (s, l) => s + l.output_actual,
        0,
      );
      const pct_achievement =
        total_output_plan > 0
          ? Math.round((total_output_actual / total_output_plan) * 100)
          : 0;
      const oeeLines = lines.filter((l) => l.oee > 0);
      const avg_oee =
        oeeLines.length > 0
          ? Math.round(
              oeeLines.reduce((s, l) => s + l.oee, 0) / oeeLines.length,
            )
          : 0;
      const total_qty_reject = lines.reduce((s, l) => s + l.qty_reject, 0);
      const total_stoptime = lines.reduce((s, l) => s + l.stoptime_total, 0);

      // Preview: tidak running duluan, lalu alfabetis, ambil 5 teratas
      const preview = [...lines]
        .sort((a, b) => {
          if (a.line_not_running !== b.line_not_running)
            return a.line_not_running ? -1 : 1;
          return a.line_code.localeCompare(b.line_code);
        })
        .slice(0, 5)
        .map((l) => ({
          line_code: l.line_code,
          description: l.description,
          line_not_running: l.line_not_running,
          output_plan: l.output_plan,
          output_actual: l.output_actual,
          oee: l.oee,
        }));

      return {
        tempat,
        jumlah_line,
        running_count,
        not_running_count,
        total_output_plan,
        total_output_actual,
        pct_achievement,
        avg_oee,
        total_qty_reject,
        total_stoptime,
        preview,
      };
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("SUMMARY-BY-TEMPAT ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /hourly-trend?tempat= — agregasi output per jam
//  Dipakai buat line chart trend di Master Dashboard.
//  Return array 25 slot { label, plan, actual } di mana:
//    - plan   = SUM output plan semua line aktif per slot
//    - actual = SUM output actual semua line aktif per slot
//    - slot yang semua line-nya NULL → plan=0, actual=0, hasData=false
// ─────────────────────────────────────────────────────────────
router.get("/hourly-trend", async (req, res) => {
  try {
    const filterTempat = (req.query.tempat || "").trim() || null;
    let lines = getAllLines();
    if (filterTempat && filterTempat !== "Semua") {
      lines = lines.filter(
        (l) =>
          (l.tempat || "Internal").toLowerCase() === filterTempat.toLowerCase(),
      );
    }

    if (lines.length === 0) {
      const emptySlots = HOURLY.map((h) => ({
        label: h.label,
        plan: 0,
        actual: 0,
        hasData: false,
      }));
      return res.json({ success: true, data: emptySlots });
    }

    const wib = new Date(Date.now() + 7 * 3600 * 1000);

    // Query semua kolom hourly sekaligus per line (1 query per line)
    const lineData = await Promise.all(
      lines.map(async (line) => {
        const { shift, tanggal } = resolveShiftAndDate(wib, line.shift_scheme);
        const hourlySelects = HOURLY.map(
          (h, i) => `${h.plan} AS plan_${i}, ${h.actual} AS actual_${i}`,
        ).join(", ");

        const query = `
          SELECT ${hourlySelects}
          FROM ${getViewForTempat(line.tempat)}
          WHERE ${COLS.line} = $1
            AND ${COLS.shift} = $2
            AND DATE(${COLS.tanggal}) = $3
          LIMIT 1
        `;
        const result = await getPoolForTempat(line.tempat).query(query, [
          line.line_code,
          shift,
          tanggal,
        ]);
        return result.rows[0] || null;
      }),
    );

    // Agregasi per slot — SUM semua line, skip NULL
    const slots = HOURLY.map((h, i) => {
      let planSum = 0;
      let actualSum = 0;
      let hasData = false;

      for (const row of lineData) {
        if (!row) continue;
        const p = Number(row[`plan_${i}`]);
        const a = Number(row[`actual_${i}`]);
        if (!isNaN(p) && row[`plan_${i}`] !== null) {
          planSum += p;
          actualSum += isNaN(a) ? 0 : a;
          hasData = true;
        }
      }

      return { label: h.label, plan: planSum, actual: actualSum, hasData };
    });

    res.json({ success: true, data: slots });
  } catch (err) {
    console.error("HOURLY-TREND ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /daily-trend?tempat=&year=&month=
//  Trend output harian dalam 1 bulan, dipakai buat line chart
//  di Master Dashboard. Return array per tanggal:
//    { date, plan, actual, hasData }
//  Difilter by tempat (opsional). Year & month default ke bulan berjalan WIB.
// ─────────────────────────────────────────────────────────────
router.get("/daily-trend", async (req, res) => {
  try {
    const filterTempat = (req.query.tempat || "").trim() || null;
    const wib = new Date(Date.now() + 7 * 3600 * 1000);
    const year = parseInt(req.query.year) || wib.getUTCFullYear();
    const month = parseInt(req.query.month) || wib.getUTCMonth() + 1;

    let lines = getAllLines();
    if (filterTempat && filterTempat !== "Semua") {
      lines = lines.filter(
        (l) =>
          (l.tempat || "Internal").toLowerCase() === filterTempat.toLowerCase(),
      );
    }

    if (lines.length === 0) {
      return res.json({ success: true, data: [], year, month });
    }

    // Group line_codes per tempat (beda tempat = berpotensi beda view & beda server DB)
    const codesByTempat = {};
    for (const l of lines) {
      const t = l.tempat || "Internal";
      (codesByTempat[t] ||= []).push(l.line_code);
    }

    // 1 query per tempat (GROUP BY tanggal), lalu digabung/di-SUM di JS
    const dataMap = {};
    for (const [tempatKey, lineCodes] of Object.entries(codesByTempat)) {
      const viewName = getViewForTempat(tempatKey);
      const query = `
        SELECT
          DATE(${COLS.tanggal}) AS tanggal,
          SUM(COALESCE(NULLIF(TRIM(${COLS.output_plan}::text), '')::numeric, 0)) AS plan,
          SUM(COALESCE(NULLIF(TRIM(${COLS.output_actual}::text), '')::numeric, 0)) AS actual
        FROM ${viewName}
        WHERE ${COLS.line} = ANY($1)
          AND EXTRACT(YEAR  FROM ${COLS.tanggal}) = $2
          AND EXTRACT(MONTH FROM ${COLS.tanggal}) = $3
        GROUP BY DATE(${COLS.tanggal})
        ORDER BY 1 ASC
      `;
      const result = await getPoolForTempat(tempatKey).query(query, [
        lineCodes,
        year,
        month,
      ]);
      for (const row of result.rows) {
        const d =
          row.tanggal instanceof Date
            ? row.tanggal.toISOString().slice(0, 10)
            : String(row.tanggal).slice(0, 10);
        const prev = dataMap[d] || { plan: 0, actual: 0 };
        dataMap[d] = {
          plan: prev.plan + (Number(row.plan) || 0),
          actual: prev.actual + (Number(row.actual) || 0),
        };
      }
    }

    // Generate semua hari dalam bulan tsb (1 s.d. akhir bulan)
    const daysInMonth = new Date(year, month, 0).getDate();
    const data = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const entry = dataMap[dateStr];
      // Hari di masa depan → hasData = false
      const isFuture = new Date(dateStr) > wib;
      data.push({
        date: dateStr,
        day: d,
        plan: entry?.plan ?? 0,
        actual: entry?.actual ?? 0,
        hasData: !isFuture && Boolean(entry),
      });
    }

    res.json({ success: true, data, year, month });
  } catch (err) {
    console.error("DAILY-TREND ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /monthly-summary?tempat=&year=&month=
//  Agregasi SATU BULAN PENUH (bukan per-hari) buat KPI card
//  bulanan + breakdown 4M bulanan di Master Dashboard.
//  Difilter by tempat (opsional, sama kayak /daily-trend).
//  Year & month default ke bulan berjalan WIB.
// ─────────────────────────────────────────────────────────────
router.get("/monthly-summary", async (req, res) => {
  try {
    const filterTempat = (req.query.tempat || "").trim() || null;
    const wib = new Date(Date.now() + 7 * 3600 * 1000);
    const year = parseInt(req.query.year) || wib.getUTCFullYear();
    const month = parseInt(req.query.month) || wib.getUTCMonth() + 1;

    let lines = getAllLines();
    if (filterTempat && filterTempat !== "Semua") {
      lines = lines.filter(
        (l) =>
          (l.tempat || "Internal").toLowerCase() === filterTempat.toLowerCase(),
      );
    }

    const empty = {
      output_plan: 0,
      output_actual: 0,
      pct_achievement: 0,
      qty_reject: 0,
      reject_ppm: 0,
      stoptime_total: 0,
      stoptime_man: 0,
      stoptime_machine: 0,
      stoptime_material: 0,
      stoptime_method: 0,
      stoptime_other: 0,
    };

    if (lines.length === 0) {
      return res.json({
        success: true,
        data: empty,
        year,
        month,
        tempat: filterTempat || "Semua",
      });
    }

    const lineCodes = lines.map((l) => l.line_code);
    const numeric = (col) =>
      `COALESCE(NULLIF(TRIM(${col}::text), '')::numeric, 0)`;

    // Group line_codes per tempat (beda tempat = berpotensi beda view & beda server DB)
    const codesByTempat = {};
    for (const l of lines) {
      const t = l.tempat || "Internal";
      (codesByTempat[t] ||= []).push(l.line_code);
    }

    const SUM_FIELDS = [
      "output_plan",
      "output_actual",
      "qty_reject",
      "stoptime_plan",
      "stoptime_actual",
      "stoptime_man",
      "stoptime_machine",
      "stoptime_material",
      "stoptime_method",
    ];
    const totals = Object.fromEntries(SUM_FIELDS.map((f) => [f, 0]));

    for (const [tempatKey, codes] of Object.entries(codesByTempat)) {
      const viewName = getViewForTempat(tempatKey);
      const query = `
        SELECT
          SUM(${numeric(COLS.output_plan)})       AS output_plan,
          SUM(${numeric(COLS.output_actual)})     AS output_actual,
          SUM(${numeric(COLS.qty_reject)})        AS qty_reject,
          SUM(${numeric(COLS.stoptime_plan)})     AS stoptime_plan,
          SUM(${numeric(COLS.stoptime_actual)})   AS stoptime_actual,
          SUM(${numeric(COLS.stoptime_man)})      AS stoptime_man,
          SUM(${numeric(COLS.stoptime_machine)})  AS stoptime_machine,
          SUM(${numeric(COLS.stoptime_material)}) AS stoptime_material,
          SUM(${numeric(COLS.stoptime_method)})   AS stoptime_method
        FROM ${viewName}
        WHERE ${COLS.line} = ANY($1)
          AND EXTRACT(YEAR  FROM ${COLS.tanggal}) = $2
          AND EXTRACT(MONTH FROM ${COLS.tanggal}) = $3
      `;
      const result = await getPoolForTempat(tempatKey).query(query, [
        codes,
        year,
        month,
      ]);
      const row = result.rows[0] || {};
      for (const f of SUM_FIELDS) {
        totals[f] += Number(row[f]) || 0;
      }
    }

    const {
      output_plan,
      output_actual,
      qty_reject,
      stoptime_plan,
      stoptime_actual,
    } = totals;

    const data = {
      output_plan,
      output_actual,
      pct_achievement:
        output_plan > 0 ? Math.round((output_actual / output_plan) * 100) : 0,
      qty_reject,
      // PPM dihitung ulang dari total sebulan (bukan rata-rata PPM harian)
      reject_ppm:
        output_actual > 0
          ? Math.round((qty_reject / output_actual) * 1_000_000)
          : 0,
      stoptime_total: stoptime_plan - stoptime_actual,
      stoptime_man: totals.stoptime_man,
      stoptime_machine: totals.stoptime_machine,
      stoptime_material: totals.stoptime_material,
      stoptime_method: totals.stoptime_method,
      stoptime_other: 0, // kolom "Other" belum ada di DB
    };

    res.json({
      success: true,
      data,
      year,
      month,
      tempat: filterTempat || "Semua",
    });
  } catch (err) {
    console.error("MONTHLY-SUMMARY ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /summary-all-monthly?tempat=&year=&month= — ringkasan SATU BULAN
//  PENUH per line (bukan cuma shift/hari berjalan), dipakai buat tabel
//  ranking "Top Output Terendah / Top Reject Terbanyak / Top Stoptime
//  Terbanyak" di Master Dashboard — supaya ranking ini ikut month picker
//  yang sama dengan Trend Output Harian & KPI Bulanan, bukan cuma
//  nunjukkin kondisi hari ini. line_not_running tetap dihitung REAL-TIME
//  (kondisi line saat endpoint dipanggil), karena "sedang jalan atau
//  tidak" itu konsepnya sesaat, bukan sesuatu yang bisa diakumulasi
//  sebulan. Year & month default ke bulan berjalan WIB.
// ─────────────────────────────────────────────────────────────
router.get("/summary-all-monthly", async (req, res) => {
  try {
    const filterTempat = (req.query.tempat || "").trim() || null;
    const wib = new Date(Date.now() + 7 * 3600 * 1000);
    const year = parseInt(req.query.year) || wib.getUTCFullYear();
    const month = parseInt(req.query.month) || wib.getUTCMonth() + 1;

    let lines = getAllLines();
    if (filterTempat) {
      lines = lines.filter(
        (l) =>
          (l.tempat || "Internal").toLowerCase() === filterTempat.toLowerCase(),
      );
    }

    const numeric = (col) =>
      `COALESCE(NULLIF(TRIM(${col}::text), '')::numeric, 0)`;

    const summaries = await Promise.all(
      lines.map(async (line) => {
        const { shiftStartWIB } = resolveShiftAndDate(wib, line.shift_scheme);
        const lineNotRunning = isLineNotRunning(wib, shiftStartWIB);

        const query = `
          SELECT
            SUM(${numeric(COLS.output_plan)})       AS output_plan,
            SUM(${numeric(COLS.output_actual)})     AS output_actual,
            SUM(${numeric(COLS.qty_reject)})        AS qty_reject,
            SUM(${numeric(COLS.stoptime_plan)})     AS stoptime_plan,
            SUM(${numeric(COLS.stoptime_actual)})   AS stoptime_actual,
            AVG(${numeric(COLS.oee)})               AS oee,
            COUNT(*) AS records
          FROM ${getViewForTempat(line.tempat)}
          WHERE ${COLS.line} = $1
            AND EXTRACT(YEAR  FROM ${COLS.tanggal}) = $2
            AND EXTRACT(MONTH FROM ${COLS.tanggal}) = $3
        `;
        const result = await getPoolForTempat(line.tempat).query(query, [
          line.line_code,
          year,
          month,
        ]);
        const row = result.rows[0] || null;

        const output_plan = Number(row?.output_plan) || 0;
        const output_actual = Number(row?.output_actual) || 0;
        const stoptime_plan = Number(row?.stoptime_plan) || 0;
        const stoptime_actual = Number(row?.stoptime_actual) || 0;

        return {
          line_code: line.line_code,
          description: line.description,
          tempat: line.tempat || "Internal",
          year,
          month,
          line_not_running: lineNotRunning,
          has_data: Number(row?.records) > 0,
          output_plan,
          output_actual,
          qty_reject: Number(row?.qty_reject) || 0,
          stoptime_total: stoptime_plan - stoptime_actual,
          oee: Math.round((Number(row?.oee) || 0) * 10) / 10,
        };
      }),
    );

    res.json({ success: true, data: summaries, year, month });
  } catch (err) {
    console.error("SUMMARY-ALL-MONTHLY ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /line-range-breakdown?tempat=&start=&end= — breakdown PER LINE
//  buat CUSTOM DATE RANGE bebas (start/end format YYYY-MM-DD, boleh
//  lintas bulan). Beda dari /summary-all-monthly (terkunci 1 bulan
//  kalender): di sini per line dapet totals kumulatif (plan/actual/
//  reject/bekidoritsu/deviasi) SEKALIGUS breakdown plan/actual PER
//  TANGGAL — dipakai tabel "Breakdown per Line" yang bisa discroll
//  ke samping (1 pasang kolom Plan/Actual per tanggal).
// ─────────────────────────────────────────────────────────────
router.get("/line-range-breakdown", async (req, res) => {
  try {
    const filterTempat = (req.query.tempat || "").trim() || null;
    const start = String(req.query.start || "");
    const end = String(req.query.end || "");
    const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

    if (!isValidDate(start) || !isValidDate(end) || start > end) {
      return res.status(400).json({
        success: false,
        message: "Parameter start/end wajib format YYYY-MM-DD dan start <= end",
      });
    }

    const result = await getLineRangeBreakdown(filterTempat, start, end);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("LINE-RANGE-BREAKDOWN ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /summary-all-daily?date=YYYY-MM-DD — akumulasi per line UNTUK
//  1 TANGGAL SPESIFIK (gabung semua shift di tanggal itu). Dipakai buat
//  panel "Ranking Line" di Master Dashboard yang butuh ranking harian,
//  bukan bulanan — mirip /summary-all-monthly tapi filter tanggal persis,
//  bukan EXTRACT year/month.
// ─────────────────────────────────────────────────────────────
router.get("/summary-all-daily", async (req, res) => {
  try {
    const filterTempat = (req.query.tempat || "").trim() || null;
    const wib = new Date(Date.now() + 7 * 3600 * 1000);
    const todayStr = `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, "0")}-${String(wib.getUTCDate()).padStart(2, "0")}`;
    const dateParam = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || "")
      ? req.query.date
      : todayStr;

    let lines = getAllLines();
    if (filterTempat) {
      lines = lines.filter(
        (l) =>
          (l.tempat || "Internal").toLowerCase() === filterTempat.toLowerCase(),
      );
    }

    const numeric = (col) =>
      `COALESCE(NULLIF(TRIM(${col}::text), '')::numeric, 0)`;

    const summaries = await Promise.all(
      lines.map(async (line) => {
        const { shiftStartWIB } = resolveShiftAndDate(wib, line.shift_scheme);
        const lineNotRunning = isLineNotRunning(wib, shiftStartWIB);

        const query = `
          SELECT
            SUM(${numeric(COLS.output_plan)})       AS output_plan,
            SUM(${numeric(COLS.output_actual)})     AS output_actual,
            SUM(${numeric(COLS.qty_reject)})        AS qty_reject,
            SUM(${numeric(COLS.stoptime_plan)})     AS stoptime_plan,
            SUM(${numeric(COLS.stoptime_actual)})   AS stoptime_actual,
            SUM(${numeric(COLS.stoptime_man)})      AS stoptime_man,
            SUM(${numeric(COLS.stoptime_machine)})  AS stoptime_machine,
            SUM(${numeric(COLS.stoptime_material)}) AS stoptime_material,
            SUM(${numeric(COLS.stoptime_method)})   AS stoptime_method,
            AVG(${numeric(COLS.oee)})               AS oee,
            COUNT(*) AS records
          FROM ${getViewForTempat(line.tempat)}
          WHERE ${COLS.line} = $1
            AND DATE(${COLS.tanggal}) = $2
        `;
        const result = await getPoolForTempat(line.tempat).query(query, [
          line.line_code,
          dateParam,
        ]);
        const row = result.rows[0] || null;
        const hasDataToday = Number(row?.records) > 0;

        const output_plan = Number(row?.output_plan) || 0;
        const output_actual = Number(row?.output_actual) || 0;
        const stoptime_plan = Number(row?.stoptime_plan) || 0;
        const stoptime_actual = Number(row?.stoptime_actual) || 0;

        return {
          line_code: line.line_code,
          description: line.description,
          tempat: line.tempat || "Internal",
          date: dateParam,
          // ⚠️ FIX bug "Tidak Running padahal jalan": SEBELUMNYA baris ini
          // cuma ngecek elapsed time (`lineNotRunning`) tanpa peduli
          // apakah datanya beneran ada — begitu udah >120 menit dari mulai
          // shift, SEMUA line ke-flag "Tidak Running" gak peduli output-nya
          // jalan atau nggak. Konsisten sama services/summaryService.js
          // (`row ? false : lineNotRunning`): flag cuma nyala kalau emang
          // BENERAN gak ada data buat hari ini, bukan semata waktu.
          line_not_running:
            dateParam === todayStr && !hasDataToday ? lineNotRunning : false,
          has_data: hasDataToday,
          output_plan,
          output_actual,
          qty_reject: Number(row?.qty_reject) || 0,
          stoptime_total: stoptime_plan - stoptime_actual,
          stoptime_man: Number(row?.stoptime_man) || 0,
          stoptime_machine: Number(row?.stoptime_machine) || 0,
          stoptime_material: Number(row?.stoptime_material) || 0,
          stoptime_method: Number(row?.stoptime_method) || 0,
          oee: Math.round((Number(row?.oee) || 0) * 10) / 10,
        };
      }),
    );

    res.json({ success: true, data: summaries, date: dateParam });
  } catch (err) {
    console.error("SUMMARY-ALL-DAILY ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;