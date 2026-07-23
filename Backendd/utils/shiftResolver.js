// Tanggung jawab: nentuin shift aktif + tanggal row DB + jam mulai shift,
// berdasarkan jam WIB sekarang dan shift_scheme (2 atau 3) satu line.
//
// Diextract dari routes/dashboard.js (awalnya didefinisikan inline di situ)
// supaya bisa dipakai bareng sama routes/api-external.js tanpa duplikasi.
//
// ⚠️ Value kolom `shift` di DB bentuknya "Shift 1 (2 Shift)",
//  "Shift 2 (3 Shift)", dst — ada suffix scheme.

// Tanggung jawab: nentuin shift aktif + tanggal row DB + jam mulai shift,
// berdasarkan jam WIB sekarang dan shift_scheme (2 atau 3) satu line.
//
// Diextract dari routes/dashboard.js (awalnya didefinisikan inline di situ)
// supaya bisa dipakai bareng sama routes/api-external.js tanpa duplikasi.
//
// ⚠️ Value kolom `shift` di DB bentuknya "Shift 1 (2 Shift)",
//  "Shift 2 (3 Shift)", dst — ada suffix scheme.
//
// ⚠️ JAM SHIFT BEDA PER TEMPAT buat scheme "2 Shift":
//   - Internal (Hirose)     : Shift 1 07:00–16:00 (Jumat s.d. 17:00),
//                             Shift 2 22:00–07:00
//   - Subcont SGP & Systech : Shift 1 08:00–20:00, Shift 2 20:00–08:00
//     (12 jam rata, gak ada bedanya hari Jumat)
//   Karena tiap tempat itu deploy INSTANCE SENDIRI-SENDIRI (env/.env
//   masing-masing — lihat catatan arsitektur di config/sources.js), jam
//   shift 2-shift ini dibaca dari environment variable, DEFAULT-nya jam
//   Internal (biar instance yang belum di-set env var tetap jalan kayak
//   sebelumnya). Di server SGP & Systech, set di .env:
//     SHIFT2_START_HOUR=8
//     SHIFT2_END_HOUR_WEEKDAY=20
//     SHIFT2_END_HOUR_FRIDAY=20
//     SHIFT2_NIGHT_START_HOUR=20
const SHIFT2_START_HOUR = parseInt(process.env.SHIFT2_START_HOUR, 10) || 7;
const SHIFT2_END_HOUR_WEEKDAY =
  parseInt(process.env.SHIFT2_END_HOUR_WEEKDAY, 10) || 16;
const SHIFT2_END_HOUR_FRIDAY =
  parseInt(process.env.SHIFT2_END_HOUR_FRIDAY, 10) || 17;
const SHIFT2_NIGHT_START_HOUR =
  parseInt(process.env.SHIFT2_NIGHT_START_HOUR, 10) || 22;

function resolveShiftAndDate(nowWIB, scheme) {
  const dow = nowWIB.getUTCDay(); // 0=Sun ... 5=Fri
  const hour = nowWIB.getUTCHours();
  let shiftNum;
  let useYesterday = false;
  let startHour;

  if (scheme === 3) {
    if (hour >= 6 && hour < 14) {
      shiftNum = 1;
      startHour = 6;
    } else if (hour >= 14 && hour < 22) {
      shiftNum = 2;
      startHour = 14;
    } else {
      // 22:00–23:59 ATAU 00:00–05:59 → Shift 3
      shiftNum = 3;
      startHour = 22;
      if (hour < 6) useYesterday = true; // tengah malam, row-nya tanggal kemarin
    }
  } else {
    // default: 2 shift — jam mulai/selesai ikut env var di atas (beda per
    // tempat, lihat catatan panjang di atas fungsi ini)
    const shift1End = dow === 5 ? SHIFT2_END_HOUR_FRIDAY : SHIFT2_END_HOUR_WEEKDAY;
    if (hour >= SHIFT2_START_HOUR && hour < shift1End) {
      shiftNum = 1;
      startHour = SHIFT2_START_HOUR;
    } else if (hour >= SHIFT2_NIGHT_START_HOUR || hour < SHIFT2_START_HOUR) {
      shiftNum = 2;
      startHour = SHIFT2_NIGHT_START_HOUR;
      if (hour < SHIFT2_START_HOUR) useYesterday = true;
    } else {
      shiftNum = 1; // gap → tampilkan hasil shift 1 yang baru kelar
      startHour = SHIFT2_START_HOUR;
    }
  }

  const shift = `Shift ${shiftNum} (${scheme} Shift)`;

  // Tanggal "kalender" buat row di DB (shift yang lewat tengah malam
  // dicatat di tanggal kemarin).
  const baseDate = useYesterday
    ? new Date(nowWIB.getTime() - 86_400_000)
    : nowWIB;
  const tanggal = baseDate.toISOString().slice(0, 10);

  // Instant (jam:menit) persis kapan shift ini mulai — dipakai buat
  // hitung "udah berapa lama shift jalan tapi row-nya belum ada".
  const shiftStartWIB = new Date(
    Date.UTC(
      baseDate.getUTCFullYear(),
      baseDate.getUTCMonth(),
      baseDate.getUTCDate(),
      startHour,
      0,
      0,
    ),
  );

  return { shift, tanggal, shiftStartWIB };
}

// Line dianggap "TIDAK RUNNING" kalau row buat shift aktif belum ada
// SAMA SEKALI, padahal udah lewat >120 menit dari jam mulai shift.
// Di bawah threshold dianggap wajar (operator belum sempat input/submit
// form), jadi gak di-flag.
const NOT_RUNNING_THRESHOLD_MIN = 120;

function isLineNotRunning(nowWIB, shiftStartWIB) {
  const elapsedMin = (nowWIB.getTime() - shiftStartWIB.getTime()) / 60_000;
  return elapsedMin > NOT_RUNNING_THRESHOLD_MIN;
}

module.exports = {
  resolveShiftAndDate,
  isLineNotRunning,
  NOT_RUNNING_THRESHOLD_MIN,
};