import React from "react";
import { C } from "../../config/constants";
import { fmt } from "../../config/utils";
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

// ─── Ringkasan status kualitas (selalu terisi) ────────────
// Ini JAWABAN buat masalah "panel kanan mati total pas reject 0" — dulu
// isinya cuma kalimat abu-abu "Tidak ada reject tercatat shift ini" di
// tengah kolom 220px, sisanya kosong. Padahal reject = 0 itu KABAR BAIK
// dan justru layak dipajang: sekarang jadi status besar GOOD/ALERT +
// angka reject & PPM shift berjalan, jadi kolom ini punya isi di kedua
// kondisi (ada reject maupun nihil).
function QualityStatus({ totalReject, ppm }) {
  const alert = totalReject > 0;
  const color = alert ? C.red : C.green;

  return (
    <div
      style={{
        padding: "10px 10px 11px",
        borderBottom: `1px solid ${C.borderBr}`,
        background: `radial-gradient(ellipse at 50% 0%, ${color}14, transparent 70%)`,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontSize: 26,
          fontWeight: 900,
          color,
          textAlign: "center",
          lineHeight: 1,
          letterSpacing: "0.06em",
          textShadow: `0 0 18px ${color}66`,
        }}
      >
        {alert ? "ALERT" : "GOOD"}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 1,
          marginTop: 9,
          background: C.border,
          border: `1px solid ${C.border}`,
        }}
      >
        {[
          { label: "REJECT", value: fmt(totalReject), unit: "pcs" },
          { label: "PPM", value: fmt(ppm), unit: "" },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: C.panel,
              padding: "6px 4px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 8,
                color: C.textDim,
                letterSpacing: "0.1em",
                marginBottom: 3,
              }}
            >
              {s.label}
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 900,
                color: alert ? C.red : C.text,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {s.value}
              {s.unit && (
                <span style={{ fontSize: 8, color: C.textDim, marginLeft: 2 }}>
                  {s.unit}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Kolom kanan dashboard ────────────────────────────────
// reject_detail: null → belum sempat fetch / fetch gagal (fallback ke
//   default defect list, badge MOCK).
// reject_detail: [] → fetch SUKSES, tapi row aktif emang nihil reject
//   (semua slot defect kosong) — ini kondisi LIVE valid, BUKAN mock,
//   jadi jangan jatuh ke DEFAULT_DEFECTS supaya gak dikira data palsu.
// reject_detail: [...] → fetch sukses, ada defect tercatat.
//
// qty_reject & qty_reject_ppm dioper dari PCBDashboard (shift berjalan) —
// dipakai QualityStatus di atas supaya panel ini tetap "hidup" walaupun
// daftar defect-nya kosong.
export default function RightColumn({ reject_detail, qty_reject, qty_reject_ppm }) {
  const isLive = reject_detail !== null;
  const items = isLive
    ? reject_detail
    : DEFAULT_DEFECTS.map((name) => ({ defect_name: name, qty: 0 }));

  // Prioritaskan angka dari header shift (qty_reject). Kalau backend belum
  // ngisi itu tapi detail defect-nya ada, jumlahin manual biar konsisten
  // sama tabel di bawahnya.
  const sumDetail = (reject_detail || []).reduce(
    (a, r) => a + (Number(r.qty) || 0),
    0,
  );
  const totalReject = Number(qty_reject) || sumDetail || 0;

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
      <SectionTitle color={totalReject > 0 ? C.red : C.green}>
        Quality Status <DataBadge live={isLive} />
      </SectionTitle>

      <QualityStatus totalReject={totalReject} ppm={qty_reject_ppm} />

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
        <div
          style={{
            fontSize: 9,
            fontWeight: 800,
            color: C.textDim,
            letterSpacing: "0.1em",
            padding: "5px 8px",
            borderBottom: `1px solid ${C.border}`,
            textTransform: "uppercase",
            flexShrink: 0,
          }}
        >
          Detail Reject
        </div>

        {items.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              color: C.textMut,
              fontSize: 10,
              padding: "14px 12px",
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            Belum ada defect tercatat
            <br />
            pada shift ini
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
