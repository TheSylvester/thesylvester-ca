(function () {
  "use strict";

  // THE DAMAGE DOOR, resolved at LOAD and demanded loudly (R5 commit F).
  // Every hull and hp subtraction in this kernel walks through
  // Engine.applyEffect, the same door production's encounter walks through, and
  // the engine is guaranteed present: js/engine.js is second in
  // server/sim-host.mjs's SIM_FILES and first in every page tag and vm host
  // that boots this file.
  //
  // A MISSING ENGINE THROWS HERE RATHER THAN FALLING BACK. A fallback would be
  // a silent dual path — one damage rule when the engine loaded and another
  // when it did not — which is precisely the drift Flight.cometOn was built to
  // kill. Failing at load makes a forgotten script tag a boot error with a name
  // on it, not a divergence somebody chases through a hash diff later.
  if (typeof window === "undefined" || !window.Engine) {
    throw new Error("js/demo-kernel.js requires js/engine.js to be loaded first — " +
      "every hp/hull subtraction here routes through Engine.applyEffect, and there is " +
      "deliberately no fallback path");
  }

  const TAU = Math.PI * 2;
  const STEP = 1 / 60;
  const BASE_SEED = 0x4e4f5641;
  const C = {
    ink: "#f7f8ff",
    cyan: "#74f5ff",
    blue: "#55aaff",
    magenta: "#ff4ead",
    violet: "#a879ff",
    red: "#ff626e",
    orange: "#ff9b63",
    gold: "#ffe07a",
    green: "#77ffbc",
    dim: "#313854",
    dark: "#050711"
  };
  const RGB = {
    ink: [247, 248, 255], cyan: [116, 245, 255], blue: [85, 170, 255],
    magenta: [255, 78, 173], violet: [168, 121, 255], red: [255, 98, 110],
    orange: [255, 155, 99], gold: [255, 224, 122], green: [119, 255, 188]
  };

  const WAVES = [
    null,
    {
      name: "SWARMLING ARC", duration: 7.5,
      caption: "Swarmlings gather at lance range, orbit the pilot, then pulse through short attack windows.",
      groups: [
        [0.5, "swarmling", 6, "ring", "portal"],
        [4.2, "swarmling", 4, "flank", "depth"]
      ]
    },
    {
      name: "WARDEN RANK", duration: 8,
      caption: "Wardens plant, gather a red charge, release one heavy shot, then curve away before setting again.",
      groups: [
        [0.4, "warden", 2, "rank", "edge"],
        [2.2, "swarmling", 5, "arc", "portal"],
        [5.6, "warden", 1, "solo", "depth"]
      ]
    },
    {
      name: "INTERCEPTOR PINCER", duration: 8,
      caption: "Interceptors shadow the ship, steer away from collision, and loose four accelerating, gently homing broadside shots.",
      groups: [
        [0.4, "interceptor", 2, "pincer", "edge"],
        [2.3, "swarmling", 5, "ring", "portal"],
        [5.5, "interceptor", 1, "solo", "depth"]
      ]
    },
    {
      name: "HAMMERHEAD V", duration: 8,
      caption: "Hammerheads paint a narrow impact lane before committing to a ram. Their deaths can ignite nearby hulls.",
      groups: [
        [0.4, "hammerhead", 2, "v", "edge"],
        [2.1, "swarmling", 6, "arc", "portal"],
        [5.3, "warden", 1, "solo", "depth"]
      ]
    },
    {
      name: "TRACER CROSS-FIRE", duration: 10,
      caption: "Tracers backpedal at long range, seed slow plasma orbs, then ignite each orb into a four-way fan of burning shots.",
      groups: [
        [0.5, "tracer", 2, "pincer", "edge"],
        [2.6, "swarmling", 5, "arc", "portal"],
        [6.1, "interceptor", 2, "escort", "depth"]
      ]
    },
    {
      name: "HIVE + CHERUB", duration: 10,
      caption: "The Hive replenishes collision drones while a non-aggressive Cherub shelters near the anchor, healing and hard-shielding nearby hulls.",
      groups: [
        [0.5, "hive", 1, "solo", "depth"],
        [1.6, "cherub", 1, "escort", "portal"],
        [3.6, "interceptor", 2, "pincer", "edge"],
        [6.8, "swarmling", 6, "arc", "portal"]
      ]
    },
    {
      name: "SPITFIRE", duration: 26, gate: "spitfire", curated: true, rank: "MINIBOSS I",
      caption: "Compressed milestone: Spitfire alternates a charged flame-serpent orb with arcing fire, an evasive Pulsar interlude, and a kinetic lance.",
      groups: [
        [1.0, "spitfire", 1, "center", "depth"]
      ]
    },
    {
      name: "MINE CORRIDOR", duration: 10,
      caption: "Minelayers cross the pilot's route, drop capped pairs into their wake, and convert open space into a sequence of arming rings.",
      groups: [
        [0.5, "minelayer", 2, "rank", "edge"],
        [3.0, "interceptor", 2, "pincer", "portal"],
        [6.4, "swarmling", 5, "arc", "depth"]
      ]
    },
    {
      name: "MYRMIDON ARTILLERY", duration: 10.5,
      caption: "Slow Myrmidons hold the far field and launch accelerating homing cluster grenades whose delayed fans erase easy escape lines.",
      groups: [
        [0.5, "myrmidon", 2, "rank", "depth"],
        [2.8, "warden", 2, "flank", "portal"],
        [6.1, "swarmling", 6, "arc", "edge"]
      ]
    },
    {
      name: "SNAPPER HUNT", duration: 10,
      caption: "Snappers expose their white mouth cores during a readable jaw-open wind-up, then close the window and lunge down the painted lane.",
      groups: [
        [0.5, "snapper", 3, "arc", "portal"],
        [3.2, "tracer", 1, "solo", "edge"],
        [6.7, "snapper", 2, "pincer", "depth"]
      ]
    },
    {
      name: "BULWARK SUPPORT", duration: 11,
      caption: "Bulwarks turn a heat-storing barrier into retaliation fire while a Cherub shelters behind the line and repairs its allies.",
      groups: [
        [0.5, "bulwark", 2, "rank", "edge"],
        [1.5, "cherub", 1, "escort", "portal"],
        [4.6, "hammerhead", 2, "v", "depth"],
        [7.7, "myrmidon", 1, "solo", "edge"]
      ]
    },
    {
      name: "CONSTRUCTOR GRID", duration: 11.5,
      caption: "Constructors establish two-node rocket grids. Cherub repair pulses and Tracer combinations punish a static firing line.",
      groups: [
        [0.5, "constructor", 2, "pincer", "portal"],
        [1.9, "cherub", 1, "escort", "depth"],
        [4.9, "tracer", 2, "flank", "edge"],
        [8.0, "swarmling", 6, "arc", "portal"]
      ]
    },
    {
      name: "STATION OMEGA", duration: 38, gate: "stationOmega", curated: true, rank: "MINIBOSS II",
      caption: "Compressed milestone: five weak points rotate a laser lattice, call Omega Defenders, then surround a central sphere barrage with rapid side fire.",
      groups: [
        [1.2, "stationOmega", 1, "center", "depth"]
      ]
    },
    {
      name: "RED STAR SIGNAL", duration: 11, omen: 0.42,
      caption: "A fast Vanguard and Tracer deal plays beneath the first red-star omen: three intangible segments are assembling behind the arena.",
      groups: [
        [0.5, "vanguard", 2, "pincer", "edge"],
        [2.1, "tracer", 2, "flank", "portal"],
        [5.2, "snapper", 2, "v", "depth"],
        [8.0, "swarmling", 6, "arc", "edge"]
      ]
    },
    {
      name: "DIRECTOR OVERLOAD", duration: 12, omen: 0.76,
      caption: "The director accelerates into a final mixed deal while a red star and three intangible segments gather behind the battlefield.",
      groups: [
        [0.4, "hive", 1, "solo", "portal"],
        [1.1, "hammerhead", 2, "v", "edge"],
        [2.3, "bulwark", 1, "solo", "depth"],
        [3.8, "myrmidon", 1, "solo", "edge"],
        [5.2, "interceptor", 2, "pincer", "edge"],
        [6.8, "tracer", 2, "flank", "portal"],
        [8.5, "snapper", 2, "v", "depth"],
        [10.0, "swarmling", 7, "ring", "portal"]
      ]
    },
    {
      name: "STAR EATER", duration: 58, gate: "starEater", curated: true, rank: "FINAL BOSS", omen: 1,
      caption: "Final milestone: Star Eater advances through ordered fireball, beam, lunge, vortex, splitter, and crossing attacks, escalating below half hull.",
      groups: [
        [1.4, "starEater", 1, "boss-left", "depth"]
      ]
    }
  ];

  const STATS = {
    swarmling: { r: 11, hp: 4, speed: 105, accel: 270, color: "cyan", score: 80, xp: 1 },
    warden: { r: 18, hp: 12, speed: 74, accel: 145, color: "red", score: 220, xp: 2 },
    interceptor: { r: 15, hp: 9, speed: 122, accel: 245, color: "magenta", score: 170, xp: 2 },
    hammerhead: { r: 19, hp: 13, speed: 78, accel: 170, color: "orange", score: 260, xp: 3, priority: -6500, contact: 8, heavy: true },
    hive: { r: 28, hp: 30, speed: 43, accel: 72, color: "violet", score: 520, xp: 5, priority: -1200, heavy: true },
    drone: { r: 7, hp: 2, speed: 152, accel: 330, color: "violet", score: 35, xp: 0, priority: -2200, contact: 10 },
    tracer: { r: 17, hp: 16, speed: 92, accel: 190, color: "green", score: 310, xp: 3 },
    minelayer: { r: 22, hp: 24, speed: 64, accel: 105, color: "gold", score: 420, xp: 4, heavy: true },
    myrmidon: { r: 23, hp: 28, speed: 52, accel: 92, color: "blue", score: 480, xp: 4, priority: -900, heavy: true },
    snapper: { r: 21, hp: 16, speed: 83, accel: 185, color: "magenta", score: 390, xp: 4, priority: -1800, contact: 18 },
    bulwark: { r: 27, hp: 42, speed: 51, accel: 95, color: "orange", score: 680, xp: 6, priority: -700, heavy: true },
    cherub: { r: 14, hp: 12, speed: 98, accel: 190, color: "green", score: 360, xp: 4, priority: -9000 },
    constructor: { r: 24, hp: 34, speed: 57, accel: 105, color: "violet", score: 620, xp: 5, priority: -1600, heavy: true },
    turret: { r: 10, hp: 8, speed: 0, accel: 0, color: "violet", score: 110, xp: 1, priority: -400 },
    vanguard: { r: 22, hp: 28, speed: 98, accel: 190, color: "red", score: 520, xp: 5, priority: -1100, heavy: true },
    pulsar: { r: 10, hp: 7, speed: 128, accel: 220, color: "gold", score: 130, xp: 1, priority: -1200 },
    omegaDefender: { r: 13, hp: 12, speed: 92, accel: 170, color: "cyan", score: 190, xp: 1, priority: -900 },
    spitfire: { r: 38, hp: 210, speed: 88, accel: 170, color: "orange", score: 4200, xp: 12, priority: -30000, contact: 18, heavy: true, boss: true, label: "SPITFIRE" },
    stationOmega: { r: 65, hp: 330, speed: 34, accel: 58, color: "cyan", score: 7800, xp: 16, priority: -32000, contact: 20, heavy: true, boss: true, label: "STATION OMEGA" },
    starEater: { r: 72, hp: 540, speed: 72, accel: 125, color: "red", score: 16000, xp: 20, priority: -40000, contact: 26, heavy: true, boss: true, label: "STAR EATER" },
    // `mine` — D10's ENTITY PROMOTION (R6 commit F(c)). It was a branch of the
    // bullet kind ladder; it is a placed object now, on the `drone` precedent
    // the taxonomy names. hp 2 is that precedent exactly: one player shot pops
    // it. score and xp are ZERO because the reward model is DENIAL ONLY — the
    // reward is the damage that did not land, and a mine that paid score would
    // turn a minelayer into a farm.
    //
    // THE PRIORITY IS EXPLICIT AND HUGE, and it is the single most important
    // number in this row. `nearestTarget` scores `distSq(p, e) + priority` and
    // takes the LOWEST, and a STATS row with NO priority key scores 0 — the
    // STRONGEST bucket in the game, ahead of every boss at -30000. Left
    // undeclared, every mine within range would become the autopilot's target
    // and the 16,000-tick AUTO fixture — which is flown by that autopilot —
    // would diverge for a reason nobody chose. `playerMayFireAt` refuses mines
    // as well, so the driver neither steers at them nor shoots them.
    //
    // THAT PAIR IS TEST-DRIVER POLICY, NOT D25. D25 governs what a WEAPON may
    // acquire ("damageable is not acquirable") and it is enforced in
    // js/engine.js's ACQUIRE mask. This is the demo's autopilot, which is a
    // stand-in for a human and should behave like one: a human does not aim at
    // mines by reflex either.
    //
    // contact 0 is a declaration and not a fallback: the generic contact block
    // reads `st.contact || 6`, so this row alone would still deal 6. Mines are
    // excluded from that block explicitly — see updateEnemies.
    mine: { r: 11, hp: 2, speed: 0, accel: 0, color: "gold", score: 0, xp: 0, priority: 1e9, contact: 0 }
  };
  const W = 1280, H = 720;

  // The PLAY BOX: the viewport encounters are DESIGNED for. Owner ruling W1 makes the
  // render extent WIDER than this (16:9, shop and score as UI over the live world at the
  // sides — the sides are a gift, not something the game depends on). NOTHING in the sim
  // may anchor to the render extent: widen the view and every RADIUS and REACH below
  // would silently grow, buffing the fire gate and the boss beams with no test failing.
  // The value equals today's field, so this commit moves nothing.
  const PLAY_W = 1280;
  const PLAY_H = 720;

  // The ARENA: a grid of play boxes (owner ruling W3 — 6x11, "fine for now"; ruling W2 —
  // BUILD-TIME constant, never runtime-negotiable). Cheap to change = these two integers.
  const ARENA_COLS = 6;
  const ARENA_ROWS = 11;
  const ARENA_W = PLAY_W * ARENA_COLS;
  const ARENA_H = PLAY_H * ARENA_ROWS;

  // The topology flag. OFF is the wrapping build, which stays byte-identical to the
  // frozen demo-v2 reference for the whole of PORT-W (the POR's A/B reference). Hop 2
  // wires it behind the load-time selector below.
  const WORLD_BOUNDED = (typeof globalThis !== "undefined" && typeof globalThis.DEMO_WORLD_BOUNDED === "boolean") ? globalThis.DEMO_WORLD_BOUNDED : false;
  const PLAYER_WALL_LOSS = 0.5;

  let nextId = 1;

  const S = {
    seed: BASE_SEED,
    time: 0,
    tick: 0,
    wave: 1,
    waveTime: 0,
    cycle: 1,
    score: 0,
    xp: 0,
    xpNext: 9,
    level: 1,
    paused: false,
    speed: 1,
    notes: false,
    shake: 0,
    finaleFlash: 0,
    banner: 0,
    bannerText: "",
    caption: "",
    schedule: [],
    enemies: [],
    bullets: [],
    particles: [],
    fragments: [],
    shockwaves: [],
    orbs: [],
    entries: [],
    stars: [],
    player: null,
    respawn: 0,
    gateTimer: 0
  };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- THE SUBSTREAMS (R6 commit F(a)) -------------------------------------
  // The kernel used to hold ONE gameplay stream, and that made every draw in
  // the file a neighbour of every other. The census is what makes the coupling
  // concrete rather than theoretical: 85 draw expressions, and the FX dominate
  // at run time because the emitters LOOP — `burst()` spends six draws per
  // particle, so one heavy `killEnemy` spends about 203. Under one stream a
  // muzzle flash is a bigger perturbation of the seeded wave deal than the deal
  // itself, and the bench research already names that failure ("a
  // player-triggered draw shifts every subsequent seeded wave deal").
  //
  // Every draw now derives its own generator from the shared mixer
  // (js/engine.js), keyed by PURPOSE. AFTER THIS COMMIT A `burst()` CAN NEVER
  // SHIFT A WAVE DEAL AGAIN. That is the whole of it, and it is why this is one
  // of the four licensed changes rather than a tidy-up.
  //
  // ---- NO NEW HASHED STATE, AND THAT IS A HARD CONSTRAINT -------------------
  // test/tools/demo-serial.js's census() THROWS on any top-level key of S that
  // is neither INCLUDED nor EXCLUDED, and adding to INCLUDED is a
  // SERIALIZER_VERSION question every manifest checks. So no substream keeps
  // state on S. A gameplay substream is a LOCAL, built where it is needed and
  // dead when the call returns; its key is built from state that is ALREADY
  // hashed — S.seed, S.wave, S.tick and the entity's own id — which is what the
  // spec means by "spawn ordinals and attack sequences are hashed state".
  //
  // ---- THE FX STREAM IS THE ONE EXCEPTION, AND IT IS DERIVED ----------------
  // FX draws happen many times per tick from a dozen call sites, so a local per
  // site would give them all the same numbers. It gets ONE generator per tick,
  // rebuilt whenever (seed, wave, tick) changes — module state, but DERIVED
  // state, on the same footing as anything computed from a hashed record. Its
  // one requirement is that a fresh run rebuilds it, which is why resetRun
  // clears the key: without that, a second run of the same seed would find the
  // key unchanged and carry the previous run's generator position into it.
  //
  // A KNOWN LIMIT, written down rather than discovered later: a host that
  // RESUMED the kernel from a serialized mid-run state would rebuild the FX
  // generator at position 0 for that tick instead of wherever the continuous
  // run had left it. Nothing in this repository resumes that way — every replay
  // and every pin comparison runs from reset — and the fix, if a host ever
  // needs one, is a per-tick draw ordinal on the key rather than a stream.
  let fxKey = "";
  let fxGen = null;
  function fxRand() {
    const k = (S.seed >>> 0) + ":" + S.wave + ":" + S.tick;
    if (k !== fxKey) { fxKey = k; fxGen = Engine.substream(S.seed, S.wave, 0, 0, S.tick, Engine.PURPOSE.FX); }
    return fxGen();
  }
  function fxRange(a, b) { return a + (b - a) * fxRand(); }
  // The gameplay substreams. Each returns a generator the caller holds for the
  // length of one decision, so successive draws inside one call differ while
  // two different callers can never reach each other.
  //
  // THE HELPERS ARE NAMED `fx*` AND `*Rand`, and the OLD BARE `rand()` /
  // `range()` ARE GONE ON PURPOSE. A gameplay draw written as a bare `range()`
  // would silently land on the presentation stream and undo this whole commit;
  // with the bare names deleted it is a ReferenceError instead. That is the
  // cheapest possible enforcement and it costs a rename.
  //
  // `choose()` IS DELETED. It had zero call sites before this commit and would
  // have needed a purpose it could not be given.
  function dealRand(ordinal) { return Engine.substream(S.seed, S.wave, ordinal, 0, S.tick, Engine.PURPOSE.DEAL); }
  function spawnRand(id) { return Engine.substream(S.seed, S.wave, 0, id, 0, Engine.PURPOSE.SPAWN); }
  function shapeRand(id) { return Engine.substream(S.seed, S.wave, 0, id, 0, Engine.PURPOSE.SHAPE); }
  function orbRand(id) { return Engine.substream(S.seed, S.wave, 0, id, 0, Engine.PURPOSE.ORB); }
  function rangeOf(g, a, b) { return a + (b - a) * g(); }
  // The CURRENT body's behavior substream. It is set by updateEnemies for the
  // length of one body's dispatch and cleared straight after, so the twelve
  // update functions that draw can share it without each growing a parameter.
  //
  // IT IS AMBIENT AND THEREFORE GUARDED. An update function reached from
  // anywhere but that slice finds it null and THROWS by name, rather than
  // quietly drawing from whichever body ran last — which is the failure mode
  // ambient state actually has, and the only one worth defending against.
  let bodyGen = null;
  function bodyRand() {
    if (!bodyGen) {
      throw new Error("demo-kernel: a behaviour draw outside updateEnemies' per-body slice — " +
        "the behaviour substream is keyed on the body being stepped, and there is no body here");
    }
    return bodyGen();
  }
  function bodyRange(a, b) { return a + (b - a) * bodyRand(); }
  function clamp(n, a, b) { return n < a ? a : n > b ? b : n; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOut(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 3); }
  function easeInOut(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function wrap(n, size) { return ((n % size) + size) % size; }
  function delta(from, to, size) {
    if (WORLD_BOUNDED) return to - from;
    let d = to - from;
    if (d > size * 0.5) d -= size;
    if (d < -size * 0.5) d += size;
    return d;
  }
  function distSq(a, b) {
    if (WORLD_BOUNDED) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      return dx * dx + dy * dy;
    }
    const dx = delta(a.x, b.x, W);
    const dy = delta(a.y, b.y, H);
    return dx * dx + dy * dy;
  }
  function encFrame() {
    return {
      x: clamp(S.player.x - PLAY_W / 2, 0, ARENA_W - PLAY_W),
      y: clamp(S.player.y - PLAY_H / 2, 0, ARENA_H - PLAY_H)
    };
  }
  function norm(x, y) {
    const m = Math.hypot(x, y) || 1;
    return { x: x / m, y: y / m, m: m };
  }
  function angleDelta(a, b) {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }
  function rotateToward(a, b, max) {
    return a + clamp(angleDelta(a, b), -max, max);
  }
  function rgba(rgb, alpha) {
    return "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + alpha + ")";
  }
  function rgbFor(name) { return RGB[name] || RGB.ink; }
  function cssFor(name) { return C[name] || C.ink; }

  function setPrevious(o) {
    o.px = o.x;
    o.py = o.y;
  }

  const noop = function () {};
  let sink = { state: noop, caption: noop, cue: noop };

  // The input plane, one level below the sink: the sink carries state OUT, this
  // carries a pilot's decisions IN. AUTO is the default at module load, and with
  // no provider installed every expression below reads exactly as the frozen
  // demo-v2 reference does.
  let pilot = null;
  const fin = function (v) { return Number.isFinite(v) ? v : 0; };

  // setInput(fn) installs the pilot provider; setInput(null), or anything that is
  // not a function, removes it and returns the kernel to AUTO.
  //
  // The provider is called EXACTLY ONCE PER LIVE PLAYER TICK, from updatePlayer,
  // after the death branch has returned. It is NOT called on a tick where the
  // player is dead, so a caller that counts ticks by counting provider calls will
  // undercount by the length of every death.
  //
  // It returns a frame: { x, y, aimX, aimY, fire }. x/y are the thrust axes; the
  // kernel normalizes them, so their magnitude does not matter and a diagonal need
  // not be pre-scaled. aimX/aimY are a WORLD point, not a screen point. fire is
  // truthy while the trigger is held.
  //
  // Every numeric field is hardened HERE, at the kernel boundary, with a finite
  // test and never with `v || 0`: +undefined || 0 is 0, but Infinity || 0 is
  // Infinity, and one infinite axis puts the ship at NaN forever. This repo has
  // shipped that exact defect once already (bf2c961, server input hardening). The
  // aim pair takes the finite test directly with p.angle as its fallback, because
  // fin's 0 would snap the aim at the world origin, and that is not "straight
  // ahead". A malformed or missing frame (null, a non-object) from an INSTALLED
  // pilot is "no keys held, not firing, aim straight ahead" — an empty HUMAN
  // frame. It never falls through to AUTO for the tick, and it is never an error.
  // Each field is read exactly once per tick, so a frame built from accessors sees
  // one getter call apiece; a provider or a frame getter that THROWS is a page bug
  // and stays loud — the kernel does not contain it — and a wire-delivered frame is
  // JSON-parsed and so cannot carry accessors at all.
  //
  // The provider is the page's business, never the kernel's: nothing here reads
  // document, window or navigator, because this file also boots inside
  // server/sim-host.mjs's vm sandbox over server/dom-stub.mjs.
  function setInput(fn) { pilot = typeof fn === "function" ? fn : null; }

  function setSink(next) {
    next = next || {};
    sink = {
      state: typeof next.state === "function" ? next.state : noop,
      caption: typeof next.caption === "function" ? next.caption : noop,
      // R6 commit B's contract requires a cap rejection to be VISIBLE, and the
      // sink is the only channel this kernel has: it touches no DOM, reads no
      // document, and boots inside a vm over a throwing stub. A host that
      // supplies no `cue` gets the noop, exactly as it does for the other two,
      // so nothing existing breaks and the contract still has somewhere to
      // speak. What a host DOES with a capDenied is the host's business.
      cue: typeof next.cue === "function" ? next.cue : noop
    };
  }

  function newPlayer() {
    if (WORLD_BOUNDED) {
      return {
        x: ARENA_W * 0.5, y: ARENA_H * 0.55, px: ARENA_W * 0.5, py: ARENA_H * 0.55,
        vx: 18, vy: -24, angle: -Math.PI * 0.5, pangle: -Math.PI * 0.5,
        thrustAngle: -Math.PI * 0.5, fire: 0, trail: 0, hull: 100,
        maxHull: 100, invuln: 1.5, target: 0, alive: true, flash: 0
      };
    }
    return {
      x: PLAY_W * 0.5, y: PLAY_H * 0.55, px: PLAY_W * 0.5, py: PLAY_H * 0.55,
      vx: 18, vy: -24, angle: -Math.PI * 0.5, pangle: -Math.PI * 0.5,
      thrustAngle: -Math.PI * 0.5, fire: 0, trail: 0, hull: 100,
      maxHull: 100, invuln: 1.5, target: 0, alive: true, flash: 0
    };
  }

  function resetRun(seed) {
    S.seed = (seed == null ? S.seed : seed) >>> 0;
    // The FX generator is keyed on (seed, wave, tick) and rebuilt when the key
    // changes. A fresh run returns to wave 1 tick 0, so without this line the key
    // would be UNCHANGED and the previous run's generator position would carry
    // into the new one. Clearing it is what makes reset() actually reset.
    fxKey = "";
    fxGen = null;
    bodyGen = null;
    nextId = 1;
    S.time = 0;
    S.tick = 0;
    S.wave = 1;
    S.waveTime = 0;
    S.cycle = 1;
    S.score = 0;
    S.xp = 0;
    S.xpNext = 9;
    S.level = 1;
    S.shake = 0;
    S.finaleFlash = 0;
    S.banner = 0;
    S.schedule.length = 0;
    S.enemies.length = 0;
    S.bullets.length = 0;
    S.particles.length = 0;
    S.fragments.length = 0;
    S.shockwaves.length = 0;
    S.orbs.length = 0;
    S.entries.length = 0;
    S.player = newPlayer();
    S.respawn = 0;
    S.gateTimer = 0;
    makeStars();
    startWave(1, true);
    emitShockwave(S.player.x, S.player.y, "cyan", 15, 90, 0.7);
    sink.state();
  }

  function makeStars() {
    const starRand = mulberry32((S.seed ^ 0x91e10da5) >>> 0);
    S.stars.length = 0;
    const count = clamp(Math.round((PLAY_W * PLAY_H) / 5200), 100, 280);
    for (let i = 0; i < count; i++) {
      S.stars.push({
        x: starRand(), y: starRand(), size: 0.35 + starRand() * 1.25,
        phase: starRand() * TAU, speed: 0.22 + starRand() * 0.8,
        tint: starRand() < 0.13 ? "magenta" : starRand() < 0.25 ? "cyan" : "ink"
      });
    }
  }

  function startWave(number, immediate) {
    const n = clamp(number | 0, 1, WAVES.length - 1);
    const def = WAVES[n];
    if (def.curated) prepareSetpiece();
    S.wave = n;
    S.waveTime = 0;
    S.gateTimer = 0;
    S.banner = 3.2;
    S.bannerText = (def.rank || "WAVE " + String(n).padStart(2, "0")) + "  //  " + def.name;
    S.caption = def.caption;
    for (let i = 0; i < def.groups.length; i++) {
      const g = def.groups[i];
      S.schedule.push({
        due: S.time + g[0], type: g[1], count: g[2],
        formation: g[3], entry: g[4], wave: n
      });
    }
    sink.caption(def.caption);
    sink.state();
  }

  function advanceWave(manual) {
    if (manual) {
      S.schedule = S.schedule.filter(function (g) { return g.wave !== S.wave; });
      if (WAVES[S.wave].curated) {
        S.entries.length = 0;
        S.enemies.length = 0;
        S.bullets = S.bullets.filter(function (b) { return b.team === "player"; });
      }
    }
    if (S.wave < WAVES.length - 1) {
      startWave(S.wave + 1, false);
      return;
    }
    // A restrained nova clears the representative seed before it loops. It is
    // deliberately a transition, not a screen-filling muzzle flash.
    S.cycle++;
    S.schedule.length = 0;
    S.entries.length = 0;
    S.enemies.length = 0;
    S.bullets = S.bullets.filter(function (b) { return b.team === "player"; });
    S.orbs.length = 0;
    S.finaleFlash = Math.max(S.finaleFlash, 0.72);
    emitShockwave(S.player.x, S.player.y, "cyan", 24, Math.min(PLAY_W, PLAY_H) * 0.42, 1.15);
    burst(S.player.x, S.player.y, "cyan", 28, 150);
    S.shake = Math.max(S.shake, 5);
    startWave(1, false);
  }

  function prepareSetpiece() {
    S.schedule.length = 0;
    S.entries.length = 0;
    S.enemies.length = 0;
    S.bullets = S.bullets.filter(function (b) { return b.team === "player"; });
    S.orbs.length = 0;
    if (S.player) {
      S.player.hull = Math.min(S.player.maxHull, S.player.hull + 24);
      S.player.invuln = Math.max(S.player.invuln, 1.2);
    }
    if (WORLD_BOUNDED) {
      const frame = encFrame();
      emitShockwave(frame.x + PLAY_W * 0.5, frame.y + PLAY_H * 0.5, "cyan", 18, Math.min(PLAY_W, PLAY_H) * 0.34, 0.8);
    } else {
      emitShockwave(PLAY_W * 0.5, PLAY_H * 0.5, "cyan", 18, Math.min(PLAY_W, PLAY_H) * 0.34, 0.8);
    }
  }

  // THE DEAL SUBSTREAM ARRIVES AS A PARAMETER rather than being derived here,
  // because the group's ordinal is queueGroup's fact and not this function's:
  // a formation is laid out for ONE group, and two groups queued on the same
  // tick must not share a stream.
  function formationPoints(type, count, formation, deal) {
    if (WORLD_BOUNDED) {
      const frame = encFrame();
      const p = S.player;
      const points = [];
      let anchorX;
      let anchorY;
      let side = (deal() * 4) | 0;
      const margin = Math.min(PLAY_W, PLAY_H) * 0.12;
      if (formation === "center") {
        for (let i = 0; i < count; i++) points.push({ x: frame.x + PLAY_W * 0.5 + (i - (count - 1) * 0.5) * 74, y: frame.y + PLAY_H * 0.46, side: 2 });
        return points;
      }
      if (formation === "boss-left") {
        for (let i = 0; i < count; i++) points.push({ x: frame.x + PLAY_W * 0.17, y: frame.y + PLAY_H * 0.5, side: 0 });
        return points;
      }
      if (formation === "ring" || formation === "arc") {
        const start = rangeOf(deal, 0, TAU);
        const span = formation === "arc" ? Math.PI * 1.2 : TAU;
        const rad = clamp(Math.min(PLAY_W, PLAY_H) * 0.34, 170, 300);
        for (let i = 0; i < count; i++) {
          const a = start + (count === 1 ? 0 : span * i / count);
          points.push({ x: clamp(p.x + Math.cos(a) * rad, 0, ARENA_W), y: clamp(p.y + Math.sin(a) * rad, 0, ARENA_H), side: side });
        }
        return points;
      }
      if (side === 0) { anchorX = frame.x + margin; anchorY = frame.y + rangeOf(deal, PLAY_H * 0.2, PLAY_H * 0.8); }
      else if (side === 1) { anchorX = frame.x + PLAY_W - margin; anchorY = frame.y + rangeOf(deal, PLAY_H * 0.2, PLAY_H * 0.8); }
      else if (side === 2) { anchorX = frame.x + rangeOf(deal, PLAY_W * 0.2, PLAY_W * 0.8); anchorY = frame.y + margin; }
      else { anchorX = frame.x + rangeOf(deal, PLAY_W * 0.2, PLAY_W * 0.8); anchorY = frame.y + PLAY_H - margin; }

      const tangentX = side < 2 ? 0 : 1;
      const tangentY = side < 2 ? 1 : 0;
      const inwardX = side === 0 ? 1 : side === 1 ? -1 : 0;
      const inwardY = side === 2 ? 1 : side === 3 ? -1 : 0;
      for (let i = 0; i < count; i++) {
        const centered = i - (count - 1) * 0.5;
        let across = centered * 34;
        let deep = 0;
        if (formation === "v") deep = Math.abs(centered) * -22;
        if (formation === "pincer") {
          across = (i % 2 ? 1 : -1) * (68 + Math.floor(i / 2) * 28);
          deep = Math.floor(i / 2) * 16;
        }
        if (formation === "escort") {
          across = centered * 54;
          deep = Math.abs(centered) * 22;
        }
        if (formation === "flank") across = centered * 28;
        points.push({
          x: clamp(anchorX + tangentX * across + inwardX * deep, 0, ARENA_W),
          y: clamp(anchorY + tangentY * across + inwardY * deep, 0, ARENA_H),
          side: side
        });
      }
      return points;
    }
    const p = S.player;
    const points = [];
    let anchorX;
    let anchorY;
    let side = (deal() * 4) | 0;
    const margin = Math.min(PLAY_W, PLAY_H) * 0.12;
    if (formation === "center") {
      for (let i = 0; i < count; i++) points.push({ x: PLAY_W * 0.5 + (i - (count - 1) * 0.5) * 74, y: PLAY_H * 0.46, side: 2 });
      return points;
    }
    if (formation === "boss-left") {
      for (let i = 0; i < count; i++) points.push({ x: PLAY_W * 0.17, y: PLAY_H * 0.5, side: 0 });
      return points;
    }
    if (formation === "ring" || formation === "arc") {
      const start = rangeOf(deal, 0, TAU);
      const span = formation === "arc" ? Math.PI * 1.2 : TAU;
      const rad = clamp(Math.min(PLAY_W, PLAY_H) * 0.34, 170, 300);
      for (let i = 0; i < count; i++) {
        const a = start + (count === 1 ? 0 : span * i / count);
        points.push({ x: wrap(p.x + Math.cos(a) * rad, W), y: wrap(p.y + Math.sin(a) * rad, H), side: side });
      }
      return points;
    }
    if (side === 0) { anchorX = margin; anchorY = rangeOf(deal, PLAY_H * 0.2, PLAY_H * 0.8); }
    else if (side === 1) { anchorX = PLAY_W - margin; anchorY = rangeOf(deal, PLAY_H * 0.2, PLAY_H * 0.8); }
    else if (side === 2) { anchorX = rangeOf(deal, PLAY_W * 0.2, PLAY_W * 0.8); anchorY = margin; }
    else { anchorX = rangeOf(deal, PLAY_W * 0.2, PLAY_W * 0.8); anchorY = PLAY_H - margin; }

    const tangentX = side < 2 ? 0 : 1;
    const tangentY = side < 2 ? 1 : 0;
    const inwardX = side === 0 ? 1 : side === 1 ? -1 : 0;
    const inwardY = side === 2 ? 1 : side === 3 ? -1 : 0;
    for (let i = 0; i < count; i++) {
      const centered = i - (count - 1) * 0.5;
      let across = centered * 34;
      let deep = 0;
      if (formation === "v") deep = Math.abs(centered) * -22;
      if (formation === "pincer") {
        across = (i % 2 ? 1 : -1) * (68 + Math.floor(i / 2) * 28);
        deep = Math.floor(i / 2) * 16;
      }
      if (formation === "escort") {
        across = centered * 54;
        deep = Math.abs(centered) * 22;
      }
      if (formation === "flank") across = centered * 28;
      points.push({
        x: wrap(anchorX + tangentX * across + inwardX * deep, W),
        y: wrap(anchorY + tangentY * across + inwardY * deep, H),
        side: side
      });
    }
    return points;
  }

  function queueGroup(group) {
    // ONE substream per queued group. The ordinal is the entries list's length
    // at the moment of the call — hashed state, and monotonic within a tick
    // because each group pushes before the next is queued, so two groups
    // materialising on the same tick can never collide.
    const deal = dealRand(S.entries.length);
    const points = formationPoints(group.type, group.count, group.formation, deal);
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      S.entries.push({
        id: nextId++, x: point.x, y: point.y, px: point.x, py: point.y,
        type: group.type, formation: group.formation, kind: group.entry,
        side: point.side, age: -i * 0.09, duration: group.entry === "depth" ? 1.2 : 0.95,
        spawned: false, spin: rangeOf(deal, 0, TAU), wave: group.wave
      });
    }
  }

  function spawnEnemy(entry, overrideType) {
    const type = overrideType || entry.type;
    const st = STATS[type];
    // THE ID IS ALLOCATED BEFORE THE DRAWS, because the body's spawn substream
    // is KEYED on it: one body, one stream, and no two bodies can reach each
    // other however many spawn on the same tick. The literal below still takes
    // `id` first, so the record's field SET is unchanged — which matters,
    // because the serializer sorts nested keys and the field set is part of the
    // hash.
    const id = nextId++;
    const gen = spawnRand(id);
    const a = rangeOf(gen, 0, TAU);
    const e = {
      id: id, type: type, x: entry.x, y: entry.y, px: entry.x, py: entry.y,
      vx: Math.cos(a) * 8, vy: Math.sin(a) * 8, angle: a, pangle: a,
      hp: st.hp, maxHp: st.hp, r: st.r, dead: false, hit: 0,
      emerge: entry.kind === "depth" ? 1.05 : 0.62,
      emergeMax: entry.kind === "depth" ? 1.05 : 0.62,
      cooldown: rangeOf(gen, 0.35, 1.15), timer: 0, state: "approach",
      orbit: gen() < 0.5 ? -1 : 1, phase: rangeOf(gen, 0, TAU), contact: 0,
      lance: 0, lanceAngle: a, lanceHit: false, chargeAngle: a,
      dashAngle: a, spawnTimer: rangeOf(gen, 1.5, 2.6), parent: 0,
      ownerId: 0, attackTimer: 0, auxTimer: 0, attackIndex: 0,
      phaseTime: 0, shield: 0, shieldPulse: 0, weakPulse: 0,
      enraged: false, finale: false
    };
    if (type === "hammerhead") e.cooldown = rangeOf(gen, 0.8, 1.8);
    if (type === "hive") e.spawnTimer = 1.2;
    if (type === "tracer") { e.cooldown = rangeOf(gen, 0.6, 1.1); e.state = "stalk"; e.shield = 4; }
    if (type === "minelayer") { e.cooldown = rangeOf(gen, 0.55, 0.95); e.state = "lay"; }
    if (type === "myrmidon") { e.cooldown = rangeOf(gen, 0.8, 1.3); e.state = "range"; }
    if (type === "snapper") { e.cooldown = rangeOf(gen, 0.45, 0.9); e.state = "seek"; e.vulnerable = false; }
    if (type === "bulwark") { e.cooldown = rangeOf(gen, 1.1, 1.8); e.state = "guard"; e.shieldHeat = 0; }
    if (type === "cherub") { e.cooldown = 0.8; e.state = "support"; }
    if (type === "constructor") { e.spawnTimer = 1.05; e.state = "build"; }
    if (type === "turret") { e.cooldown = rangeOf(gen, 0.7, 1.2); e.state = "anchor"; }
    if (type === "vanguard") { e.cooldown = 0.6; e.state = "sweep"; e.volley = 0; }
    if (type === "pulsar") { e.cooldown = 0.55; e.state = "orbit"; }
    if (type === "omegaDefender") { e.cooldown = rangeOf(gen, 0.5, 0.9); e.state = "orbit"; }
    if (type === "spitfire") {
      e.cooldown = 0;
      e.state = "orbCharge";
      e.timer = 1.35;
      e.phaseTime = 0;
      e.emerge = e.emergeMax = 1.4;
    }
    if (type === "stationOmega") {
      e.state = "settle";
      e.timer = 1.8;
      e.angle = e.pangle = -Math.PI * 0.5;
      e.emerge = e.emergeMax = 1.8;
      e.brokenNodes = 0;
    }
    if (type === "starEater") {
      e.state = "burst";
      e.timer = 5.8;
      e.phaseTime = 0;
      e.attackIndex = 0;
      e.burstCount = 0;
      e.asteroids = false;
      e.emerge = e.emergeMax = 2.1;
      e.angle = e.pangle = 0;
    }
    if (WORLD_BOUNDED && (type === "warden" || type === "stationOmega" || type === "starEater")) {
      const frame = encFrame();
      e.efx = frame.x;
      e.efy = frame.y;
    }
    S.enemies.push(e);
    // THE MINE KEEPS ITS OLD ARRIVAL, and this is the look ruling rather than a
    // preference. A body EMERGES — seven particles and a shockwave announce it,
    // because a body arriving is an event the pilot must notice. A mine is
    // PLACED, and as a round it arrived with a single muzzle particle and no
    // shockwave at all: `burst(x, y, color, 1, 20)`, the non-heavy branch of
    // spawnEnemyBullet's own FX line. R6 holds an architecture licence and not
    // a visual one — the promotion has to be invisible to a player — so the
    // arrival is spelled here rather than inherited.
    if (type === "mine") {
      burst(e.x, e.y, st.color, 1, 20);
    } else {
      burst(e.x, e.y, st.color, type === "hive" ? 15 : 7, type === "hive" ? 65 : 38);
      emitShockwave(e.x, e.y, st.color, 5, type === "hive" ? 44 : 25, 0.42);
    }
    return e;
  }

  function spawnDrone(hive, angle) {
    if (WORLD_BOUNDED) {
      const at = {
        x: clamp(hive.x + Math.cos(angle) * 25, 0, ARENA_W),
        y: clamp(hive.y + Math.sin(angle) * 25, 0, ARENA_H), kind: "portal", type: "drone"
      };
      const d = spawnEnemy(at, "drone");
      d.parent = hive.id;
      d.emerge = d.emergeMax = 0.35;
      d.vx = Math.cos(angle) * 125;
      d.vy = Math.sin(angle) * 125;
      return;
    }
    const at = {
      x: wrap(hive.x + Math.cos(angle) * 25, W),
      y: wrap(hive.y + Math.sin(angle) * 25, H), kind: "portal", type: "drone"
    };
    const d = spawnEnemy(at, "drone");
    d.parent = hive.id;
    d.emerge = d.emergeMax = 0.35;
    d.vx = Math.cos(angle) * 125;
    d.vy = Math.sin(angle) * 125;
  }

  // `mine` — the ENTITY spawn (R6 commit F(c)), built on spawnDrone's shape:
  // a two-field `at` record, spawnEnemy, then the fields that are the mine's
  // own identity written over the top.
  //
  // THE FUSE AND THE TRIGGER MOVE WITH IT. `armed 0.72` and `proximity 74` are
  // not bullet machinery — the taxonomy says so in as many words — so they are
  // written here rather than left behind in the kind ladder. `life 6.2` comes
  // with them: a mine that never expired would make the four-mine census a
  // permanent ceiling instead of a cadence.
  //
  // EMERGE IS ZERO, and that is a decision. Every other body arrives over 0.35
  // to 2.1 seconds and is unshootable for the first three quarters of it. A
  // mine is PLACED, not emerged, and it is shootable the instant it exists —
  // which is the whole point of the promotion. Its `armed` fuse still governs
  // when it can HURT, so laying one at your feet is as safe as it ever was.
  //
  // `distance` is a parameter because the two callers disagree and both are
  // faithful to what they replaced: the minelayer LAYS at its own rim (r + 5,
  // spawnEnemyBullet's offset), and its DEATH drops three from its centre (the
  // old death path built a fake with r 0).
  //
  // ---- THE BIRTH-TICK TIMING UNIFICATION — A FIFTH LICENSED CHANGE ---------
  // Cross-vendor review found this and it was absorbed silently by the interim
  // freeze, which was the real defect. It is named here because a change nobody
  // wrote down is the one that gets rediscovered as a bug.
  //
  // WHAT MOVED. A cadence-laid mine is now appended DURING updateEnemies' walk,
  // after that walk snapshots its count — so it is not stepped until the
  // following tick. As a bullet it was appended during updateEnemies and then
  // stepped by updateBullets' own snapshot LATER IN THE SAME TICK. So its fuse,
  // drift, proximity test and expiry all begin one tick later than they did.
  //
  // WHY IT IS NOT REVERTED. The mine family already had TWO timing classes and
  // this promotion collapsed them into one. Measured over the 16,000-tick
  // bounded run at the pre-R6 boundary: of 41 mine bullets, 38 were stepped on
  // their birth tick (cadence-laid, from updateEnemies) and 3 were DEFERRED
  // (death-dropped, from resolveBulletHits — which runs after updateBullets has
  // already taken its snapshot). The promotion did not invent a deferral; it
  // gave the cadence-laid mine the timing the death-dropped one already had.
  //
  // AND THAT TIMING IS WHAT EVERY OTHER IN-WALK SPAWN ALREADY HAS. Measured on
  // the same run today: drone 15/15 deferred, and spawnChild's children
  // 10/10 (omegaDefender 3, pulsar 3, turret 4). Every entity appended during
  // updateEnemies' walk waits a tick, without exception. A bespoke birth slice
  // for the mine would make it the ONLY entity in the kernel with special birth
  // timing — recreating, on the entity plane, exactly the split the promotion
  // removed from the bullet plane.
  //
  // THE COST IS ONE TICK ON A 43-TICK FUSE (0.72 s at 60 Hz), below perception.
  // The regression leg in test/node-golden.mjs pins the first visible state of
  // BOTH classes — pristine `armed 0.72`, `life 6.2`, `x === px` — so a future
  // drift in either direction reds instead of being absorbed again.
  function spawnMine(layer, angle, distance) {
    const at = WORLD_BOUNDED
      ? { x: clamp(layer.x + Math.cos(angle) * distance, 0, ARENA_W),
          y: clamp(layer.y + Math.sin(angle) * distance, 0, ARENA_H), kind: "portal", type: "mine" }
      : { x: wrap(layer.x + Math.cos(angle) * distance, W),
          y: wrap(layer.y + Math.sin(angle) * distance, H), kind: "portal", type: "mine" };
    const m = spawnEnemy(at, "mine");
    m.parent = layer.id;
    // The layer's OWN id, never its owner's: the four-mine census counts by it,
    // and a child minelayer's mines must be counted against the child.
    m.ownerId = layer.id || 0;
    m.emerge = m.emergeMax = 0;
    // The drift the old bullet had: 42 px/s along the lay angle, plus the
    // layer's own motion at 0.18, which is spawnEnemyBullet's exact term.
    m.vx = Math.cos(angle) * 42 + layer.vx * 0.18;
    m.vy = Math.sin(angle) * 42 + layer.vy * 0.18;
    m.armed = 0.72;
    m.proximity = 74;
    m.life = 6.2;
    return m;
  }

  // The mine's whole behaviour, and it is the bullet block it replaces, moved:
  // the same drag, the same arming countdown, the same proximity test at the
  // same radius. What is new is the EXPIRY, which used to be updateBullets'
  // `life <= 0` branch — a mine has always exploded rather than faded, and it
  // still does, through the death path instead of through explodeEnemyBullet.
  function updateMine(e, dx, dy, d, st, dt) {
    e.vx *= Math.pow(0.94, dt * 60);
    e.vy *= Math.pow(0.94, dt * 60);
    e.armed = Math.max(0, (e.armed || 0) - dt);
    e.life -= dt;
    if (e.life <= 0) { killEnemy(e, "expiry"); return; }
    if (e.armed <= 0 && S.player.alive && distSq(e, S.player) < e.proximity * e.proximity) {
      killEnemy(e, "proximity");
    }
  }

  function spawnChild(parent, type, angle, distance) {
    if (WORLD_BOUNDED) {
      const at = {
        x: clamp(parent.x + Math.cos(angle) * distance, 0, ARENA_W),
        y: clamp(parent.y + Math.sin(angle) * distance, 0, ARENA_H), kind: "portal", type: type
      };
      const child = spawnEnemy(at, type);
      child.parent = parent.id;
      child.ownerId = parent.id;
      child.emerge = child.emergeMax = 0.42;
      child.phase = angle;
      return child;
    }
    const at = {
      x: wrap(parent.x + Math.cos(angle) * distance, W),
      y: wrap(parent.y + Math.sin(angle) * distance, H), kind: "portal", type: type
    };
    const child = spawnEnemy(at, type);
    child.parent = parent.id;
    child.ownerId = parent.id;
    child.emerge = child.emergeMax = 0.42;
    child.phase = angle;
    return child;
  }

  function updateDirector(dt) {
    S.waveTime += dt;
    for (let i = S.schedule.length - 1; i >= 0; i--) {
      if (S.schedule[i].due <= S.time) {
        queueGroup(S.schedule[i]);
        S.schedule.splice(i, 1);
      }
    }
    const def = WAVES[S.wave];
    if (def.gate) {
      let pending = false;
      for (let i = 0; i < S.schedule.length; i++) {
        if (S.schedule[i].wave === S.wave && S.schedule[i].type === def.gate) pending = true;
      }
      for (let i = 0; i < S.entries.length; i++) {
        if (!S.entries[i].spawned && S.entries[i].wave === S.wave && S.entries[i].type === def.gate) pending = true;
      }
      for (let i = 0; i < S.enemies.length; i++) {
        if (!S.enemies[i].dead && S.enemies[i].type === def.gate) pending = true;
      }
      S.gateTimer = pending ? 0 : S.gateTimer + dt;
      if (S.waveTime > 1 && S.gateTimer > 2.15) advanceWave(false);
    } else if (S.waveTime >= def.duration) {
      advanceWave(false);
    }
  }

  function updateEntries(dt) {
    for (let i = S.entries.length - 1; i >= 0; i--) {
      const e = S.entries[i];
      setPrevious(e);
      e.age += dt;
      e.spin += dt * (e.kind === "portal" ? 1.7 : 0.8);
      if (!e.spawned && e.age >= e.duration) {
        e.spawned = true;
        spawnEnemy(e);
      }
      if (e.age > e.duration + 0.65) S.entries.splice(i, 1);
    }
  }

  function nearestTarget() {
    const p = S.player;
    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < S.enemies.length; i++) {
      const e = S.enemies[i];
      if (e.dead || e.emerge > e.emergeMax * 0.25) continue;
      // MINES ARE EXCLUDED OUTRIGHT, not merely deprioritized. STATS.mine's
      // huge priority makes a mine the LAST thing the driver wants; it does not
      // make it something the driver will not take, and cross-vendor review
      // staged the difference: when a live mine is the ONLY eligible body, the
      // score comparison has nothing to beat it and the driver acquires it,
      // records its id and steers at it. A ranking can always be won by
      // default. An exclusion cannot.
      //
      // THIS IS TEST-DRIVER POLICY AND NOT D25, and the two must not be merged.
      // D25 rules what a WEAPON may acquire and deliberately ADMITS a promoted
      // CONSTRUCT — that ruling lives in Engine.ACQUIRE and is untouched here.
      // This driver is a stand-in for a human, and a human does not fly at
      // mines. Changing ACQUIRE.DEFAULT to express it would re-rule D25 by
      // side effect.
      if (e.type === "mine") continue;
      let priority = STATS[e.type].priority || 0;
      if (e.type === "snapper" && !e.vulnerable) priority += 12000;
      const score = distSq(p, e) + priority;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  function leadTarget(p, e, speed) {
    const dx = delta(p.x, e.x, W);
    const dy = delta(p.y, e.y, H);
    const rvx = e.vx - p.vx * 0.18;
    const rvy = e.vy - p.vy * 0.18;
    const a = rvx * rvx + rvy * rvy - speed * speed;
    const b = 2 * (dx * rvx + dy * rvy);
    const c = dx * dx + dy * dy;
    let t = Math.sqrt(c) / speed;
    const disc = b * b - 4 * a * c;
    if (disc >= 0 && Math.abs(a) > 0.001) {
      const t1 = (-b - Math.sqrt(disc)) / (2 * a);
      const t2 = (-b + Math.sqrt(disc)) / (2 * a);
      if (t1 > 0) t = t1;
      else if (t2 > 0) t = t2;
    }
    t = clamp(t, 0, 0.9);
    return { x: dx + rvx * t, y: dy + rvy * t, t: t };
  }

  function playerAimTarget(e) {
    if (WORLD_BOUNDED) {
      if (e.type === "stationOmega") {
        const node = clamp(e.brokenNodes || 0, 0, 4);
        const a = e.angle + node * TAU / 5;
        return {
          x: clamp(e.x + Math.cos(a) * e.r * 0.48, 0, ARENA_W),
          y: clamp(e.y + Math.sin(a) * e.r * 0.48, 0, ARENA_H),
          vx: e.vx, vy: e.vy
        };
      }
      if (e.type === "snapper" && e.vulnerable) {
        return {
          x: clamp(e.x + Math.cos(e.angle) * 8, 0, ARENA_W),
          y: clamp(e.y + Math.sin(e.angle) * 8, 0, ARENA_H),
          vx: e.vx, vy: e.vy
        };
      }
      return e;
    }
    if (e.type === "stationOmega") {
      const node = clamp(e.brokenNodes || 0, 0, 4);
      const a = e.angle + node * TAU / 5;
      return {
        x: wrap(e.x + Math.cos(a) * e.r * 0.48, W),
        y: wrap(e.y + Math.sin(a) * e.r * 0.48, H),
        vx: e.vx, vy: e.vy
      };
    }
    if (e.type === "snapper" && e.vulnerable) {
      return {
        x: wrap(e.x + Math.cos(e.angle) * 8, W),
        y: wrap(e.y + Math.sin(e.angle) * 8, H),
        vx: e.vx, vy: e.vy
      };
    }
    return e;
  }

  function playerMayFireAt(e) {
    // MINES ARE REFUSED — the second of the promotion's three couplings, and
    // the pair to STATS.mine's explicit priority. Priority keeps the autopilot
    // from STEERING at mines; this keeps it from SHOOTING at them. Both are
    // needed, because nearestTarget and this predicate answer different
    // questions and the AUTO fixture is flown by a driver that consults each.
    //
    // TEST-DRIVER POLICY, NOT D25. D25 rules what a WEAPON may acquire and
    // lives in js/engine.js's ACQUIRE mask; this is a stand-in for a human, and
    // a human does not reflexively shoot mines either.
    if (e.type === "mine") return false;
    if (e.type === "snapper" && !e.vulnerable) return false;
    if (e.type === "bulwark" && e.state !== "retaliate") {
      const toPlayer = Math.atan2(delta(e.y, S.player.y, H), delta(e.x, S.player.x, W));
      if (e.shieldHeat >= 4 && Math.abs(angleDelta(e.angle, toPlayer)) < 1.18) return false;
    }
    if (e.type === "minelayer") {
      const toPlayer = Math.atan2(delta(e.y, S.player.y, H), delta(e.x, S.player.x, W));
      if (Math.abs(angleDelta(e.angle, toPlayer)) < 1.0) return false;
    }
    return true;
  }

  function updatePlayer(dt) {
    const p = S.player;
    setPrevious(p);
    p.pangle = p.angle;
    p.invuln = Math.max(0, p.invuln - dt);
    p.flash = Math.max(0, p.flash - dt);
    p.fire -= dt;
    if (!p.alive) {
      p.vx *= 0.97;
      p.vy *= 0.97;
      S.respawn -= dt;
      if (S.respawn <= 0) respawnPlayer();
      return;
    }

    const target = nearestTarget();
    p.target = target ? target.id : 0;
    // One provider call, one tick — never inside a loop, never twice. With a pilot
    // installed a null or malformed return becomes the EMPTY frame, which is HUMAN
    // semantics with nothing held; it never hands the tick back to the autopilot.
    let input = null;
    if (pilot) {
      const f = pilot();
      input = f && typeof f === "object" ? f : {};
    }
    let moveX = Math.cos(S.time * 0.43 + S.seed * 0.00001);
    let moveY = Math.sin(S.time * 0.37 + 1.2);
    let aimAngle = Math.atan2(moveY, moveX);
    let targetDistance = 999;
    if (target) {
      const lead = leadTarget(p, playerAimTarget(target), 650);
      targetDistance = Math.hypot(lead.x, lead.y);
      aimAngle = Math.atan2(lead.y, lead.x);
      const direct = norm(lead.x, lead.y);
      const rangeBias = targetDistance > 270 ? 0.8 : targetDistance < 135 ? -1.1 : 0.05;
      moveX = direct.x * rangeBias + -direct.y * 0.78;
      moveY = direct.y * rangeBias + direct.x * 0.78;
    }

    // HUMAN mode overrides the autopilot's two decisions — where to go and where
    // to aim — by overwriting them AFTER the block above has run. The block above
    // is therefore untouched text: a reviewer reads it and sees the reference.
    // leadTarget and playerAimTarget still run in HUMAN mode. All four aim helpers
    // are RNG-free, so this costs arithmetic only, and it keeps both modes drawing
    // from the RNG stream identically inside updatePlayer — which the AUTO-vs-HUMAN
    // comparison at PORT-S will want. targetDistance keeps whatever AUTO computed;
    // under rulings H2 and H3 nothing in HUMAN mode reads it.
    //
    // The aim angle goes through delta() and the ARGUMENT ORDER is load-bearing:
    // delta(from, to, size) returns the wrapped to - from, so the player is the
    // `from` argument. The world is toroidal until PORT-W, and a raw aimY - p.y
    // swings the ship the long way round whenever the cursor and the ship sit on
    // opposite sides of a wrap seam. A non-finite aim keeps p.angle.
    //
    // Each frame field is read EXACTLY ONCE per tick, into a local, and only the
    // local is validated and used — so an accessor cannot pass the finite test and
    // then substitute a different value on the read that follows it.
    if (input) {
      moveX = fin(input.x);
      moveY = fin(input.y);
      const aimX = input.aimX;
      const aimY = input.aimY;
      aimAngle = Number.isFinite(aimX) && Number.isFinite(aimY)
        ? Math.atan2(delta(p.y, aimY, H), delta(p.x, aimX, W))
        : p.angle;
    }

    // Predictive projectile avoidance. The pilot examines the closest point on
    // each hostile trajectory over the next half-second, then burns laterally.
    let avoidX = 0;
    let avoidY = 0;
    let danger = 0;
    for (let i = 0; i < S.bullets.length; i++) {
      const b = S.bullets[i];
      if (b.team !== "enemy" || b.dead) continue;
      const rx = delta(b.x, p.x, W);
      const ry = delta(b.y, p.y, H);
      const rvx = p.vx - b.vx;
      const rvy = p.vy - b.vy;
      const vv = rvx * rvx + rvy * rvy || 1;
      const t = clamp(-(rx * rvx + ry * rvy) / vv, 0, 0.6);
      const cx = rx + rvx * t;
      const cy = ry + rvy * t;
      const d = Math.hypot(cx, cy);
      if (d < 92) {
        const side = Math.sign(rvx * cy - rvy * cx) || 1;
        const w = (92 - d) / 92 * (1 - t * 0.7);
        const rv = norm(rvx, rvy);
        avoidX += -rv.y * side * w;
        avoidY += rv.x * side * w;
        danger += w;
      }
      if ((b.kind === "mine" || b.kind === "vortex" || b.kind === "plasma" || b.kind === "splitter") && d < 165) {
        const w = (165 - d) / 165 * (b.kind === "mine" ? 2.1 : 1.15);
        avoidX += rx / (d || 1) * w;
        avoidY += ry / (d || 1) * w;
        danger += w;
      }
    }
    for (let i = 0; i < S.enemies.length; i++) {
      const e = S.enemies[i];
      const bodyDanger = e.type === "hammerhead" || e.type === "drone" || e.type === "snapper" ||
        e.type === "spitfire" || e.type === "stationOmega" || e.type === "starEater";
      if (e.dead || e.emerge > e.emergeMax * 0.25 || !bodyDanger) continue;
      const dx = delta(e.x, p.x, W);
      const dy = delta(e.y, p.y, H);
      const d = Math.hypot(dx, dy);
      if (e.type === "hammerhead" && (e.state === "telegraph" || e.state === "dash")) {
        const ca = Math.cos(e.dashAngle);
        const sa = Math.sin(e.dashAngle);
        const along = dx * ca + dy * sa;
        const across = -dx * sa + dy * ca;
        if (along > 0 && along < 520 && Math.abs(across) < 92) {
          const side = Math.sign(across) || e.orbit || 1;
          const w = (1 - Math.abs(across) / 92) * (e.state === "dash" ? 2.3 : 1.45);
          avoidX += -sa * side * w;
          avoidY += ca * side * w;
          danger += w;
        }
      }
      if (e.type === "snapper" && (e.state === "open" || e.state === "lunge")) {
        addLaneAvoidance(e, e.dashAngle, dx, dy, e.state === "lunge" ? 2.5 : 1.6, 430, 78, function (x, y, w) {
          avoidX += x * w; avoidY += y * w; danger += w;
        });
      }
      if (e.type === "spitfire" && e.state === "lanceCharge") {
        addLaneAvoidance(e, e.chargeAngle, dx, dy, 2.15, 620, 90, function (x, y, w) {
          avoidX += x * w; avoidY += y * w; danger += w;
        });
      }
      if (e.type === "starEater" && (e.state === "lungeTell" || e.state === "lunge" || e.state === "beam")) {
        addLaneAvoidance(e, e.dashAngle || e.angle, dx, dy, e.state === "lunge" ? 3 : 2, Math.max(PLAY_W, PLAY_H), 125, function (x, y, w) {
          avoidX += x * w; avoidY += y * w; danger += w;
        });
      }
      if (e.type === "stationOmega" && e.state === "lasers") {
        for (let ri = 0; ri < 6; ri++) {
          const rayAngle = ri === 0 ? e.angle : e.angle + (ri - 1) * TAU / 5;
          addLaneAvoidance(e, rayAngle, dx, dy, 1.45, Math.max(PLAY_W, PLAY_H), 54, function (x, y, w) {
            avoidX += x * w; avoidY += y * w; danger += w;
          });
        }
      }
      if (e.type === "starEater" && e.state === "crossings") {
        const segments = starEaterSegments(e);
        for (let si = 0; si < segments.length; si++) {
          const sdx = delta(segments[si].x, p.x, W);
          const sdy = delta(segments[si].y, p.y, H);
          const sd = Math.hypot(sdx, sdy);
          if (sd < 118) {
            const w = (118 - sd) / 118 * 2.1;
            avoidX += sdx / (sd || 1) * w;
            avoidY += sdy / (sd || 1) * w;
            danger += w;
          }
        }
      }
      const avoidRadius = e.r + (e.type === "starEater" ? 125 : e.type === "stationOmega" ? 90 : 105);
      if (d < avoidRadius) {
        const w = (avoidRadius - d) / avoidRadius;
        avoidX += dx / (d || 1) * w * 1.8;
        avoidY += dy / (d || 1) * w * 1.8;
        danger += w;
      }
    }
    // Ruling H1: no auto-dodge in HUMAN mode. The whole avoidance sweep above KEEPS
    // RUNNING in both modes on purpose — it draws no RNG, it costs one pass over
    // ~30 bodies, and leaving it in place removes any question about whether this
    // seam moved the stream. HUMAN simply ignores its output. Do not "optimize" it
    // behind the branch in a later round; that trade is a divergence, not a saving.
    if (!input && danger > 0.08) {
      moveX += avoidX * 2.8;
      moveY += avoidY * 2.8;
    }
    // norm(0, 0) returns m = 1, not 0, so move.m cannot be the idle test, and with
    // no key held Math.atan2(0, 0) is 0 — which would pin the exhaust trail to world
    // angle 0 while the ship coasts. Guard on the raw axes. In AUTO the guard is
    // !input, always true, so this line keeps its exact reference behaviour.
    const move = norm(moveX, moveY);
    if (!input || moveX !== 0 || moveY !== 0) p.thrustAngle = Math.atan2(move.y, move.x);
    // Rulings H1 and H3: calm turn rate always, one fixed thrust, no 295 tier. Each
    // AUTO sub-expression is preserved character for character to the right of the
    // `input ?`.
    p.angle = rotateToward(p.angle, aimAngle, dt * (input ? 6.4 : danger > 0.6 ? 8.5 : 6.4));
    const thrust = input ? 300 : danger > 0.5 ? 410 : target ? (targetDistance > 160 ? 300 : 210) : 160;
    p.vx += move.x * thrust * dt;
    p.vy += move.y * thrust * dt;
    const drag = Math.pow(0.985, dt * 60);
    p.vx *= drag;
    p.vy *= drag;
    const maxSpeed = !input && danger > 0.6 ? 295 : 245;
    const v = norm(p.vx, p.vy);
    if (v.m > maxSpeed) { p.vx = v.x * maxSpeed; p.vy = v.y * maxSpeed; }
    if (WORLD_BOUNDED) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const r = 8;
      if (p.x < r) { p.x = r * 2 - p.x; p.vx *= -(1 - PLAYER_WALL_LOSS); }
      else if (p.x > ARENA_W - r) { p.x = (ARENA_W - r) * 2 - p.x; p.vx *= -(1 - PLAYER_WALL_LOSS); }
      if (p.y < r) { p.y = r * 2 - p.y; p.vy *= -(1 - PLAYER_WALL_LOSS); }
      else if (p.y > ARENA_H - r) { p.y = (ARENA_H - r) * 2 - p.y; p.vy *= -(1 - PLAYER_WALL_LOSS); }
    } else {
      p.x = wrap(p.x + p.vx * dt, W);
      p.y = wrap(p.y + p.vy * dt, H);
    }

    p.trail -= dt;
    if (p.trail <= 0) {
      p.trail = 0.018;
      const backX = p.x - Math.cos(p.thrustAngle) * 12;
      const backY = p.y - Math.sin(p.thrustAngle) * 12;
      particle(backX, backY, -Math.cos(p.thrustAngle) * fxRange(90, 170) - p.vx * 0.08,
        -Math.sin(p.thrustAngle) * fxRange(90, 170) - p.vy * 0.08,
        fxRand() < 0.25 ? "magenta" : "cyan", fxRange(0.22, 0.5), fxRange(1.2, 2.7), "trail");
    }

    // Ruling H2: the human trigger is COOLDOWN ONLY. LMB fires along the nose, with
    // no target, no alignment window and no range gate — firePlayer fires along
    // p.angle and never reads the target, so it needs nothing else.
    if (input
      ? (input.fire && p.fire <= 0)
      : (target && playerMayFireAt(target) && p.fire <= 0 && Math.abs(angleDelta(p.angle, aimAngle)) < 0.32 && targetDistance < Math.max(PLAY_W, PLAY_H) * 0.7)) {
      firePlayer();
      p.fire = Math.max(0.075, 0.13 - (S.level - 1) * 0.003);
    }
  }

  function addLaneAvoidance(entity, angle, dx, dy, weight, length, width, apply) {
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const along = dx * ca + dy * sa;
    const across = -dx * sa + dy * ca;
    if (along <= 0 || along >= length || Math.abs(across) >= width) return;
    const side = Math.sign(across) || entity.orbit || 1;
    const w = (1 - Math.abs(across) / width) * weight;
    apply(-sa * side, ca * side, w);
  }

  function firePlayer() {
    if (WORLD_BOUNDED) {
      const p = S.player;
      const alternating = S.tick & 1 ? 1 : -1;
      const sideX = -Math.sin(p.angle) * alternating * 4.2;
      const sideY = Math.cos(p.angle) * alternating * 4.2;
      const speed = 650;
      const x = clamp(p.x + Math.cos(p.angle) * 14 + sideX, 0, ARENA_W);
      const y = clamp(p.y + Math.sin(p.angle) * 14 + sideY, 0, ARENA_H);
      S.bullets.push({
        id: nextId++, team: "player", kind: "bolt", x: x, y: y, px: x, py: y,
        vx: Math.cos(p.angle) * speed + p.vx * 0.22,
        vy: Math.sin(p.angle) * speed + p.vy * 0.22,
        r: 2.2, life: 1.05, damage: 2, color: alternating > 0 ? "cyan" : "ink", dead: false
      });
      for (let i = 0; i < 2; i++) {
        particle(x, y, -Math.cos(p.angle) * fxRange(15, 60), -Math.sin(p.angle) * fxRange(15, 60),
          alternating > 0 ? "cyan" : "ink", fxRange(0.08, 0.17), fxRange(0.7, 1.4), "spark");
      }
      return;
    }
    const p = S.player;
    const alternating = S.tick & 1 ? 1 : -1;
    const sideX = -Math.sin(p.angle) * alternating * 4.2;
    const sideY = Math.cos(p.angle) * alternating * 4.2;
    const speed = 650;
    const x = wrap(p.x + Math.cos(p.angle) * 14 + sideX, W);
    const y = wrap(p.y + Math.sin(p.angle) * 14 + sideY, H);
    S.bullets.push({
      id: nextId++, team: "player", kind: "bolt", x: x, y: y, px: x, py: y,
      vx: Math.cos(p.angle) * speed + p.vx * 0.22,
      vy: Math.sin(p.angle) * speed + p.vy * 0.22,
      r: 2.2, life: 1.05, damage: 2, color: alternating > 0 ? "cyan" : "ink", dead: false
    });
    for (let i = 0; i < 2; i++) {
      particle(x, y, -Math.cos(p.angle) * fxRange(15, 60), -Math.sin(p.angle) * fxRange(15, 60),
        alternating > 0 ? "cyan" : "ink", fxRange(0.08, 0.17), fxRange(0.7, 1.4), "spark");
    }
  }

  function respawnPlayer() {
    const p = S.player;
    if (WORLD_BOUNDED) {
      p.x = p.px = ARENA_W * 0.5;
      p.y = p.py = ARENA_H * 0.55;
    } else {
      p.x = p.px = PLAY_W * 0.5;
      p.y = p.py = PLAY_H * 0.55;
    }
    p.vx = 0;
    p.vy = -25;
    p.hull = p.maxHull;
    p.alive = true;
    p.invuln = 2.4;
    S.bullets = S.bullets.filter(function (b) {
      return b.team === "player" || distSq(b, p) > 260 * 260;
    });
    // ...AND THE MINES WITH THEM. Before the promotion a mine was an enemy
    // round and this same filter swept it; afterwards it lives in S.enemies and
    // would survive, so a pilot could respawn on top of an armed one. The
    // semantics are preserved deliberately — same radius, same silent removal,
    // no detonation — rather than allowed to lapse because the storage moved.
    // Marked rather than spliced, so the compaction filter at the end of
    // updateEnemies removes them on the tick's own schedule.
    for (let i = 0; i < S.enemies.length; i++) {
      const m = S.enemies[i];
      if (m.type === "mine" && !m.dead && distSq(m, p) <= 260 * 260) m.dead = true;
    }
    emitShockwave(p.x, p.y, "cyan", 16, 125, 0.85);
    burst(p.x, p.y, "cyan", 18, 125);
  }

  function damagePlayer(amount, x, y) {
    const p = S.player;
    if (!p.alive || p.invuln > 0) return false;
    // The kernel's ship leg of the funnel. The signature and both gates above
    // are untouched, exactly as production's hitPlayer keeps its own.
    // NO SOURCE, and for the same reason hitPlayer has none: every caller here
    // — a bullet, a lance, a beam, a mine, a hammerhead's detonation — arrives
    // with nothing but an amount and a point. The event is UNCLASSIFIED, the
    // matrix is not consulted, and no identity field is written, so the player
    // record grows no key the demo-v2 serializer would notice.
    Engine.applyEffect({ kind: "hit", target: p, tgtCls: Engine.CLASS.SHIP, baseAmount: amount });
    p.invuln = 0.42;
    p.flash = 0.18;
    S.shake = Math.max(S.shake, Math.min(7, amount * 0.27));
    burst(x == null ? p.x : x, y == null ? p.y : y, "red", 9, 95);
    emitShockwave(p.x, p.y, "red", 5, 32, 0.32);
    if (p.hull <= 0) {
      p.hull = 0;
      p.alive = false;
      S.respawn = 1.8;
      burst(p.x, p.y, "cyan", 24, 205);
      burst(p.x, p.y, "magenta", 16, 145);
      emitFragments(p.x, p.y, "cyan", 7, 190);
      emitShockwave(p.x, p.y, "ink", 18, 100, 0.8);
      S.shake = 9;
    }
    sink.state();
    return true;
  }

  function enemySeparation(e, radius) {
    let sx = 0;
    let sy = 0;
    let hits = 0;
    for (let i = 0; i < S.enemies.length; i++) {
      const other = S.enemies[i];
      // MINES ARE EXCLUDED, and this is one of the three couplings the entity
      // promotion arrives with rather than earns. Separation is a STEERING
      // force between things that move; a mine is a placed hazard that drifts
      // to a stop, and letting it push live bodies off their orbits would be a
      // behaviour nobody asked for arriving as a side effect of a storage
      // decision. It is not the mine's job to herd the minelayer that laid it.
      if (other === e || other.dead || other.type === "mine") continue;
      const dx = delta(other.x, e.x, W);
      const dy = delta(other.y, e.y, H);
      const d = Math.hypot(dx, dy);
      const min = radius + other.r * 0.55;
      if (d > 0 && d < min) {
        const force = (min - d) / min;
        sx += dx / d * force;
        sy += dy / d * force;
        hits++;
      }
    }
    return hits ? { x: sx / hits, y: sy / hits } : { x: 0, y: 0 };
  }

  function steer(e, desiredX, desiredY, accel, maxSpeed, dt) {
    const d = norm(desiredX, desiredY);
    e.vx += d.x * accel * dt;
    e.vy += d.y * accel * dt;
    const v = norm(e.vx, e.vy);
    if (v.m > maxSpeed) { e.vx = v.x * maxSpeed; e.vy = v.y * maxSpeed; }
  }

  function radialOrbit(e, dx, dy, preferred, orbitWeight) {
    const d = Math.hypot(dx, dy) || 1;
    let radial = d > preferred + 22 ? 1 : d < preferred - 22 ? -1 : 0;
    const sep = enemySeparation(e, e.r * 3.2);
    return {
      x: dx / d * radial + (-dy / d) * e.orbit * orbitWeight + sep.x * 1.35,
      y: dy / d * radial + (dx / d) * e.orbit * orbitWeight + sep.y * 1.35,
      distance: d
    };
  }

  function updateEnemies(dt) {
    const p = S.player;
    const enemyCount = S.enemies.length;
    for (let i = 0; i < enemyCount; i++) {
      const e = S.enemies[i];
      if (e.dead) continue;
      setPrevious(e);
      e.pangle = e.angle;
      e.pphase = e.phase;
      e.hit = Math.max(0, e.hit - dt);
      e.contact = Math.max(0, e.contact - dt);
      e.cooldown -= dt;
      e.attackTimer -= dt;
      e.auxTimer -= dt;
      e.phaseTime += dt;
      e.shieldPulse = Math.max(0, e.shieldPulse - dt);
      e.weakPulse = Math.max(0, e.weakPulse - dt);
      if (e.emerge > 0) {
        e.emerge -= dt;
        e.vx *= 0.94;
        e.vy *= 0.94;
        e.angle += dt * 2.4;
        // Enemies become active for the final quarter of their emergence,
        // matching the game's documented 70–80% interactable threshold.
        if (e.emerge > e.emergeMax * 0.25) continue;
      }
      const dx = delta(e.x, p.x, W);
      const dy = delta(e.y, p.y, H);
      const d = Math.hypot(dx, dy) || 1;
      const st = STATS[e.type];

      // THE BODY'S BEHAVIOUR SUBSTREAM, for the length of this dispatch and no
      // longer. Keyed on (seed, wave, this body's id, this tick), so two bodies
      // deciding on the same tick cannot reach each other and a body that stops
      // deciding cannot shift the one after it in the array. Cleared straight
      // after the chain, so an update function reached from anywhere else
      // throws by name instead of drawing from whichever body ran last.
      bodyGen = Engine.substream(S.seed, S.wave, 0, e.id, S.tick, Engine.PURPOSE.BEHAVIOR);

      if (e.type === "swarmling") updateSwarmling(e, dx, dy, d, st, dt);
      else if (e.type === "warden") updateWarden(e, dx, dy, d, st, dt);
      else if (e.type === "interceptor") updateInterceptor(e, dx, dy, d, st, dt);
      else if (e.type === "hammerhead") updateHammerhead(e, dx, dy, d, st, dt);
      else if (e.type === "hive") updateHive(e, dx, dy, d, st, dt);
      else if (e.type === "drone") updateDrone(e, dx, dy, d, st, dt);
      else if (e.type === "tracer") updateTracer(e, dx, dy, d, st, dt);
      else if (e.type === "minelayer") updateMinelayer(e, dx, dy, d, st, dt);
      else if (e.type === "myrmidon") updateMyrmidon(e, dx, dy, d, st, dt);
      else if (e.type === "snapper") updateSnapper(e, dx, dy, d, st, dt);
      else if (e.type === "bulwark") updateBulwark(e, dx, dy, d, st, dt);
      else if (e.type === "cherub") updateCherub(e, dx, dy, d, st, dt);
      else if (e.type === "constructor") updateConstructor(e, dx, dy, d, st, dt);
      else if (e.type === "turret") updateTurret(e, dx, dy, d, st, dt);
      else if (e.type === "vanguard") updateVanguard(e, dx, dy, d, st, dt);
      else if (e.type === "pulsar") updatePulsar(e, dx, dy, d, st, dt);
      else if (e.type === "omegaDefender") updateOmegaDefender(e, dx, dy, d, st, dt);
      else if (e.type === "spitfire") updateSpitfire(e, dx, dy, d, st, dt);
      else if (e.type === "stationOmega") updateStationOmega(e, dx, dy, d, st, dt);
      else if (e.type === "starEater") updateStarEater(e, dx, dy, d, st, dt);
      else if (e.type === "mine") updateMine(e, dx, dy, d, st, dt);
      bodyGen = null; // the slice is over — see the guard on bodyRand

      if (e.dead) continue;
      const nextX = e.x + e.vx * dt;
      const nextY = e.y + e.vy * dt;
      if (e.type === "warden" && e.state === "escape") {
        // Wardens attack once, then leave instead of wrapping back in.
        if (WORLD_BOUNDED) {
          e.x = nextX;
          e.y = nextY;
          if (e.x < e.efx - 60 || e.x > e.efx + PLAY_W + 60 || e.y < e.efy - 60 || e.y > e.efy + PLAY_H + 60) {
            e.dead = true;
            burst(clamp(e.x, 0, ARENA_W), clamp(e.y, 0, ARENA_H), "red", 3, 28);
            continue;
          }
        } else {
          e.x = nextX;
          e.y = nextY;
          if (e.x < 0 || e.x > W || e.y < 0 || e.y > H) {
            e.dead = true;
            burst(clamp(e.x, 0, W), clamp(e.y, 0, H), "red", 3, 28);
            continue;
          }
        }
      } else {
        if (WORLD_BOUNDED) {
          e.x = clamp(nextX, 0, ARENA_W);
          e.y = clamp(nextY, 0, ARENA_H);
        } else {
          e.x = wrap(nextX, W);
          e.y = wrap(nextY, H);
        }
      }

      if (e.type === "warden" && e.state === "escape") continue;
      // MINES ARE EXCLUDED FROM THE GENERIC CONTACT BLOCK — the third coupling,
      // and the one that would have been a real behaviour change if it were
      // left alone. That block deals `st.contact || 6` and applies a 110-unit
      // knockback to the body; a mine would take the knockback and NOT detonate,
      // which is a mine that bounces off you.
      //
      // AND THE UNARMED CASE IS THE ONE THAT MATTERS. Today an unarmed mine is
      // HARMLESS — resolveBulletHits carried `!(b.kind === "mine" && b.armed >
      // 0)` and refused it. As an ordinary entity it would deal 6 on touch
      // during its own 0.72 s fuse, so a minelayer could hurt a pilot by laying
      // one on him. That is a change nobody ruled, and this line is what stops
      // it.
      //
      // THE ORDER IS ALSO CHECKED RATHER THAN ASSUMED: updateMine runs in the
      // type dispatch above, and a detonation there sets e.dead, which the
      // `if (e.dead) continue` between the dispatch and this block skips on. So
      // even without this exclusion the proximity trigger (r 74) would fire
      // long before contact (r 19) for an ARMED mine. The exclusion is what
      // covers the UNARMED one, and a leg pins both.
      if (p.alive && e.contact <= 0 && e.type !== "mine") {
        const contactD = e.r + 8;
        if (distSq(e, p) < contactD * contactD) {
          let amount = st.contact || (e.type === "hive" ? 13 : 6);
          if (e.type === "hammerhead" && e.state === "dash") amount = 24;
          if (e.type === "snapper" && e.state !== "lunge") amount = 5;
          if (damagePlayer(amount, p.x, p.y)) {
            e.contact = 0.7;
            const away = norm(delta(p.x, e.x, W), delta(p.y, e.y, H));
            e.vx += away.x * 110;
            e.vy += away.y * 110;
            if (e.type === "drone") killEnemy(e, "impact");
          }
        }
      }
      if (e.type === "starEater" && p.alive && e.contact <= 0) {
        const segments = starEaterSegments(e);
        for (let si = 0; si < segments.length; si++) {
          if (distSq(segments[si], p) < 46 * 46 && damagePlayer(15, p.x, p.y)) {
            e.contact = 0.7;
            break;
          }
        }
      }
    }
    S.enemies = S.enemies.filter(function (e) { return !e.dead; });
  }

  function updateSwarmling(e, dx, dy, d, st, dt) {
    const move = radialOrbit(e, dx, dy, 116 + Math.sin(e.phase) * 8, 0.72);
    steer(e, move.x, move.y, st.accel, st.speed, dt);
    e.angle = rotateToward(e.angle, Math.atan2(dy, dx), dt * 7.2);
    e.phase += dt * 1.7;
    if (e.lance > 0) {
      const before = e.lance;
      e.lance -= dt;
      const elapsed = 0.44 - e.lance;
      if (!e.lanceHit && elapsed > 0.21 && elapsed < 0.35) {
        e.lanceHit = true;
        if (lanceHitsPlayer(e, e.lanceAngle, 132, 10)) damagePlayer(7, S.player.x, S.player.y);
      }
      if (before > 0 && e.lance <= 0) e.cooldown = bodyRange(1.15, 1.7);
    } else if (e.cooldown <= 0 && d < 158) {
      const lead = leadTarget(e, S.player, 900);
      e.lanceAngle = Math.atan2(lead.y, lead.x);
      e.lance = 0.44;
      e.lanceHit = false;
    }
  }

  function lanceHitsPlayer(e, angle, length, width) {
    const px = delta(e.x, S.player.x, W);
    const py = delta(e.y, S.player.y, H);
    const along = px * Math.cos(angle) + py * Math.sin(angle);
    const across = Math.abs(-px * Math.sin(angle) + py * Math.cos(angle));
    return along > 0 && along < length && across < width + 7;
  }

  function updateWarden(e, dx, dy, d, st, dt) {
    if (e.state === "charge") {
      e.timer -= dt;
      e.vx *= Math.pow(0.9, dt * 60);
      e.vy *= Math.pow(0.9, dt * 60);
      const lead = leadTarget(e, S.player, 260);
      e.chargeAngle = rotateToward(e.chargeAngle, Math.atan2(lead.y, lead.x), dt * 0.8);
      e.angle = rotateToward(e.angle, e.chargeAngle, dt * 3);
      if (e.timer <= 0) {
        spawnEnemyBullet(e, e.chargeAngle, "heavy");
        e.state = "escape";
        e.timer = 4.5;
        e.orbit = bodyRand() < 0.5 ? -1 : 1;
        let exits;
        if (WORLD_BOUNDED) {
          exits = [
            { d: e.x - e.efx, a: Math.PI },
            { d: e.efx + PLAY_W - e.x, a: 0 },
            { d: e.y - e.efy, a: -Math.PI * 0.5 },
            { d: e.efy + PLAY_H - e.y, a: Math.PI * 0.5 }
          ];
        } else {
          exits = [
            { d: e.x, a: Math.PI },
            { d: W - e.x, a: 0 },
            { d: e.y, a: -Math.PI * 0.5 },
            { d: H - e.y, a: Math.PI * 0.5 }
          ];
        }
        exits.sort(function (a, b) { return a.d - b.d; });
        e.escapeAngle = exits[0].a + e.orbit * 0.16;
      }
      return;
    }
    if (e.state === "escape") {
      e.timer -= dt;
      const curve = Math.sin((4.5 - e.timer) * 1.7) * 0.18 * e.orbit;
      const escapeAngle = e.escapeAngle + curve;
      steer(e, Math.cos(escapeAngle), Math.sin(escapeAngle), st.accel * 2.4, st.speed * 3.4, dt);
      e.angle = rotateToward(e.angle, Math.atan2(e.vy, e.vx), dt * 3.8);
      if (e.timer <= 0) e.dead = true;
      return;
    }
    const move = radialOrbit(e, dx, dy, 245, 0.32);
    steer(e, move.x, move.y, st.accel, st.speed, dt);
    e.angle = rotateToward(e.angle, Math.atan2(dy, dx), dt * 2.4);
    if (e.cooldown <= 0 && d < 430) {
      const lead = leadTarget(e, S.player, 250);
      e.chargeAngle = Math.atan2(lead.y, lead.x);
      e.state = "charge";
      e.timer = 1.12;
    }
  }

  function updateInterceptor(e, dx, dy, d, st, dt) {
    const move = radialOrbit(e, dx, dy, 205, 1.05);
    if (d < 138) {
      move.x -= dx / d * 1.8;
      move.y -= dy / d * 1.8;
    }
    steer(e, move.x, move.y, st.accel, st.speed, dt);
    if (Math.hypot(e.vx, e.vy) > 8) e.angle = rotateToward(e.angle, Math.atan2(e.vy, e.vx), dt * 5.5);
    if (e.cooldown <= 0 && d < 440) {
      // Commons loose four shots from their broadsides. Starting nearly
      // perpendicular preserves the recognizable safe pocket at the nose.
      for (let side = -1; side <= 1; side += 2) {
        spawnEnemyBullet(e, e.angle + side * (Math.PI * 0.5 - 0.13), "broadside");
        spawnEnemyBullet(e, e.angle + side * (Math.PI * 0.5 + 0.13), "broadside");
      }
      e.cooldown = bodyRange(1.35, 1.75);
    }
  }

  function updateHammerhead(e, dx, dy, d, st, dt) {
    if (e.state === "telegraph") {
      e.timer -= dt;
      e.vx *= Math.pow(0.86, dt * 60);
      e.vy *= Math.pow(0.86, dt * 60);
      e.angle = rotateToward(e.angle, e.dashAngle, dt * 3.5);
      if (e.timer <= 0) {
        e.state = "dash";
        e.timer = 0.62;
        e.vx = Math.cos(e.dashAngle) * 485;
        e.vy = Math.sin(e.dashAngle) * 485;
        burst(e.x, e.y, "orange", 8, 80);
      }
      return;
    }
    if (e.state === "dash") {
      e.timer -= dt;
      e.angle = e.dashAngle;
      particle(e.x - Math.cos(e.angle) * 18, e.y - Math.sin(e.angle) * 18,
        -Math.cos(e.angle) * fxRange(30, 100), -Math.sin(e.angle) * fxRange(30, 100),
        "orange", fxRange(0.15, 0.32), fxRange(1, 2.2), "trail");
      if (e.timer <= 0) { e.state = "recover"; e.timer = 0.95; }
      return;
    }
    if (e.state === "recover") {
      e.timer -= dt;
      e.vx *= Math.pow(0.95, dt * 60);
      e.vy *= Math.pow(0.95, dt * 60);
      if (e.timer <= 0) { e.state = "approach"; e.cooldown = bodyRange(1.1, 1.7); }
      return;
    }
    const move = radialOrbit(e, dx, dy, 285, 0.2);
    steer(e, move.x, move.y, st.accel, st.speed, dt);
    e.angle = rotateToward(e.angle, Math.atan2(dy, dx), dt * 2.7);
    if (e.cooldown <= 0 && d < 470) {
      const t = clamp(d / 485, 0.15, 0.7);
      const tx = dx + S.player.vx * t;
      const ty = dy + S.player.vy * t;
      e.dashAngle = Math.atan2(ty, tx);
      e.state = "telegraph";
      e.timer = 0.92;
    }
  }

  function updateHive(e, dx, dy, d, st, dt) {
    const move = radialOrbit(e, dx, dy, 300, 0.12);
    steer(e, move.x, move.y, st.accel, st.speed, dt);
    e.angle += dt * 0.46;
    e.spawnTimer -= dt;
    if (e.spawnTimer <= 0) {
      let children = 0;
      for (let i = 0; i < S.enemies.length; i++) if (S.enemies[i].parent === e.id && !S.enemies[i].dead) children++;
      if (children < 6) {
        const count = Math.min(3, 6 - children);
        const start = bodyRange(0, TAU);
        for (let i = 0; i < count; i++) spawnDrone(e, start + i * TAU / count);
        emitShockwave(e.x, e.y, "violet", 10, 48, 0.55);
      }
      e.spawnTimer = bodyRange(2.7, 3.5);
    }
  }

  function updateDrone(e, dx, dy, d, st, dt) {
    const tangent = d < 70 ? 0.8 : 0.2;
    const sep = enemySeparation(e, 22);
    steer(e, dx / d - dy / d * e.orbit * tangent + sep.x, dy / d + dx / d * e.orbit * tangent + sep.y,
      st.accel, st.speed, dt);
    e.angle = Math.atan2(e.vy, e.vx);
  }

  function updateTracer(e, dx, dy, d, st, dt) {
    const move = radialOrbit(e, dx, dy, 285, 0.55);
    if (d < 230) { move.x -= dx / d * 1.4; move.y -= dy / d * 1.4; }
    steer(e, move.x, move.y, st.accel, st.speed, dt);
    e.angle = rotateToward(e.angle, Math.atan2(dy, dx), dt * 2.7);
    if (e.state === "combo") {
      e.timer -= dt;
      if (e.timer <= 0) {
        const orb = findBullet(e.comboBullet);
        if (orb && !orb.dead) {
          const ax = delta(e.x, orb.x, W);
          const ay = delta(e.y, orb.y, H);
          spawnEnemyBullet(e, Math.atan2(ay, ax), "flame");
          e.state = "ignite";
          e.timer = clamp(Math.hypot(ax, ay) / 305, 0.12, 0.48);
          return;
        }
        e.state = "stalk";
        e.cooldown = bodyRange(2.0, 2.5);
      }
    } else if (e.state === "ignite") {
      e.timer -= dt;
      if (e.timer <= 0) {
        const orb = findBullet(e.comboBullet);
        if (orb && !orb.dead) triggerPlasmaOrb(orb, e);
        e.state = "stalk";
        e.cooldown = bodyRange(2.0, 2.5);
      }
    } else if (e.cooldown <= 0 && d < 520) {
      const lead = leadTarget(e, S.player, 130);
      const orb = spawnEnemyBullet(e, Math.atan2(lead.y, lead.x), "plasma");
      if (orb) {
        e.comboBullet = orb.id;
        e.state = "combo";
        e.timer = 0.72;
      }
    }
  }

  function updateMinelayer(e, dx, dy, d, st, dt) {
    const aheadX = dx + S.player.vx * 0.7;
    const aheadY = dy + S.player.vy * 0.7;
    const direct = norm(aheadX, aheadY);
    const sep = enemySeparation(e, 58);
    const travelX = direct.x * (d > 260 ? 0.45 : -0.25) - direct.y * e.orbit * 0.95 + sep.x;
    const travelY = direct.y * (d > 260 ? 0.45 : -0.25) + direct.x * e.orbit * 0.95 + sep.y;
    steer(e, travelX, travelY, st.accel, st.speed, dt);
    if (Math.hypot(e.vx, e.vy) > 4) e.angle = rotateToward(e.angle, Math.atan2(e.vy, e.vx), dt * 2.2);
    if (e.cooldown <= 0) {
      // The census walks S.enemies now, because that is where mines live after
      // the promotion. It is the SAME test it always was, routed through the
      // contract that was written from it: this and the hive's six-child census
      // are the two count-then-decline precedents js/engine.js cites, and they
      // conform because they count, then decline, and evict nothing.
      //
      // IT STILL LAYS TWO ON AN ADMISSION OF THREE, so the live count reaches
      // five. That is today's behaviour exactly, kept rather than tidied: the
      // cap is a cadence limiter here, not a hard ceiling, and tightening it
      // would be a feel change nobody ruled.
      let mines = 0;
      for (let i = 0; i < S.enemies.length; i++) {
        if (!S.enemies[i].dead && S.enemies[i].type === "mine" && S.enemies[i].ownerId === e.id) mines++;
      }
      const lay = Engine.capAdmit(Engine.KINDS.kernel.mine, mines);
      if (lay.admit) {
        spawnMine(e, e.angle + Math.PI - 0.24, e.r + 5);
        spawnMine(e, e.angle + Math.PI + 0.24, e.r + 5);
      } else {
        sink.cue(lay.cue, { kind: "mine", x: e.x, y: e.y });
      }
      // Billed either way, and it always was — the cadence sits outside the
      // branch. That is the contract's second clause, already conformant.
      e.cooldown = bodyRange(1.45, 1.85);
    }
  }

  function updateMyrmidon(e, dx, dy, d, st, dt) {
    const move = radialOrbit(e, dx, dy, 345, 0.24);
    steer(e, move.x, move.y, st.accel, st.speed, dt);
    e.angle = rotateToward(e.angle, Math.atan2(dy, dx), dt * 1.45);
    if (e.cooldown <= 0 && d < 590) {
      spawnEnemyBullet(e, e.angle + Math.PI, "grenade");
      e.cooldown = bodyRange(2.5, 3.15);
    }
  }

  function updateSnapper(e, dx, dy, d, st, dt) {
    if (e.state === "open") {
      e.timer -= dt;
      e.vx *= Math.pow(0.84, dt * 60);
      e.vy *= Math.pow(0.84, dt * 60);
      if (e.timer > 0.36) {
        const lead = leadTarget(e, S.player, 465);
        e.dashAngle = rotateToward(e.dashAngle, Math.atan2(lead.y, lead.x), dt * 1.8);
      }
      e.angle = rotateToward(e.angle, e.dashAngle, dt * 4.8);
      if (e.timer <= 0) {
        e.state = "lunge";
        e.timer = 0.62;
        e.vulnerable = false;
        e.vx = Math.cos(e.dashAngle) * 465;
        e.vy = Math.sin(e.dashAngle) * 465;
        burst(e.x, e.y, "magenta", 9, 90);
      }
      return;
    }
    if (e.state === "lunge") {
      e.timer -= dt;
      e.angle = e.dashAngle;
      if (e.timer <= 0) { e.state = "recover"; e.timer = 1.05; }
      return;
    }
    if (e.state === "recover") {
      e.timer -= dt;
      e.vx *= Math.pow(0.94, dt * 60);
      e.vy *= Math.pow(0.94, dt * 60);
      if (e.timer <= 0) { e.state = "seek"; e.cooldown = bodyRange(0.7, 1.15); }
      return;
    }
    const move = radialOrbit(e, dx, dy, 220, 0.5);
    steer(e, move.x, move.y, st.accel, st.speed, dt);
    e.angle = rotateToward(e.angle, Math.atan2(dy, dx), dt * 3);
    if (e.cooldown <= 0 && d < 440) {
      const lead = leadTarget(e, S.player, 465);
      e.dashAngle = Math.atan2(lead.y, lead.x);
      e.state = "open";
      e.timer = 0.95;
      e.vulnerable = true;
    }
  }

  function updateBulwark(e, dx, dy, d, st, dt) {
    if (e.state === "retaliate") {
      e.timer -= dt;
      e.vx *= Math.pow(0.87, dt * 60);
      e.vy *= Math.pow(0.87, dt * 60);
      e.angle = rotateToward(e.angle, Math.atan2(dy, dx), dt * 1.1);
      if (e.attackTimer <= 0) {
        const heat = Math.max(6, e.shieldHeat);
        const count = clamp(5 + Math.floor(heat / 5), 5, 11);
        const aim = Math.atan2(dy, dx);
        for (let i = 0; i < count; i++) {
          const offset = (i - (count - 1) * 0.5) * 0.115;
          spawnEnemyBullet(e, aim + offset, "retaliation");
        }
        emitShockwave(e.x, e.y, "orange", 20, 95 + heat * 2, 0.55);
        e.shieldHeat = 0;
        e.attackTimer = 99;
      }
      if (e.timer <= 0) { e.state = "guard"; e.cooldown = bodyRange(2.2, 2.8); }
      return;
    }
    const move = radialOrbit(e, dx, dy, 255, 0.16);
    steer(e, move.x, move.y, st.accel, st.speed, dt);
    e.angle = rotateToward(e.angle, Math.atan2(dy, dx), dt * 0.72);
    if (e.shieldHeat >= 11 || (e.cooldown <= 0 && e.shieldHeat >= 4)) {
      e.state = "retaliate";
      e.timer = 0.82;
      e.attackTimer = 0.4;
    }
  }

  function updateCherub(e, dx, dy, d, st, dt) {
    let ally = null;
    let best = -Infinity;
    for (let i = 0; i < S.enemies.length; i++) {
      const other = S.enemies[i];
      if (other === e || other.dead || other.type === "cherub" || other.type === "drone") continue;
      const value = other.maxHp * 2 + (1 - other.hp / other.maxHp) * 120 - Math.sqrt(distSq(e, other)) * 0.25;
      if (value > best) { best = value; ally = other; }
    }
    if (ally) {
      const ax = delta(e.x, ally.x, W);
      const ay = delta(e.y, ally.y, H);
      const away = norm(delta(S.player.x, ally.x, W), delta(S.player.y, ally.y, H));
      steer(e, ax + away.x * 58, ay + away.y * 58, st.accel, st.speed, dt);
      e.angle = rotateToward(e.angle, Math.atan2(ay, ax), dt * 3.2);
      e.supportTarget = ally.id;
    } else {
      steer(e, -dx, -dy, st.accel, st.speed, dt);
    }
    if (e.cooldown <= 0 && ally) {
      let pulses = 0;
      for (let i = 0; i < S.enemies.length; i++) {
        const other = S.enemies[i];
        if (other === e || other.dead || other.type === "cherub" || distSq(e, other) > 175 * 175) continue;
        if (other.hp < other.maxHp) other.hp = Math.min(other.maxHp, other.hp + 2.5);
        other.shield = Math.max(other.shield || 0, 2.5);
        other.shieldPulse = 0.5;
        pulses++;
      }
      if (pulses) emitShockwave(e.x, e.y, "green", 12, 112, 0.62);
      e.cooldown = 1.45;
    }
  }

  function updateConstructor(e, dx, dy, d, st, dt) {
    const move = radialOrbit(e, dx, dy, 315, 0.28);
    steer(e, move.x, move.y, st.accel, st.speed, dt);
    e.angle = rotateToward(e.angle, Math.atan2(dy, dx), dt * 1.8);
    e.spawnTimer -= dt;
    if (e.spawnTimer <= 0) {
      let children = 0;
      for (let i = 0; i < S.enemies.length; i++) if (!S.enemies[i].dead && S.enemies[i].parent === e.id && S.enemies[i].type === "turret") children++;
      if (children < 2) spawnChild(e, "turret", e.phase + children * Math.PI, 68);
      e.spawnTimer = children < 2 ? 1.55 : 3.2;
    }
  }

  function updateTurret(e, dx, dy, d, st, dt) {
    const parent = findEnemy(e.parent);
    if (parent) {
      e.phase += dt * (0.42 + (e.id & 1) * 0.1);
      let tx;
      let ty;
      if (WORLD_BOUNDED) {
        tx = parent.x + Math.cos(e.phase) * 72;
        ty = parent.y + Math.sin(e.phase) * 72;
      } else {
        tx = wrap(parent.x + Math.cos(e.phase) * 72, W);
        ty = wrap(parent.y + Math.sin(e.phase) * 72, H);
      }
      const mx = delta(e.x, tx, W);
      const my = delta(e.y, ty, H);
      steer(e, mx, my, 260, 130, dt);
    } else {
      e.vx *= Math.pow(0.9, dt * 60);
      e.vy *= Math.pow(0.9, dt * 60);
    }
    e.angle = rotateToward(e.angle, Math.atan2(dy, dx), dt * 3.4);
    if (e.cooldown <= 0 && d < 540) {
      const lead = leadTarget(e, S.player, 280);
      spawnEnemyBullet(e, Math.atan2(lead.y, lead.x), "rocket");
      e.cooldown = bodyRange(1.35, 1.8);
    }
  }

  function updateVanguard(e, dx, dy, d, st, dt) {
    const move = radialOrbit(e, dx, dy, 230, 0.82);
    steer(e, move.x, move.y, st.accel, st.speed, dt);
    e.angle = rotateToward(e.angle, Math.atan2(dy, dx), dt * 3.8);
    if (e.cooldown <= 0) {
      e.state = "sweep";
      e.volley = 8;
      e.attackTimer = 0;
      e.cooldown = 2.65;
    }
    if (e.volley > 0 && e.attackTimer <= 0) {
      const progress = 1 - e.volley / 8;
      const sweep = 0.72 - progress * 1.44;
      spawnEnemyBullet(e, e.angle + sweep, "arc");
      spawnEnemyBullet(e, e.angle - sweep, "arc");
      e.volley--;
      e.attackTimer = 0.12;
    }
  }

  function updatePulsar(e, dx, dy, d, st, dt) {
    const parent = findEnemy(e.parent);
    if (parent) {
      e.phase += dt * 1.25;
      let tx;
      let ty;
      if (WORLD_BOUNDED) {
        tx = parent.x + Math.cos(e.phase) * 92;
        ty = parent.y + Math.sin(e.phase) * 92;
      } else {
        tx = wrap(parent.x + Math.cos(e.phase) * 92, W);
        ty = wrap(parent.y + Math.sin(e.phase) * 92, H);
      }
      steer(e, delta(e.x, tx, W), delta(e.y, ty, H), st.accel, st.speed, dt);
    } else {
      const move = radialOrbit(e, dx, dy, 185, 1.05);
      steer(e, move.x, move.y, st.accel, st.speed, dt);
    }
    e.angle += dt * 2.4;
    if (e.cooldown <= 0) {
      for (let i = 0; i < 5; i++) spawnEnemyBullet(e, e.angle + i * TAU / 5, "arc");
      e.cooldown = 1.4;
    }
  }

  function updateOmegaDefender(e, dx, dy, d, st, dt) {
    const parent = findEnemy(e.parent);
    if (parent) {
      e.phase += dt * 0.72 * e.orbit;
      let tx;
      let ty;
      if (WORLD_BOUNDED) {
        tx = parent.x + Math.cos(e.phase) * 118;
        ty = parent.y + Math.sin(e.phase) * 118;
      } else {
        tx = wrap(parent.x + Math.cos(e.phase) * 118, W);
        ty = wrap(parent.y + Math.sin(e.phase) * 118, H);
      }
      steer(e, delta(e.x, tx, W), delta(e.y, ty, H), st.accel, st.speed, dt);
    } else {
      const move = radialOrbit(e, dx, dy, 210, 0.8);
      steer(e, move.x, move.y, st.accel, st.speed, dt);
    }
    e.angle = rotateToward(e.angle, Math.atan2(dy, dx), dt * 3);
    if (e.cooldown <= 0) {
      spawnEnemyBullet(e, Math.atan2(dy, dx), "omegaSide");
      e.cooldown = bodyRange(1.0, 1.35);
    }
  }

  function updateSpitfire(e, dx, dy, d, st, dt) {
    const move = radialOrbit(e, dx, dy, e.state === "evade" ? 255 : 300, e.state === "evade" ? 1.4 : 0.45);
    steer(e, move.x, move.y, st.accel * (e.state === "evade" ? 1.45 : 0.8), st.speed * (e.state === "evade" ? 1.55 : 1), dt);
    const aim = Math.atan2(dy, dx);
    e.angle = rotateToward(e.angle, aim, dt * (e.state === "lanceCharge" ? 0.45 : 2.1));
    e.timer -= dt;
    if (e.state === "orbCharge") {
      e.chargeAngle = rotateToward(e.chargeAngle, aim, dt * 0.8);
      if (e.timer <= 0) {
        spawnEnemyBullet(e, e.chargeAngle, "spitOrb");
        e.state = "evade";
        e.timer = 2.5;
        e.spawnedPulsar = false;
      }
    } else if (e.state === "evade") {
      if (!e.spawnedPulsar && e.timer < 1.85) {
        let children = 0;
        for (let i = 0; i < S.enemies.length; i++) if (!S.enemies[i].dead && S.enemies[i].parent === e.id && S.enemies[i].type === "pulsar") children++;
        if (children < 2) spawnChild(e, "pulsar", e.phase, 82);
        e.spawnedPulsar = true;
      }
      if (e.timer <= 0) {
        e.state = "arcFire";
        e.timer = 2.05;
        e.attackTimer = 0;
      }
    } else if (e.state === "arcFire") {
      if (e.attackTimer <= 0) {
        const sweep = Math.sin((2.05 - e.timer) * 4.2) * 0.48;
        spawnEnemyBullet(e, aim + sweep, "arc");
        spawnEnemyBullet(e, aim - sweep * 0.5, "arc");
        e.attackTimer = 0.22;
      }
      if (e.timer <= 0) {
        e.state = "lanceCharge";
        e.timer = 1.4;
        const lead = leadTarget(e, S.player, 680);
        e.chargeAngle = Math.atan2(lead.y, lead.x);
      }
    } else if (e.state === "lanceCharge") {
      if (e.timer > 0.45) {
        const lead = leadTarget(e, S.player, 680);
        e.chargeAngle = rotateToward(e.chargeAngle, Math.atan2(lead.y, lead.x), dt * 0.5);
      }
      if (e.timer <= 0) {
        spawnEnemyBullet(e, e.chargeAngle, "kineticLance");
        e.state = "orbCharge";
        e.timer = 1.45;
      }
    }
  }

  function updateStationOmega(e, dx, dy, d, st, dt) {
    let cx;
    let cy;
    if (WORLD_BOUNDED) {
      cx = e.efx + PLAY_W * 0.5;
      cy = e.efy + PLAY_H * 0.46;
    } else {
      cx = PLAY_W * 0.5;
      cy = PLAY_H * 0.46;
    }
    steer(e, delta(e.x, cx, W), delta(e.y, cy, H), st.accel, st.speed, dt);
    e.timer -= dt;
    if (e.state === "settle") {
      e.angle += dt * 0.18;
      if (e.timer <= 0) { e.state = "lasers"; e.timer = 5.4; e.phaseTime = 0; }
      return;
    }
    if (e.state === "lasers") {
      e.angle += dt * (0.42 + (e.enraged ? 0.1 : 0));
      stationLaserDamage(e);
      if (e.timer <= 0) { e.state = "summon"; e.timer = 4.1; e.summoned = false; }
    } else if (e.state === "summon") {
      e.angle += dt * 0.18;
      if (!e.summoned && e.timer < 3.25) {
        for (let i = 0; i < 3; i++) spawnChild(e, "omegaDefender", e.angle + i * TAU / 3, 106);
        emitShockwave(e.x, e.y, "cyan", 34, 138, 0.85);
        e.summoned = true;
      }
      if (e.timer <= 0) { e.state = "barrage"; e.timer = 6.2; e.attackTimer = 0; }
    } else if (e.state === "barrage") {
      e.angle += dt * 0.26;
      if (e.attackTimer <= 0) {
        const aim = Math.atan2(dy, dx);
        spawnEnemyBullet(e, aim, "omegaSphere");
        for (let side = -1; side <= 1; side += 2) {
          spawnEnemyBullet(e, e.angle + side * Math.PI * 0.5, "omegaSide");
          spawnEnemyBullet(e, e.angle + side * Math.PI * 0.5 + Math.PI, "omegaSide");
        }
        e.attackTimer = 0.62;
      }
      if (e.timer <= 0) { e.state = "lasers"; e.timer = 5.4; }
    }
  }

  function stationLaserDamage(e) {
    if (!S.player.alive) return;
    const px = delta(e.x, S.player.x, W);
    const py = delta(e.y, S.player.y, H);
    if (rayHitsPoint(px, py, e.angle, Math.max(PLAY_W, PLAY_H), 9)) damagePlayer(9, S.player.x, S.player.y);
    for (let i = 0; i < 5; i++) {
      const a = e.angle + i * TAU / 5;
      const nx = Math.cos(a) * e.r * 0.48;
      const ny = Math.sin(a) * e.r * 0.48;
      if (rayHitsPoint(px - nx, py - ny, a, Math.max(PLAY_W, PLAY_H), 7)) damagePlayer(6, S.player.x, S.player.y);
    }
  }

  function rayHitsPoint(px, py, angle, length, width) {
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const along = px * ca + py * sa;
    const across = Math.abs(-px * sa + py * ca);
    return along > 0 && along < length && across < width + 7;
  }

  function updateStarEater(e, dx, dy, d, st, dt) {
    e.timer -= dt;
    e.phase += dt * 1.15;
    let anchorX;
    let anchorY;
    if (WORLD_BOUNDED) {
      anchorX = e.efx + PLAY_W * (e.state === "crossings" ? 0.5 : 0.2);
      anchorY = e.efy + PLAY_H * 0.5 + Math.sin(S.time * 0.42) * PLAY_H * 0.11;
    } else {
      anchorX = PLAY_W * (e.state === "crossings" ? 0.5 : 0.2);
      anchorY = PLAY_H * 0.5 + Math.sin(S.time * 0.42) * PLAY_H * 0.11;
    }
    if (e.state !== "lunge" && e.state !== "crossings") {
      steer(e, delta(e.x, anchorX, W), delta(e.y, anchorY, H), st.accel, st.speed, dt);
    }
    if (e.state === "burst") {
      e.angle = rotateToward(e.angle, Math.atan2(dy, dx), dt * 1.25);
      if (e.attackTimer <= 0 && e.burstCount < (e.enraged ? 4 : 3)) {
        const count = e.enraged ? 14 : 11;
        const aim = Math.atan2(dy, dx);
        for (let i = 0; i < count; i++) {
          const spread = (i - (count - 1) * 0.5) * 0.075;
          spawnEnemyBullet(e, aim + spread, "darkFire");
        }
        e.burstCount++;
        e.attackTimer = 1.08;
        emitShockwave(e.x, e.y, "red", 28, 96, 0.55);
      }
      if (!e.asteroids && e.timer < 1.15) {
        spawnAsteroidRing(e);
        e.asteroids = true;
      }
      if (e.timer <= 0) setStarAttack(e, 1);
    } else if (e.state === "beamTell") {
      const lead = leadTarget(e, S.player, 900);
      e.dashAngle = rotateToward(e.dashAngle, Math.atan2(lead.y, lead.x), dt * 0.55);
      e.angle = rotateToward(e.angle, e.dashAngle, dt * 1.2);
      if (e.timer <= 0) { e.state = "beam"; e.timer = 2.65; }
    } else if (e.state === "beam") {
      if (rayHitsPoint(dx, dy, e.dashAngle, Math.max(PLAY_W, PLAY_H) * 1.2, e.enraged ? 22 : 17)) damagePlayer(18, S.player.x, S.player.y);
      if (e.timer <= 0) setStarAttack(e, 2);
    } else if (e.state === "lungeTell") {
      const lead = leadTarget(e, S.player, 520);
      e.dashAngle = rotateToward(e.dashAngle, Math.atan2(lead.y, lead.x), dt * 1.25);
      e.angle = rotateToward(e.angle, e.dashAngle, dt * 2.1);
      e.vx *= Math.pow(0.88, dt * 60);
      e.vy *= Math.pow(0.88, dt * 60);
      if (e.timer <= 0) {
        e.state = "lunge";
        e.timer = 0.58;
        e.vx = Math.cos(e.dashAngle) * 510;
        e.vy = Math.sin(e.dashAngle) * 510;
        emitShockwave(e.x, e.y, "red", 42, 155, 0.65);
      }
    } else if (e.state === "lunge") {
      e.angle = e.dashAngle;
      if (e.timer <= 0) {
        e.lungeCount++;
        if (e.lungeCount < (e.enraged ? 4 : 3)) {
          e.state = "lungeTell";
          e.timer = 0.72;
          const lead = leadTarget(e, S.player, 520);
          e.dashAngle = Math.atan2(lead.y, lead.x);
        } else setStarAttack(e, 3);
      }
    } else if (e.state === "vortex") {
      e.angle = rotateToward(e.angle, Math.atan2(dy, dx), dt * 1.6);
      if (e.attackTimer <= 0) {
        const streams = e.enraged ? 4 : 2;
        const aim = Math.atan2(dy, dx);
        for (let i = 0; i < streams; i++) {
          const off = (i - (streams - 1) * 0.5) * 0.22;
          spawnEnemyBullet(e, aim + off, "vortex");
        }
        e.attackTimer = e.enraged ? 0.26 : 0.38;
      }
      if (e.timer <= 0) setStarAttack(e, 4);
    } else if (e.state === "splitter") {
      e.angle = rotateToward(e.angle, Math.atan2(dy, dx), dt * 1.4);
      if (e.attackTimer <= 0 && e.splitCount < 4) {
        const aim = Math.atan2(dy, dx) + (e.splitCount - 1.5) * 0.18;
        const orb = spawnEnemyBullet(e, aim, "splitter");
        if (orb) orb.generation = 2;
        e.splitCount++;
        e.attackTimer = 0.92;
      }
      if (e.timer <= 0) setStarAttack(e, 5);
    } else if (e.state === "crossings") {
      if (e.attackTimer <= 0) {
        e.crossCount++;
        e.dashAngle = 0.52 + (e.crossCount % 2 ? 0 : Math.PI);
        e.vx = Math.cos(e.dashAngle) * 278;
        e.vy = Math.sin(e.dashAngle) * 278;
        e.angle = e.dashAngle;
        e.attackTimer = 1.55;
        for (let i = 0; i < 6; i++) spawnEnemyBullet(e, e.dashAngle + Math.PI * 0.5 + i * 0.09 - 0.225, "lightning");
      }
      e.angle = rotateToward(e.angle, Math.atan2(e.vy, e.vx), dt * 2.4);
      if (e.timer <= 0) setStarAttack(e, 0);
    }
  }

  function setStarAttack(e, index) {
    e.attackIndex = index;
    e.attackTimer = 0;
    if (index === 0) {
      e.state = "burst"; e.timer = 5.8; e.burstCount = 0; e.asteroids = false;
    } else if (index === 1) {
      e.state = "beamTell"; e.timer = 1.5;
      const lead = leadTarget(e, S.player, 900);
      e.dashAngle = Math.atan2(lead.y, lead.x);
    } else if (index === 2) {
      e.state = "lungeTell"; e.timer = 0.8; e.lungeCount = 0;
      const lead = leadTarget(e, S.player, 520);
      e.dashAngle = Math.atan2(lead.y, lead.x);
    } else if (index === 3) {
      e.state = "vortex"; e.timer = e.enraged ? 5.8 : 4.5;
    } else if (index === 4) {
      e.state = "splitter"; e.timer = 4.7; e.splitCount = 0;
    } else {
      e.state = "crossings"; e.timer = 6.4; e.crossCount = 0;
    }
  }

  function spawnAsteroidRing(e) {
    const count = e.enraged ? 13 : 10;
    const radius = Math.min(PLAY_W, PLAY_H) * 0.34;
    for (let i = 0; i < count; i++) {
      const a = i * TAU / count + e.phase * 0.1;
      if (WORLD_BOUNDED) {
        const fake = { id: e.id, x: clamp(S.player.x + Math.cos(a) * radius, 0, ARENA_W), y: clamp(S.player.y + Math.sin(a) * radius, 0, ARENA_H), vx: 0, vy: 0, r: 0, orbit: e.orbit };
        spawnEnemyBullet(fake, a + Math.PI, "asteroid");
      } else {
        const fake = { id: e.id, x: wrap(S.player.x + Math.cos(a) * radius, W), y: wrap(S.player.y + Math.sin(a) * radius, H), vx: 0, vy: 0, r: 0, orbit: e.orbit };
        spawnEnemyBullet(fake, a + Math.PI, "asteroid");
      }
    }
  }

  function findEnemy(id) {
    if (!id) return null;
    for (let i = 0; i < S.enemies.length; i++) if (S.enemies[i].id === id && !S.enemies[i].dead) return S.enemies[i];
    return null;
  }

  function findBullet(id) {
    if (!id) return null;
    for (let i = 0; i < S.bullets.length; i++) if (S.bullets[i].id === id && !S.bullets[i].dead) return S.bullets[i];
    return null;
  }

  // The mine's declaration now lives in the KIND registry as an ENTITY, so this
  // function must never be asked for one. A caller that does is reaching for the
  // pre-R6 shape and gets told which function to call instead.
  const ROUND_KINDS = Engine.KINDS.kernel;

  function spawnEnemyBullet(e, angle, kind) {
    // ---- THE CAP, AND IT REJECTS NOW (R6 commit F(b)) ---------------------
    // It used to sit BELOW the kind ladder and above the two pushes, and what
    // it did there was mark the LOWEST-INDEX live enemy round dead and push
    // anyway. Because S.bullets is push-ordered and every removal is an
    // order-preserving filter, lowest index means OLDEST — so a full board
    // silently deleted the round that had been in the air longest, with no fx,
    // no cue and no flag on the victim. On screen that is indistinguishable
    // from the player having shot it down, which D10 turns from a cosmetic
    // confusion into a real one the moment rounds become destructible.
    //
    // The contract (js/engine.js, R6 commit B) replaces it: capAdmit is handed
    // a COUNT and returns an admission, so the API has no way to name a victim.
    // The oldest round survives; the NEWEST spawn is denied; the denial is
    // visible through the sink. THE ATTEMPTED COOLDOWN IS STILL BILLED and no
    // line here does that — every caller in this file sets its cadence outside
    // the spawn branch already, which is what makes the kernel's two existing
    // count-then-decline precedents conform.
    //
    // IT MOVED ABOVE THE LADDER, deliberately: a denied spawn now costs no id
    // and no shape draw, which is the minelayer's and the hive's own shape
    // (they count, then decline, before doing any work).
    //
    // PLAYER ROUNDS ARE STILL UNCAPPED — today's truth, and firePlayer does not
    // come through here at all.
    if (kind === "mine") {
      throw new Error("demo-kernel: `mine` is an ENTITY after R6 (D10) — call spawnMine(), not " +
        "spawnEnemyBullet(). Its armed fuse and proximity trigger are its identity and moved with it");
    }
    const decision = Engine.capAdmit(ROUND_KINDS[kind] || ROUND_KINDS.heavy, S.bullets.length);
    if (!decision.admit) {
      sink.cue(decision.cue, { kind: kind, x: e.x, y: e.y });
      return null;
    }
    // The round's id, then its own shape substream. Allocated AFTER the cap
    // test so a refusal consumes neither — ids stay monotonic and never reused,
    // which js/net.js's whole tracer hand-off rests on in the sibling codebase.
    const id = nextId++;
    const shape = shapeRand(id);
    let hp = 0; // D10's SEVENTH registry obligation. 0 = never shootable, and
                // the collision pass skips the kind entirely — which is what
                // buys the undestructible kinds zero runtime, zero wire and
                // zero cap interaction. The eleven destructible kinds and D27's
                // two chaff kinds set it in their own branches below, and a leg
                // in test/node-golden.mjs cross-checks every one of them
                // against the registry's declaration. The registry is the
                // authority; a branch that drifts from it reds.
    let speed = 255;
    let r = 5;
    let life = 2.4;
    let damage = 9;
    let color = "magenta";
    let homing = 0;
    let curve = 0;
    let maxSpeed = speed;
    let acceleration = 0;
    let homingDelay = 0;
    let specialTimer = 0;
    let proximity = 0;
    let armed = 0;
    let wiggle = 0;
    if (kind === "heavy") {
      speed = 235; r = 10; life = 3.2; damage = 16; color = "red"; hp = 4;
      curve = e.orbit * rangeOf(shape, 0.16, 0.27);
    } else if (kind === "broadside") {
      speed = 82; maxSpeed = 355; acceleration = 390;
      r = 4.5; life = 2.35; damage = 8; color = "magenta"; homing = 1.2;
    } else if (kind === "plasma") {
      speed = 102; r = 10; life = 3.2; damage = 10; color = "green"; hp = 4;
    } else if (kind === "flame") {
      speed = 305; r = 4.5; life = 2.35; damage = 7; color = "orange"; wiggle = 0.45;
    } else if (kind === "grenade") {
      speed = 68; maxSpeed = 265; acceleration = 175; homing = 1.1;
      r = 9; life = 3.1; damage = 12; color = "blue"; homingDelay = 0.32; hp = 4;
    } else if (kind === "rocket") {
      speed = 115; maxSpeed = 335; acceleration = 250; homing = 0.82;
      r = 5; life = 2.8; damage = 9; color = "violet"; homingDelay = 0.18; hp = 2;
    } else if (kind === "retaliation") {
      speed = 285; r = 4.5; life = 2.5; damage = 8; color = "orange";
    } else if (kind === "arc") {
      speed = 225; r = 4; life = 3; damage = 7; color = "orange"; curve = (e.orbit || 1) * 0.18;
    } else if (kind === "spitOrb") {
      speed = 108; r = 13; life = 2.4; damage = 12; color = "orange"; specialTimer = 1.45; hp = 6;
    } else if (kind === "serpentFire") {
      speed = 155; r = 6.5; life = 4.1; damage = 10; color = "red"; wiggle = 1.45; hp = 2;
    } else if (kind === "kineticLance") {
      speed = 720; r = 10; life = 1.45; damage = 24; color = "gold";
    } else if (kind === "omegaSphere") {
      speed = 148; r = 11; life = 3.4; damage = 12; color = "cyan"; hp = 6;
    } else if (kind === "omegaSide") {
      speed = 325; r = 3.6; life = 2.6; damage = 6; color = "cyan";
    } else if (kind === "darkFire") {
      speed = 255; r = 5; life = 3.5; damage = 8; color = "red"; wiggle = 0.28; hp = 2;
    } else if (kind === "vortex") {
      speed = 120; maxSpeed = 315; acceleration = 125; homing = 1.05;
      r = 6.5; life = 4.2; damage = 10; color = "violet"; hp = 2;
    } else if (kind === "splitter") {
      speed = 132; r = 11; life = 2.6; damage = 10; color = "magenta"; specialTimer = 1.15; hp = 6;
    } else if (kind === "lightning") {
      speed = 485; r = 4; life = 1.35; damage = 9; color = "cyan"; wiggle = 0.8;
    } else if (kind === "asteroid") {
      speed = 116; r = 10; life = 4.8; damage = 12; color = "orange"; hp = 4;
    } else if (kind === "cluster") {
      speed = 205; r = 3.8; life = 1.7; damage = 7; color = "blue"; curve = (e.orbit || 1) * rangeOf(shape, -0.22, 0.22); hp = 1;
    } else if (kind === "mineShard") {
      speed = 245; r = 3.5; life = 1.45; damage = 7; color = "gold"; hp = 1;
    }
    if (WORLD_BOUNDED) {
      const x = clamp(e.x + Math.cos(angle) * (e.r + 5), 0, ARENA_W);
      const y = clamp(e.y + Math.sin(angle) * (e.r + 5), 0, ARENA_H);
      const bullet = {
        id: id, team: "enemy", kind: kind, x: x, y: y, px: x, py: y,
        vx: Math.cos(angle) * speed + e.vx * 0.18, vy: Math.sin(angle) * speed + e.vy * 0.18,
        speed: speed, r: r, life: life, damage: damage, color: color, hp: hp,
        homing: homing, curve: curve, maxSpeed: maxSpeed,
        acceleration: acceleration, homingDelay: homingDelay, specialTimer: specialTimer,
        proximity: proximity, armed: armed, wiggle: wiggle, baseAngle: angle,
        ownerId: e.ownerId || e.id || 0, dead: false, exploded: false, trail: 0
      };
      S.bullets.push(bullet);
      const heavyFx = kind === "heavy" || kind === "spitOrb" || kind === "kineticLance" || kind === "omegaSphere" || kind === "splitter";
      burst(x, y, color, heavyFx ? 6 : 1, heavyFx ? 55 : 20);
      return bullet;
    }
    const x = wrap(e.x + Math.cos(angle) * (e.r + 5), W);
    const y = wrap(e.y + Math.sin(angle) * (e.r + 5), H);
    const bullet = {
      id: id, team: "enemy", kind: kind, x: x, y: y, px: x, py: y,
      vx: Math.cos(angle) * speed + e.vx * 0.18, vy: Math.sin(angle) * speed + e.vy * 0.18,
      speed: speed, r: r, life: life, damage: damage, color: color, hp: hp,
      homing: homing, curve: curve, maxSpeed: maxSpeed,
      acceleration: acceleration, homingDelay: homingDelay, specialTimer: specialTimer,
      proximity: proximity, armed: armed, wiggle: wiggle, baseAngle: angle,
      ownerId: e.ownerId || e.id || 0, dead: false, exploded: false, trail: 0
    };
    S.bullets.push(bullet);
    const heavyFx = kind === "heavy" || kind === "spitOrb" || kind === "kineticLance" || kind === "omegaSphere" || kind === "splitter";
    burst(x, y, color, heavyFx ? 6 : 1, heavyFx ? 55 : 20);
    return bullet;
  }

  function updateBullets(dt) {
    const bulletCount = S.bullets.length;
    for (let i = 0; i < bulletCount; i++) {
      const b = S.bullets[i];
      if (b.dead) continue;
      setPrevious(b);
      b.life -= dt;
      b.homingDelay = Math.max(0, (b.homingDelay || 0) - dt);
      b.armed = Math.max(0, (b.armed || 0) - dt);
      if (b.specialTimer > 0) {
        b.specialTimer -= dt;
        if (b.specialTimer <= 0 && (b.kind === "spitOrb" || b.kind === "splitter")) {
          explodeEnemyBullet(b, "timer");
          continue;
        }
      }
      if (b.life <= 0) {
        if (b.kind === "grenade" || b.kind === "spitOrb" || b.kind === "splitter") explodeEnemyBullet(b, "expiry");
        else b.dead = true;
        continue;
      }
      if (b.team === "enemy") {
        if (b.homing && b.homingDelay <= 0 && S.player.alive) {
          if (b.acceleration) {
            b.speed = Math.min(b.maxSpeed, b.speed + b.acceleration * dt);
          }
          const desired = Math.atan2(delta(b.y, S.player.y, H), delta(b.x, S.player.x, W));
          const current = Math.atan2(b.vy, b.vx);
          const angle = rotateToward(current, desired, b.homing * dt);
          b.vx = Math.cos(angle) * b.speed;
          b.vy = Math.sin(angle) * b.speed;
        } else if (b.curve) {
          const speed = Math.hypot(b.vx, b.vy);
          const angle = Math.atan2(b.vy, b.vx) + b.curve * dt;
          b.vx = Math.cos(angle) * speed;
          b.vy = Math.sin(angle) * speed;
        }
        if (b.wiggle) {
          const speed = Math.hypot(b.vx, b.vy);
          const angle = Math.atan2(b.vy, b.vx) + Math.sin(S.time * 8 + b.id * 0.71) * b.wiggle * dt;
          b.vx = Math.cos(angle) * speed;
          b.vy = Math.sin(angle) * speed;
        }
      }
      if (WORLD_BOUNDED) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < -64 || b.x > ARENA_W + 64 || b.y < -64 || b.y > ARENA_H + 64) b.dead = true;
      } else {
        b.x = wrap(b.x + b.vx * dt, W);
        b.y = wrap(b.y + b.vy * dt, H);
      }
      b.trail = (b.trail || 0) - dt;
      if (b.team === "enemy" && b.trail <= 0) {
        b.trail = b.kind === "heavy" || b.kind === "serpentFire" || b.kind === "darkFire" || b.kind === "kineticLance" ? 0.018 : 0.04;
        particle(b.x, b.y, -b.vx * 0.1 + fxRange(-8, 8), -b.vy * 0.1 + fxRange(-8, 8), b.color,
          b.r >= 9 ? 0.36 : 0.22, b.r >= 9 ? 2.5 : 1.2, "trail");
      }
    }
    resolveBulletHits();
    S.bullets = S.bullets.filter(function (b) { return !b.dead; });
  }

  function triggerPlasmaOrb(orb, tracer) {
    if (!orb || orb.dead) return;
    const fake = { id: tracer.id, ownerId: tracer.id, x: orb.x, y: orb.y, vx: orb.vx * 0.2, vy: orb.vy * 0.2, r: 0, orbit: tracer.orbit };
    const base = Math.atan2(orb.vy, orb.vx);
    for (let i = 0; i < 4; i++) spawnEnemyBullet(fake, base + (i - 1.5) * 0.27, "flame");
    orb.dead = true;
    orb.exploded = true;
    emitShockwave(orb.x, orb.y, "green", 8, 48, 0.38);
    burst(orb.x, orb.y, "orange", 8, 78);
  }

  function explodeEnemyBullet(b, reason) {
    if (!b || b.dead || b.exploded) return;
    b.dead = true;
    b.exploded = true;
    const owner = findEnemy(b.ownerId);
    const fake = { id: b.ownerId, ownerId: b.ownerId, x: b.x, y: b.y, vx: b.vx * 0.08, vy: b.vy * 0.08, r: 0, orbit: owner ? owner.orbit : 1 };
    if (b.kind === "grenade") {
      for (let i = 0; i < 7; i++) spawnEnemyBullet(fake, i * TAU / 7 + b.id * 0.11, "cluster");
      emitShockwave(b.x, b.y, "blue", 10, 68, 0.5);
      burst(b.x, b.y, "blue", 13, 105);
    } else if (b.kind === "spitOrb") {
      for (let i = 0; i < 3; i++) spawnEnemyBullet(fake, Math.atan2(b.vy, b.vx) + i * TAU / 3, "serpentFire");
      emitShockwave(b.x, b.y, "orange", 14, 92, 0.62);
      burst(b.x, b.y, "red", 15, 130);
    } else if (b.kind === "splitter" && (b.generation || 0) > 0) {
      for (let i = 0; i < 3; i++) {
        const child = spawnEnemyBullet(fake, Math.atan2(b.vy, b.vx) + (i - 1) * 0.62, "splitter");
        if (child) {
          child.generation = b.generation - 1;
          child.r = Math.max(4.5, b.r * 0.68);
          child.damage = Math.max(4, b.damage - 2);
          child.specialTimer = child.generation > 0 ? 0.72 : 0;
        }
      }
      emitShockwave(b.x, b.y, "magenta", 7, 45, 0.34);
    }
  }

  function segmentCircleWrapped(b, o, radius) {
    const sx = 0;
    const sy = 0;
    const ex = delta(b.px, b.x, W);
    const ey = delta(b.py, b.y, H);
    const cx = delta(b.px, o.x, W);
    const cy = delta(b.py, o.y, H);
    const len2 = ex * ex + ey * ey;
    const t = len2 ? clamp(((cx - sx) * ex + (cy - sy) * ey) / len2, 0, 1) : 0;
    const dx = cx - ex * t;
    const dy = cy - ey * t;
    return dx * dx + dy * dy <= radius * radius;
  }

  function resolveBulletHits() {
    const p = S.player;
    // ---- THE DESTRUCTIBLE-ORDNANCE CANDIDATE LIST (R6 commit F(d)) --------
    // D10's pass, and the `hp > 0` FILTER SITS HERE — outside both loops —
    // which is a cost decision the taxonomy makes explicitly. The outer loop is
    // already O(rounds) and the body loop inside it is O(bodies); adding a
    // second O(rounds) inner loop would make the whole thing O(rounds squared),
    // 280 x 280 at a full board and four times that per seat at PORT-S. Testing
    // `hp > 0` per PAIR would pay that price for the fourteen kinds that can
    // never be hit; building the list ONCE pays it only for the ones that can.
    // That is what buys the hp-0 tier its "zero runtime" — the promise D10
    // costed the tier on.
    //
    // IT IS A SNAPSHOT, AND THE mineShard BIRTH-TICK TRAP IS WHY. This function
    // reads S.bullets' LIVE length, so a round born during it — the eight
    // shards an exploding mine fans, say — is visited by the outer loop on its
    // own birth tick. A newborn round has `px === x`, so segmentCircleWrapped
    // takes its `len2 ? ... : 0` branch and degrades to a POINT test at the
    // previous position. Admitting such a round as a TARGET would make it
    // hittable at a degenerate point that is not where it is going, which is
    // neither the old behaviour (there was none) nor a defensible new one. So
    // the list is taken before the walk and a round born this tick becomes a
    // candidate on the next one.
    const targets = [];
    for (let i = 0; i < S.bullets.length; i++) {
      const o = S.bullets[i];
      if (!o.dead && o.team === "enemy" && o.hp > 0) targets.push(o);
    }
    for (let i = 0; i < S.bullets.length; i++) {
      const b = S.bullets[i];
      if (b.dead) continue;
      if (b.team === "player") {
        for (let j = 0; j < S.enemies.length; j++) {
          const e = S.enemies[j];
          if (e.dead || e.emerge > e.emergeMax * 0.25) continue;
          if (segmentCircleWrapped(b, e, b.r + e.r)) {
            b.dead = true;
            damageEnemy(e, b.damage, b.x, b.y, "shot");
            break;
          }
        }
        // ---- player round vs enemy ORDNANCE -----------------------------
        // BODIES FIRST, and the order is deliberate: a round that reached a
        // hull has spent itself on the thing that was actually shooting, and it
        // must not also sweep the ordnance behind it. `if (b.dead) continue`
        // is what says so.
        if (b.dead) continue;
        for (let j = 0; j < targets.length; j++) {
          const o = targets[j];
          if (o.dead) continue; // struck earlier in THIS walk
          if (!segmentCircleWrapped(b, o, b.r + o.r)) continue;
          // THROUGH THE DOOR, never inline. R5's count leg REDS an inline
          // `o.hp -= b.damage` here — that is the gate working, and it is the
          // interaction R5's acceptance bought on purpose. The matrix row
          // shot SHIP -> ORDNANCE has been declared ON since R5 commit C,
          // inert until this line consulted it.
          const dealt = Engine.applyEffect({
            kind: "shot", target: o, tgtCls: Engine.CLASS.ORDNANCE,
            source: { cls: Engine.CLASS.SHIP }, baseAmount: b.damage
          });
          if (dealt === null) continue; // the matrix refused: a SKIP, nothing happened
          b.dead = true; // one round, one interception — the body branch's rule
          if (o.hp <= 0) {
            // DENIAL ONLY (D10 section 6, owner-ruled): no orb, no xp, no score,
            // no entry. The reward is the damage that did not land. Orb drops
            // were declined by name, because they would turn a chaff cloud into
            // a farm.
            //
            // IT DIES THE ORDINARY WAY. `dead = true` and the compaction filter
            // at the end of updateBullets takes it, which is also exactly how
            // its CAP SLOT is freed — commit B's freed-slot rule, with no code
            // of its own because reading the live count is all it ever needed.
            // A destroyed round is never "evicted"; it simply stops being live.
            o.dead = true;
            burst(o.x, o.y, o.color, 4, 62);
          }
          break;
        }
      } else if (p.alive && segmentCircleWrapped(b, p, b.r + 7)) {
        // The arming gate that used to guard this branch went with the mine —
        // `!(b.kind === "mine" && b.armed > 0)` was the only reader of `armed`
        // on a round, and no round carries a non-zero one any more. The two
        // fields stay in the literal deliberately: the serializer sorts nested
        // keys, so the per-round FIELD SET is part of the hash, and removing
        // them would re-key every round in every tick for no behaviour at all.
        damagePlayer(b.damage, b.x, b.y);
        if (b.kind === "grenade" || b.kind === "spitOrb" || b.kind === "splitter") explodeEnemyBullet(b, "impact");
        else b.dead = true;
      }
    }
  }

  function damageEnemy(e, amount, x, y, cause) {
    if (e.dead) return;
    if (e.type === "snapper" && !e.vulnerable) {
      e.hit = 0.04;
      particle(x, y, fxRange(-45, 45), fxRange(-45, 45), "magenta", 0.16, 1.1, "spark");
      return;
    }
    if (e.shield > 0) {
      const absorbed = Math.min(e.shield, amount);
      e.shield -= absorbed;
      amount -= absorbed;
      e.shieldPulse = 0.22;
      emitShockwave(x, y, STATS[e.type].color, 3, 19, 0.18);
      if (amount <= 0) return;
    }
    if ((e.type === "bulwark" || e.type === "minelayer") && cause === "shot") {
      const impactAngle = Math.atan2(delta(e.y, y, H), delta(e.x, x, W));
      if (Math.abs(angleDelta(e.angle, impactAngle)) < 1.18) {
        const reduction = e.type === "bulwark" ? 0.76 : 0.55;
        const prevented = amount * reduction;
        amount *= 1 - reduction;
        if (e.type === "bulwark") e.shieldHeat = Math.min(34, e.shieldHeat + prevented);
        e.shieldPulse = 0.2;
      }
    }
    if (e.type === "stationOmega" && cause === "shot") {
      const impactAngle = Math.atan2(delta(e.y, y, H), delta(e.x, x, W));
      let closest = Math.PI;
      for (let i = 0; i < 5; i++) closest = Math.min(closest, Math.abs(angleDelta(e.angle + i * TAU / 5, impactAngle)));
      if (closest < 0.24) {
        amount *= 2.5;
        e.weakPulse = 0.24;
      }
    }
    if (STATS[e.type].boss) {
      const threshold = e.type === "starEater" ? 35 : e.type === "stationOmega" ? 29 : 21;
      if (S.waveTime > threshold) amount *= clamp(1 + (S.waveTime - threshold) * 0.1, 1, 3.5);
    }
    // The kernel's body leg. Every gate and every amount stage above stays
    // here — the snapper's invulnerable phase, the shield absorb, the bulwark
    // and minelayer frontal reduction, Station Omega's node crit and the boss
    // ramp — because they are this kernel's own pipeline, not the door's. What
    // reaches the door is the amount they settled on.
    //
    // The SOURCE carries a class and no seat: the kernel has one unseated
    // pilot, so the matrix row is consulted (shot SHIP -> BODY, chain
    // BODY -> BODY) while every identity field stays undefined and the enemy
    // record grows no key. The kernel's drone is an ordinary member of
    // S.enemies today, so it arrives here as a BODY; declaring it a CONSTRUCT
    // is R6's registry work, not a distinction this file has.
    Engine.applyEffect({ kind: cause === "chain" ? "chain" : "shot",
                         target: e, tgtCls: Engine.CLASS.BODY,
                         source: { cls: cause === "chain" ? Engine.CLASS.BODY : Engine.CLASS.SHIP },
                         baseAmount: amount });
    e.hit = 0.09;
    particle(x, y, fxRange(-70, 70), fxRange(-70, 70), STATS[e.type].color, 0.24, 1.4, "spark");
    particle(x, y, fxRange(-70, 70), fxRange(-70, 70), "ink", 0.18, 0.8, "spark");
    if (e.type === "stationOmega") e.brokenNodes = clamp(Math.floor((1 - e.hp / e.maxHp) * 5), 0, 5);
    if (e.type === "starEater" && !e.enraged && e.hp <= e.maxHp * 0.5) {
      e.enraged = true;
      e.phaseTime = 0;
      S.banner = 3.2;
      S.bannerText = "STAR EATER  //  PHASE II";
      emitShockwave(e.x, e.y, "red", 40, Math.min(PLAY_W, PLAY_H) * 0.5, 1.25);
      burst(e.x, e.y, "red", 34, 225);
      S.shake = Math.max(S.shake, 8);
      // The condensed showcase resumes at the first attack whose canonical
      // behavior materially changes below 50%, so the escalation reads before
      // the self-playing build ends the fight.
      setStarAttack(e, 3);
    }
    if (e.hp <= 0) killEnemy(e, cause);
  }

  function killEnemy(e, cause) {
    if (e.dead) return;
    e.dead = true;
    const st = STATS[e.type];
    S.score += st.score;
    const xpTotal = e.type === "drone" ? 0 : st.xp;
    const count = Math.min(8, xpTotal);
    for (let i = 0; i < count; i++) {
      const value = Math.floor(xpTotal / count) + (i < xpTotal % count ? 1 : 0);
      spawnOrb(e.x, e.y, i, count, value);
    }
    const heavy = Boolean(st.heavy || st.boss);
    // ...AND ITS DEATH, for the same reason. A body's death fires the generic
    // set — two bursts, fragments, a shockwave and a shake. A mine's detonation
    // has always been the GOLD PAIR and nothing else, and it never shook the
    // screen. The mine branch below spells that pair; the generic set is
    // skipped here so the two do not stack.
    //
    // THIS WITHDRAWS THE LANE'S EARLIER DEVIATION. R6 first let the generic FX
    // fire on top of the gold pair and characterized it as an accepted extra;
    // cross-vendor review put it beside the rest of the look drift and the seat
    // withdrew the acceptance in favour of look-neutrality. The promotion is a
    // storage decision and a player must not be able to see it happen.
    if (e.type !== "mine") {
      burst(e.x, e.y, st.color, heavy ? 19 : 10, heavy ? 155 : 92);
      burst(e.x, e.y, "ink", heavy ? 9 : 4, heavy ? 110 : 65);
      emitFragments(e.x, e.y, st.color, heavy ? 7 : 4, heavy ? 175 : 115);
      emitShockwave(e.x, e.y, st.color, heavy ? 13 : 6, heavy ? 70 : 38, heavy ? 0.62 : 0.38);
      S.shake = Math.max(S.shake, heavy ? 4.5 : 1.8);
    }
    if (e.type === "hammerhead") {
      // The detonation damage is enough to ignite another wounded hammerhead,
      // producing the documented chain-reactive read without a giant flash.
      const victims = S.enemies.slice();
      for (let i = 0; i < victims.length; i++) {
        const other = victims[i];
        if (other.dead || other === e) continue;
        const d2 = distSq(e, other);
        if (d2 < 118 * 118) {
          const damage = other.type === "hammerhead" ? 14 : 8;
          damageEnemy(other, damage, other.x, other.y, "chain");
        }
      }
      if (S.player.alive && distSq(e, S.player) < 100 * 100) damagePlayer(8, S.player.x, S.player.y);
    }
    if (e.type === "minelayer") {
      // From its CENTRE, which is what the old `fake` record's r 0 meant.
      for (let i = 0; i < 3; i++) spawnMine(e, e.angle + Math.PI + (i - 1) * 0.38, 0);
    }
    if (e.type === "mine") {
      // THE MINE'S DEATH IS ITS DETONATION, whatever killed it — expiry, the
      // proximity trigger, or a player round. That is deliberate and it is what
      // makes popping one at RANGE the skilful answer: the blast is r 57 and
      // the shot reaches much further, so a mine killed from across the room
      // costs the pilot nothing while one killed at arm's length still pays.
      // It is not a reward either way — score and xp are zero on the row — and
      // D10's denial-only model is untouched.
      const fake = { id: e.id, ownerId: e.ownerId, x: e.x, y: e.y, vx: e.vx * 0.08, vy: e.vy * 0.08, r: 0, orbit: e.orbit };
      for (let i = 0; i < 8; i++) spawnEnemyBullet(fake, i * TAU / 8 + e.id * 0.07, "mineShard");
      if (S.player.alive && distSq(e, S.player) < 57 * 57) damagePlayer(14, S.player.x, S.player.y);
      emitShockwave(e.x, e.y, "gold", 10, 74, 0.5);
      burst(e.x, e.y, "gold", 12, 115);
    }
    if (st.boss) {
      for (let i = 0; i < S.enemies.length; i++) {
        const other = S.enemies[i];
        if (other !== e && (other.parent === e.id || other.ownerId === e.id)) other.dead = true;
      }
      for (let i = 0; i < S.bullets.length; i++) {
        const bullet = S.bullets[i];
        if (bullet.team === "enemy" && bullet.ownerId === e.id) bullet.dead = true;
      }
      S.banner = 3.2;
      S.bannerText = (st.label || e.type.toUpperCase()) + "  //  DESTROYED";
      S.gateTimer = 0;
      emitShockwave(e.x, e.y, st.color, 28, Math.min(PLAY_W, PLAY_H) * 0.58, 1.4);
      burst(e.x, e.y, "ink", e.type === "starEater" ? 52 : 30, e.type === "starEater" ? 330 : 240);
      if (e.type === "starEater") {
        S.finaleFlash = 1;
        S.shake = 13;
      }
    }
    if (cause !== "impact") sink.state();
  }

  function spawnOrb(x, y, index, count, value) {
    // The id first, then the orb's own substream — spawnEnemy's arrangement and
    // for its reason. A death that drops eight orbs draws eight independent
    // streams rather than eight consecutive slices of one.
    const id = nextId++;
    const gen = orbRand(id);
    const a = count > 1 ? index * TAU / count + rangeOf(gen, -0.25, 0.25) : rangeOf(gen, 0, TAU);
    const speed = rangeOf(gen, 34, 72);
    S.orbs.push({
      id: id, x: x, y: y, px: x, py: y,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life: 8, phase: rangeOf(gen, 0, TAU), value: value || 1, dead: false
    });
  }

  function updateOrbs(dt) {
    const p = S.player;
    for (let i = 0; i < S.orbs.length; i++) {
      const o = S.orbs[i];
      setPrevious(o);
      o.life -= dt;
      o.phase += dt * 5;
      const dx = delta(o.x, p.x, W);
      const dy = delta(o.y, p.y, H);
      const d = Math.hypot(dx, dy) || 1;
      if (p.alive && d < 185) {
        const pull = (1 - d / 185) * 720 + 60;
        o.vx += dx / d * pull * dt;
        o.vy += dy / d * pull * dt;
      }
      o.vx *= Math.pow(0.982, dt * 60);
      o.vy *= Math.pow(0.982, dt * 60);
      if (WORLD_BOUNDED) {
        o.x = clamp(o.x + o.vx * dt, 0, ARENA_W);
        o.y = clamp(o.y + o.vy * dt, 0, ARENA_H);
      } else {
        o.x = wrap(o.x + o.vx * dt, W);
        o.y = wrap(o.y + o.vy * dt, H);
      }
      if (p.alive && d < 15) {
        o.dead = true;
        gainXp(o.value || 1);
        particle(p.x, p.y, fxRange(-30, 30), fxRange(-30, 30), "gold", 0.35, 2, "spark");
      }
      if (o.life <= 0) o.dead = true;
    }
    S.orbs = S.orbs.filter(function (o) { return !o.dead; });
  }

  function gainXp(amount) {
    S.xp += amount;
    while (S.xp >= S.xpNext) {
      S.xp -= S.xpNext;
      S.level++;
      S.xpNext = Math.round(S.xpNext * 1.22 + 2);
      S.player.maxHull = Math.min(140, S.player.maxHull + 3);
      S.player.hull = Math.min(S.player.maxHull, S.player.hull + 14);
      emitShockwave(S.player.x, S.player.y, "gold", 11, 75, 0.65);
      burst(S.player.x, S.player.y, "gold", 13, 105);
    }
  }

  function particle(x, y, vx, vy, color, life, radius, kind) {
    if (S.particles.length >= 680) S.particles.splice(0, 1);
    if (WORLD_BOUNDED) {
      S.particles.push({
        x: clamp(x, 0, ARENA_W), y: clamp(y, 0, ARENA_H), px: clamp(x, 0, ARENA_W), py: clamp(y, 0, ARENA_H),
        vx: vx, vy: vy, color: color, life: life, max: life, r: radius,
        kind: kind || "spark", spin: fxRange(0, TAU), drag: kind === "trail" ? 0.94 : 0.975
      });
      return;
    }
    S.particles.push({
      x: wrap(x, W), y: wrap(y, H), px: wrap(x, W), py: wrap(y, H),
      vx: vx, vy: vy, color: color, life: life, max: life, r: radius,
      kind: kind || "spark", spin: fxRange(0, TAU), drag: kind === "trail" ? 0.94 : 0.975
    });
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const a = fxRange(0, TAU);
      const v = speed * Math.pow(fxRand(), 0.55);
      particle(x, y, Math.cos(a) * v, Math.sin(a) * v, color,
        fxRange(0.18, 0.62), fxRange(0.7, 2.8), fxRand() < 0.3 ? "chip" : "spark");
    }
  }

  function emitFragments(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      if (S.fragments.length >= 100) S.fragments.shift();
      const a = fxRange(0, TAU);
      const v = fxRange(speed * 0.35, speed);
      S.fragments.push({
        x: x, y: y, px: x, py: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        color: color, life: fxRange(0.45, 0.95), max: 1, angle: a, spin: fxRange(-8, 8),
        size: fxRange(2.5, 6)
      });
    }
  }

  function emitShockwave(x, y, color, start, end, life) {
    if (S.shockwaves.length >= 28) S.shockwaves.shift();
    S.shockwaves.push({ x: x, y: y, px: x, py: y, color: color, r: start, end: end, life: life, max: life });
  }

  function updateEffects(dt) {
    for (let i = 0; i < S.particles.length; i++) {
      const p = S.particles[i];
      setPrevious(p);
      p.life -= dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      if (WORLD_BOUNDED) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      } else {
        p.x = wrap(p.x + p.vx * dt, W);
        p.y = wrap(p.y + p.vy * dt, H);
      }
      p.spin += dt * 4;
    }
    S.particles = S.particles.filter(function (p) { return p.life > 0; });
    for (let i = 0; i < S.fragments.length; i++) {
      const f = S.fragments[i];
      setPrevious(f);
      f.life -= dt;
      f.vx *= Math.pow(0.975, dt * 60);
      f.vy *= Math.pow(0.975, dt * 60);
      if (WORLD_BOUNDED) {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
      } else {
        f.x = wrap(f.x + f.vx * dt, W);
        f.y = wrap(f.y + f.vy * dt, H);
      }
      f.angle += f.spin * dt;
    }
    S.fragments = S.fragments.filter(function (f) { return f.life > 0; });
    for (let i = 0; i < S.shockwaves.length; i++) S.shockwaves[i].life -= dt;
    S.shockwaves = S.shockwaves.filter(function (s) { return s.life > 0; });
    S.shake *= Math.pow(0.84, dt * 60);
    S.finaleFlash = Math.max(0, S.finaleFlash - dt * 0.72);
    S.banner = Math.max(0, S.banner - dt);
  }

  function step(dt) {
    S.time += dt;
    S.tick++;
    updateDirector(dt);
    updateEntries(dt);
    updatePlayer(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updateOrbs(dt);
    updateEffects(dt);
  }
  function starEaterSegments(e, basePos, baseAngle, renderPhase) {
    if (WORLD_BOUNDED) {
      const segments = [];
      const base = baseAngle == null ? e.angle : baseAngle;
      const originX = basePos ? basePos.x : e.x;
      const originY = basePos ? basePos.y : e.y;
      const phase = renderPhase == null ? e.phase : renderPhase;
      for (let i = 1; i <= 3; i++) {
        const side = Math.sin(phase - i * 0.82) * (e.state === "crossings" ? 18 : 34);
        const back = 78 * i;
        segments.push({
          x: clamp(originX - Math.cos(base) * back - Math.sin(base) * side, 0, ARENA_W),
          y: clamp(originY - Math.sin(base) * back + Math.cos(base) * side, 0, ARENA_H),
          angle: base + Math.sin(phase - i * 0.7) * 0.22,
          index: i
        });
      }
      return segments;
    }
    const segments = [];
    const base = baseAngle == null ? e.angle : baseAngle;
    const originX = basePos ? basePos.x : e.x;
    const originY = basePos ? basePos.y : e.y;
    const phase = renderPhase == null ? e.phase : renderPhase;
    for (let i = 1; i <= 3; i++) {
      const side = Math.sin(phase - i * 0.82) * (e.state === "crossings" ? 18 : 34);
      const back = 78 * i;
      segments.push({
        x: wrap(originX - Math.cos(base) * back - Math.sin(base) * side, W),
        y: wrap(originY - Math.sin(base) * back + Math.cos(base) * side, H),
        angle: base + Math.sin(phase - i * 0.7) * 0.22,
        index: i
      });
    }
    return segments;
  }

  var API = {
    reset: resetRun,
    step: step,
    setSink: setSink,
    setInput: setInput,
    S: S,
    W: W, H: H, PLAY_W: PLAY_W, PLAY_H: PLAY_H, ARENA_W: ARENA_W, ARENA_H: ARENA_H, ARENA_COLS: ARENA_COLS, ARENA_ROWS: ARENA_ROWS, WORLD_BOUNDED: WORLD_BOUNDED, STEP: STEP, TAU: TAU, BASE_SEED: BASE_SEED,
    C: C, RGB: RGB,
    WAVES: WAVES, STATS: STATS,
    rgba: rgba, rgbFor: rgbFor, cssFor: cssFor,
    wrap: wrap, delta: delta, angleDelta: angleDelta,
    easeOut: easeOut, easeInOut: easeInOut, clamp: clamp, lerp: lerp,
    starEaterSegments: starEaterSegments, findEnemy: findEnemy
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (typeof window !== "undefined") window.DemoKernel = API;
  else if (typeof globalThis !== "undefined") globalThis.DemoKernel = API;
})();
