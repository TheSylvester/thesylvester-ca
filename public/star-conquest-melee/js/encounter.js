"use strict";

// Encounter module — endless progressive waves. Two original archetypes:
// weak grouped darts that approach, hold a preferred ring without ramming,
// face the player, telegraph a short pulse-lance, fire it, and cool down —
// and, from wave 3, lone chargers that plant, lock a lunge line, and ram.
// Each wave reseeds its own RNG stream and deals its schedule and stats
// from pure functions of the wave number (waveGroups/countsFor/statsFor),
// so a wave replays identically no matter how the previous one was played.
// Deaths drop XP orbs (one per dart, two per charger); five XP arms a
// deliberate three-choice upgrade overlay. Wave progress and player
// Level/XP stay separate. All tuning here is a local starting point for
// this experiment, not a claim of Nova Drift-exact behavior.
//
// Classic scripts share one global lexical environment, so this file
// reads game.js state (G, cam, ctx, C, FONT, FW/FH/WW/WH, SHIP_R, step)
// directly. The IIFE keeps every internal name private; the only globals
// published are one window.Encounter assignment and an Object.assign
// extension of window.__test.
(() => {
  // ---- deterministic configuration — every feel-sensitive value ----------
  const ECFG = {
    seed: 0x51A9E7,          // base seed — startWave folds the wave number in, so
                             // every wave deals the same SCHEDULE and pattern on
                             // every run; anchor geometry tracks the live camera
                             // rectangle, which follows real input
    enemy: {                 // dart baseline — statsFor scales hp and maxSpeed per wave
      r: 7, hp: 2,
      maxSpeed: 2.4,         // px/tick — 144 px/s, well under the ship's 540
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
    orb: { r: 3, drift: 1.1, damp: 0.94, attract: 72, pull: 0.55, vmax: 7, pickup: 12 },
    xpPerLevel: 5,
    spawnGap: 48,            // px outside the camera rectangle
    minPlayerDist: 90,       // an enemy never appears closer to the player
    clearHold: 210,          // ticks the WAVE CLEAR banner holds
  };

  const UPGRADES = [
    { key: "1", name: "RAPID LOADER", desc: "fire cooldown -30%", apply: () => { mods.cool *= 0.7; } },
    { key: "2", name: "SUSTAINED SHOT", desc: "bullet lifetime +50%", apply: () => { mods.life *= 1.5; } },
    { key: "3", name: "HULL PATCH", desc: "repair 1 hull", apply: () => { E.hull = Math.min(ECFG.player.hull, E.hull + 1); } },
  ];

  // upgrade multipliers — game.js consults these in fire(), so the tuner
  // values themselves never change and a restart preserves them untouched
  const mods = { cool: 1, life: 1 };

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
    state: "idle", // idle | warning | active | upgrade | cleared | dead
    wave: 1,
    waveTick: 0,
    groups: [],
    stats: null,   // this wave's resolved statsFor object — startWave deals it
    enemies: [],
    orbs: [],
    hull: ECFG.player.hull,
    xp: 0,
    level: 1,      // player level — independent of wave progress
    upgradeReady: false,
    returnState: "active", // where the upgrade overlay resumes to
    invuln: 0,
    hitFlash: 0,
    clearTick: 0,
    shipPrev: null, // the ship's previous-tick position — the lance sweep samples it
    kills: 0,
    hitsDealt: 0,  // bullet hits on enemies
    hitsTaken: 0,  // lance hits on the player
  };

  const frozen = () => E.state === "upgrade" || E.state === "dead";
  const queuedCount = () => E.groups.reduce((n, g) => n + (g.spawned ? 0 : g.count), 0);

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
            if (hitPlayer(CH.dmg)) e.dashHit = true; // at most one hit per dash
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
    E.xp += n;
    if (E.xp >= ECFG.xpPerLevel) E.upgradeReady = true;
  }

  function stepOrbs() {
    const O = ECFG.orb;
    for (let i = E.orbs.length - 1; i >= 0; i--) {
      const o = E.orbs[i];
      o.vx *= O.damp; // the drop drifts briefly, then the damp settles it
      o.vy *= O.damp;
      const dx = G.ship.x - o.x;
      const dy = G.ship.y - o.y;
      const d = Math.hypot(dx, dy) || 0.001;
      if (d < O.attract) { // magnet range — the orb chases the ship
        o.vx += (dx / d) * O.pull;
        o.vy += (dy / d) * O.pull;
        const m = Math.hypot(o.vx, o.vy);
        if (m > O.vmax) { o.vx *= O.vmax / m; o.vy *= O.vmax / m; }
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
  function openUpgrade() {
    if (!E.upgradeReady || E.state === "upgrade" || E.state === "dead" || E.state === "idle") return;
    E.returnState = E.state;
    E.state = "upgrade"; // frozen() now gates the whole sim
  }

  function chooseUpgrade(i) {
    if (E.state !== "upgrade") return;
    const u = UPGRADES[i];
    if (!u) return;
    u.apply();
    E.level++;
    E.xp -= ECFG.xpPerLevel;
    E.upgradeReady = E.xp >= ECFG.xpPerLevel;
    E.state = E.returnState;
  }

  // deal a wave: its own RNG stream, its schedule, its resolved stats.
  // Everything else — hull, XP, level, mods, leftover orbs, live bullets —
  // is deliberately untouched, so a mid-run transition carries it across.
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
    E.hull = ECFG.player.hull;
    E.xp = 0;
    E.level = 1;
    E.upgradeReady = false;
    E.returnState = "active";
    E.invuln = 0;
    E.hitFlash = 0;
    E.shipPrev = null;
    E.kills = 0;
    E.hitsDealt = 0;
    E.hitsTaken = 0;
    mods.cool = 1;
    mods.life = 1;
    G.bullets.length = 0;
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
    // the clear banner has held long enough — deal the next wave; the
    // HOSTILES INBOUND banner returns naturally via the warning state
    if (E.state === "cleared" && E.waveTick - E.clearTick >= ECFG.clearHold) {
      startWave(E.wave + 1);
      E.state = "warning";
    }
    E.waveTick++;
    for (const g of E.groups) {
      if (!g.points && E.waveTick >= g.warnAt) g.points = rollGroupPoints(g.count);
      if (!g.spawned && E.waveTick >= g.spawnAt) { spawnGroup(g); g.spawned = true; }
    }
    if (E.state === "warning" && E.enemies.length) E.state = "active";
    for (const e of E.enemies) stepEnemy(e);
    resolveBulletHits();
    reapDead();
    stepOrbs();
    if (E.invuln > 0) E.invuln--;
    if (E.hitFlash > 0) E.hitFlash--;
    // A wave clears only when the queue is empty AND the field is empty —
    // still an explicit simplification of Nova Drift's timer-driven
    // overlapping scheduler. The banner holds clearHold ticks, then the
    // check above deals the next wave.
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

  function encDrawHud() {
    if (E.state === "idle") return;
    ctx.save();
    const wt = E.waveTick;
    // --- viewport HUD, top left ---
    ctx.textAlign = "left";
    ctx.font = "700 10px " + FONT;
    ctx.fillStyle = C.bright;
    ctx.fillText(E.state === "cleared" ? "WAVE " + E.wave + " · CLEAR" : "WAVE " + E.wave, 8, 16);
    for (let i = 0; i < ECFG.player.hull; i++) { // hull pips
      if (i < E.hull) {
        ctx.fillStyle = C.clay;
        ctx.fillRect(8 + i * 10, 21, 7, 7);
      } else {
        ctx.strokeStyle = C.dim;
        ctx.lineWidth = 1;
        ctx.strokeRect(8.5 + i * 10, 21.5, 6, 6);
      }
    }
    ctx.strokeStyle = C.wall; // XP bar + player level, separate from wave
    ctx.lineWidth = 1;
    ctx.strokeRect(8.5, 33.5, 41, 6);
    ctx.fillStyle = C.clay;
    ctx.fillRect(9, 34, 40 * Math.max(0, Math.min(1, E.xp / ECFG.xpPerLevel)), 5);
    ctx.fillStyle = C.dim;
    ctx.font = "400 9px " + FONT;
    ctx.fillText("LV " + E.level, 55, 40);
    ctx.fillText("FOES " + (E.enemies.length + queuedCount()), 8, 51);
    if (E.upgradeReady && E.state !== "upgrade" && E.state !== "dead") {
      ctx.fillStyle = C.clay;
      ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(wt * 0.1));
      ctx.font = "700 9px " + FONT;
      ctx.fillText("U · CHOOSE UPGRADE", 8, 63);
      ctx.globalAlpha = 1;
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
      ctx.fillText("next wave incoming", FW / 2, FH / 2 + 12);
      ctx.globalAlpha = 1;
    } else if (E.state === "upgrade") {
      ctx.fillStyle = "rgba(14, 17, 25, 0.85)";
      ctx.fillRect(0, 0, FW, FH);
      ctx.textAlign = "center";
      ctx.font = "700 13px " + FONT;
      ctx.fillStyle = C.bright;
      ctx.fillText("CHOOSE AN UPGRADE", FW / 2, FH / 2 - 54);
      UPGRADES.forEach((u, i) => {
        const y = FH / 2 - 26 + i * 24;
        ctx.font = "700 10px " + FONT;
        ctx.fillStyle = C.clay;
        ctx.fillText(u.key + " · " + u.name, FW / 2, y);
        ctx.font = "400 9px " + FONT;
        ctx.fillStyle = C.dim;
        ctx.fillText(u.desc, FW / 2, y + 11);
      });
      ctx.font = "400 10px " + FONT;
      ctx.fillStyle = C.dim;
      ctx.fillText("press 1, 2 or 3", FW / 2, FH / 2 + 52);
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
  document.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    // these keys also work on the pause screen, where the loop is stopped —
    // repaint there so the overlay never shows a stale instruction
    const repaint = () => { if (!G.running) render(); };
    if (E.state === "upgrade") {
      const pick = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
      if (pick !== undefined) {
        e.preventDefault();
        chooseUpgrade(pick);
        repaint();
      }
      return;
    }
    if (e.code === "KeyR" && E.state === "dead") {
      e.preventDefault();
      restart();
      repaint();
      return;
    }
    if (e.code === "KeyU" && E.upgradeReady) {
      e.preventDefault();
      openUpgrade();
      repaint();
    }
  });

  // ---- publish — one namespace, one assignment ---------------------------
  restart(ECFG.seed);
  window.Encounter = { step: encStep, draw: encDraw, drawHud: encDrawHud, frozen, mods, reset: restart };

  // ---- test hook extension — deterministic checks drive the slice --------
  function snapState() {
    return {
      state: E.state,
      wave: E.wave,
      waveTick: E.waveTick,
      hull: E.hull,
      xp: E.xp,
      level: E.level,
      upgradeReady: E.upgradeReady,
      invuln: E.invuln,
      enemies: E.enemies.length,
      darts: E.enemies.reduce((n, e) => n + (e.type === "dart" ? 1 : 0), 0),
      chargers: E.enemies.reduce((n, e) => n + (e.type === "charger" ? 1 : 0), 0),
      orbs: E.orbs.length,
      queued: queuedCount(),
      kills: E.kills,
      hitsDealt: E.hitsDealt,
      hitsTaken: E.hitsTaken,
      mods: { cool: mods.cool, life: mods.life },
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
      openUpgrade,
      chooseUpgrade,
      segCircleHit,
      segCircleEntryT,
      frozen,
      fireOnce: () => fire(), // the real firing gate, without the autofire path
      setBounce: (v) => { BOUNCE = !!v; },
      tunables: () => ({ BCOOL, BLIFE, AUTOFIRE, BSPEED, BMAX, VMAX, TICK }),
    },
  });
})();
