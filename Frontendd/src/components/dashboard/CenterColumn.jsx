import React from "react";
import { C } from "../../config/constants";
import { fmt } from "../../config/utils";
import { DataBadge, ProgressBar, SectionTitle, TH, TD } from "../ui";

// Dulu di sini ada SHIFT_SLOTS + filterHourlyByShift yang hardcode daftar
// kolom jam per shift (jam Internal: shift 1 mulai 07:00, malam 22:00,
// dst). Itu penyebab bug: line subcont (Systech) yang jam shiftnya beda
// (misal 08:00-20:00) tetap ditampilin pakai kolom jam Internal, jadi
// kolom yang muncul salah dan data ketuker slot.
//
// Sekarang backend (`GET /api/dashboard`) yang nentuin kolom mana yang
// relevan buat shift ini — dihitung dari jam start/end beneran (env var
// SHIFT2_START_HOUR dkk per instance, lihat utils/shiftResolver.js ->
// getShiftSlotLabels), bukan tebakan hardcode di FE. Array `hourly` yang
// dikirim backend udah persis kolom yang mau ditampilkan, jadi FE tinggal
// render apa adanya — otomatis benar juga buat shift malam / 3-shift /
// jam custom apa pun tanpa perlu maintain mapping ini lagi.

// ─── Card metrik besar (Target/Hasil/Deviasi/PPM) ─────────
function MetricCard({ label, value, color, noBorderRight, badge, unit }) {
  return (
    <div
      style={{
        padding: "14px 10px",
        textAlign: "center",
        minHeight: 80,
        borderRight: noBorderRight ? "none" : `1px solid ${C.border}`,
        background: `radial-gradient(ellipse at 50% 0%, ${color}10, transparent 70%)`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 5,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: C.textDim,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        {badge && <DataBadge live={badge === "live"} />}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "center",
          gap: 4,
        }}
      >
        <span
          style={{
            fontSize: 38,
            fontWeight: 900,
            color,
            lineHeight: 1,
            textShadow: `0 0 24px ${color}66`,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
        {unit && <span style={{ fontSize: 10, color: C.textDim }}>{unit}</span>}
      </div>
    </div>
  );
}

// ─── Tabel rekapitulasi per jam ───────────────────────────
function HourlyTable({ hourly }) {
  const rows = [
    { label: "Output Plan", key: "output_plan", color: C.textDim },
    { label: "Output Actual", key: "output_actual", color: C.green },
    { label: "Deviasi", key: "deviasi", color: null },
    { label: "Pencapaian", key: "pencapaian", color: C.blue, suffix: "%" },
  ];

  return (
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        tableLayout: "fixed",
      }}
    >
      <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
        <tr>
          <TH style={{ width: 110, textAlign: "left" }}>Keterangan</TH>
          {hourly.map((h) => (
            <TH key={h.slot}>{h.slot}</TH>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr
            key={row.key}
            style={{
              background: ri % 2 === 0 ? `${C.border}30` : "transparent",
            }}
          >
            <td
              style={{
                fontSize: 9,
                padding: "4px 6px",
                color: "#8a9ab0",
                borderBottom: `1px solid ${C.border}`,
                borderRight: `1px solid ${C.borderBr}`,
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {row.label}
            </td>
            {hourly.map((h) => {
              // Pencapaian = (output_actual / output_plan) * 100
              let v;
              if (row.key === "pencapaian") {
                const plan = Number(h.output_plan);
                const actual = Number(h.output_actual);
                v =
                  plan > 0 && actual !== null && actual !== undefined
                    ? Math.round((actual / plan) * 100)
                    : null;
              } else {
                v = h[row.key];
              }
              const isNeg = row.key === "deviasi" && Number(v) < 0;
              const isPos = row.key === "deviasi" && Number(v) > 0;
              // Pencapaian: hijau >= 100%, kuning >= 80%, merah < 80%
              let clr;
              if (row.key === "pencapaian" && v !== null) {
                clr = v >= 100 ? C.green : v >= 80 ? C.yellow : C.red;
              } else {
                clr = isNeg ? C.red : isPos ? C.green : row.color || C.textDim;
              }
              return (
                <TD
                  key={h.slot}
                  style={{ color: clr, fontSize: 10, padding: "4px 5px" }}
                >
                  {v !== null && v !== undefined
                    ? fmt(v) + (row.suffix || "")
                    : "—"}
                </TD>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Card availability ringkas (Bekidoritsu/OEE) — stackable ─
function AvailabilityCard({ icon, label, pct, color, live }) {
  const clamped = Math.min(Math.max(pct ?? 0, 0), 100);
  return (
    <div
      style={{
        flex: 1,
        padding: "10px 16px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 7,
        borderLeft: `3px solid ${color}`,
        background: `radial-gradient(ellipse at 0% 50%, ${color}14, transparent 75%)`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13 }}>{icon}</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: C.textDim,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {label}
          </span>
          <DataBadge live={live} />
        </div>
        <span
          style={{
            fontSize: 24,
            fontWeight: 900,
            color,
            lineHeight: 1,
            textShadow: `0 0 16px ${color}77`,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {clamped.toFixed(0)}
          <span style={{ fontSize: 11, fontWeight: 700, color: `${color}cc` }}>
            %
          </span>
        </span>
      </div>
      <div
        style={{
          position: "relative",
          height: 10,
          background: "#061c2e",
          borderRadius: 2,
          overflow: "hidden",
          border: `1px solid ${color}22`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: "100%",
            width: `${clamped}%`,
            background: `linear-gradient(90deg, ${color}99, ${color})`,
            transition: "width 0.8s ease",
            boxShadow: `0 0 8px ${color}66`,
          }}
        />
      </div>
    </div>
  );
}

// ─── Kolom tengah dashboard ───────────────────────────────
export default function CenterColumn({
  nama_produk,
  cycle_time_swi,
  cycle_time_actual,
  output_plan,
  output_produksi,
  deviasi_target,
  qty_reject_ppm,
  stoptime_menit,
  availability,
  monthly,
  hourly,
  shift,
}) {
  // `hourly` dari backend udah difilter & diurutin sesuai shift aktif —
  // gak perlu difilter ulang di FE (lihat catatan di atas file).
  const filteredHourly = hourly;
  const ctOvertime =
    cycle_time_actual !== null && cycle_time_swi !== null
      ? cycle_time_actual > cycle_time_swi
      : false;

  // qty_reject_ppm sudah dihitung di hook (dari shift berjalan)

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: C.panelAlt,
        minHeight: 0,
      }}
    >
      {/* ── 4 metrik utama (Output Plan/Produksi/Deviasi/PPM) ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          borderBottom: `1px solid ${C.borderBr}`,
          flexShrink: 0,
          background: `linear-gradient(180deg, ${C.border}, ${C.panelAlt})`,
        }}
      >
        <MetricCard
          label="Output Plan"
          value={fmt(output_plan)}
          color={C.green}
          badge="live"
          unit="pcs"
        />
        <MetricCard
          label="Output Actual"
          value={fmt(output_produksi)}
          color={C.text}
          badge="live"
          unit="pcs"
        />
        <MetricCard
          label="Deviasi Target"
          value={(deviasi_target >= 0 ? "+" : "") + fmt(deviasi_target)}
          color={deviasi_target < 0 ? C.red : C.green}
          badge="live"
          unit="pcs"
        />
        <MetricCard
          label="Qty Reject PPM"
          value={fmt(qty_reject_ppm)}
          color={qty_reject_ppm > 0 ? C.red : C.text}
          noBorderRight
          badge="live"
          unit="PPM"
        />
      </div>

      {/* ── Cycle Time SWI/Actual + Total Stoptime — 1 baris, 3 card ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          borderBottom: `1px solid ${C.borderBr}`,
          flexShrink: 0,
          background: `linear-gradient(180deg, ${C.border}, ${C.panelAlt})`,
        }}
      >
        <MetricCard
          label="Cycle Time SWI"
          value={cycle_time_swi ?? "—"}
          color={C.green}
          badge="live"
          unit="sec"
        />
        <MetricCard
          label="Cycle Time Actual"
          value={cycle_time_actual ?? "—"}
          color={ctOvertime ? C.red : C.green}
          badge="live"
          unit="sec"
        />
        <MetricCard
          label="Total Stoptime"
          value={fmt(stoptime_menit, 1)}
          color={C.orange}
          noBorderRight
          badge="live"
          unit="menit"
        />
      </div>

      {/* ── Bekidoritsu + OEE (stacked, full width) ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          borderBottom: `1px solid ${C.borderBr}`,
          flexShrink: 0,
          background: `linear-gradient(180deg, ${C.border}, ${C.panelAlt})`,
        }}
      >
        <AvailabilityCard
          icon="🧍"
          label="Bekidoritsu"
          pct={availability.operator}
          color={C.blue}
          live={availability.operator !== null}
        />
        <div style={{ height: 1, background: C.border }} />
        <AvailabilityCard
          icon="⚙️"
          label="OEE"
          pct={availability.mesin}
          color={C.green}
          live={true}
        />
      </div>

      {/* ── Evaluasi Kinerja Line — scope: akumulasi cacat s.d proses bermasalah ── */}
      <div style={{ flexShrink: 0 }}>
        {/* Header center dengan garis dekorasi kiri-kanan */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            background: `linear-gradient(90deg, transparent, ${C.blue}14, transparent)`,
            borderBottom: `1px solid ${C.border}`,
            padding: "5px 14px",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              flex: 1,
              height: 1,
              background: `linear-gradient(90deg, transparent, ${C.blue}50)`,
            }}
          />
          <span style={{ fontSize: 10 }}>📊</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: C.blue,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
            }}
          >
            Evaluasi Kinerja Line — Bulan Berjalan
          </span>
          <div
            style={{
              flex: 1,
              height: 1,
              background: `linear-gradient(90deg, ${C.blue}50, transparent)`,
            }}
          />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5,1fr)",
            borderBottom: `1px solid ${C.borderBr}`,
          }}
        >
          {/* Total Output Actual (akumulasi bulanan) */}
          <div
            style={{
              padding: "10px 8px",
              textAlign: "center",
              minHeight: 120,
              borderRight: `1px solid ${C.border}`,
              background: `radial-gradient(ellipse at 50% 0%, ${C.green}10, transparent 65%)`,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 4,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  color: C.textDim,
                  textAlign: "center",
                  lineHeight: 1.4,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Total Output Actual (Bulan)
              </span>
              <DataBadge live={true} />
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "center",
                gap: 3,
              }}
            >
              <span
                style={{
                  fontSize: 28,
                  fontWeight: 900,
                  color: C.green,
                  lineHeight: 1,
                  textShadow: `0 0 14px ${C.green}55`,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {monthly.total_output !== null &&
                monthly.total_output !== undefined
                  ? fmt(monthly.total_output)
                  : "—"}
              </span>
              <span style={{ fontSize: 10, color: C.textDim }}>pcs</span>
            </div>
          </div>

          {/* Total Qty Reject (akumulasi bulanan) */}
          <div
            style={{
              padding: "10px 8px",
              textAlign: "center",
              minHeight: 120,
              borderRight: `1px solid ${C.border}`,
              background: `radial-gradient(ellipse at 50% 0%, ${C.red}10, transparent 65%)`,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 4,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  color: C.textDim,
                  textAlign: "center",
                  lineHeight: 1.4,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Total Qty Reject (Bulan)
              </span>
              <DataBadge live={true} />
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "center",
                gap: 3,
              }}
            >
              <span
                style={{
                  fontSize: 28,
                  fontWeight: 900,
                  color: C.red,
                  lineHeight: 1,
                  textShadow: `0 0 14px ${C.red}55`,
                }}
              >
                {monthly.total_qty_reject !== null
                  ? fmt(monthly.total_qty_reject)
                  : "—"}
              </span>
              <span style={{ fontSize: 10, color: C.textDim }}>pcs</span>
            </div>
          </div>

          {/* Qty Reject PPM akumulasi */}
          <div
            style={{
              padding: "10px 8px",
              textAlign: "center",
              minHeight: 120,
              borderRight: `1px solid ${C.border}`,
              background: `radial-gradient(ellipse at 50% 0%, ${C.red}10, transparent 65%)`,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 4,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  color: C.textDim,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Akumulasi REJECT PPM
              </span>
              <DataBadge live={true} />
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "center",
                gap: 3,
              }}
            >
              <span
                style={{
                  fontSize: 28,
                  fontWeight: 900,
                  color: C.red,
                  lineHeight: 1,
                  textShadow: `0 0 14px ${C.red}55`,
                }}
              >
                {monthly.ppm !== null ? fmt(monthly.ppm) : "—"}
              </span>
              <span style={{ fontSize: 10, color: C.textDim }}>PPM</span>
            </div>
          </div>

          {/* 4M Grid — menggantikan Jumlah Micro-Stop & Proses Bermasalah */}
          <div
            style={{
              gridColumn: "span 2",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gridTemplateRows: "auto 1fr 1fr",
            }}
          >
            {/* Label 4M header */}
            <div
              style={{
                gridColumn: "span 2",
                textAlign: "center",
                fontSize: 10,
                fontWeight: 800,
                color: C.blue,
                letterSpacing: "0.10em",
                padding: "3px 0 2px",
                borderBottom: `1px solid ${C.border}`,
                background: `linear-gradient(90deg, transparent, ${C.blue}10, transparent)`,
              }}
            >
              4M
            </div>

            {[
              { label: "MACHINE", key: "machine" },
              { label: "METHOD", key: "method" },
              { label: "MAN", key: "man" },
              { label: "MATERIAL", key: "material" },
            ].map((item, idx) => (
              <div
                key={item.key}
                style={{
                  padding: "8px 10px",
                  textAlign: "center",
                  borderRight: idx % 2 === 0 ? `1px solid ${C.border}` : "none",
                  borderBottom: idx < 2 ? `1px solid ${C.border}` : "none",
                  background: `radial-gradient(ellipse at 50% 0%, ${C.blue}08, transparent 70%)`,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 4,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color: C.textDim,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    {item.label}
                  </span>
                  <DataBadge live={true} />
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "center",
                    gap: 3,
                  }}
                >
                  <span
                    style={{
                      fontSize: 26,
                      fontWeight: 900,
                      color: C.text,
                      lineHeight: 1,
                      textShadow: `0 0 10px ${C.blue}33`,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {monthly[item.key] !== null &&
                    monthly[item.key] !== undefined
                      ? fmt(monthly[item.key])
                      : "0"}
                  </span>
                  <span style={{ fontSize: 9, color: C.textDim }}>menit</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tabel rekapitulasi per jam ── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Judul tengah */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "5px 12px",
            background: `linear-gradient(90deg, transparent, ${C.green}12, transparent)`,
            borderBottom: `1px solid ${C.border}`,
            flexShrink: 0,
            gap: 8,
          }}
        >
          <span style={{ fontSize: 11 }}>⏱</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: C.green,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Rekapitulasi Produksi Per Jam
          </span>
        </div>

        <div style={{ flex: 1, overflow: "auto" }}>
          <HourlyTable hourly={filteredHourly} />
        </div>
      </div>
    </div>
  );
}
