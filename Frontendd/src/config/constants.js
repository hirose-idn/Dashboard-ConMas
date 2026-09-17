import React from "react";

// Dev (npm start, NODE_ENV=development) → default ke backend lokal port 5000.
// Production (npm run build, NODE_ENV=production) → default relative path ("")
// karena frontend & backend di-serve dari origin yang sama (1 server, 1 port).
export const BASE_URL =
  process.env.REACT_APP_API_URL ??
  (process.env.NODE_ENV === "production" ? "" : "http://localhost:5000");
// Identitas instance ini di FRONTEND — dipakai buat nge-hide tombol
// "Dashboard Utama"/"Master Hub" (cuma valid di instance Hirose) pas
// instance ini bukan "internal". Isi REACT_APP_SOURCE_NAME di
// Frontendd/.env.production sesuai SOURCE_NAME backend; kosong = default
// "internal".
export const SOURCE_NAME = (
  process.env.REACT_APP_SOURCE_NAME || "internal"
).toLowerCase();
export const IS_INTERNAL_INSTANCE = SOURCE_NAME === "internal";
// Label "tempat" versi Title Case, buat ke-passing ke BreakdownTempat
// (dia expect "Internal"/"SGP"/"Systech", samain kayak isi lines.json)
export const TEMPAT_LABEL =
  { internal: "Internal", sgp: "SGP", systech: "Systech" }[SOURCE_NAME] ||
  "Internal";
export const REFRESH_MS = 60_000; // server ConMas update tiap jam, refresh tiap 1 menit cukup

// Base URL ConMasManager PER TEMPAT — Internal, SGP, Systech masing-masing
// punya server/IP beda (DB-nya SAMA/shared, cuma front-end ConMasManager-
// nya yang di-host terpisah per lokasi). Dipakai buat tombol "Buka PCB" di
// Master Dashboard, ngarah ke dokumen report asli:
//   {base}/InputReport/Details?repTopId={rep_top_id}
// Override lewat env var kalau IP-nya ganti (gak perlu ubah kode):
//   REACT_APP_CONMAS_MANAGER_URL_INTERNAL / _SGP / _SYSTECH
// ⚠️ Path setelah host (/ConMasManager/InputReport/Details) DIASUMSIKAN
// SAMA buat ketiganya (belum dikonfirmasi user buat SGP/Systech) — kalau
// ternyata beda, cukup ganti value di sini/env var, gak perlu sentuh kode
// yang makainya (lihat getConmasManagerUrl di bawah).
export const CONMAS_MANAGER_URLS = {
  internal:
    process.env.REACT_APP_CONMAS_MANAGER_URL_INTERNAL ||
    "http://192.168.147.74/ConMasManager",
  sgp:
    process.env.REACT_APP_CONMAS_MANAGER_URL_SGP ||
    "http://36.93.147.98:8000/ConMasManager",
  systech:
    process.env.REACT_APP_CONMAS_MANAGER_URL_SYSTECH ||
    "http://36.93.215.154:8000/ConMasManager",
};

// Helper — resolve base URL dari nilai `tempat` line (as-is dari backend:
// "Internal"/"SGP"/"Systech", lihat COLS/summary-all-daily). Fallback ke
// internal kalau nilai tempat-nya gak dikenal/kosong.
export function getConmasManagerUrl(tempat) {
  const key = (tempat || "internal").toLowerCase();
  return CONMAS_MANAGER_URLS[key] || CONMAS_MANAGER_URLS.internal;
}
export const FOTO_BASE_URL = `${BASE_URL}/foto`;

// DARK = tema asli (dark cyan), buat operator shift/ruangan gelap.
// LIGHT = tema terang & kontras tinggi buat manajemen — biru-vs-oranye/
// merah-tua (bukan hijau-vs-merah) supaya tetap kebaca walau ada gangguan
// penglihatan warna.
export const DARK = {
  bg: "#050f14",
  panel: "#091820",
  panelAlt: "#07141c",
  border: "#0d3a4f",
  borderBr: "#1a6680",
  green: "#00e5a0",
  greenDim: "#00e5a025",
  blue: "#00cfff",
  blueDim: "#00cfff18",
  orange: "#ffaa00",
  red: "#ff3a5c",
  redDim: "#ff3a5c28",
  yellow: "#ffe066",
  purple: "#a78bfa",
  text: "#d0eef8",
  textDim: "#4a8fa8",
  textMut: "#1e4a5c",
  inputBg: "#040d12",
  // ⚠️ WAJIB solid (6-digit hex, TANPA alpha channel)! Kolom kiri di
  // breakdown table itu position:sticky — kalau warnanya ada alpha
  // (transparan), konten yang discroll di baliknya numpuk kelihatan
  // bareng teks sticky-nya (efek "berbayang"). Warna ini hasil blend
  // manual #040d12 25% di atas panel #091820, biar tetep solid tapi
  // visual stripe-nya sama.
  rowAlt: "#08151c",
};

export const LIGHT = {
  bg: "#f4f7fa",
  panel: "#ffffff",
  panelAlt: "#eef3f7",
  border: "#cfd9e2",
  borderBr: "#3d8fd9",
  green: "#1c7a4d",
  greenDim: "#1c7a4d1a",
  blue: "#186fd9", // biru cerah tapi adem — warna korporat, kontras ±5.1:1 di atas putih (lolos WCAG AA)
  blueDim: "#186fd916",
  orange: "#b35900",
  red: "#b42323",
  redDim: "#b423231a",
  yellow: "#8a6d00",
  purple: "#5b3a8e",
  text: "#101c24",
  textDim: "#3d5566",
  textMut: "#8298a6",
  inputBg: "#ffffff",
  rowAlt: "#e7edf3",
};

const THEME_KEY = "dashboardTheme";

function readSavedTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark"; // localStorage bisa gak ada (mis. private mode) — default gelap
  }
}
export { readSavedTheme };

// `C` SENGAJA diexport sebagai object yang SAMA (mutable, bukan re-assign) —
// supaya semua file yang makai C.warna langsung di JSX otomatis ke-update
// begitu tema di-toggle, tanpa perlu Context/hook. Komponen yang lagi
// kebuka butuh re-render sendiri (lihat useThemeMode di bawah).
export const C = { ...(readSavedTheme() === "light" ? LIGHT : DARK) };

export function applyTheme(mode) {
  Object.assign(C, mode === "light" ? LIGHT : DARK);
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    // gak masalah — cuma preferensi gak ke-save antar sesi
  }
}

// Hook kecil buat dipakai di komponen yang mau punya tombol toggle tema.
// Bukan React Context — sengaja simpel, tiap komponen yang makai ini
// nyimpen mode-nya sendiri, sinkron ke `localStorage` + object `C` bersama.
export function useThemeMode() {
  const [mode, setModeState] = React.useState(readSavedTheme);

  // ⚠️ Race condition pas pindah halaman dari komponen yang MAKSA tema
  // (misal MasterDashboard) ke komponen yang punya toggle sendiri (misal
  // MasterHub): `useState(readSavedTheme)` di atas cuma jalan sekali pas
  // render pertama, tapi cleanup effect komponen lama baru jalan SETELAH
  // itu — jadi `mode` sempet kepotret nilai lama. Fix: baca ulang
  // localStorage begitu komponen ini mount (mount effect selalu jalan
  // setelah semua cleanup di commit yang sama, jadi nilainya udah final).
  React.useEffect(() => {
    setModeState(readSavedTheme());
  }, []);

  const toggleTheme = React.useCallback(() => {
    setModeState((prev) => {
      const next = prev === "light" ? "dark" : "light";
      applyTheme(next);
      return next;
    });
  }, []);
  return [mode, toggleTheme];
}

//  Global CSS
// Function (bukan string statis) — supaya tiap render baca warna `C` YANG LAGI AKTIF.
// Dulu ini string statis jadi scrollbar-nya selalu gelap walau lagi di LIGHT theme.
export function GLOBAL_STYLE() {
  return `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: ${C.panelAlt}; }
  ::-webkit-scrollbar-thumb { background: ${C.borderBr}; border-radius: 2px; }
  @keyframes pulse-dot { 0%,100%{opacity:1;} 50%{opacity:0.3;} }
  @keyframes scan { 0%{transform:translateY(-100%);} 100%{transform:translateY(500%);} }
  @keyframes blink-warning { 0%,100%{opacity:1;} 50%{opacity:0.45;} }
`;
}

//  Mock data
export const MOCK_DATA = {
  personnel: {
    pj_teknis: { nama: null, no_karyawan: null, telp: null, foto: null },
  },

  monthly: {
    total_output: null,
    total_qty_reject: null,
    ppm: null,
    micro_stop: null,
    proses_bermasalah: [],
  },

  availability: {
    operator: 88, // Bekidoritsu — mock, belum ada row mapping dari ConMas
    mesin: 82, // OEE — mock, belum ada row mapping dari ConMas
  },

  reject_detail: null,
};
