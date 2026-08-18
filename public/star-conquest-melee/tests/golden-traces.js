"use strict";

// Golden traces — the one suite that pins MAGNITUDES instead of mechanisms.
// The other three suites deliberately read the live tunables, so a retuned or
// re-derived page can never fake a failure there — and for exactly that
// reason none of them can detect a behavior change. This suite is the
// opposite by design: every expectation is a committed literal in
// tests/fixtures/golden.json, captured once from the build the human tuned
// and accepted. A page whose constants moved, whose floating-point
// expressions were reordered, or whose seeded stream drew one extra number
// MUST fail here — that is the whole point of the file.
//
// Load this file in the page (fetch + eval), then await runGoldenTraces().
// It is async because the fixture arrives over fetch. Passing
// { capture: true } skips the comparisons and returns a `capture` payload of
// the current build's actual values instead — test/run.mjs --capture writes
// that payload into the fixture file. The suite drives the fixed-step sim
// through window.__test only — no RAF; input arrives through replayInput,
// which dispatches real mousemove events into the production listener. On
// return it restores the aim mode, invert, right-button and session flags it
// touched and resets the encounter, handing the page back to the human
// exactly as it was found.
window.runGoldenTraces = async function (opts) {
  const capture = !!(opts && opts.capture);
  const captureTick = !!(opts && opts.captureTick); // re-baselines ONLY the tickMode
                       // fixture set (test/run.mjs --capture-tick) — the event-mode
                       // traces are still judged on the same run, never rewritten
  const t = window.__test;
  const enc = t.enc;
  const R = [];
  const ok = (name, cond, info) => R.push({ name, pass: !!cond, info: info === undefined ? "" : String(info) });
  const summary = () => {
    const failed = R.filter((r) => !r.pass);
    return { total: R.length, passed: R.length - failed.length, failed, results: R };
  };

  let fx = null;
  if (!capture) {
    try {
      fx = await fetch("tests/fixtures/golden.json?t=" + Date.now()).then((r) => (r.ok ? r.json() : null));
    } catch { /* judged below */ }
    ok("the golden fixture loads", !!(fx && fx.traces), fx ? "" : "tests/fixtures/golden.json missing or unparsable — run test/run.mjs --capture");
    if (!fx || !fx.traces) return summary();
  }

  const priorAimState = t.aimState();
  const priorAim = priorAimState.AIMMODE;
  // aiming() is rightHeld !== INVERT, so INVERT reads back out of the pair
  const priorInvert = priorAimState.rightHeld !== priorAimState.aiming;
  const priorStarted = t.G.started;
  const priorRunning = t.G.running;
  const priorAimed = t.G.aimed;
  const priorInput = t.inputState().INPUTMODE;
  const priorLag = t.inputState().INPUTLAG;

  // The whole suite states the path it runs on, from the first check onward.
  // Section A dispatches REAL mousemoves, but the committed fixtures captured
  // them as event-mode thrust; the immediate drawn cursor and delayed locked
  // aim are tested separately below. Every trace restates its own mode; this is
  // the state they all start from.
  t.setAimMode("mouse");
  t.setInputMode("event");

  // ---- A. instrument sanity — these run in both modes ----
  ok("hashState returns 8 lowercase hex digits", /^[0-9a-f]{8}$/.test(t.hashState()), t.hashState());
  {
    const p0 = t.hashParts();
    const h0 = t.hashState();
    const was = t.G.ship.x;
    t.G.ship.x = was * (1 + Number.EPSILON); // exactly one ULP — a string hash cannot see this
    const p1 = t.hashParts();
    ok("one ULP of ship position moves the hash (float-exact)", p1.ship !== p0.ship && t.hashState() !== h0);
    ok("...and moves ONLY the ship part", p1.bullets === p0.bullets &&
       p1.encounter === p0.encounter && p1.rng === p0.rng);
    t.G.ship.x = was;
    ok("the probe restores cleanly", t.hashState() === h0);
  }
  {
    t.recordInput();
    const ev = new MouseEvent("mousemove", { bubbles: true, buttons: 2 });
    Object.defineProperty(ev, "movementX", { value: 7 });
    Object.defineProperty(ev, "movementY", { value: -3 });
    document.dispatchEvent(ev);
    const rec = t.stopInput();
    ok("the recorder captures raw deltas, buttons and the arrival tick",
       rec.length === 1 && rec[0].dx === 7 && rec[0].dy === -3 && rec[0].buttons === 2 &&
       rec[0].tick === t.simTick() && typeof rec[0].t === "number",
       JSON.stringify(rec[0] || null));
    document.dispatchEvent(ev); // capture is off — this must not append
    ok("capture is off after stopInput", t.stopInput().length === 1);
  }

  // ---- the trace machinery ----
  // one event per tick through the production mousemove path; buttons: 2
  // because the committed contract is right-held mouse flight
  const script = (segs) => {
    const evs = [];
    let tick = 0;
    for (const s of segs) {
      for (let i = 0; i < s.n; i++) {
        evs.push({ t: tick * (1000 / 60), dx: s.dx, dy: s.dy, buttons: 2, tick });
        tick++;
      }
    }
    return evs;
  };
  let traceStart = 0;
  const cp = (tag) => ({
    tag,
    tick: t.simTick() - traceStart, // relative — simTick never resets, fixtures must not care
    hash: t.hashState(),
    parts: t.hashParts(),
    ship: { x: t.G.ship.x, y: t.G.ship.y, vx: t.G.vel.x, vy: t.G.vel.y },
    // EVERY seat's position and velocity — one entry with one seat, so the
    // single-seat traces carry it too and the judge pins every seat at 1e-9
    ships: t.players.map((P) => ({ x: P.ship.x, y: P.ship.y, vx: P.vel.x, vy: P.vel.y })),
    rng: enc.rngState(),
    st: (() => { const s = enc.state(); return { state: s.state, wave: s.wave, kills: s.kills, xp: s.xp, hull: s.hull, enemies: s.enemies, orbs: s.orbs }; })(),
  });
  // pure-flight setup: nothing spawns, no rand() is drawn, and NON-INVERTED
  // mouse flight is the thrust path — the right button RELEASED, so these
  // traces pin the STOCK flight envelope with the comet flag down. Right-hold
  // is comet mode now, and holding it (the old inverted-thrust staging) would
  // put every checkpoint on the comet's gains and cap instead of the shipped
  // ACCEL/TURN/VMAX arithmetic; the comet's own trace is comet-run below. The
  // released button matters doubly in tick mode: bankTickInput banks rh from
  // G.rightHeld, and the sim's comet flag follows the RING, so only a
  // released button keeps the drained frames comet-off. Flags only, the RAF
  // loop never starts here.
  // Score is HASHED now and deliberately survives restart — spending, a PvE
  // death and a restart never take a seat's scoreboard away. Since phase 14
  // exactly one thing does: being killed by another PLAYER resets it to 0
  // (pvpDeathToll), which is why the pvp-* traces below pin a score falling.
  // Either way every judged trace must PIN its starting scores, exactly as
  // the preps stage hull, or the hash would inherit the whole session
  // history that ran before the trace.
  const zeroScores = () => { for (const S of enc.E.seats) S.score = 0; };
  const flightPrep = (mode) => {
    enc.reset();
    zeroScores();
    enc.E.groups = [];
    t.G.started = true;
    t.G.running = true;
    t.setAimMode("mouse");
    t.setInputMode(mode || "event"); // each fixture set pins ONE input path,
                                     // never the page default, which ships "tick"
    t.setInvert(false);    // non-inverted: the released right button flies —
    t.setRightHeld(false); // mouse thrust with rh 0 banked and comet OFF
    // the stored aim is HASHED and sticky across preps, and the setters above
    // can snapshot it from pointer-and-camera state — pin it to one known
    // start instead, exactly as duoPrep does. The comet flag joins it: the
    // button states a WANT now and the sim's gate owns the flag, so
    // setRightHeld(false) above no longer clears a flag left up by an earlier
    // section. The POOL is pinned too, through the production fill — it is
    // hashed, and a trace that inherited a half-drained pool would be staged
    // by whatever ran before it.
    for (const P of t.players) { P.aimAngle = 0; P.aimOff.x = 0; P.aimOff.y = 0; P.aimed = false; P.comet = false; }
    for (let s = 0; s < t.players.length; s++) t.energyFill(s);
    traceStart = t.simTick();
  };
  const EPS = 1e-9;
  const captured = {};
  const collected = {}; // each judged trace's live checkpoints — the phase-1
                        // gate below restates every hash from these in one place
  const judge = (name, got) => {
    if (capture) { captured[name] = { checkpoints: got }; return; }
    collected[name] = got;
    const want = fx.traces[name];
    ok(name + ": fixture holds the trace", !!want && want.checkpoints.length === got.length,
       want ? "want " + want.checkpoints.length + " checkpoints, got " + got.length : "trace missing from fixture");
    if (!want || want.checkpoints.length !== got.length) return;
    want.checkpoints.forEach((w, i) => {
      const g = got[i];
      ok(name + " @" + w.tag + ": checkpoint lands on the committed tick", g.tick === w.tick,
         "tick " + g.tick + " vs " + w.tick);
      ok(name + " @" + w.tag + ": state hash matches the committed hash", g.hash === w.hash,
         g.hash === w.hash ? g.hash
           : "got " + g.hash + " want " + w.hash + " · parts " + JSON.stringify(g.parts) + " vs " + JSON.stringify(w.parts));
      ok(name + " @" + w.tag + ": ship position and velocity match to 1e-9",
         Math.abs(g.ship.x - w.ship.x) <= EPS && Math.abs(g.ship.y - w.ship.y) <= EPS &&
         Math.abs(g.ship.vx - w.ship.vx) <= EPS && Math.abs(g.ship.vy - w.ship.vy) <= EPS,
         "got " + JSON.stringify(g.ship) + " want " + JSON.stringify(w.ship));
      ok(name + " @" + w.tag + ": the RNG stream is exactly where it was", g.rng === w.rng,
         g.rng + " vs " + w.rng);
      ok(name + " @" + w.tag + ": the accounting summary matches", JSON.stringify(g.st) === JSON.stringify(w.st),
         "got " + JSON.stringify(g.st) + " want " + JSON.stringify(w.st));
      if (w.ships) { // fixtures captured after the multi-seat commit pin every seat
        const shipsOk = Array.isArray(g.ships) && g.ships.length === w.ships.length &&
          w.ships.every((ws, s) => Math.abs(g.ships[s].x - ws.x) <= EPS && Math.abs(g.ships[s].y - ws.y) <= EPS &&
                                   Math.abs(g.ships[s].vx - ws.vx) <= EPS && Math.abs(g.ships[s].vy - ws.vy) <= EPS);
        ok(name + " @" + w.tag + ": every seat's position and velocity match to 1e-9", shipsOk,
           "got " + JSON.stringify(g.ships) + " want " + JSON.stringify(w.ships));
      }
    });
  };

  // ---- B. replay self-consistency — live-value-free, runs in both modes ----
  const detOnce = () => {
    flightPrep();
    t.replayInput(script([{ n: 40, dx: 8, dy: 3 }]));
    enc.advance(2);
    return t.hashState();
  };
  ok("a replayed script reproduces the same hash exactly", detOnce() === detOnce());

  // ---- C. rest-to-top-speed — pins ACCEL and the flick curve ----
  flightPrep();
  const g1 = [];
  t.replayInput(script([{ n: 10, dx: 8, dy: 0 }]));
  enc.advance(1);
  g1.push(cp("mid-ramp")); // still under the clamp — velocity itself pins ACCEL × flick
  t.replayInput(script([{ n: 230, dx: 8, dy: 0 }]));
  enc.advance(1);
  g1.push(cp("at-the-clamp")); // position integrates the whole ramp shape
  enc.advance(120);
  g1.push(cp("coasting"));
  judge("rest-to-top-speed", g1);

  // ---- D. flick-turn — pins TURN and the along/across split ----
  flightPrep();
  const g2 = [];
  t.replayInput(script([{ n: 120, dx: 8, dy: 0 }]));
  enc.advance(1);
  g2.push(cp("at-speed"));
  t.replayInput(script([{ n: 40, dx: 0, dy: 60 }])); // a hard cross-heading flick — big deltas drive the flick term too
  enc.advance(1);
  g2.push(cp("after-flick"));
  enc.advance(60);
  g2.push(cp("settled"));
  // a held DIAGONAL against a mixed heading: the one input shape where both
  // axes carry a nonzero along AND across component at once. Axis-pure input
  // cannot see a per-axis reorder of the split when ACCEL equals TURN — the
  // dropped terms are exact zeros there — so this segment is what makes the
  // hash sensitive to a reorder on either axis alone.
  t.replayInput(script([{ n: 40, dx: 9, dy: 5 }]));
  enc.advance(1);
  g2.push(cp("diagonal"));
  judge("flick-turn", g2);

  // ---- E. wall-bounce — pins WALLLOSS on all four walls and a corner ----
  flightPrep();
  const g3 = [];
  const bounce = (x, y, vx, vy, tag) => {
    t.G.ship.x = x; t.G.ship.y = y;
    t.G.vel.x = vx; t.G.vel.y = vy;
    enc.advance(30);
    g3.push(cp(tag));
  };
  bounce(20, t.WH / 2, -2, 0, "left");
  bounce(t.WW - 20, t.WH / 2, 2, 0, "right");
  bounce(t.WW / 2, 20, 0, -2, "top");
  bounce(t.WW / 2, t.WH - 20, 0, 2, "bottom");
  bounce(20, 20, -Math.SQRT2, -Math.SQRT2, "corner"); // full speed into both walls at once
  judge("wall-bounce", g3);

  // ---- F. wave-1-full — pins the seeded schedule, damage, XP and kills ----
  // The parked ship survives on driven hull, and a fixed rotating sweep does
  // the shooting — the same idiom the wave-1 suite's determinism section uses.
  // The sweep pauses outside the fight states (the cleared banner's sweep
  // window) and resumes when the next wave deals itself. ONE loop, shared with the
  // audio-order trace below: the event stream and the hash trace must ride
  // the identical scenario, or a drift between two copies would silently
  // decouple what they prove.
  const wave1Sweep = (each) => {
    for (let k = 0; k < 1800; k++) {
      const st = enc.E.state;
      if (k % 6 === 0 && (st === "idle" || st === "warning" || st === "active")) {
        const a = k * 0.37;
        t.G.bullets.push({ x: t.G.ship.x, y: t.G.ship.y, px: t.G.ship.x, py: t.G.ship.y,
          vx: Math.cos(a) * 30, vy: Math.sin(a) * 30, r: 2.2, dmg: 1, owner: "player",
          dead: false, spent: false, ttl: 60 });
      }
      enc.advance(1);
      if (each) each(k);
    }
  };
  enc.reset();
  zeroScores();
  t.G.started = true;
  t.G.running = true;
  // The wave traces take no mouse input, but they still inherit the flight
  // sections' aim state, which steers fireDir and the stored aim. State it
  // ALL: the mode, the input path, invert and the right button (E leaves the
  // non-inverted released-button state behind, and setAimMode clears
  // rightHeld anyway, so the restate has to follow it).
  t.setAimMode("mouse");
  t.setInputMode("event");
  t.setInvert(true);
  t.setRightHeld(true);
  t.players[0].comet = false;           // staged OFF despite the held right button: this
  t.players[0].input.cometWant = false; // trace exists to pin the seeded schedule, DAMAGE,
  // XP and kills, and comet negation would hollow the damage half — comet has
  // its own trace (comet-run). The WANT is cleared beside the flag: setRightHeld
  // only states the want now, and the sim's gate would raise the flag straight
  // back from it on the very next tick
  enc.E.hull = 99;
  traceStart = t.simTick();
  const g4 = [];
  wave1Sweep((k) => {
    if (k === 299) g4.push(cp("tick-300"));
    if (k === 899) g4.push(cp("tick-900"));
  });
  g4.push(cp("tick-1800"));
  judge("wave-1-full", g4);

  // ---- G. husk-split — pins the one-rand()-per-burst shard fan ----
  // The husk arrives by direct spawn: a concurrent branch reseeds waves 2+,
  // and a fixture that advanced past wave 1 would not survive its merge.
  enc.reset();
  zeroScores();
  enc.E.groups = [];
  enc.E.hull = 99;
  t.G.started = true;
  t.G.running = true;
  t.setAimMode("mouse");
  t.setInputMode("event");
  t.setInvert(true);
  t.setRightHeld(true);
  t.players[0].comet = false;           // staged OFF like the wave-1 prep above: the
  t.players[0].input.cometWant = false; // shard fan this trace pins must burst against a
  // stock ship — a comet hull would kill any grazing shard for free and negate
  // its contact. The want goes with the flag, or the gate re-raises it next tick
  traceStart = t.simTick();
  const g5 = [];
  enc.advance(1);
  enc.spawnEnemy(t.G.ship.x + 200, t.G.ship.y, 0, "husk");
  g5.push(cp("spawned"));
  // the roster-growth guard, taken while a live body is on the field: a type
  // with no members must contribute nothing, so appending one cannot move a hash
  {
    const before = t.hashState();
    enc.roster.push("phantom");
    const during = t.hashState();
    enc.roster.pop();
    ok("a roster type with zero live bodies contributes nothing to the hash",
       before === during && t.hashState() === before);
  }
  for (let k = 0; k < 6; k++) { // wave-1 husk hp is 6 — the sixth round bursts it
    t.G.bullets.push({ x: t.G.ship.x, y: t.G.ship.y, px: t.G.ship.x, py: t.G.ship.y,
      vx: 40, vy: 0, r: 2.2, dmg: 1, owner: "player", dead: false, spent: false, ttl: 60 });
    enc.advance(12);
  }
  g5.push(cp("after-split"));
  enc.advance(120);
  g5.push(cp("aftermath"));
  judge("husk-split", g5);

  // ---- H. audio order — the drained cue stream did not reorder ----
  // The parked-ship wave-1 arc again, replayed with the event recorder on:
  // the whole drained (tick, kind, gain) stream must equal the list captured
  // from the build BEFORE the event queue existed. That equality is what
  // proves the emit conversion moved, merged and dropped nothing. The prep
  // pins every input-side flag the camera can read (aim mode, invert, the
  // right button, the stored aim), so the scenario reproduces on a fresh
  // page exactly as it does mid-suite.
  const evPrep = () => {
    enc.reset();
    zeroScores();
    t.setAimMode("mouse");
    t.setInvert(true);
    t.setRightHeld(true);
    t.players[0].comet = false;           // staged OFF (see the wave-1 prep above): the
    t.players[0].input.cometWant = false; // cue stream this prep serves must keep its
    // hurt/death beats real, and the want must go with the flag or the gate
    // raises it back on the next tick
    t.G.aimed = false;
    t.G.leftHeld = false;
    t.G.started = true;
    t.G.running = true;
  };
  evPrep();
  enc.E.hull = 99;
  traceStart = t.simTick();
  enc.recordEvents();
  wave1Sweep();
  const evGot = enc.stopEvents().map((e) => ({ tick: e.tick - traceStart, kind: e.kind, gain: e.gain }));
  if (capture) captured["audio-order"] = { events: evGot };
  else {
    const evWant = fx.traces["audio-order"];
    ok("audio-order: the fixture holds the committed event stream",
       !!(evWant && Array.isArray(evWant.events)),
       evWant ? "" : "audio-order missing from fixture");
    if (evWant && Array.isArray(evWant.events)) {
      let div = -1;
      const n = Math.max(evGot.length, evWant.events.length);
      for (let i = 0; i < n && div < 0; i++) {
        if (JSON.stringify(evGot[i]) !== JSON.stringify(evWant.events[i])) div = i;
      }
      ok("audio-order: the full (tick, kind) sequence matches the pre-queue baseline", div < 0,
         div < 0 ? evGot.length + " events"
           : "first divergence at " + div + ": got " + JSON.stringify(evGot[div] || null) +
             " want " + JSON.stringify(evWant.events[div] || null));
    }
  }

  // ---- I. the corner bounce — one thud, at the Math.max gain ----
  // Both wall planes flip on the same tick; the committed contract is ONE
  // event whose gain carries the LARGER flipped component through min(1, v/4)
  // — never a thud per wall.
  evPrep();
  enc.E.groups = [];
  traceStart = t.simTick();
  enc.recordEvents();
  t.G.ship.x = 30;
  t.G.ship.y = 30;
  t.G.vel.x = -2;
  t.G.vel.y = -2;
  enc.advance(30);
  const cbGot = enc.stopEvents().map((e) => ({ tick: e.tick - traceStart, kind: e.kind, gain: e.gain }));
  if (capture) captured["corner-bounce"] = { events: cbGot };
  else {
    const cbWant = fx.traces["corner-bounce"];
    ok("corner-bounce: the corner is exactly one thud and nothing else",
       cbGot.length === 1 && cbGot[0].kind === "thud", JSON.stringify(cbGot));
    ok("corner-bounce: the thud lands on the committed tick at the committed gain",
       !!cbWant && JSON.stringify(cbGot) === JSON.stringify(cbWant.events),
       "got " + JSON.stringify(cbGot) + " want " + JSON.stringify(cbWant && cbWant.events));
  }
  // ...and an ASYMMETRIC corner, both planes on one tick, which is what
  // actually proves the Math.max: the symmetric dive above flips two EQUAL
  // components, so max, min and either-axis-alone all read the same there.
  // Here |vx| is 1.6 and |vy| is 1.2, so the gain must name the larger one —
  // and there must still be exactly one event, never a thud per wall.
  evPrep();
  enc.E.groups = [];
  enc.recordEvents();
  t.G.ship.x = 8;
  t.G.ship.y = 7.5;
  t.G.vel.x = -1.6;
  t.G.vel.y = -1.2;
  enc.advance(1);
  const cbAsym = enc.stopEvents();
  if (!capture) {
    ok("corner-bounce: an asymmetric corner really flipped both axes",
       t.G.vel.x > 0 && t.G.vel.y > 0, "vel=" + t.G.vel.x + "," + t.G.vel.y);
    ok("corner-bounce: one thud, and its gain carries the LARGER flipped component",
       cbAsym.length === 1 && cbAsym[0].kind === "thud" &&
       Math.abs(cbAsym[0].gain * 4 - 1.6) < 1e-9,
       JSON.stringify(cbAsym));
  }

  // ---- J. entity ids — one space, unique, increasing, never reused ----
  // A husk dies mid-run, so the burst is in the sample: the shards must take
  // FRESH ids while the husk's retires — "the husk died and three shards
  // appeared", never "the husk changed shape". Bullets ride the same counter
  // through Encounter.nextId(), so cross-family uniqueness is really tested,
  // and two runs from one seed must deal the identical id sequence.
  const idRun = (seed) => {
    enc.restart(seed);
    enc.E.groups = [];
    enc.E.hull = 99;
    t.G.started = true;
    t.G.running = true;
    t.setAimMode("push");
    t.G.aimed = true;
    t.G.aimAngle = 0;
    const seen = new Set();
    const deadIds = new Set();
    const order = []; // every id, in first-seen order — the cross-run key
    let prevMax = 0;
    const flaws = [];
    let sawShard = false;
    const scan = () => {
      const here = new Set();
      for (const fam of [enc.E.enemies, enc.E.missiles, enc.E.orbs, t.G.bullets]) {
        let last = 0; // each array appends in spawn order, so ids ascend in it
        for (const o of fam) {
          if (typeof o.id !== "number" || o.id < 1) { flaws.push("unstamped:" + o.id); continue; }
          if (here.has(o.id)) flaws.push("dup:" + o.id);
          here.add(o.id);
          if (o.id <= last) flaws.push("array-order:" + o.id);
          last = o.id;
          // BEFORE the first-seen gate — a reused id is one that already died,
          // and every dead id is also a seen one, so testing inside the gate
          // would never fire
          if (deadIds.has(o.id)) flaws.push("reused:" + o.id);
          if (!seen.has(o.id)) {
            if (o.id <= prevMax) flaws.push("non-monotonic:" + o.id);
            seen.add(o.id);
            order.push(o.id);
          }
        }
      }
      for (const id of seen) if (!here.has(id)) deadIds.add(id);
      for (const id of here) if (id > prevMax) prevMax = id;
      if (enc.E.enemies.some((e) => e.type === "shard")) sawShard = true;
    };
    enc.advance(1);
    enc.spawnEnemy(t.G.ship.x + 200, t.G.ship.y, 0, "husk");
    enc.spawnEnemy(t.G.ship.x + 260, t.G.ship.y + 40, 1, "dart");
    enc.spawnMissile(t.G.ship.x + 300, t.G.ship.y - 60, Math.PI);
    scan();
    for (let k = 0; k < 40; k++) {
      t.G.cool = 0;
      enc.fireOnce();
      enc.advance(6);
      scan();
    }
    return { order, flaws, sawShard };
  };
  const idA = idRun(777);
  const idB = idRun(777);
  ok("ids are unique across every family, dealt from one increasing counter, never reused",
     idA.flaws.length === 0 && idA.order.length > 10,
     (idA.flaws.slice(0, 8).join(" ") || "clean") + " · first-seen=" + idA.order.length);
  ok("the sample really contains a husk burst — shards on fresh ids", idA.sawShard);
  ok("two runs from one seed deal the identical id sequence",
     JSON.stringify(idA.order) === JSON.stringify(idB.order),
     "lenA=" + idA.order.length + " lenB=" + idB.order.length);

  // ---- K. the byte-identical gate — every phase-1 hash, in one place ----
  // judge() above already fails checkpoint by checkpoint; this is the
  // phase-2 summary, naming the SUBSYSTEM that moved via hashParts so a
  // failure reads as a diagnosis rather than a diff.
  if (!capture) {
    for (const name of Object.keys(collected)) {
      const want = fx.traces[name];
      const bad = [];
      want.checkpoints.forEach((w, i) => {
        const g = collected[name][i];
        if (!g || g.hash !== w.hash) {
          const parts = g ? Object.keys(w.parts).filter((p) => g.parts[p] !== w.parts[p]).join(",") : "checkpoint missing";
          bad.push("@" + w.tag + " moved in: " + (parts || "composite"));
        }
      });
      ok("phase-1 gate: every committed " + name + " hash is byte-identical", bad.length === 0, bad.join(" · "));
    }
  }

  // ---- L. the frame loop drains — the RAF path itself, driven for real ----
  // No other trace exercises loop(): the suite drives step() directly. So
  // the drain's placement inside the real frame loop gets its own proof —
  // resume the page with autofire held, wait for a fire cue to reach the Sfx
  // log through loop()'s own drain, then pause and confirm the queue is
  // empty. Log-first: no audio device and no gesture is needed for the log
  // entry to appear. Last on purpose — real frames advance the sim off-trace.
  {
    const A = t.audio; // absent only on a page without js/audio.js
    enc.reset();
    t.setAimMode("mouse");
    t.setInvert(true);
    t.setRightHeld(false); // aiming() stays TRUE, so resume() requests no
                           // pointer lock — a headless page refuses the lock
                           // and the pointerlockerror handler would pause the
                           // run this section needs alive
    t.setMouseClient(window.innerWidth / 2 + 100, window.innerHeight / 2); // the
                           // visible pointer IS the aim in this state — seed it
                           // off-center so fireDir() resolves
    t.G.leftHeld = true; // autofire — every cooldown expiry queues a fire event
    t.G.cool = 0;
    t.G.started = true;
    t.G.running = false; // resume() refuses a page already marked running
    if (A) A.clearLog();
    t.ui.resume();
    const fires = () => (A ? A.log().filter((e) => e.name === "fire").length : 1);
    const rafT0 = performance.now();
    while (performance.now() - rafT0 < 4000 && fires() < 1) await new Promise((r) => setTimeout(r, 50));
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", bubbles: true }));
    ok("the frame loop forwards the queued cues to Sfx",
       fires() >= 1, "fire entries=" + fires() + (A ? "" : " (no audio module — vacuous)"));
    ok("...and the queue is empty once the frames stop",
       window.Encounter.events().length === 0, "queued=" + window.Encounter.events().length);
    t.G.leftHeld = false;
  }

  // ---- M. the diagnosis line — constants vs code ----
  // The fixture records the tunable set it was captured under. When the hashes
  // above fail AND this fails, the constants moved; hashes failing alone means
  // the code moved. In capture mode there is nothing to compare yet.
  if (!capture && fx.meta) {
    const live = { tunables: enc.tunables(), flight: t.flightTunables() };
    ok("the live tunable set matches the fixture's capture record",
       JSON.stringify(live) === JSON.stringify({ tunables: fx.meta.tunables, flight: fx.meta.flight }),
       JSON.stringify(live) + " vs " + JSON.stringify({ tunables: fx.meta.tunables, flight: fx.meta.flight }));
    // the viewport line of the same diagnosis: the fixtures bake the capture
    // window's letterbox into hashed stored-aim state, so a drifted runner
    // window must fail HERE, with a named cause, not as a bare hash mismatch
    if (fx.meta.viewport) {
      const lv = { innerWidth: window.innerWidth, innerHeight: window.innerHeight,
                   dpr: window.devicePixelRatio || 1 };
      ok("the live viewport matches the fixture's capture viewport",
         JSON.stringify(lv) === JSON.stringify(fx.meta.viewport),
         "live " + JSON.stringify(lv) + " vs fixture " + JSON.stringify(fx.meta.viewport));
    }
  }

  // ---- N. the per-tick input path — live-value-free invariants ----
  // None of these read the fixture: they are self-consistency proofs of the
  // INPUTMODE "tick" accumulator and the lag ring, true at any tuning.
  {
    const priorVmax = enc.tunables().VMAX;
    t.setVmax(1e9); // no clamp — the invariants compare raw integrals
    const canvasEl = document.getElementById("field");
    const dispatch = (dx, dy) => {
      const e = new MouseEvent("mousemove", { bubbles: true, buttons: 2, clientX: 0, clientY: 0 });
      Object.defineProperty(e, "movementX", { value: dx });
      Object.defineProperty(e, "movementY", { value: dy });
      document.dispatchEvent(e);
    };
    const shimOn = () => Object.defineProperty(document, "pointerLockElement", { value: canvasEl, configurable: true });
    const shimOff = () => { delete document.pointerLockElement; };

    // report-rate invariance: ONE hand motion of (96, 24) counts per tick,
    // split 2/8/16/64 ways (exact binary fractions, so the sums are exact).
    // Event mode must diverge — that is the defect — and tick mode must land
    // the IDENTICAL hash, which is the fix's whole claim.
    const rateRun = (perTick, mode) => {
      flightPrep(mode);
      const evs = [];
      for (let k = 0; k < 8; k++) {
        for (let i = 0; i < perTick; i++) {
          evs.push({ t: 0, dx: 96 / perTick, dy: 24 / perTick, buttons: 2, tick: k });
        }
      }
      t.replayInput(evs);
      enc.advance(1);
      return { hash: t.hashState(), v: Math.hypot(t.G.vel.x, t.G.vel.y) };
    };
    const tickRuns = [2, 8, 16, 64].map((n) => rateRun(n, "tick"));
    ok("tick mode: 2, 8, 16 and 64 events per tick land the identical hash",
       tickRuns.every((r) => r.hash === tickRuns[0].hash), tickRuns.map((r) => r.hash).join(" "));
    const evRuns = [2, 8, 16, 64].map((n) => rateRun(n, "event"));
    ok("event mode: the report rate alone moves the outcome (the defect is real)",
       new Set(evRuns.map((r) => r.hash)).size === 4, evRuns.map((r) => r.hash).join(" "));
    ok("event mode: fewer, bigger reports push harder — the flick term is superlinear",
       evRuns[0].v > evRuns[1].v && evRuns[1].v > evRuns[2].v && evRuns[2].v > evRuns[3].v,
       evRuns.map((r) => r.v.toFixed(6)).join(" > "));

    // a catch-up frame: the banked delta is one hand motion — the first step
    // consumes it and the rest see zeros, never the same delta again
    flightPrep("tick");
    shimOn(); dispatch(96, 0); shimOff();
    enc.advance(1);
    const v1 = t.G.vel.x;
    enc.advance(2);
    ok("a catch-up frame applies the banked delta once, not once per step",
       v1 > 0 && t.G.vel.x === v1 && t.inputState().acc.tx === 0,
       "v1=" + v1 + " v3=" + t.G.vel.x);

    // the lag ring: input banked at tick T with the slider at N ticks lands
    // at exactly T + N — never earlier, never later, never doubled
    const TICKMS = enc.tunables().TICK;
    const lagLand = (N) => {
      t.setInputLag(N * TICKMS);
      flightPrep("tick"); // its mode set clears the ring — a prior run's zeros must not queue-shift this one
      shimOn(); dispatch(96, 0); shimOff();
      let landed = -1;
      for (let i = 1; i <= N + 4; i++) {
        enc.advance(1);
        if (landed < 0 && t.G.vel.x !== 0) landed = i;
      }
      return landed;
    };
    const lands = [lagLand(0), lagLand(3), lagLand(6)];
    ok("input banked at tick T with delay N lands at exactly T + N (N = 0, 3, 6)",
       lands[0] === 1 && lands[1] === 4 && lands[2] === 7, JSON.stringify(lands));

    // a mid-flight slider shrink: every buffered tick still lands, in order,
    // at most one overdue entry beside the due one — and the four identical
    // +x pulses make the conservation check EXACT, not approximate
    const pulse = () => { shimOn(); dispatch(96, 0); shimOff(); enc.advance(1); };
    t.setInputLag(0);
    flightPrep("tick");
    for (let k = 0; k < 4; k++) pulse();
    enc.advance(8);
    const vBase = t.G.vel.x;
    t.setInputLag(6 * TICKMS);
    flightPrep("tick");
    for (let k = 0; k < 4; k++) pulse(); // all four sit buffered
    t.setInputLag(0);                    // the shrink under test
    const perTick = [];
    let prev = t.G.vel.x;
    for (let i = 0; i < 10; i++) { enc.advance(1); perTick.push(t.G.vel.x - prev); prev = t.G.vel.x; }
    ok("a slider shrink strands no input and duplicates none — the total is conserved exactly",
       t.G.vel.x === vBase, t.G.vel.x + " vs " + vBase);
    ok("...and drains at most two buffered ticks per tick, never the whole backlog",
       Math.max(...perTick) <= (vBase / 4) * 2 + 1e-12 && Math.max(...perTick) > (vBase / 4) * 1.5,
       JSON.stringify(perTick.map((d) => +d.toFixed(6))));

    t.setInputMode("event");
    t.setInputLag(0);
    t.setVmax(priorVmax);
  }

  // ---- O. tick-mode golden traces — the parallel fixture set ----
  // The same three pure-flight scenarios as C/D/E, run with INPUTMODE "tick"
  // and pinned under fixture.tickMode — so BOTH input paths are committed
  // magnitudes and a later change to either is caught. Captured PRE-RETUNE:
  // test/run.mjs --capture-tick re-baselines them (and only them) after the
  // human retunes. The wave and husk traces have no mouse input and would
  // duplicate C..G byte for byte, so they stay event-only.
  {
    const tickCaptured = {};
    const tickJudge = (name, got) => {
      if (captureTick) { tickCaptured[name] = { checkpoints: got }; return; }
      if (capture) return; // --capture owns only the event traces
      const want = fx.tickMode && fx.tickMode.traces && fx.tickMode.traces[name];
      ok(name + ": the tickMode fixture holds the trace", !!want && want.checkpoints.length === got.length,
         want ? "want " + want.checkpoints.length + " checkpoints, got " + got.length
              : "tickMode trace missing — run test/run.mjs --capture-tick");
      if (!want || want.checkpoints.length !== got.length) return;
      want.checkpoints.forEach((w, i) => {
        const g = got[i];
        ok(name + " @" + w.tag + ": state hash matches the committed hash",
           g.tick === w.tick && g.hash === w.hash,
           g.hash === w.hash ? g.hash
             : "got " + g.hash + " want " + w.hash + " · parts " + JSON.stringify(g.parts) + " vs " + JSON.stringify(w.parts));
        ok(name + " @" + w.tag + ": the RNG stream is exactly where it was", g.rng === w.rng,
           g.rng + " vs " + w.rng);
      });
    };
    flightPrep("tick");
    const tg1 = [];
    t.replayInput(script([{ n: 10, dx: 8, dy: 0 }]));
    enc.advance(1);
    tg1.push(cp("mid-ramp"));
    t.replayInput(script([{ n: 230, dx: 8, dy: 0 }]));
    enc.advance(1);
    tg1.push(cp("at-the-clamp"));
    enc.advance(120);
    tg1.push(cp("coasting"));
    tickJudge("tick-rest-to-top-speed", tg1);
    flightPrep("tick");
    const tg2 = [];
    t.replayInput(script([{ n: 120, dx: 8, dy: 0 }]));
    enc.advance(1);
    tg2.push(cp("at-speed"));
    t.replayInput(script([{ n: 40, dx: 0, dy: 60 }]));
    enc.advance(1);
    tg2.push(cp("after-flick"));
    enc.advance(60);
    tg2.push(cp("settled"));
    t.replayInput(script([{ n: 40, dx: 9, dy: 5 }]));
    enc.advance(1);
    tg2.push(cp("diagonal"));
    tickJudge("tick-flick-turn", tg2);
    flightPrep("tick");
    const tg3 = [];
    const tbounce = (x, y, vx, vy, tag) => {
      t.G.ship.x = x; t.G.ship.y = y;
      t.G.vel.x = vx; t.G.vel.y = vy;
      enc.advance(30);
      tg3.push(cp(tag));
    };
    tbounce(20, t.WH / 2, -2, 0, "left");
    tbounce(t.WW - 20, t.WH / 2, 2, 0, "right");
    tbounce(t.WW / 2, 20, 0, -2, "top");
    tbounce(t.WW / 2, t.WH - 20, 0, 2, "bottom");
    tbounce(20, 20, -Math.SQRT2, -Math.SQRT2, "corner");
    tickJudge("tick-wall-bounce", tg3);
    t.setInputMode("event");
    if (captureTick) window.__tickCapture = { traces: tickCaptured };
  }

  // ---- P. locked cursor: immediate local pointer, delayed simulation aim ----
  // Pin this section's own modes and use the production mousemove listener.
  // The pointer-lock shim supplies only the browser state that headless Chrome
  // cannot grant without a gesture; all cursor and lag behavior stays real.
  {
    const beforeAim = t.aimState();
    const beforeInput = t.inputState();
    const beforeCursor = t.lockedCursor();
    const beforeRunning = t.G.running;
    const beforeStarted = t.G.started;
    const beforeCamMode = t.camState().CAMMODE;
    const beforeVmax = t.flightTunables().VMAX;
    const beforeLeftHeld = t.G.leftHeld;
    const beforeKeys = [...t.G.keys];
    const beforeKeyThrust = enc.mods.keyThrust;
    const beforeInvert = beforeAim.rightHeld !== beforeAim.aiming;
    const canvasEl = document.getElementById("field");
    const sameCursor = (a, b) => a.x === b.x && a.y === b.y;
    const dispatch = (dx, dy) => {
      const e = new MouseEvent("mousemove", { bubbles: true, clientX: 0, clientY: 0 });
      Object.defineProperty(e, "movementX", { value: dx });
      Object.defineProperty(e, "movementY", { value: dy });
      document.dispatchEvent(e);
    };
    const fireDown = () => canvasEl.dispatchEvent(new MouseEvent("mousedown", {
      button: 0, buttons: 1, bubbles: true, clientX: 0, clientY: 0,
    }));
    const fireUp = () => document.dispatchEvent(new MouseEvent("mouseup", {
      button: 0, buttons: 0, bubbles: true,
    }));
    const fireClick = () => { fireDown(); fireUp(); };
    const keyEvent = (type, code) => document.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    const tickPrep = (N) => {
      enc.reset();
      enc.E.groups = [];
      t.G.leftHeld = false;
      t.G.keys.clear();
      t.G.started = true;
      t.G.running = true;
      t.setCamMode("lock");
      t.setVmax(1e9);
      t.setAimMode("locked");
      t.setInvert(true);
      t.setRightHeld(false);
      t.setInputLag(N * enc.tunables().TICK);
      t.setInputMode("tick");
      // WORLD coordinates now — an off-ship aim point, stated ship-relative
      t.setLockedCursor(t.G.ship.x + 96, t.G.ship.y - 48);
      t.G.cool = 0;
    };

    try {
      Object.defineProperty(document, "pointerLockElement", { value: canvasEl, configurable: true });
      t.G.started = true;
      t.G.running = true;
      t.setAimMode("locked");
      t.setInvert(true);
      t.setRightHeld(false);
      t.setInputLag(6 * enc.tunables().TICK);
      t.setInputMode("tick");

      t.setLockedCursor(t.G.ship.x, t.G.ship.y); // world coordinates — parked on the ship
      const immediateStart = t.lockedCursor();
      const simStart = t.inputState().scur;
      dispatch(24, -12);
      const immediateTarget = t.lockedCursor();
      ok("locked tick cursor moves immediately on dispatch, before any step",
         !sameCursor(immediateTarget, immediateStart) && sameCursor(t.inputState().scur, simStart),
         JSON.stringify({ immediateStart, immediateTarget, scur: t.inputState().scur }));

      const cursorLagLand = (N) => {
        t.setInputLag(N * enc.tunables().TICK);
        t.setInputMode("tick"); // clears the previous run's absolute samples
        t.setLockedCursor(t.G.ship.x, t.G.ship.y);
        dispatch(24, -12);
        const target = t.lockedCursor();
        let landed = -1;
        for (let i = 1; i <= N + 4; i++) {
          t.step();
          if (landed < 0 && sameCursor(t.inputState().scur, target)) landed = i;
        }
        return landed;
      };
      const cursorLands = [cursorLagLand(0), cursorLagLand(3), cursorLagLand(6)];
      ok("locked sim cursor lands at exactly T + N (N = 0, 3, 6)",
         cursorLands[0] === 1 && cursorLands[1] === 4 && cursorLands[2] === 7,
         JSON.stringify(cursorLands));

      // The marker is local UI, like the drawn cursor: it holds the hand's
      // line at once, while the shots keep the delayed aim. Pre-fill the ring
      // with settle entries first, then move the pointer without stepping, so
      // the two directions differ only by the lag. Aim is WORLD-space now:
      // the expected direction is cursor minus ship, and no camera term.
      tickPrep(6);
      for (let i = 0; i < 3; i++) t.step(); // no input dispatched — scur cannot drain a move
      const unitTo = (p) => {
        const dx = p.x - t.G.ship.x;
        const dy = p.y - t.G.ship.y;
        const m = Math.hypot(dx, dy);
        return { x: dx / m, y: dy / m };
      };
      dispatch(-48, 96);
      const markerLocal = t.markerDir();
      const simAim = t.fireDir();
      const movedPointer = t.lockedCursor();
      const wantLocal = unitTo(movedPointer);
      const wantSim = unitTo(t.inputState().scur);
      const near = (a, b) => a && b && Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
      ok("the aim marker holds the immediate pointer while the sim aim trails it",
         near(markerLocal, wantLocal) && near(simAim, wantSim) && !near(markerLocal, simAim),
         JSON.stringify({ markerLocal, simAim, wantLocal, wantSim,
                          pointer: t.lockedCursor(), scur: t.inputState().scur }));

      // ...and the two converge again once the lag window passes: three
      // settle entries sit ahead of the moved one, so the sim catches up on
      // the seventh step while the pointer itself never moves again. Compare
      // the two directions at one call time only — a ship that still moves
      // shifts the shared anchor, never the two apart.
      let converged = -1;
      for (let i = 1; i <= 12; i++) {
        t.step();
        if (converged < 0 && sameCursor(t.inputState().scur, t.lockedCursor())) converged = i;
      }
      ok("the aim marker and the sim aim agree once the buffered move drains",
         converged === 7 && near(t.markerDir(), t.fireDir()) &&
           sameCursor(t.lockedCursor(), movedPointer),
         JSON.stringify({ converged, marker: t.markerDir(), sim: t.fireDir(),
                          pointer: t.lockedCursor(), movedPointer, scur: t.inputState().scur }));

      // Fire is a packet edge plus a sampled held state. Every run teleports
      // the cursor before the press both to clear stale absolute samples and
      // to guarantee fireDir() has a real, off-center direction.
      const fireLagRun = (N) => {
        tickPrep(N);
        fireClick();
        const counts = [];
        for (let i = 0; i <= N; i++) { t.step(); counts.push(t.G.bullets.length); }
        const landed = counts.findIndex((n) => n > 0) + 1;
        const level = t.G.bullets.length;
        const coolSteps = Math.ceil(enc.tunables().BCOOL / enc.tunables().TICK);
        let flat = level === 1;
        for (let i = 0; i < coolSteps; i++) {
          t.step();
          if (t.G.bullets.length !== level) flat = false;
        }
        return { landed, counts, flat };
      };
      const fireRuns = [0, 3, 6].map(fireLagRun);
      ok("tick fire press lands at exactly T + N (N = 0, 3, 6), never before",
         fireRuns.every((r, i) => r.landed === [1, 4, 7][i] &&
           r.counts.slice(0, -1).every((n) => n === 0) && r.counts.at(-1) === 1),
         JSON.stringify(fireRuns));
      ok("a released tick fire press is consumed once and stays flat for a full cooldown",
         fireRuns.every((r) => r.flat), JSON.stringify(fireRuns));

      // Start scur at C, move the local cursor to A, bank the press, then move
      // to B only after A's packet exists. The drained shot must use A.
      tickPrep(6);
      const simBeforeClick = t.inputState().scur;
      dispatch(64, 32);
      const captureCursor = t.lockedCursor();
      fireClick();
      t.step();
      dispatch(-176, 112);
      const laterCursor = t.lockedCursor();
      for (let i = 0; i < 5; i++) t.step();
      const parked = { x: t.G.ship.x, y: t.G.ship.y };
      const ex = captureCursor.x - t.G.ship.x; // world-space aim — no camera term
      const ey = captureCursor.y - t.G.ship.y;
      const em = Math.hypot(ex, ey);
      const expected = { x: ex / em, y: ey / em };
      const absentBeforeDrain = t.G.bullets.length === 0;
      t.step();
      const captureBullet = t.G.bullets[0];
      const bm = captureBullet ? Math.hypot(captureBullet.vx, captureBullet.vy) : 0;
      const actual = captureBullet ? { x: captureBullet.vx / bm, y: captureBullet.vy / bm } : { x: 0, y: 0 };
      ok("delayed fire uses its capture-tick cursor, not the later local cursor",
         !sameCursor(simBeforeClick, captureCursor) && !sameCursor(captureCursor, laterCursor) &&
           absentBeforeDrain && t.G.bullets.length === 1 &&
           t.G.ship.x === parked.x && t.G.ship.y === parked.y &&
           Math.abs(actual.x - expected.x) < EPS && Math.abs(actual.y - expected.y) < EPS,
         JSON.stringify({ simBeforeClick, captureCursor, laterCursor, expected, actual }));

      // Held keys are sampled as a normalized direction. The ring unlock and
      // KEYTHRUST remain drain-time simulation state, so unlock after reset.
      const keyLagRun = (N) => {
        tickPrep(N);
        enc.mods.keyThrust = true;
        keyEvent("keydown", "KeyD");
        const down = [];
        let prev = { ...t.G.vel };
        for (let i = 0; i < N + 3; i++) {
          t.step();
          down.push(Math.hypot(t.G.vel.x - prev.x * t.flightTunables().DAMP,
                               t.G.vel.y - prev.y * t.flightTunables().DAMP) > EPS);
          prev = { ...t.G.vel };
        }
        keyEvent("keyup", "KeyD");
        const up = [];
        for (let i = 0; i < N + 2; i++) {
          t.step();
          up.push(Math.hypot(t.G.vel.x - prev.x * t.flightTunables().DAMP,
                             t.G.vel.y - prev.y * t.flightTunables().DAMP) > EPS);
          prev = { ...t.G.vel };
        }
        return { down, up };
      };
      const keyRuns = [0, 3, 6].map(keyLagRun);
      ok("tick key thrust starts at exactly T + N (N = 0, 3, 6)",
         keyRuns.every((r, i) => r.down.slice(0, [0, 3, 6][i]).every((v) => !v) &&
           r.down.slice([0, 3, 6][i]).every(Boolean)), JSON.stringify(keyRuns));
      ok("tick key thrust stops exactly N ticks after keyup (N = 0, 3, 6)",
         keyRuns.every((r, i) => r.up.slice(0, [0, 3, 6][i]).every(Boolean) &&
           r.up.slice([0, 3, 6][i]).every((v) => !v)), JSON.stringify(keyRuns));

      // Mode changes clear a banked edge and re-sync the sim-side held bit.
      tickPrep(6);
      fireClick();
      const bankedFire = t.inputState().acc.fp;
      t.setInputMode("event");
      let resetClean = t.G.bullets.length === 0 && t.inputState().fireHeld === false;
      for (let i = 0; i < 10; i++) {
        t.step();
        if (t.G.bullets.length !== 0 || t.inputState().fireHeld !== false) resetClean = false;
      }
      ok("clearing tick input discards a banked fire edge and snaps held fire false",
         bankedFire === 1 && resetClean,
         JSON.stringify({ bankedFire, bullets: t.G.bullets.length, input: t.inputState() }));

      t.setInputLag(6 * enc.tunables().TICK);
      t.setInputMode("tick");
      t.setLockedCursor(t.G.ship.x, t.G.ship.y);
      dispatch(24, -12);
      const beforeClear = t.inputState();
      t.setInputMode("event");
      const afterClear = t.inputState();
      ok("clearing tick input snaps the sim cursor to the immediate pointer",
         !sameCursor(beforeClear.scur, t.lockedCursor()) &&
           sameCursor(afterClear.scur, t.lockedCursor()) && afterClear.buffered === 0,
         JSON.stringify({ before: beforeClear.scur, after: afterClear.scur, pointer: t.lockedCursor() }));

      // The role swap is client-side, so its aim snapshot reads the pointer
      // the player sees. Bank a move whose packet has not drained — scur
      // still trails — then flip into right-flight: the retained aim holds
      // the press-time local cursor, not the latency-old sim cursor, and it
      // keeps holding it after the stale packets drain.
      tickPrep(6);
      for (let i = 0; i < 3; i++) t.step(); // pre-fill settle entries; no banked move drains
      dispatch(-48, 96);
      const pressCursor = t.lockedCursor();
      const staleCursor = t.inputState().scur;
      t.setRightHeld(true);
      const snapAim = t.fireDir();
      const wantPress = unitTo(pressCursor);
      const wantStale = unitTo(staleCursor);
      for (let i = 0; i < 10; i++) t.step();
      const heldAim = t.fireDir();
      ok("the right-swap aim snapshot reads the press-time local cursor, not the delayed scur",
         !sameCursor(pressCursor, staleCursor) &&
           near(snapAim, wantPress) && !near(snapAim, wantStale) && near(heldAim, wantPress),
         JSON.stringify({ pressCursor, staleCursor, snapAim, wantPress, wantStale, heldAim }));

      // ---- the ring banks a WORLD aim point: the camera plays no part ----
      // Teleport the aim to an explicit WORLD point, bank it through the
      // ring, drain, and fire — with the render camera parked in two
      // different places. Both shots must leave along cursor minus ship in
      // WORLD coordinates. Both parks keep the aim point inside the view, so
      // the view clamp cannot move it and the banked cx,cy are exact. A
      // view-space aim read fails this: the direction reads through cam and
      // misses the world direction under either park.
      const worldAimShot = (camX, camY) => {
        tickPrep(0);
        t.cam.x = camX;
        t.cam.y = camY;
        t.setLockedCursor(t.G.ship.x + 120, t.G.ship.y - 60);
        fireClick();
        t.step();
        const b = t.G.bullets[0];
        const m = b ? Math.hypot(b.vx, b.vy) : 1;
        return b ? { x: b.vx / m, y: b.vy / m } : null;
      };
      const camHome = { x: t.cam.x, y: t.cam.y };
      const shotA = worldAimShot(t.G.ship.x - t.FW / 2, t.G.ship.y - t.FH / 2);
      const shotB = worldAimShot(t.G.ship.x - t.FW / 2 + 150, t.G.ship.y - t.FH / 2 + 100);
      t.cam.x = camHome.x;
      t.cam.y = camHome.y;
      const wm = Math.hypot(120, 60);
      const wantWorld = { x: 120 / wm, y: -60 / wm };
      ok("banked aim resolves in world space — a parked camera plays no part",
         near(shotA, wantWorld) && near(shotB, wantWorld),
         JSON.stringify({ shotA, shotB, wantWorld }));
    } finally {
      delete document.pointerLockElement;
      t.G.leftHeld = beforeLeftHeld;
      t.G.keys.clear();
      for (const code of beforeKeys) t.G.keys.add(code);
      enc.mods.keyThrust = beforeKeyThrust;
      t.setLockedCursor(beforeCursor.x, beforeCursor.y);
      t.setInputMode(beforeInput.INPUTMODE);
      t.setInputLag(beforeInput.INPUTLAG);
      t.setCamMode(beforeCamMode);
      t.setVmax(beforeVmax);
      t.setAimMode(beforeAim.AIMMODE);
      t.setInvert(beforeInvert);
      t.setRightHeld(beforeAim.rightHeld);
      t.G.running = beforeRunning;
      t.G.started = beforeStarted;
    }
  }

  // ---- Q. two-seat golden traces — the multi-seat sim, server-shaped ----
  // Seat 1 is fed EXCLUSIVELY through pushInputFrame: one mouse per machine —
  // the DOM listener layer is physically seat 0's, so these fixtures pin the
  // per-seat BANKING, DRAIN ORDER and APPLICATION, never the DOM-listener
  // conversion (the single-seat suites own that). The drive is the SERVER
  // shape: raw stepSim() with pre-formed frames for BOTH seats — no client
  // boundary, no bank, and NO CAMERA anywhere (the render camera, which
  // follows seat 0, never runs under stepSim, so the fixtures are camera-free
  // by construction). Aim mode is locked+tick, so every seat's turret
  // resolves its banked cx,cy world point — the exact server configuration.
  // Every frame carries EXPLICIT cx,cy: scur is unhashed transport, and a
  // frame that fires must never inherit an environment-dependent default.
  {
    const F = (o) => ({ tx: 0, ty: 0, ax: 0, ay: 0, fp: 0, fh: false, kx: 0, ky: 0, ...o });
    const duoPrep = (seed) => {
      t.setPlayerCount(2);
      t.setInputMode("tick");
      t.setInputLag(0);
      t.setAimMode("locked");
      t.setInvert(true);
      t.setRightHeld(false);
      t.G.leftHeld = false;
      t.G.keys.clear();
      t.G.started = true;
      t.G.running = true;
      enc.restart(seed);
      zeroScores(); // score is hashed and restart-surviving — pin the start
      // the stored aim is HASHED and sticky across restarts; both runners
      // zero it explicitly so the duo traces start from one known aim state —
      // and the comet flag with it, for exactly the same reason. The ENERGY
      // pool is hashed on the same terms, so every seat starts FULL with no
      // recharge delay pending, through the production fill and not a poke.
      for (const P of t.players) { P.aimAngle = 0; P.aimOff.x = 0; P.aimOff.y = 0; P.aimed = false; P.comet = false; }
      for (let s = 0; s < t.players.length; s++) t.energyFill(s);
      traceStart = t.simTick();
    };
    const duoStep = () => { t.stepSim(); window.Encounter.drainEvents(); };

    // the missing-seat guard: a frame addressed past the seat list is
    // REJECTED (returns false, warns), never a TypeError — a mis-routed wire
    // frame must not crash the server; phase 09's demux leans on this
    duoPrep(1);
    let guardThrew = false;
    let guardRet;
    try { guardRet = t.pushInputFrame(9, F({ cx: 0, cy: 0 })); } catch { guardThrew = true; }
    const guardOk = t.pushInputFrame(1, F({ cx: 0, cy: 0 }));
    ok("a frame addressed at a missing seat is rejected without a throw; a real seat banks",
       !guardThrew && guardRet === false && guardOk === true,
       JSON.stringify({ guardThrew, guardRet, guardOk }));

    // Q1. duo-flight — ASYMMETRIC diagonal scripts (the diagonal-input
    // lesson: axis-pure or symmetric scripts cannot see per-seat reorders),
    // then crossfire: seat 1 fires across seat 0's path while both fly, so
    // per-seat bullet ownership and the shared cadence land in the hash.
    duoPrep(4242);
    enc.E.groups = [];
    const q1 = [];
    let sawSeat1Shot = false;
    let sawSeat0Shot = false;
    for (let k = 0; k < 180; k++) {
      if (k < 60) {
        t.pushInputFrame(0, F({ tx: 8, ty: 3, cx: 2200, cy: 1400 }));
        t.pushInputFrame(1, F({ tx: -5, ty: 9, cx: 1200, cy: 2400 }));
      } else if (k < 120) {
        t.pushInputFrame(0, F({ tx: -4, ty: 6, cx: 2200, cy: 1400, fp: k === 70 ? 1 : 0, fh: k >= 71 && k < 100 }));
        t.pushInputFrame(1, F({ tx: 7, ty: -2, cx: 1536, cy: 1881, fp: k === 65 ? 1 : 0 }));
      }
      duoStep();
      if (t.G.bullets.some((b) => b.owner === 1)) sawSeat1Shot = true;
      if (t.G.bullets.some((b) => b.owner === 0)) sawSeat0Shot = true;
      if (k === 59) q1.push(cp("split-thrust"));
      if (k === 119) q1.push(cp("crossfire"));
    }
    q1.push(cp("coast"));
    ok("both seats' shots flew, each stamped with its own seat id", sawSeat0Shot && sawSeat1Shot,
       JSON.stringify({ sawSeat0Shot, sawSeat1Shot }));
    judge("duo-flight", q1);

    // Q2. duo-aggro — the INTERACTING scenario: a charger chasing seat 0 is
    // shot by seat 1 mid-windup; seat 0 dodges the LOCKED dash line (which is
    // exactly why the line must not re-aim); the switch to the attacker lands
    // at the first seek-mode decision point after the telegraph resolves; a
    // counter-shot inside the fresh commitment window cannot flip it back,
    // and the flip-back waits out the full window.
    duoPrep(777);
    enc.E.groups = [];
    enc.E.seats[0].hull = 99;
    enc.E.seats[1].hull = 99;
    const ap0 = t.players[0];
    const ap1 = t.players[1];
    ap0.ship.x = 1000; ap0.ship.y = 1000; ap0.vel.x = 0; ap0.vel.y = 0;
    ap1.ship.x = 1400; ap1.ship.y = 1000; ap1.vel.x = 0; ap1.vel.y = 0;
    enc.spawnEnemy(1080, 1000, 0, "charger");
    const foe = enc.E.enemies[0];
    const q2 = [];
    let lockAtWindup = null;
    let lockMoved = false;
    let tgtMovedInTelegraph = false;
    let switchTick = -1;
    let switchMode = "";
    let backTick = -1;
    let t250 = null;
    for (let k = 1; k <= 400; k++) {
      if (k >= 32 && k <= 80) t.pushInputFrame(0, F({ ty: 24, cx: 1000, cy: 1400 })); // the dodge
      if (k === 40) t.G.bullets.push({ x: 1300, y: 1000, px: 1300, py: 1000, vx: -40, vy: 0,
        r: 2.2, dmg: 1, owner: 1, dead: false, spent: false, ttl: 60 }); // seat 1 hits it mid-windup
      if (k === 200) t.G.bullets.push({ x: foe.x, y: foe.y - 200, px: foe.x, py: foe.y - 200, vx: 0, vy: 40,
        r: 2.2, dmg: 1, owner: 0, dead: false, spent: false, ttl: 60 }); // seat 0 counter-shot in the window
      duoStep();
      if (switchTick < 0 && (foe.mode === "windup" || foe.mode === "dash")) {
        if (lockAtWindup === null) lockAtWindup = foe.lockA;
        else if (foe.lockA !== lockAtWindup) lockMoved = true;
        if (foe.tgtSeat !== 0) tgtMovedInTelegraph = true;
      }
      if (switchTick < 0 && foe.tgtSeat === 1) { switchTick = k; switchMode = foe.mode; }
      if (switchTick > 0 && backTick < 0 && foe.tgtSeat === 0) backTick = k;
      if (k === 250) t250 = { tgt: foe.tgtSeat, aggroT: foe.aggroT, hp: foe.hp };
      if (k === 80) q2.push(cp("mid-telegraph"));
      if (k === 250) q2.push(cp("committed"));
      if (k === 400) q2.push(cp("end"));
    }
    ok("telegraph honesty: neither the locked line nor the target moved mid-windup or mid-dash",
       lockAtWindup !== null && !lockMoved && !tgtMovedInTelegraph,
       JSON.stringify({ lockAtWindup, lockMoved, tgtMovedInTelegraph }));
    ok("the forced aggro switch lands at a seek-mode decision point, after the telegraph resolves",
       switchTick === 198 && switchMode === "seek",
       "switchTick=" + switchTick + " mode=" + switchMode);
    ok("a counter-shot inside the commitment window damages the body but cannot flip the target",
       !!t250 && t250.tgt === 1 && t250.hp === 3 && t250.aggroT > 0, JSON.stringify(t250));
    ok("the flip back to the other attacker waits out the full commitment window (90 ticks)",
       backTick - switchTick === 90, "switch=" + switchTick + " back=" + backTick);
    judge("duo-aggro", q2);

    // Q3. duo-wave — PER-PLAYER WAVES: every seat gets its own copy of the
    // schedule, owner-anchored off-screen spawns, and the ≥2 s owner lock.
    // After the packs land, the owner teleports far away and seat 1 parks
    // beside the owner-0 pack — the lock must HOLD the pack on the distant
    // owner for its whole window even though seat 1 is far nearer, and at
    // expiry the standard nearest rule takes over. That teleport is what
    // makes the lock check non-vacuous: without it the owner is nearest
    // anyway and the lock proves nothing.
    duoPrep();
    enc.E.seats[0].hull = 99;
    enc.E.seats[1].hull = 99;
    const wp0 = t.players[0];
    const wp1 = t.players[1];
    wp0.ship.x = 1500; wp0.ship.y = 1800; wp0.vel.x = 0; wp0.vel.y = 0;
    wp1.ship.x = 1900; wp1.ship.y = 1800; wp1.vel.x = 0; wp1.vel.y = 0;
    const gs = enc.E.groups;
    ok("per-player waves: every base group deals once per seat, owner-stamped, same clock",
       gs.length === 4 && gs.map((g) => g.owner).join(",") === "0,1,0,1" &&
       gs[0].count === gs[1].count && gs[0].spawnAt === gs[1].spawnAt &&
       gs[2].count === gs[3].count && gs[2].spawnAt === gs[3].spawnAt,
       JSON.stringify(gs.map((g) => ({ owner: g.owner, count: g.count, spawnAt: g.spawnAt }))));
    const q3 = [];
    const nearer = (x, y) =>
      Math.hypot(wp1.ship.x - x, wp1.ship.y - y) < Math.hypot(wp0.ship.x - x, wp0.ship.y - y) ? 1 : 0;
    let spawnSnap = null;
    let anchorsOffscreen = null;
    let crossTicks = 0;
    let lockHeldAt240 = false;
    let allSwitchedTick = -1;
    let freshCommit = false;
    for (let k = 1; k <= 340; k++) {
      duoStep();
      if (k === 127) {
        spawnSnap = enc.E.enemies.map((e) => ({ type: e.type, tgt: e.tgtSeat, aggroT: e.aggroT }));
        anchorsOffscreen = gs.filter((g) => g.points).every((g) => {
          const s = (g.owner === 0 ? wp0 : wp1).ship;
          const rx = Math.max(0, Math.min(t.WW - t.FW, s.x - t.FW / 2));
          const ry = Math.max(0, Math.min(t.WH - t.FH, s.y - t.FH / 2));
          const a = g.points.anchor;
          return !(a.x > rx && a.x < rx + t.FW && a.y > ry && a.y < ry + t.FH);
        });
      }
      if (k === 128) { // the lock probe — see the section comment
        wp0.ship.x = 2800; wp0.ship.y = 3400;
        wp1.ship.x = 1470; wp1.ship.y = 2060;
      }
      const own0 = enc.E.enemies.slice(0, 3); // spawn order: owner-0 pack first
      if (k > 128 && k <= 240) for (const e of own0) if (e.tgtSeat === 0 && nearer(e.x, e.y) === 1) crossTicks++;
      if (k === 240) lockHeldAt240 = own0.every((e) => e.tgtSeat === 0);
      if (allSwitchedTick < 0 && own0.length === 3 && own0.every((e) => e.tgtSeat === 1)) {
        allSwitchedTick = k;
        freshCommit = own0.every((e) => e.aggroT > 80);
      }
      if (k === 130) q3.push(cp("first-packs"));
      if (k === 240) q3.push(cp("lock-held"));
      if (k === 252) q3.push(cp("switched"));
      if (k === 340) q3.push(cp("end"));
    }
    ok("each pack spawns owner-locked: initial target is the owner, lock is the 2 s window",
       !!spawnSnap && spawnSnap.length === 6 &&
       spawnSnap.slice(0, 3).every((e) => e.tgt === 0 && e.aggroT > 110) &&
       spawnSnap.slice(3).every((e) => e.tgt === 1 && e.aggroT > 110),
       JSON.stringify(spawnSnap));
    ok("every dealt anchor lands OFF-SCREEN from its owner (outside the owner's view rect)",
       anchorsOffscreen === true, String(anchorsOffscreen));
    ok("the owner lock is non-vacuous: the pack held its distant owner while the other seat was nearer",
       crossTicks > 200 && lockHeldAt240, "crossTicks=" + crossTicks + " heldAt240=" + lockHeldAt240);
    ok("at lock expiry the standard rule takes over: the whole pack switches to the nearest seat, freshly committed",
       allSwitchedTick === 245 && freshCommit, "allSwitchedTick=" + allSwitchedTick + " freshCommit=" + freshCommit);
    judge("duo-wave", q3);

    // Q4. comet-run — the right-hold comet, pinned browser-to-Node. rh rides
    // the ring per seat: seat 0 holds it through a stretch of DIAGONAL
    // mouse-thrust frames (the diagonal-input lesson — axis-pure input hides
    // per-axis reorders) and sweeps a dart off the field, while seat 1 flies
    // the IDENTICAL stick without rh — the per-seat proof. The hold carries a
    // 30-tick frame gap in the middle, so the flag's held-input persistence
    // is in the hash too; the tail releases rh and the cap falls back.
    // The whole hold is 90 ticks, and it is 90 for a REASON: at COMETDRAIN 1
    // the pool pays one energy a tick, so a hold longer than ENMAX starves
    // itself and the held checkpoint would pin a DEAD comet. 40 held, 30
    // input-starved, 20 held again leaves 10 energy at the last held tick.
    duoPrep(909);
    enc.E.groups = [];
    enc.E.seats[0].hull = 99;
    enc.E.seats[1].hull = 99;
    const cm0 = t.players[0];
    const cm1 = t.players[1];
    cm0.ship.x = 1000; cm0.ship.y = 1000; cm0.vel.x = 0; cm0.vel.y = 0;
    cm1.ship.x = 2200; cm1.ship.y = 1000; cm1.vel.x = 0; cm1.vel.y = 0;
    enc.spawnEnemy(1113, 1064, 0, "dart"); // parked on seat 0's diagonal, and
                                           // nearest to seat 0 — it chases the comet
    const q4 = [];
    const cmT = t.flightTunables();
    let cmMax0 = 0;
    let cmMax1 = 0;
    let cmStarved = null;
    for (let k = 0; k < 240; k++) {
      if (k < 40 || (k >= 70 && k < 90)) {
        t.pushInputFrame(0, F({ tx: 7, ty: 4, cx: 2000, cy: 1600, rh: 1 }));
      } else if (k >= 90) {
        t.pushInputFrame(0, F({ tx: 7, ty: 4, cx: 2000, cy: 1600 })); // released — rh 0
      } // ticks 40..69: NO seat-0 frame at all — the flag must persist
      t.pushInputFrame(1, F({ tx: 7, ty: 4, cx: 2600, cy: 1600 }));
      duoStep();
      if (k < 90) cmMax0 = Math.max(cmMax0, Math.hypot(cm0.vel.x, cm0.vel.y));
      cmMax1 = Math.max(cmMax1, Math.hypot(cm1.vel.x, cm1.vel.y));
      if (k === 69) cmStarved = { comet: cm0.comet, speed: Math.hypot(cm0.vel.x, cm0.vel.y) };
      if (k === 39) q4.push(cp("comet-ramp"));
      if (k === 69) q4.push(cp("starved"));
      if (k === 89) q4.push(cp("held"));
    }
    q4.push(cp("released"));
    ok("comet tops out at the raised cap while the plain seat keeps the stock one",
       Math.abs(cmMax0 - cmT.VMAX * cmT.COMETVMAX) < 1e-6 && cmMax1 <= cmT.VMAX + 1e-9,
       "comet=" + cmMax0 + " plain=" + cmMax1 + " cap=" + cmT.VMAX * cmT.COMETVMAX);
    ok("the comet flag persists across a 30-tick frame gap — held input, not per-frame state",
       !!cmStarved && cmStarved.comet === true && cmStarved.speed > cmT.VMAX + 0.5,
       JSON.stringify(cmStarved));
    ok("the comet ram killed the dart and the hull never paid",
       enc.state().kills === 1 && enc.state().hitsTaken === 0 && enc.E.seats[0].hull === 99,
       "kills=" + enc.state().kills + " hitsTaken=" + enc.state().hitsTaken +
       " hull=" + enc.E.seats[0].hull);
    ok("releasing rh clamps the comet back to the stock cap",
       cm0.comet === false && Math.hypot(cm0.vel.x, cm0.vel.y) <= cmT.VMAX + 1e-9,
       "comet=" + cm0.comet + " speed=" + Math.hypot(cm0.vel.x, cm0.vel.y));
    judge("comet-run", q4);

    // Q5. duo-shop — PER-SEAT UPGRADE TERMS (phase 08.5): seat 1 buys
    // AFTERBURNER, RECHARGER and ENERGY CELL mid-trace and every effect
    // lands on seat 1 ALONE. The trace pins (a) seat 1's speed cap and
    // regen moving, (b) seat 0's NOT moving, (c) the prices diverging per
    // seat, (d) the CELL's fill landing on the buyer only, and (e) the
    // termSeq epoch + termChange markers in the drained stream. Purchases
    // ride enc.buy(row, 1) directly — pre-09 the server routes every wire
    // buy to its one bound seat, so the ghost seat's shopping IS this
    // direct call; its flight still arrives through pushInputFrame like
    // every Q trace. termSeq is asserted by DELTA, never absolute: the
    // epoch survives every restart the suites ran before this point, so an
    // absolute would pin suite history instead of the contract.
    duoPrep(3131);
    enc.E.groups = [];
    enc.E.seats[0].hull = 99;
    enc.E.seats[1].hull = 99;
    const sh0 = t.players[0];
    const sh1 = t.players[1];
    sh0.ship.x = 1000; sh0.ship.y = 1000; sh0.vel.x = 0; sh0.vel.y = 0;
    sh1.ship.x = 2200; sh1.ship.y = 2200; sh1.vel.x = 0; sh1.vel.y = 0;
    enc.addXp(100, 0); // BOTH wallets funded — an unfunded seat 0 would make
    enc.addXp(100, 1); // the isolation legs vacuous (nothing to not-spend)
    const shT = t.flightTunables();
    const shRow = (n) => enc.shopInfo().findIndex((r) => r.name === n);
    const AB = shRow("AFTERBURNER");
    const RC = shRow("RECHARGER");
    const EC = shRow("ENERGY CELL");
    const q5 = [];
    const shFrame = () => { // the IDENTICAL diagonal stick for both seats —
                            // any post-buy speed split is the TERMS, not input
      t.pushInputFrame(0, F({ tx: 7, ty: 4, cx: 1600, cy: 1600 }));
      t.pushInputFrame(1, F({ tx: 7, ty: 4, cx: 2800, cy: 2800 }));
    };
    let shMax0a = 0, shMax1a = 0;
    for (let k = 0; k < 60; k++) {
      shFrame(); duoStep();
      shMax0a = Math.max(shMax0a, Math.hypot(sh0.vel.x, sh0.vel.y));
      shMax1a = Math.max(shMax1a, Math.hypot(sh1.vel.x, sh1.vel.y));
    }
    q5.push(cp("stock-flight"));
    ok("duo-shop: both seats top out at the stock cap before any purchase",
       Math.abs(shMax0a - shT.VMAX) < 1e-9 && Math.abs(shMax1a - shT.VMAX) < 1e-9,
       "s0=" + shMax0a + " s1=" + shMax1a + " VMAX=" + shT.VMAX);
    // ---- the purchases, between ticks — the epoch recorded around them ----
    const priceBefore = { s0: enc.shopInfo(0)[AB].cost, s1: enc.shopInfo(1)[AB].cost };
    const seqBefore = enc.E.seats[1].termSeq;
    const seq0Before = enc.E.seats[0].termSeq;
    const shSaleAB = enc.buy(AB, 1);
    const shSaleRC = enc.buy(RC, 1);
    // (d) the CELL's fill: BOTH pools part-drained through the production
    // spend, then seat 1 buys capacity — the buyer refills, seat 0 must not
    t.energySpend(0, 60);
    t.energySpend(1, 60);
    const shEn0Before = t.players[0].energy;
    const shSaleEC = enc.buy(EC, 1);
    // the markers ride the SAME queue every cue rides, taken here exactly as
    // duoStep's own drain would hand them over (the Q traces drain the queue
    // directly, so recordEvents — which watches the headless drainStep —
    // never sees a Q-trace event)
    const shMarks = window.Encounter.drainEvents().filter((e) => e.kind === "termChange");
    ok("duo-shop: three sales went through against seat 1's wallet",
       shSaleAB === true && shSaleRC === true && shSaleEC === true &&
       enc.E.seats[1].xp === 100 - 4 - 5 - 5 && enc.E.seats[0].xp === 100,
       JSON.stringify({ shSaleAB, shSaleRC, shSaleEC, xp1: enc.E.seats[1].xp, xp0: enc.E.seats[0].xp }));
    ok("duo-shop: prices diverge per seat — the buyer's next rank doubled, the other seat's did not",
       priceBefore.s0 === 4 && priceBefore.s1 === 4 &&
       enc.shopInfo(1)[AB].cost === 8 && enc.shopInfo(0)[AB].cost === 4,
       JSON.stringify({ priceBefore, after0: enc.shopInfo(0)[AB].cost, after1: enc.shopInfo(1)[AB].cost }));
    ok("duo-shop: the terms landed on the buyer alone — seat 1 gains speed/regen/cell, seat 0 stays stock",
       enc.termsFor(1).speed === 1 && enc.termsFor(1).enRech === 1 && enc.termsFor(1).enCell === 1 &&
       enc.termsFor(0).speed === 0 && enc.termsFor(0).enRech === 0 && enc.termsFor(0).enCell === 0,
       JSON.stringify({ t1: enc.termsFor(1), t0: enc.termsFor(0) }));
    ok("duo-shop: the ENERGY CELL fill landed on the buyer only",
       Math.abs(t.players[1].energy - t.energyCap(1)) < 1e-9 &&
       Math.abs(t.energyCap(1) - shT.ENMAX * (1 + shT.ENCELL)) < 1e-9 &&
       Math.abs(t.players[0].energy - shEn0Before) < 1e-9 &&
       Math.abs(t.players[0].energyMax - shT.ENMAX) < 1e-9,
       JSON.stringify({ en1: t.players[1].energy, cap1: t.energyCap(1),
                        en0: t.players[0].energy, before0: shEn0Before }));
    ok("duo-shop: termSeq stepped once per sale on the buyer and the markers rode the drained stream",
       enc.E.seats[1].termSeq === seqBefore + 3 && enc.E.seats[0].termSeq === seq0Before &&
       shMarks.length === 3 && shMarks.every((m, i) => m.seat === 1 && m.termSeq === seqBefore + 1 + i),
       JSON.stringify({ seqBefore, seqAfter: enc.E.seats[1].termSeq, shMarks }));
    // ---- the identical stick again — the caps split exactly one purchase wide
    let shMax0b = 0, shMax1b = 0;
    for (let k = 0; k < 60; k++) {
      shFrame(); duoStep();
      shMax0b = Math.max(shMax0b, Math.hypot(sh0.vel.x, sh0.vel.y));
      shMax1b = Math.max(shMax1b, Math.hypot(sh1.vel.x, sh1.vel.y));
    }
    q5.push(cp("after-buys"));
    ok("duo-shop: seat 1's AFTERBURNER raised ITS cap by 1.0; seat 0 kept the stock cap on the same stick",
       Math.abs(shMax1b - (shT.VMAX + 1)) < 1e-9 && Math.abs(shMax0b - shT.VMAX) < 1e-9,
       "s1=" + shMax1b + " want=" + (shT.VMAX + 1) + " s0=" + shMax0b + " VMAX=" + shT.VMAX);
    // ---- regen: equal spends off FULL pools, then a still coast past the
    // recharge delay — seat 1's RECHARGER refills a quarter faster per tick,
    // seat 0 at base. The fills first: seat 0 drifted during the flight
    // stretch above, and a refused spend (pool under the ask) would leave
    // its delay unarmed and the comparison meaningless.
    t.energyFill(0);
    t.energyFill(1);
    t.energySpend(0, 50);
    t.energySpend(1, 50);
    for (let k = 0; k < shT.ENDELAY; k++) duoStep(); // both delays expire together
    const shRe0 = t.players[0].energy;
    const shRe1 = t.players[1].energy;
    for (let k = 0; k < 40; k++) duoStep();
    q5.push(cp("regen"));
    ok("duo-shop: the buyer's regen runs at 1+ENRECH× base; the other seat's at exactly base",
       Math.abs((t.players[1].energy - shRe1) - 40 * shT.ENREGEN * (1 + shT.ENRECH)) < 1e-6 &&
       Math.abs((t.players[0].energy - shRe0) - 40 * shT.ENREGEN) < 1e-6,
       JSON.stringify({ d1: t.players[1].energy - shRe1, d0: t.players[0].energy - shRe0,
                        want1: 40 * shT.ENREGEN * (1 + shT.ENRECH), want0: 40 * shT.ENREGEN }));
    judge("duo-shop", q5);

    // Q6. pvp-duel — PLAYERS ARE DANGEROUS (phase 14). Seat 1 shoots seat 0
    // dead through the ORDINARY firing path: locked aim at seat 0's parked
    // position, autofire held, the shared cadence, the same first-along-the-
    // path arbitration every PvE round goes through. Seat 0 has BOUGHT things
    // first — a rank vector, a raised hull cap and a score — so the toll the
    // kill collects has something to take. What the trace pins: the victim's
    // score to 0, its ranks to stock, its stored hullMax back to the base,
    // the termSeq step, termChange AND death in one drained tick, the orb
    // count up by exactly PVPORBS, the KILLER's score and ranks untouched,
    // and the score ordering flipping as a result. Seat 0 never fires back:
    // this is the DIRECTIONAL case, and the mutual one is a wave1 leg.
    duoPrep(1414);
    enc.E.groups = [];
    const du0 = t.players[0];
    const du1 = t.players[1];
    du0.ship.x = 1500; du0.ship.y = 1800; du0.vel.x = 0; du0.vel.y = 0;
    du1.ship.x = 1500; du1.ship.y = 1620; du1.vel.x = 0; du1.vel.y = 0;
    const duRow = (n) => enc.shopInfo().findIndex((r) => r.name === n);
    enc.addXp(60, 0);
    enc.addXp(20, 1); // the killer scores too, so the ordering FLIP below is a real
                      // reordering of two live rows and not 0 against 0
    enc.buy(duRow("AFTERBURNER"), 0);
    enc.buy(duRow("MAX HULL"), 0);
    const duSeqBefore = enc.E.seats[0].termSeq;
    const duScoreBefore = enc.E.seats[0].score;
    const duHullMaxBought = enc.E.seats[0].hullMax;
    const duKillerScore = enc.E.seats[1].score;
    const duKillerOwned = enc.E.seats[1].owned.join(",");
    const duOrbsBefore = enc.E.orbs.length;
    const q6 = [];
    let duDeathTick = -1;
    let duAtDeath = null;
    let duRespawnSeen = false;
    // The loop outruns the respawn timer on purpose. `respawn` is a tunable the
    // owner moves by feel (180 → 600 ticks on 2026-08-18), so the respawn
    // checkpoint LOCATES ITSELF on the tick the seat comes back rather than
    // sitting on a hand-counted tick that a later retune silently walks past.
    for (let k = 0; k < 900; k++) {
      t.pushInputFrame(0, F({ cx: 1500, cy: 1400 }));            // parked, aiming away, never firing
      t.pushInputFrame(1, F({ cx: 1500, cy: 1800, fh: true }));  // held on seat 0
      duoStep();
      if (duDeathTick < 0 && enc.E.seats[0].hull <= 0) {
        duDeathTick = k;
        duAtDeath = { score: enc.E.seats[0].score, owned: enc.E.seats[0].owned.slice(),
                      hullMax: enc.E.seats[0].hullMax, seq: enc.E.seats[0].termSeq,
                      orbs: enc.E.orbs.length - duOrbsBefore };
        q6.push(cp("killed"));
      }
      if (duDeathTick >= 0 && !duRespawnSeen && enc.E.seats[0].hull > 0) {
        duRespawnSeen = true; q6.push(cp("respawned"));
      }
      if (k === 60) q6.push(cp("under-fire"));
    }
    q6.push(cp("end"));
    ok("pvp-duel: the victim's purchases were REAL before the kill — the reset has teeth",
       duScoreBefore >= 60 && duHullMaxBought > enc.cfg.player.hull &&
       enc.E.seats[0].owned !== duKillerOwned,
       JSON.stringify({ score: duScoreBefore, hullMax: duHullMaxBought }));
    ok("pvp-duel: a bullet from another seat killed it, and the whole toll landed at once",
       duDeathTick > 0 && !!duAtDeath && duAtDeath.score === 0 &&
       duAtDeath.owned.every((n) => n === 0) &&
       duAtDeath.hullMax === enc.cfg.player.hull &&
       duAtDeath.seq === duSeqBefore + 1 &&
       duAtDeath.orbs === enc.tunables().PVPORBS,
       JSON.stringify({ tick: duDeathTick, at: duAtDeath, want: enc.tunables().PVPORBS }));
    // the orbs are still ON THE FLOOR here: this killer shot from 180 px away
    // and nothing was in reach of them on the death tick. Q7's killer is 6 px
    // away and banks its own bounty the same tick — see there.
    ok("pvp-duel: the KILLER's own score and ranks never moved — a kill pays no bounty",
       enc.E.seats[1].score === duKillerScore && enc.E.seats[1].owned.join(",") === duKillerOwned,
       JSON.stringify({ score: enc.E.seats[1].score, owned: enc.E.seats[1].owned }));
    ok("pvp-duel: the score ordering flipped — the board's comparator now ranks the killer first",
       duScoreBefore > duKillerScore && enc.E.seats[0].score < enc.E.seats[1].score,
       JSON.stringify({ before: [duScoreBefore, duKillerScore],
                        after: [enc.E.seats[0].score, enc.E.seats[1].score] }));
    judge("pvp-duel", q6);

    // Q7. pvp-ram — the COMET ram against a player, and its PACING. Seat 0
    // burns the comet parked inside seat 1's disc; seat 1 is staged with
    // enough hull to survive the FIRST bite, so the trace pins the pair
    // window as well as the kill: one bite, a whole COMETCD of refusal, then
    // the bite that kills and collects the same toll Q6 collects. Both seats
    // are still — a ram that has to be steered would pin the steering, and
    // the steered ram is exactly what the morning may replace.
    duoPrep(1415);
    enc.E.groups = [];
    const rm0 = t.players[0];
    const rm1 = t.players[1];
    rm0.ship.x = 1500; rm0.ship.y = 1800; rm0.vel.x = 0; rm0.vel.y = 0;
    rm1.ship.x = 1506; rm1.ship.y = 1800; rm1.vel.x = 0; rm1.vel.y = 0; // inside SHIP_R * 2
    enc.E.seats[1].hull = 6; // survives one bite of COMETDMG, dies on the second
    enc.addXp(30, 1);
    enc.buy(enc.shopInfo().findIndex((r) => r.name === "AFTERBURNER"), 1);
    const rmSeqBefore = enc.E.seats[1].termSeq;
    const rmScoreBefore = enc.E.seats[1].score;
    const rmOrbsBefore = enc.E.orbs.length;
    const q7 = [];
    let rmFirstBite = -1;
    let rmDeathTick = -1;
    let rmBites = 0;
    let rmAtDeath = null;
    let rmHullWas = enc.E.seats[1].hull;
    let rmKillerGain = 0;
    let rmKillerScoreWas = enc.E.seats[0].score;
    let rmRespawnSeen = false;
    for (let k = 0; k < 800; k++) {   // outruns the respawn timer — see Q6's note
      t.pushInputFrame(0, F({ cx: 1506, cy: 1800, rh: 1 })); // the comet, held, parked
      t.pushInputFrame(1, F({ cx: 1500, cy: 1800 }));        // the victim, still, never firing
      duoStep();
      if (enc.E.seats[1].hull < rmHullWas) {
        rmBites++;
        if (rmFirstBite < 0) rmFirstBite = k;
        rmHullWas = enc.E.seats[1].hull;
      }
      if (rmDeathTick < 0 && enc.E.seats[1].hull <= 0) {
        rmDeathTick = k;
        // the bounty is measured through the KILLER's wallet, not through the
        // orb list: this attacker is 6 px away — it has to be, to be ramming —
        // so stepOrbs banks all PVPORBS orbs on the very tick they are dealt,
        // which is the "any living seat, the killer included" rule playing out
        // inside a fixture. Q6's killer shoots from 180 px and leaves them lying.
        rmKillerGain = enc.E.seats[0].score - rmKillerScoreWas;
        rmAtDeath = { score: enc.E.seats[1].score, owned: enc.E.seats[1].owned.slice(),
                      hullMax: enc.E.seats[1].hullMax, seq: enc.E.seats[1].termSeq,
                      orbs: enc.E.orbs.length - rmOrbsBefore, gain: rmKillerGain };
        q7.push(cp("ram-kill"));
      }
      if (rmDeathTick >= 0 && !rmRespawnSeen && enc.E.seats[1].hull > 0) {
        rmRespawnSeen = true; q7.push(cp("respawned"));
      }
      rmKillerScoreWas = enc.E.seats[0].score;
      if (k === 20) q7.push(cp("first-bite"));
      if (k === 50) q7.push(cp("window-held"));
    }
    q7.push(cp("end"));
    ok("pvp-ram: the ram bit exactly twice, one COMETCD window apart — the pair pacing holds",
       rmBites === 2 && rmFirstBite >= 0 && rmDeathTick - rmFirstBite === enc.tunables().COMETCD,
       JSON.stringify({ bites: rmBites, first: rmFirstBite, kill: rmDeathTick,
                        cd: enc.tunables().COMETCD }));
    ok("pvp-ram: a ram kill collects the SAME toll a bullet kill does",
       !!rmAtDeath && rmScoreBefore >= 30 && rmAtDeath.score === 0 &&
       rmAtDeath.owned.every((n) => n === 0) &&
       rmAtDeath.hullMax === enc.cfg.player.hull &&
       rmAtDeath.seq === rmSeqBefore + 1 &&
       rmAtDeath.gain === enc.tunables().PVPORBS,
       JSON.stringify({ at: rmAtDeath, scoreBefore: rmScoreBefore,
                        want: enc.tunables().PVPORBS }));
    ok("pvp-ram: the ramming killer banked its own bounty the same tick — a PvP orb is an ordinary orb",
       rmKillerGain === enc.tunables().PVPORBS && !!rmAtDeath && rmAtDeath.orbs === 0,
       JSON.stringify({ gain: rmKillerGain, at: rmAtDeath })); // the info arg
                       // evaluates EAGERLY, so it must survive a null capture too

    judge("pvp-ram", q7);

    // Q8. pvp-clash — COMET AGAINST COMET, the mutual no-op. Both seats burn
    // the comet inside one another's disc. Both sweeps run; each one reaches
    // the OTHER seat's negation branch inside hitPlayer, so neither hull
    // moves and each side bills its own COMETHIT — which ships at 0, so the
    // two pools stay equal and it is the PAIR STAMPS, hashed, that prove the
    // strikes happened at all. Nothing special-cases this: it falls out of
    // the gate order, and the trace is what holds that in place.
    duoPrep(1416);
    enc.E.groups = [];
    const cl0 = t.players[0];
    const cl1 = t.players[1];
    cl0.ship.x = 1500; cl0.ship.y = 1800; cl0.vel.x = 0; cl0.vel.y = 0;
    cl1.ship.x = 1506; cl1.ship.y = 1800; cl1.vel.x = 0; cl1.vel.y = 0;
    const clHulls = [enc.E.seats[0].hull, enc.E.seats[1].hull];
    const q8 = [];
    let clStamped = null;
    let clDry = null;
    for (let k = 0; k < 160; k++) {
      t.pushInputFrame(0, F({ cx: 1506, cy: 1800, rh: 1 }));
      t.pushInputFrame(1, F({ cx: 1500, cy: 1800, rh: 1 }));
      duoStep();
      if (k === 4) clStamped = { cd: enc.pvpCd(), c0: cl0.comet, c1: cl1.comet };
      if (k === 130) clDry = { c0: cl0.comet, c1: cl1.comet };
      if (k === 4) q8.push(cp("clash"));
      if (k === 130) q8.push(cp("dry"));
    }
    q8.push(cp("end"));
    ok("pvp-clash: both comets burned, and BOTH ordered pair windows were stamped",
       !!clStamped && clStamped.c0 === true && clStamped.c1 === true &&
       clStamped.cd["0:1"] > 0 && clStamped.cd["1:0"] > 0,
       JSON.stringify(clStamped));
    ok("pvp-clash: no hull moved on either side — the negation is mutual",
       enc.E.seats[0].hull === clHulls[0] && enc.E.seats[1].hull === clHulls[1],
       JSON.stringify({ now: [enc.E.seats[0].hull, enc.E.seats[1].hull], was: clHulls }));
    ok("pvp-clash: the pools stayed EQUAL — COMETHIT ships at 0, so only the timed drain shows",
       Math.abs(cl0.energy - cl1.energy) < 1e-9 && t.flightTunables().COMETHIT === 0,
       JSON.stringify({ e0: cl0.energy, e1: cl1.energy, COMETHIT: t.flightTunables().COMETHIT }));
    ok("pvp-clash: both comets starved on the timed drain and dropped together",
       !!clDry && clDry.c0 === false && clDry.c1 === false, JSON.stringify(clDry));
    judge("pvp-clash", q8);

    // ---- R. phase 15 — the fire-time rebate, vt-bearing traces -----------
    // Seat 1 is the SHOOTER throughout: a non-local seat's turret resolves
    // from its banked scur (seatFireDir), so its aim is exactly the frame's
    // cx,cy on BOTH drivers — the local seat's fireDir() reads the page
    // pointer and can never be a fixture. vt rides the same F() records the
    // other Q traces bank; every earlier trace omits it, which is the Δ=0
    // bridge these three stand on. The planted body is a CHARGER poked into
    // windup — a COMMITTED plant (50 ticks, range-blind) in a rewound-class
    // mode; a dart poked into tele re-seeks on range and records live-class
    // rows, which is why it cannot serve here. Era arithmetic note: segment
    // k of Δ sweeps age Δ+1−k, so the segment that CROSSES a target d px
    // out reads the era aged Δ − ceil(d/15) — every geometry below is built
    // against that line, not against "the vt era" alone.

    // R1. rebate-kill — a vt-bearing shot whose rebated sweep kills a body
    // that has MOVED AWAY from the swept era: the live sweep can never hit
    // it. Pins the bullet's ttl spend, the kill AT NOW (the orb drops at
    // the live pose, not the era one), and the rng stream's reshuffle
    // through reapDead's orb draw.
    duoPrep(1510);
    enc.E.groups = [];
    enc.E.seats[0].hull = 99;
    enc.E.seats[1].hull = 99;
    const rk0 = t.players[0];
    const rk1 = t.players[1];
    rk0.ship.x = 2600; rk0.ship.y = 2600; rk0.vel.x = 0; rk0.vel.y = 0; // parked far off the line
    rk1.ship.x = 1190; rk1.ship.y = 1000; rk1.vel.x = 0; rk1.vel.y = 0; // the shooter
    enc.spawnEnemy(1300, 1000, 0, "charger");
    const rkFoe = enc.E.enemies[enc.E.enemies.length - 1];
    rkFoe.mode = "windup"; // the committed plant — range-blind for 50 ticks
    rkFoe.t = 60; // windup COUNTS DOWN — the plant must outlive the window
    rkFoe.lockA = Math.PI / 2; // the eventual dash points at empty south — moot, it dies first
    rkFoe.hp = 1;              // one landed round is the kill this trace pins
    const qr1 = [];
    for (let k = 0; k < 12; k++) duoStep(); // twelve settled rows of the planted pose
    qr1.push(cp("history-built"));
    rkFoe.x = 1300; rkFoe.y = 1400; // the teleport away — duo-wave's idiom; the
                                    // live sweep can never hit y=1000 again
    const rkKillsWas = enc.state().kills;
    t.pushInputFrame(1, F({ cx: 2000, cy: 1000, fp: 1, vt: t.simTick() + 1 - 8 }));
    duoStep(); // Δ=8: the crossing segment reads age 2 — a planted-era row
    qr1.push(cp("rebate-kill"));
    const rkKilled = enc.state().kills === rkKillsWas + 1;
    const rkOrb = enc.E.orbs[enc.E.orbs.length - 1];
    ok("rebate-kill: the era sweep killed the moved-away body the live sweep cannot reach",
       rkKilled && enc.E.enemies.every((e) => e.id !== rkFoe.id),
       JSON.stringify({ killed: rkKilled, enemies: enc.E.enemies.length }));
    ok("rebate-kill: the orb dropped near the LIVE pose — damage and death are at NOW",
       !!rkOrb && Math.abs(rkOrb.x - 1300) < 60 && Math.abs(rkOrb.y - 1400) < 60,
       JSON.stringify(rkOrb));
    for (let k = 0; k < 20; k++) duoStep();
    qr1.push(cp("end"));
    judge("rebate-kill", qr1);

    // R2. pvp-rewind — the victim's history is a TELEPORT BAND: it parked ON
    // the fire line for a few ticks and OFF it otherwise, so exactly one era
    // band can be hit. A vt whose crossing segment reads an era INSIDE the
    // PVPREWIND cap (140 ms → 8 ticks) LANDS; a vt whose on-line band sits
    // BEYOND the cap has every player era clamped to age ≤ 8 — all off-line
    // — and MISSES: the shooter leads the remainder. Pins hull deltas and
    // both bullet fates. (Without the cap, shot B's age-14 era is on-line
    // and WOULD hit — the miss is the cap's own signature.)
    duoPrep(1511);
    enc.E.groups = [];
    enc.E.seats[0].hull = 99;
    enc.E.seats[1].hull = 99;
    const rw0 = t.players[0]; // the victim
    const rw1 = t.players[1]; // the shooter
    rw0.ship.x = 1400; rw0.ship.y = 1600; rw0.vel.x = 0; rw0.vel.y = 0; // OFF the y=1000 line
    rw1.ship.x = 2600; rw1.ship.y = 2600; rw1.vel.x = 0; rw1.vel.y = 0;
    const qr2 = [];
    const rwPark = (y, n) => { rw0.ship.x = 1400; rw0.ship.y = y; for (let k = 0; k < n; k++) duoStep(); };
    rwPark(1600, 30); // a settled off-line tail
    qr2.push(cp("staged"));
    // shot B — BEYOND the cap: the on-line band lands at ages 12..16
    rwPark(1000, 5);   // five on-line rows...
    rwPark(1600, 11);  // ...aged past the cap by eleven off-line ones
    rw1.ship.x = 1293; rw1.ship.y = 1000; rw1.vel.x = 0; rw1.vel.y = 0;
    t.pushInputFrame(1, F({ cx: 2000, cy: 1000, fp: 1, vt: t.simTick() + 1 - 20 }));
    duoStep(); // Δ=20; the crossing segment's age 14 clamps to 8 → off-line
    qr2.push(cp("beyond-cap-missed"));
    const rwShotB = t.G.bullets.find((b) => b.owner === 1);
    ok("pvp-rewind: the beyond-cap era clamps to the cap edge and the shot MISSES",
       enc.E.seats[0].hull === 99 && !!rwShotB && !rwShotB.dead,
       JSON.stringify({ hull: enc.E.seats[0].hull, bullet: rwShotB && { x: rwShotB.x, dead: rwShotB.dead } }));
    for (let k = 0; k < 30; k++) duoStep(); // the cooldown runs out, the field settles
    // shot A — INSIDE the cap: the on-line band lands at ages 4..7
    rwPark(1000, 4);
    rwPark(1600, 3);
    rw1.ship.x = 1342; rw1.ship.y = 1000; rw1.vel.x = 0; rw1.vel.y = 0;
    t.pushInputFrame(1, F({ cx: 2000, cy: 1000, fp: 1, vt: t.simTick() + 1 - 8 }));
    duoStep(); // Δ=8; the crossing segment reads age 5 — on-line, inside the cap
    qr2.push(cp("within-cap-landed"));
    ok("pvp-rewind: the within-cap era LANDS where the victim WAS — hull paid at NOW",
       enc.E.seats[0].hull === 98 && enc.E.seats[0].hitFlash > 0,
       JSON.stringify({ hull: enc.E.seats[0].hull, flash: enc.E.seats[0].hitFlash }));
    for (let k = 0; k < 20; k++) duoStep();
    qr2.push(cp("end"));
    judge("pvp-rewind", qr2);

    // R3. vt-clamp — the sim's own defense in depth: an ANCIENT vt clamps to
    // the ring's 21-tick edge (the kill still lands, at NOW, with the ttl
    // spend of the REAL advance), and a FUTURE vt clamps to a zero rebate —
    // an ordinary bullet. The server clamps upstream of these are
    // rewind.test.mjs's business; this trace pins the in-sim floor.
    duoPrep(1512);
    enc.E.groups = [];
    enc.E.seats[0].hull = 99;
    enc.E.seats[1].hull = 99;
    const vc0 = t.players[0];
    const vc1 = t.players[1];
    vc0.ship.x = 2600; vc0.ship.y = 2600; vc0.vel.x = 0; vc0.vel.y = 0;
    vc1.ship.x = 1000; vc1.ship.y = 1000; vc1.vel.x = 0; vc1.vel.y = 0;
    enc.spawnEnemy(1200, 1000, 0, "charger");
    const vcFoe = enc.E.enemies[enc.E.enemies.length - 1];
    vcFoe.mode = "windup";
    vcFoe.t = 60; // windup COUNTS DOWN — the plant must outlive the window
    vcFoe.lockA = Math.PI / 2;
    vcFoe.hp = 1;
    const qr3 = [];
    for (let k = 0; k < 26; k++) duoStep(); // the ring saturates at 22 rows
    qr3.push(cp("ring-full"));
    const vcKillsWas = enc.state().kills;
    t.pushInputFrame(1, F({ cx: 2000, cy: 1000, fp: 1, vt: t.simTick() + 1 - 500 })); // ancient
    duoStep(); // Δ clamps to 21; the planted body dies inside the advance
    qr3.push(cp("ancient-clamped"));
    ok("vt-clamp: the ancient claim clamped to the ring edge and the kill landed at NOW",
       enc.state().kills === vcKillsWas + 1,
       JSON.stringify({ kills: enc.state().kills, was: vcKillsWas }));
    for (let k = 0; k < 30; k++) duoStep(); // cooldown; the field is empty again
    t.pushInputFrame(1, F({ cx: 2000, cy: 1000, fp: 1, vt: t.simTick() + 1000 })); // the future
    duoStep();
    qr3.push(cp("future-zeroed"));
    const vcShot2 = t.G.bullets.find((b) => b.owner === 1 && !b.dead);
    ok("vt-clamp: a future claim earns a ZERO rebate — the bullet left the muzzle unadvanced",
       !!vcShot2 && Math.abs(vcShot2.x - (1000 + 15)) < 1e-9,
       JSON.stringify(vcShot2 && { x: vcShot2.x }));
    for (let k = 0; k < 20; k++) duoStep();
    qr3.push(cp("end"));
    judge("vt-clamp", qr3);

    // the score charter, live: credited where XP is credited, per seat, and
    // never taken back — a restart drains the wallet and keeps the score
    enc.addXp(5, 1);
    const s1Score = enc.E.seats[1].score;
    enc.restart();
    ok("a seat's score survives restart while its wallet resets",
       s1Score >= 5 && enc.E.seats[1].score === s1Score && enc.E.seats[1].xp === 0,
       JSON.stringify({ s1Score, after: enc.E.seats[1] }));

    t.setPlayerCount(1); // the page goes back to the human single-seat
    enc.restart();
  }

  // ---- restore the page for a human ----
  t.setInputMode(priorInput); // the page's own path and lag come back — the
  t.setInputLag(priorLag);    // suite pinned both for its own run only
  t.G.mouse.x = priorAimState.mouse.x; // section L seeded the pointer — put the
  t.G.mouse.y = priorAimState.mouse.y; // aim target back where the human left it
  t.G.mouse.seen = priorAimState.mouse.seen;
  t.G.aimed = priorAimed;
  t.setRightHeld(false);
  t.setInvert(priorInvert);
  t.setAimMode(priorAim);
  t.G.running = priorRunning;
  t.G.started = priorStarted;
  t.ui.syncMenu();
  enc.restart();
  t.render();

  const out = summary();
  if (capture) out.capture = { traces: captured };
  if (captureTick) { out.captureTick = window.__tickCapture; delete window.__tickCapture; }
  return out;
};
