/**
 * Format angka ke locale Indonesia.
 * Kalau null/undefined/NaN → return '—'
 */
export function fmt(value, dec = 0) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (isNaN(n)) return "—";
  return dec > 0
    ? parseFloat(n.toFixed(dec)).toLocaleString("id-ID")
    : n.toLocaleString("id-ID");
}

/**
 * "Sekarang" dalam WIB sebagai objek Date — SELALU pakai offset +7 manual,
 * BUKAN new Date() polos (yang notabene ikut timezone device/browser yang
 * buka dashboard, bisa salah kalau device-nya gak disetel Asia/Jakarta).
 *
 * Cara pakainya: baca lewat getUTCxxx() (getUTCHours, getUTCDate,
 * getUTCMonth, getUTCFullYear, getUTCDay, dst) — JANGAN pakai getHours()
 * dkk tanpa "UTC", karena itu bakal balik lagi ke timezone lokal device.
 */
export function getNowWIB() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

/**
 * Konversi timestamp backend ke date string WIB (YYYY-MM-DD)
 */
export function toWIBDateStr(ts) {
  const d = new Date(ts);
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return [
    wib.getUTCFullYear(),
    String(wib.getUTCMonth() + 1).padStart(2, "0"),
    String(wib.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Tanggal hari ini WIB sebagai string YYYY-MM-DD
 */
export function getTodayWIB() {
  return getNowWIB().toISOString().slice(0, 10);
}

/**
 * Shift aktif berdasarkan jam WIB (bukan jam lokal browser)
 * Shift 1 = 07:00–22:00, Shift 2 = 22:00–07:00
 */
export function getActiveShift() {
  const h = getNowWIB().getUTCHours();
  return h >= 7 && h < 22 ? "Shift 1" : "Shift 2";
}
