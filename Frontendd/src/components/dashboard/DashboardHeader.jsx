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

// ─── Header utama dashboard ───────────────────────────────
export default function DashboardHeader({ loading, error, line, nama_produk }) {
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
      }}
    >
      <Clock />

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
          TAMPILAN DATA PRODUKSI REAL-TIME
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {error ? (
            <span style={{ fontSize: 8, color: C.red }}>⚠ {error}</span>
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
        {/* LINE — besar */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span
            style={{ fontSize: 10, color: C.textDim, letterSpacing: "0.12em" }}
          >
            LINE
          </span>
          <span
            style={{
              fontSize: 28,
              fontWeight: 900,
              color: C.green,
              letterSpacing: "0.08em",
              lineHeight: 1,
              textShadow: `0 0 16px ${C.green}88`,
            }}
          >
            {line || "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
