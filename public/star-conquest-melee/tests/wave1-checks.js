"use strict";

// Deterministic wave checks — the suite now covers the endless progressive
// waves: the wave-1 slice, the wave transition, the pure scaling functions,
// the charger archetype and the post-wave XP shop. Load this file in the
// page (fetch + eval
// from the console, or a script tag), then call runWave1Checks(). The
// suite drives the fixed-step sim through window.__test only — no RAF,
// no real input. Timing expectations read the live tuner values, so a
// tuned page cannot fake a failure. On return the suite restores the aim
// mode, edge-margin, impact-fx, minimap, edge-arrow and blast values it
// touched (the two blast sliders go back inside their own section) and
// resets the encounter; it leaves G.mouse and the aim history wherever its
// synthetic input put them.
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
  const priorFx = t.fxState();
  const priorStarted = t.G.started;

  // The pixel sections (M's corner map, N's chevrons) read the ORDINARY
  // in-session screen. On a page that has never started, that screen is not
  // what is up: the first-run controls card owns the idle field and takes the
  // corner map down with it, which is precisely the screen those sections are
  // not about. Flipping the session flag — the flag only; nothing here starts
  // the loop or the encounter — puts the normal HUD back, and the restore tail
  // hands the page to the human exactly as it was found.
  t.G.started = true;

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
    s.hull === ECFG.player.hull && s.hullMax === ECFG.player.hull && s.xp === 0 && s.waveTick === 0 &&
    s.kills === 0 && s.mods.cool === 1 && s.mods.speed === 0);
  ok("restart recenters the ship", ship().x === t.WW / 2 && ship().y === t.WH / 2);
  ok("restart preserves tuner settings", t.camState().EDGEMARGIN === 77);
  t.setEdgeMargin(priorEdge);

  // ---- F. the post-wave shop: sweep, open, buy, refuse, continue ----
  // The U-key level flow is gone. XP is an uncapped wallet; every clear
  // holds the banner while the field's orbs sweep to the ship, then opens a
  // FROZEN shop; digits buy while the wallet can pay, Enter deals the wave.
  // The shop's keys land only while the game is LIVE — paused, they belong
  // to the pause menu (section R pins that) — and a frozen shop keeps
  // G.running true in play, so dispatches here raise the flag R-style:
  // the flag only, the loop itself stays stopped.
  const liveKey = (code) => {
    const was = t.G.running;
    t.G.running = true;
    document.dispatchEvent(new KeyboardEvent("keydown", { code }));
    t.G.running = was;
  };
  enc.reset();
  enc.E.hull = 99;
  enc.advance(130); // group 1 on the field
  for (const e of enc.E.enemies) e.hp = 0;
  enc.advance(W1[1].spawnAt - 130 + 1); // group 2 lands
  for (const e of enc.E.enemies) e.hp = 0;
  enc.advance(1); // the reap clears the wave
  ok("a wave clear opens the banner, not the shop", enc.state().state === "cleared" && !enc.frozen());
  enc.E.orbs.push({ x: 5, y: 5, vx: 0, vy: 0 }); // parked in the far world corner — the sweep must still bank it
  enc.advance(ECFG.clearHold + 1);
  s = enc.state();
  ok("the banner hold expiring opens the shop, frozen", s.state === "shop" && enc.frozen(), "state=" + s.state);
  ok("the cleared sweep banks every orb before the shop opens",
    s.orbs === 0 && s.xp === 6, "orbs=" + s.orbs + " xp=" + s.xp);
  const shopTick = s.waveTick;
  enc.advance(40);
  ok("the shop freezes the sim", enc.state().waveTick === shopTick && enc.state().state === "shop");
  liveKey("Digit1");
  s = enc.state();
  ok("digit 1 buys RAPID LOADER and the shop stays open",
    s.mods.cool === 0.7 && s.xp === 2 && s.owned[0] === 1 && s.state === "shop",
    "cool=" + s.mods.cool + " xp=" + s.xp + " state=" + s.state);
  liveKey("Digit1");
  s = enc.state();
  ok("an unaffordable rank is refused and the wallet is untouched",
    s.mods.cool === 0.7 && s.xp === 2 && s.owned[0] === 1,
    "xp=" + s.xp + " owned=" + s.owned[0]);
  ok("buy() reports the refusal", enc.buy(0) === false && enc.state().xp === 2);
  enc.E.hull = enc.E.hullMax; // full hull — the patch must be off the shelf
  enc.addXp(20);              // fund the repairs
  ok("HULL PATCH is refused at full hull",
    enc.buy(2) === false && enc.state().xp === 22 && enc.state().hull === enc.E.hullMax);
  enc.E.hull = 1;
  liveKey("Digit3");
  liveKey("Digit3");
  s = enc.state();
  ok("HULL PATCH repairs at a flat 6 per point", s.hull === 3 && s.xp === 10,
    "hull=" + s.hull + " xp=" + s.xp);
  liveKey("Enter");
  s = enc.state();
  ok("enter continues into wave 2's warning",
    s.state === "warning" && s.wave === 2 && s.waveTick === 0,
    "state=" + s.state + " wave=" + s.wave);
  enc.continueFromShop();
  liveKey("NumpadEnter");
  s = enc.state();
  ok("a doubled continue deals exactly one wave — never two",
    s.wave === 2 && s.state === "warning" && s.waveTick === 0,
    "wave=" + s.wave + " state=" + s.state);
  // the bought terms reach the sim — expectations come from the live tuner
  // values, so an already-tuned page cannot fake a failure
  const tun = enc.tunables();
  t.setAimMode("push");
  t.G.aimed = true;
  t.G.aimAngle = 0;
  t.G.cool = 0;
  enc.fireOnce();
  ok("the bought cooldown shortens the firing gate",
    t.G.cool === Math.max(1, Math.round(tun.BCOOL * 0.7 / tun.TICK)), "cool=" + t.G.cool);
  // the retired lifetime upgrade left no multiplier behind: a bullet fired
  // on a purchased page still carries exactly the BLIFE slider's ttl
  t.G.cool = 0;
  enc.fireOnce();
  const newest = t.G.bullets[t.G.bullets.length - 1];
  ok("no purchase stretches bullet lifetime",
    newest && newest.ttl === Math.max(1, Math.round(tun.BLIFE * 1000 / tun.TICK)),
    "ttl=" + (newest && newest.ttl) + " want=" + Math.max(1, Math.round(tun.BLIFE * 1000 / tun.TICK)));

  // ---- G. the clear gate, the shop beat, the wave transition ----
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
  const W2 = enc.waveGroups(2);
  const w2total = W2.reduce((n, g) => n + g.count, 0);
  enc.advance(ECFG.clearHold + 1);
  s = enc.state();
  ok("the clear hold expiring opens the shop instead of dealing a wave",
    s.state === "shop" && s.wave === 1 && enc.frozen(),
    "state=" + s.state + " wave=" + s.wave);
  enc.continueFromShop();
  s = enc.state();
  ok("continuing from the shop deals wave 2 in the warning state",
    s.state === "warning" && s.wave === 2 && s.waveTick === 0 && s.queued === w2total,
    "state=" + s.state + " wave=" + s.wave + " queued=" + s.queued);
  enc.advance(W2[0].spawnAt);
  s = enc.state();
  ok("the first wave-2 group lands darts only", s.enemies === W2[0].count && s.darts === s.enemies && s.chargers === 0, "enemies=" + s.enemies);
  // per-wave reseed: an identical wave-1 kill-through deals an identical
  // wave 2, no matter that both runs consumed rand() along the way. The
  // advance is SPLIT around continueFromShop(): a fused clearHold+1+130
  // would park both runs in the frozen shop with "[]" on both sides, and
  // only the length guard below would catch the vacuous pass.
  const waveTwoRun = () => {
    enc.reset();
    enc.E.hull = 99;
    enc.advance(130);
    for (const e of enc.E.enemies) e.hp = 0;
    enc.advance(W1[1].spawnAt - 130 + 1);
    for (const e of enc.E.enemies) e.hp = 0;
    enc.advance(1);
    enc.advance(ECFG.clearHold + 1); // lands in the frozen shop
    enc.continueFromShop();
    enc.advance(130);
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
  t.ui.closeDev(); // the dev screen eats a field click — this section needs the pause menu, not the panel
  ok("precondition: the loop sits stopped before the dead-click test", t.G.running === false);
  const canvasEl = document.getElementById("field");
  canvasEl.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: 40, clientY: 40, bubbles: true }));
  ok("a click while dead resumes the loop only — combat stays frozen", t.G.running === true && enc.frozen());
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
  ok("escape still pauses cleanly from the dead overlay", t.G.running === false);
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyR" }));
  ok("R from the dead overlay restarts the wave", enc.state().state === "idle" && enc.state().hull === ECFG.player.hull);

  // ---- K. impact fx (visual-only, deterministic) ----
  // The bursts are decoration and nothing else: they must land where the
  // bullet actually landed, age on the sim clock, honour their own slider,
  // and never draw a number from the encounter's seeded rand() stream.
  const shot = (x, y, vx, ttl, vy) => t.G.bullets.push({ x, y, px: x, py: y, vx, vy: vy || 0, r: 2.2, dmg: 1,
    owner: "player", dead: false, spent: false, ttl: ttl === undefined ? 60 : ttl });
  t.setFxInt(1); // whatever the page was tuned to, these checks need bursts on
  enc.reset();
  enc.E.hull = 99;
  enc.spawnEnemy(ship().x + 190, ship().y);
  const fxFoe = enc.E.enemies[0];
  shot(ship().x, ship().y, 40);
  for (let k = 0; k < 12 && enc.state().hitsDealt < 1; k++) enc.advance(1);
  // stepEnemy moved the body before resolveBulletHits, so the entry point is
  // measured against the LIVE body: it sits on the inflated surface, not at
  // the muzzle and not at the body's center
  const b1 = t.fx.bursts[0];
  const b1d = b1 ? Math.hypot(b1.x - fxFoe.x, b1.y - fxFoe.y) : -1;
  // — a two-sided band, so the body's center and the post-move endpoint fail it
  ok("a bullet hit spawns one impact burst at the entry point",
    enc.state().hitsDealt === 1 && t.fx.bursts.length === 1 && b1 && b1.kind === "enemy" &&
    b1d <= fxFoe.r + 2.2 + 0.5 && b1d >= fxFoe.r + 2.2 - 0.5,
    "bursts=" + t.fx.bursts.length + " d=" + b1d.toFixed(2));
  // a bullet that dies at the world wall sparks ON the wall plane
  enc.reset();
  enc.setBounce(false);
  shot(t.WW - 30, ship().y, 40);
  enc.advance(3);
  const wallB = t.fx.bursts[0];
  ok("a wall death sparks on the wall plane",
    t.fx.bursts.length === 1 && wallB && wallB.kind === "wall" && wallB.x === t.WW &&
    Math.abs(wallB.y - ship().y) < 1e-9 && t.G.bullets.length === 0,
    wallB ? "kind=" + wallB.kind + " x=" + wallB.x : "bursts=" + t.fx.bursts.length);
  // and it sparks where the segment CROSSES the plane, not at the post-move
  // position clamped onto it — that would slide the spark a whole tick of
  // tangential travel along the wall on any angled shot
  enc.reset();
  const dgy = ship().y + 34 * ((t.WW - (t.WW - 12)) / 20); // px→x crosses x=WW at t = 12/20
  shot(t.WW - 12, ship().y, 20, 60, 34);
  enc.advance(1);
  const diagB = t.fx.bursts[0];
  ok("a diagonal wall death sparks at the crossing point",
    t.fx.bursts.length === 1 && diagB && diagB.x === t.WW && Math.abs(diagB.y - dgy) < 1e-6,
    diagB ? "y=" + diagB.y + " want=" + dgy : "bursts=" + t.fx.bursts.length);
  // a bouncing bullet sparks at the mirror and stays alive
  enc.reset();
  enc.setBounce(true);
  shot(t.WW - 30, ship().y, 40);
  enc.advance(3);
  const bounced = t.fx.bursts.filter((b) => b.kind === "wall").length;
  ok("a bounce reflection sparks and keeps the bullet",
    bounced >= 1 && t.G.bullets.length === 1, "wallBursts=" + bounced + " bullets=" + t.G.bullets.length);
  // the bounce sparks read the same crossing, off the RAW segment — a mirrored
  // x or vx must never reach them, so dx still points INTO the wall
  enc.reset();
  shot(t.WW - 12, ship().y, 20, 60, 34);
  enc.advance(1);
  const dgbB = t.fx.bursts[0];
  ok("a diagonal bounce sparks at the crossing point, facing the wall",
    t.fx.bursts.length === 1 && dgbB && dgbB.kind === "wall" && dgbB.x === t.WW &&
    Math.abs(dgbB.y - dgy) < 1e-6 && dgbB.dx > 0 && t.G.bullets.length === 1,
    dgbB ? "y=" + dgbB.y + " dx=" + dgbB.dx.toFixed(3) : "bursts=" + t.fx.bursts.length);
  enc.setBounce(false);
  // an enemy pinned near the wall can eat a bullet on the very tick that
  // bullet leaves the world — the sweep runs after the bullet loop, so the
  // wall spark has to wait for it and stand down when the hit lands
  enc.reset();
  enc.E.hull = 99;
  enc.spawnEnemy(t.WW - 15, ship().y);
  shot(t.WW - 30, ship().y, 40);
  enc.advance(1);
  const pinB = t.fx.bursts;
  ok("a bullet eaten on its exit tick sparks once, on the enemy",
    enc.state().hitsDealt === 1 && pinB.length === 1 && pinB[0].kind === "enemy" && pinB[0].x < t.WW - 5,
    "hits=" + enc.state().hitsDealt + " bursts=" + JSON.stringify(pinB.map((b) => [b.kind, +b.x.toFixed(1)])));
  // a mid-air ttl fade hit nothing — it must not spark
  enc.reset();
  shot(ship().x, ship().y, 40, 1);
  enc.advance(3);
  ok("ttl expiry in open space spawns nothing",
    t.fx.bursts.length === 0 && t.G.bullets.length === 0,
    "bursts=" + t.fx.bursts.length + " bullets=" + t.G.bullets.length);
  // lifetime is stamped at spawn from the LIVE slider, like a bullet's ttl —
  // a mid-burst slider move never retro-edits what is already flying
  enc.reset();
  const d0 = t.fxState().FXDUR;
  const tickMs = enc.tunables().TICK;
  const life0 = Math.max(1, Math.round((d0 * 1000) / tickMs));
  t.spawnImpactFx(ship().x, ship().y, 1, 0, "enemy");
  const d1 = d0 === 0.6 ? 0.55 : 0.6;
  t.setFxDur(d1);
  enc.advance(life0 - 1);
  const aliveAt = t.fx.bursts.length;
  enc.advance(1);
  const goneAt = t.fx.bursts.length;
  t.spawnImpactFx(ship().x, ship().y, 1, 0, "enemy");
  const b2 = t.fx.bursts[t.fx.bursts.length - 1];
  ok("a burst lives exactly its stamped duration",
    aliveAt === 1 && goneAt === 0 && b2 && b2.life === Math.max(1, Math.round((d1 * 1000) / tickMs)),
    "life0=" + life0 + " alive=" + aliveAt + " gone=" + goneAt + " newLife=" + (b2 && b2.life));
  t.setFxDur(d0);
  // the off switch kills the decoration and touches nothing else
  t.setFxInt(0);
  enc.reset();
  enc.E.hull = 99;
  enc.spawnEnemy(ship().x + 190, ship().y);
  const offFoe = enc.E.enemies[0];
  const offHp = offFoe.hp;
  shot(ship().x, ship().y, 40);
  for (let k = 0; k < 12 && enc.state().hitsDealt < 1; k++) enc.advance(1);
  ok("intensity zero spawns no bursts but damage still lands",
    t.fx.bursts.length === 0 && enc.state().hitsDealt === 1 && offFoe.hp === offHp - 1,
    "bursts=" + t.fx.bursts.length + " hp=" + offFoe.hp);
  t.setFxInt(1);
  // FX on and FX off must deal the same sim: orb drift angles come straight
  // off rand(), so one stolen draw at the spawn site moves every orb
  const orbRun = (i) => {
    t.setFxInt(i);
    enc.reset();
    enc.E.hull = 99;
    enc.spawnEnemy(ship().x + 150, ship().y);
    shot(ship().x, ship().y, 40);
    enc.advance(6);
    shot(ship().x, ship().y, 40);
    enc.advance(6);
    enc.advance(78);
    return JSON.stringify(enc.E.orbs.map((o) => [+o.x.toFixed(3), +o.y.toFixed(3)]));
  };
  const fxOff = orbRun(0);
  const fxOn = orbRun(1);
  ok("impact fx never consume the sim's seeded stream",
    fxOff === fxOn && fxOff.length > 10, "off=" + fxOff + " on=" + fxOn);
  // and the bursts themselves replay identically — seeds come from hash32,
  // never from Math.random or the clock, and restart() zeroes fx.count
  const burstRec = () => {
    t.setFxInt(1);
    enc.reset();
    enc.E.hull = 99;
    enc.spawnEnemy(ship().x + 190, ship().y);
    const seen = [];
    for (let k = 0; k < 40; k++) {
      if (k === 0 || k === 12) shot(ship().x, ship().y, 40);
      enc.advance(1);
      for (const b of t.fx.bursts) seen.push([b.seed, +b.x.toFixed(3), +b.y.toFixed(3), b.age]);
    }
    return { key: JSON.stringify(seen), n: seen.length };
  };
  const recA = burstRec();
  const recB = burstRec();
  ok("identical runs deal identical burst records",
    recA.key === recB.key && recA.n > 2, "n=" + recA.n);

  // ---- L. mutual contact damage ----
  // A physical touch is a two-sided event: the player pays one hull under the
  // usual grace rules, the body pays exactly what one player bullet costs it,
  // and a per-enemy cooldown paces the repeat so ramming stays a tactic
  // instead of a shredder. Every expectation reads the live BDMG/CONTACTCD
  // tunables, so a retuned page cannot fake a pass or a failure.
  const ctDmg = enc.tunables().BDMG;
  const ctCd = enc.tunables().CONTACTCD;
  const ctAimWas = t.aimState().AIMMODE;
  t.G.leftHeld = false; // no autofire noise while this section drives fire() by hand
  // stage a body ON the ship: spawnEnemy refuses the 90 px minimum ring, so it
  // is dealt out wide and teleported in, held in seek so the lance stays out
  const ctPin = (dx, dy, type) => {
    enc.spawnEnemy(ship().x + 150, ship().y + 150, 0, type);
    const e = enc.E.enemies[enc.E.enemies.length - 1];
    e.x = ship().x + dx;
    e.y = ship().y + (dy || 0);
    e.vx = 0;
    e.vy = 0;
    e.cd = 9999; // this section tests contact, not the lance
    return e;
  };

  enc.reset();
  enc.advance(1);
  const ctFoe = ctPin(10);
  enc.E.invuln = 0;
  enc.advance(1);
  s = enc.state();
  ok("body contact lands a mutual hit: one hull for one bullet-equivalent",
    s.hitsTaken === 1 && s.hull === ECFG.player.hull - 1 &&
    ctFoe.hp === ECFG.enemy.hp - ctDmg && s.contactsDealt === 1,
    "hitsTaken=" + s.hitsTaken + " hull=" + s.hull + " hp=" + ctFoe.hp + " dealt=" + s.contactsDealt);

  // the enemy side is EXACTLY one bullet: a contact delta measured against a
  // real fire() bullet's delta, so the two damage sources cannot drift apart
  enc.reset();
  enc.E.hull = 99;
  enc.advance(1);
  const ctA = ctPin(10);
  const ctA0 = ctA.hp;
  enc.E.invuln = 0;
  enc.advance(1);
  const ctContactDelta = ctA0 - ctA.hp;
  enc.reset();
  enc.E.hull = 99;
  enc.advance(1);
  enc.spawnEnemy(ship().x + 150, ship().y);
  const ctShotFoe = enc.E.enemies[0];
  const ctShotHp0 = ctShotFoe.hp;
  t.setAimMode("push"); // the same staging section F uses to reach the real fire()
  t.G.aimed = true;
  t.G.aimAngle = 0;
  t.G.cool = 0;
  enc.fireOnce();
  for (let k = 0; k < 24 && enc.state().hitsDealt < 1; k++) enc.advance(1);
  const ctBulletDelta = ctShotHp0 - ctShotFoe.hp;
  t.setAimMode(ctAimWas);
  ok("contact damage equals one fired bullet's damage",
    enc.state().hitsDealt === 1 && ctContactDelta === ctBulletDelta && ctContactDelta === ctDmg,
    "contact=" + ctContactDelta + " bullet=" + ctBulletDelta + " BDMG=" + ctDmg);

  // the two sides are gated independently: the grace still covers the player,
  // and the body it touches still pays — that is what keeps a melee sweep real
  enc.reset();
  enc.advance(1);
  const ctGraced = ctPin(10);
  const ctGracedHp0 = ctGraced.hp;
  enc.E.invuln = 500; // deep post-hit grace
  enc.advance(1);
  s = enc.state();
  ok("the player side of contact respects the post-hit grace",
    s.hitsTaken === 0 && s.hull === ECFG.player.hull, "hitsTaken=" + s.hitsTaken + " hull=" + s.hull);
  ok("the enemy side still pays while the player is graced",
    ctGraced.hp === ctGracedHp0 - ctDmg && s.contactsDealt === 1,
    "hp=" + ctGraced.hp + " dealt=" + s.contactsDealt);

  // a body pinned on the ship every tick still pays only once per window
  enc.reset();
  enc.E.hull = 99;
  enc.advance(1);
  const ctHeld = ctPin(10);
  ctHeld.hp = 99; // this check is about cadence, not death
  const ctHeldHp0 = ctHeld.hp;
  const ctRepin = () => { ctHeld.x = ship().x + 10; ctHeld.y = ship().y; ctHeld.vx = 0; ctHeld.vy = 0; };
  enc.E.invuln = 0;
  enc.advance(1);
  const ctDealt1 = enc.state().contactsDealt;
  for (let k = 0; k < ctCd - 1; k++) { ctRepin(); enc.advance(1); }
  const ctDealtMid = enc.state().contactsDealt;
  ctRepin();
  enc.advance(1);
  const ctDealtEnd = enc.state().contactsDealt;
  ok("a sustained overlap cannot melt: one enemy hit per contact window",
    ctDealt1 === 1 && ctDealtMid === 1 && ctDealtEnd === 2 && ctHeld.hp === ctHeldHp0 - 2 * ctDmg,
    "first=" + ctDealt1 + " at+" + (ctCd - 1) + "=" + ctDealtMid + " at+" + ctCd + "=" + ctDealtEnd + " hp=" + ctHeld.hp);

  // the cooldown lives on the body, not on the encounter: two bodies both bite
  // on the same tick, while the player's own grace lets exactly one through
  enc.reset();
  enc.advance(1);
  const ctTwoA = ctPin(10);
  const ctTwoB = ctPin(-10);
  const ctTwoAhp = ctTwoA.hp;
  const ctTwoBhp = ctTwoB.hp;
  enc.E.invuln = 0;
  enc.advance(1);
  s = enc.state();
  ok("contact cooldowns are per enemy, and the player pays once per grace",
    ctTwoA.hp === ctTwoAhp - ctDmg && ctTwoB.hp === ctTwoBhp - ctDmg && s.contactsDealt === 2 &&
    s.hitsTaken === 1 && s.hull === ECFG.player.hull - 1,
    "hpA=" + ctTwoA.hp + " hpB=" + ctTwoB.hp + " dealt=" + s.contactsDealt + " hull=" + s.hull);

  // a contact kill runs the same reap/count/orb path a bullet kill does. The
  // body is reached by the SWEEP from 30 px out rather than parked on the
  // hull: an orb dropped inside the 19 px magnet mouth is collected on the
  // same tick, which would hide the drop this check is here to see.
  enc.reset();
  enc.advance(1);
  const ctDying = ctPin(-30);
  ctDying.hp = ctDmg; // one contact is lethal
  enc.E.invuln = 0;
  enc.E.shipPrev = { x: ship().x - 60, y: ship().y };
  enc.advance(1);
  s = enc.state();
  ok("a contact kill reaps, counts and pays orbs",
    s.kills === 1 && s.enemies === 0 && s.orbs === 1 && s.contactsDealt === 1,
    "kills=" + s.kills + " enemies=" + s.enemies + " orbs=" + s.orbs + " dealt=" + s.contactsDealt);

  // the dash routes through the same primitive: it bites back, and the generic
  // sweep behind it never adds a second bite for the same contact
  enc.reset();
  enc.advance(1);
  enc.spawnEnemy(ship().x + 120, ship().y, 0, "charger");
  const ctBiter = enc.E.enemies[0];
  ctBiter.mode = "dash";
  ctBiter.t = ECFG.charger.dashTicks;
  ctBiter.lockA = Math.PI;
  ctBiter.dashHit = false;
  enc.E.invuln = 0;
  enc.advance(16); // 112 px of dash — contact comes around tick 15
  const ctDashS = enc.state();
  const ctDashHp = ctBiter.hp;
  enc.advance(9); // the body passes through — neither gate may fire again
  const ctPassS = enc.state();
  // and a dash the player is graced against keeps sweeping every tick, because
  // dashHit never sets — only the per-body cooldown stops the charger from
  // grinding itself down on a hull it cannot hurt
  enc.reset();
  enc.advance(1);
  enc.spawnEnemy(ship().x + 120, ship().y, 0, "charger");
  const ctGrind = enc.E.enemies[0];
  ctGrind.mode = "dash";
  ctGrind.t = ECFG.charger.dashTicks;
  ctGrind.lockA = Math.PI;
  ctGrind.dashHit = false;
  enc.E.invuln = 500; // deep grace — the sweep re-fires on every dash tick
  enc.advance(20); // ~6 ticks of unbroken overlap once the lunge arrives
  const ctGrindS = enc.state();
  ok("a connecting dash bites the charger back, exactly once per contact window",
    ctDashS.hitsTaken === 1 && ctDashS.hull === ECFG.player.hull - 1 &&
    ctDashHp === ECFG.charger.hp - ctDmg && ctDashS.contactsDealt === 1 &&
    ctPassS.hitsTaken === 1 && ctBiter.hp === ctDashHp && ctPassS.contactsDealt === 1 &&
    ctGrindS.hitsTaken === 0 && ctGrindS.contactsDealt === 1 && ctGrind.hp === ECFG.charger.hp - ctDmg,
    "onHit hits=" + ctDashS.hitsTaken + " hp=" + ctDashHp + " dealt=" + ctDashS.contactsDealt +
    " · after hits=" + ctPassS.hitsTaken + " hp=" + ctBiter.hp + " dealt=" + ctPassS.contactsDealt +
    " · graced hits=" + ctGrindS.hitsTaken + " hp=" + ctGrind.hp + " dealt=" + ctGrindS.contactsDealt);

  // the body's cooldown paces the ENEMY side only. Once the player's i-frames
  // lapse, the next tick of unbroken overlap costs a hull even though the body
  // is still deep inside its own window — gating the player on the enemy's
  // cooldown would turn an enemy-facing slider into hidden invulnerability.
  enc.reset();
  const ctLateHull = 99;
  enc.E.hull = ctLateHull;
  enc.advance(1);
  const ctLate = ctPin(10);
  ctLate.hp = 999; // cadence, not death
  enc.E.invuln = 500; // the body claims its window while the player is graced
  enc.advance(1);
  const ctLateGraced = enc.state();
  enc.E.invuln = 0; // the grace lapses INSIDE the body's contact window
  ctLate.x = ship().x + 10;
  ctLate.y = ship().y;
  ctLate.vx = 0;
  ctLate.vy = 0;
  enc.advance(1);
  const ctLateAfter = enc.state();
  const ctLateStillPaced = ctLate.contactCd > 0; // true at any CONTACTCD above 1
  ok("a body's contact cooldown never extends the player's grace",
    ctLateGraced.hitsTaken === 0 && ctLateGraced.contactsDealt === 1 &&
    ctLateAfter.hitsTaken === 1 && ctLateAfter.hull === ctLateHull - 1 &&
    ctLateAfter.contactsDealt === (ctLateStillPaced ? 1 : 2),
    "graced hits=" + ctLateGraced.hitsTaken + " dealt=" + ctLateGraced.contactsDealt +
    " · lapsed hits=" + ctLateAfter.hitsTaken + " hull=" + ctLateAfter.hull +
    " dealt=" + ctLateAfter.contactsDealt + " cd=" + ctLate.contactCd);

  // the "this window is claimed" mark must be visible at every slider value,
  // the floor included: at contact cd 0 the counter stamp is indistinguishable
  // from "free", so a connecting dash would bill its own touch twice on one
  // tick (its own sweep, then the generic one) unless the claim is per tick
  t.setContactCd(0);
  enc.reset();
  enc.E.hull = 99;
  enc.advance(1);
  enc.spawnEnemy(ship().x + 120, ship().y, 0, "charger");
  const ctFloor = enc.E.enemies[0];
  const ctFloorHp0 = 999; // the whole lunge stays observable
  ctFloor.hp = ctFloorHp0;
  ctFloor.mode = "dash";
  ctFloor.t = ECFG.charger.dashTicks;
  ctFloor.lockA = Math.PI;
  ctFloor.dashHit = false;
  enc.E.invuln = 0;
  const ctFloorSteps = [];
  let ctFloorSeen = 0;
  for (let k = 0; k < 20; k++) {
    enc.advance(1);
    const d = enc.state().contactsDealt;
    if (d !== ctFloorSeen) ctFloorSteps.push(d - ctFloorSeen);
    ctFloorSeen = d;
  }
  const ctFloorDrop = ctFloorHp0 - ctFloor.hp;
  t.setContactCd(ctCd); // back to the page's live value before anything else runs
  ok("at the contact-cd floor one physical touch still bills exactly one contact",
    ctFloorSteps.length >= 2 && ctFloorSteps.every((n) => n === 1) &&
    ctFloorDrop === ctFloorSeen * ctDmg && enc.tunables().CONTACTCD === ctCd,
    "per-tick contacts=" + JSON.stringify(ctFloorSteps) + " hpDrop=" + ctFloorDrop +
    " CONTACTCD=" + enc.tunables().CONTACTCD);

  // the contact test sweeps the ship's travel, it does not sample a point: the
  // control run parks shipPrev on the ship and the same geometry touches
  // nothing, so a plain-distance implementation cannot pass both halves
  const ctSkipRun = (swept) => {
    enc.reset();
    enc.advance(1);
    const e = ctPin(-30);
    enc.E.invuln = 0;
    if (swept) enc.E.shipPrev = { x: ship().x - 60, y: ship().y }; // 60 px of travel in one tick
    enc.advance(1);
    return { dealt: enc.state().contactsDealt, taken: enc.state().hitsTaken, drop: ECFG.enemy.hp - e.hp };
  };
  const ctStill = ctSkipRun(false);
  const ctSwept = ctSkipRun(true);
  ok("a fast ship cannot skip through a body between ticks",
    ctStill.dealt === 0 && ctStill.taken === 0 && ctStill.drop === 0 &&
    ctSwept.dealt === 1 && ctSwept.taken === 1 && ctSwept.drop === ctDmg,
    "still=" + JSON.stringify(ctStill) + " swept=" + JSON.stringify(ctSwept));

  // and none of it consumes a number the sim cares about
  const ctRun = () => {
    enc.reset();
    enc.E.hull = 99;
    enc.advance(1);
    ctPin(10);
    enc.E.invuln = 0;
    enc.advance(130);
    return { key: JSON.stringify(enc.E.enemies.map((e) => [+e.x.toFixed(3), +e.y.toFixed(3)])),
      dealt: enc.state().contactsDealt };
  };
  const ctRunA = ctRun();
  const ctRunB = ctRun();
  ok("a run with contact events replays identically",
    ctRunA.key === ctRunB.key && ctRunA.key.length > 10 && ctRunA.dealt >= 1,
    "dealt=" + ctRunA.dealt + " len=" + ctRunA.key.length);

  // ---- M. minimap contacts: the mapState hook and the corner-map dots ----
  // The corner map grew contact dots — enemies, XP orbs, live player shots.
  // These checks stage entities OFF-SCREEN in the idle encounter state (so
  // encDraw/encDrawHud return early, no fx burst lives, the flame is zeroed
  // and repeated renders are byte-identical), then read real canvas pixels
  // inside and outside the frame. Every coordinate is derived from the live
  // __test.minimapInfo()/fieldToCanvas() geometry, so the frame's size and
  // the letterbox transform are never hardcoded. Every staged body sits far
  // past the contact radius from the ship, so the contact sweep cannot fire.
  const mmInfo = t.minimapInfo();
  const priorMM = mmInfo.on;
  const mmX = t.FW - mmInfo.W - mmInfo.M; // the frame's field-space origin
  const mmY = mmInfo.M;
  const mmScale = t.fieldToCanvas(1, 0).x - t.fieldToCanvas(0, 0).x; // canvas px per field px
  const mmHalf = Math.max(3, Math.ceil(mmScale * 2)); // probe half-size, canvas px (~2 field px)
  // readbacks go through a scratch canvas: a 1:1 drawImage blit is an exact
  // copy, and reading from a willReadFrequently surface keeps Chrome from
  // warning about repeated getImageData on the game's own GPU-backed canvas
  const mmPad = document.createElement("canvas");
  mmPad.width = mmPad.height = mmHalf * 2;
  const mmPadCtx = mmPad.getContext("2d", { willReadFrequently: true });
  const mmProbeF = (fx, fy) => { // a small patch of real pixels around a FIELD point
    const p = t.fieldToCanvas(fx, fy);
    mmPadCtx.clearRect(0, 0, mmPad.width, mmPad.height);
    mmPadCtx.drawImage(canvasEl, Math.round(p.x) - mmHalf, Math.round(p.y) - mmHalf,
      mmHalf * 2, mmHalf * 2, 0, 0, mmHalf * 2, mmHalf * 2);
    return JSON.stringify(Array.from(mmPadCtx.getImageData(0, 0, mmPad.width, mmPad.height).data));
  };
  // the same patch around where a WORLD point projects onto the frame
  const mmProbeW = (wx, wy) => mmProbeF(mmX + wx * (mmInfo.W / t.WW), mmY + wy * (mmInfo.H / t.WH));
  const mmRowF = (wy) => mmY + wy * (mmInfo.H / t.WH); // a world row's field-space y on the frame
  const mmShot = (x, y, spent) => t.G.bullets.push({ x, y, px: x, py: y, vx: 0, vy: 0, r: 2.2,
    dmg: 1, owner: "player", dead: false, spent: !!spent, ttl: 60 });
  // the staged spots, all off-screen, pairwise far apart on the frame, and
  // clear of both the ship dot and the viewport rectangle
  const mmEnemy = { x: t.WW * 0.75, y: t.WH * 0.25 };
  const mmOrb = { x: t.WW * 0.2, y: t.WH * 0.75 };
  const mmLive = { x: t.WW * 0.25, y: t.WH * 0.2 };
  const mmSpent = { x: t.WW * 0.8, y: t.WH * 0.8 };
  // hugging the world's right wall; the clamp checks below walk this same
  // body into each world corner and then put it back
  const mmWall = { x: t.WW - 8, y: t.WH * 0.35 };
  // an orb parked OUTSIDE the world — stepOrbs never clamps a drop to world
  // bounds, so keeping the dot inside the frame is the draw path's job. Its
  // x is chosen from live geometry so an unclamped dot would land 6 field px
  // past the frame's right edge, well clear of the border's antialiasing.
  const mmFar = { x: ((mmInfo.W + 6) / mmInfo.W) * t.WW, y: t.WH * 0.55 };

  enc.reset(); // idle, centered camera, no bullets, no bursts
  t.setMinimap(false);
  t.render();
  const mmOffE = mmProbeW(mmEnemy.x, mmEnemy.y); // the map-off region, before staging
  const mmOffO = mmProbeW(mmOrb.x, mmOrb.y);
  const mmOffS = mmProbeW(mmLive.x, mmLive.y);
  t.setMinimap(true);
  t.render();
  const mmBaseE = mmProbeW(mmEnemy.x, mmEnemy.y);
  const mmBaseO = mmProbeW(mmOrb.x, mmOrb.y);
  const mmBaseS = mmProbeW(mmLive.x, mmLive.y);
  const mmBaseP = mmProbeW(mmSpent.x, mmSpent.y);
  const mmBaseFarIn = mmProbeF(mmX + mmInfo.W - 1.5, mmRowF(mmFar.y));
  const mmBaseFarOut = mmProbeF(mmX + mmInfo.W + 6, mmRowF(mmFar.y));

  enc.spawnEnemy(mmEnemy.x, mmEnemy.y);
  enc.spawnEnemy(mmWall.x, mmWall.y);
  enc.E.orbs.push({ x: mmOrb.x, y: mmOrb.y, vx: 0, vy: 0 });
  enc.E.orbs.push({ x: mmFar.x, y: mmFar.y, vx: 0, vy: 0 });
  mmShot(mmLive.x, mmLive.y, false);
  mmShot(mmSpent.x, mmSpent.y, true);
  let mmState = null;
  try {
    mmState = window.Encounter && typeof Encounter.mapState === "function" ? Encounter.mapState() : null;
  } catch (err) { mmState = null; }
  const mmSame = (a, b) => Array.isArray(a) && a.length === b.length &&
    a.every((v, i) => v.x === b[i].x && v.y === b[i].y);
  ok("Encounter.mapState exposes live enemy and orb positions",
    !!mmState && mmSame(mmState.enemies, enc.E.enemies) && mmSame(mmState.orbs, enc.E.orbs) &&
    mmState.enemies.length === 2 && mmState.orbs.length === 2,
    mmState ? "enemies=" + mmState.enemies.length + " orbs=" + mmState.orbs.length : "no hook");

  t.render();
  ok("an off-screen enemy paints a minimap dot",
    mmProbeW(mmEnemy.x, mmEnemy.y) !== mmBaseE);
  ok("an XP orb paints a minimap dot",
    mmProbeW(mmOrb.x, mmOrb.y) !== mmBaseO);
  ok("a live player shot paints a minimap dot",
    mmProbeW(mmLive.x, mmLive.y) !== mmBaseS);
  ok("a spent shot leaves no minimap trace",
    mmProbeW(mmSpent.x, mmSpent.y) === mmBaseP);
  // the out-of-world orb must show up ON the frame's edge and nowhere past it
  ok("no dot leaks past the minimap frame",
    mmProbeF(mmX + mmInfo.W - 1.5, mmRowF(mmFar.y)) !== mmBaseFarIn &&
    mmProbeF(mmX + mmInfo.W + 6, mmRowF(mmFar.y)) === mmBaseFarOut,
    "in=" + (mmProbeF(mmX + mmInfo.W - 1.5, mmRowF(mmFar.y)) !== mmBaseFarIn) +
    " out=" + (mmProbeF(mmX + mmInfo.W + 6, mmRowF(mmFar.y)) === mmBaseFarOut));
  // the clamp on an IN-WORLD body, both bounds. stepEnemy parks a body that
  // touches a wall at exactly e.r from it, and such a dot overhangs the frame
  // by well under a field pixel — far too little for a probe patch to resolve
  // on its own. So the pinned dot is compared against a REFERENCE body parked
  // at the world point whose UNCLAMPED projection IS the clamp's target: the
  // two renders agree pixel-for-pixel only while the clamp is doing its job,
  // and separate the moment it stops. Both corners run, so Math.min and
  // Math.max are each exercised on each axis.
  const mmPin = enc.E.enemies.find((e) => e.x === mmWall.x) || enc.E.enemies[1];
  const mmPinAt = (x, y, fx, fy) => { // move the pinned body, repaint, read pixels
    mmPin.x = x;
    mmPin.y = y;
    t.render();
    return mmProbeF(fx, fy);
  };
  const mmRefW = (n) => (n / mmInfo.W) * t.WW; // world x whose raw projection is frame px n
  const mmRefH = (n) => (n / mmInfo.H) * t.WH; // world y, the same idea down the other axis
  const mmBytes = (a, b) => { // differing channel bytes, for a readable failure
    const A = JSON.parse(a);
    const B = JSON.parse(b);
    let n = 0;
    for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) n++;
    return n;
  };
  const mmHiF = { x: mmX + mmInfo.W - 1, y: mmY + mmInfo.H - 1 }; // clamped dot's centre
  const mmHiPin = mmPinAt(t.WW - mmPin.r, t.WH - mmPin.r, mmHiF.x, mmHiF.y);
  const mmHiRef = mmPinAt(mmRefW(mmInfo.W - 1), mmRefH(mmInfo.H - 1), mmHiF.x, mmHiF.y);
  ok("a wall-pinned enemy dot clamps to the frame's far corner",
    mmHiPin === mmHiRef, "diff=" + mmBytes(mmHiPin, mmHiRef));
  const mmLoPin = mmPinAt(mmPin.r, mmPin.r, mmX + 1, mmY + 1);
  const mmLoRef = mmPinAt(mmRefW(1), mmRefH(1), mmX + 1, mmY + 1);
  ok("a wall-pinned enemy dot clamps to the frame's near corner",
    mmLoPin === mmLoRef, "diff=" + mmBytes(mmLoPin, mmLoRef));
  mmPin.x = mmWall.x; // back where the staging left it
  mmPin.y = mmWall.y;
  // the toggle owns every dot: with the map off the whole corner is exactly
  // what it was before anything was staged
  t.setMinimap(false);
  t.render();
  ok("the MINIMAP toggle gates every contact dot",
    mmProbeW(mmEnemy.x, mmEnemy.y) === mmOffE &&
    mmProbeW(mmOrb.x, mmOrb.y) === mmOffO &&
    mmProbeW(mmLive.x, mmLive.y) === mmOffS);
  t.setMinimap(true);
  // the hook hands out the live arrays, not a snapshot cached at wave start
  enc.reset();
  enc.E.hull = 99;
  enc.spawnEnemy(ship().x + 150, ship().y);
  enc.E.enemies[0].hp = 0;
  enc.advance(1);
  const mmLiveState = Encounter.mapState();
  ok("mapState tracks kills and drops live",
    mmLiveState.enemies.length === 0 && mmLiveState.orbs.length === 1 &&
    mmLiveState.orbs === enc.E.orbs,
    "enemies=" + mmLiveState.enemies.length + " orbs=" + mmLiveState.orbs.length);
  // and drawing the map never touches the sim: the kills sit AFTER the render
  // batches, so their orb-drift rand() draws expose any number the dot loops
  // might have stolen from the seeded stream
  const mmDetRun = (n) => {
    enc.reset();
    enc.E.hull = 99;
    enc.advance(130);
    for (let k = 0; k < n; k++) t.render();
    if (enc.E.enemies[0]) enc.E.enemies[0].hp = 0;
    enc.advance(1);
    for (let k = 0; k < n; k++) t.render();
    if (enc.E.enemies[0]) enc.E.enemies[0].hp = 0;
    enc.advance(30);
    return JSON.stringify([enc.E.enemies.map((e) => [+e.x.toFixed(3), +e.y.toFixed(3)]),
      enc.E.orbs.map((o) => [+o.x.toFixed(3), +o.y.toFixed(3)])]);
  };
  const mmDet0 = mmDetRun(0);
  const mmDet2 = mmDetRun(2);
  ok("minimap rendering never perturbs the sim",
    mmDet0 === mmDet2 && mmDet0.length > 10, "len=" + mmDet0.length);
  t.setMinimap(priorMM);

  // ---- N. screen-edge arrows: a chevron per off-screen direction ----
  // The HUD's other tracking layer, checked through the very function
  // encDrawHud() draws from. Every expectation reads the live
  // __test.enc.arrowCfg, so the inset, the cap and the bucket width are never
  // copied into the suite. restart() puts the ship at the world's centre and
  // the camera around it, so the view centre and the ship coincide and an
  // offset from the ship IS the arrow's direction.
  const priorArrows = t.edgeArrowsOn();
  const AC = enc.arrowCfg;
  enc.reset();
  enc.spawnEnemy(ship().x + 150, ship().y); // comfortably inside the 512×342 view
  const arrNone = enc.edgeArrows();
  ok("an on-screen enemy earns no edge arrow", arrNone.length === 0, "n=" + arrNone.length);
  enc.reset();
  enc.spawnEnemy(ship().x + 600, ship().y);
  const arrOne = enc.edgeArrows();
  ok("an off-screen enemy earns one arrow on the inset rect, pointing at it",
    arrOne.length === 1 && Math.abs(arrOne[0].x - (t.FW - AC.inset)) < 1e-6 &&
    Math.abs(arrOne[0].y - t.FH / 2) < 1e-6 && Math.abs(arrOne[0].ang) < 1e-9 &&
    arrOne[0].n === 1 && arrOne[0].type === "dart",
    JSON.stringify(arrOne));
  // every quadrant and both clamped axes, all still inside the world
  enc.reset();
  const arrSpots = [[900, 700], [-900, -700], [900, -300], [-400, 900], [0, 900], [-900, 0]];
  for (const [dx, dy] of arrSpots) enc.spawnEnemy(ship().x + dx, ship().y + dy);
  const arrBox = enc.edgeArrows();
  let arrOut = "";
  for (const a of arrBox) {
    if (a.x < AC.inset - 1e-6 || a.x > t.FW - AC.inset + 1e-6 ||
        a.y < AC.inset - 1e-6 || a.y > t.FH - AC.inset + 1e-6) {
      arrOut += "(" + a.x.toFixed(1) + "," + a.y.toFixed(1) + ") ";
    }
  }
  ok("every arrow stays inside the field's inset rect",
    arrBox.length === arrSpots.length && !arrOut, "n=" + arrBox.length + " outside: " + arrOut);
  // three bodies inside a tenth of a bucket of each other — one arrow, counted
  enc.reset();
  const arrNudge = 700 * Math.tan(((2 * Math.PI) / AC.buckets) * 0.1); // a tenth of a bucket, in px
  enc.spawnEnemy(ship().x + 700, ship().y - arrNudge);
  enc.spawnEnemy(ship().x + 700, ship().y);
  enc.spawnEnemy(ship().x + 700, ship().y + arrNudge);
  const arrMerge = enc.edgeArrows();
  ok("near-identical directions merge into one counted arrow",
    arrMerge.length === 1 && arrMerge[0].n === 3,
    "n=" + arrMerge.length + " count=" + (arrMerge[0] && arrMerge[0].n));
  // two rings, more distinct directions than the cap allows: the near ring wins
  enc.reset();
  const arrRing = AC.cap + 4;
  for (let i = 0; i < arrRing; i++) {
    const a = (i * 2 * Math.PI) / arrRing;
    const rad = i < AC.cap ? 600 : 1000; // both rings clear the ~308 px view half-diagonal
    enc.spawnEnemy(ship().x + Math.cos(a) * rad, ship().y + Math.sin(a) * rad);
  }
  const arrCap = enc.edgeArrows();
  ok("the cap keeps only the nearest arrows",
    arrCap.length === AC.cap && arrCap.every((a) => a.dist < 800),
    "n=" + arrCap.length + " far=" + arrCap.filter((a) => a.dist >= 800).length);
  enc.reset();
  enc.spawnEnemy(ship().x + 600, ship().y, 0, "charger");
  const arrCh = enc.edgeArrows();
  ok("a charger's arrow carries its type",
    arrCh.length === 1 && arrCh[0].type === "charger",
    "n=" + arrCh.length + " type=" + (arrCh[0] && arrCh[0].type));
  // the determinism proof: the same wave, once with mid-run repaints and once
  // without. Both legs stage the far body, so the arrow branch really runs in
  // the rendered leg, and — as with the minimap above — the kills sit AFTER
  // each repaint batch so their orb-drift rand() draws expose any number the
  // chevron loop might have stolen from the seeded stream. Without those
  // draws the compared window holds no randomness at all and the proof is
  // empty: wave 1's second group rolls its points long after tick 200.
  t.setEdgeArrows(true);
  const arrowRun = (n) => {
    enc.reset();
    enc.E.hull = 99;
    enc.advance(130);
    enc.spawnEnemy(ship().x + 800, ship().y); // off-screen: the arrow branch has work
    for (let k = 0; k < n; k++) t.render();
    if (enc.E.enemies[0]) enc.E.enemies[0].hp = 0;
    enc.advance(1);
    for (let k = 0; k < n; k++) t.render();
    if (enc.E.enemies[0]) enc.E.enemies[0].hp = 0;
    enc.advance(70);
    return JSON.stringify([enc.E.enemies.map((e) => [+e.x.toFixed(3), +e.y.toFixed(3)]),
      enc.E.orbs.map((o) => [+o.x.toFixed(3), +o.y.toFixed(3)])]);
  };
  const arrDrawn = arrowRun(2);
  const arrQuiet = arrowRun(0);
  ok("a mid-run render with arrows on leaves the wave untouched",
    arrDrawn === arrQuiet && arrDrawn.length > 10, "len=" + arrDrawn.length);
  // draw order: the chevrons go UNDER the top-left status stack. Same frame,
  // same staged bodies, only the arrow layer differs — over a filled hull
  // pip the readout wins pixel for pixel, while on the same inset column
  // below the stack the chevron shows through, so "covered" cannot pass by
  // drawing nothing. A third probe confirms the HUD probe really sits on
  // HUD ink (the empty pip's dim outline against the filled pip's clay).
  enc.reset();
  enc.advance(1); // out of idle: encDrawHud returns early while the wave sleeps
  const arrPad = document.createElement("canvas"); // a 2×2 readback, tight on the point
  arrPad.width = arrPad.height = 2;
  const arrPadCtx = arrPad.getContext("2d", { willReadFrequently: true });
  const arrPx = (fx, fy) => {
    const p = t.fieldToCanvas(fx, fy);
    arrPadCtx.clearRect(0, 0, 2, 2);
    arrPadCtx.drawImage(canvasEl, Math.round(p.x), Math.round(p.y), 2, 2, 0, 0, 2, 2);
    return JSON.stringify(Array.from(arrPadCtx.getImageData(0, 0, 2, 2).data));
  };
  const arrHudY = 24.5; // the arrow parks at (inset, 24.5), across hull pip 0
  const arrHudX = 11.5; // the probe reads pip 0's INTERIOR beside the arrow point —
                        // the chevron's own ink reaches it uncovered, the pip's
                        // opaque fill owns it covered, and the pip's 7 px of clay
                        // surround the whole probe patch so no chevron corner that
                        // pokes past the pip can leak into the comparison
  const arrFreeY = t.FH - 60; // the inset column, clear of every readout
  const arrAim = (fy) => { // a body whose arrow clamps to (inset, fy) on the left column
    const D = 1000; // measured from the live view centre — a played tick may have moved the camera
    enc.spawnEnemy(t.cam.x + t.FW / 2 - D,
      t.cam.y + t.FH / 2 + ((fy - t.FH / 2) * D) / (t.FW / 2 - AC.inset));
  };
  t.setEdgeArrows(false);
  enc.E.hull = 0; // every pip renders as the dim outline — the probe patch sits
                  // in the empty interior, so this frame records bare background
  t.render();
  const arrBarEmpty = arrPx(arrHudX, arrHudY);
  enc.E.hull = enc.E.hullMax; // fill pip 0, so the probe lands on opaque clay ink
  arrAim(arrHudY);
  arrAim(arrFreeY);
  t.render();
  const arrBarInk = arrPx(arrHudX, arrHudY);
  const arrFreeOff = arrPx(AC.inset, arrFreeY);
  const arrHudSet = enc.edgeArrows();
  const arrOn = (fy) => arrHudSet.some((a) => Math.abs(a.x - AC.inset) < 1e-6 && Math.abs(a.y - fy) < 1e-6);
  t.setEdgeArrows(true);
  t.render();
  ok("the status stack paints over the edge arrows, never under them",
    arrOn(arrHudY) && arrOn(arrFreeY) && arrBarInk !== arrBarEmpty &&
    arrPx(AC.inset, arrFreeY) !== arrFreeOff &&
    arrPx(arrHudX, arrHudY) === arrBarInk,
    "aimed=" + (arrOn(arrHudY) && arrOn(arrFreeY)) + " ink=" + (arrBarInk !== arrBarEmpty) +
    " chevron=" + (arrPx(AC.inset, arrFreeY) !== arrFreeOff) +
    " covered=" + (arrPx(arrHudX, arrHudY) === arrBarInk));
  t.setEdgeArrows(priorArrows);

  // ---- O. the radial top-speed cap ----
  // The max-speed tuner is one clamp on the tick, and the feel pass that moved
  // its default only means anything while that clamp holds: an over-speed hull
  // is scaled back to exactly VMAX with its heading intact, and a hull under
  // the cap is left alone. Both legs read the live tunable, so a retuned page
  // cannot fake either half. reset() parks the ship at the world centre, far
  // from any wall whose bounce could flip the velocity mid-check.
  const vmaxLive = enc.tunables().VMAX;
  enc.reset();
  t.G.vel.x = vmaxLive * 4; // 5 × VMAX, off both axes: a per-axis clamp cannot pass
  t.G.vel.y = vmaxLive * 3;
  enc.advance(1);
  const capSpeed = Math.hypot(t.G.vel.x, t.G.vel.y);
  ok("an over-speed hull is clamped to the live top speed, heading intact",
    Math.abs(capSpeed - vmaxLive) < 1e-9 &&
    Math.abs(t.G.vel.x - vmaxLive * 0.8) < 1e-9 && Math.abs(t.G.vel.y - vmaxLive * 0.6) < 1e-9,
    "speed=" + capSpeed + " vel=(" + t.G.vel.x + "," + t.G.vel.y + ") VMAX=" + vmaxLive);
  enc.reset();
  t.G.vel.x = vmaxLive * 0.5; // under the cap — the clamp must not touch it
  t.G.vel.y = 0;
  enc.advance(1);
  ok("a hull under the cap keeps every bit of its speed",
    t.G.vel.x === vmaxLive * 0.5 && t.G.vel.y === 0,
    "vel=(" + t.G.vel.x + "," + t.G.vel.y + ") VMAX=" + vmaxLive);
  t.G.vel.x = 0;
  t.G.vel.y = 0;

  // ---- P. the AFTERBURNER row: additive cap, stacking, reset ----
  // The row acts on exactly the clamp section O pins, and it must act there
  // ADDITIVELY without writing the VMAX tuner value — a purchase that wrote
  // the slider would outlive the run and silently retune the game. Every leg
  // buys through the real shop (openShop → buy) — the visit is staged the
  // way the combat sections stage bodies, since the flow itself is section
  // F's — and measures the cap the way section O does, so a page tuned to
  // any VMAX reports the same verdict. capNow() must run OUTSIDE the shop:
  // a frozen advance would be swallowed and the probe velocity banked.
  enc.reset();
  enc.E.hull = 99;
  enc.advance(130); // a live wave, so capNow() has an unfrozen sim to tick
  const vmaxP = enc.tunables().VMAX;
  const capNow = () => { // drive the hull far over any plausible cap, tick once
    t.G.vel.x = (vmaxP + 9) * 4; // off both axes, 5× the target: a per-axis clamp cannot pass
    t.G.vel.y = (vmaxP + 9) * 3;
    enc.advance(1);
    const sp = Math.hypot(t.G.vel.x, t.G.vel.y);
    t.G.vel.x = 0;
    t.G.vel.y = 0;
    return sp;
  };
  const capBase = capNow();
  ok("with nothing banked the cap is the bare tuner value",
    enc.state().mods.speed === 0 && Math.abs(capBase - vmaxP) < 1e-9,
    "cap=" + capBase + " VMAX=" + vmaxP);
  enc.addXp(12); // exactly ranks 1 + 2 of the doubling curve
  const pBuy = () => { // one staged shop visit, one AFTERBURNER rank
    enc.E.state = "cleared";
    enc.openShop();
    const got = enc.buy(1);
    enc.E.state = "active"; // back to the live field without dealing a wave
    return got;
  };
  ok("the staged visit buys rank one", pBuy() === true);
  const cap1 = capNow();
  ok("one AFTERBURNER rank lifts the effective cap by exactly 1.0 px/tick",
    enc.state().mods.speed === 1 && Math.abs(cap1 - (vmaxP + 1)) < 1e-9,
    "cap=" + cap1 + " want=" + (vmaxP + 1));
  ok("the purchase leaves the VMAX tuner value untouched",
    enc.tunables().VMAX === vmaxP && Number(document.getElementById("vmax").value) === vmaxP,
    "tuner=" + enc.tunables().VMAX + " slider=" + document.getElementById("vmax").value);
  ok("the staged visit buys rank two at its doubled price", pBuy() === true && enc.state().xp === 0);
  const cap2 = capNow();
  ok("a second rank stacks additively rather than replacing the first",
    enc.state().mods.speed === 2 && Math.abs(cap2 - (vmaxP + 2)) < 1e-9,
    "cap=" + cap2 + " want=" + (vmaxP + 2));
  enc.restart();
  const capReset = capNow();
  ok("restart drops the banked speed and the cap falls back to the tuner",
    enc.state().mods.speed === 0 && Math.abs(capReset - vmaxP) < 1e-9,
    "cap=" + capReset + " VMAX=" + vmaxP);

  // ---- Q. the shop catalog: doubling prices, the rank cap, MAX HULL ----
  // Catalog rows are data: prices double per purchase (owner decision, final),
  // RAPID LOADER hard-caps at five ranks and reads MAXED, AFTERBURNER and
  // MAX HULL never cap, and both hull rows read the LIVE max hull. The shop
  // visit is staged directly — the natural flow is section F's business.
  enc.reset();
  enc.advance(1);
  enc.openShop();
  ok("openShop refuses outside the cleared beat", enc.state().state === "warning");
  enc.E.state = "cleared";
  enc.openShop();
  ok("openShop opens from the cleared beat, frozen", enc.state().state === "shop" && enc.frozen());
  enc.addXp(1000);
  ok("the wallet accrues without any level threshold", enc.state().xp === 1000);
  const rlCosts = [];
  let rlPaid = true;
  for (let k = 0; k < 5; k++) {
    const rlInfo = enc.shopInfo()[0];
    rlCosts.push(rlInfo.cost);
    const rlBefore = enc.state().xp;
    if (enc.buy(0) !== true || enc.state().xp !== rlBefore - rlInfo.cost) rlPaid = false;
  }
  ok("RAPID LOADER's price doubles per rank: 4/8/16/32/64, each deducted exactly",
    JSON.stringify(rlCosts) === "[4,8,16,32,64]" && rlPaid, JSON.stringify(rlCosts));
  ok("rank six is refused at the hard cap and the row reads MAXED",
    enc.buy(0) === false && enc.shopInfo()[0].maxed === true && enc.state().owned[0] === 5 &&
    Math.abs(enc.state().mods.cool - Math.pow(0.7, 5)) < 1e-12,
    "owned=" + enc.state().owned[0] + " cool=" + enc.state().mods.cool);
  const abCost0 = enc.shopInfo()[1].cost;
  enc.buy(1);
  const abCost1 = enc.shopInfo()[1].cost;
  enc.buy(1);
  ok("AFTERBURNER doubles and never maxes",
    abCost0 === 4 && abCost1 === 8 && enc.shopInfo()[1].maxed === false && enc.state().mods.speed === 2,
    "cost0=" + abCost0 + " cost1=" + abCost1);
  // MAX HULL — each rank raises the LIVE max by one and grants the point filled
  enc.E.hull = enc.E.hullMax;
  const mhCost = enc.shopInfo()[3].cost;
  enc.buy(3);
  s = enc.state();
  ok("MAX HULL raises the cap by one and grants the point filled",
    mhCost === 8 && s.hullMax === ECFG.player.hull + 1 && s.hull === ECFG.player.hull + 1,
    "cost=" + mhCost + " hullMax=" + s.hullMax + " hull=" + s.hull);
  enc.buy(3);
  s = enc.state();
  ok("MAX HULL stacks and its price doubles",
    s.hullMax === ECFG.player.hull + 2 && s.hull === ECFG.player.hull + 2 && enc.shopInfo()[3].cost === 32,
    "hullMax=" + s.hullMax + " next=" + enc.shopInfo()[3].cost);
  enc.E.hull = ECFG.player.hull; // 3 of 5 — under the LIVE max, at the old fixed one
  ok("HULL PATCH's offer reads the live max hull, not the fixed 3",
    enc.shopInfo()[2].available === true && enc.buy(2) === true && enc.state().hull === ECFG.player.hull + 1,
    "hull=" + enc.state().hull + " of " + enc.state().hullMax);
  enc.E.hull = enc.E.hullMax;
  ok("HULL PATCH leaves the shelf again at the live max",
    enc.shopInfo()[2].available === false && enc.buy(2) === false);
  // the HUD pip row reads the live max too — a staged raise paints a fifth pip
  enc.reset();
  enc.advance(1); // warning: the plain HUD, no overlay film over the pips
  enc.E.hullMax = 5;
  enc.E.hull = 5;
  t.render();
  const pipRaised = arrPx(51.5, 24.5); // pip 4's interior — empty air at the default max
  enc.E.hullMax = 3;
  enc.E.hull = 3;
  t.render();
  ok("the hull pip row tracks the live max hull", pipRaised !== arrPx(51.5, 24.5));

  // ---- R. a broke shop still opens, still renders, and eats no ring keys ----
  enc.reset();
  enc.E.hull = 99;
  enc.advance(130);
  for (const e of enc.E.enemies) e.hp = 0;
  enc.advance(W1[1].spawnAt - 130 + 1);
  for (const e of enc.E.enemies) e.hp = 0;
  enc.advance(1);
  enc.E.orbs.length = 0; // a broke run — this wave pays nothing
  enc.advance(ECFG.clearHold + 1);
  s = enc.state();
  ok("the shop opens even with 0 XP", s.state === "shop" && s.xp === 0,
    "state=" + s.state + " xp=" + s.xp);
  ok("a broke buy is refused and changes nothing",
    enc.buy(0) === false && enc.state().xp === 0 && enc.state().mods.cool === 1 && enc.state().owned[0] === 0);
  // neither suite ever executed encDrawHud with an overlay up — close that
  // gap: the whole frame must render with the shop open, and must actually
  // paint the overlay rather than throwing or drawing nothing. The overlay
  // draws only while the game is LIVE (paused, the pause copy owns the
  // center band — the two collided otherwise), so these renders raise the
  // running flag R-style: the flag only, the loop itself stays stopped.
  const liveRender = () => {
    const was = t.G.running;
    t.G.running = true;
    try { t.render(); } finally { t.G.running = was; }
  };
  let shopDrew = true;
  let shopErr = "";
  try { liveRender(); } catch (err) { shopDrew = false; shopErr = String(err); }
  ok("the frame renders with the shop open", shopDrew, shopErr);
  const shopStrip = () => { // a pixel strip across the shop title's row
    const strip = [];
    for (let fx = t.FW / 2 - 60; fx <= t.FW / 2 + 60; fx += 4) strip.push(arrPx(fx, t.FH / 2 - 66));
    return strip.join("|");
  };
  const stripLive = shopStrip();
  // PAUSED over the open shop — reachable in play via Escape, alt-tab or a
  // lock loss, since a frozen shop keeps G.running true — the overlay must
  // stand down (its fourth row and footer sit exactly in the pause copy's
  // band) and its keys must go dead: capturing Enter would cancel a focused
  // pause-menu button's click and deal the next wave behind the menu.
  // G.running is genuinely false here — the suite's page IS a paused screen.
  t.render();
  ok("a paused shop keeps its overlay off the canvas for the pause copy",
    shopStrip() !== stripLive);
  enc.addXp(10); // fund a buy the paused digit must NOT make
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter" }));
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1" }));
  s = enc.state();
  ok("a paused shop eats no keys — no continue, no buy, state holds",
    s.state === "shop" && s.wave === 1 && s.xp === 10 && s.owned[0] === 0,
    "state=" + s.state + " wave=" + s.wave + " xp=" + s.xp);
  enc.continueFromShop();
  liveRender();
  ok("the shop overlay paints real ink", stripLive !== shopStrip());
  // H3, both ends — a hand resting on the ring across a shop visit must not
  // leave the ship lurching on continue. openShop() clears the keys already
  // held, and game.js's own keydown refuses new ones while the sim is frozen.
  enc.reset();
  enc.advance(1);
  t.G.keys.add("KeyW"); // held as the wave clears
  enc.E.state = "cleared";
  enc.openShop();
  ok("openShop clears the held ring keys", t.G.keys.size === 0 && enc.state().state === "shop");
  const runWas = t.G.running;
  t.G.running = true; // flag only — the loop itself stays stopped
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
  t.G.running = runWas;
  ok("a ring key pressed over the frozen shop never enters the held set", t.G.keys.size === 0);

  // ---- S. restart resets the wallet, every rank counter and the hull cap ----
  // restart() resets field by field, so EVERY purchase field needs its own
  // reset line, and a missed one is invisible to the older checks — this
  // buys one of every row, then asserts each field died with the run.
  enc.reset();
  enc.advance(1);
  enc.E.state = "cleared";
  enc.openShop();
  enc.addXp(500);
  enc.buy(0); // RAPID LOADER
  enc.buy(1); // AFTERBURNER
  enc.buy(3); // MAX HULL — raises the cap to 4 and fills it
  enc.E.hull = 1;
  enc.buy(2); // HULL PATCH
  enc.buy(4); // THRUST RING
  enc.buy(5); // BLAST CHARGE
  const preRestart = enc.state();
  ok("the staging really bought one of every row",
    preRestart.owned.join(",") === "1,1,1,1,1,1" && preRestart.xp === 500 - 4 - 4 - 8 - 6 - 8 - 8 &&
    preRestart.hullMax === ECFG.player.hull + 1 && preRestart.hull === 2 &&
    preRestart.mods.cool === 0.7 && preRestart.mods.speed === 1 && preRestart.mods.keyThrust === true &&
    preRestart.mods.blast === 1,
    JSON.stringify({ owned: preRestart.owned, xp: preRestart.xp, hullMax: preRestart.hullMax }));
  enc.restart();
  s = enc.state();
  ok("restart zeroes the wallet and every purchase field",
    s.xp === 0 && s.owned.every((n) => n === 0) && s.hullMax === ECFG.player.hull &&
    s.hull === ECFG.player.hull && s.mods.cool === 1 && s.mods.speed === 0 &&
    s.mods.keyThrust === false && s.mods.blast === 0 && s.ringCard === false && s.state === "idle",
    JSON.stringify({ xp: s.xp, owned: s.owned, hullMax: s.hullMax, ring: s.mods.keyThrust, blast: s.mods.blast }));

  // ---- T. the THRUST RING: one gate, one sale, one reveal ----
  // The eight-way ring's THRUST role is an 8 XP one-time purchase; its AIM
  // role is not gated and must never be. The gate is a single predicate on
  // step()'s thrust sum, so these legs measure the ship's velocity rather than
  // reading the flag back, and the aim leg drives the real keydown handler.
  // Pointer lock is deliberately not involved anywhere: the owner ruled out
  // any lock fallback, so every state here is reached through the hooks.
  const ringArrowsWas = t.edgeArrowsOn();
  const ringAimWas = t.aimState().AIMMODE;
  t.setEdgeArrows(false); // the status stack's own column must read only the HUD
  t.setAimMode("mouse");  // ...and this also releases the right button
  const ringInvWas = t.aimState().aiming; // right released, so aiming() IS the invert flag
  t.setInvert(true);      // the shipped default: the cursor aims, the ring thrusts
  enc.reset();
  enc.E.hull = 99;
  enc.advance(130); // a live, unfrozen wave — thrustImpulse refuses a frozen sim
  const ringIdx = enc.shopInfo().findIndex((r) => r.name === "THRUST RING");
  // one held ring key, one real tick: the speed the ring bought, in px/tick
  const ringThrust = () => {
    t.G.keys.clear();
    t.G.vel.x = 0;
    t.G.vel.y = 0;
    t.G.keys.add("KeyD");
    enc.advance(1);
    t.G.keys.clear();
    const sp = Math.hypot(t.G.vel.x, t.G.vel.y);
    t.G.vel.x = 0;
    t.G.vel.y = 0;
    return sp;
  };
  ok("the THRUST RING row is a flat 8, unowned and unmaxed",
    ringIdx === 4 && enc.shopInfo()[ringIdx].cost === 8 && enc.shopInfo()[ringIdx].owned === 0 &&
    enc.shopInfo()[ringIdx].maxed === false && enc.shopInfo()[ringIdx].available === true,
    JSON.stringify(enc.shopInfo()[ringIdx]));
  ok("a fresh run opens with the ring locked, and game.js agrees",
    enc.state().mods.keyThrust === false && t.keyThrustUnlocked() === false &&
    t.aimState().aiming === true,
    "flag=" + enc.state().mods.keyThrust + " unlocked=" + t.keyThrustUnlocked());
  const thrustLocked = ringThrust();
  ok("a locked ring moves the ship not at all", thrustLocked === 0, "speed=" + thrustLocked);
  // ...and the aim role is untouched. That branch runs exactly when aiming()
  // is FALSE, which is exactly when the cursor is hidden and the ring is the
  // only aim control on the screen — gating it would remove aiming entirely.
  t.setRightHeld(true); // mouse mode with invert on: right held hands the ring the aim
  t.G.aimed = false;
  t.G.aimAngle = 0;
  const ringWas = t.G.running;
  t.G.running = true; // flag only — the loop itself stays stopped
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
  t.G.running = ringWas;
  document.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));
  ok("a locked ring still snaps the aim while the mouse flies",
    t.aimState().aiming === false && t.G.aimed === true &&
    Math.abs(t.G.aimAngle + Math.PI / 2) < 1e-9,
    "aiming=" + t.aimState().aiming + " angle=" + t.G.aimAngle);
  t.setRightHeld(false);
  // the pause copy, locked: exactly three lines claimed key thrust, and the
  // fourth — "right held: mouse flies · keys aim" — stays true either way
  const copyFor = (mode, inv) => { t.setAimMode(mode); t.setInvert(inv); return t.pauseLines(); };
  const lockMi = copyFor("mouse", true);
  const lockMo = copyFor("mouse", false);
  const lockPi = copyFor("push", true);
  const lockPo = copyFor("push", false);
  t.setAimMode("mouse");
  t.setInvert(true);
  // One readback over a whole field rect, downsampled into a scratch pad. A
  // single 2×2 probe is too easy to land between a 9 px glyph's strokes, and
  // these legs have to be able to say "no ink here" and be believed.
  const ringPad = document.createElement("canvas");
  ringPad.width = 128;
  ringPad.height = 16;
  const ringPadCtx = ringPad.getContext("2d", { willReadFrequently: true });
  const ringRegion = (fx, fy, fw, fh) => {
    const p = t.fieldToCanvas(fx, fy);
    const q = t.fieldToCanvas(fx + fw, fy + fh);
    ringPadCtx.clearRect(0, 0, ringPad.width, ringPad.height);
    ringPadCtx.drawImage(canvasEl, Math.round(p.x), Math.round(p.y),
      Math.max(1, Math.round(q.x - p.x)), Math.max(1, Math.round(q.y - p.y)),
      0, 0, ringPad.width, ringPad.height);
    return JSON.stringify(Array.from(ringPadCtx.getImageData(0, 0, ringPad.width, ringPad.height).data));
  };
  const ringHud = () => ringRegion(6, 54, 120, 12); // the notice's own text row

  // the sale itself, on a staged shop visit — the natural flow is section F's
  enc.E.state = "cleared";
  enc.openShop();
  ok("the shop opens without the reveal", enc.state().ringCard === false);
  ok("an empty wallet cannot buy the ring", enc.buy(ringIdx) === false && enc.state().mods.keyThrust === false);
  enc.addXp(20);
  ok("the sale lands at 8 and the row goes MAXED",
    enc.buy(ringIdx) === true && enc.state().xp === 12 && enc.state().owned[ringIdx] === 1 &&
    enc.shopInfo()[ringIdx].maxed === true && enc.state().mods.keyThrust === true,
    "xp=" + enc.state().xp + " owned=" + enc.state().owned[ringIdx]);
  ok("the one-time row refuses a second sale and the wallet is untouched",
    enc.buy(ringIdx) === false && enc.state().xp === 12 && enc.state().owned[ringIdx] === 1);
  ok("the sale raises the reveal, and game.js reads the unlock immediately",
    enc.state().ringCard === true && t.keyThrustUnlocked() === true);
  // the reveal: real ink on the shop screen, gated on the async load exactly
  // as the first-run card is, and never modal — Enter still deals the wave
  const rc = t.ringCardState();
  ok("the reveal keeps the asset's 3:1 ratio inside the field",
    rc.w === 3 * rc.h && rc.x === (t.FW - rc.w) / 2 && rc.x > 0 && rc.y >= 0 && rc.y + rc.h < t.FH,
    JSON.stringify({ x: rc.x, y: rc.y, w: rc.w, h: rc.h, FH: t.FH }));
  const ringBand = () => ringRegion(rc.x + 8, rc.y + 8, rc.w - 16, 40); // inside the art
  liveRender();
  const ringInk = ringBand();
  const ringReadyWas = t.setRingReady(false);
  liveRender();
  const ringPending = ringBand();
  t.setRingReady(ringReadyWas);
  liveRender();
  const ringBack = ringBand();
  ok("the reveal paints its bitmap, and paints it again once the load flag returns",
    ringReadyWas === true && ringInk !== ringPending && ringBack === ringInk,
    "loaded=" + ringReadyWas + " drew=" + (ringInk !== ringPending) + " repaint=" + (ringBack === ringInk));
  // ...and the two layers it lands on top of stand down while it is up. The
  // bitmap is opaque, so a layer left drawing under it is not dimmed by the
  // card — it is cut in half by the card's edges. Both legs probe the column
  // the card does NOT reach (left of rc.x, right of rc.x + rc.w), so the only
  // thing that can change there is whether that layer drew at all, and both
  // are two-sided: the ink goes when the card arrives and comes back when it
  // does not. Three renders of ONE frame — no sim advance between them.
  const ringMapWas = t.minimapInfo().on;
  t.setMinimap(true); // the map leg needs the map on however a human left it
  const stackCol = () => ringRegion(4, 8, rc.x - 5, 48);       // WAVE · CLEAR, the pips, XP, FOES
  const mapCol = () => ringRegion(rc.x + rc.w + 1, 8, 12, 94); // the corner map's right column
  liveRender();
  const stackUnder = stackCol();
  const mapUnder = mapCol();
  t.setRingReady(false); // the same shop screen, minus the art
  liveRender();
  const stackBare = stackCol();
  const mapBare = mapCol();
  t.setRingReady(ringReadyWas);
  liveRender();
  const stackAgain = stackCol();
  const mapAgain = mapCol();
  t.setMinimap(ringMapWas);
  ok("the reveal stands the status stack down instead of slicing its column",
    stackUnder !== stackBare && stackAgain === stackUnder,
    "cleared=" + (stackUnder !== stackBare) + " stable=" + (stackAgain === stackUnder));
  ok("the reveal stands the corner map down instead of clipping its frame",
    mapUnder !== mapBare && mapAgain === mapUnder,
    "cleared=" + (mapUnder !== mapBare) + " stable=" + (mapAgain === mapUnder));
  liveKey("Enter");
  s = enc.state();
  ok("the reveal is never modal — enter still deals the next wave",
    s.state === "warning" && s.wave === 2 && s.waveTick === 0,
    "state=" + s.state + " wave=" + s.wave);
  enc.E.state = "cleared";
  enc.openShop();
  ok("the next shop opens clean — the reveal was the sale's, not the unlock's",
    enc.state().ringCard === false && enc.state().mods.keyThrust === true);

  // the purchase reaches the sim, and the HUD notice deletes itself
  enc.E.state = "active";
  const thrustBought = ringThrust();
  ok("the bought ring moves the ship on the very next tick", thrustBought > 0, "speed=" + thrustBought);
  // the HUD notice, on the line the deleted U hint freed: three renders of ONE
  // frame with the flag as the only difference, so nothing the sim did between
  // them can stand in for the ink
  t.setAimMode("mouse");
  t.setInvert(true);
  t.render();
  const hudFree = ringHud();
  enc.mods.keyThrust = false; // the flag alone, back where the notice lives
  t.render();
  const hudLocked = ringHud();
  enc.mods.keyThrust = true;
  t.render();
  const hudBack = ringHud();
  ok("THRUST LOCKED — SHOP prints exactly while the ring is locked",
    hudLocked !== hudFree && hudBack === hudFree,
    "ink=" + (hudLocked !== hudFree) + " clears=" + (hudBack === hudFree));
  // the pause copy, unlocked — the same four wordings, read again
  const freeMi = copyFor("mouse", true);
  const freeMo = copyFor("mouse", false);
  const freePi = copyFor("push", true);
  const freePo = copyFor("push", false);
  ok("every line that claims key thrust claims it only once the ring is bought",
    /keys thrust/.test(freeMi[0]) && /keys thrust/.test(freeMo[1]) && /keys fly the ship/.test(freePi[0]) &&
    !/keys thrust/.test(lockMi.join(" ")) && !/keys thrust/.test(lockMo.join(" ")) &&
    !/keys fly the ship/.test(lockPi.join(" ")),
    JSON.stringify({ lockMi, lockMo, lockPi, freeMi, freeMo, freePi }));
  ok("the line that stays true after the gate is untouched by it",
    lockMi[1] === "right held: mouse flies · keys aim · left fires · esc pauses" &&
    freeMi[1] === lockMi[1] && lockMo[0] === freeMo[0] && lockPi[1] === freePi[1] &&
    lockPo.join("|") === freePo.join("|"),
    JSON.stringify({ mi: lockMi[1], mo: lockMo[0], po: lockPo }));

  // and it all dies with the run — an 8 XP buy is never a meta-unlock
  enc.restart();
  enc.E.hull = 99;
  enc.advance(130);
  t.setAimMode("mouse");
  t.setInvert(true);
  const thrustRelocked = ringThrust();
  ok("restart re-locks the ring in the sim, not just on the flag",
    enc.state().mods.keyThrust === false && t.keyThrustUnlocked() === false &&
    enc.state().ringCard === false && thrustRelocked === 0,
    "speed=" + thrustRelocked + " flag=" + enc.state().mods.keyThrust);
  t.setInvert(ringInvWas);
  t.setAimMode(ringAimWas);
  t.setEdgeArrows(ringArrowsWas);

  // ---- U. BLAST CHARGE: the splash a terminating player shot leaves ----
  // Rank 0 splashes nothing at all. Every rank above it damages every OTHER
  // living body whose CIRCLE reaches BLASTR + BLASTGAIN × (rank − 1) px of the
  // impact point — exactly once, for exactly what one bullet deals — and never
  // the body the bullet itself just paid. The neighbours are parked
  // perpendicular to the shot, every one of them well clear of the bullet's own
  // 9.2 px hit circle, so the only thing that can ever reach them is the blast.
  // The radii come off the two weapons-tab sliders through the real DOM
  // handler, driven to a bench pair here and put back at the end of the
  // section, so the geometry margins are the check's and not the page's.
  t.G.leftHeld = false; // no autofire bullet may wander into these shots
  const blastIdx = enc.shopInfo().findIndex((r) => r.name === "BLAST CHARGE");
  const dartHp = ECFG.enemy.hp;
  const foeR = ECFG.enemy.r;
  const slide = (id, val) => { // one slider, driven through bind(); returns its undo
    const c = document.getElementById(id);
    const was = c.value;
    c.value = String(val);
    c.dispatchEvent(new Event("input", { bubbles: true }));
    return () => { c.value = was; c.dispatchEvent(new Event("input", { bubbles: true })); };
  };
  const blastLive = enc.tunables();
  const inRange = (id, live) => { // the section-G contract: the slider spans and shows it
    const c = document.getElementById(id);
    return Number(c.value) === live && live >= Number(c.min) && live <= Number(c.max);
  };
  ok("both blast sliders span and show their live tunables",
    inRange("blastr", blastLive.BLASTR) && inRange("blastgain", blastLive.BLASTGAIN),
    "BLASTR=" + blastLive.BLASTR + " BLASTGAIN=" + blastLive.BLASTGAIN);
  enc.reset();
  ok("an unbought blast has no radius at all", enc.blastRadius() === 0,
    "R=" + enc.blastRadius() + " rank=" + enc.state().mods.blast);
  const undoR = slide("blastr", 18);      // the bench: rank 1 reaches 18 px...
  const undoG = slide("blastgain", 10);   // ...and every rank after it 10 px more
  const rim1 = 18 + foeR;                 // a body's CENTER is inside the blast up to here
  const rim2 = 18 + 10 + foeR;
  const inD = rim1 - 3;    // its circle overlaps the blast by 3 px
  const outD = rim1 + 3;   // 3 px of daylight past the rim
  const midD = rim2 - 5;   // outside rank one's rim, inside rank two's
  const blastRanks = (n) => { // one staged shop visit, n ranks — the flow is F's
    enc.E.state = "cleared";
    enc.openShop();
    enc.addXp(1000);
    for (let k = 0; k < n; k++) enc.buy(blastIdx);
    enc.E.state = "active"; // back to a live field without dealing a wave
  };
  // one shot that terminates on a body, with a neighbour parked at each given
  // distance from the impact point. keep=true skips the reset, so a leg can
  // fire into a field a restart just handed back.
  const blastShot = (ranks, dists, keep) => {
    if (!keep) enc.reset();
    enc.E.hull = 99;
    if (ranks) blastRanks(ranks);
    const sy = ship().y;
    enc.spawnEnemy(ship().x + 150, sy);
    const target = enc.E.enemies[enc.E.enemies.length - 1];
    const ix = target.x - (target.r + 2.2); // the entry point on the inflated body
    const near = dists.map((d) => {
      enc.spawnEnemy(ix, sy + d);
      return enc.E.enemies[enc.E.enemies.length - 1];
    });
    t.G.bullets.push({ x: target.x - 40, y: sy, px: target.x - 40, py: sy, vx: 40, vy: 0,
      r: 2.2, dmg: 1, owner: "player", dead: false, spent: false, ttl: 60 });
    enc.advance(1); // the hit, the splash and the reap all land on this one tick
    return { hits: enc.state().hitsDealt, target: target.hp, near: near.map((e) => e.hp) };
  };
  const r0 = blastShot(0, [inD]);
  ok("rank zero splashes nothing — the body beside the impact is untouched",
    r0.hits === 1 && r0.target === dartHp - 1 && r0.near[0] === dartHp,
    JSON.stringify(r0) + " at=" + inD);
  const r1 = blastShot(1, [inD, outD]);
  ok("rank one costs a body inside the radius exactly one bullet, and one outside nothing",
    r1.near[0] === dartHp - 1 && r1.near[1] === dartHp,
    JSON.stringify(r1) + " in=" + inD + " out=" + outD + " rim=" + rim1);
  ok("the directly hit body pays the bullet and nothing more — no double dip",
    r1.hits === 1 && r1.target === dartHp - 1, "hp=" + r1.target + " hits=" + r1.hits);
  // the radius is read LIVE: the same body, the same shot, a wider slider
  const undoWide = slide("blastr", 40);
  const rWide = blastShot(1, [outD]);
  const wideR = enc.blastRadius();
  undoWide(); // back to the bench 18
  ok("the radius comes off the live slider — the body outside the bench rim is now inside",
    wideR === 40 && rWide.near[0] === dartHp - 1 && enc.tunables().BLASTR === 18,
    "R=" + wideR + " hp=" + rWide.near[0] + " back=" + enc.tunables().BLASTR);
  // stacking: one rank of gain, and only that
  const rank1Mid = blastShot(1, [midD]);
  const rad1 = enc.blastRadius();
  const rank2Mid = blastShot(2, [midD]);
  const rad2 = enc.blastRadius();
  ok("each rank past the first widens the radius by exactly the blast-gain slider",
    rad1 === 18 && rad2 === 28 && rad2 - rad1 === enc.tunables().BLASTGAIN &&
    enc.state().mods.blast === 2 && rank1Mid.near[0] === dartHp && rank2Mid.near[0] === dartHp - 1,
    "R1=" + rad1 + " R2=" + rad2 + " mid=" + midD + " hp1=" + rank1Mid.near[0] + " hp2=" + rank2Mid.near[0]);
  // the other way a player bullet terminates on an impact: it leaves the world
  // at a wall, which game.js marks spent and sparks. The body hugging that wall
  // is 12 px off the shot line — clear of the bullet's 9.2 px hit circle, so
  // only the blast can reach it — and the bullet is gone on the same tick.
  enc.reset();
  enc.E.hull = 99;
  enc.setBounce(false);
  blastRanks(1);
  const wy = ship().y;
  enc.spawnEnemy(t.WW - foeR, wy + 12);
  const wallFoe = enc.E.enemies[enc.E.enemies.length - 1];
  t.G.bullets.push({ x: t.WW - 30, y: wy, px: t.WW - 30, py: wy, vx: 40, vy: 0,
    r: 2.2, dmg: 1, owner: "player", dead: false, spent: false, ttl: 60 });
  enc.advance(2); // the second tick sweeps the spent bullet out — one blast, not two
  ok("a shot that dies at the wall splashes the body hugging it, and hits nothing itself",
    wallFoe.hp === dartHp - 1 && enc.state().hitsDealt === 0 && t.G.bullets.length === 0,
    "hp=" + wallFoe.hp + " hits=" + enc.state().hitsDealt + " bullets=" + t.G.bullets.length);
  // ...but a mid-air ttl fade impacted nothing, so it splashes nothing. The
  // bullet is parked 15 px off the body: clear of its 9.2 px hit circle, and
  // well inside the 25 px a rank-one blast would have reached. The burst count
  // is the load-bearing half — a fade wrongly treated as a wall exit lands its
  // blast on the boundary the crossing math falls back to, nowhere near this
  // body, so hp alone would call that bug a pass.
  t.setFxInt(1);
  enc.reset();
  enc.E.hull = 99;
  blastRanks(1);
  enc.spawnEnemy(ship().x + 150, ship().y);
  const fadeFoe = enc.E.enemies[enc.E.enemies.length - 1];
  t.G.bullets.push({ x: fadeFoe.x, y: fadeFoe.y - 15, px: fadeFoe.x, py: fadeFoe.y - 15, vx: 0, vy: 0,
    r: 2.2, dmg: 1, owner: "player", dead: false, spent: false, ttl: 1 });
  enc.advance(2);
  ok("a ttl fade in open space splashes nothing, anywhere",
    fadeFoe.hp === dartHp && enc.state().hitsDealt === 0 && t.G.bullets.length === 0 &&
    t.fx.bursts.length === 0,
    "hp=" + fadeFoe.hp + " bullets=" + t.G.bullets.length +
    " bursts=" + JSON.stringify(t.fx.bursts.map((b) => b.kind)));
  // the burst the blast paints is sized to the radius the sim actually used,
  // and it still rides game.js's hash stream rather than the seeded one
  t.setFxInt(1);
  const fxRun = blastShot(2, [inD]);
  const blastFx = t.fx.bursts.filter((b) => b.kind === "blast");
  ok("the splash paints one blast burst, sized to the effective radius",
    fxRun.near[0] === dartHp - 1 && blastFx.length === 1 && blastFx[0].r === 28 &&
    Number.isFinite(blastFx[0].seed),
    "bursts=" + blastFx.length + " r=" + (blastFx[0] && blastFx[0].r));
  // ...and with the decoration off the damage is unchanged, so no sim result
  // can depend on a visual slider
  t.setFxInt(0);
  const fxOffRun = blastShot(2, [inD]);
  t.setFxInt(1);
  ok("intensity zero paints no blast burst but the splash still lands",
    t.fx.bursts.length === 0 && fxOffRun.near[0] === dartHp - 1 && fxOffRun.target === dartHp - 1,
    "bursts=" + t.fx.bursts.length + " hp=" + fxOffRun.near[0]);
  undoG();
  undoR();
  ok("the bench sliders go back where the page had them",
    enc.tunables().BLASTR === blastLive.BLASTR && enc.tunables().BLASTGAIN === blastLive.BLASTGAIN,
    "R=" + enc.tunables().BLASTR + " gain=" + enc.tunables().BLASTGAIN);

  // ---- V. the BLAST CHARGE row: 8/16/32, three ranks, and the run's end ----
  enc.reset();
  enc.advance(1);
  enc.E.state = "cleared";
  enc.openShop();
  enc.addXp(1000);
  ok("the catalog's sixth row is BLAST CHARGE, unowned and unmaxed",
    blastIdx === 5 && enc.shopInfo()[blastIdx].owned === 0 &&
    enc.shopInfo()[blastIdx].maxed === false && enc.shopInfo()[blastIdx].available === true,
    JSON.stringify(enc.shopInfo()[blastIdx]));
  const bCosts = [];
  let bPaid = true;
  for (let k = 0; k < 3; k++) {
    const bInfo = enc.shopInfo()[blastIdx];
    bCosts.push(bInfo.cost);
    const bBefore = enc.state().xp;
    if (enc.buy(blastIdx) !== true || enc.state().xp !== bBefore - bInfo.cost) bPaid = false;
  }
  ok("BLAST CHARGE's price doubles per rank: 8/16/32, each deducted exactly",
    JSON.stringify(bCosts) === "[8,16,32]" && bPaid, JSON.stringify(bCosts));
  ok("rank four is refused at the cap and the row reads MAXED",
    enc.buy(blastIdx) === false && enc.shopInfo()[blastIdx].maxed === true &&
    enc.state().owned[blastIdx] === 3 && enc.state().mods.blast === 3,
    "owned=" + enc.state().owned[blastIdx] + " rank=" + enc.state().mods.blast);
  // the sixth digit reaches the sixth row through the real key handler
  enc.restart();
  enc.advance(1);
  enc.E.state = "cleared";
  enc.openShop();
  enc.addXp(8);
  liveKey("Digit6");
  s = enc.state();
  ok("digit six buys the sixth row and the shop stays open",
    s.mods.blast === 1 && s.owned[blastIdx] === 1 && s.xp === 0 && s.state === "shop",
    "rank=" + s.mods.blast + " xp=" + s.xp + " state=" + s.state);
  // six rows still fit: card down the list is centred, card up it hangs off the
  // reveal's bottom edge, and either way the footer lands above the field floor
  const rcBox = t.ringCardState();
  const layUp = enc.shopLayout(true);
  const layDown = enc.shopLayout(false);
  ok("the six-row list and its footer fit the field, reveal up and reveal down",
    layUp.rows === 6 && layDown.rows === 6 &&
    layUp.titleY >= rcBox.y + rcBox.h && layUp.footY + 4 <= t.FH &&
    layDown.titleY > 0 && layDown.footY + 4 <= t.FH,
    JSON.stringify({ up: layUp, down: layDown, cardBottom: rcBox.y + rcBox.h, FH: t.FH }));
  // and the rank dies with the run — the splash is a purchase, never a meta-unlock
  enc.restart();
  enc.advance(1);
  blastRanks(3);
  const rankBefore = enc.state().mods.blast;
  enc.restart();
  const rankAfter = enc.state().mods.blast;
  const rDead = blastShot(0, [enc.tunables().BLASTR + foeR - 3], true); // no reset — the
  // restart above IS the reset this leg is about
  ok("restart clears the rank, and the sim stops splashing with it",
    rankBefore === 3 && rankAfter === 0 && enc.state().owned[blastIdx] === 0 &&
    rDead.hits === 1 && rDead.target === dartHp - 1 && rDead.near[0] === dartHp,
    "before=" + rankBefore + " after=" + rankAfter + " " + JSON.stringify(rDead));

  // ---- restore the page for a human ----
  t.setFxInt(priorFx.FXINT);
  t.setFxDur(priorFx.FXDUR);
  t.setAimMode(priorAim);
  t.setEdgeMargin(priorEdge);
  t.G.leftHeld = false;
  t.G.started = priorStarted; // the first-run screen comes back if that is where the page was
  t.ui.syncMenu();            // ...wording included, since nothing here went through syncTuner()
  enc.restart();
  t.render();

  const failed = R.filter((r) => !r.pass);
  return { total: R.length, passed: R.length - failed.length, failed, results: R };
};
