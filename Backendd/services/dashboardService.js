// Tanggung jawab: semua query ke DB — route tidak boleh ada SQL di sini.

const { SHIFT1_COLS, SHIFT1_JUMAT_COLS, SHIFT2_COLS, TREND_PERIODS } = require('../config/columns');
const { VIEWS, DOW_FILTER } = require('../config/viewConfig');
const { getShift1ViewId, getActiveTrendSlots } = require('../utils/shiftHelper');

// Cache kolom view (per process) supaya tidak query information_schema tiap request
const _colCache = {};
async function getViewColumns(pool, viewName) {
  if (_colCache[viewName]) return _colCache[viewName];
  const res = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
    [viewName]
  );
  _colCache[viewName] = new Set(res.rows.map(r => r.column_name));
  return _colCache[viewName];
}

// Bangun SELECT query 1 view → 1 baris per row
async function buildSelectQuery(pool, view, cols, shiftLabel, dowFilter) {
  const existingCols = await getViewColumns(pool, view);
  const safeCol = (col, alias, fallback = 'NULL') =>
    existingCols.has(col) ? `${col} AS ${alias}` : `${fallback} AS ${alias}`;

  const where = dowFilter
    ? `WHERE EXTRACT(ISODOW FROM (cluster_1_11_d AT TIME ZONE 'Asia/Jakarta')) = ANY(ARRAY[${dowFilter}])`
    : '';

  return `
    SELECT
      '${shiftLabel}'                                           AS shift,
      cluster_1_11_d                                            AS tanggal,
      ${safeCol(cols.cl_no,             'cl_no')},
      ${safeCol(cols.product_name,      'product_name')},
      ${safeCol(cols.cell_leader_nama,  'cell_leader_nama')},
      ${safeCol(cols.output,            'output_total',    '0')},
      ${safeCol(cols.output_plan,       'output_plan',     '0')},
      ${safeCol(cols.reject,            'reject_qty',      '0')},
      ${safeCol(cols.stoptime_total,    'stoptime_total',  '0')},
      ${safeCol(cols.stoptime_man,      'stoptime_man',    '0')},
      ${safeCol(cols.stoptime_machine,  'stoptime_machine','0')},
      ${safeCol(cols.stoptime_material, 'stoptime_material','0')},
      0                                                         AS stoptime_method,
      ${safeCol(cols.stoptime_other,    'stoptime_other',  '0')},
      ${safeCol(cols.cycle_time_swi,    'cycle_time_swi',  'NULL')},
      ${safeCol(cols.cycle_time_actual, 'cycle_time_actual','NULL')},
      ${safeCol(cols.pj_teknis_nama,    'pj_teknis_nama',  'NULL')}
    FROM ${view}
    ${where}
  `;
}

// Ambil semua data harian (3 view UNION ALL)
async function fetchAllRows(pool) {
  const [q1, q2, q3] = await Promise.all([
    buildSelectQuery(pool, VIEWS.SHIFT1_WEEKDAY, SHIFT1_COLS,       'Shift 1', DOW_FILTER.SHIFT1_WEEKDAY),
    buildSelectQuery(pool, VIEWS.SHIFT1_FRIDAY,  SHIFT1_JUMAT_COLS, 'Shift 1', DOW_FILTER.SHIFT1_FRIDAY),
    buildSelectQuery(pool, VIEWS.SHIFT2,         SHIFT2_COLS,       'Shift 2', DOW_FILTER.SHIFT2),
  ]);
  const result = await pool.query(`${q1} UNION ALL ${q2} UNION ALL ${q3} ORDER BY tanggal ASC`);
  return result.rows;
}

// Ambil data trend per hari
async function fetchTrend(pool, targetDate) {
  const dowRow   = await pool.query(`SELECT EXTRACT(ISODOW FROM $1::date) AS dow`, [targetDate]);
  const dow      = Number(dowRow.rows[0]?.dow ?? 1);
  const s1ViewId = getShift1ViewId(dow);

  const s1Periods = TREND_PERIODS[s1ViewId];
  const s2Periods = TREND_PERIODS['13461'];

  const s1Cols = s1Periods.flatMap(p => [p.plan_col, p.actual_col]).join(', ');
  const s2Cols = s2Periods.flatMap(p => [p.plan_col, p.actual_col]).join(', ');

  const [s1Res, s2Res] = await Promise.all([
    pool.query(
      `SELECT ${s1Cols} FROM ${VIEWS['SHIFT1_' + (dow === 5 ? 'FRIDAY' : 'WEEKDAY')]}
       WHERE DATE(cluster_1_11_d AT TIME ZONE 'Asia/Jakarta') = $1 LIMIT 1`,
      [targetDate]
    ),
    pool.query(
      `SELECT ${s2Cols} FROM ${VIEWS.SHIFT2}
       WHERE DATE(cluster_1_11_d AT TIME ZONE 'Asia/Jakarta') = $1 LIMIT 1`,
      [targetDate]
    ),
  ]);

  const activeS1 = getActiveTrendSlots(s1ViewId);
  const activeS2 = getActiveTrendSlots('13461');

  const buildTrend = (periods, row, activeSlots) =>
    periods.map(p => {
      const plan   = row?.[p.plan_col]   != null ? Number(row[p.plan_col])   : null;
      const actual = activeSlots.has(p.label) && row?.[p.actual_col] != null
        ? Number(row[p.actual_col]) : null;
      const deviasi = plan != null && actual != null ? actual - plan : null;
      return {
        label:         p.label,
        cum_eff_min:   p.cum_eff_min,
        output_plan:   plan,
        output_actual: actual,
        deviasi,
        pencapaian: plan != null && plan > 0 && actual != null
          ? Math.round((actual / plan) * 100) : null,
      };
    });

  return {
    shift1: buildTrend(s1Periods, s1Res.rows[0] || null, activeS1),
    shift2: buildTrend(s2Periods, s2Res.rows[0] || null, activeS2),
  };
}

// Ambil akumulasi bulanan
async function fetchMonthly(pool, year, month) {
  const sqlS1 = `
    SELECT
      SUM(CAST(cluster_1_516_n AS NUMERIC)) AS total_reject,
      SUM(CAST(output_col AS NUMERIC))      AS total_output
    FROM (
      SELECT cluster_1_516_n, cluster_1_523_n AS output_col FROM ${VIEWS.SHIFT1_WEEKDAY}
      WHERE EXTRACT(YEAR  FROM (cluster_1_11_d AT TIME ZONE 'Asia/Jakarta')) = $1
        AND EXTRACT(MONTH FROM (cluster_1_11_d AT TIME ZONE 'Asia/Jakarta')) = $2
      UNION ALL
      SELECT cluster_1_516_n, cluster_1_421_n AS output_col FROM ${VIEWS.SHIFT1_FRIDAY}
      WHERE EXTRACT(YEAR  FROM (cluster_1_11_d AT TIME ZONE 'Asia/Jakarta')) = $1
        AND EXTRACT(MONTH FROM (cluster_1_11_d AT TIME ZONE 'Asia/Jakarta')) = $2
    ) s1
  `;
  const sqlS2 = `
    SELECT
      SUM(CAST(cluster_1_467_n AS NUMERIC)) AS total_reject,
      SUM(CAST(cluster_1_474_n AS NUMERIC)) AS total_output
    FROM ${VIEWS.SHIFT2}
    WHERE EXTRACT(YEAR  FROM (cluster_1_11_d AT TIME ZONE 'Asia/Jakarta')) = $1
      AND EXTRACT(MONTH FROM (cluster_1_11_d AT TIME ZONE 'Asia/Jakarta')) = $2
  `;

  const [resS1, resS2] = await Promise.all([
    pool.query(sqlS1, [year, month]),
    pool.query(sqlS2, [year, month]),
  ]);

  const total_output =
    (Number(resS1.rows[0]?.total_output) || 0) +
    (Number(resS2.rows[0]?.total_output) || 0);
  const total_reject =
    (Number(resS1.rows[0]?.total_reject) || 0) +
    (Number(resS2.rows[0]?.total_reject) || 0);
  const ppm = total_output > 0
    ? Math.round((total_reject / total_output) * 1_000_000) : 0;

  return { total_qty_reject: total_reject, total_output, ppm };
}

module.exports = { fetchAllRows, fetchTrend, fetchMonthly };
