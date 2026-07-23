import React, { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
  LineChart, Line, Legend,
} from 'recharts';

const COLORS = {
  man:      '#378ADD',
  machine:  '#D85A30',
  material: '#1D9E75',
  method:   '#7F77DD',
  other:    '#888780',
};

const CATS = [
  { key: 'stoptime_man',      label: 'Man',      color: COLORS.man },
  { key: 'stoptime_machine',  label: 'Machine',  color: COLORS.machine },
  { key: 'stoptime_material', label: 'Material', color: COLORS.material },
  { key: 'stoptime_method',   label: 'Method',   color: COLORS.method },
  { key: 'stoptime_other',    label: 'Other',    color: COLORS.other },
];

const fmt = (v, d = 2) => parseFloat(Number(v).toFixed(d));

const toWIBDateStr = (ts) => {
  const d = new Date(ts);
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return wib.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', timeZone: 'UTC' });
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', fontSize: 12 }}>
      <div style={{ fontWeight: 500, marginBottom: 6, color: '#111827' }}>{label}</div>
      {payload.map(p => p.value !== null && p.value !== undefined && (
        <div key={p.name} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <strong>{p.value} min</strong>
        </div>
      ))}
    </div>
  );
};

// ── Bar chart untuk 1 hari ─────────────────────────────────
const BarSection = ({ data, title }) => {
  const barData = CATS.map(c => ({
    name: c.label,
    value: fmt(data?.[c.key] || 0),
    color: c.color,
  })).filter(d => d.value > 0);

  if (!barData.length) return (
    <div style={s.empty}>Tidak ada data stoptime untuk periode ini</div>
  );

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={barData} margin={{ top: 16, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} unit=" min" />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f9fafb' }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={72} name="Stoptime">
          {barData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: '#6b7280', fontWeight: 500 }} formatter={v => `${v} min`} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

// ── Line chart untuk range > 1 hari ───────────────────────
const LineSection = ({ data }) => {
  const [active, setActive] = useState({ man: true, machine: true, material: true, method: false, other: false });
  const toggle = key => setActive(p => ({ ...p, [key]: !p[key] }));

  // Group by tanggal per shift
  const byDate = {};
  data.forEach(row => {
    const dateStr = toWIBDateStr(row.tanggal);
    if (!byDate[dateStr]) byDate[dateStr] = {};
    const shiftKey = row.shift === 'Shift 1' ? 's1' : 's2';
    byDate[dateStr][shiftKey] = row;
  });

  const chartData = Object.entries(byDate).map(([date, shifts]) => {
    const entry = { date };
    CATS.forEach(c => {
      entry[`s1_${c.key}`] = shifts.s1 ? fmt(shifts.s1[c.key] || 0) : null;
      entry[`s2_${c.key}`] = shifts.s2 ? fmt(shifts.s2[c.key] || 0) : null;
    });
    return entry;
  });

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {CATS.map(c => (
          <button key={c.key} onClick={() => toggle(c.key)} style={{
            fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 99,
            border: `1.5px solid ${c.color}`, cursor: 'pointer', background: 'transparent',
            color: active[c.key] ? c.color : '#9ca3af',
            opacity: active[c.key] ? 1 : 0.4,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{ width: 10, height: 2, background: c.color, borderRadius: 2, display: 'inline-block' }} />
            {c.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center', fontSize: 11, color: '#9ca3af' }}>
          <span>── Shift 1</span>
          <span style={{ borderTop: '2px dashed #9ca3af', width: 20, display: 'inline-block', verticalAlign: 'middle' }} /> Shift 2
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} unit=" min" width={52} />
          <Tooltip content={<CustomTooltip />} />
          {CATS.map(c => active[c.key] && [
            <Line key={`s1_${c.key}`} type="monotone" dataKey={`s1_${c.key}`} stroke={c.color} strokeWidth={2} dot={{ r: 3 }} name={`${c.label} S1`} connectNulls={false} />,
            <Line key={`s2_${c.key}`} type="monotone" dataKey={`s2_${c.key}`} stroke={c.color} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} name={`${c.label} S2`} connectNulls={false} />,
          ])}
        </LineChart>
      </ResponsiveContainer>
    </>
  );
};

// ── Main Export ────────────────────────────────────────────
const DashboardChart = ({ data, year, month, target, loading }) => {
  if (loading) return <div style={{ background: '#f9fafb', borderRadius: 14, height: 320, marginBottom: 16 }} />;

  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  // Kalau bulan ini, cek apakah hari ini aja atau ada banyak hari
  const uniqueDays = [...new Set(data.map(r => toWIBDateStr(r.tanggal)))];
  const isSingleDay = uniqueDays.length <= 1;

  // Output trend (bar, per shift per hari)
  const outputByDay = {};
  data.forEach(row => {
    const d = toWIBDateStr(row.tanggal);
    if (!outputByDay[d]) outputByDay[d] = { date: d, s1: 0, s2: 0 };
    if (row.shift === 'Shift 1') outputByDay[d].s1 = Number(row.output_total) || 0;
    if (row.shift === 'Shift 2') outputByDay[d].s2 = Number(row.output_total) || 0;
  });
  const outputData = Object.values(outputByDay);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Output trend ── */}
      <div style={s.card}>
        <div style={s.cardTitle}>Output per hari <span style={s.cardSub}>vs target {target.toLocaleString('id-ID')} pcs</span></div>
        {outputData.length === 0 ? (
          <div style={s.empty}>Tidak ada data untuk periode ini</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={outputData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              {/* Target line */}
              <CartesianGrid horizontal={false} vertical={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f9fafb' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="s1" fill="#378ADD" name="Shift 1" radius={[4,4,0,0]} maxBarSize={40} />
              <Bar dataKey="s2" fill="#1D9E75" name="Shift 2" radius={[4,4,0,0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Stoptime chart ── */}
      <div style={s.card}>
        <div style={s.cardTitle}>
          Stoptime breakdown
          <span style={s.cardSub}>{isSingleDay ? 'bar chart (1 hari)' : 'trend per hari'}</span>
        </div>
        {isSingleDay ? (
          <BarSection data={data[0]} />
        ) : (
          <LineSection data={data} />
        )}
      </div>

    </div>
  );
};

const s = {
  card: { background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 14, padding: '18px 20px', marginBottom: 0 },
  cardTitle: { fontSize: 14, fontWeight: 500, color: '#111827', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 },
  cardSub: { fontSize: 12, color: '#9ca3af', fontWeight: 400 },
  empty: { height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 },
};

export default DashboardChart;