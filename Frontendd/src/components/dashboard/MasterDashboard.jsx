import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  C,
  GLOBAL_STYLE,
  BASE_URL,
  REFRESH_MS,
  useThemeMode,
  IS_INTERNAL_INSTANCE,
  TEMPAT_LABEL,
  getConmasManagerUrl,
} from "../../config/constants";
import {
  fmt,
  StoptimeBar,
  SourceStatusBar,
  LineRow,
  td,
  thStyle,
  TopLowAchievement,
  TopReject,
  TopStoptime,
  DailyTrendChart,
  LineActionMenu,
} from "./MasterDashboardWidgets";

//  MASTER DASHBOARD
export default function MasterDashboard({ onSelect, onBack, onBreakdown, tempat }) {
  // Dibuka dari Master Hub buat lokasi SGP/Systech (bukan Internal browsing
  // dirinya sendiri) -> semua fetch di bawah harus lewat proxy /api/master/
  // dashboard/* (Master gak punya akses ke DB subcont), BUKAN /api/dashboard/
  // lokal. Sama pola persis kayak isRemoteViaMaster di BreakdownTempat.jsx.
  const isRemoteViaMaster =
    IS_INTERNAL_INSTANCE && tempat && tempat.toLowerCase() !== "internal";
  const remoteSourceKey = tempat ? tempat.toLowerCase() : null;
  // Dulu Master Dashboard Utama SELALU MAKSA tema jadi light pas mount
  // (alasan lama: nyaman buat manajemen/orang tua), lalu balik ke preferensi
  // asal pas keluar. Sekarang itu DIHAPUS — semua halaman (Hub, Breakdown
  // per Line, Breakdown Tren, Master Dashboard, LinePicker) ngikut SATU
  // setting tema global yang sama persis (toggle di manapun langsung ke
  // semua halaman itu), KECUALI PCBDashboard yang sengaja dipaksa dark terus
  // (dipakai di TV/kiosk lantai produksi, lihat catatan di PCBDashboard.jsx).
  const [themeMode, toggleTheme] = useThemeMode();

  const [byTempat, setByTempat] = useState([]);
  const [allLines, setAllLines] = useState([]);
  const [dailyDays, setDailyDays] = useState([]);
  const [monthlySummary, setMonthlySummary] = useState(null);
  const [sourceStatus, setSourceStatus] = useState([]); // Internal/SGP/Systech dari /api/master/summary
  const [lineSearch, setLineSearch] = useState("");
  const [lineFilterStatus, setLineFilterStatus] = useState("all"); // all | running | not_running | problem
  const [lineSort, setLineSort] = useState("default"); // default | output_desc | output_asc | ach_desc | ach_asc | oee_desc | oee_asc
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const timerRef = useRef(null);
  // Month picker — default bulan berjalan WIB
  const nowWib = new Date(Date.now() + 7 * 3600 * 1000);
  const [trendYear, setTrendYear] = useState(nowWib.getUTCFullYear());
  const [trendMonth, setTrendMonth] = useState(nowWib.getUTCMonth() + 1);

  const trendYearRef = useRef(nowWib.getUTCFullYear());
  const trendMonthRef = useRef(nowWib.getUTCMonth() + 1);

  // Ranking Line — filter HARIAN (terpisah dari picker bulanan di atas,
  // dulu ranking ikutan trendYear/trendMonth, sekarang bisa geser per hari)
  const wibDateStr = (d) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const todayWibStr = wibDateStr(nowWib);
  const [rankingDate, setRankingDate] = useState(todayWibStr);
  const [rankingLines, setRankingLines] = useState([]);
  const [rankingLoading, setRankingLoading] = useState(false);
  // Popup "Buka PCB" vs "Dashboard per Line" pas klik row line di tabel
  // Ranking Line di bawah. null = gak lagi ada popup kebuka.
  const [lineChoice, setLineChoice] = useState(null);

  // Handler yang sama dipakai buat 3 tabel "Top" (Top Output Terendah/
  // Top Reject/Top Stoptime) — baris di situ juga ambil dari rankingLines
  // (sumber sama persis kayak tabel Ranking Line utama), jadi remoteKey/
  // backdate-nya ngikut logic yang sama.
  const handleTopRowClick = useCallback(
    (l, e) => {
      const remoteKey = isRemoteViaMaster ? remoteSourceKey : undefined;
      setLineChoice({
        code: l.line_code,
        remoteKey,
        backdate:
          !remoteKey && rankingDate !== todayWibStr ? rankingDate : undefined,
        repTopId: l.rep_top_id ?? null,
        tempat: l.tempat,
        x: e.clientX,
        y: e.clientY,
      });
    },
    [isRemoteViaMaster, remoteSourceKey, rankingDate, todayWibStr],
  );

  const fetchRanking = useCallback(
    async (date) => {
      setRankingLoading(true);
      try {
        const url = isRemoteViaMaster
          ? `${BASE_URL}/api/master/dashboard/summary-all-daily?source=${remoteSourceKey}&date=${date}`
          : `${BASE_URL}/api/dashboard/summary-all-daily?date=${date}`;
        const res = await fetch(url);
        const json = await res.json();
        if (isRemoteViaMaster) {
          if (json.status === "ok") setRankingLines(json.data || []);
        } else if (json.success) {
          setRankingLines(json.data || []);
        }
      } catch {
        // Diemin — panel ranking cuma gak keupdate, dashboard tetap jalan.
      } finally {
        setRankingLoading(false);
      }
    },
    [isRemoteViaMaster, remoteSourceKey],
  );

  useEffect(() => {
    fetchRanking(rankingDate);
  }, [rankingDate, fetchRanking]);

  const shiftRankingDate = useCallback((deltaDays) => {
    setRankingDate((prev) => {
      const d = new Date(`${prev}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + deltaDays);
      const next = wibDateStr(d);
      // Gak boleh maju lewat hari ini (WIB)
      const w = new Date(Date.now() + 7 * 3600 * 1000);
      const today = wibDateStr(w);
      return next > today ? prev : next;
    });
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const y = trendYearRef.current;
      const m = trendMonthRef.current;
      const urls = isRemoteViaMaster
        ? [
            `${BASE_URL}/api/master/dashboard/summary-by-tempat?source=${remoteSourceKey}`,
            `${BASE_URL}/api/master/dashboard/summary-all?source=${remoteSourceKey}`,
            `${BASE_URL}/api/master/dashboard/daily-trend?source=${remoteSourceKey}&year=${y}&month=${m}`,
            `${BASE_URL}/api/master/dashboard/monthly-summary?source=${remoteSourceKey}&year=${y}&month=${m}`,
          ]
        : [
            `${BASE_URL}/api/dashboard/summary-by-tempat`,
            `${BASE_URL}/api/dashboard/summary-all`,
            `${BASE_URL}/api/dashboard/daily-trend?year=${y}&month=${m}`,
            `${BASE_URL}/api/dashboard/monthly-summary?year=${y}&month=${m}`,
          ];
      const [r1, r2, r3, r4] = await Promise.all(urls.map((u) => fetch(u)));
      const j1 = await r1.json();
      const j2 = await r2.json();
      const j3 = await r3.json();
      const j4 = await r4.json();

      // Bentuk response proxy beda dikit dari endpoint lokal — lihat
      // routes/master.js: { source, label, status, data } vs lokal
      // { success, data }. Lihat juga BreakdownTempat.jsx isRemoteViaMaster.
      if (isRemoteViaMaster) {
        if (j1.status === "ok") setByTempat(j1.data || []);
        if (j2.status === "ok") setAllLines(j2.data || []);
        if (j3.status === "ok") setDailyDays(j3.data || []);
        if (j4.status === "ok") setMonthlySummary(j4.data || null);
        const anyFailed = [j1, j2, j3, j4].some((j) => j.status !== "ok");
        setError(anyFailed ? (j1.message || j2.message || j3.message || j4.message || "Sebagian data gagal diambil dari subcont") : null);
      } else {
        if (j1.success) setByTempat(j1.data || []);
        if (j2.success) setAllLines(j2.data || []);
        if (j3.success) setDailyDays(j3.data || []);
        if (j4.success) setMonthlySummary(j4.data || null);
        setError(null);
      }
      setLastUpdate(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isRemoteViaMaster, remoteSourceKey]);

  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [fetchData]);

  // Fetch status per-source (Internal/SGP/Systech) TERPISAH dari fetchData
  // di atas — sengaja gak masuk try/catch yang sama, biar SGP/Systech lagi
  // down/belum dikonfigurasi TIDAK bikin seluruh dashboard nge-blank
  // (lihat state `error` di atas, itu punya fetchData sendiri).
  //
  // ⚠️ Bar ini CUMA masuk akal buat Internal. /api/master/summary ada di
  // SEMUA instance (route-nya gak digating), tapi entry "internal" di
  // config/sources.js SELALU dilabel "Hirose Internal" gak peduli instance
  // fisiknya SGP/Systech — jadi kalau dipanggil dari Systech, badge yang
  // nongol tetep "Hirose Internal" (padahal itu data lokal Systech sendiri)
  // + SGP/Systech "Belum Dikonfigurasi" (karena env SGP_API_URL dkk emang
  // sengaja kosong di instance subcont). Itu yang bikin bingung di
  // screenshot — makanya di-skip total buat non-internal.
  const fetchSourceStatus = useCallback(async () => {
    if (!IS_INTERNAL_INSTANCE) return;
    try {
      const res = await fetch(`${BASE_URL}/api/master/summary`);
      const json = await res.json();
      setSourceStatus(json.sources || []);
    } catch {
      // Endpoint /api/master belum ada / server lama — diemin aja,
      // badge-nya cuma gak muncul, dashboard tetap jalan normal.
    }
  }, []);

  useEffect(() => {
    if (!IS_INTERNAL_INSTANCE) return;
    fetchSourceStatus();
    const id = setInterval(fetchSourceStatus, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchSourceStatus]);

  // ── Agregasi company-level (summary cards) ──
  // PENTING: dihitung dari `rankingLines` (hasil /summary-all-daily?date=...),
  // BUKAN dari `byTempat` (yang selalu nunjukin shift berjalan/hari ini dan
  // gak pernah di-refetch pas tanggal ranking digeser). Sebelumnya card
  // "Total Output / Bekidoritsu / Overall OEE / Line Aktif" gak ikut
  // berubah pas user geser filter tanggal — sekarang ikut.
  const companyPlan = rankingLines.reduce(
    (s, l) => s + (l.output_plan || 0),
    0,
  );
  const companyActual = rankingLines.reduce(
    (s, l) => s + (l.output_actual || 0),
    0,
  );
  const companyPct =
    companyPlan > 0 ? Math.round((companyActual / companyPlan) * 100) : 0;
  const rankingLinesWithData = rankingLines.filter((l) => l.has_data);
  const companyOEE =
    rankingLinesWithData.length > 0
      ? Math.round(
        rankingLinesWithData.reduce((s, l) => s + (l.oee || 0), 0) /
        rankingLinesWithData.length,
      )
      : 0;
  // Ketat pake status "running" doang — line yang "Menunggu Data" (belum
  // confirmed jalan, tapi juga belum confirmed mati) SENGAJA gak dihitung
  // Running di sini, biar angka "X/Y Running" gak menyesatkan.
  const companyRunning = rankingLines.filter(
    (l) => (l.line_status || (l.line_not_running ? "not_running" : "running")) === "running",
  ).length;
  const companyTotal = rankingLines.length;

  // ── Agregasi stoptime 5M dari allLines ──
  const stoptimeTotals = allLines.reduce(
    (acc, l) => {
      acc.stoptime_machine += l.stoptime_machine || 0;
      acc.stoptime_man += l.stoptime_man || 0;
      acc.stoptime_material += l.stoptime_material || 0;
      acc.stoptime_method += l.stoptime_method || 0;
      acc.stoptime_other += l.stoptime_other || 0;
      return acc;
    },
    {
      stoptime_machine: 0,
      stoptime_man: 0,
      stoptime_material: 0,
      stoptime_method: 0,
      stoptime_other: 0,
    },
  );

  const handleMonthChange = useCallback(
    (year, month) => {
      trendYearRef.current = year;
      trendMonthRef.current = month;
      setTrendYear(year);
      setTrendMonth(month);
      fetchData();
    },
    [fetchData],
  );

  const pctColor =
    companyPct >= 90 ? C.green : companyPct >= 70 ? C.orange : C.red;
  const oeeColor =
    companyOEE >= 85 ? C.green : companyOEE >= 70 ? C.orange : C.red;
  const lineStatusColor =
    companyRunning === companyTotal
      ? C.green
      : companyRunning > 0
        ? C.orange
        : C.red;

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
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
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
                {/* Internal: onBack = goToHub, balik ke Master Hub.
                    Subcont (SGP/Systech): onBack = goToPicker (lihat
                    App.jsx) — gak ada Master Hub, jadi labelnya "Pilih
                    Line", bukan "Master Hub". */}
                {IS_INTERNAL_INSTANCE ? "← Master Hub" : "← Pilih Line"}
              </button>
              <span style={{ color: C.border }}>›</span>
              <span style={{ fontSize: 12, color: C.textDim }}>
                {isRemoteViaMaster
                  ? remoteSourceKey
                  : IS_INTERNAL_INSTANCE
                    ? "internal"
                    : TEMPAT_LABEL}
              </span>
            </div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: C.blue,
                margin: 0,
                letterSpacing: 1,
              }}
            >
              MASTER DASHBOARD{isRemoteViaMaster ? ` — ${tempat.toUpperCase()}` : ""}
            </h1>
            <p style={{ fontSize: 12, color: C.textDim, marginTop: 3 }}>
              {isRemoteViaMaster
                ? `Real-Time Production · ${tempat} (via Master Hub)`
                : IS_INTERNAL_INSTANCE
                  ? "Real-Time Production · all locations"
                  : `Real-Time Production · ${TEMPAT_LABEL}`}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Subcont-only: loncat ke Breakdown per Line tempat ini.
                Internal udah punya jalur sendiri lewat Master Hub, jadi
                tombol ini gak perlu dobel di sana. */}
            {!IS_INTERNAL_INSTANCE && onBreakdown && (
              <button
                onClick={() => onBreakdown(TEMPAT_LABEL)}
                style={{
                  background: "transparent",
                  border: `1px solid ${C.borderBr}`,
                  color: C.blue,
                  borderRadius: 7,
                  padding: "6px 12px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                📋 Breakdown per Line →
              </button>
            )}
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
                Updated:{" "}
                {lastUpdate.toLocaleTimeString("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            )}
            <button
              onClick={toggleTheme}
              title={
                themeMode === "light"
                  ? "Switch to dark mode"
                  : "Switch to light mode"
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

        {/* Bar status 3 lokasi ini gak relevan pas lagi liat Dashboard Utama
            SATU lokasi doang (dibuka lewat Hub buat SGP/Systech) — cuma
            ditampilin pas beneran di Master Dashboard Utama gabungan. */}
        {IS_INTERNAL_INSTANCE && !isRemoteViaMaster && (
          <SourceStatusBar sources={sourceStatus} loading={loading} />
        )}

        {loading ? (
          <p style={{ color: C.textDim, textAlign: "center", paddingTop: 60 }}>
            Memuat data...
          </p>
        ) : error ? (
          <p style={{ color: C.red, textAlign: "center", paddingTop: 60 }}>
            Error: {error}
          </p>
        ) : (
          <>
            {/* ── 1. KPI Bulanan ── */}
            <div
              style={{
                background: C.panel,
                border: `1px solid ${C.blue}55`,
                borderRadius: 10,
                padding: 18,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 14,
                }}
              >
                <p style={{ fontSize: 14, fontWeight: 800, color: C.text }}>
                  KPI Bulanan
                </p>
                <span style={{ fontSize: 12, color: C.textDim }}>
                  {String(trendMonth).padStart(2, "0")}/{trendYear}
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(5,1fr)",
                  gap: 14,
                }}
              >
                {[
                  {
                    label: "Output Actual",
                    value: fmt(monthlySummary?.output_actual),
                    unit: "pcs",
                    color: C.blue,
                  },
                  {
                    label: "Output Plan",
                    value: fmt(monthlySummary?.output_plan),
                    unit: "pcs",
                    color: C.text,
                  },
                  {
                    label: "Total Qty Reject",
                    value: fmt(monthlySummary?.qty_reject),
                    unit: "pcs",
                    color: C.orange,
                  },
                  {
                    label: "Total Reject PPM",
                    value: fmt(monthlySummary?.reject_ppm),
                    unit: "ppm",
                    color: C.yellow,
                  },
                  {
                    label: "Total Stop Time",
                    value: fmt(monthlySummary?.stoptime_total),
                    unit: "menit",
                    color: C.red,
                  },
                ].map(({ label, value, unit, color }) => (
                  <div
                    key={label}
                    style={{
                      background: C.panelAlt,
                      border: `1px solid ${C.border}`,
                      borderRadius: 10,
                      padding: "16px 18px",
                    }}
                  >
                    <p
                      style={{
                        fontSize: 12,
                        color: C.textDim,
                        marginBottom: 8,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        fontWeight: 600,
                      }}
                    >
                      {label}
                    </p>
                    <p
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 5,
                      }}
                    >
                      <span style={{ fontSize: 28, fontWeight: 800, color }}>
                        {value}
                      </span>
                      <span
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          color: C.textDim,
                        }}
                      >
                        {unit}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── 2. Trend Output + Breakdown 4M (Bulanan di atas, Harian di bawah) ── */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.5fr 1fr",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  background: C.panel,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: 14,
                }}
              >
                {/* Header row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <p style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                    Trend Output Harian
                  </p>
                </div>
                {/* Month picker + legend */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    {/* Prev month */}
                    <button
                      onClick={() => {
                        const d = new Date(trendYear, trendMonth - 2, 1);
                        handleMonthChange(d.getFullYear(), d.getMonth() + 1);
                      }}
                      style={{
                        background: "transparent",
                        border: `1px solid ${C.border}`,
                        color: C.textDim,
                        borderRadius: 5,
                        padding: "2px 8px",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      ‹
                    </button>
                    {/* Label bulan */}
                    <span
                      style={{
                        fontSize: 12,
                        color: C.text,
                        fontWeight: 600,
                        minWidth: 80,
                        textAlign: "center",
                      }}
                    >
                      {new Date(
                        trendYear,
                        trendMonth - 1,
                        1,
                      ).toLocaleDateString("id-ID", {
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                    {/* Next month — disable kalau udah bulan ini */}
                    {(() => {
                      const wib2 = new Date(Date.now() + 7 * 3600 * 1000);
                      const isCurrentMonth =
                        trendYear === wib2.getUTCFullYear() &&
                        trendMonth === wib2.getUTCMonth() + 1;
                      return (
                        <button
                          onClick={() => {
                            if (isCurrentMonth) return;
                            const d = new Date(trendYear, trendMonth, 1);
                            handleMonthChange(
                              d.getFullYear(),
                              d.getMonth() + 1,
                            );
                          }}
                          style={{
                            background: "transparent",
                            border: `1px solid ${isCurrentMonth ? C.border + "40" : C.border}`,
                            color: isCurrentMonth ? C.textMut : C.textDim,
                            borderRadius: 5,
                            padding: "2px 8px",
                            fontSize: 12,
                            cursor: isCurrentMonth ? "default" : "pointer",
                          }}
                        >
                          ›
                        </button>
                      );
                    })()}
                  </div>
                  {/* Legend */}
                  <div style={{ display: "flex", gap: 12 }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 5 }}
                    >
                      <svg width="16" height="6">
                        <line
                          x1="0"
                          y1="3"
                          x2="16"
                          y2="3"
                          stroke={C.border}
                          strokeWidth="1.5"
                          strokeDasharray="4 3"
                        />
                      </svg>
                      <span style={{ fontSize: 10, color: C.textDim }}>
                        Plan
                      </span>
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 5 }}
                    >
                      <svg width="16" height="6">
                        <line
                          x1="0"
                          y1="3"
                          x2="16"
                          y2="3"
                          stroke={C.blue}
                          strokeWidth="2"
                        />
                      </svg>
                      <span style={{ fontSize: 10, color: C.textDim }}>
                        Actual
                      </span>
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 5 }}
                    >
                      <svg width="8" height="8">
                        <circle cx="4" cy="4" r="3" fill={C.green} />
                      </svg>
                      <span style={{ fontSize: 10, color: C.textDim }}>
                        ≥ Plan
                      </span>
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 5 }}
                    >
                      <svg width="8" height="8">
                        <circle cx="4" cy="4" r="3" fill={C.orange} />
                      </svg>
                      <span style={{ fontSize: 10, color: C.textDim }}>
                        {"< Plan"}
                      </span>
                    </div>
                  </div>
                </div>
                <DailyTrendChart days={dailyDays} />
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    background: C.panel,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    padding: 14,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 12,
                    }}
                  >
                    <p style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                      Stoptime 4M — Bulanan
                    </p>
                    <span style={{ fontSize: 10, color: C.textDim }}>
                      {String(trendMonth).padStart(2, "0")}/{trendYear}
                    </span>
                  </div>
                  <StoptimeBar
                    data={{
                      stoptime_machine: monthlySummary?.stoptime_machine || 0,
                      stoptime_man: monthlySummary?.stoptime_man || 0,
                      stoptime_material: monthlySummary?.stoptime_material || 0,
                      stoptime_method: monthlySummary?.stoptime_method || 0,
                      stoptime_other: 0,
                    }}
                  />
                </div>
                <div
                  style={{
                    background: C.panel,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    padding: 14,
                  }}
                >
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: C.text,
                      marginBottom: 12,
                    }}
                  >
                    Stoptime 4M — Harian
                  </p>
                  <StoptimeBar data={stoptimeTotals} />
                </div>
              </div>
            </div>

            {/* ── 3. Top Output Terendah + Top Reject Terbanyak + Top Stoptime Terbanyak ── */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <p style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                Ranking Line — Harian
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: C.panel,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  padding: "2px 6px",
                }}
              >
                <button
                  onClick={() => shiftRankingDate(-1)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: C.textDim,
                    borderRadius: 5,
                    padding: "2px 6px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  ‹
                </button>
                <span
                  style={{
                    fontSize: 11,
                    color: C.text,
                    fontWeight: 600,
                    minWidth: 92,
                    textAlign: "center",
                  }}
                >
                  {new Date(`${rankingDate}T00:00:00Z`).toLocaleDateString(
                    "id-ID",
                    {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    },
                  )}
                </span>
                {(() => {
                  const isToday = rankingDate === todayWibStr;
                  return (
                    <button
                      onClick={() => shiftRankingDate(1)}
                      disabled={isToday}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: isToday ? C.textMut : C.textDim,
                        borderRadius: 5,
                        padding: "2px 6px",
                        fontSize: 12,
                        cursor: isToday ? "default" : "pointer",
                      }}
                    >
                      ›
                    </button>
                  );
                })()}
              </div>
            </div>
            {rankingLoading && (
              <p
                style={{
                  fontSize: 10,
                  color: C.textDim,
                  marginTop: -6,
                  marginBottom: 10,
                }}
              >
                Memuat data tanggal terpilih…
              </p>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  background: C.panel,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 12,
                  }}
                >
                  <p style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                    Top Output Terendah
                  </p>
                </div>
                <TopLowAchievement allLines={rankingLines} onRowClick={handleTopRowClick} />
              </div>
              <div
                style={{
                  background: C.panel,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 12,
                  }}
                >
                  <p style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                    Top Reject Tertinggi
                  </p>
                </div>
                <TopReject allLines={rankingLines} onRowClick={handleTopRowClick} />
              </div>
              <div
                style={{
                  background: C.panel,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 12,
                  }}
                >
                  <p style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                    Top Stoptime Tertinggi
                  </p>
                </div>
                <TopStoptime allLines={rankingLines} onRowClick={handleTopRowClick} />
              </div>
            </div>

            {/* ── 4. KPI Harian ── */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,1fr)",
                gap: 12,
                marginBottom: 16,
              }}
            >
              {[
                {
                  label: "Total Output",
                  value: `${fmt(companyActual)} / ${fmt(companyPlan)}`,
                  unit: "pcs",
                  sub: "Actual / Plan (semua tempat)",
                  color: C.blue,
                },
                {
                  label: "Bekidoritsu",
                  value: `${companyPct}%`,
                  sub: "Actual / Plan × 100",
                  color: pctColor,
                },
                {
                  label: "Overall OEE",
                  value: `${companyOEE}%`,
                  sub: "Rata-rata semua tempat",
                  color: oeeColor,
                },
                {
                  label: "Line Aktif",
                  value: `${companyRunning} / ${companyTotal}`,
                  sub: "Running / Total line",
                  color: lineStatusColor,
                },
              ].map(({ label, value, unit, sub, color }) => (
                <div
                  key={label}
                  style={{
                    background: C.panel,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    padding: "14px 16px",
                  }}
                >
                  <p
                    style={{
                      fontSize: 11,
                      color: C.textDim,
                      marginBottom: 6,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {label}
                  </p>
                  <p
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 5,
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ fontSize: 22, fontWeight: 800, color }}>
                      {value}
                    </span>
                    {unit && (
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: C.textDim,
                        }}
                      >
                        {unit}
                      </span>
                    )}
                  </p>
                  <p style={{ fontSize: 11, color: C.textMut }}>{sub}</p>
                </div>
              ))}
            </div>

            {/* ── 5. Tabel Akumulasi per Tempat (Breakdown Line) ── */}
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
                  padding: "10px 14px",
                  borderBottom: `1px solid ${C.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                  }}
                >
                  <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                    Breakdown Line
                  </p>
                  <span style={{ fontSize: 11, color: C.textDim }}>
                    ·{" "}
                    {new Date(`${rankingDate}T00:00:00Z`).toLocaleDateString(
                      "id-ID",
                      {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        timeZone: "UTC",
                      },
                    )}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <input
                    type="text"
                    placeholder="Cari nama line..."
                    value={lineSearch}
                    onChange={(e) => setLineSearch(e.target.value)}
                    style={{
                      background: C.bg,
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      padding: "5px 10px",
                      fontSize: 12,
                      color: C.text,
                      width: 180,
                      outline: "none",
                    }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    {[
                      { key: "all", label: "Semua" },
                      { key: "problem", label: "Bermasalah" },
                      { key: "not_running", label: "Tidak Running" },
                      { key: "running", label: "Running" },
                    ].map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setLineFilterStatus(key)}
                        style={{
                          background:
                            lineFilterStatus === key
                              ? C.blue + "22"
                              : "transparent",
                          border: `1px solid ${lineFilterStatus === key ? C.blue : C.border}`,
                          color: lineFilterStatus === key ? C.blue : C.textDim,
                          borderRadius: 6,
                          padding: "5px 12px",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <select
                    value={lineSort}
                    onChange={(e) => setLineSort(e.target.value)}
                    style={{
                      background: C.bg,
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      padding: "5px 8px",
                      fontSize: 11,
                      color: C.text,
                      outline: "none",
                      cursor: "pointer",
                      colorScheme: "light",
                    }}
                  >
                    {[
                      ["default", "Urutkan: Default"],
                      ["output_desc", "Output Tertinggi"],
                      ["output_asc", "Output Terendah"],
                      ["ach_desc", "Bekidoritsu Tertinggi"],
                      ["ach_asc", "Bekidoritsu Terendah"],
                      ["oee_desc", "OEE Tertinggi"],
                      ["oee_asc", "OEE Terendah"],
                    ].map(([val, label]) => (
                      <option
                        key={val}
                        value={val}
                        style={{ background: C.panel, color: C.text }}
                      >
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <p style={{ fontSize: 11, color: C.textDim }}>
                  Klik row untuk buka detail line
                </p>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: C.panelAlt }}>
                      {[
                        "Line",
                        "Status",
                        "Output Plan",
                        "Output Actual",
                        "% Bekidoritsu",
                        "OEE",
                        "Reject",
                        "Total Stoptime",
                      ].map((h) => (
                        <th key={h} style={thStyle()}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const q = lineSearch.toLowerCase();
                      let filteredLines = rankingLines.filter((l) => {
                        const matchSearch =
                          !q ||
                          l.line_code.toLowerCase().includes(q) ||
                          (l.description || "").toLowerCase().includes(q);
                        const isProblem =
                          (l.oee > 0 && l.oee < 70) ||
                          (l.stoptime_total || 0) > 60;
                        const matchStatus =
                          lineFilterStatus === "all" ||
                          (lineFilterStatus === "running" &&
                            !l.line_not_running) ||
                          (lineFilterStatus === "not_running" &&
                            l.line_not_running) ||
                          (lineFilterStatus === "problem" && isProblem);
                        return matchSearch && matchStatus;
                      });

                      const achievement = (l) =>
                        l.output_plan > 0
                          ? (l.output_actual / l.output_plan) * 100
                          : 0;

                      if (lineSort !== "default") {
                        const sorted = [...filteredLines];
                        sorted.sort((a, b) => {
                          switch (lineSort) {
                            case "output_desc":
                              return (
                                (b.output_actual || 0) - (a.output_actual || 0)
                              );
                            case "output_asc":
                              return (
                                (a.output_actual || 0) - (b.output_actual || 0)
                              );
                            case "ach_desc":
                              return achievement(b) - achievement(a);
                            case "ach_asc":
                              return achievement(a) - achievement(b);
                            case "oee_desc":
                              return (b.oee || 0) - (a.oee || 0);
                            case "oee_asc":
                              return (a.oee || 0) - (b.oee || 0);
                            default:
                              return 0;
                          }
                        });
                        filteredLines = sorted;
                      }

                      if (filteredLines.length === 0) {
                        return (
                          <tr>
                            <td
                              colSpan={8}
                              style={{
                                padding: 24,
                                textAlign: "center",
                                color: C.textDim,
                              }}
                            >
                              {rankingLines.length === 0
                                ? "Belum ada data"
                                : "Tidak ditemukan line yang cocok"}
                            </td>
                          </tr>
                        );
                      }
                      return filteredLines.map((l) => (
                        <LineRow
                          key={l.line_code}
                          l={l}
                          // Drill-down per-line (PCBDashboard) versi RINGKAS
                          // sekarang bisa proxy lewat Master buat line SGP/
                          // Systech (routes/master.js /dashboard/line-*,
                          // lihat useDashboardData.js mode remote) — jadi
                          // TIDAK di-nonaktifin lagi kayak sebelumnya, cukup
                          // dikasih tau sumbernya via remoteSourceKey.
                          //
                          // rankingDate ikut dikirim SEBAGAI backdate kalau
                          // beda dari hari ini — biar klik line pas lagi
                          // liat Ranking Line hari kemarin/lampau, PCBDashboard
                          // yang kebuka nampilin REKAP hari itu, bukan live
                          // hari ini (App.jsx selectLine → ?date=...).
                          // Line SGP/Systech (remoteSourceKey ada) BELUM
                          // support ini — proxy Master masih versi ringkas
                          // (lihat useDashboardData.js), jadi date di-skip
                          // di kasus itu biar gak salah nampilin data.
                          onSelect={(code, remoteKey, e) =>
                            setLineChoice({
                              code,
                              remoteKey,
                              backdate:
                                !remoteKey && rankingDate !== todayWibStr
                                  ? rankingDate
                                  : undefined,
                              repTopId: l.rep_top_id ?? null,
                              // tempat asli line ini (Internal/SGP/Systech)
                              // — DB shared, tapi server ConMasManager-nya
                              // beda host per tempat (lihat constants.js).
                              tempat: l.tempat,
                              x: e.clientX,
                              y: e.clientY,
                            })
                          }
                          remoteSourceKey={
                            isRemoteViaMaster ? remoteSourceKey : undefined
                          }
                        />
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Popup pilihan pas klik line: "Buka PCB" (dokumen ConMasManager,
          server internal, minta login sendiri di sana) vs "Dashboard per
          Line" (behavior lama, masuk ke PCBDashboard.jsx internal app ini).
          Style-nya SAMA kayak popup pilihan di MasterHub. */}
      <LineActionMenu
        menu={lineChoice}
        onClose={() => setLineChoice(null)}
        onOpenPCB={(menu) => {
          window.open(
            `${getConmasManagerUrl(menu.tempat)}/InputReport/Details?repTopId=${menu.repTopId}`,
            "_blank",
            "noopener,noreferrer",
          );
          setLineChoice(null);
        }}
        onOpenDashboard={(menu) => {
          onSelect(menu.code, menu.remoteKey, menu.backdate);
          setLineChoice(null);
        }}
      />
    </>
  );
}
