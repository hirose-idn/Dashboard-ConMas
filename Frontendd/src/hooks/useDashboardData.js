import { useState, useEffect, useCallback } from "react";
import { BASE_URL, REFRESH_MS, MOCK_DATA } from "../config/constants";
import { getTodayWIB } from "../config/utils";

// ─── Status integrasi per field ──────────────────────────────
// ✅ Backend (/api/dashboard) sekarang sudah nentuin sendiri shift
//    aktif + tanggal yg relevan (termasuk shift 2 lewat tengah malam),
//    jadi FE gak perlu lagi logic getActiveShift() / cari row manual.
// ✅ hourly udah ikut nempel di response /api/dashboard (gak perlu /trend lagi)
// 🟡 reject_detail, preventive_maintenance → masih mock (lihat constants.js)
// ────────────────────────────────────────────────────────────

const INITIAL_STATE = {
  // ── Live ──────────────────────────────────────────
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
  // ── Mock ──────────────────────────────────────────
  ...MOCK_DATA,
  personnel: {
    ketua: { nama: null, no_karyawan: null, telp: null, foto: null },
    pj_teknis: { nama: null, no_karyawan: null, telp: null, foto: null },
    inspector: { nama: null, no_karyawan: null, telp: null, foto: null },
  },
  reject_detail: MOCK_DATA.reject_detail,
  preventive_maintenance: MOCK_DATA.preventive_maintenance,
  // ── State ─────────────────────────────────────────
  lastRefresh: null,
  loading: true,
  error: null,
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

function buildFotoUrl(nik) {
  if (!nik) return null;
  // Avatar component (ui/index.jsx) yang coba2 ekstensi .jpg/.jpeg/.png/.webp
  // sendiri lewat onError — jadi di sini cukup kasih base .jpg, JANGAN pakai
  // /foto-resolve (gak ada ekstensinya, gak kompatibel sama logic Avatar).
  return `${BASE_URL}/foto/${nik}.jpg`;
}

export default function useDashboardData(lineCode) {
  const [state, setState] = useState(INITIAL_STATE);

  const refresh = useCallback(async () => {
    if (!lineCode) return; // belum pilih line, jangan fetch apa-apa

    try {
      const today = getTodayWIB();
      const lineQS = `line=${encodeURIComponent(lineCode)}`;

      // ── Fetch data shift aktif + akumulasi bulanan ─────────
      const [dataRes, monthlyRes] = await Promise.all([
        fetch(`${BASE_URL}/api/dashboard?${lineQS}`),
        fetch(`${BASE_URL}/api/dashboard/monthly?${lineQS}`),
      ]);

      if (!dataRes.ok)
        throw new Error(`/api/dashboard: HTTP ${dataRes.status}`);
      if (!monthlyRes.ok)
        throw new Error(`/api/dashboard/monthly: HTTP ${monthlyRes.status}`);

      const d = await dataRes.json();
      const monthlyJson = await monthlyRes.json();

      // Reject-detail — optional, gak crash kalau endpoint belum ada datanya
      let rejectDetailData = null;
      try {
        const rejectRes = await fetch(
          `${BASE_URL}/api/dashboard/reject-detail?${lineQS}&date=${today}`,
        );
        if (rejectRes.ok) {
          const rejectJson = await rejectRes.json();
          rejectDetailData = rejectJson.data || null;
        }
      } catch (_) {
        // endpoint belum siap — biarkan null, RightColumn pakai default
      }

      // ── Personnel ───────────────────────────────────────
      const parsedKetua = parsePersonnelField(d.cell_leader_nama);
      const parsedTeknisi = parsePersonnelField(d.pj_teknis_nama);
      const parsedInspector = parsePersonnelField(d.inspector_nama);
      const ketuaNik = parsedKetua.nik || null;
      const teknisiNik = parsedTeknisi.nik || null;
      const inspectorNik = parsedInspector.nik || null;

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
        availability: {
          operator: MOCK_DATA.availability.operator, // Bekidoritsu — masih mock
          mesin: d.oee ?? null, // OEE dari DB (cluster_1_85_n)
        },
        personnel: {
          ketua: {
            nama: parsedKetua.nama || prev.personnel?.ketua?.nama || null,
            no_karyawan: ketuaNik || prev.personnel?.ketua?.no_karyawan || null,
            telp: prev.personnel?.ketua?.telp || null,
            foto: buildFotoUrl(ketuaNik),
          },
          pj_teknis: {
            nama: parsedTeknisi.nama || prev.personnel?.pj_teknis?.nama || null,
            no_karyawan:
              teknisiNik || prev.personnel?.pj_teknis?.no_karyawan || null,
            telp: prev.personnel?.pj_teknis?.telp || null,
            foto: buildFotoUrl(teknisiNik),
          },
          inspector: {
            nama: parsedInspector.nama || null,
            no_karyawan: inspectorNik || null,
            telp: null,
            foto: buildFotoUrl(inspectorNik),
          },
        },
        reject_detail: rejectDetailData,
        preventive_maintenance: prev.preventive_maintenance,
        lastRefresh: new Date(),
        loading: false,
        error: null,
        monthly: {
          total_qty_reject: monthlyJson.total_qty_reject,
          ppm: monthlyJson.ppm,
          man: monthlyJson.man ?? 0,
          machine: monthlyJson.machine ?? 0,
          material: monthlyJson.material ?? 0,
          method: monthlyJson.method ?? 0,
          micro_stop: null,
          proses_bermasalah: [],
        },
      }));
    } catch (err) {
      console.error("Dashboard fetch error:", err.message);
      setState((prev) => ({ ...prev, loading: false, error: err.message }));
    }
  }, [lineCode]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return state;
}