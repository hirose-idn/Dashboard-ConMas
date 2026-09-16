import React from "react";
import { C } from "../../config/constants";

// ─── Badge: indikator sumber data ────────────────────────
// ⚠️ Sengaja ASIMETRIS antara live vs mock:
//   live ("DB")   → nyaris tak terlihat (7px, opacity .45, tanpa chip/
//                   border). Ini status NORMAL — di dashboard TV dia
//                   nempel di sebelah angka KPI 46px, jadi kalau dikasih
//                   background + border kayak dulu, mata malah kebaca
//                   "DB" duluan sebelum angkanya. Lihat catatan revisi
//                   v2 poin "Kecilkan badge DB".
//   mock          → TETAP chip oranye yang jelas. Ini kondisi ABNORMAL
//                   (angka di layar bukan dari DB) dan HARUS kelihatan.
export function DataBadge({ live }) {
  if (live) {
    return (
      <span
        style={{
          fontSize: 7,
          fontWeight: 700,
          letterSpacing: "0.08em",
          color: C.green,
          opacity: 0.45,
          whiteSpace: "nowrap",
          lineHeight: 1,
        }}
      >
        DB
      </span>
    );
  }

  return (
    <span
      style={{
        fontSize: 7,
        fontWeight: 700,
        padding: "1px 5px",
        borderRadius: 2,
        background: "#2a001c",
        color: C.orange,
        border: `1px solid ${C.orange}44`,
        whiteSpace: "nowrap",
      }}
    >
      ○ mock
    </span>
  );
}

// ─── Progress bar horizontal ─────────────────────────────
export function ProgressBar({ pct, color, label }) {
  const clamped = Math.min(Math.max(pct ?? 0, 0), 100);
  const ticks = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
      {/* Row: label kiri + % kanan */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        {label && (
          <span style={{
            fontSize: 11,
            fontWeight: 800,
            color: C.textDim,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            {label}
          </span>
        )}
        <span style={{
          fontSize: 28,
          fontWeight: 900,
          color,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          textShadow: `0 0 16px ${color}88`,
          fontVariantNumeric: "tabular-nums",
          marginLeft: "auto",
        }}>
          {clamped.toFixed(0)}
          <span style={{ fontSize: 14, fontWeight: 700, color: `${color}cc`, marginLeft: 1 }}>%</span>
        </span>
      </div>

      {/* Bar utama */}
      <div style={{
        position: "relative",
        height: 14,
        background: "#061c2e",
        borderRadius: 2,
        overflow: "hidden",
        border: `1px solid ${color}22`,
      }}>
        {/* Fill */}
        <div style={{
          position: "absolute",
          left: 0, top: 0,
          height: "100%",
          width: `${clamped}%`,
          background: `linear-gradient(90deg, ${color}99, ${color})`,
          transition: "width 0.8s ease",
          boxShadow: `0 0 10px ${color}66`,
        }} />
        {/* Tick marks */}
        {ticks.slice(0, -1).map(t => (
          <div key={t} style={{
            position: "absolute",
            left: `${t}%`,
            top: 0, bottom: 0,
            width: 1,
            background: "#ffffff18",
            zIndex: 1,
          }} />
        ))}
      </div>

      {/* Tick labels */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "0 0",
      }}>
        {ticks.map(t => (
          <span key={t} style={{
            fontSize: 7,
            color: C.textMut,
            letterSpacing: 0,
            lineHeight: 1,
          }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Avatar lingkaran dengan inisial fallback ─────────────
// Ekstensi yang dicoba secara berurutan kalau .jpg gagal
const FOTO_EXTS = ["jpg", "jpeg", "png", "webp"];

export function Avatar({ foto, fotoFallback, nama, size = 48 }) {
  // foto = URL dasar (TANPA ekstensi final, dihapus di bawah) dari hook.
  // Dulu cuma 1 base URL yang dicoba (4 ekstensi berurutan). Sekarang ada
  // 2 TINGKAT base URL:
  //  1. `foto`         — biasanya foto ROLE-SPECIFIC, misal
  //                      <nik>_cellleader.jpg (kerudung biru) atau
  //                      <nik>_inspector.jpg (kerudung kuning) — dipake
  //                      buat kasus 1 orang bisa jadi 2 role beda seragam.
  //  2. `fotoFallback` — foto GENERIC <nik>.jpg, dicoba kalau foto
  //                      role-specific di atas gak ketemu di ekstensi
  //                      manapun (belum di-upload / orang itu cuma 1 role).
  // Kalau ujung-ujungnya dua-duanya gagal, baru jatuh ke inisial seperti
  // biasa. Behavior LAMA (cuma `foto` doang, gak ada `fotoFallback`) tetep
  // jalan sama persis — tingkat ke-2 cuma aktif kalau prop-nya diisi.
  const bases = [foto, fotoFallback]
    .filter(Boolean)
    .map((url) => url.replace(/\.[^.]+$/, "")); // hapus ekstensi masing2
  const [attemptIdx, setAttemptIdx] = React.useState(0);

  // Reset saat foto/fotoFallback prop berubah (ganti karyawan atau ganti role)
  React.useEffect(() => {
    setAttemptIdx(0);
  }, [foto, fotoFallback]);

  const initials = (nama || "")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const totalAttempts = bases.length * FOTO_EXTS.length;
  const allFailed = attemptIdx >= totalAttempts;
  const baseUrl = bases[Math.floor(attemptIdx / FOTO_EXTS.length)];
  const ext = FOTO_EXTS[attemptIdx % FOTO_EXTS.length];
  const currentSrc = baseUrl && !allFailed ? `${baseUrl}.${ext}` : null;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "18%",
        background: "radial-gradient(circle at 35% 35%, #003a52, #050f14)",
        border: `2px solid ${C.borderBr}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        overflow: "hidden",
        boxShadow: `0 0 12px ${C.blueDim}`,
        position: "relative",
      }}
    >
      {currentSrc ? (
        <img
          src={currentSrc}
          alt={nama}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={() => setAttemptIdx((i) => i + 1)} // coba kombinasi berikutnya (ekstensi, lalu fallback generic)
        />
      ) : (
        // Inisial ini FALLBACK (foto belum di-upload) — sengaja dibikin
        // kalem (textDim, bukan cyan terang) supaya slot yang fotonya
        // belum ada gak lebih mencolok daripada slot yang ada fotonya.
        <span
          style={{
            fontSize: Math.round(size * 0.28),
            fontWeight: 700,
            color: C.textDim,
            letterSpacing: "0.04em",
          }}
        >
          {initials || "?"}
        </span>
      )}
    </div>
  );
}

// ─── Judul seksi dengan border kiri ─────────────────────
// ⚠️ Prop `icon` DIHAPUS (dulu dipakai buat emoji 👤/🔧/🔍). Identitas
// visual seksi sekarang murni dari `border-left: 3px solid <color>` +
// warna teks — emoji di layar TV lantai produksi rendernya beda-beda per
// OS/browser dan bikin dashboard kelihatan kayak prototype, bukan MES.
export function SectionTitle({ children, color = C.blue }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        borderLeft: `3px solid ${color}`,
        background: `linear-gradient(90deg, ${color}18, transparent)`,
        padding: "3px 8px 3px 7px",
        borderBottom: `1px solid ${C.border}`,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          color,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {children}
      </span>
    </div>
  );
}

// ─── Baris key-value ─────────────────────────────────────
export function KVRow({ label, value, valueColor = C.text }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "2px 0",
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <span style={{ fontSize: 9, color: C.textDim }}>{label}</span>
      <span style={{ fontSize: 9, fontWeight: 600, color: valueColor }}>
        {value}
      </span>
    </div>
  );
}

// ─── Header cell tabel ───────────────────────────────────
export function TH({ children, style = {} }) {
  return (
    <th
      style={{
        background: "#003040",
        color: C.blue,
        fontSize: 9,
        fontWeight: 700,
        padding: "4px 5px",
        borderBottom: `1px solid ${C.borderBr}`,
        borderRight: `1px solid ${C.border}`,
        textAlign: "center",
        whiteSpace: "nowrap",
        letterSpacing: "0.04em",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

// ─── Data cell tabel ─────────────────────────────────────
export function TD({ children, style = {} }) {
  return (
    <td
      style={{
        fontSize: 10,
        padding: "3px 5px",
        borderBottom: `1px solid ${C.border}`,
        borderRight: `1px solid ${C.border}`,
        textAlign: "center",
        ...style,
      }}
    >
      {children}
    </td>
  );
}
