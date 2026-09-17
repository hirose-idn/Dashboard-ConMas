import { useEffect, useState } from "react";

// Breakpoint kasar: di bawah ini dianggap iPad/tablet, di atasnya TV.
// Ini SENGAJA lebar (1400px) karena tujuannya bukan "device detection"
// akurat, tapi "apakah kolom kiri/kanan fixed (200px+220px) masih masuk
// akal" — di bawah breakpoint ini, sisa ruang buat kolom tengah kegencet
// terlalu parah kalau tetap dipaksa 3 kolom.
const TABLET_BREAKPOINT = 1400;

function computeLayout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const isPortrait = h > w;
  const isTablet = w <= TABLET_BREAKPOINT;
  return {
    isPortrait,
    isTablet,
    // "full" = TV landscape lebar (layout 3 kolom asli, no-scroll, chart tampil)
    // "compact" = iPad apapun orientasinya (tumpuk vertikal, scrollable, chart opsional)
    mode: isTablet || isPortrait ? "compact" : "full",
  };
}

export default function useDeviceLayout() {
  const [layout, setLayout] = useState(computeLayout);

  useEffect(() => {
    const onResize = () => setLayout(computeLayout());
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return layout;
}
