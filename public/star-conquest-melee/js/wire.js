// js/wire.js — THE WIRE. ONE SOURCE (R7 / R0.3).
//
// WHAT THIS FILE IS. Before R7 the wire lived in five places at once: an
// encoder in server/snapshot.mjs, a decoder in js/net.js, two enum tables
// mirrored by hand across that boundary, a version number mirrored by hand in
// four more files, and three tools that hand-wrote it inline. Every one of
// those mirrors was a "MUST" in a comment with nothing enforcing it, and the
// failure mode was SILENT on both ends — a stale `v` is dropped without a log,
// and a short enum decodes every unknown body as a dart. R0.3 ends that: the
// version, the schema, the enum tables and the codec are declared HERE, once,
// and both hosts load THIS file.
//
// HOW BOTH HOSTS LOAD IT. This is a CLASSIC script, not a module, on the
// precedent of test/tools/demo-serial.js — the browser takes it by <script>
// tag (index.html, ABOVE js/net.js) and Node takes it by createRequire from
// server/snapshot.mjs. The tail below carries BOTH guards, demo-serial's own
// shape. It is deliberately NOT a SIM_FILES member: it runs no sim, and adding
// it would change server/sim-host.mjs's vm file set and the boot self-check.
// One consequence that is easy to miss and is paid for in server/deploy.sh:
// the VPS's js/ file set is derived from SIM_FILES alone, so a non-member has
// to be named there BY HAND or the release boots without its codec.
//
// WHAT MAY NEVER APPEAR IN THIS FILE. A bit width written as a literal. Every
// width is a FORMULA over the geometry or the range it encodes (R1.2), so a
// world that grows re-derives its own widths instead of silently truncating.
// A source-text leg in test/node-golden.mjs reads this file and reds on a bare
// integer in the BITS block; the value comparison beside it would not catch it,
// because ceil(log2(7680)) IS 13 and `13 === 13` is a leg that cannot fail.
const Wire = (() => {
  "use strict";

  // ---- the version -------------------------------------------------------
  // v11 is ONE bump carrying the binary codec AND the additive key set
  // together (R0.1). The JSON wire had 0 B of honest headroom, so a key-set
  // bump followed by a codec bump would have moved the band twice and
  // re-authored the JSON estate twice. server/snapshot.mjs re-exports this as
  // SNAPSHOT_VERSION and server/server.js as PROTOCOL_VERSION; js/net.js reads
  // it directly. NOTHING mirrors it.
  const VERSION = 11;

  // ---- the world, and the widths derived from it -------------------------
  // MIRRORED AS ARITHMETIC from js/game.js:74-77, never as the products: this
  // file is loaded by createRequire, outside the vm where game.js's globals
  // live, so it cannot read them. server/snapshot.test.mjs's "the derived
  // position widths" leg reads game.js's OWN SOURCE and asserts the two pairs
  // agree, so a room count that moves in one file and not the other reds by
  // name. (test/node-golden.mjs's world-size pin covers game.js's side ALONE —
  // it names neither WORLD_W nor WORLD_H and cannot see this file at all.)
  const FW = 1280;              // js/game.js:74 — the viewport, not the world
  const FH = 720;               // js/game.js:75
  const WORLD_W = FW * 6;       // js/game.js:76 — 6 rooms across
  const WORLD_H = FH * 11;      // js/game.js:77 — 11 rooms down

  // the one width rule: how many bits an unsigned span needs at 1 unit of
  // quantum. Written as a function so no caller can be tempted by the answer.
  const bits = (span) => Math.ceil(Math.log2(span));

  // THE BIT WIDTHS. Not one integer literal below is a width — the two that
  // appear (9 for a heading, 8 for an aura radius) are QUANTUM COUNTS with
  // their arithmetic stated, and the source-text pin allows them by name.
  const BITS = {
    // position, at a 1 px quantum. ceil(log2(7680)) = 13, ceil(log2(7920)) = 13
    x: bits(WORLD_W),
    y: bits(WORLD_H),
    // heading, 9 bits over [0, 2pi): step = 2pi/512 = 0.012272 rad = 0.7031 deg
    hd: 9,
    // the comet aura radius, 8 bits at a 1 px quantum -> domain 0..255 px.
    // auraRadiusOf(1) = SHIP_R + COMETAOE + COMETAOEDMG = 67.5 px at 9f33672.
    auraR: 8,
    // an event's direction takes the heading quantum; its radius takes 12 bits
    // at 1 px (0..4095), above both D22's interest radius (the server's
    // `INTEREST_R = Math.max(PLAY_W, PLAY_H) * 1.2`) and the 1280 station ray.
    //   THE NUMBER IS GONE FROM THIS SENTENCE ON PURPOSE (r7c FIX F9). It used
    // to spell the radius out, and that spelling was the ONE arithmetic result
    // of the interest formula anywhere in `js/` — which made three separate
    // comments in `server/` claiming none exists FALSE, and would go stale the
    // day PLAY_W moves. The radius is a FORMULA over the play box on BOTH sides
    // of the wire (client `js/encounter.js:interestR()`, server `INTEREST_R`);
    // naming the formula keeps this comparison true whatever the box becomes.
    // `server/snapshot.test.mjs` has the source-text leg that holds this.
    dir: 9,
    R: 12,
  };

  // velocity, at a 1/32 px/tick quantum in a signed 16-bit field: the domain is
  // +/- 2^15 / 32 = +/- 1024 px/tick. The headroom is stated as a formula over
  // js/game.js's own constants rather than as a number, because PORT-F and
  // PORT-P move them and this file must not carry either value:
  //   headroom in ranks = (1024 / COMETVMAX - VMAX) / 2.5
  // At 9f33672 that is (1024 / 3.6735 - 4.0833) / 2.5 = 109.9 ranks. The comet
  // multiplier is NOT optional — js/game.js:1753's `K.comet ? vcap * COMETVMAX
  // : vcap` is the clamp the sim actually applies, and omitting it overstates
  // the headroom 3.67x. The kernel's fastest round is kineticLance at 720 px/s
  // = 12 px/tick, two orders inside the same domain, so ONE quantum serves both
  // planes.
  const VEL_Q = 1 / 32;


  // ---- the clamp counters ------------------------------------------------
  // R1.2's POLICY, in one place: a value past its field's domain is CLAMPED and
  // COUNTED, never thrown. AFTERBURNER is uncapped, so a velocity domain is a
  // policy rather than a proof, and a throw on a live stream would take the room
  // down for a number that is only ever cosmetic by the time it is that large.
  // the server publishes these under its metrics prefix.
  const clamps = { vel: 0, pos: 0, hp: 0, timer: 0, radius: 0, event: 0, str: 0 };

  // ---- the bit writer and reader -----------------------------------------
  // MSB-first within each byte. Nothing here is a schema decision; it is the
  // one place a width is spent, so every width the schema declares is spent the
  // same way and the reader is the writer read backwards.
  function Writer() {
    let buf = new Uint8Array(2048);
    let n = 0;          // whole bytes written
    let acc = 0, nb = 0; // pending bits
    const grow = (need) => {
      if (n + need <= buf.length) return;
      let cap = buf.length * 2;
      while (cap < n + need) cap *= 2;
      const nx = new Uint8Array(cap); nx.set(buf.subarray(0, n)); buf = nx;
    };
    const put = (v, bits) => {
      v = v >>> 0;
      while (bits > 0) {
        const take = Math.min(8 - nb, bits);
        acc = ((acc << take) | ((v >>> (bits - take)) & ((1 << take) - 1))) & 0xff;
        nb += take; bits -= take;
        if (nb === 8) { grow(1); buf[n++] = acc; acc = 0; nb = 0; }
      }
    };
    const align = () => { if (nb) { grow(1); buf[n++] = (acc << (8 - nb)) & 0xff; acc = 0; nb = 0; } };
    return {
      put, align,
      f64(v) { align(); grow(8); new DataView(buf.buffer, buf.byteOffset + n, 8).setFloat64(0, v, false); n += 8; },
      bytes() { align(); return buf.slice(0, n); },
    };
  }
  function Reader(u8) {
    let n = 0, acc = 0, nb = 0;
    const take = (bits) => {
      let out = 0;
      while (bits > 0) {
        if (nb === 0) { acc = n < u8.length ? u8[n++] : 0; nb = 8; }
        const t = Math.min(nb, bits);
        out = (out * (1 << t)) + ((acc >>> (nb - t)) & ((1 << t) - 1));
        nb -= t; bits -= t;
      }
      return out;
    };
    const align = () => { nb = 0; };
    return {
      take, align,
      f64() { align(); const v = new DataView(u8.buffer, u8.byteOffset + n, 8).getFloat64(0, false); n += 8; return v; },
      at() { align(); return n; },
    };
  }

  // ---- the field vocabulary ----------------------------------------------
  // Ten schema entries (R1.1): eight compiled ARRAY rows, the `hud` singleton
  // and the envelope frame. A field is a {k, ...} descriptor and NOTHING in a
  // row spells a width twice.
  const U = (b) => ({ k: "u", bits: b });
  const Q = (b, q) => ({ k: "q", bits: b, q });     // unsigned, quantized
  const QS = (b, q) => ({ k: "qs", bits: b, q });   // signed, quantized
  const FLAG = { k: "flag" };
  const F64 = { k: "f64" };
  const STR = (max) => ({ k: "str", max });
  const VEC = (el, lenBits) => ({ k: "vec", el, lenBits });
  // an angle over [0, 2pi) at the heading quantum — 2pi/2^BITS.hd
  const ANGLE = { k: "angle", bits: BITS.hd };
  const opt = (f, zeroFold) => ({ ...f, opt: true, zeroFold: !!zeroFold });

  const TAU = Math.PI * 2;

  const clampCount = (v, lo, hi, bucket) => {
    if (v < lo) { clamps[bucket] += 1; return lo; }
    if (v > hi) { clamps[bucket] += 1; return hi; }
    return v;
  };
  const bucketOf = (f) => (f.k === "qs" ? "vel" : f.k === "q" ? "pos" : "hp");

  function putField(w, f, v) {
    switch (f.k) {
      case "flag": w.put(v ? 1 : 0, 1); return;
      case "f64": w.f64(Number(v) || 0); return;
      case "u": {
        const hi = Math.pow(2, f.bits) - 1;
        w.put(clampCount(Math.round(Number(v) || 0), 0, hi, "hp"), f.bits); return;
      }
      case "q": {
        const hi = Math.pow(2, f.bits) - 1;
        w.put(clampCount(Math.round((Number(v) || 0) / f.q), 0, hi, bucketOf(f)), f.bits); return;
      }
      case "qs": {
        const half = Math.pow(2, f.bits - 1);
        const raw = clampCount(Math.round((Number(v) || 0) / f.q), -half, half - 1, bucketOf(f));
        w.put(raw < 0 ? raw + 2 * half : raw, f.bits); return;
      }
      case "angle": {
        const steps = Math.pow(2, f.bits);
        let a = Number(v) || 0;
        a = a - Math.floor(a / TAU) * TAU;       // fold into [0, 2pi)
        w.put(Math.round(a / TAU * steps) % steps, f.bits); return;
      }
      case "str": {
        const t = String(v == null ? "" : v);
        const cut = t.length > f.max ? (clamps.str += 1, t.slice(0, f.max)) : t;
        w.put(cut.length, 8);
        for (let i = 0; i < cut.length; i++) w.put(cut.charCodeAt(i) & 0xff, 8);
        return;
      }
      case "vec": {
        const a = Array.isArray(v) ? v : [];
        w.put(a.length, f.lenBits);
        // the element may be a FIELD or a whole ROW (a tuple). orbSpawn's batch
        // is the second: n tuples of {id, vx, vy, value}, and `value` rides the
        // tuple because the kernel computes it per orb.
        if (Array.isArray(f.el)) { for (const el of a) putRow(w, f.el, el); }
        else { for (const el of a) putField(w, f.el, el); }
        return;
      }
      default: throw new Error("wire: unknown field kind " + f.k);
    }
  }
  function getField(r, f) {
    switch (f.k) {
      case "flag": return r.take(1) === 1;
      case "f64": return r.f64();
      case "u": return r.take(f.bits);
      case "q": return r.take(f.bits) * f.q;
      case "qs": {
        const half = Math.pow(2, f.bits - 1);
        const raw = r.take(f.bits);
        return (raw >= half ? raw - 2 * half : raw) * f.q;
      }
      case "angle": return r.take(f.bits) / Math.pow(2, f.bits) * TAU;
      case "str": {
        const n = r.take(8);
        let out = "";
        for (let i = 0; i < n; i++) out += String.fromCharCode(r.take(8));
        return out;
      }
      case "vec": {
        const n = r.take(f.lenBits);
        const out = [];
        for (let i = 0; i < n; i++) out.push(Array.isArray(f.el) ? getRow(r, f.el) : getField(r, f.el));
        return out;
      }
      default: throw new Error("wire: unknown field kind " + f.k);
    }
  }

  // one row = an ordered list of [key, field] pairs. An `opt` field spends ONE
  // PRESENCE BIT inline and then its value; a `zeroFold` field is present only
  // when it is non-zero, so the ordinary record pays one bit for it.
  function putRow(w, row, o) {
    for (const [key, f] of row) {
      const v = o[key];
      if (f.opt) {
        const here = f.zeroFold ? !!v : v !== undefined && v !== null;
        w.put(here ? 1 : 0, 1);
        if (!here) continue;
      }
      putField(w, f, v);
    }
  }
  function getRow(r, row) {
    const o = {};
    for (const [key, f] of row) {
      if (f.opt && r.take(1) === 0) {
        // A ZERO-FOLDED FIELD DECODES AS 0, NOT AS AN ABSENT KEY. The fold is a
        // WIDTH decision — the ordinary record should not pay for a flame it
        // does not have — and it must not become a SHAPE decision, or a
        // consumer reading p.fx gets undefined where the JSON wire always gave
        // it a number. A field that is genuinely optional in MEANING (`cd`,
        // `cl`) is declared without zeroFold and stays absent, because absence
        // is what it means there.
        if (f.zeroFold) o[key] = 0;
        continue;
      }
      o[key] = getField(r, f);
    }
    return o;
  }
  const putList = (w, row, list, lenBits) => {
    const a = list || [];
    w.put(a.length, lenBits);
    for (const o of a) putRow(w, row, o);
  };
  const getList = (r, row, lenBits) => {
    const n = r.take(lenBits);
    const out = [];
    for (let i = 0; i < n; i++) out.push(getRow(r, row));
    return out;
  };

  const LEN = 16;         // every array's length prefix (R1.2's u16)
  const POS_X = Q(BITS.x, 1);
  const POS_Y = Q(BITS.y, 1);
  const VEL = QS(16, VEL_Q);
  // ---- THE SPAWN-RECORD VELOCITY, AND WHY IT IS FINER --------------------
  // A PER-TICK velocity is a CORRECTION: the next snapshot overwrites it, so
  // its error never accumulates and VEL_Q's 1/32 px/tick is right for it.
  // A SPAWN-RECORD velocity is INTEGRATED: the client is told it ONCE and runs
  // it for the round's whole life, so the position error is the velocity error
  // TIMES THE TICKS FLOWN. At 1/32 that is up to life/64 px — MEASURED at 1.01
  // px by tick 49 on this lane's own derivation leg, past the 1 px position
  // quantum, and 2.4 px over a 120-tick life.
  //   So the quantum is divided by the life it will be integrated over:
  // SPAWN_VEL_Q = VEL_Q / 8 = 1/256 px/tick, which puts a 120-tick round's
  // drift at 120/512 = 0.23 px — under HALF a position quantum, so the
  // derivation is tighter than the wire that carries it. The field is 16 bits
  // either way and spans +/- 128 px/tick, against a kineticLance's 12 and a
  // player round's ~7, so nothing on either ladder comes near the domain.
  //   This is the SAME REASONING the JSON wire used for r2-over-r1 on the
  // player velocity ("at 1 decimal a rebase adopts up to 0.05 px/tick of
  // velocity error, which compounds over the predictor's whole replay window"),
  // applied to the one place where it compounds hardest: a value nothing
  // corrects.
  const SPAWN_VEL_Q = VEL_Q / 8;
  const SPAWN_VEL = QS(16, SPAWN_VEL_Q);
  // the engine-flame vector, and it is SIGNED — the position field is not, and
  // a flame folded through it reads every thrust to port as zero. It is a
  // SMOOTHED THRUST ACCELERATION (js/game.js:1789 eases K.thrustAcc into it),
  // so its domain is the ship's acceleration, two orders inside +/- 204.8, and
  // its quantum is the 0.1 the JSON wire already rounded it to.
  const FLAME = QS(12, 0.1);

  // ---- THE EIGHT ARRAY ROWS ----------------------------------------------
  // 1. THE PARKED PLAYER — first-class since v8 and still first-class here
  // (R1.1): js/net.js's isParked has four consumers and the record is what a
  // solo room deals three of, every tick. `cl: -1` is the sentinel and is not
  // encoded: the row's own PARKED FLAG carries it and the decoder restores it,
  // so the wire spends one bit where JSON spent `"cl":-1`.
  const ROW_PARKED = [
    ["hull", Q(16, 0.1)],
    ["hm", Q(16, 0.1)],
  ];
  // 2. THE LIVE PLAYER. `lockA`, `predX/predY/predT` are not here at all —
  // R1.12: they are hardcoded zeros at server/sim-host.mjs:475/:477, which made
  // the JSON encoder's conditional triple unreachable. `fx`/`fy` ARE here, under
  // a zero-folded presence bit: decoded-and-unused today (js/game.js's drawFlame
  // reads localPlayer() alone) but the look plane may light a remote one.
  const ROW_PLAYER = [
    ["x", POS_X], ["y", POS_Y],
    ["vx", VEL], ["vy", VEL],
    ["fx", opt(FLAME, true)], ["fy", opt(FLAME, true)],
    ["hull", Q(16, 0.1)], ["hm", Q(16, 0.1)],
    ["inv", U(16)], ["fl", U(8)],
    ["xp", U(32)], ["score", U(32)], ["bst", U(32)],
    ["rsp", U(16)],
    ["comet", U(1)],
    ["en", Q(16, 0.1)], ["em", Q(16, 0.1)],
    ["cool", U(16)], ["enIdle", U(16)],
    ["ow", VEC(U(8), 8)],
    ["cd", opt(VEC(U(16), 8), false)],
    ["cl", opt(U(16), false)],
    // ---- THE v11 ADDITIVE KEYS (R1.5) --------------------------------------
    // `hd` — THE CONVERGED NOSE, P.heading (js/game.js), which is HASHED
    // per-seat sim state and has never crossed. 9 bits over [0, 2pi): the step
    // is 2pi/512 = 0.012272 rad = 0.7031 deg. Until v11 a remote plate held
    // nose-right on every screen and test/tools/pred-frame-proof.mjs asserted
    // that as the contract.
    //   `ownHeading()` IS A DIFFERENT NUMBER and this is NOT it. R7 does not
    // change the local draw; the local/remote plate discrepancy belongs to the
    // look plane, is tracked, and is not this lane's.
    ["hd", ANGLE],
    // `auraR` — the comet halo's radius in px (S-5tqjej). 8 bits at a 1 px
    // quantum, ZERO-FOLDED, so a seat that is not burning pays one bit.
    // auraRadiusOf(1) = SHIP_R + COMETAOE + COMETAOEDMG = 67.5 px at this tip,
    // well inside the 255 the byte spans. Without it every client sized a
    // remote halo from its OWN rank.
    ["auraR", opt(Q(BITS.auraR, 1), true)],
    // ---- THE RESERVED SLOTS (R1.5, D33) -------------------------------------
    // DECLARED AND NEVER SET, both of them, and the leg below says so. A row
    // reserved now costs one presence bit and no version bump later; a row
    // added later costs a bump and every client in the field.
    //   `ext` is D33's EXTERNAL FORCE PAIR — the forces-in-Flight ruling's
    // wire half. Nothing produces it at this tip and r7a produces none.
    ["extx", opt(FLAME, false)], ["exty", opt(FLAME, false)],
    // `rb` is the rebate/lag column R8a will need beside the LAG table
    // js/engine.js declares at commit 13. R7 builds NO compensation (R4.4).
    ["rb", opt(U(8), false)],
  ];
  // 3. THE BODY, AND THE END OF THE ty:-1 LIE (R1.4, S-pfeza7's kind/state half).
  // `ty` is an index into BODY_TYPES — the KERNEL's own 21 types, in its own
  // STATS declaration order, pinned to its source text below. Until v11 the
  // encoder indexed kernel types against production's retired 16-name roster,
  // which they overlap NOT ONCE, so every successor body crossed as `ty: -1`
  // and decoded as a `dart` with hp 1 and no state. D39's clear-role table is
  // keyed on the KIND and its fly-by exception is read off the STATE, so a
  // decoding client could apply neither: a real MINE and a spent WARDEN both
  // BLOCKED and both counted as FOES.
  //   `state` IS A STRING, and that is a MEASURED BRANCH of R1.4 rather than a
  // preference. The rule was: a 1-byte enum IF the kernel exposes a per-type
  // state list DECLARATIVELY. Measured at this tip it does not — 36 distinct
  // `.state = "..."` assignment sites scattered through js/demo-kernel.js and
  // ONE partial map (QUIET_STATES, :832) that names only the quiet ones. A
  // source-text scrape of 36 assignments would also miss any state assigned
  // through a variable, and the wire would then carry an index for a state the
  // table does not hold — which is the ty:-1 failure again, one plane over. So
  // the state crosses as a length-prefixed short string and the ENUM IS FILED
  // AS R8a DEBT, to be taken the day the kernel declares the list.
  //   `hp` joins it: D39's role needs the kind, and a spent body needs its hp.
  const ROW_BODY = [
    ["id", U(32)],
    ["ty", U(8)],
    ["x", POS_X], ["y", POS_Y],
    ["vx", VEL], ["vy", VEL],
    ["state", STR(15)],
    ["t", U(16)],
    ["face", ANGLE],
    ["fl", U(8)],
    ["hp", U(16)],
    // ---- THE TELEGRAPH FIELDS (R7 / r7c commit 4, R3.4) ------------------
    // MATERIALIZE-ON-CROSS: the body record IS full state, so a body that
    // enters a receiver's interest radius mid-telegraph draws its telegraph
    // rather than appearing inert until its next state change. There is NO
    // separate "materialize" message — the row is the whole answer.
    //
    // WHICH FIELDS, AND THEY ARE MEASURED RATHER THAN GUESSED. R3.4 names
    // seven; the subject is the union the RENDERER reads off a body record,
    // and js/demo-render.js is where that union lives. Measured over the whole
    // renderer at this tip: `lance` 6 reads, `enraged` 6, `phase` 6,
    // `dashAngle` 4, `lanceAngle` 2 — and `attackIndex` 0, `phaseTime` 0.
    // THE LAST TWO ARE DROPPED and the drop is the record: the kernel WRITES
    // both (js/demo-kernel.js:4230 `e.attackIndex = index`, :4056 and :5288
    // for `phaseTime`) and no renderer has ever read either, so putting them
    // on the wire would be five bits and a byte of pure weight per body for a
    // consumer that does not exist. The sim's 55-key union is not carried
    // either, for the same reason: the RENDERER's read set is the subject.
    //
    // EVERY ONE IS ZERO-FOLDED, so a body with none of them pays FIVE BITS and
    // no field at all — which is the whole reason the row can carry them. An
    // ordinary dart is never in a lance, never dashing, never enraged and has
    // no orbit phase, and the ordinary case is what a 60 Hz wire is priced on.
    //   `zeroFold` is right for each, not merely cheap: a zero-folded field
    // decodes as 0 and 0 IS the value in every one of the five — an absent
    // angle is angle zero, an absent lance clock is a lance that is not
    // running, an absent rage bit is a body that is not enraged.
    //
    //   lance      the swarmling's DRAWN BEAM clock, in seconds. The kernel
    //              sets 0.44 (js/demo-kernel.js:3516) and decays it, and the
    //              renderer reads `0.44 - e.lance` for the beam's age and
    //              `e.lance / 0.09` for its tail — so the quantum has to
    //              resolve 0.09 s. 1/1024 s over 10 bits spans 0 to 0.999 s,
    //              which is twice the longest lance and ~90 steps inside the
    //              narrowest term the draw divides by.
    //   lanceA     ...and the angle it is drawn along (js/demo-render.js:1650).
    //   dashA      the charger's LUNGE LANE — the renderer rotates by it at
    //              four sites, and two of them fall back to `e.angle`, which
    //              is what makes the zero fold exactly right here.
    //   phase      the per-body ORBIT/PULSE phase over [0, TAU). The star
    //              eater's tail derives from `e.angle` + `e.phase`
    //              (js/demo-render.js:1235), and three pulse sines read it.
    //   rage       the FINALE bit (js/demo-kernel.js:5287). One bit, and the
    //              renderer switches ink, line width and glow on it.
    ["lance", opt(Q(10, 1 / 1024), true)],
    ["lanceA", opt(ANGLE, true)],
    ["dashA", opt(ANGLE, true)],
    ["phase", opt(ANGLE, true)],
    ["rage", opt(U(1), true)],
  ];
  // 4. THE BULLET. `k` is the round's KIND, 4 bits (R1.5): a remote seat's
  // rifle round has been a white dot on every other screen because the wire
  // carried no ink and no record — js/net.js says so at the carry ("the only
  // look a wire round can wear on this screen is the one the hand-off stamped
  // from its own tracer"). Zero is the ordinary bolt, so the fold is free.
  const ROW_BULLET = [
    ["id", U(32)],
    ["x", POS_X], ["y", POS_Y],
    ["o", U(8)],
    ["k", U(4)],
  ];
  // 5. THE ORB.
  const ROW_ORB = [
    ["id", U(32)],
    ["x", POS_X], ["y", POS_Y],
  ];
  // 6a. THE ORB, and its `pulled` BIT (O3, D55).
  // Orbs ride the same split. An orb's ordinary life is derivable — a scatter
  // velocity at spawn and a fixed damping every tick — so it rides as an
  // orbSpawn BATCH and a client derives the drift. What it CANNOT derive is the
  // arm that reads PILOT POSITIONS: the CLEAR SWEEP. Under D55 the sim credits
  // at MAGNET ENTRY and the fly-in is render-only on the client, so the sweep
  // is the only arm with a per-tick consumer left, and `pulled` is its bit.
  //   A PRODUCTION orb (the PvP-death payout, js/encounter.js's deathToll)
  // carries NO orbSpawn record — r7b's emit is the kernel's spawnOrb alone —
  // so it rides per tick with pulled = 1 unconditionally. A row the client
  // cannot derive must never be withheld; see the gather.
  // 6. THE GROUP.
  const ROW_GROUP = [
    ["x", POS_X], ["y", POS_Y],
    ["w", U(1)], ["s", U(1)],
    ["c", U(8)],
  ];
  // 7. THE CONSTRUCT ROUND ROW (O2, THE BALLISTIC SPLIT).
  // R0.4 is REVERSED. Kernel rounds whose flight is FIXED AT SPAWN do NOT ride
  // per tick: they ride as reliable SPAWN and DEATH events and the client
  // DERIVES the flight. Only the FOUR HOMING KINDS ride here, per tick, as
  // CONSTRUCTS — a seeker re-asks its target every tick from its own position,
  // so no client can derive where it will be.
  //   Measured at this tip against js/demo-kernel.js's spawnEnemyBullet:
  // twenty kind branches, and exactly four take a non-zero `homing` —
  // broadside 1.2, grenade 1.1, rocket 0.82, vortex 1.05. The other sixteen
  // move by life, curve, wiggle and an integrate, all of which the client has.
  // CONSTRUCT_KINDS is PINNED to that ladder's source text, both directions.
  //   `st` is the round's PHASE, one byte: a seeker before its homingDelay
  // expires is flying straight and telegraphing, and after it is seeking. The
  // client cannot derive which without the spawn record, and a construct is
  // exactly the round whose spawn record it may not have (the cull, r7c).
  const ROW_ROUND = [
    ["id", U(32)],
    ["k", U(8)],                  // an index into CONSTRUCT_KINDS
    ["x", POS_X], ["y", POS_Y],
    ["vx", VEL], ["vy", VEL],
    ["st", U(8)],
  ];
  const CONSTRUCT_KINDS = ["broadside", "grenade", "rocket", "vortex"];
  // ...and EVERY round kind the ladder can spawn, for a roundSpawn's `kind`.
  // APPEND-ONLY like every ordered table here. `mine` is NOT among them: it is
  // the twenty-first name and an ENTITY since R6 — spawnEnemyBullet THROWS on
  // it — so it is a BODY and rides BODY_TYPES.
  const ROUND_KINDS = ["plasma", "retaliation", "kineticLance", "omegaSphere",
    "omegaSide", "asteroid", "mineShard", "heavy", "arc", "cluster",
    "flame", "serpentFire", "darkFire", "lightning", "spitOrb", "splitter",
    "broadside", "grenade", "rocket", "vortex"];
  const ROUND_ST = { UNARMED: 0, SEEKING: 1 };
  // 8. the EVENT row — commit 10, and it rides the PREFIX (R2.10 (6)), never
  //    the shared body: two sockets on one room hold different cursors.

  // 8. THE EVENT ROW — and it rides the PREFIX, never the shared body (R2.10
  // (6)): two sockets on one room hold different cursors, so the body is
  // encoded ONCE per tick and the event list once per socket.
  //   `k` is a length-prefixed STRING at this commit. COMMIT 10 replaces it
  // with the index into EVENT_KINDS and adds the split's four kinds, `seq`,
  // `dir`, `R` and `srcKind`. It is a string here rather than absent because
  // the transport flips in THIS commit: an event row that arrived three commits
  // later would take the whole cue plane off the wire in between, and a lane
  // whose middle is broken cannot be bisected.
  // ---- THE EVENT KIND TABLE (R1.6) ---------------------------------------
  // A FOURTH APPEND-ONLY TABLE, and the wire carries the INDEX, so a reorder
  // silently renames every cue on every client and an append is a version bump.
  //
  // THE CENSUS, RE-DERIVED AT THIS TIP rather than quoted:
  //   19 STATIC NAMES emit today. R7-MAP §E.A counted EIGHTEEN and that count
  //   is now one short — PORT-P's D64 added a COSMETIC `roundDeath` (the
  //   destruction spark, js/encounter.js, carrying the round's own colour)
  //   after the map was taken. So the map is not wrong; it is older than the
  //   tree, and this table is derived from the tree.
  //   O2/O3 add FOUR kinds — roundSpawn, roundDeath, orbSpawn, orbPickup — but
  //   `roundDeath` IS ALREADY ONE OF THE NINETEEN. O2.3 says the D10
  //   destruction cue IS `roundDeath`, and PORT-P's spark is that cue: R7
  //   PROMOTES it from cosmetic to RELIABLE and gives it a `reason`, rather
  //   than declaring a second row under the same name. So the arithmetic is
  //   19 + 3 = 22 EMITTED, which is the same 22 the brief reaches as 18 + 4.
  //   The difference is bookkeeping; the total is measured either way.
  //   22 EMITTED = 11 RELIABLE + 11 COSMETIC, plus 6 RESERVED = 28 ROWS.
  //   `ordDeath` IS RETIRED AS A NAME (O2.3) and no lane emits it.
  //
  // THE `reliable` COLUMN AND ITS VALUES ARE DECLARED HERE (R2.1 as O6 amends
  // it, SEAT ADDENDUM O2.12). r7b CONSUMES them — its ring, its replay and its
  // evq read this column and WRITE NONE — and re-asserts the count against the
  // number r7a states.
  const EVENT_KINDS = [
    // --- RELIABLE: a client that misses one is WRONG until the next full
    // snapshot, so r7b replays them.
    { k: "restart", reliable: true },
    { k: "death", reliable: true },
    { k: "respawn", reliable: true },
    { k: "termChange", reliable: true },
    { k: "wipe", reliable: true },
    { k: "stall", reliable: true },
    { k: "spawn", reliable: true },
    // ...and the BALLISTIC SPLIT's four, which are reliable BY CONSTRUCTION:
    // the client DERIVES a round's whole flight from the spawn record, so a
    // dropped spawn is a round that never appears and a dropped death is one
    // that never stops.
    { k: "roundSpawn", reliable: true },
    { k: "roundDeath", reliable: true },
    { k: "orbSpawn", reliable: true },
    { k: "orbPickup", reliable: true },
    // ...and PLAYER BULLETS take the same split (O2.8, commit 10b). The A6
    // measurement is in $RUN/A6-MEASUREMENT.txt and it answered NO: every one
    // of the four readers of the wire's `bullets[]` is a COUNT or a POSE that a
    // spawn record plus derived STRAIGHT flight feeds — and feeds better. The
    // streak's own comment says why: "vx/vy is DERIVED, RENDER-ONLY, and never
    // on the wire … the byte band has no room for two more floats". A `shot`
    // record carries the true vector instead of a reconstructed one.
    //   Flight is EXACTLY straight on every wire-reachable path at this tip:
    // ordnanceStep is INERT (ORDNANCE_STEP is empty and the shipped game can
    // create no round with a non-zero block), and BOUNCE has no TUNABLES row,
    // no inbound message and no server writer — its only writer is the local
    // dev panel, and a net server runs js/game.js in a vm with no panel.
    { k: "shot", reliable: true },
    // --- COSMETIC: a missed one is a missed spark. Never replayed.
    { k: "fire", reliable: false },
    { k: "rail", reliable: false },
    { k: "hit", reliable: false },
    { k: "blast", reliable: false },
    { k: "thud", reliable: false },
    { k: "wall", reliable: false },
    { k: "pickup", reliable: false },
    { k: "hurt", reliable: false },
    { k: "kill", reliable: false },
    { k: "killheavy", reliable: false },
    { k: "capDenied", reliable: false },
    // --- RESERVED (R2.1): declared, no producer. A row reserved now costs a
    // table entry; a row added later costs a version bump and every client in
    // the field. `split` is ALSO a roundDeath REASON — two different tables,
    // no collision.
    { k: "telegraph", reliable: false },
    { k: "reveal", reliable: false },
    { k: "teleport", reliable: false },
    { k: "attach", reliable: false },
    { k: "detach", reliable: false },
    { k: "split", reliable: false },
  ];
  const EVENT_IX = new Map(EVENT_KINDS.map((r, i) => [r.k, i]));

  // ---- THE roundDeath REASON ENUM (O2.3, SEAT ADDENDUM) -------------------
  // SIX VALUES, and the semantics are FIXED HERE so r7b's emits have no room to
  // differ. Six values need 3 bits and the row KEEPS ITS u8: the byte has room
  // for the next external end without a version bump.
  //   shot     a player round killed it (resolveBulletHits, the hp arm)
  //   aura     the comet aura killed it (resolveCometAura)
  //   contact  it reached a ship
  //   reaped   THE TWO EXTERNAL EARLY ENDS that no damage causes and no client
  //            can derive: triggerPlasmaOrb's detonation of the plasma round a
  //            tracer body fired, and the BOSS REAP, which kills every round a
  //            dying boss owns. Emitted for EVERY kind, derived and construct
  //            alike — the client simply DROPS the round.
  //   split    a CONSTRUCT's specialTimer explosion. DECLARED WITH NO PRODUCER
  //            AT THIS TIP: measured, NO construct carries a specialTimer — it
  //            is set on spitOrb and splitter alone, both DERIVED. The value
  //            stays declared so a construct that gains a timer later needs no
  //            wire change.
  //   expire   a CONSTRUCT's end of life. FOUR producers: grenade through the
  //            explodeEnemyBullet("expiry") arm, and broadside/rocket/vortex
  //            through the bare `b.dead = true` arm, which is kind-agnostic.
  // NOT EMITTED, because the client derives them: a DERIVED kind's timer split
  // and its life expiry (the children's own roundSpawns mark the moment), and
  // EVERY round's arena-wall exit.
  const DEATH_REASONS = ["shot", "aura", "contact", "reaped", "split", "expire"];

  // 8. THE EVENT ROW, and it rides the PREFIX (R2.10 (6)).
  const ROW_EVENT = [
    ["k", U(8)],                       // the index into EVENT_KINDS
    ["x", opt(POS_X, false)], ["y", opt(POS_Y, false)],
    ["seat", opt(U(8), false)],
    ["g", opt(QS(16, 0.1), false)],
    ["seq", opt(U(32), false)],        // termChange's per-seat epoch; r7b's `t`
    ["t", opt(U(32), false)],          // the event's own tick — r7b sets it
    ["dir", opt(ANGLE, false)],        // a cue's direction, at the heading quantum
    ["R", opt(Q(BITS.R, 1), false)],   // ...and its radius, 12 bits at 1 px
    ["srcKind", opt(U(8), false)],     // S-jj3vd5: the damage SOURCE's kind, an
                                       // index into BODY_TYPES. The JSON wire
                                       // STRIPPED it at the encoder's allow-list.
  ];
  // ---- THE FOUR SPLIT KINDS' OWN FIELDS -----------------------------------
  // Encoded AFTER the common row, and only for the kind that owns them, so a
  // `fire` pays nothing for a round's ballistics. Every scalar's domain is
  // measured off the ladder (§2.5(b2)/(b3)).
  //   `life`, `specialTimer` and `curve` are CONTINUOUS: `curve` is a RANDOM
  // DRAW off the round's own shape substream (rangeOf), so it can never be an
  // enum of kinds. `specialTimer` is the trap: every top-level timer on the
  // ladder is an exact tick count at 60 Hz (1.45 s = 87, 1.15 s = 69) but the
  // SPLITTER CHILD's 0.72 s is 43.2 ticks — NOT an integer. A tick-quantized
  // timer field is therefore WRONG, and 1/300 s represents every ladder value
  // exactly (0.72 -> 216, 1.15 -> 345, 1.45 -> 435, 4.8 -> 1440, all inside u16).
  const T_Q = 1 / 300;
  const ROW_ROUND_SPAWN = [
    ["id", U(32)],
    ["kind", U(8)],                    // an index into ROUND_KINDS
    ["x", POS_X], ["y", POS_Y],
    ["vx", SPAWN_VEL], ["vy", SPAWN_VEL],   // INTEGRATED, so finer — see SPAWN_VEL_Q
    ["life", Q(16, T_Q)],
    ["ownerId", U(32)],
    ["curve", opt(QS(12, 0.001), true)],       // [-0.27, +0.27] rad/s, continuous
    ["wiggle", opt(Q(8, 0.01), true)],         // an enum of four, carried as a value
    ["specialTimer", opt(Q(16, T_Q), true)],
  ];
  const ROW_ROUND_DEATH = [
    ["id", U(32)],
    ["reason", U(8)],                  // an index into DEATH_REASONS
  ];
  // orbSpawn is a BATCH, ONE PER KILL (O2.11): spawnOrb is called from a single
  // loop, so a 16-kill tick is 16 events and not 128. `value` rides the PER-ORB
  // tuple because js/demo-kernel.js computes it INSIDE that loop and the first
  // `xpTotal % count` orbs each carry one more than the rest — a batch-level
  // field cannot represent the batch.
  const ROW_ORB_SPAWN = [
    ["x", POS_X], ["y", POS_Y],
    ["life", Q(16, T_Q)],
    ["orbs", VEC([["id", U(32)], ["vx", VEL], ["vy", VEL], ["value", U(8)]], 4)],
  ];
  const ROW_ORB_PICKUP = [
    ["id", U(32)],
    ["seat", U(2)],
  ];
  // A PLAYER ROUND'S SPAWN (O2.8). `ttl` is the round's remaining life in
  // TICKS and it is load-bearing: without it a derived round outlives its death
  // tick and the pose set diverges at the end of the window.
  //   THE POSE IS POST-REBATE, and that is a SCHEMA SEMANTIC fixed here so
  // r7b's emit has no room to differ. js/encounter.js's `rebate` advances a
  // round up to `delta` ticks AT SPAWN, sweeping as it goes, and collapses
  // px/py at the end — so what this record carries is the state the round would
  // have had on its FIRST SNAPSHOT, not the state at the trigger pull. A
  // record taken before the rebate would put every shot most of a round trip
  // behind the server's.
  const ROW_SHOT = [
    ["id", U(32)],
    ["seat", U(2)],
    ["x", POS_X], ["y", POS_Y],
    ["vx", SPAWN_VEL], ["vy", SPAWN_VEL],   // INTEGRATED, so finer — see SPAWN_VEL_Q
    ["ttl", U(16)],
    // `rk` and NOT `k`: the EVENT row's own `k` is the EVENT KIND, and a
    // payload field of the same name would overwrite it when the two are
    // merged. Measured on this leg's first run — the decoded event answered
    // `k: 0` instead of `k: "shot"`. It is the same number the bullet row calls
    // `k`, under a name that does not collide.
    ["rk", U(4)],
  ];
  const KIND_ROWS = {
    roundSpawn: ROW_ROUND_SPAWN,
    roundDeath: ROW_ROUND_DEATH,
    orbSpawn: ROW_ORB_SPAWN,
    orbPickup: ROW_ORB_PICKUP,
    shot: ROW_SHOT,
  };

  // 9. THE HUD SINGLETON.
  // ---- THE HUD STATE VOCABULARY (R3.6, r7a commit 11) ---------------------
  // A CLOSED TABLE, not a free string. MEASURED at this tip, `E.state` takes
  // FIVE values and no others (js/encounter.js: idle, warning, active, cleared,
  // dead), and every one of them is a decision the client DRAWS on — the shop
  // door, the clear break, the death overlay. A free string let a typo cross
  // and reach a consumer that silently matched nothing.
  //   THE STALL VOCABULARY IS RESERVED HERE and r7c sets its semantics: the
  // stall detector advances in the SIM STEP, so a net client — which steps no
  // local sim — has a DARK stall surface, and tests/net-checks.js asserts that
  // as the current contract. The row is what lets r7c light it without a
  // version bump.
  const HUD_STATES = ["idle", "warning", "active", "cleared", "dead",
    // RESERVED, no producer at this tip — r7c's:
    "stalled", "stallWarn"];
  const ROW_HUD = [
    ["state", U(4)],                   // an index into HUD_STATES
    ["wave", U(16)], ["waveTick", U(16)], ["clearTick", U(16)],
    // THE SWEEP FACT, one bit, and it is RESERVED HERE because the client's orb
    // store needs it and nothing carried it. MEASURED at this tip: wireState's
    // hud gather is { state, wave, waveTick, clearTick } and every one of those
    // is PRODUCTION's `E`, while the kernel's sweep is `S.gateTimer` — reachable
    // from the host only as DemoKernel.clearHoldLeft(). So `gateTimer > 0` did
    // NOT ride hud, and §2.5(m)5's branch is the reserve. The client's derived
    // orb store freezes an orb's life while this is set, exactly as the kernel
    // does (js/demo-kernel.js: `if (!sweeping && !o.captured) o.life -= dt`).
    ["sweep", U(1)],
    // ...and `loop` — production's ARC LOOP COUNTER (PORT-S S7), which HAS NO
    // WIRE SLOT and which js/net.js records as an (R7 BILL) at its decode: "a
    // client's E.loop stays 0 until R7". The row is R7's; r7c sets what a
    // client does with it. 8 bits — a loop count nobody has reached twice.
    ["loop", U(8)],
    // ---- THE CLEAR HOLD'S LENGTH (R7 / r7c commit 8, R3.8, S-r3mfs8 R1) ---
    // MEASURED FIRST, and the measurement is why this row exists at all. R3.8's
    // default was "no new key if `hud.clearTick` suffices". It does not:
    //   js/encounter.js's applyKernelHud writes
    //     E.clearTick = E.waveTick - Math.round((hold - held) * 60)
    //   and the draw prints
    //     left = ECFG.clearHold - (wt - E.clearTick)
    // so `wt - clearTick` is the hold ALREADY SPENT and the LENGTH comes from
    // the CLIENT'S OWN ECFG.clearHold — which is exactly the number a stale
    // client has wrong. A client at 210 against a server at 480 counts down
    // from 4 while the room breaks for 8.
    //   SIXTEEN BITS, not the eight the brief predicted: the shipped value is
    // 480 ticks and 480 does not fit in a byte. It is a length in TICKS, the
    // same unit ECFG.clearHold is in, so the client's fallback and the wire's
    // answer are the same kind of number and no conversion sits between them.
    ["hold", U(16)],
  ];

  // ---- 10. THE ENVELOPE FRAME --------------------------------------------
  // encode() builds the SHARED body ONCE per tick (R1.8). Everything that
  // differs per socket — the ack, the seat, the flags, the own-seat
  // full-precision record and that socket's event list — rides prefix(), which
  // arrives at commit 5.
  function encode(view, tick, t, matchEpoch, full) {
    const w = Writer();
    w.put(VERSION, 8);
    w.put(tick >>> 0, 32);
    w.f64(t);
    w.put((matchEpoch | 0) >>> 0, 32);

    const players = view.players || [];
    w.put(players.length, LEN);
    for (const p of players) {
      w.put(p.seat & 0xff, 8);
      const parked = !!p.absent;
      w.put(parked ? 1 : 0, 1);
      putRow(w, parked ? ROW_PARKED : ROW_PLAYER, parked ? rowOfParked(p) : rowOfPlayer(p));
    }
    putList(w, ROW_BODY, (view.enemies || []).map(rowOfBody), LEN);
    // THE SPLIT'S TWO POPULATIONS (O2.4, O3, O11). `rounds[]` carries the
    // CONSTRUCTS and `orbs[]` carries the PULLED — unless `full` is set, and
    // then both carry every live entity, un-culled, for r7b's resync and r7c's
    // grant. The gather hands the WHOLE population with a flag on each row, so
    // the decision is made HERE, once, and a full body is the same call with
    // one argument different rather than a second gather.
    putList(w, ROW_ROUND, (view.rounds || [])
      .filter((r) => full || r.construct).map(rowOfRound), LEN);
    // PLAYER BULLETS ARE `full`-ONLY FROM v11 (O2.8, commit 10b). Their pose
    // stopped riding per tick: a reliable `shot` event carries the spawn and
    // the client derives the straight flight, exactly as it does for the
    // sixteen derived kernel kinds. The list survives here so a resync or a
    // grant can re-seat a client's whole store in one message.
    putList(w, ROW_BULLET, full ? (view.bullets || []).map(rowOfBullet) : [], LEN);
    putList(w, ROW_ORB, (view.orbs || [])
      .filter((o) => full || o.pulled), LEN);
    putList(w, ROW_GROUP, (view.groups || []).map(rowOfGroup), LEN);
    putRow(w, ROW_HUD, rowOfHud(view.hud || {}));
    return w.bytes();
  }

  // the gather-side shaping the JSON encoder used to do inline. Kept as three
  // tiny functions rather than in the loop so the SCHEMA above stays the only
  // statement of what crosses.
  const rowOfParked = (p) => ({ hull: p.hull, hm: p.hullMax });
  const rowOfPlayer = (p) => ({
    x: p.x, y: p.y, vx: p.vx || 0, vy: p.vy || 0,
    fx: p.fx, fy: p.fy,
    hull: p.hull, hm: p.hullMax,
    inv: p.inv, fl: p.flash,
    xp: p.xp, score: p.score, bst: p.best | 0,
    rsp: p.rsp || 0,
    comet: p.comet ? 1 : 0,
    en: p.energy || 0, em: p.energyMax || 0,
    cool: p.cool | 0, enIdle: p.enIdle | 0,
    // the CONVERGED NOSE and the comet halo's radius — the two v11 additions
    // that a client could not derive. `hd` folds an absent heading to 0 the way
    // every other number on this record folds; `auraR` is zero-folded, so a
    // seat that is not burning spends one bit.
    hd: p.heading || 0,
    auraR: p.auraR || 0,
    ow: trimTail(p.owned),
    cd: (() => { const c = trimTail((p.cd || []).map((v) => v | 0)); return c.length ? c : undefined; })(),
    // the v7 CLAIM priority, unchanged and still stated as code: a release has
    // no countdown to report, and a countdown still running is the state the
    // player is actually in, so the claim window waits its turn.
    cl: (p.rsp || 0) === 0 && p.cl > 0 ? p.cl : undefined,
  });
  const rowOfBody = (e) => ({
    id: e.id, ty: typeIndex(e.type),
    x: e.x, y: e.y, vx: e.vx || 0, vy: e.vy || 0,
    // the gather calls the kernel's `state` "mode" — server/sim-host.mjs's own
    // per-body mapping note says so in place. The WIRE calls it `state`,
    // because that is what it is, and js/net.js reads the same word.
    state: e.mode,
    t: e.t, face: e.face, fl: e.flash, hp: e.hp | 0,
    // the telegraph five, zero-folded — see the schema. The `|| 0` folds an
    // ABSENT key to the same thing an absent presence bit decodes to, so a
    // gather that does not carry one and a body that does not have one are
    // the same record on the wire.
    lance: e.lance || 0, lanceA: e.lanceAngle || 0,
    dashA: e.dashAngle || 0, phase: e.phase || 0,
    rage: e.enraged ? 1 : 0,
  });
  const rowOfBullet = (b) => ({ id: b.id, x: b.x, y: b.y, o: b.o | 0, k: b.k | 0 });
  const roundKindIndex = (n) => {
    const i = CONSTRUCT_KINDS.indexOf(n);
    if (i < 0) { clamps.event += 1; return NO_INDEX; }
    return i;
  };
  const rowOfRound = (r) => ({ id: r.id, k: roundKindIndex(r.kind),
    x: r.x, y: r.y, vx: r.vx || 0, vy: r.vy || 0, st: r.st | 0 });
  const rowOfGroup = (g) => ({ x: g.x, y: g.y, w: g.warned ? 1 : 0, s: g.spawned ? 1 : 0, c: g.count });
  // THE STATE INDEX, and an unlisted one is REFUSED WITH A METRIC and folds to
  // `idle` — never a throw on a live stream, and never a silent pass-through
  // that reaches a consumer matching nothing.
  const stateIndex = (n) => {
    const i = HUD_STATES.indexOf(n);
    if (i < 0) { clamps.event += 1; return 0; }
    return i;
  };
  const rowOfHud = (h) => ({ state: stateIndex(h.state), wave: h.wave,
    waveTick: h.waveTick, clearTick: h.clearTick, sweep: h.sweep | 0,
    loop: h.loop | 0, hold: h.hold | 0 });

  // the SUFFIX trim both vectors take, in ONE place: only a trailing default
  // run may go, because a rank and a cooldown are both addressed by INDEX and
  // an interior zero is positional. Every discarded value reads as 0 on the
  // client (`|| 0` and `| 0` are the only two ways either is read).
  function trimTail(a) {
    if (!Array.isArray(a)) return [];
    let n = a.length;
    while (n > 0 && !a[n - 1]) n--;
    return a.slice(0, n);
  }
  // ---- THE BODY TYPE TABLE (R1.4) ----------------------------------------
  // THE KERNEL'S OWN 21 TYPES, IN ITS OWN `STATS` DECLARATION ORDER. Listed
  // here by hand and PINNED to js/demo-kernel.js's source text, which is
  // branch (b) of R1.4 and the only branch with a mechanism: this file is
  // loaded by createRequire and lives OUTSIDE the vm where the kernel runs, and
  // js/engine.js carries no module.exports, so "derived at load" had nothing to
  // derive from. The pin is server/snapshot.test.mjs's extractList idiom — one
  // leg reads the STATS KEY ORDER out of the kernel's SOURCE and asserts it
  // equals this list, so a STATS append without an append here REDS BY NAME.
  //   APPEND-ONLY, like every ordered wire table before it: the wire carries the
  // INDEX, so a reorder silently renames every body on every client, and an
  // append is a version bump. A second leg pins this list's md5 against VERSION
  // so an append that forgets the bump reds too.
  //   The 16-name production roster (ENEMY_TYPES) is RETIRED with this table.
  // It has had no subject since the flip emptied E.enemies, and it is what the
  // kernel's types were being indexed against when they all answered -1.
  const NO_INDEX = 255;   // "not in the table" — never a throw on a live stream
  const BODY_TYPES = ["swarmling", "warden", "interceptor", "hammerhead", "hive",
    "drone", "tracer", "minelayer", "myrmidon", "snapper", "bulwark", "cherub",
    "constructor", "turret", "vanguard", "pulsar", "omegaDefender", "spitfire",
    "stationOmega", "starEater", "mine"];
  const typeIndex = (n) => {
    const i = BODY_TYPES.indexOf(n);
    if (i < 0 || i >= NO_INDEX) { clamps.event += 1; return NO_INDEX; }
    return i;
  };

  // ---- THE PER-SOCKET PREFIX (R1.8, R2.10 (6)) ---------------------------
  // The body is encoded ONCE per tick and its buffer is NEVER MUTATED. What
  // differs per receiver rides here: the ack, the seat, the flags, the own-seat
  // FULL-PRECISION record and that socket's event list. This replaces
  // server/server.js's `msg.slice(1)` and its string splice — a per-socket
  // rewrite of the whole payload, sixty times a second, per receiver.
  //
  // FLAGS, and both bits are DECLARED HERE and set by later lanes:
  //   bit 0  resync — r7b's semantics
  //   bit 1  full   — this snapshot's rounds[], orbs[] and bodies[] carry EVERY
  //                   live entity, UN-CULLED (O2.5). r7b's resync and r7c's
  //                   grant set it; NOTHING in r7a does, and that is the
  //                   expected state, not a gap. decode publishes it as `full`.
  const FLAG_RESYNC = 1, FLAG_FULL = 2;
  const SEAT_NONE = 255;   // a spectator holds no seat

  function prefix(ack, seat, flags, events, own) {
    const w = Writer();
    w.put(VERSION, 8);
    w.put((ack | 0) >>> 0, 32);
    w.put(Number.isInteger(seat) && seat >= 0 ? seat : SEAT_NONE, 8);
    w.put((flags | 0) & 0xff, 8);
    // THE OWN SEAT'S RECORD, FULL PRECISION (R1.3). The predictor rebases from
    // the wire (adoptWire, rebase), so a QUANTIZED adopt would inject up to
    // q/2 of rebase error every snapshot — 0.5 px of position and 1/64 px/tick
    // of velocity, sixty times a second, into the one seat the player is
    // watching. It rides the PREFIX and not the body because the body is shared
    // and this record differs per receiver; the shared body still carries that
    // seat's quantized row and decode OVERWRITES it from here.
    const hasOwn = !!own;
    w.put(hasOwn ? 1 : 0, 1);
    if (hasOwn) {
      w.f64(own.x); w.f64(own.y);
      w.f64(own.vx || 0); w.f64(own.vy || 0);
    }
    putEvents(w, events);
    return w.bytes();
  }
  const rowOfEvent = (ev) => ({
    k: ev.kind,
    x: ev.at ? ev.at.x : undefined,
    y: ev.at ? ev.at.y : undefined,
    seat: ev.seat !== undefined ? ev.seat : undefined,
    g: ev.gain !== undefined ? ev.gain : undefined,
    seq: ev.termSeq !== undefined ? ev.termSeq : undefined,
    t: ev.t !== undefined ? ev.t : undefined,
    dir: ev.dir !== undefined ? ev.dir : undefined,
    R: ev.R !== undefined ? ev.R : undefined,
    srcKind: ev.srcKind !== undefined ? typeIndex(ev.srcKind) : undefined,
  });
  // THE ENCODER REFUSES AN UNLISTED KIND WITH A METRIC, NEVER A THROW (R1.6):
  // a live broadcast may not die because somebody added a cue name and not a
  // table row. The event is DROPPED and counted, which is loud in /metrics and
  // silent on the wire.
  function putEvents(w, events) {
    const list = [];
    for (const ev of events || []) {
      const ix = EVENT_IX.get(ev.kind);
      if (ix === undefined) { clamps.event += 1; continue; }
      list.push([ix, ev]);
    }
    w.put(list.length, LEN);
    for (const [ix, ev] of list) {
      const row = rowOfEvent(ev);
      row.k = ix;
      putRow(w, ROW_EVENT, row);
      const extra = KIND_ROWS[EVENT_KINDS[ix].k];
      if (extra) putRow(w, extra, payloadOf(EVENT_KINDS[ix].k, ev));
    }
  }
  const payloadOf = (kind, ev) => {
    if (kind === "roundSpawn") {
      const ki = ROUND_KINDS.indexOf(ev.kindName);
      if (ki < 0) clamps.event += 1;
      return { ...ev, kind: ki < 0 ? 0 : ki };
    }
    if (kind === "roundDeath") {
      const ri = DEATH_REASONS.indexOf(ev.reason);
      if (ri < 0) clamps.event += 1;
      return { id: ev.id, reason: ri < 0 ? 0 : ri };
    }
    return ev;
  };
  function getEvents(r) {
    const n = r.take(LEN);
    const out = [];
    for (let i = 0; i < n; i++) {
      const row = getRow(r, ROW_EVENT);
      const def = EVENT_KINDS[row.k];
      row.k = def ? def.k : null;
      if (row.srcKind !== undefined) {
        row.srcKind = row.srcKind === NO_INDEX ? null : BODY_TYPES[row.srcKind];
      }
      const extra = def && KIND_ROWS[def.k];
      if (extra) {
        const pay = getRow(r, extra);
        if (def.k === "roundSpawn") pay.kindName = ROUND_KINDS[pay.kind];
        if (def.k === "roundDeath") pay.reason = DEATH_REASONS[pay.reason];
        Object.assign(row, pay);
      }
      out.push(row);
    }
    return out;
  }

  function decode(u8) {
    const r = Reader(u8);
    const out = {};
    // ---- the prefix
    const pv = r.take(8);
    out.a = r.take(32);
    const seat = r.take(8);
    out.seat = seat === SEAT_NONE ? null : seat;
    const flags = r.take(8);
    out.resync = (flags & FLAG_RESYNC) !== 0;
    out.full = (flags & FLAG_FULL) !== 0;
    const hasOwn = r.take(1) === 1;
    const own = hasOwn ? { x: r.f64(), y: r.f64(), vx: r.f64(), vy: r.f64() } : null;
    out.events = getEvents(r);
    // THE PREFIX AND THE BODY ARE TWO SEPARATE BUFFERS, so the reader must
    // re-align exactly where the writer padded. Writer.bytes() flushes its
    // trailing partial byte, and the body then starts on a byte boundary — a
    // reader that kept counting bits would run the whole body a few bits off.
    // It only bites when the prefix's bit count is NOT a multiple of 8, which
    // is precisely the SPECTATOR case: a seated socket's four f64s align it by
    // accident, a spectator's has no own record and lands on 73 bits. The
    // seated legs were green while every spectator decoded garbage.
    r.align();
    // ---- the body
    out.v = r.take(8);
    // the prefix and the body each carry the version, and they are written by
    // two different calls — so a mismatch means one of them was built against a
    // different js/wire.js, which is the only way this can happen and worth a
    // count rather than a silent decode.
    if (pv !== out.v) clamps.event += 1;
    out.tick = r.take(32);
    out.t = r.f64();
    out.me = r.take(32);
    const np = r.take(LEN);
    out.players = [];
    for (let i = 0; i < np; i++) {
      const seat = r.take(8);
      const parked = r.take(1) === 1;
      const rec = getRow(r, parked ? ROW_PARKED : ROW_PLAYER);
      rec.seat = seat;
      if (parked) rec.cl = -1;      // the sentinel js/net.js's isParked tests
      out.players.push(rec);
    }
    out.enemies = getList(r, ROW_BODY, LEN);
    out.rounds = getList(r, ROW_ROUND, LEN);
    for (const rd of out.rounds) rd.kind = rd.k === NO_INDEX ? null : CONSTRUCT_KINDS[rd.k];
    // ...and every body names ITS OWN KIND. 255 stays the "not in the table"
    // slot and it decodes to `kind: null` — NOT to a dart. A body the table
    // does not know is a body this client cannot draw honestly, and saying so
    // is the whole point of retiring the fallback: the old path answered
    // "dart" for all 21 kernel types and nothing downstream could tell.
    for (const e of out.enemies) e.kind = e.ty === NO_INDEX ? null : BODY_TYPES[e.ty];
    out.bullets = getList(r, ROW_BULLET, LEN);
    out.orbs = getList(r, ROW_ORB, LEN);
    out.groups = getList(r, ROW_GROUP, LEN);
    out.hud = getRow(r, ROW_HUD);
    out.hud.state = HUD_STATES[out.hud.state];
    // ...and the own seat's full precision lands ON TOP of its quantized row.
    // One encode per tick, and apply() still sees an ordinary players[] with
    // the own record exact.
    if (own && out.seat !== null) {
      const p = out.players.find((q) => q.seat === out.seat);
      if (p && p.cl !== -1) { p.x = own.x; p.y = own.y; p.vx = own.vx; p.vy = own.vy; }
    }
    return out;
  }

  const API = {
    VERSION,
    FW, FH, WORLD_W, WORLD_H,
    bits, BITS, VEL_Q, SPAWN_VEL_Q,
    clamps,
    SCHEMA: {
      parked: ROW_PARKED, player: ROW_PLAYER, body: ROW_BODY,
      bullet: ROW_BULLET, orb: ROW_ORB, group: ROW_GROUP, hud: ROW_HUD,
      event: ROW_EVENT, round: ROW_ROUND,
      roundSpawn: ROW_ROUND_SPAWN, roundDeath: ROW_ROUND_DEATH,
      orbSpawn: ROW_ORB_SPAWN, orbPickup: ROW_ORB_PICKUP, shot: ROW_SHOT,
    },
    FLAG_RESYNC, FLAG_FULL, SEAT_NONE, NO_INDEX,
    BODY_TYPES, CONSTRUCT_KINDS, ROUND_ST, ROUND_KINDS, HUD_STATES,
    EVENT_KINDS, DEATH_REASONS,
    encode, prefix, decode,
  };

  return API;
})();

if (typeof module !== "undefined" && module.exports) module.exports = Wire;
if (typeof window !== "undefined") window.Wire = Wire;
