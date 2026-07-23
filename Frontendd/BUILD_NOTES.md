# Frontend — 1 source, build terpisah per instance

## Cara build per instance

```powershell
copy .env.production.internal .env.production   # ganti sesuai instance: .sgp / .systech
npm install
npm run build
pm2 restart <nama-app>
```
Hard refresh browser (`Ctrl+Shift+R`) abis itu.

## Round terbaru — Executive Dashboard (halaman baru, khusus Internal)

**`components/dashboard/ExecutiveDashboard.jsx` (BARU)** — halaman ringkasan
level manajemen, sekarang jadi LANDING PAGE default buat instance Internal
(sebelum ini, landing page Internal = LinePicker; sekarang urutannya:
Executive Dashboard → klik "Buka Master Hub" → Master Hub → dst, sesuai
hierarki yang diminta).

Isinya:
- KPI card (Total Target/Actual/Gap/Achievement%) — warna berubah SESUAI
  kondisi data (merah/oranye/hijau berdasarkan threshold pencapaian),
  BUKAN warna solid acak per card kayak mockup awal.
- Achievement Ranking per lokasi (Hirose/SGP/Systech) — progress bar,
  3 mini-stat (Actual/Target/Gap), dan tombol **Edit inline** buat input
  manual Target & Actual per bulan (lihat catatan data di bawah).
- Trend Performance — grafik kumulatif Target vs Actual per bulan,
  1 tahun penuh.
- Filter Tahun & Bulan di sidebar kiri.

Dipake ulang: token warna & style dari `config/constants.js` (C, GLOBAL_STYLE,
useThemeMode) — SAMA PERSIS kayak MasterHub.jsx, biar halaman baru ini
kerasa 1 keluarga produk, bukan halaman nempel dari desain lain.

⚠️ **Sumber data Target/Actual di halaman ini MANUAL** (belum ada database
otomatis buat angka ini — beda dari Output Plan/Actual di Master Hub yang
dari ConMas). Disimpan di `data/executiveTargets.json` di server Backend
(lihat `REFACTOR_NOTES.md` Backend buat detail).

**`App.jsx`** — routing default landing page Internal diubah ke
ExecutiveDashboard (subcont SGP/Systech TIDAK berubah, tetap landing di
LinePicker seperti biasa — halaman ini emang cuma buat Internal).

## Checklist 3 instance

| Instance | `.env.production` sumber | `REACT_APP_SOURCE_NAME` |
|---|---|---|
| Hirose Internal | `.env.production.internal` | `Internal` |
| Subcont SGP | `.env.production.sgp` | `SGP` |
| Subcont Systech | `.env.production.systech` | `Systech` |

⚠️ Server **Master (Internal)** — kalau Frontend di server itu cuma ada
folder `build/` (source `src/` gak ada), copy folder `Frontendd_canonical`
ini ke server Master duluan, baru build.
