// Tanggung jawab: baca registry line dari data/lines.json — SATU tempat,
// dipakai bareng routes/dashboard.js, routes/lines.js, dan routes/api-external.js.
//
// Registry disimpan di FILE, BUKAN DI DATABASE, sengaja dipisah dari DB
// ConMas (vendor) supaya:
//   - Gak pernah bikin/ubah objek apa pun di database vendor
//   - Tetap jalan sama persis walau .env diganti nunjuk ke DB mana pun
//     (local dev / server kantor), karena file ini nempel di server
//     backend, gak di database.

const fs = require("fs");
const path = require("path");

const LINES_FILE = path.join(__dirname, "..", "data", "lines.json");

function readLines() {
  try {
    return JSON.parse(fs.readFileSync(LINES_FILE, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return []; // file belum ada -> anggap kosong
    throw err;
  }
}

function writeLines(lines) {
  fs.mkdirSync(path.dirname(LINES_FILE), { recursive: true });
  fs.writeFileSync(LINES_FILE, JSON.stringify(lines, null, 2), "utf8");
}

// Semua line aktif
function getAllLines() {
  return readLines().filter((l) => l.active);
}

// Config 1 line spesifik. null kalau gak ketemu/nonaktif.
function getLineConfig(lineCode) {
  return readLines().find((l) => l.line_code === lineCode && l.active) || null;
}

module.exports = { LINES_FILE, readLines, writeLines, getAllLines, getLineConfig };
