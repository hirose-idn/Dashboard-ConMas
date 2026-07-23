// Tanggung jawab: data dummy buat instance yang jalan dalam MOCK_MODE=true
// (dipakai testing SGP/Systech di laptop tanpa perlu bikin skema DB lagi).
//
// JANGAN dipakai di production — ini murni buat buktiin alur API+Master
// jalan, angkanya karangan/random, BUKAN dari database manapun.

function getMockSummary() {
  const linesTotal = 5 + Math.floor(Math.random() * 3); // 5-7 line
  const linesRunning = linesTotal - Math.floor(Math.random() * 2); // 0-1 idle
  const outputPlan = linesTotal * 200;
  const outputActual = Math.round(outputPlan * (0.85 + Math.random() * 0.1));

  return {
    lines_total: linesTotal,
    lines_running: linesRunning,
    lines_not_running: linesTotal - linesRunning,
    output_plan: outputPlan,
    output_actual: outputActual,
    qty_reject: Math.round(outputActual * 0.01),
    stoptime_total: Math.round(20 + Math.random() * 40),
    avg_oee: Math.round((70 + Math.random() * 15) * 10) / 10,
  };
}

// Trend harian dummy buat 1 bulan — dipakai instance MOCK_MODE=true.
function getMockDailyTrend(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  const days = [];
  const basePlan = 800 + Math.floor(Math.random() * 400);

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const isFuture = new Date(dateStr) > wib;
    const plan = basePlan;
    const actual = isFuture ? 0 : Math.round(plan * (0.8 + Math.random() * 0.25));
    days.push({ date: dateStr, day: d, plan, actual, hasData: !isFuture });
  }

  return { year, month, days };
}

// Versi mock buat custom date range (dipakai halaman Breakdown Tren) —
// pola random-nya sama kayak getMockDailyTrend, cuma iterasinya per
// tanggal bebas (start..end), bukan terkunci 1 bulan kalender.
function getMockRangeTrend(startDate, endDate) {
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  const basePlan = 800 + Math.floor(Math.random() * 400);
  const days = [];

  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const cursor = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));
  while (cursor <= end) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const isFuture = cursor > wib;
    const plan = basePlan;
    const actual = isFuture ? 0 : Math.round(plan * (0.8 + Math.random() * 0.25));
    const stoptime = isFuture ? 0 : Math.round(20 + Math.random() * 60);
    days.push({ date: dateStr, plan, actual, stoptime, hasData: !isFuture });
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

module.exports = { getMockSummary, getMockDailyTrend, getMockRangeTrend };