"use strict";

// Prototype playground: the Crystal Quest ship with second-order physics.
// The original (components/crystal-quest-game.tsx) mapped mouse *position*
// to velocity: offset/10 with per-axis clamps. This prototype's flight input
// is thrust — each mouse-flight movement or held key in the thrust role is
// an acceleration impulse, velocity integrates it, and a *radial* speed cap
// replaces the per-axis clamp, so a sideways push at full speed rotates the
// heading into an arc instead of pinning the old axis.
// Tuning began as the 30 Hz original rescaled to a 60 Hz sim, then feel
// testing settled it: top speed 2 px/tick (120 px/s baseline — the slider
// drives it live), gains 0.015/0.015 (~133 counts from rest to top), and a
// flick curve that amplifies fast deltas — a quick flick snaps the heading
// while slow motion stays precise. Impulses split against the current heading:
// ACCEL drives the along component (speed up / brake), TURN the across one
// (curve), so speed build-up and turn agility tune independently. Sliders
// drive VMAX, ACCEL and TURN live — they now sit one screen deeper, on the
// tabbed Dev Options panel the pause menu's button opens, so the paused
// screen itself is just a title and two buttons. The 512×342
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
let VMAX = 2;           // px per tick — 120 px/s baseline; the pause-screen slider drives this live, and
                        // Encounter.mods.speed (the AFTERBURNER upgrade) adds px/tick on top of it AT THE
                        // CLAMP in step() — a purchase never writes the tuner value
let ACCEL = 0.015;      // speed gain — velocity px/tick per count ALONG the heading (slider); default is the settled feel
let TURN = 0.015;       // turn gain — the same, for the component ACROSS the heading (slider); equal gains = the old single-gain model
let FLICK = 0.01;       // flick curve — gain × (1 + |delta| × FLICK); a 100-count flick doubles its push.
                        // No slider — a let only so the measurement harness (__test.setFlick) can
                        // isolate the curve from the heading resample; the default never moves here
const DAMP = 1;         // per-tick velocity retention — 1 = no friction, like the original; try 0.98 to coast down
let KEYTHRUST = 16;     // keyboard thrust — synthetic mouse counts per tick, through the same impulse pipeline
let WALLLOSS = 0.5;     // fraction of the flipped velocity component the ship loses on a wall bounce
let AIMSENS = 0.03;     // push-mode aim gain — offset px per count
let AIMDIST = 20;       // direction-marker distance from the ship, px
let AIMMODE = "locked"; // locked = the default; mouse = visible absolute pointer; push = legacy relative/pointer-lock
                        // controls; locked = mouse-mode roles under ONE held pointer lock, aiming with a
                        // cursor drawn on the canvas — the lock never cycles, so the browser's takeover
                        // banner fires once per resume instead of once per right press
let INPUTMODE = "tick";  // tick = the default: sum the reports and apply once
                         // per fixed step, so the ship flies the same on a
                         // 125 Hz and a 1000 Hz mouse; event = apply each OS
                         // mouse report as it arrives. The two differ twice
                         // over: the flick curve is superlinear in the delta,
                         // and the along/across split re-reads G.vel per call.
let INPUTLAG = 0;        // ms of artificial input delay — the playability probe for a
                         // future networked build. It delays the APPLIED INPUT only:
                         // never the render, the audio or the enemies. Tick mode only —
                         // a tick delay is a ring of per-tick sums, and an OS event has
                         // no tick to be late against, so event mode disables the slider
let BCOOL = 400;        // ms between shots — 2.5 shots/s; one gate for click fire and autofire
let AUTOFIRE = true;    // hold LEFT to keep firing at the cooldown rate
let BMODE = "off";      // bullet physics — off | newtonian (adds ship vel × factor) | cq-scale (ship speed × factor); code-only, no menu knob
let BSPEED = 15;        // bullet speed, px per tick (off and newtonian modes)
let BFACTOR = 1;        // the ship-velocity factor — newtonian adds it, cq-scale multiplies by it
let BMAX = 15;          // max live bullets (the original capped at 5)
let BLIFE = 0.5;        // bullet lifetime, seconds
let BDMG = 1;           // damage one player bullet deals — encounter.js reads it for the enemy side of a body
                        // contact, so a ram costs exactly one bullet; code-only, no menu knob (a future
                        // Encounter.mods damage term must multiply into BOTH fire() and contactEvent)
let CONTACTCD = 62;     // ticks before one enemy body can take contact damage again — mirrors the player's
                        // post-hit grace (ECFG.player.invuln), so a sustained overlap trades hull for hp once
                        // a second instead of melting; at the slider's 0 floor a body pays once per TICK of
                        // contact — never twice for one touch, see contactEvent; slider, combat tab
let BOUNCE = false;     // bullets bounce off walls instead of dying at them
let BLASTR = 18;        // BLAST CHARGE splash radius at rank 1, px — the shop row's reach; slider, weapons tab
let BLASTGAIN = 8;      // px the radius grows per rank past the first: BLASTR + BLASTGAIN × (rank − 1)
// ---- audio ---------------------------------------------------------------
// js/audio.js reads every one of these LIVE at cue time and every frame — the
// same deal encounter.js has with BDMG and CONTACTCD: that module owns the
// synthesis, this file owns the numbers, and a page without js/audio.js still
// has a complete, harmless audio tab whose sliders drive nothing.
let SFXVOL = 0.65;   // master, 0..1 — audio.js applies SFXVOL^1.6 × 0.4, the ancestor's own curve
let SFXMUTE = false; // the hard switch: a muted page allocates no voices at all, it does not gain them to zero
let SFXSHOT = 1;     // bus trim — fire, wall ticks, hits, kills, the blast splash
let SFXFOE = 1;      // bus trim — lance and lunge tells, spawns, damage taken, death
let SFXUI = 1;       // bus trim — orb pickups, wave alarms and banners, the shop
let SFXENG = 1;      // engine hum trim — the hum tracks G.flame, so this trims what the flame sounds like; 0 is off
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
  radar: "#4fd1c5", // the radar variants' sensor cyan — reads as "looks ahead",
                    // and collides with nothing: clay is attack, steel is hull
};
const FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const canvas = document.getElementById("field");
const ctx = canvas.getContext("2d");
const pausemenu = document.getElementById("pausemenu"); // the paused root screen — title, dev options, resume
const devpanel = document.getElementById("devpanel");   // the tabbed dev options screen the old flat tuner became
const devbody = devpanel.querySelector(".devbody");     // the scrolling part; the header above it stays put
const menutitle = pausemenu.querySelector(".menutitle"); // reads "ready" before the first start, "paused" after
const resumebtn = document.getElementById("resumebtn");  // the same button with the same id — only the word moves

// Which paused screen is up, and which dev tab it opens on. Declared beside G
// because render() reads UI.dev, and render() is reachable from listeners
// registered long before the boot tail — a declaration further down would turn
// any early event into a temporal-dead-zone ReferenceError.
const UI = { dev: false, tab: "flight" };
const DEV_TABS = ["flight", "aim", "weapons", "camera", "world", "combat", "audio", "enemies"];

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
  hintTop = (oy + (FH / 2 + 96) * scale) / dpr; // just below the pause hints, in field space
  pausemenu.style.top = hintTop + "px"; // both paused screens hang from the same line —
  pausemenu.style.maxHeight = Math.max(60, window.innerHeight - hintTop - DEV_MARGIN) + "px";
  placeDevPanel(); // the panel earns the hint space back — see below
}
// The dev panel hangs from the pause menu's line too, but it also SUPPRESSES
// the pause text, so that space is free while it is open. A short window used
// to scroll a tab the screen had room for; now the panel measures its live tab
// at full height and hangs as low as it can while still fitting, climbing
// toward the top edge only as far as it must. Only a tab taller than the whole
// window scrolls. display:none measures 0, so a hidden panel is skipped and
// syncTuner() re-places it the moment it opens.
const DEV_MARGIN = 8;
let hintTop = 0; // the line the paused screens hang from — resize() owns it
function placeDevPanel() {
  if (devpanel.style.display === "none") return;
  devpanel.style.maxHeight = "none"; // measure the tab, not the last cap
  const need = devpanel.offsetHeight;
  const top = Math.max(DEV_MARGIN, Math.min(hintTop, window.innerHeight - need - DEV_MARGIN));
  devpanel.style.top = top + "px";
  devpanel.style.maxHeight = Math.max(60, window.innerHeight - top - DEV_MARGIN) + "px";
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
const lockedMode = () => AIMMODE === "locked";
// the absolute-cursor aim family: the visible native pointer (mouse) and the
// drawn synthetic one (locked) share every aim decision; push stays apart
const cursorAim = () => mouseMode() || lockedMode();
// The right button hides the cursor because in mouse mode it means "the mouse
// is flying the ship now". A FROZEN overlay owns the field instead, and the
// shop is a mouse UI — the cursor is the only way to click a card — so the
// hide stands down for as long as the freeze lasts, however the button sits.
const cursorHidden = () => mouseMode() && G.running && G.rightHeld &&
                           !(window.Encounter && Encounter.frozen());
function syncCursor() {
  // locked mode hides the CSS cursor for the whole running session: the held
  // lock hides the native pointer anyway, and the canvas draws its own
  canvas.classList.toggle("hide-cursor", cursorHidden() || (lockedMode() && G.running));
  // ...and the pointer over a live frozen overlay is a menu pointer, not the
  // crosshair the field wears. Both classes are set from one place so they
  // cannot contradict: hide-cursor only ever applies in flight, this only
  // ever over a freeze, and the two states are mutually exclusive above.
  // Locked mode opts out — its frozen shop runs on the drawn cursor.
  canvas.classList.toggle("ui-cursor",
    !lockedMode() && G.running && !!(window.Encounter && Encounter.frozen()));
}
// One boolean preserves the original invertible role swap in both modes:
// while aiming(), the mouse owns the aim and the keys thrust; otherwise the
// mouse thrusts and the keys snap the stored aim.
const aiming = () => G.rightHeld !== INVERT;
// The ring's THRUST role is a shop purchase (THRUST RING, 8 XP, one-time); its
// AIM role never was gated and never is — see the keydown handler, whose
// aim-snap branch runs exactly when the ring is the only aim control on the
// screen. step()'s thrust sum is the ONE site this predicate guards.
//
// Read LAZILY and defaulting PERMISSIVE: window.Encounter is assigned at the
// very end of encounter.js, long after this file has finished running, so a
// hoisted top-level read would be permanently undefined — and a locked default
// would leave a standalone game.js (no encounter at all) with no thrust.
const keyThrustUnlocked = () => !window.Encounter || Encounter.mods.keyThrust !== false;

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

// ---- per-tick input path (INPUTMODE "tick") --------------------------------
// The listener no longer decides how input lands; these dispatchers do. In
// event mode they are pass-throughs to the impulse functions above — the
// shipped path, byte-identical. In tick mode they bank RAW deltas (never
// pre-multiplied impulses: applying the flick curve and the along/across
// split once, at the tick, is the whole point) and step() applies the sums.
const inAcc = { tx: 0, ty: 0, ax: 0, ay: 0, cx: 0, cy: 0, n: 0 };
// the lag ring: one accumulated entry per tick, applied round(INPUTLAG/TICK)
// ticks late. Tick mode only — see the INPUTLAG comment.
const lagBuf = [];
function inputThrust(dx, dy) {
  if (INPUTMODE === "tick") { inAcc.tx += dx; inAcc.ty += dy; inAcc.n++; return; }
  thrustImpulse(dx, dy);
}
function inputAim(dx, dy) {
  if (INPUTMODE === "tick") { inAcc.ax += dx; inAcc.ay += dy; inAcc.n++; return; }
  aimImpulse(dx, dy);
}
function inputCursor(dx, dy) {
  if (INPUTMODE === "tick") { inAcc.cx += dx; inAcc.cy += dy; inAcc.n++; return; }
  moveLockedCursor(dx, dy);
}
function clearTickInput() {
  inAcc.tx = inAcc.ty = inAcc.ax = inAcc.ay = inAcc.cx = inAcc.cy = 0;
  inAcc.n = 0;
  lagBuf.length = 0;
}
// One call per step(), beside the keyboard thrust so both per-tick sources
// land in the same slot ahead of the damping and the radial clamp. Every tick
// consumes the accumulator — a catch-up frame's later steps see zeros, which
// is correct: the hand moved once. At most two lag entries leave per tick:
// the due one, plus one overdue after the slider shrank mid-flight — applied
// in order, none dropped, never the whole backlog in one tick.
function applyTickInput() {
  if (INPUTMODE !== "tick") return;
  lagBuf.push({ tx: inAcc.tx, ty: inAcc.ty, ax: inAcc.ax, ay: inAcc.ay, cx: inAcc.cx, cy: inAcc.cy });
  inAcc.tx = inAcc.ty = inAcc.ax = inAcc.ay = inAcc.cx = inAcc.cy = 0;
  inAcc.n = 0;
  const delay = Math.max(0, Math.round(INPUTLAG / TICK));
  for (let k = 0; k < 2 && lagBuf.length > delay; k++) {
    const a = lagBuf.shift();
    if (a.cx || a.cy) moveLockedCursor(a.cx, a.cy);
    if (a.ax || a.ay) aimImpulse(a.ax, a.ay);
    if (a.tx || a.ty) thrustImpulse(a.tx, a.ty);
  }
}
function setInputMode(m) {
  INPUTMODE = m === "tick" ? "tick" : "event";
  clearTickInput(); // a banked half-tick must not cross the mode line
  syncInputLagUi();
}
function syncInputLagUi() {
  const el = document.getElementById("inputlag");
  if (el) el.disabled = INPUTMODE !== "tick";
}

// ---- shooting ------------------------------------------------------------
// Convert the native pointer's CSS/client coordinates through the canvas
// backing buffer and letterbox transform. Comparing that viewport point to
// ship - camera makes the direction follow the ship's CURRENT screen
// position even when the camera or ship moves without another mouse event.
// client coordinates → LOGICAL FIELD coordinates: the letterbox transform
// only, with no camera, so the result lands in the space the UI pass draws in
// (the HUD, the overlays, the shop's cards). Null while the canvas has no box
// yet. Aim wants the same conversion, so it reads through this too.
function pointerField(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const bx = (clientX - r.left) * canvas.width / r.width;
  const by = (clientY - r.top) * canvas.height / r.height;
  return { x: (bx - ox) / scale, y: (by - oy) / scale };
}

// field → client, pointerField's inverse. The locked cursor keeps a client-
// space mirror in G.mouse through it, so encounter.js's shop paths and the
// aim snapshots read the synthetic cursor through the code they already use.
function fieldToClient(fx, fy) {
  const r = canvas.getBoundingClientRect();
  return { x: r.left + (ox + fx * scale) * r.width / canvas.width,
           y: r.top + (oy + fy * scale) * r.height / canvas.height };
}

// ---- the locked-mode synthetic cursor --------------------------------------
// Field coordinates, clamped to the field rectangle. Input state, never
// simulation state: it feeds the same aim-target read trackMouse feeds, and
// it stays out of every hash allow-list.
const lcur = { x: FW / 2, y: FH / 2 };
function mirrorLockedCursor() {
  const c = fieldToClient(lcur.x, lcur.y);
  G.mouse.x = c.x;
  G.mouse.y = c.y;
  G.mouse.seen = true;
}
function moveLockedCursor(dx, dy) {
  // client px → field px through the letterbox transform, so the drawn cursor
  // travels exactly as far on screen as the native one would have — the OS
  // curve still applies upstream (standard lock), and no extra gain does here
  const r = canvas.getBoundingClientRect();
  const k = r.width ? canvas.width / r.width / scale : 1;
  lcur.x = Math.max(0, Math.min(FW, lcur.x + dx * k));
  lcur.y = Math.max(0, Math.min(FH, lcur.y + dy * k));
  mirrorLockedCursor();
}
// entry seeds from the last known aim, so nothing jumps on the mode flip
function seedLockedCursor() {
  const p = G.mouse.seen ? pointerField(G.mouse.x, G.mouse.y) : null;
  if (p) {
    lcur.x = Math.max(0, Math.min(FW, p.x));
    lcur.y = Math.max(0, Math.min(FH, p.y));
  } else {
    const d = fireDir();
    lcur.x = Math.max(0, Math.min(FW, G.ship.x - cam.x + (d ? d.x * AIMDIST : 0)));
    lcur.y = Math.max(0, Math.min(FH, G.ship.y - cam.y + (d ? d.y * AIMDIST : 0)));
  }
  mirrorLockedCursor();
}

function mouseAimDir() {
  if (lockedMode()) { // the drawn cursor IS the pointer — no client roundtrip noise
    const dx = lcur.x - (G.ship.x - cam.x);
    const dy = lcur.y - (G.ship.y - cam.y);
    const m = Math.hypot(dx, dy);
    return m < 0.001 ? null : { x: dx / m, y: dy / m };
  }
  if (!G.mouse.seen) return null;
  const p = pointerField(G.mouse.x, G.mouse.y);
  if (!p) return null;
  const dx = p.x - (G.ship.x - cam.x);
  const dy = p.y - (G.ship.y - cam.y);
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
  if (cursorAim() && aiming()) return mouseAimDir();
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
  const em = window.Encounter ? Encounter.mods : null; // upgrade terms — the tuner values stay untouched
  // one id SPACE across bullets and bodies — a replication layer keys by id
  // alone and cannot disambiguate by owning array; a page without the
  // encounter has nothing to replicate, so 0 stands in there
  G.bullets.push({ id: window.Encounter ? Encounter.nextId() : 0,
                   x: G.ship.x, y: G.ship.y, px: G.ship.x, py: G.ship.y, vx, vy,
                   r: 2.2, dmg: BDMG, owner: "player", dead: false, spent: false,
                   ttl: Math.max(1, Math.round(BLIFE * 1000 / TICK)) }); // no upgrade touches lifetime — BLIFE is the only knob
  G.cool = Math.max(1, Math.round(BCOOL * (em ? em.cool : 1) / TICK));
  if (window.Encounter) Encounter.emit("fire"); // after every gate above — a refused shot is silent
}

// ---- simulation step (one ~16.7ms update) --------------------------------
// simTick counts every step() call for the run's whole life — the input
// recorder orders events against it, and E.waveTick cannot serve because it
// resets per wave. It counts frozen calls too: a replay reproduces the raw
// call stream, and the shop's frozen ticks are part of that stream.
let simTick = 0;
function step() {
  simTick++;
  if (window.Encounter && Encounter.frozen()) { // shop/death overlays freeze the whole sim
    clearTickInput(); // frozen ticks DISCARD banked input, lag buffer included —
                      // thrustImpulse's own refusal to pump a frozen sim, matched
    return;
  }
  applyTickInput(); // the per-tick mouse path lands beside the keyboard thrust
                    // below, before the damping and the radial clamp
  // the keys fly the ship while the mouse owns the aim — once the THRUST RING
  // has been bought. Locked, the ring keeps its aim role and only this sum
  // goes quiet; the HUD prints THRUST LOCKED — SHOP for the whole run.
  if (keyThrustUnlocked() && aiming() && G.keys.size) {
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
  // the AFTERBURNER upgrade adds px/tick ON TOP of the slider: the clamp is
  // the only place the two meet, so the VMAX tuner value itself never moves
  // and a restart (which zeroes mods.speed) hands the slider back untouched
  const emx = window.Encounter ? Encounter.mods : null;
  const vcap = VMAX + (emx ? emx.speed : 0);
  const s = Math.hypot(G.vel.x, G.vel.y);
  if (s > vcap) {
    G.vel.x *= vcap / s;
    G.vel.y *= vcap / s;
  }
  // walls reflect the ship: position mirrors about the margin, and the
  // flipped velocity component keeps 1−WALLLOSS — restitution on that axis
  // only, so grazing bounces lose little and head-on ones lose the most
  const keep = WALLLOSS - 1; // negated: flip and damp in one multiply
  G.ship.x += G.vel.x;
  G.ship.y += G.vel.y;
  let wallHit = 0; // the flipped component's pre-bounce speed — it rides out as the thud event's gain, nothing else reads it
  if (G.ship.x < SHIP_R) { G.ship.x = SHIP_R * 2 - G.ship.x; wallHit = Math.abs(G.vel.x); G.vel.x *= keep; }
  else if (G.ship.x > WW - SHIP_R) { G.ship.x = (WW - SHIP_R) * 2 - G.ship.x; wallHit = Math.abs(G.vel.x); G.vel.x *= keep; }
  if (G.ship.y < SHIP_R) { G.ship.y = SHIP_R * 2 - G.ship.y; wallHit = Math.max(wallHit, Math.abs(G.vel.y)); G.vel.y *= keep; }
  else if (G.ship.y > WH - SHIP_R) { G.ship.y = (WH - SHIP_R) * 2 - G.ship.y; wallHit = Math.max(wallHit, Math.abs(G.vel.y)); G.vel.y *= keep; }
  // the Math.max above is what makes a corner bounce ONE event instead of
  // two; the magnitude rides through as the thud's volume, so a graze
  // whispers and a full-speed slam lands. Queued through the encounter's
  // event stream — the crossing that runs game → encounter, which is why
  // Encounter.emit is published at all.
  if (wallHit > 0 && window.Encounter) Encounter.emit("thud", null, Math.min(1, wallHit / 4));
  updateCamera(); // the view follows once the ship has settled for this tick
  G.flame.x += (G.thrustAcc.x - G.flame.x) * FLAME_EASE;
  G.flame.y += (G.thrustAcc.y - G.flame.y) * FLAME_EASE;
  G.thrustAcc.x = G.thrustAcc.y = 0;
  if (G.cool > 0) G.cool--;
  if (AUTOFIRE && G.leftHeld) fire();
  stepImpacts(); // visual bursts age on the sim clock — pause and frozen freeze them too
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    if (b.dead || b.spent) { G.bullets.splice(i, 1); continue; } // consumed by a hit, or expired after its final sweep
    b.px = b.x; // previous position — the encounter sweeps this segment for hits
    b.py = b.y;
    b.x += b.vx;
    b.y += b.vy;
    if (BOUNCE) {
      // the reflected chord px→x approximates the folded path; enemy bodies
      // never overhang the world walls, so the chord cannot phantom-hit.
      // Each spark is queued BEFORE its mirror and read off the RAW segment:
      // the contact point is where px→x crosses the plane, and the direction
      // is the velocity it arrived on — spawnImpactFx wants the INCOMING one,
      // so a corner bounce cannot hand the second wall a mirrored x or vx.
      const rx = b.x, ry = b.y, rvx = b.vx, rvy = b.vy;
      const m = Math.hypot(rvx, rvy) || 1;
      if (rx < 0) { queueWallFx(b, 0, alongWall(b.py, ry, crossT(b.px, rx, 0), WH), rvx / m, rvy / m); b.x = -b.x; b.vx = -b.vx; }
      else if (rx > WW) { queueWallFx(b, WW, alongWall(b.py, ry, crossT(b.px, rx, WW), WH), rvx / m, rvy / m); b.x = WW * 2 - b.x; b.vx = -b.vx; }
      if (ry < 0) { queueWallFx(b, alongWall(b.px, rx, crossT(b.py, ry, 0), WW), 0, rvx / m, rvy / m); b.y = -b.y; b.vy = -b.vy; }
      else if (ry > WH) { queueWallFx(b, alongWall(b.px, rx, crossT(b.py, ry, WH), WW), WH, rvx / m, rvy / m); b.y = WH * 2 - b.y; b.vy = -b.vy; }
    }
    b.ttl--;
    // expiry marks, never splices here — the encounter hook still sweeps
    // this final segment, and the next pass removes the bullet. The two
    // clauses were one condition; splitting them only tells the two deaths
    // apart for the spark — b.spent still becomes true in exactly the same
    // cases, the both-true overlap included.
    if (!BOUNCE && outOfWorld(b)) {
      b.spent = true; // left the world — the spark waits on the encounter sweep
      const m = Math.hypot(b.vx, b.vy) || 1;
      const w = wallExitPoint(b);
      queueWallFx(b, w.x, w.y, b.vx / m, b.vy / m);
    } else if (b.ttl <= 0) b.spent = true; // mid-air fade — no impact, nothing was hit
  }
  if (window.Encounter) Encounter.step(); // enemies, damage, XP, wave state
  flushWallFx(); // only the bullets the sweep left alive really met the wall
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
  if (cursorAim()) {
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

// the locked-mode pointer: drawn on the canvas because the held lock hides
// the native one. Render pass ONLY, never step() — phase 4 moves the camera
// out of the tick, and a tick-drawn cursor would be a fresh coupling of the
// kind this chain removes. Hidden during right-hold flight, mirroring how
// mouse mode's hidden native cursor holds still for the same stretch.
function drawLockedCursor() {
  if (!lockedMode() || !G.running) return;
  if (!aiming() && !(window.Encounter && Encounter.frozen())) return;
  ctx.strokeStyle = C.bright;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(lcur.x, lcur.y, 3.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = C.clay;
  ctx.fillRect(lcur.x - 0.6, lcur.y - 0.6, 1.2, 1.2);
}

// the world map in the corner: world-aspect (3072:3762 ≈ 76:93), a dot for
// the ship, a bright rectangle for the slice of world the camera shows, and
// contact dots for the live enemies, XP orbs and player shots
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
  // contact dots — between the viewport rectangle and the ship dot so the
  // ship always reads on top. Same clamp discipline as the ship dot: a dot
  // of side s stays inside [m, m + MM − s] per axis, so nothing pokes past
  // the frame when an entity hugs a world wall. Draw-only reads of live sim
  // state — no randomness, no mutation, the seeded stream is untouched.
  const dot = (wx, wy, s) => {
    ctx.fillRect(Math.max(mx, Math.min(mx + wx * kx - s / 2, mx + MM_W - s)),
                 Math.max(my, Math.min(my + wy * ky - s / 2, my + MM_H - s)), s, s);
  };
  ctx.fillStyle = C.dim; // player shots — the faintest, most transient trace
  for (const b of G.bullets) { if (!b.dead && !b.spent) dot(b.x, b.y, 1); }
  if (window.Encounter) {
    const m = Encounter.mapState(); // live arrays — read, never mutate
    ctx.fillStyle = C.clay;   // XP orbs wear their field color; 1 px vs the 2 px ship
    for (const o of m.orbs) dot(o.x, o.y, 1);
    ctx.fillStyle = C.bright; // enemies — the loudest mark on the map
    for (const e of m.enemies) dot(e.x, e.y, 2);
  }
  ctx.fillStyle = C.clay; // the ship — clamped so the 2px dot can't poke
  // past the frame when the ship rests against a world wall
  const sx = Math.max(mx, Math.min(mx + G.ship.x * kx - 1, mx + MM_W - 2));
  const sy = Math.max(my, Math.min(my + G.ship.y * ky - 1, my + MM_H - 2));
  ctx.fillRect(sx, sy, 2, 2);
}

// the other tracking layer: chevrons on the field's inner edge pointing at
// enemies the viewport has lost. The geometry and the drawing live in
// encounter.js beside the enemy list; this flag is the world-tab switch it
// reads, declared here with the rest of the HUD toggles.
let EDGEARROWS = true;

// ---- the first-run controls card -------------------------------------------
// One cached bitmap that teaches the shipped mouse contract — the visible
// cursor aims, left fires, hold right and move the mouse to fly — drawn on the
// idle field of a session that has never started. G.started is the whole gate:
// it flips once, inside resume(), and from then on every pause is the ordinary
// text screen for the rest of the page's life. Nothing is persisted, so a
// reload is a fresh first run again — deliberately, while the game is a
// prototype people open cold.
//
// Accuracy is a precondition rather than a hope. The art draws the CURSOR-AIM
// roles — move to aim, left fires, hold right and move to fly — which is the
// contract of both mouse mode and the shipped locked mode: the two differ only
// in whether that cursor is the native pointer or the one drawn on the canvas,
// and the card teaches neither of those words. Push mode inverts the roles
// outright, and clearing "invert right" swaps them, so either gets the text
// screen instead of a card that would lie. The same is true of the ring: the
// card names no keys, which is exactly the contract a first-run player has.
// The bitmap also states LEFT CLICK TO START,
// so while it is up render() drops the canvas start copy and the corner map
// and leaves one hierarchy on the screen.
//
// The load is asynchronous, so guideReady opens false and the text screen
// covers the gap; a load that never completes simply never flips it, and the
// text screen is what the player keeps. The handler asks for a repaint and
// nothing else — it never starts the loop or touches sim state.
const GUIDE_SRC = "assets/ui/mouse-controls-explainer.png";
const GUIDE_W = 480;                // the 3:1 asset at an integer logical size
const GUIDE_H = 160;                // 480 × 160 — exactly the source's 2172:724
const GUIDE_X = (FW - GUIDE_W) / 2; // 16 px of field either side
const GUIDE_Y = 60;                 // clear of the HUD's top line, well above the pause menu's
const guideImg = new Image();
let guideReady = false;
guideImg.addEventListener("load", () => { guideReady = true; render(); });
guideImg.src = GUIDE_SRC;
// Two questions, deliberately separate. ELIGIBLE is "does this screen belong
// to the card" — pure state, answerable before the bytes arrive. SHOWN adds
// "and there is a bitmap to draw". Everything the card suppresses keys off
// SHOWN, so an unloaded frame is the plain text screen, unchanged.
function guideEligible() {
  return !G.running && !G.started && !UI.dev && cursorAim() && INVERT;
}
function guideShown() { return guideEligible() && guideReady; }

// ---- the eight-way thrust card ---------------------------------------------
// The THRUST RING row's explainer art. This file owns the ASSET — exactly as
// it owns the first-run card — and encounter.js owns the RECT: the shop pops
// this up while the pointer rests on that row's card, on the half of the grid
// the hovered card is not in, and drops it the moment the pointer leaves. It
// is a hover preview, not a purchase reveal and not a modal: every card and
// the NEXT WAVE button stay clickable underneath it.
//
// The load is asynchronous on the same contract as the first-run card:
// ringReady opens false, the handler asks for one repaint and nothing else,
// and a load that never completes simply leaves the shop's hover showing the
// row's own description line and no art at all.
// The asset is 2172 × 724 and carries a footer band — "PRESS ENTER TO
// CONTINUE" — left from the flow that used to raise it on the sale. The shop
// binds no keys at all now, so that line is simply false, and a preview must
// not instruct. Only the CONTENT band is drawn: source rows 0..RING_CROP_H,
// cut just above the footer's own top rule at y=612. The popup's clay border
// stands in for the frame the crop takes off.
const RING_SRC = "assets/ui/eight-way-thrust-explainer.png";
const RING_SRC_W = 2172;
const RING_CROP_H = 610;
const RING_RATIO = RING_SRC_W / RING_CROP_H; // ≈3.56 — encounter.js sizes the popup to this
const ringImg = new Image();
let ringReady = false;
ringImg.addEventListener("load", () => { ringReady = true; render(); });
ringImg.src = RING_SRC;
function ringCardReady() { return ringReady; }
function drawRingCard(x, y, w, h) {
  ctx.drawImage(ringImg, 0, 0, RING_SRC_W, RING_CROP_H, x, y, w, h);
}

// ---- bullet impact fx ------------------------------------------------------
// Purely visual. Bursts are spawned by resolveBulletHits() (enemy hits, in
// encounter.js) and by the wall clauses in step() above — those queue and are
// flushed after the encounter sweep, see queueWallFx(). They age only in
// step(), so pausing or a frozen overlay freezes them mid-burst like
// everything else. NO randomness stream is consumed anywhere: each burst
// carries a hash32 seed and drawImpacts() re-derives every particle from
// (seed, age) each frame — the same frame paints the same pixels forever.
let FXINT = 1;      // impact fx intensity — scales particle count and size; 0 = off (slider)
let FXDUR = 0.3;    // burst lifetime, seconds (slider)
const FX_MAX = 48;  // live burst cap — the oldest is evicted first
const FX_SEED = 0x1F2E3D4C; // fixed hash salt — bursts replay identically across runs
// per-kind look — enemy hits, wall deaths, and the BLAST CHARGE splash. A
// `radial` kind ignores the incoming direction and reads the burst's own
// radius instead: it sprays the full circle out to the rim the sim actually
// damaged, so the ring a player sees IS the reach they bought.
const FX_KINDS = {
  enemy: { n: 8,  ring: true,  spMin: 0.8,  spMax: 2.4, cone: 2.8, color: C.clay,    color2: C.bright },
  wall:  { n: 4,  ring: false, spMin: 0.5,  spMax: 1.5, cone: 2.0, color: "#9aa3b2", color2: C.dim },
  blast: { n: 14, ring: true,  spMin: 0.55, spMax: 1,   cone: 0,   color: C.clay,    color2: C.bright, radial: true },
};
const fx = { bursts: [], count: 0 };
// r is the burst's own radius in px — only radial kinds read it, and only the
// blast passes one: the effective splash radius the sim just applied
function spawnImpactFx(x, y, dx, dy, kind, r) {
  if (FXINT <= 0) return; // the off switch — nothing spawns, nothing lingers
  const K = FX_KINDS[kind] || FX_KINDS.enemy;
  fx.count = (fx.count + 1) >>> 0;
  if (fx.bursts.length >= FX_MAX) fx.bursts.shift();
  fx.bursts.push({ x, y, dx, dy, kind: FX_KINDS[kind] ? kind : "enemy", age: 0,
    life: Math.max(1, Math.round(FXDUR * 1000 / TICK)), // stamped at spawn, like bullet ttl
    n: Math.max(1, Math.round(K.n * FXINT)),
    scale: FXINT,
    r: r === undefined ? 0 : r, // stamped like the lifetime: a slider moved mid-burst never resizes it
    seed: hash32(Math.round(x), Math.round(y), fx.count, FX_SEED) });
}
function resetImpactFx() { fx.bursts.length = 0; fx.count = 0; fxWall.length = 0; }
// Wall sparks are QUEUED, never spawned inline: the encounter sweep runs after
// the bullet loop and still tests this tick's px→x segment, so a bullet can be
// eaten by a body short of the wall it was heading for. Only the bullets that
// survive that sweep actually reached the wall, so the queue drains at the end
// of step() and drops the entries whose bullet died on the way.
// The FXINT gate used to live on the queue push; it now lives in
// spawnImpactFx alone (whose first line already early-returns on FXINT <= 0,
// so the visual side is byte-identical at every slider value). What changes
// is that the wall EVENT survives to the flush and can be heard — a
// decoration slider must not silently double as a mute switch for wall
// ticks. The audio cue sits HERE, in the survivor loop, never at the
// bullet-loop spent sites: the queue exists precisely because the encounter
// sweep can eat a bullet short of the wall it was heading for, and the sound
// inherits that arbitration exactly as the spark does.
const fxWall = [];
function queueWallFx(b, x, y, dx, dy) { fxWall.push({ b, x, y, dx, dy }); }
function flushWallFx() {
  for (const q of fxWall) {
    if (q.b.dead) continue;
    spawnImpactFx(q.x, q.y, q.dx, q.dy, "wall");
    if (window.Encounter) Encounter.emit("wall", q); // q carries x/y — the same contact point as the spark
  }
  fxWall.length = 0;
}
// Where a segment crosses a wall plane: the parameter on the crossing axis,
// clamped to the segment (0 when it began past the plane already).
function crossT(p0, p1, plane) { const d = p1 - p0; return d === 0 ? 0 : Math.max(0, Math.min(1, (plane - p0) / d)); }
// The other axis read at that same parameter, held inside the world. Clamping
// the post-move position instead would slide the spark a whole tick of
// tangential travel along the wall on any non-perpendicular shot.
function alongWall(q0, q1, t, span) { return Math.max(0, Math.min(span, q0 + (q1 - q0) * t)); }
// Did this tick's move carry the bullet out of the world? True only on the
// terminal path: a bouncing bullet was mirrored back inside before this asks.
function outOfWorld(b) { return b.x < 0 || b.x > WW || b.y < 0 || b.y > WH; }
// Where a bullet that left the world crossed the boundary. The FIRST plane the
// segment crossed wins: its own axis snaps exactly onto that plane, the other
// rides the segment to the same parameter. An axis still inside the world takes
// t=2 and can never win the min. Undefined for a bullet still inside — every
// caller gates on outOfWorld() first. The wall spark reads it, and so does the
// encounter's wall blast, so the two can never disagree about the contact point.
function wallExitPoint(b) {
  const ox = b.x < 0 ? 0 : b.x > WW ? WW : -1;
  const oy = b.y < 0 ? 0 : b.y > WH ? WH : -1;
  const tx = ox < 0 ? 2 : crossT(b.px, b.x, ox);
  const ty = oy < 0 ? 2 : crossT(b.py, b.y, oy);
  const te = Math.min(tx, ty);
  return { x: tx <= ty ? ox : alongWall(b.px, b.x, te, WW),
           y: ty < tx ? oy : alongWall(b.py, b.y, te, WH) };
}
function stepImpacts() {
  for (let i = fx.bursts.length - 1; i >= 0; i--) {
    if (++fx.bursts[i].age >= fx.bursts[i].life) fx.bursts.splice(i, 1);
  }
}
function drawImpacts() { // draw-only — reads burst state, never mutates it
  for (const B of fx.bursts) {
    const K = FX_KINDS[B.kind];
    const p = B.age / B.life;      // 0..1 progress
    const fade = 1 - p;
    const base = Math.atan2(-B.dy, -B.dx); // spray back off the surface
    // a radial burst is sized by the sim, not by the spray: the ring opens to
    // the exact radius the damage covered and the sparks stop at that rim
    const radial = K.radial && B.r > 0;
    let h = B.seed;
    const rnd = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 0x100000000; };
    if (K.ring) { // one expanding ring flash under the sparks
      ctx.strokeStyle = K.color;
      ctx.globalAlpha = 0.45 * fade;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(B.x, B.y, Math.max(0.5, radial ? 2 + (B.r - 2) * p : 2 + 9 * p), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = fade;
    for (let i = 0; i < B.n; i++) { // three LCG draws per spark: angle, speed, size
      const a = radial ? rnd() * Math.PI * 2 : base + (rnd() - 0.5) * K.cone;
      const sp = K.spMin + rnd() * (K.spMax - K.spMin); // radial: a fraction of the radius, not px/tick
      const sz = (0.9 + rnd() * 0.9) * Math.min(1.6, 0.6 + 0.5 * B.scale);
      const d = radial ? B.r * sp * Math.min(1, p * 1.5) : sp * B.age * (1 - 0.5 * p); // decelerating spray
      ctx.fillStyle = i % 3 === 0 ? K.color2 : K.color;
      ctx.fillRect(B.x + Math.cos(a) * d - sz / 2, B.y + Math.sin(a) * d - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
  }
}

// The two control lines under the idle headline, as a pair. The first-run
// default screen — the card's own screen, standing in until (or unless) its
// bitmap arrives — speaks the card's mouse-only contract and names no keys, so
// the text stand-in teaches exactly what the art would have. Every other
// screen keeps the copy that describes the mode it is actually in.
//
// ...including the THRUST RING lock. Exactly three of these lines claimed key
// thrust, and each of the three is now a pair: the unlocked wording, and the
// wording of the run that has not bought the ring yet. The fourth, "right
// held: mouse flies · keys aim", stays true either way — in that state the
// mouse is the thrust source and the ring is only aiming — so it is untouched.
function pauseLines() {
  if (guideEligible()) {
    return ["move the visible cursor to aim · click or hold left to fire",
            "hold right and move the mouse to fly · release to aim again"];
  }
  const ring = keyThrustUnlocked();
  if (lockedMode()) {
    // the roles, in the same shape mouse mode states them. The lock is how the
    // mode works, not how the game is played, so it is not in the copy; the
    // keys are absent for the reason the card screen's are — the ring is a
    // purchase, and this mode aims with the cursor either way
    return INVERT
      ? ["use the cursor to aim · click or hold left to fire",
         "right held: mouse flies · release to aim again · esc pauses"]
      : ["mouse motion flies · hold right to aim with the cursor",
         "right held: the cursor aims · left fires · esc pauses"];
  }
  if (mouseMode()) {
    return INVERT
      ? [ring ? "the visible cursor aims · keys thrust · hold right to swap"
              : "the visible cursor aims · hold right to swap · ring thrust: shop",
         "right held: mouse flies · keys aim · left fires · esc pauses"]
      : ["mouse motion flies · keys aim · hold right to swap",
         ring ? "right held: cursor aims · keys thrust · left fires · esc pauses"
              : "right held: cursor aims · left fires · esc pauses"];
  }
  return INVERT
    ? [ring ? "qweasdzxc keys fly the ship · the mouse aims · hold right to swap"
            : "the mouse aims · hold right to fly the ship · ring thrust: shop",
       "left fires · esc releases"]
    : ["mouse motion is thrust — a steady side push carves an arc",
       "hold right to aim — qweasdzxc snaps it · left fires · esc releases"];
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
  drawImpacts(); // world pass — under the camera, over the bullets that made them
  if (G.running) drawAim();
  // UI PASS — the letterbox transform without the camera
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  // one read of the card gate, so the map, the copy and the art cannot
  // disagree inside a single frame
  const guide = guideShown();
  // ...and the same read for the encounter's own overlay suppression. Two
  // things claim the screen: an opaque hover bitmap, whose rect swallows the
  // corner map's frame so the map would show as a sliced-off sliver rather
  // than as a map, and the shop screen itself, which paints a scrim over the
  // field and carries the wave, the hull and the wallet in its own header —
  // leaving the map and the status stack as duplicates over the top of it.
  // Both come back the moment the screen does.
  const ringUp = !!(window.Encounter && Encounter.hudSuppressed());
  if (MINIMAP && !guide && !ringUp) drawMinimap(); // the card screens keep one hierarchy — see guideShown()
  if (window.Encounter) Encounter.drawHud(ctx); // encounter HUD and overlays — screen space, no camera
  drawLockedCursor(); // the drawn pointer rides over every overlay it serves
  // the pause text, and the dev screen's claim on it: while the panel is open
  // it owns the screen, so none of this draws. render() reads UI.dev directly
  // rather than taking a flag, so every foreign caller — the resize listener,
  // the stardens/minimap/reseed repaints, setAimMode/setInvert and the
  // encounter's own R-restart repaint — inherits the suppression for free.
  if (!G.running && !UI.dev) {
    if (guide) {
      // the card already says LEFT CLICK TO START and states the whole
      // contract, so the headline and both copy lines stay off this screen
      ctx.drawImage(guideImg, GUIDE_X, GUIDE_Y, GUIDE_W, GUIDE_H);
    } else {
      const lines = pauseLines();
      ctx.textAlign = "center";
      ctx.font = "700 13px " + FONT;
      ctx.fillStyle = C.clay;
      ctx.fillText(G.started ? "CLICK TO CONTINUE" : mouseMode() ? "CLICK TO START" : "CLICK TO STEER", FW / 2, FH / 2 + 46);
      ctx.font = "400 10px " + FONT;
      ctx.fillStyle = C.dim;
      ctx.fillText(lines[0], FW / 2, FH / 2 + 64);
      ctx.fillText(lines[1], FW / 2, FH / 2 + 78);
      ctx.textAlign = "left";
    }
  }
  ctx.restore(); // drop the field clip
  if (window.Sfx) Sfx.frame(); // the draw path drives the engine hum, never step():
                               // five coalesced sim ticks cost one param write, and
                               // a suite's advance() never touches audio at all
}

// ---- loop control ----------------------------------------------------------
// The presentation-side drain of the simulation's event queue. The sim only
// QUEUES cues now — forwarding them here, after step() has returned, is what
// makes the audio path structurally unable to sit between two seeded rand()
// draws. One call per step(), never per rendered frame: a catch-up frame runs
// several ticks, and coalescing their cues into one burst would change what
// the player hears. It always empties the queue, Sfx or no Sfx — a page
// without audio must not bank events forever.
function drainCues() {
  if (!window.Encounter) return;
  for (const ev of Encounter.drainEvents()) {
    if (window.Sfx) Sfx.cue(ev.kind, ev.at, ev.gain);
  }
}
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
    drainCues(); // per step — see drainCues for why never per frame
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
  const wasMouseAim = cursorAim() && aiming();
  const wasLocked = lockedMode();
  AIMMODE = m === "push" ? "push" : m === "locked" ? "locked" : "mouse";
  G.rightHeld = false;
  if (lockedMode() && !wasLocked) seedLockedCursor(); // enter at the aim the player left
  syncCursor();
  if (wasMouseAim && (!cursorAim() || !aiming())) snapshotMouseAim();
  // This is mainly selected while paused, but keep programmatic/live mode
  // changes safe too: mouse mode must immediately give the pointer back.
  // Locked mode keeps any lock it holds — one acquisition per session is
  // the mode's whole point, and resume() is the only place that arms it.
  if (mouseMode() && locked() && typeof document.exitPointerLock === "function") document.exitPointerLock();
  syncAimUi();
  render();
}
function pause() {
  if (!G.running) return;
  G.running = false;
  // pausing always lands on the pause menu, never inside dev options. This sits
  // BELOW the early return on purpose: visibilitychange, pointerlockchange and
  // a late lock rejection all call pause() while already paused, and above the
  // guard each of them would slam an open dev panel shut behind the user.
  UI.dev = false;
  G.leftHeld = false; // a mouseup can vanish in the lock transition — never resume with a stuck button
  setRightHeld(false);
  // locked mode releases its held lock here too — pause is real UI, and the
  // resume click is the one gesture that re-arms it (one banner per resume)
  if ((mouseMode() || lockedMode()) && locked() && typeof document.exitPointerLock === "function") document.exitPointerLock();
  G.keys.clear(); // keyups can vanish the same way
  clearTickInput(); // a banked delta must never survive a pause and land on resume
  stopLoop();
  syncTuner();
  render();
}
// A lock request can fail (Chrome's ~1.3s post-Escape cooldown, automation,
// no API at all). Push mode cannot run without it, so only that caller pauses
// after both the raw and standard requests fail. Mouse mode asks for the
// standard lock directly: rejecting a raw request can consume the one user
// gesture its fallback needs, while standard lock still gives unbounded deltas.
// The open shop is a MOUSE UI: it asked for the native cursor, released any
// lock to get it, and must not be handed one back. Three flight-control paths
// would otherwise fight it — requestLock's callers (a resume over the frozen
// screen, a right-button release with INVERT off), and the two lock-loss
// handlers, which would read the release the shop itself performed as a lock
// loss and pause the shop behind the menu. Left in flight, that sequence ends
// with the player looking at a menu with no cursor to click it with. One
// predicate answers all three. It is deliberately the SHOP and not frozen():
// the death screen has no click targets, and its resume still re-arms the
// lock so an R-restart lands with working flight controls.
//
// It reads shopScreen() — the SCREEN — and not shopOpen(), which also demands
// the loop's flag. A paused shop is still the screen the resume lands back on,
// and the mouseup below has no running gate: with INVERT off, a right release
// over the pause menu reaches requestLock with a genuine user gesture, Chrome
// grants the lock, and resume() carries it into a mouse-only menu with no
// cursor, a frozen hover and every click landing on one field pixel.
const shopOwnsPointer = () => !!(window.Encounter && Encounter.shopScreen && Encounter.shopScreen());
function requestLock(pauseOnFailure = true, preferRaw = true) {
  // the locked-mode shop RUNS on the held lock — its resume must be allowed
  // to re-arm one over the shop screen; every other mode's shop refuses
  if (shopOwnsPointer() && !lockedMode()) return;
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
// The frozen shop is a MOUSE UI: it needs the native cursor back, whatever the
// flight controls were doing when the wave cleared. encounter.js calls these
// two from openShop/continueFromShop — the release is unconditional, and the
// restore re-arms exactly what resume() would arm for the current mode, so a
// player who cleared a wave mid-flight lands back in the same controls. Both
// are safe off a user gesture: the restore only ever runs from the click on
// NEXT WAVE, and a lock request that fails without one is caught by
// requestLock's own guard (pauseOnFailure stays off for mouse mode).
function overlayPointerRelease() {
  if (lockedMode()) return; // per-mode no-op: the locked-mode shop runs on the
                            // synthetic cursor under the HELD lock — zero
                            // releases, zero re-acquisitions, zero banners
  if (locked() && typeof document.exitPointerLock === "function") document.exitPointerLock();
  syncCursor();
}
function overlayPointerRestore() {
  if (lockedMode()) return; // ...and hands nothing back: the lock never left
  syncCursor();
  if (!G.running) return; // a paused page has no lock to re-arm and no gesture to
                          // arm it with — resume() is what puts the controls back
  if (!mouseMode()) requestLock();
  else if (!aiming()) requestLock(false, false);
}
function setRightHeld(held) {
  const wasMouseAim = cursorAim() && aiming();
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
// arrows must not nudge sliders mid-flight — either paused screen can hold
// the focus, and a clicked button keeps it until something takes it away
function blurPanels() {
  const a = document.activeElement;
  if (a && (pausemenu.contains(a) || devpanel.contains(a))) a.blur();
}
// The one way back into flight: a click on the field and the pause menu's
// resume button both land here, so the button behaves exactly like the click
// (a click is a user gesture, so the pointer-lock arming still works). The two
// branches keep their ORIGINAL, asymmetric statement order: the normal one
// asks for the lock while G.running is still false, so a synchronous failure
// reaches pause()'s !G.running early return and the game resumes unlocked,
// while the frozen one arms after flipping it. pause()'s guard makes that
// difference observable, so it is preserved rather than tidied.
function resume() {
  if (G.running) return; // a focused resume button re-fires on Space/Enter — never re-enter mid-flight
  if (window.Sfx) Sfx.unlock(); // the page's one entry gesture — ABOVE the frozen
                                // branch, so a death-screen resume arms audio too
  clearTickInput(); // the paused stretch banked nothing that may land now
  UI.dev = false; // whichever screen the gesture came from, the resume ends on the field
  if (window.Encounter && Encounter.frozen()) {
    // dead/shop overlays: the click resumes only the loop — combat stays
    // frozen, and the overlay's own input is the way on: R on the death
    // screen, the cards and the NEXT WAVE button in the shop.
    // Lock-dependent modes still re-arm their pointer lock here, so an
    // R-restart after this resume has working flight controls — but the SHOP
    // takes the opposite branch, because that screen needs the cursor.
    G.running = true;
    syncCursor();
    if (shopOwnsPointer()) {
      if (lockedMode()) {
        // the mid-shop pause released the mode's one lock; this resume click
        // is the gesture that re-arms it, and the synthetic cursor goes
        // straight back to the shop — the native pointer never enters here
        requestLock(true, false);
        Encounter.shopHover(lcur.x, lcur.y);
      } else {
        // REFUSING to arm one is not enough: a lock can already be held coming
        // in — the mouseup below grants one over the pause menu with INVERT off
        // — and it would ride into the shop, killing the cursor and freezing
        // clientX/clientY so the hover never moves again. Drop it, then re-seed
        // the hover: a paused shop takes no mousemove, so the pointer may have
        // travelled far from whatever card was lit when the pause began.
        overlayPointerRelease();
        if (Encounter.shopSeedHover) Encounter.shopSeedHover();
      }
    } else if (lockedMode()) requestLock(true, false); // the session's one (standard) lock
    else if (!mouseMode()) requestLock();
    else if (!aiming()) requestLock(false, false);
    blurPanels(); // the overlay keys live on document — nothing may be holding them
    syncTuner();
    startLoop();
    return;
  }
  if (!G.started) {
    G.started = true;
    G.vel = { x: 0, y: 0 }; // the session starts from rest
  }
  if (lockedMode()) requestLock(true, false); // the session's ONE acquisition — the
                        // standard lock (OS acceleration intact), held until pause
  else if (!mouseMode()) requestLock();
  else if (!aiming()) requestLock(false, false); // inverted-off starts in mouse-flight
  G.running = true;
  syncCursor();
  blurPanels();
  syncTuner();
  startLoop();
  if (!mouseMode() && aiming()) enterAim(); // inverted push mode opens at the existing fire direction
}
canvas.addEventListener("mousedown", (e) => {
  e.preventDefault();
  if (mouseMode()) trackMouse(e); // the start click establishes an aim point, but still never fires
  if (!G.running) {
    if (e.button !== 0) return; // only LEFT starts — a stray right press stays idle
    // the dev screen owns the field while it is open: a click backs out to the
    // pause menu instead of resuming. Guarded by the !G.running block it sits
    // in — __test exposes openDev(), and a stray true must never eat a shot.
    if (UI.dev) {
      closeDev();
      return;
    }
    resume();
    return; // the click that starts or resumes never fires
  }
  // The open shop owns EVERY click on the field, hit or miss. A frozen shop
  // keeps G.running true, so without this the branches below would re-arm a
  // pointer lock over a menu that needs the cursor, or run fire() (which the
  // freeze refuses anyway) instead of buying the card under the pointer.
  if (window.Encounter && Encounter.shopOpen()) {
    if (lockedMode()) { // clientX/Y freeze under the held lock — the synthetic
                        // cursor is the shop's pointer, clicks and all
      if (e.button === 0) Encounter.shopClick(lcur.x, lcur.y);
      return;
    }
    const p = pointerField(e.clientX, e.clientY);
    if (p && e.button === 0) Encounter.shopClick(p.x, p.y);
    return;
  }
  if (!mouseMode() && lockSupported && !locked()) {
    // steering lost mid-run — this click re-arms it, never fires. Locked mode
    // shares the branch but asks for its standard lock, never the raw one.
    if (e.button === 0) requestLock(true, !lockedMode());
    return;
  }
  if (e.button === 2) {
    const wasMouseFlight = mouseMode() && !aiming();
    setRightHeld(true);
    if (lockedMode()) {
      // the lock never cycles on the buttons in this mode — held since resume
    } else if (mouseMode()) {
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
    if (mouseMode()) { // locked mode skips this whole dance — its lock is held either way
      if (leavingMouseFlight && locked() && typeof document.exitPointerLock === "function") document.exitPointerLock();
      else if (!aiming()) requestLock(false, false); // inverted-off release returns to mouse-flight
    }
    if (G.running && !mouseMode() && !lockedMode() && aiming()) enterAim(); // inverted push mode
                        // re-enters its relative aim; locked keeps the drawn cursor
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
    } else if (!G.running && UI.dev) {
      e.preventDefault();
      closeDev(); // paused, escape backs out one screen — panel to pause menu
    }
    // the !G.running gate above is what keeps push mode's running Escape
    // falling through to the browser, whose lock exit is that mode's only pause
    return;
  }
  // the shop/death overlays own the keys: a frozen sim keeps G.running true,
  // so without this gate every ring press below would still enter G.keys and
  // rewrite the stored aim behind the overlay — and only pause() ever clears
  // the set, so a hand resting on the ring through a shop visit would lurch
  // the ship on continue. openShop() clears the set for the keys already
  // held; this return keeps new ones out for the whole visit.
  if (window.Encounter && Encounter.frozen()) return;
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
  // the shop's hover, ahead of everything and never instead of it: trackMouse
  // below must keep running so the aim the player left does not go stale over
  // a visit, and thrustImpulse already refuses to pump a frozen sim. The
  // shopOpen() gate is what keeps the layout read off the flight path.
  if (window.Encounter && Encounter.shopOpen()) {
    if (lockedMode()) {
      // clientX/clientY freeze under the held lock, so the shop's pointer is
      // the synthetic cursor — moved per event even in tick mode, because a
      // frozen sim has no tick to accumulate into (step() discards on freeze)
      moveLockedCursor(e.movementX, e.movementY);
      Encounter.shopHover(lcur.x, lcur.y);
      return;
    }
    const p = pointerField(e.clientX, e.clientY);
    if (p) Encounter.shopHover(p.x, p.y);
  }
  if (lockedMode()) { // never trackMouse here — the frozen client coordinates would poison the mirror
    if (!locked() || !G.running) return;
    if (aiming()) inputCursor(e.movementX, e.movementY); // deltas move the drawn cursor...
    else inputThrust(e.movementX, e.movementY);          // ...until the role swap flies the ship
    return;
  }
  if (mouseMode()) {
    if (!locked()) trackMouse(e); // locked deltas fly the ship; preserve the pre-lock cursor target for release
    if (locked() && G.running && !aiming()) inputThrust(e.movementX, e.movementY);
    return;
  }
  if (!locked() || !G.running) return;
  if (aiming()) inputAim(e.movementX, e.movementY);
  else inputThrust(e.movementX, e.movementY);
});
document.addEventListener("pointerlockchange", () => {
  if (!locked()) clearTickInput(); // the event stream just ended — nothing banked may land later
  if (lockedMode()) {
    // this mode holds its one lock for the whole running session: any loss —
    // ESC, focus theft, the shop screen included — is a pause, and the
    // resume click is what re-arms it
    if (!locked() && G.running) pause();
    return;
  }
  if (shopOwnsPointer()) return; // the shop dropped the lock on purpose — see shopOwnsPointer
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
  if (lockedMode()) { pause(); return; } // no lock, no mode — land on the menu; never
                                         // a retry loop against Chrome's re-lock cooldown
  if (shopOwnsPointer()) return; // ...and a request it refused is not a failure to pause over
  if (!mouseMode() || (G.running && !aiming())) pause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
window.addEventListener("resize", () => {
  resize();
  render(); // resetting canvas.width wipes the bitmap — repaint immediately, mid-run too
});

// Before the first start there is nothing to be paused FROM, and calling that
// screen "paused" is the one thing that reads wrong on it — so the root screen
// opens as ready / start and becomes paused / resume the moment G.started
// flips. The ids, the listeners and resume()'s semantics are untouched: it is
// the same button wearing the word that fits the moment. syncTuner() calls
// this because every transition that can put the menu on screen already goes
// through it, and the DOM is written only when the words really change.
function syncMenuWords() {
  const title = G.started ? "paused" : "ready";
  const action = G.started ? "resume" : "start";
  if (menutitle.textContent !== title) menutitle.textContent = title;
  if (resumebtn.textContent !== action) resumebtn.textContent = action;
}

// tuning controls — live on the pause/idle screen, where the mouse is free.
// One policy function, now governing BOTH paused screens: running hides them
// both, and while paused UI.dev picks which one is up. display:none is the
// hide, deliberately — it is what drops the controls out of the tab order and
// the accessibility tree during flight. Both elements are flex containers, so
// the inline "flex" written here matches what the stylesheet intends.
function syncTuner() {
  syncMenuWords(); // the menu's own words follow G.started — see above
  pausemenu.style.display = !G.running && !UI.dev ? "flex" : "none";
  devpanel.style.display = !G.running && UI.dev ? "flex" : "none";
  placeDevPanel(); // a panel that just appeared has never been measured
  showTuner(); // the audio readouts change without any input event — a
               // suspended context becomes running on the first click — so
               // every transition that can put a paused screen up refreshes
               // them; every other readout rewrites its identical string
}
// one visible tab section at a time, and one marked tab button
function syncDevTabs() {
  for (const s of devpanel.querySelectorAll(".tabsec")) s.hidden = s.dataset.tab !== UI.tab;
  for (const b of devpanel.querySelectorAll(".tab")) b.setAttribute("aria-pressed", String(b.dataset.tab === UI.tab));
}
function setDevTab(name) {
  if (!DEV_TABS.includes(name)) return; // __test can call this — an unknown name would hide every section
  UI.tab = name;
  if (name === "enemies") buildEnemyTab(); // __test can land here without openDev() — same lazy gate
  syncDevTabs();
  placeDevPanel(); // tabs differ in height — the new one re-hangs the panel
  devbody.scrollTop = 0; // a tab opens at its own top, never at the last one's offset
  render(); // every UI transition repaints — one rule, so no caller has to know what is on screen
}
function openDev() {
  UI.dev = true;
  buildEnemyTab(); // encounter.js loads after this file, so the tab can only exist by now
  syncTuner();
  render(); // the pause text goes away — the panel owns the screen now
}
function closeDev() {
  UI.dev = false; // UI.tab survives: reopening returns to the tab the user left on
  syncTuner();
  render();
}
function syncAimUi() {
  canvas.setAttribute("aria-label", lockedMode()
    ? "Ship playground — use the cursor to aim, hold right to fly with the mouse, left fires, Escape pauses"
    : mouseMode()
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
  out("inputmode-out", INPUTDESC[INPUTMODE]);
  out("inputlag-out", INPUTMODE === "tick"
    ? (INPUTLAG === 0 ? "no delay" : INPUTLAG + " ms · " + Math.round(INPUTLAG / TICK) + " ticks late")
    : "per-tick input only — an OS event has no tick to be late against");
  out("aimmode-out", AIMDESC[AIMMODE]);
  out("aimsens-out", AIMSENS.toFixed(2) + (mouseMode() ? " · push mode only" : " relative gain"));
  out("aimdist-out", AIMDIST + " px to " + (mouseMode() ? "triangle" : "target"));
  out("invert-out", "on = mouse aims; hold right to fly");
  out("cool-out", BCOOL + " ms · " + (1000 / BCOOL).toFixed(1) + " shots/s");
  out("bspeed-out", BSPEED.toFixed(1) + " px/tick · " + Math.round((1000 / TICK) * BSPEED) + " px/s");
  out("bfactor-out", BFACTOR.toFixed(2));
  out("bmax-out", String(BMAX));
  out("blife-out", BLIFE.toFixed(2) + " s");
  out("fxint-out", FXINT.toFixed(1) + "× burst intensity · 0 = off");
  out("fxdur-out", FXDUR.toFixed(2) + " s burst life");
  out("blastr-out", BLASTR + " px at rank 1");
  out("blastgain-out", "+" + BLASTGAIN + " px per rank · rank 3 = " + (BLASTR + 2 * BLASTGAIN) + " px");
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
  out("contactcd-out", CONTACTCD + " ticks · " + (CONTACTCD * TICK / 1000).toFixed(2) + " s between contact hits on one body");
  // the audio tab. Every control here carries a live readout — the mute
  // checkbox states a STATE, not a rule, so unlike autofire it earns a live
  // line — and the audition row's readout is Sfx.state()'s ready-made string:
  // audio.js formats its own internals, this file only prints them.
  out("sfxvol-out", Math.round(SFXVOL * 100) + "% master · gain " + (Math.pow(SFXVOL, 1.6) * 0.4).toFixed(3));
  out("sfxmute-out", SFXMUTE ? "muted — every cue is dropped" : "sound on");
  out("sfxshot-out", Math.round(SFXSHOT * 100) + "% · fire, wall ticks, hits, kills, the blast");
  out("sfxfoe-out", Math.round(SFXFOE * 100) + "% · enemy tells, spawns, damage taken");
  out("sfxui-out", Math.round(SFXUI * 100) + "% · pickups, waves, the shop");
  out("sfxeng-out", Math.round(SFXENG * 100) + "% engine hum · follows the flame");
  out("sfxtest-out", window.Sfx ? Sfx.state().line : "no audio module — the page is silent");
  showEnemyTuner(); // the generated tab rides every refresh path the authored readouts do
}
// The enemies tab is generated, not authored: encounter.js loads after this
// file, so Encounter.tuning does not exist at parse time and the rows can only
// be built on first open. The schema is consumed generically — no group or row
// name is known here — and each input id is enemy-<row.id> by contract.
const ENEMY_ROWS = []; // { row, out } pairs the builder fills; showEnemyTuner() rewrites them
function buildEnemyTab() {
  const body = document.getElementById("enemies-body");
  if (!body || body.childElementCount || !window.Encounter || !Encounter.tuning) return;
  for (const g of Encounter.tuning.groups) {
    const col = document.createElement("div"); // same .col/.row markup as the authored tabs
    col.className = "col";
    const head = document.createElement("div");
    head.className = "grouphead";
    head.textContent = g.label;
    col.appendChild(head);
    for (const row of g.rows) {
      const id = "enemy-" + row.id;
      const rowEl = document.createElement("div");
      rowEl.className = "row";
      const label = document.createElement("label");
      label.htmlFor = id;
      label.textContent = row.label;
      const input = document.createElement("input");
      input.id = id;
      input.type = "range";
      input.min = String(row.min);
      input.max = String(row.max);
      input.step = String(row.step);
      input.value = String(row.get());
      const out = document.createElement("output");
      out.id = id + "-out";
      out.setAttribute("for", id);
      input.addEventListener("input", () => {
        row.set(Number(input.value));
        Encounter.tuning.refresh(); // the live wave re-resolves in place
        showEnemyTuner(); // stats interact — every readout rewrites, not just this row's
      });
      rowEl.append(label, input, out);
      col.appendChild(rowEl);
      ENEMY_ROWS.push({ row, out });
    }
    body.appendChild(col);
  }
  showEnemyTuner();
}
// no-op until the tab is built — ENEMY_ROWS stays empty and showTuner() calls
// this on every refresh path, built or not
function showEnemyTuner() {
  for (const r of ENEMY_ROWS) r.out.textContent = r.row.fmt(r.row.get());
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
  locked: "one held lock · a drawn cursor aims",
};
const INPUTDESC = { // the A/B the human flies — see INPUTMODE
  event: "apply each OS mouse report — the shipped feel",
  tick: "sum reports, apply once per tick — rate-independent",
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
bind("inputmode", (v) => { setInputMode(v); }).value = INPUTMODE;
bind("inputlag", (v) => { INPUTLAG = v; }).value = String(INPUTLAG);
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
bind("fxint", (v) => { FXINT = v; }).value = String(FXINT);
bind("fxdur", (v) => { FXDUR = v; }).value = String(FXDUR);
bind("blastr", (v) => { BLASTR = v; }).value = String(BLASTR);
bind("blastgain", (v) => { BLASTGAIN = v; }).value = String(BLASTGAIN);
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
bind("edgearrows", (v) => { EDGEARROWS = v; render(); }).checked = EDGEARROWS;
bind("contactcd", (v) => { CONTACTCD = v; }).value = String(CONTACTCD);
// The audio tab's own gesture. This panel is only reachable while the game is
// paused, which is exactly when the game is silent — so without this every
// slider here would be a deaf knob you tune by reading numbers. One helper
// serves all seven controls: it auditions the whole mix (test hits all four
// buses and bumps the engine), and it unlocks on the way, because a real drag
// or click on these controls is a user gesture — the only one the page has
// besides the start click. cue("test") carries a 350 ms gap of its own, so
// sweeping a slider ticks about three times a second, not once per input event.
function audition() { if (window.Sfx) { Sfx.unlock(); Sfx.cue("test"); } }
bind("sfxvol", (v) => { SFXVOL = v; audition(); }).value = String(SFXVOL);
bind("sfxmute", (v) => { SFXMUTE = v; audition(); }).checked = SFXMUTE;
bind("sfxshot", (v) => { SFXSHOT = v; audition(); }).value = String(SFXSHOT);
bind("sfxfoe", (v) => { SFXFOE = v; audition(); }).value = String(SFXFOE);
bind("sfxui", (v) => { SFXUI = v; audition(); }).value = String(SFXUI);
bind("sfxeng", (v) => { SFXENG = v; audition(); }).value = String(SFXENG);
document.getElementById("sfxtest").addEventListener("click", audition); // "click", like reseed
document.getElementById("reseed").addEventListener("click", () => {
  SEED = (Math.random() * 0x100000000) >>> 0;
  render(); // a whole new sky, same ship
});
// the screen buttons, all on "click" like reseed: click keeps Enter/Space
// activation working and only fires when the press and the release share a
// target, so a button revealed under a held-down cursor cannot self-activate
document.getElementById("devbtn").addEventListener("click", openDev);
document.getElementById("devback").addEventListener("click", closeDev);
resumebtn.addEventListener("click", resume);
// Fullscreen exists for the pointer-lock banner: mouse mode re-acquires the
// lock on every right press, and Firefox posts its takeover warning on each
// acquisition unless the document is already fullscreen. It targets
// documentElement, never the canvas — the pause menu and dev panel are HTML
// siblings of the canvas and must stay visible inside fullscreen.
const fsbtn = document.getElementById("fsbtn");
if (typeof document.documentElement.requestFullscreen === "function") {
  fsbtn.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {}); // a denied request just leaves the window as it was
  });
  document.addEventListener("fullscreenchange", () => {
    fsbtn.textContent = document.fullscreenElement ? "windowed" : "fullscreen";
  });
} else fsbtn.remove();
for (const b of devpanel.querySelectorAll(".tab")) {
  b.addEventListener("click", () => setDevTab(b.dataset.tab));
}
syncAimUi();
syncCursor();
syncInputLagUi(); // the lag slider opens matching the input mode's ability to honor it
showTuner();
syncDevTabs(); // the markup already ships the four inactive sections hidden — this keeps them honest

// ---- test hook -----------------------------------------------------------
// headless smoke checks drive the sim through this; normal play never does.
// updateCamera lets a check settle the camera with the ship pinned in place;
// the set* helpers and camState reach the tunables that live in closure
// lets, and gate exposes the lookahead commit-gate state.
window.__test = { G, cam, step, setCamMode, render, WW, WH, FW, FH,
  updateCamera, leadVec, aiming, fireDir, mouseAimDir, cursorHidden, gate, setAimMode, setRightHeld, setInvert,
  // the paused screens: the state, the transitions, and a visibility snapshot.
  // getComputedStyle, never offsetParent — both screens are position:fixed, so
  // offsetParent is null even when they are plainly on screen.
  ui: { UI, openDev, closeDev, setDevTab, resume, syncMenu: syncMenuWords,
    view: () => ({
      menu: getComputedStyle(pausemenu).display !== "none",
      panel: getComputedStyle(devpanel).display !== "none",
      dev: UI.dev,
      tab: UI.tab,
      running: G.running,
      sections: [...devpanel.querySelectorAll(".tabsec")].map((s) => ({ tab: s.dataset.tab, shown: getComputedStyle(s).display !== "none" })),
    }) },
  setMouseClient: (x, y) => { G.mouse.x = x; G.mouse.y = y; G.mouse.seen = true; },
  setLeadSrc: (v) => { LEADSRC = v; },
  setLeadDz: (v) => { LEADDZ = v; },
  setEdgeMargin: (v) => { EDGEMARGIN = v; },
  setCamLead: (v) => { CAMLEAD = v; },
  setAimLead: (v) => { AIMLEAD = v; },
  setVmax: (v) => { VMAX = v; },
  setContactCd: (v) => { CONTACTCD = v; }, // the contact-cadence checks drive the slider's whole range, floor included
  // the impact-fx system: the live burst list, the two entry points the
  // encounter calls, and the slider reach the checks need
  fx, spawnImpactFx, resetImpactFx,
  fxState: () => ({ FXINT, FXDUR, bursts: fx.bursts.length, count: fx.count }),
  setFxInt: (v) => { FXINT = v; },
  setFxDur: (v) => { FXDUR = v; },
  // the corner map: its toggle, its live geometry, and field→backing-store
  // pixels so the contact-dot checks can probe real pixels instead of
  // hardcoding 76/93/8 or guessing the letterbox transform
  setMinimap: (v) => { MINIMAP = !!v; },
  minimapInfo: () => ({ W: MM_W, H: MM_H, M: MM_M, on: MINIMAP }),
  fieldToCanvas: (fx, fy) => ({ x: ox + fx * scale, y: oy + fy * scale }),
  // the edge arrows: their toggle, so the determinism check can force the
  // draw branch on however a human left the checkbox
  setEdgeArrows: (v) => { EDGEARROWS = !!v; },
  edgeArrowsOn: () => EDGEARROWS,
  // the first-run card: the gate and the load flag as two separate answers —
  // a check can assert the eligibility rules on a page whose PNG is still in
  // flight — plus the rect the UI pass draws, so nothing has to hardcode it
  guideState: () => ({ eligible: guideEligible(), ready: guideReady, shown: guideShown(),
    x: GUIDE_X, y: GUIDE_Y, w: GUIDE_W, h: GUIDE_H, src: GUIDE_SRC }),
  // ...and a writer for the load flag alone. It is the one half of the card's
  // contract a check cannot otherwise reach: the bytes have long arrived by
  // the time a suite runs, so the pre-load screen has to be driven on purpose.
  // Returns the flag it replaced, so the caller can put it back.
  setGuideReady: (v) => { const was = guideReady; guideReady = !!v; return was; },
  // the THRUST RING hover art: this file owns only the asset and its load
  // flag now — encounter.js owns the rect, and hands it out as
  // enc.shopPopupRect(i). The writer is the one half of the contract a check
  // cannot otherwise reach: the bytes have long arrived by the time a suite
  // runs, so the pre-load screen has to be driven on purpose.
  ringCardState: () => ({ ready: ringReady, ratio: RING_RATIO, src: RING_SRC }),
  setRingReady: (v) => { const was = ringReady; ringReady = !!v; return was; },
  // the UI-space pointer conversion the shop's hit test runs on, and its
  // inverse — so a check can dispatch a REAL mousedown at a known field point
  // (a card's center, the NEXT WAVE button) instead of guessing at pixels, and
  // exercise the whole path from the native event down to the sale
  pointerField,
  fieldToClient, // hoisted to a real function — the locked cursor's mirror shares it
  shopOwnsPointer,   // the shop's claim on the pointer — the lock guard's own predicate
  keyThrustUnlocked, // the ring's thrust gate, read exactly as step() reads it
  pauseLines, // the copy the idle screen would print — the card's text stand-in included
  aimState: () => ({ AIMMODE, mouse: { ...G.mouse }, direction: fireDir(), aiming: aiming(), rightHeld: G.rightHeld, cursorHidden: cursorHidden(), locked: locked() }),
  camState: () => ({ CAMMODE, CAMEASE, CAMBOX, CAMLEAD, LEADSRC, AIMLEAD, LEADBLEND, LEADDZ, EDGEMARGIN }) };

// ---- refactor instrument: state hash, input record/replay ------------------
// An instrument, not a feature: everything below is reachable only through
// window.__test, and nothing in the game calls it. The golden-trace suite is
// the consumer — it pins committed magnitudes against these hashes so a
// refactor that reproduces every mechanism but moves a number still fails.
//
// The hash is FLOAT-EXACT: every number folds through its raw IEEE-754 bits,
// never through a rounded string, because the drift a reordered floating-point
// expression produces is sub-ULP and a String(n) hash waves it through.
const HB = new DataView(new ArrayBuffer(8)); // one shared bit-view — no per-call allocation
function fnv() {
  let h = 0x811c9dc5; // FNV-1a, folded a byte at a time
  const u32 = (u) => {
    for (let s = 24; s >= 0; s -= 8) {
      h ^= (u >>> s) & 0xff;
      h = Math.imul(h, 0x01000193);
    }
  };
  const num = (n) => { HB.setFloat64(0, n); u32(HB.getUint32(0)); u32(HB.getUint32(4)); };
  const str = (s) => { u32(s.length); for (let i = 0; i < s.length; i++) u32(s.charCodeAt(i)); };
  // one dispatcher for the allow-list walks: numbers by bits, booleans and
  // strings by their own folds — an unexpected type folds as its name so a
  // list mistake surfaces as a stable wrong hash, never as a throw mid-suite
  const val = (v) => {
    if (typeof v === "number") num(v);
    else if (typeof v === "boolean") u32(v ? 1 : 0);
    else if (typeof v === "string") str(v);
    else str(String(v));
  };
  return { u32, num, str, val, hex: () => (h >>> 0).toString(16).padStart(8, "0") };
}
// The allow-list contract: a field belongs in the hash iff it describes what
// the simulation will do next. Labels and presentation hints (a missile's
// trail, the flame's drawn length) stay out; so does every Math.random()
// consumer — the starfield SEED and the flame flicker are cosmetic and
// outside simulation state. The lists are declared, never enumerated with
// Object.keys, so a later phase adding a field to these objects cannot
// silently re-key every committed fixture — admitting a field is its own
// reviewable decision. b.r, b.dmg and b.owner are IN: the encounter's sweep
// reads all three (the inflated hit circle, the damage paid, the side test).
const BULLET_HASH = ["x", "y", "px", "py", "vx", "vy", "r", "dmg", "owner", "ttl", "dead", "spent"];
function hashShip() {
  const h = fnv();
  h.num(G.ship.x); h.num(G.ship.y);
  h.num(G.vel.x); h.num(G.vel.y);
  h.num(G.aimOff.x); h.num(G.aimOff.y);
  h.num(G.aimAngle); h.u32(G.aimed ? 1 : 0);
  h.num(G.cool);
  h.num(G.thrustAcc.x); h.num(G.thrustAcc.y);
  h.num(G.flame.x); h.num(G.flame.y);
  return h;
}
function hashBullets() {
  const h = fnv();
  h.u32(G.bullets.length);
  // live array order — the encounter's first-along-the-path arbitration walks
  // this order, so the order itself is simulation state. Never sort.
  for (const b of G.bullets) for (const f of BULLET_HASH) h.val(b[f]);
  return h;
}
function hashCam() {
  const h = fnv();
  h.num(cam.x); h.num(cam.y);
  h.num(cam.fromX); h.num(cam.fromY); h.num(cam.toX); h.num(cam.toY); h.num(cam.t);
  // the lookahead commit gate decides where the camera goes next, and the
  // camera rectangle is what rollAnchor deals spawns against — sim state
  h.num(gate.x); h.num(gate.y); h.num(gate.cx); h.num(gate.cy);
  h.num(gate.timer); h.u32(gate.seeded ? 1 : 0);
  return h;
}
function hashParts() {
  const enc = window.__test.enc;
  const parts = {
    ship: hashShip().hex(),
    bullets: hashBullets().hex(),
    cam: hashCam().hex(),
    encounter: "00000000", // a page without encounter.js still hashes its flight
    rng: "00000000",
  };
  if (enc && enc.hashInto) {
    const eh = fnv();
    enc.hashInto(eh);
    parts.encounter = eh.hex();
    const rh = fnv();
    rh.u32(enc.rngState());
    parts.rng = rh.hex();
  }
  return parts;
}
// one hash over everything, and the per-subsystem split beside it — a failing
// trace reports WHICH part moved instead of only that something did
function hashState() {
  const p = hashParts();
  const h = fnv();
  h.str(p.ship); h.str(p.bullets); h.str(p.cam); h.str(p.encounter); h.str(p.rng);
  return h.hex();
}

// The recorder captures the RAW event stream — deltas, buttons, arrival tick —
// because a trace of positions alone is circular: it would replay results, not
// input. Its own listener registers AFTER the flight listener above, so the
// production path is untouched and capture still sees the same event object
// and the same pre-step simTick. Off, it costs exactly one boolean test.
const inputCap = { on: false, t0: 0, events: [] };
document.addEventListener("mousemove", (e) => {
  if (!inputCap.on) return;
  inputCap.events.push({ t: performance.now() - inputCap.t0,
    dx: e.movementX, dy: e.movementY, buttons: e.buttons, tick: simTick });
});
function recordInput() {
  inputCap.events = [];
  inputCap.t0 = performance.now();
  inputCap.on = true;
}
function stopInput() {
  inputCap.on = false;
  return inputCap.events;
}
// Replay delivers each event through the SAME entry point a real mouse uses —
// a dispatched mousemove on document — and advances the sim between events by
// each entry's tick, so the event/tick interleaving reproduces exactly. The
// flight listener's thrust branch demands a pointer lock, which headless
// automation is never granted, so the replay shadows the document's own
// accessor for its duration: locked() then answers as it did at record time,
// while every gate and every impulse still runs the production path.
function replayInput(script, opts) {
  if (!script || !script.length) return;
  const shimLock = !opts || opts.locked !== false;
  if (shimLock) Object.defineProperty(document, "pointerLockElement", { value: canvas, configurable: true });
  try {
    const base = script[0].tick;
    const start = simTick;
    for (const ev of script) {
      const target = start + (ev.tick - base);
      while (simTick < target) { step(); drainCues(); } // drained per step, like the frame loop
      const e = new MouseEvent("mousemove", { bubbles: true, buttons: ev.buttons || 0, clientX: 0, clientY: 0 });
      // MouseEventInit's movement fields are not settable cross-browser — the
      // own-property shadow is, and the listener reads through it untouched
      Object.defineProperty(e, "movementX", { value: ev.dx });
      Object.defineProperty(e, "movementY", { value: ev.dy });
      document.dispatchEvent(e);
    }
  } finally {
    if (shimLock) delete document.pointerLockElement;
  }
}
Object.assign(window.__test, {
  hashState, hashParts,
  simTick: () => simTick,
  recordInput, stopInput, replayInput,
  // the flight constants beside enc.tunables() — the fixture records both, so
  // a future failure is diagnosable as "the constants moved" vs "the code moved"
  flightTunables: () => ({ VMAX, ACCEL, TURN, FLICK, DAMP, KEYTHRUST, WALLLOSS }),
  // the phase-3 input path: the A/B toggle, the lag slider, the accumulator's
  // live state, and the locked-mode cursor — all input state, none of it hashed
  setInputMode,
  setInputLag: (v) => { INPUTLAG = v; syncInputLagUi(); },
  setFlick: (v) => { FLICK = v; }, // the measurement harness's reach — FLICK has no slider
  inputState: () => ({ INPUTMODE, INPUTLAG, acc: { ...inAcc }, buffered: lagBuf.length }),
  lockedCursor: () => ({ ...lcur }),
  setLockedCursor: (x, y) => {
    lcur.x = Math.max(0, Math.min(FW, x));
    lcur.y = Math.max(0, Math.min(FH, y));
    mirrorLockedCursor();
  },
});

resize();
render();
syncTuner();
