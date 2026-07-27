// Tanggung jawab: nentuin shift aktif + tanggal row DB + jam mulai shift,
// berdasarkan jam WIB sekarang dan shift_scheme (2 atau 3) satu line.
//
// Diextract dari routes/dashboard.js (awalnya didefinisikan inline di situ)
// supaya bisa dipakai bareng sama routes/api-external.js tanpa duplikasi.
//
// ⚠️ Value kolom `shift` di DB bentuknya "Shift 1 (2 Shift)",
//  "Shift 2 (3 Shift)", dst — ada suffix scheme.
//
// ⚠️ SEMUA JAM SHIFT (2-shift MAUPUN 3-shift) + THRESHOLD "not running"
// SEKARANG full via ENV VAR — GAK ADA LAGI jam yang hardcode di file ini.
// Ganti jam shift = ganti .env + restart, GAK PERLU ubah kode/logic sama
// sekali. Semua ada default (jam Hirose Internal) biar instance yang
// belum di-set env var tetap jalan kayak sebelumnya (backward compatible).
//
// 2-SHIFT (beda per tempat — tiap lokasi deploy instance sendiri-sendiri,
// lihat catatan arsitektur di config/sources.js):
//   SHIFT2_START_HOUR=7            (default: Internal 07:00)
//   SHIFT2_END_HOUR_WEEKDAY=16     (default: Internal 16:00)
//   SHIFT2_END_HOUR_FRIDAY=17      (default: Internal 17:00, Jumat lebih pendek)
//   SHIFT2_NIGHT_START_HOUR=22     (default: Internal 22:00)
//   Contoh buat SGP/Systech (12 jam rata, gak ada beda hari Jumat):
//     SHIFT2_START_HOUR=8 / SHIFT2_END_HOUR_WEEKDAY=20 /
//     SHIFT2_END_HOUR_FRIDAY=20 / SHIFT2_NIGHT_START_HOUR=20
//
// 3-SHIFT (BARU bisa dikonfig — sebelumnya hardcode 06:00/14:00/22:00
// buat SEMUA lokasi, gak ada cara ubah tanpa edit kode):
//   SHIFT3_START_HOUR=6            (default 06:00)
//   SHIFT3_SECOND_START_HOUR=14    (default 14:00)
//   SHIFT3_THIRD_START_HOUR=22     (default 22:00)
//
// THRESHOLD "line dianggap TIDAK RUNNING" (menit sejak shift mulai, kalau
// belum ada data SAMA SEKALI — sebelumnya hardcode 120):
//   LINE_NOT_RUNNING_THRESHOLD_MIN=120
const SHIFT2_START_HOUR = parseInt(process.env.SHIFT2_START_HOUR, 10) || 7;
const SHIFT2_END_HOUR_WEEKDAY =
  parseInt(process.env.SHIFT2_END_HOUR_WEEKDAY, 10) || 16;
const SHIFT2_END_HOUR_FRIDAY =
  parseInt(process.env.SHIFT2_END_HOUR_FRIDAY, 10) || 17;
const SHIFT2_NIGHT_START_HOUR =
  parseInt(process.env.SHIFT2_NIGHT_START_HOUR, 10) || 22;

const SHIFT3_START_HOUR = parseInt(process.env.SHIFT3_START_HOUR, 10) || 6;
const SHIFT3_SECOND_START_HOUR =
  parseInt(process.env.SHIFT3_SECOND_START_HOUR, 10) || 14;
const SHIFT3_THIRD_START_HOUR =
  parseInt(process.env.SHIFT3_THIRD_START_HOUR, 10) || 22;

function resolveShiftAndDate(nowWIB, scheme) {
  const dow = nowWIB.getUTCDay(); // 0=Sun ... 5=Fri
  const hour = nowWIB.getUTCHours();
  let shiftNum;
  let useYesterday = false;
  let startHour;

  if (scheme === 3) {
    if (hour >= SHIFT3_START_HOUR && hour < SHIFT3_SECOND_START_HOUR) {
      shiftNum = 1;
      startHour = SHIFT3_START_HOUR;
    } else if (hour >= SHIFT3_SECOND_START_HOUR && hour < SHIFT3_THIRD_START_HOUR) {
      shiftNum = 2;
      startHour = SHIFT3_SECOND_START_HOUR;
    } else {
      // Shift 3 — dari SHIFT3_THIRD_START_HOUR sampai SHIFT3_START_HOUR
      // besoknya (lewat tengah malam)
      shiftNum = 3;
      startHour = SHIFT3_THIRD_START_HOUR;
      if (hour < SHIFT3_START_HOUR) useYesterday = true; // tengah malam, row-nya tanggal kemarin
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
// SAMA SEKALI, padahal udah lewat sekian menit dari jam mulai shift.
// Di bawah threshold dianggap wajar (operator belum sempat input/submit
// form), jadi gak di-flag. Configurable via .env:
//   LINE_NOT_RUNNING_THRESHOLD_MIN=120  (default 120 kalau gak diisi)
const NOT_RUNNING_THRESHOLD_MIN =
  parseInt(process.env.LINE_NOT_RUNNING_THRESHOLD_MIN, 10) || 120;

function isLineNotRunning(nowWIB, shiftStartWIB) {
  const elapsedMin = (nowWIB.getTime() - shiftStartWIB.getTime()) / 60_000;
  return elapsedMin > NOT_RUNNING_THRESHOLD_MIN;
}

module.exports = {
  resolveShiftAndDate,
  isLineNotRunning,
  NOT_RUNNING_THRESHOLD_MIN,
};