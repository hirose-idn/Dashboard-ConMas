// Backfill data HISTORI (tanggal/bulan yang udah lewat) ke push-sync
// Master — sekali jalan, gak perlu diulang tiap hari.
//
// KENAPA PERLU: pushSyncService.js (syncCycle, jalan tiap menit) CUMA
// push tanggal/bulan BERJALAN. Begitu Master gagal PULL (Tailscale/tunnel
// putus) buat tanggal/bulan yang UDAH LEWAT dan sebelumnya emang belum
// pernah ke-push, sourceClient.js gak punya fallback apa-apa (bukan cuma
// "basi" — datanya beneran gak ada). Script ini ngisi kekosongan itu.
//
// AMAN dijalanin di instance yang lagi LIVE (baca via loopback ke
// /api/external/*, gak nyentuh DB langsung), dan aman diulang-ulang
// (UPSERT per source+type di Master, lihat pushStore.js) — data histori
// yang udah closed dianggap final selamanya (isClosedDay/isClosedMonth di
// sourceClient.js), jadi sekali backfill sukses, gak akan basi lagi.
//
// JALANIN DI INSTANCE SGP/SYSTECH (bukan di Master), pastikan .env-nya
// udah ada PUSH_MASTER_URL & PUSH_SYNC_KEY & SOURCE_NAME (sama kayak yang
// dipakai pushSyncService biasa).
//
// Pakai:
//   node scripts/backfillPush.js --days=30 --months=6
//   node scripts/backfillPush.js --days=90 --months=0   (cuma harian)
//   node scripts/backfillPush.js --days=0 --months=12   (cuma bulanan)
//
// --days   = berapa hari ke belakang (dari KEMARIN, hari ini udah
//            di-cover syncCycle biasa) buat backfill
//            dashboard-summary-all-daily-YYYY-MM-DD. Default 30.
// --months = berapa bulan ke belakang (dari BULAN LALU, bulan berjalan
//            udah di-cover syncCycle biasa) buat backfill 4 type bulanan
//            (monthly-summary, line-range-breakdown, dashboard-daily-
//            trend, dashboard-monthly-summary). Default 6.

require("dotenv").config();

const {
  sendToMaster,
  collectDayPayload,
  collectMonthPayloads,
  MASTER_URL,
  SYNC_KEY,
  SOURCE_NAME,
} = require("../services/pushSyncService");

function parseArg(name, def) {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!found) return def;
  const val = Number(found.split("=")[1]);
  return Number.isFinite(val) && val >= 0 ? val : def;
}

const DAYS = parseArg("days", 30);
const MONTHS = parseArg("months", 6);
const DELAY_MS = 150; // jeda antar request biar gak nabrak rate limiter Master (400/menit)

function pad2(n) {
  return String(n).padStart(2, "0");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// WIB "sekarang", dipakai sebagai titik mulai mundur.
function nowWIB() {
  return new Date(Date.now() + 7 * 3600 * 1000);
}

function subtractDaysWIB(baseWib, n) {
  const d = new Date(baseWib.getTime() - n * 24 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

// Mundur N bulan dari (year, month) BERJALAN, balikin [{year, month}, ...]
// urut dari yang PALING LAMA duluan (biar kalau backfill kepotong di
// tengah, minimal bulan-bulan paling lama udah kekirim).
function pastMonths(year, month, n) {
  const out = [];
  for (let i = n; i >= 1; i--) {
    let m = month - i;
    let y = year;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    out.push({ year: y, month: m });
  }
  return out;
}

async function pushPayload(item) {
  try {
    await sendToMaster(item);
    console.log(`  OK   ${item.type}`);
    return true;
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error(`  GAGAL ${item.type}: ${detail}`);
    return false;
  }
}

async function main() {
  if (!MASTER_URL || !SYNC_KEY) {
    console.error(
      "❌ PUSH_MASTER_URL / PUSH_SYNC_KEY belum diisi di .env instance ini — backfill dibatalkan.",
    );
    process.exit(1);
  }
  if (!SOURCE_NAME || SOURCE_NAME === "internal") {
    console.error(
      "❌ SOURCE_NAME harus 'sgp' atau 'systech', bukan kosong/'internal' — backfill dibatalkan.",
    );
    process.exit(1);
  }

  console.log(
    `🔄 Backfill push-sync — source=${SOURCE_NAME}, target=${MASTER_URL}, days=${DAYS}, months=${MONTHS}\n`,
  );

  let okCount = 0;
  let failCount = 0;

  if (DAYS > 0) {
    console.log(`── Harian: ${DAYS} hari ke belakang (mulai dari kemarin) ──`);
    const base = nowWIB();
    // Urut dari paling lama ke paling baru — sama alasannya kayak
    // pastMonths di atas.
    for (let i = DAYS; i >= 1; i--) {
      const dateStr = subtractDaysWIB(base, i);
      const payload = await collectDayPayload(dateStr);
      if (!payload) {
        failCount++;
        continue;
      }
      const ok = await pushPayload(payload);
      ok ? okCount++ : failCount++;
      await sleep(DELAY_MS);
    }
    console.log("");
  }

  if (MONTHS > 0) {
    console.log(`── Bulanan: ${MONTHS} bulan ke belakang (mulai dari bulan lalu) ──`);
    const wib = nowWIB();
    const curYear = wib.getUTCFullYear();
    const curMonth = wib.getUTCMonth() + 1;
    const months = pastMonths(curYear, curMonth, MONTHS);
    for (const { year, month } of months) {
      console.log(` ${year}-${pad2(month)}:`);
      const payloads = await collectMonthPayloads(year, month);
      for (const payload of payloads) {
        const ok = await pushPayload(payload);
        ok ? okCount++ : failCount++;
        await sleep(DELAY_MS);
      }
    }
    console.log("");
  }

  console.log(`Selesai. Berhasil: ${okCount}, Gagal: ${failCount}`);
  if (failCount > 0) {
    console.log(
      "Yang gagal aman di-retry — jalanin ulang script ini (UPSERT per type, gak akan dobel/rusak yang udah sukses).",
    );
  }
}

main().catch((err) => {
  console.error("❌ Backfill berhenti karena error gak terduga:", err.message);
  process.exit(1);
});
