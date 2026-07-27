// Tanggung jawab: baca/tulis target & actual manual buat Executive
// Dashboard — SATU tempat, dipakai routes/executive.js.
//
// SENGAJA disimpan di FILE (bukan database) — sama alasannya kayak
// utils/linesRegistry.js: fitur ini KHUSUS instance Internal, belum ada
// sumber data otomatis buat angka-angka ini (planner input manual per
// bulan), jadi belum butuh database. Kalau nanti "Actual" mau ditarik
// otomatis dari data produksi asli, tinggal ganti cara BACA-nya di
// routes/executive.js — struktur file & endpoint di luar itu gak perlu
// berubah.
//
// Format tiap entry: { year, month (1-12), tempat, target, actual }
// tempat: "internal" | "sgp" | "systech" — SELALU 3-3nya walau fitur ini
// cuma keliatan/bisa diedit dari instance Internal (poin ini beda dari
// lines.json yang isinya cuma line milik instance itu sendiri).

const fs = require("fs");
const path = require("path");

const TARGETS_FILE = path.join(
  __dirname,
  "..",
  "data",
  "executiveTargets.json",
);

const VALID_TEMPAT = ["internal", "sgp", "systech"];

function readTargets() {
  try {
    return JSON.parse(fs.readFileSync(TARGETS_FILE, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return []; // file belum ada -> anggap kosong
    throw err;
  }
}

function writeTargets(entries) {
  fs.mkdirSync(path.dirname(TARGETS_FILE), { recursive: true });
  fs.writeFileSync(TARGETS_FILE, JSON.stringify(entries, null, 2), "utf8");
}

// Semua entry buat 1 tahun (dipakai buat Trend Performance per tahun)
function getYear(year) {
  return readTargets().filter((e) => e.year === Number(year));
}

// Entry buat 1 bulan spesifik, 3 lokasi (dipakai buat Achievement Ranking)
function getMonth(year, month) {
  return readTargets().filter(
    (e) => e.year === Number(year) && e.month === Number(month),
  );
}

// Upsert 1 entry (year+month+tempat itu kuncinya, cuma boleh 1 baris)
function upsertEntry({ year, month, tempat, target, actual }) {
  if (!VALID_TEMPAT.includes(tempat)) {
    throw new Error(`tempat harus salah satu dari: ${VALID_TEMPAT.join(", ")}`);
  }
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) {
    throw new Error("year gak valid");
  }
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error("month harus 1-12");
  }

  const entries = readTargets();
  const idx = entries.findIndex(
    (e) => e.year === y && e.month === m && e.tempat === tempat,
  );
  const record = {
    year: y,
    month: m,
    tempat,
    target: Number(target) || 0,
    actual: Number(actual) || 0,
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) {
    entries[idx] = record;
  } else {
    entries.push(record);
  }
  writeTargets(entries);
  return record;
}

module.exports = {
  TARGETS_FILE,
  VALID_TEMPAT,
  readTargets,
  writeTargets,
  getYear,
  getMonth,
  upsertEntry,
};
