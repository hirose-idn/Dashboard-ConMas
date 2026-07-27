const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const dashboardRoutes = require("./routes/dashboard");
const linesRoutes = require("./routes/lines");
const apiExternalRoutes = require("./routes/api-external");
const masterRoutes = require("./routes/master");
const syncRoutes = require("./routes/sync");
const executiveRoutes = require("./routes/executive");
const pushSyncService = require("./services/pushSyncService");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Static — foto personel ─────────────────────────────────
// Akses via: http://localhost:5000/foto/<NIK>.jpg
// Taruh file foto di folder: backend/uploads/foto/
app.use("/foto", express.static(path.join(__dirname, "uploads", "foto")));

// ── Foto resolve — cari file by NIK, ekstensi apapun ──────
// GET /foto-resolve/:nik → redirect ke URL file yang ditemukan, atau 404
const fs = require("fs");
app.get("/foto-resolve/:nik", (req, res) => {
  const fotoDir = path.join(__dirname, "uploads", "foto");
  const nik = req.params.nik;
  const exts = ["jpeg", "jpg", "png", "webp"];
  for (const ext of exts) {
    const filePath = path.join(fotoDir, `${nik}.${ext}`);
    if (fs.existsSync(filePath)) {
      return res.redirect(`/foto/${nik}.${ext}`);
    }
  }
  return res.status(404).json({ message: "Foto tidak ditemukan", nik });
});

// ── Routes ─────────────────────────────────────────────────
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/lines", linesRoutes);
// Endpoint READ-ONLY buat dikonsumsi Master Dashboard (Hirose) dari subcont
// lain — di production ini yang di-expose ke publik lewat Caddy, bukan
// /api/dashboard atau /api/lines.
app.use("/api/external", apiExternalRoutes);
// Endpoint buat Master Dashboard SENDIRI (dipanggil dari frontend Hirose) —
// gabungin Internal (lokal) + SGP/Systech (HTTP). TIDAK perlu diexpose ke
// publik/Caddy, cukup diakses dari LAN kayak /api/dashboard biasa.
app.use("/api/master", masterRoutes);
// Penerima push-sync dari SGP/Systech (fallback kalau pull Tailscale/tunnel
// putus). Cuma relevan di instance Master (Internal) — di SGP/Systech
// endpoint ini tetap ke-mount tapi gak akan pernah dipanggil siapa-siapa,
// jadi aman dibiarkan (satu codebase generic, lihat REFACTOR_NOTES.md).
app.use("/api/sync", syncRoutes);
// Executive Dashboard — data manual planner, disimpan di file
// (data/executiveTargets.json), TERPISAH dari DB ConMas. Ketemu file
// route-nya udah ada di server tapi belum pernah ke-mount/ke-commit
// (lihat REFACTOR_NOTES.md: "Server Master belum jadi git clone").
app.use("/api/executive", executiveRoutes);

// Push-sync PENGIRIM — cuma nyala di instance SGP/Systech kalau
// PUSH_MASTER_URL & PUSH_SYNC_KEY diisi (lihat services/pushSyncService.js).
// No-op di instance Internal/Master.
pushSyncService.start();

// ── Health check ────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", uptime: process.uptime() });
});

// ── Serve React build (production) ─────────────────────────
// Setelah `cd Frontendd && npm run build`, hasil build ada di Frontendd/build.
// Ini dipasang TERAKHIR (setelah semua /api & /foto route) sebagai fallback,
// supaya request non-API (misal refresh di "/") tetap kebuka ke index.html (SPA).
const buildPath = path.join(__dirname, "..", "Frontendd", "build");
app.use(express.static(buildPath));
app.get("*", (req, res) => {
  res.sendFile(path.join(buildPath, "index.html"));
});

// ── Start ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Backend jalan di http://localhost:${PORT}`);
  console.log(`📊 Dashboard API : http://localhost:${PORT}/api/dashboard`);
  console.log(`🖼  Foto personel : http://localhost:${PORT}/foto/<NIK>.jpg`);
});
