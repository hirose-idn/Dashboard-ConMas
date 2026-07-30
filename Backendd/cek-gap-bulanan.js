// Diagnostic: cek Target vs Actual per bulan (Jan–Des) buat nemuin
// bulan mana yang bikin cumulative Gap di Trend Performance jomplang.
//
// Cara pakai (di server Master, folder Backendd):
//   node cek-gap-bulanan.js 2026
// (ganti 2026 ke tahun yang mau dicek — default tahun sekarang kalau
// gak diisi)
//
// Gak perlu install apa-apa tambahan — pakai fetch bawaan Node 18+.

const YEAR = Number(process.argv[2]) || new Date().getFullYear();
const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function fmt(n) {
  return Number(n || 0).toLocaleString("id-ID");
}

async function main() {
  console.log(`\nCek Target vs Actual per bulan — tahun ${YEAR}\n`);
  console.log(
    "Bulan".padEnd(6) +
    "Target".padStart(14) +
    "Actual".padStart(14) +
    "Achv%".padStart(10) +
    "  Catatan",
  );
  console.log("-".repeat(66));

  let cumTarget = 0;
  let cumActual = 0;

  for (let m = 1; m <= 12; m++) {
    try {
      const res = await fetch(`${BASE_URL}/api/executive/month?year=${YEAR}&month=${m}`);
      const json = await res.json();
      if (!json.success) {
        console.log(`${MONTHS[m - 1].padEnd(6)}  gagal fetch: ${json.message}`);
        continue;
      }

      const target = json.total.target || 0;
      const actual = json.total.actual || 0;
      const pct = target > 0 ? (actual / target) * 100 : 0;

      cumTarget += target;
      cumActual += actual;

      // Flag kalau achievement di luar rentang wajar (di bawah 50% atau
      // di atas 150%) — ini yang paling mungkin jadi sumber gap aneh.
      let note = "";
      if (target === 0) note = "⚠️  TARGET KOSONG/0";
      else if (pct > 150) note = "⚠️  ACTUAL JAUH DI ATAS TARGET";
      else if (pct < 50) note = "⚠️  ACTUAL JAUH DI BAWAH TARGET";

      console.log(
        MONTHS[m - 1].padEnd(6) +
        fmt(target).padStart(14) +
        fmt(actual).padStart(14) +
        `${pct.toFixed(1)}%`.padStart(10) +
        (note ? `  ${note}` : ""),
      );
    } catch (err) {
      console.log(`${MONTHS[m - 1].padEnd(6)}  error: ${err.message}`);
    }
  }

  console.log("-".repeat(66));
  const cumPct = cumTarget > 0 ? (cumActual / cumTarget) * 100 : 0;
  console.log(
    "TOTAL".padEnd(6) +
    fmt(cumTarget).padStart(14) +
    fmt(cumActual).padStart(14) +
    `${cumPct.toFixed(1)}%`.padStart(10),
  );
  console.log(
    "\nBulan yang ada tanda ⚠️  di atas itu yang bikin cumulative Gap " +
    "jadi jomplang — cek dulu ke situ (target manual planner atau data " +
    "produksi asli bulan itu).\n",
  );
}

main();
