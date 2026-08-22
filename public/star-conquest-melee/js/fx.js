// js/fx.js — THE LIGHT LAYER.
//
// Render-only, and structurally so: this file is NOT in server/sim-host.mjs's
// SIM_FILES, the headless sim host never loads it, and every call site in the
// game guards as `if (window.FX)` — the same idiom game.js already uses for
// `window.Encounter` and `window.Sfx`. Nothing here reads the encounter's
// seeded rand(), writes sim state, or touches a hashed field, so no golden
// hash can move because of it.
//
// WHAT IT DRAWS. The flat pass keeps painting exactly the ink it painted
// before; this layer only ADDS light on top of it, composited into #field
// between the world pass and the UI pass so the HUD stays crisp. The material
// is split by how it must behave over time:
//
//   FRESH  — rebuilt every composite, retained never: halos (ships, comet,
//            enemies, missiles, orbs), explosion flashes, shockwave rings,
//            trails and tracer glow. A slow-moving light redrawn every frame
//            MUST be cleared every frame, or an additive buffer drives it to a
//            clipped achromatic plateau.
//   PERSIST — the phosphor: particle residue only. Faded once per SIM FRAME
//            advanced (never per rAF, or the tail length would follow the
//            display's Hz) and stamped with "lighten" (per-channel max), so a
//            pixel repainted every frame holds its designed brightness while a
//            vacated one decays into the tail.
//
// THE STEP/DRAW SPLIT is the same one that keeps drawImpacts() byte-stable:
// advance() mutates and is called once per rAF from the frame loop with the
// tick count it just ran; composite() draws and NEVER mutates. Two renders of
// one state paint identical pixels, which is what the pixel probes rely on.
// No Date.now, no Math.random, no performance.now on any path here — the
// particle stream is an fx-LOCAL LCG reseeded per cue from hash32, exactly as
// spawnImpactFx seeds its bursts.
//
// THE PURITY INVARIANT, stated exactly, because "composite() never mutates" is
// the useful shorthand and not the literal truth: composite() writes no state
// that can change what is drawn. What it does write is LAZILY BUILT CACHES, and
// there are four of them — the glow/persist/scratch/swap surfaces
// (ensureLayers), the per-color sprites, the bloom's scratch surfaces and its
// memoized filter strings, and the nebula bake. Every one is keyed by its own
// inputs and idempotent, so the second render of a state paints the first
// render's pixels, which is the property the pixel probes actually depend on.
//
// The nebula bake is the one that HAD to be reachable from a draw path rather
// than merely happening to be: the reseed button rerolls SEED and then only
// calls render(), with no advance in between. It is a pure function of SEED.
(() => {
  "use strict";

  // ---- the flag ------------------------------------------------------------
  // One switch for every drop of ink this file lays down. Off, the game is
  // byte-identical to fx.js not being loaded at all — that is check 1 of the
  // fx suite, and it is the whole contract. `?fx=0` reaches the flat look, and
  // this flag keeps no localStorage of its own: the look must be reproducible
  // from the URL alone, or a rig run and a player's tab stop agreeing.
  //   The blanket claim that once stood here — that the repository keeps no
  // localStorage at all — is no longer true. js/net.js keeps exactly ONE key,
  // `scmelee.name`, the player's typed display name, so a returning player does
  // not retype it. That key is a lobby fact: it never reaches the sim, a
  // snapshot or a hash, and it does not reach this file at all.
  let ON = new URLSearchParams(location.search).get("fx") !== "0";

  // ---- the shipping look ---------------------------------------------------
  // The playground's judged `t2` preset plus the Canvas2D bloom (its `t3lite`),
  // benchmarked on the user's RTX 5080 and priced at under ~1.2 ms per frame at
  // 4.37 Mpx. GL is not ported and there is no third canvas.
  const GLOW = 1.2;        // halo radius/alpha multiplier
  const PARTICLES = 1.5;   // emitter density — above 1.05 the embers come in
  const TRAILS = 1;        // trail length and alpha (commit 3)
  const PERSIST = 0.1;     // per-sim-frame phosphor fade
  let NEBULA = 0.8;        // the seed-baked backdrop — the ONE effect that
                           // touches base ink, and the only reason this file
                           // has a second lever of its own (setNebula)
  let BLOOM_INT = 1.4;     // the Canvas2D bloom: two blurred downsamples of the
                           // glow layer, added back with "lighter". No WebGL,
                           // and — the point — no canvas-to-texture upload per
                           // frame, which is what made the GL rung cost 11 ms
                           // of MAIN THREAD at a real window size.
  const BLOOM_RAD = 1.6;
  // The glow surface runs at HALF the screen's linear resolution and is
  // upscaled on composite. Glow is low-frequency material, so this is the main
  // fill-rate lever: a 4K fullscreen canvas costs a quarter of what it would.
  const HALF = 0.5;

  const TAU = Math.PI * 2;
  // The HOT palette. Warmer and brighter than the flat pass's C, because light
  // reads as light only when it sits above the ink it surrounds.
  const PAL = { clay: "#ff8a4a", radar: "#3ef2dd", bright: "#ffffff",
                steel: "#9aa3b2", dim: "#5c6370" };

  const FX_SALT = 0x7EE1A5E0; // this layer's own hash salt — never FX_SEED's
  const RING_N = 100;         // the cosmetic pose ring: a FIXED ring buffer with
                              // a monotonic counter, O(1) per step. Entry j back
                              // is [(n - 1 - j) % RING_N] — never push/shift.
  const FLASH_MAX = 24;       // live explosion records; the oldest is evicted
  // A ship that did not FLY where it now is — a respawn, a restart, a net snap
  // — has its trail cut and the phosphor dropped rather than smeared across
  // the world. This layer no longer decides that for itself: it used to carry
  // a TELEPORT of 80 px measured per ADVANCE, against the presentation frame's
  // own 28 px measured per TICK, and a hop between the two was cut by the
  // frame and bridged by the wake. game.js owns the one predicate now and
  // hands the verdict over per seat; see PRES_CUT there for why the verdict
  // travels and not the number.
  const cuts = [];            // seat -> this advance's forwarded verdict,
                              // refilled at the top of every advance

  // ---- baked radial glow sprites, one per color ----------------------------
  // Never build a gradient per frame. One 64px sprite per color, baked once and
  // stretched per draw; drawImage scales for free where createRadialGradient
  // does not.
  const sprites = new Map();
  function hexRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(hex, a) {
    const c = hexRgb(hex);
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
  }
  function sprite(hex) {
    const had = sprites.get(hex);
    if (had) return had;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, rgba(hex, 1));
    grad.addColorStop(0.2, rgba(hex, 0.65));
    grad.addColorStop(0.5, rgba(hex, 0.2));
    grad.addColorStop(1, rgba(hex, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    sprites.set(hex, c);
    return c;
  }

  // ---- the fx-local LCG ----------------------------------------------------
  // Separate from the sim's seeded stream by construction: a draw from THAT
  // would re-deal every wave in the game. Reseeded per cue, so a burst replays
  // identically run to run.
  let fs = 1;
  const fseed = (n) => { fs = (n >>> 0) || 1; };
  const frnd = () => { fs = (Math.imul(fs, 1664525) + 1013904223) >>> 0; return fs / 0x100000000; };
  const frr = (a, b) => a + (b - a) * frnd();

  // ---- the cue table -------------------------------------------------------
  // Which of the simulation's events become light, and how much. A kind with
  // NO entry here draws nothing at all, which is deliberate for the telegraphs
  // (windup, lock, charge, warn, clear): fifteen phases tuned those reads and a
  // halo over one destroys it. `death` is light ONLY — the base canvas already
  // paints a full debris blast for a dying hull (drawShipBlasts), and a second
  // explosion on top of it would read as two.
  const KINDS = {
    kill:       { hue: "clay",   big: false, flash: 1,    ring: 1,   parts: 1 },
    killheavy:  { hue: "clay",   big: true,  flash: 1,    ring: 1,   parts: 1 },
    boom:       { hue: "clay",   big: false, flash: 0.7,  ring: 0.8, parts: 0.7 },
    blast:      { hue: "clay",   big: true,  flash: 0.9,  ring: 1,   parts: 0.8 },
    death:      { hue: "clay",   big: true,  flash: 1,    ring: 1,   parts: 0 },
    hit:        { hue: "clay",   big: false, flash: 0.35, ring: 0,   parts: 0.25 },
    clang:      { hue: "steel",  big: false, flash: 0.3,  ring: 0,   parts: 0.2 },
    // THE TWO ENEMY-FIRE CUES, deliberately the quietest lit rows in the table.
    // They used to carry a kill-sized burst: `zap` at parts 0.3 sprayed 16
    // particles and opened a ring to 76 px around a 7 px dart, over 34 ticks —
    // more than three times the 10-tick beam it was announcing — and the 1.4x
    // bloom then widened all of it. A wave of five darts fired that every two
    // seconds, and it read as an explosion rather than a shot. An ENEMY firing
    // is the most frequent event in the game and it already has two honest
    // tells of its own (the telegraph line, then the beam itself), so the light
    // layer only has to say "now" — no particles at all, and a flash small
    // enough that the drawn beam stays the thing you look at.
    zap:        { hue: "radar",  big: false, flash: 0.2,  ring: 0.12, parts: 0 },
    dash:       { hue: "clay",   big: false, flash: 0.4,  ring: 0.5, parts: 0 },
    launch:     { hue: "clay",   big: false, flash: 0.2,  ring: 0,   parts: 0 },
    pickup:     { hue: "bright", big: false, flash: 0.35, ring: 0.3, parts: 0 },
    spawn:      { hue: "clay",   big: false, flash: 0.5,  ring: 0.5, parts: 0 },
    spawnheavy: { hue: "clay",   big: true,  flash: 0.6,  ring: 0.6, parts: 0 },
    respawn:    { hue: "bright", big: false, flash: 0.8,  ring: 0.8, parts: 0 },
    wall:       { hue: "dim",    big: false, flash: 0.2,  ring: 0,   parts: 0.15 },
    thud:       { hue: "dim",    big: false, flash: 0.2,  ring: 0,   parts: 0 },
    fire:       { hue: "clay",   big: false, flash: 0.3,  ring: 0,   parts: 0 },
  };

  // ---- state ---------------------------------------------------------------
  // kinds: 0 spark (velocity-stretched line), 1 chip (square debris),
  //        3 ember (slow long-lived drifting glow — the richness above 1.05)
  const rings = [];     // per seat: the cosmetic pose ring the trail is drawn from
  const P = [];         // the particle pool — the persist layer's only ink
  const PART_MAX = 1200;
  const flashes = [];   // {x,y,hue,big,age,life,flash,ring} — aged in advance()
  let cueCount = 0;     // the id-less events' seed source, exactly as fx.count is
  let fxTick = 0;       // sim frames this layer has advanced

  // ---- the layers ----------------------------------------------------------
  // Three offscreen surfaces at HALF the screen's linear size. `swapC` is the
  // scroll target: the persist layer lives in SCREEN space and is re-registered
  // to the new camera each advance, which needs a destination that is not also
  // the source.
  let glowC = null, glowCtx = null;
  let persistC = null, persistCtx = null;
  let scratchC = null, scratchCtx = null;
  let swapC = null, swapCtx = null;
  let LW = 0, LH = 0;
  let fadeKeep = 1;     // accumulated fade debt — see the 8-bit stall below
  let camPX = 0, camPY = 0, camHas = false, lastScale = 0;

  function mkCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  // Allocates on first use and RE-allocates whenever the backing store changes
  // size — a width assignment clears a canvas, so a resize IS the clear. That
  // second branch is why this is more than a first-call allocation, and it is
  // reachable from composite(): render() re-runs resize() itself when browser
  // zoom moves the dpr, and resize() calls FX.resize(), so in the shipped frame
  // loop the layers are already the right size by the time composite() asks.
  // The check stays here as the backstop for every other render() caller.
  function ensureLayers() {
    const w = Math.max(1, Math.round(canvas.width * HALF));
    const h = Math.max(1, Math.round(canvas.height * HALF));
    if (glowC && LW === w && LH === h) return true;
    LW = w;
    LH = h;
    glowC = mkCanvas(w, h); glowCtx = glowC.getContext("2d");
    persistC = mkCanvas(w, h); persistCtx = persistC.getContext("2d");
    scratchC = mkCanvas(w, h); scratchCtx = scratchC.getContext("2d");
    swapC = mkCanvas(w, h); swapCtx = swapC.getContext("2d");
    fadeKeep = 1;
    camHas = false;
    return true;
  }
  function clearLayers() {
    if (!glowC) return;
    for (const g of [glowCtx, persistCtx, scratchCtx, swapCtx]) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 1;
      g.clearRect(0, 0, LW, LH);
    }
    fadeKeep = 1;
    camHas = false;
  }
  // The world transform, on a layer context. Identical to render()'s own —
  // scale, the letterbox offset, then the camera — with the half-resolution
  // factor folded in, so everything below draws in WORLD units and a line
  // width means the same thing here as it does in the flat pass.
  function worldXf(g, vc) {
    g.setTransform(scale * HALF, 0, 0, scale * HALF, ox * HALF, oy * HALF);
    const c = vc || cam; // the PRESENTED camera at draw time; the tick camera
    g.translate(-c.x, -c.y); // at advance time, where the persist buffer registers
  }

  // ---- advance: the only mutating call ------------------------------------
  // Hooked into frameBody() after the fixed-step while loop and before
  // render(), with the tick count that loop just ran. Never inside render():
  // render() has sixteen call sites (the resize listener, the dev sliders, the
  // pause repaints, every suite's direct call), and advancing there would
  // double-step the fade on a paused slider drag.
  function advance(n) {
    if (!ON) return;
    ensureLayers();
    const frames = Math.max(1, n | 0);
    fxTick += frames;
    stepFlashes(frames);
    stepParticles(frames);
    // the frame layer's verdicts for every tick since the last advance, taken
    // ONCE and shared: the wake and the phosphor must agree about what was
    // cut, and the latch clears when it is read
    const jump = takeCuts();
    writeRings();
    advancePersist(frames, jump);
  }

  function stepFlashes(frames) {
    for (let i = flashes.length - 1; i >= 0; i--) {
      flashes[i].age += frames;
      if (flashes[i].age >= flashes[i].life) flashes.splice(i, 1);
    }
  }

  // Scroll, fade, stamp — in that order, once per advance.
  //
  // SCREEN-SPACE PERSIST, and why. The handoff offered a world-space buffer at
  // reduced density as the default. That arithmetic assumed one world unit per
  // buffer pixel, but this game's view is FW×FH = 512×342 of a 3072×3762 world
  // drawn at scale ~3, so a buffer at 0.40 linear density would put one texel
  // every ~7.6 SCREEN pixels — a four-pixel trail would alias away entirely.
  // Matching screen resolution in world space needs ~104 Mpx. So the buffer
  // lives in screen space and is re-registered to the camera each advance
  // instead, and it is dropped whole on any discontinuity.
  function advancePersist(frames, jump) {
    const dx = camHas ? (cam.x - camPX) * scale * HALF : 0;
    const dy = camHas ? (cam.y - camPY) * scale * HALF : 0;
    if (!camHas || scale !== lastScale ||
        Math.abs(dx) >= LW || Math.abs(dy) >= LH || jump) {
      // no continuous registration to keep — a teleport, a restart, a net snap
      // or a re-fit. Smearing the old ink across the new frame would be a lie.
      persistCtx.setTransform(1, 0, 0, 1, 0, 0);
      persistCtx.globalCompositeOperation = "source-over";
      persistCtx.globalAlpha = 1;
      persistCtx.clearRect(0, 0, LW, LH);
      fadeKeep = 1;
    } else if (dx || dy) {
      // "copy" moves the whole surface and clears what scrolls in, in one pass;
      // a canvas cannot be its own drawImage source cleanly, hence the swap
      swapCtx.setTransform(1, 0, 0, 1, 0, 0);
      swapCtx.globalAlpha = 1;
      swapCtx.globalCompositeOperation = "copy";
      swapCtx.drawImage(persistC, -dx, -dy);
      swapCtx.globalCompositeOperation = "source-over";
      const c = persistC, g = persistCtx;
      persistC = swapC; persistCtx = swapCtx;
      swapC = c; swapCtx = g;
    }
    camPX = cam.x;
    camPY = cam.y;
    camHas = true;
    lastScale = scale;

    // this advance's persist ink, additive within the frame
    scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
    scratchCtx.globalCompositeOperation = "source-over";
    scratchCtx.globalAlpha = 1;
    scratchCtx.clearRect(0, 0, LW, LH);
    drawPersistInk(scratchCtx);

    persistCtx.setTransform(1, 0, 0, 1, 0, 0);
    persistCtx.globalCompositeOperation = "source-over";
    persistCtx.globalAlpha = 1;
    if (PERSIST > 0) {
      // Two traps, both invisible until measured. (1) The fade is scaled to SIM
      // FRAMES ADVANCED, never to rAF, or the tail length follows the display's
      // refresh rate. (2) A small per-frame destination-out STALLS in 8-bit: a
      // premultiplied byte stops decaying once b*fade rounds below 0.5, leaving
      // a permanent neutral ghost floor at ~0.5/fade. So the debt accumulates
      // and is flushed only in chunks of 0.25 or more, which pushes that floor
      // down to ~1-2 and below visibility.
      fadeKeep *= Math.pow(1 - PERSIST, frames);
      const due = 1 - fadeKeep;
      if (due >= 0.25) {
        persistCtx.globalCompositeOperation = "destination-out";
        persistCtx.globalAlpha = Math.min(1, due);
        persistCtx.fillStyle = "#000";
        persistCtx.fillRect(0, 0, LW, LH);
        persistCtx.globalCompositeOperation = "source-over";
        persistCtx.globalAlpha = 1;
        fadeKeep = 1;
      }
    } else {
      persistCtx.clearRect(0, 0, LW, LH);
      fadeKeep = 1;
    }
    // "lighten" is per-channel MAX, not addition: a pixel repainted every frame
    // holds the brightness it was designed with instead of integrating toward a
    // clipped white plateau, while a vacated one decays at the persist rate.
    // That difference is the whole phosphor look; "lighter" here regresses it
    // to an achromatic smear.
    persistCtx.globalCompositeOperation = "lighten";
    persistCtx.drawImage(scratchC, 0, 0);
    persistCtx.globalCompositeOperation = "source-over";
  }

  // Did any seat fail to FLY where it now is, on any tick since the last
  // advance? The frame layer answered that per TICK and latched it; this takes
  // every latch, keeps the per-seat answers for the wake, and reports whether
  // any of them fired for the phosphor. Net snaps move a ship with no event at
  // all, which is why the answer comes from a displacement test at all rather
  // than from a hook in js/net.js.
  function takeCuts() {
    let jump = false;
    for (const P of players) {
      const c = presTakeCut(P.id);
      cuts[P.id] = c;
      if (c) jump = true;
    }
    return jump;
  }

  // ---- the cosmetic pose rings --------------------------------------------
  // ONE entry per advance, not one per tick: the intermediate poses of a
  // catch-up frame are gone by the time this runs, and writing the current pose
  // n times would stall the trail rather than lengthen it. A segment therefore
  // spans however far the ship flew between two rendered frames, which is what
  // a trail is: a polyline through recent positions, covering the same world
  // distance either way.
  //
  // The ring is CUT — not bent — wherever the presentation frame cut. A
  // respawn, a restart and a net snap all move a ship with no continuity to
  // draw, and a trail drawn across one is a line the ship never flew. The
  // verdict is the frame layer's, taken once per advance above.
  function writeRings() {
    for (const P0 of players) {
      let r = rings[P0.id];
      if (!r) r = rings[P0.id] = { x: new Float64Array(RING_N), y: new Float64Array(RING_N), n: 0 };
      if (r.n > 0 && cuts[P0.id]) r.n = 0; // the frame layer cut this seat, so
                                          // the wake cuts with it — one verdict,
                                          // both consumers, no second threshold
      r.x[r.n % RING_N] = P0.ship.x;
      r.y[r.n % RING_N] = P0.ship.y;
      r.n++;
    }
  }
  // `seat | 0` would fold a missing seat onto seat 0 and cut the LOCAL pilot's
  // track every time some other seat came back, so the id is checked rather
  // than coerced.
  function cutRing(seat) {
    if (!Number.isInteger(seat)) return;
    const r = rings[seat];
    if (r) r.n = 0;
  }

  // The persist layer's ONLY ink. The flashes and the shockwave rings are FRESH
  // material by design, because a speculative net cue that gets retracted must
  // cost one frame and never a lingering trail.
  //
  // Every particle is drawn from its own live position; the phosphor tail is
  // the persist buffer's job, not a per-particle history. A chip is a SQUARE
  // with a soft glow under it, so the debris reads as emissive rather than
  // matte; an ember is a slow drifting glow with a flicker off the layer's own
  // frame counter — never a wall clock.
  function drawPersistInk(g) {
    if (!P.length) return;
    g.save();
    worldXf(g);
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    for (const p of P) {
      const lf = 1 - p.age / p.life;
      // White-hot only at birth: an ageing particle shifts to its event hue so
      // the residue is COLORED light and never achromatic smoke. Sparks paint
      // most of their path young, so their white window is the narrower one.
      const whiteLf = p.k === 0 ? 0.85 : 0.65;
      const name = (p.col === "bright" && lf < whiteLf) ? (p.hue || "clay") : p.col;
      const pc = PAL[name] || PAL.clay;
      if (p.k === 1) {
        const s = p.size;
        const gr = p.size * 2.2;
        g.globalAlpha = 0.3 * lf;
        g.drawImage(sprite(PAL[p.hue] || pc), p.x - gr, p.y - gr, gr * 2, gr * 2);
        g.globalAlpha = 0.85 * lf;
        g.fillStyle = pc;
        g.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      } else if (p.k === 3) {
        const er = p.size * 2.6;
        g.globalAlpha = (0.3 + 0.2 * Math.sin(fxTick * 0.15 + p.ph)) * lf;
        g.drawImage(sprite(pc), p.x - er, p.y - er, er * 2, er * 2);
      } else {
        g.globalAlpha = 0.8 * lf;
        g.strokeStyle = pc;
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x - p.vx * 0.06, p.y - p.vy * 0.06); // velocity-stretched
        g.stroke();
      }
    }
    g.restore();
  }

  // Velocities are px per SECOND, so the step is per 1/60 s — and it SUBSTEPS
  // rather than taking one big dt. The drag is multiplicative, so n small steps
  // and one n-sized step are not the same curve: substepping is what makes a
  // five-tick catch-up frame land its particles exactly where a run of five
  // one-tick frames would have. That is this port's version of the playground's
  // fastForward, and it is exact rather than approximate.
  function stepParticles(frames) {
    if (!P.length) return;
    const dt = 1 / 60;
    const drag = 1 - 1.7 * dt;
    for (let s = 0; s < frames; s++) {
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        p.age += dt;
        if (p.age > p.life) { P.splice(i, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= drag;
        p.vy *= drag;
      }
    }
  }

  // ---- composite: the only drawing call, and it never mutates -------------
  // Hooked into render() after the last world-space draw and before the UI
  // pass, so the light sits under the HUD and inside the field clip — the
  // gutters never take a drop of it.
  function composite(view) {
    if (!ON) return;
    ensureLayers();
    const vc = (view && view.cam) || cam;
    // the phosphor registered to the camera the LAST ADVANCE saw; the flat pass
    // draws at the presented camera, so shift the screen-space buffer by the
    // sub-tick difference. Draw-time arithmetic only — nothing is written.
    const sx = camHas ? (vc.x - camPX) * scale * HALF : 0;
    const sy = camHas ? (vc.y - camPY) * scale * HALF : 0;
    glowCtx.setTransform(1, 0, 0, 1, 0, 0);
    glowCtx.globalCompositeOperation = "source-over";
    glowCtx.globalAlpha = 1;
    glowCtx.clearRect(0, 0, LW, LH);
    glowCtx.drawImage(persistC, -sx, -sy);
    drawFresh(glowCtx, view);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(glowC, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
    bloom2d(ctx, canvas.width, canvas.height);
    ctx.restore();
  }

  // ---- the fresh layer ----------------------------------------------------
  // Light AROUND a silhouette, never a lid on top of it: every halo is COLORED
  // and 2.5-3x the radius of the body that clips inside it, and the white-hot
  // core stays small enough to sit within the shape. The playground's judges
  // watched a ship rosette get erased by its own halo; these numbers are what
  // came out the other side of that.
  function drawFresh(g, view) {
    const gl = GLOW;
    const g1 = Math.min(1, gl);
    g.save();
    worldXf(g, view && view.cam);
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";

    const blob = (x, y, r, col, alpha) => {
      if (!(r > 0) || !(alpha > 0)) return;
      g.globalAlpha = Math.min(1, alpha);
      g.drawImage(sprite(col), x - r, y - r, r * 2, r * 2);
    };

    // ...and each seat in ITS OWN HULL'S colour. The note that stood here said
    // no per-seat hue existed in this repo and that inventing one was a
    // readability decision to make with the user rather than in this file. The
    // decision was made — D2 rules identity a value the PLAYER owns — and R4
    // wrote it down in js/game.js's HULLS, so this reads that table and invents
    // nothing. It is a HULL hue and not a SEAT hue: two pilots flying the same
    // ship glow the same colour, which is legal by the same ruling.
    //   It has to be the LIGHT and not only the plate. This layer composites
    // with `lighter`, and a sample of the box around each ship measured 0
    // surviving plate pixels on all three coloured hulls with the layer up
    // against 393-542 with it down: the bloom eats the flat colour whole. The
    // halo is the biggest mark on the screen, so it is where the colour keeps.
    //   DART's glow is C.clay — the warm burn every ship has always had — so a
    // build with nobody having picked anything paints exactly what it did
    // before, and this suite's sixty pixel legs never moved.
    const health = window.Encounter && Encounter.seatHealth;
    for (const P of players) {
      // a downed seat draws a WRECK, not a ship — the same answer drawShip
      // reads, from the same accessor, so the hull and its light agree
      const H = health ? Encounter.seatHealth(P.id) : null;
      if (H && H.hull <= 0) continue; // the HULL, not the countdown: a seat sitting
                                      // at rsp 0 with no hull — the claim window, and
                                      // an unseated seat after it — used to slip past
                                      // an rsp test and light a wreck
      const vp = (view && view.ships && view.ships[P.id]) || P.ship; // the FRAME pose drawShip gets
      // the comet halo is the big warm bloom source, sized off the ONE owner
      // the flat halo reads (game.js's cometView), so the light and the hull
      // can never disagree about how big the burn is or whether the authority
      // has confirmed it. The radius used to be a hard-coded 25 here against
      // the flat layer's COMETAOE — a stale copy of that constant, which is 11
      // today. Only the x1.5 survives, and it is not a second copy of the
      // halo's size: it is this layer's own stated law that light exceeds the
      // ink it surrounds.
      const cv = cometView(P.id);
      if (cv.phase === CP_LIVE) {
        blob(vp.x, vp.y, cv.r * 1.5, PAL.clay, 0.5 * g1);
        blob(vp.x, vp.y, SHIP_R + 4, PAL.bright, (0.22 + 0.5 * cv.flash) * g1);
      }
      // there was a CP_WIND branch here — a faint core swelling with the flare.
      // It went with the flat layer's windup ring at the owner's call: the ask
      // is answered by SOUND now (js/audio.js's `refuse` cue at the press edge,
      // and the engine's own ENG_BURN_WIND swell, which still reads cv.wind),
      // so the confirmed burn is the only thing on this screen that lights.
      const hue = typeof hullFor === "function" ? (hullFor(P.id).glow || PAL.clay) : PAL.clay;
      blob(vp.x, vp.y, SHIP_R * 2.8, hue, 0.4 * g1);
      blob(vp.x, vp.y, SHIP_R * 1.5, hue, 0.22 * g1);
      blob(vp.x, vp.y, Math.min(3, 2.2 * gl), PAL.bright, 0.5 * g1);
      // the engine flame's glow, off the same smoothed thrust the flat flame
      // draws from
      const fl = Math.hypot(P.flame.x, P.flame.y);
      if (fl > 0.001) {
        const a = Math.atan2(P.flame.y, P.flame.x);
        blob(vp.x - Math.cos(a) * (SHIP_R + 4), vp.y - Math.sin(a) * (SHIP_R + 4),
             8 * gl * Math.min(1, fl * 6), PAL.clay, 0.5 * g1);
      }
    }

    // bullets: a warm halo with a small hot core — off the frame's copies
    for (const b of (view && view.bullets) || G.bullets) {
      if (b.dead || b.spent) continue;
      blob(b.x, b.y, 7.5 * gl, PAL.clay, 0.5);
      blob(b.x, b.y, 3.2, PAL.bright, 0.7 * g1);
    }

    // the encounter's bodies, through the one accessor it publishes for this.
    // Read live every frame: restart() REPLACES E.enemies/E.missiles/E.orbs.
    // lights() hands back a REUSED buffer it refills per call, so it is iterated
    // here and never retained — holding the array across a frame would hand a
    // caller the next frame's bodies under the same reference.
    if (window.Encounter && Encounter.lights) {
      for (const L of Encounter.lights(view)) {
        const radar = L.t.lastIndexOf("radar", 0) === 0;
        if (L.t === "orb") {
          blob(L.x, L.y, 9 * gl, PAL.clay, 0.4);
          blob(L.x, L.y, 2.4, PAL.bright, 0.5 * g1);
        } else {
          blob(L.x, L.y, L.r * 2.6 * gl, radar ? PAL.radar : PAL.clay, 0.4);
        }
      }
    }

    // ---- trails, on FRESH and not on the phosphor ----------------------------
    // The playground put these on the persist layer, which is right under its
    // +-18 px drift and wrong here: this camera tracks a ship across a
    // 3072x3762 arena, so screen-space persist ink smears behind everything
    // that moves. A polyline recomputed each frame from the pose ring holds its
    // shape at any camera speed and costs tens of line segments.
    if (TRAILS > 0) {
      for (const P0 of players) {
        const H0 = health ? Encounter.seatHealth(P0.id) : null;
        if (H0 && H0.hull <= 0) continue; // a wreck is not flying anywhere — read off
                                          // the hull for the same reason the glow above is
        const r = rings[P0.id];
        if (!r || r.n < 2) continue;
        // the wake stretches on the CONFIRMED burn alone — through the same
        // owner the halo above reads. A windup is an ask, and a wake drawn for
        // an ask that the authority may still refuse is the same lie the solid
        // predicted halo used to tell.
        const comet = cometView(P0.id).phase === CP_LIVE;
        const span = Math.min(Math.min(r.n, RING_N) - 1,
          Math.round((14 + 40 * TRAILS) * (comet ? 1.7 : 1)));
        // THE HEAD IS THE HULL. The ring is written from the TICK pose
        // (writeRings reads P0.ship), the hull and its halo are drawn from the
        // PRESENTED pose — the two disagree by the sub-tick remainder, which is
        // a lead of v*alpha for the own predicted seat and a lag of
        // delta*(1-alpha) for an interpolated one. Read the newest vertex off
        // the frame view instead of the ring and the wake roots on the ship in
        // both directions, with no verdict re-derived here: the presented
        // instant SUPERSEDES the newest tick, it does not extend it, so the
        // vertex is replaced and never appended. At alpha 1 the frame pose IS
        // the tick pose and every vertex is the ring's own, byte for byte.
        const hp = (view && view.ships && view.ships[P0.id]) || P0.ship;
        const wx = (j) => (j === r.n - 1 ? hp.x : r.x[j % RING_N]);
        const wy = (j) => (j === r.n - 1 ? hp.y : r.y[j % RING_N]);
        for (let i = 0; i < span; i++) {
          const a = r.n - 1 - i, b = r.n - 2 - i;
          const ax = wx(a), ay = wy(a), bx = wx(b), by = wy(b);
          // A HOVERING ship writes the same pose every advance, and a
          // zero-length stroke under lineCap "round" is a filled disc, not
          // nothing: fifty-odd of them stacked additively on one point would
          // burn a bright blob through the hull the halo is meant to sit
          // around. A ship that did not move leaves no wake.
          if (ax === bx && ay === by) continue;
          const f = 1 - i / span;
          g.strokeStyle = PAL.clay;
          g.globalAlpha = 0.26 * TRAILS * f * f * (comet ? 1.5 : 1);
          g.lineWidth = Math.max(0.5, 4.2 * f * (comet ? 1.5 : 1));
          g.beginPath();
          g.moveTo(ax, ay);
          g.lineTo(bx, by);
          g.stroke();
          g.strokeStyle = PAL.bright; // the white core is the narrower, shorter half
          g.globalAlpha = 0.14 * TRAILS * f * f * f;
          g.lineWidth = Math.max(0.4, 1.7 * f);
          g.beginPath();
          g.moveTo(ax, ay);
          g.lineTo(bx, by);
          g.stroke();
        }
      }
      // bullet streaks — warm line and white core BOTH fresh. The playground
      // persisted the warm half; here a round travels the screen and the smear
      // would follow it. Length comes off the round's own per-tick velocity, so
      // it is unit-free and follows every speed upgrade for nothing.
      //
      // ...CLAMPED to the distance the round has actually flown. K is a count of
      // TICKS (3.24 of them, 48.6 world px at BSPEED 15), and a round one tick
      // old has covered 15 of those px: the other 33 hung out the far side of
      // the muzzle, through and behind the ship that fired it. That is what the
      // owner saw and called bad, and it reads worst in ?mp, where an own shot
      // flies as a speculative TRACER that starts life at the ship's own pose.
      // A tail longer than the flight is a tail drawn where the round never was.
      const K = 2.4 * (0.35 + TRAILS);
      // `flown` is the world distance from the round's origin, or a NEGATIVE
      // number for a round that has none — unknown keeps the full length, which
      // is exactly what shipped before the clamp, so a synthetic round in a
      // suite is drawn as it always was. This layer is the only forgiving
      // reader: the flat pass's tracer glow spells tr.ox/tr.oy straight into an
      // arc (js/game.js drawTracers) and would throw NaN at a cue without one.
      // Straight-line DISPLACEMENT, not path length — a round that folds must
      // re-stamp its origin at the fold, which is what the BOUNCE branch of the
      // bullet integrator does.
      const streak = (x, y, dx, dy, flown) => {
        if (!dx && !dy) return;
        const k = flown >= 0 ? Math.min(K, flown / Math.hypot(dx, dy)) : K;
        if (!(k > 0)) return; // a round still sitting on its own muzzle: the
                              // halo is its whole ink until it has moved
        g.strokeStyle = PAL.clay;
        g.globalAlpha = 0.2 * TRAILS;
        g.lineWidth = 3.4;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - dx * k, y - dy * k);
        g.stroke();
        g.strokeStyle = PAL.bright;
        g.globalAlpha = 0.5 * TRAILS;
        g.lineWidth = 1.7;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - dx * k * 0.7, y - dy * k * 0.7);
        g.stroke();
      };
      // the origin is READ, never kept: a frame copy carries ox/oy through
      // Object.assign untouched, and a round without them is drawn exactly as
      // it was before this clamp existed.
      const flownFrom = (o) => (typeof o.ox === "number" && typeof o.oy === "number"
        ? Math.hypot(o.x - o.ox, o.y - o.oy) : -1);
      for (const b of (view && view.bullets) || G.bullets) {
        if (b.dead || b.spent) continue;
        // the round's OWN per-tick velocity, never (x - px): on a frame copy x
        // is the interpolated pose and px the last tick's, so the difference is
        // alpha-scaled and the streak would pulse from nothing to full length
        // once per tick. vx/vy is the same vector at alpha 1 and constant under it.
        streak(b.x, b.y, b.vx || 0, b.vy || 0, flownFrom(b));
      }
      // ...and the SPECULATIVE rounds, which is why every one of these is fresh.
      // A tracer can be matched, expire, be retracted mid-flight, or vanish in a
      // silent bulk clear that runs in the WebSocket handler between two draws.
      // So: re-read the live array every frame, retain nothing keyed to it, and
      // let a retracted cue cost exactly one frame. Net.tracers exists only on
      // the net-mode namespace — the same guard render() uses at its own call.
      if (window.Net && Net.active() && Net.tracers) {
        for (const tr of Net.tracers()) {
          blob(tr.x, tr.y, 7 * gl, PAL.clay, 0.35);
          blob(tr.x, tr.y, 2.8, PAL.bright, 0.45 * g1);
          // a tracer has carried its muzzle since the cue was written — the flat
          // pass draws its two-frame glow there (js/game.js drawTracers). It is
          // in the RAW predicted frame, where the authoritative round also lives
          // and the drawn hull does not, so the clamp is against the shot's own
          // origin and never against the ship: anchoring this ink to the hull is
          // what would break the hand-off.
          streak(tr.x, tr.y, tr.vx || 0, tr.vy || 0, flownFrom(tr));
        }
      }
    }

    // explosion flashes: a small white core inside a much wider COLORED ball,
    // re-derived from (age) alone so a repeated render paints the same pixels
    for (const F of flashes) {
      if (F.flash > 0 && F.age < 9) {
        const hue = PAL[F.hue] || PAL.clay;
        const ff = 1 - F.age / 9;
        blob(F.x, F.y, (F.big ? 26 : 14) * (0.4 + 0.6 * (1 - ff)) * Math.min(1.4, gl + 0.4),
             PAL.bright, 0.8 * ff * F.flash);
        blob(F.x, F.y, (F.big ? 48 : 26) * (0.5 + 0.5 * (1 - ff)), hue, 0.5 * ff * F.flash);
        blob(F.x, F.y, (F.big ? 85 : 44) * (0.6 + 0.4 * (1 - ff)), hue, 0.35 * ff * F.flash);
      }
    }
    // ...and one crisp expanding ring each, on FRESH so there is never a
    // persisted ladder of them
    for (const F of flashes) {
      if (!(F.ring > 0) || F.age >= F.life) continue;
      const rf = F.age / F.life;
      g.globalAlpha = (1 - rf) * 0.5 * F.ring;
      g.strokeStyle = PAL[F.hue] || PAL.clay;
      g.lineWidth = (F.big ? 3 : 2) * (1 - rf) + 0.5;
      g.beginPath();
      g.arc(F.x, F.y, (F.big ? 3.1 : 2.2) * F.age + 3, 0, TAU);
      g.stroke();
    }

    g.restore();
  }

  // ---- the cue bus --------------------------------------------------------
  // A SECOND consumer of the event stream the audio layer already drains — no
  // new sim events, no change to the event shape, nothing written back onto a
  // sim object. Fed from BOTH presentation-side drains: game.js's drainCues()
  // in local play and js/net.js's fireEvents() on a net client, because in net
  // mode the local sim never steps and a consumer wired only into the first
  // would be dead in multiplayer.
  function cue(ev) {
    if (!ON || !ev) return;
    // The RESTART MARKER, and it is handled before the position guard because
    // it carries no position. On a NET client it is the only signal this layer
    // gets that the authority cut the run: the client never calls its own
    // Encounter.restart(), so resetImpactFx() — and the FX.reset() chained to
    // it — never fires there. Without this, a server-ordered cut left live
    // flashes, particles and phosphor burning at their pre-cut world positions
    // for the best part of a second.
    if (ev.kind === "restart") { reset(); return; }
    if (!ev.at) return; // the local drain has no null-position guard of its
                        // own — a throw here fails every suite that loads
                        // the page
    const K = KINDS[ev.kind];
    if (!K) return; // an unmapped kind draws nothing, telegraphs included
    cueCount = (cueCount + 1) >>> 0;
    const x = ev.at.x, y = ev.at.y;
    // the seeding idiom for id-less events, straight off spawnImpactFx: the
    // rounded position, this layer's own monotonic count, and a fixed salt
    const seed = hash32(Math.round(x), Math.round(y), cueCount, FX_SALT);
    if (K.flash > 0 || K.ring > 0) {
      if (flashes.length >= FLASH_MAX) flashes.shift();
      flashes.push({ x, y, hue: K.hue, big: !!K.big, age: 0,
                     life: K.big ? 55 : 34, flash: K.flash, ring: K.ring });
    }
    if (K.parts > 0) spawnBurst(x, y, K, seed);
    // a returning seat starts a new track: the ring is cut HERE rather than
    // waiting for the teleport test, because a respawn is announced and a
    // guessed threshold is not the right instrument for an announced cut
    if (ev.kind === "respawn") cutRing(ev.seat);
  }

  // The pooled emitter, on the cue bus. Reseeded per cue from the event's own
  // hash — no id crosses the wire, so the seed is (rounded position, this
  // layer's cue count, a fixed salt), the same construction spawnImpactFx uses.
  // The pool is capped and the oldest goes first, exactly as FX_MAX evicts.
  function spawnBurst(x, y, K, seed) {
    fseed(seed);
    const mul = PARTICLES * K.parts * (K.big ? 2.6 : 1);
    if (!(mul > 0)) return;
    const push = (p) => {
      if (P.length >= PART_MAX) P.shift();
      P.push(p);
    };
    const nSpark = Math.round(22 * mul);
    for (let i = 0; i < nSpark; i++) {
      const a = frr(0, TAU);
      const sp = frr(40, K.big ? 260 : 180);
      push({ k: 0, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
             age: 0, life: frr(0.25, K.big ? 1.0 : 0.7) * frr(0.8, 1.3),
             col: frnd() < 0.6 ? K.hue : "bright", hue: K.hue });
    }
    const nChip = Math.round(13 * mul);
    for (let i = 0; i < nChip; i++) {
      const a = frr(0, TAU);
      const sp = frr(18, K.big ? 130 : 90);
      push({ k: 1, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
             age: 0, life: frr(0.5, K.big ? 1.5 : 1.15) * frr(0.85, 1.3),
             size: frr(1.2, 3.4),
             col: frnd() < 0.55 ? K.hue : "bright", hue: K.hue }); // emissive
    }                                                             // voxels only
    // Embers are the richness, not the brightness: slow long-lived drifting
    // glows that only come in above 1.05, so the full look reads LUSHER than a
    // thinner one rather than merely louder.
    const dens = PARTICLES * K.parts;
    if (dens > 1.05) {
      const nEmber = Math.round((K.big ? 14 : 6) * (dens - 1));
      for (let i = 0; i < nEmber; i++) {
        const a = frr(0, TAU);
        const sp = frr(6, 80);
        push({ k: 3, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
               age: 0, life: frr(1.2, K.big ? 2.6 : 1.8),
               size: frr(1.4, 2.8), ph: frr(0, TAU),
               col: frnd() < 0.75 ? K.hue : "bright", hue: K.hue });
      }
    }
  }

  // ---- the cheap 2d bloom -------------------------------------------------
  // Two downsampled, blurred copies of the GLOW layer only, added back with
  // "lighter". Sourcing from the glow layer rather than the screen is what
  // keeps the flat pass crisp: the base ink never blooms into mush, so every
  // silhouette and every telegraph survives at any intensity.
  //
  // The radii are scaled by the glow surface's own resolution, so the bloom
  // covers the same number of SCREEN pixels the playground judged at full
  // resolution — halving the surface must make the layer cheaper, not wider.
  let halfC = null, halfG = null, quartC = null, quartG = null, eighthC = null, eighthG = null;
  let filterOK = null, lastRad = null, filt1 = "", filt2 = "";
  function filterSupported() {
    if (filterOK !== null) return filterOK;
    const g = document.createElement("canvas").getContext("2d");
    g.filter = "blur(1px)";
    filterOK = g.filter !== "none";
    return filterOK;
  }
  function bloom2d(screenCtx, dw, dh) {
    if (!(BLOOM_INT > 0) || !glowC || !LW || !LH) return;
    const hw = Math.max(1, LW >> 1), hh = Math.max(1, LH >> 1);
    const qw = Math.max(1, LW >> 2), qh = Math.max(1, LH >> 2);
    const ew = Math.max(1, LW >> 3), eh = Math.max(1, LH >> 3);
    if (!halfC) {
      halfC = document.createElement("canvas"); halfG = halfC.getContext("2d");
      quartC = document.createElement("canvas"); quartG = quartC.getContext("2d");
      eighthC = document.createElement("canvas"); eighthG = eighthC.getContext("2d");
    }
    if (halfC.width !== hw || halfC.height !== hh) { halfC.width = hw; halfC.height = hh; }
    if (quartC.width !== qw || quartC.height !== qh) { quartC.width = qw; quartC.height = qh; }
    if (eighthC.width !== ew || eighthC.height !== eh) { eighthC.width = ew; eighthC.height = eh; }
    if (BLOOM_RAD !== lastRad) { // the filter strings are memoized: building one
      lastRad = BLOOM_RAD;       // per frame is a string allocation per frame
      filt1 = "blur(" + ((1 + BLOOM_RAD * 1.6) * HALF).toFixed(2) + "px)";
      filt2 = "blur(" + ((1.5 + BLOOM_RAD * 2.4) * HALF).toFixed(2) + "px)";
    }
    halfG.setTransform(1, 0, 0, 1, 0, 0);
    quartG.setTransform(1, 0, 0, 1, 0, 0);
    halfG.clearRect(0, 0, hw, hh);
    quartG.clearRect(0, 0, qw, qh);
    if (filterSupported()) {
      halfG.filter = filt1;
      halfG.drawImage(glowC, 0, 0, hw, hh);
      halfG.filter = "none";
      quartG.filter = filt2;
      quartG.drawImage(halfC, 0, 0, qw, qh);
      quartG.filter = "none";
    } else {
      // REPEATED HALVING, and it is a rewrite rather than a port. The
      // playground's fallback ended by stamping an UNBLURRED half-res copy of
      // the source back over its own work, so a browser without ctx.filter got
      // a sharp double-exposure instead of a bloom. Here each step is exactly
      // one 2x halving — bilinear resampling averaging 2x2 — and the taps are
      // built by UPSCALING the small buffers back, never by re-reading the
      // source.
      eighthG.setTransform(1, 0, 0, 1, 0, 0);
      eighthG.clearRect(0, 0, ew, eh);
      halfG.drawImage(glowC, 0, 0, hw, hh);                      // 1 halving
      quartG.drawImage(halfC, 0, 0, qw, qh);                     // 2
      eighthG.drawImage(quartC, 0, 0, ew, eh);                   // 3
      halfG.clearRect(0, 0, hw, hh);
      halfG.drawImage(quartC, 0, 0, qw, qh, 0, 0, hw, hh);       // near tap
      quartG.clearRect(0, 0, qw, qh);
      quartG.drawImage(eighthC, 0, 0, ew, eh, 0, 0, qw, qh);     // wide tap
    }
    screenCtx.save();
    screenCtx.globalCompositeOperation = "lighter";
    screenCtx.imageSmoothingEnabled = true;
    screenCtx.globalAlpha = Math.min(1, 0.28 * BLOOM_INT);
    screenCtx.drawImage(halfC, 0, 0, dw, dh);
    screenCtx.globalAlpha = Math.min(1, 0.42 * BLOOM_INT);
    screenCtx.drawImage(quartC, 0, 0, dw, dh);
    screenCtx.restore();
  }

  // ---- the nebula ---------------------------------------------------------
  // The ONE effect in this file that touches BASE ink: it draws into #field
  // itself, behind the starfield, rather than onto the light layer. Everything
  // else here only ever adds light on its own surface.
  //
  // It is allowed to, because it is a pure function of state. The constraint
  // the pixel probes impose is not "do not touch the base" but "be
  // deterministic per state" — no Date.now, no Math.random, no wall-clock
  // animation in the draw path — and a seed-baked field with camera-driven
  // parallax satisfies it exactly. Two renders of one state paint the same
  // bytes.
  //
  // THE ONE SANCTIONED IMPURITY IN A DRAW PATH is the cache fill below. The
  // reseed button rerolls SEED and then only calls render(), with no advance in
  // between, so the bake has to be reachable from here. The cache is keyed by
  // seed and holds a pure function of it, so a repeated render of one state is
  // still byte-identical — which is the property the probes actually depend on.
  const NEB_W = 224, NEB_H = 150;
  const NEB_PARALLAX = 0.1;
  const nebCache = new Map(); // seed -> canvas, FIFO capped at 4
  function nebHash(ix, iy, s) {
    let a = (Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(s, 2246822519)) | 0;
    a = Math.imul(a ^ (a >>> 16), 2246822507);
    a = Math.imul(a ^ (a >>> 13), 3266489909);
    return ((a ^ (a >>> 16)) >>> 0) / 4294967296;
  }
  function nebNoise(x, y, cell, s) {
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
    let fx = x / cell - gx, fy = y / cell - gy;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const v00 = nebHash(gx, gy, s), v10 = nebHash(gx + 1, gy, s);
    const v01 = nebHash(gx, gy + 1, s), v11 = nebHash(gx + 1, gy + 1, s);
    return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
  }
  function bakeNebula(seed) {
    const c = mkCanvas(NEB_W, NEB_H);
    const g = c.getContext("2d");
    const img = g.createImageData(NEB_W, NEB_H);
    const d = img.data;
    // two octaves, a knee that keeps most of the field dark, and a baked corner
    // vignette — the corner darkening a shot of this shows is the nebula's own,
    // not a post pass
    const field = (x, y, s) => nebNoise(x, y, 46, s) * 0.65 + nebNoise(x, y, 21, s + 7) * 0.35;
    const shape = (v) => { const u = Math.max(0, v - 0.52) / 0.48; return u * u; };
    const clay = hexRgb(PAL.clay), cyan = hexRgb(PAL.radar);
    const sA = (seed >>> 0) || 1, sB = ((seed >>> 0) ^ 0x9e3779b9) || 2;
    for (let y = 0; y < NEB_H; y++) {
      for (let x = 0; x < NEB_W; x++) {
        const nA = shape(field(x, y, sA));
        const nB = shape(field(x + 1000, y + 500, sB));
        const dx = (x / NEB_W - 0.5) * 2, dy = (y / NEB_H - 0.5) * 2;
        const vig = 1 - 0.55 * Math.min(1, dx * dx * 0.7 + dy * dy * 0.7);
        const o = (y * NEB_W + x) * 4;
        d[o] = Math.min(255, (5 + clay[0] * nA * 0.38 + cyan[0] * nB * 0.16) * vig);
        d[o + 1] = Math.min(255, (7 + clay[1] * nA * 0.30 + cyan[1] * nB * 0.24) * vig);
        d[o + 2] = Math.min(255, (12 + clay[2] * nA * 0.26 + cyan[2] * nB * 0.26) * vig);
        d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  // Called from render() between the field ground and the starfield, under the
  // letterbox transform with NO camera — field coordinates, 0..FW by 0..FH.
  // The drawn rect is oversized by exactly the parallax drift, so the sheet
  // covers the viewport at every camera position and no edge can ever show.
  function nebula(vc) {
    if (!ON || !(NEBULA > 0)) return;
    const c = vc || cam; // the presented camera, like the starfield above it
    const key = SEED >>> 0;
    let baked = nebCache.get(key);
    if (!baked) {
      baked = bakeNebula(key);
      nebCache.set(key, baked);
      while (nebCache.size > 4) nebCache.delete(nebCache.keys().next().value);
    }
    const dx = (WW - FW) * NEB_PARALLAX, dy = (WH - FH) * NEB_PARALLAX;
    ctx.save();
    ctx.globalAlpha = Math.min(1, NEBULA);
    ctx.drawImage(baked, -c.x * NEB_PARALLAX, -c.y * NEB_PARALLAX, FW + dx, FH + dy);
    ctx.restore();
  }
  function setNebula(v) { NEBULA = Math.max(0, +v || 0); }
  // ...and the bloom gets one too, for the same reason the nebula does: it is a
  // WIDE effect, so a check that means to measure it has to be able to take it
  // down and leave the rest of the layer standing. Without the lever the only
  // available comparison is the whole layer against nothing, and that passes on
  // whatever else the layer happens to be drawing — which is exactly how the
  // first version of this suite's bloom leg passed on the nebula instead.
  function setBloom(v) { BLOOM_INT = Math.max(0, +v || 0); }

  // ---- lifecycle ----------------------------------------------------------
  function reset() {
    P.length = 0;
    rings.length = 0;
    flashes.length = 0;
    cuts.length = 0; // the verdicts owed to a wake that no longer exists
    cueCount = 0;
    fxTick = 0;
    fseed(1);
    clearLayers();
  }
  function resize() {
    ensureLayers();
    clearLayers();
  }
  function setOn(v) {
    ON = !!v;
    if (!ON) clearLayers();
  }
  // Plain counters for the fx suite — never an internal by reference.
  function snapshot() {
    return { on: ON, cues: cueCount, tick: fxTick,
             flashes: flashes.length, parts: P.length,
             ring: rings[0] ? Math.min(rings[0].n, RING_N) : 0,
             bloom: BLOOM_INT > 0 ? (filterSupported() ? "filter" : "halving") : "off",
             nebula: NEBULA, baked: nebCache.size, bloomInt: BLOOM_INT,
             layers: !!glowC, w: LW, h: LH, fade: fadeKeep, cam: camHas };
  }

  window.FX = { on: () => ON, setOn, cue, advance, composite, resize, reset,
                nebula, setNebula, setBloom, snapshot };
})();
