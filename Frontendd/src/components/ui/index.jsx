import React from "react";
import { C } from "../../config/constants";

// ─── Badge: indikator sumber data ────────────────────────
export function DataBadge({ live }) {
  return (
    <span
      style={{
        fontSize: 7,
        fontWeight: 700,
        padding: "1px 5px",
        borderRadius: 2,
        background: live ? C.greenDim : "#2a001c",
        color: live ? C.green : C.orange,
        border: `1px solid ${live ? C.green + "44" : C.orange + "44"}`,
        whiteSpace: "nowrap",
      }}
    >
      {live ? "● DB" : "○ mock"}
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

export function Avatar({ foto, nama, size = 48 }) {
  // foto = URL dasar dengan ekstensi .jpg dari hook
  // Kalau gagal, Avatar mencoba ekstensi berikutnya, lalu fallback ke inisial

  const baseUrl = foto ? foto.replace(/\.[^.]+$/, "") : null; // hapus ekstensi
  const [extIdx, setExtIdx] = React.useState(0);

  // Reset saat foto prop berubah (ganti karyawan)
  React.useEffect(() => {
    setExtIdx(0);
  }, [foto]);

  const initials = (nama || "")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const allFailed = extIdx >= FOTO_EXTS.length;
  const currentSrc =
    baseUrl && !allFailed ? `${baseUrl}.${FOTO_EXTS[extIdx]}` : null;

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
          onError={() => setExtIdx((i) => i + 1)} // coba ekstensi berikutnya
        />
      ) : (
        <span style={{ fontSize: size * 0.3, fontWeight: 800, color: C.blue }}>
          {initials || "?"}
        </span>
      )}
    </div>
  );
}

// ─── Judul seksi dengan border kiri ─────────────────────
export function SectionTitle({ children, color = C.blue, icon }) {
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
      {icon && <span style={{ fontSize: 10 }}>{icon}</span>}
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
