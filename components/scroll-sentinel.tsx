"use client";

import { useEffect, useRef } from "react";

// Top-bar scrolled state: a 1px sentinel at the very top of the page. The
// observer fires exactly twice per direction change — no scroll listener —
// and toggles html[data-scrolled], which CSS maps to a border-color-only
// brighten on [data-topbar] (box-shadow is banned there: backdrop-filter
// composites every scroll frame).
export default function ScrollSentinel() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = ref.current;
    if (!sentinel || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) =>
      document.documentElement.toggleAttribute("data-scrolled", !e.isIntersecting),
    );
    io.observe(sentinel);
    return () => {
      io.disconnect();
      document.documentElement.removeAttribute("data-scrolled");
    };
  }, []);

  return (
    <div ref={ref} aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, width: 1, height: 1 }}></div>
  );
}
