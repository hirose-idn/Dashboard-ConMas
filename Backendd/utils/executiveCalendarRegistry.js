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

// Berapa hari kerja yang UDAH LEWAT s.d. HARI INI (WIB) — PASTI, dihitung
// tanggal beneran (bukan estimasi lagi).
//   - Bulan yang diliat < bulan berjalan -> udah kelar semua (= workingDays penuh)
//   - Bulan yang diliat > bulan berjalan -> belum mulai (0)
//   - Bulan yang diliat = bulan berjalan -> hitung tanggal 1 s.d. HARI INI
function getElapsedWorkingDays(year, month, liburDates) {
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  const curYear = wib.getUTCFullYear();
  const curMonth = wib.getUTCMonth() + 1;
  const curDay = wib.getUTCDate();

  const totalDays = daysInMonth(year, month);
  const workingDays = Math.max(totalDays - (liburDates?.length || 0), 0);

  if (year < curYear || (year === curYear && month < curMonth)) {
    return workingDays; // bulan lampau
  }
  if (year > curYear || (year === curYear && month > curMonth)) {
    return 0; // bulan depan, belum jalan
  }

  const liburSet = new Set(liburDates || []);
  let elapsed = 0;
  for (let d = 1; d <= Math.min(curDay, totalDays); d++) {
    const dateStr = toDateStr(year, month, d);
    if (!liburSet.has(dateStr)) elapsed++;
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
};