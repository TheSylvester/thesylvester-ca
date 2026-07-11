"use client";

import { useEffect } from "react";

// One-shot scroll reveals: adds .is-in the first time a [data-reveal] element
// enters the viewport, then stops watching it — printed output never
// un-prints. Elements already on screen at init (reload with restored
// scroll, anchor jump) get .is-instant instead and skip the entrance — the
// animation is reserved for content the user scrolls to. The hidden state
// lives in globals.css behind html.js + prefers-reduced-motion, so no-JS /
// reduced-motion visitors never depend on this running.
export default function RevealInit() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll("[data-reveal]"));
    if (!els.length) return;
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-in"));
      return;
    }
    // 0.82 mirrors the observer's -18% bottom rootMargin
    const revealLine = window.innerHeight * 0.82;
    const pending: Element[] = [];
    for (const el of els) {
      if (el.getBoundingClientRect().top < revealLine) {
        el.classList.add("is-in", "is-instant");
      } else {
        pending.push(el);
      }
    }
    if (!pending.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -18% 0px", threshold: 0 },
    );
    pending.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
