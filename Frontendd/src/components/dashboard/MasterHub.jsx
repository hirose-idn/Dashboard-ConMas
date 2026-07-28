import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
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
  useThemeMode,
} from "../../config/constants";

const fmt = (n, dec = 0) =>
  n == null
    ? "—"
    : Number(n).toLocaleString("id-ID", { maximumFractionDigits: dec });

// Warna tetap per source — dipakai di tabel, chart, badge, biar mata user
// cepet asosiasiin 1 warna = 1 lokasi di semua bagian halaman.
const SOURCE_COLOR = {
  internal: C.blue,
  sgp: C.green,
  systech: C.purple,
};
const SOURCE_COLOR_FALLBACK = C.orange;

const STATUS_META = {
  ok: { label: "Terhubung", color: C.green },
  inactive: { label: "Belum Dikonfigurasi", color: C.textMut },
  timeout: { label: "Timeout", color: C.orange },
  unreachable: { label: "Tidak Terhubung", color: C.red },
  unauthorized: { label: "API Key Ditolak", color: C.red },
  error: { label: "Error", color: C.red },
};

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

// ─── KPI card kecil, dipakai di baris atas ──────────────────────
function KpiCard({ label, value, unit, color }) {
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "16px 18px",
        flex: 1,
        minWidth: 160,
      }}
    >
      <p
        style={{
          fontSize: 11,
          color: C.textDim,
          letterSpacing: 0.5,
          marginBottom: 6,
        }}
      >
        {label.toUpperCase()}
      </p>
      <p style={{ fontSize: 26, fontWeight: 800, color: color || C.text }}>
        {value}{" "}
        <span style={{ fontSize: 14, fontWeight: 500, color: C.textDim }}>
          {unit}
        </span>
      </p>
    </div>
  );
}

// ─── Tabel ringkasan per lokasi — dipakai dua kali (bulanan & hari ini) ──
function RingkasanTable({ title, sources, onRowClick, clickable }) {
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 20,
        marginBottom: 24,
        overflowX: "auto",
      }}
    >
      <p
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: C.text,
          marginBottom: 14,
        }}
      >
        {title}
      </p>
      <table
        style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
      >
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {[
              "Lokasi",
              "Status Koneksi",
              "Line Aktif",
              "Output Plan",
              "Output Actual",
              "Bekidoritsu",
              "Jumlah Reject",
              "Total Stoptime",
              "OEE",
            ].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  color: C.textDim,
                  fontWeight: 600,
                  fontSize: 11,
                  letterSpacing: 0.5,
                }}
              >
                {h.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => {
            const meta = STATUS_META[s.status] || STATUS_META.error;
            const pct =
              s.data && s.data.output_plan > 0
                ? (s.data.output_actual / s.data.output_plan) * 100
                : null;
            const openable = clickable && s.status === "ok" && s.data;
            return (
              <tr
                key={s.source}
                onClick={openable ? (e) => onRowClick(s, e) : undefined}
                style={{
                  borderBottom: `1px solid ${C.border}`,
                  cursor: openable ? "pointer" : "default",
                }}
              >
                <td style={{ padding: "10px", color: C.text, fontWeight: 700 }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background:
                        SOURCE_COLOR[s.source] || SOURCE_COLOR_FALLBACK,
                      marginRight: 8,
                    }}
                  />
                  {s.label}
                </td>
                <td
                  style={{
                    padding: "10px",
                    color: meta.color,
                    fontWeight: 600,
                  }}
                >
                  {meta.label}
                </td>
                <td style={{ padding: "10px", color: C.text }}>
                  {s.data
                    ? `${s.data.lines_running}/${s.data.lines_total}`
                    : "—"}
                </td>
                <td style={{ padding: "10px", color: C.text }}>
                  {s.data ? fmt(s.data.output_plan) : "—"}
                </td>
                <td style={{ padding: "10px", color: C.text }}>
                  {s.data ? fmt(s.data.output_actual) : "—"}
                </td>
                <td
                  style={{
                    padding: "10px",
                    color: pct != null && pct >= 100 ? C.green : C.orange,
                  }}
                >
                  {pct != null ? `${fmt(pct, 1)}%` : "—"}
                </td>
                <td style={{ padding: "10px", color: C.text }}>
                  {s.data ? fmt(s.data.qty_reject) : "—"}
                </td>
                <td style={{ padding: "10px", color: C.text }}>
                  {s.data ? `${fmt(s.data.stoptime_total)} m` : "—"}
                </td>
                <td style={{ padding: "10px", color: C.text }}>
                  {s.data ? `${fmt(s.data.avg_oee, 1)}%` : "—"}
                </td>
              </tr>
            );
          })}
          {sources.length === 0 && (
            <tr>
              <td
                colSpan={9}
                style={{ padding: "14px 10px", color: C.textDim, fontSize: 12 }}
              >
                Belum ada data lokasi.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Popup kecil pas row lokasi diklik — user pilih mau buka halaman apa ──
function RowMenu({ menu, onChoose, onClose }) {
  if (!menu) return null;

  // Clamp posisi biar popup-nya gak kepotong di tepi layar.
  const MENU_W = 220;
  const left = Math.min(menu.x, window.innerWidth - MENU_W - 12);
  const top = Math.min(menu.y, window.innerHeight - 180);

  const itemStyle = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    textAlign: "left",
    background: "transparent",
    border: "none",
    color: C.text,
    fontSize: 13,
    fontWeight: 600,
    padding: "10px 14px",
    cursor: "pointer",
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 40 }}
      />
      <div
        style={{
          position: "fixed",
          top,
          left,
          width: MENU_W,
          zIndex: 50,
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "9px 14px",
            fontSize: 11,
            fontWeight: 700,
            color: C.textDim,
            letterSpacing: 0.4,
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          {menu.label.toUpperCase()} — BUKA HALAMAN
        </div>
        <button
          style={itemStyle}
          onClick={() => onChoose("master")}
          onMouseDown={(e) => e.preventDefault()}
        >
          📊 Dashboard Utama
        </button>
        <button
          style={{ ...itemStyle, borderTop: `1px solid ${C.border}` }}
          onClick={() => onChoose("breakdown")}
          onMouseDown={(e) => e.preventDefault()}
        >
          📋 Breakdown per Line
        </button>
      </div>
    </>
  );
}

export default function MasterHub({ onOpenTempat, onGoToPicker, onOpenExecutive }) {
  const [themeMode, toggleTheme] = useThemeMode();
  const [rowMenu, setRowMenu] = useState(null); // { source, label, x, y }
  const [syncing, setSyncing] = useState(false);

  // Tombol "Sync Line" — panggil POST /api/lines/sync, yang nyari line
  // baru di DB (belum terdaftar di data/lines.json) terus langsung
  // nambahin ke registry. Endpoint-nya udah ada (routes/lines.js), ini
  // cuma nyambungin ke tombol di UI.
  const handleSyncLines = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${BASE_URL}/api/lines/sync?days=90`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        window.alert(json.message || "Sync selesai.");
      } else {
        window.alert(`Sync gagal: ${json.message || "unknown error"}`);
      }
    } catch (err) {
      window.alert(`Sync gagal: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }, []);

  const handleRowClick = useCallback((s, e) => {
    e.stopPropagation();
    setRowMenu({
      source: s.source,
      label: s.label,
      x: e.clientX,
      y: e.clientY,
    });
  }, []);

  const closeRowMenu = useCallback(() => setRowMenu(null), []);

  const chooseDestination = useCallback(
    (target) => {
      if (rowMenu) onOpenTempat(rowMenu.source, target);
      setRowMenu(null);
    },
    [rowMenu, onOpenTempat],
  );

  const [monthlyTotals, setMonthlyTotals] = useState(null);
  const [monthlySources, setMonthlySources] = useState([]);
  const [todayTotals, setTodayTotals] = useState(null);
  const [todaySources, setTodaySources] = useState([]);
  const [trendDays, setTrendDays] = useState([]);
  const [loading, setLoading] = useState(true);

  // Month picker — default bulan berjalan WIB, tapi bisa digeser ke bulan
  // sebelumnya (gak boleh maju lewat bulan berjalan).
  const nowWib = new Date(Date.now() + 7 * 3600 * 1000);
  const [periodYear, setPeriodYear] = useState(nowWib.getUTCFullYear());
  const [periodMonth, setPeriodMonth] = useState(nowWib.getUTCMonth() + 1);
  const periodYearRef = useRef(periodYear);
  const periodMonthRef = useRef(periodMonth);

  const periodLabel = `${MONTH_NAMES[periodMonth - 1]} ${periodYear}`;
  const isCurrentMonth =
    periodYear === nowWib.getUTCFullYear() &&
    periodMonth === nowWib.getUTCMonth() + 1;

  const fetchMonthlySummary = useCallback(async () => {
    try {
      const res = await fetch(
        `${BASE_URL}/api/master/monthly-summary?year=${periodYearRef.current}&month=${periodMonthRef.current}`,
      );
      const json = await res.json();
      setMonthlyTotals(json.totals || null);
      setMonthlySources(json.sources || []);
    } catch {
      // Diemin — badge/KPI cuma gak keupdate, bukan crash seluruh halaman.
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTodaySummary = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/master/summary`);
      const json = await res.json();
      setTodayTotals(json.totals || null);
      setTodaySources(json.sources || []);
    } catch {
      // sama — tabel cuma kosong, bukan crash
    }
  }, []);

  const fetchTrend = useCallback(async () => {
    try {
      const res = await fetch(
        `${BASE_URL}/api/master/monthly-trend?year=${periodYearRef.current}&month=${periodMonthRef.current}`,
      );
      const json = await res.json();
      setTrendDays(json.days || []);
    } catch {
      // sama — chart cuma kosong, bukan crash
    }
  }, []);

  const fetchAll = useCallback(() => {
    fetchMonthlySummary();
    fetchTodaySummary();
    fetchTrend();
  }, [fetchMonthlySummary, fetchTodaySummary, fetchTrend]);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchAll]);

  const handleMonthChange = useCallback(
    (year, month) => {
      periodYearRef.current = year;
      periodMonthRef.current = month;
      setPeriodYear(year);
      setPeriodMonth(month);
      fetchMonthlySummary();
      fetchTrend();
    },
    [fetchMonthlySummary, fetchTrend],
  );

  const goPrevMonth = () => {
    const d = new Date(periodYear, periodMonth - 2, 1);
    handleMonthChange(d.getFullYear(), d.getMonth() + 1);
  };
  const goNextMonth = () => {
    if (isCurrentMonth) return;
    const d = new Date(periodYear, periodMonth, 1);
    handleMonthChange(d.getFullYear(), d.getMonth() + 1);
  };

  const bekidoritsu =
    monthlyTotals && monthlyTotals.output_plan > 0
      ? (monthlyTotals.output_actual / monthlyTotals.output_plan) * 100
      : 0;

  const bekidoritsuToday =
    todayTotals && todayTotals.output_plan > 0
      ? (todayTotals.output_actual / todayTotals.output_plan) * 100
      : 0;

  // Data buat 2 bar chart tambahan — dari ringkasan bulanan, biar konsisten
  // sama KPI & tabel di atasnya (bukan cuma snapshot hari ini). Bekidoritsu
  // dihitung per lokasi (Actual/Plan × 100), BUKAN OEE, biar konsisten sama
  // metrik yang dipakai di seluruh dashboard.
  const barCompareData = monthlySources
    .filter((s) => s.status === "ok" && s.data)
    .map((s) => ({
      name: s.label,
      Actual: s.data.output_actual,
      Plan: s.data.output_plan,
      Bekidoritsu:
        s.data.output_plan > 0
          ? Math.round((s.data.output_actual / s.data.output_plan) * 1000) / 10
          : 0,
      color: SOURCE_COLOR[s.source] || SOURCE_COLOR_FALLBACK,
    }));

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        padding: 24,
        fontFamily: "sans-serif",
      }}
    >
      <style>{GLOBAL_STYLE()}</style>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 900,
              color: C.blue,
              letterSpacing: 0.5,
            }}
          >
            MASTER DASHBOARD UTAMA
          </h1>
          <p style={{ fontSize: 13, color: C.textDim }}>
            Ringkasan produksi gabungan Hirose Internal, Subcont SGP, dan
            Subcont Systech — klik salah satu lokasi pada tabel untuk melihat
            detail
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          {onOpenExecutive && (
            <button
              onClick={onOpenExecutive}
              style={{
                background: C.blue,
                border: "none",
                color: "#fff",
                borderRadius: 7,
                padding: "8px 16px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Buka Executive Dashboard →
            </button>
          )}
          <button
            onClick={handleSyncLines}
            disabled={syncing}
            title="Cari & daftarkan line baru dari database"
            style={{
              background: "transparent",
              border: `1px solid ${C.border}`,
              color: C.textDim,
              borderRadius: 7,
              padding: "6px 12px",
              fontSize: 12,
              cursor: syncing ? "default" : "pointer",
              opacity: syncing ? 0.6 : 1,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {syncing ? "⏳ Syncing..." : "🔄 Sync Line"}
          </button>
          <button
            onClick={toggleTheme}
            title={
              themeMode === "light"
                ? "Switch to dark theme"
                : "Switch to light theme"
            }
            style={{
              background: "transparent",
              border: `1px solid ${C.border}`,
              color: C.textDim,
              borderRadius: 7,
              padding: "6px 12px",
              fontSize: 12,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {themeMode === "light" ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>
      </div>

      {/* ── KPI gabungan 3 lokasi — akumulasi bulan terpilih ──── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
            Kinerja Produksi Bulanan
          </p>
          <p style={{ fontSize: 12, color: C.textDim }}>
            (akumulasi seluruh lokasi)
          </p>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "3px 6px",
          }}
        >
          <button
            onClick={goPrevMonth}
            style={{
              background: "transparent",
              border: "none",
              color: C.textDim,
              borderRadius: 5,
              padding: "3px 8px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            ‹
          </button>
          <span
            style={{
              fontSize: 12,
              color: C.text,
              fontWeight: 600,
              minWidth: 110,
              textAlign: "center",
            }}
          >
            {periodLabel}
          </span>
          <button
            onClick={goNextMonth}
            disabled={isCurrentMonth}
            style={{
              background: "transparent",
              border: "none",
              color: isCurrentMonth ? C.textMut : C.textDim,
              borderRadius: 5,
              padding: "3px 8px",
              fontSize: 13,
              cursor: isCurrentMonth ? "default" : "pointer",
            }}
          >
            ›
          </button>
        </div>
      </div>
      <div
        style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}
      >
        <KpiCard
          label="Output Plan"
          value={fmt(monthlyTotals?.output_plan)}
          unit="pcs"
          color={C.text}
        />
        <KpiCard
          label="Output Actual"
          value={fmt(monthlyTotals?.output_actual)}
          unit="pcs"
          color={C.blue}
        />
        <KpiCard
          label="Bekidoritsu"
          value={fmt(bekidoritsu, 1)}
          unit="%"
          color={bekidoritsu >= 100 ? C.green : C.orange}
        />
        <KpiCard
          label="Deviasi"
          value={fmt(monthlyTotals?.deviasi)}
          unit="pcs"
          color={monthlyTotals?.deviasi > 0 ? C.red : C.green}
        />
        <KpiCard
          label="Total Stoptime"
          value={fmt(monthlyTotals?.stoptime_total)}
          unit="menit"
          color={C.red}
        />
      </div>

      {/* ── Ringkasan Bulanan per Lokasi (menggantikan grid card lama) ── */}
      <RingkasanTable
        title={`Ringkasan Kinerja Bulanan per Lokasi — ${periodLabel}`}
        sources={monthlySources}
        onRowClick={handleRowClick}
        clickable
      />
      {!loading && monthlySources.length === 0 && (
        <p
          style={{
            color: C.textDim,
            fontSize: 13,
            marginTop: -16,
            marginBottom: 24,
          }}
        >
          Belum ada data lokasi.
        </p>
      )}

      {/* ── KPI gabungan 3 lokasi — akumulasi HARI INI (sebelumnya cuma ada
          di tabel bawah tanpa total, sekarang total-nya ikut ditampilkan
          sama kayak yang bulanan) ── */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
          Kinerja Produksi Hari Ini
        </p>
        <p style={{ fontSize: 12, color: C.textDim }}>
          (akumulasi seluruh lokasi)
        </p>
      </div>
      <div
        style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}
      >
        <KpiCard
          label="Output Plan"
          value={fmt(todayTotals?.output_plan)}
          unit="pcs"
          color={C.text}
        />
        <KpiCard
          label="Output Actual"
          value={fmt(todayTotals?.output_actual)}
          unit="pcs"
          color={C.blue}
        />
        <KpiCard
          label="Bekidoritsu"
          value={fmt(bekidoritsuToday, 1)}
          unit="%"
          color={bekidoritsuToday >= 100 ? C.green : C.orange}
        />
        <KpiCard
          label="Deviasi"
          value={fmt(todayTotals?.deviasi)}
          unit="pcs"
          color={todayTotals?.deviasi > 0 ? C.red : C.green}
        />
        <KpiCard
          label="Total Stoptime"
          value={fmt(todayTotals?.stoptime_total)}
          unit="menit"
          color={C.red}
        />
      </div>

      {/* ── Ringkasan Hari Ini per Lokasi ──────────────────────── */}
      <RingkasanTable
        title="Ringkasan Kinerja Hari Ini per Lokasi"
        sources={todaySources}
        onRowClick={handleRowClick}
        clickable
      />

      <RowMenu
        menu={rowMenu}
        onChoose={chooseDestination}
        onClose={closeRowMenu}
      />

      {/* ── Chart trend output harian per lokasi, 1 bulan ────────── */}
      <div
        style={{
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <p
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: C.text,
            marginBottom: 14,
          }}
        >
          Tren Output Harian per Lokasi — {periodLabel}
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart
            data={trendDays}
            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="day" stroke={C.textDim} fontSize={11} />
            <YAxis stroke={C.textDim} fontSize={11} />
            <Tooltip
              contentStyle={{
                background: C.panelAlt,
                border: `1px solid ${C.border}`,
                fontSize: 12,
              }}
              labelStyle={{ color: C.text }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="internal_actual"
              name="Internal"
              stroke={SOURCE_COLOR.internal}
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="sgp_actual"
              name="SGP"
              stroke={SOURCE_COLOR.sgp}
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="systech_actual"
              name="Systech"
              stroke={SOURCE_COLOR.systech}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Chart tambahan: Actual vs Plan, dan Bekidoritsu, per lokasi ──── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
        }}
      >
        <div
          style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 20,
          }}
        >
          <p
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: C.text,
              marginBottom: 14,
            }}
          >
            Output Actual vs Plan per Lokasi — {periodLabel}
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barCompareData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="name" stroke={C.textDim} fontSize={11} />
              <YAxis stroke={C.textDim} fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: C.panelAlt,
                  border: `1px solid ${C.border}`,
                  fontSize: 12,
                }}
                labelStyle={{ color: C.text }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Plan" fill={C.textMut} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Actual" fill={C.blue} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div
          style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 20,
          }}
        >
          <p
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: C.text,
              marginBottom: 14,
            }}
          >
            Bekidoritsu per Lokasi — {periodLabel}
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barCompareData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="name" stroke={C.textDim} fontSize={11} />
              <YAxis stroke={C.textDim} fontSize={11} unit="%" />
              <Tooltip
                contentStyle={{
                  background: C.panelAlt,
                  border: `1px solid ${C.border}`,
                  fontSize: 12,
                }}
                labelStyle={{ color: C.text }}
              />
              <Bar dataKey="Bekidoritsu" fill={C.green} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
