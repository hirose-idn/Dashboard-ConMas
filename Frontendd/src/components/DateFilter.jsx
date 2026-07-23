import React from 'react';

// ============================================================
// Helper: hitung default tanggal berdasarkan jam sekarang
// Shift 1 → hari ini
// Shift 2 → kemarin (jam 00-21) atau hari ini (jam 22-23)
// ============================================================
export function getDefaultDates() {
  const now = new Date();
  const hour = now.getHours();

  const toLocalDateStr = (d) => {
    // format YYYY-MM-DD pakai timezone lokal
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const today = toLocalDateStr(now);
  const yesterday = toLocalDateStr(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  return {
    shift1: today,
    // Shift 2: jam 22.00-23.59 → hari ini, selainnya → kemarin
    shift2: hour >= 22 ? today : yesterday,
  };
}

// ============================================================
// DateFilter Component
// ============================================================
const DateFilter = ({ shift1Date, shift2Date, onShift1DateChange, onShift2DateChange }) => {
  const defaults = getDefaultDates();

  const toLocalDateStr = (d) => {
    const date = new Date(d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const today = toLocalDateStr(new Date());
  const yesterday = toLocalDateStr(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const thisWeekStart = toLocalDateStr(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));

  const quickFilters1 = [
    { label: 'Hari ini',  val: today },
    { label: 'Kemarin',   val: yesterday },
  ];

  const quickFilters2 = [
    { label: 'Tadi malam', val: yesterday },
    { label: 'Malam ini',  val: today },
  ];

  return (
    <div style={s.wrapper}>
      {/* Shift 1 Filter */}
      <div style={s.filterGroup}>
        <span style={s.shiftBadge1}>Shift 1</span>
        <div style={s.quickBtns}>
          {quickFilters1.map(f => (
            <button
              key={f.val}
              style={{ ...s.quickBtn, ...(shift1Date === f.val ? s.quickBtnActive1 : {}) }}
              onClick={() => onShift1DateChange(f.val)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={shift1Date}
          onChange={e => onShift1DateChange(e.target.value)}
          style={s.datePicker}
        />
      </div>

      <div style={s.divider} />

      {/* Shift 2 Filter */}
      <div style={s.filterGroup}>
        <span style={s.shiftBadge2}>Shift 2</span>
        <div style={s.quickBtns}>
          {quickFilters2.map(f => (
            <button
              key={f.val}
              style={{ ...s.quickBtn, ...(shift2Date === f.val ? s.quickBtnActive2 : {}) }}
              onClick={() => onShift2DateChange(f.val)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={shift2Date}
          onChange={e => onShift2DateChange(e.target.value)}
          style={s.datePicker}
        />
      </div>
    </div>
  );
};

const s = {
  wrapper: {
    background: 'var(--color-background-primary)',
    border: '0.5px solid var(--color-border-tertiary)',
    borderRadius: 12,
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  shiftBadge1: {
    fontSize: 11,
    fontWeight: 500,
    padding: '3px 8px',
    borderRadius: 6,
    background: '#E6F1FB',
    color: '#0C447C',
    whiteSpace: 'nowrap',
  },
  shiftBadge2: {
    fontSize: 11,
    fontWeight: 500,
    padding: '3px 8px',
    borderRadius: 6,
    background: '#E1F5EE',
    color: '#085041',
    whiteSpace: 'nowrap',
  },
  quickBtns: { display: 'flex', gap: 4 },
  quickBtn: {
    fontSize: 11,
    padding: '4px 10px',
    borderRadius: 6,
    border: '0.5px solid var(--color-border-secondary)',
    background: 'var(--color-background-secondary)',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  quickBtnActive1: {
    background: '#E6F1FB',
    color: '#0C447C',
    border: '0.5px solid #378ADD',
    fontWeight: 500,
  },
  quickBtnActive2: {
    background: '#E1F5EE',
    color: '#085041',
    border: '0.5px solid #1D9E75',
    fontWeight: 500,
  },
  datePicker: {
    fontSize: 11,
    padding: '4px 8px',
    border: '0.5px solid var(--color-border-secondary)',
    borderRadius: 6,
    background: 'var(--color-background-secondary)',
    color: 'var(--color-text-primary)',
    outline: 'none',
    cursor: 'pointer',
  },
  divider: {
    width: '0.5px',
    height: 28,
    background: 'var(--color-border-tertiary)',
    flexShrink: 0,
  },
};

export default DateFilter;