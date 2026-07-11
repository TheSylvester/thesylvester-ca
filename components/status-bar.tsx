"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function StatusBar() {
  const [clock, setClock] = useState("--:--:--");

  useEffect(() => {
    const tick = setInterval(() => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      setClock(p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()));
    }, 1000);
    return () => clearInterval(tick);
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
      <span style={{ color: "#5c6370", letterSpacing: ".18em", flex: 1, textAlign: "center", minWidth: 200 }}>
        AI SYSTEMS · DEVELOPER TOOLS · ENGINEERING PRACTICE
      </span>
      <span style={{ color: "#8cc265", display: "inline-flex", alignItems: "center", gap: 7 }}>
        <span
          style={{ width: 7, height: 7, borderRadius: "50%", background: "#8cc265", display: "inline-block" }}
        ></span>
        context loaded
      </span>
      <span style={{ color: "#8a93a3" }}>{clock}</span>
    </div>
  );
}
