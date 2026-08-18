// The Node↔browser parity suite — the byte-identical tripwire. It loads the
// sim through server/sim-host.mjs (raw camera-free step() + the input ring,
// never clientStep) and replays every committed golden fixture: the five
// event-mode hash traces, the two event-stream traces, and the three
// tickMode traces. Every hash must equal the browser-committed hash EXACTLY.
// A divergence means the headless port is wrong — fix the port; this file
// has no capture mode and never writes the fixture.
//
// The replay injects the SAME sim inputs the browser suite's dispatched
// events produced. Event mode: each mousemove landed as one thrustImpulse
// through the production listener — this runner calls the same function with
// the same deltas on the same tick. Tick mode: each tick's accumulated
// deltas were banked as one ring frame at the client boundary — this runner
// pushes the identical record through pushInputFrame(0, ...). The stored-aim state the
// browser's pointer left behind (it is hashed) reproduces through the same
// setters against the DOM stub's capture-matched 780×493 letterbox.
//
// Usage: node test/node-golden.mjs        (exit 0 only if every trace matches)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pushInputFrame, stepTick, test, wireState } from "../server/sim-host.mjs";
import { encodeSnapshot } from "../server/snapshot.mjs";
import { STUB_VIEWPORT } from "../server/dom-stub.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const T = test();
const enc = T.enc;

const R = [];
const ok = (name, cond, info) => R.push({ name, pass: !!cond, info: info === undefined ? "" : String(info) });

let fx = null;
try {
  fx = JSON.parse(readFileSync(join(ROOT, "tests", "fixtures", "golden.json"), "utf8"));
} catch { /* judged below */ }
ok("the golden fixture loads", !!(fx && fx.traces), fx ? "" : "tests/fixtures/golden.json missing or unparsable");
if (!fx || !fx.traces) {
  console.log("node-golden ERROR: no fixture to replay");
  process.exit(1);
}

// ---- the drive layer -------------------------------------------------------
// MODE mirrors the sim's INPUTMODE; `pending` is the runner's copy of the
// client boundary's accumulator: the deltas dispatched since the last tick,
// banked as ONE frame at the next step — the cadence bankTickInput keeps.
let MODE = "event";
let pending = null;
let traceStart = 0;
let evLog = null; // when non-null, every drained (tick, kind, gain) lands here

const emptyFrame = () => ({ tx: 0, ty: 0, ax: 0, ay: 0,
  cx: T.cam.x + 256, cy: T.cam.y + 171, // the parked view cursor's world point — sets
  fp: 0, fh: false, kx: 0, ky: 0,       // only the (unhashed) sim cursor, as the browser banks
  rh: 0 }); // the tick-mode fixture preps fly NON-INVERTED with the right
            // button RELEASED (right-hold is comet mode now, and the flight
            // traces pin the stock envelope) — the browser banks rh:0 there,
            // so the replay's frames carry the same
const tick1 = () => {
  const r = stepTick();
  if (evLog) {
    for (const e of r.events) {
      evLog.push({ tick: r.tick, kind: e.kind, gain: e.gain === undefined ? null : e.gain });
    }
  }
};
const bankStep = () => { // one client tick: bank the accumulated frame, then step
  pushInputFrame(0, pending || emptyFrame());
  pending = null;
  tick1();
};
const advance = (n) => { for (let i = 0; i < n; i++) (MODE === "tick" ? bankStep() : tick1()); };

// the browser scripts' shape: one event per tick, buttons 2 — see
// tests/golden-traces.js. Only dx/dy reach the sim; replay() places them.
const script = (segs) => {
  const evs = [];
  for (const s of segs) for (let i = 0; i < s.n; i++) evs.push({ dx: s.dx, dy: s.dy });
  return evs;
};
// replayInput's interleave, minus the DOM: the event for tick k lands after
// the step that reached tick k, and the LAST event stays un-stepped — the
// trace code's own advance() consumes it, exactly as enc.advance(1) did.
const replay = (evs) => {
  for (let k = 0; k < evs.length; k++) {
    if (k > 0) (MODE === "tick" ? bankStep() : tick1());
    if (MODE === "tick") pending = { ...emptyFrame(), tx: evs[k].dx, ty: evs[k].dy };
    else T.thrustImpulse(evs[k].dx, evs[k].dy);
  }
};

// ---- the preps -------------------------------------------------------------
// The pointer story the fixtures baked in: the browser suite parked the
// native pointer at client (0,0) before the event traces (section A's
// recorder dispatches) and at (innerWidth/2+100, innerHeight/2) before the
// tickMode traces (section L). The stored-aim snapshot each prep takes reads
// that pointer through the letterbox — and the result is hashed — so this
// runner parks the same pointer before each set. mouse.seen drops back to
// false after every prep: the sim path (openShop's hover seed) must never
// resolve a client pointer headless, and the browser's resolution there only
// touched unhashed hover state.
const seedPointer = (x, y) => T.setMouseClient(x, y);
const prepDone = () => { T.G.mouse.seen = false; traceStart = T.simTick(); };
// score is hashed and restart-surviving — every judged trace pins its start
const zeroScores = () => { for (const S of enc.E.seats) S.score = 0; };

const flightPrep = (mode) => {
  T.G.mouse.seen = true;
  enc.reset();
  zeroScores();
  enc.E.groups = [];
  T.G.started = true;
  T.G.running = true;
  T.setAimMode("mouse");
  T.setInputMode(mode || "event");
  MODE = mode || "event";
  pending = null;
  T.setInvert(false);    // non-inverted, right button released — the browser's
  T.setRightHeld(false); // stock-envelope staging, comet OFF (see golden-traces.js)
  // the stored aim is HASHED and sticky — pinned to the same known start the
  // browser prep pins (duoPrep's idiom), and the comet flag with it, because
  // setRightHeld only states a WANT now and the sim's gate owns the flag. The
  // ENERGY pool is hashed too, so it is pinned FULL through the production fill.
  for (const P of T.players) { P.aimAngle = 0; P.aimOff.x = 0; P.aimOff.y = 0; P.aimed = false; P.comet = false; }
  for (let s = 0; s < T.players.length; s++) T.energyFill(s);
  prepDone();
};
const evPrep = () => {
  T.G.mouse.seen = true;
  enc.reset();
  zeroScores();
  T.setAimMode("mouse");
  T.setInvert(true);
  T.setRightHeld(true);
  T.players[0].comet = false;           // staged OFF despite the held right button (the
  T.players[0].input.cometWant = false; // browser prep pins the same): these traces exist
  // to pin the lance damage and the cue stream, and comet negation would hollow
  // both — the comet's own trace is comet-run below. The WANT is cleared too:
  // setRightHeld only states it now, and the sim's gate would re-raise the flag
  // from a held want on the very next tick
  T.G.aimed = false;
  T.G.leftHeld = false;
  T.G.started = true;
  T.G.running = true;
  MODE = "event";
  pending = null;
  prepDone();
};

// ---- checkpoints and judgment ----------------------------------------------
const cp = (tag) => ({
  tag,
  tick: T.simTick() - traceStart,
  hash: T.hashState(),
  parts: T.hashParts(),
  ship: { x: T.G.ship.x, y: T.G.ship.y, vx: T.G.vel.x, vy: T.G.vel.y },
  ships: T.players.map((P) => ({ x: P.ship.x, y: P.ship.y, vx: P.vel.x, vy: P.vel.y })),
  rng: enc.rngState(),
  st: (() => { const s = enc.state(); return { state: s.state, wave: s.wave, kills: s.kills,
    xp: s.xp, hull: s.hull, enemies: s.enemies, orbs: s.orbs }; })(),
});

const judge = (name, got, traceSet, setLabel) => {
  const want = traceSet && traceSet[name];
  ok(name + ": fixture holds the trace", !!want && want.checkpoints.length === got.length,
     want ? "want " + want.checkpoints.length + " checkpoints, got " + got.length
          : name + " missing from the " + setLabel + " fixture set");
  if (!want || want.checkpoints.length !== got.length) {
    console.log("  " + name + ": FIXTURE MISMATCH");
    return;
  }
  let firstDiv = null;
  want.checkpoints.forEach((w, i) => {
    const g = got[i];
    const pass = g.tick === w.tick && g.hash === w.hash && g.rng === w.rng &&
                 JSON.stringify(g.st) === JSON.stringify(w.st) &&
                 (!w.ships || JSON.stringify(g.ships) === JSON.stringify(w.ships));
    if (!pass && firstDiv === null) firstDiv = w.tag;
    ok(name + " @" + w.tag + ": byte-identical in Node", pass,
       pass ? g.hash
            : "hash got " + g.hash + " want " + w.hash +
              " · tick " + g.tick + " vs " + w.tick +
              " · rng " + g.rng + " vs " + w.rng +
              " · parts moved: " + (Object.keys(w.parts)
                  .filter((p) => g.parts[p] !== w.parts[p]).join(",") || "none") +
              " · ship got " + JSON.stringify(g.ship) + " want " + JSON.stringify(w.ship));
  });
  console.log(firstDiv === null
    ? "  " + name + ": " + got.length + "/" + got.length + " checkpoints byte-identical"
    : "  " + name + ": DIVERGED, first at @" + firstDiv);
};

const judgeEvents = (name, got) => {
  const want = fx.traces[name];
  ok(name + ": fixture holds the committed event stream", !!(want && Array.isArray(want.events)),
     want ? "" : name + " missing from fixture");
  if (!want || !Array.isArray(want.events)) return;
  let div = -1;
  const n = Math.max(got.length, want.events.length);
  for (let i = 0; i < n && div < 0; i++) {
    if (JSON.stringify(got[i]) !== JSON.stringify(want.events[i])) div = i;
  }
  ok(name + ": the full (tick, kind, gain) sequence matches", div < 0,
     div < 0 ? got.length + " events"
             : "first divergence at " + div + ": got " + JSON.stringify(got[div] || null) +
               " want " + JSON.stringify(want.events[div] || null));
  console.log(div < 0
    ? "  " + name + ": " + got.length + "/" + want.events.length + " events byte-identical"
    : "  " + name + ": DIVERGED at event " + div);
};

// ---- the diagnosis line: constants vs code ---------------------------------
if (fx.meta) {
  const live = { tunables: enc.tunables(), flight: T.flightTunables() };
  ok("the live tunable set matches the fixture's capture record",
     JSON.stringify(live) === JSON.stringify({ tunables: fx.meta.tunables, flight: fx.meta.flight }),
     JSON.stringify(live));
}
// the viewport line of the same diagnosis: the fixtures bake the capture
// window's letterbox into hashed stored-aim state, and the DOM stub hardcodes
// that geometry — a drift between the two must fail HERE, with a named cause,
// never as a bare hash mismatch downstream
const vpCheck = (label, meta) => {
  if (!meta || !meta.viewport) return;
  ok(label + ": the recorded capture viewport matches the DOM stub's geometry",
     JSON.stringify(meta.viewport) === JSON.stringify(STUB_VIEWPORT),
     "fixture " + JSON.stringify(meta.viewport) + " vs stub " + JSON.stringify(STUB_VIEWPORT));
};
vpCheck("meta", fx.meta);
vpCheck("tickMode.meta", fx.tickMode && fx.tickMode.meta);

// ---- the event-mode traces (fixture.traces) --------------------------------
seedPointer(0, 0);

// C. rest-to-top-speed
flightPrep();
const g1 = [];
replay(script([{ n: 10, dx: 8, dy: 0 }]));
advance(1);
g1.push(cp("mid-ramp"));
replay(script([{ n: 230, dx: 8, dy: 0 }]));
advance(1);
g1.push(cp("at-the-clamp"));
advance(120);
g1.push(cp("coasting"));
judge("rest-to-top-speed", g1, fx.traces, "event");

// D. flick-turn
flightPrep();
const g2 = [];
replay(script([{ n: 120, dx: 8, dy: 0 }]));
advance(1);
g2.push(cp("at-speed"));
replay(script([{ n: 40, dx: 0, dy: 60 }]));
advance(1);
g2.push(cp("after-flick"));
advance(60);
g2.push(cp("settled"));
replay(script([{ n: 40, dx: 9, dy: 5 }]));
advance(1);
g2.push(cp("diagonal"));
judge("flick-turn", g2, fx.traces, "event");

// E. wall-bounce
flightPrep();
const g3 = [];
const bounce = (x, y, vx, vy, tag) => {
  T.G.ship.x = x; T.G.ship.y = y;
  T.G.vel.x = vx; T.G.vel.y = vy;
  advance(30);
  g3.push(cp(tag));
};
bounce(20, T.WH / 2, -2, 0, "left");
bounce(T.WW - 20, T.WH / 2, 2, 0, "right");
bounce(T.WW / 2, 20, 0, -2, "top");
bounce(T.WW / 2, T.WH - 20, 0, 2, "bottom");
bounce(20, 20, -Math.SQRT2, -Math.SQRT2, "corner");
judge("wall-bounce", g3, fx.traces, "event");

// F. wave-1-full — the parked ship on driven hull, the fixed rotating sweep.
//
// The sweep's (vx, vy) table is SCENARIO INPUT, not sim state: the browser
// suite computes cos/sin(k · 0.37) in the PAGE realm and the committed
// fixture's bullets integrated those exact doubles. For 14 of the 300
// pushes — all at large arguments, k · 0.37 up to ~664 rad, where the two
// argument reductions part company — Chrome's V8 and Node 22's V8 round one
// ULP apart. Those 14 pairs are pinned here verbatim from the capture
// realm; every other pair computes identically in both. This is a pin, not
// a paper-over: the SIM's own transcendentals run in reduced ranges and
// every other checkpoint in this file proves them byte-identical, and if
// Chrome's math ever moves, the browser suite fails against its own
// fixture before this table can go stale.
const SWEEP_ULP = new Map([
  [516, [-22.610420738286756, 19.717222776995044]],
  [582, [-4.2131234851092385, 29.702686587230136]],
  [642, [10.28001977316694, -28.183704395683986]],
  [654, [-29.910263061301723, -2.3186555595279468]],
  [750, [15.190579320895328, 25.86979512666436]],
  [810, [-9.496732773051683, -28.457197097346853]],
  [876, [-25.79341442461738, -15.319914239966886]],
  [1038, [21.206878865898513, 21.21952612022962]],
  [1134, [5.293560764875495, -29.529277241892846]],
  [1170, [24.066702680639978, -17.910718078337243]],
  [1200, [-15.30453355421376, -25.80254353136421]],
  [1212, [-20.733801608666784, 21.68200799862519]],
  [1434, [-28.189828306342392, 10.263214898799369]],
  [1470, [-27.57932197299931, -11.805973043745169]],
]);
const sweepVel = (k) => {
  const pinned = SWEEP_ULP.get(k);
  if (pinned) return pinned;
  const a = k * 0.37;
  return [Math.cos(a) * 30, Math.sin(a) * 30];
};
const wave1Sweep = (each) => {
  for (let k = 0; k < 1800; k++) {
    const st = enc.E.state;
    if (k % 6 === 0 && (st === "idle" || st === "warning" || st === "active")) {
      const [vx, vy] = sweepVel(k);
      T.G.bullets.push({ x: T.G.ship.x, y: T.G.ship.y, px: T.G.ship.x, py: T.G.ship.y,
        vx, vy, r: 2.2, dmg: 1, owner: "player",
        dead: false, spent: false, ttl: 60 });
    }
    advance(1);
    if (each) each(k);
  }
};
T.G.mouse.seen = true;
enc.reset();
zeroScores();
T.G.started = true;
T.G.running = true;
T.setAimMode("mouse");
T.setInputMode("event");
MODE = "event";
pending = null;
T.setInvert(true);
T.setRightHeld(true);
T.players[0].comet = false;           // pinned OFF — this trace pins damage and XP, and
T.players[0].input.cometWant = false; // comet negation would hollow it (browser prep
                            // matches). The want goes with the flag: the gate owns the
                            // flag now and would re-raise it from a held want next tick
enc.E.hull = 99;
prepDone();
const g4 = [];
wave1Sweep((k) => {
  if (k === 299) g4.push(cp("tick-300"));
  if (k === 899) g4.push(cp("tick-900"));
});
g4.push(cp("tick-1800"));
judge("wave-1-full", g4, fx.traces, "event");

// G. husk-split
T.G.mouse.seen = true;
enc.reset();
zeroScores();
enc.E.groups = [];
enc.E.hull = 99;
T.G.started = true;
T.G.running = true;
T.setAimMode("mouse");
T.setInputMode("event");
MODE = "event";
pending = null;
T.setInvert(true);
T.setRightHeld(true);
T.players[0].comet = false;           // staged OFF like the wave-1 prep — the shard fan
T.players[0].input.cometWant = false; // must burst against a stock ship (browser
                            // matches), and the want goes with the flag or the gate
                            // raises it straight back on the next tick
prepDone();
const g5 = [];
advance(1);
enc.spawnEnemy(T.G.ship.x + 200, T.G.ship.y, 0, "husk");
g5.push(cp("spawned"));
for (let k = 0; k < 6; k++) {
  T.G.bullets.push({ x: T.G.ship.x, y: T.G.ship.y, px: T.G.ship.x, py: T.G.ship.y,
    vx: 40, vy: 0, r: 2.2, dmg: 1, owner: "player", dead: false, spent: false, ttl: 60 });
  advance(12);
}
g5.push(cp("after-split"));
advance(120);
g5.push(cp("aftermath"));
judge("husk-split", g5, fx.traces, "event");

// H. audio-order — the same wave-1 arc with the drained cue stream recorded
evPrep();
enc.E.hull = 99;
traceStart = T.simTick();
evLog = [];
wave1Sweep();
const evGot = evLog.map((e) => ({ tick: e.tick - traceStart, kind: e.kind, gain: e.gain }));
evLog = null;
judgeEvents("audio-order", evGot);

// I. corner-bounce — one thud at the Math.max gain
evPrep();
enc.E.groups = [];
traceStart = T.simTick();
evLog = [];
T.G.ship.x = 30;
T.G.ship.y = 30;
T.G.vel.x = -2;
T.G.vel.y = -2;
advance(30);
const cbGot = evLog.map((e) => ({ tick: e.tick - traceStart, kind: e.kind, gain: e.gain }));
evLog = null;
judgeEvents("corner-bounce", cbGot);

// ---- the tickMode traces (fixture.tickMode.traces) -------------------------
// Section L of the browser suite parks the pointer at (innerWidth/2 + 100,
// innerHeight/2) before these run — under the capture viewport (780×493,
// see dom-stub.mjs) that is client (490, 246.5), and the stored aim those
// fixtures carry resolves to dead ahead of the ship in world space.
const tickSet = fx.tickMode && fx.tickMode.traces;
ok("the fixture carries the tickMode set", !!tickSet, tickSet ? "" : "fixture.tickMode missing");
if (tickSet) {
  seedPointer(780 / 2 + 100, 493 / 2);
  T.setInputLag(0);

  flightPrep("tick");
  const tg1 = [];
  replay(script([{ n: 10, dx: 8, dy: 0 }]));
  advance(1);
  tg1.push(cp("mid-ramp"));
  replay(script([{ n: 230, dx: 8, dy: 0 }]));
  advance(1);
  tg1.push(cp("at-the-clamp"));
  advance(120);
  tg1.push(cp("coasting"));
  judge("tick-rest-to-top-speed", tg1, tickSet, "tickMode");

  flightPrep("tick");
  const tg2 = [];
  replay(script([{ n: 120, dx: 8, dy: 0 }]));
  advance(1);
  tg2.push(cp("at-speed"));
  replay(script([{ n: 40, dx: 0, dy: 60 }]));
  advance(1);
  tg2.push(cp("after-flick"));
  advance(60);
  tg2.push(cp("settled"));
  replay(script([{ n: 40, dx: 9, dy: 5 }]));
  advance(1);
  tg2.push(cp("diagonal"));
  judge("tick-flick-turn", tg2, tickSet, "tickMode");

  flightPrep("tick");
  const tg3 = [];
  const tbounce = (x, y, vx, vy, tag) => {
    T.G.ship.x = x; T.G.ship.y = y;
    T.G.vel.x = vx; T.G.vel.y = vy;
    advance(30);
    tg3.push(cp(tag));
  };
  tbounce(20, T.WH / 2, -2, 0, "left");
  tbounce(T.WW - 20, T.WH / 2, 2, 0, "right");
  tbounce(T.WW / 2, 20, 0, -2, "top");
  tbounce(T.WW / 2, T.WH - 20, 0, 2, "bottom");
  tbounce(20, 20, -Math.SQRT2, -Math.SQRT2, "corner");
  judge("tick-wall-bounce", tg3, tickSet, "tickMode");
}

// ---- the two-seat traces (multi-seat sim, server-shaped) --------------------
// The EXACT scripts of tests/golden-traces.js section Q: seat 1 (and here
// seat 0 too) fed through pushInputFrame with explicit cx,cy, raw stepTick,
// no client boundary, no camera. Same teleports, same synthetic bullets,
// same checkpoint ticks — parity is judged on the committed hashes.
{
  const F = (o) => ({ tx: 0, ty: 0, ax: 0, ay: 0, fp: 0, fh: false, kx: 0, ky: 0, ...o });
  const duoPrep = (seed) => {
    T.setPlayerCount(2);
    T.setInputMode("tick");
    T.setInputLag(0);
    T.setAimMode("locked");
    T.setInvert(true);
    T.setRightHeld(false);
    T.G.leftHeld = false;
    T.G.keys.clear();
    T.G.started = true;
    T.G.running = true;
    enc.restart(seed);
    zeroScores(); // score is hashed and restart-surviving — pin the start
    // aim state AND the comet flag are hashed and sticky — pinned like the browser's,
    // and the ENERGY pool with them: every seat starts FULL with no recharge delay
    // pending, through the production fill so the two files stage byte-identically
    for (const P of T.players) { P.aimAngle = 0; P.aimOff.x = 0; P.aimOff.y = 0; P.aimed = false; P.comet = false; }
    for (let s = 0; s < T.players.length; s++) T.energyFill(s);
    traceStart = T.simTick();
  };

  // duo-flight
  duoPrep(4242);
  enc.E.groups = [];
  const q1 = [];
  for (let k = 0; k < 180; k++) {
    if (k < 60) {
      pushInputFrame(0, F({ tx: 8, ty: 3, cx: 2200, cy: 1400 }));
      pushInputFrame(1, F({ tx: -5, ty: 9, cx: 1200, cy: 2400 }));
    } else if (k < 120) {
      pushInputFrame(0, F({ tx: -4, ty: 6, cx: 2200, cy: 1400, fp: k === 70 ? 1 : 0, fh: k >= 71 && k < 100 }));
      pushInputFrame(1, F({ tx: 7, ty: -2, cx: 1536, cy: 1881, fp: k === 65 ? 1 : 0 }));
    }
    stepTick();
    if (k === 59) q1.push(cp("split-thrust"));
    if (k === 119) q1.push(cp("crossfire"));
  }
  q1.push(cp("coast"));
  judge("duo-flight", q1, fx.traces, "event");

  // duo-aggro
  duoPrep(777);
  enc.E.groups = [];
  enc.E.seats[0].hull = 99;
  enc.E.seats[1].hull = 99;
  const ap0 = T.players[0];
  const ap1 = T.players[1];
  ap0.ship.x = 1000; ap0.ship.y = 1000; ap0.vel.x = 0; ap0.vel.y = 0;
  ap1.ship.x = 1400; ap1.ship.y = 1000; ap1.vel.x = 0; ap1.vel.y = 0;
  enc.spawnEnemy(1080, 1000, 0, "charger");
  const foe = enc.E.enemies[0];
  const q2 = [];
  for (let k = 1; k <= 400; k++) {
    if (k >= 32 && k <= 80) pushInputFrame(0, F({ ty: 24, cx: 1000, cy: 1400 }));
    if (k === 40) T.G.bullets.push({ x: 1300, y: 1000, px: 1300, py: 1000, vx: -40, vy: 0,
      r: 2.2, dmg: 1, owner: 1, dead: false, spent: false, ttl: 60 });
    if (k === 200) T.G.bullets.push({ x: foe.x, y: foe.y - 200, px: foe.x, py: foe.y - 200, vx: 0, vy: 40,
      r: 2.2, dmg: 1, owner: 0, dead: false, spent: false, ttl: 60 });
    stepTick();
    if (k === 80) q2.push(cp("mid-telegraph"));
    if (k === 250) q2.push(cp("committed"));
    if (k === 400) q2.push(cp("end"));
  }
  judge("duo-aggro", q2, fx.traces, "event");

  // duo-wave
  duoPrep();
  enc.E.seats[0].hull = 99;
  enc.E.seats[1].hull = 99;
  const wp0 = T.players[0];
  const wp1 = T.players[1];
  wp0.ship.x = 1500; wp0.ship.y = 1800; wp0.vel.x = 0; wp0.vel.y = 0;
  wp1.ship.x = 1900; wp1.ship.y = 1800; wp1.vel.x = 0; wp1.vel.y = 0;
  const q3 = [];
  for (let k = 1; k <= 340; k++) {
    stepTick();
    if (k === 128) {
      wp0.ship.x = 2800; wp0.ship.y = 3400;
      wp1.ship.x = 1470; wp1.ship.y = 2060;
    }
    if (k === 130) q3.push(cp("first-packs"));
    if (k === 240) q3.push(cp("lock-held"));
    if (k === 252) q3.push(cp("switched"));
    if (k === 340) q3.push(cp("end"));
  }
  judge("duo-wave", q3, fx.traces, "event");

  // comet-run — the EXACT script of tests/golden-traces.js Q4: seat 0 holds
  // rh through diagonal thrust frames (with a 30-tick frame gap mid-hold),
  // sweeps a dart, then releases; seat 1 flies the identical stick plain.
  // The 90-tick hold is bounded by the pool, not by taste — see that suite.
  duoPrep(909);
  enc.E.groups = [];
  enc.E.seats[0].hull = 99;
  enc.E.seats[1].hull = 99;
  const cm0 = T.players[0];
  const cm1 = T.players[1];
  cm0.ship.x = 1000; cm0.ship.y = 1000; cm0.vel.x = 0; cm0.vel.y = 0;
  cm1.ship.x = 2200; cm1.ship.y = 1000; cm1.vel.x = 0; cm1.vel.y = 0;
  enc.spawnEnemy(1113, 1064, 0, "dart");
  const q4 = [];
  let wireHeld = null; // the encoded wire view at the held checkpoint — reads only
  for (let k = 0; k < 240; k++) {
    if (k < 40 || (k >= 70 && k < 90)) {
      pushInputFrame(0, F({ tx: 7, ty: 4, cx: 2000, cy: 1600, rh: 1 }));
    } else if (k >= 90) {
      pushInputFrame(0, F({ tx: 7, ty: 4, cx: 2000, cy: 1600 }));
    } // ticks 40..69: no seat-0 frame — the flag must persist
    pushInputFrame(1, F({ tx: 7, ty: 4, cx: 2600, cy: 1600 }));
    stepTick();
    if (k === 39) q4.push(cp("comet-ramp"));
    if (k === 69) q4.push(cp("starved"));
    if (k === 89) {
      q4.push(cp("held"));
      wireHeld = JSON.parse(encodeSnapshot(wireState(), [], 0));
    }
  }
  q4.push(cp("released"));
  judge("comet-run", q4, fx.traces, "event");
  // the wire's downstream half, taken on LIVE state the encoder unit suite
  // cannot fake: at the held checkpoint the server pipeline (wireState →
  // encodeSnapshot) must carry seat 0's comet down as 1 and seat 1's as 0 —
  // the remote glow's whole data path, guarded inside the sanctioned gate
  ok("the held checkpoint's wire snapshot carries comet per seat",
     !!wireHeld && wireHeld.players.length === 2 &&
     wireHeld.players[0].comet === 1 && wireHeld.players[1].comet === 0,
     JSON.stringify(wireHeld && wireHeld.players.map((p) => ({ seat: p.seat, comet: p.comet }))));
  // ...and the ENERGY pool beside it, on the same live pipeline: seat 0 has been
  // burning for 90 ticks and must ride down DRAINED, seat 1 never spent and
  // must ride down full. The cap crosses too — a client cannot derive it, so the
  // HUD bar would have no denominator without this key.
  ok("the held checkpoint's wire snapshot carries the pool and its cap per seat",
     !!wireHeld && wireHeld.players.every((p) => p.em === T.flightTunables().ENMAX) &&
     wireHeld.players[0].en < wireHeld.players[0].em &&
     wireHeld.players[1].en === wireHeld.players[1].em,
     JSON.stringify(wireHeld && wireHeld.players.map((p) => ({ seat: p.seat, en: p.en, em: p.em }))));

  // duo-shop — the EXACT script of tests/golden-traces.js Q5: identical
  // diagonal sticks on both seats, then seat 1 buys AFTERBURNER, RECHARGER
  // and ENERGY CELL between ticks; parity is judged on the committed hashes
  // (the seat rank vectors are HASHED, so the purchases are in them). The
  // full isolation pin set lives in the browser suite; here the two legs a
  // server must never get wrong: the buyer's terms moved, the bystander's
  // did not — and the v2 wire carries per-seat ranks and prices.
  duoPrep(3131);
  enc.E.groups = [];
  enc.E.seats[0].hull = 99;
  enc.E.seats[1].hull = 99;
  const sh0 = T.players[0];
  const sh1 = T.players[1];
  sh0.ship.x = 1000; sh0.ship.y = 1000; sh0.vel.x = 0; sh0.vel.y = 0;
  sh1.ship.x = 2200; sh1.ship.y = 2200; sh1.vel.x = 0; sh1.vel.y = 0;
  enc.addXp(100, 0);
  enc.addXp(100, 1);
  const shT = T.flightTunables();
  const shRow = (n) => enc.shopInfo().findIndex((r) => r.name === n);
  const AB = shRow("AFTERBURNER");
  const RC = shRow("RECHARGER");
  const EC = shRow("ENERGY CELL");
  const q5 = [];
  const shFrame = () => {
    pushInputFrame(0, F({ tx: 7, ty: 4, cx: 1600, cy: 1600 }));
    pushInputFrame(1, F({ tx: 7, ty: 4, cx: 2800, cy: 2800 }));
  };
  for (let k = 0; k < 60; k++) { shFrame(); stepTick(); }
  q5.push(cp("stock-flight"));
  enc.buy(AB, 1);
  enc.buy(RC, 1);
  T.energySpend(0, 60);
  T.energySpend(1, 60);
  enc.buy(EC, 1);
  let shMax0 = 0, shMax1 = 0;
  for (let k = 0; k < 60; k++) {
    shFrame(); stepTick();
    shMax0 = Math.max(shMax0, Math.hypot(sh0.vel.x, sh0.vel.y));
    shMax1 = Math.max(shMax1, Math.hypot(sh1.vel.x, sh1.vel.y));
  }
  q5.push(cp("after-buys"));
  ok("duo-shop: the buyer's cap rose by exactly its AFTERBURNER rank; the bystander kept stock",
     Math.abs(shMax1 - (shT.VMAX + 1)) < 1e-9 && Math.abs(shMax0 - shT.VMAX) < 1e-9,
     "s1=" + shMax1 + " s0=" + shMax0 + " VMAX=" + shT.VMAX);
  // v4 dropped the derived prices from the wire: the client prices rows from
  // the decoded ranks through shopCost, so the leg asserts THAT derivation —
  // the buyer's own rank doubles its price, the bystander reads stock.
  const shWire = JSON.parse(encodeSnapshot(wireState(), [], 0));
  ok("the wire carries per-seat ranks after the buys, and prices derive from them",
     !!shWire && shWire.players[1].ow[AB] === 1 && shWire.players[0].ow[AB] === 0 &&
     enc.shopInfo(1)[AB].cost === 8 && enc.shopInfo(0)[AB].cost === 4 &&
     !("owned" in shWire.hud) && !("prices" in shWire.hud) && !("offers" in shWire.hud),
     JSON.stringify(shWire && shWire.players.map((p) => ({ seat: p.seat, ow: p.ow }))));
  T.energyFill(0);
  T.energyFill(1);
  T.energySpend(0, 50);
  T.energySpend(1, 50);
  for (let k = 0; k < shT.ENDELAY; k++) stepTick();
  for (let k = 0; k < 40; k++) stepTick();
  q5.push(cp("regen"));
  judge("duo-shop", q5, fx.traces, "event");

  // pvp-duel — the EXACT script of tests/golden-traces.js Q6: seat 1 shoots
  // seat 0 dead through the ordinary firing path after seat 0 has bought a
  // rank vector and a raised hull cap. Parity is judged on the committed
  // hashes; every seat's score, ranks and hullMax are hashed, so the whole
  // PvP toll is inside them. The pin set lives in the browser suite.
  duoPrep(1414);
  enc.E.groups = [];
  const du0 = T.players[0];
  const du1 = T.players[1];
  du0.ship.x = 1500; du0.ship.y = 1800; du0.vel.x = 0; du0.vel.y = 0;
  du1.ship.x = 1500; du1.ship.y = 1620; du1.vel.x = 0; du1.vel.y = 0;
  const duRow = (n) => enc.shopInfo().findIndex((r) => r.name === n);
  enc.addXp(60, 0);
  enc.addXp(20, 1);
  enc.buy(duRow("AFTERBURNER"), 0);
  enc.buy(duRow("MAX HULL"), 0);
  const q6 = [];
  let duDeathSeen = false;
  for (let k = 0; k < 400; k++) {
    pushInputFrame(0, F({ cx: 1500, cy: 1400 }));
    pushInputFrame(1, F({ cx: 1500, cy: 1800, fh: true }));
    stepTick();
    if (!duDeathSeen && enc.E.seats[0].hull <= 0) { duDeathSeen = true; q6.push(cp("killed")); }
    if (k === 60) q6.push(cp("under-fire"));
    if (k === 340) q6.push(cp("respawned"));
  }
  q6.push(cp("end"));
  judge("pvp-duel", q6, fx.traces, "event");

  // pvp-ram — the EXACT script of Q7: seat 0 burns the comet parked inside
  // seat 1's disc, bites once, is refused for a whole COMETCD window, then
  // kills. E.pvpCd is HASHED while it is non-empty, so the pair window itself
  // rides these checkpoints — which is the half of this trace a server could
  // get wrong without moving a position by a pixel.
  duoPrep(1415);
  enc.E.groups = [];
  const rm0 = T.players[0];
  const rm1 = T.players[1];
  rm0.ship.x = 1500; rm0.ship.y = 1800; rm0.vel.x = 0; rm0.vel.y = 0;
  rm1.ship.x = 1506; rm1.ship.y = 1800; rm1.vel.x = 0; rm1.vel.y = 0;
  enc.E.seats[1].hull = 6;
  enc.addXp(30, 1);
  enc.buy(enc.shopInfo().findIndex((r) => r.name === "AFTERBURNER"), 1);
  const q7 = [];
  let rmDeathSeen = false;
  for (let k = 0; k < 260; k++) {
    pushInputFrame(0, F({ cx: 1506, cy: 1800, rh: 1 }));
    pushInputFrame(1, F({ cx: 1500, cy: 1800 }));
    stepTick();
    if (!rmDeathSeen && enc.E.seats[1].hull <= 0) { rmDeathSeen = true; q7.push(cp("ram-kill")); }
    if (k === 20) q7.push(cp("first-bite"));
    if (k === 50) q7.push(cp("window-held"));
    if (k === 240) q7.push(cp("respawned"));
  }
  q7.push(cp("end"));
  judge("pvp-ram", q7, fx.traces, "event");

  // pvp-clash — the EXACT script of Q8: two comets inside one another's disc.
  // Neither hull moves; both ordered pair windows stamp, and those stamps are
  // the ONLY evidence the strikes happened — which is precisely why they are
  // hashed and pinned here rather than left to a wire event that never fires.
  duoPrep(1416);
  enc.E.groups = [];
  const cl0 = T.players[0];
  const cl1 = T.players[1];
  cl0.ship.x = 1500; cl0.ship.y = 1800; cl0.vel.x = 0; cl0.vel.y = 0;
  cl1.ship.x = 1506; cl1.ship.y = 1800; cl1.vel.x = 0; cl1.vel.y = 0;
  const q8 = [];
  for (let k = 0; k < 160; k++) {
    pushInputFrame(0, F({ cx: 1506, cy: 1800, rh: 1 }));
    pushInputFrame(1, F({ cx: 1500, cy: 1800, rh: 1 }));
    stepTick();
    if (k === 4) q8.push(cp("clash"));
    if (k === 130) q8.push(cp("dry"));
  }
  q8.push(cp("end"));
  judge("pvp-clash", q8, fx.traces, "event");

  // ---- phase 15 — the vt-bearing traces, the EXACT scripts of section R ----
  // rebate-kill
  duoPrep(1510);
  enc.E.groups = [];
  enc.E.seats[0].hull = 99;
  enc.E.seats[1].hull = 99;
  const rk0 = T.players[0];
  const rk1 = T.players[1];
  rk0.ship.x = 2600; rk0.ship.y = 2600; rk0.vel.x = 0; rk0.vel.y = 0;
  rk1.ship.x = 1190; rk1.ship.y = 1000; rk1.vel.x = 0; rk1.vel.y = 0;
  enc.spawnEnemy(1300, 1000, 0, "charger");
  const rkFoe = enc.E.enemies[enc.E.enemies.length - 1];
  rkFoe.mode = "windup";
  rkFoe.t = 60; // windup COUNTS DOWN — the plant must outlive the window
  rkFoe.lockA = Math.PI / 2;
  rkFoe.hp = 1;
  const qr1 = [];
  for (let k = 0; k < 12; k++) stepTick();
  qr1.push(cp("history-built"));
  rkFoe.x = 1300; rkFoe.y = 1400;
  pushInputFrame(1, F({ cx: 2000, cy: 1000, fp: 1, vt: T.simTick() + 1 - 8 }));
  stepTick();
  qr1.push(cp("rebate-kill"));
  for (let k = 0; k < 20; k++) stepTick();
  qr1.push(cp("end"));
  judge("rebate-kill", qr1, fx.traces, "event");

  // pvp-rewind
  duoPrep(1511);
  enc.E.groups = [];
  enc.E.seats[0].hull = 99;
  enc.E.seats[1].hull = 99;
  const rw0 = T.players[0];
  const rw1 = T.players[1];
  rw0.ship.x = 1400; rw0.ship.y = 1600; rw0.vel.x = 0; rw0.vel.y = 0;
  rw1.ship.x = 2600; rw1.ship.y = 2600; rw1.vel.x = 0; rw1.vel.y = 0;
  const qr2 = [];
  const rwPark = (y, n) => { rw0.ship.x = 1400; rw0.ship.y = y; for (let k = 0; k < n; k++) stepTick(); };
  rwPark(1600, 30);
  qr2.push(cp("staged"));
  rwPark(1000, 5);
  rwPark(1600, 11);
  rw1.ship.x = 1293; rw1.ship.y = 1000; rw1.vel.x = 0; rw1.vel.y = 0;
  pushInputFrame(1, F({ cx: 2000, cy: 1000, fp: 1, vt: T.simTick() + 1 - 20 }));
  stepTick();
  qr2.push(cp("beyond-cap-missed"));
  for (let k = 0; k < 30; k++) stepTick();
  rwPark(1000, 4);
  rwPark(1600, 3);
  rw1.ship.x = 1342; rw1.ship.y = 1000; rw1.vel.x = 0; rw1.vel.y = 0;
  pushInputFrame(1, F({ cx: 2000, cy: 1000, fp: 1, vt: T.simTick() + 1 - 8 }));
  stepTick();
  qr2.push(cp("within-cap-landed"));
  for (let k = 0; k < 20; k++) stepTick();
  qr2.push(cp("end"));
  judge("pvp-rewind", qr2, fx.traces, "event");

  // vt-clamp
  duoPrep(1512);
  enc.E.groups = [];
  enc.E.seats[0].hull = 99;
  enc.E.seats[1].hull = 99;
  const vc0 = T.players[0];
  const vc1 = T.players[1];
  vc0.ship.x = 2600; vc0.ship.y = 2600; vc0.vel.x = 0; vc0.vel.y = 0;
  vc1.ship.x = 1000; vc1.ship.y = 1000; vc1.vel.x = 0; vc1.vel.y = 0;
  enc.spawnEnemy(1200, 1000, 0, "charger");
  const vcFoe = enc.E.enemies[enc.E.enemies.length - 1];
  vcFoe.mode = "windup";
  vcFoe.t = 60; // windup COUNTS DOWN — the plant must outlive the window
  vcFoe.lockA = Math.PI / 2;
  vcFoe.hp = 1;
  const qr3 = [];
  for (let k = 0; k < 26; k++) stepTick();
  qr3.push(cp("ring-full"));
  pushInputFrame(1, F({ cx: 2000, cy: 1000, fp: 1, vt: T.simTick() + 1 - 500 }));
  stepTick();
  qr3.push(cp("ancient-clamped"));
  for (let k = 0; k < 30; k++) stepTick();
  pushInputFrame(1, F({ cx: 2000, cy: 1000, fp: 1, vt: T.simTick() + 1000 }));
  stepTick();
  qr3.push(cp("future-zeroed"));
  for (let k = 0; k < 20; k++) stepTick();
  qr3.push(cp("end"));
  judge("vt-clamp", qr3, fx.traces, "event");

  T.setPlayerCount(1);
  enc.restart();
}

// ---- summary ---------------------------------------------------------------
const failed = R.filter((r) => !r.pass);
console.log(`node-golden ${R.length - failed.length}/${R.length} passed${failed.length ? "" : " ✓"}`);
for (const f of failed) console.log(`  FAIL ${f.name}${f.info ? " :: " + f.info : ""}`);
process.exit(failed.length ? 1 : 0);
