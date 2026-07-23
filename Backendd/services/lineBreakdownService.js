// Tanggung jawab: hitung breakdown PER LINE untuk custom date range
// (dipakai tabel "Breakdown per Line"). Di-extract dari routes/dashboard.js
// supaya query-nya cuma ada di SATU tempat, dipakai bareng oleh:
//   - routes/dashboard.js     → lokal (buka langsung di instance ini)
//   - routes/api-external.js → di-expose ke luar buat Master narik
//                                breakdown SGP/Systech dari jauh

const pool = require("../db");
const { getPoolForTempat } = pool;
const { VIEW, COLS } = require("../config/reportColumns");
const { getAllLines } = require("../utils/linesRegistry");

// Slot produk 1–6, terisi sekuensial (slot N+1 baru keisi kalau ada Change Model).
// SATU-SATUNYA definisi SLOTS — routes/dashboard.js import dari sini juga,
// jangan didefinisikan ulang di file lain.
const SLOTS = [
  {
    cl_no: "cluster_1_7_t",
    product_name: "cluster_1_8_t",
    swi: "cluster_1_12_n",
    actual: "cluster_1_13_n",
  },
  {
    cl_no: "cluster_1_20_t",
    product_name: "cluster_1_21_t",
    swi: "cluster_1_25_n",
    actual: "cluster_1_26_n",
  },
  {
    cl_no: "cluster_1_33_t",
    product_name: "cluster_1_34_t",
    swi: "cluster_1_38_n",
    actual: "cluster_1_39_n",
  },
  {
    cl_no: "cluster_1_45_t",
    product_name: "cluster_1_46_t",
    swi: "cluster_1_50_n",
    actual: "cluster_1_51_n",
  },
  {
    cl_no: "cluster_1_57_t",
    product_name: "cluster_1_58_t",
    swi: "cluster_1_62_n",
    actual: "cluster_1_63_n",
  },
  {
    cl_no: "cluster_1_69_t",
    product_name: "cluster_1_70_t",
    swi: "cluster_1_74_n",
    actual: "cluster_1_75_n",
  },
];

// Eksperimen lama "1 backend narik banyak tempat" DITINGGALKAN (lihat catatan
// yang sama di dashboard.js) — VIEW & pool selalu balik ke yang lokal.
function getViewForTempat(_tempat) {
  return VIEW;
}

/**
 * @param {string|null} filterTempat - null = semua line di instance ini
 * @param {string} start - YYYY-MM-DD
 * @param {string} end - YYYY-MM-DD
 * @returns {Promise<{start, end, dates: string[], data: object[]}>}
 */
async function getLineRangeBreakdown(filterTempat, start, end) {
  let lines = getAllLines();
  if (filterTempat) {
    lines = lines.filter(
      (l) => (l.tempat || "Internal").toLowerCase() === filterTempat.toLowerCase(),
    );
  }

  const numeric = (col) =>
    `COALESCE(NULLIF(TRIM(${col}::text), '')::numeric, 0)`;

  // Semua tanggal di rentang ini (dipakai buat isi hari kosong = 0).
  // Parse start/end SEBAGAI UTC eksplisit (Date.UTC) + increment pakai
  // setUTCDate — supaya gak geser mundur 1 hari kalau server jalan di
  // timezone WIB (UTC+7).
  const dateList = [];
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const cursor = new Date(Date.UTC(sy, sm - 1, sd));
  const endD = new Date(Date.UTC(ey, em - 1, ed));
  while (cursor <= endD) {
    dateList.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const productSlotSelects = SLOTS.flatMap((s, i) => [
    `${s.cl_no} AS slot_${i}_cl_no`,
    `${s.product_name} AS slot_${i}_product`,
  ]);

  const perLine = await Promise.all(
    lines.map(async (line) => {
      const query = `
        SELECT
          DATE(${COLS.tanggal}) AS tanggal,
          SUM(${numeric(COLS.output_plan)})   AS plan,
          SUM(${numeric(COLS.output_actual)}) AS actual,
          SUM(${numeric(COLS.qty_reject)})    AS qty_reject
        FROM ${getViewForTempat(line.tempat)}
        WHERE ${COLS.line} = $1
          AND DATE(${COLS.tanggal}) BETWEEN $2 AND $3
        GROUP BY DATE(${COLS.tanggal})
        ORDER BY 1 ASC
      `;
      const result = await getPoolForTempat(line.tempat).query(query, [
        line.line_code,
        start,
        end,
      ]);

      const dataMap = {};
      for (const row of result.rows) {
        const d =
          row.tanggal instanceof Date
            ? row.tanggal.toISOString().slice(0, 10)
            : String(row.tanggal).slice(0, 10);
        dataMap[d] = {
          plan: Number(row.plan) || 0,
          actual: Number(row.actual) || 0,
          qty_reject: Number(row.qty_reject) || 0,
        };
      }

      const days = dateList.map((d) => ({
        date: d,
        plan: dataMap[d]?.plan ?? 0,
        actual: dataMap[d]?.actual ?? 0,
        hasData: Boolean(dataMap[d]),
      }));

      const output_plan = days.reduce((s, d) => s + d.plan, 0);
      const output_actual = days.reduce((s, d) => s + d.actual, 0);
      const qty_reject = Object.values(dataMap).reduce(
        (s, d) => s + d.qty_reject,
        0,
      );

      // Produk yang LAGI JALAN SEKARANG di line ini (LIVE dari DB) — sengaja
      // TIDAK dibatasi start/end filter breakdown ini, row TERBARU diambil
      // independen dari bulan yang lagi dilihat.
      let liveProductName = null;
      try {
        const productResult = await getPoolForTempat(line.tempat).query(
          `
            SELECT ${productSlotSelects.join(",\n              ")}
            FROM ${getViewForTempat(line.tempat)}
            WHERE ${COLS.line} = $1
            ORDER BY ${COLS.tanggal} DESC
            LIMIT 1
          `,
          [line.line_code],
        );
        const productRow = productResult.rows[0] || null;
        if (productRow) {
          for (let i = 0; i < SLOTS.length; i++) {
            if (productRow[`slot_${i}_cl_no`]) {
              liveProductName = productRow[`slot_${i}_product`] || null;
            }
          }
        }
      } catch (prodErr) {
        console.error(
          `LINE-RANGE-BREAKDOWN product lookup (${line.line_code}) ERROR:`,
          prodErr.message,
        );
        // Diemin — kolom Product Name buat line ini cuma tampil "—", sisa
        // breakdown (plan/actual/dst) tetap jalan normal.
      }

      return {
        line_code: line.line_code,
        product_name: liveProductName,
        tempat: line.tempat || "Internal",
        output_plan,
        output_actual,
        qty_reject,
        bekidoritsu:
          output_plan > 0
            ? Math.round((output_actual / output_plan) * 1000) / 10
            : 0,
        deviasi: output_plan - output_actual,
        days,
      };
    }),
  );

  return { start, end, dates: dateList, data: perLine };
}

module.exports = { getLineRangeBreakdown, SLOTS };
