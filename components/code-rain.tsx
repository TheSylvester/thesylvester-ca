"use client";

import { useEffect, useRef } from "react";

// Recall Rain — hero background, lifted from the reference landing page.
// Settings: intensity 1.00, density 1.00, opacity 0.50, streak fade 0.50, fall speed 1.50.

const COLORS = {
  clay: [217, 119, 87],
  clayLite: [226, 144, 111],
  green: [140, 194, 101],
};

const rgba = (c: number[], a: number) =>
  "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (a < 0 ? 0 : a > 1 ? 1 : a).toFixed(3) + ")";

interface Pointer {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  speed: number;
  idleMs: number;
  moved: boolean;
  nx: number;
  ny: number;
}

interface RainEnv {
  intensity: number;
  density: number;
  params: { fade: number; speed: number };
  colors: typeof COLORS;
  canvas: HTMLCanvasElement;
}

interface RainMod {
  init(c: HTMLCanvasElement, g: CanvasRenderingContext2D | null): void;
  frame(now: number, dt: number, p: Pointer, env: RainEnv): void;
}

function driveBackground(canvas: HTMLCanvasElement, mod: RainMod, env: RainEnv) {
  const ctx = canvas.getContext("2d");
  let w = 0,
    h = 0,
    dpr = 1;
  function resize() {
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width));
    h = Math.max(1, Math.round(r.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const p: Pointer = { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, speed: 0, idleMs: 1e5, moved: false, nx: 0.5, ny: 0.5 };
  function onMove(e: PointerEvent) {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left,
      y = e.clientY - r.top;
    p.px = p.x;
    p.py = p.y;
    p.vx = x - p.x;
    p.vy = y - p.y;
    if (!p.moved) {
      p.vx = 0;
      p.vy = 0;
    }
    p.x = x;
    p.y = y;
    p.speed = Math.hypot(p.vx, p.vy);
    p.idleMs = 0;
    p.moved = true;
    p.nx = x / w;
    p.ny = y / h;
  }
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("resize", resize);
  resize();
  p.x = p.px = w / 2;
  p.y = p.py = h / 2;
  let raf = 0,
    last = performance.now(),
    clock = 0;
  function loop(now: number) {
    let dt = now - last;
    last = now;
    if (dt > 50) dt = 50;
    if (dt < 0) dt = 0;
    clock += dt;
    p.idleMs += dt;
    if (p.idleMs > 18) {
      p.vx *= 0.86;
      p.vy *= 0.86;
      p.speed = Math.hypot(p.vx, p.vy);
    }
    mod.frame(clock, dt, p, env);
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  return {
    stop() {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", resize);
    },
  };
}

interface Col {
  head: number;
  sp: number;
  active: boolean;
  cd: number;
  glyphs: string[];
  lastCell: number;
}

function makeCodeRain(fontFamily: string): RainMod {
  let ctx: CanvasRenderingContext2D | null = null,
    w = 0,
    h = 0,
    step = 16,
    ncol = 0,
    C: Col[] = [],
    heat = new Float32Array(0),
    hit = new Uint8Array(0),
    key = "";
  const GL = "01<>{}[]()/\\|=+-*&^%$#@!;:.·agentcontextmemoryrecall";
  const rc = () => GL[(Math.random() * GL.length) | 0];
  const newCol = (spread: boolean): Col => ({
    head: spread ? Math.random() * (h / step) : -2,
    sp: 0.4 + Math.random() * 0.8,
    active: spread ? Math.random() < 0.5 : true,
    cd: Math.random() * 1800,
    glyphs: [],
    lastCell: -999,
  });
  function build(den: number) {
    step = Math.max(12, Math.round(16 / (den || 1)));
    ncol = Math.ceil(w / step) + 1;
    C = [];
    heat = new Float32Array(ncol);
    hit = new Uint8Array(ncol);
    for (let i = 0; i < ncol; i++) {
      C.push(newCol(true));
      hit[i] = Math.random() < 0.05 ? 1 : 0;
    }
  }
  return {
    init(c, g) {
      ctx = g;
    },
    frame(now, dt, p, env) {
      if (!ctx) ctx = env.canvas.getContext("2d");
      if (!ctx) return;
      const r = env.canvas.getBoundingClientRect();
      const W = Math.max(1, Math.round(r.width)),
        H = Math.max(1, Math.round(r.height));
      w = W;
      h = H;
      const k = w + "x" + h + "x" + (env.density || 1).toFixed(2);
      if (k !== key) {
        key = k;
        build(env.density);
      }
      const P = env.params || {},
        fade = P.fade != null ? P.fade : 0.55,
        spd = P.speed != null ? P.speed : 1.5;
      const trail = Math.max(2, Math.round(3 + (1 - fade) * 24));
      const CL = env.colors.clay,
        CLl = env.colors.clayLite,
        GRN = env.colors.green,
        inten = env.intensity,
        step2 = dt > 0 ? dt / 16 : 0;
      const idleFade = Math.max(0, 1 - p.idleMs / 2400);
      ctx.clearRect(0, 0, w, h);
      ctx.font = step - 2 + "px " + fontFamily;
      ctx.textBaseline = "top";
      for (let i = 0; i < ncol; i++) {
        const d = C[i],
          cxp = i * step;
        let tgt = 0;
        if (idleFade > 0) {
          const dd = Math.abs(cxp - p.x);
          if (dd < 130) tgt = (1 - dd / 130) * idleFade;
        }
        heat[i] += (tgt - heat[i]) * (tgt > heat[i] ? 0.35 : 0.05);
        if (!d.active) {
          d.cd -= dt;
          if (d.cd <= 0) C[i] = newCol(false);
          continue;
        }
        d.head += d.sp * spd * 0.075 * (0.75 + inten * 0.25 + heat[i] * 1.2) * step2;
        const cell = Math.floor(d.head);
        if (cell !== d.lastCell) {
          d.lastCell = cell;
          d.glyphs.unshift(rc());
          if (d.glyphs.length > trail) d.glyphs.length = trail;
        }
        const hv = heat[i];
        for (let t = 0; t < d.glyphs.length; t++) {
          const cy = (d.head - t) * step;
          if (cy < -step || cy > h + step) continue;
          const f = 1 - t / trail;
          let a = (0.055 + hv * 0.5) * (t === 0 ? 1 : f * f) * (0.5 + inten * 0.9);
          if (t === 0) a = Math.min(0.92, a + 0.14);
          const col = hit[i]
            ? GRN
            : t === 0
              ? [
                  CL[0] + (255 - CL[0]) * (0.4 + hv * 0.6),
                  CL[1] + (238 - CL[1]) * (0.4 + hv * 0.6),
                  CL[2] + (216 - CL[2]) * (0.35 + hv * 0.6),
                ]
              : hv > 0.3
                ? CLl
                : CL;
          ctx.fillStyle = rgba(col, a);
          ctx.fillText(d.glyphs[t], cxp, cy);
        }
        if ((d.head - trail) * step > h) {
          d.active = false;
          d.cd = 400 + Math.random() * 2800;
        }
      }
    },
  };
}

export default function CodeRain() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    // reduced motion: never start the RAF loop — a static frame of rain is
    // worthless at this alpha, so hide the canvas entirely
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      canvas.style.opacity = "0";
      return;
    }
    canvas.style.opacity = "0.5";
    // next/font registers the family under a hashed name — read the real one off <body>
    const fontFamily = getComputedStyle(document.body).fontFamily;
    const env: RainEnv = { intensity: 1.0, density: 1.0, params: { fade: 0.5, speed: 1.5 }, colors: COLORS, canvas };
    const mod = makeCodeRain(fontFamily);
    mod.init(canvas, canvas.getContext("2d"));
    const handle = driveBackground(canvas, mod, env);
    return () => handle.stop();
  }, []);

  return (
    <canvas
      ref={ref}
      data-dots=""
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: "135vh",
        width: "100%",
        pointerEvents: "none",
        zIndex: 1,
        WebkitMaskImage: "linear-gradient(to bottom,#000 0%,#000 66%,transparent 100%)",
        maskImage: "linear-gradient(to bottom,#000 0%,#000 66%,transparent 100%)",
      }}
    />
  );
}
