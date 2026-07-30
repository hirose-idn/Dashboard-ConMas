// Tanggung jawab: hitung ringkasan teragregasi instance LOKAL ini (dari DB
// sendiri) — dipakai bareng oleh:
//   - routes/api-external.js  → di-expose ke luar buat Master di subcont lain
//   - routes/master.js        → dipanggil LANGSUNG (tanpa HTTP) buat source
//                                "internal", karena Master & instance
//                                Internal ini emang jalan di server yang sama
//
// Diextract dari routes/api-external.js supaya query DB-nya cuma ada di SATU
// tempat — tidak ada bedanya secara logic, cuma dipanggil dari 2 arah.

const pool = require("../db");
const { VIEW, COLS } = require("../config/reportColumns");
const { getAllLines } = require("../utils/linesRegistry");
const {
  resolveShiftAndDate,
  isLineNotRunning,
  pickActiveRow,
} = require("../utils/shiftResolver");

async function getLocalSummary() {
  const lines = getAllLines();
  const wib = new Date(Date.now() + 7 * 3600 * 1000);

  const perLine = await Promise.all(
    lines.map(async (line) => {
      const { shiftStartWIB: fallbackShiftStartWIB } = resolveShiftAndDate(
        wib,
        line.shift_scheme,
      );
      const lineNotRunning = isLineNotRunning(wib, fallbackShiftStartWIB);
      const yesterday = new Date(wib.getTime() - 86_400_000)
        .toISOString()
        .slice(0, 10);
      const todayStr = wib.toISOString().slice(0, 10);

      const query = `
        SELECT
          ${COLS.tanggal}           AS tanggal,
          ${COLS.shift}             AS shift,
          ${COLS.output_plan}       AS output_plan,
          ${COLS.output_actual}     AS output_actual,
          ${COLS.qty_reject}        AS qty_reject,
          ${COLS.stoptime_plan}     AS stoptime_plan,
          ${COLS.stoptime_actual}   AS stoptime_actual,
          ${COLS.oee}               AS oee
        FROM ${VIEW}
        WHERE ${COLS.line} = $1
          AND DATE(${COLS.tanggal}) IN ($2, $3)
          -- SEBELUMNYA: query nebak dulu label shift aktif (dari
          -- shift_scheme config) baru exact-match ke kolom shift — kalau
          -- tebakannya meleset (scheme salah / jam beda per line), row
          -- gak ketemu SAMA SEKALI walau datanya udah ada. Sekarang ambil
          -- semua row line ini hari-ini+kemarin, terus pickActiveRow()
          -- yang nentuin row mana yang aktif dari LABEL ASLI row itu
          -- sendiri (lihat utils/shiftResolver.js).
      `;
      const result = await pool.query(query, [line.line_code, todayStr, yesterday]);
      const row = pickActiveRow(result.rows, wib, "shift");

      const output_plan = Number(row?.output_plan) || 0;
      const output_actual = Number(row?.output_actual) || 0;
      const stoptime_plan = Number(row?.stoptime_plan) || 0;
      const stoptime_actual = Number(row?.stoptime_actual) || 0;

      return {
        has_data: Boolean(row),
        line_not_running: row ? false : lineNotRunning,
        output_plan,
        output_actual,
        qty_reject: Number(row?.qty_reject) || 0,
        stoptime_total: stoptime_plan - stoptime_actual,
        oee: Number(row?.oee) || 0,
      };
    }),
  );

  const runningLines = perLine.filter((l) => !l.line_not_running);
  const oeeValues = perLine.filter((l) => l.has_data).map((l) => l.oee);

  return {
    lines_total: perLine.length,
    lines_running: runningLines.length,
    lines_not_running: perLine.length - runningLines.length,
    output_plan: perLine.reduce((sum, l) => sum + l.output_plan, 0),
    output_actual: perLine.reduce((sum, l) => sum + l.output_actual, 0),
    qty_reject: perLine.reduce((sum, l) => sum + l.qty_reject, 0),
    stoptime_total: perLine.reduce((sum, l) => sum + l.stoptime_total, 0),
    avg_oee: oeeValues.length
      ? Math.round(
        (oeeValues.reduce((s, v) => s + v, 0) / oeeValues.length) * 10,
      ) / 10
      : 0,
  };
}

// Ringkasan teragregasi buat SATU TANGGAL SPESIFIK (gabung semua shift di
// tanggal itu) — beda dari getLocalSummary() di atas yang cuma nangkep
// SHIFT YANG LAGI JALAN saat ini. Dipakai buat filter tanggal di panel
// "Kinerja Produksi Hari Ini" Master Dashboard Utama, supaya user bisa
// geser ke tanggal lain, bukan cuma kekunci di hari berjalan.
//
// Query-nya SENGAJA SAMA PERSIS pola sama /summary-all-daily di
// routes/dashboard.js (numeric-safe cast + DATE(tanggal) polos, TANPA
// AT TIME ZONE — lihat catatan panjang di getLocalSummary di atas) supaya
// hasilnya konsisten sama panel Ranking Line yang udah lebih dulu benar.
async function getLocalDailySummary(dateStr) {
  const lines = getAllLines();
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  const todayStr = wib.toISOString().slice(0, 10);
  const isToday = dateStr === todayStr;

  const numeric = (col) =>
    `COALESCE(NULLIF(TRIM(${col}::text), '')::numeric, 0)`;

  const perLine = await Promise.all(
    lines.map(async (line) => {
      let lineNotRunning = false;
      if (isToday) {
        const { shiftStartWIB } = resolveShiftAndDate(wib, line.shift_scheme);
        lineNotRunning = isLineNotRunning(wib, shiftStartWIB);
      }

      const query = `
        SELECT
          SUM(${numeric(COLS.output_plan)})     AS output_plan,
          SUM(${numeric(COLS.output_actual)})   AS output_actual,
          SUM(${numeric(COLS.qty_reject)})      AS qty_reject,
          SUM(${numeric(COLS.stoptime_plan)})   AS stoptime_plan,
          SUM(${numeric(COLS.stoptime_actual)}) AS stoptime_actual,
          AVG(${numeric(COLS.oee)})             AS oee,
          COUNT(*) AS records
        FROM ${VIEW}
        WHERE ${COLS.line} = $1
          AND DATE(${COLS.tanggal}) = $2
      `;
      const result = await pool.query(query, [line.line_code, dateStr]);
      const row = result.rows[0] || null;

      const output_plan = Number(row?.output_plan) || 0;
      const output_actual = Number(row?.output_actual) || 0;
      const stoptime_plan = Number(row?.stoptime_plan) || 0;
      const stoptime_actual = Number(row?.stoptime_actual) || 0;

      return {
        has_data: Number(row?.records) > 0,
        // Status "line not running" cuma masuk akal buat HARI INI (kondisi
        // real-time) — tanggal lampau selalu dianggap false, sama kayak
        // pola yang sama di /summary-all-daily.
        line_not_running: isToday ? lineNotRunning : false,
        output_plan,
        output_actual,
        qty_reject: Number(row?.qty_reject) || 0,
        stoptime_total: stoptime_plan - stoptime_actual,
        oee: Number(row?.oee) || 0,
      };
    }),
  );

  const runningLines = perLine.filter((l) => !l.line_not_running);
  const oeeValues = perLine.filter((l) => l.has_data).map((l) => l.oee);

  return {
    lines_total: perLine.length,
    lines_running: runningLines.length,
    lines_not_running: perLine.length - runningLines.length,
    output_plan: perLine.reduce((sum, l) => sum + l.output_plan, 0),
    output_actual: perLine.reduce((sum, l) => sum + l.output_actual, 0),
    qty_reject: perLine.reduce((sum, l) => sum + l.qty_reject, 0),
    stoptime_total: perLine.reduce((sum, l) => sum + l.stoptime_total, 0),
    avg_oee: oeeValues.length
      ? Math.round(
        (oeeValues.reduce((s, v) => s + v, 0) / oeeValues.length) * 10,
      ) / 10
      : 0,
  };
}

// GET trend output harian buat RENTANG TANGGAL BEBAS — SUM lintas SEMUA
// line aktif per tanggal, termasuk stoptime (dibutuhin buat KPI card total
// di halaman "Breakdown Tren"). Ini versi generik yang dipakai bareng oleh
// getDailyTrend(year, month) di bawah (yang cuma wrapper start/end 1 bulan)
// dan endpoint custom range (start/end bebas, lintas bulan sekalipun).
async function getRangeTrend(startDate, endDate) {
  const lines = getAllLines();
  const lineCodes = lines.map((l) => l.line_code);

  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  const dataMap = {};

  if (lineCodes.length > 0) {
    const query = `
      SELECT
        DATE(${COLS.tanggal}) AS tanggal,
        SUM(COALESCE(NULLIF(TRIM(${COLS.output_plan}::text), ''), '0')::numeric)     AS plan,
        SUM(COALESCE(NULLIF(TRIM(${COLS.output_actual}::text), ''), '0')::numeric)   AS actual,
        SUM(COALESCE(NULLIF(TRIM(${COLS.stoptime_plan}::text), ''), '0')::numeric)   AS stoptime_plan,
        SUM(COALESCE(NULLIF(TRIM(${COLS.stoptime_actual}::text), ''), '0')::numeric) AS stoptime_actual
      FROM ${VIEW}
      WHERE ${COLS.line} = ANY($1)
        AND DATE(${COLS.tanggal}) BETWEEN $2 AND $3
      GROUP BY DATE(${COLS.tanggal})
      ORDER BY 1 ASC
    `;
    // Sama kayak getLocalSummary — GAK pakai AT TIME ZONE (lihat catatan
    // panjang di atas). Asumsi kolom tanggal = timestamp naive.
    const result = await pool.query(query, [lineCodes, startDate, endDate]);
    for (const row of result.rows) {
      const d =
        row.tanggal instanceof Date
          ? row.tanggal.toISOString().slice(0, 10)
          : String(row.tanggal).slice(0, 10);
      const stoptime_plan = Number(row.stoptime_plan) || 0;
      const stoptime_actual = Number(row.stoptime_actual) || 0;
      dataMap[d] = {
        plan: Number(row.plan) || 0,
        actual: Number(row.actual) || 0,
        stoptime: stoptime_plan - stoptime_actual,
      };
    }
  }

  const days = [];
  // ⚠️ BUG LAMA: `new Date(`${startDate}T00:00:00`)` (tanpa "Z") itu di-parse
  // sebagai JAM LOKAL SERVER, bukan UTC. Kalau server jalan di timezone WIB
  // (UTC+7) terus dibaca ulang lewat `.toISOString()` (yang emang UTC), hasil
  // tanggalnya GESER MUNDUR 1 HARI (01 Juni lokal → 31 Mei kalau di-UTC-in).
  // Itu penyebab tabel breakdown nampilin "31 May" pas filter "June" dipilih.
  // Fix: parse start/end SEBAGAI UTC dari awal (Date.UTC), terus increment
  // pakai setUTCDate/getUTCDate — konsisten UTC dari ujung ke ujung, gak
  // peduli timezone lokal server-nya di-set apa.
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const cursor = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));
  while (cursor <= end) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const entry = dataMap[dateStr];
    const isFuture = cursor > wib;
    days.push({
      date: dateStr,
      plan: entry?.plan ?? 0,
      actual: entry?.actual ?? 0,
      stoptime: entry?.stoptime ?? 0,
      hasData: !isFuture && Boolean(entry),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const totalPlan = days.reduce((sum, d) => sum + d.plan, 0);
  const totalActual = days.reduce((sum, d) => sum + d.actual, 0);
  const totalStoptime = days.reduce((sum, d) => sum + d.stoptime, 0);

  return {
    start: startDate,
    end: endDate,
    days,
    totals: {
      output_plan: totalPlan,
      output_actual: totalActual,
      bekidoritsu: totalPlan > 0 ? Math.round((totalActual / totalPlan) * 1000) / 10 : 0,
      stoptime_total: totalStoptime,
    },
  };
}

// GET trend output harian buat 1 bulan — dipakai buat chart "progress
// output per hari" di Master Dashboard Utama. Sekarang cuma wrapper tipis
// di atas getRangeTrend (hitung start/end 1 bulan penuh), biar query-nya
// gak duplikat sama versi custom range.
async function getDailyTrend(year, month) {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const range = await getRangeTrend(startDate, endDate);
  // Bentuk balikan dipertahankan sama kayak sebelumnya (year/month/days
  // dengan field "day") supaya konsumen lama (chart bulanan) gak perlu ubah.
  return {
    year,
    month,
    days: range.days.map((d, i) => ({
      date: d.date,
      day: i + 1,
      plan: d.plan,
      actual: d.actual,
      hasData: d.hasData,
    })),
  };
}

// Ringkasan teragregasi SATU BULAN PENUH (bukan cuma shift/hari berjalan) —
// dipakai buat KPI utama & tabel "Ringkasan Bulanan" di Master Dashboard.
// Status line_running/line_not_running tetap dihitung REAL-TIME (kondisi
// line saat endpoint dipanggil), karena "line lagi jalan atau tidak" itu
// konsepnya sesaat, bukan sesuatu yang bisa diakumulasi sebulan.
async function getLocalMonthlySummary(year, month) {
  const lines = getAllLines();
  const wib = new Date(Date.now() + 7 * 3600 * 1000);

  const perLine = await Promise.all(
    lines.map(async (line) => {
      const { shiftStartWIB } = resolveShiftAndDate(wib, line.shift_scheme);
      const lineNotRunning = isLineNotRunning(wib, shiftStartWIB);

      const query = `
        SELECT
          SUM(COALESCE(NULLIF(TRIM(${COLS.output_plan}::text), ''), '0')::numeric)     AS output_plan,
          SUM(COALESCE(NULLIF(TRIM(${COLS.output_actual}::text), ''), '0')::numeric)   AS output_actual,
          SUM(COALESCE(NULLIF(TRIM(${COLS.qty_reject}::text), ''), '0')::numeric)      AS qty_reject,
          SUM(COALESCE(NULLIF(TRIM(${COLS.stoptime_plan}::text), ''), '0')::numeric)   AS stoptime_plan,
          SUM(COALESCE(NULLIF(TRIM(${COLS.stoptime_actual}::text), ''), '0')::numeric) AS stoptime_actual,
          AVG(COALESCE(NULLIF(TRIM(${COLS.oee}::text), ''), '0')::numeric)             AS oee,
          COUNT(*) AS records
        FROM ${VIEW}
        WHERE ${COLS.line} = $1
          AND EXTRACT(YEAR  FROM ${COLS.tanggal}) = $2
          AND EXTRACT(MONTH FROM ${COLS.tanggal}) = $3
      `;
      const result = await pool.query(query, [line.line_code, year, month]);
      const row = result.rows[0] || null;

      const output_plan = Number(row?.output_plan) || 0;
      const output_actual = Number(row?.output_actual) || 0;
      const stoptime_plan = Number(row?.stoptime_plan) || 0;
      const stoptime_actual = Number(row?.stoptime_actual) || 0;

      return {
        has_data: Number(row?.records) > 0,
        line_not_running: lineNotRunning,
        output_plan,
        output_actual,
        qty_reject: Number(row?.qty_reject) || 0,
        stoptime_total: stoptime_plan - stoptime_actual,
        oee: Number(row?.oee) || 0,
      };
    }),
  );

  const runningLines = perLine.filter((l) => !l.line_not_running);
  const oeeValues = perLine.filter((l) => l.has_data).map((l) => l.oee);

  return {
    lines_total: perLine.length,
    lines_running: runningLines.length,
    lines_not_running: perLine.length - runningLines.length,
    output_plan: perLine.reduce((sum, l) => sum + l.output_plan, 0),
    output_actual: perLine.reduce((sum, l) => sum + l.output_actual, 0),
    qty_reject: perLine.reduce((sum, l) => sum + l.qty_reject, 0),
    stoptime_total: perLine.reduce((sum, l) => sum + l.stoptime_total, 0),
    avg_oee: oeeValues.length
      ? Math.round(
        (oeeValues.reduce((s, v) => s + v, 0) / oeeValues.length) * 10,
      ) / 10
      : 0,
  };
}

module.exports = {
  getLocalSummary,
  getLocalDailySummary,
  getDailyTrend,
  getRangeTrend,
  getLocalMonthlySummary,
};