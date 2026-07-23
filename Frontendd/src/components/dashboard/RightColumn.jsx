import React from "react";
import { C } from "../../config/constants";
import { DataBadge, SectionTitle, TH, TD } from "../ui";

// ─── Preventive Maintenance block ────────────────────────
function PMBlock({ pm }) {
  const weekly = pm?.weekly || {};
  const monthly = pm?.monthly || {};

  return (
    <div
      style={{
        borderBottom: `1px solid ${C.border}`,
        padding: "10px 12px",
        flexShrink: 0,
        background: `linear-gradient(135deg, ${C.blueDim}, transparent)`,
      }}
    >
      {/* Title */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 900,
          color: C.text,
          textAlign: "center",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          lineHeight: 1.4,
          marginBottom: 10,
        }}
      >
        Preventive
        <br />
        Maintenance
      </div>

      {/* Weekly */}
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: C.blue,
            textAlign: "center",
            letterSpacing: "0.06em",
            marginBottom: 5,
          }}
        >
          WEEKLY
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 9, color: C.textDim }}>Last</span>
            <span style={{ fontSize: 9, color: C.text }}>{weekly.last || "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 9, color: C.textDim }}>Next</span>
            <span style={{ fontSize: 9, fontWeight: 800, color: C.blue }}>{weekly.next || "—"}</span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: `${C.border}`, margin: "6px 0" }} />

      {/* Monthly */}
      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: C.blue,
            textAlign: "center",
            letterSpacing: "0.06em",
            marginBottom: 5,
          }}
        >
          MONTHLY
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 9, color: C.textDim }}>Last</span>
            <span style={{ fontSize: 9, color: C.text }}>{monthly.last || "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 9, color: C.textDim }}>Next</span>
            <span style={{ fontSize: 9, fontWeight: 800, color: C.blue }}>{monthly.next || "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Default defect names ─────────────────────────────────
const DEFAULT_DEFECTS = [
  "Bent Pins",
  "Solder Short",
  "Missing Part",
  "Surface Scratch",
  "Polarity Reverse",
  "Cold Solder",
];

// ─── Kolom kanan dashboard ────────────────────────────────
export default function RightColumn({ reject_detail, preventive_maintenance }) {
  const items =
    reject_detail && reject_detail.length > 0
      ? reject_detail
      : DEFAULT_DEFECTS.map((name) => ({ defect_name: name, qty: 0 }));

  const isLive = !!(reject_detail && reject_detail.length > 0);

  return (
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
      {/* ── Preventive Maintenance ── */}
      <PMBlock pm={preventive_maintenance} />

      {/* ── Detail Reject ── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <SectionTitle color={C.red} icon="🔍">
          Detail Reject <DataBadge live={isLive} />
        </SectionTitle>

        <div style={{ flex: 1, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
              <tr>
                <TH style={{ color: C.red, textAlign: "left", paddingLeft: 8 }}>
                  Defect Name
                </TH>
                <TH style={{ color: C.red }}>QTY</TH>
              </tr>
            </thead>
            <tbody>
              {items.map((r, i) => {
                const qty = Number(r.qty) || 0;
                return (
                  <tr
                    key={i}
                    style={{
                      background: i % 2 === 0 ? `${C.border}30` : "transparent",
                    }}
                  >
                    <TD
                      style={{
                        color: qty > 0 ? C.red : C.textDim,
                        textAlign: "left",
                        paddingLeft: 8,
                        fontWeight: qty > 0 ? 700 : 400,
                      }}
                    >
                      {r.defect_name || "—"}
                    </TD>
                    <TD
                      style={{
                        color: qty > 0 ? C.red : C.textMut,
                        fontWeight: qty > 0 ? 700 : 400,
                      }}
                    >
                      {qty}
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
