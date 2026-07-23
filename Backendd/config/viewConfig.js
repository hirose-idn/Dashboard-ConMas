// Tanggung jawab: SSoT nama view & tabel — ubah di sini, berlaku di seluruh app.

const VIEWS = {
  SHIFT1_WEEKDAY: 'view_report_13459',
  SHIFT1_FRIDAY:  'view_report_13460',
  SHIFT2:         'view_report_13461',
};

// DOW (day of week) filter per view — ISO: 1=Senin, 5=Jumat
const DOW_FILTER = {
  SHIFT1_WEEKDAY: '1,2,3,4',
  SHIFT1_FRIDAY:  '5',
  SHIFT2:         null,
};

module.exports = { VIEWS, DOW_FILTER };
