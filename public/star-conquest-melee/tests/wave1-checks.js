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
  // The LIGHT LAYER (js/fx.js) stands down for the whole run: every pixel
  // section below is a screen-vs-screen diff, and an additive glow, a
  // two-pass bloom and a full-field nebula under every comparison is exactly
  // the scrim this repository has been burned by before. The fx suite owns
  // proving the layer; these sections must keep proving the ink under it.
  const priorLight = t.fxSnapshot(); // null when js/fx.js is not loaded
  t.setFx(false);

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
  // spawn dealing anchors on the SHIP now, not the camera — the pointer must
  // change neither the schedule nor the dealt pattern
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
  ok("zero hull downs the seat and arms the respawn timer",
    s.hull === 0 && s.seats[0].respawnT === ECFG.player.respawn && s.state !== "dead",
    "hull=" + s.hull + " respawnT=" + s.seats[0].respawnT + " state=" + s.state);
  ok("one downed seat never freezes the world", !enc.frozen());

  // ---- D1b. the respawn flow: countdown, deal point, grace, the wallet ----
  enc.reset();
  enc.advance(1);
  enc.addXp(7); // a wallet to forfeit, and a score that must survive it
  const scoreAtDeath = enc.state().seats[0].score;
  enc.damagePlayer(99);
  s = enc.state();
  ok("a killing blow forfeits the unspent wallet and keeps the score",
    s.hull === 0 && s.xp === 0 && s.seats[0].score === scoreAtDeath &&
    s.seats[0].respawnT === ECFG.player.respawn,
    "xp=" + s.xp + " score=" + s.seats[0].score + " respawnT=" + s.seats[0].respawnT);
  const deadAtX = ship().x;
  const deadAtY = ship().y;
  enc.advance(ECFG.player.respawn - 1);
  s = enc.state();
  ok("the seat stays down through the whole countdown",
    s.hull === 0 && s.seats[0].respawnT === 1 && ship().x === deadAtX,
    "respawnT=" + s.seats[0].respawnT);
  enc.advance(1);
  s = enc.state();
  ok("the timer expiring deals the seat back in at full hull with the grace",
    s.hull === s.hullMax && s.invuln === ECFG.player.invuln && s.seats[0].respawnT === 0,
    "hull=" + s.hull + " invuln=" + s.invuln);
  ok("the respawn is a fresh deal point inside the world walls",
    (ship().x !== deadAtX || ship().y !== deadAtY) &&
    ship().x > 0 && ship().x < t.WW && ship().y > 0 && ship().y < t.WH,
    "at=" + ship().x.toFixed(1) + "," + ship().y.toFixed(1));
  // the quarter rule's counter: with waiters standing a death consumes one
  // life and still respawns while the stock holds
  enc.reset();
  enc.advance(1);
  enc.E.lobbyWaiters = 1;
  enc.damagePlayer(99);
  s = enc.state();
  ok("a death under the quarter rule consumes one life and still respawns",
    s.seats[0].stock === ECFG.player.stock - 1 && s.seats[0].respawnT === ECFG.player.respawn,
    "stock=" + s.seats[0].stock);
  enc.E.lobbyWaiters = 0; // the hook back to open play

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

  // ---- E. the quarter rule ends a match; restart cleans up and keeps the tuner ----
  // The terminal dead state is reachable only when the last life goes with
  // lobby waiters standing — open play respawns forever. Stage exactly that.
  enc.E.invuln = 0; // D2 reset the run — reach the dead state deliberately
  enc.E.lobbyWaiters = 1;
  enc.E.seats[0].stock = 1; // the last quarter
  enc.damagePlayer(99);
  ok("the last life under the quarter rule ends the match, frozen",
    enc.state().state === "dead" && enc.frozen() && enc.state().seats[0].respawnT === 0,
    "state=" + enc.state().state);
  // ...and the terminal state OUTRANKS the wipe. That death emptied the field
  // too, so the arm's condition was met — the "dead" check runs first and
  // refuses it, which is what keeps the death screen reachable at all: an
  // armed wipe here would deal a fresh wave 1 behind the frozen world.
  ok("a match-ending death arms no wipe — the death screen outranks it",
    enc.E.wipePending === false, "wipePending=" + enc.E.wipePending);
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
  ok("restart refills the quarter-rule stock and clears the pending respawn",
    s.seats[0].stock === ECFG.player.stock && s.seats[0].respawnT === 0,
    "stock=" + s.seats[0].stock);
  enc.E.lobbyWaiters = 0; // the lobby hook is not run state — put it back by hand
  ok("restart recenters the ship", ship().x === t.WW / 2 && ship().y === t.WH / 2);
  ok("restart preserves tuner settings", t.camState().EDGEMARGIN === 77);
  t.setEdgeMargin(priorEdge);

  // ---- E2. a total wipe deals the run back to wave 1 ----
  // The rule is "at some tick-phase, NO seat is alive" — not "everyone died
  // within 10 s". Solo that is every death, which is the intent. It is a
  // mid-run TRANSITION and not a restart, so the second leg pins what it must
  // NOT take as hard as the first pins what it does. Every kill here goes
  // through damagePlayer: hitPlayer's hull decrement is the only place the
  // edge can arm, so a staged `hull = 0` would prove nothing.
  enc.reset();
  enc.advance(1);
  enc.dealWave(4);
  enc.advance(20);
  enc.addXp(20);
  enc.buy(0);                                          // a rank the wipe must not take back
  enc.spawnEnemy(ship().x + 400, ship().y + 300);      // a live field to despawn...
  enc.spawnMissile(ship().x + 420, ship().y + 300, 0); // ...and ordnance in the air
  enc.E.orbs.push({ x: 5, y: 5, vx: 0, vy: 0 });       // an orb in the far corner, unbanked
  t.G.bullets.push({ x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, r: 2.2, dmg: 1,
                     owner: "player", dead: false, ttl: 60 });
  const wipeBefore = enc.state();
  const wipeBullets = t.G.bullets.length;
  enc.damagePlayer(99);            // the seat goes down — the arm, and nothing else yet
  const wipeAtDeath = enc.state();
  enc.advance(1);                  // ...and the consume lands on the very next tick
  s = enc.state();
  ok("a wipe deals the run back to wave 1 and empties the field",
    wipeBefore.wave === 4 && wipeBefore.enemies === 1 && wipeBefore.missiles === 1 &&
    s.wave === 1 && s.state === "warning" && s.waveTick === 0 &&
    s.enemies === 0 && s.missiles === 0,
    "from wave " + wipeBefore.wave + " (" + wipeBefore.enemies + "e/" + wipeBefore.missiles +
    "m) to wave " + s.wave + " " + s.state + " tick=" + s.waveTick +
    " (" + s.enemies + "e/" + s.missiles + "m)");
  ok("the wipe is a TRANSITION, not a restart: score, ranks, hull cap, the timer, orbs and bullets all stand",
    s.seats[0].score === wipeAtDeath.seats[0].score &&
    s.owned.join(",") === wipeAtDeath.owned.join(",") && s.owned[0] === 1 &&
    s.hullMax === wipeAtDeath.hullMax &&
    s.seats[0].respawnT === ECFG.player.respawn - 1 && // the countdown loop ran on this tick too
    s.orbs === wipeAtDeath.orbs && t.G.bullets.length === wipeBullets,
    JSON.stringify({ score: s.seats[0].score, owned: s.owned, hullMax: s.hullMax,
                     respawnT: s.seats[0].respawnT, orbs: s.orbs, bullets: t.G.bullets.length }));
  // the SCHEDULE HOLD: wave 1 is dealt into a world with no living ship, so the
  // whole schedule slides back by the shortest respawn timer. Without it the
  // pack lands on a corpse and converges on whoever returns first.
  ok("the wave-1 schedule is held until a player is back",
    enc.E.groups[0].warnAt === W1[0].warnAt + (ECFG.player.respawn - 1) &&
    enc.E.groups[0].spawnAt === W1[0].spawnAt + (ECFG.player.respawn - 1),
    "warnAt=" + enc.E.groups[0].warnAt + " spawnAt=" + enc.E.groups[0].spawnAt);
  // the edge is ONE-SHOT: a level scan would re-fire for every tick of the dead
  // window, and each firing would pin waveTick back at 0 for ever
  enc.advance(30);
  s = enc.state();
  ok("the wipe fires once — the wave clock runs on and nothing re-deals",
    s.wave === 1 && s.waveTick === 30 && enc.E.wipePending === false,
    "wave=" + s.wave + " waveTick=" + s.waveTick + " pending=" + enc.E.wipePending);
  // ...and a pending wipe OUTRANKS the clear elevator. The arm below is made
  // outside encStep — the __test/KILLSEAT shape — and lands on a tick the clear
  // banner has already held out. Without the guard the elevator deals wave N+1
  // and the consume throws it away one tick later: two deals, two reseeds, for
  // one wipe.
  enc.reset();
  enc.advance(1);
  enc.dealWave(4);
  enc.advance(5);
  enc.E.state = "cleared";
  enc.E.clearTick = enc.E.waveTick - ECFG.clearHold; // the banner has held long enough
  enc.damagePlayer(99);
  enc.advance(1);
  ok("a pending wipe outranks the clear elevator — wave 5 is never dealt",
    enc.state().wave === 1 && enc.state().state === "warning",
    "wave=" + enc.state().wave + " state=" + enc.state().state);
  // the armed edge is SIMULATION state — it decides what the next tick does —
  // so it folds into the hash. Armed, it moves the hash; unarmed, it leaves it
  // exactly where it was. That the unarmed fold costs ZERO BYTES rather than a
  // stable four is what the committed fixtures prove, not this leg.
  enc.reset();
  enc.advance(1);
  const wipeHashClean = t.hashState();
  enc.E.wipePending = true;
  const wipeHashArmed = t.hashState();
  enc.E.wipePending = false;
  ok("the armed wipe folds into the state hash, and an unarmed one leaves it untouched",
    wipeHashArmed !== wipeHashClean && t.hashState() === wipeHashClean,
    JSON.stringify({ clean: wipeHashClean, armed: wipeHashArmed, back: t.hashState() }));
  // ...and no arm survives a restart. The arm belongs to the run that died; the
  // restart has already dealt its own wave 1, and a hashed flag left standing
  // would make two identical fresh runs read as different.
  enc.damagePlayer(99); // armed, with no tick to consume it
  enc.restart();
  ok("no armed wipe survives a restart",
    enc.E.wipePending === false && t.hashState() !== wipeHashArmed,
    "pending=" + enc.E.wipePending);
  enc.reset();

  // ---- F. the panel shop: banner-only clear, the sweep, buy-in-flight ----
  // The modal shop is gone. Every clear holds the banner while the field's
  // orbs sweep to the ship, then encStep deals the next wave itself; the
  // shop is a persistent MOUSE-ONLY column in the left gutter, hit-tested in
  // its own LOGICAL PANEL space, and a purchase lands at any live moment —
  // mid-flight included. The click legs dispatch REAL mousedowns at panel
  // points converted through game.js's own panelToClient, so the whole path
  // — listener, gutter routing, panel transform, shopLayout hit test, buy —
  // is the production path end to end.
  t.setAimMode("mouse");
  t.G.started = true; // the panels (and their routing) belong to a started session
  const liveKey = (code) => {
    const was = t.G.running;
    t.G.running = true;
    document.dispatchEvent(new KeyboardEvent("keydown", { code }));
    t.G.running = was;
  };
  // a REAL mousedown at a PANEL point, through game.js's own gutter routing
  const panelClick = (px, py) => {
    const c = t.panelToClient("shop", px, py);
    if (!c) return false;
    const was = t.G.running;
    t.G.running = true;
    canvasEl.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: c.x, clientY: c.y, bubbles: true }));
    t.G.running = was;
    return true;
  };
  const panelMove = (px, py) => { // ...and the hover that precedes it
    const c = t.panelToClient("shop", px, py);
    if (!c) return false;
    const was = t.G.running;
    t.G.running = true;
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: c.x, clientY: c.y, bubbles: true }));
    t.G.running = was;
    return true;
  };
  const cardMid = (i) => { const c = enc.shopLayout().cards[i]; return [c.x + c.w / 2, c.y + c.h / 2]; };
  const clickCard = (i) => panelClick(...cardMid(i));
  // a reader for the predicates that only answer on a LIVE page, so a check
  // can ask them without the suite's paused page answering for them
  const liveVal = (fn) => {
    const was = t.G.running;
    t.G.running = true;
    try { return fn(); } finally { t.G.running = was; }
  };
  ok("the suite's viewport gives the panels room, so the click path is real",
    t.panelsOn() === true && !!t.panelToClient("shop", 0, 0),
    "on=" + t.panelsOn() + " place=" + JSON.stringify(t.panelPlaceFor("shop")));
  enc.reset();
  enc.E.hull = 99;
  enc.advance(130); // group 1 on the field
  for (const e of enc.E.enemies) e.hp = 0;
  enc.advance(W1[1].spawnAt - 130 + 1); // group 2 lands
  for (const e of enc.E.enemies) e.hp = 0;
  enc.advance(1); // the reap clears the wave
  ok("a wave clear opens the banner over a LIVE world", enc.state().state === "cleared" && !enc.frozen());
  enc.E.orbs.push({ x: 5, y: 5, vx: 0, vy: 0 }); // parked in the far world corner — the sweep must still bank it
  enc.advance(ECFG.clearHold + 1);
  s = enc.state();
  ok("the banner hold expiring deals the next wave itself — no screen, no freeze",
    s.state === "warning" && s.wave === 2 && s.waveTick === 0 && !enc.frozen(),
    "state=" + s.state + " wave=" + s.wave + " tick=" + s.waveTick);
  ok("the cleared sweep banked every orb before the hand-off",
    s.orbs === 0 && s.xp === 6, "orbs=" + s.orbs + " xp=" + s.xp);
  const tickBeforeBuy = s.waveTick;
  const RL1 = 1 / 1.15; // rank 1 of the additive curve: +15% of the BASE rate
  clickCard(0);
  s = enc.state();
  ok("a panel click buys RAPID LOADER while the wave runs on",
    s.mods.cool === RL1 && s.xp === 2 && s.owned[0] === 1 && s.state === "warning" &&
    s.waveTick === tickBeforeBuy, // a click is not a tick — nothing froze, nothing advanced
    "cool=" + s.mods.cool + " xp=" + s.xp + " state=" + s.state);
  enc.advance(30);
  ok("the world keeps ticking around the open shop",
    enc.state().waveTick === tickBeforeBuy + 30, "tick=" + enc.state().waveTick);
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
  // the score is a one-way counter: crediting raises it beside the wallet,
  // spending draws the wallet alone
  const scoreSpend = enc.state().seats[0].score;
  clickCard(0); // rank two at 8 — affordable now
  s = enc.state();
  ok("spending draws the wallet and never the score",
    s.owned[0] === 2 && s.xp === 2 && s.seats[0].score === scoreSpend,
    "xp=" + s.xp + " score=" + s.seats[0].score);
  // a click on the panel's dead space is nobody's: no buy, no fire
  const gapCard = enc.shopLayout().cards[0];
  const ownedGap = enc.state().owned.join(",");
  const bulletsGap = t.G.bullets.length;
  panelClick(gapCard.x + gapCard.w / 2, gapCard.y + gapCard.h + 2); // the gap under card 0
  s = enc.state();
  ok("a click between cards buys nothing and fires nothing",
    s.owned.join(",") === ownedGap && t.G.bullets.length === bulletsGap && s.shopHover === -1,
    "hover=" + s.shopHover + " owned=" + s.owned.join(","));
  // the hover path: a panel move lights the card, a field move clears it
  panelMove(...cardMid(1));
  ok("a panel hover lights the card under the pointer", enc.state().shopHover === 1,
    "hover=" + enc.state().shopHover);
  {
    const fp = t.fieldToClient(t.FW / 2, t.FH / 2);
    const was = t.G.running;
    t.G.running = true;
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: fp.x, clientY: fp.y, bubbles: true }));
    t.G.running = was;
  }
  ok("the hover clears when the pointer returns to the field", enc.state().shopHover === -1,
    "hover=" + enc.state().shopHover);
  // browse dead, spend alive — the documented choice, driven end to end
  enc.damagePlayer(99); // the seat goes down mid-wave; its wallet is forfeit
  enc.addXp(40);        // fund a buy the corpse must not make
  const ownedDead = enc.state().owned[0];
  ok("a downed seat may browse but not buy",
    enc.buy(0) === false && enc.state().owned[0] === ownedDead && enc.state().xp === 40,
    "owned=" + enc.state().owned[0] + " xp=" + enc.state().xp);
  enc.respawnSeat(0); // the direct deal — the timer's own path is D1b's business
  ok("the revived seat spends again",
    enc.buy(0) === true && enc.state().owned[0] === ownedDead + 1,
    "owned=" + enc.state().owned[0]);
  // ...and the arm that death left behind is DISCARDED, not banked. The direct
  // deal above revived the seat with no tick in between, so the consume's own
  // re-scan finds a live seat and the wave stands. Trust the arm alone and this
  // reads wave 1.
  enc.dealWave(3);
  enc.advance(1);
  ok("a revival before the tick discards the armed wipe — the wave stands",
    enc.state().wave === 3, "wave=" + enc.state().wave);
  // the keys the old shop retired stay retired — pointer-only, forever
  const keyBefore = JSON.stringify(enc.state().owned) + "|" + enc.state().xp;
  const keyWave = enc.state().wave;
  for (const code of ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6",
                      "Numpad1", "Enter", "NumpadEnter", "Space"]) liveKey(code);
  s = enc.state();
  ok("no key buys anything or deals a wave — the shop is pointer-only",
    s.wave === keyWave && JSON.stringify(s.owned) + "|" + s.xp === keyBefore,
    "wave=" + s.wave + " want=" + keyWave + " " + JSON.stringify(s.owned) + " xp=" + s.xp);
  // the bought terms reach the sim — expectations come from the live tuner
  // values and the LIVE rank, so an already-tuned page cannot fake a failure
  const tun = enc.tunables();
  const rlRank = enc.state().owned[0];
  t.setAimMode("push");
  t.G.aimed = true;
  t.G.aimAngle = 0;
  t.G.cool = 0;
  enc.fireOnce();
  ok("the bought cooldown shortens the firing gate",
    t.G.cool === Math.max(1, Math.round(tun.BCOOL / (1 + 0.15 * rlRank) / tun.TICK)),
    "cool=" + t.G.cool + " rank=" + rlRank);
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
  enc.advance(ECFG.clearHold - 1);
  s = enc.state();
  ok("the banner holds the whole clearHold before anything is dealt",
    s.state === "cleared" && s.wave === 1,
    "state=" + s.state + " wave=" + s.wave);
  enc.advance(2);
  s = enc.state();
  ok("the hold expiring deals wave 2 in the warning state — no shop beat between",
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
  // length guard below is what catches a vacuous "[]"-vs-"[]" pass.
  const waveTwoRun = () => {
    enc.reset();
    enc.E.hull = 99;
    enc.advance(130);
    for (const e of enc.E.enemies) e.hp = 0;
    enc.advance(W1[1].spawnAt - 130 + 1);
    for (const e of enc.E.enemies) e.hp = 0;
    enc.advance(1);
    enc.advance(ECFG.clearHold + 1); // the hold expires and wave 2 deals itself
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
  // the terminal screen is the quarter rule's now — stage the last life
  t.setAimMode("mouse"); // escape-pauses directly in mouse mode
  enc.reset();
  enc.E.lobbyWaiters = 1;
  enc.E.seats[0].stock = 1;
  enc.damagePlayer(99);
  enc.E.lobbyWaiters = 0;
  ok("the staged last life reaches the dead state", enc.state().state === "dead" && enc.frozen());
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
  // buys through the real buy() mid-wave — the panel shop's own flow, no
  // staged visit — and measures the cap the way section O does, so a page
  // tuned to any VMAX reports the same verdict.
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
  const pBuy = () => enc.buy(1); // one AFTERBURNER rank, bought mid-wave —
                                 // the panel shop needs no staged visit
  ok("the mid-wave purchase buys rank one", pBuy() === true);
  const cap1 = capNow();
  ok("one AFTERBURNER rank lifts the effective cap by exactly 1.0 px/tick",
    enc.state().mods.speed === 1 && Math.abs(cap1 - (vmaxP + 1)) < 1e-9,
    "cap=" + cap1 + " want=" + (vmaxP + 1));
  ok("the purchase leaves the VMAX tuner value untouched",
    enc.tunables().VMAX === vmaxP && Number(document.getElementById("vmax").value) === vmaxP,
    "tuner=" + enc.tunables().VMAX + " slider=" + document.getElementById("vmax").value);
  ok("the second purchase buys rank two at its doubled price", pBuy() === true && enc.state().xp === 0);
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
  enc.addXp(1000);
  ok("a purchase needs no shop beat at all — the panel sells mid-wave",
    enc.state().state === "warning" && !enc.frozen());
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

  // ---- R. the gutter panels: real ink, the isolating lever, a paused refusal ----
  // The panels draw OUTSIDE the field, in the letterbox bars, and the pixel
  // legs probe those bars directly — fieldToCanvas extends past the field,
  // so a negative field x lands in the left bar. The LEVER matters more
  // than the probe (the repo's own lesson from the scrim era): each leg
  // toggles something only the suppressed layer answers to — setPanels —
  // and asserts BOTH sides, so a deleted panel pass cannot slip through as
  // "no ink either way".
  enc.reset();
  enc.E.hull = 99;
  enc.advance(130);
  ok("a broke buy is refused and changes nothing",
    enc.buy(0) === false && enc.state().xp === 0 && enc.state().mods.cool === 1 && enc.state().owned[0] === 0);
  const shopPlace = t.panelPlaceFor("shop");
  const boardPlace = t.panelPlaceFor("board");
  ok("both panels have room under the suite's viewport",
    t.panelsOn() === true && !!shopPlace && !!boardPlace,
    JSON.stringify({ shop: shopPlace, board: boardPlace }));
  // a panel-space point as FIELD coordinates, through the two transforms the
  // page itself exposes — so arrPx (fieldToCanvas) can probe the bars
  const panelField = (place, px, py) => ({
    x: (place.x0 + px * place.k - t.fieldToCanvas(0, 0).x) / (t.fieldToCanvas(1, 0).x - t.fieldToCanvas(0, 0).x),
    y: (place.y0 + py * place.k - t.fieldToCanvas(0, 0).y) / (t.fieldToCanvas(0, 1).y - t.fieldToCanvas(0, 0).y),
  });
  const layR = enc.shopLayout();
  const shopProbe = panelField(shopPlace, layR.cards[0].x + 10, layR.cards[0].y + 10); // card 0's face
  const boardProbe = panelField(boardPlace, 20, 16); // inside the panel's ground band
  let panelDrew = true;
  let panelErr = "";
  try { t.render(); } catch (err) { panelDrew = false; panelErr = String(err); }
  ok("the frame renders with the panels up", panelDrew, panelErr);
  const shopInkOn = arrPx(shopProbe.x, shopProbe.y);
  const boardInkOn = arrPx(boardProbe.x, boardProbe.y);
  t.setPanels(false);
  t.render();
  const shopInkOff = arrPx(shopProbe.x, shopProbe.y);
  const boardInkOff = arrPx(boardProbe.x, boardProbe.y);
  t.setPanels(true);
  t.render();
  ok("the shop panel paints real ink, and the lever alone removes it",
    shopInkOn !== shopInkOff && arrPx(shopProbe.x, shopProbe.y) === shopInkOn,
    "moved=" + (shopInkOn !== shopInkOff));
  ok("the leaderboard paints real ink, and the lever alone removes it",
    boardInkOn !== boardInkOff && arrPx(boardProbe.x, boardProbe.y) === boardInkOn,
    "moved=" + (boardInkOn !== boardInkOff));
  // the leaderboard renders the per-seat score it is fed: the ink under the
  // score line moves when the score does, and only then. The reworked board
  // stacks a big name line over a bigger score line per seat, so with one
  // seat the score digits land in the panel's lower two-thirds — the probe
  // is a GRID across that band, wide enough to catch both a one-glyph "0"
  // and a five-glyph number at their (different) fitted sizes.
  const scoreStrip = () => {
    const pts = [];
    for (let px = 30; px <= 140; px += 5) {
      for (let py = 150; py <= 230; py += 8) {
        const q = panelField(boardPlace, px, py);
        pts.push(arrPx(q.x, q.y));
      }
    }
    return pts.join("|");
  };
  t.render();
  const scoreInkA = scoreStrip();
  const scoreWasR = enc.E.seats[0].score;
  enc.E.seats[0].score = scoreWasR + 88888;
  t.render();
  const scoreInkB = scoreStrip();
  enc.E.seats[0].score = scoreWasR;
  t.render();
  ok("the leaderboard renders the live per-seat score",
    scoreInkA !== scoreInkB && scoreStrip() === scoreInkA,
    "moved=" + (scoreInkA !== scoreInkB));
  // ---- the CROWN (phase 14) --------------------------------------------
  // The board's one marker. It is drawn for ranked[0] and only above a score
  // of 0, so a fresh board crowns nobody. The probe is a GRID across the top
  // row's air band — where the chevron sits, above the name line — and every
  // leg asserts BOTH directions, so a board that stopped drawing the crown
  // entirely could not pass as "nothing moved".
  const crownStrip = () => {
    const pts = [];
    for (let px = 55; px <= 115; px += 3) {
      for (let py = 8; py <= 34; py += 2) {
        const q = panelField(boardPlace, px, py);
        pts.push(arrPx(q.x, q.y));
      }
    }
    return pts.join("|");
  };
  const crownScoreWas = enc.E.seats[0].score;
  enc.E.seats[0].score = 0;
  t.render();
  const crownAtZero = crownStrip();
  enc.E.seats[0].score = 120;
  t.render();
  const crownAtLead = crownStrip();
  ok("a 0-0 board crowns nobody, and the first point on the board raises the crown",
    crownAtZero !== crownAtLead,
    "moved=" + (crownAtZero !== crownAtLead));
  // ...and the crown is behind the panels lever. The OBVIOUS form of this
  // leg is vacuous and was caught being vacuous: comparing the crown band
  // with panels up against the same band with panels DOWN moves because the
  // BOARD moved, and it passes with the crown deleted outright. The band
  // must be isolated by a lever only the CROWN answers to — the score — and
  // the panels claim then has to be made the other way round: with the panel
  // suppressed, the crown's own lever must change NOTHING, because there is
  // no surface for it to paint on.
  t.setPanels(false);
  enc.E.seats[0].score = 0;
  t.render();
  const crownOffZero = crownStrip();
  enc.E.seats[0].score = 120;
  t.render();
  const crownOffLead = crownStrip();
  t.setPanels(true);
  t.render();
  const crownOnLead = crownStrip();
  // BOTH halves, or the leg is still half-vacuous: with the panel down the
  // crown's lever must move NOTHING, and with the panel up the same lever
  // must move the band. Only the second half can fail when the crown is
  // deleted, and without it this leg passes on a board that draws no crown
  // at all — which is exactly how the first draft of it failed review.
  ok("the crown's own lever moves the band with the panel up and nothing at all with it down",
    crownOffZero === crownOffLead && crownAtZero !== crownAtLead &&
    crownOnLead === crownAtLead,
    JSON.stringify({ suppressedLeverMoved: crownOffZero !== crownOffLead,
                     liveLeverMoved: crownAtZero !== crownAtLead,
                     panelRestored: crownOnLead === crownAtLead }));
  enc.E.seats[0].score = crownScoreWas;
  t.render();

  // the crown FOLLOWS the lead, and the local-seat highlight follows the
  // GRANTED seat — both staged on two seats, both proven in both directions
  {
    const cwSeatsWas = t.players.length;
    t.setPlayerCount(2);
    enc.restart();
    const cwRow = (i) => { // a strip across row i's name line — the highlight's own band
      const pts = [];
      const cellH = (320 - 20) / 2; // BOARDUI.h and the uncompact pad, as drawBoard splits them
      const top = 10 + i * cellH;
      for (let px = 20; px <= 150; px += 3) {
        for (let py = Math.round(top + cellH * 0.06); py <= Math.round(top + cellH * 0.32); py += 2) {
          const q = panelField(boardPlace, px, py);
          pts.push(arrPx(q.x, q.y));
        }
      }
      return pts.join("|");
    };
    // The crown is structurally pinned to ROW 0 — `r.s === king` is exactly
    // `i === 0`, because king IS ranked[0].s — so "the crown moves with the
    // lead" can only ever mean "the comparator carries the leader into the
    // crowned row". A leg probing the NAME band alone cannot see the crown at
    // all (it sits above that band) and passes with the crown deleted; this
    // one reads the crown band AND the name band, and asserts both halves:
    // the crowned row is inked, and the seat occupying it is the leader.
    // row 0's crown band ONLY. The bounds are derived from drawBoard's own
    // arithmetic rather than guessed: at two seats cellH is 150, nameH is
    // 0.34 of that, the crown's baseline sits nameH * 0.18 below the row top
    // and its height is capped at 0.9 of that offset — so the marker lives
    // between y 10.9 and y 19.2. The band stops at 19: one pixel lower and it
    // catches the top of the NAME glyphs, which differ per seat ("Player1"
    // against "Player2") and would make the row-pinned assertion below fail
    // for a reason that has nothing to do with the crown. Caught exactly that
    // way while writing this.
    const cwCrown = () => {
      const pts = [];
      for (let px = 55; px <= 115; px += 3) {
        for (let py = 11; py <= 19; py += 1) {
          const q = panelField(boardPlace, px, py);
          pts.push(arrPx(q.x, q.y));
        }
      }
      return pts.join("|");
    };
    enc.E.seats[0].score = 0;
    enc.E.seats[1].score = 0;
    t.render();
    const cwCrownNone = cwCrown();
    enc.E.seats[0].score = 50;
    enc.E.seats[1].score = 10;
    t.render();
    const cwLead0 = [cwRow(0), cwRow(1)];
    const cwCrown0 = cwCrown();
    enc.E.seats[0].score = 10;
    enc.E.seats[1].score = 50; // the lead FLIPS — seat 1 sorts to the top row
    t.render();
    const cwLead1 = [cwRow(0), cwRow(1)];
    const cwCrown1 = cwCrown();
    ok("the crowned row is inked whoever leads, and stays bare while nobody does",
      cwCrown0 !== cwCrownNone && cwCrown1 !== cwCrownNone && cwCrown0 === cwCrown1,
      JSON.stringify({ inkedForSeat0: cwCrown0 !== cwCrownNone,
                       inkedForSeat1: cwCrown1 !== cwCrownNone,
                       crownIsRowPinned: cwCrown0 === cwCrown1 }));
    // both name bands repaint, because the comparator moved a different seat
    // into each row. They do NOT simply swap: the local seat's row is drawn
    // bright and the other dim, so the same name renders in a different
    // colour depending on which row it lands in — asserting a swap here would
    // be asserting something false.
    ok("a staged score flip carries the LEADER into the crowned row — the comparator decides who wears it",
      cwLead0[0] !== cwLead1[0] && cwLead0[1] !== cwLead1[1],
      JSON.stringify({ row0Moved: cwLead0[0] !== cwLead1[0],
                       row1Moved: cwLead0[1] !== cwLead1[1] }));
    // the localSeat highlight: with both seats on the SAME score the rows
    // differ only by their name colour, so a granted seat 1 must repaint.
    // Driven through the real Net accessor the HUD reads, never a poke.
    enc.E.seats[0].score = 50;
    enc.E.seats[1].score = 50;
    t.render();
    const cwLocal0 = [cwRow(0), cwRow(1)];
    const netWas = window.Net;
    window.Net = { active: () => true, seat: () => 1 };
    const cwGranted = t.localSeat();
    t.render();
    const cwLocal1 = [cwRow(0), cwRow(1)];
    window.Net = netWas;
    t.render();
    const cwRestored = [cwRow(0), cwRow(1)];
    ok("the bright name follows the GRANTED seat, not seat 0 — and returns when the grant goes",
      cwGranted === 1 && (cwLocal0[0] !== cwLocal1[0] || cwLocal0[1] !== cwLocal1[1]) &&
      cwRestored[0] === cwLocal0[0] && cwRestored[1] === cwLocal0[1],
      JSON.stringify({ granted: cwGranted,
                       row0: cwLocal0[0] !== cwLocal1[0], row1: cwLocal0[1] !== cwLocal1[1],
                       restored: cwRestored[0] === cwLocal0[0] && cwRestored[1] === cwLocal0[1] }));
    t.setPlayerCount(cwSeatsWas);
    enc.restart();
    enc.E.hull = 99;
    enc.advance(130);
    t.render();
  }
  // paused, the panel refuses the pointer: the page IS paused here, so the
  // refusals below are the genuine article, not a staged flag
  enc.addXp(10); // fund a buy no paused input may make
  const pausedCard = enc.shopLayout().cards[0];
  const pcx = pausedCard.x + pausedCard.w / 2;
  const pcy = pausedCard.y + pausedCard.h / 2;
  const hoverRefused = enc.shopHover(pcx, pcy);
  const clickRefused = enc.shopClick(pcx, pcy);
  s = enc.state();
  ok("a paused panel refuses hover and click — nothing buys, nothing lights",
    hoverRefused === false && clickRefused === false && t.G.running === false &&
    s.xp === 10 && s.owned[0] === 0 && s.shopHover === -1,
    "hover=" + hoverRefused + " click=" + clickRefused + " xp=" + s.xp);
  // The panel's TYPE. game.js hands the draw ONE number — the fit's CSS px
  // per logical panel unit — and the whole of it is spent inside
  // shopTextPlan(), so that is the thing to pin. The ink legs above cannot
  // reach it: the suite's own 780x493 viewport fits at ratio 0.3549, which
  // lands the row name at 7.01 CSS px, under the 9 px PROSE CUT — so this
  // viewport paints neither the row name nor the detail band, and a font that
  // shrank to 5 CSS px on a laptop would sail through every pixel probe in
  // this section. The floors (11/11/11/9 CSS px), the design sizes (11/8/9/8)
  // and the 9 px cut are spelled out here on purpose: they are the contract,
  // not a copy of it, and a change to any of them should have to come through
  // these legs.
  const layT = enc.shopLayout();
  const padT = layT.cards[0].x;      // the panel's own gutter, the same both sides
  const innerT = layT.w - 2 * padT;  // the header row's box, and the detail band's
  const cardWT = layT.cards[0].w;
  const cardHT = layT.cards[0].h;
  const EMWT = 0.65;                 // the conservative monospace advance, in em
  const ICONMAXT = 76;               // SHOPUI.icon — the drawn ceiling
  const ICONMINT = 24;               // ...and the floor that keeps it from vanishing
  const INKASCT = 0.75, INKDESCT = 0.25; // the ink a line owns above and below
                                     // its baseline, in em — the same contract
                                     // the draw derives its baselines from
  const EPST = 1e-9;                 // these are float budgets: 154 lands as
                                     // 153.99999999999997, so every cap leg
                                     // carries a tolerance instead of trusting
                                     // the rounding to fall the right way
  const NAMEMINT = 9;                // the PROSE CUT, in CSS px — the size below
                                     // which a row name would be noise and the
                                     // panel keeps only picture and price
  const runW = (px, chars) => px * EMWT * chars; // what a string that long runs to
  const bandT = (p) =>               // what the card owes its text: the price
    (p.prose ? p.namePx : 0) + p.pricePx + 5 + 4; // line, the pips, air — and the
                                     // NAME line, reserved exactly when painted
  // The fit ratios below were MEASURED on the real page (headless Chrome,
  // panelPlace's k / dpr at the named window size) — not guessed from the
  // panel height, which is why the first cut of this leg went stale the
  // moment shopLayout().h moved from 1040 to 982. Re-measure them if the
  // panel's logical height, its gutter share or the 8 px margin ever change:
  // deleting the detail band took the height from 982 to 928.74 and moved
  // both HEIGHT-bound fits below (1366x768 from 0.7658, 1366x640 from 0.6354).
  // The width-bound ones — this suite's own, the user's, and 2560x1400@2 —
  // did not move at all, which is why the panel is no roomier at the window
  // this ticket was filed from.
  const R1366 = 0.8097; // 1366x768 — the window this item was filed against
  const R640 = 0.6719;  // 1366x640 — the shortest fit the ticket covers
  const R4K = 1.2709;   // 2560x1400@2 — the fit that never needed a floor at all
  const RSUITE = 0.3549; // 780x493 — THIS suite's own viewport, and wordless
  const RUSER = 0.4822; // 1306x1030 at dpr 1.25 — the window the PROSE CUT was
                        // written from. ox lands at 97.98 CSS px, which is under
                        // the old PANEL_COMPACT of 110, so this window used to
                        // draw a panel of icons and prices with no words on it
                        // at all ("I can only read the XP"). It is over the new
                        // cut's equivalent 93.49, so it draws them now.
  const xpWasT = enc.E.xp;
  enc.E.xp = 999; // the header's width cap counts the LIVE wallet, so pin one
  const planLow = enc.shopTextPlan(R1366);
  ok("the floor holds at the 1366x768 fit — every tier clears its CSS px",
    planLow.namePx * R1366 >= 10.9 && planLow.pricePx * R1366 >= 10.9 &&
    planLow.headerPx * R1366 >= 10.9 && planLow.walletPx * R1366 >= 10.9 &&
    planLow.detailPx * R1366 >= 8.9,
    JSON.stringify({ name: planLow.namePx * R1366, price: planLow.pricePx * R1366,
      header: planLow.headerPx * R1366, wallet: planLow.walletPx * R1366,
      detail: planLow.detailPx * R1366 }));
  const planHigh = enc.shopTextPlan(R4K);
  ok("the floor only ever GROWS type — a roomy fit keeps the design sizes",
    planHigh.headerPx >= 11 && planHigh.namePx >= 8 &&
    planHigh.pricePx >= 9 && planHigh.detailPx >= 8,
    JSON.stringify(planHigh));
  // the caps: a floor may never push a string out of the box that holds it.
  // The character counts come off the LIVE catalog and the live wallet, the
  // same reads shopTextPlan makes, so a longer row name tightens both sides.
  const nameCharsT = enc.shopInfo().reduce((a, r) => Math.max(a, r.name.length), 0);
  const priceCharsT = enc.shopInfo().reduce((a, r) => Math.max(a, String(r.cost).length + 3), 5);
  const planTiny = enc.shopTextPlan(0.35); // punishing — near the suite's own fit
  ok("the caps hold at a punishing fit — no tier's longest live string leaves its box",
    runW(planTiny.namePx, nameCharsT) <= cardWT + EPST &&
    runW(planTiny.pricePx, priceCharsT) <= cardWT + EPST &&
    planTiny.detailCols >= 1,
    JSON.stringify({ name: runW(planTiny.namePx, nameCharsT),
      price: runW(planTiny.pricePx, priceCharsT), cardW: cardWT, inner: innerT }));
  // WHERE THE FLOOR STOPS BEING A FLOOR, pinned so the degradation stays
  // deliberate. The name's box is one 154 px card and its longest live string
  // is 12 characters, so the name can never exceed 154 / (0.65 * 12) = 19.74
  // logical px — which only reaches 11 CSS px at a ratio of 0.557. Below that
  // the width cap wins and the name shrinks along it. That is the honest
  // trade (you cannot have both an 11 CSS px floor and a twelve-character
  // name inside a 154 px card at every size), and it is still far better than
  // what preceded it: at the suite's own 0.3549 fit the name lands at 7.0 CSS
  // px where the old fixed 8 px drew 2.84. The degradation does not run away
  // either — the PROSE CUT below stops it at 9 CSS px, so the name is drawn
  // between 9 and 11 CSS px or not at all, and 7.0 is a size no player is
  // shown, only a size the plan computes on its way to saying "no".
  const nameCapT = cardWT / (EMWT * nameCharsT);
  ok("the name holds 11 CSS px down to the ratio its own width cap takes over",
    Math.abs(nameCapT - 19.7436) < 1e-3 &&
    enc.shopTextPlan(0.558).namePx * 0.558 >= 10.9 &&
    Math.abs(enc.shopTextPlan(0.4).namePx - nameCapT) < EPST &&
    enc.shopTextPlan(RSUITE).namePx * RSUITE > 8 * RSUITE,
    JSON.stringify({ cap: nameCapT, at0558: enc.shopTextPlan(0.558).namePx * 0.558,
      at0400: enc.shopTextPlan(0.4).namePx * 0.4,
      atSuite: enc.shopTextPlan(RSUITE).namePx * RSUITE }));
  // the header row holds TWO strings, sized independently: "SHOP" is four
  // characters and holds the floor whatever the wallet does (sizing them
  // together made the header shrink as XP was banked — this ticket's own
  // failure mode on the panel's most-read number), and the wallet takes the
  // floor too unless the width left beside "SHOP" is genuinely too small.
  // Sweep one digit to seven across four fits: SHOP never moves with the
  // wallet, and the two never collide. (Below a ratio of ~0.19 "SHOP" alone
  // fills the 154 px row and its own width cap takes over; nothing that
  // narrow is a window this panel is drawn into.)
  let shopHeld = true, headFit = true, headWorst = "";
  for (const r of [0.2, RSUITE, R640, R1366]) {
    let prev = null;
    for (let d = 1; d <= 7; d++) {
      enc.E.xp = Number("1".repeat(d));
      const p = enc.shopTextPlan(r);
      if (prev !== null && Math.abs(p.headerPx - prev) > EPST) shopHeld = false;
      prev = p.headerPx;
      if (r >= 0.2 && p.headerPx * r < 10.9 - EPST) shopHeld = false;
      const w = runW(p.headerPx, 4) + runW(p.walletPx, 3 + d);
      if (w > innerT + EPST) { headFit = false; headWorst = "r=" + r + " d=" + d + " w=" + w; }
    }
  }
  enc.E.xp = 999;
  ok("SHOP holds its floor whatever the wallet does, and the pair never overlaps",
    shopHeld && headFit, headWorst || "held=" + shopHeld + " fit=" + headFit);
  // the header's BASELINE is derived from the size that will sit on it, not
  // from the literal 22 — headerH is 26 logical px and a floor-grown header
  // outgrows it. At the design size nothing moves; past it the ink slides up
  // rather than hanging descenders into card 0.
  let headInk = true, headWorstY = "";
  for (const r of [0.2, RSUITE, 0.4, 0.5, R640, R1366, 1, R4K, 2]) {
    const p = enc.shopTextPlan(r);
    const tall = Math.max(p.headerPx, p.walletPx);
    const b = p.headerBase;
    const bad = [];
    // the baseline NEVER crosses into card 0 — for a row of caps and digits
    // the baseline is the ink's bottom edge, so this holds at any size
    if (b > layT.cards[0].y + EPST) bad.push("baseline past card 0");
    // ...and while the size still fits the 26 px band, the full ink box does
    // too: the descent clears card 0 and the ascent stays on the panel
    if (tall <= layT.cards[0].y + EPST) {
      if (b + INKDESCT * tall > layT.cards[0].y + EPST) bad.push("descent past card 0");
      if (b - INKASCT * tall < -EPST) bad.push("ascent off the panel");
    }
    if (bad.length) { headInk = false; headWorstY = "r=" + r + " base=" + b + " tall=" + tall + " " + bad.join(","); }
  }
  ok("the header baseline follows the planned size and keeps its ink off card 0",
    headInk && Math.abs(enc.shopTextPlan(R4K).headerBase - layT.headerY) < EPST,
    headWorstY || "designBase=" + enc.shopTextPlan(R4K).headerBase +
      " literal=" + layT.headerY);
  // the icon is what the type LEAVES. The formula is pinned exactly, not
  // bounded: max(24, min(76, cardH - band - 3)). Bounding it was vacuous —
  // `icon >= 24` is a tautology on a Math.max, and `band + icon + 3 <= cardH`
  // is an identity except where a clamp binds.
  const ratiosT = [0.2, 0.25, RSUITE, RUSER, 0.5, R640, R1366, 1, R4K, 2];
  let iconExact = true, iconMid = 0, iconClamped = 0, iconWorst = "";
  for (const r of ratiosT) {
    const p = enc.shopTextPlan(r);
    const free = cardHT - bandT(p) - 3;
    const want = Math.max(ICONMINT, Math.min(ICONMAXT, free));
    if (Math.abs(p.icon - want) > EPST) {
      iconExact = false;
      iconWorst = "r=" + r + " icon=" + p.icon + " want=" + want;
    }
    if (Math.abs(p.icon - free) < EPST) { // the middle branch: the card closes EXACTLY
      iconMid++;
      if (Math.abs(bandT(p) + p.icon + 3 - cardHT) > EPST) iconExact = false;
    } else iconClamped++;
  }
  // NEITHER CLAMP BINDS at any fit the live catalog can produce, and saying so
  // is the point of the count. The band is widest just above the prose cut,
  // where the name and the price are both pinned at their shared 154 / (0.65 *
  // 12) = 19.74 width cap: 48.49 of band leaves the icon 52.51. It is
  // narrowest at a roomy fit, where the design sizes give 8 + 9 + 9 = 26 of
  // band and leave the icon 75. So the whole live range is 52.51..75, with
  // 28.51 px of daylight over the 24 floor and 1 px under the 76 ceiling. The
  // ceiling used to be reached — by a COMPACT card at a roomy ratio, a
  // combination this function could still be asked for when compact was an
  // argument. It is not one any more: the wordless card and the roomy fit are
  // now the same question, and they cannot both be true. The clamps stay as
  // guards for a catalog rewrite (see the floor leg below).
  ok("the icon is exactly what the card has left, at every fit",
    iconExact && iconMid === ratiosT.length && iconClamped === 0,
    iconWorst || JSON.stringify({ exact: iconExact, middleBranch: iconMid,
      clamped: iconClamped, of: ratiosT.length }));
  // The 24 px FLOOR is unreachable with the live catalog, and the margin is
  // worth stating rather than asserting blind. The band tops out at
  // namePx + pricePx + 9; both tiers cap at 154 / (0.65 * 12) = 19.74 (the
  // twelve-character "RAPID LOADER" in a 154 px card), so the widest band is
  // 48.49 and the icon bottoms out at 52.51 — 28.51 px clear of the floor.
  // The floor binds only if the catalog's longest name drops to SIX
  // characters: the caps rise to 154 / (0.65 * 6) = 39.49 each, the band to
  // 87.97, and the card would overflow by 10.97 px with the icon pinned at
  // 24. Eleven-character names still clear it (band 52.08, icon 48.92). So
  // the floor is the guard for a catalog rewrite, not dead code, and this leg
  // records how much room there is before it starts to matter.
  let iconMinSeen = Infinity;
  for (const r of ratiosT) iconMinSeen = Math.min(iconMinSeen, enc.shopTextPlan(r).icon);
  ok("the icon never comes within 20 px of its floor at any fit the catalog allows",
    iconMinSeen >= ICONMINT + 20, "min=" + iconMinSeen + " floor=" + ICONMINT);
  // ---- THE PROSE CUT ------------------------------------------------------
  // The panel decides for itself whether to paint words, and it decides from
  // the words: prose = namePx * ratio >= 9 CSS px. It used to decide from
  // game.js's `compact` — ox/dpr < PANEL_COMPACT, a hand-picked 110 — and
  // that threshold was chosen when the panel had no legibility floor and a
  // squeezed name really did render at 5 px. It outlived its reason: a real
  // 1306x1030 window at dpr 1.25 lands ox at 97.98 CSS px, took the compact
  // cut, and showed a column of icons and prices with no words on it at all,
  // while its names would have rendered at 9.52 px. This block is the whole
  // rule, from four directions: where it flips, that it flips ONCE, that the
  // user's window is on the drawing side of it, and that this suite's own
  // viewport is not.
  //
  // WHERE IT FLIPS, derived rather than declared. While the width cap binds,
  // namePx is 154 / (0.65 * 12) = 19.7436 whatever the ratio, so the product
  // crosses 9 at ratio 9 / 19.7436 = 0.45584 — which through panelPlace's
  // width term (ox/dpr = ratio * 170 + 16) is a gutter of 93.49 CSS px. That
  // number is the derived equivalent of the 110 the shop no longer reads.
  const PMARGINT = 8;  // game.js's PANEL_MARGIN, in CSS px — the air panelPlace
                       // holds out of the bar on EACH side. Wherever the fit's
                       // width term binds (every gutter narrow enough for this
                       // cut to matter), ox/dpr = ratio * panelW + 2 * that. It
                       // is 8 like SHOPUI.pad above and has nothing to do with
                       // it: one is air outside the panel, one inside.
  const gutterOfT = (r) => r * layT.w + 2 * PMARGINT;
  const RFLIP = NAMEMINT / nameCapT;
  ok("the cut flips exactly where the name crosses 9 CSS px, and nowhere else",
    Math.abs(RFLIP - 0.4558442) < 1e-6 &&
    Math.abs(gutterOfT(RFLIP) - 93.4935) < 1e-3 && // the equivalent gutter
    enc.shopTextPlan(RFLIP * (1 - 1e-9)).prose === false &&
    enc.shopTextPlan(RFLIP * (1 + 1e-9)).prose === true,
    JSON.stringify({ flipRatio: RFLIP, equivalentGutterCss: gutterOfT(RFLIP),
      just_under: enc.shopTextPlan(RFLIP * (1 - 1e-9)).prose,
      just_over: enc.shopTextPlan(RFLIP * (1 + 1e-9)).prose }));
  // ...swept, so "no gap and no overlap" is a measurement and not a claim. The
  // sweep steps an INTEGER counter — `r += 0.001` accumulates and would drift
  // straight past the boundary this leg exists to find (the band legs below
  // learned that the hard way at r = 0.57).
  let cutAgrees = true, flips = 0, cutWorst = "", prevProse = null;
  for (let i = 100; i <= 2000; i++) {
    const r = i / 1000;
    const p = enc.shopTextPlan(r);
    if (p.prose !== (r >= RFLIP)) {
      cutAgrees = false;
      cutWorst = "r=" + r.toFixed(3) + " prose=" + p.prose + " name=" + (p.namePx * r);
    }
    if (prevProse !== null && p.prose !== prevProse) flips++;
    prevProse = p.prose;
  }
  ok("swept from 0.100 to 2.000 the cut is false below the flip and true at or above it",
    cutAgrees && flips === 1,
    cutWorst || "flips=" + flips + " at r=" + RFLIP.toFixed(6));
  // the window this rule was written from: 1306x1030 at dpr 1.25, measured on
  // the real page (ox 122.47 device = 97.98 CSS, k/dpr = 0.4822). It was under
  // PANEL_COMPACT's 110 and drew nothing readable but the wallet.
  const planUser = enc.shopTextPlan(RUSER);
  ok("the user's 1306x1030 dpr-1.25 window draws its row names, over 9 CSS px",
    planUser.prose === true && planUser.namePx * RUSER >= NAMEMINT &&
    gutterOfT(RUSER) < 110, // ...and it is still COMPACT by the old rule
    JSON.stringify({ prose: planUser.prose, nameCss: planUser.namePx * RUSER,
      iconCss: planUser.icon * RUSER, gutterCss: gutterOfT(RUSER) }));
  // ...and this suite's own 780x493 viewport is on the other side of it, so
  // every expectation the rest of this file already carries is untouched: the
  // ink probes above render a panel with no row names and no detail band on
  // it, exactly as they did when `compact` decided that.
  const planSuite = enc.shopTextPlan(RSUITE);
  ok("the suite's own 780x493 fit still paints no prose — nothing here moves",
    planSuite.prose === false && planSuite.namePx * RSUITE < NAMEMINT,
    JSON.stringify({ prose: planSuite.prose, nameCss: planSuite.namePx * RSUITE }));
  // A WORDLESS card spends the name's row on its icon, and a lettered one does
  // not — one flag drives the reservation and the paint, so they cannot
  // disagree. (Reserving the row unconditionally cost the wordless card 43% of
  // its icon — 41.26 logical against 72.26 — for a line it never drew, and
  // 780x493 is the viewport EVERY suite renders, so no pixel leg could see
  // it.) Swept on the same integer counter, both branches asserted exactly.
  let reclaim = true, reclaimWorst = "", sawWordless = 0, sawLettered = 0;
  for (let i = 100; i <= 2000; i++) {
    const r = i / 1000;
    const p = enc.shopTextPlan(r);
    const clamp = (v) => Math.max(ICONMINT, Math.min(ICONMAXT, v));
    const withName = clamp(cardHT - 3 - (p.namePx + p.pricePx + 5 + 4));
    const noName = clamp(cardHT - 3 - (p.pricePx + 5 + 4));
    if (p.prose) sawLettered++; else sawWordless++;
    if (Math.abs(p.icon - (p.prose ? withName : noName)) > EPST) {
      reclaim = false;
      reclaimWorst = "r=" + r.toFixed(3) + " prose=" + p.prose + " icon=" + p.icon +
        " withName=" + withName + " noName=" + noName;
    }
    // and the reclaim is REAL, not a rounding artefact: dropping the name is
    // always strictly more icon than keeping it
    if (!(noName > withName + EPST)) {
      reclaim = false;
      reclaimWorst = "r=" + r.toFixed(3) + " reclaim is not strict: " + withName + " -> " + noName;
    }
  }
  ok("the icon reclaims the name's row exactly when the name is not painted",
    reclaim && sawWordless > 0 && sawLettered > 0,
    reclaimWorst || "wordless=" + sawWordless + " lettered=" + sawLettered);
  // the price never reads larger than the name it prices, beyond the single
  // design px the roomy card has always had (9 against 8)
  let priceOk = true;
  for (const r of ratiosT) {
    const p = enc.shopTextPlan(r);
    if (p.pricePx > Math.max(p.namePx, 9) + EPST) priceOk = false;
  }
  ok("the price never outgrows the name — the card's hierarchy cannot invert",
    priceOk, JSON.stringify(ratiosT.map((r) => {
      const p = enc.shopTextPlan(r);
      return [+p.namePx.toFixed(2), +p.pricePx.toFixed(2)];
    })));
  // ---- the wrap, on the surface that still uses it ------------------------
  // The gutter's detail band is gone and the wrap went with the prose it
  // served: it now measures the FIELD panel's ~49 columns instead of the
  // rail's 12. Both legs count against a live budget rather than a literal,
  // and the budgets swept below deliberately run far narrower than anything
  // the field produces, because the wrap is the one piece shared by both
  // surfaces and a change to it must not be judged only where it is roomy.
  const longDesc = enc.shopInfo().find((r) => r.name === "OVERLOAD").desc; // the widest
  const proseT = enc.shopInfo().map((r) => r.desc).concat([
    "ship down — browse only", "fully upgraded", "not needed right now",
    "need 128 more XP", "click to buy"]);
  let wrapClean = true, wrapWorst = "", wrapMulti = 0;
  for (let cols = 6; cols <= 60; cols++) { // an INTEGER counter, never an accumulated float
    for (const line of proseT) {
      const ls = enc.shopWrap(line, cols);
      if (ls.join(" ") !== line.split(" ").filter(Boolean).join(" ")) {
        wrapClean = false; wrapWorst = "cols=" + cols + " lost words: " + JSON.stringify(ls);
      }
      if (ls.length > 1) wrapMulti++;
      for (const ln of ls) {
        if (ln.length > cols && ln.indexOf(" ") >= 0) {
          wrapClean = false; wrapWorst = "cols=" + cols + " overlong line: " + JSON.stringify(ln);
        }
      }
    }
  }
  ok("the wrap keeps every word, breaks only on spaces and never runs past its budget",
    wrapClean && wrapMulti > 0, wrapWorst || "multi-line cases=" + wrapMulti);
  ok("the longest desc really does need the wrap at the rail's old measure",
    enc.shopWrap(longDesc, 12).length === 4 &&
    enc.shopWrap(longDesc, 49).length === 1,
    "at12=" + JSON.stringify(enc.shopWrap(longDesc, 12)) +
    " at49=" + JSON.stringify(enc.shopWrap(longDesc, 49)));

  // ---- the FIELD hover panel ----------------------------------------------
  // Where the prose went. The rail is 170 logical px and its band gave the
  // hovered row 12 characters and 3 lines at the user's own window, which
  // painted "comet bites / need 7 more / XP" — a truncated fragment with a
  // widowed unit under it, reading as one broken sentence. The field is
  // 512 x 342 LOGICAL px and is drawn at the field's own scale (2.17 CSS px
  // per logical unit at that window against the panel's 0.48), so the panel
  // below sets ordinary 9 and 10 px HUD type and gets ~49 columns.
  //
  // Everything the deleted band pinned is pinned here instead: the reason line
  // is present whenever there is one, it takes the LAST lines and the desc
  // gives up whole ones, no line runs past its budget, and the box never
  // leaves the space it was given. The band's `room` arithmetic moved with
  // them — see the squeeze below.
  const overT = enc.shopInfo().findIndex((r) => r.name === "OVERLOAD");
  const patchT = enc.shopInfo().findIndex((r) => r.name === "HULL PATCH");
  const hovWasT = enc.E.shopHover;
  const hullWasT = enc.E.seats[0].hull;
  const ownedWasT = enc.state().owned;
  const HPADT = 6, HHEADT = 10, HBODYT = 9; // HOVERUI's pad and its two type
                                            // sizes — the contract, spelled out
                                            // here rather than read back, so a
                                            // change to any of them has to come
                                            // through these legs
  const liveBandT = liveVal(() => enc.shopHoverBand());
  // the five states a row can be in, and the sentence each one owes the player
  const statesT = [
    // one hull point of damage, so HULL PATCH is genuinely offered too: at a
    // full hull that row's own can() is false and it owes the player a reason
    { why: null, stage: () => { enc.E.seats[0].hull = enc.E.seats[0].hullMax - 1; enc.E.xp = 9999; } },
    { why: "need 7 more XP", row: overT,
      stage: () => { enc.E.seats[0].hull = enc.E.seats[0].hullMax; enc.E.xp = 1; } },
    { why: "fully upgraded", row: overT,
      stage: () => { enc.E.seats[0].hull = enc.E.seats[0].hullMax; enc.E.xp = 9999;
        enc.E.owned[overT] = 3; } },
    { why: "not needed right now", row: patchT,
      stage: () => { enc.E.seats[0].hull = enc.E.seats[0].hullMax; enc.E.xp = 9999; } },
    { why: "ship down — browse only",
      stage: () => { enc.E.seats[0].hull = 0; enc.E.xp = 9999; } },
  ];
  const resetStateT = () => {
    enc.E.owned = ownedWasT.slice();
    enc.E.seats[0].hull = enc.E.seats[0].hullMax;
    enc.E.xp = 9999;
  };
  // The bands the plan is driven through. The live one is roomy — seven body
  // lines against a catalog whose longest hover needs three — so the squeeze
  // below hands in short and narrow channels on purpose: `room` is a GUARD,
  // and a guard the live field never presses on is a guess until it is driven.
  // The counter is an INTEGER; accumulating a float would skip the exact ties
  // the line count turns on.
  const bandsT = [liveBandT];
  for (let i = 0; i <= 12; i++) {
    bandsT.push({ x0: liveBandT.x0, x1: liveBandT.x0 + 160 + i * 11,
      top: liveBandT.top, bottom: liveBandT.top + 30 + i * 7 });
  }
  let whyKept = true, whyWorst = "", tightOk = true, tightWorst = "";
  let inBand = true, inBandWorst = "", sawRoomClamp = 0, sawFull = 0, maxLinesSeen = 0;
  for (const st of statesT) {
    for (let i = 0; i < 8; i++) {
      if (st.row !== undefined && st.row !== i) continue;
      resetStateT();
      st.stage();
      enc.E.shopHover = i;
      for (const band of bandsT) {
        const P = liveVal(() => enc.shopHoverPlan(band));
        if (!P) { whyKept = false; whyWorst = "no plan at row " + i; continue; }
        const desc = enc.shopWrap(enc.shopInfo()[i].desc, P.cols);
        const why = P.why ? enc.shopWrap(P.why, P.cols) : [];
        if ((st.why === null) !== (P.why === null) ||
            (st.why !== null && P.why !== st.why)) {
          whyKept = false; whyWorst = "row " + i + " why=" + P.why + " want=" + st.why;
        }
        // the REASON takes the last lines, and takes them FIRST: whatever the
        // room, the tail of what is drawn is the head of the wrapped reason
        const kept = Math.min(why.length, P.room);
        if (P.whyLines !== kept) {
          whyKept = false; whyWorst = "row " + i + " whyLines=" + P.whyLines + " want=" + kept;
        }
        if (P.lines.slice(P.lines.length - kept).join("|") !== why.slice(0, kept).join("|")) {
          whyKept = false;
          whyWorst = "row " + i + " tail=" + JSON.stringify(P.lines) + " why=" + JSON.stringify(why);
        }
        // ...and the desc gives up WHOLE lines, from the front, never half a line
        const head = P.lines.slice(0, P.lines.length - kept);
        if (head.join("|") !== desc.slice(0, head.length).join("|")) {
          tightOk = false; tightWorst = "row " + i + " head=" + JSON.stringify(head);
        }
        if (P.lines.length > P.room) {
          tightOk = false; tightWorst = "row " + i + " lines>" + P.room;
        }
        if (P.lines.some((ln) => ln.length > P.cols && ln.indexOf(" ") >= 0)) {
          tightOk = false; tightWorst = "row " + i + " overlong: " + JSON.stringify(P.lines);
        }
        if (P.lines.length < desc.length + why.length) sawRoomClamp++; else sawFull++;
        maxLinesSeen = Math.max(maxLinesSeen, P.lines.length);
        // and the BOX stays inside the band it was given, and inside the field
        const bot = P.y + P.h;
        if (P.x < band.x0 - EPST || P.x + P.w > band.x1 + EPST ||
            P.y < band.top - EPST || bot > band.bottom + EPST ||
            P.x < 0 || P.y < 0 || P.x + P.w > t.FW || bot > t.FH) {
          inBand = false;
          inBandWorst = "row " + i + " box=" + JSON.stringify([P.x, P.y, P.w, P.h]) +
            " band=" + JSON.stringify(band);
        }
        // ...and it is sized to the LINES, not to the room it was offered
        const ink = P.lines.length
          ? P.base0 + (P.lines.length - 1) * P.lh + 0.25 * HBODYT
          : P.headBase + 0.25 * HHEADT;
        if (Math.abs(P.h - (ink + HPADT - P.y)) > EPST) {
          inBand = false;
          inBandWorst = "row " + i + " h=" + P.h + " want=" + (ink + HPADT - P.y);
        }
      }
    }
  }
  resetStateT();
  ok("the panel names the reason a row will not sell, in every state that has one",
    whyKept, whyWorst || "five states x eight rows x " + bandsT.length + " bands");
  ok("the reason takes the last lines and the desc gives up whole ones",
    tightOk && sawRoomClamp > 0 && sawFull > 0,
    tightWorst || "clamped=" + sawRoomClamp + " full=" + sawFull);
  ok("the box never leaves its band or the field, and is sized to its lines",
    inBand, inBandWorst || "maxLines=" + maxLinesSeen);
  // The live field NEVER presses on that clamp, and saying so is the point of
  // this leg rather than letting the sweep above imply otherwise. The channel
  // leaves seven body lines; the widest thing this catalog can say is the
  // OVERLOAD desc plus a refusal, which is two. So the clamp is a guard for a
  // longer blurb or a shorter field, exactly as the icon's 24 px floor above
  // is a guard for a catalog rewrite — and the margin is five lines.
  enc.E.xp = 1;
  enc.E.shopHover = overT;
  const liveP = liveVal(() => enc.shopHoverPlan());
  ok("at the live band every row says everything it has, with five lines to spare",
    liveP.room === 7 && liveP.lines.length === 2 && liveP.cols === 49 &&
    liveP.lines[0] === longDesc && liveP.lines[1] === "need 7 more XP" &&
    liveP.name === "OVERLOAD" && liveP.price === "8 XP",
    JSON.stringify({ room: liveP.room, cols: liveP.cols, lines: liveP.lines,
      name: liveP.name, price: liveP.price }));
  // The panel's price must be the CARD's price, in every state the catalog can
  // reach — a row reading MAXED on its card and "64 XP" on the panel naming
  // that card is two prices for one thing. Both now call shopPriceLabel, so
  // this pins the shared derivation against the three shapes it can return
  // rather than against a copy of its expression.
  // Comparing them on an ORDINARY row is worthless — an offered row reads
  // "N XP" both ways, so a panel that always printed the cost would agree
  // there and diverge only where it matters. The row must be HOVERED in each
  // state that changes the string, and the panel asked while it is.
  const ownedWasPT = enc.E.owned.slice();
  const hullWasPT = enc.E.seats[0].hull;
  const hoverPriceT = (i) => {
    enc.E.shopHover = i;
    const p = liveVal(() => enc.shopHoverPlan());
    return { panel: p && p.price, card: enc.shopPriceLabel(i) };
  };
  const seenT = [];
  for (let i = 0; i < enc.shopInfo().length; i++) {
    enc.E.owned[i] = 0;
    seenT.push(hoverPriceT(i));                    // offered: "N XP"
    enc.E.owned[i] = 99;                           // driven past a cap: MAXED
    if (enc.shopInfo()[i].maxed) seenT.push(hoverPriceT(i));
    enc.E.owned[i] = ownedWasPT[i];
  }
  enc.E.seats[0].hull = enc.E.seats[0].hullMax;    // HULL PATCH stops being
  seenT.push(hoverPriceT(2));                      // offered: the em dash
  enc.E.seats[0].hull = hullWasPT;
  enc.E.shopHover = overT;
  const labelsT = seenT.map((r) => r.card);
  ok("the panel's price is the card's price, in every state a row can be in",
    seenT.every((r) => r.panel === r.card) &&
    labelsT.some((s) => s === "MAXED") && labelsT.some((s) => s === "—") &&
    labelsT.some((s) => /^\d+ XP$/.test(s)),
    JSON.stringify({ disagreed: seenT.filter((r) => r.panel !== r.card),
      shapes: [...new Set(labelsT)].slice(0, 4) }));
  // the panel is a LIVE-PLAY layer: a paused page shows none, whatever the
  // pointer was last resting on — which is also what hands the gutter's idle
  // hint back on the pause screen
  const pausedP = enc.shopHoverPlan();
  enc.E.shopHover = -1;
  const unhoveredP = liveVal(() => enc.shopHoverPlan());
  enc.E.shopHover = overT;
  ok("no hover and no live game each mean no panel",
    pausedP === null && unhoveredP === null && liveP !== null,
    "paused=" + pausedP + " unhovered=" + unhoveredP);
  // ---- the channel it sits in ---------------------------------------------
  // The panel clears the top-left status stack and game.js's corner map by
  // PLACEMENT, which is what lets the whole HUD stay up while the player
  // shops — the retired explainer art had to stand both of them down. The
  // channel's left edge is derived from the same numbers encDrawHud sets the
  // stack with, so it holds as the wave number, the hull row and the wallet
  // all grow; its right edge is the map's own rect.
  const mmT = t.minimapInfo();
  let chanOk = true, chanWorst = "", chanNarrow = 0;
  const waveWasT = enc.E.wave, hullMaxWasT = enc.E.seats[0].hullMax;
  for (let hm = 3; hm <= 30; hm++) { // an INTEGER counter over the hull row's growth
    enc.E.seats[0].hullMax = hm;
    enc.E.seats[0].hull = hm;
    enc.E.wave = hm * 3;             // ...and a wave number that grows digits with it
    enc.E.state = hm % 2 ? "active" : "cleared"; // the CLEAR header is the longer string
    enc.E.xp = Math.pow(10, hm % 7);
    const b = liveVal(() => enc.shopHoverBand());
    const sr = liveVal(() => enc.statusStackRight());
    const wave = enc.E.state === "cleared" ? "WAVE " + enc.E.wave + " · CLEAR" : "WAVE " + enc.E.wave;
    // the stack's own ink, counted the way encDrawHud lays it out
    const stackInk = Math.max(8 + EMWT * 10 * wave.length, 8 + hm * 10 - 2,
      8 + EMWT * 9 * ("XP " + enc.E.xp).length,
      8 + EMWT * 9 * ("FOES " + (enc.state().enemies + enc.state().queued)).length);
    if (sr + 1e-9 < stackInk) { chanOk = false; chanWorst = "hm=" + hm + " right=" + sr + " ink=" + stackInk; }
    if (b.x0 < stackInk) { chanOk = false; chanWorst = "hm=" + hm + " x0=" + b.x0 + " ink=" + stackInk; }
    if (b.x1 > t.FW - mmT.W - mmT.M) { chanOk = false; chanWorst = "hm=" + hm + " x1=" + b.x1; }
    const P = liveVal(() => enc.shopHoverPlan());
    if (P) {
      if (P.x < b.x0 - EPST || P.x + P.w > b.x1 + EPST) {
        chanOk = false; chanWorst = "hm=" + hm + " box escapes the channel";
      }
    } else chanNarrow++;
  }
  enc.E.seats[0].hullMax = hullMaxWasT;
  enc.E.seats[0].hull = hullMaxWasT;
  enc.E.wave = waveWasT;
  enc.E.state = "active";
  resetStateT();
  ok("the channel clears the status stack's ink and the corner map at every hull row",
    chanOk && chanNarrow > 0,
    chanWorst || "closed at " + chanNarrow + " of 28 hull counts");
  // ...and the closure is a stand-down, not an overflow: past a hull row that
  // wide the panel refuses rather than painting a name over its own price
  enc.E.seats[0].hullMax = 40;
  enc.E.seats[0].hull = 40;
  enc.E.shopHover = overT;
  const crushed = liveVal(() => enc.shopHoverPlan());
  enc.E.seats[0].hullMax = hullMaxWasT;
  enc.E.seats[0].hull = hullMaxWasT;
  ok("a channel too narrow to hold the header stands the panel down",
    crushed === null, "plan=" + JSON.stringify(crushed));
  // the header itself fits at the NARROWEST channel the panel will accept —
  // the longest row name and the longest price a run can reach, a space apart
  const longestNameT = enc.shopInfo().reduce((a, r) => Math.max(a, r.name.length), 0);
  const longestPriceT = enc.shopInfo().reduce((a, r) =>
    Math.max(a, String(r.cost * 64).length + 3), 5); // six more ranks of doubling
  ok("the narrowest channel the panel accepts still holds its header line",
    (longestNameT + longestPriceT + 2) * EMWT * HHEADT + 2 * HPADT <= 160,
    "need=" + ((longestNameT + longestPriceT + 2) * EMWT * HHEADT + 2 * HPADT) + " minW=160");

  // ---- the gutter's one remaining line: the idle hint ---------------------
  // The band under the column is one line now, and shopLayout derives its
  // height rather than declaring it: HINTPX + HINTAIR, where HINTPX is the
  // WIDEST the hint's type can ever be set. That is not a picked number. The
  // detail tier grows as the fit shrinks (9 CSS px / ratio), and the fit stops
  // shrinking at the prose cut, so the largest live detail size is exactly the
  // name's own width cap: 154 / (0.65 * 12) = 19.7436 logical px. The band is
  // that plus 3 — a border and two px of air — and the panel's whole height
  // fell from 982 to 928.74 with it.
  const HINTPXT = nameCapT;         // ...the very cap the prose cut turns on
  const HINTAIRT = 3;
  ok("the hint band is one line of the widest hint, plus its air",
    Math.abs(layT.detailH - (HINTPXT + HINTAIRT)) < EPST &&
    Math.abs(layT.h - (layT.detailTop + HINTPXT + HINTAIRT)) < EPST &&
    Math.abs(layT.h - 928.7436) < 1e-3,
    JSON.stringify({ detailH: layT.detailH, h: layT.h, hintPx: HINTPXT }));
  // the hint's TEXT fits its budget at every fit that draws it, and its ink
  // clears the last card above and the border below — both swept on an INTEGER
  // counter, because the tie at the prose cut is exactly where the budget is
  // tightest (12 columns for a 12-character hint, on the nose)
  const colBottomT = layT.cards[layT.cards.length - 1].y + layT.cards[layT.cards.length - 1].h;
  let hintFits = true, hintWorst = "", hintInk = true, hintInkWorst = "", hintMinCols = 99;
  for (let i = 100; i <= 2000; i++) {
    const r = i / 1000;
    const p = enc.shopTextPlan(r);
    if (!p.prose) continue; // a rail too narrow for a name draws no hint at all
    const B = enc.shopHintLine(p, layT);
    hintMinCols = Math.min(hintMinCols, B.cols);
    if (B.text.length > B.cols) {
      hintFits = false;
      hintWorst = "r=" + r.toFixed(3) + " text=" + B.text.length + " cols=" + B.cols;
    }
    const top = B.base - INKASCT * p.detailPx;
    const bot = B.base + INKDESCT * p.detailPx;
    if (top < colBottomT - EPST || bot > layT.h - 1 + EPST) {
      hintInk = false;
      hintInkWorst = "r=" + r.toFixed(3) + " top=" + top + " bot=" + bot;
    }
  }
  ok("the hint fits its character budget at every fit that draws it",
    hintFits && hintMinCols === 12, hintWorst || "narrowest budget=" + hintMinCols +
    " text=" + enc.shopHintLine(enc.shopTextPlan(RUSER), layT).text.length);
  ok("the hint's ink clears the last card above it and the border below it",
    hintInk, hintInkWorst || "colBottom=" + colBottomT + " h=" + layT.h);

  // ---- the DRAW obeys the plan, on both surfaces --------------------------
  // Everything above pins the PLANS. A plan is not a picture: drawShopPanel
  // has an `if (P.prose)` branch and a second condition inside it, and nothing
  // so far would notice if either were inverted, or if the hint quietly grew a
  // stricter cut of its own. The last round of this work learned that the hard
  // way — two central behaviours passed 310 legs until pixel probes were added.
  //
  // The suite cannot reach the gutter's prose through render(): its own
  // 780x493 fit is 0.3549, under the cut, so a rendered frame paints no name
  // and no hint. So these legs do what game.js does — set the panel transform
  // and call the published draw — but hand it a ratio of their own. That is a
  // deliberately SYNTHETIC pairing: the type is planned for 0.46 and rasterised
  // at the suite's 0.3549, so the panel painted is not one any window produces.
  // The legs are about CONTROL FLOW — did the branch run — and for that the
  // pairing is exactly right, because it is the only way to run the prose
  // branches at all in a 780x493 window.
  //
  // 0.46 is chosen twice over: it clears the cut (the name plans at 9.08 CSS
  // px) and it is NARROW, 12 hint columns, so a band gated on its own width
  // threshold would go dark exactly where these legs look.
  const RDRAWT = 0.46;
  const RDARKT = 0.44; // ...and one under the cut, where nothing prose may paint
  const planDrawT = enc.shopTextPlan(RDRAWT);
  const c2dT = canvasEl.getContext("2d"); // the same context encounter.js draws on
  // The panel's own ground is rgba(14, 17, 25, 0.85) — TRANSLUCENT — so two
  // draws in a row composite and a third reads as neither. Every draw here
  // therefore starts from an opaque black slate over the panel's device rect,
  // which is what makes the strips below comparable AND repeatable: the same
  // state redrawn must give the same bytes, and each leg asserts that too.
  const drawShopAtT = (r) => {
    c2dT.save();
    c2dT.setTransform(1, 0, 0, 1, 0, 0);
    c2dT.fillStyle = "#000";
    c2dT.fillRect(shopPlace.x0 - 2, shopPlace.y0 - 2,
      layT.w * shopPlace.k + 4, layT.h * shopPlace.k + 4);
    c2dT.setTransform(shopPlace.k, 0, 0, shopPlace.k, shopPlace.x0, shopPlace.y0);
    window.Encounter.drawShopPanel(r);
    c2dT.restore();
  };
  const stripT = (x0, x1, y0, y1, step) => {
    const pts = [];
    for (let px = x0; px <= x1; px += step) {
      for (let py = y0; py <= y1; py += step) {
        const q = panelField(shopPlace, px, py);
        pts.push(arrPx(q.x, q.y));
      }
    }
    return pts.join("|");
  };
  const card0T = layT.cards[0];
  const nameTopT = card0T.y + 3 + planDrawT.icon;   // the icon's bottom edge
  const nameBaseT = nameTopT + planDrawT.namePx;    // ...and the name's baseline
  // the NAME's own band, and nothing else's: below the icon, above the price
  // line (which starts a whole pricePx lower), inside the card's border
  const nameStripT = () => stripT(card0T.x + 12, card0T.x + card0T.w - 12,
    nameTopT + 7, nameBaseT - 1, 4);
  // ...and the hint's, which is below every card
  const hintStripT = () => stripT(12, layT.w - 12, layT.detailTop + 2, layT.h - 3, 4);
  const hullWas2T = enc.E.seats[0].hull;
  enc.E.seats[0].hull = enc.E.seats[0].hullMax; // alive: a downed seat buys
                                                // nothing, and the lever below
                                                // is exactly buyability
  enc.E.shopHover = -1;
  enc.E.xp = 999;                 // every row affordable — the name paints bright
  drawShopAtT(RDRAWT);
  const nameRichT = nameStripT();
  enc.E.xp = 0;                   // ...and none of them are — it paints dim
  drawShopAtT(RDRAWT);
  const namePoorT = nameStripT();
  enc.E.xp = 999;
  drawShopAtT(RDRAWT);
  ok("the draw paints the row name when the cut says prose — the wallet moves its ink",
    nameRichT !== namePoorT && nameStripT() === nameRichT,
    "moved=" + (nameRichT !== namePoorT) + " restored=" + (nameStripT() === nameRichT));
  // the hint, at the same fit and through its own lever: the LIVE HOVER. A
  // hovered row says everything on the field, so the rail's line stands down;
  // let go and it comes back. This is the one condition, read from one place,
  // and the strip lives below every card so ink that moves here is the hint
  // and can be nothing else.
  enc.E.shopHover = -1;
  liveVal(() => drawShopAtT(RDRAWT));
  const hintIdleT = hintStripT();
  enc.E.shopHover = overT;
  liveVal(() => drawShopAtT(RDRAWT));
  const hintHoverT = hintStripT();
  // ...and a PAUSED page with the pointer still on the card hands it back: the
  // field panel is a live-play layer, so the rail must not go silent with it
  drawShopAtT(RDRAWT);
  const hintPausedT = hintStripT();
  enc.E.shopHover = -1;
  liveVal(() => drawShopAtT(RDRAWT));
  ok("the hint draws only while nothing is hovered, and comes back when the page pauses",
    hintIdleT !== hintHoverT && hintPausedT === hintIdleT && hintStripT() === hintIdleT,
    "idle!=hover " + (hintIdleT !== hintHoverT) + " paused==idle " +
    (hintPausedT === hintIdleT) + " cols=" + planDrawT.detailCols);
  // ...and it follows the PROSE flag, exactly as the row name does: a rail too
  // narrow for a name is too narrow for a sentence about one. Same idle state,
  // one ratio under the cut, and the band goes dark.
  // "different from idle" is NOT the assertion to make here — a hint drawn at
  // a different SIZE satisfies it, so dropping the prose condition passed this
  // leg while painting 197.8 logical px of text into a 170 px rail, clipped at
  // one border and spilling past the other. What must hold is that NO TEXT
  // paints, and the honest way to say that is to compare the band against
  // ITSELF hovered at the SAME ratio: a hover always silences the hint, so if
  // the unhovered band under the cut carries ink the hovered one does not, the
  // prose condition is gone.
  enc.E.shopHover = -1;
  liveVal(() => drawShopAtT(RDARKT));
  const hintDarkT = hintStripT();
  enc.E.shopHover = overT;
  liveVal(() => drawShopAtT(RDARKT));
  const hintDarkHoverT = hintStripT();
  enc.E.shopHover = -1;
  liveVal(() => drawShopAtT(RDRAWT));
  ok("the hint obeys the same prose cut the row name does",
    enc.shopTextPlan(RDARKT).prose === false && hintDarkT === hintDarkHoverT &&
    hintDarkT !== hintIdleT && hintStripT() === hintIdleT,
    "prose=" + enc.shopTextPlan(RDARKT).prose + " dark==darkHover " +
    (hintDarkT === hintDarkHoverT) + " dark!=idle " + (hintDarkT !== hintIdleT));
  enc.E.seats[0].hull = hullWas2T;
  enc.E.shopHover = hovWasT;
  enc.E.xp = 999;
  t.render(); // the canvas goes back to an honest frame at the real fit

  // ---- ...and the FIELD panel, measured against the layers it must clear ---
  // The claim the whole placement rests on is that nothing stands down for
  // this panel because nothing has to. That is a pixel claim, so it is settled
  // in pixels, and by MEASUREMENT rather than by re-deriving the geometry the
  // production code already derived: each of the three layers is isolated
  // through its OWN lever and its real ink box read off the canvas.
  //   the status stack — E.state, since an idle encounter draws no HUD at all
  //   the corner map   — game.js's MINIMAP toggle
  //   the panel itself — the hover
  // The panel's box is the diff of a hovered frame against an unhovered one,
  // so it is EXACTLY the set of pixels the hover moves. If it does not
  // intersect the other two boxes, then the hover moved none of their ink —
  // which is the whole claim, and is exactly the leg the retired explainer art
  // would have failed (its 342 x 96 rect swallowed both, which is why it
  // needed the suppression handshake instead).
  const priorArrows2 = t.edgeArrowsOn();
  const priorMap2 = t.minimapInfo().on;
  const runWas2 = t.G.running;
  t.setEdgeArrows(false); // a chevron parked on the inset column is not the subject
  t.setMinimap(true);
  enc.reset();
  enc.advance(1);
  enc.E.groups.length = 0;   // no spawn portals, no HOSTILES INBOUND line
  enc.E.enemies.length = 0;
  enc.E.orbs.length = 0;
  enc.E.state = "active";
  enc.E.seats[0].hull = enc.E.seats[0].hullMax;
  enc.E.xp = 1;              // OVERLOAD is refused, so the reason line is live
  t.G.running = true;        // the panel is a live-play layer
  const f0T = t.fieldToCanvas(0, 0), f1T = t.fieldToCanvas(1, 1);
  const fscaleT = f1T.x - f0T.x;
  // one readback of the whole FIELD rect, in backing-store pixels
  const regionT = () => {
    const a = t.fieldToCanvas(0, 0), b = t.fieldToCanvas(t.FW, t.FH);
    const x0 = Math.max(0, Math.floor(a.x)), y0 = Math.max(0, Math.floor(a.y));
    const x1 = Math.min(canvasEl.width, Math.ceil(b.x));
    const y1 = Math.min(canvasEl.height, Math.ceil(b.y));
    return { x0, y0, w: x1 - x0, h: y1 - y0,
      data: c2dT.getImageData(x0, y0, x1 - x0, y1 - y0).data };
  };
  // ...and the bounding box of every pixel two readbacks disagree on, back in
  // FIELD coordinates, which is the space the plan speaks
  const inkBoxT = (A, B) => {
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9, n = 0;
    for (let y = 0; y < A.h; y++) {
      for (let x = 0; x < A.w; x++) {
        const i = (y * A.w + x) * 4;
        if (A.data[i] !== B.data[i] || A.data[i + 1] !== B.data[i + 1] ||
            A.data[i + 2] !== B.data[i + 2] || A.data[i + 3] !== B.data[i + 3]) {
          n++;
          if (x < minx) minx = x;
          if (x > maxx) maxx = x;
          if (y < miny) miny = y;
          if (y > maxy) maxy = y;
        }
      }
    }
    if (!n) return null;
    return { px: n,
      x: (A.x0 + minx - f0T.x) / fscaleT, y: (A.y0 + miny - f0T.y) / fscaleT,
      r: (A.x0 + maxx + 1 - f0T.x) / fscaleT, b: (A.y0 + maxy + 1 - f0T.y) / fscaleT };
  };
  const hitsT = (p, q) => !!p && !!q && p.x < q.r && q.x < p.r && p.y < q.b && q.y < p.b;
  enc.E.shopHover = -1;
  t.render();
  const snapPlainT = regionT();
  enc.E.state = "idle";      // encDrawHud returns before it paints anything
  t.render();
  const snapNoHudT = regionT();
  enc.E.state = "active";
  // ...and the third layer in this band, which is transient rather than
  // permanent: the HOSTILES INBOUND line a warning state hangs on the y = 30
  // baseline. It is what HOVERUI.top = 40 exists to clear, and it is isolated
  // the same way — through E.state, since a warning frame differs from an
  // active one in that line and nothing else (the WAVE header reads the same
  // in both, and the field is bare).
  enc.E.state = "warning";
  t.render();
  const snapWarnT = regionT();
  enc.E.state = "active";
  t.setMinimap(false);
  t.render();
  const snapNoMapT = regionT();
  t.setMinimap(true);
  enc.E.shopHover = overT;
  const panelPlanT = enc.shopHoverPlan();
  t.render();
  const snapHoverT = regionT();
  const stackInkT = inkBoxT(snapPlainT, snapNoHudT);
  const mapInkT = inkBoxT(snapPlainT, snapNoMapT);
  const panelInkT = inkBoxT(snapPlainT, snapHoverT);
  ok("the hovered row's panel paints on the field and moves neither the status stack nor the corner map",
    !!stackInkT && !!mapInkT && !!panelInkT &&
    !hitsT(panelInkT, stackInkT) && !hitsT(panelInkT, mapInkT),
    JSON.stringify({ stack: stackInkT, map: mapInkT, panel: panelInkT }));
  // ...and the ink the hover moved really is this panel — its box, to the
  // pixel the letterbox rounds to — rather than some other layer reacting to
  // E.shopHover somewhere else on the field
  const roundT = 1 / fscaleT + 1e-6; // one backing-store pixel, in field units
  ok("the ink the hover moves is the panel's own box and nothing else",
    !!panelInkT && panelInkT.x >= panelPlanT.x - roundT &&
    panelInkT.y >= panelPlanT.y - roundT &&
    panelInkT.r <= panelPlanT.x + panelPlanT.w + roundT &&
    panelInkT.b <= panelPlanT.y + panelPlanT.h + roundT &&
    panelInkT.px > 0,
    JSON.stringify({ ink: panelInkT, box: [panelPlanT.x, panelPlanT.y, panelPlanT.w, panelPlanT.h] }));
  // the gaps, stated rather than merely asserted — this is the number that
  // decided against reusing the suppression handshake
  const gapLeftT = panelInkT ? panelInkT.x - stackInkT.r : -1;
  const gapRightT = panelInkT ? mapInkT.x - panelInkT.r : -1;
  ok("the panel's ink clears the status stack and the corner map with daylight to spare",
    gapLeftT > 1 && gapRightT > 1 &&
    panelInkT.x >= 0 && panelInkT.b <= t.FH && panelInkT.r <= t.FW,
    "leftGap=" + gapLeftT.toFixed(2) + " rightGap=" + gapRightT.toFixed(2) +
    " stackRight=" + stackInkT.r.toFixed(2) + " mapLeft=" + mapInkT.x.toFixed(2));
  // ...and it starts BELOW the warning line, which is the whole job of
  // HOVERUI.top: a wave landing while the player shops must still announce
  // itself. The warning's ink is measured, not assumed.
  const warnInkT = inkBoxT(snapPlainT, snapWarnT);
  ok("the panel starts below the HOSTILES INBOUND line, so a landing wave still announces itself",
    !!warnInkT && !hitsT(panelInkT, warnInkT) && panelInkT.y > warnInkT.b,
    JSON.stringify({ warn: warnInkT, panelTop: panelInkT && panelInkT.y,
      gap: warnInkT && panelInkT ? +(panelInkT.y - warnInkT.b).toFixed(2) : null }));
  enc.E.shopHover = -1;
  t.G.running = runWas2;
  t.setEdgeArrows(priorArrows2);
  t.setMinimap(priorMap2);
  t.render();
  // and the degenerate ratio: a headless caller, a collapsed gutter, or the
  // argument simply not passed draws the design sizes and does not throw — and
  // it KEEPS ITS PROSE. An unknown fit is not evidence that the name would be
  // illegible, the design picture has always had words in it, and a caller who
  // forgets the argument should get the panel it drew before any of this
  // existed rather than a silently wordless one.
  let planZero = null, planNeg = null, planNone = null, planThrew = "";
  try {
    planZero = enc.shopTextPlan(0);
    planNeg = enc.shopTextPlan(-3);
    planNone = enc.shopTextPlan();
  } catch (err) { planThrew = String(err); }
  ok("a degenerate ratio falls back to the design sizes, with its prose, instead of throwing",
    !planThrew && !!planZero && planZero.headerPx === 11 && planZero.walletPx === 11 &&
    planZero.namePx === 8 && planZero.pricePx === 9 && planZero.detailPx === 8 &&
    planZero.prose === true &&
    JSON.stringify(planNeg) === JSON.stringify(planZero) &&
    JSON.stringify(planNone) === JSON.stringify(planZero),
    planThrew || JSON.stringify(planZero));
  enc.E.xp = xpWasT; // the wallet goes back where the paused leg left it
  enc.E.owned = ownedWasT.slice(); // ...and so do the ranks the state sweep bought
  enc.E.seats[0].hull = hullWasT;  // ...and the hull the "ship down" state emptied
  enc.E.shopHover = hovWasT;

  // ---- S. restart resets the wallet, every rank counter and the hull cap ----
  // restart() resets field by field, so EVERY purchase field needs its own
  // reset line, and a missed one is invisible to the older checks — this
  // buys one of every row, then asserts each field died with the run.
  enc.reset();
  enc.advance(1);
  enc.addXp(500); // the panel sells mid-wave — no staged visit
  enc.buy(0); // RAPID LOADER
  enc.buy(1); // AFTERBURNER
  enc.buy(3); // MAX HULL — raises the cap to 4 and fills it
  enc.E.hull = 1;
  enc.buy(2); // HULL PATCH
  enc.buy(4); // BLAST CHARGE — row 4 since WSAD ENGINE CONTROLS left the catalog
  enc.buy(5); // ENERGY CELL   — the pool's three rows are APPENDED, so 5, 6 and 7
  enc.buy(6); // RECHARGER
  enc.buy(7); // OVERLOAD
  const preRestart = enc.state();
  ok("the staging really bought one of every row",
    preRestart.owned.join(",") === "1,1,1,1,1,1,1,1" &&
    preRestart.xp === 500 - 4 - 4 - 8 - 6 - 8 - 5 - 5 - 8 &&
    preRestart.hullMax === ECFG.player.hull + 1 && preRestart.hull === 2 &&
    preRestart.mods.cool === 1 / 1.15 && preRestart.mods.speed === 1 &&
    preRestart.mods.blast === 1 && preRestart.mods.enCell === 1 &&
    preRestart.mods.enRech === 1 && preRestart.mods.fury === 1,
    JSON.stringify({ owned: preRestart.owned, xp: preRestart.xp, hullMax: preRestart.hullMax }));
  enc.restart();
  s = enc.state();
  ok("restart zeroes the wallet and every purchase field — and key thrust, stock now, stays armed",
    s.xp === 0 && s.owned.every((n) => n === 0) && s.hullMax === ECFG.player.hull &&
    s.hull === ECFG.player.hull && s.mods.cool === 1 && s.mods.speed === 0 &&
    s.mods.keyThrust === true && s.mods.blast === 0 && s.mods.enCell === 0 &&
    s.mods.enRech === 0 && s.mods.fury === 0 && s.shopHover === -1 && s.state === "idle",
    JSON.stringify({ xp: s.xp, owned: s.owned, hullMax: s.hullMax, ring: s.mods.keyThrust, blast: s.mods.blast }));
  // ...and the pool restarts with the run, at the BASE cap the cleared ENERGY
  // CELL rank leaves behind — a seat that inherited a rank-4 cap it no longer
  // owns would fly the next run over its own ceiling
  ok("restart refills every seat's pool at the base cap",
    t.players.every((P) => P.energy === P.energyMax) &&
    Math.abs(t.players[0].energyMax - t.flightTunables().ENMAX) < 1e-9 &&
    t.players.every((P) => P.enIdle === 0),
    JSON.stringify({ energy: t.players[0].energy, max: t.players[0].energyMax }));

  // ---- T. WSAD ENGINE CONTROLS are stock: default-on thrust, no shop row ----
  // User feedback retired the purchase: the ring's THRUST role ships unlocked
  // (mods.keyThrust defaults true), stays unlocked across restart, and the
  // catalog carries no row for it any more. The field itself survives —
  // keyThrustUnlocked() still gates step()'s thrust sum — so these legs
  // measure the ship's velocity through the real input path rather than
  // reading the flag back, and prove the predicate still honors an explicit
  // re-lock. The AIM role never was gated and never is.
  const ringAimWas = t.aimState().AIMMODE;
  t.setAimMode("mouse");  // ...and this also releases the right button
  const ringInvWas = t.aimState().aiming; // right released, so aiming() IS the invert flag
  t.setInvert(true);      // the shipped default: the cursor aims, the ring thrusts
  enc.reset();
  enc.E.hull = 99;
  enc.advance(130); // a live, unfrozen wave — thrustImpulse refuses a frozen sim
  // one held ring key, one real tick: the speed the ring buys, in px/tick
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
  ok("the catalog carries no WSAD row — eight cards, none named for the ring",
    enc.shopInfo().length === 8 && enc.shopInfo().every((r) => r.name !== "WSAD ENGINE CONTROLS"),
    JSON.stringify(enc.shopInfo().map((r) => r.name)));
  ok("a fresh run opens with key thrust unlocked, and game.js agrees",
    enc.state().mods.keyThrust === true && t.keyThrustUnlocked() === true &&
    t.aimState().aiming === true,
    "flag=" + enc.state().mods.keyThrust + " unlocked=" + t.keyThrustUnlocked());
  const thrustFresh = ringThrust();
  ok("WSAD thrust moves the ship with zero purchases on a fresh run",
    thrustFresh > 0, "speed=" + thrustFresh);
  // ...and the comet hold never silences it: the keys are the default engine
  // control, so pressing right for the comet must AMPLIFY the ring's thrust
  // (COMETACC through thrustImpulse), never zero it — the regression where
  // aiming() alone gated keyDirection() left a keyboard pilot dead in space
  // for the whole hold
  t.setRightHeld(true); // comet WANTED, via the same client edge the button uses
  enc.advance(1);       // ...and one tick for the sim's gate to answer: the button
                        // states a want, energyStep turns it into the seat's flag,
                        // and thrustImpulse reads the flag — so the amplified thrust
                        // starts on the tick after the press, not on the press
  const thrustComet = ringThrust();
  t.setRightHeld(false);
  ok("holding right (comet mode) keeps WSAD thrust alive — and stronger",
    thrustComet > thrustFresh,
    "comet=" + thrustComet + " stock=" + thrustFresh);
  // ...and the aim role is untouched. That branch runs exactly when aiming()
  // is FALSE, which is exactly when the cursor is hidden and the ring is the
  // only aim control on the screen.
  t.setRightHeld(true); // mouse mode with invert on: right held hands the ring the aim
  t.G.aimed = false;
  t.G.aimAngle = 0;
  const ringWas = t.G.running;
  t.G.running = true; // flag only — the loop itself stays stopped
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
  t.G.running = ringWas;
  document.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));
  ok("the ring still snaps the aim while the mouse flies",
    t.aimState().aiming === false && t.G.aimed === true &&
    Math.abs(t.G.aimAngle + Math.PI / 2) < 1e-9,
    "aiming=" + t.aimState().aiming + " angle=" + t.G.aimAngle);
  t.setRightHeld(false);
  // The suppression handshake is GONE, not merely quiet. The old leg here
  // asserted that ringCardShown()/hudSuppressed() answered false under a live
  // hover, which they had done unconditionally since the WSAD row was retired
  // — a leg pinning a constant. What replaced it is a real property: the
  // hovered row's field panel clears both layers it used to displace, so
  // NOTHING on this namespace can stand the HUD down any more. (The clearance
  // itself is measured in section X, against real ink.)
  ok("no suppression lever survives on the encounter's namespace",
    window.Encounter.hudSuppressed === undefined &&
    window.Encounter.ringCardShown === undefined &&
    t.ringCardState === undefined && t.setRingReady === undefined,
    "hud=" + typeof window.Encounter.hudSuppressed +
    " ring=" + typeof window.Encounter.ringCardShown +
    " state=" + typeof t.ringCardState);
  // restart keeps the unlock — thrust is baseline equipment, not a purchase
  enc.restart();
  enc.E.hull = 99;
  enc.advance(130);
  t.setAimMode("mouse");
  t.setInvert(true);
  const thrustAfterRestart = ringThrust();
  ok("restart keeps key thrust unlocked, in the sim and on the flag",
    enc.state().mods.keyThrust === true && t.keyThrustUnlocked() === true &&
    thrustAfterRestart > 0,
    "speed=" + thrustAfterRestart + " flag=" + enc.state().mods.keyThrust);
  // the gate is honest state, not a constant: an explicit re-lock still stops
  // the thrust sum through the same predicate, and the pause copy still tells
  // the truth on both sides of it
  enc.mods.keyThrust = false;
  const thrustRelocked = ringThrust();
  const lockLines = t.pauseLines();
  const relockRead = t.keyThrustUnlocked();
  enc.mods.keyThrust = true;
  const freeLines = t.pauseLines();
  ok("an explicit re-lock still stops the thrust sum through the same gate",
    thrustRelocked === 0 && relockRead === false && t.keyThrustUnlocked() === true,
    "locked=" + thrustRelocked);
  ok("the pause copy claims key thrust exactly while the gate is open",
    /keys thrust/.test(freeLines[0]) && !/keys thrust/.test(lockLines.join(" ")),
    JSON.stringify({ lockLines, freeLines }));
  t.setInvert(ringInvWas);
  t.setAimMode(ringAimWas);

  // ---- T2. comet mode: rh through the ring, negation, ram damage, the cap ----
  // Right-hold is comet mode now. The flag is SIM state fed through the input
  // ring's rh field, so every leg here drives it the server way: a pre-formed
  // frame through pushInputFrame, drained by the raw camera-free stepSim —
  // never by reading client state. Expectations read the live tunables
  // (COMETDMG, BDMG, VMAX, COMETVMAX), so a tuned page cannot fake a failure.
  const cmInputWas = t.inputState().INPUTMODE;
  const cmLagWas = t.inputState().INPUTLAG;
  t.setInputMode("tick");
  t.setInputLag(0);
  const cmTun = enc.tunables();
  const cmFlight = t.flightTunables();
  const CF = (o) => ({ tx: 0, ty: 0, ax: 0, ay: 0, cx: ship().x, cy: ship().y - 100,
    fp: 0, fh: false, kx: 0, ky: 0, ...o });
  // (1) comet negates hitPlayer — the flag arrives through the input path
  enc.reset();
  t.stepSim(); // one raw tick out of idle; wave 1's first group is 126 ticks away
  t.pushInputFrame(0, CF({ rh: 1 }));
  t.stepSim();
  ok("a banked rh raises the seat's comet flag through the drain",
    t.players[0].comet === true && t.cometActive(0) === true,
    "comet=" + t.players[0].comet);
  const cmHull = enc.state().hull;
  ok("comet negates hitPlayer — no hull loss, no i-frames, no hitFlash",
    enc.damagePlayer(1) === false && enc.state().hull === cmHull &&
    enc.state().invuln === 0 && enc.E.seats[0].hitFlash === 0,
    "hull=" + enc.state().hull + " invuln=" + enc.state().invuln);
  t.pushInputFrame(0, CF({ rh: 0 }));
  t.stepSim();
  ok("rh released through the ring, the next hit lands again",
    t.players[0].comet === false && enc.damagePlayer(1) === true &&
    enc.state().hull === cmHull - 1,
    "comet=" + t.players[0].comet + " hull=" + enc.state().hull);
  // (2) contactEvent: COMETDMG while comet is on, BDMG when off — same touch
  const ramLeg = (rh) => {
    enc.reset();
    t.stepSim();
    enc.E.groups.length = 0; // no scheduled pack may join a staged touch
    enc.E.seats[0].hull = 99;
    t.pushInputFrame(0, CF({ rh }));
    t.stepSim(); // the flag lands; the ring is empty again, so it persists
    enc.spawnEnemy(ship().x + 200, ship().y, 0, "charger"); // hp 5 survives a comet touch
    const body = enc.E.enemies[0];
    body.x = ship().x; // parked overlapping — resolveContacts fires the touch
    body.y = ship().y;
    const hullWas = enc.state().hull;
    const hpWas = body.hp;
    t.stepSim();
    return { dHp: hpWas - body.hp, dHull: hullWas - enc.state().hull };
  };
  const ramOn = ramLeg(1);
  const ramOff = ramLeg(0);
  ok("a comet touch pays COMETDMG into the body and the ship pays nothing",
    ramOn.dHp === cmTun.COMETDMG && ramOn.dHull === 0, JSON.stringify(ramOn));
  ok("an ordinary touch pays BDMG and costs the ship the contact damage",
    ramOff.dHp === cmTun.BDMG && ramOff.dHull === ECFG.contact.dmgToPlayer,
    JSON.stringify(ramOff));
  // (3) the radial cap rises under comet and falls back on release
  enc.reset();
  t.stepSim();
  enc.E.groups.length = 0;
  enc.E.seats[0].hull = 99;
  for (let k = 0; k < 40; k++) { t.pushInputFrame(0, CF({ tx: 60, rh: 1 })); t.stepSim(); }
  const cmSpeedHeld = Math.hypot(t.G.vel.x, t.G.vel.y);
  for (let k = 0; k < 10; k++) { t.pushInputFrame(0, CF({ tx: 60, rh: 0 })); t.stepSim(); }
  const cmSpeedFree = Math.hypot(t.G.vel.x, t.G.vel.y);
  ok("the vcap clamp rises to VMAX × COMETVMAX under comet and falls back on release",
    Math.abs(cmSpeedHeld - cmFlight.VMAX * cmFlight.COMETVMAX) < 1e-6 &&
    Math.abs(cmSpeedFree - cmFlight.VMAX) < 1e-6,
    "held=" + cmSpeedHeld + " released=" + cmSpeedFree +
    " want=" + cmFlight.VMAX * cmFlight.COMETVMAX + "/" + cmFlight.VMAX);

  // ---- T3. the ENERGY pool: the gate, the price, the refill, the three rows ----
  // The pool is a GENERAL per-seat resource; comet mode is only its first
  // consumer. Every leg drives production code through the __test surface —
  // the pool's own API (energyCap/energyFrac/energyFill) and the real sliders
  // through bind() — and never re-implements the arithmetic, so a retune moves
  // the expectation with the code. Staged the server way, like T2 above: a
  // pre-formed frame through pushInputFrame, drained by the raw stepSim.
  // The suite still runs in tick mode here (T2's setters are restored at the
  // end of this section, not at the end of T2).
  const enShipR = typeof SHIP_R !== "undefined" ? SHIP_R : 7; // the sweep's own half-width
  const EN = () => t.flightTunables(); // read LIVE: every leg below moves a slider
  // one slider drive, and its undo — the same idiom the pause-UI suite uses, so
  // these legs go through bind() exactly as a human dragging the control does
  const enDrive = (id, v) => {
    const c = document.getElementById(id);
    const was = c.value;
    c.value = String(v);
    c.dispatchEvent(new Event("input", { bubbles: true }));
    return () => { c.value = was; c.dispatchEvent(new Event("input", { bubbles: true })); };
  };
  // a live wave with no scheduled pack and an unkillable seat: every leg here
  // is about the pool, and a dart arriving mid-measurement would be noise. The
  // held button is dropped explicitly — the want persists across ticks by
  // design (held input), so without this a leg would inherit the last leg's
  // hold and the gate would raise the comet on the prep's own tick.
  const enPrep = () => {
    enc.reset();
    t.players[0].input.cometWant = false;
    t.players[0].comet = false;
    t.stepSim();
    enc.E.groups.length = 0;
    enc.E.seats[0].hull = 99;
  };
  const EP = () => t.players[0];

  // (1) the drain, and the pool in the hash
  enPrep();
  const enStart = EP().energy;
  for (let k = 0; k < 10; k++) { t.pushInputFrame(0, CF({ rh: 1 })); t.stepSim(); }
  ok("a held comet drains the pool at COMETDRAIN per tick",
    EP().comet === true && Math.abs(enStart - EP().energy - 10 * EN().COMETDRAIN) < 1e-9,
    "start=" + enStart + " now=" + EP().energy + " drain=" + EN().COMETDRAIN);
  {
    const base = t.hashState();
    EP().energy -= 1;
    const moved = t.hashState();
    EP().energy += 1;
    EP().enIdle += 1;
    const movedIdle = t.hashState();
    EP().enIdle -= 1;
    ok("the pool and its recharge delay are both hashed",
      moved !== base && movedIdle !== base && t.hashState() === base,
      "base=" + base + " pool=" + moved + " idle=" + movedIdle);
  }

  // (2) the cut-out: an empty pool ends the comet with the button still held
  enPrep();
  t.pushInputFrame(0, CF({ rh: 1 }));
  t.stepSim();
  EP().energy = 2 * EN().COMETDRAIN; // two ticks of fuel, staged like a hull
  t.pushInputFrame(0, CF({ rh: 1 }));
  t.stepSim();
  const enCutMid = EP().comet;
  t.pushInputFrame(0, CF({ rh: 1 }));
  t.stepSim(); // the last drop goes here
  const enAtZero = { comet: EP().comet, energy: EP().energy };
  t.pushInputFrame(0, CF({ rh: 1 }));
  t.stepSim(); // dry, and the button is STILL held
  ok("the comet cuts out at an empty pool even with the button still held",
    enCutMid === true && enAtZero.comet === true && enAtZero.energy === 0 &&
    EP().comet === false && EP().input.cometWant === true,
    JSON.stringify({ mid: enCutMid, atZero: enAtZero, comet: EP().comet, want: EP().input.cometWant }));

  // (3) the re-arm floor, and (4) the asymmetry a running comet keeps.
  // The regen is switched off for the leg, so the pool sits exactly where it is
  // put and the floor is the only thing that can move the flag.
  {
    const undoRegen = enDrive("energy-regen", 0);
    enPrep();
    const enFloorCap = t.energyCap(0);
    const enFloor = enFloorCap * EN().ENARM;
    EP().energy = enFloor - EN().COMETDRAIN; // one drain's worth UNDER the line
    EP().enIdle = 0;
    let enReArmed = false;
    for (let k = 0; k < 8; k++) {
      t.pushInputFrame(0, CF({ rh: 1 }));
      t.stepSim();
      if (EP().comet) enReArmed = true;
    }
    ok("a comet will not re-arm below ENARM × cap, however long the button is held",
      !enReArmed && Math.abs(EP().energy - (enFloor - EN().COMETDRAIN)) < 1e-9,
      "floor=" + enFloor + " energy=" + EP().energy + " armed=" + enReArmed);
    EP().energy = enFloor; // ...and EXACTLY at the line it does
    t.pushInputFrame(0, CF({ rh: 1 }));
    t.stepSim();
    ok("...and it re-arms at exactly the floor, paying the tick's drain",
      EP().comet === true && Math.abs(EP().energy - (enFloor - EN().COMETDRAIN)) < 1e-9,
      "comet=" + EP().comet + " energy=" + EP().energy);
    for (let k = 0; k < 10; k++) { t.pushInputFrame(0, CF({ rh: 1 })); t.stepSim(); }
    ok("a RUNNING comet keeps running below the floor — the arm rule is asymmetric",
      EP().comet === true && EP().energy < enFloor && EP().energy > 0,
      "energy=" + EP().energy + " floor=" + enFloor);
    undoRegen();
  }

  // (5) the recharge delay, and (6) the regen rate and its ceiling
  {
    const undoRegen = enDrive("energy-regen", 1); // a whole point per tick reads exactly
    const undoDelay = enDrive("energy-delay", 5);
    enPrep();
    for (let k = 0; k < 20; k++) { t.pushInputFrame(0, CF({ rh: 1 })); t.stepSim(); } // spend
    const enBurnt = EP().energy;
    for (let k = 0; k < EN().ENDELAY; k++) { t.pushInputFrame(0, CF({ rh: 0 })); t.stepSim(); }
    const enHeldOff = EP().energy;
    t.pushInputFrame(0, CF({ rh: 0 }));
    t.stepSim();
    const enFirstTick = EP().energy;
    ok("ENDELAY holds the recharge off for exactly that many ticks after the last spend",
      enHeldOff === enBurnt && Math.abs(enFirstTick - enBurnt - EN().ENREGEN) < 1e-9,
      "burnt=" + enBurnt + " heldOff=" + enHeldOff + " first=" + enFirstTick);
    for (let k = 0; k < 9; k++) { t.pushInputFrame(0, CF({ rh: 0 })); t.stepSim(); }
    const enTenTicks = EP().energy;
    for (let k = 0; k < 400; k++) { t.pushInputFrame(0, CF({ rh: 0 })); t.stepSim(); }
    ok("ENREGEN refills at the stated rate and never past the cap",
      Math.abs(enTenTicks - enBurnt - 10 * EN().ENREGEN) < 1e-9 &&
      EP().energy === EP().energyMax && EP().energyMax === t.energyCap(0),
      "ten=" + enTenTicks + " full=" + EP().energy + " cap=" + EP().energyMax);
    undoDelay();
    undoRegen();
  }

  // (7) COMETHIT — the WORK price, billed by BOTH halves of the knob
  {
    // a ram, measured against the same ram at the shipped 0: the difference is
    // the knob and nothing else (the tick's own COMETDRAIN cancels out)
    const enRamCost = () => {
      enPrep();
      t.pushInputFrame(0, CF({ rh: 1 }));
      t.stepSim(); // the flag lands; the ring is empty, so it persists
      enc.spawnEnemy(ship().x + 200, ship().y, 0, "charger");
      const body = enc.E.enemies[0];
      body.x = ship().x;
      body.y = ship().y;
      const was = EP().energy;
      t.stepSim();
      return was - EP().energy;
    };
    const enRamFree = enRamCost();
    const undoHit = enDrive("comet-hit", 10);
    const enRamPaid = enRamCost();
    // ...and the other half: a negated incoming hit is work too
    enPrep();
    t.pushInputFrame(0, CF({ rh: 1 }));
    t.stepSim();
    const enNegWas = EP().energy;
    const enNegated = enc.damagePlayer(1);
    const enNegCost = enNegWas - EP().energy;
    undoHit();
    // a BODY ram is both halves of the knob at once — contactEvent negates the
    // body's contact damage through hitPlayer AND deals the comet's own — so it
    // bills twice, while a beam the comet merely eats bills once. That is the
    // knob reading what it says: one charge per COMET EVENT, not per touch.
    ok("COMETHIT bills the ram and the negation alike, and ships inert at 0",
      Math.abs(enRamFree - EN().COMETDRAIN) < 1e-9 &&
      Math.abs(enRamPaid - enRamFree - 20) < 1e-9 &&
      enNegated === false && Math.abs(enNegCost - 10) < 1e-9,
      "free=" + enRamFree + " paid=" + enRamPaid + " negation=" + enNegCost);
  }

  // (7b) COMETCD — the comet's bite RATE, split off CONTACTCD.
  // The rate is what prices COMETHIT and pays OVERLOAD, so it needed its own
  // knob; the two must move independently in BOTH directions, and at the
  // shipped 62 they must be indistinguishable — that last claim is what keeps
  // the committed traces honest about this being a day-one no-op.
  {
    // how many contact CLAIMS a parked body pays over a stretch of ticks. The
    // body is put back on the ship each tick and healed, so a touch is
    // available on every one of them and the cooldown is the only gate.
    // contactsDealt is contactEvent's own counter — the claim, not the damage.
    const enBites = (rh, ticks) => {
      enPrep();
      enc.E.seats[0].hull = 9999; // the non-comet leg really takes the contact damage
      if (rh) { t.pushInputFrame(0, CF({ rh: 1 })); t.stepSim(); }
      enc.spawnEnemy(ship().x + 200, ship().y, 0, "dart");
      const body = enc.E.enemies[0];
      const was = enc.E.contactsDealt;
      for (let k = 0; k < ticks; k++) {
        body.x = ship().x;
        body.y = ship().y;
        body.vx = 0;
        body.vy = 0;
        body.hp = 9999; // a comet ram would otherwise kill it inside the window
        t.stepSim();
      }
      return enc.E.contactsDealt - was;
    };
    const enPaceTicks = 130; // shorter than the pool: the comet must not cut out mid-count
    const enPaceCometBase = enBites(1, enPaceTicks);
    const enPaceRamBase = enBites(0, enPaceTicks);
    const undoCometCd = enDrive("comet-cd", 10); // only the COMET's rate moves
    const enPaceCometFast = enBites(1, enPaceTicks);
    const enPaceRamHeld = enBites(0, enPaceTicks);
    undoCometCd();
    const undoContactCd = enDrive("contactcd", 10); // ...and now only the NORMAL ram's
    const enPaceRamFast = enBites(0, enPaceTicks);
    const enPaceCometHeld = enBites(1, enPaceTicks);
    undoContactCd();
    ok("at the shipped defaults COMETCD and CONTACTCD are indistinguishable",
      enc.tunables().COMETCD === enc.tunables().CONTACTCD &&
      enPaceCometBase === enPaceRamBase && enPaceCometBase > 0,
      "comet=" + enPaceCometBase + " ram=" + enPaceRamBase +
      " cd=" + enc.tunables().COMETCD + "/" + enc.tunables().CONTACTCD);
    ok("COMETCD paces comet touches alone — a normal ram's rate never follows it",
      enPaceCometFast > enPaceCometBase && enPaceRamHeld === enPaceRamBase,
      "comet=" + enPaceCometFast + " (was " + enPaceCometBase + ") ram=" +
      enPaceRamHeld + " (was " + enPaceRamBase + ")");
    ok("...and the reverse: CONTACTCD paces a normal ram alone, and the comet never follows",
      enPaceRamFast > enPaceRamBase && enPaceCometHeld === enPaceCometBase,
      "ram=" + enPaceRamFast + " (was " + enPaceRamBase + ") comet=" +
      enPaceCometHeld + " (was " + enPaceCometBase + ")");
  }

  // (8) COMETTHR — a burning comet costs more than a coasting one
  {
    const undoThr = enDrive("comet-thr", 2);
    enPrep();
    t.pushInputFrame(0, CF({ rh: 1 }));
    t.stepSim(); // the flag lands
    const enCoastWas = EP().energy;
    t.pushInputFrame(0, CF({ rh: 1 }));
    t.stepSim(); // ...and a tick with no thrust at all
    const enCoast = enCoastWas - EP().energy;
    const enBurnWas = EP().energy;
    t.pushInputFrame(0, CF({ rh: 1, tx: 8, ty: 5 }));
    t.stepSim();
    const enBurn = enBurnWas - EP().energy;
    undoThr();
    ok("COMETTHR prices the thrust: a burning comet costs more than a coasting one",
      Math.abs(enCoast - EN().COMETDRAIN) < 1e-9 && enBurn > enCoast,
      "coast=" + enCoast + " burn=" + enBurn);
  }

  // (9) ENORB — salvage tops the pool up, and ships switched off
  {
    const undoRegen = enDrive("energy-regen", 0); // only the orb may move the pool
    const enOrbGain = () => {
      enPrep();
      EP().energy = t.energyCap(0) - 40; // room UNDER THE CAP for a refill to show —
                                         // read off the live cap, never a magic number,
                                         // or an ENMAX retune buries the 20 the orb adds
      EP().enIdle = 0;
      enc.E.orbs.push({ id: 9001, x: ship().x, y: ship().y, vx: 0, vy: 0 });
      const was = EP().energy;
      t.pushInputFrame(0, CF({ rh: 0 }));
      t.stepSim();
      return { gain: EP().energy - was, orbs: enc.E.orbs.length };
    };
    const enOrbOff = enOrbGain();
    const undoOrb = enDrive("energy-orb", 20);
    const enOrbOn = enOrbGain();
    undoOrb();
    undoRegen();
    ok("ENORB tops the pool up on pickup, and the shipped 0 leaves it alone",
      enOrbOff.gain === 0 && enOrbOff.orbs === 0 &&
      enOrbOn.gain === 20 && enOrbOn.orbs === 0,
      JSON.stringify({ off: enOrbOff, on: enOrbOn }));
  }

  // (10) ENERGY CELL — the cap rises per rank, and the purchase deals it filled
  {
    enPrep();
    const enCellIdx = enc.shopInfo().findIndex((r) => r.name === "ENERGY CELL");
    const enCapBase = t.energyCap(0);
    EP().energy = 10; // drained, so the fill is observable rather than assumed
    enc.addXp(1000);
    const enBought = enc.buy(enCellIdx);
    const enCap1 = t.energyCap(0);
    const enFilled = { energy: EP().energy, max: EP().energyMax, idle: EP().enIdle };
    enc.buy(enCellIdx); // rank 2 — re-derived from the rank, never compounded
    const enCap2 = t.energyCap(0);
    ok("ENERGY CELL raises the cap by ENCELL × ENMAX per rank and deals the seat filled",
      enBought === true && enCellIdx >= 0 &&
      Math.abs(enCap1 - enCapBase - EN().ENCELL * EN().ENMAX) < 1e-9 &&
      Math.abs(enCap2 - enCapBase - 2 * EN().ENCELL * EN().ENMAX) < 1e-9 &&
      enFilled.energy === enCap1 && enFilled.max === enCap1 && enFilled.idle === 0,
      JSON.stringify({ base: enCapBase, r1: enCap1, r2: enCap2, filled: enFilled }));
  }

  // (11) RECHARGER — the regen rate rises per rank, measured through the sim
  {
    const undoDelay = enDrive("energy-delay", 0); // no delay to wait out between reads
    enPrep();
    const enRegenTick = () => {
      EP().energy = 10;
      EP().enIdle = 0;
      const was = EP().energy;
      t.pushInputFrame(0, CF({ rh: 0 }));
      t.stepSim();
      return EP().energy - was;
    };
    const enRegen0 = enRegenTick();
    enc.addXp(1000);
    enc.buy(enc.shopInfo().findIndex((r) => r.name === "RECHARGER"));
    const enRegen1 = enRegenTick();
    undoDelay();
    ok("RECHARGER raises the regen rate by ENRECH per rank",
      Math.abs(enRegen0 - EN().ENREGEN) < 1e-9 &&
      Math.abs(enRegen1 - EN().ENREGEN * (1 + EN().ENRECH)) < 1e-9,
      "rank0=" + enRegen0 + " rank1=" + enRegen1 + " regen=" + EN().ENREGEN);
  }

  // (12) OVERLOAD — a draining comet bites harder, and rank 0 changes nothing
  {
    const enFuryIdx = enc.shopInfo().findIndex((r) => r.name === "OVERLOAD");
    // `energy` null means "leave the pool full" — the cap has to be read INSIDE
    // the leg, because enPrep's restart clears every rank the cap is derived from
    const enFuryRam = (energy, ranks) => {
      enPrep();
      if (ranks) { enc.addXp(1000); for (let k = 0; k < ranks; k++) enc.buy(enFuryIdx); }
      t.pushInputFrame(0, CF({ rh: 1 }));
      t.stepSim();
      EP().energy = energy === null ? t.energyCap(0) : energy;
      enc.spawnEnemy(ship().x + 200, ship().y, 0, "charger");
      const body = enc.E.enemies[0];
      body.x = ship().x; // parked ON the ship: the touch cannot depend on how
      body.y = ship().y; // far the body walked this tick
      const hpWas = body.hp;
      t.stepSim();
      // the frac contactEvent actually read: energyStep drains BEFORE the
      // encounter steps, so the post-drain fraction is the honest denominator
      return { dHp: hpWas - body.hp, frac: t.energyFrac(0), rank: enc.state().mods.fury };
    };
    const enFury0Full = enFuryRam(null, 0);
    const enFury0Low = enFuryRam(5, 0);
    const enFury3Low = enFuryRam(5, 3);
    const enFury3Full = enFuryRam(null, 3);
    const enWant = (r, frac) => cmTun.COMETDMG * (1 + EN().COMETFURY * r * (1 - frac));
    ok("OVERLOAD rank 0 changes nothing: a comet ram pays COMETDMG at any pool level",
      Math.abs(enFury0Full.dHp - cmTun.COMETDMG) < 1e-9 &&
      Math.abs(enFury0Low.dHp - cmTun.COMETDMG) < 1e-9,
      JSON.stringify({ full: enFury0Full, low: enFury0Low }));
    ok("OVERLOAD makes a near-empty comet bite harder than a full one, linearly in the pool",
      enFury3Low.rank === 3 && enFury3Low.dHp > enFury3Full.dHp &&
      Math.abs(enFury3Low.dHp - enWant(3, enFury3Low.frac)) < 1e-9 &&
      Math.abs(enFury3Full.dHp - enWant(3, enFury3Full.frac)) < 1e-9,
      JSON.stringify({ low: enFury3Low, full: enFury3Full }));
  }

  // (13) COMETAOEDMG — the halo becomes real reach, and the shipped 0 does not
  {
    // Parked 15 px beyond body contact and held still: at the shipped 0 the
    // sweep must miss, and a wide reach must catch it. The gap is 15 rather
    // than 1 on purpose — the body still takes its own step before the sweep
    // runs, and no archetype closes 15 px in one tick, so the leg measures the
    // REACH and never the enemy's walk.
    const enReachHit = (aoe) => {
      const undo = enDrive("comet-aoedmg", aoe);
      enPrep();
      t.pushInputFrame(0, CF({ rh: 1 }));
      t.stepSim(); // full pool, comet up — the reach is at its widest
      enc.spawnEnemy(ship().x + 400, ship().y, 0, "charger");
      const body = enc.E.enemies[0];
      body.x = ship().x + body.r + enShipR + 15;
      body.y = ship().y;
      body.vx = 0;
      body.vy = 0;
      const hpWas = body.hp;
      t.stepSim();
      const hit = hpWas - body.hp > 0;
      undo();
      return hit;
    };
    const enReachOff = enReachHit(0);
    const enReachOn = enReachHit(40);
    ok("COMETAOEDMG widens the contact sweep, and at the shipped 0 the reach is exactly e.r + SHIP_R",
      enReachOff === false && enReachOn === true,
      "shipped=" + enReachOff + " widened=" + enReachOn);
  }

  // (14) a dead seat neither burns nor rams, and comes back on a full pool
  {
    enPrep();
    t.pushInputFrame(0, CF({ rh: 1 }));
    t.stepSim();
    enc.E.seats[0].hull = 1;
    enc.damagePlayer(99); // ...but a comet negates it, so drop the flag first
    EP().input.cometWant = false;
    t.pushInputFrame(0, CF({ rh: 0 }));
    t.stepSim();
    enc.damagePlayer(99);
    const enDown = enc.E.seats[0].hull <= 0;
    EP().energy = 20;
    EP().input.cometWant = true; // the corpse holds the button down
    t.stepSim();
    const enCorpse = { comet: EP().comet, energy: EP().energy };
    enc.respawnSeat(0);
    ok("a dead seat neither burns nor rams, and respawn returns it on a full pool",
      enDown && enCorpse.comet === false && enCorpse.energy >= 20 &&
      EP().energy === EP().energyMax && EP().energyMax === t.energyCap(0) && EP().enIdle === 0,
      JSON.stringify({ down: enDown, corpse: enCorpse, after: EP().energy, cap: EP().energyMax }));
    EP().input.cometWant = false;
  }

  // (15) the halo tracks the pool. Computed, never pixel-probed: the pixel
  // sections deliberately never raise the comet flag around their ink
  // comparisons, so the readout is asserted as the arithmetic drawCometGlow does
  {
    enPrep();
    t.pushInputFrame(0, CF({ rh: 1 }));
    t.stepSim();
    EP().energy = t.energyCap(0); // the tick's own drain put it just under full
    const enHaloFull = enShipR + EN().COMETAOE * t.energyFrac(0);
    EP().energy = t.energyCap(0) / 2;
    const enHaloHalf = enShipR + EN().COMETAOE * t.energyFrac(0);
    EP().energy = 0;
    const enHaloDry = enShipR + EN().COMETAOE * t.energyFrac(0);
    // the dry case is the one with teeth: EXACTLY the ship's own radius, with no
    // floor left holding a ring around a spent comet
    ok("the comet halo grows with the pool and collapses onto the bare hull as it empties",
      Math.abs(enHaloFull - (enShipR + EN().COMETAOE)) < 1e-6 &&
      Math.abs(enHaloHalf - (enShipR + EN().COMETAOE / 2)) < 1e-6 &&
      Math.abs(enHaloDry - enShipR) < 1e-9,
      "full=" + enHaloFull + " half=" + enHaloHalf + " dry=" + enHaloDry);
  }

  t.setInputMode(cmInputWas);
  t.setInputLag(cmLagWas);
  enc.reset();

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
  const blastRanks = (n) => { // n ranks, bought mid-wave — the panel needs no visit
    enc.addXp(1000);
    for (let k = 0; k < n; k++) enc.buy(blastIdx);
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
  enc.addXp(1000); // mid-wave — the panel needs no staged visit
  ok("the catalog's fifth row is BLAST CHARGE, unowned and unmaxed",
    blastIdx === 4 && enc.shopInfo()[blastIdx].owned === 0 &&
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
  // the last card sells through the real pointer path, click and all
  enc.restart();
  enc.advance(1);
  enc.addXp(8);
  clickCard(blastIdx);
  s = enc.state();
  ok("a click on the last card buys the last row, mid-wave",
    s.mods.blast === 1 && s.owned[blastIdx] === 1 && s.xp === 0 && s.state === "warning",
    "rank=" + s.mods.blast + " xp=" + s.xp + " state=" + s.state);
  // The column itself: every card lands wholly inside the panel's logical
  // space, no two cards overlap, and the header and detail bands sit clear
  // of the column. This is the check that fails the day a ninth row
  // outgrows the panel height game.js is fitting into the gutter — the pool's
  // three rows already took it from five cards to eight, and panelPlace scales
  // the whole taller column into the same gutter, so every card draws smaller.
  const lay = enc.shopLayout();
  const onPanel = lay.cards.every((c) => c.x >= 0 && c.y >= 0 && c.x + c.w <= lay.w && c.y + c.h <= lay.h);
  const colBottom = Math.max(...lay.cards.map((c) => c.y + c.h));
  let overlap = false;
  for (let a = 0; a < lay.cards.length; a++) {
    for (let b = a + 1; b < lay.cards.length; b++) {
      const p = lay.cards[a], q = lay.cards[b];
      if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) overlap = true;
    }
  }
  ok("eight cards, the header and the hint band all fit the panel without overlapping",
    lay.cards.length === 8 && onPanel && !overlap &&
    lay.headerY < lay.cards[0].y && lay.detailTop >= colBottom && lay.detailTop < lay.h &&
    lay.h === lay.detailTop + lay.detailH,
    JSON.stringify({ onPanel, overlap, colBottom, detailTop: lay.detailTop,
      detailH: lay.detailH, h: lay.h }));
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
  // deal wave w directly through the sim's own startWave (enc.dealWave) —
  // the same call encStep makes when a clear hold expires, so the per-wave
  // scaling the late-wave legs are about is the production deal
  const jumpTo = (w) => {
    enc.reset();
    if (w > 1) enc.dealWave(w);
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
  // ordnance lives inside encStep, so the ONE remaining freeze — the dead
  // screen — holds it too, and a wave-clear banner (a live world) does not
  bare();
  const misHeld = enc.spawnMissile(ship().x, ship().y - 1400, 0);
  const misDead = enc.E.state; // remember the live state the stage interrupts
  enc.E.state = "dead";
  const misHeldX = misHeld.x;
  const misHeldY = misHeld.y;
  enc.advance(40);
  ok("the dead freeze holds the ordnance mid-flight, like everything else in the sim",
    enc.frozen() && misHeld.x === misHeldX && misHeld.y === misHeldY && enc.state().missiles === 1,
    "frozen=" + enc.frozen() + " moved=" + (misHeld.x !== misHeldX || misHeld.y !== misHeldY));
  enc.E.state = misDead;
  enc.advance(1);
  ok("...and a live tick moves it again — no other screen freezes the sim",
    misHeld.x !== misHeldX || misHeld.y !== misHeldY);
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
    enc.dealWave(5);
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

  // ---- AC. per-seat upgrade terms — phase 08.5 ----
  // Every rank, price and effect is PERSONAL now: termsFor(seat) is the one
  // derivation, and the panel draws the LOCAL seat's view (seat 0 until
  // phase 09 lands localSeat). The pixel legs extend section R's draw-level
  // probes: the drawn card must IGNORE another seat's purchase and MOVE for
  // the local seat's — both directions, so a panel that stopped reading
  // ranks at all cannot pass as "nothing moved".
  t.setPlayerCount(2);
  enc.restart();
  enc.addXp(100, 0);
  enc.addXp(100, 1);
  const acAB = enc.shopInfo().findIndex((r) => r.name === "AFTERBURNER");
  const acRL = enc.shopInfo().findIndex((r) => r.name === "RAPID LOADER");
  // the derivation itself, both seats stock
  ok("termsFor derives stock terms for both fresh seats, and a missing seat derives stock",
    enc.termsFor(0).speed === 0 && enc.termsFor(1).speed === 0 &&
    Math.abs(enc.termsFor(0).cool - 1) < 1e-12 && enc.termsFor(9).speed === 0 &&
    enc.termsFor(9).cool === 1,
    JSON.stringify({ t0: enc.termsFor(0), ghost: enc.termsFor(9) }));
  // the drawn card, before any purchase
  const acPlace = t.panelPlaceFor("shop");
  const acLay = enc.shopLayout();
  const acCard = acLay.cards[acAB];
  const acStrip = () => { // a grid across the card's lower band — price text
    const pts = [];      // and rank pips both live there at every fit
    for (let px = 2; px <= acCard.w - 2; px += 4) {
      for (let py = Math.round(acCard.h * 0.55); py <= acCard.h - 2; py += 3) {
        const q = panelField(acPlace, acCard.x + px, acCard.y + py);
        pts.push(arrPx(q.x, q.y));
      }
    }
    return pts.join("|");
  };
  t.render();
  const acInkStock = acStrip();
  // seat 1 buys — the LOCAL panel must not move an ink grain
  const acSale1 = enc.buy(acAB, 1);
  t.render();
  const acInkAfterRemote = acStrip();
  ok("a REMOTE seat's purchase moves nothing on the drawn local card",
    acSale1 === true && acInkAfterRemote === acInkStock,
    "sale=" + acSale1 + " moved=" + (acInkAfterRemote !== acInkStock));
  ok("...while the remote seat's own price doubled and the local seat's did not",
    enc.shopInfo(1)[acAB].cost === 8 && enc.shopInfo(0)[acAB].cost === 4 &&
    enc.shopPriceLabel(acAB) === "4 XP" && enc.shopPriceLabel(acAB, 1) === "8 XP",
    JSON.stringify({ s0: enc.shopInfo(0)[acAB].cost, s1: enc.shopInfo(1)[acAB].cost }));
  // seat 0 buys — the SAME probe must move (the non-vacuity direction)
  const acSale0 = enc.buy(acAB, 0);
  t.render();
  const acInkAfterLocal = acStrip();
  ok("the LOCAL seat's purchase moves the drawn card — the probe is live, not a scrim",
    acSale0 === true && acInkAfterLocal !== acInkStock,
    "sale=" + acSale0 + " moved=" + (acInkAfterLocal !== acInkStock));
  // effects isolated at the derivation: fire cooldown, blast radius
  enc.buy(acRL, 1);
  ok("RAPID LOADER on seat 1 leaves seat 0's cooldown term at stock",
    Math.abs(enc.termsFor(1).cool - 1 / 1.15) < 1e-12 && enc.termsFor(0).cool === 1,
    JSON.stringify({ c1: enc.termsFor(1).cool, c0: enc.termsFor(0).cool }));
  ok("blastRadius sizes off the asked seat's own rank",
    enc.blastRadius(0) === 0 && enc.blastRadius(1) === 0 &&
    (enc.E.seats[1].owned[enc.shopInfo().findIndex((r) => r.name === "BLAST CHARGE")] = 2,
     enc.blastRadius(1) > 0 && enc.blastRadius(0) === 0),
    JSON.stringify({ r0: enc.blastRadius(0), r1: enc.blastRadius(1) }));
  // the term epoch: one step per sale, one step per reset, NEVER backwards —
  // and a restart resets every seat's ranks through the same primitive
  const acSeq1 = enc.E.seats[1].termSeq;
  const acSeq0 = enc.E.seats[0].termSeq;
  enc.buy(acAB, 1);
  ok("a sale steps the buyer's termSeq alone",
    enc.E.seats[1].termSeq === acSeq1 + 1 && enc.E.seats[0].termSeq === acSeq0,
    JSON.stringify({ acSeq1, now1: enc.E.seats[1].termSeq, now0: enc.E.seats[0].termSeq }));
  enc.resetSeatUpgrades(1);
  ok("resetSeatUpgrades clears ONE seat's ranks, steps ITS epoch, and touches no other seat",
    enc.E.seats[1].owned.every((n) => n === 0) && enc.E.seats[1].termSeq === acSeq1 + 2 &&
    enc.E.seats[0].owned[acAB] === 1 && enc.E.seats[0].termSeq === acSeq0,
    JSON.stringify({ owned1: enc.E.seats[1].owned, owned0: enc.E.seats[0].owned }));
  const acSeqPre = enc.E.seats[0].termSeq;
  enc.restart();
  ok("a restart resets every seat's ranks and still INCREMENTS the epochs — never rewinds",
    enc.E.seats[0].owned.every((n) => n === 0) && enc.E.seats[1].owned.every((n) => n === 0) &&
    enc.E.seats[0].termSeq === acSeqPre + 1,
    JSON.stringify({ pre: acSeqPre, post: enc.E.seats[0].termSeq }));
  // a DOWNED seat may browse but not buy — and the refusal touches no rank
  // on any seat (the phase-08 rule, restated per seat)
  enc.addXp(50, 1);
  enc.E.seats[1].hull = 0;
  ok("a downed seat's buy is refused and no seat's ranks move",
    enc.buy(acAB, 1) === false && enc.E.seats[1].owned[acAB] === 0 &&
    enc.E.seats[0].owned[acAB] === 0 && enc.E.seats[1].xp === 50,
    JSON.stringify({ owned1: enc.E.seats[1].owned[acAB], xp1: enc.E.seats[1].xp }));
  t.setPlayerCount(1);
  enc.restart();

  // ---- AD. the wipe reads ALL seats, and its window is inclusive ----------
  // Two seats. Each stage deals a wave and then EMPTIES the schedule, so 600
  // quiet ticks can pass without a pack landing and killing a seat by accident:
  // these legs are about the wave number and the seat clock, nothing else. An
  // empty group list also keeps the state at "warning", so the clear elevator
  // never deals a wave behind the check's back.
  {
    t.setPlayerCount(2);
    const adDeal = (n) => { enc.dealWave(n); enc.E.groups = []; };
    enc.restart();
    enc.advance(1);
    adDeal(4);
    enc.damagePlayer(99, 0);
    enc.advance(1);
    ok("one seat of two going down is no wipe — the rule is ALL seats, not any",
      enc.state().wave === 4 && enc.state().seats[1].hull > 0,
      "wave=" + enc.state().wave + " hull1=" + enc.state().seats[1].hull);
    enc.damagePlayer(99, 1);
    enc.advance(1);
    ok("...and the LAST seat going down is",
      enc.state().wave === 1 && enc.state().state === "warning",
      "wave=" + enc.state().wave + " state=" + enc.state().state);
    // the FAR edge: seat 0's timer has already expired, so seat 1's death
    // leaves a live seat and nothing arms. The window has an end.
    enc.restart();
    enc.advance(1);
    adDeal(6);
    enc.damagePlayer(99, 0);
    enc.advance(ECFG.player.respawn); // the timer expires on the last of these ticks
    enc.damagePlayer(99, 1);
    enc.advance(1);
    ok("a death with the other seat already back is no wipe",
      enc.state().wave === 6 && enc.state().seats[0].hull > 0,
      "wave=" + enc.state().wave + " hull0=" + enc.state().seats[0].hull);
    // ...and ONE TICK inside it: seat 1 dies on the tick seat 0's timer would
    // have expired. The wipe still fires, because the sample runs ABOVE the
    // respawn loop — and seat 0 is dealt back in on that very same tick.
    enc.restart();
    enc.advance(1);
    adDeal(6);
    enc.damagePlayer(99, 0);
    enc.advance(ECFG.player.respawn - 1);
    enc.damagePlayer(99, 1);
    enc.advance(1);
    ok("the window is inclusive to its last tick — the sample runs before the revival",
      enc.state().wave === 1 && enc.state().seats[0].hull > 0 &&
      enc.state().seats[1].hull === 0,
      "wave=" + enc.state().wave + " hull0=" + enc.state().seats[0].hull +
      " hull1=" + enc.state().seats[1].hull);
    // the ARM reads all seats too, and this is the leg that says so: one seat
    // of two dying under the clear banner leaves a live seat, so nothing arms
    // and the elevator deals the next wave on schedule. An arm on every death
    // would hold the elevator for a tick it has no wipe to protect.
    enc.restart();
    enc.advance(1);
    adDeal(4);
    enc.advance(5);
    enc.E.state = "cleared";
    enc.E.clearTick = enc.E.waveTick - ECFG.clearHold;
    enc.damagePlayer(99, 0);
    enc.advance(1);
    ok("a non-final death arms nothing and never holds the clear elevator",
      enc.state().wave === 5 && enc.E.wipePending === false,
      "wave=" + enc.state().wave + " pending=" + enc.E.wipePending);
    t.setPlayerCount(1);
    enc.restart();
  }

  // ---- (PvP) players are dangerous to each other, and only a PLAYER kill
  // takes a run away. Two seats, staged directly: hitPlayer's third argument
  // is the damage SOURCE, and everything below turns on whether it is present.
  {
    t.setPlayerCount(2);
    const pvInputWas = t.inputState().INPUTMODE;
    t.setInputMode("tick");
    t.setInputLag(0);
    const PF = (o) => ({ tx: 0, ty: 0, ax: 0, ay: 0, fp: 0, fh: false, kx: 0, ky: 0, cx: 0, cy: 0, ...o });
    const pvPrep = () => {
      enc.restart(9114);
      enc.E.groups = [];
      enc.E.enemies.length = 0;
      t.G.bullets.length = 0;
      t.G.started = true;
      t.G.running = true;
      for (const P of t.players) { P.comet = false; P.input.cometWant = false; P.vel.x = 0; P.vel.y = 0; }
      for (let s = 0; s < t.players.length; s++) t.energyFill(s);
      for (const S of enc.E.seats) { S.score = 0; S.invuln = 0; S.respawnT = 0; }
      t.players[0].ship.x = 1000; t.players[0].ship.y = 1000;
      t.players[1].ship.x = 1400; t.players[1].ship.y = 1000;
      enc.E.shipPrev = null;
    };
    // a SWEPT round: it has already travelled px,py -> x,y this tick, so one
    // resolveBulletHits() pass sees a real segment and no integrate step is
    // needed to put it there
    const pvShot = (owner, px, py, x, y, dmg) => ({ x, y, px, py, vx: x - px, vy: y - py,
      r: 2.2, dmg: dmg === undefined ? 1 : dmg, owner, dead: false, spent: false, ttl: 60 });

    // (a) a bullet from another seat takes hull, and the seat's own never can
    pvPrep();
    enc.E.seats[1].hull = 3;
    t.G.bullets.push(pvShot(0, 1340, 1000, 1420, 1000));
    enc.resolveBulletHits();
    const pvBulletHit = enc.E.seats[1].hull;
    pvPrep();
    enc.E.seats[1].hull = 3;
    t.G.bullets.push(pvShot(1, 1340, 1000, 1420, 1000)); // seat 1's OWN round, through seat 1
    enc.resolveBulletHits();
    ok("a bullet takes another seat's hull, and a seat's own round passes straight through it",
      pvBulletHit === 2 && enc.E.seats[1].hull === 3,
      "cross=" + pvBulletHit + " self=" + enc.E.seats[1].hull);

    // (a2) an UNOWNED round reaches no ship at all
    pvPrep();
    enc.E.seats[1].hull = 3;
    t.G.bullets.push(pvShot("none", 1340, 1000, 1420, 1000));
    enc.resolveBulletHits();
    ok("an unowned bullet cannot take a hull — the shooter < 0 continue drops it before the ship class",
      enc.E.seats[1].hull === 3, "hull=" + enc.E.seats[1].hull);

    // (b) enemies win an EXACT tie: the ship class is tested LAST and joins
    // the same running minimum under a strict <, so a body whose entry
    // parameter is bit-for-bit the ship's takes the round. The tie is
    // CONSTRUCTED, not hoped for: along a straight shot at y = 1000 a circle
    // of radius R centred at cx is entered at x = cx - R, so placing the body
    // at (shipX - shipReach) + bodyReach makes the two entry points the same
    // x — and therefore the same t.
    pvPrep();
    enc.E.seats[1].hull = 3;
    enc.spawnEnemy(1400, 1000, 0, "dart");
    const pvTieFoe = enc.E.enemies[enc.E.enemies.length - 1];
    const pvTieR = 2.2;                       // the staged round's own radius
    const pvTieShipR = enShipR + pvTieR;      // the ship candidate's inflated reach
    pvTieFoe.x = (1400 - pvTieShipR) + (pvTieFoe.r + pvTieR);
    const pvTieHp = pvTieFoe.hp;
    // the tie itself, read off production's own solver rather than asserted by faith
    const pvTieTf = enc.segCircleEntryT(1340, 1000, 1420, 1000, pvTieFoe.x, pvTieFoe.y, pvTieFoe.r + pvTieR);
    const pvTieTs = enc.segCircleEntryT(1340, 1000, 1420, 1000, 1400, 1000, pvTieShipR);
    t.G.bullets.push(pvShot(0, 1340, 1000, 1420, 1000));
    enc.resolveBulletHits();
    ok("enemies win an EXACT tie against a ship — the ship candidate joins the same minimum last",
      pvTieTf === pvTieTs && pvTieFoe.hp < pvTieHp && enc.E.seats[1].hull === 3,
      "tFoe=" + pvTieTf + " tShip=" + pvTieTs + " foeHp=" + pvTieFoe.hp + "/" + pvTieHp +
      " hull=" + enc.E.seats[1].hull);

    // ...and the OTHER half of the same rule, which the enemy leg alone does
    // not cover: ORDNANCE also beats a ship on an exact tie, because the
    // missile loop is tested before the ship loop under the same strict <.
    // Without this, hoisting the ship loop above the missile loop passes.
    pvPrep();
    enc.E.seats[1].hull = 3;
    const pvTieM = enc.spawnMissile(1400, 1000, 0);
    pvTieM.x = (1400 - pvTieShipR) + (pvTieM.r + pvTieR); // the same construction
    pvTieM.y = 1000;
    const pvTieMhp = pvTieM.hp;
    const pvTieTm = enc.segCircleEntryT(1340, 1000, 1420, 1000, pvTieM.x, pvTieM.y, pvTieM.r + pvTieR);
    const pvTieShotM = enc.E.missilesShot;
    t.G.bullets.push(pvShot(0, 1340, 1000, 1420, 1000));
    enc.resolveBulletHits();
    ok("ordnance ALSO wins an exact tie against a ship — missiles are tested before the ship class",
      pvTieTm === pvTieTs && enc.E.missiles.length === 0 &&
      enc.E.missilesShot === pvTieShotM + 1 && enc.E.seats[1].hull === 3,
      "tMissile=" + pvTieTm + " tShip=" + pvTieTs + " live=" + enc.E.missiles.length +
      " shot=" + (enc.E.missilesShot - pvTieShotM) + " hull=" + enc.E.seats[1].hull +
      " mhp=" + pvTieMhp);

    // (c) a NEGATED strike (the victim is in comet) still consumes the round,
    // moves no hull, and counts no hitsDealt — the anvil precedent
    pvPrep();
    enc.E.seats[1].hull = 3;
    t.players[1].comet = true;
    const pvNegDealt = enc.E.hitsDealt;
    t.G.bullets.push(pvShot(0, 1340, 1000, 1420, 1000));
    const pvNegBullet = t.G.bullets[t.G.bullets.length - 1];
    enc.resolveBulletHits();
    ok("a comet negates the round, and the round is CONSUMED anyway — no hull, no hitsDealt",
      pvNegBullet.dead === true && enc.E.seats[1].hull === 3 && enc.E.hitsDealt === pvNegDealt,
      JSON.stringify({ dead: pvNegBullet.dead, hull: enc.E.seats[1].hull,
                       dealt: enc.E.hitsDealt - pvNegDealt }));

    // (d) a GRACED strike is consumed on the same terms
    pvPrep();
    enc.E.seats[1].hull = 3;
    enc.E.seats[1].invuln = 30;
    t.G.bullets.push(pvShot(0, 1340, 1000, 1420, 1000));
    const pvGraceBullet = t.G.bullets[t.G.bullets.length - 1];
    enc.resolveBulletHits();
    ok("an i-framed strike is consumed too — a bullet that reached a hull never flies on",
      pvGraceBullet.dead === true && enc.E.seats[1].hull === 3,
      JSON.stringify({ dead: pvGraceBullet.dead, hull: enc.E.seats[1].hull }));

    // (e) THE TOLL. A PvP kill zeroes the score, resets the ranks and the
    // bought hull cap, and drops PVPORBS orbs. The killer keeps everything.
    pvPrep();
    enc.addXp(60, 0);
    enc.addXp(60, 1);
    const pvBuyAB = enc.shopInfo().findIndex((r) => r.name === "AFTERBURNER");
    const pvBuyMH = enc.shopInfo().findIndex((r) => r.name === "MAX HULL");
    enc.buy(pvBuyAB, 1);
    enc.buy(pvBuyMH, 1);
    const pvSeqBefore = enc.E.seats[1].termSeq;
    const pvHullMaxBought = enc.E.seats[1].hullMax;
    const pvKillerScore = enc.E.seats[0].score;
    const pvKillerOwned = enc.E.seats[0].owned.join(",");
    const pvOrbsBefore = enc.E.orbs.length;
    enc.E.seats[1].hull = 1;
    enc.E.seats[1].invuln = 0;
    window.Encounter.drainEvents(); // the buys above queued their own termChange
                                    // markers; this leg is about the DEATH tick alone
    const pvEv = [];
    enc.recordEvents();
    const pvKilled = enc.damagePlayer(5, 1, 0); // seat 0 lands the killing blow
    // only termChange carries seat/termSeq into the record (drainStep's rule),
    // so the marker is identified by its payload and the cue by its kind
    const pvEvRec = enc.stopEvents();
    for (const e of pvEvRec) pvEv.push(e.kind);
    ok("MAX HULL really raised the victim's stored cap before the kill — the reset below has teeth",
      pvHullMaxBought === ECFG.player.hull + 1, "hullMax=" + pvHullMaxBought);
    ok("a PvP kill zeroes the victim's score, resets its ranks and its bought hull cap",
      pvKilled === true && enc.E.seats[1].score === 0 &&
      enc.E.seats[1].owned.every((n) => n === 0) &&
      enc.E.seats[1].hullMax === ECFG.player.hull &&
      enc.E.seats[1].termSeq === pvSeqBefore + 1,
      JSON.stringify({ score: enc.E.seats[1].score, owned: enc.E.seats[1].owned,
                       hullMax: enc.E.seats[1].hullMax, seq: enc.E.seats[1].termSeq }));
    ok("...and drops exactly PVPORBS orbs at the death point",
      enc.E.orbs.length - pvOrbsBefore === enc.tunables().PVPORBS,
      "dropped=" + (enc.E.orbs.length - pvOrbsBefore) + " want=" + enc.tunables().PVPORBS);
    ok("...while the KILLER's own score and ranks are untouched — a kill pays no bounty to the killer",
      enc.E.seats[0].score === pvKillerScore && enc.E.seats[0].owned.join(",") === pvKillerOwned,
      JSON.stringify({ score: enc.E.seats[0].score, owned: enc.E.seats[0].owned }));
    ok("termChange and death BOTH ride the one death tick, the marker before the cue",
      pvEv.join(" ") === "termChange death" &&
      pvEvRec[0].seat === 1 && pvEvRec[0].termSeq === pvSeqBefore + 1,
      JSON.stringify(pvEvRec));
    // the respawn fills to the RESET cap, never to the bought one
    enc.respawnSeat(1);
    ok("the victim re-enters on the stock hull cap, not the one it had bought",
      enc.E.seats[1].hull === ECFG.player.hull && enc.E.seats[1].hullMax === ECFG.player.hull,
      JSON.stringify({ hull: enc.E.seats[1].hull, hullMax: enc.E.seats[1].hullMax }));

    // (f) the exception is CARVED: a PvE kill on the same staging keeps
    // everything, and so does a restart
    pvPrep();
    enc.addXp(60, 1);
    enc.buy(enc.shopInfo().findIndex((r) => r.name === "AFTERBURNER"), 1);
    const pvPveScore = enc.E.seats[1].score;
    const pvPveOwned = enc.E.seats[1].owned.join(",");
    const pvPveOrbs = enc.E.orbs.length;
    enc.E.seats[1].hull = 1;
    enc.E.seats[1].invuln = 0;
    const pvPveKilled = enc.damagePlayer(5, 1); // NO source — the PvE path
    ok("a PvE kill keeps the score, the ranks and the hull cap, and drops nothing",
      pvPveKilled === true && enc.E.seats[1].hull === 0 &&
      enc.E.seats[1].score === pvPveScore &&
      enc.E.seats[1].owned.join(",") === pvPveOwned &&
      enc.E.orbs.length === pvPveOrbs,
      JSON.stringify({ score: enc.E.seats[1].score, owned: enc.E.seats[1].owned,
                       orbs: enc.E.orbs.length - pvPveOrbs }));

    // (g) the orb drop is world-CLAMPED — a seat killed against a wall pays a
    // bounty that is still inside the world (the enemy drop is not clamped)
    pvPrep();
    t.players[1].ship.x = 1;
    t.players[1].ship.y = 1;
    enc.E.seats[1].hull = 1;
    enc.E.seats[1].invuln = 0;
    const pvWallFrom = enc.E.orbs.length;
    enc.damagePlayer(5, 1, 0);
    const pvWallOrbs = enc.E.orbs.slice(pvWallFrom);
    ok("the PvP drop is clamped into the world — a wall death still pays a reachable bounty",
      pvWallOrbs.length === enc.tunables().PVPORBS &&
      pvWallOrbs.every((o) => o.x > 1 && o.y > 1 && o.x < t.WW && o.y < t.WH),
      JSON.stringify(pvWallOrbs.map((o) => ({ x: o.x, y: o.y }))));

    // (h) the orbs are STANDARD 1-XP orbs: any living seat banks them, the
    // killer included — and each pays exactly one XP
    pvPrep();
    enc.E.seats[1].hull = 1;
    enc.E.seats[1].invuln = 0;
    enc.damagePlayer(5, 1, 0);
    const pvBank = enc.E.orbs[enc.E.orbs.length - 1];
    const pvBankScore = enc.E.seats[0].score;
    t.players[0].ship.x = pvBank.x;
    t.players[0].ship.y = pvBank.y;
    const pvBankOrbs = enc.E.orbs.length;
    t.stepSim();
    ok("a PvP orb is a standard 1-XP orb the KILLER may bank like any other",
      enc.E.orbs.length < pvBankOrbs && enc.E.seats[0].score > pvBankScore,
      JSON.stringify({ orbs: enc.E.orbs.length, was: pvBankOrbs,
                       score: enc.E.seats[0].score, wasScore: pvBankScore }));

    // (i) mutual kills in one tick: bullets outlive their owners, so both
    // seats can die on the same tick and BOTH pay the toll. Deterministic —
    // the resolution walks G.bullets in array order.
    pvPrep();
    enc.addXp(9, 0);
    enc.addXp(9, 1);
    enc.E.seats[0].hull = 1;
    enc.E.seats[1].hull = 1;
    t.G.bullets.push(pvShot(0, 1340, 1000, 1420, 1000, 5));
    t.G.bullets.push(pvShot(1, 1060, 1000, 980, 1000, 5));
    enc.resolveBulletHits();
    ok("a mutual kill in one tick resets BOTH seats — a dead shooter's round still kills",
      enc.E.seats[0].hull === 0 && enc.E.seats[1].hull === 0 &&
      enc.E.seats[0].score === 0 && enc.E.seats[1].score === 0,
      JSON.stringify(enc.E.seats.map((S) => ({ hull: S.hull, score: S.score }))));

    // ---- the comet RAM against a player ----------------------------------
    const pvRamStage = (attackerComet, victimComet) => {
      pvPrep();
      enc.E.seats[0].hull = 99;
      enc.E.seats[1].hull = 99;
      t.players[0].comet = !!attackerComet;
      t.players[1].comet = !!victimComet;
      t.players[1].ship.x = 1010; // inside the SHIP_R * 2 box
      t.players[1].ship.y = 1000;
      enc.E.shipPrev = [{ x: 1000, y: 1000 }, { x: 1010, y: 1000 }];
    };

    pvRamStage(true, false);
    const pvRamHullWas = enc.E.seats[1].hull;
    enc.resolvePvpRams();
    const pvRamDmg = pvRamHullWas - enc.E.seats[1].hull;
    ok("a comet ram takes another seat's hull for COMETDMG × fury",
      pvRamDmg > 0 && Math.abs(pvRamDmg - enc.tunables().COMETDMG *
        (1 + EN().COMETFURY * enc.termsFor(0).fury * (1 - t.energyFrac(0)))) < 1e-9,
      "dealt=" + pvRamDmg + " COMETDMG=" + enc.tunables().COMETDMG);
    ok("...and stamps the ORDERED pair's window, in that direction only",
      enc.pvpCd()["0:1"] === enc.tunables().COMETCD && enc.pvpCd()["1:0"] === undefined,
      JSON.stringify(enc.pvpCd()));

    // one bite per pair per window: the overlap holds, the hull does not move
    // again until the window has run all the way out
    pvRamStage(true, false);
    enc.resolvePvpRams();
    const pvPaceAfterFirst = enc.E.seats[1].hull;
    let pvPaceBites = 0;
    for (let k = 0; k < enc.tunables().COMETCD - 1; k++) {
      enc.resolvePvpRams();
      if (enc.E.seats[1].hull < pvPaceAfterFirst) pvPaceBites++;
    }
    const pvPaceHeld = enc.E.seats[1].hull === pvPaceAfterFirst;
    enc.E.seats[1].invuln = 0; // the post-hit grace is a SEPARATE gate; the window is what is under test
    enc.resolvePvpRams();
    ok("one bite per pair per COMETCD window — the overlap is refused for the whole window, then bites",
      pvPaceHeld && pvPaceBites === 0 && enc.E.seats[1].hull < pvPaceAfterFirst,
      JSON.stringify({ held: pvPaceHeld, bites: pvPaceBites,
                       cd: enc.tunables().COMETCD, hull: enc.E.seats[1].hull }));

    // comet vs comet: both sweeps run, both are negated, both pools bill
    // COMETHIT, and NO hull moves — the gate order alone produces this
    pvRamStage(true, true);
    const pvCvcHulls = [enc.E.seats[0].hull, enc.E.seats[1].hull];
    const pvCvcEnergy = [t.players[0].energy, t.players[1].energy];
    enc.resolvePvpRams();
    ok("comet against comet is a mutual no-op: no hull moves on either side",
      enc.E.seats[0].hull === pvCvcHulls[0] && enc.E.seats[1].hull === pvCvcHulls[1],
      JSON.stringify({ now: [enc.E.seats[0].hull, enc.E.seats[1].hull], was: pvCvcHulls }));
    ok("...and BOTH pair windows are stamped, so the overlap cannot re-bill COMETHIT every tick",
      enc.pvpCd()["0:1"] === enc.tunables().COMETCD && enc.pvpCd()["1:0"] === enc.tunables().COMETCD,
      JSON.stringify(enc.pvpCd()));
    // COMETHIT ships at 0, so the pools are EQUAL by contract; the stamps
    // above are what prove the two strikes actually happened. Drive the knob
    // off 0 and the billing itself becomes visible.
    const pvCvcShipped = t.players[0].energy === pvCvcEnergy[0] && t.players[1].energy === pvCvcEnergy[1];
    const undoHit = enDrive("comet-hit", 5);
    pvRamStage(true, true);
    const pvCvcEn2 = [t.players[0].energy, t.players[1].energy];
    enc.resolvePvpRams();
    const pvCvcBilled = t.players[0].energy < pvCvcEn2[0] && t.players[1].energy < pvCvcEn2[1];
    undoHit();
    ok("each side bills its OWN negation: inert at the shipped COMETHIT 0, visible the moment it moves",
      pvCvcShipped && pvCvcBilled && EN().COMETHIT === 0,
      JSON.stringify({ shippedEqual: pvCvcShipped, billed: pvCvcBilled, COMETHIT: EN().COMETHIT }));

    // a NON-comet attacker never rams: the sweep is comet-only
    pvRamStage(false, false);
    const pvColdHull = enc.E.seats[1].hull;
    enc.resolvePvpRams();
    ok("two ships that merely overlap do nothing — the PvP ram is the COMET's weapon alone",
      enc.E.seats[1].hull === pvColdHull && Object.keys(enc.pvpCd()).length === 0,
      "hull=" + enc.E.seats[1].hull + " cd=" + JSON.stringify(enc.pvpCd()));

    // a ram cannot reach an i-framed seat: the gate order refuses it INSIDE
    // hitPlayer, so the sweep needs no second guard of its own
    pvRamStage(true, false);
    enc.E.seats[1].invuln = 30;
    const pvIframeHull = enc.E.seats[1].hull;
    enc.resolvePvpRams();
    ok("a ram cannot reach an i-framed seat, and takes no window for the attempt",
      enc.E.seats[1].hull === pvIframeHull && enc.pvpCd()["0:1"] === undefined,
      "hull=" + enc.E.seats[1].hull + " cd=" + JSON.stringify(enc.pvpCd()));

    // the respawn teleport cannot be rammed across: respawnSeat snaps
    // shipPrev, so no sweep segment spans the deal
    pvRamStage(true, false);
    t.players[1].ship.x = 2600; // the victim is far away...
    t.players[1].ship.y = 2600;
    enc.E.shipPrev[1].x = 2600;
    enc.E.shipPrev[1].y = 2600;
    enc.E.seats[0].hull = 0;    // ...and the ATTACKER is the one re-entering
    enc.E.seats[0].respawnT = 1;
    enc.E.seats[0].hull = 1;
    t.players[0].ship.x = 2610; // a deal that lands right on the victim
    t.players[0].ship.y = 2600;
    enc.respawnSeat(0);
    const pvTeleHull = enc.E.seats[1].hull;
    enc.resolvePvpRams();
    ok("a respawn deal is never a ram — respawnSeat's shipPrev snap leaves no segment to sweep",
      enc.E.seats[1].hull === pvTeleHull,
      "hull=" + enc.E.seats[1].hull + " prev=" + JSON.stringify(enc.E.shipPrev[0]));

    // THE SWEEP ORDER INSIDE encStep. resolvePvpRams() runs BEFORE
    // resolveBulletHits(), and that ordering is load-bearing rather than
    // cosmetic: a seat the ram killed is already excluded by seatAlive() when
    // the bullet pass walks its candidates, so an in-flight round does NOT
    // stop on the corpse — it flies on. Swapping the two calls in encStep
    // passes every other check in this repo, so the leg has to drive a REAL
    // encStep (t.stepSim), never the two resolvers called in an order this
    // file chose itself, or it would only be testing its own arithmetic.
    {
      pvPrep();
      t.pushInputFrame(0, PF({ rh: 1 }));
      t.stepSim();                       // the gate raises the comet from the ring
      t.players[1].ship.x = 1506; t.players[1].ship.y = 1800;
      t.players[0].ship.x = 1500; t.players[0].ship.y = 1800;
      t.players[0].vel.x = 0; t.players[0].vel.y = 0;
      t.players[1].vel.x = 0; t.players[1].vel.y = 0;
      enc.E.shipPrev = [{ x: 1500, y: 1800 }, { x: 1506, y: 1800 }];
      enc.E.seats[1].hull = 1;           // the ram kills outright this tick
      enc.E.seats[1].invuln = 0;
      // the round is staged PRE-travel: encStep integrates it, so it sweeps
      // 1560 -> 1480 across seat 1's disc on the very tick the ram lands
      const ordBullet = { x: 1560, y: 1800, px: 1560, py: 1800, vx: -80, vy: 0,
        r: 2.2, dmg: 1, owner: 0, dead: false, spent: false, ttl: 60 };
      t.G.bullets.push(ordBullet);
      const ordDealt = enc.E.hitsDealt;
      t.pushInputFrame(0, PF({ rh: 1 }));
      t.stepSim();
      ok("the ram resolves BEFORE the bullet pass — a round cannot register on the seat the ram just killed",
        enc.E.seats[1].hull === 0 && ordBullet.dead === false &&
        enc.E.hitsDealt === ordDealt &&
        enc.segCircleEntryT(ordBullet.px, ordBullet.py, ordBullet.x, ordBullet.y,
                            1506, 1800, enShipR + ordBullet.r) >= 0,
        JSON.stringify({ hull: enc.E.seats[1].hull, bulletDead: ordBullet.dead,
                         dealt: enc.E.hitsDealt - ordDealt,
                         sweptTheDisc: enc.segCircleEntryT(ordBullet.px, ordBullet.py,
                           ordBullet.x, ordBullet.y, 1506, 1800, enShipR + ordBullet.r) }));
    }

    // FURY READS THE RAMMER, never the rammed. The damage leg above runs both
    // seats at rank 0, where the two reads are indistinguishable — so this one
    // buys OVERLOAD on the ATTACKER, drains the ATTACKER's pool, and gives the
    // VICTIM a different rank on a full pool. Every wrong-seat substitution
    // (victim rank, victim pool, or both) lands on a different number.
    {
      pvRamStage(true, false);
      const ovRow = enc.shopInfo().findIndex((r) => r.name === "OVERLOAD");
      enc.addXp(200, 0);
      enc.addXp(200, 1);
      enc.buy(ovRow, 0); enc.buy(ovRow, 0);  // attacker at OVERLOAD rank 2
      enc.buy(ovRow, 1);                     // victim at rank 1 — deliberately different
      t.players[0].energy = 0;               // ...and the attacker EMPTY
      t.players[1].energy = t.energyCap(1);  // while the victim is full
      const ovRank = [enc.termsFor(0).fury, enc.termsFor(1).fury];
      const ovFrac = [t.energyFrac(0), t.energyFrac(1)];
      const ovWant = enc.tunables().COMETDMG * (1 + EN().COMETFURY * ovRank[0] * (1 - ovFrac[0]));
      const ovWrong = enc.tunables().COMETDMG * (1 + EN().COMETFURY * ovRank[1] * (1 - ovFrac[1]));
      const ovHullWas = enc.E.seats[1].hull;
      enc.resolvePvpRams();
      const ovDealt = ovHullWas - enc.E.seats[1].hull;
      ok("OVERLOAD scales the ram off the RAMMING seat's rank and the RAMMING seat's pool",
        ovRank[0] === 2 && ovRank[1] === 1 && Math.abs(ovDealt - ovWant) < 1e-9 &&
        Math.abs(ovWant - ovWrong) > 1e-9,
        JSON.stringify({ dealt: ovDealt, wantFromAttacker: ovWant,
                         wouldBeFromVictim: ovWrong, ranks: ovRank, fracs: ovFrac }));
    }

    // THE RAM BILLS THE ATTACKER. COMETHIT ships at 0, so the shipped run
    // cannot see this at all — deleting the ram's energySpend passes every
    // check in the repo. Drive the real slider and watch the attacker pay.
    {
      const undoRamHit = enDrive("comet-hit", 5);
      pvRamStage(true, false);
      const rbEn = [t.players[0].energy, t.players[1].energy];
      const rbHull = enc.E.seats[1].hull;
      enc.resolvePvpRams();
      const rbSpent = rbEn[0] - t.players[0].energy;
      const rbVictim = rbEn[1] - t.players[1].energy;
      undoRamHit();
      ok("a REGISTERED ram bills COMETHIT to the attacker alone — the victim's pool never pays for being hit",
        enc.E.seats[1].hull < rbHull && Math.abs(rbSpent - 5) < 1e-9 && rbVictim === 0,
        JSON.stringify({ attackerSpent: rbSpent, victimSpent: rbVictim,
                         hull: enc.E.seats[1].hull, was: rbHull }));
    }

    // A CORPSE DOES NOT RAM. The attacker guard is seatAlive(a), and it is
    // separate from the comet flag on purpose: the flag is raised by the
    // energy gate at the TOP of a tick and nothing lowers it mid-tick, so a
    // seat that dies part-way through an encStep still reads cometActive for
    // the rest of that tick. The production route into that state is narrow
    // (hitPlayer's negation branch makes a burning seat very hard to kill),
    // which is exactly why the guard needs a check rather than a reachability
    // argument — removing seatAlive(a) lets a corpse keep biting and no other
    // check in this repo notices.
    {
      pvRamStage(true, false);
      enc.E.seats[0].hull = 0;   // the attacker is dead...
      t.players[0].comet = true; // ...and its flag is still up from this tick's gate
      const cpHull = enc.E.seats[1].hull;
      enc.resolvePvpRams();
      ok("a dead attacker with a stale comet flag rams nothing and takes no pair window",
        cometActive(0) === true && enc.E.seats[0].hull === 0 &&
        enc.E.seats[1].hull === cpHull && Object.keys(enc.pvpCd()).length === 0,
        JSON.stringify({ cometStillUp: cometActive(0), victimHull: enc.E.seats[1].hull,
                         was: cpHull, cd: enc.pvpCd() }));
    }

    // COMETCD 0: the pair bites every tick, and the store stays EMPTY. A 0 is
    // falsy at the gate and would be deleted at the next expiry anyway, so
    // writing it would put a key that decides NOTHING into the hash — and the
    // zero-bytes rule that kept every committed fixture alive is only worth
    // something if "sparse by construction" is literally true.
    {
      const undoZeroCd = enDrive("comet-cd", 0);
      pvRamStage(true, false);
      let zcBites = 0;
      let zcStoreEverFilled = false;
      let zcHullWas = enc.E.seats[1].hull;
      for (let k = 0; k < 6; k++) {
        enc.E.seats[1].invuln = 0; // the GRACE is a separate gate; the window is under test
        enc.resolvePvpRams();
        if (enc.E.seats[1].hull < zcHullWas) { zcBites++; zcHullWas = enc.E.seats[1].hull; }
        if (Object.keys(enc.pvpCd()).length) zcStoreEverFilled = true;
      }
      undoZeroCd();
      ok("at COMETCD 0 the pair bites every tick and the store never holds a key that decides nothing",
        zcBites === 6 && zcStoreEverFilled === false,
        JSON.stringify({ bites: zcBites, storeEverFilled: zcStoreEverFilled,
                         cd: enc.pvpCd() }));
    }

    // TWO COMETS CROSSING AT SPEED. The sweep runs in the RELATIVE frame, so
    // no closing speed can carry one hull through another. The leg drives the
    // real sweep at a rank-0 comet's travel and at a rank-5 one's, and it
    // computes what the ATTACKER-ONLY sweep (the first draft of this file,
    // and the shape the design note asked for) would have answered — through
    // production's own segCircleHit, not a copy. The rank-5 case is the whole
    // point: the attacker-only form misses it outright, and rank 5 is 124 XP
    // on an UNCAPPED row, not a whale's build.
    const pvCross = (h) => {
      pvPrep();
      enc.E.seats[0].hull = 999;
      enc.E.seats[1].hull = 999;
      t.players[0].comet = true;
      t.players[1].comet = false;
      // a true crossing: the attacker runs west→east through (1500,1800) while
      // the victim runs north→south through it, so they MEET mid-tick
      enc.E.shipPrev = [{ x: 1500 - h, y: 1800 }, { x: 1500, y: 1800 - h }];
      t.players[0].ship.x = 1500 + h; t.players[0].ship.y = 1800;
      t.players[1].ship.x = 1500;     t.players[1].ship.y = 1800 + h;
      const hullWas = enc.E.seats[1].hull;
      enc.resolvePvpRams();
      return {
        rammed: enc.E.seats[1].hull < hullWas,
        // what the attacker-only sweep would have said, off the same solver
        attackerOnly: enc.segCircleHit(1500 - h, 1800, 1500 + h, 1800,
                                       t.players[1].ship.x, t.players[1].ship.y, enShipR * 2),
      };
    };
    const pvSlow = pvCross(6);   // a rank-0 comet: (VMAX + 0) × COMETVMAX
    const pvFast = pvCross(20);  // AFTERBURNER rank 5 territory
    ok("two comets crossing at a rank-0 speed ram each other, and the attacker-only sweep agreed there",
      pvSlow.rammed === true && pvSlow.attackerOnly === true, JSON.stringify(pvSlow));
    ok("...and at AFTERBURNER speeds they STILL ram — the attacker-only sweep would have let them pass through",
      pvFast.rammed === true && pvFast.attackerOnly === false, JSON.stringify(pvFast));

    // the store is SPARSE and self-pruning, and a restart clears it — which
    // is exactly what keeps it out of every PvP-free hash
    pvRamStage(true, false);
    enc.resolvePvpRams();
    const pvStoreOpen = Object.keys(enc.pvpCd()).length;
    for (let k = 0; k < enc.tunables().COMETCD; k++) enc.resolvePvpRams();
    const pvStoreEmptyAgain = Object.keys(enc.pvpCd()).length;
    pvRamStage(true, false);
    enc.resolvePvpRams();
    enc.restart();
    ok("the pair store opens one key, prunes itself at expiry, and never survives a restart",
      pvStoreOpen === 1 && pvStoreEmptyAgain === 0 && Object.keys(enc.pvpCd()).length === 0,
      JSON.stringify({ open: pvStoreOpen, pruned: pvStoreEmptyAgain, afterRestart: enc.pvpCd() }));

    // the hash asymmetry that would have broken every committed fixture: an
    // EMPTY store must contribute zero bytes, so a run with no PvP in it
    // hashes exactly as it did before this phase existed
    pvPrep();
    const pvHashClean = t.hashState();
    enc.E.pvpCd["0:1"] = 7;
    const pvHashStamped = t.hashState();
    delete enc.E.pvpCd["0:1"];
    const pvHashBack = t.hashState();
    // ...and the fold is ORDER-FREE: two stores with the same pairs hash the
    // same however they were inserted
    enc.E.pvpCd["1:0"] = 3; enc.E.pvpCd["0:1"] = 7;
    const pvHashOrderA = t.hashState();
    enc.E.pvpCd = {}; enc.E.pvpCd["0:1"] = 7; enc.E.pvpCd["1:0"] = 3;
    const pvHashOrderB = t.hashState();
    enc.E.pvpCd = {};
    ok("an EMPTY pair store folds for zero bytes, a stamped one moves the hash, and the fold is order-free",
      pvHashClean === pvHashBack && pvHashStamped !== pvHashClean &&
      pvHashOrderA === pvHashOrderB && pvHashOrderA !== pvHashClean &&
      t.hashState() === pvHashClean,
      JSON.stringify({ clean: pvHashClean, stamped: pvHashStamped, back: pvHashBack,
                       orderA: pvHashOrderA, orderB: pvHashOrderB }));

    // THE DOWN CARD'S COPY. It is a claim about the RULES, so it is pinned
    // rather than left as an unguarded literal: nothing on the wire says why
    // a seat died, so a line naming the score would be a lie for one of the
    // two death kinds. The old copy promised "score stands", which a PvP death
    // makes false. The wallet clause that replaced it was true in both worlds
    // and still went, on the user's call — a downed player reads the countdown,
    // not the accounting. The score guards below are what keep the line
    // neutral, and they matter exactly as much against the short copy.
    {
      const card = enc.downCardLine({ respawnT: 180 });
      ok("the SHIP DOWN card is the countdown alone and makes NO claim about the score",
        card === "respawn in 3" &&
        !/score/i.test(card) && !/stand/i.test(card),
        JSON.stringify(card));
      ok("...and the countdown is the seat's own respawn timer, in whole seconds",
        enc.downCardLine({ respawnT: 1 }) === "respawn in 1" &&
        enc.downCardLine({ respawnT: 121 }) === "respawn in 3",
        JSON.stringify([enc.downCardLine({ respawnT: 1 }), enc.downCardLine({ respawnT: 121 })]));
    }

    t.setInputMode(pvInputWas);
    t.setPlayerCount(1);
    enc.restart();
  }

  // ---- phase 15: the pose ring and the fire-time rebate -------------------
  {
    const rwInputWas = t.inputState().INPUTMODE;
    t.setInputMode("tick");
    t.setPlayerCount(2);
    const rwPrep = () => {
      enc.restart(9151);
      enc.E.groups = [];
      enc.E.enemies.length = 0;
      t.G.bullets.length = 0;
      t.G.started = true;
      t.G.running = true;
      for (const P of t.players) { P.comet = false; P.input.cometWant = false;
        P.input.fireHeld = false; P.input.fireDelta = 0;
        P.vel.x = 0; P.vel.y = 0; P.cool = 0; }
      for (let s = 0; s < t.players.length; s++) t.energyFill(s);
      for (const S of enc.E.seats) { S.score = 0; S.invuln = 0; S.respawnT = 0; }
      t.players[0].ship.x = 1000; t.players[0].ship.y = 1000;
      t.players[1].ship.x = 1400; t.players[1].ship.y = 1600; // OFF the +x fire line
      enc.E.shipPrev = null;
      enc.poseLog.length = 0;
    };
    // a staged ring row — the E.shipPrev staging idiom, one level up
    const rwRow = (o) => ({
      ships: [{ x: 1000, y: 1000, alive: true },
              { x: (o && o.s1x) !== undefined ? o.s1x : 1400,
                y: (o && o.s1y) !== undefined ? o.s1y : 1600,
                alive: !o || o.s1alive !== false }],
      enemies: (o && o.enemies) || [],
      missiles: (o && o.missiles) || [],
    });
    // an ORDINARY bullet exactly as fire() pushes it: at the shooter's pose,
    // px=py=pose, about to be rebated
    const rwShot = (owner, x, y, vx, vy) => {
      const b = { id: 0, x, y, px: x, py: y, vx, vy, r: 2.2, dmg: 1,
        owner, dead: false, spent: false, ttl: 60 };
      t.G.bullets.push(b);
      return b;
    };

    // (a) recording: one settled row per encStep, ships + liveness, capped
    rwPrep();
    for (let i = 0; i < 3; i++) t.stepSim();
    const rwRows = enc.poseLog.length;
    const rwNewest = enc.poseLog[enc.poseLog.length - 1];
    ok("the ring records one row per encStep, from the same settled poses shipPrev keeps",
      rwRows === 3 && rwNewest.ships.length === 2 &&
      rwNewest.ships[0].x === enc.E.shipPrev[0].x &&
      rwNewest.ships[0].y === enc.E.shipPrev[0].y &&
      rwNewest.ships[1].alive === true,
      JSON.stringify({ rows: rwRows, newest: rwNewest && rwNewest.ships }));
    for (let i = 0; i < 30; i++) t.stepSim();
    ok("...and holds exactly 22 rows — a 21-tick rewind inclusive of both endpoints",
      enc.poseLog.length === enc.REWIND_ROWS && enc.REWIND_ROWS === 22,
      "rows=" + enc.poseLog.length);
    ok("rowForAge clamps past the oldest held row and never answers undefined",
      enc.rowForAge(1) === enc.poseLog[enc.poseLog.length - 1] &&
      enc.rowForAge(22) === enc.poseLog[0] &&
      enc.rowForAge(500) === enc.poseLog[0],
      "");

    // (b) restart clears it — no pre-restart row is ever readable
    enc.restart(9151);
    ok("restart() clears the ring — no pre-restart pose row survives the cut",
      enc.poseLog.length === 0, "rows=" + enc.poseLog.length);

    // (c) the live-sweep mode table: seek is the ONLY live row — the exact
    // project flags phase 12's client runs (the browser pin against js/net.js
    // text lives in net-checks; this leg pins the shape and the one 1)
    ok("the live-sweep table marks seek alone — every planted mode rewinds",
      enc.LIVE_SWEEP.seek === 1 &&
      ["tele", "pulse", "lockon", "windup", "dash", "tired"]
        .every((m) => enc.LIVE_SWEEP[m] === 0),
      JSON.stringify(enc.LIVE_SWEEP));

    // (d) a rebated shot kills at the ERA pose the live sweep would miss.
    // Rows say the dart sat on the +x fire line; the LIVE body has moved
    // 300 px off it. The sweep must hit the era pose and the damage must
    // land on the LIVE body — history is read-only, damage is at NOW.
    rwPrep();
    enc.spawnEnemy(1200, 1300, 0, "dart");
    const rwDart = enc.E.enemies[enc.E.enemies.length - 1];
    rwDart.mode = "tele"; // a PLANTED mode — the rebate must use the era pose
    for (let i = 0; i < 6; i++)
      enc.poseLog.push(rwRow({ enemies: [{ id: rwDart.id, x: 1200, y: 1000, r: rwDart.r, live: 0 }] }));
    const rwHpWas = rwDart.hp;
    const rwHitsWas = enc.E.hitsDealt;
    const rwB = rwShot(0, 1140, 1000, 15, 0); // 60 px short, 4 ticks at BSPEED
    enc.rebate(rwB, 5, 0);
    enc.applyRebateHits(); // the resolve-phase split (corrective pass 2)
    ok("a rebated shot lands on the ERA pose and pays the LIVE body at NOW",
      rwB.dead === true && rwDart.hp === rwHpWas - 1 &&
      enc.E.hitsDealt === rwHitsWas + 1,
      JSON.stringify({ dead: rwB.dead, hp: rwDart.hp, was: rwHpWas }));
    ok("...and the advance spent ttl and collapsed px onto x — one ordinary segment remains",
      rwB.ttl < 60 && rwB.px === rwB.x && rwB.py === rwB.y,
      JSON.stringify({ ttl: rwB.ttl, px: rwB.px, x: rwB.x }));

    // (e) died-in-window: a row body whose id no longer resolves is DISCARDED
    // and the sweep CONTINUES to the next candidate along the path
    rwPrep();
    enc.spawnEnemy(1200, 1300, 0, "dart");
    const rwFar = enc.E.enemies[enc.E.enemies.length - 1];
    rwFar.mode = "tele";
    for (let i = 0; i < 6; i++)
      enc.poseLog.push(rwRow({ enemies: [
        { id: 99999, x: 1180, y: 1000, r: 6, live: 0 },            // died in the window
        { id: rwFar.id, x: 1260, y: 1000, r: rwFar.r, live: 0 },   // still alive
      ] }));
    const rwFarHp = rwFar.hp;
    const rwB2 = rwShot(0, 1140, 1000, 15, 0);
    enc.rebate(rwB2, 10, 0);
    enc.applyRebateHits();
    ok("a died-in-window winner is discarded and the sweep continues to the next body",
      rwB2.dead === true && rwFar.hp === rwFarHp - 1,
      JSON.stringify({ dead: rwB2.dead, hp: rwFar.hp, was: rwFarHp }));

    // (f) the PRESENTED-pose reconstruction for live-class (projected)
    // bodies — corrective pass 2. A seek body's row entry sweeps at
    // era pose + era velocity × Δ (wall-clamped): "sweep what the screen
    // showed". Two discriminating geometries, the audit's own:
    //   (f1) a laterally-crossing body whose PRESENTED pose is on the fire
    //        line HITS — the frozen-NOW form (live pose off the line at
    //        (1240,940)) would miss this;
    //   (f2) a CLOSING body whose live pose is on the line but whose
    //        presented pose is not MISSES — the frozen-NOW form was an aim
    //        assist of up to (Δ−k)×speed px against the most common mode.
    rwPrep();
    enc.spawnEnemy(1240, 940, 0, "dart"); // live pose OFF the +x line
    const rwLat = enc.E.enemies[enc.E.enemies.length - 1]; // mode stays "seek"
    for (let i = 0; i < 10; i++)
      enc.poseLog.push(rwRow({ enemies: [{ id: rwLat.id, x: 1240, y: 1019.2,
        r: rwLat.r, vx: 0, vy: -2.4, live: 1 }] }));
    const rwLatHp = rwLat.hp;
    const rwBf1 = rwShot(0, 1140, 1000, 15, 0);
    enc.rebate(rwBf1, 8, 0); // presented pose = (1240, 1019.2 − 2.4×8) = on the line
    enc.applyRebateHits();
    ok("a projected body's PRESENTED pose (era + v×Δ) is what the sweep hits",
      rwBf1.dead === true && rwLat.hp === rwLatHp - 1,
      JSON.stringify({ dead: rwBf1.dead, hp: rwLat.hp, was: rwLatHp }));
    rwPrep();
    enc.spawnEnemy(1240, 1000, 0, "dart"); // live pose ON the line — the bait
    const rwClose = enc.E.enemies[enc.E.enemies.length - 1];
    for (let i = 0; i < 10; i++)
      enc.poseLog.push(rwRow({ enemies: [{ id: rwClose.id, x: 1240, y: 1100,
        r: rwClose.r, vx: 0, vy: 2.4, live: 1 }] }));
    const rwCloseHp = rwClose.hp;
    const rwBf2 = rwShot(0, 1140, 1000, 15, 0);
    enc.rebate(rwBf2, 8, 0); // presented pose = (1240, 1119.2) — nowhere near
    enc.applyRebateHits();
    ok("...and a body whose presented pose is OFF the line MISSES — no frozen-NOW aim assist",
      rwBf2.dead === false && rwClose.hp === rwCloseHp,
      JSON.stringify({ dead: rwBf2.dead, hp: rwClose.hp }));

    // (g) the PLAYER era cap: PVPREWIND (140 ms → 8 ticks). The victim's rows
    // inside the cap sit OFF the fire line; only rows older than the cap sit
    // on it — so a Δ deeper than the cap must MISS (the shooter leads the
    // remainder), and the same shot with the rows inside the cap must LAND.
    rwPrep();
    enc.poseLog.length = 0;
    // ages 22..1 pushed oldest-first: rows at age ≥ 9 have the victim ON the
    // line (1400,1000); rows at age ≤ 8 have it OFF (1400,1600)
    for (let age = 22; age >= 1; age--)
      enc.poseLog.push(rwRow(age >= 9 ? { s1x: 1400, s1y: 1000 } : {}));
    const rwV = enc.E.seats[1];
    rwV.hull = 5; rwV.invuln = 0;
    const rwB4 = rwShot(0, 1340, 1000, 15, 0);
    enc.rebate(rwB4, 12, 0); // eras age 12..8… every player row reads ≤ the cap
    enc.applyRebateHits();
    ok("a player target's era clamps to the PVPREWIND cap — beyond it the shot misses",
      rwB4.dead === false && rwV.hull === 5,
      JSON.stringify({ dead: rwB4.dead, hull: rwV.hull }));
    // ...now the same geometry with the victim ON the line inside the cap
    enc.poseLog.length = 0;
    for (let age = 22; age >= 1; age--)
      enc.poseLog.push(rwRow(age <= 8 ? { s1x: 1400, s1y: 1000 } : {}));
    const rwB5 = rwShot(0, 1340, 1000, 15, 0);
    enc.rebate(rwB5, 12, 0);
    enc.applyRebateHits();
    ok("...and an era inside the cap LANDS — hull paid at NOW, bullet consumed",
      rwB5.dead === true && rwV.hull === 4 && enc.E.seats[1].hitFlash > 0,
      JSON.stringify({ dead: rwB5.dead, hull: rwV.hull }));
    // ...and at PVPREWIND 0 the same staged history cannot be hit at all:
    // age 0 means LIVE pose, and the live victim sits off the line
    t.setPvpTune("PVPREWIND", 0);
    rwV.hull = 5; rwV.invuln = 0;
    const rwB6 = rwShot(0, 1340, 1000, 15, 0);
    enc.rebate(rwB6, 12, 0);
    enc.applyRebateHits();
    ok("PVPREWIND 0 is player compensation OFF — only the LIVE pose can be hit",
      rwB6.dead === false && rwV.hull === 5,
      JSON.stringify({ dead: rwB6.dead, hull: rwV.hull }));
    t.setPvpTune("PVPREWIND", 140);

    // (h) respawn invalidation: every held row marks the seat unhittable, so
    // no rewound sweep crosses the teleport
    rwPrep();
    enc.poseLog.length = 0;
    for (let age = 22; age >= 1; age--)
      enc.poseLog.push(rwRow({ s1x: 1400, s1y: 1000 })); // ON the line, in range
    enc.respawnSeat(1);
    enc.E.seats[1].invuln = 0;
    const rwHullR = enc.E.seats[1].hull;
    const rwB7 = rwShot(0, 1340, 1000, 15, 0);
    enc.rebate(rwB7, 6, 0);
    enc.applyRebateHits();
    ok("a respawn invalidates the seat's held rows — no rewound sweep crosses the teleport",
      rwB7.dead === false && enc.E.seats[1].hull === rwHullR,
      JSON.stringify({ dead: rwB7.dead, hull: enc.E.seats[1].hull }));

    // (i) the world truncates the advance: a rebated round never bounces and
    // never sparks here — it stops advancing at the wall and stays ordinary
    rwPrep();
    for (let i = 0; i < 3; i++) t.stepSim();
    const rwB8 = rwShot(0, 60, 1000, -15, 0); // 4 ticks from the x=0 wall
    enc.rebate(rwB8, 15, 0);
    enc.applyRebateHits(); // nothing queued — the walls consume no target
    ok("the advance truncates at the world bounds — no bounce, the ordinary loop owns walls",
      rwB8.dead === false && rwB8.x < 0 && rwB8.px === rwB8.x &&
      rwB8.ttl > 60 - 15, // the truncated segments were never paid for
      JSON.stringify({ x: rwB8.x, ttl: rwB8.ttl }));

    // (j) the END-TO-END path: a vt-bearing frame through pushInputFrame →
    // drainSlice latch → fire() → rebate. The frame aims +x and fires; its
    // vt is 5 ticks stale, so the spawned bullet leaves 5 segments ahead of
    // an unrebated one — and the latch is FROZEN on frameless ticks.
    rwPrep();
    for (let i = 0; i < 25; i++) t.stepSim(); // a full ring of real rows
    // seat 1 shoots: a REMOTE seat's aim resolves from its banked cursor
    // (seatFireDir), never the page's live pointer — deterministic here
    const rwTickNow = t.simTick();
    t.pushInputFrame(1, { tx: 0, ty: 0, ax: 0, ay: 0, cx: 2400, cy: 1600,
      fp: 1, fh: false, kx: 0, ky: 0, rh: 0, vt: rwTickNow + 1 - 5 }); // cursor due +x
    t.stepSim(); // drains the frame (simTick is rwTickNow+1), fires, rebates
    const rwB9 = t.G.bullets[t.G.bullets.length - 1];
    ok("a vt-bearing frame's shot leaves Δ segments ahead — the whole path is live",
      !!rwB9 && rwB9.x === 1400 + 15 * 6 && rwB9.y === 1600, // 5 rebated + 1 ordinary segment
      JSON.stringify({ x: rwB9 && rwB9.x, delta: t.players[1].input.fireDelta }));
    // item 8 (corrective pass 2): GENUINE frameless ticks between the drain
    // and the read — the latch must hold its value across all of them
    for (let i = 0; i < 12; i++) t.stepSim();
    ok("...and the latch froze the drained Δ across twelve genuinely frameless ticks",
      t.players[1].input.fireDelta === 5,
      "fireDelta=" + t.players[1].input.fireDelta);
    ok("the rebate queue is EMPTY at every tick end — it never crosses a tick",
      enc.rebateQueue.length === 0, "queued=" + enc.rebateQueue.length);
    // a frame WITHOUT vt resets the latch to zero — absence earns nothing
    t.pushInputFrame(1, { tx: 0, ty: 0, ax: 0, ay: 0, cx: 2400, cy: 1600,
      fp: 0, fh: false, kx: 0, ky: 0, rh: 0 });
    t.stepSim();
    ok("a frame without vt earns a zero rebate — the latch resets at the drain",
      t.players[1].input.fireDelta === 0,
      "fireDelta=" + t.players[1].input.fireDelta);

    // (k) the MUTUAL TRADE under rebate — corrective pass 2's blocking
    // item 1. Two lethal vt-bearing shots in ONE tick: both spawn and are
    // consumed during the drain while BOTH seats still live, and both
    // applications land at the resolve phase — so BOTH die and BOTH tolls
    // fire, exactly phase 14's pinned mutual-trade semantics. Under the
    // old drain-time application, ascending seat order silenced seat 1's
    // shot (fire()'s seatAlive gate) — the audit's proven defect.
    rwPrep();
    const rwInvertWas = t.aimState().rightHeld !== t.aimState().aiming;
    t.setInvert(false); // seat 0 is the LOCAL seat: with the right button
                        // released and INVERT off, aiming() is false and
                        // fireDir() falls through to the staged aimAngle —
                        // the one deterministic aim path a DOM seat has
    t.players[0].ship.x = 1000; t.players[0].ship.y = 1000;
    t.players[1].ship.x = 1100; t.players[1].ship.y = 1000;
    t.players[0].aimed = true; t.players[0].aimAngle = 0; // due east, at seat 1
    for (let i = 0; i < 10; i++) t.stepSim(); // real settled rows — the era
                                              // sweep reads the ring, and an
                                              // empty ring sweeps nothing
    enc.addXp(5, 0);
    enc.addXp(5, 1);
    enc.E.seats[0].hull = 1; enc.E.seats[1].hull = 1;
    enc.E.seats[0].invuln = 0; enc.E.seats[1].invuln = 0;
    const rwOrbsWas = enc.E.orbs.length;
    const rwTickK = t.simTick();
    t.pushInputFrame(0, { tx: 0, ty: 0, ax: 0, ay: 0, cx: 1000, cy: 1000,
      fp: 1, fh: false, kx: 0, ky: 0, rh: 0, vt: rwTickK + 1 - 8 });
    t.pushInputFrame(1, { tx: 0, ty: 0, ax: 0, ay: 0, cx: 100, cy: 1000,
      fp: 1, fh: false, kx: 0, ky: 0, rh: 0, vt: rwTickK + 1 - 8 });
    t.stepSim(); // both fire, both rebates consume (100 px < 8×15), both apply
    ok("a mutual lethal vt trade kills BOTH seats — no seat-order tiebreaker",
      enc.E.seats[0].hull === 0 && enc.E.seats[1].hull === 0,
      JSON.stringify(enc.E.seats.map((S) => S.hull)));
    ok("...and BOTH tolls fired — two scores zeroed, two bounties on the floor",
      enc.E.seats[0].score === 0 && enc.E.seats[1].score === 0 &&
      enc.E.orbs.length === rwOrbsWas + 2 * enc.tunables().PVPORBS,
      JSON.stringify({ scores: enc.E.seats.map((S) => S.score),
                       orbs: enc.E.orbs.length - rwOrbsWas }));
    ok("...and the queue emptied inside the same tick",
      enc.rebateQueue.length === 0, "queued=" + enc.rebateQueue.length);
    t.setInvert(rwInvertWas);

    // (l) the ANVIL'S FRONTAL SHIELD holds against rebated hits —
    // corrective pass 2's blocking item 2. The winner is resolved at NOW,
    // so face and arc are in hand: into the arc the shot is consumed with
    // no damage (the live block, clang and all); around the arc it lands.
    rwPrep();
    enc.spawnEnemy(1300, 1000, 0, "anvil");
    const rwAnvil = enc.E.enemies[enc.E.enemies.length - 1];
    rwAnvil.face = Math.PI; // facing WEST — straight at the shooter
    const rwAnvilRows = () => {
      enc.poseLog.length = 0;
      for (let i = 0; i < 10; i++)
        enc.poseLog.push(rwRow({ enemies: [{ id: rwAnvil.id, x: 1300, y: 1000,
          r: rwAnvil.r, vx: 0, vy: 0, live: 1 }] })); // seek-class, planted
    };
    rwAnvilRows();
    const rwAnvilHp = rwAnvil.hp;
    const rwHitsK = enc.E.hitsDealt;
    const rwBl1 = rwShot(0, 1190, 1000, 15, 0);
    enc.rebate(rwBl1, 8, 0);
    enc.applyRebateHits();
    ok("a rebated shot into the anvil's frontal arc is BLOCKED — consumed, no damage",
      rwBl1.dead === true && rwAnvil.hp === rwAnvilHp &&
      enc.E.hitsDealt === rwHitsK,
      JSON.stringify({ dead: rwBl1.dead, hp: rwAnvil.hp, was: rwAnvilHp }));
    t.G.bullets.length = 0;
    rwAnvil.face = 0; // now facing EAST — the same shot lands on its back
    rwAnvilRows();
    const rwBl2 = rwShot(0, 1190, 1000, 15, 0);
    enc.rebate(rwBl2, 8, 0);
    enc.applyRebateHits();
    ok("...and around the arc the same rebated shot LANDS",
      rwBl2.dead === true && rwAnvil.hp === rwAnvilHp - 1 &&
      enc.E.hitsDealt === rwHitsK + 1,
      JSON.stringify({ dead: rwBl2.dead, hp: rwAnvil.hp }));

    // (m) WAVE-BOUNDARY ring contiguity — corrective pass 2's item 3. The
    // deal tick's early return used to skip the row while simTick advanced,
    // ageing every era one tick for a ring-depth after every wave deal.
    // Rows carry a diagnostic tick stamp now; drive a real boundary and pin
    // every consecutive pair one tick apart.
    rwPrep();
    t.stepSim(); // idle → warning
    enc.spawnEnemy(2000, 2000, 0, "dart"); // far from both ships
    t.stepSim(); // warning → active (a body exists)
    enc.E.enemies[enc.E.enemies.length - 1].hp = 0; // dies → cleared → deal
    let rwDealSeen = false;
    for (let i = 0; i < 300 && enc.E.wave < 2; i++) { t.stepSim(); rwDealSeen = enc.E.wave === 2; }
    for (let i = 0; i < 5; i++) t.stepSim(); // rows PAST the boundary — a
                                             // missing deal-tick row is only
                                             // visible once later rows land
    const rwTs = enc.poseLog.map((r) => r.t);
    ok("the ring is tick-contiguous ACROSS a wave deal — the deal tick records its row",
      rwDealSeen && rwTs.length > 2 &&
      rwTs.every((v, i) => i === 0 || v === rwTs[i - 1] + 1),
      JSON.stringify({ wave: enc.E.wave, ts: rwTs.slice(-6) }));

    t.setInputMode(rwInputWas);
    t.setPlayerCount(1);
    enc.restart();
  }

  // ---- S. ship damage: the hull's condition, the hit reaction, the wreck
  //         and the death blast ----------------------------------------------
  // ALL PIXELS, because none of it exists anywhere else: drawShip's four
  // states leave no state behind, so the only honest assertion is real canvas
  // ink. Every probe is a square readback through a scratch surface (section
  // M's corner-map idiom), and every leg is a DIFFERENCE between two renders
  // of one staged scene with exactly one field moved between them — a leg that
  // cannot fail would not have been worth writing.
  //
  // The scene sits in the lower-left of the field and the encounter stays
  // IDLE, so encDraw/encDrawHud return early: no enemies, no HUD column, no
  // SHIP DOWN card, and nothing in the frame but the stars, the two ships and
  // whatever this section stages on them.
  {
    const sdRunWas = t.G.running;
    const sdFxWas = t.fxState().FXINT;
    t.setPlayerCount(2);
    enc.reset();          // ...ONCE, and AFTER the seat count: restart() sizes
                          // E.seats to players[] and re-centres every ship, so
                          // the staging below has to follow it, not precede it
    t.setFxInt(1);
    t.G.running = true;
    // The two staging points are derived from the LIVE letterbox transform,
    // never hardcoded: the runner's window crops the field (the visible field
    // is narrower and shorter than FW x FH once the gutters are taken), so a
    // field coordinate picked by hand lands off the canvas and every probe
    // below reads the same nothing. Pick two CANVAS points a comfortable
    // margin inside the backing store, invert the transform to field space,
    // and add the live camera to reach world space. Nothing here writes cam.
    const sdK = t.fieldToCanvas(1, 0).x - t.fieldToCanvas(0, 0).x; // canvas px per field px
    const sdO = t.fieldToCanvas(0, 0);
    const atCanvas = (cx, cy) => ({ x: (cx - sdO.x) / sdK + t.cam.x,
                                    y: (cy - sdO.y) / sdK + t.cam.y });
    const A = atCanvas(canvasEl.width * 0.30, canvasEl.height * 0.62);
    const B = atCanvas(canvasEl.width * 0.62, canvasEl.height * 0.62);
    t.players[0].ship.x = A.x; t.players[0].ship.y = A.y;
    t.players[1].ship.x = B.x; t.players[1].ship.y = B.y;
    for (const P of t.players) {
      P.vel.x = 0; P.vel.y = 0; P.comet = false;
      P.flame.x = 0; P.flame.y = 0; // drawFlame is the one draw in the game that
                                    // spends Math.random(); a live flame would
                                    // make the determinism leg below vacuous
    }
    const sdPad = document.createElement("canvas");
    const sdCtx = sdPad.getContext("2d", { willReadFrequently: true });
    const HALF = 30; // backing-store px each way — the hull, both shock rings
                     // and the countdown arc all fall inside this
    const patch = (w) => { // the real canvas around a world point, as bytes
      const p = t.fieldToCanvas(w.x - t.cam.x, w.y - t.cam.y);
      sdPad.width = sdPad.height = HALF * 2;
      sdCtx.clearRect(0, 0, HALF * 2, HALF * 2);
      sdCtx.drawImage(canvasEl, Math.round(p.x) - HALF, Math.round(p.y) - HALF,
        HALF * 2, HALF * 2, 0, 0, HALF * 2, HALF * 2);
      return JSON.stringify(Array.from(sdCtx.getImageData(0, 0, HALF * 2, HALF * 2).data));
    };
    const rec = (s) => enc.E.seats[s];
    const sdClear = () => { // every seat back to untouched, and the blasts with it
      for (let s = 0; s < 2; s++) {
        const S = rec(s);
        S.hull = S.hullMax;
        S.hitFlash = 0;
        S.invuln = 0;
        S.respawnT = 0;
      }
      t.resetShipFx();
    };

    sdClear();
    t.render();
    const sdFullA = patch(A);
    const sdFullB = patch(B);
    // ...and the guard that keeps every leg below from being vacuous. If the
    // probe ever stops landing on a hull — a runner window that crops the
    // field differently would do it — every pixel leg would compare two
    // patches of empty space and every one of them would pass. So COUNT the
    // white plate in the patch: a pristine hull is a disc of C.bright a couple
    // of hundred pixels across at any sane scale, and empty field with a star
    // or two in it is nowhere near. (Moving the ship out of the patch and
    // diffing is NOT enough on its own: the aim marker rides the local ship
    // and moves with it, so that diff stays true even with no hull drawn at
    // all — which is exactly the failure this guard exists to catch.)
    const sdPlate = (() => {
      const a = JSON.parse(sdFullA);
      let n = 0;
      for (let i = 0; i < a.length; i += 4) if (a[i] > 200 && a[i + 1] > 200 && a[i + 2] > 200) n++;
      return n;
    })();
    ok("the damage probe is looking at an actual hull, not empty field",
      sdPlate > 60, "brightPx=" + sdPlate);

    // (1) the standing damage state — a hull point lost has to be visible on
    //     the ship that lost it, and on nothing else
    rec(0).hull = 2;
    t.render();
    const sdHurtA = patch(A);
    ok("a hull point lost changes the ship that lost it", sdHurtA !== sdFullA);
    ok("...and leaves every other ship exactly as it was", patch(B) === sdFullB);
    rec(0).hull = 1;
    t.render();
    const sdCritA = patch(A);
    ok("a ship one point from dead reads differently again",
      sdCritA !== sdHurtA && sdCritA !== sdFullA);
    // ...and the repair reverses it EXACTLY: the pristine draw is the original
    // three-step ship, and a hull that has been shot at and patched must land
    // back on it byte for byte
    sdClear();
    t.render();
    ok("a fully repaired hull draws exactly the pristine ship again", patch(A) === sdFullA);

    // (2) the hit reaction — ink while hitFlash runs, and ink that MOVES as it
    //     counts down (a static overlay would pass the first leg alone)
    rec(0).hitFlash = 18;
    t.render();
    const sdHit18 = patch(A);
    ok("a registered hit paints a reaction on the ship that took it", sdHit18 !== sdFullA);
    rec(0).hitFlash = 6;
    t.render();
    ok("...and the reaction moves as the flash counts down", patch(A) !== sdHit18);
    sdClear();

    // (3) THE MULTIPLAYER LEG. Every seat's damage is read from ITS OWN
    //     record — this is the one that fails if the ship draw ever goes back
    //     to asking localSeat() what to paint.
    rec(1).hull = 1;
    t.render();
    ok("a REMOTE seat's damage draws on the remote ship", patch(B) !== sdFullB);
    ok("...and never on the local one", patch(A) === sdFullA);
    sdClear();

    // (4) the wreck and the ten-second wait
    rec(0).hull = 0;
    rec(0).respawnT = 550;
    t.render();
    const sdWreck = patch(A);
    ok("a downed seat draws a wreck, not a ship", sdWreck !== sdFullA);
    rec(0).respawnT = 90;
    t.render();
    const sdWreckLate = patch(A);
    ok("the respawn countdown closes as the seat's timer runs out", sdWreckLate !== sdWreck);
    rec(0).respawnT = 0;
    t.render();
    ok("a seat parked for good draws the husk with no countdown on it",
      patch(A) !== sdWreckLate && patch(A) !== sdFullA);
    sdClear();

    // (5) the death blast: its own ring, its own cap, its own off switch — and
    //     it must be INVISIBLE to the impact-burst list the checks above count
    const sdBurstsWas = t.fxState().bursts;
    ok("the ship-blast ring starts empty", t.shipFxState().blasts === 0,
      "blasts=" + t.shipFxState().blasts);
    t.spawnShipBlast(A.x, A.y, 0);
    ok("a death spawns exactly one blast, and no impact burst with it",
      t.shipFxState().blasts === 1 && t.fxState().bursts === sdBurstsWas,
      "blasts=" + t.shipFxState().blasts + " bursts=" + t.fxState().bursts);
    const sdCap = t.shipFxState().max;
    for (let i = 0; i < sdCap + 4; i++) t.spawnShipBlast(A.x, A.y, 0);
    ok("the blast ring is capped, oldest evicted first",
      t.shipFxState().blasts === sdCap, "blasts=" + t.shipFxState().blasts + " max=" + sdCap);
    t.resetShipFx();
    t.setFxInt(0);
    t.spawnShipBlast(A.x, A.y, 0);
    ok("FXINT 0 spawns no ship blast at all — the off switch is the off switch",
      t.shipFxState().blasts === 0, "blasts=" + t.shipFxState().blasts);
    t.setFxInt(1);
    t.spawnShipBlast(A.x, A.y, 0);
    for (let i = 0; i < 10; i++) t.stepShipFx();
    t.render();
    ok("a live blast paints over the ship that died", patch(A) !== sdFullA);
    for (let i = 0; i < t.shipFxState().life; i++) t.stepShipFx();
    ok("a blast expires at its stamped lifetime", t.shipFxState().blasts === 0,
      "blasts=" + t.shipFxState().blasts);
    t.render();
    ok("...and leaves nothing on the field when it does", patch(A) === sdFullA);

    // (6) THE CONTRACT the pixel probes in this file and pause-ui depend on:
    //     with damage, a live hit, a wreck and a blast all on screen at once,
    //     two renders of one tick must paint identical bytes — and the whole
    //     thing must spend nothing from the seeded stream, which is hashed.
    rec(1).hull = 1;
    rec(1).hitFlash = 17;
    rec(0).hull = 0;
    rec(0).respawnT = 275;
    t.spawnShipBlast(A.x, A.y, 0);
    for (let i = 0; i < 5; i++) t.stepShipFx();
    const sdRngWas = enc.rngState();
    t.render();
    const sdD1 = patch(A) + patch(B);
    t.render();
    const sdD2 = patch(A) + patch(B);
    ok("two renders of one tick paint identical bytes with every damage state live",
      sdD1 === sdD2);
    ok("the damage draw spends nothing from the seeded stream",
      enc.rngState() === sdRngWas, "before=" + sdRngWas + " after=" + enc.rngState());

    sdClear();
    t.setFxInt(sdFxWas);
    t.G.running = sdRunWas;
    t.setPlayerCount(1);
    enc.restart();
  }

  // ---- Z. the frame loop, characterized ----
  // frameBody(now) is loop()'s extracted rAF body, driven here with SYNTHETIC
  // timestamps — no rAF, no wall clock. A Net stub stands in for the wire so
  // tick counting never advances the real sim (the stub's clientTick only
  // counts); the one real-path check at the end drives clientStep for real
  // and resets the encounter after itself. These pin the loop's actual
  // catch-up contract: as many as five ticks per frame, so the sim stays
  // real-time at 30, 20 and 12.5 fps and genuinely slows only below ~12 fps
  // or after a stall needing more than five ticks.
  {
    const TICKMS = t.TICKMS;
    const priorNet = window.Net;
    let ticked = 0;
    let flushed = 0;
    window.Net = { active: () => true,
      clientTick: () => { ticked += 1; },
      flushInputs: () => { flushed += 1; } };
    const drive = (times) => times.map((now) => t.frameBody(now));
    try {
      // 144 Hz: dt ~6.94 ms — frames tick 0 or 1, averaging 60 per second
      t.seedLoopClock(0);
      const hz144 = [];
      for (let k = 1; k <= 288; k++) hz144.push(k * 1000 / 144);
      const n144 = drive(hz144);
      const sum144 = n144.reduce((a, b) => a + b, 0);
      ok("loop: a 144 Hz frame script ticks 0 or 1 per frame — never 2 — and both occur",
        n144.every((n) => n === 0 || n === 1) && n144.includes(0) && n144.includes(1),
        "counts=" + [...new Set(n144)].join(","));
      ok("loop: ...banking 60 ticks per simulated second (2 s → 120 ± 1)",
        Math.abs(sum144 - 120) <= 1 &&
        Math.abs(sum144 * TICKMS - (2000 - t.loopAcc())) < 1e-6,
        "sum=" + sum144 + " acc=" + t.loopAcc().toFixed(4));
      // 60 Hz with bounded vsync drift: mostly 1 tick, occasionally 0 and 2
      t.seedLoopClock(0);
      const hz60 = [];
      for (let k = 1; k <= 600; k++) hz60.push(k * (1000 / 60) + 1.6 * Math.sin(k * 0.9));
      const n60 = drive(hz60);
      const sum60 = n60.reduce((a, b) => a + b, 0);
      ok("loop: a drifting 60 Hz script produces 0-, 1- and 2-tick frames and never 3",
        n60.includes(0) && n60.includes(1) && n60.includes(2) && n60.every((n) => n <= 2),
        "counts=" + [...new Set(n60)].sort().join(","));
      ok("loop: ...and every millisecond in is a tick out or still in the accumulator",
        Math.abs(sum60 * TICKMS - (hz60[hz60.length - 1] - t.loopAcc())) < 1e-6,
        "sum=" + sum60 + " acc=" + t.loopAcc().toFixed(4));
      // the 200 ms frame-delta cap
      t.seedLoopClock(0);
      t.frameBody(10000);
      ok("loop: a 10 s stall is clamped to a 200 ms frame delta",
        t.frameDt() === 200, "dt=" + t.frameDt());
      // the five-tick catch-up cap, then the one-tick backlog clamp
      t.seedLoopClock(0);
      ticked = 0;
      const nBig = t.frameBody(150); // nine ticks owed
      ok("loop: a 150 ms frame catches up at most 5 ticks",
        nBig === 5 && ticked === 5, "n=" + nBig + " ticked=" + ticked);
      ok("loop: ...the leftover backlog clamps to one tick and the frame draws alpha 1",
        Math.abs(t.loopAcc() - TICKMS) < 1e-9 && t.loopAlpha() === 1,
        "acc=" + t.loopAcc().toFixed(4) + " alpha=" + t.loopAlpha());
      // one wire flush per frame, and render on a frame that ran no tick
      t.seedLoopClock(0);
      flushed = 0;
      const seq0 = t.drawnPose().seq;
      const nz = t.frameBody(5); // dt 5 ms — no tick owed
      t.frameBody(10);
      t.frameBody(40);
      ok("loop: exactly one flushInputs per frame, the 0-tick frame included",
        flushed === 3, "flushed=" + flushed);
      ok("loop: render still runs on a 0-tick frame",
        nz === 0 && t.drawnPose().seq === seq0 + 3,
        "n=" + nz + " renders=" + (t.drawnPose().seq - seq0));
      // real time survives 30, 20 and 12.5 fps; below ~12 fps the sim slows
      for (const fps of [30, 20, 12.5]) {
        t.seedLoopClock(0);
        const times = [];
        const frames = Math.round(2 * fps);
        for (let k = 1; k <= frames; k++) times.push(k * 1000 / fps);
        const sum = drive(times).reduce((a, b) => a + b, 0);
        ok("loop: real time survives " + fps + " fps (2 s banks >= 119 ticks)",
          sum >= 119, "sum=" + sum);
      }
      {
        t.seedLoopClock(0);
        const times = [];
        for (let k = 1; k <= 20; k++) times.push(k * 100); // 10 fps, 2 s
        const ns = drive(times);
        const sum = ns.reduce((a, b) => a + b, 0);
        ok("loop: below ~12 fps the sim genuinely slows — 10 fps banks 5 per frame, 100 of 120",
          sum === 100 && ns.every((n) => n === 5), "sum=" + sum);
      }
      // startLoop parity: a seeded clock's same-timestamp frame is dt 0
      t.seedLoopClock(500);
      const n0 = t.frameBody(500);
      ok("loop: the seeded clock's first same-timestamp frame ticks 0 and draws alpha 0",
        n0 === 0 && t.loopAlpha() === 0, "n=" + n0 + " alpha=" + t.loopAlpha());
    } finally {
      window.Net = priorNet;
    }
    // the REAL path: frameBody banks its ticks through clientStep
    enc.reset();
    const st0 = t.simTick();
    t.seedLoopClock(0);
    let real = 0;
    for (let k = 1; k <= 12; k++) real += t.frameBody(k * (1000 / 60) + 0.5);
    ok("loop: the real path advances simTick by exactly the ticks it reports",
      real > 0 && t.simTick() - st0 === real,
      "simTick+=" + (t.simTick() - st0) + " reported=" + real);
    enc.reset();
  }

  // ---- Z2. the drawn-pose probe ----
  // render() records what it actually painted: the pose drawShip received
  // per seat, the designated enemy, the camera transform the world pass
  // used, the sim clock and the render alpha. At HEAD drawn equals live by
  // construction — these checks pin that the record IS written from the
  // draw path, so a renderer drawing through locals moves the record too.
  {
    enc.reset();
    enc.E.hull = 99;
    enc.advance(W1[0].spawnAt + 1); // the first group has landed
    const foe = enc.E.enemies[0];
    t.designateDrawnEnemy(foe.id);
    const P0 = t.players[0];
    const seqA = t.drawnPose().seq;
    t.render();
    const d = t.drawnPose();
    ok("probe: render records the pose drawShip received for seat 0",
      d.seq === seqA + 1 && d.ships[0] &&
      d.ships[0].x === P0.ship.x && d.ships[0].y === P0.ship.y,
      "drawn=" + (d.ships[0] && d.ships[0].x + "," + d.ships[0].y) +
      " live=" + P0.ship.x + "," + P0.ship.y);
    ok("probe: ...the designated enemy as drawn",
      d.enemy.seen && d.enemy.id === foe.id && d.enemy.x === foe.x && d.enemy.y === foe.y,
      "drawn=" + d.enemy.id + "@" + d.enemy.x + "," + d.enemy.y +
      " live=" + foe.id + "@" + foe.x + "," + foe.y);
    ok("probe: ...the render camera the world pass used",
      d.camR.x === t.cam.x && d.camR.y === t.cam.y,
      "camR=" + d.camR.x + "," + d.camR.y + " cam=" + t.cam.x + "," + t.cam.y);
    ok("probe: ...and the drawn tick, with a foreign caller's alpha 1",
      d.tick === t.simTick() && d.alpha === 1,
      "tick=" + d.tick + " simTick=" + t.simTick() + " alpha=" + d.alpha);
    t.designateDrawnEnemy(-1);
    enc.reset();
  }

  // ---- Z3. the presentation frame ----
  // The judder metric: drive frameBody with a synthetic timestamp script over
  // a coasting seat (constant velocity, no input, DAMP 1) and read the DRAWN
  // screen pose per frame — drawn body minus drawn camR, both off the probe.
  // Two numbers per run: duplicate frames (screen moved < 0.01 px while the
  // body's true motion is constant) and the coefficient of variation of the
  // per-frame screen displacement. The frame must hold 0 and < 0.05; the
  // bypass seam must reproduce the BEFORE judder, or the metric proves nothing.
  {
    const priorCamMode = t.camState().CAMMODE;
    t.setCamMode("lock");
    t.setPlayerCount(2);
    enc.restart();
    const guard = () => { // the metric seats must survive whatever wave 1 lands
      for (const s of [0, 1]) { enc.E.seats[s].hullMax = 99; enc.E.seats[s].hull = 99; enc.E.seats[s].invuln = 100000; }
    };
    const park = () => {
      guard();
      const P0 = t.players[0], P1 = t.players[1];
      P0.ship.x = t.WW / 2; P0.ship.y = t.WH / 2; P0.vel.x = 0; P0.vel.y = 0;
      P1.ship.x = t.WW / 2 - 300; P1.ship.y = t.WH / 2 - 200; P1.vel.x = 1.2; P1.vel.y = 0.9;
    };
    const metricRun = (times, seat) => {
      const pts = [];
      for (const now of times) {
        t.frameBody(now);
        const d = t.drawnPose();
        const s = d.ships[seat];
        pts.push({ x: s.x - d.camR.x, y: s.y - d.camR.y });
      }
      const disp = [];
      for (let i = 1; i < pts.length; i++) disp.push(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      const d2 = disp.slice(4); // the cache-seeding warm-up frames
      const dups = d2.filter((v) => v < 0.01).length;
      const mean = d2.reduce((a, b) => a + b, 0) / d2.length;
      const sd = Math.sqrt(d2.reduce((a, b) => a + (b - mean) * (b - mean), 0) / d2.length);
      return { dups, cov: mean > 0 ? sd / mean : 0, frames: d2.length };
    };
    const script = (frames, dt) => { const s = []; for (let k = 1; k <= frames; k++) s.push(k * dt); return s; };
    const run = (frames, dt, seat) => { park(); t.seedLoopClock(0); return metricRun(script(frames, dt), seat); };
    const fmt = (r) => "dups=" + r.dups + "/" + r.frames + " cov=" + r.cov.toFixed(4);

    // 144 Hz, ~2 simulated seconds, the coasting remote seat
    const hz144 = run(288, 1000 / 144, 1);
    ok("frame: 144 Hz — a coasting remote seat draws with zero duplicate frames",
      hz144.dups === 0, fmt(hz144));
    ok("frame: 144 Hz — per-frame screen displacement CoV under 0.05",
      hz144.cov < 0.05, fmt(hz144));
    t.setFrameBypass(true);
    const hz144b = run(288, 1000 / 144, 1);
    t.setFrameBypass(false);
    ok("frame: ...bypassed, the same script reports the BEFORE judder — the metric sees what it claims to",
      hz144b.dups > hz144b.frames / 3 && hz144b.cov > 0.8, fmt(hz144b));
    // 60 Hz with a 16.9 ms drift — the double-stepped-frame case
    const hz60 = run(120, 16.9, 1);
    ok("frame: 16.9 ms drift — zero duplicate frames and CoV under 0.05",
      hz60.dups === 0 && hz60.cov < 0.05, fmt(hz60));
    t.setFrameBypass(true);
    const hz60b = run(120, 16.9, 1);
    t.setFrameBypass(false);
    ok("frame: ...bypassed, the drift script shows the double-step (CoV > 0.05)",
      hz60b.cov > 0.05, fmt(hz60b));

    // the sacred pair: in lock mode the own ship sits EXACTLY centred on
    // every frame, 0-tick frames included — the extrapolated ship and the
    // shadow camera share one lead by construction
    park();
    t.players[0].vel.x = 1.0;
    t.players[0].vel.y = 0.6;
    t.seedLoopClock(0);
    let cerr = 0;
    for (let k = 1; k <= 60; k++) {
      t.frameBody(k * 1000 / 144);
      if (k <= 4) continue;
      const d = t.drawnPose();
      cerr = Math.max(cerr,
        Math.abs(d.ships[0].x - d.camR.x - t.FW / 2),
        Math.abs(d.ships[0].y - d.camR.y - t.FH / 2));
    }
    ok("frame: lock mode holds the own ship EXACTLY centred on every frame",
      cerr < 1e-6, "maxErr=" + cerr);

    // the displacement guard: a teleport crosses in ONE presented frame —
    // prev snaps to cur, so the very next drawn pose IS the dealt pose
    park();
    t.seedLoopClock(0);
    for (let k = 1; k <= 6; k++) t.frameBody(k * 1000 / 144);
    t.players[1].ship.x += 200;
    let ticked = 0, k2 = 6;
    while (ticked === 0 && k2 < 200) ticked = t.frameBody(++k2 * 1000 / 144);
    const dTele = t.drawnPose();
    ok("frame: a mid-flight teleport crosses in ONE presented frame",
      dTele.ships[1].x === t.players[1].ship.x && dTele.ships[1].y === t.players[1].ship.y,
      "drawn=" + dTele.ships[1].x + "," + dTele.ships[1].y +
      " live=" + t.players[1].ship.x + "," + t.players[1].ship.y);

    // lifecycle: a NEW id appears at its current pose — never lerped from
    // zero or from a retired body's grave
    enc.restart();
    enc.E.hull = 99;
    guard();
    enc.advance(W1[0].spawnAt - 2); // two ticks short of the first landing
    t.designateDrawnEnemy(-1);
    t.seedLoopClock(0);
    let seen = false, born = null, k3 = 0;
    while (!seen && k3 < 40) {
      t.frameBody(++k3 * 1000 / 144);
      if (t.drawnPose().enemy.seen) { seen = true; born = { x: t.drawnPose().enemy.x, y: t.drawnPose().enemy.y }; }
    }
    const foe0 = enc.E.enemies[0];
    ok("frame: a newly spawned body appears AT its current pose",
      seen && foe0 && born.x === foe0.x && born.y === foe0.y,
      seen ? "drawn=" + born.x + "," + born.y + " live=" + foe0.x + "," + foe0.y : "never seen");

    // ...and an enemy mid-alpha draws BETWEEN its last two tick poses, at
    // exactly the frame's alpha — the interpolation is the committed scheme
    let pinned = false, detail = "no 1-tick mid-alpha frame found";
    let before = { x: foe0.x, y: foe0.y };
    for (let k = 1; k <= 40 && !pinned; k++) {
      const n = t.frameBody((k3 + k) * 1000 / 144);
      const after = { x: enc.E.enemies[0].x, y: enc.E.enemies[0].y };
      const a = t.loopAlpha();
      if (n === 1 && a > 0.1 && a < 0.9 && Math.hypot(after.x - before.x, after.y - before.y) > 0.05) {
        const d = t.drawnPose().enemy;
        const ex = before.x + (after.x - before.x) * a;
        const ey = before.y + (after.y - before.y) * a;
        pinned = Math.abs(d.x - ex) < 1e-9 && Math.abs(d.y - ey) < 1e-9;
        detail = "drawn=" + d.x.toFixed(6) + "," + d.y.toFixed(6) +
                 " lerp=" + ex.toFixed(6) + "," + ey.toFixed(6) + " a=" + a.toFixed(4);
        break;
      }
      before = after;
    }
    ok("frame: an enemy draws BETWEEN its last two tick poses at the frame's alpha", pinned, detail);

    // degeneracy: a foreign alpha-1 render bypasses every cache — live poses,
    // the tick camera — however stale the caches are (phase 1's contract)
    t.players[1].ship.x += 13; // under the guard, so a cached draw WOULD differ
    t.render();
    const dLive = t.drawnPose();
    ok("frame: a foreign alpha-1 render degenerates to live poses and the tick camera",
      dLive.alpha === 1 && dLive.ships[1].x === t.players[1].ship.x &&
      dLive.camR.x === t.cam.x && dLive.camR.y === t.cam.y,
      "ship=" + dLive.ships[1].x + "/" + t.players[1].ship.x +
      " camR=" + dLive.camR.x + "/" + t.cam.x);

    t.designateDrawnEnemy(-1);
    t.setFrameBypass(false);
    t.setCamMode(priorCamMode);
    t.setPlayerCount(1);
    enc.restart();
  }

  // ---- Z4. phase 4 — the remaining draw-time readers joined the frame ----
  // Three consumers that used to read live cam / live poses at draw time now
  // read FRAME: the star field's scroll, the minimap's viewport rect and the
  // aim marker's anchor. Each is pinned at a MID-ALPHA frame where the shadow
  // camera demonstrably differs from the tick camera, so a consumer regressed
  // to the live read fails here — at alpha 1 the two are equal and the pin
  // would be vacuous.
  {
    const priorCamMode = t.camState().CAMMODE;
    const priorMM = t.minimapInfo().on;
    const priorRunning = t.G.running;
    t.setCamMode("lock");
    t.setPlayerCount(2);
    enc.restart();
    for (const s of [0, 1]) { enc.E.seats[s].hullMax = 99; enc.E.seats[s].hull = 99; enc.E.seats[s].invuln = 100000; }
    const P0 = t.players[0], P1 = t.players[1];
    P0.ship.x = t.WW / 2; P0.ship.y = t.WH / 2; P0.vel.x = 1.0; P0.vel.y = 0.6;
    P1.ship.x = t.WW / 2 - 300; P1.ship.y = t.WH / 2 - 200; P1.vel.x = 1.2; P1.vel.y = 0.9;
    t.setMinimap(true);
    t.setAimMode("mouse"); // cursor aim — the marker draws off the pointer
    t.G.running = true;    // drawAim only draws in live play
    const mc = t.fieldToClient(t.FW / 2 + 60, t.FH / 2 - 40);
    t.setMouseClient(mc.x, mc.y);
    t.seedLoopClock(0);
    let hit = null;
    for (let k = 1; k <= 300 && !hit; k++) {
      t.frameBody(k * 1000 / 144);
      const a = t.loopAlpha();
      const d = t.drawnPose();
      if (a > 0.2 && a < 0.8 && (d.camR.x !== t.cam.x || d.camR.y !== t.cam.y)) {
        hit = { a,
          star: { x: d.star.x, y: d.star.y },
          mm: { x: d.mm.x, y: d.mm.y },
          aim: { seen: d.aim.seen, x: d.aim.x, y: d.aim.y },
          camR: { x: d.camR.x, y: d.camR.y },
          cam: { x: t.cam.x, y: t.cam.y },
          ship0: { x: d.ships[0].x, y: d.ships[0].y },
          live0: { x: P0.ship.x, y: P0.ship.y } };
      }
    }
    ok("phase4: a mid-alpha frame exists where the shadow camera leads the tick camera",
      !!hit, hit ? "a=" + hit.a.toFixed(4) : "no such frame in 300");
    ok("phase4: the star field scrolls by FRAME.cam at mid-alpha, not the tick camera",
      hit && hit.star.x === hit.camR.x && hit.star.y === hit.camR.y &&
      (hit.star.x !== hit.cam.x || hit.star.y !== hit.cam.y),
      hit ? "star=" + hit.star.x + "," + hit.star.y + " camR=" + hit.camR.x + "," + hit.camR.y +
            " cam=" + hit.cam.x + "," + hit.cam.y : "no frame");
    ok("phase4: the minimap viewport rect frames FRAME.cam at mid-alpha",
      hit && hit.mm.x === hit.camR.x && hit.mm.y === hit.camR.y,
      hit ? "mm=" + hit.mm.x + "," + hit.mm.y + " camR=" + hit.camR.x + "," + hit.camR.y : "no frame");
    ok("phase4: the aim marker anchors on the FRAME ship at mid-alpha, not the live pose",
      hit && hit.aim.seen && hit.aim.x === hit.ship0.x && hit.aim.y === hit.ship0.y &&
      (hit.aim.x !== hit.live0.x || hit.aim.y !== hit.live0.y),
      hit ? "aim=" + (hit.aim.seen ? hit.aim.x + "," + hit.aim.y : "unseen") +
            " frame=" + hit.ship0.x + "," + hit.ship0.y +
            " live=" + hit.live0.x + "," + hit.live0.y : "no frame");
    t.G.running = priorRunning;
    t.setMinimap(priorMM);
    t.setCamMode(priorCamMode);
    t.setPlayerCount(1);
    enc.restart();
  }

  // ---- restore the page for a human ----
  if (priorLight) t.setFx(priorLight.on);
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
