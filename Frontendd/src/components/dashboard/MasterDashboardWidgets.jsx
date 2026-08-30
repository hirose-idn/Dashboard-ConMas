import React from "react";
import { C } from "../../config/constants";

// ─────────────────────────────────────────────────────────────
//  MasterDashboard presentational widgets
//
//  Dipisah dari MasterDashboard.jsx (yang isinya stateful/fetch logic)
//  biar file utama gak makin bengkak — semua yang di sini murni
//  presentational (nerima props, gak ada state/fetch sendiri), jadi
//  aman dipindah tanpa ubah behavior apapun. Diekspor buat dipakai
//  balik di MasterDashboard.jsx.
// ─────────────────────────────────────────────────────────────

// ─── helpers ───────────────────────────────────────────────────
export const fmt = (n, dec = 0) =>
  n == null
    ? "—"
    : Number(n).toLocaleString("id-ID", { maximumFractionDigits: dec });


// ─── Mini trend chart (SVG, output actual per line) ────────────
export function TrendChart({ lines }) {
  const W = 100,
    H = 40;
  if (!lines || lines.length < 2) return null;
  const vals = lines.map((l) => l.output_actual);
  const max = Math.max(...vals, 1);
  const pts = vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * W;
      const y = H - (v / max) * H;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 40 }}>
      <polyline points={pts} fill="none" stroke={C.blue} strokeWidth="1.5" />
    </svg>
  );
}

// ─── Stoptime bar chart (5M) ────────────────────────────────────
export function StoptimeBar({ data }) {
  const labels = ["Machine", "Man", "Material", "Method", "Other"];
  const keys = [
    "stoptime_machine",
    "stoptime_man",
    "stoptime_material",
    "stoptime_method",
    "stoptime_other",
  ];
  const colors = [C.red, C.orange, C.yellow, C.purple, C.blue];
  const vals = keys.map((k) => data[k] || 0);
  const max = Math.max(...vals, 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {labels.map((lbl, i) => (
        <div
          key={lbl}
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <span
            style={{ width: 64, fontSize: 11, color: C.textDim, flexShrink: 0 }}
          >
            {lbl}
          </span>
          <div
            style={{
              flex: 1,
              height: 10,
              background: C.border,
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${max > 0 ? (vals[i] / max) * 100 : 0}%`,
                background: colors[i],
                borderRadius: 4,
                transition: "width .4s",
              }}
            />
          </div>
          <span
            style={{
              width: 40,
              fontSize: 11,
              color: C.text,
              textAlign: "right",
            }}
          >
            {fmt(vals[i])} m
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Source Status Bar (Internal/SGP/Systech dari /api/master/summary) ──
const SOURCE_STATUS_META = {
  ok: { label: "Terhubung", color: "green", icon: "✓" },
  inactive: { label: "Belum Dikonfigurasi", color: "textMut", icon: "○" },
  timeout: { label: "Timeout", color: "orange", icon: "⏱" },
  unreachable: { label: "Tidak Terhubung", color: "red", icon: "✕" },
  unauthorized: { label: "API Key Ditolak", color: "red", icon: "🔒" },
  error: { label: "Error", color: "red", icon: "✕" },
};

export function SourceStatusBar({ sources, loading }) {
  if (loading && sources.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        marginBottom: 16,
      }}
    >
      {sources.map((s) => {
        const meta = SOURCE_STATUS_META[s.status] || SOURCE_STATUS_META.error;
        const color = C[meta.color] || C.textDim;
        const hasData = s.status === "ok" && s.data;
        return (
          <div
            key={s.source}
            title={s.message || meta.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: C.panel,
              border: `1px solid ${color}55`,
              borderRadius: 8,
              padding: "8px 14px",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: color,
                flexShrink: 0,
                animation: s.status === "ok" ? "pulse-dot 2s infinite" : "none",
              }}
            />
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                {s.label || s.source}
              </p>
              <p style={{ fontSize: 10, color, fontWeight: 600 }}>
                {meta.icon} {meta.label}
                {hasData &&
                  ` · ${s.data.lines_running}/${s.data.lines_total} line running`}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Accordion row per tempat ──────────────────────────────────
// ─── Line Row (flat, dipake di Breakdown Line versi per-tempat) ──
export function LineRow({ l, onSelect, remoteSourceKey }) {
  const pct =
    l.output_plan > 0 ? Math.round((l.output_actual / l.output_plan) * 100) : 0;
  const pctColor = pct >= 90 ? C.green : pct >= 70 ? C.orange : C.red;
  const oeeColor = l.oee >= 85 ? C.green : l.oee >= 70 ? C.orange : C.red;
  const clickable = Boolean(onSelect);
  // Fallback buat data LAMA (push-sync dari instance yang belum ke-upgrade,
  // cuma punya line_not_running boolean, belom ada line_status) — daripada
  // salah kebaca "Running", collapse balik ke 2-state lama.
  const status = l.line_status || (l.line_not_running ? "not_running" : "running");

  return (
    <tr
      onClick={
        clickable ? () => onSelect(l.line_code, remoteSourceKey) : undefined
      }
      style={{
        cursor: clickable ? "pointer" : "default",
        borderTop: `1px solid ${C.border}`,
        transition: "background .15s",
      }}
      onMouseEnter={
        clickable ? (e) => (e.currentTarget.style.background = C.blueDim) : undefined
      }
      onMouseLeave={
        clickable ? (e) => (e.currentTarget.style.background = "transparent") : undefined
      }
    >
      <td style={{ ...td(), color: C.blue, fontWeight: 700 }}>{l.line_code}</td>
      <td style={td()}>
        <span
          style={{
            color:
              status === "waiting" ? C.orange : status === "not_running" ? C.red : C.green,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {status === "waiting"
            ? "… Menunggu Data"
            : status === "not_running"
              ? "✕ Tidak Running"
              : "✓ Running"}
        </span>
      </td>
      <td style={{ ...td(), color: C.text }}>{fmt(l.output_plan)}</td>
      <td style={{ ...td(), color: C.text }}>{fmt(l.output_actual)}</td>
      <td style={{ ...td(), color: pctColor, fontWeight: 700 }}>{pct}%</td>
      <td
        style={{
          ...td(),
          color: l.oee > 0 ? oeeColor : C.textDim,
          fontWeight: 600,
        }}
      >
        {l.oee > 0 ? l.oee + "%" : "—"}
      </td>
      <td style={{ ...td(), color: l.qty_reject > 0 ? C.orange : C.textDim }}>
        {fmt(l.qty_reject)}
      </td>
      <td style={{ ...td(), color: l.stoptime_total > 60 ? C.red : C.textDim }}>
        {fmt(l.stoptime_total)} m
      </td>
    </tr>
  );
}

export const td = () => ({
  padding: "10px 12px",
  color: C.textDim,
  fontSize: 13,
  verticalAlign: "middle",
});

export const thStyle = () => ({
  textAlign: "left",
  padding: "9px 12px",
  fontSize: 11,
  fontWeight: 600,
  color: C.textDim,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  whiteSpace: "nowrap",
});

// ─── Ranking mini-table generik — dipakai buat 3 tabel "Top" ────
// (Top Output Terendah, Top Reject Terbanyak, Top Stoptime Terbanyak)
export function RankingTable({ rows, columns, emptyMessage, emptyColor }) {
  if (rows.length === 0) {
    return (
      <p
        style={{
          color: emptyColor || C.textDim,
          fontSize: 12,
          textAlign: "center",
          paddingTop: 24,
        }}
      >
        {emptyMessage}
      </p>
    );
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              style={{ ...thStyle(), padding: "4px 8px", fontSize: 10 }}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((l) => (
          <tr
            key={l.line_code}
            style={{ borderTop: `1px solid ${C.border}40` }}
          >
            {columns.map((col) => (
              <td
                key={col.key}
                style={{
                  padding: "5px 8px",
                  fontSize: 11,
                  ...(col.cellStyle ? col.cellStyle(l) : { color: C.textDim }),
                }}
              >
                {col.render(l)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Top Output Terendah — Bekidoritsu (Actual/Plan × 100) terendah,
// BUKAN diranking dari qty, murni persentase pencapaian ────────────
export function TopLowAchievement({ allLines }) {
  const achievement = (l) =>
    l.output_plan > 0 ? (l.output_actual / l.output_plan) * 100 : null;

  const rows = [...allLines]
    .filter((l) => !l.line_not_running && l.has_data && l.output_plan > 0)
    .map((l) => ({ ...l, _ach: achievement(l) }))
    .sort((a, b) => a._ach - b._ach)
    .slice(0, 7);

  return (
    <RankingTable
      rows={rows}
      emptyMessage="Belum ada line dengan data pencapaian"
      columns={[
        {
          key: "line",
          label: "Line",
          render: (l) => l.line_code,
          cellStyle: () => ({ color: C.blue, fontWeight: 600 }),
        },
        {
          key: "ach",
          label: "Bekidoritsu",
          render: (l) => Math.round(l._ach) + "%",
          cellStyle: (l) => ({
            color: l._ach < 90 ? C.red : C.orange,
            fontWeight: 700,
          }),
        },
        {
          key: "output",
          label: "Output",
          render: (l) => `${fmt(l.output_actual)} / ${fmt(l.output_plan)}`,
          cellStyle: () => ({ color: C.textDim }),
        },
      ]}
    />
  );
}

// ─── Top Reject Tertinggi — qty_reject terbesar ─────────────────
export function TopReject({ allLines }) {
  const rows = [...allLines]
    .filter((l) => l.has_data && l.qty_reject > 0)
    .sort((a, b) => b.qty_reject - a.qty_reject)
    .slice(0, 7);

  return (
    <RankingTable
      rows={rows}
      emptyMessage="Belum ada reject tercatat ✓"
      emptyColor={C.green}
      columns={[
        {
          key: "line",
          label: "Line",
          render: (l) => l.line_code,
          cellStyle: () => ({ color: C.blue, fontWeight: 600 }),
        },
        {
          key: "reject",
          label: "Reject",
          render: (l) => `${fmt(l.qty_reject)} pcs`,
          cellStyle: () => ({ color: C.red, fontWeight: 700 }),
        },
        {
          key: "output",
          label: "Output",
          render: (l) => fmt(l.output_actual),
          cellStyle: () => ({ color: C.textDim }),
        },
      ]}
    />
  );
}

// ─── Top Stoptime Tertinggi — stoptime_total terbesar ───────────
// 4 kolom breakdown Machine/Material/Method/Man masing-masing pisah,
// bukan digabung di bawah 1 header "4M" lagi.
//
// PENTING soal warna: sebelumnya warnanya di-capture SEKALI di level modul
// (`color: C.red` dievaluasi pas file di-import, sebelum tema di-paksa ke
// "light" oleh MasterDashboard) — jadi walau tema udah pindah ke light,
// warnanya nyangkut ke warna DARK yang terlalu cerah/pucat dan nyaris gak
// kebaca di atas putih. Di bawah ini warna dibaca dari `C.xxx` LANGSUNG DI
// DALAM function `cellStyle`, yang baru jalan pas tabel di-render — jadi
// selalu ambil warna tema yang lagi aktif (dark cerah / light lebih gelap
// & kontras).
export function TopStoptime({ allLines }) {
  const rows = [...allLines]
    .filter((l) => l.has_data && l.stoptime_total > 0)
    .sort((a, b) => b.stoptime_total - a.stoptime_total)
    .slice(0, 7);

  return (
    <RankingTable
      rows={rows}
      emptyMessage="Belum ada stoptime tercatat ✓"
      emptyColor={C.green}
      columns={[
        {
          key: "line",
          label: "Line",
          render: (l) => l.line_code,
          cellStyle: () => ({ color: C.blue, fontWeight: 600 }),
        },
        {
          key: "stop",
          label: "Stoptime",
          render: (l) => `${fmt(l.stoptime_total)} m`,
          cellStyle: () => ({ color: C.red, fontWeight: 700 }),
        },
        {
          key: "machine",
          label: "Machine",
          render: (l) => `${fmt(l.stoptime_machine || 0)}m`,
          cellStyle: () => ({ color: C.red, fontWeight: 600 }),
        },
        {
          key: "material",
          label: "Material",
          render: (l) => `${fmt(l.stoptime_material || 0)}m`,
          cellStyle: () => ({ color: C.yellow, fontWeight: 600 }),
        },
        {
          key: "method",
          label: "Method",
          render: (l) => `${fmt(l.stoptime_method || 0)}m`,
          cellStyle: () => ({ color: C.purple, fontWeight: 600 }),
        },
        {
          key: "man",
          label: "Man",
          render: (l) => `${fmt(l.stoptime_man || 0)}m`,
          cellStyle: () => ({ color: C.orange, fontWeight: 600 }),
        },
      ]}
    />
  );
}

// ─── Daily Trend Line Chart (SVG, per hari dalam 1 bulan) ────────
export function DailyTrendChart({ days }) {
  const W = 520,
    H = 130,
    PAD = { top: 10, right: 10, bottom: 28, left: 42 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const hasAnyData = days.some((d) => d.hasData);
  if (!hasAnyData) {
    return (
      <div
        style={{
          height: H,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ color: C.textDim, fontSize: 12 }}>
          Belum ada data bulan ini
        </p>
      </div>
    );
  }

  // Plot SEMUA hari dalam bulan (bukan cuma yang ada datanya) — hari tanpa
  // data ikut digambar sebagai 0, biar garis membentang penuh 1 bulan
  // (sama seperti chart tren di Master Dashboard Utama), bukan berhenti
  // di hari terakhir yang ada datanya.
  const total = days.length;
  const allVals = days.flatMap((d) => [d.plan || 0, d.actual || 0]);
  const maxVal = Math.max(...allVals, 1);
  const xOf = (i) => PAD.left + (i / (total - 1)) * innerW;
  const yOf = (v) => PAD.top + innerH - (v / maxVal) * innerH;

  const planPts = days
    .map((d) => `${xOf(d.day - 1)},${yOf(d.plan || 0)}`)
    .join(" ");
  const actPts = days
    .map((d) => `${xOf(d.day - 1)},${yOf(d.actual || 0)}`)
    .join(" ");

  const firstX = xOf(0);
  const lastX = xOf(total - 1);
  const areaD = [
    `M ${firstX} ${yOf(0)}`,
    ...days.map((d) => `L ${xOf(d.day - 1)} ${yOf(d.actual || 0)}`),
    `L ${lastX} ${yOf(0)}`,
    "Z",
  ].join(" ");

  const yTicks = [0.25, 0.5, 0.75, 1].map((r) => ({
    val: Math.round(maxVal * r),
    y: yOf(maxVal * r),
  }));

  // X label buat SEMUA hari (1,2,3,...31) — sama seperti chart tren
  // Master Dashboard Utama, bukan cuma tiap 5 hari.
  const xLabels = days;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", overflow: "visible" }}
    >
      <defs>
        <linearGradient id="dayGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.blue} stopOpacity="0.22" />
          <stop offset="100%" stopColor={C.blue} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {yTicks.map(({ val, y }) => (
        <g key={val}>
          <line
            x1={PAD.left}
            y1={y}
            x2={W - PAD.right}
            y2={y}
            stroke={C.border}
            strokeWidth="1"
          />
          <text
            x={PAD.left - 4}
            y={y + 3}
            textAnchor="end"
            fontSize="8"
            fill={C.textDim}
          >
            {fmt(val)}
          </text>
        </g>
      ))}
      {xLabels.map((d) => (
        <text
          key={d.day}
          x={xOf(d.day - 1)}
          y={H - 4}
          textAnchor="middle"
          fontSize="7"
          fill={C.textDim}
        >
          {d.day}
        </text>
      ))}
      <line
        x1={PAD.left}
        y1={PAD.top + innerH}
        x2={W - PAD.right}
        y2={PAD.top + innerH}
        stroke={C.border}
        strokeWidth="0.5"
      />
      <path d={areaD} fill="url(#dayGrad)" />
      <polyline
        points={planPts}
        fill="none"
        stroke={C.border}
        strokeWidth="1.5"
        strokeDasharray="4 3"
        opacity="0.7"
      />
      <polyline
        points={actPts}
        fill="none"
        stroke={C.blue}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {days
        .filter((d) => d.hasData)
        .map((d) => (
          <circle
            key={d.day}
            cx={xOf(d.day - 1)}
            cy={yOf(d.actual)}
            r="2.5"
            fill={d.actual >= d.plan ? C.green : C.orange}
            stroke={C.bg}
            strokeWidth="1"
          />
        ))}
    </svg>
  );
}
