/**
 * ProductionDashboard.jsx
 *
 * Self-contained — fetch langsung ke Express backend lo.
 * Endpoint yang dipakai:
 *   GET /api/dashboard         → data harian semua shift
 *   GET /api/dashboard/trend   → tren per-periode hari ini
 *
 * Ganti BASE_URL sesuai host backend lo.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

// ── Config ─────────────────────────────────────────────────
const BASE_URL    = 'http://localhost:5000'; // ganti kalau port beda
const REFRESH_MS  = 30_000;                 // auto-refresh tiap 30 detik
const TARGET      = 2400;

// ── Cell Leaders (isi manual) ──────────────────────────────
const CELL_LEADERS = [
  { id: 1, nama: 'Ahmad Fauzi',     shift: 'Shift 1', foto: null },
  { id: 2, nama: 'Budi Santoso',    shift: 'Shift 1', foto: null },
  { id: 3, nama: 'Cahya Dewi',      shift: 'Shift 1', foto: null },
  { id: 4, nama: 'Dian Pratiwi',    shift: 'Shift 2', foto: null },
  { id: 5, nama: 'Eko Wahyudi',     shift: 'Shift 2', foto: null },
  { id: 6, nama: 'Fitri Handayani', shift: 'Shift 2', foto: null },
];

// ── Data fetching hook ─────────────────────────────────────
function useDashboardData() {
  const [data,        setData]        = useState([]);
  const [trend,       setTrend]       = useState({ shift1: [], shift2: [] });
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      // Fetch data harian + tren secara paralel
      const [dataRes, trendRes] = await Promise.all([
        fetch(`${BASE_URL}/api/dashboard`),
        fetch(`${BASE_URL}/api/dashboard/trend`),
      ]);

      if (!dataRes.ok)  throw new Error(`Data HTTP ${dataRes.status}`);
      if (!trendRes.ok) throw new Error(`Trend HTTP ${trendRes.status}`);

      const dataJson  = await dataRes.json();
      const trendJson = await trendRes.json();

      // Backend kirim { success, data: [...] }
      setData(dataJson.data    || []);
      setTrend({
        shift1: trendJson.shift1 || [],
        shift2: trendJson.shift2 || [],
      });
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error('Fetch error:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return { data, trend, loading, error, lastUpdated };
}

// ── Helpers ────────────────────────────────────────────────
const fmt = (val, dec = 0) => {
  const n = Number(val);
  if (isNaN(n) || val === null || val === undefined) return '—';
  return dec > 0
    ? parseFloat(n.toFixed(dec)).toLocaleString('id-ID')
    : n.toLocaleString('id-ID');
};

// Backend simpan timestamp dengan timezone — konversi ke date string WIB
const toWIBDateStr = (ts) => {
  const d   = new Date(ts);
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return `${wib.getUTCFullYear()}-${String(wib.getUTCMonth()+1).padStart(2,'0')}-${String(wib.getUTCDate()).padStart(2,'0')}`;
};

const getTodayStr = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
};

const getActiveShift = () => {
  const h = new Date().getHours();
  return (h >= 7 && h < 22) ? 'Shift 1' : 'Shift 2';
};

const HARI  = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
const BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

const fmtDateLabel = (str) => {
  if (!str) return '';
  const d = new Date(str + 'T00:00:00');
  return `${HARI[d.getDay()]} ${d.getDate()} ${BULAN[d.getMonth()]}`;
};

// ── Clock ──────────────────────────────────────────────────
const Clock = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const h = String(now.getHours()).padStart(2,'0');
  const m = String(now.getMinutes()).padStart(2,'0');
  const s = String(now.getSeconds()).padStart(2,'0');
  return (
    <div style={{ textAlign: 'right', lineHeight: 1.2 }}>
      <div style={{ fontSize: 9, color: '#4a5568' }}>
        {HARI[now.getDay()]}, {now.getDate()} {BULAN[now.getMonth()]} {now.getFullYear()}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#e8eaf0', letterSpacing: 1, fontVariantNumeric: 'tabular-nums' }}>
        {h}:{m}<span style={{ fontSize: 13, color: '#4a5568' }}>.{s}</span>
      </div>
    </div>
  );
};

// ── Progress Bar ───────────────────────────────────────────
const Bar = ({ value, max, color }) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ height: 3, background: '#1a2030', borderRadius: 2, overflow: 'hidden', marginTop: 4 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.8s' }} />
    </div>
  );
};

// ── Stoptime row ───────────────────────────────────────────
const StRow = ({ label, value, color }) => {
  const v = Number(value) || 0;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1px 0', borderBottom: '1px solid #0d1525' }}>
      <span style={{ fontSize: 8, color: '#6b7a95' }}>{label}</span>
      <span style={{ fontSize: 8, color: v > 0 ? color : '#2a3550', fontWeight: 600 }}>
        {v > 0 ? `${fmt(v, 1)}m` : '—'}
      </span>
    </div>
  );
};

// ── Cell Leader Card ───────────────────────────────────────
const CellLeaderCard = ({ leader }) => {
  const isS1     = leader.shift === 'Shift 1';
  const clr      = isS1 ? '#7ac4ff' : '#1fc97a';
  const bg       = isS1 ? '#112240' : '#0d2818';
  const bdr      = isS1 ? '#1e3a5f' : '#1a4a2a';
  const initials = leader.nama.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  return (
    <div style={{
      background: '#0d1525', border: `1px solid ${bdr}`, borderRadius: 8,
      padding: '8px 6px', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 4,
      minWidth: 0, height: '100%', boxSizing: 'border-box',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        background: '#1a2030', border: `2px solid ${bdr}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', flexShrink: 0,
      }}>
        {leader.foto
          ? <img src={leader.foto} alt={leader.nama} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ fontSize: 15, fontWeight: 700, color: clr }}>{initials}</div>
        }
      </div>
      <div style={{ fontSize: 9, fontWeight: 600, color: '#e8eaf0', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', padding: '0 4px' }}>
        {leader.nama}
      </div>
      <div style={{ fontSize: 8, fontWeight: 600, padding: '1px 7px', borderRadius: 3, background: bg, color: clr, border: `1px solid ${bdr}`, whiteSpace: 'nowrap' }}>
        {leader.shift}
      </div>
    </div>
  );
};

// ── KPI Card ───────────────────────────────────────────────
const KCard = ({ label, children }) => (
  <div style={{
    background: '#0d1525', border: '1px solid #1e2a3a', borderRadius: 5,
    padding: '5px 6px', minWidth: 0, height: '100%',
    boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
  }}>
    <div style={{ fontSize: 7.5, color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3, whiteSpace: 'nowrap', flexShrink: 0 }}>
      {label}
    </div>
    <div style={{ flex: 1, minHeight: 0 }}>
      {children}
    </div>
  </div>
);

// ── Shift Panel ────────────────────────────────────────────
const ShiftPanel = ({ shiftLabel, row, trendData, isActive }) => {
  const output    = Number(row?.output_total)  || 0;
  const reject    = Number(row?.reject_qty)     || 0;
  const stopTotal = Number(row?.stoptime_total) || 0;
  const selisih   = output - TARGET;
  const beki      = TARGET > 0 ? (output / TARGET * 100) : 0;
  const bColor    = beki >= 95 ? '#1fc97a' : beki >= 80 ? '#f5a623' : '#f55a5a';
  const rejectPct = output > 0 ? (reject / output * 100).toFixed(1) : '0.0';

  const lastActual    = [...(trendData || [])].reverse().find(p => p.actual !== null);
  const currentTarget = lastActual ? lastActual.target : null;

  const chartData = (trendData || []).map(p => ({
    label:  p.label,
    target: p.target,
    actual: p.actual !== null ? p.actual : undefined,
  }));

  const isS1 = shiftLabel === 'Shift 1';
  const pill = isS1
    ? { bg: '#112240', color: '#7ac4ff', border: '#1e3a5f' }
    : { bg: '#0d2818', color: '#1fc97a', border: '#1a4a2a' };

  const BIG = { fontSize: 'clamp(14px,1.6vw,22px)', fontWeight: 700, lineHeight: 1, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' };
  const MED = { fontSize: 'clamp(13px,1.4vw,20px)', fontWeight: 700, lineHeight: 1, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' };

  return (
    // height:100% — ambil penuh tinggi grid column parent
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, height: '100%' }}>

      {/* Shift label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 3, background: pill.bg, color: pill.color, border: `1px solid ${pill.border}`, whiteSpace: 'nowrap' }}>
          {shiftLabel}
        </div>
        {isActive && (
          <span style={{ fontSize: 9, color: '#4a5568', display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#1fc97a', display: 'inline-block' }} />aktif
          </span>
        )}
        {row?.cl_no && (
          <span style={{ marginLeft: 'auto', fontSize: 9, color: '#4a5568', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
            <span style={{ color: '#7ac4ff' }}>{row.cl_no}</span>
            <span style={{ color: '#2a3550', margin: '0 3px' }}>·</span>
            <span>{row.product_name}</span>
          </span>
        )}
      </div>

      {/* KPI cards — 5 kolom, tinggi fixed 90px */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr)) minmax(0,1.4fr)', gap: 4, height: 90, flexShrink: 0 }}>

        {/* Output */}
        <KCard label="Output Actual">
          <div style={{ ...BIG, color: bColor }}>{row ? fmt(output) : '—'}</div>
          <div style={{ fontSize: 8, color: '#4a5568', marginTop: 1 }}>pcs</div>
          <Bar value={output} max={TARGET} color={bColor} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#4a5568', marginTop: 3 }}>
            <span>T:{TARGET.toLocaleString('id-ID')}</span>
            <span style={{ color: bColor }}>{row ? `${fmt(beki, 1)}%` : '—'}</span>
          </div>
        </KCard>

        {/* Selisih */}
        <KCard label="Selisih">
          <div style={{ ...BIG, color: row ? (selisih >= 0 ? '#1fc97a' : '#f55a5a') : '#2a3550' }}>
            {row ? (selisih >= 0 ? '+' : '') + fmt(selisih) : '—'}
          </div>
          <div style={{ fontSize: 8, color: '#4a5568', marginTop: 1 }}>pcs</div>
          {currentTarget !== null && (
            <div style={{ fontSize: 8, color: '#4a5568', marginTop: 2 }}>
              Skrg: <span style={{ color: '#f5a623' }}>{fmt(currentTarget)}</span>
            </div>
          )}
          <div style={{ fontSize: 8, marginTop: 2, color: row ? (selisih < 0 ? '#f55a5a' : '#1fc97a') : '#2a3550' }}>
            {row
              ? selisih < 0
                ? `${Math.abs(selisih).toLocaleString('id-ID')} kurang`
                : '✓ on track'
              : 'belum ada data'}
          </div>
        </KCard>

        {/* Reject */}
        <KCard label="Reject">
          <div style={{ ...BIG, color: row ? (reject > 0 ? '#f55a5a' : '#e8eaf0') : '#2a3550' }}>
            {row ? fmt(reject) : '—'}
          </div>
          <div style={{ fontSize: 8, color: '#4a5568', marginTop: 1 }}>pcs</div>
          <div style={{ fontSize: 8, marginTop: 5, color: row ? (reject > 0 ? '#f55a5a' : '#2a3550') : '#2a3550' }}>
            {row ? `${rejectPct}% output` : '—'}
          </div>
        </KCard>

        {/* Bekidoritsu */}
        <KCard label="Bekidoritsu">
          <div style={{ ...BIG, color: row ? bColor : '#2a3550' }}>
            {row ? `${fmt(beki, 1)}%` : '—'}
          </div>
          <div style={{ fontSize: 8, color: '#4a5568', marginTop: 1 }}>
            {row
              ? beki >= 95 ? '✓ on track'
                : beki >= 80 ? '⚠ perhatian'
                : '✗ di bawah'
              : 'belum ada data'}
          </div>
          {row && <Bar value={beki} max={100} color={bColor} />}
        </KCard>

        {/* Stoptime — 1.4fr, layout vertikal rapi */}
        <KCard label="Stoptime">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 3 }}>
            <span style={{ ...MED, color: stopTotal > 0 ? '#f5a623' : '#2a3550' }}>
              {row ? fmt(stopTotal, 1) : '—'}
            </span>
            <span style={{ fontSize: 8, color: '#4a5568' }}>min</span>
          </div>
          <StRow label="Man"      value={row?.stoptime_man}      color="#7ac4ff" />
          <StRow label="Machine"  value={row?.stoptime_machine}  color="#f55a5a" />
          <StRow label="Material" value={row?.stoptime_material} color="#1fc97a" />
          <StRow label="Other"    value={row?.stoptime_other}    color="#f5a623" />
        </KCard>
      </div>

      {/* Chart — flex:1, ambil semua sisa tinggi */}
      <div style={{
        background: '#0d1525', border: '1px solid #1e2a3a', borderRadius: 5,
        padding: '5px 8px 4px',
        flex: '1 1 0', minHeight: 0,
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4a5568', marginBottom: 2, flexShrink: 0 }}>
          Tren — <span style={{ color: '#1fc97a' }}>actual</span> vs <span style={{ color: '#f5a623' }}>target</span>
        </div>
        <div style={{ flex: '1 1 0', minHeight: 0 }}>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 2, right: 10, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#131c2e" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 7, fill: '#4a5568' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 7, fill: '#4a5568' }} axisLine={false} tickLine={false} domain={[0, TARGET]} />
                <Tooltip
                  contentStyle={{ background: '#0d1525', border: '1px solid #1e2a3a', borderRadius: 6, fontSize: 10 }}
                  labelStyle={{ color: '#a0aec0' }}
                  itemStyle={{ color: '#e8eaf0' }}
                  formatter={(v, n) => [`${Number(v).toLocaleString('id-ID')} pcs`, n]}
                />
                <ReferenceLine y={TARGET} stroke="#f5a623" strokeDasharray="4 3" strokeWidth={1}
                  label={{ value: '2.400', fill: '#f5a623', fontSize: 7, position: 'insideTopRight' }}
                />
                <Line type="monotone" dataKey="target" stroke="#f5a623" strokeWidth={1.5} strokeDasharray="5 4" dot={false} name="Target" />
                <Line type="monotone" dataKey="actual" stroke="#1fc97a" strokeWidth={2} dot={{ r: 2.5, fill: '#1fc97a' }} name="Actual" connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2a3550', fontSize: 10 }}>
              Belum ada data tren
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

// ── Main Component ─────────────────────────────────────────
export default function ProductionDashboard() {
  const { data, trend, loading, error, lastUpdated } = useDashboardData();

  const activeShift = getActiveShift();
  const todayStr    = getTodayStr();
  const [previewDate, setPreviewDate] = useState(null);

  // Tanggal unik dari data, descending
  const availableDates = useMemo(() => {
    const dates = [...new Set(data.map(r => toWIBDateStr(r.tanggal)))].sort().reverse();
    return dates;
  }, [data]);

  const displayDate = previewDate || todayStr;
  const isLive      = !previewDate;

  // Shift 2 bisa lintas tengah malam — kalau jam < 07:00 pakai tanggal kemarin
  const shift2DateForLive = useMemo(() => {
    const now = new Date();
    if (now.getHours() < 7) {
      const y = new Date(now - 86400000);
      return `${y.getFullYear()}-${String(y.getMonth()+1).padStart(2,'0')}-${String(y.getDate()).padStart(2,'0')}`;
    }
    return todayStr;
  }, [todayStr]);

  const s1Date = displayDate;
  const s2Date = isLive ? shift2DateForLive : displayDate;

  // Cari row yang cocok dengan tanggal + shift
  const s1Row = data.find(r => r.shift === 'Shift 1' && toWIBDateStr(r.tanggal) === s1Date) || null;
  const s2Row = data.find(r => r.shift === 'Shift 2' && toWIBDateStr(r.tanggal) === s2Date) || null;

  const trendS1 = trend.shift1 || [];
  const trendS2 = trend.shift2 || [];

  const s1Leaders = CELL_LEADERS.filter(l => l.shift === 'Shift 1');
  const s2Leaders = CELL_LEADERS.filter(l => l.shift === 'Shift 2');

  return (
    <div style={{
      background: '#0a0e1a', color: '#e8eaf0',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      height: '100dvh', boxSizing: 'border-box',
      padding: '7px 12px', overflow: 'hidden',
      userSelect: 'none', display: 'flex', flexDirection: 'column',
    }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#7ac4ff', letterSpacing: 1 }}>PCB Dashboard</div>

          {/* Status indicator */}
          {loading && !lastUpdated && (
            <span style={{ fontSize: 9, color: '#f5a623' }}>memuat...</span>
          )}
          {error && (
            <span style={{ fontSize: 9, color: '#f55a5a' }} title={error}>⚠ koneksi gagal</span>
          )}
          {lastUpdated && !error && (
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1fc97a', display: 'inline-block' }} />
          )}

          {/* Date navigator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={() => setPreviewDate(null)}
              style={{
                fontSize: 9, padding: '2px 8px', borderRadius: 3, border: 'none', cursor: 'pointer',
                background: isLive ? '#1fc97a' : '#1a2030',
                color: isLive ? '#0a0e1a' : '#4a5568',
                fontWeight: isLive ? 700 : 400,
              }}
            >● LIVE</button>

            <button
              onClick={() => {
                const idx  = availableDates.indexOf(previewDate || todayStr);
                const next = availableDates[idx + 1];
                if (next) setPreviewDate(next);
              }}
              disabled={availableDates.indexOf(previewDate || todayStr) >= availableDates.length - 1}
              style={{ fontSize: 11, padding: '1px 5px', borderRadius: 3, border: '1px solid #1e2a3a', background: '#0d1525', color: '#7ac4ff', cursor: 'pointer', lineHeight: 1 }}
            >‹</button>

            <div style={{ fontSize: 10, color: isLive ? '#1fc97a' : '#f5a623', fontWeight: 600, minWidth: 64, textAlign: 'center', whiteSpace: 'nowrap' }}>
              {isLive ? 'Hari ini' : fmtDateLabel(previewDate)}
            </div>

            <button
              onClick={() => {
                const idx  = availableDates.indexOf(previewDate || todayStr);
                const prev = availableDates[idx - 1];
                if (prev) setPreviewDate(prev === todayStr ? null : prev);
              }}
              disabled={!previewDate || availableDates.indexOf(previewDate) <= 0}
              style={{ fontSize: 11, padding: '1px 5px', borderRadius: 3, border: '1px solid #1e2a3a', background: '#0d1525', color: '#7ac4ff', cursor: 'pointer', lineHeight: 1 }}
            >›</button>
          </div>

          {lastUpdated && (
            <div style={{ fontSize: 8, color: '#2a3550' }}>
              refresh: {lastUpdated.toLocaleTimeString('id-ID')}
            </div>
          )}
        </div>
        <Clock />
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: '#1e2a3a', marginBottom: 5, flexShrink: 0 }} />

      {/* ── 2 Shift ──
          gridTemplateRows:'1fr' → grid row punya defined height yang diturunkan ke children
          Tiap kolom display:flex+flexDirection:column → ShiftPanel dapat height:100% */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1px 1fr',
        gridTemplateRows: '1fr',
        flex: '1 1 0',
        minHeight: 0,
        overflow: 'hidden',
      }}>
        <div style={{ paddingRight: 8, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <ShiftPanel
            shiftLabel="Shift 1"
            row={s1Row}
            trendData={isLive ? trendS1 : []}
            isActive={isLive && activeShift === 'Shift 1'}
          />
        </div>

        <div style={{ background: '#1e2a3a' }} />

        <div style={{ paddingLeft: 8, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <ShiftPanel
            shiftLabel="Shift 2"
            row={s2Row}
            trendData={isLive ? trendS2 : []}
            isActive={isLive && activeShift === 'Shift 2'}
          />
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: '#1e2a3a', margin: '5px 0', flexShrink: 0 }} />

      {/* ── Cell Leader ── */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#4a5568', marginBottom: 4 }}>
          Cell Leader
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr' }}>
          <div style={{ paddingRight: 8, minWidth: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${s1Leaders.length},minmax(0,1fr))`, gap: 5, height: 96 }}>
              {s1Leaders.map(l => <CellLeaderCard key={l.id} leader={l} />)}
            </div>
          </div>
          <div style={{ background: '#1e2a3a' }} />
          <div style={{ paddingLeft: 8, minWidth: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${s2Leaders.length},minmax(0,1fr))`, gap: 5, height: 96 }}>
              {s2Leaders.map(l => <CellLeaderCard key={l.id} leader={l} />)}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}