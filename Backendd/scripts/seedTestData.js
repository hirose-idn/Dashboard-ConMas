// Seed data DUMMY buat testing lokal di laptop — BUKAN buat production.
//
// Bikin/ngisi data di `view_report_25415` (VIEW asli ConMas yang nembus ke
// tabel dasar `report_25415`) buat SEMUA LINE AKTIF di `data/lines.json`
// (baca langsung lewat getAllLines()), UNTUK SETIAP TANGGAL di rentang
// START_DATE..END_DATE (semua shift per hari) — biar month-picker di
// Breakdown per Line / Breakdown Tren beneran ada datanya buat 1 bulan penuh.
//
// PENTING: `view_report_25415` di DB lokal ternyata VIEW ASLI (bukan tabel
// kosong bikinan script ini), yang nembus ke tabel dasar `report_25415`.
// Tabel dasar itu punya banyak kolom metadata NOT NULL (rep_top_id,
// rep_top_name, rev_no, def_top_id, dst — lihat dump report_25415 asli)
// yang HARUS diisi juga, bukan cuma kolom bisnis (line/tanggal/shift/dst).
// Makanya script ini generate rep_top_id sendiri (ambil MAX yang ada + 1,
// terus increment tiap insert) dan ngisi kolom metadata lain pake nilai
// wajar (mirip pola di data asli: rev_no=1, def_top_id=25415,
// report_type=1, dst).
//
// Jalanin: node scripts/seedTestData.js
// (pastiin .env udah keisi DB_HOST dkk nunjuk ke DB lokal lu)
//
// Rentang tanggal bisa di-override lewat env var kalau perlu:
//   SEED_START=2026-06-01 SEED_END=2026-07-31 node scripts/seedTestData.js
//
// Kalau mau tetep keisi FULL sampe END_DATE walaupun tanggal SEKARANG di
// laptop lu belum nyampe situ (misal cuma buat testing month-picker biar
// keliatan penuh sebulan), set FORCE_FILL=1:
//   FORCE_FILL=1 SEED_END=2026-07-31 node scripts/seedTestData.js

require("dotenv").config();
const pool = require("../db");
const { COLS } = require("../config/reportColumns");
const { getAllLines } = require("../utils/linesRegistry");

// Default rentang: 1 Juni s.d. 31 Juli 2026 — cakup 2 bulan kalender penuh
// biar month-picker punya beberapa bulan buat dicoba gonta-ganti.
const START_DATE = process.env.SEED_START || "2026-06-01";
const END_DATE = process.env.SEED_END || "2026-07-31";

// Kalau true, hari yang "masih di masa depan" relatif ke jam laptop lu
// TETEP diisi (dilewatin check todayUTC). Default false biar behavior lama
// (realistis, gak ada data buat hari yang belum kejadian) tetep jalan.
const FORCE_FILL = process.env.FORCE_FILL === "1";

// def_top_id di data asli = 25415, sama kayak nomor report_id-nya sendiri.
const DEF_TOP_ID = 25415;

// Parse "YYYY-MM-DD" SEBAGAI UTC eksplisit (Date.UTC) — sama kayak fix di
// summaryService.js/routes/dashboard.js, biar gak kena bug geser 1 hari
// kalau laptop lu di-set timezone WIB.
function parseDateUTC(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

async function main() {
  const lines = getAllLines(); // cuma line yang active:true di lines.json

  if (lines.length === 0) {
    console.error(
      "Gak ada line aktif ketemu di data/lines.json — cek path/isi file itu dulu.",
    );
    process.exit(1);
  }

  console.log(`→ Ketemu ${lines.length} line aktif di data/lines.json:`);
  for (const l of lines) {
    console.log(`   ${l.line_code} (${l.shift_scheme} shift) — ${l.description || "(no description)"}`);
  }

  if (FORCE_FILL) {
    console.log("\n⚠ FORCE_FILL=1 aktif — hari 'masa depan' relatif ke jam laptop TETEP diisi.");
  }

  // NOTE: kalau `view_report_25415` udah ada sebagai VIEW asli (nembus ke
  // tabel dasar report_25415), statement ini otomatis di-skip sama Postgres
  // (relation-nya udah ada). Dibiarin di sini cuma buat kasus DB lokal yang
  // masih benar-benar kosong / belum ada view aslinya.
  console.log("\n→ Creating table view_report_25415 (if not exists)...");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS view_report_25415 (
      ${COLS.line}             text,
      ${COLS.cell_leader}      text,
      ${COLS.teknisi}          text,
      ${COLS.inspector}        text,
      ${COLS.tanggal}          timestamp,
      ${COLS.shift}            text,
      ${COLS.reject_ppm}       numeric,
      ${COLS.output_plan}      numeric,
      ${COLS.output_actual}    numeric,
      ${COLS.deviasi_target}   numeric,
      ${COLS.qty_reject}       numeric,
      ${COLS.stoptime_plan}    numeric,
      ${COLS.stoptime_actual}  numeric,
      ${COLS.stoptime_man}     numeric,
      ${COLS.stoptime_method}  numeric,
      ${COLS.stoptime_material} numeric,
      ${COLS.stoptime_machine} numeric,
      ${COLS.oee}              numeric
    );
  `);

  // Cek apakah kolom metadata (rep_top_id dkk) beneran ada di relasi target.
  // Kalau `view_report_25415` cuma tabel sederhana bikinan script sendiri
  // (dari CREATE TABLE di atas), kolom ini gak akan ada — jadi mode metadata
  // di-skip otomatis. Kalau ini VIEW asli yang nembus ke report_25415,
  // kolom ini bakal ketemu dan mode metadata NOT NULL diaktifkan.
  const metaCheck = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'view_report_25415' AND column_name = 'rep_top_id'
  `);
  const needsMetadata = metaCheck.rows.length > 0;

  let nextRepTopId = 1;
  if (needsMetadata) {
    const maxIdResult = await pool.query(
      `SELECT COALESCE(MAX(rep_top_id), 0) AS max_id FROM view_report_25415`,
    );
    nextRepTopId = Number(maxIdResult.rows[0].max_id) + 1;
    console.log(`→ Mode metadata NOT NULL aktif (rep_top_id mulai dari ${nextRepTopId}).`);
  }

  const start = parseDateUTC(START_DATE);
  const end = parseDateUTC(END_DATE);
  const todayUTC = new Date(Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate(),
  ));
  const nowIso = new Date().toISOString();

  let totalRows = 0;

  for (const line of lines) {
    process.stdout.write(`\n→ Seeding ${line.line_code} (${line.shift_scheme} shift)... `);

    // Bersihin dulu SEMUA row lama buat line ini di rentang tanggal yang
    // sama (biar script ini bisa dijalanin berkali-kali tanpa numpuk
    // duplikat tiap kali di-run ulang).
    await pool.query(
      `DELETE FROM view_report_25415
       WHERE ${COLS.line} = $1
         AND DATE(${COLS.tanggal}) BETWEEN $2 AND $3`,
      [line.line_code, START_DATE, END_DATE],
    );

    const cursor = new Date(start);
    let rowsThisLine = 0;

    while (cursor <= end) {
      const dateStr = cursor.toISOString().slice(0, 10);
      // Hari yang masih di masa depan (relatif ke hari ini) sengaja
      // DILEWATIN — sama kayak asumsi "belum ada data" di frontend
      // (field `hasData`), biar tampilannya realistis. Bisa di-bypass
      // pake FORCE_FILL=1 kalau emang butuh data penuh sampe akhir bulan.
      if (FORCE_FILL || cursor <= todayUTC) {
        for (let shiftNum = 1; shiftNum <= line.shift_scheme; shiftNum++) {
          const shift = `Shift ${shiftNum} (${line.shift_scheme} Shift)`;
          const outputPlan = 1000;
          const outputActual = Math.round(outputPlan * (0.75 + Math.random() * 0.25));
          const qtyReject = Math.round(Math.random() * 20);
          const stoptimePlan = 60;
          const stoptimeActual = Math.round(30 + Math.random() * 40);
          const oee = Math.round((70 + Math.random() * 25) * 10) / 10;

          if (needsMetadata) {
            // Insert lengkap termasuk kolom metadata NOT NULL, nilai-nilai
            // ini niru pola yang ada di data asli report_25415.
            await pool.query(
              `INSERT INTO view_report_25415 (
                rep_top_id, rep_top_name, public_status, edit_refer_status,
                rep_top_org, rev_no, def_top_id, report_type,
                rep_sheet_count, display_sheet_number, server_version,
                sys_regist_term, sys_regist_user, sys_regist_time,
                sys_update_term, sys_update_user, sys_update_time,
                ${COLS.line}, ${COLS.tanggal}, ${COLS.shift},
                ${COLS.output_plan}, ${COLS.output_actual}, ${COLS.qty_reject},
                ${COLS.stoptime_plan}, ${COLS.stoptime_actual}, ${COLS.oee}
              ) VALUES (
                $1, $2, 1, 0,
                1, 1, $3, 1,
                1, 1, '1.0',
                'SERVER1', 'admin', $4,
                'SERVER1', 'admin', $4,
                $5, $6::date, $7,
                $8, $9, $10,
                $11, $12, $13
              )`,
              [
                nextRepTopId, line.line_code, DEF_TOP_ID, nowIso,
                line.line_code, dateStr, shift,
                outputPlan, outputActual, qtyReject,
                stoptimePlan, stoptimeActual, oee,
              ],
            );
            nextRepTopId++;
          } else {
            await pool.query(
              `INSERT INTO view_report_25415 (
                ${COLS.line}, ${COLS.tanggal}, ${COLS.shift},
                ${COLS.output_plan}, ${COLS.output_actual}, ${COLS.qty_reject},
                ${COLS.stoptime_plan}, ${COLS.stoptime_actual}, ${COLS.oee}
              ) VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9)`,
              [line.line_code, dateStr, shift, outputPlan, outputActual, qtyReject, stoptimePlan, stoptimeActual, oee],
            );
          }
          rowsThisLine++;
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    console.log(`${rowsThisLine} rows`);
    totalRows += rowsThisLine;
  }

  console.log(`\nDone — ${totalRows} rows total across ${lines.length} line(s), ${START_DATE} → ${END_DATE}.`);

  await pool.end();
}

main().catch((err) => {
  console.error("SEED ERROR:", err);
  process.exit(1);
});