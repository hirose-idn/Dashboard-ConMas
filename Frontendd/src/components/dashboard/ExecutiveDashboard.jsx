import React, { useState, useEffect, useCallback } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { C, GLOBAL_STYLE, BASE_URL, useThemeMode } from "../../config/constants";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];
const MONTHS_FULL = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

// Warna tetap per lokasi — SAMA persis kayak MasterHub.jsx (SOURCE_COLOR),
// biar 1 lokasi = 1 warna konsisten di SELURUH halaman dashboard, bukan
// cuma di halaman ini.
const SOURCE_COLOR = { internal: C.blue, sgp: C.green, systech: C.purple };
const SOURCE_LABEL = { internal: "Hirose Internal", sgp: "Subcont SGP", systech: "Subcont Systech" };
const TEMPAT_ORDER = ["internal", "sgp", "systech"];

// ── Warna SEMANTIK berdasarkan % pencapaian — bukan warna acak per card.
// Threshold-nya gampang diubah sesuai standar internal Hirose.
function achievementColor(pct) {
  if (pct >= 85) return C.green;
  if (pct >= 60) return C.orange;
  return C.red;
}
function gapColor(gap) {
  return gap >= 0 ? C.green : C.red;
}

const fmt = (n, dec = 2) =>
  n == null ? "—" : Number(n).toLocaleString("id-ID", { minimumFractionDigits: dec, maximumFractionDigits: dec });

// ─── KPI card besar di baris atas — value-nya berwarna SESUAI KONDISI,
// bukan card-nya di-cat rata warna beda-beda tanpa makna. ──────────────
function KpiCard({ label, value, unit, color, caption }) {
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "18px 20px",
        flex: 1,
        minWidth: 200,
      }}
    >
      <p style={{ fontSize: 11, color: C.textDim, letterSpacing: 0.5, marginBottom: 8 }}>
        {label.toUpperCase()}
      </p>
      <p style={{ fontSize: 30, fontWeight: 800, color: color || C.text, lineHeight: 1.1 }}>
        {value}{" "}
        {unit && <span style={{ fontSize: 14, fontWeight: 500, color: C.textDim }}>{unit}</span>}
      </p>
      {caption && (
        <p style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>{caption}</p>
      )}
    </div>
  );
}

// ─── 1 baris lokasi di Achievement Ranking — progress bar + mini stat +
// tombol edit inline (input manual, karena belum ada sumber data otomatis)
function RankingRow({ tempat, data, onSave }) {
  const [editing, setEditing] = useState(false);
  const [targetInput, setTargetInput] = useState(data.target);
  const [actualInput, setActualInput] = useState(data.actual);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) {
      setTargetInput(data.target);
      setActualInput(data.actual);
    }
  }, [data.target, data.actual, editing]);

  const pct = Math.min(data.achievementPct, 100); // bar gak lewat 100% biar gak "meledak" visual, angka teks tetap apa adanya
  const color = achievementColor(data.achievementPct);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(tempat, Number(targetInput) || 0, Number(actualInput) || 0);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: "18px 0", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              display: "inline-block", width: 9, height: 9, borderRadius: "50%",
              background: SOURCE_COLOR[tempat],
            }}
          />
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{SOURCE_LABEL[tempat]}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color }}>{fmt(data.achievementPct, 1)}%</span>
          <button
            onClick={() => setEditing((v) => !v)}
            title="Edit target & actual"
            style={{
              background: "transparent", border: `1px solid ${C.border}`, color: C.textDim,
              borderRadius: 6, padding: "4px 9px", fontSize: 11, cursor: "pointer",
            }}
          >
            {editing ? "Batal" : "✎ Edit"}
          </button>
        </div>
      </div>

      {/* progress bar — track NETRAL (bukan merah), fill warna sesuai pencapaian */}
      <div style={{ height: 8, borderRadius: 4, background: C.panelAlt, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, transition: "width .3s" }} />
      </div>

      {editing ? (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ fontSize: 11, color: C.textDim }}>
            Target
            <input
              type="number"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              style={{
                display: "block", marginTop: 4, width: 110, background: C.inputBg,
                border: `1px solid ${C.border}`, borderRadius: 6, color: C.text,
                padding: "6px 8px", fontSize: 13,
              }}
            />
          </label>
          <label style={{ fontSize: 11, color: C.textDim }}>
            Actual
            <input
              type="number"
              value={actualInput}
              onChange={(e) => setActualInput(e.target.value)}
              style={{
                display: "block", marginTop: 4, width: 110, background: C.inputBg,
                border: `1px solid ${C.border}`, borderRadius: 6, color: C.text,
                padding: "6px 8px", fontSize: 13,
              }}
            />
          </label>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              background: C.blue, border: "none", color: "#fff", borderRadius: 6,
              padding: "7px 16px", fontSize: 12, fontWeight: 700,
              cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10 }}>
          {[
            ["Actual", fmt(data.actual), C.green],
            ["Target", fmt(data.target), C.orange],
            ["Gap", fmt(data.gap), gapColor(data.gap)],
          ].map(([label, val, col]) => (
            <div
              key={label}
              style={{
                flex: 1, background: C.panelAlt, borderRadius: 8, padding: "8px 12px",
              }}
            >
              <p style={{ fontSize: 10, color: C.textDim, letterSpacing: 0.5 }}>{label.toUpperCase()}</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: col }}>{val}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ExecutiveDashboard({ onOpenHub }) {
  const [themeMode, toggleTheme] = useThemeMode();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [monthData, setMonthData] = useState(null);
  const [trend, setTrend] = useState(null);
  const [error, setError] = useState(null);

  const fetchMonth = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/executive/month?year=${year}&month=${month}`);
      const json = await res.json();
      if (json.success) {
        setMonthData(json);
        setError(null);
      } else {
        setError(json.message || "Gagal ambil data bulan ini");
      }
    } catch (err) {
      setError(err.message);
    }
  }, [year, month]);

  const fetchTrend = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/executive/trend?year=${year}`);
      const json = await res.json();
      if (json.success) setTrend(json);
    } catch {
      // Trend chart bukan data kritis — diemin, biarin chart kosong aja
      // kalau gagal, jangan blok seluruh halaman.
    }
  }, [year]);

  useEffect(() => { fetchMonth(); }, [fetchMonth]);
  useEffect(() => { fetchTrend(); }, [fetchTrend]);

  const handleSaveTarget = async (tempat, target, actual) => {
    await fetch(`${BASE_URL}/api/executive/target`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month, tempat, target, actual }),
    });
    await fetchMonth();
    await fetchTrend();
  };

  const trendChartData = trend
    ? trend.months.map((m) => ({
        name: MONTHS[m.month - 1],
        "Cumulative Target": m.cumTarget,
        "Cumulative Actual": m.cumActual,
      }))
    : [];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: 24, fontFamily: "sans-serif" }}>
      <style>{GLOBAL_STYLE()}</style>

      {/* ── Header ──────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: C.blue, letterSpacing: 0.5 }}>
            EXECUTIVE PERFORMANCE DASHBOARD
          </h1>
          <p style={{ fontSize: 13, color: C.textDim }}>
            Ringkasan pencapaian target {MONTHS_FULL[month - 1]} {year} — Hirose Internal, Subcont SGP, Subcont Systech
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {onOpenHub && (
            <button
              onClick={onOpenHub}
              style={{
                background: C.blue, border: "none", color: "#fff", borderRadius: 7,
                padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}
            >
              Buka Master Hub →
            </button>
          )}
          <button
            onClick={toggleTheme}
            style={{
              background: "transparent", border: `1px solid ${C.border}`, color: C.textDim,
              borderRadius: 7, padding: "8px 12px", fontSize: 12, cursor: "pointer",
            }}
          >
            {themeMode === "light" ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 24 }}>
        {/* ── Sidebar filter Tahun / Bulan ──────────────────── */}
        <div style={{ width: 190, flexShrink: 0 }}>
          <p style={{ fontSize: 11, color: C.textDim, letterSpacing: 0.5, marginBottom: 8 }}>TAHUN</p>
          <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
            {[year - 1, year].map((y) => (
              <button
                key={y}
                onClick={() => setYear(y)}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 7, fontSize: 13, fontWeight: 700,
                  border: `1px solid ${C.border}`, cursor: "pointer",
                  background: y === year ? C.blue : "transparent",
                  color: y === year ? "#fff" : C.textDim,
                }}
              >
                {y}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: C.textDim, letterSpacing: 0.5, marginBottom: 8 }}>BULAN</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {MONTHS.map((m, i) => (
              <button
                key={m}
                onClick={() => setMonth(i + 1)}
                style={{
                  padding: "8px 0", borderRadius: 7, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${C.border}`, cursor: "pointer",
                  background: i + 1 === month ? C.blue : "transparent",
                  color: i + 1 === month ? "#fff" : C.textDim,
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* ── Konten utama ──────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {error && (
            <p style={{ color: C.red, fontSize: 13, marginBottom: 16 }}>{error}</p>
          )}

          {/* KPI cards — berwarna SESUAI KONDISI, bukan warna acak */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
            <KpiCard label="Total Target" value={fmt(monthData?.total?.target)} color={C.text} />
            <KpiCard
              label="Total Actual"
              value={fmt(monthData?.total?.actual)}
              color={monthData ? achievementColor(monthData.total.achievementPct) : C.text}
            />
            <KpiCard
              label="Total Gap"
              value={fmt(monthData?.total?.gap)}
              color={monthData ? gapColor(monthData.total.gap) : C.text}
            />
            <KpiCard
              label="Total Achievement"
              value={fmt(monthData?.total?.achievementPct, 1)}
              unit="%"
              color={monthData ? achievementColor(monthData.total.achievementPct) : C.text}
            />
          </div>

          {/* Achievement Ranking */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Achievement Ranking</p>
                <p style={{ fontSize: 12, color: C.textDim }}>Target & actual per lokasi — input manual planner</p>
              </div>
              <span
                style={{
                  fontSize: 11, fontWeight: 700, color: C.textDim, background: C.panelAlt,
                  padding: "4px 10px", borderRadius: 20,
                }}
              >
                {MONTHS_FULL[month - 1].toUpperCase()} {year}
              </span>
            </div>
            {monthData &&
              TEMPAT_ORDER.map((t) => (
                <RankingRow key={t} tempat={t} data={monthData.byTempat[t]} onSave={handleSaveTarget} />
              ))}
          </div>

          {/* Trend Performance — kumulatif per tahun */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 2 }}>Trend Performance</p>
            <p style={{ fontSize: 12, color: C.textDim, marginBottom: 12 }}>
              Kumulatif Target vs Actual per bulan sepanjang {year}
            </p>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="name" stroke={C.textDim} fontSize={11} />
                <YAxis stroke={C.textDim} fontSize={11} />
                <Tooltip
                  contentStyle={{ background: C.panelAlt, border: `1px solid ${C.border}`, fontSize: 12 }}
                  labelStyle={{ color: C.text }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone" dataKey="Cumulative Target" stroke={C.textDim}
                  strokeWidth={2} strokeDasharray="5 4" dot={false}
                />
                <Line
                  type="monotone" dataKey="Cumulative Actual" stroke={C.blue}
                  strokeWidth={2.5} dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
