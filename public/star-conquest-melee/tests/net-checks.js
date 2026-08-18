"use strict";

// Focused net-client regressions. The ordinary suite loads index.html without
// ?server=, so this helper temporarily installs a deterministic socket,
// re-evaluates the real classic net script under a server URL, then restores
// the local-client page before returning.
window.runNetChecks = async function () {
  const t = window.__test;
  const enc = t.enc;
  const R = [];
  const ok = (name, cond, info) => R.push({ name, pass: !!cond,
    info: info === undefined ? "" : String(info) });
  const wait = () => new Promise((resolve) => setTimeout(resolve, 0));

  const prior = {
    href: location.pathname + location.search + location.hash,
    historyState: history.state,
    Net: window.Net,
    WebSocket: window.WebSocket,
    input: t.inputState(),
    inputLagDisabled: document.getElementById("inputlag").disabled,
    playerCount: t.players.length,
    players: t.players.map((P) => ({
      ship: { ...P.ship }, vel: { ...P.vel }, flame: { ...P.flame },
      comet: P.comet, energy: P.energy, energyMax: P.energyMax,
      acc: { ...P.input.acc }, ring: P.input.ring.map((f) => ({ ...f })),
      scur: { ...P.input.scur }, fireHeld: P.input.fireHeld,
      cometWant: P.input.cometWant,
    })),
    bullets: t.G.bullets,
    fxBursts: t.fx.bursts.map((b) => ({ ...b })),
    fxCount: t.fx.count,
  };

  class FakeWebSocket {
    static instances = [];
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      this.listeners = new Map();
      FakeWebSocket.instances.push(this);
      setTimeout(() => {
        if (this.readyState !== 0) return;
        this.readyState = 1;
        this.emit("open", {});
      }, 0);
    }
    addEventListener(kind, fn) {
      if (!this.listeners.has(kind)) this.listeners.set(kind, []);
      this.listeners.get(kind).push(fn);
    }
    emit(kind, event) {
      for (const fn of this.listeners.get(kind) || []) fn(event);
    }
    send(data) { this.sent.push(data); }
    close(code = 1000) {
      if (this.readyState === 3) return;
      this.readyState = 3;
      this.emit("close", { code, reason: "" });
    }
  }
  FakeWebSocket.CONNECTING = 0;
  FakeWebSocket.OPEN = 1;
  FakeWebSocket.CLOSING = 2;
  FakeWebSocket.CLOSED = 3;

  const restorePlayers = () => {
    t.setPlayerCount(prior.playerCount);
    enc.restart();
    for (let i = 0; i < prior.players.length; i++) {
      const P = t.players[i];
      const saved = prior.players[i];
      Object.assign(P.ship, saved.ship);
      Object.assign(P.vel, saved.vel);
      Object.assign(P.flame, saved.flame);
      P.comet = saved.comet;
      P.energy = saved.energy;
      P.energyMax = saved.energyMax;
      Object.assign(P.input.acc, saved.acc);
      P.input.ring.splice(0, P.input.ring.length, ...saved.ring.map((f) => ({ ...f })));
      Object.assign(P.input.scur, saved.scur);
      P.input.fireHeld = saved.fireHeld;
      P.input.cometWant = saved.cometWant;
    }
    t.G.bullets = prior.bullets;
    t.fx.bursts.splice(0, t.fx.bursts.length, ...prior.fxBursts.map((b) => ({ ...b })));
    t.fx.count = prior.fxCount;
  };

  try {
    window.WebSocket = FakeWebSocket;
    history.replaceState(null, "", location.pathname + "?server=ws%3A%2F%2Fnet-check.invalid");
    const netSource = await fetch("js/net.js?t=" + Date.now()).then((res) => res.text());
    (0, eval)(netSource);
    await wait();

    const socket = FakeWebSocket.instances[0];
    ok("net proof uses the active production client over the deterministic socket",
      !!socket && Net.active() && Net.stats().open,
      socket ? JSON.stringify(Net.stats()) : "no socket");

    // ---- identity: the `you` message, before anything is sent -------------
    // A client with no grant sends NOTHING, so every input check below depends
    // on the identity arriving first — which is exactly the shipped order (the
    // server answers hello with `you`).
    const deliver = (msg) => socket.emit("message", { data: JSON.stringify(msg) });
    const MATCH = 7;
    t.pushInputFrame(0, { tx: 9, ty: 9, ax: 0, ay: 0, cx: 1, cy: 1, fp: 0, fh: false, kx: 0, ky: 0, rh: 0 });
    Net.clientTick();
    Net.flushInputs();
    ok("a client holds every frame back until its seat grant arrives",
      Net.stats().seat === null && Net.stats().sent === 0 &&
      socket.sent.every((raw) => !JSON.parse(raw).f),
      JSON.stringify({ stats: Net.stats(), sent: socket.sent }));
    deliver({ v: 6, tick: 0, you: { seat: 0, matchEpoch: MATCH, seatEpoch: 4 } });
    ok("the seat grant lands and localSeat() follows it",
      Net.seat() === 0 && t.localSeat() === 0 && Net.stats().matchEpoch === MATCH &&
      Net.stats().seatEpoch === 4 && Net.stats().youChanges === 1,
      JSON.stringify(Net.stats()));

    const frames = [
      { tx: 1, ty: -2, ax: 3, ay: -4, cx: 101, cy: 201, fp: 1, fh: false, kx: 0, ky: 1, rh: 0 },
      { tx: 2, ty: -3, ax: 4, ay: -5, cx: 102, cy: 202, fp: 0, fh: true,  kx: 1, ky: 0, rh: 1 },
      { tx: 3, ty: -4, ax: 5, ay: -6, cx: 103, cy: 203, fp: 2, fh: false, kx: -1, ky: 1, rh: 0 },
      { tx: 4, ty: -5, ax: 6, ay: -7, cx: 104, cy: 204, fp: 1, fh: true,  kx: 0, ky: -1, rh: 1 },
      { tx: 5, ty: -6, ax: 7, ay: -8, cx: 105, cy: 205, fp: 3, fh: false, kx: 1, ky: -1, rh: 0 },
    ];
    for (const frame of frames) {
      t.pushInputFrame(0, frame);
      Net.clientTick();
    }
    Net.flushInputs();
    const sentMsgs = socket.sent.map((raw) => JSON.parse(raw)).filter((m) => m.f);
    const sentFrames = sentMsgs.map((m) => m.f);
    ok("every outbound frame is sequenced from 1 and stamped with the seat epoch",
      sentMsgs.length === 2 && sentMsgs[0].n === 1 && sentMsgs[1].n === 2 &&
      sentMsgs.every((m) => m.e === 4),
      JSON.stringify(sentMsgs.map((m) => ({ n: m.n, e: m.e }))));
    ok("a five-tick animation-frame burst sends exactly two input records",
      sentFrames.length === 2, JSON.stringify(sentFrames));
    ok("the burst keeps its first tick untouched",
      sentFrames.length === 2 && Object.keys(frames[0]).every((key) => sentFrames[0][key] === frames[0][key]),
      JSON.stringify(sentFrames[0]));
    const sums = ["tx", "ty", "ax", "ay", "fp"];
    const totalsKept = sentFrames.length === 2 && sums.every((key) =>
      sentFrames.reduce((sum, f) => sum + f[key], 0) === frames.reduce((sum, f) => sum + f[key], 0));
    ok("coalescing adds every raw delta and fire-edge count without loss",
      totalsKept, JSON.stringify(sentFrames));
    const latest = ["cx", "cy", "fh", "kx", "ky", "rh"];
    ok("coalescing takes the newest absolute point and held states",
      sentFrames.length === 2 && latest.every((key) => sentFrames[1][key] === frames[4][key]),
      JSON.stringify(sentFrames[1]));

    // v4 shape: fl is the hit flash, ow the seat's PERSONAL rank vector (pr
    // died at v4 — prices derive from ow), vx/vy the wire velocity the
    // decoder now adopts, hm/em the v4 short keys, cool/enIdle the
    // prediction-plane fields — hud carries no shop table and no offers
    const player = (seat, tick, comet, energy) => ({
      seat, x: 100 + seat * 100 + tick - 100,
      y: 300 + seat * 10 + (tick - 100) * 2,
      vx: 1, vy: 2,
      fx: seat + tick - 100, fy: -seat - tick + 100,
      hull: 10, hm: 10, inv: 0, fl: 0, xp: 0, score: 0, rsp: 0,
      comet: comet ? 1 : 0, en: energy, em: 100,
      cool: 0, enIdle: 0,
      ow: enc.E.owned.map(() => 0),
    });
    const snapshot = (tick, count) => ({
      v: 6, tick, t: tick * 16.666, me: MATCH,
      players: Array.from({ length: count }, (_, seat) => player(seat, tick, seat === 1, seat === 1 ? 42 : 90)),
      enemies: [], bullets: [], missiles: [], orbs: [], groups: [],
      hud: { state: "play", wave: 1, waveTick: tick, clearTick: 0 },
      events: [],
    });

    Net.inject(snapshot(100, 2));
    Net.inject(snapshot(101, 2));
    Net.inject(snapshot(102, 2));
    Net.clientTick();
    const poseStats = Net.stats();
    const remote = t.players[1];
    // phase 12 RE-DERIVATION, not a survival. The remote ship interpolates with
    // HERMITE now, over the v4 wire velocities as tangents. Those velocities
    // are a BACKWARD difference, so on this stream — which moves the ship by
    // exactly (1, 2) per tick and reports vx/vy = (1, 2) — both tangents equal
    // the chord and the cubic collapses onto the straight line, term for term.
    // The old linear expectation is therefore still the RIGHT number, and it is
    // pinned here for exactly that reason: Hermite must not move a body that is
    // travelling straight. The curvature leg further down proves it moves one
    // that is not.
    ok("a presented two-seat snapshot grows the live player array and applies the remote pose",
      t.players.length === 2 && remote &&
      Math.abs(remote.ship.x - (200 + poseStats.pt - 100)) < 1e-9 &&
      Math.abs(remote.ship.y - (310 + (poseStats.pt - 100) * 2)) < 1e-9 &&
      remote.vel.x === 1 && remote.vel.y === 2,
      "players=" + t.players.length + " pt=" + poseStats.pt + " remote=" + JSON.stringify(remote && remote.ship));
    ok("the remote comet flag and energy pool come from the presented snapshot",
      remote && remote.comet === true && remote.energy === 42 && remote.energyMax === 100,
      remote ? JSON.stringify({ comet: remote.comet, energy: remote.energy, energyMax: remote.energyMax }) : "missing");

    let bounded = true;
    const tail = [];
    const starvedBefore = Net.stats().starved;
    for (let i = 0; i < 20; i++) {
      Net.clientTick();
      const stats = Net.stats();
      if (stats.pt > stats.newest + 2 + 1e-9) bounded = false;
      tail.push(stats.pt);
    }
    const starveStats = Net.stats();
    ok("a multi-snapshot gap never presents beyond the two-tick extrapolation cap",
      bounded, JSON.stringify({ tail, stats: starveStats }));
    ok("the starvation guard hard-holds at newest plus two ticks",
      tail.slice(-4).every((tick) => tick === starveStats.newest + 2),
      JSON.stringify(tail.slice(-6)));
    ok("the starvation cap linearly extrapolates the remote ship from the last two snapshots",
      remote.ship.x === 204 && remote.ship.y === 318 && remote.vel.x === 1 && remote.vel.y === 2,
      JSON.stringify({ pt: starveStats.pt, ship: remote.ship, vel: remote.vel }));
    // phase 12 REWRITE of the old `targetDepth === 3` pin. The depth is a live,
    // fractional target now, so the honest assertion is that it is a number
    // inside the declared band — the SLEW leg at the end of this file proves
    // how it moves. Three snapshots is far under the estimator's sample floor,
    // so the target must still be sitting on its start value here: that is the
    // "holds until something has been measured" half of the rule.
    ok("starvation telemetry counts the run and reports a target depth inside the band",
      starveStats.starved > starvedBefore && starveStats.starveLongest > 0 &&
      starveStats.targetDepth === 3 &&
      starveStats.targetDepth >= 1 && starveStats.targetDepth <= 6 &&
      starveStats.targetDepthWant === null &&
      Number.isFinite(starveStats.snapshotGapMs) && starveStats.snapshotGapMs >= 0 &&
      Number.isFinite(starveStats.snapshotGapP95Ms) && starveStats.snapshotGapP95Ms >= 0,
      JSON.stringify(starveStats));

    // ---- phase 15: the view-tick stamp --------------------------------------
    // the frames sent BEFORE any snapshot landed (the burst above) made no
    // view claim: pt was -1, and floor(-1) is not a view tick
    ok("pre-first-snapshot frames carry NO vt — a frame that starts the match claims nothing",
      sentFrames.length === 2 && sentFrames.every((f) => !("vt" in f)),
      JSON.stringify(sentFrames.map((f) => f.vt)));
    // ...and once a snapshot has presented, every upstream frame is stamped
    // with floor(pt) as it stood BEFORE this tick's present() — the tick the
    // LAST RENDERED frame showed
    {
      Net.flushInputs(); // drain any earlier tick's pending records first
      const vtSent0 = socket.sent.length;
      const ptBefore = Net.stats().pt;
      t.pushInputFrame(0, frames[0]);
      Net.clientTick();
      Net.flushInputs();
      const vtMsgs = socket.sent.slice(vtSent0).map((raw) => JSON.parse(raw)).filter((m) => m.f);
      ok("a post-snapshot frame is stamped vt = floor(pt) sampled before present() advances it",
        vtMsgs.length === 1 && vtMsgs[0].f.vt === Math.floor(ptBefore),
        JSON.stringify({ vt: vtMsgs[0] && vtMsgs[0].f.vt, pt: ptBefore }));
      // the coalescing fold keeps the NEWEST vt — the fh rule
      const vtSent1 = socket.sent.length;
      const ptA = Net.stats().pt;
      for (let i = 0; i < 3; i++) { t.pushInputFrame(0, frames[i]); Net.clientTick(); }
      Net.flushInputs();
      const vtMerged = socket.sent.slice(vtSent1).map((raw) => JSON.parse(raw)).filter((m) => m.f);
      ok("the coalesced tail record carries the NEWEST vt through the fold",
        vtMerged.length === 2 && Number.isInteger(vtMerged[1].f.vt) &&
        vtMerged[1].f.vt >= Math.floor(ptA),
        JSON.stringify(vtMerged.map((m) => m.f.vt)));
    }
    // the live-sweep pin: the sim's per-mode rewind table must equal the
    // project flags phase 12's client actually runs — read from the client's
    // own TEXT (the classic-script mirror rule), so a one-value flip in
    // ENEMY_POLICY (e.g. arming the dash projection) fails HERE until the
    // sim's table follows it
    {
      const netText = await fetch("js/net.js").then((r) => r.text());
      const polMatch = netText.match(/const ENEMY_POLICY = \{([\s\S]*?)\};/);
      const flags = {};
      if (polMatch) {
        for (const m of polMatch[1].matchAll(/(\w+):\s*\{[^}]*project:\s*(\d)/g)) {
          flags[m[1]] = Number(m[2]);
        }
      }
      const table = enc.LIVE_SWEEP;
      ok("the sim's LIVE_SWEEP table equals ENEMY_POLICY's project flags, mode for mode",
        !!polMatch && Object.keys(flags).length === Object.keys(table).length &&
        Object.keys(table).every((mode) => flags[mode] === table[mode]),
        JSON.stringify({ policy: flags, sim: table }));
    }

    // ---- the identity plane -------------------------------------------------
    // The camera, the marker, the flame and the HUD all read localSeat(); a
    // grant of seat 1 must therefore move every one of them onto the OTHER
    // ship without a single draw-site knowing the seat changed.
    deliver({ v: 6, tick: 120, you: { seat: 1, matchEpoch: MATCH, seatEpoch: 5 } });
    ok("a seat grant moves every LOCAL view read onto the granted ship",
      Net.seat() === 1 && t.localSeat() === 1 && t.localPlayer() === t.players[1],
      JSON.stringify({ seat: Net.seat(), local: t.localSeat(), same: t.localPlayer() === t.players[1] }));
    ok("the identity change tears the input state down and re-bases the sequence",
      Net.stats().ntick === 0 && Net.stats().ack === 0 && Net.stats().youChanges === 2,
      JSON.stringify(Net.stats()));

    // the phase-11 leak fix: a partial tick's ACCUMULATED deltas must not
    // survive an identity change into the next seat's first banked frame —
    // onYou clears the accumulator through clearTickInput now, not only the ring
    t.players[0].input.acc.tx = 7;
    t.players[0].input.acc.ay = -3;
    t.players[0].input.acc.fp = 2;
    deliver({ v: 6, tick: 121, you: { seat: 0, matchEpoch: MATCH, seatEpoch: 6 } });
    ok("an identity change clears the input ACCUMULATOR, not only the ring",
      t.players[0].input.acc.tx === 0 && t.players[0].input.acc.ay === 0 &&
      t.players[0].input.acc.fp === 0 && t.inputState(0).buffered === 0,
      JSON.stringify(t.inputState(0)));

    // the ack rides an envelope AROUND the shared encode — the client reads it
    // off the same message it decodes the snapshot from
    const acked = snapshot(200, 2);
    acked.a = 17;
    deliver(acked);
    ok("the per-socket ack is consumed off the snapshot envelope",
      Net.stats().ack === 17, JSON.stringify(Net.stats()));

    // a snapshot from another match is another run's state — it never lands
    const wrongEpoch = snapshot(201, 2);
    wrongEpoch.me = MATCH + 1;
    const dropsBefore = Net.stats().epochDrops;
    const newestBefore = Net.stats().newest;
    deliver(wrongEpoch);
    ok("a snapshot whose match epoch disagrees with `you` is discarded",
      Net.stats().epochDrops === dropsBefore + 1 && Net.stats().newest === newestBefore,
      JSON.stringify({ drops: Net.stats().epochDrops, newest: Net.stats().newest }));

    // app-level RTT: the server echoes the client's own timestamp verbatim
    deliver({ v: 6, pong: performance.now() - 40 });
    const rttStats = Net.stats();
    ok("the app-level ping produces an RTT estimate",
      rttStats.pongs === 1 && rttStats.rttMs >= 39 && rttStats.rttMs < 200 &&
      rttStats.rttMinMs >= 39,
      JSON.stringify({ pongs: rttStats.pongs, rtt: rttStats.rttMs, min: rttStats.rttMinMs }));

    // a spectator presents everything and sends nothing
    deliver({ v: 6, tick: 210, you: { seat: null, matchEpoch: MATCH } });
    const sentBefore = socket.sent.length;
    t.pushInputFrame(0, frames[0]);
    Net.clientTick();
    Net.flushInputs();
    ok("a spectator presents the match and sends no input at all",
      Net.seat() === null && t.localSeat() === 0 && socket.sent.length === sentBefore,
      JSON.stringify({ seat: Net.seat(), local: t.localSeat(), sent: socket.sent.length - sentBefore }));

    // back to a seat, so the shrink check below runs on a seated client
    deliver({ v: 6, tick: 220, you: { seat: 0, matchEpoch: MATCH, seatEpoch: 6 } });
    Net.inject(snapshot(300, 1)); // past the identity block's ticks — newest-wins
    for (let i = 0; i < 10 && t.players.length !== 1; i++) Net.clientTick();
    ok("presenting a one-seat snapshot shrinks away the stale remote ship",
      t.players.length === 1, "players=" + t.players.length + " pt=" + Net.stats().pt);

    // ---- the phase-11 own-ship predictor ------------------------------------
    Net.inject(snapshot(400, 1));
    Net.clientTick();
    const predView = Net.predicted();
    const own0 = t.players[0];
    ok("the predictor is live and the presented own pose IS the predicted pose",
      Net.stats().pred.on === true && !!predView &&
      own0.ship.x === predView.x && own0.ship.y === predView.y,
      JSON.stringify({ pred: Net.stats().pred, view: predView, ship: own0.ship }));
    // the correction is a RENDER offset and it decays between rebases —
    // whatever this synthetic stream's teleport-shaped rebase left in it
    const off0 = Net.stats().pred.offset;
    for (let i = 0; i < 10; i++) Net.clientTick();
    ok("the correction offset decays exponentially between rebases",
      Net.stats().pred.offset <= off0 * Math.pow(0.8, 9) + 1e-9,
      JSON.stringify({ before: off0, after: Net.stats().pred.offset }));
    // a banked fire press fires the SPECULATIVE cue: counted, drawn as a
    // tracer — and NEVER a bullet in G.bullets
    const bulletsBefore = t.G.bullets.length;
    const shown0 = Net.stats().spec.cueShown;
    t.players[0].input.acc.fp = 1; // the press, exactly as inputFire banks it
    Net.clientTick();
    ok("a banked press shows the speculative cue and spawns NO real bullet",
      Net.stats().spec.cueShown === shown0 + 1 && Net.tracers().length >= 1 &&
      t.G.bullets.length === bulletsBefore,
      JSON.stringify({ spec: Net.stats().spec, tracers: Net.tracers().length,
        bullets: t.G.bullets.length }));
    // ...and the modeled cooldown gates the NEXT press exactly as fire() would
    const shown1 = Net.stats().spec.cueShown;
    t.players[0].input.acc.fp = 1;
    Net.clientTick();
    ok("the predicted cooldown refuses the immediate second press — no cue",
      Net.stats().spec.cueShown === shown1 && Net.predicted().cool > 0,
      JSON.stringify({ spec: Net.stats().spec, cool: Net.predicted().cool }));
    // a death marker for the local seat parks the predictor: hard snap, the
    // ghost tracers cleared, the wire pose presented while the seat is down
    const dead = snapshot(410, 1);
    dead.players[0].rsp = 180;
    dead.events = [{ k: "death", seat: 0, x: 100, y: 300 }];
    Net.inject(dead);
    Net.clientTick();
    ok("a local death hard-snaps: the predictor idles and the tracers clear",
      Net.stats().pred.on === false && Net.tracers().length === 0,
      JSON.stringify(Net.stats().pred));
    // the respawn marker re-arms it from the dealt state, wholesale
    const back = snapshot(420, 1);
    back.events = [{ k: "respawn", seat: 0, x: 500, y: 600 }];
    Net.inject(back);
    Net.clientTick();
    ok("the respawn marker re-arms the predictor from authoritative state",
      Net.stats().pred.on === true && Net.stats().pred.offset === 0,
      JSON.stringify(Net.stats().pred));
    // a termChange is a TERMS cut, not a teleport: the offset drops HARD, the
    // predictor stays live, and the purchase's fill is ADOPTED — a client
    // never predicts a fill (the ENERGY CELL rule)
    const bought = snapshot(430, 1);
    const cellRow = enc.shopInfo().findIndex((r) => r.name === "ENERGY CELL");
    bought.players[0].ow = enc.E.owned.map((_, ri) => (ri === cellRow ? 1 : 0));
    bought.players[0].en = 140;
    bought.players[0].em = 140;
    bought.events = [{ k: "termChange", seat: 0, seq: 1 }];
    Net.inject(bought);
    Net.clientTick();
    ok("a termChange hard-drops the offset, keeps the predictor live, adopts the fill",
      Net.stats().pred.on === true && Net.stats().pred.offset === 0 &&
      Net.predicted().energyMax === 140 && Net.predicted().energy > 0,
      JSON.stringify({ pred: Net.stats().pred, view: Net.predicted() }));

    // ---- phase 14: a PvP death lands BOTH markers on one tick ---------------
    // The two markers have opposite hard halves — death is a wholesale snap
    // (the pose teleports), termChange is a terms cut that KEEPS the predictor
    // live — and until phase 14 nothing could emit them together. A PvP kill
    // does: hitPlayer's death branch calls resetSeatUpgrades, which emits its
    // marker, and hitPlayer (unlike restart) never eats the queue. The rule
    // this leg pins is that the STRONGER cut wins: the seat is down, so the
    // predictor parks whatever the terms marker asked for, and the reset ranks
    // are adopted from the wire rather than predicted through.
    const pvpDeath = snapshot(440, 1);
    pvpDeath.players[0].rsp = 180;
    pvpDeath.players[0].ow = enc.E.owned.map(() => 0); // ranks back to stock
    pvpDeath.players[0].score = 0; // ...and the score with them. The wire field is
                                   // `score` — the name server/snapshot.mjs writes and
                                   // js/net.js reads. An earlier draft set `sc`, which
                                   // neither side has ever looked at: a dead line that
                                   // happened to assert nothing because the factory
                                   // already ships score 0
    pvpDeath.events = [{ k: "termChange", seat: 0, seq: 2 },
                       { k: "death", seat: 0, x: 100, y: 300 }];
    Net.inject(pvpDeath);
    Net.clientTick();
    ok("a PvP death's termChange and death tear down together — the death cut wins, the tracers clear",
      Net.stats().pred.on === false && Net.tracers().length === 0,
      JSON.stringify({ pred: Net.stats().pred, tracers: Net.tracers().length }));
    // a parked predictor presents NOTHING — predicted() is null while pred.on
    // is false — which is the whole point of the cut: while the seat is down
    // the client shows authoritative state and only that
    ok("...and the parked predictor presents nothing at all while the seat is down",
      Net.predicted() === null, JSON.stringify({ predicted: Net.predicted() }));
    // the ORDER of the two markers inside one tick must not change the
    // outcome — a wire that queued them the other way tears down the same
    const pvpDeath2 = snapshot(450, 1);
    pvpDeath2.players[0].rsp = 180;
    pvpDeath2.players[0].ow = enc.E.owned.map(() => 0);
    pvpDeath2.events = [{ k: "death", seat: 0, x: 100, y: 300 },
                        { k: "termChange", seat: 0, seq: 3 }];
    Net.inject(pvpDeath2);
    Net.clientTick();
    ok("...and the two markers commute: either order tears the predictor down the same way",
      Net.stats().pred.on === false && Net.tracers().length === 0,
      JSON.stringify({ pred: Net.stats().pred, tracers: Net.tracers().length }));
    // the seat comes back and the predictor re-arms from the RESET terms —
    // proof the teardown left no bought rank behind in the client's model
    const pvpBack = snapshot(460, 1);
    pvpBack.players[0].ow = enc.E.owned.map(() => 0);
    pvpBack.events = [{ k: "respawn", seat: 0, x: 500, y: 600 }];
    Net.inject(pvpBack);
    Net.clientTick();
    ok("the victim re-arms from authoritative state after the PvP teardown",
      Net.stats().pred.on === true && Net.stats().pred.offset === 0,
      JSON.stringify({ pred: Net.stats().pred }));
    // ...and the PRESENTED seat record carries the reset through. The apply
    // rides the interpolation buffer, so this is read after the stream has
    // actually caught up rather than on the injection tick.
    //
    // The record is STAGED RICH first, and that is what makes the assertion
    // below mean anything. Asserting "score 0, ranks stock" against a record
    // that was already 0 and stock is satisfied just as well by a client that
    // never decoded either field — delete `S.score = pr.score` or
    // `S.owned = pr.ow.slice()` from js/net.js and the leg would still pass.
    // Poked to a live score and a live rank, it can only pass if the decode
    // really overwrote them. (Poked rather than injected: the presented clock
    // trails the newest snapshot by the interpolation lead plus the buffer,
    // so staging this through the wire would need ~60 extra ticks and would
    // walk the phase-12 legs below off the end of their own streams.)
    enc.E.seats[0].score = 640;
    enc.E.seats[0].owned[cellRow] = 2;
    for (let k = 0; k < 6; k++) {
      const settle = snapshot(470 + k, 1);
      settle.players[0].ow = enc.E.owned.map(() => 0);
      settle.players[0].score = 0;
      Net.inject(settle);
      Net.clientTick();
    }
    ok("the presented seat record carries the PvP reset through: ranks stock, score 0",
      enc.E.seats[0].owned.every((n) => n === 0) && enc.E.seats[0].score === 0,
      JSON.stringify({ owned: enc.E.seats[0].owned, score: enc.E.seats[0].score }));

    // ---- phase 12: the remote-presentation policy ---------------------------
    // Every leg below drives the DECODER at wire v5, so each enemy record
    // carries enum indices (ty/md) and a velocity, and each missile an age.
    const TY = ["dart", "harrier", "radarHarrier", "charger",
      "radarCharger", "husk", "anvil", "shard", "radarDart"];
    const MD = ["seek", "tele", "pulse", "lockon", "windup", "dash", "tired"];
    const foe = (over) => ({ id: 1, ty: TY.indexOf("dart"), x: 1000, y: 1000,
      vx: 0, vy: 0, md: MD.indexOf("seek"), t: 0, face: 0, lk: 0, fl: 0, ...over });
    const withFoes = (tick, enemies) => {
      const s = snapshot(tick, 1);
      s.enemies = enemies;
      return s;
    };
    // Drive a RAMP, not a pair. The presented clock is fractional and slews, so
    // a leg that injects exactly two snapshots and hopes the clock lands
    // between them is testing the harness, not the client — it can land past
    // `newest` and read the starvation branch instead. Every ramp below repeats
    // the SAME shape at every step, so whichever bracket the clock settles in
    // carries the property under test; the leg then reads the presented tick
    // back and derives its expectation from the pair the client actually used.
    const RAMP = 14;
    const rampPresent = (tick, make) => {
      const recs = [];
      for (let i = 0; i < RAMP; i++) {
        const e = make(i);
        recs.push(e);
        Net.inject(withFoes(tick + i, [e]));
      }
      // one snapshot per presented tick keeps the clock fed, so it never
      // reaches the starvation branch; a few ticks of slew put it at a
      // FRACTIONAL point inside a bracket rather than exactly on a snapshot
      let next = tick + RAMP;
      for (let i = 0; i < 6; i++) {
        const e = make(RAMP + i);
        recs.push(e);
        Net.inject(withFoes(next++, [e]));
        Net.clientTick();
      }
      const pt = Net.stats().pt;
      const i0 = Math.floor(pt) - tick;
      return { body: enc.E.enemies.find((x) => x.id === 1) || null,
        pt, i0, k: pt - Math.floor(pt),
        a: recs[i0] || null, b: recs[i0 + 1] || null,
        inRange: i0 >= 0 && i0 + 1 < recs.length };
    };

    // 1. HERMITE CURVATURE. The wire velocities disagree with the chord here —
    // the body arrives at s1 moving straight down while the chord runs
    // diagonally — so the cubic must bend away from the straight line by
    // exactly its own basis, and the lerp answer must be WRONG.
    {
      // the ramp walks x by a steady 2 px a tick while REPORTING a velocity of
      // (0, 2) — a body whose chord and whose tangents disagree. The dart
      // ceiling at this wave is well above 2, so the guard never touches it.
      // The mode is `tele`, whose projection gain is 0, so this leg reads the
      // INTERPOLATOR alone: the projection has its own legs below and would
      // otherwise add a lead term to every expectation here.
      const make = (i) => foe({ x: 1000 + 2 * i, y: 1000, vx: 0, vy: 2,
        md: MD.indexOf("tele"), t: 30 });
      const { body, k, a, b, inRange } = rampPresent(500, make);
      const H = (p0, v0, p1, v1) => {
        const k2 = k * k, k3 = k2 * k;
        return (2 * k3 - 3 * k2 + 1) * p0 + (k3 - 2 * k2 + k) * v0
          + (-2 * k3 + 3 * k2) * p1 + (k3 - k2) * v1;
      };
      const hx = inRange ? H(a.x, a.vx, b.x, b.vx) : null;
      const hy = inRange ? H(a.y, a.vy, b.y, b.vy) : null;
      const lx = inRange ? a.x + (b.x - a.x) * k : null;
      ok("a turning body presents on the HERMITE curve, not the chord",
        inRange && !!body && Math.abs(body.x - hx) < 1e-9 &&
        Math.abs(body.y - hy) < 1e-9 &&
        (k < 1e-9 || Math.abs(body.x - lx) > 1e-9),
        JSON.stringify({ k, inRange, got: body && { x: body.x, y: body.y },
          hermite: { x: hx, y: hy }, lerp: lx }));
    }

    // 2. BOUNDARY-HOLD. A mode change between the brackets is a discontinuity:
    // pose, countdown and facing all hold at s0 for the whole bracket. The old
    // client lerped all three, which manufactured countdown values the sim
    // never held and slid the body into a mode it had not been dealt.
    {
      // the mode ALTERNATES every tick, so every bracket in the ramp is a
      // boundary and the assertion holds whichever one the clock settles in —
      // and it holds for a fractional k, which is exactly where the old lerp
      // manufactured its phantom countdowns and its phantom lunge.
      const make = (i) => foe(i % 2
        ? { x: 2000 + 3 * i, y: 2000, vx: 3, vy: 0, md: MD.indexOf("dash"),
          t: 26, face: 1, lk: 1 }
        : { x: 2000 + 3 * i, y: 2000, vx: 3, vy: 0, md: MD.indexOf("windup"),
          t: 1, face: 0, lk: 0 });
      const { body, k, a, inRange } = rampPresent(560, make);
      ok("a mode change HOLDS pose, countdown and facing at s0 — nothing lerps across it",
        inRange && !!body && k > 1e-9 &&
        body.x === a.x && body.y === a.y && body.t === a.t &&
        body.face === a.face && body.lockA === a.lk &&
        body.mode === MD[a.md],
        JSON.stringify({ k, inRange, want: a && { x: a.x, t: a.t, md: MD[a.md] },
          got: body && { x: body.x, y: body.y, t: body.t, face: body.face,
            mode: body.mode } }));
    }

    // 2b. ...and the PROJECTION obeys the same boundary. `seek` is the one mode
    // with a projection gain, so a seek body straddling a mode change is the
    // case that matters: the client must present it at its s0 pose EXACTLY,
    // with no lead at all, rather than flying it into a mode the server has not
    // dealt yet. The velocity here is large enough that any surviving lead
    // would be unmistakable.
    {
      const make = (i) => foe(i % 2
        ? { x: 3000 + 4 * i, y: 3000, vx: 4, vy: 0, md: MD.indexOf("tele"), t: 30 }
        : { x: 3000 + 4 * i, y: 3000, vx: 4, vy: 0, md: MD.indexOf("seek"), t: 0 });
      const { body, a, inRange } = rampPresent(600, make);
      ok("a projected mode does NOT lead across a boundary — the hold wins",
        inRange && !!body && Net.stats().leadTicks > 0 &&
        body.x === a.x && body.y === a.y,
        JSON.stringify({ lead: Net.stats().leadTicks,
          want: a && { x: a.x, y: a.y, md: MD[a.md] },
          got: body && { x: body.x, y: body.y, mode: body.mode } }));
    }

    // 2c. THE COUNTDOWN BOUND — the mechanism a dash projection would rely on.
    // `dash` ships with its gain at 0 (it measured 33.5 px, over the bar), so
    // the bound cannot be exercised through it; and it is INERT on `seek`,
    // because a seeking body never carries a live countdown. The wire can carry
    // one anyway, so this leg feeds a seek body t = 2 and asserts the lead is
    // clamped to those two ticks instead of the full measured horizon. That is
    // the exact clamp a lunge needs, tested on the one path that is live.
    {
      const V = 3; // px/tick, under the dart ceiling so the guard stays out
      // mid-field on purpose: the wall clamp is the NEXT leg's business, and a
      // body parked outside the world would be pinned by it before the
      // countdown bound ever showed
      // the ramp MOVES at V and reports V, so chord and tangents agree and the
      // Hermite term collapses onto the straight line. A stationary ramp that
      // still reported a velocity would be self-contradictory, and the cubic
      // would answer with a bulge that has nothing to do with the bound.
      const make = (i) => foe({ x: 1000 + V * i, y: 1000, vx: V, vy: 0, t: 2 });
      const { body, k, a, inRange } = rampPresent(680, make);
      const lead = Net.stats().leadTicks;
      // interpolated pose is a.x + V*k exactly; everything past it is the lead
      const applied = inRange && body ? (body.x - (a.x + V * k)) / V : null;
      ok("a counting-down mode clamps the projection to its REMAINING ticks",
        inRange && !!body && lead > 2 &&
        Math.abs(applied - 2) < 1e-6,
        JSON.stringify({ lead, appliedTicks: applied, wantTicks: 2,
          got: body && body.x, base: a && a.x }));
    }

    // 2d. THE WALL. A projection may never slide a body through the boundary
    // the sim clamps it against. This leg drives a seek body at the right wall
    // with a velocity that WOULD carry it past, and asserts it stops exactly on
    // the clamp the sim itself uses (WW − r).
    {
      const V = 4; // px/tick, under the dart ceiling
      const startX = t.WW - 20;
      const make = () => foe({ x: startX, y: 1000, vx: V, vy: 0 });
      const { body, inRange } = rampPresent(700, make);
      const lead = Net.stats().leadTicks;
      const wall = t.WW - (body ? body.r : 0);
      ok("a projection stops at the WALL instead of sliding through it",
        inRange && !!body && lead > 0 &&
        startX + V * lead > wall && // the lead really did aim past it
        Math.abs(body.x - wall) < 1e-9,
        JSON.stringify({ lead, got: body && body.x, wall,
          unclamped: startX + V * lead }));
    }

    // 3. OVERSHOOT GUARD. A velocity the class cannot reach may not move a
    // presented body. The guard clamps the WIRE VELOCITY before it reaches the
    // Hermite tangent, so the presented pose stays inside the bracket's own
    // neighbourhood however large the spike is.
    {
      // deliberately on `seek`, the ONE projected mode: the guard has to bound
      // the lead as well as the Hermite tangent, and a spike that survived into
      // the projection would be multiplied by the whole presentation horizon.
      const SPIKE = 5000; // px/tick — a dart cannot approach this at any wave
      const make = (i) => foe({ x: 1500 + i, y: 1500, vx: SPIKE, vy: SPIKE });
      const { body, a, inRange } = rampPresent(740, make);
      // the dart ceiling is max(maxSpeed, backSpeed) at this wave and the
      // guard's slack is 1.25. The clamped velocity feeds one tick of bracket
      // plus `leadTicks` of projection, and the client publishes that horizon,
      // so the bound is EXACT rather than generous. An unguarded spike would
      // put this body tens of thousands of pixels away.
      const st = enc.statsFor(1).dart;
      const cap = Math.max(st.maxSpeed, st.backSpeed) * 1.25;
      const lead = Net.stats().leadTicks;
      const bound = cap * (1 + lead) + 1e-6;
      ok("the overshoot guard refuses a synthetic velocity spike, lead included",
        inRange && !!body && lead > 0 &&
        Math.abs(body.x - a.x) <= bound && Math.abs(body.y - a.y) <= bound,
        JSON.stringify({ got: body && { x: body.x, y: body.y },
          want: a && { x: a.x, y: a.y }, bound, lead, cap, spike: SPIKE }));
    }

    // 3b. THE ENEMY TAB IS NET-LOCKED. The overshoot guard's per-class ceiling
    // comes from the client's own statsFor(), which reads the enemy tunables —
    // so a net client that could drag `maxSpeed` would be dragging the guard
    // against a server running file defaults. That tab is GENERATED, not
    // authored: it never went through bind(), so it never inherited the
    // phase-11 flight lock and was open until phase 12. Its rows register
    // themselves in NET_LOCKED_IDS as they are built and carry their own gate.
    {
      t.ui.setDevTab("enemies"); // the lazy build seam — same one openDev() uses
      const input = document.getElementById("enemy-maxSpeed")
        || document.querySelector('#enemies-body input[id^="enemy-"]');
      const before = input ? Number(input.value) : null;
      let refused = null, live = null;
      if (input) {
        const bumped = before + Number(input.step || 1);
        input.value = String(bumped);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        // the gate writes the TRUTH back over the thumb and changes nothing
        refused = Number(input.value) === before;
        live = Encounter.tuning.groups.flatMap((g) => g.rows)
          .find((r) => "enemy-" + r.id === input.id);
        refused = refused && live && live.get() === before;
      }
      ok("a net client cannot drag the generated ENEMY tab — the guard's own constants",
        !!input && refused === true,
        JSON.stringify({ id: input && input.id, before,
          after: input && Number(input.value),
          model: live ? live.get() : null }));
      // ...and the lock covers the whole generated tab, not one lucky row
      const rows = Array.from(document.querySelectorAll('#enemies-body input[id^="enemy-"]'));
      ok("every generated enemy row is in the locked id set",
        rows.length > 0 && rows.every((el) => t.netLockedIds().has(el.id)),
        JSON.stringify({ rows: rows.length,
          missing: rows.filter((el) => !t.netLockedIds().has(el.id)).map((el) => el.id) }));
    }

    // 4. ADAPTIVE-DEPTH SLEW. Thirty accepted arrivals is the estimator's
    // sample floor; these land back to back, so the measured arrival gap is
    // ~0 ms and the wanted depth is the floor of 1. The target must WALK there
    // — bounded, monotone, and slowly enough that no single frame jumps it.
    {
      let tick = 820;
      for (let i = 0; i < 45; i++) Net.inject(snapshot(tick++, 1));
      Net.clientTick();
      const want = Net.stats().targetDepthWant;
      const walk = [];
      let bounded = true, monotone = true;
      let prev = Net.stats().targetDepth;
      for (let i = 0; i < 120; i++) {
        Net.inject(snapshot(tick++, 1));
        Net.clientTick();
        const d = Net.stats().targetDepth;
        if (!(d >= 1 && d <= 6)) bounded = false;
        if (d > prev + 1e-9) monotone = false;      // it may never walk backwards
        if (prev - d > 0.011) monotone = false;      // ...nor jump a whole step
        prev = d;
        walk.push(+d.toFixed(3));
      }
      ok("the adaptive depth measures a want of 1 on a jitter-free stream",
        want === 1, JSON.stringify({ want, jitter: Net.stats().jitterP95Ms }));
      ok("the adaptive depth SLEWS toward its want — bounded to [1,6], monotone, no jump",
        bounded && monotone && prev < 3 && prev > 1,
        JSON.stringify({ first: walk[0], last: prev, bounded, monotone,
          steps: walk.length }));
    }
  } catch (error) {
    ok("net regression setup and execution completes", false, error && (error.stack || error.message || error));
  } finally {
    try { if (window.Net && window.Net.active && window.Net.active()) window.Net.close(); } catch { /* restore below */ }
    const banner = document.getElementById("netbanner");
    if (banner) banner.remove();
    window.Net = prior.Net;
    window.WebSocket = prior.WebSocket;
    history.replaceState(prior.historyState, "", prior.href);
    t.setInputMode(prior.input.INPUTMODE);
    t.setInputLag(prior.input.INPUTLAG);
    document.getElementById("inputlag").disabled = prior.inputLagDisabled;
    restorePlayers();
  }

  const failed = R.filter((r) => !r.pass);
  return { total: R.length, passed: R.length - failed.length, failed, results: R };
};
