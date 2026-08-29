"use strict";

// Prototype playground: the Crystal Quest ship with second-order physics.
// The original (components/crystal-quest-game.tsx) mapped mouse *position*
// to velocity: offset/10 with per-axis clamps. This prototype's flight input
// is thrust — each mouse-flight movement or held key in the thrust role is
// an acceleration impulse, velocity integrates it, and a *radial* speed cap
// replaces the per-axis clamp, so a sideways push at full speed rotates the
// heading into an arc instead of pinning the old axis.
// Tuning began as the 30 Hz original rescaled to a 60 Hz sim, was rescaled
// x2.5 with the field, and D50 (PORT-F) then took it to the demo's own
// numbers: top speed 4.0833 px/tick (245 px/s — the slider drives it live),
// gains 0.005/0.005 against KEYTHRUST 14.5 (0.0830125 px/tick², ~91 ticks
// from rest to top), a per-tick velocity retention of 0.985, and a
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

// ---- THE ARENA (PORT-S S3b lane 3, commit C — THE FLIP) -------------------
// PRODUCTION'S SHIP STAYS THE SHIP AND THE KERNEL SUPPLIES THE ENCOUNTER, so
// they meet in THE KERNEL'S ARENA. The world below is js/demo-kernel.js's own —
// a 6x11 grid of 1280x720 play boxes, W1-W3's play box and arena, the home the
// encounters were designed for — and it arrives with the owner's Option B
// (S-3g5hk7): the full 16:9 render extent, UI over the live world at the sides.
//
// THE OLD WORLD CEASES; NOTHING IS TRANSFORMED INTO THE NEW ONE. The viewport
// grows NON-UNIFORMLY (3:2 to 16:9 — 2.5x across, 2.105x down), so no map takes
// an old coordinate to a new one. Every committed trace is RE-AUTHORED at this
// lane's freeze rather than converted, and the vertical gain is the owner's
// "gift" sides.
//
// ---- THE ONE RATIO IS 2.5 = 1280 / 512, AND IT IS ACROSS ------------------
// Every px-DIMENSIONED flight constant that survives is multiplied by it, and
// every exemption is stated at the line. It is the ACROSS ratio and not each
// axis's own, for the same reason the aim seam gives: two axis ratios would
// SKEW every quantity that is not on an axis, and a skewed radius is a hit test
// that answers differently by heading with nothing to say so.
//
// THIS IS MECHANICAL AND FEEL-PRESERVING. A ship that crossed a room in 256
// ticks still crosses one in 256 ticks. The retune TOWARD the demo's own flight
// model is S5's, with its own recapture; nothing here is a feel decision.
const FW = 1280;        // logical field width — the VIEWPORT onto the world. x2.5, WAS 512
const FH = 720;         // logical field height. THE OWNER'S OPTION B: 16:9, WAS 342
const WW = FW * 6;      // world width — a 6x11 grid of view-sized rooms. 7680, WAS 3072
const WH = FH * 11;     // world height. 7920, WAS 3762
const TICK = 1000 / 60; // 60 Hz fixed timestep — twice the original's 30 Hz
const SHIP_R = 17.5;    // x2.5, WAS 7. The kernel mirrors it off the pose — its own
                        // four seat-radius sites default to 7/8 and read this when a
                        // seat is pose-driven, so both planes hit the same hull
let VMAX = 4.0833;      // D50 (PORT-F) TOOK IT THERE. px per tick — 4.0833 x 60 = 244.998 px/s
                        // against the demo's own 245 (demo-v2/sim.js:855, js/demo-kernel.js:2946):
                        // a -0.0008 % deviation, and 4.0833 is the literal the POR names
                        // (PLAN.md:1676). WAS 5 (itself the x2.5 of the original 2), and the
                        // line read "120 px/s baseline" until PORT-L: 120 was the WAS-2 number
                        // and never moved with the x2.5, and the camera header at leadVec()
                        // inherited the same stale figure. The panel prints "4.1 px/tick .
                        // 245 px/s" and the camera lead is 30 x 4.0833 = 122.5, rounded to 122.
                        // The pause-screen slider drives this live, and
                        // Encounter.mods.speed (the AFTERBURNER upgrade) adds px/tick on top of it AT THE
                        // CLAMP in step() — a purchase never writes the tuner value
let ACCEL = 0.005;      // D50 (PORT-F), the GRID pair with KEYTHRUST 14.5: the realised key
                        // gain is 14.5 x 0.005 x (1 + 14.5 x 0.01) = 0.0830125 px/tick²,
                        // -0.385 % from the demo's 300/3600 = 0.0833333 (demo-v2/sim.js:849,
                        // js/demo-kernel.js:2940) and 0.35 ticks on a 91-tick ramp. WAS 0.0375
                        // (x2.5 of 0.015). speed gain — velocity px/tick per count ALONG the heading (slider)
let TURN = 0.005;       // D50 (PORT-F): TURN MOVES WITH ACCEL, always. WAS 0.0375. turn gain —
                        // the same, for the component ACROSS the heading (slider); equal gains
                        // = the old single-gain model, and only equal gains collapse the
                        // along/across split in thrust() back to a heading-free push
let FLICK = 0.01;       // flick curve — gain × (1 + |delta| × FLICK); a 100-count flick doubles its push.
                        // No slider — a let only so the measurement harness (__test.setFlick) can
                        // isolate the curve from the heading resample; the default never moves here
let DAMP = 0.985;       // per-tick velocity retention — the demo's own drag, not 1.
                        // ---- A DIAL WHOSE DEFAULT THE OWNER HAS MOVED (D50, PORT-F) ----
                        // It was a `const 1`, became a `let` with a slider at the SAME 1 in
                        // PORT-S S5 commit G, and D50 takes it to 0.985 = Math.pow(0.985,
                        // dt*60) at dt = 1/60 (demo-v2/sim.js:852, js/demo-kernel.js:2943).
                        //
                        // THE PROGRAM'S PREMISE ABOUT IT WAS INVERTED, which is why the
                        // dial existed at all. The port program carried "production damps
                        // and the demo does not"; measured, it was the other way round.
                        // The demo kernel bleeds 1.5 % of a ship's speed per tick against a
                        // hard cap; production had NO friction whatever, which is what a
                        // retention of exactly 1 means. A comet that never slows is a comet
                        // whose only brake is the wall — and that is the comet this default
                        // has now retired: after D50 a released comet halves its speed every
                        // 45.86 ticks (0.764 s) and is back to ordinary cruise 1.43 s later.
                        //
                        // MOVING THE DEFAULT WAS A 13-TRACE RECAPTURE PLUS SELFCHECK, and it
                        // WAS the OWNER'S ruling at the gate, not a lane's. He made it on
                        // 2026-08-27 — "the playfeel of the last demo that I could play,
                        // based off demo-v2, felt a LOT better" — and PORT-F's own freeze
                        // session pays that bill in one commit. The key drag-terminal
                        // a*d/(1-d) = 5.4722 px/tick still exceeds VMAX, so the radial clamp
                        // in integrateSlice() still binds (slider, flight tab)
let KEYTHRUST = 14.5;   // D50 (PORT-F): the GRID half of the pair. 14.5 x ACCEL 0.005 x
                        // (1 + 14.5 x FLICK 0.01) = 0.0830125 px/tick². WAS 16. The exact
                        // pair (16 / 0.004489942528735632) hits 0.0833333 with zero error but
                        // cannot be represented on the accel rail's 0.0025 grid; this one can,
                        // on both rails, as shipped.
                        // keyboard thrust — synthetic mouse counts per tick, through the same impulse pipeline
let WALLLOSS = 0.5;     // fraction of the flipped velocity component the ship loses on a wall bounce
let AIMSENS = 0.075;    // x2.5, WAS 0.03. push-mode aim gain — offset px per count. Code-only, like BMODE: push mode
                        // left the aim-control menu once locked mode covered it, so its one knob left
                        // the panel with it. The mode itself still runs — see AIMDESC
let AIMDIST = 50;       // x2.5, WAS 20. direction-marker distance from the ship, px
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
let BCOOL = 130;        // ms between shots — D50 / OPEN 2 (PORT-F) takes the demo's own cadence.
                        // The demo's p.fire is 0.13 s (js/demo-kernel.js:2998, demo-v2/sim.js:873)
                        // and its kernel decrements THEN tests, so it fires every 8 ticks. Here
                        // `max(1, round(130/16.6667))` = round(7.8) = 8 ticks = 133.33 ms =
                        // 7.500 shots/s. WAS 400 -> 24 ticks -> 2.500 shots/s. 130 is on the
                        // cool rail's grid ((130-50)/10 = 8). One gate for click fire and autofire
let AUTOFIRE = true;    // hold LEFT to keep firing at the cooldown rate
let BMODE = "off";      // bullet physics — off | newtonian (adds ship vel × factor) | cq-scale (ship speed × factor); code-only, no menu knob
let BSPEED = 650 / 60;  // = 10.833333333333334 px/tick. D50 / OPEN 2 (PORT-F): the demo's own
                        // 650 px/s (js/demo-kernel.js:3024, demo-v2/sim.js). Written as the
                        // expression because 650 px/s is the number, and 3.4615x SLOWER than
                        // what it replaces. WAS 37.5 (x2.5 of 15) = 2250 px/s.
                        // bullet speed, px per tick (off and newtonian modes)
let BFACTOR = 1;        // the ship-velocity factor — newtonian adds it, cq-scale multiplies by it
let BMAX = 20;          // max live bullets (the original capped at 5). D50 / OPEN 2 (PORT-F):
                        // WAS 15, and at BCOOL 130 a RAPID LOADER rank-5 pilot fires every 4
                        // ticks against a ttl of 63, so he wants ceil(63/4) = 16 rounds in
                        // flight. At 15 the sixteenth is REFUSED, silently (:2867 pays no
                        // cooldown and makes no cue), on a row he paid 124 XP for. 20 covers it
let BLIFE = 1.05;       // bullet lifetime, seconds. D50 / OPEN 2 (PORT-F): the demo's own 1.05
                        // (js/demo-kernel.js:3031). ttl = max(1, round(1050/16.6667)) = 63, so
                        // reach is 63 x 10.8333 = 682.5 px. WAS 0.5 -> ttl 30 -> 1125 px.
                        // IT HAD TO MOVE WITH BSPEED: at BLIFE 0.5 the demo's muzzle speed
                        // reaches 325 px — 29 % of today's — a gun neither build ever had.
                        // (The demo bolt travels 671.67 px on the same numbers: its kernel
                        // decrements, tests, THEN moves, so 1.05 s buys it 62 moves where
                        // production's move-then-decrement buys 63. Production's round reaches
                        // 1.6 % further than the demo it copies. Stated, not corrected.)
let BDMG = 2;           // D50 / OPEN 2 (PORT-F): the demo's own `damage: 2` (js/demo-kernel.js:3031).
                        // WAS 1. It is a BALANCE lever wearing a feel lever's costume and the owner
                        // was told: sustained DPS against kernel hp goes 2.5 -> 15.0 (x6), a rocket
                        // (hp 2) dies in ONE hit instead of two, and PvP time-to-kill against a hull
                        // of 3 falls from 24x3 = 72 ticks (1.20 s) to 8x2 = 16 ticks (0.27 s), 4.5x.
                        // damage one player bullet deals — encounter.js reads it for the enemy side of a body
                        // contact, so a ram costs exactly one bullet; code-only, no menu knob (a future
                        // Encounter.mods damage term must multiply into BOTH fire() and contactEvent)
let CONTACTCD = 62;     // ticks before one enemy body can take contact damage again — mirrors the player's
                        // post-hit grace (ECFG.player.invuln), so a sustained overlap trades hull for hp once
                        // a second instead of melting; at the slider's 0 floor a body pays once per TICK of
                        // contact — never twice for one touch, see contactEvent; slider, combat tab
let BOUNCE = false;     // bullets bounce off walls instead of dying at them
let BLASTR = 45;        // x2.5, WAS 18. BLAST CHARGE splash radius at rank 1, px — the shop row's reach; slider, weapons tab
let BLASTGAIN = 20;     // x2.5, WAS 8. px the radius grows per rank past the first: BLASTR + BLASTGAIN × (rank − 1)
// ---- comet mode ----------------------------------------------------------
// Right-hold is COMET MODE now (the Androsynth comet): while a seat's comet
// flag is up the ship answers the stick much harder, tops out much faster,
// shrugs off ALL incoming damage and damages anything it touches. The flag
// itself lives on the per-seat player struct (makePlayer) and is fed through
// the input ring's ability masks — bit 1 of `ah` for the hold and bit 1 of `ap`
// for the press edge; see bankTickInput/drainTickInput — never read off the DOM
// inside step(). The comet is no longer free: it SPENDS from the
// seat's ENERGY pool below, through that pool's own API and nothing else —
// the COMET* numbers here say what it costs and what it does, the EN* numbers
// say what the pool is. That split is the whole point: the next skill prices
// itself the same way without touching a line of this block.
// ---- THE COMET RE-DERIVED AT D50 (PORT-F, OPEN 1 = B — the owner's ruling) --
// The ruling is KEEP THE COMET'S FEEL: the multipliers are not the thing the
// owner flew, the ABSOLUTES are. So the three factors are re-derived against
// the moved base and the comet's own numbers hold:
//   held accel  2 x 0.0830125 x 25.1528 = 4.17599362 px/tick²  (was 4.176)
//   coasting        0.0830125 x 25.1528 = 2.08799681           (was 2.088)
//   rank-0 cap  4.0833 x (15/4.0833)    = 15 EXACTLY           (was 15)
// Both terms carry the factor: the nose term at thrustImpulse routes through
// the same Flight.thrust and inherits `ka`, and its `k === 0` gate is the FRAME
// index, not "no key held" — so a held comet bills two terms and a coasting one
// bills one. That is why the ratio is 25.1528 and not 50.
//   WHAT THE RULING CANNOT HOLD, AND THE OWNER WAS TOLD: the release coast.
// DAMP 0.985 is a D50 base value and nothing in this block can undo it. A
// released comet now halves its speed every 0.764 s and is back to ordinary
// cruise 1.43 s later; the dive-out has stopped existing, in every column.
//   AND NOT EVERY AFTERBURNER RANK AT ONCE. Holding rank 0 at 15 RAISES rank 1
// from 22.5 to 24.1837 and rank 2 from 30 to 33.3675, because the additive
// +2.5 px/tick is a larger fraction of a smaller VMAX. Rank 0 is the rank held:
// it is the number the S6 feel gate was flown at, by a pilot with no shop.
let COMETACC = 25.1528;  // comet accel multiplier — scales ACCEL in thrustImpulse while comet is on (slider, comet tab).
                         // = 2.088 / 0.0830125 = 25.15281..., written to 6 digits so it round-trips
                         // on its own rail. WAS 3, against the retired ACCEL 0.0375 / KEYTHRUST 16.
let COMETTURN = 25.1528; // comet turn multiplier — the same, for TURN (slider, comet tab). WAS 3.
                         // It moves WITH COMETACC: thrust() splits along/across on ka and kt and
                         // only equal factors keep the comet's push heading-free, as ACCEL/TURN do.
let COMETVMAX = 15 / 4.0833; // comet top-speed factor — the radial clamp becomes (VMAX + mods.speed) × this
                         // (slider, comet tab). WAS 3, against the retired VMAX 5. Written as the
                         // EXPRESSION, not as 3.6734993755051057: `4.0833 * (15 / 4.0833) === 15` is
                         // true in IEEE (verified: node -e 'console.log(4.0833 * (15 / 4.0833) === 15)'
                         // -> true), and the expression is the only form that says WHY.
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
let COMETAOE = 27.5;    // x2.5, WAS 11. px the drawn comet halo stands CLEAR OF THE HULL at a full pool —
                        // the pool's in-world readout. The whole clearance scales with the
                        // pool, so an empty one collapses the glow onto the ship's own
                        // radius: there is no floor holding a ring around a spent comet,
                        // which is what made the readout lie at the bottom of its range.
                        // 11 is the old 5 px floor plus the old 6 px of growth, so a FULL
                        // pool draws the exact radius it always did. Render only
                        // (slider, comet tab)
let COMETAOEDMG = 22.5; // PORT-S S5 commit D, D40's first-pass value: px the comet's DAMAGE
                        // reach grows at a full pool, ON TOP OF COMETAOE. 17.5 + 27.5 + 22.5 =
                        // 67.5 production px of total halo at a full pool, which is the x2.5
                        // translation of demo-v5's 27 px. It was 0 for two lanes — a dead lever
                        // with live plumbing — because the pass that reads it did not exist.
                        // D26's aura is that pass, and this is the dial that gives it its reach.
                        // THE HALO THE PILOT SEES IS THE CIRCLE THAT COLLIDES: `auraRadiusOf`
                        // is the one derivation and draw, light and the kernel all read it.
                        // (slider, comet tab)
let COMETAURA = 0.5;    // D26's AURA DAMAGE, per tick, to every hp-bearing BODY and enemy ROUND
                        // inside the halo. D40's first pass. NOT COMETDMG — that is the ram's
                        // per-bite number, and at 3/tick an aura would be a switch rather than
                        // pressure and would deal 62x the ram inside one COMETCD window. The
                        // lab runs 1/tick against a FIRE hit of 2; production normalizes that
                        // half-hit pressure against a FIRE hit. At BDMG 1 that read 0.5; since
                        // D50 / OPEN 2 (PORT-F) took BDMG to 2 the same half-hit is 1.0, and the
                        // SHIPPED COMETAURA stays 0.5 — so the aura is now a QUARTER of a round,
                        // not a half. At 0.5, hp 1-2 chaff dies in 2-4 ticks, a 4-hp swarmling in
                        // 8 and a 12-hp warden in 24 (unchanged: the aura's own number did not
                        // move). Whether it should follow BDMG is a BALANCE question and R8a's:
                        // pressure for bodies, a filter for chaff. It crosses the seam once per
                        // tick through EncounterHost.setAuraDamage — the kernel reads no
                        // production surface and may not hold a copy (slider, comet tab)
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
const SFXVOL_DEF = 0.65;
let SFXVOL = SFXVOL_DEF; // master, 0..1 — audio.js applies SFXVOL^1.6 × MASTER_TRIM (0.5 today, one copy, in js/audio.js), the ancestor's own curve
let SFXMUTE = false; // the hard switch: a muted page allocates no voices at all, it does not gain them to zero
let SFXSHOT = 1;     // bus trim — fire, wall ticks, hits, kills, the blast splash
let SFXFOE = 0.7;    // bus trim — lance and lunge tells, spawns, damage taken, death.
                     // 0.7, owner-tuned 2026-08-20 on the live build: at 1.0 the foe bus was
                     // the dominant driver of the soft-clip knee in a telegraph-heavy wave
                     // (putting it back to 100% reproduced the ducking with the engine
                     // already at 50%), and 0.7 is where damage feedback still reads
let SFXUI = 1;       // bus trim — orb pickups, wave alarms and banners, the shop
let SFXENG = 0.5;    // engine hum trim — the hum tracks G.flame, so this trims what the flame sounds like; 0 is off.
                     // 0.5 rode along with the foe trim above (second-order, not sufficient
                     // alone): the hum is a PERMANENT floor straight into the ceiling while
                     // the flame is lit, so halving it buys headroom on every burst
// SFXVARY: the five REPEAT cues (fire, hit, wall, clang, kill) take a small,
// deterministic pitch and level jitter per admitted cue (±4 % on f0/f1, ±10 %
// on vol) from audio.js's own LCG — never Math.random(), never the sim's
// seeded rand() — so a barrage of identical pews reads as many shots, not one
// sample looping. The authored phrases (clear, buy, denied, warn, death) are
// never varied. A toggle rather than a slider: the A/B by ear is on/off.
let SFXVARY = true;
// SFXPAN: stereo WIDTH, 0..1 — not an on/off. A shot or foe cue pans by its
// world-x offset from the local ship (audio.js: linear over ±520 px, saturating,
// × this width), ui cues and the engine stay centred. 0.6 keeps the loud side
// under 1.35× the mono level at the rail; 0 is today's mono mix. A slider
// because the owner tunes width by ear on the live build, as the foe trim was.
let SFXPAN = 0.6;
// SFXLOOK, ms: every cue envelope is anchored this far AHEAD of ac.currentTime.
// Firefox's clock is a main-thread snapshot that does not advance inside a
// task, and its timeline does not re-anchor a past event to the render head —
// so a cue authored mid-frame loses its head: measured −8 dB on 73 % of fire
// cues at 0, clean at 15. Chrome needs none and pays the 20 ms. No slider —
// the console is the A/B surface (type SFXLOOK = 0 and listen); audio.js clamps
// the read to [0, 1000] ms (its LOOK_MAX), so a typo costs at most a second of
// lead, not a silent page.
let SFXLOOK = 20;
// The two lets a PLAYER sets — SFXVOL and SFXMUTE — are remembered across
// reloads; the bus trims and the engine are dev-panel knobs and are not. Same
// idiom as js/net.js's name store: dotted keys, a read whose whole body is a
// try (Safari private mode, file://, site data blocked — storage can throw
// outright, and a volume is the least important thing on the screen), a write
// that swallows the same way, and a VALIDATING pass so a corrupt value never
// reaches the lets: the volume is snapped to the slider's own 0.05 step with
// round(v × 20) / 20 — NOT round(v / 0.05) × 0.05, which lands 0.35000000000000003
// and would disagree with the range input's sanitized "0.35" — and the mute is
// the literal "1"/"0" and nothing else.
const SFXVOL_KEY = "scmelee.sfxvol";
const SFXMUTE_KEY = "scmelee.sfxmute";
function storedVol() {
  try {
    const raw = window.localStorage.getItem(SFXVOL_KEY);
    if (typeof raw !== "string" || raw.trim() === "") return SFXVOL_DEF; // absent, or an empty string that Number() would read as 0
    const v = Number(raw);
    if (!Number.isFinite(v)) return SFXVOL_DEF;
    return Math.round(Math.max(0, Math.min(1, v)) * 20) / 20;
  } catch { return SFXVOL_DEF; }
}
function storedMute() {
  try {
    const raw = window.localStorage.getItem(SFXMUTE_KEY);
    return raw === "1"; // "0", absent and garbage all read unmuted
  } catch { return false; }
}
function storeAudio() {
  try {
    window.localStorage.setItem(SFXVOL_KEY, String(SFXVOL));
    window.localStorage.setItem(SFXMUTE_KEY, SFXMUTE ? "1" : "0");
  } catch { /* a volume that cannot be remembered is still the volume this session */ }
}
// THE NOSE'S TURN RATE, in radians per second, and it is the demo's number
// because it is the demo's FEEL. `js/demo-kernel.js:1335` turns the player's
// nose with `rotateToward(p.angle, aimAngle, dt * 6.4)`, and the lab records its
// own caveat beside the thrust frame that reads it: "after a fast mouse whip the
// thrust direction swings around over about half a second". THAT HALF-SECOND IS
// THE BUILD THE OWNER PASSED. A round that replaces it with an instantaneous
// cursor bearing has changed the feel, not repaired it.
const HEADRATE = 6.4;   // rad/s — the converged nose's turn rate (js/demo-kernel.js:1335)
// THE THRUST FRAME — D12, and `ship` is the DEFAULT (the owner re-ruled D12's
// "beside the screen-relative default" clause once he said which build he flew:
// "Ship relative thrust IS the demo as I flew it — with the R (soon to be T)
// switch"). BOTH modes ship. `screen` is the mapping production has always had:
// KEY_AIM's fixed vectors, W is up on the SCREEN. `ship` rotates that vector by
// the converged nose, so W is FORWARD along the ship — and because the nose
// converges on the cursor, "cursor-direction thrust" is EMERGENT rather than
// derived. It is a pure ROTATION of the input vector: magnitude, drag and top
// speed are untouched, which is the owner's own scope for D12.
// PERSISTED, because a hotkey does not survive a reload and a pilot who flipped
// the frame once should not have to find it again. The storage idiom is the
// audio pair's above, for the audio pair's reasons: a try/catch around every
// access (a private window throws on the ACCESSOR), and a VALIDATING read so a
// corrupt value can never reach the let — anything that is not exactly "screen"
// reads as the shipped default rather than as a third mode.
const THRUSTFRAME_KEY = "scmelee.thrustframe";
function storedThrustFrame() {
  try {
    return window.localStorage.getItem(THRUSTFRAME_KEY) === "screen" ? "screen" : "ship";
  } catch { return "ship"; }
}
let THRUSTFRAME = storedThrustFrame();
// The one writer, so the store, the readout and the live let can never disagree.
// It is NOT called from the sim: the frame is a client preference and the tick
// only ever READS it, which is what keeps a mid-flight flip from being anything
// more than the next tick mapping the same keys differently.
function setThrustFrame(m) {
  THRUSTFRAME = m === "screen" ? "screen" : "ship";
  try { window.localStorage.setItem(THRUSTFRAME_KEY, THRUSTFRAME); } catch { /* a
        frame that cannot be remembered is still the frame this session */ }
  syncTuner();
  render();
}
const AIM_R = 16;       // push-model offset clamp radius, px
const MIN_FIRE_V = 0.25; // cq-scale refuses to fire below this ship speed — the original's rule
const FLAME_EASE = 0.3; // per-tick easing of the engine flame toward the thrust actually applied
const FLAME_GAIN = 80;  // flame px per px/tick² of thrust
const FLAME_MAX = 20;   // flame length cap, px

// D43 (PORT-L) — THE STANDARD ROUND'S BOLT, from demo-v2/sim.js:3014-3027.
// Render-only, in no hash and in no tunable record. The demo draws a bolt as a
// 1.25 px SEGMENT 1.8 ticks long and NO body; the ±4.2 px is the demo's spawn
// alternation (js/demo-kernel.js:3022), which the sim may not move here, so the
// DRAW translates the whole flight line by it instead — perpendicular to v, so
// every projection is unchanged by it exactly.
//   1.8 ticks is 19.5 px at the shipped BSPEED of 650/60 — D50 / OPEN 2
// (PORT-F) landed the demo's own 650 px/s, and it was 67.5 px at the retired
// BSPEED 37.5. It is written as TICKS, so it followed with no edit here.
const BOLT_TICKS = 1.8;
const BOLT_LW = 1.25;
const BOLT_SIDE = 4.2;

// The flat pass's ink, and the light layer's, both from js/palette.js — the
// one file a game colour is spelled in. THE VM CONTRACT: js/game.js is a sim
// file and js/palette.js is not, so the headless host loads this script with
// no PALETTE in scope; the guard yields empty tables there. That is safe
// because the sim never draws — a colour reaches no hashed field. In the
// browser index.html loads js/palette.js first, so both tables are real.
const C = typeof PALETTE !== "undefined" ? PALETTE.flat : {};
const HOT = typeof PALETTE !== "undefined" ? PALETTE.hot : {};
// The DEMO plane's ink, the third table js/palette.js carries since D46. The
// port rounds draw production's ship and its rounds in the demo's own bytes,
// and neither `ink` nor `cyan` exists in PALETTE.flat — writing `C.ink` here
// would hand canvas an `undefined` strokeStyle, which it SILENTLY IGNORES,
// leaving whatever colour was set last. Same vm guard, same reason.
const DEMO = typeof PALETTE !== "undefined" ? PALETTE.demo : {};
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
    heading: 0,   // THE CONVERGED NOSE (D32) — HASHED per-seat sim state, and the
                  // one field production did not have. `aimAngle` is the AIM,
                  // recomputed whole every frame with no rate, so it cannot lag;
                  // this turns TOWARD the aim at HEADRATE and therefore can.
                  // Two consumers by design: the ship-relative thrust frame
                  // (D12) reads it now, and D29's parry arc faces it later —
                  // one field, one spelling, replicated as `hd` at R7. It is a
                  // SIM value and never a render one, because both readers run
                  // inside the tick.
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
    slots: Abilities.makeSlots(), // the per-seat ABILITY SLOT record (P5) — one
                     // {cd, t, stage, mode, want, press} per ability ID, never per
                     // loadout position. HASHED, behind the guarded zero-default
                     // fold at the end of hashShip: at rest it costs zero bytes, so
                     // an ability nobody arms re-keys no trace. js/abilities.js
                     // loads FIRST for exactly this call.
    input: { // the seat's whole input transport — never hashed (input state, not simulation state)
      acc: { tx: 0, ty: 0, ax: 0, ay: 0, ap: 0, n: 0 }, // per-tick raw-delta accumulator.
                     // `ap` is the tick's ABILITY PRESS MASK, indexed by ability id
                     // — bit 0 fire, bit 1 comet, one more bit per ability after
                     // them. It replaced the `fp` fire-edge COUNT: the drain always
                     // read that count as a bit anyway, and a count cannot say
                     // WHICH ability. Presses OR in and never overwrite.
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
                     // hashed, exactly like fireHeld: it is a copy of the `ap`
                     // fire bit that already rides every frame, kept where encStep reads
                     // it AFTER the drain, so a downed seat's click needs no new
                     // wire field and no new frame key. Cleared once per tick at
                     // the END of step(), so a press survives exactly the tick it
                     // was made on — see clearClaimPress.
      cometWant: false, // the raw held right-button bit off the ring — input transport
                        // state, NEVER hashed, exactly like fireHeld beside it. The GATE
                        // (energyStep) is what turns this into the seat's real, hashed
                        // `comet` flag; a seat with an empty pool wants the comet and does
                        // not get it.
      cometPress: 0, // THIS TICK's comet press EDGE — 1 while bit 1 of a drained
                     // frame's `ap` mask has been seen (or setRightHeld dispatched
                     // one, in event mode) and not yet spent. Input transport,
                     // NEVER hashed, exactly like claimPress above. The edge is
                     // EXPLICIT on the frame now and no longer derived from a rise
                     // in the held level, which is what retired the prevRh walk. Unlike claimPress it
                     // is CONSUMED inside energySlice itself — the read-then-zero is
                     // the slice's first statement, BEFORE the liveness test, so a
                     // click made while the seat is down is deliberately SPENT and
                     // cannot arm the comet at respawn off a stale press (claimPress
                     // keeps its corpse-press because that press IS the feature).
                     // Consuming in the slice, not at end-of-step, also makes sim,
                     // server and predictor identical with no new clear site.
                     // dropTickInput clears it too: a press made under a frozen
                     // overlay must not survive to the first unfrozen tick.
    },
  };
}
// The two shipped abilities' mask bits, resolved ONCE from the catalog rather
// than written as 1 and 2 in a dozen places: js/abilities.js owns the id table
// and this is the only place game.js restates it. Load order makes this legal —
// the catalog is the first script on both surfaces.
const AB_FIRE = Abilities.bit(Abilities.ABILITY.FIRE);   // bit 0
const AB_COMET = Abilities.bit(Abilities.ABILITY.COMET); // bit 1
// THE BENCH SELECTION — pure client UI, and it never reaches the wire. The
// server holds its own copy of this `let` at the file default and never reads
// it: what it reads is the seat's `ap` mask. That is what makes key binding,
// rebinding and loadout swapping free forever, and it is why the lazy version
// (a module latch the DOM handler writes) is broken for everybody but the
// person testing it.
let SELECTED_ABILITY = Abilities.ABILITY.RAILSHOT;
// which ability each held KEY is holding, so a keyup releases the bit its own
// keydown set even if the selection changed in between. Client-side transport,
// read once per bank.
const heldAbilityKeys = new Map();
// THE RIGHT BUTTON IS NO LONGER HARD-WIRED TO THE COMET — D30. The middle term
// was `(G.rightHeld ? AB_COMET : 0)`, and it is the second half of the RMB
// double-arm §2.12 names: `setRightHeld` wrote the want and THIS wrote the held
// level, so an RMB bound to a weapon while either survived would have drained
// COMETDRAIN every held tick in the local predictor. Both halves go in this
// commit, and D31's SHIFT branch — which lands its bit through heldAbilityKeys
// below, exactly as Space does — is what supplies the comet's level now.
// LMB keeps its term: the fire button is still hard-wired, and only the right
// button was ruled free.
function heldAbilityMask() {
  let m = G.leftHeld ? AB_FIRE : 0;
  for (const id of heldAbilityKeys.values()) m |= Abilities.bit(id);
  return m;
}
const AB_FIRST = 2; // the first ability whose whole state lives in the SLOT
                    // record. Fire and comet keep the scalars they shipped with
                    // (P.cool, the energy pool) — see js/abilities.js's note.
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
// js/encounter.js returns before any hit is registered). CP_LIVE, and only
// CP_LIVE, wears the halo, and the flash marks the moment the wire says yes.
//
// CP_WIND HAS NO INK. It used to draw a windup ring here and a faint core in
// the light layer; the owner cut both — the ring beside the halo it was asking
// for read as confusing rather than as an ask. The state itself stays, and
// three things read it: the comet lab's lead instrument (asks/confirms/
// leadMin/leadMax), the hurtWind counter that separates prediction skew from a
// real sim defect, and the refusal CUE below, which fires on the CP_OFF →
// CP_WIND transition. cometView still hands out `wind`, because the engine's
// ENG_BURN_WIND swell in js/audio.js is audio, not ink.
//
// Render-side by construction: nothing here is read by the sim, nothing here
// is hashed, and the clock is a TICK COUNTER advanced once per PLAYED tick
// from capturePresent() — a net client plays ticks without ever stepping the
// sim, which is the whole reason cometClock exists beside simTick. No wall
// clock of any kind is read here, so two
// render() calls inside one tick still paint identical bytes (the law at
// HULL_SEED below).
const CP_OFF = 0, CP_WIND = 1, CP_LIVE = 2;
const COMET_WIND_TICKS = 6;  // ticks the windup takes to reach full extension —
                             // 100 ms at the 60 Hz sim clock. It sized the ring
                             // that used to draw from it; with that ink gone it
                             // is the ramp on cometView's `wind`, which is the
                             // engine swell's own curve (js/audio.js)
const COMET_FLASH_TICKS = 7; // ...and the confirm flash's decay, ~117 ms: long
                             // enough to register, short enough that it cannot
                             // be mistaken for the burn itself
const COMET_WIND_HOLD = 30;  // the RELEASE WINDOW — half a second. A press the
                             // pool cannot pay for is never confirmed and the
                             // button may stay down forever, so a windup with
                             // no confirm inside this retracts and does not
                             // ask again until the button lifts. Well clear
                             // of the worst lag budget this repo measures
                             // (~250 ms unplayable), so a slow round trip
                             // retracts nothing a fast one would have shown.
                             // It is no longer the moment the pilot HEARS the
                             // refusal — the press edge answers that — only the
                             // backstop for a refusal the client could not
                             // predict. See noteCometRetract.
const COMET_PRES = [];       // seat -> { phase, t, spent, cued }
const CP_NONE = { phase: CP_OFF, t: 0, spent: false, cued: false }; // the shared answer for a
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
// and a solo press books as a pop, never as a windup. CP_WIND is a NET-MODE
// state by construction: it exists to hold the four-tick gap between a
// prediction and its confirmation, and solo has no such gap. The one solo
// press that DOES enter CP_WIND is a REFUSED one, where nothing ever confirms
// — and that press is exactly the one this machine now answers, with the
// refusal cue on the transition itself.
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
    if (!r) r = COMET_PRES[s] = { phase: CP_OFF, t: 0, spent: false, cued: false };
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
        //
        // DELIBERATELY SILENT, and do not "fix" it: this is not a refused ask,
        // it is the burn ENDING. Every comet run on a pool the pilot holds to
        // dry passes through here, so a cue on this branch would beep at the
        // end of every single run. The refusal cue belongs to the ASK below.
        r.phase = CP_OFF; r.t = 0; r.spent = true;
      } else if (r.phase === CP_WIND) {
        r.t++;
        if (r.t >= COMET_WIND_HOLD) { r.phase = CP_OFF; r.t = 0; r.spent = true; noteCometRetract(s); }
      } else if (!r.spent) {
        r.phase = CP_WIND; r.t = 0; noteCometAsk(s);
        // the refusal answers at the CLICK, not ~500 ms later at the retract.
        // This one line is exact in solo and PREDICTED in net for the same
        // reason: presentedPool hands back the sim's own pool in solo and the
        // predictor's in net, so the cue rides the same clock as every visual
        // on the screen. A predicted refusal the server contradicts costs ONE
        // wrong cue; the old rule cost half a second of silence on EVERY
        // refused click. noteCometRetract is the backstop for the other
        // direction — see `cued` there.
        //
        // Reached ONLY on the local granted seat: `want` above already carries
        // `me !== null && s === me`, so this pool read happens once per press
        // edge and never once per seat per tick. That is not an optimisation,
        // it is the law at the top of this block — the machine allocates
        // nothing per seat per tick and reads no wall clock, and a
        // presentedPool call for four seats every tick would break the first
        // half of it.
        const p = presentedPool(s);
        if (!Flight.cometOn(false, p.en, p.enMax, true)) {
          if (window.Sfx) Sfx.cue("refuse", null, undefined, s);
          r.cued = true;
        }
      }
    } else {
      // the button is up: the next press may flare — and it may CUE, which is
      // why the latch clears with the spent flag rather than only at the
      // retract. Miss this and the retract's backstop dies silently after the
      // session's first refusal, since `cued` would stand true forever.
      r.phase = CP_OFF; r.t = 0; r.spent = false; r.cued = false;
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
//   wind  — the windup's extension, 0..1; 0 unless the phase is CP_WIND.
//           AUDIO-ONLY now: the windup ring that used to draw from this was
//           removed at the owner's call (the ink read as confusing), but the
//           engine's ENG_BURN_WIND swell in js/audio.js reads it and the
//           refusal round's whole point is MORE audio feedback, not less. So
//           the term stays a value with no ink attached to it.
//   flash — the confirm flash, 1 on the tick the wire agreed and decaying to
//           0 across COMET_FLASH_TICKS; 0 unless the phase is CP_LIVE
// ---- THE ONE HALO DERIVATION (PORT-S S5, commit C) -------------------------
// `SHIP_R + (COMETAOE + COMETAOEDMG) * f`. Two terms, one number, and D26's
// aura collides on exactly the radius the pilot SEES — which is the whole
// reason the damage reach is folded into the drawn halo rather than given its
// own invisible circle. At the shipped `COMETAOEDMG` of 0 this is byte-for-byte
// the arithmetic that shipped before it (`SHIP_R + COMETAOE * f`), so commit C
// moves no pixel and no hash; commit D turns the dial on.
function auraRadiusOf(f) { return SHIP_R + (COMETAOE + COMETAOEDMG) * f; }

// ---- THE AUTHORITATIVE RADIUS, PER SEAT, NEVER HASHED ----------------------
// PRESENTATION STATE, on cometPres's own footing: two sparse arrays that exist
// so DRAW, LIGHT and the kernel's COLLISION cannot disagree about how big the
// halo is on a given tick.
//
// WHY A CACHE AND NOT A SECOND CALL TO cometView. The pool is DRAINED before
// the pose is pushed — `energyStep()` runs at js/game.js's tick and
// `poseKernelSeats()` eighty-five lines later — so a radius sampled at the pose
// reads the POST-SPEND pool and a radius sampled at draw time reads it again,
// one drain later still. On the ARM tick that is the difference between a halo
// of 67.5 and a halo of 67.0 while the public pool says 99, and between a
// collision circle and a drawn circle that are not the same circle.
//
// SO THE FRACTION IS SAMPLED ONCE, BEFORE THE DRAIN, and the radius derived
// from it is what the pose carries and what the local surfaces draw.
// `AURA_F[s]` is that pre-spend fraction; `AURA_R[s]` is the radius.
//
// NEITHER IS HASHED and neither is on a seat record. They are module-local
// arrays in the render/presentation half of this file, exactly like `cometPres`
// and the shake machine, and nothing in `hashState` walks them.
const AURA_F = [];
const AURA_R = [];

// The presented radius for a seat: the authoritative cache where production
// simulated this seat, and the presented-pool formula where it did not — which
// is every seat on a net client. A client's only error is the one drain
// between pre-spend and post-spend, and v10 carries no exact radius to fix it.
//
// THE OWNERSHIP TEST IS EXPLICIT (S5 FIX ROUND, Codex CX-3). Ruling 3's "one
// authoritative radius" is a HOST/LOCAL contract: a `?mp` client runs no
// collision for ANY seat — its own included — so it owns no radius and must
// draw the licensed one-drain approximation for every seat until R7 puts the
// exact `auraR` on the wire. `Net.active()` is fixed at load (js/net.js), so
// this is a mode test and not a per-tick condition. The cleared cache at the
// pose site already makes the fall-through happen; this line SAYS it, so a
// future local write cannot quietly re-open the hole.
function presentedAuraR(s) {
  if (window.Net && Net.active()) return cometView(s, presentedPool(s)).r;
  const c = AURA_R[s];
  if (Number.isFinite(c)) return c;
  return cometView(s, presentedPool(s)).r;
}

function cometView(s, pool) {
  const r = cometPres(s);
  const p = pool || presentedPool(s);
  const f = p.enMax > 0 ? Math.max(0, Math.min(1, p.en / p.enMax)) : 0;
  return { phase: r.phase, f, r: auraRadiusOf(f),
    wind: r.phase === CP_WIND ? Math.min(1, (r.t + 1) / COMET_WIND_TICKS) : 0,
    flash: r.phase === CP_LIVE ? Math.max(0, 1 - r.t / COMET_FLASH_TICKS) : 0 };
}
// ---- SCREEN SHAKE ----------------------------------------------------------
// Render-only presentation state, the comet machine's camera-space sibling:
// a small offset composed into FRAME.cam (never `cam` — the input path reads
// cam every client tick, and a shaken aim point would move where bullets go).
// The machine advances ONCE PER PLAYED TICK from capturePresent(), beside
// cometPresTick and on the same clock rationale: a net client never runs
// step(), so no simTick and no wall clock can serve. The offset is a pure
// function of (seed, age) through hash32 under this layer's OWN salt — never
// a wall-clock jitter, never the sim's seeded rand() stream — so two renders of one
// tick paint identical bytes (the render-side law above, and the hull kick's
// precedent). Nothing here is hashed and nothing rides the wire.
//
// COMPOSE RULE: impulses ADD into one accumulator, clamped at SHAKE_MAX, and
// the decay is linear at peak/SHAKEDECAY per tick off the episode's running
// peak — the Math.max(0, ...) hard-zero shape, never an asymptotic ease. A
// second hit mid-decay raises the amplitude by its own size (never a silent
// restart-from-max) and stretches the tail only by what it added. The shake
// AGES WHILE FROZEN deliberately: capturePresent still runs per played tick
// under a frozen overlay, and a paused screen settling to rest is correct
// feel. SHAKEAMP scales at INTAKE and gates the offset — at 0 the machine
// contributes EXACTLY (0, 0), which is the isolating lever the pixel suites
// drive.
const SHAKE_SEED = 0x5A11C3B7; // this machine's own salt — never HULL_SEED's
                               // or FX_SALT's stream position
// ---- RESCALED AT THE FIX ROUND (S3BR-07) ---------------------------------
// Every number below is PX OF CAMERA OFFSET, and the logical viewport grew x2.5
// at the flip while they stayed put — so the same amplitudes occupied 40 % of
// their former screen fraction. Hull hits, kills, rails, rams and clears all
// had materially weaker screen feedback after the flip than before it, which is
// a feel regression the fixture re-author would have frozen.
//   THE TWO SLIDERS ARE EXEMPT and it is worth saying which: `SHAKEAMP` is a
// MASTER MULTIPLIER and `SHAKEDECAY` is TICKS. Neither has a length in it.
const SHAKE_MAX = 35;      // px — the summed-impulse ceiling. x2.5, WAS 14
// the per-event sizes, in px of camera offset at master amplitude 1 — the
// starting tune, judged in play (the owner's feel pass moves these)
const SHAKE_HIT = 17.5;    // own hull hit — the one the pilot must FEEL. WAS 7
const SHAKE_KILL = 5;      // an enemy dies (kind is the only size channel —
const SHAKE_KILLHEAVY = 8.75; // the emit strips e.r, so heavy rides its kind)
const SHAKE_RAM = 11.25;   // comet ram, INFERRED (see shakeCueLocal). WAS 4.5
const SHAKE_RAIL = 3;      // own railshot — a punctuation tap. WAS 1.2
const SHAKE_CLEAR = 7.5;   // wave clear — celebratory, not violent. WAS 3
// ...and HOW FAR a death is still felt. A kill is a WORLD event, so it needs
// the same cull the sound of it already gets: js/audio.js's att() silences a
// cue past FAR, and a screen that jumps for a kill nobody can hear is a jump
// with no cause on screen. Linear, full inside NEAR, zero at FAR — FAR is
// audio's number deliberately, so the felt reach and the heard reach are one
// distance. ESTIMATES, judged in play like the rest of the shake tune.
//
// ---- THE MIRROR IS A LIVE READ (FIX ROUND S3BR-07, corrected at the HOLD
// ROUND) --------------------------------------------------------------------
// `SHAKE_FAR` said it mirrored js/audio.js's `FAR` and was a HAND COPY of it,
// which is the shape every mirror in this repository has eventually drifted
// into. It had ALREADY drifted on the near side — 400 against audio's 260 —
// before FIX 6 moved FAR to 2750 and broke the far side too.
//
// S3BR-07 MADE IT A READ AND THE READ NEVER RAN. `const SHAKE_FAR = ... ?
// window.SfxReach.far() : 2750` is evaluated when js/game.js is PARSED, and
// index.html loads js/game.js BEFORE js/audio.js — so `window.SfxReach` did not
// exist yet and production captured the literal fallback every time. The two
// numbers agree exactly today, which is precisely why nothing said so: the fix
// was numerically right and structurally absent, and the comment promised drift
// protection that did not exist. The final review measured it.
//
// SO THE READ IS AT USE, NOT AT PARSE. `shakeReach()` asks js/audio.js each
// time the falloff needs it, so a retune of audio's `NEAR` moves the felt reach
// on the same frame — which is what the promise was always for. It is a
// property read and a comparison on a path that already does a `hypot`.
//   THE FALLBACK IS STILL THE MECHANICAL ANSWER and it still has a stated
// reason: js/audio.js is NOT a SIM_FILE, so the headless vm loads js/game.js
// without it, and a reach of `undefined` would silence every falloff in the
// Node realm. 2750 = 1100 x 2.5, the same number the read returns.
const SHAKE_NEAR = 1000;   // px — full amplitude. x2.5, WAS 400
const SHAKE_FAR_FALLBACK = 2750; // px — 1100 x 2.5, for a realm with no audio
function shakeReach() {
  return (typeof window !== "undefined" && window.SfxReach)
    ? window.SfxReach.far() : SHAKE_FAR_FALLBACK;
}
let SHAKEAMP = 1;          // master amplitude, 0..2 (slider; 0 = off exactly)
let SHAKEDECAY = 18;       // ticks a full impulse takes to settle (slider)
const SHAKE = { amp: 0, peak: 0, age: 0, seed: 0, ox: 0, oy: 0, prevFlash: 0 };
function shakeImpulse(px) {
  const a = px * SHAKEAMP;
  if (a <= 0) return;
  if (SHAKE.amp <= 0) { // a fresh episode reseeds off stable ints: the seat,
    SHAKE.age = 0;      // the machine tick of impulse, and this layer's salt
    const me = grantedSeat();
    SHAKE.seed = hash32(me === null ? 0 : me, cometClock, 17, SHAKE_SEED);
  }
  SHAKE.amp = Math.min(SHAKE_MAX, SHAKE.amp + a);
  if (SHAKE.amp > SHAKE.peak) SHAKE.peak = SHAKE.amp;
}
// how much of a world event's impulse survives the trip to this screen. The
// listener is the LOCAL SHIP'S PRESENTED POSE — the pose the pilot is looking
// at this frame, not the sim pose behind it — and it is the same ship
// js/audio.js measures from, so a cue that is silent is also still.
// A positionless event keeps its full impulse: no place means no distance to
// cull on, and the caller that has none (the wave clear) is a room fact.
function shakeFalloff(at) {
  if (!at) return 1;
  const P = localPlayer();
  const r = PRES.ships.get(P.id);
  const lx = r ? r.cx : P.ship.x;
  const ly = r ? r.cy : P.ship.y;
  const d = Math.hypot(at.x - lx, at.y - ly);
  const far = shakeReach(); // LIVE — see the block at SHAKE_NEAR
  if (d <= SHAKE_NEAR) return 1;
  if (d >= far) return 0;
  return 1 - (d - SHAKE_NEAR) / (far - SHAKE_NEAR);
}
// the event intake, solo-drain flavour: EVERY kind, the own-rail tap included.
// The net wire drain must NOT reach the ability branch (its own rail already
// tapped on the predicted edge through Shake.own) — it enters through
// shakeWireCue below, which strips ability kinds first.
// `at` is the event's world position, the same field js/audio.js attenuates
// on. Only the two KILL kinds read it: a hull hit and a rail tap are already
// own-seat facts, and a wave clear is a room fact with no place at all.
function shakeCueLocal(kind, seat, at) {
  if (kind === "kill") shakeImpulse(SHAKE_KILL * shakeFalloff(at));
  else if (kind === "killheavy") shakeImpulse(SHAKE_KILLHEAVY * shakeFalloff(at));
  else if (kind === "clear") shakeImpulse(SHAKE_CLEAR);
  else if (kind === "hit" || kind === "hurt") {
    // the COMET RAM INFERENCE: a ram emits a plain "hit" (indistinguishable
    // from a bullet's), so the estimate is "the local seat's own hit while its
    // comet is live". A bullet landed mid-burn shakes too — accepted for v1;
    // the true ram event is R7 wire material.
    const me = grantedSeat();
    if (me !== null && (seat | 0) === me && cometPres(me).phase === CP_LIVE) shakeImpulse(SHAKE_RAM);
  } else if (window.Abilities && Abilities.CUE_KINDS.indexOf(kind) >= 0) {
    const me = grantedSeat();
    if (me !== null && (seat | 0) === me) shakeImpulse(SHAKE_RAIL);
  }
}
function shakeWireCue(kind, seat, at) { // js/net.js's fireEvents enters here
  if (window.Abilities && Abilities.CUE_KINDS.indexOf(kind) >= 0) return;
  shakeCueLocal(kind, seat, at);
}
function shakeOwnCue(kind) { // js/net.js's ownCue — the predicted rail edge.
  // With the predictor parked (predOn false / predIdle) this never fires and
  // the own rail gets no shake in net mode — accepted for a degraded link.
  if (window.Abilities && Abilities.CUE_KINDS.indexOf(kind) >= 0) shakeImpulse(SHAKE_RAIL);
}
// one tick of the machine, from capturePresent() — the flash latch, the
// decay, and the tick's ONE offset (per tick, never per render)
function shakePresTick() {
  // own hull hit: the hitFlash EDGE. The record rides the wire in net mode
  // and is the sim's own in solo, so a RISE latched per tick is a fresh hit
  // in both modes.
  const me = grantedSeat();
  const H = me === null ? null : seatHealth(me);
  const f = H ? H.flash | 0 : 0;
  if (f > SHAKE.prevFlash) shakeImpulse(SHAKE_HIT);
  SHAKE.prevFlash = f;
  if (SHAKE.amp > 0) {
    SHAKE.age++;
    SHAKE.amp = Math.max(0, SHAKE.amp - SHAKE.peak / Math.max(1, SHAKEDECAY));
    if (SHAKE.amp === 0) SHAKE.peak = 0;
  }
  if (SHAKE.amp > 0 && SHAKEAMP > 0) {
    const k = hash32(SHAKE.seed, SHAKE.age, 17, SHAKE_SEED);
    SHAKE.ox = ((k & 0xff) / 127.5 - 1) * SHAKE.amp;
    SHAKE.oy = (((k >>> 8) & 0xff) / 127.5 - 1) * SHAKE.amp;
  } else {
    SHAKE.ox = 0; // EXACT zero, not a small number — the lever's contract
    SHAKE.oy = 0;
  }
}
// the wire drains' doorway (game.js loads before net.js; both hooks are
// guarded with the window.FX idiom so a stubbed page stands down cleanly)
window.Shake = { cue: shakeWireCue, own: shakeOwnCue };
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
                  // it (a mismatched drain books hurtSkew below).
                  // RE-AIMED AT R5 (D26 + D28). It used to read "a SIM DEFECT
                  // if it ever moves", because the comet refused every incoming
                  // path. It now refuses BODY CONTACT and nothing else, so a
                  // burning pilot legitimately eats beams, seekers, rival
                  // rounds and rival splash — and this is a LIVE count of them,
                  // the client's mirror of the server's countHurtWhileComet.
                  // What is still true, and still the thing to watch: a hurt
                  // from a CONTACT can never appear here, because hitPlayer
                  // refuses it and returns before the cue is emitted
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
  // THE EDGE ANSWERS, THE RETRACT BACKSTOPS. cometPresTick cues at the press
  // edge off the presented pool, which is the answer the pilot actually wants
  // — immediate, and right in every case the client can see. This branch is
  // the other case: a press the client predicted was fine and the authority
  // then refused by never confirming it. Nothing on this screen knew that
  // until the release window ran out, so the cue lands late rather than not at
  // all. `cued` is what keeps the two from doubling up — set at the edge,
  // cleared when the button lifts (cometPresTick's button-up branch), so one
  // press is worth at most one cue, whichever end of it answers.
  const r = cometPres(s);
  if (!r.cued && window.Sfx) Sfx.cue("refuse", null, undefined, s);
  COMET_LOG.retracts++;
  clogClose(-1, -1);
}
// The cue drains' half — js/game.js's drainCues() in solo and js/net.js's
// fireEvents() in net mode, because a net client's local sim never steps and
// only the second of those runs there. `hurtWind` is the measurement this lane
// wanted; `hurtLive` mirrors the server counter — a live number since R5, not a
// zero-forever one (D28 narrowed the refusal to body contact).
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
//   input{ scur{x,y}, fireHeld, fireDelta, claimPress, cometWant, cometPress }
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
    // (REST_EPS is 0.125 px/tick and D50 widened this window from one tick to
    // two — see the measured note at its declaration; it is hash-visible.)
    if (s < REST_EPS) { // at rest there is no heading — all input builds speed
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
    let lastAh = -1; // -1 = nothing drained this tick — the HELD levels then
                     // persist, exactly the semantics fireHeld always kept
    // There is no press-edge DERIVATION here any more, and that is the point of
    // the round. The comet's edge used to be reconstructed from a rise in the
    // held bit `rh` — a prevRh seeded off the standing want, walked frame by
    // frame, with a hardSnap re-seed bolted on in js/net.js so a button held
    // through death was not read as a fresh press at respawn (tracker S-r3mfs8
    // leg R2 was an open defect in exactly that derivation). The `ap` mask
    // carries the edge EXPLICITLY, for every ability including the comet, so
    // the derivation, its bookkeeping and that whole class of defect are gone.
    for (let k = 0; k < frames.length; k++) {
      const a = frames[k];
      const ap = a.ap | 0; // PRESS mask — an edge per ability id
      const ah = a.ah | 0; // HELD mask — a level per ability id
      b.scur.x = a.cx;
      b.scur.y = a.cy;
      // the phase-15 lag-rebate latch, recomputed at EVERY drained frame (the
      // cometWant precedent below): a vt-bearing frame earns its shot the
      // clamped tick delta between the sim's now and the client's presented
      // view tick; a frame without one earns nothing. fire() reads the latch,
      // which is what gives the frameless autofire path (game.js's held-fire
      // loop) the same rebate the `ap` fire edge gets.
      b.fireDelta = Number.isInteger(a.vt) ? Math.max(0, Math.min(21, simTick - a.vt)) : 0;
      // the claim latch, ABOVE the liveness gate and OR'd rather than assigned:
      // a corpse's press is the whole point (it is how a downed seat asks to be
      // dealt back), and a catch-up tick that drains two frames must not let the
      // second frame's silence erase the first frame's click
      if (ap & AB_FIRE) b.claimPress = 1;
      // ...and the comet's, latched the same way and ABOVE the same gate. It is
      // a plain mask test now rather than a rise walk; energySlice still spends
      // it before its own liveness test, so a click made while down cannot arm
      // the comet at respawn.
      if (ap & AB_COMET) b.cometPress = 1;
      // a dead seat's frames still land (the cursor and the held bits) but
      // apply no impulse and fire nothing — the corpse takes no input
      if (ctx.alive) {
        if (a.ax || a.ay) Flight.aim(K, a.ax, a.ay);
        if (a.tx || a.ty) Flight.thrust(K, a.tx, a.ty);
        if ((a.kx || a.ky) && ctx.keyThrust()) {
          // THE FRAME, applied here and not at the bank: `kx/ky` ride the wire
          // as SCREEN axes, so a client that pre-rotated them would put its own
          // frame setting into every frame it sends and the server would have no
          // way to tell a rotated pair from an unrotated one. The seat's own
          // nose does the rotation at the point of use, which also means a
          // seat's frame is its own business and never travels.
          const kf = ctx.thrustFrame(a.tf, a.kx, a.ky);
          Flight.thrust(K, kf.x * KEYTHRUST, kf.y * KEYTHRUST);
        }
        // ---- THE COMET'S OWN THRUST (PORT-S S5, commit F) ---------------
        // D31/owner-ruled: the comet SUPPLIES forward thrust in addition to
        // COMETACC, COMETTURN and COMETVMAX. A burning pilot is not a fast
        // pilot who happens to be turning well; it is a pilot being carried.
        //
        // IT IS GATED ON BURNING ALONE AND SITS AFTER THE KEY BLOCK, not
        // inside it. Inside, it would only ever fire with a key already down
        // and the no-W case — a coasting comet accelerating along its nose —
        // would not exist at all.
        //
        // IT FOLLOWS `K.heading`, THE SETTLED NOSE (D32), and it is NOT a
        // second steering direction: the nose is turned once per tick by
        // `headingStep`, after this, so a burning tick thrusts along the nose
        // as it stood when the tick began. At heading 0 the nose is +x, so the
        // unit nose in this funnel's WORLD-vector convention is
        // (cos h, sin h) — the same convention `thrustFrame` rotates the
        // keyboard axes INTO one line above.
        //
        // THROUGH `Flight.thrust`, WHICH IS THE POINT. The funnel applies
        // `COMETACC` and `COMETTURN` (js/game.js's `ka`/`kt`) to whatever it
        // is handed, so this term inherits the 3x gains for free, stacks with
        // an ordinary key vector rather than replacing it, and is clamped by
        // the same `COMETVMAX` radial cap in `integrateSlice`.
        //
        // ITS MAGNITUDE IS ONE FULL KEYBOARD VECTOR — `KEYTHRUST`. The lab's
        // 300 used to be a lab unit against a lab's own ACCEL; since D50
        // (PORT-F) production's own ACCEL IS the lab's, so 300 px/s² and "as
        // hard as holding W" now name the same push to within -0.385 %. The
        // magnitude is still written as one keyboard vector, because that is
        // the quantity the owner's feel gate is being asked about.
        //
        // COMETTHR SEES IT FOR FREE. The burn is `COMETDRAIN + COMETTHR *
        // |thrustAcc|` and this term adds to `thrustAcc`, so at the shipped
        // COMETTHR of 0 a coasting burn still costs exactly COMETDRAIN — and a
        // nonzero COMETTHR would begin billing the nose term. That is a DIAL
        // FACT, not a change, and wave1's restored (8) pins both halves.
        //
        // ONCE PER AUTHORITATIVE TICK, AND `k === 0` IS WHAT BUYS THAT
        // (corrected at the S5 FIX ROUND, Codex CX-2). The keyboard vector
        // beside it is per input FRAME and belongs there: a pilot who sent two
        // frames really did hold W for two frames. This term is TIME-driven —
        // the comet supplies it, not the pilot — and this loop runs 0, 1 or 2
        // times per tick by transport cadence alone (drainTickInput's
        // at-most-two policy). Left per frame it was applied 0, 1 or 2 times
        // for the same tick of simulated time, so packet jitter moved the
        // ship. The twin below covers the 0-frame tick; between them the term
        // lands exactly once per alive burning seat per tick.
        //
        // IT STAYS HERE rather than being hoisted above or below the loop
        // because `Flight.thrust` is velocity-direction dependent, so moving
        // it past `fx.fire()` and the ability arms would change the 1-frame
        // tick — the shipped case, and the one every golden trace drives.
        if (k === 0 && K.comet) Flight.thrust(K, Math.cos(K.heading) * KEYTHRUST,
                                      Math.sin(K.heading) * KEYTHRUST);
        if (ap & AB_FIRE) fx.fire();
      }
      b.fireHeld = !!(ah & AB_FIRE);
      lastAh = ah;
      // every OTHER ability, in ASCENDING ID ORDER — pinned, exactly as the
      // seat drain order is: the moment two abilities can spawn on one tick the
      // order is hash-visible and it may never change. The arm rule is
      // Flight.abilityOn and this is its one authoritative call site; the
      // cooldown is set HERE rather than inside the sink, so the predictor
      // replaying this same slice models it without a second copy of the rule.
      const slots = K.slots;
      if (slots) {
        for (let id = AB_FIRST; id < slots.length; id++) {
          const sl = slots[id];
          if (ap & (1 << id)) sl.press = 1;
          if (ctx.alive && sl.press && Flight.abilityOn(id, sl, ctx.owned, true, K.energy)) {
            const d = Abilities.def(id);
            // the price, paid at the ARM and inside the drain — so the predictor,
            // which replays this same slice, models the pool exactly as the
            // server spends it. Flight.spend re-arms the recharge delay, so an
            // ability and a comet compete for one pool and one regen clock.
            // spend's ANSWER is read, not discarded. It is unreachable today —
            // abilityOn's `en >= d.en` and spend's `K.energy < n` are exact
            // complements over the same unmutated K.energy — but they are two
            // tests in two files, and a second priced ability arming between
            // them, or any reordering, turns a silent `false` into a free arm.
            if (d && d.en > 0 && !Flight.spend(K, d.en)) { sl.press = 0; continue; }
            sl.cd = d ? d.cd | 0 : 0;
            fx.ability(id);
          }
          sl.press = 0; // spent at the fire site, whether it armed or not: a
                        // press a cooldown refused is not banked for later, and
                        // a corpse's press dies with the corpse (the deliberate
                        // opposite of claimPress, whose whole feature is that a
                        // downed seat's click survives to ask for a deal)
        }
      }
    }
    // THE 0-FRAME TWIN of the comet's own thrust above. A tick that drains no
    // frame at all is still a tick of simulated time, and the comet supplies
    // its thrust for it. Together with the `k === 0` gate above, the term is
    // applied EXACTLY ONCE per alive burning seat per authoritative tick, for
    // every drain width the transport can produce.
    if (!frames.length && ctx.alive && K.comet) {
      Flight.thrust(K, Math.cos(K.heading) * KEYTHRUST,
                       Math.sin(K.heading) * KEYTHRUST);
    }
    // AFTER the entries applied: the HELD levels take the LAST drained frame's
    // mask — so a catch-up tick lands on the newest button state, and a tick
    // with no frame leaves them exactly where they were. A want is not a flag:
    // the energy slice decides whether the pool can pay for the comet, and each
    // ability's own record decides the rest.
    if (lastAh >= 0) {
      b.cometWant = (lastAh & AB_COMET) !== 0;
      const slots = K.slots;
      if (slots) for (let id = AB_FIRST; id < slots.length; id++) slots[id].want = (lastAh >> id) & 1;
    }
  },
  // ---- THE ARM RULE, and the only copy -----------------------------------
  // running = the seat's settled or presented comet flag; en/enMax = the pool
  // it is judged against; press = a fresh edge. A running comet holds to dry
  // on the LEVEL; a new one needs the floor AND the click — the owner's
  // click-again rule, which is why a held button over a refilling pool is not
  // an ask. The `en > 0` term is what stops an ENARM of 0 from letting a
  // bone-dry pool re-arm every tick forever.
  //
  // It lives on Flight because three consumers must answer it identically and
  // they used to carry three copies: the sim's energySlice below (the truth),
  // js/net.js's predicted press-edge cue, and js/encounter.js's energy-bar
  // lockout dim. Adding a term to the sim's copy alone left the HUD bright
  // while clicks did nothing — that divergence is what collapsed them here.
  // Pure arithmetic over its arguments: it reads no state, so the render-side
  // callers cost nothing and the sim's call is hashed exactly as the inline
  // expression it replaces was.
  cometOn(running, en, enMax, press) {
    return running ? en > 0 : (en > 0 && en >= enMax * ENARM && press);
  },
  // ---- THE GENERAL ARM RULE, and the only copy ---------------------------
  // cometOn above answers ONE ability; this answers every other one, and it is
  // written on day one for the reason cometOn was written on day 400: three
  // consumers each carried their own copy of "may this seat arm?", and adding a
  // term to the sim's copy alone left the HUD bright while the clicks did
  // nothing. Every consumer calls THIS.
  //
  // TWO consumers today, not three: the drain slice — whose replay inside
  // js/net.js's predictor is the second evaluation of that same call — and event
  // mode's inputAbility. A HUD availability dim is the third and does NOT exist
  // yet. Writing the rule before the second consumer rather than after the third
  // is the whole point; naming an imaginary third is how the next reader
  // concludes the rule is already load-bearing everywhere when it is not.
  //
  // `id` is an ABILITY ID and never a loadout position — the sim does not know
  // what a slot index is. `slot` is that ability's own record; `owned` is the
  // seat's rank vector, the ownership the sim already holds; `press` is the
  // fresh edge off the `ap` mask.
  //
  // The catalog lookup is inside on purpose. Taking a `def` argument would let
  // two consumers disagree about how a def is FOUND, which is the same class of
  // divergence the function exists to end.
  //
  // Ownership: a record with a null `row` is available to every seat — that is
  // every record today, because the shop has no ability rows yet (they land
  // with the shop round). The clause is written now so the day a row appears it
  // is a data edit, not a new gate in three places.
  abilityOn(id, slot, owned, press, en) {
    const A = window.Abilities;
    if (!A) return false;
    const d = A.def(id);
    if (!d || !d.spawn) return false; // a mask bit the catalog does not name, or
                                      // an id whose state lives elsewhere (fire's
                                      // P.cool, comet's pool) — never armable here
    if (!press) return false;         // press-armed; a hold-armed record declares
                                      // itself the day one exists
    if (!slot || slot.cd > 0) return false; // keyed by ability id, so moving the
                                      // ability to another button cannot hand it a
                                      // fresh cooldown — the loadout-swap dodge
    // the ENERGY price, judged the way cometOn judges the comet's: the pool is
    // GENERAL and this is simply its second consumer. A record with no `en`
    // costs nothing and this clause is an exact no-op for it.
    if (d.en > 0 && !((en || 0) >= d.en)) return false;
    if (d.row === undefined || d.row === null) return true;
    return (((owned && owned[d.row]) | 0) > 0);
  },
  // ---- pass B: the per-seat ENERGY body -----------------------------------
  // The one place a comet WANT becomes a comet. The input layer only ever
  // states what the button is doing (input.cometWant); this decides whether
  // the seat's pool can pay for it. It is the ONLY writer of K.comet inside
  // the sim: a client that gated its own button would fly a free comet.
  energySlice(K, ctx) {
    // the press latch is CONSUMED first, before the liveness test below — a
    // click made while the seat is down is spent here and cannot arm the
    // comet at respawn off a stale press (see the declaration in makePlayer)
    const press = K.input.cometPress === 1;
    K.input.cometPress = 0;
    // the SEAT's own RECHARGER rank sets its regen — off ctx.terms, so one
    // seat's purchase can never speed another's recharge
    const m = ctx.terms;
    const regen = ENREGEN * (1 + ENRECH * (m ? m.enRech : 0));
    K.energyMax = Flight.cap(m); // the mirror first: everything below clamps against it
    if (!ctx.alive) {
      K.comet = false; // a corpse spends nothing and rams nothing...
    } else {
      // the WANT is the held bit and nothing else; Flight.cometOn above is the
      // arm rule itself, and this is its one authoritative call site — the HUD
      // dim and the predictor's cue read the same function so they cannot
      // disagree with the sim about whether a click would arm.
      const want = K.input.cometWant;
      K.comet = want && Flight.cometOn(K.comet, K.energy, K.energyMax, press);
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
    // ---- THE DENOMINATOR RESCALES (FIX ROUND, S3BR-08) -----------------
    // It was 4 — `VMAX x 2` at the retired `VMAX` of 2 — so a base-cap wall
    // slam normalized to 2/4 = 0.5 and the band above it was for a boosted or
    // comet impact. After the flip `VMAX` was 5 and the SAME ordinary collision
    // read min(1, 5/4) = 1: every full-speed wall contact saturated the cue and
    // sounded twice as strong in normalized terms, erasing the distinction the
    // gain exists to draw.
    //   THE RATIO IS THE INVARIANT AND IT IS DERIVED, not restated: `VMAX * 2`,
    // which reads 8.1666 at the shipped tuner since D50 (PORT-F) and reproduced
    // 10 before it and the old 4 at the old scale. And `wallHit` is read AFTER
    // the damp on the same tick, so the whole cue rides DAMP too. It is the LIVE tuner value, so dragging the max-speed slider moves
    // the normalization with it — which is what "a base-cap slam is half" has
    // always meant.
    if (wallHit > 0) fx.thud(K.ship.x, K.ship.y, Math.min(1, wallHit / (VMAX * 2)));
    // no camera here: the view follows in the frame loop, after step() returns —
    // the simulation runs the same with no camera at all
    K.flame.x += (K.thrustAcc.x - K.flame.x) * FLAME_EASE;
    K.flame.y += (K.thrustAcc.y - K.flame.y) * FLAME_EASE;
    K.thrustAcc.x = K.thrustAcc.y = 0;
    if (K.cool > 0) K.cool--;
    // ...and every ability slot's clocks with it, for the same reason and in
    // the same place: a corpse's cooldown runs down too. Ability 0's cooldown
    // IS K.cool above — it predates the record, is already hashed and already
    // on the wire, and re-encoding it here would move 25 traces to change
    // nothing.
    if (window.Abilities) Abilities.tick(K);
  },
};
window.Flight = Flight; // the vm sandbox and the page both reach it here; a
                        // classic script's top-level const is not a window
                        // property, and phase 11b's predictor needs the name
// The in-place wiring's two caller-owned adapters, allocated ONCE: the passes
// run every tick for every seat, and a per-seat object literal per pass would
// be pure garbage. Neither is re-entrant and neither needs to be — a slice
// call returns before the next one starts.
const FLIGHT_CTX = { alive: true, terms: null, keyThrust: null,
  thrustFrame: null, // the seat's KEY-VECTOR MAP (D12), bound per seat by the
                 // drain because the frame reads that seat's own converged nose.
                 // It is a ctx entry rather than a direct call so the kernel
                 // keeps knowing nothing about seats — the same reason keyThrust
                 // is one.
  owned: null }; // the seat's RAW rank vector — the ownership Flight.abilityOn
                 // judges an ability against. `terms` beside it is the DERIVED
                 // view and cannot answer "does this seat own it at all".
const FLIGHT_FX = {
  seat: 0,
  thud(x, y, gain) {
    // queued through the encounter's event stream — the crossing that runs
    // game → encounter, which is why Encounter.emit is published at all
    if (window.Encounter) Encounter.emit("thud", { x, y }, gain, this.seat);
  },
  fire() { fire(this.seat); }, // bullets, ids and the cap are the caller's
  // ...and the general twin: the drain slice has already run the arm rule and
  // paid the cooldown, so this sink only has to spawn. The predictor's sink
  // does NOTHING here on purpose — js/net.js's speculative tracer is hardcoded
  // to the standard round's ballistics, so cueing an ability through it would
  // draw a normal bullet for a shot that is not one. A silent ability is honest
  // until the tracer learns the catalog.
  ability(id) { abilityFire(this.seat, id); },
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
// ...and the RAW vector the ARM RULE judges ownership against. termsOf answers
// with derived terms and cannot say whether a seat owns an ability at all.
const ownedOf = (s) => (window.Encounter && Encounter.ownedFor ? Encounter.ownedFor(s) : null);
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
  leftHeld: false, // ...and there is no rightHeld beside it: D30 unbound that
                   // button and C2 took the field with its last reader
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
// ---- OPTION B: THE PANELS SIT OVER THE LIVE WORLD (S3b lane 3, commit D3) --
// THE OWNER'S RULING, S-3g5hk7, arriving with the world it describes: "the FULL
// 16:9 RENDER EXTENT, UI OVER THE LIVE WORLD AT THE SIDES". The field takes the
// whole window fit and the two panels are BANDS drawn over its left and right
// edges, in device space, outside the field transform exactly as they always
// were — what changes is where the band is, not how it is drawn.
//
// WHY THE RESERVATION HAD TO GO, and it is arithmetic rather than taste. The
// letterbox used to RESERVE `GUTTER` CSS px per side, which worked because a
// 512x342 field (3:2) in a 16:9 window already left real pillarbox to spend.
// The arena is 16:9 now. On this repo's own headless window (780x493) the
// gutterless fit is 0.609 and the reserved fit is 0.328 — the field would give
// up 46 % of itself to grow its menus, which is precisely what FIELD_MIN was
// written to forbid. With the floor holding, `ox` lands at 58.5 CSS px against
// a PANEL_MIN of 60 and BOTH PANELS SIMPLY STAND DOWN: no shop, no board, no
// click path, on every window whose aspect is near the field's own.
//
// SO THE BAND IS NOT TAKEN OUT OF THE FIELD. `GUTTER` is now the band's WIDTH
// and nothing is subtracted from the fit; the field is centred at its full
// scale and the bands overlay it. `panelsOn`, `panelPlace`, `panelAt` and
// `panelToClient` all read the band rather than `ox`, so the hit test still
// inverts exactly the transform the draw used — the one property that whole
// group of functions exists to hold.
//
// FIELD_MIN IS GONE WITH THE RESERVATION. It floored a trade that no longer
// happens: the field never pays for the panels now, so there is nothing for a
// floor to protect.
let GUTTER = 180;       // CSS px of BAND at each side, drawn OVER the field
let scale = 1;
let ox = 0;
let oy = 0;
let dpr = 1;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(Math.max(1, window.innerWidth) * dpr);
  canvas.height = Math.round(Math.max(1, window.innerHeight) * dpr);
  // THE FULL FIT — Option B. Nothing is reserved; the panels overlay.
  scale = Math.min(canvas.width / FW, canvas.height / FH);
  ox = (canvas.width - FW * scale) / 2;
  oy = (canvas.height - FH * scale) / 2;
  hintTop = (oy + (FH / 2 + 96) * scale) / dpr; // just below the pause hints, in field space
  pausemenu.style.top = hintTop + "px"; // both paused screens hang from the same line —
  pausemenu.style.maxHeight = Math.max(60, window.innerHeight - hintTop - DEV_MARGIN) + "px";
  placeDevPanel(); // the panel earns the hint space back — see below
  if (window.FX) FX.resize(); // the light layers follow the backing store
  // D47: the star readout states the DEVICE side, which is a function of dpr —
  // and dpr is re-read here on every browser-zoom change. Without this the
  // readout goes stale the moment the window does. Guarded because resize()
  // runs before showTuner is reachable on the first load.
  if (typeof showTuner === "function") showTuner();
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
// The band, in DEVICE pixels: `GUTTER` CSS px per side, but never more than a
// quarter of the window — a narrow window must not hand half its width to two
// menus. One derivation, read by the four functions below and by nothing else.
const panelBand = () => Math.min(Math.round(GUTTER * dpr), Math.floor(canvas.width * 0.25));
const panelsOn = () => PANELS && !!(window.Encounter && Encounter.panelSpec)
  && panelBand() / dpr >= PANEL_MIN;
const panelCompact = () => ox / dpr < PANEL_COMPACT;
// fit a logical panel space {w, h} into the left or right bar: one uniform
// scale, centred both ways. Null when the bar has no room at all.
function panelPlace(spec, side) {
  const m = PANEL_MARGIN * dpr;
  const band = panelBand();
  const k = Math.min((band - 2 * m) / spec.w, (canvas.height - 2 * m) / spec.h);
  if (!(k > 0)) return null;
  const x0 = side === "left" ? (band - spec.w * k) / 2
                             : canvas.width - band + (band - spec.w * k) / 2;
  return { x0, y0: (canvas.height - spec.h * k) / 2, k };
}
// which panel a device-pixel point lands in, and where in that panel's own
// logical space — the ONE conversion the pointer routing below uses, so the
// hit test always inverts exactly the transform the draw used
function panelAt(bx, by) {
  if (!panelsOn() || !G.started) return null;
  const band = panelBand();
  const side = bx < band ? "left" : bx > canvas.width - band ? "right" : null;
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
// no easing; "lookahead" is smooth toward a led point — D11's rule, spelled
// out at cursorOffset() below: CAMLEAD ticks of the ship's own velocity plus
// CURSORPULL of the cursor's offset from the pane centre, through the LEADDZ
// commit gate (gatedLead) that sits between the ideal lead and the camera
// target; "flip" treats the world as a 6×11
// grid of view-sized rooms and slides to the ship's room over FLIP_MS with
// a cubic ease-out — retargeting mid-slide if the ship crosses into yet
// another room. Smooth and lookahead also wear a LEASH: after the ease,
// cam clamps so the ship sits at least EDGEMARGIN px inside every view
// edge — an oversized lead saturates at the leash instead of pushing the
// ship off screen. The world clamp still runs last, so a ship within
// EDGEMARGIN of a world wall keeps less margin but never leaves the view.
let CAMMODE = "lookahead"; // lock | smooth | deadzone | lookahead | flip (pause-screen selector)
// THE THREE DIALS D11 CARRIED, and production's own numbers stay cited beside
// them because both are load-bearing: the owner's are what he flew and passed,
// this file's are what a reader would otherwise take these lines to have always
// said. The source is the PORT-W feel gate, 2026-08-24, recorded verbatim in
// .ai-reference/prompts/port-w-20260824/FEEL-GATE.md and carried by
// PORT-S-DEBT.md. EDGEMARGIN 60 was already his number and did not move.
//   AND THEN HE FLEW IT AGAIN. D52 (the owner's panel, 2026-08-27): "The camera
// settings look much better like this" — CAMLEAD 60 -> 30 and LEADDZ 200 -> 0.
// LEADDZ was his number at the PORT-W gate and is not any more, which is the
// whole reason both halves of that sentence are written out here.
let CAMEASE = 0.05;     // smooth/lookahead — fraction of the gap closed per tick (slider).
                        // THE OWNER'S; this file shipped 0.08 until D11.
let CAMBOX = 0.4;       // deadzone — the inner box, as a fraction of the viewport (slider)
let CAMLEAD = 30;       // lookahead — ticks of velocity the target leads by (slider).
                        // THE OWNER'S, AND MEASURED NOW. This file shipped 25 until D11 and
                        // 60 until D52. At D11 he chose 60 at the TOP of a rail that stopped
                        // at 60, so that number was a FLOOR on his preference rather than a
                        // measurement. The rail reaches 150 since, he flew it, and he chose
                        // 30 (2026-08-27). It is a measurement now, and it is a HALVING —
                        // the earlier reading pointed the wrong way.
let CURSORPULL = 1.0;   // lookahead — D11 ITSELF, and the one dial here with NO production
                        // counterpart before it: a GAIN on the cursor's offset from the
                        // pane centre. 1.0 is the owner's own Blend 0.5. See cursorOffset().
                        // NEVER FLOWN at this value — it was reached by algebra rather than
                        // by his hand on a slider, which is why the row exists.
let LEADDZ = 0;         // lookahead — ms a conflicting lead direction must persist to commit;
                        // 0 = GATE OFF, and off is what the owner chose at D52. It was 200,
                        // his own PORT-W number, until he flew the halved lead beside it:
                        // a 30-tick lead reverses half as far, so the judder the gate was
                        // built against is half as loud and the gate's own lag is what is
                        // left. The commit gate below reads this and short-circuits at 0.
let EDGEMARGIN = 60;    // smooth/lookahead leash — min px between the ship and every view edge (slider)
                        // EXEMPT FROM COMMIT C's x2.5, and it is the sharpest exemption on
                        // the table. This is the OWNER'S OWN DIAL, chosen at the PORT-W feel
                        // gate on a 1280x720 pane and PASSED there — so it is ALREADY an
                        // arena-px number, and the arena is what production has just moved
                        // into. Multiplying it would revert the feel gate, and it would
                        // break the alarm too: js/encounter-host.js holds the declared third
                        // copy of this rule at 60 and demo-host LEG 5 reds if the two
                        // disagree. The other four camera dials need no clause at all —
                        // CAMEASE and CURSORPULL are fractions, CAMLEAD is TICKS (its px
                        // come from a velocity that rescaled itself) and LEADDZ is ms.
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
// D11 — THE CURSOR HALF OF THE OWNER'S CAMERA RULE, and the mechanism this file
// did not have at all before it.
//
// He stated the rule himself, 2026-08-24, after four rounds of camera work had
// chased something else:
//
//   "the whole camera adjustments i really wanted was just the ability to
//    slide the camera center away from the center of the ship depending on
//    where the cursor is and the current velocity vector of the ship, with a
//    blend between those two."
//   "(( ShipCenter + leadVec ) * (1 - Blend) + CursorCenter * (Blend)
//    So halfway between ShipCenter and CursorCenter at 0.5, right?"
//
// IMPLEMENTED IN ITS SOLVED FORM, AND THAT IS NOT A LIBERTY. The literal formula
// has the camera on BOTH sides: CursorCenter is a WORLD point, and the view →
// world conversion runs through the camera itself. Write the camera CENTRE as
// Cc, the ship as Sh, the velocity lead as L, and the cursor's offset from the
// PANE CENTRE as u. The cursor's world point is Cc + u by the definition of the
// pane centre, so
//
//     Cc = (Sh + L) * (1 - B) + (Cc + u) * B
//     Cc * (1 - B) = (Sh + L) * (1 - B) + u * B
//     Cc = Sh + L + u * B / (1 - B)
//
// TWO CONSEQUENCES, and neither is what the formula READS like:
//
// 1. THE MIX TERM IS A GAIN, B / (1 - B). So the dial IS that gain, and it is
//    named CURSORPULL and not Blend. CURSORPULL 1.0 IS the owner's Blend 0.5 —
//    the camera exactly halfway between the ship and the cursor. The literal
//    dial would have been dead over most of its rail: gain 0.33 at B 0.25, 1 at
//    0.5, 3 at 0.75, 9 at 0.9, and UNDEFINED at B 1, where no solution exists at
//    all, since a screen-FIXED cursor cannot be put at the view centre. The Edge
//    leash saturates that instead of letting it diverge, which is exactly why a
//    literal dial would have been mistaken for one that stops doing anything
//    above about 0.6. CURSORPULL is linear across its whole rail.
//    DO NOT "RESTORE" THE LITERAL FORMULA. The panel has no tooltips, and this
//    comment is now the only place the equivalence is recorded in a file that
//    ships — the lab copy that used to carry it is what PORT-S deletes.
//
// 2. THE (1 - B) ON THE LEAD CANCELS. The velocity lead arrives at FULL strength
//    at every setting. CAMLEAD and CURSORPULL are two INDEPENDENT amounts and
//    not a seesaw — "lead my own motion" and "look where I point" are tuned
//    separately, which is a feature. It is also why no (1 - pull) factor appears
//    below, and why its absence is not an omission.
//
// u IS CAMERA-INDEPENDENT, and it has to be or the camera is back on both sides
// of its own equation. It is read from the cursor's PANE point directly — lcur
// is already view/field coordinates, and pointerField() puts the native pointer
// in that same frame — and never from wcur or lcurWorld(), which are those very
// points with `cam` already added. The 03M-D aim drift (1f118bb) came from
// banking an absolute world POINT the camera then moved out from under; a
// displacement has no absolute point in it and cannot carry that fault. This
// camera has no scale term anywhere, so the pane offset IS the world offset;
// js/demo-render.js divides its copy by the lab's zoom and there is no z here to
// divide by.
//
// THE CURSOR IT READS IS THE ONE THE PLAYER CAN SEE — locked mode's drawn
// cursor, mouse mode's native pointer. That is bankTickInput()'s rule and it
// must be the same rule here: a camera that slid toward the hidden cursor while
// the shots left along the visible one is the two-cursor defect S1 paid for once
// already, wearing a different hat.
//
// NO CURSOR IS NO PULL. Mouse mode before the first pointer event has no pointer
// at all, and a canvas with no box yet resolves to none. Zero is the right answer
// there: with no cursor there is nothing to look toward.
//
// THE GUTTERS ARE REACHABLE AND THAT IS FINE. clampLcur() deliberately lets the
// drawn cursor leave the field rect to reach the shop panel, so |u| can exceed
// half the pane. The leash saturates it, which is the same thing an oversized
// CAMLEAD has always done — see updateCamera().
function cursorOffset() {
  const p = lockedMode() ? in0.lcur
    : G.mouse.seen ? pointerField(G.mouse.x, G.mouse.y) : null;
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return { x: 0, y: 0 };
  return { x: p.x - FW / 2, y: p.y - FH / 2 };
}
// lookahead's lead vector — D11's rule: CAMLEAD ticks of the ship's own
// velocity, plus CURSORPULL times the cursor's offset from the pane centre.
//
// THE VELOCITY UNIT IS THE TRAP, AND IT POINTS THE OTHER WAY HERE. P.vel is px
// per TICK, so `P.vel * CAMLEAD` is CAMLEAD ticks of it and there is no divide;
// js/encounter-host.js divides by 60 because the kernel stores px per SECOND.
// The number 60 means the same thing in both files, but only one may divide.
// THE ARITHMETIC, AS SHIPPED: VMAX is 4.0833 px/tick (see :80) since D50
// (PORT-F), i.e. 244.998 px/s, and CAMLEAD is 30 (D52, the owner's panel
// 2026-08-27), so the throw at top speed is 30 x 4.0833 = 122.5 px, which the
// panel rounds to 122 — the number showTuner prints. THE TWO PLANES HAVE
// CONVERGED: the lab's own cap is 245 px/s and the same dial buys 30 x (245/60)
// = 122.5 px there, the same throw to the digit. Before D50 this ship ran at
// VMAX 5 and threw 150 px. Nothing here needs re-deriving; the print reads
// VMAX live.
// THIS BLOCK PREVIOUSLY READ "at VMAX 2 px/tick this ship tops out at 120 px/s
// ... CAMLEAD 60 buys about 120 px of lead here and about 245 px there", which
// was stale twice over: VMAX has been 5 since commit C's x2.5, and D52 halved
// CAMLEAD to 30. Anyone tuning from that text tuned in the wrong direction.
// The remaining difference is the THROW, and it is a property of the world
// rather than a unit slip — a FEEL-GATE flag, not something to "correct" by
// rescaling the owner's number behind his back.
//
// AIMLEAD, LEADBLEND AND LEADSRC ARE GONE, and the reason is that the rule
// replaced them rather than retuned them. They mixed the velocity lead with a
// UNIT-direction aim lead (fireDir() stretched to AIMLEAD px), which PANS a
// fixed distance along a bearing — it buys forward reach by selling rearward
// reach. The owner's rule SLIDES the view a proportion of the way to the cursor.
// The two disagree about what the camera is FOR, so four of the selector's five
// branches had nothing left to select. "swap" went with them: D30 had already
// collapsed it onto "aim", and S1 left the option standing on purpose so that
// this commit could retire it beside the rule that supersedes it, rather than
// have a deletion smuggled into the commit that emptied it.
// THE VELOCITY TERM IS CLAMPED, AND THE CLAMP IS NOT INERT (D52, PORT-L).
// LEADCAP is a hash-free render-only guard: it is in no tunable record and gets
// no panel row, and demo-host's dial alarm reads only the five `let NAME = n;`
// lines, so a `const` here does not disturb it.
//   THE NUMBERS, RE-DERIVED AT D50 (PORT-F). A rank-0 comet tops out at
// VMAX 4.0833 x COMETVMAX (15/4.0833) = 15 px/tick EXACTLY — the ruling holds
// that number — so its velocity lead is 30 x 15 = 450 px, exactly AT the clamp
// and inside the 580 px leash (FW/2 - EDGEMARGIN). But AFTERBURNER is ADDITIVE
// px/tick on VMAX and is UNCAPPED (js/encounter.js: speed = 2.5 x rank), and
// the comet factor composes with it: rank 1 gives (4.0833 + 2.5) x 3.6735 x 30
// = 725.5 px and rank 2 gives 1001.0 — both PAST the leash, and both HIGHER
// than the 675 / 900 they were before D50, because holding the rank-0 cap at 15
// against a smaller VMAX raises every rank above it. "Both under 580 so the
// clamp buys nothing" is the rank-0 reading and it is false for any pilot who
// bought the row.
//   IT CLAMPS THE VELOCITY TERM AND NOT THE SUM. Clamping the returned vector
// would bound the CURSOR PULL as well, which is a different rule with a
// different owner ruling behind it.
const LEADCAP = 450;
function leadVec() {
  const P = localPlayer(); // VIEW: the lead belongs to the ship the camera follows
  const u = cursorOffset();
  let vx = P.vel.x * CAMLEAD, vy = P.vel.y * CAMLEAD;
  const m = Math.hypot(vx, vy);
  if (m > LEADCAP) { const k = LEADCAP / m; vx *= k; vy *= k; }
  return { x: vx + CURSORPULL * u.x,
           y: vy + CURSORPULL * u.y };
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
  if (im < LEAD_EPS || cm < LEAD_EPS || i.x * gate.x + i.y * gate.y >= 0.5 * im * cm) {
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
// THE RIGHT BUTTON NO LONGER HIDES THE CURSOR, because it no longer flies the
// ship — D30. cursorHidden() was `mouseMode() && G.running && G.rightHeld &&
// !frozen()`, and with the button unbound its middle term is never true, so the
// whole predicate was a constant false and is gone. Mouse mode keeps its native
// pointer at every moment now, which is one of D30's four shipped-default play
// changes: the cursor aims, so taking it away was always the role swap's doing.
// LOCKED mode is untouched — it hides the CSS cursor for the whole running
// session because its held lock hides the native pointer anyway and the canvas
// draws its own.
function syncCursor() {
  canvas.classList.toggle("hide-cursor", lockedMode() && G.running);
  // ...and the pointer over a live frozen overlay is a menu pointer, not the
  // crosshair the field wears. Both classes are set from one place so they
  // cannot contradict: hide-cursor only ever applies in flight, this only
  // ever over a freeze, and the two states are mutually exclusive above.
  // Locked mode opts out — its frozen shop runs on the drawn cursor.
  canvas.classList.toggle("ui-cursor",
    !lockedMode() && G.running && !!(window.Encounter && Encounter.frozen()));
}
// THE ROLE SWAP IS GONE — D30. `aiming()` was `G.rightHeld !== INVERT`: while
// it held, the mouse owned the aim and the keys thrust; otherwise the mouse
// thrust and the keys snapped the stored aim. The owner deleted the swap, so
// there is one arrangement and it is the one that was already the shipped
// default: THE CURSOR AIMS, THE KEYS THRUST, LMB FIRES. Every site that asked
// the predicate has been resolved to its TRUE arm rather than left behind a
// constant, so the file no longer describes a choice nobody can make.
//
// `INVERT`, `G.rightHeld` and `aiming()` are GONE, and so are the two setters
// that wrote them — deleted here with EVERY reader restaged in the same commit,
// which is the ruling. A no-op shim would have left 76 call sites across tests/,
// test/tools/ and server/selfcheck.mjs silently vacuous: still calling, still
// green, still describing a role swap the game no longer has. The staging those
// sites did is not replaced anywhere, because there is nothing left to stage.
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
  if (INPUTMODE === "tick") { in0.acc.ap |= AB_FIRE; return; }
  // event mode banks nothing, so the claim latch is set at the press itself —
  // the tick that follows reads it and step() clears it. Ahead of fire(),
  // which refuses a dead seat outright: the press has to count precisely in
  // the case the shot does not.
  in0.claimPress = 1;
  fire();
}
// inputFire's GENERAL twin — every ability from AB_FIRST up. Tick mode ORs the
// bit into the accumulator and lets the drain do everything else, which is the
// whole reason this works in net mode: the bit rides the banked frame upstream
// and the SERVER arms the ability for whichever seat that socket holds. Setting
// a module-level latch in the DOM handler instead — the lazy version — does
// nothing at all in net mode, because the local sim never steps there.
//
// Event mode banks nothing, so it arms at the press itself, exactly as
// inputFire fires at the press. It calls the SAME Flight.abilityOn, so the two
// modes cannot disagree about whether a press arms.
function inputAbility(id) {
  if (!Abilities.exists(id) || id < AB_FIRST) return;
  if (INPUTMODE === "tick") { in0.acc.ap |= Abilities.bit(id); return; }
  const P = players[0];
  const sl = Abilities.slot(P, id);
  if (!seatAlive(0)) return;
  if (!Flight.abilityOn(id, sl, ownedOf(0), true, P.energy)) return;
  const d = Abilities.def(id);
  if (d && d.en > 0 && !Flight.spend(P, d.en)) return; // spend's answer is read here
                                                       // too — see the drain's note
  sl.cd = d ? d.cd | 0 : 0;
  abilityFire(0, id);
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
    b.acc.ap = 0; // the whole press mask, and for the accumulator's own reason:
                  // every ability's edge is discarded with the ring it would
                  // have ridden in on
    b.acc.n = 0;
    b.fireHeld = s === 0 ? G.leftHeld : false; // only seat 0 has a local mouse
    b.claimPress = 0; // a press made under a frozen overlay is discarded with the
                      // ring it would have ridden in on — the shop's own click is
                      // not a request to be dealt back into the field
    b.cometPress = 0; // ...and so is a comet press: the edge must not survive
                      // to the first unfrozen tick (transport only, like the rest)
    if (window.Abilities) Abilities.clearPresses(players[s]); // ...and every other
                      // ability's latched press with them. The cooldowns stay:
                      // a shop visit is not a refund
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
  // THE BANK TAKES THE CURSOR THE PLAYER CAN SEE. It took lcurWorld() in BOTH
  // aim modes, and in mouse mode nothing moves `lcur` — so the banked aim was
  // the hidden locked-mode cursor while fireDir() read the visible native
  // pointer through `wcur`. Two cursors, one seat. It was inert while nothing
  // hashed read the banked point; D12 made it PLAYER-VISIBLE, because the nose
  // converges on the BANKED cursor and the default ship frame rotates WSAD by
  // that nose: with the pointer east and a stale lcur north, the shots went
  // east while the ship turned north and W accelerated north with it.
  //   clientStep() refreshes wcur immediately before this call, so the value is
  // this tick's. LOCKED mode is unchanged — its drawn cursor IS lcur, and that
  // is the pointer its player sees.
  const w = mouseMode() && wcur.seen ? wcur : lcurWorld();
  in0.ring.push({ tx: in0.acc.tx, ty: in0.acc.ty, ax: in0.acc.ax, ay: in0.acc.ay,
                  cx: w.x, cy: w.y, ap: in0.acc.ap, ah: heldAbilityMask(), kx, ky,
                  // THE THRUST FRAME RIDES THE FRAME IT MODIFIES. It was a
                  // process GLOBAL for one commit, and a global cannot be right
                  // on a server: one host, one value, and it could honour
                  // neither a pilot who chose `screen` nor two seats choosing
                  // differently — while js/net.js predicted with the CLIENT's
                  // choice, so a screen-mode pilot's own W disagreed with the
                  // authority on every held tick and the correction rubber-
                  // banded it back. Stamped here, it is ORDERED against the
                  // kx/ky it rotates and PER-SEAT by construction.
                  //   ABSENT MEANS `ship`, the default, so a frame from any
                  // producer that does not care carries nothing and gets the
                  // shipped behaviour. Only the non-default is spelled — the
                  // `vt` idiom, and the same reason: absence must be a meaning
                  // rather than a zero.
                  ...(THRUSTFRAME === "screen" ? { tf: "screen" } : {}) });
                  // TWO MASKS and nothing else: `ap` is the tick's accumulated
                  // press edges, `ah` the buttons' live LEVELS read at the bank.
                  // The three named booleans they replaced — fp, fh, rh — are
                  // gone from the frame entirely; step() still never reads
                  // G.leftHeld or G.rightHeld, it reads what was banked.
  in0.acc.tx = in0.acc.ty = in0.acc.ax = in0.acc.ay = 0;
  in0.acc.ap = 0;
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
    cx: f.cx, cy: f.cy, kx: f.kx, ky: f.ky,
    // the two ability masks, through the ONE normalizer: a finite check and an
    // UPPER LID, never `+f.ap || 0`, which admits Infinity (the defect bf2c961
    // fixed). Default 0 — a frame carrying no masks decodes as no ability
    // pressed and none held, never undefined. That is the old rh normalizer's
    // own contract, generalized to every ability at once.
    ap: Abilities.mask(f.ap), ah: Abilities.mask(f.ah) };
  // vt (phase 15) copies only when PRESENT and integer — ABSENT is the
  // default, so a frame without a view tick stays byte-identical to every
  // committed fixture's F() record and earns a zero rebate at the drain
  if (Number.isInteger(f.vt)) rec.vt = f.vt;
  // ...and the THRUST FRAME (D12), on the same terms as vt: only the NON-DEFAULT
  // is copied, and an unrecognised value falls through to absence rather than
  // being clamped into one — a mode has an enumeration, not a lid, so a value
  // outside it is meaningless rather than large (the R1 mask lesson). Absence
  // IS `ship`, so a frame from any producer that does not care stays
  // byte-identical to every committed fixture's record.
  if (f.tf === "screen") rec.tf = "screen";
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
    FLIGHT_CTX.terms = null; // the drain derives nothing from ranks...
    FLIGHT_CTX.owned = ownedOf(s); // ...but the ARM RULE judges ownership against
                     // the seat's own raw vector, which is a rank test and not a
                     // formula. Per seat, so one seat's purchase can never arm
                     // another's ability
    FLIGHT_CTX.keyThrust = keyThrustUnlocked; // the gate, still evaluated per frame
    FLIGHT_CTX.thrustFrame = (mode, kx, ky) => thrustFrame(s, mode, kx, ky); // ...and
                     // the MAP, bound to THIS seat: every seat rotates by its
                     // own nose, and by the mode its own frame carried
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

// Bullets, the direction marker and aim-aware cameras share this. The
// cursor-aim modes ALWAYS resolve against the pointer's live position now — D30
// deleted the arrangement in which mouse motion owned flight — so the fall-
// through below serves the pre-pointer case alone: the stored aim, then the
// ship heading until the first aim (the CQ behavior).
function fireDir() {
  if (cursorAim()) return mouseAimDir();
  const P = localPlayer(); // the DOM client's own seat; seatFireDir serves the rest
  if (P.aimed) return { x: Math.cos(P.aimAngle), y: Math.sin(P.aimAngle) };
  const s = Math.hypot(P.vel.x, P.vel.y);
  return s < REST_EPS ? null : { x: P.vel.x / s, y: P.vel.y / s };
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
  return s < REST_EPS ? null : { x: P.vel.x / s, y: P.vel.y / s };
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
// the older aim. Mouse mode already resolves locally against its live pointer,
// so this hands back fireDir() unchanged there. Render pass ONLY: never step(),
// never a hash — lcur is input state, exactly as its declaration says.
function markerDir() {
  if (lockedMode() && INPUTMODE === "tick") return cursorDir(lcurWorld());
  return fireDir();
}

// ---- P1's `ordnance-step` PASS ---------------------------------------------
// The primitive the plan rules built in full this round (§2.3 P1): the guarded
// state block `{hp, trk, phase, flank}` beside BULLET_HASH, and THIS pass, which
// runs immediately BEFORE `b.px = b.x` in the bullet loop.
//
// THE PLACEMENT IS THE WHOLE PRIMITIVE, and it is worth saying why rather than
// leaving it to the call site's one-line comment. `px -> x` IS THE SWEPT HIT
// SEGMENT — the encounter's `resolveBulletHits` tests that chord, not the
// round's position. So a round that turns, splits, phases or re-aims must do it
// while `px` still holds the PREVIOUS tick's position, or the segment it is
// tested on describes a path the round did not take: the turn shows on screen a
// tick before it shows in the collision, and the two disagree for exactly one
// tick per steering decision. A pass placed one line lower is not "slightly
// late", it is a different simulation. The ORDER leg in tests/wave1-checks.js
// pins it, and moving this call below `b.px = b.x` is that leg's sabotage.
//
// IT IS INERT TODAY, deliberately. R6 builds the block and the pass; R8a adds
// the `b.k` kind byte and the CONTENT that uses them (the plan's own division —
// "R8a then adds only the `b.k` byte and the content that uses the block,
// instead of overloading the byte to carry state"). So the steppers list below
// is EMPTY, the first test costs one property read per round per tick, and
// every committed trace holds.
//
// PUBLISHED MUTABLE, on Engine.MATRIX's exact footing: a plane nothing can
// extend is a plane nobody can test. The ORDER leg registers a stepper, drives
// one tick and puts it back, and that registration is how the leg reaches a
// non-zero block at all — nothing the shipped game can create carries one.
const ORDNANCE_STEP = [];
function ordnanceStep(b) {
  if (!ORDNANCE_STEP.length) return; // the shipped path: one read, no allocation
  // The block gate. A round whose whole block is zero has no ordnance state to
  // step, which is every round the game can currently create — so the steppers
  // never see one and R8a's content cannot accidentally fire on a plain bolt.
  if (!(b.hp || b.trk || b.phase || b.flank)) return;
  for (const st of ORDNANCE_STEP) st(b);
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
  // ox/oy is the MUZZLE, and it is render-only: the light layer clamps the
  // round's streak to the distance actually flown from it, so a round one tick
  // old wears a one-tick tail instead of a fixed 3.24-tick one hanging out
  // behind the ship. Deliberately NOT in BULLET_HASH (a declared allow-list —
  // see the contract above it): it describes where the round came from, never
  // what the simulation will do next, and the wire never carries it either.
  //   The muzzle is the NOSE — centre + SHIP_R along the fire direction — so
  // the tail and the glow leave the nozzle, not the cockpit. The HASHED spawn
  // x/y stays the CENTRE: the nose is a look, never a sim fact. This puts the
  // origin AHEAD of the round at spawn, which is why every streak clamp is a
  // signed projection along the velocity and never a bare distance.
  G.bullets.push({ id: window.Encounter ? Encounter.nextId() : 0,
                   x: P.ship.x, y: P.ship.y, px: P.ship.x, py: P.ship.y, vx, vy,
                   ox: P.ship.x + d.x * SHIP_R, oy: P.ship.y + d.y * SHIP_R,
                   r: 5.5, dmg: BDMG, owner: seat, dead: false, spent: false, // r x2.5, WAS 2.2

                   // THE SPLASH RADIUS, CAPTURED AT FIRE TIME (standing rule 5).
                   // blastAt used to read termsFor(seat).blast at IMPACT, so a
                   // rank bought while a round was in the air widened it
                   // retroactively — a purchase reaching backwards into shots
                   // already fired. The round carries what it was fired with,
                   // and nothing mutates the field afterwards, which is the
                   // whole of that rule. 0 at rank 0, and the guarded fold in
                   // hashBullets makes that cost zero bytes.
                   blastR: window.Encounter ? Encounter.blastRadius(seat) : 0,
                   ttl: Math.max(1, Math.round(BLIFE * 1000 / TICK)) }); // no upgrade touches lifetime — BLIFE is the only knob
  // the phase-15 lag REBATE, at spawn and only at spawn: a vt-bearing frame's
  // latched Δ (drainSlice) advances the new bullet Δ ticks along its own path,
  // sweeping each advanced segment against era poses in the encounter's ring,
  // and leaves an ORDINARY bullet behind — px collapsed onto x, ttl spent, and
  // no new field of the REBATE's own. (The allow-list did grow at R5, once and
  // deliberately: `blastR` above, guarded — see BULLET_HASH_GUARDED. The rebate
  // adds nothing; it carries that one through its queue record.) Defense in depth:
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

// The general spawn, and fire()'s twin. It is reached ONLY through the drain
// slice's sink (or event mode's dispatcher), which has already run the ONE arm
// rule and paid the ability's cooldown, so every gate here is a FIELD gate —
// the overlay, the corpse, the bullet cap, the direction — and never a second
// copy of "may this seat arm?".
//
// Rule 2 of the plan holds: no new damage call site. Every round it spawns is
// an ordinary bullet in G.bullets, swept by the encounter's existing pass, so
// this function adds nothing to BULLET_HASH and the wire carries the round as
// {id, x, y, o} like any other. (The allow-list itself grew once at R5 —
// `blastR`, guarded; this spawn captures it exactly as fire() does, because an
// ability's round terminates through the same splash.) Rule 4 holds too: the remote look is declared here — direction and
// speed replicate for free through the round's own position, which is the one
// thing the wire is generous about.
//   WHAT THE WIRE DOES NOT CARRY IS THE LOOK ITSELF, and the gap is REMOTE
// only now. `ink` and `streak` are stamped on the local round from the record
// and the encoder sends neither — but the OWN seat's picture no longer waits
// for the wire: js/net.js's spawnCue reads this catalog, the press edge shows
// a tracer flying this function's exact ballistics in the record's ink, and
// the hand-off stamps that look onto the adopted authoritative round and into
// the carry. What remains true is the OTHER seats' view: a remote pilot's
// rifle round still draws as an ordinary white dot until the wire carries the
// record (R7, v11 — with the heading). The SOUND never waited: the cue below
// rides the wire's event stream as a plain kind, and the predictor sounds the
// own shot on the press edge.
//
// A cooldown paid for a shot the field then refuses is deliberate. The
// predictor models the arm and the cooldown from the same slice and cannot know
// about a frozen overlay or a full bullet cap, so charging at the ARM is what
// keeps the two sides agreeing about K.slots[id].cd.
function abilityFire(seat, id) {
  if (window.Encounter && Encounter.frozen()) return; // overlays own the field
  if (!seatAlive(seat)) return;
  const P = players[seat];
  const d = Abilities.def(id);
  const sp = d && d.spawn;
  if (!sp) return;
  const dir = fireDirFor(seat);
  if (!dir) return; // at rest and never aimed — no direction exists
  let mine = 0;
  for (const b of G.bullets) if (bulletSeat(b) === seat) mine++;
  const base = Math.atan2(dir.y, dir.x);
  let spawned = 0;
  for (let i = 0; i < sp.n; i++) {
    if (mine + spawned >= BMAX) break; // the FIRING seat's own cap, owner-scoped
                                       // exactly as fire()'s is
    // the cone: one round sits on the aim, and a wider pattern spreads evenly
    // about it. `spread` is 0 on every record today, so this is an exact ×1.
    const off = sp.n > 1 ? (i / (sp.n - 1) - 0.5) * sp.spread : 0;
    const a = base + off;
    const spd = BSPEED * sp.spd; // the record scales the BSPEED slider, so that
                                 // one tuner still moves every ability together.
                                 // BMODE is deliberately NOT read here: a rifle's
                                 // muzzle speed is its own record's, not the basic
                                 // gun's cq-scale/newtonian arithmetic, and a
                                 // record that wants that inheritance will say so
    G.bullets.push({ id: window.Encounter ? Encounter.nextId() : 0,
                     x: P.ship.x, y: P.ship.y, px: P.ship.x, py: P.ship.y,
                     vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
                     ox: P.ship.x + dir.x * SHIP_R, // the muzzle, at the NOSE —
                     oy: P.ship.y + dir.y * SHIP_R, // render-only, and out of
                                    // BULLET_HASH like every other round's
                     r: sp.r, dmg: sp.dmg, owner: seat, dead: false, spent: false,
                     // the same fire-time capture fire() makes, and for the same
                     // reason: an ability's round is an ordinary bullet in
                     // G.bullets and terminates through the same splash
                     blastR: window.Encounter ? Encounter.blastRadius(seat) : 0,
                     ttl: sp.ttl,
                     // ...and the record's LOOK, render-only and out of
                     // BULLET_HASH exactly as ox/oy above are. Undefined for a
                     // record that declares none, which is what makes the draw
                     // a single `|| C.bright` and not a branch per ability.
                     ink: sp.ink, streak: sp.streak });
    spawned++;
  }
  // NO LAG REBATE, and it is a stated gap rather than an oversight. fire() calls
  // Encounter.rebate to advance a round along its own path by the frame's latched
  // view-tick delta. An ability's rebate is a per-primitive lag POLICY — a
  // hitscan rewinds, a fused round does not — and that contract lands with the
  // round that gives each primitive one. Until then an ability's round is
  // uncompensated, exactly as the comet is.
  //   AND NOTE WHAT A REFUSAL HERE COSTS. The drain already paid the whole
  // price before this function ran — the cooldown AND the energy — so a seat
  // refused here (frozen, dead, capped out, or with no aim direction) loses 45
  // ticks, 18 energy and the recharge delay, spawns nothing, and makes NO SOUND,
  // because the `fire` event below is skipped with the spawn. The player sees
  // the bar drop and hears nothing.
  //   It is deterministic on both surfaces, so prediction parity holds: this is
  // a FEEL defect, not a desync, and it is the price of letting the predictor
  // model the arm with no second copy of the rule. Closing it means moving the
  // refusal ladder above the payment, which needs the predictor to be able to
  // answer "is this seat capped out?" — that is the round that gives each
  // primitive its own refusal and lag contract, not this one.
  if (!spawned) return; // a capped-out seat makes no sound either
  // the RECORD's cue, not the standard gun's. A rifle that sounded exactly
  // like the basic round was a shot the ear could not find, which is half of
  // why the ability was undiscoverable at all. Abilities.cueFor answers "fire"
  // for a record that declares none, so nothing that shipped moves — and no
  // committed trace does either, because no fixture arms an ability above
  // COMET and the event stream is what those traces pin.
  if (window.Encounter) Encounter.emit(Abilities.cueFor(id), P.ship, undefined, seat);
}

// ---- simulation step (one ~16.7ms update) --------------------------------
// simTick counts every step() call for the run's whole life — the input
// recorder orders events against it, and E.waveTick cannot serve because it
// resets per wave. It counts frozen calls too: a replay reproduces the raw
// call stream, and the shop's frozen ticks are part of that stream.
let simTick = 0;
// THE CONVERGENCE, ported from js/demo-kernel.js by VALUE and not by import:
// the kernel is hosted dormant beside this file and stepping it here would make
// production's hash depend on a second simulation. angleDelta wraps the signed
// difference into (-PI, PI] so the nose always takes the SHORT way round, and
// rotateToward clamps one tick's worth of it. Both are the kernel's exact
// arithmetic (`js/demo-kernel.js` angleDelta / rotateToward) — same operations
// in the same order, because a re-derivation that agreed to five decimals would
// still diverge in the hash.
const TAU = Math.PI * 2;
function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function rotateToward(a, b, max) {
  const d = angleDelta(a, b);
  return a + (d < -max ? -max : d > max ? max : d);
}
// **seatFireDir FOR EVERY SEAT, AND THE REASON IS THE CAMERA.** The heading is
// HASHED, and phase 4's whole result is that the sim is CAMERA-FREE and aims in
// the WORLD frame: `seatFireDir` resolves a seat's bearing from its BANKED world
// cursor (`P.input.scur`), then the stored aim, then the velocity — every term a
// value the server has and none of them derived from a viewport.
//   `fireDirFor` was tried here first, on the reasoning that the nose should
// follow where the SHOTS go, and it is WRONG for a hashed value: it routes the
// DOM seat through `fireDir()`, which resolves `wcur` — the pointer converted
// through THIS CLIENT'S CAMERA. Two hosts with different cameras then converge
// two different noses from the same banked input, and the hash splits. The
// browser suite and the Node parity suite disagreed by exactly that, on the
// `ship` part alone, which is what found it.
//   The cost is stated rather than hidden: EVENT mode banks no cursor at all, so
// seat 0's nose there falls through to the stored aim and then to its VELOCITY.
// That is still deterministic and still reproduces in both hosts; it is simply
// not cursor convergence, and event mode is the dev A/B path — `INPUTMODE` ships
// "tick", which is where the ship frame is meant to be flown.
//   A NULL answer HOLDS the nose. At rest, never aimed, and with nothing banked
// there is no bearing to converge on, and snapping to a default would put every
// fresh seat's nose along +x for one tick.
function headingStep() {
  const max = HEADRATE * (TICK / 1000);
  for (let s = 0; s < players.length; s++) {
    const P = players[s];
    const d = seatFireDir(s);
    if (!d) continue;
    P.heading = rotateToward(P.heading, Math.atan2(d.y, d.x), max);
  }
}
// THE FRAME, applied to a key vector on its way to the kernel. `screen` hands
// back the pair unchanged — OFF is bit-identical rather than merely equivalent,
// and a rotation by zero is not applied, which also keeps a rotation from ever
// manufacturing a -0.
//   The rotation is by `a + PI/2`, because the ship's nose IS its angle and
// world y grows DOWNWARD. Checked at heading 0 (nose along +x): W (0,-1) maps to
// (1,0) — forward along the nose — and D (1,0) maps to (0,1), off the starboard
// beam. A plain rotation by `a` is 90 degrees wrong and sends W hard to port.
// This is `demo-play.html:427-446`'s expression, character for character.
// `mode` comes from the DRAINED FRAME and never from THRUSTFRAME: the global is
// the CLIENT's stamp source alone (what this page writes onto the frames it
// banks), and the sim must obey what each seat actually sent. A frame with no
// mode is `ship`, the default.
function thrustFrame(seat, mode, kx, ky) {
  if (mode === "screen" || (kx === 0 && ky === 0)) return { x: kx, y: ky };
  const P = players[seat];
  if (!P || !Number.isFinite(P.heading)) return { x: kx, y: ky }; // an unrotated
                       // pair is a far better failure than NaN thrust in the sim
  const sa = Math.sin(P.heading);
  const ca = Math.cos(P.heading);
  return { x: -kx * sa - ky * ca, y: kx * ca - ky * sa };
}
function keyDirection() {
  let x = 0;
  let y = 0;
  // THE RING ALWAYS THRUSTS — D30. The gate was `(aiming() || G.rightHeld)`:
  // the first term asked whether the mouse owned the aim, the second kept the
  // keys alive through a comet hold, because WSAD is the default engine control
  // and engaging the comet must never silence it — the hold MULTIPLIES the same
  // keys' impulses (COMETACC/COMETTURN in thrustImpulse) rather than retiring
  // them. With the role swap deleted the first term is always true, so the pair
  // collapses and the keys thrust whenever any are down. The comet clause was
  // load-bearing under the old gate and is now simply subsumed — the amplify-
  // never-silence rule it protected is unchanged and still has its own leg.
  // Client-side only: in tick mode this direction is BANKED (kx, ky) and the
  // sim drains it from the ring — the comet's sim half still arrives through
  // the ability masks alone, and step() never reads a button at all.
  if (G.keys.size) {
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
    FLIGHT_CTX.owned = null; // the energy pass runs no arm rule
    FLIGHT_CTX.keyThrust = null; // the energy pass reads no input gate
    FLIGHT_CTX.thrustFrame = null; // ...and no key vector
    // THE PRE-SPEND SAMPLE (PORT-S S5, commit C) — taken HERE, one line before
    // the drain, because this is the last moment the tick's pool is the pool
    // the pilot armed on. See AURA_F's own block.
    const EP = players[s];
    AURA_F[s] = EP && EP.energyMax > 0
      ? Math.max(0, Math.min(1, EP.energy / EP.energyMax)) : 0;
    Flight.energySlice(players[s], FLIGHT_CTX);
  }
  AURA_F.length = players.length;
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
  if (INPUTMODE !== "tick") {
    if (keyThrustUnlocked()) {
      const { x: kx, y: ky } = keyDirection();
      // event mode banks nothing, so there is no frame to carry a mode and the
      // client's own stamp IS the seat's mode. Seat-0-only, like the whole path.
      const kf = thrustFrame(0, THRUSTFRAME === "screen" ? "screen" : undefined, kx, ky);
      if (kx || ky) thrustImpulse(kf.x * KEYTHRUST, kf.y * KEYTHRUST);
    }
    // THE COMET'S OWN THRUST, event-mode half (PORT-S S5, commit F). See the
    // block at Flight.drainSlice for the whole reasoning; the only thing worth
    // repeating is WHY IT IS INSIDE THIS `INPUTMODE !== "tick"` BLOCK. Outside
    // it, a tick-mode tick would apply the term TWICE for seat 0, because
    // `drainTickInput()` has already applied it per seat through
    // `Flight.drainSlice`. Inside, each mode applies it exactly once.
    //
    // ONCE PER TICK IS THE CONTRACT, and it is what this site already has:
    // `step()` runs once per authoritative tick and this block is straight-line
    // inside it, so the term lands once whatever the transport did. The drain
    // slice's twin needed a `k === 0` gate to reach the same contract, because
    // it sits inside a per-FRAME loop that runs 0, 1 or 2 times. Corrected at
    // the S5 FIX ROUND (Codex CX-2): the term is TIME-driven, so "the same
    // scope as the keyboard vector beside it" was the wrong law for it — the
    // keyboard vector is per frame and rightly so.
    //
    // ...AND IT IS OUT OF THE KEY GATE (S5 FIX 11, the seat's ruling on the
    // asymmetry FIX 2 left). It used to sit INSIDE `keyThrustUnlocked()`, so a
    // pilot who re-locked keyboard thrust — `Encounter.mods.keyThrust`, an
    // INPUT mod that makes thrust mouse-only — lost the comet's autonomous
    // thrust with it, while a tick-mode pilot under the same lock kept it.
    // AN AUTONOMOUS, TIME-DRIVEN TERM MUST NOT DEPEND ON AN INPUT MOD: ruling
    // 8's sentence is "a coasting burning seat accelerates along its nose",
    // and a locked keyboard is exactly a coasting seat. It stays under
    // `INPUTMODE !== "tick"` (tick mode's drain applies it per seat and would
    // otherwise apply it twice for seat 0) and immediately AFTER the key block,
    // so with the mod UNLOCKED the order and the arithmetic are the ones that
    // shipped, to the bit.
    //
    // THE ALIVE GATE IS NEW HERE and it makes the two modes agree. Tick mode
    // reads `ctx.alive` at the drain; this site read nothing, so on the tick
    // after a seat died it still thrusted on the previous tick's flag while
    // tick mode refused. `energySlice` forces a corpse's `comet` false, so this
    // costs one tick and buys the two modes one answer.
    if (players[0] && players[0].comet && seatAlive(0)) {
      thrustImpulse(Math.cos(players[0].heading) * KEYTHRUST,
                    Math.sin(players[0].heading) * KEYTHRUST);
    }
  }
  headingStep(); // THE NOSE TURNS AFTER THE THRUST, and the order is the demo's
                 // rather than a preference. The lab computes its frame in the
                 // PROVIDER, before the kernel step that turns the nose, so a
                 // tick thrusts along the nose as it stood when the key was
                 // read and the turn lands behind it. Rotating by THIS tick's
                 // freshly-turned nose instead would shave one tick off every
                 // convergence and change the half-second swing that IS the
                 // passed feel. Seats walk ASCENDING, the pinned order.
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
    FLIGHT_CTX.owned = null; // ...and the integrate pass runs no arm rule either
    FLIGHT_CTX.keyThrust = null;
    FLIGHT_CTX.thrustFrame = null;
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
    ordnanceStep(b); // P1 — BEFORE the collapse below, and the order is the point
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
      // ...and the MUZZLE moves to the wall. ox/oy is render-only (the light
      // layer clamps the streak to the distance flown from it) and it measures
      // straight-line displacement, which stops meaning path length the moment
      // a round folds: a bounced round heading back at its own launch point
      // would shorten to nothing and lose its tail entirely. A reflection is a
      // new departure, so re-stamp it. Unhashed on both sides of the fold.
      if (b.x !== rx || b.y !== ry) { b.ox = b.x; b.oy = b.y; }
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
  // ---- THE SUCCESSOR PLANE STEPS HERE (PORT-S S3b lane 3, commit C) ------
  // ONE PRODUCTION TICK, ONE KERNEL STEP, and the slot is chosen rather than
  // convenient. The ships have integrated, the rounds have integrated, so:
  //
  //   1. THE POSE. Every seat production owns is written onto the kernel's
  //      seat record, from the pose production has just produced. Same tick,
  //      one read, which is the same-tick contract this lane's LEG 8 enforces.
  //   2. THE KERNEL STEP. Bodies move, their ordnance moves, and anything that
  //      reaches a posed seat goes back out through `hitPlayer`.
  //   3. Encounter.step() BELOW. Its surviving bullet sweep then meets those
  //      bodies where they NOW are — which is production's own order, where
  //      `stepEnemy` runs before `resolveBulletHits` for exactly that reason.
  //
  // THE PAGE DECIDES, NEVER THE KERNEL. This runs only where a host has been
  // installed; index.html installs one and the two lab pages install a CAMERA
  // and step the kernel off their own rAF. A surface that installs nothing
  // steps nothing, which is what keeps every kernel-oracle instrument measuring
  // the kernel alone.
  poseKernelSeats();
  if (window.EncounterHost && EncounterHost.installed()) EncounterHost.step();
  if (window.Encounter) Encounter.step(); // enemies, damage, XP, wave state
  flushWallFx(); // only the bullets the sweep left alive really met the wall
  clearClaimPress(); // ...and the tick's claim edges are spent. LAST, after the
                     // one reader: the encounter's respawn loop is the only thing
                     // that consumes them, and clearing here (rather than at the
                     // drain) is what lets event mode — which banks no frame at
                     // all — and a check's direct press land on the same rule.
}
// ---- THE SUCCESSOR FIELD'S DRAW (PORT-S S3b lane 3, commit C) -------------
// PORT-S-DEBT.md obligation 2's END STATE, and this is the half that makes it
// real: PRODUCTION'S OWN `updateCamera` decided the origin, `FRAME.cam` carries
// it, and js/demo-render.js CONSUMES it through `getCamOrigin()`'s write half
// rather than running a camera of its own. One rule drives the view on this
// page, and demo-flip asserts the other one never ran.
//
// IT DRAWS IN `Encounter.draw`'s OWN SLOT — under the camera, below the ship —
// because that is the slot the bodies were always drawn in and commit D deletes
// production's own body art out of it.
//
// THE HOSTED VIEW IS FOUR DECLARATIONS and each names something production
// owns: the fitted LETTERBOX matrix (that renderer would otherwise set its own
// devicePixelRatio transform and paint outside the bars), the logical EXTENT it
// derives from canvas pixels, its BACKGROUND (production fills its own field
// ground and draws three hashed parallax star layers over it), and its PLAYER
// draw (production's ship stays the ship, with its hull damage, its seat hue,
// its crown and its comet halo).
//
// AND NO LIGHT CONTEXT, deliberately. js/fx.js is production's bloom and it
// already reads every body in the room through `Encounter.lights()`, which
// commit C re-pointed at the kernel. A second light pass would put the same
// halos on the same surface twice, at a different radius, under a composite
// that file does not expect.
//
// THE ALPHA IS 1. Production's own presentation plane already interpolates
// every body it draws (buildFrameView, the PRES rings); the successor plane's
// bodies are drawn at their settled tick pose, which is the same thing
// `Encounter.draw` does for a body with no PRES entry. Smoothing them is the
// presentation round's, not the flip's.
// THE ISOLATING LEVER, and it is a `__test` seam rather than a shipped switch.
// A canvas claim about THIS draw cannot be a bare pixel count: production's own
// ship, HUD, wall border and three star layers are on the same surface, and a
// count of the whole picture is a count of the whole picture. The first cut of
// demo-flip's claim measured 125 lit samples with this function DELETED.
//
// AND THE OBVIOUS LEVER IS NOT ISOLATING EITHER. Uninstalling the host also
// empties `Encounter.lights()`, so the BLOOM goes dark with the bodies and the
// difference measures two changes at once — which is how that second cut still
// reported 300 pixels of "successor ink" with this function returning
// immediately. One lever, one change: this one moves the draw and nothing else.
let SUCCESSOR_DRAW = true;

function drawSuccessorField() {
  if (!SUCCESSOR_DRAW) return;
  if (!window.DemoRender || !window.EncounterHost || !EncounterHost.installed()) return;
  // save/restore, NOT a transform reset, and the difference was measured. That
  // renderer leaves more than a matrix behind: `lineJoin` and `lineCap` are set
  // to "round" for its own art, and `globalAlpha`, `fillStyle` and `strokeStyle`
  // are whatever its last pass used. Restoring only the transform left 265
  // canvas pixels different around the corner map's stroked frame — a
  // MITRED corner drawn round — with nothing in the field itself moved. A
  // renderer borrowed for one pass has to be given the surface back the way it
  // found it.
  ctx.save();
  DemoRender.setHostedView({ transform: { a: scale, b: 0, c: 0, d: scale, e: ox, f: oy },
                             extent: { w: FW, h: FH },
                             background: false, players: false });
  DemoRender.setCamOrigin(FRAME.cam.x, FRAME.cam.y);
  DemoRender.render({ world: ctx, light: null }, 1);
  ctx.restore();
}

// ---- THE POSE PUSH (PORT-S S3b lane 3, commit C) --------------------------
// Every seat production owns, ascending — the pinned order every other per-seat
// walk in this file keeps. The units are PRODUCTION's on this side of the seam
// and js/encounter-host.js is the converter; nothing here divides or multiplies
// anything, which is the point of having one converter.
//
// `seatHealth` is the read, and it is production's own published accessor
// rather than a reach into E.seats: the hull, its ceiling, the i-frames, the
// hit flash and the absence flag are exactly the five facts a mirror needs, and
// they are already gathered in one place for the ship draw. It allocates one
// small object per seat per tick, which is the same order as the pose itself.
//
// AND THE KERNEL NOW HOLDS EVERY SEAT THIS ROOM HAS (PORT-S S4, commit A).
// The line that used to stand here said "resetRun builds ONE seat and the roster
// count becomes the room's fact at S4, so today seat 0 poses and the rest are
// not the kernel's to hold." S4 is here and the fact is settled: production's
// `players.length` IS the room's seat count, and the kernel is sized to it once
// per tick, immediately before the pose loop that fills those records.
//
// THE SIZE CALL LEADS THE LOOP, and the order is load-bearing rather than
// tidy: `pushSeatPose` refuses a seat the kernel does not hold, so a pose
// pushed before the roster grew would be dropped and the seat would fly a tick
// behind. It also self-repairs every reset path — `resetRun` rebuilds the
// roster back to one seat, and both `restart` and the wipe re-call THIS
// function inside the same statement (see js/encounter.js FIX 10), so the
// count is restored before the poses land.
//
// AT ONE SEAT IT IS A NO-OP, which is what keeps commit A byte-identical on
// every shipped one-seat surface and on both bounded manifests.
function poseKernelSeats() {
  if (!window.EncounterHost || !EncounterHost.installed() || !window.Encounter) return;
  EncounterHost.setSeatCount(players.length);
  AURA_R.length = players.length;
  for (let s = 0; s < players.length; s++) {
    const P = players[s];
    // THE AUTHORITATIVE RADIUS, WRITTEN HERE (PORT-S S5, commit C). This
    // function is gated on the host being INSTALLED, which is exactly the
    // condition under which a kernel collision exists — so the radius is
    // derived precisely where there is something for it to have to agree with.
    //
    // THE POSE TAKES IT UNCONDITIONALLY; THE CACHE DOES NOT (S5 FIX ROUND,
    // Codex CX-3). `AURA_F[s]` is written by `energyStep()` and by nothing
    // else, so it is ABSENT until this seat's pool has been sampled by a local
    // sim tick. The old line folded that absence to 0 and cached the result —
    // and `Encounter.reset()` poses before any `energyStep`, so a `?mp` boot
    // cached seat 0 at `auraRadiusOf(0)` = SHIP_R and left it there: a net
    // client drew a 17.5 px halo for a seat the server was colliding at 67.5.
    // A CACHE MAY HOLD ONLY A RADIUS THE LOCAL SIM ACTUALLY SAMPLED. Where the
    // fraction is absent the entry is cleared, and `presentedAuraR` falls
    // through to the presented-pool formula that every remote seat already
    // uses. The POSE keeps the folded 0, because the kernel needs a number and
    // an unsampled seat has not armed anything to collide with.
    const aR = auraRadiusOf(AURA_F[s] || 0);
    AURA_R[s] = Number.isFinite(AURA_F[s]) ? aR : undefined;
    const h = Encounter.seatHealth(s);
    // ---- PRESENCE, PUSHED FOR EVERY SEAT (PORT-S S4, commit D) -----------
    // ABOVE the health guard, deliberately. D14's budget counts seats that are
    // CLAIMED AND NOT PARKED, and `absent` is production's own word for the
    // second half — `parkSeat` and `unseatSeat` both reach it through
    // `vacateSeat`, `reseatSeat` clears it. A seat with no health record yet is
    // reported PRESENT: the room holds it, the kernel holds it, and the only
    // thing missing is a record `restart()` has not synced. Leaving it out of
    // this push would let a seat's presence fall to whatever the last push
    // said, which for a freshly grown index is nothing at all.
    //
    // A DEAD SEAT AND A SEAT WAITING ON ITS CLAIM CLICK ARE BOTH PRESENT.
    // Somebody is there in both cases; only an EMPTY seat is not.
    EncounterHost.setSeatPresent(s, h ? !h.absent : true);
    if (!h) continue;
    EncounterHost.pushSeatPose(s, {
      x: P.ship.x, y: P.ship.y, vx: P.vel.x, vy: P.vel.y,
      angle: P.heading,          // THE CONVERGED NOSE (D32), not aimAngle
      alive: !h.absent && h.hull > 0,
      hull: h.hull, hullMax: h.hullMax,
      invuln: h.inv, flash: h.flash,
      r: SHIP_R,                 // the hull the kernel's four seat-radius sites read
      // ---- THE COMET PAIR (PORT-S S5, commit C) --------------------------
      // The BURNING flag and the halo the pilot is looking at. The kernel's
      // `auraRadius` accessor reads them and D26's aura pass walks nothing
      // when the flag is down — so a room with no comet is byte-identical.
      comet: !!P.comet,
      auraR: aR });
  }
  // ---- D38's BUILD TOTAL, PUSHED ONCE PER TICK (S4 fix 10) ---------------
  // *"If turned on it sums PRESENT seats' purchases."* One scalar, beside the
  // presence flags and for the same reason: the shop is production's plane and
  // the kernel reads no production surface, so the total crosses the seam here
  // and `bossHull` reads it at the deal. AFTER the loop, deliberately — it is a
  // fact about the ROOM and not about a seat, and the loop above is what has
  // just told the kernel which seats are present.
  //
  // AT THE DEFAULT DIAL (BUILDSCALE 0) NOTHING DOWNSTREAM READS IT, so this
  // line moves no fixture; it is here so the dial can be turned by the dev tune
  // route without a second seam crossing being invented on the day.
  EncounterHost.setBuildPurchases(Encounter.presentPurchases());
  // ---- D26'S AURA DAMAGE, PUSHED ONCE PER TICK (PORT-S S5, commit D) -----
  // The build total's twin, and for the same reason: `COMETAURA` is
  // production's dial and the kernel reads no production surface. AFTER the
  // seat loop, because it is a fact about the ROOM rather than about a seat.
  EncounterHost.setAuraDamage(COMETAURA);
}

// the per-tick reset for the claim latch. Every seat, ascending, like every
// other per-seat walk in this file; a press is worth exactly one tick, so an
// unread one is dropped rather than carried into a tick its player never made.
function clearClaimPress() {
  for (let s = 0; s < players.length; s++) {
    players[s].input.claimPress = 0;
    // ...and any ability press the drain did not reach. The drain spends every
    // one it walks, so this is the frameless tick's residue and nothing else —
    // stated rather than assumed, because `press` is a HASHED field and a value
    // that leaked across a tick boundary would enter the guarded fold and re-key
    // every trace that touched an ability.
    if (window.Abilities) Abilities.clearPresses(players[s]);
  }
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
// D47 (PORT-L) — DEFAULT 4 -> 1, and the arithmetic that says why is in the
// commit. In short: the star is a FLAT 2 device px now instead of 0.49-1.46, so
// the sky carries 4.4x the ink at the same count; STARDENS 1 puts 218.6 stars
// in a 1920x1080 view against the pre-flip sky's 220.44, within 0.8 %.
//   THE COUNT LAW IS NOT LINEAR. E[round(((h>>>24)/255) * STARDENS * 2)] equals
// STARDENS only when STARDENS x 2 is an INTEGER — every half step on the rail
// is exact and every quarter step is not, which is why the rail keeps its
// min 0 / max 10 / step 0.5 and only the DEFAULT moves.
let STARDENS = 1;  // average stars per cell (slider) — the hash spreads 0..2× around it
// The two look dials the pause panel drives (commit 7). They are RENDER-ONLY:
// in no tunable record, no snapshot, no hash and no fixture.
//   NO GLOBAL COLLISION: js/demo-render.js declares its own STARSIZE, STARLIT,
// STAR_LAYER_LIT and STAR_MIN_PX INSIDE its IIFE, so these top-level lets are
// legal beside it. Unchecked that is one SyntaxError from a page that will not
// boot, and node-golden cannot see it — SIM_FILES never loads demo-render.
let STARSIZE = 1;  // the drawn side is max(2, round(STARSIZE * 2 * dpr)) DEVICE px
let STARLIT = 1;   // scales the whole field's alpha
const CELL = 128;  // layer-space cell size, px
const STAR_MIN_PX = 2; // the floor, in DEVICE px: peak coverage (min(s,2)/2)^2
                       // is 1.00 at s >= 2 at EVERY subpixel offset, which is
                       // what makes a fractional position safe below
const LAYERS = [   // parallax factor, tone, depth ALPHA — no per-layer `size`
  // The tone ladder stays: production paints in flat tones everywhere else, and
  // three brightnesses is what still separates near from far once every star is
  // the same size. #9aa3b2 was a bare literal here and IS js/palette.js's
  // `steel` — one token, spelled once.
  { f: 0.25, color: C.dim, lit: 0.65 },
  { f: 0.5, color: C.steel, lit: 0.82 },
  { f: 0.75, color: C.bright, lit: 1 },
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
  // D47 (PORT-L) — THE STAR IS A SCREEN-SPACE MARK. The pass used to run under
  // the field matrix, so a star's drawn size was `L.size * scale` and the sky
  // shrank whenever the viewport did: the FW flip divided it by 720/342 = 2.11
  // and the field went from a sky to a dusting. The transform is the IDENTITY
  // now and every number below is a DEVICE pixel (the backing store is sized by
  // dpr at resize() and nothing scales the context by it), so the mark is the
  // same physical size at every window. The clip render() installed still holds.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const side = Math.max(STAR_MIN_PX, Math.round(STARSIZE * 2 * dpr));
  for (let li = 0; li < LAYERS.length; li++) {
    const L = LAYERS[li];
    const offX = cbx * L.f; // this layer's scroll — its own view of its own space
    const offY = cby * L.f;
    ctx.fillStyle = L.color;
    ctx.globalAlpha = Math.min(1, Math.max(0, L.lit * STARLIT));
    const x1 = Math.floor((offX + FW) / CELL); // only cells the view intersects
    const y1 = Math.floor((offY + FH) / CELL);
    for (let cy = Math.floor(offY / CELL); cy <= y1; cy++) {
      for (let cx = Math.floor(offX / CELL); cx <= x1; cx++) {
        let h = hash32(cx, cy, li, SEED);
        const n = Math.round(((h >>> 24) / 255) * STARDENS * 2); // 0..2× density, ≈ STARDENS on average
        for (let i = 0; i < n; i++) { // three LCG draws per star: x, y, and one
                                      // advance kept but not read
          h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
          const fx = cx * CELL + (h / 0x100000000) * CELL;
          h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
          const fy = cy * CELL + (h / 0x100000000) * CELL;
          // THE THIRD ADVANCE IS KEPT AND ITS VALUE DISCARDED. It used to deal
          // the per-star size variance this pass no longer has; dropping it
          // would re-phase the LCG and move every star's POSITION. Keeping it
          // holds the sky byte-identical to the old one at the same SEED, so
          // the owner's A/B is a size-and-brightness comparison and nothing else.
          h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
          // FIELD -> DEVICE by hand, the map the old matrix composed.
          const px = ox + (fx - offX) * scale;
          const py = oy + (fy - offY) * scale;
          // INTEGER SIZE, FRACTIONAL POSITION. A side >= 2 already pins peak
          // coverage at 1.00 at every subpixel offset, so rounding the position
          // buys nothing and costs motion: the far layer would advance a whole
          // device pixel per 2 px of camera travel and the sky would STEP
          // instead of sliding, on the layer whose only job is to sell motion.
          ctx.fillRect(px - side / 2, py - side / 2, side, side);
        }
      }
    }
  }
  // MUST. Nothing downstream resets it, and the alpha would leak into the world
  // pass render() sets up on the next line.
  ctx.globalAlpha = 1;
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
  // CONFIRMED state only — the caller's gate says so and this body assumes it.
  // There were two other branches here, a windup ring and a retract collapse,
  // and the owner cut both: the refusal ink was unnecessary and actively
  // confusing beside the halo it sat next to. The ASK is answered by SOUND now
  // (js/audio.js's `refuse` cue, fired at the press edge from cometPresTick),
  // which is a channel the halo cannot crowd. The phases themselves stay —
  // the lab's lead instrument, hurtWind and the cue's own gate all read them.
  const v = cv || cometView(P.id);
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
// THE HULL TABLE — one row per flyable ship, keyed by the skin id the PLAYER
// chose for itself on the claim card (R2's strip, js/encounter.js). Identity is
// a value the player owns and NOT a function of the seat index: two pilots may
// fly the same hull, that is legal by ruling, and there is no collision rule to
// look for here.
//   Adding a hull is ADDING A ROW to this table and a glyph beside it in the
// picker's SKINGLYPHS. The id set and the labels are written down exactly ONCE,
// here; the picker DERIVES both from this table rather than restating them, so
// the "two copies of one rule" disease cannot start between the strip and the
// field. server/names.test.mjs pins this table's row count, the glyph table's
// row count and SKIN_COUNT on both sides of the wire against each other, so a
// row added in one place and forgotten in another reds the gate.
//   COSMETIC AND HASH-FREE through this milestone. Nothing in this table
// reaches the sim, the snapshot or a trace: flight, hull points and weapons are
// identical for every row. A stats block hangs off the same id in a
// post-milestone round, and pays a recapture then like any other sim change.
//   THE ROSTER IS THE OWNER'S RULED SET: UFO, DELTA the triangle, DIAMOND the
// 4-gon, PENTAGON the 5-gon. THE NAMES ARE THE OWNER'S AND THEY DO NOT MOVE —
// D42 (PORT-L) gave row 0 the demo's ARROWHEAD in place of the circle, and the
// label stayed "UFO". Every polygon row sits at `turn: 0` and row 0's authored
// points start at [17, 0], so every nose points along +x, and the OWN ship's
// rotate (see drawShip) lands that nose on the aim under one plain
// rotate(angle). The other three seats hold nose-right, frozen, until R7 puts
// a heading key (`hd`) on wire v11 — a disc hid that; an arrowhead will not.
// Hull 0 is still the fallback every no-pick and no-Net path resolves to — now
// the near-black arrowhead with a cyan chevron and eye, and NO rosette.
//   A ROW IS: `plate` and `mark`, the two inks on the flat layer; `glow`, the
// colour js/fx.js burns this hull's halo in — see below, it is the channel
// that actually carries at range; a SHAPE; and `ring`/`pips`/`dot`, the
// rosette inside the plate.
//   THE SHAPE IS POLYMORPHIC, and this table is the ONE shape source. Three
// spellings, compiled by compileHulls below: `sides`/`turn` — 0 is the circle,
// any other value an N-gon whose vertices the loader bakes to a point list;
// `pts`, an author's own point list, normalised to circumradius 1 at load; or
// `d`, an SVG path authored in unit space, which MUST bring a `pts` fallback
// beside it — the headless test vm has no Path2D, and `new Path2D` never
// throws on junk, it silently draws nothing, so the LOADER is where a bad
// string dies loudly. Every silhouette draws at the SAME SHIP_R: identity and
// never reach, so no row of the table can buy a bigger or a smaller ship than
// another. The point list stays OPEN — no repeated first vertex; the fill
// closes it, and a `d` string closes itself with Z.
//   A row may also carry `edge`/`edgeW` (an outline stroke) and `accent` plus
// `chev`/`eye` (the accents inside it). The widths are FIELD px in both draw
// arms: the `d` arm strokes under ctx.scale(SHIP_R) and DIVIDES them, the
// fallback arm multiplies its coordinates instead. Absent keys draw nothing.
//   `pips: 0` is a row with NO rosette at all — row 0 since D42 — and such a
// row still declares `mark`, because the rosette's own fillStyle is set before
// the loop and canvas silently ignores an undefined one. `dot: 0` is the same
// statement about the centre dot, which the draw gates on.
//   The rosette shrinks with the plate's INRADIUS and not with its radius: a
// triangle inscribed in SHIP_R only has 3.5 px of room to its own edge, and
// the eight dots at 4.4 the circle carries would spill straight off three
// sides of it. The pentagon has 5.66 px of room (cos(pi/5) x SHIP_R), so its
// five dots ride at ring 3.8 — the dot's outer edge at 5.0 keeps the same
// order of margin to the inradius that the 4-gon's rosette keeps to its 4.95.
//   TWO CHANNELS, on purpose. Colour is the primary one because at a 14 px ship
// it is the only one that survives a glance across a four-way brawl, and the
// silhouette is the secondary one so the four stay attributable in a greyscale
// capture, to a colour-blind reader, and to a player whose ship is half behind
// somebody else's. SINCE D42 ROW 0'S PLATE IS NEAR-BLACK, so an unpicked seat
// carries its identity on `glow`, on the cyan accents and on the silhouette —
// the two-channel doctrine holds, but the PLATE is no longer one of the two for
// that row. The three added plates are deliberately BLUE, GREEN and
// VIOLET: clay is attack (bullets, the crown, the rosette) and cyan is the
// radar's sensor, and an identity that borrowed either would be answering a
// question the palette already answers. Since the tier pass, cyan ALSO reads
// as an enemy's tier 2 — for the aimed families the two meanings coincide by
// construction (the tier-2 body IS the radar variant), and a cyan husk claims
// no sensor it lacks: it claims a tier.
//   `glow` IS NOT A `C` COLOUR. It feeds js/fx.js's light layer, and that
// layer burns in its OWN palette — the HOT table, warmer and brighter than the
// flat pass's C, because light reads as light only when it sits above the ink
// it surrounds. Hull 0's halo burns the hot bright by owner ruling — the white
// plate carries a white light — and it reads `HOT.bright` from js/palette.js,
// the single source both tables now come from, so there is no second spelling
// left to drift. Writing a C byte here instead reads correct and is not — C
// and HOT spell a colour in DIFFERENT BYTES, and a hull that borrowed the flat
// ink would cool its biggest mark while every flame beside it stayed hot. That
// shipped once, in the clay era (glow: C.clay).
const HULLS = [
  { id: 0, label: "UFO",      plate: "rgba(9,12,25,0.92)", glow: HOT.bright, mark: C.clay, ring: 4.4, pips: 0, dot: 0,
    // D42 (PORT-L) — the demo's arrowhead, demo-v2/sim.js:3061-3105 drawPlayer.
    // `pts` is the RAW demo px list: compileHulls divides by far = 17 exactly
    // and 17/17 is 1.0 with no rounding, so the list stays self-documenting and
    // the normalisation is exact. The `d` string is the same points in unit
    // space, truncated at 6 dp — at worst 2.35e-7 unit = 4.12e-6 field px.
    // The silhouette is 2.94 % bigger than the demo's (SHIP_R 17.5 against a
    // circumradius of 17) and that CANNOT be compensated here: compileHulls
    // re-normalises `pts` unconditionally, so a pre-shrunk list would make the
    // two spellings disagree, and SHIP_R is read by ten sim sites. Absorbed.
    //   NO ROSETTE: the demo ship carries a chevron and an eye, not eight pips.
    // `mark` STAYS DEFINED so the rosette's own fillStyle is never undefined.
    d: "M1,0 L-0.470588,-0.529412 L-0.176471,-0.176471 L-0.764706,0 L-0.176471,0.176471 L-0.470588,0.529412 Z",
    pts: [[17, 0], [-8, -9], [-3, -3], [-13, 0], [-3, 3], [-8, 9]],
    edge: DEMO.ink, edgeW: 1.65, accent: DEMO.cyan,
    chev: [[0.411765, 0], [-0.235294, -0.235294], [-0.235294, 0.235294]],
    eye: [0.117647, 0, 0.111765] },
  { id: 1, label: "DELTA",    plate: "#7fb2f0", glow: "#7fb2f0", mark: C.clay, sides: 3, turn: 0, ring: 2.2, pips: 3, dot: 1.1 },
  { id: 2, label: "DIAMOND",  plate: "#8fd18a", glow: "#8fd18a", mark: C.clay, sides: 4, turn: 0, ring: 3.6, pips: 4, dot: 1.2 },
  { id: 3, label: "PENTAGON", plate: "#c99adf", glow: "#c99adf", mark: C.clay, sides: 5, turn: 0, ring: 3.8, pips: 5, dot: 1.2 },
];
// THE LOADER — the body table's one gate, run once at script load, in place.
// It compiles every spelling of a shape down to what the draw needs: an N-gon
// bakes its vertices to `pts` (the same cos/sin the old per-frame loop
// computed, so the polygon plates paint the exact bytes they always painted);
// an authored `pts` list is validated and normalised to circumradius 1, so the
// footprint rule holds by construction once the draw scales by SHIP_R; and a
// `d` string is validated HERE, char by char, because `new Path2D` accepts any
// junk silently — a `d` row must also carry `pts`, the fallback the headless
// vm (no Path2D) and the pixel probes draw. A bad row THROWS at load: the
// table is static authored data, and a loud death at the first script beats a
// hull that quietly draws nothing.
function compileHulls(rows) {
  for (const row of rows) {
    if (row.d !== undefined) {
      if (typeof row.d !== "string" || !/^\s*[Mm]/.test(row.d)
        || !/^[MmLlHhVvZzCcSsQqTtAa0-9eE+\-.,\s]+$/.test(row.d))
        throw new Error("HULLS row " + row.id + ": `d` is not a usable SVG path");
      const nums = row.d.match(/-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/g) || [];
      if (!nums.length || nums.some((n) => !Number.isFinite(Number(n))))
        throw new Error("HULLS row " + row.id + ": `d` carries a non-finite number");
      if (!Array.isArray(row.pts))
        throw new Error("HULLS row " + row.id + ": a `d` shape must bring a `pts` fallback — the headless vm has no Path2D");
    }
    if (Array.isArray(row.pts)) {
      if (row.pts.length < 3 || row.pts.some((p) => !Array.isArray(p)
        || !Number.isFinite(p[0]) || !Number.isFinite(p[1])))
        throw new Error("HULLS row " + row.id + ": `pts` must be 3+ finite [x, y] pairs");
      const far = Math.max(...row.pts.map((p) => Math.hypot(p[0], p[1])));
      if (!(far > 0)) throw new Error("HULLS row " + row.id + ": `pts` has no reach to normalise");
      row.pts = row.pts.map((p) => [p[0] / far, p[1] / far]);
    } else if (row.sides) {
      // baked, not normalised: cos/sin of these angles ARE unit vectors, and a
      // divide-by-max here would perturb the doubles the old loop produced
      row.pts = [];
      for (let i = 0; i < row.sides; i++) {
        const a = row.turn + (i / row.sides) * Math.PI * 2;
        row.pts.push([Math.cos(a), Math.sin(a)]);
      }
    }
    // no `pts` after all of that means sides 0 (or absent): the circle, and
    // platePath draws it with the one arc call it always has
  }
  return rows;
}
compileHulls(HULLS);
// The hull a SEAT is flying, as a row of the table above. R2's roster is the
// source and the only one: Net.seatSkin(seat) answers the id that seat's pilot
// chose, and NULL for a seat nobody is flying — which is not the same sentence
// as hull 0. A null, an id outside the table and a build with no Net at all all
// fall back to HULLS[0], so a screen never has a ship with no hull to draw.
//   NEVER `Net.seatSkin(seat) && ...` and never `id || 0`: hull 0 is FALSY, and
// both idioms would refuse to ever adopt the UFO. The test is for an INTEGER in
// range, which is the only test that tells a chosen 0 from an absent one.
//   A plain read with no allocation — it is on the per-seat per-frame path.
function hullFor(seat) {
  const id = window.Net && Net.seatSkin ? Net.seatSkin(seat) : null;
  if (!Number.isInteger(id) || id < 0 || id >= HULLS.length) return HULLS[0];
  return HULLS[id];
}
// The plate's OUTLINE. A row with no compiled point list is the circle this
// game has always drawn — the same one arc call, so hull 0 paints the bytes it
// always painted — and any other row is its `pts`, unit vectors the loader
// baked or normalised, drawn scaled by r. The silhouette is identity and never
// reach: every hull keeps one footprint, so no row of the table can buy a
// bigger or smaller ship than another.
function platePath(x, y, r, K) {
  ctx.beginPath();
  if (!K.pts) { ctx.arc(x, y, r, 0, Math.PI * 2); return; }
  for (let i = 0; i < K.pts.length; i++) {
    const px = x + K.pts[i][0] * r;
    const py = y + K.pts[i][1] * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
function drawHull(x, y, K, tint) {
  const H = K || HULLS[0]; // a caller with no row: the incumbent, never a crash
  ctx.fillStyle = tint || H.plate; // tint is the DAMAGE override and stays free
                                   // while SHOW_HULL_DAMAGE is off, so the
                                   // hull's own plate is what a living ship
                                   // paints today
  if (H.d && typeof Path2D === "function") {
    // the SVG spelling, browser only: the Path2D is built LAZILY, once per
    // row, because the headless vm has no Path2D at all — THERE the `pts`
    // fallback below is the shape that draws. The pixel probes run in headless
    // Chrome, which HAS Path2D, so they measure THIS arm; nothing in the gate
    // ever draws the fallback, which is why a SOURCE pin holds the two
    // spellings equal instead of a probe.
    if (!H.p2d) H.p2d = new Path2D(H.d);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(SHIP_R, SHIP_R);
    ctx.fill(H.p2d);
    // THE OUTLINE AND THE ACCENTS, in UNIT space. lineWidth rides the
    // transform, so every width DIVIDES by SHIP_R to land the demo's own field
    // pixels — 1.65 / 17.5 and 1 / 17.5.
    if (H.edge) {
      ctx.strokeStyle = H.edge;
      ctx.lineWidth = H.edgeW / SHIP_R;
      ctx.stroke(H.p2d);
    }
    if (H.chev) {
      ctx.strokeStyle = H.accent;
      ctx.lineWidth = 1 / SHIP_R;
      ctx.beginPath();
      ctx.moveTo(H.chev[0][0], H.chev[0][1]); ctx.lineTo(H.chev[1][0], H.chev[1][1]);
      ctx.moveTo(H.chev[0][0], H.chev[0][1]); ctx.lineTo(H.chev[2][0], H.chev[2][1]);
      ctx.stroke();
    }
    if (H.eye) {
      ctx.fillStyle = H.accent;
      ctx.beginPath();
      ctx.arc(H.eye[0], H.eye[1], H.eye[2], 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else {
    // THE FALLBACK ARM SAVES AND RESTORES TOO. It did not before D42, because
    // it set no state; it sets strokeStyle and lineWidth now, and without the
    // pair it would LEAK them into the frame. withHeading saves only when `rot`
    // is truthy, so nothing else would catch it — and nothing can measure this
    // arm either, because headless Chrome has Path2D. Read, never measured.
    ctx.save();
    platePath(x, y, SHIP_R, H);
    ctx.fill();
    // THE SAME LOOK, UNSCALED: coordinates MULTIPLY by SHIP_R and the widths
    // are the demo's own plain numbers. Two arithmetics, one look.
    if (H.edge) {
      ctx.strokeStyle = H.edge;
      ctx.lineWidth = H.edgeW;
      ctx.stroke();
    }
    if (H.chev) {
      ctx.strokeStyle = H.accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + H.chev[0][0] * SHIP_R, y + H.chev[0][1] * SHIP_R);
      ctx.lineTo(x + H.chev[1][0] * SHIP_R, y + H.chev[1][1] * SHIP_R);
      ctx.moveTo(x + H.chev[0][0] * SHIP_R, y + H.chev[0][1] * SHIP_R);
      ctx.lineTo(x + H.chev[2][0] * SHIP_R, y + H.chev[2][1] * SHIP_R);
      ctx.stroke();
    }
    if (H.eye) {
      ctx.fillStyle = H.accent;
      ctx.beginPath();
      ctx.arc(x + H.eye[0] * SHIP_R, y + H.eye[1] * SHIP_R, H.eye[2] * SHIP_R, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.fillStyle = H.mark; // the rosette ring, sized to THIS plate's room
  for (let i = 0; i < H.pips; i++) {
    const a = (i / H.pips) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * H.ring, y + Math.sin(a) * H.ring, H.dot, 0, Math.PI * 2);
    ctx.fill();
  }
  // THE CENTRE DOT IS GATED on the row carrying a rosette at all. It was
  // unconditional until D42, which is fine while every row has one; row 0 has
  // none now, and an ungated dot would paint H.mark's clay in the middle of a
  // near-black arrowhead the demo draws clean.
  if (H.dot > 0) {
    ctx.beginPath();
    ctx.arc(x, y, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
}
// The plate's colour as it burns down. Fixed steps rather than a lerp: the
// game draws in flat pixel tones everywhere else, and a ramp of computed greys
// would read as an anti-aliased gradient instead of battle damage. A full hull
// returns the untouched white by construction, so the pristine draw and the
// flashing-but-unhurt draw agree about what an intact plate looks like.
function hullTint(frac, K) {
  if (frac >= 1) return (K || HULLS[0]).plate;
  if (frac > 0.5) return "#b6bbc7";
  if (frac > 0.25) return "#949aa8";
  return "#7b8290"; // a hull this far gone has nothing bright left on it
}
// A damaged, living hull: a chewed rim charred along its whole edge, a rosette
// whose sockets go dark as the hull points go, and — on the last quarter — an
// ember still burning in the first wound.
//   THIS PATH CARRIES NO HULL IDENTITY, and that is a deliberate stop rather
// than an oversight: the whole look is PARKED (SHOW_HULL_DAMAGE is false), so a
// living seat never reaches it, and re-cutting the chewed silhouette and the
// dark-socket gauge for four plate shapes would be building the identity half
// of a look nobody has decided to bring back. The plate's COLOUR does follow
// the hull — hullTint returns the row's own plate at a full hull and darkens
// from there — so the day the flag flips the ramp already starts in the right
// place, and the geometry is what takes a row read then.
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
// The OWN plate's presented heading, in radians — 0 when there is nothing to
// point at. It is the angle of fireDir() — the SHOT truth: the stored
// aimAngle in every aim mode except live cursor aim, where the pointer owns
// the aim (aimAngle is only SNAPSHOTTED there, on mode edges). So the nose
// agrees with the MUZZLE always, and with the drawn aim marker only outside
// locked tick mode: there markerDir() resolves the LIVE cursor while
// fireDir() resolves the DELAYED banked one, so under input lag the marker
// holds the hand's line and the nose trails it by that lag. Owner judges
// the feel; the pairing is nose = shot truth, marker = live hand.
//   NOTE for probes: with `aimed` false fireDir() falls back to the VELOCITY
// direction, so a never-aimed ship noses along its flight path — "identity
// at rest" means not aiming AND not moving.
// A pure read — nothing here writes aim state, so the hashed sim bytes
// cannot move.
function ownHeading() {
  const d = fireDir();
  return d ? Math.atan2(d.y, d.x) : 0;
}
// Rotate a draw about (x, y) — or, at rot 0, do not touch the transform at
// all: rotate(0) is an exact identity, but skipping the save/rotate/restore
// keeps the untouched path literally untouched, so every probe and every
// seat that never aims paints the bytes it always painted.
function withHeading(x, y, rot, draw) {
  if (!rot) { draw(x, y); return; }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  draw(0, 0);
  ctx.restore();
}
// THE ENTRY POINT the render loop calls, once per seat. Four states, in the
// order they matter: down, hit, damaged, pristine.
// H is the seat's health record — seatHealth(seat) — read ONCE by the draw
// loop (its only caller) and handed in, because seatHealth allocates a fresh
// object per call and the loop already needs it for the absent test. That test
// lives in the loop and nowhere else: an UNSEATED seat never reaches this
// function, so an `absent` record here would be a caller's bug, not a case.
function drawShip(x, y, seat, H) {
  // ...and WHICH HULL this seat is flying, read ONCE per seat per frame. The
  // seat is already a parameter — the render loop has always handed it in for
  // the damage hashes — so identity needed no new thread through this call.
  const K = hullFor(seat);
  // ...and WHICH WAY it points. The OWN seat's plate rotates to face the aim
  // (owner option b): every hull row sits at turn 0 — nose on +x — so one
  // plain rotate lands the nose on the cursor. The other three seats hold
  // nose-right, frozen, until R7 lands the `hd` heading key on wire v11: a
  // remote seat's aim is simply not on the wire this week, and a guessed
  // heading would be a lie the pilot never told.
  //   The gate is grantedSeat(), NEVER localSeat(): a seatless spectator folds
  // to 0 through localSeat(), and its cursor would then turn seat 0's plate —
  // another pilot's hull answering this page's mouse. A null grant rotates
  // nothing, which is the truth: this page flies no seat.
  const g = grantedSeat();
  const rot = g !== null && seat === g ? ownHeading() : 0;
  // no record to read, or an untouched hull: the original draw, untouched
  if (!H || (H.hull >= H.hullMax && H.flash <= 0)) {
    withHeading(x, y, rot, (px, py) => drawHull(px, py, K));
    return;
  }
  // the WRECK does not rotate, deliberately: a dead seat has no live aim, its
  // husk is a chewed disc with no nose to point, and the respawn countdown it
  // wears must stay upright to be read
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
  const tint = H.flash > 13
    ? C.bright                    // the kick flashes WHITE on every hull: it is
                                  // an impact cue, not a name
    : !SHOW_HULL_DAMAGE
      ? null                      // the look is parked, so no override at all
                                  // and the hull's own plate stands
      : hullTint(H.hull / Math.max(1, H.hullMax), K);
  // the kick rides OUTSIDE the rotation: it is an impact shudder in screen
  // space, not a heading, so the plate rotates about its kicked centre and
  // the shudder never bends with the nose. drawHitShock above already stays
  // on the TRUE position, as its own comment demands.
  if (!SHOW_HULL_DAMAGE || H.hull >= H.hullMax) {
    withHeading(hx, hy, rot, (px, py) => drawHull(px, py, K, tint)); // flashing, but not yet hurt
  } else {
    withHeading(hx, hy, rot, (px, py) => drawDamagedHull(px, py, H, seat, tint));
  }
}

// THE FIELD CROWN — who LEADS, over the leader's own ship.
//   TWO QUESTIONS, TWO CHANNELS, and this marker keeps them apart exactly as
// the board already does. "Which one is you" is answered in C.bright: on the
// board by the local row's name and its lowercase "you" caption, and on the
// field by the camera, which follows this client's ship and nothing else.
// "Who leads" is answered in C.clay, here and on the board's crowned row, and
// it is never the identity channel either: the HULL says WHO a ship is, so the
// crown adds a standing to a ship that is already named and never has to carry
// the name itself. Three questions, three answers, no two on one channel.
//   The seat it sits over comes from Encounter.kingSeat() — the SAME call the
// board's crowned row reads, so the two can never disagree. That means it
// ranks by `best`, the high-water score: a crown that ranked by the live score
// would come off every leader for the whole of their respawn timer.
//   It is drawn AFTER the ship, over the plate's own band and clear of it, so
// no hull's silhouette is cut and the crown is legible on all four plates.
function drawFieldCrown(x, y) {
  const cy = y - SHIP_R - 4.5; // clear of the widest plate, and close enough to
                               // read as this ship's and not the next one's
  const w = 5;
  const h = 4;
  ctx.fillStyle = C.clay;
  ctx.beginPath();
  ctx.moveTo(x - w, cy + h);
  ctx.lineTo(x - w, cy - h);
  ctx.lineTo(x - w / 2, cy);
  ctx.lineTo(x, cy - h);
  ctx.lineTo(x + w / 2, cy);
  ctx.lineTo(x + w, cy - h);
  ctx.lineTo(x + w, cy + h);
  ctx.closePath();
  ctx.fill();
}

function drawAim() {
  // WHOSE marker, gated on grantedSeat() and never localSeat(): a seatless
  // spectator folds to seat 0 through localPlayer(), and the triangle would
  // then orbit another pilot's hull, pointed by THIS page's mouse (the
  // cursorAim branch) or by that pilot's velocity (markerDir). A page with no
  // seat aims nothing, so it draws nothing — there is no seat-0 fallback.
  // Solo is untouched: grantedSeat() answers 0 there.
  const g = grantedSeat();
  if (g === null) return;
  const P = players[g];
  if (!P) return; // a granted seat with no player record is a caller's bug

  // THE DRAWN marker anchors on the FRAME ship and, when the pointer drives
  // it, resolves its direction through FRAME.cam — pixels agree with pixels.
  // The INPUT path is deliberately untouched: refreshPointerWorld/lcurWorld
  // keep converting through canonical `cam`, and the sim keeps fireDir().
  const vp = FRAME.ships[P.id] || P.ship;
  let d = null;
  if (cursorAim()) {
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
    // a cue spawned off an ability record carries that record's render-only
    // look (js/net.js spawnCue); the DOT and its one-step trail wear the ink,
    // the muzzle glow below keeps C.clay for both guns
    ctx.fillStyle = tr.ink || C.bright;
    ctx.beginPath();
    ctx.arc(tr.x, tr.y, tr.r || 2.2, 0, Math.PI * 2);
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
// IT IS NEVER HIDDEN NOW — D30. The line below used to withhold it during
// right-hold flight (`if (!aiming() && !frozen()) return;`), mirroring the
// native cursor mouse mode hid for the same stretch. Neither stretch exists any
// more, so both cursors stay on screen for the whole run. One of D30's four
// shipped-default play changes.
// THE FRAME, LEGIBLE IN FLIGHT — D12's own requirement ("the live mode must be
// legible on screen"), and the lab's hint line is the precedent: it prints
// "T thrust: SCREEN" on the play screen so the pilot can always see which map
// his keys are on. A mode the pilot cannot see is a mode he will fight.
//   It is drawn HERE rather than in the HUD because js/game.js owns THRUSTFRAME
// and js/encounter.js has no bridge to this file's tunables — inventing one to
// move two words across it would be the larger change. Render pass ONLY: it
// reads a client preference and touches no hashed state.
//   Bottom-left of the FIELD, clear of the encounter's own top-left readouts and
// of the gutter panels on the right.
function drawThrustHint() {
  if (!G.running) return; // the paused screens carry the same fact in their copy
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  ctx.fillStyle = C.dim;
  ctx.font = "400 9px " + FONT;
  ctx.fillText("T thrust: " + (THRUSTFRAME === "ship" ? "SHIP" : "SCREEN"), 8, FH - 8);
}
function drawLockedCursor() {
  if (!lockedMode() || !G.running) return;
  ctx.strokeStyle = C.bright;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(in0.lcur.x, in0.lcur.y, 3.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = C.clay;
  ctx.fillRect(in0.lcur.x - 0.6, in0.lcur.y - 0.6, 1.2, 1.2);
}

// the world map in the corner: WORLD-ASPECT, a dot for the ship, a bright
// rectangle for the slice of world the camera shows, and contact dots for the
// live enemies, XP orbs and player shots
//
// ---- THE ASPECT IS DERIVED NOW (FIX ROUND, S3BR-05) ----------------------
// `MM_W:MM_H` was the literal pair 76:93, and its own comment named the source:
// the RETIRED world's 3072:3762. Commit C moved the world to 7680:7920 and left
// the pair behind, so `ky/kx = (93/7920)/(76/7680) = 1.1866` — EVERY point,
// circle and viewport rectangle on the corner map was stretched vertically by
// 18.66 %. Equal world offsets did not render equally on the two axes, which
// makes a tactical map lie about bearing and relative distance.
//
// THE WIDTH IS KEPT AND THE HEIGHT IS DERIVED, which is the whole fix: 76 is an
// owner-sized HUD dial and the ASPECT is an invariant, so the invariant is the
// one that gets computed. `MM_H` is 78.375 at the shipped world — and a future
// world moves it without anyone remembering to.
//
// ---- THE FOOTPRINT IS A FEEL-GATE FLAG, NOT A DECISION -------------------
// Whether the map should GROW — 76 px of width was chosen against a 512 px
// field and the field is 1280 now — is a design question the owner owns, and
// it is FLAGGED to the feel gate rather than answered here. Removing the
// anisotropy is not a design question; it is arithmetic.
// ---- THE EPSILON GATES, RESCALED (FIX ROUND, S3BR-11) --------------------
// Four live gates carried UNITS and kept their pre-flip values. They are small
// enough to look dimensionless and they are not:
//   `REST_EPS` is PX PER TICK — below it a ship "is at rest" and all input
//     builds speed instead of resolving into an along/across basis, and it is
//     the same threshold `fireDir` and `seatFireDir` fall back to a heading at.
//   `LEAD_EPS` is PX — a lead vector shorter than this is treated as
//     near-zero by the dead-zone gate, so the gate tracks live instead of
//     holding.
// At the retired scale 0.05 px/tick was 2.5 % of `VMAX 2`; at `VMAX 5` it was
// 1 %; since D50 (PORT-F) 0.125 is 3.06 % of `VMAX 4.0833`, so a residual
// velocity in that band chooses a different thrust basis or a different
// fire-heading fallback than it did before either move. Stock keyboard thrust
// rarely reaches these boundaries; raw and banked inputs can.
//   THEY JOIN THE GEOMETRY TABLE at the one named ratio, 2.5.
//
// NO BOUNDARY ORACLE IS BUILT, and that is a stated omission rather than an
// oversight: NO epsilon in this tree has one, so building one here would be a
// new class of instrument attached to the smallest of them. Carried as residue.
const REST_EPS = 0.125;   // px/tick — "at rest". x2.5, WAS 0.05
// ---- REST_EPS IS HASH-VISIBLE, AND D50 WIDENED ITS WINDOW (PORT-F) --------
// The value is LEFT at 0.125. What moved is how long a ship sits inside it:
// the key gain fell from 0.696 to 0.0830125 px/tick², so a ship starting from
// rest used to clear the threshold on tick 1 and now takes TWO. MEASURED, not
// reasoned, through server/sim-host.mjs's own Flight (one held key from rest):
//   tick 1 |vel| = 0.0817673125          -> AT REST
//   tick 2 |vel| = 0.16230811531249997   -> has a heading
// That window is NOT cosmetic. `seatFireDir` (:2823) is `headingStep`'s only
// source, and `P.heading` folds unconditionally into `hashShip` (:7105), so
// one extra tick of a HELD nose is one extra tick in the state hash — a second,
// independent reason the event-mode flight traces move at the freeze. The
// behavioural site is the "at rest there is no heading" branch in
// `Flight.thrust` (:1328).
const LEAD_EPS = 2.5;     // px — a lead vector this short is near-zero. x2.5, WAS 1
let MINIMAP = true;
const MM_W = 76;
const MM_H = MM_W * WH / WW;
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

// THE OTHER TRACKING LAYER HAS NO FLAG HERE. Chevrons on the field's inner
// edge, pointing at the enemies and the XP orbs the viewport has lost, came
// back at D58 — geometry, draw and all — but they came back UNCONDITIONAL.
// `EDGEARROWS` is not re-declared: an indicator that answers "what can reach
// me from off the screen" is not a taste setting, and a world-tab row would
// be a five-place census move for a switch nobody should want. Everything the
// layer is lives in js/encounter.js's encDrawHud, beside the roster it reads.

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
// THE PRE-START IDENTITY BLOCK's geometry — the name box above the ship
// strip, on the screen the game actually starts on. Both halves are here and
// in this order by ruling: name and ship are ONE identity chosen in ONE moment
// on ONE affordance (D2), and the pre-start screen is the only moment on any
// screen when the keyboard is not flying a ship, which makes it the BETTER
// place to type a name than the claim card rather than a worse one.
//
// THE PAUSE MENU'S OWN ROW IS THE CONSTRAINT, and it is a DOM row over the
// canvas, not something this file draws. resize() hangs it at FH / 2 + 96, so
// it covers field y 267 down to about 277 — measured, not assumed, across
// three window shapes, because its height is 18 CSS px and its FIELD extent
// therefore shrinks as the scale grows. That row cuts this screen into two
// usable bands, and the first layout tried here put the name box in the upper
// one and the ship strip in the lower one, with the menu chrome wedged between
// the two halves of a single affordance. So the AFFORDANCE goes wholly in the
// lower band and the two lines of type that qualify it go in the upper one.
//
// Upper band (under the explanatory block, above the menu row):
//   `foot` is the card screen's alone. Its bitmap says LEFT CLICK TO START and
// that sentence is now incomplete, because a click may instead pick a hull or
// open the name box. Regenerating the art is not this round's work, so the
// qualification is a line of type directly under the art that made the claim.
// The text screen needs none — its own CLICK TO START copy is above it.
//   `rail` is on BOTH screens. RAILSHOT is bound to Space, is free to every
// pilot and has no HUD entry, no icon, no cooldown ring and no shop row — the
// owner could not find it at all. Its ink and its sound are what teach it in
// flight; this line is what says the key exists. It sits here rather than in
// pauseLines() because that call returns a PAIR and both slots are spoken for
// on every screen that draws it, and one sentence in one place beats the same
// sentence copied into five wordings. The two screens' anchors differ because
// their explanatory blocks end at different heights: the bitmap stops at
// GUIDE_Y + GUIDE_H = 220, the stand-in's second copy line at FH / 2 + 78.
//
// Lower band (under the menu row, above the field's bottom edge): the block
// itself, SHARED by both screens — the menu row is where it hangs from, and
// that row does not move with the aim mode. The name box's top lands at 283.5
// and the strip's own label baseline at 338, so the band is used end to end.
const IDBLOCK = {
  card: { foot: 240, rail: 253, name: 292, strip: 318 },
  text: { foot: null, rail: 261, name: 292, strip: 318 },
};
const IDSTART_LINE = "click anywhere else to start";
const RAIL_LINE = "space fires the rail · costs energy and a cooldown";
const guideImg = new Image();
let guideReady = false;
guideImg.addEventListener("load", () => { guideReady = true; render(); });
guideImg.src = GUIDE_SRC;
// Two questions, deliberately separate. ELIGIBLE is "does this screen belong
// to the card" — pure state, answerable before the bytes arrive. SHOWN adds
// "and there is a bitmap to draw". Everything the card suppresses keys off
// SHOWN, so an unloaded frame is the plain text screen, unchanged.
function guideEligible() {
  return !G.running && !G.started && !UI.dev && cursorAim();
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
// row that no longer exists.
//
// EVERY LINE BELOW WAS REWRITTEN AT D30/D31/D12, because every one of them
// described the ROLE SWAP: "hold right to swap", "right held: mouse flies · keys
// aim", "release to aim again". None of that happens any more. The copy now says
// the four things that are true — the cursor aims, WSAD thrusts (ship-relative
// by default, T toggles), LMB fires, SHIFT is the reflex hold — and it says
// nothing about the right button, because the right button does nothing. A page
// that still taught the swap would be teaching a build nobody can run.
function pauseLines() {
  if (guideEligible()) {
    return ["cursor aims · left fires · wsad thrust · qezc add diagonals",
            "hold shift for comet · uses energy · fast · rams · t flips thrust"];
  }
  const ring = keyThrustUnlocked();
  if (lockedMode()) {
    // the roles, in the same shape mouse mode states them. The lock is how the
    // mode works, not how the game is played, so it is not in the copy.
    return ["the drawn cursor aims · click or hold left to fire",
            "shift holds the comet · t flips the thrust frame · esc pauses"];
  }
  const mouseLines = [ring ? "the visible cursor aims · wsad thrust · shift holds the comet"
                           : "the visible cursor aims · shift holds the comet",
                      "left fires · t flips the thrust frame · esc pauses"];
  // (the third arm — push mode's copy, "qweasdzxc keys fly the ship…" — is
  // UNREACHABLE after D30 and is deleted with the mode. AIMMODE is "mouse" or
  // "locked" and nothing else, so the two branches above are exhaustive; a
  // fallthrough return would be dead code wearing the shape of a default.)
  return mouseLines;
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
  // ...and the fallback reaches the PLANE THAT HAS BODIES (S3b lane 3, D5).
  // It read `__test.enc.E.enemies`, production's own list, which is deleted.
  // `Encounter.mapState()` is the accessor that crosses to the successor
  // plane and is already this file's own reader two screens up — one door, not
  // a second reach into another module's state.
  const foes = FRAME.enemies
    || (window.Encounter && Encounter.mapState ? Encounter.mapState().enemies : null);
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
const PRES_SNAP = 70; // x2.5, WAS 28 (PORT-S S3b lane 3's arena rescale — the
                      // constant table's own ratio, applied here at commit D2
                      // because commit C's table missed it and the fx suite's
                      // ghost probe found it). px — the displacement guard:
                      // clear of a hard dash, under any real teleport, so a
                      // respawn or restart crosses in ONE presented frame
                      // (row 4's bar). It is a LENGTH on the same field as
                      // every other length: left at 28 it would cut the
                      // presentation on an ordinary tick of travel, because a
                      // ship at VMAX 4.0833 moves 4.08 px where it moved 2 —
                      // it moved 5 between the x2.5 flip and D50 (PORT-F).
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
// ---- THE RESET DETECTOR IS PER FAMILY (PORT-S S3b lane 3, commit D) --------
// THE ID-MONOTONICITY BILL, PAID, and the lane says WHICH of the two answers
// js/encounter-host.js prescribed it took: A DELIBERATE REPLACEMENT OF THE
// RESET DETECTOR, not a globally monotone id source across both producers.
//
// WHY NOT THE SHARED SOURCE. The two counters are `nextEntityId` in
// js/encounter.js and `nextId` in js/demo-kernel.js. Handing the kernel a
// different source would move every id it mints, and its ids are hashed state
// in tests/fixtures/demo-bounded-reference — the bounded pair would re-key.
// That is S3a's STOP class and this lane may not spend it.
//
// WHAT WENT WRONG WITH ONE GLOBAL MAX, exactly, because the shape is subtle
// and the review that found it had to correct an earlier wrong diagnosis. It
// was NOT a collision: the wire keeps four separate arrays and js/net.js builds
// a separate Map per family, so an enemy 7 and a bullet 7 never meet. The
// failure needs no collision at all. `PRES.maxId` was ONE number across four
// caches, so once production had presented bullet id 100, a NEW enemy id 7
// from a SECOND producer satisfied `7 <= 100 && !PRES.enemies.has(7)` — and
// every presentation cache cleared for a body that had aliased nothing. After
// the flip that is not an edge case: the two producers mint from 1
// independently, so it fires constantly, and the whole field takes a cold
// presentation cut on most ticks.
//
// THE REPLACEMENT IS ONE MAX PER FAMILY PER PRODUCER, and it is STRICTLY MORE
// FAITHFUL to what the number always meant. "Ids are monotonic and never
// reused" is a property of a PRODUCER, so the max has to be one too.
//
// AND THE FAMILY ALONE IS NOT ENOUGH, which the first cut of this block got
// wrong. ORBS is a family with TWO producers in ONE array — production pays a
// PvP death out in orbs and the successor plane drops the enemy plane's — and
// server/sim-host.mjs partitions their WIRE ids so they cannot alias. That
// closes the collision and leaves the ORDERING open: a production orb (a low
// id) arriving after a successor orb (a high one) is still "an id at or below
// the max this cache has seen", and the orb cache would take a cold cut every
// time a pilot died.
//
// SO THE PRODUCER IS DERIVED FROM THE ID ITSELF, off the partition the wire
// already draws: `Engine.WIRE_ID_BASE` is the one authority for where one
// producer's range ends and the other's begins, and each family keeps a max on
// each side of it. Two numbers per family, no list of producers to maintain,
// and a third producer would need only a third range rather than a rewrite.
const PRES_ID_BASE = () => (window.Engine && Engine.WIRE_ID_BASE) || Infinity;
const PRES = {
  serial: 0,     // capture ticks — the seen-stamp the sweep prunes against
  // highest id ever captured, PER FAMILY and PER RANGE — see the block above.
  // `lo` is the producer minting below the wire's id base, `hi` the one above
  // it. A NEW body wearing an id at or below its OWN slot's max is THAT
  // producer resetting its id space, and only that family's cache clears.
  max: { enemies: { lo: 0, hi: 0 }, missiles: { lo: 0, hi: 0 },
         orbs: { lo: 0, hi: 0 }, bullets: { lo: 0, hi: 0 } },
  // ...and HOW MANY TIMES each family has taken one. A cold presentation cut is
  // invisible in every other reading — the cache clears, the same bodies roll
  // straight back in, the sizes match and the maxes come back to where they
  // were — so "did this family reset" is only answerable by counting. It is
  // instrument bookkeeping: nothing hashed, nothing drawn, never reset.
  cuts: { enemies: 0, missiles: 0, orbs: 0, bullets: 0 },
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
function presRoll(map, id, x, y, fam) {
  let r = map.get(id);
  if (!r) { r = { px: x, py: y, cx: x, cy: y, snap: true, seen: 0 }; map.set(id, r); }
  else {
    r.px = r.cx; r.py = r.cy;
    r.cx = x; r.cy = y;
    r.snap = Math.abs(x - r.px) > PRES_SNAP || Math.abs(y - r.py) > PRES_SNAP;
    if (r.snap) { r.px = x; r.py = y; }
  }
  r.seen = PRES.serial;
  if (fam) {
    const slot = id >= PRES_ID_BASE() ? "hi" : "lo";
    if (id > PRES.max[fam][slot]) PRES.max[fam][slot] = id;
  }
  return r;
}
function presSweep(map) { // id missing from the current tick → gone at once: no one-frame corpse
  for (const [id, r] of map) if (r.seen !== PRES.serial) map.delete(id);
}
const presIdReset = (list, map, fam) => {
  const base = PRES_ID_BASE();
  const top = PRES.max[fam];
  // `| 0` TRUNCATES TO 32 BITS and the partitioned ids are past that, so the
  // id is read as a NUMBER here. It was `| 0` while every id fitted; a
  // successor id of 1e9 + n does not, and folding it to a negative would put
  // every one of them below every max at once.
  for (const o of list) {
    const id = o.id;
    if (!Number.isFinite(id) || id <= 0) continue;
    if (id <= top[id >= base ? "hi" : "lo"] && !map.has(id)) return true;
  }
  return false;
};
function capturePresent() {
  PRES.serial += 1;
  cometPresTick(); // the comet presentation machine rides the SAME per-tick
                   // boundary as the pose caches — one tick, one advance, and
                   // never a wall clock (see the owner block above)
  shakePresTick(); // ...and the screen-shake machine beside it, on the same
                   // clock for the same reason
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
    // 500, x2.5, WAS 200 — the same rescale as PRES_SNAP above and for the
    // same reason: a flip-mode room slide is a room WIDER by the ratio, so the
    // guard that must sit above it moves with the room.
    if (Math.abs(c.cx - c.px) > 500 || Math.abs(c.cy - c.py) > 500) { c.px = c.cx; c.py = c.cy; }
  }
  // ships, keyed by seat — players[] mutates in place but the SEAT is the identity
  for (const P of players) {
    const had = PRES.ships.has(P.id);
    // NO FAMILY, deliberately: this map is keyed by SEAT, and a seat index is
    // an enumeration rather than a minted id. There is no producer here to
    // reset, so there is nothing for a max to detect.
    const r = presRoll(PRES.ships, P.id, P.ship.x, P.ship.y);
    // a FIRST sighting is not a cut. presRoll marks a new record snap so it
    // appears AT its pose rather than lerping from zero, but there is no prior
    // pose for a wake to bridge and no ring to cut — only a displacement
    // verdict is worth forwarding.
    if (had && r.snap) PRES_CUT[P.id] = true;
  }
  presSweep(PRES.ships);
  // EACH FAMILY ANSWERS FOR ITS OWN PRODUCER — see the PRES block. The four
  // checks are independent now and each one clears only what it detected.
  const m = window.Encounter && Encounter.mapState ? Encounter.mapState() : null;
  const foes = m ? m.enemies : null;
  const miss = m ? m.missiles : null;
  const orbs = m ? m.orbs : null;
  if (foes && presIdReset(foes, PRES.enemies, "enemies")) { PRES.enemies.clear(); PRES.max.enemies = { lo: 0, hi: 0 }; PRES.cuts.enemies += 1; }
  if (miss && presIdReset(miss, PRES.missiles, "missiles")) { PRES.missiles.clear(); PRES.max.missiles = { lo: 0, hi: 0 }; PRES.cuts.missiles += 1; }
  if (orbs && presIdReset(orbs, PRES.orbs, "orbs")) { PRES.orbs.clear(); PRES.max.orbs = { lo: 0, hi: 0 }; PRES.cuts.orbs += 1; }
  if (presIdReset(G.bullets, PRES.bullets, "bullets")) { PRES.bullets.clear(); PRES.max.bullets = { lo: 0, hi: 0 }; PRES.cuts.bullets += 1; }
  if (foes) for (const e of foes) {
    const r = presRoll(PRES.enemies, e.id, e.x, e.y, "enemies");
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
      const r = presRoll(PRES.missiles, b.id, b.x, b.y, "missiles");
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
  if (orbs) { for (const o of orbs) presRoll(PRES.orbs, o.id, o.x, o.y, "orbs"); presSweep(PRES.orbs); }
  for (const b of G.bullets) if (Number.isFinite(b.id) && b.id > 0) presRoll(PRES.bullets, b.id, b.x, b.y, "bullets");
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
    // the shake composes into the PRESENTED camera only — `cam` itself never
    // moves, so the aim path is untouched. Every FRAME.cam reader (the world
    // translate, the stars, the nebula, the minimap rect, drawn.camR) shakes
    // together by construction.
    FRAME.cam.x = cam.x + SHAKE.ox;
    FRAME.cam.y = cam.y + SHAKE.oy;
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
  // the shake composes AFTER the world clamp, deliberately: a wall-pinned
  // ship must still shake, at the accepted price of a few px of void showing
  // at a world wall mid-shake
  FRAME.cam.x = Math.max(0, Math.min(WW - FW, rx)) + SHAKE.ox;
  FRAME.cam.y = Math.max(0, Math.min(WH - FH, ry)) + SHAKE.oy;
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
  drawStars(); // SCREEN-SPACE since D47: it sets the IDENTITY transform, draws
               // every layer's stars parallaxed off FRAME.cam by hand (phase 4)
               // and restores globalAlpha. The next line re-sets the world matrix.
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  ctx.translate(-FRAME.cam.x, -FRAME.cam.y);
  recordDrawnFrame(); // the camera transform is set — record what this frame draws
  ctx.strokeStyle = C.wall;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, WW - 1, WH - 1); // the world border
  if (window.Encounter) Encounter.draw(ctx, FRAME); // enemies, orbs, telegraphs — under the camera, below the ship
  drawSuccessorField(); // ...and the successor plane's, in the same slot — see below

  drawFlame();
  // ...and WHO LEADS, read ONCE for the whole frame rather than per seat: it
  // sorts the seat records, and asking it four times a frame would sort them
  // four times to answer the same question. -1 whenever a build has no
  // encounter loaded (the headless sim host is one) and whenever nobody has
  // scored yet, and -1 matches no seat id, so the crown simply does not draw.
  const fieldKing = window.Encounter && Encounter.kingSeat ? Encounter.kingSeat() : -1;
  // every seat's ship draws; only seat 0 (the local pilot) wears the flame,
  // and a comet-mode seat wears its glow under the hull
  for (const P of players) {
    // an UNSEATED seat draws nothing — not even the wreck: a wreck on the
    // field says "a pilot is coming back to this", nobody is, so the hull
    // leaves with the seat — and since v8 its wire record carries no pose at
    // all, so P.ship is whatever the seat last had. THE one absent test of
    // the draw: here, ahead of the glow and the probe, so neither rides a
    // pose the field does not show, and drawShip below is simply never
    // reached for one (it takes this same H and owns no test of its own).
    // The probe's entry goes with the seat, because drawn.ships is never
    // cleared per frame and a stale entry would vouch for a ship that drew
    // nothing. No entry is the honest value, so the array goes SPARSE here,
    // and every reader of drawn.ships must test the entry before it indexes
    // into it: the three readers are the wave1 suite's frame legs (guarded
    // where they index a seat), the latency rig's dsh(), and the probe write
    // below, which re-creates a missing entry.
    const H = seatHealth(P.id); // ONE read a frame per seat — drawShip takes it
    if (H && H.absent) { delete drawn.ships[P.id]; continue; }
    // cometView owns the seat's comet STATE — its CONFIRMED phase is the wire
    // flag by construction — while presentedPool hands in the pool FRACTION,
    // predicted for the local net seat, so the halo sizes off the stick and
    // exists off the authority
    const cv = cometView(P.id, presentedPool(P.id));
    // ...and the RADIUS comes from the authoritative cache where there is one
    // (PORT-S S5, commit C). For a seat production simulates, that is the same
    // number the pose handed the kernel to collide on; for a REMOTE seat there
    // is no cache and this falls back to `cv.r` — the presented pool's own
    // halo, which trails the authority by exactly one drain. v10 carries no
    // radius field to close that gap; the exact `auraR` beside D39's kind and
    // state is on the R7 wire bill.
    cv.r = presentedAuraR(P.id);
    const vp = FRAME.ships[P.id] || P.ship; // the frame's pose for this seat
    if (cv.phase === CP_LIVE) drawCometGlow(P, cv, vp); // the glow rides the frame pose
                                            // too. CONFIRMED only: the windup and the
                                            // retract have no ink any more, so this is
                                            // back to the one phase that draws
    let ds = drawn.ships[P.id]; // the probe: record the exact pose the call gets
    if (!ds) ds = drawn.ships[P.id] = { seat: P.id, x: 0, y: 0 };
    ds.x = vp.x;
    ds.y = vp.y;
    drawShip(vp.x, vp.y, P.id, H); // ...and its damage, its hit reaction, or
                                   // its wreck — see drawShip; H is THIS seat's
                                   // wire record, read once above
    // ...and the crown, if this is the seat that leads. A seat that is DOWN
    // keeps it: the standing it is crowned for is its high-water score, which
    // a death does not take, and the board keeps the row crowned through the
    // respawn timer for the same reason. A WRECK on the field is still the
    // leader's wreck.
    if (P.id === fieldKing) drawFieldCrown(vp.x, vp.y);
  }
  // CQ pixel bullets — read off the frame view. The standard round is the
  // hoisted white dot it always was; a round whose RECORD declared a look
  // (js/abilities.js's `ink` / `streak`, render-only and out of BULLET_HASH)
  // wears it instead. NO randomness anywhere in here: the streak's direction
  // and length are pure functions of fields the frame already carries, so the
  // same frame paints the same pixels forever.
  //   THE STREAK IS CLAMPED TO THE FLOWN DISTANCE, off the same ox/oy muzzle
  // the standard trail is clamped against: a rifle round is four times as
  // fast and its full-length streak would otherwise reach back BEHIND the ship
  // that fired it on the first frame of its life.
  //   D43 (PORT-L) SPLITS THIS LOOP IN TWO, ON THE RECORD AND NOT ON THE
  // SHOOTER. A round that DECLARED a look — js/abilities.js's rail, ink
  // #d97757, streak 27.5 — keeps the code below byte for byte. A round with NO
  // ink is the basic gun, and it is the demo's bolt.
  //   The stamp is on the DRAW and not on fire(), deliberately: js/game.js runs
  // under the headless sim host with no palette in scope (C falls back to {}),
  // so a colour stamped at fire() would be `undefined` on the server and would
  // also have to cross the wire. The draw default covers solo and every round
  // that reaches this pass from the wire, because js/net.js hands back `ink`
  // undefined for the basic gun.
  //   THE ONE ROUND IT DOES NOT REACH is the ?mp own seat's SPECULATIVE tracer,
  // which is not in this array at all — drawTracers paints it, and it keeps the
  // old look until R7 does the wire hand-off.
  ctx.fillStyle = C.bright;
  for (const b of FRAME.bullets || G.bullets) {
    if (b.dead || b.spent) continue; // consumed or expired — the next sweep removes it
    if (b.ink !== undefined) {
      const h = b.streak > 0 ? Math.hypot(b.vx, b.vy) : 0;
      if (h > 0) {
        // the flown distance is a SIGNED PROJECTION along the velocity, not a
        // bare hypot: the muzzle sits at the NOSE, ahead of the spawn pose, so a
        // newborn round reads ~-SHIP_R and a distance would paint that as a
        // backward streak through the hull — the exact defect the clamp exists
        // to prevent. Negative clamps to zero: no tail until the round clears
        // its own nozzle.
        const len = Math.min(b.streak,
          Math.max(0, ((b.x - b.ox) * b.vx + (b.y - b.oy) * b.vy) / h));
        if (len > 0) {
          ctx.save(); // the line join and width may not leak onto the dots below
          ctx.strokeStyle = b.ink;
          ctx.lineWidth = (b.r || 2.2) * 1.1;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(b.x - (b.vx / h) * len, b.y - (b.vy / h) * len);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.restore();
        }
      }
      ctx.fillStyle = b.ink;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r || 2.2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    // ---- THE STANDARD ROUND IS THE DEMO'S BOLT ---------------------------
    // A BOLT_LW segment BOLT_TICKS long in alternating cyan/ink, and NO disc:
    // the demo's bolt has no body but its own line. The COLLISION radius is
    // untouched — b.r is still 5.5 and is simply not read here, which is what
    // "the draw radius is decoupled from r" means.
    //   PARITY KEYS ON `id`, NOT ON THE TICK. BCOOL/TICK is 8 since D50 / OPEN 2
    // (PORT-F) and was 24 before it — an EVEN number either way, so a tick key
    // is CONSTANT between two shots of this gun and the claim survives the
    // retune untouched. `id` comes from
    // Encounter.nextId(), which orbs also mint from, so consecutive rounds
    // alternate and an orb minted between two shots flips the phase — as
    // arbitrary as the demo's own S.tick & 1, and the tell survives either way.
    // `| 0` so a staged round with no id reads a stable 0 instead of NaN.
    const s = ((b.id | 0) & 1) ? 1 : -1;
    const h = Math.hypot(b.vx || 0, b.vy || 0);
    if (h > 0) {
      const cap = h * BOLT_TICKS;
      const known = typeof b.ox === "number" && typeof b.oy === "number";
      const len = Math.min(cap, known
        ? Math.max(0, ((b.x - b.ox) * b.vx + (b.y - b.oy) * b.vy) / h)
        : cap); // the ONE forgiveness js/fx.js's flownFrom already grants
      if (len > 0) {
        const mx = (-b.vy / h) * s * BOLT_SIDE, my = (b.vx / h) * s * BOLT_SIDE;
        ctx.save();
        ctx.strokeStyle = s > 0 ? DEMO.cyan : DEMO.ink;
        ctx.lineWidth = BOLT_LW;
        ctx.lineCap = "round";
        ctx.beginPath();
        // TAIL FIRST, HEAD SECOND, AND IT IS LOAD-BEARING: tests/net-checks.js
        // filters recorded segments by their moveTo point and asserts exactly
        // TWO start on the round's own pose (js/fx.js's pair). A segment
        // starting at the head would make three.
        ctx.moveTo(b.x + mx - (b.vx / h) * len, b.y + my - (b.vy / h) * len);
        ctx.lineTo(b.x + mx, b.y + my);
        ctx.stroke();
        ctx.restore();
        continue;
      }
    }
    // NEVER NOTHING. A round still on its own muzzle draws no segment, and at
    // ?fx=0 the halo is not there to stand in for it — so half the line width,
    // exactly what that segment's round cap paints. Drawn at the round's own
    // pose with NO lateral offset, so this branch paints the same bytes whether
    // it was reached by len === 0 or by h === 0.
    ctx.fillStyle = s > 0 ? DEMO.cyan : DEMO.ink;
    ctx.beginPath();
    ctx.arc(b.x, b.y, BOLT_LW / 2, 0, Math.PI * 2);
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
    // ...and THE IDENTITY BLOCK under it. Both pre-start screens get it, not
    // only the card's: the affordance is about who is flying, and gating it on
    // guideShown() would leave a push-mode or invert-off player with no way to
    // pick a hull at all. The block itself is identical on both — only the
    // anchors move, see IDBLOCK.
    //   NOT on a mid-session pause (`!G.started`), and that is coverage rather
    // than a gap: once a run has started the gutter board is up, this client's
    // own row opens the same editor, and js/encounter.js draws the same strip
    // over any screen whose editor is open. The pre-start screen is the one
    // that had no route.
    //   BELOW Encounter.drawHud above, and it has to stay there: drawHud nulls
    // both rect caches at its top, so this order is what keeps the recorded
    // rects to exactly the frames that drew them.
    if (!G.started && window.Encounter && Encounter.drawIdentity) {
      const L = guide ? IDBLOCK.card : IDBLOCK.text;
      Encounter.drawIdentity(L.name, L.strip);
      // ...and the two lines of type, in the band ABOVE the pause menu's row
      // rather than under the block they qualify — see IDBLOCK. The start line
      // is the CARD screen's alone, because the text stand-in already prints
      // CLICK TO START; the rail line is on both.
      ctx.textAlign = "center";
      ctx.font = "400 9px " + FONT;
      ctx.fillStyle = C.dim;
      if (L.foot) ctx.fillText(IDSTART_LINE, FW / 2, L.foot);
      ctx.fillText(RAIL_LINE, FW / 2, L.rail);
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
  drawThrustHint();
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
    shakeCueLocal(ev.kind, ev.seat, ev.at); // the shake machine's solo intake — the
                                     // FULL kind set, own rail included; the
                                     // net drain enters through Shake.cue,
                                     // which strips ability kinds instead
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
// PUSH MODE RETIRES HERE — D30. Its only aim call was gated on the deleted
// predicate, `cursorAim()` already excluded it, and index.html has offered two
// options for a long time, so the mode was UI-unreachable before this commit and
// is unreachable in code after it. Two modes remain and `cursorAim()` is now
// always true, which is what kills the snapshotMouseAim edge this function used
// to take: `wasMouseAim && (!cursorAim() || !aiming())` cannot hold when both
// inner terms are constants.
function setAimMode(m) {
  const wasLocked = lockedMode();
  AIMMODE = m === "locked" ? "locked" : "mouse";
  if (lockedMode() && !wasLocked) seedLockedCursor(); // enter at the aim the player left
  refreshPointerWorld(); // the aim source changed — re-store its world point
  syncCursor();
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
  setCometWant(false); // ...and the comet WANT, which used to leave through the
                       // right button's arm block. D30 unbound that button, so
                       // the release is stated here directly — a want left
                       // standing across a pause is a burn nobody asked for on
                       // the first tick after the resume
  // locked mode releases its held lock here too — pause is real UI, and the
  // resume click is the one gesture that re-arms it (one banner per resume)
  if ((mouseMode() || lockedMode()) && locked() && typeof document.exitPointerLock === "function") document.exitPointerLock();
  G.keys.clear(); // keyups can vanish the same way
  heldAbilityKeys.clear(); // ...and the ability keys held on the SAME keyboard,
                           // for the SAME reason. This map is the `ah` mask's
                           // only source, so an entry a vanished keyup left
                           // behind ORs its bit into every banked frame for the
                           // rest of the session — a held level nobody is
                           // holding. The server already defends the room
                           // against that shape (neutralizeHeldBank, then
                           // releaseStalledSeats), but a client that
                           // re-asserts the bit the moment the neutral frame
                           // lands just makes the release fire forever. Inert
                           // while no shipped ability arms on a hold; the day
                           // one does, this line is what stops a paused player
                           // from resuming as a stuck turret.
  clearTickInput(); // a banked delta must never survive a pause and land on resume
  stopLoop();
  syncTuner();
  // ...AND THE POINTER. This line is POR §2.14 item 7, and it is a defect that
  // has been shipping since a3478cd. In the shipped `locked` aim mode Escape
  // never reaches the game's own key handler — the BROWSER drops the lock and
  // the pointerlockchange branch is what pauses. pause() releases the lock
  // above, but nothing re-evaluated the canvas class, so `hide-cursor`
  // (index.html's `cursor: none`) survived the pause and the player hunted for
  // a pointer that was on the screen the whole time, visible only over
  // #pausemenu, which carries its own cursor rules.
  //   ITS OTHER EFFECT, NAMED RATHER THAN DISCOVERED LATER: syncCursor also
  // clears `ui-cursor`, so a paused screen in MOUSE mode goes from the drawn
  // crosshair's `cursor: default` back to `crosshair`. That is the same
  // function's own rule for a stopped game and it was always going to be the
  // answer here; it is written down because nobody asked for it.
  syncCursor();
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
// THE COMET'S ARM BLOCK, and the only copy — a button asks for the comet by
// calling this, and nothing else about that button travels with the ask. It
// was setRightHeld's middle five lines until D31 gave the comet a SECOND
// button; two buttons writing the same want by hand is two copies that can
// disagree about the press edge, which is the one part of it that is not
// idempotent.
//
// seat 0's comet WANT, synced at the client boundary. In tick mode the very
// next drained frame re-states it from bit 1 of the banked `ah` mask; event
// mode has no ring, so this write IS its level. It is the want and not the
// flag: the button asks, energySlice answers on the next tick, and a seat with
// an empty pool holds this down for nothing.
// physically seat 0: the DOM listener layer is a SEAT-0-ONLY producer (one
// document, one pointer lock — see in0). In net mode the banked frame goes
// upstream seat-agnostic and the SERVER binds it to this socket's seat, so
// this write is never the thing that decides whose comet turns on.
// THE PRESS EDGE, and it is one line now. In tick mode — solo and net alike —
// it ORs the comet's bit into the tick's press mask and the banked frame
// carries it; the sim's drain reads the bit rather than reconstructing a rise
// out of the held level, so the prevRh walk, its hardSnap re-seed and the
// solo-only DOM latch that used to paper over net mode are all deleted.
// Event mode banks nothing, which is why its latch survives: that IS its
// comet path, mirroring how event mode bypasses the ring everywhere.
function setCometWant(held) {
  if (held) {
    if (INPUTMODE === "tick") in0.acc.ap |= AB_COMET;
    else if (!players[0].input.cometWant) players[0].input.cometPress = 1;
  }
  players[0].input.cometWant = !!held;
}
// THE REFLEX HOLD (D31), as ONE function — the press and the release together,
// because they are two halves of one rule and they were briefly two hand-written
// copies. A hold is TWO writes and neither is optional: the WANT (the arm block
// above, which carries the press EDGE) and the LEVEL (heldAbilityKeys, which is
// what heldAbilityMask ORs into every banked frame and therefore what re-states
// the want after each drain). Staging only the first arms the comet for exactly
// one tick in tick mode and then loses it — which is the bug this function
// exists to make unwriteable.
//   The release asks the MASK rather than the code, because both Shifts are
// bound and letting go of one while holding the other is not a release. In tick
// mode dropping the key is already the whole release (the drain re-states the
// want from `ah`); EVENT mode banks nothing, so the want write IS its level and
// the explicit `false` is for that mode alone.
const REFLEX_ABILITY = Abilities.ABILITY.COMET; // the binding table's occupant —
                       // a later defensive ability takes the slot by editing
                       // THIS line, which is the whole of D31's "not a taxonomy"
function reflexHold(code, held) {
  if (held) {
    setCometWant(true);
    heldAbilityKeys.set(code, REFLEX_ABILITY);
    return;
  }
  heldAbilityKeys.delete(code);
  if (!(heldAbilityMask() & AB_COMET)) setCometWant(false);
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
  // THE EDITOR MAY NOT SURVIVE INTO FLIGHT. It swallows the keyboard by
  // design, so a run that starts with it open is a ship whose W does not
  // thrust and whose R does not restart — which reads as a dead page, not as
  // an open text box. It COMMITS rather than cancelling, exactly as pause()
  // does and for pause()'s reason: the player typed those letters.
  //   The pre-start mousedown route already spends a missed press on this
  // close instead of starting, so this is the backstop for the way in that no
  // canvas route can see — the pause menu's own start button, which is a DOM
  // control and takes its click off the document.
  if (window.Net && Net.closeNameEdit) Net.closeNameEdit(true);
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
    // LOCKED mode's session lock is untouched — it is this mode's only pause
    // route and the source of the unbounded movementX/Y its drawn cursor rides.
    // The two branches that followed are both gone: `!mouseMode()` was push's,
    // and `!aiming()` was mouse mode's old right-flight lock. **MOUSE MODE NOW
    // TAKES NO LOCK AT ALL, and that is the one boolean §2.12 says decides
    // whether the mode stays playable** — the deleted predicate resolves TRUE,
    // so this branch never fires. Resolved the other way, mouse mode would grab
    // a lock at resume, `if (!locked()) trackMouse(e)` would stop running, and
    // the aim would freeze at the last pre-lock position with the native cursor
    // gone. It is not inferable from the diff, so it is written here.
    if (lockedMode()) requestLock(true, false); // the session's one (standard) lock
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
                        // standard lock (OS acceleration intact), held until pause.
                        // Mouse mode takes NO lock — see the frozen branch above
  G.running = true;
  syncCursor();
  blurPanels();
  syncTuner();
  startLoop();
  // (the trailing `if (!mouseMode() && aiming()) enterAim()` retired with push
  // mode — it opened push's relative aim at the existing fire direction)
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
    // THE IDENTITY AFFORDANCE, and it sits ABOVE resume() because resume()
    // takes any left press on this screen and every press below here is spent.
    // ONE call into Encounter.nameCardClick, never a second route: that
    // function tests the strip first and the box second so the router has one
    // ordering to keep honest, and a second call site is a second ordering —
    // which is what put the old DOM box under the fire path.
    //
    // pointerDevice UNCONDITIONALLY, where the running branch below picks
    // lcurDevice() in locked mode. lockedMode() is a MODE test, not a
    // lock-held test, and resume() is what acquires the lock — at pre-start
    // NOTHING holds one, so the drawn cursor is not on the screen and hit
    // testing against its position would invert a pointer the player cannot
    // see. The running branch is right for the running screen and wrong here.
    const idp = pointerDevice(e.clientX, e.clientY);
    if (idp && window.Encounter && Encounter.nameCardClick &&
        Encounter.nameCardClick((idp.x - ox) / scale, (idp.y - oy) / scale)) {
      // ...and the KEYBOARD comes with the press. This screen is the only one
      // that shows the editor beside a live DOM control: the pause menu's
      // start button is on it, and a focused button both eats every letter
      // (js/net.js's editor declines a key whose target is a BUTTON, so a
      // slider is never renamed) and turns Space into a start. The press that
      // opens the editor hands the keys to it.
      blurPanels();
      render(); // the paused screen draws no further frames of its own — the
                // pick or the opened caret would not appear until something
                // else asked for a repaint
      return;   // ...and a press the block took NEVER also starts the game
    }
    // ...and a press that MISSED the block while an edit is OPEN is spent
    // ending that edit, and does not start either. This is the pre-start
    // equivalent of the running screen's commit-and-close below, with the one
    // difference this screen forces: there, the press had nothing else to do,
    // and here it would also have started the game. Committing a half-typed
    // name AND grabbing the pointer lock off one gesture is the shape to
    // avoid, so the gesture buys one thing and the next press starts.
    if (window.Net && Net.typing && Net.typing()) {
      if (Net.closeNameEdit) Net.closeNameEdit(true);
      render();
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
    // The identity affordance — the claim card's name box and the ship strip
    // beside it — is a FIELD target, not a gutter one, so it is tested here
    // rather than through panelAt — same drawn cursor, same press, one
    // transform further in. ONE call, not two: nameCardClick tests the strip
    // first and the box second, so the router has one ordering to keep honest
    // and the two controls can never end up on opposite sides of the fire path.
    // It is tested BEFORE the pointer-lock re-arm and
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
  // **THE RIGHT BUTTON IS UNBOUND — D30, and unbound is the whole ruling.** It
  // is not re-bound to something else here and it is not left doing a quieter
  // version of what it did: it is a free weapon button, reserved for a later
  // binding, and reserving it means this branch has nothing in it to keep. What
  // went: the comet arm (setRightHeld's, and heldAbilityMask's hard-wired bit),
  // the pointer-lock cycling that entered and left mouse-flight, and push mode's
  // enterAim. Locked mode's branch was already empty — "the lock never cycles on
  // the buttons in this mode" — so that mode loses nothing at all.
  //   `canvas.contextmenu`'s preventDefault STAYS: an unbound button must still
  // not raise the OS menu over a live field, which is a page concern and never
  // was a binding.
  if (e.button === 0) {
    G.leftHeld = true;
    inputFire();
  }
});
document.addEventListener("mouseup", (e) => {
  if (e.button === 0) G.leftHeld = false;
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
  // the DEATH overlay owns the keys — and it is the only overlay left that
  // freezes anything: frozen() is `E.state === "dead"` and nothing else
  // (js/encounter.js:1141), because the modal shop went away with the panel
  // shop — "No state freezes for a shop: the panel is live at every moment of
  // play, so a purchase is just buy()" (js/encounter.js:2752-2757). A frozen
  // sim keeps G.running true, so without this gate every ring press below would
  // still enter G.keys and rewrite the stored aim behind the overlay.
  //
  // THIS RETURN KEEPS NEW PRESSES OUT FOR THE WHOLE FREEZE, AND THAT IS ALL IT
  // DOES. Nothing AUTOMATICALLY clears the keys already down when the freeze
  // begins — pause() (:4521-4522) and the window `blur` handler (:4971) are the
  // only two sites in this file that clear G.keys and heldAbilityKeys wholesale,
  // and a freeze is neither — but ordinary keyup still releases its own key:
  // the listener at :4886 is unguarded and deletes the code from both sets
  // whether the sim is frozen or not. So the lurch is narrower than "held into
  // the freeze": a key KEPT DOWN through the R restart stays in the set and
  // reaches the first unfrozen bank, while one let go on the death screen is
  // gone by then. (This block used to credit an `openShop()` with clearing the
  // set for the keys already held. No such function is defined anywhere in
  // js/ — it went with the modal shop — so the sentence described a release
  // that has never run, next to a sentence describing the lurch it would have
  // prevented. The lurch is the half that was true, once narrowed.)
  if (window.Encounter && Encounter.frozen()) return;
  if (!G.running) return; // the ring only exists in flight, same as the right button
  // THE BENCH BINDINGS, between the running gate and the aim ring so they
  // inherit every guard above for free — the typing gate, Escape, the frozen
  // overlay and the running test. Both branches MUST return before G.keys.add
  // below: KEY_AIM has no entry for these codes and keyDirection() would read
  // undefined.
  if (e.code === "Space") {
    e.preventDefault(); // Space scrolls the page
    if (e.repeat) return; // auto-repeat is not a press
    inputAbility(SELECTED_ABILITY);
    heldAbilityKeys.set(e.code, SELECTED_ABILITY); // ...and the HELD level, so a
                       // record that arms on a hold reads the button honestly
    return;
  }
  // THE REFLEX HOLD — D31. Shift holds whatever defensive ability the pilot
  // owns, and the comet is today's occupant. TAKE THAT LITERALLY: this is a
  // BINDING TABLE and not a taxonomy, so the ability is named here, in one
  // place, and a later defensive ability takes the slot by editing this branch.
  // There is no role field, no defensive-class enum and no second selector.
  //
  // It calls setCometWant rather than inputAbility, because inputAbility
  // REFUSES the comet by design — `id < AB_FIRST` (:1851) — the comet's whole
  // state is scalars (P.cool's sibling pool, P.comet) rather than a slot
  // record, so it has no slot for the general path to arm.
  //
  // BOTH physical Shifts bind. A pilot's left hand is on WSAD, so the left
  // Shift is the one under the little finger; the right one is bound too
  // because a mirrored grip exists and an unbound key that LOOKS bound is the
  // worse failure for a panic button.
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
    if (e.repeat) return; // auto-repeat is not a press: the level below is
                          // already set, and a second edge would re-latch the
                          // press bit every ~30 ms of a held panic button
    reflexHold(e.code, true); // the want AND the held level — see reflexHold
    return;
  }
  // THE THRUST FRAME TOGGLE — D12, and `KeyT` is the owner's key ("It can be T,
  // I don't care"). It sits with the other bench bindings, between the running
  // gate and the aim ring, so it inherits the SAME four guards: the typing gate,
  // Escape, the frozen overlay and the running test.
  //   THE TYPING GATE IS D12'S OWN LAW, not a convenience — "a T typed into
  // 'Trader' must not flip the pilot's thrust frame" — and the reason it is free
  // here is exactly the reason the SHIFT branch's is: this handler opens with
  // `if (typingName()) return;`. js/encounter.js's KeyR restart carries the same
  // guard by hand and its comment records why the redundancy survives.
  //   R WAS THE FIRST CHOICE AND WAS WITHDRAWN: KeyR is the death-screen RESTART
  // (js/encounter.js, gated on E.state === "dead"), so sharing it would have
  // bought a state gate at two call sites for a key the owner did not care
  // about. `KeyT` collides with nothing — the complete bound set across js/,
  // index.html and demo-play.html is KeyA/C/D/E/Q/R/S/W/X/Z plus Escape, Space,
  // the Shifts and Digit0-9.
  if (e.code === "KeyT") {
    if (e.repeat) return; // a held T is one flip, not thirty a second
    setThrustFrame(THRUSTFRAME === "ship" ? "screen" : "ship");
    return;
  }
  if (e.code.startsWith("Digit")) {
    const n = Number(e.code.slice(5));
    // 1 selects the first BENCH ability, so the two shipped ones keep their own
    // buttons and the digits count the bench. Selection is client UI: it changes
    // which bit Space sets and nothing else, and it may change mid-flight.
    if (n >= 1 && Abilities.exists(AB_FIRST + n - 1)) SELECTED_ABILITY = AB_FIRST + n - 1;
    return;
  }
  const d = KEY_AIM[e.code];
  if (!d) return;
  G.keys.add(e.code);
  // **THE KEY AIM-SNAP IS GONE — D30, and it is a HASHED deletion, which is why
  // it is spelled out.** The gate was `if (aiming() || e.repeat) return;` and
  // the block below it wrote P.aimAngle, P.aimOff and P.aimed — all three
  // hashed — whenever the ring held the AIM role instead of the thrust role.
  // With the swap deleted the ring only ever thrusts, so the gate is always
  // taken and the block was unreachable. Deleting it moves NO trace: for a
  // shipped-default player the gate was already always taken (INVERT shipped
  // true, so aiming() was true with the button released), and the four fixtures
  // that used to stage `setInvert(false)` were re-authored onto the ring one
  // commit ago precisely so this deletion would be provably neutral.
});
document.addEventListener("keyup", (e) => {
  G.keys.delete(e.code);
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") reflexHold(e.code, false);
  else heldAbilityKeys.delete(e.code);
});
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
  // **THE MOUSE NO LONGER THRUSTS, IN EITHER MODE — D30's first shipped-default
  // play change.** Locked mode's deltas always move the drawn cursor; mouse
  // mode's pointer always aims. The `else inputThrust(...)` arms that flew the
  // ship are gone from both, and push mode's whole tail (`inputAim` / else
  // `inputThrust`) retired with the mode.
  //   THAT LEAVES `inputThrust` AND `inputAim` WITH NO CALLER ON THIS CLIENT,
  // and they are deliberately KEPT. tx/ty/ax/ay are WIRE fields: the sim still
  // drains them (`Flight.thrust(K, a.tx, a.ty)`, `Flight.aim(K, a.ax, a.ay)`)
  // for any frame that carries them, and server/server.js's frameIsActive reads
  // all four. Removing a wire field is R7's binary-wire work, not this unit's,
  // so the plane stays alive on the wire and in the sim and dead on the DOM.
  if (lockedMode()) { // never trackMouse here — the frozen client coordinates would poison the mirror
    if (!locked() || !G.running) return;
    inputCursor(e.movementX, e.movementY); // deltas move the drawn cursor...
    hoverFromLcur();                       // ...and the panel hover reads it
    return;
  }
  // mouse mode holds NO lock now (see resume), so the guard below is a constant
  // — kept as written rather than dropped, because it is the honest statement of
  // when a native-pointer read is valid, and a mode that acquired one later
  // would need it back.
  if (!locked()) trackMouse(e);
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
  // push mode's branch (`if (!mouseMode()) { if (!locked()) pause(); }`) retired
  // with the mode. What is left is MOUSE mode, which asks for no lock any more —
  // so the only lock it can be holding is one a mode switch left behind, and the
  // right answer is still to give it back rather than to pause. The old second
  // arm — pause on a lost lock while flying with the mouse — went with the
  // flight role that made a lost lock mean anything.
  if (locked() && typeof document.exitPointerLock === "function") document.exitPointerLock();
});
document.addEventListener("pointerlockerror", () => {
  if (lockedMode()) pause(); // no lock, no mode — land on the menu; never a retry
                             // loop against Chrome's re-lock cooldown. Mouse mode
                             // requests no lock, so it can raise no error; push
                             // mode, which paused on one, is retired.
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
// THE FOCUS HALF of the same hazard, and the half the line above cannot cover:
// a dialog that steals the focus WITHOUT hiding the document fires `blur` and
// never `visibilitychange`. Windows raises exactly that dialog off two gestures
// a pilot makes by accident — Sticky Keys on five Shift presses, FilterKeys on
// an eight-second Shift hold, which is the shape of any held ability — and the
// keyup that follows is delivered to the dialog. Every level below then stays
// set: heldAbilityMask (js/game.js:408) ORs them into every banked frame for the
// rest of the session, so the seat flies as a stuck turret with nobody holding
// anything. demo-play.html:482 ships this same line for this same reason.
//
// This is pause()'s CLEARING BLOCK and nothing else, because losing the focus is
// not a pause: the loop keeps running, the pointer lock is the browser's own
// business (pointerlockchange above has it), and clearTickInput() stays OUT — the
// accumulator holds real input the pilot made in the milliseconds before the
// blur and the next tick is entitled to it, which is precisely what is NOT true
// across a pause. The writes are a COPY of pause()'s, in pause()'s order, and
// the two sites are one list: a held level added to either belongs in both.
window.addEventListener("blur", () => {
  G.leftHeld = false;
  setCometWant(false); // pause()'s line, in pause()'s order — the two sites are
                       // ONE list, and D30 moved this release out of the right
                       // button into both of them
  G.keys.clear();
  heldAbilityKeys.clear();
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
  syncDevTabs();
  placeDevPanel(); // tabs differ in height — the new one re-hangs the panel
  devbody.scrollTop = 0; // a tab opens at its own top, never at the last one's offset
  render(); // every UI transition repaints — one rule, so no caller has to know what is on screen
}
function openDev() {
  UI.dev = true;
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
    ? "Ship playground — a drawn cursor aims; W A S D thrust and Q E Z C add diagonals, along the ship's nose by default with T to flip to screen-relative; left fires and Space fires the rail shot, which costs energy and a cooldown; hold Shift for energy-powered comet mode: fast, and able to ram enemies; Escape pauses"
    : "Ship playground — the visible pointer aims; W A S D thrust and Q E Z C add diagonals, along the ship's nose by default with T to flip to screen-relative; left fires and Space fires the rail shot, which costs energy and a cooldown; hold Shift for energy-powered comet mode: fast, and able to ram enemies; Escape pauses");
}
// the audition readout's gain, guarded: Sfx.state() is js/audio.js's and this
// file's caller may be skewed against it — a cached OLD audio.js beside this
// NEW game.js has a state() with no `gain`, and `.toFixed` on undefined throws
// in showTuner on every tuner paint. The build stamp only helps a tab that
// re-fetches index.html; the transition publish is the window, so the read is
// typed rather than trusted.
function sfxGainText() {
  const st = window.Sfx && Sfx.state();
  return st && typeof st.gain === "number" ? st.gain.toFixed(3) : "—";
}
function showTuner() {
  const out = (id, t) => { document.getElementById(id).textContent = t; };
  out("vmax-out", VMAX.toFixed(1) + " px/tick · " + Math.round((1000 / TICK) * VMAX) + " px/s");
  // FOUR DIGITS, NOT THREE (D50, PORT-F). The dial's own rail steps by 0.0025
  // and the shipped default is 0.005, so toFixed(3) prints "0.005" for the
  // whole first notch and "0.004" for a 0.004489 the exact D50 pair would have
  // wanted — a 10.9 % misstatement of the number being tuned.
  out("accel-out", ACCEL.toFixed(4) + " · " + Math.round(VMAX / ACCEL) + " counts to top");
  out("turn-out", TURN.toFixed(3));
  // THE DRAG-AWARE CLOSED FORM (D50, PORT-F). This line divided the cap by the
  // per-tick gain, which is the time to the top ONLY in a game with no
  // friction. At DAMP 0.985 it printed "0.8 s to top" against a measured
  // 1.52 s — and this is the string the owner reads while turning the dial at
  // the feel gate, so it is the one readout that had to become true first.
  //   v(n) = a*d*(1-d^n)/(1-d), so the tick that first reaches `cap` is
  //   n = ln(1 - cap*(1-d)/(a*d)) / ln d
  // and when the drag-terminal a*d/(1-d) is at or under the cap the ship never
  // arrives at all — the log's argument goes non-positive and the honest print
  // is "never", not a NaN or a number off the end of a scale.
  out("keythrust-out", (() => {
    const a = KEYTHRUST * ACCEL * (1 + KEYTHRUST * FLICK);
    const head = KEYTHRUST.toFixed(1) + " counts/tick · ";
    if (DAMP >= 1) return head + (VMAX / a / 60).toFixed(1) + " s to top";
    const term = (a * DAMP) / (1 - DAMP);      // the drag-terminal speed
    if (!(term > VMAX)) return head + "never reaches top (drags out at " + term.toFixed(2) + " px/tick)";
    return head + (Math.log(1 - (VMAX * (1 - DAMP)) / (a * DAMP)) / Math.log(DAMP) / 60).toFixed(1) + " s to top";
  })());
  out("wallloss-out", Math.round(WALLLOSS * 100) + "% speed lost per bounce");
  out("damp-out", DAMP === 1 ? "1 — no friction: a ship coasts until a wall stops it"
    : Math.round((1 - DAMP) * 1000) / 10 + "% of speed bled per tick");
  out("inputmode-out", INPUTDESC[INPUTMODE]);
  out("inputlag-out", INPUTMODE === "tick"
    ? (INPUTLAG === 0 ? "no delay" : INPUTLAG + " ms · " + Math.round(INPUTLAG / TICK) + " ticks late")
    : "per-tick input only — an OS event has no tick to be late against");
  out("aimmode-out", AIMDESC[AIMMODE]); // both modes have an option now — push retired with D30
  out("aimdist-out", AIMDIST + " px to " + (cursorAim() ? "triangle" : "target")); // locked draws the triangle too — only push rings a target
  out("thrustframe-out", THRUSTFRAME === "ship"
    ? "W is FORWARD along the nose · T toggles"
    : "W is UP on the screen · T toggles");
  // THE QUANTISED TRUTH (D50, PORT-F). `1000 / BCOOL` is the rate the slider
  // asks for; the sim fires on a TICK COUNT, max(1, round(BCOOL / TICK)), so at
  // BCOOL 130 the panel said 7.7 shots/s while the ship fired 7.500. The gate
  // it states is the gate the ship uses.
  out("cool-out", (() => {
    const ct = Math.max(1, Math.round(BCOOL / TICK));
    return BCOOL + " ms · " + ct + " ticks · " + ((1000 / TICK) / ct).toFixed(3) + " shots/s";
  })());
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
  out("camlead-out", CAMLEAD + " ticks of lead · " + Math.round(CAMLEAD * VMAX) + " px at top speed");
  // The reading the owner needs is what the number DOES, and the gain is not
  // self-evident: CursorPull 1 is his own Blend 0.5, the plain midpoint.
  out("cursorpull-out", CURSORPULL === 0 ? "0 — the cursor moves the camera not at all"
    : CURSORPULL.toFixed(2) + "× toward the cursor · 1 = halfway to it");
  out("leaddz-out", LEADDZ + " ms to commit a reversal · 0 = off");
  out("edgemargin-out", EDGEMARGIN + " px the ship keeps from the view edge");
  out("shakeamp-out", SHAKEAMP === 0 ? "0 — screen shake off" : SHAKEAMP.toFixed(1) + "× shake amplitude");
  out("shakedecay-out", SHAKEDECAY + " ticks · " + (SHAKEDECAY * TICK / 1000).toFixed(2) + " s to settle");
  out("stardens-out", STARDENS.toFixed(1) + " stars per cell (avg)");
  // D44/D47's three look rows. The star readout states the DEVICE side, because
  // that is what the rule computes and because the notches are NOT all
  // distinct: at dpr 1 the thirteen settings give seven sides, and at dpr 1.25
  // StarSize 1.00 and 1.25 draw the identical 3 px mark. Saying the side out
  // loud is the only way the owner can see which notches are the same notch.
  out("glow-out", (window.FX ? FX.snapshot().glow : 0).toFixed(2) + "× halo radius and alpha");
  out("starsize-out", STARSIZE.toFixed(2) + " → " + Math.max(STAR_MIN_PX, Math.round(STARSIZE * 2 * dpr))
    + " device px at dpr " + dpr);
  out("starlit-out", STARLIT.toFixed(2) + "× the depth ladder (0.65 / 0.82 / 1.00)");
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
  out("comet-aura-out", COMETAURA === 0 ? "0 — the halo is drawn only, and eats nothing"
    : COMETAURA.toFixed(1) + " damage a tick to every body and enemy round inside the halo");
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
    sfxGainText());                                                 // is the one copy of the curve
  out("sfxmute-out", SFXMUTE ? "muted — every cue is dropped" : "sound on");
  out("sfxshot-out", Math.round(SFXSHOT * 100) + "% · fire, wall ticks, hits, kills, the blast");
  out("sfxfoe-out", Math.round(SFXFOE * 100) + "% · enemy tells, spawns, damage taken");
  out("sfxui-out", Math.round(SFXUI * 100) + "% · pickups, waves, the shop");
  out("sfxeng-out", Math.round(SFXENG * 100) + "% engine hum · follows the flame");
  out("sfxvary-out", SFXVARY ? "on · fire, hit, wall, clang, kill jitter ±4 % pitch, ±10 % level"
                             : "off · every repeat cue byte-identical");
  out("sfxpan-out", Math.round(SFXPAN * 100) + "% width · shots and foes pan, ui and the engine stay centred");
  out("sfxtest-out", window.Sfx ? Sfx.state().line : "no audio module — the page is silent");
}
// ---- THE ENEMIES TAB IS RETIRED (PORT-S S3b lane 3, commit D4) ------------
// `buildEnemyTab`, `ENEMY_ROWS` and `showEnemyTuner` generated the dev panel's
// enemies tab from `Encounter.tuning`, which was 203 slider rows over the nine
// ECFG archetype blocks D9 replaced. The surface went with the table it drove
// and the generator goes with the surface — a builder that reads a schema
// nobody publishes is a tab that opens empty and says nothing about why.
//
// THE TAB, ITS BUTTON AND ITS SECTION go too (index.html). Every one of those
// rows was in NET_LOCKED_IDS, so nothing is left half-gated behind.
//
// The successor plane's own tuning is js/demo-kernel.js's STATS table; giving
// it a live slider surface is not a transcription this lane can make.
//
// STILL OPEN AFTER PORT-S S4. That round added DIALS of its own — `ESCALATE`
// (D16's per-cycle rise), `CLEAR_HOLD` / `ECFG.clearHold` (the break) and
// `ECFG.stallTicks` (D21(a)'s surface) — and every one of them is a source
// literal with a stated first-pass value, waiting on the feel gate. A slider
// surface for the STATS table and for those three is the same question, and it
// is still nobody's.
const CAMDESC = { // one-line reminders beside the camera selector
  lock: "hard-centers the ship",
  smooth: "eases toward center",
  deadzone: "moves at the box edge",
  lookahead: "leads by velocity and cursor",
  flip: "slides room to room",
};
// push keeps its entry and its whole code path, but no menu option: locked
// mode covers every case it served, and it is the one mode whose aim cannot
// go local under INPUTLAG (it integrates delayed deltas, with no pointer to
// resolve against). setAimMode("push") still works — the check suites stage
// through it, because its aim is pure state with no cursor or camera in it.
const AIMDESC = {
  mouse: "the visible pointer aims — no lock is taken",
  locked: "one held lock · a drawn cursor aims",
};
// The A/B the human flies — see INPUTMODE. THE OLD COPY DESCRIBED THE MOUSE
// REPORT RATE ("apply each OS mouse report", "sum reports, apply once per
// tick"), and D30 deleted every DOM caller of inputThrust and inputAim: the live
// mousemove path tracks the native pointer or moves the drawn cursor and thrusts
// nothing. The three report-rate legs in the golden suite retired for exactly
// that reason, and this selector was left teaching the plane they retired with.
// What the two modes really differ in now is WHEN a tick's input is assembled
// and whether a delay can be applied to it.
const INPUTDESC = {
  event: "act at once — no banked frame, so the delay slider does nothing",
  tick: "bank keys, cursor and masks once per tick — the delay applies here",
};
// one binder for every control: write the tunable, then refresh the readouts
// The phase-11 tunables seam: in NET MODE the sim-affecting rows are LOCKED
// to their file defaults. The flight kernel reads these module globals
// directly (the 11a decision), and the own-ship predictor replays through
// the same kernel — a locally dragged VMAX would silently diverge every
// prediction from the server's sim. View, camera, fx and audio rows stay
// live; the ONE gate sits here so no slider needs its own guard.
const NET_LOCKED_IDS = new Set(["vmax", "accel", "turn", "keythrust",
  "wallloss", "damp", "cool", "autofire", "bspeed", "bfactor", "bmax", "blife",
  "bounce", "contactcd", "pvp-rewind",
  "comet-acc", "comet-turn", "comet-vmax", "comet-dmg", "comet-drain",
  "comet-hit", "comet-thr", "comet-aoe", "comet-aoedmg", "comet-aura", "comet-fury",
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
bind("damp", (v) => { DAMP = v; }).value = String(DAMP);
bind("inputmode", (v) => { setInputMode(v); }).value = INPUTMODE;
bind("inputlag", (v) => { INPUTLAG = v; }).value = String(INPUTLAG);
bind("aimmode", (v) => { setAimMode(v); }).value = AIMMODE; // two options — AIMSENS left with push's
bind("aimdist", (v) => { AIMDIST = v; }).value = String(AIMDIST);
bind("thrustframe", (v) => { setThrustFrame(v); }).value = THRUSTFRAME;
// the `invert right` checkbox is GONE from index.html with D30 — there is no
// role to invert. bind() would throw on the missing element, so the row's
// binding goes with its markup.
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
// D11's own row. The `lead source` selector, `aim lead` and `lead blend` left
// index.html with the mechanism they steered — see leadVec().
bind("cursorpull", (v) => { CURSORPULL = v; }).value = String(CURSORPULL);
bind("leaddz", (v) => { LEADDZ = v; }).value = String(LEADDZ);
bind("edgemargin", (v) => { EDGEMARGIN = v; }).value = String(EDGEMARGIN);
// the shake rows stay LIVE in net mode like every camera row — render-only
// state, so NET_LOCKED_IDS deliberately excludes them
bind("shakeamp", (v) => { SHAKEAMP = v; }).value = String(SHAKEAMP);
bind("shakedecay", (v) => { SHAKEDECAY = v; }).value = String(SHAKEDECAY);
bind("stardens", (v) => { STARDENS = v; render(); }).value = String(STARDENS); // the idle sky repaints live
// D44's halo dial and D47's two star dials. Deliberately NOT net-locked, in the
// stardens idiom: they are render-only and reach no sim value, so a client may
// drag them in a live room exactly as it may drag the shake pair.
bind("glow", (v) => { if (window.FX) FX.setGlow(v); render(); })
  .value = String(window.FX ? FX.snapshot().glow : 1.2);
bind("starsize", (v) => { STARSIZE = v; render(); }).value = String(STARSIZE);
bind("starlit", (v) => { STARLIT = v; render(); }).value = String(STARLIT);
bind("minimap", (v) => { MINIMAP = v; render(); }).checked = MINIMAP;
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
bind("comet-aura", (v) => { COMETAURA = v; }).value = String(COMETAURA);
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
// The stored values land on the lets BEFORE the binds below copy them into
// the dev controls, so a reload shows the remembered volume everywhere at once.
SFXVOL = storedVol();
SFXMUTE = storedMute();
// One pair of setters owns master and mute — the pause menu's slider and
// button, the dev panel's two rows and a console CALL of a setter all
// converge here, so the four controls can never disagree about the state.
// (A raw console write of the let itself bypasses them, exactly as it always
// bypassed the dev binds — the panel repaints on its next input event.) syncAudioUi() is the
// SILENT half (DOM from the lets, no audition, no persist): it is also what
// load calls once, because calling a setter at load would Sfx.unlock() with no
// gesture and falsify the "idle — audio starts on the first click" line.
const volumeEl = document.getElementById("volume");
const mutebtn = document.getElementById("mutebtn");
function syncAudioUi() {
  volumeEl.value = String(SFXVOL);
  document.getElementById("sfxvol").value = String(SFXVOL);
  document.getElementById("sfxmute").checked = SFXMUTE;
  mutebtn.textContent = SFXMUTE ? "unmute" : "mute";
  mutebtn.setAttribute("aria-pressed", SFXMUTE ? "true" : "false");
}
function setMasterVol(v) { SFXVOL = v; syncAudioUi(); storeAudio(); showTuner(); audition(); }
function setMute(b) { SFXMUTE = !!b; syncAudioUi(); storeAudio(); showTuner(); audition(); }
bind("sfxvol", (v) => { setMasterVol(v); });
bind("sfxmute", (v) => { setMute(v); });
bind("volume", (v) => { setMasterVol(v); });
mutebtn.addEventListener("click", () => setMute(!SFXMUTE)); // a button never fires "input" — "click", like every button here
syncAudioUi(); // the load-time paint of all four controls from the (possibly stored) lets
bind("sfxshot", (v) => { SFXSHOT = v; audition(); }).value = String(SFXSHOT);
bind("sfxfoe", (v) => { SFXFOE = v; audition(); }).value = String(SFXFOE);
bind("sfxui", (v) => { SFXUI = v; audition(); }).value = String(SFXUI);
bind("sfxeng", (v) => { SFXENG = v; audition(); }).value = String(SFXENG);
bind("sfxvary", (v) => { SFXVARY = v; audition(); }).checked = SFXVARY;
bind("sfxpan", (v) => { SFXPAN = v; audition(); }).value = String(SFXPAN);
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
window.__test = { G, players, cam, step: clientStep, setCamMode, render, WW, WH, FW, FH, SHIP_R,
  // the successor field's ISOLATING LEVER — see drawSuccessorField
  setSuccessorDraw: (on) => { SUCCESSOR_DRAW = !!on; },
  // ...and the LETTERBOX FIT the world pass draws under. Published so a canvas
  // claim can convert a WORLD point to a CANVAS point instead of restating the
  // fit — a second copy of this arithmetic is a second layout to keep in step,
  // which is the reason `identityRects` and `panelSpec` are published too.
  viewFit: () => ({ scale, ox, oy }),
  // cursorHidden, aiming, setRightHeld and setInvert all left this list with the
  // role swap. Each removal was checked the way the rule requires — an
  // accessor's contract is with ALL its readers, so every reader was restaged in
  // the commit that took the accessor, never left calling a shim.
  updateCamera, leadVec, fireDir, mouseAimDir, markerDir, gate, setAimMode,
  // the FRAME: a suite pins it exactly as it pins the aim mode and the input
  // path, and for the same reason — a fixture that let the page default decide
  // would silently re-frame every trace that holds a key the day the default
  // moves. thrustFrameMode reads it back so a leg can restore what it found.
  setThrustFrame, thrustFrameMode: () => THRUSTFRAME,
  // THE REFLEX HOLD, exposed because D30 took the old staging away. Until this
  // commit a suite armed the comet with setRightHeld(true) and the button's own
  // arm block did the rest; the button is unbound now, so the seam points at
  // reflexHold — THE FUNCTION THE SHIPPED KEYDOWN BRANCH CALLS, not a reduced
  // copy of it. That distinction is the whole reason it is this function and not
  // setCometWant: a seam onto the want alone stages HALF a hold, and half a hold
  // arms the comet for one tick in tick mode and then loses it to the next
  // drain. It is a door onto live production code, which is what separates it
  // from the seams this unit REFUSED to add.
  //   A leg that means to prove the BINDING rather than the hold dispatches the
  // real ShiftLeft keydown instead — tests/pause-ui-checks.js section K does,
  // and it is what would notice if the branch stopped calling this.
  reflexHold,
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
  // setLeadSrc and setAimLead left this list with LEADSRC, AIMLEAD and
  // LEADBLEND — D11's rule replaced the selector rather than retuning it. Both
  // were checked the way the rule requires: ZERO readers across tests/, test/
  // and server/ before the removal, so no instrument was left calling a shim.
  setLeadDz: (v) => { LEADDZ = v; },
  setEdgeMargin: (v) => { EDGEMARGIN = v; },
  setCamLead: (v) => { CAMLEAD = v; },
  // D11's dial and the term it scales, published together because a gate that
  // could set the gain but not read the offset would be asserting the rule
  // against its own re-spelling of half of it. THE SEAM MOVED HERE from
  // js/demo-render.js's own __test — PORT-S-DEBT.md demanded that PORT-S say in
  // writing whether the seam moves or dies, and this is the moving half: the
  // camera the owner's rule now lives in is THIS one, so the oracle points here.
  // test/tools/demo-aimlead.mjs is the reader, through server/sim-host.mjs.
  setCursorPull: (v) => { CURSORPULL = v; },
  cursorOffset,
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
  // the HULL TABLE and the one read the ship draw makes into it. Published so
  // a check can drive the real resolver — a leg that asked "does this seat draw
  // a different plate" by diffing pixels alone could not tell WHICH hull it
  // got, and a leg that re-derived the fallback itself would be testing its own
  // copy of the rule instead of the one that ships.
  // ...and the copy is honest for what a test would poke: `pts` is cloned
  // per row (a shared array would let a probe bend the shipping silhouette),
  // and the lazily built p2d cache is never handed out.
  hulls: () => HULLS.map((h) => {
    const c = { ...h };
    if (c.pts) c.pts = c.pts.map((p) => [p[0], p[1]]);
    delete c.p2d;
    return c;
  }),
  hullFor,
  // the body-table loader itself, published so the identity legs can prove
  // its three contracts on rows that never ship: an N-gon bakes to unit pts,
  // an authored list normalises to circumradius 1, and a junk `d` string —
  // which new Path2D would swallow silently — dies at load instead
  compileHulls,
  setFxInt: (v) => { FXINT = v; },
  setFxDur: (v) => { FXDUR = v; },
  // D47 (PORT-L) — the starfield's seed, so two pages can be photographed under
  // ONE sky. SEED is randomised at parse time and the only other writer is the
  // reseed button, which randomises too; there is no ?seed= anywhere. This is a
  // render-only seam: SEED reaches no hash, no fixture and no tunable record.
  setSeed: (v) => { SEED = (v >>> 0); },
  starDials: () => ({ STARDENS, STARSIZE, STARLIT, dpr,
    side: Math.max(STAR_MIN_PX, Math.round(STARSIZE * 2 * dpr)) }),
  setStarSize: (v) => { STARSIZE = +v || 0; },
  setStarLit: (v) => { STARLIT = +v || 0; },
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
  // the first-run card: the gate and the load flag as two separate answers —
  // a check can assert the eligibility rules on a page whose PNG is still in
  // flight — plus the rect the UI pass draws, so nothing has to hardcode it
  guideState: () => ({ eligible: guideEligible(), ready: guideReady, shown: guideShown(),
    x: GUIDE_X, y: GUIDE_Y, w: GUIDE_W, h: GUIDE_H, src: GUIDE_SRC,
    // ...and the IDENTITY BLOCK's anchors and copy, on the same ground the
    // rect above is published on: nothing that checks this screen should have
    // to hardcode where the block sits or what it says. Both rows, because a
    // check has to be able to compare them — the whole reason there are two is
    // that the card and the text stand-in end at different heights.
    idBlock: IDBLOCK, startLine: IDSTART_LINE, railLine: RAIL_LINE }),
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
  // the remembered volume: read() is what a reload would apply (validated,
  // defaulted), clear() drops both keys so a suite's drives never leak into
  // the next page load on the same origin
  audioStore: {
    read: () => ({ vol: storedVol(), mute: storedMute() }),
    clear: () => { try { window.localStorage.removeItem(SFXVOL_KEY); window.localStorage.removeItem(SFXMUTE_KEY); } catch {} },
  },
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
  // ---- THE AURA RADIUS SEAM (PORT-S S5, commit C) ---------------------------
  // `auraRadiusOf` is the ONE derivation and `presentedAuraR` is the ONE
  // authoritative read. They are published together because the claim the
  // suites make is that DRAW, LIGHT and the kernel's COLLISION all answer the
  // same number on the same tick, and a leg that recomputed the formula beside
  // them would be a fourth answer rather than a check on the other three.
  auraRadiusOf, presentedAuraR, auraCache: (s) => AURA_R[s],
  auraFrac: (s) => AURA_F[s],
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
  // three keys left this record with the role swap — `aiming`, `rightHeld` and
  // `cursorHidden` — and each one's readers were restaged in the commit that
  // took it. What remains is what a caller can still act on: which mode owns the
  // aim, where the pointer is, where the shots go, and whether a lock is held.
  aimState: () => ({ AIMMODE, mouse: { ...G.mouse }, direction: fireDir(), locked: locked() }),
  camState: () => ({ CAMMODE, CAMEASE, CAMBOX, CAMLEAD, CURSORPULL, LEADDZ, EDGEMARGIN }),
  // the screen-shake machine, read-only: the two sliders and the live episode
  // state, so a check can assert the offset against drawn.camR
  shakeState: () => ({ SHAKEAMP, SHAKEDECAY, amp: SHAKE.amp, peak: SHAKE.peak,
    age: SHAKE.age, ox: SHAKE.ox, oy: SHAKE.oy }) };

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
// ...and the GUARDED half of the same allow-list. THE ALLOW-LIST GREW AT R5,
// deliberately and for the first time since it was declared: `blastR` is the
// splash radius the round was FIRED with (standing rule 5 — a value captured
// at spawn lives in a field the spawner does not later mutate), and it belongs
// in the hash by the allow-list's own contract, because it decides what the
// simulation will do when the round terminates.
//
// It is listed HERE rather than appended above because an unconditional fold
// would cost its bytes on every tick of every trace, including the traces where
// nobody ever bought BLAST CHARGE — the exact tax the charter rule refuses. The
// fold in hashBullets is entered ONCE for the whole array and, once entered,
// EVERY bullet folds, which is the README's collision defense: the array length
// is already prefixed above, so no two states can hash alike through it.
const BULLET_HASH_GUARDED = ["blastR"];
// ...and P1's ORDNANCE STATE BLOCK, in its OWN guarded fold rather than appended
// to the list above. The plan (§2.3 P1) rules the block built in full: `hp` (what
// it takes to destroy this round — D10's seventh registry obligation, arriving
// on the production side inert because production fields no destructible
// ordnance yet), `trk` (a tracking term), `phase` (where a multi-stage round is
// in its sequence) and `flank` (a lateral term). All four are ZERO on every
// round the game can currently create, so this fold costs zero bytes today and
// every committed trace holds.
//
// WHY A SECOND GUARD AND NOT FOUR MORE NAMES IN THE FIRST. The guard is entered
// on "does any round carry a non-zero value in THIS list", and the two lists
// answer two different questions: `blastR` asks "did anyone buy BLAST CHARGE",
// the block asks "does any round carry ordnance state". Merged into one list, a
// trace that bought BLAST CHARGE would pay the block's four bytes per bullet per
// tick for nothing — the exact tax the charter rule refuses, and the reason
// `blastR` was not appended to BULLET_HASH in the first place.
//
// THE COLLISION DEFENSE SURVIVES THE SPLIT, which is the thing a second guard
// has to be checked for. Each block is entered ONCE for the whole array and,
// once entered, EVERY bullet folds every field in it — so within a block no two
// states can collide. ACROSS the two blocks they cannot collide either: for n
// live rounds the first block folds n numbers and the second folds 4n, and
// n !== 4n for every n >= 1, while at n === 0 both fold nothing and the states
// are already distinguished by the length prefix above.
const BULLET_ORDNANCE_GUARDED = ["hp", "trk", "phase", "flank"];
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
    h.num(P.heading); // THE CONVERGED NOSE (D32) — it decides what the next tick
                      // does twice over: the ship-relative frame rotates the
                      // seat's thrust by it, and D29's parry will face it. That
                      // is the allow-list contract's own test, so it folds
                      // UNCONDITIONALLY rather than behind a guard: unlike an
                      // ability record, every seat carries a nose at every tick
                      // and there is no all-zero case to spare the bytes for.
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
  // the ABILITY SLOT record (P5), behind its guarded zero-default fold and
  // OUTSIDE the per-seat loop — the charter rule's idiom and the README's
  // collision trap in one line: entered ONCE for the whole room, and once
  // entered EVERY seat folds, so "seat 1 armed" and "seat 0 armed" can never
  // hash alike. At rest it folds ZERO BYTES, which is what makes an ability
  // nobody arms cost no trace. See js/abilities.js's hashInto for the encoding.
  if (window.Abilities) Abilities.hashInto(h, players);
  return h;
}
function hashBullets() {
  const h = fnv();
  h.u32(G.bullets.length);
  // live array order — the encounter's first-along-the-path arbitration walks
  // this order, so the order itself is simulation state. Never sort.
  for (const b of G.bullets) for (const f of BULLET_HASH) h.val(b[f]);
  // the GUARDED fold — zero bytes while every round in the air was fired at
  // rank 0, which is every tick of every trace committed before R5. Entered
  // once for the whole array, and once entered every bullet folds every guarded
  // field, so "seat 1's round is ranked" and "seat 0's round is ranked" can
  // never collide. See BULLET_HASH_GUARDED for why it is not folded above.
  let anyGuarded = false;
  for (const b of G.bullets) {
    for (const f of BULLET_HASH_GUARDED) if (b[f]) { anyGuarded = true; break; }
    if (anyGuarded) break;
  }
  if (anyGuarded) for (const b of G.bullets) for (const f of BULLET_HASH_GUARDED) h.num(b[f] || 0);
  // ...and P1's ordnance block, on its own guard for the reason declared beside
  // BULLET_ORDNANCE_GUARDED. Zero bytes on every trace in the tree today.
  let anyOrdnance = false;
  for (const b of G.bullets) {
    for (const f of BULLET_ORDNANCE_GUARDED) if (b[f]) { anyOrdnance = true; break; }
    if (anyOrdnance) break;
  }
  if (anyOrdnance) for (const b of G.bullets) for (const f of BULLET_ORDNANCE_GUARDED) h.num(b[f] || 0);
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
  // P1's stepper list, published so the ORDER leg can register one. It is the
  // Engine.MATRIX arrangement exactly: the declaration is reachable, the leg
  // makes the edit and puts it back, and that edit IS the leg's sabotage.
  // Nothing in the shipped game writes here.
  ORDNANCE_STEP,
  BULLET_ORDNANCE_GUARDED,
  simTick: () => simTick,
  recordInput, stopInput, replayInput,
  // the headless host's seams (server/sim-host.mjs). stepSim is the raw
  // camera-free sim tick — the SERVER's entry: no client boundary, no bank,
  // no camera. pushInputFrame is the REAL producer function, not a wrapper:
  // pushInputFrame(seat, frame) feeds seat s's ring one stored world-point
  // record, exactly the record bankTickInput banks and a wire would deliver.
  // thrustImpulse is the event-mode impulse — and after D30 the MOUSEMOVE
  // listener no longer applies it. Its live caller is step()'s key-thrust block,
  // which runs every tick a ring key is held, and that is the path the
  // re-authored flight traces take in both hosts. This EXPORT has no reader
  // left: test/node-golden.mjs called it for the mouse-delta traces and stopped
  // when those were re-authored. It is kept rather than deleted because
  // tx/ty/ax/ay are still WIRE fields the sim drains and frameIsActive reads, so
  // the injection point stays reachable until R7 decides that field set.
  stepSim: step,
  pushInputFrame,
  thrustImpulse,
  // the claim press, written where the drain writes it. Not a second path:
  // this is the SAME latch a frame's `ap` fire bit sets, so a check that presses here
  // and a client that clicks reach the encounter's respawn loop identically.
  // It exists because advance() drives ticks with no frames at all, and the
  // press has to be assertable on ONE named tick.
  pressClaim: (seat) => { const P = players[seat]; if (P) P.input.claimPress = 1; },
  // ...and its NET-MODE twin, which pressClaim above cannot be.
  //
  // WHAT IT IS. A call to inputFire(), the function the canvas mousedown
  // handler's own `e.button === 0` branch calls. Not "the one path a click
  // takes" — a real left click has to survive five earlier returns in that
  // handler first (the pre-start resume, the shop and board gutters, the claim
  // card's name box, and the pointer-lock re-arm), and this seam skips all of
  // them. It models a click on the OPEN FIELD with the lock already held, which
  // is the only click a driven pilot ever needs to make, and a check built on it
  // proves nothing about that ordering. The name-box guard three branches above
  // is there because a press aimed at the old DOM box became the seat CLAIM;
  // that ordering needs its own leg and does not get one from here.
  //
  // WHAT IT PRODUCES, and this deliberately names the CONCEPT rather than the
  // field, because the field has already moved once: the tick's banked frame
  // carries one fire PRESS BIT — `ap & AB_FIRE` today, and the plain `fp` this
  // seam was written against before R1's ability masks replaced it — and every
  // claim rule downstream reads exactly that bit. The migration happened while
  // this branch was in flight and the seam needed NO edit, which is the whole
  // argument for going through the named producer: it survives as long as
  // inputFire() keeps its name.
  //
  // WHY pressClaim IS NOT ENOUGH, and this is the whole reason the seam exists.
  // pressClaim writes THIS PAGE's `players[seat].input.claimPress`, and in net
  // mode NOTHING reads it: the loop calls Net.clientTick() rather than
  // clientStep(), so step() and Encounter.step() never run on a client at all.
  // The server's copy of the latch is set at ITS drain, from a press bit that
  // actually crossed the wire. Worse for a LAPSED seat: once the claim window
  // runs out the socket is told it SPECTATES, and js/net.js's flushInputs turns a
  // pending frame's press bit into the `ui: "claim"` message that is the only
  // door back into a parked seat. Both roads start at the same accumulator, so
  // ONE call covers both. pressClaim keeps its own job: advance() drives ticks
  // with no frames at all, and there the press must be assertable on one tick.
  //
  // WHY NOT WRITE THE FRAME KEY BY HAND. Two raw surfaces could produce a
  // wire-crossing press today — bumping the accumulator through the published
  // `players` array, or pushInputFrame with a hand-built record. Both are worse
  // for the same reason: they go SILENTLY INERT the moment the field is renamed.
  // A hand-written `fp` after the mask migration creates a dead property and
  // reports nothing; pushInputFrame is additionally wrong here, because net
  // mode shifts the ring's first entry and clears the rest, so an injected frame
  // DESTROYS the thrust, aim and cursor the tick actually banked — the rig would
  // measure flight it had just overwritten.
  //
  // MODE. In tick mode (the default, and the only mode the rig runs) this banks
  // the press bit and nothing else. In EVENT mode inputFire() banks nothing at
  // all: it sets the local latch and fires locally, and no claim leaves the
  // page. `inputmode` is not net-locked, so that state is reachable — a caller
  // driving this seam in event mode over a wire gets silence, not an error.
  //
  // It does NOT touch G.leftHeld. The click sets both, but held-fire is a LEVEL
  // the caller already owns per frame, and the claim rule is an EDGE
  // (js/encounter.js's respawn loop says so in full): a seam that also latched
  // the level would make a driven reclaim indistinguishable from the abandoned
  // tab the gate exists to clear.
  pressFire: () => inputFire(),
  FRAMES_PER_TICK, // the ONE frames-per-tick lid — server admission, the sim
                   // drain and the predictor's replay all read this value
  presentedPool,   // the net-mode presentation accessor, for checks
  // the presentation caches' own per-tick roll. The frame loop calls it once
  // per sim tick; a suite that drives FX.advance directly has to call it too,
  // because the light layer's cut verdict is FORWARDED from here now and a
  // layer driven with no capture behind it would never see one.
  capturePresent,
  // ...and the caches' OWN BOOKKEEPING, read-only: the per-family maxes and the
  // per-family record counts. Published because the id-monotonicity bill's
  // proving leg is a claim ABOUT this bookkeeping — "the caches do not globally
  // reset" is not observable from any pose, and a leg that inferred it from a
  // drawn frame would be measuring an interpolation instead of a decision.
  presState: () => ({ max: { enemies: { ...PRES.max.enemies }, missiles: { ...PRES.max.missiles },
                             orbs: { ...PRES.max.orbs }, bullets: { ...PRES.max.bullets } },
                      cuts: { ...PRES.cuts },
                      sizes: { enemies: PRES.enemies.size, missiles: PRES.missiles.size,
                               orbs: PRES.orbs.size, bullets: PRES.bullets.size,
                               ships: PRES.ships.size } }),
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
                           COMETDRAIN, COMETHIT, COMETTHR, COMETAOE, COMETAOEDMG, COMETAURA, COMETFURY,
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
    // ---- THE TWO S5 DIALS (S5 FIX ROUND, Codex CX-5) --------------------
    // Both are NET-LOCKED sliders, so in a net session the server tunable is
    // the only route to them and this seam is where it lands. Each is clamped
    // to its OWN slider's range, exactly as the two above are — a seam that
    // accepted values the panel refuses would not be the same lever.
    //
    // D26's AURA DAMAGE. It reaches the kernel by itself: `poseKernelSeats`
    // re-pushes `COMETAURA` across the seam every tick, so writing the
    // variable here is the whole of it. BUILDSCALE's host-setter shape does
    // NOT transfer — a host-side write is clobbered on the next tick.
    if (k === "COMETAURA") { COMETAURA = Math.max(0, Math.min(3, +v)); return true; }
    // ...and the drift retune, ruling 9's dial at its own default of 1. The
    // range is the flight tab's own 0.9..1: below 0.9 is not a feel question,
    // it is a ship that stops dead.
    if (k === "DAMP") { DAMP = Math.max(0.9, Math.min(1, +v)); return true; }
    // ---- D37's ENCOUNTERS-PER-REWARD-WAVE DIAL (PORT-S S7) --------------
    // The one dial in this list that lives in ANOTHER FILE: it is the
    // encounter's, so this branch forwards rather than holding a second copy
    // of the number. DAMP's route, not BUILDSCALE's — there is no kernel half
    // for a host setter to write. Clamped to the same 1..8 integer range the
    // server tunable coerces to, so the seam and the wire route are one lever.
    if (k === "ENCPERREWARD") {
      const n = Math.max(1, Math.min(8, Math.round(+v)));
      return !!(window.Encounter && Encounter.setEncPerReward && Encounter.setEncPerReward(n));
    }
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
