import React, { useRef, useState } from "react";
import { C, GLOBAL_STYLE, applyTheme, readSavedTheme } from "../../config/constants";
import useDashboardData from "../../hooks/useDashboardData";
import DashboardHeader from "./DashboardHeader";
import LeftColumn from "./LeftColumn";
import CenterColumn from "./CenterColumn";
import RightColumn from "./RightColumn";

export default function PCBDashboard({ line, remoteSource, date }) {
  // remoteSource ("sgp" | "systech") diisi cuma kalau halaman ini dibuka
  // dari Master Hub pas klik line subcont (lihat MasterDashboard.jsx
  // LineRow + App.jsx selectLine) — bikin hook fetch lewat proxy Master,
  // bukan endpoint lokal (yang gak akan nemu line itu di DB Master).
  //
  // `date` (YYYY-MM-DD) opsional — diisi cuma pas halaman ini dibuka dari
  // Master Dashboard yang lagi di-backdate (lihat App.jsx selectLine +
  // MasterDashboard.jsx rankingDate). Kosong = behavior lama, live ikut
  // shift yang lagi jalan sekarang.
  //
  // Toggle Shift 1/2/dst — CUMA relevan pas historis (tanggal yang punya
  // >1 shift, lihat diskusi soal Breakdown Line 10.726 vs detail 5.760).
  // Direset ke null (= "shift terakhir hari itu", default lama) tiap kali
  // line/date ganti, biar gak "nyangkut" milih Shift 2 pas pindah ke line
  // atau tanggal lain yang mungkin cuma punya Shift 1.
  const [shiftOverride, setShiftOverride] = useState(null);
  const prevLineDateRef = useRef(`${line}|${date}`);
  if (prevLineDateRef.current !== `${line}|${date}`) {
    prevLineDateRef.current = `${line}|${date}`;
    if (shiftOverride !== null) setShiftOverride(null);
  }
  const d = useDashboardData(line, remoteSource, date, shiftOverride);

  // PCBDashboard ini yang ditampilin di TV/kiosk lantai produksi — SENGAJA
  // dipaksa dark TERUS, ga peduli setting tema global lagi light atau dark
  // (beda dari halaman lain kayak Hub/Breakdown/Master Dashboard yang semua
  // ngikut 1 toggle tema yang sama). Alasannya: layar ini nempel di lantai
  // produksi yang ruangannya gelap, light theme di sini justru bikin silau/
  // susah kebaca dari jarak jauh.
  //
  // Pola sama kayak yang DULU dipakai MasterDashboard buat force-light (liat
  // riwayat file itu) — paksa di render pertama (bukan di useEffect biasa,
  // supaya render PERTAMA juga udah pasti dark, gak sempet "kepotret" tema
  // lain dulu), lalu balikin ke preferensi asli pas komponen ini unmount
  // (misal user pindah balik ke LinePicker/Hub) supaya toggle mereka di
  // halaman lain tetep konsisten.
  const previousThemeRef = useRef(readSavedTheme());
  const isFirstRender = useRef(true);
  if (isFirstRender.current) {
    applyTheme("dark");
    isFirstRender.current = false;
  }
  React.useEffect(() => {
    return () => applyTheme(previousThemeRef.current);
  }, []);

  return (
    <>
      <style>{GLOBAL_STYLE()}</style>
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
          backgroundImage: `
          linear-gradient(${C.border} 1px, transparent 1px),
          linear-gradient(90deg, ${C.border} 1px, transparent 1px)
        `,
          backgroundSize: "40px 40px",
        }}
      >
        <DashboardHeader
          loading={d.loading}
          error={d.error}
          line={d.line}
          nama_produk={d.nama_produk}
          historical={d.historical}
          viewedDate={d.tanggal}
          availableShifts={d.available_shifts}
          shiftOverride={shiftOverride}
          onShiftChange={setShiftOverride}
          lineStatus={d.line_status}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "200px 1fr 220px",
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            alignItems: "stretch",
          }}
        >
          <LeftColumn
            tanggal={d.tanggal}
            line={d.line}
            cl_no={d.cl_no}
            nama_produk={d.nama_produk}
            personnel={d.personnel}
            lastRefresh={d.lastRefresh}
          />

          <CenterColumn
            nama_produk={d.nama_produk}
            cycle_time_swi={d.cycle_time_swi}
            cycle_time_actual={d.cycle_time_actual}
            output_plan={d.output_plan}
            output_produksi={d.output_produksi}
            deviasi_target={d.deviasi_target}
            qty_reject_ppm={d.qty_reject_ppm}
            stoptime_menit={d.stoptime_menit}
            availability={d.availability}
            monthly={d.monthly}
            hourly={d.hourly}
            shift={d.shift}
          />

          {/* qty_reject & qty_reject_ppm dipakai panel "Quality Status"
              di kolom kanan — supaya panel itu tetap punya isi pas daftar
              defect-nya kosong (reject 0 = kabar baik, layak dipajang,
              bukan bikin kolom 220px jadi blank). */}
          <RightColumn
            schedule={d.schedule}
            reject_detail={d.reject_detail}
            qty_reject={d.qty_reject}
            qty_reject_ppm={d.qty_reject_ppm}
          />
        </div>

        {/* ⚠️ FIX: alarm full-screen blink merah ini KHUSUS live/kiosk — dulu
            cuma cek line_status === "not_running" tanpa peduli lagi liat data
            HARI INI atau REKAP tanggal yg udah lewat (?date=...). Efeknya:
            buka rekap historis yang emang gak ada row produksi tanggal itu
            (atau line sempet berhenti tengah shift hari itu) numpang alarm
            "LINE TIDAK RUNNING" berkedip persis kayak sistem lagi macet
            LIVE — padahal itu cuma catatan masa lalu, bukan kejadian
            sekarang. `!d.historical` masukin syarat: alarm ini CUMA nyala
            kalau beneran lagi mantau live. Untuk historis, lihat badge
            tenang di bawah (line_status "no_data" / "not_running"). */}
        {d.line_status === "not_running" && !d.historical && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(5,15,20,0.88)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              zIndex: 999,
              animation: "blink-warning 4s ease-in-out infinite",
            }}
          >
            <div
              style={{
                fontSize: 64,
                fontWeight: 900,
                color: C.red,
                letterSpacing: "0.1em",
                textShadow: `0 0 40px ${C.red}aa`,
              }}
            >
              LINE TIDAK RUNNING
            </div>
            <div style={{ fontSize: 20, color: C.textDim, letterSpacing: "0.05em" }}>
              Line {d.line || "—"} · {d.shift || "—"} · belum ada data masuk lebih dari 1 jam
            </div>
          </div>
        )}
        {/* Versi historis dari kondisi di atas — badge kecil pojok kanan
            atas, BUKAN full-screen alarm (ini rekap tanggal lewat, gak ada
            yang perlu "direspon sekarang" kayak live). "no_data" = beneran
            gak ada row produksi tanggal ini (line libur/gak jalan). 
            "not_running" (historis) = row ADA tapi kedetek berhenti input
            di tengah shift hari itu — tetap info yang berguna, cuma gak
            perlu bikin panik. */}
        {d.historical && d.line_status === "no_data" && (
          <div
            style={{
              position: "fixed",
              top: 16,
              right: 16,
              background: `${C.textDim}22`,
              border: `1px solid ${C.textDim}`,
              color: C.textDim,
              fontSize: 13,
              fontWeight: 700,
              padding: "6px 14px",
              borderRadius: 20,
              zIndex: 999,
            }}
          >
            Tidak ada data produksi pada tanggal ini
          </div>
        )}
        {/* Beda sama "no_data" (SELURUH tanggal itu kosong) — ini kejadian
            pas user klik toggle Shift 1/2 (lihat DashboardHeader.jsx) buat
            shift yang gak ada row-nya di tanggal ini, misal tanggal itu
            cuma jalan Shift 1 tapi user lagi nge-klik toggle "Shift 2". */}
        {d.historical && d.line_status === "shift_not_found" && (
          <div
            style={{
              position: "fixed",
              top: 16,
              right: 16,
              background: `${C.textDim}22`,
              border: `1px solid ${C.textDim}`,
              color: C.textDim,
              fontSize: 13,
              fontWeight: 700,
              padding: "6px 14px",
              borderRadius: 20,
              zIndex: 999,
            }}
          >
            Shift ini tidak beroperasi pada tanggal ini
          </div>
        )}
        {d.historical && d.line_status === "not_running" && (
          <div
            style={{
              position: "fixed",
              top: 16,
              right: 16,
              background: `${C.orange}22`,
              border: `1px solid ${C.orange}`,
              color: C.orange,
              fontSize: 13,
              fontWeight: 700,
              padding: "6px 14px",
              borderRadius: 20,
              zIndex: 999,
            }}
          >
            Ada indikasi line berhenti di tengah shift ini
          </div>
        )}
        {/* "waiting" (row shift blm ada tapi masih wajar, awal shift) SENGAJA
            gak ditampilin full-screen alarm kayak "not_running" — biar gak
            nge-alarm-in operator/supervisor tiap ganti shift padahal itu
            wajar (setup/serah-terima/dll). Cukup badge kecil aja biar tetep
            keinfo tanpa bikin panik. */}
        {d.line_status === "waiting" && (
          <div
            style={{
              position: "fixed",
              top: 16,
              right: 16,
              background: `${C.orange}22`,
              border: `1px solid ${C.orange}`,
              color: C.orange,
              fontSize: 13,
              fontWeight: 700,
              padding: "6px 14px",
              borderRadius: 20,
              zIndex: 999,
            }}
          >
            Menunggu Data Shift
          </div>
        )}
      </div>
    </>
  );
}