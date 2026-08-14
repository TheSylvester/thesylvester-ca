"use strict";

// Encounter module — endless progressive waves. Two original archetypes:
// weak grouped darts that approach, hold a preferred ring without ramming,
// face the player, telegraph a short pulse-lance, fire it, and cool down —
// and, from wave 3, lone chargers that plant, lock a lunge line, and ram.
// Each wave reseeds its own RNG stream and deals its schedule and stats
// from pure functions of the wave number (waveGroups/countsFor/statsFor),
// so a wave replays identically no matter how the previous one was played.
// Deaths drop XP orbs (one per dart, two per charger) into an UNCAPPED
// wallet; after every wave clear the banner holds, the field's orbs sweep
// to the ship, and a frozen SHOP opens — digits buy while the wallet can
// pay, Enter deals the next wave. The wallet resets on death. All tuning
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
  // (only the pitch it lays six rows out on).
  // Each row is pure data plus two closures: `curve` prices it ("double" is
  // base × 2^owned, "flat" never moves — both owner decisions), `cap` is an
  // optional hard rank ceiling (rendered MAXED), and `can` is an optional
  // availability predicate (HULL PATCH leaves the shelf at the LIVE max
  // hull, so Math.min can never silently eat a paid repair). Purchase
  // COUNTS live on E.owned, never on this const: restart() resets state
  // field by field and deliberately never touches this array.
  const SHOP = [
    { name: "RAPID LOADER", desc: "fire cooldown -30%", base: 4, curve: "double", cap: 5,
      apply: () => { mods.cool *= 0.7; } }, // cap 5: past it the quantized cooldown
                                            // outruns the BMAX live-bullet budget
    { name: "AFTERBURNER", desc: "max speed +1.0 px/tick", base: 4, curve: "double",
      apply: () => { mods.speed += 1; } },  // uncapped — the doubling price is the brake
    { name: "HULL PATCH", desc: "repair 1 hull", base: 6, curve: "flat",
      can: () => E.hull < E.hullMax,        // a consumable, flat by design: an escalating
      apply: () => { E.hull = Math.min(E.hullMax, E.hull + 1); } }, // repair price is a
                                            // death spiral aimed at the player already losing
    { name: "MAX HULL", desc: "max hull +1, granted filled", base: 8, curve: "double",
      apply: () => { E.hullMax += 1; E.hull += 1; } }, // raises the LIVE cap the pips and
                                            // HULL PATCH read, and fills the new point
    // One-time, and priced at exactly wave 2's income. cap 1 is what makes it
    // one-time: shopMaxed() refuses the second sale and the row renders MAXED.
    // The pre-purchase scheme is complete and playable (hold right and the
    // mouse flies the ship), so this is a comfort unlock, not a rescue — it
    // buys thrust without holding a button, while the visible cursor keeps
    // aiming. `card` is what raises the explainer on the shop screen.
    { name: "THRUST RING", desc: "qweasdzxc keys thrust", base: 8, curve: "flat", cap: 1,
      card: true, apply: () => { mods.keyThrust = true; } },
    // Three ranks at 8/16/32 — the doubling curve, and a cap that makes rank 3
    // read MAXED. Each rank widens the splash by the BLASTGAIN slider; the
    // damage itself never scales, so the row buys reach, not raw output.
    { name: "BLAST CHARGE", desc: "shots splash 1 damage nearby", base: 8, curve: "double", cap: 3,
      apply: () => { mods.blast += 1; } },
  ];

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
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let rand = mulberry32(ECFG.seed);

  // ---- wave scaling — pure functions of the wave number ------------------
  // countsFor/statsFor/waveGroups read only ECFG constants: the same wave
  // number always deals the same schedule and the same stats. startWave
  // resolves statsFor ONCE into E.stats and spawnEnemy stamps that object
  // onto each body, so nothing reads a mutated global mid-wave.
  function countsFor(wave) {
    return {
      darts: Math.min(5 + 2 * (wave - 1), 21),
      chargers: wave >= 3 ? Math.min(1 + Math.floor((wave - 3) / 2), 4) : 0,
    };
  }

  function statsFor(wave) {
    const hpBonus = Math.min(Math.floor((wave - 1) / 3), 4); // +1 hull every third wave, capped
    const mul = Math.min(1 + 0.08 * (wave - 1), 2); // shared speed multiplier — the cap doubles the base
    return {
      dart: {
        r: ECFG.enemy.r,
        hp: ECFG.enemy.hp + hpBonus, // 2..6 — the hpBonus cap bounds it
        maxSpeed: ECFG.enemy.maxSpeed * mul, // 2.4..4.8
        steer: ECFG.enemy.steer, prefer: ECFG.enemy.prefer, band: ECFG.enemy.band,
        backSpeed: ECFG.enemy.backSpeed, sepR: ECFG.enemy.sepR,
        cooldown: Math.max(72, Math.round(ECFG.lance.cooldown * Math.pow(0.95, wave - 1))),
        orbDrop: 1, // a dart still drops exactly one orb at every wave
      },
      charger: {
        r: ECFG.charger.r,
        hp: ECFG.charger.hp + hpBonus,
        maxSpeed: ECFG.charger.maxSpeed * mul,
        steer: ECFG.charger.steer, prefer: ECFG.charger.prefer, band: ECFG.charger.band,
        backSpeed: ECFG.charger.backSpeed, sepR: ECFG.charger.sepR,
        rest: Math.max(54, Math.round(ECFG.charger.rest * Math.pow(0.95, wave - 1))),
        orbDrop: 2, // the heavier body pays out double
      },
    };
  }

  // The spawn queue for a wave, in wave ticks (60 Hz). Wave 1 is the
  // hand-tuned slice schedule, byte-identical to the original vertical
  // slice; later waves split their dart count into packs of three and land
  // each charger alone, one group every five seconds with a 1.5 s warning.
  function waveGroups(wave) {
    if (wave === 1) {
      return [
        { count: 3, type: "dart", warnAt: 36, spawnAt: 126 },   // warn at 0.6 s, land at 2.1 s
        { count: 2, type: "dart", warnAt: 810, spawnAt: 900 },  // second pack warns at 13.5 s, lands at 15 s
      ];
    }
    const n = countsFor(wave);
    const groups = [];
    for (let left = n.darts; left > 0; left -= 3) groups.push({ count: Math.min(3, left), type: "dart" });
    for (let i = 0; i < n.chargers; i++) groups.push({ count: 1, type: "charger" });
    return groups.map((g, k) => ({ count: g.count, type: g.type, warnAt: 126 + 300 * k - 90, spawnAt: 126 + 300 * k }));
  }

  // ---- encounter state ---------------------------------------------------
  const E = {
    state: "idle", // idle | warning | active | cleared | shop | dead
    wave: 1,
    waveTick: 0,
    groups: [],
    stats: null,   // this wave's resolved statsFor object — startWave deals it
    enemies: [],
    orbs: [],
    hull: ECFG.player.hull,
    hullMax: ECFG.player.hull,   // the LIVE max — MAX HULL purchases raise it, and the
                                 // HUD pips and HULL PATCH offer read it, never the const
    xp: 0,                       // the wallet — uncapped, spent in the shop, dies with the run
    owned: SHOP.map(() => 0),    // per-row purchase counts, parallel to SHOP — restart() re-deals it
    ringCard: false,             // the THRUST RING explainer is up on THIS shop screen —
                                 // set by buy(), cleared by openShop() and restart(), so it
                                 // is the sale's own reveal and not a fixture of every visit
    invuln: 0,
    hitFlash: 0,
    clearTick: 0,
    shipPrev: null, // the ship's previous-tick position — the lance sweep samples it
    kills: 0,
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

  function spawnEnemy(x, y, i, type) {
    const kind = type === "charger" ? "charger" : "dart"; // 3-arg calls stay darts
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
    E.enemies.push({
      x, y, vx: 0, vy: 0, r: st.r, hp: st.hp, type: kind,
      stats: st,      // the resolved per-wave stats ride on the body — a live
                      // enemy keeps them even after the wave clock moves on
      orbDrop: st.orbDrop,
      mode: "seek", // seek | tele | pulse (dart) — seek | windup | dash | tired (charger)
      cd: 30 + (i || 0) * 24, // staggered first attacks — the pack never sync-fires
      t: 0, face: 0, lockA: 0, flash: 0, pulseHit: false, dashHit: false,
      contactCd: 0, // ticks left before this body can take contact damage again
      contactTaken: false, // this body already paid a contact THIS tick — cleared in stepEnemy
    });
  }

  function spawnGroup(g) {
    if (!g.points) g.points = rollGroupPoints(g.count);
    g.points.pts.forEach((p, i) => spawnEnemy(p.x, p.y, i, g.type));
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
    if (e.contactCd > 0) e.contactCd--;
    e.contactTaken = false; // a fresh tick — this body's contact is unclaimed again
    if (e.mode === "seek") {
      e.face = Math.atan2(dy, dx); // always face the player
      // hold the preferred ring: approach outside it, back off inside it
      let tx = 0;
      let ty = 0;
      if (dist > P.prefer + P.band) { tx = ux * P.maxSpeed; ty = uy * P.maxSpeed; }
      else if (dist < P.prefer - P.band) { tx = -ux * P.backSpeed; ty = -uy * P.backSpeed; }
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
      const tm = Math.hypot(tx, ty);
      if (tm > P.maxSpeed) { tx *= P.maxSpeed / tm; ty *= P.maxSpeed / tm; }
      e.vx += (tx - e.vx) * P.steer;
      e.vy += (ty - e.vy) * P.steer;
      if (e.cd > 0) e.cd--;
      else if (dist <= (e.type === "charger" ? CH.engage : L.engage)) {
        if (e.type === "charger") { // rested and in range — plant to lunge
          e.mode = "windup";
          e.t = CH.windup;
          e.lockA = e.face; // the dash line locks NOW, so the lunge can be dodged
          e.dashHit = false;
        } else { // in range and rested — plant and telegraph
          e.mode = "tele";
          e.t = L.telegraph;
          e.lockA = e.face; // the lance direction locks here, so it can be dodged
          e.pulseHit = false;
        }
      }
    } else if (e.mode === "tele") {
      e.vx *= 0.8; // plant to fire — the telegraph stays honest
      e.vy *= 0.8;
      if (--e.t <= 0) { e.mode = "pulse"; e.t = ECFG.lance.pulse; }
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
    } else if (e.mode === "windup") {
      e.vx *= 0.85; // plant — the body sinks to rest while the intent line brightens
      e.vy *= 0.85;
      if (--e.t <= 0) { e.mode = "dash"; e.t = CH.dashTicks; }
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
  // bullet's damage, once. Enemies only: the player and the orbs are never
  // touched by a blast, at any rank.
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
  }

  function resolveBulletHits() {
    for (const b of G.bullets) {
      if (b.dead || b.owner !== "player") continue;
      let bestT = -1;
      let hit = null;
      for (const e of E.enemies) {
        if (e.hp <= 0) continue;
        const t = segCircleEntryT(b.px, b.py, b.x, b.y, e.x, e.y, e.r + b.r);
        if (t >= 0 && (hit === null || t < bestT)) { bestT = t; hit = e; }
      }
      if (hit) {
        hit.hp -= b.dmg; // the first body along the path takes the hit
        hit.flash = 8;
        b.dead = true; // consumed exactly once — the game sweep removes it
        E.hitsDealt++;
        const m = Math.hypot(b.vx, b.vy) || 1; // visual only — the burst rides game.js's own hash stream
        const ix = b.px + (b.x - b.px) * bestT;
        const iy = b.py + (b.y - b.py) * bestT;
        spawnImpactFx(ix, iy, b.vx / m, b.vy / m, "enemy");
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

  function reapDead() {
    for (let i = E.enemies.length - 1; i >= 0; i--) {
      const e = E.enemies[i];
      if (e.hp > 0) continue;
      E.enemies.splice(i, 1); // a body dies at most once
      E.kills++;
      for (let k = 0; k < e.orbDrop; k++) { // darts pay one orb, chargers two
        const a = rand() * Math.PI * 2; // each drop dealt its own drift
        E.orbs.push({ x: e.x, y: e.y, vx: Math.cos(a) * ECFG.orb.drift, vy: Math.sin(a) * ECFG.orb.drift });
      }
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
    E.ringCard = false; // a fresh visit opens without the reveal — only this visit's
                        // own THRUST RING sale raises it
    G.keys.clear();   // a hand resting on the ring must not stay "held" across the
                      // visit — pause() is the only other caller of this clear, and
                      // a frozen shop keeps G.running true, so it never fires here
  }

  // one purchase; the state STAYS "shop" so the player buys again. Returns
  // whether the sale went through — refusals change nothing at all.
  function buy(i) {
    if (E.state !== "shop") return false;
    const row = SHOP[i];
    if (!row) return false;
    if (shopMaxed(i)) return false;
    if (row.can && !row.can()) return false;
    const cost = shopCost(i);
    if (E.xp < cost) return false;
    E.xp -= cost;
    row.apply();
    E.owned[i]++;
    if (row.card) E.ringCard = true; // the reveal rides the sale, never the effect
    return true;
  }

  function continueFromShop() {
    if (E.state !== "shop") return; // without this guard a double Enter deals two
                                    // waves, skips one, and reseeds rand for N+2
    startWave(E.wave + 1);
    E.state = "warning";
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
    E.groups = waveGroups(n).map((g) => ({ count: g.count, type: g.type, warnAt: g.warnAt, spawnAt: g.spawnAt, points: null, spawned: false }));
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
    E.orbs = [];
    E.hullMax = ECFG.player.hull;  // MAX HULL purchases die with the run
    E.hull = E.hullMax;
    E.xp = 0;                      // the wallet resets on death — owner decision, the roguelite reset
    E.owned = SHOP.map(() => 0);   // every rank counter dies here, current and future rows alike
    E.ringCard = false;            // no reveal survives into the next run's first shop
    E.invuln = 0;
    E.hitFlash = 0;
    E.shipPrev = null;
    E.kills = 0;
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
    for (const g of E.groups) {
      if (!g.points && E.waveTick >= g.warnAt) g.points = rollGroupPoints(g.count);
      if (!g.spawned && E.waveTick >= g.spawnAt) { spawnGroup(g); g.spawned = true; }
    }
    if (E.state === "warning" && E.enemies.length) E.state = "active";
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
    // A wave clears only when the queue is empty AND the field is empty —
    // still an explicit simplification of Nova Drift's timer-driven
    // overlapping scheduler. The banner holds clearHold ticks while the
    // sweep banks the orbs, then the check above opens the shop.
    if (E.state === "active" && E.enemies.length === 0 && E.groups.every((g) => g.spawned)) {
      E.state = "cleared";
      E.clearTick = E.waveTick;
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
    // enemies — dart and charger bodies, telegraphs, beams, dash trails
    for (const e of E.enemies) {
      const ang = e.mode === "seek" || e.mode === "tired" ? e.face : e.lockA;
      if (e.type === "charger") {
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
        ctx.rotate(ang);
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
        continue;
      }
      if (e.mode === "tele") {
        const L = ECFG.lance;
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
        const L = ECFG.lance;
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
      ctx.rotate(ang);
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
  // viewport has lost. Pure functions of live state (E.enemies, cam, FW/FH):
  // no rand(), no Math.random(), no Date.now() — the draw path can never
  // desync a replay. Directions closer than a bucket apart merge into one
  // arrow (the nearest body of the bucket represents it) and a nearest-first
  // cap bounds the worst case, so a swarm behind you stays readable.
  const ARROWS = { inset: 14, cap: 16, buckets: 48, far: 1200 };
  function computeEdgeArrows() {
    const vx = cam.x + FW / 2; // the view centre — position and heading share
    const vy = cam.y + FH / 2; // this ray, so an arrow points where it sits
    const slots = new Array(ARROWS.buckets).fill(null); // fixed slot order — deterministic
    for (const e of E.enemies) {
      if (e.hp <= 0) continue;
      const sx = e.x - cam.x;
      const sy = e.y - cam.y;
      if (sx >= -e.r && sx <= FW + e.r && sy >= -e.r && sy <= FH + e.r) continue; // any part visible — no arrow
      const dx = e.x - vx;
      const dy = e.y - vy;
      const dist = Math.hypot(dx, dy);
      const step = (2 * Math.PI) / ARROWS.buckets;
      const bi = ((Math.round(Math.atan2(dy, dx) / step) % ARROWS.buckets) + ARROWS.buckets) % ARROWS.buckets;
      const s = slots[bi];
      if (!s) slots[bi] = { dx, dy, dist, n: 1, type: e.type, bi };
      else {
        s.n++;
        if (dist < s.dist) { s.dx = dx; s.dy = dy; s.dist = dist; s.type = e.type; } // nearest wins the bucket
      }
    }
    const hw = FW / 2 - ARROWS.inset;
    const hh = FH / 2 - ARROWS.inset;
    return slots.filter(Boolean)
      .sort((a, b) => a.dist - b.dist || a.bi - b.bi) // explicit tie-break — deterministic order
      .slice(0, ARROWS.cap)
      .map((s) => {
        // an off-screen body always overshoots one half-extent, so k < 1 and
        // the arrow lands exactly ON the inset rect — inside the field clip,
        // never in the letterbox bars
        const k = Math.min(hw / Math.max(Math.abs(s.dx), 1e-9), hh / Math.max(Math.abs(s.dy), 1e-9));
        return { x: FW / 2 + s.dx * k, y: FH / 2 + s.dy * k,
          ang: Math.atan2(s.dy, s.dx), dist: s.dist, n: s.n, type: s.type };
      });
  }
  function drawEdgeArrows() {
    for (const a of computeEdgeArrows()) {
      const sc = (a.type === "charger" ? 1.25 : 1) * (1 + Math.min(a.n - 1, 3) * 0.15);
      ctx.save();
      ctx.globalAlpha = 0.3 + 0.45 * Math.max(0, Math.min(1, 1 - a.dist / ARROWS.far));
      ctx.translate(a.x, a.y);
      ctx.rotate(a.ang);
      ctx.scale(sc, sc);
      ctx.fillStyle = a.type === "charger" ? C.clay : "#9aa3b2"; // the charger wears the danger accent
      ctx.beginPath(); // the incoming-marker chevron, same proportions
      ctx.moveTo(7, 0);
      ctx.lineTo(-4, 5);
      ctx.lineTo(-1, 0);
      ctx.lineTo(-4, -5);
      ctx.closePath();
      ctx.fill();
      ctx.restore(); // restore() puts globalAlpha back — nothing leaks
    }
  }

  // Is the THRUST RING reveal on the screen right now? One answer, read by
  // everything the card displaces. The bitmap game.js owns is OPAQUE and lands
  // across the top band of the field, so whatever is already painted under it
  // is not dimmed by the card — it is cut in half by the card's edges, which
  // is worse than either covering it or leaving it alone. The two layers that
  // would be cut stand down while the card is up: the top-left status stack
  // below (the card's left edge falls 8 px into its column) and game.js's
  // corner map (the card's right edge falls 8 px inside its frame), exactly
  // the pair the first-run card also suppresses. The card only ever shows on
  // the live shop screen, so a pause or the next wave brings both straight
  // back.
  function ringCardShown() {
    return E.state === "shop" && G.running && E.ringCard && ringCardReady();
  }

  // The shop list's vertical layout, factored out of the draw so a check can
  // assert it still lands on the field as rows are appended. Card up, the list
  // hangs off the reveal's bottom edge on a tighter pitch — that pair is what
  // fits six rows and the footer between RING_BOTTOM and the field floor.
  function shopLayout(cardUp) {
    const titleY = cardUp ? RING_BOTTOM + 14 : FH / 2 - 62;
    const gap = cardUp ? 22 : 26;
    return { titleY, gap, rows: SHOP.length, footY: titleY + 24 + SHOP.length * gap };
  }

  function encDrawHud() {
    if (E.state === "idle") return;
    ctx.save();
    const wt = E.waveTick;
    const cardUp = ringCardShown(); // one read per frame — the stack and the
    // overlay below cannot disagree about the card inside a single frame
    // --- off-screen trackers, first so everything else paints over them ---
    // a chevron parked on the inset rect's left column would otherwise sit on
    // top of the hull pips, the XP bar and the readouts below
    if (EDGEARROWS) drawEdgeArrows();
    // --- viewport HUD, top left ---
    ctx.textAlign = "left";
    if (!cardUp) { // see ringCardShown() — the reveal would slice this column
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
      // copy prints into this overlay's center band (CLICK TO CONTINUE at
      // FH/2+46, the control lines at +64/+78, straight through the last two
      // rows and the footer). Paused, the overlay stands down and the pause
      // screen owns the canvas — the same deal the dev panel gets — and the
      // resume click brings the shop back exactly as it was left.
      ctx.fillStyle = "rgba(14, 17, 25, 0.85)";
      ctx.fillRect(0, 0, FW, FH);
      ctx.textAlign = "center";
      // The THRUST RING reveal owns the top of the screen for the rest of the
      // visit it was bought on, and the list slides down under it — never
      // modal, so every digit and Enter stay live the whole time. game.js owns
      // the bitmap and its rect; the load is async, so a card that has not
      // arrived leaves the list where it always sits and prints a one-line
      // stand-in under the footer instead. cardUp is the frame's single read,
      // taken at the top of this function — the status stack it displaces and
      // the art itself answer to the same call.
      if (cardUp) drawRingCard();
      const L = shopLayout(cardUp);
      const titleY = L.titleY;
      const gap = L.gap;
      const footY = L.footY;
      ctx.font = "700 13px " + FONT;
      ctx.fillStyle = C.bright;
      ctx.fillText("SHOP — XP " + E.xp, FW / 2, titleY);
      SHOP.forEach((row, i) => {
        const y = titleY + 24 + i * gap;
        const maxed = shopMaxed(i);
        const offered = !row.can || row.can(); // rows never hide — indices stay
                                               // stable under the digit keys
        const cost = shopCost(i);
        ctx.font = "700 10px " + FONT;
        ctx.fillStyle = !maxed && offered && E.xp >= cost ? C.clay : C.dim;
        ctx.fillText((i + 1) + " · " + row.name + " — " + (maxed ? "MAXED" : offered ? cost + " XP" : "—"), FW / 2, y);
        ctx.font = "400 9px " + FONT;
        ctx.fillStyle = C.dim;
        ctx.fillText(row.desc + (E.owned[i] ? " · owned " + E.owned[i] : ""), FW / 2, y + 11);
      });
      ctx.font = "400 10px " + FONT;
      ctx.fillStyle = C.dim;
      ctx.fillText("1-" + SHOP.length + " to buy · enter for the next wave", FW / 2, footY);
      if (E.ringCard && !cardUp) { // the art never arrived — say it in words
        ctx.fillStyle = C.clay;
        ctx.fillText("THRUST RING ONLINE — qweasdzxc now thrusts", FW / 2, footY + 18);
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
  // Digits buy, Enter continues. Space is deliberately NOT bound: the pause
  // menu's buttons activate on Space when focused, and Space scrolls. The
  // map runs to six so the queued rows bind themselves when they append;
  // the < SHOP.length gate keeps the spare digits inert until then.
  const SHOP_KEYS = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5,
                      Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3, Numpad5: 4, Numpad6: 5 };
  document.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (E.state === "shop") {
      // a PAUSED shop belongs to the pause menu: a <button>'s click is the
      // default action of the Enter keydown, so capturing Enter here would
      // cancel a focused resume/dev button and deal the next wave behind
      // the menu instead. While the loop's flag is down nothing buys and
      // nothing continues — encDrawHud keeps the overlay off that screen on
      // the same flag — and resume() returns the shop exactly as it was.
      if (!G.running) return;
      if (e.code === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        continueFromShop();
        return;
      }
      const pick = SHOP_KEYS[e.code];
      if (pick !== undefined && pick < SHOP.length) {
        e.preventDefault();
        buy(pick);
      }
      return;
    }
    if (e.code === "KeyR" && E.state === "dead") {
      e.preventDefault();
      restart();
      // R works on the paused death screen too, where the loop is stopped —
      // repaint so the overlay never shows a stale instruction
      if (!G.running) render();
    }
  });

  // ---- publish — one namespace, one assignment ---------------------------
  restart(ECFG.seed);
  window.Encounter = { step: encStep, draw: encDraw, drawHud: encDrawHud, frozen, mods, reset: restart,
    // read-only live positions for game.js HUD layers — the minimap contact
    // dots today. Callers draw from these arrays and never mutate them;
    // render-path only, so the one tiny wrapper object per call is free and
    // the seeded stream is untouched. restart() REPLACES E.enemies/E.orbs, so
    // callers read through this accessor every frame instead of caching it.
    mapState: () => ({ enemies: E.enemies, orbs: E.orbs }),
    // the one question game.js's UI pass has to ask this file: is the THRUST
    // RING reveal on the screen? The corner map lives inside the card's rect
    // and stands down while it is up — see ringCardShown()
    ringCardShown };

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
      darts: E.enemies.reduce((n, e) => n + (e.type === "dart" ? 1 : 0), 0),
      chargers: E.enemies.reduce((n, e) => n + (e.type === "charger" ? 1 : 0), 0),
      orbs: E.orbs.length,
      queued: queuedCount(),
      kills: E.kills,
      hitsDealt: E.hitsDealt,
      hitsTaken: E.hitsTaken,
      contactsDealt: E.contactsDealt,
      mods: { cool: mods.cool, speed: mods.speed, keyThrust: mods.keyThrust, blast: mods.blast },
      ringCard: E.ringCard, // the reveal's own flag — set by the sale, not by the unlock
      stats: E.stats, // the per-wave object is replaced, never mutated — safe to hand out
      groups: E.groups.map((g) => ({ spawned: g.spawned, warned: !!g.points })),
    };
  }
  Object.assign(window.__test, {
    enc: {
      cfg: ECFG,
      E,
      mods,
      reset: (seed) => restart(seed),
      restart,
      advance: (n) => { for (let i = 0; i < n; i++) step(); }, // the full game tick, encounter included
      state: snapState,
      spawnEnemy,
      waveGroups,
      countsFor,
      statsFor,
      damagePlayer: (n) => hitPlayer(n === undefined ? 1 : n),
      addXp,
      openShop,
      buy,
      continueFromShop,
      // the resolved catalog view the overlay itself draws from — name,
      // live price, owned rank, cap state and the can() availability
      shopLayout, // the overlay's own row pitch and footer line, card up or down
      shopInfo: () => SHOP.map((row, i) => ({
        name: row.name, cost: shopCost(i), owned: E.owned[i],
        maxed: shopMaxed(i), available: !row.can || !!row.can(),
      })),
      segCircleHit,
      segCircleEntryT,
      frozen,
      fireOnce: () => fire(), // the real firing gate, without the autofire path
      setBounce: (v) => { BOUNCE = !!v; },
      edgeArrows: computeEdgeArrows, // the resolved arrow list, straight off live state
      arrowCfg: ARROWS,              // inset/cap/buckets — checks read these, never copy them
      tunables: () => ({ BCOOL, BLIFE, AUTOFIRE, BSPEED, BMAX, VMAX, TICK, BDMG, CONTACTCD, BLASTR, BLASTGAIN }),
      blastRadius, // the live effective radius, exactly as blastAt() reads it
    },
  });
})();
