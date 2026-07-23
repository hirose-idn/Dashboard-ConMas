import React, { useState, useEffect, useCallback } from "react";
import {
  C,
  GLOBAL_STYLE,
  BASE_URL,
  IS_INTERNAL_INSTANCE,
  TEMPAT_LABEL,
} from "../../config/constants";

// ─────────────────────────────────────────────────────────────
//  Halaman muncul kalau dashboard dibuka TANPA ?line=...
//  - Nampilin daftar line aktif (klik → masuk dashboard line itu)
//  - Form kecil buat nambah line baru (line_code + shift scheme)
//    tanpa perlu sentuh kode/deploy ulang sama sekali.
// ─────────────────────────────────────────────────────────────
export default function LinePicker({
  onSelect,
  onGoToMaster,
  onGoToHub,
  onGoToBreakdown,
}) {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    line_code: "",
    description: "",
    shift_scheme: "2",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);

  const loadLines = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}/api/lines`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setLines(json.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLines();
  }, [loadLines]);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.line_code.trim()) {
      setFormError("Kode line wajib diisi.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${BASE_URL}/api/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_code: form.line_code.trim(),
          description: form.description.trim() || null,
          shift_scheme: Number(form.shift_scheme),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
      setForm({ line_code: "", description: "", shift_scheme: "2" });
      setShowForm(false);
      await loadLines();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch(`${BASE_URL}/api/lines/sync`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
      setSyncMessage({
        type: "ok",
        text: json.message,
        added: json.data || [],
      });
      await loadLines();
    } catch (err) {
      setSyncMessage({ type: "error", text: err.message });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <style>{GLOBAL_STYLE()}</style>
      <div
        style={{
          background: C.bg,
          color: C.text,
          fontFamily: "'Segoe UI', 'Meiryo', 'Yu Gothic', sans-serif",
          minHeight: "100vh",
          width: "100vw",
          padding: "48px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: 1,
            marginBottom: 4,
            color: C.text,
          }}
        >
          PILIH LINE
        </h1>
        <p style={{ color: C.textDim, marginBottom: 8, fontSize: 14 }}>
          Tampilan Data Produksi Real-Time
        </p>

        {IS_INTERNAL_INSTANCE && onGoToHub && (
          <button
            onClick={onGoToHub}
            style={{
              background: "transparent",
              border: `1px solid ${C.borderBr}`,
              color: C.blue,
              borderRadius: 6,
              padding: "6px 14px",
              cursor: "pointer",
              fontSize: 12,
              marginBottom: 8,
              marginRight: 8,
            }}
          >
            Master Dashboard Utama (Internal · SGP · Systech) →
          </button>
        )}

        {IS_INTERNAL_INSTANCE && onGoToMaster && (
          <button
            onClick={onGoToMaster}
            style={{
              background: "transparent",
              border: `1px solid ${C.borderBr}`,
              color: C.blue,
              borderRadius: 6,
              padding: "6px 14px",
              cursor: "pointer",
              fontSize: 12,
              marginBottom: 24,
            }}
          >
            Lihat Master Dashboard (semua line) →
          </button>
        )}

        {/* Instance subcont (SGP/Systech) gak punya "Master Hub" (butuh
            /api/master/* yang narik 3 lokasi sekaligus), TAPI tetap punya
            "Master Dashboard"-nya sendiri (MasterDashboard.jsx cuma fetch
            /api/dashboard/* — endpoint LOKAL instance ini, generic buat
            semua tempat). Ini SATU-SATUNYA jalur masuk buat subcont —
            "Breakdown per Line" sengaja TIDAK ada tombol langsung di sini,
            cuma bisa diakses lewat dalam Master Dashboard (biar alurnya
            selalu Pilih Line → Master Dashboard → Breakdown, gak ada jalan
            pintas yang nyelonong Master Dashboard-nya). */}
        {!IS_INTERNAL_INSTANCE && onGoToMaster && (
          <button
            onClick={onGoToMaster}
            style={{
              background: "transparent",
              border: `1px solid ${C.borderBr}`,
              color: C.blue,
              borderRadius: 6,
              padding: "6px 14px",
              cursor: "pointer",
              fontSize: 12,
              marginBottom: 24,
            }}
          >
            Lihat Master Dashboard ({TEMPAT_LABEL}) →
          </button>
        )}

        {loading && <p style={{ color: C.textDim }}>Memuat daftar line…</p>}

        {error && (
          <p style={{ color: C.red, marginBottom: 16 }}>
            Gagal memuat daftar line: {error}
          </p>
        )}

        {!loading && !error && lines.length === 0 && (
          <p style={{ color: C.textDim, marginBottom: 24 }}>
            Belum ada line terdaftar. Tambah line baru di bawah.
          </p>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 16,
            width: "100%",
            maxWidth: 1800,
            marginBottom: 32,
          }}
        >
          {lines.map((l) => (
            <button
              key={l.line_code}
              onClick={() => onSelect(l.line_code)}
              style={{
                background: C.panel,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: "20px 16px",
                textAlign: "left",
                cursor: "pointer",
                color: C.text,
                transition: "border-color 0.15s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.borderColor = C.borderBr)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.borderColor = C.border)
              }
            >
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: C.green,
                  marginBottom: 4,
                }}
              >
                {l.line_code}
              </div>
              <div style={{ fontSize: 13, color: C.textDim, marginBottom: 10 }}>
                {l.description || "—"}
              </div>
              <span
                style={{
                  display: "inline-block",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: 4,
                  background: C.blueDim,
                  color: C.blue,
                }}
              >
                {l.shift_scheme} SHIFT
              </span>
            </button>
          ))}
        </div>

        {!showForm && (
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <button
              onClick={() => setShowForm(true)}
              style={{
                background: "transparent",
                border: `1px dashed ${C.borderBr}`,
                borderRadius: 8,
                padding: "10px 20px",
                color: C.textDim,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              + Tambah Line Baru
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              title="Cek database, otomatis tambahin line yang belum terdaftar di sini"
              style={{
                background: "transparent",
                border: `1px dashed ${C.borderBr}`,
                borderRadius: 8,
                padding: "10px 20px",
                color: syncing ? C.textDim : C.blue,
                cursor: syncing ? "default" : "pointer",
                fontSize: 13,
                opacity: syncing ? 0.6 : 1,
              }}
            >
              {syncing ? "Sinkronisasi…" : "⟳ Sync dari Database"}
            </button>
          </div>
        )}

        {syncMessage && (
          <div
            style={{
              marginTop: 12,
              maxWidth: 480,
              textAlign: "center",
              fontSize: 13,
              color: syncMessage.type === "error" ? C.red : C.green,
            }}
          >
            {syncMessage.text}
            {syncMessage.type === "ok" && syncMessage.added.length > 0 && (
              <div style={{ color: C.textDim, marginTop: 4 }}>
                {syncMessage.added.map((l) => l.line_code).join(", ")} —
                lengkapin keterangan/shift scheme-nya lewat "+ Tambah Line Baru"
                kalau perlu.
              </div>
            )}
          </div>
        )}

        {showForm && (
          <form
            onSubmit={handleSubmit}
            style={{
              background: C.panelAlt,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: 20,
              width: "100%",
              maxWidth: 360,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              Tambah Line Baru
            </div>

            <label style={{ fontSize: 12, color: C.textDim }}>
              Kode Line
              <input
                value={form.line_code}
                onChange={(e) =>
                  setForm({ ...form, line_code: e.target.value })
                }
                placeholder="contoh: 41HR130"
                style={inputStyle}
              />
            </label>

            <label style={{ fontSize: 12, color: C.textDim }}>
              Keterangan (opsional)
              <input
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="contoh: PCB Assy Line 130"
                style={inputStyle}
              />
            </label>

            <label style={{ fontSize: 12, color: C.textDim }}>
              Shift Scheme
              <select
                value={form.shift_scheme}
                onChange={(e) =>
                  setForm({ ...form, shift_scheme: e.target.value })
                }
                style={inputStyle}
              >
                <option value="2">2 Shift</option>
                <option value="3">3 Shift</option>
              </select>
            </label>

            {formError && (
              <div style={{ color: C.red, fontSize: 12 }}>{formError}</div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  flex: 1,
                  background: C.green,
                  color: "#04140f",
                  border: "none",
                  borderRadius: 6,
                  padding: "8px 0",
                  fontWeight: 700,
                  cursor: submitting ? "default" : "pointer",
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? "Menyimpan…" : "Simpan"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                style={{
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  color: C.textDim,
                  borderRadius: 6,
                  padding: "8px 14px",
                  cursor: "pointer",
                }}
              >
                Batal
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

const inputStyle = {
  display: "block",
  width: "100%",
  marginTop: 4,
  background: C.panel,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: "8px 10px",
  color: C.text,
  fontSize: 13,
  outline: "none",
};