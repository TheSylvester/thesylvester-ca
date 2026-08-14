"use strict";

// Deterministic wave checks — the suite now covers the endless progressive
// waves: the wave-1 slice, the wave transition, the pure scaling functions
// and the charger archetype. Load this file in the page (fetch + eval
// from the console, or a script tag), then call runWave1Checks(). The
// suite drives the fixed-step sim through window.__test only — no RAF,
// no real input. Timing expectations read the live tuner values, so a
// tuned page cannot fake a failure. On return the suite restores the aim
// mode and edge-margin values it touched and resets the encounter; it
// leaves G.mouse and the aim history wherever its synthetic input put them.
window.runWave1Checks = function () {
  const t = window.__test;
  const enc = t.enc;
  const ECFG = enc.cfg;
  const W1 = enc.waveGroups(1); // the wave-1 schedule — the fixed ECFG.groups list became a generator
  const R = [];
  const ok = (name, cond, info) => R.push({ name, pass: !!cond, info: info === undefined ? "" : String(info) });
  const ship = () => t.G.ship;
  const priorAim = t.aimState().AIMMODE;
  const priorEdge = t.camState().EDGEMARGIN;

  // ---- A. swept segment-to-circle unit tests ----
  ok("seg hit: crossing segment", enc.segCircleHit(0, 0, 100, 0, 50, 3, 5));
  ok("seg miss: offset circle", !enc.segCircleHit(0, 0, 100, 0, 50, 9, 5));
  ok("seg hit: zero-length segment falls back to a point test", enc.segCircleHit(10, 10, 10, 10, 12, 10, 3));
  // both endpoints miss but the sweep catches the pass-through
  const endsMiss = Math.abs(160 - 190) > 9.2 && Math.abs(200 - 190) > 9.2;
  ok("seg hit: catches a pass-through both endpoints miss", endsMiss && enc.segCircleHit(160, 0, 200, 0, 190, 0, 9.2));

  // ---- B. schedule, spawn counts, determinism ----
  enc.reset();
  enc.E.hull = 99; // schedule observation only — lances must not end the run
  enc.advance(1);
  ok("first played tick opens the warning state", enc.state().state === "warning");
  enc.advance(W1[0].warnAt - 1);
  ok("group 1 announces at its warnAt tick", enc.state().groups[0].warned && !enc.state().groups[0].spawned);
  enc.advance(W1[0].spawnAt - W1[0].warnAt);
  const s1 = enc.state();
  ok("group 1 lands 3 enemies at its spawnAt tick", s1.enemies === 3 && s1.groups[0].spawned, "enemies=" + s1.enemies);
  ok("warning becomes active on the first landing", s1.state === "active");
  ok("queue still holds group 2", s1.queued === 2);
  let minD = 1e9;
  let inWorld = true;
  for (const e of enc.E.enemies) {
    minD = Math.min(minD, Math.hypot(e.x - ship().x, e.y - ship().y));
    if (e.x < e.r || e.x > t.WW - e.r || e.y < e.r || e.y > t.WH - e.r) inWorld = false;
  }
  ok("no enemy spawns on the player", minD >= ECFG.minPlayerDist - 2, "minD=" + minD.toFixed(1));
  ok("every spawn sits inside world bounds", inWorld);
  enc.advance(W1[1].spawnAt - W1[0].spawnAt);
  const s2 = enc.state();
  ok("group 2 lands: 5 enemies total, queue empty", s2.enemies === 5 && s2.queued === 0, "enemies=" + s2.enemies);
  ok("wave stays active while the field is populated", s2.state === "active");
  // pack behavior after settling: separated, holding the ring
  enc.advance(240);
  let minPair = 1e9;
  let held = true;
  for (let i = 0; i < enc.E.enemies.length; i++) {
    const a = enc.E.enemies[i];
    const d = Math.hypot(a.x - ship().x, a.y - ship().y);
    if (d < 40 || d > 220) held = false;
    for (let j = i + 1; j < enc.E.enemies.length; j++) {
      minPair = Math.min(minPair, Math.hypot(a.x - enc.E.enemies[j].x, a.y - enc.E.enemies[j].y));
    }
  }
  ok("pack members separate instead of stacking", minPair > 12, "minPair=" + minPair.toFixed(1));
  ok("pack holds the engagement ring around the player", held);
  const snapshotRun = () => {
    enc.reset();
    enc.E.hull = 99;
    enc.advance(130);
    return JSON.stringify(enc.E.enemies.map((e) => [+e.x.toFixed(3), +e.y.toFixed(3)]));
  };
  const runA = snapshotRun();
  const runB = snapshotRun();
  ok("a fresh run reproduces the same wave exactly", runA === runB && runA.length > 10);
  // the pointer moves the camera (lookahead aim lead), which moves the
  // anchor — but the SCHEDULE and the dealt pattern must never change
  const schedRun = (mx, my) => {
    t.setMouseClient(mx, my);
    enc.reset();
    enc.E.hull = 99;
    enc.advance(130);
    const g = enc.E.groups[0];
    return { n: enc.E.enemies.length,
      rel: JSON.stringify(g.points.pts.map((p) => [+(p.x - g.points.anchor.x).toFixed(3), +(p.y - g.points.anchor.y).toFixed(3)])) };
  };
  const mA = schedRun(60, 60);
  const mB = schedRun(600, 500);
  ok("the schedule and dealt pattern ignore the pointer", mA.n === 3 && mB.n === 3 && mA.rel === mB.rel);

  // ---- C. swept bullet hits, hit/kill/orb accounting ----
  enc.reset();
  enc.E.hull = 99;
  const cx = ship().x;
  const cy = ship().y;
  enc.spawnEnemy(cx + 190, cy);
  const mkBullet = () => t.G.bullets.push({ x: cx, y: cy, px: cx, py: cy, vx: 40, vy: 0, r: 2.2, dmg: 1, owner: "player", dead: false, ttl: 60 });
  mkBullet();
  enc.advance(8);
  let s = enc.state();
  ok("a 40 px/tick bullet cannot tunnel: hit lands", s.hitsDealt === 1, "hitsDealt=" + s.hitsDealt);
  ok("one hit applies one damage", enc.E.enemies.length === 1 && enc.E.enemies[0].hp === ECFG.enemy.hp - 1);
  ok("a consumed bullet leaves the array", t.G.bullets.length === 0);
  mkBullet();
  enc.advance(8);
  s = enc.state();
  ok("second hit kills the enemy exactly once", s.kills === 1 && s.enemies === 0 && s.hitsDealt === 2);
  ok("exactly one orb drops per death", s.orbs === 1);
  // orb pickup: exactly one XP, once
  const orb = enc.E.orbs[0];
  ship().x = orb.x - 40;
  ship().y = orb.y;
  enc.advance(120);
  s = enc.state();
  ok("the orb attracts and collects for exactly one XP", s.orbs === 0 && s.xp === 1, "xp=" + s.xp);
  // one bullet crossing two bodies is consumed by the first only
  enc.reset();
  enc.E.hull = 99;
  enc.spawnEnemy(ship().x + 150, ship().y);
  enc.spawnEnemy(ship().x + 165, ship().y);
  t.G.bullets.push({ x: ship().x, y: ship().y, px: ship().x, py: ship().y, vx: 40, vy: 0, r: 2.2, dmg: 1, owner: "player", dead: false, ttl: 60 });
  enc.advance(8);
  const hpSum = enc.E.enemies.reduce((n, e) => n + e.hp, 0);
  ok("one bullet is consumed by one body only", enc.state().hitsDealt === 1 && hpSum === ECFG.enemy.hp * 2 - 1, "hpSum=" + hpSum);

  // ---- C2. swept-collision edge cases ----
  // the expiring tick's segment still deals its hit
  enc.reset();
  enc.spawnEnemy(ship().x + 150, ship().y);
  t.G.bullets.push({ x: ship().x + 130, y: ship().y, px: ship().x + 130, py: ship().y, vx: 40, vy: 0, r: 2.2, dmg: 1, owner: "player", dead: false, spent: false, ttl: 1 });
  enc.advance(3);
  ok("a bullet's final-tick segment still hits", enc.state().hitsDealt === 1, "hitsDealt=" + enc.state().hitsDealt);
  // crossing a wall-pinned enemy and the world edge in one tick still hits
  enc.reset();
  enc.spawnEnemy(t.WW - 7, ship().y);
  t.G.bullets.push({ x: t.WW - 30, y: ship().y, px: t.WW - 30, py: ship().y, vx: 40, vy: 0, r: 2.2, dmg: 1, owner: "player", dead: false, spent: false, ttl: 60 });
  enc.advance(3);
  ok("a wall-pinned enemy still takes the crossing hit", enc.state().hitsDealt === 1, "hitsDealt=" + enc.state().hitsDealt);
  // with BOUNCE on, the reflected chord still covers the crossed body
  enc.reset();
  enc.setBounce(true);
  enc.spawnEnemy(t.WW - 20, ship().y);
  t.G.bullets.push({ x: t.WW - 38, y: ship().y, px: t.WW - 38, py: ship().y, vx: 40, vy: 0, r: 2.2, dmg: 1, owner: "player", dead: false, spent: false, ttl: 60 });
  enc.advance(3);
  enc.setBounce(false);
  ok("a bounce-tick chord still hits the wall-side enemy", enc.state().hitsDealt === 1, "hitsDealt=" + enc.state().hitsDealt);
  // the FIRST body along the path takes the hit, not the first in the array
  enc.reset();
  enc.spawnEnemy(ship().x + 165, ship().y); // index 0 — farther
  enc.spawnEnemy(ship().x + 150, ship().y); // index 1 — nearer
  const eFar = enc.E.enemies[0];
  const eNear = enc.E.enemies[1];
  t.G.bullets.push({ x: ship().x, y: ship().y, px: ship().x, py: ship().y, vx: 40, vy: 0, r: 2.2, dmg: 1, owner: "player", dead: false, spent: false, ttl: 60 });
  enc.advance(6);
  ok("hits resolve in path order, not spawn order", eNear.hp === ECFG.enemy.hp - 1 && eFar.hp === ECFG.enemy.hp, "near=" + eNear.hp + " far=" + eFar.hp);

  // ---- D. lance damage, telegraph timing, invulnerability ----
  enc.reset();
  enc.spawnEnemy(ship().x + 70, ship().y); // pushed out to the 90 px minimum, inside engage range
  let ticksToHit = 0;
  for (; ticksToHit < 300 && enc.state().hitsTaken < 1; ticksToHit++) enc.advance(1);
  s = enc.state();
  ok("the lance connects on a parked ship", s.hitsTaken === 1 && s.hull === ECFG.player.hull - 1, "ticks=" + ticksToHit);
  ok("a lance is telegraphed before it lands", ticksToHit >= ECFG.lance.telegraph, "ticks=" + ticksToHit);
  ok("a hit grants post-hit invulnerability", s.invuln > 0, "invuln=" + s.invuln);
  const hullBefore = enc.state().hull;
  ok("damage during invulnerability is refused", enc.damagePlayer(1) === false && enc.state().hull === hullBefore);
  enc.E.invuln = 0;
  ok("damage lands again once the grace expires", enc.damagePlayer(1) === true && enc.state().hull === hullBefore - 1);
  enc.E.invuln = 0;
  enc.damagePlayer(1);
  s = enc.state();
  ok("zero hull is the dead state", s.hull === 0 && s.state === "dead");
  ok("the dead state freezes the sim", enc.frozen());

  // ---- D2. the grace period counts down naturally, and the lance sweeps
  // the ship's own travel ----
  enc.reset();
  enc.advance(1); // the wave clock must run for the countdown
  enc.damagePlayer(1);
  const grace = enc.state().invuln;
  ok("a hit starts the full configured grace", grace === ECFG.player.invuln, "invuln=" + grace);
  enc.advance(grace - 1);
  ok("damage stays refused through the countdown", enc.damagePlayer(1) === false && enc.state().hull === ECFG.player.hull - 1, "invuln=" + enc.state().invuln);
  enc.advance(1);
  ok("the grace expires on schedule and damage lands", enc.state().invuln === 0 && enc.damagePlayer(1) === true && enc.state().hull === ECFG.player.hull - 2);
  enc.reset();
  enc.advance(1);
  enc.spawnEnemy(ship().x, ship().y - 200);
  const lancer = enc.E.enemies[0];
  lancer.x = ship().x;
  lancer.y = ship().y - 60; // staged: planted overhead, beam locked downward
  lancer.mode = "pulse";
  lancer.t = 5;
  lancer.lockA = Math.PI / 2;
  lancer.pulseHit = false;
  enc.E.invuln = 0;
  enc.E.shipPrev = { x: ship().x - 16, y: ship().y };
  ship().x += 16; // the ship crossed 32 px of beam between two ticks
  enc.advance(1);
  ok("a fast ship cannot step across a live lance", enc.state().hitsTaken === 1, "hitsTaken=" + enc.state().hitsTaken);

  // ---- E. death cannot resume; restart cleans up and keeps the tuner ----
  enc.E.invuln = 0; // D2 reset the run — reach the dead state again
  enc.damagePlayer(99);
  ok("lethal damage freezes the run for the cleanup test", enc.state().state === "dead");
  const deadTick = enc.state().waveTick;
  const deadX = ship().x;
  enc.advance(30);
  ok("no tick advances while dead", enc.state().waveTick === deadTick && ship().x === deadX);
  t.G.bullets.push({ x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, r: 2.2, dmg: 1, owner: "player", dead: false, ttl: 60 });
  enc.E.orbs.push({ x: 5, y: 5, vx: 0, vy: 0 });
  t.setEdgeMargin(77); // a tuner change that must survive the restart
  enc.restart();
  s = enc.state();
  ok("restart clears enemies, orbs, bullets and transient state",
    s.state === "idle" && s.wave === 1 && s.enemies === 0 && s.orbs === 0 && t.G.bullets.length === 0 &&
    s.hull === ECFG.player.hull && s.xp === 0 && s.level === 1 && s.waveTick === 0 &&
    s.kills === 0 && s.mods.cool === 1 && s.mods.life === 1);
  ok("restart recenters the ship", ship().x === t.WW / 2 && ship().y === t.WH / 2);
  ok("restart preserves tuner settings", t.camState().EDGEMARGIN === 77);
  t.setEdgeMargin(priorEdge);

  // ---- F. upgrade flow: arm, pause, apply, resume ----
  enc.reset();
  enc.E.hull = 99;
  enc.advance(130); // group 1 on the field
  ok("four XP does not arm the upgrade", (enc.addXp(4), !enc.state().upgradeReady));
  ok("five XP arms the upgrade prompt", (enc.addXp(1), enc.state().upgradeReady));
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyU" }));
  ok("the U key opens the overlay deliberately", enc.state().state === "upgrade" && enc.frozen());
  const pauseTick = enc.state().waveTick;
  const foe = enc.E.enemies[0];
  const foeX = foe.x;
  enc.advance(40);
  ok("the upgrade overlay pauses combat", enc.state().waveTick === pauseTick && foe.x === foeX);
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1" }));
  s = enc.state();
  ok("choice 1 applies the fire-cooldown upgrade", s.mods.cool === 0.7 && s.state === "active");
  ok("an upgrade consumes the XP and raises the level", s.xp === 0 && s.level === 2 && !s.upgradeReady);
  enc.advance(10);
  ok("combat resumes after the choice", enc.state().waveTick === pauseTick + 10);
  // the applied multipliers reach fire() — expectations come from the live
  // tuner values, so an already-tuned page cannot fake a failure
  const tun = enc.tunables();
  t.setAimMode("push");
  t.G.aimed = true;
  t.G.aimAngle = 0;
  t.G.cool = 0;
  enc.fireOnce();
  ok("the cooldown upgrade shortens the firing gate",
    t.G.cool === Math.max(1, Math.round(tun.BCOOL * 0.7 / tun.TICK)), "cool=" + t.G.cool);
  enc.addXp(5);
  enc.openUpgrade();
  enc.chooseUpgrade(1);
  t.G.cool = 0;
  enc.fireOnce();
  const newest = t.G.bullets[t.G.bullets.length - 1];
  ok("the lifetime upgrade stretches new bullets",
    enc.state().mods.life === 1.5 && newest && newest.ttl === Math.max(1, Math.round(tun.BLIFE * 1.5 * 1000 / tun.TICK)), "ttl=" + (newest && newest.ttl));
  enc.E.hull = 1;
  enc.addXp(5);
  enc.openUpgrade();
  enc.chooseUpgrade(2);
  ok("the hull patch repairs one hull", enc.state().hull === 2);

  // ---- G. wave/level independence, the clear gate, the wave transition ----
  enc.reset();
  enc.E.hull = 99;
  enc.advance(130);
  for (const e of enc.E.enemies) e.hp = 0;
  enc.advance(1);
  s = enc.state();
  ok("an empty field with a pending queue does not clear", s.enemies === 0 && s.kills === 3 && s.state === "active" && s.queued === 2);
  enc.advance(W1[1].spawnAt - enc.state().waveTick + 1);
  ok("the queued group still lands", enc.state().enemies === 2);
  for (const e of enc.E.enemies) e.hp = 0;
  enc.advance(1);
  s = enc.state();
  ok("empty queue plus empty field clears Wave 1", s.state === "cleared" && s.queued === 0 && s.kills === 5);
  ok("wave progress and player level stay separate", s.wave === 1 && s.level === 1);
  const W2 = enc.waveGroups(2);
  const w2total = W2.reduce((n, g) => n + g.count, 0);
  enc.advance(ECFG.clearHold + 1);
  s = enc.state();
  ok("the clear hold expiring deals wave 2 in the warning state",
    s.state === "warning" && s.wave === 2 && s.waveTick >= 1 && s.waveTick <= 3 && s.queued === w2total,
    "state=" + s.state + " wave=" + s.wave + " queued=" + s.queued);
  enc.advance(W2[0].spawnAt - s.waveTick);
  s = enc.state();
  ok("the first wave-2 group lands darts only", s.enemies === W2[0].count && s.darts === s.enemies && s.chargers === 0, "enemies=" + s.enemies);
  // per-wave reseed: an identical wave-1 kill-through deals an identical
  // wave 2, no matter that both runs consumed rand() along the way
  const waveTwoRun = () => {
    enc.reset();
    enc.E.hull = 99;
    enc.advance(130);
    for (const e of enc.E.enemies) e.hp = 0;
    enc.advance(W1[1].spawnAt - 130 + 1);
    for (const e of enc.E.enemies) e.hp = 0;
    enc.advance(1);
    enc.advance(ECFG.clearHold + 1 + 130);
    return JSON.stringify(enc.E.enemies.map((e) => [+e.x.toFixed(3), +e.y.toFixed(3)]));
  };
  const w2a = waveTwoRun();
  const w2b = waveTwoRun();
  ok("an identical wave-1 run deals an identical wave 2", w2a === w2b && w2a.length > 10);

  // ---- I. wave scaling — pure functions, monotone growth, hard caps ----
  const st1 = enc.statsFor(1);
  const ct1 = enc.countsFor(1);
  ok("wave-1 stats equal the live wave-1 constants",
    st1.dart.hp === ECFG.enemy.hp && st1.dart.maxSpeed === ECFG.enemy.maxSpeed &&
    st1.dart.cooldown === ECFG.lance.cooldown && st1.charger.hp === ECFG.charger.hp &&
    st1.charger.maxSpeed === ECFG.charger.maxSpeed && st1.charger.rest === ECFG.charger.rest);
  ok("wave-1 counts equal the wave-1 schedule", ct1.darts === W1.reduce((n, g) => n + g.count, 0) && ct1.chargers === 0);
  let mono = true;
  for (let w = 2; w <= 12; w++) {
    const a = enc.statsFor(w - 1);
    const b = enc.statsFor(w);
    const ca = enc.countsFor(w - 1);
    const cb = enc.countsFor(w);
    if (cb.darts < ca.darts || cb.chargers < ca.chargers) mono = false;
    if (b.dart.hp < a.dart.hp || b.charger.hp < a.charger.hp) mono = false;
    if (b.dart.maxSpeed < a.dart.maxSpeed || b.charger.maxSpeed < a.charger.maxSpeed) mono = false;
  }
  ok("counts, hp and speed never shrink over waves 1..12", mono);
  const st30 = enc.statsFor(30);
  const ct30 = enc.countsFor(30);
  ok("every cap holds at wave 30",
    ct30.darts === 21 && ct30.chargers === 4 && st30.dart.hp === 6 && st30.charger.hp === 9 &&
    st30.dart.maxSpeed === 4.8 && st30.charger.maxSpeed === 3.2 &&
    st30.dart.cooldown === 72 && st30.charger.rest === 54);
  ok("chargers stay out until wave 3", enc.countsFor(2).chargers === 0 && enc.countsFor(3).chargers >= 1);

  // ---- J. the charger: locked lunge, one hit per dash, honest walls ----
  // staged like D2 stages the lance — direct mode pokes through the hook
  enc.reset();
  enc.advance(1);
  enc.spawnEnemy(ship().x + 200, ship().y, 0, "charger");
  const ram = enc.E.enemies[0];
  ok("a spawned charger carries its stamped type and stats",
    ram.type === "charger" && ram.r === ECFG.charger.r && ram.hp === ECFG.charger.hp && ram.orbDrop === 2);
  ram.cd = 0; // rested, inside the 260 px engage ring — the next tick plants
  enc.advance(1);
  ok("a rested charger in range opens the windup with the lunge line locked",
    ram.mode === "windup" && Math.abs(ram.lockA - Math.PI) < 1e-6, "mode=" + ram.mode);
  ship().y += 150; // the player relocates mid-windup — the lock must hold
  enc.advance(ECFG.charger.windup + 1);
  ok("the dash follows the locked line, not the live player",
    ram.mode === "dash" && Math.abs(ram.vx + ECFG.charger.dashSpeed) < 1e-9 && Math.abs(ram.vy) < 1e-9,
    "vx=" + ram.vx + " vy=" + ram.vy);
  // one dash, one hit — and never through the post-hit grace
  enc.reset();
  enc.advance(1);
  enc.spawnEnemy(ship().x + 120, ship().y, 0, "charger");
  const lunger = enc.E.enemies[0];
  lunger.mode = "dash"; // staged mid-lunge, aimed straight at the parked ship
  lunger.t = ECFG.charger.dashTicks;
  lunger.lockA = Math.PI;
  lunger.dashHit = false;
  enc.E.invuln = 0;
  enc.advance(16); // 112 px of dash — contact comes around tick 15
  s = enc.state();
  ok("a dash connects for one damage through hitPlayer", s.hitsTaken === 1 && s.hull === ECFG.player.hull - 1, "hitsTaken=" + s.hitsTaken);
  enc.advance(9); // the body passes through — the dashHit flag holds
  ok("a dash lands at most one hit", enc.state().hitsTaken === 1, "hitsTaken=" + enc.state().hitsTaken);
  enc.reset();
  enc.advance(1);
  enc.spawnEnemy(ship().x + 120, ship().y, 0, "charger");
  const graced = enc.E.enemies[0];
  graced.mode = "dash";
  graced.t = ECFG.charger.dashTicks;
  graced.lockA = Math.PI;
  graced.dashHit = false;
  enc.E.invuln = 500; // deep post-hit grace — the ram must respect it
  enc.advance(20);
  ok("a dash respects invulnerability", enc.state().hitsTaken === 0 && enc.state().hull === ECFG.player.hull);
  // a fast ship crossing the dash lane between two ticks still takes the
  // hit — staged shipPrev, like the D2 lance sweep
  enc.reset();
  enc.advance(1);
  enc.spawnEnemy(ship().x, ship().y - 200, 0, "charger");
  const crosser = enc.E.enemies[0];
  crosser.x = ship().x;
  crosser.y = ship().y - 20; // staged: lunging down across the ship's lane
  crosser.mode = "dash";
  crosser.t = 5;
  crosser.lockA = Math.PI / 2;
  crosser.dashHit = false;
  enc.E.invuln = 0;
  enc.E.shipPrev = { x: ship().x - 40, y: ship().y };
  ship().x += 40; // the ship crossed 80 px of dash lane between two ticks
  enc.advance(1);
  ok("a fast ship cannot cross a dash lane untouched", enc.state().hitsTaken === 1, "hitsTaken=" + enc.state().hitsTaken);
  // the wall ends a lunge honestly
  enc.reset();
  enc.advance(1);
  enc.spawnEnemy(ship().x + 100, ship().y, 0, "charger");
  const rammer = enc.E.enemies[0];
  rammer.x = 30; // staged 30 px off the left world wall
  rammer.y = ship().y;
  rammer.mode = "dash";
  rammer.t = ECFG.charger.dashTicks;
  rammer.lockA = Math.PI; // lunging straight into the wall
  rammer.dashHit = false;
  enc.advance(4); // 28 px of lunge — the clamp stops the body at its radius
  ok("a wall clamp ends the dash early into tired", rammer.mode === "tired" && rammer.x === rammer.r, "mode=" + rammer.mode + " x=" + rammer.x);
  // the heavier body pays out double
  enc.reset();
  enc.advance(1);
  enc.spawnEnemy(ship().x + 150, ship().y, 0, "charger");
  enc.E.enemies[0].hp = 0;
  enc.advance(1);
  s = enc.state();
  ok("a dead charger drops two orbs", s.orbs === 2 && s.kills === 1, "orbs=" + s.orbs);

  // ---- H. a click cannot resume through the dead overlay ----
  t.setAimMode("mouse"); // escape-pauses directly in mouse mode
  enc.reset();
  enc.damagePlayer(99);
  ok("direct lethal damage reaches the dead state", enc.state().state === "dead" && enc.frozen());
  if (t.G.running) document.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
  ok("precondition: the loop sits stopped before the dead-click test", t.G.running === false);
  const canvasEl = document.getElementById("field");
  canvasEl.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: 40, clientY: 40, bubbles: true }));
  ok("a click while dead resumes the loop only — combat stays frozen", t.G.running === true && enc.frozen());
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
  ok("escape still pauses cleanly from the dead overlay", t.G.running === false);
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyR" }));
  ok("R from the dead overlay restarts the wave", enc.state().state === "idle" && enc.state().hull === ECFG.player.hull);

  // ---- restore the page for a human ----
  t.setAimMode(priorAim);
  t.setEdgeMargin(priorEdge);
  t.G.leftHeld = false;
  enc.restart();
  t.render();

  const failed = R.filter((r) => !r.pass);
  return { total: R.length, passed: R.length - failed.length, failed, results: R };
};
