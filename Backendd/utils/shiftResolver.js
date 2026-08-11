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

// Beda sama NOT_RUNNING_THRESHOLD_MIN di atas (itu buat TENGAH shift — line
// sempet jalan terus berhenti). Ini KHUSUS buat AWAL shift — row buat shift
// aktif belum ada SAMA SEKALI, masih wajar operator belom sempet input
// (serah-terima shift, setup, ganti produk — durasinya beda-beda tiap line,
// gak bisa dipukul rata). Configurable KEPISAH per .env instance, default
// disamain ke NOT_RUNNING_THRESHOLD_MIN kalau gak diisi eksplisit (biar
// behavior lama gak berubah tiba-tiba pas upgrade):
//   LINE_START_GRACE_MIN=30   (contoh: line yang emang biasa cepet mulai)
const START_GRACE_MIN =
  parseInt(process.env.LINE_START_GRACE_MIN, 10) || NOT_RUNNING_THRESHOLD_MIN;

function isLineNotRunning(nowWIB, shiftStartWIB) {
  const elapsedMin = (nowWIB.getTime() - shiftStartWIB.getTime()) / 60_000;
  return elapsedMin > NOT_RUNNING_THRESHOLD_MIN;
}

// ─────────────────────────────────────────────────────────────
// getLineStatus3 — versi 3-state dari isLineNotRunning/isRowStale di bawah.
// Dulu cuma 2 state (Running/Tidak Running), dan kasus "row belum ada tapi
// masih di bawah threshold" ke-lumped jadi "Running" — padahal jujurnya itu
// "belum ketauan", bukan "udah confirmed jalan". State "waiting" ini yang
// benerin itu, pake threshold KEPISAH (START_GRACE_MIN) biar gak numpang di
// angka yang sama kayak stale-check tengah shift.
//
//   - row belum ada, masih di bawah START_GRACE_MIN     -> "waiting"
//   - row belum ada, udah lewat START_GRACE_MIN          -> "not_running"
//   - row ada, isRowStale() true (berhenti di tengah)    -> "not_running"
//   - row ada, isRowStale() false                        -> "running"
function getLineStatus3({ hasRow, hourly, shiftStartWIB, nowWIB }) {
  if (!hasRow) {
    const elapsedMin = (nowWIB.getTime() - shiftStartWIB.getTime()) / 60_000;
    return elapsedMin > START_GRACE_MIN ? "not_running" : "waiting";
  }
  return isRowStale(hourly, shiftStartWIB, nowWIB) ? "not_running" : "running";
}

// ─────────────────────────────────────────────────────────────
// isRowStale — deteksi "row ADA tapi udah gak ada input BARU".
//
// Kenapa perlu: isLineNotRunning() di atas cuma nangkep kasus row-nya
// SAMA SEKALI belum ada. Tapi kalau line sempet ngirim data di awal shift
// terus mesin berhenti total, row buat shift itu tetep "ada" (match query
// line+shift+tanggal) walau udah gak ada input baru berjam-jam — jadi
// selama ini kebaca "Running" terus, padahal harusnya "Tidak Running".
//
// Caranya: DB nyimpen output_actual PER JAM (kolom hourly, lihat HOURLY di
// routes/dashboard.js). Jalan dari jam mulai shift s.d. (sekarang minus
// threshold), kalau SEMUA jam yang "seharusnya udah kelar" itu masih
// kosong actual-nya sama sekali, berarti gak ada input baru masuk >
// threshold menit — flag TIDAK RUNNING walau row-nya ada.
//
// ⚠️ Batasan yang disengaja: ini heuristik dari data per-jam, BUKAN
// timestamp "terakhir diupdate" beneran (kolom itu gak ada di DB vendor).
// Kalau suatu jam emang WAJAR kosong (misal jam istirahat/ganti shift),
// itu ikut kehitung "kosong" juga — tapi karena yang dicek itu SEMUA jam
// yang due, bukan cuma 1 jam terakhir, resiko false-positive dari 1 jam
// istirahat doang kecil (masih ke-cover sama jam lain yang beneran ada
// data). Dibatasi max 20 iterasi jaga-jaga shift super panjang/edge case.
function hourToLabel(hour) {
  if (hour === 0) return "24-1"; // jam 00:xx dilabelin "24-1" di DB, bukan "00-01"
  const start = String(hour).padStart(2, "0");
  const end = hour + 1;
  return `${start}-${end === 24 ? "24" : String(end).padStart(2, "0")}`;
}

function isRowStale(hourly, shiftStartWIB, nowWIB, thresholdMin = NOT_RUNNING_THRESHOLD_MIN) {
  const cutoff = new Date(nowWIB.getTime() - thresholdMin * 60_000);
  let anyDueSlot = false;
  let anyDueSlotHasData = false;

  for (let i = 0; i < 20; i++) {
    const slotStart = new Date(shiftStartWIB.getTime() + i * 3_600_000);
    if (slotStart >= cutoff) break; // jam ini belum "due" — masih wajar kosong

    const label = hourToLabel(slotStart.getUTCHours());
    const entry = hourly.find((h) => h.slot === label);
    anyDueSlot = true;
    if (entry && entry.output_actual != null) anyDueSlotHasData = true;
  }

  // Belum ada jam yang "due" sama sekali (baru mulai shift) → jangan flag
  // stale di sini, biarin isLineNotRunning() yang urus kasus itu.
  return anyDueSlot && !anyDueSlotHasData;
}

const SHIFT_LABEL_RE = /Shift\s*(\d)\s*\((\d)\s*Shift\)/i;

// Parse literal kolom shift dari DB, misal "Shift 2 (3 Shift)" ->
// { shiftNum: 2, scheme: 3 }. null kalau formatnya gak dikenali.
function parseShiftLabel(shiftText) {
  const m = SHIFT_LABEL_RE.exec(String(shiftText || ""));
  if (!m) return null;
  return { shiftNum: Number(m[1]), scheme: Number(m[2]) };
}

// Kebalikan dari resolveShiftAndDate: dikasih tanggal kalender row (string
// "YYYY-MM-DD", persis kayak yang tersimpan di kolom tanggal DB) + scheme +
// shiftNum HASIL BACA LANGSUNG dari row itu sendiri (bukan tebakan config),
// hitung jam mulai/selesai shift itu. Dipakai buat nentuin row mana yang
// paling "aktif sekarang" TANPA butuh shift_scheme dari lines.json sama
// sekali — jadi imun dari salah tebak scheme atau selisih jam antar line.
function shiftWindowFromLabel(calendarDate, scheme, shiftNum) {
  const [y, mo, d] = calendarDate.split("-").map(Number);
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  let startHour, endHour, endNextDay = false;

  if (scheme === 3) {
    if (shiftNum === 1) {
      startHour = SHIFT3_START_HOUR;
      endHour = SHIFT3_SECOND_START_HOUR;
    } else if (shiftNum === 2) {
      startHour = SHIFT3_SECOND_START_HOUR;
      endHour = SHIFT3_THIRD_START_HOUR;
    } else {
      startHour = SHIFT3_THIRD_START_HOUR;
      endHour = SHIFT3_START_HOUR;
      endNextDay = true;
    }
  } else {
    if (shiftNum === 2) {
      startHour = SHIFT2_NIGHT_START_HOUR;
      endHour = SHIFT2_START_HOUR;
      endNextDay = true;
    } else {
      startHour = SHIFT2_START_HOUR;
      endHour = dow === 5 ? SHIFT2_END_HOUR_FRIDAY : SHIFT2_END_HOUR_WEEKDAY;
    }
  }

  const startWIB = new Date(Date.UTC(y, mo - 1, d, startHour, 0, 0));
  const endWIB = new Date(Date.UTC(y, mo - 1, d + (endNextDay ? 1 : 0), endHour, 0, 0));
  return { startWIB, endWIB };
}

// Dari sekumpulan row kandidat (hasil query line+tanggal TANPA filter shift,
// biasanya row hari ini + kemarin biar shift yang lewat tengah malam ikut
// kecover), pilih SATU row yang paling relevan buat "kondisi sekarang":
//   1. Row yang jam-nya (dihitung dari shift TEXT row itu sendiri) lagi
//      MENCAKUP waktu sekarang → itu yang dipakai.
//   2. Kalau gak ada yang pas (gap antar shift), pilih yang paling BARU
//      selesai.
//   3. Row yang shift text-nya gak kebaca format-nya (rusak/kosong)
//      diabaikan dari perbandingan jam, tapi tetap dianggap "ada data".
// shiftCol: nama key di row yang isinya literal kolom shift DB.
function pickActiveRow(rows, nowWIB, shiftCol = "shift") {
  if (!rows || rows.length === 0) return null;

  let current = null;
  let mostRecentEnded = null;

  for (const row of rows) {
    const parsed = parseShiftLabel(row[shiftCol]);
    if (!parsed) continue;
    const tanggalStr =
      row.tanggal instanceof Date
        ? row.tanggal.toISOString().slice(0, 10)
        : String(row.tanggal).slice(0, 10);
    const { startWIB, endWIB } = shiftWindowFromLabel(
      tanggalStr,
      parsed.scheme,
      parsed.shiftNum,
    );
    if (nowWIB >= startWIB && nowWIB < endWIB) {
      current = row;
      break;
    }
    if (endWIB <= nowWIB && (!mostRecentEnded || endWIB > mostRecentEnded._end)) {
      mostRecentEnded = row;
      mostRecentEnded._end = endWIB;
    }
  }

  if (current) return current;
  if (mostRecentEnded) {
    delete mostRecentEnded._end;
    return mostRecentEnded;
  }
  // Gak ada row yang shift text-nya kebaca — fallback ke row pertama
  // apa adanya biar tetap ada data ketimbang kosong total.
  return rows[0];
}

module.exports = {
  resolveShiftAndDate,
  isLineNotRunning,
  isRowStale,
  getLineStatus3,
  NOT_RUNNING_THRESHOLD_MIN,
  START_GRACE_MIN,
  parseShiftLabel,
  shiftWindowFromLabel,
  pickActiveRow,
};