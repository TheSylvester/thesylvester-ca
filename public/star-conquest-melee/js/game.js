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
let AIMSENS = 0.03;     // push-mode aim gain — offset px per count. Code-only, like BMODE: push mode
                        // left the aim-control menu once locked mode covered it, so its one knob left
                        // the panel with it. The mode itself still runs — see AIMDESC
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
                         // and the along/across split re-reads the ship's vel per call.
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
// ---- comet mode ----------------------------------------------------------
// Right-hold is COMET MODE now (the Androsynth comet): while a seat's comet
// flag is up the ship answers the stick much harder, tops out much faster,
// shrugs off ALL incoming damage and damages anything it touches. The flag
// itself lives on the per-seat player struct (makePlayer) and is fed through
// the input ring's `rh` field — see bankTickInput/drainTickInput — never read
// off the DOM inside step(). The comet is no longer free: it SPENDS from the
// seat's ENERGY pool below, through that pool's own API and nothing else —
// the COMET* numbers here say what it costs and what it does, the EN* numbers
// say what the pool is. That split is the whole point: the next skill prices
// itself the same way without touching a line of this block.
let COMETACC = 3;       // comet accel multiplier — scales ACCEL in thrustImpulse while comet is on (slider, comet tab)
let COMETTURN = 3;      // comet turn multiplier — the same, for TURN (slider, comet tab)
let COMETVMAX = 3;      // comet top-speed factor — the radial clamp becomes (VMAX + mods.speed) × this (slider, comet tab)
let COMETDMG = 3;       // comet contact damage — encounter.js reads it the way it reads BDMG: a
                        // comet-mode touch costs the body this instead of one bullet (slider, comet tab)
let COMETDRAIN = 1;     // pool spent per tick the comet is up (slider, comet tab)
let COMETHIT = 0;       // pool spent per COMET EVENT — a ram that bills COMETDMG, or an
                        // incoming hit the comet negates. 0 SHIPS IT OFF: the knob is
                        // present and inert, so the comet is priced by TIME today and can
                        // be priced by WORK with one slider drag (slider, comet tab)
let COMETTHR = 0;       // thrust-scaled drain: this much extra pool per unit of thrust applied
                        // on the tick, so a coasting comet is cheap and a hard-burning one is
                        // not. 0 SHIPS IT OFF — flat drain is the default model (slider, comet tab)
let COMETAOE = 11;      // px the drawn comet halo stands CLEAR OF THE HULL at a full pool —
                        // the pool's in-world readout. The whole clearance scales with the
                        // pool, so an empty one collapses the glow onto the ship's own
                        // radius: there is no floor holding a ring around a spent comet,
                        // which is what made the readout lie at the bottom of its range.
                        // 11 is the old 5 px floor plus the old 6 px of growth, so a FULL
                        // pool draws the exact radius it always did. Render only
                        // (slider, comet tab)
let COMETAOEDMG = 0;    // px the comet's DAMAGE reach grows at a full pool, on top of body
                        // contact. 0 SHIPS IT OFF and the comet stays a pure body ram, exactly
                        // as it is today; above 0 the halo becomes real and the sweep widens
                        // with the pool (slider, comet tab)
let COMETFURY = 0.5;    // OVERLOAD, per rank: the extra fraction of COMETDMG a ram deals at an
                        // EMPTY pool, falling linearly to nothing at a full one. The shop row
                        // is what arms it; at rank 0 this changes nothing (slider, comet tab)
let COMETCD = 62;       // ticks before one body can take a COMET touch again — the comet's own
                        // pacing, split off CONTACTCD so the bite rate that prices COMETHIT and
                        // pays OVERLOAD can move without touching what a NORMAL ram costs. It
                        // ships at CONTACTCD's own default, so day one is byte-identical; the
                        // two are DELIBERATELY uncoupled — a CONTACTCD retune must not drag this
                        // with it. encounter.js reads it, the way it reads CONTACTCD and
                        // COMETDMG (slider, comet tab)
// ---- the PvP knob (phase 14) ---------------------------------------------
let PVPORBS = 3;        // XP orbs a seat drops at the point it DIED. The name is phase 14's
                        // and the rule outgrew it: the drop used to fire for a player's kill
                        // alone, and it now fires for every death, because every death zeroes
                        // the seat's score and ranks and the orbs are what the run paid out.
                        // They are STANDARD 1-XP orbs, so any living seat may bank them — a
                        // killer, a bystander, and the victim itself once it re-enters, which
                        // is a corpse run: respawnSeat deals the seat off-screen from its own
                        // wreck, so 3 XP against a whole run is not a refund. encounter.js
                        // reads this the way it reads COMETDMG; enemy drops stay e.orbDrop
                        // (slider, comet tab)
let PVPREWIND = 140;    // ms of PLAYER-target rewind a lag-compensated shot may claim
                        // (phase 15). Converted to ticks (floor(ms / 16.67)) at the one
                        // consumer, encounter.js's rebate — 140 → 8 ticks. It caps only
                        // how far back another PLAYER's pose may be read; PvE bodies use
                        // the ring's full depth (a constant, not a tunable). 0 turns
                        // player compensation off — the row-8 control run's switch. The
                        // slider is net-locked: in a net session only the dev ui:"tune"
                        // route moves the server's value (slider, combat tab)
// ---- the ENERGY pool -----------------------------------------------------
// A GENERAL per-seat resource, not the comet's private fuel. Comet mode is
// only its first consumer; a later skill spends from the same pool by calling
// energySpend(seat, n) and knowing nothing else about it. The live level lives
// on the player struct (makePlayer) because the gate runs inside step() — a
// pool read through window.Encounter every tick would make the sim depend on
// the encounter, and a page with no encounter at all still has to have skills.
// The CAPACITY and REGEN terms come from the shop through Encounter.mods,
// exactly as AFTERBURNER feeds mods.speed into the top-speed clamp.
let ENMAX = 100;    // the pool's BASE capacity, before the shop's ENERGY CELL rank — in
                    // COMETDRAIN units, so the shipped defaults read as 1.7 seconds of held
                    // comet (slider, energy tab)
let ENREGEN = 0.2;  // pool restored per tick once the recharge delay has run out — 12 per
                    // second, so a spent pool takes over 8 s to come back full (slider,
                    // energy tab)
let ENDELAY = 25;   // ticks after the LAST spend before the pool regenerates at all — 0.42
                    // seconds, so a released comet does not silently refill mid-strafe
                    // (slider, energy tab)
let ENARM = 0.5;    // the RE-ARM FLOOR, as a fraction of the live cap: a comet may not START
                    // below it. A running comet ignores it and burns to zero — see
                    // energyStep's derived arm rule (slider, energy tab)
let ENORB = 0;      // pool restored per salvage orb collected. 0 SHIPS IT OFF — the option
                    // exists, the default does not use it (slider, energy tab)
let ENCELL = 0.4;   // ENERGY CELL, per rank: the shop row adds this fraction of ENMAX to the
                    // cap. Re-derived from the RANK, never compounded, so moving the ENMAX
                    // slider mid-run rescales every rank honestly (slider, energy tab)
let ENRECH = 0.25;  // RECHARGER, per rank: the same deal for ENREGEN (slider, energy tab)
// ---- audio ---------------------------------------------------------------
// js/audio.js reads every one of these LIVE at cue time and every frame — the
// same deal encounter.js has with BDMG and CONTACTCD: that module owns the
// synthesis, this file owns the numbers, and a page without js/audio.js still
// has a complete, harmless audio tab whose sliders drive nothing (the master
// readout prints the layer's own gain when audio.js is loaded, "—" when it is not).
let SFXVOL = 0.65;   // master, 0..1 — audio.js applies SFXVOL^1.6 × MASTER_TRIM (0.5 today, one copy, in js/audio.js), the ancestor's own curve
let SFXMUTE = false; // the hard switch: a muted page allocates no voices at all, it does not gain them to zero
let SFXSHOT = 1;     // bus trim — fire, wall ticks, hits, kills, the blast splash
let SFXFOE = 1;      // bus trim — lance and lunge tells, spawns, damage taken, death
let SFXUI = 1;       // bus trim — orb pickups, wave alarms and banners, the shop
let SFXENG = 1;      // engine hum trim — the hum tracks G.flame, so this trims what the flame sounds like; 0 is off
// SFXLOOK, ms: every cue envelope is anchored this far AHEAD of ac.currentTime.
// Firefox's clock is a main-thread snapshot that does not advance inside a
// task, and its timeline does not re-anchor a past event to the render head —
// so a cue authored mid-frame loses its head: measured −8 dB on 73 % of fire
// cues at 0, clean at 15. Chrome needs none and pays the 20 ms. No slider —
// the console is the A/B surface (type SFXLOOK = 0 and listen); audio.js clamps
// the read to [0, 1000] ms (its LOOK_MAX), so a typo costs at most a second of
// lead, not a silent page.
let SFXLOOK = 20;
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
const DEV_TABS = ["flight", "aim", "weapons", "camera", "world", "combat", "comet", "energy", "audio", "enemies"];

// One player's flight state — the eight fields the simulation integrates,
// carried out of G so the multiplayer commits can add seats to this array
// without changing the shape. No site ever replaces a player wholesale
// (enc.restart resets fields in place and deliberately keeps aim state), so
// a reference taken into a closure stays live for the seat's whole life.
function makePlayer(id) {
  return {
    id, // seat identity — never hashed: hashShip and the checkpoint snapshots predate it
    ship: { x: WW / 2, y: WH / 2 },
    vel: { x: 0, y: 0 },
    aimAngle: 0,
    aimOff: { x: 0, y: 0 }, // relative/snap state — its direction is the stored aim
    aimed: false, // stored aim history; false until first aim, so bullets initially follow the heading
    cool: 0, // ticks until the next shot is allowed
    comet: false, // right-hold's sim-visible ACTIVE half — HASHED. The button states a
                  // WANT (input.cometWant below); energyStep is the only site in the sim
                  // that turns a want into this flag, so a seat with an empty pool holds
                  // the button and gets nothing. On a net client the wire writes it
                  // directly (js/net.js) — there is no sim there to run the gate.
    energy: ENMAX,   // the seat's ENERGY pool — HASHED. A general resource: comet mode is
                     // its first consumer (energyStep below), and a later skill spends
                     // from it through energySpend() and nothing else. Seeded at the BASE
                     // max: makePlayer runs before any encounter exists, so it may not
                     // consult the shop's capacity mod.
    enIdle: 0,       // ticks left before the pool may regenerate again — HASHED, it decides
                     // what the next tick does. Every spend re-arms it to ENDELAY, so a
                     // burst of spending pushes the recharge back.
    energyMax: ENMAX, // the seat's live cap — NOT hashed. It is a pure function of hashed
                     // state (the shop rank) and unhashed tunables (the ENMAX slider), the
                     // same standing `vcap` has; it is a FIELD rather than a call because a
                     // net client never derives it — the wire hands it down (js/net.js),
                     // and the halo and the HUD bar read this one place on both paths.
    thrustAcc: { x: 0, y: 0 }, // acceleration applied since the last tick — feeds the flame
    flame: { x: 0, y: 0 }, // smoothed thrust the engine flame renders
    input: { // the seat's whole input transport — never hashed (input state, not simulation state)
      acc: { tx: 0, ty: 0, ax: 0, ay: 0, fp: 0, n: 0 }, // per-tick raw-delta accumulator
      ring: [], // the lag ring: one banked record per tick, drained by step()
      lcur: { x: FW / 2, y: FH / 2 }, // locked-mode view cursor (field coordinates)
      scur: { x: WW / 2, y: WH / 2 }, // the sim's delayed aim point (WORLD coordinates)
      fireHeld: false, // the drained held-fire bit autofire reads
      fireDelta: 0, // ticks of lag rebate the seat's NEXT shot may claim — the frozen
                    // latch drainSlice recomputes at every drained vt-bearing frame
                    // (phase 15). On frameless ticks it is NOT re-aged: a silent
                    // client's autofire keeps the Δ its last real frame earned —
                    // deliberate UNDER-compensation on staleness, the safe direction.
                    // Input transport, NEVER hashed, exactly like fireHeld above.
      claimPress: 0, // THIS TICK's fire edge, latched for the encounter's claim
                     // gate — 1 while a press has been drained (or dispatched, in
                     // event mode) and not yet spent. Input transport, NEVER
                     // hashed, exactly like fireHeld: it is a copy of the `fp`
                     // that already rides every frame, kept where encStep can read
                     // it AFTER the drain, so a downed seat's click needs no new
                     // wire field and no new frame key. Cleared once per tick at
                     // the END of step(), so a press survives exactly the tick it
                     // was made on — see clearClaimPress.
      cometWant: false, // the raw held right-button bit off the ring — input transport
                        // state, NEVER hashed, exactly like fireHeld beside it. The GATE
                        // (energyStep) is what turns this into the seat's real, hashed
                        // `comet` flag; a seat with an empty pool wants the comet and does
                        // not get it.
    },
  };
}
const players = [makePlayer(0)];
// The seat-count control — the ONLY site that grows or shrinks players[].
// New seats are appended with makePlayer (fresh banks, centre spawn — the
// encounter's restart deals real per-seat spawn points); shrinking truncates.
// Existing seats are NEVER replaced wholesale, so every closure-held
// reference (in0, audio's players[0]) stays live. Bounds 1..8: seat 0 always
// exists (the DOM boundary is physically seat 0), 8 is a sanity lid, not a
// design number.
function setPlayerCount(n) {
  const count = Math.max(1, Math.min(8, Math.floor(+n) || 1));
  while (players.length < count) players.push(makePlayer(players.length));
  if (players.length > count) players.length = count;
  return players.length;
}
// a seat is alive unless the encounter says its hull is gone — a page
// without the encounter has no death at all, so every seat reads alive
const seatAlive = (s) => !window.Encounter || Encounter.seatAlive(s);
// A bullet's owning seat. fire() stamps a seat id; the suites' synthetic
// bullets still say "player", which reads as seat 0 — the legacy alias keeps
// hundreds of committed scenario inputs meaningful. Anything else is no
// player's bullet at all (-1) and the encounter sweep ignores it.
const bulletSeat = (b) => (typeof b.owner === "number" ? b.owner : b.owner === "player" ? 0 : -1);
// A seat's comet state, as encounter.js reads it through the shared global
// scope (hitPlayer's negation, contactEvent's ram damage) — the same crossing
// BDMG and CONTACTCD already make. Null-safe: a mis-addressed seat is simply
// not in comet mode, never a TypeError.
const cometActive = (s) => !!(players[s] && players[s].comet);
// ---- the LOCAL seat -------------------------------------------------------
// THE one accessor every LOCAL-VIEW read passes through: the camera, the aim
// marker, the flame, the minimap dot, the HUD column, the shop panel and the
// death card all present THIS seat. Local play is always seat 0; in net mode
// the server grants a seat and js/net.js answers with it, so a client flying
// seat 1 watches seat 1's ship with seat 1's hull, wallet and ranks.
//
// A spectator (no seat granted) reads 0 — the cheapest honest view, and the
// same one a seat whose grant has not arrived yet gets for the one frame it
// waits. Out-of-range answers fold to 0 rather than throw. That fold is a
// VIEW convenience and it destroys a fact; seatless() below is that fact, kept.
//
// SIMULATION reads are NOT view reads: the ring drain, the integrate loops
// and every per-seat sweep take an explicit seat id and must never call this.
// The headless host installs no window.Net, so the server always resolves 0
// and the sim's behavior is byte-identical with this accessor in place.
//
// THE one range test both halves run. Deriving it twice is exactly how the
// fold and the guard drift apart, and that drift is the whole bug class: a
// grant this client cannot fly — out of range, or absent entirely — is not a
// seat, and the two must never disagree about which is which. null means NO
// SEAT. Local play and the headless host answer 0 because there seat 0 really
// is this player's own seat rather than a fallback: nobody else could hold it.
function grantedSeat() {
  const N = window.Net;
  if (!(N && N.active && N.active() && N.seat)) return 0;
  const s = N.seat();
  // the bound is the ROOM's seat range, not the last snapshot's player list.
  // Those differ for real: the server grants a seat on the `you`, and the first
  // snapshot carrying that seat can arrive a tick later — or in a room started
  // at one player, never widen at all. Bounding against players.length there
  // answered null for a seat this client genuinely owns, and the client drew
  // "spectating" over it. maxSeats is -1 before the first `you`, and absent
  // entirely on the offline stub, so both fall back to the old bound — offline
  // and solo behavior is unchanged.
  const cap = N.maxSeats && N.maxSeats() > 0 ? N.maxSeats() : players.length;
  return Number.isInteger(s) && s >= 0 && s < cap ? s : null;
}
function localSeat() {
  const s = grantedSeat();
  return s === null ? 0 : s;
}
// ...and the half of localSeat() the fold destroys: WHETHER it answered. Every
// view read wants a record and gets one — the camera has to follow something,
// and a spectator watching seat 0 is honest. A CARD is not a view: it is a
// statement about the READER's own seat, and 0 is the same answer for the pilot
// flying seat 0 and for a screen that holds nothing at all. Drawn off the
// fallback, a card tells a stranger their ship is down and counts a respawn
// they cannot take. So the question is published rather than re-derived at each
// card — js/encounter.js asks it ONCE, ahead of the whole overlay chain, and
// every card below inherits the guard whether or not its author knew it existed.
const seatless = () => grantedSeat() === null;
// the local seat's player record, never undefined: an unseated view falls
// back to seat 0, which always exists (see setPlayerCount)
const localPlayer = () => players[localSeat()] || players[0];
// ---- the net-mode PRESENTATION accessor -----------------------------------
// The seat's pool and cooldown AS THE SCREEN SHOULD SHOW THEM: in net mode
// the LOCAL seat answers with the own-ship predictor's values (js/net.js —
// the wire stays the state of record on the player struct; this is
// presentation only), every other seat and every other mode answers straight
// off the struct. The HUD energy bar and the comet halo's SIZE read THIS, so
// the local pilot's cues answer the stick instead of the round trip. Local
// play and the headless host fall through byte-identically.
// The record used to carry a `comet` flag too, plus a lab lever
// (COMETHALOWIRE, phase-13 candidate D) that could point that flag at the
// wire — both retired by the integration round: since the windup lane, the
// halo's comet STATE comes from cometView, whose CONFIRMED phase is the wire
// flag by construction, so the shipped halo already is candidate D's halo
// with a windup in front of it. Nothing read the field any more, and a lab
// round that pulled the lever would have measured a no-op and believed it.
function presentedPool(s) {
  const N = window.Net;
  if (N && N.active && N.active() && N.predicted && s === localSeat()) {
    const k = N.predicted();
    if (k) return { en: k.energy, enMax: k.energyMax, cool: k.cool };
  }
  const P = players[s];
  return P ? { en: P.energy, enMax: P.energyMax, cool: P.cool }
           : { en: 0, enMax: 0, cool: 0 };
}
// ---- the COMET PRESENTATION owner ----------------------------------------
// ONE record per seat answering ONE question: what comet state should this
// seat's screen be in — nothing, ASKING, or CONFIRMED? Four consumers used to
// answer it four times off presentedPool(seat).comet alone (the flat halo
// here, the light layer's bloom and wake in js/fx.js, and the HUD energy bar
// in js/encounter.js), and two of them carried their own copy of the halo's
// size. They all read this now, so they cannot disagree about how big the
// burn is or whether the server has agreed to it yet.
//
// WHY the two states are separate. For the local seat in net mode the
// PREDICTOR arms its own comet flag about four ticks before the wire
// confirms it (presentedPool used to hand that flag out; only the predicted
// pool survives there now). The old halo drew that prediction as truth, so
// a pilot watched a solid burn while the server had not yet started negating
// damage — and every "I took damage in comet" report the lab round chased was
// that skew, not a hole in the gate (the gate is airtight: the negation in
// js/encounter.js returns before any hit is registered). The windup shows the
// ASK as an ask, and the flash marks the moment the wire says yes.
//
// Render-side by construction: nothing here is read by the sim, nothing here
// is hashed, and the clock is a TICK COUNTER advanced once per PLAYED tick
// from capturePresent() — a net client plays ticks without ever stepping the
// sim, which is the whole reason cometClock exists beside simTick. No wall
// clock of any kind is read here, so two
// render() calls inside one tick still paint identical bytes (the law at
// HULL_SEED below).
const CP_OFF = 0, CP_WIND = 1, CP_LIVE = 2;
const COMET_WIND_TICKS = 6;  // ticks the flare takes to reach full extension —
                             // 100 ms at the 60 Hz sim clock, which is the
                             // shortest flare an eye reliably reads as motion
const COMET_FLASH_TICKS = 7; // ...and the confirm flash's decay, ~117 ms: long
                             // enough to register, short enough that it cannot
                             // be mistaken for the burn itself
const COMET_WIND_HOLD = 30;  // the RELEASE WINDOW — half a second. A press the
                             // pool cannot pay for is never confirmed and the
                             // button may stay down forever, so a windup with
                             // no confirm inside this retracts and does not
                             // flare again until the button lifts. Well clear
                             // of the worst lag budget this repo measures
                             // (~250 ms unplayable), so a slow round trip
                             // retracts nothing a fast one would have shown.
const COMET_PRES = [];       // seat -> { phase, t, spent }
const CP_NONE = { phase: CP_OFF, t: 0, spent: false }; // the shared answer for a
                             // seat with no record — never written, never
                             // allocated per call
// The seat's presentation record, GUARDED: pre-start a granted seat id can
// exceed players.length - 1, and every consumer here is a draw path that must
// answer rather than throw.
function cometPres(s) { return COMET_PRES[s] || CP_NONE; }
// The ASK — the local pilot's held right button, straight off the ONE input
// record the DOM listener writes (in0 is players[0].input, a seat-0-ONLY
// producer; see setRightHeld for why the write is not seat-aware). It is
// mode-independent by construction: in net mode js/net.js's predictor arms off
// this same bit on the same clientTick, so this IS the predicted press edge by
// another name, and in solo it is the only edge there is. A REMOTE seat has no
// ask on this screen at all — its halo pops straight to confirmed, which is
// the whole truth a spectator has.
//
// SOLO POPS TOO, and that is not an oversight. `conf` is tested before `want`
// below, and in solo energyStep() settles players[0].comet inside the very
// step that read the want — so the machine reaches CP_LIVE on the first tick
// and a solo press books as a pop, never as a windup. The windup is a
// NET-MODE cue by construction: it exists to show the four-tick gap between a
// prediction and its confirmation, and solo has no such gap. A solo flare
// would be a fake 100 ms of "asking" drawn over an ask the sim had already
// answered — a decision about feel, not about honesty, and one for the owner
// rather than for this lane. The single solo case that DOES flare is a
// refused press, where nothing ever confirms and the retract is the truth.
// THE MACHINE CLOCK. The instrument below stamps its episodes with this, and
// simTick cannot serve: simTick increments only in step(), which a net client
// never runs (frameBody calls Net.clientTick() instead), so a simTick stamp
// froze over the wire and every lead read 0 — in the ONE mode the lead
// numbers exist for. This counts cometPresTick() calls, and capturePresent()
// makes exactly one per played tick in BOTH modes, so a stamp taken here
// advances once per comet-machine tick whichever loop is driving. No wall
// clock, no rand — the render-side law above holds.
let cometClock = 0;
// One tick of the machine. Called from capturePresent(), the ONE per-tick
// render-side capture point, so the seat's comet flag has already settled.
function cometPresTick() {
  cometClock++;
  const ask = !!players[0].input.cometWant;
  // GRANTED, not localSeat(): localSeat() folds a seatless client to 0, and a
  // spectator still holding right-click — an AFK-unseated or refresh-forfeited
  // pilot — would drive seat 0's windup ring, its afterburner wind and the
  // instrument for a ship this screen does not fly. A view may fall back to
  // seat 0; an ASK is a statement about the reader's own seat (the seatless()
  // rule above), so with no grant there is no want. The conf path below stays
  // per-seat: remote confirmed halos still render for a spectator.
  const me = grantedSeat();
  for (const P of players) {
    const s = P.id;
    let r = COMET_PRES[s];
    if (!r) r = COMET_PRES[s] = { phase: CP_OFF, t: 0, spent: false };
    const conf = !!P.comet;   // the WIRE flag on a net client, the sim's own
                              // flag in solo — the authority either way
    const want = me !== null && s === me && ask;
    if (conf) {
      if (r.phase !== CP_LIVE) { r.phase = CP_LIVE; r.t = 0; noteCometConfirm(s); }
      else r.t++;
    } else if (want) {
      if (r.phase === CP_LIVE) {
        // the burn ended under a held button — a dry pool, a death, a wipe.
        // `spent` is what stops the very next tick from flaring again while
        // the pool trickles back up under the same press.
        r.phase = CP_OFF; r.t = 0; r.spent = true;
      } else if (r.phase === CP_WIND) {
        r.t++;
        if (r.t >= COMET_WIND_HOLD) { r.phase = CP_OFF; r.t = 0; r.spent = true; noteCometRetract(s); }
      } else if (!r.spent) { r.phase = CP_WIND; r.t = 0; noteCometAsk(s); }
    } else {
      r.phase = CP_OFF; r.t = 0; r.spent = false; // the button is up: the next press may flare
    }
  }
}
// The one derivation of what a comet-state seat draws. `pool` is the caller's
// own presentedPool() read where it already has one, so a draw pass pays for
// that accessor once.
//   phase — CP_OFF / CP_WIND / CP_LIVE
//   f     — the presented pool fraction, 0..1
//   r     — the HALO RADIUS: SHIP_R + COMETAOE * f, the arithmetic
//           tests/wave1-checks.js section 15 pins, unchanged and now shared
//   wind  — the windup's extension, 0..1; 0 unless the phase is CP_WIND
//   flash — the confirm flash, 1 on the tick the wire agreed and decaying to
//           0 across COMET_FLASH_TICKS; 0 unless the phase is CP_LIVE
function cometView(s, pool) {
  const r = cometPres(s);
  const p = pool || presentedPool(s);
  const f = p.enMax > 0 ? Math.max(0, Math.min(1, p.en / p.enMax)) : 0;
  return { phase: r.phase, f, r: SHIP_R + COMETAOE * f,
    wind: r.phase === CP_WIND ? Math.min(1, (r.t + 1) / COMET_WIND_TICKS) : 0,
    flash: r.phase === CP_LIVE ? Math.max(0, 1 - r.t / COMET_FLASH_TICKS) : 0 };
}
// ---- the comet INSTRUMENT -------------------------------------------------
// The page's own answer to "how far did the ask lead the confirm, and did
// anything hurt me in between?". Monotone counters plus a small ring of
// finished episodes, all preallocated: this is written from the per-tick
// machine above and from the two cue drains, both hot paths, and it allocates
// nothing after load. It writes no sim state and reads no wall clock — every
// stamp is a comet-machine tick (cometClock above), which advances once per
// played tick in both modes.
//
// THE LEAD NUMBERS ARE NET-MODE NUMBERS. leadMin, leadMax, leadSum and the
// ring's `lead` all measure ask→confirm, and solo has no gap to measure: the
// machine above pops straight to CP_LIVE there, so a solo session books every
// episode as a pop and leaves the three lead fields at their empty defaults
// forever. A reading taken in solo is not a small number, it is no number —
// which matters, because these are the figures the comet-arm rebate decision
// is meant to be made on. Take them over the wire.
const CLOG_N = 16;
const COMET_LOG = {
  asks: 0,        // windups armed
  confirms: 0,    // ...that the authority agreed to
  retracts: 0,    // ...and that timed out unanswered (a refused press)
  pops: 0,        // the LOCAL seat's confirms with no windup in front of them:
                  // solo's same-tick answer (energyStep settles the flag inside
                  // the step that read the want, so no windup ever arms — see
                  // "SOLO POPS TOO" above), or a burn the button never asked
                  // for. Never a remote seat: noteCometConfirm returns for any
                  // seat but the local granted one before this can count
  hurtWind: 0,    // hurt/death cues landing INSIDE a windup: the honest count
                  // of the perceptual gap this lane exists to close
  hurtLive: 0,    // ...and inside a CONFIRMED burn — read off the SETTLED
                  // comet flag at drain time (see noteCometCue). In solo that
                  // is exactly the flag the server's countHurtWhileComet
                  // counts; over the wire it is the applied snapshot's flag,
                  // and only a cue from that same snapshot's tick may claim
                  // it (a mismatched drain books hurtSkew below). This one is
                  // a SIM DEFECT if it ever moves: the negation returns before
                  // the cue is emitted, so a hurt cue cannot coexist with a
                  // live comet
  hurtSkew: 0,    // hurt/death cues that drained with a live flag but a tick
                  // the applied snapshot does not vouch for — net mode's jump
                  // and starvation branches drain a WINDOW of ticks against
                  // ONE applied flag (js/net.js fireEvents). Never a defect
                  // claim; the recorder keeps the volume so a skewed run is
                  // visible instead of silently dropped
  leadMin: -1, leadMax: -1, leadSum: 0, // ask→confirm lead, in ticks
  n: 0,           // ring writes, monotone — entry j back is [(n-1-j) % CLOG_N]
  ring: [],
};
for (let i = 0; i < CLOG_N; i++) COMET_LOG.ring.push({ ask: -1, conf: -1, lead: -1, hurt: 0 });
let clogOpen = -1;   // the machine tick (cometClock) the open episode's windup armed, or -1
let clogHurt = 0;    // hurt cues seen inside it
function clogClose(conf, lead) {
  const e = COMET_LOG.ring[COMET_LOG.n % CLOG_N];
  e.ask = clogOpen; e.conf = conf; e.lead = lead; e.hurt = clogHurt;
  COMET_LOG.n++;
  clogOpen = -1;
  clogHurt = 0;
}
// Every gate below is grantedSeat(), never localSeat(): the instrument is the
// local pilot's own story, and a seatless client has no story to book — the
// fold to 0 would record seat 0's episodes off a screen that merely watches
// them. grantedSeat() answers null there, an integer seat never equals null,
// and every note returns before it counts.
function noteCometAsk(s) {
  if (s !== grantedSeat()) return;
  COMET_LOG.asks++;
  clogOpen = cometClock;
  clogHurt = 0;
}
function noteCometConfirm(s) {
  if (s !== grantedSeat()) return;
  if (clogOpen < 0) { COMET_LOG.pops++; return; }
  const lead = cometClock - clogOpen;
  COMET_LOG.confirms++;
  COMET_LOG.leadSum += lead;
  if (COMET_LOG.leadMin < 0 || lead < COMET_LOG.leadMin) COMET_LOG.leadMin = lead;
  if (lead > COMET_LOG.leadMax) COMET_LOG.leadMax = lead;
  clogClose(cometClock, lead);
}
function noteCometRetract(s) {
  if (s !== grantedSeat()) return;
  COMET_LOG.retracts++;
  clogClose(-1, -1);
}
// The cue drains' half — js/game.js's drainCues() in solo and js/net.js's
// fireEvents() in net mode, because a net client's local sim never steps and
// only the second of those runs there. `hurtWind` is the measurement this lane
// wanted; `hurtLive` is the tripwire the server counter mirrors.
function noteCometCue(kind, seat, tickMatched = true) {
  if ((kind !== "hurt" && kind !== "death") || seat !== grantedSeat()) return;
  // hurtLive reads the SETTLED comet flag, never the machine's phase — a
  // deliberate, stated choice, the Sfx.frame() kind. Both drains run AFTER
  // the tick's flag has settled (solo: step() precedes drainCues() in
  // frameBody; net: present() applies the snapshot before fireEvents()),
  // while cometPres still holds the PREVIOUS tick's phase until
  // capturePresent() advances it. On a dry-pool-same-tick hit — energyStep
  // clears the flag inside the step whose hit pass then lands a real cue —
  // the stale phase still reads CP_LIVE and would book a phantom defect the
  // server's countHurtWhileComet (a settled-flag read) never counts.
  // hurtWind stays on the phase: CP_WIND is presentation-only, and no sim
  // flag exists for it.
  //
  // tickMatched is the wire's honesty bit. Net mode's jump and starvation
  // branches drain EVERY event with tick <= pt in one fireEvents call, all
  // against the single flag apply() wrote from ONE snapshot — so a hurt from
  // before a comet arm inside that window would land on a flag that is not
  // its own tick's and book a phantom defect. A mismatched drain books
  // hurtSkew instead of the tripwire: the choice is to KEEP the count
  // visible rather than drop it, so a skew-heavy run reads as skew-heavy.
  // Solo drains are tick-matched by construction and pass no flag.
  if (cometActive(seat)) {
    if (tickMatched) COMET_LOG.hurtLive++;
    else COMET_LOG.hurtSkew++;
  } else if (cometPres(seat).phase === CP_WIND) { COMET_LOG.hurtWind++; clogHurt++; }
}
// ---- the FLIGHT KERNEL ----------------------------------------------------
// The per-seat FLIGHT slice of the sim, extracted whole: the aim and thrust
// impulses, the energy pool's arithmetic, and the per-seat BODY of each of
// step()'s three flight passes (drain, energy, integrate). Nothing here knows
// what a seat id is, what `players` is, what the encounter is, or what a
// camera is — a slice touches ONLY the kernel state K it is handed, the ctx
// the caller derived, and the effect sink fx.
//
// K is the kernel-state subset of a player record:
//   ship{x,y} vel{x,y} aimAngle aimOff{x,y} aimed cool comet
//   energy energyMax enIdle thrustAcc{x,y} flame{x,y}
//   input{ scur{x,y}, fireHeld, cometWant }
// Tonight every call operates IN PLACE on the real player object — K IS P, so
// this refactor moves code and changes nothing. The point of the boundary is
// that phase 11b can hand the same slices a DETACHED K and replay a seat.
//
// ctx carries what the kernel may not derive for itself:
//   alive     — seatAlive(s), read ONCE per pass by the caller, as today
//   terms     — Encounter.termsFor(seat); the kernel derives NOTHING from ranks
//   keyThrust — the key-thrust gate as a FUNCTION, so its per-frame
//               evaluation count stays exactly what drainTickInput had
// fx is the effect sink: fx.thud(x, y, gain) is the only flight effect, and
// fx.fire() is the caller's own fire() — bullets, ids and the bullet cap all
// stay outside the kernel, so the drain slice asks rather than fires.
//
// TUNABLES: the slices read the module-level flight globals (ACCEL, TURN,
// FLICK, DAMP, VMAX, WALLLOSS, COMET*, EN*) directly, exactly as the code did
// before the extraction — the sliders and the dev tune path keep working with
// no new plumbing, and a live drag still lands on the very next tick. They are
// deliberately NOT copied into ctx: that would have been a second source of
// truth to keep in sync, and byte-identity is this phase's whole product. 11b
// gets its "tunables locked to file defaults" seam at the module level (one
// place to pin) rather than per call.
const Flight = {
  // ---- impulses ----------------------------------------------------------
  // each delta is an impulse, split against the current heading: the ALONG
  // component (speed up / brake) uses ACCEL, the ACROSS component (curve)
  // uses TURN — so top-speed build-up and turn agility tune independently.
  // The flick term still amplifies fast deltas.
  thrust(K, dx, dy) {
    // comet mode multiplies both gains — an exact ×1 when the flag is down, so
    // the non-comet arithmetic stays byte-identical to the pre-comet build
    const ka = K.comet ? COMETACC : 1;
    const kt = K.comet ? COMETTURN : 1;
    const flick = 1 + Math.hypot(dx, dy) * FLICK;
    const s = Math.hypot(K.vel.x, K.vel.y);
    let dvx, dvy;
    if (s < 0.05) { // at rest there is no heading — all input builds speed
      dvx = dx * ACCEL * ka * flick;
      dvy = dy * ACCEL * ka * flick;
    } else {
      const ux = K.vel.x / s;
      const uy = K.vel.y / s;
      const along = dx * ux + dy * uy;
      const ax = along * ux;
      const ay = along * uy;
      dvx = (ax * ACCEL * ka + (dx - ax) * TURN * kt) * flick;
      dvy = (ay * ACCEL * ka + (dy - ay) * TURN * kt) * flick;
    }
    K.vel.x += dvx;
    K.vel.y += dvy;
    K.thrustAcc.x += dvx;
    K.thrustAcc.y += dvy;
  },
  // the aim counterpart: deltas push a clamped offset vector around the ship;
  // its direction is the aim
  aim(K, dx, dy) {
    K.aimOff.x += dx * AIMSENS;
    K.aimOff.y += dy * AIMSENS;
    const m = Math.hypot(K.aimOff.x, K.aimOff.y);
    if (m > AIM_R) {
      K.aimOff.x *= AIM_R / m;
      K.aimOff.y *= AIM_R / m;
    }
    if (m > 0.5) { // direction is meaningless while the offset sits near center
      K.aimAngle = Math.atan2(K.aimOff.y, K.aimOff.x);
      K.aimed = true;
    }
  },
  // ---- the ENERGY pool's arithmetic --------------------------------------
  // Seat-free twins of the pool API below; the named energyCap/energySpend/...
  // functions are thin, seat-indexed, null-safe wrappers over these. The
  // arithmetic lives here because a detached replay has to price a comet
  // exactly the way the sim did.
  cap(terms) { return ENMAX * (1 + ENCELL * (terms ? terms.enCell : 0)); },
  frac(K) {
    const cap = K.energyMax || 0;
    return cap > 0 ? Math.max(0, Math.min(1, K.energy / cap)) : 0;
  },
  spend(K, n) {
    if (!(n > 0) || K.energy < n) return false;
    K.energy -= n;
    K.enIdle = ENDELAY; // every real spend pushes the recharge back out
    return true;
  },
  gain(K, n) {
    if (!(n > 0)) return;
    K.energy = Math.min(K.energyMax, K.energy + n);
  },
  fill(K, terms) {
    K.energyMax = Flight.cap(terms);
    K.energy = K.energyMax;
    K.enIdle = 0;
  },
  // ---- pass A: the per-seat INPUT-DRAIN body ------------------------------
  // `frames` is the ≤2 records the caller already lifted off the seat's ring —
  // the ring, the lag delay and the at-most-two policy are transport, and they
  // stay in drainTickInput. This applies the fields, in order, one frame at a
  // time, and asks fx.fire() at the exact point the old body called fire(s):
  // between one frame's impulses and the next frame's cursor write, so a
  // catch-up tick's first bullet still leaves on the velocity and the aim that
  // frame produced.
  drainSlice(K, frames, ctx, fx) {
    const b = K.input;
    let lastRh = -1; // -1 = nothing drained this tick — the flag then persists,
                     // exactly the held-input semantics fireHeld keeps
    for (let k = 0; k < frames.length; k++) {
      const a = frames[k];
      b.scur.x = a.cx;
      b.scur.y = a.cy;
      // the phase-15 lag-rebate latch, recomputed at EVERY drained frame (the
      // cometWant precedent below): a vt-bearing frame earns its shot the
      // clamped tick delta between the sim's now and the client's presented
      // view tick; a frame without one earns nothing. fire() reads the latch,
      // which is what gives the frameless autofire path (game.js's held-fire
      // loop) the same rebate the fp edge gets.
      b.fireDelta = Number.isInteger(a.vt) ? Math.max(0, Math.min(21, simTick - a.vt)) : 0;
      // the claim latch, ABOVE the liveness gate and OR'd rather than assigned:
      // a corpse's press is the whole point (it is how a downed seat asks to be
      // dealt back), and a catch-up tick that drains two frames must not let the
      // second frame's silence erase the first frame's click
      if (a.fp) b.claimPress = 1;
      // a dead seat's frames still land (the cursor and the held bit) but
      // apply no impulse and fire nothing — the corpse takes no input
      if (ctx.alive) {
        if (a.ax || a.ay) Flight.aim(K, a.ax, a.ay);
        if (a.tx || a.ty) Flight.thrust(K, a.tx, a.ty);
        if ((a.kx || a.ky) && ctx.keyThrust()) Flight.thrust(K, a.kx * KEYTHRUST, a.ky * KEYTHRUST);
        if (a.fp) fx.fire();
      }
      b.fireHeld = a.fh;
      lastRh = a.rh ? 1 : 0;
    }
    // AFTER the entries applied: the seat's comet WANT takes the LAST drained
    // frame's rh — so a catch-up tick lands on the newest button state, and a
    // tick with no frame leaves the want exactly where it was. The want is not
    // the flag: the energy slice is what decides whether the pool can pay.
    if (lastRh >= 0) b.cometWant = lastRh === 1;
  },
  // ---- pass B: the per-seat ENERGY body -----------------------------------
  // The one place a comet WANT becomes a comet. The input layer only ever
  // states what the button is doing (input.cometWant); this decides whether
  // the seat's pool can pay for it. It is the ONLY writer of K.comet inside
  // the sim: a client that gated its own button would fly a free comet.
  energySlice(K, ctx) {
    // the SEAT's own RECHARGER rank sets its regen — off ctx.terms, so one
    // seat's purchase can never speed another's recharge
    const m = ctx.terms;
    const regen = ENREGEN * (1 + ENRECH * (m ? m.enRech : 0));
    K.energyMax = Flight.cap(m); // the mirror first: everything below clamps against it
    if (!ctx.alive) {
      K.comet = false; // a corpse spends nothing and rams nothing...
    } else {
      // the DERIVED arm rule, with no latch field to keep in sync: a RUNNING
      // comet holds until the pool is dry, a NEW one may only start at or above
      // the floor. The `K.energy > 0` term inside `armed` is what stops an ENARM
      // of 0 from letting a bone-dry pool re-arm every single tick forever.
      const want = K.input.cometWant;
      const armed = K.energy > 0 && K.energy >= K.energyMax * ENARM;
      K.comet = want && (K.comet ? K.energy > 0 : armed);
    }
    if (K.comet) {
      // flat time price plus the optional thrust-scaled term, so a coasting
      // comet can be cheap and a hard-burning one expensive; at the shipped
      // COMETTHR of 0 the burn is exactly COMETDRAIN
      const burn = COMETDRAIN + COMETTHR * Math.hypot(K.thrustAcc.x, K.thrustAcc.y);
      if (burn > 0 && !Flight.spend(K, burn)) { // the last partial tick: take what is
        K.energy = 0;       // left rather than refuse the whole burn, and re-arm the
        K.enIdle = ENDELAY; // delay anyway — the comet cuts out on the next tick
      }
    } else if (K.enIdle > 0) K.enIdle--; // ...and a downed seat quietly recharges: the
    else Flight.gain(K, regen);          // kinder rule, and respawnSeat fills it anyway
    // last, because a SHRINKING cap (a restart drops the shop ranks) must never
    // leave a seat parked over its own ceiling
    K.energy = Math.max(0, Math.min(K.energyMax, K.energy));
  },
  // ---- pass C: the per-seat INTEGRATE body --------------------------------
  // Deliberately does NOT read ctx.alive: a corpse damps, clamps, bounces,
  // thuds, and its cooldown still counts down. That is the shipped behavior.
  integrateSlice(K, ctx, fx) {
    // the AFTERBURNER upgrade adds px/tick ON TOP of the slider — off the
    // seat's OWN terms, so one seat's purchase never raises another's cap. The
    // clamp is the only place the two meet, so the VMAX tuner value itself
    // never moves and a restart (which resets the ranks) hands the slider back
    // untouched.
    const vcap = VMAX + (ctx.terms ? ctx.terms.speed : 0);
    const keep = WALLLOSS - 1; // negated: flip and damp in one multiply
    // velocity integrated the input impulses via Flight.thrust; here it
    // decays (DAMP) and clamps *radially* — excess speed is discarded, never
    // banked, so there is no dead zone and no reel-back when you turn
    K.vel.x *= DAMP;
    K.vel.y *= DAMP;
    // comet mode buys top speed AT THE CLAMP, exactly as AFTERBURNER does —
    // off the seat's own hashed flag, never off client state
    const cap = K.comet ? vcap * COMETVMAX : vcap;
    const s = Math.hypot(K.vel.x, K.vel.y);
    if (s > cap) {
      K.vel.x *= cap / s;
      K.vel.y *= cap / s;
    }
    // walls reflect the ship: position mirrors about the margin, and the
    // flipped velocity component keeps 1−WALLLOSS — restitution on that axis
    // only, so grazing bounces lose little and head-on ones lose the most
    K.ship.x += K.vel.x;
    K.ship.y += K.vel.y;
    let wallHit = 0; // the flipped component's pre-bounce speed — it rides out as the thud event's gain, nothing else reads it
    if (K.ship.x < SHIP_R) { K.ship.x = SHIP_R * 2 - K.ship.x; wallHit = Math.abs(K.vel.x); K.vel.x *= keep; }
    else if (K.ship.x > WW - SHIP_R) { K.ship.x = (WW - SHIP_R) * 2 - K.ship.x; wallHit = Math.abs(K.vel.x); K.vel.x *= keep; }
    if (K.ship.y < SHIP_R) { K.ship.y = SHIP_R * 2 - K.ship.y; wallHit = Math.max(wallHit, Math.abs(K.vel.y)); K.vel.y *= keep; }
    else if (K.ship.y > WH - SHIP_R) { K.ship.y = (WH - SHIP_R) * 2 - K.ship.y; wallHit = Math.max(wallHit, Math.abs(K.vel.y)); K.vel.y *= keep; }
    // the Math.max above is what makes a corner bounce ONE event instead of
    // two; the magnitude rides through as the thud's volume, so a graze
    // whispers and a full-speed slam lands. Handed to the effect sink, which
    // in the sim queues it on the encounter's event stream.
    if (wallHit > 0) fx.thud(K.ship.x, K.ship.y, Math.min(1, wallHit / 4));
    // no camera here: the view follows in the frame loop, after step() returns —
    // the simulation runs the same with no camera at all
    K.flame.x += (K.thrustAcc.x - K.flame.x) * FLAME_EASE;
    K.flame.y += (K.thrustAcc.y - K.flame.y) * FLAME_EASE;
    K.thrustAcc.x = K.thrustAcc.y = 0;
    if (K.cool > 0) K.cool--;
  },
};
window.Flight = Flight; // the vm sandbox and the page both reach it here; a
                        // classic script's top-level const is not a window
                        // property, and phase 11b's predictor needs the name
// The in-place wiring's two caller-owned adapters, allocated ONCE: the passes
// run every tick for every seat, and a per-seat object literal per pass would
// be pure garbage. Neither is re-entrant and neither needs to be — a slice
// call returns before the next one starts.
const FLIGHT_CTX = { alive: true, terms: null, keyThrust: null };
const FLIGHT_FX = {
  seat: 0,
  thud(x, y, gain) {
    // queued through the encounter's event stream — the crossing that runs
    // game → encounter, which is why Encounter.emit is published at all
    if (window.Encounter) Encounter.emit("thud", { x, y }, gain, this.seat);
  },
  fire() { fire(this.seat); }, // bullets, ids and the cap are the caller's
};
const FLIGHT_FRAMES = []; // the drain's scratch list, reused per seat
// THE frames-per-tick lid — ONE constant for the three places that must
// agree or the predictor drifts: the sim drain below, the server's inbound
// admission clamp (server/server.js reads it off the __test surface), and
// the phase-11 replay grouping (js/net.js reads it through the shared
// scope). Value unchanged from the two unlinked literals it replaces.
const FRAMES_PER_TICK = 2;
// ---- the ENERGY pool's API ------------------------------------------------
// Declared here, beside cometActive, so encounter.js reads them through the
// same shared script scope it already reads COMETDMG, players and cometActive
// through. Every one is null-safe on a bad seat and never a TypeError, for
// cometActive's reason: a mis-addressed seat is an empty pool, not a crash.
//
// The CAPACITY and REGEN terms come off the shop through the seat's OWN
// ranks — Encounter.termsFor(seat), the one derivation — read LAZILY and
// permissively: a page with no encounter still has a full, working pool at
// the slider's base numbers, exactly the contract keyThrustUnlocked() keeps.
const termsOf = (s) => (window.Encounter && Encounter.termsFor ? Encounter.termsFor(s) : null);
// the seat's live cap: the base slider plus the seat's ENERGY CELL rank's
// fraction of it. Re-derived from the RANK every time, never compounded, so
// dragging ENMAX mid-run rescales every rank the player bought instead of
// stranding them.
const energyCap = (s) => {
  if (!players[s]) return 0;
  return Flight.cap(termsOf(s));
};
// 0..1 — the pool as a fraction of the cap. The halo, the HUD bar and OVERLOAD
// all read THIS and never the raw pool: a number against a moving ceiling is
// the only one that means anything on screen or in a damage curve.
const energyFrac = (s) => {
  const P = players[s];
  if (!P) return 0;
  return Flight.frac(P);
};
// Spend n if the seat can afford it; returns whether it paid. THE SEAM future
// skills use — a skill prices itself and calls this, and learns nothing else
// about the pool. A spend of 0 (or less) is a NO-OP, enIdle included: the
// shipped COMETHIT = 0 must not be able to suppress the recharge by "paying"
// nothing on every hit.
const energySpend = (s, n) => {
  const P = players[s];
  if (!P) return false;
  return Flight.spend(P, n);
};
// add n, clamped to the cap. Deliberately does NOT touch enIdle: a refill is
// not a spend, so an orb landing mid-burn cannot buy back the recharge delay.
const energyGain = (s, n) => {
  const P = players[s];
  if (!P) return;
  Flight.gain(P, n);
};
// top the seat to its cap and clear the delay — respawn, restart and an ENERGY
// CELL purchase all deal a FULL pool, because a seat that re-enters (or buys
// capacity) on an empty one has bought nothing it can use.
const energyFill = (s) => {
  const P = players[s];
  if (!P) return;
  Flight.fill(P, termsOf(s));
};
// Seat 0's bank, captured once — no site ever replaces a player wholesale
// (see makePlayer), so the reference stays live for the seat's whole life.
// The DOM listener layer is a SEAT-0-ONLY producer: one document, one
// pointerLockElement — the listener idiom is physically single-seat. Every
// other seat is fed exclusively through pushInputFrame, never through
// synthetic DOM events.
const in0 = players[0].input;

const G = {
  running: false,
  started: false, // velocity zeroes on the first start only — a resume keeps it, like unpausing
  mouse: { x: 0, y: 0, seen: false }, // last native-pointer client position for absolute mouse aiming
  bullets: [],
  leftHeld: false,
  rightHeld: false,
  keys: new Set(), // held QWE/ADZXC codes
};
// The moved flight fields stay reachable as G.<field>: G keeps its object
// identity and delegates to players[0]. The bridge is TEST-ONLY now — the
// __test surface holds G by reference (~155 t.G.* reads across the suites);
// js/audio.js reads players[0] directly since the headless-host commit, so
// no production code depends on this delegation any more. It dies in the
// commit that converts the suites; it is no license to leave simulation
// sites in this file or encounter.js unconverted.
for (const f of ["ship", "vel", "aimAngle", "aimOff", "aimed", "cool", "thrustAcc", "flame"]) {
  Object.defineProperty(G, f, {
    get: () => players[0][f],
    set: (v) => { players[0][f] = v; },
    enumerable: true,
    configurable: true,
  });
}

// ---- canvas sizing: fit the logical field to the window, letterboxed ----
// The letterbox is a RESERVATION now: GUTTER CSS px per side are held out of
// the fit for the shop column (left) and the leaderboard (right), so the
// pillarbox a 16:9 window already gave the 512×342 field becomes usable
// surface instead of dead bars. The field pays at most 1 − FIELD_MIN of its
// gutterless size for that — past the floor the gutters give way instead
// (and the panels collapse with them, see panelsOn/panelCompact), so a
// squarer window never crushes the game to grow its menus.
let GUTTER = 180;       // CSS px reserved each side for the panels
const FIELD_MIN = 0.85; // the field keeps at least this fraction of its gutterless fit
let scale = 1;
let ox = 0;
let oy = 0;
let dpr = 1;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(Math.max(1, window.innerWidth) * dpr);
  canvas.height = Math.round(Math.max(1, window.innerHeight) * dpr);
  const sFull = Math.min(canvas.width / FW, canvas.height / FH);
  const g = Math.round(GUTTER * dpr);
  // the reserved fit, floored so the panels can never shrink the field past
  // FIELD_MIN of what the window alone would give it (a window narrower
  // than the field makes the reserved term negative — the floor covers it)
  scale = Math.max(Math.min((canvas.width - 2 * g) / FW, canvas.height / FH),
                   sFull * FIELD_MIN);
  ox = (canvas.width - FW * scale) / 2;
  oy = (canvas.height - FH * scale) / 2;
  hintTop = (oy + (FH / 2 + 96) * scale) / dpr; // just below the pause hints, in field space
  pausemenu.style.top = hintTop + "px"; // both paused screens hang from the same line —
  pausemenu.style.maxHeight = Math.max(60, window.innerHeight - hintTop - DEV_MARGIN) + "px";
  placeDevPanel(); // the panel earns the hint space back — see below
  if (window.FX) FX.resize(); // the light layers follow the backing store
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

// ---- the gutter panels ------------------------------------------------------
// The shop column (left bar) and the leaderboard (right bar) render in DEVICE
// pixels, outside the field transform — pure presentation, hash-safe by
// construction: the sim never reads the window and nothing here writes sim
// state. encounter.js owns the panels' content and their fixed LOGICAL spaces
// (Encounter.panelSpec / shopLayout); this file owns the fit of each space
// into its live bar and the pointer conversion back through the same fit, so
// device COORDINATES never leak into encounter.js or onto the wire.
//
// One SCALE does cross, and only into the draw: drawShopPanel takes k/dpr,
// the fit's CSS px per logical unit, so encounter.js can hold its type above
// a legibility floor when a short window squeezes the column (a laptop used
// to render the row names at under 6 CSS px). It is a ratio, not a position
// — it reaches Encounter.shopTextPlan and nothing else there, and the hit
// test, panelAt and the wire index never see it. The pointer round trip is
// still panelPlace and its exact inverse, unchanged.
//
// That scale is now the shop's WHOLE argument, and panelCompact() below is
// not part of it. The shop used to take the compact flag too and drop its row
// names and its detail band whenever ox/dpr fell under PANEL_COMPACT; it now
// decides that from the type it is about to set — see drawShopPanel — and the
// cut lands at an equivalent 93.49 CSS px of gutter instead of a hand-picked
// 110. The leaderboard still takes panelCompact(), because ITS compact cut is
// only padding and a width threshold is the right test for padding.
//
// PANELS is the suites' suppression lever — the same isolating role MINIMAP
// plays for the corner map: a pixel-diff run stands both panels down and the
// bars go back to bare page, so screen-vs-screen diffs stay meaningful.
let PANELS = true;
const PANEL_MARGIN = 8;    // CSS px of air around a panel inside its bar
const PANEL_MIN = 60;      // bars narrower than this (CSS px) draw no panels at all
const PANEL_COMPACT = 110; // ...and narrower than this the LEADERBOARD tightens
                           // its padding. It used to be the shop's prose cut as
                           // well; the shop now measures its own type instead
                           // (Encounter.shopTextPlan), so this number is a
                           // padding threshold and nothing more.
const panelsOn = () => PANELS && !!(window.Encounter && Encounter.panelSpec) && ox / dpr >= PANEL_MIN;
const panelCompact = () => ox / dpr < PANEL_COMPACT;
// fit a logical panel space {w, h} into the left or right bar: one uniform
// scale, centred both ways. Null when the bar has no room at all.
function panelPlace(spec, side) {
  const m = PANEL_MARGIN * dpr;
  const k = Math.min((ox - 2 * m) / spec.w, (canvas.height - 2 * m) / spec.h);
  if (!(k > 0)) return null;
  const x0 = side === "left" ? (ox - spec.w * k) / 2
                             : canvas.width - ox + (ox - spec.w * k) / 2;
  return { x0, y0: (canvas.height - spec.h * k) / 2, k };
}
// which panel a device-pixel point lands in, and where in that panel's own
// logical space — the ONE conversion the pointer routing below uses, so the
// hit test always inverts exactly the transform the draw used
function panelAt(bx, by) {
  if (!panelsOn() || !G.started) return null;
  const side = bx < ox ? "left" : bx > canvas.width - ox ? "right" : null;
  if (!side) return null;
  const spec = Encounter.panelSpec();
  const p = panelPlace(side === "left" ? spec.shop : spec.board, side);
  if (!p) return null;
  return { panel: side === "left" ? "shop" : "board",
           x: (bx - p.x0) / p.k, y: (by - p.y0) / p.k };
}
// client coordinates → device backing pixels, the space panelAt speaks
function pointerDevice(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { x: (clientX - r.left) * canvas.width / r.width,
           y: (clientY - r.top) * canvas.height / r.height };
}
// ...and the inverse, for the suites: a panel-space point as client
// coordinates, so a check can dispatch a REAL mousedown at a card's centre
// instead of guessing at pixels. Null while the panel has no room.
function panelToClient(panel, px, py) {
  if (!window.Encounter || !Encounter.panelSpec) return null;
  const spec = Encounter.panelSpec();
  const p = panelPlace(panel === "shop" ? spec.shop : spec.board,
                       panel === "shop" ? "left" : "right");
  if (!p) return null;
  const r = canvas.getBoundingClientRect();
  return { x: r.left + (p.x0 + px * p.k) * r.width / canvas.width,
           y: r.top + (p.y0 + py * p.k) * r.height / canvas.height };
}
// the locked-mode pointer's device position — the drawn cursor is that
// mode's pointer, panels included, and lcur's range covers the whole canvas
const lcurDevice = () => ({ x: ox + in0.lcur.x * scale, y: oy + in0.lcur.y * scale });
// locked mode's panel hover: read the drawn cursor after every move. An
// off-panel point clears the hover through the same call that would set it.
function hoverFromLcur() {
  if (!window.Encounter || !Encounter.shopHover) return;
  const d = lcurDevice();
  const pp = panelAt(d.x, d.y);
  if (pp && pp.panel === "shop") Encounter.shopHover(pp.x, pp.y);
  else Encounter.shopHover(-1e9, -1e9);
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
  const P = localPlayer(); // VIEW: the lead belongs to the ship the camera follows
  const vx = P.vel.x * CAMLEAD;
  const vy = P.vel.y * CAMLEAD;
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
  const P = localPlayer(); // VIEW: every client's camera follows ITS OWN seat
  if (CAMMODE === "lock") {
    cam.x = P.ship.x - FW / 2;
    cam.y = P.ship.y - FH / 2;
  } else if (CAMMODE === "smooth" || CAMMODE === "lookahead") {
    // the TARGET swings only when the gate commits — the ease still glides there
    const l = CAMMODE === "lookahead" ? gatedLead() : { x: 0, y: 0 };
    cam.x += (P.ship.x + l.x - FW / 2 - cam.x) * CAMEASE;
    cam.y += (P.ship.y + l.y - FH / 2 - cam.y) * CAMEASE;
    // the leash — whatever the lead asked for, the ship stays at least
    // EDGEMARGIN px inside every view edge; clampCam() below may shave the
    // margin at a world wall, but the ship itself never leaves the screen
    cam.x = Math.max(P.ship.x - (FW - EDGEMARGIN), Math.min(P.ship.x - EDGEMARGIN, cam.x));
    cam.y = Math.max(P.ship.y - (FH - EDGEMARGIN), Math.min(P.ship.y - EDGEMARGIN, cam.y));
  } else if (CAMMODE === "deadzone") {
    const mx = (FW - FW * CAMBOX) / 2; // view edge to box edge
    const my = (FH - FH * CAMBOX) / 2;
    if (P.ship.x < cam.x + mx) cam.x = P.ship.x - mx;
    else if (P.ship.x > cam.x + FW - mx) cam.x = P.ship.x - FW + mx;
    if (P.ship.y < cam.y + my) cam.y = P.ship.y - my;
    else if (P.ship.y > cam.y + FH - my) cam.y = P.ship.y - FH + my;
  } else if (CAMMODE === "flip") {
    const rx = Math.max(0, Math.min(WW - FW, Math.floor(P.ship.x / FW) * FW)); // room origins satisfy the clamp
    const ry = Math.max(0, Math.min(WH - FH, Math.floor(P.ship.y / FH) * FH));
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
// The ring's THRUST role ships STOCK now — mods.keyThrust defaults true and
// the WSAD ENGINE CONTROLS shop row is gone (user feedback: the keys are the
// baseline, not an upgrade). The predicate survives as the one gate on
// step()'s thrust sum: the field is still honest state (`!== false`), so a
// future mode can re-lock it without re-plumbing. The AIM role never was
// gated and never is — see the keydown handler.
//
// Read LAZILY and defaulting PERMISSIVE: window.Encounter is assigned at the
// very end of encounter.js, long after this file has finished running, so a
// hoisted top-level read would be permanently undefined — and a locked default
// would leave a standalone game.js (no encounter at all) with no thrust.
const keyThrustUnlocked = () => !window.Encounter || Encounter.mods.keyThrust !== false;

// The SEAT-INDEXED impulse wrappers. The arithmetic itself lives in the flight
// kernel (Flight.thrust / Flight.aim); what stays here is the seat lookup and
// the FROZEN gate — the gate is caller territory, because the kernel never
// asks whether an overlay owns the field. Mouse deltas, keyboard thrust and
// the ring drain all come through the same kernel call, so the flame sees
// every source. Both names survive: the event-mode listener path and the
// __test surface call them.
function thrustImpulse(dx, dy, seat = 0) {
  if (window.Encounter && Encounter.frozen()) return; // no velocity pumping while the sim is frozen
  Flight.thrust(players[seat], dx, dy);
}

function aimImpulse(dx, dy, seat = 0) {
  Flight.aim(players[seat], dx, dy);
}

// ---- per-tick input path (INPUTMODE "tick") --------------------------------
// The listener no longer decides how input lands; these dispatchers do. In
// event mode they are pass-throughs to the impulse functions above — the
// shipped path, byte-identical. In tick mode thrust/aim bank RAW deltas (never
// pre-multiplied impulses: applying the nonlinear flick curve and along/across
// split once, at the tick, is the whole point). The cursor stays per-event:
// moveLockedCursor is linear (dx*k plus a clamp), so applying it there is
// order-safe and keeps the local pointer out of the lagged simulation path.
// The accumulator and the lag ring live in each seat's bank (makePlayer's
// `input`): one accumulated ring entry per tick, applied round(INPUTLAG/TICK)
// ticks late — seat 0 only; see drainTickInput. Tick mode only — see the
// INPUTLAG comment. The dispatchers below are the DOM producer, so they feed
// seat 0's bank and no other.
function inputThrust(dx, dy) {
  if (INPUTMODE === "tick") { in0.acc.tx += dx; in0.acc.ty += dy; in0.acc.n++; return; }
  thrustImpulse(dx, dy);
}
function inputAim(dx, dy) {
  if (INPUTMODE === "tick") { in0.acc.ax += dx; in0.acc.ay += dy; in0.acc.n++; return; }
  aimImpulse(dx, dy);
}
function inputFire() {
  if (INPUTMODE === "tick") { in0.acc.fp++; return; }
  // event mode banks nothing, so the claim latch is set at the press itself —
  // the tick that follows reads it and step() clears it. Ahead of fire(),
  // which refuses a dead seat outright: the press has to count precisely in
  // the case the shot does not.
  in0.claimPress = 1;
  fire();
}
function inputCursor(dx, dy) {
  moveLockedCursor(dx, dy);
}
// the sim-side discard — everything clearTickInput does EXCEPT the scur
// snap, which needs the render camera and therefore lives at the client
// boundary (clientStep syncs it on the same frozen tick). step() may call
// this; it reads no camera. It clears ALL seat banks: the frozen sim
// discards every seat's backlog, not just the local one (phase 08 revisits
// per-seat freeze semantics).
function dropTickInput() {
  for (let s = 0; s < players.length; s++) {
    const b = players[s].input;
    b.acc.tx = b.acc.ty = b.acc.ax = b.acc.ay = 0;
    b.acc.fp = 0;
    b.acc.n = 0;
    b.fireHeld = s === 0 ? G.leftHeld : false; // only seat 0 has a local mouse
    b.claimPress = 0; // a press made under a frozen overlay is discarded with the
                      // ring it would have ridden in on — the shop's own click is
                      // not a request to be dealt back into the field
    b.ring.length = 0;
  }
}
// the full boundary clear — pause, resume, mode switches and lock loss call
// this from UI/event code, where the camera is in scope. The scur snap is
// seat 0's alone: a remote seat has no local pointer, and its next frame's
// cx,cy re-seats its cursor.
function clearTickInput() {
  dropTickInput();
  const w = lcurWorld(); // seat 0's sim cursor snaps to the pointer's CURRENT world point
  in0.scur.x = w.x;
  in0.scur.y = w.y;
}
// The BANK — one call per client tick, from clientStep(), BEFORE step().
// This is the client boundary: it converts the view cursor to world through
// the render camera and pushes the tick's frame. cx,cy are WORLD coordinates
// of the aim point. Between pointer events the view cursor rides the camera,
// so each record carries the world point where the cursor sat ON SCREEN at
// its own tick — and the record needs no client, no letterbox and no camera
// to replay. This exact shape is the wire frame a server consumes: on a
// server this function never runs — frames arrive instead, and the
// camera-free step() below drains them the same way.
function bankTickInput() {
  if (INPUTMODE !== "tick") return;
  const { x: kx, y: ky } = keyDirection();
  const w = lcurWorld();
  in0.ring.push({ tx: in0.acc.tx, ty: in0.acc.ty, ax: in0.acc.ax, ay: in0.acc.ay,
                  cx: w.x, cy: w.y, fp: in0.acc.fp, fh: G.leftHeld, kx, ky,
                  rh: G.rightHeld ? 1 : 0 }); // the comet bit — right-hold, as a
                  // per-tick record the sim drains; step() never reads G.rightHeld
  in0.acc.tx = in0.acc.ty = in0.acc.ax = in0.acc.ay = 0;
  in0.acc.fp = 0;
  in0.acc.n = 0;
}
// The one producer API for every non-DOM seat: append a pre-formed banked
// record (the exact shape bankTickInput banks; cx,cy are WORLD coordinates)
// to seat s's ring. The drain discipline below applies unchanged — at most
// two entries leave per tick PER SEAT. The server's socket binding, the
// multi-seat fixtures and the __test surface all call THIS function; it is
// exported through sim-host too, so there is no test-only twin.
// A frame addressed at a seat that does not exist is REJECTED, loudly, and
// never a TypeError: a mis-routed wire frame must not crash the server.
// Returns whether the frame was banked.
function pushInputFrame(seat, f) {
  const P = players[seat];
  if (!P) {
    console.warn("pushInputFrame: no seat " + seat + " (players=" + players.length + ") — frame dropped");
    return false;
  }
  const rec = { tx: f.tx, ty: f.ty, ax: f.ax, ay: f.ay,
    cx: f.cx, cy: f.cy, fp: f.fp, fh: f.fh, kx: f.kx, ky: f.ky,
    rh: f.rh ? 1 : 0 }; // normalized, default 0 — an old frame without the
                         // comet bit decodes as comet-off, never undefined
  // vt (phase 15) copies only when PRESENT and integer — ABSENT is the
  // default, so a frame without a view tick stays byte-identical to every
  // committed fixture's F() record and earns a zero rebate at the drain
  if (Number.isInteger(f.vt)) rec.vt = f.vt;
  P.input.ring.push(rec);
  return true;
}
// The DRAIN — one call per step(), beside the keyboard thrust so both
// per-tick sources land in the same slot ahead of the damping and the radial
// clamp. Consumes ONLY stored world-point frames; it reads no camera. Every
// bank consumes the accumulator — a catch-up frame's later steps see zeros,
// which is correct: the hand moved once. At most two lag entries leave per
// tick PER SEAT: the due one, plus one overdue after the slider shrank
// mid-flight — applied in order, none dropped, never the whole backlog in
// one tick.
function drainTickInput() {
  if (INPUTMODE !== "tick") return;
  // Seats drain in ASCENDING order — PINNED. Once fixtures carry more than
  // one seat this order is hash-visible; it must never change.
  for (let s = 0; s < players.length; s++) {
    const b = players[s].input;
    // the dev lag slider is seat 0's rehearsal alone; a remote seat's delay
    // is the wire itself, so its ring drains as soon as a frame is banked
    const delay = s === 0 ? Math.max(0, Math.round(INPUTLAG / TICK)) : 0;
    // The ring is TRANSPORT and stays out of the kernel: the lag delay and the
    // at-most-two lid are decided here, and the lifted frames go to the slice.
    // Lifting them up front is not a reordering — applying a frame touches no
    // ring, so the old interleaved `shift()` saw the same two records.
    FLIGHT_FRAMES.length = 0;
    for (let k = 0; k < FRAMES_PER_TICK && b.ring.length > delay; k++) FLIGHT_FRAMES.push(b.ring.shift());
    // a dead seat's ring still drains (frames are consumed, never banked
    // forever) but applies nothing — the corpse takes no input until the
    // respawn flow revives the seat. Read ONCE per pass, as before: liveness
    // only changes in encounter code, which runs after all three passes.
    FLIGHT_CTX.alive = seatAlive(s);
    FLIGHT_CTX.terms = null; // the drain derives nothing from ranks
    FLIGHT_CTX.keyThrust = keyThrustUnlocked; // the gate, still evaluated per frame
    FLIGHT_FX.seat = s;
    Flight.drainSlice(players[s], FLIGHT_FRAMES, FLIGHT_CTX, FLIGHT_FX);
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
// backing buffer and letterbox transform.
// client coordinates → LOGICAL FIELD coordinates: the letterbox transform
// only, with no camera, so the result lands in the space the UI pass draws in
// (the HUD, the overlays, the shop's cards). Null while the canvas has no box
// yet.
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
// The cursor pair lives in each seat's bank. `lcur` is VIEW/field
// coordinates, clamped to the field rectangle: between pointer events it
// holds its SCREEN position, so it rides the camera (which rides the ship) —
// the pre-world-frame feel, kept on purpose. `scur` is the tick simulation's
// delayed aim point in WORLD coordinates: the bank converts view → world
// through the render camera once per tick, so every ring entry carries the
// world point where the cursor sat on screen at its own tick. At boot scur
// is cam + lcur — the camera starts centred. Neither belongs in a hash
// allow-list: hashShip already captures every simulation result scur
// influences. Only seat 0 has a view cursor; a remote seat's scur moves
// through its drained frames alone.
// the view cursor as a WORLD point, through the render camera at call time.
// This is the CLIENT-side boundary conversion — the bank, the marker and the
// UI transitions read it; the sim's own aim path reads banked world points.
const lcurWorld = () => ({ x: cam.x + in0.lcur.x, y: cam.y + in0.lcur.y });
// the aim pointer's STORED world point — the sim's event-mode aim reads this
// instead of converting through the live camera inside step(). The client
// boundary refreshes it: every pointer event, every mode flip, and once per
// client tick (after the camera moves), so it tracks the screen-fixed
// pointer's ride at tick granularity while step() stays camera-free.
const wcur = { x: WW / 2, y: WH / 2, seen: false };
function refreshPointerWorld() {
  if (lockedMode()) {
    const w = lcurWorld();
    wcur.x = w.x;
    wcur.y = w.y;
    wcur.seen = true;
    return;
  }
  if (!G.mouse.seen) { wcur.seen = false; return; }
  const p = pointerField(G.mouse.x, G.mouse.y);
  if (p) { wcur.x = p.x + cam.x; wcur.y = p.y + cam.y; wcur.seen = true; }
  else wcur.seen = false;
}
function mirrorLockedCursor() {
  const c = fieldToClient(in0.lcur.x, in0.lcur.y);
  G.mouse.x = c.x;
  G.mouse.y = c.y;
  G.mouse.seen = true;
  refreshPointerWorld(); // the pointer moved — its stored world point follows
}
// The drawn cursor's range is the WHOLE canvas in field units, not just the
// field rect: the shop panel lives in the left gutter, and locked mode's
// synthetic pointer must be able to reach it. (ox, oy) map to negative field
// coordinates; the aim resolvers are indifferent to the extension, and the
// in-field behavior is byte-identical — the wider clamp only binds outside.
function clampLcur() {
  in0.lcur.x = Math.max(-ox / scale, Math.min((canvas.width - ox) / scale, in0.lcur.x));
  in0.lcur.y = Math.max(-oy / scale, Math.min((canvas.height - oy) / scale, in0.lcur.y));
}
function moveLockedCursor(dx, dy) {
  // client px → field px through the letterbox transform, so the drawn cursor
  // travels exactly as far on screen as the native one would have — the OS
  // curve still applies upstream (standard lock), and no extra gain does here
  const r = canvas.getBoundingClientRect();
  const k = r.width ? canvas.width / r.width / scale : 1;
  in0.lcur.x += dx * k;
  in0.lcur.y += dy * k;
  clampLcur();
  mirrorLockedCursor();
}
// entry seeds from the last known aim, so nothing jumps on the mode flip
function seedLockedCursor() {
  const p = G.mouse.seen ? pointerField(G.mouse.x, G.mouse.y) : null;
  if (p) {
    in0.lcur.x = Math.max(0, Math.min(FW, p.x));
    in0.lcur.y = Math.max(0, Math.min(FH, p.y));
  } else {
    const P = localPlayer(); // VIEW: the seed sits off the ship this client flies
    const d = fireDir();
    in0.lcur.x = Math.max(0, Math.min(FW, P.ship.x - cam.x + (d ? d.x * AIMDIST : 0)));
    in0.lcur.y = Math.max(0, Math.min(FH, P.ship.y - cam.y + (d ? d.y * AIMDIST : 0)));
  }
  const w = lcurWorld();
  in0.scur.x = w.x;
  in0.scur.y = w.y;
  in0.ring.length = 0; // seat 0's ring only — absolute cursor samples from before this seed are stale
  mirrorLockedCursor();
}

// WORLD point → unit direction from the ship, with no camera term: the sim's
// one aim resolver. The readers differ only in WHICH world point they hand
// it — the banked delayed cursor (scur), or a client-side point converted
// through the render camera at the call. A point sitting on the ship yields
// no direction — the caller draws or fires nothing.
// The default seat is the LOCAL one: seat 0 in local play and on the server
// (no window.Net there), the granted seat in net mode. seatFireDir passes its
// own record explicitly, so the sim's per-seat resolution never reads this.
function cursorDir(p, P = localPlayer()) {
  const dx = p.x - P.ship.x;
  const dy = p.y - P.ship.y;
  const m = Math.hypot(dx, dy);
  return m < 0.001 ? null : { x: dx / m, y: dy / m };
}

function mouseAimDir() {
  // banked delayed world point for tick mode; the boundary-refreshed stored
  // world point for event mode. Either way the sim resolves a STORED point —
  // no live camera read sits under step().
  if (lockedMode()) return cursorDir(INPUTMODE === "tick" ? in0.scur : wcur);
  // INPUTLAG has never delayed mouse-mode aim; the lag probe deliberately
  // delays aim in locked mode only. The native pointer is screen-fixed, so
  // its aim follows the ship's screen position — wcur re-converts at every
  // boundary (pointer event or client tick), which is the same ride.
  if (!wcur.seen) return null;
  return cursorDir(wcur);
}

// Before mouse mode hands flight back to mouse motion, retain the visible
// pointer direction so shots do not jump; an 8-way key can then replace it.
// The snapshot keeps the pointer the player SEES. In locked tick mode that is
// the immediate lcur: mouseAimDir() resolves the delayed scur there, so a role
// swap reading it would pin the aim a whole INPUTLAG behind the drawn cursor
// for as long as the swap holds. The swap is a client-side act — the same
// local/delayed split markerDir() draws by — so its snapshot reads the client
// cursor. The faithful delayed version would land on the identical angle N
// ticks later (the ring's cx/cy ARE this cursor's bank-time world points);
// only the window differs.
// The resolvers here (lcurWorld, mouseAimDir) are seat 0's — the DOM listener
// layer is a seat-0-only producer — and only the WRITTEN aim state is
// parameterized. No caller passes a seat; they all take the default, which is
// localSeat().
//
// ...and localSeat() can name a seat this client has no RECORD for. The grant
// is bounded by the room's maxSeats, not by the last snapshot's player list
// (see grantedSeat), so the second client into a lobby holds seat 1 while
// `players` is still length 1 — no snapshot flows until the round starts, and
// only an applied snapshot widens that array. The guard below is what makes
// that harmless: this function draws nothing and decides nothing, so a seat
// with no record simply has no aim state to write, and the record the first
// snapshot deals arrives with aimed false exactly as a fresh seat should.
// Without it every right-button release in the lobby threw.
function snapshotMouseAim(seat = localSeat()) {
  const d = lockedMode() && INPUTMODE === "tick" ? cursorDir(lcurWorld()) : mouseAimDir();
  if (!d) return;
  const P = players[seat];
  if (!P) return;
  P.aimAngle = Math.atan2(d.y, d.x);
  P.aimOff.x = d.x * AIM_R;
  P.aimOff.y = d.y * AIM_R;
  P.aimed = true;
}

// every entry into aim mode opens at the current fire direction, at full
// deflection, so the first push pivots from where the shots already go
function enterAim() {
  const d = fireDir();
  if (!d) return;
  const P = localPlayer(); // the client's own aim state — see localSeat()
  if (!P.aimed) P.aimAngle = Math.atan2(d.y, d.x);
  P.aimOff.x = d.x * AIM_R;
  P.aimOff.y = d.y * AIM_R;
}

// Bullets, the direction marker and aim-aware cameras share this. While the
// mouse-mode pointer owns aim, they resolve against its live position. While
// mouse motion owns flight (and in push mode), they use the last relative/
// snapped aim, or the ship heading until the first aim (the CQ behavior).
function fireDir() {
  if (cursorAim() && aiming()) return mouseAimDir();
  const P = localPlayer(); // the DOM client's own seat; seatFireDir serves the rest
  if (P.aimed) return { x: Math.cos(P.aimAngle), y: Math.sin(P.aimAngle) };
  const s = Math.hypot(P.vel.x, P.vel.y);
  return s < 0.05 ? null : { x: P.vel.x / s, y: P.vel.y / s };
}

// A non-DOM seat's fire direction: its aim point is the banked scur its
// drained frames carry — the same resolution locked tick mode gives seat 0 —
// falling back to the stored aim, then the heading, exactly as fireDir does.
// Seat 0 keeps fireDir() itself: its aim modes are the client's business.
function seatFireDir(seat) {
  const P = players[seat];
  const d = cursorDir(P.input.scur, P);
  if (d) return d;
  if (P.aimed) return { x: Math.cos(P.aimAngle), y: Math.sin(P.aimAngle) };
  const s = Math.hypot(P.vel.x, P.vel.y);
  return s < 0.05 ? null : { x: P.vel.x / s, y: P.vel.y / s };
}
// The DOM-fed seat resolves through fireDir() (its aim modes are the client's
// business); every other seat resolves from its banked scur. On the server and
// in local play the DOM seat is 0, so this reads exactly as it always did.
const fireDirFor = (seat) => (seat === localSeat() ? fireDir() : seatFireDir(seat));

// The drawn marker's own direction — local UI, exactly like the drawn cursor.
// In locked tick mode fireDir() resolves against the delayed scur, so the
// triangle trailed the hand by the whole lag while the drawn cursor sat under
// it: two pointers on one screen, disagreeing. The render pass resolves
// against lcur instead. Bullets, the fire gate and every camera keep reading
// fireDir(), so the delay still shows where it is real — the shots leave along
// the older aim. Every other mode already resolves locally (mouse mode's live
// pointer, the stored snap during right-flight, push mode's aim offset), so
// this hands back fireDir() unchanged there. Render pass ONLY: never step(),
// never a hash — lcur is input state, exactly as its declaration says.
function markerDir() {
  if (lockedMode() && INPUTMODE === "tick" && aiming()) return cursorDir(lcurWorld());
  return fireDir();
}

// one gate for click fire and autofire: cooldown, the bullet cap, the mode.
// The cap counts the FIRING seat's own live bullets (owner-scoped), so one
// seat can never starve another — with one seat that count IS the list length.
function fire(seat = 0) {
  if (window.Encounter && Encounter.frozen()) return; // overlays own the field
  if (!seatAlive(seat)) return; // a dead seat's turret is cold until phase 08 revives it
  const P = players[seat];
  let mine = 0;
  for (const b of G.bullets) if (bulletSeat(b) === seat) mine++;
  if (P.cool > 0 || mine >= BMAX) return;
  const d = fireDirFor(seat);
  if (!d) return; // at rest and never aimed — no direction exists
  const s = Math.hypot(P.vel.x, P.vel.y);
  let vx, vy;
  if (BMODE === "cq-scale") {
    if (s < MIN_FIRE_V) return; // the original refused stationary fire
    vx = d.x * s * BFACTOR;
    vy = d.y * s * BFACTOR;
  } else {
    vx = d.x * BSPEED;
    vy = d.y * BSPEED;
    if (BMODE === "newtonian") {
      vx += P.vel.x * BFACTOR;
      vy += P.vel.y * BFACTOR;
    }
  }
  const em = termsOf(seat); // the FIRING seat's own terms — the tuner values stay untouched
  // one id SPACE across bullets and bodies — a replication layer keys by id
  // alone and cannot disambiguate by owning array; a page without the
  // encounter has nothing to replicate, so 0 stands in there
  G.bullets.push({ id: window.Encounter ? Encounter.nextId() : 0,
                   x: P.ship.x, y: P.ship.y, px: P.ship.x, py: P.ship.y, vx, vy,
                   r: 2.2, dmg: BDMG, owner: seat, dead: false, spent: false,
                   ttl: Math.max(1, Math.round(BLIFE * 1000 / TICK)) }); // no upgrade touches lifetime — BLIFE is the only knob
  // the phase-15 lag REBATE, at spawn and only at spawn: a vt-bearing frame's
  // latched Δ (drainSlice) advances the new bullet Δ ticks along its own path,
  // sweeping each advanced segment against era poses in the encounter's ring,
  // and leaves an ORDINARY bullet behind — px collapsed onto x, ttl spent, no
  // new field, so BULLET_HASH's allow-list does not grow. Defense in depth:
  // the latch was clamped at the drain and the server clamped vt before that;
  // the clamp here restates the sim's own bound for direct __test callers.
  if (window.Encounter) {
    const delta = Math.max(0, Math.min(21, P.input.fireDelta || 0));
    if (delta > 0) Encounter.rebate(G.bullets[G.bullets.length - 1], delta, seat);
  }
  P.cool = Math.max(1, Math.round(BCOOL * (em ? em.cool : 1) / TICK));
  if (window.Encounter) Encounter.emit("fire", P.ship, undefined, seat); // after every gate above —
                                          // a refused shot is silent. Pinned on the firing seat's
                                          // ship: the audio listener IS that ship (attenuation 1,
                                          // byte-identical cue outcome) and the wire needs the point
}

// ---- simulation step (one ~16.7ms update) --------------------------------
// simTick counts every step() call for the run's whole life — the input
// recorder orders events against it, and E.waveTick cannot serve because it
// resets per wave. It counts frozen calls too: a replay reproduces the raw
// call stream, and the shop's frozen ticks are part of that stream.
let simTick = 0;
function keyDirection() {
  let x = 0;
  let y = 0;
  // The ring thrusts while the mouse owns the aim (aiming()) AND while the
  // right button holds comet mode: WSAD is the default engine control now,
  // so engaging the comet must never silence it — the hold multiplies the
  // same keys' impulses (COMETACC/COMETTURN in thrustImpulse), it does not
  // retire them. With INVERT off, aiming() IS G.rightHeld, so the extra term
  // changes nothing and the non-inverted role swap keeps its exact contract.
  // Client-side only: in tick mode this direction is BANKED (kx, ky) and the
  // sim drains it from the ring — the comet's sim half still arrives through
  // rh alone, and step() still never reads G.rightHeld.
  if ((aiming() || G.rightHeld) && G.keys.size) {
    for (const c of G.keys) { x += KEY_AIM[c][0]; y += KEY_AIM[c][1]; }
    const m = Math.hypot(x, y);
    if (m) { x /= m; y /= m; }
  }
  return { x, y };
}
// ---- the ENERGY gate ------------------------------------------------------
// The one place a comet WANT becomes a comet. The input layer only ever states
// what the button is doing (input.cometWant); this decides whether the seat's
// pool can pay for it, and it lives in the SIM on purpose: a server-fed seat
// must be limited by exactly the code that limits the local one, and a client
// that gated its own button would let a modified page fly a free comet. It is
// also the only site inside the sim that writes players[s].comet.
//
// Called from step() AFTER the input drain and the event-mode key thrust, and
// BEFORE the per-seat integrate loop — that placement is load-bearing three
// times over: the radial clamp still reads THIS tick's flag, thrustImpulse's
// comet gains still read LAST tick's (the shipped one-tick latch), and
// P.thrustAcc still holds the tick's real thrust for COMETTHR to price.
// Seats walk ASCENDING, the same pinned order the drain and the integrate loop
// keep.
function energyStep() {
  for (let s = 0; s < players.length; s++) {
    // the seat's OWN terms, derived inside the loop, per seat, so one seat's
    // purchase can never speed another's recharge or raise another's cap
    FLIGHT_CTX.alive = seatAlive(s);
    FLIGHT_CTX.terms = termsOf(s);
    FLIGHT_CTX.keyThrust = null; // the energy pass reads no input gate
    Flight.energySlice(players[s], FLIGHT_CTX);
  }
}
function step() {
  simTick++;
  if (window.Encounter && Encounter.frozen()) { // shop/death overlays freeze the whole sim
    dropTickInput(); // frozen ticks DISCARD banked input, lag buffer included —
                     // thrustImpulse's own refusal to pump a frozen sim,
                     // matched. The scur snap is clientStep's — it needs the
                     // camera, and nothing under step() may read one.
    return;
  }
  drainTickInput(); // stored world-point frames land beside the keyboard
                    // thrust below, before the damping and the radial clamp;
                    // the BANK ran in clientStep(), before this function
  // the keys fly the ship — the ring's thrust role ships stock, and it stays
  // live through a comet hold (keyDirection's own gate). Only an explicit
  // mods.keyThrust re-lock quiets this sum.
  if (INPUTMODE !== "tick" && keyThrustUnlocked()) {
    const { x: kx, y: ky } = keyDirection();
    if (kx || ky) thrustImpulse(kx * KEYTHRUST, ky * KEYTHRUST);
  }
  energyStep(); // the comet wants resolve into flags and the pool pays — after
                // every impulse this tick (COMETTHR prices the real thrust) and
                // before the integrate loop, whose radial clamp reads the flag
                // this call just settled
  // EVERY seat integrates, ascending — the same pinned order the drain keeps.
  // The integrate slice runs for a corpse too: a dead ship still damps,
  // clamps, bounces and cools, so no liveness read belongs here.
  for (let si = 0; si < players.length; si++) {
    FLIGHT_CTX.alive = true; // unread by the integrate slice — stated, not implied
    FLIGHT_CTX.terms = termsOf(si); // the seat's OWN AFTERBURNER rank feeds the cap
    FLIGHT_CTX.keyThrust = null;
    FLIGHT_FX.seat = si;
    Flight.integrateSlice(players[si], FLIGHT_CTX, FLIGHT_FX);
  }
  if (AUTOFIRE) {
    // per-seat held fire, ascending. Only seat 0 has a native button; in
    // event mode there is no per-seat held bit at all, so seat 0 alone fires.
    if (INPUTMODE === "tick") {
      for (let si = 0; si < players.length; si++) if (players[si].input.fireHeld) fire(si);
    } else if (G.leftHeld) fire(0);
  }
  stepImpacts(); // visual bursts age on the sim clock — pause and frozen freeze them too
  stepShipFx();  // ...and the ship blasts with them, on the same clock for the same reason
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
  clearClaimPress(); // ...and the tick's claim edges are spent. LAST, after the
                     // one reader: the encounter's respawn loop is the only thing
                     // that consumes them, and clearing here (rather than at the
                     // drain) is what lets event mode — which banks no frame at
                     // all — and a check's direct press land on the same rule.
}
// the per-tick reset for the claim latch. Every seat, ascending, like every
// other per-seat walk in this file; a press is worth exactly one tick, so an
// unread one is dropped rather than carried into a tick its player never made.
function clearClaimPress() {
  for (let s = 0; s < players.length; s++) players[s].input.claimPress = 0;
}

// ---- the client tick boundary ---------------------------------------------
// Everything that needs the RENDER CAMERA to assemble a tick's input happens
// here, once, and then the camera-free step() runs. Every local driver — the
// frame loop, replayInput, the suites' __test.step, the encounter's
// advance() — enters through this wrapper, so the banking cadence is
// identical everywhere. On a server none of this exists: frames arrive on
// the wire and step() consumes them directly.
function clientStep() {
  refreshPointerWorld(); // the stored world aim point tracks this tick's camera
  if (INPUTMODE === "tick") {
    if (window.Encounter && Encounter.frozen()) {
      // the frozen tick's half of clearTickInput: seat 0's sim cursor snaps
      // to the pointer's current world point while step() discards the rest
      const w = lcurWorld();
      in0.scur.x = w.x;
      in0.scur.y = w.y;
    } else bankTickInput();
  }
  step();
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
  // the star field scrolls with the PRESENTED camera (FRAME.cam) — the largest
  // velocity field on screen must move with the same instant as the bodies it
  // frames. render() builds the frame before this runs; in the live branch
  // FRAME.cam carries cam's exact values, so this is byte-identical there.
  const cbx = FRAME.cam.x;
  const cby = FRAME.cam.y;
  drawn.star.x = cbx; // the probe records the base ACTUALLY scrolled by — the
  drawn.star.y = cby; // one local every layer reads, so a regressed read moves it
  for (let li = 0; li < LAYERS.length; li++) {
    const L = LAYERS[li];
    const offX = cbx * L.f; // this layer's scroll — its own view of its own space
    const offY = cby * L.f;
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
  const P = localPlayer(); // VIEW: only the local pilot's ship wears the flame
  // the exhaust roots on the FRAME pose — the same pose drawShip receives for
  // this seat, so the flame never trails a hull that has already been drawn
  // elsewhere. The flame VECTOR stays live: it is thrust, not a pose, and
  // carries no per-frame shadow.
  const vp = FRAME.ships[P.id] || P.ship;
  const m = Math.hypot(P.flame.x, P.flame.y);
  const len = Math.min(m * FLAME_GAIN, FLAME_MAX);
  if (len < 1.5) return;
  const dx = -P.flame.x / m; // exhaust points opposite the thrust
  const dy = -P.flame.y / m;
  const px = -dy; // base half-width direction
  const py = dx;
  const jit = 0.8 + Math.random() * 0.4; // flicker
  const bx = vp.x + dx * (SHIP_R - 2);
  const by = vp.y + dy * (SHIP_R - 2);
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

// the comet cue — a clear but cheap signal on a comet-mode ship: a soft clay
// halo plus a short tail opposite the velocity, drawn with the flash idiom
// (flat shapes under globalAlpha, no randomness stream touched). Render pass
// only; the suites never raise the comet flag around their pixel probes, so
// every committed ink comparison stays untouched.
function drawCometGlow(P, cv, vp = P.ship) {
  // vp is the FRAME pose for this seat — the halo and the tail anchor where
  // the hull draws this frame, not at the raw tick pose. The tail's direction
  // and stretch keep reading P.vel: velocity is the cue's meaning, and it has
  // no per-frame shadow.
  ctx.save();
  ctx.fillStyle = C.clay;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  // the halo IS the pool's in-world readout — it stands COMETAOE px clear of the
  // hull at a full pool and collapses ONTO the hull as the pool empties, so a
  // pilot reads their own energy without ever leaving the ship. The whole
  // clearance rides the fraction with no floor under it: a floor would park a
  // ring around a spent comet and flatten the bottom of the very range the
  // player needs most. Nothing is lost to it — the gate cuts the comet at zero,
  // so the last frame drawn is the hairline just above empty, not a bare hull.
  // The tail below stays on SPEED: the two cues must stay separable at a glance.
  // presentedPool hands the PRESENTED fraction in (predicted for the local
  // net seat); a caller without one falls back to the struct, as before
  // cometView owns both the fraction and the radius now — the same record the
  // light layer, the wake and the HUD read, so no consumer carries its own
  // copy of this arithmetic any more.
  const v = cv || cometView(P.id);
  if (v.phase === CP_WIND) {
    // THE WINDUP — the ask, drawn as an ask. A thin ring inflating toward the
    // halo's own radius, and nothing else: no fill, no tail, so it can never
    // be mistaken for the burn. It is a STROKE in the flat layer, which is
    // what keeps the cue readable with the light layer off entirely.
    ctx.globalAlpha = 0.18 + 0.3 * v.wind;
    ctx.strokeStyle = C.clay;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(vp.x, vp.y, SHIP_R + (v.r - SHIP_R) * v.wind, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.arc(vp.x, vp.y, v.r, 0, Math.PI * 2);
  ctx.fill();
  if (v.flash > 0) {
    // THE CONFIRM — one solid bright ring on the tick the authority agreed,
    // fading over COMET_FLASH_TICKS. This is the beat the windup was waiting
    // for, and the only moment the halo is ever anything but clay.
    ctx.globalAlpha = 0.75 * v.flash;
    ctx.strokeStyle = C.bright;
    ctx.lineWidth = 1 + 1.5 * v.flash;
    ctx.beginPath();
    ctx.arc(vp.x, vp.y, v.r + 2 * (1 - v.flash), 0, Math.PI * 2);
    ctx.stroke();
  }
  const s = Math.hypot(P.vel.x, P.vel.y);
  if (s > 0.3) { // the tail stretches with speed — the comet reads as a comet
    const dx = -P.vel.x / s;
    const dy = -P.vel.y / s;
    const px = -dy;
    const py = dx;
    const len = SHIP_R + 8 + s * 6;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(vp.x + px * 4, vp.y + py * 4);
    ctx.lineTo(vp.x - px * 4, vp.y - py * 4);
    ctx.lineTo(vp.x + dx * len, vp.y + dy * len);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ---- the ship, and everything it has been through --------------------------
// A hull used to be a position and nothing else: every seat drew the same
// pristine disc whether it was untouched, on its last hull point, or ten
// seconds into a respawn wait with its wreck still parked on the field. The
// three states below are all read from ONE place — Encounter.seatHealth(seat)
// — and every field it hands back is written from that seat's OWN wire record
// on a net client, so a REMOTE ship shows its damage on this screen exactly as
// it does on the screen of the player flying it. That is the whole point: a
// fix that only reached the local seat would not be a fix.
//
// Two rules the whole file below obeys, for the same reasons drawImpacts()
// obeys them:
//   * NO rand(). The seeded stream is hashed, and a draw that spent from it
//     would desync every replay. Wound placement comes from hash32(), the
//     same escape spawnImpactFx() takes.
//   * NO wall clock. Every animated thing here clocks off sim state — the
//     seat's own hitFlash, its respawn countdown, the encounter's waveTick —
//     so two render() calls inside one tick paint identical bytes, which four
//     committed pixel probes assume outright.
const HULL_SEED = 0x3C7B91A5; // the wound-placement salt — a seat's wounds sit
                              // in the same places on every client, every run
// One seat's presented survival state, or null when nothing can answer (the
// headless hosts have no encounter, and a seat can be drawn one frame before
// its record is dealt).
function seatHealth(s) {
  if (!window.Encounter || !Encounter.seatHealth) return null;
  return Encounter.seatHealth(s);
}
// The chewed silhouette. `bites` notches are pulled out of a circle of radius
// r, each one `depth` px deep at its centre and tapering to nothing at its
// edges, and the whole thing is left on the context as a path for the caller
// to fill, stroke or clip with. The b-th notch always sits at the same bearing
// for a given seat, so a hull that loses a second point KEEPS its first wound
// and gains a second rather than rearranging itself every time it is hit.
function hullPath(x, y, r, bites, seat, depth) {
  const N = 28; // enough segments that the intact arcs still read as round
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    let rr = r;
    for (let b = 0; b < bites; b++) {
      const h = hash32(seat, b, 7, HULL_SEED);
      const ba = ((h >>> 8) / 0x1000000) * Math.PI * 2; // this wound's bearing
      const bw = 0.42 + ((h & 0xff) / 255) * 0.34;      // ...and its angular half-width
      let d = Math.abs(a - ba);
      if (d > Math.PI) d = Math.PI * 2 - d;             // the short way round
      if (d < bw) rr -= depth * (1 - d / bw);
    }
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
// Where the b-th wound sits, in world px — the burn marks and the critical
// ember both hang off the same bearings the notches were cut at.
function woundAt(x, y, seat, b, k) {
  const a = ((hash32(seat, b, 7, HULL_SEED) >>> 8) / 0x1000000) * Math.PI * 2;
  return { x: x + Math.cos(a) * SHIP_R * k, y: y + Math.sin(a) * SHIP_R * k };
}
// The pristine hull: the exact three-step draw this function has always been.
// It is kept whole and separate on purpose — a seat at full hull with no live
// hit takes this path and only this path, so an undamaged ship paints the
// bytes it has always painted and nothing that probes one can see any of the
// work above.
function drawHull(x, y, tint) {
  ctx.fillStyle = tint || C.bright;
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
// The plate's colour as it burns down. Fixed steps rather than a lerp: the
// game draws in flat pixel tones everywhere else, and a ramp of computed greys
// would read as an anti-aliased gradient instead of battle damage. A full hull
// returns the untouched white by construction, so the pristine draw and the
// flashing-but-unhurt draw agree about what an intact plate looks like.
function hullTint(frac) {
  if (frac >= 1) return C.bright;
  if (frac > 0.5) return "#b6bbc7";
  if (frac > 0.25) return "#949aa8";
  return "#7b8290"; // a hull this far gone has nothing bright left on it
}
// A damaged, living hull: a chewed rim charred along its whole edge, a rosette
// whose sockets go dark as the hull points go, and — on the last quarter — an
// ember still burning in the first wound.
function drawDamagedHull(x, y, H, seat, tint) {
  const frac = Math.max(0, Math.min(1, H.hull / Math.max(1, H.hullMax)));
  const lost = Math.min(6, Math.max(1, H.hullMax - H.hull)); // six notches is
                              // already a wreck of a silhouette; past that the
                              // rosette carries the count on its own
  hullPath(x, y, SHIP_R, lost, seat, 2.6);
  ctx.fillStyle = tint;
  ctx.fill();
  // the char, stroked along the SAME path: it darkens the whole rim and it
  // deepens every notch, which is what makes a single missing hull point
  // legible at 1:1 on a 14 px ship. (An earlier pass filled a round burn under
  // each notch instead; clipped to the plate it left a crescent that read as a
  // stray ring, and unclipped it spilled off the hull. The rim is the honest
  // place for a burn anyway — it is where the damage came in.)
  ctx.strokeStyle = C.wall;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.lineWidth = 1;
  // the rosette as a hull gauge: a live socket is the full clay dot it always
  // was, a dead one is a small dark pit. Two different marks, not one mark in
  // two colours — at this size a colour swap alone does not survive the scale.
  const lit = Math.max(1, Math.round(8 * frac));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const live = i < lit;
    ctx.fillStyle = live ? C.clay : C.wall;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * 4.4, y + Math.sin(a) * 4.4, live ? 1.2 : 0.85, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = C.clay; // the core holds until the hull is actually gone
  ctx.beginPath();
  ctx.arc(x, y, 1.4, 0, Math.PI * 2);
  ctx.fill();
  // CRITICAL — one hull point from dead. An ember burns in the first wound,
  // blinking on the encounter's own presented clock (the same `wt % 8 < 5`
  // idiom the graced-ship ring uses), so a ship about to die announces it.
  if (frac <= 0.34 && H.wt % 8 < 5) {
    const w = woundAt(x, y, seat, 0, 0.62);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = C.clay;
    ctx.beginPath();
    ctx.arc(w.x, w.y, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.bright;
    ctx.fillRect(w.x - 0.7, w.y - 0.7, 1.4, 1.4);
  }
}
// The husk a downed seat leaves parked where it died, and the countdown that
// says when it flies again. A seat is down for 600 ticks now: ten seconds of
// plain absence tells the other players nothing about whether the ship is
// coming back, so the wreck stays on the field and wears the wait.
function drawWreck(x, y, H, seat) {
  ctx.save();
  hullPath(x, y, SHIP_R, 3, seat, 2.8); // deeper than a living hull ever shows,
                                        // but still a DISC: shred it further and
                                        // it stops reading as a ship at all
  ctx.fillStyle = C.wall;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = C.fieldBg; // the split — one gash, open to the field
  ctx.fillRect(x - SHIP_R, y - 1.1, SHIP_R * 2, 2.2);
  ctx.restore();
  ctx.strokeStyle = C.dim; // a cold outline, so the husk holds its shape over
  ctx.lineWidth = 1;       // a lit background as well as a dark one
  hullPath(x, y, SHIP_R, 3, seat, 2.8);
  ctx.stroke();
  ctx.globalAlpha = 0.55; // the rosette, every dot cold
  ctx.fillStyle = C.dim;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * 4.4, y + Math.sin(a) * 4.4, 1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (H.wt % 12 < 7) { // two embers still burning in the wreckage
    ctx.fillStyle = C.clay;
    for (let b = 0; b < 2; b++) {
      const w = woundAt(x, y, seat, b + 1, 0.5);
      ctx.fillRect(w.x - 0.8, w.y - 0.8, 1.6, 1.6);
    }
  }
  if (H.rsp <= 0 || H.rspMax <= 0) return; // parked for good — no promise to make
  // THE WAIT, drawn honestly: a track that closes as the countdown runs out,
  // and the seconds left written under it. Both are pure functions of `rsp`,
  // which is on the wire, so every client counts the same seat down together.
  const done = 1 - Math.max(0, Math.min(1, H.rsp / H.rspMax));
  ctx.strokeStyle = C.dim;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(x, y, SHIP_R + 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = C.clay;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, SHIP_R + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * done);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.save();
  ctx.fillStyle = C.clay;
  ctx.font = "700 9px " + FONT;
  ctx.textAlign = "center";
  ctx.fillText(String(Math.ceil(H.rsp / 60)), x, y + SHIP_R + 18);
  ctx.restore();
}
// The 20-tick hit reaction, spent on two cues that together read as "that
// landed": the plate goes white-hot for the first third, and a shock ring
// opens off the rim across the whole flash. The SHUDDER that goes with them
// is applied by the caller, because it has to move the hull and the rosette
// as one body. Nothing here is random: `flash` is sim state on every client
// (the wire carries it as `fl`), so the reaction plays the same everywhere.
function drawHitShock(x, y, flash) {
  const p = (20 - Math.min(20, flash)) / 20;
  ctx.lineWidth = 1;
  ctx.strokeStyle = C.clay;
  ctx.globalAlpha = 0.8 * (1 - p);
  ctx.beginPath();
  ctx.arc(x, y, SHIP_R + 2 + 13 * p, 0, Math.PI * 2);
  ctx.stroke();
  if (p < 0.4) { // a second, tighter ring while the hit is fresh
    ctx.strokeStyle = C.bright;
    ctx.globalAlpha = 0.7 * (1 - p / 0.4);
    ctx.beginPath();
    ctx.arc(x, y, SHIP_R + 1 + 6 * p, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
// THE DAMAGED-HULL LOOK, PARKED. The chewed silhouette and its burnt-down
// plate read wrong in play, so a LIVING seat draws the pristine plate at every
// hull value for now. Nothing above is deleted: seatHealth still reports the
// hull, drawDamagedHull and hullTint are untouched, and the wreck, the hit
// reaction and the death blast all still draw. Flipping this one flag back to
// true restores the whole look, and __test.setHullDamage flips it so the pixel
// legs in wave1-checks section S can still prove the parked draw works.
let SHOW_HULL_DAMAGE = false;
// THE ENTRY POINT the render loop calls, once per seat. Four states, in the
// order they matter: down, hit, damaged, pristine.
function drawShip(x, y, seat) {
  const H = seatHealth(seat);
  // an UNSEATED seat draws nothing at all — not even the wreck. A wreck on the
  // field says "a pilot is coming back to this"; nobody is, so the hull leaves
  // with the seat. First, ahead of the pristine-hull shortcut, because an
  // unseated seat's hull is 0 and would otherwise fall through to drawWreck.
  if (H && H.absent) return;
  // no record to read, or an untouched hull: the original draw, untouched
  if (!H || (H.hull >= H.hullMax && H.flash <= 0)) { drawHull(x, y); return; }
  if (H.hull <= 0) { drawWreck(x, y, H, seat); return; }
  let hx = x;
  let hy = y;
  if (H.flash > 0) {
    if (H.flash > 13) {
      // the kick. A fixed hash offset off the seat and the flash tick, so the
      // shudder is identical on every screen and across two renders of one
      // tick — a Math.random() jitter would break the pixel probes outright.
      const k = hash32(seat, H.flash, 3, HULL_SEED);
      hx += ((k & 3) - 1.5);
      hy += (((k >>> 2) & 3) - 1.5);
    }
    drawHitShock(x, y, H.flash); // the ring stays on the TRUE position — it is
                                 // the impact point, not the ship
  }
  // With the look parked the tint stays the untouched white, so a hurt hull
  // paints the SAME bytes the pristine draw paints — that is the whole ask.
  const tint = H.flash > 13 || !SHOW_HULL_DAMAGE
    ? C.bright
    : hullTint(H.hull / Math.max(1, H.hullMax));
  if (!SHOW_HULL_DAMAGE || H.hull >= H.hullMax) drawHull(hx, hy, tint); // flashing, but not yet hurt
  else drawDamagedHull(hx, hy, H, seat, tint);
}

function drawAim() {
  const P = localPlayer(); // VIEW: the marker orbits the ship this client flies
  // THE DRAWN marker anchors on the FRAME ship and, when the pointer drives
  // it, resolves its direction through FRAME.cam — pixels agree with pixels.
  // The INPUT path is deliberately untouched: refreshPointerWorld/lcurWorld
  // keep converting through canonical `cam`, and the sim keeps fireDir().
  const vp = FRAME.ships[P.id] || P.ship;
  let d = null;
  if (cursorAim() && aiming()) {
    // the pointer's world point through the RENDER camera — locked mode's
    // drawn cursor is field space, mouse mode's native pointer converts
    // through pointerField; off-field means no marker, as before
    const w = lockedMode()
      ? { x: FRAME.cam.x + in0.lcur.x, y: FRAME.cam.y + in0.lcur.y }
      : G.mouse.seen ? pointerField(G.mouse.x, G.mouse.y) : null;
    if (w && !lockedMode()) { w.x += FRAME.cam.x; w.y += FRAME.cam.y; }
    if (w) d = cursorDir(w, { ship: vp });
  } else d = markerDir(); // stored angles and velocity aim — no camera term
  if (!d) return; // at rest and never aimed — nothing to point
  drawn.aim.seen = true; // the probe: the anchor pose the marker orbits
  drawn.aim.x = vp.x;
  drawn.aim.y = vp.y;
  const px = vp.x + d.x * AIMDIST;
  const py = vp.y + d.y * AIMDIST;
  if (cursorAim()) {
    // Nova Drift-style direction marker: a small triangle stays AIMDIST
    // from the ship and points along the pointer. Normally that is the native
    // cursor; in locked mode the drawn one; during right-flight the stored
    // snap aim. Under input lag it holds the hand's line, not the sim's.
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

// the speculative tracer draw — world pass, beside the bullets it imitates.
// Alpha marks it as a promise rather than a fact; the muzzle glow lasts two
// frames so a refused-later cue still cost only honest ink.
function drawTracers(list) {
  if (!list || !list.length) return;
  for (const tr of list) {
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = C.bright;
    ctx.beginPath();
    ctx.arc(tr.x, tr.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.3; // the one-step trail, along the velocity it left on
    ctx.beginPath();
    ctx.arc(tr.x - tr.vx * 0.6, tr.y - tr.vy * 0.6, 1.6, 0, Math.PI * 2);
    ctx.fill();
    if (tr.age < 3) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = C.clay;
      ctx.beginPath();
      ctx.arc(tr.ox, tr.oy, 6 - tr.age, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// the locked-mode pointer: drawn on the canvas because the held lock hides
// the native one. Render pass ONLY, never step() — the camera lives outside
// the tick, and a tick-drawn cursor would be a fresh coupling of the kind
// this chain removed. lcur is view space, so the cursor holds its SCREEN
// position and rides the camera between hand motions — the kept feel.
// Hidden during right-hold flight, mirroring how mouse mode's hidden native
// cursor holds still for the same stretch.
function drawLockedCursor() {
  if (!lockedMode() || !G.running) return;
  if (!aiming() && !(window.Encounter && Encounter.frozen())) return;
  ctx.strokeStyle = C.bright;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(in0.lcur.x, in0.lcur.y, 3.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = C.clay;
  ctx.fillRect(in0.lcur.x - 0.6, in0.lcur.y - 0.6, 1.2, 1.2);
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
  // camera sits clamped at the world's far corner. It frames the PRESENTED
  // camera — the rect must show the slice of world the frame actually drew.
  const vcx = FRAME.cam.x;
  const vcy = FRAME.cam.y;
  drawn.mm.x = vcx; // the probe records the camera the rect ACTUALLY framed —
  drawn.mm.y = vcy; // the same local the stroke reads, so a regressed read moves it
  ctx.strokeRect(mx + vcx * kx + 0.5, my + vcy * ky + 0.5, FW * kx - 1, FH * ky - 1);
  // contact dots — between the viewport rectangle and the ship dot so the
  // ship always reads on top. Same clamp discipline as the ship dot: a dot
  // of side s stays inside [m, m + MM − s] per axis, so nothing pokes past
  // the frame when an entity hugs a world wall. Draw-only reads of the FRAME
  // view (the live arrays themselves in the live branch) — no randomness,
  // no mutation, the seeded stream is untouched.
  const dot = (wx, wy, s) => {
    ctx.fillRect(Math.max(mx, Math.min(mx + wx * kx - s / 2, mx + MM_W - s)),
                 Math.max(my, Math.min(my + wy * ky - s / 2, my + MM_H - s)), s, s);
  };
  ctx.fillStyle = C.dim; // player shots — the faintest, most transient trace
  for (const b of FRAME.bullets || G.bullets) { if (!b.dead && !b.spent) dot(b.x, b.y, 1); }
  if (window.Encounter) {
    const m = Encounter.mapState(); // the fallback for a frame without copies
    ctx.fillStyle = C.clay;   // XP orbs wear their field color; 1 px vs the 2 px ship
    for (const o of FRAME.orbs || m.orbs) dot(o.x, o.y, 1);
    ctx.fillStyle = C.bright; // enemies — the loudest mark on the map
    for (const e of FRAME.enemies || m.enemies) dot(e.x, e.y, 2);
  }
  ctx.fillStyle = C.clay; // the ship — clamped so the 2px dot can't poke
  // past the frame when the ship rests against a world wall
  const P = localPlayer(); // VIEW: the map marks where THIS client is
  const vp = FRAME.ships[P.id] || P.ship; // the frame's pose, like every dot above
  const sx = Math.max(mx, Math.min(mx + vp.x * kx - 1, mx + MM_W - 2));
  const sy = Math.max(my, Math.min(my + vp.y * ky - 1, my + MM_H - 2));
  ctx.fillRect(sx, sy, 2, 2);
}

// the other tracking layer: chevrons on the field's inner edge pointing at
// enemies the viewport has lost. The geometry and the drawing live in
// encounter.js beside the enemy list; this flag is the world-tab switch it
// reads, declared here with the rest of the HUD toggles.
let EDGEARROWS = true;

// ---- the first-run controls card -------------------------------------------
// One cached bitmap that teaches the shipped control contract — the visible
// cursor aims, left fires, the stock WSAD/QEZC ring flies, and hold right
// spends energy on comet mode — drawn on the
// idle field of a session that has never started. G.started is the whole gate:
// it flips once, inside resume(), and from then on every pause is the ordinary
// text screen for the rest of the page's life. Nothing is persisted, so a
// reload is a fresh first run again — deliberately, while the game is a
// prototype people open cold.
//
// Accuracy is a precondition rather than a hope. The art draws the CURSOR-AIM
// roles — cursor aim, left fire, stock key thrust and right-hold comet — which
// is the contract of both mouse mode and the shipped locked mode: the two
// differ only in whether that cursor is the native pointer or the one drawn on
// the canvas, and the card teaches neither of those words. Push mode changes
// the aim model outright, and clearing "invert right" swaps the mouse roles,
// so either gets the text screen instead of a card that would lie.
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

// (The eight-way thrust card is gone. This file used to own an explainer
// bitmap — assets/ui/eight-way-thrust-explainer.png — that the shop popped up
// over the field while the pointer rested on the WSAD ENGINE CONTROLS row,
// with encounter.js owning its rect. That row was retired when key thrust
// became stock equipment, and no row has carried the `card` field since, so
// the asset, its load flag, its 3.56 aspect ratio and the two functions that
// drew it had been unreachable code claiming in their comments to be a live
// hover preview. encounter.js now explains a hovered row in TYPE, in a panel
// it lays out itself — see Encounter.shopHoverPlan — so nothing here is
// needed. The PNG went with the code: an asset no file reads is the same dead
// weight the functions were, and the prompt that generated it is kept under
// .ai-reference/prompts/ if the art is ever wanted again.)

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
function resetImpactFx() { fx.bursts.length = 0; fx.count = 0; fxWall.length = 0; resetShipFx(); if (window.FX) FX.reset(); }

// ---- ship destruction fx ---------------------------------------------------
// A seat's death, drawn. This is a SEPARATE ring from fx.bursts on purpose.
// The impact bursts are the encounter's: sized, capped and LIFETIMED for a
// stream of bullet hits, and several committed checks count them exactly
// (`t.fx.bursts.length === 1` after one staged hit). A hull going up is a
// different event on a different scale — bigger, longer, one per seat — so it
// gets its own list, its own cap and its own lifetime, and no burst-counting
// check can see it.
//
// It obeys the same two rules the bursts obey, for the same reasons: NO
// rand() (each blast carries a hash32 seed and re-derives every shard from
// (seed, age), exactly as drawImpacts does), and no wall clock — it ages in
// stepShipFx() off the sim tick locally and the PRESENTED tick on a net
// client, so a pause freezes it mid-blast like everything else.
const SHIPFX_MAX = 8;       // live blasts — one per seat is the real peak; 8 is slack
const SHIPFX_LIFE = 48;     // ticks, 0.8 s at 60 Hz — a hull burns longer than a bullet
const SHIPFX_SEED = 0x5A17C0DE;
const shipFx = { blasts: [], count: 0 };
// Spawned from the presentation-side drains and nowhere else: game.js's
// drainCues() in local play, js/net.js's fireEvents() on a net client — the
// same two places the cue for this event already reaches. Both are fed by the
// `death` event the sim emits with the dying seat's position, so EVERY client
// blows up EVERY seat, not just the one it happens to be flying.
function spawnShipBlast(x, y, seat) {
  if (FXINT <= 0) return; // the same off switch spawnImpactFx answers to
  shipFx.count = (shipFx.count + 1) >>> 0;
  if (shipFx.blasts.length >= SHIPFX_MAX) shipFx.blasts.shift(); // oldest out, like FX_MAX
  shipFx.blasts.push({ x, y, seat: seat | 0, age: 0, life: SHIPFX_LIFE,
    n: Math.max(4, Math.round(20 * FXINT)), // stamped at spawn, like the bursts:
    scale: FXINT,                           // a slider moved mid-blast never resizes it
    seed: hash32(Math.round(x), Math.round(y), shipFx.count, SHIPFX_SEED) });
}
function resetShipFx() { shipFx.blasts.length = 0; shipFx.count = 0; }
function stepShipFx() {
  for (let i = shipFx.blasts.length - 1; i >= 0; i--) {
    if (++shipFx.blasts[i].age >= shipFx.blasts[i].life) shipFx.blasts.splice(i, 1);
  }
}
function drawShipBlasts() { // draw-only — reads blast state, never mutates it
  for (const B of shipFx.blasts) {
    const p = B.age / B.life;
    const fade = 1 - p;
    let h = B.seed;
    const rnd = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 0x100000000; };
    // the scorch first, under everything: the mark the hull leaves on the field
    ctx.globalAlpha = 0.4 * fade;
    ctx.fillStyle = C.wall;
    ctx.beginPath();
    ctx.arc(B.x, B.y, SHIP_R * 1.5, 0, Math.PI * 2);
    ctx.fill();
    if (B.age < 3) { // three ticks of white before anything else is legible
      ctx.globalAlpha = 1 - B.age / 3;
      ctx.fillStyle = C.bright;
      ctx.beginPath();
      ctx.arc(B.x, B.y, SHIP_R * 2.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 1; // two rings out of the wreck — bright leads, clay trails
    ctx.globalAlpha = 0.85 * fade;
    ctx.strokeStyle = C.bright;
    ctx.beginPath();
    ctx.arc(B.x, B.y, SHIP_R + 34 * Math.min(1, p * 1.6), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.5 * fade;
    ctx.strokeStyle = C.clay;
    ctx.beginPath();
    ctx.arc(B.x, B.y, SHIP_R + 48 * p, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = fade; // the shards: three LCG draws each, as drawImpacts spends them
    for (let i = 0; i < B.n; i++) {
      const a = rnd() * Math.PI * 2;
      const sp = 0.55 + rnd() * 1.9;
      const sz = (1 + rnd() * 1.7) * Math.min(1.6, 0.6 + 0.5 * B.scale);
      const d = sp * B.age * (1 - 0.55 * p); // decelerating, like the burst spray
      ctx.fillStyle = i % 3 === 0 ? C.bright : i % 3 === 1 ? C.clay : "#9aa3b2";
      ctx.fillRect(B.x + Math.cos(a) * d - sz / 2, B.y + Math.sin(a) * d - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
  }
}
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
    if (window.Encounter) Encounter.emit("wall", q, undefined, bulletSeat(q.b)); // q carries x/y — the same
                                                     // contact point as the spark — and the bullet, whose
                                                     // seat keys the throttle the way fire's does
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
// bitmap arrives — speaks the card's cursor, stock-key and comet contract, so
// the text stand-in teaches exactly what the art would have. Every other
// screen keeps the copy that describes the mode it is actually in.
//
// ...including the key-thrust gate. Key thrust ships STOCK now (the flag
// defaults true), so the unlocked wordings are what a player normally sees;
// the locked pair survives because keyThrustUnlocked() is still honest state
// a future mode could lower — the wording just no longer points at a shop
// row that no longer exists. The fourth line, "right held: mouse flies ·
// keys aim", stays true either way.
function pauseLines() {
  if (guideEligible()) {
    return ["cursor aims · left fires · wsad fly · qezc add diagonals",
            "hold right for comet · uses energy · fast · invulnerable · ram"];
  }
  const ring = keyThrustUnlocked();
  if (lockedMode()) {
    // the roles, in the same shape mouse mode states them. The lock is how the
    // mode works, not how the game is played, so it is not in the copy. The
    // full stock-key/comet onboarding belongs to the first-run branch above;
    // this later-pause wording focuses on the cursor's swappable role.
    return INVERT
      ? ["use the cursor to aim · click or hold left to fire",
         "right held: mouse flies · release to aim again · esc pauses"]
      : ["mouse motion flies · hold right to aim with the cursor",
         "right held: the cursor aims · left fires · esc pauses"];
  }
  if (mouseMode()) {
    return INVERT
      ? [ring ? "the visible cursor aims · keys thrust · hold right to swap"
              : "the visible cursor aims · hold right to swap",
         "right held: mouse flies · keys aim · left fires · esc pauses"]
      : ["mouse motion flies · keys aim · hold right to swap",
         ring ? "right held: cursor aims · keys thrust · left fires · esc pauses"
              : "right held: cursor aims · left fires · esc pauses"];
  }
  return INVERT
    ? [ring ? "qweasdzxc keys fly the ship · the mouse aims · hold right to swap"
            : "the mouse aims · hold right to fly the ship",
       "left fires · esc releases"]
    : ["mouse motion is thrust — a steady side push carves an arc",
       "hold right to aim — qweasdzxc snaps it · left fires · esc releases"];
}

// ---- the drawn-pose probe --------------------------------------------------
// The latency rig used to read LIVE sim objects and call them "presented":
// a render-only change would move the photons while every rig number held
// still. This record is written by render() itself, from the exact values
// the draw calls receive, so the rig — and the interpolation phase's judder
// metrics — can see what was DRAWN rather than what the sim holds.
// Instrument rules: every field is overwritten in place (the only
// allocation is one struct per newly seen seat, once), nothing here writes
// game state, draws from the seeded stream, or touches a hashed field.
const drawn = {
  seq: 0,   // renders since load — a 0-tick frame still advances it
  tick: 0,  // the local sim clock at the draw (net mode: see pt below)
  pt: -1,   // the presented net clock — filled only while armed, because the
            // one reader (Net.stats) allocates and production must not pay it
  alpha: 1, // RALPHA at the draw: acc/TICK inside the loop, 1 for foreign callers
  camR: { x: 0, y: 0 },                       // the camera the world pass used
  ships: [],                                  // per seat: the pose drawShip received
  enemy: { id: -1, x: 0, y: 0, seen: false }, // the designated body, as drawn
  star: { x: 0, y: 0 },                       // the base camera the star pass scrolled by
  mm: { x: 0, y: 0 },                         // the camera the minimap viewport rect framed
  aim: { seen: false, x: 0, y: 0 },           // the anchor pose the aim marker orbited
};
let PROBE_ENEMY = -1; // -1 = the field's first body; the rig designates by id
let PROBE_PT = false; // armed by the rig only — see drawn.pt
function recordDrawnFrame() {
  drawn.seq += 1;
  drawn.tick = simTick;
  drawn.alpha = RALPHA;
  drawn.pt = PROBE_PT && window.Net && Net.active() ? Net.stats().pt : -1;
  drawn.camR.x = FRAME.cam.x; // the SHADOW camera — the transform the world pass really used
  drawn.camR.y = FRAME.cam.y;
  drawn.aim.seen = false; // drawAim sets it back when the marker draws this frame
  // the designated enemy reads the FRAME view — the exact shadow objects the
  // draw call below (Encounter.draw) receives, so this IS the pose that
  // frame paints; the __test fallback covers a page without a built frame
  const T = window.__test;
  const foes = FRAME.enemies || (T && T.enc ? T.enc.E.enemies : null);
  const e = !foes || !foes.length ? null
    : PROBE_ENEMY < 0 ? foes[0]
      : foes.find((b) => b.id === PROBE_ENEMY) || null;
  drawn.enemy.seen = !!e;
  if (e) { drawn.enemy.id = e.id; drawn.enemy.x = e.x; drawn.enemy.y = e.y; }
}
// ---- the presentation frame ------------------------------------------------
// ONE coherent instant per animation frame: every world-pass body and the
// camera agree about when "now" is. The world advances in whole 60 Hz ticks;
// without this frame every body is quantised to 60 poses per second — a
// 2,2,3 judder at 144 Hz, duplicated and double-stepped frames at 60 Hz.
//
// THE ALPHA SCHEME (phase 4's vt-honesty fix cites this):
//   a = RALPHA = acc/TICK, always in [0, 1) inside this builder.
//   INTERPOLATED bodies — every seat but the local one, enemies, missiles,
//   orbs, bullets — draw lerp(prev, cur, a): the shown instant is
//   (tick − 1) + a, a CONSTANT one-tick delay whose screen motion advances
//   by exactly dt/TICK per frame, which is what kills the judder.
//   The OWN seat and the camera EXTRAPOLATE: cur + vel·a, an estimate of
//   NOW, clamped to the world walls — the own-ship response row has no
//   latency budget left for the interpolation half-tick. The pair shares
//   one treatment so lock mode stays exactly centred (screen = world − cam;
//   only the difference is visible).
//   a === 1 NEVER reaches the shadow branch: RALPHA is 1 only for foreign
//   callers and the clamped catch-up frame, and both take the LIVE branch —
//   the whole frame degenerates to today's draw exactly (every body at cur,
//   zero lead, camR == cam), which is what the phase-1 pins require.
//
// The caches are EXTERNAL and identity-keyed (the trails-Map idiom): in net
// mode apply() rebuilds the presented world every tick, so a prev-pose field
// written onto a body is destroyed with it. They are draw-side data — rolled
// once per sim tick from frameBody's tick loop, never from present(),
// apply() or any sim function; nothing here writes sim or presented state,
// draws from the seeded stream, or reads a wall clock.
const alerpR = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k; // game.js's own copy — a linear lerp of an angle pops at ±π
const PRES_SNAP = 28; // px — the displacement guard: clear of a hard dash,
                      // under any real teleport, so a respawn or restart
                      // crosses in ONE presented frame (row 4's bar)
// ---- the CUT verdict, forwarded to the light layer ------------------------
// PRES_SNAP is the ONE displacement predicate on this screen now. It used to
// have a rival: js/fx.js carried its own TELEPORT of 80 px, measured per
// FX.advance FRAME rather than per sim tick, so a hop between the two — 28 to
// 80 px — was CUT by the presentation frame and BRIDGED by the wake. The wake
// drew a line the ship never flew, straight through the gap the snap had just
// refused to smear.
//
// The two windows are genuinely different, and no choice of constant closes
// that: one FX.advance covers n coalesced ticks and legitimately sees n times
// a tick's displacement, so a per-frame threshold is either deaf on a slow
// frame or trigger-happy on a fast one. So the VERDICT travels instead of the
// number. capturePresent already computes the per-tick answer for every seat;
// each cut is latched here, and the light layer takes and clears the latch on
// its own clock. A frame that swallowed five ticks inherits every cut inside
// it, exactly once, and a frame that swallowed none inherits nothing.
const PRES_CUT = [];
const presTakeCut = (seat) => {
  const c = PRES_CUT[seat] === true;
  PRES_CUT[seat] = false;
  return c;
};
const PRES = {
  serial: 0,     // capture ticks — the seen-stamp the sweep prunes against
  maxId: 0,      // highest entity id ever captured — ids are monotonic and
                 // never reused, so a NEW body wearing an id at or below
                 // this is an ID-SPACE RESET (restart set nextEntityId back
                 // to 1) and every id-keyed cache clears rather than let the
                 // next entity 1 inherit the dead one's pose
  camSeeded: false,
  cam: { px: 0, py: 0, cx: 0, cy: 0 },
  ships: new Map(),    // seat -> {px,py,cx,cy,seen}
  enemies: new Map(),  // id -> {px,py,cx,cy,pf,cf,pl,cl,mode,seen}
  missiles: new Map(), // id -> {px,py,cx,cy,seen}
  orbs: new Map(),     // id -> {px,py,cx,cy,seen}
  bullets: new Map(),  // id -> {px,py,cx,cy,seen}
};
// roll one id-keyed record: new id → appear AT the current pose (never lerp
// from zero); a displacement above the guard snaps prev to cur (hard cut)
function presRoll(map, id, x, y) {
  let r = map.get(id);
  if (!r) { r = { px: x, py: y, cx: x, cy: y, snap: true, seen: 0 }; map.set(id, r); }
  else {
    r.px = r.cx; r.py = r.cy;
    r.cx = x; r.cy = y;
    r.snap = Math.abs(x - r.px) > PRES_SNAP || Math.abs(y - r.py) > PRES_SNAP;
    if (r.snap) { r.px = x; r.py = y; }
  }
  r.seen = PRES.serial;
  if (id > PRES.maxId) PRES.maxId = id;
  return r;
}
function presSweep(map) { // id missing from the current tick → gone at once: no one-frame corpse
  for (const [id, r] of map) if (r.seen !== PRES.serial) map.delete(id);
}
const presIdReset = (list, map) => {
  for (const o of list) { const id = o.id | 0; if (id > 0 && id <= PRES.maxId && !map.has(id)) return true; }
  return false;
};
function capturePresent() {
  PRES.serial += 1;
  cometPresTick(); // the comet presentation machine rides the SAME per-tick
                   // boundary as the pose caches — one tick, one advance, and
                   // never a wall clock (see the owner block above)
  // the camera's own per-tick prev/cur — updateCamera (or a frozen hold) has
  // already settled cam for this tick
  const c = PRES.cam;
  if (!PRES.camSeeded) { c.px = c.cx = cam.x; c.py = c.cy = cam.y; PRES.camSeeded = true; }
  else {
    c.px = c.cx; c.py = c.cy;
    c.cx = cam.x; c.cy = cam.y;
    // the camera's OWN guard sits far above the body guard: a flip-mode room
    // slide legitimately moves ~50 px per tick and must stay smooth, while a
    // respawn recentre (world-scale) still hard-cuts
    if (Math.abs(c.cx - c.px) > 200 || Math.abs(c.cy - c.py) > 200) { c.px = c.cx; c.py = c.cy; }
  }
  // ships, keyed by seat — players[] mutates in place but the SEAT is the identity
  for (const P of players) {
    const had = PRES.ships.has(P.id);
    const r = presRoll(PRES.ships, P.id, P.ship.x, P.ship.y);
    // a FIRST sighting is not a cut. presRoll marks a new record snap so it
    // appears AT its pose rather than lerping from zero, but there is no prior
    // pose for a wake to bridge and no ring to cut — only a displacement
    // verdict is worth forwarding.
    if (had && r.snap) PRES_CUT[P.id] = true;
  }
  presSweep(PRES.ships);
  // the encounter's bodies and the bullets share ONE id space — the reset
  // check runs across all four lists before any of them rolls
  const m = window.Encounter && Encounter.mapState ? Encounter.mapState() : null;
  const foes = m ? m.enemies : null;
  const miss = m ? m.missiles : null;
  const orbs = m ? m.orbs : null;
  if ((foes && presIdReset(foes, PRES.enemies)) || (miss && presIdReset(miss, PRES.missiles)) ||
      (orbs && presIdReset(orbs, PRES.orbs)) || presIdReset(G.bullets, PRES.bullets)) {
    PRES.enemies.clear(); PRES.missiles.clear(); PRES.orbs.clear(); PRES.bullets.clear();
    PRES.maxId = 0;
  }
  if (foes) for (const e of foes) {
    const r = presRoll(PRES.enemies, e.id, e.x, e.y);
    // facing rolls with the pose; a guard snap or a MODE boundary hard-cuts
    // the angles too (bodyAngle switches source fields at the boundary — a
    // lerp across it would spin the hull through poses the sim never held)
    if (r.mode === undefined || r.snap || r.mode !== e.mode) { r.pf = r.cf = e.face; r.pl = r.cl = e.lockA; }
    else { r.pf = r.cf; r.cf = e.face; r.pl = r.cl; r.cl = e.lockA; }
    r.mode = e.mode;
  }
  if (foes) presSweep(PRES.enemies);
  if (miss) {
    for (const b of miss) {
      const r = presRoll(PRES.missiles, b.id, b.x, b.y);
      // the heading rolls with the pose — a velocity heading steps once per
      // tick exactly like an enemy facing, so it gets the same pf/cf idiom
      // (alerpR at draw); a new id or a guard snap hard-cuts the angle too
      if (typeof b.vx === "number" && typeof b.vy === "number") {
        const h = Math.atan2(b.vy, b.vx);
        if (r.ph === undefined || r.snap) { r.ph = r.ch = h; }
        else { r.ph = r.ch; r.ch = h; }
      }
    }
    presSweep(PRES.missiles);
  }
  if (orbs) { for (const o of orbs) presRoll(PRES.orbs, o.id, o.x, o.y); presSweep(PRES.orbs); }
  for (const b of G.bullets) if ((b.id | 0) > 0) presRoll(PRES.bullets, b.id, b.x, b.y);
  presSweep(PRES.bullets);
}
// the frame VIEW the render pass reads at its choke points — one coherent
// object per frame, never `rpx || x` sprayed through the draw path. In live
// mode the arrays ARE the live arrays (zero copies, today's draw exactly).
const FRAME = { live: true, cam: { x: 0, y: 0 }, ships: [],
                enemies: null, missiles: null, orbs: null, bullets: null };
let FRAME_BYPASS = false; // draw-side test seam: forces the live branch so the
                          // judder metric can demonstrate the BEFORE state
// the own seat leads only while a velocity worth leading with exists: the
// net predictor's (predOn — hardSnap on own death/respawn and predReset on
// an identity change both drop it, so a dead ship's momentum never draws),
// or the local sim's while the seat is alive
function ownLeadOn(s) {
  const N = window.Net;
  if (N && N.active && N.active()) return !!(N.predicted && N.predicted());
  return seatAlive(s);
}
function buildFrameView() {
  const m = window.Encounter && Encounter.mapState ? Encounter.mapState() : null;
  const liveB = RALPHA === 1 || FRAME_BYPASS;
  // the vt-honesty report (phase 4): the LOOP's render tells net.js the
  // presented instant this frame draws for the remote bodies, per the alpha
  // scheme above — interpolated bodies at lerp(prev, cur, a), a live-branch
  // frame at the applied world itself. The next input stamp reads it back
  // (js/net.js clientTick). Foreign renders don't pass LOOP_RENDER, so a
  // probe's alpha-1 repaint can never claim the player saw the current tick.
  // The noteDrawn presence check is the mapState idiom: a suite's minimal
  // Net stub may not carry the hook, and a page without it has no stamp to feed.
  if (LOOP_RENDER && window.Net && Net.active() && Net.noteDrawn) Net.noteDrawn(liveB ? 1 : RALPHA, liveB);
  if (liveB) {
    FRAME.live = true;
    FRAME.cam.x = cam.x;
    FRAME.cam.y = cam.y;
    FRAME.ships.length = players.length;
    for (const P of players) FRAME.ships[P.id] = P.ship;
    FRAME.enemies = m ? m.enemies : null;
    FRAME.missiles = m ? m.missiles : null;
    FRAME.orbs = m ? m.orbs : null;
    FRAME.bullets = G.bullets;
    return;
  }
  const a = RALPHA; // in [0, 1) — see the alpha scheme above
  FRAME.live = false;
  const s = localSeat();
  const lead = ownLeadOn(s);
  FRAME.ships.length = players.length;
  for (const P of players) {
    const r = PRES.ships.get(P.id);
    if (!r) { FRAME.ships[P.id] = { x: P.ship.x, y: P.ship.y }; continue; } // uncaptured — appear at current
    FRAME.ships[P.id] = P.id === s && lead
      ? { x: Math.max(SHIP_R, Math.min(WW - SHIP_R, r.cx + P.vel.x * a)),
          y: Math.max(SHIP_R, Math.min(WH - SHIP_R, r.cy + P.vel.y * a)) }
      : { x: r.px + (r.cx - r.px) * a, y: r.py + (r.cy - r.py) * a };
  }
  // the shadow camera. Lock mode derives it FROM the own view pose — the
  // sacred pair moves as one, so the ship sits EXACTLY centred; every other
  // mode extrapolates the camera's own per-tick delta with the same a. Both
  // wear clampCam's world bound. `cam` itself is NEVER written here: the
  // input path (lcurWorld, refreshPointerWorld) reads it every client tick.
  const own = FRAME.ships[s];
  let rx, ry;
  if (CAMMODE === "lock" && own) { rx = own.x - FW / 2; ry = own.y - FH / 2; }
  else if (PRES.camSeeded) {
    const c = PRES.cam;
    rx = c.cx + (c.cx - c.px) * a;
    ry = c.cy + (c.cy - c.py) * a;
  } else { rx = cam.x; ry = cam.y; }
  FRAME.cam.x = Math.max(0, Math.min(WW - FW, rx));
  FRAME.cam.y = Math.max(0, Math.min(WH - FH, ry));
  // the world bodies: pose-shadowed SHALLOW COPIES of the live objects — the
  // per-type draw functions read them unedited, and predX/predY/predT (the
  // radar's held historical ping) pass through untouched
  FRAME.enemies = m ? m.enemies.map((e) => {
    const r = PRES.enemies.get(e.id);
    if (!r) return e;
    const c = Object.assign({}, e);
    c.x = r.px + (r.cx - r.px) * a;
    c.y = r.py + (r.cy - r.py) * a;
    if (typeof c.face === "number" && typeof r.cf === "number") c.face = alerpR(r.pf, r.cf, a);
    if (typeof c.lockA === "number" && typeof r.cl === "number") c.lockA = alerpR(r.pl, r.cl, a);
    return c;
  }) : null;
  const shadowXY = (map) => (o) => {
    const r = map.get(o.id);
    if (!r) return o;
    const c = Object.assign({}, o);
    c.x = r.px + (r.cx - r.px) * a;
    c.y = r.py + (r.cy - r.py) * a;
    return c;
  };
  // missiles carry one extra view-only field: headR, the interpolated nose
  // heading — the draw rotates by it instead of atan2(vy, vx), whose per-tick
  // steps are exactly the judder this frame exists to kill. Never on a sim
  // object, never hashed; a copy without a rolled heading simply omits it and
  // the draw falls back to the live atan2.
  FRAME.missiles = m ? m.missiles.map((o) => {
    const r = PRES.missiles.get(o.id);
    if (!r) return o;
    const c = Object.assign({}, o);
    c.x = r.px + (r.cx - r.px) * a;
    c.y = r.py + (r.cy - r.py) * a;
    if (typeof r.ch === "number") c.headR = alerpR(r.ph, r.ch, a);
    return c;
  }) : null;
  FRAME.orbs = m ? m.orbs.map(shadowXY(PRES.orbs)) : null;
  FRAME.bullets = G.bullets.map(shadowXY(PRES.bullets));
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
  buildFrameView(); // ONE coherent instant — the world pass reads FRAME and nowhere else
  if (window.FX) FX.nebula(FRAME.cam); // the ONE base-ink effect: behind the starfield,
                                       // baked per SEED, deterministic per state, and
                                       // parallaxed off the PRESENTED camera like the stars
  drawStars(); // sets per-layer fractional-camera transforms off FRAME.cam (phase 4)
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  ctx.translate(-FRAME.cam.x, -FRAME.cam.y);
  recordDrawnFrame(); // the camera transform is set — record what this frame draws
  ctx.strokeStyle = C.wall;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, WW - 1, WH - 1); // the world border
  if (window.Encounter) Encounter.draw(ctx, FRAME); // enemies, orbs, telegraphs — under the camera, below the ship
  drawFlame();
  // every seat's ship draws; only seat 0 (the local pilot) wears the flame,
  // and a comet-mode seat wears its glow under the hull
  for (const P of players) {
    // cometView owns the seat's comet STATE — its CONFIRMED phase is the wire
    // flag by construction — while presentedPool hands in the pool FRACTION,
    // predicted for the local net seat, so the halo sizes off the stick and
    // exists off the authority
    const cv = cometView(P.id, presentedPool(P.id));
    const vp = FRAME.ships[P.id] || P.ship; // the frame's pose for this seat
    if (cv.phase) drawCometGlow(P, cv, vp); // the glow rides the frame pose too
    let ds = drawn.ships[P.id]; // the probe: record the exact pose the call gets
    if (!ds) ds = drawn.ships[P.id] = { seat: P.id, x: 0, y: 0 };
    ds.x = vp.x;
    ds.y = vp.y;
    drawShip(vp.x, vp.y, P.id); // ...and its damage, its hit reaction, or
                                        // its wreck — see drawShip; the seat id is
                                        // what lets it read THIS seat's wire record
  }
  ctx.fillStyle = C.bright; // CQ pixel bullets — read off the frame view
  for (const b of FRAME.bullets || G.bullets) {
    if (b.dead || b.spent) continue; // consumed or expired — the next sweep removes it
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r || 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // the SPECULATIVE tracers — net mode only, render-side, never in G.bullets:
  // a fired cue flies as a slightly dimmer round with a short trail and a
  // two-frame muzzle glow at the nose it left, until the authoritative own
  // bullet takes over (js/net.js owns the hand-off) or the cue fades unmet
  if (window.Net && Net.active() && Net.tracers) drawTracers(Net.tracers());
  drawImpacts(); // world pass — under the camera, over the bullets that made them
  drawShipBlasts(); // ...and the ship deaths OVER those: a hull going up is the
                    // loudest thing on the field for the second it lasts
  if (G.running) drawAim();
  if (window.FX) FX.composite(FRAME); // the light layer, over the world pass and
                                 // under the HUD — still inside the field clip
  // UI PASS — the letterbox transform without the camera
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  // one read of the card gate, so the map, the copy and the art cannot
  // disagree inside a single frame
  const guide = guideShown();
  // The encounter no longer suppresses anything: the layer that used to swallow
  // this map's frame — a row's opaque explainer bitmap — is gone, and the
  // hovered-row panel that replaced it is laid out in the CHANNEL between the
  // map and the top-left status stack, so it overlaps neither and the pair of
  // Encounter.hudSuppressed()/ringCardShown() reads went with the art.
  if (MINIMAP && !guide) drawMinimap(); // the first-run card still keeps one hierarchy — see guideShown()
  if (window.Encounter) Encounter.drawHud(ctx, FRAME); // encounter HUD and overlays — screen
                                                       // space; the frame rides along for the
                                                       // trackers that convert world → screen
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
  // GUTTER PANELS — device space, outside the field transform and its clip.
  // Presentation only, and behind the PANELS lever; they draw only once a
  // session has started, so the first-run screen keeps its one hierarchy.
  if (panelsOn() && G.started) {
    const spec = Encounter.panelSpec();
    const ps = panelPlace(spec.shop, "left");
    if (ps) {
      ctx.setTransform(ps.k, 0, 0, ps.k, ps.x0, ps.y0);
      // ps.k / dpr is CSS px per LOGICAL panel unit — the one presentation
      // scalar the shop's type is allowed to see, and its whole argument list
      // (see the block above). The shop's prose cut rides this, not
      // panelCompact(); the leaderboard below still takes the flag.
      Encounter.drawShopPanel(ps.k / dpr);
    }
    const pb = panelPlace(spec.board, "right");
    if (pb) {
      ctx.setTransform(pb.k, 0, 0, pb.k, pb.x0, pb.y0);
      Encounter.drawBoard(panelCompact());
    }
  }
  // the drawn pointer, OUTSIDE the field clip and over the panels: locked
  // mode's cursor may rest on the shop column, and a clipped cursor would
  // vanish exactly where the shop needs it
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  drawLockedCursor();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
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
    // termChange is a marker for the wire/predictor, never a cue — the same
    // skip the encounter's own headless drain keeps. The seat rides along: the
    // audio layer keys its throttle per seat, and a drain that dropped the
    // field it is already holding would put four players back on one gap.
    if (ev.kind !== "termChange" && window.Sfx) Sfx.cue(ev.kind, ev.at, ev.gain, ev.seat);
    // ...and the one VISUAL the drain owes: a seat's hull going up. It rides
    // here rather than inside the sim because it is decoration — the same
    // reason js/net.js spawns its bursts in fireEvents() instead of pretending
    // the wire carried them. `at` is the dying ship's position, `seat` the
    // seat that paid, both already on the event and both already on the wire.
    if (ev.kind === "death" && ev.at) spawnShipBlast(ev.at.x, ev.at.y, ev.seat | 0);
    noteCometCue(ev.kind, ev.seat); // the comet instrument's hurt half — see
                                    // noteCometCue; js/net.js's fireEvents
                                    // carries the same call for net mode
    // ...and the light layer, a SECOND consumer of the same bus. The termChange
    // skip above is a conjunct on the Sfx statement, not a loop continue, so
    // this carries its own.
    if (ev.kind !== "termChange" && window.FX) FX.cue(ev);
  }
}
let raf = 0;
let looping = false;
let last = 0;
let acc = 0;
let frameDt = 0; // the last frame's clamped delta — read by the loop checks,
                 // written once per frame, never by anything else
// The render alpha: acc/TICK for the frame loop's OWN render call, and 1 for
// every foreign caller — the parse-time paint, resize repaints, the pixel
// probes and every suite's direct render(). frameBody() sets it around its
// one render and puts 1 back, so a foreign call can only ever see 1 and
// draws pure current state by construction. Nothing draws through it yet:
// the interpolation phase is the consumer; today only the drawn-pose probe
// records it.
let RALPHA = 1;
// True only around frameBody's OWN render call. It gates the view-tick report
// (buildFrameView → Net.noteDrawn): a foreign render — a pixel probe, a resize
// repaint, a suite's direct render() — draws at alpha 1 but is NOT what stands
// on screen between loop frames, so it must not overwrite the record the next
// input stamp reads.
let LOOP_RENDER = false;
// The rAF body, extracted from loop() so a suite can drive it with SYNTHETIC
// timestamps — no rAF, no wall clock, same statements in the same order.
// Returns the number of sim ticks this frame ran (the rAF wrapper ignores
// it; the characterization checks count on it).
function frameBody(now) {
  const dt = Math.min(now - last, 200);
  frameDt = dt;
  last = now;
  acc += dt;
  let n = 0;
  while (acc >= TICK && n < 5) {
    // NET MODE is the one fork in the loop, and it is an INPUT fork, not a
    // draw fork: the net tick banks the same accumulator, queues the frame
    // upstream, and writes the interpolated snapshot into the very state the
    // draw pass below already reads. The local sim never steps in net mode.
    if (window.Net && Net.active()) Net.clientTick();
    else clientStep(); // bank at the boundary, then the camera-free sim tick
    // the render-side camera follows each played tick, OUTSIDE step(): the sim
    // never reads the view. Frozen overlays hold it still, exactly as step()'s
    // early return used to, and a paused loop never runs it — no resume jump.
    if (!(window.Encounter && Encounter.frozen())) updateCamera();
    refreshPointerWorld(); // the camera moved — the stored aim point rides along
    drainCues(); // per step — see drainCues for why never per frame
    capturePresent(); // roll the render caches at the tick boundary — the ONE capture point
    acc -= TICK;
    n++;
  }
  // A slow RAF may run up to five net ticks synchronously. Net.clientTick()
  // banks each one, but the wire flush happens once per RAF so the server's
  // two-frame admission window cannot discard the tail of that catch-up.
  if (window.Net && Net.active()) Net.flushInputs();
  if (acc > TICK) acc = TICK; // drop backlog beyond one tick — slow frames slow the sim, never fast-forward it
  if (window.FX && n) FX.advance(n); // the light layer ages on the SIM clock —
                                     // never inside render(), which has sixteen callers
  RALPHA = acc / TICK; // after the clamp, so a caught-up frame draws alpha 1 — current truth
  LOOP_RENDER = true;  // this render is the frame the player will be looking at
  render();
  LOOP_RENDER = false;
  RALPHA = 1; // foreign render callers always draw pure current state
  return n;
}
function loop(now) {
  if (!looping) return;
  frameBody(now);
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
  refreshPointerWorld(); // the aim source changed — re-store its world point
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
  // ...and the name editor, which the render above cannot take away: it is
  // canvas state, and a paused screen draws no further frames to show it with.
  // It COMMITS rather than cancelling — the player typed those letters, and a
  // pause is not a retraction. This is the only close a player does not perform
  // by hand, and it is why nothing else may hide the editor: the old DOM field
  // committed on every blur, and its blur came off a per-frame visibility flag,
  // so a wave clear or a granted seat sent half a name.
  if (window.Net && Net.closeNameEdit) Net.closeNameEdit(true);
}
// A lock request can fail (Chrome's ~1.3s post-Escape cooldown, automation,
// no API at all). Push mode cannot run without it, so only that caller pauses
// after both the raw and standard requests fail. Mouse mode asks for the
// standard lock directly: rejecting a raw request can consume the one user
// gesture its fallback needs, while standard lock still gives unbounded deltas.
// (The modal shop's claim on the pointer is gone with the modal shop: the
// panel shop lives in the gutter and takes clicks in every mode — locked
// mode through its drawn cursor, the rest through the native one — so no
// screen needs the lock refused on its behalf any more.)
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
  const wasMouseAim = cursorAim() && aiming();
  G.rightHeld = held;
  // seat 0's comet WANT, synced at the client boundary: event mode has no ring
  // to carry rh (this IS its comet path, mirroring how event mode bypasses the
  // ring everywhere), and in tick mode the very next drained frame re-states it
  // from the banked rh — the sim itself still never reads G.rightHeld. It is
  // the want and not the flag: the button asks, energyStep answers on the next
  // tick, and a seat with an empty pool holds this down for nothing.
  // physically seat 0: the DOM listener layer is a SEAT-0-ONLY producer (one
  // document, one pointer lock — see in0). In net mode the banked frame goes
  // upstream seat-agnostic and the SERVER binds it to this socket's seat, so
  // this write is never the thing that decides whose comet turns on.
  players[0].input.cometWant = !!held;
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
    // the dead overlay (the one freeze left): the click resumes only the
    // loop — combat stays frozen, and R is the way on. Lock-dependent modes
    // re-arm their pointer lock here, so an R-restart after this resume
    // lands with working flight controls.
    G.running = true;
    syncCursor();
    if (lockedMode()) requestLock(true, false); // the session's one (standard) lock
    else if (!mouseMode()) requestLock();
    else if (!aiming()) requestLock(false, false);
    blurPanels(); // the overlay keys live on document — nothing may be holding them
    syncTuner();
    startLoop();
    return;
  }
  if (!G.started) {
    G.started = true;
    players[0].vel = { x: 0, y: 0 }; // the LOCAL SIM's seat, deliberately not
                                     // localPlayer(): this is local play's
                                     // start-from-rest, and in net mode there
                                     // is no local sim — the wire overwrites
                                     // every velocity on the next apply().
                                     // The one whole-object write a moved
                                     // field keeps
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
  // The gutter panels own their own clicks: a click in the shop column buys
  // (or misses) THERE and never falls through to fire() or a pointer-lock
  // request; the board renames THIS client and eats the rest of its bar's
  // clicks. Locked mode's pointer is the drawn cursor; every other mode
  // converts the native event — and the drawn cursor is the whole reason the
  // name affordances live on the canvas: it is the only pointer that still
  // works while resume() holds the session's pointer lock.
  {
    const d = lockedMode() ? lcurDevice() : pointerDevice(e.clientX, e.clientY);
    const pp = d && panelAt(d.x, d.y);
    if (pp) {
      if (pp.panel === "shop" && e.button === 0 && window.Encounter) Encounter.shopClick(pp.x, pp.y);
      // ...and the board has ONE target now: this client's own row opens the
      // name editor. It still eats the rest of its bar's clicks.
      else if (pp.panel === "board" && e.button === 0 && window.Encounter) Encounter.boardClick(pp.x, pp.y);
      return;
    }
    // The claim card's name box is a FIELD target, not a gutter one, so it is
    // tested here rather than through panelAt — same drawn cursor, same press,
    // one transform further in. It is tested BEFORE the pointer-lock re-arm and
    // before inputFire() below, because both of those used to swallow it: a
    // press aimed at the old DOM box became the seat CLAIM and took the card
    // away.
    if (d && e.button === 0 && window.Encounter && Encounter.nameCardClick &&
        Encounter.nameCardClick((d.x - ox) / scale, (d.y - oy) / scale)) return;
    // ...and every OTHER press ends an open edit instead of stranding it. The
    // editor swallows the keyboard while it is open, exactly as the old field
    // did once Tab had focused it — the difference is that this one can always
    // be closed by clicking somewhere, which is the gesture a player already
    // reaches for. It commits, for the same reason pause() does.
    if (window.Net && Net.closeNameEdit) Net.closeNameEdit(true);
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
    inputFire();
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
// The name editor is canvas state in js/net.js. While it is open the keyboard
// belongs to it and not to the ship: its own capture-phase listener stops the
// bubble on every key it takes, and this is the second half of that guard, for
// a key it declines and for a handler added later. Both halves are wanted — the
// deleted DOM field's own leak leg only reddened when BOTH of its guards were
// gone, and that redundancy is what survived every refactor since.
const typingName = () => !!(window.Net && Net.typing && Net.typing());
document.addEventListener("keydown", (e) => {
  if (typingName()) return;
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
  // Deliberately instant: key aim-snap is client-local here and a candidate for a later pass.
  const P = localPlayer(); // the client's own aim state — see localSeat()
  const m = Math.hypot(d[0], d[1]);
  P.aimAngle = Math.atan2(d[1], d[0]);
  P.aimOff.x = (d[0] / m) * AIM_R; // keep the push model in step
  P.aimOff.y = (d[1] / m) * AIM_R;
  P.aimed = true;
});
document.addEventListener("keyup", (e) => G.keys.delete(e.code));
// ...and NOT guarded by typingName: a key released while the editor is open must
// still leave G.keys, or a key held before the click stays held forever. The
// keydown guard is what keeps anything from entering that set in the first
// place, so clearing is only ever safe.
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
function trackMouse(e) {
  if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return;
  G.mouse.x = e.clientX;
  G.mouse.y = e.clientY;
  G.mouse.seen = true;
  refreshPointerWorld(); // the pointer moved — its stored world point follows
}
document.addEventListener("mousemove", (e) => {
  // the shop panel's hover, ahead of flight and never instead of it: the
  // pointer may cross the gutter mid-maneuver, and every flight path below
  // keeps its own gates. Mouse-family modes convert the native event here;
  // locked mode reads its drawn cursor after the cursor moves, below.
  if (!lockedMode() && G.running && window.Encounter && Encounter.shopHover) {
    const d = pointerDevice(e.clientX, e.clientY);
    const pp = d && panelAt(d.x, d.y);
    if (pp && pp.panel === "shop") Encounter.shopHover(pp.x, pp.y);
    else Encounter.shopHover(-1e9, -1e9); // off the panel — the same call clears it
  }
  if (lockedMode()) { // never trackMouse here — the frozen client coordinates would poison the mirror
    if (!locked() || !G.running) return;
    if (aiming()) {
      inputCursor(e.movementX, e.movementY); // deltas move the drawn cursor...
      hoverFromLcur();                       // ...and the panel hover reads it
    } else inputThrust(e.movementX, e.movementY); // the role swap flies the ship
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
    ? "Ship playground — the cursor aims; W A S D flies and Q E Z C add diagonals; left fires; hold right for energy-powered comet mode: fast, invulnerable, and able to ram enemies; Escape pauses"
    : mouseMode()
    ? INVERT
      ? "Ship playground — the visible pointer aims; W A S D flies and Q E Z C add diagonals; left fires; hold right for energy-powered comet mode: fast, invulnerable, and able to ram enemies; Escape pauses"
      : "Ship playground — mouse motion flies and QWE/ASDZXC aims; left fires; hold right to aim with the visible pointer and engage energy-powered comet mode; Escape pauses"
    : "Ship playground — relative push controls use pointer lock; QWE/ASDZXC flies while the mouse aims; left fires; hold right for energy-powered comet mode; Escape releases pointer lock");
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
  out("aimmode-out", AIMDESC[AIMMODE]); // push has no option, but a code-set mode still reads out
  out("aimdist-out", AIMDIST + " px to " + (cursorAim() ? "triangle" : "target")); // locked draws the triangle too — only push rings a target
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
  out("pvp-rewind-out", PVPREWIND === 0 ? "0 — shots hit only where players ARE now" :
    PVPREWIND + " ms · a shot may hit where a player WAS up to " +
    Math.floor(PVPREWIND / TICK) + " ticks ago");
  // the comet tab — what the right-hold mode does, and what it costs the pool
  out("comet-acc-out", COMETACC.toFixed(1) + "× accel while comet is on");
  out("comet-turn-out", COMETTURN.toFixed(1) + "× turn while comet is on");
  out("comet-vmax-out", COMETVMAX.toFixed(2) + "× top speed · " + (VMAX * COMETVMAX).toFixed(1) + " px/tick at the base cap");
  out("comet-dmg-out", COMETDMG.toFixed(1) + " damage per comet touch · a bullet deals " + BDMG);
  out("comet-drain-out", COMETDRAIN.toFixed(2) + " energy/tick · " +
    (COMETDRAIN > 0 ? (ENMAX / COMETDRAIN * TICK / 1000).toFixed(1) + " s of hold at the base pool" : "free"));
  out("comet-hit-out", COMETHIT === 0 ? "0 — the comet is priced by time, not by work"
    : COMETHIT.toFixed(1) + " energy per ram or negated hit");
  out("comet-thr-out", COMETTHR === 0 ? "0 — flat drain, a coasting comet costs the same"
    : "+" + COMETTHR.toFixed(1) + " energy per unit of thrust applied");
  out("comet-aoe-out", COMETAOE + " px of halo at a full pool · drawn only");
  out("comet-aoedmg-out", COMETAOEDMG === 0 ? "0 — the comet stays a pure body ram"
    : "+" + COMETAOEDMG + " px of damage reach at a full pool");
  out("comet-fury-out", "+" + Math.round(COMETFURY * 100) + "% comet damage per OVERLOAD rank at an empty pool");
  out("comet-cd-out", COMETCD + " ticks · " + (COMETCD * TICK / 1000).toFixed(2) + " s between COMET touches on one body");
  out("pvp-orbs-out", PVPORBS === 0 ? "0 — a death pays no bounty" :
    PVPORBS + " orb" + (PVPORBS === 1 ? "" : "s") + " dropped where a seat dies · " +
    PVPORBS + " XP to whoever banks them");
  // the energy tab — the pool itself, which the comet is only the first to spend
  out("energy-max-out", ENMAX + " base pool · " + Math.round(ENMAX * (1 + ENCELL * 4)) + " with four ENERGY CELLs");
  out("energy-regen-out", ENREGEN.toFixed(1) + " per tick · " + (ENREGEN * 1000 / TICK).toFixed(0) + " per second");
  out("energy-delay-out", ENDELAY + " ticks after the last spend · " + (ENDELAY * TICK / 1000).toFixed(2) + " s");
  out("energy-arm-out", Math.round(ENARM * 100) + "% of the cap to START a comet · a running one burns to zero");
  out("energy-orb-out", ENORB === 0 ? "0 — salvage fills the wallet only" : "+" + ENORB + " energy per orb collected");
  out("energy-cell-out", "+" + Math.round(ENCELL * 100) + "% of the base pool per ENERGY CELL rank");
  out("energy-rech-out", "+" + Math.round(ENRECH * 100) + "% recharge rate per RECHARGER rank");
  // the audio tab. Every control here carries a live readout — the mute
  // checkbox states a STATE, not a rule, so unlike autofire it earns a live
  // line — and the audition row's readout is Sfx.state()'s ready-made string:
  // audio.js formats its own internals, this file only prints them.
  out("sfxvol-out", Math.round(SFXVOL * 100) + "% master · gain " + // the number is audio.js's: state().gain
    (window.Sfx ? Sfx.state().gain.toFixed(3) : "—"));             // is the one copy of the curve
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
      // phase 12: EVERY enemy row is sim-affecting, and the net client's
      // presentation now reads these constants too — statsFor() supplies the
      // overshoot guard's per-class ceiling. A locally dragged maxSpeed would
      // silently widen or throttle the guard against a server running the file
      // defaults, so the whole generated tab joins NET_LOCKED_IDS. The tab is
      // built rather than authored, so it registers its own ids and carries its
      // own gate instead of going through bind().
      NET_LOCKED_IDS.add(id);
      input.addEventListener("input", () => {
        if (NET_LOCKED_IDS.has(id) && window.Net && Net.active()) {
          input.value = String(row.get()); // snap the thumb back to the truth
          showEnemyTuner();
          return;
        }
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
// push keeps its entry and its whole code path, but no menu option: locked
// mode covers every case it served, and it is the one mode whose aim cannot
// go local under INPUTLAG (it integrates delayed deltas, with no pointer to
// resolve against). setAimMode("push") still works — the check suites stage
// through it, because its aim is pure state with no cursor or camera in it.
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
// The phase-11 tunables seam: in NET MODE the sim-affecting rows are LOCKED
// to their file defaults. The flight kernel reads these module globals
// directly (the 11a decision), and the own-ship predictor replays through
// the same kernel — a locally dragged VMAX would silently diverge every
// prediction from the server's sim. View, camera, fx and audio rows stay
// live; the ONE gate sits here so no slider needs its own guard.
const NET_LOCKED_IDS = new Set(["vmax", "accel", "turn", "keythrust",
  "wallloss", "cool", "autofire", "bspeed", "bfactor", "bmax", "blife",
  "bounce", "contactcd", "pvp-rewind",
  "comet-acc", "comet-turn", "comet-vmax", "comet-dmg", "comet-drain",
  "comet-hit", "comet-thr", "comet-aoe", "comet-aoedmg", "comet-fury",
  "comet-cd", "pvp-orbs",
  "energy-max", "energy-regen", "energy-delay", "energy-arm", "energy-orb",
  "energy-cell", "energy-rech"]);
function bind(id, set) {
  const c = document.getElementById(id);
  c.addEventListener("input", () => {
    if (NET_LOCKED_IDS.has(id) && window.Net && Net.active()) { showTuner(); return; }
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
bind("aimmode", (v) => { setAimMode(v); }).value = AIMMODE; // two options — AIMSENS left with push's
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
bind("pvp-rewind", (v) => { PVPREWIND = v; }).value = String(PVPREWIND); // phase 15's
                       // player-target rewind cap, in ms; NET-LOCKED like every other
                       // sim-affecting row — a LOCAL rehearsal knob only. In a net session
                       // the server's value moves ONLY via the dev ui:"tune" route.
// the comet tab — local lets with no persistence, like every other tunable.
// Net mode ignores client sliders by design; the server's values rule there.
bind("comet-acc", (v) => { COMETACC = v; }).value = String(COMETACC);
bind("comet-turn", (v) => { COMETTURN = v; }).value = String(COMETTURN);
bind("comet-vmax", (v) => { COMETVMAX = v; }).value = String(COMETVMAX);
bind("comet-dmg", (v) => { COMETDMG = v; }).value = String(COMETDMG);
bind("comet-drain", (v) => { COMETDRAIN = v; }).value = String(COMETDRAIN);
bind("comet-hit", (v) => { COMETHIT = v; }).value = String(COMETHIT);
bind("comet-thr", (v) => { COMETTHR = v; }).value = String(COMETTHR);
bind("comet-aoe", (v) => { COMETAOE = v; }).value = String(COMETAOE);
bind("comet-aoedmg", (v) => { COMETAOEDMG = v; }).value = String(COMETAOEDMG);
bind("comet-fury", (v) => { COMETFURY = v; }).value = String(COMETFURY);
bind("pvp-orbs", (v) => { PVPORBS = v; }).value = String(PVPORBS); // the PvP bounty, on the
                       // comet tab beside the ram that most often collects it; NET-LOCKED like
                       // every other sim-affecting row, so this is a LOCAL rehearsal knob
bind("comet-cd", (v) => { COMETCD = v; }).value = String(COMETCD); // never wired to the
                        // combat tab's contactcd — the split is the whole point of the row
// the energy tab — the pool's own numbers. Moving the cap does NOT top a seat
// up: energyStep re-derives energyMax every tick and clamps into it, so a
// shrink lands the moment the game runs and a growth is earned, not granted.
bind("energy-max", (v) => { ENMAX = v; }).value = String(ENMAX);
bind("energy-regen", (v) => { ENREGEN = v; }).value = String(ENREGEN);
bind("energy-delay", (v) => { ENDELAY = v; }).value = String(ENDELAY);
bind("energy-arm", (v) => { ENARM = v; }).value = String(ENARM);
bind("energy-orb", (v) => { ENORB = v; }).value = String(ENORB);
bind("energy-cell", (v) => { ENCELL = v; }).value = String(ENCELL);
bind("energy-rech", (v) => { ENRECH = v; }).value = String(ENRECH);
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
// step maps to clientStep: a suite drives the CLIENT tick (bank + sim), the
// same entry the frame loop uses — the raw camera-free step() is what a
// headless host imports, and it takes frames, not a local pointer.
window.__test = { G, players, cam, step: clientStep, setCamMode, render, WW, WH, FW, FH,
  updateCamera, leadVec, aiming, fireDir, mouseAimDir, markerDir, cursorHidden, gate, setAimMode, setRightHeld, setInvert,
  // the paused screens: the state, the transitions, and a visibility snapshot.
  // getComputedStyle, never offsetParent — both screens are position:fixed, so
  // offsetParent is null even when they are plainly on screen.
  // the NET LOCK's id set, read-only. Phase 12 put the GENERATED enemy tab
  // behind it — those rows never went through bind(), so they never inherited
  // the phase-11 flight lock — and a test needs to see the set to prove the
  // whole tab is covered rather than one lucky row.
  netLockedIds: () => new Set(NET_LOCKED_IDS),
  ui: { UI, openDev, closeDev, setDevTab, resume, syncMenu: syncMenuWords,
    view: () => ({
      menu: getComputedStyle(pausemenu).display !== "none",
      panel: getComputedStyle(devpanel).display !== "none",
      dev: UI.dev,
      tab: UI.tab,
      running: G.running,
      sections: [...devpanel.querySelectorAll(".tabsec")].map((s) => ({ tab: s.dataset.tab, shown: getComputedStyle(s).display !== "none" })),
    }) },
  setMouseClient: (x, y) => { G.mouse.x = x; G.mouse.y = y; G.mouse.seen = true; refreshPointerWorld(); },
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
  // the SHIP-DEATH blasts: their own list, their own spawn, their own age
  // step and their own reset — separate from the bursts above precisely so
  // the burst-counting checks cannot see them, and reachable here so the
  // damage checks can stage one without killing a seat for real
  shipFx, spawnShipBlast, stepShipFx, resetShipFx,
  shipFxState: () => ({ blasts: shipFx.blasts.length, count: shipFx.count,
    max: SHIPFX_MAX, life: SHIPFX_LIFE }),
  seatHealth, // the one read the ship draw makes — published so a check can
              // assert the draw and the record agree about a seat
  // the damaged-hull look's park switch. Published so section S can prove BOTH
  // halves: that the shipped build draws a hurt seat as the pristine ship, and
  // that the parked draw still works when it is switched back on.
  hullDamageShown: () => SHOW_HULL_DAMAGE,
  setHullDamage: (v) => { SHOW_HULL_DAMAGE = !!v; },
  setFxInt: (v) => { FXINT = v; },
  setFxDur: (v) => { FXDUR = v; },
  // the LIGHT LAYER's two seams: its suppression lever and its counters. Both
  // no-op rather than throw when js/fx.js is absent — the headless sim host
  // loads game.js without it.
  setFx: (v) => { if (window.FX) FX.setOn(v); },
  fxSnapshot: () => (window.FX ? FX.snapshot() : null),
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
  // the UI-space pointer conversion the shop's hit test runs on, and its
  // inverse — so a check can dispatch a REAL mousedown at a known field point
  // (a card's center, the NEXT WAVE button) instead of guessing at pixels, and
  // exercise the whole path from the native event down to the sale
  pointerField,
  fieldToClient, // hoisted to a real function — the locked cursor's mirror shares it
  // the gutter panels: the suppression lever the pixel suites drive, the live
  // fit/collapse answers, and the inverse conversion that lets a check click
  // a REAL card centre through the real mousedown listener
  setPanels: (v) => { PANELS = !!v; },
  panelsOn, panelCompact, panelAt, panelToClient,
  panelPlaceFor: (panel) => {
    if (!window.Encounter || !Encounter.panelSpec) return null;
    const s = Encounter.panelSpec();
    return panelPlace(panel === "shop" ? s.shop : s.board, panel === "shop" ? "left" : "right");
  },
  keyThrustUnlocked, // the ring's thrust gate, read exactly as step() reads it
  cometActive, // the comet flag, read exactly as the encounter reads it
  // the COMET PRESENTATION owner — the record every consumer of the halo, the
  // bloom, the wake and the HUD bar reads, its per-tick advance (the frame
  // loop's own call sits in capturePresent, so a suite driving stepSim must
  // call this itself), and the page-side instrument beside it. The phase
  // constants ride along so a check names them instead of copying 0/1/2.
  cometPres, cometView, cometPresTick,
  cometPhases: () => ({ off: CP_OFF, wind: CP_WIND, live: CP_LIVE,
    windTicks: COMET_WIND_TICKS, flashTicks: COMET_FLASH_TICKS, hold: COMET_WIND_HOLD }),
  cometLog: () => ({ ...COMET_LOG, ring: COMET_LOG.ring.map((e) => ({ ...e })) }),
  cometLogReset: () => {
    COMET_LOG.asks = COMET_LOG.confirms = COMET_LOG.retracts = COMET_LOG.pops = 0;
    COMET_LOG.hurtWind = COMET_LOG.hurtLive = COMET_LOG.hurtSkew = 0;
    COMET_LOG.leadSum = COMET_LOG.n = 0;
    COMET_LOG.leadMin = COMET_LOG.leadMax = -1;
    for (const e of COMET_LOG.ring) { e.ask = e.conf = e.lead = -1; e.hurt = 0; }
    clogOpen = -1; clogHurt = 0;
  },
  cometCue: noteCometCue, // the drains' hook, so a check can land a cue inside
                          // a known phase without a wire or an encounter
  pauseLines, // the copy the idle screen would print — the card's text stand-in included
  // locked+tick+lag intentionally mixes the immediate pointer mirror with the
  // delayed simulation direction; consumers must not assert they agree.
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
  // a LENGTH-PREFIXED walk over players[] in ascending seat order — the
  // multi-seat extension the old single-seat comment assigned to exactly
  // this commit. Each seat folds the same eight moved fields in the same
  // order the single-seat hash always folded; the id stays out (identity,
  // not simulation state). The prefix is what makes "one seat" and "two
  // seats whose second is at rest" distinct hashes.
  const h = fnv();
  h.u32(players.length);
  for (const P of players) {
    h.num(P.ship.x); h.num(P.ship.y);
    h.num(P.vel.x); h.num(P.vel.y);
    h.num(P.aimOff.x); h.num(P.aimOff.y);
    h.num(P.aimAngle); h.u32(P.aimed ? 1 : 0);
    h.num(P.cool);
    h.u32(P.comet ? 1 : 0); // comet decides the seat's gains, cap and combat —
                            // simulation state by the allow-list contract
    h.num(P.energy); h.num(P.enIdle); // the pool and its recharge delay: both decide
                                      // what the seat may do next — the allow-list
                                      // contract's own test. energyMax stays OUT: it
                                      // is derived from the hashed shop rank and the
                                      // unhashed sliders, the standing `vcap` deal
    h.num(P.thrustAcc.x); h.num(P.thrustAcc.y);
    h.num(P.flame.x); h.num(P.flame.y);
  }
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
// no camera hash: cam and gate are render-side view state now — the sim
// neither reads nor writes them, so they describe nothing the simulation
// will do next and stay out of the allow-list by the contract above
function hashParts() {
  const enc = window.__test.enc;
  const parts = {
    ship: hashShip().hex(),
    bullets: hashBullets().hex(),
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
  h.str(p.ship); h.str(p.bullets); h.str(p.encounter); h.str(p.rng);
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
      while (simTick < target) { clientStep(); drainCues(); } // the client tick, like the frame loop
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
  // the headless host's seams (server/sim-host.mjs). stepSim is the raw
  // camera-free sim tick — the SERVER's entry: no client boundary, no bank,
  // no camera. pushInputFrame is the REAL producer function, not a wrapper:
  // pushInputFrame(seat, frame) feeds seat s's ring one stored world-point
  // record, exactly the record bankTickInput banks and a wire would deliver.
  // thrustImpulse is the event-mode impulse the mousemove listener applies —
  // the Node golden replay injects the same impulses the browser's
  // dispatched events did, through the same function.
  stepSim: step,
  pushInputFrame,
  thrustImpulse,
  // the claim press, written where the drain writes it. Not a second path:
  // this is the SAME latch a frame's `fp` sets, so a check that presses here
  // and a client that clicks reach the encounter's respawn loop identically.
  // It exists because advance() drives ticks with no frames at all, and the
  // press has to be assertable on ONE named tick.
  pressClaim: (seat) => { const P = players[seat]; if (P) P.input.claimPress = 1; },
  FRAMES_PER_TICK, // the ONE frames-per-tick lid — server admission, the sim
                   // drain and the predictor's replay all read this value
  presentedPool,   // the net-mode presentation accessor, for checks
  // the presentation caches' own per-tick roll. The frame loop calls it once
  // per sim tick; a suite that drives FX.advance directly has to call it too,
  // because the light layer's cut verdict is FORWARDED from here now and a
  // layer driven with no capture behind it would never see one.
  capturePresent,
  presTakeCut,     // ...and the latch itself, so a check can name the verdict
  // the FLIGHT KERNEL itself — the pure per-seat slices, so a check (and
  // phase 11b's predictor) can run them against a DETACHED kernel state
  // rather than re-implementing the flight arithmetic
  Flight,
  // the seat controls: the count writer sim-host's startMatch drives, and
  // the per-seat fire-direction resolver the wire encoder reads
  setPlayerCount,
  fireDirFor,
  localSeat, // the view/sim boundary, for the suites: 0 unless Net grants otherwise
  seatless,  // ...and the fact its fold destroys, published on the same ground:
             // whether this client holds a seat AT ALL is a predicate question,
             // and the card table drives the real predicate rather than
             // inferring it from a seat id that reads 0 in both cases
  localPlayer,
  // the flight constants beside enc.tunables() — the fixture records both, so
  // a future failure is diagnosable as "the constants moved" vs "the code moved"
  flightTunables: () => ({ VMAX, ACCEL, TURN, FLICK, DAMP, KEYTHRUST, WALLLOSS,
                           COMETACC, COMETTURN, COMETVMAX,
                           COMETDRAIN, COMETHIT, COMETTHR, COMETAOE, COMETAOEDMG, COMETFURY,
                           ENMAX, ENREGEN, ENDELAY, ENARM, ENORB, ENCELL, ENRECH }),
  // the ENERGY pool's whole API, so a check drives production code and never
  // re-implements the arithmetic. Every constant behind it has a slider, so
  // there are no setters here: a check writes the slider through bind().
  energyCap, energyFrac, energySpend, energyGain, energyFill,
  // the phase-3 input path: the A/B toggle, lag slider and live accumulator;
  // scur is the sim's delayed cursor view, while lockedCursor() is the
  // immediate drawn pointer. All are input transport state, none are hashed.
  setInputMode,
  setInputLag: (v) => { INPUTLAG = v; syncInputLagUi(); },
  setFlick: (v) => { FLICK = v; }, // the measurement harness's reach — FLICK has no slider
  // phase-13 LAB seams, dev/rig only. setCometLab is the exact write the
  // comet-tab slider makes, reachable where no DOM slider exists (the
  // server's sim-host sandbox); allow-listed, it touches no hashed state and
  // no tunable record itself — whoever drives it owns the divergence.
  setCometLab: (k, v) => {
    if (!Number.isFinite(+v)) return false;
    if (k === "COMETDMG") { COMETDMG = +v; return true; }
    if (k === "COMETAOEDMG") { COMETAOEDMG = +v; return true; }
    return false;
  },
  // the phase-14 PvP knob's dev/rig seam — a SIBLING of setCometLab rather
  // than another key on it, because PVPORBS is not a comet-lab flag: it is a
  // shipped sim tunable that the dev route may also drive. Same shape, same
  // dev-only reach (both server gates are unchanged), same rule — whoever
  // drives it owns the divergence. The slider is net-locked, so this is the
  // ONLY way the value moves in a net session, and only from a dev server.
  setPvpTune: (k, v) => {
    if (!Number.isFinite(+v)) return false;
    // CLAMPED to the same 0..10 integer range the server tunable coerces to.
    // Unclamped, one dev call could ask a death for a million orbs and the
    // next death would allocate them; and a seam that accepted values the
    // wire route rejects would not be the same lever it claims to be.
    if (k === "PVPORBS") { PVPORBS = Math.max(0, Math.min(10, Math.round(+v))); return true; }
    // phase 15's rewind cap, same deal: clamped to the exact 0..200 ms integer
    // range the server tunable coerces to, so the seam and the wire route are
    // the same lever. 0 is the row-8 control's off switch.
    if (k === "PVPREWIND") { PVPREWIND = Math.max(0, Math.min(200, Math.round(+v))); return true; }
    return false;
  },
  // the bare read the tune suite pins the consumer against — the same
  // variable the rebate converts to ticks; enc.tunables() carries it too
  // once the capture-commit meta pin admits it
  pvpRewind: () => PVPREWIND,
  // the seat parameter defaults to 0, so the ~20 existing no-arg reads keep
  // reporting the local seat; the report keys (acc/scur/fireHeld) are API
  inputState: (s = 0) => ({ INPUTMODE, INPUTLAG, acc: { ...players[s].input.acc },
                            buffered: players[s].input.ring.length,
                            scur: { ...players[s].input.scur },
                            fireHeld: players[s].input.fireHeld }),
  // the immediate pointer as a WORLD point (through the render camera), so a
  // check compares it against scur and the banked records in one space
  lockedCursor: () => lcurWorld(),
  // WORLD arguments: teleport the aim point and flush the ring. Internally
  // the cursor is view space, so the point converts through the current
  // camera — a check that wants the banked cx,cy exact must keep the point
  // inside the parked camera's view, or the view clamp moves it.
  setLockedCursor: (x, y) => {
    in0.lcur.x = Math.max(0, Math.min(FW, x - cam.x));
    in0.lcur.y = Math.max(0, Math.min(FH, y - cam.y));
    const w = lcurWorld();
    in0.scur.x = w.x;
    in0.scur.y = w.y;
    in0.ring.length = 0; // seat 0's ring only — absolute cursor samples from before this teleport are stale
    mirrorLockedCursor();
  },
  // ...and the same teleport for a CLIENT point, which setLockedCursor cannot
  // express: its world argument is clamped to the field rect, and the gutter
  // panels live OUTSIDE it. A board-click leg has to put the drawn cursor on a
  // row, and a row is in the right gutter — clampLcur's wider bound is what
  // makes that a legal cursor position at all. False when the canvas has no
  // box to convert through.
  setLockedCursorClient: (cx, cy) => {
    const d = pointerDevice(cx, cy);
    if (!d) return false;
    in0.lcur.x = (d.x - ox) / scale;
    in0.lcur.y = (d.y - oy) / scale;
    clampLcur();
    mirrorLockedCursor();
    return true;
  },
  // ---- the frame-loop seams -------------------------------------------------
  // frameBody is loop()'s extracted body: a suite drives it with synthetic
  // timestamps and no rAF; it returns the tick count the frame ran.
  // seedLoopClock is startLoop's clock reset without the rAF arm, so a
  // driven sequence starts exactly where a resumed loop would.
  frameBody,
  seedLoopClock: (t) => { last = t; acc = 0; },
  loopAcc: () => acc,
  loopAlpha: () => acc / TICK, // == the alpha the last frameBody's render drew with
  frameDt: () => frameDt,      // the last frame's clamped delta
  TICKMS: TICK,
  // ---- the drawn-pose probe's reach -----------------------------------------
  drawnPose: () => drawn, // the live record itself — overwritten per render, never copied
  designateDrawnEnemy: (id) => { PROBE_ENEMY = Number.isInteger(id) ? id : -1; },
  armDrawnPt: (v) => { PROBE_PT = !!v; },
  // ---- the presentation frame's seam ---------------------------------------
  // Forces the LIVE branch of buildFrameView — every body draws its raw tick
  // pose, camR == cam — so the judder metric can demonstrate the BEFORE
  // state. Draw-side only: no sim state, no capture, no hashed field.
  setFrameBypass: (v) => { FRAME_BYPASS = !!v; },
});

resize();
render();
syncTuner();
