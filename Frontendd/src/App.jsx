import React, { useState, useEffect, useCallback } from "react";
import PCBDashboard from "./components/dashboard/PCBDashboard";
import LinePicker from "./components/dashboard/LinePicker";
import MasterDashboard from "./components/dashboard/MasterDashboard";
import MasterHub from "./components/dashboard/MasterHub";
import ExecutiveDashboard from "./components/dashboard/ExecutiveDashboard";
import BreakdownTempat from "./components/dashboard/BreakdownTempat";
import { IS_INTERNAL_INSTANCE, TEMPAT_LABEL } from "./config/constants";

function getUrlState() {
  const params = new URLSearchParams(window.location.search);
  return {
    line: params.get("line"),
    view: params.get("view"),
    tempat: params.get("tempat"),
    // Diisi cuma kalau line yang dibuka itu punya DB di instance SUBCONT
    // (diklik dari Master Hub) — lihat selectLine() & PCBDashboard remoteSource.
    source: params.get("source"),
  };
}

export default function App() {
  const [urlState, setUrlState] = useState(getUrlState());

  // remoteSourceKey opsional ("sgp"/"systech") — diisi cuma pas line yang
  // dipilih itu punya DB di instance SUBCONT (diklik dari tabel Ranking
  // Line di Master Hub, lihat MasterDashboard.jsx). Line Internal biasa
  // (dari LinePicker/tabel lokal) tetap panggil selectLine(code) tanpa
  // argumen ke-2, persis kayak sebelumnya.
  const selectLine = useCallback((code, remoteSourceKey) => {
    const url = new URL(window.location.href);
    url.searchParams.set("line", code);
    url.searchParams.delete("view");
    url.searchParams.delete("tempat");
    if (remoteSourceKey) {
      url.searchParams.set("source", remoteSourceKey);
    } else {
      url.searchParams.delete("source");
    }
    window.history.pushState({}, "", url);
    setUrlState({ line: code, view: null, tempat: null, source: remoteSourceKey || null });
  }, []);

  // `tempat` opsional — diisi cuma pas Internal buka "Dashboard Utama"
  // lokasi SGP/Systech LEWAT Master Hub (proxy /api/master/dashboard/*,
  // lihat MasterDashboard.jsx isRemoteViaMaster). Kosongin buat kasus lama
  // (instance buka Master Dashboard-nya sendiri).
  const goToMaster = useCallback((tempat) => {
    const url = new URL(window.location.href);
    url.searchParams.delete("line");
    url.searchParams.delete("source");
    url.searchParams.set("view", "master");
    if (tempat) {
      url.searchParams.set("tempat", tempat);
    } else {
      url.searchParams.delete("tempat");
    }
    window.history.pushState({}, "", url);
    setUrlState({ line: null, view: "master", tempat: tempat || null });
  }, []);

  const goToBreakdown = useCallback((tempat) => {
    const url = new URL(window.location.href);
    url.searchParams.delete("line");
    url.searchParams.delete("source");
    url.searchParams.set("view", "breakdown");
    url.searchParams.set("tempat", tempat);
    window.history.pushState({}, "", url);
    setUrlState({ line: null, view: "breakdown", tempat });
  }, []);

  const goToHub = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("line");
    url.searchParams.delete("tempat");
    url.searchParams.delete("source");
    url.searchParams.set("view", "hub");
    window.history.pushState({}, "", url);
    setUrlState({ line: null, view: "hub", tempat: null });
  }, []);

  // Executive Dashboard sebelumnya cuma bisa diakses lewat landing page
  // (URL kosong) instance Internal — belum ada jalur BALIK ke sana dari
  // Master Hub. Tombol "Buka Executive Dashboard →" di MasterHub butuh
  // ini buat pindah tanpa reload penuh (pakai pushState, konsisten sama
  // navigasi lain di file ini).
  const goToExecutive = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("line");
    url.searchParams.delete("tempat");
    url.searchParams.delete("view");
    url.searchParams.delete("source");
    window.history.pushState({}, "", url);
    setUrlState({ line: null, view: null, tempat: null, source: null });
  }, []);

  const goToPicker = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("line");
    url.searchParams.delete("view");
    url.searchParams.delete("tempat");
    url.searchParams.delete("source");
    window.history.pushState({}, "", url);
    setUrlState({ line: null, view: null, tempat: null, source: null });
  }, []);

  useEffect(() => {
    const onPopState = () => setUrlState(getUrlState());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (urlState.line) {
    return (
      <PCBDashboard line={urlState.line} remoteSource={urlState.source} />
    );
  }
  // ⚠️ "Master Hub" narik /api/master/* buat AGREGASI 3 lokasi — cuma
  // masuk akal diliat dari instance Hirose. Instance subcont (SGP/Systech)
  // bisa nyasar ke ?view=hub lewat 2 jalur:
  //   1) breadcrumb "← Master Hub" di komponen lama yang masih goToHub
  //   2) ketik manual ?view=hub di address bar
  // Kalau instance BUKAN internal, blok view ini — lempar balik ke
  // Breakdown per Line tempat sendiri, JANGAN pernah render MasterHub.
  //
  // "Master Dashboard" (?view=master / MasterDashboard.jsx) BEDA — dia
  // cuma fetch /api/dashboard/* (endpoint LOKAL instance ini sendiri, semua
  // line tempat ini), jadi generic dan valid buat SEMUA instance, gak cuma
  // internal. Makanya "master" TIDAK ikut di-gate di sini.
  if (urlState.view === "hub" && !IS_INTERNAL_INSTANCE) {
    return (
      <BreakdownTempat
        tempat={TEMPAT_LABEL}
        onSelect={selectLine}
        onBack={goToPicker}
      />
    );
  }
  if (urlState.view === "hub") {
    return (
      <MasterHub
        onOpenTempat={(tempatKey, target) => {
          if (target === "breakdown") {
            // Generic buat semua tempat (internal/sgp/systech) — BreakdownTempat
            // udah nerima prop `tempat` bebas.
            goToBreakdown(tempatKey);
            return;
          }
          // target === "master" → Internal buka Master Dashboard-nya
          // sendiri (tanpa proxy). SGP/Systech: dulu cuma alert "belum
          // tersedia" — sekarang proxy lewat /api/master/dashboard/*
          // (baca data via push-sync kalau pull lagi mati), lihat
          // MasterDashboard.jsx isRemoteViaMaster.
          goToMaster(tempatKey === "internal" ? undefined : tempatKey);
        }}
        onOpenExecutive={IS_INTERNAL_INSTANCE ? goToExecutive : undefined}
      />
    );
  }
  if (urlState.view === "master") {
    return (
      <MasterDashboard
        onSelect={selectLine}
        // Internal: "back" balik ke Master Hub (konsisten alur lama, dan
        // satu-satunya jalur buat sampai ke sini pas tempat=sgp/systech).
        // Subcont: gak ada Hub, "back" balik ke halaman Pilih Line.
        onBack={IS_INTERNAL_INSTANCE ? goToHub : goToPicker}
        onBreakdown={goToBreakdown}
        tempat={urlState.tempat}
      />
    );
  }
  if (urlState.view === "breakdown" && urlState.tempat) {
    return (
      <BreakdownTempat
        tempat={urlState.tempat}
        onSelect={selectLine}
        // Internal: "back" balik ke Master Hub (konsisten alur lama).
        // Subcont: alurnya Pilih Line → Master Dashboard → Breakdown per
        // Line, jadi "back" dari Breakdown balik ke Master Dashboard-nya
        // sendiri (goToMaster), BUKAN ke Pilih Line.
        onBack={IS_INTERNAL_INSTANCE ? goToHub : goToMaster}
      />
    );
  }
  // ⚠️ Landing page (URL kosong, gak ada ?view=/&line=) SEKARANG beda per
  // instance: Internal mendarat di Executive Dashboard (halaman ringkasan
  // level manajemen — BARU, di atas Master Hub di hierarki navigasi).
  // Subcont (SGP/Systech) TETAP mendarat di LinePicker seperti biasa —
  // Executive Dashboard ini KHUSUS Internal (lihat diskusi Backend: data
  // manual planner, cuma masuk akal dilihat/diedit dari Internal).
  if (!urlState.line && !urlState.view && IS_INTERNAL_INSTANCE) {
    return <ExecutiveDashboard onOpenHub={goToHub} />;
  }
  return (
    <LinePicker
      onSelect={selectLine}
      onGoToMaster={goToMaster}
      onGoToHub={goToHub}
      onGoToBreakdown={goToBreakdown}
    />
  );
}
