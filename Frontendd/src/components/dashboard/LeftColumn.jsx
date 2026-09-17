import React from "react";
import { C, BASE_URL } from "../../config/constants";
import { getNowWIB } from "../../config/utils";
import { DataBadge, Avatar, SectionTitle, KVRow } from "../ui";

// ─── QR Code — coba load foto "PCBGeneral", fallback placeholder ──
// Taruh file di: Backendd/uploads/foto/PCBGeneral.jpg (sama folder
// foto personel). Kalau ekstensi bukan .jpg, ganti FOTO_EXTS di bawah.
const QR_FOTO_EXTS = ["jpg", "jpeg", "png", "webp"];

function QRPlaceholder() {
  const [extIdx, setExtIdx] = React.useState(0);
  const allFailed = extIdx >= QR_FOTO_EXTS.length;
  const src = !allFailed
    ? `${BASE_URL}/foto/PCBGeneral.${QR_FOTO_EXTS[extIdx]}`
    : null;

  return (
    <div
      style={{
        width: 76,
        height: 76,
        margin: "0 auto",
        background: "linear-gradient(135deg, #003a52, #050f14)",
        border: `1px solid ${C.borderBr}`,
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {src ? (
        <img
          src={src}
          alt="QR Code"
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
          onError={() => setExtIdx((i) => i + 1)}
        />
      ) : (
        <>
          {/* scan line animasi — fallback kalau foto PCBGeneral gak ketemu */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              height: 2,
              background: `linear-gradient(90deg, transparent, ${C.blue}88, transparent)`,
              animation: "scan 2s linear infinite",
            }}
          />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 8, color: C.textDim, letterSpacing: "0.1em" }}>
              QR CODE
            </div>
            <div style={{ fontSize: 7, color: C.textMut, marginTop: 2 }}>
              belum tersedia
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Parse "NIK,Nama" dari field DB ──────────────────────
function parseNamaField(raw) {
  if (!raw) return { nik: null, nama: null };
  const parts = String(raw).split(",");
  if (parts.length >= 2) {
    return { nik: parts[0].trim(), nama: parts.slice(1).join(",").trim() };
  }
  // Kalau tidak ada koma, cek apakah angka (NIK) atau nama
  return /^\d+$/.test(raw.trim())
    ? { nik: raw.trim(), nama: null }
    : { nik: null, nama: raw.trim() };
}

// ─── Card info personel (ketua / PJ teknis) ──────────────
// Revisi v2: foto TETAP ADA (di lantai produksi supervisor lewat TV butuh
// tau muka PIC shift ini, bukan cuma nama), tapi bobot visualnya diturunin
// — dulu foto 60px + nama 13px + "NIK: xxx" bikin blok personel se-berat
// blok KPI. Sekarang: foto 56px, nama UPPERCASE 13px, NIK telanjang 9px.
// Emoji judul (👤/🔧/🔍) dihapus, identitas seksi pindah ke border kiri
// cyan bawaan SectionTitle.
// Revisi v3: foto dibesarin lagi (56 → 88) + padding ditambah. Alasannya
// bukan estetika doang — kolom kiri ini section-nya udah fixed/berurutan
// (3 card personel numpuk ke bawah), dan begitu konten lain di dashboard
// jadi lebih pendek (chart trend section dihapus), sisa ruang kosong di
// bawah card terakhir jadi kelihatan banget. Foto lebih besar = 3 card
// ini beneran ngisi tinggi kolom, bukan nyisa gap kosong di bawahnya.
function PersonelCard({ title, data, live }) {
  // Nama & NIK sudah di-parse di hook — tinggal pakai langsung
  // Fallback: kalau nama masih mengandung koma (mock/belum di-parse), parse di sini
  const parsed = parseNamaField(data?.nama);
  const hasComma = data?.nama && String(data.nama).includes(",");
  const nama = hasComma ? parsed.nama || null : data?.nama || null;
  const nik = hasComma
    ? parsed.nik || data?.no_karyawan || null
    : data?.no_karyawan || null;
  const telp = data?.telp || null;

  return (
    <div style={{ borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
      <SectionTitle color={C.blue}>
        {title} <DataBadge live={!!live} />
      </SectionTitle>
      <div
        style={{
          padding: "14px 12px 16px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Avatar
          foto={data?.foto}
          fotoFallback={data?.fotoFallback}
          nama={nama}
          size={88}
        />
        <div
          style={{
            fontWeight: 800,
            fontSize: 13,
            lineHeight: 1.15,
            color: "#fff",
            textAlign: "center",
            textTransform: "uppercase",
            letterSpacing: "0.02em",
          }}
        >
          {nama || "—"}
        </div>
        {nik && (
          <div
            style={{
              fontSize: 9,
              color: C.textDim,
              letterSpacing: "0.06em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {nik}
          </div>
        )}
        {telp && <div style={{ fontSize: 9, color: C.textDim }}>{telp}</div>}
      </div>
    </div>
  );
}

// ─── Kolom kiri dashboard ─────────────────────────────────
export default function LeftColumn({
  tanggal,
  line,
  cl_no,
  nama_produk,
  personnel,
  lastRefresh,
}) {
  // Fallback doang, dipake cuma kalau prop `tanggal` dari backend belum
  // kebaca. Pakai WIB (getNowWIB), bukan new Date() lokal browser.
  const today = (() => {
    const now = getNowWIB();
    return `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${String(now.getUTCDate()).padStart(2, "0")}`;
  })();

  return (
    <div
      style={{
        borderRight: `1px solid ${C.borderBr}`,
        display: "flex",
        flexDirection: "column",
        background: C.panel,
        overflow: "hidden",
        minHeight: 0,
      }}
    >
      {/* ── Info dasar ── */}
      <div
        style={{
          padding: "7px 9px",
          borderBottom: `1px solid ${C.border}`,
          flexShrink: 0,
        }}
      >
        <KVRow label="Tanggal" value={tanggal || today} valueColor={C.blue} />
        <KVRow label="CL No" value={cl_no || "—"} valueColor={C.blue} />
        <KVRow
          label="Nama Produk"
          value={nama_produk || "—"}
          valueColor={C.text}
        />

        <div
          style={{
            marginTop: 4,
            fontSize: 9,
            color: C.textDim,
            marginBottom: 3,
          }}
        >
          Kode Cetak
        </div>
        <QRPlaceholder />
      </div>

      {/* ── Personel ── */}
      <PersonelCard title="Cell Leader" data={personnel?.ketua} live />
      <PersonelCard title="PJ Teknisi" data={personnel?.pj_teknis} live />
      <PersonelCard title="Inspector" data={personnel?.inspector} live />
      <div style={{ flex: 1 }} />

      <div
        style={{
          padding: "4px 8px",
          borderTop: `1px solid ${C.border}`,
          fontSize: 8,
          color: C.textMut,
          textAlign: "center",
        }}
      >
        {lastRefresh?.toLocaleTimeString("id-ID") || "—"}
      </div>
    </div>
  );
}
