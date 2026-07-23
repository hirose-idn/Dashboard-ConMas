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
import { C, GLOBAL_STYLE, BASE_URL, REFRESH_MS } from "../../config/constants";

const fmt = (n, dec = 0) =>
  n == null ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: dec });

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

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function KpiCard({ label, value, unit, color }) {
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "14px 16px",
      }}
    >
      <p
        style={{
          fontSize: 10,
          color: C.textDim,
          marginBottom: 6,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </p>
      <p style={{ fontSize: 24, fontWeight: 800, color: color || C.text }}>
        {value}
        {unit && (
          <span style={{ fontSize: 13, fontWeight: 600, color: C.textDim, marginLeft: 4 }}>
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}

export default function BreakdownTrend({ tempat, onBack }) {
  const [{ year, month }, setYearMonth] = useState(currentYearMonth());
  const [payload, setPayload] = useState(null); // { status, label, data: { days, totals } }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const timerRef = useRef(null);

  const { start, end } = monthRange(year, month);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(
        `${BASE_URL}/api/master/tempat-trend?source=${encodeURIComponent(tempat)}&start=${start}&end=${end}`,
      );
      const json = await res.json();
      setPayload(json);
      setError(json.status === "error" ? json.message : null);
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

  const days = payload?.data?.days || [];
  const totals = payload?.data?.totals || {
    output_plan: 0,
    output_actual: 0,
    bekidoritsu: 0,
    stoptime_total: 0,
  };
  const label = payload?.label || tempat;

  const chartData = days.map((d) => ({
    date: d.date.slice(5), // MM-DD, keeps the X axis from getting cluttered
    fullDate: d.date,
    Plan: d.plan,
    Actual: d.actual,
  }));

  const bekidoritsuColor =
    totals.bekidoritsu >= 90 ? C.green : totals.bekidoritsu >= 70 ? C.orange : C.red;

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
                ← Master Hub
              </button>
              <span style={{ color: C.border }}>›</span>
              <span style={{ fontSize: 12, color: C.textDim }}>{tempat}</span>
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: C.blue, margin: 0, letterSpacing: 1 }}>
              TREND BREAKDOWN — {label.toUpperCase()}
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
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <KpiCard label="Total Output Plan" value={fmt(totals.output_plan)} color={C.text} />
          <KpiCard label="Total Output Actual" value={fmt(totals.output_actual)} color={C.blue} />
          <KpiCard
            label="Bekidoritsu"
            value={fmt(totals.bekidoritsu, 1)}
            unit="%"
            color={bekidoritsuColor}
          />
          <KpiCard
            label="Total Stoptime"
            value={fmt(totals.stoptime_total)}
            unit="min"
            color={C.orange}
          />
        </div>

        {/* ── Month picker ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 14,
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "10px 14px",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={goPrevMonth}
            style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 6, width: 26, height: 26, cursor: "pointer" }}
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
            style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 6, width: 26, height: 26, cursor: "pointer" }}
          >
            ›
          </button>
          <span style={{ fontSize: 12, color: C.textDim }}>
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: C.textDim }}>
            {start} → {end} ({days.length} days)
          </span>
        </div>

        {/* ── Loading / Error ── */}
        {loading ? (
          <p style={{ color: C.textDim, textAlign: "center", paddingTop: 60 }}>Loading data...</p>
        ) : error ? (
          <p style={{ color: C.red, textAlign: "center", paddingTop: 60 }}>Error: {error}</p>
        ) : (
          <>
            {/* ── Chart ── */}
            <div
              style={{
                background: C.panel,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: "16px 16px 6px",
                marginBottom: 14,
              }}
            >
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.textDim }} />
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

            {/* ── Per-date table ── */}
            <div
              style={{
                background: C.panel,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: C.panelAlt }}>
                      {["Date", "Output Plan", "Output Actual", "Achievement"].map((h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: "left",
                            padding: "8px 12px",
                            fontSize: 10,
                            fontWeight: 600,
                            color: C.textDim,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {days.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ padding: 20, textAlign: "center", color: C.textDim }}>
                          No data in this period
                        </td>
                      </tr>
                    ) : (
                      days.map((d) => {
                        const pct = d.plan > 0 ? Math.round((d.actual / d.plan) * 100) : 0;
                        const pctColor = pct >= 90 ? C.green : pct >= 70 ? C.orange : C.red;
                        return (
                          <tr key={d.date} style={{ borderTop: `1px solid ${C.border}` }}>
                            <td style={{ padding: "8px 12px", fontSize: 12, color: C.text }}>
                              {new Date(`${d.date}T00:00:00`).toLocaleDateString("en-US", {
                                weekday: "short",
                                day: "2-digit",
                                month: "short",
                              })}
                            </td>
                            <td style={{ padding: "8px 12px", fontSize: 12, color: C.textDim }}>
                              {fmt(d.plan)}
                            </td>
                            <td style={{ padding: "8px 12px", fontSize: 12, color: C.text, fontWeight: 600 }}>
                              {fmt(d.actual)}
                            </td>
                            <td style={{ padding: "8px 12px", fontSize: 12, fontWeight: 700, color: pctColor }}>
                              {d.hasData ? `${pct}%` : "—"}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}