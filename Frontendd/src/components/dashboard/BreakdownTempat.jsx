import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  C,
  GLOBAL_STYLE,
  BASE_URL,
  REFRESH_MS,
  IS_INTERNAL_INSTANCE,
} from "../../config/constants";

const fmt = (n, dec = 0) =>
  n == null
    ? "—"
    : Number(n).toLocaleString("en-US", { maximumFractionDigits: dec });

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function monthRange(year, month) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth(year, month)).padStart(2, "0")}`;
  return { start, end };
}

function currentYearMonth() {
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  return { year: wib.getUTCFullYear(), month: wib.getUTCMonth() + 1 };
}

const thStyle = () => ({
  textAlign: "left",
  padding: "8px 10px",
  fontSize: 10,
  fontWeight: 600,
  color: C.textDim,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  whiteSpace: "nowrap",
  // ⚠️ FIX "bebayang" di kolom sticky (Line/Product Name/Cum Output dkk):
  // tanpa overflow:hidden, teks yang lebih panjang dari `width` kolom
  // (nama produk panjang, angka besar kayak 4,318,702) meluber keluar
  // kotaknya dan numpuk di atas kolom sebelah — soalnya sel-selnya
  // position:sticky dengan background solid, jadi kelihatan kayak 2
  // teks bertabrakan/ghosting. overflow:hidden + ellipsis bikin teks
  // yang kepanjangan dipotong rapi, bukan meluber ke kolom lain.
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const tdStyle = () => ({
  padding: "8px 10px",
  fontSize: 12,
  color: C.textDim,
  verticalAlign: "middle",
  whiteSpace: "nowrap",
  // Sama kayak thStyle() di atas — cegah overflow numpuk ke kolom sebelah.
  overflow: "hidden",
  textOverflow: "ellipsis",
});

// ── Sticky (pinned) columns on the left — width & left offset computed
// manually so they stay visible while the table scrolls sideways to reveal
// the per-date columns.
const STICKY_COLS = [
  { key: "line_code", label: "Line", width: 90 },
  { key: "product_name", label: "Product Name", width: 170 },
  { key: "output_plan", label: "Cum Output Plan", width: 110 },
  { key: "output_actual", label: "Cum Output Actual", width: 120 },
  { key: "bekidoritsu", label: "Bekidoritsu", width: 90 },
  { key: "deviasi", label: "Deviasi", width: 90 },
  { key: "qty_reject", label: "Cum Reject", width: 90 },
];
const stickyLeft = (idx) =>
  STICKY_COLS.slice(0, idx).reduce((sum, c) => sum + c.width, 0);
const STICKY_TOTAL_WIDTH = stickyLeft(STICKY_COLS.length);

function KpiCard({ label, value, unit, color }) {
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: "10px 12px",
      }}
    >
      <p
        style={{
          fontSize: 10,
          color: C.textDim,
          marginBottom: 4,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </p>
      <p style={{ fontSize: 18, fontWeight: 800, color: color || C.text }}>
        {value}
        {unit && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: C.textDim,
              marginLeft: 3,
            }}
          >
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function BreakdownTempat({ tempat, onSelect, onBack }) {
  const [{ year, month }, setYearMonth] = useState(currentYearMonth());
  const [lines, setLines] = useState([]);
  const [dates, setDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("line"); // line | actual | bekidoritsu | deviasi | reject
  const timerRef = useRef(null);
  const scrollRef = useRef(null);

  const scrollByAmount = (amount) => {
    scrollRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  };

  const { start, end } = monthRange(year, month);

  const fetchData = useCallback(async () => {
    try {
      // Kalau lagi diakses DARI Master (IS_INTERNAL_INSTANCE) dan tempat
      // yang dibuka BUKAN Internal (yaitu SGP/Systech) — Master gak punya
      // akses ke DB subcont, jadi harus lewat endpoint proxy /api/master/
      // yang nembak balik ke instance subcont bersangkutan lewat HTTP.
      // Selain itu (diakses langsung di server instance-nya sendiri, atau
      // tempat=Internal yang emang DB-nya lokal di Master) tetap pakai
      // endpoint lokal /api/dashboard/ seperti biasa.
      const isRemoteViaMaster =
        IS_INTERNAL_INSTANCE && tempat.toLowerCase() !== "internal";

      const url = isRemoteViaMaster
        ? `${BASE_URL}/api/master/line-range-breakdown?source=${encodeURIComponent(tempat.toLowerCase())}&start=${start}&end=${end}`
        : `${BASE_URL}/api/dashboard/line-range-breakdown?tempat=${encodeURIComponent(tempat)}&start=${start}&end=${end}`;

      const res = await fetch(url);
      const json = await res.json();

      if (isRemoteViaMaster) {
        // Bentuk response proxy beda dikit dari endpoint lokal — lihat
        // routes/master.js: { source, label, status, data: { dates, data } }
        if (json.status === "ok" && json.data) {
          setLines(json.data.data || []);
          setDates(json.data.dates || []);
          setError(null);
        } else {
          setError(json.message || "Gagal ambil data dari subcont");
        }
      } else if (json.success) {
        setLines(json.data || []);
        setDates(json.dates || []);
        setError(null);
      } else {
        setError(json.message || "Failed to load data");
      }
      setLastUpdate(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tempat, start, end]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    timerRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [fetchData]);

  const goPrevMonth = () => {
    setYearMonth((cur) => {
      const m = cur.month === 1 ? 12 : cur.month - 1;
      const y = cur.month === 1 ? cur.year - 1 : cur.year;
      return { year: y, month: m };
    });
  };
  const goNextMonth = () => {
    setYearMonth((cur) => {
      const m = cur.month === 12 ? 1 : cur.month + 1;
      const y = cur.month === 12 ? cur.year + 1 : cur.year;
      return { year: y, month: m };
    });
  };
  const onMonthInputChange = (e) => {
    const [y, m] = e.target.value.split("-").map(Number);
    if (y && m) setYearMonth({ year: y, month: m });
  };

  // ── Filter & Sort ──
  const filtered = lines
    .filter((l) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        l.line_code.toLowerCase().includes(q) ||
        (l.product_name || "").toLowerCase().includes(q);
      if (!matchesSearch) return false;
      // Line tanpa plan & actual sama sekali (0/0) bukan beki 0% beneran —
      // itu cuma line yang emang gak ada laporan bulan ini. Jangan dianggap
      // pas lagi nyortir berdasarkan Bekidoritsu (biar gak nutupin line yang
      // beneran rendah performanya).
      if (
        (sortKey === "beki_desc" || sortKey === "beki_asc") &&
        l.output_plan === 0 &&
        l.output_actual === 0
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortKey === "actual") return b.output_actual - a.output_actual;
      if (sortKey === "beki_desc") return b.bekidoritsu - a.bekidoritsu;
      if (sortKey === "beki_asc") return a.bekidoritsu - b.bekidoritsu;
      if (sortKey === "deviasi") return b.deviasi - a.deviasi;
      if (sortKey === "reject") return b.qty_reject - a.qty_reject;
      return a.line_code.localeCompare(b.line_code);
    });

  const SORT_OPTIONS = [
    { value: "line", label: "Line" },
    { value: "actual", label: "Cum Actual" },
    { value: "beki_desc", label: "Beki Tertinggi" },
    { value: "beki_asc", label: "Beki Terendah" },
    { value: "deviasi", label: "Deviasi" },
    { value: "reject", label: "Cum Reject" },
  ];

  // ── Totals across all lines (summary KPI cards) ──
  const totalPlan = filtered.reduce((s, l) => s + l.output_plan, 0);
  const totalActual = filtered.reduce((s, l) => s + l.output_actual, 0);
  const totalReject = filtered.reduce((s, l) => s + l.qty_reject, 0);
  const totalDeviasi = totalPlan - totalActual;
  const totalBekidoritsu =
    totalPlan > 0 ? Math.round((totalActual / totalPlan) * 1000) / 10 : 0;
  const bekiColor = (v) => (v >= 90 ? C.green : v >= 70 ? C.orange : C.red);

  // ── Trend chart data (Plan vs Actual per date, dijumlah dari semua line
  // yang lagi ketampil — dulunya ini halaman terpisah "Breakdown Tren",
  // sekarang digabung ke sini supaya gak perlu buka halaman lain) ──
  const chartData = dates.map((d) => {
    let plan = 0;
    let actual = 0;
    for (const l of filtered) {
      const day = (l.days || []).find((x) => x.date === d);
      if (day) {
        plan += day.plan;
        actual += day.actual;
      }
    }
    return { date: d.slice(5), fullDate: d, Plan: plan, Actual: actual };
  });

  // ── Tanggal yang BENERAN gak ada aktivitas — plan-nya 0 DAN actual-nya 0
  // di semua line (hari libur/gak ada line jalan). Kalau plan-nya ada tapi
  // actual-nya 0 (line harusnya jalan tapi gak ada output), itu bukan "hari
  // kosong" — itu problem stoptime, jangan ditandai merah muda ── */
  const noOutputDates = new Set(
    chartData
      .filter((c) => c.Plan === 0 && c.Actual === 0)
      .map((c) => c.fullDate),
  );

  return (
    <>
      <style>{GLOBAL_STYLE()}</style>
      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          color: C.text,
          fontFamily: "'Segoe UI', Arial, sans-serif",
          padding: "16px 20px",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <button
                onClick={onBack}
                style={{
                  background: "transparent",
                  border: "none",
                  color: C.blue,
                  fontSize: 12,
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {IS_INTERNAL_INSTANCE ? "← Master Hub" : "← Pilih Line"}
              </button>
              <span style={{ color: C.border }}>›</span>
              <span style={{ fontSize: 12, color: C.textDim }}>{tempat}</span>
            </div>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: C.blue,
                margin: 0,
                letterSpacing: 1,
              }}
            >
              BREAKDOWN — {tempat.toUpperCase()}
            </h1>
          </div>
          {lastUpdate && (
            <span style={{ fontSize: 11, color: C.textDim }}>
              <span
                style={{
                  display: "inline-block",
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: C.green,
                  marginRight: 5,
                  animation: "pulse-dot 2s infinite",
                }}
              />
              {lastUpdate.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          )}
        </div>

        {/* ── KPI Cards ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5,1fr)",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <KpiCard label="Cum Output Plan" value={fmt(totalPlan)} unit="pcs" />
          <KpiCard
            label="Cum Output Actual"
            value={fmt(totalActual)}
            unit="pcs"
            color={C.blue}
          />
          <KpiCard
            label="Bekidoritsu"
            value={fmt(totalBekidoritsu, 1)}
            unit="%"
            color={bekiColor(totalBekidoritsu)}
          />
          <KpiCard
            label="Deviasi"
            value={fmt(totalDeviasi)}
            unit="pcs"
            color={totalDeviasi > 0 ? C.red : C.green}
          />
          <KpiCard
            label="Cum Reject"
            value={fmt(totalReject)}
            unit="pcs"
            color={totalReject > 0 ? C.orange : C.textDim}
          />
        </div>

        {/* ── Trend chart (Plan vs Actual per tanggal) ── */}
        {!loading && !error && (
          <div
            style={{
              background: C.panel,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: "16px 16px 6px",
              marginBottom: 14,
            }}
          >
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart
                data={chartData}
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: C.textDim }}
                />
                <YAxis tick={{ fontSize: 11, fill: C.textDim }} />
                <Tooltip
                  contentStyle={{
                    background: C.panelAlt,
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: C.text }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Plan" fill={C.textMut} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Actual" fill={C.blue} radius={[3, 3, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Filter & Month picker bar — ditaro persis di atas header tabel
             (bukan di atas chart) biar nyambung sama tabel yang difilter ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 12,
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "10px 14px",
            flexWrap: "wrap",
          }}
        >
          <input
            type="text"
            placeholder="Search line or model name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              background: C.inputBg,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 12,
              color: C.text,
              width: 200,
              outline: "none",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: C.textDim }}>Sort by:</span>
            {SORT_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setSortKey(value)}
                style={{
                  background: sortKey === value ? C.blue + "22" : "transparent",
                  border: `1px solid ${sortKey === value ? C.blue : C.border}`,
                  color: sortKey === value ? C.blue : C.textDim,
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <span
            style={{
              width: 1,
              height: 20,
              background: C.border,
              marginLeft: "auto",
            }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={goPrevMonth}
              style={{
                background: "transparent",
                border: `1px solid ${C.border}`,
                color: C.textDim,
                borderRadius: 6,
                width: 26,
                height: 26,
                cursor: "pointer",
              }}
            >
              ‹
            </button>
            <input
              type="month"
              value={`${year}-${String(month).padStart(2, "0")}`}
              onChange={onMonthInputChange}
              style={{
                background: C.inputBg,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                padding: "5px 8px",
                fontSize: 12,
                color: C.text,
                outline: "none",
              }}
            />
            <button
              onClick={goNextMonth}
              style={{
                background: "transparent",
                border: `1px solid ${C.border}`,
                color: C.textDim,
                borderRadius: 6,
                width: 26,
                height: 26,
                cursor: "pointer",
              }}
            >
              ›
            </button>
            <span style={{ fontSize: 12, color: C.textDim, marginLeft: 4 }}>
              {MONTH_NAMES[month - 1]} {year}
            </span>
          </div>
          <span style={{ fontSize: 11, color: C.textDim }}>
            {filtered.length} / {lines.length} lines
          </span>
        </div>

        {/* ── Breakdown table (left columns pinned, date columns scroll sideways) ── */}
        {loading ? (
          <p style={{ color: C.textDim, textAlign: "center", paddingTop: 60 }}>
            Loading data...
          </p>
        ) : error ? (
          <p style={{ color: C.red, textAlign: "center", paddingTop: 60 }}>
            Error: {error}
          </p>
        ) : (
          <div
            style={{
              background: C.panel,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <span style={{ fontSize: 11, color: C.textDim, fontWeight: 600 }}>
                Geser Tabel:
              </span>
              <button
                onClick={() => scrollByAmount(-400)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  background: C.blueDim,
                  border: `1px solid ${C.blue}`,
                  color: C.blue,
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                ‹ Kiri
              </button>
              <button
                onClick={() => scrollByAmount(400)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  background: C.blueDim,
                  border: `1px solid ${C.blue}`,
                  color: C.blue,
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Kanan ›
              </button>
              {noOutputDates.size > 0 && (
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginLeft: "auto",
                    fontSize: 11,
                    color: C.textDim,
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: C.redDim,
                      border: `1px solid ${C.red}`,
                    }}
                  />
                  Tanggal tanpa output
                </span>
              )}
            </div>
            <style>{`
              .breakdown-hscroll::-webkit-scrollbar { height: 14px; }
              .breakdown-hscroll::-webkit-scrollbar-track { background: ${C.panelAlt}; }
              .breakdown-hscroll::-webkit-scrollbar-thumb { background: ${C.borderBr}; border-radius: 7px; }
            `}</style>
            <div>
              <div
                ref={scrollRef}
                className="breakdown-hscroll"
                style={{ overflowX: "auto" }}
              >
                <table
                  style={{
                    borderCollapse: "collapse",
                    // ⚠️ WAJIB buat fix bug "bebayang": tanpa tableLayout
                    // "fixed", `width` di tiap <td> cuma "saran" — browser
                    // masih bisa ngelebarin kolom sendiri kalau isinya
                    // panjang, bikin overflow:hidden di atas gak kepakai.
                    // "fixed" bikin lebar kolom BENERAN dipatuhi sesuai
                    // yang didefinisikan di STICKY_COLS.
                    tableLayout: "fixed",
                    // Per-tanggal sekarang cuma 1 kolom (Actual aja, Plan
                    // dibuang) makanya lebar per tanggal turun dari 100px
                    // (2 kolom @50) jadi 70px (1 kolom).
                    width: `${STICKY_TOTAL_WIDTH + dates.length * 70}px`,
                  }}
                >
                  <thead>
                    <tr style={{ background: C.panelAlt }}>
                      {STICKY_COLS.map((col, idx) => (
                        <th
                          key={col.key}
                          style={{
                            ...thStyle(),
                            position: "sticky",
                            left: stickyLeft(idx),
                            zIndex: 3,
                            background: C.panelAlt,
                            width: col.width,
                            minWidth: col.width,
                            borderRight:
                              idx === STICKY_COLS.length - 1
                                ? `2px solid ${C.borderBr}`
                                : `1px solid ${C.border}30`,
                          }}
                        >
                          {col.label}
                        </th>
                      ))}
                      {dates.map((d) => (
                        <th
                          key={d}
                          style={{
                            ...thStyle(),
                            textAlign: "center",
                            borderLeft: `1px solid ${C.border}30`,
                            color: noOutputDates.has(d) ? C.red : C.blue + "aa",
                            background: noOutputDates.has(d)
                              ? C.redDim
                              : C.panelAlt,
                          }}
                        >
                          {new Date(`${d}T00:00:00`).toLocaleDateString(
                            "en-US",
                            { day: "2-digit", month: "short" },
                          )}
                        </th>
                      ))}
                    </tr>
                    {/* Sub-header "Plan/Actual" dihapus — sekarang per
                        tanggal cuma nampilin Actual, jadi cukup 1 baris
                        header (tanggal) aja, gak butuh baris kedua lagi. */}
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td
                          colSpan={STICKY_COLS.length + dates.length}
                          style={{
                            padding: 24,
                            textAlign: "center",
                            color: C.textDim,
                          }}
                        >
                          {search ? "No matching line found" : "No data yet"}
                        </td>
                      </tr>
                    ) : (
                      filtered.map((l, idx) => {
                        const rowBg = idx % 2 === 0 ? C.panel : C.rowAlt;
                        const bekiColorRow = bekiColor(l.bekidoritsu);
                        const byDate = Object.fromEntries(
                          (l.days || []).map((d) => [d.date, d]),
                        );
                        return (
                          <tr
                            key={l.line_code}
                            style={{ borderTop: `1px solid ${C.border}30` }}
                          >
                            <td
                              style={{
                                ...tdStyle(),
                                position: "sticky",
                                left: stickyLeft(0),
                                zIndex: 2,
                                background: rowBg,
                                color: C.blue,
                                fontWeight: 700,
                                width: STICKY_COLS[0].width,
                              }}
                            >
                              {l.line_code}
                            </td>
                            <td
                              style={{
                                ...tdStyle(),
                                position: "sticky",
                                left: stickyLeft(1),
                                zIndex: 2,
                                background: rowBg,
                                color: C.textDim,
                                width: STICKY_COLS[1].width,
                                whiteSpace: "normal",
                              }}
                            >
                              {l.product_name || "—"}
                            </td>
                            <td
                              style={{
                                ...tdStyle(),
                                position: "sticky",
                                left: stickyLeft(2),
                                zIndex: 2,
                                background: rowBg,
                                width: STICKY_COLS[2].width,
                              }}
                            >
                              {fmt(l.output_plan)}
                            </td>
                            <td
                              style={{
                                ...tdStyle(),
                                position: "sticky",
                                left: stickyLeft(3),
                                zIndex: 2,
                                background: rowBg,
                                color: C.text,
                                fontWeight: 600,
                                width: STICKY_COLS[3].width,
                              }}
                            >
                              {fmt(l.output_actual)}
                            </td>
                            <td
                              style={{
                                ...tdStyle(),
                                position: "sticky",
                                left: stickyLeft(4),
                                zIndex: 2,
                                background: rowBg,
                                color: bekiColorRow,
                                fontWeight: 700,
                                width: STICKY_COLS[4].width,
                                borderRight: `2px solid ${C.borderBr}`,
                              }}
                            >
                              {fmt(l.bekidoritsu, 1)}%
                            </td>
                            <td
                              style={{
                                ...tdStyle(),
                                position: "sticky",
                                left: stickyLeft(5),
                                zIndex: 2,
                                background: rowBg,
                                color: l.deviasi > 0 ? C.red : C.green,
                                fontWeight: 600,
                                width: STICKY_COLS[5].width,
                              }}
                            >
                              {fmt(l.deviasi)}
                            </td>
                            <td
                              style={{
                                ...tdStyle(),
                                position: "sticky",
                                left: stickyLeft(6),
                                zIndex: 2,
                                background: rowBg,
                                color: l.qty_reject > 0 ? C.orange : C.textDim,
                                width: STICKY_COLS[6].width,
                                borderRight: `2px solid ${C.borderBr}`,
                              }}
                            >
                              {fmt(l.qty_reject)}
                            </td>
                            {dates.map((d) => {
                              const day = byDate[d];
                              const isNoOutput = noOutputDates.has(d);
                              const cellBg = isNoOutput ? C.redDim : rowBg;
                              // Plan dibuang dari tampilan per-tanggal — cuma
                              // Actual yang ditampilin (1 kolom per tanggal).
                              return (
                                <td
                                  key={d}
                                  style={{
                                    ...tdStyle(),
                                    background: cellBg,
                                    color: C.text,
                                    borderLeft: `1px solid ${C.border}20`,
                                  }}
                                >
                                  {day?.hasData ? fmt(day.actual) : "—"}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
