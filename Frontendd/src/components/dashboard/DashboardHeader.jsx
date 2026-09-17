import React, { useState, useEffect } from "react";
import { C, REFRESH_MS } from "../../config/constants";
import { getNowWIB } from "../../config/utils";

// ─── Jam digital real-time ────────────────────────────────
// PENTING: pakai getNowWIB() (offset +7 manual dari UTC) + dibaca lewat
// getUTCxxx(), BUKAN new Date() + getHours()/getDate() lokal — supaya jam
// yang ditampilin selalu WIB, gak ikut timezone device yang buka dashboard.
function Clock() {
  const [now, setNow] = useState(getNowWIB());

  useEffect(() => {
    const t = setInterval(() => setNow(getNowWIB()), 1000);
    return () => clearInterval(t);
  }, []);

  const pad = (n) => String(n).padStart(2, "0");
  const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const BULAN = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ fontSize: 11, color: C.textDim }}>
        {HARI[now.getUTCDay()]}, {now.getUTCDate()} {BULAN[now.getUTCMonth()]}{" "}
        {now.getUTCFullYear()}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 800,
          color: C.blue,
          letterSpacing: 2,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {pad(now.getUTCHours())}:{pad(now.getUTCMinutes())}
        <span style={{ fontSize: 13, color: C.textDim }}>
          .{pad(now.getUTCSeconds())}
        </span>
      </div>
    </div>
  );
}

// ─── Pill status line (RUNNING / STANDBY / STOP / HISTORIS) ─
// Peta status ini SENGAJA sama sumbernya dengan alarm full-screen di
// PCBDashboard.jsx (d.line_status dari backend) — biar gak pernah ada
// kondisi "pill bilang RUNNING tapi layar lagi blink merah".
const STATUS_MAP = {
  running: { label: "RUNNING", key: "green" },
  waiting: { label: "STANDBY", key: "orange" },
  not_running: { label: "STOP", key: "red" },
  no_data: { label: "NO DATA", key: "textDim" },
  shift_not_found: { label: "NO DATA", key: "textDim" },
};

function StatusPill({ historical, lineStatus }) {
  // Di mode historis, "RUNNING" gak punya makna (ini rekap hari lewat) —
  // yang relevan cuma "ini bukan live".
  const s = historical
    ? { label: "HISTORIS", key: "orange" }
    : STATUS_MAP[lineStatus] || STATUS_MAP.running;
  const color = C[s.key] || C.textDim;

  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: "0.14em",
        color,
        background: `${color}1e`,
        border: `1px solid ${color}55`,
        borderRadius: 3,
        padding: "2px 8px",
        lineHeight: 1.4,
      }}
    >
      {s.label}
    </span>
  );
}

// ─── Header utama dashboard ───────────────────────────────
// `historical` + `viewedDate` diisi cuma pas dashboard ini dibuka dari
// Master Dashboard yang lagi di-backdate (lihat App.jsx/PCBDashboard.jsx) —
// judul & status kanan-atas berubah biar operator/manajemen gak salah kira
// ini data LIVE, padahal lagi liat rekap hari yang udah lewat.
export default function DashboardHeader({
  onBack,
  loading,
  error,
  line,
  nama_produk,
  historical,
  viewedDate,
  availableShifts,
  shiftOverride,
  onShiftChange,
  lineStatus,
}) {
  return (
    <div
      style={{
        background: "linear-gradient(90deg, #050f14, #091820, #050f14)",
        borderBottom: `2px solid ${C.borderBr}`,
        padding: "8px 18px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
        boxShadow: "0 2px 24px #00000088",
        minHeight: 52,
        position: "relative",
      }}
    >
      <Clock />

      {/* CUMA muncul kalau ada onBack (dibuka lewat popup "Dashboard per
          Line" dari Master Dashboard/Ranking Line dst — lihat App.jsx).
          Balik ke halaman SEBELUMNYA (window.history.back), bukan tujuan
          tetap, karena PCBDashboard bisa dibuka dari banyak tempat. Diletak
          nempel di atas Clock, kecil aja — layar ini kiosk/TV, jangan
          ganggu tampilan utama. */}
      {onBack && (
        <button
          onClick={onBack}
          style={{
            position: "absolute",
            top: 6,
            left: 18,
            background: "transparent",
            border: "none",
            color: C.blue,
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            padding: 0,
          }}
        >
          ← Kembali
        </button>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1,
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 900,
            color: "#fff",
            letterSpacing: "0.18em",
            textShadow: `0 0 30px ${C.blue}88`,
          }}
        >
          {historical
            ? `REKAP DATA PRODUKSI · ${viewedDate || "—"}`
            : "TAMPILAN DATA PRODUKSI REAL-TIME"}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {error ? (
            <span style={{ fontSize: 8, color: C.red }}>{error}</span>
          ) : historical ? (
            <>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: C.orange,
                  display: "inline-block",
                }}
              />
              <span
                style={{
                  fontSize: 8,
                  color: C.orange,
                  letterSpacing: "0.1em",
                  fontWeight: 700,
                }}
              >
                {loading ? "MEMUAT..." : "HISTORIS · bukan live"}
              </span>
              {/* Toggle Shift 1/2/dst — CUMA muncul kalau tanggal yang lagi
                  dibuka beneran punya >1 shift dengan data (availableShifts
                  dari backend, lihat GET / dashboard.js). Ditaro nempel di
                  bawah badge HISTORIS biar jelas relasinya "ini rekap
                  historis, dan tanggal ini ada beberapa shift, pilih yang
                  mana". Kalau cuma 1 shift (atau belum tau), gak usah
                  nampilin apa-apa — gak perlu bikin bingung. */}
              {Array.isArray(availableShifts) && availableShifts.length > 1 && (
                <div style={{ display: "flex", gap: 4, marginLeft: 6 }}>
                  {availableShifts.map((num) => {
                    const active =
                      shiftOverride == null
                        ? num === availableShifts[availableShifts.length - 1]
                        : String(shiftOverride) === String(num);
                    return (
                      <button
                        key={num}
                        onClick={() => onShiftChange?.(num)}
                        style={{
                          fontSize: 8,
                          fontWeight: 700,
                          letterSpacing: "0.05em",
                          padding: "2px 8px",
                          borderRadius: 10,
                          border: `1px solid ${active ? C.blue : C.border}`,
                          background: active ? `${C.blue}22` : "transparent",
                          color: active ? C.blue : C.textDim,
                          cursor: "pointer",
                        }}
                      >
                        Shift {num}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: loading ? C.orange : C.green,
                  display: "inline-block",
                  animation: "pulse-dot 1.5s ease-in-out infinite",
                  boxShadow: `0 0 6px ${loading ? C.orange : C.green}`,
                }}
              />
              <span
                style={{
                  fontSize: 8,
                  color: C.textDim,
                  letterSpacing: "0.1em",
                }}
              >
                {loading ? "MEMUAT..." : `LIVE · refresh ${REFRESH_MS / 1000}s`}
              </span>
            </>
          )}
        </div>
      </div>

      <div
        style={{
          textAlign: "right",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 2,
        }}
      >
        {/* LINE — hal PERTAMA yang dicari orang pabrik pas lewat depan TV
            ("ini layar line mana?"). Dulu 28px, kalah sama angka KPI 46px
            di tengah. Sekarang 40px dan label "LINE" pindah ke atas biar
            nomornya berdiri sendiri. */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span
            style={{ fontSize: 10, color: C.textDim, letterSpacing: "0.12em" }}
          >
            LINE
          </span>
          <span
            style={{
              fontSize: 40,
              fontWeight: 900,
              color: C.green,
              letterSpacing: "0.06em",
              lineHeight: 1,
              textShadow: `0 0 20px ${C.green}88`,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {line || "—"}
          </span>
        </div>

        {/* Status pill — nempel di bawah nomor line, jadi "line mana" dan
            "line ini lagi gimana" kebaca dalam satu lirikan. */}
        <StatusPill historical={historical} lineStatus={lineStatus} />

        {nama_produk && (
          <span
            style={{
              fontSize: 9,
              color: C.textMut,
              letterSpacing: "0.04em",
              maxWidth: 220,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {nama_produk}
          </span>
        )}
      </div>
    </div>
  );
}
