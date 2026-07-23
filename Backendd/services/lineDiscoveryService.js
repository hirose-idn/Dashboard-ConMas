// Tanggung jawab: nemuin line_code yang MUNCUL DI DATABASE ConMas tapi
// BELUM terdaftar di data/lines.json (registry manual) — akar masalah
// kenapa total di dashboard bisa lebih kecil dari total mentah di DB
// (line yang gak kedaftar otomatis gak ikut ke-sum di endpoint mana pun,
// karena semua query loop lewat getAllLines()).
//
// shift_scheme BISA ditebak otomatis, bukan asal tebak: kolom
// ${COLS.shift} isinya literal nulis scheme-nya sendiri, contoh
// "Shift 1 (2 Shift)" / "Shift 2 (3 Shift)" — lihat catatan di
// utils/shiftResolver.js. Tinggal di-regex.
//
// `description` TETAP DIKOSONGIN (null) kalau line baru ketemu — gak ada
// kolom "nama line" yang reliable di view ini, jadi biar user isi manual
// belakangan lewat form/endpoint lines yang udah ada.

const pool = require("../db");
const { VIEW, COLS } = require("../config/reportColumns");
const { readLines, writeLines } = require("../utils/linesRegistry");

const SHIFT_SCHEME_RE = /\((\d)\s*Shift\)/i;

// Cari semua line_code + shift distinct dalam N hari terakhir, terus
// tebak shift_scheme per line dari value shift yang paling sering muncul.
async function discoverLinesFromDB(days = 90) {
  const query = `
    SELECT DISTINCT ${COLS.line} AS line_code, ${COLS.shift} AS shift
    FROM ${VIEW}
    WHERE DATE(${COLS.tanggal}) >= (CURRENT_DATE - $1::int)
      AND ${COLS.line} IS NOT NULL
      AND TRIM(${COLS.line}::text) <> ''
  `;
  const result = await pool.query(query, [days]);

  // line_code -> { scheme -> count }
  const schemeVotes = new Map();
  for (const row of result.rows) {
    const code = String(row.line_code).trim();
    if (!code) continue;
    const match = SHIFT_SCHEME_RE.exec(String(row.shift || ""));
    const scheme = match ? Number(match[1]) : null;

    if (!schemeVotes.has(code)) schemeVotes.set(code, new Map());
    const votes = schemeVotes.get(code);
    votes.set(scheme, (votes.get(scheme) || 0) + 1);
  }

  const existing = readLines();
  const existingCodes = new Set(existing.map((l) => l.line_code));

  const discovered = [];
  for (const [code, votes] of schemeVotes) {
    if (existingCodes.has(code)) continue;

    let bestScheme = null;
    let bestCount = -1;
    for (const [scheme, count] of votes) {
      if (count > bestCount) {
        bestScheme = scheme;
        bestCount = count;
      }
    }

    discovered.push({
      line_code: code,
      suggested_shift_scheme: bestScheme || 2,
      low_confidence: bestScheme === null,
      records_seen: [...votes.values()].reduce((s, c) => s + c, 0),
    });
  }

  discovered.sort((a, b) => a.line_code.localeCompare(b.line_code));
  return discovered;
}

// "tempat" registry HARUS ngikutin identitas instance ini (SOURCE_NAME di
// .env), BUKAN hardcode "Internal" — soalnya tiap subcont (Internal/SGP/
// Systech) jalanin file lines.json-nya sendiri-sendiri di instance masing-
// masing. Kalau di-hardcode, line yang ke-sync di instance Systech bakal
// kelabelin "Internal" terus, salah pas dipake breakdown per-tempat di
// dashboard lokal (routes/dashboard.js summary-by-tempat dkk).
const SOURCE_TO_TEMPAT = {
  internal: "Internal",
  sgp: "SGP",
  systech: "Systech",
};
function resolveTempatFromEnv() {
  const key = (process.env.SOURCE_NAME || "internal").toLowerCase();
  return SOURCE_TO_TEMPAT[key] || "Internal";
}

// Jalanin discover, terus langsung tulis ke lines.json (tempat ngikutin
// SOURCE_NAME instance ini, active: true, description: null). Return line
// yang beneran ditambahin.
async function syncLinesFromDB(days = 90) {
  const discovered = await discoverLinesFromDB(days);
  if (discovered.length === 0) return [];

  const lines = readLines();
  const now = new Date().toISOString();
  const tempat = resolveTempatFromEnv();
  const added = [];

  for (const d of discovered) {
    const entry = {
      line_code: d.line_code,
      description: null,
      shift_scheme: d.suggested_shift_scheme,
      tempat,
      active: true,
      created_at: now,
      auto_discovered: true, // penanda: baru ke-add otomatis, belum di-review
    };
    lines.push(entry);
    added.push(entry);
  }

  writeLines(lines);
  return added;
}

module.exports = { discoverLinesFromDB, syncLinesFromDB };