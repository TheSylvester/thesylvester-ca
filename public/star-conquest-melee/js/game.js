"use strict";

// Prototype playground: the Crystal Quest ship with second-order physics.
// The original (components/crystal-quest-game.tsx) mapped mouse *position*
// to velocity: offset/10 with per-axis clamps. This prototype's flight input
// is thrust — each mouse-flight movement or held key in the thrust role is
// an acceleration impulse, velocity integrates it, and a *radial* speed cap
// replaces the per-axis clamp, so a sideways push at full speed rotates the
// heading into an arc instead of pinning the old axis.
// Tuning began as the 30 Hz original rescaled to a 60 Hz sim, then feel
// testing settled it: top speed 9 px/tick (540 px/s — 2× the original
// 270), gains 0.015/0.015 (600 counts from rest to top), and a flick
// curve that amplifies fast deltas — a quick flick snaps the heading while
// slow motion stays precise. Impulses split against the current heading:
// ACCEL drives the along component (speed up / brake), TURN the across one
// (curve), so speed build-up and turn agility tune independently. Sliders
// on the pause/idle screen drive VMAX, ACCEL and TURN live. The 512×342
// field scales up to fill the window; letterbox bars keep the aspect ratio.
//
// Shooting has two aim-control modes. The default "mouse" mode keeps the
// native pointer visible: its absolute screen position is the shot target,
// until RIGHT swaps the original roles: mouse motion flies the ship while
// the QWE/ASDZXC ring snaps the turret and the native cursor hides. Releasing
// RIGHT reveals the cursor and returns targeting to it. The legacy "push"
// mode keeps the pointer-lock
// controls and relative aim vector. In both modes the keys snap the aim
// while the mouse flies, or thrust while the mouse aims; invert swaps those
// right-button roles as before.
// An engine flame mirrors the thrust actually applied — opposite it and
// proportional. Bullet physics modes (BMODE) live in code only now.
// Three bullet-physics modes, cadence, the bullet cap, lifetime and wall
// behavior are all pause-screen knobs.
//
// Big world: the 512×342 view is now a window onto a 6×11-room world
// (3072×3762). The ship and the bullets live in world coordinates and
// bounce off the WORLD walls; a clamped camera decides which slice the
// letterbox shows. Five camera modes (pause-screen selector): lock rigidly
// centers the ship, smooth chases with an eased fraction of the gap per
// tick, deadzone moves only when the ship leaves an inner box, lookahead
// (the default) aims ahead per the lead source, and flip slides room to
// room like a screen-flip game. Smooth and lookahead ride an EDGEMARGIN
// leash so the ship never leaves the view. Behind the field, three hashed
// starfield layers
// parallax at 0.25/0.5/0.75 of camera motion, and a top-right minimap
// tracks the viewport rectangle and the ship dot.

const FW = 512;         // logical field width — the VIEWPORT onto the world
const FH = 342;         // logical field height
const WW = FW * 6;      // world width — a 6×11 grid of view-sized rooms
const WH = FH * 11;     // world height
const TICK = 1000 / 60; // 60 Hz fixed timestep — twice the original's 30 Hz
const SHIP_R = 7;
let VMAX = 9;           // px per tick — 540 px/s baseline; the pause-screen slider drives this live
let ACCEL = 0.015;      // speed gain — velocity px/tick per count ALONG the heading (slider); default is the settled feel
let TURN = 0.015;       // turn gain — the same, for the component ACROSS the heading (slider); equal gains = the old single-gain model
const FLICK = 0.01;     // flick curve — gain × (1 + |delta| × FLICK); a 100-count flick doubles its push
const DAMP = 1;         // per-tick velocity retention — 1 = no friction, like the original; try 0.98 to coast down
let KEYTHRUST = 16;     // keyboard thrust — synthetic mouse counts per tick, through the same impulse pipeline
let WALLLOSS = 0.5;     // fraction of the flipped velocity component the ship loses on a wall bounce
let AIMSENS = 0.03;     // push-mode aim gain — offset px per count
let AIMDIST = 35;       // direction-marker distance from the ship, px
let AIMMODE = "mouse";  // mouse = visible absolute pointer (default); push = legacy relative/pointer-lock controls
let BCOOL = 200;        // ms between shots — one gate for click fire and autofire
let AUTOFIRE = true;    // hold LEFT to keep firing at the cooldown rate
let BMODE = "off";      // bullet physics — off | newtonian (adds ship vel × factor) | cq-scale (ship speed × factor); code-only, no menu knob
let BSPEED = 15;        // bullet speed, px per tick (off and newtonian modes)
let BFACTOR = 1;        // the ship-velocity factor — newtonian adds it, cq-scale multiplies by it
let BMAX = 15;          // max live bullets (the original capped at 5)
let BLIFE = 0.5;        // bullet lifetime, seconds
let BOUNCE = false;     // bullets bounce off walls instead of dying at them
let INVERT = true;      // swap right-button roles — off: hold right to aim; on: mouse aims until right is held to fly
const AIM_R = 16;       // push-model offset clamp radius, px
const MIN_FIRE_V = 0.25; // cq-scale refuses to fire below this ship speed — the original's rule
const FLAME_EASE = 0.3; // per-tick easing of the engine flame toward the thrust actually applied
const FLAME_GAIN = 80;  // flame px per px/tick² of thrust
const FLAME_MAX = 20;   // flame length cap, px

const C = {
  pageBg: "#12151f",
  fieldBg: "#0e1119",
  wall: "#313a4e",
  bright: "#f2f3f5",
  clay: "#d97757",
  dim: "#5c6370",
};
const FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const canvas = document.getElementById("field");
const ctx = canvas.getContext("2d");
const tuner = document.getElementById("tuner");

const G = {
  running: false,
  started: false, // velocity zeroes on the first start only — a resume keeps it, like unpausing
  ship: { x: WW / 2, y: WH / 2 },
  vel: { x: 0, y: 0 },
  aimAngle: 0,
  aimOff: { x: 0, y: 0 }, // relative/snap state — its direction is the stored aim
  aimed: false, // stored aim history; false until first aim, so bullets initially follow the heading
  mouse: { x: 0, y: 0, seen: false }, // last native-pointer client position for absolute mouse aiming
  bullets: [],
  cool: 0, // ticks until the next shot is allowed
  leftHeld: false,
  rightHeld: false,
  keys: new Set(), // held QWE/ADZXC codes
  thrustAcc: { x: 0, y: 0 }, // acceleration applied since the last tick — feeds the flame
  flame: { x: 0, y: 0 }, // smoothed thrust the engine flame renders
};

// ---- canvas sizing: fit the logical field to the window, letterboxed ----
let scale = 1;
let ox = 0;
let oy = 0;
let dpr = 1;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(Math.max(1, window.innerWidth) * dpr);
  canvas.height = Math.round(Math.max(1, window.innerHeight) * dpr);
  scale = Math.min(canvas.width / FW, canvas.height / FH);
  ox = (canvas.width - FW * scale) / 2;
  oy = (canvas.height - FH * scale) / 2;
  const top = (oy + (FH / 2 + 96) * scale) / dpr; // just below the pause hints, in field space
  tuner.style.top = top + "px";
  tuner.style.maxHeight = Math.max(60, window.innerHeight - top - 8) + "px"; // small windows scroll instead of clipping
}

// ---- camera --------------------------------------------------------------
// cam is the view's top-left corner in world space, updated in step() after
// the ship integrates and always clamped so the viewport never leaves the
// world. It persists across pause/resume — a resume never jumps the view.
// Modes: "lock" pins the ship to the center every tick; "smooth" eases a
// CAMEASE fraction of the remaining gap per tick; "deadzone" moves only the
// minimum needed to keep the ship inside an inner box (CAMBOX of the view),
// no easing; "lookahead" is smooth toward a led point — LEADSRC picks what
// leads: the velocity (CAMLEAD ticks of it), the aim (AIMLEAD px along
// fireDir), a LEADBLEND mix of the two, their plain sum, or a swap that
// follows the aim only while aiming() — all five through the LEADDZ commit
// gate (gatedLead) that sits between the ideal lead and the camera target;
// "flip" treats the world as a 6×11
// grid of view-sized rooms and slides to the ship's room over FLIP_MS with
// a cubic ease-out — retargeting mid-slide if the ship crosses into yet
// another room. Smooth and lookahead also wear a LEASH: after the ease,
// cam clamps so the ship sits at least EDGEMARGIN px inside every view
// edge — an oversized lead saturates at the leash instead of pushing the
// ship off screen. The world clamp still runs last, so a ship within
// EDGEMARGIN of a world wall keeps less margin but never leaves the view.
let CAMMODE = "lookahead"; // lock | smooth | deadzone | lookahead | flip (pause-screen selector)
let CAMEASE = 0.08;     // smooth/lookahead — fraction of the gap closed per tick (slider)
let CAMBOX = 0.4;       // deadzone — the inner box, as a fraction of the viewport (slider)
let CAMLEAD = 25;       // lookahead — ticks of velocity the target leads by (slider)
let LEADSRC = "blend";  // lookahead — what the target leads: vel | aim | blend | add | swap (selector)
let AIMLEAD = 120;      // lookahead — px of aim lead along fireDir() (slider)
let LEADBLEND = 0.5;    // lookahead blend — 0 = all velocity, 1 = all aim (slider)
let LEADDZ = 200;       // lookahead — ms a conflicting lead direction must persist to commit; 0 = gate off (slider)
let EDGEMARGIN = 60;    // smooth/lookahead leash — min px between the ship and every view edge (slider)
const FLIP_MS = 250;    // flip — room slide duration, ms
const cam = {
  x: WW / 2 - FW / 2, // start centered on the spawn (already inside the clamp)
  y: WH / 2 - FH / 2,
  fromX: 0, fromY: 0, toX: -1, toY: -1, t: 1, // flip slide state — toX -1 forces a first retarget
};
function clampCam() {
  cam.x = Math.max(0, Math.min(WW - FW, cam.x));
  cam.y = Math.max(0, Math.min(WH - FH, cam.y));
}
function setCamMode(m) {
  CAMMODE = m;
  cam.toX = cam.toY = -1; // flip starts fresh — the next tick slides from wherever the camera sits
  cam.t = 1;
  gate.seeded = false; // the commit gate re-seeds from the next ideal — a mode switch never replays a stale timer
  gate.timer = 0;
}
// lookahead's lead vector, per LEADSRC: the velocity scaled by CAMLEAD
// ticks, the aim (fireDir) stretched to AIMLEAD px, a LEADBLEND mix of the
// two, their plain sum, or a swap — the aim lead while aiming(), the
// velocity lead otherwise. No fire direction at all (at rest and never
// aimed) makes the aim lead zero, not undefined.
function leadVec() {
  const vx = G.vel.x * CAMLEAD;
  const vy = G.vel.y * CAMLEAD;
  if (LEADSRC === "vel") return { x: vx, y: vy };
  const d = fireDir();
  const ax = d ? d.x * AIMLEAD : 0;
  const ay = d ? d.y * AIMLEAD : 0;
  if (LEADSRC === "aim") return { x: ax, y: ay };
  if (LEADSRC === "blend") return { x: vx * (1 - LEADBLEND) + ax * LEADBLEND,
                                    y: vy * (1 - LEADBLEND) + ay * LEADBLEND };
  if (LEADSRC === "add") return { x: vx + ax, y: vy + ay };
  return aiming() ? { x: ax, y: ay } : { x: vx, y: vy }; // swap
}
// the commit gate between leadVec() and the camera target — lookahead only.
// A quick left-right reversal flips the ideal lead by up to ~2 × VMAX ×
// CAMLEAD px in one tick, and the eased chase starts at once — the screen
// shakes. So the camera follows a persistent COMMITTED lead instead, which
// tracks the ideal live while the two don't conflict sharply: 60° or less
// apart, or either vector near zero — speed changes, arcs, drops to rest
// and starts from rest never gate. A sharp conflict freezes the committed
// lead and times the candidate direction instead: the timer accumulates
// while the ideal stays within 60° of the candidate, restarts when it
// swings elsewhere, and commits at LEADDZ ms — CAMEASE still glides the
// camera there, so a commit never snaps the view. Quick alternation (each
// direction held under LEADDZ) never commits, and the screen holds still.
// LEADDZ 0 bypasses the gate — byte-for-byte the ungated behavior.
const gate = { x: 0, y: 0, cx: 0, cy: 0, timer: 0, seeded: false };
function gatedLead() {
  const i = leadVec();
  if (LEADDZ === 0 || !gate.seeded) { // gate off, or fresh after a mode switch — take the ideal as-is
    gate.x = i.x;
    gate.y = i.y;
    gate.timer = 0;
    gate.seeded = true;
    return { x: gate.x, y: gate.y };
  }
  const im = Math.hypot(i.x, i.y);
  const cm = Math.hypot(gate.x, gate.y);
  if (im < 1 || cm < 1 || i.x * gate.x + i.y * gate.y >= 0.5 * im * cm) {
    gate.x = i.x; // no sharp conflict (dot ≥ cos 60° × |i||c|) — track live
    gate.y = i.y;
    gate.timer = 0;
  } else {
    // sharp conflict — hold the committed lead and time the candidate
    if (gate.timer > 0 && i.x * gate.cx + i.y * gate.cy >= 0.5 * im * Math.hypot(gate.cx, gate.cy)) {
      gate.timer++; // the ideal is still pointing the candidate's way
    } else {
      gate.cx = i.x; // a new direction — restart the persistence clock on it
      gate.cy = i.y;
      gate.timer = 1;
    }
    if (gate.timer >= Math.max(1, Math.round(LEADDZ / TICK))) {
      gate.x = i.x; // held long enough — commit; the ease glides from here
      gate.y = i.y;
      gate.timer = 0;
    }
  }
  return { x: gate.x, y: gate.y };
}
function updateCamera() {
  if (CAMMODE === "lock") {
    cam.x = G.ship.x - FW / 2;
    cam.y = G.ship.y - FH / 2;
  } else if (CAMMODE === "smooth" || CAMMODE === "lookahead") {
    // the TARGET swings only when the gate commits — the ease still glides there
    const l = CAMMODE === "lookahead" ? gatedLead() : { x: 0, y: 0 };
    cam.x += (G.ship.x + l.x - FW / 2 - cam.x) * CAMEASE;
    cam.y += (G.ship.y + l.y - FH / 2 - cam.y) * CAMEASE;
    // the leash — whatever the lead asked for, the ship stays at least
    // EDGEMARGIN px inside every view edge; clampCam() below may shave the
    // margin at a world wall, but the ship itself never leaves the screen
    cam.x = Math.max(G.ship.x - (FW - EDGEMARGIN), Math.min(G.ship.x - EDGEMARGIN, cam.x));
    cam.y = Math.max(G.ship.y - (FH - EDGEMARGIN), Math.min(G.ship.y - EDGEMARGIN, cam.y));
  } else if (CAMMODE === "deadzone") {
    const mx = (FW - FW * CAMBOX) / 2; // view edge to box edge
    const my = (FH - FH * CAMBOX) / 2;
    if (G.ship.x < cam.x + mx) cam.x = G.ship.x - mx;
    else if (G.ship.x > cam.x + FW - mx) cam.x = G.ship.x - FW + mx;
    if (G.ship.y < cam.y + my) cam.y = G.ship.y - my;
    else if (G.ship.y > cam.y + FH - my) cam.y = G.ship.y - FH + my;
  } else if (CAMMODE === "flip") {
    const rx = Math.max(0, Math.min(WW - FW, Math.floor(G.ship.x / FW) * FW)); // room origins satisfy the clamp
    const ry = Math.max(0, Math.min(WH - FH, Math.floor(G.ship.y / FH) * FH));
    if (rx !== cam.toX || ry !== cam.toY) { // new room — slide there from here, mid-slide included
      cam.fromX = cam.x;
      cam.fromY = cam.y;
      cam.toX = rx;
      cam.toY = ry;
      cam.t = 0;
    }
    if (cam.t < 1) {
      cam.t = Math.min(1, cam.t + TICK / FLIP_MS);
      const e = 1 - Math.pow(1 - cam.t, 3); // ease-out: fast leave, soft landing
      cam.x = cam.fromX + (cam.toX - cam.fromX) * e;
      cam.y = cam.fromY + (cam.toY - cam.fromY) * e;
    }
  }
  clampCam();
}

// ---- control roles -------------------------------------------------------
const mouseMode = () => AIMMODE === "mouse";
const cursorHidden = () => mouseMode() && G.running && G.rightHeld;
function syncCursor() {
  canvas.classList.toggle("hide-cursor", cursorHidden());
}
// One boolean preserves the original invertible role swap in both modes:
// while aiming(), the mouse owns the aim and the keys thrust; otherwise the
// mouse thrusts and the keys snap the stored aim.
const aiming = () => G.rightHeld !== INVERT;

// each delta is an impulse, split against the current heading: the ALONG
// component (speed up / brake) uses ACCEL, the ACROSS component (curve)
// uses TURN — so top-speed build-up and turn agility tune independently.
// The flick term still amplifies fast deltas. Mouse deltas and keyboard
// thrust both come through here, so the flame sees every source.
function thrustImpulse(dx, dy) {
  if (window.Encounter && Encounter.frozen()) return; // no velocity pumping while the sim is frozen
  const flick = 1 + Math.hypot(dx, dy) * FLICK;
  const s = Math.hypot(G.vel.x, G.vel.y);
  let dvx, dvy;
  if (s < 0.05) { // at rest there is no heading — all input builds speed
    dvx = dx * ACCEL * flick;
    dvy = dy * ACCEL * flick;
  } else {
    const ux = G.vel.x / s;
    const uy = G.vel.y / s;
    const along = dx * ux + dy * uy;
    const ax = along * ux;
    const ay = along * uy;
    dvx = (ax * ACCEL + (dx - ax) * TURN) * flick;
    dvy = (ay * ACCEL + (dy - ay) * TURN) * flick;
  }
  G.vel.x += dvx;
  G.vel.y += dvy;
  G.thrustAcc.x += dvx;
  G.thrustAcc.y += dvy;
}

// the aim counterpart of thrustImpulse: deltas push a clamped offset vector
// around the ship; its direction is the aim
function aimImpulse(dx, dy) {
  G.aimOff.x += dx * AIMSENS;
  G.aimOff.y += dy * AIMSENS;
  const m = Math.hypot(G.aimOff.x, G.aimOff.y);
  if (m > AIM_R) {
    G.aimOff.x *= AIM_R / m;
    G.aimOff.y *= AIM_R / m;
  }
  if (m > 0.5) { // direction is meaningless while the offset sits near center
    G.aimAngle = Math.atan2(G.aimOff.y, G.aimOff.x);
    G.aimed = true;
  }
}

// ---- shooting ------------------------------------------------------------
// Convert the native pointer's CSS/client coordinates through the canvas
// backing buffer and letterbox transform. Comparing that viewport point to
// ship - camera makes the direction follow the ship's CURRENT screen
// position even when the camera or ship moves without another mouse event.
function mouseAimDir() {
  if (!G.mouse.seen) return null;
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const bx = (G.mouse.x - r.left) * canvas.width / r.width;
  const by = (G.mouse.y - r.top) * canvas.height / r.height;
  const pointerX = (bx - ox) / scale;
  const pointerY = (by - oy) / scale;
  const dx = pointerX - (G.ship.x - cam.x);
  const dy = pointerY - (G.ship.y - cam.y);
  const m = Math.hypot(dx, dy);
  return m < 0.001 ? null : { x: dx / m, y: dy / m };
}

// Before mouse mode hands flight back to mouse motion, retain the visible
// pointer direction so shots do not jump; an 8-way key can then replace it.
function snapshotMouseAim() {
  const d = mouseAimDir();
  if (!d) return;
  G.aimAngle = Math.atan2(d.y, d.x);
  G.aimOff.x = d.x * AIM_R;
  G.aimOff.y = d.y * AIM_R;
  G.aimed = true;
}

// every entry into aim mode opens at the current fire direction, at full
// deflection, so the first push pivots from where the shots already go
function enterAim() {
  const d = fireDir();
  if (!d) return;
  if (!G.aimed) G.aimAngle = Math.atan2(d.y, d.x);
  G.aimOff.x = d.x * AIM_R;
  G.aimOff.y = d.y * AIM_R;
}

// Bullets, the direction marker and aim-aware cameras share this. While the
// mouse-mode pointer owns aim, they resolve against its live position. While
// mouse motion owns flight (and in push mode), they use the last relative/
// snapped aim, or the ship heading until the first aim (the CQ behavior).
function fireDir() {
  if (mouseMode() && aiming()) return mouseAimDir();
  if (G.aimed) return { x: Math.cos(G.aimAngle), y: Math.sin(G.aimAngle) };
  const s = Math.hypot(G.vel.x, G.vel.y);
  return s < 0.05 ? null : { x: G.vel.x / s, y: G.vel.y / s };
}

// one gate for click fire and autofire: cooldown, the bullet cap, the mode
function fire() {
  if (window.Encounter && Encounter.frozen()) return; // overlays own the field
  if (G.cool > 0 || G.bullets.length >= BMAX) return;
  const d = fireDir();
  if (!d) return; // at rest and never aimed — no direction exists
  const s = Math.hypot(G.vel.x, G.vel.y);
  let vx, vy;
  if (BMODE === "cq-scale") {
    if (s < MIN_FIRE_V) return; // the original refused stationary fire
    vx = d.x * s * BFACTOR;
    vy = d.y * s * BFACTOR;
  } else {
    vx = d.x * BSPEED;
    vy = d.y * BSPEED;
    if (BMODE === "newtonian") {
      vx += G.vel.x * BFACTOR;
      vy += G.vel.y * BFACTOR;
    }
  }
  const em = window.Encounter ? Encounter.mods : null; // upgrade multipliers — the tuner values stay untouched
  G.bullets.push({ x: G.ship.x, y: G.ship.y, px: G.ship.x, py: G.ship.y, vx, vy,
                   r: 2.2, dmg: 1, owner: "player", dead: false, spent: false,
                   ttl: Math.max(1, Math.round(BLIFE * (em ? em.life : 1) * 1000 / TICK)) });
  G.cool = Math.max(1, Math.round(BCOOL * (em ? em.cool : 1) / TICK));
}

// ---- simulation step (one ~16.7ms update) --------------------------------
function step() {
  if (window.Encounter && Encounter.frozen()) return; // upgrade/death overlays freeze the whole sim
  if (aiming() && G.keys.size) { // the keys fly the ship while the mouse owns the aim
    let kx = 0;
    let ky = 0;
    for (const c of G.keys) { kx += KEY_AIM[c][0]; ky += KEY_AIM[c][1]; }
    const km = Math.hypot(kx, ky);
    if (km) thrustImpulse((kx / km) * KEYTHRUST, (ky / km) * KEYTHRUST);
  }
  // velocity integrated the input impulses via thrustImpulse; here it
  // decays (DAMP) and clamps *radially* — excess speed is discarded, never
  // banked, so there is no dead zone and no reel-back when you turn
  G.vel.x *= DAMP;
  G.vel.y *= DAMP;
  const s = Math.hypot(G.vel.x, G.vel.y);
  if (s > VMAX) {
    G.vel.x *= VMAX / s;
    G.vel.y *= VMAX / s;
  }
  // walls reflect the ship: position mirrors about the margin, and the
  // flipped velocity component keeps 1−WALLLOSS — restitution on that axis
  // only, so grazing bounces lose little and head-on ones lose the most
  const keep = WALLLOSS - 1; // negated: flip and damp in one multiply
  G.ship.x += G.vel.x;
  G.ship.y += G.vel.y;
  if (G.ship.x < SHIP_R) { G.ship.x = SHIP_R * 2 - G.ship.x; G.vel.x *= keep; }
  else if (G.ship.x > WW - SHIP_R) { G.ship.x = (WW - SHIP_R) * 2 - G.ship.x; G.vel.x *= keep; }
  if (G.ship.y < SHIP_R) { G.ship.y = SHIP_R * 2 - G.ship.y; G.vel.y *= keep; }
  else if (G.ship.y > WH - SHIP_R) { G.ship.y = (WH - SHIP_R) * 2 - G.ship.y; G.vel.y *= keep; }
  updateCamera(); // the view follows once the ship has settled for this tick
  G.flame.x += (G.thrustAcc.x - G.flame.x) * FLAME_EASE;
  G.flame.y += (G.thrustAcc.y - G.flame.y) * FLAME_EASE;
  G.thrustAcc.x = G.thrustAcc.y = 0;
  if (G.cool > 0) G.cool--;
  if (AUTOFIRE && G.leftHeld) fire();
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    if (b.dead || b.spent) { G.bullets.splice(i, 1); continue; } // consumed by a hit, or expired after its final sweep
    b.px = b.x; // previous position — the encounter sweeps this segment for hits
    b.py = b.y;
    b.x += b.vx;
    b.y += b.vy;
    if (BOUNCE) {
      // the reflected chord px→x approximates the folded path; enemy bodies
      // never overhang the world walls, so the chord cannot phantom-hit
      if (b.x < 0) { b.x = -b.x; b.vx = -b.vx; }
      else if (b.x > WW) { b.x = WW * 2 - b.x; b.vx = -b.vx; }
      if (b.y < 0) { b.y = -b.y; b.vy = -b.vy; }
      else if (b.y > WH) { b.y = WH * 2 - b.y; b.vy = -b.vy; }
    }
    b.ttl--;
    // expiry marks, never splices here — the encounter hook still sweeps
    // this final segment, and the next pass removes the bullet
    if (b.ttl <= 0 || (!BOUNCE && (b.x < 0 || b.x > WW || b.y < 0 || b.y > WH))) b.spent = true;
  }
  if (window.Encounter) Encounter.step(); // enemies, damage, XP, wave state
}

// ---- starfield -----------------------------------------------------------
// three parallax layers behind the field, far to near at 0.25/0.5/0.75 of
// camera motion (the world itself is 1.0). Nothing is stored: each layer is
// an infinite grid of 128 px cells, and an integer hash of (cell, layer,
// SEED) deals every cell its star count; an LCG advanced from that hash
// then deals each star its position and size. The draw path touches no
// Math.random, so the sky is stable frame to frame — SEED randomizes once
// per page load, and the "reseed" button deals a new one.
let SEED = (Math.random() * 0x100000000) >>> 0;
let STARDENS = 4;  // average stars per cell (slider) — the hash spreads 0..2× around it
const CELL = 128;  // layer-space cell size, px
const LAYERS = [   // parallax factor, base size, tone — far is small and dim
  { f: 0.25, size: 1, color: C.dim },
  { f: 0.5, size: 1.5, color: "#9aa3b2" },
  { f: 0.75, size: 2, color: C.bright },
];
function hash32(x, y, l, s) {
  let h = (s ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(l + 1, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 15), 2654435761);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
function drawStars() {
  for (let li = 0; li < LAYERS.length; li++) {
    const L = LAYERS[li];
    const offX = cam.x * L.f; // this layer's scroll — its own view of its own space
    const offY = cam.y * L.f;
    ctx.setTransform(scale, 0, 0, scale, ox - offX * scale, oy - offY * scale);
    ctx.fillStyle = L.color;
    const x1 = Math.floor((offX + FW) / CELL); // only cells the view intersects
    const y1 = Math.floor((offY + FH) / CELL);
    for (let cy = Math.floor(offY / CELL); cy <= y1; cy++) {
      for (let cx = Math.floor(offX / CELL); cx <= x1; cx++) {
        let h = hash32(cx, cy, li, SEED);
        const n = Math.round(((h >>> 24) / 255) * STARDENS * 2); // 0..2× density, ≈ STARDENS on average
        for (let i = 0; i < n; i++) { // three LCG draws per star: x, y, size
          h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
          const px = cx * CELL + (h / 0x100000000) * CELL;
          h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
          const py = cy * CELL + (h / 0x100000000) * CELL;
          h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
          const sz = L.size * (0.8 + (h / 0x100000000) * 0.4); // slight per-star variance
          ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
        }
      }
    }
  }
}

// ---- drawing -------------------------------------------------------------
function drawFlame() {
  const m = Math.hypot(G.flame.x, G.flame.y);
  const len = Math.min(m * FLAME_GAIN, FLAME_MAX);
  if (len < 1.5) return;
  const dx = -G.flame.x / m; // exhaust points opposite the thrust
  const dy = -G.flame.y / m;
  const px = -dy; // base half-width direction
  const py = dx;
  const jit = 0.8 + Math.random() * 0.4; // flicker
  const bx = G.ship.x + dx * (SHIP_R - 2);
  const by = G.ship.y + dy * (SHIP_R - 2);
  const tongue = (w, l, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(bx + px * w, by + py * w);
    ctx.lineTo(bx - px * w, by - py * w);
    ctx.lineTo(bx + dx * l, by + dy * l);
    ctx.closePath();
    ctx.fill();
  };
  tongue(3, SHIP_R + len * jit, C.clay);
  tongue(1.6, SHIP_R + len * jit * 0.55, C.bright);
}

function drawShip(x, y) {
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

function drawAim() {
  const d = fireDir();
  if (!d) return; // at rest and never aimed — nothing to point
  const px = G.ship.x + d.x * AIMDIST;
  const py = G.ship.y + d.y * AIMDIST;
  if (mouseMode()) {
    // Nova Drift-style direction marker: a small triangle stays AIMDIST
    // from the ship and points along the active firing direction. Normally
    // that is the native cursor; during right-flight it is the stored/snap aim.
    const nx = -d.y;
    const ny = d.x;
    ctx.fillStyle = C.clay;
    ctx.beginPath();
    ctx.moveTo(px + d.x * 5, py + d.y * 5);
    ctx.lineTo(px - d.x * 4 + nx * 3.5, py - d.y * 4 + ny * 3.5);
    ctx.lineTo(px - d.x * 4 - nx * 3.5, py - d.y * 4 - ny * 3.5);
    ctx.closePath();
    ctx.fill();
    return;
  }
  ctx.strokeStyle = C.clay;
  ctx.lineWidth = 1;
  ctx.beginPath(); // push mode retains its target ring plus four outer ticks
  ctx.arc(px, py, 3, 0, Math.PI * 2);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    ctx.moveTo(px + Math.cos(a) * 4.4, py + Math.sin(a) * 4.4);
    ctx.lineTo(px + Math.cos(a) * 6.4, py + Math.sin(a) * 6.4);
  }
  ctx.stroke();
}

// the world map in the corner: world-aspect (3072:3762 ≈ 76:93), a dot for
// the ship, a bright rectangle for the slice of world the camera shows
let MINIMAP = true;
const MM_W = 76;
const MM_H = 93;
const MM_M = 8; // margin from the viewport corner, px
function drawMinimap() {
  const mx = FW - MM_W - MM_M;
  const my = MM_M;
  ctx.fillStyle = "rgba(14, 17, 25, 0.7)"; // fieldBg at low opacity
  ctx.fillRect(mx, my, MM_W, MM_H);
  ctx.strokeStyle = C.wall;
  ctx.lineWidth = 1;
  ctx.strokeRect(mx + 0.5, my + 0.5, MM_W - 1, MM_H - 1);
  const kx = MM_W / WW;
  const ky = MM_H / WH;
  ctx.strokeStyle = C.bright; // the viewport — sized like the border (w-1,
  // h-1 around the +0.5 path) so the stroke stays inside the frame when the
  // camera sits clamped at the world's far corner
  ctx.strokeRect(mx + cam.x * kx + 0.5, my + cam.y * ky + 0.5, FW * kx - 1, FH * ky - 1);
  ctx.fillStyle = C.clay; // the ship — clamped so the 2px dot can't poke
  // past the frame when the ship rests against a world wall
  const sx = Math.max(mx, Math.min(mx + G.ship.x * kx - 1, mx + MM_W - 2));
  const sy = Math.max(my, Math.min(my + G.ship.y * ky - 1, my + MM_H - 2));
  ctx.fillRect(sx, sy, 2, 2);
}

function render() {
  // browser zoom can change devicePixelRatio without a resize event
  if (Math.min(window.devicePixelRatio || 1, 2) !== dpr) resize();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = C.pageBg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // both passes clip to the letterboxed field rect — the world and the sky
  // never paint into the bars
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  ctx.beginPath();
  ctx.rect(0, 0, FW, FH);
  ctx.clip();
  // WORLD PASS — the field ground fills the viewport (the camera clamp
  // keeps the whole view inside the world), the star layers parallax over
  // it, then everything else draws in world coordinates under the camera
  ctx.fillStyle = C.fieldBg;
  ctx.fillRect(0, 0, FW, FH);
  drawStars(); // sets per-layer fractional-camera transforms
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  ctx.translate(-cam.x, -cam.y);
  ctx.strokeStyle = C.wall;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, WW - 1, WH - 1); // the world border
  if (window.Encounter) Encounter.draw(ctx); // enemies, orbs, telegraphs — under the camera, below the ship
  drawFlame();
  drawShip(G.ship.x, G.ship.y);
  ctx.fillStyle = C.bright; // CQ pixel bullets
  for (const b of G.bullets) {
    if (b.dead || b.spent) continue; // consumed or expired — the next sweep removes it
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r || 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (G.running) drawAim();
  // UI PASS — the letterbox transform without the camera
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  if (MINIMAP) drawMinimap();
  if (window.Encounter) Encounter.drawHud(ctx); // encounter HUD and overlays — screen space, no camera
  if (!G.running) {
    ctx.textAlign = "center";
    ctx.font = "700 13px " + FONT;
    ctx.fillStyle = C.clay;
    ctx.fillText(G.started ? "CLICK TO CONTINUE" : mouseMode() ? "CLICK TO START" : "CLICK TO STEER", FW / 2, FH / 2 + 46);
    ctx.font = "400 10px " + FONT;
    ctx.fillStyle = C.dim;
    ctx.fillText(mouseMode() ? INVERT ? "the visible cursor aims · keys thrust · hold right to swap"
                                           : "mouse motion flies · keys aim · hold right to swap"
                            : INVERT ? "qweasdzxc keys fly the ship · the mouse aims · hold right to swap"
                                     : "mouse motion is thrust — a steady side push carves an arc", FW / 2, FH / 2 + 64);
    ctx.fillText(mouseMode() ? INVERT ? "right held: mouse flies · keys aim · left fires · esc pauses"
                                           : "right held: cursor aims · keys thrust · left fires · esc pauses"
                            : INVERT ? "left fires · esc releases"
                                     : "hold right to aim — qweasdzxc snaps it · left fires · esc releases", FW / 2, FH / 2 + 78);
    ctx.textAlign = "left";
  }
  ctx.restore(); // drop the field clip
}

// ---- loop control ----------------------------------------------------------
let raf = 0;
let looping = false;
let last = 0;
let acc = 0;
function loop(now) {
  if (!looping) return;
  const dt = Math.min(now - last, 200);
  last = now;
  acc += dt;
  let n = 0;
  while (acc >= TICK && n < 5) {
    step();
    acc -= TICK;
    n++;
  }
  if (acc > TICK) acc = TICK; // drop backlog beyond one tick — slow frames slow the sim, never fast-forward it
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

// ---- input -----------------------------------------------------------------
const locked = () => document.pointerLockElement === canvas;
const lockSupported = typeof canvas.requestPointerLock === "function";
function setAimMode(m) {
  const wasMouseAim = mouseMode() && aiming();
  AIMMODE = m === "push" ? "push" : "mouse";
  G.rightHeld = false;
  syncCursor();
  if (wasMouseAim && (!mouseMode() || !aiming())) snapshotMouseAim();
  // This is mainly selected while paused, but keep programmatic/live mode
  // changes safe too: mouse mode must immediately give the pointer back.
  if (mouseMode() && locked() && typeof document.exitPointerLock === "function") document.exitPointerLock();
  syncAimUi();
  render();
}
function pause() {
  if (!G.running) return;
  G.running = false;
  G.leftHeld = false; // a mouseup can vanish in the lock transition — never resume with a stuck button
  setRightHeld(false);
  if (mouseMode() && locked() && typeof document.exitPointerLock === "function") document.exitPointerLock();
  G.keys.clear(); // keyups can vanish the same way
  stopLoop();
  syncTuner();
  render();
}
// A lock request can fail (Chrome's ~1.3s post-Escape cooldown, automation,
// no API at all). Push mode cannot run without it, so only that caller pauses
// after both the raw and standard requests fail. Mouse mode asks for the
// standard lock directly: rejecting a raw request can consume the one user
// gesture its fallback needs, while standard lock still gives unbounded deltas.
function requestLock(pauseOnFailure = true, preferRaw = true) {
  if (!lockSupported || locked()) return;
  // unadjustedMovement disables OS mouse acceleration — closest to the raw
  // quadrature mouse the physics were designed around
  const guard = (p, retry) => {
    if (p && typeof p.catch === "function") {
      p.catch(() => { if (retry) attempt(false); else if (pauseOnFailure) pause(); });
    }
  };
  const attempt = (unadjusted) => {
    try {
      guard(unadjusted ? canvas.requestPointerLock({ unadjustedMovement: true }) : canvas.requestPointerLock(), unadjusted);
    } catch {
      if (unadjusted) attempt(false);
      else if (pauseOnFailure) pause();
    }
  };
  attempt(preferRaw);
}
function setRightHeld(held) {
  const wasMouseAim = mouseMode() && aiming();
  G.rightHeld = held;
  syncCursor();
  if (wasMouseAim && !aiming()) snapshotMouseAim();
}
function setInvert(v) {
  const wasMouseAim = mouseMode() && aiming();
  INVERT = v;
  if (wasMouseAim && !aiming()) snapshotMouseAim();
  syncAimUi();
  render();
}
canvas.addEventListener("mousedown", (e) => {
  e.preventDefault();
  if (mouseMode()) trackMouse(e); // the start click establishes an aim point, but still never fires
  if (!G.running) {
    if (e.button !== 0) return; // only LEFT starts — a stray right press stays idle
    if (window.Encounter && Encounter.frozen()) {
      // dead/upgrade overlays: the click resumes only the loop — combat
      // stays frozen and the overlay's own keys (R, 1/2/3) are the way on.
      // Lock-dependent modes still re-arm their pointer lock here, so an
      // R-restart after this resume has working flight controls.
      G.running = true;
      syncCursor();
      if (!mouseMode()) requestLock();
      else if (!aiming()) requestLock(false, false);
      syncTuner();
      startLoop();
      return;
    }
    if (!G.started) {
      G.started = true;
      G.vel = { x: 0, y: 0 }; // the session starts from rest
    }
    if (!mouseMode()) requestLock();
    else if (!aiming()) requestLock(false, false); // inverted-off starts in mouse-flight
    G.running = true;
    syncCursor();
    if (tuner.contains(document.activeElement)) document.activeElement.blur(); // arrows must not nudge sliders mid-flight
    syncTuner();
    startLoop();
    if (!mouseMode() && aiming()) enterAim(); // inverted push mode opens at the existing fire direction
    return; // the click that starts or resumes never fires
  }
  if (!mouseMode() && lockSupported && !locked()) {
    if (e.button === 0) requestLock(); // steering lost mid-run — this click re-arms it, never fires
    return;
  }
  if (e.button === 2) {
    const wasMouseFlight = mouseMode() && !aiming();
    setRightHeld(true);
    if (mouseMode()) {
      if (!aiming()) requestLock(false, false); // old flight path: pointer-locked, unbounded deltas
      else if (wasMouseFlight && locked() && typeof document.exitPointerLock === "function") document.exitPointerLock();
    } else if (aiming()) enterAim();
  } else if (e.button === 0) {
    G.leftHeld = true;
    fire();
  }
});
document.addEventListener("mouseup", (e) => {
  if (e.button === 0) G.leftHeld = false;
  else if (e.button === 2) {
    const leavingMouseFlight = mouseMode() && !aiming();
    setRightHeld(false);
    if (mouseMode()) {
      if (leavingMouseFlight && locked() && typeof document.exitPointerLock === "function") document.exitPointerLock();
      else if (!aiming()) requestLock(false, false); // inverted-off release returns to mouse-flight
    }
    if (G.running && !mouseMode() && aiming()) enterAim(); // inverted push mode re-enters aim
  }
});
// the 8-way ring — QWE/ADZXC around S, by e.code so any layout works; S
// doubles as down, same as X. The keys snap the aim while the mouse
// thrusts; while the mouse aims they thrust instead, per tick in step()
const KEY_AIM = {
  KeyW: [0, -1], KeyE: [1, -1], KeyD: [1, 0], KeyC: [1, 1],
  KeyX: [0, 1], KeyS: [0, 1], KeyZ: [-1, 1], KeyA: [-1, 0], KeyQ: [-1, -1],
};
document.addEventListener("keydown", (e) => {
  if (e.code === "Escape") {
    if (G.running && mouseMode()) {
      e.preventDefault();
      pause(); // mouse mode owns pause directly, including locked right-flight
    }
    return;
  }
  if (!G.running) return; // the ring only exists in flight, same as the right button
  const d = KEY_AIM[e.code];
  if (!d) return;
  G.keys.add(e.code);
  if (aiming() || e.repeat) return; // thrust role — step() applies it while held
  const m = Math.hypot(d[0], d[1]);
  G.aimAngle = Math.atan2(d[1], d[0]);
  G.aimOff.x = (d[0] / m) * AIM_R; // keep the push model in step
  G.aimOff.y = (d[1] / m) * AIM_R;
  G.aimed = true;
});
document.addEventListener("keyup", (e) => G.keys.delete(e.code));
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
function trackMouse(e) {
  if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return;
  G.mouse.x = e.clientX;
  G.mouse.y = e.clientY;
  G.mouse.seen = true;
}
document.addEventListener("mousemove", (e) => {
  if (mouseMode()) {
    if (!locked()) trackMouse(e); // locked deltas fly the ship; preserve the pre-lock cursor target for release
    if (locked() && G.running && !aiming()) thrustImpulse(e.movementX, e.movementY);
    return;
  }
  if (!locked() || !G.running) return;
  if (aiming()) aimImpulse(e.movementX, e.movementY);
  else thrustImpulse(e.movementX, e.movementY);
});
document.addEventListener("pointerlockchange", () => {
  if (!mouseMode()) {
    if (!locked()) pause();
    return;
  }
  if (locked() && aiming()) { // a delayed right-flight request resolved after the button was released
    if (typeof document.exitPointerLock === "function") document.exitPointerLock();
  } else if (!locked() && G.running && !aiming()) {
    pause(); // Escape or unexpected lock loss ends right-flight cleanly
  }
});
document.addEventListener("pointerlockerror", () => {
  if (!mouseMode() || (G.running && !aiming())) pause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
window.addEventListener("resize", () => {
  resize();
  render(); // resetting canvas.width wipes the bitmap — repaint immediately, mid-run too
});

// tuning controls — live on the pause/idle screen, where the mouse is free
function syncTuner() {
  tuner.style.display = G.running ? "none" : "flex";
}
function syncAimUi() {
  canvas.setAttribute("aria-label", mouseMode()
    ? INVERT
      ? "Ship playground — move the visible pointer to aim, hold right to fly with the mouse and aim with QWE/ASDZXC, left fires, Escape pauses"
      : "Ship playground — move the mouse to fly and QWE/ASDZXC to aim, hold right to aim with the visible pointer, left fires, Escape pauses"
    : "Ship playground — relative push controls use pointer lock, left fires, Escape releases pointer lock");
}
function showTuner() {
  const out = (id, t) => { document.getElementById(id).textContent = t; };
  out("vmax-out", VMAX.toFixed(1) + " px/tick · " + Math.round((1000 / TICK) * VMAX) + " px/s");
  out("accel-out", ACCEL.toFixed(3) + " · " + Math.round(VMAX / ACCEL) + " counts to top");
  out("turn-out", TURN.toFixed(3));
  out("keythrust-out", KEYTHRUST.toFixed(1) + " counts/tick · " + (VMAX / (KEYTHRUST * ACCEL * (1 + KEYTHRUST * FLICK)) / 60).toFixed(1) + " s to top");
  out("wallloss-out", Math.round(WALLLOSS * 100) + "% speed lost per bounce");
  out("aimmode-out", AIMDESC[AIMMODE]);
  out("aimsens-out", AIMSENS.toFixed(2) + (mouseMode() ? " · push mode only" : " relative gain"));
  out("aimdist-out", AIMDIST + " px to " + (mouseMode() ? "triangle" : "target"));
  out("invert-out", "on = mouse aims; hold right to fly");
  out("cool-out", BCOOL + " ms · " + (1000 / BCOOL).toFixed(1) + " shots/s");
  out("bspeed-out", BSPEED.toFixed(1) + " px/tick · " + Math.round((1000 / TICK) * BSPEED) + " px/s");
  out("bfactor-out", BFACTOR.toFixed(2));
  out("bmax-out", String(BMAX));
  out("blife-out", BLIFE.toFixed(2) + " s");
  out("cammode-out", CAMDESC[CAMMODE]);
  out("camease-out", CAMEASE.toFixed(2) + " of the gap per tick");
  out("cambox-out", Math.round(CAMBOX * 100) + "% of the view");
  out("camlead-out", CAMLEAD + " ticks of lead");
  out("leadsrc-out", LEADDESC[LEADSRC]);
  out("aimlead-out", AIMLEAD + " px of aim lead");
  out("leadblend-out", "vel " + Math.round((1 - LEADBLEND) * 100) + "% / aim " + Math.round(LEADBLEND * 100) + "%");
  out("leaddz-out", LEADDZ + " ms to commit a reversal · 0 = off");
  out("edgemargin-out", EDGEMARGIN + " px the ship keeps from the view edge");
  out("stardens-out", STARDENS.toFixed(1) + " stars per cell (avg)");
}
const CAMDESC = { // one-line reminders beside the camera selector
  lock: "hard-centers the ship",
  smooth: "eases toward center",
  deadzone: "moves at the box edge",
  lookahead: "leads by the lead source",
  flip: "slides room to room",
};
const AIMDESC = {
  mouse: "visible pointer aim · right swaps roles",
  push: "legacy relative / pointer lock",
};
const LEADDESC = { // the same, for lookahead's lead source
  vel: "ahead of the velocity",
  aim: "ahead of the aim",
  blend: "a weighted mix of both",
  add: "both leads, summed",
  swap: "aim while aiming, else vel",
};
// one binder for every control: write the tunable, then refresh the readouts
function bind(id, set) {
  const c = document.getElementById(id);
  c.addEventListener("input", () => {
    set(c.type === "checkbox" ? c.checked : c.tagName === "SELECT" ? c.value : Number(c.value));
    showTuner();
  });
  return c;
}
bind("vmax", (v) => { VMAX = v; }).value = String(VMAX);
bind("accel", (v) => { ACCEL = v; }).value = String(ACCEL);
bind("turn", (v) => { TURN = v; }).value = String(TURN);
bind("keythrust", (v) => { KEYTHRUST = v; }).value = String(KEYTHRUST);
bind("wallloss", (v) => { WALLLOSS = v; }).value = String(WALLLOSS);
bind("aimmode", (v) => { setAimMode(v); }).value = AIMMODE;
bind("aimsens", (v) => { AIMSENS = v; }).value = String(AIMSENS);
bind("aimdist", (v) => { AIMDIST = v; }).value = String(AIMDIST);
bind("invert", (v) => { setInvert(v); }).checked = INVERT;
bind("cool", (v) => { BCOOL = v; }).value = String(BCOOL);
bind("autofire", (v) => { AUTOFIRE = v; }).checked = AUTOFIRE;
bind("bspeed", (v) => { BSPEED = v; }).value = String(BSPEED);
bind("bfactor", (v) => { BFACTOR = v; }).value = String(BFACTOR);
bind("bmax", (v) => { BMAX = v; }).value = String(BMAX);
bind("blife", (v) => { BLIFE = v; }).value = String(BLIFE);
bind("bounce", (v) => { BOUNCE = v; }).checked = BOUNCE;
bind("cammode", (v) => { setCamMode(v); }).value = CAMMODE;
bind("camease", (v) => { CAMEASE = v; }).value = String(CAMEASE);
bind("cambox", (v) => { CAMBOX = v; }).value = String(CAMBOX);
bind("camlead", (v) => { CAMLEAD = v; }).value = String(CAMLEAD);
bind("leadsrc", (v) => { LEADSRC = v; }).value = LEADSRC;
bind("aimlead", (v) => { AIMLEAD = v; }).value = String(AIMLEAD);
bind("leadblend", (v) => { LEADBLEND = v; }).value = String(LEADBLEND);
bind("leaddz", (v) => { LEADDZ = v; }).value = String(LEADDZ);
bind("edgemargin", (v) => { EDGEMARGIN = v; }).value = String(EDGEMARGIN);
bind("stardens", (v) => { STARDENS = v; render(); }).value = String(STARDENS); // the idle sky repaints live
bind("minimap", (v) => { MINIMAP = v; render(); }).checked = MINIMAP;
document.getElementById("reseed").addEventListener("click", () => {
  SEED = (Math.random() * 0x100000000) >>> 0;
  render(); // a whole new sky, same ship
});
syncAimUi();
syncCursor();
showTuner();

// ---- test hook -----------------------------------------------------------
// headless smoke checks drive the sim through this; normal play never does.
// updateCamera lets a check settle the camera with the ship pinned in place;
// the set* helpers and camState reach the tunables that live in closure
// lets, and gate exposes the lookahead commit-gate state.
window.__test = { G, cam, step, setCamMode, render, WW, WH, FW, FH,
  updateCamera, leadVec, aiming, fireDir, mouseAimDir, cursorHidden, gate, setAimMode, setRightHeld, setInvert,
  setMouseClient: (x, y) => { G.mouse.x = x; G.mouse.y = y; G.mouse.seen = true; },
  setLeadSrc: (v) => { LEADSRC = v; },
  setLeadDz: (v) => { LEADDZ = v; },
  setEdgeMargin: (v) => { EDGEMARGIN = v; },
  setCamLead: (v) => { CAMLEAD = v; },
  setAimLead: (v) => { AIMLEAD = v; },
  setVmax: (v) => { VMAX = v; },
  aimState: () => ({ AIMMODE, mouse: { ...G.mouse }, direction: fireDir(), aiming: aiming(), rightHeld: G.rightHeld, cursorHidden: cursorHidden(), locked: locked() }),
  camState: () => ({ CAMMODE, CAMEASE, CAMBOX, CAMLEAD, LEADSRC, AIMLEAD, LEADBLEND, LEADDZ, EDGEMARGIN }) };

resize();
render();
syncTuner();
