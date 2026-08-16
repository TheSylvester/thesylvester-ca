"use strict";

// Deterministic radar-variant checks — the three radar archetypes
// (radarDart / radarCharger / radarHarrier), the predictive-aim latch they
// share, the wave schedule that deals them in, the +1 orb economy, the
// slow-turn radar missile, and the RADAR VARIANTS tuning group. Load this
// file in the page (fetch + eval from the console, or a script tag), then
// call runRadarChecks(). The suite drives the fixed-step sim through
// window.__test only — no RAF, no real input. Every baseline it touches
// (ECFG.radar fields, the ship's position and velocity) goes back exactly
// where it was found, and the encounter is reset on the way out, so the
// other suites still pass at defaults in the same page load.
window.runRadarChecks = function () {
  const t = window.__test;
  const enc = t.enc;
  const ECFG = enc.cfg;
  const G = t.G;
  const R = [];
  const ok = (name, cond, info) => R.push({ name, pass: !!cond, info: info === undefined ? "" : String(info) });
  const done = () => {
    const failed = R.filter((r) => !r.pass);
    return { total: R.length, passed: R.length - failed.length, failed, results: R };
  };
  const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const shipR = typeof SHIP_R !== "undefined" ? SHIP_R : 7;
  const clampPt = (x, y) => ({
    x: Math.max(shipR, Math.min(t.WW - shipR, x)),
    y: Math.max(shipR, Math.min(t.WH - shipR, y)),
  });

  // ---- the restore ledger: everything this suite may move, as found ----
  const radarCfg = ECFG.radar;
  ok("ECFG.radar exists with finite leadScale, deadband and missileTurn",
    !!radarCfg && Number.isFinite(radarCfg.leadScale) && Number.isFinite(radarCfg.deadband) &&
    Number.isFinite(radarCfg.missileTurn),
    radarCfg ? JSON.stringify(radarCfg) : "no ECFG.radar");
  if (!radarCfg) {
    ok("the remaining checks were skipped — no radar config to drive", false, "bail");
    return done();
  }
  const foundRadar = { leadScale: radarCfg.leadScale, deadband: radarCfg.deadband, missileTurn: radarCfg.missileTurn };
  const foundVel = { x: G.vel.x, y: G.vel.y };
  const hasPA = typeof enc.predictAim === "function";
  ok("__test.enc.predictAim is exposed", hasPA, typeof enc.predictAim);

  // the closed-form the implementation promises, recomputed independently:
  // deadband collapse, leadScale, delay extrapolation, intercept quadratic
  // (smallest positive root, pure-pursuit fallback), and the world clamp.
  const expectAim = (e, delay, projSpeed, ship, vel) => {
    const speed = Math.hypot(vel.x, vel.y);
    if (speed < ECFG.radar.deadband) {
      const p0 = clampPt(ship.x, ship.y);
      return { a: Math.atan2(p0.y - e.y, p0.x - e.x), x: p0.x, y: p0.y };
    }
    const vx = vel.x * ECFG.radar.leadScale;
    const vy = vel.y * ECFG.radar.leadScale;
    let tx = ship.x + vx * delay;
    let ty = ship.y + vy * delay;
    if (projSpeed > 0) {
      const rx = tx - e.x;
      const ry = ty - e.y;
      const A = vx * vx + vy * vy - projSpeed * projSpeed;
      const B = 2 * (rx * vx + ry * vy);
      const C = rx * rx + ry * ry;
      let ti = -1;
      if (Math.abs(A) > 1e-9) {
        const disc = B * B - 4 * A * C;
        if (disc >= 0) {
          const sq = Math.sqrt(disc);
          const t1 = (-B - sq) / (2 * A);
          const t2 = (-B + sq) / (2 * A);
          ti = Math.min(t1 > 0 ? t1 : Infinity, t2 > 0 ? t2 : Infinity);
          if (!Number.isFinite(ti)) ti = -1;
        }
      } else if (Math.abs(B) > 1e-9) {
        const tl = -C / B;
        if (tl > 0) ti = tl;
      }
      if (ti < 0) ti = Math.sqrt(C) / projSpeed; // pure-pursuit fallback
      tx += vx * ti;
      ty += vy * ti;
    }
    const p = clampPt(tx, ty);
    return { a: Math.atan2(p.y - e.y, p.x - e.x), x: p.x, y: p.y };
  };

  // ---- A. schedule: countsFor deals the radar variants in on time ----
  const c1 = enc.countsFor(1);
  const c2 = enc.countsFor(2);
  const c4 = enc.countsFor(4);
  const c5 = enc.countsFor(5);
  const c30 = enc.countsFor(30);
  ok("wave 1 deals zero radar variants of every kind",
    !c1.radarDarts && !c1.radarHarriers && !c1.radarChargers,
    "d=" + c1.radarDarts + " h=" + c1.radarHarriers + " c=" + c1.radarChargers);
  ok("the radar debuts land on schedule: dart@2, harrier@4, charger@5",
    c2.radarDarts === 1 && c4.radarHarriers === 1 && c5.radarChargers === 1,
    "w2d=" + c2.radarDarts + " w4h=" + c4.radarHarriers + " w5c=" + c5.radarChargers);
  ok("the deep-wave caps hold at 3/2/2",
    c30.radarDarts === 3 && c30.radarHarriers === 2 && c30.radarChargers === 2,
    "d=" + c30.radarDarts + " h=" + c30.radarHarriers + " c=" + c30.radarChargers);

  // ---- B. waveGroups: the stamp on dart packs, singles for the big two ----
  const W1 = enc.waveGroups(1);
  const w1Shape = W1.length === 2 &&
    W1[0].count === 3 && W1[0].type === "dart" && W1[0].warnAt === 36 && W1[0].spawnAt === 126 &&
    W1[1].count === 2 && W1[1].type === "dart" && W1[1].warnAt === 810 && W1[1].spawnAt === 900;
  ok("waveGroups(1) is untouched: the two hand-tuned dart groups, no radar stamp",
    w1Shape && !W1[0].radar && !W1[1].radar,
    "n=" + W1.length + " g0=" + JSON.stringify(W1 && W1[0]) + " g1=" + JSON.stringify(W1 && W1[1]));
  const W2 = enc.waveGroups(2);
  const w2Stamped = W2.filter((g) => g.radar);
  ok("waveGroups(2) stamps exactly one dart pack and queues no radarDart group of its own",
    w2Stamped.length === 1 && w2Stamped[0].type === "dart" &&
    !W2.some((g) => g.type === "radarDart"),
    "stamped=" + w2Stamped.length + " types=" + W2.map((g) => g.type + (g.radar ? "*" : "")).join(","));
  const W5 = enc.waveGroups(5);
  const w5RH = W5.filter((g) => g.type === "radarHarrier");
  const w5RC = W5.filter((g) => g.type === "radarCharger");
  const w5DartPacks = W5.filter((g) => g.type === "dart");
  const w5Stamped = w5DartPacks.filter((g) => g.radar);
  ok("waveGroups(5) deals the radar harrier and charger as count-1 singles",
    w5RH.length === c5.radarHarriers && w5RC.length === c5.radarChargers &&
    w5RH.every((g) => g.count === 1) && w5RC.every((g) => g.count === 1),
    "rh=" + w5RH.length + "/" + c5.radarHarriers + " rc=" + w5RC.length + "/" + c5.radarChargers);
  ok("waveGroups(5) stamps the LAST n.radarDarts dart packs — the cyan leader arrives late",
    w5Stamped.length === Math.min(c5.radarDarts, w5DartPacks.length) &&
    w5DartPacks.slice(w5DartPacks.length - w5Stamped.length).every((g) => g.radar),
    "stamped=" + w5Stamped.length + " want=" + c5.radarDarts + " packs=" + w5DartPacks.length);

  // ---- C. statsFor parity: identical to the parent except orbDrop and markers ----
  const pairs = [["radarDart", "dart"], ["radarCharger", "charger"], ["radarHarrier", "harrier"]];
  for (const wave of [1, 7]) {
    const S = enc.statsFor(wave);
    let err = "";
    for (const [kid, parent] of pairs) {
      const rs = S[kid];
      const ps = S[parent];
      if (!rs || !ps) { err += kid + ":missing "; continue; }
      if (rs.radar !== true || rs.base !== parent) err += kid + ":markers(" + rs.radar + "," + rs.base + ") ";
      if (rs.orbDrop !== ps.orbDrop + 1) err += kid + ":orb " + rs.orbDrop + "!=" + (ps.orbDrop + 1) + " ";
      for (const k of Object.keys(ps)) {
        if (k === "orbDrop" || k === "radar" || k === "base") continue;
        if (rs[k] !== ps[k]) err += kid + "." + k + ":" + rs[k] + "!=" + ps[k] + " ";
      }
      for (const k of Object.keys(rs)) {
        if (k === "radar" || k === "base") continue;
        if (!(k in ps)) err += kid + "." + k + ":extra ";
      }
    }
    ok("statsFor(" + wave + ") radar variants mirror their parents except orbDrop+1 and markers", !err, err);
  }

  // ---- D. the latch, still ship: plain bearing under the deadband ----
  enc.reset();
  G.vel.x = 0;
  G.vel.y = 0;
  enc.spawnEnemy(G.ship.x - 100, G.ship.y, 0, "radarDart");
  let e = enc.E.enemies[enc.E.enemies.length - 1];
  if (e) e.cd = 0;
  enc.advance(1);
  e = enc.E.enemies[enc.E.enemies.length - 1];
  const stillBearing = e ? Math.atan2(G.ship.y - e.y, G.ship.x - e.x) : NaN;
  ok("a still ship latches the plain bearing at telegraph start",
    !!e && e.mode === "tele" && Math.abs(norm(e.lockA - stillBearing)) < 1e-9 && e.face === e.lockA,
    e ? "mode=" + e.mode + " lockA=" + e.lockA + " want=" + stillBearing : "no body");
  ok("the latch stamps predX/predY on the ship and predT=20",
    !!e && e.predT === 20 && Math.abs(e.predX - G.ship.x) < 1e-9 && Math.abs(e.predY - G.ship.y) < 1e-9,
    e ? "predT=" + e.predT + " pred=" + e.predX + "," + e.predY + " ship=" + G.ship.x + "," + G.ship.y : "no body");

  // ---- E. the latch, moving ship: the aim leads, and leads the right way ----
  enc.reset();
  G.vel.x = 0;
  G.vel.y = 1.5; // lateral, well above the deadband
  enc.spawnEnemy(G.ship.x - 100, G.ship.y, 0, "radarDart");
  e = enc.E.enemies[enc.E.enemies.length - 1];
  if (e) e.cd = 0;
  enc.advance(1);
  e = enc.E.enemies[enc.E.enemies.length - 1];
  const plainNow = e ? Math.atan2(G.ship.y - e.y, G.ship.x - e.x) : NaN;
  const leadOff = e ? norm(e.lockA - plainNow) : NaN;
  ok("a moving ship's latch leads the bearing, in the direction of travel",
    !!e && e.mode === "tele" && Math.abs(leadOff) > 0.05 && Math.sign(leadOff) === Math.sign(G.vel.y),
    e ? "offset=" + (Number.isFinite(leadOff) ? leadOff.toFixed(4) : leadOff) + " vel.y=" + G.vel.y : "no body");
  G.vel.x = 0;
  G.vel.y = 0;
  enc.reset();

  // ---- F. predictAim unit tests: fixture body, hand-set ship, no ticks ----
  if (hasPA) {
    const shipWas = { x: G.ship.x, y: G.ship.y };
    const fix = { x: G.ship.x - 150, y: G.ship.y };
    // deadband collapse: slow drift reads as a still target
    G.vel.x = 0;
    G.vel.y = 0.1;
    let got = enc.predictAim(fix, ECFG.lance.telegraph, 0);
    let want = expectAim(fix, ECFG.lance.telegraph, 0, G.ship, G.vel);
    ok("predictAim collapses sub-deadband velocity to the plain bearing",
      Math.abs(norm(got.a - want.a)) < 1e-9 && Math.abs(got.x - G.ship.x) < 1e-9 && Math.abs(got.y - G.ship.y) < 1e-9,
      "got=" + JSON.stringify(got) + " want=" + JSON.stringify(want));
    // dart parameters: projSpeed 0, target = ship + vel*telegraph, clamped
    G.vel.y = 1.5;
    got = enc.predictAim(fix, ECFG.lance.telegraph, 0);
    want = expectAim(fix, ECFG.lance.telegraph, 0, G.ship, G.vel);
    ok("predictAim extrapolates ship + vel*delay for a hitscan (dart) latch",
      Math.abs(norm(got.a - want.a)) < 1e-6 && Math.abs(got.x - want.x) < 1e-6 && Math.abs(got.y - want.y) < 1e-6,
      "got=" + JSON.stringify(got) + " want=" + JSON.stringify(want));
    // leadScale halves the lead
    const lsWas = ECFG.radar.leadScale;
    ECFG.radar.leadScale = 0.5;
    got = enc.predictAim(fix, ECFG.lance.telegraph, 0);
    want = expectAim(fix, ECFG.lance.telegraph, 0, G.ship, G.vel);
    ECFG.radar.leadScale = lsWas;
    ok("predictAim scales the lead by ECFG.radar.leadScale",
      Math.abs(norm(got.a - want.a)) < 1e-6 && Math.abs(got.x - want.x) < 1e-6 && Math.abs(got.y - want.y) < 1e-6 &&
      Math.abs(want.y - (shipWas.y + 1.5 * 0.5 * ECFG.lance.telegraph)) < 1e-9,
      "got=" + JSON.stringify(got) + " want=" + JSON.stringify(want));
    // harrier parameters: the intercept quadratic, velocity perpendicular to LOS
    const far = { x: G.ship.x - 200, y: G.ship.y };
    G.vel.x = 0;
    G.vel.y = 2;
    got = enc.predictAim(far, ECFG.harrier.lockon, ECFG.missile.speed);
    want = expectAim(far, ECFG.harrier.lockon, ECFG.missile.speed, G.ship, G.vel);
    ok("predictAim solves the intercept quadratic for a projectile (harrier) latch",
      Math.abs(norm(got.a - want.a)) < 1e-6 && Math.abs(got.x - want.x) < 1e-6 && Math.abs(got.y - want.y) < 1e-6,
      "got=" + JSON.stringify(got) + " want=" + JSON.stringify(want));
    G.vel.x = 0;
    G.vel.y = 0;
    G.ship.x = shipWas.x;
    G.ship.y = shipWas.y;
  } else {
    ok("the predictAim unit tests were skipped — helper not exposed", false, "no predictAim");
    ok("the intercept quadratic test was skipped — helper not exposed", false, "no predictAim");
  }

  // ---- G. the tuning bridge: the RADAR VARIANTS group and its live rows ----
  const T = enc.tuning;
  const radarGroup = T && Array.isArray(T.groups) ? T.groups.find((g) => g.key === "radar") : null;
  const rowIds = radarGroup ? radarGroup.rows.map((r) => r.id) : [];
  ok("Encounter.tuning carries a 'radar' group labeled RADAR VARIANTS with exactly its three rows",
    !!radarGroup && radarGroup.label === "RADAR VARIANTS" &&
    rowIds.join(",") === "radar-lead-scale,radar-deadband,radar-missile-turn",
    radarGroup ? "label=" + radarGroup.label + " ids=" + rowIds.join(",") : "no radar group");
  const rowBy = (id) => radarGroup && radarGroup.rows.find((r) => r.id === id);
  const rLead = rowBy("radar-lead-scale");
  const rDead = rowBy("radar-deadband");
  const rTurn = rowBy("radar-missile-turn");
  ok("the radar rows read the live ECFG.radar baselines",
    !!rLead && !!rDead && !!rTurn &&
    rLead.get() === ECFG.radar.leadScale && rDead.get() === ECFG.radar.deadband &&
    rTurn.get() === ECFG.radar.missileTurn,
    (rLead ? rLead.get() + "/" + ECFG.radar.leadScale : "no lead row") +
    (rDead ? " " + rDead.get() + "/" + ECFG.radar.deadband : " no deadband row") +
    (rTurn ? " " + rTurn.get() + "/" + ECFG.radar.missileTurn : " no turn row"));

  // ---- H. the radar missile: stamped, and steered by the radar turn knob ----
  enc.reset();
  const turnWas = rTurn ? rTurn.get() : ECFG.radar.missileTurn;
  const setTurn = (v) => { if (rTurn) rTurn.set(v); else ECFG.radar.missileTurn = v; };
  // the flag, both ways
  const mPlain = enc.spawnMissile(Math.max(30, G.ship.x - 240), Math.min(t.WH - 30, G.ship.y + 200), 0, false);
  const m = enc.spawnMissile(Math.max(30, G.ship.x - 240), Math.min(t.WH - 30, G.ship.y + 200), 0, true);
  ok("spawnMissile stamps m.radar from its fourth argument",
    !!m && m.radar === true && !!mPlain && mPlain.radar === false,
    "radar=" + (m && m.radar) + " plain=" + (mPlain && mPlain.radar));
  // zero the radar turn limit: past arm, a radar missile flies dead straight
  setTurn(0);
  enc.advance(Math.max(15, ECFG.missile.arm + 3));
  const p1 = m ? { x: m.x, y: m.y } : null;
  enc.advance(1);
  const p2 = m ? { x: m.x, y: m.y } : null;
  enc.advance(1);
  const p3 = m ? { x: m.x, y: m.y } : null;
  const cross0 = p1 && p2 && p3
    ? (p2.x - p1.x) * (p3.y - p2.y) - (p2.y - p1.y) * (p3.x - p2.x)
    : NaN;
  ok("with ECFG.radar.missileTurn at 0 a radar missile is ballistic past arm",
    !!m && !m.dead && Number.isFinite(cross0) && Math.abs(cross0) < 1e-9 &&
    ECFG.missile.turn > 0, // the ordinary knob is still live — the straight line proves the radar knob is the one read
    "cross=" + cross0 + " missile.turn=" + ECFG.missile.turn);
  setTurn(turnWas);
  // ...and with the found (nonzero) limit restored, a fresh radar missile bends
  enc.reset();
  const m2 = enc.spawnMissile(Math.max(30, G.ship.x - 240), Math.min(t.WH - 30, G.ship.y + 200), 0, true);
  enc.advance(Math.max(15, ECFG.missile.arm + 3));
  const q1 = m2 ? { x: m2.x, y: m2.y } : null;
  enc.advance(1);
  const q2 = m2 ? { x: m2.x, y: m2.y } : null;
  enc.advance(1);
  const q3 = m2 ? { x: m2.x, y: m2.y } : null;
  const cross1 = q1 && q2 && q3
    ? (q2.x - q1.x) * (q3.y - q2.y) - (q2.y - q1.y) * (q3.x - q2.x)
    : NaN;
  ok("with the restored missileTurn a radar missile steers toward the ship",
    !!m2 && !m2.dead && Number.isFinite(cross1) && Math.abs(cross1) > 1e-3 && turnWas > 0,
    "cross=" + cross1 + " turn=" + turnWas);
  enc.reset(); // clear the missiles

  // ---- I. economy: a radarDart pays its parent's orbs plus one ----
  enc.reset();
  const parentOrb = enc.statsFor(1).dart.orbDrop;
  enc.spawnEnemy(Math.min(t.WW - 40, G.ship.x + 300), G.ship.y, 0, "radarDart");
  const corpse = enc.E.enemies[enc.E.enemies.length - 1];
  const orbsWas = enc.state().orbs;
  if (corpse) corpse.hp = 0;
  enc.advance(1);
  const orbDelta = enc.state().orbs - orbsWas;
  ok("a dead radarDart drops the parent's orbs plus one",
    !!corpse && orbDelta === parentOrb + 1 && orbDelta === 2,
    "delta=" + orbDelta + " parent=" + parentOrb);

  // ---- J. restore discipline: every touched baseline reads back as found ----
  G.vel.x = foundVel.x;
  G.vel.y = foundVel.y;
  ok("ECFG.radar reads back exactly as the page had it",
    ECFG.radar.leadScale === foundRadar.leadScale && ECFG.radar.deadband === foundRadar.deadband &&
    ECFG.radar.missileTurn === foundRadar.missileTurn,
    JSON.stringify(ECFG.radar) + " found=" + JSON.stringify(foundRadar));

  // ---- restore the page for a human ----
  enc.restart();
  t.render();

  return done();
};
