import React, { useState } from 'react';

const COLS = {
  shift:             { label: 'Shift',          align: 'left' },
  tanggal:           { label: 'Tanggal',         align: 'left' },
  cl_no:             { label: 'CL No',           align: 'left' },
  product_name:      { label: 'Product',         align: 'left' },
  output_total:      { label: 'Output (pcs)',    align: 'right' },
  reject_qty:        { label: 'Reject (pcs)',    align: 'right' },
  stoptime_total:    { label: 'Stop Total (min)',align: 'right' },
  stoptime_man:      { label: 'Man (min)',        align: 'right' },
  stoptime_machine:  { label: 'Machine (min)',   align: 'right' },
  stoptime_material: { label: 'Material (min)',  align: 'right' },
  stoptime_method:   { label: 'Method (min)',    align: 'right' },
  stoptime_other:    { label: 'Other (min)',     align: 'right' },
};

const fmtDate = (val) => {
  const d = new Date(val);
  if (isNaN(d)) return val;
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return wib.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

const fmtNum = (val) => {
  if (val === null || val === undefined || val === '') return '—';
  const n = Number(val);
  if (isNaN(n)) return String(val);
  return Number.isInteger(n) ? n.toLocaleString('id-ID') : parseFloat(n.toFixed(2)).toLocaleString('id-ID');
};

const DataTable = ({ data, loading }) => {
  const [page, setPage] = useState(1);
  const perPage = 15;
  const columns = Object.keys(COLS);

  if (loading) return <div style={{ background: '#f9fafb', borderRadius: 14, height: 200 }} />;
  if (!data?.length) return (
    <div style={s.card}>
      <p style={s.title}>Data detail per hari</p>
      <p style={s.empty}>Tidak ada data untuk periode ini</p>
    </div>
  );

  const totalPages = Math.ceil(data.length / perPage);
  const paginated = data.slice((page - 1) * perPage, page * perPage);

  return (
    <div style={s.card}>
      <p style={s.title}>Data detail per hari <span style={s.sub}>({data.length} baris)</span></p>
      <div style={{ overflowX: 'auto' }}>
        <table style={s.table}>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col} style={{ ...s.th, textAlign: COLS[col].align }}>{COLS[col].label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((row, idx) => (
              <tr key={idx} style={idx % 2 === 0 ? s.trEven : s.trOdd}>
                {columns.map(col => (
                  <td key={col} style={{ ...s.td, textAlign: COLS[col].align }}>
                    {col === 'shift' ? (
                      <span style={{ ...s.badge, ...(row.shift === 'Shift 1' ? s.s1 : s.s2) }}>{row.shift}</span>
                    ) : col === 'tanggal' ? fmtDate(row[col])
                    : ['shift','cl_no','product_name'].includes(col) ? (row[col] || '—')
                    : fmtNum(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={s.pagination}>
          <span style={s.pageInfo}>Hal {page} dari {totalPages}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={s.pageBtn} onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1}>← Prev</button>
            <button style={s.pageBtn} onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
};

const s = {
  card: { background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 14, padding: '18px 20px' },
  title: { margin: '0 0 14px', fontWeight: 500, fontSize: 14, color: '#111827' },
  sub: { fontSize: 12, color: '#9ca3af', fontWeight: 400 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { padding: '8px 12px', background: '#f9fafb', color: '#6b7280', fontWeight: 500, borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap', fontSize: 11 },
  td: { padding: '9px 12px', color: '#111827', borderBottom: '0.5px solid #f9fafb', whiteSpace: 'nowrap' },
  trEven: { background: '#fff' },
  trOdd: { background: '#fafafa' },
  badge: { fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 4 },
  s1: { background: '#E6F1FB', color: '#0C447C' },
  s2: { background: '#E1F5EE', color: '#085041' },
  empty: { textAlign: 'center', color: '#9ca3af', padding: '40px 0', fontSize: 13 },
  pagination: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  pageInfo: { fontSize: 12, color: '#9ca3af' },
  pageBtn: { padding: '5px 12px', borderRadius: 6, border: '0.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#374151' },
};

export default DataTable;