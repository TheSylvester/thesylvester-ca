"use client";

import { useEffect } from "react";

// One-shot scroll reveals: adds .is-in the first time a [data-reveal] element
// enters the viewport, then stops watching it — printed output never
// un-prints. The hidden state lives in globals.css behind html.js +
// prefers-reduced-motion, so no-JS / reduced-motion visitors never depend on
// this running.
export default function RevealInit() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll("[data-reveal]"));
    if (!els.length) return;
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
