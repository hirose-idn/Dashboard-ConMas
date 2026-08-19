import React from "react";

// Dev (npm start, NODE_ENV=development) → default ke backend lokal port 5000.
// Production (npm run build, NODE_ENV=production) → default relative path ("")
// karena frontend & backend di-serve dari origin yang sama (1 server, 1 port).
export const BASE_URL =
  process.env.REACT_APP_API_URL ??
  (process.env.NODE_ENV === "production" ? "" : "http://localhost:5000");
// Identitas instance ini di FRONTEND — dipakai buat nge-hide tombol
// "Dashboard Utama"/"Master Hub" (keduanya manggil /api/master/*, yang
// cuma valid diliat dari instance Hirose) pas instance ini bukan
// "internal", dan buat lompat LANGSUNG ke Breakdown per Line lokal
// (lihat LinePicker.jsx + App.jsx). Isi REACT_APP_SOURCE_NAME di
// Frontendd/.env.production sesuai SOURCE_NAME punya backend
// (internal | sgp | systech) — kalau kosong, default "internal" (aman,
// sama kayak behavior lama sebelum flag ini ada).
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
export const FOTO_BASE_URL = `${BASE_URL}/foto`;

// ─────────────────────────────────────────────
//  Design tokens — 2 tema:
//    DARK  = tema asli (dark cyan), buat operator shift/ruangan gelap
//    LIGHT = tema terang & kontras tinggi, buat orang tua / manajemen —
//            biru-vs-oranye/merah-tua (bukan hijau-vs-merah) supaya
//            tetap kebaca walau ada gangguan penglihatan warna, dan
//            teks gelap di atas latar terang (lebih nyaman dibaca lama)
// ─────────────────────────────────────────────
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
  // Dulu 2 token di bawah ini HARDCODE literal "#040d12" / "#040d1240" di
  // beberapa komponen (BreakdownTempat/BreakdownTrend) — kelihatan oke di
  // dark theme (kebetulan mirip warna gelap lain di situ), tapi begitu
  // theme di-switch ke LIGHT, sel-sel itu TETEP GELAP karena warnanya
  // ke-hardcode, bukan ngikut `C`. Sekarang jadi token resmi biar ke-swap
  // otomatis pas ganti tema.
  inputBg: "#040d12",
  rowAlt: "#040d1240",
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
// supaya semua file yang udah `import { C } from "../config/constants"` dan
// makai C.warna langsung di JSX tetap otomatis ke-update begitu tema
// di-toggle, TANPA perlu diubah satu-satu jadi Context/hook. Komponen yang
// lagi kebuka pas toggle butuh re-render sendiri (lihat useThemeMode di
// bawah); komponen yang di-mount ULANG (pindah halaman) otomatis kebaca
// tema terbaru karena C udah ke-update duluan.
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

  // BUG FIX: race condition pas pindah halaman dari komponen yang MAKSA
  // tema (misal MasterDashboard, lihat catatan di file itu) ke komponen
  // yang PUNYA TOGGLE-nya sendiri (misal MasterHub). `useState(readSavedTheme)`
  // di atas cuma jalan SEKALI pas render pertama — tapi cleanup effect
  // komponen lama (yang ngubah tema pas dia unmount) baru betulan jalan
  // SETELAH render pertama komponen baru selesai, jadi `mode` di sini
  // sempet "kepotret" nilai lama sebelum tema kebalik. Efeknya label
  // tombol vs warna beneran yang tampil jadi gak sinkron.
  // Fix: begitu komponen ini mount, baca ULANG localStorage — effect mount
  // SELALU jalan SETELAH semua cleanup effect komponen yang di-unmount di
  // commit yang sama, jadi di titik ini nilainya udah pasti final/benar.
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

// ─────────────────────────────────────────────
//  Global CSS
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
//  Mock data
// ─────────────────────────────────────────────
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
