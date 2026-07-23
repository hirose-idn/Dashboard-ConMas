// Tanggung jawab: semua logika shift (label, slot aktif, hari) — satu tempat.

const { TREND_PERIODS } = require('../config/columns');

// Jam WIB dari timestamp UTC
function toWIBHour(ts) {
  const wib = new Date(new Date(ts).getTime() + 7 * 3600 * 1000);
  return wib.getUTCHours();
}

// Tentukan label shift dari timestamp — "Shift 1" atau "Shift 2"
function getShiftLabel(tanggal) {
  const h = toWIBHour(tanggal);
  return h >= 7 && h < 22 ? 'Shift 1' : 'Shift 2';
}

// Tentukan shift aktif saat ini (dipanggil tanpa argumen)
function getActiveShift() {
  const h = toWIBHour(new Date());
  return h >= 7 && h < 22 ? 'Shift 1' : 'Shift 2';
}

// Pilih view ID shift 1 berdasarkan DOW (5=Jumat → 13460, lainnya → 13459)
function getShift1ViewId(dow) {
  return Number(dow) === 5 ? '13460' : '13459';
}

// Slot trend yang sudah lewat berdasarkan jam WIB sekarang
// Dipakai untuk menyembunyikan slot yang belum ada data
function getActiveTrendSlots(viewId) {
  const periods = TREND_PERIODS[viewId] || [];
  const h = toWIBHour(new Date());

  // Mapping jam WIB → index slot
  // Shift 1: 07=0, 08=1, ..., 15=8
  // Shift 2: 22=0, 23=1, 00=2, ..., 06=7
  const isShift2 = viewId === '13461';
  let currentIndex;

  if (isShift2) {
    if (h >= 22)      currentIndex = h - 22;       // 22=0, 23=1
    else if (h < 7)   currentIndex = h + 2;        // 00=2, 01=3, ..., 06=8
    else              currentIndex = periods.length; // siang hari → semua slot lewat
  } else {
    if (h >= 7 && h <= 16) currentIndex = h - 7;   // 07=0, 08=1, ..., 15=8
    else                   currentIndex = periods.length;
  }

  return new Set(periods.slice(0, currentIndex + 1).map(p => p.label));
}

module.exports = { getShiftLabel, getActiveShift, getShift1ViewId, getActiveTrendSlots };
