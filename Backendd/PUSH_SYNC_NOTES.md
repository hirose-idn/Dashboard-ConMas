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

## Log harian & monitoring

Tiap instance nulis file teks `logs/push-YYYY-MM-DD.log` (jam WIB, bisa
dibuka Notepad). Satu baris = satu kejadian, format `key=value`:

- **Pengirim (SGP/Systech):** `START`, `CYCLE` (1 baris per siklus:
  durasi, `sent_ok`/`send_fail`, `errs=http530:85`, `queue`, `slow=` job
  yang lambat), `SEND_FAIL`/`COLLECT_FAIL` (maks 3 per siklus),
  `OUTAGE_START`/`OUTAGE_END` (+ lama down), `CYCLE_SKIP`.
- **Master:** `GAP` (per type, pas push nyambung lagi), `PUSH_STALE_IGNORED`,
  `PUSH_REJECTED`, `PUSH_SAVE_FAIL`, `SENDER_STALE`/`SENDER_RECOVERED`
  (watchdog, lihat `services/pushWatchdog.js`).

Ringkasan cepat:

```
node scripts/summarizeLog.js              # hari ini
node scripts/summarizeLog.js 2026-10-13   # tanggal tertentu
node scripts/summarizeLog.js --last 7     # 7 hari terakhir
```

Cara baca `errs=`: `http530`/`ENOTFOUND` = tunnel mati atau `PUSH_MASTER_URL`
salah/berubah (quick tunnel ganti URL tiap restart); `http403` = key salah;
`http429` = kena rate limit Master; `ECONNABORTED` = timeout; `http500` =
Master gagal simpan (cek sync DB). File lama otomatis dihapus setelah
`PUSH_LOG_RETAIN_DAYS` (default 30).

Guard data basi: Master menolak push yang `payload_timestamp`-nya lebih tua
dari yang tersimpan (status `stale` di `subcont_push_log`, tanpa payload).
Tabel `subcont_push_log` menyimpan payload penuh tiap push dan belum punya
retensi otomatis — bersihkan berkala, mis.
`DELETE FROM subcont_push_log WHERE received_at < NOW() - INTERVAL '7 days';`
