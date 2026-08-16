"use strict";

// Encounter module — endless progressive waves. Five original archetypes,
// each one a different axis of pressure, and each debuting alone on its own
// wave so its behavior is legible before it is multiplied: weak grouped
// DARTS that approach, hold a preferred ring without ramming, face the
// player, telegraph a short pulse-lance, fire it, and cool down; from wave 2
// the HARRIER, a standoff hull that kites at 300 px and lobs seeking
// missiles — RANGE, the first threat that reaches across the screen; from
// wave 3 lone CHARGERS that plant, lock a lunge line, and ram; from wave 4
// the HUSK, a slow bomb with no attack whose whole threat is the three fast
// SHARDS it bursts into — DEATH TIME, the first body whose kill is a
// decision; and from wave 5 the ANVIL, a wedge whose ±70° frontal shield
// eats bullets — FACING, the first body you cannot kill from where you
// stand. Every one of them is telegraphed and every one is answered by
// MOVING rather than by out-damaging, and the wave generator interleaves
// them on a fixed rotation, because difficulty here is meant to come from
// composition rather than from any single body.
// Each wave reseeds its own RNG stream and deals its schedule and stats
// from pure functions of the wave number (waveGroups/countsFor/statsFor),
// so a wave replays identically no matter how the previous one was played.
// Deaths drop XP orbs (one per dart, two per charger, three per anvil, and
// four for a husk once its three shards are cleaned up) into an UNCAPPED
// wallet; after every wave clear the banner holds, the field's orbs sweep
// to the ship, and a frozen SHOP opens — a graphical, MOUSE-ONLY grid of
// upgrade cards: a click on a card buys it while the wallet can pay, and a
// click on NEXT WAVE deals the wave. The wallet resets on death. All tuning
// here is a local starting point for this experiment, not a claim of
// Nova Drift-exact behavior.
//
// Classic scripts share one global lexical environment, so this file
// reads game.js state (G, cam, ctx, C, FONT, FW/FH/WW/WH, SHIP_R, step,
// BDMG/CONTACTCD, spawnImpactFx) directly. The IIFE keeps every internal
// name private; the only globals published are one window.Encounter
// assignment and an Object.assign extension of window.__test.
(() => {
  // ---- deterministic configuration — every feel-sensitive value ----------
  const ECFG = {
    seed: 0x51A9E7,          // base seed — startWave folds the wave number in, so
                             // every wave deals the same SCHEDULE and pattern on
                             // every run; anchor geometry tracks the live camera
                             // rectangle, which follows real input
    enemy: {                 // dart baseline — statsFor scales hp and maxSpeed per wave
      r: 7, hp: 2,
      maxSpeed: 2.4,         // px/tick — 144 px/s, just over the ship's 120 top speed
      steer: 0.06,           // fraction of (target − velocity) applied per tick
      prefer: 84,            // the ring it holds around the player, px
      band: 14,              // hold tolerance — inside prefer−band it backs off
      backSpeed: 1.2,        // retreat speed when the player crowds it
      sepR: 30,              // separation radius between pack members, px
      jitter: 26,            // group spread around the shared spawn anchor, px
    },
    lance: {
      engage: 110,           // start the telegraph inside this player distance
      len: 118,              // beam length, px
      halfWidth: 2.5,        // beam half-width, px
      telegraph: 45,         // 0.75 s of readable warning
      pulse: 10,             // beam live time, ticks
      cooldown: 120,         // 2 s between lances — statsFor shortens this per wave
      dmg: 1,
    },
    charger: {               // ram archetype baseline — statsFor scales hp, maxSpeed, rest
      r: 9, hp: 5,
      maxSpeed: 1.6,         // seek speed — the dash, not the chase, is the threat
      steer: 0.05,
      prefer: 150,           // holds a wider ring than the darts; the lunge covers it
      band: 20,
      backSpeed: 1.2,        // retreat speed when the player crowds it
      sepR: 40,              // separation radius — the bigger body claims more room
      engage: 260,           // a rested charger plants inside this player distance
      windup: 50,            // plant ticks — the dash line locks at windup START
      dashSpeed: 7,          // px/tick along the locked line, constant across waves
      dashTicks: 26,         //   so is the duration — dodge difficulty stays fair
      rest: 90,              // tired ticks after a lunge — statsFor shortens this
      cooldown: 30,          // seek ticks before the next lunge is considered
      dmg: 1,
    },
    // The standoff carrier — the roster's RANGE axis. Its retreat speed is
    // HIGHER than its approach speed, which is the whole read: crowding a
    // harrier makes it run instead of trade, so the answer to it is to close
    // the 240 px ring, not to duel across it. It never rams by intent.
    harrier: {
      r: 8, hp: 4,
      maxSpeed: 1.3,         // approach — slower than the ship by a wide margin
      steer: 0.05,
      prefer: 240,           // the ring it holds: half the 512 px screen away
      band: 30,
      backSpeed: 1.6,        // ...and it backs off FASTER than it closes
      sepR: 46,
      engage: 270,           // dart 110, charger 260, harrier 270 — still the
                             // roster's range king, but only just: it was 320,
                             // which opened locks from off screen, and play
                             // testing read that as cheap. 270 keeps the lock
                             // inside the view in ordinary framing, and 260 is
                             // the hard floor — at or under it the charger
                             // reaches as far and the standoff identity dies.
      lockon: 45,            // 0.75 s of plant — the research's floor is ~25 ticks,
                             // the time the player needs to develop the lateral
                             // break that beats a missile; below it the first
                             // missile of every wave is an unavoidable hit
      cooldown: 150,         // ticks between launches — statsFor shortens it, floor 90
      orbDrop: 2,
    },
    // The seeker missile. speed × life = 540 px of reach, past the 512 px
    // field the owner asked it to cross, and `turn` is what keeps that speed
    // fair. The quantity that decides a dodge is NOT the turn radius — a
    // 3×-speed pursuer beats a circling target at any radius — it is the total
    // HEADING AUTHORITY the fuse can spend: (life − arm − decay/2) × turn ≈ 72°.
    // That is the number tuned, by simulating this exact loop against a player
    // holding a full-speed break, launched from every distance the harrier
    // fires at (the ring-to-engage band — 210–270 px since the engage pull-in;
    // originally tuned over 240–400, and the wave1 suite re-runs the break
    // fight over the LIVE band, so a retune here is re-proven, not assumed):
    //   turn 0.030 (108°) — the break is HIT at every range. Not minor homing.
    //   turn 0.022 ( 79°) — the break wins, with no margin.
    //   turn 0.020 ( 72°) — the break wins from a standstill too, and survives
    //                       half a second of hesitation; a HALF-committed 45°
    //                       break is still hit, and so is running away, which
    //                       is exactly the shape a homing threat should have.
    // So the counter is a committed lateral break, decided early — or, for the
    // confident, a jink held until the last 60 px, which beats it at any of
    // these values. The margin is wide enough that AFTERBURNER, which RAISES
    // the player's own turn radius as v²/a, cannot invert the fight.
    // NONE of these scale with the wave: like the charger's dashSpeed, dodge
    // difficulty stays fair forever and only the launcher's hp and cadence grow.
    missile: {
      r: 3.5, hp: 1,         // r + SHIP_R = 10.5 px of hit radius; one bullet kills it
      speed: 6.0,            // px/tick — 360 px/s, 3× the ship's top speed: running is
                             // never the answer, which is the point of a seeker
      life: 90,              // 1.5 s
      turn: 0.020,           // rad/tick — 69°/s; R = 300 px, ~20× the ship's own 16.7
      arm: 12,               // ballistic at launch: the straight opening segment is
                             // what makes the bearing readable before it bends
      decay: 30,             // steering fades linearly to 0 over the final ticks —
                             // the fuse tell and the anti-orbit fix in one
      dmg: 1,
      trail: 14,             // the trail IS the UI for the turn radius; a bare dot
                             // travelling 6 px/tick reads as a teleport
      max: 6,                // a guard, not a mechanic: 3 harriers at one missile per
                             // 150 ticks with a 90-tick life cannot reach 6 in flight
    },
    // The radar variants — the aim-attack archetypes' predictive siblings.
    // Base attacks punish a still player; a predicted attack punishes CONSTANT
    // VELOCITY, so the counter inverts: change velocity during the telegraph.
    // The prediction is latched exactly once, at telegraph/windup/lockon start
    // — the same honesty rule every base attack keeps.
    radar: {
      leadScale: 1,     // 0..1.5 — fraction of the computed lead actually taken
      deadband: 0.3,    // px/tick — below it a ship reads as still and radar aim
                        // collapses to the base bearing, so the variant is
                        // legible only through motion
      missileTurn: 0.010, // rad/tick for the RADAR missile only — the predicted
                        // launch bearing spends less of the heading budget the
                        // base 0.020 was tuned around, so this starts at half
                        // and slides to 0 (pure ballistic predictor)
    },
    // The shield — the roster's FACING axis. prefer 0 makes the shared
    // ring-hold code close forever, and maxSpeed below the ship's 2.0 means it
    // can always be escaped: its threat is that it is standing where you
    // wanted to be. engage 0 is no attack mode at all — contact is its whole
    // offense. turnRate is what makes the shield a skill check instead of a
    // wall: a player at 2.0 px/tick has angular rate 2.0/dist about the body,
    // so the player out-turns 0.015 rad/tick inside 133 px and cannot flank it
    // beyond that. Get close to get around it — and close is where its contact
    // damage lives.
    anvil: {
      r: 11, hp: 9, maxSpeed: 1.2, steer: 0.04, prefer: 0, band: 0, backSpeed: 0,
      sepR: 52, engage: 0, orbDrop: 3,
      turnRate: 0.015,       // rad/tick — 0.86°/tick, the only body that does not snap
      arc: (70 * Math.PI) / 180, // HALF-angle: a ±70° frontal shield, 140° of cover
      flee: 200,             // flanked and inside this, it thrusts along its OWN facing
                             // instead of closing — it cannot escape a 2.0 px/tick
                             // ship, so the kill is never denied; the flank just
                             // becomes a moving problem that drags across the field
    },
    // The bomb — the roster's DEATH TIME axis. No attack but contact; the
    // whole threat is the burst the player themself triggers, which is what
    // makes the kill a decision instead of a reflex.
    husk: {
      r: 13, hp: 6, maxSpeed: 0.9, steer: 0.03, prefer: 0, band: 0, backSpeed: 0,
      sepR: 58, engage: 0, orbDrop: 1,
      split: 3,              // shards dealt on a seeded fan at the death point
      kick: 2.2,             // px/tick of outward velocity on each shard
      push: 0.6,             // fraction of r each shard starts out from the centre
    },
    // The husk's payload, never a wave-schedule type: shards carry no split
    // field, so there is no recursion to bound. Faster than the player's 2.0 on
    // purpose — they must be shot, not outrun.
    shard: {
      r: 5, hp: 2, maxSpeed: 2.9, steer: 0.09, prefer: 0, band: 0, backSpeed: 0,
      sepR: 22, engage: 0, orbDrop: 1,
    },
    player: { hull: 3, invuln: 62 }, // ≈ one second of post-hit grace
    // physical ship-body contact costs the player one hull; the enemy side of
    // the same event pays BDMG (one bullet) and is paced by the CONTACTCD
    // tuner, so ramming stays a real tactic without melting a body in a
    // handful of overlapping ticks
    contact: { dmgToPlayer: 1 },
    orb: { r: 3, drift: 1.1, damp: 0.94, attract: 72, pull: 0.55, vmax: 7, pickup: 12,
           clearPull: 3, clearVmax: 24 }, // the cleared-banner sweep: pull/speed strong
                                          // enough to bank any orb in the world within
                                          // the clearHold window, so a wave's income is
                                          // fully in the wallet before its shop opens
    spawnGap: 48,            // px outside the camera rectangle
    minPlayerDist: 90,       // an enemy never appears closer to the player
    clearHold: 210,          // ticks the WAVE CLEAR banner holds
  };

  // The post-wave shop catalog — data-driven rows, so THRUST RING and BLAST
  // CHARGE both appended without touching buy() or the overlay's own drawing
  // (only the grid it lays six cards out on).
  // Each row is pure data plus two closures: `curve` prices it ("double" is
  // base × 2^owned, "flat" never moves — both owner decisions), `cap` is an
  // optional hard rank ceiling (rendered MAXED), and `can` is an optional
  // availability predicate (HULL PATCH leaves the shelf at the LIVE max
  // hull, so Math.min can never silently eat a paid repair). Purchase
  // COUNTS live on E.owned, never on this const: restart() resets state
  // field by field and deliberately never touches this array.
  //
  // Two presentation fields since the shop became a mouse UI. `icon` is the
  // 192 px PNG under assets/ui/upgrades/ that fills the card — a row without
  // one draws the stroked placeholder, so an unshipped asset costs a picture
  // and never a card. `card` marks a row that ALSO carries a big explainer
  // bitmap, popped up while the pointer rests on it; game.js owns that asset.
  //
  // apply() takes the row's rank AFTER the sale (1 for the first purchase),
  // so a row can price its effect off the rank instead of compounding a
  // multiplier it can never re-derive. RAPID LOADER is the row that needs it.
  const SHOP = [
    // Fire rate is ADDITIVE in the rate, not multiplicative in the cooldown:
    // each rank adds 15% of the BASE rate, so rank n fires at (1 + 0.15n)× and
    // the cap-5 ceiling is 1.75×, not the 5.95× a compounding −30% reached.
    // (The step was 50%, then 25%; play testing kept reading each buy as too
    // large a jump.) Setting mods.cool absolutely (never *=) is what makes
    // that re-derivable from the rank alone.
    { name: "RAPID LOADER", desc: "fire rate +15% of base per rank", base: 4, curve: "double", cap: 5,
      icon: "rapid-loader.png",
      apply: (rank) => { mods.cool = 1 / (1 + 0.15 * rank); } }, // cap 5: past it the
                                            // quantized cooldown outruns the BMAX live-bullet budget
    { name: "AFTERBURNER", desc: "max speed +1.0 px/tick", base: 4, curve: "double",
      icon: "afterburner.png",
      apply: () => { mods.speed += 1; } },  // uncapped — the doubling price is the brake
    { name: "HULL PATCH", desc: "repair 1 hull", base: 6, curve: "flat",
      icon: "hull-patch.png",
      can: () => E.hull < E.hullMax,        // a consumable, flat by design: an escalating
      apply: () => { E.hull = Math.min(E.hullMax, E.hull + 1); } }, // repair price is a
                                            // death spiral aimed at the player already losing
    { name: "MAX HULL", desc: "max hull +1, granted filled", base: 8, curve: "double",
      icon: "max-hull.png",
      apply: () => { E.hullMax += 1; E.hull += 1; } }, // raises the LIVE cap the pips and
                                            // HULL PATCH read, and fills the new point
    // One-time, and priced at exactly wave 2's income. cap 1 is what makes it
    // one-time: shopMaxed() refuses the second sale and the row renders MAXED.
    // The pre-purchase scheme is complete and playable (hold right and the
    // mouse flies the ship), so this is a comfort unlock, not a rescue — it
    // buys thrust without holding a button, while the visible cursor keeps
    // aiming. `card` is what pops its explainer up on hover — the one row
    // whose contract is nine keys and cannot be said in a caption.
    { name: "THRUST RING", desc: "qweasdzxc keys thrust", base: 8, curve: "flat", cap: 1,
      icon: "thrust-ring.png", card: true, apply: () => { mods.keyThrust = true; } },
    // Three ranks at 8/16/32 — the doubling curve, and a cap that makes rank 3
    // read MAXED. Each rank widens the splash by the BLASTGAIN slider; the
    // damage itself never scales, so the row buys reach, not raw output.
    { name: "BLAST CHARGE", desc: "shots splash 1 damage nearby", base: 8, curve: "double", cap: 3,
      icon: "blast-charge.png",
      apply: () => { mods.blast += 1; } },
  ];

  // The card art, one record per row, on the same asynchronous contract
  // game.js's two explainer bitmaps run: the record opens not-ready, the load
  // handler asks for exactly one repaint and touches nothing else, and a row
  // whose bytes never arrive draws the placeholder forever. A frozen shop
  // keeps the loop running, so the repaint only matters for a PAUSED page.
  const ICON_DIR = "assets/ui/upgrades/";
  const ICONS = SHOP.map((row) => {
    if (!row.icon) return null;
    const rec = { img: new Image(), ok: false };
    rec.img.addEventListener("load", () => { rec.ok = true; render(); });
    rec.img.src = ICON_DIR + row.icon;
    return rec;
  });

  // upgrade terms — game.js consults these in fire() and at the top-speed
  // clamp, so the tuner values themselves never change and a restart leaves
  // every slider alone. cool is a multiplier on BCOOL; speed is ADDITIVE
  // px/tick on top of VMAX, repeatable and uncapped by design (the shop's
  // doubling price curve is what brakes it, not a ceiling here).
  // restart() resets these field by field — add the reset with the field.
  // keyThrust is the THRUST RING unlock, read by game.js's step() (and by its
  // pause copy) LAZILY and permissively: `!== false` is the test, so a page
  // without an encounter thrusts freely. It dies with the run like every other
  // purchase — an 8 XP buy must never become a permanent meta-unlock.
  // blast is the BLAST CHARGE rank, 0-3: 0 is off, and the radius every rank
  // above it reaches is BLASTR + BLASTGAIN × (rank − 1) off game.js's sliders.
  const mods = { cool: 1, speed: 0, keyThrust: false, blast: 0 };

  // ---- seeded RNG — the only randomness in the encounter -----------------
  function mulberry32(seed) {
    let a = seed >>> 0;
    // the generator's whole state is `a`; the harness hashes it so a trace can
    // prove the stream is where it was, not merely that the same values came out
    const f = () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.state = () => a >>> 0;
    return f;
  }
  let rand = mulberry32(ECFG.seed);

  // ---- the simulation event stream ---------------------------------------
  // One simulation event. The simulation produces these and never touches
  // audio. `kind` is the cue name Sfx already understands. `at` is the world
  // point the cue pans from, or null for a cue with no position. `gain` is
  // the 0..1 volume the call site computed, or undefined to let Sfx decide.
  // { kind: string, at: {x, y} | null, gain?: number }
  //
  // The queue retires a whole class of bug rather than defending against it:
  // a cue used to be a call INTO the audio layer from inside the step path,
  // one edit away from consuming rand() between two seeded draws. An emit
  // writes one plain object and reads nothing — no clock, no rand(), no
  // allocation beyond the event — so the audio path can no longer sit
  // between rand() calls at all. The presentation side drains the queue
  // after step() returns, in order, on the same tick.
  const EVENTS = [];
  // the only way in. `at` may be a live entity — x and y are copied out
  // rather than the entity retained, because a body can be reaped between
  // the push and the drain.
  function emit(kind, at, gain) {
    EVENTS.push({ kind, at: at ? { x: at.x, y: at.y } : null, gain });
  }
  // Ordered: index 0 fired first. events() is a readonly view of the events
  // queued this tick; drainEvents() hands them over and clears the queue.
  const events = () => EVENTS;
  const drainEvents = () => EVENTS.splice(0);

  // ---- entity identity ----------------------------------------------------
  // A plain monotonic counter, never a rand() draw — a draw here would shift
  // the seeded stream and re-deal every wave in the game. restart() resets it
  // so a seeded run reproduces its ids exactly, which is what lets a golden
  // trace assert on them at all. One id space across enemies, missiles, orbs,
  // shards AND game.js's bullets — a replication layer keys by id alone and
  // cannot disambiguate by owning array. An id is never reused: shards take
  // fresh ids and the dead husk's id retires with it.
  let nextEntityId = 1;
  const nextId = () => nextEntityId++;

  // ---- wave scaling — pure functions of the wave number ------------------
  // countsFor/statsFor/waveGroups read only ECFG constants: the same wave
  // number always deals the same schedule and the same stats. startWave
  // resolves statsFor ONCE into E.stats and spawnEnemy stamps that object
  // onto each body, so nothing reads a mutated global mid-wave.
  // One new idea per wave with a wave of air between it and the last: W1
  // darts alone (untouched), W2 the harrier — the first ranged threat, by
  // itself, against a schedule the player has already learned — W3 the
  // charger, W4 the husk, W5 the anvil. Every archetype debuts as a SINGLE
  // body, so its behavior is legible before it is multiplied.
  function countsFor(wave) {
    return {
      darts: Math.min(5 + 2 * (wave - 1), 21),
      chargers: wave >= 3 ? Math.min(1 + Math.floor((wave - 3) / 2), 4) : 0,
      harriers: wave >= 2 ? Math.min(1 + Math.floor((wave - 2) / 3), 3) : 0,
      husks: wave >= 4 ? Math.min(1 + Math.floor((wave - 4) / 4), 2) : 0,
      anvils: wave >= 5 ? Math.min(1 + Math.floor((wave - 5) / 4), 2) : 0,
      // the radar variants seed SPARSELY, each two waves after its parent has
      // taught the base read: the lead is only legible against the aim it varies
      radarDarts: wave >= 2 ? Math.min(1 + Math.floor((wave - 2) / 3), 3) : 0,
      radarHarriers: wave >= 4 ? Math.min(1 + Math.floor((wave - 4) / 4), 2) : 0,
      radarChargers: wave >= 5 ? Math.min(1 + Math.floor((wave - 5) / 4), 2) : 0,
    };
  }

  // The one rotation the whole file REPORTS types by: snapState's byType and
  // the state hash both walk it, so its order is a committed contract and the
  // radar single stays beside its parent here. shard is absent on purpose — it
  // is the husk's payload, never scheduled.
  const ROTATION = ["dart", "harrier", "radarHarrier", "charger", "radarCharger", "husk", "anvil"];
  // The DEAL order is a separate question, and the answer is not the report
  // order. A wave interleaves its ordinary archetypes through the body of the
  // schedule and CLOSES on the radar variants: the player reads what each
  // archetype does first, then meets the sibling that leads its shot as the
  // wave's last beat. The two radar heavies alternate so a pair never lands
  // back to back, and the radarDart rides the LAST dart packs (see waveGroups).
  const DEALFIRST = ["dart", "harrier", "charger", "husk", "anvil"];
  const DEALLAST = ["radarHarrier", "radarCharger"];
  // ...and the full roster, which is the rotation plus the bodies that are
  // never their own scheduled group: the husk's shard payload, and the
  // radarDart, which replaces a member inside a dart pack. This is the
  // membership test spawnEnemy uses, so an unknown name can never reach
  // E.stats through the prototype chain.
  const ROSTER = ROTATION.concat("shard", "radarDart");

  function statsFor(wave) {
    const hpBonus = Math.min(Math.floor((wave - 1) / 3), 4); // +1 hull every third wave, capped
    const mul = Math.min(1 + 0.08 * (wave - 1), 2); // shared speed multiplier — the cap doubles the base
    // the parent entries resolve first as consts, so the radar variants below
    // can derive from them instead of re-stating a curve they must never drift from
    const dart = {
        r: ECFG.enemy.r,
        hp: ECFG.enemy.hp + hpBonus, // 2..6 — the hpBonus cap bounds it
        maxSpeed: ECFG.enemy.maxSpeed * mul, // 2.4..4.8
        steer: ECFG.enemy.steer, prefer: ECFG.enemy.prefer, band: ECFG.enemy.band,
        backSpeed: ECFG.enemy.backSpeed, sepR: ECFG.enemy.sepR,
        cooldown: Math.max(72, Math.round(ECFG.lance.cooldown * Math.pow(0.95, wave - 1))),
        engage: ECFG.lance.engage, // every type carries an engage, 0 meaning "no attack
                                   // mode" — that is what lets stepEnemy ask P.engage
                                   // instead of type-testing for a range
        orbDrop: 1, // a dart still drops exactly one orb at every wave
    };
    const charger = {
        r: ECFG.charger.r,
        hp: ECFG.charger.hp + hpBonus,
        maxSpeed: ECFG.charger.maxSpeed * mul,
        steer: ECFG.charger.steer, prefer: ECFG.charger.prefer, band: ECFG.charger.band,
        backSpeed: ECFG.charger.backSpeed, sepR: ECFG.charger.sepR,
        rest: Math.max(54, Math.round(ECFG.charger.rest * Math.pow(0.95, wave - 1))),
        engage: ECFG.charger.engage,
        orbDrop: 2, // the heavier body pays out double
    };
    // the same two scaling rules as above — hp + hpBonus, maxSpeed × mul —
      // govern the whole roster, so no type ever needs its own curve. The
      // launcher's CADENCE shortens on the dart's 0.95^(wave-1) curve; the
      // missile it fires does not scale at all (see ECFG.missile).
      // The three new archetypes scale in HP and CADENCE only — their speeds
      // are wave-invariant, on the same rule the shard and the missile follow
      // and for the same reason the charger's dashSpeed never moved: a speed
      // that a fairness claim rests on must not expire. Each of these three
      // makes such a claim. The harrier's whole read is that it flees FASTER
      // than it closes (crowd it and it runs), and the shared multiplier scales
      // maxSpeed while leaving backSpeed alone, so the kite would invert at wave 4
      // and the body would outrun the ship at wave 10. The anvil promises you
      // can always walk away from it; at 1.2 × mul it out-paces a 2.0 px/tick
      // ship from wave 10 and becomes a shielded body you cannot escape OR
      // shoot from the front. The dart and the charger still carry the roster's
      // speed escalation, exactly as they always did — that curve is untouched.
    const harrier = {
        r: ECFG.harrier.r,
        hp: ECFG.harrier.hp + hpBonus,
        maxSpeed: ECFG.harrier.maxSpeed, // invariant — see above
        steer: ECFG.harrier.steer, prefer: ECFG.harrier.prefer, band: ECFG.harrier.band,
        backSpeed: ECFG.harrier.backSpeed, sepR: ECFG.harrier.sepR,
        engage: ECFG.harrier.engage,
        cooldown: Math.max(90, Math.round(ECFG.harrier.cooldown * Math.pow(0.95, wave - 1))),
        orbDrop: ECFG.harrier.orbDrop,
    };
    return {
      dart, charger, harrier,
      // The radar variants: the SAME body — every stat the parent resolved,
      // by reference to the const above, never re-derived — except orbDrop
      // (+1, the smarter aim pays a little more) and the two markers behavior
      // code reads. `base` is how shared code resolves the archetype; `radar`
      // is the aim switch. No hp or speed bump on purpose: the threat must be
      // the aim, and a stat bump would blur that read.
      radarDart: { ...dart, orbDrop: dart.orbDrop + 1, radar: true, base: "dart" },
      radarCharger: { ...charger, orbDrop: charger.orbDrop + 1, radar: true, base: "charger" },
      radarHarrier: { ...harrier, orbDrop: harrier.orbDrop + 1, radar: true, base: "harrier" },
      anvil: {
        r: ECFG.anvil.r,
        hp: ECFG.anvil.hp + hpBonus,
        maxSpeed: ECFG.anvil.maxSpeed, // invariant — 1.2 stays well under the ship's
                                       // 2.0 forever, which is the promise the whole
                                       // archetype rests on: you can always leave
        steer: ECFG.anvil.steer, prefer: ECFG.anvil.prefer, band: ECFG.anvil.band,
        backSpeed: ECFG.anvil.backSpeed, sepR: ECFG.anvil.sepR,
        engage: ECFG.anvil.engage, // 0 — contact is its whole offense
        turnRate: ECFG.anvil.turnRate, // the presence of this field is what makes a
        arc: ECFG.anvil.arc,           // body turn instead of snap, and carry a shield
        flee: ECFG.anvil.flee,
        orbDrop: ECFG.anvil.orbDrop,
      },
      husk: {
        r: ECFG.husk.r,
        hp: ECFG.husk.hp + hpBonus,
        maxSpeed: ECFG.husk.maxSpeed, // invariant — the husk's threat is the burst,
                                      // and choosing WHERE to pop it is only a choice
                                      // while the drifter is slower than the ship
        steer: ECFG.husk.steer, prefer: ECFG.husk.prefer, band: ECFG.husk.band,
        backSpeed: ECFG.husk.backSpeed, sepR: ECFG.husk.sepR,
        engage: ECFG.husk.engage,
        split: ECFG.husk.split, // the presence of this field is what makes a body burst
        orbDrop: ECFG.husk.orbDrop,
      },
      // shards come from statsFor too, so a husk that dies on wave 9 bursts
      // into wave-9 shards — scaled in hp, deliberately NOT in speed: the
      // charger's dashSpeed set the precedent that a dodge stays fair forever.
      shard: {
        r: ECFG.shard.r,
        hp: ECFG.shard.hp + hpBonus,
        maxSpeed: ECFG.shard.maxSpeed,
        steer: ECFG.shard.steer, prefer: ECFG.shard.prefer, band: ECFG.shard.band,
        backSpeed: ECFG.shard.backSpeed, sepR: ECFG.shard.sepR,
        engage: ECFG.shard.engage,
        orbDrop: ECFG.shard.orbDrop,
      },
    };
  }

  // The spawn queue for a wave, in wave ticks (60 Hz). Wave 1 is the
  // hand-tuned slice schedule, byte-identical to the original vertical
  // slice; later waves split their dart count into packs of three, land every
  // heavy alone, and INTERLEAVE the queues so a wave is a composition rather
  // than "all the darts, then all the heavies" — difficulty here comes from
  // what stands beside what, not from any single body. The interleave is a
  // pure function of the counts, so a wave still deals identically every run.
  function waveGroups(wave) {
    if (wave === 1) {
      return [
        { count: 3, type: "dart", warnAt: 36, spawnAt: 126 },   // warn at 0.6 s, land at 2.1 s
        { count: 2, type: "dart", warnAt: 810, spawnAt: 900 },  // second pack warns at 13.5 s, lands at 15 s
      ];
    }
    const n = countsFor(wave);
    const queues = { dart: [], harrier: [], radarHarrier: [], charger: [], radarCharger: [], husk: [], anvil: [] };
    for (let left = n.darts; left > 0; left -= 3) queues.dart.push({ count: Math.min(3, left), type: "dart" });
    for (let i = 0; i < n.harriers; i++) queues.harrier.push({ count: 1, type: "harrier" });
    for (let i = 0; i < n.chargers; i++) queues.charger.push({ count: 1, type: "charger" });
    for (let i = 0; i < n.husks; i++) queues.husk.push({ count: 1, type: "husk" });
    for (let i = 0; i < n.anvils; i++) queues.anvil.push({ count: 1, type: "anvil" });
    // the radar heavies land as singles like their parents; the radarDart is
    // never its own group — the LAST packs each carry ONE, as member 0, so the
    // body wearing the cyan ring leads a pack the player meets late in the
    // wave. Deterministic, and no rand() consumed.
    for (let i = 0; i < n.radarHarriers; i++) queues.radarHarrier.push({ count: 1, type: "radarHarrier" });
    for (let i = 0; i < n.radarChargers; i++) queues.radarCharger.push({ count: 1, type: "radarCharger" });
    for (let i = 0; i < Math.min(n.radarDarts, queues.dart.length); i++) {
      queues.dart[queues.dart.length - 1 - i].radar = 1;
    }
    // round-robin over the ordinary types, one group per non-empty queue per
    // pass. The total bounds the loop, so a queue running dry can never spin it.
    const total = DEALFIRST.reduce((s, t) => s + queues[t].length, 0);
    const groups = [];
    for (let pass = 0; groups.length < total; pass++) {
      for (const t of DEALFIRST) if (queues[t][pass]) groups.push(queues[t][pass]);
    }
    // ...then the radar tail closes the wave, alternating between the two
    // heavies. Same round-robin, same determinism — a different queue set.
    const tail = DEALLAST.reduce((s, t) => s + queues[t].length, 0);
    for (let pass = 0; groups.length < total + tail; pass++) {
      for (const t of DEALLAST) if (queues[t][pass]) groups.push(queues[t][pass]);
    }
    // the pitch bounds a wave's LENGTH as its group count grows: few groups
    // keep today's exact 5 s spacing, while an 18-group late wave tightens to
    // 2.5 s instead of running a minute and a half. The 90-tick warning and
    // the 126-tick first-spawn offset are untouched.
    const pitch = Math.max(150, Math.min(300, Math.round(1800 / groups.length)));
    return groups.map((g, k) => ({ count: g.count, type: g.type, radar: g.radar, warnAt: 126 + pitch * k - 90, spawnAt: 126 + pitch * k }));
  }

  // ---- encounter state ---------------------------------------------------
  const E = {
    state: "idle", // idle | warning | active | cleared | shop | dead
    wave: 1,
    waveTick: 0,
    groups: [],
    stats: null,   // this wave's resolved statsFor object — startWave deals it
    enemies: [],
    missiles: [], // live seeker missiles — a projectile family the encounter owns
                  // outright, wholly separate from G.bullets
    orbs: [],
    hull: ECFG.player.hull,
    hullMax: ECFG.player.hull,   // the LIVE max — MAX HULL purchases raise it, and the
                                 // HUD pips and HULL PATCH offer read it, never the const
    xp: 0,                       // the wallet — uncapped, spent in the shop, dies with the run
    owned: SHOP.map(() => 0),    // per-row purchase counts, parallel to SHOP — restart() re-deals it
    shopHover: -1,               // the shop card under the pointer, or -1 — the ONE piece of
                                 // shop input state, read by the draw, the detail line and the
                                 // hover art alike, so they cannot disagree inside a frame
    shopBtn: false,              // ...and the NEXT WAVE button under it; never both at once
    invuln: 0,
    hitFlash: 0,
    clearTick: 0,
    shipPrev: null, // the ship's previous-tick position — the lance sweep samples it
    kills: 0,
    missilesShot: 0, // missiles a player bullet destroyed — NOT a kill: no orb, no XP,
                     // and deliberately outside E.kills so the kill count stays a
                     // count of bodies
    hitsDealt: 0,  // bullet hits on enemies
    hitsTaken: 0,  // lance/dash/contact hits on the player
    contactsDealt: 0, // contact events that damaged an enemy body
  };

  // "cleared" must NOT freeze: encStep's early return would then never let
  // E.waveTick advance past E.clearTick, and the banner would hold forever
  const frozen = () => E.state === "shop" || E.state === "dead";
  const queuedCount = () => E.groups.reduce((n, g) => n + (g.spawned ? 0 : g.count), 0);
  const shopCost = (i) => SHOP[i].curve === "double" ? SHOP[i].base * Math.pow(2, E.owned[i]) : SHOP[i].base;
  const shopMaxed = (i) => SHOP[i].cap !== undefined && E.owned[i] >= SHOP[i].cap;
  // is the shop taking input right now? A PAUSED shop is not: the pause menu
  // owns that screen — the overlay stands down and the pointer belongs to the
  // menu's buttons — and resume() brings the shop back exactly as it was left.
  const shopOpen = () => E.state === "shop" && G.running;
  // ...and the shop SCREEN, paused or live. shopOpen() answers "is it taking
  // input"; this answers "is it the screen", which is the question the pointer
  // lock has to ask instead. A paused shop is still the screen the resume
  // lands back on, so a lock grabbed over the pause menu — an invert-off right
  // release does exactly that — would ride straight into a menu that has no
  // cursor to click it with.
  const shopScreen = () => E.state === "shop";

  function clampWorld(x, y, r) {
    const m = (r || ECFG.enemy.r) + 1;
    return { x: Math.max(m, Math.min(WW - m, x)), y: Math.max(m, Math.min(WH - m, y)) };
  }

  // swept segment-to-circle test — closest point on (x1,y1)-(x2,y2) to the
  // circle center; even a 40 px/tick bullet cannot tunnel through a body
  function segCircleHit(x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((cx - x1) * dx + (cy - y1) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + t * dx - cx;
    const py = y1 + t * dy - cy;
    return px * px + py * py <= r * r;
  }

  // entry parameter of the segment into the inflated circle: 0..1, or -1 on
  // a miss — bullet hits resolve against the FIRST body along the path
  function segCircleEntryT(x1, y1, x2, y2, cx, cy, r) {
    const fx = x1 - cx;
    const fy = y1 - cy;
    const c = fx * fx + fy * fy - r * r;
    if (c <= 0) return 0; // the segment starts inside the body
    const dx = x2 - x1;
    const dy = y2 - y1;
    const a = dx * dx + dy * dy;
    if (!a) return -1;
    const b = 2 * (fx * dx + fy * dy);
    let disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    disc = Math.sqrt(disc);
    const t = (-b - disc) / (2 * a);
    return t >= 0 && t <= 1 ? t : -1;
  }

  // signed difference between two bearings, always in (−π, π]. atan2 of the
  // sine and cosine rather than subtract-and-wrap: there is no ±π seam to get
  // wrong, which is where the single most common heading bug lives. The
  // anvil's facing and its shield arc both read this.
  function angDiff(a, b) {
    const d = a - b;
    return Math.atan2(Math.sin(d), Math.cos(d));
  }

  // Predicted-intercept aim for a radar body: advance the ship through the
  // attack's fixed delay, then (for a real projectile) solve the intercept
  // quadratic |rel + vel·t| = speed·t and take the smallest positive root.
  // Falls back to the pure-pursuit time when no positive root exists (a
  // faster-than-projectile or receding ship). Pure arithmetic on live state —
  // no rand(), no clock — and clamped into the world so a lead can never
  // point at a spot the ship cannot occupy.
  function predictAim(e, delayTicks, projSpeed) {
    const R = ECFG.radar;
    let vx = G.vel.x, vy = G.vel.y;
    if (Math.hypot(vx, vy) < R.deadband) { vx = 0; vy = 0; }
    vx *= R.leadScale; vy *= R.leadScale;
    let tx = G.ship.x + vx * delayTicks;
    let ty = G.ship.y + vy * delayTicks;
    if (projSpeed > 0 && (vx || vy)) {
      const rx = tx - e.x, ry = ty - e.y;
      const a = vx * vx + vy * vy - projSpeed * projSpeed;
      const b = 2 * (rx * vx + ry * vy);
      const c = rx * rx + ry * ry;
      let t = -1;
      if (Math.abs(a) < 1e-9) { if (b < 0) t = -c / b; }
      else {
        const disc = b * b - 4 * a * c;
        if (disc >= 0) {
          const sq = Math.sqrt(disc);
          const t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
          t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
        }
      }
      if (!(t > 0)) t = Math.hypot(rx, ry) / projSpeed; // pure-pursuit fallback
      tx += vx * t; ty += vy * t;
    }
    tx = Math.max(SHIP_R, Math.min(WW - SHIP_R, tx));
    ty = Math.max(SHIP_R, Math.min(WH - SHIP_R, ty));
    return { a: Math.atan2(ty - e.y, tx - e.x), x: tx, y: ty };
  }

  // ---- spawning ----------------------------------------------------------
  // One anchor per group, dealt on an edge of the CURRENT camera rectangle,
  // spawnGap px outside it, clamped into the world and held off the player.
  function rollAnchor() {
    const gap = ECFG.spawnGap;
    for (let tries = 0; tries < 24; tries++) {
      const edge = Math.floor(rand() * 4);
      const t = rand();
      let x, y;
      if (edge === 0) { x = cam.x - gap; y = cam.y + t * FH; }
      else if (edge === 1) { x = cam.x + FW + gap; y = cam.y + t * FH; }
      else if (edge === 2) { x = cam.x + t * FW; y = cam.y - gap; }
      else { x = cam.x + t * FW; y = cam.y + FH + gap; }
      const c = clampWorld(x, y);
      // a camera pinned against a world wall clamps this edge's candidate
      // back INTO the view — reject it, another edge always has room
      const onScreen = c.x > cam.x && c.x < cam.x + FW && c.y > cam.y && c.y < cam.y + FH;
      if (!onScreen && Math.hypot(c.x - G.ship.x, c.y - G.ship.y) >= ECFG.minPlayerDist + ECFG.enemy.jitter) return c;
    }
    return clampWorld(G.ship.x + ECFG.minPlayerDist + ECFG.enemy.jitter + ECFG.spawnGap, G.ship.y);
  }

  function rollGroupPoints(count) {
    const anchor = rollAnchor();
    const pts = [];
    for (let i = 0; i < count; i++) {
      const p = clampWorld(anchor.x + (rand() * 2 - 1) * ECFG.enemy.jitter,
                           anchor.y + (rand() * 2 - 1) * ECFG.enemy.jitter);
      pts.push(p);
    }
    return { anchor, pts };
  }

  // The ONE body constructor. spawnEnemy runs it after the scheduled push-out;
  // the husk's split runs it directly, because a burst is not a spawn.
  function makeBody(x, y, kind, i, vx, vy) {
    const st = E.stats[kind];
    E.enemies.push({
      id: nextId(), // identity, not simulation state — the hash allow-list ignores it
      x, y, vx: vx || 0, vy: vy || 0, r: st.r, hp: st.hp, type: kind,
      stats: st,      // the resolved per-wave stats ride on the body — a live
                      // enemy keeps them even after the wave clock moves on
      orbDrop: st.orbDrop,
      mode: "seek", // seek | tele | pulse (dart) — seek | windup | dash | tired
                    // (charger) — seek | lockon (harrier); the shieldless drifters
                    // and the shards never leave seek at all
      cd: 30 + (i || 0) * 24, // staggered first attacks — the pack never sync-fires
      t: 0,
      // a body that TURNS instead of snapping (the anvil) must not open the
      // fight facing +x while its shield is what the player has to read, so it
      // is dealt already looking at the ship; everything else overwrites face
      // on its first seek tick anyway and keeps the old 0
      face: st.turnRate ? Math.atan2(G.ship.y - y, G.ship.x - x) : 0,
      lockA: 0, flash: 0, pulseHit: false, dashHit: false,
      predT: 0, // ticks left on a radar latch's ping at (predX, predY) — drawing only
      contactCd: 0, // ticks left before this body can take contact damage again
      contactTaken: false, // this body already paid a contact THIS tick — cleared in stepEnemy
    });
  }

  function spawnEnemy(x, y, i, type) {
    // an unnamed or unknown type is a dart, which is what keeps every 3-arg
    // call in the suites and in this file spawning exactly what it always did.
    // Membership is tested against the ROSTER, never with a bare `E.stats[type]`
    // read: that read walks Object.prototype, so "constructor", "toString" and
    // "__proto__" would all answer truthy and stamp a body whose hp, r and
    // steer are undefined — NaN coordinates on the next tick and a phantom kill
    // on the one after. Production only ever passes a roster name; the __test
    // hook is open to anything.
    const kind = ROSTER.includes(type) ? type : "dart";
    const st = E.stats[kind];
    // never on the player — push out to the minimum ring if needed
    let dx = x - G.ship.x;
    let dy = y - G.ship.y;
    let d = Math.hypot(dx, dy);
    if (d < ECFG.minPlayerDist) {
      if (d < 0.001) { dx = 1; dy = 0; d = 1; }
      const c = clampWorld(G.ship.x + (dx / d) * ECFG.minPlayerDist,
                           G.ship.y + (dy / d) * ECFG.minPlayerDist, st.r);
      x = c.x;
      y = c.y;
    }
    makeBody(x, y, kind, i);
  }

  function spawnGroup(g) {
    if (!g.points) g.points = rollGroupPoints(g.count);
    // a radar-stamped pack deals its variant as member 0 — the pack leader
    // wearing the cyan ring is the first thing the pack shows
    g.points.pts.forEach((p, i) => spawnEnemy(p.x, p.y, i, g.radar && i === 0 ? "radarDart" : g.type));
  }

  // ---- combat ------------------------------------------------------------
  function hitPlayer(dmg) {
    if (E.invuln > 0 || E.state === "dead") return false;
    E.hull -= dmg;
    E.hitsTaken++;
    E.invuln = ECFG.player.invuln;
    E.hitFlash = 20;
    if (E.hull <= 0) {
      E.hull = 0;
      E.state = "dead"; // game step() freezes on the next tick; R restarts
    }
    // one cue per REGISTERED hit — the invuln early return above keeps graced
    // hits silent for free. The branch reads the state the block above just
    // settled, so the killing blow plays death alone, never hurt-then-death.
    emit(E.state === "dead" ? "death" : "hurt");
    return true;
  }

  // One mutual contact event — the single primitive every physical ship-body
  // touch routes through (the generic overlap sweep and the charger's dash
  // connect alike; the lance is a beam, not a body, and stays a bare
  // hitPlayer). The two sides are gated INDEPENDENTLY: the player side keeps
  // the i-frame rules inside hitPlayer, while the enemy side pays one bullet
  // (BDMG) whenever its own contact cooldown has expired. That is deliberate —
  // an i-framed ram still bites every body it sweeps through, which is the
  // point of a melee tactic; CONTACTCD, not the gate structure, is the knob
  // that paces it, and no caller may hang the PLAYER side off the body's
  // cooldown — that would make an enemy-facing slider a hidden invulnerability.
  // The enemy side is claimed per tick as well as per window: contactCd alone
  // cannot mark the claim, because CONTACTCD is dialable to 0 and a 0 stamp is
  // indistinguishable from "free", which would let a dash connect bill itself
  // twice on one tick (stepEnemy's dash sweep, then resolveContacts).
  // Returns whether the PLAYER took the hit, so the dash's one-hit-per-lunge
  // flag keeps its exact old meaning.
  function contactEvent(e, dmgToPlayer) {
    const playerHit = hitPlayer(dmgToPlayer);
    if (e.contactCd <= 0 && !e.contactTaken) {
      e.hp -= BDMG;
      e.flash = 8; // the same hit feedback a bullet gives
      e.contactCd = CONTACTCD;
      e.contactTaken = true; // one contact per body per tick, at every slider value
      E.contactsDealt++;
      // visual only — the burst sits on the body's surface facing the ship and
      // rides game.js's own hash stream, never the sim's seeded rand()
      const cdx = e.x - G.ship.x;
      const cdy = e.y - G.ship.y;
      const cm = Math.hypot(cdx, cdy) || 1;
      spawnImpactFx(e.x - (cdx / cm) * e.r, e.y - (cdy / cm) * e.r, cdx / cm, cdy / cm, "enemy");
      // inside the claim block on purpose: the claim IS the damage edge, so a
      // sustained overlap sounds once per CONTACTCD window, never per tick
      emit("hit", e);
    }
    return playerHit;
  }

  function stepEnemy(e) {
    const P = e.stats;       // stamped at spawn — never a mutated mid-wave global
    const L = ECFG.lance;    // beam geometry — unchanged at every wave
    const CH = ECFG.charger; // lunge geometry — likewise constant
    const dx = G.ship.x - e.x;
    const dy = G.ship.y - e.y;
    const dist = Math.hypot(dx, dy) || 0.001;
    const ux = dx / dist;
    const uy = dy / dist;
    if (e.flash > 0) e.flash--;
    if (e.predT > 0) e.predT--; // the ping fades on the sim clock, like flash —
                                // the draw path never mutates it
    if (e.contactCd > 0) e.contactCd--;
    e.contactTaken = false; // a fresh tick — this body's contact is unclaimed again
    if (e.mode === "seek") {
      const aim = Math.atan2(dy, dx);
      // a body carrying a turnRate ROTATES toward the player at that rate — it
      // is the one thing that makes a directional shield a skill check instead
      // of a wall — and everything else snaps, exactly as it always has
      e.face = P.turnRate ? e.face + Math.max(-P.turnRate, Math.min(P.turnRate, angDiff(aim, e.face))) : aim;
      // hold the preferred ring: approach outside it, back off inside it
      let tx = 0;
      let ty = 0;
      if (dist > P.prefer + P.band) { tx = ux * P.maxSpeed; ty = uy * P.maxSpeed; }
      else if (dist < P.prefer - P.band) { tx = -ux * P.backSpeed; ty = -uy * P.backSpeed; }
      // ...unless it has been FLANKED: a shielded body whose armored face has
      // been walked around thrusts along its OWN heading, forward and away,
      // instead of closing. It cannot escape a 2.0 px/tick ship, so this never
      // denies the kill — it keeps the flank a moving problem and drags the
      // fight across the field, into whatever else the wave dealt.
      if (P.flee > 0 && dist < P.flee && Math.abs(angDiff(aim, e.face)) > P.arc) {
        tx = Math.cos(e.face) * P.maxSpeed;
        ty = Math.sin(e.face) * P.maxSpeed;
      }
      // separation — the pack crowds apart instead of stacking
      for (const o of E.enemies) {
        if (o === e || o.hp <= 0) continue;
        const sx = e.x - o.x;
        const sy = e.y - o.y;
        const sd = Math.hypot(sx, sy) || 0.001;
        if (sd < P.sepR) {
          const w = (1 - sd / P.sepR) * P.maxSpeed;
          tx += (sx / sd) * w;
          ty += (sy / sd) * w;
        }
      }
      // the cap is the FASTER of the two gaits, not the approach one: the
      // harrier is the first body that retreats quicker than it closes, and a
      // flat maxSpeed cap would silently delete exactly the behavior that makes
      // it a kiter. Every body whose backSpeed is the slower of the two — dart
      // and charger both — sees the identical number it always saw.
      const cap = Math.max(P.maxSpeed, P.backSpeed);
      const tm = Math.hypot(tx, ty);
      if (tm > cap) { tx *= cap / tm; ty *= cap / tm; }
      e.vx += (tx - e.vx) * P.steer;
      e.vy += (ty - e.vy) * P.steer;
      if (e.cd > 0) e.cd--;
      // the range comes off the body's own stats — dart 110, charger 260,
      // harrier 270 — and a type whose engage is 0 (the anvil, the husk, the
      // shards) has no attack mode to enter at any distance
      else if (P.engage > 0 && dist <= P.engage) {
        // a radar variant behaves as its base archetype everywhere but the
        // latch itself: the bearing points at the predicted intercept instead
        // of the ship, computed ONCE, right here — never re-aimed during the
        // telegraph, the same honesty every base attack keeps
        const kin = P.base || e.type;
        const latch = (delay, projSpeed) => {
          if (P.radar) {
            const pr = predictAim(e, delay, projSpeed);
            e.lockA = pr.a;
            e.face = pr.a;        // the nose shows the lead — one more honest tell
            e.predX = pr.x; e.predY = pr.y; e.predT = 20; // the latch ping, drawing only
          } else {
            e.lockA = e.face;
          }
        };
        if (kin === "charger") { // rested and in range — plant to lunge
          e.mode = "windup";
          e.t = CH.windup;
          latch(CH.windup, CH.dashSpeed); // the dash line locks NOW, so the lunge
          e.dashHit = false;              // can be dodged; the dash IS the projectile
          // the tell starts the tick the line locks, so the sound and the
          // dodge window begin together — same deal as the dart's charge
          emit("windup", e);
        } else if (kin === "harrier") { // standoff and rested — plant to launch
          e.mode = "lockon";
          e.t = ECFG.harrier.lockon;
          latch(ECFG.harrier.lockon, ECFG.missile.speed); // the missile leaves on
                                    // THIS bearing, not the live one
          emit("lock", e); // a smaller sibling of windup — the
                           // same family, a lighter body
        } else { // in range and rested — plant and telegraph
          e.mode = "tele";
          e.t = L.telegraph;
          latch(L.telegraph, 0); // the lance direction locks here, so it can be
          e.pulseHit = false;    // dodged; the beam is instant at fire — no
                                 // intercept term, just the delay
          emit("charge", e);
        }
      }
    } else if (e.mode === "tele") {
      e.vx *= 0.8; // plant to fire — the telegraph stays honest
      e.vy *= 0.8;
      if (--e.t <= 0) { e.mode = "pulse"; e.t = ECFG.lance.pulse; emit("zap", e); }
    } else if (e.mode === "pulse") {
      e.vx *= 0.8;
      e.vy *= 0.8;
      if (!e.pulseHit) {
        const bx = e.x + Math.cos(e.lockA) * L.len;
        const by = e.y + Math.sin(e.lockA) * L.len;
        const rr = L.halfWidth + SHIP_R;
        // sample the ship's own travel too — a top-slider-speed ship must
        // not step across the beam between two ticks untouched
        const pvx = E.shipPrev ? E.shipPrev.x : G.ship.x;
        const pvy = E.shipPrev ? E.shipPrev.y : G.ship.y;
        const n = Math.max(1, Math.ceil(Math.hypot(G.ship.x - pvx, G.ship.y - pvy) / rr));
        for (let k = 1; k <= n; k++) {
          const sx = pvx + ((G.ship.x - pvx) * k) / n;
          const sy = pvy + ((G.ship.y - pvy) * k) / n;
          if (segCircleHit(e.x, e.y, bx, by, sx, sy, rr)) {
            if (hitPlayer(L.dmg)) e.pulseHit = true; // one hit per pulse
            break;
          }
        }
      }
      if (--e.t <= 0) { e.mode = "seek"; e.cd = P.cooldown; } // per-wave lance cadence
    } else if (e.mode === "lockon") {
      e.vx *= 0.85; // plant while the launch reticle brightens along lockA — the
      e.vy *= 0.85; // same sinking body the charger's windup shows
      if (--e.t <= 0) {
        launchMissile(e);   // exactly one missile per lock, on the latched angle
        e.mode = "seek";
        e.cd = P.cooldown;  // the cadence is paid whether or not the launch above
                            // was refused by the missile cap, so a capped harrier
                            // cannot spin the lock over and over
      }
    } else if (e.mode === "windup") {
      e.vx *= 0.85; // plant — the body sinks to rest while the intent line brightens
      e.vy *= 0.85;
      if (--e.t <= 0) { e.mode = "dash"; e.t = CH.dashTicks; emit("dash", e); }
    } else if (e.mode === "dash") {
      // constant-speed lunge along the LOCKED line — reassigned every tick
      // so no damping bleeds in; the wall clamp below can still end it
      e.vx = Math.cos(e.lockA) * CH.dashSpeed;
      e.vy = Math.sin(e.lockA) * CH.dashSpeed;
      if (!e.dashHit) {
        // ram contact sweeps BOTH motions, like the lance: the charger's own
        // movement segment against sampled positions along the ship's travel
        // — neither the dashing body nor a top-speed ship can tunnel through
        const nx = e.x + e.vx;
        const ny = e.y + e.vy;
        const rr = e.r + SHIP_R;
        const pvx = E.shipPrev ? E.shipPrev.x : G.ship.x;
        const pvy = E.shipPrev ? E.shipPrev.y : G.ship.y;
        const n = Math.max(1, Math.ceil(Math.hypot(G.ship.x - pvx, G.ship.y - pvy) / rr));
        for (let k = 1; k <= n; k++) {
          const sx = pvx + ((G.ship.x - pvx) * k) / n;
          const sy = pvy + ((G.ship.y - pvy) * k) / n;
          if (segCircleHit(e.x, e.y, nx, ny, sx, sy, rr)) {
            // both sides pay: the player at most once per dash (dashHit), the
            // charger at most once per CONTACTCD window even though this sweep
            // keeps re-firing while the player is graced
            if (contactEvent(e, CH.dmg)) e.dashHit = true; // at most one hit per dash
            break;
          }
        }
      }
      if (--e.t <= 0) { e.mode = "tired"; e.t = P.rest; }
    } else if (e.mode === "tired") {
      e.face = Math.atan2(dy, dx); // spent but watching — the body turns back
      e.vx *= 0.92; // drift down from the lunge
      e.vy *= 0.92;
      if (--e.t <= 0) { e.mode = "seek"; e.cd = CH.cooldown; }
    }
    e.x += e.vx;
    e.y += e.vy;
    let walled = false;
    if (e.x < e.r) { e.x = e.r; e.vx = 0; walled = true; }
    else if (e.x > WW - e.r) { e.x = WW - e.r; e.vx = 0; walled = true; }
    if (e.y < e.r) { e.y = e.r; e.vy = 0; walled = true; }
    else if (e.y > WH - e.r) { e.y = WH - e.r; e.vy = 0; walled = true; }
    if (walled && e.mode === "dash") { e.mode = "tired"; e.t = P.rest; } // the wall ends the lunge early
  }

  // ---- the seeker missile -------------------------------------------------
  // The harrier's ordnance: a small, fast, lightly-homing body the encounter
  // owns end to end. It consumes NO randomness at all — every term below is
  // arithmetic on live state — so a wave replays identically whether a missile
  // flew, hit, was shot down or fizzled.
  //
  // The one constructor, shared by the launcher and the test hook, so a check
  // drives production code rather than a fixture. Returns the missile, or null
  // when the safety cap refuses it.
  function spawnMissile(x, y, a, radar) {
    const M = ECFG.missile;
    if (E.missiles.length >= M.max) return null;
    const m = {
      id: nextId(), // same id space as the bodies — see nextId
      x, y, vx: Math.cos(a) * M.speed, vy: Math.sin(a) * M.speed,
      r: M.r, hp: M.hp,
      age: 0,      // ticks flown — arm, decay and expiry all read this one clock
      trail: [],   // recent positions, newest last; drawing only
      radar: !!radar, // a radar launcher's round steers on ECFG.radar.missileTurn
                      // instead of the base turn — everything else is identical
    };
    E.missiles.push(m);
    return m;
  }

  // One missile leaves the rail on the angle the lockon LATCHED, not the live
  // bearing — the same honesty the lance and the dash keep, so the telegraph
  // can be sidestepped. It starts clear of the launcher's own hull so the
  // launch frame draws it at the muzzle rather than inside the body.
  function launchMissile(e) {
    const M = ECFG.missile;
    const off = e.r + M.r + 1;
    const m = spawnMissile(e.x + Math.cos(e.lockA) * off, e.y + Math.sin(e.lockA) * off, e.lockA, e.stats.radar);
    if (m) emit("launch", e); // positional, on the launcher — a
                              // harrier firing from the screen's
                              // edge is heard as well as seen
  }

  // Every way a missile ends, in one place: the list removal, the burst and
  // the cue can never disagree about which happened. `kind` is the fx look —
  // "enemy" for a detonation on the player, "wall" for the inert endings.
  function endMissile(i, kind) {
    const m = E.missiles[i];
    E.missiles.splice(i, 1);
    const s = Math.hypot(m.vx, m.vy) || 1; // a UNIT heading, like every other fx
    spawnImpactFx(m.x, m.y, m.vx / s, m.vy / s, kind); // call site — the burst sprays
                                                       // back off the direction of travel
    // one cue per ending, however it ended: the audio table's boom is defined
    // as "a missile ending", and most endings are the player's own bullet
    // killing it — which is why it sits on the shot bus and not on foe
    emit("boom", m);
  }

  // Steer, then move, once per tick. The rotation form is provably
  // speed-preserving and has no angle-wrap seam: homing changes HEADING only,
  // which is what keeps a 6 px/tick body readable.
  function stepMissiles() {
    const M = ECFG.missile;
    for (let i = E.missiles.length - 1; i >= 0; i--) {
      const m = E.missiles[i];
      const ttl = M.life - m.age;
      // 0 while arming (a straight opening segment is what makes the bearing
      // readable), full through the middle, then fading linearly to 0 over the
      // last decay ticks — the fuse tell and the anti-orbit fix in one term
      // the radar round's turn reads LIVE, so the tuner slider acts on missiles
      // already in flight; at 0 it is a pure ballistic predictor
      const turn = m.radar ? ECFG.radar.missileTurn : M.turn;
      const lim = m.age < M.arm ? 0 : ttl < M.decay ? turn * (ttl / M.decay) : turn;
      if (lim > 0) {
        const dx = G.ship.x - m.x;
        const dy = G.ship.y - m.y;
        const cross = m.vx * dy - m.vy * dx; // sign: which way to turn
        const dot = m.vx * dx + m.vy * dy;
        const ang = Math.atan2(cross, dot);  // signed, already wrapped
        const w = Math.max(-lim, Math.min(lim, ang));
        const cs = Math.cos(w);
        const sn = Math.sin(w);
        const nvx = m.vx * cs - m.vy * sn;
        const nvy = m.vx * sn + m.vy * cs;
        m.vx = nvx;
        m.vy = nvy;
      }
      m.trail.push({ x: m.x, y: m.y }); // sampled BEFORE the move, so the newest
      if (m.trail.length > M.trail) m.trail.shift(); // sample is the last frame drawn
      const nx = m.x + m.vx;
      const ny = m.y + m.vy;
      // swept contact against BOTH motions, exactly as the lance and the dash
      // do it: neither a 6 px/tick missile nor a top-slider ship may tunnel
      let struck = false;
      const rr = m.r + SHIP_R;
      const pvx = E.shipPrev ? E.shipPrev.x : G.ship.x;
      const pvy = E.shipPrev ? E.shipPrev.y : G.ship.y;
      const n = Math.max(1, Math.ceil(Math.hypot(G.ship.x - pvx, G.ship.y - pvy) / rr));
      for (let k = 1; k <= n; k++) {
        const sx = pvx + ((G.ship.x - pvx) * k) / n;
        const sy = pvy + ((G.ship.y - pvy) * k) / n;
        if (segCircleHit(m.x, m.y, nx, ny, sx, sy, rr)) { struck = true; break; }
      }
      if (struck) {
        // the detonation is unconditional: an i-framed player still eats the
        // missile, because the grace is the PLAYER's and never the ordnance's
        hitPlayer(M.dmg);
        m.x = nx;
        m.y = ny;
        endMissile(i, "enemy");
        continue;
      }
      m.x = nx;
      m.y = ny;
      m.age++;
      if (m.x < 0 || m.x > WW || m.y < 0 || m.y > WH) {
        // dies AT the boundary, not wherever the overshoot landed, so the
        // burst sits on the wall the player watched it hit
        m.x = Math.max(0, Math.min(WW, m.x));
        m.y = Math.max(0, Math.min(WH, m.y));
        endMissile(i, "wall");
      } else if (m.age >= M.life) {
        endMissile(i, "wall"); // a fuse running out is an inert thing coming
                               // apart — the burst is what confirms a dodge
      }
    }
  }

  // ---- BLAST CHARGE — the splash a terminating player bullet leaves --------
  // Rank 0 is off and blastAt() is a no-op; every rank above it reaches
  // BLASTR + BLASTGAIN × (rank − 1) px off the two weapons-tab sliders, read
  // LIVE so a drag retunes the next shot. Pure arithmetic on live state — no
  // rand(), no clock — so the seeded stream never notices a blast and the
  // wave's deal is identical whether the row was bought or not.
  const blastRadius = () => (mods.blast > 0 ? BLASTR + BLASTGAIN * (mods.blast - 1) : 0);
  // One instantaneous application at the impact point. `direct` is the body the
  // bullet itself just paid — excluded, so a hit is never double-dipped — and
  // every OTHER living body whose circle reaches the radius takes exactly one
  // bullet's damage, once. Enemies only: the player, the orbs and the missiles
  // are never touched by a blast, at any rank — a splash that swept ordnance
  // out of the air would quietly delete the harrier's whole threat.
  function blastAt(x, y, direct, dmg) {
    const R = blastRadius();
    if (R <= 0) return;
    for (const e of E.enemies) {
      if (e === direct || e.hp <= 0) continue; // the direct hit already paid; a
                                               // corpse is reapDead's, not ours
      const dx = e.x - x;
      const dy = e.y - y;
      const reach = R + e.r; // the body CIRCLE has to intersect the blast, not its center
      if (dx * dx + dy * dy <= reach * reach) {
        e.hp -= dmg; // exactly one bullet-equivalent, exactly once per body per blast
        e.flash = 8;
      }
    }
    spawnImpactFx(x, y, 0, -1, "blast", R); // visual only — sized to the radius the sim just used
    // below the R <= 0 return, which is what makes this cue mean "the
    // upgrade you bought went off" and never a phantom at rank 0
    emit("blast", { x, y });
  }

  // Bullets arbitrate against enemies AND missiles in ONE first-along-the-path
  // pass. Two passes could each hand the same bullet a target and bill it
  // twice; one pass means the NEARER thing always wins and a bullet is
  // consumed exactly once, whichever family it stopped on.
  function resolveBulletHits() {
    for (const b of G.bullets) {
      if (b.dead || b.owner !== "player") continue;
      let bestT = -1;
      let hit = null;   // the enemy body, when a body is nearest
      let mi = -1;      // ...or the missile's index, when ordnance is
      for (const e of E.enemies) {
        if (e.hp <= 0) continue;
        const t = segCircleEntryT(b.px, b.py, b.x, b.y, e.x, e.y, e.r + b.r);
        if (t >= 0 && (bestT < 0 || t < bestT)) { bestT = t; hit = e; mi = -1; }
      }
      for (let i = 0; i < E.missiles.length; i++) {
        const m = E.missiles[i];
        const t = segCircleEntryT(b.px, b.py, b.x, b.y, m.x, m.y, m.r + b.r);
        if (t >= 0 && (bestT < 0 || t < bestT)) { bestT = t; hit = null; mi = i; }
      }
      if (mi >= 0) {
        const bx = b.px + (b.x - b.px) * bestT;
        const by = b.py + (b.y - b.py) * bestT;
        b.dead = true;   // consumed exactly once, same as a body hit
        E.missilesShot++; // not a kill: no orb, no XP, no entry in E.kills
        endMissile(mi, "enemy");
        // the file's standing rule — every player bullet that TERMINATES pays
        // its splash where it stopped, bodies and walls alike — so an
        // interception is not quietly the one shot that forfeits the upgrade.
        // null, because the thing the bullet paid for was not an enemy body;
        // blastAt itself never reaches ordnance, so no missile is ever swept
        // out of the air by a splash.
        blastAt(bx, by, null, b.dmg);
        continue;
      }
      if (hit) {
        const bm = Math.hypot(b.vx, b.vy) || 1; // visual only — the burst rides game.js's own hash stream
        const ix = b.px + (b.x - b.px) * bestT;
        const iy = b.py + (b.y - b.py) * bestT;
        // The anvil's shield, and the whole of it: a bullet whose swept ENTRY
        // POINT lands inside the frontal arc is consumed with no damage. The
        // test reads the same entry parameter the spark is drawn at, so the
        // block and the spark can never disagree about where the bullet
        // stopped. Three deliberate asymmetries live here: a blocked bullet
        // still DIES (and sparks with the wall kind, so the clang reads as an
        // inert thing struck, not as a hit), it pays no hitsDealt — nothing was
        // hit — and its splash still goes off for every OTHER body in reach,
        // because blastAt applies damage at a POINT rather than along a path.
        // The shielded body itself is excluded from that splash, and it is the
        // one place this file does not simply follow "a terminating bullet
        // splashes where it stopped": the impact point sits 13 px off the
        // anvil's centre and BLASTR alone is 18, so passing null here would let
        // an 8 XP purchase deal FULL damage through the shield on every blocked
        // round — the archetype would evaporate at rank 1. BLAST CHARGE still
        // answers this body, in the honest way: kill anything near it, or bury
        // a shot in the wall behind it, and the splash washes over its back.
        if (hit.stats.arc > 0 && Math.abs(angDiff(Math.atan2(iy - hit.y, ix - hit.x), hit.face)) <= hit.stats.arc) {
          b.dead = true;
          spawnImpactFx(ix, iy, b.vx / bm, b.vy / bm, "wall");
          emit("clang", hit); // pitched and short, obviously not
                              // the hit click — the shield is
                              // learnable by ear in one volley
          blastAt(ix, iy, hit, b.dmg); // hit, not null: everything else in reach
                                       // pays, the body that stopped the round does not
          continue;
        }
        hit.hp -= b.dmg; // the first body along the path takes the hit
        hit.flash = 8;
        b.dead = true; // consumed exactly once — the game sweep removes it
        E.hitsDealt++;
        spawnImpactFx(ix, iy, b.vx / bm, b.vy / bm, "enemy");
        emit("hit", hit); // the landing, not the kill — reapDead
                          // owns the one canonical kill sound
        blastAt(ix, iy, hit, b.dmg); // the splash lands where the bullet stopped
      }
    }
  }

  // The other way a player bullet terminates on an impact: it left the world at
  // a wall, which game.js marks spent and sparks (FX_KINDS.wall). This runs
  // AFTER resolveBulletHits so a bullet a body ate on its exit tick is already
  // dead here and blasts on the body instead — exactly the rule flushWallFx
  // uses for the spark. A BOUNCING bullet never reaches this: it was mirrored
  // back inside the world and did not terminate. The contact point comes from
  // game.js's own wallExitPoint(), so damage and spark can never disagree, and
  // nothing here reads FXINT — the splash is sim, the spark is decoration.
  function resolveWallBlasts() {
    if (mods.blast <= 0) return;
    for (const b of G.bullets) {
      if (b.dead || !b.spent || b.owner !== "player") continue;
      if (!outOfWorld(b)) continue; // a mid-air ttl fade hit nothing
      const w = wallExitPoint(b);
      blastAt(w.x, w.y, null, b.dmg);
    }
  }

  // Generic ship-body contact — swept along the ship's own travel like the
  // lance and the dash, so a top-slider ship cannot skip through a 14 px body
  // between two ticks. Only a dead body is skipped here: the touch itself is
  // real every tick it happens, and contactEvent owns BOTH gates — the player's
  // i-frames and the body's own cooldown/per-tick claim. Skipping the whole
  // event on contactCd would silently pace the player's damage off an
  // enemy-facing knob (and pace it differently from the dash path, which calls
  // contactEvent unconditionally). The dash cannot double-count either: it ran
  // first in stepEnemy and took this tick's claim.
  function resolveContacts() {
    const pv = E.shipPrev || G.ship;
    for (const e of E.enemies) {
      if (e.hp <= 0) continue;
      if (segCircleHit(pv.x, pv.y, G.ship.x, G.ship.y, e.x, e.y, e.r + SHIP_R)) {
        contactEvent(e, ECFG.contact.dmgToPlayer);
      }
    }
  }

  // pitch is mass: the three bodies that read as heavy sing killheavy, the
  // light hulls sing kill. A lookup rather than a ternary, so appending a type
  // is a row here and not a nested conditional. The same set names the heavy
  // SPAWN cue, for the same reason — the lone body arriving on the edge is
  // either something big or it is not.
  const HEAVY = { charger: true, radarCharger: true, anvil: true, husk: true };

  // A husk's death burst: three shards on a seeded fan, ONE rand() draw for the
  // base angle and 120° between them, each pushed clear of the corpse and given
  // outward velocity. It deliberately does NOT route through spawnEnemy: a husk
  // killed in your face is SUPPOSED to burst in your face, and the
  // minPlayerDist push-out that protects a scheduled spawn would teleport the
  // threat away from the player who just earned it.
  function splitBody(e) {
    const H = ECFG.husk;
    const n = e.stats.split;
    const st = E.stats.shard;
    const base = rand() * Math.PI * 2; // exactly one draw per burst, whatever n is
    for (let k = 0; k < n; k++) {
      const a = base + (k * 2 * Math.PI) / n;
      const c = clampWorld(e.x + Math.cos(a) * e.r * H.push, e.y + Math.sin(a) * e.r * H.push, st.r);
      makeBody(c.x, c.y, "shard", k, Math.cos(a) * H.kick, Math.sin(a) * H.kick);
    }
  }

  function reapDead() {
    for (let i = E.enemies.length - 1; i >= 0; i--) {
      const e = E.enemies[i];
      if (e.hp > 0) continue;
      E.enemies.splice(i, 1); // a body dies at most once
      E.kills++;
      // the ONE canonical kill site — bullet, blast and contact deaths all
      // arrive here, so no path can sound a body twice. BEFORE the orb loop,
      // which consumes rand(): the emit reads nothing and reorders nothing,
      // and keeping it above the draws makes that obvious at a glance.
      emit(HEAVY[e.type] ? "killheavy" : "kill", e);
      for (let k = 0; k < e.orbDrop; k++) { // 1 a dart or a shard, 2 a charger or a
                                            // harrier, 3 an anvil, 1 the husk itself —
                                            // whose three shards make the burst pay 4
        const a = rand() * Math.PI * 2; // each drop dealt its own drift
        E.orbs.push({ id: nextId(), x: e.x, y: e.y, vx: Math.cos(a) * ECFG.orb.drift, vy: Math.sin(a) * ECFG.orb.drift });
      }
      // after the orbs, and on the reverse-iterating loop that makes appending
      // safe: the shards land at the end of the list, below the index this loop
      // is walking down through, so they are never reaped on the tick they were
      // born. A shard carries no split field, so there is no recursion to bound.
      if (e.stats.split) splitBody(e);
    }
  }

  function addXp(n) {
    E.xp += n; // an uncapped wallet — no threshold, no level; the shop is the only drain
  }

  function stepOrbs() {
    const O = ECFG.orb;
    // the cleared banner is a live sweep window over an empty field: the
    // magnet goes world-wide and much harder, so every orb a wave dropped is
    // banked before its shop opens and the income table stays exact. Pure
    // arithmetic on live state — no rand(), so the seeded stream never
    // notices the sweep and the next wave's deal is untouched.
    const sweeping = E.state === "cleared";
    const attract = sweeping ? Infinity : O.attract;
    const pull = sweeping ? O.clearPull : O.pull;
    const vmax = sweeping ? O.clearVmax : O.vmax;
    for (let i = E.orbs.length - 1; i >= 0; i--) {
      const o = E.orbs[i];
      o.vx *= O.damp; // the drop drifts briefly, then the damp settles it
      o.vy *= O.damp;
      const dx = G.ship.x - o.x;
      const dy = G.ship.y - o.y;
      const d = Math.hypot(dx, dy) || 0.001;
      if (d < attract) { // magnet range — the orb chases the ship
        o.vx += (dx / d) * pull;
        o.vy += (dy / d) * pull;
        const m = Math.hypot(o.vx, o.vy);
        if (m > vmax) { o.vx *= vmax / m; o.vy *= vmax / m; }
      }
      o.x += o.vx;
      o.y += o.vy;
      if (d < O.pickup + SHIP_R) {
        E.orbs.splice(i, 1); // removal and increment together — one XP, once
        addXp(1);
        // beside the splice, never inside addXp() — the suites call that
        // synthetically, and a granted XP is not a banked orb
        emit("pickup");
      }
    }
  }

  // ---- transitions -------------------------------------------------------
  // active → cleared (banner holds clearHold) → shop → warning. The shop
  // opens after EVERY clear, affordable or not — it is the only surface that
  // shows prices, so a broke player still needs to see what to save for.
  function openShop() {
    if (E.state !== "cleared") return;
    E.state = "shop"; // frozen() now gates the whole sim
    E.shopHover = -1; // a fresh visit opens with nothing selected...
    E.shopBtn = false;
    G.keys.clear();   // a hand resting on the ring must not stay "held" across the
                      // visit — pause() is the only other caller of this clear, and
                      // a frozen shop keeps G.running true, so it never fires here
    overlayPointerRelease(); // the shop is a mouse UI: the native cursor comes back
                             // however the flight controls left it
    shopHoverFromMouse();    // ...and it opens hovering whatever already sits under
                             // the pointer, since a still mouse fires no mousemove
    emit("shop"); // a smaller door than a cleared wave, same family
  }

  // one purchase; the state STAYS "shop" so the player buys again. Returns
  // whether the sale went through — refusals change nothing at all.
  function buy(i) {
    // the cues live HERE, not at the click site: the armed gate already
    // silences a suite's direct enc.buy() calls, so one site covers the
    // pointer with no restructuring. The three refusals a player can
    // actually reach by clicking a card each sound denied; the first two
    // returns stay silent on purpose — a wrong state or a missing row is a
    // programming error, not a player action asking for feedback.
    if (E.state !== "shop") return false;
    const row = SHOP[i];
    if (!row) return false;
    if (shopMaxed(i)) { if (window.Sfx) Sfx.cue("denied"); return false; }
    if (row.can && !row.can()) { if (window.Sfx) Sfx.cue("denied"); return false; }
    const cost = shopCost(i);
    if (E.xp < cost) { if (window.Sfx) Sfx.cue("denied"); return false; }
    E.xp -= cost;
    E.owned[i]++;
    row.apply(E.owned[i]); // the rank AFTER the sale — a row that prices its effect
                           // off the rank (RAPID LOADER) must never see the old one
    if (window.Sfx) Sfx.cue("buy");
    return true;
  }

  function continueFromShop() {
    if (E.state !== "shop") return; // without this guard a doubled click deals two
                                    // waves, skips one, and reseeds rand for N+2
    E.shopHover = -1; // nothing is hovered on a screen that no longer exists — and
    E.shopBtn = false; // the hover art must not survive into the next wave's HUD
    startWave(E.wave + 1);
    E.state = "warning";
    overlayPointerRestore(); // flight comes back exactly as resume() arms it; the
                             // click on NEXT WAVE is the user gesture a lock needs
  }

  // deal a wave: its own RNG stream, its schedule, its resolved stats.
  // Everything else — hull, the XP wallet, purchase ranks, mods, leftover
  // orbs, live bullets — is deliberately untouched, so a mid-run transition
  // carries it across.
  function startWave(n) {
    E.wave = n;
    E.waveTick = 0;
    E.clearTick = 0;
    // per-wave reseed — the schedule a wave deals no longer depends on how
    // many draws the previous wave consumed (orb drift angles and anchor
    // retries vary with play), so every wave is reproducible on its own
    rand = mulberry32(n === 1 ? ECFG.seed : (ECFG.seed ^ Math.imul(n, 0x9E3779B9)) >>> 0);
    E.groups = waveGroups(n).map((g) => ({ count: g.count, type: g.type, radar: g.radar, warnAt: g.warnAt, spawnAt: g.spawnAt, points: null, spawned: false }));
    E.stats = statsFor(n); // resolved ONCE — bodies stamp this at spawn
  }

  // full restart: back to wave 1 with enemies, bullets, orbs and transient
  // state cleared, mods included; recenters the ship and camera — and
  // touches no tuner value, so every slider survives
  function restart(seed) {
    startWave(1);
    if (seed !== undefined) rand = mulberry32(seed >>> 0); // explicit test seeds still override
    E.state = "idle";
    E.enemies = [];
    E.missiles = []; // ordnance never survives a restart — a wave-9 seeker
                     // arriving on the new wave 1 would be unaccountable
    E.orbs = [];
    EVENTS.length = 0;   // no queued cue survives a restart — a stale event
                         // would sound over the new run's opening tick
    nextEntityId = 1;    // the id deal restarts with the run — a seeded run
                         // reproduces its ids exactly, see nextId
    E.hullMax = ECFG.player.hull;  // MAX HULL purchases die with the run
    E.hull = E.hullMax;
    E.xp = 0;                      // the wallet resets on death — owner decision, the roguelite reset
    E.owned = SHOP.map(() => 0);   // every rank counter dies here, current and future rows alike
    E.shopHover = -1;              // no hover — and so no hover art — survives a restart
    E.shopBtn = false;
    syncCursor();                  // ...and neither does the shop's menu pointer
    E.invuln = 0;
    E.hitFlash = 0;
    E.shipPrev = null;
    E.kills = 0;
    E.missilesShot = 0;
    E.hitsDealt = 0;
    E.hitsTaken = 0;
    E.contactsDealt = 0;
    mods.cool = 1;
    mods.speed = 0;
    mods.keyThrust = false; // the ring re-locks with the run — see H1
    mods.blast = 0;         // ...and the splash dies with it: rank 0 is no splash at all
    G.bullets.length = 0;
    resetImpactFx(); // a restart is FX-clean, so burst seeds replay run to run
    G.ship.x = WW / 2;
    G.ship.y = WH / 2;
    G.vel.x = 0;
    G.vel.y = 0;
    G.cool = 0;
    G.flame.x = G.flame.y = 0;
    G.thrustAcc.x = G.thrustAcc.y = 0;
    cam.x = Math.max(0, Math.min(WW - FW, WW / 2 - FW / 2));
    cam.y = Math.max(0, Math.min(WH - FH, WH / 2 - FH / 2));
    cam.fromX = cam.x;
    cam.fromY = cam.y;
    cam.toX = cam.toY = -1; // flip retargets fresh
    cam.t = 1;
    gate.seeded = false; // the lookahead commit gate re-seeds too
    gate.timer = 0;
  }

  // ---- per-tick update — called from game step() after the bullet sweep --
  function encStep() {
    if (E.state === "idle") E.state = "warning"; // the first played tick opens Wave 1
    if (frozen()) return; // double safety — game step() already gates these
    // the clear banner has held long enough — open the shop. The return is
    // load-bearing: it skips E.waveTick++ and the whole spawn/step/reap tail,
    // so no simulation advances on the entering tick and the next wave's
    // group loop still evaluates at tick 1 exactly as it did when this
    // branch dealt the wave directly (startWave zeroes waveTick, and
    // continueFromShop is what deals it now).
    if (E.state === "cleared" && E.waveTick - E.clearTick >= ECFG.clearHold) {
      openShop();
      return;
    }
    E.waveTick++;
    // A cleared field does not wait out the clock. Once the wave is under way,
    // if every body is dead and no ordnance is in the air, the REST of the
    // schedule slides forward so the next group warns on this tick and lands
    // its 90 ticks later. Only the dead time is cut: the warning still runs in
    // full, and the remaining groups keep their pitch relative to each other,
    // so a wave the player clears fast reads as pressure instead of a timer.
    // The wave's OPENING beat is deliberately exempt — the gate needs a group
    // already down, so continuing from the shop still lands its first pack on
    // the committed 126-tick offset. "Settled" is the clear gate's own test,
    // missiles included: a dead harrier's last seeker is still the wave.
    if (E.state === "active" && E.enemies.length === 0 && E.missiles.length === 0) {
      const next = E.groups.find((g) => !g.spawned);
      if (next && E.waveTick < next.warnAt) {
        const slide = next.warnAt - E.waveTick;
        for (const g of E.groups) if (!g.spawned) { g.warnAt -= slide; g.spawnAt -= slide; }
      }
    }
    for (const g of E.groups) {
      // the warn event lands strictly AFTER the seeded anchor draws — emit
      // touches no randomness, and the queue keeps it that way by design;
      // the spawn event is one per GROUP, never per body — spawnEnemy is
      // also a test hook and three darts landing is one event — and it
      // carries the anchor the incoming marker points at, so the ear and
      // the chevron agree on the direction
      if (!g.points && E.waveTick >= g.warnAt) { g.points = rollGroupPoints(g.count); emit("warn"); }
      if (!g.spawned && E.waveTick >= g.spawnAt) { spawnGroup(g); g.spawned = true; emit(HEAVY[g.type] ? "spawnheavy" : "spawn", g.points.anchor); }
    }
    if (E.state === "warning" && E.enemies.length) E.state = "active";
    // BEFORE the enemy loop, so a missile launched this tick first flies on the
    // NEXT one and the launch frame always draws it at the muzzle
    stepMissiles();
    for (const e of E.enemies) stepEnemy(e);
    // this tick's settled positions, after the dash branch has had first claim
    // on its own window, and before reapDead() so a contact kill reaps, counts
    // and pays its orbs on the same tick a bullet kill would
    resolveContacts();
    resolveBulletHits();
    resolveWallBlasts(); // after the sweep, before the reap: a wall blast's kill
                         // counts and pays its orbs on the tick it happened
    reapDead();
    stepOrbs();
    if (E.invuln > 0) E.invuln--;
    if (E.hitFlash > 0) E.hitFlash--;
    // A wave clears only when the queue is empty AND the field is empty AND no
    // ordnance is still in the air — still an explicit simplification of Nova
    // Drift's timer-driven overlapping scheduler. The missile term is what
    // keeps the banner and its orb sweep from running under a live seeker: a
    // dead harrier's last missile is still the wave. The banner holds clearHold
    // ticks while the sweep banks the orbs, then the check above opens the shop.
    if (E.state === "active" && E.enemies.length === 0 && E.missiles.length === 0 &&
        E.groups.every((g) => g.spawned)) {
      E.state = "cleared";
      E.clearTick = E.waveTick;
      emit("clear"); // the run's one victory phrase
    }
    E.shipPrev = { x: G.ship.x, y: G.ship.y };
  }

  // ---- drawing: world pass (under the camera transform) ------------------
  // the charger silhouette, in local body space facing +x: a flat ram face,
  // wide shoulders, a notched tail — reads heavier than a dart at a glance
  function chargerPath() {
    ctx.beginPath();
    ctx.moveTo(9, -4.5);
    ctx.lineTo(9, 4.5); // the blunt ram face
    ctx.lineTo(-1, 8);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-1, -8);
    ctx.closePath();
  }

  // Which way a silhouette points: a planted attack shows the LOCKED angle, so
  // the body and its telegraph can never disagree about where the threat goes.
  const bodyAngle = (e) => (e.mode === "seek" || e.mode === "tired" ? e.face : e.lockA);

  // One draw function per type, dispatched off a table instead of a chain of
  // type tests. Every silhouette is Canvas primitives in the palette the whole
  // game already speaks — no assets, and no unique hue per enemy: motion, size
  // and telegraph carry the distinction instead. Draw only: nothing here
  // mutates sim state and nothing here draws randomness.
  function drawDart(e) {
    const L = ECFG.lance;
    if (e.mode === "tele") {
      const p = 1 - e.t / L.telegraph; // the warning brightens as it charges
      ctx.strokeStyle = C.clay;
      ctx.globalAlpha = 0.25 + 0.55 * p;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + Math.cos(e.lockA) * L.len, e.y + Math.sin(e.lockA) * L.len);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(e.lockA) * (e.r + 3), e.y + Math.sin(e.lockA) * (e.r + 3), 1 + 2.5 * p, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (e.mode === "pulse") {
      const bx = e.x + Math.cos(e.lockA) * L.len;
      const by = e.y + Math.sin(e.lockA) * L.len;
      ctx.strokeStyle = C.clay;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = L.halfWidth * 2 + 2;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.strokeStyle = C.bright;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(bodyAngle(e));
    ctx.fillStyle = e.flash > 0 ? C.bright : "#9aa3b2";
    ctx.beginPath(); // the dart: nose toward the player, notched tail
    ctx.moveTo(8, 0);
    ctx.lineTo(-6, 5.5);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-6, -5.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.clay;
    ctx.beginPath();
    ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCharger(e) {
    const CH = ECFG.charger;
    if (e.mode === "windup") {
      // honest telegraph: the intent line shows the REAL dash lane and
      // brightens as the windup completes
      const p = 1 - e.t / CH.windup;
      const reach = CH.dashSpeed * CH.dashTicks;
      ctx.strokeStyle = C.clay;
      ctx.globalAlpha = 0.2 + 0.6 * p;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + Math.cos(e.lockA) * reach, e.y + Math.sin(e.lockA) * reach);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (e.mode === "dash") {
      for (let g = 1; g <= 3; g++) { // a short motion trail behind the lunge
        ctx.save();
        ctx.translate(e.x - Math.cos(e.lockA) * g * CH.dashSpeed, e.y - Math.sin(e.lockA) * g * CH.dashSpeed);
        ctx.rotate(e.lockA);
        ctx.globalAlpha = 0.28 - g * 0.07;
        ctx.fillStyle = "#9aa3b2";
        chargerPath();
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(bodyAngle(e));
    // the windup body flash quickens as the dash nears — with the
    // brightening line, two independent tells for one attack
    const per = e.mode === "windup" ? Math.max(2, 10 - Math.floor((1 - e.t / CH.windup) * 8)) : 0;
    ctx.fillStyle = e.flash > 0 || (per > 0 && e.t % per < per / 2) ? C.bright : "#9aa3b2";
    chargerPath();
    ctx.fill();
    ctx.fillStyle = C.clay;
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // the standoff hull: a narrow spine with swept rails, and — while it locks —
  // a lane line down the missile's real bearing under a reticle that CLOSES
  // onto the muzzle as the launch nears. Two tells for one attack, same as the
  // charger: the lane says where, the reticle says when.
  function drawHarrier(e) {
    const H = ECFG.harrier;
    if (e.mode === "lockon") {
      const p = 1 - e.t / H.lockon;
      const reach = ECFG.missile.speed * ECFG.missile.life * 0.35; // a slice of the
      // 540 px reach — the whole flight drawn as a line would read as a beam
      ctx.strokeStyle = C.clay;
      ctx.globalAlpha = 0.15 + 0.5 * p;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + Math.cos(e.lockA) * reach, e.y + Math.sin(e.lockA) * reach);
      ctx.stroke();
      ctx.globalAlpha = 0.3 + 0.6 * p;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(e.lockA) * (e.r + 12), e.y + Math.sin(e.lockA) * (e.r + 12), 8 - 5.5 * p, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(bodyAngle(e));
    ctx.fillStyle = e.flash > 0 ? C.bright : "#9aa3b2";
    ctx.beginPath(); // a long nose over a deeply notched tail — nothing like a dart
    ctx.moveTo(10, 0);
    ctx.lineTo(1, 3.5);
    ctx.lineTo(-7, 6.5);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-7, -6.5);
    ctx.lineTo(1, -3.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.clay; // the rails the missile leaves from
    ctx.fillRect(-2, -5.6, 6, 1.3);
    ctx.fillRect(-2, 4.3, 6, 1.3);
    ctx.restore();
  }

  // the wedge, drawn with its shield ARC on: the covered 140° is painted in the
  // danger accent so the answer to this body — walk around it — is visible
  // rather than discovered by wasting a magazine on the front
  function drawAnvil(e) {
    const P = e.stats;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(bodyAngle(e));
    ctx.fillStyle = e.flash > 0 ? C.bright : "#9aa3b2";
    ctx.beginPath();
    ctx.moveTo(11, 0);   // the armored prow
    ctx.lineTo(3, 9);
    ctx.lineTo(-9, 10);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-9, -10);
    ctx.lineTo(3, -9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.clay;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 2;
    ctx.beginPath(); // the shield itself, on exactly the arc the sim tests
    ctx.arc(0, 0, e.r + 3, -P.arc, P.arc);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // the bloated drifter: a swollen hull with three seams already showing where
  // it will come apart, so the death burst is telegraphed by the body itself
  function drawHusk(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(bodyAngle(e));
    ctx.fillStyle = e.flash > 0 ? C.bright : "#9aa3b2";
    ctx.beginPath();
    ctx.arc(0, 0, e.r - 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.clay;
    for (let k = 0; k < 3; k++) { // the three shards, visible under the skin
      const a = (k * 2 * Math.PI) / 3;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 5.5, Math.sin(a) * 5.5, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = C.dim; // the strained outer skin
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // the payload: a dart's shape at half scale, so a burst reads instantly as
  // "three small fast things" without a new vocabulary
  function drawShard(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(bodyAngle(e));
    ctx.fillStyle = e.flash > 0 ? C.bright : "#9aa3b2";
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, 3.6);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-4, -3.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // The radar identity, painted OVER the parent silhouette: a cyan core dot, a
  // slow sweep ring (the "sensor" read), and — for predT ticks after a latch —
  // an expanding ping at the predicted point, the "this is where it thinks you
  // will be" mark. The sweep rotates off E.waveTick: drawing only, determinism
  // intact, and it freezes with the sim like every other pulse in this file.
  function drawRadarAccent(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = C.radar; // the cyan core over the parent's clay dot
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.radar;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.2;
    const sa = E.waveTick * 0.09; // the sweep — a short arc walking the rim
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 4, sa, sa + 1.2);
    ctx.stroke();
    ctx.restore();
    if (e.predT > 0) {
      const p = 1 - e.predT / 20; // expands and fades over the 20-tick ping
      ctx.strokeStyle = C.radar;
      ctx.globalAlpha = 0.85 * (1 - p);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(e.predX, e.predY, 3 + 10 * p, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(e.predX, e.predY, 1.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // the radar variants route through the PARENT draw — modes, lockA and
  // telegraph all render unchanged, so the leading line comes for free — and
  // the accent overlays the shared cyan identity on top
  const drawRadarDart = (e) => { drawDart(e); drawRadarAccent(e); };
  const drawRadarCharger = (e) => { drawCharger(e); drawRadarAccent(e); };
  const drawRadarHarrier = (e) => { drawHarrier(e); drawRadarAccent(e); };

  const DRAW_BODY = { dart: drawDart, charger: drawCharger, harrier: drawHarrier,
                      anvil: drawAnvil, husk: drawHusk, shard: drawShard,
                      radarDart: drawRadarDart, radarCharger: drawRadarCharger,
                      radarHarrier: drawRadarHarrier };

  // the missile, and the trail that is the actual UI for it: a bare dot moving
  // 6 px/tick reads as a teleport, while a tapering 14-sample tail shows the
  // turn radius the player has to beat. Newest sample is brightest and widest,
  // and the live position closes the tail so there is never a gap at the tip.
  function drawMissiles() {
    for (const m of E.missiles) {
      // a radar round wears the sensor cyan nose to tail, so which turn budget
      // is chasing you is readable from the trail alone
      const col = m.radar ? C.radar : C.clay;
      for (let i = 1; i <= m.trail.length; i++) {
        const a0 = m.trail[i - 1];
        const a1 = i < m.trail.length ? m.trail[i] : m;
        const p = i / m.trail.length;
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.05 + 0.35 * p;
        ctx.lineWidth = 0.6 + 2 * p;
        ctx.beginPath();
        ctx.moveTo(a0.x, a0.y);
        ctx.lineTo(a1.x, a1.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(Math.atan2(m.vy, m.vx));
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(5.5, 0);
      ctx.lineTo(-3, 2.6);
      ctx.lineTo(-1.5, 0);
      ctx.lineTo(-3, -2.6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C.bright; // the hot tip — the one bright pixel that says
      ctx.beginPath();          // this is live ordnance and not a spark
      ctx.arc(3, 0, 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function encDraw() {
    if (E.state === "idle") return;
    ctx.save();
    const wt = E.waveTick;
    // spawn portals while a group is announced but not landed
    for (const g of E.groups) {
      if (!g.points || g.spawned) continue;
      const a = g.points.anchor;
      const pulse = 0.35 + 0.4 * Math.abs(Math.sin(wt * 0.15));
      ctx.strokeStyle = C.clay;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 10 + 6 * Math.abs(Math.sin(wt * 0.1)), 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(a.x, a.y, 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // XP orbs
    for (const o of E.orbs) {
      ctx.fillStyle = C.clay;
      ctx.beginPath();
      ctx.arc(o.x, o.y, ECFG.orb.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.bright;
      ctx.beginPath();
      ctx.arc(o.x, o.y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // enemy bodies, telegraphs, beams and trails — one function per type off
    // the dispatch table; an unknown type falls back to the dart rather than
    // vanishing, because an invisible body is the worst possible bug here
    for (const e of E.enemies) (DRAW_BODY[e.type] || drawDart)(e);
    // ordnance paints OVER the bodies: a missile crossing a pack is the thing
    // the player has to answer first, so it must never be hidden behind one
    drawMissiles();
    // post-hit grace — a blinking ring around the ship
    if (E.invuln > 0 && wt % 8 < 5) {
      ctx.strokeStyle = C.clay;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(G.ship.x, G.ship.y, SHIP_R + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ---- drawing: HUD and overlays (screen space, no camera) ---------------
  function drawIncomingMarker(a, wt) {
    const sx = a.x - cam.x;
    const sy = a.y - cam.y;
    const cx = Math.max(14, Math.min(FW - 14, sx));
    const cy = Math.max(14, Math.min(FH - 14, sy));
    const off = Math.abs(sx - cx) > 0.5 || Math.abs(sy - cy) > 0.5;
    const ang = off ? Math.atan2(sy - cy, sx - cx) : -Math.PI / 2;
    const pulse = 0.45 + 0.45 * Math.abs(Math.sin(wt * 0.15));
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.fillStyle = C.clay;
    ctx.beginPath(); // chevron pointing at the arrival point
    ctx.moveTo(7, 0);
    ctx.lineTo(-4, 5);
    ctx.lineTo(-1, 0);
    ctx.lineTo(-4, -5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = C.clay;
    ctx.font = "400 8px " + FONT;
    ctx.textAlign = "center";
    const tx = Math.max(30, Math.min(FW - 30, cx));
    const ty = cy < FH / 2 ? cy + 16 : cy - 10;
    ctx.fillText("INCOMING", tx, ty);
    ctx.globalAlpha = 1;
  }

  // ---- screen-edge arrows -------------------------------------------------
  // Quiet chevrons on an inset rect, one per direction to an enemy the
  // viewport has lost. Pure functions of live state (E.enemies, E.missiles,
  // cam, FW/FH, and E.waveTick for the halo's pulse clock): no rand(), no
  // Math.random(), no Date.now() — the draw path can never desync a replay.
  // Directions closer than a bucket apart merge into one arrow (the nearest
  // body of the bucket represents it) and a nearest-first cap bounds the
  // worst case, so a swarm behind you stays readable. HOT is the escalation:
  // a body whose telegraph is running right now — a harrier mid-lock, a
  // charger mid-windup — outranks proximity for its bucket's claim and
  // survives the cap first, because the marker's job in that moment is the
  // shooter, not the nearest walker standing in front of it.
  const ARROWS = { inset: 14, cap: 16, buckets: 48, far: 1200 };
  function computeEdgeArrows() {
    const vx = cam.x + FW / 2; // the view centre — position and heading share
    const vy = cam.y + FH / 2; // this ray, so an arrow points where it sits
    const slots = new Array(ARROWS.buckets).fill(null); // fixed slot order — deterministic
    // one bucket claim, shared by the bodies and the ordnance so both fold into
    // the SAME merge and the same nearest-wins rule
    const track = (o, type, hot) => {
      const sx = o.x - cam.x;
      const sy = o.y - cam.y;
      if (sx >= -o.r && sx <= FW + o.r && sy >= -o.r && sy <= FH + o.r) return; // any part visible — no arrow
      const dx = o.x - vx;
      const dy = o.y - vy;
      const dist = Math.hypot(dx, dy);
      const step = (2 * Math.PI) / ARROWS.buckets;
      const bi = ((Math.round(Math.atan2(dy, dx) / step) % ARROWS.buckets) + ARROWS.buckets) % ARROWS.buckets;
      const s = slots[bi];
      if (!s) slots[bi] = { dx, dy, dist, n: 1, type, bi, hot: !!hot };
      else {
        s.n++;
        // hot wins the bucket outright; among peers the nearest wins, as ever
        if ((hot && !s.hot) || (!!hot === !!s.hot && dist < s.dist)) {
          s.dx = dx; s.dy = dy; s.dist = dist; s.type = type; s.hot = !!hot;
        }
      }
    };
    for (const e of E.enemies) {
      if (e.hp <= 0) continue;
      // a radar variant resolves through its base archetype, so its telegraph
      // buys the same hot flag, scale and danger accent as the parent's —
      // never a silently quiet-steel chevron
      const kin = e.stats.base || e.type;
      track(e, kin, (kin === "harrier" && e.mode === "lockon") ||
                    (kin === "charger" && e.mode === "windup"));
    }
    // missiles earn arrows too: a 512×342 window on a 3072×3762 world makes an
    // unheralded off-screen seeker unfair, and a harrier that fires from
    // outside the view is exactly the case this layer was built for
    for (const m of E.missiles) track(m, "missile");
    const hw = FW / 2 - ARROWS.inset;
    const hh = FH / 2 - ARROWS.inset;
    return slots.filter(Boolean)
      .sort((a, b) => (b.hot ? 1 : 0) - (a.hot ? 1 : 0) || a.dist - b.dist || a.bi - b.bi) // hot first,
      .slice(0, ARROWS.cap)                     // then nearest; explicit tie-break — deterministic order
      .map((s) => {
        // an off-screen body always overshoots one half-extent, so k < 1 and
        // the arrow lands exactly ON the inset rect — inside the field clip,
        // never in the letterbox bars
        const k = Math.min(hw / Math.max(Math.abs(s.dx), 1e-9), hh / Math.max(Math.abs(s.dy), 1e-9));
        return { x: FW / 2 + s.dx * k, y: FH / 2 + s.dy * k,
          ang: Math.atan2(s.dy, s.dx), dist: s.dist, n: s.n, type: s.type, hot: s.hot };
      });
  }
  // per-type chevron size and colour, as two small lookups rather than a
  // growing ternary. Size is mass — the heavies read bigger, ordnance smaller.
  // The danger accent has two grades. The standing accent (colour) goes to the
  // three things that can reach you from where they are: the charger (as it
  // always did), the harrier that shoots across the field, and the missile
  // already on its way. The bodies that have to walk to you keep the quiet
  // steel. HOT is the second grade — the telegraph is running RIGHT NOW —
  // and it buys full strength and a pulsing halo, so the one chevron that is
  // about to cost a hull reads over every quiet one on the rect.
  const ARROW_SCALE = { charger: 1.25, anvil: 1.25, husk: 1.15, missile: 0.7 };
  const ARROW_ACCENT = { charger: true, harrier: true, missile: true };
  function drawEdgeArrows() {
    for (const a of computeEdgeArrows()) {
      const sc = (ARROW_SCALE[a.type] || 1) * (1 + Math.min(a.n - 1, 3) * 0.15);
      ctx.save();
      ctx.globalAlpha = a.hot ? 0.9
        : 0.3 + 0.45 * Math.max(0, Math.min(1, 1 - a.dist / ARROWS.far));
      ctx.translate(a.x, a.y);
      ctx.rotate(a.ang);
      ctx.scale(sc, sc);
      ctx.fillStyle = ARROW_ACCENT[a.type] ? C.clay : "#9aa3b2";
      ctx.beginPath(); // the incoming-marker chevron, same proportions
      ctx.moveTo(7, 0);
      ctx.lineTo(-4, 5);
      ctx.lineTo(-1, 0);
      ctx.lineTo(-4, -5);
      ctx.closePath();
      ctx.fill();
      if (a.hot) {
        // the telegraph halo: an expanding, fading ring, pulsed off the SIM
        // tick — the same determinism contract as the geometry above, and it
        // freezes with the sim, which is honest: a paused lock is not
        // advancing on you. One pulse per half second, comfortably inside
        // the 45-tick lock, so even the first lock of a wave pulses.
        const ph = (E.waveTick % 30) / 30;
        ctx.globalAlpha = 0.7 * (1 - ph);
        ctx.strokeStyle = C.clay;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 6 + ph * 8, 0, 2 * Math.PI);
        ctx.stroke();
      }
      ctx.restore(); // restore() puts globalAlpha back — nothing leaks
    }
  }

  // ---- the shop's geometry -----------------------------------------------
  // ONE table, one derivation. The hit test and the draw both read shopLayout()
  // and nothing else, so a card the pointer lands on is always the card the
  // pointer is over. Everything is in LOGICAL FIELD coordinates — the UI pass's
  // space — and game.js converts the native pointer into it (pointerField).
  //
  // The numbers: three 140 px columns and two rows fit 512 × 342 with 36 px of
  // field either side of the grid, and leave the strip from y=272 down for the
  // detail line, the button and the standing-by note. Appending a seventh row
  // deals a third row of cards at y=276, which would run off the field — that
  // is the growth limit this layout has, and it is deliberate: six is what the
  // field holds without a scroll the mouse would then have to drive.
  const SHOPUI = {
    cols: 3,
    cardW: 140, cardH: 104, gapX: 10, gapY: 10,
    gridY: 48,       // clear of the header band
    icon: 44,        // the PNG's drawn size — the 192 px asset downscales into it
    titleY: 26,
    detailY: 282,
    btnW: 168, btnH: 24, btnY: 296,
    noteY: 334,
    popH: 96, // the hover art's height; its WIDTH follows game.js's RING_RATIO,
              // so cropping the asset changes the popup's shape and nothing else
  };

  function shopLayout() {
    const S = SHOPUI;
    const rows = Math.ceil(SHOP.length / S.cols);
    const gridW = S.cols * S.cardW + (S.cols - 1) * S.gapX;
    const gridH = rows * S.cardH + (rows - 1) * S.gapY;
    const gridX = Math.round((FW - gridW) / 2);
    const cards = SHOP.map((row, i) => ({
      i,
      col: i % S.cols,
      row: Math.floor(i / S.cols),
      x: gridX + (i % S.cols) * (S.cardW + S.gapX),
      y: S.gridY + Math.floor(i / S.cols) * (S.cardH + S.gapY),
      w: S.cardW, h: S.cardH,
    }));
    return {
      rows, cards, icon: S.icon,
      grid: { x: gridX, y: S.gridY, w: gridW, h: gridH },
      btn: { x: Math.round((FW - S.btnW) / 2), y: S.btnY, w: S.btnW, h: S.btnH },
      titleY: S.titleY, detailY: S.detailY, noteY: S.noteY,
    };
  }

  // Where a row's big explainer art lands. It goes in whichever band — above
  // the hovered card or below it — has the most room, so the card the pointer
  // is resting on is never the one the popup covers. Clamped into the field on
  // both ends, so a layout change can shrink a band without pushing art off.
  function shopPopupRect(i) {
    const S = SHOPUI;
    const L = shopLayout();
    const c = L.cards[i];
    const w = Math.round(S.popH * RING_RATIO); // the asset's own cropped shape
    const topRoom = c.y - 8;                    // field top edge → the card
    const botRoom = (L.detailY - 14) - (c.y + c.h); // the card → the detail line
    let y = topRoom >= botRoom
      ? Math.round(4 + (topRoom - S.popH) / 2)
      : Math.round(c.y + c.h + 4 + (botRoom - 4 - S.popH) / 2);
    y = Math.max(4, Math.min(FH - S.popH - 4, y));
    return { x: Math.round((FW - w) / 2), y, w, h: S.popH };
  }

  const inRect = (x, y, r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

  // ---- the shop's input — the pointer, and only the pointer ---------------
  // game.js calls both of these with field coordinates. There is no keyboard
  // path: the digits and Enter are gone, so the cards and the button are the
  // whole interface and the hit test is the whole binding.
  function shopHover(x, y) {
    if (!shopOpen()) { E.shopHover = -1; E.shopBtn = false; return false; }
    const L = shopLayout();
    let hit = -1;
    for (const c of L.cards) {
      if (inRect(x, y, c)) { hit = c.i; break; }
    }
    E.shopHover = hit;
    E.shopBtn = hit < 0 && inRect(x, y, L.btn); // never both — a card wins the pixel
    return true;
  }

  // the shop can open under a pointer that then never moves, and a mousemove
  // is the only thing that would otherwise seed the hover — so read the cursor
  // game.js already tracks. No-ops before the page has seen a pointer at all.
  function shopHoverFromMouse() {
    if (!G.mouse.seen) return;
    const p = pointerField(G.mouse.x, G.mouse.y);
    if (p) shopHover(p.x, p.y);
  }

  // Returns whether the shop CONSUMED the click, which it does for every click
  // while it is open, hit or miss — game.js hands the field over wholesale, so
  // a click on the gap between cards must not fall through to fire() or to a
  // pointer-lock request. A click is its own hover: the pointer may have
  // arrived without a single mousemove landing on the card underneath it.
  function shopClick(x, y) {
    if (!shopOpen()) return false;
    shopHover(x, y);
    if (E.shopHover >= 0) buy(E.shopHover);
    else if (E.shopBtn) continueFromShop();
    return true;
  }

  // Is a hovered row's big explainer art on the screen right now? One answer,
  // read by everything the art displaces. The bitmap game.js owns is OPAQUE,
  // so whatever is already painted under it is not dimmed by it — it is cut in
  // half by its edges, which is worse than either covering it or leaving it
  // alone. The two layers that would be cut stand down while it is up: the
  // top-left status stack (the popup's left edge falls inside its column) and
  // game.js's corner map, exactly the pair the first-run card also suppresses.
  // The art only ever shows on the live shop screen under a live hover, so a
  // pause, a pointer that moves off the card, or the next wave brings both
  // straight back.
  function ringCardShown() {
    return shopOpen() && E.shopHover >= 0 && !!SHOP[E.shopHover].card && ringCardReady();
  }

  // The one question game.js's UI pass asks about suppression, and the one the
  // status stack below asks too. TWO things claim the screen. The live shop is
  // the broader case: it paints a scrim over the field and prints the wave,
  // the hull pips and the wallet in its own header, so the top-left stack and
  // the corner map are pure duplicates over the top of it. The hover art is
  // the narrower one, and applies on any screen it can reach.
  const hudSuppressed = () => shopOpen() || ringCardShown();

  // one card's picture, or the placeholder that stands in for bytes that never
  // arrived. alpha is how the unaffordable and the unavailable read as such —
  // the icons are flat single-purpose art, so dimming them beats recolouring.
  function drawShopIcon(i, x, y, size, alpha) {
    const rec = ICONS[i];
    ctx.save();
    ctx.globalAlpha = alpha;
    if (rec && rec.ok) {
      ctx.drawImage(rec.img, x, y, size, size);
    } else {
      ctx.strokeStyle = C.clay;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
      ctx.beginPath();
      ctx.moveTo(x + 9, y + 9);
      ctx.lineTo(x + size - 9, y + size - 9);
      ctx.moveTo(x + size - 9, y + 9);
      ctx.lineTo(x + 9, y + size - 9);
      ctx.stroke();
    }
    ctx.restore();
  }

  // the rank read-out under a card's price. A CAPPED row shows every slot it
  // will ever have, filled and empty, so "two of five" is one glance; an
  // uncapped doubling row has no denominator to draw, so it shows only what
  // was bought. A flat uncapped row (HULL PATCH) is a consumable whose count
  // means nothing to the player, and shows nothing at all.
  function drawShopPips(i, cx, y) {
    const row = SHOP[i];
    const slots = row.cap !== undefined ? row.cap : (row.curve === "double" ? E.owned[i] : 0);
    const n = Math.min(slots, 10); // the uncapped rows have no ceiling; the card does
    if (n <= 0) return;
    const pw = 5, pg = 3;
    let px = Math.round(cx - (n * pw + (n - 1) * pg) / 2);
    for (let k = 0; k < n; k++) {
      if (k < E.owned[i]) {
        ctx.fillStyle = C.clay;
        ctx.fillRect(px, y, pw, pw);
      } else {
        ctx.strokeStyle = C.wall;
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, y + 0.5, pw - 1, pw - 1);
      }
      px += pw + pg;
    }
  }

  function encDrawHud() {
    if (E.state === "idle") return;
    ctx.save();
    const wt = E.waveTick;
    const cardUp = ringCardShown();   // one read per frame — the stack and the
    const hudDown = hudSuppressed();  // overlay below cannot disagree about
    // either answer inside a single frame
    // --- off-screen trackers, first so everything else paints over them ---
    // a chevron parked on the inset rect's left column would otherwise sit on
    // top of the hull pips, the XP bar and the readouts below
    if (EDGEARROWS) drawEdgeArrows();
    // --- viewport HUD, top left ---
    ctx.textAlign = "left";
    if (!hudDown) { // see hudSuppressed() — the shop duplicates this column, the art slices it
      ctx.font = "700 10px " + FONT;
      ctx.fillStyle = C.bright;
      // the CLEAR header stays up through the shop, so it reads continuous
      // with the banner the player just watched fade
      ctx.fillText(E.state === "cleared" || E.state === "shop" ? "WAVE " + E.wave + " · CLEAR" : "WAVE " + E.wave, 8, 16);
      for (let i = 0; i < E.hullMax; i++) { // hull pips — the LIVE max, MAX HULL grows the row
        if (i < E.hull) {
          ctx.fillStyle = C.clay;
          ctx.fillRect(8 + i * 10, 21, 7, 7);
        } else {
          ctx.strokeStyle = C.dim;
          ctx.lineWidth = 1;
          ctx.strokeRect(8.5 + i * 10, 21.5, 6, 6);
        }
      }
      ctx.fillStyle = C.dim; // the wallet — a flat count; an uncapped wallet has no denominator to bar
      ctx.font = "400 9px " + FONT;
      ctx.fillText("XP " + E.xp, 8, 40);
      ctx.fillText("FOES " + (E.enemies.length + queuedCount()), 8, 51);
      // the line the deleted U hint freed, spent on the cheapest defence against
      // the likeliest bug report this change produces — "the keyboard does not
      // work". Dim and persistent, never pulsing: it is a standing fact about
      // the run, not a call to action, and it deletes itself on the purchase.
      if (!mods.keyThrust) ctx.fillText("THRUST LOCKED — SHOP", 8, 63);
    }
    // --- spawn warnings ---
    for (const g of E.groups) {
      if (g.points && !g.spawned) drawIncomingMarker(g.points.anchor, wt);
    }
    if (E.state === "warning") {
      ctx.textAlign = "center";
      ctx.font = "700 11px " + FONT;
      ctx.fillStyle = C.clay;
      ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(wt * 0.12));
      ctx.fillText("HOSTILES INBOUND", FW / 2, 30);
      ctx.globalAlpha = 1;
    }
    // --- hit feedback: a border flash while the hit registers ---
    if (E.hitFlash > 0) {
      ctx.strokeStyle = C.clay;
      ctx.globalAlpha = (E.hitFlash / 20) * 0.6;
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, FW - 6, FH - 6);
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
    }
    // --- state overlays ---
    if (E.state === "cleared" && wt - E.clearTick < ECFG.clearHold) {
      const left = ECFG.clearHold - (wt - E.clearTick);
      ctx.globalAlpha = Math.min(1, left / 60); // the banner fades out
      ctx.textAlign = "center";
      ctx.font = "700 15px " + FONT;
      ctx.fillStyle = C.bright;
      ctx.fillText("WAVE " + E.wave + " CLEAR", FW / 2, FH / 2 - 8);
      ctx.font = "400 10px " + FONT;
      ctx.fillStyle = C.dim;
      ctx.fillText("salvage sweeping in · shop opening", FW / 2, FH / 2 + 12); // it promises
      // the menu it delivers now, not the wave the old flow dealt here
      ctx.globalAlpha = 1;
    } else if (E.state === "shop" && G.running) {
      // the && G.running: a frozen shop keeps the loop's flag up, so pausing
      // over it is reachable (Escape, alt-tab, lock loss) — and the pause
      // copy prints into this overlay's lower band, straight through the
      // NEXT WAVE button. Paused, the overlay stands down and the pause
      // screen owns the canvas — the same deal the dev panel gets — and the
      // resume click brings the shop back exactly as it was left.
      //
      // Everything below is a MOUSE surface: the six cards and the button are
      // the whole interface, laid out by shopLayout() and hit-tested against
      // the very same rects, so what lights up under the pointer is always
      // what a click would buy.
      const L = shopLayout();
      ctx.fillStyle = "rgba(14, 17, 25, 0.9)";
      ctx.fillRect(0, 0, FW, FH);
      // --- header: SHOP, the hull the next wave starts on, and the wallet ---
      // the wallet is the number every click is decided against, so it wears
      // the accent and sits at the grid's right edge where the prices line up
      ctx.textAlign = "left";
      ctx.font = "700 13px " + FONT;
      ctx.fillStyle = C.bright;
      ctx.fillText("SHOP", L.grid.x, L.titleY);
      ctx.textAlign = "right";
      ctx.fillStyle = C.clay;
      ctx.fillText("XP " + E.xp, L.grid.x + L.grid.w, L.titleY);
      for (let i = 0; i < E.hullMax; i++) { // the HUD's own pip row, centred in the header
        const px = FW / 2 - (E.hullMax * 10 - 3) / 2 + i * 10;
        if (i < E.hull) {
          ctx.fillStyle = C.clay;
          ctx.fillRect(px, L.titleY - 8, 7, 7);
        } else {
          ctx.strokeStyle = C.dim;
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, L.titleY - 7.5, 6, 6);
        }
      }
      // --- the cards ---
      SHOP.forEach((row, i) => {
        const c = L.cards[i];
        const maxed = shopMaxed(i);
        const offered = !row.can || row.can(); // rows never hide — a card that
                                               // leaves the shelf stays in place, greyed
        const cost = shopCost(i);
        const buyable = !maxed && offered && E.xp >= cost;
        const hot = E.shopHover === i;
        ctx.fillStyle = hot ? "#161b28" : C.fieldBg; // the panel lifts under the pointer
        ctx.fillRect(c.x, c.y, c.w, c.h);
        ctx.lineWidth = 1;
        ctx.strokeStyle = hot ? (buyable ? C.clay : C.dim) : (buyable ? C.dim : C.wall);
        ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1);
        drawShopIcon(i, c.x + (c.w - L.icon) / 2, c.y + 8, L.icon, buyable || hot ? 1 : 0.4);
        ctx.textAlign = "center";
        ctx.font = "700 10px " + FONT;
        ctx.fillStyle = buyable ? C.bright : C.dim;
        ctx.fillText(row.name, c.x + c.w / 2, c.y + 68);
        ctx.font = "700 10px " + FONT;
        ctx.fillStyle = buyable ? C.clay : C.dim;
        ctx.fillText(maxed ? "MAXED" : offered ? cost + " XP" : "—", c.x + c.w / 2, c.y + 83);
        drawShopPips(i, c.x + c.w / 2, c.y + 90);
      });
      // --- the detail line: what the hovered card does, and why it will not sell ---
      ctx.textAlign = "center";
      ctx.font = "400 10px " + FONT;
      ctx.fillStyle = C.dim;
      if (E.shopHover >= 0) {
        const row = SHOP[E.shopHover];
        const cost = shopCost(E.shopHover);
        const owned = E.owned[E.shopHover];
        const why = shopMaxed(E.shopHover) ? "fully upgraded"
          : row.can && !row.can() ? "not needed right now"
          : E.xp < cost ? "need " + (cost - E.xp) + " more XP"
          : null;
        ctx.fillText(row.desc + (owned ? " · owned " + owned : "") + (why ? " · " + why : ""),
                     FW / 2, L.detailY);
      } else {
        ctx.fillText("click an upgrade to buy it", FW / 2, L.detailY);
      }
      // --- the way out, and the only other click target on the screen ---
      const b = L.btn;
      ctx.fillStyle = E.shopBtn ? "#1b2233" : C.fieldBg;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.lineWidth = 1;
      ctx.strokeStyle = E.shopBtn ? C.clay : C.dim;
      ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
      ctx.font = "700 11px " + FONT;
      ctx.fillStyle = E.shopBtn ? C.bright : C.clay;
      ctx.fillText("NEXT WAVE ▸", b.x + b.w / 2, b.y + 16);
      ctx.font = "400 9px " + FONT;
      ctx.fillStyle = C.dim;
      ctx.fillText("WAVE " + (E.wave + 1) + " STANDING BY", FW / 2, L.noteY);
      // --- the hovered row's own art, over everything it explains ---
      // cardUp is the frame's single read, taken at the top of this function,
      // so the status stack and the corner map it displaces and the art itself
      // all answer to one call. game.js owns the bitmap; shopPopupRect owns
      // where it lands, always in the band the hovered card is NOT in.
      if (cardUp) {
        const p = shopPopupRect(E.shopHover);
        ctx.fillStyle = C.fieldBg;
        ctx.fillRect(p.x - 4, p.y - 4, p.w + 8, p.h + 8);
        ctx.lineWidth = 1;
        ctx.strokeStyle = C.clay;
        ctx.strokeRect(p.x - 3.5, p.y - 3.5, p.w + 7, p.h + 7);
        drawRingCard(p.x, p.y, p.w, p.h);
      }
    } else if (E.state === "dead") {
      ctx.fillStyle = "rgba(14, 17, 25, 0.78)";
      ctx.fillRect(0, 0, FW, FH);
      ctx.textAlign = "center";
      ctx.font = "700 15px " + FONT;
      ctx.fillStyle = C.clay;
      ctx.fillText("SHIP DESTROYED", FW / 2, FH / 2 - 8);
      ctx.font = "400 10px " + FONT;
      ctx.fillStyle = C.dim;
      ctx.fillText("press R to restart from wave 1 — tuner settings survive", FW / 2, FH / 2 + 12);
    }
    ctx.restore();
  }

  // ---- input — the overlay keys ------------------------------------------
  // The shop binds NO keys at all: it is a pointer surface, and game.js hands
  // it every click on the field while it is open (see shopClick). The digits
  // and Enter that used to buy and continue are gone on purpose — one input
  // scheme per screen, and a key that silently still worked would be the only
  // thing on the screen with no picture. The death screen's R is what is left.
  document.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "KeyR" && E.state === "dead") {
      e.preventDefault();
      restart();
      // R works on the paused death screen too, where the loop is stopped —
      // repaint so the overlay never shows a stale instruction
      if (!G.running) render();
    }
  });

  // ---- enemy tuning surface — one row per slider --------------------------
  // get/set are closures over ECFG fields (set writes the BASELINE — statsFor's
  // wave scaling still applies on top). After any set, the panel calls
  // refresh() so the live wave's bodies retune this tick. Consumes no rand():
  // the seeded schedule is identical at every slider position.
  // EXCLUDED on purpose: `seed` (identity of the deal), the `orb` block,
  // spawnGap/minPlayerDist/clearHold/enemy.jitter (placement and pacing, not
  // combat feel), every `r` field (hitbox identity) and every `dmg` field
  // except contact.dmgToPlayer (damage integers are design decisions, not dials).
  // Secondary knobs (per-kind steer/band/sepR beyond dart+shard, husk.push,
  // missile hp/trail, orbDrop) stay out too — the rows below are the feel set.
  // statsFor's hard floors (dart cooldown 72, harrier cooldown 90, charger
  // rest 54) stay in statsFor — sliders move the baselines under them.
  const TUNING = {
    groups: [ // display order; one titled section per group in the enemies tab
      { key: "dart", label: "DART + LANCE", rows: [
        { id: "dart-hp", label: "hp", min: 1, max: 12, step: 1,
          get: () => ECFG.enemy.hp, set: (v) => { ECFG.enemy.hp = v; },
          fmt: (v) => v + " base · " + (E.stats ? E.stats.dart.hp + " live @ w" + E.wave : "no wave") + " · +1 per 3 waves (cap +4)" },
        { id: "dart-max-speed", label: "max speed", min: 1.2, max: 6, step: 0.05,
          get: () => ECFG.enemy.maxSpeed, set: (v) => { ECFG.enemy.maxSpeed = v; },
          fmt: (v) => v.toFixed(2) + " px/tick base · " + (E.stats ? E.stats.dart.maxSpeed.toFixed(2) + " live @ w" + E.wave : "no wave") },
        { id: "dart-steer", label: "steer", min: 0.02, max: 0.2, step: 0.001,
          get: () => ECFG.enemy.steer, set: (v) => { ECFG.enemy.steer = v; },
          fmt: (v) => v.toFixed(3) + " of (target − velocity) per tick" },
        { id: "dart-prefer", label: "prefer ring", min: 40, max: 240, step: 1,
          get: () => ECFG.enemy.prefer, set: (v) => { ECFG.enemy.prefer = v; },
          fmt: (v) => v + " px ring around the player" },
        { id: "dart-band", label: "band", min: 4, max: 48, step: 1,
          get: () => ECFG.enemy.band, set: (v) => { ECFG.enemy.band = v; },
          fmt: (v) => v + " px hold tolerance" },
        { id: "dart-back-speed", label: "back speed", min: 0.4, max: 3, step: 0.05,
          get: () => ECFG.enemy.backSpeed, set: (v) => { ECFG.enemy.backSpeed = v; },
          fmt: (v) => v.toFixed(2) + " px/tick retreat" },
        { id: "dart-sep-r", label: "separation", min: 12, max: 90, step: 1,
          get: () => ECFG.enemy.sepR, set: (v) => { ECFG.enemy.sepR = v; },
          fmt: (v) => v + " px between pack members" },
        { id: "dart-lance-engage", label: "lance engage", min: 55, max: 300, step: 1,
          get: () => ECFG.lance.engage, set: (v) => { ECFG.lance.engage = v; },
          fmt: (v) => v + " px — telegraph starts inside this" },
        { id: "dart-lance-len", label: "lance length", min: 60, max: 300, step: 1,
          get: () => ECFG.lance.len, set: (v) => { ECFG.lance.len = v; },
          fmt: (v) => v + " px beam" },
        { id: "dart-lance-half-width", label: "lance half-width", min: 1, max: 8, step: 0.05,
          get: () => ECFG.lance.halfWidth, set: (v) => { ECFG.lance.halfWidth = v; },
          fmt: (v) => v.toFixed(2) + " px half-width" },
        { id: "dart-lance-telegraph", label: "telegraph", min: 15, max: 120, step: 1,
          get: () => ECFG.lance.telegraph, set: (v) => { ECFG.lance.telegraph = v; },
          fmt: (v) => v + " ticks · " + (v / 60).toFixed(2) + " s of warning" },
        { id: "dart-lance-pulse", label: "pulse", min: 4, max: 40, step: 1,
          get: () => ECFG.lance.pulse, set: (v) => { ECFG.lance.pulse = v; },
          fmt: (v) => v + " ticks beam live" },
        { id: "dart-lance-cooldown", label: "lance cooldown", min: 60, max: 360, step: 1,
          get: () => ECFG.lance.cooldown, set: (v) => { ECFG.lance.cooldown = v; },
          fmt: (v) => v + " ticks base · " + (E.stats ? E.stats.dart.cooldown + " live @ w" + E.wave : "no wave") + " · floor 72" },
      ]},
      { key: "charger", label: "CHARGER", rows: [
        { id: "charger-hp", label: "hp", min: 1, max: 20, step: 1,
          get: () => ECFG.charger.hp, set: (v) => { ECFG.charger.hp = v; },
          fmt: (v) => v + " base · " + (E.stats ? E.stats.charger.hp + " live @ w" + E.wave : "no wave") },
        { id: "charger-max-speed", label: "max speed", min: 0.8, max: 4, step: 0.05,
          get: () => ECFG.charger.maxSpeed, set: (v) => { ECFG.charger.maxSpeed = v; },
          fmt: (v) => v.toFixed(2) + " px/tick base · " + (E.stats ? E.stats.charger.maxSpeed.toFixed(2) + " live @ w" + E.wave : "no wave") },
        { id: "charger-prefer", label: "prefer ring", min: 75, max: 400, step: 1,
          get: () => ECFG.charger.prefer, set: (v) => { ECFG.charger.prefer = v; },
          fmt: (v) => v + " px ring around the player" },
        { id: "charger-engage", label: "engage", min: 130, max: 600, step: 1,
          get: () => ECFG.charger.engage, set: (v) => { ECFG.charger.engage = v; },
          fmt: (v) => v + " px — a rested charger plants inside this" },
        { id: "charger-windup", label: "windup", min: 15, max: 150, step: 1,
          get: () => ECFG.charger.windup, set: (v) => { ECFG.charger.windup = v; },
          fmt: (v) => v + " ticks planted · " + (v / 60).toFixed(2) + " s · dash line locks at start" },
        { id: "charger-dash-speed", label: "dash speed", min: 3, max: 16, step: 0.05,
          get: () => ECFG.charger.dashSpeed, set: (v) => { ECFG.charger.dashSpeed = v; },
          fmt: (v) => v.toFixed(2) + " px/tick along the locked line — never wave-scaled" },
        { id: "charger-dash-ticks", label: "dash ticks", min: 10, max: 80, step: 1,
          get: () => ECFG.charger.dashTicks, set: (v) => { ECFG.charger.dashTicks = v; },
          fmt: (v) => v + " ticks · " + Math.round(v * ECFG.charger.dashSpeed) + " px of travel" },
        { id: "charger-rest", label: "rest", min: 45, max: 300, step: 1,
          get: () => ECFG.charger.rest, set: (v) => { ECFG.charger.rest = v; },
          fmt: (v) => v + " ticks base · " + (E.stats ? E.stats.charger.rest + " live @ w" + E.wave : "no wave") + " · floor 54" },
        { id: "charger-cooldown", label: "cooldown", min: 10, max: 120, step: 1,
          get: () => ECFG.charger.cooldown, set: (v) => { ECFG.charger.cooldown = v; },
          fmt: (v) => v + " seek ticks before the next lunge" },
      ]},
      { key: "harrier", label: "HARRIER", rows: [
        { id: "harrier-hp", label: "hp", min: 1, max: 16, step: 1,
          get: () => ECFG.harrier.hp, set: (v) => { ECFG.harrier.hp = v; },
          fmt: (v) => v + " base · " + (E.stats ? E.stats.harrier.hp + " live @ w" + E.wave : "no wave") },
        { id: "harrier-max-speed", label: "max speed", min: 0.6, max: 3, step: 0.05,
          get: () => ECFG.harrier.maxSpeed, set: (v) => { ECFG.harrier.maxSpeed = v; },
          fmt: (v) => v.toFixed(2) + " px/tick approach — never wave-scaled" },
        { id: "harrier-back-speed", label: "back speed", min: 0.8, max: 4, step: 0.05,
          get: () => ECFG.harrier.backSpeed, set: (v) => { ECFG.harrier.backSpeed = v; },
          fmt: (v) => v.toFixed(2) + " px/tick retreat — the kite needs this above approach" },
        { id: "harrier-prefer", label: "prefer ring", min: 120, max: 480, step: 1,
          get: () => ECFG.harrier.prefer, set: (v) => { ECFG.harrier.prefer = v; },
          fmt: (v) => v + " px standoff ring" },
        { id: "harrier-band", label: "band", min: 10, max: 90, step: 1,
          get: () => ECFG.harrier.band, set: (v) => { ECFG.harrier.band = v; },
          fmt: (v) => v + " px hold tolerance" },
        { id: "harrier-engage", label: "engage", min: 135, max: 540, step: 1,
          get: () => ECFG.harrier.engage, set: (v) => { ECFG.harrier.engage = v; },
          fmt: (v) => v + " px — lock-on opens inside this" },
        { id: "harrier-lockon", label: "lock-on", min: 25, max: 150, step: 1,
          get: () => ECFG.harrier.lockon, set: (v) => { ECFG.harrier.lockon = v; },
          fmt: (v) => v + " ticks planted · " + (v / 60).toFixed(2) + " s" },
        { id: "harrier-cooldown", label: "cooldown", min: 75, max: 480, step: 1,
          get: () => ECFG.harrier.cooldown, set: (v) => { ECFG.harrier.cooldown = v; },
          fmt: (v) => v + " ticks base · " + (E.stats ? E.stats.harrier.cooldown + " live @ w" + E.wave : "no wave") + " · floor 90" },
      ]},
      { key: "missile", label: "SEEKER MISSILE", rows: [
        { id: "missile-speed", label: "speed", min: 3, max: 12, step: 0.05,
          get: () => ECFG.missile.speed, set: (v) => { ECFG.missile.speed = v; },
          fmt: (v) => v.toFixed(2) + " px/tick · " + Math.round(v * 60) + " px/s" },
        { id: "missile-life", label: "life", min: 45, max: 240, step: 1,
          get: () => ECFG.missile.life, set: (v) => { ECFG.missile.life = v; },
          fmt: (v) => v + " ticks · " + (v / 60).toFixed(2) + " s · " + Math.round(v * ECFG.missile.speed) + " px of reach" },
        { id: "missile-turn", label: "turn", min: 0.008, max: 0.06, step: 0.001,
          get: () => ECFG.missile.turn, set: (v) => { ECFG.missile.turn = v; },
          fmt: (v) => v.toFixed(3) + " rad/tick · " + Math.round((ECFG.missile.life - ECFG.missile.arm - ECFG.missile.decay / 2) * v * 180 / Math.PI) + "° of heading authority" },
        { id: "missile-arm", label: "arm", min: 0, max: 45, step: 1,
          get: () => ECFG.missile.arm, set: (v) => { ECFG.missile.arm = v; },
          fmt: (v) => v + " ticks ballistic at launch" },
        { id: "missile-decay", label: "decay", min: 0, max: 90, step: 1,
          get: () => ECFG.missile.decay, set: (v) => { ECFG.missile.decay = v; },
          fmt: (v) => v + " final ticks of fading steering" },
        { id: "missile-max", label: "max in flight", min: 1, max: 24, step: 1,
          get: () => ECFG.missile.max, set: (v) => { ECFG.missile.max = v; },
          fmt: (v) => v + " live missiles — a guard, not a mechanic" },
      ]},
      { key: "anvil", label: "ANVIL", rows: [
        { id: "anvil-hp", label: "hp", min: 3, max: 30, step: 1,
          get: () => ECFG.anvil.hp, set: (v) => { ECFG.anvil.hp = v; },
          fmt: (v) => v + " base · " + (E.stats ? E.stats.anvil.hp + " live @ w" + E.wave : "no wave") },
        { id: "anvil-max-speed", label: "max speed", min: 0.5, max: 2.4, step: 0.05,
          get: () => ECFG.anvil.maxSpeed, set: (v) => { ECFG.anvil.maxSpeed = v; },
          fmt: (v) => v.toFixed(2) + " px/tick — must stay under the ship's 2.0 to keep the escape promise" },
        { id: "anvil-turn-rate", label: "turn rate", min: 0.005, max: 0.06, step: 0.001,
          get: () => ECFG.anvil.turnRate, set: (v) => { ECFG.anvil.turnRate = v; },
          fmt: (v) => v.toFixed(3) + " rad/tick · out-turned inside " + Math.round(2.0 / v) + " px" },
        { id: "anvil-flee", label: "flee", min: 80, max: 480, step: 1,
          get: () => ECFG.anvil.flee, set: (v) => { ECFG.anvil.flee = v; },
          fmt: (v) => v + " px — flanked inside this, it runs along its own facing" },
        // the stored value is the radian half-angle; convert only at this
        // boundary so the exact radians round-trip without drift
        { id: "anvil-arc", label: "shield arc", min: 20, max: 170, step: 1,
          get: () => ECFG.anvil.arc * 180 / Math.PI,
          set: (v) => { ECFG.anvil.arc = v * Math.PI / 180; },
          fmt: (v) => "±" + Math.round(v) + "° half-angle · " + Math.round(v * 2) + "° of cover" },
      ]},
      { key: "husk", label: "HUSK + SHARD", rows: [
        { id: "husk-hp", label: "hp", min: 2, max: 24, step: 1,
          get: () => ECFG.husk.hp, set: (v) => { ECFG.husk.hp = v; },
          fmt: (v) => v + " base · " + (E.stats ? E.stats.husk.hp + " live @ w" + E.wave : "no wave") },
        { id: "husk-max-speed", label: "max speed", min: 0.4, max: 2, step: 0.05,
          get: () => ECFG.husk.maxSpeed, set: (v) => { ECFG.husk.maxSpeed = v; },
          fmt: (v) => v.toFixed(2) + " px/tick drift" },
        { id: "husk-split", label: "split", min: 1, max: 8, step: 1,
          get: () => ECFG.husk.split, set: (v) => { ECFG.husk.split = v; },
          fmt: (v) => v + " shards on the death fan" },
        { id: "husk-kick", label: "kick", min: 1, max: 6, step: 0.05,
          get: () => ECFG.husk.kick, set: (v) => { ECFG.husk.kick = v; },
          fmt: (v) => v.toFixed(2) + " px/tick outward on each shard" },
        { id: "husk-shard-hp", label: "shard hp", min: 1, max: 8, step: 1,
          get: () => ECFG.shard.hp, set: (v) => { ECFG.shard.hp = v; },
          fmt: (v) => v + " base · " + (E.stats ? E.stats.shard.hp + " live @ w" + E.wave : "no wave") },
        { id: "husk-shard-max-speed", label: "shard max speed", min: 1.4, max: 6, step: 0.05,
          get: () => ECFG.shard.maxSpeed, set: (v) => { ECFG.shard.maxSpeed = v; },
          fmt: (v) => v.toFixed(2) + " px/tick — above the ship's 2.0 so it must be shot" },
        { id: "husk-shard-steer", label: "shard steer", min: 0.03, max: 0.25, step: 0.001,
          get: () => ECFG.shard.steer, set: (v) => { ECFG.shard.steer = v; },
          fmt: (v) => v.toFixed(3) + " of (target − velocity) per tick" },
      ]},
      { key: "radar", label: "RADAR VARIANTS", rows: [
        { id: "radar-lead-scale", label: "lead scale", min: 0, max: 1.5, step: 0.05,
          get: () => ECFG.radar.leadScale, set: (v) => { ECFG.radar.leadScale = v; },
          fmt: (v) => v.toFixed(2) + "× of full lead · 0 = aims like the base type" },
        { id: "radar-deadband", label: "vel deadband", min: 0, max: 1, step: 0.05,
          get: () => ECFG.radar.deadband, set: (v) => { ECFG.radar.deadband = v; },
          fmt: (v) => v.toFixed(2) + " px/tick · below it a ship reads as still" },
        { id: "radar-missile-turn", label: "missile turn", min: 0, max: 0.03, step: 0.001,
          get: () => ECFG.radar.missileTurn, set: (v) => { ECFG.radar.missileTurn = v; },
          fmt: (v) => v.toFixed(3) + " rad/tick · 0 = ballistic predictor (base seeker: " + ECFG.missile.turn.toFixed(3) + ")" },
      ]},
      { key: "player", label: "PLAYER + CONTACT", rows: [
        { id: "player-hull", label: "hull", min: 1, max: 10, step: 1,
          get: () => ECFG.player.hull, set: (v) => { ECFG.player.hull = v; },
          fmt: (v) => v + " hull — applies on the next restart, not the live run" },
        { id: "player-invuln", label: "invuln", min: 20, max: 240, step: 1,
          get: () => ECFG.player.invuln, set: (v) => { ECFG.player.invuln = v; },
          fmt: (v) => v + " ticks · " + (v / 60).toFixed(2) + " s of post-hit grace" },
        { id: "player-contact-dmg", label: "contact dmg", min: 0, max: 4, step: 1,
          get: () => ECFG.contact.dmgToPlayer, set: (v) => { ECFG.contact.dmgToPlayer = v; },
          fmt: (v) => v + " hull per body contact" },
      ]},
    ],
    // Re-resolve the live wave's stats IN PLACE. Object.assign into the
    // existing objects preserves the identity every body's e.stats references,
    // so live bodies see new values on their next tick; hp/r are per-body
    // copies and apply from the next spawn.
    refresh() {
      if (!E.stats) return; // no wave dealt yet — the next startWave resolves fresh
      const ns = statsFor(E.wave);
      for (const k of ROSTER) Object.assign(E.stats[k], ns[k]);
    },
  };

  // ---- publish — one namespace, one assignment ---------------------------
  restart(ECFG.seed);
  window.Encounter = { step: encStep, draw: encDraw, drawHud: encDrawHud, frozen, mods, reset: restart,
    // The simulation event stream — see the queue at the top of the file.
    // Drained once per step() by the presentation side; events() is the
    // readonly view of what this tick queued.
    events, drainEvents,
    // emit is published for the ONE crossing that runs the other way:
    // game.js owns the ship's own cues (fire, the wall thud, the wall tick)
    // and queues them here, defensively, exactly as it reads everything
    // else off this namespace.
    emit,
    // Entity identity — the monotonic counter every constructor stamps from.
    // Published so game.js's bullets draw from the SAME id space as the
    // bodies: a replication layer keys by id alone.
    nextId,
    // read-only live positions for game.js HUD layers — the minimap contact
    // dots today. Callers draw from these arrays and never mutate them;
    // render-path only, so the one tiny wrapper object per call is free and
    // the seeded stream is untouched. restart() REPLACES E.enemies/E.orbs, so
    // callers read through this accessor every frame instead of caching it.
    mapState: () => ({ enemies: E.enemies, orbs: E.orbs }),
    // the one question game.js's UI pass has to ask this file: is a row's
    // hover art on the screen? The corner map lives inside its rect and stands
    // down while it is up — see ringCardShown()
    ringCardShown, hudSuppressed,
    // the shop's pointer surface. game.js owns the native pointer and the
    // conversion into field coordinates; this file owns every rect and every
    // decision made against one. shopOpen() is the cheap gate the flight-path
    // mousemove reads before it converts anything at all.
    shopOpen, shopScreen, shopHover, shopClick,
    // ...and the seed the resume needs: a pause can move the pointer far from
    // whatever was hovered when it began, and a paused shop takes no mousemove
    shopSeedHover: shopHoverFromMouse,
    // the enemy tuning surface — inert until a set() is called; the panel in
    // game.js owns the controls, this file owns the fields and the refresh
    tuning: TUNING };

  // ---- test hook extension — deterministic checks drive the slice --------
  function snapState() {
    return {
      state: E.state,
      wave: E.wave,
      waveTick: E.waveTick,
      hull: E.hull,
      hullMax: E.hullMax,
      xp: E.xp,
      owned: E.owned.slice(), // a copy — checks compare before/after freely
      invuln: E.invuln,
      enemies: E.enemies.length,
      // darts and chargers stay as their own fields — the suite reads them —
      // and byType is the general answer beside them, every roster key always
      // present (0 when absent) so a check never distinguishes missing from none
      darts: E.enemies.reduce((n, e) => n + (e.type === "dart" ? 1 : 0), 0),
      chargers: E.enemies.reduce((n, e) => n + (e.type === "charger" ? 1 : 0), 0),
      byType: E.enemies.reduce((m, e) => { m[e.type] = (m[e.type] || 0) + 1; return m; },
                               ROSTER.reduce((m, t) => { m[t] = 0; return m; }, {})),
      missiles: E.missiles.length,
      missilesShot: E.missilesShot,
      orbs: E.orbs.length,
      queued: queuedCount(),
      kills: E.kills,
      hitsDealt: E.hitsDealt,
      hitsTaken: E.hitsTaken,
      contactsDealt: E.contactsDealt,
      mods: { cool: mods.cool, speed: mods.speed, keyThrust: mods.keyThrust, blast: mods.blast },
      shopHover: E.shopHover, // the card under the pointer, or -1 — the shop's whole input state
      shopBtn: E.shopBtn,     // ...and whether NEXT WAVE has it instead
      stats: E.stats, // replaced each wave; tuning.refresh() retunes its members in
                      // place — handed out by reference so callers see live retunes
      groups: E.groups.map((g) => ({ spawned: g.spawned, warned: !!g.points })),
    };
  }
  // The encounter's contribution to the harness state hash. The allow-list
  // contract matches game.js's: a field belongs here iff it describes what the
  // simulation will do next — a missile's trail and the shop's hover state are
  // presentation, E.stats is a pure function of the wave, and all three stay
  // out. Declared lists, never Object.keys, so a later phase adding a field
  // cannot silently re-key every committed fixture.
  const ENEMY_HASH = ["x", "y", "vx", "vy", "r", "hp", "type", "orbDrop", "mode",
    "cd", "t", "face", "lockA", "flash", "pulseHit", "dashHit", "contactCd", "contactTaken"];
  const MISSILE_HASH = ["x", "y", "vx", "vy", "r", "hp", "age"];
  const ORB_HASH = ["x", "y", "vx", "vy"];
  const GROUP_HASH = ["count", "type", "warnAt", "spawnAt", "spawned"];
  function hashEncounter(h) {
    h.str(E.state);
    h.num(E.wave); h.num(E.waveTick); h.num(E.clearTick);
    h.num(E.hull); h.num(E.hullMax); h.num(E.xp);
    h.u32(E.owned.length);
    for (const n of E.owned) h.num(n);
    h.num(E.invuln); h.num(E.hitFlash);
    h.u32(E.shipPrev ? 1 : 0);
    if (E.shipPrev) { h.num(E.shipPrev.x); h.num(E.shipPrev.y); }
    h.num(E.kills); h.num(E.missilesShot);
    h.num(E.hitsDealt); h.num(E.hitsTaken); h.num(E.contactsDealt);
    h.num(mods.cool); h.num(mods.speed); h.u32(mods.keyThrust ? 1 : 0); h.num(mods.blast);
    h.u32(E.groups.length);
    for (const g of E.groups) {
      for (const f of GROUP_HASH) h.val(g[f]);
      h.u32(g.points ? 1 : 0);
      if (g.points) {
        h.num(g.points.anchor.x); h.num(g.points.anchor.y);
        for (const p of g.points.pts) { h.num(p.x); h.num(p.y); }
      }
    }
    // enemies walk grouped in ROSTER order, so a new archetype cannot escape
    // the hash without being admitted here — and a type with zero live members
    // contributes NOTHING (no name, no zero count), so roster growth alone can
    // never move a committed hash. The live index folds with each body because
    // array order is itself simulation state: the separation pass and the
    // bullet arbitration both walk it.
    for (const type of ROSTER) {
      for (let i = 0; i < E.enemies.length; i++) {
        const e = E.enemies[i];
        if (e.type !== type) continue;
        h.u32(i);
        for (const f of ENEMY_HASH) h.val(e[f]);
      }
    }
    h.u32(E.missiles.length);
    for (const m of E.missiles) for (const f of MISSILE_HASH) h.val(m[f]);
    h.u32(E.orbs.length);
    for (const o of E.orbs) for (const f of ORB_HASH) h.val(o[f]);
  }

  // ---- headless drain -----------------------------------------------------
  // The RAF loop owns the real drain (game.js's drainCues, after each
  // step()); a headless suite drives step() through advance() and the direct
  // hooks below instead, so the same forwarding runs here — and, while a
  // trace asks, each drained event is recorded with the simTick it fired on,
  // which is how the golden suite asserts cue ORDER with no audio device.
  const evRec = { on: false, list: [] };
  function drainStep() {
    for (const ev of drainEvents()) {
      if (evRec.on) evRec.list.push({ tick: simTick, kind: ev.kind, gain: ev.gain === undefined ? null : ev.gain });
      if (window.Sfx) Sfx.cue(ev.kind, ev.at, ev.gain);
    }
  }
  // the recorder sees only what THIS drain forwards — events the RAF loop
  // drains (game.js's drainCues) pass it by, which is why the frame-loop
  // trace asserts through the Sfx log instead
  const recordEvents = () => { evRec.list = []; evRec.on = true; };
  const stopEvents = () => { evRec.on = false; return evRec.list; };

  Object.assign(window.__test, {
    enc: {
      cfg: ECFG,
      E,
      hashInto: hashEncounter, // folds encounter state into a game.js fnv hasher
      rngState: () => rand.state(), // reads the stream's position without advancing it
      roster: ROSTER, // the live array — the golden suite's phantom-type check mutates and restores it
      mods,
      reset: (seed) => restart(seed),
      restart,
      advance: (n) => { for (let i = 0; i < n; i++) { step(); drainStep(); } }, // the full game tick, encounter
                    // included — drained per step, exactly as the frame loop drains
      recordEvents, // start recording the (tick, kind, gain) stream the drain forwards
      stopEvents,   // ...and stop, returning the recorded list
      state: snapState,
      spawnEnemy,
      spawnMissile, // the real constructor, cap included — checks drive production
                    // code and never build a fixture the sim would not have made
      waveGroups,
      countsFor,
      statsFor,
      // the direct hooks that can emit outside a step: each drains after the
      // call, so a suite's log assertions see the cue on the same call — and
      // each keeps its exact return value
      damagePlayer: (n) => { const hit = hitPlayer(n === undefined ? 1 : n); drainStep(); return hit; },
      addXp,
      openShop: () => { openShop(); drainStep(); },
      buy,
      continueFromShop,
      // the resolved catalog view the overlay itself draws from — name,
      // live price, owned rank, cap state and the can() availability
      shopLayout,     // every rect the mouse UI uses: the cards, the grid, the button
      shopPopupRect,  // ...and where a row's big hover art lands, per row
      shopOpen,       // taking input? (a paused shop is not)
      shopHover,      // the hit test, in field coordinates
      shopClick,      // ...and the click that runs through it
      shopInfo: () => SHOP.map((row, i) => ({
        name: row.name, cost: shopCost(i), owned: E.owned[i],
        maxed: shopMaxed(i), available: !row.can || !!row.can(),
        icon: row.icon || null, iconReady: !!(ICONS[i] && ICONS[i].ok), card: !!row.card,
      })),
      segCircleHit,
      segCircleEntryT,
      predictAim, // the radar latch's aim solver, on live G.ship/G.vel — checks
                  // recompute the closed form and compare against production

      frozen,
      fireOnce: () => { fire(); drainStep(); }, // the real firing gate, without the autofire path
      setBounce: (v) => { BOUNCE = !!v; },
      edgeArrows: computeEdgeArrows, // the resolved arrow list, straight off live state
      arrowCfg: ARROWS,              // inset/cap/buckets — checks read these, never copy them
      tunables: () => ({ BCOOL, BLIFE, AUTOFIRE, BSPEED, BMAX, VMAX, TICK, BDMG, CONTACTCD, BLASTR, BLASTGAIN }),
      blastRadius, // the live effective radius, exactly as blastAt() reads it
      tuning: TUNING, // the same object window.Encounter.tuning publishes
    },
  });
})();
