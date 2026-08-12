// Tanggung jawab: registry KALENDER KERJA per bulan, PER TEMPAT — planner
// klik tanggal mana aja yang LIBUR (bukan ketik/pilih total angka lagi).
// GANTIKAN workingDaysRegistry.js (total manual) DAN workCalendarRegistry.js
// versi sebelumnya (1 kalender gabungan buat semua tempat).
//
// Kenapa balik ke tanggal spesifik: "hari kerja yang udah lewat" jadi
// PASTI (dihitung dari tanggal beneran), bukan estimasi proporsional kayak
// skema Total Hari Kerja doang.
//
// DEFAULT: kalau planner belum pernah nyimpen buat 1 tempat+bulan, Sabtu &
// Minggu OTOMATIS keitung libur (default masuk akal) — planner tinggal
// klik tambahan libur nasional/cuti bersama, atau un-klik weekend kalau
// tempat itu ternyata kerja Sabtu. Sekali di-Simpan, daftar itu yang
// dipakai (bukan default lagi).
//
// Disimpan di FILE (data/executiveCalendar.json) — pola planner-editable,
// sengaja dipisah dari DB ConMas.

const fs = require("fs");
const path = require("path");

const CALENDAR_FILE = path.join(__dirname, "..", "data", "executiveCalendar.json");

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(CALENDAR_FILE, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

function writeAll(rows) {
  fs.mkdirSync(path.dirname(CALENDAR_FILE), { recursive: true });
  fs.writeFileSync(CALENDAR_FILE, JSON.stringify(rows, null, 2), "utf8");
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

// Date.UTC — SENGAJA bukan `new Date(year, month-1, day)` biar gak kena
// geser timezone server. 0 = Minggu, 6 = Sabtu.
function isWeekend(year, month, day) {
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dow === 0 || dow === 6;
}

function toDateStr(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Default kalau planner belum pernah nyetel: semua Sabtu/Minggu di bulan
// itu otomatis "libur".
function defaultLiburDates(year, month) {
  const total = daysInMonth(year, month);
  const dates = [];
  for (let d = 1; d <= total; d++) {
    if (isWeekend(year, month, d)) dates.push(toDateStr(year, month, d));
  }
  return dates;
}

function isValidDateInMonth(dateStr, year, month) {
  if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m] = dateStr.split("-").map(Number);
  return y === year && m === month;
}

// Kalender 1 tempat di 1 bulan. Kalau belum pernah disave, pakai default
// weekend (isDefault: true) — planner masih bisa nge-klik ubah, baru
// beneran kesimpen pas Simpan ditekan.
function getEntry(year, month, tempat) {
  const row = readAll().find((r) => r.year === year && r.month === month && r.tempat === tempat);
  const totalDays = daysInMonth(year, month);
  const liburDates = row ? row.liburDates : defaultLiburDates(year, month);
  return {
    year,
    month,
    tempat,
    liburDates,
    isDefault: !row,
    totalDays,
    workingDays: Math.max(totalDays - liburDates.length, 0),
  };
}

// Overwrite daftar libur 1 tempat 1 bulan (planner kirim daftar LENGKAP
// tiap save, bukan append). Boleh tanggal apa aja dalam bulan itu —
// termasuk weekend, kalau planner sengaja mau un-klik weekend (site kerja
// Sabtu misalnya).
function setLiburDates({ year, month, tempat, liburDates }) {
  if (!year || !month || month < 1 || month > 12) {
    throw new Error("year & month wajib diisi (month 1-12)");
  }
  if (!tempat) {
    throw new Error("tempat wajib diisi");
  }
  const clean = [...new Set(Array.isArray(liburDates) ? liburDates : [])]
    .filter((d) => isValidDateInMonth(d, year, month))
    .sort();

  const rows = readAll();
  const idx = rows.findIndex((r) => r.year === year && r.month === month && r.tempat === tempat);
  const record = { year, month, tempat, liburDates: clean, updatedAt: new Date().toISOString() };
  if (idx >= 0) rows[idx] = record;
  else rows.push(record);
  writeAll(rows);
  return getEntry(year, month, tempat);
}

// ============================================================================
// DAILY TARGET PACING — v2 (hourly bucket, shift-ownership aware)
// ============================================================================
// Ganti total pendekatan lama (yang motong shift malam di tengah malam /
// pembagi "17 jam" & "24 jam"). Sekarang:
//
//   SUBCONT (SGP/Systech): kalender 24 jam POLOS, GAK pakai shift sama
//   sekali. Progress = jam yang UDAH PENUH LEWAT hari ini / 24.
//
//   INTERNAL (Hirose): shift-aware. Shift 1 = 07:00–16:00 (9 jam), Shift
//   2 = 22:00–07:00 BESOK (9 jam), total 18 jam. Shift malam itu MILIK
//   TANGGAL SAAT DIA MULAI — jadi jam 00:00–06:59 pada tanggal D itu
//   sebenernya masih lanjutan target tanggal D-1 (BUKAN awal target D).
//   Tanggal D baru mulai jalan (progress 0%) persis jam 07:00.
//
// Kedua-duanya pakai HOURLY BUCKET: target cuma naik sekali tiap jam
// PENUH lewat (misal jam 10:15 s.d 10:59 pakai posisi jam 10, baru naik
// pas 11:00) — BUKAN interpolasi menit real-time.
// ============================================================================

// Ambil { year, month, day, hour } versi WIB (Asia/Jakarta, UTC+7) dari
// waktu sekarang — SENGAJA pakai trik "+7 jam lalu baca getUTC*()" biar
// hasilnya PASTI WIB, gak peduli timezone server jalan di mana (UTC,
// local Indonesia, dst). `hour` di-floor (jam PENUH 0-23), sesuai aturan
// hourly bucket — menit diabaikan.
function nowWIB() {
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  return {
    year: wib.getUTCFullYear(),
    month: wib.getUTCMonth() + 1,
    day: wib.getUTCDate(),
    hour: wib.getUTCHours(), // 0-23, integer (menit sengaja dibuang)
  };
}

// Tanggal (Date, UTC-anchored biar aman dibandingin) mundur/maju N hari
// dari {year,month,day}.
function shiftDate(year, month, day, deltaDays) {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// Bandingin 2 tanggal {year,month,day} -> -1 (a<b), 0 (sama), 1 (a>b).
function compareDate(a, b) {
  if (a.year !== b.year) return a.year < b.year ? -1 : 1;
  if (a.month !== b.month) return a.month < b.month ? -1 : 1;
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  return 0;
}

// ---- SUBCONT (SGP/Systech): kalender 24 jam, gak ada shift, gak ada freeze.
function subcontProgress(hour) {
  const completed = Math.max(0, Math.min(24, Math.floor(hour)));
  return completed / 24;
}

// ---- INTERNAL (Hirose): shift-aware, 18 jam total, hourly bucket.
// Return { dateOffsetDays, progress }:
//   dateOffsetDays = 0   -> activeTargetDate = HARI INI
//   dateOffsetDays = -1  -> activeTargetDate = KEMARIN (masih ekor shift 2 kemarin)
function internalProgressForHour(hour) {
  const h = Math.max(0, Math.min(23, Math.floor(hour)));
  if (h >= 7 && h <= 15) {
    // Shift 1 (07:00-16:00) sedang jalan -> completed 0..8
    return { dateOffsetDays: 0, progress: (h - 7) / 18 };
  }
  if (h >= 16 && h <= 21) {
    // Break antar shift (16:00-22:00) -> FREEZE di 50% (9/18)
    return { dateOffsetDays: 0, progress: 9 / 18 };
  }
  if (h >= 22 && h <= 23) {
    // Shift 2 (22:00-24:00) baru mulai -> completed 9..10
    return { dateOffsetDays: 0, progress: (h - 13) / 18 };
  }
  // h 0..6 -> masih ekor Shift 2 KEMARIN (22:00 kemarin - 07:00 hari ini)
  return { dateOffsetDays: -1, progress: (h + 11) / 18 };
}

// activeTargetDate = tanggal yang target-nya LAGI JALAN sekarang, + berapa
// persen progress-nya. Ini yang jadi acuan tunggal buat agregasi bulanan
// di bawah — gak peduli tempat-nya subcont atau internal, keduanya
// dibungkus jadi bentuk yang sama: { date: {year,month,day}, progress }.
function getActiveTarget(tempat) {
  const now = nowWIB();
  const isInternal = tempat === "internal";

  if (!isInternal) {
    // SGP/Systech: activeTargetDate SELALU hari ini (gak ada shift-ownership).
    return { date: { year: now.year, month: now.month, day: now.day }, progress: subcontProgress(now.hour) };
  }

  const { dateOffsetDays, progress } = internalProgressForHour(now.hour);
  const date = dateOffsetDays === 0
    ? { year: now.year, month: now.month, day: now.day }
    : shiftDate(now.year, now.month, now.day, dateOffsetDays);
  return { date, progress };
}

// Berapa "hari kerja" yang UDAH LEWAT dalam bulan `year`/`month` yang
// diminta, dalam satuan pecahan (fractional working-day units) — dipakai
// buat `targetHariIni = dailyTarget * elapsedWorkingDays` di executive.js.
//
// Aturan (final, sesuai spec):
//   tanggal < activeTargetDate  -> full 1 (0 kalau tanggal itu libur)
//   tanggal == activeTargetDate -> `progress` (0 kalau activeTargetDate libur)
//   tanggal > activeTargetDate  -> 0
//
// Perbandingan tanggal PAKAI TANGGAL LENGKAP (year+month+day), jadi kasus
// lintas-bulan (activeTargetDate di bulan lain dari `year`/`month` yang
// diminta) otomatis kebereskan TANPA branch khusus:
//   - activeTargetDate di bulan SEBELUMNYA dari yang diminta -> semua
//     tanggal di bulan yang diminta > activeTargetDate -> hasil 0 semua.
//   - activeTargetDate di bulan SESUDAHNYA dari yang diminta (liat bulan
//     lampau) -> semua tanggal < activeTargetDate -> full semua (workingDays).
function getElapsedWorkingDays(year, month, liburDates, tempat) {
  const totalDays = daysInMonth(year, month);
  const liburSet = new Set(liburDates || []);
  const { date: activeDate, progress } = getActiveTarget(tempat);

  let elapsed = 0;
  for (let d = 1; d <= totalDays; d++) {
    const cmp = compareDate({ year, month, day: d }, activeDate);
    const dateStr = toDateStr(year, month, d);
    if (cmp < 0) {
      if (!liburSet.has(dateStr)) elapsed += 1;
    } else if (cmp === 0) {
      if (!liburSet.has(dateStr)) elapsed += progress;
    }
    // cmp > 0 -> belum mulai, +0
  }
  return elapsed;
}

module.exports = {
  CALENDAR_FILE,
  daysInMonth,
  isWeekend,
  defaultLiburDates,
  getEntry,
  setLiburDates,
  getElapsedWorkingDays,
  // di-export buat keperluan testing/debug boundary jam
  getActiveTarget,
  subcontProgress,
  internalProgressForHour,
};