"use strict";

// Deterministic wave checks — the suite now covers the endless progressive
// waves: the wave-1 slice, the wave transition, the pure scaling functions,
// the post-wave XP shop, and all five archetypes — the charger's locked lunge,
// the harrier's honest lock and the seeker missiles it launches, the anvil's
// frontal shield, and the husk's death split. Load this file in the
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
  const canvasEl = document.getElementById("field"); // the field itself — the shop's
  // click target, and the dead screen's; hoisted here because section F now
  // dispatches real mousedowns long before section J's first use of it
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
  // FROZEN shop. It is a MOUSE surface end to end: a click on a card buys it,
  // a click on NEXT WAVE deals the wave, and no key does either.
  // The shop's clicks land only while the game is LIVE — paused, the pointer
  // belongs to the pause menu (section R pins that) — and a frozen shop keeps
  // G.running true in play, so dispatches here raise the flag R-style:
  // the flag only, the loop itself stays stopped.
  // The shop reads a CLIENT-space pointer here: mouse mode converts clientX and
  // clientY to field coordinates. The shipped default is locked mode now, which
  // reads the drawn cursor instead, so this section pins the mode it asserts.
  t.setAimMode("mouse");
  const liveKey = (code) => {
    const was = t.G.running;
    t.G.running = true;
    document.dispatchEvent(new KeyboardEvent("keydown", { code }));
    t.G.running = was;
  };
  // a REAL mousedown at a field point, through game.js's own handler and its
  // client→field conversion — nothing here reaches buy() by a side door
  const liveClick = (fx, fy) => {
    const was = t.G.running;
    t.G.running = true;
    const c = t.fieldToClient(fx, fy);
    canvasEl.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: c.x, clientY: c.y, bubbles: true }));
    t.G.running = was;
  };
  const liveMove = (fx, fy) => { // ...and the hover that precedes it
    const was = t.G.running;
    t.G.running = true;
    const c = t.fieldToClient(fx, fy);
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: c.x, clientY: c.y, bubbles: true }));
    t.G.running = was;
  };
  const cardMid = (i) => { const c = enc.shopLayout().cards[i]; return [c.x + c.w / 2, c.y + c.h / 2]; };
  const clickCard = (i) => liveClick(...cardMid(i));
  // ...and a reader for the predicates that only answer on a LIVE shop, so a
  // check can ask them without the suite's paused page answering for them
  const liveVal = (fn) => {
    const was = t.G.running;
    t.G.running = true;
    try { return fn(); } finally { t.G.running = was; }
  };
  const clickNext = () => { const b = enc.shopLayout().btn; liveClick(b.x + b.w / 2, b.y + b.h / 2); };
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
  const RL1 = 1 / 1.15; // rank 1 of the additive curve: +15% of the BASE rate
  clickCard(0);
  s = enc.state();
  ok("a click on the first card buys RAPID LOADER and the shop stays open",
    s.mods.cool === RL1 && s.xp === 2 && s.owned[0] === 1 && s.state === "shop",
    "cool=" + s.mods.cool + " xp=" + s.xp + " state=" + s.state);
  clickCard(0);
  s = enc.state();
  ok("an unaffordable rank is refused and the wallet is untouched",
    s.mods.cool === RL1 && s.xp === 2 && s.owned[0] === 1,
    "xp=" + s.xp + " owned=" + s.owned[0]);
  ok("buy() reports the refusal", enc.buy(0) === false && enc.state().xp === 2);
  enc.E.hull = enc.E.hullMax; // full hull — the patch must be off the shelf
  enc.addXp(20);              // fund the repairs
  ok("HULL PATCH is refused at full hull",
    enc.buy(2) === false && enc.state().xp === 22 && enc.state().hull === enc.E.hullMax);
  enc.E.hull = 1;
  clickCard(2);
  clickCard(2);
  s = enc.state();
  ok("HULL PATCH repairs at a flat 6 per point", s.hull === 3 && s.xp === 10,
    "hull=" + s.hull + " xp=" + s.xp);
  // a click that lands on no target at all is EATEN, never passed through: the
  // shop owns the whole field, so the gap between two cards must not fire, and
  // must not re-arm a pointer lock over a menu that needs the cursor
  const gapCard = enc.shopLayout().cards[0];
  liveClick(gapCard.x + gapCard.w + 5, gapCard.y + gapCard.h / 2);
  s = enc.state();
  ok("a click on the grid's gutter buys nothing and continues nothing",
    s.state === "shop" && s.xp === 10 && s.hull === 3 && s.shopHover === -1 && s.shopBtn === false,
    "state=" + s.state + " xp=" + s.xp + " hover=" + s.shopHover);
  clickNext();
  s = enc.state();
  ok("a click on NEXT WAVE continues into wave 2's warning",
    s.state === "warning" && s.wave === 2 && s.waveTick === 0,
    "state=" + s.state + " wave=" + s.wave);
  enc.continueFromShop();
  clickNext();
  s = enc.state();
  ok("a doubled continue deals exactly one wave — never two",
    s.wave === 2 && s.state === "warning" && s.waveTick === 0,
    "wave=" + s.wave + " state=" + s.state);
  // The shop RELEASES the pointer lock to get its cursor back, and both
  // lock-loss handlers read a release as a reason to pause. Left unguarded,
  // clearing a wave in push mode (or in mouse-flight with the button still
  // held) drops the lock, the handler pauses the shop behind the menu, and
  // the resume grabs the lock straight back — a menu with no cursor to click
  // it with. Both handlers must sit out the whole visit, and requestLock with
  // them. Every leg dispatches the REAL event at the real listener.
  const lockAimWas = t.aimState().AIMMODE;
  const lockRightWas = t.G.rightHeld;
  const lockSurvives = (mode, rightHeld, evt) => {
    t.setAimMode(mode);
    enc.E.state = "cleared";
    enc.openShop();
    const was = t.G.running;
    t.G.running = true;      // the flag a frozen shop genuinely carries in play
    t.G.rightHeld = rightHeld;
    const claimed = t.shopOwnsPointer();
    document.dispatchEvent(new Event(evt));
    const alive = t.G.running === true && enc.state().state === "shop" && claimed;
    t.G.running = was;
    return alive;
  };
  ok("push mode's lock-loss handler sits out the shop instead of pausing it",
    lockSurvives("push", false, "pointerlockchange"));
  ok("mouse-flight's lock-loss handler sits out the shop too",
    lockSurvives("mouse", true, "pointerlockchange"));
  ok("a refused lock request over the shop is not a failure to pause over",
    lockSurvives("push", false, "pointerlockerror"));
  // ...and the claim covers the PAUSED shop too. shopOwnsPointer reads the
  // SCREEN, not the loop's flag: the mouseup handler below has no running
  // gate, so with INVERT off a right release over the pause menu is a genuine
  // user gesture that would win a lock, and resume() would carry it into a
  // mouse-only menu with no cursor and a hover frozen at one field pixel.
  enc.E.state = "cleared";
  enc.openShop();
  const pausedClaim = t.G.running === false && t.shopOwnsPointer() === true;
  const invWas = t.aimState().AIMMODE === "mouse" && document.getElementById("invert").checked;
  t.setAimMode("mouse");
  t.setInvert(false);          // the one configuration whose paused right-release re-arms
  t.G.rightHeld = false;       // released: aiming() is false, the branch that asks for a lock
  document.dispatchEvent(new MouseEvent("mouseup", { button: 2, bubbles: true }));
  ok("a paused shop still owns the pointer, so an invert-off right release wins no lock",
    pausedClaim && t.shopOwnsPointer() === true && enc.state().state === "shop" &&
    t.G.running === false,
    "claimed=" + pausedClaim + " state=" + enc.state().state);
  // the resume takes the release branch, never the arm branch, and re-seeds
  // the hover — a paused shop takes no mousemove, so the pointer may have
  // travelled far from whatever card was lit when the pause began
  const farCard = enc.shopLayout().cards[4];
  enc.shopHover(farCard.x + farCard.w / 2, farCard.y + farCard.h / 2); // no-op paused...
  enc.E.shopHover = 4;                                                 // ...so plant it
  t.setMouseClient(0, 0); // the pointer now sits off every card
  t.ui.resume(); // the REAL resume — which also starts the rAF loop, so it has
  const seeded = enc.state().shopHover; // to be stopped by the real pause, not
  // by dropping the flag: a running loop would step and repaint underneath
  // every later section, and every pixel probe in the suite reads that canvas
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
  t.setInvert(invWas);
  t.G.rightHeld = lockRightWas;
  t.setAimMode(lockAimWas);
  ok("resuming a paused shop re-seeds the hover instead of restoring a stale one",
    seeded === -1, "hover=" + seeded);
  enc.continueFromShop(); // the claim is the SCREEN's, so it has to end with it
  ok("...and off the shop screen the pointer is the flight controls' again",
    t.shopOwnsPointer() === false && enc.state().state !== "shop",
    "state=" + enc.state().state);
  // the keys the shop used to bind are GONE — a run of them over a live shop
  // must change nothing at all, wallet, ranks and state alike
  enc.E.state = "cleared";
  enc.openShop();
  enc.addXp(64);
  const keyBefore = JSON.stringify(enc.state().owned) + "|" + enc.state().xp;
  const keyWave = enc.state().wave; // whatever wave the staging above landed on
  for (const code of ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6",
                      "Numpad1", "Enter", "NumpadEnter", "Space"]) liveKey(code);
  s = enc.state();
  ok("the retired digit and enter bindings buy nothing and deal no wave",
    s.state === "shop" && s.wave === keyWave && JSON.stringify(s.owned) + "|" + s.xp === keyBefore,
    "state=" + s.state + " wave=" + s.wave + " want=" + keyWave + " " + JSON.stringify(s.owned) + " xp=" + s.xp);
  enc.continueFromShop();
  // the bought terms reach the sim — expectations come from the live tuner
  // values, so an already-tuned page cannot fake a failure
  const tun = enc.tunables();
  t.setAimMode("push");
  t.G.aimed = true;
  t.G.aimAngle = 0;
  t.G.cool = 0;
  enc.fireOnce();
  ok("the bought cooldown shortens the firing gate",
    t.G.cool === Math.max(1, Math.round(tun.BCOOL * RL1 / tun.TICK)), "cool=" + t.G.cool);
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
  // the wave OPENS on a plain pack: the radar variant is the closer now, so
  // the first thing wave 2 shows is the ordinary dart read
  ok("the first wave-2 group lands a plain dart pack, no radar leader",
    s.enemies === W2[0].count && s.darts === s.enemies && s.byType.radarDart === 0 && s.chargers === 0,
    "enemies=" + s.enemies + " darts=" + s.darts + " radarDarts=" + s.byType.radarDart);
  // ...and the LAST group carries the wave's ONE radarDart as member 0 — the
  // body wearing the cyan ring is the beat wave 2 ends on
  const w2Last = W2[W2.length - 1];
  enc.advance(w2Last.spawnAt - W2[0].spawnAt);
  s = enc.state();
  ok("wave 2 closes on the stamped pack, its leader the radar variant",
    w2Last.radar === 1 && s.byType.radarDart === 1,
    "last=" + JSON.stringify(w2Last) + " radarDarts=" + s.byType.radarDart);
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
  // the live-telegraph escalation: the same body, quiet while it loiters and
  // hot the moment its lock is running — mode is the only thing that moves
  enc.reset();
  enc.spawnEnemy(ship().x + 600, ship().y, 0, "harrier");
  const arrHarIdle = enc.edgeArrows();
  enc.E.enemies[0].mode = "lockon";
  const arrHarHot = enc.edgeArrows();
  ok("a loitering harrier's arrow is quiet; a locking one goes hot",
    arrHarIdle.length === 1 && arrHarIdle[0].hot === false &&
    arrHarHot.length === 1 && arrHarHot[0].hot === true && arrHarHot[0].type === "harrier",
    "idle=" + (arrHarIdle[0] && arrHarIdle[0].hot) + " locking=" + (arrHarHot[0] && arrHarHot[0].hot));
  // the claim: a nearer quiet body on the same bearing cannot mask the shooter
  enc.reset();
  enc.spawnEnemy(ship().x + 500, ship().y);
  enc.spawnEnemy(ship().x + 700, ship().y, 0, "harrier");
  enc.E.enemies[1].mode = "lockon";
  const arrMask = enc.edgeArrows();
  ok("a locking harrier wins its bucket from a nearer quiet body",
    arrMask.length === 1 && arrMask[0].type === "harrier" && arrMask[0].hot === true && arrMask[0].n === 2,
    JSON.stringify(arrMask));
  // the charger's own telegraph earns the same escalation
  enc.reset();
  enc.spawnEnemy(ship().x + 600, ship().y, 0, "charger");
  enc.E.enemies[0].mode = "windup";
  const arrChHot = enc.edgeArrows();
  ok("an off-screen charger mid-windup goes hot too",
    arrChHot.length === 1 && arrChHot[0].hot === true,
    "hot=" + (arrChHot[0] && arrChHot[0].hot));
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
  const rlCurve = []; // mods.cool after each rank — the fire-rate curve itself
  let rlPaid = true;
  for (let k = 0; k < 5; k++) {
    const rlInfo = enc.shopInfo()[0];
    rlCosts.push(rlInfo.cost);
    const rlBefore = enc.state().xp;
    if (enc.buy(0) !== true || enc.state().xp !== rlBefore - rlInfo.cost) rlPaid = false;
    rlCurve.push(enc.state().mods.cool);
  }
  ok("RAPID LOADER's price doubles per rank: 4/8/16/32/64, each deducted exactly",
    JSON.stringify(rlCosts) === "[4,8,16,32,64]" && rlPaid, JSON.stringify(rlCosts));
  // Each purchase adds 15% of the BASE rate, so rank n fires at (1 + 0.15n)×
  // and mods.cool is 1/(1 + 0.15n) — never a compounded step. apply() SETS it
  // from the rank rather than multiplying, which is what makes rank the only
  // thing the effect depends on.
  ok("the fire-rate curve is additive: 1.15/1.3/1.45/1.6/1.75x the base rate",
    rlCurve.every((c, k) => Math.abs(c - 1 / (1 + 0.15 * (k + 1))) < 1e-12),
    JSON.stringify(rlCurve.map((c) => +(1 / c).toFixed(3))));
  ok("rank six is refused at the hard cap and the row reads MAXED",
    enc.buy(0) === false && enc.shopInfo()[0].maxed === true && enc.state().owned[0] === 5 &&
    Math.abs(enc.state().mods.cool - 1 / 1.75) < 1e-12,
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
  // A coarse GRID over the whole card area, not a single row: the graphical
  // shop's ink is borders, icons and centred labels with wide flat panels
  // between them, and any one row can land entirely on panel — which reads
  // the same dark as the paused field behind it and proves nothing.
  const shopStrip = () => {
    const strip = [];
    const gl = enc.shopLayout().grid;
    for (let fy = gl.y + 3; fy < gl.y + gl.h; fy += 13) {
      for (let fx = gl.x; fx < gl.x + gl.w; fx += 9) strip.push(arrPx(fx, fy));
    }
    return strip.join("|");
  };
  const stripLive = shopStrip();
  // PAUSED over the open shop — reachable in play via Escape, alt-tab or a
  // lock loss, since a frozen shop keeps G.running true — the overlay must
  // stand down (its cards and button sit exactly in the pause copy's band)
  // and the POINTER must go with it: a click belongs to the pause menu's
  // buttons there, and one that reached a card would buy behind the menu.
  // G.running is genuinely false here — the suite's page IS a paused screen.
  t.render();
  ok("a paused shop keeps its overlay off the canvas for the pause copy",
    shopStrip() !== stripLive);
  enc.addXp(10); // fund a buy no paused input may make
  const pausedCard = enc.shopLayout().cards[0];
  const pcx = pausedCard.x + pausedCard.w / 2;
  const pcy = pausedCard.y + pausedCard.h / 2;
  const hoverRefused = enc.shopHover(pcx, pcy); // both report NOT CONSUMED, which is
  const clickRefused = enc.shopClick(pcx, pcy); // what hands the click to the menu
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter" }));
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1" }));
  s = enc.state();
  ok("a paused shop refuses the pointer and the retired keys — state holds",
    enc.shopOpen() === false && hoverRefused === false && clickRefused === false &&
    t.G.running === false && s.state === "shop" && s.wave === 1 && s.xp === 10 &&
    s.owned[0] === 0 && s.shopHover === -1,
    "open=" + enc.shopOpen() + " hover=" + hoverRefused + " click=" + clickRefused +
    " state=" + s.state + " wave=" + s.wave + " xp=" + s.xp);
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
    preRestart.mods.cool === 1 / 1.15 && preRestart.mods.speed === 1 && preRestart.mods.keyThrust === true &&
    preRestart.mods.blast === 1,
    JSON.stringify({ owned: preRestart.owned, xp: preRestart.xp, hullMax: preRestart.hullMax }));
  enc.restart();
  s = enc.state();
  ok("restart zeroes the wallet and every purchase field",
    s.xp === 0 && s.owned.every((n) => n === 0) && s.hullMax === ECFG.player.hull &&
    s.hull === ECFG.player.hull && s.mods.cool === 1 && s.mods.speed === 0 &&
    s.mods.keyThrust === false && s.mods.blast === 0 && s.shopHover === -1 && s.state === "idle",
    JSON.stringify({ xp: s.xp, owned: s.owned, hullMax: s.hullMax, ring: s.mods.keyThrust, blast: s.mods.blast }));

  // ---- T. the THRUST RING: one gate, one sale, one hover preview ----
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
  ok("the shop opens with nothing hovered, and so with no art up",
    enc.state().shopHover === -1 && window.Encounter.ringCardShown() === false);
  ok("an empty wallet cannot buy the ring", enc.buy(ringIdx) === false && enc.state().mods.keyThrust === false);
  enc.addXp(20);
  ok("the sale lands at 8 and the row goes MAXED",
    enc.buy(ringIdx) === true && enc.state().xp === 12 && enc.state().owned[ringIdx] === 1 &&
    enc.shopInfo()[ringIdx].maxed === true && enc.state().mods.keyThrust === true,
    "xp=" + enc.state().xp + " owned=" + enc.state().owned[ringIdx]);
  ok("the one-time row refuses a second sale and the wallet is untouched",
    enc.buy(ringIdx) === false && enc.state().xp === 12 && enc.state().owned[ringIdx] === 1);
  ok("game.js reads the unlock immediately", t.keyThrustUnlocked() === true);
  // The art is a HOVER preview now, not a purchase reveal: it answers to where
  // the pointer is and to nothing else, so a sale on its own must leave the
  // screen exactly as it found it.
  ok("the sale alone raises no art — the pointer is what raises it",
    enc.state().shopHover === -1 && liveVal(() => window.Encounter.ringCardShown()) === false);
  liveMove(...cardMid(ringIdx));
  ok("resting the pointer on the row raises its art",
    enc.state().shopHover === ringIdx &&
    liveVal(() => window.Encounter.ringCardShown()) === true,
    "hover=" + enc.state().shopHover);
  // the rect: the asset's own ratio, inside the field, and — the whole point
  // of choosing a band rather than a fixed slot — never over the card that
  // raised it, so the pointer is never resting on covered ground
  const rc = enc.shopPopupRect(ringIdx);
  const rcCard = enc.shopLayout().cards[ringIdx];
  ok("the art keeps the cropped asset's ratio, inside the field, clear of its own card",
    Math.abs(rc.w / rc.h - t.ringCardState().ratio) < 0.05 && rc.x === Math.round((t.FW - rc.w) / 2) &&
    rc.x > 0 && rc.y >= 0 && rc.y + rc.h < t.FH &&
    (rc.y + rc.h <= rcCard.y || rc.y >= rcCard.y + rcCard.h),
    JSON.stringify({ pop: rc, card: { y: rcCard.y, h: rcCard.h }, FH: t.FH }));
  const ringBand = () => ringRegion(rc.x + 8, rc.y + 8, rc.w - 16, 40); // inside the art
  liveRender();
  const ringInk = ringBand();
  const ringReadyWas = t.setRingReady(false);
  liveRender();
  const ringPending = ringBand();
  t.setRingReady(ringReadyWas);
  liveRender();
  const ringBack = ringBand();
  ok("the art paints its bitmap, and paints it again once the load flag returns",
    ringReadyWas === true && ringInk !== ringPending && ringBack === ringInk,
    "loaded=" + ringReadyWas + " drew=" + (ringInk !== ringPending) + " repaint=" + (ringBack === ringInk));
  // ...and the two layers the SHOP screen would duplicate stand down for the
  // whole visit, art or no art. The shop header already prints the wave, the
  // hull pips and the wallet, so the top-left status stack is the same facts
  // twice; the corner map sits under a scrim it cannot be read through, and
  // inside the hover art's rect it would show as a sliced-off sliver. Both
  // legs are two-sided: the ink goes when the shop opens and comes back on the
  // cleared beat, which is the live screen one state either side of it. Three
  // renders of ONE frame — no sim advance between them.
  // The LEVER matters more than the probe here. Comparing the shop screen with
  // any other screen proves nothing: the shop paints a full-field scrim, so
  // every pixel on the field differs whether or not the suppressed layer drew
  // — that comparison passes with the suppression deleted. Each leg instead
  // moves something ONLY the suppressed layer answers to, and asserts the
  // screen does not flinch: MINIMAP toggles the corner map and nothing else,
  // and E.hull moves the status stack's pip row and nothing else in its column
  // (the shop header's own pips are centred, far outside the probe). Both legs
  // are two-sided against the cleared beat one state earlier, where the very
  // same lever must move the very same pixels.
  const ringMapWas = t.minimapInfo().on;
  const mm = t.minimapInfo();
  const stackCol = () => ringRegion(4, 8, 60, 56);  // WAVE · CLEAR, the pips, XP, FOES
  const mapCol = () => ringRegion(t.FW - mm.W - mm.M, mm.M, mm.W, 12); // the map's own top band
  const shopWas = enc.state().state;
  const hullWas = enc.E.hull;
  const underState = (st, fn) => { enc.E.state = st; const v = fn(); enc.E.state = shopWas; return v; };
  const mapLever = () => { // true = the toggle moved nothing = the map is down
    t.setMinimap(true);
    liveRender();
    const on = mapCol();
    t.setMinimap(false);
    liveRender();
    return on === mapCol();
  };
  const stackLever = () => { // true = the pips moved nothing = the stack is down
    enc.E.hull = enc.E.hullMax;
    liveRender();
    const full = stackCol();
    enc.E.hull = 1;
    liveRender();
    return full === stackCol();
  };
  const mapDownShop = underState("shop", mapLever);
  const mapDownClear = underState("cleared", mapLever);
  const stackDownShop = underState("shop", stackLever);
  const stackDownClear = underState("cleared", stackLever);
  enc.E.hull = hullWas;
  t.setMinimap(ringMapWas);
  liveRender();
  ok("the shop screen stands the status stack down instead of printing it twice",
    stackDownShop === true && stackDownClear === false,
    "shopInert=" + stackDownShop + " clearedInert=" + stackDownClear);
  ok("the shop screen stands the corner map down instead of scrimming over it",
    mapDownShop === true && mapDownClear === false,
    "shopInert=" + mapDownShop + " clearedInert=" + mapDownClear);
  ok("hudSuppressed answers for the whole visit, and for the art on its own",
    liveVal(() => window.Encounter.hudSuppressed()) === true &&
    window.Encounter.hudSuppressed() === false); // paused, the pause menu owns it
  // the art is DECORATION and never a hit target: it lands over a band of the
  // grid, and a click into that band still buys the card underneath it
  enc.addXp(64); // fund the click-through before the row is chosen, so the
                 // finder can insist on a row that would actually sell
  const underIdx = enc.shopLayout().cards.findIndex((c) => {
    const info = enc.shopInfo()[c.i];
    return c.i !== ringIdx && !info.maxed && info.available &&
      c.x + c.w / 2 > rc.x && c.x + c.w / 2 < rc.x + rc.w &&
      c.y + c.h / 2 > rc.y && c.y + c.h / 2 < rc.y + rc.h;
  });
  ok("the art covers a band of the grid, so there is something to click through",
    underIdx >= 0, "under=" + underIdx + " pop=" + JSON.stringify(rc));
  if (underIdx >= 0) {
    const ownedBefore = enc.state().owned[underIdx];
    clickCard(underIdx);
    ok("a click lands on the card under the art, not on the art",
      enc.state().owned[underIdx] === ownedBefore + 1,
      "before=" + ownedBefore + " after=" + enc.state().owned[underIdx]);
  }
  liveMove(4, 4); // off every card — the field's top-left corner
  ok("the art drops the moment the pointer leaves the card",
    enc.state().shopHover === -1 &&
    liveVal(() => window.Encounter.ringCardShown()) === false);
  clickNext();
  s = enc.state();
  ok("the art is never modal — NEXT WAVE still deals the next wave",
    s.state === "warning" && s.wave === 2 && s.waveTick === 0,
    "state=" + s.state + " wave=" + s.wave);
  enc.E.state = "cleared";
  enc.openShop();
  ok("the next shop opens clean — no hover, no art, and the unlock kept",
    enc.state().shopHover === -1 && enc.state().mods.keyThrust === true);

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
    enc.state().shopHover === -1 && thrustRelocked === 0,
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
  // the sixth card sells through the real pointer path, click and all
  enc.restart();
  enc.advance(1);
  enc.E.state = "cleared";
  enc.openShop();
  enc.addXp(8);
  clickCard(blastIdx);
  s = enc.state();
  ok("a click on the sixth card buys the sixth row and the shop stays open",
    s.mods.blast === 1 && s.owned[blastIdx] === 1 && s.xp === 0 && s.state === "shop",
    "rank=" + s.mods.blast + " xp=" + s.xp + " state=" + s.state);
  // The grid itself: every card and the button land wholly on the field, no
  // two cards overlap, and the detail line and the button sit clear below the
  // last row. This is the check that fails the day a seventh row is appended —
  // three columns of two rows is what 512 × 342 holds.
  const lay = enc.shopLayout();
  const onField = lay.cards.every((c) => c.x >= 0 && c.y >= 0 && c.x + c.w <= t.FW && c.y + c.h <= t.FH);
  const gridBottom = Math.max(...lay.cards.map((c) => c.y + c.h));
  let overlap = false;
  for (let a = 0; a < lay.cards.length; a++) {
    for (let b = a + 1; b < lay.cards.length; b++) {
      const p = lay.cards[a], q = lay.cards[b];
      if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) overlap = true;
    }
  }
  ok("six cards, the detail line and the button all fit the field without overlapping",
    lay.cards.length === 6 && lay.rows === 2 && onField && !overlap &&
    lay.titleY < lay.grid.y && lay.detailY > gridBottom &&
    lay.btn.y > lay.detailY && lay.btn.y + lay.btn.h < t.FH &&
    lay.btn.x >= 0 && lay.btn.x + lay.btn.w <= t.FW && lay.noteY <= t.FH,
    JSON.stringify({ rows: lay.rows, gridBottom, detailY: lay.detailY, btn: lay.btn,
                     noteY: lay.noteY, onField, overlap, FH: t.FH }));
  // ...and the hit test agrees with the draw for every one of the six, corner
  // to corner: a card's own rect hits it, and one pixel outside does not
  const hitAgrees = liveVal(() => lay.cards.every((c) => {
    enc.shopHover(c.x + c.w / 2, c.y + c.h / 2);
    if (enc.state().shopHover !== c.i) return false;
    enc.shopHover(c.x + 0.5, c.y + 0.5);            // the top-left pixel is inside
    if (enc.state().shopHover !== c.i) return false;
    enc.shopHover(c.x + c.w - 0.5, c.y + c.h - 0.5); // ...and so is the bottom-right
    if (enc.state().shopHover !== c.i) return false;
    enc.shopHover(c.x - 1, c.y + c.h / 2);           // one pixel left of it is not
    return enc.state().shopHover !== c.i;
  }));
  ok("the hit test resolves every card to its own rect and nothing else", hitAgrees);
  const btnHit = liveVal(() => {
    enc.shopHover(lay.btn.x + lay.btn.w / 2, lay.btn.y + lay.btn.h / 2);
    const on = enc.state().shopBtn === true && enc.state().shopHover === -1;
    enc.shopHover(lay.btn.x + lay.btn.w / 2, lay.btn.y - 2);
    return on && enc.state().shopBtn === false;
  });
  ok("the NEXT WAVE button hit-tests to its own rect and no further", btnHit);
  // shopPopupRect picks the band with the most room, so a top-row card sends
  // the art DOWN and a bottom-row card sends it UP. Only one row carries art
  // today and it is a bottom-row card, so the other branch would otherwise
  // ship untested — check every card, and check both branches were taken.
  const popRects = lay.cards.map((c) => ({ c, p: enc.shopPopupRect(c.i) }));
  const popClear = popRects.every(({ c, p }) =>
    p.x >= 0 && p.y >= 0 && p.x + p.w <= t.FW && p.y + p.h <= t.FH &&
    (p.y + p.h <= c.y || p.y >= c.y + c.h));
  const popBothWays = popRects.some(({ c, p }) => p.y + p.h <= c.y) &&
                      popRects.some(({ c, p }) => p.y >= c.y + c.h);
  ok("every row's hover art lands on the field and clear of its own card",
    popClear && popBothWays,
    JSON.stringify({ clear: popClear, bothWays: popBothWays,
      rects: popRects.map(({ c, p }) => [c.i, p.y, p.y + p.h, c.y, c.y + c.h]) }));
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

  // ---- W. the harrier: the standoff carrier and its honest lock ----
  // The roster's RANGE axis, and the first body that can reach the player from
  // outside the viewport. Every leg stages through the real spawnEnemy hook and
  // then drives WHOLE ticks, so the movement, the lock and the launch are the
  // production ones; nothing here re-derives a bearing the sim already computes.
  const HAR = ECFG.harrier;
  const MIS = ECFG.missile;
  const ANV = ECFG.anvil;
  const HSK = ECFG.husk;
  // the wrapped gap between two bearings — the suite's own yardstick for angles
  // it reads back off the sim, never a copy of the file's angDiff
  const angGap = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  // the staging the five roster sections share: a reset field, one tick out of
  // idle, and wave 1's dart schedule dropped — a 400-tick observation of one
  // body must not be joined by a pack of lances at tick 126. restart() re-deals
  // E.groups from waveGroups(), so nothing here leaks past the section.
  const bare = () => {
    enc.reset();
    enc.advance(1);
    enc.E.groups.length = 0;
    enc.E.hull = 99; // observation, not survival: a lance must not end a leg early
  };
  // walk the REAL wave transitions up to wave w (cleared → shop → continue),
  // because no hook deals a wave directly and the per-wave scaling is exactly
  // what the late-wave legs are about
  const jumpTo = (w) => {
    enc.reset();
    while (enc.state().wave < w) { enc.E.state = "cleared"; enc.openShop(); enc.continueFromShop(); }
    enc.advance(1);
    enc.E.groups.length = 0;
    enc.E.hull = 99;
  };
  t.setFxInt(1); // these sections read burst positions and kinds; the restore
                 // tail below puts the page's own intensity back
  t.G.leftHeld = false; // no autofire bullet may wander into a staged shot

  bare();
  enc.spawnEnemy(ship().x + 250, ship().y, 0, "harrier");
  const harBody = enc.E.enemies[0];
  ok("a spawned harrier carries its stamped type and stats",
    harBody.type === "harrier" && harBody.r === HAR.r && harBody.hp === HAR.hp &&
    harBody.orbDrop === HAR.orbDrop && harBody.stats.engage === HAR.engage && harBody.mode === "seek",
    "type=" + harBody.type + " hp=" + harBody.hp + " engage=" + harBody.stats.engage);
  // the requirement in one check: three rested bodies at the same 265 px —
  // past the charger's 260 engage, inside the harrier's 270 — and only the
  // carrier can do anything about it from there
  bare();
  enc.spawnEnemy(ship().x + 265, ship().y, 0, "harrier");
  enc.spawnEnemy(ship().x - 265, ship().y, 0, "charger");
  enc.spawnEnemy(ship().x, ship().y + 265, 0, "dart");
  for (const e of enc.E.enemies) e.cd = 0; // every one of them rested and in the open
  enc.advance(1);
  const harReach = {};
  for (const e of enc.E.enemies) harReach[e.type] = e.mode;
  ok("at 265 px only the harrier can reach the player at all",
    harReach.harrier === "lockon" && harReach.charger === "seek" && harReach.dart === "seek",
    JSON.stringify(harReach));
  // the lock is honest: it latches at ENTRY, so the break the telegraph buys
  // actually beats it
  bare();
  enc.spawnEnemy(ship().x + 250, ship().y, 0, "harrier");
  const harLock = enc.E.enemies[0];
  harLock.cd = 0;
  enc.advance(1); // the lock opens on the live bearing...
  const harLockA = harLock.lockA;
  const harLockMode = harLock.mode;
  ship().y += 260;                 // ...and the player breaks laterally while the body plants
  harLock.face = harLockA + 1.2;   // ...and the hull is even turned away under it, so a
                                   // launch that read the LIVE facing instead of the
                                   // latched angle cannot come out on the same bearing
  enc.advance(HAR.lockon);
  const harShot = enc.E.missiles[0];
  const harHeading = harShot ? Math.atan2(harShot.vy, harShot.vx) : 0;
  const harLive = harShot ? Math.atan2(ship().y - harLock.y, ship().x - harLock.x) : 0;
  ok("the lock latches its bearing — a player who breaks mid-lock is missed",
    harLockMode === "lockon" && !!harShot && angGap(harHeading, harLockA) < 1e-9 &&
    angGap(harHeading, harLive) > 0.5,
    "heading=" + harHeading.toFixed(4) + " locked=" + harLockA.toFixed(4) + " live=" + harLive.toFixed(4));
  ok("exactly one missile leaves per lock, and the body goes back to seek owing its cadence",
    enc.E.missiles.length === 1 && harLock.mode === "seek" && harLock.cd === harLock.stats.cooldown,
    "missiles=" + enc.E.missiles.length + " mode=" + harLock.mode + " cd=" + harLock.cd);
  ok("a launched missile leaves the rail clear of its launcher's own hull",
    Math.hypot(harShot.x - harLock.x, harShot.y - harLock.y) > harLock.r + harShot.r,
    "off=" + Math.hypot(harShot.x - harLock.x, harShot.y - harLock.y).toFixed(2));
  // the plant is what makes the telegraph readable — a body still coasting
  // through its own lock would drag the launch point off the drawn lane
  bare();
  enc.spawnEnemy(ship().x + 250, ship().y, 0, "harrier");
  const harPlant = enc.E.enemies[0];
  harPlant.cd = 0;
  enc.advance(1);
  harPlant.vx = 2; // hand it real speed mid-lock
  harPlant.vy = 0;
  enc.advance(10);
  ok("a locking harrier sinks to a stop instead of coasting through its own telegraph",
    harPlant.mode === "lockon" && Math.hypot(harPlant.vx, harPlant.vy) < 1,
    "mode=" + harPlant.mode + " speed=" + Math.hypot(harPlant.vx, harPlant.vy).toFixed(3));
  // the cadence: two launches are a cooldown plus a lock apart, never less
  bare();
  enc.spawnEnemy(ship().x + 250, ship().y, 0, "harrier");
  const harPace = enc.E.enemies[0];
  harPace.cd = 0;
  enc.E.invuln = 9999; // the player is not the subject here — the missiles that
                       // arrive must not end the run mid-measurement
  const harFires = [];
  let harPrevMode = harPace.mode;
  for (let k = 1; k <= 480 && harFires.length < 2; k++) {
    enc.advance(1);
    if (harPrevMode === "lockon" && harPace.mode === "seek") harFires.push(k);
    harPrevMode = harPace.mode;
  }
  const harGap = harFires.length === 2 ? harFires[1] - harFires[0] : -1;
  const harWant = harPace.stats.cooldown + HAR.lockon;
  ok("the cooldown paces the next lock: two launches are a full cadence apart",
    harGap >= harWant && harGap <= harWant + 2,
    "gap=" + harGap + " cooldown+lock=" + harWant);
  // the archetype itself: crowding it makes it run. The retreat has to beat the
  // APPROACH cap as well as the approach speed — a shared clamp taken off
  // maxSpeed alone would silently delete the whole kite and still pass "it moves".
  const harGait = (d) => {
    bare();
    enc.spawnEnemy(ship().x + d, ship().y, 0, "harrier");
    const h = enc.E.enemies[0];
    h.cd = 9999; // movement only — no lock, no launch
    enc.advance(40);
    return Math.hypot(h.vx, h.vy);
  };
  const harIn = harGait(500);
  const harOut = harGait(120);
  const harStats = enc.statsFor(1).harrier;
  ok("a crowded harrier backs off faster than it ever closes, and faster than its own approach cap",
    harOut > harIn && harOut > harStats.maxSpeed && harIn <= harStats.maxSpeed + 1e-9,
    "approach=" + harIn.toFixed(3) + " retreat=" + harOut.toFixed(3) + " maxSpeed=" + harStats.maxSpeed);

  // ---- X. the seeker missile: reach, minor homing, an honest fuse ----
  // A projectile family the encounter owns outright. Every leg drives the real
  // constructor through the hook, so a check can never build a missile the sim
  // would not have made.
  ok("a missile's fuse carries it clear across the field",
    MIS.life * MIS.speed > t.FW, "reach=" + MIS.life * MIS.speed + " FW=" + t.FW);
  // the ±π seam is where wrap bugs live, so the fuzz walks every bearing —
  // exactly ahead (heading straight at the ship) and exactly behind included
  let misWorst = 0;
  let misSpeedErr = 0;
  let misLost = "";
  for (let k = 0; k < 24; k++) {
    bare();
    const m = enc.spawnMissile(ship().x + 220, ship().y, (k * 2 * Math.PI) / 24);
    m.age = MIS.arm; // armed, and well clear of the fuse's decay window
    const h0 = Math.atan2(m.vy, m.vx);
    enc.advance(1);
    misWorst = Math.max(misWorst, angGap(Math.atan2(m.vy, m.vx), h0));
    misSpeedErr = Math.max(misSpeedErr, Math.abs(Math.hypot(m.vx, m.vy) - MIS.speed));
    if (enc.E.missiles.length !== 1) misLost += "gone@" + k + " ";
  }
  ok("a missile never turns faster than its live limit, at any bearing including the ±π seam",
    misWorst <= MIS.turn + 1e-9 && !misLost,
    "worst=" + misWorst.toFixed(8) + " limit=" + MIS.turn + " " + misLost);
  ok("homing changes heading only — the missile's speed is preserved exactly",
    misSpeedErr < 1e-9, "err=" + misSpeedErr);
  // ballistic while it arms, and bending the moment it is armed
  bare();
  const misArm = enc.spawnMissile(ship().x + 220, ship().y, -Math.PI / 2); // hard across the bearing
  const misArmH0 = Math.atan2(misArm.vy, misArm.vx);
  enc.advance(MIS.arm);
  const misArmH1 = Math.atan2(misArm.vy, misArm.vx);
  enc.advance(1);
  const misArmH2 = Math.atan2(misArm.vy, misArm.vx);
  ok("a missile flies straight while it arms, and bends on the very next tick",
    angGap(misArmH1, misArmH0) === 0 && angGap(misArmH2, misArmH1) > 0,
    "armed=" + angGap(misArmH1, misArmH0) + " after=" + angGap(misArmH2, misArmH1).toFixed(6));
  // the live turn limit, MEASURED: a missile aimed hard across the player's
  // bearing has its steering clamped every tick, so the heading change it
  // actually makes is the limit itself
  const misBend = (age) => {
    bare();
    const m = enc.spawnMissile(ship().x + 220, ship().y, -Math.PI / 2);
    m.age = age;
    const h0 = Math.atan2(m.vy, m.vx);
    enc.advance(1);
    return angGap(Math.atan2(m.vy, m.vx), h0);
  };
  const misFull = misBend(MIS.arm);
  const misFuse = [];
  for (let a = MIS.life - MIS.decay; a < MIS.life; a += 5) misFuse.push(misBend(a));
  let misFade = true;
  for (let i = 1; i < misFuse.length; i++) if (misFuse[i] >= misFuse[i - 1]) misFade = false;
  ok("the steering fades over the fuse's last ticks and is spent by the time it expires",
    misBend(MIS.arm - 1) === 0 && misFull > 0 && Math.abs(misFuse[0] - misFull) < 1e-9 && misFade &&
    misBend(MIS.life - 1) <= MIS.turn / MIS.decay + 1e-12,
    "full=" + misFull.toFixed(6) + " fuse=" + JSON.stringify(misFuse.map((v) => +v.toFixed(5))));
  // The pair the whole speed/turn choice was made for, driven through the REAL
  // launcher, at every range the harrier actually fires from: a committed
  // lateral break beats the homing, and standing still never does.
  //
  // The staging matters more than the assertion here. A hand-placed, pre-armed
  // missile at ONE distance certifies the FUSE rather than the homing — past
  // about 350 px the life runs out before a 3×-speed pursuer converges, so that
  // check passes at any turn rate, including rates at which the break is a
  // guaranteed hit at every range the harrier really uses. The band below is
  // the harrier's own: it holds prefer ± band and fires at engage.
  const misBreak = (range, dodge) => {
    bare();
    enc.E.invuln = 0;
    enc.spawnEnemy(ship().x + range, ship().y, 0, "harrier");
    const h = enc.E.enemies[0];
    h.cd = 0; // rested and in range — the next tick opens the lock
    let fired = false;
    for (let k = 0; k < HAR.lockon + MIS.life + 8; k++) {
      // the break starts when the LOCK does, which is when a player who reads
      // the telegraph would start it
      if (dodge && (fired || h.mode === "lockon")) ship().y -= enc.tunables().VMAX;
      enc.advance(1);
      if (enc.state().missiles) fired = true;
      else if (fired) break; // the round resolved, one way or the other
    }
    return { taken: enc.state().hitsTaken, fired };
  };
  const misBand = [HAR.prefer - HAR.band, HAR.prefer, HAR.engage];
  const misParked = misBand.map((d) => misBreak(d, false));
  const misDodged = misBand.map((d) => misBreak(d, true));
  ok("every launch in the harrier's own band lands on a player who stands still",
    misParked.every((r) => r.fired && r.taken === 1),
    JSON.stringify(misBand.map((d, i) => d + ":" + misParked[i].taken)));
  ok("a committed lateral break beats the homing at every one of those ranges",
    misDodged.every((r) => r.fired && r.taken === 0),
    JSON.stringify(misBand.map((d, i) => d + ":" + misDodged[i].taken)));
  // one hull, once, and the missile is spent on the hull it found
  bare();
  enc.E.invuln = 0;
  const misHull0 = enc.state().hull;
  enc.spawnMissile(ship().x + 20, ship().y, Math.PI);
  enc.advance(4);
  const misHit = enc.state();
  enc.advance(20);
  ok("a missile detonates on the hull for exactly one hull, exactly once",
    misHit.hitsTaken === 1 && misHit.hull === misHull0 - 1 && misHit.missiles === 0 &&
    enc.state().hitsTaken === 1,
    "taken=" + misHit.hitsTaken + " hull=" + misHit.hull + " live=" + misHit.missiles);
  bare();
  enc.E.invuln = 500; // deep post-hit grace
  enc.spawnMissile(ship().x + 20, ship().y, Math.PI);
  enc.advance(4);
  ok("an i-framed player still eats the missile — the grace is the player's, never the ordnance's",
    enc.state().hitsTaken === 0 && enc.state().missiles === 0,
    "taken=" + enc.state().hitsTaken + " live=" + enc.state().missiles);
  // both motions are swept, exactly as the lance and the dash sweep theirs: the
  // control leg parks shipPrev on the ship, so a plain-distance implementation
  // cannot pass both halves
  const misSweep = (swept) => {
    bare();
    enc.E.invuln = 0;
    const X = ship().x;
    const Y = ship().y;
    enc.spawnMissile(X, Y, Math.PI / 2); // parked across the ship's lane
    ship().x = X + 40;                   // ...with the ship 40 px clear of it
    enc.E.shipPrev = swept ? { x: X - 40, y: Y } : { x: X + 40, y: Y };
    enc.advance(1);
    return { taken: enc.state().hitsTaken, live: enc.state().missiles };
  };
  const misStill = misSweep(false);
  const misCross = misSweep(true);
  ok("a fast ship cannot cross a missile's path untouched",
    misStill.taken === 0 && misStill.live === 1 && misCross.taken === 1 && misCross.live === 0,
    "still=" + JSON.stringify(misStill) + " swept=" + JSON.stringify(misCross));
  // shootable — and a shootdown is not a kill: no orb, no XP, no entry in kills
  bare();
  const misXp0 = enc.state().xp;
  enc.spawnMissile(ship().x + 150, ship().y, 0);
  t.G.bullets.push({ x: ship().x, y: ship().y, px: ship().x, py: ship().y, vx: 40, vy: 0,
    r: 2.2, dmg: 1, owner: "player", dead: false, spent: false, ttl: 60 });
  enc.advance(8);
  s = enc.state();
  ok("a player bullet shoots a missile down, and the shootdown is not a kill",
    s.missiles === 0 && s.missilesShot === 1 && t.G.bullets.length === 0 &&
    s.kills === 0 && s.hitsDealt === 0 && s.orbs === 0 && s.xp === misXp0,
    "shot=" + s.missilesShot + " kills=" + s.kills + " orbs=" + s.orbs + " bullets=" + t.G.bullets.length);
  // ONE first-along-the-path pass over bodies AND ordnance: the nearer thing
  // always wins and the bullet is never billed twice. Two legs, the same two
  // targets swapped, so neither family can be quietly resolved first.
  const misFirst = (ordnanceNearer) => {
    bare();
    const X = ship().x;
    const Y = ship().y;
    enc.spawnEnemy(X + (ordnanceNearer ? 165 : 150), Y);
    const body = enc.E.enemies[0];
    enc.spawnMissile(X + (ordnanceNearer ? 150 : 165), Y, Math.PI); // closing, so both
                                                                    // sit on the bullet's line
    t.G.bullets.push({ x: X + 120, y: Y, px: X + 120, py: Y, vx: 40, vy: 0,
      r: 2.2, dmg: 1, owner: "player", dead: false, spent: false, ttl: 60 });
    enc.advance(1);
    return { shot: enc.state().missilesShot, live: enc.state().missiles,
      dealt: enc.state().hitsDealt, drop: ECFG.enemy.hp - body.hp };
  };
  const misNear = misFirst(true);
  const misFar = misFirst(false);
  ok("a bullet stops on whichever comes first — body or ordnance — and pays only that one",
    misNear.shot === 1 && misNear.live === 0 && misNear.dealt === 0 && misNear.drop === 0 &&
    misFar.shot === 0 && misFar.live === 1 && misFar.dealt === 1 && misFar.drop === 1,
    "ordnance-first=" + JSON.stringify(misNear) + " body-first=" + JSON.stringify(misFar));
  // a missile that leaves the world dies ON the wall it hit, not wherever the
  // overshoot landed
  bare();
  enc.spawnMissile(t.WW - 10, ship().y - 400, 0);
  enc.advance(2);
  const misWallB = t.fx.bursts[t.fx.bursts.length - 1];
  ok("a missile dies at the world wall, on the wall plane",
    enc.state().missiles === 0 && !!misWallB && misWallB.x === t.WW,
    "live=" + enc.state().missiles + " burst=" + (misWallB ? misWallB.kind + "@" + misWallB.x : "none"));
  // the fuse running out: a dodged missile always confirms itself, and hurts
  // nothing on the way out
  bare();
  const misFizz = enc.spawnMissile(ship().x, ship().y - 1400, 0); // far enough that the
  // homing cannot bring 540 px of flight back to the ship before the fuse ends
  enc.advance(MIS.life - 1);
  const misAlive = enc.state().missiles;
  enc.advance(1);
  s = enc.state();
  const misFizzB = t.fx.bursts[t.fx.bursts.length - 1];
  ok("a fuse runs out where the missile flew, with a burst and no damage",
    misAlive === 1 && s.missiles === 0 && s.hitsTaken === 0 && !!misFizzB &&
    Math.abs(misFizzB.x - misFizz.x) < 1e-9 && Math.abs(misFizzB.y - misFizz.y) < 1e-9,
    "aliveAt=" + misAlive + " taken=" + s.hitsTaken);
  // the cap is a guard, not a mechanic — but a guard has to actually refuse
  bare();
  const misMade = [];
  for (let k = 0; k < MIS.max + 3; k++) misMade.push(enc.spawnMissile(ship().x, ship().y - 1400, 0));
  ok("the live-ordnance cap refuses the launch above it instead of queueing it",
    misMade.slice(0, MIS.max).every((m) => !!m) && misMade.slice(MIS.max).every((m) => m === null) &&
    enc.state().missiles === MIS.max,
    "made=" + misMade.filter(Boolean).length + " live=" + enc.state().missiles);
  enc.spawnEnemy(ship().x + 250, ship().y, 0, "harrier");
  const misCapped = enc.E.enemies[0];
  misCapped.mode = "lockon"; // staged one tick from launching into a full sky
  misCapped.t = 1;
  misCapped.lockA = Math.PI;
  enc.advance(1);
  ok("a harrier refused by the cap still pays its cadence, so it cannot spin the lock",
    misCapped.mode === "seek" && misCapped.cd === misCapped.stats.cooldown &&
    enc.state().missiles === MIS.max,
    "mode=" + misCapped.mode + " cd=" + misCapped.cd + " live=" + enc.state().missiles);
  // the splash is enemies-only: a blast that swept ordnance out of the air would
  // quietly delete the harrier's whole threat. A witness body sits at the SAME
  // offset from the impact, so "the blast never reached that far" cannot pass.
  bare();
  blastRanks(3);
  const misBlastR = enc.blastRadius();
  const misOff = misBlastR - 8;
  enc.spawnEnemy(ship().x + 150, ship().y);
  const misTarget = enc.E.enemies[0];
  const misIx = misTarget.x - (misTarget.r + 2.2); // the entry point on the inflated body
  enc.spawnEnemy(misIx, ship().y - misOff);
  const misWitness = enc.E.enemies[1];
  const misSafe = enc.spawnMissile(misIx, ship().y + misOff, -Math.PI / 2); // ...flying INTO the splash
  t.G.bullets.push({ x: misTarget.x - 40, y: ship().y, px: misTarget.x - 40, py: ship().y,
    vx: 40, vy: 0, r: 2.2, dmg: 1, owner: "player", dead: false, spent: false, ttl: 60 });
  enc.advance(1);
  ok("the splash never sweeps ordnance out of the air, at any rank",
    enc.state().hitsDealt === 1 && misWitness.hp === ECFG.enemy.hp - 1 &&
    enc.state().missiles === 1 && enc.state().missilesShot === 0 &&
    Math.hypot(misSafe.x - misIx, misSafe.y - ship().y) < misBlastR,
    "witness=" + misWitness.hp + " live=" + enc.state().missiles +
    " missileAt=" + Math.hypot(misSafe.x - misIx, misSafe.y - ship().y).toFixed(1) + " R=" + misBlastR);
  // a dead harrier's last missile is still the wave: the banner and its orb
  // sweep must never run under live ordnance
  bare();
  enc.spawnEnemy(ship().x + 200, ship().y);
  enc.advance(1); // the landing turns the wave active
  enc.spawnMissile(ship().x, ship().y - 1400, 0);
  enc.E.enemies[0].hp = 0;
  enc.advance(1);
  const misGate = enc.state();
  enc.advance(MIS.life);
  const misCleared = enc.state();
  ok("a wave cannot clear while ordnance is still in the air",
    misGate.enemies === 0 && misGate.queued === 0 && misGate.missiles === 1 &&
    misGate.state === "active" && misCleared.missiles === 0 && misCleared.state === "cleared",
    "underFire=" + misGate.state + " after=" + misCleared.state);
  // ordnance joins the chevrons: a 512×342 window on a 3072×3762 world makes an
  // unheralded off-screen seeker unfair, and a harrier firing from outside the
  // view is exactly the case that layer was built for
  bare();
  enc.spawnMissile(ship().x + 600, ship().y, 0);
  const misArrow = enc.edgeArrows();
  bare();
  enc.spawnMissile(ship().x + 120, ship().y, 0);
  const misSeen = enc.edgeArrows();
  ok("an off-screen missile earns its own edge chevron, and an on-screen one does not",
    misArrow.length === 1 && misArrow[0].type === "missile" && misSeen.length === 0,
    "off=" + JSON.stringify(misArrow.map((a) => a.type)) + " on=" + misSeen.length);
  // ordnance lives inside encStep, so every screen that freezes the sim freezes
  // it too — a shop visit must not be a free 90 ticks of flight
  bare();
  const misHeld = enc.spawnMissile(ship().x, ship().y - 1400, 0);
  enc.E.state = "cleared";
  enc.openShop();
  const misHeldX = misHeld.x;
  const misHeldY = misHeld.y;
  enc.advance(40);
  ok("a frozen shop holds the ordnance mid-flight, like everything else in the sim",
    enc.frozen() && misHeld.x === misHeldX && misHeld.y === misHeldY && enc.state().missiles === 1,
    "frozen=" + enc.frozen() + " moved=" + (misHeld.x !== misHeldX || misHeld.y !== misHeldY));
  // and none of it survives a restart, counter included
  bare();
  enc.spawnMissile(ship().x + 150, ship().y, 0);
  t.G.bullets.push({ x: ship().x, y: ship().y, px: ship().x, py: ship().y, vx: 40, vy: 0,
    r: 2.2, dmg: 1, owner: "player", dead: false, spent: false, ttl: 60 });
  enc.advance(8);
  const misShotCount = enc.state().missilesShot;
  enc.spawnMissile(ship().x + 200, ship().y, 0);
  const misBefore = enc.state().missiles;
  enc.restart();
  s = enc.state();
  ok("a restart takes the ordnance and its counter with it",
    misShotCount === 1 && misBefore === 1 && s.missiles === 0 && s.missilesShot === 0,
    "before=" + misBefore + "/" + misShotCount + " after=" + s.missiles + "/" + s.missilesShot);

  // ---- Y. the anvil: a shield you have to walk around ----
  // The roster's FACING axis. Every shield leg fires ONE bullet that resolves on
  // the tick it lands, with the anvil's facing handed in as an offset from the
  // bearing that bullet arrives on — so both sides of the arc boundary are a
  // single number apart and neither is a restatement of the constant.
  const anvShot = (faceA, ranks) => {
    bare();
    if (ranks) blastRanks(ranks);
    enc.spawnEnemy(ship().x + 150, ship().y, 0, "anvil");
    const a = enc.E.enemies[0];
    a.face = faceA;
    const hp0 = a.hp;
    t.G.bullets.push({ x: a.x - 40, y: a.y, px: a.x - 40, py: a.y, vx: 40, vy: 0,
      r: 2.2, dmg: 1, owner: "player", dead: false, spent: false, ttl: 60 });
    enc.advance(1);
    return { drop: hp0 - a.hp, dealt: enc.state().hitsDealt,
      flying: t.G.bullets.filter((b) => !b.dead).length,
      fx: t.fx.bursts.map((b) => b.kind).join(",") };
  };
  const anvFront = anvShot(Math.PI);
  const anvBack = anvShot(0);
  ok("a bullet into the frontal arc deals no damage and is consumed anyway",
    anvFront.drop === 0 && anvFront.dealt === 0 && anvFront.flying === 0,
    JSON.stringify(anvFront));
  ok("a blocked bullet sparks as an inert thing struck, not as a hit",
    anvFront.fx === "wall" && anvBack.fx === "enemy", "blocked=" + anvFront.fx + " landed=" + anvBack.fx);
  ok("the same bullet from behind the wedge deals its damage",
    anvBack.drop === 1 && anvBack.dealt === 1, JSON.stringify(anvBack));
  // both sides of the arc, and both edges of it. The margin is wide enough to
  // swallow the one tick of turn the body takes before the bullet resolves.
  const anvEdge = [anvShot(Math.PI - ANV.arc + 0.05), anvShot(Math.PI - ANV.arc - 0.05),
                   anvShot(Math.PI + ANV.arc - 0.05), anvShot(Math.PI + ANV.arc + 0.05)];
  ok("the arc boundary holds on both edges: just inside is eaten, just outside bites",
    anvEdge[0].drop === 0 && anvEdge[1].drop === 1 && anvEdge[2].drop === 0 && anvEdge[3].drop === 1,
    JSON.stringify(anvEdge.map((r) => r.drop)));
  // The payoff the shield was priced against, and its exact limit. A round the
  // SHIELD stopped is excluded from its own splash at every rank — otherwise an
  // 8 XP purchase would deal full damage through the shield on every blocked
  // shot (the impact point sits 13 px off the body's centre and BLASTR alone is
  // 18) and the archetype would evaporate at rank 1. The splash still applies
  // at a POINT, so a round that terminates on anything ELSE nearby washes over
  // the shield — which is how BLAST CHARGE answers this body honestly.
  const anvBlast = anvShot(Math.PI, 3);
  ok("the shield holds at every blast rank: a stopped round never splashes the body that stopped it",
    anvBlast.dealt === 0 && anvBlast.drop === 0, JSON.stringify(anvBlast));
  bare();
  blastRanks(3);
  enc.spawnEnemy(ship().x + 150, ship().y, 0, "anvil");
  const anvNear = enc.E.enemies[0];
  anvNear.face = Math.PI; // shield square to the incoming round
  const anvHp0 = anvNear.hp;
  enc.spawnEnemy(anvNear.x - 30, anvNear.y, 0, "dart"); // a neighbour to stop it instead
  t.G.bullets.push({ x: anvNear.x - 60, y: anvNear.y, px: anvNear.x - 60, py: anvNear.y,
    vx: 40, vy: 0, r: 2.2, dmg: 1, owner: "player", dead: false, spent: false, ttl: 60 });
  enc.advance(1);
  ok("a round that stops on a NEIGHBOUR still washes its splash over the shield",
    anvHp0 - anvNear.hp === 1, "drop=" + (anvHp0 - anvNear.hp) +
    " blastR=" + enc.blastRadius());
  // the facing is the skill check: it TURNS, at its own rate, and never snaps
  bare();
  enc.spawnEnemy(ship().x + 150, ship().y, 0, "anvil");
  const anvTurn = enc.E.enemies[0];
  anvTurn.face = 0; // dealt looking away, so the whole sweep is observable
  const anvSteps = [];
  let anvPrev = anvTurn.face;
  for (let k = 0; k < 40; k++) {
    enc.advance(1);
    anvSteps.push(angGap(anvTurn.face, anvPrev));
    anvPrev = anvTurn.face;
  }
  const anvAim = Math.atan2(ship().y - anvTurn.y, ship().x - anvTurn.x);
  ok("the anvil turns toward the player at its own rate and no faster",
    Math.max.apply(null, anvSteps) <= ANV.turnRate + 1e-12 && anvSteps.every((d) => d > 0) &&
    angGap(anvTurn.face, anvAim) > 0.5,
    "worst=" + Math.max.apply(null, anvSteps) + " rate=" + ANV.turnRate +
    " gapLeft=" + angGap(anvTurn.face, anvAim).toFixed(3));
  bare();
  enc.spawnEnemy(ship().x + 150, ship().y);
  const anvDart = enc.E.enemies[0];
  anvDart.face = 0;
  enc.advance(1);
  ok("every other body still snaps its facing — only the shielded one has to turn",
    angGap(anvDart.face, Math.atan2(ship().y - anvDart.y, ship().x - anvDart.x)) < 1e-9,
    "gap=" + angGap(anvDart.face, Math.atan2(ship().y - anvDart.y, ship().x - anvDart.x)));
  // contact is NOT blocked: this is a bullet shield, and melee stays a tactic
  bare();
  const anvRam = ctPin(10, 0, "anvil");
  anvRam.face = Math.PI; // shield straight at the ship — a bullet here would bounce
  const anvRamHp = anvRam.hp;
  enc.E.invuln = 0;
  enc.advance(1);
  s = enc.state();
  ok("ramming the shield still bites both ways — contact is not blocked",
    s.hitsTaken === 1 && s.contactsDealt === 1 && anvRam.hp === anvRamHp - enc.tunables().BDMG,
    "taken=" + s.hitsTaken + " dealt=" + s.contactsDealt + " hp=" + anvRam.hp);
  // and the flank is a moving problem: walked around, it runs along its own
  // facing instead of closing
  const anvRun = (faceA) => {
    bare();
    enc.spawnEnemy(ship().x + 150, ship().y, 0, "anvil");
    const a = enc.E.enemies[0];
    a.face = faceA;
    const d0 = Math.hypot(a.x - ship().x, a.y - ship().y);
    enc.advance(30);
    return Math.hypot(a.x - ship().x, a.y - ship().y) - d0;
  };
  const anvClosing = anvRun(Math.PI);
  const anvFleeing = anvRun(0);
  ok("a flanked anvil runs forward instead of closing",
    anvClosing < -10 && anvFleeing > 5,
    "faced=" + anvClosing.toFixed(2) + " flanked=" + anvFleeing.toFixed(2));

  // ---- Z. the husk: a kill that is a decision ----
  // The roster's DEATH TIME axis: no attack but contact, and a burst the player
  // themself triggers.
  bare();
  enc.spawnEnemy(ship().x + 200, ship().y, 0, "husk");
  const hskBody = enc.E.enemies[0];
  hskBody.hp = 0;
  enc.advance(1);
  s = enc.state();
  const hskParts = enc.E.enemies.slice();
  const hskOut = hskParts.map((e) => Math.hypot(e.x - hskBody.x, e.y - hskBody.y));
  const hskFan = hskParts.map((e) => Math.atan2(e.y - hskBody.y, e.x - hskBody.x)).sort((a, b) => a - b);
  const hskSpread = hskFan.length === 3
    ? [angGap(hskFan[1], hskFan[0]), angGap(hskFan[2], hskFan[1]), angGap(hskFan[0], hskFan[2])] : [];
  ok("a killed husk leaves exactly three shards at the death point",
    s.byType.shard === 3 && s.byType.husk === 0 && s.enemies === 3 &&
    hskOut.every((d) => Math.abs(d - HSK.r * HSK.push) < 1e-9),
    "byType=" + JSON.stringify(s.byType) + " out=" + JSON.stringify(hskOut.map((d) => +d.toFixed(3))));
  ok("the three shards are dealt on an even fan and thrown outward from the corpse",
    hskSpread.every((d) => Math.abs(d - (2 * Math.PI) / 3) < 1e-9) &&
    hskParts.every((e) => Math.abs(Math.hypot(e.vx, e.vy) - HSK.kick) < 1e-9 &&
      angGap(Math.atan2(e.vy, e.vx), Math.atan2(e.y - hskBody.y, e.x - hskBody.x)) < 1e-9),
    "spread=" + JSON.stringify(hskSpread.map((d) => +d.toFixed(4))));
  for (const e of enc.E.enemies) e.hp = 0;
  enc.advance(1);
  s = enc.state();
  ok("a shard never splits again, and the husk plus its shards pay four orbs",
    s.enemies === 0 && s.kills === 4 && s.orbs === 4,
    "enemies=" + s.enemies + " kills=" + s.kills + " orbs=" + s.orbs);
  // the burst does NOT respect the spawn push-out: a husk killed in your face is
  // supposed to burst in your face
  bare();
  const hskClose = ctPin(20, 0, "husk");
  hskClose.hp = 0;
  enc.advance(1);
  const hskNear = enc.E.enemies.map((e) => Math.hypot(e.x - ship().x, e.y - ship().y));
  ok("a husk killed in your face bursts in your face — the split skips the spawn push-out",
    hskNear.length === 3 && Math.max.apply(null, hskNear) < ECFG.minPlayerDist,
    "distances=" + JSON.stringify(hskNear.map((d) => +d.toFixed(1))) + " ring=" + ECFG.minPlayerDist);
  // shards scale like every other body in hp, and deliberately not in speed —
  // the charger's dashSpeed precedent: a dodge stays fair forever
  const hskS1 = enc.statsFor(1).shard;
  const hskS9 = enc.statsFor(9).shard;
  jumpTo(9);
  enc.spawnEnemy(ship().x + 200, ship().y, 0, "husk");
  enc.E.enemies[0].hp = 0;
  enc.advance(1);
  ok("a husk that dies on wave 9 bursts into wave-9 shards: harder, never faster",
    hskS9.hp > hskS1.hp && hskS9.maxSpeed === hskS1.maxSpeed && enc.E.enemies.length === 3 &&
    enc.E.enemies.every((e) => e.hp === hskS9.hp && e.stats.maxSpeed === hskS1.maxSpeed),
    "hp1=" + hskS1.hp + " hp9=" + hskS9.hp + " speed=" + hskS9.maxSpeed);
  // the fan comes off the seeded stream, so two identical runs burst identically
  const hskBurst = () => {
    bare();
    enc.spawnEnemy(ship().x + 200, ship().y, 0, "husk");
    enc.E.enemies[0].hp = 0;
    enc.advance(1);
    return JSON.stringify(enc.E.enemies.map((e) => [+e.x.toFixed(6), +e.y.toFixed(6)]));
  };
  const hskRunA = hskBurst();
  const hskRunB = hskBurst();
  ok("the burst is dealt from the seeded stream — two identical runs split identically",
    hskRunA === hskRunB && hskRunA.length > 10, hskRunA);
  // engage 0 is no attack mode at all, at any range, however long you wait
  const hskQuiet = (type) => {
    bare();
    enc.spawnEnemy(ship().x + 150, ship().y, 0, type);
    const e = enc.E.enemies[0];
    e.hp = 999; // cadence, not death: a rammer that reaches the hull must survive the watch
    e.cd = 0;   // rested — the one state that opens an attack for every armed body
    const seen = {};
    for (let k = 0; k < 90; k++) { enc.advance(1); seen[e.mode] = 1; }
    return Object.keys(seen).join(",");
  };
  ok("the drifters and the shards have no attack mode to enter at any range",
    hskQuiet("husk") === "seek" && hskQuiet("anvil") === "seek" && hskQuiet("shard") === "seek",
    "husk=" + hskQuiet("husk") + " anvil=" + hskQuiet("anvil") + " shard=" + hskQuiet("shard"));

  // Every new archetype scales in HP and cadence and NEVER in speed, which is
  // what keeps each one's fairness claim from expiring: the harrier has to
  // flee faster than it closes at every wave (crowd it and it runs), and both
  // it and the anvil have to stay under a 2.0 px/tick ship, or a shielded body
  // you cannot outrun and cannot shoot from the front arrives at wave 10. The
  // dart and the charger still carry the roster's speed curve — asserted here
  // too, so this check cannot be satisfied by freezing everything.
  const spd = (w) => enc.statsFor(w);
  const spd1 = spd(1);
  const spd30 = spd(30);
  const vcap = enc.tunables().VMAX;
  ok("the three new archetypes get tougher with the wave but never faster",
    ["harrier", "anvil", "husk"].every((k) => spd30[k].hp > spd1[k].hp &&
      spd30[k].maxSpeed === spd1[k].maxSpeed) &&
      spd30.harrier.cooldown < spd1.harrier.cooldown &&
      spd30.dart.maxSpeed > spd1.dart.maxSpeed && spd30.charger.maxSpeed > spd1.charger.maxSpeed,
    JSON.stringify(["harrier", "anvil", "husk"].map((k) => k + " " + spd1[k].maxSpeed + "->" + spd30[k].maxSpeed +
      " hp " + spd1[k].hp + "->" + spd30[k].hp)));
  ok("the harrier still backs off faster than it closes at wave 30, and neither gait outruns the ship",
    spd30.harrier.backSpeed > spd30.harrier.maxSpeed && spd30.harrier.backSpeed < vcap &&
    spd30.anvil.maxSpeed < vcap && spd30.husk.maxSpeed < vcap,
    "harrier " + spd30.harrier.maxSpeed + "/" + spd30.harrier.backSpeed +
    " anvil " + spd30.anvil.maxSpeed + " husk " + spd30.husk.maxSpeed + " vmax " + vcap);
  // spawnEnemy resolves its type against the ROSTER, never with a bare
  // E.stats[type] read: that read walks Object.prototype, and a body stamped
  // from Object.constructor carries undefined hp and radius — NaN coordinates
  // on the next tick and a phantom kill on the one after.
  bare();
  const protoBefore = enc.state().kills;
  for (const k of ["constructor", "toString", "__proto__", "hasOwnProperty", "Husk"]) {
    enc.spawnEnemy(ship().x + 200, ship().y, 0, k);
  }
  const protoBodies = enc.E.enemies.slice();
  enc.advance(2);
  ok("an unknown type name spawns a dart, prototype keys included — never a body with no stats",
    protoBodies.length === 5 && protoBodies.every((e) => e.type === "dart" && e.hp > 0 && e.r > 0) &&
    enc.E.enemies.every((e) => Number.isFinite(e.x) && Number.isFinite(e.y)) &&
    enc.state().kills === protoBefore,
    JSON.stringify(protoBodies.map((e) => e.type + ":" + e.hp)) + " kills=" + enc.state().kills);

  // ---- AA. the generator: composition by interleave, bounded by pitch ----
  // countsFor/waveGroups stay pure functions of the wave number, so every leg
  // here is arithmetic on the real generator rather than a played wave.
  const genKeys = ["darts", "chargers", "harriers", "husks", "anvils",
                   "radarDarts", "radarHarriers", "radarChargers"];
  // radarDart is absent on purpose: it is never its own scheduled group — it
  // replaces member 0 inside a stamped dart pack, so the dart tally holds
  const genPlural = { dart: "darts", charger: "chargers", harrier: "harriers", husk: "husks", anvil: "anvils",
                      radarHarrier: "radarHarriers", radarCharger: "radarChargers" };
  const genCounts = [];
  for (let w = 1; w <= 30; w++) genCounts.push(enc.countsFor(w));
  ok("waveGroups(1) is still the hand-tuned slice, byte for byte",
    JSON.stringify(W1) === JSON.stringify([{ count: 3, type: "dart", warnAt: 36, spawnAt: 126 },
                                           { count: 2, type: "dart", warnAt: 810, spawnAt: 900 }]),
    JSON.stringify(W1));
  ok("wave 1 still deals five darts and nothing else",
    genCounts[0].darts === 5 && genKeys.slice(1).every((k) => genCounts[0][k] === 0),
    JSON.stringify(genCounts[0]));
  let genMono = true;
  let genShrank = "";
  for (let w = 1; w < 30; w++) {
    for (const k of genKeys) if (genCounts[w][k] < genCounts[w - 1][k]) { genMono = false; genShrank += k + "@" + (w + 1) + " "; }
  }
  ok("no type's count ever shrinks from one wave to the next", genMono, genShrank);
  const genDebut = (k) => genCounts.findIndex((c) => c[k] > 0) + 1;
  ok("one new idea per wave, each archetype debuting as a single body",
    genDebut("darts") === 1 && genDebut("harriers") === 2 && genDebut("chargers") === 3 &&
    genDebut("husks") === 4 && genDebut("anvils") === 5 &&
    genKeys.slice(1).every((k) => genCounts[genDebut(k) - 1][k] === 1),
    genKeys.map((k) => k + "@" + genDebut(k)).join(" "));
  // caps, asserted as caps rather than as numbers: past wave 30 nothing grows
  const gen60 = enc.countsFor(60);
  ok("every count has stopped growing by wave 30",
    genKeys.every((k) => genCounts[29][k] === gen60[k]),
    "w30=" + JSON.stringify(genCounts[29]) + " w60=" + JSON.stringify(gen60));
  const gen30s = enc.statsFor(30);
  const gen60s = enc.statsFor(60);
  ok("the harrier's cadence bottoms out, and even at the floor it never has two of its own missiles in the air",
    gen30s.harrier.cooldown === gen60s.harrier.cooldown &&
    gen30s.harrier.cooldown + HAR.lockon > MIS.life,
    "cooldown=" + gen30s.harrier.cooldown + " +lock=" + (gen30s.harrier.cooldown + HAR.lockon) +
    " life=" + MIS.life);
  // every wave deals exactly what its counts promise, group by group
  let genSum = true;
  let genOff = "";
  let genGapMin = 1e9;
  let genGapMax = -1;
  let genLast = 0;
  let genWarn = true;
  let genOpen = true;
  for (let w = 1; w <= 30; w++) {
    const gs = enc.waveGroups(w);
    const tally = {};
    for (const g of gs) tally[g.type] = (tally[g.type] || 0) + g.count;
    for (const type of Object.keys(genPlural)) {
      if ((tally[type] || 0) !== genCounts[w - 1][genPlural[type]]) { genSum = false; genOff += type + "@" + w + " "; }
    }
    // ...and nothing else: the shard is the husk's payload, never a scheduled body
    for (const type of Object.keys(tally)) if (!genPlural[type]) { genSum = false; genOff += "unscheduled:" + type + "@" + w + " "; }
    if (w === 1) continue; // wave 1 keeps its own hand-tuned pitch, checked above
    if (gs[0].spawnAt !== 126) genOpen = false;
    for (let i = 0; i < gs.length; i++) {
      if (gs[i].spawnAt - gs[i].warnAt !== 90) genWarn = false;
      if (i) {
        const gap = gs[i].spawnAt - gs[i - 1].spawnAt;
        genGapMin = Math.min(genGapMin, gap);
        genGapMax = Math.max(genGapMax, gap);
      }
    }
    genLast = Math.max(genLast, gs[gs.length - 1].spawnAt);
  }
  ok("every wave's schedule deals exactly the bodies its counts promise", genSum, genOff);
  ok("every wave keeps the 126-tick opening and the 90-tick warning", genOpen && genWarn);
  // 55 s, not the pre-radar 50: the four radar singles raise the deepest wave
  // to 22 groups, and 21 gaps at the 150-tick floor end at tick 3276
  ok("the pitch bounds a wave's length: groups land 2.5 to 5 s apart and no wave runs past 55 s",
    genGapMin >= 150 && genGapMax <= 300 && genLast < 3300,
    "pitch=" + genGapMin + ".." + genGapMax + " lastSpawn=" + genLast);
  // the interleave itself — this is what makes a wave a composition rather than
  // all the darts and then all the heavies
  const genSeq = enc.waveGroups(30).map((g) => g.type);
  const genTypes = new Set(genSeq);
  // the wave is dealt in two parts: the ordinary archetypes compose its body,
  // and the radar variants close it — a boss beat, not an opening statement
  const genIsRadar = (tp) => tp === "radarHarrier" || tp === "radarCharger";
  const genCut = genSeq.findIndex(genIsRadar);
  const genBody = genCut < 0 ? genSeq : genSeq.slice(0, genCut);
  const genTail = genCut < 0 ? [] : genSeq.slice(genCut);
  const genBodyTypes = new Set(genBody);
  let genInter = true;
  for (let i = 1; i < genBody.length; i++) {
    // a repeat is only legitimate once every other queue has run dry — that tail
    // is the dart remainder, and nothing else may double up before it
    if (genBody[i] === genBody[i - 1] && genBody.slice(i).some((tp) => tp !== genBody[i])) genInter = false;
  }
  let genAlt = true; // ...and the closers alternate, so a pair never lands together
  for (let i = 1; i < genTail.length; i++) if (genTail[i] === genTail[i - 1]) genAlt = false;
  ok("a late wave opens with one group of every ordinary type, never doubles up before its tail, and closes on the alternating radar variants",
    genTypes.size === 7 && genBodyTypes.size === 5 && !genBody.some(genIsRadar) &&
    new Set(genBody.slice(0, 5)).size === 5 &&
    genTail.length === 4 && genTail.every(genIsRadar) && genInter && genAlt,
    genSeq.join(","));

  // ---- AB. determinism with the whole roster on the field ----
  // The suite's snapshot idiom, widened to the wave that first deals every
  // archetype. The run fires on a fixed sweep so bodies actually die: orb drift
  // and the husk's fan are the only rand() draws the sim makes, so a single
  // stolen or reordered number moves them and the two keys separate.
  const detRun = () => {
    enc.reset();
    while (enc.state().wave < 5) { enc.E.state = "cleared"; enc.openShop(); enc.continueFromShop(); }
    enc.E.hull = 99999; // a parked ship in wave 5 is a target — the run must not end early
    let shards = 0;
    let air = 0;
    for (let k = 0; k < 1500; k++) {
      if (k % 6 === 0) { // a fixed sweep: deterministic, and it reaches every ring
        const a = k * 0.37;
        t.G.bullets.push({ x: ship().x, y: ship().y, px: ship().x, py: ship().y,
          vx: Math.cos(a) * 30, vy: Math.sin(a) * 30, r: 2.2, dmg: 1, owner: "player",
          dead: false, spent: false, ttl: 60 });
      }
      enc.advance(1);
      const st = enc.state();
      shards = Math.max(shards, st.byType.shard);
      air = Math.max(air, st.missiles);
    }
    const st = enc.state();
    return { shards, air, kills: st.kills, shot: st.missilesShot,
      key: JSON.stringify([
        enc.E.enemies.map((e) => [e.type, e.mode, e.hp, +e.x.toFixed(3), +e.y.toFixed(3)]),
        enc.E.missiles.map((m) => [+m.x.toFixed(3), +m.y.toFixed(3)]),
        enc.E.orbs.map((o) => [+o.x.toFixed(3), +o.y.toFixed(3)]),
        st.kills, st.missilesShot, st.hitsTaken, st.xp]) };
  };
  const detA = detRun();
  const detB = detRun();
  ok("a wave-5 run with missiles, splits and shields in play replays identically",
    detA.key === detB.key && detA.key.length > 40, "len=" + detA.key.length);
  ok("...and that run really put the whole roster through its paces",
    detA.shards > 0 && detA.air > 0 && detA.kills > 0 &&
    detA.shards === detB.shards && detA.air === detB.air && detA.shot === detB.shot,
    "shards=" + detA.shards + " ordnance=" + detA.air + " kills=" + detA.kills + " shot=" + detA.shot);

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
