# Refactor Backend — 1 codebase generic (Internal/SGP/Systech)

## Round 1 — VIEW jadi env var, sync fitur, cleanup dead code

1. **`config/reportColumns.js`** — nama VIEW baca dari `process.env.DB_VIEW_NAME`
   (dulu hardcode beda per instance).
2. **`.env.example`** — ditambah `DB_VIEW_NAME`, komentar `SHIFT2_*` diperjelas
   (itu buat skema 2-Shift, wajib diisi beda-beda per SGP vs Systech).
3. **`services/lineDiscoveryService.js`** — tempat registry ikut `SOURCE_NAME`
   (`resolveTempatFromEnv()`).
4. **`routes/dashboard.js`** — fitur live-product-lookup disamain di semua instance.
5. Dead code dipindah ke `_archive/`: `config/viewConfig.js`, `config/columns.js`,
   `services/dashboardService.js`, `utils/shiftHelper.js`.
6. `scripts/` disamain di semua instance (`checkView.js`, `dumpColumns.js`,
   `checkLineCandidates.js`).

## Round 2 — Breakdown per Line sekarang jalan lewat Master juga

**Masalah:** endpoint `/api/dashboard/line-range-breakdown` cuma query DB
LOKAL instance yang lagi diakses. Begitu dibuka lewat Master Hub buat
lokasi SGP/Systech, Master nyari data itu di DB-nya sendiri (DB Internal)
dan gak ketemu apa-apa → tabel breakdown kosong total, padahal data di
server SGP/Systech-nya sendiri sehat.

**Fix — 4 file:**

1. **`services/lineBreakdownService.js` (BARU)** — logic query breakdown
   per-line di-extract dari `routes/dashboard.js` ke sini (`getLineRangeBreakdown()`),
   supaya bisa dipakai bareng oleh route lokal MAUPUN endpoint external baru,
   tanpa duplikasi kode. `SLOTS` (definisi slot produk) juga dipindah ke sini.

2. **`routes/api-external.js`** — endpoint baru
   `GET /api/external/line-range-breakdown?start=&end=`, expose data breakdown
   instance ini ke luar (dilindungi API key yang sama kayak endpoint lain).
   SENGAJA gak terima parameter `?tempat=` dari caller — selalu balikin data
   instance ini sendiri doang.

3. **`services/sourceClient.js`** — fungsi baru `fetchSourceLineRangeBreakdown()`,
   manggil endpoint di atas dari Master. Timeout dinaikin ke 15 detik (bukan
   default 5 detik) karena query-nya jalan per-line (bisa puluhan query kecil
   di sisi subcont).

4. **`routes/master.js`** — endpoint proxy baru
   `GET /api/master/line-range-breakdown?source=&start=&end=`. Kalau
   `source=internal` → query lokal langsung (`getLineRangeBreakdown`). Kalau
   `sgp`/`systech` → nembak endpoint di poin 2 lewat `fetchSourceLineRangeBreakdown`.
   Pattern-nya disamain persis sama endpoint `/tempat-trend` yang udah ada.

**Frontend (`Frontendd/src/components/dashboard/BreakdownTempat.jsx`)** juga
diubah — lihat `Frontendd_canonical/BUILD_NOTES.md`.

## Checklist deploy ke server (Internal / SGP / Systech)

Isi `.env` dari `.env.example`:

| Var | Internal | SGP | Systech |
|---|---|---|---|
| `DB_VIEW_NAME` | *(nomor view Internal)* | **isi sendiri** | **isi sendiri** |
| `SOURCE_NAME` | `internal` | `sgp` | `systech` |
| `SHIFT2_START_HOUR` dkk (4 var) | kosongin (default OK) | **isi sesuai jam SGP** | **isi sesuai jam Systech** |
| `EXTERNAL_API_KEY` | beda | beda | beda |
| `SGP_API_URL/KEY`, `SYSTECH_API_URL/KEY` | isi (Master only) | kosong | kosong |

⚠️ Line **3-shift** yang jamnya BUKAN 06:00/14:00/22:00 di SGP/Systech —
kode belum punya hook env buat itu, `shiftResolver.js` masih hardcode.

## Yang SENGAJA TIDAK disamain

- **`data/lines.json`** — data registry line, beda per instance, JANGAN ditimpa.
- **`.env`** (bukan `.env.example`) — kredensial per server, gak masuk repo.

## Belum sempat dikerjakan

- Server Master belum jadi git clone (masih folder manual).
