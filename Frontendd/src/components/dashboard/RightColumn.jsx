import React from "react";
import { C } from "../../config/constants";
import { DataBadge, SectionTitle, TH, TD } from "../ui";

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
// reject_detail: null → belum sempat fetch / fetch gagal (fallback ke
//   default defect list, badge MOCK).
// reject_detail: [] → fetch SUKSES, tapi row aktif emang nihil reject
//   (semua slot defect kosong) — ini kondisi LIVE valid, BUKAN mock,
//   jadi jangan jatuh ke DEFAULT_DEFECTS supaya gak dikira data palsu.
// reject_detail: [...] → fetch sukses, ada defect tercatat.
export default function RightColumn({ reject_detail }) {
  const isLive = reject_detail !== null;
  const items = isLive ? reject_detail : DEFAULT_DEFECTS.map((name) => ({ defect_name: name, qty: 0 }));

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

        {items.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: C.textDim,
              fontSize: 11,
              padding: 16,
              textAlign: "center",
            }}
          >
            Tidak ada reject tercatat shift ini
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}
