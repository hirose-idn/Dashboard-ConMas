# Push-Sync — fallback buat pull Tailscale/tunnel yang putus

## Kenapa

Arsitektur pull yang ada (`config/sources.js` → `services/sourceClient.js`)
bikin Master (Hirose) nge-fetch HTTP ke SGP/Systech lewat Tailscale/tunnel.
Kalau jalur itu putus (kejadian: Tailscale logout & gagal re-auth gara-gara
firewall kantor block koneksi outbound-nya), Master timeout dan dashboard
kosong buat lokasi yang putus.

Push-sync nambahin jalur SEBALIKNYA: SGP & Systech yang **kirim** data ke
Master tiap ~1 menit (outbound HTTPS doang, gak butuh port terbuka apapun
di sisi mereka). Master simpan data terakhir yang di-push, dan
`sourceClient.js` otomatis pakai itu sebagai fallback KALAU pull normal
gagal (timeout/unreachable/error) — pull tetap jalur utama, ini cuma
jaring pengaman.

## Kenapa DB terpisah (`db-sync.js`, bukan `db.js`)

`db.js` connect ke DB ConMas yang **berlisensi vendor**. Data push-sync
sengaja disimpan di database BEDA (`SYNC_DB_*`) — sama prinsipnya kayak
`data/lines.json` yang juga sengaja di luar skema ConMas — biar:
- Gak ganggu skema/lisensi ConMas kalau vendor audit/update software.
- Gak numpuk beban query di DB yang dipakai ConMas operasional real-time.
- Bisa di-migrate/dipindah kapan aja tanpa koordinasi ke constraint ConMas.

## Setup

### 1. Di server Hirose (Master) — sisi PENERIMA

```bash
# Bikin DB baru, TERPISAH dari DB ConMas
createdb subcont_sync_db

# Isi SYNC_DB_* di .env Master, lalu:
node scripts/initSyncDb.js

# Isi juga SYNC_KEY_SGP dan SYNC_KEY_SYSTECH (generate random string)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Kalau Master diakses dari luar lewat **Cloudflare Tunnel** (dibahas
terpisah — lihat setup Cloudflare Tunnel), `/api/sync` itu yang
di-expose, BUKAN `/api/dashboard` atau `/api/master`.

### 2. Di server SGP & Systech — sisi PENGIRIM

Isi di `.env` masing-masing:

```
PUSH_MASTER_URL=https://<tunnel-atau-domain-master>/api/sync
PUSH_SYNC_KEY=<isi sama persis dengan SYNC_KEY_SGP / SYNC_KEY_SYSTECH punya Master>
```

Restart service (`pm2 restart <nama-instance>`) — push-sync otomatis
jalan begitu 2 env di atas keisi (lihat log start: `🔄 Push-sync service
AKTIF`). Kalau kosong, service ini diam total, gak ganggu apa-apa.

## Cara cek jalan atau nggak

```
GET /api/sync/status     (di Master)
```

Balikin kapan terakhir tiap source/type nge-push. Kalau `age_ms` suatu
source udah gede banget (jauh di atas ~60000), berarti sync service di
lokasi itu berhenti kirim — cek log PM2 di server SGP/Systech-nya.

## Yang SENGAJA belum di-push

- `range-trend` — parameternya bebas (start/end custom dari user), gak
  cocok buat di-cache berkala kayak summary/monthly.
- `line-range-breakdown` — belum ada `type` push buat ini, jadi fallback
  untuk endpoint ini belum aktif (pull normal tetap satu-satunya jalur).

## Kalau nanti mau nambah subcont baru (vendor ke-4, dst)

1. Tambah entry di `config/sources.js` (kayak biasa).
2. Tambah `SYNC_KEY_<NAMA>` di `.env` Master.
3. Tambah `<NAMA>` ke `VALID_SOURCES` di `routes/sync.js`.
4. Isi `PUSH_MASTER_URL` & `PUSH_SYNC_KEY` di `.env` instance baru itu.

Gak perlu ubah skema DB (`subcont_push_latest`/`subcont_push_log` generic
per `source`, bukan per-vendor hardcoded).
