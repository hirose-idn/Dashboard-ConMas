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
            <div style={{ fontSize: 16, marginBottom: 2 }}>▦</div>
            <div style={{ fontSize: 7, color: C.textDim }}>QR Code</div>
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
function PersonelCard({ icon, title, data, live }) {
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
      <SectionTitle color={C.blue} icon={icon}>
        {title} <DataBadge live={!!live} />
      </SectionTitle>
      <div
        style={{
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Avatar foto={data?.foto} nama={nama} size={60} />
        <div
          style={{
            fontWeight: 800,
            fontSize: 13,
            color: "#fff",
            textAlign: "center",
          }}
        >
          {nama || "—"}
        </div>
        {nik && (
          <div style={{ fontSize: 10, color: C.textDim }}>NIK: {nik}</div>
        )}
        {telp && <div style={{ fontSize: 10, color: C.textDim }}>{telp}</div>}
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
      <PersonelCard
        icon="👤"
        title="Cell Leader"
        data={personnel?.ketua}
        live
      />
      <PersonelCard
        icon="🔧"
        title="PJ Teknisi"
        data={personnel?.pj_teknis}
        live
      />
      <PersonelCard
        icon="🔍"
        title="Inspector"
        data={personnel?.inspector}
        live
      />
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
