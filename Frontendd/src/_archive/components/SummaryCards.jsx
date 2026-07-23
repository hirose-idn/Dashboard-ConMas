import React from 'react';

const TARGET = 2400;

const fmt = (val, dec = 0) => {
  if (val === null || val === undefined) return '—';
  const n = Number(val);
  if (isNaN(n)) return '—';
  return dec > 0 ? parseFloat(n.toFixed(dec)).toLocaleString('id-ID') : n.toLocaleString('id-ID');
};

const ProgressBar = ({ value, max, color }) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={s.barTrack}>
      <div style={{ ...s.barFill, width: `${pct}%`, background: color }} />
    </div>
  );
};

const StoptimeRow = ({ label, value, color }) => (
  <div style={s.stRow}>
    <span style={s.stLabel}>{label}</span>
    <span style={{ ...s.stVal, color: value > 0 ? color : '#9ca3af' }}>
      {value > 0 ? `${fmt(value, 2)} min` : '—'}
    </span>
  </div>
);

const SummaryCards = ({ activeRow, activeShift, target, loading }) => {
  if (loading) return (
    <div style={s.skeleton} />
  );

  const output   = Number(activeRow?.output_total)    || 0;
  const reject   = Number(activeRow?.reject_qty)       || 0;
  const stopTotal = Number(activeRow?.stoptime_total)  || 0;
  const beki     = target > 0 ? (output / target * 100) : null;
  const bekiColor = beki === null ? '#9ca3af' : beki >= 95 ? '#059669' : beki >= 80 ? '#d97706' : '#dc2626';

  const isS1 = activeShift === 'Shift 1';
  const badgeStyle = isS1 ? s.badge1 : s.badge2;

  return (
    <div style={s.wrapper}>

      {/* ── Top row: 4 big metrics ── */}
      <div style={s.topRow}>

        {/* Output */}
        <div style={s.metricBlock}>
          <div style={s.metricHeader}>
            <span style={{ ...s.badge, ...badgeStyle }}>{activeShift}</span>
            <span style={s.metricTitle}>Output</span>
          </div>
          {activeRow?.cl_no && (
            <div style={s.clInfo}>{activeRow.cl_no} · {activeRow.product_name}</div>
          )}
          <div style={s.bigVal}>{fmt(output)}</div>
          <div style={s.unit}>pcs</div>
          <ProgressBar value={output} max={target} color={bekiColor} />
          <div style={s.progressLabel}>
            <span style={{ color: bekiColor, fontWeight: 500 }}>
              {beki !== null ? `${beki.toFixed(1)}%` : '—'}
            </span>
            <span style={{ color: '#9ca3af' }}>target {target.toLocaleString('id-ID')} pcs</span>
          </div>
        </div>

        <div style={s.vDivider} />

        {/* Reject */}
        <div style={s.metricBlock}>
          <div style={s.metricTitle}>Reject</div>
          <div style={{ ...s.bigVal, color: reject > 0 ? '#dc2626' : '#111827' }}>
            {fmt(reject)}
          </div>
          <div style={s.unit}>pcs</div>
          {reject > 0 && output > 0 && (
            <div style={{ ...s.subNote, color: '#dc2626' }}>
              {(reject / output * 100).toFixed(2)}% dari output
            </div>
          )}
        </div>

        <div style={s.vDivider} />

        {/* Stoptime Total */}
        <div style={s.metricBlock}>
          <div style={s.metricTitle}>Stoptime Total</div>
          <div style={{ ...s.bigVal, color: stopTotal > 0 ? '#d97706' : '#111827' }}>
            {stopTotal > 0 ? fmt(stopTotal, 2) : '0'}
          </div>
          <div style={s.unit}>min</div>
        </div>

        <div style={s.vDivider} />

        {/* Bekidoritsu */}
        <div style={s.metricBlock}>
          <div style={s.metricTitle}>Bekidoritsu</div>
          <div style={{ ...s.bigVal, color: bekiColor }}>
            {beki !== null ? `${beki.toFixed(1)}%` : '—'}
          </div>
          <div style={s.unit}>
            {beki === null ? 'isi target dulu' : beki >= 95 ? '✅ on track' : beki >= 80 ? '⚠️ perlu perhatian' : '🔴 di bawah target'}
          </div>
        </div>

      </div>

      {/* ── Bottom row: Stoptime breakdown ── */}
      <div style={s.bottomRow}>
        <div style={s.stTitle}>Stoptime Breakdown</div>
        <div style={s.stGrid}>
          <StoptimeRow label="Man"      value={Number(activeRow?.stoptime_man)      || 0} color="#378ADD" />
          <StoptimeRow label="Machine"  value={Number(activeRow?.stoptime_machine)  || 0} color="#D85A30" />
          <StoptimeRow label="Material" value={Number(activeRow?.stoptime_material) || 0} color="#1D9E75" />
          <StoptimeRow label="Method"   value={Number(activeRow?.stoptime_method)   || 0} color="#7F77DD" />
          <StoptimeRow label="Other"    value={Number(activeRow?.stoptime_other)    || 0} color="#888780" />
        </div>
      </div>

    </div>
  );
};

const s = {
  wrapper: {
    background: '#fff',
    border: '0.5px solid #e5e7eb',
    borderRadius: 14,
    padding: '20px 24px',
    marginBottom: 16,
  },
  skeleton: {
    background: '#f3f4f6',
    borderRadius: 14,
    height: 180,
    marginBottom: 16,
  },
  topRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 0,
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  metricBlock: {
    flex: 1,
    minWidth: 160,
    padding: '0 20px',
  },
  metricHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
  metricTitle: { fontSize: 13, color: '#6b7280', fontWeight: 500, marginBottom: 4 },
  clInfo: { fontSize: 12, color: '#6b7280', marginBottom: 6, fontWeight: 500 },
  bigVal: { fontSize: 48, fontWeight: 600, color: '#111827', lineHeight: 1.1, letterSpacing: '-1px' },
  unit: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  subNote: { fontSize: 12, marginTop: 4 },
  badge: { fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 5 },
  badge1: { background: '#E6F1FB', color: '#0C447C' },
  badge2: { background: '#E1F5EE', color: '#085041' },
  barTrack: { height: 6, background: '#f3f4f6', borderRadius: 3, marginTop: 10, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3, transition: 'width 0.5s ease' },
  progressLabel: { display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4 },
  vDivider: { width: '0.5px', background: '#e5e7eb', alignSelf: 'stretch', flexShrink: 0 },
  bottomRow: {
    borderTop: '0.5px solid #f3f4f6',
    paddingTop: 16,
  },
  stTitle: { fontSize: 11, fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 },
  stGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '6px 16px',
  },
  stRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '4px 0', borderBottom: '0.5px solid #f9fafb' },
  stLabel: { color: '#6b7280' },
  stVal: { fontWeight: 500 },
};

export default SummaryCards;