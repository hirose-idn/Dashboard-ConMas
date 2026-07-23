import React from 'react';

const MONTHS = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember'
];

const MonthFilter = ({ year, month, onChange }) => {
  const now = new Date();
  const years = [now.getFullYear() - 1, now.getFullYear()];

  return (
    <div style={s.wrapper}>
      <span style={s.label}>Periode:</span>
      <select
        value={month}
        onChange={e => onChange(year, Number(e.target.value))}
        style={s.select}
      >
        {MONTHS.map((m, i) => (
          <option key={i} value={i}>{m}</option>
        ))}
      </select>
      <select
        value={year}
        onChange={e => onChange(Number(e.target.value), month)}
        style={s.select}
      >
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <span style={s.hint}>
        {month === now.getMonth() && year === now.getFullYear()
          ? `1–${now.getDate()} ${MONTHS[month]} ${year}`
          : `1–${new Date(year, month+1, 0).getDate()} ${MONTHS[month]} ${year}`
        }
      </span>
    </div>
  );
};

const s = {
  wrapper: {
    background: '#fff',
    border: '0.5px solid #e5e7eb',
    borderRadius: 10,
    padding: '10px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  label: { fontSize: 13, fontWeight: 500, color: '#374151' },
  select: {
    fontSize: 13,
    padding: '5px 10px',
    border: '0.5px solid #d1d5db',
    borderRadius: 6,
    background: '#f9fafb',
    color: '#111827',
    outline: 'none',
    cursor: 'pointer',
  },
  hint: { fontSize: 12, color: '#9ca3af', marginLeft: 4 },
};

export default MonthFilter;