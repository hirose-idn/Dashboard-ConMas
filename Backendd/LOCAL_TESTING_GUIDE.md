# Tes Lokal — 3 Instance di 1 Laptop (Internal + SGP + Systech)

Panduan ini buat buktiin alur Master Dashboard (Internal narik SGP & Systech
lewat HTTP) jalan bener, SEBELUM lu pusing setup Caddy/domain di server
subcont beneran. Semuanya jalan di `localhost`, port beda-beda, HTTP biasa
(bukan HTTPS — itu baru dipasang pas beneran deploy ke server subcont).

## Ringkasan arsitektur tes ini

```
Internal (port 5000, DB asli/test)
   │  getLocalSummary() → query langsung ke Postgres
   │
   ├─ HTTP GET → SGP      (port 5001, MOCK_MODE=true, data karangan)
   └─ HTTP GET → Systech  (port 5002, MOCK_MODE=true, data karangan)
```

`SGP` & `Systech` di tes ini **TIDAK connect ke Postgres sama sekali** —
mereka jalan `MOCK_MODE=true` yang balikin angka random tapi masuk akal
(lihat `utils/mockData.js`). Ini sengaja, biar lu ga perlu bikin 2 skema DB
tambahan cuma buat ngetes pipa datanya jalan apa nggak.

---

## Langkah 1 — Seed data dummy buat Internal

Instance Internal TETAP query Postgres beneran (biar query aslinya ke-tes,
bukan cuma mock semua). Karena Postgres lu masih kosong:

```bash
cd Backendd
npm install          # kalau belum pernah
cp .env.example .env
```

Isi `.env` (bagian DB_* nunjuk ke Postgres lokal lu):
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=<nama_db_lokal_lu>
DB_USER=<user_lu>
DB_PASSWORD=<password_lu>
PORT=5000
SOURCE_NAME=internal
EXTERNAL_API_KEY=key-internal-test
SGP_API_URL=http://localhost:5001/api/external
SGP_API_KEY=key-sgp-test
SYSTECH_API_URL=http://localhost:5002/api/external
SYSTECH_API_KEY=key-systech-test
```

Lalu jalanin seed:
```bash
node scripts/seedTestData.js
```

Ini bakal bikin tabel `view_report_25415` (kalau belum ada) + isi 2 row
dummy buat line `TEST-LINE-01`/`TEST-LINE-02`, PAS di shift yang lagi aktif
sekarang. Di akhir, dia ngeprint JSON buat ditambahin ke `data/lines.json` —
**tambahin manual** (jangan hapus 30 line asli lu, cukup nambah):

```json
  {
    "line_code": "TEST-LINE-01",
    "shift_scheme": 2,
    "active": true,
    "description": "Dummy test line"
  },
  {
    "line_code": "TEST-LINE-02",
    "shift_scheme": 3,
    "active": true,
    "description": "Dummy test line"
  }
```

> Inget hapus lagi 2 line ini + drop tabel `view_report_25415` kalau udah
> selesai eksperimen dan mau lanjut ke DB ConMas beneran.

## Langkah 2 — Jalanin instance SGP (terminal baru)

```bash
cd Backendd
cp .env .env.sgp        # modal .env yang sama, tinggal override sebagian
```

Edit `.env.sgp`, ganti jadi:
```
PORT=5001
SOURCE_NAME=sgp
EXTERNAL_API_KEY=key-sgp-test
MOCK_MODE=true
```
(baris `SGP_API_URL`/`SYSTECH_API_URL` di file ini gapapa dibiarin, gak
kepake — instance SGP gak pernah manggil source lain)

Jalanin dengan env file ini (bukan `.env` default):

**Windows (PowerShell)**
```powershell
Get-Content .env.sgp | ForEach-Object {
  if ($_ -match '^([^=]+)=(.*)$') { [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2]) }
}
node index.js
```

**Mac/Linux**
```bash
env $(cat .env.sgp | xargs) node index.js
```

Lu bakal liat log `🚀 Backend jalan di http://localhost:5001`.

## Langkah 3 — Jalanin instance Systech (terminal baru lagi)

Sama persis kayak SGP, tapi:
```
PORT=5002
SOURCE_NAME=systech
EXTERNAL_API_KEY=key-systech-test
MOCK_MODE=true
```
Simpen sebagai `.env.systech`, jalanin cara yang sama.

## Langkah 4 — Jalanin instance Internal (terminal baru lagi)

```bash
cd Backendd
node index.js
```
(pakai `.env` biasa dari Langkah 1 — ini yang punya `SGP_API_URL` dst)

## Langkah 5 — Buktiin semuanya nyambung

Buka terminal ke-4 (atau browser):
```bash
curl http://localhost:5000/api/master/summary
```

Yang diharapin: `sources` array isinya 3 object, ketiganya `status: "ok"`,
`sources_ok: 3`. Kalau SGP/Systech statusnya `unreachable`, cek lagi
port/`.env`-nya, atau instance itu emang belum kejalanin.

## Langkah 6 — Buka frontend, lihat badge-nya

```bash
cd Frontendd
npm install    # kalau belum pernah
npm start
```
Pastiin `Frontendd/.env.development` nunjuk `REACT_APP_API_URL=http://localhost:5000`
(port Internal). Buka Master Dashboard di browser — 3 badge (Internal/SGP/
Systech) harusnya ijo berdenyut semua.

---

## Setelah selesai eksperimen

- Matiin ketiga instance (Ctrl+C di tiap terminal)
- Hapus 2 line dummy dari `data/lines.json`
- `DROP TABLE view_report_25415;` di Postgres lokal (kalau emang cuma buat
  tes ini, bukan DB yang mau dipake production)
- Hapus `.env.sgp` / `.env.systech` (isinya API key test, ga perlu disimpen)
