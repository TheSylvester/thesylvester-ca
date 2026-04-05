"use client";

import { useEffect, useRef } from "react";

// Perlin noise implementation
const PERM = new Uint8Array(512);
const GRAD = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

(function seedNoise() {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

function fade(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function perlin(x: number, y: number) {
  const xi = Math.floor(x) & 255,
    yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x),
    yf = y - Math.floor(y);
  const u = fade(xf),
    v = fade(yf);
  const g = (h: number, fx: number, fy: number) => {
    const g2 = GRAD[h & 7];
    return g2[0] * fx + g2[1] * fy;
  };
  const aa = PERM[PERM[xi] + yi],
    ab = PERM[PERM[xi] + yi + 1];
  const ba = PERM[PERM[xi + 1] + yi],
    bb = PERM[PERM[xi + 1] + yi + 1];
  const x1 = g(aa, xf, yf) + (g(ba, xf - 1, yf) - g(aa, xf, yf)) * u;
  const x2 =
    g(ab, xf, yf - 1) + (g(bb, xf - 1, yf - 1) - g(ab, xf, yf - 1)) * u;
  return x1 + (x2 - x1) * v;
}

// Ember Luxe theme colors
const ACCENT = { r: 212, g: 165, b: 116 }; // #D4A574
const ACCENT2 = { r: 249, g: 115, b: 22 }; // #F97316

interface Dot {
  bx: number;
  by: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
}

export default function DotGridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const dotsRef = useRef<Dot[]>([]);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  const SPACING = 32;
  const MOUSE_RADIUS = 130;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const initDots = (width: number, height: number) => {
      const dots: Dot[] = [];
      const cols = Math.ceil(width / SPACING) + 4;
      const rows = Math.ceil(height / SPACING) + 4;
      const ox = (width - (cols - 1) * SPACING) / 2;
      const oy = (height - (rows - 1) * SPACING) / 2;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = ox + c * SPACING;
          const y = oy + r * SPACING;
          dots.push({
            bx: x, by: y, x, y, vx: 0, vy: 0,
            phase: Math.random() * Math.PI * 2,
          });
        }
      }
      dotsRef.current = dots;
    };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initDots(canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const handleMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const handleLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 };
    };
    window.addEventListener("mousemove", handleMouse);
    window.addEventListener("mouseleave", handleLeave);

    const animate = () => {
      timeRef.current += 0.005;
      const t = timeRef.current;
      const { width, height } = canvas;
      const mouse = mouseRef.current;

      ctx.clearRect(0, 0, width, height);

      const dots = dotsRef.current;
      for (let i = 0; i < dots.length; i++) {
        const dot = dots[i];

        // Perlin noise ambient drift
        const nx =
          perlin(dot.bx * 0.004 + t * 0.4, dot.by * 0.004 + t * 0.2) * 4;
        const ny =
          perlin(
            dot.bx * 0.004 + 100 + t * 0.3,
            dot.by * 0.004 + 100 + t * 0.25
          ) * 4;

        // Breathing opacity
        const breathe = Math.sin(t * 2 + dot.phase) * 0.05;

        // Mouse: gentle exponential falloff displacement
        const dx = dot.bx - mouse.x;
        const dy = dot.by - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < MOUSE_RADIUS) {
          const influence = Math.exp((-dist * 3) / MOUSE_RADIUS);
          const angle = Math.atan2(dy, dx);
          dot.vx += Math.cos(angle) * influence * 0.8;
          dot.vy += Math.sin(angle) * influence * 0.8;
        }

        // Spring to noise-offset home
        dot.vx += (dot.bx + nx - dot.x) * 0.012;
        dot.vy += (dot.by + ny - dot.y) * 0.012;
        dot.vx *= 0.93;
        dot.vy *= 0.93;
        dot.x += dot.vx;
        dot.y += dot.vy;

        // Color mixing based on proximity
        const prox =
          dist < MOUSE_RADIUS * 1.5
            ? Math.exp((-dist * 2.5) / (MOUSE_RADIUS * 1.5))
            : 0;
        const cr = Math.floor(
          ACCENT.r + (ACCENT2.r - ACCENT.r) * prox
        );
        const cg = Math.floor(
          ACCENT.g + (ACCENT2.g - ACCENT.g) * prox
        );
        const cb = Math.floor(
          ACCENT.b + (ACCENT2.b - ACCENT.b) * prox
        );

        const baseAlpha = 0.08 + breathe;
        const alpha = Math.min(baseAlpha + prox * 0.4, 0.6);
        const radius = 1.0 + prox * 0.5;

        // Subtle glow near cursor
        if (prox > 0.2) {
          ctx.shadowBlur = 5 * prox;
          ctx.shadowColor = `rgba(${cr},${cg},${cb},0.3)`;
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.beginPath();
        ctx.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`;
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouse);
      window.removeEventListener("mouseleave", handleLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0"
      style={{ pointerEvents: "none" }}
    />
  );
}
