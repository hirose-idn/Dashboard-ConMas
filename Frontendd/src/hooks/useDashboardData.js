import { useState, useEffect, useCallback } from "react";
import { BASE_URL, REFRESH_MS, MOCK_DATA } from "../config/constants";
import { getTodayWIB } from "../config/utils";

const INITIAL_STATE = {
  tanggal: null,
  line: null,
  cl_no: null,
  nama_produk: null,
  cell_leader_nama: null,
  cycle_time_swi: null,
  cycle_time_actual: null,
  output_plan: 0,
  output_produksi: 0,
  deviasi_target: 0,
  qty_reject: 0,
  qty_reject_ppm: 0,
  stoptime_menit: 0,
  hourly: [],
  line_not_running: false,
  line_status: "running",

  ...MOCK_DATA,
  personnel: {
    ketua: { nama: null, no_karyawan: null, telp: null, foto: null, fotoFallback: null },
    pj_teknis: { nama: null, no_karyawan: null, telp: null, foto: null },
    inspector: { nama: null, no_karyawan: null, telp: null, foto: null, fotoFallback: null },
  },
  reject_detail: null,

  lastRefresh: null,
  loading: true,
  error: null,
  historical: false,
  available_shifts: [],
};

// Parse field "NIK,Nama" dari DB → { nik, nama }
function parsePersonnelField(raw) {
  if (!raw) return { nik: null, nama: null };
  const parts = String(raw).split(",");
  if (parts.length >= 2)
    return { nik: parts[0].trim(), nama: parts.slice(1).join(",").trim() };
  return /^\d+$/.test(raw.trim())
    ? { nik: raw.trim(), nama: null }
    : { nik: null, nama: raw.trim() };
}

function buildFotoUrl(nik, role) {
  if (!nik) return null;
  // Avatar component (ui/index.jsx) coba2 ekstensi .jpg/.jpeg/.png/.webp
  // sendiri lewat onError — cukup kasih base .jpg di sini, JANGAN pakai
  // /foto-resolve (gak kompatibel sama logic Avatar).
  //
  // `role` OPSIONAL — buat kasus 1 NIK bisa punya 2 role beda seragam/foto
  // (mis. Cell Leader vs Inspector). Kalau diisi, filename jadi
  // "<nik>_<role>.jpg"; kalau belum ada file-nya, Avatar fallback ke foto
  // generic "<nik>.jpg" lewat prop `fotoFallback`.
  const base = role ? `${nik}_${role}` : nik;
  return `${BASE_URL}/foto/${base}.jpg`;
}

// `date` opsional (YYYY-MM-DD) — diisi cuma pas dashboard per-line ini
// dibuka dari Master Dashboard yang lagi di-backdate (lihat App.jsx
// selectLine + MasterDashboard.jsx rankingDate). Kalau kosong, behavior
// PERSIS kayak sebelumnya (live, ikut shift yang lagi jalan SEKARANG).
// ⚠️ Mode remote (proxy lewat Master buat line SGP/Systech) BELUM support
// backdate — proxy /api/master/dashboard/line-* itu "versi ringkas" yang
// juga skip reject-detail/foto, jadi date di-skip di situ, konsisten sama
// batasan yang udah ada.
export default function useDashboardData(lineCode, remoteSource, date, shiftOverride) {
  const [state, setState] = useState(INITIAL_STATE);
  const isHistorical = Boolean(date) && !remoteSource;

  const refresh = useCallback(async () => {
    if (!lineCode) return; // belum pilih line, jangan fetch apa-apa

    try {
      const today = getTodayWIB();
      // shiftOverride ("1"/"2"/dst, opsional) — CUMA relevan pas historis;
      // biarin backend milih shift terakhir hari itu kalau kosong (lihat
      // toggle Shift 1/2 di PCBDashboard.jsx).
      const shiftQS =
        isHistorical && shiftOverride ? `&shift=${encodeURIComponent(shiftOverride)}` : "";
      const dateQS = isHistorical ? `&date=${encodeURIComponent(date)}${shiftQS}` : "";
      const lineQS = `line=${encodeURIComponent(lineCode)}${dateQS}`;

      // ── remoteSource diisi (mis. "sgp"/"systech") → line ini punya
      // DB di instance SUBCONT, bukan lokal Master. Fetch lewat proxy
      // /api/master/dashboard/line-* (routes/master.js), BUKAN endpoint
      // lokal /api/dashboard biasa. Lihat MasterDashboard.jsx LineRow buat
      // gimana remoteSource ini nyampe ke sini.
      //
      // ⚠️ Versi RINGKAS SENGAJA: reject-detail & foto personel DI-SKIP
      // total di mode ini (belum ada proxy buat itu) — angka utama aja
      // (output/cycle time/stoptime/deviasi). Lihat diskusi PUSH_SYNC_NOTES.md
      // soal kenapa scope-nya dipersempit dulu.
      const isRemote = Boolean(remoteSource);

      let d, monthlyJson;
      if (isRemote) {
        const [dataRes, monthlyRes] = await Promise.all([
          fetch(
            `${BASE_URL}/api/master/dashboard/line-summary?source=${encodeURIComponent(remoteSource)}&${lineQS}`,
          ),
          fetch(
            `${BASE_URL}/api/master/dashboard/line-monthly?source=${encodeURIComponent(remoteSource)}&${lineQS}`,
          ),
        ]);
        if (!dataRes.ok)
          throw new Error(`line-summary (${remoteSource}): HTTP ${dataRes.status}`);
        if (!monthlyRes.ok)
          throw new Error(`line-monthly (${remoteSource}): HTTP ${monthlyRes.status}`);

        const dataProxy = await dataRes.json();
        const monthlyProxy = await monthlyRes.json();
        if (dataProxy.status !== "ok") {
          throw new Error(dataProxy.message || `Gagal ambil data dari ${remoteSource}`);
        }
        // Body proxy-nya nested {source,label,status,data:<raw>} — <raw>
        // itu PERSIS bentuk yang dibalikin /api/dashboard & /api/dashboard/
        // monthly asli (lihat komentar proxyLocalDashboardRaw di
        // api-external.js), jadi parsing di bawah gak perlu dibedain lagi.
        d = dataProxy.data || {};
        monthlyJson =
          monthlyProxy.status === "ok" ? monthlyProxy.data || {} : {};
      } else {
        // ── Fetch data shift aktif + akumulasi bulanan (LOKAL) ─────
        const [dataRes, monthlyRes] = await Promise.all([
          fetch(`${BASE_URL}/api/dashboard?${lineQS}`),
          fetch(`${BASE_URL}/api/dashboard/monthly?${lineQS}`),
        ]);

        if (!dataRes.ok)
          throw new Error(`/api/dashboard: HTTP ${dataRes.status}`);
        if (!monthlyRes.ok)
          throw new Error(`/api/dashboard/monthly: HTTP ${monthlyRes.status}`);

        d = await dataRes.json();
        monthlyJson = await monthlyRes.json();
      }

      // Reject-detail — optional, gak crash kalau endpoint belum ada
      // datanya. Di mode remote SENGAJA di-skip (belum ada proxy-nya —
      // rejectDetailData tetap null, RightColumn otomatis fallback ke
      // tampilan default/MOCK, lihat komentar di RightColumn.jsx).
      let rejectDetailData = null;
      if (!isRemote) {
        try {
          // lineQS udah bawa &date=... sendiri kalau isHistorical; jangan
          // dobel nempelin ?date= lagi (bakal keoverride/konflik di backend).
          const rejectRes = await fetch(
            isHistorical
              ? `${BASE_URL}/api/dashboard/reject-detail?${lineQS}`
              : `${BASE_URL}/api/dashboard/reject-detail?${lineQS}&date=${today}`,
          );
          if (rejectRes.ok) {
            const rejectJson = await rejectRes.json();
            rejectDetailData = rejectJson.data || null;
          }
        } catch (_) {
          // endpoint belum siap — biarkan null, RightColumn pakai default
        }
      }

      // ── Personnel ───────────────────────────────────────
      const parsedKetua = parsePersonnelField(d.cell_leader_nama);
      const parsedTeknisi = parsePersonnelField(d.pj_teknis_nama);
      const parsedInspector = parsePersonnelField(d.inspector_nama);
      // Foto personel di-skip di mode remote — file foto cuma ada di
      // /uploads LOKAL instance subcont, Master gak punya aksesnya (belum
      // ada proxy buat gambar). Set NIK null biar buildFotoUrl() di bawah
      // gak nembak URL yang bakal 404 di Master, Avatar otomatis fallback
      // ke inisial nama (lihat components/ui/index.jsx).
      const ketuaNik = isRemote ? null : parsedKetua.nik || null;
      const teknisiNik = isRemote ? null : parsedTeknisi.nik || null;
      const inspectorNik = isRemote ? null : parsedInspector.nik || null;

      setState((prev) => ({
        ...prev,
        tanggal: d.tanggal || today,
        line: d.line || null,
        cl_no: d.cl_no || null,
        nama_produk: d.product_name || null,
        cell_leader_nama: d.cell_leader_nama || null,
        cycle_time_swi: d.cycle_time_swi ?? null,
        cycle_time_actual: d.cycle_time_actual ?? null,
        output_plan: Number(d.output_plan) || 0,
        output_produksi: Number(d.output_total) || 0,
        deviasi_target: Number(d.deviasi_target) || 0,
        qty_reject: Number(d.reject_qty) || 0,
        qty_reject_ppm: Number(d.qty_reject_ppm) || 0,
        stoptime_menit: Number(d.stoptime_total) || 0,
        hourly: d.hourly || [],
        shift: d.shift || null,
        line_not_running: Boolean(d.line_not_running),
        // Fallback buat backend LAMA yang belum ngirim line_status.
        line_status: d.line_status || (d.line_not_running ? "not_running" : "running"),
        availability: {
          operator: d.availability_operator ?? null, // FIX: sebelumnya mock ("Bekidoritsu"), sekarang dari backend (stoptime_man vs stoptime_plan)
          mesin: d.oee ?? null, // OEE dari DB (cluster_1_85_n)
        },
        personnel: {
          ketua: {
            nama: parsedKetua.nama || prev.personnel?.ketua?.nama || null,
            no_karyawan: ketuaNik || prev.personnel?.ketua?.no_karyawan || null,
            telp: prev.personnel?.ketua?.telp || null,
            // Role "cellleader" — coba <nik>_cellleader.jpg dulu, fallback
            // ke <nik>.jpg generic kalau belum ada (lihat Avatar di
            // ui/index.jsx & catatan di buildFotoUrl di atas).
            foto: buildFotoUrl(ketuaNik, "cellleader"),
            fotoFallback: buildFotoUrl(ketuaNik),
          },
          pj_teknis: {
            nama: parsedTeknisi.nama || prev.personnel?.pj_teknis?.nama || null,
            no_karyawan:
              teknisiNik || prev.personnel?.pj_teknis?.no_karyawan || null,
            telp: prev.personnel?.pj_teknis?.telp || null,
            // PJ Teknis belum ada kasus ganti-ganti seragam kayak Cell
            // Leader/Inspector — generic doang, gak perlu role.
            foto: buildFotoUrl(teknisiNik),
          },
          inspector: {
            nama: parsedInspector.nama || null,
            no_karyawan: inspectorNik || null,
            telp: null,
            // Role "inspector" — coba <nik>_inspector.jpg dulu, fallback
            // ke <nik>.jpg generic kalau belum ada.
            foto: buildFotoUrl(inspectorNik, "inspector"),
            fotoFallback: buildFotoUrl(inspectorNik),
          },
        },
        reject_detail: rejectDetailData,
        lastRefresh: new Date(),
        loading: false,
        error: null,
        monthly: {
          total_output: monthlyJson.total_output,
          total_qty_reject: monthlyJson.total_qty_reject,
          ppm: monthlyJson.ppm,
          man: monthlyJson.man ?? 0,
          machine: monthlyJson.machine ?? 0,
          material: monthlyJson.material ?? 0,
          method: monthlyJson.method ?? 0,
          micro_stop: null,
          proses_bermasalah: [],
        },
        historical: Boolean(d.historical),
        available_shifts: Array.isArray(d.available_shifts) ? d.available_shifts : [],
      }));
    } catch (err) {
      console.error("Dashboard fetch error:", err.message);
      setState((prev) => ({ ...prev, loading: false, error: err.message }));
    }
  }, [lineCode, remoteSource, date, shiftOverride, isHistorical]);

  useEffect(() => {
    refresh();
    // Data historis (tanggal yang udah lewat) gak bakal berubah lagi —
    // gak perlu di-poll tiap REFRESH_MS kayak mode live/kiosk. Cukup fetch
    // sekali pas line/date-nya ganti.
    if (isHistorical) return;
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh, isHistorical]);

  return state;
}
