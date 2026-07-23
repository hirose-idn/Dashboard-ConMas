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
const PATH_TO_PUSH_TYPE = {
  "/summary": "summary",
  "/monthly-trend": "monthly-trend",
  "/range-trend": "range-trend",
  "/monthly-summary": "monthly-summary",
};

// Umur maksimum data push yang masih boleh dipakai sebagai fallback.
// Bisa dituning lewat .env kalau interval push-nya diubah dari default 1 menit.
const PUSH_FALLBACK_MAX_AGE_MS =
  Number(process.env.PUSH_FALLBACK_MAX_AGE_MS) || 5 * 60 * 1000;

// Coba ambil data push-sync terakhir sebagai FALLBACK — dipanggil cuma
// pas pull HTTP normal gagal (timeout/unreachable/error), BUKAN dipakai
// duluan. Kalau gak ada data push yang cukup fresh, balikin null dan
// pemanggil tetap pakai hasil error dari pull seperti biasa (perilaku lama).
async function tryPushFallback(sourceKey, source, path) {
  const pushType = PATH_TO_PUSH_TYPE[path.split("?")[0]];
  if (!pushType) return null; // path ini (mis. line-range-breakdown) belum ada di push-sync

  const pushed = await getLatestPush(sourceKey, pushType, PUSH_FALLBACK_MAX_AGE_MS);
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

module.exports = {
  fetchSourceSummary,
  fetchSourceTrend,
  fetchSourceMonthlySummary,
  fetchSourceRangeTrend,
  fetchSourceLineRangeBreakdown,
};