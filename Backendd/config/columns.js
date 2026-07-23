// Tanggung jawab: menyimpan mapping kolom DB dan slot trend — tidak ada logic.

const SHIFT1_COLS = {
  output:            'cluster_1_523_n',
  output_plan:       'cluster_1_468_n',
  reject:            'cluster_1_516_n',
  stoptime_total:    'cluster_1_529_n',
  stoptime_man:      'cluster_1_533_n',
  stoptime_machine:  'cluster_1_531_n',
  stoptime_material: 'cluster_1_535_n',
  stoptime_other:    'cluster_1_543_n',
  cycle_time_swi:    'cluster_1_70_n',
  cycle_time_actual: 'cluster_1_72_n',
  cl_no:             'cluster_1_7_t',
  product_name:      'cluster_1_8_t',
  line:              'cluster_1_12_t',
  cell_leader_nama:  'cluster_1_33_t',
  pj_teknis_nama:    'cluster_1_496_t',
};

const SHIFT1_JUMAT_COLS = {
  output:            'cluster_1_421_n',
  output_plan:       'cluster_1_419_n',
  reject:            'cluster_1_516_n',
  stoptime_total:    'cluster_1_529_n',
  stoptime_man:      'cluster_1_533_n',
  stoptime_machine:  'cluster_1_531_n',
  stoptime_material: 'cluster_1_535_n',
  stoptime_other:    'cluster_1_543_n',
  cycle_time_swi:    'cluster_1_70_n',
  cycle_time_actual: 'cluster_1_72_n',
  cl_no:             'cluster_1_7_t',
  product_name:      'cluster_1_8_t',
  line:              'cluster_1_12_t',
  cell_leader_nama:  'cluster_1_33_t',
  pj_teknis_nama:    'cluster_1_496_t',
};

const SHIFT2_COLS = {
  output:            'cluster_1_474_n',
  output_plan:       'cluster_1_419_n',
  reject:            'cluster_1_467_n',
  stoptime_total:    'cluster_1_480_n',
  stoptime_man:      'cluster_1_484_n',
  stoptime_machine:  'cluster_1_482_n',
  stoptime_material: 'cluster_1_486_n',
  stoptime_other:    'cluster_1_494_n',
  cycle_time_swi:    'cluster_1_70_n',
  cycle_time_actual: 'cluster_1_72_n',
  cl_no:             'cluster_1_7_t',
  product_name:      'cluster_1_8_t',
  line:              'cluster_1_12_t',
  cell_leader_nama:  'cluster_1_33_t',
  pj_teknis_nama:    'cluster_1_545_t',
};

const TREND_PERIODS = {
  '13459': [
    { label: '07-08', plan_col: 'cluster_1_76_n',  actual_col: 'cluster_1_78_n',  cum_eff_min: 60  },
    { label: '08-09', plan_col: 'cluster_1_125_n', actual_col: 'cluster_1_127_n', cum_eff_min: 120 },
    { label: '09-10', plan_col: 'cluster_1_174_n', actual_col: 'cluster_1_176_n', cum_eff_min: 180 },
    { label: '10-11', plan_col: 'cluster_1_223_n', actual_col: 'cluster_1_225_n', cum_eff_min: 205 },
    { label: '11-12', plan_col: 'cluster_1_272_n', actual_col: 'cluster_1_274_n', cum_eff_min: 265 },
    { label: '12-13', plan_col: 'cluster_1_321_n', actual_col: 'cluster_1_323_n', cum_eff_min: 310 },
    { label: '13-14', plan_col: 'cluster_1_370_n', actual_col: 'cluster_1_372_n', cum_eff_min: 370 },
    { label: '14-15', plan_col: 'cluster_1_419_n', actual_col: 'cluster_1_421_n', cum_eff_min: 430 },
    { label: '15-16', plan_col: 'cluster_1_468_n', actual_col: 'cluster_1_470_n', cum_eff_min: 480 },
  ],
  '13460': [
    { label: '07-08', plan_col: 'cluster_1_76_n',  actual_col: 'cluster_1_78_n',  cum_eff_min: 60  },
    { label: '08-09', plan_col: 'cluster_1_125_n', actual_col: 'cluster_1_127_n', cum_eff_min: 120 },
    { label: '09-10', plan_col: 'cluster_1_174_n', actual_col: 'cluster_1_176_n', cum_eff_min: 180 },
    { label: '10-11', plan_col: 'cluster_1_223_n', actual_col: 'cluster_1_225_n', cum_eff_min: 205 },
    { label: '11-12', plan_col: 'cluster_1_272_n', actual_col: 'cluster_1_274_n', cum_eff_min: 265 },
    { label: '12-13', plan_col: 'cluster_1_321_n', actual_col: 'cluster_1_323_n', cum_eff_min: 295 },
    { label: '13-14', plan_col: 'cluster_1_370_n', actual_col: 'cluster_1_372_n', cum_eff_min: 355 },
    { label: '14-15', plan_col: 'cluster_1_419_n', actual_col: 'cluster_1_421_n', cum_eff_min: 445 },
  ],
  '13461': [
    { label: '22-23', plan_col: 'cluster_1_76_n',  actual_col: 'cluster_1_78_n',  cum_eff_min: 60  },
    { label: '23-00', plan_col: 'cluster_1_125_n', actual_col: 'cluster_1_127_n', cum_eff_min: 120 },
    { label: '00-01', plan_col: 'cluster_1_174_n', actual_col: 'cluster_1_176_n', cum_eff_min: 165 },
    { label: '01-02', plan_col: 'cluster_1_223_n', actual_col: 'cluster_1_225_n', cum_eff_min: 225 },
    { label: '02-04', plan_col: 'cluster_1_272_n', actual_col: 'cluster_1_274_n', cum_eff_min: 315 },
    { label: '04-05', plan_col: 'cluster_1_321_n', actual_col: 'cluster_1_323_n', cum_eff_min: 375 },
    { label: '05-06', plan_col: 'cluster_1_370_n', actual_col: 'cluster_1_372_n', cum_eff_min: 420 },
    { label: '06-07', plan_col: 'cluster_1_419_n', actual_col: 'cluster_1_421_n', cum_eff_min: 480 },
  ],
};

module.exports = { SHIFT1_COLS, SHIFT1_JUMAT_COLS, SHIFT2_COLS, TREND_PERIODS };
