// Tanggung jawab: manggil endpoint /api/external/summary di server subcont
// (lewat HTTP, via Caddy) dengan timeout pendek — karena ini public IP,
// bukan jaringan private yang stabil, jangan sampai 1 subcont yang lemot/
// down bikin Master ikut nge-hang.

const axios = require("axios");
const { getLatestPush } = require("./pushStore");

const TIMEOUT_MS = 5000; // pendek sengaja — subcont lemot lebih baik cepat dianggap gagal

// path endpoint /api/external/<path> → type yang dipakai di push-sync
// (routes/sync.js & pushSyncService.js). Dipakai buat cari data fallback
// yang PERSIS sama jenisnya kalau pull HTTP normal gagal.
//
// ⚠️ "/monthly-summary" SENGAJA gak masuk mapping statis ini — dia
// PUNYA PARAMETER (year, month) yang menentukan jenis datanya, bukan
// cuma nama path doang. Kalau di-treat sama kayak yang lain (mapping
// statis "/monthly-summary" -> "monthly-summary"), fallback bakal
// balikin cache "monthly-summary" TERAKHIR gak peduli bulan APA yang
// diminta — itu bug yang bikin Jan s.d. Des semua nampilin actual yang
// SAMA (bahkan bulan yang belum kejadian pun ikutan "ada" datanya).
// Ditangani manual di getPushTypeForPath() di bawah biar year+month
// ikut jadi bagian identitas type-nya.
const PATH_TO_PUSH_TYPE = {
  "/summary": "summary",
  "/monthly-trend": "monthly-trend",
  "/range-trend": "range-trend",
  // "Dashboard Utama" (dibuka dari Master Hub buat SGP/Systech) — 2 dari
  // 5 endpoint-nya gak ada parameter (statis, kayak "/summary"), sisanya
  // (year/month/date) ditangani manual di getPushTypeForPath() di bawah.
  "/dashboard/summary-all": "dashboard-summary-all",
  "/dashboard/summary-by-tempat": "dashboard-summary-by-tempat",
};

function getPushTypeForPath(path) {
  const [base, query = ""] = path.split("?");
  if (base === "/monthly-summary") {
    const params = new URLSearchParams(query);
    const year = params.get("year");
    const month = params.get("month");
    // Gak ada year/month di query -> jangan asal fallback, biar aman.
    if (!year || !month) return null;
    return `monthly-summary-${year}-${month}`;
  }
  if (base === "/line-range-breakdown") {
    // Sama alasannya kayak /monthly-summary di atas: gak masuk mapping
    // statis karena identitas type-nya ikut parameter (start), bukan cuma
    // nama path. Frontend SELALU minta 1 bulan penuh (tgl 1 s.d. akhir
    // bulan — lihat BreakdownTempat.jsx monthRange()), jadi year-month
    // cukup diambil dari `start` (format YYYY-MM-DD).
    const params = new URLSearchParams(query);
    const start = params.get("start") || "";
    const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(start);
    if (!match) return null;
    const [, year, monthPadded] = match;
    return `line-range-breakdown-${year}-${Number(monthPadded)}`;
  }
  if (base === "/dashboard/daily-trend" || base === "/dashboard/monthly-summary") {
    const params = new URLSearchParams(query);
    const year = params.get("year");
    const month = params.get("month");
    if (!year || !month) return null;
    const kind = base === "/dashboard/daily-trend" ? "daily-trend" : "monthly-summary";
    return `dashboard-${kind}-${year}-${month}`;
  }
  if (base === "/dashboard/summary-all-daily") {
    // Beda sama /summary yang defaultnya "shift berjalan" kalau ?date=
    // kosong — di sini kalau ?date= kosong sengaja gak di-fallback (return
    // null), soalnya push-sync CUMA nyimpen HARI BERJALAN (lihat
    // pushSyncService.js), jadi gak ada cara mastiin "hari ini WIB versi
    // Master" sama persis kayak "hari ini versi push terakhir SGP/Systech"
    // tanpa tanggal eksplisit dari caller.
    const params = new URLSearchParams(query);
    const date = params.get("date") || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    return `dashboard-summary-all-daily-${date}`;
  }
  return PATH_TO_PUSH_TYPE[base] || null;
}

// Umur maksimum data push yang masih boleh dipakai sebagai fallback.
// Bisa dituning lewat .env kalau interval push-nya diubah dari default 1 menit.
const PUSH_FALLBACK_MAX_AGE_MS =
  Number(process.env.PUSH_FALLBACK_MAX_AGE_MS) || 5 * 60 * 1000;

// ⚠️ BUG LAMA: "monthly-summary-YYYY-M" buat bulan yang UDAH LEWAT (bukan
// bulan berjalan) selalu ke-reject dianggap "basi" oleh cek umur 5 menit
// di atas — padahal pushSyncService.js di SGP/Systech CUMA push tipe
// bulan BERJALAN (lihat komentar di sana), jadi begitu bulan itu tutup,
// row terakhirnya di subcont_push_latest emang gak akan di-refresh LAGI
// SELAMANYA. Umurnya bakal terus nambah (berhari-hari, berbulan-bulan) dan
// SELALU lebih dari 5 menit, walau ISINYA valid selamanya (angka final
// bulan yang udah closed, gak akan berubah lagi). Ini yang bikin Executive
// Dashboard nampilin actual SGP/Systech = 0 begitu pindah ke bulan lalu,
// padahal datanya beneran ada, cuma ke-filter salah sebagai "stale".
//
// Fix: kalau tipe push-nya "monthly-summary" DAN bulan yang diminta bukan
// bulan berjalan (WIB) lagi, skip cek umur sama sekali (maxAge = Infinity)
// — anggap data final, gak pernah basi. Bulan BERJALAN tetap pakai cek
// umur normal (5 menit), karena angkanya masih bisa berubah tiap saat.
function isClosedMonth(year, month) {
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  const curYear = wib.getUTCFullYear();
  const curMonth = wib.getUTCMonth() + 1;
  return year < curYear || (year === curYear && month < curMonth);
}

// Sama alasannya kayak isClosedMonth di atas, versi HARI — dipakai buat
// "dashboard-summary-all-daily-YYYY-MM-DD" (push-sync cuma nyimpen HARI
// BERJALAN, jadi begitu hari itu lewat, row-nya gak di-refresh lagi
// walau datanya masih valid/final selamanya).
function isClosedDay(dateStr) {
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  const todayStr = `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, "0")}-${String(wib.getUTCDate()).padStart(2, "0")}`;
  return dateStr < todayStr;
}

// Berlaku buat semua type yang di-key per year-month ("monthly-summary",
// "line-range-breakdown", "dashboard-daily-trend", "dashboard-monthly-
// summary") — kesemuanya cuma dipush buat BULAN BERJALAN (lihat
// pushSyncService.js), jadi begitu bulan tutup, row terakhirnya gak akan
// di-refresh lagi selamanya walau isinya masih valid/final.
function resolveMaxAgeForPushType(pushType) {
  const monthMatch =
    /^(?:monthly-summary|line-range-breakdown|dashboard-daily-trend|dashboard-monthly-summary)-(\d+)-(\d+)$/.exec(
      pushType,
    );
  if (monthMatch) {
    const [, y, m] = monthMatch;
    if (isClosedMonth(Number(y), Number(m))) {
      return Infinity; // bulan udah tutup, data final, gak akan di-push ulang lagi
    }
    return PUSH_FALLBACK_MAX_AGE_MS;
  }

  const dayMatch = /^dashboard-summary-all-daily-(\d{4}-\d{2}-\d{2})$/.exec(pushType);
  if (dayMatch) {
    if (isClosedDay(dayMatch[1])) {
      return Infinity; // hari udah lewat, data final, gak akan di-push ulang lagi
    }
    return PUSH_FALLBACK_MAX_AGE_MS;
  }

  return PUSH_FALLBACK_MAX_AGE_MS;
}

// Coba ambil data push-sync terakhir sebagai FALLBACK — dipanggil cuma
// pas pull HTTP normal gagal (timeout/unreachable/error), BUKAN dipakai
// duluan. Kalau gak ada data push yang cukup fresh, balikin null dan
// pemanggil tetap pakai hasil error dari pull seperti biasa (perilaku lama).
async function tryPushFallback(sourceKey, source, path) {
  const pushType = getPushTypeForPath(path);
  if (!pushType) return null; // path ini belum ada di push-sync, atau /monthly-summary tanpa year/month

  const maxAge = resolveMaxAgeForPushType(pushType);
  const pushed = await getLatestPush(sourceKey, pushType, maxAge);
  if (!pushed) return null;

  return {
    source: sourceKey,
    label: source.label,
    status: "ok",
    message: `Fallback: data push-sync (umur ${Math.round(pushed.age_ms / 1000)}s), pull HTTP normal gagal`,
    data: pushed.data,
    remote_timestamp: pushed.payload_timestamp,
    via_push_fallback: true,
  };
}

// Inti pemanggilan HTTP — dipakai bareng fetchSourceSummary & fetchSourceTrend,
// bedanya cuma path & query string yang di-hit.
async function callExternal(sourceKey, source, path, timeoutMs = TIMEOUT_MS) {
  if (!source.active) {
    // Kredensial pull belum diisi — tetep coba push fallback kalau ada,
    // biar Master tetap bisa nampilin data SGP/Systech walau pull-nya
    // memang belum pernah disetup sama sekali (bukan cuma lagi down).
    const pushFallback = await tryPushFallback(sourceKey, source, path);
    if (pushFallback) return pushFallback;

    return {
      source: sourceKey,
      label: source.label,
      status: "inactive",
      message: "Kredensial/URL belum dikonfigurasi",
      data: null,
    };
  }

  try {
    const res = await axios.get(`${source.baseUrl}${path}`, {
      headers: { "x-api-key": source.apiKey },
      timeout: timeoutMs,
      validateStatus: () => true, // kita tangani status code manual di bawah
    });

    if (res.status === 403) {
      return {
        source: sourceKey,
        label: source.label,
        status: "unauthorized",
        message: "API key ditolak subcont — cek EXTERNAL_API_KEY",
        data: null,
      };
    }

    if (res.status !== 200 || !res.data) {
      const pushFallback = await tryPushFallback(sourceKey, source, path);
      if (pushFallback) return pushFallback;
      return {
        source: sourceKey,
        label: source.label,
        status: "error",
        message: `HTTP ${res.status} dari subcont`,
        data: null,
      };
    }

    // Body-nya sendiri bisa berisi status:"error" (misal DB subcont down) —
    // itu tetap HTTP 200, jadi diteruskan apa adanya ke pemanggil.
    return {
      source: sourceKey,
      label: source.label,
      status: res.data.status || "ok",
      message: res.data.message || null,
      data: res.data.data || null,
      remote_timestamp: res.data.timestamp || null,
    };
  } catch (err) {
    // Pull normal gagal (timeout/unreachable) — ini kasus utama yang
    // dikejar fitur push-sync: Tailscale/tunnel putus tapi Master masih
    // bisa nampilin data terakhir yang SGP/Systech push lewat jalur lain.
    const pushFallback = await tryPushFallback(sourceKey, source, path);
    if (pushFallback) return pushFallback;

    const timedOut = err.code === "ECONNABORTED";
    return {
      source: sourceKey,
      label: source.label,
      status: timedOut ? "timeout" : "unreachable",
      message: timedOut ? `Timeout > ${timeoutMs}ms` : err.code || err.message,
      data: null,
    };
  }
}

// Selalu resolve (gak pernah throw) — pemanggil (master.js) cukup cek field
// "status" di hasilnya, gak perlu try/catch per source.
function fetchSourceSummary(sourceKey, source, date) {
  const path = date ? `/summary?date=${date}` : "/summary";
  return callExternal(sourceKey, source, path);
}

function fetchSourceTrend(sourceKey, source, year, month) {
  return callExternal(
    sourceKey,
    source,
    `/monthly-trend?year=${year}&month=${month}`,
  );
}

function fetchSourceMonthlySummary(sourceKey, source, year, month) {
  return callExternal(
    sourceKey,
    source,
    `/monthly-summary?year=${year}&month=${month}`,
  );
}

// Buat halaman "Breakdown Tren" — start/end format YYYY-MM-DD.
function fetchSourceRangeTrend(sourceKey, source, start, end) {
  return callExternal(
    sourceKey,
    source,
    `/range-trend?start=${start}&end=${end}`,
  );
}

// Buat halaman "Breakdown per Line" pas dibuka lewat Master buat lokasi
// subcont (SGP/Systech) — query-nya jalan PER LINE di sisi subcont (bisa
// puluhan query kecil), jadi timeout default 5s kadang mepet. Dikasih
// timeout lebih longgar khusus endpoint ini lewat parameter ke-4 opsional.
function fetchSourceLineRangeBreakdown(sourceKey, source, start, end) {
  return callExternal(
    sourceKey,
    source,
    `/line-range-breakdown?start=${start}&end=${end}`,
    15000, // 15s — lebih longgar dari default TIMEOUT_MS
  );
}

// 5 fungsi di bawah ini buat isi "Dashboard Utama" pas dibuka lewat Master
// Hub buat lokasi SGP/Systech (lihat routes/master.js /dashboard/*).
function fetchSourceDashboardSummaryAll(sourceKey, source) {
  return callExternal(sourceKey, source, "/dashboard/summary-all");
}

function fetchSourceDashboardSummaryByTempat(sourceKey, source) {
  return callExternal(sourceKey, source, "/dashboard/summary-by-tempat");
}

function fetchSourceDashboardSummaryAllDaily(sourceKey, source, date) {
  const path = date
    ? `/dashboard/summary-all-daily?date=${date}`
    : "/dashboard/summary-all-daily";
  return callExternal(sourceKey, source, path);
}

function fetchSourceDashboardDailyTrend(sourceKey, source, year, month) {
  return callExternal(
    sourceKey,
    source,
    `/dashboard/daily-trend?year=${year}&month=${month}`,
  );
}

function fetchSourceDashboardMonthlySummary(sourceKey, source, year, month) {
  return callExternal(
    sourceKey,
    source,
    `/dashboard/monthly-summary?year=${year}&month=${month}`,
  );
}

module.exports = {
  fetchSourceSummary,
  fetchSourceTrend,
  fetchSourceMonthlySummary,
  fetchSourceRangeTrend,
  fetchSourceLineRangeBreakdown,
  fetchSourceDashboardSummaryAll,
  fetchSourceDashboardSummaryByTempat,
  fetchSourceDashboardSummaryAllDaily,
  fetchSourceDashboardDailyTrend,
  fetchSourceDashboardMonthlySummary,
};