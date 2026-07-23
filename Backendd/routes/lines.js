const express = require("express");
const router = express.Router();

// -----------------------------------------------------------------
//  Registry line - DISIMPAN DI FILE (data/lines.json), BUKAN DI
//  DATABASE. Sengaja dipisah dari DB ConMas (vendor) supaya:
//    - Gak pernah bikin/ubah objek apa pun di database vendor
//    - Tetap jalan sama persis walau .env diganti nunjuk ke DB mana
//      pun (local dev / server kantor), karena file ini nempel di
//      server backend, gak di database.
//  Nambah line baru = POST ke endpoint ini (atau edit file ini
//  manual), TANPA perlu migrasi/DDL apa pun ke DB vendor.
//
//  Baca/tulisnya sekarang lewat utils/linesRegistry.js, biar 1 sumber
//  yang sama dipakai bareng routes/dashboard.js & routes/api-external.js.
// -----------------------------------------------------------------

const { readLines, writeLines } = require("../utils/linesRegistry");
const {
  discoverLinesFromDB,
  syncLinesFromDB,
} = require("../services/lineDiscoveryService");

// GET /api/lines/discover?days=90 - PREVIEW line yang ADA DI DATABASE
// tapi BELUM terdaftar di lines.json. Gak nulis apa-apa, cuma nampilin.
// Dipanggil terpisah dari /sync supaya user bisa cek dulu sebelum nambah.
router.get("/discover", async (req, res) => {
  try {
    const days = Number(req.query.days) || 90;
    const discovered = await discoverLinesFromDB(days);
    res.json({ success: true, data: discovered, days });
  } catch (err) {
    console.error("GET /lines/discover ERROR:", err.message);
    res
      .status(500)
      .json({
        success: false,
        message: "Gagal cek line baru di database",
        error: err.message,
      });
  }
});

// POST /api/lines/sync?days=90 - EKSEKUSI: tambahin semua line yang
// ketemu di /discover langsung ke lines.json (description dikosongin,
// shift_scheme ditebak otomatis dari kolom shift di DB — edit manual
// belakangan kalau perlu lewat POST /api/lines biasa).
router.post("/sync", async (req, res) => {
  try {
    const days = Number(req.query.days) || 90;
    const added = await syncLinesFromDB(days);
    res.json({
      success: true,
      message: added.length
        ? `${added.length} line baru ditambahkan.`
        : "Gak ada line baru, registry udah lengkap.",
      data: added,
    });
  } catch (err) {
    console.error("POST /lines/sync ERROR:", err.message);
    res
      .status(500)
      .json({
        success: false,
        message: "Gagal sync line dari database",
        error: err.message,
      });
  }
});

// GET /api/lines - daftar semua line aktif
router.get("/", (req, res) => {
  try {
    const lines = readLines()
      .filter((l) => l.active)
      .sort((a, b) => a.line_code.localeCompare(b.line_code));
    res.json({ success: true, data: lines });
  } catch (err) {
    console.error("GET /lines ERROR:", err.message);
    res
      .status(500)
      .json({
        success: false,
        message: "Gagal ambil daftar line",
        error: err.message,
      });
  }
});

// POST /api/lines - tambah / update line
router.post("/", (req, res) => {
  try {
    const { line_code, description, shift_scheme, tempat } = req.body;

    if (!line_code || typeof line_code !== "string" || !line_code.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "line_code wajib diisi" });
    }
    const scheme = Number(shift_scheme);
    if (scheme !== 2 && scheme !== 3) {
      return res
        .status(400)
        .json({ success: false, message: "shift_scheme harus 2 atau 3" });
    }
    const VALID_TEMPAT = ["Internal", "SGP", "Systech"];
    const tempatVal = tempat || "Internal";
    if (!VALID_TEMPAT.includes(tempatVal)) {
      return res
        .status(400)
        .json({
          success: false,
          message: `tempat harus salah satu dari: ${VALID_TEMPAT.join(", ")}`,
        });
    }

    const code = line_code.trim();
    const lines = readLines();
    const idx = lines.findIndex((l) => l.line_code === code);
    const entry = {
      line_code: code,
      description: description || null,
      shift_scheme: scheme,
      tempat: tempatVal,
      active: true,
      created_at: idx >= 0 ? lines[idx].created_at : new Date().toISOString(),
    };

    if (idx >= 0) lines[idx] = entry;
    else lines.push(entry);

    writeLines(lines);
    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    console.error("POST /lines ERROR:", err.message);
    res
      .status(500)
      .json({
        success: false,
        message: "Gagal tambah line",
        error: err.message,
      });
  }
});

// DELETE /api/lines/:line_code - nonaktifkan line (soft delete)
router.delete("/:line_code", (req, res) => {
  try {
    const lines = readLines();
    const idx = lines.findIndex((l) => l.line_code === req.params.line_code);
    if (idx === -1) {
      return res
        .status(404)
        .json({ success: false, message: "Line tidak ditemukan" });
    }
    lines[idx].active = false;
    writeLines(lines);
    res.json({
      success: true,
      message: `Line ${req.params.line_code} dinonaktifkan`,
    });
  } catch (err) {
    console.error("DELETE /lines ERROR:", err.message);
    res
      .status(500)
      .json({
        success: false,
        message: "Gagal nonaktifkan line",
        error: err.message,
      });
  }
});

module.exports = router;
