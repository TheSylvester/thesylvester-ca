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

  // ---- TWO FIELDS RETIRED AT PORT-S S4 COMMIT E (D21) --------------------
  // `duration` and `gate` are GONE from every row, and their absence is the
  // ruling rather than a tidy-up. D21: *"CLEAR TO ADVANCE. NO BOARD WIPE. NO
  // CLOCK."* — and its consequence (b) in as many words: the arc *"loses its
  // fixed length ... which retires `def.duration` as a pacing lever — pacing
  // moves to the deal."* A setpiece now ends when the room has cleared what it
  // dealt, so a field that said how long it would take is a field that would be
  // read as a promise. `gate` went with it for the same reason: it named ONE
  // type to wait for, and the gate waits for the room.
  //
  // THE AUTHORED PACE, RECORDED SO IT IS NOT LOST: 7.5, 8, 8, 8, 10, 10, 26,
  // 10, 10.5, 10, 11, 11.5, 38, 11, 12, 58 seconds — 249.5 s of arc, which the
  // clock-driven director took to the tick. What the arc takes now is play.
  //
  // `entry.duration` IS A DIFFERENT FIELD AND IT LIVES. It is the PORTAL DWELL
  // (0.95 / 1.2) on an `S.entries` record, read twice in `updateEntries`, and it
  // is what makes a portal self-resolving rather than a spawn source. One
  // spelling, two facts; see `queueGroup` and `updateEntries`, which both say so
  // at their own sites.
  //
  // `curated` STAYS: it selects `prepareSetpiece`, which is now the HEAL alone.
  const WAVES = [
    null,
    {
      name: "SWARMLING ARC",
      caption: "Swarmlings gather at lance range, orbit the pilot, then pulse through short attack windows.",
      groups: [
        [0.5, "swarmling", 6, "ring", "portal"],
        [4.2, "swarmling", 4, "flank", "depth"]
      ]
    },
    {
      name: "WARDEN RANK",
      caption: "Wardens plant, gather a red charge, release one heavy shot, then curve away before setting again.",
      groups: [
        [0.4, "warden", 2, "rank", "edge"],
        [2.2, "swarmling", 5, "arc", "portal"],
        [5.6, "warden", 1, "solo", "depth"]
      ]
    },
    {
      name: "INTERCEPTOR PINCER",
      caption: "Interceptors shadow the ship, steer away from collision, and loose four accelerating, gently homing broadside shots.",
      groups: [
        [0.4, "interceptor", 2, "pincer", "edge"],
        [2.3, "swarmling", 5, "ring", "portal"],
        [5.5, "interceptor", 1, "solo", "depth"]
      ]
    },
    {
      name: "HAMMERHEAD V",
      caption: "Hammerheads paint a narrow impact lane before committing to a ram. Their deaths can ignite nearby hulls.",
      groups: [
        [0.4, "hammerhead", 2, "v", "edge"],
        [2.1, "swarmling", 6, "arc", "portal"],
        [5.3, "warden", 1, "solo", "depth"]
      ]
    },
    {
      name: "TRACER CROSS-FIRE",
      caption: "Tracers backpedal at long range, seed slow plasma orbs, then ignite each orb into a four-way fan of burning shots.",
      groups: [
        [0.5, "tracer", 2, "pincer", "edge"],
        [2.6, "swarmling", 5, "arc", "portal"],
        [6.1, "interceptor", 2, "escort", "depth"]
      ]
    },
    {
      name: "HIVE + CHERUB",
      caption: "The Hive replenishes collision drones while a non-aggressive Cherub shelters near the anchor, healing and hard-shielding nearby hulls.",
      groups: [
        [0.5, "hive", 1, "solo", "depth"],
        [1.6, "cherub", 1, "escort", "portal"],
        [3.6, "interceptor", 2, "pincer", "edge"],
        [6.8, "swarmling", 6, "arc", "portal"]
      ]
    },
    {
      name: "SPITFIRE", curated: true, rank: "MINIBOSS I",
      caption: "Compressed milestone: Spitfire alternates a charged flame-serpent orb with arcing fire, an evasive Pulsar interlude, and a kinetic lance.",
      groups: [
        [1.0, "spitfire", 1, "center", "depth"]
      ]
    },
    {
      name: "MINE CORRIDOR",
      caption: "Minelayers cross the pilot's route, drop capped pairs into their wake, and convert open space into a sequence of arming rings.",
      groups: [
        [0.5, "minelayer", 2, "rank", "edge"],
        [3.0, "interceptor", 2, "pincer", "portal"],
        [6.4, "swarmling", 5, "arc", "depth"]
      ]
    },
    {
      name: "MYRMIDON ARTILLERY",
      caption: "Slow Myrmidons hold the far field and launch accelerating homing cluster grenades whose delayed fans erase easy escape lines.",
      groups: [
        [0.5, "myrmidon", 2, "rank", "depth"],
        [2.8, "warden", 2, "flank", "portal"],
        [6.1, "swarmling", 6, "arc", "edge"]
      ]
    },
    {
      name: "SNAPPER HUNT",
      caption: "Snappers expose their white mouth cores during a readable jaw-open wind-up, then close the window and lunge down the painted lane.",
      groups: [
        [0.5, "snapper", 3, "arc", "portal"],
        [3.2, "tracer", 1, "solo", "edge"],
        [6.7, "snapper", 2, "pincer", "depth"]
      ]
    },
    {
      name: "BULWARK SUPPORT",
      caption: "Bulwarks turn a heat-storing barrier into retaliation fire while a Cherub shelters behind the line and repairs its allies.",
      groups: [
        [0.5, "bulwark", 2, "rank", "edge"],
        [1.5, "cherub", 1, "escort", "portal"],
        [4.6, "hammerhead", 2, "v", "depth"],
        [7.7, "myrmidon", 1, "solo", "edge"]
      ]
    },
    {
      name: "CONSTRUCTOR GRID",
      caption: "Constructors establish two-node rocket grids. Cherub repair pulses and Tracer combinations punish a static firing line.",
      groups: [
        [0.5, "constructor", 2, "pincer", "portal"],
        [1.9, "cherub", 1, "escort", "depth"],
        [4.9, "tracer", 2, "flank", "edge"],
        [8.0, "swarmling", 6, "arc", "portal"]
      ]
    },
    {
      name: "STATION OMEGA", curated: true, rank: "MINIBOSS II",
      caption: "Compressed milestone: five weak points rotate a laser lattice, call Omega Defenders, then surround a central sphere barrage with rapid side fire.",
      groups: [
        [1.2, "stationOmega", 1, "center", "depth"]
      ]
    },
    {
      name: "RED STAR SIGNAL", omen: 0.42,
      caption: "A fast Vanguard and Tracer deal plays beneath the first red-star omen: three intangible segments are assembling behind the arena.",
      groups: [
        [0.5, "vanguard", 2, "pincer", "edge"],
        [2.1, "tracer", 2, "flank", "portal"],
        [5.2, "snapper", 2, "v", "depth"],
        [8.0, "swarmling", 6, "arc", "edge"]
      ]
    },
    {
      name: "DIRECTOR OVERLOAD", omen: 0.76,
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
      name: "STAR EATER", curated: true, rank: "FINAL BOSS", omen: 1,
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
    // `score` USED TO SIT HERE TOO, and it left at S3b lane 2 commit C — the
    // second half of the same instruction the block below quotes: "with score
    // and the crown moving onto production's per-seat records".
    //
    // IT IS A PER-SEAT NUMBER NOW, on the seat record (see newPlayer). At one
    // seat a room-wide total and a per-seat total are the same number, which is
    // exactly why the singleton survived this long; at four they are the
    // question "who is winning", and a singleton cannot answer it. Production
    // has answered it per seat since phase 07 and its crown reads that answer
    // through ONE derivation (`kingSeat`), so a room-wide number here would
    // have to be split before it could be routed anywhere.
    //
    // NO ROOM-WIDE TOTAL IS DERIVED HERE, and that is a measurement rather than
    // an omission: nothing in this kernel or in js/demo-render.js ever READ
    // `S.score` — grep for it — so the only consumer a total would have is a
    // display that does not exist. A sum is one line for the day one does.
    //
    // `xp`, `xpNext` and `level` USED TO SIT HERE. S3b lane 2 commit B retired
    // them, on this file's own dated instruction three hundred lines below
    // gainXp: "S3b KILLS THIS LADDER. The demo's XP levelling retires and orbs
    // feed production's addXp(n, seat) and its shop economy instead."
    //
    // THE SHOP IS THE POWER PLANE, and that is the whole of the argument. Two
    // machines that both turn pickups into stat power are two balance surfaces
    // that have to be tuned against each other forever; production already has
    // one, with a UI, a wallet, a per-seat derivation (`termsFor`) and a
    // predictor that reads the same formula. A second ladder here would be a
    // machine to delete, and it would cost a serializer version and a recapture
    // on the way past.
    //
    // THEIR REMOVAL IS WHY SERIALIZER_VERSION IS 3. These are TOP-LEVEL keys of
    // S: test/tools/demo-serial.js's census THROWS on a key it has never heard
    // of and throws again on one it covers and cannot find, so the field list
    // moves with them and every hashed state moves with the field list.
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
    // THE SEAT ARRAY (PORT-S S3a commit E). It was `player: null`, one record,
    // and the rename is why this commit costs a SERIALIZER VERSION and a
    // recapture of both bounded manifests: test/tools/demo-serial.js emits the
    // KEY NAME into the hashed character stream, so `"players"` is a different
    // stream from `"player"` at character 225 of every state and every hash
    // moves. There was no additive path — its census THROWS on an own key it
    // has never heard of, so an `S.players` added beside `S.player` is a hard
    // error rather than a quiet extension.
    //
    // AND THE NON-ENUMERABLE TRICK IS FORBIDDEN, in the serializer's own prose:
    // an `Object.defineProperty(S, "players", { enumerable: false })` passes
    // the census silently and keeps a solo hash byte-identical, at the price of
    // hiding every seat above 0 from the oracle FOREVER. That is the exact
    // failure the file exists to prevent, so the version moves instead.
    //
    // THE RESPAWN CLOCK WENT WITH IT. `S.respawn` was one room-wide number and
    // is now `respawn` on each seat record, which is where production keeps it
    // (`respawnT` on `makeSeat`). It leaves INCLUDED in the same commit,
    // because a top-level key that no longer exists must not stay on a list
    // whose whole job is to throw when the two disagree.
    players: [],
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
  // THE POINT FORM, and it exists to be INJECTED. Engine.acquire takes its
  // metric as `(x, y, candidate)` because a selector is asked about a POINT, not
  // about a record — so the kernel's topology-aware distance has to be
  // available in that shape or the one authority would have to fall back on the
  // Euclidean default and answer a wrapping world with a bounded world's
  // number. `distSq` is now the record form written on top of it: same reads,
  // same operations, same order, so every one of its existing callers is
  // arithmetically untouched.
  function distSqAt(x, y, b) {
    if (WORLD_BOUNDED) {
      const dx = b.x - x;
      const dy = b.y - y;
      return dx * dx + dy * dy;
    }
    const dx = delta(x, b.x, W);
    const dy = delta(y, b.y, H);
    return dx * dx + dy * dy;
  }
  function distSq(a, b) {
    return distSqAt(a.x, a.y, b);
  }

  // ==== THE SEAT PLANE (PORT-S S3a) =========================================
  // Everything in this file that used to reach for `S.player` — the singleton
  // pilot — asks one of the three functions below instead. ONE SEAT EXISTS
  // TODAY and every one of them returns it, so this commit moves no behaviour
  // at all; what it moves is the QUESTION, from "the pilot" to "which pilot",
  // which is the question a four-seat room has to be able to answer.
  //
  // WHY IT IS NOT ENOUGH TO FIX THE FEED. `updateEnemies` computes one
  // dx/dy/d triple and hands it to 21 body updaters, and it would be natural to
  // think that triple IS the coupling. It is one of thirty: fourteen
  // `leadTarget` calls, both lance reads, the hammerhead and minelayer velocity
  // leads, the cherub's retreat vector, the mine's proximity trigger, the
  // station laser's ray origin, the asteroid ring's centre and the homing
  // bullet all reach the singleton DIRECTLY, around the feed. Porting the feed
  // alone produces a body that STEERS at one seat and SHOOTS at another — and
  // that defect is invisible at one seat, so no fixture would ever have
  // reported it. That is why the census was walked rather than the feed fixed.
  //
  // ---- THE ROSTER ----------------------------------------------------------
  // The one place that knows how many seats there are. The seat ARRAY is a
  // shape change the serializer sees, so it arrives in its own commit with its
  // own recapture; until then this is the whole of the multi-seat surface, and
  // when the array lands this function is what changes.
  //
  // The cache is refreshed rather than trusted: `resetRun` replaces the pilot
  // record wholesale, and a host is free to do the same, so a stale entry is a
  // real possibility and a silently stale roster would aim the whole file at a
  // record nobody is flying.
  //
  // AN EMPTY ROSTER IS A REAL STATE, not a defensive flourish: the array is
  // empty until the first `reset()` fills it, and `prepareSetpiece` already
  // carries a guard of its own for that window. Every consumer below answers
  // "no seat" rather than reaching into nothing.
  //
  // AND IT IS NOW THE ARRAY ITSELF. Commits B through D routed thirty reads
  // through this one function precisely so that commit E would be a change to
  // its BODY and to nothing else; that is what happened, and the two lines it
  // replaced are the whole of the seat plane's shape change.
  function seats() {
    return S.players;
  }

  // ---- WHICH PILOT, FROM A POINT ------------------------------------------
  // Production's `targetPlayer(x, y)` by name and by shape, and D18's ruling
  // made real: the NEAREST LIVING SHIP. It goes through the one targeting
  // authority with the kernel's own topology-aware metric injected, so the
  // seat pick and the AUTO driver's target pick are the same function asking
  // the same arithmetic.
  //
  // ---- THE ALL-DEAD FALLBACK IS DERIVED, NOT CHOSEN ------------------------
  // Read it as arithmetic rather than as policy, because it is the only rule
  // that satisfies the three facts already fixed:
  //   1. every one of the thirty sites reads the pilot UNCONDITIONALLY today,
  //      alive or dead — a body keeps orbiting the wreck and firing at it;
  //   2. the AUTO fixture kills the pilot repeatedly across its 16,000 ticks,
  //      so "what happens when no seat is living" is not a corner case here,
  //      it is a thing that happens every few hundred ticks;
  //   3. this commit is required to be byte-identical.
  // Preferring a living seat and falling back to the nearest seat REGARDLESS
  // when none is living is the only rule that keeps (1) true at one seat while
  // making (2) mean D18 at four. A bare "living only" pick would return null
  // through every death window and re-key the run on the first one.
  //
  // PRODUCTION ANSWERS THIS DIFFERENTLY AND THAT IS NOT A DEFECT HERE.
  // js/encounter.js's feed guards the no-target case with dx = dy = 0 and
  // dist = 0.001, so a body with nothing to chase separates, damps and never
  // attacks. Adopting that in the kernel would change what this kernel does at
  // ONE seat, which this commit forbids. Reconciling the two is S3b's, at the
  // seam where the two enemy planes actually meet.
  const PILOT_POLICY = {
    // D18's own words — "nearest living SHIP".
    mask: Engine.CLASS.SHIP,
    // the kernel's topology-aware distance, injected. The shipped world is
    // toroidal and the selector's Euclidean default would answer a different
    // question — see js/engine.js's METRIC block.
    metric: distSqAt,
    // no priority and no exclusion: D18 declined a threat table and sticky
    // aggro by owner ruling, and "positioning stays the whole game" is why.
  };
  // ---- TWO SPELLINGS, ONE AUTHORITY ---------------------------------------
  // `pilotSeatAt` answers in SEAT INDICES and `pilotAt` answers in RECORDS, and
  // the second is written in terms of the first so there is still exactly one
  // arithmetic. S3b lane 2 needed the index half: the aggro grievance below
  // stores a SEAT on the body (production stores `tgtSeat`, an index, and it has
  // to, because a record reference is not hashable state), while the thirty
  // ported sites want the record and are untouched by this split.
  //
  // A SECOND `Engine.acquire` LOOP HERE WOULD HAVE BEEN THE OTHER SHAPE, and it
  // is the one S3a's one-authority proof exists to forbid: two selectors over
  // the same roster drift the day one of them learns about a tie.
  function pilotSeatAt(x, y) {
    const list = seats();
    const cand = [];
    for (let s = 0; s < list.length; s++) {
      const p = list[s];
      cand.push({ cls: Engine.CLASS.SHIP, live: p.alive, seat: s, x: p.x, y: p.y, p: p });
    }
    const hit = Engine.acquire(x, y, cand, PILOT_POLICY);
    if (hit !== null) return hit.seat;
    // ...and the fallback, asked of the SAME authority rather than computed
    // beside it: the wrappers are this call's own throwaway records, so
    // re-declaring them live and asking again is the whole of it.
    for (let i = 0; i < cand.length; i++) cand[i].live = true;
    const wreck = Engine.acquire(x, y, cand, PILOT_POLICY);
    return wreck === null ? -1 : wreck.seat; // -1 only for an EMPTY roster
  }
  function pilotAt(x, y) {
    const s = pilotSeatAt(x, y);
    return s < 0 ? null : seats()[s]; // null only for an EMPTY roster, as before
  }

  // ---- WHERE THE ROOM IS: D19's CENTROID OF LIVING SEATS ------------------
  // Owner-ruled 2026-08-25, and the row calls it A BUG FIX rather than only a
  // policy: the wave deal anchors on the pilot, so in a four-seat room every
  // formation would aim at seat 0 BY ACCIDENT OF SEAT ORDER. The centroid is
  // fair, it hides the headcount, and it degrades as seats die.
  //
  // WRITTEN AS A PLAIN SUM-THEN-DIVIDE, and the spelling is load-bearing rather
  // than stylistic. A CENTROID OF ONE POINT IS THAT POINT EXACTLY: `x / 1` is
  // exact for every finite double in IEEE 754, so a one-seat run comes out with
  // the identical bits it had before this ruling existed and the bounded
  // manifests do not move. Two things would break that, and neither is here:
  // any `Math.hypot` (a square root is not exact), and any reordering of the
  // additions (floating-point addition is not associative). The seats are summed
  // in ASCENDING ORDER for the same reason the FX draws are — once there is more
  // than one, the order is part of the answer.
  //
  // THE ALL-DEAD FALLBACK IS THE SAME RULE `pilotAt` USES, and it is derived the
  // same way: both anchors read the pilot unconditionally today, alive or dead,
  // and this commit must be byte-identical through the death windows the AUTO
  // fixture opens every few hundred ticks. So: the centroid of the LIVING
  // seats, or of every seat when none is living.
  //
  // NULL FOR AN EMPTY ROSTER, which the two callers below handle rather than
  // guard — see `encFrame`.
  function livingCentre() {
    const list = seats();
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let s = 0; s < list.length; s++) {
      if (!list[s].alive) continue;
      sx += list[s].x;
      sy += list[s].y;
      n++;
    }
    if (n === 0) {
      for (let s = 0; s < list.length; s++) {
        sx += list[s].x;
        sy += list[s].y;
        n++;
      }
    }
    return n === 0 ? null : { x: sx / n, y: sy / n };
  }

  // ---- WHICH PILOT, FOR A BODY --------------------------------------------
  // `targetOf(e)` is production's name for this and answers production's
  // question. The kernel's version is resolved ONCE per body per tick, in
  // `updateEnemies`' own per-body slice, and the guard below is what makes
  // "steers and shoots at the same seat" structurally true rather than a rule
  // somebody has to keep remembering: a read from outside the slice, or for a
  // body that is not the one being stepped, throws BY NAME.
  //
  // It is the `bodyGen` arrangement exactly — the same slice, the same clear,
  // the same loud failure for ambient state reached from the wrong place — and
  // it is deliberately the same, because the two are the same kind of fact
  // about a body's turn.
  //
  // ONE DIFFERENCE FROM PRODUCTION, NAMED SO NOBODY READS IT AS AN OVERSIGHT:
  // production LATCHES the choice on the body (`e.tgtSeat`, hashed) and moves
  // it only at decision points, which is what `retargetAtDecision` is and what
  // D18's row cites as the re-target precedent. A latch here would mean a new
  // key on the kernel's body record, and the serializer hashes every own key of
  // one — so it is a fixture event, and it is not this commit's. Per-tick
  // resolution is what a body gets until somebody buys the latch; the two agree
  // exactly while the roster holds one seat.
  // ---- AIMED OR AREA: THE RULE EVERY PORTED SITE IS DECIDED BY -------------
  // Thirty sites read the pilot, and they are not all asking the same thing.
  // The rule below is what each one was ported under, written once here so no
  // site has to argue it again — and written down at all because the two halves
  // diverge only at more than one seat, where nothing yet flies:
  //
  //   AIMED — a lance, a lunge lane, a laser ray, a homing round, a chase
  //   vector, a lead. It is pointed at a PILOT, and the pilot it is pointed at
  //   is the one the body chose: `targetOf(e)`, or `pilotAt(x, y)` where the
  //   thing doing the aiming is not a body. A seat that wanders into a beam
  //   aimed at somebody else is NOT hit by it, and that is deliberate: these
  //   attacks are telegraphed and the telegraph is aimed.
  //
  //   AREA — a detonation, a blast radius, a SWEEPING ray whose angle turns on
  //   its own clock. It is pointed at a PLACE rather than at anybody, so it
  //   reaches every living seat inside it, in ASCENDING SEAT ORDER. That is not
  //   a new invention: `blastAt` in js/encounter.js is production's settled
  //   answer to exactly this question and it loops `for (let s = 0; s <
  //   players.length; s++)`, skipping the dead. The kernel follows it.
  //
  // AND THE PART THAT IS NOT SETTLED, flagged rather than decided: whether a
  // telegraphed AIMED attack should sweep every seat in its lane is a
  // BEHAVIOUR ruling at more than one seat, and no ruling in the POR makes it.
  // Both readings are defensible — a lance is a physical beam, and a lance is
  // an aimed shot — and this port takes the one that is byte-identical at one
  // seat and leaves the question where the owner can answer it.
  let bodyOwner = null;  // the body whose slice we are inside
  let bodyTarget = null; // ...and the pilot it resolved to, for that slice
  function targetOf(e) {
    // The FIRST test is "is a slice open at all", and it is not redundant with
    // the second: `bodyOwner` is null between slices, so a call made outside
    // every slice with a null argument satisfies `bodyOwner === e` and would
    // have been answered with the cleared target. The slice-guard probe in
    // test/tools/demo-seats.mjs found exactly that, which is the whole reason a
    // guard gets driven rather than read.
    if (bodyOwner === null || bodyOwner !== e) {
      throw new Error("demo-kernel: targetOf(e) reached outside e's own slice of updateEnemies — " +
        "a body's target is resolved once per tick precisely so it cannot steer at one seat " +
        "and shoot at another, and a read from anywhere else would be a second answer");
    }
    return bodyTarget;
  }

  // ---- THE AGGRO GRIEVANCE (S3b lane 2, commit A) --------------------------
  // READER 1 OF `lastAtk`, and it arrives in the same commit as the write that
  // fills it — which is the whole of S3a's ruling. Until now this kernel picked
  // a body's pilot fresh every tick and the pick was PURE GEOMETRY: the nearest
  // living ship, no memory, no grudge. Production has never worked that way, and
  // the difference is invisible at one seat and decisive at four — a body that
  // re-picks by distance every tick abandons the seat that just shot it the
  // moment somebody else drifts closer, so shooting is free and positioning is
  // everything.
  //
  // PRODUCTION'S RULE, REPRODUCED, and its source is js/encounter.js:1716-1727:
  //   1. a live COMMITTED target holds for its whole window, whatever happened;
  //   2. else the most recent ATTACKER wins, if that seat is still alive;
  //   3. else the nearest living ship — which is what this kernel already did,
  //      and it is still asked of the one authority (`pilotSeatAt`);
  //   4. every actual SWITCH opens a fresh window, so two seats alternating
  //      shots cannot flip-flop a body faster than once per window;
  //   5. THE GRIEVANCE IS CONSUMED AT THE DECISION, KEPT OR NOT — the last line
  //      of the function, and it is what stops a single hit from re-winning the
  //      body at every later decision for the rest of the wave.
  //
  // ---- THE DECISION POINT -------------------------------------------------
  // Production takes this decision ONLY on a seek-mode tick (js/encounter.js
  // :1771, "the ONE decision point"), because its telegraph-honesty rule says a
  // planted attack keeps the line it showed. THIS KERNEL PORTS THAT GATE —
  // see QUIET_STATES below, which names the states a body sits in when it is
  // doing nothing aimed, because this kernel has thirty-six per-type `state`
  // values where production has one shared seven-value `mode` vocabulary with
  // one neutral member.
  //
  // The gate and its history — three attempts, two of them wrong, and what the
  // two wrong ones had in common — are documented at QUIET_STATES rather than
  // restated here, so there is one account of it.

  // ---- THE WINDOWS ARE PRODUCTION'S NUMBERS, CITED WHERE THEY LAND --------
  // js/encounter.js:261 — `ECFG.aggro = { commit: 90, ownerLock: 120 }`, in
  // TICKS, and this kernel's tick is production's tick (one step, one tick), so
  // the numbers cross unconverted.
  const AGGRO = {
    // the window a body stays on a freshly chosen target. Production's own
    // words: "the middle of the settled 1-2 s band, so two players alternating
    // shots cannot flip-flop it".
    commit: 90,
    // ...and the per-player wave's initial hold on its owner. CARRIED WITH NO
    // CONSUMER IN THIS FILE, deliberately and not by omission: production's
    // wave deal is per-player and hands each seat bodies that start locked to
    // it, and this kernel's director deals ONE curated arc to the room. There is
    // no owned wave here for a lock to hold. It is written down because the
    // number is production's and lane 3 unifies the two deals — a lane that
    // needs it should find it beside its sibling rather than re-derive it.
    ownerLock: 120
  };
  // ---- THE DECISION POINT: A BODY THAT IS QUIET (fix 11) -----------------
  // THREE GATES SHIPPED HERE AND THE FIRST TWO WERE WRONG. The history is kept
  // because the SHAPE of the mistakes is the reason this one is built the way
  // it is, and a fourth reader will be tempted by both of them again.
  //
  //   COMMIT A had no gate and argued in prose that none was needed, because
  //   "every planted attack already latches its own line". Round 1 measured a
  //   Warden bending its drawn charge.
  //   FIX 1 gated on a per-type map of SPAWN STATES. Round 2 measured that a
  //   SPAWN STATE IS NOT A QUIET STATE: spitfire spawns in `orbCharge`, an
  //   active aiming phase, and bent its charge from PI to 3.128...
  //   FIX 10 borrowed js/demo-render.js's GLOW list. Round 3 measured that the
  //   glow list answers a DIFFERENT QUESTION — "should this body be brighter" —
  //   and it omits `lunge`, so a snapper and a star eater both retargeted
  //   MID-DASH and passed straight through the seat standing in the painted
  //   lane, unhurt, while an off-lane seat was chased instead.
  //
  // ---- WHAT THE THREE MISTAKES HAVE IN COMMON ----------------------------
  // Every one of them ENUMERATED THE ATTACKS. That direction is unsafe in the
  // way that matters: a state left out of an attack list is a state in which a
  // body silently re-aims something the player has already been shown, and
  // nothing says so. THE LIST BELOW IS THE OTHER DIRECTION — it names the QUIET
  // states, the ones a body sits in when it is doing nothing aimed, and every
  // other state is COMMITTED BY DEFAULT. A state nobody classified therefore
  // locks a body to its target, which is visible in play and harmless, instead
  // of bending a telegraph, which is neither.
  //
  // ---- AND IT IS CHECKED BY TWO DERIVED ORACLES, NOT BY READING -----------
  // demo-seats LEG I does not restate this list. It DERIVES what belongs on the
  // other side of it and asserts the list is consistent with what it derived:
  //   1. THE BENT-LINE ORACLE. For every (type, state), plant a line at a known
  //      angle, step once with the body committed to seat 0 and again committed
  //      to seat 3, and compare the four drawn-line fields. Six states bend a
  //      planted line — beamTell, charge, lanceCharge, lungeTell, open,
  //      orbCharge — and not one of them may be quiet.
  //   2. THE NO-LOCK ORACLE. Drive every type through a real run and record
  //      whether it ever reaches a quiet state. A quiet list that locked a
  //      common body would be worse than no gate at all.
  //
  // ---- THE TWO TYPES THAT NEVER RETURN TO QUIET, MEASURED NOT DECLARED ---
  // BOTH ARE BOSSES, and ORACLE 2 in demo-seats LEG I is what says so — it
  // drives every type and records whether it reaches a quiet tick AFTER a
  // committed one.
  //
  //   STAR EATER — beam, beamTell, burst, crossings, lunge, lungeTell,
  //     splitter, vortex. Not one is a pause; its whole fight is one continuous
  //     attack sequence, which is what a final boss is. It never goes quiet at
  //     all, from the first tick.
  //   STATION OMEGA — `settle` is a SPAWN phase it never re-enters. It opens
  //     quiet, decides once, and then cycles lasers -> summon -> barrage ->
  //     lasers for the rest of the fight. (`burst` and `crossings` are the star
  //     eater's; an earlier draft of this line put them here.)
  //
  // So both hold the target they open on. That is a BALANCE PROPERTY at four
  // seats and it is FLAGGED rather than settled: if the owner wants a boss to
  // honour a grievance, the shape is a NEUTRAL PHASE added to its state machine
  // and named here, never a special case in the gate. Spitfire, the third boss,
  // returns through `evade` and re-decides like anything else.
  //
  // FIX 1 MADE A CLAIM OF THIS KIND FROM READING and got it wrong in three of
  // four cases. This one was driven: the first cut of THIS paragraph said ONE
  // type and ORACLE 2 said two.
  //
  const QUIET_STATES = {
    approach: true,   // the spawn default, and the idle of six types
    seek: true,       // the snapper's hunt
    stalk: true,      // the tracer's
    lay: true,        // the minelayer crossing the pilot's route
    range: true,      // the myrmidon holding the far field
    guard: true,      // the bulwark's barrier, before it retaliates
    support: true,    // the cherub's shelter
    build: true,      // the constructor between its nodes
    anchor: true,     // the turret, which never moves
    sweep: true,      // the vanguard's approach
    orbit: true,      // the pulsar's and the omega defender's
    evade: true,      // the interlude the SPITFIRE pauses in. Round 4: only
                      // spitfire assigns it; the vanguard and pulsar reach
                      // their pauses through `sweep` and `orbit`.
    recover: true,    // the beat after a snapper's or hammerhead's lunge
    escape: true,     // the warden leaving, its shot already fired
    settle: true      // station omega and spitfire between phases
  };
  // ---- ...AND TWO LIVE-ATTACK CLAUSES, BECAUSE A STATE IS NOT ENOUGH ------
  // Both are attacks that run INSIDE a quiet state, distinguished only by a
  // counter on the body, and each was found by measurement rather than reading.
  //
  //   e.lance > 0    A SWARMLING'S DRAWN BEAM. It sits in `approach`, which
  //                  every quiet list in the world calls quiet, with a beam
  //                  already drawn along `lanceAngle`.
  //   e.volley > 0   A VANGUARD'S EIGHT-PAIR SWEEP. `sweep` is its state BOTH
  //                  between volleys and during one, and only `e.volley`
  //                  distinguishes them. Round 4 measured the opening pair
  //                  identical at ±0.72, then a seat-3 grievance switching the
  //                  body before pair two and rotating every remaining pair: a
  //                  seat planted in the control's continuing lane took
  //                  100 -> 93, and retargeting spared it at 100.
  //
  // THEY ARE THE SAME SHAPE, and a THIRD counter of this kind was found after
  // both — the mine's `armed`. That one is NOT on this list, deliberately: see
  // updateMine, where the defect was that its trigger asked an AIMED question
  // of an AREA event, and freezing the latch would have left it asking the same
  // wrong question. A counter belongs here only when the attack it gates is
  // AIMED at the latched seat.
  //
  // THERE IS NO GENERAL ORACLE FOR THIS CLASS and demo-seats LEG I says so at
  // length rather than pretending otherwise: a probe that stages a seat in the
  // planted lane flags all thirty-six states, because a body chases its target
  // in every one of them. What covers the gap is the INVERTED DEFAULT, a
  // tripwire on this list, and the explicit cases four review rounds found.
  function committedToALine(e) {
    return QUIET_STATES[e.state] !== true || e.lance > 0 || e.volley > 0;
  }

  function retargetAtDecision(e) {
    const list = seats();
    const cur = e.tgtSeat;
    const curAlive = cur >= 0 && cur < list.length && list[cur].alive;
    if (curAlive && e.aggroT > 0) return; // committed — hold, whatever happened
    const atk = e.lastAtk >= 0 && e.lastAtk < list.length && list[e.lastAtk].alive
      ? e.lastAtk : -1;
    // THE FALLBACK IS THIS KERNEL'S, NOT PRODUCTION'S, and the difference is
    // S3a's and stays: `pilotSeatAt` prefers a living seat and falls back to the
    // nearest seat REGARDLESS when none is living, where production's
    // `nearestSeat` answers -1. Adopting production's answer here would give
    // every body a null target through every death window — a change to what
    // this kernel does at ONE seat, which is not this commit's licence.
    const want = atk >= 0 ? atk : pilotSeatAt(e.x, e.y);
    if (want !== cur) {
      e.tgtSeat = want;
      e.aggroT = want >= 0 ? AGGRO.commit : 0;
    }
    e.lastAtk = -1; // the grievance is consumed at the decision, kept or not
  }

  // THE INDIRECT HALF OF D19, and the half the POR's row does not mention. The
  // ruling's stated anchor is `formationPoints`, and `formationPoints` does read
  // the pilot directly — but only for `ring` and `arc`. EVERY OTHER FORMATION
  // reaches the pilot through THIS function, which is what decides where the
  // play box sits inside the arena. A centroid applied only to the direct half
  // would move `ring` and `arc` to the middle of the room while every side
  // formation went on tracking seat 0, which is the same bug the ruling calls a
  // bug, surviving in the majority of the cases.
  //
  // Its other two consumers are FX placement (`prepareSetpiece`'s shockwave and
  // `formationPoints`' bounded branch), and they follow the same anchor for
  // free, which is right: the between-setpiece pulse belongs where the room is.
  //
  // AN EMPTY ROSTER FALLS BACK TO THE ARENA'S OWN CENTRE. It cannot happen in a
  // run that has been reset, and the alternative — a throw, or a null nobody
  // checks — would turn a window in which the kernel simply has no pilot yet
  // into a crash in the wave deal.
  function encFrame() {
    const c = livingCentre();
    const cx = c === null ? ARENA_W * 0.5 : c.x;
    const cy = c === null ? ARENA_H * 0.5 : c.y;
    return {
      x: clamp(cx - PLAY_W / 2, 0, ARENA_W - PLAY_W),
      y: clamp(cy - PLAY_H / 2, 0, ARENA_H - PLAY_H)
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
  let sink = { state: noop, caption: noop, cue: noop, credit: noop, hurt: function () { return false; } };

  // The input plane, one level below the sink: the sink carries state OUT, this
  // carries a pilot's decisions IN. AUTO is the default at module load, and with
  // no provider installed every expression below reads exactly as the frozen
  // demo-v2 reference does.
  // PER SEAT, since S3b lane 1. `pilots` is a sparse array indexed by seat: an
  // entry is a provider function, and an ABSENT entry is AUTO. It starts empty,
  // so a kernel nobody has called setInput on reads exactly as the frozen
  // demo-v2 reference does at every seat, which is what lets this change carry
  // no recapture.
  let pilots = [];
  // ---- THE PUPPET SEAM'S FLAG (PORT-S S3b lane 3, commit A) ----------------
  // `posed` is a sparse array indexed by seat, EXACTLY as `pilots` is, and an
  // entry is the LAST POSE this kernel was handed for that seat. A seat is
  // POSE-DRIVEN if and only if it has an entry, so the array doubles as the
  // flag and there is no second authority on the same question.
  //
  // IT LIVES HERE, AT MODULE LEVEL, AND NEVER ON THE SEAT RECORD, and that is a
  // hard rule rather than a style choice. This kernel's serializer HASHES EVERY
  // OWN KEY of a seat record — its own prose says so, contrasting itself with
  // production's allow-list — so a `poseDriven: false` field on the record
  // would re-key the bounded run on the day it was added, for a flag that is a
  // fact about the HOST rather than about the simulation. `pilots` is beside it
  // for the identical reason and has carried the identical property since lane
  // 1: with nothing installed anywhere, every seat takes the same branch it
  // took before the mechanism existed, and the bounded pair is the proof.
  //
  // WHAT POSE-DRIVE MEANS. Production's ship stays THE ship. Its integrator is
  // load-bearing netcode — the prediction plane runs through the three `Flight`
  // slices — and S1 and S2 spent real rounds porting the demo's FEEL into it.
  // So the kernel supplies THE ENCOUNTER and production supplies THE SHIP, and
  // a pose-driven seat's record is a MIRROR: the host writes the seat's
  // production pose onto it once per tick and this kernel's own flight
  // integration does not run for that seat. Everything downstream — aggro,
  // formations, contact, the renderer — then reads an honest ship without
  // knowing which side moved it.
  let posed = [];
  const fin = function (v) { return Number.isFinite(v) ? v : 0; };

  // ---- setInput — TWO FORMS, and the first one's meaning is UNCHANGED -------
  //
  //   setInput(fn)        — installs `fn` as SEAT 0's provider. Exactly what it
  //                         has always meant. setInput(null), or anything that
  //                         is not a function, removes SEAT 0's provider and
  //                         returns that seat to AUTO — also exactly as before,
  //                         because seat 0 was the only seat it could ever
  //                         reach. All eleven install sites in this tree use
  //                         this form and none of them changes.
  //   setInput(seat, fn)  — S3b lane 1's extension: installs `fn` as SEAT
  //                         `seat`'s provider, on the identical contract.
  //                         `setInput(seat, null)` returns that ONE seat to
  //                         AUTO and touches no other.
  //
  // ---- THE DISPATCH IS `arguments.length >= 2`, AND NOTHING ELSE ----------
  // ONE ARGUMENT IS THE LEGACY FORM. TWO ARGUMENTS ARE THE SEAT FORM. That is
  // the whole rule, and it is a rule about the CALL rather than about the
  // VALUES, which is what lets both contracts hold at once:
  //
  //   setInput(fn)          one arg, a function      -> seat 0 gets it
  //   setInput(null)        one arg, not a function  -> seat 0 is cleared
  //   setInput(undefined)   one arg, not a function  -> seat 0 is cleared
  //   setInput(1)           one arg, not a function  -> seat 0 is cleared
  //   setInput(seat, fn)    two args, valid seat     -> that seat gets it
  //   setInput(seat, null)  two args, valid seat     -> that seat is cleared
  //   setInput(<bad>, fn)   two args, invalid seat   -> REFUSED WHOLE, and no
  //                                                     seat is touched at all
  //
  // AN EARLIER DRAFT DISPATCHED ON THE FIRST ARGUMENT'S TYPE, and its comment
  // objected to a length test on the grounds that "setInput(undefined) … would
  // read as the per-seat form with no seat". THAT OBJECTION IS MEASURED WRONG:
  // `setInput(undefined)` passes ONE argument, arguments.length is 1, and it
  // takes the legacy branch. One argument is one argument whatever its value.
  //
  // The type dispatch broke two things at once, and the Codex vendor-cross round
  // proved both by mutation. `setInput(1)` — one argument, a non-function, and a
  // call this kernel has always accepted as "clear seat 0" — became a seat
  // address: it cleared seat 1, which had nothing, and left seat 0's provider
  // LIVE. And `setInput("1", fn)` — the malformed seat call the comment right
  // beside it promised to REFUSE — fell into the legacy branch and CLEARED SEAT
  // 0, which is the opposite of a refusal and is worse than any guess. The
  // comment documented a refusal the code did not perform.
  //
  // A REFUSAL IS WHOLE, with zero side effects on any seat. That is
  // js/abilities.js's mask reasoning and sim-host's thrust-frame reasoning: a
  // coordinate has a lid because every value below it is meaningful, but a SEAT
  // INDEX is an enumeration, and a value outside it is not a large seat — it is
  // a caller saying something this kernel has no meaning for. Folding it to seat
  // 0, or clearing seat 0 on the way past, would let a per-seat caller disarm the
  // wrong pilot and never find out.
  //
  // A SEAT WITH NO PROVIDER FLIES AUTO, unchanged and untouched. That is the
  // property the no-recapture proof rests on: with nothing installed anywhere,
  // every seat takes the same branch it took before this change existed.
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
  // Every clause above is now PER SEAT. "Called exactly once per live player
  // tick" means once for the seat it belongs to; "a malformed frame is the empty
  // HUMAN frame, never AUTO" is decided seat by seat, so seat 1 returning junk
  // cannot hand seat 1 back to the autopilot and cannot touch seat 0 at all.
  //
  // The provider is the page's business, never the kernel's: nothing here reads
  // document, window or navigator, because this file also boots inside
  // server/sim-host.mjs's vm sandbox over server/dom-stub.mjs.
  function setInput(a, b) {
    if (arguments.length >= 2) {                 // THE SEAT FORM
      if (!Number.isInteger(a) || a < 0) return; // refused whole; no seat touched
      pilots[a] = typeof b === "function" ? b : null;
      return;
    }
    pilots[0] = typeof a === "function" ? a : null; // THE LEGACY FORM: seat 0
  }

  // ---- setPose(seat, pose) — THE PUPPET SEAM'S ONE ENTRY POINT ------------
  // Hand this kernel one seat's PRODUCTION POSE, already in this kernel's own
  // units. `setPose(seat, null)` returns that seat to the kernel's own flight
  // integration and touches no other seat.
  //
  // THE UNITS ARE THE CALLER'S, AND EVERY ONE OF THEM IS NAMED AT THE HOST.
  // js/encounter-host.js is the converter — it is the file that already knows
  // the ×60 between px/tick and px/second and the ÷60 between ticks and
  // seconds — and nothing here re-derives any of it. What arrives is:
  //
  //   x, y          this kernel's ARENA coordinates
  //   vx, vy        px per SECOND
  //   angle         the converged nose, radians, y DOWNWARD — one convention
  //                 on both sides, so it crosses unchanged
  //   alive, hull, maxHull   production's answer, mirrored so bodies see an
  //                 honest target rather than a hull this kernel maintains
  //   invuln, flash SECONDS
  //
  // A REFUSAL IS WHOLE, on setInput's own rule: a seat index is an ENUMERATION
  // and a value outside it is not a large seat. A pose for a seat with NO
  // RECORD is refused too, and that is the roster boundary rather than a
  // defensive flourish. It used to be the WHOLE story — `resetRun` builds one
  // seat and nothing could grow it, so a four-seat production room posed seat 0
  // and the others were not this kernel's to hold. PORT-S S4 commit A settled
  // that: production sizes the roster through `setSeatCount` once per tick,
  // BEFORE the pose loop, so every seat the room has is a seat this kernel
  // holds. What survives is the boundary itself — a pose for an index past the
  // roster is refused rather than ignored, so a caller that expected a seat can
  // tell, and the ORDER at `poseKernelSeats` is what keeps it from firing.
  //
  // A NON-FINITE FIELD REFUSES THE WHOLE POSE, never `v || 0`: this repo has
  // shipped the Infinity defect once (bf2c961), and a pose is the one record
  // here whose every number reaches the arena directly.
  // ---- THE POSE, APPLIED NOW (S3b lane 3, FIX 10 / S3BR-10) ---------------
  // `setPose` BANKS a pose; the seat's own update slice applies it at the next
  // step. That is right for the per-tick bridge and wrong for exactly one
  // caller: a host resetting this kernel from inside production's tick, AFTER
  // the tick's only pose push. `resetRun` has just rebuilt a native live pilot
  // at hull 100 in its own default position, and a banked pose leaves that
  // record standing until a step that will not come until the next tick.
  //
  // SO THE RESET PATH APPLIES WHAT IT BANKS, through `applyPose` — the SAME
  // writer the update slice uses, never a second one. A caller that wanted a
  // banked pose still gets one; this is the extra half, not a replacement.
  function applyPoseNow(seat) {
    if (!Number.isInteger(seat) || seat < 0) return false;
    var rec = seats()[seat];
    if (!rec || !posed[seat]) return false;
    applyPose(rec, posed[seat]);
    return true;
  }

  function setPose(seat, pose) {
    if (!Number.isInteger(seat) || seat < 0) return false;
    if (pose == null) { posed[seat] = null; return true; }
    // THROUGH THE ROSTER, never `S.players[seat]`. The seat array has exactly
    // three readers by ruling — the roster, its declaration and the deal — and
    // node-golden's (c4) anchor names the function of any fourth. A direct index
    // here is invisible at one seat and wrong at four, which is the whole reason
    // that anchor is a function list rather than a count.
    var rec = seats()[seat];
    if (!rec) return false;
    if (!Number.isFinite(pose.x) || !Number.isFinite(pose.y)
        || !Number.isFinite(pose.vx) || !Number.isFinite(pose.vy)
        || !Number.isFinite(pose.angle)) return false;
    posed[seat] = {
      x: pose.x, y: pose.y, vx: pose.vx, vy: pose.vy, angle: pose.angle,
      alive: pose.alive !== false,
      hull: Number.isFinite(pose.hull) ? pose.hull : rec.hull,
      maxHull: Number.isFinite(pose.maxHull) ? pose.maxHull : rec.maxHull,
      invuln: Number.isFinite(pose.invuln) ? Math.max(0, pose.invuln) : 0,
      flash: Number.isFinite(pose.flash) ? Math.max(0, pose.flash) : 0,
      // THE HULL RADIUS (commit C). Optional: a pose without one leaves every
      // seat-radius site on its own shipped default, which is what a caller
      // that does not know about hull sizes should get.
      r: Number.isFinite(pose.r) && pose.r > 0 ? pose.r : undefined,
      // THE COMET PAIR (S5 commit C). Optional on the same terms as `r`: a
      // pose without them leaves the seat with no aura at all, which is what a
      // caller that does not know about comets should get. `applyPose` copies
      // NEITHER onto the seat record — see its own list of what is deliberately
      // not written, and `r`'s reason there is this pair's reason too.
      comet: pose.comet === true,
      auraR: Number.isFinite(pose.auraR) && pose.auraR > 0 ? pose.auraR : undefined
    };
    return true;
  }

  // ---- THE SWEEP'S TWO MEMBERS (commit B), and their whole implementation --
  // `bodies()` is the enemy plane's `seats()`: ONE reader, so a later round
  // changes the collection's shape in one place. `damageBody` refuses a dead or
  // missing body rather than folding it — a caller sweeping a stale reference
  // is a caller whose candidate list outlived the tick that built it, which is
  // a real defect and not a value to be tolerated. It reports whether the blow
  // was DELIVERED, on the hurt route's rule: the sweep's caller counts hits.
  function bodies() { return S.enemies; }

  // ---- THE DEFERRED DEATH WINDOW (PORT-S S3b lane 3, FIX 1 / S3BR-01) -----
  // A production bolt reaches this file through `damageBody`, and that call is
  // SYNCHRONOUS: a lethal one used to run `killEnemy` before its own caller had
  // emitted `hit` or resolved the shot's blast. Two things went wrong and only
  // one of them was audible.
  //
  //   THE EVENT ORDER INVERTED — the bus read `killheavy, hit, blast`, so the
  //   local audio layer, the FX layer and the wire's unsorted `events[]` all
  //   published a kill before its impact.
  //   AND THE DEATH'S CHILDREN WERE BORN INTO THE BLAST. `killEnemy` spawns a
  //   minelayer's mines and a husk's shards inline. A 1-HP minelayer killed by
  //   a bolt made three mines, and the SAME bolt's blast — resolved one line
  //   later in the caller — then damaged all three, at hp 1 against a declared
  //   spawn hp of 2. With a heavier round they died too and made their own
  //   children, in one impossible causal chain.
  //
  // SO A DEATH TAKEN INSIDE THE WINDOW IS MARKED AND FLUSHED AFTER IT. The
  // window is armed by production around its own bullet-resolve phase and
  // flushed at `encStep`'s REAP SLOT — the slot the retired `reapDead` occupied,
  // which S3B-MAP calls load-bearing and which the deletion had quietly moved.
  //
  // THE MARK LIVES BESIDE THE RECORD, NEVER ON IT. This kernel's serializer
  // hashes every own key a body carries, so a `dying` flag stamped on the
  // record would re-key `tests/fixtures/demo-bounded-reference` — S3a's STOP
  // class, and the same rule the pose-driven flag already obeys. The pending
  // list is module state and the bounded pair is the proof it costs nothing.
  //
  // AND THE KERNEL'S OWN STEP NEVER ARMS IT. Production steps this kernel to
  // completion FIRST and only then runs `Encounter.step`, so the window opens
  // in a gap where no kernel pass is running. A standalone kernel — the bounded
  // replay, demo-play, demo-lab — never enters it at all.
  var deathWindow = false;
  var deathPending = [];   // [{ e, cause }], in the order the killing blows landed
  function armDeaths() { deathWindow = true; deathPending.length = 0; }
  function flushDeaths() {
    deathWindow = false;
    if (!deathPending.length) return 0;
    // A COPY, DRAINED IN PUSH ORDER. `killEnemy` spawns children and those
    // children are alive from this moment — but they are NOT in this list and
    // must not be, or a chain reaction inside one flush would defer forever.
    // The list is cleared before the first call for the same reason.
    var pend = deathPending;
    deathPending = [];
    for (var i = 0; i < pend.length; i++) killEnemy(pend[i].e, pend[i].cause);
    return pend.length;
  }
  function damageBody(e, amount, x, y, seat, cause) {
    if (!e || e.dead || !(e.hp > 0)) return false;
    if (!Number.isFinite(amount) || amount <= 0) return false;
    damageEnemy(e, amount, Number.isFinite(x) ? x : e.x, Number.isFinite(y) ? y : e.y,
                CAUSE_KIND[cause] ? cause : "shot",
                Number.isInteger(seat) && seat >= 0 ? seat : -1);
    return true;
  }

  // Which seat is this record? The ten damage call sites all hold a RECORD
  // rather than an index — each of them got it from `targetOf`, from `pilotAt`
  // or from an ascending walk — and the pose route needs the index production
  // speaks. One lookup here is cheaper than an index threaded through ten
  // sites, which is the same trade `damagePlayer`'s own comment already made in
  // the other direction.
  function seatOf(p) { return seats().indexOf(p); }

  // Is this seat's flight production's? Published, because the host and the
  // renderer both have honest reasons to ask and neither may read `posed`.
  function poseDriven(seat) { return !!posed[seat]; }

  // ---- THE HULL RADIUS, MIRRORED (S3b lane 3, commit C) -------------------
  // This kernel hard-codes its seat's hull at 7 (the bullet sweep and the two
  // hitscan half-widths) and 8 (body contact), and the two spellings are the
  // shipped numbers rather than one number written twice. Commit C moved
  // production's ship into this arena at a rescaled `SHIP_R` of 17.5, so a
  // kernel that kept asking about 7 px would let every enemy round pass through
  // more than half of the ship a player can see.
  //
  // IT READS `posed`, NEVER THE RECORD. The radius is a fact about the seat's
  // OWNER and not about the simulation, so it lives beside the pose for the
  // flag's own reason: an `r` key on a seat record re-keys the bounded run.
  //
  // THE DEFAULT IS THE SITE'S OWN NUMBER, passed in, which is what keeps every
  // surface with no pose byte-identical — and it is passed rather than defaulted
  // to a single constant precisely because 7 and 8 are two shipped numbers.
  function hullRadius(p, dflt) {
    var s = seatOf(p);
    var q = s >= 0 ? posed[s] : null;
    return q && Number.isFinite(q.r) ? q.r : dflt;
  }

  // ---- THE AURA RADIUS, hullRadius's TWIN (PORT-S S5, commit C) -----------
  // Same shape, same reason, one difference: it answers 0 unless the seat is
  // BOTH posed and BURNING. D26's aura pass reads this and walks nothing at 0,
  // so every surface with no comet — the two lab pages, the bounded sandbox,
  // every trace with a cold pilot — is byte-identical by construction rather
  // than by a guard somewhere else.
  //
  // PRODUCTION OWNS THE NUMBER, not this file. The radius is
  // `SHIP_R + (COMETAOE + COMETAOEDMG) * f` over the seat's PRE-SPEND pool, and
  // it is computed once per tick in js/game.js and pushed. A kernel that
  // recomputed it would be a second authority on the halo's size, and the halo
  // the pilot SEES is the one thing this radius may never disagree with.
  function auraRadius(p, dflt) {
    var s = seatOf(p);
    var q = s >= 0 ? posed[s] : null;
    if (!q || q.comet !== true) return dflt;
    return Number.isFinite(q.auraR) ? q.auraR : dflt;
  }

  // THE MIRROR. Everything a pose-driven seat's record carries that this
  // kernel would otherwise have integrated, and nothing else.
  //
  // WHAT IS DELIBERATELY NOT WRITTEN, each with its reason:
  //   `p.fire`     production owns the trigger — its bullet plane is the one
  //                that survives — so the kernel's cooldown has nothing to
  //                count down and is held at 0 rather than left drifting.
  //   `p.respawn`  production owns the death clock; `alive` is mirrored from
  //                its answer, so a second clock here could only disagree.
  //   `p.target`   the AUTO pilot's aim pick, and the AUTO pilot does not run
  //                for this seat. Held at 0 — the record's own "no target".
  //   `p.trail`    the exhaust particle. Production draws its own engine flame
  //                and a second exhaust would be a second ship's worth of it;
  //                skipping it also keeps this branch free of an fx RNG draw.
  // `thrustAngle` IS written, from the pose's own velocity, because it is what
  // a renderer points the exhaust along and a stale one would smear backwards.
  function applyPose(p, pose) {
    p.x = pose.x;
    p.y = pose.y;
    p.vx = pose.vx;
    p.vy = pose.vy;
    p.angle = pose.angle;
    if (pose.vx !== 0 || pose.vy !== 0) p.thrustAngle = Math.atan2(pose.vy, pose.vx);
    p.alive = pose.alive;
    p.hull = pose.hull;
    p.maxHull = pose.maxHull;
    p.invuln = pose.invuln;
    p.flash = pose.flash;
    p.fire = 0;
    p.respawn = 0;
    p.target = 0;
  }

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
      cue: typeof next.cue === "function" ? next.cue : noop,
      // ---- THE FOURTH CHANNEL: CREDIT (S3b lane 2, commit B) --------------
      // `credit(seat, value)` — a seat collected `value` worth of pickup. It is
      // a fourth SINK member rather than a fourth `cue` name, and the split is
      // the one this file already draws: `cue` is a MOMENT a host may sound or
      // draw (a mine laid, a cap refused, a body killed) and a host that
      // ignores it loses nothing but a noise. This is an ECONOMIC FACT, and a
      // host that ignores it loses a payment. Putting a payment on the audio
      // channel would make "did the wallet move?" depend on whether anybody
      // wired the speakers.
      //
      // THE KERNEL EMITS AND STOPS THERE. It does NOT call production's
      // `addXp(n, seat)`: this file reads no production surface, ever — it
      // boots inside server/sim-host.mjs's vm over a throwing DOM stub and
      // there is no `window.Encounter` in it. Routing this into production's
      // wallet is js/encounter-host.js's job (commit D), which is the same
      // division the other three channels already run under.
      //
      // NOOP-DEFAULTED like its siblings, so every existing surface — none of
      // which supplies one — is untouched, and so a host wiring three channels
      // and forgetting the fourth silently loses payments rather than throwing.
      // That is the sink's shipped contract and this member does not get to
      // change it; what protects against the silent loss is commit D's driven
      // leg, not a boundary check here.
      credit: typeof next.credit === "function" ? next.credit : noop,
      // ---- THE FIFTH CHANNEL: HURT (S3b lane 3, commit A) -----------------
      // `hurt(seat, amount, src)` — damage this kernel would have applied to a
      // POSE-DRIVEN seat, handed to whoever owns that seat's hull. It is the
      // credit channel's exact shape and it is one for the same reason: losing
      // a `cue` costs a noise, losing a payment costs money, and losing one of
      // these costs a pilot's life.
      //
      // IT IS THE ONLY SINK MEMBER WITH A RETURN VALUE, and the value is
      // production's answer — did the hull actually take it. The three gates
      // that can refuse (a dead seat, D28's comet contact refusal, the
      // i-frames) all live on production's side of the seam, and this kernel's
      // contact branches read the boolean to arm their own cooldowns. A route
      // that guessed `true` would let a body bounce off a pilot it never hit.
      //
      // THE DEFAULT IS `FALSE`, NOT A NOOP, and that is the one place this
      // channel departs from its siblings. A noop returns `undefined`, which is
      // falsy, so the arithmetic would be the same — but stating it is what
      // makes the meaning right: a host that wires no `hurt` has not said "no
      // damage happened", it has said "nobody owns this seat's hull", and the
      // honest answer to "did the hull take it" is then NO. A pose-driven seat
      // on a host that ignores this channel is invulnerable, loudly and by
      // construction, rather than quietly taking damage into a mirror that the
      // next pose overwrites.
      hurt: typeof next.hurt === "function" ? next.hurt : hurtRefused
    };
  }

  // See the fifth channel above: the DEFAULT, and it is a named function rather
  // than `noop` so a reader of the sink literal can see that the answer is a
  // refusal and not an accident of `undefined` being falsy.
  function hurtRefused() { return false; }

  // THE SEAT RECORD GAINED `score` AT S3b LANE 2 COMMIT C. It is inside
  // `players`, so it is a NESTED object's key: demo-serial.js sorts nested keys
  // rather than reading them off INCLUDED, and the field lands between
  // `respawn` and `target` in every hashed state without the field list saying
  // so. A RESPAWN DOES NOT CLEAR IT — production's own rule is that only dying
  // takes a score down and only `deathToll` does it, and this kernel has no
  // toll; inventing one here would be a balance ruling nobody made.
  function newPlayer() {
    if (WORLD_BOUNDED) {
      return {
        x: ARENA_W * 0.5, y: ARENA_H * 0.55, px: ARENA_W * 0.5, py: ARENA_H * 0.55,
        vx: 18, vy: -24, angle: -Math.PI * 0.5, pangle: -Math.PI * 0.5,
        thrustAngle: -Math.PI * 0.5, fire: 0, trail: 0, hull: 100,
        maxHull: 100, invuln: 1.5, target: 0, alive: true, flash: 0,
        respawn: 0, score: 0
      };
    }
    return {
      x: PLAY_W * 0.5, y: PLAY_H * 0.55, px: PLAY_W * 0.5, py: PLAY_H * 0.55,
      vx: 18, vy: -24, angle: -Math.PI * 0.5, pangle: -Math.PI * 0.5,
      thrustAngle: -Math.PI * 0.5, fire: 0, trail: 0, hull: 100,
      maxHull: 100, invuln: 1.5, target: 0, alive: true, flash: 0,
      respawn: 0, score: 0
    };
  }

  // ---- THE ROSTER'S PUBLIC SIZE (PORT-S S4, commit A) ---------------------
  // `resetRun` builds ONE seat and its own comment defers the count: "the count
  // becomes the room's fact at S4." This is that call, and it is the FIRST
  // public way anything outside this file may change how many seats exist.
  //
  // WHY IT HAD TO EXIST. Every D14/D17/D19/D20 ruling reads the roster —
  // `livingCentre`'s centroid, `pilotAt`'s nearest-living pick, the mine's area
  // trigger, the setpiece heal — and until now the only route to a second seat
  // was `test/tools/demo-seats.mjs` REWRITING this file's source to publish
  // `newPlayer` under a scratch name. A tool that has to edit the product to
  // measure it is measuring a stand-in; commit A retires that graft onto this
  // call in the same commit, so the tool and the product cannot drift.
  //
  // THE RECORDS ARE `newPlayer()`'s, UNMODIFIED AND IDENTICAL. No spread, no
  // per-seat spawn point: every seat this kernel grows is pose-driven by
  // production within the same tick (`poseKernelSeats` pushes for every seat in
  // production's roster and `applyPosesNow` lands them), so a spawn point
  // invented here would be overwritten before it was ever drawn. Keeping them
  // identical is also what makes the graft's retirement a rename rather than a
  // behaviour change — `demo-seats.mjs` pushed exactly `newPlayer()` copies.
  //
  // BYTE-IDENTICAL AT ONE SEAT, BY CONSTRUCTION. Nothing calls this on the AUTO
  // path, and at `count === 1` both loops below are empty. The bounded pair is
  // the proof and it is unmoved at this commit.
  //
  // A SEAT INDEX THAT CHANGES OCCUPANCY STARTS CLEAN. Growing back into an index
  // a shrink released must not inherit the departed occupant's pose or input
  // provider — those are facts about the HOST, they live beside the record for
  // the reason `posed`'s own block gives, and nothing else would clear them. So
  // both directions clear both parallel arrays for every index they touch.
  //
  // THE LID IS PRODUCTION'S OWN, 8 (`js/game.js` `setPlayerCount`): seat 0
  // always exists, and 8 is a sanity lid rather than a design number. The
  // server's MAX_SEATS is 4 and stays the design number.
  var ROSTER_MAX = 8;
  function setSeatCount(n) {
    var count = clamp(Math.floor(+n) || 1, 1, ROSTER_MAX);
    while (S.players.length < count) {
      posed[S.players.length] = null;
      pilots[S.players.length] = undefined;
      present[S.players.length] = undefined;   // commit D: and its presence
      S.players.push(newPlayer());
    }
    while (S.players.length > count) {
      posed[S.players.length - 1] = null;
      pilots[S.players.length - 1] = undefined;
      present[S.players.length - 1] = undefined;
      S.players.length = S.players.length - 1;
    }
    return S.players.length;
  }

  // ---- THE THREAT FACTOR (PORT-S S4, commit C) — D8 / D14 -----------------
  // ONE derivation, read by everything a headcount is allowed to scale, so the
  // room's difficulty cannot be two numbers that disagree.
  //
  //   threat = 1 + 0.2 x (present - 1)
  //
  // 1.0 / 1.2 / 1.4 / 1.6 at one to four seats. D14's row asks for "SUB-LINEAR,
  // ~1.6x AT FOUR SEATS" and the owner's reasoning as accepted is that "four
  // pilots should feel stronger together, which suits an arena where they also
  // fight each other". One slope reaches his number at four exactly and stays
  // legible past it, which a curve fitted to a single point would not.
  //
  // IT IS ALSO THE BANDWIDTH BILL, and that is not a side effect. R3 regressed
  // the wire law at `420 + 78 x enemies` kbit/s and trigger T2 FIRES under
  // LINEAR scaling: wave 15's eighteen bodies become 29 under this slope and 72
  // under a per-seat deal, which is 2.7 Mbit/s against 6.0 for each of four
  // clients. The margin R7/R8b is being bought exists only under the sub-linear
  // rule.
  //
  // AT ONE SEAT IT IS EXACTLY 1, and eleven golden traces plus both bounded
  // manifests rest on that. It is not left to inspection: `test/node-golden.mjs`
  // (c6) flies a whole arc at one seat and holds every wave's dealt count
  // against this file's own WAVES table.
  //
  // ---- WHAT `PRESENT` MEANS, AND WHERE IT NARROWS -------------------------
  // Commit C reads the ROSTER, because at commit C the roster is the only
  // headcount that crosses the seam. Commit D narrows it to CLAIMED AND NOT
  // PARKED — D17's park is the whole reason the two differ, and the presence
  // gate the POR told S4 to "reuse" was DELETED with production's dealer at
  // S3b commit D4, so it is rebuilt here rather than found. The narrowing is
  // one function body and this comment is where it lands.
  var THREAT_SLOPE = 0.2;
  // ---- D16's ESCALATION (PORT-S S4, commit F) -----------------------------
  // *"ENDLESS, ESCALATING LOOPS — AND THE WIPE IS THE ENDING. The arc repeats
  // at rising threat and never completes on its own ... the run lasts until the
  // ROOM dies, and the wipe is the scoring moment."*
  //
  // IT RIDES THE SAME KNOB, so a cycle and a headcount cannot become two
  // difficulty systems that disagree: `threatFactor()` multiplies the seat
  // slope by this, and BOTH of its readers — D14's deal and D20's boss hull —
  // escalate for free and in step. Nothing else scales, which is D20's ruling
  // repeated at a second axis: a boss lives longer, its telegraphs do not
  // quicken.
  //
  // `S.cycle` IS THE ONLY HOOK AND IT ALREADY EXISTS. It is written by
  // `resetRun` and `advanceWave` and, before this commit, READ BY NOTHING —
  // two writes, zero reads. It is already in `demo-serial.js`'s INCLUDED list,
  // so the escalation costs no new hashed key, which matters because that file
  // THROWS on an own key of `S` it has not heard of and is not this lane's to
  // edit.
  //
  // ---- THE FORMULA IS `(S.cycle - 1)`, WHERE THE BRIEF SAYS `S.cycle` ------
  // A CORRECTION, measured rather than argued. `resetRun` sets `S.cycle = 1`,
  // so `1 + ESCALATE * S.cycle` would put the FIRST arc at 1.15x — every trace,
  // both bounded manifests and D14's whole one-seat identity move on the day
  // the dial is added, for a "rising" difficulty with no baseline to rise from.
  // The map's own risk 7 states the intended shape: *"every pin AFTER THE FIRST
  // CYCLE RESTART changes for a second reason"*. `(S.cycle - 1)` is that
  // sentence: cycle 1 is exactly 1.0 and the rise starts at the loop.
  //
  // A DIAL, NOT A DECISION. 0.15 per cycle is a first-pass balance number — the
  // second arc deals 1.15x and the third 1.30x, so wave 15's eighteen bodies
  // become 21 and then 23. S6 documents it and the feel gate judges it.
  var ESCALATE = 0.15;
  function escalation() {
    return 1 + ESCALATE * (S.cycle - 1);
  }

  // ---- D38: A BUILD-SCALING BOSS-HULL DIAL, DEFAULT 0 ---------------------
  // The SEVENTH AMENDMENT, owner-ruled 2026-08-26 option C: *"a build-scaling
  // hull term EXISTS as an S4 dial, DEFAULT 0; if turned on it sums PRESENT
  // seats' purchases. D20 stands — hull only, never attack rate or telegraph."*
  //
  // WHY IT LANDS NOW AND NOT WHEN IT IS TURNED ON: at 0 the term is
  // byte-identical to today's rounded multiply, and the ONE recapture is still
  // ahead. Added after the freeze it would cost a second capture, which the
  // inherited rule set makes a seat STOP.
  //
  // THE NUMBER IS PRODUCTION'S AND CROSSES AS ONE SCALAR. `purchases` is
  // Σ `rankAt(i, seat)` over the eight SHOP rows for PRESENT seats, and the shop
  // is production's plane — the S3b-C rule stands, this kernel reads no
  // production surface. So it arrives exactly as the seat count and the presence
  // flags arrive: pushed per tick by `poseKernelSeats`, read HERE at the deal.
  // An un-pushed kernel reads 0, which is what keeps every lab page, the bounded
  // runs and every kernel-oracle instrument unmoved.
  //
  // WHERE THE TERM MULTIPLIES — THE ROW'S OWN PHRASE, RESOLVED BY THE SEAT.
  // D38's row says the term "multiplies `threatFactor()`", and `threatFactor()`
  // is read at TWO sites: `dealCount()` (D14's budget) and `bossHull()` (D20's
  // hull). The seat resolved it in D20's favour: the term multiplies the
  // BOSS-HULL factor and nothing else, so a build can never change how many
  // bodies a room deals. D14's budget is untouched and a leg asserts it.
  //
  // INDEPENDENT OF `ESCALATE`, which is the other thing that multiplies the same
  // factor: one is a fact about the LOOP and one is a fact about the BUILD, and
  // multiplying them is the composition the row asks for.
  //
  // demo-v4's VALUE, FOR THE RECORD ONLY: `min(1.5, purchases * 0.055)`. The
  // CAP is v4's and is not adopted here — this dial is the SLOPE alone, so the
  // shape of a ceiling stays an owner decision. S6 documents the number and the
  // feel gate judges it; the DEV TUNE ROUTE is how it is turned, and no
  // pause-panel row is required for a dial whose default is off.
  var BUILDSCALE = 0;
  let buildPurchases = 0;
  function setBuildScale(v) {
    if (!Number.isFinite(v) || v < 0) return false;
    BUILDSCALE = v;
    return true;
  }
  function setBuildPurchases(n) {
    // FLOORED AND NON-NEGATIVE. It is a COUNT of ranks bought; a fractional or
    // negative one is a caller defect, and a hull that quietly took a NaN would
    // put NaN in a hashed field on the tick a boss spawned.
    buildPurchases = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    return true;
  }
  // ---- ...AND IT IS LATCHED AT THE DEAL (the HOLD round, fix 13) ----------
  // The ruling's own words are *"one number passed INTO the kernel at the
  // deal"*, and the scoped check found the shipped shape was not that: production
  // overwrites the scalar EVERY TICK and `bossHull` first read it later, at
  // `spawnEnemy`. Measured — with `BUILDSCALE = .055` the same queued Spitfire
  // spawned at 210 hull when the scalar stayed 0 and at 326 when purchases
  // changed to ten after the deal and before the boss emerged. An already-dealt
  // boss changed with post-deal shopping, which is a room re-sizing itself
  // around a shop the player is standing in.
  //
  // THE LATCH RIDES A SIDE MAP, NOT THE RECORD, and that is a hard constraint
  // rather than a preference: `test/tools/demo-serial.js` hashes each entry's
  // WHOLE RECORD with its keys sorted, so a `buildAt` field on the entry would
  // move every state in every trace that has an entry pending — every fixture in
  // the tree, for a dial whose default is off. The map is keyed by ENTRY ID
  // (monotonic, never reused), read once at spawn and deleted there, and cleared
  // wherever entries are dropped. It is module state, never serialized, exactly
  // like `present[]` and `posed[]`.
  const buildAtDeal = new Map();
  function forgetBuildLatches() {
    if (buildAtDeal.size) buildAtDeal.clear();
  }
  function buildFactor(at) {
    // AT THE DEFAULT THIS RETURNS EXACTLY 1, and `x * 1` is exact in IEEE-754 —
    // which is why the dial can ship dark without moving one bit of one fixture.
    //
    // `at` IS THE DEAL-TIME COUNT when a caller has one. Undefined means "what
    // would a boss dealt right now get", which is what the published reader is
    // asked for and what a child body spawned outside any deal takes.
    return 1 + BUILDSCALE * (at === undefined ? buildPurchases : at);
  }
  // ---- PRESENCE (PORT-S S4, commit D) — and this is where D17's gate lives --
  // `present` is a sparse array indexed by seat, EXACTLY as `posed` and `pilots`
  // are, and it lives BESIDE the record for the identical reason their own
  // blocks give: this kernel's serializer HASHES EVERY OWN KEY of a seat
  // record, so a `present: true` field on the record would re-key both bounded
  // manifests on the day it was added, for a fact about the ROOM rather than
  // about the simulation.
  //
  // AN ABSENT ENTRY IS PRESENT. A kernel nobody has called `setSeatPresent` on
  // counts every seat it holds, which is exactly commit C's behaviour — so the
  // lab pages, `demo-play.html`, the bounded runs and every kernel-oracle
  // instrument are unmoved by this commit, and the narrowing costs nothing
  // where nothing narrows it.
  //
  // ---- WHAT `PRESENT` MEANS, AND WHY IT HAD TO BE REBUILT ----------------
  // D8: *"The presence gate moves from the deal into the director's budget."*
  // D17 was told to REUSE the shipped Route A mechanism — "4 seats parked
  // behind a presence-gated deal" — and that mechanism DOES NOT EXIST: the gate
  // lived inside production's own `startWave` deal, and S3b commit D4 deleted
  // the dealer and left the prose. Nothing in the tree presence-gated any deal
  // before this commit. So it is rebuilt here rather than found, and it is
  // rebuilt where D8's own sentence puts it: in the director's budget.
  //
  // CLAIMED AND NOT PARKED. Production pushes `!absent` for every seat it holds
  // (`poseKernelSeats`), which is that sentence in production's own vocabulary:
  // `parkSeat` and `unseatSeat` both go through `vacateSeat`, which is what
  // sets `absent`, and `reseatSeat` is what clears it. A seat waiting on its
  // claim click is PRESENT — somebody is there — and a seat counting down a
  // respawn is present too. Only an EMPTY seat is not.
  let present = [];
  function setSeatPresent(seat, on) {
    if (!Number.isInteger(seat) || seat < 0) return false;
    present[seat] = on !== false;
    return true;
  }
  function presentCount() {
    // THROUGH THE ROSTER, never `S.players`. node-golden's (c4) oracle allows
    // exactly four namers of the seat array — the roster, its declaration, the
    // deal and the public size — and this is a HEADCOUNT read, which is
    // gameplay. It went through `S.players` in the first cut and reded there,
    // which is the oracle doing its job.
    const list = seats();
    let n = 0;
    for (let i = 0; i < list.length; i++) if (present[i] !== false) n++;
    // A ROOM WITH NOBODY IN IT STILL DEALS AT 1.0x rather than at 0.8x or at
    // some negative slope. It is reachable — every seat parked between rounds —
    // and the alternative is arithmetic nobody ruled.
    return Math.max(1, n);
  }
  // ---- THE UNFLOORED HEADCOUNT (D66 / OPEN 8) -----------------------------
  // `presentCount()` above FLOORS AT ONE and that floor is a RULING, not an
  // implementation detail: node-golden asserts that an UNCLAIMED room still
  // receives the successor plane's arc (D8/D14). So `presentCount() > 0` is a
  // TAUTOLOGY, and a hold written on it degrades to the bare living-pilot test
  // D66 forbids by name.
  //
  // THE DEFAULT STAYS PRESENT. `present[i] !== false` is `presentCount`'s own
  // predicate: a seat nobody has pushed for counts as PRESENT, which is what
  // keeps every harness that never calls `setSeatPresent` out of a permanent
  // hold. This is `presentCount`'s body minus its last line and nothing else.
  function presentRaw() {
    const list = seats();
    let n = 0;
    for (let i = 0; i < list.length; i++) if (present[i] !== false) n++;
    return n;
  }
  function threatFactor() {
    return (1 + THREAT_SLOPE * (presentCount() - 1)) * escalation();
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
    // ...AND THE AURA'S CHILD QUEUES, for exactly the reason `nextId` is on the
    // line above (S5 FIX ROUND, Codex CX-6). A reset between the staged kernel
    // half and the flush — a terminal pilot death freezes `encStep` before
    // `flushKernelChildren`, and `restart()` follows — would otherwise carry
    // the previous run's children, and their previous ids, into tick 0 of a new
    // seed. Ruling 2's queue-survival case is a PILOT death inside one run and
    // is untouched: that queue is flushed by the same tick's facade call.
    childStaging = false;
    childRounds.length = 0;
    childBodies.length = 0;
    S.time = 0;
    // ...AND D66's HELD DURATION, on the same line as the clock it shifts
    // against. The WIPE reaches this function through production's own
    // `resetKernel`, and `startWave(1)` on the very next line of that block
    // stamps a FRESH absolute `due` off `S.time` — so without this clear a room
    // that wiped mid-hold would shift the new run's wave-1 schedule by the OLD
    // run's accumulation.
    holdAccum = 0;
    S.tick = 0;
    S.wave = 1;
    S.waveTime = 0;
    S.cycle = 1;
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
    forgetBuildLatches();   // D38's deal-time latches die with the entries (fix 13)
    // THE ROSTER IS REBUILT, not mutated: a host that held the old record has
    // to be handed the new one anyway, and an array that survived a reset would
    // carry a dead seat's fields into a fresh run.
    //
    // ONE SEAT IS WHAT A RESET DEALS, AND THE ROOM'S COUNT IS PRODUCTION'S
    // (PORT-S S4, commit A). The line here deferred that count — "the count
    // becomes the room's fact at S4" — and it is settled: `setSeatCount(n)`
    // grows the roster back, and `poseKernelSeats` calls it every tick, so a
    // reset taken from inside production's own tick is repaired before the poses
    // land (js/encounter.js's FIX 10 pair). A standalone kernel — the lab pages,
    // the bounded runs — never calls it and keeps its one seat.
    S.players.length = 0;
    S.players.push(newPlayer());
    S.gateTimer = 0;
    makeStars();
    startWave(1, true);
    // Ascending seat order, per the loop law in updatePlayers — the arrival
    // pulse is a per-seat draw like any other.
    for (let s = 0; s < S.players.length; s++) {
      emitShockwave(S.players[s].x, S.players[s].y, "cyan", 15, 90, 0.7);
    }
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

  // ---- THE MANUAL JUMP'S BOARD CLEAR (PORT-S S4, commit G) ----------------
  // The shape D21 FORBIDS IN PLAY, kept as the mechanism of an INSTRUMENT. It
  // was `advanceWave(manual)`'s own inline branch with no caller anywhere in the
  // tree; commit G gives it exactly one — the dev lever — and extracts it here
  // so both spellings of "jump" are the same lines rather than two copies that
  // could drift.
  //
  // IT IS NOT REACHABLE IN PLAY, and that is a property this file cannot assert
  // on its own: `advanceWave(false)` is the only call the director makes, and
  // the only caller of `devDealSetpiece` is production's `dealWave`, whose only
  // non-test caller is `server/server.js`'s `applyLabFlags()` behind
  // `devTuneOn()`. `test/node-golden.mjs` holds that call census as a source
  // shape, in both directions.
  function clearBoardForJump() {
    S.schedule = S.schedule.filter(function (g) { return g.wave !== S.wave; });
    S.entries.length = 0;
    forgetBuildLatches();   // (fix 13)
    S.enemies.length = 0;
    S.bullets = S.bullets.filter(function (b) { return b.team === "player"; });
  }

  function advanceWave(manual) {
    if (manual) clearBoardForJump();
    if (S.wave < WAVES.length - 1) {
      startWave(S.wave + 1, false);
      return;
    }
    // A restrained nova clears the representative seed before it loops. It is
    // deliberately a transition, not a screen-filling muzzle flash.
    S.cycle++;
    S.schedule.length = 0;
    S.entries.length = 0;
    forgetBuildLatches();   // (fix 13)
    S.enemies.length = 0;
    S.bullets = S.bullets.filter(function (b) { return b.team === "player"; });
    S.orbs.length = 0;
    S.finaleFlash = Math.max(S.finaleFlash, 0.72);
    // ONCE, ON THE ROOM'S CENTRE — not once per seat. The nova is a TRANSITION
    // and the comment two lines up calls it restrained; four of them at four
    // seats would be exactly the screen-filling flash that comment refuses. It
    // is the one place where the room's anchor is the right answer and a
    // per-seat loop is the wrong one, and at a single seat the two coincide.
    const nova = livingCentre();
    if (nova !== null) {
      emitShockwave(nova.x, nova.y, "cyan", 24, Math.min(PLAY_W, PLAY_H) * 0.42, 1.15);
      burst(nova.x, nova.y, "cyan", 28, 150);
    }
    S.shake = Math.max(S.shake, 5);
    startWave(1, false);
  }

  // ---- THE BOARD WIPE IS DELETED (PORT-S S4, commit E, D21) --------------
  // What stood here was FIVE LINES and the owner's complaint is about all five:
  //
  //     S.schedule.length = 0;
  //     S.entries.length = 0;
  //     S.enemies.length = 0;                              <- the board wipe
  //     S.bullets = S.bullets.filter(b => b.team === "player");
  //     S.orbs.length = 0;                                 <- the unbanked bounty
  //
  // *"the next arc would just wipe out all the enemies currently on the board
  // and then just start. This shouldn't happen."* It is measured in a committed
  // fixture, not merely reported: in the WALL TOUR leg the pin at tick 2494
  // carried 44 live enemies and the pin at 3094 — the next setpiece, curated —
  // carried 0. Waves 1-5 deal exactly 44, so the tour had killed NOTHING and
  // this function deleted every one of them plus wave 6's ten and the hive's
  // drones, in a single tick, along with the unbanked orbs they would have
  // dropped.
  //
  // UNDER CLEAR-TO-ADVANCE THE LINES ARE ALSO UNREACHABLE, and that is the
  // second reason they go rather than being guarded: `startWave` is now only
  // ever entered from a CLEARED room, so the field, the schedule and the
  // arrivals are already empty. Lines that can only fire when the gate is
  // broken are lines that would hide the gate being broken.
  //
  // THE HEAL STAYS. The owner's complaint was the wipe, not the gift, and the
  // gift is what it always was: +24 hull and 1.2 s of grace to the whole ROOM
  // before a curated fight.
  function prepareSetpiece() {
    // EVERY seat is topped up between setpieces, in ascending order. It is a
    // gift to the ROOM before a curated fight, so a seat that happens to be
    // second must not arrive at the boss on the hull it limped in with.
    const healed = seats();
    for (let s = 0; s < healed.length; s++) {
      healed[s].hull = Math.min(healed[s].maxHull, healed[s].hull + 24);
      healed[s].invuln = Math.max(healed[s].invuln, 1.2);
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
      // D19's DIRECT anchor. `ring` and `arc` lay their bodies on a circle
      // around the room rather than around seat 0 — the other formations reach
      // the same centre indirectly, through encFrame above.
      const anchor = livingCentre();
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
          points.push({ x: clamp(anchor.x + Math.cos(a) * rad, 0, ARENA_W), y: clamp(anchor.y + Math.sin(a) * rad, 0, ARENA_H), side: side });
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
    // D19's direct anchor, wrapping branch — see the bounded branch above.
    const anchor = livingCentre();
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
        points.push({ x: wrap(anchor.x + Math.cos(a) * rad, W), y: wrap(anchor.y + Math.sin(a) * rad, H), side: side });
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

  // ---- D14's THREAT BUDGET, AT THE DEAL (PORT-S S4, commit D) -------------
  // *"D8's shared director scales its threat budget with PRESENT seats, but
  // sub-linearly: a full room is busier than solo, not four times busier."*
  //
  // PER GROUP, AT DEAL TIME, ROUNDED, WITH A FLOOR OF ONE. Per group rather
  // than per wave because a wave's rows are a COMPOSITION — wave 15's eight
  // groups are eight different arrivals — and a budget spent on the wave as a
  // whole would have to decide which row absorbed it. The floor is what stops a
  // one-body row rounding away at any slope this rule can produce.
  //
  // BOSSES ARE DEALT ONCE, WHATEVER THE HEADCOUNT — D8, in as many words. The
  // predicate is `st.boss`, the same flag D20's hull multiply reads, so "a boss"
  // means one thing in this file. Their scaling is D20's and it is HULL ONLY.
  //
  // THE COUNT IS READ AT THE DEAL, WHICH IS WHERE THE PRESENCE GATE NOW LIVES
  // (D8). A seat that arrives mid-setpiece is parked by D17 and is not present,
  // so it cannot shift a budget the room is already fighting; it is counted at
  // the NEXT deal, which is the sentence D17's row makes about a joiner.
  //
  // ---- THE CAVEAT THE MAP MADE, CARRIED HERE ------------------------------
  // THIS BUDGET COUNTS DEALT BODIES AND NOTHING ELSE. Hive drones, minelayer
  // mines and constructor turrets are BODIES that no wave row lists, and their
  // caps (6 live, `Engine.capAdmit`, 2 live — pinned by name in node-golden's
  // (c5) census) are NOT scaled. So a wave-6 hive at its cap puts six more
  // bodies on the field than this arithmetic can see, at every headcount. That
  // is deliberate: scaling the caps as well would multiply a stream that
  // already re-arms forever, and the child caps are a CADENCE rather than a
  // difficulty dial.
  function dealCount(type, count) {
    const st = STATS[type];
    if (st && st.boss) return count;
    return Math.max(1, Math.round(count * threatFactor()));
  }

  function queueGroup(group) {
    // ONE substream per queued group. The ordinal is the entries list's length
    // at the moment of the call — hashed state, and monotonic within a tick
    // because each group pushes before the next is queued, so two groups
    // materialising on the same tick can never collide.
    const deal = dealRand(S.entries.length);
    const points = formationPoints(group.type, dealCount(group.type, group.count), group.formation, deal);
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      // THE DEAL IS WHERE THE BUILD IS READ (D38, fix 13). One number, taken
      // once, beside `dealCount`'s own read a few lines up — so the room a boss
      // arrives in is the room the deal sized, whatever the shop does next.
      buildAtDeal.set(nextId, buildPurchases);
      S.entries.push({
        id: nextId++, x: point.x, y: point.y, px: point.x, py: point.y,
        type: group.type, formation: group.formation, kind: group.entry,
        side: point.side, age: -i * 0.09, duration: group.entry === "depth" ? 1.2 : 0.95,
        spawned: false, spin: rangeOf(deal, 0, TAU), wave: group.wave
      });
    }
  }

  // ---- D20: BOSS HULL ONLY, NEVER ATTACK RATE (PORT-S S4, commit C) -------
  // The owner's row in full: *"A boss lives about as long at any headcount while
  // its telegraphs and rhythm stay exactly as authored. The reason is the port's
  // whole purpose: readability. Faster telegraphs at four seats would work
  // against the thing demo-v2 is being ported FOR, and would leave survivors of
  // a mid-boss departure fighting a rhythm tuned for more pilots."*
  //
  // ONE GUARDED MULTIPLY, AT ONE SITE, and `st.boss` is the predicate — the flag
  // the STATS table already carries and `killEnemy` already consumes, so no new
  // classification is invented to serve this ruling. Every telegraph timer in
  // this file is a per-state literal somewhere else and NOT ONE of them is
  // reachable from here; `test/tools/demo-director.mjs` LEG 2 asserts that by
  // comparing a freshly spawned boss record FIELD BY FIELD at one seat and at
  // four, which is a stronger statement than any list of timers this comment
  // could keep up to date.
  //
  // ROUNDED, and the rounding is not tidiness. The slope makes `threatFactor()`
  // read 1.4000000000000001 at three seats, so an unrounded 210-hull spitfire
  // would carry 294.00000000000006 into a HASHED field. `Math.round` puts a
  // legible integer there and the floor of 1 is the guard every scaling call in
  // this file carries.
  //
  // A NON-BOSS RETURNS `st.hp` UNTOUCHED, by construction rather than by
  // arithmetic: the branch never multiplies, so a one-seat run and a four-seat
  // run put the identical bits in every ordinary body's hull.
  function bossHull(st, at) {
    if (!st.boss) return st.hp;
    // D38's term rides HERE and nowhere else — hull only, never attack rate and
    // never the deal count. See `buildFactor`'s block for why this is the site
    // the row's "multiplies threatFactor()" resolves to, and the latch block for
    // why `at` is the DEAL-time count rather than this tick's.
    return Math.max(1, Math.round(st.hp * threatFactor() * buildFactor(at)));
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
    // D20's hull, resolved ONCE (commit C). `hp` and `maxHp` are the same
    // number by contract — every hull-fraction read in the renderer and on the
    // wire divides one by the other — so they take one call rather than two.
    // ...and D38's DEAL-TIME COUNT, read off the latch and released with it
    // (fix 13). A child body (a drone, a mine, a turret) is spawned from a
    // synthetic `at` with no id and takes the live count, which is right: it was
    // never dealt, and it is never a boss either.
    const dealtAt = entry && buildAtDeal.has(entry.id) ? buildAtDeal.get(entry.id) : undefined;
    if (dealtAt !== undefined) buildAtDeal.delete(entry.id);
    const hull = bossHull(st, dealtAt);
    const a = rangeOf(gen, 0, TAU);
    const e = {
      id: id, type: type, x: entry.x, y: entry.y, px: entry.x, py: entry.y,
      vx: Math.cos(a) * 8, vy: Math.sin(a) * 8, angle: a, pangle: a,
      hp: hull, maxHp: hull, r: st.r, dead: false, hit: 0,
      emerge: entry.kind === "depth" ? 1.05 : 0.62,
      emergeMax: entry.kind === "depth" ? 1.05 : 0.62,
      cooldown: rangeOf(gen, 0.35, 1.15), timer: 0, state: "approach",
      orbit: gen() < 0.5 ? -1 : 1, phase: rangeOf(gen, 0, TAU), contact: 0,
      lance: 0, lanceAngle: a, lanceHit: false, chargeAngle: a,
      dashAngle: a, spawnTimer: rangeOf(gen, 1.5, 2.6), parent: 0,
      ownerId: 0, attackTimer: 0, auxTimer: 0, attackIndex: 0,
      phaseTime: 0, shield: 0, shieldPulse: 0, weakPulse: 0,
      enraged: false, finale: false,
      // ---- THE CREDIT AND AGGRO TRIPLE (S3b lane 2, commit A) -------------
      // Production's three, by their production names and with production's
      // "nobody" value: js/encounter.js spawns bodies with `lastAtk: -1` and
      // `nearestSeat` returns -1 when every seat is down, so -1 is this repo's
      // own word for no seat rather than a sentinel invented here.
      //
      // SPAWNED UNCONDITIONALLY, and that is the load-bearing half. A kernel
      // body hashes through NO allow-list — test/tools/demo-serial.js sorts and
      // emits every own key of every record — so a key that arrives only on the
      // bodies that happen to have been shot would make the record's key SET a
      // function of the flight. That is exactly the shape S3a measured (one
      // enemy of six carrying a new `lastAtk: 0` at tick 132, 41 keys to 42).
      // Three keys on every body, from the first tick, is one uniform shape.
      lastAtk: -1,   // who last damaged me — consumed at the next decision
      tgtSeat: -1,   // ...and who I have committed to chase
      aggroT: 0      // ...for this many more ticks
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
    pushEnemyBody(e);
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
    // ---- AN AREA TRIGGER, AND IT WALKS THE ROSTER (S3b-C fix 13) ---------
    // THIS READ `targetOf(e)` AND ITS COMMENT SAID WHY: "the proximity trigger
    // needs the NEAREST living seat and nothing else: targetOf returns the
    // minimum, so if any living seat is inside the ring then this one is."
    // THAT SENTENCE WAS TRUE WHEN IT WAS WRITTEN AND COMMIT A MADE IT FALSE.
    // The pilot pick is LATCHED now — a body holds a committed target for its
    // whole window and prefers the seat that last damaged it — so `targetOf(e)`
    // is no longer the minimum, and a mine armed against a seat that walked
    // away sat inert while another seat stood 10 px from it. Measured by the
    // fourth vendor-cross round: it detonated only when the latch expired, and
    // a seat that left before then was spared entirely.
    //
    // A PROXIMITY RING IS AN AREA QUESTION, which is S3a's own doctrine at
    // `targetOf`: "AREA — a detonation, a blast radius, a SWEEPING ray. It is
    // pointed at a PLACE rather than at anybody, so it reaches every living
    // seat inside it, in ASCENDING SEAT ORDER." A mine does not aim. It is the
    // clearest AREA case in the file and it was reading an AIMED answer.
    //
    // THE FIX IS THE LOOP, NOT A GATE CLAUSE. An `armed` clause in
    // `committedToALine` would stop the mine RE-DECIDING, which is not the
    // defect — the defect is that its trigger asks the wrong question, and it
    // would ask the wrong question just as hard with the latch frozen.
    //
    // ASCENDING, and it is the pinned order (js/game.js's drain-order law):
    // once more than one seat can be inside one ring, WHICH seat trips it is
    // hash-visible. It breaks on the first, exactly as the single test did.
    if (e.armed <= 0) {
      const near = seats();
      for (let s = 0; s < near.length; s++) {
        const t = near[s];
        if (!t.alive) continue;
        if (distSq(e, t) < e.proximity * e.proximity) { killEnemy(e, "proximity"); break; }
      }
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

  // ---- D21: CLEAR TO ADVANCE. NO BOARD WIPE. NO CLOCK. (S4, commit E) -----
  // The owner, from play: *"instead of waiting for all on-screen enemies to die,
  // the next arc would just wipe out all the enemies currently on the board and
  // then just start. This shouldn't happen. Arcs should start when players wipe
  // the enemies / bosses of the previous arc."*
  //
  // WHAT STOOD HERE WAS TWO WRONG RULES AND D21'S ROW NAMES BOTH. An UNGATED
  // wave advanced on `S.waveTime >= def.duration` — a pure clock that ignored
  // the field entirely. A GATED wave watched ONE named type, so every other
  // body alive was irrelevant to it. Both are gone; `duration` and `gate` went
  // with them (see the WAVES table's own block).
  //
  // ---- THE GATE'S READING, RULED BY THE SEAT AND WRITTEN HERE -------------
  // THE ROOM IS CLEAR WHEN NO LIVE BODY REMAINS AND NOTHING IS STILL COMING.
  //
  //   LIVE is `!dead && hp > 0` — `liveBodies()`, which is production's
  //   `foeCount()` and `applyKernelHud`'s census and this gate, ONE derivation
  //   read three times. Two copies of a census is how a gate and a HUD come to
  //   disagree about whether a room is empty.
  //
  //   STILL COMING is `S.schedule` (groups not yet due) plus the UNSPAWNED
  //   entries. A portal is NOT a source — it spawns its one body at its own
  //   `entry.duration` and splices itself shortly after, so it resolves on its
  //   own inside two seconds — but a portal that has not opened yet is a body
  //   that has not arrived, and advancing past it would deal the next setpiece
  //   on top of this one's late arrival.
  //
  //   ATTRITION COUNTS AS RESOLUTION. A warden fires once and LEAVES (see
  //   `updateWarden`'s escape state); a mine expires on its own `life`. Neither
  //   was killed by anybody and both are RESOLVED. The alternative reading —
  //   "every dealt body was KILLED" — hangs forever on the first warden that
  //   got away, which is 6 of an arc's 129 bodies. The gate says NO LIVE BODY
  //   REMAINS, and that admits attrition on purpose.
  //
  //   A SOURCE MUST DIE, and it needs no clause of its own: a hive, a
  //   constructor, a minelayer and the three bosses are BODIES, so a live one
  //   is a live body and the room is not clear. That is also D21(a)'s named
  //   deadlock hazard answered — a hive re-arms its drone stream forever, so a
  //   gate phrased as "no live CHILD" could never clear a room with one in it,
  //   while "no live BODY" clears the moment the hive itself dies.
  //
  //   ORDNANCE IS NOT A BODY AND NEVER GATES. The star eater's splitters are
  //   bullets that split again, bounded by `b.generation` and resolved by
  //   flight or expiry. `S.bullets` is not consulted here.
  //
  // ---- THE GATE IS ONE TICK BEHIND, DELIBERATELY, AND IT IS PINNED --------
  // `step()` runs this function FIRST and the compaction filter runs at the end
  // of `updateEnemies`; production's own kills land later still, at `encStep`'s
  // reap slot through `flushDeaths`. So this reads the PREVIOUS tick's marks.
  // It is harmless because the gate reads MARKS (`dead`, `hp`) and not the
  // compaction — a body killed on tick N is `dead` on tick N and counted out on
  // tick N+1 — and the break that follows is 480 ticks long, so a one-tick lag
  // is not a quantity anybody can feel. Stated rather than left to be
  // rediscovered.
  // ---- D39: AND *WHICH* LIVE BODIES (the SEVENTH AMENDMENT, S4 fix 9) -----
  // *"Hostile BODIES block; ordnance, hazards, fields, cues and non-hostile
  // transit never block."* Owner-ruled 2026-08-26, option A. The paragraphs
  // above are what the gate said before the ruling and the ATTRITION clause is
  // where it bit: the gate admitted attrition as RESOLUTION, but only once the
  // body was gone. So a placed mine held the room for the rest of its own life
  // and a warden that had already fired and turned for the exit held it for up
  // to 4.5 s more — and in the demo-v4 lab one drifting mine held a four-seat
  // room open while a D17 joiner waited in the lobby. That is the ruling's own
  // example.
  //
  // THE ROLE IS THE REGISTRY'S, NOT THIS FILE'S (`js/engine.js`, KINDS.kernel
  // — `clearRole`, with a load-time throw for any body kind that omits it).
  // This function asks the question; the table answers it. A special-case array
  // here is the shape the ruling explicitly did not take.
  //
  // `untilAttack` READS AN EXISTING HASHED FIELD. The warden enters `escape` on
  // the same statement that fires its one heavy round, so the state IS the
  // record of the committed attack: no per-body flag, no new key, no re-keyed
  // record, nothing added to the serializer's allow-list. The row names the
  // state (`spentState`) so the gate never has to know a type by name.
  //
  // A KIND WITH NO ROW BLOCKS. That is not a default — `auditClearRoles` throws
  // at load for a body kind with no role, so the only way to reach this line
  // without a row is a body whose `type` is not a registry kind at all, and a
  // stranger on the field is exactly the thing a room should wait for.
  function blocksClear(e) {
    const row = Engine.KINDS.kernel[e.type];
    if (!row || !row.clearRole || row.clearRole === Engine.CLEAR_ROLE.BLOCKER) return true;
    if (row.clearRole === Engine.CLEAR_ROLE.NEVER) return false;
    return e.state !== row.spentState;   // untilAttack: transit once it has fired
  }
  // ...and the DAMAGE-EVENT COUNTER the stall signature's third term reads. See
  // `damageEnemy` for the rule; declared here because it belongs to the same
  // question this block answers.
  let blockerDamage = 0;
  // THE BLOCKING CENSUS. Still ONE derivation read by four callers — this
  // file's gate, production's `foeCount()`, `applyKernelHud`'s state map and
  // the wire's `hud.state` — so a placed mine is not a FOE on any surface and a
  // leaving warden is not a FOE on any surface either.
  function liveBodies() {
    let n = 0;
    for (let i = 0; i < S.enemies.length; i++) {
      const e = S.enemies[i];
      if (!e.dead && e.hp > 0 && blocksClear(e)) n++;
    }
    return n;
  }
  function pendingArrivals() {
    let n = S.schedule.length;
    for (let i = 0; i < S.entries.length; i++) if (!S.entries[i].spawned) n++;
    return n;
  }
  function roomClear() {
    return liveBodies() === 0 && pendingArrivals() === 0;
  }

  // ---- THE BREAK, AND WHY IT RIDES `S.gateTimer` --------------------------
  // The owner's ruling S-bpzbzy set a 10 s inter-wave break — `ECFG.clearHold`
  // 480 ticks — and it is carried here as a STANDING ruling: the room clears,
  // the shop opens, the bounty sweeps, and the next setpiece deals when the
  // hold runs out. Production's `clearHold` stays the dial its consumers read;
  // `CLEAR_HOLD` below is the same number in this file's units and a leg holds
  // the two equal, because two dials for one break is how they drift.
  //
  // THE FIELD IS `gateTimer` AND THE NAME IS NOT THIS LANE'S TO CHANGE.
  // `test/tools/demo-serial.js` hashes an ALLOW-LIST and THROWS on any own key
  // of `S` it has never heard of, and that file is on this run's do-not-touch
  // list — so a new `S.clearTimer` is a hard error and a rename is a serializer
  // version. `gateTimer` is already in the list, already reset by `resetRun`
  // and `startWave`, and its old meaning (the 2.15 s one-type dwell) retired
  // with the gate that owned it. It now means ONE thing: SECONDS LEFT BEFORE
  // THE NEXT DEAL, zero when no break is running.
  var CLEAR_HOLD = 8;   // seconds — 480 ticks, the owner's ruling S-bpzbzy

  // ---- D66's HELD DURATION, AND WHY IT IS NOT A FIELD OF `S` --------------
  // The serializer's census THROWS on any own key of the state it has never
  // heard of, and that file is not this lane's to touch, so an own key on the
  // state record would be a hard error on both bounded manifests. The LAZY
  // spelling — an own key created on first use with a `|| 0` — is the WORSE
  // half of that trap rather than an escape from it: the key does not exist
  // until the hold first
  // arms, so it passes every manifest today and throws on whichever run first
  // arms. A closure costs nothing, and `resetRun` clears it.
  var holdAccum = 0;

  function updateDirector(dt) {
    S.waveTime += dt;
    // ---- THE WIPE'S HOLD (D66 / OPEN 8) ----------------------------------
    // A room where SOMEBODY IS THERE and NOBODY IS ALIVE does not deal. The
    // predicate is two different questions and both halves are load-bearing:
    //
    //   PRESENCE is `presentRaw()`, the UNFLOORED count — never
    //   `presentCount()`, whose floor at one makes the test a tautology and
    //   collapses this into the bare living-pilot test D66 forbids. An
    //   UNCLAIMED room (every seat parked) has `presentRaw() === 0`, does not
    //   hold, and still gets its arc: D8/D14.
    //
    //   LIVENESS is the kernel's own mirror of production's `hull > 0`, written
    //   from the pose production pushes.
    //
    // IT ACCUMULATES ONLY WHILE A SCHEDULE IS PENDING, and that is a seat
    // amendment to the ruling's own sentence ("the tick's dt while held"). The
    // hold does not stop the rest of this function: with the field and the
    // schedule both empty the room reads CLEAR, the break runs, and
    // `startWave` stamps FRESH absolute dues off the still-running clock —
    // which would then take the whole pre-startWave accumulation on release, an
    // over-delay of eight seconds or more. Gating on a pending schedule costs
    // one token and is gate-neutral.
    //
    // AND THE RELEASE SHIFTS EVERY REMAINING `due`, NOT ONLY THE OVERDUE ONES.
    // `S.time` NEVER STOPS — it is the global clock and four other sites key on
    // it (the AUTO wander, the star-eater anchor, the round wiggle), so
    // freezing it would re-key all of them for the rest of the run. `due` is
    // ABSOLUTE, so the held duration is added back to the whole schedule:
    // shifting only the overdue rows would compress wave 1's stagger into a
    // single ambush the moment somebody respawns, which is the case this ruling
    // exists to prevent.
    const roster = seats();
    let living = 0;
    for (let i = 0; i < roster.length; i++) if (roster[i] && roster[i].alive) living++;
    if (presentRaw() > 0 && living === 0) {
      if (S.schedule.length > 0) holdAccum += dt;
    } else {
      if (holdAccum > 0) {
        for (let i = 0; i < S.schedule.length; i++) S.schedule[i].due += holdAccum;
        holdAccum = 0;
      }
      for (let i = S.schedule.length - 1; i >= 0; i--) {
        if (S.schedule[i].due <= S.time) {
          queueGroup(S.schedule[i]);
          S.schedule.splice(i, 1);
        }
      }
    }
    // THE BREAK RUNS FIRST, and it runs to completion: a room that cleared has
    // already been judged, so nothing re-judges it while the shop is open. The
    // deal lands on the tick the hold reaches zero.
    if (S.gateTimer > 0) {
      S.gateTimer -= dt;
      // ---- A FIXED-TICK-SAFE TERMINAL CONDITION (S4-CX-3, the fix round) ---
      // `<= 0` MISSED. The hold starts at the integer 8 and is decremented by
      // the binary float 1/60, which is not exact: after 480 decrements the
      // timer is still 2.3418766925686896e-14, so the deal landed on tick 481.
      // Production's countdown stops drawing when `waveTick - clearTick`
      // reaches `clearHold`, so that extra tick was a BLANK cleared frame — the
      // room sat saying nothing for one tick after the numeral had gone, and
      // the owner's 480 (S-bpzbzy) was 481 in the sim.
      //
      // THE DERIVATION: a remainder smaller than HALF A TICK is zero, because
      // no half tick exists. The bound is stated in the loop's own unit rather
      // than as a literal epsilon, so it holds at any step size. It cannot
      // fire early either — one tick before the end the remainder is a whole
      // dt, which is twice this bound — and it swallows a residue of any
      // plausible size (the measured one is 2e-14 against a bound of 8e-3).
      if (S.gateTimer <= dt * 0.5) {
        S.gateTimer = 0;
        advanceWave(false);
      }
      return;
    }
    // ...and otherwise the room is asked whether it is clear. NO CLOCK: there
    // is no other way out of a setpiece. A room that cannot clear stands still,
    // which is D21(a)'s hazard and is why the SURFACE (js/encounter.js's HUD
    // line) lands in this same commit rather than a commit later.
    if (roomClear()) S.gateTimer = CLEAR_HOLD;
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

  // ---- THE AUTO DRIVER'S TARGET POLICY, DECLARED (PORT-S S3a) --------------
  // This driver used to be the kernel's SECOND authority on "who is my target":
  // it scanned, scored and broke ties itself, with arithmetic that disagreed
  // with Engine.acquire's on every one of those three counts. S3a moves the
  // POLICY into the one authority and leaves nothing behind that computes.
  //
  // What was behaviour is now three declarations, and each one keeps its
  // original reason:
  //
  // THE METRIC IS THE KERNEL'S OWN `distSqAt`, injected — never the selector's
  // Euclidean default. The shipped topology is WRAPPING (WORLD_BOUNDED's
  // declaration literal is `false`), and in a toroidal world a straight-line
  // metric is not merely imprecise, it is wrong by up to half an arena: the
  // body two hundred pixels away across the seam reads as nearly a full world
  // away. Every other distance in this file is wrap-aware, so a driver that was
  // not would steer at one body while the feed pointed at another.
  //
  // THE PRIORITY IS THE SAME TABLE, in the same SQUARED units the tuned numbers
  // were chosen against — STATS[type].priority plus the invulnerable snapper's
  // penalty — and it is ADDED to the metric exactly as it always was.
  //
  // MINES ARE EXCLUDED OUTRIGHT, not merely deprioritized. STATS.mine's huge
  // priority makes a mine the LAST thing the driver wants; it does not make it
  // something the driver will not take, and cross-vendor review staged the
  // difference: when a live mine is the ONLY eligible body, the score
  // comparison has nothing to beat it and the driver acquires it, records its
  // id and steers at it. A ranking can always be won by default. An exclusion
  // cannot. That is why `exclude` is a field of its own on the policy record
  // rather than a very large priority.
  //
  // THIS IS TEST-DRIVER POLICY AND NOT D25, and the two must not be merged.
  // D25 rules what a WEAPON may acquire and deliberately ADMITS a promoted
  // CONSTRUCT — that ruling lives in Engine.ACQUIRE and is untouched here.
  // This driver is a stand-in for a human, and a human does not fly at
  // mines. Changing ACQUIRE.DEFAULT to express it would re-rule D25 by
  // side effect.
  //
  // AND THE MASK IS LEFT AT D25's DEFAULT ON PURPOSE. Every candidate below is
  // declared BODY today, so any mask that admits BODY picks the same set — but
  // the drone's promotion to CONSTRUCT is named R6 work still to come, and a
  // driver pinned to `CLASS.BODY` would drop drones off its board on the day
  // that lands, silently and with no gate objecting.
  const DRIVER_POLICY = {
    metric: distSqAt,
    priority: function (c) {
      const e = c.e;
      let priority = STATS[e.type].priority || 0;
      if (e.type === "snapper" && !e.vulnerable) priority += 12000;
      return priority;
    },
    exclude: function (c) { return c.e.type === "mine"; },
  };

  function nearestTarget(p) {
    // The candidate list is built the way production's nearestSeat builds its
    // own: a per-call wrapper carrying the four fields the authority reads plus
    // the record the caller wants back. Nothing is stamped on the enemy — the
    // serializer hashes every own key of a kernel record, so a `cls` field
    // written onto a body would be hashed state arriving as a side effect of a
    // refactor.
    const cand = [];
    for (let i = 0; i < S.enemies.length; i++) {
      const e = S.enemies[i];
      cand.push({
        cls: Engine.CLASS.BODY,
        live: !(e.dead || e.emerge > e.emergeMax * 0.25),
        x: e.x, y: e.y, e: e
      });
    }
    const hit = Engine.acquire(p.x, p.y, cand, DRIVER_POLICY);
    return hit === null ? null : hit.e;
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

  function playerMayFireAt(e, p) {
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
      const toPlayer = Math.atan2(delta(e.y, p.y, H), delta(e.x, p.x, W));
      if (e.shieldHeat >= 4 && Math.abs(angleDelta(e.angle, toPlayer)) < 1.18) return false;
    }
    if (e.type === "minelayer") {
      const toPlayer = Math.atan2(delta(e.y, p.y, H), delta(e.x, p.x, W));
      if (Math.abs(angleDelta(e.angle, toPlayer)) < 1.0) return false;
    }
    return true;
  }

  // ==== THE PER-SEAT LOOP, AND ITS ORDER IS A LAW ==========================
  // SEATS RUN IN ASCENDING ORDER — PINNED. Once the roster carries more than
  // one seat this order is HASH-VISIBLE, and it must never change.
  //
  // This is production's own law, in production's own words: js/game.js's
  // `drainTickInput` carries "Seats drain in ASCENDING order — PINNED. Once
  // fixtures carry more than one seat this order is hash-visible; it must never
  // change." The reason is the same here and it is sharper, because the kernel
  // has a shared FX stream that the seats DRAW FROM.
  //
  // WHY THE ORDER IS HASH-VISIBLE, CONCRETELY. `fxRand` rebuilds ONE generator
  // per (seed, wave, tick) and every draw inside a tick advances it for every
  // later draw in that tick. A seat's exhaust trail spends four draws
  // (`fxRange` x3 and `fxRand` x1, below); a seat that FIRES spends eight more
  // in `firePlayer`. So the number of seats that run this function, the order
  // they run in, and whether a DEAD one draws at all are all part of the
  // arithmetic — not of the presentation. At one seat none of it moves, which
  // is exactly why it had to be pinned BEFORE the first multi-seat capture: a
  // recapture cannot tell you the order was wrong, it can only bake it in.
  //
  // ---- THE DEAD-SEAT LAW --------------------------------------------------
  // A DYING SEAT DRAWS ITS DEATH FX ON THE DEATH TICK. A PARKED SEAT DRAWS
  // NOTHING AFTER IT. The death burst, the fragments and the shockwave all fire
  // once, from `damagePlayer`, on the tick the hull reaches zero; from the next
  // tick until the respawn the seat's branch below coasts its velocity and
  // spends NO draws at all. A parked seat that kept drawing would shift every
  // later seat's stream on every tick it stayed dead, which is a coupling
  // between one seat's misfortune and another seat's arithmetic.
  function updatePlayers(dt) {
    const list = seats();
    for (let s = 0; s < list.length; s++) updateSeat(list[s], s, dt);
  }

  function updateSeat(p, seat, dt) {
    setPrevious(p);
    p.pangle = p.angle;
    // ---- THE PUPPET SEAM (PORT-S S3b lane 3, commit A) --------------------
    // A POSE-DRIVEN SEAT'S FLIGHT IS PRODUCTION'S, and this is the whole of the
    // bypass. It sits AFTER setPrevious and the previous angle on purpose: the
    // px/py pair is what every interpolating reader lerps from, so a mirror
    // that skipped it would present a ship that teleports each tick. It sits
    // BEFORE everything else because everything else is flight — the timers the
    // integrator owns, the AUTO decision, the provider read, the avoidance
    // sweep, the velocity, the drag, the cap, the integrate, the wall bounce
    // and the trigger. Production runs all of it, one tick earlier, in
    // js/game.js's own step().
    //
    // WITH NO SEAT POSED THIS BRANCH IS NOT REACHED, and the bounded pair is
    // the proof rather than the claim: `posed` is empty at load and only a host
    // fills it.
    if (posed[seat]) { applyPose(p, posed[seat]); return; }
    p.invuln = Math.max(0, p.invuln - dt);
    p.flash = Math.max(0, p.flash - dt);
    p.fire -= dt;
    if (!p.alive) {
      // THE PARKED SEAT. Coasting only — no particle, no burst, no shockwave.
      // See the dead-seat law above; the silence here is the law.
      p.vx *= 0.97;
      p.vy *= 0.97;
      p.respawn -= dt;
      if (p.respawn <= 0) respawnPlayer(p);
      return;
    }

    const target = nearestTarget(p);
    p.target = target ? target.id : 0;
    // One provider call, one tick — never inside a loop, never twice. With a pilot
    // installed a null or malformed return becomes the EMPTY frame, which is HUMAN
    // semantics with nothing held; it never hands the tick back to the autopilot.
    //
    // ONE PROVIDER PER SEAT, since S3b lane 1 — and the site this note used to
    // sit on is the extension it named. S3a's shape was "setInput(fn) takes one
    // function, seat 0 flies it, every other seat flies AUTO", with the cost
    // recorded as "a per-seat contract would touch all eleven install sites".
    // It did not: setInput's ONE-ARGUMENT form still means seat 0 exactly, so
    // all eleven sites are untouched, and the second form is additive.
    //
    // An ABSENT entry is AUTO. That is what keeps the flight byte-identical
    // wherever nobody has installed anything, which is every gate surface in
    // this tree today.
    let input = null;
    const seatPilot = pilots[seat];
    if (seatPilot) {
      const f = seatPilot();
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
      : (target && playerMayFireAt(target, p) && p.fire <= 0 && Math.abs(angleDelta(p.angle, aimAngle)) < 0.32 && targetDistance < Math.max(PLAY_W, PLAY_H) * 0.7)) {
      firePlayer(p, seat);
      // ---- THE COOLDOWN IS A CONSTANT NOW (S3b lane 2, commit B) ----------
      // It was `Math.max(0.075, 0.13 - (S.level - 1) * 0.003)` — the ONE place
      // in this kernel where a stat derived from the XP ladder. The ladder is
      // retired, so the derivation goes with it and what is left is the base
      // the ladder started from: 0.13 s, which is what every run flew before
      // its first level-up and what the demo's own reference flew for its
      // opening seconds.
      //
      // THE FLOOR GOES TOO, and it goes because it is now unreachable rather
      // than because anybody chose to drop it: `Math.max(0.075, 0.13)` is 0.13,
      // so a clamp with nothing below it is a clamp with nothing to say. It was
      // reached at level 19.
      //
      // STAT POWER COMES FROM THE SHOP, and it arrives at lane 3 — production's
      // `termsFor(seat)` is the one derivation, it already carries a fire-rate
      // row, and it reads a per-seat rank vector this kernel does not own yet.
      // A pilot in this kernel therefore fires at the base rate for the whole
      // run today, which is a REDUCTION IN POWER over a long one and is meant
      // to be: the ladder that used to supply it is the thing being deleted.
      p.fire = 0.13;
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

  // THE FIRING SEAT RIDES THE ROUND (S3b lane 2, commit A). A player bolt is
  // the only thing in this kernel that can damage a body at a distance, so it is
  // the only place the crediting seat can come from — production carries the
  // same value under the same reasoning (`resolveBulletHits`' `shooter`). The
  // key is on the record, so it is hashed, and it is written for EVERY player
  // round rather than conditionally, for spawnEnemy's reason.
  function firePlayer(p, seat) {
    if (WORLD_BOUNDED) {
      const alternating = S.tick & 1 ? 1 : -1;
      const sideX = -Math.sin(p.angle) * alternating * 4.2;
      const sideY = Math.cos(p.angle) * alternating * 4.2;
      const speed = 650;
      const x = clamp(p.x + Math.cos(p.angle) * 14 + sideX, 0, ARENA_W);
      const y = clamp(p.y + Math.sin(p.angle) * 14 + sideY, 0, ARENA_H);
      S.bullets.push({
        id: nextId++, team: "player", kind: "bolt", seat: seat, x: x, y: y, px: x, py: y,
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
    const alternating = S.tick & 1 ? 1 : -1;
    const sideX = -Math.sin(p.angle) * alternating * 4.2;
    const sideY = Math.cos(p.angle) * alternating * 4.2;
    const speed = 650;
    const x = wrap(p.x + Math.cos(p.angle) * 14 + sideX, W);
    const y = wrap(p.y + Math.sin(p.angle) * 14 + sideY, H);
    S.bullets.push({
      id: nextId++, team: "player", kind: "bolt", seat: seat, x: x, y: y, px: x, py: y,
      vx: Math.cos(p.angle) * speed + p.vx * 0.22,
      vy: Math.sin(p.angle) * speed + p.vy * 0.22,
      r: 2.2, life: 1.05, damage: 2, color: alternating > 0 ? "cyan" : "ink", dead: false
    });
    for (let i = 0; i < 2; i++) {
      particle(x, y, -Math.cos(p.angle) * fxRange(15, 60), -Math.sin(p.angle) * fxRange(15, 60),
        alternating > 0 ? "cyan" : "ink", fxRange(0.08, 0.17), fxRange(0.7, 1.4), "spark");
    }
  }

  function respawnPlayer(p) {
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

  // THE DAMAGED SEAT ARRIVES AS AN ARGUMENT (PORT-S S3a commit D), and it is
  // the FIRST one because that is where production's `hitPlayer(seat, dmg, src)`
  // puts it. It is the seat RECORD rather than an index, because a record is
  // what every one of the ten call sites already holds — each of them got it
  // from `targetOf`, from `pilotAt`, or from an ascending walk of the roster —
  // and an index would mean a lookup at each site to undo one here. S3b converts
  // to production's index at the seam, which is the seam's job.
  //
  // THE RESPAWN CLOCK IS PER SEAT, and it landed WITH the seat array because
  // it is state the serializer sees — a fixture event, and the round has one.
  // `S.shake` stays a single number on purpose: a screen shake is a fact about
  // the room's camera, not about a seat, and four seats do not shake four
  // screens.
  // ---- THE FIVE SOURCE RECORDS, R5's G1 SHAPE (S3b lane 3, commit A) ------
  // `{ kind, cls }` — production's `hitPlayer(seat, dmg, src)` vocabulary, and
  // the two fields it actually reads. They are MODULE CONSTANTS rather than
  // literals at each site so that the classification is a table a reader can
  // check against the ten sites, which is what the fourth wrong telegraph gate
  // taught this kernel about lists written from reading.
  //
  // WHY A KIND AT ALL, when this file's own damage leg has never had one. It
  // does not need one: `Engine.applyEffect`'s `hit` is UNCLASSIFIED here on
  // purpose and stays so. The kind exists for the POSE ROUTE, where production
  // decides — its comet refusal is SOURCE-scoped (`Engine.isContact`, D26/D28:
  // a comet is hurt by exactly what it cannot destroy) and its matrix keys on
  // the kind beside the class. Handing production an unclassified event would
  // let a lance pulse be refused on a burning pilot, which is the precise case
  // D26 exists to stop refusing.
  //
  // NOTHING LOCAL READS THEM. On a seat this kernel still flies, the argument
  // is accepted and dropped, so the classification is behaviour-free here and
  // the bounded pair proves it.
  var SRC_RAM = { kind: "ram", cls: Engine.CLASS.BODY };      // body contact, and the star eater's tail segments
  var SRC_BEAM = { kind: "beam", cls: Engine.CLASS.BODY };    // the lance pulse, the omega's six rays, the star eater's beam
  var SRC_SHOT = { kind: "shot", cls: Engine.CLASS.ORDNANCE };// an enemy round on impact
  var SRC_BLAST = { kind: "blast", cls: Engine.CLASS.BODY };  // a body's own detonation
  var SRC_MINE = { kind: "blast", cls: Engine.CLASS.CONSTRUCT }; // ...and the mine's, which is a placed CONSTRUCT

  function damagePlayer(p, amount, x, y, src) {
    if (!p.alive || p.invuln > 0) return false;
    // ---- A POSE-DRIVEN SEAT'S HULL IS PRODUCTION'S (commit A) -------------
    // The pose seam mirrors production's hull INTO this kernel so bodies see an
    // honest target; the mirror runs one way, so a subtraction here would be a
    // write production overwrites on the next tick — damage that lands and then
    // un-lands. The damage goes back out instead, through the sink, and
    // js/encounter-host.js turns it into the ONE call production already has:
    // `hitPlayer(seat, dmg, src)`. NEVER A SECOND DOOR — production's three
    // gates (a dead seat, the comet refusal, the i-frames), its matrix
    // consultation and its death toll are the same ones every production damage
    // path walks, and this route reaches them by the same function.
    //
    // PRODUCTION GETS THE LAST WORD, exactly as the credit route's fix 4 ruled
    // for a payment: the sink returns what `hitPlayer` returned, and a refusal
    // there is a refusal here — no flash, no shake, no burst. A caller that
    // reads the boolean (the contact branches do, to arm their own cooldown)
    // therefore reads production's answer and not this file's guess at it.
    //
    // AND NO LOCAL I-FRAME IS ARMED. Production's `S.invuln` is the one clock;
    // this record's `invuln` is a MIRROR of it, refreshed by the next pose. A
    // second clock here could only disagree with the one the wire carries.
    var pseat = seatOf(p);
    if (pseat >= 0 && posed[pseat]) {
      if (!sink.hurt(pseat, amount, src)) return false;
      S.shake = Math.max(S.shake, Math.min(7, amount * 0.27));
      burst(x == null ? p.x : x, y == null ? p.y : y, "red", 9, 95);
      emitShockwave(p.x, p.y, "red", 5, 32, 0.32);
      sink.state();
      return true;
    }
    // The kernel's ship leg of the funnel. Both gates above are untouched,
    // exactly as production's hitPlayer keeps its own.
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
      p.respawn = 1.8;
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
      // THE BODY'S TARGET, resolved ONCE, here, for the length of this
      // dispatch — the injection point the whole seat plane hangs off. The feed
      // below and every direct read inside the dispatch chain now see the same
      // pilot by construction, which is the defect the map named: a body that
      // steers at one seat and shoots at another is invisible at one seat, so
      // the arrangement has to make it impossible rather than merely unlikely.
      //
      // The chase is measured from the BODY's position, so `pilotSeatAt(e.x,
      // e.y)` is D18 asked in the body's own terms: the seat nearest to ME.
      //
      // ...AND IT IS NOW LATCHED (S3b lane 2, commit A). The pick used to be
      // pure geometry taken fresh every tick. It goes through
      // `retargetAtDecision` now, which holds a committed target for its window
      // and prefers the seat that last damaged this body — production's rule,
      // reproduced at the site the whole seat plane hangs off, so the grievance
      // and the geometry cannot answer separately. The commitment clock is
      // decremented FIRST, on this body's own tick, exactly as
      // js/encounter.js:1753 does it.
      bodyOwner = e;
      if (e.aggroT > 0) e.aggroT--;
      // THE ONE DECISION POINT, and it is a body SHOWING NOTHING — production's
      // `if (e.mode === "seek")` ported through the renderer's own telegraph
      // predicate. A body mid-tell takes no decision at all, so its grievance
      // SURVIVES to its next quiet tick exactly as production's does, and its
      // drawn line cannot bend.
      // ...AND A BODY THAT HAS NEVER CHOSEN ALWAYS DECIDES, whatever it is
      // showing. Found by running this: a body can reach a telegraph state
      // before its first decision — it spawns with `tgtSeat: -1` — and a gate
      // that refused it left `bodyTarget` null, which the very next line
      // dereferences. The guard is not a special case, it is the rule stated
      // exactly: a body with NO target has no line to bend, because it never
      // showed one at anybody. The same clause covers a latched seat that is no
      // longer an index into the roster, which a shrinking room can produce.
      // ---- A DEPARTED TARGET IS DECLARED, NOT SILENT ---------------------
      // A latched seat that is no longer an index into the roster is a line
      // aimed at somebody who has left the room. Round 3 measured that this
      // clause lets a Warden bend its drawn charge when the roster shrinks
      // under it, and that is TRUE and it is the only available answer: the
      // line's subject is gone, so keeping the line would aim it at nothing and
      // resolving it would read past the end of the array. The body chooses
      // again. THE ALTERNATIVE IS TO ABORT THE ATTACK, and that is a behaviour
      // ruling nobody has made. Nothing in this tree shrinks S.players today.
      if (e.tgtSeat < 0 || e.tgtSeat >= seats().length || !committedToALine(e)) {
        retargetAtDecision(e);
      }
      bodyTarget = e.tgtSeat >= 0 ? seats()[e.tgtSeat] : null;
      const p = bodyTarget;
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
      bodyGen = null;    // the slice is over — see the guard on bodyRand
      bodyOwner = null;  // ...and on targetOf
      bodyTarget = null;

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
        const contactD = e.r + hullRadius(p, 8);
        if (distSq(e, p) < contactD * contactD) {
          let amount = st.contact || (e.type === "hive" ? 13 : 6);
          if (e.type === "hammerhead" && e.state === "dash") amount = 24;
          if (e.type === "snapper" && e.state !== "lunge") amount = 5;
          if (damagePlayer(p, amount, p.x, p.y, SRC_RAM)) {
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
          if (distSq(segments[si], p) < 46 * 46 && damagePlayer(p, 15, p.x, p.y, SRC_RAM)) {
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
        // AIMED: the lance angle was taken from a lead on this body's target,
        // so the seat it can hit is that same target and no other.
        const lanced = targetOf(e);
        if (lanceHitsPlayer(e, lanced, e.lanceAngle, 132, 10)) damagePlayer(lanced, 7, lanced.x, lanced.y, SRC_BEAM);
      }
      if (before > 0 && e.lance <= 0) e.cooldown = bodyRange(1.15, 1.7);
    } else if (e.cooldown <= 0 && d < 158) {
      const lead = leadTarget(e, targetOf(e), 900);
      e.lanceAngle = Math.atan2(lead.y, lead.x);
      e.lance = 0.44;
      e.lanceHit = false;
    }
  }

  function lanceHitsPlayer(e, t, angle, length, width) {
    const px = delta(e.x, t.x, W);
    const py = delta(e.y, t.y, H);
    const along = px * Math.cos(angle) + py * Math.sin(angle);
    const across = Math.abs(-px * Math.sin(angle) + py * Math.cos(angle));
    return along > 0 && along < length && across < width + hullRadius(t, 7);
  }

  function updateWarden(e, dx, dy, d, st, dt) {
    if (e.state === "charge") {
      e.timer -= dt;
      e.vx *= Math.pow(0.9, dt * 60);
      e.vy *= Math.pow(0.9, dt * 60);
      const lead = leadTarget(e, targetOf(e), 260);
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
      const lead = leadTarget(e, targetOf(e), 250);
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
      // AIMED: the dash lane is aimed where this body's target is GOING, so
      // the velocity it leads on is that target's — dx/dy already are.
      const t = clamp(d / 485, 0.15, 0.7);
      const lead = targetOf(e);
      const tx = dx + lead.vx * t;
      const ty = dy + lead.vy * t;
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
      const lead = leadTarget(e, targetOf(e), 130);
      const orb = spawnEnemyBullet(e, Math.atan2(lead.y, lead.x), "plasma");
      if (orb) {
        e.comboBullet = orb.id;
        e.state = "combo";
        e.timer = 0.72;
      }
    }
  }

  function updateMinelayer(e, dx, dy, d, st, dt) {
    // AIMED: the layer crosses the route of the pilot it is chasing, so the
    // velocity it extrapolates is that same pilot's — dx/dy already are.
    const ahead = targetOf(e);
    const aheadX = dx + ahead.vx * 0.7;
    const aheadY = dy + ahead.vy * 0.7;
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
        const lead = leadTarget(e, targetOf(e), 465);
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
      const lead = leadTarget(e, targetOf(e), 465);
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
      // AIMED, in the negative: the cherub shelters on the far side of its
      // ally FROM the pilot it is avoiding — the same pilot the rest of its
      // tick is measured against, so the retreat and the chase cannot point at
      // two different seats.
      const from = targetOf(e);
      const away = norm(delta(from.x, ally.x, W), delta(from.y, ally.y, H));
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
      const lead = leadTarget(e, targetOf(e), 280);
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
        const lead = leadTarget(e, targetOf(e), 680);
        e.chargeAngle = Math.atan2(lead.y, lead.x);
      }
    } else if (e.state === "lanceCharge") {
      if (e.timer > 0.45) {
        const lead = leadTarget(e, targetOf(e), 680);
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
    // AREA, not aimed. These six rays SWEEP: `e.angle` turns on the station's
    // own clock and is pointed at nobody, so a ray is a moving volume and
    // everything living inside one is in it. Every living seat is tested, in
    // ASCENDING SEAT ORDER — blastAt's precedent (js/encounter.js) — and the
    // per-seat ray order is unchanged, so at one seat this is the same six
    // tests in the same sequence.
    const list = seats();
    for (let s = 0; s < list.length; s++) {
      const t = list[s];
      if (!t.alive) continue;
      const px = delta(e.x, t.x, W);
      const py = delta(e.y, t.y, H);
      if (rayHitsPoint(px, py, e.angle, Math.max(PLAY_W, PLAY_H), 9, t)) damagePlayer(t, 9, t.x, t.y, SRC_BEAM);
      for (let i = 0; i < 5; i++) {
        const a = e.angle + i * TAU / 5;
        const nx = Math.cos(a) * e.r * 0.48;
        const ny = Math.sin(a) * e.r * 0.48;
        if (rayHitsPoint(px - nx, py - ny, a, Math.max(PLAY_W, PLAY_H), 7, t)) damagePlayer(t, 6, t.x, t.y, SRC_BEAM);
      }
    }
  }

  // `victim` is the SEAT RECORD the ray is being tested against, and it is an
  // argument rather than a lookup for the reason the pose seam gives at
  // `pushSeatFrame`: the hull radius is the victim's, and every caller already
  // holds the victim. Both of them pass it.
  function rayHitsPoint(px, py, angle, length, width, victim) {
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const along = px * ca + py * sa;
    const across = Math.abs(-px * sa + py * ca);
    return along > 0 && along < length && across < width + hullRadius(victim, 7);
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
      const lead = leadTarget(e, targetOf(e), 900);
      e.dashAngle = rotateToward(e.dashAngle, Math.atan2(lead.y, lead.x), dt * 0.55);
      e.angle = rotateToward(e.angle, e.dashAngle, dt * 1.2);
      if (e.timer <= 0) { e.state = "beam"; e.timer = 2.65; }
    } else if (e.state === "beam") {
      // AIMED: beamTell converged dashAngle on a lead against this body's
      // target, and dx/dy is the vector to that same target — so the beam can
      // only reach the seat it was pointed at.
      if (rayHitsPoint(dx, dy, e.dashAngle, Math.max(PLAY_W, PLAY_H) * 1.2, e.enraged ? 22 : 17, targetOf(e))) {
        const beamed = targetOf(e);
        damagePlayer(beamed, 18, beamed.x, beamed.y, SRC_BEAM);
      }
      if (e.timer <= 0) setStarAttack(e, 2);
    } else if (e.state === "lungeTell") {
      const lead = leadTarget(e, targetOf(e), 520);
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
          const lead = leadTarget(e, targetOf(e), 520);
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
      const lead = leadTarget(e, targetOf(e), 900);
      e.dashAngle = Math.atan2(lead.y, lead.x);
    } else if (index === 2) {
      e.state = "lungeTell"; e.timer = 0.8; e.lungeCount = 0;
      const lead = leadTarget(e, targetOf(e), 520);
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
    // AIMED: the ring closes on ONE pilot — the star eater's own target — and
    // encircling everybody at once is not what the attack is. It is a ring
    // around a seat, not a field effect.
    const ringed = targetOf(e);
    const count = e.enraged ? 13 : 10;
    const radius = Math.min(PLAY_W, PLAY_H) * 0.34;
    for (let i = 0; i < count; i++) {
      const a = i * TAU / count + e.phase * 0.1;
      if (WORLD_BOUNDED) {
        const fake = { id: e.id, x: clamp(ringed.x + Math.cos(a) * radius, 0, ARENA_W), y: clamp(ringed.y + Math.sin(a) * radius, 0, ARENA_H), vx: 0, vy: 0, r: 0, orbit: e.orbit };
        spawnEnemyBullet(fake, a + Math.PI, "asteroid");
      } else {
        const fake = { id: e.id, x: wrap(ringed.x + Math.cos(a) * radius, W), y: wrap(ringed.y + Math.sin(a) * radius, H), vx: 0, vy: 0, r: 0, orbit: e.orbit };
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

  // ---- THE CHILD QUEUE (PORT-S S5, commit D) --------------------------------
  // Every split, fan and death drop in this kernel is materialized INLINE —
  // five birth sites in two functions (`explodeEnemyBullet`'s cluster, serpent
  // fan and splitter, and `killEnemy`'s minelayer drop and mine shards). That
  // is correct and stays correct for every death this kernel already had.
  //
  // D26'S AURA IS THE ONE DEATH THAT MAY NOT DO IT, and the reason is the
  // mineShard birth-tick trap that `resolveBulletHits`' own snapshot comment
  // already spells out. A child born INSIDE the aura walk has `px === x`, so
  // every swept test in the tick degrades to a point test at a position it is
  // not going to; and it would be born already standing in the halo that just
  // killed its parent, so it would be eaten on its birth tick by the same pass.
  //
  // SO THE AURA'S OWN CHILDREN ARE STAGED and materialized AFTER production's
  // combat window — `js/encounter.js` calls `EncounterHost.flushKernelChildren`
  // immediately after `reapRamClaims()`, which is where the tick's outgoing
  // rams, rebates, rounds, wall blasts and death flush have all finished. They
  // land with equal previous and current positions and become eligible for
  // anything on the FOLLOWING tick.
  //
  // NOTHING ELSE IS INTERCEPTED. `childStaging` is raised only around the aura's
  // own kill path, so every other birth in this kernel pushes straight through
  // and the no-comet path is byte-identical.
  var childStaging = false;
  var childRounds = [];
  var childBodies = [];

  function pushEnemyRound(bullet) {
    if (childStaging) { childRounds.push(bullet); return bullet; }
    S.bullets.push(bullet);
    return bullet;
  }

  function pushEnemyBody(e) {
    if (childStaging) { childBodies.push(e); return e; }
    S.enemies.push(e);
    return e;
  }

  // The flush. Idempotent and total: it empties both queues or it does nothing,
  // and it re-stamps `px`/`py` from the record's own position so a staged child
  // enters the world standing still rather than carrying a segment from before
  // it existed.
  function flushChildren() {
    var n = childRounds.length + childBodies.length;
    if (!n) return 0;
    for (var i = 0; i < childRounds.length; i++) {
      var b = childRounds[i];
      b.px = b.x; b.py = b.y;
      S.bullets.push(b);
    }
    for (var j = 0; j < childBodies.length; j++) {
      var e = childBodies[j];
      e.px = e.x; e.py = e.y;
      S.enemies.push(e);
    }
    childRounds.length = 0;
    childBodies.length = 0;
    return n;
  }

  function pendingChildren() { return childRounds.length + childBodies.length; }

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
    // THE COUNT INCLUDES THE STAGED QUEUE (S5 FIX ROUND, Codex CX-4). The cap
    // js/engine.js declares is a TRUE LIVE-POPULATION ceiling, and a staged
    // child is a round that is going to be in the world before this tick's
    // combat window closes — `flushChildren` appends every one of them without
    // a second test. Counting only `S.bullets.length` let one aura death carry
    // the board over: 279 rounds, an aura-killed hammerhead chains a mine,
    // eight shards queue, and the flush lands 287.
    //
    // IT IS TESTED AT ADMISSION AND NEVER AT THE FLUSH, deliberately. The
    // denial has to bill its cue and draw neither an id nor a shape substream,
    // which is what this call site already guarantees; a flush-side test would
    // be a second, quieter denial with none of that. Off the aura path
    // `childRounds` is empty, so the added term is a provable no-op and every
    // shipped surface keeps its byte-identical spawn.
    const decision = Engine.capAdmit(ROUND_KINDS[kind] || ROUND_KINDS.heavy,
                                     S.bullets.length + childRounds.length);
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
                // bought the tier its whole cost argument: no runtime in the
                // collision pass, no death event on the wire, no cap interaction.
                // D61 (PORT-P) SPENT MOST OF IT. broadside, flame, retaliation,
                // arc and omegaSide are hp 2 now, so the tier is `kineticLance`
                // and `lightning` and nothing else, and the saving that argument
                // bought is small. The sixteen destructible kinds and D27's
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
      r = 4.5; life = 2.35; damage = 8; color = "magenta"; homing = 1.2; hp = 2;
    } else if (kind === "plasma") {
      speed = 102; r = 10; life = 3.2; damage = 10; color = "green"; hp = 4;
    } else if (kind === "flame") {
      speed = 305; r = 4.5; life = 2.35; damage = 7; color = "orange"; wiggle = 0.45; hp = 2;
    } else if (kind === "grenade") {
      speed = 68; maxSpeed = 265; acceleration = 175; homing = 1.1;
      r = 9; life = 3.1; damage = 12; color = "blue"; homingDelay = 0.32; hp = 4;
    } else if (kind === "rocket") {
      speed = 115; maxSpeed = 335; acceleration = 250; homing = 0.82;
      r = 5; life = 2.8; damage = 9; color = "violet"; homingDelay = 0.18; hp = 2;
    } else if (kind === "retaliation") {
      speed = 285; r = 4.5; life = 2.5; damage = 8; color = "orange"; hp = 2;
    } else if (kind === "arc") {
      speed = 225; r = 4; life = 3; damage = 7; color = "orange"; curve = (e.orbit || 1) * 0.18; hp = 2;
    } else if (kind === "spitOrb") {
      speed = 108; r = 13; life = 2.4; damage = 12; color = "orange"; specialTimer = 1.45; hp = 6;
    } else if (kind === "serpentFire") {
      speed = 155; r = 6.5; life = 4.1; damage = 10; color = "red"; wiggle = 1.45; hp = 2;
    } else if (kind === "kineticLance") {
      speed = 720; r = 10; life = 1.45; damage = 24; color = "gold";
    } else if (kind === "omegaSphere") {
      speed = 148; r = 11; life = 3.4; damage = 12; color = "cyan"; hp = 6;
    } else if (kind === "omegaSide") {
      speed = 325; r = 3.6; life = 2.6; damage = 6; color = "cyan"; hp = 2;
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
      pushEnemyRound(bullet);
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
    pushEnemyRound(bullet);
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
        // AIMED, and the aimer is the ROUND rather than a body: a seeker in
        // flight has left whoever fired it, so it asks D18 from its OWN
        // position and re-asks every tick. `targetOf` is not available here
        // and must not be — updateBullets is a phase of its own and there is
        // no body slice to be inside.
        //
        // The mask on PILOT_POLICY is SHIP, which is also D25's own rule for
        // what homing may take. The two agree by construction rather than by
        // two lists that have to be kept the same.
        const seek = b.homing && b.homingDelay <= 0 ? pilotAt(b.x, b.y) : null;
        if (seek && seek.alive) {
          if (b.acceleration) {
            b.speed = Math.min(b.maxSpeed, b.speed + b.acceleration * dt);
          }
          const desired = Math.atan2(delta(b.y, seek.y, H), delta(b.x, seek.x, W));
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
    // ---- THE SEAM (PORT-S S5, commit D) --------------------------------
    // D26's law, and the ONE line that enforces it: the aura runs here, with
    // every endpoint settled and before the pass that lets enemy ordnance reach
    // a hull. See `resolveCometAura`'s own block.
    resolveCometAura();
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
          // OPEN 6 (PORT-P) — THE CHILD DECAYS 6 -> 4 -> 2. A generation-2
          // parent bears generation-1 children at hp 4 and generation-0
          // grandchildren at hp 2, so the chain gets cheaper to answer at every
          // step. The ternary is deliberate: an `hp - 2` spelling would read the
          // parent's POST-KILL hp, which is 0 on an exact kill and negative on an
          // overkill (js/abilities.js ships a dmg-5 round through this door).
          child.hp = child.generation > 0 ? 4 : 2;
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

  // ---- D26'S AURA PASS (PORT-S S5, commit D) --------------------------------
  // THE SEAM IS ONE LINE, and js/engine.js's `AURA_PASS_SLOT` is the law it
  // obeys: *"phase 9/10, BEFORE the ordnance-vs-player pass"*. So the call sits
  // inside `updateBullets`, after its advance loop and before
  // `resolveBulletHits()` — every player, body and round endpoint for this tick
  // is settled, and the pass that lets enemy ordnance reach a hull has not run.
  // `resolveBulletHits` is called WHOLE and UNCHANGED after it; that single
  // ordering is what satisfies D26, and splitting the function to "only the
  // ordnance-vs-player half" would buy nothing and cost the ordering proof.
  //
  // ---- THE MATRIX DECIDES, NEVER A TYPE PRE-FILTER -------------------------
  // Each target's class comes from `Engine.targetClassOf(kind)` — the ROW, not
  // the array it was walking — and `Engine.applyEffect` consults
  // `aura[AURA][class]`. So: BODY 1, ORDNANCE 1, SHIP 0 (declared OFF and
  // PENDING), ORB and CONSTRUCT undeclared and therefore OFF. That last one is
  // the mine, and it is why it is untouched: a placed CONSTRUCT is not a body
  // this pass may eat, and nothing here says the word "mine".
  //
  // ---- THE SWEEP IS RELATIVE, AND POINT SAMPLING IS REJECTED --------------
  // Both endpoints move. An attacker-only sweep — this file's own
  // `segmentCircleWrapped`, which walks the ATTACKER's segment against the
  // target's CURRENT point — misses outright once both parties are fast, which
  // is the measured lesson `resolveCometBodyRams` carries in production. A
  // point test at either endpoint tunnels: a 720 px/s kinetic lance crosses a
  // 67.5 px halo in a fifth of a tick.
  //
  // ---- THE TWO COMPACTIONS ARE ASYMMETRIC, AND THEY STAY SO ---------------
  // `S.enemies` is flushed at the END of `updateEnemies`, BEFORE this seam;
  // `S.bullets` is flushed after `resolveBulletHits`, AFTER it. So an aura
  // BODY kill is marked `dead` synchronously, every later pass this tick skips
  // it by that flag, and the corpse leaves the array next tick — while an aura
  // ORDNANCE kill leaves this tick. Both are the shipped behaviour of their own
  // store and neither is changed here.
  //
  // ---- THE SNAPSHOTS ARE COPIED, AND NEITHER LIVE ARRAY IS REORDERED -------
  // `resolveBulletHits`' hoisted-list discipline, verbatim: filter OUTSIDE the
  // loops, once, and walk the copy. The body filter carries the EMERGE GATE the
  // shipped body sweep uses (`e.emerge > e.emergeMax * 0.25`), because an aura
  // that ate a body mid-spawn-animation would reach what a player round cannot.
  function sweptPairHit(a, b, radius) {
    // the RELATIVE frame: the segment is (a - b) from the PREVIOUS pair to the
    // CURRENT pair, and the question is whether it passes within `radius` of
    // the origin.
    const sx = delta(b.px, a.px, W);
    const sy = delta(b.py, a.py, H);
    const ex = delta(b.x, a.x, W);
    const ey = delta(b.y, a.y, H);
    const dx = ex - sx;
    const dy = ey - sy;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? clamp(-(sx * dx + sy * dy) / len2, 0, 1) : 0;
    const qx = sx + dx * t;
    const qy = sy + dy * t;
    return qx * qx + qy * qy <= radius * radius;
  }

  // THE DAMAGE IS PRODUCTION'S DIAL, pushed once per tick like D38's build
  // total and for the same reason: `COMETAURA` is a production tunable and this
  // kernel reads no production surface. Zero means the pass deals nothing,
  // which is what every surface that never pushes it gets.
  var auraDamage = 0;
  function setAuraDamage(n) {
    auraDamage = Number.isFinite(n) && n > 0 ? n : 0;
    return auraDamage;
  }

  // D67'S FOUR ORB DIALS. Same seam as `auraDamage`, one difference that
  // matters: these default to the SHIPPED numbers, not to zero, because every
  // surface that never pushes them (the Node replay, the bounded harness,
  // demo-play) must keep flying today's orb — so they move WITH js/game.js's
  // own `let ORBLIFE` / `ORBMAGNET` / `ORBRING`, never alone: production's
  // pushOrbDials() writes those over these on EVERY tick, so a kernel-only
  // edit is INERT in play. (DE-NUMBERED at FIX 1, standing rule 15: this line
  // carried their LINE NUMBERS, and the same commit's prose edits above them
  // grew the file by 19 lines, so the cite went stale inside the commit that
  // wrote it. The SYMBOL is the pin.) A life of 0 is not a quiet dial, it is every
  // orb dead on its spawn tick — so a non-finite push is REFUSED and the
  // current value stands, rather than being coerced to 0.
  var ORBLIFE = 30;
  var ORBMAGNET = 420;
  var ORBRING = 25;
  var ORBPULL = 720;
  function setOrbLife(n) {
    ORBLIFE = Number.isFinite(n) && n > 0 ? n : ORBLIFE;
    return ORBLIFE;
  }
  function setOrbMagnet(n) {
    ORBMAGNET = Number.isFinite(n) && n >= 0 ? n : ORBMAGNET;
    return ORBMAGNET;
  }
  function setOrbRing(n) {
    ORBRING = Number.isFinite(n) && n > 0 ? n : ORBRING;
    return ORBRING;
  }
  function setOrbPull(n) {
    ORBPULL = Number.isFinite(n) && n >= 0 ? n : ORBPULL;
    return ORBPULL;
  }
  function orbDials() {
    return { life: ORBLIFE, magnet: ORBMAGNET, ring: ORBRING, pull: ORBPULL };
  }

  function auraBite(burner, target, cls) {
    if (cls === undefined) return false;          // an undeclared kind is not eaten
    if (target.dead || !(target.hp > 0)) return false;
    const dealt = Engine.applyEffect({
      kind: "aura", target: target, tgtCls: cls,
      // THE AREA SOURCE SHAPE js/engine.js already declares — `{ cls, seat, x,
      // y, r }` — named there as "the comet's AURA". The seat is always
      // supplied, so `statSource` and `credit` default from it and the kill
      // pays the pilot who burned it down.
      source: { cls: Engine.CLASS.AURA, seat: burner.seat,
                x: burner.p.x, y: burner.p.y, r: burner.r },
      baseAmount: auraDamage
    });
    return dealt !== null;
  }

  function resolveCometAura() {
    if (!(auraDamage > 0)) return;
    // THE CHEAP GATE FIRST. No posed burning seat means no snapshot, no walk
    // and no allocation — which is what makes every surface with no comet
    // byte-identical rather than merely equal.
    const hulls = seats();
    let burners = null;
    for (let s = 0; s < hulls.length; s++) {
      const p = hulls[s];
      if (!p || !p.alive) continue;
      const ar = auraRadius(p, 0);
      if (!(ar > 0)) continue;
      (burners || (burners = [])).push({ p: p, seat: s, r: ar });
    }
    if (!burners) return;

    const bodies = [];
    for (let i = 0; i < S.enemies.length; i++) {
      const e = S.enemies[i];
      if (e.dead || !(e.hp > 0)) continue;
      if (e.emerge > e.emergeMax * 0.25) continue;
      bodies.push(e);
    }
    const rounds = [];
    for (let i = 0; i < S.bullets.length; i++) {
      const o = S.bullets[i];
      if (!o.dead && o.team === "enemy" && o.hp > 0) rounds.push(o);
    }
    if (!bodies.length && !rounds.length) return;

    // THE AURA'S OWN CHILDREN ARE STAGED FROM HERE TO THE END OF THE WALK.
    // `killEnemy` and `explodeEnemyBullet` run inside `Engine.applyEffect`'s
    // downstream, so the flag has to cover the whole walk rather than one call.
    childStaging = true;
    for (let k = 0; k < burners.length; k++) {
      const B = burners[k];
      for (let i = 0; i < bodies.length; i++) {
        const e = bodies[i];
        if (e.dead || !(e.hp > 0)) continue;
        if (!sweptPairHit(B.p, e, B.r + (e.r || 0))) continue;
        if (auraBite(B, e, Engine.targetClassOf(e.type)) && e.hp <= 0) damageEnemyDied(e);
      }
      for (let i = 0; i < rounds.length; i++) {
        const o = rounds[i];
        if (o.dead || !(o.hp > 0)) continue;
        if (!sweptPairHit(B.p, o, B.r + (o.r || 0))) continue;
        if (auraBite(B, o, Engine.targetClassOf(o.kind)) && o.hp <= 0) {
          // DENIAL ONLY — D10's REWARD rule, and it is a reward rule: no orb,
          // no xp, no score, no entry (js/engine.js, the ordnance taxonomy).
          // D62 (PORT-P) MADE IT A DESCENDANT RULE TOO, and inverted the
          // polarity that used to live here. A `grenade`, a `spitOrb` and a
          // generation-bearing `splitter` each carry 7/3/3 children, and this
          // arm used to fan them: the halo made the same children the gun
          // could not. The owner ruled the opposite way round — THE GUN
          // DETONATES, THE AURA DENIES — so the halo's death is now bare for
          // every kind, and the split moved to production's own door at
          // js/encounter-host.js's `damageKernelRound`, through the kernel's
          // staged `explodeRound` wrapper.
          //
          // childStaging is still up around this whole walk, so the aura's
          // BODY kills keep their contract unchanged; there is simply nothing
          // left for a round death to stage here.
          o.dead = true;
          burst(o.x, o.y, o.color, 4, 62);
        }
      }
    }
    childStaging = false;
  }

  // A body the aura finished. It goes through the SAME death path every other
  // killer uses — `damageEnemy` marks or kills depending on production's death
  // window — rather than a second one written here.
  function damageEnemyDied(e) {
    if (deathWindow) deathPending.push({ e: e, cause: "aura" });
    else killEnemy(e, "aura");
  }

  function resolveBulletHits() {
    // THE HULLS A ROUND CAN MEET, in ascending seat order. This sweep is a
    // COLLISION and therefore an AREA question — a round in flight is aimed at
    // nobody by the time it gets here, and a seat that flies into it is hit by
    // it. Production's own sweep is the precedent and has always worked this
    // way. The order is the pinned one (js/game.js's drain-order law) because
    // once a round can meet more than one hull, WHICH hull it meets first is
    // hash-visible.
    const hulls = seats();
    // ---- THE DESTRUCTIBLE-ORDNANCE CANDIDATE LIST (R6 commit F(d)) --------
    // D10's pass, and the `hp > 0` FILTER SITS HERE — outside both loops —
    // which is a cost decision the taxonomy makes explicitly. The outer loop is
    // already O(rounds) and the body loop inside it is O(bodies); adding a
    // second O(rounds) inner loop would make the whole thing O(rounds squared),
    // 280 x 280 at a full board and four times that per seat at PORT-S. Testing
    // `hp > 0` per PAIR would pay that price for the fourteen kinds that can
    // never be hit; building the list ONCE pays it only for the ones that can.
    // That is what bought the hp-0 tier its "zero runtime" — the promise D10
    // costed the tier on. D61 (PORT-P) spent most of it: the tier is two kinds
    // now (`kineticLance` and `lightning`), so the saving is small and the
    // list-building argument above is what still holds the cost down.
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
            damageEnemy(e, b.damage, b.x, b.y, "shot", b.seat);
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
          //
          // SEATLESS BY RULING, not by oversight, and this is the DESIGNED
          // state rather than an unfinished one: the crediting seat arrives at
          // S3b, in the commit that gives it its readers. Adding `seat` here
          // diverges the bounded AUTO fixture at tick 1952 — the tick a player
          // round first destroys an enemy round — for a key nothing in this
          // kernel consults. The paragraph in `damageEnemy` below carries the
          // measurement, the ruling, and the `credit: -1` fallback if S3b ever
          // needs the identity here BEFORE the readers exist. Do not complete
          // this in passing.
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
      } else {
        // ONE ROUND, ONE HULL — the body branch's rule, kept: the sweep stops
        // at the first seat it meets, because a round that has spent itself on
        // a hull must not go on to hit the seat behind it.
        for (let s = 0; s < hulls.length; s++) {
          const p = hulls[s];
          if (!p.alive || !segmentCircleWrapped(b, p, b.r + hullRadius(p, 7))) continue;
          // The arming gate that used to guard this branch went with the mine —
          // `!(b.kind === "mine" && b.armed > 0)` was the only reader of `armed`
          // on a round, and no round carries a non-zero one any more. The two
          // fields stay in the literal deliberately: the serializer sorts nested
          // keys, so the per-round FIELD SET is part of the hash, and removing
          // them would re-key every round in every tick for no behaviour at all.
          damagePlayer(p, b.damage, b.x, b.y, SRC_SHOT);
          if (b.kind === "grenade" || b.kind === "spitOrb" || b.kind === "splitter") explodeEnemyBullet(b, "impact");
          else b.dead = true;
          break;
        }
      }
    }
  }

  // ---- THE CREDITING SEAT, THROUGH THE DOOR'S OWN CHANNEL (commit A) ------
  // `seat` is who is to be blamed for this damage, or -1 for nobody. It reaches
  // the body ONLY through Engine.applyEffect's `source.seat` — the funnel R5
  // built, whose identity half collapses rightward into `credit` and writes
  // `t.lastAtk` under the guard `credit !== undefined && credit >= 0`. There is
  // deliberately no second path: a direct `e.lastAtk = seat` here would be a
  // second authority on the same key and would skip every prevention rule the
  // door applies above it (an IMMUNE or a REFUSED event must credit nobody,
  // and only the door knows that it refused).
  //
  // -1 IS THE DECLINE, and it is the shape S3a's site note named: `-1 >= 0` is
  // false, so the guard leaves the previous attacker standing. NOT `null` —
  // `null >= 0` is TRUE in JavaScript and would write a nonsense credit. The
  // chain leg below passes it, because a hammerhead's detonation is the BODY's
  // own and belongs to no seat.
  // Every cause this file's body-damage leg knows, and the effect KIND each one
  // consults the matrix under. Declared rather than derived, because the kind
  // decides a matrix row and a row nobody named is a row nobody chose.
  // ...and `ram` joins the table at PORT-S S3b lane 3, FIX 2 / S3BR-02, with
  // the comet's body ram it was written for. `MATRIX.ram[SHIP][BODY]` has stood
  // in js/engine.js since R5 — its own comment names `contactEvent`'s ram
  // damage to the body — and it was unreachable from the moment `contactEvent`
  // was deleted. This row is what makes it reachable again.
  //   NOTE WHAT A `ram` CAUSE DOES NOT DO, because the omission is the rule:
  // the frontal reductions above are gated on `cause === "shot"`, so a ram is
  // never reduced by a bulwark's or a minelayer's shield. That is the old
  // plane's behaviour too — its arc gate lived in the BULLET path alone — and
  // it is the honest reading of a hull arriving at a hull rather than a round
  // arriving down a barrel.
  var CAUSE_KIND = { shot: "shot", chain: "chain", blast: "blast", ram: "ram" };

  function damageEnemy(e, amount, x, y, cause, seat) {
    if (e.dead) return;
    // ---- D39's DAMAGE-EVENT TERM (the HOLD round, fix 11) ----------------
    // The stall signature's third term is PLAYER-CREDITED DAMAGE APPLIED TO A
    // BLOCKING BODY, which is demo-v4's accepted rule (`sim.js:1360-1369`,
    // `:5229-5242` — read by specification, never copied). It was counted in
    // production's `emit()` for every `hit` and `blast`, and the scoped check
    // found what that admits: a pilot firing into a WALL, a PvP blast, or a
    // shot into a nonblocking MINE all read as progress, so one unreachable
    // blocker could be kept from ever stalling by shooting at nothing.
    //
    // AT THE TOP OF THE FUNNEL, BEFORE THE EARLY RETURNS, and that is the whole
    // reason this term exists: the snapper's invulnerable phase and a fully
    // absorbed shield hit both return above without moving `hp`, and both ARE
    // combat. The count is of damage EVENTS on a blocker, not of hp delivered —
    // the hp sum is the term that measures delivery.
    //
    // `seat >= 0` IS THE PLAYER CREDIT. `damageBody` folds a non-integer or
    // negative seat to -1, so an uncredited or environmental hit cannot move
    // this counter; and `blocksClear` is the same question the gate asks, so a
    // mine (`never`) and a spent warden (`untilAttack`) are not progress toward
    // a clear the room is not waiting on them for.
    //
    // MODULE STATE, NEVER HASHED, like `present[]` beside it: it is a fact
    // about what has been SEEN, read only by presentation.
    //
    // ---- ...AND ONLY ON DAMAGE THE DOOR ACCEPTS (fix 16) -----------------
    // THE COUNT USED TO RUN BEFORE THE REJECTION AND THAT WAS WRONG. The final
    // check measured it: an INVULNERABLE SNAPPER shot once a second changes no
    // hull, changes no shield and changes nothing else — the funnel refuses the
    // shot outright — and the counter moved anyway, so a room holding one
    // invulnerable blocker could be kept from stalling forever. demo-v4 answers
    // `accepted: false` there and counts only after acceptance.
    //
    // WHERE THE ACCEPT BOUNDARY IS, stated because the two look alike from
    // outside and the term's whole purpose sits on the difference:
    //   * an INVULNERABLE PHASE REJECTS. Nothing about the body moves; the shot
    //     is a spark and a tint. It is not progress and must not be counted.
    //   * a SHIELD ABSORB ACCEPTS. `e.shield` really goes down, which is the
    //     body being worn away — the hull simply is not where it shows. That is
    //     the ONE case the hull sum cannot see, and it is why this term exists
    //     at all; counting only hull would make it a duplicate of the second
    //     term. `tests/wave1-checks.js` pins both readings, so the boundary is a
    //     leg rather than an assumption.
    // So the increment moves BELOW the rejection and ABOVE the absorb.
    if (e.type === "snapper" && !e.vulnerable) {
      e.hit = 0.04;
      particle(x, y, fxRange(-45, 45), fxRange(-45, 45), "magenta", 0.16, 1.1, "spark");
      return;
    }
    if (seat >= 0 && blocksClear(e)) blockerDamage++;
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
    //
    // ---- THE CREDITING SEAT ARRIVED WITH ITS READERS (S3b lane 2, commit A)
    // S3a measured that stamping a seat here re-keys the bounded run — the
    // door's identity half collapses rightward into `credit`, the guard
    // `credit !== undefined && credit >= 0` writes `t.lastAtk`, and a kernel
    // body hashes through no allow-list, so a new own key IS a new flight
    // (DIVERGED at tick 132 on the AUTO manifest; 41 keys to 42). The ruling
    // was DEFERRAL AS THE DESIGN: the seat lands at S3b in the commit that
    // wires this kernel's aggro grievance and kill cue to `lastAtk`, so the
    // state arrives together with the things that read it, and the recapture
    // is bought for a change somebody consumes.
    //
    // THAT COMMIT IS THIS ONE. Both readers landed with the write:
    //   READER 1 — `retargetAtDecision` above, production's rule reproduced
    //              inside S3a's ONE targeting authority;
    //   READER 2 — `killEnemy`'s cue below, stamped with the crediting seat
    //              exactly as js/encounter.js:2685 stamps its own.
    // The three keys are spawned on EVERY body (see spawnEnemy) rather than
    // grown by the first hit, so the record's key set is not a function of the
    // flight — which is the half of S3a's measurement that would still have
    // bitten a lane that only added the write.
    //
    // WHAT THE SEAT IS, PER LEG. The shot leg carries the FIRING seat off the
    // round (`b.seat`, stamped in firePlayer). The chain leg carries -1: a
    // hammerhead's detonation is the dying body's own act, its source class
    // already says BODY, and -1 is this repo's "nobody" — production spawns
    // bodies with `lastAtk: -1` and `nearestSeat` returns -1 when every seat is
    // down.
    //
    // -1 DECLINES THE WRITE; IT DOES NOT ERASE A PREVIOUS ONE. An earlier draft
    // of this note said a chain death "has `lastAtk` at -1 and pays nobody",
    // which the vendor-cross review measured false: a body a seat left at 2 hp
    // pays that seat when a blast finishes it, because `lastAtk` means "the
    // last one that damaged the body" on both planes. It pays nobody when
    // nobody ever hit it, AND when the grievance has since been CONSUMED by a
    // decision — `lastAtk` is grievance state with a short life, not a durable
    // kill record, on this plane and on production's alike. See the chain site.
    //
    // NOT `null`, AND THE TRAP IS STILL WORTH ITS THREE LINES, because the next
    // caller that wants to decline will reach for it. `null` looks like the
    // natural way to say "no credit" and does the opposite: `null >= 0` is TRUE
    // in JavaScript, so the guard passes and writes `lastAtk = null` — a hashed
    // key carrying a nonsense value, strictly worse than a wrong seat. Verified
    // against the guard, not assumed. -1 is the decline.
    //
    // AND IF A PERMANENT SPLIT IS EVER WANTED — some target classes take credit
    // and some never do — the shape is the one js/engine.js already names in
    // the paragraph that keeps credit off a SHIP: a DECLARATION beside the
    // matrix, never a condition at a call site. Nothing here asks for one: this
    // file has one target class that takes credit and one that declines, and
    // both say so in the same argument.
    // ---- THE CAUSE IS A DECLARED TABLE NOW (S3b lane 3, commit B) --------
    // It was `cause === "chain" ? "chain" : "shot"`, a two-way test whose ELSE
    // branch silently absorbed anything new. `blast` arrived with production's
    // splash — a real third cause with its OWN matrix row (blast SHIP -> BODY)
    // and its own directional behaviour above (a splash has no direction, so it
    // is not gated by the arc reductions the `shot` branches apply). Under the
    // old test it would have been reclassified as a shot, consulted the wrong
    // row and taken the bulwark's frontal reduction, and nothing would have
    // said so.
    //
    // AN UNKNOWN CAUSE STILL LANDS AS A SHOT, which is what every caller in
    // this file already relied on, but it is now the table's DECLARED default
    // rather than the shape of an if.
    var effKind = CAUSE_KIND[cause] || "shot";
    Engine.applyEffect({ kind: effKind,
                         target: e, tgtCls: Engine.CLASS.BODY,
                         source: { cls: cause === "chain" ? Engine.CLASS.BODY : Engine.CLASS.SHIP,
                                   seat: seat === undefined ? -1 : seat },
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
    // ---- THE DEFERRED DEATH (FIX 1 / S3BR-01) ---------------------------
    // Inside production's bullet-resolve window the kill is MARKED, not run:
    // its cue, its bounty and its children all land at the reap slot, after the
    // shot that caused it has emitted its own `hit` and resolved its own blast.
    // Outside the window — every kernel-internal caller — nothing changed.
    //   NO GUARD AGAINST A DOUBLE MARK IS NEEDED and the reason is worth
    // stating: a marked body sits at hp <= 0 with `dead` still false, and both
    // doors into this function refuse that shape (`damageBody` tests
    // `!(e.hp > 0)`, and production's own blast arm skips `hp <= 0`).
    if (e.hp <= 0) {
      if (deathWindow) deathPending.push({ e: e, cause: cause });
      else killEnemy(e, cause);
    }
  }

  function killEnemy(e, cause) {
    if (e.dead) return;
    e.dead = true;
    const st = STATS[e.type];
    const heavy = Boolean(st.heavy || st.boss);
    // ---- READER 2 OF `lastAtk` — THE KILL CUE (S3b lane 2, commit A) -------
    // js/encounter.js:2685 is the shape, verbatim in its two halves: the NAME
    // splits on heaviness (`killheavy` or `kill`) and the CREDIT is the seat
    // that last damaged the body, -1 when none has. Production's own comment
    // adds the reason the -1 is not a defect — "the audio layer keys that as
    // its own single kill#-1 bucket".
    //
    // THROUGH THE SINK, which is the only channel this kernel has: it touches
    // no DOM, reads no production surface, and boots inside a vm over a
    // throwing stub. A host that supplied no `cue` got the noop at setSink, so
    // this line is free on every surface that does not listen. WHAT A HOST DOES
    // WITH IT IS THE HOST'S BUSINESS — routing it into production's economy is
    // js/encounter-host.js's job, not this file's.
    //
    // BEFORE THE ORB LOOP, and for production's own reason at the same site:
    // the orb spawns consume the seeded stream and the emit reads nothing and
    // reorders nothing, so keeping it above the draws makes that obvious. It is
    // ALSO before the FX below, which is where production puts it too.
    //
    // THE CUE IS NOT HASHED. `sink.cue` leaves this simulation entirely; no
    // state is written here, so a host that listens and a host that does not
    // produce the same flight. That is what lets the credit half of this commit
    // be proved by a cue leg rather than by a fixture.
    sink.cue(heavy ? "killheavy" : "kill", { kind: "enemy", x: e.x, y: e.y, seat: e.lastAtk });
    // ---- THE KILL'S SCORE GOES TO THE CREDITING SEAT (commit C) ---------
    // It was `S.score += st.score`, a room-wide singleton, and this file's own
    // note named it as the second one the ladder's block was about: "`S.score`
    // is killEnemy's, and it goes to production's seat records at S3b."
    //
    // THE SEAT IS `e.lastAtk` — the SAME value the cue above reports, read at
    // the same instant, so the score and the cue can never disagree about who
    // killed the body. Reading it twice from one place is the point: a second
    // derivation here (the body's TARGET, say, or the nearest seat) would be a
    // second answer to "who killed this", and the two would part the first time
    // a body died to a seat it was not chasing — which is most of them.
    //
    // AN UNCREDITED KILL PAYS NOBODY, and "uncredited" means the body carries no
    // UNCONSUMED GRIEVANCE — either nobody ever hit it, or its grievance was
    // consumed by a decision it took since. It does not mean "the finishing
    // blow had no seat": a body a seat softened and a chain finished on the
    // next tick pays THAT SEAT, because -1 at the chain site declines the write
    // rather than erasing the earlier one. Commit A's prose claimed otherwise
    // and the review measured it; fix 2 corrected the direction and round 2
    // corrected the precision. The score is simply not awarded when there is no
    // credit: it does not fall to seat 0 and it is not banked room-wide.
    if (e.lastAtk >= 0) {
      const scorer = seats()[e.lastAtk];
      if (scorer) scorer.score += st.score;
    }
    const xpTotal = e.type === "drone" ? 0 : st.xp;
    const count = Math.min(8, xpTotal);
    for (let i = 0; i < count; i++) {
      const value = Math.floor(xpTotal / count) + (i < xpTotal % count ? 1 : 0);
      spawnOrb(e.x, e.y, i, count, value);
    }
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
          // NO SEAT, AND -1 IS A DECLINE RATHER THAN AN ERASURE. This is the
          // half commit A's prose got wrong and the vendor-cross review
          // measured: `-1` makes the door's guard decline the write, so the
          // victim KEEPS whichever seat last shot IT. It does not clear a
          // previous attacker, and it was never going to — the door has no
          // "forget" and should not grow one.
          //
          // AND THAT IS THE RIGHT ANSWER, not a limitation to work around. A
          // hammerhead's detonation is the dying BODY's own act, so the chain
          // itself credits nobody; but `lastAtk` means what production says it
          // means — "the last one that damaged the body" — and if a seat left
          // this victim at 2 hp, that seat earns the kill when the blast
          // finishes it. The alternative reading, where a chain ERASES the
          // credit, would take a kill away from a player who did all the damage
          // and hand it to nobody. Production would not do that either: its own
          // `reapDead` reports whatever `lastAtk` holds.
          //
          // SO A CHAIN KILL PAYS THE VICTIM'S UNCONSUMED GRIEVANCE, and the
          // word UNCONSUMED is the whole of the precision. `lastAtk` is
          // grievance state, not a durable kill record: the next decision this
          // body takes clears it, kept or not. A victim shot on tick T and
          // chain-killed on T+1 pays its shooter; the same victim left for a
          // hundred ticks has had its grievance consumed and pays nobody.
          //
          // THAT IS PRODUCTION'S PROPERTY TOO, not a shortfall of the port.
          // js/encounter.js's `retargetAtDecision` ends with the identical
          // `e.lastAtk = -1`, and its `reapDead` reads whatever survives —
          // production's own comment says so: "the seat is the last one that
          // damaged the body — -1 when none has (all but unreachable: every
          // damage site stamps lastAtk before reapDead runs)". Both planes buy
          // attribution that is exact for the kill that FOLLOWS the damage and
          // silent for one that comes long after.
          //
          // A DURABLE KILL RECORD WOULD BE A DIFFERENT FIELD, and it would be a
          // fourth hashed key on every body plus its own recapture. Nothing has
          // asked for one; if something does, it wants a `killer` beside
          // `lastAtk` rather than a longer life for this one, because the
          // grievance's short life is what the aggro rule needs.
          // demo-seats LEG H(12) pins all three readings.
          damageEnemy(other, damage, other.x, other.y, "chain", -1);
        }
      }
      // AREA: a detonation is a radius around a PLACE, so it reaches every
      // living seat inside it — ascending seat order, blastAt's precedent
      // (js/encounter.js). `targetOf` is unavailable here on purpose: killEnemy
      // is reached from resolveBulletHits as well as from a body's own slice,
      // so there is no body turn to be inside, and a blast has no target
      // anyway.
      const blasted = seats();
      for (let s = 0; s < blasted.length; s++) {
        const t = blasted[s];
        if (t.alive && distSq(e, t) < 100 * 100) damagePlayer(t, 8, t.x, t.y, SRC_BLAST);
      }
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
      // AREA, exactly as the hammerhead's above and for the same reason.
      const caught = seats();
      for (let s = 0; s < caught.length; s++) {
        const t = caught[s];
        if (t.alive && distSq(e, t) < 57 * 57) damagePlayer(t, 14, t.x, t.y, SRC_MINE);
      }
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
      // (`S.gateTimer = 0` stood here and is DELETED at S4 commit E. It reset
      //  the retired one-type DWELL so a boss's death restarted the 2.15 s
      //  count. The field now means SECONDS LEFT BEFORE THE NEXT DEAL, and no
      //  break can be running at this line — a room with a live boss in it is
      //  not clear — so the write was dead in the best case and would have
      //  cancelled a break in the worst.)
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
      captured: false,
      life: ORBLIFE, phase: rangeOf(gen, 0, TAU), value: value || 1, dead: false
    });
  }

  // PER-SEAT ORB ATTRIBUTION (PORT-S S3a commit D). It WAS deliberately the
  // attribution only, with the ladder it fed staying one room-wide ladder; S3b
  // lane 2 commit B retired that ladder, and the collecting seat this pass
  // resolves is now the seat the PAYMENT is made to — see creditPickup below.
  //
  // TWO DIFFERENT QUESTIONS, ANSWERED DIFFERENTLY, and production answers them
  // the same way:
  //   THE MAGNET asks "who pulls this orb", and the honest answer is the
  //   NEAREST LIVING seat — an orb drifts toward whoever is closest to it, and
  //   two seats dragging one orb in opposite directions is not a mechanic
  //   anybody asked for.
  //   THE PICKUP asks "who banks it", and that is settled by ASCENDING SEAT
  //   ORDER on the orb's PRE-MOVE point, which is `stepOrbs` in
  //   js/encounter.js verbatim: the lowest living seat that covers the orb wins.
  //   The pre-move point is not an accident either — it is the point the pull
  //   above was computed from, so a seat cannot bank an orb it has not reached.
  // ---- THE CLEARED SWEEP (PORT-S S4, commit E) ----------------------------
  // The owner's break ruling (S-bpzbzy) has a stated PURPOSE — the wave's income
  // is in the wallet before its shop opens — and restoring `cleared` alone does
  // NOT deliver it. Production's own sweep (`stepOrbs`, `attract: Infinity,
  // clearPull 7.5, clearVmax 60`) walks `E.orbs`, which post-flip holds only the
  // PvP-death payout; the enemy plane's bounty lives HERE and this pass had no
  // sweep mode at all — a fixed 185 px magnet and an 8 s `life`. An orb dropped
  // across the room from every seat simply expired, and under D21, where the
  // room stands still while the last body is hunted, that gap gets LONGER.
  //
  // SO THE SWEEP IS BUILT HERE, ON PRODUCTION'S OWN NUMBERS, CONVERTED. Its
  // `clearPull` is 7.5 px per tick per tick and its `clearVmax` is 60 px per
  // tick; this file integrates in SECONDS, so they are 7.5 x 3600 = 27000 px/s²
  // and 60 x 60 = 3600 px/s. The arithmetic that matters: the bounded arena's
  // diagonal is hypot(7680, 7920) = 11031 px, and 11031 / 3600 = 3.06 s against
  // a break of 8. Every orb on the field reaches a living seat with margin.
  //
  // AND THE ORBS DO NOT EXPIRE WHILE IT RUNS. An 8 s `life` against an 8 s break
  // would race the sweep it is meant to serve. `life` is suspended for the
  // break and resumes with it, so nothing is banked that a player did not earn
  // and nothing is lost to a clock that started before the room stood still.
  //
  // THERE ARE TWO SUSPENSIONS NOW AND THEY ARE DIFFERENT SUSPENSIONS. This one
  // is the SWEEP's: temporary, room-wide, and it ends when the break does.
  // D55 (PORT-P) added the CAPTURE's: permanent and per orb. A captured orb has
  // been paid for, so its clock stops for good and the expiry can no longer
  // take it — see `!o.captured` on the decay and on the expiry below. A reader
  // who knows only the sweep will read the second guard as a duplicate of the
  // first, and it is not.
  var CLEAR_SWEEP_ACCEL = 27000;   // px/s^2 — production's clearPull 7.5/tick^2
  var CLEAR_SWEEP_VMAX = 3600;     // px/s   — production's clearVmax 60/tick

  function updateOrbs(dt) {
    const list = seats();
    const sweeping = S.gateTimer > 0;
    for (let i = 0; i < S.orbs.length; i++) {
      const o = S.orbs[i];
      setPrevious(o);
      if (!sweeping && !o.captured) o.life -= dt;
      o.phase += dt * 5;
      const p = pilotAt(o.x, o.y);
      const dx = delta(o.x, p.x, W);
      const dy = delta(o.y, p.y, H);
      const d = Math.hypot(dx, dy) || 1;
      // D55 (PORT-P) — THE CREDIT IS AT CAPTURE, and the gate is HOISTED OUT
      // of the branch below on purpose. The magnet arm is the ELSE of the
      // between-wave sweep, and while the sweep runs it is never reached — so a
      // capture test living inside it would miss every sweep collection, which
      // is most of them. Sweep or no sweep, an orb crosses the band between
      // ORBMAGNET and ORBRING at no more than CLEAR_SWEEP_VMAX, so it is
      // sampled inside the magnet before it can land.
      //   THE PAYEE IS `p` — `pilotAt`, the NEAREST living seat. The ring's
      // ascending-seat tie-break retires with the ring credit: one payee rule,
      // and at four seats an orb equidistant between two of them can now be
      // paid to a different seat than it would have been.
      if (p.alive && !o.captured && d < ORBMAGNET) {
        o.captured = true;
        creditPickup(o.value || 1, p, o);
      }
      if (p.alive && sweeping) {
        // WORLD-WIDE, and capped rather than accumulated: production's sweep
        // clamps the speed the same way, so an orb crosses the room at a
        // known rate instead of arriving at whatever the damping left it.
        o.vx += dx / d * CLEAR_SWEEP_ACCEL * dt;
        o.vy += dy / d * CLEAR_SWEEP_ACCEL * dt;
        const m = Math.hypot(o.vx, o.vy);
        if (m > CLEAR_SWEEP_VMAX) {
          o.vx *= CLEAR_SWEEP_VMAX / m;
          o.vy *= CLEAR_SWEEP_VMAX / m;
        }
      } else if (p.alive && d < ORBMAGNET) {
        const pull = (1 - d / ORBMAGNET) * ORBPULL + 60;
        o.vx += dx / d * pull * dt;
        o.vy += dy / d * pull * dt;
      }
      // Taken BEFORE the move, because the landing test reads the orb's
      // pre-move point and the move is two lines below. Same numbers, and the
      // reader does not have to hold a stale `d` in their head to see it.
      // D55: the block this guards is the LANDING — removal and the cue — and
      // no longer the credit, which was paid at magnet entry above.
      let taker = null;
      for (let s = 0; s < list.length; s++) {
        const t = list[s];
        if (!t.alive) continue;
        const tx = delta(o.x, t.x, W);
        const ty = delta(o.y, t.y, H);
        if ((Math.hypot(tx, ty) || 1) < ORBRING) { taker = t; break; }
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
      if (taker !== null) {
        // D55 — THE LANDING. The money moved at magnet entry; what happens here
        // is the removal and the SOUND, at the hull, on the tick the orb
        // arrives. The seat travels as an INDEX, never as a live record: the
        // host's routeCue refuses a non-numeric seat and would route the cue to
        // nobody, and creditPickup's own prose forbids handing a seat record
        // across the sink.
        o.dead = true;
        sink.cue("pickup", { x: taker.x, y: taker.y, seat: seats().indexOf(taker) });
        particle(taker.x, taker.y, fxRange(-30, 30), fxRange(-30, 30), "gold", 0.35, 2, "spark");
      }
      // ...AND A CAPTURED ORB NEVER EXPIRES. It has been paid for; sweeping it
      // off the field before it lands would delete a flight the player already
      // owns.
      if (o.life <= 0 && !o.captured) o.dead = true;
    }
    S.orbs = S.orbs.filter(function (o) { return !o.dead; });
  }

  // ---- THE XP LADDER IS RETIRED (S3b lane 2, commit B) --------------------
  // The block that stood here carried a dated instruction and this commit is
  // it, quoted so the deletion is checkable against what asked for it:
  //
  //   "S3b KILLS THIS LADDER. The demo's XP levelling retires and orbs feed
  //    production's `addXp(n, seat)` and its shop economy instead, with score
  //    and the crown moving onto production's per-seat records. Building a
  //    per-seat XP machine here would be building a machine to delete, and it
  //    would cost a serializer version and a recapture on the way past."
  //
  // WHAT WENT. `S.xp`, `S.xpNext` and `S.level`, the room-wide ladder; the
  // level-up loop and the hull bump and FX it paid; and the ONE stat that
  // derived from it (the fire cooldown, now the flat base — see updateSeat).
  //
  // WHAT ARRIVED IN ITS PLACE: nothing, in this file. An orb pickup is an
  // ECONOMIC EVENT and it leaves through the sink. What a host does with it is
  // the host's business — production's `addXp(n, seat)` credits the wallet, the
  // scoreboard and the high-water mark in one place, `termsFor(seat)` is the
  // one derivation the shop and the phase-11 predictor both read, and none of
  // that is reachable from inside a vm sandbox that boots over a throwing stub.
  //
  // THE ATTRIBUTION SPLIT S3a BUILT IS WHAT SURVIVES, and it is the whole
  // reason this signature already took a seat: the COLLECTING seat arrives as
  // an argument, so the payment is per seat from the first line rather than
  // room-wide with a seat bolted on. At one seat the two readings were the same
  // reading; at four they differ, and this is the ruling S3a deferred to.
  //
  // THE PARTICLE STAYS AT THE CALL SITE. It is the pickup's FX and it was
  // always the call site's, not the ladder's — the ladder's own FX (a gold
  // shockwave and a burst at each level-up) went with the ladder.
  // ---- THE PICKUP'S POSITION RIDES THE PAYMENT (S3b lane 3, commit D4) ----
  // A THIRD ARGUMENT, and it is presentation rather than economy: production's
  // own `stepOrbs` raises a `pickup` cue AT THE ORB, and its audio layer
  // attenuates and pans every cue by distance from the listening seat. The
  // credit channel carried the seat and the value and nothing else, so a host
  // routing it into that queue could only raise a POSITIONLESS pickup — which
  // `att()` reads as "nobody is near it" and silences.
  //
  // D55 (PORT-P) MOVED THE CUE OFF THIS PAYMENT, so the paragraph above is
  // history rather than contract. The credit is paid at MAGNET ENTRY now and
  // the cue is raised at the LANDING, in the ring block of `updateOrbs`, at the
  // taker's hull — the position the audio layer wants. `at` is therefore the
  // CAPTURE point: it is what a host that wants to know where the orb was
  // caught should read, and it is NOT where anything sounds.
  //
  // BEHAVIOUR-FREE HERE. No state is written, the sink leaves this file, and a
  // host that ignores the argument is exactly where it was.
  function creditPickup(value, seat, at) {
    // The seat INDEX, not the record: the sink crosses out of this file and a
    // record reference would hand a host a live pointer into the simulation.
    // `seats().indexOf` is the roster's own answer and it is -1 for a record
    // that is not on it — which cannot happen from the one call site, and which
    // a host reading -1 will treat as "nobody" exactly as everything else here
    // treats -1.
    sink.credit(seats().indexOf(seat), value,
      at && Number.isFinite(at.x) && Number.isFinite(at.y) ? { x: at.x, y: at.y } : undefined);
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
    updatePlayers(dt);
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
    starEaterSegments: starEaterSegments, findEnemy: findEnemy,
    // IS THIS BODY COMMITTED TO A LINE? The aggro decision refuses to run while
    // it is true, which is production's telegraph-honesty rule.
    //
    // IT IS NOT js/demo-render.js's GLOW PREDICATE, and fix 10 merged the two
    // on the argument that they were one question. THEY ARE NOT. The glow asks
    // "should this body be brighter" and its list is tuned for READING — it
    // carries `dash` and not `lunge`, because a hammerhead's ram wants the
    // extra glow and a snapper's does not. Merging them made this gate inherit
    // that omission, and round 3 measured a snapper and a star eater
    // retargeting MID-DASH and passing through the seat standing in their own
    // painted lane. Two questions, two answers, and the difference written down
    // is cheaper than the third wrong gate.
    committedToALine: committedToALine,
    // ---- THE PUPPET SEAM (S3b lane 3, commit A) --------------------------
    // setPose(seat, pose) hands this kernel one seat's production pose;
    // setPose(seat, null) gives the seat back to this kernel's own flight.
    // poseDriven(seat) is the read half, published because the host and the
    // renderer both have honest reasons to ask and neither may reach `posed`.
    setPose: setPose,
    // ---- D26'S AURA, ITS DIAL AND ITS QUEUE (PORT-S S5, commit D) ---------
    // `setAuraDamage` is production's `COMETAURA` crossing the seam once per
    // tick, on `setBuildPurchases`' own footing: a production tunable this
    // kernel may not read for itself. Zero — the default, and what every
    // surface that never calls it gets — makes the whole pass a single
    // early return.
    //
    // `flushChildren` is the aura's staged births, materialized by the host
    // AFTER production's combat window. `pendingChildren` is the count, for the
    // legs that prove nothing is born on the tick that killed the parent.
    setAuraDamage: setAuraDamage,
    // D67's orb dials, the same crossing: four production numbers this
    // kernel may not read for itself, plus one read-half so a driven leg
    // can prove the value ARRIVED rather than that the row was clicked.
    setOrbLife: setOrbLife,
    setOrbMagnet: setOrbMagnet,
    setOrbRing: setOrbRing,
    setOrbPull: setOrbPull,
    orbDials: orbDials,
    // D62 (PORT-P) — THE SPLIT'S ONE PUBLIC DOOR. `explodeEnemyBullet` stays
    // private; this wrapper is what production's `damageKernelRound` calls on
    // a round it has just killed. It raises `childStaging` for the call, so a
    // gun-born child rides the SAME queue the aura's children ride and lands
    // through `flushKernelChildren` after production's combat window — never
    // into the live `S.bullets` array the sweep at js/encounter.js is walking,
    // where it would be born with px === x and be a candidate for the very
    // next bullet of the same tick.
    explodeRound: function (round, reason) {
      if (!round || round.dead || round.exploded) return false;
      var was = childStaging;
      childStaging = true;
      explodeEnemyBullet(round, reason);
      childStaging = was;
      return true;
    },
    flushChildren: flushChildren,
    pendingChildren: pendingChildren,
    poseDriven: poseDriven,
    // ---- THE ROSTER'S PUBLIC SIZE (PORT-S S4, commit A) ------------------
    // setSeatCount(n) is the ONLY published way to change how many seats this
    // kernel holds. See its own block: it answers `resetRun`'s deferred "the
    // count becomes the room's fact at S4", it retires demo-seats.mjs's source
    // graft, and at n === 1 it is a no-op the bounded pair proves.
    setSeatCount: setSeatCount,
    // ---- PRESENCE (PORT-S S4, commit D) — D8's relocated gate -------------
    // setSeatPresent(seat, on) tells this kernel whether a seat it HOLDS is
    // claimed and not parked. It is the only input to D14's threat budget and
    // to D20's boss hull; see `present`'s own block. A seat nobody has spoken
    // about counts as present, so a kernel with no production behind it reads
    // exactly as it did before this call existed.
    setSeatPresent: setSeatPresent,
    // ---- D21's PUBLIC SURFACE (PORT-S S4, commit E) ----------------------
    // `liveBodies()` is THE census — `!dead && hp > 0` — and it is published so
    // that production's `foeCount()`, `applyKernelHud`'s state map and this
    // file's own clear gate are ONE derivation rather than three copies. Two
    // copies of a census is how a gate and a HUD come to disagree about whether
    // a room is empty.
    liveBodies: liveBodies,
    // ...and the ROLE QUESTION itself (D39, S4 fix 9), published for the ONE
    // CENSUS's sake: production's HUD counts the bodies its own presentation
    // plane holds — on a net client those are DECODED rows, which this file
    // never sees — so the reader crosses the seam and the RULE does not.
    blocksClear: blocksClear,
    // ...and the count of PLAYER-CREDITED DAMAGE EVENTS ON BLOCKERS (fix 11) —
    // D39's stall signature's third term. Published rather than mirrored: the
    // detector runs on the production plane and the rule lives here, beside the
    // role it reads.
    blockerDamageSeen: function () { return blockerDamage; },
    // ...and the room's own verdict, plus the break's remaining SECONDS.
    // `clearHoldLeft()` is 0 whenever no break is running, so a caller can ask
    // "is the room in its break" with one call and no threshold of its own.
    roomClear: roomClear,
    pendingArrivals: pendingArrivals,
    clearHoldLeft: function () { return S.gateTimer > 0 ? S.gateTimer : 0; },
    CLEAR_HOLD: CLEAR_HOLD,
    // ---- D16's ESCALATION, PUBLISHED (PORT-S S4, commit F) ---------------
    // The dial and the factor it currently produces. Published for the reason
    // `CLEAR_HOLD` is: a leg that restated 0.15 would be a second authority on
    // a number the feel gate is expected to turn.
    ESCALATE: ESCALATE,
    escalation: escalation,
    // ---- D38's DIAL AND ITS INPUT (the SEVENTH AMENDMENT, S4 fix 10) ------
    // The setter is the DEV TUNE ROUTE's door and the reader is published for
    // the same reason `escalation` is: a leg that restated the arithmetic would
    // be a second authority on a number the feel gate is expected to turn.
    // `buildScale()` is a FUNCTION, not a value: `ESCALATE` above is a snapshot
    // taken at publication and a dial that can be turned may not be one.
    // ...and the TWO FUNCTIONS THE DIAL DIVIDES, published so a leg can assert
    // WHERE it rides rather than infer it: the hull it multiplies and the deal
    // count it must never touch. Both are pure derivations of state this file
    // already owns — reading them changes nothing and driving an arc to a boss
    // to read one costs 14,000 ticks.
    bossHull: bossHull,
    dealCount: dealCount,
    setBuildScale: setBuildScale,
    buildScale: function () { return BUILDSCALE; },
    setBuildPurchases: setBuildPurchases,
    buildPurchases: function () { return buildPurchases; },
    buildFactor: buildFactor,
    // ---- THE DEV LEVER (PORT-S S4, commit G) — AN INSTRUMENT, NOT A RULE --
    // `devDealSetpiece(n)` jumps this director to setpiece n, clearing the board
    // on the way. It is the LATENCY RIG'S CONDITION SELECTOR and nothing else:
    // a run that wants to measure setpiece 10 cannot fly to it, and before this
    // it selected its condition with a lever that had refused since S3b commit
    // D4 — a run journalled and scored as wave 10 while the field stayed at
    // wave 1 (the defect FIX 9 caught by making the refusal loud).
    //
    // ITS SHAPE IS THE ONE D21 FORBIDS IN PLAY, deliberately and by name: it
    // WIPES the board, which is exactly what the owner ruled out for an ordinary
    // advance. That is why it is `dev`-prefixed, why `updateDirector` cannot
    // reach it, and why the play path's only route to it — production's
    // `dealWave` — is called from ONE place behind `devTuneOn()`.
    //
    // IT RETURNS THE WAVE IT LANDED ON, so a caller can journal the truth rather
    // than the number it asked for. That is FIX 9's actual lesson: the defect
    // was not the lever, it was a caller logging a success it had not had.
    devDealSetpiece: function (n) {
      if (!Number.isFinite(n)) return S.wave;
      clearBoardForJump();
      S.gateTimer = 0;      // any break in flight ends with the board it held
      startWave(clamp(Math.floor(n), 1, WAVES.length - 1), false);
      return S.wave;
    },
    // ---- THE SPAWN SOURCES, DECLARED (PORT-S S4, commit E) ---------------
    // The bodies that DEAL other bodies. The clear gate does not need this list
    // — a source is a body, so a live one already fails "no live body remains"
    // — but two other readers do: the STALL SURFACE names the survivor by type
    // when a room stands still, and `test/node-golden.mjs`'s (c5) census holds
    // this declaration against a scan of this file in both directions. A source
    // added without a row here reds there, by name.
    //
    // The star eater is on the list and its children are ORDNANCE: splitter
    // BULLETS, bounded by `b.generation`. It is a source of a different kind
    // and it is listed because it is a boss the room must kill, not because a
    // bullet ever gates a room.
    SPAWN_SOURCES: ["hive", "minelayer", "constructor", "spitfire", "stationOmega", "starEater"],
    // ---- THE SWEEP'S TWO MEMBERS (S3b lane 3, commit B) -------------------
    // Production's player-bullet plane survives the retirement — the bench, the
    // ability masks, the fire-time rebate and the phase-11 predictor all hang
    // off it — so its ENEMY ARM has to reach this kernel's bodies. These are
    // the two calls that let it, and there are exactly two because the arm asks
    // exactly two questions: what is there, and hurt that.
    //
    // `bodies()` is `mapState`'s footing, verbatim: a READ-ONLY live view,
    // never mutated by a caller, re-read each tick rather than cached, because
    // `resetRun` REPLACES the array. It hands back the array itself rather than
    // a copy for the reason production's does — the sweep runs per bullet per
    // tick and a copy per call is a copy per bullet.
    //
    // `damageBody` is the ONE door, and it is `damageEnemy` under a published
    // name rather than a second path. Everything the retirement depends on
    // hangs off that one call: the R5 funnel writes `lastAtk` from
    // `source.seat`, lane 2's aggro grievance reads it at the next resting
    // decision, and lane 2's kill cue reports it. A second entry point here
    // would be a second authority on the crediting seat, and the two would
    // part the first time a body died to a seat it was not chasing.
    bodies: bodies,
    damageBody: damageBody,
    // ...and the DEATH WINDOW (FIX 1 / S3BR-01). Two calls, and they are a
    // PAIR: production arms the window around its own bullet-resolve phase and
    // flushes it at the reap slot, so a kill this file takes on production's
    // behalf lands where the retired `reapDead` landed. `flushDeaths` returns
    // the count it ran, so a caller can assert the window did work.
    armDeaths: armDeaths,
    flushDeaths: flushDeaths,
    // ...and the ATOMIC RESET's second half (FIX 10): apply a banked pose to
    // the record NOW, for a host that has just reset this kernel from inside
    // production's tick and cannot wait for a step to land the mirror.
    applyPoseNow: applyPoseNow
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (typeof window !== "undefined") window.DemoKernel = API;
  else if (typeof globalThis !== "undefined") globalThis.DemoKernel = API;
})();
