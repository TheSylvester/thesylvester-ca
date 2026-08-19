"use strict";

// Deterministic audio checks — the synthesized sfx layer as an OBSERVER of
// the simulation. Load this file in the page (fetch + eval from the console,
// or a script tag), then call runAudioChecks(). The suite drives the fixed-
// step sim through window.__test only — no RAF, no real input, no timers —
// and reads the cue LOG that js/audio.js appends to at every cue() return
// point, whether or not an AudioContext even exists. That log-first design is
// what makes every check here environment-agnostic: on a headless page the
// entries carry why "idle"/"suspended"/"unarmed" and nothing is scheduled; on
// a page a human has really clicked they carry "ok"/"gap" and voices play —
// but WHICH sim event asked for WHICH sound, and how many times, is identical
// in both worlds, so the counts below assert names and never audibility. The
// suite never calls unlock() itself and never delivers a gesture, so it can
// neither arm audio nor wake a context; the only unlock paths it touches are
// the page's own (the audition binds and the sfxtest button), exactly as a
// player would. Timing and geometry expectations read the live tuner values,
// so a tuned page cannot fake a failure. On return the suite restores the aim
// mode, impact-fx intensity, bounce, the blast-radius slider and the three
// audio controls it drove, clears the cue log and the throttle table, and
// resets the encounter; like the other suites it leaves G.mouse and the aim
// history wherever its synthetic input put them. On a page without js/audio.js
// the suite skips whole rather than failing — that page is itself a supported
// configuration, contracted to behave byte-identically to one that never had
// audio, and the wave and pause suites are what prove it.
window.runAudioChecks = function () {
  const t = window.__test;
  if (!t || !t.audio) {
    return { total: 0, passed: 0, failed: [], results: [],
      skipped: "no __test.audio on this page — js/audio.js is absent, itself a supported configuration" };
  }
  const A = t.audio;
  const enc = t.enc;
  const ECFG = enc.cfg;
  const W1 = enc.waveGroups(1);
  const R = [];
  const ok = (name, cond, info) => R.push({ name, pass: !!cond, info: info === undefined ? "" : String(info) });
  const ship = () => t.G.ship;
  const named = (n) => A.log().filter((e) => e.name === n).length;
  const entry = (n) => A.log().find((e) => e.name === n);
  const noThrow = (fn) => { try { fn(); return true; } catch (err) { return false; } };
  // one control, driven through the real DOM handler; returns its undo — the
  // same helper the pause suite uses, because the SFX* lets live in game.js
  // closure scope and the sliders are the only sanctioned way to reach them
  const drive = (id, val) => {
    const c = document.getElementById(id);
    const was = c.type === "checkbox" ? c.checked : c.value;
    if (c.type === "checkbox") c.checked = val;
    else c.value = String(val);
    c.dispatchEvent(new Event("input", { bubbles: true }));
    return () => {
      if (c.type === "checkbox") c.checked = was;
      else c.value = was;
      c.dispatchEvent(new Event("input", { bubbles: true }));
    };
  };
  const mkBullet = (x, y, vx) => t.G.bullets.push({ x, y, px: x, py: y, vx, vy: 0, r: 2.2,
    dmg: 1, owner: "player", dead: false, spent: false, ttl: 60 });
  const priorAim = t.aimState().AIMMODE;
  const priorFxInt = t.fxState().FXINT;
  const priorBounce = document.getElementById("bounce").checked;
  const priorVol = document.getElementById("sfxvol").value;
  const priorMute = document.getElementById("sfxmute").checked;
  const priorShot = document.getElementById("sfxshot").value;
  t.G.leftHeld = false; // no autofire may wander a stray fire cue into a count
  A.resetThrottles();
  A.clearLog();

  // ---- A. the public surface: shape and totality ----
  // Four methods, total by contract: never a throw, for any argument, in any
  // context state. The suite cannot force the no-AudioContext rung from here
  // (the module exposes no hook to kill a live constructor, on purpose — a
  // second context is the leak the design refuses), so totality plus the
  // five-string state line IS the observable half of that contract.
  ok("window.Sfx publishes exactly the four public methods",
    !!window.Sfx && Object.keys(window.Sfx).length === 4 &&
    ["cue", "unlock", "frame", "state"].every((k) => typeof window.Sfx[k] === "function"),
    window.Sfx ? Object.keys(window.Sfx).join(",") : "no Sfx");
  ok("__test.audio republishes the same four functions, not copies",
    A.cue === window.Sfx.cue && A.unlock === window.Sfx.unlock &&
    A.frame === window.Sfx.frame && A.state === window.Sfx.state);
  ok("cue() is total: garbage arguments neither throw nor play",
    noThrow(() => A.cue()) && noThrow(() => A.cue(123)) && noThrow(() => A.cue(null, null, null)) &&
    noThrow(() => A.cue("thud", { x: "a", y: NaN }, "loud")) &&
    A.cue() === false && A.cue(123) === false);
  ok("frame() and state() are total before any unlock and after",
    noThrow(() => { A.frame(); A.frame(); A.frame(); }) && noThrow(() => A.state()));
  const st = A.state();
  const lineOk = st.line === "unavailable — this browser has no audiocontext" ||
    st.line === "idle — audio starts on the first click" ||
    st.line === "suspended — click the field to wake it" ||
    st.line === "closed" || /^running · master /.test(st.line);
  ok("state() carries the six readout fields and one of the five lines",
    typeof st.line === "string" && typeof st.ctx === "string" && typeof st.armed === "boolean" &&
    Number.isFinite(st.voices) && Number.isFinite(st.played) && Number.isFinite(st.dropped) && lineOk,
    JSON.stringify(st));
  ok("state().ctx names a real context condition",
    ["none", "unavailable", "running", "suspended", "interrupted", "closed"].includes(st.ctx),
    "ctx=" + st.ctx);
  const CUE_NAMES = ["blast", "boom", "buy", "charge", "clang", "clear", "dash", "death",
    "denied", "fire", "hit", "hurt", "kill", "killheavy", "launch", "lock",
    "pickup", "shop", "spawn", "spawnheavy",
    "test", "thud", "wall", "warn", "windup", "zap"];
  ok("the cue table holds exactly the 26 designed names",
    A.names().slice().sort().join(" ") === CUE_NAMES.join(" "),
    A.names().slice().sort().join(" "));
  let recErr = "";
  for (const n of A.names()) {
    const r = A.recipe(n);
    if (!r || !["shot", "foe", "ui"].includes(r.bus) || !(r.gap > 0) ||
        !Array.isArray(r.steps) || !r.steps.length ||
        !r.steps.every((s) => s[0] === "b" || s[0] === "n")) recErr += n + " ";
    if (A.recipe(n) !== r) recErr += n + ":copied ";
  }
  ok("every recipe names a bus, a positive gap and well-formed steps", !recErr, recErr);

  // ---- B. the log and the gate order ----
  // The gates run in a fixed order, and the top of that order is what a
  // headless suite can observe: unknown outranks everything, and mute sits
  // ABOVE the context checks precisely so a page with no context at all can
  // still see the mute gate through the log.
  A.clearLog();
  const unkRet = A.cue("nosuchsound");
  const unkEnt = entry("nosuchsound");
  ok("an unknown name is a logged, silent false — never a throw",
    unkRet === false && A.log().length === 1 && !!unkEnt &&
    unkEnt.played === false && unkEnt.why === "unknown",
    JSON.stringify(unkEnt));
  for (let k = 0; k < 300; k++) A.cue("nosuchsound");
  const capLen = A.log().length;
  const capAll = A.log().every((e) => e.name === "nosuchsound");
  A.clearLog();
  ok("the log caps at 256 entries, oldest shifted, and clearLog empties it",
    capLen === 256 && capAll && A.log().length === 0, "len=" + capLen);
  const undoMuteB = drive("sfxmute", true); // the bind auditions — clear that noise
  A.clearLog();
  const muteRet = A.cue("fire");
  const muteEnt = entry("fire");
  ok("mute drops the cue but the call still reaches the log",
    muteRet === false && !!muteEnt && muteEnt.played === false && muteEnt.why === "mute",
    JSON.stringify(muteEnt));
  // a REAL sim event while muted: the emission site still fires, the log
  // still records it, and the gate name says exactly why nothing played
  enc.reset();
  enc.E.hull = 99;
  enc.advance(1);
  enc.spawnEnemy(ship().x + 150, ship().y);
  enc.E.enemies[0].hp = 0;
  A.clearLog();
  enc.advance(1);
  const muteKill = entry("kill");
  ok("a muted page still logs the sim's own cues, marked mute",
    named("kill") === 1 && !!muteKill && muteKill.played === false && muteKill.why === "mute",
    JSON.stringify(muteKill));
  A.clearLog();
  A.cue("nosuchsound");
  ok("unknown outranks mute in the gate order",
    entry("nosuchsound").why === "unknown");
  undoMuteB();
  const undoVol0 = drive("sfxvol", 0);
  A.clearLog();
  ok("a master volume of zero is a mute, not a scheduled silence",
    A.cue("fire") === false && entry("fire").why === "mute");
  undoVol0();

  // ---- C. the gun and the walls ----
  // fire sits BELOW every refusal gate; the thud coalesces a corner into one
  // sound; the wall tick inherits the spark queue's arbitration; and FXINT 0
  // may kill the decoration but never the event.
  enc.reset();
  t.setAimMode("push");
  t.G.aimed = true;
  t.G.aimAngle = 0;
  A.clearLog();
  t.G.cool = 999;
  enc.fireOnce();
  ok("a refused shot is silent — no bullet, no cue",
    named("fire") === 0 && t.G.bullets.length === 0, "bullets=" + t.G.bullets.length);
  t.G.cool = 0;
  enc.fireOnce();
  ok("the shot that leaves the gun is the shot that sounds",
    named("fire") === 1 && t.G.bullets.length === 1, "fire=" + named("fire"));
  enc.reset();
  A.clearLog();
  t.G.ship.x = 2;
  t.G.vel.x = -4;
  enc.advance(1);
  ok("the ship meeting a wall thuds exactly once", named("thud") === 1, "thud=" + named("thud"));
  enc.reset();
  A.clearLog();
  t.G.ship.x = 2;
  t.G.ship.y = 2;
  t.G.vel.x = -4;
  t.G.vel.y = -4;
  enc.advance(1);
  ok("a corner bounce is one thud, never two — the axes coalesce",
    named("thud") === 1, "thud=" + named("thud"));
  enc.setBounce(false);
  enc.reset();
  A.clearLog();
  mkBullet(t.WW - 30, ship().y, 40);
  enc.advance(3);
  ok("a bullet dying at the world wall ticks once",
    named("wall") === 1 && t.G.bullets.length === 0, "wall=" + named("wall"));
  // the queue's arbitration: a body pinned at the wall eats the bullet on its
  // exit tick, so the HIT sounds and the wall tick stands down with the spark
  enc.reset();
  enc.E.hull = 99;
  enc.spawnEnemy(t.WW - 15, ship().y);
  A.clearLog();
  mkBullet(t.WW - 30, ship().y, 40);
  enc.advance(1);
  ok("a bullet eaten on its exit tick sounds the hit, not the wall",
    named("hit") === 1 && named("wall") === 0,
    "hit=" + named("hit") + " wall=" + named("wall"));
  // the H29 leg: FXINT used to gate the queue push, which made a decoration
  // slider double as a mute switch for wall ticks — the event must now
  // survive to the flush while the burst list stays empty
  t.setFxInt(0);
  enc.reset();
  A.clearLog();
  mkBullet(t.WW - 30, ship().y, 40);
  enc.advance(3);
  ok("intensity zero spawns no wall burst but the wall event still sounds",
    t.fx.bursts.length === 0 && named("wall") === 1,
    "bursts=" + t.fx.bursts.length + " wall=" + named("wall"));
  t.setFxInt(priorFxInt);

  // ---- D. the enemy tells, contact cadence, hurt and death ----
  // Every tell fires on its mode FLIP, once per event — a sustained telegraph,
  // a live beam or a dash in flight must not re-fire it per tick.
  enc.reset();
  enc.E.hull = 99;
  enc.advance(1);
  enc.spawnEnemy(ship().x + 100, ship().y);
  const dart = enc.E.enemies[0];
  dart.cd = 0; // rested, inside the 130 px engage — the next tick plants
  A.clearLog();
  enc.advance(1);
  ok("the lance telegraph sounds the tick the angle locks",
    named("charge") === 1 && dart.mode === "tele", "mode=" + dart.mode);
  enc.advance(ECFG.lance.telegraph + 5); // through the whole telegraph and into the pulse
  ok("a sustained telegraph and a live beam re-fire nothing: one charge, one zap",
    named("charge") === 1 && named("zap") === 1,
    "charge=" + named("charge") + " zap=" + named("zap"));
  enc.reset();
  enc.E.hull = 99;
  enc.advance(1);
  enc.spawnEnemy(ship().x + 200, ship().y, 0, "charger");
  const ram = enc.E.enemies[0];
  ram.cd = 0;
  A.clearLog();
  enc.advance(1);
  ok("the charger's windup sounds the tick the lunge line locks",
    named("windup") === 1 && ram.mode === "windup", "mode=" + ram.mode);
  enc.advance(ECFG.charger.windup + 6); // the flip plus six ticks of flight
  ok("a dash in flight sounds once, at the flip",
    named("dash") === 1 && named("windup") === 1,
    "dash=" + named("dash") + " windup=" + named("windup"));
  // the contact cue keys off the CLAIM, not the touch: a body pinned on the
  // ship every tick sounds once per CONTACTCD window, and the player's hurt
  // follows the i-frames, never the body's cooldown
  const ctCd = enc.tunables().CONTACTCD;
  enc.reset();
  enc.E.hull = 99;
  enc.advance(1);
  enc.spawnEnemy(ship().x + 150, ship().y + 150);
  const pin = enc.E.enemies[0];
  const repin = () => { pin.x = ship().x + 10; pin.y = ship().y; pin.vx = 0; pin.vy = 0; };
  pin.cd = 9999; // contact, not the lance
  repin();
  enc.E.invuln = 0;
  A.clearLog();
  enc.advance(1);
  ok("the first contact claim sounds one hit and one hurt",
    named("hit") === 1 && named("hurt") === 1 && enc.state().contactsDealt === 1,
    "hit=" + named("hit") + " hurt=" + named("hurt"));
  for (let k = 0; k < ctCd - 1; k++) { repin(); enc.advance(1); }
  ok("a sustained overlap inside the window stays silent",
    named("hit") === 1 && enc.state().contactsDealt === 1, "hit=" + named("hit"));
  repin();
  enc.advance(1);
  ok("the window expiring re-arms exactly one more hit",
    named("hit") === 2 && enc.state().contactsDealt === 2, "hit=" + named("hit"));
  ok("hurt tracks the player's own registered hits, not the body's cooldown",
    named("hurt") === enc.state().hitsTaken && named("hurt") >= 1,
    "hurt=" + named("hurt") + " hitsTaken=" + enc.state().hitsTaken);
  enc.reset();
  enc.advance(1);
  A.clearLog();
  const hurtHit = enc.damagePlayer(1);
  const gracedHit = enc.damagePlayer(1); // inside the fresh i-frames
  ok("a graced hit is refused silently — one hurt for one registered hit",
    hurtHit === true && gracedHit === false && named("hurt") === 1 && A.log().length === 1,
    "hurt=" + named("hurt") + " len=" + A.log().length);
  enc.E.invuln = 0;
  enc.damagePlayer(99);
  ok("the killing blow plays death alone, never hurt-then-death",
    named("death") === 1 && named("hurt") === 1 && enc.state().hull === 0,
    "death=" + named("death") + " hurt=" + named("hurt"));
  // the true dead FREEZE needs the quarter rule — open play respawns, so
  // the silent-corpse leg stages the last life the way the wave suite does
  enc.reset();
  enc.advance(1);
  enc.E.lobbyWaiters = 1;
  enc.E.seats[0].stock = 1;
  enc.damagePlayer(99);
  enc.E.lobbyWaiters = 0;
  A.clearLog();
  enc.advance(30);
  ok("a dead sim emits no cue at all",
    A.log().length === 0 && enc.state().state === "dead", "len=" + A.log().length);

  // ---- E. kills, orbs, the blast ----
  // reapDead is the ONE kill site — bullet, blast and contact deaths all
  // arrive there — so a body sounds exactly once, at the pitch its mass earns.
  enc.reset();
  enc.E.hull = 99;
  enc.advance(1);
  enc.spawnEnemy(ship().x + 150, ship().y);
  enc.E.enemies[0].hp = 0;
  A.clearLog();
  enc.advance(1);
  ok("a dart's death is one kill, never killheavy",
    named("kill") === 1 && named("killheavy") === 0 && enc.state().orbs === 1,
    "kill=" + named("kill"));
  const orb = enc.E.orbs[0];
  ship().x = orb.x - 40;
  ship().y = orb.y;
  enc.advance(120);
  ok("one banked orb is one pickup",
    named("pickup") === 1 && enc.state().orbs === 0 && enc.state().xp === 1,
    "pickup=" + named("pickup") + " xp=" + enc.state().xp);
  enc.reset();
  enc.E.hull = 99;
  enc.advance(1);
  enc.spawnEnemy(ship().x + 150, ship().y, 0, "charger");
  enc.E.enemies[0].hp = 0;
  A.clearLog();
  enc.advance(1);
  ok("a charger's death is one killheavy — per body, not per orb",
    named("killheavy") === 1 && named("kill") === 0 && enc.state().orbs === 2,
    "killheavy=" + named("killheavy") + " orbs=" + enc.state().orbs);
  // one tick can reap many bodies — the log gets one entry per body, and the
  // GAP throttle (a playback concern) never eats an event from the record
  enc.reset();
  enc.E.hull = 99;
  enc.advance(1);
  enc.spawnEnemy(ship().x + 150, ship().y);
  enc.spawnEnemy(ship().x + 180, ship().y + 40);
  enc.spawnEnemy(ship().x + 150, ship().y - 60, 0, "charger");
  for (const e of enc.E.enemies) e.hp = 0;
  A.clearLog();
  enc.advance(1);
  ok("a multi-kill tick logs one cue per body, at each body's own pitch",
    named("kill") === 2 && named("killheavy") === 1 && enc.state().kills === 3,
    "kill=" + named("kill") + " killheavy=" + named("killheavy"));
  // the blast: silent at rank 0 (the R <= 0 return sits above the cue), one
  // cue per splash at rank 1. The radius slider is driven to the 18 px bench
  // so the neighbour geometry is the check's, not the page's, and put back.
  const undoBlastR = drive("blastr", 18);
  const dartHp = ECFG.enemy.hp;
  const blastLeg = (ranks) => {
    enc.reset();
    enc.E.hull = 99;
    enc.advance(1);
    if (ranks) {
      enc.addXp(1000); // the panel sells mid-wave — no staged visit
      enc.buy(enc.shopInfo().findIndex((r) => r.name === "BLAST CHARGE"));
    }
    const sy = ship().y;
    enc.spawnEnemy(ship().x + 150, sy);
    const target = enc.E.enemies[enc.E.enemies.length - 1];
    const ix = target.x - (target.r + 2.2); // the entry point on the inflated body
    enc.spawnEnemy(ix, sy + 18 + ECFG.enemy.r - 3); // circle 3 px inside the bench rim,
    const near = enc.E.enemies[enc.E.enemies.length - 1]; // 22 px off the shot line —
    A.clearLog();                                         // clear of the bullet's own 9.2
    mkBullet(target.x - 40, sy, 40);
    enc.advance(1);
    return { target, near };
  };
  const b0 = blastLeg(0);
  ok("rank zero splashes no sound — the hit lands alone",
    named("hit") === 1 && named("blast") === 0 && b0.near.hp === dartHp,
    "hit=" + named("hit") + " blast=" + named("blast") + " nearHp=" + b0.near.hp);
  const b1 = blastLeg(1);
  ok("rank one's splash is one blast beside the one hit",
    named("blast") === 1 && named("hit") === 1 && b1.near.hp === dartHp - 1,
    "blast=" + named("blast") + " nearHp=" + b1.near.hp);
  undoBlastR();

  // ---- F. the wave arc: warn, spawn, clear, the sweep, the hand-off ----
  // warn lands strictly after the seeded anchor draws; spawn is one cue per
  // GROUP however many bodies the group lands, pitched by the group's type.
  // The first pack is staged as a charger group — the schedule itself never
  // deals one on wave 1, and the type field is exactly what the cue reads.
  enc.reset();
  enc.E.hull = 99;
  enc.advance(1);
  enc.E.groups[0].type = "charger";
  A.clearLog();
  enc.advance(W1[0].spawnAt - 1);
  ok("group one: one warn, one spawnheavy for three charger bodies",
    named("warn") === 1 && named("spawnheavy") === 1 && named("spawn") === 0 &&
    enc.state().enemies === 3 && enc.state().chargers === 3,
    "warn=" + named("warn") + " heavy=" + named("spawnheavy") + " n=" + enc.state().enemies);
  A.clearLog();
  enc.advance(W1[1].spawnAt - W1[0].spawnAt);
  ok("group two: one warn, one dart-pitched spawn for two bodies",
    named("warn") === 1 && named("spawn") === 1 && named("spawnheavy") === 0 &&
    enc.state().enemies === 5,
    "warn=" + named("warn") + " spawn=" + named("spawn"));
  // the full clear flow, cued end to end: the last reap, the one victory
  // phrase, and the sweep's per-orb pickups — the wave then hands itself
  // over with no shop door and no freeze
  enc.reset();
  enc.E.hull = 99;
  enc.advance(130);
  for (const e of enc.E.enemies) e.hp = 0;
  enc.advance(W1[1].spawnAt - 130 + 1);
  for (const e of enc.E.enemies) e.hp = 0;
  A.clearLog();
  enc.advance(1);
  ok("the clearing tick sounds the last kills and one clear",
    named("kill") === 2 && named("clear") === 1 && enc.state().state === "cleared",
    "kill=" + named("kill") + " clear=" + named("clear") + " state=" + enc.state().state);
  const orbsAtClear = enc.state().orbs;
  enc.advance(ECFG.clearHold + 1);
  ok("the sweep banks a pickup per orb and wave 2 deals itself with no shop cue",
    orbsAtClear >= 2 && named("pickup") === orbsAtClear && named("shop") === 0 &&
    enc.state().state === "warning" && enc.state().wave === 2 && !enc.frozen(),
    "orbs=" + orbsAtClear + " pickup=" + named("pickup") + " shop=" + named("shop") +
    " state=" + enc.state().state);
  // the ONE remaining freeze is the terminal dead screen — staged, it still
  // silences the sim and holds fire()'s cue behind the frozen gate
  const deadStateWas = enc.state().state;
  enc.E.state = "dead";
  A.clearLog();
  enc.advance(40);
  ok("the dead freeze advances no sim and emits no cue",
    A.log().length === 0 && enc.state().state === "dead", "len=" + A.log().length);
  t.setAimMode("push"); // fire()'s frozen gate sits above its cue — prove it
  t.G.aimed = true;
  t.G.cool = 0;
  enc.fireOnce();
  ok("fire over the dead freeze is refused before it can sound",
    named("fire") === 0 && t.G.bullets.length === 0, "fire=" + named("fire"));
  enc.E.state = deadStateWas;
  // the shop's OWN cues, mid-wave now: the three player-reachable refusals
  // each sound denied, a sale sounds buy, and the refusal no pointer can
  // reach stays silent — programming errors ask for no feedback
  A.clearLog();
  enc.E.xp = 0;
  enc.buy(0);                     // an empty wallet — the cost refusal
  enc.E.hull = enc.E.hullMax;
  enc.buy(2);                     // HULL PATCH off the shelf — the can() refusal
  enc.addXp(200);
  const sale = enc.buy(4);        // BLAST CHARGE rank 1 (row 4 now) — a sale
  enc.buy(4);                     // rank 2 — a sale
  enc.buy(4);                     // rank 3 — the cap, still a sale
  enc.buy(4);                     // rank four's ask — the maxed refusal
  ok("all three reachable refusals sound denied, and every sale sounds buy",
    sale === true && named("denied") === 3 && named("buy") === 3,
    "denied=" + named("denied") + " buy=" + named("buy"));
  enc.buy(99);                    // no such row — silent by design
  ok("the unreachable refusal stays silent and the wave is untouched",
    A.log().length === 6 && enc.state().state === "warning" && enc.state().wave === 2,
    "len=" + A.log().length + " state=" + enc.state().state);

  // ---- G. determinism — the observer never writes and never draws ----
  // Two identically seeded runs with every cue site live must match to the
  // last decimal, and a MUTED third must match them both: mute changes which
  // gate a cue exits through, never what the sim does or which events fire.
  // The key folds in the group anchors (one stolen rand() draw would move
  // them), the bodies, the orbs and the cue-name sequence itself.
  const detRun = (seed) => {
    A.resetThrottles();
    A.clearLog();
    enc.reset(seed);
    enc.E.hull = 99;
    enc.advance(400);
    return JSON.stringify([
      enc.state(),
      enc.E.enemies.map((e) => [+e.x.toFixed(3), +e.y.toFixed(3), e.hp, e.mode]),
      enc.E.orbs.map((o) => [+o.x.toFixed(3), +o.y.toFixed(3)]),
      enc.E.groups.map((g) => (g.points ? [+g.points.anchor.x.toFixed(3), +g.points.anchor.y.toFixed(3)] : null)),
      A.log().map((e) => e.name),
    ]);
  };
  const detA = detRun(1234);
  const detB = detRun(1234);
  ok("two seeded runs with audio live replay identically, cues included",
    detA === detB && detA.length > 10, "len=" + detA.length);
  const undoMuteG = drive("sfxmute", true);
  const detM = detRun(1234);
  undoMuteG();
  ok("a muted run deals the identical wave — audio on and off consume the same draws",
    detM === detA, "muted equal=" + (detM === detA));

  // ---- H. the engine observer ----
  // THE HUM IS THE FLAME: engine() is the pure drive calc frame() uses, off
  // live G, so the invariant is assertable with no context and no gesture.
  const engFlame = { x: t.G.flame.x, y: t.G.flame.y };
  const engVel = { x: t.G.vel.x, y: t.G.vel.y };
  t.G.flame.x = 0;
  t.G.flame.y = 0;
  t.G.vel.x = 0;
  t.G.vel.y = 0;
  const engOff = A.engine();
  t.G.flame.x = 0.01; // 0.8 px of flame — under drawFlame's own 1.5 px floor
  const engFaint = A.engine();
  t.G.flame.x = 1;    // 80 px asked, capped at the 20 px tongue — saturated
  const engFull = A.engine();
  t.G.flame.x = 0.025; // 2 px of flame — visible, far from the cap
  const engMid = A.engine();
  ok("the hum is audible exactly when the flame is drawn",
    engOff.drive === 0 && engFaint.drive === 0 && engFull.drive === 1 &&
    engMid.drive > 0 && engMid.drive < 1,
    "off=" + engOff.drive + " faint=" + engFaint.drive + " full=" + engFull.drive + " mid=" + engMid.drive);
  const engStill = A.engine();
  t.G.vel.x = 99; // far over any cap — the ratio clamps at 1
  const engFast = A.engine();
  t.G.vel.x = 0;
  ok("pitch rides speed: stable at rest, higher at the cap",
    engStill.freq === A.engine().freq && engFast.freq > engStill.freq,
    "still=" + engStill.freq + " fast=" + engFast.freq);
  enc.reset();
  enc.E.state = "dead"; // frozen — the gate must hold whatever armed and running say
  const engFrozen = A.engine();
  enc.restart();
  ok("a frozen sim holds the engine gate closed", engFrozen.on === false,
    "on=" + engFrozen.on + " armed=" + A.armed());
  t.G.flame.x = engFlame.x;
  t.G.flame.y = engFlame.y;
  t.G.vel.x = engVel.x;
  t.G.vel.y = engVel.y;
  const engSnap = () => JSON.stringify([enc.state(), ship().x, ship().y, t.G.vel.x, t.G.vel.y,
    enc.E.enemies.map((e) => [e.x, e.y, e.hp])]);
  const engBefore = engSnap();
  for (let k = 0; k < 100; k++) A.frame();
  ok("a hundred frame() calls write no sim state at all", engSnap() === engBefore);

  // ---- I. the rolloff ----
  // The listener is the SHIP; the documented curve is full inside 260 px,
  // silent past 1100, squared between — the midpoint of that band lands on
  // exactly a quarter. The constants live only in audio.js, so this section
  // states them rather than reading them; the shape checks stand either way.
  const sx = ship().x;
  const sy2 = ship().y;
  ok("at the listener the rolloff is unity, far past it silence",
    A.att(sx, sy2) === 1 && A.att(sx + 2000, sy2) === 0,
    "near=" + A.att(sx, sy2) + " far=" + A.att(sx + 2000, sy2));
  ok("the rolloff is monotone and never negative between the rails",
    A.att(sx + 400, sy2) >= A.att(sx + 700, sy2) && A.att(sx + 700, sy2) > 0 &&
    A.att(sx + 700, sy2) < 1,
    "at400=" + A.att(sx + 400, sy2) + " at700=" + A.att(sx + 700, sy2));
  ok("the documented 260/1100 squared curve holds at its edges and midpoint",
    A.att(sx + 260, sy2) === 1 && A.att(sx + 1100, sy2) === 0 &&
    Math.abs(A.att(sx + 680, sy2) - 0.25) < 1e-9,
    "mid=" + A.att(sx + 680, sy2));

  // ---- J. the mixer: the lets, the sliders, the readouts ----
  // The tuner values live in game.js and audio.js reads them LIVE — the
  // shared global lexical scope is the whole mechanism, so the module's
  // levels() and the DOM controls must never disagree.
  const lv = A.levels();
  ok("levels() matches every audio control the dev panel holds",
    lv.SFXVOL === Number(document.getElementById("sfxvol").value) &&
    lv.SFXMUTE === document.getElementById("sfxmute").checked &&
    lv.SFXSHOT === Number(document.getElementById("sfxshot").value) &&
    lv.SFXFOE === Number(document.getElementById("sfxfoe").value) &&
    lv.SFXUI === Number(document.getElementById("sfxui").value) &&
    lv.SFXENG === Number(document.getElementById("sfxeng").value),
    JSON.stringify(lv));
  const shotTarget = Number(priorShot) === 0.8 ? 0.6 : 0.8;
  const undoShot = drive("sfxshot", shotTarget);
  ok("a bus slider drives the let audio.js reads, and its readout restates it",
    A.levels().SFXSHOT === shotTarget &&
    document.getElementById("sfxshot-out").textContent ===
      Math.round(shotTarget * 100) + "% · fire, wall ticks, hits, kills, the blast",
    "SFXSHOT=" + A.levels().SFXSHOT + " out=" + document.getElementById("sfxshot-out").textContent);
  undoShot();
  const volTarget = Number(priorVol) === 0.35 ? 0.4 : 0.35;
  const undoVolJ = drive("sfxvol", volTarget);
  ok("the master slider readout states the value in both units — percent and gain",
    A.levels().SFXVOL === volTarget &&
    document.getElementById("sfxvol-out").textContent ===
      Math.round(volTarget * 100) + "% master · gain " + (Math.pow(volTarget, 1.6) * 0.4).toFixed(3),
    "out=" + document.getElementById("sfxvol-out").textContent);
  undoVolJ();
  const undoVolHi = drive("sfxvol", 9);
  const clampedHi = A.levels().SFXVOL;
  undoVolHi();
  const undoVolLo = drive("sfxvol", -3);
  const clampedLo = A.levels().SFXVOL;
  undoVolLo();
  ok("the volume knobs clamp at the slider rails — 0..1, never past them",
    clampedHi === 1 && clampedLo === 0 && A.levels().SFXVOL === Number(priorVol),
    "hi=" + clampedHi + " lo=" + clampedLo + " back=" + A.levels().SFXVOL);
  const undoMuteJ = drive("sfxmute", true);
  const mutedOut = document.getElementById("sfxmute-out").textContent;
  undoMuteJ();
  const unmutedOut = document.getElementById("sfxmute-out").textContent;
  ok("the mute readout states the state, not a rule",
    mutedOut === "muted — every cue is dropped" &&
    (document.getElementById("sfxmute").checked ? mutedOut : "sound on") === unmutedOut,
    "muted=[" + mutedOut + "] back=[" + unmutedOut + "]");
  A.clearLog();
  document.getElementById("sfxtest").click(); // the page's own audition path
  const testEnt = entry("test");
  const undoVolSync = drive("sfxvol", priorVol); // any input refreshes showTuner
  ok("the audition button fires the test cue through the real click path",
    named("test") >= 1 && !!testEnt, "test=" + named("test"));
  ok("the audition readout is Sfx.state()'s own line, verbatim",
    document.getElementById("sfxtest-out").textContent === A.state().line,
    "out=[" + document.getElementById("sfxtest-out").textContent + "] line=[" + A.state().line + "]");
  undoVolSync();

  // ---- K. the throttle and the budget ----
  // Twenty fire cues inside one synchronous burst share one audio instant, so
  // at most ONE can schedule (the gap gate coalesces the rest) — and on a page
  // that was never armed, none do. Either way every call reaches the log:
  // fewer voices than calls, dropped and never queued, is the whole contract.
  A.resetThrottles();
  A.clearLog();
  const statsBefore = A.stats();
  let burstTrue = 0;
  for (let k = 0; k < 20; k++) if (A.cue("fire")) burstTrue++;
  const burst = A.log().filter((e) => e.name === "fire");
  const burstPlayed = burst.filter((e) => e.played).length;
  ok("a 20-call burst logs 20 calls and schedules at most one voice",
    burst.length === 20 && burstPlayed <= 1 && burstTrue === burstPlayed,
    "logged=" + burst.length + " played=" + burstPlayed);
  const statsAfter = A.stats();
  ok("the counters agree with the log, and live voices never pass the 16 budget",
    statsAfter.played - statsBefore.played === burstPlayed &&
    statsAfter.live >= 0 && statsAfter.live <= 16,
    "played+=" + (statsAfter.played - statsBefore.played) + " live=" + statsAfter.live);
  A.clearLog();
  const liveAt = A.stats().live;
  A.frame();
  A.frame();
  A.frame();
  ok("nothing was banked: later frames release voices, never start them",
    A.log().length === 0 && A.stats().live <= liveAt,
    "len=" + A.log().length + " live=" + A.stats().live);

  // ---- restore the page for a human ----
  t.setAimMode(priorAim);
  t.setFxInt(priorFxInt);
  enc.setBounce(priorBounce);
  drive("sfxvol", priorVol);
  drive("sfxmute", priorMute);
  drive("sfxshot", priorShot);
  t.G.leftHeld = false;
  A.resetThrottles();
  A.clearLog();
  enc.restart();
  t.render();

  const failed = R.filter((r) => !r.pass);
  return { total: R.length, passed: R.length - failed.length, failed, results: R };
};
