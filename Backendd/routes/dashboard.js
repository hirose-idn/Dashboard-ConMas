const express = require("express");
const router = express.Router();
const pool = require("../db");
const { getPoolForTempat } = pool;

// Line aktif + shift scheme-nya (2/3 shift) disimpan di tabel "lines"
// (routes/lines.js), BUKAN hardcode — supaya nambah line baru gak perlu deploy ulang.

// ⚠️ Eksperimen lama (satu backend narik banyak "tempat" lewat view/pool
// beda) DITINGGALKAN — tiap subcont sekarang deploy instance sendiri, Hirose
// narik ringkasannya lewat HTTP API (routes/api-external.js). Fungsi di
// bawah dipertahankan sebagai no-op biar pemanggil lama tetap jalan.
function getViewForTempat(_tempat) {
  return VIEW;
}

const { getAllLines, getLineConfig } = require("../utils/linesRegistry");

// TODO: Row 17/Line masih perlu dicek — form ConMas row itu field
// text/dropdown, atau ID numeric yang representasiin '41HR101'?
const { VIEW, COLS, REJECT_PAIRS } = require("../config/reportColumns");

const { SLOTS, getLineRangeBreakdown } = require("../services/lineBreakdownService");

// ⚠️ Import ini WAJIB ada SEBELUM definisi HOURLY di bawah (butuh
// hourToLabel buat generate label-nya) — jangan dipindah balik ke bawah.
const {
  resolveShiftAndDate,
  isLineNotRunning,
  isRowStale,
  getLineStatus3,
  parseShiftLabel,
  shiftWindowFromLabel,
  pickActiveRow,
  getShiftSlotLabels,
  hourToLabel,
} = require("../utils/shiftResolver");

// Backdate support — GET /, /reject-detail, /monthly semua terima optional
// ?date=YYYY-MM-DD (dikirim PCBDashboard pas dibuka dari Master Dashboard
// yg lagi di-backdate).
//
// Trik: fungsi2 shiftResolver butuh "wib" (jam WIB SAAT INI) buat nentuin
// shift mana yang aktif. Daripada ubah logic-nya, kita pura-pura "sekarang"
// itu jam 23:59 di TANGGAL yang diminta — shift "aktif" otomatis jadi shift
// TERAKHIR hari itu (hasil final, pas buat dilihat retroaktif). Tanpa
// ?date=, wib = sekarang beneran (behavior live normal).
function resolveWib(req) {
  const dateParam = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || "")
    ? req.query.date
    : null;
  if (dateParam) {
    return {
      wib: new Date(`${dateParam}T23:59:00.000Z`),
      isHistorical: true,
      dateParam,
    };
  }
  return {
    wib: new Date(Date.now() + 7 * 3600 * 1000),
    isHistorical: false,
    dateParam: null,
  };
}

// pickActiveRow punya fallback "row PALING BARU yang udah selesai" kalau
// row buat shift yang lagi dicari beneran gak ketemu — masuk akal buat mode
// LIVE (shift baru mulai, data belum sempet keinput, tampilin data shift
// sebelumnya sambil nunggu). Tapi buat mode BACKDATE ini bahaya: kalau data
// tanggal yang diminta emang belum/gak ada, dia diem2 nampilin data tanggal
// LAIN tanpa ada tanda apa2 (row.tanggal ke-render apa adanya di FE) — user
// ngira lagi liat tanggal yang dia minta padahal enggak.
// Makanya di mode historis (dateParam ada), row HARUS match persis tanggal
// yang diminta — kalau row hasil pickActiveRow ternyata tanggal lain,
// treat sebagai "gak ada data buat tanggal ini" (null), BUKAN ditampilin
// nyasar ke tanggal lain.
function enforceExactDateIfHistorical(row, dateParam) {
  if (!row || !dateParam) return row;
  const rowDateStr =
    row.tanggal instanceof Date
      ? row.tanggal.toISOString().slice(0, 10)
      : String(row.tanggal).slice(0, 10);
  return rowDateStr === dateParam ? row : null;
}

// Rekapitulasi per jam — 25 slot FISIK (urutan kolom cluster_1_XXX di bawah
// FIXED, sama buat semua instance — ini layout form ConMas asli, slot ke-1
// s.d. ke-25 SEKUENSIAL, bukan jam absolut).
//
// ⚠️ TEMUAN 21 Agu 2026: slot ke-1 (cluster_1_151) itu BUKAN selalu jam
// 06:00-07:00! Operator ConMas ngisi form MULAI DARI SLOT PERTAMA begitu
// shift MEREKA mulai — jadi "jam berapa slot-1 itu" tergantung jam mulai
// shift di instance itu sendiri. Internal shift-1-3-shift mulai jam 06:00
// (makanya slot-1 historisnya dilabelin "06-07"), tapi Systech shift-1
// mulai jam 08:00 — slot-1 mereka ITU jam 08:00-09:00, BUKAN 06:00-07:00,
// walau kolom DB-nya SAMA PERSIS (cluster_1_151).
//
// Fix: label di-generate dari HOURLY_SLOT_OFFSET (.env per instance) —
// jumlah jam pergeseran slot-1 dari baseline Internal (jam 6). Internal gak
// perlu diisi (default 0, hasilnya identik kayak hardcode lama). Systech
// contoh: slot-1 mereka = jam 8 = 2 jam lebih telat dari baseline 6 →
// HOURLY_SLOT_OFFSET=2.
const HOURLY_SLOT_OFFSET = parseInt(process.env.HOURLY_SLOT_OFFSET, 10) || 0;
const HOURLY_BASE_START_HOUR = 6; // jam real slot-1 Internal (SSoT — jangan diubah, instance lain nyesuaiin lewat OFFSET)
const HOURLY_COLUMNS = [
  ["cluster_1_151_n", "cluster_1_152_n"],
  ["cluster_1_256_n", "cluster_1_257_n"],
  ["cluster_1_361_n", "cluster_1_362_n"],
  ["cluster_1_466_n", "cluster_1_467_n"],
  ["cluster_1_571_n", "cluster_1_572_n"],
  ["cluster_1_676_n", "cluster_1_677_n"],
  ["cluster_1_781_n", "cluster_1_782_n"],
  ["cluster_1_886_n", "cluster_1_887_n"],
  ["cluster_1_991_n", "cluster_1_992_n"],
  ["cluster_1_1096_n", "cluster_1_1097_n"],
  ["cluster_1_1201_n", "cluster_1_1202_n"],
  ["cluster_1_1306_n", "cluster_1_1307_n"],
  ["cluster_1_1411_n", "cluster_1_1412_n"],
  ["cluster_1_1516_n", "cluster_1_1517_n"],
  ["cluster_1_1621_n", "cluster_1_1622_n"],
  ["cluster_1_1726_n", "cluster_1_1727_n"],
  ["cluster_1_1831_n", "cluster_1_1832_n"],
  ["cluster_1_1936_n", "cluster_1_1937_n"],
  ["cluster_1_2041_n", "cluster_1_2042_n"],
  ["cluster_1_2146_n", "cluster_1_2147_n"],
  ["cluster_1_2251_n", "cluster_1_2252_n"],
  ["cluster_1_2356_n", "cluster_1_2357_n"],
  ["cluster_1_2461_n", "cluster_1_2462_n"],
  ["cluster_1_2566_n", "cluster_1_2567_n"],
  ["cluster_1_2671_n", "cluster_1_2672_n"],
];
const HOURLY = HOURLY_COLUMNS.map(([plan, actual], i) => {
  // Modulo positif — HOURLY_SLOT_OFFSET boleh negatif kalau suatu saat ada
  // instance yang slot-1-nya JUSTRU lebih PAGI dari baseline Internal.
  const hour =
    (((HOURLY_BASE_START_HOUR + i + HOURLY_SLOT_OFFSET) % 24) + 24) % 24;
  return { label: hourToLabel(hour), plan, actual };
});
// Index 24 SELALU dapet label SAMA kayak index 0 (25 slot muter lebih dari
// 24 jam, balik ke jam awal lagi) — ini BUKAN bug, konsekuensi matematis
// bawaan struktur 25-slot, berlaku di OFFSET manapun. Aman karena
// hourlyColKey(i) di bawah pakai INDEX buat key lookup (bukan label), jadi
// 2 slot ber-label sama TETEP kebaca kolom masing-masing yang bener.

// BUG LAMA yang baru ketauan: label "06-07" muncul 2x di array HOURLY di
// atas (index 0 = jam pertama shift-1 3-shift/cluster_1_151-152, index 24
// = jam terakhir shift-2 2-shift yang lewat tengah malam/cluster_1_2671-
// 2672). Kode di bawah SEBELUMNYA bikin alias SQL & key row lookup dari
// h.label doang (`hour_06_07_plan` dst) — karena 2 index beda punya label
// SAMA, alias-nya BENTROK, dan di JS object key yang duplikat saling
// TIMPA (yang belakangan/index 24 nimpa index 0). Akibatnya jam PERTAMA
// shift-1 3-shift SELALU keliatan kosong di dashboard walau datanya ada
// di DB (cluster_1_151_n/152_n) — yang kebaca malah cluster_1_2671_n/
// 2672_n (index 24, biasanya emang kosong karena jarang ada shift yang
// beneran butuh slot ke-25).
//
// Fix: key lookup/alias SQL pake INDEX ARRAY (dijamin unik), BUKAN label
// (bisa duplikat). `slot: h.label` di response tetep sama persis kayak
// sebelumnya (frontend gak perlu berubah).
function hourlyColKey(i) {
  return `h${i}`;
}

//  LOGIC SHIFT — generic per shift_scheme (2 atau 3)
//
//  2 Shift: Shift 1: 07:00–16:00 (Jumat s.d. 17:00)
//           Shift 2: 22:00–07:00
//           Jam 16/17:00–22:00 = gap (gak ada shift jalan) → default
//           tampilkan Shift 1 (data terakhir yg baru selesai).
//
//  3 Shift: Shift 1: 06:00–14:00
//           Shift 2: 14:00–22:00
//           Shift 3: 22:00–06:00
//           Gak ada gap — selalu ada shift yang lagi jalan.
//
//  ⚠️ Value kolom `shift` di DB bentuknya "Shift 1 (2 Shift)",
//  "Shift 2 (3 Shift)", dst — ada suffix scheme.

//  GET /?line=... — data shift aktif untuk line yang diminta
router.get("/", async (req, res) => {
  try {
    const lineCode = (req.query.line || "").trim();
    if (!lineCode) {
      return res.status(400).json({
        success: false,
        message:
          "Parameter ?line= wajib diisi. Cek GET /api/lines buat daftar line yang valid.",
      });
    }

    const lineConfig = await getLineConfig(lineCode);
    if (!lineConfig) {
      return res.status(404).json({
        success: false,
        message: `Line "${lineCode}" tidak ditemukan / nonaktif. Cek GET /api/lines.`,
      });
    }

    const { wib, isHistorical, dateParam } = resolveWib(req);
    // ?shift= (opsional, CUMA dipakai pas historis) — user toggle Shift 1/2
    // di FE buat tanggal yang punya >1 shift (lihat komentar panjang di
    // pickActiveRow, shiftResolver.js). Kosong = default behavior lama
    // (ambil shift TERAKHIR hari itu).
    const shiftOverrideParam = isHistorical
      ? (req.query.shift || "").trim() || null
      : null;
    // shift_scheme dari config CUMA dipakai buat fallback pas row BENERAN
    // belum ada sama sekali (nentuin threshold "not running"). Buat NYARI
    // row-nya sendiri, kita GAK nebak label shift dari config lagi — lihat
    // catatan panjang di utils/shiftResolver.js kenapa itu bikin row ke-miss
    // walau datanya udah ada (mismatch scheme/jam antara config vs row asli).
    const { tanggal: fallbackDate, shiftStartWIB: fallbackShiftStartWIB } =
      resolveShiftAndDate(wib, lineConfig.shift_scheme);
    const yesterday = new Date(wib.getTime() - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const todayStr = wib.toISOString().slice(0, 10);
    const lineNotRunning = isLineNotRunning(wib, fallbackShiftStartWIB);

    const slotSelects = SLOTS.flatMap((s, i) => [
      `${s.cl_no} AS slot_${i}_cl_no`,
      `${s.product_name} AS slot_${i}_product`,
      `${s.swi} AS slot_${i}_swi`,
      `${s.actual} AS slot_${i}_actual`,
    ]);
    const hourlySelects = HOURLY.flatMap((h, i) => [
      `${h.plan} AS hour_${hourlyColKey(i)}_plan`,
      `${h.actual} AS hour_${hourlyColKey(i)}_actual`,
    ]);

    const query = `
      SELECT
        ${COLS.line} AS line,
        ${COLS.cell_leader} AS cell_leader,
        ${COLS.teknisi} AS teknisi,
        ${COLS.inspector} AS inspector,
        ${COLS.tanggal} AS tanggal,
        ${COLS.shift} AS shift,
        ${COLS.reject_ppm} AS reject_ppm,
        ${COLS.output_plan} AS output_plan,
        ${COLS.output_actual} AS output_actual,
        ${COLS.deviasi_target} AS deviasi_target,
        ${COLS.qty_reject} AS qty_reject,
        ${COLS.reject_m107} AS reject_m107,
        ${COLS.stoptime_plan} AS stoptime_plan,
        ${COLS.stoptime_actual} AS stoptime_actual,
        ${COLS.stoptime_man} AS stoptime_man,
        ${COLS.stoptime_machine} AS stoptime_machine,
        ${COLS.stoptime_material} AS stoptime_material,
        ${COLS.stoptime_method} AS stoptime_method,
        ${COLS.oee} AS oee,
        ${slotSelects.join(",\n        ")},
        ${hourlySelects.join(",\n        ")}
      FROM ${getViewForTempat(lineConfig.tempat)}
      WHERE ${COLS.line} = $1
        AND DATE(${COLS.tanggal}) IN ($2, $3)
    `;

    const result = await getPoolForTempat(lineConfig.tempat).query(query, [
      lineCode,
      todayStr,
      yesterday,
    ]);
    const row = enforceExactDateIfHistorical(
      pickActiveRow(
        result.rows,
        wib,
        "shift",
        isHistorical ? dateParam : null,
        shiftOverrideParam,
      ),
      dateParam,
    );
    // Buat toggle Shift 1/2/dst di FE (PCBDashboard.jsx) — daftar NOMOR
    // shift yang beneran ADA row-nya di tanggal yang diminta, apapun hasil
    // pickActiveRow di atas. Diambil dari result.rows MENTAH (belum
    // difilter shiftOverrideParam), biar tetep muncul walau row yang lagi
    // ditampilkan sekarang null (shift_not_found) — FE masih bisa nawarin
    // "coba Shift 1" dst.
    const availableShifts = isHistorical
      ? [
          ...new Set(
            result.rows
              .filter((r) => {
                const t =
                  r.tanggal instanceof Date
                    ? r.tanggal.toISOString().slice(0, 10)
                    : String(r.tanggal).slice(0, 10);
                return t === dateParam;
              })
              .map((r) => parseShiftLabel(r.shift)?.shiftNum)
              .filter((n) => n != null),
          ),
        ].sort((a, b) => a - b)
      : [];
    // Shift & tanggal buat ditampilkan diambil dari ROW ASLI kalau ketemu
    // (bukan tebakan config) — fallback ke hasil tebakan cuma kalau
    // beneran gak ada row apa pun buat line ini di 2 hari terakhir.
    const parsedFromRow = row ? parseShiftLabel(row.shift) : null;
    const shift = row ? row.shift : `Shift ? (${lineConfig.shift_scheme} Shift)`;
    const targetDate = row
      ? row.tanggal instanceof Date
        ? row.tanggal.toISOString().slice(0, 10)
        : String(row.tanggal).slice(0, 10)
      : isHistorical
        ? dateParam
        : fallbackDate;
    // shiftStartWIB buat cek stale (isRowStale) dihitung dari LABEL ASLI
    // row itu sendiri kalau kebaca, biar jam yang dibandingin bener-bener
    // cocok sama shift row ini — bukan tebakan config yang mungkin beda.
    const rowShiftStartWIB =
      row && parsedFromRow
        ? shiftWindowFromLabel(targetDate, parsedFromRow.scheme, parsedFromRow.shiftNum)
            .startWIB
        : fallbackShiftStartWIB;

    if (!row) {
      // ⚠️ FIX bug "LINE TIDAK RUNNING" nongol di rekap historis: dulu di
      // sini SELALU pakai getLineStatus3() versi LIVE ("udah berapa menit
      // dari jam mulai shift SEKARANG row-nya belum ada") — logic itu cuma
      // masuk akal buat live/kiosk. Buat tanggal yang UDAH LEWAT, "belum
      // ada data masuk" itu bukan tanda sistem lagi macet, cuma berarti
      // line itu emang gak ada row produksi di tanggal tsb (row-nya mmg
      // gak ada, bukan "lagi nunggu"). Kasih status baru "no_data" khusus
      // historis, biar FE nampilin pesan tenang, BUKAN alarm blink merah
      // full-screen ala live (lihat PCBDashboard.jsx).
      //
      // "shift_not_found" beda kasus lagi: dipakai pas user toggle
      // shiftOverrideParam ("Shift 1"/"Shift 2") buat tanggal yang row-nya
      // ADA tapi bukan shift yang diminta itu (mis. tanggal itu cuma ada
      // Shift 1, user klik toggle Shift 2) — biar FE bisa bilang persis
      // "Shift 2 gak ada datanya di tanggal ini", bukan disamain kayak
      // "no_data" yang artinya SELURUH tanggal itu kosong.
      const shiftReallyMissing =
        isHistorical && shiftOverrideParam && result.rows.some((r) => {
          const t =
            r.tanggal instanceof Date
              ? r.tanggal.toISOString().slice(0, 10)
              : String(r.tanggal).slice(0, 10);
          return t === dateParam;
        });
      return res.json({
        success: true,
        data: null,
        line: lineCode,
        shift,
        tanggal: targetDate,
        line_not_running: isHistorical ? false : lineNotRunning,
        line_status: isHistorical
          ? shiftReallyMissing
            ? "shift_not_found"
            : "no_data"
          : getLineStatus3({
              hasRow: false,
              hourly: null,
              shiftStartWIB: fallbackShiftStartWIB,
              nowWIB: wib,
            }),
        availability_operator: null,
        historical: isHistorical,
        available_shifts: availableShifts,
      });
    }

    // ── Slot aktif: ambil slot terakhir yg cl_no-nya keisi ──
    let activeSlot = null;
    for (let i = 0; i < SLOTS.length; i++) {
      if (row[`slot_${i}_cl_no`]) {
        activeSlot = {
          cl_no: row[`slot_${i}_cl_no`],
          product_name: row[`slot_${i}_product`],
          cycle_time_swi:
            row[`slot_${i}_swi`] != null ? Number(row[`slot_${i}_swi`]) : null,
          cycle_time_actual:
            row[`slot_${i}_actual`] != null
              ? Number(row[`slot_${i}_actual`])
              : null,
        };
      }
    }

    // ── Hourly array (dipakai langsung, gak perlu endpoint /trend lagi) ──
    const hourly = HOURLY.map((h, i) => {
      const key = hourlyColKey(i);
      const plan =
        row[`hour_${key}_plan`] != null
          ? Number(row[`hour_${key}_plan`])
          : null;
      const actual =
        row[`hour_${key}_actual`] != null
          ? Number(row[`hour_${key}_actual`])
          : null;
      return {
        slot: h.label,
        output_plan: plan,
        output_actual: actual,
        deviasi: plan != null && actual != null ? actual - plan : null,
        pencapaian:
          plan > 0 && actual != null ? Math.round((actual / plan) * 100) : null,
      };
    });

    // Kolom recap yang RELEVAN buat shift ini — dihitung dari jam
    // start/end beneran (env var), bukan daftar hardcode per tempat kayak
    // sebelumnya (isu kemarin: 41SY42/Systech shift 08:00-20:00 tapi FE
    // nampilin kolom 07-08 s.d. 16-17 punya Internal). `hourly` di atas
    // TETAP array lengkap 25 slot (dipakai isRowStale/getLineStatus3 apa
    // adanya) — ini cuma buat yang ditampilkan ke FE.
    const shiftLabelsForDisplay = getShiftSlotLabels(
      parsedFromRow?.scheme || lineConfig.shift_scheme,
      parsedFromRow?.shiftNum || 1,
    );
    const hourlyForDisplay = shiftLabelsForDisplay.map(
      (label) =>
        hourly.find((h) => h.slot === label) || {
          slot: label,
          output_plan: null,
          output_actual: null,
          deviasi: null,
          pencapaian: null,
        },
    );

    const stoptime_total =
      row.stoptime_plan != null && row.stoptime_actual != null
        ? Number(row.stoptime_plan) - Number(row.stoptime_actual)
        : 0;

    // Operator Availability (Beki) — formula dari user:
    // (total output + total reject m107) / total plan output.
    // ⚠️ reject_m107 masih placeholder (cluster_1_107_n) — lihat catatan
    // di config/reportColumns.js, gampang diganti di 1 tempat itu aja
    // begitu user konfirmasi kolom aslinya.
    const planOutput = Number(row.output_plan) || 0;
    const actualOutput = Number(row.output_actual) || 0;
    const rejectM107 = Number(row.reject_m107) || 0;
    const availabilityOperator =
      planOutput > 0
        ? Math.round(((actualOutput + rejectM107) / planOutput) * 1000) / 10
        : null;

    res.json({
      success: true,
      shift,
      tanggal: targetDate,
      line_not_running: isRowStale(hourly, rowShiftStartWIB, wib),
      line_status: getLineStatus3({
        hasRow: true,
        hourly,
        shiftStartWIB: rowShiftStartWIB,
        nowWIB: wib,
      }),
      line: row.line,
      cell_leader_nama: row.cell_leader,
      pj_teknis_nama: row.teknisi,
      inspector_nama: row.inspector,
      product_name: activeSlot?.product_name || null,
      cl_no: activeSlot?.cl_no || null,
      cycle_time_swi: activeSlot?.cycle_time_swi ?? null,
      cycle_time_actual: activeSlot?.cycle_time_actual ?? null,
      output_plan: Number(row.output_plan) || 0,
      output_total: Number(row.output_actual) || 0,
      deviasi_target:
        (Number(row.output_actual) || 0) - (Number(row.output_plan) || 0),
      reject_qty: Number(row.qty_reject) || 0,
      qty_reject_ppm: Number(row.reject_ppm) || 0,
      stoptime_total,
      stoptime_man: Number(row.stoptime_man) || 0,
      stoptime_machine: Number(row.stoptime_machine) || 0,
      stoptime_material: Number(row.stoptime_material) || 0,
      stoptime_method: Number(row.stoptime_method) || 0,
      oee: row.oee != null ? Number(row.oee) : null,
      availability_operator: availabilityOperator,
      hourly: hourlyForDisplay,
      timestamp: new Date().toISOString(),
      historical: isHistorical,
      available_shifts: availableShifts,
    });
  } catch (error) {
    console.error("Error query dashboard:", error.message);
    res.status(500).json({
      success: false,
      message: "Gagal ambil data",
      error: error.message,
    });
  }
});

//  GET /monthly?line=... — akumulasi reject & output sebulan
//  (gabung semua shift, karena qty_reject ada di tiap row)
router.get("/monthly", async (req, res) => {
  try {
    const lineCode = (req.query.line || "").trim();
    if (!lineCode) {
      return res
        .status(400)
        .json({ success: false, message: "Parameter ?line= wajib diisi." });
    }

    const lineConfig = getLineConfig(lineCode);
    if (!lineConfig) {
      return res.status(404).json({
        success: false,
        message: `Line "${lineCode}" tidak ditemukan / nonaktif.`,
      });
    }

    const { wib } = resolveWib(req);
    const year = wib.getUTCFullYear();
    const month = wib.getUTCMonth() + 1;

    const query = `
      SELECT
        SUM(CAST(${COLS.qty_reject} AS NUMERIC)) AS total_reject,
        SUM(CAST(${COLS.output_actual} AS NUMERIC)) AS total_output,
        SUM(CAST(${COLS.stoptime_man} AS NUMERIC)) AS total_man,
        SUM(CAST(${COLS.stoptime_machine} AS NUMERIC)) AS total_machine,
        SUM(CAST(${COLS.stoptime_material} AS NUMERIC)) AS total_material,
        SUM(CAST(${COLS.stoptime_method} AS NUMERIC)) AS total_method
      FROM ${getViewForTempat(lineConfig.tempat)}
      WHERE ${COLS.line} = $1
        AND EXTRACT(YEAR FROM ${COLS.tanggal}) = $2
        AND EXTRACT(MONTH FROM ${COLS.tanggal}) = $3
    `;
    const result = await getPoolForTempat(lineConfig.tempat).query(query, [
      lineCode,
      year,
      month,
    ]);
    const total_output = Number(result.rows[0]?.total_output) || 0;
    const total_reject = Number(result.rows[0]?.total_reject) || 0;
    const ppm =
      total_output > 0
        ? Math.round((total_reject / total_output) * 1_000_000)
        : 0;

    res.json({
      total_qty_reject: total_reject,
      total_output,
      ppm,
      man: Number(result.rows[0]?.total_man) || 0,
      machine: Number(result.rows[0]?.total_machine) || 0,
      material: Number(result.rows[0]?.total_material) || 0,
      method: Number(result.rows[0]?.total_method) || 0,
    });
  } catch (err) {
    console.error("MONTHLY ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

//  GET /reject-detail?line=... — breakdown qty reject per nama
//  defect, buat panel "Detail Reject" di kanan dashboard per-line.
//
//  Sumbernya REJECT_PAIRS (150 slot di config/reportColumns.js):
//  form ConMas nyimpen tiap defect yg diinput sebagai pasangan
//  kolom (qty numeric, nama text) di slot berurutan — BUKAN 1
//  kolom tetap per jenis defect (makanya gak ada kolom "Bent Pins"
//  dst secara eksplisit). Operator isi slot dari yg pertama; slot
//  yg gak dipakai kosong (name null/"").
//
//  Row yang dipakai = row aktif yang SAMA persis kayak GET / (line +
//  shift yang lagi berjalan/baru selesai, lewat pickActiveRow) —
//  biar angka reject di panel ini nyambung sama shift yang lagi
//  ditampilin di kartu-kartu utama, bukan shift lain/hari lain.
//
//  Agregasi per nama (bukan langsung per-slot) soalnya operator
//  bisa aja nulis nama defect yang sama di lebih dari 1 slot dalam
//  1 shift (nambah reject yang sama beberapa kali submit).
router.get("/reject-detail", async (req, res) => {
  try {
    const lineCode = (req.query.line || "").trim();
    if (!lineCode) {
      return res.status(400).json({
        success: false,
        message: "Parameter ?line= wajib diisi.",
      });
    }

    const lineConfig = await getLineConfig(lineCode);
    if (!lineConfig) {
      return res.status(404).json({
        success: false,
        message: `Line "${lineCode}" tidak ditemukan / nonaktif.`,
      });
    }

    const { wib, dateParam, isHistorical } = resolveWib(req);
    // ⚠️ FIX bug "reject detail gak nyambung sama toggle Shift 1/2": dulu
    // endpoint ini gak pernah baca ?shift= sama sekali, jadi SELALU ambil
    // shift TERAKHIR hari itu (behavior default pickActiveRow) — gak peduli
    // toggle yang lagi aktif di GET / (lihat DashboardHeader.jsx). Efeknya:
    // toggle ke Shift 1 di panel utama, tapi "Detail Reject" tetep nampilin
    // punya Shift 2 (sering keliatan 0/kosong padahal shift yang lagi
    // dilihat beneran ada reject-nya). Sekarang baca ?shift= yang sama
    // persis kayak dikirim ke GET / (lihat useDashboardData.js lineQS).
    const shiftOverrideParam = isHistorical
      ? (req.query.shift || "").trim() || null
      : null;
    const yesterday = new Date(wib.getTime() - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const todayStr = wib.toISOString().slice(0, 10);

    const rejectSelects = REJECT_PAIRS.flatMap((p, i) => [
      `${p.qty} AS r${i}_qty`,
      `${p.name} AS r${i}_name`,
    ]);

    const query = `
      SELECT
        ${COLS.tanggal} AS tanggal,
        ${COLS.shift} AS shift,
        ${rejectSelects.join(",\n        ")}
      FROM ${getViewForTempat(lineConfig.tempat)}
      WHERE ${COLS.line} = $1
        AND DATE(${COLS.tanggal}) IN ($2, $3)
    `;

    const result = await getPoolForTempat(lineConfig.tempat).query(query, [
      lineCode,
      todayStr,
      yesterday,
    ]);
    const row = enforceExactDateIfHistorical(
      pickActiveRow(result.rows, wib, "shift", dateParam, shiftOverrideParam),
      dateParam,
    );

    if (!row) {
      return res.json({ success: true, date: todayStr, data: [] });
    }

    // ⚠️ FIX bug "13 reject di kartu utama, tapi Detail Reject cuma nunjuk
    // 3": dulu slot yang QTY-nya keisi tapi NAMA defect-nya kosong
    // (operator kadang buru-buru nulis angka doang, lupa/skip isi nama)
    // di-skip TOTAL dari agregasi (`if (!rawName) return`) — qty-nya diem2
    // ilang dari tampilan walau datanya beneran ADA di DB. Sekarang slot
    // tanpa nama tetep dihitung, dikumpulin ke 1 bucket "Tidak ada nama
    // defect" — biar QA/Cell Leader tau ada reject yang belum
    // dikategorikan, bukan ngira datanya cuma segitu.
    const UNNAMED_LABEL = "⚠ Tidak ada nama defect (qty tercatat, nama kosong)";
    const agg = new Map();
    REJECT_PAIRS.forEach((_, i) => {
      const rawName = row[`r${i}_name`];
      const qty = Number(row[`r${i}_qty`]) || 0;
      if (qty <= 0) return; // slot beneran kosong (qty 0/null), bukan cuma nama kosong
      const key = rawName && String(rawName).trim() ? String(rawName).trim() : UNNAMED_LABEL;
      agg.set(key, (agg.get(key) || 0) + qty);
    });

    const data = Array.from(agg.entries())
      .map(([defect_name, qty]) => ({ defect_name, qty }))
      .sort((a, b) => b.qty - a.qty);

    const rowDate = row.tanggal
      ? row.tanggal instanceof Date
        ? row.tanggal.toISOString().slice(0, 10)
        : String(row.tanggal).slice(0, 10)
      : todayStr;

    res.json({ success: true, date: rowDate, data });
  } catch (err) {
    console.error("REJECT-DETAIL ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

//  GET /summary-all — ringkasan SEMUA line aktif sekaligus,
//  dipakai buat Master Dashboard (overview banyak line dalam
//  1 layar). Sengaja dipisah dari "GET /" yang detail per-line,
//  query-nya lebih ringan (gak ambil hourly/slot/personel) karena
//  bakal di-poll buat banyak line sekaligus.
//
//  Field yang dibalikin SENGAJA LENGKAP (output, oee, ppm,
//  stoptime, status running) — keputusan KPI mana yang dipakai
//  diserahkan ke frontend, soalnya requirement-nya dari management
//  belum final. Kalau berubah, cukup ubah tampilan kartu di
//  frontend, endpoint ini gak perlu disentuh lagi.
//
//  Urutan hasil: line "TIDAK RUNNING" muncul duluan, sisanya
//  alfabetis. Kalau nanti ada kriteria "bermasalah" lain (reject
//  tinggi dst, begitu ada threshold dari management), tinggal
//  ditambah di bagian sort di bawah.
router.get("/summary-all", async (req, res) => {
  try {
    const filterTempat = (req.query.tempat || "").trim() || null;
    let lines = getAllLines();
    if (filterTempat) {
      lines = lines.filter(
        (l) =>
          (l.tempat || "Internal").toLowerCase() === filterTempat.toLowerCase(),
      );
    }
    const wib = new Date(Date.now() + 7 * 3600 * 1000);

    const summaries = await Promise.all(
      lines.map(async (line) => {
        const { tanggal: fallbackDate, shiftStartWIB: fallbackShiftStartWIB } =
          resolveShiftAndDate(wib, line.shift_scheme);
        const lineNotRunning = isLineNotRunning(wib, fallbackShiftStartWIB);
        const yesterday = new Date(wib.getTime() - 86_400_000)
          .toISOString()
          .slice(0, 10);
        const todayStr = wib.toISOString().slice(0, 10);

        // Kolom hourly ditambahin ke SELECT — sebelumnya endpoint ini gak
        // narik ini sama sekali, jadi gak bisa bedain "row ada tapi udah
        // berhenti di tengah shift" (isRowStale) vs "beneran masih jalan".
        // Sekarang samain persis kayak GET / (drill-down per-line) di atas,
        // biar status Running/Tidak Running KONSISTEN di semua endpoint —
        // sumbernya emang sama-sama dari dashboard per line.
        const hourlySelects = HOURLY.flatMap((h, i) => [
          `${h.plan} AS hour_${hourlyColKey(i)}_plan`,
          `${h.actual} AS hour_${hourlyColKey(i)}_actual`,
        ]);

        const query = `
          SELECT
            ${COLS.tanggal}            AS tanggal,
            ${COLS.shift}              AS shift,
            ${COLS.output_plan}       AS output_plan,
            ${COLS.output_actual}     AS output_actual,
            ${COLS.qty_reject}        AS qty_reject,
            ${COLS.reject_ppm}        AS reject_ppm,
            ${COLS.stoptime_plan}     AS stoptime_plan,
            ${COLS.stoptime_actual}   AS stoptime_actual,
            ${COLS.stoptime_man}      AS stoptime_man,
            ${COLS.stoptime_machine}  AS stoptime_machine,
            ${COLS.stoptime_material} AS stoptime_material,
            ${COLS.stoptime_method}   AS stoptime_method,
            ${COLS.oee}               AS oee,
            rep_top_id                AS rep_top_id,
            ${hourlySelects.join(",\n            ")}
          FROM ${getViewForTempat(line.tempat)}
          WHERE ${COLS.line} = $1
            AND DATE(${COLS.tanggal}) IN ($2, $3)
        `;
        const result = await getPoolForTempat(line.tempat).query(query, [
          line.line_code,
          todayStr,
          yesterday,
        ]);
        const row = pickActiveRow(result.rows, wib, "shift");
        const shift = row ? row.shift : null;
        const tanggal = row
          ? row.tanggal instanceof Date
            ? row.tanggal.toISOString().slice(0, 10)
            : String(row.tanggal).slice(0, 10)
          : fallbackDate;

        // shiftStartWIB dari LABEL ASLI row (bukan tebakan config) — sama
        // pola persis kayak rowShiftStartWIB di GET / (drill-down per-line).
        const parsedFromRow = row ? parseShiftLabel(row.shift) : null;
        const rowShiftStartWIB =
          row && parsedFromRow
            ? shiftWindowFromLabel(tanggal, parsedFromRow.scheme, parsedFromRow.shiftNum)
                .startWIB
            : fallbackShiftStartWIB;
        const hourly = row
          ? HOURLY.map((h, i) => {
              const key = hourlyColKey(i);
              return {
                slot: h.label,
                output_actual:
                  row[`hour_${key}_actual`] != null
                    ? Number(row[`hour_${key}_actual`])
                    : null,
              };
            })
          : null;
        const lineStatus = getLineStatus3({
          hasRow: Boolean(row),
          hourly,
          shiftStartWIB: rowShiftStartWIB,
          nowWIB: wib,
        });

        const output_plan = Number(row?.output_plan) || 0;
        const output_actual = Number(row?.output_actual) || 0;
        const stoptime_plan = Number(row?.stoptime_plan) || 0;
        const stoptime_actual = Number(row?.stoptime_actual) || 0;

        return {
          line_code: line.line_code,
          description: line.description,
          shift_scheme: line.shift_scheme,
          tempat: line.tempat || "Internal",
          shift,
          tanggal,
          line_not_running: lineStatus !== "running",
          line_status: lineStatus,
          has_data: Boolean(row),
          output_plan,
          output_actual,
          deviasi_target: output_actual - output_plan,
          qty_reject: Number(row?.qty_reject) || 0,
          reject_ppm: Number(row?.reject_ppm) || 0,
          stoptime_total: stoptime_plan - stoptime_actual,
          stoptime_man: Number(row?.stoptime_man) || 0,
          stoptime_machine: Number(row?.stoptime_machine) || 0,
          stoptime_material: Number(row?.stoptime_material) || 0,
          stoptime_method: Number(row?.stoptime_method) || 0,
          oee: Number(row?.oee) || 0,
        };
      }),
    );

    // Bermasalah (tidak running) duluan, sisanya alfabetis
    summaries.sort((a, b) => {
      if (a.line_not_running !== b.line_not_running) {
        return a.line_not_running ? -1 : 1;
      }
      return a.line_code.localeCompare(b.line_code);
    });

    res.json({ success: true, data: summaries });
  } catch (err) {
    console.error("SUMMARY-ALL ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

//  GET /summary-by-tempat — agregasi per tempat (Internal/SGP/Systech)
//  Dipakai buat tabel akumulasi Master Dashboard baru.
//  Return 3 row maks, masing-masing berisi:
//    - jumlah_line, running_count, not_running_count
//    - total output_plan, output_actual, pct_achievement
//    - avg_oee, total_qty_reject, total_stoptime
//    - preview: 5 line teratas (prioritas tidak running)
router.get("/summary-by-tempat", async (req, res) => {
  try {
    const allLines = getAllLines();
    const wib = new Date(Date.now() + 7 * 3600 * 1000);

    // Ambil data tiap line (sama seperti summary-all tapi kita group sendiri)
    const lineResults = await Promise.all(
      allLines.map(async (line) => {
        const { tanggal: fallbackDate, shiftStartWIB: fallbackShiftStartWIB } =
          resolveShiftAndDate(wib, line.shift_scheme);
        const yesterday = new Date(wib.getTime() - 86_400_000)
          .toISOString()
          .slice(0, 10);
        const todayStr = wib.toISOString().slice(0, 10);

        // Hourly ditambahin — sama alasannya kayak /summary-all di atas,
        // biar status Running/Tidak Running konsisten (isRowStale), bukan
        // "row ada = Running" doang.
        const hourlySelects = HOURLY.flatMap((h, i) => [
          `${h.plan} AS hour_${hourlyColKey(i)}_plan`,
          `${h.actual} AS hour_${hourlyColKey(i)}_actual`,
        ]);

        const query = `
          SELECT
            ${COLS.tanggal}          AS tanggal,
            ${COLS.shift}            AS shift,
            ${COLS.output_plan}     AS output_plan,
            ${COLS.output_actual}   AS output_actual,
            ${COLS.qty_reject}      AS qty_reject,
            ${COLS.stoptime_plan}   AS stoptime_plan,
            ${COLS.stoptime_actual} AS stoptime_actual,
            ${COLS.oee}             AS oee,
            ${hourlySelects.join(",\n            ")}
          FROM ${getViewForTempat(line.tempat)}
          WHERE ${COLS.line} = $1
            AND DATE(${COLS.tanggal}) IN ($2, $3)
        `;
        const result = await getPoolForTempat(line.tempat).query(query, [
          line.line_code,
          todayStr,
          yesterday,
        ]);
        const row = pickActiveRow(result.rows, wib, "shift");
        const shift = row ? row.shift : null;
        const tanggal = row
          ? row.tanggal instanceof Date
            ? row.tanggal.toISOString().slice(0, 10)
            : String(row.tanggal).slice(0, 10)
          : fallbackDate;

        const parsedFromRow = row ? parseShiftLabel(row.shift) : null;
        const rowShiftStartWIB =
          row && parsedFromRow
            ? shiftWindowFromLabel(tanggal, parsedFromRow.scheme, parsedFromRow.shiftNum)
                .startWIB
            : fallbackShiftStartWIB;
        const hourly = row
          ? HOURLY.map((h, i) => {
              const key = hourlyColKey(i);
              return {
                slot: h.label,
                output_actual:
                  row[`hour_${key}_actual`] != null
                    ? Number(row[`hour_${key}_actual`])
                    : null,
              };
            })
          : null;
        const lineStatus = getLineStatus3({
          hasRow: Boolean(row),
          hourly,
          shiftStartWIB: rowShiftStartWIB,
          nowWIB: wib,
        });

        const output_plan = Number(row?.output_plan) || 0;
        const output_actual = Number(row?.output_actual) || 0;
        const stoptime_plan = Number(row?.stoptime_plan) || 0;
        const stoptime_actual = Number(row?.stoptime_actual) || 0;

        return {
          line_code: line.line_code,
          description: line.description,
          tempat: line.tempat || "Internal",
          shift,
          tanggal,
          line_not_running: lineStatus !== "running",
          line_status: lineStatus,
          has_data: Boolean(row),
          output_plan,
          output_actual,
          qty_reject: Number(row?.qty_reject) || 0,
          stoptime_total: stoptime_plan - stoptime_actual,
          oee: Number(row?.oee) || 0,
        };
      }),
    );

    // Group by tempat
    const ORDER = ["Internal", "SGP", "Systech"];
    const grouped = {};
    for (const tempat of ORDER) {
      grouped[tempat] = [];
    }
    for (const lr of lineResults) {
      const t = lr.tempat;
      if (!grouped[t]) grouped[t] = [];
      grouped[t].push(lr);
    }

    const result = ORDER.filter((t) => grouped[t].length > 0).map((tempat) => {
      const lines = grouped[tempat];
      const jumlah_line = lines.length;
      const running_count = lines.filter((l) => !l.line_not_running).length;
      const not_running_count = jumlah_line - running_count;
      const total_output_plan = lines.reduce((s, l) => s + l.output_plan, 0);
      const total_output_actual = lines.reduce(
        (s, l) => s + l.output_actual,
        0,
      );
      const pct_achievement =
        total_output_plan > 0
          ? Math.round((total_output_actual / total_output_plan) * 100)
          : 0;
      const oeeLines = lines.filter((l) => l.oee > 0);
      const avg_oee =
        oeeLines.length > 0
          ? Math.round(
              oeeLines.reduce((s, l) => s + l.oee, 0) / oeeLines.length,
            )
          : 0;
      const total_qty_reject = lines.reduce((s, l) => s + l.qty_reject, 0);
      const total_stoptime = lines.reduce((s, l) => s + l.stoptime_total, 0);

      // Preview: tidak running duluan, lalu alfabetis, ambil 5 teratas
      const preview = [...lines]
        .sort((a, b) => {
          if (a.line_not_running !== b.line_not_running)
            return a.line_not_running ? -1 : 1;
          return a.line_code.localeCompare(b.line_code);
        })
        .slice(0, 5)
        .map((l) => ({
          line_code: l.line_code,
          description: l.description,
          line_not_running: l.line_not_running,
          output_plan: l.output_plan,
          output_actual: l.output_actual,
          oee: l.oee,
        }));

      return {
        tempat,
        jumlah_line,
        running_count,
        not_running_count,
        total_output_plan,
        total_output_actual,
        pct_achievement,
        avg_oee,
        total_qty_reject,
        total_stoptime,
        preview,
      };
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("SUMMARY-BY-TEMPAT ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

//  GET /hourly-trend?tempat= — agregasi output per jam
//  Dipakai buat line chart trend di Master Dashboard.
//  Return array 25 slot { label, plan, actual } di mana:
//    - plan   = SUM output plan semua line aktif per slot
//    - actual = SUM output actual semua line aktif per slot
//    - slot yang semua line-nya NULL → plan=0, actual=0, hasData=false
router.get("/hourly-trend", async (req, res) => {
  try {
    const filterTempat = (req.query.tempat || "").trim() || null;
    let lines = getAllLines();
    if (filterTempat && filterTempat !== "Semua") {
      lines = lines.filter(
        (l) =>
          (l.tempat || "Internal").toLowerCase() === filterTempat.toLowerCase(),
      );
    }

    if (lines.length === 0) {
      const emptySlots = HOURLY.map((h) => ({
        label: h.label,
        plan: 0,
        actual: 0,
        hasData: false,
      }));
      return res.json({ success: true, data: emptySlots });
    }

    const wib = new Date(Date.now() + 7 * 3600 * 1000);

    // Query semua kolom hourly sekaligus per line (1 query per line)
    const lineData = await Promise.all(
      lines.map(async (line) => {
        const hourlySelects = HOURLY.map(
          (h, i) => `${h.plan} AS plan_${i}, ${h.actual} AS actual_${i}`,
        ).join(", ");
        const yesterday = new Date(wib.getTime() - 86_400_000)
          .toISOString()
          .slice(0, 10);
        const todayStr = wib.toISOString().slice(0, 10);

        const query = `
          SELECT ${COLS.tanggal} AS tanggal, ${COLS.shift} AS shift, ${hourlySelects}
          FROM ${getViewForTempat(line.tempat)}
          WHERE ${COLS.line} = $1
            AND DATE(${COLS.tanggal}) IN ($2, $3)
        `;
        const result = await getPoolForTempat(line.tempat).query(query, [
          line.line_code,
          todayStr,
          yesterday,
        ]);
        return pickActiveRow(result.rows, wib, "shift");
      }),
    );

    // Agregasi per slot — SUM semua line, skip NULL
    const slots = HOURLY.map((h, i) => {
      let planSum = 0;
      let actualSum = 0;
      let hasData = false;

      for (const row of lineData) {
        if (!row) continue;
        const p = Number(row[`plan_${i}`]);
        const a = Number(row[`actual_${i}`]);
        if (!isNaN(p) && row[`plan_${i}`] !== null) {
          planSum += p;
          actualSum += isNaN(a) ? 0 : a;
          hasData = true;
        }
      }

      return { label: h.label, plan: planSum, actual: actualSum, hasData };
    });

    res.json({ success: true, data: slots });
  } catch (err) {
    console.error("HOURLY-TREND ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

//  GET /daily-trend?tempat=&year=&month=
//  Trend output harian dalam 1 bulan, dipakai buat line chart
//  di Master Dashboard. Return array per tanggal:
//    { date, plan, actual, hasData }
//  Difilter by tempat (opsional). Year & month default ke bulan berjalan WIB.
router.get("/daily-trend", async (req, res) => {
  try {
    const filterTempat = (req.query.tempat || "").trim() || null;
    const wib = new Date(Date.now() + 7 * 3600 * 1000);
    const year = parseInt(req.query.year) || wib.getUTCFullYear();
    const month = parseInt(req.query.month) || wib.getUTCMonth() + 1;

    let lines = getAllLines();
    if (filterTempat && filterTempat !== "Semua") {
      lines = lines.filter(
        (l) =>
          (l.tempat || "Internal").toLowerCase() === filterTempat.toLowerCase(),
      );
    }

    if (lines.length === 0) {
      return res.json({ success: true, data: [], year, month });
    }

    // Group line_codes per tempat (beda tempat = berpotensi beda view & beda server DB)
    const codesByTempat = {};
    for (const l of lines) {
      const t = l.tempat || "Internal";
      (codesByTempat[t] ||= []).push(l.line_code);
    }

    // 1 query per tempat (GROUP BY tanggal), lalu digabung/di-SUM di JS
    const dataMap = {};
    for (const [tempatKey, lineCodes] of Object.entries(codesByTempat)) {
      const viewName = getViewForTempat(tempatKey);
      const query = `
        SELECT
          DATE(${COLS.tanggal}) AS tanggal,
          SUM(COALESCE(NULLIF(TRIM(${COLS.output_plan}::text), '')::numeric, 0)) AS plan,
          SUM(COALESCE(NULLIF(TRIM(${COLS.output_actual}::text), '')::numeric, 0)) AS actual
        FROM ${viewName}
        WHERE ${COLS.line} = ANY($1)
          AND EXTRACT(YEAR  FROM ${COLS.tanggal}) = $2
          AND EXTRACT(MONTH FROM ${COLS.tanggal}) = $3
        GROUP BY DATE(${COLS.tanggal})
        ORDER BY 1 ASC
      `;
      const result = await getPoolForTempat(tempatKey).query(query, [
        lineCodes,
        year,
        month,
      ]);
      for (const row of result.rows) {
        const d =
          row.tanggal instanceof Date
            ? row.tanggal.toISOString().slice(0, 10)
            : String(row.tanggal).slice(0, 10);
        const prev = dataMap[d] || { plan: 0, actual: 0 };
        dataMap[d] = {
          plan: prev.plan + (Number(row.plan) || 0),
          actual: prev.actual + (Number(row.actual) || 0),
        };
      }
    }

    // Generate semua hari dalam bulan tsb (1 s.d. akhir bulan)
    const daysInMonth = new Date(year, month, 0).getDate();
    const data = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const entry = dataMap[dateStr];
      // Hari di masa depan → hasData = false
      const isFuture = new Date(dateStr) > wib;
      data.push({
        date: dateStr,
        day: d,
        plan: entry?.plan ?? 0,
        actual: entry?.actual ?? 0,
        hasData: !isFuture && Boolean(entry),
      });
    }

    res.json({ success: true, data, year, month });
  } catch (err) {
    console.error("DAILY-TREND ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

//  GET /monthly-summary?tempat=&year=&month=
//  Agregasi SATU BULAN PENUH (bukan per-hari) buat KPI card
//  bulanan + breakdown 4M bulanan di Master Dashboard.
//  Difilter by tempat (opsional, sama kayak /daily-trend).
//  Year & month default ke bulan berjalan WIB.
router.get("/monthly-summary", async (req, res) => {
  try {
    const filterTempat = (req.query.tempat || "").trim() || null;
    const wib = new Date(Date.now() + 7 * 3600 * 1000);
    const year = parseInt(req.query.year) || wib.getUTCFullYear();
    const month = parseInt(req.query.month) || wib.getUTCMonth() + 1;

    let lines = getAllLines();
    if (filterTempat && filterTempat !== "Semua") {
      lines = lines.filter(
        (l) =>
          (l.tempat || "Internal").toLowerCase() === filterTempat.toLowerCase(),
      );
    }

    const empty = {
      output_plan: 0,
      output_actual: 0,
      pct_achievement: 0,
      qty_reject: 0,
      reject_ppm: 0,
      stoptime_total: 0,
      stoptime_man: 0,
      stoptime_machine: 0,
      stoptime_material: 0,
      stoptime_method: 0,
      stoptime_other: 0,
    };

    if (lines.length === 0) {
      return res.json({
        success: true,
        data: empty,
        year,
        month,
        tempat: filterTempat || "Semua",
      });
    }

    const lineCodes = lines.map((l) => l.line_code);
    const numeric = (col) =>
      `COALESCE(NULLIF(TRIM(${col}::text), '')::numeric, 0)`;

    // Group line_codes per tempat (beda tempat = berpotensi beda view & beda server DB)
    const codesByTempat = {};
    for (const l of lines) {
      const t = l.tempat || "Internal";
      (codesByTempat[t] ||= []).push(l.line_code);
    }

    const SUM_FIELDS = [
      "output_plan",
      "output_actual",
      "qty_reject",
      "stoptime_plan",
      "stoptime_actual",
      "stoptime_man",
      "stoptime_machine",
      "stoptime_material",
      "stoptime_method",
    ];
    const totals = Object.fromEntries(SUM_FIELDS.map((f) => [f, 0]));

    for (const [tempatKey, codes] of Object.entries(codesByTempat)) {
      const viewName = getViewForTempat(tempatKey);
      const query = `
        SELECT
          SUM(${numeric(COLS.output_plan)})       AS output_plan,
          SUM(${numeric(COLS.output_actual)})     AS output_actual,
          SUM(${numeric(COLS.qty_reject)})        AS qty_reject,
          SUM(${numeric(COLS.stoptime_plan)})     AS stoptime_plan,
          SUM(${numeric(COLS.stoptime_actual)})   AS stoptime_actual,
          SUM(${numeric(COLS.stoptime_man)})      AS stoptime_man,
          SUM(${numeric(COLS.stoptime_machine)})  AS stoptime_machine,
          SUM(${numeric(COLS.stoptime_material)}) AS stoptime_material,
          SUM(${numeric(COLS.stoptime_method)})   AS stoptime_method
        FROM ${viewName}
        WHERE ${COLS.line} = ANY($1)
          AND EXTRACT(YEAR  FROM ${COLS.tanggal}) = $2
          AND EXTRACT(MONTH FROM ${COLS.tanggal}) = $3
      `;
      const result = await getPoolForTempat(tempatKey).query(query, [
        codes,
        year,
        month,
      ]);
      const row = result.rows[0] || {};
      for (const f of SUM_FIELDS) {
        totals[f] += Number(row[f]) || 0;
      }
    }

    const {
      output_plan,
      output_actual,
      qty_reject,
      stoptime_plan,
      stoptime_actual,
    } = totals;

    const data = {
      output_plan,
      output_actual,
      pct_achievement:
        output_plan > 0 ? Math.round((output_actual / output_plan) * 100) : 0,
      qty_reject,
      // PPM dihitung ulang dari total sebulan (bukan rata-rata PPM harian)
      reject_ppm:
        output_actual > 0
          ? Math.round((qty_reject / output_actual) * 1_000_000)
          : 0,
      stoptime_total: stoptime_plan - stoptime_actual,
      stoptime_man: totals.stoptime_man,
      stoptime_machine: totals.stoptime_machine,
      stoptime_material: totals.stoptime_material,
      stoptime_method: totals.stoptime_method,
      stoptime_other: 0, // kolom "Other" belum ada di DB
    };

    res.json({
      success: true,
      data,
      year,
      month,
      tempat: filterTempat || "Semua",
    });
  } catch (err) {
    console.error("MONTHLY-SUMMARY ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

//  GET /summary-all-monthly?tempat=&year=&month= — ringkasan SATU BULAN
//  PENUH per line (bukan cuma shift/hari berjalan), dipakai buat tabel
//  ranking "Top Output Terendah / Top Reject Terbanyak / Top Stoptime
//  Terbanyak" di Master Dashboard — supaya ranking ini ikut month picker
//  yang sama dengan Trend Output Harian & KPI Bulanan, bukan cuma
//  nunjukkin kondisi hari ini. line_not_running tetap dihitung REAL-TIME
//  (kondisi line saat endpoint dipanggil), karena "sedang jalan atau
//  tidak" itu konsepnya sesaat, bukan sesuatu yang bisa diakumulasi
//  sebulan. Year & month default ke bulan berjalan WIB.
router.get("/summary-all-monthly", async (req, res) => {
  try {
    const filterTempat = (req.query.tempat || "").trim() || null;
    const wib = new Date(Date.now() + 7 * 3600 * 1000);
    const year = parseInt(req.query.year) || wib.getUTCFullYear();
    const month = parseInt(req.query.month) || wib.getUTCMonth() + 1;

    let lines = getAllLines();
    if (filterTempat) {
      lines = lines.filter(
        (l) =>
          (l.tempat || "Internal").toLowerCase() === filterTempat.toLowerCase(),
      );
    }

    const numeric = (col) =>
      `COALESCE(NULLIF(TRIM(${col}::text), '')::numeric, 0)`;

    const summaries = await Promise.all(
      lines.map(async (line) => {
        const { shiftStartWIB } = resolveShiftAndDate(wib, line.shift_scheme);
        const lineNotRunning = isLineNotRunning(wib, shiftStartWIB);

        const query = `
          SELECT
            SUM(${numeric(COLS.output_plan)})       AS output_plan,
            SUM(${numeric(COLS.output_actual)})     AS output_actual,
            SUM(${numeric(COLS.qty_reject)})        AS qty_reject,
            SUM(${numeric(COLS.stoptime_plan)})     AS stoptime_plan,
            SUM(${numeric(COLS.stoptime_actual)})   AS stoptime_actual,
            AVG(${numeric(COLS.oee)})               AS oee,
            COUNT(*) AS records
          FROM ${getViewForTempat(line.tempat)}
          WHERE ${COLS.line} = $1
            AND EXTRACT(YEAR  FROM ${COLS.tanggal}) = $2
            AND EXTRACT(MONTH FROM ${COLS.tanggal}) = $3
        `;
        const result = await getPoolForTempat(line.tempat).query(query, [
          line.line_code,
          year,
          month,
        ]);
        const row = result.rows[0] || null;

        const output_plan = Number(row?.output_plan) || 0;
        const output_actual = Number(row?.output_actual) || 0;
        const stoptime_plan = Number(row?.stoptime_plan) || 0;
        const stoptime_actual = Number(row?.stoptime_actual) || 0;

        return {
          line_code: line.line_code,
          description: line.description,
          tempat: line.tempat || "Internal",
          year,
          month,
          line_not_running: lineNotRunning,
          has_data: Number(row?.records) > 0,
          output_plan,
          output_actual,
          qty_reject: Number(row?.qty_reject) || 0,
          stoptime_total: stoptime_plan - stoptime_actual,
          oee: Math.round((Number(row?.oee) || 0) * 10) / 10,
        };
      }),
    );

    res.json({ success: true, data: summaries, year, month });
  } catch (err) {
    console.error("SUMMARY-ALL-MONTHLY ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

//  GET /line-range-breakdown?tempat=&start=&end= — breakdown PER LINE
//  buat CUSTOM DATE RANGE bebas (start/end format YYYY-MM-DD, boleh
//  lintas bulan). Beda dari /summary-all-monthly (terkunci 1 bulan
//  kalender): di sini per line dapet totals kumulatif (plan/actual/
//  reject/bekidoritsu/deviasi) SEKALIGUS breakdown plan/actual PER
//  TANGGAL — dipakai tabel "Breakdown per Line" yang bisa discroll
//  ke samping (1 pasang kolom Plan/Actual per tanggal).
router.get("/line-range-breakdown", async (req, res) => {
  try {
    const filterTempat = (req.query.tempat || "").trim() || null;
    const start = String(req.query.start || "");
    const end = String(req.query.end || "");
    const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

    if (!isValidDate(start) || !isValidDate(end) || start > end) {
      return res.status(400).json({
        success: false,
        message: "Parameter start/end wajib format YYYY-MM-DD dan start <= end",
      });
    }

    const result = await getLineRangeBreakdown(filterTempat, start, end);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("LINE-RANGE-BREAKDOWN ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

//  GET /summary-all-daily?date=YYYY-MM-DD — akumulasi per line UNTUK
//  1 TANGGAL SPESIFIK (gabung semua shift di tanggal itu). Dipakai buat
//  panel "Ranking Line" di Master Dashboard yang butuh ranking harian,
//  bukan bulanan — mirip /summary-all-monthly tapi filter tanggal persis,
//  bukan EXTRACT year/month.
router.get("/summary-all-daily", async (req, res) => {
  try {
    const filterTempat = (req.query.tempat || "").trim() || null;
    const wib = new Date(Date.now() + 7 * 3600 * 1000);
    const todayStr = `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, "0")}-${String(wib.getUTCDate()).padStart(2, "0")}`;
    const dateParam = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || "")
      ? req.query.date
      : todayStr;

    let lines = getAllLines();
    if (filterTempat) {
      lines = lines.filter(
        (l) =>
          (l.tempat || "Internal").toLowerCase() === filterTempat.toLowerCase(),
      );
    }

    const numeric = (col) =>
      `COALESCE(NULLIF(TRIM(${col}::text), '')::numeric, 0)`;

    const summaries = await Promise.all(
      lines.map(async (line) => {
        const { shiftStartWIB } = resolveShiftAndDate(wib, line.shift_scheme);
        const lineNotRunning = isLineNotRunning(wib, shiftStartWIB);

        const query = `
          SELECT
            SUM(${numeric(COLS.output_plan)})       AS output_plan,
            SUM(${numeric(COLS.output_actual)})     AS output_actual,
            SUM(${numeric(COLS.qty_reject)})        AS qty_reject,
            SUM(${numeric(COLS.stoptime_plan)})     AS stoptime_plan,
            SUM(${numeric(COLS.stoptime_actual)})   AS stoptime_actual,
            SUM(${numeric(COLS.stoptime_man)})      AS stoptime_man,
            SUM(${numeric(COLS.stoptime_machine)})  AS stoptime_machine,
            SUM(${numeric(COLS.stoptime_material)}) AS stoptime_material,
            SUM(${numeric(COLS.stoptime_method)})   AS stoptime_method,
            AVG(${numeric(COLS.oee)})               AS oee,
            COUNT(*) AS records,
            -- rep_top_id NAIK terus tiap insert (lihat seedTestData.js),
            -- jadi MAX(rep_top_id) = dokumen/report TERAKHIR line ini di
            -- tanggal ini (shift terbaru). Dipakai frontend buat link
            -- "Buka PCB" (ConMasManager InputReport/Details?repTopId=).
            MAX(rep_top_id) AS rep_top_id
          FROM ${getViewForTempat(line.tempat)}
          WHERE ${COLS.line} = $1
            AND DATE(${COLS.tanggal}) = $2
        `;
        const result = await getPoolForTempat(line.tempat).query(query, [
          line.line_code,
          dateParam,
        ]);
        const row = result.rows[0] || null;
        const hasDataToday = Number(row?.records) > 0;

        const output_plan = Number(row?.output_plan) || 0;
        const output_actual = Number(row?.output_actual) || 0;
        const stoptime_plan = Number(row?.stoptime_plan) || 0;
        const stoptime_actual = Number(row?.stoptime_actual) || 0;

        return {
          line_code: line.line_code,
          description: line.description,
          tempat: line.tempat || "Internal",
          date: dateParam,
          // ⚠️ FIX bug "Tidak Running padahal jalan" (elapsed-time false
          // positive): flag cuma nyala kalau emang BENERAN gak ada data,
          // bukan semata waktu — lihat services/summaryService.js.
          //
          // ⚠️ FIX bug KEDUA "semua line jadi Running pas backdate": versi
          // sebelumnya nge-hardcode `false` buat SEMUA tanggal selain hari
          // ini, jadi backdate ke tanggal yang emang 0 data pun tetap
          // ke-flag Running. Bedanya cuma DASAR pengecekannya:
          //   - Hari ini   → pakai `lineNotRunning` (elapsed time sejak
          //                  mulai shift), karena datanya BISA SAJA belum
          //                  masuk cuma karena belum lewat window toleransi.
          //   - Tanggal lain (lampau) → hari itu udah lewat sepenuhnya,
          //                  jadi elapsed-time gak relevan lagi. Cukup cek
          //                  hasDataToday: kalau 0 record buat SELURUH hari
          //                  itu, ya emang Tidak Running, titik.
          line_not_running:
            !hasDataToday && (dateParam === todayStr ? lineNotRunning : true),
          has_data: hasDataToday,
          rep_top_id: row?.rep_top_id != null ? Number(row.rep_top_id) : null,
          output_plan,
          output_actual,
          qty_reject: Number(row?.qty_reject) || 0,
          stoptime_total: stoptime_plan - stoptime_actual,
          stoptime_man: Number(row?.stoptime_man) || 0,
          stoptime_machine: Number(row?.stoptime_machine) || 0,
          stoptime_material: Number(row?.stoptime_material) || 0,
          stoptime_method: Number(row?.stoptime_method) || 0,
          oee: Math.round((Number(row?.oee) || 0) * 10) / 10,
        };
      }),
    );

    res.json({ success: true, data: summaries, date: dateParam });
  } catch (err) {
    console.error("SUMMARY-ALL-DAILY ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
