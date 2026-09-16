import React from "react";
import { C } from "../../config/constants";
import { fmt, getNowWIB } from "../../config/utils";
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
// `size` bikin HIERARKI yang dulu gak ada: baris 1 (Output Plan/Actual/
// Deviasi/PPM) itu angka yang dicari orang dari jarak 5 meter → "primary"
// (46px). Baris 2 (Cycle Time/Stoptime) angka pendukung → "secondary"
// (32px). Dulu dua-duanya 38px, jadi mata gak punya titik masuk.
const METRIC_SIZE = {
  primary: { value: 46, minHeight: 86, pad: "14px 10px" },
  secondary: { value: 32, minHeight: 66, pad: "10px 10px" },
};

function MetricCard({
  label,
  value,
  color,
  noBorderRight,
  badge,
  unit,
  size = "primary",
}) {
  const s = METRIC_SIZE[size] || METRIC_SIZE.primary;
  return (
    <div
      style={{
        padding: s.pad,
        textAlign: "center",
        minHeight: s.minHeight,
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
            fontSize: s.value,
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

// ─── Legend chip kecil buat chart kumulatif ───────────────
function LegendItem({ color, dashed, swatch, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      {swatch ? (
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            background: color,
            opacity: 0.35,
            border: `1px solid ${color}`,
          }}
        />
      ) : (
        <svg width="16" height="8" style={{ flexShrink: 0 }}>
          <line
            x1="0"
            y1="4"
            x2="16"
            y2="4"
            stroke={color}
            strokeWidth={dashed ? 2 : 3}
            strokeDasharray={dashed ? "4 3" : undefined}
          />
        </svg>
      )}
      <span style={{ fontSize: 9, color: C.textDim }}>{label}</span>
    </div>
  );
}

// ─── Chart trend Output KUMULATIF vs Plan (bukan per-jam) ─
// Ganti TOTAL dari versi bar sebelumnya, atas kritik yang valid:
// 1. Bar versi lama judulnya "vs Plan" tapi Plan-nya gak digambar sama
//    sekali (cuma garis tipis acuan). Sekarang DUA garis beneran:
//    Plan Kumulatif (putus-putus, biru) & Actual Kumulatif (solid,
//    hijau), plus area gap di antaranya — baru jujur disebut "vs Plan".
// 2. Ini BUKAN pengulangan tabel di atas. Tabel = delta per jam
//    (presisi). Chart ini = APAKAH gap-nya MELEBAR sepanjang hari,
//    insight yang gak kelihatan dari angka per-jam yang berdiri
//    sendiri-sendiri (itu justru alasan management lebih suka lihat
//    gap kumulatif).
// 3. Jam yang BELUM ada datanya (live, belum kejalanin) gak lagi
//    digambar sebagai bar/garis flat yang kelihatan kayak bug — garis
//    Actual BERHENTI TOTAL di jam terakhir yang ada datanya. Garis Plan
//    tetap jalan sampai akhir shift (itu proyeksi target, wajar keliatan
//    di depan "sekarang").
// 4. Legend + sumbu Y (gridline+angka) + sumbu X (label jam) — lengkap.
// 5. Marker "SEKARANG" CUMA muncul kalau !historical (live) — di rekap
//    historis gak ada "sekarang" yang masuk akal, jadi disembunyikan
//    total, bukan dipaksa nampilin jam yang salah konteks.
function CumulativeTrendChart({ hourly, historical }) {
  if (!hourly || hourly.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.textMut,
          fontSize: 10,
        }}
      >
        Belum ada data jam buat trend kumulatif
      </div>
    );
  }

  // viewBox tetap (900x230), tapi di-render preserveAspectRatio="none"
  // + width/height 100% — SVG-nya ikut gede/kecilin sesuai ruang yang
  // dikasih parent flex (bisa TV lebar-pendek atau layar lain), bukan
  // dipatok px. Trade-off: garis/lingkaran bisa dikit gepeng kalau rasio
  // kontainer beda jauh dari 900:230, tapi itu jauh lebih aman daripada
  // chart kepotong/scroll di kiosk.
  const W = 900;
  const H = 230;
  const padL = 46;
  const padR = 16;
  const padT = 14;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // ── Kumulatif Plan (semua jam) & Actual (berhenti di jam pertama
  //    yang belum ada datanya) ──
  let planRunning = 0;
  let actualRunning = 0;
  let actualStopped = false;
  const points = hourly.map((h) => {
    planRunning += Number(h.output_plan) || 0;
    let actualCum = null;
    if (!actualStopped) {
      if (h.output_actual === null || h.output_actual === undefined) {
        actualStopped = true;
      } else {
        actualRunning += Number(h.output_actual) || 0;
        actualCum = actualRunning;
      }
    }
    return { slot: h.slot, planCum: planRunning, actualCum };
  });

  let lastActualIdx = -1;
  points.forEach((p, i) => {
    if (p.actualCum !== null) lastActualIdx = i;
  });
  const lastPoint = lastActualIdx >= 0 ? points[lastActualIdx] : null;
  const gapAtLast = lastPoint ? lastPoint.actualCum - lastPoint.planCum : null;

  const maxVal = Math.max(
    1,
    ...points.map((p) => p.planCum),
    ...points.map((p) => p.actualCum || 0),
  );
  // Bulatin atap sumbu Y ke kelipatan rapi biar gridline gak pecahan aneh
  const niceMax = (() => {
    const raw = maxVal * 1.12;
    const magnitude = Math.pow(10, Math.max(0, Math.floor(Math.log10(raw)) - 1));
    return Math.ceil(raw / magnitude) * magnitude;
  })();
  const Y_TICKS = 4;

  const xAt = (i) => padL + (plotW * i) / Math.max(1, points.length - 1);
  const yAt = (v) => padT + plotH - (plotH * Math.min(v, niceMax)) / niceMax;

  const planPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p.planCum).toFixed(1)}`)
    .join(" ");
  const actualPts = points
    .map((p, i) => ({ ...p, i }))
    .filter((p) => p.actualCum !== null);
  const actualPath = actualPts
    .map((p, k) => `${k === 0 ? "M" : "L"} ${xAt(p.i).toFixed(1)} ${yAt(p.actualCum).toFixed(1)}`)
    .join(" ");

  // Area gap — cuma sepanjang rentang yang Actual-nya beneran ada (biar
  // gak nge-shade area di masa depan yang belum kejalanin)
  let gapPath = "";
  if (lastActualIdx >= 0) {
    const top = [];
    const bottom = [];
    for (let i = 0; i <= lastActualIdx; i++) {
      top.push(`${xAt(i).toFixed(1)},${yAt(points[i].planCum).toFixed(1)}`);
    }
    for (let i = lastActualIdx; i >= 0; i--) {
      bottom.push(`${xAt(i).toFixed(1)},${yAt(points[i].actualCum).toFixed(1)}`);
    }
    gapPath = `M ${top.join(" L ")} L ${bottom.join(" L ")} Z`;
  }

  // ── Marker "SEKARANG" — live doang, posisinya proporsional dari jam
  //    dinding WIB beneran (bukan sekadar nempel di titik data terakhir) ──
  let nowX = null;
  let nowLabel = null;
  if (!historical) {
    const now = getNowWIB();
    const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const slotStartHours = hourly.map((h) => {
      const m = /^(\d{1,2})-/.exec(String(h.slot));
      return m ? Number(m[1]) : null;
    });
    for (let i = 0; i < slotStartHours.length; i++) {
      const startH = slotStartHours[i];
      if (startH === null) continue;
      const nextH = i + 1 < slotStartHours.length ? slotStartHours[i + 1] : null;
      const startMin = startH * 60;
      const endMin = (nextH !== null && nextH > startH ? nextH : startH + 1) * 60;
      if (nowMinutes >= startMin && nowMinutes < endMin) {
        const frac = (nowMinutes - startMin) / (endMin - startMin);
        const xNext = xAt(Math.min(i + 1, points.length - 1));
        nowX = xAt(i) + (xNext - xAt(i)) * frac;
        const pad = (n) => String(n).padStart(2, "0");
        nowLabel = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`;
        break;
      }
    }
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        padding: "6px 16px 8px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          marginBottom: 3,
        }}
      >
        <span
          style={{
            fontSize: 8,
            color: C.textMut,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Trend Output Kumulatif vs Plan
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <LegendItem color={C.blue} dashed label="Plan Kumulatif" />
          <LegendItem color={C.green} label="Actual Kumulatif" />
          <LegendItem color={C.red} swatch label="Gap" />
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ flex: 1, minHeight: 0, width: "100%" }}
      >
        {/* Gridline + label sumbu Y */}
        {Array.from({ length: Y_TICKS + 1 }).map((_, i) => {
          const v = (niceMax / Y_TICKS) * i;
          const y = yAt(v);
          return (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke={C.border} strokeWidth={1} />
              <text x={padL - 6} y={y + 3} fontSize={8} fill={C.textDim} textAnchor="end">
                {fmt(Math.round(v))}
              </text>
            </g>
          );
        })}

        {/* Gridline + label sumbu X */}
        {points.map((p, i) => (
          <g key={p.slot}>
            <line
              x1={xAt(i)}
              x2={xAt(i)}
              y1={padT}
              y2={H - padB}
              stroke={C.border}
              strokeWidth={1}
              opacity={0.4}
            />
            <text x={xAt(i)} y={H - padB + 13} fontSize={8} fill={C.textDim} textAnchor="middle">
              {p.slot}
            </text>
          </g>
        ))}

        {/* Area gap Plan vs Actual */}
        {gapPath && <path d={gapPath} fill={C.red} opacity={0.15} />}

        {/* Garis Plan Kumulatif (proyeksi penuh) */}
        <path d={planPath} fill="none" stroke={C.blue} strokeWidth={2} strokeDasharray="6 4" />
        {points.map((p, i) => (
          <circle key={i} cx={xAt(i)} cy={yAt(p.planCum)} r={2.5} fill={C.blue} />
        ))}

        {/* Garis Actual Kumulatif — berhenti di jam terakhir yang ada
            datanya, TIDAK diproyeksikan ke jam yang belum kejalanin */}
        {actualPath && (
          <path d={actualPath} fill="none" stroke={C.green} strokeWidth={3} />
        )}
        {actualPts.map((p) => (
          <circle
            key={p.i}
            cx={xAt(p.i)}
            cy={yAt(p.actualCum)}
            r={p.i === lastActualIdx ? 6 : 3}
            fill={C.green}
            stroke={p.i === lastActualIdx ? "#fff" : "none"}
            strokeWidth={p.i === lastActualIdx ? 2 : 0}
          />
        ))}

        {/* Marker SEKARANG — live doang */}
        {nowX !== null && (
          <g>
            <line
              x1={nowX}
              x2={nowX}
              y1={padT}
              y2={H - padB}
              stroke={C.textDim}
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            <text x={nowX + 5} y={padT + 9} fontSize={8} fontWeight={700} fill={C.textDim}>
              SEKARANG
            </text>
            <text x={nowX + 5} y={padT + 20} fontSize={9} fill={C.textDim}>
              {nowLabel}
            </text>
          </g>
        )}

        {/* Annotasi titik terakhir — total actual + gap saat ini */}
        {lastPoint && (
          <g>
            <text
              x={xAt(lastActualIdx)}
              y={Math.max(12, yAt(lastPoint.actualCum) - 12)}
              fontSize={12}
              fontWeight={800}
              fill={C.green}
              textAnchor="middle"
            >
              {fmt(lastPoint.actualCum)} pcs
            </text>
            {gapAtLast !== null && gapAtLast < 0 && (
              <text
                x={xAt(lastActualIdx)}
                y={Math.max(24, yAt(lastPoint.planCum) - 6)}
                fontSize={9}
                fontWeight={700}
                fill={C.red}
                textAnchor="middle"
              >
                Gap: {fmt(gapAtLast)} pcs
              </text>
            )}
          </g>
        )}
      </svg>
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
      <thead>
        <tr>
          <TH style={{ width: 110, textAlign: "left", fontSize: 10, height: 30 }}>
            Keterangan
          </TH>
          {hourly.map((h) => (
            <TH key={h.slot} style={{ fontSize: 11, height: 30 }}>
              {h.slot}
            </TH>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr
            key={row.key}
            style={{
              // Tinggi baris FIXED (bukan proporsional ke sisa layar) —
              // ini yang bikin tabel gak bengkak lagi pas datanya penuh.
              // Sisa ruang di luar 4 baris ini lari ke HourlyTrendChart
              // di bawahnya, bukan numpuk di sini.
              height: 40,
              background: ri % 2 === 0 ? `${C.border}30` : "transparent",
            }}
          >
            <td
              style={{
                fontSize: 11,
                padding: "4px 8px",
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
              const text =
                v !== null && v !== undefined ? fmt(v) + (row.suffix || "") : "—";

              // Baris "Pencapaian" dikasih bar isian tipis di BELAKANG
              // angka — jadi pola naik/turun per jam kebaca sekilas dari
              // jarak jauh (di LUAR HourlyTrendChart yang lebih besar di
              // bawah tabel, ini cuma aksen kecil per-sel).
              if (row.key === "pencapaian") {
                const w = v !== null && v !== undefined ? Math.min(v, 100) : 0;
                return (
                  <TD
                    key={h.slot}
                    style={{
                      color: clr,
                      fontSize: 14,
                      fontWeight: 700,
                      padding: "4px 5px",
                      position: "relative",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: 0,
                        bottom: 0,
                        height: 3,
                        width: `${w}%`,
                        background: clr,
                        opacity: 0.55,
                        transition: "width 0.8s ease",
                      }}
                    />
                    {text}
                  </TD>
                );
              }

              return (
                <TD
                  key={h.slot}
                  style={{
                    color: clr,
                    fontSize: 14,
                    fontWeight: row.key === "output_actual" ? 700 : 500,
                    padding: "4px 5px",
                  }}
                >
                  {text}
                </TD>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Card availability ringkas (Bekidoritsu/OEE) ──────────
// Revisi v2: dulu dua card ini DITUMPUK full-width, masing-masing punya
// label row + bar 10px + padding 10px — total makan ~130px tinggi layar
// cuma buat nampilin DUA ANGKA PERSEN. Sekarang berdampingan (2 kolom)
// dan compact: label + angka satu baris, bar tipis 6px di bawahnya.
// Hemat ~80px yang dialihin ke tabel per jam di bawah.
function AvailabilityCard({ label, pct, color, live, borderRight }) {
  const clamped = Math.min(Math.max(pct ?? 0, 0), 100);
  return (
    <div
      style={{
        padding: "8px 14px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 5,
        borderLeft: `3px solid ${color}`,
        borderRight: borderRight ? `1px solid ${C.border}` : "none",
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
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
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
            fontSize: 26,
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
          height: 6,
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
  historical,
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
          size="secondary"
        />
        <MetricCard
          label="Cycle Time Actual"
          value={cycle_time_actual ?? "—"}
          color={ctOvertime ? C.red : C.green}
          badge="live"
          unit="sec"
          size="secondary"
        />
        <MetricCard
          label="Total Stoptime"
          value={fmt(stoptime_menit, 1)}
          color={C.orange}
          noBorderRight
          badge="live"
          unit="menit"
          size="secondary"
        />
      </div>

      {/* ── Bekidoritsu + OEE (2 card berdampingan) ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          borderBottom: `1px solid ${C.borderBr}`,
          flexShrink: 0,
          background: `linear-gradient(180deg, ${C.border}, ${C.panelAlt})`,
        }}
      >
        <AvailabilityCard
          label="Bekidoritsu"
          pct={availability.operator}
          color={C.blue}
          live={availability.operator !== null}
          borderRight
        />
        <AvailabilityCard
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

        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div style={{ flexShrink: 0, overflow: "auto" }}>
            <HourlyTable hourly={filteredHourly} />
          </div>
          <div
            style={{
              flexShrink: 0,
              height: 1,
              background: C.border,
            }}
          />
          <CumulativeTrendChart hourly={filteredHourly} historical={historical} />
        </div>
      </div>
    </div>
  );
}
