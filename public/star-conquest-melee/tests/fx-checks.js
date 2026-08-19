"use strict";

// The LIGHT LAYER's own suite — js/fx.js, hooked into the real frame.
//
// Six claims, and every one of them is a pixel claim read off the real #field
// canvas, because every one of them is about ink:
//
//   1. FLAG INERTNESS — with the flag off, the frame is byte-identical to
//      js/fx.js not being loaded at all. This is the contract the whole port
//      rests on: the flat look stays reachable, and every OTHER suite can
//      stand the layer down through __test.setFx and get the old frame back.
//   2. NON-VACUITY — and, in the same breath, that the layer is not a scrim.
//      A suppression lever that suppressed a full-field wash would make every
//      screen-vs-screen diff in this repository pass for free, so the flag is
//      proved twice: light DOES land just outside a hull, and does NOT land
//      far from one.
//   3. COMPOSITE PURITY — composite() draws and never mutates, so two renders
//      of one state paint identical bytes. This is the same invariant the
//      wave1 pixel sections rely on, restated for the layer that now sits
//      between the world pass and the HUD.
//   4. ADVANCE IS THE ONLY CLOCK — the shockwave ring moves when the SIM
//      advances and at no other time. render() has sixteen call sites; a
//      layer that aged inside one of them would drift under a paused slider
//      drag.
//   5. RESET DISCIPLINE — resetImpactFx()'s chain reaches this layer too, so
//      a restart is fx-clean and the probe setups that stage a quiet state
//      really get one.
//   6. DETERMINISM — the same staged cues over the same tick count replay to
//      the same pixels. No Date.now, no Math.random, no wall clock.
//
// The suite drives FX.advance directly rather than through the frame loop: the
// claim under test is the LAYER's clock, and threading it through a synthetic
// rAF would only add the sim's own motion to every probe. It restores the fx
// flag, the panels, the corner map, the edge arrows, the session flags and
// both staged ships, then resets the encounter and repaints.
window.runFxChecks = function () {
  const t = window.__test;
  const enc = t.enc;
  const R = [];
  const ok = (name, cond, info) => R.push({ name, pass: !!cond, info: info === undefined ? "" : String(info) });
  const canvasEl = document.getElementById("field");

  if (!window.FX) {
    ok("js/fx.js is loaded", false, "window.FX is absent — index.html never registered the layer");
    return { total: R.length, passed: 0, failed: R, results: R };
  }
  const FX = window.FX;

  // ---- what this suite touches, and puts back ----
  const priorOn = FX.snapshot().on;
  const priorPanels = t.panelsOn();
  const priorMap = t.minimapInfo().on;
  const priorArrows = t.edgeArrowsOn();
  const priorRunning = t.G.running;
  const priorStarted = t.G.started;
  const priorFxInt = t.fxState().FXINT;
  const priorSeats = t.players.map((P) => ({ x: P.ship.x, y: P.ship.y }));

  t.setPanels(false);   // the gutters are outside the field clip; standing them
  t.setMinimap(false);  // down keeps the readbacks about the layer alone
  t.setEdgeArrows(false);
  t.G.started = true;   // the first-run card owns the idle field otherwise
  t.G.running = false;  // no aim triangle; the pause copy is identical in every
                        // comparison below, so it cannot decide one either way

  // ---- the readbacks ----
  const c2d = canvasEl.getContext("2d"); // the game's own context
  const f0 = t.fieldToCanvas(0, 0);
  const fk = t.fieldToCanvas(1, 0).x - f0.x; // canvas px per field px
  // the whole FIELD rect, in backing-store pixels
  const rect = () => {
    const a = t.fieldToCanvas(0, 0), b = t.fieldToCanvas(t.FW, t.FH);
    const x0 = Math.max(0, Math.floor(a.x)), y0 = Math.max(0, Math.floor(a.y));
    const x1 = Math.min(canvasEl.width, Math.ceil(b.x));
    const y1 = Math.min(canvasEl.height, Math.ceil(b.y));
    return { x0, y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  };
  // a full-field readback folded to one string: the field rect is a megabyte of
  // bytes and every check below only ever asks whether two of them agree
  const fieldKey = () => {
    const r = rect();
    const d = c2d.getImageData(r.x0, r.y0, r.w, r.h).data;
    let h1 = 0x811c9dc5, h2 = 0x1000193;
    for (let i = 0; i < d.length; i++) {
      h1 = Math.imul(h1 ^ d[i], 0x01000193) >>> 0;
      if ((i & 3) === 0) h2 = Math.imul(h2 + d[i] + i, 0x85ebca6b) >>> 0;
    }
    return h1.toString(16) + ":" + h2.toString(16) + ":" + d.length;
  };
  // ...and a small patch of real pixels around a WORLD point, the same 1:1
  // blit idiom the wave1 sections use
  const pad = document.createElement("canvas");
  const padCtx = pad.getContext("2d", { willReadFrequently: true });
  const HALF = Math.max(3, Math.ceil(fk * 2.5));
  pad.width = pad.height = HALF * 2;
  const patch = (wx, wy) => {
    const p = t.fieldToCanvas(wx - t.cam.x, wy - t.cam.y);
    padCtx.clearRect(0, 0, HALF * 2, HALF * 2);
    padCtx.drawImage(canvasEl, Math.round(p.x) - HALF, Math.round(p.y) - HALF,
      HALF * 2, HALF * 2, 0, 0, HALF * 2, HALF * 2);
    return JSON.stringify(Array.from(padCtx.getImageData(0, 0, HALF * 2, HALF * 2).data));
  };

  // ---- staging: one ship, parked at a canvas point derived from the LIVE
  // letterbox transform. A hand-picked field coordinate lands off the runner's
  // cropped canvas and every probe below then reads the same nothing.
  const atCanvas = (cx, cy) => ({ x: (cx - f0.x) / fk + t.cam.x, y: (cy - f0.y) / fk + t.cam.y });
  const quiet = () => {
    enc.reset();                 // idle: encDraw returns early, no bursts live
    t.setFxInt(priorFxInt);
    const S = atCanvas(canvasEl.width * 0.30, canvasEl.height * 0.55);
    for (const P of t.players) {
      P.ship.x = S.x; P.ship.y = S.y;
      P.vel.x = 0; P.vel.y = 0; P.comet = false;
      P.flame.x = 0; P.flame.y = 0; // drawFlame is the one draw in the game that
                                    // spends Math.random(); a live flame makes
                                    // every determinism leg below vacuous
    }
    return S;
  };

  const SHIP = quiet();
  // just outside the hull, where the flat pass paints nothing and the halo
  // does; and far enough out that NOTHING should reach it
  const NEAR = { x: SHIP.x + 16, y: SHIP.y };
  const FAR = { x: SHIP.x + 110, y: SHIP.y };

  // ---- 1. the flag is inert -------------------------------------------------
  FX.setOn(false);
  t.render();
  const offKey = fieldKey();
  const held = window.FX;
  delete window.FX;      // every hook in the game guards on this exact read
  t.render();
  const absentKey = fieldKey();
  window.FX = held;
  ok("the flag off is byte-identical to js/fx.js being absent", offKey === absentKey,
    "off=" + offKey + " absent=" + absentKey);

  // ---- 2. ...and on, it is neither vacuous nor a scrim ----------------------
  // The scrim leg is the one that keeps every OTHER suite's suppression lever
  // honest: a layer that washed the whole field would make screen-vs-screen
  // diffs pass for free. It is measured with the NEBULA down, because the
  // nebula IS a full-field wash and a deliberate one — it is base ink, drawn
  // behind the starfield, and it is not what this leg is about.
  const priorNeb = FX.snapshot().nebula;
  FX.setNebula(0);
  t.render();
  const offNear = patch(NEAR.x, NEAR.y);
  const offFar = patch(FAR.x, FAR.y);
  FX.setOn(true);
  t.render();
  const onNear = patch(NEAR.x, NEAR.y);
  const onFar = patch(FAR.x, FAR.y);
  ok("light lands just outside a hull, where the flat pass paints nothing",
    onNear !== offNear);
  ok("...and does not reach far from one — the layer is light, not a scrim",
    onFar === offFar);
  FX.setNebula(priorNeb);
  t.render();
  const onKey = fieldKey();
  ok("the layer changes the frame at all", onKey !== offKey);

  // ---- 2c. the nebula: base ink, and deterministic per state ---------------
  // The only effect here that draws into #field itself. The constraint is not
  // "do not touch the base" — it is "be a pure function of state", which is
  // what lets the differential pixel suites tolerate it at all.
  FX.setNebula(0);
  t.render();
  const nebOff = fieldKey();
  FX.setNebula(priorNeb);
  t.render();
  const nebOn = fieldKey();
  t.render();
  ok("the nebula paints a backdrop", nebOn !== nebOff && priorNeb > 0,
    "nebula=" + priorNeb);
  ok("...and repeats it byte-for-byte", fieldKey() === nebOn);
  ok("...off ONE bake, cached per seed", FX.snapshot().baked === 1,
    "baked=" + FX.snapshot().baked);

  // ---- 2b. the bloom carries light past the sprites' own reach --------------
  // The widest halo any sprite draws is 2.8 x SHIP_R = 19.6 field px, and in a
  // quiet frame nothing else is lit: no flash lives, the ring holds one entry
  // so there is no track, and the phosphor is empty. So ink beyond that radius
  // can only have come from the bloom — which is the whole point of sourcing it
  // from the GLOW layer alone: the light spreads and the flat ink does not.
  //
  // MEASURED THROUGH THE BLOOM'S OWN LEVER, with the rest of the layer left
  // standing. The first version of this leg compared the whole layer against
  // nothing with the nebula up, and passed on the NEBULA — a mutation that made
  // bloom2d return immediately did not move it. A wide effect needs a lever of
  // its own or the comparison measures whatever else happens to be drawing.
  const priorBloom = FX.snapshot().bloomInt;
  const BEYOND = { x: SHIP.x + 27, y: SHIP.y };
  FX.setNebula(0);
  FX.setBloom(0);
  t.render();
  const bloomOff = patch(BEYOND.x, BEYOND.y);
  FX.setBloom(priorBloom);
  t.render();
  ok("the bloom carries light past the widest halo the sprites draw",
    patch(BEYOND.x, BEYOND.y) !== bloomOff, "path=" + FX.snapshot().bloom);
  ok("the bloom path is the accelerated one on this runner",
    FX.snapshot().bloom === "filter", FX.snapshot().bloom);
  FX.setNebula(priorNeb);
  t.render(); // the lever moved — the canvas has to catch up before section 3
              // reads it, or its first key is the PREVIOUS frame's

  // ---- 3. composite() draws and never mutates -------------------------------
  const pure1 = fieldKey();
  t.render();
  const pure2 = fieldKey();
  t.render();
  const pure3 = fieldKey();
  ok("three renders of one state paint identical bytes", pure1 === pure2 && pure2 === pure3,
    pure1 + " / " + pure2 + " / " + pure3);

  // ---- 4. the sim clock is the only clock -----------------------------------
  // The shockwave ring is the one advance-driven ink the fresh layer carries:
  // it is re-derived from the cue's age every composite, so a frame that did
  // not advance must paint the same ring twice.
  // The cue is `death`, and that matters: it is the one heavy kind that spawns
  // NO particles (the base canvas already paints a dying hull's debris), so the
  // only thing on this frame that CAN move is the flash and the ring. An
  // earlier version used `killheavy` and was contaminated — its particles kept
  // moving, so the frame differed across an advance whether or not the ring
  // aged at all, and a mutation freezing the flash clock did not fail it.
  quiet();
  t.render();
  const preCue = fieldKey();
  FX.cue({ kind: "death", at: { x: SHIP.x, y: SHIP.y }, gain: 1, seat: 0 });
  ok("the ring cue is particle-free, so nothing else can move this frame",
    FX.snapshot().parts === 0, "parts=" + FX.snapshot().parts);
  t.render();
  const cue0 = fieldKey();
  t.render();
  const cue0b = fieldKey();
  ok("a cue paints light on the very next frame", cue0 !== preCue);
  ok("a render never ages the shockwave ring", cue0 === cue0b);
  FX.advance(6);
  t.render();
  const cue6 = fieldKey();
  ok("the ring expands when — and only when — the sim advances", cue6 !== cue0);
  const snap6 = FX.snapshot();
  ok("advance() is what moves the layer's own clock", snap6.tick === 6 && snap6.flashes === 1,
    "tick=" + snap6.tick + " flashes=" + snap6.flashes);

  // ---- 4b. the phosphor is the emitter's residue, and it moves on the same
  // clock. The persist buffer is the one surface that carries ink ACROSS
  // frames, so it is the one that could drift on a render — and it is the only
  // thing still lit once every flash (life 55) and every ring have expired.
  quiet();
  t.render();
  const dark = fieldKey();
  FX.cue({ kind: "killheavy", at: { x: SHIP.x, y: SHIP.y }, gain: 1, seat: 0 });
  const born = FX.snapshot().parts;
  ok("a cue fills the pooled emitter", born > 20, "parts=" + born);
  FX.advance(60);
  t.render();
  const tail = fieldKey();
  ok("particle residue outlives the flash that made it — the phosphor holds",
    tail !== dark);
  t.render();
  t.render();
  ok("a render never fades the phosphor", fieldKey() === tail);
  FX.advance(20);
  t.render();
  ok("...and an advance does", fieldKey() !== tail);
  const late = FX.snapshot().parts;
  ok("the pool drains as its particles die", late < born && late >= 0,
    "born=" + born + " late=" + late);

  // ...and the FADE ITSELF, read off the debt counter rather than off pixels.
  // The pixel legs above prove the phosphor moves only on an advance, but they
  // cannot prove the FADE ran: live particles paint new ink every advance, so
  // the frame changes either way — a mutation removing the fade entirely did
  // not fail them. These two pin the mechanism the tracker's risk note names,
  // both halves of it: the decay is scaled to SIM FRAMES ADVANCED (never to
  // rAF, or the tail length would follow the display's Hz), and the debt is
  // FLUSHED IN CHUNKS rather than every frame (a small per-frame
  // destination-out stalls in 8-bit and leaves a permanent grey ghost floor).
  quiet();
  const fadeA = FX.snapshot().fade;
  FX.advance(1);
  const fadeB = FX.snapshot().fade;
  ok("the phosphor debt accrues on every advanced sim frame", fadeB < fadeA,
    "before=" + fadeA + " after=" + fadeB);
  let flushes = 0;
  let prev = fadeB;
  for (let i = 0; i < 12; i++) {
    FX.advance(1);
    const f = FX.snapshot().fade;
    if (f > prev) flushes++; // the debt reset — a flush landed
    prev = f;
  }
  ok("...and is flushed in chunks, never once per frame",
    flushes >= 1 && flushes <= 5, "flushes=" + flushes + " over 12 frames");

  // ---- 5. a restart is fx-clean ---------------------------------------------
  // enc.reset() is restart(), which calls resetImpactFx(), which now reaches
  // this layer too. Without that chain the phosphor and the live cues would
  // survive a cut and every quiet-state staging in this repository would be a
  // little bit dirty.
  quiet();
  t.render();
  const quietA = fieldKey();
  FX.cue({ kind: "killheavy", at: { x: SHIP.x, y: SHIP.y }, gain: 1, seat: 0 });
  FX.cue({ kind: "blast", at: { x: SHIP.x + 30, y: SHIP.y + 10 }, gain: 1, seat: 0 });
  FX.advance(4);
  t.render();
  ok("the staged cues are actually on the screen before the reset", fieldKey() !== quietA);
  quiet();
  t.render();
  const quietB = fieldKey();
  ok("a restart clears every layer the light lives on", quietA === quietB,
    "before=" + quietA + " after=" + quietB);
  const snapR = FX.snapshot();
  ok("...and the layer's own counters go with it",
    snapR.tick === 0 && snapR.cues === 0 && snapR.flashes === 0 && snapR.parts === 0,
    "tick=" + snapR.tick + " cues=" + snapR.cues + " flashes=" + snapR.flashes +
    " parts=" + snapR.parts);

  // ---- 5b. the trail is a polyline through the pose ring, and the ring is
  // CUT rather than bent. A trail drawn across a respawn or a net snap is a
  // line the ship never flew, and on THIS camera — which tracks a ship across
  // a 3072x3762 arena — it would be drawn straight through half the world.
  //
  // Every leg isolates the TRACK and nothing else: the two frames compared are
  // the same pose with the same halo, reached once by flying and once in a
  // single step. Probing a chosen point instead would only measure whichever
  // end of the taper happened to clear 8-bit rounding.
  const walk = (steps, dx) => {
    for (let i = 0; i < steps; i++) {
      for (const P of t.players) P.ship.x += dx;
      FX.advance(1);
    }
  };
  quiet();
  walk(14, 3);
  t.render();
  const flown = fieldKey();
  ok("the pose ring fills one entry per advance", FX.snapshot().ring === 14,
    "ring=" + FX.snapshot().ring);
  quiet();
  walk(1, 42); // the same pose, one entry in the ring, so no track to draw
  t.render();
  const stepped = fieldKey();
  ok("a moving ship leaves a trail the same pose reached in one step does not",
    flown !== stepped);

  // ...and a jump cuts it: the old track must be gone in ONE frame
  quiet();
  walk(14, 3);
  for (const P of t.players) P.ship.x += 100; // past a tick of flight by any upgrade
  FX.advance(1);
  t.render();
  const afterJump = fieldKey();
  ok("...and the ring restarts from the new pose", FX.snapshot().ring === 1,
    "ring=" + FX.snapshot().ring);
  quiet();
  walk(1, 142); // the same landing pose, with no track behind it at all
  t.render();
  ok("a jump cuts the track instead of drawing a line the ship never flew",
    afterJump === fieldKey());

  // an announced return is cut on the CUE, not on a guessed threshold
  quiet();
  walk(10, 3);
  ok("a track exists to be cut", FX.snapshot().ring === 10, "ring=" + FX.snapshot().ring);
  FX.cue({ kind: "respawn", at: { x: SHIP.x, y: SHIP.y }, gain: 1, seat: 0 });
  FX.advance(1);
  ok("a respawn cue cuts the returning seat's track", FX.snapshot().ring === 1,
    "ring=" + FX.snapshot().ring);

  // ---- 5c. the RESTART MARKER, which is the net client's only reset --------
  // A net client never calls its own Encounter.restart(), so resetImpactFx()
  // and the FX.reset() chained to it never fire there. The authority's
  // `restart` marker is the only signal the layer gets that the run was cut —
  // and it carries NO POSITION, which is why FX.cue answers it before its own
  // position guard and why js/net.js hooks the cue above the null guard.
  quiet();
  t.render();
  const preCut = fieldKey();
  FX.cue({ kind: "killheavy", at: { x: SHIP.x, y: SHIP.y }, gain: 1, seat: 0 });
  FX.advance(4);
  t.render();
  ok("there is live light to cut", fieldKey() !== preCut);
  FX.cue({ kind: "restart", at: null }); // exactly the shape the wire carries
  t.render();
  ok("a positionless restart marker clears the layer",
    fieldKey() === preCut && FX.snapshot().parts === 0 && FX.snapshot().flashes === 0,
    "parts=" + FX.snapshot().parts + " flashes=" + FX.snapshot().flashes);

  // ---- 5d. a hovering ship leaves no wake ---------------------------------
  // The pose ring records one entry per advance whether the ship moved or not,
  // and a zero-length stroke under lineCap "round" is a filled disc. Fifty of
  // them stacked additively on one point would burn a blob through the hull.
  quiet();
  t.render();
  const parked = fieldKey();
  for (let i = 0; i < 40; i++) FX.advance(1); // forty frames of hovering
  t.render();
  ok("forty frames of hovering paint exactly the same frame", fieldKey() === parked,
    "ring=" + FX.snapshot().ring);

  // ---- 6. the same staged run replays to the same pixels --------------------
  const staged = () => {
    quiet();
    FX.cue({ kind: "kill", at: { x: SHIP.x - 20, y: SHIP.y - 12 }, gain: 1, seat: 0 });
    FX.advance(2);
    FX.cue({ kind: "killheavy", at: { x: SHIP.x + 24, y: SHIP.y + 8 }, gain: 1, seat: 0 });
    FX.advance(3);
    FX.cue({ kind: "hit", at: { x: SHIP.x, y: SHIP.y + 26 }, gain: 1, seat: 0 });
    FX.advance(5);
    t.render();
    return fieldKey();
  };
  const runA = staged();
  const runB = staged();
  ok("an identical staged run replays to identical pixels", runA === runB,
    "A=" + runA + " B=" + runB);

  // ---- 7. the layer spends nothing from the seeded stream -------------------
  // The one rule that could move a golden hash. Same shape as the corner map's
  // determinism leg: run the identical sim with a DIFFERENT number of lit
  // frames folded in, then kill bodies afterwards so their orb-drift rand()
  // draws expose any number the light path might have stolen.
  const detRun = (n) => {
    enc.reset();
    enc.E.hull = 99;
    enc.advance(130);
    for (let k = 0; k < n; k++) {
      FX.cue({ kind: "killheavy", at: { x: SHIP.x, y: SHIP.y }, gain: 1, seat: 0 });
      FX.advance(1);
      t.render();
    }
    if (enc.E.enemies[0]) enc.E.enemies[0].hp = 0;
    enc.advance(1);
    for (let k = 0; k < n; k++) {
      FX.cue({ kind: "hit", at: { x: SHIP.x + 12, y: SHIP.y }, gain: 1, seat: 0 });
      FX.advance(1);
      t.render();
    }
    if (enc.E.enemies[0]) enc.E.enemies[0].hp = 0;
    enc.advance(30);
    return JSON.stringify([enc.E.enemies.map((e) => [+e.x.toFixed(3), +e.y.toFixed(3)]),
      enc.E.orbs.map((o) => [+o.x.toFixed(3), +o.y.toFixed(3)])]);
  };
  const det0 = detRun(0);
  const det3 = detRun(3);
  ok("lit frames spend nothing from the seeded stream", det0 === det3 && det0.length > 10,
    "len=" + det0.length);

  // ---- 8. an unmapped kind, and a cue with no position, are both inert ------
  // The local drain has no null-position guard of its own, and termChange is a
  // marker rather than a cue. Both reach FX.cue in production.
  quiet();
  t.render();
  const inertA = fieldKey();
  const cuesBefore = FX.snapshot().cues;
  FX.cue({ kind: "termChange", at: { x: SHIP.x, y: SHIP.y }, gain: 1, seat: 0, termSeq: 3 });
  FX.cue({ kind: "windup", at: { x: SHIP.x, y: SHIP.y }, gain: 1, seat: 0 });
  FX.cue({ kind: "death", at: null, gain: 1, seat: 0 });
  FX.cue({ kind: "death", gain: 1, seat: 0 });
  FX.advance(2);
  t.render();
  ok("a marker, a telegraph and a positionless cue all draw nothing",
    fieldKey() === inertA && FX.snapshot().cues === cuesBefore,
    "cues=" + FX.snapshot().cues + " was=" + cuesBefore);

  // ---- 9. the mid-alpha legs — the light layer at a FRACTIONAL frame --------
  // Every render above is foreign: RALPHA === 1, buildFrameView takes the live
  // branch, and FRAME.cam === cam, FRAME.ships[i] === P.ship by construction.
  // A draw-time read of LIVE state in js/fx.js is therefore invisible to every
  // check above — which is exactly the defect class the frame-adoption merge
  // fixed: the world pass draws at FRAME while a live-reading light layer
  // sweeps against it by Δ·RALPHA, a 60 Hz sawtooth of all light against all
  // ink. These legs drive the REAL frame loop (t.frameBody, the wave1 idiom)
  // to fractional alphas, where FRAME and live genuinely disagree, and pin
  // the one property the merge risked: light and ink agree about where "now"
  // is. Each metric carries a sabotage control that re-renders the SAME
  // instant through a composite fed the pre-merge reads, because a check that
  // cannot fail proves nothing.
  {
    const realFX = window.FX;
    const sdEl = document.getElementById("stardens");
    const sdWas = sdEl ? sdEl.value : null;
    const setStars = (v) => {
      if (!sdEl) return;
      sdEl.value = String(v);
      sdEl.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const priorCam9 = t.camState().CAMMODE;
    const priorNeb9 = FX.snapshot().nebula;
    const priorBloom9 = FX.snapshot().bloomInt;
    FX.setOn(true);
    FX.setNebula(0); // base ink that rides the camera — it would cross every probe
    FX.setBloom(0);  // wide light — it would carry the (honestly sliding) trail in
    setStars(0);     // the star field pans with the camera; a bright star crossing
                     // a probe clamps the additive sum and breaks the isolation
    t.setCamMode("lock"); // the sacred pair: the own hull at the EXACT screen
                          // centre on every frame — what makes bytes comparable
                          // ACROSS frames at all
    const T9 = t.TICKMS;
    // a patch by FIELD point. The world patches above convert through the LIVE
    // camera, which is the one conversion a mid-alpha probe must never make:
    // the world pass drew through FRAME.cam, and the two disagree by design.
    const patchAt = (fx9, fy9) => {
      const p = t.fieldToCanvas(fx9, fy9);
      padCtx.clearRect(0, 0, HALF * 2, HALF * 2);
      padCtx.drawImage(canvasEl, Math.round(p.x) - HALF, Math.round(p.y) - HALF,
        HALF * 2, HALF * 2, 0, 0, HALF * 2, HALF * 2);
      return JSON.stringify(Array.from(padCtx.getImageData(0, 0, HALF * 2, HALF * 2).data));
    };
    // fx-on minus fx-off, byte by byte: INK cancels out of the comparison and
    // what remains is the LIGHT alone, so hull, pause copy and any other
    // static ink under the probe cannot decide these legs either way
    const lightOf = (onS, offS) => {
      const a = JSON.parse(onS), b = JSON.parse(offS);
      const d = new Array(a.length);
      for (let i = 0; i < a.length; i++) d[i] = a[i] - b[i];
      return d.join(",");
    };

    // ---- 9a. the sawtooth pin ----------------------------------------------
    // A coasting own seat in lock mode: hull and halo both belong at the exact
    // screen centre on EVERY frame, so the light isolated at a fixed screen
    // point must repeat byte-for-byte across the whole alpha sweep. A worldXf
    // reading the live camera slides the layer by vel·alpha instead —
    // different bytes at different alphas. The probe sits 12 field px ABOVE
    // the hull: inside the halo, clear of the trail (which honestly hangs off
    // tick poses along −x and may slide), clear of the pause copy (FH/2+46
    // and below).
    const sweep = () => {
      quiet();
      t.players[0].vel.x = 1.8; // under VMAX 2 — the radial clamp must not bite
      t.players[0].vel.y = 0;   // ...and the trail extends along −x, off the probe
      t.seedLoopClock(0);
      for (let k = 1; k <= 4; k++) t.frameBody(k * 1000 / 144); // seed PRES, settle the lock
      const out = { diffs: [], alphas: [], camGap: 0 };
      for (let k = 5; k <= 11; k++) { // k = 12 lands alpha 0 exactly (5k/12) — skip it
        const now = k * 1000 / 144;
        t.frameBody(now);
        out.alphas.push(+t.loopAlpha().toFixed(3));
        out.camGap = Math.max(out.camGap, Math.abs(t.drawnPose().camR.x - t.cam.x));
        const pOn = patchAt(t.FW / 2, t.FH / 2 - 12);
        FX.setOn(false);
        t.frameBody(now); // dt 0 — the SAME instant, repainted without the layer
        const pOff = patchAt(t.FW / 2, t.FH / 2 - 12);
        FX.setOn(true);
        out.diffs.push(lightOf(pOn, pOff));
      }
      return out;
    };
    const hon = sweep();
    const aLo = Math.min(...hon.alphas), aHi = Math.max(...hon.alphas);
    ok("mid-alpha: the sweep is real — fractional alphas, light in the probe, the frame camera leading",
      hon.alphas.every((a) => a > 0.02 && a < 0.98) && aHi - aLo > 0.3 &&
      hon.camGap > 0.3 && /[1-9]/.test(hon.diffs[0]),
      "alphas=" + hon.alphas.join("/") + " camGap=" + hon.camGap.toFixed(2));
    ok("the own halo holds ONE registration against the hull across the alpha sweep",
      hon.diffs.every((d) => d === hon.diffs[0]),
      "distinct=" + new Set(hon.diffs).size + "/" + hon.diffs.length);
    // THE CONTROL: the same sweep through a composite fed the frame view with
    // the LIVE camera swapped in — worldXf's exact pre-merge read. The slide
    // is vel·alpha, different at every sampled alpha, so the metric above
    // must come apart. If it does not, the metric measures nothing.
    window.FX = Object.assign({}, realFX, {
      composite: (v) => realFX.composite(Object.assign({}, v, { cam: { x: t.cam.x, y: t.cam.y } })),
    });
    const sabA = sweep();
    window.FX = realFX;
    ok("CONTROL: a composite fed the live camera sweeps the light against the ink",
      sabA.diffs.some((d) => d !== sabA.diffs[0]),
      "distinct=" + new Set(sabA.diffs).size + "/" + sabA.diffs.length);

    // ---- 9b. the ghost probe -----------------------------------------------
    // A body crossing the field mid-alpha: the world pass draws its round at
    // lerp(prev, cur, a) off the PRES caches — 15.6 px short of the live pose
    // at these numbers. The light must land ON that round and put NOTHING at
    // the live pose: the halo (9 px) plus the patch (~3 px) cannot reach
    // across the gap, so a live-reading layer separates cleanly. The camera
    // is PARKED this time (vel 0), so camR === cam and every probe converts
    // through one agreed camera.
    quiet();
    for (const P of t.players) { P.ship.x += 240; P.ship.y += 120; }
    // ...a REAL teleport: past TELEPORT (80) so the next advance cuts the pose
    // ring — 9a's trail must not haunt these probes — and past the camera's
    // own 200 px guard so its prev/cur pair hard-cuts too
    const B9 = { id: 900000001, // far above any live id, so presIdReset cannot
                 // read it as an id-space reset. The poisoned maxId self-heals:
                 // the first real body captured after this leg triggers one
                 // full cache clear, and every body appears at its current
                 // pose for a single frame — the caches' designed cold start.
                 x: t.players[0].ship.x + 70, y: t.players[0].ship.y,
                 px: t.players[0].ship.x + 70, py: t.players[0].ship.y,
                 vx: 0, vy: 0, r: 2.2, dmg: 0, owner: 0,
                 dead: false, spent: false, ttl: 9999 };
    t.G.bullets.push(B9);
    t.seedLoopClock(0);
    t.frameBody(T9); // tick 1: the lock camera settles, the round is captured parked
    const BX = B9.x, BY = B9.y;
    B9.x = BX + 26; // one manual tick of travel, INSIDE the 28 px snap guard
    t.frameBody(2.4 * T9); // ONE tick banks (prev BX, cur BX+26), then the
                           // render lands at alpha 0.4
    const a9 = t.loopAlpha();
    const d9 = t.drawnPose();
    const at9 = (wx, wy) => patchAt(wx - d9.camR.x, wy - d9.camR.y);
    const WFx = BX + 26 * a9; // the frame pose the world pass drew the round at
    const fOn = at9(WFx, BY), lOn = at9(BX + 26, BY), eOn = at9(BX, BY + 50);
    FX.setOn(false);
    t.frameBody(2.4 * T9); // dt 0 — the same instant without the layer
    const fOff = at9(WFx, BY), lOff = at9(BX + 26, BY), eOff = at9(BX, BY + 50);
    FX.setOn(true);
    t.frameBody(2.4 * T9); // ...and lit again, for the control below
    ok("mid-alpha: the staging is real — fractional alpha, one camera, the round drawn at its FRAME pose",
      a9 > 0.3 && a9 < 0.5 &&
      Math.abs(d9.camR.x - t.cam.x) < 1e-6 && Math.abs(d9.camR.y - t.cam.y) < 1e-6 &&
      fOff !== eOff && lOff === eOff,
      "a=" + a9.toFixed(3) + " inkAtFrame=" + (fOff !== eOff) + " inkAtLive=" + (lOff !== eOff));
    ok("the halo lands ON the round's frame pose", fOn !== fOff);
    ok("...and puts NOTHING at its live pose — light and ink agree about now",
      lOn === lOff && eOn === eOff);
    // THE CONTROL: drop the frame view entirely — composite()'s foreign-caller
    // fallback IS the pre-merge behaviour, live camera and live poses both.
    // The halo must desert the round and reappear at the live pose.
    window.FX = Object.assign({}, realFX, { composite: () => realFX.composite() });
    t.frameBody(2.4 * T9); // dt 0 — the same instant through the live-reading layer
    const fSab = at9(WFx, BY), lSab = at9(BX + 26, BY);
    window.FX = realFX;
    ok("CONTROL: a composite that drops the frame view detaches the halo to the live pose",
      fSab === fOff && lSab !== lOff,
      "deserted=" + (fSab === fOff) + " ghost=" + (lSab !== lOff));

    // ---- put the page back --------------------------------------------------
    t.G.bullets.splice(t.G.bullets.indexOf(B9), 1);
    t.players[0].vel.x = 0;
    t.players[0].vel.y = 0;
    t.setCamMode(priorCam9);
    FX.setNebula(priorNeb9);
    FX.setBloom(priorBloom9);
    if (sdWas !== null) setStars(sdWas);
    t.seedLoopClock(0); // leave no banked fraction behind for a later driver
  }

  // ---- restore --------------------------------------------------------------
  FX.setOn(priorOn);
  FX.setNebula(priorNeb);
  FX.setBloom(priorBloom);
  t.setPanels(priorPanels);
  t.setMinimap(priorMap);
  t.setEdgeArrows(priorArrows);
  t.setFxInt(priorFxInt);
  t.G.running = priorRunning;
  t.G.started = priorStarted;
  enc.restart();
  for (let i = 0; i < t.players.length && i < priorSeats.length; i++) {
    t.players[i].ship.x = priorSeats[i].x;
    t.players[i].ship.y = priorSeats[i].y;
  }
  t.ui.syncMenu();
  t.render();

  const failed = R.filter((r) => !r.pass);
  return { total: R.length, passed: R.length - failed.length, failed, results: R };
};
