"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function StatusBar() {
  const [clock, setClock] = useState("--:--:--");
  // null until the observer reports — /guide has no [data-screen] sections,
  // so the segment renders nothing there; server HTML always matches.
  const [section, setSection] = useState<string | null>(null);
  const [ruler, setRuler] = useState("TOP");

  useEffect(() => {
    const tick = setInterval(() => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      setClock(p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  // Section segment — midline detection over the page's [data-screen] sections.
  useEffect(() => {
    const screens = document.querySelectorAll<HTMLElement>("[data-screen]");
    if (!screens.length || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          const word = (el.dataset.screenLabel ?? "").split(/\s+/)[0].toUpperCase();
          setSection(el.dataset.screen + ":" + word);
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    screens.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Scroll ruler — rAF-throttled, clamped against rubber-band overscroll.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (window.scrollY / max) * 100));
      setRuler(pct < 1 ? "TOP" : pct > 99 ? "BOT" : Math.round(pct) + "%");
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      data-statusbar=""
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        gap: 24,
        padding: "12px 24px",
        background: "rgba(14,17,25,.94)",
        backdropFilter: "blur(10px)",
        borderTop: "1px solid #262c3d",
        fontSize: "12.5px",
        flexWrap: "wrap",
      }}
    >
      <Link href="/" className="hov-status" style={{ color: "#8cc265" }}>
        thesylvester.ca
      </Link>
      <span style={{ color: "#8a93a3", display: "inline-flex", alignItems: "center", gap: 7 }}>
        <span style={{ color: "#5c6370" }}>⎇</span> main
      </span>
      {section !== null && (
        <span style={{ color: "#8a93a3" }}>
          {/* keyed remount replays the 160ms rise on every section flip */}
          <span key={section} className="modeline-in" style={{ display: "inline-block" }}>
            {section}
          </span>
        </span>
      )}
      <span style={{ color: "#5c6370", letterSpacing: ".18em", flex: 1, textAlign: "center", minWidth: 200 }}>
        AI SYSTEMS · DEVELOPER TOOLS · AGENTIC WORKFLOWS
      </span>
      <span style={{ color: "#8cc265", display: "inline-flex", alignItems: "center", gap: 7 }}>
        <span
          style={{ width: 7, height: 7, borderRadius: "50%", background: "#8cc265", display: "inline-block" }}
        ></span>
        context loaded
      </span>
      {/* 3ch reservation — TOP/BOT/NN% all fit, zero layout shift */}
      <span style={{ color: "#8a93a3", minWidth: "3ch", textAlign: "right", display: "inline-block" }}>{ruler}</span>
      <span style={{ color: "#8a93a3" }}>{clock}</span>
    </div>
  );
}
