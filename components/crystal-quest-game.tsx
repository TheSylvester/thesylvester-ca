"use client";

import { useEffect, useRef } from "react";

// Crystal Quest (Patrick Buckland, 1987) — faithful recreation.
// Physics constants come from a disassembly of the original 68K binary
// (v2.2.5M): the mouse is an absolute velocity joystick — velocity =
// (mouse offset from neutral) / 10, clamped to ±9 px per update, 30 updates
// per second on a 512×342 field. No friction, no acceleration. Bullets fire
// in the direction of motion at 4× ship velocity, 5 on screen max, refused
// while (nearly) stationary. Walls clamp — only the gate posts, the closed
// gate, and the two spawn portals kill. Space = smart bomb, Tab = pause,
// 0–9 = volume, letter keys fire. 3 ships, 3 bombs; bonus ships every
// 15,000 pts to wave 11, 40,000 to wave 26, 75,000 after.
//
// Motion budget note: nothing animates until the visitor clicks to start —
// title/ready/pause/game-over frames are single static renders; the rAF
// loop runs only during play the user explicitly initiated.

const FW = 512; // field width (hard-coded in the original)
const FH = 342; // field height (classic Mac screen minus menu bar)
const HUD = 26; // status strip above the field
const TICK = 1000 / 30; // ship task ran every 2 ticks ≈ 30 Hz
const SHIP_R = 7;
const VEL_DIV = 10; // GLB2 word $0C
const VEL_CAP = 9; // GLB2 word $0E
const MIN_FIRE_V = 0.25; // can't fire while (nearly) stationary
const MAX_SHOTS = 5; // "Five Bullets At A Time"
const SENS = 0.15; // pointer-lock counts → logical px (lower = gentler steering)
const CRYSTAL_PTS = 200; // GLB2 word $32
const START_SHIPS = 3;
const START_BOMBS = 3;

const C = {
  fieldBg: "#0e1119",
  wall: "#313a4e",
  wallDim: "#262c3d",
  text: "#c8ccd4",
  bright: "#f2f3f5",
  body: "#9aa3b2",
  muted: "#7d8698",
  dim: "#5c6370",
  meta: "#8a93a3",
  clay: "#d97757",
  clayLite: "#e2906f",
  green: "#8cc265",
  emph: "#e6e9ee",
  steel: "#aeb6c4",
};

// "The Crystal Quest Repertoire of Nasties" — 12 breeds, manual point values,
// introduced one new breed every 3 waves (intro wave = that breed alone).
interface Breed {
  name: string;
  pts: number;
  r: number;
  sp: number;
  color: string;
  hp?: number;
  fireMs?: number; // dot-bullet cadence
  bsp?: number; // bullet speed
  spread?: number; // aim slop in radians ("your vague direction only")
  dropMs?: number; // pest false-crystal cadence
  bombMs?: number; // bane bouncing-bomb cadence
}
const BREEDS: Breed[] = [
  { name: "annoyer", pts: 25, r: 7, sp: 1.3, color: C.steel },
  { name: "worrier", pts: 50, r: 7, sp: 1.5, color: C.green, fireMs: 2300, bsp: 3, spread: 0.5 },
  { name: "pest", pts: 100, r: 7, sp: 1.8, color: C.clayLite, dropMs: 3000 },
  { name: "dumple", pts: 2000, r: 13, sp: 0.5, color: C.clayLite, hp: 4 },
  { name: "trimpet", pts: 0, r: 7, sp: 2.2, color: C.green },
  { name: "husket", pts: 200, r: 7, sp: 2.8, color: C.bright, fireMs: 1400, bsp: 5.5, spread: 0.35 },
  { name: "tentawarble", pts: 200, r: 8, sp: 0.8, color: C.steel },
  { name: "zarklephaser", pts: 150, r: 7, sp: 2.0, color: C.clay, fireMs: 800, bsp: 4, spread: 0.6 },
  { name: "menace", pts: 250, r: 8, sp: 1.1, color: C.emph },
  { name: "bane", pts: 300, r: 8, sp: 1.4, color: C.clay, bombMs: 2800 },
  { name: "shrapwarden", pts: 10000, r: 8, sp: 0.9, color: C.meta },
  { name: "parasite", pts: 1000, r: 7, sp: 2.4, color: C.clay },
];

interface Nasty {
  breed: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  wander: number; // countdown to a random direction change
  act: number; // per-breed action timer (fire / drop / pounce / laser)
  state: number; // 0 default · trimpet: 1 asleep · tenta: 1 pouncing · menace: 1 tell, 2 firing
  st: number; // state timer
  seed: number;
}
interface Shot { x: number; y: number; vx: number; vy: number }
interface EShot { x: number; y: number; vx: number; vy: number; kind: "dot" | "bomb" | "shrap"; ttl: number }
interface Laser { x: number; y: number; ttl: number }
interface P2 { x: number; y: number }
interface Mine extends P2 { fake: boolean }
interface Particle { x: number; y: number; vx: number; vy: number; ttl: number; color: string }
interface Float { x: number; y: number; text: string; color: string; ttl: number }
interface Bonus { x: number; y: number; vx: number; t: number }
interface Pickup extends P2 { kind: "bomb" }

type GState = "title" | "ready" | "playing" | "paused" | "dying" | "exiting" | "gameover";

function waveParams(w: number) {
  const e = Math.min(w, 40); // 40 wave configs; after that it never gets harder
  const breedMax = Math.min(11, Math.floor((e - 1) / 3));
  const intro = e <= 34 && (e - 1) % 3 === 0 ? breedMax : -1;
  return {
    crystals: Math.min(12 + e, 32),
    mines: Math.min(Math.max(0, (e - 1) * 2), 26),
    breedMax,
    intro,
    maxNasties: Math.min(4 + Math.floor(e / 2), 14),
    spawnMs: Math.max(1500 - e * 45, 420),
    perCrystal: 0.5 + e * 0.03, // spawn budget per crystal collected
    gateMoves: e >= 12,
    gateSpeed: 0.6 + e * 0.03,
    bombPickup: e >= 2 && (e % 3 === 2 || e >= 20),
  };
}

// --- tiny synth: every sound is generated, nothing is loaded -------------
class Synth {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  volume = 6; // 0–9, number keys set it in-game, like the original

  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.gainFor(this.volume);
    this.master.connect(this.ctx.destination);
  }
  gainFor(v: number) {
    return Math.pow(v / 9, 1.6) * 0.4;
  }
  setVolume(v: number) {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.gainFor(v), this.ctx.currentTime, 0.01);
  }
  beep(f0: number, f1: number, dur: number, type: OscillatorType = "square", vol = 0.5, delay = 0) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  noise(dur: number, vol = 0.4, freq = 900, delay = 0) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }
  fire() { this.beep(880, 380, 0.05, "square", 0.22); }
  crystal() { this.beep(640, 1020, 0.07, "sine", 0.5); }
  fakeStep() { this.beep(300, 260, 0.05, "triangle", 0.25); }
  gateOpen() { this.beep(392, 392, 0.09, "sine", 0.45); this.beep(587, 587, 0.11, "sine", 0.45, 0.09); this.beep(784, 784, 0.16, "sine", 0.45, 0.2); }
  exit() { this.beep(340, 980, 0.32, "sine", 0.55); this.beep(980, 560, 0.2, "sine", 0.4, 0.32); }
  death() { this.beep(300, 48, 0.55, "sawtooth", 0.5); this.noise(0.4, 0.35, 500); }
  smart() { this.noise(0.5, 0.6, 2400); this.beep(160, 40, 0.5, "sawtooth", 0.5); }
  denied() { this.beep(120, 90, 0.14, "square", 0.4); }
  bonusCatch() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.beep(f, f, 0.1, "square", 0.35, i * 0.07)); }
  extraShip() { [392, 523, 659, 784].forEach((f, i) => this.beep(f, f, 0.12, "triangle", 0.5, i * 0.1)); }
  pickup() { this.beep(500, 820, 0.09, "square", 0.4); }
  kill(breed: number) { this.beep(240 + breed * 40, 100, 0.09, "square", 0.35); this.noise(0.06, 0.2, 1400); }
  spawn(breed: number) { this.beep(180 + breed * 55, 260 + breed * 55, 0.08, "triangle", 0.18); }
  sleep() { this.beep(520, 180, 0.16, "sine", 0.3); }
  shrap() { this.noise(0.3, 0.55, 3200); this.beep(900, 200, 0.25, "sawtooth", 0.3); }
  bounce() { this.beep(140, 140, 0.03, "square", 0.12); }
  laser() { this.beep(1400, 700, 0.22, "sawtooth", 0.3); }
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export default function CrystalQuestGame() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const fontFam = getComputedStyle(document.body).fontFamily;
    const synth = new Synth();

    // ---- mutable game state ------------------------------------------------
    const G = {
      state: "title" as GState,
      fast: false, // ⌥-click start = super-fast mode; high score renders italic
      wave: 1,
      score: 0,
      ships: START_SHIPS,
      bombs: START_BOMBS,
      nextLifeAt: 15000,
      waveTime: 0,
      collected: 0,
      spawned: 0,
      spawnCd: 0,
      ship: { x: FW / 2, y: FH / 2 },
      vel: { x: 0, y: 0 },
      offset: { x: 0, y: 0 }, // virtual mouse offset from neutral — IS the velocity
      crystals: [] as P2[],
      mines: [] as Mine[],
      nasties: [] as Nasty[],
      shots: [] as Shot[],
      eshots: [] as EShot[],
      lasers: [] as Laser[],
      pickups: [] as Pickup[],
      bonus: null as Bonus | null,
      bonusCd: 0,
      particles: [] as Particle[],
      floats: [] as Float[],
      gateX: FW / 2,
      gateDir: 1,
      gateOpen: false,
      stateT: 0, // timer inside dying/exiting
      notice: "", // extra line on the ready screen (time bonus etc.)
      hi: 0,
      hiFast: false,
      newHi: false,
    };
    try {
      const s = JSON.parse(localStorage.getItem("cq.hi") || "null") as { s: number; f: boolean } | null;
      if (s && typeof s.s === "number") { G.hi = s.s; G.hiFast = !!s.f; }
    } catch { /* first visit */ }

    // ---- canvas sizing -----------------------------------------------------
    let scale = 1;
    let dpr = 1;
    function resize() {
      if (!canvas) return;
      const w = Math.max(1, canvas.getBoundingClientRect().width);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(((w * (FH + HUD)) / FW) * dpr);
      scale = (w * dpr) / FW;
    }

    // ---- geometry ----------------------------------------------------------
    const GATE_HALF = 30;
    const POST_W = 9;
    const POST_H = 10;
    const PORTAL_H = 44;
    const PORTAL_W = 9;
    const PORTAL_Y = FH / 2;
    const portalRects = () => [
      { x: 0, y: PORTAL_Y - PORTAL_H / 2, w: PORTAL_W, h: PORTAL_H },
      { x: FW - PORTAL_W, y: PORTAL_Y - PORTAL_H / 2, w: PORTAL_W, h: PORTAL_H },
    ];
    const gateRects = () => {
      const posts = [
        { x: G.gateX - GATE_HALF - POST_W, y: FH - POST_H, w: POST_W, h: POST_H },
        { x: G.gateX + GATE_HALF, y: FH - POST_H, w: POST_W, h: POST_H },
      ];
      const opening = { x: G.gateX - GATE_HALF, y: FH - 7, w: GATE_HALF * 2, h: 7 };
      return { posts, opening };
    };
    const circleHitsRect = (cx: number, cy: number, r: number, rc: { x: number; y: number; w: number; h: number }) => {
      const nx = clamp(cx, rc.x, rc.x + rc.w);
      const ny = clamp(cy, rc.y, rc.y + rc.h);
      return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
    };

    // ---- wave construction -------------------------------------------------
    function farFromAll(x: number, y: number, minSelf: number) {
      if (Math.hypot(x - FW / 2, y - FH / 2) < 70) return false; // ship start
      if (y > FH - 46 && Math.abs(x - FW / 2) < 90) return false; // gate area
      if (x < 42 && Math.abs(y - PORTAL_Y) < 66) return false; // portals
      if (x > FW - 42 && Math.abs(y - PORTAL_Y) < 66) return false;
      for (const c of G.crystals) if (Math.hypot(x - c.x, y - c.y) < minSelf) return false;
      for (const m of G.mines) if (Math.hypot(x - m.x, y - m.y) < minSelf) return false;
      for (const p of G.pickups) if (Math.hypot(x - p.x, y - p.y) < minSelf) return false;
      return true;
    }
    function place(minSelf = 17): P2 {
      for (let i = 0; i < 400; i++) {
        const x = rnd(16, FW - 16);
        const y = rnd(16, FH - 16);
        if (farFromAll(x, y, minSelf)) return { x, y };
      }
      return { x: rnd(16, FW - 16), y: rnd(16, FH - 16) };
    }
    function buildWave() {
      const p = waveParams(G.wave);
      G.crystals = [];
      G.mines = [];
      G.pickups = [];
      G.nasties = [];
      G.shots = [];
      G.eshots = [];
      G.lasers = [];
      G.particles = [];
      G.floats = [];
      G.bonus = null;
      G.bonusCd = rnd(5000, 14000);
      G.collected = 0;
      G.spawned = 0;
      G.spawnCd = p.spawnMs;
      G.waveTime = 0;
      G.gateX = FW / 2;
      G.gateDir = 1;
      G.gateOpen = false;
      G.ship = { x: FW / 2, y: FH / 2 };
      G.vel = { x: 0, y: 0 };
      for (let i = 0; i < p.crystals; i++) G.crystals.push(place());
      for (let i = 0; i < p.mines; i++) G.mines.push({ ...place(), fake: false });
      if (p.bombPickup) G.pickups.push({ ...place(), kind: "bomb" });
    }

    function spawnNasty() {
      const p = waveParams(G.wave);
      let breed: number;
      if (p.intro >= 0) breed = p.intro; // intro wave: the new breed alone
      else {
        const pool: number[] = [];
        for (let k = 0; k <= p.breedMax; k++) pool.push(k, k === p.breedMax ? k : -1, k === p.breedMax ? k : -1);
        const f = pool.filter((v) => v >= 0);
        breed = f[Math.floor(Math.random() * f.length)];
      }
      const b = BREEDS[breed];
      const left = Math.random() < 0.5;
      const a = rnd(-0.7, 0.7);
      const n: Nasty = {
        breed,
        x: left ? PORTAL_W + b.r + 2 : FW - PORTAL_W - b.r - 2,
        y: PORTAL_Y + rnd(-12, 12),
        vx: Math.cos(a) * b.sp * (left ? 1 : -1),
        vy: Math.sin(a) * b.sp,
        hp: b.hp || 1,
        wander: rnd(20, 90),
        act: rnd(15, (b.fireMs || b.dropMs || b.bombMs || 2000) / TICK),
        state: 0,
        st: 0,
        seed: Math.random() * Math.PI * 2,
      };
      if (breed === 4) { // trimpet: orthogonal only, spawns moving horizontally
        n.vx = (left ? 1 : -1) * b.sp;
        n.vy = 0;
      }
      G.nasties.push(n);
      G.spawned++;
      synth.spawn(breed);
    }

    // ---- scoring -----------------------------------------------------------
    function addScore(pts: number) {
      G.score += pts;
      while (G.score >= G.nextLifeAt) {
        G.ships++;
        synth.extraShip();
        G.floats.push({ x: G.ship.x, y: G.ship.y - 16, text: "EXTRA SHIP", color: C.green, ttl: 60 });
        G.nextLifeAt += G.wave <= 11 ? 15000 : G.wave <= 26 ? 40000 : 75000;
      }
    }
    function killNasty(i: number, viaBomb: boolean) {
      const n = G.nasties[i];
      const b = BREEDS[n.breed];
      if (n.breed === 10 && !viaBomb) {
        // Shrapwarden: "Quite sweet little things these. Unless you shoot them..."
        for (let k = 0; k < 11; k++) {
          const a = (k / 11) * Math.PI * 2 + rnd(-0.2, 0.2);
          G.eshots.push({ x: n.x, y: n.y, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, kind: "shrap", ttl: 48 });
        }
        synth.shrap();
      }
      addScore(b.pts);
      if (b.pts >= 1000) G.floats.push({ x: n.x, y: n.y, text: "+" + b.pts, color: C.clayLite, ttl: 45 });
      burst(n.x, n.y, b.color, 8);
      G.nasties.splice(i, 1);
    }
    function burst(x: number, y: number, color: string, n: number) {
      for (let i = 0; i < n; i++) {
        const a = rnd(0, Math.PI * 2);
        const s = rnd(0.6, 3.4);
        G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, ttl: rnd(12, 26), color });
      }
    }

    // ---- deaths / transitions ----------------------------------------------
    function die() {
      G.state = "dying";
      G.stateT = 0;
      synth.death();
      burst(G.ship.x, G.ship.y, C.bright, 14);
      burst(G.ship.x, G.ship.y, C.clay, 10);
    }
    function respawnOrGameOver() {
      G.ships--;
      if (G.ships <= 0) {
        G.state = "gameover";
        G.newHi = G.score > G.hi;
        if (G.newHi) {
          G.hi = G.score;
          G.hiFast = G.fast;
          try { localStorage.setItem("cq.hi", JSON.stringify({ s: G.hi, f: G.fast })); } catch { /* private mode */ }
        }
        document.exitPointerLock?.();
        stopLoop();
        render();
        return;
      }
      // death clears every enemy projectile (the only way besides a smart
      // bomb to be rid of Bane bombs) and shoves nasties off the respawn point
      G.eshots = [];
      G.lasers = [];
      G.ship = { x: FW / 2, y: FH / 2 };
      G.nasties = G.nasties.filter((n) => Math.hypot(n.x - FW / 2, n.y - FH / 2) > 80);
      G.notice = "";
      toReady();
    }
    function toReady() {
      G.state = "ready";
      G.offset = { x: 0, y: 0 }; // ZEROMOUSE: every life starts from rest
      G.vel = { x: 0, y: 0 };
      stopLoop();
      render();
    }
    function completeWave() {
      G.state = "exiting";
      G.stateT = 0;
      synth.exit();
      const par = 10 + waveParams(G.wave).crystals * 1.5;
      const bonus = Math.max(0, Math.round(par - G.waveTime)) * 150;
      G.notice = bonus > 0 ? "TIME BONUS +" + bonus : "";
      if (bonus > 0) addScore(bonus);
    }
    function smartBomb() {
      if (G.bombs <= 0) {
        synth.denied();
        return;
      }
      G.bombs--;
      synth.smart();
      // kills every nasty (scoring them) and every projectile — but not mines
      for (let i = G.nasties.length - 1; i >= 0; i--) {
        const n = G.nasties[i];
        addScore(BREEDS[n.breed].pts);
        burst(n.x, n.y, BREEDS[n.breed].color, 6);
        G.nasties.splice(i, 1);
      }
      G.eshots = [];
      G.lasers = [];
      G.bonus = null; // it even wipes the bonus crystal off the screen
    }
    function fire() {
      if (Math.abs(G.vel.x) <= MIN_FIRE_V && Math.abs(G.vel.y) <= MIN_FIRE_V) return; // refused
      if (G.shots.length >= MAX_SHOTS) return;
      let vx = G.vel.x * 4;
      let vy = G.vel.y * 4;
      // pinned against a wall firing into it: that component is zeroed
      if ((G.ship.x <= SHIP_R && vx < 0) || (G.ship.x >= FW - SHIP_R && vx > 0)) vx = 0;
      if ((G.ship.y <= SHIP_R && vy < 0) || (G.ship.y >= FH - SHIP_R && vy > 0)) vy = 0;
      if (vx === 0 && vy === 0) return;
      G.shots.push({ x: G.ship.x, y: G.ship.y, vx, vy });
      synth.fire();
    }

    // ---- simulation step (one 33ms update) ----------------------------------
    function step() {
      const p = waveParams(G.wave);
      const fast = G.fast ? 1.5 : 1; // super-fast mode roughly doubles subsystem rates

      if (G.state === "dying") {
        stepParticles();
        G.stateT += TICK;
        if (G.stateT > 900) respawnOrGameOver();
        return;
      }
      if (G.state === "exiting") {
        // 20-step slide through the gate
        G.ship.x += (G.gateX - G.ship.x) * 0.25;
        G.ship.y += 3.2;
        stepParticles();
        G.stateT += TICK;
        if (G.stateT > 750) {
          G.wave++;
          buildWave();
          toReady();
        }
        return;
      }

      G.waveTime += TICK / 1000;

      // ship: velocity IS the clamped mouse offset / 10 — no friction
      G.vel.x = clamp(G.offset.x / VEL_DIV, -VEL_CAP, VEL_CAP);
      G.vel.y = clamp(G.offset.y / VEL_DIV, -VEL_CAP, VEL_CAP);
      G.ship.x = clamp(G.ship.x + G.vel.x, SHIP_R, FW - SHIP_R);
      G.ship.y = clamp(G.ship.y + G.vel.y, SHIP_R, FH - SHIP_R);

      // player shots (swept so 30+px/update bullets can't tunnel)
      for (let i = G.shots.length - 1; i >= 0; i--) {
        const s = G.shots[i];
        const steps = Math.max(1, Math.ceil(Math.hypot(s.vx, s.vy) / 6));
        let dead = false;
        for (let k = 0; k < steps && !dead; k++) {
          s.x += s.vx / steps;
          s.y += s.vy / steps;
          if (s.x < 0 || s.x > FW || s.y < 0 || s.y > FH) { dead = true; break; }
          for (let j = G.nasties.length - 1; j >= 0; j--) {
            const n = G.nasties[j];
            if (Math.hypot(s.x - n.x, s.y - n.y) < BREEDS[n.breed].r + 2) {
              dead = true;
              if (n.breed === 4) { // trimpet: shots only put it to sleep
                n.state = 1;
                n.st = 3500 / TICK;
                synth.sleep();
              } else {
                n.hp--;
                if (n.hp <= 0) { synth.kill(n.breed); killNasty(j, false); }
                else burst(n.x, n.y, BREEDS[n.breed].color, 3);
              }
              break;
            }
          }
          if (!dead && G.bonus && Math.hypot(s.x - G.bonus.x, s.y - G.bonus.y) < 12) {
            // "Catch them to get a bonus, shoot them to lose it."
            burst(G.bonus.x, G.bonus.y, C.emph, 10);
            G.bonus = null;
            dead = true;
          }
        }
        if (dead) G.shots.splice(i, 1);
      }

      // spawning is tied to crystal collection — stop collecting, and the
      // portals go quiet ("don't try hunting")
      const budget = 2 + Math.floor(G.collected * p.perCrystal);
      G.spawnCd -= TICK * fast;
      if (G.spawnCd <= 0 && G.spawned < budget && G.nasties.length < p.maxNasties) {
        spawnNasty();
        G.spawnCd = p.spawnMs * rnd(0.7, 1.3);
      }

      // nasties
      for (let i = G.nasties.length - 1; i >= 0; i--) {
        const n = G.nasties[i];
        const b = BREEDS[n.breed];
        const sp = b.sp * fast;
        n.wander -= 1;
        n.act -= fast;
        switch (n.breed) {
          case 2: { // pest: arcs, dropping false crystals
            const a = Math.atan2(n.vy, n.vx) + 0.055 * (n.seed > Math.PI ? 1 : -1);
            n.vx = Math.cos(a) * sp;
            n.vy = Math.sin(a) * sp;
            if (n.act <= 0) {
              n.act = (b.dropMs! / TICK) * rnd(0.7, 1.4);
              if (G.mines.filter((m) => m.fake).length < 12) G.mines.push({ x: n.x, y: n.y, fake: true });
            }
            break;
          }
          case 4: // trimpet: horizontal/vertical only; asleep = frozen
            if (n.state === 1) {
              n.st -= fast;
              if (n.st <= 0) n.state = 0;
            } else if (n.wander <= 0) {
              n.wander = rnd(25, 80);
              const dirs = [[sp, 0], [-sp, 0], [0, sp], [0, -sp]];
              const d = dirs[Math.floor(Math.random() * 4)];
              n.vx = d[0];
              n.vy = d[1];
            }
            break;
          case 6: { // tentawarble: pounces the moment you slow down
            const shipSpeed = Math.hypot(G.vel.x, G.vel.y);
            if (n.state === 1) {
              n.st -= 1;
              if (n.st <= 0) { n.state = 0; const a = rnd(0, Math.PI * 2); n.vx = Math.cos(a) * sp; n.vy = Math.sin(a) * sp; }
            } else if (shipSpeed < 1.2 && n.act <= 0) {
              n.state = 1;
              n.st = 24;
              const d = Math.hypot(G.ship.x - n.x, G.ship.y - n.y) || 1;
              n.vx = ((G.ship.x - n.x) / d) * 7 * fast;
              n.vy = ((G.ship.y - n.y) / d) * 7 * fast;
              n.act = 90; // cooldown before the next pounce
            }
            break;
          }
          case 7: { // zarklephaser: keeps as far from you as possible
            const d = Math.hypot(n.x - G.ship.x, n.y - G.ship.y) || 1;
            n.vx += (((n.x - G.ship.x) / d) * sp - n.vx) * 0.06;
            n.vy += (((n.y - G.ship.y) / d) * sp - n.vy) * 0.06;
            break;
          }
          case 8: // menace: wander → freeze (the tell) → orthogonal lasers
            if (n.state === 0 && n.act <= 0) { n.state = 1; n.st = 18; n.vx = 0; n.vy = 0; }
            else if (n.state === 1) {
              n.st -= fast;
              if (n.st <= 0) {
                n.state = 0;
                n.act = rnd(60, 110);
                G.lasers.push({ x: n.x, y: n.y, ttl: 16 });
                synth.laser();
                const a = rnd(0, Math.PI * 2);
                n.vx = Math.cos(a) * sp;
                n.vy = Math.sin(a) * sp;
              }
            }
            break;
          case 11: { // parasite: relentless, remorseless — beaten by wide arcs
            const d = Math.hypot(G.ship.x - n.x, G.ship.y - n.y) || 1;
            n.vx += (((G.ship.x - n.x) / d) * sp - n.vx) * 0.045;
            n.vy += (((G.ship.y - n.y) / d) * sp - n.vy) * 0.045;
            break;
          }
          default: // annoyer/worrier/dumple/husket/bane/shrapwarden: bobbing drift
            if (n.wander <= 0) {
              n.wander = rnd(20, 75);
              const a = rnd(0, Math.PI * 2);
              n.vx = Math.cos(a) * sp * rnd(0.5, 1);
              n.vy = Math.sin(a) * sp * rnd(0.5, 1);
            }
        }
        // dot bullets, "in your vague direction only, not right at you"
        if (b.fireMs && n.act <= 0 && G.eshots.length < 40) {
          n.act = (b.fireMs / TICK) * rnd(0.75, 1.35);
          const a = Math.atan2(G.ship.y - n.y, G.ship.x - n.x) + rnd(-b.spread!, b.spread!);
          G.eshots.push({ x: n.x, y: n.y, vx: Math.cos(a) * b.bsp! * fast, vy: Math.sin(a) * b.bsp! * fast, kind: "dot", ttl: 999 });
        }
        if (b.bombMs && n.act <= 0 && G.eshots.filter((s) => s.kind === "bomb").length < 8) {
          n.act = (b.bombMs / TICK) * rnd(0.8, 1.3);
          const a = rnd(0, Math.PI * 2);
          G.eshots.push({ x: n.x, y: n.y, vx: Math.cos(a) * 2.6 * fast, vy: Math.sin(a) * 2.6 * fast, kind: "bomb", ttl: 999 });
        }
        // move + bounce off the walls (MOVENCHK: negate the crossing component)
        if (!(n.breed === 4 && n.state === 1)) {
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < b.r) { n.x = b.r; n.vx = -n.vx; }
          if (n.x > FW - b.r) { n.x = FW - b.r; n.vx = -n.vx; }
          if (n.y < b.r) { n.y = b.r; n.vy = -n.vy; }
          if (n.y > FH - b.r) { n.y = FH - b.r; n.vy = -n.vy; }
        }
      }

      // enemy projectiles — bombs bounce forever, everything else dies at edges
      for (let i = G.eshots.length - 1; i >= 0; i--) {
        const s = G.eshots[i];
        s.x += s.vx;
        s.y += s.vy;
        if (s.kind === "bomb") {
          if (s.x < 5) { s.x = 5; s.vx = -s.vx; synth.bounce(); }
          if (s.x > FW - 5) { s.x = FW - 5; s.vx = -s.vx; synth.bounce(); }
          if (s.y < 5) { s.y = 5; s.vy = -s.vy; synth.bounce(); }
          if (s.y > FH - 5) { s.y = FH - 5; s.vy = -s.vy; synth.bounce(); }
        } else {
          if (s.kind === "shrap") s.ttl -= 1;
          if (s.ttl <= 0 || s.x < 0 || s.x > FW || s.y < 0 || s.y > FH) G.eshots.splice(i, 1);
        }
      }
      for (let i = G.lasers.length - 1; i >= 0; i--) if (--G.lasers[i].ttl <= 0) G.lasers.splice(i, 1);

      // bonus crystal: skitters across at random intervals
      if (G.bonus) {
        G.bonus.t += 1;
        G.bonus.x += G.bonus.vx;
        G.bonus.y += Math.sin(G.bonus.t * 0.12) * 1.3;
        if (G.bonus.x < -20 || G.bonus.x > FW + 20) G.bonus = null;
      } else {
        G.bonusCd -= TICK;
        if (G.bonusCd <= 0 && G.waveTime > 4) {
          const left = Math.random() < 0.5;
          G.bonus = { x: left ? -14 : FW + 14, y: rnd(50, FH - 80), vx: (left ? 1 : -1) * rnd(1.6, 2.6), t: 0 };
          G.bonusCd = rnd(14000, 30000);
        }
      }

      // gate slide (later waves)
      if (p.gateMoves) {
        G.gateX += G.gateDir * p.gateSpeed * fast;
        if (G.gateX < 70) { G.gateX = 70; G.gateDir = 1; }
        if (G.gateX > FW - 70) { G.gateX = FW - 70; G.gateDir = -1; }
      }

      stepParticles();
      for (let i = G.floats.length - 1; i >= 0; i--) {
        const f = G.floats[i];
        f.y -= 0.5;
        if (--f.ttl <= 0) G.floats.splice(i, 1);
      }

      // ---- ship collisions -------------------------------------------------
      const sx = G.ship.x;
      const sy = G.ship.y;
      for (let i = G.crystals.length - 1; i >= 0; i--) {
        const c = G.crystals[i];
        if (Math.hypot(sx - c.x, sy - c.y) < SHIP_R + 6) {
          G.crystals.splice(i, 1);
          G.collected++;
          addScore(CRYSTAL_PTS);
          synth.crystal();
          if (G.crystals.length === 0) {
            G.gateOpen = true;
            synth.gateOpen();
          }
        }
      }
      for (const pk of G.pickups) {
        if (Math.hypot(sx - pk.x, sy - pk.y) < SHIP_R + 7) {
          G.pickups = G.pickups.filter((q) => q !== pk);
          G.bombs++;
          synth.pickup();
          G.floats.push({ x: pk.x, y: pk.y - 10, text: "+BOMB", color: C.clayLite, ttl: 40 });
        }
      }
      if (G.bonus && Math.hypot(sx - G.bonus.x, sy - G.bonus.y) < SHIP_R + 11) {
        const val = Math.round(rnd(10, 50)) * 1000;
        addScore(val);
        synth.bonusCatch();
        G.floats.push({ x: G.bonus.x, y: G.bonus.y - 12, text: "+" + val, color: C.green, ttl: 60 });
        G.bonus = null;
      }
      let dead = false;
      for (const m of G.mines) if (Math.hypot(sx - m.x, sy - m.y) < SHIP_R + 5) dead = true;
      for (const n of G.nasties) if (Math.hypot(sx - n.x, sy - n.y) < SHIP_R + BREEDS[n.breed].r - 2) dead = true;
      for (const s of G.eshots) if (Math.hypot(sx - s.x, sy - s.y) < SHIP_R + (s.kind === "bomb" ? 5 : 3)) dead = true;
      for (const l of G.lasers) if (Math.abs(sx - l.x) < SHIP_R || Math.abs(sy - l.y) < SHIP_R) dead = true;
      for (const r of portalRects()) if (circleHitsRect(sx, sy, SHIP_R - 1, r)) dead = true;
      const gr = gateRects();
      for (const r of gr.posts) if (circleHitsRect(sx, sy, SHIP_R - 1, r)) dead = true;
      if (!G.gateOpen && circleHitsRect(sx, sy, SHIP_R - 1, gr.opening)) dead = true;
      if (dead) { die(); return; }
      if (G.gateOpen && sy > FH - 10 && Math.abs(sx - G.gateX) < GATE_HALF - SHIP_R + 2) completeWave();
    }
    function stepParticles() {
      for (let i = G.particles.length - 1; i >= 0; i--) {
        const q = G.particles[i];
        q.x += q.vx;
        q.y += q.vy;
        if (--q.ttl <= 0) G.particles.splice(i, 1);
      }
    }

    // ---- drawing -----------------------------------------------------------
    const F = (px: number, w = 400) => `${w} ${px}px ${fontFam}`;
    function star(x: number, y: number, r: number, color: string) {
      if (!ctx) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y + r);
      ctx.moveTo(x - r * 0.4, y - r * 0.4);
      ctx.lineTo(x + r * 0.4, y + r * 0.4);
      ctx.moveTo(x + r * 0.4, y - r * 0.4);
      ctx.lineTo(x - r * 0.4, y + r * 0.4);
      ctx.stroke();
    }
    function poly(x: number, y: number, r: number, sides: number, rot: number, color: string, fill = true) {
      if (!ctx) return;
      ctx.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = rot + (i / sides) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      if (fill) { ctx.fillStyle = color; ctx.fill(); }
      else { ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    function drawNasty(n: Nasty) {
      if (!ctx) return;
      const b = BREEDS[n.breed];
      const { x, y } = n;
      switch (n.breed) {
        case 0: // annoyer — dot with eyes
          ctx.fillStyle = b.color;
          ctx.beginPath();
          ctx.arc(x, y, b.r - 1, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = C.fieldBg;
          ctx.fillRect(x - 3, y - 2, 2, 2);
          ctx.fillRect(x + 1, y - 2, 2, 2);
          break;
        case 1: poly(x, y, b.r, 3, Math.atan2(n.vy, n.vx), b.color); break; // worrier — dart
        case 2: poly(x, y, b.r, 4, n.seed, b.color, false); poly(x, y, b.r - 4, 4, n.seed, b.color); break; // pest
        case 3: { // dumple — big wobbling blob of space jelly
          const w = Math.sin(performance.now() / 130 + n.seed) * 1.8;
          ctx.fillStyle = b.color;
          ctx.beginPath();
          ctx.ellipse(x, y, b.r + w, b.r - w, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = C.fieldBg;
          ctx.fillRect(x - 4, y - 3, 2, 3);
          ctx.fillRect(x + 2, y - 3, 2, 3);
          if (n.hp < (b.hp || 4)) { ctx.strokeStyle = C.bright; ctx.lineWidth = 1; ctx.stroke(); }
          break;
        }
        case 4: { // trimpet — plus-glyph; dim when asleep
          const col = n.state === 1 ? C.dim : b.color;
          ctx.fillStyle = col;
          ctx.fillRect(x - b.r, y - 2.5, b.r * 2, 5);
          ctx.fillRect(x - 2.5, y - b.r, 5, b.r * 2);
          break;
        }
        case 5: poly(x, y, b.r, 3, Math.atan2(n.vy, n.vx), b.color, false); poly(x, y, b.r - 3.5, 3, Math.atan2(n.vy, n.vx), b.color); break; // husket
        case 6: { // tentawarble — wiggly star, flares clay mid-pounce
          const col = n.state === 1 ? C.clay : b.color;
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2 + Math.sin(performance.now() / 160 + n.seed + k) * 0.35;
            ctx.strokeStyle = col;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(a) * b.r, y + Math.sin(a) * b.r);
            ctx.stroke();
          }
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 7: poly(x, y, b.r, 6, n.seed, b.color, false); poly(x, y, b.r - 3.5, 6, n.seed, b.color); break; // zarklephaser
        case 8: { // menace — cross that flashes before firing
          const col = n.state === 1 && Math.floor(performance.now() / 90) % 2 === 0 ? C.clay : b.color;
          ctx.strokeStyle = col;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(x - b.r, y);
          ctx.lineTo(x + b.r, y);
          ctx.moveTo(x, y - b.r);
          ctx.lineTo(x, y + b.r);
          ctx.stroke();
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 9: poly(x, y, b.r, 5, -Math.PI / 2, b.color); break; // bane — pentagon
        case 10: // shrapwarden — a sweet, harmless-looking ring
          ctx.strokeStyle = b.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, b.r - 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = b.color;
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
          break;
        default: { // parasite — pulsing hungry circle
          const pu = 1 + Math.sin(performance.now() / 90) * 0.18;
          ctx.fillStyle = b.color;
          ctx.beginPath();
          ctx.arc(x, y, (b.r - 1) * pu, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = C.fieldBg;
          ctx.beginPath();
          ctx.arc(x + 2, y, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    function drawShip(x: number, y: number) {
      if (!ctx) return;
      ctx.fillStyle = C.bright;
      ctx.beginPath();
      ctx.arc(x, y, SHIP_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.clay; // the rosette ring
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * 4.4, y + Math.sin(a) * 4.4, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    function centered(text: string, y: number, px: number, color: string, weight = 700, italic = false) {
      if (!ctx) return;
      ctx.font = `${italic ? "italic " : ""}${weight} ${px}px ${fontFam}`;
      ctx.textAlign = "center";
      ctx.fillStyle = color;
      ctx.fillText(text, FW / 2, y);
      ctx.textAlign = "left";
    }

    function render() {
      if (!canvas || !ctx) return;
      // browser zoom can change devicePixelRatio without a box resize
      if (Math.min(window.devicePixelRatio || 1, 2) !== dpr) resize();
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, FW, FH + HUD);
      ctx.fillStyle = C.fieldBg;
      ctx.fillRect(0, 0, FW, FH + HUD);

      // HUD strip
      ctx.font = F(10, 700);
      ctx.fillStyle = C.meta;
      ctx.fillText("SCORE", 10, 17);
      ctx.fillStyle = C.bright;
      ctx.font = F(11, 700);
      ctx.fillText(String(G.score).padStart(7, "0"), 52, 17);
      for (let i = 0; i < Math.min(G.ships - 1, 6); i++) drawShipIcon(140 + i * 14, 12.5);
      for (let i = 0; i < Math.min(G.bombs, 6); i++) drawBombIcon(240 + i * 12, 12.5);
      ctx.font = F(10, 700);
      ctx.fillStyle = C.meta;
      ctx.textAlign = "right";
      ctx.fillText("WAVE", 400, 17);
      ctx.fillStyle = C.bright;
      ctx.fillText(String(G.wave), 424, 17);
      ctx.fillStyle = C.meta;
      ctx.fillText("TIME", 478, 17);
      ctx.fillStyle = C.bright;
      ctx.fillText(String(Math.floor(G.waveTime)), 502, 17);
      ctx.textAlign = "left";
      ctx.strokeStyle = C.wallDim;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, HUD - 0.5);
      ctx.lineTo(FW, HUD - 0.5);
      ctx.stroke();

      // field space — clipped so nothing near the top edge paints over the HUD
      ctx.save();
      ctx.translate(0, HUD);
      ctx.beginPath();
      ctx.rect(0, 0, FW, FH);
      ctx.clip();
      ctx.strokeStyle = C.wall;
      ctx.strokeRect(0.5, 0.5, FW - 1, FH - 1);

      // portals — striped pods on the side walls
      for (const r of portalRects()) {
        const stripes = [C.clay, C.green, C.clayLite, C.clay, C.green, C.clayLite];
        const hh = r.h / stripes.length;
        stripes.forEach((col, i) => {
          ctx.fillStyle = col;
          ctx.fillRect(r.x, r.y + i * hh, r.w, hh - 1);
        });
      }

      // gate
      const gr = gateRects();
      ctx.fillStyle = C.wall;
      for (const r of gr.posts) ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = C.clay;
      for (const r of gr.posts) ctx.fillRect(r.x, r.y, r.w, 2);
      if (!G.gateOpen) {
        const dots = [C.clay, C.green, C.clayLite, C.clay, C.green, C.clayLite, C.clay];
        dots.forEach((col, i) => {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(G.gateX - GATE_HALF + ((i + 0.5) * (GATE_HALF * 2)) / dots.length, FH - 3.5, 2, 0, Math.PI * 2);
          ctx.fill();
        });
      } else {
        ctx.fillStyle = C.green;
        ctx.fillRect(G.gateX - GATE_HALF, FH - 2, GATE_HALF * 2, 2);
      }

      if (G.state !== "title" && G.state !== "gameover") {
        for (const m of G.mines) {
          if (m.fake) star(m.x, m.y, 5, C.clayLite);
          else {
            ctx.strokeStyle = C.meta;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(m.x, m.y, 5, 0, Math.PI * 2);
            ctx.moveTo(m.x - 3.5, m.y - 3.5);
            ctx.lineTo(m.x + 3.5, m.y + 3.5);
            ctx.moveTo(m.x + 3.5, m.y - 3.5);
            ctx.lineTo(m.x - 3.5, m.y + 3.5);
            ctx.stroke();
          }
        }
        for (const c of G.crystals) star(c.x, c.y, 5, C.green);
        for (const pk of G.pickups) drawBombIcon(pk.x, pk.y, 1.4);
        if (G.bonus) {
          poly(G.bonus.x, G.bonus.y, 11, 4, 0, C.bright, false);
          star(G.bonus.x, G.bonus.y, 4, C.green);
        }
        for (const n of G.nasties) drawNasty(n);
        for (const l of G.lasers) {
          ctx.strokeStyle = C.clayLite;
          ctx.globalAlpha = Math.min(1, l.ttl / 8);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, l.y);
          ctx.lineTo(FW, l.y);
          ctx.moveTo(l.x, 0);
          ctx.lineTo(l.x, FH);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        for (const s of G.eshots) {
          if (s.kind === "bomb") {
            ctx.fillStyle = C.clay;
            ctx.beginPath();
            ctx.arc(s.x, s.y, 4.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = C.clayLite;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(s.x + 2, s.y - 4);
            ctx.lineTo(s.x + 4.5, s.y - 7);
            ctx.stroke();
          } else if (s.kind === "shrap") {
            ctx.strokeStyle = C.clayLite;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(s.x - s.vx, s.y - s.vy);
            ctx.stroke();
          } else {
            ctx.fillStyle = C.clayLite;
            ctx.beginPath();
            ctx.arc(s.x, s.y, 2.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.fillStyle = C.bright;
        for (const s of G.shots) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        if (G.state !== "dying") drawShip(G.ship.x, G.ship.y);
        for (const q of G.particles) {
          ctx.globalAlpha = Math.min(1, q.ttl / 12);
          ctx.fillStyle = q.color;
          ctx.fillRect(q.x - 1.2, q.y - 1.2, 2.4, 2.4);
          ctx.globalAlpha = 1;
        }
        ctx.font = F(10, 700);
        for (const f of G.floats) {
          ctx.fillStyle = f.color;
          ctx.globalAlpha = Math.min(1, f.ttl / 15);
          ctx.textAlign = "center";
          ctx.fillText(f.text, f.x, f.y);
          ctx.textAlign = "left";
          ctx.globalAlpha = 1;
        }
      }

      // overlays
      if (G.state === "title") {
        for (let i = 0; i < 14; i++) {
          const a = (i * 2654435761) % 1000;
          star(30 + ((a * 452) % (FW - 60)), 30 + ((a * 279) % (FH - 90)), 3 + (a % 3), i % 3 === 0 ? C.clayLite : C.green);
        }
        centered("CRYSTAL QUEST", 120, 34, C.bright, 800);
        centered("after Patrick Buckland · 1987", 142, 11, C.meta, 400);
        centered("the mouse changes your velocity — not your position", 185, 11, C.body, 400);
        centered("click or a–z fire in the direction of motion · space smart-bomb · tab pause", 203, 11, C.body, 400);
        centered("collect every crystal, then exit through the gate", 221, 11, C.body, 400);
        centered("the gate posts and portals are lethal — the walls are not", 239, 11, C.body, 400);
        centered("CLICK TO START", 280, 14, C.clay, 700);
        centered("⌥-click for super-fast mode", 300, 10, C.dim, 400);
        if (G.hi > 0) centered("hi-score  " + String(G.hi).padStart(7, "0"), 325, 11, C.green, 700, G.hiFast);
      } else if (G.state === "ready") {
        centered("WAVE " + G.wave, FH / 2 - 44, 22, C.bright, 800);
        if (G.notice) centered(G.notice, FH / 2 - 20, 12, C.green, 700);
        centered("CLICK MOUSE TO GO", FH / 2 + 46, 13, C.clay, 700);
      } else if (G.state === "paused") {
        centered("PAUSED", FH / 2 - 8, 22, C.bright, 800);
        centered("any key or the mouse button continues", FH / 2 + 16, 11, C.body, 400);
      } else if (G.state === "gameover") {
        centered("GAME OVER", 130, 28, C.bright, 800);
        centered("score  " + String(G.score).padStart(7, "0"), 170, 13, C.text, 700, G.fast);
        if (G.newHi) centered("NEW HIGH SCORE", 194, 13, C.green, 700);
        else if (G.hi > 0) centered("hi-score  " + String(G.hi).padStart(7, "0"), 194, 11, C.meta, 400, G.hiFast);
        centered("reached wave " + G.wave, 222, 11, C.body, 400);
        centered("CLICK FOR TITLE", 268, 13, C.clay, 700);
      }
      ctx.restore();
    }
    function drawShipIcon(x: number, y: number) {
      if (!ctx) return;
      ctx.fillStyle = C.bright;
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.clay;
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    function drawBombIcon(x: number, y: number, s = 1) {
      if (!ctx) return;
      ctx.fillStyle = C.clay;
      ctx.beginPath();
      ctx.arc(x, y, 3.6 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.clayLite;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 1.8 * s, y - 3 * s);
      ctx.lineTo(x + 4 * s, y - 6 * s);
      ctx.stroke();
      ctx.fillStyle = C.bright;
      ctx.fillRect(x - 1.6 * s, y - 1.6 * s, 1.4 * s, 1.4 * s);
    }

    // ---- loop control -------------------------------------------------------
    let raf = 0;
    let looping = false;
    let last = 0;
    let acc = 0;
    function loop(now: number) {
      if (!looping) return;
      const dt = Math.min(now - last, 200);
      last = now;
      acc += dt;
      let n = 0;
      while (acc >= TICK && n < 5) {
        step();
        acc -= TICK;
        n++;
        if (!looping) break; // a step may end the session
      }
      if (acc > TICK) acc = TICK; // drop backlog beyond one tick — slow frames slow the game, never fast-forward it
      render();
      if (looping) raf = requestAnimationFrame(loop);
    }
    function startLoop() {
      if (looping) return;
      looping = true;
      last = performance.now();
      acc = 0;
      raf = requestAnimationFrame(loop);
    }
    function stopLoop() {
      looping = false;
      cancelAnimationFrame(raf);
    }

    // ---- input --------------------------------------------------------------
    const locked = () => document.pointerLockElement === canvas;
    const el = canvas as HTMLCanvasElement & {
      requestPointerLock?: (o?: { unadjustedMovement?: boolean }) => Promise<void> | void;
    };
    const lockSupported = typeof el.requestPointerLock === "function";
    // A lock request can fail (iframe without allow="pointer-lock", Chrome's
    // ~1.3s post-Escape cooldown, automation, no API at all). Steering is the
    // whole game, so a failure while "playing" drops back to PAUSED rather
    // than leaving the ship in an unsteerable drift.
    function lockFailed() {
      if (G.state === "playing") pause();
    }
    function requestLock() {
      if (!lockSupported || locked()) return;
      // unadjustedMovement disables OS mouse acceleration — closest to the raw
      // quadrature mouse the physics were designed around
      const guard = (p: Promise<void> | void, retry: boolean) => {
        if (p && typeof (p as Promise<void>).catch === "function") {
          (p as Promise<void>).catch(() => { if (retry) attempt(false); else lockFailed(); });
        }
      };
      const attempt = (unadjusted: boolean) => {
        try {
          guard(unadjusted ? el.requestPointerLock!({ unadjustedMovement: true }) : el.requestPointerLock!(), unadjusted);
        } catch {
          if (unadjusted) attempt(false);
          else lockFailed();
        }
      };
      attempt(true);
    }
    function onMouseDown(e: MouseEvent) {
      if (e.target !== canvas && !locked()) return;
      e.preventDefault();
      synth.ensure();
      if (G.state === "title") {
        G.fast = e.altKey;
        G.wave = 1;
        G.score = 0;
        G.ships = START_SHIPS;
        G.bombs = START_BOMBS;
        G.nextLifeAt = 15000;
        G.newHi = false;
        G.notice = "";
        buildWave();
        requestLock();
        toReady();
      } else if (G.state === "ready") {
        requestLock();
        G.offset = { x: 0, y: 0 };
        G.state = "playing";
        startLoop();
      } else if (G.state === "paused") {
        requestLock();
        G.state = "playing";
        startLoop();
      } else if (G.state === "playing") {
        if (lockSupported && !locked()) {
          requestLock(); // steering lost mid-play — this click re-arms it
          return;
        }
        fire(); // one shot per click — no auto-fire
      } else if (G.state === "gameover") {
        G.state = "title";
        stopLoop();
        render();
      }
    }
    function pause() {
      if (G.state !== "playing") return;
      G.state = "paused";
      stopLoop();
      render();
    }
    function onKeyDown(e: KeyboardEvent) {
      const active = G.state === "playing" || G.state === "paused" || G.state === "ready";
      if (!active) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.repeat) return; // the original ignored autoKey events — no auto-fire
      if (e.key >= "0" && e.key <= "9") {
        synth.ensure();
        synth.setVolume(Number(e.key));
        G.floats.push({ x: G.ship.x, y: G.ship.y - 14, text: "VOL " + e.key, color: C.meta, ttl: 30 });
        e.preventDefault();
        return;
      }
      if (G.state === "paused") {
        if (/^F\d+$/.test(e.key)) return; // browser keys (F5…) stay the browser's
        // "Any key or the mouse button lets you continue." — keydown carries
        // user activation, so steering is re-armed here too
        e.preventDefault();
        requestLock();
        G.state = "playing";
        startLoop();
        return;
      }
      if (G.state !== "playing") return;
      if (e.key === "Tab") {
        e.preventDefault();
        pause();
      } else if (e.key === " ") {
        e.preventDefault();
        smartBomb();
      } else if (/^[a-z]$/i.test(e.key) || /^Key[A-Z]$/.test(e.code)) {
        e.preventDefault();
        fire(); // "the mouse button or any letter key fires" — e.code covers non-Latin layouts
      }
    }
    function onMouseMove(e: MouseEvent) {
      if (!locked() || G.state !== "playing") return;
      // the hidden cursor clamps at the screen bounds, exactly like RawMouse
      G.offset.x = clamp(G.offset.x + e.movementX * SENS, -FW / 2, FW / 2);
      G.offset.y = clamp(G.offset.y + e.movementY * SENS, -FH / 2, FH / 2);
    }
    function onLockChange() {
      if (!locked() && G.state === "playing") pause();
    }
    function onLockError() {
      lockFailed();
    }
    function onVisibility() {
      if (document.hidden) pause();
    }
    function onContext(e: Event) {
      e.preventDefault();
    }

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("contextmenu", onContext);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("pointerlockerror", onLockError);
    document.addEventListener("visibilitychange", onVisibility);
    const ro = new ResizeObserver(() => {
      resize();
      render(); // resetting canvas.width wipes the bitmap — repaint immediately, mid-play too
    });
    ro.observe(canvas);
    resize();
    render();

    return () => {
      stopLoop();
      ro.disconnect();
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("contextmenu", onContext);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("pointerlockerror", onLockError);
      document.removeEventListener("visibilitychange", onVisibility);
      if (locked()) document.exitPointerLock();
      synth.ctx?.close().catch(() => undefined);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-label="Crystal Quest — a mouse-controlled arcade game. Click the canvas to start."
      style={{
        display: "block",
        width: "100%",
        aspectRatio: `${FW} / ${FH + HUD}`,
        background: "#0e1119",
        cursor: "crosshair",
        touchAction: "none",
      }}
    />
  );
}
