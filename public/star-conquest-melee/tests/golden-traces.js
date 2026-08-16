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
  // Section A dispatches REAL mousemoves: the shipped default banks them for
  // the next tick (tick mode) and steers a drawn cursor with them (locked aim
  // mode), where the fixtures captured them applied on arrival as thrust. Every
  // trace below restates its own mode; this is the state they all start from.
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
    ok("...and moves ONLY the ship part", p1.bullets === p0.bullets && p1.cam === p0.cam &&
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
    rng: enc.rngState(),
    st: (() => { const s = enc.state(); return { state: s.state, wave: s.wave, kills: s.kills, xp: s.xp, hull: s.hull, enemies: s.enemies, orbs: s.orbs }; })(),
  });
  // pure-flight setup: nothing spawns, no rand() is drawn, right-held mouse
  // flight is the thrust path — the flag only, the RAF loop never starts here
  const flightPrep = (mode) => {
    enc.reset();
    enc.E.groups = [];
    t.G.started = true;
    t.G.running = true;
    t.setAimMode("mouse");
    t.setInputMode(mode || "event"); // each fixture set pins ONE input path,
                                     // never the page default, which ships "tick"
    t.setInvert(true);
    t.setRightHeld(true);
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
  // The sweep stops when the wave leaves the fight states, so the shop's
  // frozen ticks accumulate no ghost bullets. ONE loop, shared with the
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
  t.G.started = true;
  t.G.running = true;
  // The wave traces take no mouse input, but they still inherit the flight
  // sections' aim state, and the camera's lead gate is hashed. State it:
  // the mode, the input path, and the right-held mouse flight E left behind —
  // setAimMode clears rightHeld, so the restate has to follow it.
  t.setAimMode("mouse");
  t.setInputMode("event");
  t.setInvert(true);
  t.setRightHeld(true);
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
  enc.E.groups = [];
  enc.E.hull = 99;
  t.G.started = true;
  t.G.running = true;
  t.setAimMode("mouse");
  t.setInputMode("event");
  t.setInvert(true);
  t.setRightHeld(true);
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
    t.setAimMode("mouse");
    t.setInvert(true);
    t.setRightHeld(true);
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
