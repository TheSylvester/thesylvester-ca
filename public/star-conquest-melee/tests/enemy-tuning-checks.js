"use strict";

// Deterministic enemy-tuning checks — the Encounter.tuning schema the new
// enemies dev tab is generated from, its write-through into the ECFG
// baselines, the in-place refresh() that retunes a wave already on the field,
// and the generated tab itself. Load this file in the page (fetch + eval from
// the console, or a script tag), then call runEnemyTuningChecks(). The suite
// drives the fixed-step sim through window.__test only — no RAF, no real
// input — and every baseline, slider, tab and pause state it touches goes
// back exactly where it was found, so the wave-1 suite still passes at
// defaults in the same page load.
window.runEnemyTuningChecks = function () {
  const t = window.__test;
  const enc = t.enc;
  const ui = t.ui;
  const ECFG = enc.cfg; // the ECFG baseline object tuning.set() writes into
  const R = [];
  const ok = (name, cond, info) => R.push({ name, pass: !!cond, info: info === undefined ? "" : String(info) });
  const done = () => {
    const failed = R.filter((r) => !r.pass);
    return { total: R.length, passed: R.length - failed.length, failed, results: R };
  };
  const esc = () => document.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));

  // ---- A. the schema is exposed, on both doors ----
  const T = enc.tuning;
  ok("the tuning schema is exposed as Encounter.tuning and __test.enc.tuning",
    !!T && window.Encounter && window.Encounter.tuning === T &&
    Array.isArray(T.groups) && typeof T.refresh === "function",
    T ? "groups=" + (T.groups && T.groups.length) : "no schema");
  if (!T || !Array.isArray(T.groups) || typeof T.refresh !== "function") {
    ok("the remaining checks were skipped — no schema to drive", false, "bail");
    return done();
  }

  // every row, flattened, plus the discovery the later sections rely on: the
  // dart group by key, its rows by id, the telegraph row by id substring —
  // never by position, and never by a constant copied out of encounter.js
  const rows = [];
  for (const g of T.groups) for (const r of g.rows || []) rows.push(r);
  const dartGroup = T.groups.find((g) => g.key === "dart");
  const rowById = (id) => rows.find((r) => r.id === id);
  const dartHpRow = rowById("dart-hp");
  // the dart top-speed row: id intent first, live baseline value as the tiebreak
  const dartSpeedRow =
    (dartGroup && dartGroup.rows.find((r) => /^dart-/.test(r.id) && /speed/.test(r.id))) ||
    (dartGroup && dartGroup.rows.find((r) => r.get() === ECFG.enemy.maxSpeed));
  const telegraphRow = rows.find((r) => /telegraph/.test(r.id));
  // a legal target one honest notch away from wherever the page sits, so a
  // dead set() cannot pass on a page already tuned to the target
  const nudge = (r) => {
    const v = r.get();
    const step = r.step || 1;
    return v + step <= r.max ? v + step : v - step;
  };

  // the restore ledger: every baseline as found, compared again at the end —
  // the strongest form of the restore discipline the shared page load needs
  const foundBaselines = rows.map((r) => r.get());

  // ---- B. schema sanity: shape, unique ids, honest ranges, exact round-trips ----
  ok("the schema deals non-empty groups of non-empty rows",
    T.groups.length > 0 && T.groups.every((g) => g.key && g.label && Array.isArray(g.rows) && g.rows.length > 0) &&
    rows.length > 0,
    "groups=" + T.groups.length + " rows=" + rows.length);
  const idSeen = {};
  let idDup = "";
  for (const r of rows) {
    if (idSeen[r.id]) idDup += r.id + " ";
    idSeen[r.id] = 1;
  }
  ok("row ids are unique across every group", !idDup && rows.every((r) => typeof r.id === "string" && r.id),
    idDup || "n=" + rows.length);
  let rowErr = "";
  for (const r of rows) {
    const v = r.get();
    if (!Number.isFinite(v)) { rowErr += r.id + ":get=" + v + " "; continue; }
    if (!(r.min < r.max)) { rowErr += r.id + ":range " + r.min + ".." + r.max + " "; continue; }
    if (typeof r.set !== "function" || typeof r.fmt !== "function") { rowErr += r.id + ":api "; continue; }
    // set(get()) must round-trip to the IDENTICAL value — the anvil arc row
    // converts degrees to radians and back, and === is what keeps that
    // conversion from drifting the baseline one call at a time
    r.set(v);
    if (r.get() !== v) { rowErr += r.id + ":roundtrip " + v + "->" + r.get() + " "; continue; }
    const shown = r.fmt(v);
    if (typeof shown !== "string" || !shown.trim()) rowErr += r.id + ":fmt ";
  }
  ok("every row reads finite, spans min<max, formats, and set(get()) round-trips exactly",
    !rowErr, rowErr);
  ok("the dart group carries its hp and top-speed rows, and a telegraph row exists",
    !!dartGroup && !!dartHpRow && !!dartSpeedRow && !!telegraphRow,
    "dart=" + !!dartGroup + " hp=" + !!dartHpRow + " speed=" + (dartSpeedRow && dartSpeedRow.id) +
    " telegraph=" + (telegraphRow && telegraphRow.id));

  // ---- C. write-through: a set() lands in the live ECFG baseline ----
  if (dartHpRow) {
    const hpWas = dartHpRow.get();
    const hpTarget = nudge(dartHpRow);
    dartHpRow.set(hpTarget);
    const hpLanded = ECFG.enemy.hp;
    const hpRead = dartHpRow.get();
    dartHpRow.set(hpWas);
    ok("the dart hp row writes the live ECFG baseline and reads it back",
      hpTarget !== hpWas && hpLanded === hpTarget && hpRead === hpTarget && ECFG.enemy.hp === hpWas,
      "target=" + hpTarget + " cfg=" + hpLanded + " restored=" + ECFG.enemy.hp);
  } else {
    ok("the dart hp write-through was skipped — no dart-hp row", false, "no row");
  }

  // ---- D. refresh(): the field retunes in place, identity and hp intact ----
  // refresh() Object.assigns statsFor(E.wave) INTO the existing per-wave stats
  // objects — the same objects every live body carries — so a slider moved
  // mid-wave reaches the pack without respawning it, and without handing the
  // already-spawned bodies a new hp.
  if (dartSpeedRow) {
    // first: refresh on an idle field (E.stats is null) must be a quiet no-op
    enc.restart();
    let idleQuiet = true;
    let idleErr = "";
    try { T.refresh(); } catch (err) { idleQuiet = false; idleErr = String(err); }
    ok("refresh() is a no-op on an idle field instead of a throw", idleQuiet, idleErr);
    // then: a live wave-1 field, advanced the way the wave suite advances it
    enc.reset();
    enc.E.hull = 99; // observation, not survival — a lance must not end the leg
    enc.advance(1);
    for (let k = 0; k < 2000 && !(enc.state().state === "active" && enc.state().enemies > 0); k++) enc.advance(1);
    const live = enc.state();
    ok("wave 1 is active with bodies on the field for the refresh leg",
      live.state === "active" && live.enemies > 0 && live.wave === 1,
      "state=" + live.state + " enemies=" + live.enemies);
    const statsBag = enc.state().stats || enc.E.stats; // snapState hands out E.stats
    const refA = statsBag && statsBag.dart;
    const body = enc.E.enemies[0];
    const bodyStats = body && body.stats;
    const bodyHpWas = body && body.hp;
    const speedWas = dartSpeedRow.get();
    const oldResolved = refA && refA.maxSpeed;
    const speedTarget = nudge(dartSpeedRow);
    dartSpeedRow.set(speedTarget);
    // statsFor is pure over the live baselines, so the expectation is computed
    // rather than copied — whatever wave and multiplier the sim is really on
    const wantSpeed = enc.statsFor(enc.state().wave).dart.maxSpeed;
    T.refresh();
    const statsNow = (enc.state().stats || enc.E.stats).dart;
    ok("refresh() retunes the SAME stats object — identity holds through it",
      !!refA && statsNow === refA, "same=" + (statsNow === refA));
    ok("the new top speed reaches an already-spawned body through its own stats reference",
      !!bodyStats && bodyStats.maxSpeed === wantSpeed && refA.maxSpeed === wantSpeed &&
      wantSpeed !== oldResolved,
      "body=" + (bodyStats && bodyStats.maxSpeed) + " want=" + wantSpeed + " was=" + oldResolved);
    ok("a live body's hp field is never rewritten by a refresh",
      !!body && body.hp === bodyHpWas, "hp=" + (body && body.hp) + " was=" + bodyHpWas);
    // restore the baseline, retune the field back, and hand back a clean sim
    dartSpeedRow.set(speedWas);
    T.refresh();
    const statsBack = (enc.state().stats || enc.E.stats).dart;
    ok("restoring the baseline and refreshing puts the resolved speed back",
      statsBack === refA && statsBack.maxSpeed === oldResolved,
      "speed=" + statsBack.maxSpeed + " want=" + oldResolved);
    enc.restart();
  } else {
    ok("the refresh leg was skipped — no dart top-speed row found", false, "no row");
  }

  // ---- E. geometry liveness: the telegraph baseline moves with no refresh ----
  // stepEnemy reads ECFG.lance.telegraph on the tick it opens a pulse, so a
  // set() alone is live geometry — refresh() is for the per-wave stats only.
  if (telegraphRow) {
    const tgWas = telegraphRow.get();
    const tgTarget = nudge(telegraphRow);
    const tgCfgWas = ECFG.lance.telegraph;
    telegraphRow.set(tgTarget);
    const tgLanded = ECFG.lance.telegraph;
    telegraphRow.set(tgWas);
    ok("the lance telegraph row moves the live cfg with no refresh needed",
      tgTarget !== tgWas && tgLanded !== tgCfgWas && ECFG.lance.telegraph === tgCfgWas,
      "target=" + tgTarget + " cfg=" + tgLanded + " restored=" + ECFG.lance.telegraph);
  } else {
    ok("the telegraph liveness leg was skipped — no telegraph row found", false, "no row");
  }

  // ---- F. the generated enemies tab: one slider and one readout per row ----
  // Opened the way the pause-UI suite opens the panel: mouse mode so escape
  // pauses directly, then the ui helpers — and every piece of pause/tab/panel
  // state is put back exactly as found on the way out.
  const priorAim = t.aimState().AIMMODE;
  const priorRunning = t.G.running;
  t.setAimMode("mouse");
  if (t.G.running) esc();
  const priorTab = ui.UI.tab;
  const priorDev = ui.UI.dev;
  ui.openDev();
  ui.setDevTab("enemies");
  const domView = ui.view();
  const enemiesShown = domView.sections.filter((s) => s.shown);
  ok("the enemies tab is registered and shows only its own section",
    ui.UI.tab === "enemies" && enemiesShown.length === 1 && enemiesShown[0].tab === "enemies",
    "tab=" + ui.UI.tab + " shown=" + enemiesShown.map((s) => s.tab).join("+"));
  const bodyEl = document.getElementById("enemies-body");
  const genInputs = bodyEl ? [...bodyEl.querySelectorAll('input[id^="enemy-"]')] : [];
  ok("the lazily built tab holds exactly one generated slider per schema row",
    !!bodyEl && genInputs.length === rows.length,
    "inputs=" + genInputs.length + " rows=" + rows.length + (bodyEl ? "" : " no #enemies-body"));
  // the readout beside each slider: found by the id convention first, then by
  // the output-for wiring, then by proximity — the schema is the contract, the
  // exact markup is the generator's own business
  const readoutFor = (input, id) => {
    const byId = document.getElementById("enemy-" + id + "-out");
    if (byId) return byId;
    const byFor = bodyEl && bodyEl.querySelector('output[for="enemy-' + id + '"]');
    if (byFor) return byFor;
    let n = input;
    for (let k = 0; k < 3 && n && n !== bodyEl; k++) {
      const out = n.querySelector && n.querySelector("output");
      if (out) return out;
      n = n.parentElement;
    }
    return null;
  };
  let domErr = "";
  for (const r of rows) {
    const el = document.getElementById("enemy-" + r.id);
    if (!el) { domErr += r.id + ":missing "; continue; }
    if (!bodyEl || !bodyEl.contains(el)) { domErr += r.id + ":outside "; continue; }
    const out = readoutFor(el, r.id);
    if (!out || !out.textContent.trim()) domErr += r.id + ":readout ";
  }
  ok("every schema row's slider exists as enemy-<id> with a non-empty readout", !domErr, domErr);
  // the found pause/tab state goes back exactly
  ui.setDevTab(priorTab);
  if (!priorDev) ui.closeDev();
  t.setAimMode(priorAim);
  if (priorRunning && !t.G.running) ui.resume();
  ok("the panel, tab and loop are back where the page had them",
    ui.UI.tab === priorTab && ui.UI.dev === priorDev && t.G.running === priorRunning &&
    t.aimState().AIMMODE === priorAim,
    "tab=" + ui.UI.tab + " dev=" + ui.UI.dev + " running=" + t.G.running);

  // ---- G. restore discipline: every baseline is byte-identical to found ----
  let restErr = "";
  rows.forEach((r, i) => { if (r.get() !== foundBaselines[i]) restErr += r.id + ":" + foundBaselines[i] + "->" + r.get() + " "; });
  ok("every touched baseline reads back exactly as the page had it", !restErr, restErr);

  // ---- restore the page for a human ----
  enc.restart();
  t.render();

  return done();
};
