"use strict";

// Deterministic pause-UI checks — the paused screens, the Dev Options tabs and
// the control-id contract the split had to preserve. Load this file in the
// page (fetch + eval from the console, or a script tag), then call
// runPauseUiChecks(). The suite drives the real DOM through window.__test.ui
// plus synthetic clicks and keydowns; every resume it starts is paused again
// before the stack yields, so the loop it arms never gets a frame and the sim
// never advances. It runs in mouse mode with the encounter reset,
// so escape pauses directly and resume() takes the normal branch; a synthetic
// click carries no user activation, so nothing asks for a pointer lock. On
// return the suite restores the aim mode, the dev tab, the paused state and
// G.started, puts every control it drove back where it found it, and resets
// the encounter; like the wave suite it leaves G.mouse wherever its one
// synthetic field click put it.
window.runPauseUiChecks = async function () {
  const t = window.__test;
  const ui = t.ui;
  const enc = t.enc;
  const R = [];
  const ok = (name, cond, info) => R.push({ name, pass: !!cond, info: info === undefined ? "" : String(info) });
  const priorAim = t.aimState().AIMMODE;
  const priorTab = ui.UI.tab;
  const priorStarted = t.G.started;
  const canvasEl = document.getElementById("field");
  const esc = () => document.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
  const clickField = () => canvasEl.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: 40, clientY: 40, bubbles: true }));

  // the tab membership the split is contracted to: every id, in its tab, in
  // the order the markup lays it out
  const TABS = {
    flight: ["vmax", "accel", "turn", "keythrust", "wallloss", "inputmode", "inputlag"],
    aim: ["aimmode", "aimdist", "invert"], // push sens left with push mode's menu option
    weapons: ["cool", "autofire", "bspeed", "bfactor", "bmax", "blife", "bounce", "fxint", "fxdur", "blastr", "blastgain"],
    camera: ["cammode", "camease", "cambox", "camlead", "leadsrc", "aimlead", "leadblend", "leaddz", "edgemargin"],
    world: ["stardens", "reseed", "minimap", "edgearrows"],
    combat: ["contactcd",
             "pvp-rewind"], // phase 15's player-target rewind cap, in ms — a
                            // COMBAT pacing knob, not a comet one. Net-locked
                            // like every sim-affecting row: the server's value
                            // moves only via the dev ui:"tune" route
    comet: ["comet-acc", "comet-turn", "comet-vmax", "comet-dmg",
            "comet-drain", "comet-hit", "comet-thr", "comet-aoe", "comet-aoedmg", "comet-fury",
            "comet-cd", // the comet's OWN contact pacing — deliberately not the combat
                        // tab's contactcd, which paces a normal ram alone
            "pvp-orbs"], // the phase-14 PvP bounty. It sits on the COMET tab because the
                         // comet ram is what most often collects it, and because a PvP
                         // knob does not deserve a tab of its own yet — the morning may
                         // move it. Net-locked like every sim-affecting row here
    // the ENERGY pool's own tab: the pool is a general resource, so its numbers
    // sit apart from the comet's — the comet tab prices a consumer, this one
    // describes what every consumer spends from
    energy: ["energy-max", "energy-regen", "energy-delay", "energy-arm",
             "energy-orb", "energy-cell", "energy-rech"],
    audio: ["sfxvol", "sfxmute", "sfxshot", "sfxfoe", "sfxui", "sfxeng", "sfxtest"],
    // generated at first open from Encounter.tuning, so no ids can be listed
    // here: empty until the tab is opened, enemy-<row.id> sliders after
    enemies: [],
  };
  const ALL = [].concat(...Object.values(TABS));
  // the five id-less outputs showTuner() must never overwrite, and their prose
  const STATIC = {
    autofire: "hold left fires at the cooldown rate",
    bounce: "bullets bounce off walls; off = die there",
    reseed: "deal a new sky",
    minimap: "world map, top right",
    edgearrows: "edge arrows point to off-screen foes",
  };

  t.setAimMode("mouse"); // escape pauses directly in mouse mode
  enc.restart(); // no frozen overlay — resume() must take the normal branch
  if (t.G.running) esc();
  ui.closeDev();

  // ---- A. the paused root screen ----
  let v = ui.view();
  ok("precondition: the loop sits stopped", v.running === false);
  ok("paused opens on the pause menu, with the dev panel closed", v.menu && !v.panel && !v.dev);
  document.getElementById("devbtn").click();
  v = ui.view();
  ok("the dev options button opens the panel and hides the menu", v.panel && !v.menu && v.dev === true);
  document.getElementById("devback").click();
  v = ui.view();
  ok("back returns to the pause menu", v.menu && !v.panel && v.dev === false);
  ui.openDev();
  esc();
  v = ui.view();
  ok("escape backs out of the panel to the pause menu", v.menu && !v.panel && v.running === false);
  esc();
  ok("escape on the pause menu changes nothing", ui.view().menu && ui.view().running === false);

  // ---- B. the field click while the panel is open ----
  ui.openDev();
  clickField();
  v = ui.view();
  ok("a field click while the panel is open closes it instead of resuming",
    v.menu && !v.panel && v.running === false, "running=" + v.running);
  ok("the closed panel keeps the tab it was left on", v.tab === priorTab, "tab=" + v.tab);

  // ---- C. the tabs: membership, one at a time, one marked button ----
  ui.openDev();
  let membership = "";
  for (const tab of Object.keys(TABS)) {
    const sec = document.querySelector('#devpanel .tabsec[data-tab="' + tab + '"]');
    if (!sec) { membership += tab + ":missing "; continue; }
    const ids = [...sec.querySelectorAll("input, select, button")].map((c) => c.id);
    const got = ids.join(" ");
    // the enemies tab's controls are generated on first open — the membership
    // rule relaxes to the id contract itself: absent, or all enemy-<row.id>
    if (tab === "enemies") { if (!ids.every((id) => /^enemy-./.test(id))) membership += tab + ":[" + got + "] "; }
    else if (got !== TABS[tab].join(" ")) membership += tab + ":[" + got + "] ";
  }
  ok("every tab section holds exactly its own controls, in order", !membership, membership);
  let single = "";
  for (const tab of Object.keys(TABS)) {
    ui.setDevTab(tab);
    const shown = ui.view().sections.filter((s) => s.shown);
    if (shown.length !== 1 || shown[0].tab !== tab) single += tab + ":" + shown.map((s) => s.tab).join("+") + " ";
  }
  ok("exactly one section is visible, and it is the selected one", !single, single);
  ui.setDevTab("camera");
  const marked = [...document.querySelectorAll("#devpanel .tab")].filter((b) => b.getAttribute("aria-pressed") === "true");
  ok("exactly one tab button is marked active", marked.length === 1 && marked[0].dataset.tab === "camera",
    "marked=" + marked.map((b) => b.dataset.tab).join("+"));
  ok("the tab strip is built from real buttons",
    [...document.querySelectorAll("#devpanel .tab")].every((b) => b.tagName === "BUTTON" && b.type === "button"));
  // the coverage the audio tab's arrival demanded: a tab wired into the strip
  // but missing its section (or vice versa, or absent from this contract)
  // used to ship green, because every check above starts FROM the TABS map —
  // this one starts from the page and makes the three lists name each other
  const stripTabs = [...document.querySelectorAll("#devpanel .tab")].map((b) => b.dataset.tab);
  const secTabs = [...document.querySelectorAll("#devpanel .tabsec")].map((s) => s.dataset.tab);
  ok("the tab strip, the sections and the TABS contract name the same tabs",
    stripTabs.join(" ") === Object.keys(TABS).join(" ") && secTabs.join(" ") === Object.keys(TABS).join(" "),
    "strip=[" + stripTabs.join(" ") + "] secs=[" + secTabs.join(" ") + "]");
  ui.setDevTab("no-such-tab");
  ok("an unknown tab name is ignored", ui.UI.tab === "camera", "tab=" + ui.UI.tab);

  // ---- D. the control-id contract the move had to preserve ----
  ok("the 27 split controls plus 2 fx, 2 blast, 2 combat, 11 comet, 1 pvp, 7 energy, 1 world, 7 audio and 2 input-path controls are all present", ALL.length === 62, "n=" + ALL.length);
  let idErr = "";
  for (const id of ALL) {
    const n = document.querySelectorAll("#" + id).length;
    if (n !== 1) idErr += id + "×" + n + " ";
  }
  ok("every control id resolves exactly once", !idErr, idErr);
  let outErr = "";
  for (const id of ALL) {
    const live = !!document.getElementById(id + "-out");
    if (live === (STATIC[id] !== undefined)) outErr += id + " ";
  }
  ok("55 controls carry a live readout and 5 carry none", !outErr, outErr);
  let proseErr = "";
  for (const id of Object.keys(STATIC)) {
    const o = document.querySelector('#devpanel output[for="' + id + '"]');
    if (!o || o.id || o.textContent.trim() !== STATIC[id]) proseErr += id + " ";
  }
  ok("the five id-less outputs keep their static prose", !proseErr, proseErr);

  // every control still drives its tunable through bind(): one of each widget
  // type, each put back the way it was found
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
  // every target is chosen away from the live value, so a page already tuned
  // to it cannot let a dead binding pass
  const priorEdge = t.camState().EDGEMARGIN;
  const priorSrc = t.camState().LEADSRC;
  const priorAuto = enc.tunables().AUTOFIRE;
  const priorLead = t.camState().CAMLEAD;
  const edgeTarget = priorEdge === 85 ? 90 : 85;
  const srcTarget = priorSrc === "add" ? "vel" : "add";
  const undoEdge = drive("edgemargin", edgeTarget);
  ok("a slider still drives its tunable", t.camState().EDGEMARGIN === edgeTarget, "EDGEMARGIN=" + t.camState().EDGEMARGIN);
  undoEdge();
  const undoSrc = drive("leadsrc", srcTarget);
  ok("a select still drives its tunable", t.camState().LEADSRC === srcTarget, "LEADSRC=" + t.camState().LEADSRC);
  undoSrc();
  const undoAuto = drive("autofire", !priorAuto);
  ok("a checkbox still drives its tunable", enc.tunables().AUTOFIRE === !priorAuto, "AUTOFIRE=" + enc.tunables().AUTOFIRE);
  undoAuto();
  ok("the drives put every tunable back",
    t.camState().EDGEMARGIN === priorEdge && t.camState().LEADSRC === priorSrc && enc.tunables().AUTOFIRE === priorAuto);
  // the readouts still resolve, with showTuner()'s strings untouched — a lost
  // -out id would throw inside the input handler and leave the text stale
  const undoLead = drive("camlead", priorLead === 33 ? 34 : 33);
  ok("driving a control refreshes its readout", document.getElementById("camlead-out").textContent === (priorLead === 33 ? 34 : 33) + " ticks of lead",
    document.getElementById("camlead-out").textContent);
  undoLead();
  // the two impact-fx sliders, same contract: the bind() writes the tunable
  // and the showTuner() line keeps the readout honest
  const priorInt = t.fxState().FXINT;
  const priorDur = t.fxState().FXDUR;
  const intTarget = priorInt === 0.5 ? 0.7 : 0.5;
  const durTarget = priorDur === 0.55 ? 0.6 : 0.55;
  const undoInt = drive("fxint", intTarget);
  ok("the fx intensity slider drives its tunable", t.fxState().FXINT === intTarget, "FXINT=" + t.fxState().FXINT);
  undoInt();
  const undoDur = drive("fxdur", durTarget);
  ok("the fx duration slider drives its tunable and refreshes its readout",
    t.fxState().FXDUR === durTarget &&
    document.getElementById("fxdur-out").textContent === durTarget.toFixed(2) + " s burst life",
    "FXDUR=" + t.fxState().FXDUR + " out=" + document.getElementById("fxdur-out").textContent);
  undoDur();
  // the edge-arrow toggle: the world tab's second checkbox, driven away from
  // wherever the page sits so a dead binding cannot pass
  const priorArr = t.edgeArrowsOn();
  const undoArr = drive("edgearrows", !priorArr);
  const arrDriven = t.edgeArrowsOn();
  undoArr();
  ok("the edge-arrows checkbox drives its flag",
    arrDriven === !priorArr && t.edgeArrowsOn() === priorArr,
    "driven=" + arrDriven + " restored=" + t.edgeArrowsOn());
  // the init line, not the default: a human-toggled page must still agree
  ok("the edge-arrows checkbox and its flag agree",
    document.getElementById("edgearrows").checked === t.edgeArrowsOn(),
    "checked=" + document.getElementById("edgearrows").checked + " flag=" + t.edgeArrowsOn());

  // ---- E. resume: both screens go away, the loop runs ----
  // a focused slider is the reason resume() blurs at all — arrow keys would
  // drag it mid-flight — so hand it the focus before asking
  document.getElementById("camlead").focus();
  const heldFocus = document.activeElement === document.getElementById("camlead");
  ui.resume();
  v = ui.view();
  ok("resume() hides both screens and starts the loop", v.running === true && !v.menu && !v.panel && !v.dev);
  ok("resume() blurs a control it left focused", heldFocus &&
    !document.getElementById("pausemenu").contains(document.activeElement) &&
    !document.getElementById("devpanel").contains(document.activeElement),
    heldFocus ? "" : "the panel never took focus — check is inconclusive");
  ok("resume() while running is a no-op", (ui.resume(), ui.view().running === true));
  esc();
  ok("escape pauses back onto the pause menu", ui.view().menu && ui.view().running === false);
  ui.openDev();
  ui.resume();
  ok("resume() from the dev panel closes it too", ui.view().running === true && ui.UI.dev === false);
  esc();
  document.getElementById("resumebtn").click();
  ok("the resume button walks the same path as a field click", ui.view().running === true);
  esc();
  clickField();
  ok("a field click with the panel closed still resumes", ui.view().running === true);
  esc();
  ok("pausing lands on the pause menu, never inside dev options",
    ui.view().menu && !ui.view().panel && ui.UI.dev === false);

  // ---- F. the combat tab and its contact-cooldown slider ----
  if (t.G.running) esc();
  ui.openDev();
  ui.setDevTab("combat");
  const combatShown = ui.view().sections.filter((sec) => sec.shown);
  ok("the combat tab is registered and shows only itself",
    ui.UI.tab === "combat" && combatShown.length === 1 && combatShown[0].tab === "combat",
    "tab=" + ui.UI.tab + " shown=" + combatShown.map((sec) => sec.tab).join("+"));
  const cdEl = document.getElementById("contactcd");
  const priorCd = enc.tunables().CONTACTCD;
  ok("the contact-cooldown slider reflects the live default",
    Number(cdEl.value) === priorCd, "value=" + cdEl.value + " CONTACTCD=" + priorCd);
  // driven away from wherever the page sits, so a dead binding cannot pass;
  // the readout string is rebuilt from the live TICK, never copied
  const cdTarget = priorCd === 70 ? 75 : 70;
  const tickMs = enc.tunables().TICK;
  const undoCd = drive("contactcd", cdTarget);
  const cdDriven = enc.tunables().CONTACTCD;
  const cdOut = document.getElementById("contactcd-out").textContent;
  undoCd();
  ok("the contact-cooldown slider drives its tunable and refreshes its readout",
    cdDriven === cdTarget && enc.tunables().CONTACTCD === priorCd &&
    cdOut === cdTarget + " ticks · " + ((cdTarget * tickMs) / 1000).toFixed(2) + " s between contact hits on one body",
    "CONTACTCD=" + cdDriven + " restored=" + enc.tunables().CONTACTCD + " out=" + cdOut);

  // ---- G. the moved feel defaults are representable on their own sliders ----
  // A tunable that falls outside its slider's range is clamped by the DOM the
  // moment bind() writes it: the control and the code disagree from the first
  // frame and the readout states a speed the ship never flies. The two knobs
  // the feel pass moved are read back through the same DOM a human drags, and
  // every expectation comes from the LIVE tunable, so a retuned page cannot
  // fake a pass.
  const tun = enc.tunables();
  const repr = (id, live) => {
    const c = document.getElementById(id);
    return { live, shown: Number(c.value), min: Number(c.min), max: Number(c.max),
      ok: Number(c.value) === live && live >= Number(c.min) && live <= Number(c.max) };
  };
  const rVmax = repr("vmax", tun.VMAX);
  ok("the max-speed slider spans and shows the live top speed", rVmax.ok, JSON.stringify(rVmax));
  const rCool = repr("cool", tun.BCOOL);
  ok("the cooldown slider spans and shows the live fire gate", rCool.ok, JSON.stringify(rCool));
  // and showTuner() states those same live numbers, in both of each line's units
  const vmaxWant = tun.VMAX.toFixed(1) + " px/tick · " + Math.round((1000 / tun.TICK) * tun.VMAX) + " px/s";
  const coolWant = tun.BCOOL + " ms · " + (1000 / tun.BCOOL).toFixed(1) + " shots/s";
  ok("both readouts restate the live values in both units",
    document.getElementById("vmax-out").textContent === vmaxWant &&
    document.getElementById("cool-out").textContent === coolWant,
    "vmax=[" + document.getElementById("vmax-out").textContent + "] want=[" + vmaxWant + "]" +
    " cool=[" + document.getElementById("cool-out").textContent + "] want=[" + coolWant + "]");

  // ---- H. the first-run controls card and the ready / start menu ----
  // The card is the onboarding screen of a session that has never started: it
  // owns the idle field until the first resume and never comes back. Every leg
  // drives the real page — the real menu words, the real gate, the real click
  // path — and the pixel leg is two-sided, so a page whose PNG is still in
  // flight (or missing altogether) still earns a verdict instead of a skip.
  if (t.G.running) esc();
  ui.closeDev();
  enc.restart(); // idle: no HUD over the corner, no bullets, the ship centred
  t.G.started = false;
  ui.syncMenu();
  // the card's own control scheme is the precondition, not the expectation:
  // mouse mode came from the suite's preamble, and invert right is forced here
  // through the DOM (so the flag and the box stay in step) however a human left
  // it. The restore tail puts it back.
  const invEl = document.getElementById("invert");
  const invWas = invEl.checked;
  const setInv = (v) => { invEl.checked = v; invEl.dispatchEvent(new Event("input", { bubbles: true })); };
  setInv(true);
  t.render();
  const titleEl = document.querySelector("#pausemenu .menutitle");
  const startEl = document.getElementById("resumebtn");
  ok("the first-run menu reads ready / start",
    titleEl.textContent === "ready" && startEl.textContent === "start",
    "title=" + titleEl.textContent + " button=" + startEl.textContent);
  const g0 = t.guideState();
  ok("the card is eligible on the first-run default screen",
    g0.eligible === true, JSON.stringify(g0));
  // the rect the UI pass draws: the asset's own 3:1, centred, wholly on field
  ok("the card keeps the asset's 3:1 ratio inside the field",
    g0.w === 3 * g0.h && g0.x === (t.FW - g0.w) / 2 && g0.x > 0 && g0.y > 0 && g0.y + g0.h < t.FH,
    JSON.stringify({ x: g0.x, y: g0.y, w: g0.w, h: g0.h, FW: t.FW, FH: t.FH }));
  // dev options stays reachable from the menu, and owns the screen while open
  document.getElementById("devbtn").click();
  const devFirst = ui.view();
  ok("dev options is reachable before the first start, and the card yields to it",
    devFirst.panel && !devFirst.menu && t.guideState().eligible === false,
    "panel=" + devFirst.panel + " eligible=" + t.guideState().eligible);
  document.getElementById("devback").click();
  ok("backing out of the panel hands the card its screen back",
    ui.view().menu && t.guideState().eligible === true);
  // accuracy gates: the art draws mouse-mode roles with invert on, so either
  // control change retires it rather than teaching a contract the page is not in
  t.setAimMode("push");
  const pushElig = t.guideState().eligible;
  // The foil for the stand-in copy below: push mode still has its own wording.
  // Key thrust ships stock now (the flag defaults true), so the staging is
  // belt-and-braces against a page a human re-locked by hand.
  const ringWas = enc.mods.keyThrust;
  enc.mods.keyThrust = true;
  const pushLines = t.pauseLines();
  enc.mods.keyThrust = ringWas;
  t.setAimMode("mouse");
  ok("push mode retires the card instead of teaching the wrong controls",
    pushElig === false && t.guideState().eligible === true, "push=" + pushElig);
  // ...and the SHIPPED default earns the card rather than losing it: locked
  // mode's roles are the card's roles — cursor aim, stock key flight, left
  // fire and right-hold comet — and only the cursor's provenance differs,
  // which the art never names. Its in-session copy is read with the session
  // flag up, because the card screen's own stand-in owns the idle one.
  t.setAimMode("locked");
  const lockedElig = t.guideState().eligible;
  t.G.started = true;
  const lockedLines = t.pauseLines();
  t.G.started = false;
  t.setAimMode("mouse");
  ok("locked mode keeps the card, and its copy states the roles instead of the lock",
    lockedElig === true && lockedLines.length === 2 &&
    lockedLines.every((l) => !/pointer lock|per session/i.test(l)) &&
    /cursor/i.test(lockedLines[0]) && /fly|flies/i.test(lockedLines[1]),
    "eligible=" + lockedElig + " " + JSON.stringify(lockedLines));
  // The text stand-in: what the card's own screen prints before the bitmap
  // arrives, or if it never does. It has to teach the SAME contract the art
  // does — including stock key flight and energy-powered comet mode — while
  // every other screen keeps the copy that describes the mode it is in.
  const cardLines = t.pauseLines();
  const cardAria = canvasEl.getAttribute("aria-label");
  ok("the first-run stand-in and accessible copy teach the new card contract",
    cardLines.length === 2 &&
    /cursor/i.test(cardLines[0]) && /fire/i.test(cardLines[0]) &&
    /wsad/i.test(cardLines[0]) && /qezc/i.test(cardLines[0]) &&
    /right/i.test(cardLines[1]) && /comet/i.test(cardLines[1]) &&
    /energy/i.test(cardLines[1]) && /invulnerable/i.test(cardLines[1]) && /ram/i.test(cardLines[1]) &&
    /W A S D/i.test(cardAria) && /Q E Z C/i.test(cardAria) &&
    /comet/i.test(cardAria) && /energy/i.test(cardAria) && /invulnerable/i.test(cardAria) && /ram/i.test(cardAria) &&
    pushLines.some((l) => /qwe/i.test(l)),
    JSON.stringify(cardLines) + " aria=" + cardAria + " push=" + JSON.stringify(pushLines));
  setInv(false);
  const invOff = t.guideState().eligible;
  setInv(true); // back on for the rest of the section — the contract the card draws
  const invOn = t.guideState().eligible;
  ok("clearing invert right retires the card too", invOff === false && invOn === true,
    "off=" + invOff + " on=" + invOn);
  // The corner map yields the first-run screen exactly while the card is on
  // it. The probe sits on the map frame's own top-left corner — above the
  // card's top edge, so it reads the map and never the art — and the two
  // reference renders make both directions real ink rather than an assumption.
  const mmInfo = t.minimapInfo();
  const mmWas = mmInfo.on;
  const pad = document.createElement("canvas"); // a 4×4 readback off a scratch surface
  pad.width = pad.height = 4;
  const padCtx = pad.getContext("2d", { willReadFrequently: true });
  const probe = (fx, fy) => {
    const p = t.fieldToCanvas(fx, fy);
    padCtx.clearRect(0, 0, 4, 4);
    padCtx.drawImage(canvasEl, Math.round(p.x) - 2, Math.round(p.y) - 2, 4, 4, 0, 0, 4, 4);
    return JSON.stringify(Array.from(padCtx.getImageData(0, 0, 4, 4).data));
  };
  const cornerX = t.FW - mmInfo.W - mmInfo.M + 0.5;
  const cornerY = mmInfo.M + 0.5;
  t.setMinimap(true);
  t.render();
  const cardCorner = probe(cornerX, cornerY);
  const cardShown = t.guideState().shown;
  t.G.started = true; // the ordinary in-session screen — same camera, same corner
  t.render();
  const mapInk = probe(cornerX, cornerY);
  t.setMinimap(false);
  t.render();
  const mapGone = probe(cornerX, cornerY);
  t.setMinimap(mmWas);
  ok("the corner map is suppressed exactly while the card is on the screen",
    mapInk !== mapGone && cardCorner === (cardShown ? mapGone : mapInk),
    "probeOnInk=" + (mapInk !== mapGone) + " cardShown=" + cardShown +
    " suppressed=" + (cardCorner === mapGone));
  // The art itself, probed inside the card's own band — the corner leg above
  // sits above the card's top edge on purpose, so it says nothing about what
  // replaced the map. The same point is read twice on the same screen: once
  // with the bitmap, once with the load flag driven back to where a
  // cold-cache player finds it. Ink that stops being painted has nowhere to
  // hide, and the pending render is the only honest way to reach the async
  // gate, since the bytes have long arrived by the time a check runs.
  t.G.started = false;
  ui.syncMenu();
  t.setMinimap(true);
  t.render();
  const bandX = t.FW / 2;
  const bandY = g0.y + 20; // inside the art, well above the stand-in copy
  const cardInk = probe(bandX, bandY);
  const readyWas = t.setGuideReady(false);
  t.render();
  const pending = t.guideState();
  const pendingInk = probe(bandX, bandY);
  const pendingMap = probe(cornerX, cornerY);
  t.setGuideReady(readyWas);
  t.render();
  const backInk = probe(bandX, bandY);
  t.setMinimap(mmWas);
  ok("the card's own band paints the bitmap, and paints it again once the flag returns",
    readyWas === true && cardInk !== pendingInk && backInk === cardInk,
    "loaded=" + readyWas + " drewInk=" + (cardInk !== pendingInk) +
    " repaint=" + (backInk === cardInk) + " at=" + bandX + "," + bandY);
  ok("an image that has not arrived is not shown, and the text screen stands in",
    pending.eligible === true && pending.ready === false && pending.shown === false &&
    pendingMap === mapInk,
    JSON.stringify(pending) + " mapBack=" + (pendingMap === mapInk));
  // the start click: it turns the session on and is consumed there — no shot,
  // and no held trigger for the next tick's autofire to pick up
  t.G.started = false;
  ui.syncMenu();
  enc.restart();
  const bulletsBefore = t.G.bullets.length;
  const startedBefore = t.G.started;
  clickField();
  const firstClick = { running: t.G.running, started: t.G.started,
    bullets: t.G.bullets.length, left: t.G.leftHeld };
  esc();
  ok("the first field click starts the session and fires nothing",
    startedBefore === false && firstClick.running === true && firstClick.started === true &&
    firstClick.bullets === bulletsBefore && firstClick.left === false,
    JSON.stringify(firstClick) + " before=" + bulletsBefore);
  ok("the started menu goes back to paused / resume",
    titleEl.textContent === "paused" && startEl.textContent === "resume",
    "title=" + titleEl.textContent + " button=" + startEl.textContent);
  const afterPause = ui.view();
  ok("a later pause is the ordinary paused screen, never the card again",
    afterPause.menu && !afterPause.panel && t.guideState().eligible === false,
    "menu=" + afterPause.menu + " eligible=" + t.guideState().eligible);
  ui.openDev();
  const afterDev = ui.view();
  ui.closeDev();
  ok("the card never replaces the dev panel once play has begun",
    afterDev.panel && !afterDev.menu && t.guideState().shown === false);

  // ---- I. net client regressions ------------------------------------------
  // The normal page intentionally has no ?server= URL. Load the focused
  // helper here; it temporarily activates the real net script with a fake
  // socket, then restores this local page before the pause suite cleans up.
  try {
    const netChecks = await fetch("tests/net-checks.js?t=" + Date.now()).then((res) => res.text());
    (0, eval)(netChecks);
    const netResult = await window.runNetChecks();
    for (const result of netResult.results) {
      ok("net: " + result.name, result.pass, result.info);
    }
  } catch (error) {
    ok("net: focused regression suite completes", false, error && (error.stack || error.message || error));
  }

  // ---- restore the page for a human ----
  if (t.G.running) esc();
  ui.closeDev();
  ui.setDevTab(priorTab);
  t.setAimMode(priorAim);
  setInv(invWas); // the one control section H left off its found value
  t.G.leftHeld = false;
  t.G.started = priorStarted; // any resume flips this permanently — put the headline back
  ui.syncMenu();              // ...and the menu wording that hangs off it
  enc.restart();
  t.render();

  const failed = R.filter((r) => !r.pass);
  return { total: R.length, passed: R.length - failed.length, failed, results: R };
};
