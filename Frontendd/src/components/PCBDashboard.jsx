import React, { useState, useEffect, useCallback } from "react";

// ═══════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════
const BASE_URL = "http://localhost:5000"; // sesuaikan port backend
const REFRESH_MS = 5_000;
const TARGET = 2400;

// ═══════════════════════════════════════════════════════════
//  MOCK — hanya untuk field yang BELUM ada di backend
//  Hapus / ganti satu per satu kalau endpoint sudah siap
// ═══════════════════════════════════════════════════════════
const MOCK_ONLY = {
  waktu_siklus_standar: 19,
  waktu_siklus_aktual: 25.1,
  availability: { operator: 66.2, mesin: 100.0 },
  monthly: {
    stoptime: 129,
    unit_cacat: 11,
    ppm: 949,
    micro_stop: 0,
    proses_bermasalah: [{ nama: "Mesin Press Seal Ring", count: 1 }],
  },
  hourly: [
    {
      slot: "08-09",
      rencana: 300,
      aktual: null,
      deviasi: null,
      pencapaian: null,
    },
    {
      slot: "09-10",
      rencana: 300,
      aktual: null,
      deviasi: null,
      pencapaian: null,
    },
    {
      slot: "10-11",
      rencana: 300,
      aktual: null,
      deviasi: null,
      pencapaian: null,
    },
    {
      slot: "11-12",
      rencana: 300,
      aktual: null,
      deviasi: null,
      pencapaian: null,
    },
    {
      slot: "12-13",
      rencana: null,
      aktual: null,
      deviasi: null,
      pencapaian: null,
    },
    {
      slot: "13-14",
      rencana: 300,
      aktual: null,
      deviasi: null,
      pencapaian: null,
    },
    {
      slot: "14-15",
      rencana: 300,
      aktual: null,
      deviasi: null,
      pencapaian: null,
    },
    {
      slot: "15-16",
      rencana: 300,
      aktual: null,
      deviasi: null,
      pencapaian: null,
    },
    {
      slot: "16-17",
      rencana: 300,
      aktual: null,
      deviasi: null,
      pencapaian: null,
    },
    {
      slot: "17-18",
      rencana: 300,
      aktual: null,
      deviasi: null,
      pencapaian: null,
    },
    {
      slot: "18-19",
      rencana: 300,
      aktual: null,
      deviasi: null,
      pencapaian: null,
    },
    {
      slot: "19-20",
      rencana: 300,
      aktual: null,
      deviasi: null,
      pencapaian: null,
    },
  ],
  personnel: {
    ketua: {
      nama: "SITI",
      no_karyawan: "2443",
      telp: "15171780857",
      foto: null,
    },
    pj_teknis: {
      nama: "ASEP",
      no_karyawan: "2000",
      telp: "13137289113",
      foto: null,
    },
  },
  schedule: [
    { label: "Sikat Gigi & Cuci Muka", status: "Sudah Dilakukan", done: true },
    {
      label: "BEBAS SERPIHAN LOGAM\n6P1C — LINI TERSERTIFIKASI",
      status: null,
      done: false,
      highlight: true,
    },
  ],
  quality_detail: [
    { jenis: "Total", jumlah: 0 },
    { jenis: "—", jumlah: 0 },
    { jenis: "—", jumlah: 0 },
  ],
  microstop_detail: [
    { penyebab: "Total", frekuensi: 0 },
    { penyebab: "—", frekuensi: 0 },
  ],
  stopline_detail: [
    { penyebab: "Mesin Press Seal Ring", gejala: "Anomali", jml: 1 },
    { penyebab: "—", gejala: "", jml: 0 },
  ],
};

// ═══════════════════════════════════════════════════════════
//  HOOK — fetch data real dari backend
// ═══════════════════════════════════════════════════════════
function useDashboardData() {
  const [state, setState] = useState({
    // ── Data dari backend (real) ──
    tanggal: null,
    line: null,
    nama_produk: null,
    hasil: 0,
    reject: 0,
    deviasi: 0,
    ppm_cacat: 0,
    stoptime_man: 0,
    stoptime_machine: 0,
    stoptime_material: 0,
    stoptime_other: 0,
    trend_s1: [],
    trend_s2: [],
    // ── Data mock (belum ada endpoint) ──
    ...MOCK_ONLY,
    // ──
    lastRefresh: null,
    loading: true,
    error: null,
  });

  const getTodayWIB = () => {
    const wib = new Date(new Date().getTime() + 7 * 3600 * 1000);
    return wib.toISOString().slice(0, 10);
  };

  const getActiveShiftLabel = () => {
    const h = new Date().getHours();
    return h >= 7 && h < 22 ? "Shift 1" : "Shift 2";
  };

  const refresh = useCallback(async () => {
    try {
      const today = getTodayWIB();

      // Fetch data harian + tren paralel
      const [dataRes, trendRes] = await Promise.all([
        fetch(`${BASE_URL}/api/dashboard`),
        fetch(`${BASE_URL}/api/dashboard/trend?date=${today}`),
      ]);

      if (!dataRes.ok)
        throw new Error(`/api/dashboard: HTTP ${dataRes.status}`);
      if (!trendRes.ok)
        throw new Error(`/api/dashboard/trend: HTTP ${trendRes.status}`);

      const dataJson = await dataRes.json();
      const trendJson = await trendRes.json();

      // Pilih row shift aktif hari ini dari response array
      const rows = dataJson.data || [];
      const activeShift = getActiveShiftLabel();

      // Konversi timestamp ke date string WIB
      const toWIBDate = (ts) => {
        const d = new Date(ts);
        const wib = new Date(d.getTime() + 7 * 3600 * 1000);
        return wib.toISOString().slice(0, 10);
      };

      // Cari row yang cocok: shift aktif + hari ini
      const row =
        rows.find(
          (r) => r.shift === activeShift && toWIBDate(r.tanggal) === today,
        ) || null;

      // Kalau shift 2 dan jam < 7, cari kemarin
      let rowS2 = null;
      const now = new Date();
      if (now.getHours() < 7) {
        const yesterday = new Date(now - 86400000);
        const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
        rowS2 =
          rows.find(
            (r) => r.shift === "Shift 2" && toWIBDate(r.tanggal) === yStr,
          ) || null;
      }

      const activeRow = activeShift === "Shift 2" && rowS2 ? rowS2 : row;

      // Hitung metrics dari data yang ada
      const hasil = Number(activeRow?.output_total) || 0;
      const reject = Number(activeRow?.reject_qty) || 0;
      const deviasi = hasil - TARGET;
      const ppm = hasil > 0 ? Math.round((reject / hasil) * 1_000_000) : 0;

      setState((prev) => ({
        ...prev,
        tanggal: activeRow ? toWIBDate(activeRow.tanggal) : today,
        line: activeRow?.cl_no || null,
        nama_produk: activeRow?.product_name || null,
        hasil,
        reject,
        deviasi,
        ppm_cacat: ppm,
        stoptime_man: Number(activeRow?.stoptime_man) || 0,
        stoptime_machine: Number(activeRow?.stoptime_machine) || 0,
        stoptime_material: Number(activeRow?.stoptime_material) || 0,
        stoptime_other: Number(activeRow?.stoptime_other) || 0,
        trend_s1: trendJson.shift1 || [],
        trend_s2: trendJson.shift2 || [],
        lastRefresh: new Date(),
        loading: false,
        error: null,
      }));
    } catch (err) {
      console.error("Fetch error:", err.message);
      setState((prev) => ({ ...prev, loading: false, error: err.message }));
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  return state;
}

// ── Helpers ────────────────────────────────────────────────
const fmt = (v, dec = 0) => {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return dec > 0
    ? parseFloat(n.toFixed(dec)).toLocaleString("id-ID")
    : n.toLocaleString("id-ID");
};

// ── Design tokens ──────────────────────────────────────────
const C = {
  bg: "#04080f",
  panel: "#070d1a",
  panelAlt: "#080e1c",
  border: "#0f1e35",
  borderBr: "#1a3050",
  green: "#00e676",
  greenDim: "#00c85340",
  blue: "#40a9ff",
  blueDim: "#40a9ff20",
  orange: "#ffb340",
  red: "#ff4d4f",
  redDim: "#ff4d4f30",
  yellow: "#ffd666",
  purple: "#b37feb",
  text: "#c9d8e8",
  textDim: "#506070",
  textMut: "#2a3a4a",
};

const globalStyle = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: #050c1a; }
  ::-webkit-scrollbar-thumb { background: #1a3050; border-radius: 2px; }
  @keyframes pulse-dot { 0%,100%{opacity:1;} 50%{opacity:0.3;} }
  @keyframes scan { 0%{transform:translateY(-100%);} 100%{transform:translateY(500%);} }
`;

// ── Sub-components ─────────────────────────────────────────
const Clock = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const pad = (n) => String(n).padStart(2, "0");
  const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const BULAN = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ fontSize: 10, color: C.textDim }}>
        {HARI[now.getDay()]}, {now.getDate()} {BULAN[now.getMonth()]}{" "}
        {now.getFullYear()}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: C.blue,
          letterSpacing: 2,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {pad(now.getHours())}:{pad(now.getMinutes())}
        <span style={{ fontSize: 11, color: C.textDim }}>
          .{pad(now.getSeconds())}
        </span>
      </div>
    </div>
  );
};

const ProgressBar = ({ pct, color }) => (
  <div
    style={{
      position: "relative",
      height: 16,
      background: "#0a1020",
      borderRadius: 3,
      overflow: "hidden",
      border: `1px solid ${C.border}`,
    }}
  >
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        height: "100%",
        width: `${Math.min(pct, 100)}%`,
        background: `linear-gradient(90deg, ${color}88, ${color})`,
        transition: "width 1s ease",
        boxShadow: `0 0 8px ${color}66`,
      }}
    />
    <div
      style={{
        position: "absolute",
        right: 6,
        top: 0,
        height: "100%",
        display: "flex",
        alignItems: "center",
        fontSize: 10,
        fontWeight: 800,
        color: "#fff",
        textShadow: "0 0 6px #000",
      }}
    >
      {pct.toFixed(1)}%
    </div>
  </div>
);

const Avatar = ({ foto, nama, size = 48 }) => {
  const init = (nama || "")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `radial-gradient(circle at 35% 35%, #112240, #050d1a)`,
        border: `2px solid ${C.borderBr}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        overflow: "hidden",
        boxShadow: `0 0 12px ${C.blueDim}`,
      }}
    >
      {foto ? (
        <img
          src={foto}
          alt={nama}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <span style={{ fontSize: size * 0.3, fontWeight: 800, color: C.blue }}>
          {init}
        </span>
      )}
    </div>
  );
};

const SectionTitle = ({ children, color = C.blue, icon }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      borderLeft: `3px solid ${color}`,
      background: `linear-gradient(90deg, ${color}18, transparent)`,
      padding: "3px 8px 3px 7px",
      borderBottom: `1px solid ${C.border}`,
      flexShrink: 0,
    }}
  >
    {icon && <span style={{ fontSize: 10 }}>{icon}</span>}
    <span
      style={{
        fontSize: 10,
        fontWeight: 800,
        color,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  </div>
);

// Badge "LIVE dari DB" vs "Mock"
const DataBadge = ({ live }) => (
  <span
    style={{
      fontSize: 7,
      fontWeight: 700,
      padding: "1px 5px",
      borderRadius: 2,
      background: live ? C.greenDim : "#2a1a00",
      color: live ? C.green : C.orange,
      border: `1px solid ${live ? C.green + "44" : C.orange + "44"}`,
      whiteSpace: "nowrap",
    }}
  >
    {live ? "● DB" : "○ mock"}
  </span>
);

const KVRow = ({ label, value, valueColor = C.text }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "2px 0",
      borderBottom: `1px solid ${C.border}`,
    }}
  >
    <span style={{ fontSize: 9, color: C.textDim }}>{label}</span>
    <span style={{ fontSize: 9, fontWeight: 600, color: valueColor }}>
      {value}
    </span>
  </div>
);

const TH = ({ children, style = {} }) => (
  <th
    style={{
      background: "#050c1a",
      color: C.blue,
      fontSize: 9,
      fontWeight: 700,
      padding: "4px 5px",
      borderBottom: `1px solid ${C.borderBr}`,
      borderRight: `1px solid ${C.border}`,
      textAlign: "center",
      whiteSpace: "nowrap",
      letterSpacing: "0.04em",
      ...style,
    }}
  >
    {children}
  </th>
);

const TD = ({ children, style = {} }) => (
  <td
    style={{
      fontSize: 10,
      padding: "3px 5px",
      borderBottom: `1px solid ${C.border}`,
      borderRight: `1px solid ${C.border}`,
      textAlign: "center",
      ...style,
    }}
  >
    {children}
  </td>
);

const MetricCard = ({ label, value, color, noBorderRight, badge }) => (
  <div
    style={{
      padding: "8px 10px",
      textAlign: "center",
      borderRight: noBorderRight ? "none" : `1px solid ${C.border}`,
      background: `radial-gradient(ellipse at 50% 0%, ${color}08, transparent 70%)`,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      gap: 2,
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
          fontSize: 9,
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
        fontSize: 30,
        fontWeight: 900,
        color,
        lineHeight: 1,
        textShadow: `0 0 20px ${color}55`,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {value}
    </div>
  </div>
);

const CTCard = ({ label, value, alert, badge }) => (
  <div
    style={{
      background: alert ? "#2a080811" : "#0a1a0a11",
      border: `1px solid ${alert ? C.red + "55" : C.green + "33"}`,
      borderRadius: 5,
      padding: "4px 10px",
      textAlign: "center",
      minWidth: 72,
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        marginBottom: 1,
      }}
    >
      <span style={{ fontSize: 8, color: C.textDim }}>{label}</span>
      {badge && <DataBadge live={badge === "live"} />}
    </div>
    <div
      style={{
        fontSize: 22,
        fontWeight: 900,
        color: alert ? C.red : C.green,
        lineHeight: 1,
        textShadow: `0 0 12px ${alert ? C.red : C.green}55`,
      }}
    >
      {value}
    </div>
    <div style={{ fontSize: 8, color: C.textDim }}>dtk</div>
  </div>
);

const EvalCard = ({ label, value, color, noBorder, badge }) => (
  <div
    style={{
      padding: "5px 6px",
      textAlign: "center",
      borderRight: noBorder ? "none" : `1px solid ${C.border}`,
      background: `radial-gradient(ellipse at 50% 0%, ${color}0a, transparent 60%)`,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      gap: 2,
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
          fontSize: 8,
          color: C.textDim,
          lineHeight: 1.3,
          textAlign: "center",
        }}
      >
        {label}
      </span>
      {badge && <DataBadge live={badge === "live"} />}
    </div>
    <div
      style={{
        fontSize: 20,
        fontWeight: 900,
        color,
        lineHeight: 1,
        textShadow: `0 0 12px ${color}44`,
      }}
    >
      {value}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════
export default function PCBDashboard() {
  const d = useDashboardData();

  const ctOvertime = d.waktu_siklus_aktual > d.waktu_siklus_standar;

  // Tanggal display
  const today = (() => {
    const now = new Date();
    return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}`;
  })();

  return (
    <>
      <style>{globalStyle}</style>
      <div
        style={{
          background: C.bg,
          color: C.text,
          fontFamily: "'Segoe UI', 'Meiryo', 'Yu Gothic', sans-serif",
          width: "100vw",
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          fontSize: 12,
          overflow: "hidden",
          backgroundImage: `linear-gradient(${C.border} 1px, transparent 1px), linear-gradient(90deg, ${C.border} 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      >
        {/* ══ HEADER ══ */}
        <div
          style={{
            background: `linear-gradient(90deg, #06101f, #071428, #06101f)`,
            borderBottom: `1px solid ${C.borderBr}`,
            padding: "4px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
            boxShadow: `0 2px 20px #00000066`,
          }}
        >
          <Clock />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1,
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 900,
                color: "#fff",
                letterSpacing: "0.16em",
                textShadow: `0 0 30px ${C.blue}66`,
              }}
            >
              TAMPILAN DATA PRODUKSI REAL-TIME
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {d.error ? (
                <span style={{ fontSize: 8, color: C.red }}>⚠ {d.error}</span>
              ) : (
                <>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: d.loading ? C.orange : C.green,
                      display: "inline-block",
                      animation: "pulse-dot 1.5s ease-in-out infinite",
                      boxShadow: `0 0 6px ${d.loading ? C.orange : C.green}`,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 8,
                      color: C.textDim,
                      letterSpacing: "0.1em",
                    }}
                  >
                    {d.loading
                      ? "MEMUAT..."
                      : `LIVE · refresh ${REFRESH_MS / 1000}s`}
                  </span>
                </>
              )}
            </div>
          </div>
          <div style={{ fontSize: 10, color: C.textDim }}>
            {d.lastRefresh ? d.lastRefresh.toLocaleTimeString("id-ID") : "—"}
          </div>
        </div>

        {/* ══ BODY ══ */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "158px 1fr 190px",
            gridTemplateRows: "1fr",
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            alignItems: "stretch",
          }}
        >
          {/* ── KOLOM KIRI ── */}
          <div
            style={{
              borderRight: `1px solid ${C.borderBr}`,
              display: "flex",
              flexDirection: "column",
              background: C.panel,
              overflow: "hidden",
              minHeight: 0,
            }}
          >
            {/* Info */}
            <div
              style={{
                padding: "7px 9px",
                borderBottom: `1px solid ${C.border}`,
                flexShrink: 0,
              }}
            >
              {/* Tanggal dari DB */}
              <KVRow
                label="Tanggal"
                value={d.tanggal || today}
                valueColor={C.blue}
              />
              {/* Line / CL No dari DB */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "2px 0",
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <span style={{ fontSize: 9, color: C.textDim }}>Line</span>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <DataBadge live={!!d.line} />
                  <span
                    style={{ fontSize: 9, fontWeight: 600, color: C.green }}
                  >
                    {d.line || "—"}
                  </span>
                </div>
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 9,
                  color: C.textDim,
                  marginBottom: 3,
                }}
              >
                Kode Cetak
              </div>
              <div
                style={{
                  width: 76,
                  height: 76,
                  margin: "0 auto",
                  background: `linear-gradient(135deg, #0a1628, #050d1a)`,
                  border: `1px solid ${C.borderBr}`,
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    height: 2,
                    background: `linear-gradient(90deg, transparent, ${C.blue}88, transparent)`,
                    animation: "scan 2s linear infinite",
                  }}
                />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 16, marginBottom: 2 }}>▦</div>
                  <div style={{ fontSize: 7, color: C.textDim }}>QR Code</div>
                </div>
              </div>
            </div>

            {/* Ketua Line — mock */}
            <div
              style={{ borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}
            >
              <SectionTitle color={C.blue} icon="👤">
                Ketua Line <DataBadge live={false} />
              </SectionTitle>
              <div
                style={{
                  padding: "7px 9px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Avatar
                  foto={d.personnel.ketua?.foto}
                  nama={d.personnel.ketua?.nama}
                  size={48}
                />
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 11,
                    color: "#fff",
                    textAlign: "center",
                  }}
                >
                  {d.personnel.ketua?.nama}
                </div>
                <div style={{ fontSize: 9, color: C.textDim }}>
                  No. {d.personnel.ketua?.no_karyawan}
                </div>
                <div style={{ fontSize: 9, color: C.textDim }}>
                  {d.personnel.ketua?.telp}
                </div>
              </div>
            </div>

            {/* PJ Teknis — mock */}
            <div
              style={{ borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}
            >
              <SectionTitle color={C.blue} icon="🔧">
                PJ Teknis <DataBadge live={false} />
              </SectionTitle>
              <div
                style={{
                  padding: "7px 9px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Avatar
                  foto={d.personnel.pj_teknis?.foto}
                  nama={d.personnel.pj_teknis?.nama}
                  size={48}
                />
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 11,
                    color: "#fff",
                    textAlign: "center",
                  }}
                >
                  {d.personnel.pj_teknis?.nama}
                </div>
                <div style={{ fontSize: 9, color: C.textDim }}>
                  No. {d.personnel.pj_teknis?.no_karyawan}
                </div>
                <div style={{ fontSize: 9, color: C.textDim }}>
                  {d.personnel.pj_teknis?.telp}
                </div>
              </div>
            </div>

            <div style={{ flex: 1 }} />
            <div
              style={{
                padding: "4px 8px",
                borderTop: `1px solid ${C.border}`,
                fontSize: 8,
                color: C.textMut,
                textAlign: "center",
              }}
            >
              {d.lastRefresh?.toLocaleTimeString("id-ID") || "—"}
            </div>
          </div>

          {/* ── KOLOM TENGAH ── */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              background: C.panelAlt,
              minHeight: 0,
            }}
          >
            {/* Nama produk + waktu siklus */}
            <div
              style={{
                borderBottom: `1px solid ${C.borderBr}`,
                padding: "5px 12px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexShrink: 0,
                background: `linear-gradient(90deg, #06101f, #071428, #06101f)`,
              }}
            >
              <div
                style={{ fontSize: 9, color: C.textDim, whiteSpace: "nowrap" }}
              >
                Nama Produk
              </div>
              {/* Nama produk dari DB */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <DataBadge live={!!d.nama_produk} />
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 900,
                    color: "#fff",
                    letterSpacing: "0.06em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {d.nama_produk || "—"}
                </div>
              </div>
              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  gap: 6,
                  flexShrink: 0,
                }}
              >
                <CTCard
                  label="Siklus Standar"
                  value={d.waktu_siklus_standar}
                  alert={false}
                  badge="mock"
                />
                <CTCard
                  label="Siklus Aktual"
                  value={d.waktu_siklus_aktual}
                  alert={ctOvertime}
                  badge="mock"
                />
              </div>
            </div>

            {/* 4 metric — hasil, deviasi, reject dari DB; target hardcode; PPM dihitung */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,1fr)",
                borderBottom: `1px solid ${C.borderBr}`,
                flexShrink: 0,
                background: `linear-gradient(180deg, #06101f, ${C.panelAlt})`,
              }}
            >
              <MetricCard
                label="Target Produksi"
                value={fmt(TARGET)}
                color={C.green}
                badge="mock"
              />
              <MetricCard
                label="Hasil Produksi"
                value={fmt(d.hasil)}
                color={C.text}
                badge="live"
              />
              <MetricCard
                label="Deviasi vs. Target"
                value={(d.deviasi >= 0 ? "+" : "") + fmt(d.deviasi)}
                color={d.deviasi < 0 ? C.red : C.green}
                badge="live"
              />
              <MetricCard
                label="PPM Cacat"
                value={fmt(d.ppm_cacat)}
                color={C.text}
                noBorderRight
                badge="live"
              />
            </div>

            {/* Availability — mock */}
            <div
              style={{
                padding: "6px 12px",
                borderBottom: `1px solid ${C.border}`,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 2,
                }}
              >
                <span style={{ fontSize: 9, color: C.textDim, flex: 1 }}>
                  Ketersediaan Operator
                </span>
                <DataBadge live={false} />
              </div>
              <div style={{ marginBottom: 4 }}>
                <ProgressBar
                  pct={d.availability.operator}
                  color={d.availability.operator >= 80 ? C.orange : C.red}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 2,
                }}
              >
                <span style={{ fontSize: 9, color: C.textDim, flex: 1 }}>
                  Ketersediaan Mesin
                </span>
                <DataBadge live={false} />
              </div>
              <ProgressBar pct={d.availability.mesin} color={C.green} />
            </div>

            {/* Evaluasi bulanan — stoptime_* dari DB, sisanya mock */}
            <div style={{ flexShrink: 0 }}>
              <SectionTitle color={C.blue} icon="📊">
                Evaluasi Kinerja Line — Bulan Berjalan
              </SectionTitle>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(5,1fr)",
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                {/* Stoptime = jumlah semua stoptime dari DB */}
                <EvalCard
                  label="Total Waktu Berhenti (mnt)"
                  value={fmt(
                    d.stoptime_man +
                    d.stoptime_machine +
                    d.stoptime_material +
                    d.stoptime_other,
                    1,
                  )}
                  color={C.orange}
                  badge="live"
                />
                <EvalCard
                  label="Total Unit Cacat"
                  value={fmt(d.monthly.unit_cacat)}
                  color={C.red}
                  badge="mock"
                />
                <EvalCard
                  label="Akumulasi PPM Cacat"
                  value={fmt(d.monthly.ppm)}
                  color={C.red}
                  badge="mock"
                />
                <EvalCard
                  label="Jumlah Micro-Stop"
                  value={fmt(d.monthly.micro_stop)}
                  color={C.text}
                  badge="mock"
                />
                <div
                  style={{
                    padding: "5px 6px",
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    gap: 3,
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
                    <span style={{ fontSize: 8, color: C.textDim }}>
                      Proses Paling Bermasalah
                    </span>
                    <DataBadge live={false} />
                  </div>
                  {(d.monthly.proses_bermasalah || []).map((p, i) => (
                    <div
                      key={i}
                      style={{
                        background: C.redDim,
                        border: `1px solid ${C.red}44`,
                        borderRadius: 3,
                        padding: "2px 5px",
                        fontSize: 9,
                        color: C.red,
                        fontWeight: 700,
                      }}
                    >
                      {p.nama}
                      <span
                        style={{
                          display: "inline-block",
                          background: C.red,
                          color: "#fff",
                          borderRadius: 2,
                          padding: "0 4px",
                          marginLeft: 4,
                          fontSize: 8,
                        }}
                      >
                        #{p.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Tabel per jam — mock, flex:1 isi sisa */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexShrink: 0,
                }}
              >
                <SectionTitle color={C.green} icon="⏱">
                  Rekapitulasi Produksi Per Jam
                </SectionTitle>
                <DataBadge live={false} />
              </div>
              <div style={{ flex: 1, overflow: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    tableLayout: "fixed",
                  }}
                >
                  <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                    <tr>
                      <TH style={{ width: 90, textAlign: "left" }}>
                        Keterangan
                      </TH>
                      {d.hourly.map((h) => (
                        <TH key={h.slot}>{h.slot}</TH>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        label: "Rencana Produksi",
                        key: "rencana",
                        color: C.textDim,
                      },
                      {
                        label: "Produksi Aktual",
                        key: "aktual",
                        color: C.green,
                      },
                      { label: "Deviasi", key: "deviasi", color: null },
                      {
                        label: "Pencapaian",
                        key: "pencapaian",
                        color: C.blue,
                        suffix: "%",
                      },
                    ].map((row, ri) => (
                      <tr
                        key={row.key}
                        style={{
                          background:
                            ri % 2 === 0 ? `${C.border}30` : "transparent",
                        }}
                      >
                        <td
                          style={{
                            fontSize: 9,
                            padding: "3px 6px",
                            color: "#8a9ab0",
                            borderBottom: `1px solid ${C.border}`,
                            borderRight: `1px solid ${C.borderBr}`,
                            fontWeight: 600,
                          }}
                        >
                          {row.label}
                        </td>
                        {d.hourly.map((h) => {
                          const v = h[row.key];
                          const isNeg = row.key === "deviasi" && Number(v) < 0;
                          const isPos = row.key === "deviasi" && Number(v) > 0;
                          const clr = isNeg
                            ? C.red
                            : isPos
                              ? C.green
                              : row.color || C.textDim;
                          return (
                            <TD key={h.slot} style={{ color: clr }}>
                              {v !== null && v !== undefined
                                ? fmt(v) + (row.suffix || "")
                                : "—"}
                            </TD>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ── KOLOM KANAN ── */}
          <div
            style={{
              borderLeft: `1px solid ${C.borderBr}`,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              background: C.panel,
              minHeight: 0,
            }}
          >
            {/* Jadwal — mock */}
            {(d.schedule || []).map((s, i) => (
              <div
                key={i}
                style={{
                  padding: "7px 8px",
                  borderBottom: `1px solid ${C.border}`,
                  background: s.highlight
                    ? `linear-gradient(135deg, ${C.greenDim}, transparent)`
                    : `linear-gradient(135deg, ${C.blueDim}, transparent)`,
                  textAlign: "center",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    fontSize: s.highlight ? 9 : 10,
                    color: s.highlight ? C.green : C.text,
                    fontWeight: s.highlight ? 800 : 500,
                    lineHeight: 1.5,
                    whiteSpace: "pre-line",
                  }}
                >
                  {s.label}
                </div>
                {s.status && (
                  <div
                    style={{
                      marginTop: 4,
                      background: C.greenDim,
                      border: `1px solid ${C.green}55`,
                      borderRadius: 3,
                      padding: "2px 6px",
                      fontSize: 9,
                      color: C.green,
                      fontWeight: 800,
                    }}
                  >
                    ✓ {s.status}
                  </div>
                )}
              </div>
            ))}

            {/* Detail kualitas — mock */}
            <div style={{ flex: "0 0 auto" }}>
              <SectionTitle color={C.yellow} icon="🔍">
                Detail Kualitas <DataBadge live={false} />
              </SectionTitle>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <TH style={{ color: C.yellow }}>Jenis Cacat</TH>
                    <TH style={{ color: C.yellow }}>Jumlah</TH>
                  </tr>
                </thead>
                <tbody>
                  {(d.quality_detail || []).map((q, i) => (
                    <tr
                      key={i}
                      style={{
                        background:
                          i % 2 === 0 ? `${C.border}20` : "transparent",
                      }}
                    >
                      <TD
                        style={{
                          color: C.textDim,
                          textAlign: "left",
                          paddingLeft: 8,
                        }}
                      >
                        {q.jenis}
                      </TD>
                      <TD
                        style={{
                          color: q.jumlah > 0 ? C.red : C.textMut,
                          fontWeight: q.jumlah > 0 ? 700 : 400,
                        }}
                      >
                        {q.jumlah}
                      </TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Detail micro-stop — mock */}
            <div style={{ flex: "0 0 auto" }}>
              <SectionTitle color={C.purple} icon="⚡">
                Detail Micro-Stop <DataBadge live={false} />
              </SectionTitle>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <TH style={{ color: C.purple }}>Penyebab</TH>
                    <TH style={{ color: C.purple }}>Freq</TH>
                  </tr>
                </thead>
                <tbody>
                  {(d.microstop_detail || []).map((m, i) => (
                    <tr
                      key={i}
                      style={{
                        background:
                          i % 2 === 0 ? `${C.border}20` : "transparent",
                      }}
                    >
                      <TD
                        style={{
                          color: C.textDim,
                          textAlign: "left",
                          paddingLeft: 8,
                        }}
                      >
                        {m.penyebab}
                      </TD>
                      <TD
                        style={{
                          color: m.frekuensi > 0 ? C.purple : C.textMut,
                          fontWeight: m.frekuensi > 0 ? 700 : 400,
                        }}
                      >
                        {m.frekuensi}
                      </TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Detail penghentian Line — mock, flex:1 isi sisa */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <SectionTitle color={C.red} icon="🛑">
                Penghentian Line <DataBadge live={false} />
              </SectionTitle>
              <div style={{ flex: 1, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                    <tr>
                      <TH style={{ color: C.red }}>Penyebab</TH>
                      <TH style={{ color: C.red }}>Gejala</TH>
                      <TH style={{ color: C.red }}>Jml</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {(d.stopline_detail || []).map((s, i) => (
                      <tr
                        key={i}
                        style={{
                          background:
                            i % 2 === 0 ? `${C.border}20` : "transparent",
                        }}
                      >
                        <TD
                          style={{
                            color: C.textDim,
                            fontSize: 9,
                            textAlign: "left",
                            paddingLeft: 6,
                          }}
                        >
                          {s.penyebab}
                        </TD>
                        <TD
                          style={{
                            color: s.gejala ? C.orange : C.textMut,
                            fontSize: 9,
                          }}
                        >
                          {s.gejala || "—"}
                        </TD>
                        <TD
                          style={{
                            color: s.jml > 0 ? C.red : C.textMut,
                            fontWeight: s.jml > 0 ? 700 : 400,
                          }}
                        >
                          {s.jml}
                        </TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
