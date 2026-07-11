"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";

export default function HomeAnchor() {
  const pathname = usePathname();

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Let modified clicks (new tab, etc.) fall through to the browser.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (pathname === "/") {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
      history.replaceState(null, "", "/");
    }
  };

  return (
    <Link
      href="/"
      aria-label="Home"
      title="Home"
      className="hov-home"
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3,5px)",
        gridTemplateRows: "repeat(3,5px)",
        gap: 2,
      }}
    >
      {/* quincunx pixel mark — orange on even cells */}
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} style={{ background: i % 2 === 0 ? "#d97757" : "transparent" }}></span>
      ))}
    </Link>
  );
}
