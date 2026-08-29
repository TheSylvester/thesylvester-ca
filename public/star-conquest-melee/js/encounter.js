"use strict";

// Encounter module — endless progressive waves. Five original archetypes,
// each one a different axis of pressure, and each debuting alone on its own
// wave so its behavior is legible before it is multiplied: weak grouped
// DARTS that approach, hold a preferred ring without ramming, face the
// player, telegraph a short pulse-lance, fire it, and cool down; from wave 2
// the HARRIER, a standoff hull that kites at 300 px and lobs seeking
// missiles — RANGE, the first threat that reaches across the screen; from
// wave 3 lone CHARGERS that plant, lock a lunge line, and ram; from wave 4
// the HUSK, a slow bomb with no attack whose whole threat is the three fast
// SHARDS it bursts into — DEATH TIME, the first body whose kill is a
// decision; and from wave 5 the ANVIL, a wedge whose ±70° frontal shield
// eats bullets — FACING, the first body you cannot kill from where you
// stand. Every one of them is telegraphed and every one is answered by
// MOVING rather than by out-damaging, and the wave generator interleaves
// them on a fixed rotation, because difficulty here is meant to come from
// composition rather than from any single body.
// Each wave reseeds its own RNG stream and deals its schedule and stats
// from pure functions of the wave number (waveGroups/countsFor/statsFor),
// so a wave replays identically no matter how the previous one was played.
// Deaths drop XP orbs (one per dart, two per charger, three per anvil, and
// four for a husk once its three shards are cleaned up) into an UNCAPPED
// per-seat wallet; after every wave clear the banner holds while the field's
// orbs sweep to the ships, then the next wave deals itself — the world never
// freezes. The SHOP is a persistent, MOUSE-ONLY single-column panel in the
// left screen gutter (game.js owns the gutter; this file owns every rect in
// the panel's fixed logical space): a click on a card buys it whenever the
// wallet can pay, mid-flight included. A downed seat waits out a respawn
// timer and re-enters with brief invulnerability, and DYING COSTS THE WHOLE
// RUN: the unspent wallet, the score, the ranks and the bought hull cap all
// go, and the run is paid back out as PVPORBS orbs on the floor where the
// seat fell. THIS REVERSES THE OLD CHARTER, which is why it is spelled out
// here: until now a score survived a PvE death, a restart and every
// purchase, and exactly one thing took it — being killed by another PLAYER.
// That asymmetry made dying to a player the only real defeat and dying to
// the waves free, and the user overrode it. There is no PvE/PvP distinction
// left in the toll; deathToll is the single cost of dying, whatever killed
// you. What SURVIVES a death is `best`, the seat's high-water score: the
// leaderboard ranks and crowns by it, so the board reads a match's PEAK
// rather than a live counter every death sends back to zero. A restart
// clears best with the rest of the run. All tuning here is a local starting
// point for this experiment, not a claim of Nova Drift-exact behavior.
//
// Classic scripts share one global lexical environment, so this file
// reads game.js state (G, cam, ctx, C, FONT, FW/FH/WW/WH, SHIP_R, clientStep,
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
    // ---- THE NINE ARCHETYPE BLOCKS ARE RETIRED (S3b lane 3, commit D4) ----
    // `enemy`, `lance`, `charger`, `harrier`, `missile`, `radar`, `anvil`,
    // `husk` and `shard` — 186 lines of tuning for the seven-type roster D9
    // REPLACED. The successor plane's twenty-one types carry their own STATS
    // table in js/demo-kernel.js and none of these numbers reaches it.
    //
    // WHAT STAYS BELOW IS THE PLAYER'S HALF: the seat's hull and its clocks,
    // the aggro windows, the seat spacing, the ram's cost, the orb magnet and
    // the inter-wave break. Every one of them is production's own and survives
    // the roster it was tuned beside.
    player: { hull: 3, invuln: 62, // ≈ one second of post-hit grace
              respawn: 600,        // ticks a downed seat waits before it re-enters — 10 s
              claim: 1800,         // ...and then how long it may sit waiting for the CLICK
                                   // that deals it back — 30 s. The timer alone used to
                                   // re-deal the seat forever, which is why an abandoned
                                   // tab kept a ship dying and respawning in the room; at
                                   // the end of this window the seat leaves the field
                                   // instead. Long on purpose: it is an ABSENCE test, not
                                   // a reflex test, and a player reading the board or
                                   // walking to the kitchen must not lose the seat
              stock: 3 },          // the quarter rule's life stock — consumed ONLY while
                                   // lobby waiters exist (E.lobbyWaiters, the phase-09
                                   // hook); with no one waiting, deaths never deplete it
    // Multi-seat aggro pacing, in ticks. `commit` is the window an enemy
    // stays on a freshly chosen target — the middle of the settled 1-2 s
    // band, so two players alternating shots cannot flip-flop it. `ownerLock`
    // is the per-player wave's initial hold on its owner: the user's floor is
    // 2 s, and this is exactly that floor.
    aggro: { commit: 90, ownerLock: 120 },
    // per-seat spawn spacing, px along +x from the map centre — seat 0 sits
    // exactly on the centre, so the single-player spawn never moves
    seatGap: 120,        // x2.5, WAS 48 (commit C's arena rescale)
    // physical ship-body contact costs the player one hull; the enemy side of
    // the same event pays BDMG (one bullet) and is paced by the CONTACTCD
    // tuner, so ramming stays a real tactic without melting a body in a
    // handful of overlapping ticks
    contact: { dmgToPlayer: 1 },
    // COMMIT C's x2.5 ARENA RESCALE, per field: `r` 3, `drift` 1.1, `attract` 72,
    // `pull` 0.55, `vmax` 7, `pickup` 12, `clearPull` 3 and `clearVmax` 24 are
    // all px, px/tick or px/tick^2 and are multiplied. `damp` is a per-tick
    // RETENTION FRACTION and is exempt — a fraction has no length in it.
    orb: { r: 7.5, drift: 2.75, damp: 0.94, attract: 180, pull: 1.375, vmax: 17.5, pickup: 30,
           clearPull: 7.5, clearVmax: 60 }, // the cleared-banner sweep: pull/speed strong
                                          // enough to bank any orb in the world within
                                          // the clearHold window, so a wave's income is
                                          // fully in the wallet before its shop opens
    spawnGap: 48,            // px outside the camera rectangle
    minPlayerDist: 90,       // an enemy never appears closer to the player
    clearHold: 480,          // ticks of inter-wave break. NOT the banner's life:
                             // the WAVE CLEAR card retires on its own 210-tick
                             // clock (bannerHold), so the celebration and the
                             // break are two different numbers — retune this one
                             // and the card does not stretch with it.
                             // ---- THE SWEEP FLOOR, RE-DERIVED AT S4 COMMIT E
                             // The line here read "the orb magnet needs ~206
                             // ticks to bank the world diagonal, so 480 leaves
                             // 274 ticks of margin" — computed for the 3072x3762
                             // world commit C rescaled, and for a sweep that
                             // walks `E.orbs`, which post-flip holds only the
                             // PvP payout. Both halves were stale. The enemy
                             // plane's bounty is the KERNEL's and S4 gives it
                             // its own sweep at production's own numbers:
                             // hypot(7680, 7920) = 11031 px at 3600 px/s is
                             // 3.06 s = 184 ticks, so 480 leaves 296 of margin.
                             // ---- AND IT IS THE SAME NUMBER TWICE, ON PURPOSE
                             // The kernel owns the arc and holds `CLEAR_HOLD`
                             // in SECONDS; this is the same break in ticks, and
                             // `test/tools/demo-director.mjs` holds the two
                             // equal. Two dials for one break is how they drift.
    stallTicks: 1800,        // ---- D21(a)'s STALL SURFACE (S4 commit E) -----
                             // 30 s. Ticks with NO CHANGE in the live body
                             // count before the HUD stops saying how many
                             // hostiles are left and starts naming the SOURCE
                             // that is holding the room. A DIAL: the number is
                             // a first pass and the feel gate judges it.
                             // WHAT HAPPENS NEXT IS THE OWNER'S AND IS NOT
                             // BUILT. D21(a) rules that a room which cannot
                             // clear must SURFACE and must never silently
                             // advance; it does not say whether the room then
                             // offers an advance, escalates, times out, or does
                             // nothing at all. Those are different games. The
                             // surface is the whole of what this round builds.
  };

  // ---- D37's ENCOUNTERS-PER-REWARD-WAVE DIAL (PORT-S S7) -----------------
  // *"How many CLEARS make one reward wave"* — the grouping D37 names a DIAL
  // rather than a ruling, and which fell through S4 unowned. DEFAULT 1: every
  // clear completes a reward wave, so `rewardWave` and `E.wave` are the same
  // number and the market rerolls at every setpiece boundary. demo-v4 shipped 3
  // because its encounters ran about 5 s; production's inter-wave break is 10 s
  // (ECFG.clearHold 480, the owner's ruling S-bpzbzy), which may make the
  // pressure moot — the owner: *"a pacing issue to be decided later"*.
  //
  // IT IS A DEV-TUNE ROUTE AND NOTHING ELSE, on BUILDSCALE's precedent: no
  // pause-panel row, so the pause-ui census does not move. The route is the
  // server's TUNABLES row -> `T.setPvpTune('ENCPERREWARD', n)` -> the setter
  // published on window.Encounter below. DAMP's shape, NOT BUILDSCALE's: this
  // dial has no kernel half at all, so a host-side write would have nothing to
  // land on. Integer, 1..8 — a non-integer grouping is not a pacing question.
  //
  // A KNOWN ODDITY, DOCUMENTED RATHER THAN FIXED: the successor plane's arc is
  // 16 setpieces long and 16 is not a multiple of 3, so at a dial of 3 the last
  // group of an arc is short — waves 15 and 16 clear without completing group 6,
  // and the turn starts a fresh count. That is the honest consequence of keying
  // on the setpiece number, and keying on a clear COUNTER instead would put a
  // second authority on the same boundary (a counter and a wave number that can
  // disagree after a dev jump). The setpiece is hashed and crosses the wire; a
  // counter would be neither.
  let ENCPERREWARD = 1;
  // The reward-wave INDEX of the setpiece standing now: at the default dial it
  // IS the setpiece number, and at 3 the clears of waves 3, 6, 9 deal reward
  // waves 1, 2, 3. Only meaningful on a boundary, which is what `dueForReward`
  // decides — the two are published separately rather than folded into one
  // "or -1" answer, because a sentinel is how a caller comes to treat "no reward
  // this clear" as a reward wave named -1.
  const rewardWaveOf = (w) => w / ENCPERREWARD;
  const dueForReward = (w) => w % ENCPERREWARD === 0;
  // The ONE authority on the variable, published on window.Encounter. It clamps
  // because it is the authority; setPvpTune clamps to the same range because a
  // seam that accepted values the wire route rejects would not be the same
  // lever, which is the rule the four dials beside it already keep.
  function setEncPerReward(n) {
    if (!Number.isFinite(+n)) return false;
    ENCPERREWARD = Math.max(1, Math.min(8, Math.round(+n)));
    return true;
  }

  // The post-wave shop catalog — data-driven rows, so WSAD ENGINE CONTROLS and
  // BLAST CHARGE both appended without touching buy() or the overlay's own drawing
  // (only the grid it lays six cards out on).
  // Each row is pure data plus two closures: `curve` prices it ("double" is
  // base × 2^owned, "flat" never moves — both owner decisions), `cap` is an
  // optional hard rank ceiling (rendered MAXED), and `can` is an optional
  // availability predicate (HULL PATCH leaves the shelf at the LIVE max
  // hull, so Math.min can never silently eat a paid repair). Purchase
  // COUNTS live on E.owned, never on this const: restart() resets state
  // field by field and deliberately never touches this array.
  //
  // Two presentation fields since the shop became a mouse UI. `icon` is the
  // 192 px PNG under assets/ui/upgrades/ that fills the card — a row without
  // one draws the stroked placeholder, so an unshipped asset costs a picture
  // and never a card. `card` marks a row that ALSO carries a big explainer
  // bitmap, popped up while the pointer rests on it; game.js owns that asset.
  //
  // apply() takes the row's rank AFTER the sale (1 for the first purchase),
  // so a row can price its effect off the rank instead of compounding a
  // multiplier it can never re-derive. RAPID LOADER is the row that needs it.
  // EVERY row acts on the BUYING seat and nothing else. The six term rows
  // carry NO apply() at all now: the purchase IS the rank increment buy()
  // performs on the seat's own vector, and termsFor(seat) below is the ONE
  // place a rank becomes a number the sim uses. A row keeps an apply() only
  // for a side effect no derivation can express (the hull rows' repair/grant,
  // ENERGY CELL's fill-on-purchase).
  const SHOP = [
    // Fire rate is ADDITIVE in the rate, not multiplicative in the cooldown:
    // each rank adds 15% of the BASE rate, so rank n fires at (1 + 0.15n)× and
    // the cap-5 ceiling is 1.75×, not the 5.95× a compounding −30% reached.
    // (The step was 50%, then 25%; play testing kept reading each buy as too
    // large a jump.) The formula lives in termsFor, re-derived from the rank.
    { name: "RAPID LOADER", desc: "fire rate +15% of base per rank", base: 4, curve: "double", cap: 5,
      icon: "rapid-loader.png" }, // cap 5: past it the
                                            // quantized cooldown outruns the BMAX live-bullet budget
    // ---- RESCALED AT THE FIX ROUND (S3BR-03) — the row commit C's table
    // missed. `VMAX` moved 2 -> 5 at the flip and this ADDITIVE modifier stayed
    // at +1.0, so every rank kept only 40 % of its old normalized worth: rank 1
    // was 2+1 = 3 and became 5+1 = 6 where scale-preserving is 5+2.5 = 7.5, and
    // rank 2 was 4 and became 7 where it should be 10. The DESC is the shop
    // card's own text and moves with the number it describes.
    // ---- AND WHAT A RANK IS ACTUALLY WORTH SINCE D65 (PORT-P) --------------
    // The CAP rises by 2.5 per rank, uncapped, and the ROW IS HONEST AGAIN.
    // D50 left it broken: at DAMP 0.985 the keys' drag-terminal was
    // a*d/(1-d) = 5.4512 px/tick, so rank 1 delivered 1.3679 of its 2.5 (55 %)
    // and ranks 2-5 delivered NOTHING until the comet multiplied the cap out
    // from under the drag. D65's DAMP 0.995 puts the terminal at
    // 0.0830125 x 199 = 16.5195, above the rank-4 cap of 14.0833: RANKS 1-4
    // NOW DELIVER THEIR FULL 2.5, and rank 5 delivers 2.4362 of 2.5 (97.4 %) —
    // the terminal is 99.615 % of that rank's 16.5833 cap. That arithmetic is
    // why S-n5xhb5 closed. IT IS AN ASYMPTOTE, not a tick count: rank 5 is at
    // 98.5 % of its CAP by tick 900 and crosses 99 % of it only at tick 1015,
    // so it never MEETS its cap in any playable run. The card still says "cap"
    // because the last rank is still not fully reachable on keys alone.
    // NO NUMBER MOVED HERE.
    { name: "AFTERBURNER", desc: "top-speed cap +2.5 px/tick", base: 4, curve: "double",
      icon: "afterburner.png" },  // the CAP is uncapped — the doubling price is
                                  // the brake, and since D50 the drag is a second one
    // The two hull rows act on the BUYING seat's record — can(seat) and
    // apply(rank, seat) both take the seat buy() hands through, defaulting
    // to 0 so every single-seat caller reads exactly as before.
    { name: "HULL PATCH", desc: "repair 1 hull", base: 6, curve: "flat",
      icon: "hull-patch.png",
      can: (seat = 0) => { const S = E.seats[seat]; return !!S && S.hull < S.hullMax; },
      apply: (rank, seat = 0) => { const S = E.seats[seat]; // a consumable, flat by design:
        S.hull = Math.min(S.hullMax, S.hull + 1); } },      // an escalating repair price is a
                                            // death spiral aimed at the player already losing
    { name: "MAX HULL", desc: "max hull +1, granted filled", base: 8, curve: "double",
      icon: "max-hull.png",
      apply: (rank, seat = 0) => { const S = E.seats[seat]; // raises the LIVE cap the pips and
        S.hullMax += 1; S.hull += 1; } },   // HULL PATCH read, and fills the new point
    // (The WSAD ENGINE CONTROLS row is retired: key thrust ships stock now —
    // mods.keyThrust defaults true — so the row had nothing left to sell. The
    // shop is index-addressed on the wire, so removing it SHIFTS every later
    // row's index; BLAST CHARGE is row 4 now, and the suites buy by name or
    // by the shifted index deliberately.)
    // Three ranks at 8/16/32 — the doubling curve, and a cap that makes rank 3
    // read MAXED. Each rank widens the splash by the BLASTGAIN slider; the
    // damage itself never scales, so the row buys reach, not raw output.
    { name: "BLAST CHARGE", desc: "shots splash 1 damage nearby", base: 8, curve: "double", cap: 3,
      icon: "blast-charge.png" },
    // The ENERGY pool's three rows, APPENDED so no existing index shifts — the
    // wire is index-addressed (hud.owned) and the suites buy by name or by the
    // shifted index deliberately. All three carry art now (tools/gen-upgrade-
    // icons.py renders it with the other five), so no row in the shop draws the
    // stroked placeholder any more — the placeholder stays the contract for a
    // row whose bytes never arrive, not the state of any shipped row.
    // All three are pure RANKS that termsFor re-derives, RAPID LOADER's idiom —
    // never `+=`, so moving the ENMAX or ENREGEN slider mid-run rescales every
    // rank the player already bought instead of stranding them.
    { name: "ENERGY CELL", desc: "energy pool +40% per rank", base: 5, curve: "double", cap: 4,
      icon: "energy-cell.png",
      apply: (rank, seat = 0) => { energyFill(seat); } },
                                          // the BUYER's pool fills on purchase, exactly as
                                          // MAX HULL grants its new point filled: capacity
                                          // you cannot use until you have idled for it is
                                          // not capacity. The rank itself already landed on
                                          // the seat before apply() runs, so the fill reads
                                          // the NEW cap through termsFor.
    { name: "RECHARGER", desc: "energy recharge +25% per rank", base: 5, curve: "double", cap: 4,
      icon: "recharger.png" },
    { name: "OVERLOAD", desc: "comet bites harder as the pool empties", base: 8, curve: "double", cap: 3,
      icon: "overload.png" },
  ];

  // THE CONSUMABLE'S ROW, resolved once from the table rather than written as a
  // literal (D37, PORT-S S7). `curve: "flat"` is the DECLARATION that a row is
  // exempt from the market — HULL PATCH is the only row that carries it — and a
  // literal index here would be a second authority on that fact. The catalog has
  // already shifted once: the retired WSAD ENGINE CONTROLS row moved every later
  // index, and the note above says so.
  const FLAT_ROW = SHOP.findIndex((row) => row.curve === "flat");

  // The card art, one record per row, on the same asynchronous contract
  // game.js's two explainer bitmaps run: the record opens not-ready, the load
  // handler asks for exactly one repaint and touches nothing else, and a row
  // whose bytes never arrive draws the placeholder forever. The live loop
  // repaints the panel anyway, so the ask only matters for a PAUSED page.
  const ICON_DIR = "assets/ui/upgrades/";
  const ICONS = SHOP.map((row) => {
    if (!row.icon) return null;
    const rec = { img: new Image(), ok: false };
    rec.img.addEventListener("load", () => { rec.ok = true; render(); });
    rec.img.src = ICON_DIR + row.icon;
    return rec;
  });
  // D48 (PORT-L) — THE LOADOUT RAIL'S OWN ART, keyed by js/abilities.js's own
  // `key` field and NOT by a shop index: the rail lists abilities, the shop
  // lists catalog rows, and the two sets only overlap by accident. Built at
  // MODULE SCOPE for ICONS' own reason — server/dom-stub.mjs denies
  // `new Image()`, addEventListener and a src write under its inSim guard, so
  // this construction may never run inside the headless sim host.
  const RAIL_ICON_FILE = { fire: "fire.png", comet: "comet.png", railshot: "railshot.png" };
  const RAIL_ICONS = {};
  for (const k in RAIL_ICON_FILE) {
    const rec = { img: new Image(), ok: false };
    rec.img.addEventListener("load", () => { rec.ok = true; render(); });
    rec.img.src = ICON_DIR + RAIL_ICON_FILE[k];
    RAIL_ICONS[k] = rec;
  }

  // ---- upgrade terms — per seat, ONE derivation ---------------------------
  // stock is the non-purchase gear every seat carries. keyThrust is STOCK
  // (user feedback: WSAD is the baseline, not an upgrade) — it defaults true
  // and restart() re-arms it true. It survives as honest state: game.js's
  // step() (and its pause copy) still read it LAZILY and permissively
  // (`!== false`), so a page without an encounter thrusts freely and a
  // future mode could re-lock it. GLOBAL by design: it is not a purchase, so
  // it never rides a seat's rank vector.
  const stock = { keyThrust: true };
  // The row indices termsFor derives from, resolved ONCE by name — an index
  // literal here would silently re-map when a row is added or retired.
  const ROW_IX = {};
  SHOP.forEach((row, i) => { ROW_IX[row.name] = i; });
  // (rankOf(seat, name) folded into termsFromOwned below — the vector twin
  // is the one body now, and termsFor(seat) resolves the seat's live vector.)
  // termsFor(seat) — THE ONE derivation of a seat's effective upgrade terms.
  // It lives HERE, in encounter.js beside the SHOP that gives the ranks their
  // meaning, and game.js reads it lazily through window.Encounter (the same
  // crossing Encounter.mods made). The server sim and the phase-11 client
  // predictor both call THIS; nothing else may derive a term.
  //
  // A pure function of the seat's HASHED rank vector and the global stock —
  // no rand(), no clock, no state written — so the hash needs only the ranks
  // and the derived numbers never fold in twice. A missing seat derives the
  // rank-0 stock terms (null-safe, cometActive's contract).
  //   cool   — multiplier on BCOOL: 1/(1 + 0.15 × RAPID LOADER rank)
  //   speed  — ADDITIVE px/tick on the VMAX CLAMP: 2.5 × AFTERBURNER rank,
  //            uncapped. THE 2.5 IS THE ARENA RATIO, the one named number of
  //            commit C's rescale (1280/512), and it is written as a literal
  //            here for the same reason every other row in that table is: a
  //            modifier on a px-dimensioned base is itself px-dimensioned.
  //            D50 RAISED A CEILING THE KEYS COULD NOT REACH: the keyboard
  //            drag-terminal was 5.4512 px/tick against a rank-1 cap of
  //            6.5833, so rank 1 delivered 55 % of its 2.5 and rank 2+ none of
  //            it. D65 (PORT-P) FIXED IT: at DAMP 0.995 the terminal is
  //            16.5195, so ranks 1-4 deliver in full and rank 5 delivers
  //            97.4 % of its 2.5 (99.615 % of the cap, asymptotically). It is
  //            still the whole story under COMET, where the cap is multiplied
  //            and the drag is outrun. R8a's row.
  //   blast  — the BLAST CHARGE rank, 0-3: 0 is off; the radius each rank
  //            reaches is BLASTR + BLASTGAIN × (rank − 1) off game.js's sliders
  //   enCell/enRech/fury — the ENERGY pool's stored RANKS: game.js turns them
  //            into numbers (energyCap, energyStep's regen, contactEvent's
  //            OVERLOAD) against its own ENCELL/ENRECH/COMETFURY sliders, so
  //            the shop stores what was bought and the tuner owns its worth
  // The vector-based body of the derivation: the same formula over a BARE
  // rank vector, so phase 11b's predictor can derive terms from the ACKED
  // wire vector without waiting for the presented E.seats write — and
  // without a second copy of the formula existing anywhere. termsFor(seat)
  // is this function over the seat's live vector; nothing else may derive.
  function termsFromOwned(owned) {
    const rk = (name) => (owned ? owned[ROW_IX[name]] || 0 : 0);
    return {
      cool: 1 / (1 + 0.15 * rk("RAPID LOADER")),
      speed: 2.5 * rk("AFTERBURNER"),
      keyThrust: stock.keyThrust,
      blast: rk("BLAST CHARGE"),
      enCell: rk("ENERGY CELL"),
      enRech: rk("RECHARGER"),
      fury: rk("OVERLOAD"),
    };
  }
  function termsFor(seat) {
    const S = E.seats[seat];
    return termsFromOwned(S ? S.owned : null);
  }
  // ...and the RAW vector beside it, for the one consumer that judges OWNERSHIP
  // rather than a derived term: Flight.abilityOn asks whether the seat owns the
  // ability at all, which is a rank test and not a formula. The array itself is
  // handed back, not a copy — the arm rule reads one index and never writes —
  // and a seat that does not exist answers null, which the rule reads as
  // unowned. It is FULL WIDTH (restart builds it as SHOP.map(() => 0)), so the
  // raw index the rule performs is safe by the same padding argument
  // tests/fixtures/README.md states for every other raw read.
  function ownedFor(seat) {
    const S = E.seats[seat];
    return S ? S.owned : null;
  }
  // The COMPATIBILITY VIEW, kept ONLY because a wide test surface (snapState
  // consumers, sim-host's snapshotRaw, the golden suites' keyThrust
  // save/restore) still reads Encounter.mods — it answers with SEAT 0's
  // derived terms, always, and is NOT a local-seat view: presentation code
  // that wants the player's own terms calls termsFor(localSeat()) instead.
  // Getter-backed so it can never drift from termsFor; keyThrust is the one
  // writable field, backing straight onto stock. No sim code reads this view.
  const mods = {};
  for (const k of ["cool", "speed", "blast", "enCell", "enRech", "fury"]) {
    Object.defineProperty(mods, k, { get: () => termsFor(0)[k], enumerable: true });
  }
  Object.defineProperty(mods, "keyThrust", {
    get: () => stock.keyThrust,
    set: (v) => { stock.keyThrust = v; },
    enumerable: true,
  });

  // ---- seeded RNG — the only randomness in the encounter -----------------
  function mulberry32(seed) {
    let a = seed >>> 0;
    // the generator's whole state is `a`; the harness hashes it so a trace can
    // prove the stream is where it was, not merely that the same values came out
    const f = () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.state = () => a >>> 0;
    return f;
  }
  let rand = mulberry32(ECFG.seed);

  // ---- the simulation event stream ---------------------------------------
  // One simulation event. The simulation produces these and never touches
  // audio. `kind` is the cue name Sfx already understands. `at` is the world
  // point the cue pans from, or null for a cue with no position. `gain` is
  // the 0..1 volume the call site computed, or undefined to let Sfx decide.
  // `seat` is the player seat the event belongs to, or undefined for an
  // event no seat owns — the wire carries it, so a remote client can tell
  // its own cues from another seat's. One seat today, so every seat is 0.
  // { kind: string, at: {x, y} | null, gain?: number, seat?: number }
  //
  // The queue retires a whole class of bug rather than defending against it:
  // a cue used to be a call INTO the audio layer from inside the step path,
  // one edit away from consuming rand() between two seeded draws. An emit
  // writes one plain object and reads nothing — no clock, no rand(), no
  // allocation beyond the event — so the audio path can no longer sit
  // between rand() calls at all. The presentation side drains the queue
  // after step() returns, in order, on the same tick.
  const EVENTS = [];
  // the only way in. `at` may be a live entity — x and y are copied out
  // rather than the entity retained, because a body can be reaped between
  // the push and the drain.
  // `termSeq` rides ONLY the termChange marker (a buy or a rank reset): the
  // spread keeps every other event's shape byte-identical to what the
  // committed event-stream fixtures pinned before the field existed.
  // `srcKind` is the DAMAGE kind behind a hurt/death cue — "ram", "beam",
  // "shot", "blast" — and it is SERVER-SIDE ONLY by construction, not by
  // promise: server/snapshot.mjs's event encoder is an explicit allow-list
  // ({k, x, y, seat, g, seq}) and never learns this field, so it cannot reach
  // a client. server/snapshot.test.mjs pins that record, which is what would
  // notice if someone added the line. The golden event trace projects
  // {tick, kind, gain} the same way, so this moves no fixture either.
  //   It exists for the contact-violation sentinel (D28): a burning pilot must
  // never take BODY-CONTACT damage, and without the kind the server sees a
  // legitimate beam hit and a defective ram hit as the same event.
  // `col` (D64, PORT-P) is a KERNEL COLOUR NAME on a destruction cue, and it is
  // SERVER-SIDE ONLY by the SAME construction as srcKind above: the encoder's
  // allow-list never learns it, and js/net.js re-builds an inbound cue as four
  // keys, so a ?mp client draws the row's own fallback hue. Widening either is
  // R7's wire question, not this lane's.
  function emit(kind, at, gain, seat, termSeq, srcKind, col) {
    // (THE STALL SIGNATURE'S DAMAGE TERM IS NOT COUNTED HERE — fix 11. It was,
    // and the scoped check found what a cue stream admits: a `hit` on a wall, a
    // PvP `blast` and a shot into a nonblocking mine are all emitted here and
    // none of them is progress toward a clear. The term is the KERNEL's now —
    // player-credited damage applied to a BLOCKING body, counted at
    // `damageEnemy`'s own funnel where the role and the credit both are.)
    EVENTS.push({ kind, at: at ? { x: at.x, y: at.y } : null, gain, seat,
                  ...(termSeq !== undefined ? { termSeq } : {}),
                  ...(srcKind !== undefined ? { srcKind } : {}),
                  ...(col !== undefined ? { col } : {}) });
  }
  // Ordered: index 0 fired first. events() is a readonly view of the events
  // queued this tick; drainEvents() hands them over and clears the queue.
  const events = () => EVENTS;
  const drainEvents = () => EVENTS.splice(0);

  // ---- entity identity ----------------------------------------------------
  // A plain monotonic counter, never a rand() draw — a draw here would shift
  // the seeded stream and re-deal every wave in the game. restart() resets it
  // so a seeded run reproduces its ids exactly, which is what lets a golden
  // trace assert on them at all. One id space across enemies, missiles, orbs,
  // shards AND game.js's bullets. An id is never reused: shards take fresh ids
  // and the dead husk's id retires with it.
  //
  // WHY IT IS ONE SPACE — corrected 2026-08-26 (PORT-S S3b lane 1, Codex
  // vendor-cross). This comment used to say "a replication layer keys by id
  // alone and cannot disambiguate by owning array". THE REPLICATION LAYER DOES
  // NOT: the wire keeps four separate arrays (server/snapshot.mjs:312-333) and
  // js/net.js's decoder builds a separate Map per family — e1by :2436, m1by
  // :2489, o1by :2519, b1by :2528 — so an enemy 7 and a bullet 7 are two keys in
  // two maps and never meet. (Every anchor in this paragraph and the next was
  // re-measured at PORT-S S7; the four it carried were pre-existing drift.)
  //
  // THE CONSUMER THAT REALLY CANNOT DISAMBIGUATE IS THE PRESENTATION PLANE, and
  // it needs MONOTONICITY rather than uniqueness. js/game.js:4795 records that
  // `PRES.maxId` was ONE number across four id-keyed caches; presIdReset()
  // (:4865) reads any body whose id is at or below that family's own maximum and
  // absent from its own family map as an ID-SPACE RESET; and capturePresent()
  // (:4879) clears a family's cache and resets its own `PRES.max` entry when
  // that family trips it (:4921-4924). That is what this counter's
  // "never reused, always ascending" property is actually protecting, and it is
  // the property a SECOND producer minting into the same space would break — see
  // js/encounter-host.js, where the PORT-S flip's bill for it is written down.
  let nextEntityId = 1;
  const nextId = () => nextEntityId++;

  // ---- THE DEAL AND ITS TABLES ARE RETIRED (S3b lane 3, commit D4) -------
  // `countsFor`, `TIER_LADDER`, `TIER_TYPES`, `tierRow`, `ROTATION`,
  // `DEALFIRST`, `DEALLAST`, `ROSTER`, `ARCSTEP`, `statsFor` and `waveGroups`
  // — the per-wave counts, the tier ladder for waves 10 and up, the roster
  // literal, the 140-line stat table and the wave dealer itself.
  //
  // THE ROSTER LITERAL WAS TEXT-PINNED IN FIVE OTHER FILES and every one of
  // those pins is re-cut in this commit rather than left to rot:
  // test/node-golden.mjs's ROSTER-order leg and its registry row count,
  // server/snapshot.test.mjs's ROTATION/ROSTER text extraction, and
  // test/node-golden.mjs's `mulberry32` copy (which was extracted from this
  // file and stays, because `mulberry32` stays).
  //
  // D9 REPLACED THE ROSTER and D8 replaced the DEAL. The successor plane's
  // director runs ONE curated arc from `WAVES` in js/demo-kernel.js against a
  // twenty-one-row `STATS` table, and its threat budget — D8's shared deal,
  // scaling sub-linearly with PRESENT seats — LANDED AT PORT-S S4 commit D:
  // `threat = 1 + 0.2 x (present - 1)`, which is D14's ~1.6x at four seats
  // exactly. PRESENT is claimed-and-not-parked, pushed from `poseKernelSeats`
  // as `!absent`, and read AT THE DEAL — which is where D8 relocated the
  // presence gate this file's own dealer used to carry.

  // ---- encounter state ---------------------------------------------------
  // One seat's survival-and-wallet record. hull/hullMax/invuln/hitFlash are
  // the fields that used to live directly on E; xp is the seat's spendable
  // wallet and score its RUN scoreboard — credited exactly where XP is
  // credited (addXp), and zeroed by exactly one thing: DYING, whatever
  // killed you (deathToll). Spending still leaves it standing; a death and a
  // restart do not. That is the reversal — the old record's score survived a
  // PvE death and only a PvP kill took it.
  // `best` is the seat's HIGH-WATER score, the standing the board ranks and
  // crowns by. It is maintained in addXp beside score, so it always includes
  // the live run, and it survives the death that zeroes score — without it
  // every seat would sit near 0 and the crown would flicker on every kill.
  // UNHASHED and match-scoped: it is draw-only (see hashEncounter's charter
  // block, and termSeq's precedent) and restart() clears it with the run.
  // A seat is DEAD while hull is 0: excluded from targeting,
  // collisions and input, its respawnT counting down toward re-entry.
  // `stock` is the quarter rule's per-seat life count — it depletes only
  // while lobby waiters exist (E.lobbyWaiters), so open play respawns
  // forever and a full lobby makes each seat's lives finite.
  // `owned` is the seat's PERSONAL rank vector, parallel to SHOP — hashed
  // (ranks decide what the sim does next through termsFor). `termSeq` is the
  // seat's term EPOCH: a monotonic counter bumped on every successful
  // purchase and every rank reset, UNHASHED (pure bookkeeping derived from
  // the hashed history, the prediction layer's discontinuity marker — see
  // the termChange event).
  function makeSeat() {
    return { hull: ECFG.player.hull, hullMax: ECFG.player.hull,
             xp: 0, score: 0, best: 0, invuln: 0, hitFlash: 0,
             respawnT: 0, stock: ECFG.player.stock,
             // the claim window and its terminal state. `claimT` opens when the
             // respawn timer runs out with no click behind it; `absent` is where
             // it ends — a seat with nobody behind it, off the field and off the
             // board. Both HASHED (they decide whether the seat comes back), but
             // through a GUARDED fold that costs zero bytes at these defaults —
             // see hashEncounter, and the pvpCd block it copies
             claimT: 0, absent: false,
             owned: SHOP.map(() => 0), termSeq: 0,
             // ---- D37's MARKET HAND (PORT-S S7) ---------------------------
             // `hand` is up to four CATALOG INDICES — the cards this seat was
             // dealt at the last reward wave — and `bought` is a parallel 0/1
             // per card. Both HASHED, through a guarded fold that costs zero
             // bytes while the hand is empty (hashEncounter again, the pvpCd
             // idiom the pair above already copies).
             //
             // THEY START EMPTY, and that is a ruling and not an oversight:
             // the first hand is dealt at the FIRST CLEAR, so wave 1 is a pure
             // flying wave with HULL PATCH the only purchasable row. Dealing at
             // run start instead was MEASURED and costs all 46 checkpoints of
             // 12 of the 13 committed traces plus the server's boot self-check.
             //
             // THE IDS ARE STORED RATHER THAN RE-DERIVED, which is what makes
             // D37's *"a purchase marks its card and never rerolls the others"*
             // true at all: a purchase can push a row OUT of the pool (a maxed
             // row is not offered), so a hand re-derived after a sale would be
             // a DIFFERENT hand.
             hand: [], bought: [] };
  }
  const E = {
    state: "idle", // idle | warning | active | cleared | dead (every seat down
                   // with no respawn pending — reachable only under the
                   // quarter rule; open play cycles the first four forever)
    wave: 1,
    waveTick: 0,
    loop: 0,       // THE ARC LOOP COUNTER — arc turns AND wipes since restart().
                   // PRODUCTION'S OWN, and that is the whole point of it: the
                   // kernel's `S.cycle` says the same thing, but it is unhashed
                   // here, absent from the host seam and absent from the wire
                   // (see the stallIdentity block below, which says so itself),
                   // so a hashed hand keyed on it could not be reproduced by a
                   // replay or by a client. `loop` is HASHED — under a guarded
                   // zero-default fold, so a run that never turns and never
                   // wipes folds zero bytes for it and every trace captured
                   // before it existed still reproduces. Written in exactly
                   // three places: applyKernelHud (the arc turn, watched as
                   // E.wave FALLING), the wipe block, and restart(), which
                   // zeroes it. Read by the market's deal key.
    // ---- THE THREE ARRAYS ARE DELETED (S3b lane 3, commit D5) ------------
    // `groups`, `enemies` and `missiles` — the wave SCHEDULE, the BODIES and
    // the ORDNANCE. Commit D4 deleted every producer, every stepper and every
    // reaper of all three and left the storage standing, because emptying a
    // list and deleting it are different changes and they were owed different
    // commits. This is the second one.
    //
    // THE PLAN'S OWN SENTENCE was *"the four arrays (bullets, enemies,
    // missiles, orbs) become one registry-driven list"*. THREE OF THE FOUR ARE
    // GONE rather than merged, which is the same end state reached from the
    // other side: production fields TWO entity kinds now, `bolt` and `orb`,
    // and js/engine.js's registry declares exactly those two under
    // `KINDS.production`. What a body IS on this plane is the KERNEL's row,
    // and this file reaches it through `EncounterHost.bodies()`.
    //
    // AND THE FOURTH IS NOT MERGED INTO THE SECOND, deliberately and with the
    // reason stated rather than left to be re-derived: `G.bullets` lives in
    // js/game.js and `E.orbs` here, they cross two different wire rows, two
    // different PRES rings and two different hash folds, and R7 owns the
    // codec that would give a merged row its encoding. A physical single list
    // for two kinds with no shared consumer buys nothing and spends hazard 3
    // — the 45 id-less synthetic pushes — for it. STATED FOR THE SEAT.
    stats: null,   // this wave's resolved statsFor object — never written since D4
    orbs: [],
    seats: players.map(() => makeSeat()), // one record per seat, index = seat id;
                                          // restart() keeps it in step with players[]
    // (owned moved onto each seat record — E.owned below delegates to seat 0,
    //  a TEST-surface alias now; the panel reads localSeatRec().owned)
    shopHover: -1,               // the shop-panel card under the pointer, or -1 — the ONE piece
                                 // of shop input state, read by the draw, the detail line and
                                 // the hover art alike, so they cannot disagree inside a frame
    // ---- THE MARKET'S IDENTITY (PORT-S S7, D37) --------------------------
    // WHICH deal the hands standing in E.seats belong to: the PHYSICAL wave
    // whose clear dealt them, and the arc loop that wave sat in. `0` is NEVER
    // DEALT — waves start at 1 — so a fresh run and a wiped room read the
    // same, which is what a wipe is supposed to mean. The identity is the
    // physical clear and NOT the derived reward wave, so a live ENCPERREWARD
    // retune can neither re-deal a clear already dealt nor alias a later one
    // onto it (S7-CX-01); `rewardWave` is the substream key and the due test.
    //
    // IT IS AN IDENTITY, NOT AN EDGE, and that is the whole design: `cleared`
    // is RE-DERIVED every tick of the 480-tick break, so an edge-triggered
    // deal would re-deal 480 times. The deal check compares the identity it
    // WOULD deal against the one standing and does nothing when they match —
    // idempotent by construction, demo-v4's `marketId` idea by spec.
    marketWave: 0,
    marketLoop: 0,
    wipePending: false,          // the deferred WIPE edge: the death that leaves NO seat
                                 // alive arms it — and so does the LEAVE that takes the
                                 // last standing seat (unseatSeat) — and encStep consumes
                                 // it once, later in that same tick, to deal the RUN back
                                 // to a new one: wave 1, an empty field, every wallet,
                                 // board and rank at stock. It deals nobody back in —
                                 // each present seat re-enters on its own click through
                                 // the ordinary respawn flow, which is what keeps that
                                 // flow reachable in a one-seat room — see the apply in
                                 // encStep for the fields it leaves alone and why.
                                 // The rule is "no seat is alive", NOT "everyone died
                                 // inside 10 s". The two coincide only while every dead
                                 // seat carries respawnT === ECFG.player.respawn — that
                                 // is, only while lobbyWaiters is 0. Under the quarter
                                 // rule a seat out of stock parks at hull 0 / respawnT 0
                                 // forever, and from then on the next death of the last
                                 // live seat is a wipe with no window involved at all.
                                 // Nothing in production writes lobbyWaiters today, so
                                 // that hole is LATENT: phase 16's drop-in joins are what
                                 // open it, and they are what have to close it.
                                 // HASHED, and only while true — see hashEncounter.
    lobbyWaiters: 0,             // the phase-09 hook: players waiting for a seat. While it is
                                 // >0 every death consumes one life from the dying seat's
                                 // stock (the quarter rule); at 0 the stock never depletes.
                                 // HASHED — it decides whether a seat comes back.
    clearTick: 0,
    shipPrev: null, // the ships' previous-tick positions, one per seat — the
                    // lance/dash/missile/contact sweeps sample them. encStep
                    // writes an ARRAY; a suite may still stage a single {x,y}
                    // for seat 0 — prevOf() accepts both shapes
    kills: 0,
    missilesShot: 0, // missiles a player bullet destroyed — NOT a kill: no orb, no XP,
                     // and deliberately outside E.kills so the kill count stays a
                     // count of bodies
    hitsDealt: 0,  // REGISTERED bullet hits — on enemies, and since phase 14 on other
                   // PLAYERS too (resolveBulletHits counts the PvP branch only when
                   // hitPlayer returned true, so a comet-negated or i-framed strike
                   // inflates nothing). Hashed, like every counter here
    hitsTaken: 0,  // lance/dash/contact hits on the player — and, since phase 14,
                   // PvP hits too: every registered hit on a seat passes hitPlayer,
                   // and the counter sits above the damage source, which is not stored
    pvpCd: {},     // the PvP ram's pacing: one bite per ORDERED attacker:victim pair per
                   // window, "a:v" → ticks left. Sparse by construction — a key exists only
                   // while a window is open, and resolvePvpRams deletes it at expiry — which
                   // is what lets hashEncounter fold it for ZERO BYTES while it is empty, so
                   // every solo trace and every PvP-free multi-seat trace keeps its committed
                   // hash. Never on the wire, never in snapState: pacing, not presented state
    contactsDealt: 0, // contact events that damaged an enemy body
  };
  // Seat 0's record answers to the OLD names: E.hull, E.hullMax, E.xp,
  // E.score, E.invuln and E.hitFlash all delegate to E.seats[0], exactly as
  // G delegates its moved flight fields to players[0]. Every single-seat
  // reader — the HUD, the shop, the suites' staged hulls — keeps working,
  // and there is exactly ONE copy of the state.
  // `owned` rides the same delegation: E.owned IS seat 0's rank vector, and
  // the delegation is now a TEST/compat surface only. Every presentation read
  // — the HUD column, the shop panel, the death card, net.js's decode — goes
  // through localSeatRec() instead, so a client granted seat 1 reads seat 1.
  for (const f of ["hull", "hullMax", "xp", "score", "invuln", "hitFlash", "owned"]) {
    Object.defineProperty(E, f, {
      get: () => E.seats[0][f],
      set: (v) => { E.seats[0][f] = v; },
      enumerable: true,
      configurable: true,
    });
  }
  // The LOCAL seat's record — the ONE way this file's HUD, death card and
  // shop panel reach per-seat state. game.js owns localSeat() (0 in local
  // play and on the server, the granted seat in net mode); every SIM read
  // here takes an explicit seat id and must never call this. Falls back to
  // seat 0, which always exists, so a spectator still reads a real record.
  const localSeatRec = () => E.seats[localSeat()] || E.seats[0];
  // seats[] tracks players[] one to one; called by restart() (the only place
  // the count is allowed to change between matches). A grown seat starts
  // fresh; a shrink drops the tail records, scores included.
  function syncSeats() {
    while (E.seats.length < players.length) E.seats.push(makeSeat());
    if (E.seats.length > players.length) E.seats.length = players.length;
  }
  const seatAlive = (s) => { const S = E.seats[s]; return !!S && S.hull > 0; };
  // THE CLAIM PRESS. A seat asks to be dealt back in with the ONE input it
  // already sends every tick — the fire edge. game.js latches bit 0 of the
  // frame's `ap` mask into the seat's own input bank at the drain (and clears
  // every bank once the tick is over), so this read is deterministic at encStep time and costs no new wire
  // field, no new frame key and no new fixture byte. It is a READ: the sim
  // never writes input transport, and the same latch still decides firing —
  // fire() is already cold for a dead seat, so the press does double duty
  // without either meaning changing.
  const claimPress = (s) => { const P = players[s]; return !!(P && P.input.claimPress); };
  // A seat with nobody behind it LEAVES. Not a death: no toll, no orbs, no
  // wipe arm and no death cue, because there is no run to bill and no player
  // to tell. Everything downstream already reads `hull > 0` (seatAlive gates
  // all 33 call sites), so aggro, targeting, sweeps and orbs drop the seat for
  // free; `absent` is what additionally takes it off the board and out of the
  // draw, and what stops the respawn loop from ever dealing it back on its own.
  // THE one definition of a seat with nobody behind it — the terminal write
  // unseatSeat (a mid-run leave) and parkSeat (an empty-seat statement, made
  // at match start or across a restart cut) both make, extracted so a seventh
  // terminal field added later cannot be cleared on one path and left stale
  // on the other: that split is a hashed divergence waiting for a four-seat
  // start. A seat already terminal or missing is left alone — the same guard
  // both callers used to carry themselves. Published (see the surface below):
  // the net client's decoder folds a parked seat's four-key record through
  // this same body, so a third caller lives in js/net.js.
  function vacateSeat(s) {
    const S = E.seats[s];
    if (!S || S.absent) return;
    S.absent = true;
    S.claimT = 0;
    S.respawnT = 0;
    S.hull = 0;
    S.invuln = 0;
    S.hitFlash = 0;
  }
  function unseatSeat(s) {
    const S = E.seats[s];
    // THE PARK IS CLEARED FIRST, AND UNCONDITIONALLY (S4-CX-1, the fix round).
    // The guard below refuses an already-absent seat, and a PARKED seat is
    // absent — so a grant revoked while parked used to leave `joinParked`
    // standing and `releaseParkedJoiners` seated it anyway at the clear: a
    // socketless seat, PRESENT in the next deal's budget, holding a slot no
    // real joiner could take. Leaving is leaving on every route into this
    // function, so the queue entry goes before the guard reads anything.
    if (joinParked.length > s) joinParked[s] = false;
    if (!S || S.absent) return;
    const wasStanding = S.hull > 0; // read BEFORE the terminal write takes the hull
    vacateSeat(s);
    // ...and the ONE thing a leave does share with a death: it can empty the
    // field. The wipe rule is "the run deals back to a new one when no seat is
    // left standing", and it was armed only inside hitPlayer's death branch — so a
    // room whose LAST standing ship left by grace-lapse instead of by dying kept
    // its late wave, kept the pack on the field and kept spawning into a room
    // with nobody in it. The seat waiting on its own click then clicked back
    // into a wave-24 pack that had grown while nobody was flying, which is
    // exactly the state the wipe reset exists to prevent.
    // The guard is `wasStanding`, not "no seat alive": the claim-window path
    // below calls this with a hull that has ALREADY been 0 for 2400 ticks, and
    // that seat's own death either armed the wipe at the time or was correctly
    // ignored because somebody else was still up. Re-arming for it would deal a
    // second wave 1 over the first and reseed rand through startWave for a field
    // that was never repopulated. Only the seat that was STANDING a moment ago
    // can be the one whose leaving emptied the field.
    if (wasStanding && E.state !== "dead" && !players.some((_, i) => seatAlive(i)))
      E.wipePending = true;
  }
  // The reclaim's server-side half: a parked seat that has a socket behind it
  // AGAIN. Not a respawn — the deal still needs the player's click, decision 1's
  // whole point — but the seat stops being EMPTY the moment somebody is there to
  // claim it, so it goes back to the state that says "waiting on a click" in the
  // sim, on the wire (`cl`) and on the card. Without this the server's grant bound
  // a socket to a seat still reading `absent`, and its own absent-seat sweep tore
  // the grant down on the next tick and told the player they spectate.
  // Idempotent and absent-only: a live or already-waiting seat is untouched, so a
  // reclaim landing twice cannot extend a window or resurrect a flying ship.
  // ---- D17: PARK UNTIL THE SETPIECE ENDS, THEN SEAT (S4, commit F) --------
  // *"A joiner never lands inside a boss telegraph they did not see begin, and
  // the director's threat budget never shifts mid-encounter."* Both halves are
  // paid by the same wait: an unseated seat is NOT PRESENT, so a joiner that
  // parks cannot move D14's budget until the deal that follows the break.
  //
  // THE MECHANISM THE POR NAMED DOES NOT EXIST. D17's row says it "reuses the
  // shipped Route A mechanism (4 seats parked behind a presence-gated deal)",
  // and that gate lived inside production's own `startWave` deal, which S3b
  // commit D4 deleted. So the wait is rebuilt here and the PRESENCE half of it
  // lives in the kernel's budget, which is where D8 relocated it.
  //
  // THE BOUNDARY IS THE CLEAR, and D21 is what makes that a boundary at all.
  // The POR row says a parked joiner's wait "is bounded by play, not by a
  // clock" — true only while the room CAN clear, which is why D21(a)'s stall
  // surface and this release are the same mechanism seen from two sides. A room
  // that cannot clear holds its joiners exactly as long as it holds its pilots,
  // and the HUD says so.
  //
  // ---- WHY THE PARK LIST IS MODULE STATE ---------------------------------
  // It is a fact about SOCKETS, not about the simulation: the only caller of
  // `reseatSeat` is `server/server.js`'s grant, no browser reaches it, and no
  // hash, snapshot or wire field carries it. `restart()` clears it, so a run
  // cannot inherit the previous one's queue.
  let joinParked = [];
  function roomIsClear() {
    // ONE derivation again — the kernel's own gate, through the host, which is
    // the same call `foeCount()` and the HUD state map read. "Is this setpiece
    // over" must not be two questions.
    return typeof window !== "undefined" && window.EncounterHost
      && window.EncounterHost.installed() && window.DemoKernel
      && typeof window.DemoKernel.roomClear === "function"
      ? window.DemoKernel.roomClear() : true;
  }
  function seatJoiner(s) {
    const S = E.seats[s];
    if (!S || !S.absent) return;
    S.absent = false;
    S.claimT = ECFG.player.claim;
  }
  function reseatSeat(s) {
    const S = E.seats[s];
    if (!S || !S.absent) return;
    // MID-SETPIECE: the seat waits. It stays `absent` — on the card, on the
    // wire and in the budget — until the room clears, and the release below
    // deals it back with the same claim window a straight reseat would have.
    //
    // ...AND ONLY WHILE SOMEBODY IS FLYING. MEASURED, not anticipated: without
    // this clause a joiner walking into a room where NO seat is alive parks
    // against a setpiece nobody is fighting, and the wipe that follows deals a
    // fresh wave 1 which is not clear either — so the wait never ends. Both of
    // D17's stated reasons are about a room in play: there is no telegraph to
    // protect a joiner from and no budget to shift when the field has nobody in
    // it. `server/afk.test.mjs`'s "the promised click seats the pilot on a LIVE
    // seat" is the leg that found it, and its own header calls that path THE
    // BLOCKER.
    if (!roomIsClear() && players.some((_, i) => seatAlive(i))) { joinParked[s] = true; return; }
    joinParked[s] = false;
    seatJoiner(s);
  }
  // ...and the release, called once per tick from `encStep` after the HUD map
  // has read the kernel. A seat whose socket left while it was parked is
  // skipped by `seatJoiner`'s own `absent` test on the way through — there is
  // nothing here that can seat a player who is no longer there.
  function releaseParkedJoiners() {
    if (!joinParked.length) return 0;
    if (E.state !== "cleared") return 0;
    let n = 0;
    for (let i = 0; i < joinParked.length; i++) {
      if (!joinParked[i]) continue;
      joinParked[i] = false;
      const S = E.seats[i];
      if (S && S.absent) { seatJoiner(i); n++; }
    }
    return n;
  }
  // PARKING (the drop-in round): a seat the fresh deal leaves with nobody
  // behind it. The same terminal shape as an AFK unseat — the ONE shared
  // write, vacateSeat — but a DIFFERENT operation, deliberately not routed
  // through unseatSeat: parking is a statement about an already-empty seat,
  // not a leave, so it must never arm the wipe (unseatSeat's wasStanding
  // branch arms one when it takes the last standing seat; both callers here
  // just dealt a fresh wave with wipePending cleared), bill nothing and cue
  // nothing. TWO callers, both in server.js and both right after a restart of
  // the sim: startRound parks after startMatch, and restartRound — the
  // mid-match restart cut — parks after enc.restart(). Each must park AFTER
  // its restart, because restart() clears `absent` on every seat, and each
  // then re-deals wave 1 (when anything parked) so the parked seats' shares
  // leave the schedule.
  function parkSeat(s) {
    vacateSeat(s);
  }
  // BOUND AND PARKED, as one readable state (S4-CX-1, the fix round). The two
  // planes disagreed about what an absent seat means: to the sim a parked seat
  // is a seat waiting for the clear, to `server.js`'s absent-seat sweep it was
  // a seat whose player left. One published question settles it — the sweep
  // asks, and skips the seats that answer yes.
  function seatParked(s) {
    return !!joinParked[s];
  }
  // the previous-tick ship position for seat s — see E.shipPrev's comment
  function prevOf(s) {
    const sp = E.shipPrev;
    if (!sp) return players[s].ship;
    if (Array.isArray(sp)) return sp[s] || players[s].ship;
    return s === 0 ? sp : players[s].ship; // legacy single-object stage
  }

  // ---- the phase-15 pose-history ring --------------------------------------
  // 22 rows: a 21-tick rewind inclusive of both endpoints needs 22. One row
  // per encStep, written at its END beside the E.shipPrev record, so every
  // row holds SETTLED poses and a body reaped this tick never enters it (the
  // died-in-window rule leans on that). The ring lives IN THE SIM — both
  // fixture drivers bypass server/server.js, so a server-side ring would make
  // every rebated hit unreproducible by replay; and a rebated kill's
  // downstream draws (reapDead, orbs) run at NOW off the seeded stream, which
  // only holds if the sweep itself is replayable here.
  //
  // EXCLUDED from hashEncounter, snapState and the wire — the derived-state
  // rule (E.stats, energyMax, termSeq precedents): every row is a copy of
  // poses that are themselves hashed, and the ring is read ONLY on a
  // vt-bearing fire. The counter-precedent to argue: E.shipPrev IS hashed —
  // but shipPrev feeds LIVE sweeps every tick, while this ring decides
  // nothing until a rebate reads it. It is NOT folded pvpCd-style either: a
  // ring is non-empty from tick 1, so folding it would move EVERY committed
  // fixture and kill the Δ=0 bridge.
  const REWIND_ROWS = 22;
  const poseLog = []; // rows ascending by age: newest (era now-1) at the end
  // Which enemy modes the rebate sweeps at LIVE poses instead of rewound
  // ones. Phase 12's client PROJECTS project:1 modes forward by leadTicks —
  // the shooter's screen already showed those bodies near server-now, so
  // rewinding them would double-compensate by ~2x the lead. This table must
  // equal js/net.js's ENEMY_POLICY project flags; a browser leg pins the two
  // (both files load in the page; drift fails the leg).
  const LIVE_SWEEP = { seek: 1, tele: 0, pulse: 0, lockon: 0, windup: 0,
                       dash: 0, tired: 0 };
  // ---- THE REBATE'S ENEMY ARM RETIRES (PORT-S S3b lane 3, commit B) -------
  // A RULING WITH A MEASUREMENT UNDER IT, not a scope cut. The successor
  // plane's bodies do NOT join the rebate sweep, and the ring's enemy rows go
  // empty when the old plane does. The PvP arm — the one R3 measured honest at
  // n=470, d200 j20 — is untouched, and so is the ring itself.
  //
  // WHAT WAS MEASURED. The table above must equal js/net.js's ENEMY_POLICY
  // `project` flags, and a browser leg pins the two. A kernel body has no
  // `mode` at all: it carries one of thirty-six per-type STATE values, the
  // wire has no row for its type (`ty` encodes -1 — the program's standing
  // fact until R7's v11), and `wireMode(-1)` falls back to `"seek"`, which is
  // the ONE policy row with `project: 1`. So the CLIENT would project every
  // kernel body forward by the lead, while this table's lookup on an absent
  // `mode` yields undefined and this sweep would REWIND it. The two halves
  // would compensate in opposite directions at once — about 2x the lead — and
  // that is precisely the double-compensation this table exists to prevent.
  //
  // AND THERE IS NO SURFACE TO SERVE. The rebate is lag compensation, which
  // means it has a client on the other end of a wire; `?mp` is undeployable
  // until R7 re-planes that wire, so an enemy arm re-aimed here would be a
  // mechanism with no live consumer, measured against a policy nobody has
  // written yet.
  //
  // SO IT IS R7's, and it arrives with the thing it depends on: the round that
  // gives kernel types and states real wire rows is the round that can say
  // which of them project. A lane that re-aims it before then is choosing that
  // policy by accident.
  function recordPoseRow() {
    poseLog.push({
      t: simTick, // diagnostic stamp — the wave-boundary contiguity leg pins
                  // rows one tick apart; rowForAge still addresses relatively
      ships: players.map((pl, s) => ({ x: pl.ship.x, y: pl.ship.y,
                                       alive: seatAlive(s) })),
      // vx,vy ride every row (corrective pass 2): a live-class (projected)
      // body's rebated sweep reconstructs the PRESENTED pose from its era
      // pose and era velocity — the frozen-NOW form was an aim assist
      // ---- THE TWO BODY ROWS ARE EMPTY LITERALS (S3b lane 3, commit D5) ---
      // The arrays they mapped are DELETED. They are written as `[]` rather
      // than dropped because the ROW'S SHAPE is a contract with every reader of
      // the ring — `sweepRebateSegment` reads `row.enemies`, the derived-state
      // leg pokes one in, and lane 2's own harness stages rows by hand. A key
      // that vanishes turns each of those into a `TypeError`; a key that reads
      // empty turns them into a loop that runs zero times, which is what the
      // retirement actually did.
      enemies: [],
      missiles: [],
    });
    if (poseLog.length > REWIND_ROWS) poseLog.shift();
  }
  // the row for an era `age` ticks before now — age 1 is the newest row.
  // Ages past the oldest held row CLAMP to the oldest: never extrapolate,
  // never miss silently. Null only while the ring is empty (before the
  // match's first encStep, when nothing existed to be seen or hit).
  function rowForAge(age) {
    if (!poseLog.length) return null;
    const i = poseLog.length - age;
    return poseLog[i < 0 ? 0 : i];
  }

  // Only the terminal dead screen freezes now: the shop is a persistent
  // panel and a wave clear is a banner over a live world — neither stops
  // the sim. ("cleared" must not freeze anyway: encStep's early return
  // would never let E.waveTick advance past E.clearTick.)
  const frozen = () => E.state === "dead";
  // (`queuedCount` RETIRED at commit D5 — it summed the unspawned shares of
  //  `E.groups`, production's wave schedule, which is deleted with the deal it
  //  belonged to. Its one reader was the FOES readout; see there.)
  // Prices derive from the BUYING seat's own rank — two seats holding
  // different ranks read different prices for the same row. The seat
  // defaults to localSeat(), which is what every panel/label caller means:
  // seat 0 in local play and on the server, the granted seat in net mode.
  // The sim and the wire encoder always pass an explicit seat.
  // `| 0` is not decoration: since the wire trims the trailing default run
  // off `ow` (server/snapshot.mjs), a decoded vector may be SHORTER than SHOP,
  // and a missing entry means rank 0 — never `undefined`. Both callers below
  // do arithmetic on this result, so an undefined here prints NaN prices.
  const rankAt = (i, seat) => { const S = E.seats[seat]; return S ? S.owned[i] | 0 : 0; };
  // ---- D38's BUILD TOTAL (the SEVENTH AMENDMENT, S4 fix 10) ---------------
  // *"If turned on it sums PRESENT seats' purchases."* Σ `rankAt(i, seat)` over
  // the eight SHOP rows, for the seats that are CLAIMED AND NOT PARKED — the
  // same sentence D14's budget counts by, and `absent` is production's own word
  // for the second half of it (`parkSeat` and `unseatSeat` both reach it through
  // `vacateSeat`; `reseatSeat` clears it). A parked seat's ranks do not count:
  // nobody is flying them.
  //
  // COMPUTED HERE because the shop is this plane's and the kernel reads no
  // production surface (the S3b-C rule). It crosses as ONE scalar, pushed by
  // `poseKernelSeats` beside the presence flags and read by `bossHull` at the
  // deal. A DEAD seat and a seat waiting on its claim click both count — the
  // build is bought and the player is there; only an EMPTY seat is not.
  const presentPurchases = () => {
    let n = 0;
    for (let s = 0; s < E.seats.length; s++) {
      const S = E.seats[s];
      if (!S || S.absent) continue;
      for (let i = 0; i < SHOP.length; i++) n += rankAt(i, s);
    }
    return n;
  };
  const shopCost = (i, seat = localSeat()) => SHOP[i].curve === "double" ? SHOP[i].base * Math.pow(2, rankAt(i, seat)) : SHOP[i].base;
  const shopMaxed = (i, seat = localSeat()) => SHOP[i].cap !== undefined && rankAt(i, seat) >= SHOP[i].cap;
  // What a row COSTS, as the player reads it. Both places that print a price —
  // the gutter card and the field hover panel — call this, so the two cannot
  // disagree: a row that says MAXED on its card must not say "64 XP" on the
  // panel naming that same card.
  //   ...AND A SPENT CARD SAYS SO (PORT-S S8). A card the seat has already
  // bought used to print the price of its NEXT rank — shopCost doubled at the
  // sale — which is an invitation to a click the gate then refuses with
  // `denied`. The card is dimmed (S7) and now it is also LABELLED.
  //   THE ORDER IS THE RULE. MAXED comes first because it is the stronger
  // fact: a card bought to its cap carries both bits, and "you cannot buy any
  // more of this ever" outranks "you cannot buy this one again".
  //   CATALOG IN, SLOT OUT. Every price derivation here is catalog-addressed
  // and the spent bit is SLOT-addressed, so the hand is what bridges them —
  // and it bridges unambiguously, because a hand cannot repeat a card
  // (dealHand throws on a repeat; dealSeatHand splices from a pool).
  const shopSpent = (i, seat) => {
    const S = E.seats[seat];
    if (!S || !S.hand) return false;
    const k = S.hand.indexOf(i);
    return k >= 0 && !!S.bought[k];
  };
  const shopPriceLabel = (i, seat = localSeat()) =>
    shopMaxed(i, seat) ? "MAXED"
    : shopSpent(i, seat) ? "SOLD"
    : (!SHOP[i].can || SHOP[i].can(seat)) ? shopCost(i, seat) + " XP"
    : "—";

  // The nearest LIVING seat to a point, or -1 when every seat is down.
  // Ascending scan with a strict < keeps the settled tie-break: two ships
  // exactly equidistant resolve to the lower seat id, deterministically.
  //
  // THE SELECTION ITSELF IS Engine.acquire (P8) — D18's shipped consumer, and
  // the proof that the primitive is load-bearing rather than dead code. The
  // candidates are handed over in ASCENDING seat order, which is what carries
  // the tie-break across: acquire keeps a strict `<`, so the lower seat id
  // still wins an exact tie. The class is SHIP and the mask is the default, so
  // D25's boundary applies here as it will to every later consumer — this
  // function is where "which B do I choose" stops having a second copy.
  //
  // THE POLICY IS DECLARED RATHER THAN DEFAULTED (PORT-S S3a). Every field
  // below says something this call site is entitled to say, and the whole
  // record is stated so a reader never has to work out which silence was a
  // decision:
  //   mask     SHIP, because D18's ruling is "nearest living SHIP" and the seat
  //            roster is ships and nothing else. It admits exactly the set the
  //            default admitted here, so the narrowing moves nothing today; it
  //            just stops the seat pick from inheriting a rule about weapons.
  //   metric   EUCLIDEAN, EXPLICITLY. Production's world has WALLS — clampWorld
  //            is the whole boundary story and there is no seam to go round —
  //            so the straight line IS this world's topology-aware distance.
  //            That is a claim about THIS world, and after S3a the same
  //            authority also serves a toroidal one, so it is stated here where
  //            the world is known instead of being assumed inside the selector.
  //   no priority, no exclusion: D18 declined both. Owner-ruled 2026-08-25 —
  //            sticky aggro and a threat table were offered and refused, and
  //            "positioning stays the whole game" is the reason. The commitment
  //            window that does exist (e.aggroT) lives on the BODY, hashed,
  //            never inside the selector.
  const NEAREST_SEAT_POLICY = {
    mask: Engine.CLASS.SHIP,
    metric: Engine.METRIC.EUCLIDEAN,
  };
  function nearestSeat(x, y) {
    const cand = [];
    for (let s = 0; s < players.length; s++) {
      const p = players[s].ship;
      cand.push({ cls: Engine.CLASS.SHIP, live: seatAlive(s), seat: s, x: p.x, y: p.y });
    }
    const hit = Engine.acquire(x, y, cand, NEAREST_SEAT_POLICY);
    return hit === null ? -1 : hit.seat;
  }
  // Which player an entity acts against, from the asker's position: the
  // nearest living ship, or NULL with every seat down — callers take the
  // existing no-target path then, never throw. Enemies do not call this
  // directly for their chase: their CHOSEN target lives on the body
  // (e.tgtSeat, hashed) and moves only at decision points — see targetOf.
  const targetPlayer = (x, y) => {
    const s = nearestSeat(x, y);
    return s < 0 ? null : players[s];
  };
  // an enemy's committed target, or null when that seat is dead/none chosen
  const targetOf = (e) => (e.tgtSeat >= 0 && seatAlive(e.tgtSeat) ? players[e.tgtSeat] : null);

  function clampWorld(x, y, r) {
    // SHIP_R is the default now — it was `ECFG.enemy.r`, the dart's radius,
    // which went with the roster at commit D4. Every surviving caller passes
    // SHIP_R explicitly, so the default is a floor rather than a live path.
    const m = (r || SHIP_R) + 1;
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

  // signed difference between two bearings, always in (−π, π]. atan2 of the
  // sine and cosine rather than subtract-and-wrap: there is no ±π seam to get
  // wrong, which is where the single most common heading bug lives. The
  // anvil's facing and its shield arc both read this.
  function angDiff(a, b) {
    const d = a - b;
    return Math.atan2(Math.sin(d), Math.cos(d));
  }

  // (`predictAim` RETIRED at commit D4 — the RADAR LATCH's aim solver, which
  // read `ECFG.radar` and led a shot against the body's chosen target. The
  // radar tier went with the roster; the successor plane leads its own shots
  // through `leadTarget` in js/demo-kernel.js.)

  // ---- THE RE-ENTRY ANCHOR (PORT-S S3b lane 3, commit D4) -----------------
  // `rollAnchor` had TWO callers and only one of them was the enemy plane's.
  // The other is `respawnSeat`, and its rule is production's own: A RETURNING
  // PILOT IS DEALT OFF-SCREEN FROM ITS OWN WRECK, which is what stops a
  // three-XP corpse run from being a refund. So the seat arm survives under
  // its own name and the deal arm goes with the deal.
  //
  // TWO OF THE THREE NUMBERS IT READ WERE THE ENEMY PLANE'S and are inlined
  // here at their retired values rather than left pointing at a deleted table:
  // `ECFG.spawnGap` was 48 px outside the view rect and `ECFG.minPlayerDist`
  // was the 90 px hold-off, both at commit C's x2.5 — 120 and 225. The third,
  // `ECFG.enemy.jitter`, was the spawn scatter and has no meaning for a seat
  // that is placed exactly; it is dropped, and the hold-off absorbs it.
  //
  // IT STILL DRAWS FROM `rand()`, in the same order, for the same reason it
  // always did: `respawnSeat` is reached from `encStep`'s claim loop and the
  // seeded stream's position is hashed state.
  const REENTRY_GAP = 120;   // px outside the view rect — was ECFG.spawnGap x2.5
  const REENTRY_HOLD = 225;  // px of hold-off from the nearest living ship — was minPlayerDist x2.5
  function reentryAnchor(owner) {
    const s = players[owner >= 0 && players[owner] ? owner : 0].ship;
    const rx = Math.max(0, Math.min(WW - FW, s.x - FW / 2));
    const ry = Math.max(0, Math.min(WH - FH, s.y - FH / 2));
    for (let tries = 0; tries < 24; tries++) {
      const edge = Math.floor(rand() * 4);
      const t = rand();
      let x, y;
      if (edge === 0) { x = rx - REENTRY_GAP; y = ry + t * FH; }
      else if (edge === 1) { x = rx + FW + REENTRY_GAP; y = ry + t * FH; }
      else if (edge === 2) { x = rx + t * FW; y = ry - REENTRY_GAP; }
      else { x = rx + t * FW; y = ry + FH + REENTRY_GAP; }
      const c = clampWorld(x, y, SHIP_R);
      // a rectangle pinned against a world wall clamps this edge's candidate
      // back INSIDE it — reject it, another edge always has room
      const inRect = c.x > rx && c.x < rx + FW && c.y > ry && c.y < ry + FH;
      // the hold-off is against the NEAREST living ship: if the nearest one
      // clears the ring, every ship does
      const tgt = targetPlayer(c.x, c.y);
      if (!inRect && (!tgt || Math.hypot(c.x - tgt.ship.x, c.y - tgt.ship.y) >= REENTRY_HOLD)) return c;
    }
    // no candidate — the seat's own position stands in
    return clampWorld(s.x + REENTRY_HOLD + REENTRY_GAP, s.y, SHIP_R);
  }

  // ---- THE SPAWN PLANE IS RETIRED (S3b lane 3, commit D4) ----------------
  // `rollAnchor`, `rollGroupPoints`, `makeBody`, `spawnEnemy` and `spawnGroup`.
  // Every one of them built a record for the seven-type roster D9 replaced —
  // `makeBody` alone stamped its `stats` off `statsFor`, its `mode` off the
  // seven-value vocabulary and its `arc`/`face` off the anvil's shield.
  //
  // WHERE THE GEOMETRY WENT, and it is not lost: the successor plane deals its
  // own arrivals through PORTALS placed by its director's `formationPoints`
  // and `spawnEnemy` in js/demo-kernel.js, off six NAMED RNG streams rather
  // than production's one `rand`. `rollAnchor`'s own rule — never inside the
  // camera rectangle, never closer than `minPlayerDist` to a pilot — is the
  // one piece with no direct counterpart there, and D8's shared director is
  // where that becomes a question again, at S4.

  // ---- combat ------------------------------------------------------------
  // hitPlayer takes a damage SOURCE again, and it is a DIFFERENT parameter
  // from the one that was deleted — same name, new reader, and the difference
  // is the thing to keep straight.
  //
  // ITS FIRST LIFE: a seat NUMBER meaning another player dealt the blow, read
  // by the death branch to decide whether the victim paid the toll — a PvP kill
  // took the score and the purchases, a PvE death took neither. The user
  // reversed that rule, the toll went unconditional, the parameter had exactly
  // zero readers left, and it was deleted rather than kept as a lie.
  //
  // ITS SECOND LIFE: a RECORD, `{ kind, cls, seat }`, describing what hit the
  // seat. D28 creates the reader — the comet's refusal is source-scoped (which
  // damage) and not state-scoped (is the burn up), so the gate has to know
  // whether it was a ram. THE TOLL IS STILL UNCONDITIONAL. Nothing about this
  // parameter reaches the death branch, and nobody may route it there again on
  // the strength of the name.
  //
  //   kind  the effect kind — "ram", "beam", "shot", "blast". The comet
  //         refusal reads it through Engine.isContact; the matrix keys on it.
  //   cls   the source's CLASS, which the matrix keys on beside the kind.
  //   seat  the rival's seat where there is one. Carried, and deliberately not
  //         handed to the door — see the payload note below.
  //
  // Omitting it entirely is legal and means UNCLASSIFIED: no comet refusal (an
  // unproven source is not a proven contact) and no matrix consultation. Two
  // callers do that on purpose and the scan leg names both.
  //
  // Nothing on the wire has ever said why a seat died, which is still what lets
  // the client draw one neutral down card for every death.
  function hitPlayer(seat, dmg, src) {
    const S = E.seats[seat];
    if (!S || S.hull <= 0) return false; // a dead seat cannot be hit again — respawn revives it
    // COMET MODE refuses BODY-CONTACT damage, and only that (D26 + D28). No
    // hull loss, no i-frame consumption, no hitFlash — the refusal reads
    // exactly like a graced hit to the ramming caller. cometActive is game.js's
    // read of the seat's hashed comet flag. The refusal is WORK, so it bills
    // COMETHIT — one half of the same knob contactEvent's ram pays, and inert
    // at the shipped 0.
    //
    // IT USED TO REFUSE EVERYTHING, and the narrowing is the ruled change.
    // D26 makes the comet a DAMAGE SOURCE rather than a shield: protection
    // becomes EMERGENT, because a threat the burn destroys never lands and a
    // threat it cannot destroy does. D28 then keeps ONE exemption and no other
    // — the ram — because the ram is the comet's ATTACK and its exchange
    // already ships: the body pays COMETDMG * fury, the pilot pays COMETHIT.
    // Refusing the pilot's hull side keeps that exchange whole instead of
    // carving a hole in a new one. So the whole ability now states itself in
    // one line: A COMET IS HURT BY EXACTLY WHAT IT CANNOT DESTROY.
    //
    // WHAT NOW LANDS ON A BURNING PILOT: the lance pulse (a beam has no body,
    // so nothing can ever intercept it — this is the case the owner named),
    // seeker detonations, a rival's rounds, and D1's splash. The aura that is
    // supposed to eat the destructible half of that list arrives at PORT-S; R6
    // brings the hp filter it reads. Between here and there a burning pilot is
    // genuinely more fragile, and §2.11 prices the 62-tick grace re-examination
    // into the comet feel round rather than into this one.
    //
    // WHY THE PARAMETER CAME BACK. The refusal is SOURCE-scoped (which damage)
    // and not STATE-scoped (is the burn up), so it needs to know what hit the
    // seat. `Engine.isContact` is the declaration; the GATE stays here, because
    // a grandfather never moves into the door. And note what did NOT come back:
    // the death-branch toll below is still UNCONDITIONAL. The parameter's first
    // life selected the toll, the owner reversed that rule, and this reader is
    // a different one — do not resurrect the conditional toll from it.
    if (cometActive(seat) && Engine.isContact(src && src.kind)) {
      energySpend(seat, COMETHIT);
      return false;
    }
    if (S.invuln > 0 || E.state === "dead") return false;
    // The player-hull leg of the funnel. The three gates ABOVE stay here and
    // stay exactly as shipped, because R5 moves the subtraction and never a
    // gate. Only the first of them is a GRANDFATHER in the door's prevention-
    // rule sense — the comet negation, which skips the event yet bills
    // COMETHIT. The dead-seat and invuln refusals are ordinary gates and were
    // never grandfathered: nothing about them predates the rule.
    //
    // THE MATRIX CONSULTATION IS LIVE ON THIS LEG NOW. Every production caller
    // hands `src` a kind and a class (the source-scan leg in test/node-golden
    // pins that), so the rows this file's damage paths need are real rules
    // rather than a record: ram BODY->SHIP and SHIP->SHIP, beam BODY->SHIP,
    // shot SHIP->SHIP and ORDNANCE->SHIP, blast SHIP->SHIP.
    //
    // A caller with NO src is UNCLASSIFIED and skips the consultation, which is
    // the `hit` kind's whole remaining job. Two callers are deliberately there
    // and both are named in the scan leg: the server's dev-only seat-down
    // lever, whose kill is unconditional by design, and the __test
    // damagePlayer seam.
    //
    // THE SOURCE SEAT IS WITHHELD FROM THE DOOR, on purpose. `src.seat` is real
    // and this function keeps it, but the payload below passes the CLASS only,
    // so `statSource` and `credit` stay undefined and the funnel's credit guard
    // declines. A seat record has no `lastAtk` and must not grow one behind
    // SEAT_HASH's back — that allow-list is walked per seat, so a stray key
    // would be unhashed state sitting on hashed record. The day a ship-class
    // effect wants credit, the answer is a declaration beside the matrix.
    const landed = Engine.applyEffect({ kind: src ? src.kind : "hit", target: S,
                                       tgtCls: Engine.CLASS.SHIP,
                                       source: src ? { cls: src.cls } : undefined,
                                       baseAmount: dmg });
    // A REFUSED event is a SKIP, and the gates below are why the return has to
    // be read: they sit AFTER the subtraction, so ignoring a refusal would burn
    // an i-frame, paint a hitFlash and bill hitsTaken for damage that never
    // happened. Every shipped row is on, so this cannot fire today — it is what
    // makes turning a row OFF a real refusal rather than a zero-damage hit.
    if (landed === null) return false;
    E.hitsTaken++;
    S.invuln = ECFG.player.invuln;
    S.hitFlash = 20;
    if (S.hull <= 0) {
      S.hull = 0;
      // the seat is down: its ship parks where it died and leaves the fight
      // (targeting, sweeps, input and pickup all skip dead seats), and the
      // WHOLE RUN is forfeit — wallet, score, ranks, bought hull cap and the
      // bounty on the floor, all of it inside deathToll.
      // The call is UNCONDITIONAL now. It used to hang off
      // `typeof src === "number" && src >= 0`, so only a player's killing
      // blow collected; the waves killed you for free. The user's rule is
      // that nobody keeps their upgrades, their hull cap or their score
      // through a death, so the gate is gone rather than widened — a gate
      // that is always true is a gate that lies about having a condition.
      // The bounty rides every death too, deliberately: a solo player can
      // fly back for the PVPORBS orbs, but respawnSeat deals the seat
      // OFF-SCREEN from its own wreck, so recovering ~3 XP against a whole
      // run is a corpse run, not a refund. The user was told that and chose
      // it.
      players[seat].vel.x = 0;
      players[seat].vel.y = 0;
      deathToll(seat);
      // The respawn deal: the seat waits out the timer and re-enters —
      // unless the quarter rule is in force. With lobby waiters standing,
      // each death consumes one life from the seat's stock, and an
      // exhausted stock parks the seat for phase 09 to hand to a waiter.
      if (E.lobbyWaiters > 0 && --S.stock <= 0) { S.stock = 0; S.respawnT = 0; }
      else S.respawnT = ECFG.player.respawn;
      // the whole MATCH ends only when no seat is alive AND none is coming
      // back — under the default (no waiters) that is unreachable in play
      if (!players.some((_, s) => seatAlive(s)) && !E.seats.some((R) => R.respawnT > 0)) {
        E.state = "dead"; // game step() freezes next tick; R restarts
      }
      // ...and the WIPE edge, armed on the death that emptied the field: with no
      // seat left standing the whole run is dealt back to a new one. It is armed
      // HERE, at the edge, because the decrement above is the only one in the tree — a
      // seat can only cross into "down" through this branch. A level scan in
      // encStep would read the same condition true for every tick of the dead
      // window and re-fire ~599 times, each firing reseeding rand through
      // startWave and pinning waveTick back at 0, so the wave it dealt could
      // never spawn anything. The edge fires once and encStep consumes it once.
      // The terminal "dead" state WINS: the check just above has already had
      // its say, and a match ended by the quarter rule keeps its death screen
      // rather than deal a fresh wave 1 behind it.
      // Corollary for the suites: a direct `E.seats[n].hull = 0` never arms
      // this. A check that wants the wipe kills through damagePlayer/hitPlayer.
      if (E.state !== "dead" && !players.some((_, s) => seatAlive(s))) E.wipePending = true;
    }
    // one cue per REGISTERED hit — the invuln early return above keeps graced
    // hits silent for free. The branch reads the state the block above just
    // settled, so a seat's killing blow plays death alone, never hurt-then-
    // death. Positioned on the ship that took the hit: the audio listener IS
    // that ship (att = 1, byte-identical cue outcome), and the wire needs the
    // point — stamped with the seat that paid.
    emit(S.hull <= 0 ? "death" : "hurt", players[seat].ship, undefined, seat,
         undefined, src && src.kind); // the sentinel's discriminator — see emit
    return true;
  }

  // THE COST OF DYING — every death, whatever killed you. This was
  // pvpDeathToll and it fired for a player's killing blow alone; the rename
  // is the rule change, because there is nothing PvP-specific left in it.
  // Called from hitPlayer's death branch alone, unconditionally. Five parts,
  // in order:
  //   wallet — the unspent XP, forfeit. It used to be zeroed by hitPlayer
  //            itself, one line above the old gated call; it lives HERE now
  //            so the cost of dying is stated in exactly one place and no
  //            reader has to check two. The order is unchanged.
  //   score  — reset to 0. Spending is still not un-scoring (buy() never
  //            touches it) — dying is the only thing that lowers a score,
  //            and now every death does, not just a PvP one.
  //   ranks  — resetSeatUpgrades: back to stock, termSeq++, and the
  //            termChange marker rides the SAME drained stream the death
  //            marker below it does. hitPlayer does not clear EVENTS (unlike
  //            restart), so both reach the wire from this one tick.
  //   hullMax— resetSeatUpgrades cannot undo MAX HULL: that purchase is a
  //            stored `+=` on the seat, not a derived term. Without this line
  //            a victim would keep every bought hull point through a reset
  //            that took the rank away. energyMax needs no twin: it is
  //            RE-DERIVED from the ranks every tick, so it self-heals.
  //   orbs   — PVPORBS standard 1-XP orbs at the death point, dealt with
  //            reapDead's exact shape (one seeded rand() drift per orb). The
  //            point is world-CLAMPED first, unlike the enemy drop: a seat
  //            can die pinned against a wall, and an unclamped drop would
  //            leave the bounty outside the world where nothing can reach it.
  // `best` is deliberately NOT here: the high-water score is what a death is
  // supposed to leave standing, and clearing it would take the leaderboard
  // down with the run.
  function deathToll(seat) {
    const S = E.seats[seat];
    S.xp = 0;
    S.score = 0;
    resetSeatUpgrades(seat);
    // ...and the MARKET's bought bits, cleared HERE and not inside
    // resetSeatUpgrades (D37, PORT-S S7). The ranks this line just took are
    // gone, so every card in the hand is BUYABLE AGAIN and a shelf still marked
    // spent would show the player something they can see and cannot use. THE
    // IDS STAY: a death does not reroll — the same four cards are what the seat
    // climbs back with, until the next clear deals it a new hand. The wipe and
    // restart() take the ids as well, at their own sites, because those two are
    // the events that end a run.
    S.bought = S.bought.map(() => 0);
    S.hullMax = ECFG.player.hull;
    const c = clampWorld(players[seat].ship.x, players[seat].ship.y, ECFG.orb.r);
    for (let k = 0; k < PVPORBS; k++) {
      const a = rand() * Math.PI * 2; // each drop dealt its own drift, exactly as reapDead deals one
      E.orbs.push({ id: nextId(), x: c.x, y: c.y, vx: Math.cos(a) * ECFG.orb.drift, vy: Math.sin(a) * ECFG.orb.drift });
    }
  }

  // ---- contactEvent, retargetAtDecision AND stepEnemy ARE RETIRED --------
  // PORT-S S3b lane 3, commit D4. Three of S3B-MAP's nine ENTANGLEMENTS, and
  // the largest block in the plane.
  //
  // `stepEnemy` (216 lines) WAS THE AI: nine archetypes' movement, their
  // telegraphs, their attacks and the seven-value `mode` machine they ran on.
  // D9 replaced the roster it drove; the successor plane has twenty-one
  // per-type state machines in js/demo-kernel.js, thirty-six states between
  // them, and its own `committedToALine` telegraph-honesty gate that five
  // vendor-cross rounds settled at lane 2.
  //
  // `retargetAtDecision` WAS THE AGGRO GRIEVANCE, and it is the one piece here
  // that DID survive — PORTED, not deleted. Lane 2 carried it into the kernel
  // whole: the hold on a committed body, the most-recent-attacker preference,
  // the consume-at-the-decision rule and `AGGRO.commit`'s 90-tick window are
  // all there, keyed off the same `lastAtk` the R5 funnel writes. What retires
  // is this COPY of it.
  //
  // `contactEvent` was ONE PRIMITIVE FOR EVERY SHIP-BODY TOUCH and it split
  // exactly where S3B-MAP said it would: its PLAYER side is `hitPlayer`, which
  // the successor plane reaches through the host's HURT ROUTE (commit A) with
  // a source record and every one of production's gates; its ENEMY side paid
  // BDMG into an `E.enemies` record and has nothing left to pay.

  // ---- THE SEEKER PLANE IS RETIRED (S3b lane 3, commit D4) ---------------
  // `spawnMissile`, `launchMissile`, `endMissile` and `stepMissiles` — the
  // harrier's ordnance. The successor plane's ordnance is one flat
  // `S.bullets` list discriminated by `team` and ~15 `kind` values, stepped in
  // js/demo-kernel.js, and it has no counterpart to any of this.

  // ---- BLAST CHARGE — the splash a terminating player bullet leaves --------
  // Rank 0 is off and blastAt() is a no-op; every rank above it reaches
  // BLASTR + BLASTGAIN × (rank − 1) px off the two weapons-tab sliders, read
  // LIVE so a drag retunes the next shot. Pure arithmetic on live state — no
  // rand(), no clock — so the seeded stream never notices a blast and the
  // wave's deal is identical whether the row was bought or not.
  // Per seat: the radius is the SHOOTING seat's rank, so seat 1's rank-3
  // splash never widens seat 0's shots. The default 0 keeps every
  // single-seat caller (the __test export included) on the local seat.
  const blastRadius = (seat = 0) => {
    const b = termsFor(seat).blast;
    return b > 0 ? BLASTR + BLASTGAIN * (b - 1) : 0;
  };
  // One instantaneous application at the impact point. `direct` is the body the
  // bullet itself just paid — excluded, so a hit is never double-dipped — and
  // every OTHER living body whose circle reaches the radius takes exactly one
  // bullet's damage, once.
  //
  // WHO A BLAST REACHES IS NOW THE MATRIX'S ANSWER, not this comment's. The
  // orbs and the missiles are still never touched at any rank — `blast ->
  // ORDNANCE` and `blast -> ORB` are declared OFF in js/engine.js, and the
  // reason is the one this comment always gave: a splash that swept ordnance
  // out of the air would quietly delete the harrier's whole threat.
  //
  // WHAT CHANGED IS THE PILOT. D1, owner-ruled: `blast -> SHIP` is ON at factor
  // 1.0, so a rival inside the radius takes exactly one bullet-equivalent, the
  // same as a body. It is the one deliberate behavior change in R5.
  // `captured` is the radius the terminating ROUND was fired with (standing
  // rule 5). Every bullet-terminated caller passes it; a caller with no round
  // behind it omits it and the live rank sizes the splash, which is the same
  // arithmetic this function has always done. The enumeration is in the commit.
  // `directSeat` is the SEAT the terminating round already paid, excluded for
  // exactly the reason `direct` excludes a body: a hit is never double-dipped.
  // It is an EXPLICIT exclusion and not an inference from the victim's fresh
  // i-frame — the grace is behavior that a retune may change, while "the thing
  // the bullet already paid does not also pay the splash" is a contract.
  function blastAt(x, y, direct, dmg, attacker, captured, directSeat) {
    const R = captured === undefined ? blastRadius(attacker) : captured;
    if (R <= 0) return;
    // ---- THE KERNEL ARM (PORT-S S3b lane 3, commit B) ---------------------
    // The same splash, over the successor plane's bodies, with the same three
    // rules: the DIRECT hit does not pay twice, a corpse is nobody's, and the
    // body CIRCLE has to intersect the blast rather than its centre. `direct`
    // is compared by reference and a kernel body reaches this function as
    // `direct` from the sweep above, so the exclusion works across both planes
    // with no second parameter.
    //
    // THE CAUSE IS `blast`, DECLARED. It reaches the kernel's door under that
    // name, which consults the matrix's blast SHIP -> BODY row and — as
    // production's own anvil precedent has always had it — bypasses that body's
    // DIRECTIONAL shield, because a splash arrives from no direction. Under
    // the door's old two-way cause test this would have been reclassified a
    // `shot` and taken the bulwark's frontal reduction; commit B replaced that
    // test with a declared table for exactly this arrival.
    //
    // A REACH IS NOT A HIT COUNT: `hitsDealt` is not incremented, on the enemy
    // half's own rule directly below — a blast that paid a statistic per body
    // in reach would make one shot read as five hits.
    if (window.EncounterHost && attacker !== undefined) {
      const kbodies = EncounterHost.bodies();
      for (let i = 0; i < kbodies.length; i++) {
        const ke = kbodies[i];
        if (ke === direct || ke.dead || ke.hp <= 0) continue;
        const kdx = ke.x - x;
        const kdy = ke.y - y;
        const kreach = R + ke.r;
        if (kdx * kdx + kdy * kdy <= kreach * kreach) {
          EncounterHost.damageKernelBody(ke, dmg, x, y, attacker, "blast");
        }
      }
    }
    // (the PRODUCTION-BODY splash arm is DELETED at commit D5 with the array it
    //  walked. The successor plane's arm is directly above it, and it is the
    //  one commit B wrote — same radius rule, same one-payment-per-body rule,
    //  the credit through the R5 funnel. Two arms over one live list and one
    //  empty one was the shape the deletion had left.)
    // ---- D1: the PvP splash ------------------------------------------------
    // The row is consulted HERE as a GATE — "is this pairing on at all" — and
    // the FACTOR is applied by the door, once. Reading the answer as a number
    // and multiplying by it here would apply it twice; that is exactly the
    // defect the 0.5 leg caught, and it was invisible while every row was 1.0.
    //
    // The damage goes through hitPlayer, deliberately, so a splashed pilot
    // meets the SAME gates as any other incoming damage — invuln, the comet
    // negation, the dead state — instead of a second player-damage path that
    // would have to re-learn all three. That is also why the funnel is not
    // called here directly: hitPlayer IS the ship leg of the funnel.
    //
    // hitsDealt is NOT incremented. The enemy half of this same function has
    // never counted its splash either, and a blast that pays a statistic per
    // body in reach would make one shot read as five hits.
    const pvp = Engine.mayHit("blast", Engine.CLASS.SHIP, Engine.CLASS.SHIP);
    if (pvp > 0) {
      for (let s = 0; s < players.length; s++) {
        // the shooter's own seat, excluded by the SELF_SPLASH declaration
        // rather than by a condition — a later flip is a data edit there
        if (s === attacker && !Engine.selfSplash()) continue;
        if (s === directSeat) continue; // the round already paid this seat
        if (!seatAlive(s)) continue; // a corpse is respawnSeat's, not ours
        const p = players[s].ship;
        const dx = p.x - x;
        const dy = p.y - y;
        const reach = R + SHIP_R; // the HULL circle has to intersect, exactly as a body's does
        // the RAW amount: the door applies the factor, and pre-multiplying here
        // would apply it twice (invisible at 1.0, wrong at every other value)
        if (dx * dx + dy * dy <= reach * reach) {
          hitPlayer(s, dmg, { kind: "blast", cls: Engine.CLASS.SHIP, seat: attacker });
        }
      }
    }
    spawnImpactFx(x, y, 0, -1, "blast", R); // visual only — sized to the radius the sim just used
    // below the R <= 0 return, which is what makes this cue mean "the
    // upgrade you bought went off" and never a phantom at rank 0. The seat is
    // the splash's source, so two seats' blasts do not share one throttle
    emit("blast", { x, y }, undefined, attacker);
  }

  // The comet ram against another PLAYER. A new collision family: contactEvent
  // cannot be reused, because it takes an ENEMY BODY and mutates that body's
  // hp, cooldown, claim and aggro — none of which a seat has.
  //
  // The sweep runs in the RELATIVE FRAME: the attacker's travel MINUS the
  // victim's, against a hull-vs-hull disc of SHIP_R * 2 sitting at the
  // origin. That is the exact swept test for two discs moving linearly across
  // one tick, and it is exact at EVERY speed. COMETAOEDMG does not widen it:
  // the halo's forgiveness radius is a lab candidate answering an
  // enemy-facing miss problem, and handing it to the PvP ram would price a
  // decision nobody has made yet.
  //
  // The cheaper version this file carried first — sweep the attacker against
  // the victim's CURRENT position, and call two ships too slow to tunnel —
  // is WRONG, and measurably so. The box is SHIP_R * 2 = 14 px, not the 28 a
  // "combined disc" reading suggests, and comet top speed is
  // (VMAX + terms.speed) x COMETVMAX with AFTERBURNER UNCAPPED (its shop row
  // says so: "the CAP is uncapped — the doubling price is the brake"). Two comets
  // crossing at right angles miss each other outright under the attacker-only
  // sweep from 20 px of travel each per tick — AFTERBURNER rank 5, which is
  // 124 XP and an ordinary mid-run purchase, not a whale.
  //   D50 (PORT-F) MOVED THE PARTS AND NOT THE ARGUMENT. VMAX is 4.0833 and
  // COMETVMAX is 15/VMAX, so a rank-0 comet still travels 15 px per tick and
  // rank 5 travels MORE than it did (16.5833 x 3.6735 = 60.9 against 55.0):
  // the speeds this block calls too fast for an attacker-only sweep only rose. The relative frame
  // costs one subtraction per pair and has no such speed at all.
  //
  // Pacing is one bite per ORDERED pair per COMETCD window, held in E.pvpCd.
  // The window is stamped on a REGISTERED bite and ALSO on a comet-negated
  // one: without the second stamp two overlapping comets would re-bill each
  // other's COMETHIT on every tick of the overlap. A GRACED strike (the
  // victim's i-frames) deliberately does NOT stamp — the enemy side's rule is
  // that an i-framed ram still bites the moment the grace ends, and a melee
  // tactic should not be able to buy itself out of a window by hitting too
  // early. At COMETCD 0 the pair bites once per tick, and no second stamp is
  // needed to make that safe: unlike the enemy side, this is the ONLY sweep
  // site for a pair on a tick, so a 0 window cannot bill one touch twice —
  // and no key is WRITTEN at 0 either, because a 0 is falsy at the gate and
  // would be deleted at the next expiry, so storing it would put a key that
  // decides nothing into the hash. "Sparse by construction" has to be
  // literally true for the zero-bytes rule to be worth anything.
  //
  // Every pose here is LIVE-time. Phase 15 owns lag compensation; a rewound
  // resolution would change what this function reads, never what it decides.
  function resolvePvpRams() {
    const cd = E.pvpCd;
    // expire first, so a window stamped N ticks ago opens on exactly the Nth
    // tick after it — and so the store empties (and stops hashing) on its own
    for (const k in cd) { if (--cd[k] <= 0) delete cd[k]; }
    for (let a = 0; a < players.length; a++) {
      if (!cometActive(a) || !seatAlive(a)) continue;
      const pa = prevOf(a);
      const sa = players[a].ship;
      for (let v = 0; v < players.length; v++) {
        if (v === a || !seatAlive(v)) continue;
        const key = a + ":" + v;
        if (cd[key]) continue; // this pair's window is still open
        const sv = players[v].ship;
        const pv = prevOf(v); // ...and the victim's own travel, differenced out below
        if (!segCircleHit(pa.x - pv.x, pa.y - pv.y, sa.x - sv.x, sa.y - sv.y,
                          0, 0, SHIP_R * 2)) continue;
        // the enemy side's exact OVERLOAD formula, computed HERE: hitPlayer
        // stays a dumb primitive that applies the number it is handed
        const fury = 1 + COMETFURY * termsFor(a).fury * (1 - energyFrac(a)); // the RAMMING seat's own rank
        // BODY CONTACT, the second of the two: hull on hull, this time between
        // two ships. D28's exemption covers it exactly as it covers the enemy
        // ram, so a burning VICTIM still refuses — which is what keeps the
        // mutual-negation legs and pvp-clash standing.
        if (hitPlayer(v, COMETDMG * fury, { kind: "ram", cls: Engine.CLASS.SHIP, seat: a })) {
          energySpend(a, COMETHIT); // the ram half of the knob, mirroring contactEvent
          if (COMETCD > 0) cd[key] = COMETCD;
        } else if (cometActive(v)) {
          if (COMETCD > 0) cd[key] = COMETCD; // negated, not graced — stamp, or the
                                              // overlap re-bills COMETHIT every tick
        }
      }
    }
  }

  // ---- THE COMET'S BODY RAM, RESTORED (S3b lane 3, FIX 2 / S3BR-02) ------
  // WHAT THE RETIREMENT LOST, precisely. The deleted `contactEvent` was ONE
  // primitive for every ship-body touch and it paid BOTH sides. Its PLAYER side
  // survives — the successor plane's own contact pass reaches production's
  // `hitPlayer` through the host's HURT ROUTE, and D28's refusal correctly
  // protects a burning pilot there. Its BODY side did not survive, so a burning
  // ship passing through a body lost no hull AND dealt no damage: the shipped
  // ATTACK had become a defensive invulnerability mode. The `comet-run` trace
  // rams a dart dead; nothing in the tree could do that any more.
  //
  // THIS IS THE RAM AND ONLY THE RAM. The seat's scoping, recorded so a reader
  // does not go looking for the other half: **the D26 AURA — the persistent
  // area pass that kills hp-bearing ordnance — is S5's scheduled unit and is
  // NOT built here.** `js/engine.js`'s `AURA_PASS_SLOT` block assigned that
  // pass, with its ordering rule, to S5 — and S5 BUILT IT. The aura lives in
  // js/demo-kernel.js's `resolveCometAura`, at the seam inside `updateBullets`,
  // and this file's own contribution is the staged-child flush below
  // `reapRamClaims`. The anchor here read `js/engine.js:1316-1325`, which is
  // the ORB registry row; the pass-order law is the `AURA_PASS_SLOT` block.
  // Both corrected at PORT-S S5 commit H.
  //
  // AND THE NON-BURNING ARM IS NOT RESTORED EITHER, deliberately. The old
  // primitive also paid BDMG into the body on an ORDINARY ram. That was
  // production's rule for production's own bodies; the successor plane's
  // contact model is its own — the pilot pays, the body takes a 110-unit
  // knockback and pays nothing — and D29's "ram free" is the ruling that
  // settled it. Reinstating BDMG here would be re-deciding that behind S4.
  //
  // WHY IT LIVES IN PRODUCTION AND NOT IN THE KERNEL'S CONTACT BLOCK. The
  // comet is production's ability: its arm state, its OVERLOAD rank, its energy
  // pool and its `COMETDMG`/`COMETFURY`/`COMETHIT` knobs are all on this side.
  // Putting the test in the kernel would mean exporting four production
  // concepts across the seam so the kernel could re-derive an answer production
  // already has. This pass is `resolvePvpRams`'s twin in every respect and sits
  // beside it: the same relative-frame sweep, the same `E.pvpCd` pacing, the
  // same fury formula, the same `COMETHIT` billing.
  //
  // IT GOES THROUGH THE ONE DOOR. `EncounterHost.damageKernelBody` is the only
  // way this file may hurt a successor body (commit B), and the seat rides it
  // as the credit — so `lastAtk`, lane 2's aggro grievance and the kill cue all
  // read a comet kill exactly as they read a bullet kill. A direct
  // `Engine.applyEffect` here would be the second authority commit B's own
  // block refuses.
  //
  // AND IT SITS INSIDE THE DEATH WINDOW, before the bullet pass — which is the
  // keeps-half order S3B-MAP names: "a ram kill still lands before the bullet
  // pass". A body rammed dead is marked here and reaped at the flush.
  function resolveCometBodyRams() {
    const KH = typeof window !== "undefined" && window.EncounterHost
      && window.EncounterHost.installed() ? window.EncounterHost : null;
    if (!KH) return;
    const bodies = KH.bodies();
    if (!bodies.length) return;
    const cd = E.pvpCd; // expired by resolvePvpRams above, on the same tick
    // ---- THE CLAIM IS THE BODY'S (FIX 14 / the final review's HIGH) --------
    // FIX 2 keyed the window `a + ":b" + id` — one claim PER ATTACKER per body.
    // That is not the contract the retirement is restoring. The deleted
    // `contactEvent` stamped `e.contactCd` and `e.contactTaken` ON THE BODY, so
    // ONE claim covered the body however many seats were burning, and the
    // measured cost of the per-attacker shape was exact: two seats billed one
    // body in one window for damage 6 against a contract of 3, with
    // `contactsDealt` moving twice.
    //
    // SO THE KEY IS THE BODY ALONE — `"b" + e.id` — and the loops invert with
    // it: BODIES OUTER, SEATS INNER, ascending. The nesting is the claim rule
    // written as control flow rather than asserted beside it: the window is
    // read once per body, the first seat that lands takes it, and the `break`
    // is what "one claim per window regardless of how many seats burn" means.
    // ASCENDING SEAT ORDER is the tiebreaker, which is the pinned order every
    // per-seat walk in this file already keeps.
    //
    // AND IT SHARES `E.pvpCd` RATHER THAN OPENING A SECOND STORE. That store is
    // hashed, guarded (zero bytes when empty), expired by one loop and cleared
    // by restart and by the wipe; a parallel store would need all five of those
    // again and would be a second answer to "is this window open". `"b7"` is a
    // key no `a:v` seat pair can spell.
    //
    // WHY NOT A FIELD ON THE BODY, which is what the retired plane had: a
    // kernel body is EVERY-OWN-KEY serialized, so `e.contactCd` on a successor
    // body re-keys `tests/fixtures/demo-bounded-reference` — S3a's STOP class,
    // and the same rule the pose-driven flag and FIX 1's death mark both obey.
    // The claim therefore lives on PRODUCTION'S side and is made to DIE WITH
    // THE BODY by `reapRamClaims` below, which is the half a bare key would
    // have lost.
    for (let i = 0; i < bodies.length; i++) {
      const e = bodies[i];
      if (e.dead || !(e.hp > 0)) continue;
      const key = "b" + e.id;
      if (cd[key]) continue; // the body's window is open — no seat may bill it
      for (let a = 0; a < players.length; a++) {
        if (!cometActive(a) || !seatAlive(a)) continue;
        const pa = prevOf(a);
        const sa = players[a].ship;
        // THE RELATIVE FRAME, exactly as the PvP ram uses it and for the same
        // measured reason: an attacker-only sweep misses outright once both
        // parties are fast. `px`/`py` are the body's PREVIOUS tick pose — the
        // kernel writes them before it integrates, which is the property the
        // pose bridge's own leg pins.
        const ex = Number.isFinite(e.px) ? e.px : e.x;
        const ey = Number.isFinite(e.py) ? e.py : e.y;
        if (!segCircleHit(pa.x - ex, pa.y - ey, sa.x - e.x, sa.y - e.y,
                          0, 0, SHIP_R + (e.r || 0))) continue;
        // the RAMMING seat's own rank, the enemy side's exact OVERLOAD formula
        const fury = 1 + COMETFURY * termsFor(a).fury * (1 - energyFrac(a));
        if (KH.damageKernelBody(e, COMETDMG * fury, sa.x, sa.y, a, "ram")) {
          energySpend(a, COMETHIT); // the ram half of the knob, as contactEvent billed it
          E.contactsDealt++;        // the counter the retired primitive moved
          if (COMETCD > 0) cd[key] = COMETCD;
          break;                    // the body is claimed — see the block above
        }
      }
    }
  }

  // ---- THE CLAIM DIES WITH THE BODY (FIX 14) -------------------------------
  // The retired contract's second half, and the one a bare key cannot keep on
  // its own: `e.contactCd` lived ON the body, so a reaped body took its window
  // with it. A key in `E.pvpCd` does not — it would sit in HASHED state for the
  // rest of the window describing a body nobody can touch, and a fresh body
  // that reused the id would inherit a window it never earned.
  //
  // IT RUNS IMMEDIATELY AFTER THE DEATH FLUSH, which is where bodies actually
  // die now (FIX 1). "The field dies with the reaped body" is then true in the
  // same tick and not one tick later, which is what makes it the same contract
  // rather than an approximation of it.
  //
  // ONLY `b`-PREFIXED KEYS ARE WALKED. The seat-pair windows in the same store
  // belong to `resolvePvpRams` and are paced by ships, which do not get reaped.
  function reapRamClaims() {
    const cd = E.pvpCd;
    let live = null;
    for (const k in cd) {
      if (k.charCodeAt(0) !== 98 /* 'b' */) continue;
      if (live === null) {
        live = new Set();
        const KH = typeof window !== "undefined" && window.EncounterHost
          && window.EncounterHost.installed() ? window.EncounterHost : null;
        if (KH) {
          const bs = KH.bodies();
          for (let i = 0; i < bs.length; i++) if (!bs[i].dead && bs[i].hp > 0) live.add(bs[i].id);
        }
      }
      if (!live.has(+k.slice(1))) delete cd[k];
    }
  }

  // Bullets arbitrate against enemies, missiles AND other players' ships in
  // ONE first-along-the-path pass. Several passes could each hand the same
  // bullet a target and bill it twice; one pass means the NEARER thing always
  // wins and a bullet is consumed exactly once, whichever family it stopped
  // on. The three classes join the SAME running `bestT` minimum under a
  // strict `<`, so the tie order is the order they are tested in: enemies
  // first, then missiles, then ships — a ship LOSES an exact tie against
  // either, which is deliberate and is the only thing the ordering decides.
  function resolveBulletHits() {
    for (const b of G.bullets) {
      const shooter = b.dead ? -1 : bulletSeat(b); // owner is a SEAT id now;
                       // the legacy "player" string reads as seat 0 (bulletSeat)
      if (shooter < 0) continue;
      let bestT = -1;
      // (`hit`, the PRODUCTION-BODY winner, is deleted at commit D5 with the
      //  array it was drawn from. Two winner classes are left.)
      let vs = -1;      // ...the VICTIM SEAT, when another player's hull is
      let kb = null;    // ...or the KERNEL BODY, when the successor plane's is
      let kr = null;    // ...or the KERNEL ROUND, when D51's ordnance arm wins
      // ---- THE KERNEL ARM, FIRST IN THE ORDER (PORT-S S3b lane 3, commit B)
      // The successor plane's bodies join the SAME running `bestT` minimum, so
      // a round is still consumed exactly once whichever family it stopped on.
      //
      // FIRST, AND THE POSITION IS THE WHOLE OF WHAT IT DECIDES. The classes
      // join under a strict `<`, so the tie order IS the test order, and the
      // pinned rule this file states two screens up is that "a ship LOSES an
      // exact tie against either" body class. Testing the kernel arm LAST would
      // hold that rule today and INVERT it the day the old plane retires, when
      // ships would start winning exact ties against the only bodies left.
      // Testing it first keeps one rule across the retirement, and it can cost
      // nothing in between: an exact tie between the two planes needs both to
      // be non-empty, which happens on no surface in this tree.
      //
      // NO ARC BRANCH. The frontal-shield block below reads `stats.arc` and
      // `face`, which are the OLD roster's shield. A kernel body has its own —
      // the bulwark's frontal 76 %, the minelayer's 55 %, the station's five
      // weak points — applied INSIDE its own damage door on the `shot` cause.
      // Two shields, one owner each, and neither file re-implements the other's.
      const kbodies = window.EncounterHost ? EncounterHost.bodies() : null;
      if (kbodies) {
        for (let i = 0; i < kbodies.length; i++) {
          const ke = kbodies[i];
          if (ke.dead || ke.hp <= 0) continue;
          const t = segCircleEntryT(b.px, b.py, b.x, b.y, ke.x, ke.y, ke.r + b.r);
          if (t >= 0 && (bestT < 0 || t < bestT)) { bestT = t; kb = ke; kr = null; vs = -1; }
        }
      }
      // (the PRODUCTION-BODY sweep arm is DELETED at commit D5 with the array
      //  it walked. `hit` — the production-body winner — can no longer be set
      //  and every branch that reads it is dropped with it; `kb`, the kernel
      //  body, is the only body class a round can win against now.)
      // ---- THE ORDNANCE ARM, UN-RETIRED (D51, PORT-F) --------------------
      // The seeker plane retired at commit D4 and `E.missiles` is still
      // permanently empty — but the SUCCESSOR plane's enemy rounds are a live
      // array with thirteen hp-bearing kinds in it, and D51 rules that a
      // pilot's gun may shoot them down. So there is something here to
      // intercept again, and it reaches the same door `bodies()` does.
      //
      // BETWEEN THE BODIES AND THE SHIPS, AND THE POSITION IS THE RULE.
      // Everything joins the same running `bestT` under a strict `<`, so the
      // test ORDER is the tie order: a kernel BODY wins an exact tie against
      // ordnance (bodies are tested first, which is also the kernel's own
      // "BODIES FIRST" rule at js/demo-kernel.js:4772-4776), and ORDNANCE wins
      // an exact tie against a rival HULL — which is the half
      // tests/wave1-checks.js recorded as RETIRED at D4 and this commit
      // restores. A round is still consumed exactly once whichever family
      // stopped it.
      //
      // THE LIVENESS GATE IS THE KERNEL'S OWN, TERM FOR TERM (:4756):
      // `!o.dead && o.team === "enemy" && o.hp > 0`. The `team` term is not
      // decoration — `S.bullets` holds the kernel's PLAYER-team bolts too, and
      // without it production would shoot down the demo pilot's own fire.
      //
      // AND THE TERMS ARE APPLIED HERE, PER CANDIDATE, because
      // `EncounterHost.rounds()` is UNFILTERED and returns the live array. The
      // kernel filters once outside both of its loops for an O(rounds²)
      // reason it states, with the consequence that a round born inside the
      // kernel's step this tick is NOT a candidate for the kernel's own pass
      // until the next tick — while it IS one for this sweep, with px === x.
      // The two passes therefore disagree by one tick about when a newborn
      // mineShard becomes shootable. Deterministic, named, not a defect.
      //
      // NO SPLASH BRANCH, AND THAT IS A DECLARATION. MATRIX.blast[SHIP]
      // [ORDNANCE] is 0 (js/engine.js:293-297), so a blast aimed at ordnance
      // would be refused at the door; and whether a round TERMINATING on
      // ordnance should still splash the bodies around it is a balance
      // question with no ruling, so this branch asks none. R8a owns it.
      //
      // ONE PHASE LATE AGAINST THE ORACLE, deliberately. js/game.js:3354 steps
      // the whole kernel — including its enemy-round-vs-hull pass — before
      // :3355 runs this sweep, so on index.html a production round can never
      // save a pilot on the SAME tick, where on demo-play.html the kernel's own
      // pass can. One tick, deterministic, and it belongs here rather than in
      // a playtest report.
      const krounds = window.EncounterHost ? EncounterHost.rounds() : null;
      if (krounds) {
        for (let i = 0; i < krounds.length; i++) {
          const ko = krounds[i];
          if (ko.dead || ko.team !== "enemy" || !(ko.hp > 0)) continue;
          const t = segCircleEntryT(b.px, b.py, b.x, b.y, ko.x, ko.y, ko.r + b.r);
          if (t >= 0 && (bestT < 0 || t < bestT)) { bestT = t; kr = ko; kb = null; vs = -1; }
        }
      }
      // ...and the PvP class. A seat never shoots itself (v !== shooter), and
      // an UNOWNED bullet reaches no ship at all — the shooter < 0 continue
      // above already dropped it, so no unattributable round can take a hull.
      for (let v = 0; v < players.length; v++) {
        if (v === shooter || !seatAlive(v)) continue;
        const sh = players[v].ship;
        const t = segCircleEntryT(b.px, b.py, b.x, b.y, sh.x, sh.y, SHIP_R + b.r);
        if (t >= 0 && (bestT < 0 || t < bestT)) { bestT = t; vs = v; kb = null; kr = null; }
      }
      if (kb) {
        // THE SUCCESSOR PLANE'S BODY TOOK IT. The block mirrors the old plane's
        // below, member for member, and every difference is named:
        //   - the damage goes through the HOST's one door rather than through
        //     Engine.applyEffect here, because the credit that door writes is
        //     the kernel's `lastAtk` and this file may not reach into it. The
        //     funnel is the same funnel — the door calls it — so lane 2's aggro
        //     grievance and kill cue work unmodified and unaware.
        //   - `hit.flash = 8` has no counterpart: the kernel's own door sets
        //     its own hit tint (`e.hit`), which is that plane's spelling.
        //   - the `hit` cue is emitted against the IMPACT POINT rather than the
        //     body, because production's cue payload is a position and a kernel
        //     body is not one of this file's records.
        //   - the KILL cue is NOT emitted here. The kernel raises its own, on
        //     its sink, with its own crediting seat — one kill, one cue, and
        //     `reapDead`'s rule that the reap owns the canonical kill sound is
        //     the same rule seen from the other plane.
        const ix = b.px + (b.x - b.px) * bestT;
        const iy = b.py + (b.y - b.py) * bestT;
        b.dead = true; // consumed exactly once — the game sweep removes it
        if (EncounterHost.damageKernelBody(kb, b.dmg, ix, iy, shooter, "shot")) E.hitsDealt++;
        //   D45 (PORT-L): production's clay impact burst is GONE from this
        // branch. A hit on a kernel body used to paint 23 particles, 21 of them
        // production's own orange, over the two the kernel spawns in the body's
        // colour. The kernel's pair is the whole tell now, which is what the
        // demo draws. `const bm = Math.hypot(...)` went with the call — it had
        // no other reader in this branch.
        //   THE CUE STAYS. emit("hit") has FOUR consumers — the sound, the
        // light layer's flash, the comet-ram inference in js/game.js, and the
        // wire — and this row is a particle decision, not a channel one.
        emit("hit", { x: ix, y: iy }, undefined, shooter);
        blastAt(ix, iy, kb, b.dmg, shooter, b.blastR);
        continue;
      }
      if (kr) {
        // THE SUCCESSOR PLANE'S ROUND TOOK IT (D51, PORT-F). The branch is
        // deliberately the SHORTEST of the three, and every absence is a rule:
        //   - the damage goes through the HOST's one door, like the body arm,
        //     and the door calls Engine.applyEffect with a SEATLESS source —
        //     the kernel's own ordnance pass measured that adding a seat there
        //     diverges the bounded AUTO fixture at tick 1952, for a key nothing
        //     consults. This arm does not re-open that.
        //   - the COUNTER is `E.missilesShot`, which is D51's reward model in
        //     its own words at :683: "missiles a player bullet destroyed — NOT
        //     a kill: no orb, no XP". It is hashed (:6385) and on snapState.
        //     `E.hitsDealt` is deliberately NOT incremented: a denial is not a
        //     registered hit on a body, and the two counters have separate
        //     readers.
        //   - NO `hit` CUE. The kernel's own ordnance pass emits nothing but a
        //     burst, and production's `hit` has FOUR consumers including the
        //     wire, for which R7 has given ordnance no row. Emitting one here
        //     would put an unrepresented event on a channel. The body branch's
        //     cue rule is untouched.
        //   - NO IMPACT FX and no splash: see the arm's own block above.
        //   - THE DEATH IS THE DOOR'S, and it is BARE — WITH D64'S ONE
        //     EXCEPTION. The host sets `o.dead = true` and the KERNEL'S OWN
        //     next step compacts the corpse out of `S.bullets`; this file never
        //     splices that array. What D64 adds is a LOOK and nothing else: one
        //     `roundDeath` cue on the kill, carrying the round's own colour. It
        //     changes no counter, no hp and no array.
        b.dead = true; // consumed exactly once — the game sweep removes it
        if (EncounterHost.damageKernelRound(kr, b.dmg)) E.missilesShot++;
        //   D64 (PORT-P) — THE DESTRUCTION SPARK, and its condition is
        // `kr.dead` READ AFTER THE DOOR. damageKernelRound returns true on
        // DAMAGE, not on a kill, so hanging this off the call's own value
        // sparks ceil(hp / dmg) times per kill — three on an hp-6 round at the
        // shipped BDMG 2. The position is the ROUND'S OWN, not the intercept:
        // `ix`/`iy` are declared inside the BODY branch above and are NOT in
        // scope here (a measured ReferenceError that aborts the suite with zero
        // FAIL lines). `kr.color` is the kernel colour NAME and js/fx.js
        // resolves it through PAL.kernel.
        if (kr.dead) emit("roundDeath", { x: kr.x, y: kr.y }, undefined, shooter, undefined, undefined, kr.color);
        continue;
      }
      if (vs >= 0) {
        // The round struck a body. It is CONSUMED whatever the gate decided —
        // a comet negated it, a grace period ate it, or it landed: all three
        // are a bullet that stopped on a hull, and the anvil's blocked-shot
        // precedent above is the same rule. hitsDealt counts only the hits
        // that REGISTERED, so a negated strike inflates no statistic. No
        // `hit` event is emitted here: hitPlayer already sounds the one cue
        // per registered hit (hurt, or death), and a second cue would break
        // the audio suite's one-cue rule.
        //   AND IT SPLASHES, which it did not before R5. The old comment here
        // read "the splash stays enemies-only by blastAt's own contract — BLAST
        // does not reach players in v1", and D1 retired that contract: a blast
        // reaches a rival ship at factor 1.0. A round terminating on a hull is
        // a terminating round like any other, so it pays its splash where it
        // stopped — the file's standing rule, and the same one the wall exit,
        // the body hit and the missile interception all obey. The struck SEAT
        // is excluded explicitly, exactly as the struck BODY is.
        const bm = Math.hypot(b.vx, b.vy) || 1;
        const ix = b.px + (b.x - b.px) * bestT;
        const iy = b.py + (b.y - b.py) * bestT;
        b.dead = true;
        if (hitPlayer(vs, b.dmg, { kind: "shot", cls: Engine.CLASS.SHIP, seat: shooter })) E.hitsDealt++;
        spawnImpactFx(ix, iy, b.vx / bm, b.vy / bm, "enemy");
        blastAt(ix, iy, null, b.dmg, shooter, b.blastR, vs);
        continue;
      }
      // (the interception branch is RETIRED with the seeker plane — commit D4.)
      // ---- AND THE PRODUCTION-BODY WINNER'S BRANCH IS DELETED (commit D5) ---
      // Forty lines: the ANVIL'S SHIELD (the frontal-arc block, its `clang`,
      // its own excluded splash), the funnel's body payment, `hit.flash`, the
      // `hit` cue and the splash. Every line read a ROSTER body's own fields —
      // `stats.arc`, `face`, `flash` — and the array that held them is deleted.
      //
      // WHERE EACH PIECE WENT, because a shield is a rule and not a draw:
      // the successor plane's own frontal reduction is the BULWARK'S, applied
      // by `Engine.applyEffect` at the door and measured in demo-host LEG 9(e)
      // — a `shot` head-on takes it, a `blast` arrives from no direction and
      // lands whole. Its payment, its hit tint and its cues are the kernel's
      // own `damageBody` door, which commit B pointed this file's rounds at.
      // The one thing with no counterpart is the anvil's `clang`: the kernel
      // spells a blocked round in its own vocabulary, and R7 is the round that
      // gives those cues wire rows.
    }
  }

  // ---- the phase-15 fire-time REBATE ---------------------------------------
  // Give the shooter back the time the wire took, at SPAWN, in the sim, and
  // leave an ORDINARY bullet. fire() calls this immediately after the push
  // when the drained frame's latched Δ > 0: the bullet advances Δ segments
  // along its own path (ttl spent per tick, truncated at the world bounds —
  // no FX, no bounce: the ordinary loop owns walls next tick), and each
  // advanced segment sweeps ERA poses out of the ring above.
  //
  // KINEMATICS AT SPAWN, DAMAGE AT THE RESOLVE PHASE (corrective pass 2).
  // The sweep decides the winner and CONSUMES the bullet inside the drain,
  // but it applies NOTHING there: it queues {bullet id, class, target, dmg,
  // src, impact} on a within-tick transient list, and applyRebateHits()
  // pays it in bullet-id order at encStep's resolve phase, immediately
  // before resolveBulletHits — the exact slot live bullet damage occupies.
  // Two reasons, both proven by the orchestrator's audit: (1) a drain-time
  // PvP kill silenced the victim's SAME-TICK shot (fire()'s seatAlive gate),
  // making ascending seat order the tiebreaker for every simultaneous trade
  // — phase 14's pinned mutual-trade semantics require both rounds to fly;
  // (2) a drain-time kill reached deathToll/reapDead consequences from
  // inside the drain. The rebate itself draws no rand(); its APPLIED kills
  // draw at the resolve phase exactly like live kills. (Enemy kills also
  // moved: they used to land pre-stepEnemy, silently changing that tick's
  // telegraphs — now they land in the live slot.) The queue never crosses a
  // tick: applyRebateHits empties it every encStep, restart() clears it,
  // and a wave1 leg asserts it empty at every tick end — so it needs no
  // hash treatment.
  //
  // Era indexing: at rebate time (inside the drain, before this tick's
  // stepEnemy) the newest settled pose set is the PREVIOUS tick's — the
  // ring's newest row. Segment k of Δ sweeps era now-1-Δ+k, i.e. age
  // Δ+1-k (k = Δ → the newest row, age 1). First hit along the WHOLE
  // advanced path wins: earliest segment, then smallest entry t, and ships
  // lose exact ties against enemies and missiles — phase 14's order.
  // Finally px,py COLLAPSE onto x,y, so this tick's ordinary integration and
  // live sweep see exactly one ordinary segment (the Δ=1 double-count proof).
  // The rebate itself adds no per-bullet field. THE ALLOW-LIST DID GROW AT R5,
  // once and deliberately: `blastR`, the splash radius captured at fire time,
  // under a guarded zero-default fold (js/game.js's BULLET_HASH_GUARDED). What
  // this passage still means is unchanged — the rebate buys its lag
  // compensation with no field of its own — and what the rebate DOES owe the
  // new field is that its queue record carry it (`br`), so a rewound hit
  // splashes at the radius the round was fired with rather than at whatever
  // rank the shooter holds by the resolve phase.
  const rebateQueue = []; // the within-tick transient list — see above
  function rebate(b, delta, shooter) {
    const d = Math.max(0, Math.min(REWIND_ROWS - 1, delta | 0));
    // the PLAYER-target cap, in ticks: TICK-exact (floor(ms / TICK), 140 →
    // 8) — the same conversion the slider readout prints, so the two can
    // never disagree at 50/100/150/200 ms. PvE bodies use the ring's full
    // depth — a constant, never a tunable.
    const pvpTicks = Math.floor(PVPREWIND / TICK);
    for (let k = 1; k <= d && !b.dead; k++) {
      if (b.ttl <= 0) break; // the advance spent the round's whole life
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx;
      b.y += b.vy;
      b.ttl--;
      sweepRebateSegment(b, d + 1 - k, d, pvpTicks, shooter);
      // truncate at the walls AFTER the exit segment swept — the same "final
      // segment still sweeps" rule the ordinary spent path keeps. BOUNCE mode
      // deliberately does not bounce here: truncate exactly the same way.
      if (outOfWorld(b)) break;
    }
    b.px = b.x; // the COLLAPSE — the one ordinary segment the live path sees
    b.py = b.y;
  }
  // one advanced segment (b.px,py → b.x,y) against era `age` ticks back.
  // Candidates come FROM THE RING ROW — the world the shooter's screen
  // described. A row entry marked live-sweep (project:1 — seek) sweeps at
  // its RECONSTRUCTED PRESENTED pose: era pose + era velocity × Δ, wall-
  // clamped — the projection phase 12's client ran (Δ, the frame's clamped
  // delta, is the server-side stand-in for the client's leadTicks; the
  // formula stays pinned against ENEMY_POLICY through the LIVE_SWEEP table).
  // "Sweep what the screen showed", applied consistently: the earlier
  // frozen-NOW form silently granted flight-time lead against seek bodies —
  // an aim assist of up to (Δ−k)×speed px the audit measured at ~77 px.
  // Winners still resolve at NOW by id against the live arrays (ids are
  // monotonic and never reused); a winner that died in the window is
  // DISCARDED at sweep time and the walk CONTINUES to the next-nearest
  // candidate — no retroactive life, ever. The shooter-side ghost (a hit
  // the shooter saw land on a body that is already dead) is an accepted,
  // documented contradiction of damage-at-NOW.
  function sweepRebateSegment(b, age, dTotal, pvpTicks, shooter) {
    const row = rowForAge(age);
    if (!row) return; // before the match's first settled row nothing existed
    const cands = []; // { t, kind (2 ship), seat } — see the two retired arms
    // ---- THE ENEMY AND ORDNANCE ARMS ARE RETIRED (S3b lane 3, commit D4) -
    // Commit B ruled the rebate's ENEMY arm retired, with the measurement
    // written at `LIVE_SWEEP`: a successor-plane body carries no wire `mode`,
    // so `wireMode(-1)` falls back to `"seek"` — the ONE policy row with
    // `project: 1` — and the client would PROJECT every body forward while
    // this sweep REWOUND it, compensating in opposite directions by about
    // twice the lead. That is exactly the double-compensation `LIVE_SWEEP`
    // exists to prevent, and R7 is the round that gives those types and states
    // real wire rows and can therefore say which of them project.
    //   The ORDNANCE arm went with the seeker plane at this commit.
    //   THE SHIP ARM BELOW IS UNTOUCHED. It is the one R3 measured honest at
    // n=470, d200 j20, and it is the only lag compensation this file now does.
    // The RING ITSELF STAYS, and its enemy rows go empty rather than absent —
    // `recordPoseRow` still writes an `enemies: []` per row, so a reader of a
    // ring row still finds the shape it expects.
    for (let v = 0; v < players.length; v++) {
      if (v === shooter) continue;
      // the cap: a player target's era clamps to max(era, now - pvpTicks) —
      // the shooter leads the remainder. Age 0 is the LIVE pose.
      const va = Math.min(age, pvpTicks);
      let sx, sy, ok;
      if (va <= 0) { const sh = players[v].ship; sx = sh.x; sy = sh.y; ok = seatAlive(v); }
      else {
        const vrow = rowForAge(va);
        const rs = vrow && vrow.ships[v];
        ok = !!rs && rs.alive; // respawn invalidation marks these rows false
        if (rs) { sx = rs.x; sy = rs.y; }
      }
      if (!ok) continue;
      const t = segCircleEntryT(b.px, b.py, b.x, b.y, sx, sy, SHIP_R + b.r);
      if (t >= 0) cands.push({ t, kind: 2, seat: v });
    }
    // earliest entry wins; the kind tiebreak is KEPT rather than simplified
    // away — one class can still tie with itself only by sharing a `t`, and a
    // sort whose comparator stopped mentioning `kind` would change the order
    // silently if a class is ever added back.
    cands.sort((a, c) => a.t - c.t || a.kind - c.kind);
    for (const c of cands) {
      const ix = b.px + (b.x - b.px) * c.t;
      const iy = b.py + (b.y - b.py) * c.t;
      const bm = Math.hypot(b.vx, b.vy) || 1;
      // the winner: consume the bullet NOW (kinematics), pay at the resolve
      // phase (applyRebateHits) — a ship winner is consumed regardless of
      // what hitPlayer will decide there (phase 14's rule)
      b.dead = true;
      rebateQueue.push({ bid: b.id | 0, kind: c.kind, id: c.id, seat: c.seat,
        dmg: b.dmg, src: shooter, br: b.blastR, ix, iy, dx: b.vx / bm, dy: b.vy / bm });
      return;
    }
  }
  // The queued applications land here, in bullet-id order, at encStep's
  // resolve phase immediately before resolveBulletHits — the slot live
  // bullet damage occupies. Each target is RE-resolved at apply time: a
  // body that died earlier in this same tick (a contact, a ram) drops its
  // hit exactly as the live sweep would have skipped it.
  function applyRebateHits() {
    if (!rebateQueue.length) return;
    rebateQueue.sort((a, c) => a.bid - c.bid);
    for (const h of rebateQueue) {
      // ---- THE ENEMY AND ORDNANCE ARMS ARE RETIRED (commit D4) ---------
      // `kind` 0 (an enemy body) and `kind` 1 (a seeker) can no longer be
      // QUEUED: commit B ruled the rebate's enemy arm retired with a
      // measurement — the successor plane's bodies carry no wire `mode`, so
      // the client would PROJECT every one of them while this sweep REWOUND
      // it, compensating in opposite directions by about twice the lead —
      // and the seeker plane went with the harrier that fired it. The SHIP
      // arm below is the one R3 measured honest at n=470, d200 j20, and it
      // is untouched.
      //
      // THEY ARE SKIPPED RATHER THAN ASSUMED ABSENT. `rebateQueue` is a
      // within-tick transient with three producers' worth of history in this
      // file's fixtures; a branch that fell through to the SHIP arm on a
      // stale `kind` would pay a hull for a body.
      if (h.kind !== 2) continue;
      // a SHIP: hitPlayer's own gates decide at the resolve phase — a
      // mutual lethal trade lands BOTH tolls, because both shots were
      // already spawned and consumed during the drain while both seats
      // still lived; hitsDealt counts only a registered hit.
      //   `h.src` IS passed now, twice over: to hitPlayer as the shot's source
      // (D28 needs to know what hit the seat) and to the splash as the
      // attacker. And the splash happens at all, which it did not before R5 —
      // D1 made a blast reach a rival, so the rebated ship termination pays
      // its splash exactly as the live one does, at the radius the round was
      // FIRED with (`h.br`, which the queue was already carrying and this
      // branch was already discarding). The struck SEAT is excluded explicitly.
      if (hitPlayer(h.seat, h.dmg, { kind: "shot", cls: Engine.CLASS.SHIP, seat: h.src })) E.hitsDealt++;
      spawnImpactFx(h.ix, h.iy, h.dx, h.dy, "enemy");
      blastAt(h.ix, h.iy, null, h.dmg, h.src, h.br, h.seat);
    }
    rebateQueue.length = 0;
  }
  // ---- resolveWallBlasts SURVIVES, AND THE SUITE CAUGHT THAT -------------
  // PORT-S S3b lane 3, commit D4. This function was deleted with its two
  // neighbours on the reasoning that "blastAt has no bodies left to reach from
  // a wall", and THAT REASONING WAS WRONG: the successor plane's bodies are
  // reachable from a wall exactly as the old roster's were, and commit B
  // already re-aimed `blastAt` at them. wave1's section U measured it — a body
  // hugging the wall that a wall-terminating round no longer splashed — and it
  // is restored unchanged.
  //
  // IT HAS NO RETIRED DEPENDENCY, which is what makes the mistake legible in
  // hindsight: every name in it is production's own and survives. `G.bullets`,
  // `bulletSeat`, `termsFor`, `outOfWorld`, `wallExitPoint` and `blastAt`.
  // What it does NOT do — and never did — is walk `E.enemies`.
  function resolveWallBlasts() {
    for (const b of G.bullets) {
      // per seat: the OWNER's rank gates its own bullets — a rank-0 seat's
      // wall exits stay silent while a ranked seat's splash (blastAt reads
      // the same owner rank, so the early continue is only a fast path)
      if (b.dead || !b.spent || bulletSeat(b) < 0) continue;
      if (termsFor(bulletSeat(b)).blast <= 0) continue;
      if (!outOfWorld(b)) continue; // a mid-air ttl fade hit nothing
      const w = wallExitPoint(b);
      blastAt(w.x, w.y, null, b.dmg, bulletSeat(b), b.blastR);
    }
  }

  // ---- findEnemy AND resolveContacts ARE RETIRED -------------------------
  // PORT-S S3b lane 3, commit D4. One more of S3B-MAP's nine ENTANGLEMENTS,
  // split the way the map said it would — one sweep, two victim classes, and
  // the ENEMY class is gone.
  //
  //   `resolveContacts` was the ship-versus-BODY overlap. Its player half is
  //   `hitPlayer`, which the successor plane reaches through the host's HURT
  //   ROUTE with a `ram` source record and every one of production's gates —
  //   the comet refusal included, which is D28 working across the seam. Its
  //   body half paid BDMG into an `E.enemies` record.
  //   `findEnemy` was an id lookup into that array.
  //
  // NEITHER LEFT A STUB. A pass with no candidates is not a smaller pass, and a
  // lookup into an empty list is a function that answers null.

  // ---- HEAVY and reapDead ARE RETIRED (S3b lane 3, commit D4) ------------
  // The seventh of S3B-MAP's nine ENTANGLEMENTS, and the one whose split is
  // most worth writing down: `reapDead` did FOUR things at once, and three of
  // them survive somewhere else while the fourth simply has nothing left.
  //
  //   THE BODY REAP is gone — there is no `E.enemies` to walk.
  //   THE KILL CUE moved to lane 2, verbatim in both halves: the successor
  //     plane's `killEnemy` splits the name on heaviness (`killheavy` or
  //     `kill`) and stamps the CREDIT with `e.lastAtk`, the same field the R5
  //     funnel writes and the aggro grievance reads. `HEAVY`'s job is the
  //     `heavy`/`boss` columns of that plane's own STATS rows.
  //   THE ORB DROP moved with it, and its ECONOMY did not move at all: the
  //     successor plane's orbs pay `credit(seat, value)` on the sink, and
  //     js/encounter-host.js routes that into `addXp(n, seat)` — production's
  //     ONE credit site, still the only one.
  //   `E.kills` is the counter that has nothing left to count, and it is not
  //     silently zeroed: it stays a hashed field at 0 rather than being
  //     deleted, because a counter that vanishes and a counter that reads zero
  //     say different things to a reader of a snapshot.

  // The ONE credit site, now per seat: the collecting seat's wallet, its
  // scoreboard and its high-water mark all rise together. Nothing HERE ever
  // lowers score — spending keeps it — and exactly one site anywhere does:
  // deathToll, on every death. The seat defaults to 0 so every
  // existing single-seat caller (the suites' enc.addXp(n)) still credits the
  // local seat unchanged.
  // IT REPORTS WHETHER IT PAID (PORT-S S3b lane 2, fix 4). The `if (!S) return`
  // below has always been a silent decline — a seat index production does not
  // own is not an error, and every caller in this file and in the suites passes
  // an index it just took off `E.seats`. js/encounter-host.js does not: it
  // carries a seat index across from a SECOND simulation whose roster is sized
  // separately, so "production has no such seat" is a real answer there and a
  // route that could not hear it recorded a payment nobody received.
  //
  // A BOOLEAN, ADDITIVE, AND NOTHING EXISTING READS IT. The silent decline is
  // preserved exactly — same branch, same absence of a throw — because the
  // caller that needs to know is the one that asked, and a throw would make a
  // roster-size mismatch a page crash instead of a refused payment.
  function addXp(n, seat = 0) {
    const S = E.seats[seat];
    if (!S) return false;
    S.xp += n; // an uncapped wallet — no threshold, no level; the shop is the only drain
    S.score += n; // the scoreboard rides EVERY wallet credit; the only thing that
                  // takes it back down is dying (deathToll)
    // ...and the STANDING, maintained continuously rather than stamped at
    // the death that takes the score. Continuous is what makes the board
    // honest DURING a run: a seat climbing past its old peak is already
    // leading on the board, instead of only counting once it dies. Since
    // score only ever rises here, best === score for a living, climbing seat
    // and holds above it after a death — the board's own line reads that gap.
    if (S.score > S.best) S.best = S.score;
    return true;
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
      // the magnet chases the NEAREST living ship; the pickup is a per-seat
      // distance test on the same pre-move position, ascending seat order, so
      // the seat that stands on an orb is the seat whose wallet it fills
      const tgt = targetPlayer(o.x, o.y);
      if (tgt) {
        const dx = tgt.ship.x - o.x;
        const dy = tgt.ship.y - o.y;
        const d = Math.hypot(dx, dy) || 0.001;
        if (d < attract) { // magnet range — the orb chases the ship
          o.vx += (dx / d) * pull;
          o.vy += (dy / d) * pull;
          const m = Math.hypot(o.vx, o.vy);
          if (m > vmax) { o.vx *= vmax / m; o.vy *= vmax / m; }
        }
      }
      const ox = o.x; // the pre-move position the pickup ring is judged on —
      const oy = o.y; // exactly the position the old single-seat test used
      o.x += o.vx;
      o.y += o.vy;
      for (let s = 0; s < players.length; s++) {
        if (!seatAlive(s)) continue;
        const ship = players[s].ship;
        if (Math.hypot(ship.x - ox, ship.y - oy) < O.pickup + SHIP_R) {
          E.orbs.splice(i, 1); // removal and increment together — one XP, once
          addXp(1, s);
          energyGain(s, ENORB); // salvage tops the pool up as well as the wallet —
                                // ENORB ships at 0, so this is a knob, not a rule
          // beside the splice, never inside addXp() — the suites call that
          // synthetically, and a granted XP is not a banked orb. Positioned on
          // the orb (inside the pickup ring, so attenuation stays 1) and
          // stamped with the collecting seat.
          emit("pickup", o, undefined, s);
          break;
        }
      }
    }
  }

  // ---- transitions -------------------------------------------------------
  // active → cleared (the break runs clearHold ticks while the orb sweep
  // banks the field; the CLEAR card retires earlier, on bannerHold() =
  // min(210, clearHold)) → warning, dealt by encStep itself. No state
  // freezes for a shop: the panel is live at every moment of play, so a
  // purchase is just buy().

  // one purchase against seat `seat`'s wallet — callable at any moment of
  // play: buying mid-flight is the panel shop's whole point. Returns whether
  // the sale went through — refusals change nothing at all.
  // ---- D37'S DEALER (PORT-S S7) ------------------------------------------
  // THE POOL is the SEVEN DOUBLING ROWS, availability-filtered and ascending.
  // HULL PATCH is exempt by `curve: "flat"` — it is the consumable whose own
  // row comment calls an escalating repair price *"a death spiral aimed at the
  // player already losing"*, so it stays always-purchasable OUTSIDE the four
  // cards rather than competing for one of them.
  //
  // THE LIST IS SORTED BEFORE IT IS SAMPLED, which is R6's candidate-list rule
  // and not a style choice: a substream makes the DRAW reproducible, sorting
  // makes the SELECTION reproducible, and a stable draw over an unstable list
  // is still unstable. Here it is ascending BY CONSTRUCTION — the loop walks
  // the catalog in index order — so there is no sort call to forget.
  //
  // THE POOL CAN NEVER BE EMPTY: AFTERBURNER and MAX HULL carry no `cap`, and
  // `shopMaxed` answers false for a row with no cap, so at least two rows stand
  // however much a seat has bought. A SHORT pool deals a SHORT hand and is
  // never padded with a repeat and never topped up from the catalog — the fold
  // carries a length prefix precisely so a short hand is expressible.
  //
  // FOUR SUCCESSIVE DRAWS WITHOUT REPLACEMENT from ONE substream keyed
  // `(ECFG.seed, rewardWave, seat, loop, 0, PURPOSE.MARKET)` — the mapping
  // table beside js/engine.js's PURPOSE block says which of D37's four parts
  // rides which slot. It is `Engine.substream`, never the shared global `rand`
  // this file draws FX from: a particle must never be able to change a deal.
  function dealSeatHand(seat, rewardWave, loop) {
    const S = E.seats[seat];
    if (!S) return false;
    const pool = [];
    for (let i = 0; i < SHOP.length; i++) {
      if (SHOP[i].curve !== "double") continue;   // HULL PATCH, and only it
      if (shopMaxed(i, seat)) continue;           // a maxed row is not an offer
      pool.push(i);
    }
    const g = Engine.substream(ECFG.seed, rewardWave >>> 0, seat >>> 0, loop >>> 0, 0,
                               Engine.PURPOSE.MARKET);
    const hand = [];
    const n = Math.min(4, pool.length);
    for (let k = 0; k < n; k++) {
      // the clamp is for a generator that ever returned exactly 1 — mulberry32
      // does not, and an index one past the end would splice nothing and deal a
      // hand with an `undefined` in it, which is a hash the fold would accept
      const at = Math.min(pool.length - 1, Math.floor(g() * pool.length));
      hand.push(pool.splice(at, 1)[0]);
    }
    S.hand = hand;
    S.bought = hand.map(() => 0);
    return true;
  }
  // ...and the room's deal. EVERY seat record, present or PARKED — records
  // exist for every slot from the moment the room is built, so a D17 joiner
  // released mid-break finds its hand already waiting, and the key is per seat
  // so no two of them can be the same hand by accident.
  function dealAll(rewardWave, loop) {
    for (let s = 0; s < E.seats.length; s++) dealSeatHand(s, rewardWave, loop);
    // the PHYSICAL clear is the identity; `rewardWave` stays the SUBSTREAM KEY
    // and the due test only, so a live ENCPERREWARD retune cannot re-key a
    // clear that has already been dealt (or alias a later one onto it).
    E.marketWave = E.wave;
    E.marketLoop = loop;
    // ...and the PRESENTATION hover the old shelf left behind (S7-CX-03). The
    // deal above replaced EVERY seat's hand, the local one included, so the
    // stored catalog index can name a row that is on no card any more — and
    // shopHoverPlan() reads that index and nothing else (it tests SHOP[i], the
    // CATALOG, never S.hand), so the field panel would go on naming and pricing
    // a departed row, with no card lit, until the next mousemove re-hit-tests
    // it. The pointer has not moved; -1 ("no hover") is the honest answer for a
    // shelf that changed underneath it, and the next mousemove lights the new
    // card. UNHASHED, so this moves no trace: hashEncounter's allow-list names
    // "the shop's hover state" as presentation and keeps it out, no golden
    // checkpoint's `st` carries it, and on the server it writes -1 over -1.
    E.shopHover = -1;
  }

  function buy(i, seat = localSeat()) {
    // the cues live HERE, not at the click site, so one site covers the
    // pointer and the suites' direct enc.buy() calls alike. The refusals a
    // player can reach by clicking each sound denied; a missing row or seat
    // is a programming error, not a player action asking for feedback.
    const S = E.seats[seat];
    const row = SHOP[i];
    if (!S || !row) return false;
    // ---- D37'S HAND-MEMBERSHIP GATE (PORT-S S7) --------------------------
    // *"What is available for each player should stay for that wave"* is a REAL
    // RULE at four seats and not a client-side filter, and this is the line
    // that makes it one. It is server-side BY CONSTRUCTION: the wire's purchase
    // route (`server/server.js`, `{ v, ui: "buy", item }`) reaches THIS
    // function, so a hostile `item` is refused here and nowhere else has to
    // know. Today `Number.isInteger(msg.item)` is the route's ONLY validation.
    //
    // HULL PATCH IS EXEMPT, by its `curve: "flat"` and by that alone — the
    // consumable is outside the four cards and buyable at every moment of a
    // run, which is the whole point of the row.
    //
    // TWO REFUSALS, and they take opposite sides of this function's own rule
    // (the five player-reachable refusals below cue; the two programming-error
    // ones above do not):
    //   NOT IN THE HAND refuses SILENTLY. The shipped panel never draws a card
    //     for a row the seat was not dealt, so a player cannot reach this by
    //     clicking — it is `SHOP[i]` missing, in a different spelling.
    //   ALREADY BOUGHT refuses WITH THE CUE. That card IS on the shelf, the
    //     pointer can land on it, and a player pressing a spent card has asked
    //     a question that deserves an answer.
    let handAt = -1;
    if (row.curve !== "flat") {
      handAt = S.hand.indexOf(i);
      if (handAt < 0) return false;
      if (S.bought[handAt]) { if (window.Sfx) Sfx.cue("denied", null, undefined, seat); return false; }
    }
    // ...and the match being OVER is a player-reachable refusal too, so it
    // ANSWERS (S7-CX-02). The shop is a persistent panel: the shelf is still
    // painted, still lit and still under the pointer on the terminal screen, so
    // a press there is a question. PRE-EXISTING — this door has been silent
    // since before S7 — but S7 is what put a dealt hand under that pointer.
    if (E.state === "dead") { if (window.Sfx) Sfx.cue("denied", null, undefined, seat); return false; } // the match is over — nothing sells
    // a downed seat may browse the shelf; only a live one may spend — the
    // documented choice, surfaced at the phase gate
    if (S.hull <= 0) { if (window.Sfx) Sfx.cue("denied", null, undefined, seat); return false; }
    if (shopMaxed(i, seat)) { if (window.Sfx) Sfx.cue("denied", null, undefined, seat); return false; }
    if (row.can && !row.can(seat)) { if (window.Sfx) Sfx.cue("denied", null, undefined, seat); return false; }
    const cost = shopCost(i, seat); // the BUYER's own rank prices the row
    if (S.xp < cost) { if (window.Sfx) Sfx.cue("denied", null, undefined, seat); return false; }
    S.xp -= cost; // the wallet pays; S.score never moves — spending is not un-scoring
    S.owned[i]++; // the purchase IS the rank — termsFor derives everything else
    if (handAt >= 0) S.bought[handAt] = 1; // ...and the CARD is spent (D37, S7). ONE
                                 // card, by its slot: a purchase marks its own and never
                                 // rerolls its siblings, which is why the ids are stored
                                 // rather than re-derived — a re-derived hand after a
                                 // sale can be a different hand, because a maxed row
                                 // leaves the pool
    if (row.apply) row.apply(S.owned[i], seat); // the rank AFTER the sale, for the rows
                                 // that keep a side effect (hull, the CELL's fill)
    // the term epoch: the effects above took hold at THIS tick — the tick the
    // buy message was consumed — and the marker rides the event stream so a
    // predictor (phase 11, via phase 09's sequencing) can carry the
    // discontinuity. Unhashed; the RANKS are the hashed truth.
    S.termSeq++;
    emit("termChange", null, undefined, seat, S.termSeq);
    if (window.Sfx) Sfx.cue("buy", null, undefined, seat); // the BUYER's own
                                 // till — five cues off one shelf must not
                                 // share one seat's gap
    return true;
  }

  // Reset ONE seat's ranks to stock. THREE callers, and the note here used to
  // say two: deathToll (every death now, not just a PvP kill — it used to say
  // "phase 14's PvP death"), restart(), which walks every seat, and THE WIPE
  // BLOCK in encStep, which walks every seat too. The third one is why the
  // market's bought-bit clear is NOT in here: a death must clear the bits and
  // KEEP the ids (the ranks are gone, so the cards are buyable again), while a
  // wipe must take the whole hand away and return the room to never-dealt. One
  // primitive cannot say both, so deathToll and the wipe each say their own.
  // The epoch INCREMENTS — never
  // rewinds — because a reset changes the seat's effective terms exactly as a
  // purchase does, and the marker rides the stream for the same predictor.
  function resetSeatUpgrades(seat) {
    const S = E.seats[seat];
    if (!S) return;
    S.owned = SHOP.map(() => 0);
    S.termSeq++;
    emit("termChange", null, undefined, seat, S.termSeq);
  }

  // A downed seat's return. The deal point rides the phase-02 dealing rules
  // unchanged: rollAnchor against the nearest living teammate's view
  // rectangle (the seat's own parked position stands in with no one alive
  // to anchor on), world-clamped and held off every living ship — so a
  // respawn lands OFF-SCREEN from the fight, never in a pack's lap. It
  // consumes rand() like any other mid-wave deal; the per-wave reseed keeps
  // wave schedules reproducible regardless.
  function respawnSeat(s) {
    const S = E.seats[s];
    const pl = players[s];
    if (!S || !pl) return;
    const anchorSeat = nearestSeat(pl.ship.x, pl.ship.y);
    const p = reentryAnchor(anchorSeat >= 0 ? anchorSeat : s);
    const c = clampWorld(p.x, p.y, SHIP_R);
    pl.ship.x = c.x;
    pl.ship.y = c.y;
    pl.vel.x = 0;
    pl.vel.y = 0;
    S.hull = S.hullMax;
    energyFill(s); // ...and a full pool with it: a seat that re-enters on an empty
                   // one re-enters defenceless, with the comet — its whole escape
                   // and its whole damage negation — locked out behind the re-arm floor
    S.invuln = ECFG.player.invuln; // the brief re-entry grace — the same
    S.hitFlash = 0;                // machinery a registered hit grants
    S.respawnT = 0;
    S.claimT = 0;      // ...and the claim window closes with it. Cleared HERE and
    S.absent = false;  // not only at the claim loop's call sites because this is
                       // a PUBLISHED hook too — the suites stage a re-entry
                       // through it without waiting a timer out — and a seat
                       // that re-enters still flagged absent would fly with no
                       // board row and no light. server/server.js never calls
                       // this itself: its reclaim goes through reseatSeat, which
                       // re-opens the WINDOW and leaves the deal to the click,
                       // which reaches here through the loop above like anyone's

    // the swept previous position must be the NEW one: a respawn is a deal,
    // not a move, and no beam may sweep the teleport segment across the world
    if (Array.isArray(E.shipPrev) && E.shipPrev[s]) { E.shipPrev[s].x = c.x; E.shipPrev[s].y = c.y; }
    // ...and the phase-15 ring forgets THIS seat's history (the same teleport
    // idiom): a rewound sweep must never cross a respawn's dealt position, so
    // every held row marks the seat unhittable for its era
    for (const row of poseLog) if (row.ships[s]) row.ships[s].alive = false;
    // the DISCONTINUITY marker first, then the cue: a re-entering ship is
    // dealt a fresh position, so every consumer that carries state across
    // ticks (trails, the phase-11 predictor) must cut here rather than
    // interpolate the teleport. It rides the wire with the dealt position.
    emit("respawn", pl.ship, undefined, s);
    emit("spawn", pl.ship, undefined, s); // the arrival is heard like any deal
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
    // ---- WHAT THIS BLOCK USED TO DESCRIBE, AND WHERE IT WENT --------------
    // It described PER-PLAYER WAVES (the user's phase-05-gate decision) — every
    // seat dealt its own owner-stamped copy of the schedule — and THE PRESENCE
    // GATE that skipped a parked owner's copy at deal time. Commit D4 deleted
    // the dealer and both went with it; the prose stayed, and the S4-MAP's own
    // correction table had to say so: *"THE PRESENCE-GATED DEAL IS DELETED ...
    // commit D4 deleted the dealer and left the prose."*
    //
    // BOTH FACTS NOW LIVE IN THE SUCCESSOR PLANE, and this is the routing note
    // rather than the mechanism (PORT-S S4, commits D and F):
    //   THE SIZE OF A DEAL is D14's threat budget in `js/demo-kernel.js` —
    //   `dealCount()` at `queueGroup`, per group, per PRESENT seat, bosses
    //   once. There is ONE shared stream (D8), not a copy per seat.
    //   THE PRESENCE GATE is the same call's `presentCount()`, fed by
    //   `poseKernelSeats` pushing `!absent` per seat — production's own word for
    //   "nobody is behind this one". D8's row is where it moved: *"the presence
    //   gate moves from the deal into the director's budget."*
    //   AND A ROOM WITH EVERYBODY PARKED still gets an arc: the budget FLOORS
    //   at one present seat, because a room that dealt nothing until somebody
    //   claimed a seat would be a room with no encounter to walk into. The old
    //   rule's answer here was the opposite — ZERO groups — and it worked only
    //   because a re-deal in `encStep` re-armed it, which is a mechanism this
    //   plane no longer has.
    // ---- THE DEAL IS DELETED (S3b lane 3, commit D4) ---------------------
    // Commit C made it DORMANT against the flip predicate; this commit deletes
    // the dealer, its counts, its tier ladder and its stat table. What is left
    // of `startWave` is production's own half and every line of it is
    // load-bearing:
    //
    //   THE WAVE NUMBER AND THE CLOCK. `applyKernelHud` overwrites both from
    //   the successor plane's director on every tick, so these are the values
    //   a restart shows for exactly one tick — which is one tick more honest
    //   than leaving them at the last run's.
    //   THE PER-WAVE RESEED, and this is the one that would be missed.
    //   `rand` is production's ONE stream and it is still read — by the orb
    //   drift on a PvP payout and by `reentryAnchor`'s roll. Dropping the
    //   reseed would make those draws depend on how many the last wave
    //   happened to consume, which is exactly the property this line was added
    //   to remove.
    //
    // `E.stats` GOES WITH `statsFor`. It held a wave's resolved stat table for
    // bodies to stamp at spawn, and there are no bodies and no table; the field
    // stays on `E` at its `null` default so a reader finds the shape it
    // expects, and it is never written again.
  }

  // full restart: back to wave 1 with enemies, bullets, orbs and transient
  // state cleared, mods included; recenters the ship and camera — and
  // touches no tuner value, so every slider survives
  function restart(seed) {
    // THE STALL CLOCK GOES WITH THE RUN (S4 commit E). It is presentation state
    // and unhashed, but a clock carried across a restart would tell the new run
    // how long the OLD one stood still. -1 is a count no census can return, so
    // the first frame after this arms the clock rather than inheriting one.
    stallSig = "";
    stallSince = 0;
    stallFired = false;
    stallActive = false;
    stallRoom = "";   // ...and the room it was armed in (S4-CX-4): a restart is
                      // a boundary too, and the identity must not survive it
    // ...and D17's park queue (S4 commit F). A joiner parked against the
    // PREVIOUS run has no setpiece to wait for; the server re-grants across a
    // restart, so the queue is the run's and dies with it.
    joinParked = [];
    syncSeats(); // seats[] tracks players[] — BEFORE the wave deal reads the count
    // every seat's ranks die with the run, through the same primitive every
    // DEATH uses — each epoch still INCREMENTS. Deliberately BEFORE
    // the EVENTS clear below: a restart is a GLOBAL discontinuity every
    // client resynchronizes across anyway, so its termChange markers die
    // with the queue like every other stale cue.
    for (let s = 0; s < E.seats.length; s++) resetSeatUpgrades(s);
    // ...and every seat's MARKET HAND dies with the run too (D37, S7), for the
    // wipe's reason and beside the identity zeroed further down: a restarted
    // run and a booted one must be one state, or the hash of the first would
    // differ from the hash of the second over a shelf nobody was dealt.
    for (const S of E.seats) { S.hand = []; S.bought = []; }
    startWave(1);
    if (seed !== undefined) rand = mulberry32(seed >>> 0); // explicit test seeds still override
    E.state = "idle";
    // (the body and ordnance clears are deleted at commit D5 with their
    //  arrays. The successor plane's own field is cleared by its `reset`,
    //  which the wipe and this restart both reach on the same seed.)
    E.orbs = [];
    E.pvpCd = {};        // no PvP window survives a restart — a stale pair stamp would
                         // refuse the new run's first ram for up to COMETCD ticks
    rebateQueue.length = 0; // a queued application must not cross the cut
                            // (unreachable in play — the queue empties every
                            // encStep — but a suite may restart mid-stage)
    poseLog.length = 0;  // no pre-restart pose row is EVER readable: cleared in-sim
                         // (fixture-replayable), and — with the server dropping
                         // stale-epoch frames before any vt read — the whole of the
                         // cross-epoch rewind story
    EVENTS.length = 0;   // no queued cue survives a restart — a stale event
                         // would sound over the new run's opening tick
    nextEntityId = 1;    // the id deal restarts with the run — a seeded run
                         // reproduces its ids exactly, see nextId
    for (const S of E.seats) {     // field by field, every seat
      S.hullMax = ECFG.player.hull; // MAX HULL purchases die with the run
      S.hull = S.hullMax;
      S.xp = 0;                    // the wallet resets on death — owner decision, the roguelite reset
      S.score = 0;                 // ...and the scoreboard with it. This line is NEW: the old
                                   // charter had the score count XP for a seat's whole session
                                   // and survive a restart, because only a PvP kill could take
                                   // it. Now every death takes it (deathToll), so a score that
                                   // outlived a whole new run would be the last inconsistency
                                   // left standing.
      S.best = 0;                  // the standing is MATCH-scoped this pass: a restart is a new
                                   // match, so the board opens empty and crowns nobody until
                                   // the first point. A persistent 7-day board is server
                                   // business (see the BOARDUI note), not a field that quietly
                                   // survives restart() here
      S.invuln = 0;
      S.hitFlash = 0;
      S.respawnT = 0;                // no pending re-entry survives a restart
      S.claimT = 0;                  // ...nor an open claim window, nor the release it
      S.absent = false;              // ended in: a restart deals EVERY seat back in, and a
                                     // seat still flagged absent would sit out the new match
                                     // with no way back. It also keeps the guarded fold
                                     // empty on a fresh run, which is what lets the hash of
                                     // a restarted run equal the hash of a booted one
      S.stock = ECFG.player.stock;   // the quarter-rule lives refill with the run
    }
    E.wipePending = false;         // no armed wipe survives a restart — the arm belongs to
                                   // the run that died, and consuming it on the new run's
                                   // first tick would re-deal the wave 1 restart just dealt
    E.marketWave = 0;              // ...and the market goes back to NEVER DEALT, with every
    E.marketLoop = 0;              // seat's own hand emptied in the per-seat walk above
    E.loop = 0;                    // ...and the arc loop counter dies with the run it counted.
                                   // The startWave(1) above already wrote E.wave, so the next
                                   // tick's kernel mirror sees no fall and adds nothing back.
    E.shopHover = -1;              // no hover — and so no hover art — survives a restart
    syncCursor();
    E.shipPrev = null;
    E.kills = 0;
    E.missilesShot = 0;
    E.hitsDealt = 0;
    E.hitsTaken = 0;
    E.contactsDealt = 0;
    // (the term resets happened at the top, per seat, through
    // resetSeatUpgrades — termsFor derives rank-0 stock from here on)
    stock.keyThrust = true; // stock, and it STAYS stock across a restart — the
                            // ring's thrust is baseline equipment now, not a purchase
    G.bullets.length = 0;
    resetImpactFx(); // a restart is FX-clean, so burst seeds replay run to run
    // field by field, never a fresh makePlayer(): a restart deliberately
    // keeps aimAngle/aimOff/aimed, and every closure-held reference stays
    // live. Seats deal out along +x at seatGap intervals — seat 0 sits on
    // the exact centre, so the single-player spawn never moves.
    for (let s = 0; s < players.length; s++) {
      const pl = players[s];
      pl.ship.x = WW / 2 + s * ECFG.seatGap;
      pl.ship.y = WH / 2;
      pl.vel.x = 0;
      pl.vel.y = 0;
      pl.cool = 0;
      pl.shots = 0; // D60 (PORT-P): the muzzle alternation's parity goes back to rest with
                    // the ship, so a re-stamped seat starts on the same barrel every time.
      if (window.Abilities) Abilities.reset(pl); // ability 0's cooldown is pl.cool
                     // above; every other ability's whole slot record goes back
                     // to rest with it, so a restart cannot carry a cooldown,
                     // a fuse or a stale press into wave 1
      pl.flame.x = pl.flame.y = 0;
      pl.thrustAcc.x = pl.thrustAcc.y = 0;
      energyFill(s); // the pool is run state, so it restarts with the run — and
                     // AFTER the mods reset above, so the fill lands on the base
                     // cap the cleared ENERGY CELL rank leaves behind
    }
    cam.x = Math.max(0, Math.min(WW - FW, WW / 2 - FW / 2));
    cam.y = Math.max(0, Math.min(WH - FH, WH / 2 - FH / 2));
    cam.fromX = cam.x;
    cam.fromY = cam.y;
    cam.toX = cam.toY = -1; // flip retargets fresh
    cam.t = 1;
    gate.seeded = false; // the lookahead commit gate re-seeds too
    gate.timer = 0;
    // ---- ...AND THE SUCCESSOR PLANE (S3b lane 3, commit C) ---------------
    // LAST, so the ORDER IS THE HOST'S: production first, because its restart
    // is the GLOBAL discontinuity everything else in the tree already
    // resynchronizes across, and the kernel second. That order is
    // js/encounter-host.js's contract and this is the same order, not a second
    // opinion about it.
    //
    // IT IS HERE RATHER THAN AT EACH CALLER for one measured reason: this
    // function has FOUR live entry points on a flipped surface — the load-time
    // call at the tail of this file, the death screen's R key, `Net.restart`'s
    // upstream route and the `__test` seam — and a rule that has to be repeated
    // at four call sites is a rule three of them will eventually miss.
    //
    // THE SEED IS `ECFG.seed` when the caller named none, which is exactly the
    // stream `startWave(1)` above just reseeded from: one seed, both planes.
    // ...AND IT GOES THROUGH THE HOST (FIX 10 / S3BR-10). `resetKernel` resets
    // and RE-POSES every seat the host holds an accepted pose for, in one
    // operation — because `resetRun` rebuilds native live pilots at hull 100
    // and this call can land after the tick's only pose push. A reset that left
    // the re-pose to the next tick left a phantom pilot standing behind a dead
    // production seat for that tick.
    if (kernelDriving() && window.EncounterHost) {
      EncounterHost.resetKernel((seed === undefined ? ECFG.seed : seed) >>> 0);
      // ...AND PRODUCTION RE-POSES IN THE SAME STATEMENT (FIX 10 / S3BR-10).
      // `resetRun` rebuilds native live pilots at hull 100, and this call can
      // land AFTER the tick's only pose push — so without these two lines a
      // phantom kernel pilot stands behind the dead seat until the next tick.
      // `poseKernelSeats` is js/game.js's own per-tick push, called here rather
      // than copied, so the mirror is re-established from PRODUCTION'S state as
      // it is NOW — after the reset, not from the pose that preceded it.
      // `applyPosesNow` lands them on the records: the bridge BANKS for the
      // next step and there is no next step before this function returns.
      if (typeof poseKernelSeats === "function") poseKernelSeats();
      EncounterHost.applyPosesNow();
    }
  }

  // ---- IS THE SUCCESSOR PLANE DRIVING? (PORT-S S3b lane 3, commit C) ------
  // ONE PREDICATE, asked wherever the OLD WAVE MACHINE would otherwise run. It
  // is `installed()` and nothing more: a host is installed by a PAGE, and the
  // two lab pages that install one as a CAMERA load no js/game.js and no
  // js/encounter.js at all, so this function is never asked there. On the two
  // surfaces that do load this file — index.html and server/sim-host.mjs's vm —
  // an installed host is a driven kernel by construction.
  //
  // THE OLD PLANE IS DORMANT, NOT DELETED, and that is commit C's own line: the
  // ~1,860 lines go at commit D, once the flip is proved. Between the two, the
  // deal simply does not run, `E.groups` stays empty, `E.enemies` stays empty,
  // and every one of the sixty-three readers S3B-MAP enumerated sees the empty
  // plane it was measured against.
  // ONE frozen empty list rather than a fresh `[]` at each dormant walk — the
  // group loop runs every tick and an allocation per tick for a plane that does
  // not exist is a cost with nothing on the other side of it.
  const EMPTY_GROUPS = [];
    const kernelDriving = () => !!(typeof window !== "undefined" && window.EncounterHost
    && window.EncounterHost.installed());

  // ---- THE HUD'S MINIMAL STATE MAPPING (commit C) -------------------------
  // Production's UI reads four fields the old wave machine wrote. With the
  // machine dormant they are written from the kernel's director instead, and
  // the mapping is deliberately MINIMAL — four fields, no invention.
  //
  //   E.wave      <- S.wave, one for one.
  //   E.waveTick  <- S.waveTime x 60. The kernel counts SECONDS and every
  //                  production reader counts TICKS; the tick is the unit on
  //                  this side of the seam, so the conversion lands here.
  //   E.state     <- `warning` while the field carries no live body and
  //                  `active` while it carries one, which is exactly what the
  //                  old machine's own `warning -> active` line said.
  //   the banner  <- S.bannerText while S.banner is up.
  //
  // ---- THE ONE CENSUS (PORT-S S4, commit E) --------------------------------
  // `!dead && hp > 0`, counted ONCE, in the kernel, and read here through the
  // host. Three readers: this file's HUD state map, its `foeCount()` FOES line,
  // and — on the other side of the seam — the kernel's own clear gate. They
  // were two hand-rolled loops in this file before commit E, and the gate would
  // have been a third; D21 turns on whether a room is EMPTY, so a room that is
  // empty to the gate and not to the HUD is a defect with no symptom until it
  // is a deadlock.
  //
  // ---- ...AND ON EVERY SURFACE (S4-CX-2, the fix round) --------------------
  // THE ONE CENSUS WAS ONE PLANE SHORT. A net client steps NO simulation — the
  // loop's own fork says so, `js/game.js`'s `frameBody` calls `Net.clientTick()`
  // instead of `clientStep()` — so `EncounterHost.bodies()` is empty on it and
  // the room's bodies live in `Net.view().enemies`, which `mapState()` already
  // selects. The FOES line and the stall surface read the dormant local host
  // anyway: the map drew a constructor while the count said zero, and D21's
  // mandatory deadlock signal failed its own `foeCount() > 0` guard and never
  // appeared. Worse if the dormant kernel still held bodies — then both
  // described a room this screen is not in.
  //
  // ONE PROVIDER, then. The presentation body plane is asked for by one
  // function and `mapState` asks the same question, so "one census" is true on
  // the solo page, on the server's own sim and on a decoding client.
  //
  // (`?mp` is undeployable until R7 regardless — the wire fact — so nothing
  // observable moves today. This makes the HUD honest for that day rather than
  // leaving a known-wrong reader for it to be discovered on.)
  //
  // NULL WITH NO PLANE AT ALL, which is the truth on a page with no encounter.
  function presentedBodies() {
    if (typeof window === "undefined") return null;
    if (window.Net && Net.active() && Net.view) return Net.view().enemies;
    return window.EncounterHost && window.EncounterHost.installed()
      ? window.EncounterHost.bodies() : null;
  }
  // ...and the census over it, `!dead && hp > 0` — the kernel's own words. A
  // decoded body carries `hp: 1` and no `dead` key, so the same filter counts
  // the wire's rows without a second rule for them.
  const bodyIsLive = (b) => !!b && !b.dead && b.hp > 0;
  // ---- ...AND D39's ROLE, ON THIS SIDE OF THE SEAM (S4 fix 9) -------------
  // *"Hostile BODIES block; ordnance, hazards, fields, cues and non-hostile
  // transit never block."* The RULE lives in the kernel's registry and the
  // kernel publishes the question (`DemoKernel.blocksClear`), because the
  // BODIES this file counts are its own presentation plane's — on a net client
  // they are decoded rows the kernel never sees. So the reader crosses the seam
  // and the rule does not, and "one census" survives D39: a placed mine is not
  // a FOE and a leaving warden is not a FOE, here as in the gate.
  //
  // ---- R7 DEBT, CORRECTED AND NAMED (the HOLD round, fix 15) --------------
  // THIS NOTE UNDERSTATED IT. It said the wire carries a body's `type`, and the
  // scoped check measured that it does not: wire v10 encodes EVERY successor
  // body as `ty: -1` (`server/snapshot.mjs:316`) and the client decodes `dart`,
  // `hp: 1`, with no `state` (`js/net.js:416,2424-2475` — the band stops one
  // line short in the note this corrects: `hp: 1` is CONSTRUCTED at `:2473`,
  // inside the enemy record the decoder builds, so a band ending at `:2455`
  // names the fallback and not the line that spends it). So on a decoding
  // client D39's roles cannot be applied AT ALL — a real decoded mine and a real
  // spent warden both BLOCK and both count as FOES — and the miss is a whole
  // room's worth, not one warden's 4.5 s.
  //
  // THE SEAT DEFERRED IT TO R7 BY NAME (finding 1): the fix is the WIRE, a kind
  // index and the body's state at v11, which R7 owns and PORT-S does not, and
  // `?mp` is undeployable until R7 regardless. `tests/net-checks.js`'s
  // `(R7 BILL)` legs assert the limit as the current contract, so the day the
  // wire grows those fields a green suite says so. Solo and the server's own
  // sim — which is where the authoritative gate runs — are exact.
  const bodyBlocks = (b) => {
    if (typeof window === "undefined" || !window.DemoKernel
        || typeof window.DemoKernel.blocksClear !== "function") return true;
    return window.DemoKernel.blocksClear(b);
  };
  const bodyGates = (b) => bodyIsLive(b) && bodyBlocks(b);
  // 0 WITH NO PLANE INSTALLED, which is the truth on a page with no encounter.
  const kernelFoes = () => {
    const bodies = presentedBodies();
    if (!bodies) return 0;
    let n = 0;
    for (let i = 0; i < bodies.length; i++) if (bodyGates(bodies[i])) n++;
    return n;
  };

  // ---- THE STALL TRACKER (PORT-S S4, commit E) -----------------------------
  // MODULE STATE, NOT `E` STATE, and never hashed. What a room's HUD says about
  // being stuck is a fact about PRESENTATION: a client decodes `E` off the wire
  // every tick and computes this line for itself from the bodies it already
  // has, so a value carried in `E` would be a value the wire had to carry and
  // `hashEncounter` had to fold. `stallSeen` starts at -1, which no census can
  // return, so the first frame of any run arms the clock rather than inheriting
  // one. `restart()` puts it back.
  let stallSig = "";     // the SIGNATURE when the clock last restarted (D39)
  let stallSince = 0;    // ...and the waveTick it restarted on
  let stallRoom = "";    // ...and WHICH ROOM it was restarted in — see below
  let stallFired = false; // ...and whether THIS episode has already spoken

  // ---- D39's STALL SIGNATURE (the SEVENTH AMENDMENT, S4 fix 9) -------------
  // The tracker watched the LIVE COUNT alone, which is the weakest of the three
  // things a fight moves. demo-v4's signature is the shape the ruling names:
  //
  //   hash( blocking count , blocking hull sum to a tenth , blocker damage )
  //
  // Each term catches what the others cannot. The COUNT misses a fight nobody
  // is winning yet. The HULL SUM catches every point of damage that lands — a
  // boss being ground down for two minutes changes it every second. The DAMAGE
  // EVENTS catch the case both others miss: a shot that lands on a shield or an
  // invulnerable phase and moves no hp at all (this kernel has both — the
  // bulwark's shield and the snapper's `vulnerable: false`).
  //
  // THE TWO CORRECTIONS THE SCOPED CHECK ASKED FOR (fix 11), both to match
  // demo-v4's accepted signature exactly:
  //   * THE HULL SUM IS SUMMED FIRST AND ROUNDED ONCE, to a TENTH. S4 rounded
  //     each hull to an integer and summed those, which discards a fraction per
  //     body — twenty bodies losing 0.4 hp each moved nothing at all.
  //   * THE DAMAGE TERM IS THE KERNEL'S BLOCKER COUNT, not this file's cue
  //     stream. Counted off `emit`, a pilot firing into a WALL kept an
  //     unreachable blocker from ever stalling; a PvP blast and a shot into a
  //     nonblocking mine did the same. `DemoKernel.blockerDamageSeen()` counts
  //     player-credited damage applied to a BLOCKING body and nothing else.
  //
  // ONLY BLOCKERS ARE SUMMED, which is D39 again: a drifting mine's hp is not a
  // thing the room is waiting for, so shooting one is not progress toward the
  // clear and must not reset a deadlock clock.
  //
  // R7 DEBT, STATED, and fix 11 widened it: on a decoding client every body
  // arrives with `hp: 1` (js/net.js's fallback — the wire carries no body hp
  // until R7), so the hull term degenerates to the count; and the damage term
  // now comes from the LOCAL kernel, which a net client does not step, so it is
  // frozen there. A net client's signature is therefore its blocking count
  // alone. That is the same R7 bill the client census already carries (a
  // decoded body has no kind and no state — see `bodyBlocks`), and it is
  // deferred with it by name. Solo and the server's own sim are exact.
  //
  // A STRING, not a number: three integers joined is a total order-free
  // identity, cheap, allocation-per-frame only on the one draw that reads it,
  // and readable in a failure message — which a folded 32-bit hash is not.
  // "" is the armed value because no census can produce it.
  const blockerDamageSeen = () => (typeof window !== "undefined" && window.DemoKernel
    && typeof window.DemoKernel.blockerDamageSeen === "function"
    ? window.DemoKernel.blockerDamageSeen() : 0);
  // ---- THE DETECTOR RUNS IN THE SIM STEP (the HOLD round, fix 12) ---------
  // IT LIVED IN `drawHud()` AND THAT WAS WRONG, and the scoped check found the
  // exact shape of the wrong: the AUTHORITATIVE server calls `stepSim()` and
  // drains `events[]` WITHOUT EVER DRAWING, so the one-shot `stall` event D39
  // requires could never enter the stream that matters. A surface only a screen
  // can raise is not an observable; it is a pixel.
  //
  // SO THE ADVANCE IS A SIM STEP and the draw is a READ. `encStep` calls this
  // once per tick, right after `applyKernelHud` — where the census, `E.state`
  // and `E.waveTick` are all this tick's — and the draw paints whatever this
  // decided. Two consequences, both wanted: the event enters the authoritative
  // stream (the server emits it, the wire carries it as any cue does, and
  // production's own drain hands it on), and a paused or unfocused client can no
  // longer disagree with the room about whether it is stuck.
  //
  // A NET CLIENT DOES NOT STEP THE LOCAL SIM (`js/game.js`'s frame fork calls
  // `Net.clientTick()` instead of `clientStep()`), so on a decoding client this
  // never runs and the banner never lights. THAT IS PART OF THE R7 BILL already
  // recorded at `bodyBlocks` and `stallSignature`: a decoded body carries no
  // kind and no state, so the client's census cannot apply D39's roles anyway,
  // and `?mp` is undeployable until R7 regardless. When R7 puts the kind and the
  // state on the wire, this detector reads the decoded plane through the same
  // `presentedBodies()` provider and lights on a client too — no second copy.
  let stallActive = false;  // ...the surfaced state the draw reads
  function advanceStall() {
    // The same two guards the draw used to carry: a room is `active` exactly
    // when a live body is on the field, and the census guard is what keeps a
    // staged state with no host installed from surfacing a sentence about
    // nothing. Outside them the detector holds its clock rather than clearing
    // it — a break is not a room that stopped being stuck.
    if (!(E.state === "active" && foeCount() > 0)) { stallActive = false; return; }
    const foes = foeCount();
    // the room's identity FIRST: a boundary re-arms the clock whatever the
    // signature does, so a fresh room can never inherit an old room's timestamp
    const room = stallIdentity();
    if (room !== stallRoom || E.waveTick + 60 < stallSince) {
      stallRoom = room;
      stallSig = "";
      stallFired = false;
    }
    const sig = stallSignature(foes);
    if (sig !== stallSig) { stallSig = sig; stallSince = E.waveTick; stallFired = false; }
    stallActive = E.waveTick - stallSince >= ECFG.stallTicks;
    // ---- AND IT SPEAKS ONCE PER EPISODE (D39) -------------------------
    // It rides `events[]` like any cue and carries no wire field. ONCE: the
    // flag is cleared by a moving signature or a room boundary, which are the
    // only two ways an episode can end. No golden trace stalls, so no fixture
    // carries one — proven at the gate, not assumed.
    if (stallActive && !stallFired) {
      stallFired = true;
      emit("stall");
    }
  }

  const stallSignature = (foes) => {
    const bodies = presentedBodies();
    let hull = 0;
    if (bodies) {
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        if (bodyGates(b)) hull += b.hp;
      }
    }
    // SUMMED FIRST, ROUNDED ONCE, TO A TENTH — demo-v4's own arithmetic. The
    // tenth is what keeps a float tail from making a still room look busy while
    // still seeing a fifth of a point of damage across a whole room.
    return foes + ":" + (Math.round(hull * 10) / 10) + ":" + blockerDamageSeen();
  };

  // ---- THE CLOCK RE-ARMS ON A ROOM BOUNDARY (S4-CX-4, the fix round) -------
  // `restart()` put these back and nothing else did. An ordinary setpiece
  // transition does not call it, and the production WIPE deliberately does not
  // either (see the wipe block's four "restart() may, a wipe may not" clauses)
  // — so a new room whose first pack happened to hold the same number of
  // bodies INHERITED the old room's timestamp. Measured by the review: old wave
  // 9 last saw six bodies at wave tick 2400; a wipe opens a fresh wave 1 with
  // six bodies at wave tick 100; at fresh tick 1900 the count had been
  // unchanged for the required 1800 ticks and the surface was still off — it
  // arrived at 4200. That delays a MANDATORY deadlock signal by 2,300 ticks,
  // and D21(a) has no other visibility.
  //
  // THE IDENTITY, and why it is three parts:
  //   the WAVE, which changes at every ordinary transition and at a wipe from
  //     any setpiece past the first;
  //   the CYCLE, which is what distinguishes setpiece 4 of this arc from
  //     setpiece 4 of the next. It is read through the local kernel and is
  //     absent on a net client, where the wire carries no cycle — every arc
  //     turn also turns the wave, so the wave half covers it there;
  //     AND IT IS PRESENTATION-ONLY, and stays so: `E.loop` is production's own
  //     arc loop counter, hashed and written by this file (PORT-S S7), and it
  //     is what a SIM decision — the market's deal key — is allowed to read.
  //     `S.cycle` is read HERE and nowhere else, for this unhashed clock;
  //   and the ROOM CLOCK GOING BACKWARDS, which is the one signal that catches
  //     a wipe of setpiece 1 INTO setpiece 1, where neither number moves.
  //     `E.waveTick` cannot fall inside a room, so a fall is a new room.
  //
  // THE 60-TICK MARGIN on that last clause is the presented clock's slew. On a
  // net client `E.waveTick` is LERPED between two snapshots and the adaptive
  // depth walks the presented moment by up to a handful of ticks, so a bare
  // `<` would re-arm on ordinary jitter and a jittering client would never
  // surface a stall at all. One second is a 10x margin on that slew and a
  // thirtieth of the 1,800-tick window, so the worst case this leaves is a
  // wipe of setpiece 1 before its own 60th tick, whose inherited timestamp is
  // then at most 60 ticks stale.
  const stallIdentity = () => {
    const cycle = typeof window !== "undefined" && window.DemoKernel
      && window.DemoKernel.S ? window.DemoKernel.S.cycle : 0;
    return E.wave + "/" + cycle;
  };

  // WHICH SOURCE IS HOLDING THE ROOM. Read off the kernel's own declared list
  // — `DemoKernel.SPAWN_SOURCES`, which `test/node-golden.mjs`'s (c5) census
  // holds against a scan of the kernel in both directions — so a source added
  // to that file without a row there cannot end up unnamed here. The label is
  // the STATS row's own, which is what the banner already prints.
  //
  // ASCENDING OVER THE BODY LIST, so a room holding two sources names the same
  // one on every frame instead of flickering between them.
  // ...OVER THE SAME PLANE THE COUNT READS (S4-CX-2). The published list is a
  // fact about the kernel and travels with the page; the BODIES are whichever
  // plane this surface presents. A decoded row carries its `type` string
  // verbatim (js/net.js's `wireType`), so the lookup is the same lookup.
  function stallSourceLabel() {
    const K = typeof window !== "undefined" ? window.DemoKernel : null;
    const bodies = presentedBodies();
    if (!K || !Array.isArray(K.SPAWN_SOURCES) || !bodies) return "";
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (!bodyIsLive(b)) continue;
      if (K.SPAWN_SOURCES.indexOf(b.type) < 0) continue;
      const st = K.STATS && K.STATS[b.type];
      return String((st && st.label) || b.type).toUpperCase();
    }
    return "";
  }

  // ---- `cleared` AND `E.clearTick` ARE MAPPED NOW (PORT-S S4, commit E) ---
  // What stood here was a REFUSAL and it named the round that would end it:
  // *"`cleared` AND `E.clearTick` HAVE NO KERNEL SOURCE ... Production's 10 s
  // break (`ECFG.clearHold` 480, the OWNER'S RULING S-bpzbzy) and D21's
  // clear-to-advance are S4's work ... with no `cleared` state the WAVE CLEAR
  // card does not show and the cleared-banner orb sweep does not run. Both are
  // S4's to restore."* They are restored here.
  //
  // THE KERNEL'S DIRECTOR NOW HAS AN INTER-WAVE PHASE. It clears a setpiece
  // when the room has cleared what it dealt (D21) and then holds for
  // `CLEAR_HOLD` seconds before dealing the next. `clearHoldLeft()` is what is
  // left of that hold, in seconds, and 0 whenever no break is running — so the
  // question "is the room in its break" is one call with no threshold of this
  // file's own.
  //
  // `E.clearTick` IS DERIVED, NEVER STORED TWICE. Production's six `cleared`
  // consumers all read `E.waveTick - E.clearTick` against `ECFG.clearHold`, so
  // what they need is the waveTick the break BEGAN on. The kernel's wave clock
  // keeps running through the break, so that tick is this tick minus the part
  // of the hold already spent — and because both terms advance by one per tick,
  // the value is CONSTANT for the length of the break, which is exactly what a
  // hashed field written every tick has to be.
  //
  // THE SAME NUMBER TWICE, AND A LEG HOLDS THEM EQUAL. `ECFG.clearHold` (480
  // ticks) and the kernel's `CLEAR_HOLD` (8 seconds) are one break in two
  // units; `test/tools/demo-director.mjs` asserts the equality, because two
  // dials for one break is how they drift and the countdown numeral would be
  // the first thing to lie about it.
  //
  // `dead` IS NOT MAPPED, and for the reason it never was: it is PRODUCTION'S,
  // written by its own death path, and the kernel has no opinion about
  // production's death screen.
  function applyKernelHud() {
    const K = window.DemoKernel;
    if (!K || !K.S) return;
    const S0 = K.S;
    // ---- THE ARC TURN, COUNTED (PORT-S S7) -------------------------------
    // The kernel ends its arc with `S.cycle++` then `startWave(1, false)`, so
    // the ONE observable of a turn on this side is the mirrored wave FALLING.
    // There is no write of E.wave anywhere in the dev-jump chain to hook
    // instead: the setpiece lever (the 'dev'-prefixed jump this file reaches
    // through EncounterHost, spelled ONCE in this file and counted by
    // test/node-golden.mjs) moves the KERNEL's wave and E.wave follows here.
    // SO A DOWNWARD DEV JUMP READS EXACTLY LIKE AN ARC TURN and increments the
    // loop. That is stated here so a latency-rig run that selects a lower
    // setpiece and then sees a fresh market hand is read as this rule, not as
    // a market defect.
    //   The WIPE does not reach this line: its own startWave(1) writes E.wave
    // before the next tick's mirror runs, so the fall is never observed here.
    // It counts its own loop, at its own site.
    if (Number.isFinite(S0.wave) && S0.wave < E.wave) E.loop++;
    if (Number.isFinite(S0.wave)) E.wave = S0.wave;
    if (Number.isFinite(S0.waveTime)) E.waveTick = Math.round(S0.waveTime * 60);
    // ONE CENSUS, and it is the kernel's — the same call `foeCount()` makes and
    // the same one the clear gate itself reads. This file used to walk the body
    // list here and `foeCount` used to walk it again a thousand lines below;
    // two copies of a census is how a gate and a HUD come to disagree about
    // whether a room is empty.
    const live = kernelFoes();
    const held = K.clearHoldLeft ? K.clearHoldLeft() : 0;
    if (E.state !== "dead") {
      if (held > 0) {
        E.state = "cleared";
        const hold = Number.isFinite(K.CLEAR_HOLD) ? K.CLEAR_HOLD : 0;
        E.clearTick = E.waveTick - Math.round((hold - held) * 60);
      } else {
        E.state = live > 0 ? "active" : "warning";
      }
    }
    E.kernelBanner = S0.banner > 0 ? String(S0.bannerText || "") : "";
  }

  // ---- per-tick update — called from game step() after the bullet sweep --
  function encStep() {
    if (E.state === "idle") E.state = "warning"; // the first played tick opens Wave 1
    if (frozen()) return; // double safety — game step() already gates these
    // ---- THE FLIP (commit C): the successor plane owns the wave machine ---
    // With the kernel driving, the whole old machine below — the clear
    // elevator, the fast-clear slide, the schedule hold, the group loop, the
    // warning/active line and the clear gate — is dormant, and the four HUD
    // fields it wrote come from the kernel's director instead. Everything else
    // in this function is the KEEPS half (PvP rams, the rebate resolve, orbs,
    // the seat grace loop, the wipe, the claim/respawn loop, shipPrev, the pose
    // ring) and runs unchanged: those are production's and stay production's.
    const flipped = kernelDriving();
    if (flipped) applyKernelHud();
    // ---- D37'S DEAL, AT THE CLEAR (PORT-S S7) ----------------------------
    // OUTSIDE the `flipped` guard on purpose. It reads `E.state`, `E.wave` and
    // `E.loop` — whoever wrote them — so a surface with no kernel driving it,
    // or a check that stages `E.state = "cleared"` itself, reaches the same
    // rule through the same line. A deal gated on `flipped` would be a second
    // predicate that could disagree with the state it is reading.
    //
    // KEYED ON THE WAVE BEING CLEARED, NOT ON THE WAVE THE KERNEL ADVANCES TO.
    // The kernel holds `S.wave` at the cleared setpiece for the whole 480-tick
    // break and only calls `advanceWave` when the hold reaches zero, so the
    // hand dealt here IS the hand the player shops with during the break. That
    // break is the shopping window the owner already ruled at 10 s.
    //
    // AN IDENTITY, NEVER AN EDGE. `E.state === "cleared"` is RE-DERIVED every
    // tick of the break, so an edge would re-deal 480 times. Comparing the
    // identity this clear WOULD deal against the one standing makes the check
    // idempotent by construction — demo-v4's `marketId` idea, by spec.
    //
    // THE ARC TURN needs no special case: wave 16's clear deals (16, L); the
    // turn tick has no hold left, so `E.state` is not `cleared` and nothing
    // deals; wave 1's clear then deals (1, L+1), a different identity from the
    // (1, L) this arc opened with. One deal per clear, across the turn.
    {
      const rewardWave = rewardWaveOf(E.wave);
      if (E.state === "cleared" && dueForReward(E.wave)
          && !(E.marketWave === E.wave && E.marketLoop === E.loop)) {
        dealAll(rewardWave, E.loop);
      }
    }
    // ...and D17's PARK RELEASE, immediately after the map that decides the
    // boundary (S4 commit F). It reads `E.state === "cleared"`, so it has to
    // run after the tick's own HUD write and before the claim/respawn loop
    // below — a joiner released here is dealt its claim window on THIS tick and
    // is PRESENT for the deal the break ends with, which is exactly what D17's
    // row promises. Costs nothing when nobody is parked.
    if (flipped) releaseParkedJoiners();
    // ...and D39's STALL DETECTOR, on the same footing and for the same reason
    // (the HOLD round, fix 12): it reads the census and `E.waveTick` this tick's
    // HUD write just established, and it EMITS — so it has to run inside the
    // step, on the authoritative server as much as on a page. See
    // `advanceStall` for why it is not in the draw any more.
    if (flipped) advanceStall();
    // the clear banner has held long enough — deal the next wave. The world
    // never froze here: the banner faded over the same ticks the orb sweep
    // banked the field, and the shop panel was live throughout. The return
    // is load-bearing: it skips E.waveTick++ and the whole spawn/step/reap
    // tail, so no simulation advances on the dealing tick (startWave zeroes
    // waveTick) and the new wave's group loop still evaluates at tick 1.
    // ...and a pending WIPE outranks the elevator. An arm made outside encStep
    // — __test.damagePlayer, or the server's dev seat-kill lever in
    // server/server.js, whose key this file deliberately does not spell (js/
    // mirrors to a PUBLIC site; server/ does not) — can land on a
    // clear-elevator tick; without the term this return would deal wave N+1
    // and the consume below would throw it away one tick later, two deals and
    // two reseeds paid for one wipe.
    // ---- THE DORMANT WAVE MACHINE IS DELETED (S3b lane 3, commit D5) -----
    // Commit C made these branches DORMANT against `flipped`; this commit
    // deletes them, and with them the last of production's own wave clock.
    // What went, and what each one was:
    //
    //   THE CLEAR ELEVATOR — the `cleared` banner's hold, its `startWave(E.wave
    //     + 1)` and the load-bearing `return` that kept the dealing tick from
    //     advancing the sim. It dealt a wave, and there is no dealer.
    //   `E.waveTick++` — production's own wave clock. `applyKernelHud` writes
    //     `E.waveTick` from the kernel's director on every tick, so the
    //     increment was writing a field that was overwritten before anything
    //     read it.
    //   THE FAST-CLEAR SLIDE — it walked pending `E.groups` forward when the
    //     field was settled. There are no groups and no field of production's
    //     to settle.
    //
    // AND WITH NO HOST INSTALLED THE HUD FIELDS SIMPLY STAND STILL. That is
    // the honest end state and it is the point of the retirement: there is no
    // second wave machine to fall back to. Every page that runs production
    // installs the host unconditionally and throws if it refuses (commit C).
    // THE SCHEDULE HOLD (the user's call). While NO seat is flying, the pending
    // schedule does not close on the field: every pending group's warnAt and
    // spawnAt walk forward one tick per tick, so the schedule is frozen
    // RELATIVE to the field and resumes with its committed offsets intact —
    // 36 and 126 for wave 1's first pack — measured from the tick a ship is
    // actually back. Nothing spawns while the field is empty of players.
    //   Why the schedule moves rather than the clock: E.waveTick is read by the
    // draw (the radar sweep, the halo pulse), by the clear elevator's
    // waveTick − clearTick term and by the fast-clear slide above, and stopping
    // it would stall all four for the whole absence. Moving the two group
    // fields moves exactly the thing being held and nothing else.
    //   Why ROLLING rather than one slide at the wipe. The earlier rule slid the
    // whole schedule ONCE, by the shortest live timer at the instant of the
    // wipe. That was right when the return time was KNOWN — a fixed respawn
    // countdown — and it is wrong under the claim rule, where the countdown only
    // drops the seat into an 1800-tick window and the real return time is
    // unknown until a hand moves. Solo it dealt pack 1 at waveTick 725 against a
    // window with 1674 ticks still to run: three darts into an empty field,
    // every body stamped tgtSeat −1, converging the moment the player clicked
    // back in. A room where every seat was ABSENT carried no timer at all, so it
    // slid by nothing and dealt the whole pack for the reclaimer to walk into.
    // A rolling hold needs no estimate of the return, so it is correct for every
    // return time including never.
    //   It sits BELOW the fast-clear slide deliberately. That slide pulls the
    // next group's warnAt down ONTO this tick, so a hold running above it would
    // add its tick and the slide would take the same tick straight back — and
    // the group would warn on the spot. Below it the +1 is the last word, and
    // the two settle at warnAt === waveTick + 1: held, one tick out, for ever.
    // (The ordinary wipe never reaches that pairing — startWave leaves E.state
    // at "warning" and the slide is "active"-only — but the arm and the apply
    // share a tick, so an empty field CAN be seen in "active" and the order has
    // to be right rather than merely unreached.)
    //   Only PENDING groups move. A spawned group's warnAt/spawnAt are spent
    // history that nothing reads again, and they are HASHED — walking them
    // would move the state hash every tick of an absence for no behaviour.
    // ---- THE SCHEDULE, THE GROUP LOOP AND THE ENEMY SLICE ARE DELETED ----
    // PORT-S S3b lane 3, commit D4, and this is the last of S3B-MAP's nine
    // ENTANGLEMENTS: `encStep` was ONE 423-line function serving both halves,
    // interleaving at nine points, and the ordering comments below were
    // load-bearing — each said which kill lands first and why.
    //
    // THE KEEPS-HALF ORDER IS PRESERVED VERBATIM, which is what the split
    // owed. Every surviving comment below is the one that was there, in the
    // place it was, saying what it said. The enemy-half calls are gone and
    // the reasons the keeps half gave for sitting BETWEEN them are kept,
    // because they are still the reasons: a ram kill still lands before the
    // bullet pass, the rebate resolve still shares the live pass's slot, and
    // the reap that used to follow the wall blasts is the successor plane's
    // own now.
    //
    // WHAT WENT: the schedule hold, the group loop, the `warning -> active`
    // line, `stepMissiles`, the `stepEnemy` walk, `resolveContacts` and
    // `reapDead`. `resolveWallBlasts` STAYS — see its own block above.
    // ---- THE DEATH WINDOW OPENS (S3b lane 3, FIX 1 / S3BR-01) -----------
    // Every production path that can hurt a successor body runs between this
    // line and the flush below: the comet ram, the rebate's queued winners,
    // the live bullet sweep and the wall blasts. A kernel body killed by any of
    // them is MARKED here and dies at the flush — which is `reapDead`'s own
    // slot, the one S3B-MAP calls load-bearing and the one the deletion had
    // quietly moved by handing production a synchronous door.
    //
    // IT IS ARMED UNCONDITIONALLY AND FLUSHED UNCONDITIONALLY, on a page with
    // a host and a page without: the facade answers false/0 when it is not
    // installed, so the pair costs an un-hosted tick two function calls and no
    // branch of its own here. A conditional arm would be a second predicate
    // beside `flipped` that could disagree with it.
    const KH = typeof window !== "undefined" && window.EncounterHost;
    if (KH) EncounterHost.armKernelDeaths();
    resolvePvpRams();
    resolveCometBodyRams(); // FIX 2 — the comet's BODY ram, beside its ship twin
                            // and inside the window: a ram kill lands before
                            // the bullet pass, which is the keeps-half order
    applyRebateHits(); // the drain's queued rebate winners pay HERE — the
                       // slot live bullet damage occupies, so a rebated kill
                       // and a live kill share one timing (corrective pass 2)
    resolveBulletHits();
    resolveWallBlasts(); // after the sweep, and its comment's second half — "before
                         // the reap" — went with the reap. A wall blast still reaches
                         // the successor plane's bodies through blastAt's own arm.
    // ...AND THE REAP, restored to its own slot. Every marked body's kill cue,
    // its bounty and its death CHILDREN land here — after the shot that killed
    // it emitted `hit` and resolved its blast, so a minelayer's three mines are
    // born into a field the killing blast has already left.
    //   THE CREDIT RIDES THE FLUSH UNCHANGED. `lastAtk` was stamped by the
    // damage itself, through the R5 funnel, at the moment the blow landed; the
    // kill cue reads that same field here and the wallet is paid once, by the
    // one `killEnemy` this body will ever get.
    if (KH) EncounterHost.flushKernelDeaths();
    reapRamClaims(); // ...and the rammed body's claim dies WITH it (FIX 14) —
                     // the retired `contactEvent` kept its window on the body,
                     // so a reap took the window too. Called here, after the
                     // flush, so that is true in the same tick.
    // ---- D26'S STAGED CHILDREN LAND HERE (PORT-S S5, commit D) -----------
    // The aura kills inside the KERNEL's own tick, which runs before this
    // combat window opens. A child materialized there would be born inside the
    // halo that killed its parent and would carry a degenerate previous
    // position through every swept test in the same tick. So the kernel STAGES
    // the aura's own births and this line materializes them — after the rams,
    // the rebates, the rounds, the wall blasts and the death flush, with the
    // window closed behind them. First eligibility is the NEXT tick.
    //
    // IT IS NARROW ON PURPOSE: only the aura's children are ever queued, so
    // this call is a no-op on every tick with no comet and the whole
    // no-comet path stays byte-identical.
    if (KH) EncounterHost.flushKernelChildren();
    stepOrbs();
    for (const S of E.seats) { // every seat's grace and flash tick down together
      if (S.invuln > 0) S.invuln--;
      if (S.hitFlash > 0) S.hitFlash--;
    }
    // THE WIPE, sampled. This phase is the one moment in the tick where "every
    // death has landed" and "no seat has been revived yet" are both true, and
    // that is what makes the window INCLUSIVE: two seats dying respawn-1 ticks
    // apart still wipe, and the first of them is dealt back in by the loop just
    // below on this very tick. The condition is RE-READ rather than trusted
    // from the arm, so an arm whose seat was revived in between (respawnSeat is
    // a direct hook as well as the timer's own path) is discarded here; the
    // flag clears either way, which is what makes the edge one-shot.
    const wipeNow = E.wipePending && E.state !== "dead" &&
                    !players.some((_, s) => seatAlive(s));
    E.wipePending = false;
    // Downed seats wait out their timers, ascending; a timer reaching zero
    // deals the seat back in on THIS tick, before shipPrev records below —
    // but ONLY behind a click. The timer used to re-deal on its own, and an
    // abandoned tab therefore kept a ship dying and respawning in a room its
    // player had left; the deal now needs a press, and the wait for one is
    // finite. The gate lives HERE, in the sim, so solo and net share one rule
    // and one code path: a net client never steps its own encounter, so this
    // runs on the server in net play and in the local sim solo, which is the
    // whole point of putting it here rather than behind a mode flag.
    // ...and the one press the ALL-ABSENT re-deal reads. A wave dealt while
    // every seat was parked produced ZERO groups (the presence gate), and
    // nothing re-deals on its own — "nobody returns unasked". The press that
    // deals a seat back INTO that starved field is the ask, and it is an EDGE
    // sampled here, in the two branches a RECLAIM can land in, never derived
    // from state at rest: the suites (and the shop legs) stage `E.groups = []`
    // with live seats all the time, and a level-read would re-deal under every
    // one of them. The edge asks for BOTH halves of the starved room — no
    // groups AND no living seat — which in production say the same thing
    // (only an all-absent deal is empty), so the second half costs nothing
    // live and keeps a staged empty list beside a flying ship from ever
    // re-dealing. The respawnT branch is deliberately NOT sampled — a seat
    // with a countdown running was PRESENT at its wave's deal, so its wave has
    // groups and the empty-deal case cannot reach that branch at all.
    //   ON THE LIVE SERVER this state is hard to reach, not dead: every
    // transition into all-absent passes a sweep that calls endRoomIfOver, and
    // roomReset usually stops the loop before an all-absent tick ever runs.
    // The surviving window is a seat whose sim claim window lapses inside
    // encStep while a socket GRACE is still pending (absent, no ws, lapseAt
    // still armed) — both server sweeps skip that shape, and the room ticks
    // all-absent until the grace expires. The fixtures reach the state
    // directly through the test seam. Do not delete this as dead code.
    // (`emptyDealAsk`'s `E.groups` half is deleted at commit D5 with the
    //  schedule. Its whole reader — the all-absent re-deal — is deleted below,
    //  so the derivation goes with it and `reclaimedIntoEmptyDeal` is left as
    //  the loop's own record of a reclaim into a starved room, unread.)
    const emptyDealAsk = () => !players.some((_, i) => seatAlive(i));
    let reclaimedIntoEmptyDeal = false;
    for (let s = 0; s < E.seats.length; s++) {
      const S = E.seats[s];
      const press = claimPress(s);
      if (S.hull > 0) continue;
      if (S.absent) {
        // the RECLAIM. A press on a parked seat takes it back — and it can only
        // reach here from a client the server has bound to this seat, which is
        // what keeps a seat nobody is behind from dealing itself in
        // ...and it is REFUSED while the seat is PARKED (S4-CX-1, the fix
        // round). D17 parks a mid-setpiece grant so that no joiner lands
        // inside a telegraph it did not see begin — and this door read only
        // `S.absent`, which a parked seat is, so a grantee who clicked before
        // the clear flew straight into the ongoing telegraph. The press is
        // REFUSED, not queued: `releaseParkedJoiners` opens a full claim
        // window at the clear, and the card that invites the click is the one
        // that appears then, so a press from before the invitation says
        // nothing about it. The same edge, arriving one tick after the
        // release, is read here as the ordinary reclaim it now is.
        if (press && !joinParked[s]) {
          if (emptyDealAsk()) reclaimedIntoEmptyDeal = true;
          S.absent = false;
          respawnSeat(s);
        }
      } else if (S.respawnT > 0) {
        // the press is READ on the expiry tick, and it is an EDGE, not a level.
        // claimPress is latched off bit 0 of a frame's `ap` mask — the presses that began
        // inside that tick — so a player who holds the button down through the
        // whole countdown asserts nothing here and is NOT dealt back: the timer
        // expires unclaimed and the seat falls through to the claim window below,
        // where a fresh click still takes it. That is the feature, not a gap in
        // it. A held button is the one piece of state an abandoned tab reliably
        // leaves behind — the whole HELD mask `ah` rides every frame a dead tab
        // sends, which is why neutralizeHeldBanks exists and why frameIsActive
        // refuses it — so a level would deal the seat back to nobody and put the ghost
        // ship straight back on the field this gate was written to clear. Only an
        // edge is evidence that a hand moved, and the card says "click", so the
        // rule and what the player is told are the same sentence. Reading it on
        // the expiry tick rather than remembering an earlier one is the same
        // argument one step further in: a press from four seconds ago proves
        // somebody was there four seconds ago, and the whole question is whether
        // they are there now.
        if (--S.respawnT === 0) {
          if (press) respawnSeat(s);
          else S.claimT = ECFG.player.claim;
        }
      } else if (S.claimT > 0) {
        if (press) {
          // the ordinary window's press — and the OTHER route a reclaim takes:
          // the server's grant goes through reseatSeat, which turns a parked
          // seat into exactly this waiting one, so the click that answers an
          // all-absent field lands here rather than on the absent branch above
          if (emptyDealAsk()) reclaimedIntoEmptyDeal = true;
          S.claimT = 0;
          respawnSeat(s);
        } else if (--S.claimT === 0) unseatSeat(s);
      }
    }
    // ...and APPLIED, BELOW that loop. The split is the whole reason there are
    // two halves: respawnSeat draws rand() through rollAnchor, so a startWave
    // sitting above the loop would reseed the stream with a draw still ahead of
    // it and break startWave's own charter — every wave reproducible on its
    // own. Nothing below here draws (recordPoseRow only gathers), so the reseed
    // is once again the tick's last act.
    // A wipe is a NEW RUN, and it is NOT a re-deal. It takes everything
    // restart() takes OF THE RUN — the wallet, the score, the board, the ranks,
    // the bought hull cap, the life stock and the whole field — and it deals
    // nobody back in. Every PRESENT seat keeps the ordinary death progression it
    // is already in: the countdown keeps counting into the fresh run, the claim
    // window still opens behind it, and the player's own press is what puts a
    // ship on the new wave 1. Both owner rules therefore hold at once — a wipe
    // is a true new game, AND a seat is only ever re-entered by somebody who
    // asked for it — and solo and net keep the single rule, which is the whole
    // reason the gate lives in the sim rather than behind a mode flag.
    //   An earlier pass had this block deal every present seat straight back in.
    // Solo that made the death which opens the countdown the same death that
    // arms the wipe, so the 10 s countdown, the 30 s claim window and the AFK
    // release were all unreachable in one-seat play — the feature was dead in
    // the mode most of it is played in.
    //   It stops short of CALLING restart() in four places, and each one is
    // something restart() may do that a wipe may not:
    //   EVENTS stands. The cue that armed this wipe is queued in it right now
    //     — restart() clears the queue so no stale cue sounds over a new run's
    //     opening tick, which is right for a cut nobody was told about and
    //     wrong for one a death just announced. It is also what lets the
    //     termChange markers below ride the SAME drain the death cue does.
    //   the FX stand. resetImpactFx() is not called, so the ship blast the
    //     death spawned still burns on every client — a wipe that swallowed
    //     the explosion that caused it would read as a stall, not a reset.
    //   nextEntityId stands. restart() sends it back to 1 so a SEEDED run
    //     reproduces its ids exactly; a wipe lands mid-run and can promise no
    //     such thing, and restarting the counter here would break the one thing
    //     the ids DO promise. js/net.js's tracer hand-off is a high-water mark
    //     over own-bullet ids and its missile trails are keyed by id, and both
    //     rest on "entity ids are monotonic" — a fresh bullet 1 would be
    //     measured against the ledger of the bullet 1 that died with the old
    //     run. Left counting, nothing collides and no client has to be told
    //     anything: the earlier pass restarted it, had to buy a match-epoch
    //     bump to make that survivable, and the bump's resync() then deleted
    //     every death cue the player had not been shown yet.
    //   the SEATS are not dealt — no hull, no pose, no cleared timer. That is
    //     the owner's call above, and the per-seat loop says which fields it
    //     leaves alone and why.
    if (wipeNow) {
      // the ceremony-free mass despawn is one line now: production's own body
      // and ordnance lists are deleted (commit D5) and the successor plane's
      // arc restart below empties its field the same way.
      E.orbs = [];     // loose bounty goes, because an orb banked after the cut
      E.pvpCd = {};    // would pay a wallet this same block has just emptied
      // ---- ...AND THE SUCCESSOR PLANE'S ARC (S3b lane 3, commit D4) -------
      // D15: THE WIPE IS A FULL ARC RESTART TO SETPIECE 1. The rule already
      // said so — "the run lasts until the ROOM dies, and the wipe is the
      // scoring moment" (D16) — and before the flip it was satisfied by
      // emptying production's own arrays and re-dealing wave 1. After the flip
      // the arc is the successor plane's, and a wipe that reset production's
      // wave number while leaving the director mid-setpiece would deal the new
      // run the old run's boss.
      //
      // IT IS THE KERNEL'S OWN `reset`, on the SAME SEED the wave-1 re-deal
      // just reseeded from — one seed, both planes, exactly as `restart` does.
      // Not the host's composed reset: this is already INSIDE production's
      // tick, production has already taken its own cut in the lines above, and
      // running its restart again from here would be a second discontinuity.
      // through the host, for FIX 10's reason — and this is the site the finding
      // was measured at: the wipe runs INSIDE `Encounter.step`, after the pose.
      if (kernelDriving() && window.EncounterHost) {
        EncounterHost.resetKernel(ECFG.seed >>> 0);
      // ...AND PRODUCTION RE-POSES IN THE SAME STATEMENT (FIX 10 / S3BR-10).
      // `resetRun` rebuilds native live pilots at hull 100, and this call can
      // land AFTER the tick's only pose push — so without these two lines a
      // phantom kernel pilot stands behind the dead seat until the next tick.
      // `poseKernelSeats` is js/game.js's own per-tick push, called here rather
      // than copied, so the mirror is re-established from PRODUCTION'S state as
      // it is NOW — after the reset, not from the pose that preceded it.
      // `applyPosesNow` lands them on the records: the bridge BANKS for the
      // next step and there is no next step before this function returns.
      if (typeof poseKernelSeats === "function") poseKernelSeats();
      EncounterHost.applyPosesNow();
      }
      G.bullets.length = 0;   // ...and rounds already in the air, which otherwise outlive
                              // the run that fired them and land on a wave nobody shot at
      rebateQueue.length = 0; // provably empty at this phase — applyRebateHits ran above
                              // on this same tick — and cleared anyway so no future
                              // reordering can quietly carry a queued hit across the cut
      poseLog.length = 0;     // no rewound sweep may resolve against the run that just
                              // ended: every row holds enemy and missile poses this block
                              // has just despawned, so a vt-bearing fire arriving with an
                              // old era would otherwise be swept against bodies the new
                              // run has never had. restart() clears it for the same
                              // reason; the ring refills from the next recordPoseRow
      for (let s = 0; s < E.seats.length; s++) {
        const S = E.seats[s];
        // ranks first, through the same primitive every death uses, and each
        // seat's epoch still INCREMENTS. It has to lead the rest of this body:
        // energyFill below sizes the pool off the seat's ENERGY CELL rank, so a
        // fill above the reset would deal the new run the old run's cap
        resetSeatUpgrades(s);
        S.hand = [];    // ...AND THE MARKET HAND GOES WITH THE RUN (D37, S7). A wipe
        S.bought = [];  // returns the room to NEVER DEALT, which is what the identity
                        // zeroed beside E.loop below says. It is NOT in
                        // resetSeatUpgrades: a DEATH runs that primitive too, and a
                        // death must KEEP the ids (the ranks are gone, so the cards
                        // are buyable again) while a wipe must take the shelf away.
        S.hullMax = ECFG.player.hull; // MAX HULL is a stored `+=` on the seat, not a
                                      // derived term — resetSeatUpgrades cannot undo it
        if (S.hull > S.hullMax) S.hull = S.hullMax; // ...and the ONE seat that can be
                         // FLYING at this line — one the claim loop dealt back a few
                         // lines up, on this very tick — took its hull from the old
                         // cap. Every other seat is at 0 and this is a no-op; without
                         // it that seat would fly the new run over its new ceiling
        S.xp = 0;
        S.score = 0;
        S.best = 0;      // the board opens EMPTY and crowns nobody until the first point
                         // — drawBoard's king is the top standing with best > 0. A board
                         // that survived would still be ranking a run that no longer
                         // exists; a PERSISTENT one is server business, not this field
        if (S.stock > 0) S.stock = ECFG.player.stock; // the quarter-rule lives refill
                         // with the run — but only for a seat that is still IN it. A
                         // seat the quarter rule RETIRED is PARKED: stock 0 and respawnT
                         // 0 (the retirement line writes those two and nothing else),
                         // hull 0 from the death branch above it, claimT 0 and absent
                         // false, both untouched since the death. The claim loop's three
                         // branches are absent, respawnT > 0 and claimT > 0 — a retired
                         // seat matches NONE, so nothing on the FIELD deals it back, and
                         // reseatSeat is a no-op on it too: it opens `if (!S ||
                         // !S.absent) return;` and a retired seat's absent is false.
                         // Two things still reach it. restart() re-arms it outright,
                         // stock included. And the SOCKET route does, in one hop more
                         // than it looks: unseatSeat refuses only an ALREADY-absent
                         // seat, so when the retired player's grace lapses,
                         // server.js's unseatLapsedSeats parks the seat `absent` — and
                         // from there reseatSeat is live. It is what deals the seat
                         // back, but not by itself and not through the branch it looks
                         // like: server.js runs it UNCONDITIONALLY on every grant, and
                         // it writes absent false and claimT — so by the time the claim
                         // loop reads the seat, the absent branch no longer matches and
                         // the CLAIM WINDOW branch is the one holding it. A click there
                         // deals it back; silence spends the window and unseatSeat parks
                         // it again. (The absent branch deals back only the seat no
                         // grant ran for — the same socket, still bound, clicking on the
                         // seat it never left.) Either way it comes back with stock
                         // STILL 0, because respawnSeat never writes stock, so its next
                         // death runs `--S.stock` to -1 and retires it again on the
                         // spot. One life, not three, for a seat the rule already spent
                         // — and that outcome is EMERGENT, not a decision anyone
                         // recorded: it falls out of no path refilling stock on the way
                         // back in. What follows is the argument for leaving it that
                         // way, not a ruling. Refilling here would undo
                         // exactly that: the seat would come back through the reclaim on
                         // a full three lives it never earned, and a hand-off reading
                         // stock to decide whether the seat is free would quietly cancel
                         // the turn a waiter had already been given. The wipe deals
                         // nobody back in; that has to include the seat the rule
                         // already parked.
                         // (lobbyWaiters is 0 in all of production today, so stock
                         // never depletes and this guard is a no-op there — it exists
                         // for the phase-16 drop-in joins that turn the rule on.)
        energyFill(s);   // the pool is run state too — AFTER the rank reset above so the
                         // fill lands on the base cap the cleared ENERGY CELL rank leaves
                         // behind, which is also the correction for the seat respawnSeat
                         // filled to the OLD cap a few lines up
        // FOUR groups of fields are deliberately left alone, each for its own reason:
        //   hull, respawnT, claimT — a wipe deals nobody back in, so the seat keeps
        //     the progression its death started. Clearing them was the earlier rule
        //     and it is what made the countdown and the claim window unreachable solo.
        //   absent — a seat the AFK unseat parked has nobody behind it, and
        //     resurrecting an abandoned ship is the exact state that unseat exists
        //     to clear. It is the one seat that gets no progression either.
        //   invuln, hitFlash — they decide nothing while a seat is down (nothing can
        //     hit a wreck, and nothing draws its flash), and on the seat respawnSeat
        //     just dealt they ARE the re-entry grace; taking that back would drop a
        //     returning ship ungraced into the wave this block is about to schedule.
        //   the POSE — players[s].ship is the WRECK the draw still shows under the
        //     countdown, so a re-centre would teleport a hull the player is watching.
        //     It is also the anchor respawnSeat rolls against with nobody alive, and
        //     the seat this tick dealt has already emitted a respawn marker carrying
        //     its dealt position — moving it would strand that marker, its cue and
        //     its flash at a point no ship occupies.
      }
      E.kills = 0;
      E.missilesShot = 0;
      E.hitsDealt = 0;
      E.hitsTaken = 0;
      E.contactsDealt = 0;
      E.marketWave = 0;  // ...and the room is NEVER DEALT again. Zero is a wave
      E.marketLoop = 0;  // no clear can ever produce (they start at 1), so a wiped room
                         // and a booted one read identically — which is what a wipe means.
      E.loop++;          // ...AND THE WIPE COUNTS A LOOP, explicitly, HERE. A wipe is a
                         // new run in everything but name, and the startWave(1) on the
                         // next line writes E.wave before the next tick's kernel mirror
                         // can see it fall — so the mirror's own turn counter never
                         // observes this one. Two writers, two disjoint events, and this
                         // is the second. What it buys is stated at the declaration: a
                         // market key carries the loop, so no hand a wipe took away can
                         // ever be dealt back on the same wave number.
      startWave(1);
      E.state = "warning"; // restart() parks at "idle" because it runs BETWEEN ticks and
                           // encStep's opening line promotes it; this runs INSIDE one,
                           // long past that line, so "idle" would hash a state the wave
                           // has already left for a whole tick
      // ...and the wave 1 startWave just dealt is dealt into a world with no
      // living ship — and, presence-gated, only for the seats still PRESENT:
      // a dead seat waiting on its countdown or its window gets its share, a
      // PARKED seat gets none, and a room where every seat is parked gets an
      // EMPTY deal that starves until a reclaim asks (the re-deal below the
      // loop). For the shares that ARE dealt: rollAnchor's hold-off
      // short-circuits, spawnEnemy's push-out skips dead seats and makeBody
      // stamps every body tgtSeat -1, so left to run the pack parks
      // off-screen and converges on the first player to click back in — 3
      // darts per present seat. Nothing is done about it HERE, and since D66
      // there IS somewhere it is done — three corrections to the sentence this
      // block used to carry. LOCATION: the hold is in the KERNEL, in
      // `updateDirector`, above its drain — not "at the top of encStep"; the
      // hold that sentence named went with the old dealer. CONDITION: PRESENCE,
      // not an empty field — somebody present and nobody alive, so an UNCLAIMED
      // room still deals (D8/D14). RELEASE: the thing that sentence refused.
      // Every remaining `due` moves by the MEASURED held duration rather than
      // "sliding once by a guess at the return", so the stagger this deal was
      // dealt with survives the wait instead of arriving all at once behind the
      // first pilot back. This block still has no idea when anybody comes back,
      // and still does not pretend to: it is the kernel that counts the
      // seconds.
      emit("wipe");        // the RUN's discontinuity marker. Every symptom of a wipe is
                           // a value a client already adopts — wave 1, an empty field,
                           // a board of zeroes — so this is the only fact on the wire
                           // that says WHY, and server/server.js journals it. Nothing
                           // else answers it, deliberately: the wipe moves no ship and
                           // re-deals no id, so there is no client state to cut.
                           // Deliberately NOT the "restart" marker either — js/fx.js
                           // answers that one by clearing every live flash and particle,
                           // which would take out the ship blast this block preserved
    }
    // DEAL AT FIRST RECLAIM (owner decision, 2026-08-19). A wave whose deal
    // found EVERY seat parked has zero groups: the field starves lawfully —
    // schedule held, clear gate vacuous, nothing re-deals — because nobody
    // returns unasked. The press sampled in the claim loop above is the ask:
    // the first seat dealt back into that field gets wave 1 dealt fresh, AT
    // THIS TICK, presence-gated against the seats as they stand NOW — the
    // reclaimers are present, the still-parked seats are not, so the deal is
    // the returning seats' shares as they stand at that tick (two same-tick
    // reclaimers are dealt both shares). It sits HERE, below the loop and
    // below the wipe apply, for the same reason the wipe's own startWave
    // does: respawnSeat draws rand() through rollAnchor, so the reseed stays
    // the tick's last act. `E.groups.length` is re-read because the wipe
    // apply above may have dealt already on this very tick — a reclaim
    // landing on a wipe's own tick leaves nothing for this line to do. No
    // flag rides E.* for any of this: "the deal was empty" is derived, so
    // the state hash and every committed fixture stand untouched.
    // ...and NOT after the flip. The all-absent re-deal exists to hand a
    // reclaiming seat a wave when the deal it walked into was empty, and after
    // the flip EVERY deal is empty by design — so this line would fire on every
    // reclaim, re-seeding production's one `rand` stream each time for a wave
    // that is not production's to deal any more.
    // (the ALL-ABSENT RE-DEAL is deleted at commit D5. Commit C had already
    //  ruled it dormant with the reason written above — after the flip every
    //  production deal is empty by design, so the line would fire on every
    //  reclaim and re-seed production's one `rand` stream for a wave that is
    //  not production's to deal. A dormant call to a deleted dealer is not a
    //  line to keep.)
    // A wave clears only when the queue is empty AND the field is empty AND no
    // ordnance is still in the air — still an explicit simplification of Nova
    // Drift's timer-driven overlapping scheduler. The missile term is what
    // keeps the break and its orb sweep from running under a live seeker: a
    // dead harrier's last missile is still the wave. The break runs clearHold
    // ticks while the sweep banks the orbs — the CLEAR card retires earlier,
    // on bannerHold() = min(210, clearHold) — then the elevator deals.
    // ---- THE CLEAR GATE IS DELETED (S3b lane 3, commit D5) ---------------
    // It read "the queue is empty AND the field is empty AND no ordnance is in
    // the air" off three lists that are all deleted, and it wrote `E.state`
    // and `E.clearTick` — both of which `applyKernelHud` writes from the
    // kernel's director on every tick. Its `clear` cue goes with it: the
    // successor plane raises its own through the host's CUE ROUTE (commit D4),
    // which is the channel production's event queue now hears arrivals on.
    //   THE 10 s INTER-WAVE BREAK AND D21's CLEAR-TO-ADVANCE ARE S4's, and the
    // owner's ruling on the break (S-bpzbzy, clearHold 480) is PARKED, not
    // reproduced here. `ECFG.clearHold` survives unread for that round.
    // every seat's settled position, one record per seat — see E.shipPrev
    E.shipPrev = players.map((pl) => ({ x: pl.ship.x, y: pl.ship.y }));
    recordPoseRow(); // ...and the phase-15 ring's row, from the same settled
                     // poses: reapDead ran above, so no dead body enters it
  }

  // ---- drawing: world pass (under the camera transform) ------------------
  // ---- THE SEVEN BODY DRAWS AND THE SEEKER DRAW ARE RETIRED --------------
  // PORT-S S3b lane 3, commit D2. `chargerPath`, `drawDart`, `drawCharger`,
  // `drawHarrier`, `drawAnvil`, `drawHusk`, `drawShard`, `drawRadarAccent`,
  // the `DRAW_BODY` dispatch table and `drawMissiles` — 334 lines — went with
  // the roster they drew. D9 replaced that roster; the successor plane has
  // twenty-one silhouettes of its own in js/demo-render.js, and js/game.js's
  // render() draws them in this file's own slot under production's camera.
  //
  // NOTHING REPLACES THEM HERE. A dispatch table with no types to dispatch on
  // is not a smaller table, it is a table, and the fallback that used to guard
  // an unknown type ("an invisible body is the worst possible bug here") has
  // no body to guard.

  // The light list: every body this file DREW, as position, radius and kind,
  // for the render-only glow layer in js/fx.js. One accessor rather than a
  // light-draw inside each of the eight body functions — that keeps the whole
  // crossing to one site plus one export line, in a file the multiplayer
  // stream edits constantly.
  //
  // It answers `idle` exactly as encDraw does, so light is never claimed for a
  // body no pass painted, and it reads the SAME view encDraw draws from — a
  // halo pinned to the tick pose of a body drawn at the interpolated pose
  // detaches from it by up to a full tick of flight. A caller with no view (a
  // headless page, a direct probe, the alpha-1 branch) falls back to the LIVE
  // arrays, because restart() replaces E.orbs whole.
  // LIGHTS is module-level and cleared per call — the same reused-buffer idiom
  // the arrow tracker uses.
  const LIGHTS = [];
  function lights(view) {
    LIGHTS.length = 0;
    if (E.state === "idle") return LIGHTS;
    // ---- THE SUCCESSOR PLANE'S GLOW (S3b lane 3, commit C) ---------------
    // S3B-MAP's risk-2 symptom in its exact shape: "the client draws a dark,
    // empty field ... `lights()` pushes nothing, so the bloom pass iterates an
    // empty list and the whole field goes dark". This is the line that stops
    // it. The kernel's bodies, its ORDNANCE (which production never had — the
    // enemy round is the successor plane's own contribution to the light) and
    // its orbs all reach js/fx.js's one consumer through the accessor that was
    // always the seam for this.
    //
    // TIERLESS ON PURPOSE, AND COLOURED SINCE D44. The `tier` field is the OLD
    // roster's steel/radar/gold plate table, and a kernel body has no tier — a
    // tier invented here would be a second colour authority for a plate this
    // file no longer draws. What a kernel body DOES have is a colour, and that
    // was always the more specific answer: every row below carries `col`, the
    // kernel's own colour NAME, so the halo and the plate the successor plane
    // draws under it are one decision. The fx layer's NAME test is still there
    // and is now the LAST fallback, for a record that cannot answer.
    //
    // IT IS A LIVE READ, never a cached one, on this function's own rule: the
    // kernel REPLACES nothing but its arrays are re-read every frame anyway,
    // and the buffer below is refilled per call and never retained.
    if (typeof window !== "undefined" && window.EncounterHost && window.EncounterHost.installed()) {
      const K = window.DemoKernel;
      // D44 — THE BODY NAMES ITS OWN LIGHT. `col` is the kernel's colour NAME
      // (js/demo-kernel.js's `C` keys), not a byte: this file is a SIM file and
      // the hot spelling lives in the render plane's palette, so the NAME
      // crosses and js/fx.js does the lookup. It is the SAME field the
      // successor plane's plate ink reads — STATS[type].color — so the halo
      // cannot disagree with the hull it surrounds.
      //   The lookup is guarded because bodies() is the HOST's list and not the
      // STATS table: a type with no row (or a kernel that did not load) pushes
      // no `col` at all and falls through to the name test unchanged.
      const ST = (K && K.STATS) || null;
      for (const e of window.EncounterHost.bodies()) {
        if (e.dead || e.hp <= 0) continue;
        const row = ST ? ST[e.type] : null;
        LIGHTS.push({ x: e.x, y: e.y, r: e.r, t: e.type, col: row ? row.color : undefined });
      }
      if (K && K.S) {
        // THE ORDNANCE IS THE CHEAPER HALF AND THE LOUDER ONE. Every kernel
        // round already carries `.color` on its own record, so this costs a
        // field and no lookup — and enemy ordnance is most of the moving ink in
        // a wave, so a bodies-only D44 would leave the field orange.
        for (const b of K.S.bullets) if (!b.dead) LIGHTS.push({ x: b.x, y: b.y, r: b.r, t: b.kind || "bolt", col: b.color });
        // ORBS ARE GOLD NOW — D56 REVERSED D44 for the bounty: the demo draws
        // the orb as a GOLD diamond, so a clay halo under a gold plate is the
        // same disagreement D44 was written to end, one body class later.
        //   AND THE KERNEL'S OWN ORB WALK IS DELETED HERE, not re-coloured. It
        // was a DOUBLE PUSH: solo, `view.orbs` is `E.orbs.concat(ko)` (the
        // kernel's orbs are already in the view), so this walk lit every solo
        // orb twice; on a net client this whole block never runs. The surviving
        // walk below is the one push, and it carries the colour.
      }
    }
    // ---- PRODUCTION'S OWN BODY AND ORDNANCE LIGHTS ARE DELETED (D5) ------
    // Two walks, over `E.enemies` and `E.missiles`, both deleted with the
    // arrays. THE `view` ARM GOES WITH THEM AND IT IS THE HALF WORTH NAMING:
    // `view.enemies` is a NET CLIENT'S decoded body list, so a client still
    // has bodies to light — but it decodes them into the same `E.enemies` the
    // sim no longer keeps, and the whole of that decode is R7's to re-cut
    // against wire v11. Lighting a `ty:-1` body here would be inventing a
    // colour for a type the wire cannot yet name.
    //   THE ORB WALK BELOW IS THE ONLY ORB PUSH and still reads the view —
    // orbs cross the wire honestly and a client's own bounty must glow. It
    // names its colour like every other row (D44's field, D56's hue), so the
    // halo agrees with the gold diamond js/demo-render.js draws inside it.
    for (const o of (view && view.orbs) || E.orbs) LIGHTS.push({ x: o.x, y: o.y, r: ECFG.orb.r, t: "orb", col: "gold" });
    return LIGHTS;
  }

  // view is game.js's presentation FRAME: pose-shadowed shallow copies of
  // this file's own bodies, interpolated between their last two tick poses,
  // plus view.ships (per-seat frame poses) and view.cam. The body loops and
  // the invulnerability rings read it — every per-type draw function gets a
  // shadow copy it cannot tell from the live object. The spawn portals stay
  // on the live anchor by design: an anchor is a static point, and a static
  // point has nothing to interpolate.
  function encDraw(_c, view) {
    if (E.state === "idle") return;
    ctx.save();
    const wt = E.waveTick;
    // ---- THE SPAWN PORTAL DRAW IS DELETED (S3b lane 3, commit D5) --------
    // Fifteen lines of pulsing ring over `E.groups[].points.anchor` — the
    // announcement of an arrival production's dealer had scheduled. The dealer
    // went at commit D4 and the schedule goes at this one, so the anchor it
    // drew has no producer.
    //   THE CUE IS NOT LOST: the successor plane announces its own arrivals
    // with a PORTAL of its own, drawn in js/demo-render.js's world pass under
    // production's camera — which commit D2 already recorded when it declined
    // to rebuild the off-screen tracker for the same reason.
    // ---- THE XP ORB DISC IS RETIRED (D56) --------------------------------
    // Ten lines of clay disc plus a 1.2 px bright centre, drawn under the
    // successor plane's own orb: js/demo-render.js draws the bounty as a
    // pulsing GOLD diamond with its own glow, in this function's own slot and
    // under the same camera, so the disc was a second, older orb showing
    // through the first. The diamond IS the demo's look and it is the one
    // that stays; the halo around it is the light layer's, and it went gold
    // in lights() above.
    // (the body walk and the ordnance walk are RETIRED — commit D2. The
    // successor plane's twenty-one silhouettes are js/demo-render.js's and
    // js/game.js's render() draws them in THIS FUNCTION'S OWN SLOT, under
    // production's camera, immediately after this call. The ordering the two
    // comments here defended — ordnance paints OVER the bodies — is that
    // renderer's own pass order now, and it keeps it.)
    // post-hit grace — a blinking ring around each graced ship. The ring
    // centres on the FRAME pose for its seat — the same pose drawShip gets —
    // so it never orbits a hull the frame drew somewhere else.
    if (wt % 8 < 5) {
      for (let s = 0; s < players.length; s++) {
        if (!E.seats[s] || E.seats[s].invuln <= 0) continue;
        const pl = players[s];
        const vp = (view && view.ships && view.ships[s]) || pl.ship;
        ctx.strokeStyle = C.clay;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(vp.x, vp.y, SHIP_R + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  // ---- THE OFF-SCREEN CHEVRONS RETURN (D58) -------------------------------
  // WHAT WAS RETIRED, and why the retirement was right at the time: commit D2
  // deleted `drawIncomingMarker`, `computeEdgeArrows`, `drawEdgeArrows` and
  // their two tables — 155 lines that read a body's `type` off the OLD roster
  // and its `mode` off the seven-value vocabulary D9 replaced. Neither
  // survived the roster it was written against, and D2 said in writing that
  // an off-screen threat indicator for twenty-one successor types was a HUD
  // DESIGN question rather than a port. `drawIncomingMarker` and the spawn
  // marker stay retired: their call site went with `E.groups`.
  //
  // D58 ANSWERS THE DESIGN QUESTION and the geometry comes back. The owner's
  // words: a player must be able to see what is off the screen. The answer is
  // deliberately NOT the old table:
  //
  //   ONE COLOUR PER CLASS, never per body. Foes wear C.clay, XP orbs wear
  //   C.gold. The frame view carries NO colour — a kernel body record has no
  //   `color` field — so per-body ink would mean a second colour authority in
  //   a HUD file, keyed on STATS[type]; and a `?mp` client's decoded bodies
  //   are all `ty: -1` until R7 re-cuts the decode, so per-body colour is
  //   BROKEN on the wire today and one colour per class is not. (Per body is
  //   a post-R7 option, and the two-class split is what the owner asked for.)
  //
  //   NO "HOT" GRADE. The old code had a third state for `lockon`/`windup`
  //   telegraphs — a vocabulary D9 deleted. Inheriting it would be inheriting
  //   a dead branch, so the alpha is CONSTANT and there is no distance fade.
  //   `ARROWS.far`, the old alpha ramp, does not come back either.
  //
  //   THE CULL IS NEW. The old `track()` had no distance test at ANY radius;
  //   D58 asks for one, so `interestR()` below is a new line, not a port, and
  //   it has its own leg.
  //
  // WHERE IT DRAWS: inside encDrawHud, at the retired pass's own slot, so the
  // chevrons paint in SCREEN space (js/game.js sets the field transform with
  // no camera translate before calling drawHud) and UNDER the top-left status
  // column, which lives at x 8-60 while the chevrons live on the inset rect.
  //
  // NO PANEL TOGGLE. The chevrons are unconditional — `EDGEARROWS` and its
  // world-tab row do not come back with them. A toggle is a five-place census
  // move in tests/pause-ui-checks.js and this is a render-only lane; and an
  // indicator that answers "what can reach me" is not a taste setting.
  const ARROWS = { inset: 14, cap: 16, buckets: 48 };
  const NO_ARROWS = []; // the frozen empty answer — never filled, never returned
                        // to a caller that could push into the live list
  // THE INTEREST RADIUS, DERIVED AND NEVER SPELLED. `Math.max(PLAY_W, PLAY_H)
  // * 1.2` is the kernel's own live formula (js/demo-kernel.js:4087 uses it
  // for a dash ray), read through the kernel's exports on the guard idiom
  // js/encounter-host.js:1418-1421 already ships. There is deliberately NO
  // literal here: R7's server-side INTEREST_R (r7c, R3.1) is the same formula
  // over the same two numbers, and two copies of a FORMULA stay equal when
  // PLAY_W moves while two copies of its ARITHMETIC RESULT do not.
  //   THE NO-KERNEL FALLBACK IS Infinity — that is NO CULL, every off-screen
  // body earns its chevron. A page that failed to load the kernel should draw
  // too many indicators, never none.
  function interestR() {
    const K = window.DemoKernel;
    return K && Number.isFinite(K.PLAY_W) && Number.isFinite(K.PLAY_H)
      ? Math.max(K.PLAY_W, K.PLAY_H) * 1.2 : Infinity;
  }
  function computeEdgeArrows(view) {
    // view is game.js's presentation FRAME: the camera AND the roster read the
    // presented instant together, so an arrow's visibility cut and its bearing
    // agree with the world pass. A caller with NO view (the __test export, a
    // headless page, every drawHud(null) leg in tests/wave1-checks.js) keeps
    // the live state — same geometry, tick camera. Dropping that fallback is
    // what makes those legs throw.
    const c = (view && view.cam) || cam;
    if (!c) return NO_ARROWS;
    // the roster comes off the frame, which has ALREADY merged both planes:
    // solo, mapState() answers presentedBodies() + E.orbs.concat(kernel orbs);
    // on a net client it answers the decoded rows. So there is no direct reach
    // into EncounterHost or DemoKernel here — that read is host-installed-only
    // and would leave a net client with no enemy chevrons at all.
    const foes = (view && view.enemies) || presentedBodies() || NO_ARROWS;
    const orbs = (view && view.orbs) || E.orbs || NO_ARROWS;
    const vx = c.x + FW / 2; // the view centre — position and heading share
    const vy = c.y + FH / 2; // this ray, so an arrow points where it sits
    const R = interestR();
    const slots = new Array(ARROWS.buckets).fill(null); // fixed slot order — deterministic
    const step = (2 * Math.PI) / ARROWS.buckets;
    // one bucket claim, shared by both classes so they fold into the SAME
    // merge and the same nearest-wins rule
    const track = (o, kind) => {
      const r = o.r || 0;
      const sx = o.x - c.x;
      const sy = o.y - c.y;
      if (sx >= -r && sx <= FW + r && sy >= -r && sy <= FH + r) return; // any part visible — no arrow
      const dx = o.x - vx;
      const dy = o.y - vy;
      const dist = Math.hypot(dx, dy);
      if (dist > R) return; // THE CULL (D58) — beyond the interest radius a
                            // body is not a threat yet, and a rim of chevrons
                            // for the whole 7680x7920 world is noise
      const bi = ((Math.round(Math.atan2(dy, dx) / step) % ARROWS.buckets) + ARROWS.buckets) % ARROWS.buckets;
      const s = slots[bi];
      if (!s) slots[bi] = { dx, dy, dist, n: 1, kind, bi };
      else {
        s.n++;
        if (dist < s.dist) { s.dx = dx; s.dy = dy; s.dist = dist; s.kind = kind; } // nearest wins the bucket
      }
    };
    for (const e of foes) if (bodyIsLive(e)) track(e, "foe");
    for (const o of orbs) if (o) track(o, "orb");
    const hw = FW / 2 - ARROWS.inset;
    const hh = FH / 2 - ARROWS.inset;
    return slots.filter(Boolean)
      .sort((a, b) => a.dist - b.dist || a.bi - b.bi) // nearest first; the bucket
      .slice(0, ARROWS.cap)                           // index is the explicit
      .map((s) => {                                   // tie-break — deterministic
        // an off-screen body always overshoots one half-extent, so k < 1 and
        // the arrow lands exactly ON the inset rect — inside the field clip,
        // never in the letterbox bars
        const k = Math.min(hw / Math.max(Math.abs(s.dx), 1e-9), hh / Math.max(Math.abs(s.dy), 1e-9));
        return { x: FW / 2 + s.dx * k, y: FH / 2 + s.dy * k,
          ang: Math.atan2(s.dy, s.dx), dist: s.dist, n: s.n, kind: s.kind };
      });
  }
  function drawEdgeArrows(view) {
    for (const a of computeEdgeArrows(view)) {
      // the count scales the chevron — a bucket holding four bodies reads
      // bigger than one holding one, which is the only crowding cue a single
      // flat colour per class can carry
      const sc = 1 + Math.min(a.n - 1, 3) * 0.15;
      ctx.save();
      ctx.globalAlpha = 0.75; // CONSTANT — see the header: the old ramp and its
                              // `hot` branch belonged to a deleted vocabulary
      ctx.translate(a.x, a.y);
      ctx.rotate(a.ang);
      ctx.scale(sc, sc);
      ctx.fillStyle = a.kind === "orb" ? C.gold : C.clay;
      ctx.beginPath(); // the incoming-marker chevron, the old proportions
      ctx.moveTo(7, 0);
      ctx.lineTo(-4, 5);
      ctx.lineTo(-1, 0);
      ctx.lineTo(-4, -5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // ---- the shop panel's geometry ------------------------------------------
  // ONE table, one derivation, one SPACE. The hit test and the draw both read
  // shopLayout() and nothing else, so a card the pointer lands on is always
  // the card the pointer is over. Every rect is in a fixed LOGICAL PANEL
  // space (shopLayout().w × .h) that no window size or dpr can move: game.js
  // owns the letterbox fit of that space into the live left gutter
  // (panelPlace) and converts the pointer back through the same transform, so
  // the layout, the hit test and the WIRE all speak client-independent
  // coordinates. Device pixels never cross a module boundary or the network.
  //
  // ONE number crosses that boundary now, and it is not a coordinate: the
  // DRAW (drawShopPanel) takes the panel fit's scale RATIO — CSS px per
  // logical unit — so type can hold a legibility floor on a short window.
  // shopTextPlan() is the single derivation that consumes it, it feeds font
  // sizes, the icon's drawn size, the baselines those sizes hang from and the
  // one cut that decides whether the panel paints PROSE at all, and nothing
  // else. It is deliberately NOT a parameter of shopLayout(): the rects the
  // hit test reads, and the row index that goes on the wire, stay untouched by
  // the window. That is the whole boundary — a scale in, a picture out.
  const SHOPUI = {
    w: 170,          // the logical panel width
    headerH: 26,     // SHOP + the wallet
    headerY: 22,     // ...and their DESIGN baseline inside it. One constant, two
                     // readers: shopLayout hands it out, shopTextPlan derives the
                     // live baseline from it, and the draw reads only the derived
                     // one — a floor-grown header slides up instead of hanging
                     // its ink off a literal that no longer fits
    cardW: 154, cardH: 104, gapY: 6, pad: 8,
    flatGap: 14,     // ...and the EXTRA gap above the LAST card, which is always
                     // HULL PATCH (D37, PORT-S S7). The consumable is not one of
                     // the four dealt offers, and a column that ran it flush with
                     // them would say it was. A gap rather than a rule because it
                     // is the smallest thing that says it; S8 restyles.
    icon: 76,        // the PNG's drawn CEILING — the card gives the icon whatever
                     // the planned type leaves it, never more than this (see
                     // shopTextPlan); the 192 px asset downscales into whatever it gets
    // detailH is GONE from this table on purpose, and so is the band it sized.
    // A 170-logical-px rail is not a measure for prose: at the user's own
    // window it gave the hovered row 12 characters and 3 lines, which painted
    // "comet bites / need 7 more / XP" — a truncated fragment with a widowed
    // unit under it, reading as one broken sentence. The words moved to the
    // FIELD (shopHoverPlan, 512 x 342 logical px drawn at 4.5× the panel's
    // scale), and what is left down here is ONE line of idle hint. Its height
    // is therefore not a design number to pick but a consequence of the type
    // plan's own legibility floor, so shopLayout() derives it — see HINTPX.
  };

  // ---- THE LOADOUT RAIL'S TABLE (PORT-S S8) -------------------------------
  // The third geometry table in this file, and deliberately the same shape as
  // SHOPUI: numbers here, rects out of shopLayout(), and the draw reads only
  // the rects. The band sits BELOW the hint line, inside the LEFT panel's own
  // logical space, so it costs no new pointer route — game.js's panelAt
  // already answers `panel: "shop"` for the whole left bar, whatever the
  // panel's height.
  //
  // THE HEIGHT IS THE SUM OF ITS PARTS, and the arithmetic is here so a row
  // added at R8a cannot silently overflow the band: pad 6 + capH 8 +
  // 3 * rowH 12 + pad 6 = 56. THREE rows because the bench is three abilities
  // (js/abilities.js — FIRE, COMET, RAILSHOT); a fourth ability re-derives
  // railH from this table rather than nudging the literal.
  //
  // WHAT IT COSTS THE CARDS, measured rather than reasoned: the panel is
  // HEIGHT-limited at the suites' 780x493 viewport, so h 612.7436 -> 668.7436
  // moves panelPlace's fit from 0.7784659 to 0.7132779 and the icon from
  // 63.74 to 61.16 logical px. Every type tier still clears its floor there
  // (11/11/11/11 CSS px on their 10.9, 9 on its 8.9) — the live-fit leg
  // (tests/wave1-checks.js) is the oracle and its budget is railH <= 251.26.
  // At 1280x720 and every taller window the panel is WIDTH-limited and the
  // band costs the cards nothing at all.
  const LOADOUTUI = {
    railH: 98,       // the whole band, added to the panel's own height.
                     // 2 * pad 6 + capH 8 + 3 * rowH 26 = 98. THE BUDGET IS
                     // railH <= 251.26, and the live-fit leg in
                     // tests/wave1-checks.js is its oracle; a NEW leg below
                     // pins this identity itself, because nothing did.
    pad: 6,          // air inside the band, all four sides
    capH: 8,         // the LOADOUT caption's row
    rowH: 26,        // ...and one ability row. It was 12 — HALF the smallest
                     // size this file says an icon may shrink to. 24 px of art
                     // plus 1 px of air each way (D48, PORT-L).
    iconW: 24,       // the SHOP's own icon floor, and the row's height budget
    markW: 3,        // the SELECTED row's square, the hull pips' own idiom
    dotW: 4,         // ...and the STATE DOT at the row's right edge
    priceW: 14,      // the budget a two-digit energy price takes at 9 px on
                     // the 0.65-em advance this file measures type with
  };

  // The band's own lever, the PANELS/MINIMAP idiom (js/game.js) for a layer
  // only this leg answers to: a both-sides pixel probe needs something the
  // suppressed layer alone obeys, or "no ink either way" reads as a pass. It
  // gates the DRAW and never the GEOMETRY — a lever that moved the panel's
  // height would re-fit every card and the probe would be measuring the fit
  // instead of the band.
  let LOADOUT = true;

  // ---- THE COLUMN IS THE HAND, PLUS THE FLAT ROW (PORT-S S7, D37) --------
  // It used to be the whole catalog, one card per row, slot index === catalog
  // index. It is now the SEAT'S OWN HAND in the order it was dealt, followed by
  // HULL PATCH as the LAST card, pinned to the bottom of the column and set off
  // by a wider gap — the consumable is not one of the four offers and must not
  // read as one. (The minimum draw; S8 restyles it.)
  //
  // EVERY CARD CARRIES BOTH NUMBERS. `k` is its SLOT — that is what sets `y` —
  // and `i` is its CATALOG ROW. The hover, the wire's `item` and `buy()` all
  // speak CATALOG indices, so `shopHover` still reads `c.i` and nothing on the
  // wire changes; the slot is the panel's private business.
  //
  // THE SEAT PARAMETER defaults to the local seat, so every argument-free
  // caller keeps its exact old meaning; a check that staged seat 1's hand
  // passes 1 and gets seat 1's column.
  //
  // IN A NEVER-DEALT ROOM THE COLUMN IS HULL PATCH ALONE. That is the product
  // under the first-clear ruling — wave 1 is flown, and the shelf fills at the
  // clear.
  function shopLayout(seat = localSeat()) {
    const S = SHOPUI;
    const rec = E.seats[seat];
    const rows = rec ? rec.hand.slice() : [];
    rows.push(FLAT_ROW); // ...and the consumable, always, last
    const cards = rows.map((i, k) => ({
      i, k,
      // the flat card takes an extra gap above it: the separation IS the
      // statement that it is not one of the offers
      x: S.pad,
      y: S.headerH + k * (S.cardH + S.gapY) + (k === rows.length - 1 ? S.flatGap : 0),
      w: S.cardW, h: S.cardH,
      // the card's own spent bit, resolved here so the draw and a check read
      // one answer. The flat row is never spent — it is a consumable.
      bought: k < rows.length - 1 && !!(rec && rec.bought[k]),
    }));
    const last = cards[cards.length - 1];
    const detailTop = last.y + last.h + S.gapY; // where the card column's gap
                                                // ends — the line the hint's
                                                // INK may not cross
    const detailH = HINTPX + HINTAIR; // exactly one line of hint at the widest
                                      // that line can ever be set, plus its air
    // ...and BELOW the hint, the LOADOUT band (PORT-S S8). railTop is exactly
    // where the panel used to end, so the growth is `railH` and nothing else,
    // and every reader that wants the hint's floor asks for railTop rather
    // than for `h` — which is why the two identities the suite pins are
    // `railTop === detailTop + detailH` and `h === railTop + railH` instead of
    // one identity on `h` that a band would have to be subtracted back out of.
    const R = LOADOUTUI;
    const railTop = detailTop + detailH;
    const railX = S.pad, railW = S.w - 2 * S.pad;
    const markX = railX + R.pad;                     // the selection square's column
    // ...and the ART's, past it. THE 4 px GAP IS MEASURED, not chosen: the mark
    // probe in tests/wave1-checks.js blits FORWARD from Math.round(p.x), so at
    // the suite's fit its 2-device-px patch spans 16.24..19.22 field px — an
    // iconX of 19 would put real icon ink inside the mark probe's own patch.
    const iconX = markX + R.markW + 4;               // 21
    const nameX = iconX + R.iconW + 3;               // 48 — the name, past the art
    const dotX = railX + railW - R.pad - R.dotW;     // the state dot's, at the far edge
    const priceRight = dotX - 3;                     // the price hangs off the dot
    const railRect = {
      x: railX, y: railTop + R.pad,
      w: railW, h: R.railH - 2 * R.pad,
      capH: R.capH, rowH: R.rowH,
      markX, markW: R.markW, iconX, iconW: R.iconW, nameX,
      dotX, dotW: R.dotW, priceRight,
      trackW: priceRight - R.priceW - nameX,
    };
    return {
      cards,
      w: S.w,
      h: railTop + R.railH,
      // the header's DESIGN baseline. It is a baseline, not a rect, so the draw
      // is allowed to push it DOWN when a floor-grown font's ascenders would
      // otherwise climb out of the space the rects leave — see drawShopPanel.
      // It never moves a card, a hit test or a wire index, and at the design
      // sizes the draw lands on this exact number.
      headerY: S.headerY,
      detailTop, detailH,
      railTop, railH: R.railH,
      // the band's INK rect and EVERY column inside it. The draw reads these
      // and a check reads these; neither re-adds a pad to railTop, re-spells a
      // row height or re-picks a dot's x. One table, one derivation, one space
      // — the SHOPUI/shopLayout idiom one band lower.
      rail: railRect,
    };
  }

  // ---- the shop panel's TYPE ----------------------------------------------
  // The second table, and the same idiom: ONE derivation the draw reads and
  // nothing else does. shopLayout() answers "where"; shopTextPlan() answers
  // "how big", and the two are independent by construction — no font size
  // here can move a card rect, a hit test or a wire index.
  //
  // `ratio` is CSS px per LOGICAL panel unit (game.js's panelPlace scale
  // divided by dpr). It is a pure SCALE, never a position: it enters only
  // through this function, and its whole job is to answer "how many logical
  // px does an 11 CSS px name cost at this fit?". A falsy or non-positive
  // ratio — a headless caller, a collapsed gutter, an unpassed argument —
  // means "the design sizes", which is exactly the picture the panel drew
  // before the floors existed.
  //
  // It is also the ONLY argument. The plan used to take game.js's `compact`
  // flag as a second one — a WIDTH threshold on the gutter — and that is the
  // thing this function replaced: it already knows how big the name will be,
  // so it can ASK whether the name would be legible instead of inferring it
  // from how narrow the column is. `prose` below is that question, the plan
  // answers it, and the draw obeys it for both prose elements. One argument
  // in, one plan out, no hidden state on either side.
  //
  // Each tier grows until it clears its CSS-px floor at the live ratio, then
  // stops at the widest size its box can still hold. That width is counted,
  // never measured: FONT resolves to a monospace face on every platform in
  // the chain, whose advance measures 0.600 em at dpr >= 2 and rounds up to
  // 0.625 em at dpr 1, so 0.65 em is conservative everywhere — and counting
  // characters sidesteps measureText entirely, which the headless DOM stub
  // answers `undefined` for.
  //
  // WHERE THE FLOOR STOPS BEING A FLOOR. Each tier is capped by the box that
  // holds its longest live string, and below a certain fit that cap wins: the
  // name's box is one 154 px card and its longest string is 12 characters, so
  // the name cannot exceed 154 / (0.65 * 12) = 19.74 logical px, and 19.74
  // logical px only reaches 11 CSS px at a ratio of 0.557. Below that — a
  // window under roughly 563 CSS px of usable height, or a gutter squeezed
  // narrower still — the name degrades along the cap instead of holding the
  // floor. That is the honest trade and not a bug: you cannot have an 11 CSS
  // px floor AND a twelve-character name inside a 154 px card at every size,
  // and the alternative (clipping the name, or letting it run off the card)
  // reads worse than type that shrinks. The degradation is pinned by a test
  // leg so it stays deliberate — and it does not run away: it slides from
  // 11 CSS px down to 9, and at 9 the PROSE CUT below takes over and the panel
  // stops painting words rather than painting unreadable ones. So the name is
  // only ever drawn somewhere between 9 and 11 CSS px, or not at all.
  const TEXTFLOOR = { header: 11, name: 11, price: 11, detail: 9 }; // CSS px, the legibility line
  const TEXTDESIGN = { header: 11, name: 8, price: 9, detail: 8 };  // ...and the sizes a roomy fit keeps
  // THE PROSE CUT, in CSS px. Above this the panel paints its words; below it
  // the words genuinely would be noise and the panel keeps only the picture
  // and the price. 9 is the smallest size this monospace face still resolves
  // as letters rather than texture on a 1x screen, and it is deliberately
  // UNDER the name's 11 px floor: between the two the name is degrading along
  // its width cap (see WHERE THE FLOOR STOPS BEING A FLOOR above), and a name
  // at 9.5 px is still a name — dropping it there would throw away the band
  // of fits this cut exists to serve.
  const NAMEMIN = 9;
  const EMW = 0.65; // the conservative monospace advance, in em
  const PIPH = 5;   // drawShopPips' square — the rank row under the price
  // The ink a line of type actually occupies around its baseline, in em. Three
  // derivations need both halves: the panel header's baseline, the gutter
  // hint's (its ascent is what keeps it out of the last card, its descent what
  // keeps it off the border), and the field panel's line count — where the tail
  // below the last baseline is one descender, not a whole line-height.
  // Conservative for the monospace faces FONT resolves to (cap height ~0.72 em,
  // descender ~0.21 em), and counted rather than measured for the same reason
  // the widths are: the headless DOM stub answers `undefined` for measureText.
  const INKASC = 0.75, INKDESC = 0.25;
  // The catalog's longest row NAME, in characters. SHOP is a module constant,
  // so this is one too — and deriving it once is what makes shopLayout's hint
  // band and shopTextPlan's name cap the same number by construction instead
  // of by coincidence.
  const NAMECHARS = SHOP.reduce((n, row) => Math.max(n, row.name.length), 1);
  // ---- the idle hint's band, sized from the type that will sit in it -------
  // HINTPX is the LARGEST the hint's type can ever be, and it is derived, not
  // picked. The detail tier is min(inner / EMW, max(8, 9 / r)), so it GROWS as
  // the fit shrinks — and the fit stops shrinking at the PROSE CUT, because
  // below that the hint is not painted at all. The cut sits at
  // r = NAMEMIN / nameCap, so the hint's largest live size is
  // 9 / (NAMEMIN / nameCap) = nameCap exactly: 154 / (0.65 * 12) = 19.7436
  // logical px. That identity holds for any catalog — the two expressions are
  // the same one — unless the detail tier's own inner/EMW ceiling binds, which
  // would take a longest name of under one character.
  const HINTPX = SHOPUI.cardW / (EMW * NAMECHARS);
  // ...and the air around it. The ink itself is one em about the baseline
  // (INKASC + INKDESC), and HINTPX already counts that, so this is the panel's
  // own 1 px border plus 2 logical px so the descender does not sit on it.
  const HINTAIR = 3;
  // The band's WHOLE content. Twelve characters, which is exactly the wrap
  // budget at the narrowest fit that still draws it: at the prose cut the
  // detail size is HINTPX, so the budget is inner / (EMW * HINTPX) =
  // 154 / (0.65 * 154 / (0.65 * 12)) = 12 on the nose. It is the only thing
  // left telling a new player the column is clickable at all, which is why it
  // survived the band's deletion.
  const SHOPHINT = "click to buy";
  function shopTextPlan(ratio) {
    const S = SHOPUI;
    const r = ratio > 0 ? ratio : 0;
    // the longest LIVE price, counted off the real catalog — so a price that
    // grows a digit tightens its own cap instead of overflowing a hardcoded
    // count. (The longest NAME is NAMECHARS, a module constant: names cannot
    // change at run time, and the hint band above is sized off the same one.)
    let priceChars = 5; // "MAXED" is a price string too, and the longest short one
    for (let i = 0; i < SHOP.length; i++) {
      const p = String(shopCost(i)).length + 3; // "1024" + " XP"
      if (p > priceChars) priceChars = p;
    }
    const inner = S.w - 2 * S.pad;
    const tier = (key, cap) =>
      Math.min(cap, r > 0 ? Math.max(TEXTDESIGN[key], TEXTFLOOR[key] / r) : TEXTDESIGN[key]);
    // "SHOP" and the wallet share the one header row, and they are sized
    // INDEPENDENTLY. Sizing them together — one width cap counting both
    // strings — made the header SHRINK as the wallet grew a digit, which is
    // this ticket's own failure mode reproduced on the panel's most-read
    // number. "SHOP" is four characters in a 154 px row, so it holds the
    // floor on its own; the wallet then takes the floor too, unless the
    // width "SHOP" and a character of air leave it is genuinely too small,
    // and only then does it shrink, and only as far as it must.
    const headerPx = tier("header", inner / (EMW * 4));
    const walletChars = 3 + String(localSeatRec().xp).length; // "XP " and the number
    // 1 logical px is the degenerate floor: a fit that narrow (ratio under
    // ~0.19, where "SHOP" alone fills the row) has already lost the header,
    // and a zero or negative font size is a canvas fault, not a design.
    const walletPx = Math.max(1,
      tier("header", (inner - EMW * headerPx * 5) / (EMW * walletChars)));
    const namePx = tier("name", S.cardW / (EMW * NAMECHARS));
    // the price never outgrows the NAME — a card whose price reads larger
    // than the thing it prices has its hierarchy inverted — except by the
    // single px the roomy card has always had (design 9 against the name's 8).
    const pricePx = Math.min(tier("price", S.cardW / (EMW * priceChars)),
      Math.max(namePx, TEXTDESIGN.price));
    const detailPx = tier("detail", inner / EMW); // one character always fits;
                                                  // the wrap budget below is the real cap
    // ---- the PROSE cut -----------------------------------------------------
    // The panel decides for itself whether to paint words, from the words it
    // is about to paint. The old cut was game.js's `compact` — ox/dpr < 110 —
    // a hand-picked WIDTH threshold from a time when the panel had no
    // legibility floor and a squeezed column really did render the name at
    // 5 px. Now the floor exists, so the honest question is not "how narrow is
    // the gutter" but "how big will the name actually be", and that is a
    // question this function has already answered.
    //
    // WHERE IT FLIPS. namePx is cap-bound at 154 / (0.65 * 12) = 19.7436 for
    // the twelve-character names, so while the WIDTH term binds the rule turns
    // over at ratio 9 / 19.7436 = 0.45584 — a gutter of 0.45584 * 170 + 16 =
    // 93.49 CSS px, the DERIVED equivalent of the 110 that used to be picked
    // by hand. Above that ratio the product only ever grows (19.7436 * r while
    // the cap binds, a flat 11 while the floor does, 8 * r once the design
    // size takes over at r > 1.375), so the cut is a single clean flip with no
    // band of fits that oscillates across it.
    //
    // A 1306x1030 window at dpr 1.25 — the report this rule was written from —
    // fits at ratio 0.4822 and lands the name at 9.52 CSS px, so it draws its
    // prose. (This paragraph used to add that "the suites' own 780x493 fits at
    // 0.3549 and lands it at 7.01, so they do not". PRE-EXISTING and FALSE —
    // byte-identical at `667b70b`, and wrong there too: the suite viewport has
    // fitted over the cut since the panel height last moved, and since S7 made
    // the column the HAND it fits at 0.7784659 with a full shelf and 0.9647059
    // with none. The suites reach the wordless branch by handing this function
    // a ratio of their own, never by their window. S7-CX-04.) A degenerate ratio means "the design sizes" everywhere else
    // in this function, and the design picture has always had prose in it — an
    // unknown fit is not evidence that the name is illegible — so the fallback
    // says yes rather than silently stripping the panel's words.
    const prose = r > 0 ? namePx * r >= NAMEMIN : true;
    // What the card owes its text: the price line, the pip row, a little air —
    // and the NAME line, which is reserved exactly when it is painted.
    // (Reserving it unconditionally cost the wordless card 43% of its icon for
    // a row it never drew.) One flag drives both, so the reservation and the
    // paint cannot disagree. The icon takes what is left, and the 24 floor
    // keeps it from vanishing on an absurdly short window even if the type has
    // to overrun the card.
    const band = (prose ? namePx : 0) + pricePx + PIPH + 4;
    const icon = Math.max(24, Math.min(S.icon, S.cardH - band - 3));
    // The header's BASELINE is derived here too, for the same reason the
    // hint's is: headerH is 26 logical px and a floor-grown header can
    // outgrow it, so hanging the ink off the literal 22 would push descenders
    // into card 0 (it only clears today because "SHOP" and digits have none).
    // Three rules, outermost last: slide up until the DESCENT clears card 0;
    // if that pushes the ASCENT off the panel's top edge, slide back down; and
    // never, whatever the size, let the baseline itself cross into card 0 —
    // the row is caps and digits, so the baseline IS the ink's bottom edge and
    // that last clamp is what keeps the header off the first card at any fit.
    // At the design size all three pass and it lands on S.headerY, unmoved.
    const headTall = Math.max(headerPx, walletPx);
    const headerBase = Math.min(S.headerH, Math.max(INKASC * headTall,
      Math.min(S.headerY, S.headerH - INKDESC * headTall)));
    return { headerPx, walletPx, headerBase, namePx, pricePx, detailPx, icon, band, prose,
      detailCols: Math.max(1, Math.floor(inner / (EMW * detailPx))) };
  }

  // Greedy word wrap to a CHARACTER budget — a monospace count, so no metrics
  // read is involved. Breaks on spaces only: a single word longer than the
  // budget overflows its own line rather than being cut in half, because a word
  // split mid-stem reads worse than a whisker of overhang. It used to append
  // into a caller's array so the desc and the reason built one list; the field
  // panel keeps them SEPARATE on purpose — the reason-first rule slices the two
  // independently — so it hands back its own list and the parameter is gone.
  function shopWrap(text, cols) {
    const out = [];
    const words = String(text).split(" ");
    let line = "";
    for (const w of words) {
      if (!w) continue;
      if (!line) line = w;
      else if (line.length + 1 + w.length <= cols) line += " " + w;
      else { out.push(line); line = w; }
    }
    if (line) out.push(line);
    return out;
  }

  // ---- the idle hint's one line -------------------------------------------
  // All that is left of the gutter's detail band. It used to wrap a hovered
  // row's desc and the reason it would not sell into whatever the rail had
  // room for; the rail is 170 logical px, and at the user's own window that
  // was 12 characters and 3 lines. So the prose moved to the FIELD
  // (shopHoverPlan), and the band kept the one thing the field cannot say:
  // that the column is clickable at all.
  //
  // One line has no wrap priority and no room arithmetic, so neither survives
  // here — the reason-priority rule and the line-count budget moved to the
  // field panel with the prose. What DOES survive is the ink-clearance
  // guarantee the derived first baseline bought: the hint hangs from
  // detailTop — where the card column's gap ends — so its ascender starts at
  // or below that line whatever the legibility floor does to the type, and the
  // band was sized (HINTPX + HINTAIR) so its descender clears the border on
  // the other side. Both ends are arithmetic, at every fit.
  function shopHintLine(P, L) {
    return { text: SHOPHINT, base: L.detailTop + INKASC * P.detailPx, cols: P.detailCols };
  }

  // ---- the hovered row's own panel, over the FIELD -------------------------
  // The gutter rail can carry a picture, a name and a price; it cannot carry a
  // sentence. The field can: 512 x 342 LOGICAL px, drawn at the field's own
  // scale — 2.17 CSS px per logical unit at the user's window against the
  // panel's 0.48, four and a half times the type for the same nominal size —
  // so the ordinary 9 and 10 px HUD sizes set here read large.
  // That is why this panel needs no floor machinery and no ratio argument: it
  // is sized in the same space, and at the same sizes, as the WAVE readout
  // beside it.
  //
  // WHERE IT LANDS, AND WHY NOTHING STANDS DOWN FOR IT. The retired eight-way
  // thrust art sat centred in this band and cut both the top-left status stack
  // and game.js's corner map in half — an opaque bitmap 342 logical px wide —
  // which is the whole reason the ringCardShown/hudSuppressed handshake
  // existed. A text panel does not need that, and standing the HUD down on
  // every hover would strobe the wave, the hull and the wallet at exactly the
  // moment the player is deciding what to spend on. So the panel takes the
  // CHANNEL between the two instead: from the status stack's own right edge to
  // the corner map's left one. It overlaps neither, at any wave number, any
  // hull count and any wallet — by construction rather than by measurement —
  // and the handshake is gone.
  const HOVERUI = {
    top: 40,   // the retired art's own top edge, kept: it clears the HOSTILES
               // INBOUND line (700 11px on the y = 30 baseline, ink to 32.75)
    gap: 10,   // logical px of air between the panel and each block it clears
    maxW: 300, // ...and the widest it will grow even when the channel is wider
    minW: 160, // the narrowest that still holds the header line — the longest
               // row name and the longest price, a space apart, at headPx. Under
               // it the channel has closed and the panel stands down rather
               // than painting a name over its own price.
    pad: 6,
    headPx: 10, // the WAVE readout's size — the row NAME and its COST
    bodyPx: 9,  // the XP / FOES readouts' size — the desc and the reason
    lead: 4,    // air between the header's descender and the first body ascender
    // the state overlays' headline — 700 15px hung on the FH / 2 - 8 baseline
    // (the cleared banner, SHIP DOWN, SHIP DESTROYED). The panel's box stops
    // two logical px above where that headline's ink begins.
    overlayPx: 15, overlayDrop: 8,
  };

  // The WAVE CLEAR card's own life, in ticks. A function, not a snapshot:
  // __test.cfg IS ECFG, so a hold explored at runtime must reach this too.
  // The Math.min makes the dangerous direction impossible — a retune below
  // 210 shortens the card with the break, a retune above never lengthens it.
  const bannerHold = () => Math.min(210, ECFG.clearHold);

  // The top-left status stack's right edge, in FIELD px, derived from the exact
  // numbers encDrawHud sets that column with: the WAVE header at 10 px, the
  // hull pip row and the ENERGY bar under it — the bar is the wider of those
  // two, its 1 px stroke sitting half a pixel outside the last pip — and the
  // two 9 px readouts. Counted on the same 0.65 em budget the rest of this file
  // counts with, which over-reads every monospace face FONT resolves to (real
  // ink at 1306x1030 measured 7.2 px inside the WAVE term). No measureText.
  // ---- THE FOE COUNT, ONE DERIVATION (S3b lane 3, commit D5) --------------
  // The HUD's FOES readout counted `E.enemies.length + queuedCount()` — the
  // bodies on the field plus the shares the schedule still owed. Both are
  // deleted, and a readout that answered 0 under a full field would be worse
  // than no readout: it is the one number that tells a pilot whether the room
  // is nearly clear.
  //
  // SO IT READS THE PLANE THAT HAS BODIES, and it counts what a pilot can shoot
  // — live, undead.
  //
  // ---- D21 ANSWERED "NEARLY CLEAR", AND THE ANSWER IS THIS NUMBER ---------
  // The note here said the QUEUED half had no counterpart and was not invented,
  // because "the successor plane's director does not publish an owed count, and
  // D21's clear-to-advance is the round that decides what 'nearly clear' means
  // there." PORT-S S4 commit E decided it: a setpiece ends when NO LIVE BODY
  // REMAINS AND NOTHING IS STILL COMING, and the LIVE half of that gate is this
  // exact census. So the FOES readout is not merely a number beside the gate —
  // it is the gate's own first term, and the pilot watching it counting down is
  // watching the condition that will end the setpiece.
  //
  // ONE DERIVATION, IN THE KERNEL. This file walked the body list here and
  // again in `applyKernelHud`, and the gate would have been a third copy;
  // `kernelFoes()` reads the kernel's own `liveBodies()` through the host, so a
  // room that is empty to the gate cannot be non-empty to the HUD. The OWED
  // count is still not invented — `pendingArrivals()` is the gate's second term
  // and it is deliberately not on the HUD, because "three more are coming" is a
  // spoiler about a portal the player can already see.
  // WITH NO HOST INSTALLED IT IS 0, which is the truth on a page with no
  // encounter at all.
  const foeCount = () => kernelFoes();

  // ---- THE DIRECTOR LINE, ONE DERIVATION (PORT-S S8) ---------------------
  // The status column's y = 16 header, and the ONLY caption on it. Every term
  // is printed exactly when it EXISTS and never as a placeholder — a caption
  // that reads "1 / 1" forever teaches nothing, and one that reads a dash
  // teaches less:
  //   WAVE n                       always
  //   · ENCOUNTER k / m            only while ENCPERREWARD > 1, S7's own dial
  //   · LOOP L                     only once the arc has turned at least once
  //   · CLEAR                      the existing suffix, and it keeps its place
  //                                LAST because that is where it has always been
  // NO PHASE WORD. The `· CLEAR` suffix and the y = 30 slot's three mutually
  // exclusive tenants already carry the phase between them; a fourth spelling
  // of it would be a second authority on the same fact.
  //
  // TWO CALLERS, AND THAT IS THE WHOLE REASON THIS FUNCTION EXISTS. The draw
  // in encDrawHud printed the string, and statusStackRight() BUILT IT AGAIN,
  // character for character, to measure the column's right edge with. Two
  // copies of a string that was never going to grow are harmless; the moment
  // the caption grows a suffix they part, the width under-measures by exactly
  // that suffix, and the field hover panel's left edge slides back into the
  // caption's ink. So the derivation is here and both read it.
  //
  // IT IS THE y = 16 HEADER AND NOTHING ELSE. The centre card's "WAVE n CLEAR"
  // (a different string, pinned by exact .includes() in three break legs) and
  // the stall banner keep their own words.
  //
  // A FACT ABOUT THE ROOM, so it is NOT under seatless() — the same
  // distinction the break countdown already draws for itself.
  function waveHeader() {
    let s = "WAVE " + E.wave;
    if (ENCPERREWARD > 1) {
      s += " · ENCOUNTER " + (((E.wave - 1) % ENCPERREWARD) + 1) + " / " + ENCPERREWARD;
    }
    if (E.loop > 0) s += " · LOOP " + E.loop;
    if (E.state === "cleared") s += " · CLEAR";
    return s;
  }

  // D48 (PORT-L) — THE TOP-LEFT COLUMN'S TWO SHARED DERIVATIONS. Both the draw
  // and statusStackRight() call these, so the measured stack and the painted
  // ink cannot disagree — the retired-third-copy lesson, one plane over.
  //   THE hullMax TERM IN barW IS NOT DECORATION. statusStackRight() is what
  // the hover channel's left edge derives from, and wave1's channel sweep walks
  // hullMax until the panel stands down; a width that stopped answering hullMax
  // would run that sweep 200 sterile iterations and the leg asserts it closes.
  //   THE FLOOR IS LEGIBILITY: at hullMax 3 the pip row was 27 px, and a
  // 0.06-hull kernel graze rendered as 0.05 px of ink. At 120 px it is 2.4.
  function hullBarW(LS) { return Math.max(120, LS.hullMax * 10 - 3); }
  // The number beside the bar is on a 100 SCALE and is DISPLAY ONLY — the sim
  // keeps its own hullMax. `ceil` so a live sliver never reads 0 (the lie
  // js/net.js used to ship), and max(1, …) so it never reads 0 either way.
  function hullShown(LS) {
    return LS.hullMax > 0 ? Math.max(1, Math.ceil((LS.hull / LS.hullMax) * 100)) : 0;
  }
  function statusStackRight() {
    const wave = waveHeader(); // the DRAW's own string, not a second spelling
    const foes = "FOES " + foeCount();
    const LS = localSeatRec();
    const barW = hullBarW(LS);                 // ONE derivation with the draw
    const POOL = presentedPool(localSeat());
    const hullLine = "HULL " + hullShown(LS) + " / 100";
    const enLine = "ENERGY " + Math.floor(POOL.en) + " / " + Math.round(POOL.enMax);
    return Math.max(
      8 + EMW * 10 * wave.length,
      // the two numbers sit BESIDE their bars, at 400 8px — the band between
      // the header's ink and XP's is 20.75 px and two bars plus two stacked
      // text rows need ~24, and y 30 and y 57 are pinned baselines in two
      // suites each
      8 + barW + 5 + EMW * 8 * hullLine.length,
      8 + barW + 5 + EMW * 8 * enLine.length,
      8 + EMW * 9 * ("XP " + LS.xp).length,
      8 + EMW * 9 * foes.length);
  }

  // The channel itself. game.js owns the corner map, and this file reads its
  // two constants directly — the same crossing shopPopupRect used to make for
  // RING_RATIO. The map's rect is reserved whether or not MINIMAP is on, so a
  // dev toggle can never move the panel.
  function shopHoverBand() {
    const H = HOVERUI;
    return {
      x0: statusStackRight() + H.gap,
      x1: FW - MM_W - MM_M - H.gap,
      top: H.top,
      bottom: FH / 2 - H.overlayDrop - INKASC * H.overlayPx - 2,
    };
  }

  // The panel's whole plan — its box, its two header strings, and the lines
  // under them — so the draw is a paint loop and a check can pin the geometry
  // without reading a pixel. Null means "nothing to draw": no live hover, or a
  // channel too narrow to write in. Reads sim state, writes none.
  //
  // `band` is a SEAM, not a caller's business: the draw passes nothing and gets
  // the live channel. It exists because the room clamp below is a guard, and
  // the live field never presses on it — 512 x 342 logical px leaves seven body
  // lines and the longest thing this catalog can say is three. A guard that
  // cannot be exercised is a guess, so a check hands in a short band and drives
  // the real arithmetic instead of re-deriving it.
  function shopHoverPlan(band) {
    const H = HOVERUI;
    const i = E.shopHover;
    if (!(G.running && i >= 0 && SHOP[i])) return null;
    band = band || shopHoverBand();
    const w = Math.min(H.maxW, band.x1 - band.x0);
    if (!(w >= H.minW)) return null;
    const row = SHOP[i];
    const cost = shopCost(i);
    const maxed = shopMaxed(i);
    const offered = !row.can || row.can(localSeat());
    // the card's own price string — the SAME call the card makes, not a copy
    // of its expression. The panel names the row the pointer is resting on, so
    // the two must agree character for character or the player reads two
    // prices for one thing; agreeing by construction is the only way that
    // cannot drift, and a comment promising it was not enough (a mutation that
    // made a MAXED row read "MAXED" on the card and "64 XP" here went unseen).
    const price = shopPriceLabel(i);
    const why = !seatAlive(localSeat()) ? "ship down — browse only"
      : maxed ? "fully upgraded"
      : !offered ? "not needed right now"
      : localSeatRec().xp < cost ? "need " + (cost - localSeatRec().xp) + " more XP"
      : null;
    // the wrap budget, counted against the panel's OWN width — ~49 characters
    // at the full 300, against the gutter band's 12
    const cols = Math.max(1, Math.floor((w - 2 * H.pad) / (EMW * H.bodyPx)));
    const desc = shopWrap(row.desc, cols);
    const tail = why ? shopWrap(why, cols) : [];
    const headBase = band.top + H.pad + INKASC * H.headPx;
    const lh = H.bodyPx * 1.25;
    const base0 = headBase + INKDESC * H.headPx + H.lead + INKASC * H.bodyPx;
    // how many body lines the band holds, decided by the last line's INK and
    // not by its advance — the tail below the final baseline is one descender,
    // not a whole line-height. LINEEPS resolves the exact tie the same way the
    // geometry does: avail / lh is a float quotient and at the fits where it
    // should be whole it can land an ulp under, which a bare floor would spend
    // by dropping a line the panel had room for.
    const LINEEPS = 1e-9;
    const avail = band.bottom - H.pad - INKDESC * H.bodyPx - base0;
    const room = avail >= 0 ? Math.floor(avail / lh + LINEEPS) + 1 : 0;
    // The REASON has PRIORITY — the rule the gutter band used to own, moved
    // here with the prose it governs. It is the only feedback a refused
    // purchase gives, and the desc is the one thing the player can already
    // guess from the row's name and its art, so the reason claims its lines
    // first and the desc gives up WHOLE lines to make room, never the other
    // way round. A desc that runs out of room stops at a line boundary: a
    // clipped half-line under the border reads as a rendering fault, a shorter
    // blurb reads as prose that ran long.
    const keep = tail.slice(0, room);
    const head = desc.slice(0, Math.max(0, room - keep.length));
    const lines = head.concat(keep);
    // ...and the box is sized to the lines it actually produced, never to the
    // room it was offered — a two-line hover must not paint a seven-line hole
    // in the field.
    const inkBottom = lines.length
      ? base0 + (lines.length - 1) * lh + INKDESC * H.bodyPx
      : headBase + INKDESC * H.headPx;
    return {
      x: band.x0 + (band.x1 - band.x0 - w) / 2, y: band.top,
      w, h: inkBottom + H.pad - band.top,
      name: row.name, price, why, cols, lines, whyLines: keep.length,
      headBase, base0, lh, room, band,
    };
  }

  // ...and the paint. Field coordinates, the HUD's own type sizes and its
  // colour vocabulary: the name in C.bright, the price and the refusal in
  // C.clay — the accent every number the player decides against is already
  // drawn in — and the desc in C.dim. The ground is opaque because the field
  // under it is stars and hulls, and prose over either is unreadable.
  function drawShopHoverPanel() {
    const P = shopHoverPlan();
    if (!P) return;
    const H = HOVERUI;
    ctx.fillStyle = C.fieldBg;
    ctx.fillRect(P.x, P.y, P.w, P.h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = C.clay;
    ctx.strokeRect(P.x + 0.5, P.y + 0.5, P.w - 1, P.h - 1);
    ctx.font = "700 " + H.headPx + "px " + FONT;
    ctx.textAlign = "left";
    ctx.fillStyle = C.bright;
    ctx.fillText(P.name, P.x + H.pad, P.headBase);
    ctx.textAlign = "right";
    ctx.fillStyle = C.clay;
    ctx.fillText(P.price, P.x + P.w - H.pad, P.headBase);
    ctx.textAlign = "left";
    ctx.font = "400 " + H.bodyPx + "px " + FONT;
    const firstWhy = P.lines.length - P.whyLines;
    for (let n = 0; n < P.lines.length; n++) {
      ctx.fillStyle = n >= firstWhy ? C.clay : C.dim;
      ctx.fillText(P.lines[n], P.x + H.pad, P.base0 + n * P.lh);
    }
  }

  const inRect = (x, y, r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

  // ---- the shop's input — the pointer, and only the pointer ---------------
  // game.js calls both of these with LOGICAL PANEL coordinates (its gutter
  // routing converts the native pointer or the drawn cursor through the same
  // panelPlace transform the draw uses). The panel is live whenever the game
  // is: no freeze gates it, and a downed seat may hover freely — buy() alone
  // enforces "browse dead, spend alive". Paused, the hover clears: the pause
  // menu owns the pointer there.
  function shopHover(x, y) {
    if (!G.running) { E.shopHover = -1; return false; }
    const L = shopLayout();
    let hit = -1;
    for (const c of L.cards) {
      if (inRect(x, y, c)) { hit = c.i; break; }
    }
    E.shopHover = hit;
    return x >= 0 && x < L.w && y >= 0 && y < L.h;
  }

  // Returns whether the click was CONSUMED, which it is only when it lands a
  // card: the panel owns its column, but a gutter click that misses every
  // card is nobody's — it neither buys nor fires (the field never saw it).
  // A click is its own hover: the pointer may have arrived without a single
  // mousemove landing on the card underneath it.
  function shopClick(x, y) {
    if (!G.running) return false;
    shopHover(x, y);
    if (E.shopHover < 0) return false;
    // NET MODE: the client hit-tests LOCALLY through this same shopLayout()
    // table — its logical panel space is client-independent — and sends the
    // RESOLVED row index upstream ({v, ui: "buy", item}), never a
    // coordinate: the server has no window, no dpr and no gutter, and
    // device-derived numbers must not cross the wire. Net.buy returns false
    // when net mode is off, so local play and every headless suite fall
    // straight through to buy() below.
    if (window.Net && Net.buy && Net.buy(E.shopHover)) return true;
    buy(E.shopHover);
    return true;
  }

  // (The HUD suppression handshake is gone with the art that needed it.
  // ringCardShown()/hudSuppressed() answered ONE question — "is a row's big
  // opaque explainer bitmap on the screen, slicing the status stack and the
  // corner map in half?" — and no row has carried that art since the WSAD
  // ENGINE CONTROLS row was retired, so the pair had been permanently false
  // while its comments claimed otherwise. Its replacement, the hovered row's
  // field panel, is placed in the channel BETWEEN those two layers rather than
  // over them, so nothing has to stand down and there is no second mechanism:
  // see shopHoverBand.)

  // one card's picture, or the placeholder that stands in for bytes that never
  // arrived. alpha is how the unaffordable and the unavailable read as such —
  // the icons are flat single-purpose art, so dimming them beats recolouring.
  function drawShopIcon(i, x, y, size, alpha) {
    drawIconRec(ICONS[i], x, y, size, alpha);
  }
  // ...and the same draw addressed by RECORD rather than by shop index, which
  // is what the loadout rail needs: its rows are abilities, not catalog rows.
  // THE RAIL PASSES NO PLACEHOLDER — it calls this only when rec.ok, because
  // the stroked X below is card-sized (x+9 .. x+size-9) and would be a scribble
  // at 24 px. A rail that shipped a stroked X on the COMET row is worse than
  // no art.
  function drawIconRec(rec, x, y, size, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    if (rec && rec.ok) {
      ctx.drawImage(rec.img, x, y, size, size);
    } else {
      ctx.strokeStyle = C.clay;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
      ctx.beginPath();
      ctx.moveTo(x + 9, y + 9);
      ctx.lineTo(x + size - 9, y + size - 9);
      ctx.moveTo(x + size - 9, y + 9);
      ctx.lineTo(x + 9, y + size - 9);
      ctx.stroke();
    }
    ctx.restore();
  }

  // the rank read-out under a card's price. A CAPPED row shows every slot it
  // will ever have, filled and empty, so "two of five" is one glance; an
  // uncapped doubling row has no denominator to draw, so it shows only what
  // was bought. A flat uncapped row (HULL PATCH) is a consumable whose count
  // means nothing to the player, and shows nothing at all.
  function drawShopPips(i, cx, y) {
    const row = SHOP[i];
    const slots = row.cap !== undefined ? row.cap : (row.curve === "double" ? localSeatRec().owned[i] : 0);
    const n = Math.min(slots, 10); // the uncapped rows have no ceiling; the card does
    if (n <= 0) return;
    const pw = 5, pg = 3;
    let px = Math.round(cx - (n * pw + (n - 1) * pg) / 2);
    for (let k = 0; k < n; k++) {
      if (k < localSeatRec().owned[i]) {
        ctx.fillStyle = C.clay;
        ctx.fillRect(px, y, pw, pw);
      } else {
        ctx.strokeStyle = C.wall;
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, y + 0.5, pw - 1, pw - 1);
      }
      px += pw + pg;
    }
  }

  // ---- the gutter panels — drawn in LOGICAL PANEL space -------------------
  // game.js sets the transform (panelPlace) before each call, so everything
  // here draws in the same fixed space shopLayout() lays its rects out in.
  // Presentation only: nothing in either function mutates sim state or
  // consumes randomness, and the suites stand both panels down through
  // game.js's setPanels lever — the same isolating role MINIMAP plays for
  // the corner map.
  //
  // `ratio` is the fit's CSS px per logical unit — game.js's ONE presentation
  // scalar, and the only argument. It is spent entirely inside shopTextPlan()
  // so type holds a legibility floor when the gutter squeezes the panel.
  // Nothing device-derived reaches shopLayout(), the hit test or the wire; an
  // absent ratio simply draws the design sizes, which is what every headless
  // caller gets.
  //
  // THE PROSE CUT USED TO BE AN ARGUMENT TOO. This function took game.js's
  // `compact` — ox/dpr < 110 — and dropped the row names and the whole detail
  // band whenever the gutter was narrower than that, on the reasoning that
  // prose at rail scale is only noise. That reasoning was TRUE and its test
  // was wrong: 110 was picked when a squeezed name really did render at about
  // 5 px, and once the legibility floor landed the panel no longer had to
  // GUESS from the gutter's width — it can MEASURE the type it is about to
  // set. So the panel now asks its own plan: P.prose is namePx * ratio >= 9
  // CSS px, and both prose elements — the row name and the idle hint — obey
  // that one flag. It flips at ratio 0.45584, a gutter of 93.49 CSS px, which
  // is the derived equivalent of the 110 that was picked by hand. A 1306x1030
  // window at dpr 1.25 sits at 97.98 CSS px of gutter: it was under 110 and
  // showed a wordless panel of icons and prices, and it is over 93.49 and
  // shows its names at 9.52 CSS px. The suites' 780x493 sits at 76.33 and
  // still shows none, so nothing they pin has moved. `compact` still exists in
  // game.js — the leaderboard's own cut is padding, and keeps it — but the
  // shop no longer reads it.
  function drawShopPanel(ratio) {
    const L = shopLayout();
    const P = shopTextPlan(ratio);
    ctx.save();
    ctx.fillStyle = "rgba(14, 17, 25, 0.85)";
    ctx.fillRect(0, 0, L.w, L.h);
    ctx.strokeStyle = C.wall;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, L.w - 1, L.h - 1);
    ctx.textAlign = "left";
    ctx.font = "700 " + P.headerPx + "px " + FONT;
    ctx.fillStyle = C.bright;
    ctx.fillText("SHOP", 8, P.headerBase); // the DERIVED baseline, never the literal
    ctx.textAlign = "right";
    ctx.font = "700 " + P.walletPx + "px " + FONT; // sized on its own — a wallet
                                                   // that grows a digit must never
                                                   // shrink the word beside it
    ctx.fillStyle = C.clay; // the wallet — the number every click is decided against
    ctx.fillText("XP " + localSeatRec().xp, L.w - 8, P.headerBase);
    const down = !seatAlive(localSeat()); // a downed local seat browses; nothing sells
    const warm = E.state === "cleared";
    let anyBuyable = false; // feeds the hint's warm colour after the loop
    // THE COLUMN IS THE LAYOUT'S, not the catalog's (D37, PORT-S S7). It used
    // to be `SHOP.forEach` with slot index === catalog index; it walks the
    // cards now, and each one carries its own catalog row in `c.i`. Everything
    // inside the loop still addresses the catalog, so the icons, pips, prices
    // and the hover all read exactly as they did.
    L.cards.forEach((c) => {
      const i = c.i;
      const row = SHOP[i];
      const maxed = shopMaxed(i);
      const offered = !row.can || row.can(localSeat()); // rows never hide — a card that
                                              // leaves the shelf stays, greyed
      const cost = shopCost(i);
      // ...and a SPENT card is unbuyable too, and draws dimmed like every other
      // unbuyable state. It stays on the shelf: a card that vanished when it
      // was bought would look like a reroll, and D37's rule is the opposite —
      // a purchase marks its card and never rerolls its siblings.
      const buyable = !down && !maxed && offered && !c.bought && localSeatRec().xp >= cost;
      if (buyable) anyBuyable = true;
      const hot = E.shopHover === i;
      ctx.fillStyle = hot ? "#161b28" : C.fieldBg; // the card lifts under the pointer
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.lineWidth = 1;
      // during the break an unhovered affordable card warms to bright — not to
      // clay, which would erase the hover step exactly when clicks are wanted.
      // Keyed on the discrete state, never a clock: two renders in one tick
      // must paint identical bytes for the gutter pixel probes.
      ctx.strokeStyle = hot ? (buyable ? C.clay : C.dim)
                            : (buyable ? (warm ? C.bright : C.dim) : C.wall);
      ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1);
      // the card's interior lays out FROM the plan: the icon takes whatever
      // the planned type leaves it, and each baseline below follows from the
      // size of the line above it — no hardcoded BASELINE survives here, so a
      // floor that grows the name pushes the price and the pips down with it
      const cx = c.x + c.w / 2;
      const textTop = c.y + 3 + P.icon;   // where the icon ends and the type starts
      const nameBase = textTop + P.namePx;
      // a wordless card draws no name, and the plan reserved none, so the
      // price moves up into the row the icon just grew through — the two agree
      // by construction, both reading the same P.prose flag
      const priceBase = (P.prose ? nameBase : textTop) + P.pricePx;
      drawShopIcon(i, cx - P.icon / 2, c.y + 3, P.icon, buyable || hot ? 1 : 0.4);
      ctx.textAlign = "center";
      if (P.prose) {
        ctx.font = "700 " + P.namePx + "px " + FONT;
        ctx.fillStyle = buyable ? C.bright : C.dim;
        ctx.fillText(row.name, cx, nameBase);
      }
      ctx.font = "700 " + P.pricePx + "px " + FONT;
      ctx.fillStyle = buyable ? C.clay : C.dim;
      ctx.fillText(shopPriceLabel(i), cx, priceBase);
      drawShopPips(i, cx, priceBase + 2);
    });
    // The idle hint, and nothing else. It rides the SAME P.prose flag the row
    // names do — a rail too narrow for a name is too narrow for a sentence
    // about one — and it draws exactly when the FIELD panel does not, which is
    // one condition read from one place (shopHoverPlan): a hovered row says
    // everything it has to say on the field, and this line would only be
    // telling the player to do the thing they are already doing. Reading the
    // plan rather than E.shopHover is also what keeps a page PAUSED mid-hover
    // honest — the field panel stands down there, so the hint comes back.
    if (P.prose && !shopHoverPlan()) {
      const B = shopHintLine(P, L);
      ctx.textAlign = "center";
      ctx.font = "400 " + P.detailPx + "px " + FONT;
      // a broke player's panel does not warm — telling someone with no money
      // to shop is nagging
      ctx.fillStyle = (warm && anyBuyable) ? C.clay : C.dim;
      ctx.fillText(B.text, L.w / 2, B.base);
    }
    drawLoadoutRail(L);
    ctx.restore();
  }

  // ---- THE LOADOUT RAIL (PORT-S S8) ---------------------------------------
  // A READOUT band under the market column, in the same panel and the same
  // logical space: what am I flying, is it armable, what does it cost. The
  // board in the right gutter answers "who is winning"; this answers "what am
  // I flying", and the two read as one pair of columns.
  //
  // IT IS THE READER'S OWN SHIP, so it asks `seatless()` itself. The card
  // chain in encDrawHud is an `else if` ladder under one scope guard and a
  // rail is not mutually exclusive with SHIP DOWN, so it cannot inherit that
  // guard by position — it takes its own. The panel's OTHER "is this reader a
  // pilot" test, `seatAlive(localSeat())` above, is the wrong one to copy: a
  // downed pilot still owns a loadout, and still wants to see it.
  //
  // NO KEY LABELS. LMB, Shift and Space are the pause screen's business; a
  // binding printed here would be a second copy of a fact that moves — D30
  // unbound the right button this month — and the copy that goes stale is
  // always the decorative one.
  function drawLoadoutRail(L) {
    if (!LOADOUT || seatless()) return;
    const R = L.rail;
    ctx.fillStyle = C.fieldBg;
    ctx.fillRect(R.x, R.y, R.w, R.h);
    ctx.strokeStyle = C.wall;
    ctx.lineWidth = 1;
    ctx.strokeRect(R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1);
    const A = window.Abilities;
    if (!A) return; // the catalog is the row list; without it there are no rows
    const s = localSeat();
    const LS = localSeatRec();
    const EB = presentedPool(s);   // the SAME presented record the energy bar
                                   // reads — predicted for the local seat in
                                   // net mode, straight off the struct otherwise
    const PL = players[s];
    ctx.textAlign = "left";
    ctx.font = "700 7px " + FONT; // the SHOP header's idiom, one tier quieter:
                                  // this is a caption over a readout, not a
                                  // heading over a thing you click
    ctx.fillStyle = C.dim;
    ctx.fillText("LOADOUT", R.markX, R.y + 7);
    for (let id = 0; id < A.COUNT; id++) {
      const d = A.def(id);
      if (!d) continue;
      const top = R.y + R.capH + id * R.rowH;
      // the text baseline sits in the MIDDLE of the taller row now: top + 17
      // against the icon's top + 1 .. top + 25 band. It was top + 8, which was
      // the middle of a 12 px row.
      const base = top + 17;
      // ---- THE THREE COOLDOWN SHAPES ARE NOT UNIFORM, DELIBERATELY --------
      // js/abilities.js:66-72 records why: FIRE and COMET carry `cd: 0` and a
      // null spawn, because re-encoding either into the slot record would move
      // committed traces to change no behaviour. So this rail asks THREE
      // different questions and shares no answer with itself. A rail written
      // as one loop over slots[] would show FIRE permanently ready — that is
      // the falsification the suite stages.
      //   Each branch is the arm rule's own consumer, never a private copy:
      // sabotage Flight.cometOn or Flight.abilityOn and the sim AND this dot
      // both flip.
      let armed;
      if (id === A.ABILITY.FIRE) {
        // the autofire gun's own pulse IS its truth. There is no published
        // maximum for P.cool — one writer, no denominator anywhere — so the
        // row is BINARY, ready or cooling, and never a fraction.
        armed = EB.cool === 0;
      } else if (id === A.ABILITY.COMET) {
        // the energy bar's twin, character for character. The `press`
        // argument is true because that is the question: not whether the seat
        // is arming, but whether it COULD.
        armed = Flight.cometOn(cometView(s, EB).phase === CP_LIVE,
                               EB.en, EB.enMax, true);
      } else {
        // ...and THE arm rule's third consumer, which js/game.js predicted in
        // writing and did not have until now. The slot record is the PLAYER
        // STRUCT's, on every seat and in both modes: js/net.js decodes the
        // wire's cd[] into P.slots[i].cd precisely so the HUD's availability
        // dim reads presented truth. The predictor publishes no slots, so
        // RAILSHOT's cooldown is wire truth while the pool and FIRE's cool are
        // predicted — two clocks on the local seat, and the honest read.
        armed = Flight.abilityOn(id, PL && PL.slots ? PL.slots[id] : null,
                                 LS.owned, true, EB.en);
      }
      if (id === SELECTED_ABILITY) {
        // the hull pips' own idiom: a small filled square, and the row it sits
        // on is the one Space arms. No key label — bindings are the pause
        // screen's, and a printed binding is a copy that goes stale.
        ctx.fillStyle = C.clay;
        ctx.fillRect(R.markX, base - 3, R.markW, R.markW);
      }
      // THE ART, between the mark and the name, dimmed by the same arm rule the
      // price and the state dot answer — the icons are flat single-purpose art,
      // so dimming beats recolouring. Gated on the bytes having arrived: a
      // missing PNG is a console error, and test/run.mjs fails a run on one.
      const art = RAIL_ICONS[d.key];
      if (art && art.ok) drawIconRec(art, R.iconX, top + 1, R.iconW, armed ? 1 : 0.4);
      ctx.textAlign = "left";
      ctx.font = "400 9px " + FONT;
      ctx.fillStyle = C.bright;
      ctx.fillText(d.name, R.nameX, base);
      if (d.cd > 0) {
        // ...and a row whose whole state lives in the slot draws the slot: a
        // one-px track under the name, filled to what has already elapsed.
        const cd = PL && PL.slots && PL.slots[id] ? PL.slots[id].cd : 0;
        // TWO logical px, not one. railH 56 -> 98 drops the suite's own panel
        // fit from 0.713 to 0.671, so a 1 px track lands on 0.67 DEVICE px and
        // the three legs that read it through a 2x2 blit were untested at that
        // fit. Two px is the insurance, and it costs the row nothing: the band
        // between the baseline and the next row is 9 px.
        ctx.fillStyle = C.dim;
        ctx.fillRect(R.nameX, base + 2, R.trackW, 2);
        ctx.fillStyle = C.clay;
        ctx.fillRect(R.nameX, base + 2,
                     Math.max(0, R.trackW * (1 - Math.min(1, cd / d.cd))), 2);
      }
      if (d.en > 0) {
        // the price, dimmed through the arm rule's OWN energy clause rather
        // than through a second affordability test beside it
        ctx.textAlign = "right";
        ctx.font = "400 9px " + FONT;
        ctx.fillStyle = armed ? C.clay : C.dim;
        ctx.fillText(String(d.en), R.priceRight, base);
      }
      ctx.fillStyle = armed ? C.clay : C.dim;
      ctx.fillRect(R.dotX, top + (R.rowH - R.dotW) / 2, R.dotW, R.dotW);
    }
  }

  // The leaderboard's fixed logical space, right gutter. It ranks and crowns
  // by `best`, the seat's HIGH-WATER score, not by the live one — and that
  // swap is forced by the death rule, not a taste call. Score is XP gained on
  // the CURRENT run now: every death sends it to 0, so a board ranked by it
  // would sit near zero for everyone and hand the crown around on every
  // death. `best` is the standing the King of the Hill contest is actually
  // about — the user's words: "the only score we're supposed to keep is the
  // highest score." The live run stays legible on the same line (see
  // boardScoreLine); it just does not decide the order.
  // Match-scoped: restart() clears best with the run. (The 7-day board
  // arrives with server persistence in phase 09.)
  const BOARDUI = { w: 170, h: 320 };
  // The two DRAW CACHES the name affordances are hit-tested against. Neither is
  // simulation state and neither may go near E: they are the last frame's
  // geometry, recorded by the draw that produced it so the hit test inverts
  // exactly the rects a player can see. drawBoard's rows are recomputed every
  // frame from the ranking (an unseated seat loses its row and the rest
  // redistribute), and the card's box exists only on the frames the card is up.
  // game.js gates both clicks on the same conditions it gates the draws on —
  // panelsOn() && G.started for the board, a rendered card for the box — so a
  // stale cache is unreachable rather than merely unlikely.
  let boardRows = [];       // { s, y0, y1 } per drawn row, in BOARDUI space
  let nameCardRect = null;  // the claim card's name box, in FIELD space
  let skinCellRects = [];   // ...and the ship strip's cells, in FIELD space too

  // The SHIP DOWN card's second line, as a string rather than an inline
  // literal — the copy is a CLAIM about the rules, so it has to be pinnable.
  // It is NEUTRAL on the score, and the reason CHANGED under it. It used to
  // be neutral because it had to be: nothing on the wire said why a seat
  // died, so the client could not tell a PvE death (score stood) from a PvP
  // one (score reset), and a line naming either would be a lie half the time.
  // Both deaths cost the same run now, so a "you lost your run" line would
  // finally be TRUE — it stays out anyway, on the same call that removed the
  // wallet clause: a downed player reads the countdown, not the accounting.
  // The board, one gutter over, is where the numbers live.
  const downCardLine = (S) =>
    "respawn in " + Math.ceil(S.respawnT / 60);

  // ...and the card's OTHER second line, once the countdown has run out and
  // the seat is waiting on its click. Extracted and pinned for exactly the
  // reason downCardLine is: it states a RULE — the click is what deals you
  // back, and a seat nobody claims is taken away — and a rule stated in words
  // on the screen is a claim the suite has to be able to hold. It carries no
  // number on purpose: the seconds left are not the player's decision, the
  // click is, and a ticking 30 reads as a penalty clock rather than a prompt.
  const claimCardLine = () => "click to respawn — idle seats are released";

  // ...and the THIRD state's line, once the window has lapsed and the seat is
  // parked. It exists because the seat is still RECLAIMABLE and nothing on the
  // screen said so: an unseated seat draws no ship (game.js's draw loop skips
  // an absent seat ahead of the glow and the probe, so drawShip is never
  // reached for one), keeps no board row (boardRanking filters it) and matched none of
  // the card branches, so a solo player who stepped away for 40 s came back to a
  // live field with no ship, no row and no text — while a single click would
  // have dealt them straight back in. The affordance was real and invisible,
  // which is the worst of both. Pinned word for word for claimCardLine's own
  // reason, and it restates the rule the previous card promised: the seat was
  // taken away, and it is OPEN rather than lost. No number, same call as above.
  // It is a claim about a seat this client cannot see — somebody faster can take
  // it between the draw and the click — so it has a correction: refusedCardLine
  // below, printed in its place once the server has said no.
  const absentCardLine = () => "click to fly again — a released seat is open, not lost";

  // ...and WHOSE screen that card belongs on, which `absent` on localSeatRec()
  // cannot answer in net mode. The release reaches this client as a `you`
  // clearing its seat, and server.js sends it BEFORE the snapshot that parks
  // the seat — so by the time `absent` could be read, localSeat() has already
  // folded null to 0 and localSeatRec() is handing back SEAT 0's record. That
  // gets the question wrong in both directions: a pilot released from seat 2
  // sees no ship, no board row and no card — the real-and-invisible state
  // absentCardLine exists to prevent, restored one seat over — and every
  // unrelated spectator gets the reclaim card the moment seat 0 lapses, which
  // is a promise the server will refuse. js/net.js's release latch is the only
  // thing that knows which of those two a screen is, because it watched the
  // transition rather than the state. Local play has no server to take a seat
  // away and no latch: the record IS this player's there, so `absent` on it is
  // the honest test, and the same one it always was.
  const releasedHere = (S) => {
    const N = window.Net;
    if (N && N.active && N.active()) return !!(N.released && N.released());
    return !!(S && S.absent);
  };
  // ...and the card's LAST line, for the one thing absentCardLine cannot know:
  // whether the seat it is pointing at is still there. A released seat is open
  // until somebody else takes it, and nothing on this client can see that
  // happen — so the card promised "a released seat is open, not lost" forever
  // while every click was discarded by a server that had already dealt the seat
  // to a faster tab. The server answers a refused ask now (js/net.js's `refused`
  // latch) and the line changes to say so. It still invites the click: a seat
  // can open again on any tick, and the click is the only thing that asks.
  const refusedCardLine = () => "that seat was taken — a click still asks for the next one";
  // ...and WHOSE screen gets that line rather than the promise. Net-only by
  // construction: solo there is no server to refuse anything, and the sim's own
  // claim window is reached by the same click with nobody in between.
  const claimRefusedHere = () => {
    const N = window.Net;
    return !!(N && N.active && N.active() && N.refused && N.refused());
  };

  // ...and the line for the OTHER seatless screen: one that never held a seat
  // to lose. Same affordance, different sentence, because they are different
  // facts and a card that blurs them lies to one of the two: a released pilot
  // is owed the seat it was flying and is told so, a spectator is owed nothing
  // and is asking. It exists at all because the click already works — a
  // seatless socket's fire edge goes up as a `ui: "claim"` (js/net.js) and the
  // server deals it any parked or ungranted seat — and nothing on the screen
  // said so, which is absentCardLine's own "real and invisible" one screen
  // over. It carries no headline: a spectator has a whole live match to watch
  // and a clay headline over the middle of it never goes away, where the
  // released pilot's card is the only thing left on their screen to read.
  const spectatorCardLine = () => "spectating — click to ask for an open seat";
  // ...and its correction, on refusedCardLine's exact ground: the ask came back
  // empty, and "an open seat" is a promise this screen cannot keep until there
  // is one. A separate string rather than a shared one because refusedCardLine
  // names "that seat" — the one this client was flying — and a spectator never
  // had one to have taken. Still invites the click: a seat can open on any tick.
  const spectatorRefusedLine = () => "no seat open — a click still asks for the next one";

  // The board's SCORE LINE, extracted for the same reason downCardLine was:
  // it is a claim about the rules, so it has to be pinnable rather than an
  // inline literal. It carries TWO numbers on one line, because the board
  // must answer two questions at once now — what a seat's standing is (best,
  // which the order and the crown read) and how the seat's CURRENT run is
  // going (score, which its next death will take). A third stacked line was
  // the obvious alternative and was rejected: the panel's height is split
  // evenly across the seats and the two existing lines are already sized to
  // the air that leaves, so a third row would shrink all of them at four
  // seats to buy a number that is 0 most of the time.
  // The parenthesis appears ONLY while the run is behind the standing.
  // While a seat is alive and climbing, score IS best (addXp raises them
  // together), and printing "120 (120)" would be noise on the panel's widest
  // line — the one fit() has the least room for. After a death it reads
  // "120 (0)": the standing held, the run did not.
  const boardScoreLine = (S) =>
    S.score >= S.best ? String(S.best) : S.best + " (" + S.score + ")";

  // THE BOARD'S ORDER, extracted from drawBoard for the same reason the two
  // copy strings above were: it is a rules CLAIM — "the leaderboard ranks by
  // the standing" is the user's actual ask — and inside the draw it was
  // unpinnable. It shipped that way for one commit and a mutation sweep
  // caught it: swapping `best` back to `score` here passed the ENTIRE gate,
  // because every board leg staged the two together and the two orders never
  // disagreed. A comparator can only be pinned by a case where they do, and
  // that case needs the order itself, not the fields it read.
  // Returns drawBoard's own {s, S} pairs, seat-ascending on a tie — the rows
  // in the order they are drawn, top first. Draw-only, like everything else
  // on this side of the file: no sim state, no rand().
  // An UNSEATED seat has no row at all. It is not "dead and dim" — the dim
  // palette says "this pilot is coming back", and nobody is coming back — so
  // the filter runs ahead of the sort and the remaining rows redistribute the
  // panel's height between them. A seat merely DOWN keeps its row: the whole
  // point of the countdown and the claim window is that the seat is still in
  // the match.
  const boardRanking = () => E.seats.map((S, s) => ({ s, S }))
    .filter((r) => !r.S.absent)
    .sort((a, b) => b.S.best - a.S.best || a.s - b.s);

  // ...and WHO LEADS, or -1 when nobody does yet. ONE derivation, because the
  // board's crowned row and the field's crown over the leader's own ship are
  // the same claim about the same match: two copies of it would drift the day
  // one of them learned about a tie, and a field that crowned a different seat
  // than the board beside it would be worse than no crown at all.
  //   It reads `best`, the seat's HIGH-WATER score, and not the live one. Under
  // the death rule a seat's score is 0 for the whole respawn timer, so a crown
  // that ranked by the live number would come off every leader the moment they
  // died — reporting a different question than the board is asking.
  //   `> 0` is the "nobody has scored yet" gate: an unstarted match has four
  // seats on 0 and no leader, and crowning the lowest seat id for that would be
  // an accident of the sort order rather than a standing.
  const kingSeat = () => {
    const ranked = boardRanking();
    return ranked.length && ranked[0].S.best > 0 ? ranked[0].s : -1;
  };

  // ...and WHICH of those rows belongs to the reader, or -1 when none does.
  //   The correction this exists for: boardRanking filters ABSENT SEATS. It
  // knows nothing about the client reading it, so a seatless client is NOT
  // filtered out of the board — it sees every seated row, exactly as a
  // spectator should. What it must not see is one of them called its own.
  // localSeat() folds a missing grant to seat 0 (js/game.js), which is the
  // right answer for a VIEW — the camera has to follow something — and the
  // wrong one for a CLAIM about the reader: drawn off the fold, the board
  // printed "you" under a stranger's row, painted that stranger's name with
  // this client's live edit buffer, and offered the stranger's row as a rename
  // control. seatless() is the half of localSeat() the fold destroys, and this
  // is the board's copy of the guard the overlay chain already runs.
  //   -1, not null: it is compared against seat ids, and -1 matches no row.
  const ownRow = () => (seatless() ? -1 : localSeat());

  // The scoreboard, reworked to the user's spec: per seat, TWO STACKED LINES
  // — the name line ("Player1".."PlayerN" by seat id; no name data exists
  // yet) over the score line (boardScoreLine: the standing, and the live run
  // beside it while the two disagree) — drawn as big as the panel allows.
  // The line used to be `String(r.S.score)` and nothing else; it grew when
  // score stopped surviving a death. The panel
  // height splits evenly across the seats (the score line takes the larger
  // share of each block); each line then fits to the panel width through ONE
  // measureText read — canvas text width scales linearly with font size, so
  // a single measurement at a reference size resolves the largest size that
  // fits. Alive versus dead still reads through COLOR ALONE: the living keep
  // the clay/bright palette with the LOCAL seat brightest, the dead go dim —
  // so the one marker below never carries survival information.
  // ONE marker, added in phase 14: a crown over the leading row. It is drawn
  // for ranked[0] and only when that seat's BEST is above 0, so a board at
  // the start of a match — every seat on 0 — crowns nobody rather than
  // crowning seat 0 by the tie-break, which would read as a bug. It is drawn
  // in C.clay inside the row's own geometry, so no rect moves. No sections,
  // no header, no footnote otherwise. Sort is BEST-descending with the
  // seat-id tie-break — the same comparator shape, reading the standing
  // instead of the live score, so the crown no longer falls off the leader
  // the instant it dies. Still the same 170×320
  // logical space (BOARDUI), so panelPlace, panelAt and suite geometry hold;
  // `compact` only shrinks the padding. Draw-only: no sim state, no rand().
  function drawBoard(compact) {
    const B = BOARDUI;
    ctx.save();
    ctx.fillStyle = "rgba(14, 17, 25, 0.85)";
    ctx.fillRect(0, 0, B.w, B.h);
    ctx.strokeStyle = C.wall;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, B.w - 1, B.h - 1);
    const pad = compact ? 6 : 10;
    const innerW = B.w - pad * 2;
    const ranked = boardRanking(); // the comparator lives above, where a check
                                   // can reach it — the rows below are drawn in
                                   // exactly the order it returns
    const n = Math.max(1, ranked.length);
    const cellH = (B.h - pad * 2) / n;
    const nameH = cellH * 0.34;  // the name line...
    const scoreH = cellH * 0.52; // ...over the larger score line, with the rest as air BETWEEN them
    // the largest font px that keeps `text` inside innerW, capped at maxPx.
    // The headless DOM stub's measureText answers undefined (render is a
    // no-op there), so the metrics read is guarded — the fallback only ever
    // runs where nothing is painted.
    const fit = (text, maxPx) => {
      ctx.font = "700 100px " + FONT;
      const m = ctx.measureText(text);
      const w = (m && m.width) || 1;
      return Math.max(6, Math.min(Math.floor(maxPx), Math.floor(100 * innerW / w)));
    };
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const king = kingSeat(); // the derivation lives above, where the field's own
                             // crown reads the SAME one — see kingSeat
    const me = ownRow(); // -1 on a seatless screen: no row is this reader's
    boardRows.length = 0; // re-recorded below, in the order the rows are drawn
    ranked.forEach((r, i) => {
      const top = pad + i * cellH;
      const alive = seatAlive(r.s);
      boardRows.push({ s: r.s, y0: top, y1: top + cellH });
      // the seat's own name if it has told anyone one, and the ordinary
      // Player-N string if it has not. The fallback is UNCHANGED on purpose:
      // it is what every default-state pixel leg in the browser suites was
      // captured against, and a nameless board must still draw exactly what it
      // drew before. Net mode reads the last `you`; local play reads the one
      // stored name, for seat 0, which is the only seat solo ever has.
      const named = window.Net && Net.seatName ? Net.seatName(r.s) : null;
      const name = named || "Player" + (r.s + 1);
      const score = boardScoreLine(r.S);
      // ...and while THIS client is renaming itself, its own name line is the
      // editor: the live buffer with a caret after it, in clay, so the row a
      // player is typing into is the one thing on the board that is not a
      // report. It replaces the name rather than sitting beside it, because the
      // row has no width to spare — fit() is already squeezing to innerW.
      const mine = r.s === me;
      // the air band, reserved on EVERY row — see the "you" comment below for
      // why a row that draws no marker still has to leave the gap
      const air = cellH - nameH - scoreH;
      const edit = mine && window.Net && Net.nameEdit ? Net.nameEdit() : null;
      const line = edit === null ? name : edit + "_";
      ctx.font = "700 " + fit(line, nameH) + "px " + FONT;
      // the LOCAL seat is the bright one — a client granted seat 1 must see
      // its own row highlighted, exactly as the HUD reads its own seat (phase
      // 09 left this hardcoded to seat 0; phase 14 fixed it while repainting
      // the row). A seatless screen brightens NOTHING: every row on it is
      // somebody else's, and the bright fill is this board's oldest claim about
      // which one is yours.
      ctx.fillStyle = edit !== null ? C.clay
        : !alive ? C.dim : mine ? C.bright : "#9aa3b2";
      ctx.fillText(line, B.w / 2, top + nameH / 2);
      // "you" — the row's answer to the one question a brighter fill was being
      // asked to carry alone. It sits in the air band BETWEEN the name line and
      // the score line (the 0.14 of each cell neither text line spends), so it
      // reads as a caption on the NAME above it and not on the number below:
      // drawn under the score, the owner read it as labelling the score.
      // The band is reserved on every row, not only on this one, BECAUSE the
      // marker is drawn on one row only. Reserve it under `mine` alone and the
      // local row's score would drop by that band while the others held, and
      // the column of numbers would go ragged. Here every score moves down
      // together and only the local row fills the gap. The fit() caps and both
      // rect widths are untouched. BRIGHT, the same channel the local row's
      // name already uses: clay is the crown's, and the crown says who leads,
      // which is a different question.
      if (mine) {
        ctx.font = "700 " + Math.max(6, Math.min(9, Math.floor(air * 0.55))) + "px " + FONT;
        ctx.fillStyle = C.bright;
        ctx.fillText("you", B.w / 2, top + nameH + air * 0.5);
      }
      ctx.font = "700 " + fit(score, scoreH) + "px " + FONT;
      ctx.fillStyle = alive ? C.clay : C.dim;
      ctx.fillText(score, B.w / 2, top + nameH + air + scoreH / 2);
      // the crown: a small five-point chevron over the name line, centred on
      // the row and drawn inside the row's own band, so the two text fits
      // above are untouched and no geometry moves. Clay, always — the crown
      // says WHO LEADS and never whether that seat is alive, which is the
      // colour channel's job alone.
      if (r.s === king) {
        // Sized to the AIR the row actually has, not to the panel width alone.
        // The first draft took a half-width off innerW and a height off that,
        // and at 3 and 4 seats the result stood clear ABOVE the row's own top
        // edge (into the panel's padding) — harmless, but it made the comment
        // below a lie. The height is capped at the band between the row top
        // and the crown's baseline, and the half-width follows it, so the
        // shape is preserved and the whole marker stays inside the row.
        const cyOff = nameH * 0.18;                            // the baseline, in the row's air
        const cy = top + cyOff;
        const ch = Math.min(Math.max(7, Math.min(18, innerW * 0.09)) * 0.62, cyOff * 0.9);
        const cw = ch / 0.62;                                  // the same chevron, scaled whole
        ctx.beginPath();
        ctx.moveTo(B.w / 2 - cw, cy);
        ctx.lineTo(B.w / 2 - cw * 0.5, cy - ch);
        ctx.lineTo(B.w / 2, cy - ch * 0.25);
        ctx.lineTo(B.w / 2 + cw * 0.5, cy - ch);
        ctx.lineTo(B.w / 2 + cw, cy);
        ctx.closePath();
        ctx.fillStyle = C.clay;
        ctx.fill();
      }
    });
    ctx.restore(); // puts textAlign and textBaseline back with the rest
  }

  // ...and the board's ONE click target: this client's own row opens the name
  // editor on it. The board had no targets at all — game.js routed its bar's
  // presses here and dropped them on the floor — and this is the rename the
  // owner asked for, reachable MID-MATCH and in the default aim mode, because
  // a gutter panel is hit-tested through the drawn cursor rather than through
  // a DOM node the pointer lock has taken away.
  //   Only this client's own row. Another seat's row is a report, not a
  // control — and a SEATLESS client owns none of the rows it can see. It is not
  // filtered off this board (boardRanking filters absent SEATS, not readers);
  // it simply has no row of its own, so ownRow() answers -1 and every press
  // here misses. That screen renames from the claim card instead.
  function boardClick(x, y) {
    if (!G.running) return false; // a paused board is a picture; the press that
                                  // lands on it is the one that resumes
    if (x < 0 || x > BOARDUI.w) return false;
    const me = ownRow();
    if (me < 0) return false; // seatless: the rename ask has to be about YOUR
                              // seat, and this reader holds none
    const row = boardRows.find((r) => r.s === me && y >= r.y0 && y < r.y1);
    if (!row) return false;
    if (window.Net && Net.openNameEdit) Net.openNameEdit();
    return true; // the RECT was hit, which is a different question from whether
                 // the editor changed state — see nameCardClick's own block
  }

  // The claim card's name box, and the hit test that inverts it. The width is
  // the deleted DOM input's own 150 px, kept to the pixel so the box lands
  // where a returning player's hand already goes.
  const NAMEBOX = { w: 150, h: 17 };
  function drawNameBox(cx, cy) {
    const edit = window.Net && Net.nameEdit ? Net.nameEdit() : null;
    const own = window.Net && Net.ownName ? Net.ownName() : null;
    // an OPEN editor draws its buffer with a caret, even when the buffer is
    // empty — that is a player clearing a name, and falling back to the
    // accepted one there would look like the keystrokes were refused
    const label = edit !== null ? edit + "_" : own || "click to set your name";
    const x0 = cx - NAMEBOX.w / 2;
    const y0 = cy - NAMEBOX.h / 2;
    ctx.fillStyle = "rgba(14, 17, 25, 0.9)";
    ctx.fillRect(x0, y0, NAMEBOX.w, NAMEBOX.h);
    ctx.strokeStyle = edit !== null ? C.clay : C.wall; // the border is the only
    ctx.lineWidth = 1;                                 // "you are typing" cue a
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, NAMEBOX.w - 1, NAMEBOX.h - 1); // box this
    ctx.font = "400 10px " + FONT;                     // small can carry
    ctx.fillStyle = edit !== null || own ? C.bright : C.dim;
    ctx.fillText(label, cx, cy + 3.5); // alphabetic baseline, like the card lines
    nameCardRect = { x0, y0, x1: x0 + NAMEBOX.w, y1: y0 + NAMEBOX.h };
  }
  // FIELD coordinates, the space the card is drawn in. Answers false whenever
  // no box was drawn on the last frame, which is every screen that is not the
  // claim or seat-released card.
  function nameCardClick(x, y) {
    // the SHIP STRIP is tested first, and through this same entry point rather
    // than a second route in js/game.js, because the two controls are one
    // affordance: whatever gates the name box's press has to gate the hull's,
    // and a second call site is a second thing to keep in step with the router's
    // ordering — which is what put the old DOM box under the fire path.
    if (skinStripClick(x, y)) return true;
    const r = nameCardRect;
    if (!r || x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1) return false;
    // HANDLED means the press landed on the rect, NOT that the editor changed
    // state. openNameEdit is deliberately a no-op on an already-open editor —
    // a second click on the box a player is typing into is not a reason to
    // throw away what was typed — and forwarding that false told game.js the
    // press was unhandled, which sent it on to the commit-and-close it uses for
    // a press ANYWHERE ELSE. Clicking the box twice therefore committed a
    // half-typed name and handed the keyboard back to the ship, which is the
    // exact class of defect this editor exists to end.
    if (window.Net && Net.openNameEdit) Net.openNameEdit();
    return true;
  }

  // ---- the SHIP STRIP — the identity affordance's other half ----------------
  // D2's ruling is that name and ship are ONE identity, chosen in ONE moment,
  // on ONE affordance and travelling on ONE channel. So the strip is drawn with
  // the name box and hit-tested through the same drawn cursor, and js/net.js
  // sends the pair on one `ui: name` message. Two pilots may choose the same
  // hull: that is legal by ruling and there is no collision rule here to look
  // for.
  //
  // Cosmetic through this milestone. Nothing under this comment reads or writes
  // E, the seats or any hashed field — the id lives on the PLAYER record on the
  // server socket, rides the low-frequency roster, and is absent from the 60 Hz
  // snapshot. R4 is where drawHull starts keying a descriptor table off it.
  //
  // The glyphs are drawn HERE and not through drawHull, and they stay that way:
  // a 30x20 strip glyph and a 14 px field hull are genuinely DIFFERENT DATA,
  // not one shape written twice. The strip glyph points RIGHT because a card is
  // read as a catalogue of ships and a catalogue draws them facing — and since
  // the ruled roster the field agrees: every hull row sits nose on +x, and the
  // OWN ship's plate now rotates that nose onto the aim (see drawShip). So the
  // four glyphs are REDRAWN as the field's own shapes — arrowhead, triangle,
  // diamond, pentagon, all nose right — and the card and the field stop
  // disagreeing about what a hull looks like. Calling drawHull from
  // here would still be wrong: it would paint field ink into a card at card
  // scale.
  //   What is NOT duplicated is the part that could drift: the id set and the
  // labels are read straight off js/game.js's HULLS, the one place a hull is
  // declared. This table adds a glyph per id and nothing else — every glyph is
  // a point list since D42 (PORT-L) gave hull 0 the demo's arrowhead, so the
  // drawer's `sides: 0` arc branch below is now the SCHEMA'S documented
  // fallback and nothing reaches it; the glyphs here are PRE-DIVIDED to
  // circumradius 1 because drawSkinStrip multiplies by SKINCELL.r and no
  // normalisation runs on this table — so a hull can never be offered here
  // under a name or an id
  // the field does not know. (Classic scripts share one global lexical
  // environment and js/game.js's `<script>` tag precedes this file's — so HULLS is a
  // plain read here, as C and SHIP_R already are.)
  const SKINGLYPHS = [
    { id: 0, pts: [[1, 0], [-0.470588, -0.529412], [-0.176471, -0.176471], [-0.764706, 0], [-0.176471, 0.176471], [-0.470588, 0.529412]] },
    { id: 1, pts: [[1, 0], [-0.5, 0.866], [-0.5, -0.866]] },
    { id: 2, pts: [[1, 0], [0, 1], [-1, 0], [0, -1]] },
    { id: 3, pts: [[1, 0], [0.309, 0.951], [-0.809, 0.588], [-0.809, -0.588], [0.309, -0.951]] },
  ];
  const SKINS = HULLS.map((h) => {
    const g = SKINGLYPHS.find((gl) => gl.id === h.id) || SKINGLYPHS[0];
    return { id: h.id, label: h.label, pts: g.pts, sides: g.sides };
  });
  const SKINCELL = { w: 30, h: 20, gap: 4, r: 8 };
  // The strip's own width, derived rather than written down twice — a cell count
  // that disagreed with a hardcoded width would put the hit test beside the draw.
  const skinStripW = () => SKINS.length * SKINCELL.w + (SKINS.length - 1) * SKINCELL.gap;

  function drawSkinStrip(cx, cy) {
    // the LOCAL client's hull. A build with no Net at all (a bare page) still
    // draws the strip on the default, so the affordance is never a blank row.
    const own = window.Net && Net.ownSkin ? Net.ownSkin() : 0;
    const total = skinStripW();
    let x = cx - total / 2;
    skinCellRects = [];
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    for (const sk of SKINS) {
      const x0 = x;
      const y0 = cy - SKINCELL.h / 2;
      const on = sk.id === own;
      ctx.fillStyle = "rgba(14, 17, 25, 0.9)";
      ctx.fillRect(x0, y0, SKINCELL.w, SKINCELL.h);
      // CLAY for the chosen one, wall for the rest — the same two-channel cue
      // the name box's border already uses, so the card speaks one language
      ctx.strokeStyle = on ? C.clay : C.wall;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, SKINCELL.w - 1, SKINCELL.h - 1);
      ctx.fillStyle = on ? C.bright : C.dim;
      ctx.beginPath();
      if (sk.pts) {
        sk.pts.forEach((pt, i) => {
          const px = x0 + SKINCELL.w / 2 + pt[0] * SKINCELL.r;
          const py = cy + pt[1] * SKINCELL.r;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.closePath();
      } else {
        // NO GLYPH ROW REACHES THIS SINCE D42 — every row carries `pts` now.
        // It stays as the schema's declared fallback: a row added with `sides`
        // and no point list draws a disc at the same reach the point glyphs
        // use, instead of an empty cell under a live label.
        ctx.arc(x0 + SKINCELL.w / 2, cy, SKINCELL.r, 0, Math.PI * 2);
      }
      ctx.fill();
      skinCellRects.push({ id: sk.id, x0, y0, x1: x0 + SKINCELL.w, y1: y0 + SKINCELL.h });
      x += SKINCELL.w + SKINCELL.gap;
    }
    // the chosen hull's NAME, under the strip — a silhouette 20 px wide cannot
    // carry one, and a player who cannot say what they picked has not been told
    const picked = SKINS.find((sk) => sk.id === own) || SKINS[0];
    ctx.font = "400 9px " + FONT;
    ctx.fillStyle = C.dim;
    ctx.fillText("ship · " + picked.label, cx, cy + SKINCELL.h / 2 + 10);
    ctx.restore();
  }

  // FIELD coordinates, exactly as nameCardClick's are, and false whenever no
  // strip was drawn on the last frame. Answers HANDLED on any press inside a
  // cell, including a re-press of the hull already flying: reporting that one
  // unhandled would send it on to js/game.js's commit-and-close and end an edit
  // the player is still typing into — the same defect nameCardClick's own block
  // records, one affordance over.
  function skinStripClick(x, y) {
    const hit = skinCellRects.find((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
    if (!hit) return false;
    if (window.Net && Net.pickSkin) Net.pickSkin(hit.id);
    return true;
  }

  // ---- the PRE-START identity block ---------------------------------------
  // The same two controls, on the one screen that is not a card: js/game.js's
  // first-run screen. encDrawHud below CANNOT reach it — that function returns
  // at E.state === "idle", and the pre-start screen is exactly that state — so
  // the block needs an entry point of its own, and this is it. ONE call that
  // DRAWS AND RECORDS, because a hit test may never outlive the rect it
  // inverts, and two calls would be two chances to draw one without the other.
  //
  // The CLEAR half of that invariant is encDrawHud's, not this function's, and
  // the ORDER is what makes that safe: js/game.js's render() calls drawHud
  // FIRST — which nulls nameCardRect and skinCellRects at its top — and reaches
  // its pre-start branch after. A frame that draws no block therefore leaves no
  // rect behind, and a frame that draws one records exactly what it drew. This
  // call must stay BELOW drawHud in that function: moved above it, drawHud
  // would clear the rects of a block still on the screen.
  //
  // It takes TWO y values rather than one anchor because the block hangs under
  // whichever explanatory block the screen above it drew, and the card and the
  // text stand-in end at different heights. js/game.js owns that choice because
  // js/game.js owns both screens.
  //
  // Self-contained in ctx state, unlike the card chain's two calls: the chain
  // sets textAlign once for every branch under it, and this caller has no such
  // branch to inherit from. drawNameBox does not set its own alignment, so the
  // save/restore here is what stops a left-aligned box on the first-run screen.
  function drawIdentity(nameY, stripY) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    drawNameBox(FW / 2, nameY);
    ctx.restore();
    drawSkinStrip(FW / 2, stripY); // ...which saves and restores for itself
  }

  // the two logical spaces game.js fits into the gutters — the ONE shape
  // its panelPlace and pointer routing read, so a layout change here moves
  // the fit and the hit test together
  function panelSpec() {
    const L = shopLayout();
    return { shop: { w: L.w, h: L.h }, board: { w: BOARDUI.w, h: BOARDUI.h } };
  }

  function encDrawHud(_c, view) {
    // the card's name box is re-recorded by the branch that draws it, and by
    // nothing else — a hit test may never outlive the rect it inverts, and the
    // idle return below is a screen with no card on it
    nameCardRect = null;
    skinCellRects = [];  // ...and the ship strip's cells with it, same rule: a
                         // hit test may never outlive the rects it inverts
    if (E.state === "idle") return;
    ctx.save();
    const wt = E.waveTick;
    // the off-screen tracker pass, back at its own slot (D58). It paints FIRST
    // in this function so the status column below draws over it, and it takes
    // the same presentation view every other reader here would.
    drawEdgeArrows(view);
    // --- viewport HUD, top left ---
    // (No suppression gate any more. This column used to stand down whenever a
    // row's big opaque explainer bitmap was up, because that art's rect sliced
    // it in half; the hovered row's field panel that replaced it takes the
    // channel to the RIGHT of this column instead — see shopHoverBand — so the
    // wave, the hull, the pool and the wallet stay readable while shopping,
    // which is exactly when the player is reading them.)
    ctx.textAlign = "left";
    ctx.font = "700 10px " + FONT;
    ctx.fillStyle = C.bright;
    // the CLEAR header holds through the cleared beat, so it reads
    // continuous with the banner the player just watched fade
    ctx.fillText(waveHeader(), 8, 16); // ...and statusStackRight() measures THIS
    const LS = localSeatRec(); // the LOCAL seat — every readout in this column is ITS state
    // D48 (PORT-L) — THE PIPS RETIRE FOR A BAR AND A NUMBER, which is what
    // demo-v2 draws (sim.js:3265-3273) and what V4 kept. A pip row cannot show
    // a fractional hull at all, and the successor plane deals fractions: a
    // kernel blow costs 0.06-0.78 of a hull. The bar shows it; the number says
    // it out loud.
    const barW = hullBarW(LS);
    const hullFrac = LS.hullMax > 0 ? Math.max(0, Math.min(1, LS.hull / LS.hullMax)) : 0;
    ctx.strokeStyle = C.dim;
    ctx.lineWidth = 1;
    ctx.strokeRect(8.5, 21.5, barW, 4);
    // the DEMO's own rule: red under 28 %, and DEMO.red is the demo table's
    // byte — PALETTE.flat carries no red, and a literal here is the one thing
    // js/palette.js exists to prevent
    ctx.fillStyle = hullFrac < 0.28 ? DEMO.red : C.clay;
    ctx.fillRect(9, 22, Math.max(1, (barW - 1) * hullFrac), 3);
    // the ENERGY bar, under the hull pips and on the same left margin and pip
    // width, so the two columns read as one instrument. The pool comes off the
    // PLAYER STRUCT, never off a fresh energyCap() call: on a net client the
    // mods are never synced and only the mirror the wire hands down is right.
    // presentedPool: the struct's wire mirror everywhere, the PREDICTED pool
    // for the local seat in net mode — the bar answers the stick, not the RTT
    const EB = presentedPool(localSeat());
    const ebW = barW; // THE SAME WIDTH AS THE HULL BAR, so the two align. It was
                      // the pip row's own span (hullMax * 10 - 3) and it takes
                      // the same floor now, through the same one derivation.
    const ebF = EB.enMax > 0 ? Math.max(0, Math.min(1, EB.en / EB.enMax)) : 0;
    ctx.strokeStyle = C.dim;
    ctx.lineWidth = 1;
    ctx.strokeRect(8.5, 31.5, ebW, 4);
    if (ebF > 0) {
      // the bar is BRIGHT exactly when a fresh click right now would arm, and
      // DIM when it would be refused — asked of THE arm rule itself
      // (js/game.js's Flight.cometOn), the same function the sim's energySlice
      // and the predictor's press-edge cue call, so "why won't it turn on" can
      // never be answered one way by the screen and another by the click. The
      // `press` argument is `true` because that is the question: not whether
      // the seat is arming, but whether it COULD. A RUNNING comet is exempt
      // (it holds to dry on the level, so a low pool is not a lockout), which
      // is what the running argument carries; a WINDUP over a locked-out pool
      // stays DIM, because the seat cannot arm and a bar that went full-bright
      // exactly then was lying. A button still held after the pool refills
      // gets no further answer BY DESIGN — the owner's rule is that a held
      // button is not an ask, the next click is, and the refusal cue answers
      // that click at the click. The phase comes off the ONE presentation
      // owner the halo, the light layer and the wake read (cometView), and the
      // pool off EB, the presented read this row already made.
      ctx.globalAlpha = Flight.cometOn(cometView(localSeat(), EB).phase === CP_LIVE,
        EB.en, EB.enMax, true) ? 1 : 0.4;
      ctx.fillStyle = C.clay;
      ctx.fillRect(9, 32, Math.max(1, (ebW - 1) * ebF), 3);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = C.dim; // the floor itself, one px wide
    ctx.fillRect(9 + (ebW - 1) * ENARM, 32, 1, 3);
    // THE TWO NUMBERS, BESIDE THEIR BARS and never under them: y 30 and y 57
    // are pinned baselines in two suites each, and the free band between the
    // header's ink and XP's is 20.75 px — a stacked row would land on one of
    // them. The hull number is on a 100 scale and is DISPLAY ONLY.
    ctx.fillStyle = C.dim;
    ctx.font = "400 8px " + FONT;
    ctx.fillText("HULL " + hullShown(LS) + " / 100", 8 + barW + 5, 26);
    ctx.fillText("ENERGY " + Math.floor(EB.en) + " / " + Math.round(EB.enMax), 8 + barW + 5, 36);
    ctx.fillStyle = C.dim; // the wallet — a flat count; an uncapped wallet has no denominator to bar
    ctx.font = "400 9px " + FONT;
    // the two readouts sit 6 px lower than they used to: the ENERGY bar took
    // the band directly under the pips, which is the only place it can read as
    // part of the same instrument
    ctx.fillText("XP " + LS.xp, 8, 46);
    ctx.fillText("FOES " + foeCount(), 8, 57);
    // (the THRUST LOCKED — SHOP notice died with the lock: key thrust is
    // stock now, so the line it defended against cannot occur)
    // (the spawn-warning markers are RETIRED with `E.groups` — commit D2. The
    // successor plane announces an arrival with a PORTAL, drawn by
    // js/demo-render.js in the world pass, which is a stronger cue than a
    // screen-space chevron and is already on the field.)
    if (E.state === "warning") {
      ctx.textAlign = "center";
      ctx.font = "700 11px " + FONT;
      ctx.fillStyle = C.clay;
      ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(wt * 0.12));
      ctx.fillText("HOSTILES INBOUND", FW / 2, 30);
      ctx.globalAlpha = 1;
    }
    // The break countdown takes the same slot — "warning" and "cleared" are
    // exclusive states, so the two lines can never print together, and
    // HOVERUI.top = 40 already clears this baseline by construction. Outside
    // the state-overlay chain below on purpose: the countdown is a fact about
    // the room, so it neither hides a seat's card nor is hidden by one, and a
    // spectator sees it too. The wt >= E.clearTick term kills the one net
    // straddle frame per deal where a lerped waveTick would read over the hold.
    // ...and the numeral covers the WHOLE break exactly (S4-CX-3, the fix
    // round). `wt - E.clearTick` is the break's own 0-based tick index, so this
    // condition draws on indices 0..clearHold-1 — 480 frames. The kernel used
    // to hold for 481 ticks (float residue on `gateTimer`; see its terminal
    // condition), which left the last one BLANK. The two are equal now, and
    // `test/tools/demo-director.mjs` LEG 5 counts both sides.
    if (E.state === "cleared" && wt >= E.clearTick && wt - E.clearTick < ECFG.clearHold) {
      const left = ECFG.clearHold - (wt - E.clearTick);
      ctx.textAlign = "center";
      ctx.font = "700 11px " + FONT;
      ctx.fillStyle = left <= 180 ? C.clay : C.dim; // the last three seconds warm up
      ctx.fillText("NEXT WAVE IN " + Math.ceil(left / 60), FW / 2, 30);
    }
    // ---- D21(a)'s STALL SURFACE (PORT-S S4, commit E) ---------------------
    // *"a room that cannot clear must SURFACE, never silently auto-advance, or
    // the clock returns by the back door."* Commit E throws the clock out, so
    // this is the line that keeps the ruling honest — and it lands in the SAME
    // commit as the gate deliberately, because a gate without its surface ships
    // a silent deadlock for the length of a commit.
    //
    // IT IS THE THIRD TENANT OF ONE SLOT, and the three are mutually exclusive
    // by state: HOSTILES INBOUND while `warning`, NEXT WAVE IN n while
    // `cleared`, and this while `active`. A room is `active` exactly when a
    // live body is on the field, which is exactly when a setpiece is unfinished.
    //
    // THE SURFACE IS ALL THIS ROUND BUILDS. What a stuck room DOES next — offer
    // an advance, escalate, time out, or nothing — is the owner's and is NOT
    // built. See `ECFG.stallTicks`.
    //
    // NO WIRE FIELD. The count comes from the bodies a client already has and
    // the clock from `E.waveTick`, which already crosses; a spectator and a
    // pilot compute the same line from the same snapshot. `hud.state` grows its
    // vocabulary at R7, not here.
    // FOES > 0 IS PART OF THE CONDITION, not an optimisation. `active` MEANS a
    // live body is on the field — `applyKernelHud` writes it from the same
    // census this line reads — so the two agree in play and the guard costs
    // nothing there. What it buys is the OTHER caller: a check (and the pause
    // screen) can stage `E.state` directly with no host installed, where the
    // census answers 0 honestly and "0 HOSTILES REMAIN" is a sentence about
    // nothing. Measured: without it, `tests/wave1-checks.js`'s shop-panel
    // collision leg read this line's centred ink as part of the STATUS STACK
    // and reported a 228 px overlap with the hovered panel.
    if (E.state === "active" && foeCount() > 0) {
      const foes = foeCount();
      // ---- THE DRAW ONLY READS THE DETECTOR (the HOLD round, fix 12) -----
      // The advance moved into `encStep` — see `advanceStall`. This block draws
      // the surfaced state and decides nothing: `stallActive` is a fact the SIM
      // established on this tick, so a spectator, a paused screen and a
      // headless server all agree about whether the room is stuck.
      const stalled = stallActive;
      const source = stalled ? stallSourceLabel() : "";
      ctx.textAlign = "center";
      ctx.font = "700 11px " + FONT;
      ctx.fillStyle = stalled ? C.clay : C.dim;
      // A stalled room with no SOURCE alive is an ordinary body nobody can
      // reach; there is no type to name, so the count stands and the colour
      // carries the alarm.
      ctx.fillText(source ? source + " STILL HOLDS THE ROOM"
                          : foes + (foes === 1 ? " HOSTILE REMAINS" : " HOSTILES REMAIN"),
                   FW / 2, 30);
    }
    // --- hit feedback: a border flash while the hit registers ---
    if (LS.hitFlash > 0) {
      ctx.strokeStyle = C.clay;
      ctx.globalAlpha = (LS.hitFlash / 20) * 0.6;
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, FW - 6, FH - 6);
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
    }
    // --- state overlays ---
    // wt >= E.clearTick: the countdown's straddle guard, for the same frames —
    // at a net deal the lerped waveTick walks toward 0 while state/clearTick
    // still ride the old snapshot, so wt - clearTick runs strongly negative
    // and a long-faded card would redraw at full alpha (and, as the head of
    // this chain, hide SHIP DOWN under it) for those frames.
    if (E.state === "cleared" && wt >= E.clearTick && wt - E.clearTick < bannerHold()) {
      const left = bannerHold() - (wt - E.clearTick);
      ctx.globalAlpha = Math.min(1, left / 60); // the banner fades out
      ctx.textAlign = "center";
      ctx.font = "700 15px " + FONT;
      ctx.fillStyle = C.bright;
      ctx.fillText("WAVE " + E.wave + " CLEAR", FW / 2, FH / 2 - 8);
      ctx.font = "400 10px " + FONT;
      ctx.fillStyle = C.dim;
      ctx.fillText("take a breath · the shop is open", FW / 2, FH / 2 + 12); // the
      // card is the celebration and retires at bannerHold's 210, freeing these
      // two slots for SHIP DOWN and the rest of the chain; the break itself
      // runs to ECFG.clearHold, and the countdown at the top of the field
      // carries the rest of the story
      ctx.globalAlpha = 1;
    } else if (seatless() || releasedHere(LS)) {
      // NO SEAT OF ITS OWN — and therefore NO CARD BELOW THIS POINT. Every
      // branch under here reads LS, and LS is localSeatRec(), which falls back
      // to seat 0 so the camera and the HUD column always have a record to
      // present. That fallback is right for a VIEW — a spectator has to watch
      // something — and wrong for a CARD, because a card is a claim about the
      // reader's own seat: drawn off seat 0 it tells a stranger their ship is
      // down, counts a respawn they cannot take, and offers an R that
      // routeRestart drops on the floor for want of a seat to restart with.
      //   The guard is a SCOPE, not an ordering, and that is the whole point.
      // This exact class was fixed twice one branch at a time — releasedHere
      // routed the release card around the fold, left the fold standing, and
      // the class came back at SHIP DOWN one branch further down. seatless()
      // short-circuits the entire chain instead, so a card added below it
      // inherits the guard whether or not its author knew it was here.
      //   Local play never reaches this by the seatless half: there is no
      // server to take a seat away and seat 0 IS this player's, so the record
      // test is the honest one and the branch is entered exactly as before.
      ctx.textAlign = "center";
      if (releasedHere(LS)) {
        // a seat was taken FROM THIS SCREEN. Different headline from SHIP DOWN,
        // because the ship is not merely down any more — it is off the field,
        // off the board and the seat is open. The card is the only thing left
        // on screen that belongs to this player, and it is what makes the
        // reclaim click discoverable at all; without it the state reads as a bug.
        ctx.font = "700 15px " + FONT;
        ctx.fillStyle = C.clay;
        ctx.fillText("SEAT RELEASED", FW / 2, FH / 2 - 8);
        ctx.font = "400 10px " + FONT;
        ctx.fillStyle = C.dim;
        // the promise, or the correction to it — the card is the same card
        // either way, because the player still has nothing else on screen and
        // the click is still the only thing that asks
        ctx.fillText(claimRefusedHere() ? refusedCardLine() : absentCardLine(), FW / 2, FH / 2 + 12);
      } else {
        // ...and the other seatless screen: never seated, or seated once and
        // dropped — a socket close forfeits the seat AND the release latch
        // (js/net.js), so a pilot whose parked seat outlived its connection
        // rejoins as a stranger and used to land on a live field with no ship,
        // no row, no card and no prompt. It is a spectator now, and told so.
        // One dim line, no headline: see spectatorCardLine.
        ctx.font = "400 10px " + FONT;
        ctx.fillStyle = C.dim;
        ctx.fillText(claimRefusedHere() ? spectatorRefusedLine() : spectatorCardLine(),
                     FW / 2, FH / 2 + 12);
      }
      // ...and the NAME BOX, on both halves of this card. This is the screen a
      // player reaches before it OWNS a board row to rename from: a seatless
      // client can see the whole board, it simply holds none of those rows (see
      // ownRow), so the card is the one place a first name can be asked for —
      // and the only moment on this screen when the keyboard is not flying a
      // ship. It sits where the DOM input it
      // replaces sat, and it is a CANVAS rect: game.js hit-tests it through the
      // drawn cursor, the only pointer a held lock leaves anybody.
      drawNameBox(FW / 2, FH / 2 + 34);
      ctx.font = "400 10px " + FONT;
      ctx.fillStyle = C.dim;
      ctx.fillText("click the box to type a name — later, click your own row on the board",
                   FW / 2, FH / 2 + 56);
    } else if (LS && LS.hull <= 0 && LS.respawnT > 0) {
      // the LOCAL seat is down but coming back — the match runs on around
      // the parked hull, so this is a countdown card, not a freeze screen
      ctx.textAlign = "center";
      ctx.font = "700 15px " + FONT;
      ctx.fillStyle = C.clay;
      ctx.fillText("SHIP DOWN", FW / 2, FH / 2 - 8);
      ctx.font = "400 10px " + FONT;
      ctx.fillStyle = C.dim;
      // NEUTRAL on the score, still — every death costs the same run now, so
      // the old reason (the client cannot tell WHY a seat died) is spent, but
      // the call stands: a downed player reads the countdown, not the bill.
      // See downCardLine's own block.
      ctx.fillText(downCardLine(LS), FW / 2, FH / 2 + 12);
    } else if (LS && LS.hull <= 0 && LS.claimT > 0) {
      // the countdown has run out and the seat is HELD for its player: same
      // card, same weight, a different second line. It is not a freeze screen
      // either — the match runs on, and the card sits over a live field
      ctx.textAlign = "center";
      ctx.font = "700 15px " + FONT;
      ctx.fillStyle = C.clay;
      ctx.fillText("SHIP DOWN", FW / 2, FH / 2 - 8);
      ctx.font = "400 10px " + FONT;
      ctx.fillStyle = C.dim;
      ctx.fillText(claimCardLine(), FW / 2, FH / 2 + 12);
    } else if (E.state === "dead") {
      // the MATCH is over, which is a global fact — but the card is not a
      // global statement: it offers a key, and js/net.js's routeRestart sends
      // nothing at all without a seat. So this sits under the seatless guard
      // with the rest, and a screen that holds no seat is told it is spectating
      // instead of offered an R the server will never hear. Local play is never
      // seatless, so the death screen it has always drawn is untouched.
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
    // --- the identity strip, over the card chain that may have drawn a box ---
    // It follows the NAME: on the claim card, which is where a pilot with no
    // board row of its own is asked who it is, and on any screen where the
    // editor is OPEN, which is how a seated pilot renaming from its board row
    // reaches the hull in the same moment. One position, above the chain's
    // lowest line (FH/2 + 56) and below the box (FH/2 + 34), so no card branch
    // has to know the strip is here.
    const idOpen = window.Net && Net.nameEdit ? Net.nameEdit() !== null : false;
    if (nameCardRect || idOpen) drawSkinStrip(FW / 2, FH / 2 + 74);
    // --- the hovered row's own panel, over everything it explains ---
    // Last, so it paints over the spawn markers and the warning line if a wave
    // lands while the player is shopping — but never over the status stack or
    // the corner map, which it clears by construction rather than by z-order.
    drawShopHoverPanel();
    ctx.restore();
  }

  // ---- input — the overlay keys ------------------------------------------
  // The shop binds NO keys at all: it is a pointer surface, and game.js hands
  // it every click on the field while it is open (see shopClick). The digits
  // and Enter that used to buy and continue are gone on purpose — one input
  // scheme per screen, and a key that silently still worked would be the only
  // thing on the screen with no picture. The death screen's R is what is left.
  document.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    // the name editor owns the keyboard while it is open — an R typed into
    // "Ranger" must not restart the match. js/net.js's own capture-phase
    // listener stops the bubble on every key it takes, and this is the second
    // half of that guard, for a key it declines. Both halves are wanted: the
    // deleted DOM field's leak leg only reddened when BOTH of its guards were
    // gone, and that redundancy is what has survived every refactor since.
    if (window.Net && Net.typing && Net.typing()) return;
    if (e.code === "KeyR" && E.state === "dead") {
      e.preventDefault();
      // NET MODE: the restart is the server's to perform — send it upstream
      // and let the snapshot stream carry the new run back. False when net
      // mode is off, so local play keeps the direct restart below.
      if (window.Net && Net.restart && Net.restart()) return;
      restart();
      // R works on the paused death screen too, where the loop is stopped —
      // repaint so the overlay never shows a stale instruction
      if (!G.running) render();
    }
  });

  // ---- enemy tuning surface — one row per slider --------------------------
  // get/set are closures over ECFG fields (set writes the BASELINE — statsFor's
  // wave scaling still applies on top). After any set, the panel calls
  // refresh() so the live wave's bodies retune this tick. Consumes no rand():
  // the seeded schedule is identical at every slider position.
  // EXCLUDED on purpose: `seed` (identity of the deal), the `orb` block,
  // spawnGap/minPlayerDist/clearHold/enemy.jitter (placement and pacing, not
  // combat feel), every `r` field (hitbox identity) and every `dmg` field
  // except contact.dmgToPlayer (damage integers are design decisions, not dials).
  // Secondary knobs (per-kind steer/band/sepR beyond dart+shard, husk.push,
  // missile hp/trail, orbDrop) stay out too — the rows below are the feel set.
  // statsFor is a CONSTANT table now — no wave curve and no cadence floor
  // stands between a slider's baseline and the resolved stat: the value a
  // row writes is the value every wave deals.
  // ---- THE ENEMY TUNING SURFACE IS RETIRED (S3b lane 3, commit D4) --------
  // `TUNING` was 203 lines of slider rows over `ECFG`'s nine archetype blocks —
  // the dart's hull, the lance's telegraph, the harrier's seeker turn, the
  // anvil's arc, the husk's split. Every row's `get`/`set` closed over a field
  // that no longer exists, so the surface went with the table it drove.
  //
  // THE PANEL IT FED goes with it: `js/game.js`'s enemies tab is generated at
  // first open from `Encounter.tuning`, and a generator with no rows to
  // generate is a tab with nothing in it. The successor plane's own tuning is
  // js/demo-kernel.js's STATS, and giving it a live slider surface is S4's
  // question rather than a table this lane can transcribe.

  window.Encounter = { step: encStep, draw: encDraw, drawHud: encDrawHud, frozen, mods, reset: restart,
    // D37's encounters-per-reward-wave dial, published for ONE caller: the
    // sim seam's `setPvpTune`, which the server's TUNABLES row reaches. It is
    // on window.Encounter rather than the `__test` seam because the dev tune
    // route is a shipped path, not an instrument — the same reason `addXp`
    // was published when the kernel's orb pickups started reaching it.
    setEncPerReward,
    // the FIRST-RUN identity block — the name box and the ship strip on the
    // screen the game starts on. Published beside drawHud because it is the
    // second draw entry point into this file, and for the same reason: the
    // rects it records are what nameCardClick below inverts.
    drawIdentity,
    // ...and the two DRAW CACHES it (and the card chain) record, read-only and
    // copied out. Published on mapState's footing rather than as a __test
    // seam, because the rects are the affordance's real geometry and a check
    // that restated the strip's cell width beside it would be a second layout
    // to keep in step. It is also how the "a hit test may never outlive the
    // rect it inverts" invariant becomes checkable at all: a frame that drew no
    // block answers a null box and no cells.
    identityRects: () => ({ name: nameCardRect ? { ...nameCardRect } : null,
                            cells: skinCellRects.map((r) => ({ ...r })) }),
    // WHO LEADS — published for the FIELD crown in js/game.js, which draws over
    // the leader's own ship and must never disagree with the board's crowned
    // row. The board reads the same call; there is one derivation and no copy.
    kingSeat,
    // ---- THE SEAM SCALE'S DENOMINATOR (PORT-S S5, commit A) ---------------
    // `ECFG.player.hull` is production's BASE hull, and js/encounter-host.js
    // divides every kernel-dealt amount by the kernel's own 100 and multiplies
    // by this. It is published rather than copied for the reason every number
    // in this program is published rather than copied: a host holding its own
    // `3` would be a second authority on the ship's hull, and an owner retune
    // of `ECFG.player.hull` would then move production and NOT move the scale.
    //
    // IT IS THE BASE, NOT `S.hullMax`. A MAX HULL purchase raises the seat's
    // own `hullMax` (`:3159`) and a death drops it back; a scale that read the
    // live number would make the same kernel round cost a different fraction
    // of the same pilot depending on what they had bought, which is a second
    // damage rule hiding inside a unit conversion.
    playerHullBase: () => ECFG.player.hull,
    // ---- THE ONE CREDIT SITE, NOW PUBLISHED (PORT-S S3b lane 2, commit D) --
    // `addXp(n, seat)` was reachable only through `window.__test.enc`, which was
    // right while its only outside callers were the suites. It has a real one
    // now: js/encounter-host.js routes the demo kernel's orb pickups into this
    // economy, and the kernel is a SIMULATION rather than a test — reaching
    // through a `__test` seam to move a wallet would put a shipped code path
    // through a door named for instruments.
    //
    // IT IS THE SAME FUNCTION, published, and that is the point: one credit
    // site moving the wallet, the scoreboard and the high-water mark together,
    // with `termsFor`, `boardRanking` and `kingSeat` deriving off it. A second
    // entry point for the kernel would be a second credit site.
    //
    // ADDITIVE AND BEHAVIOUR-FREE. Nothing in this file calls it differently and
    // no simulation state moves; tests/fixtures/golden.json is unmoved across
    // the commit that published it.
    addXp,
    // ---- THE ONE SHIP-DAMAGE SITE, NOW PUBLISHED (S3b lane 3, commit A) ---
    // `hitPlayer(seat, dmg, src)` was reachable from outside only through
    // `window.__test.enc.damagePlayer`, which was right while every outside
    // caller was a suite. It has a real one now, and for `addXp`'s exact
    // reason: js/encounter-host.js routes damage the demo kernel deals to a
    // POSE-DRIVEN seat back into this economy, and the kernel is a SIMULATION.
    // A shipped damage path through a door named for instruments would be the
    // wrong seam twice over — that door also STEPS (`drainStep()`), which no
    // caller inside a tick may do.
    //
    // IT IS THE SAME FUNCTION, published, and that is the whole point. One ship
    // damage site means one set of gates — the dead-seat refusal, D28's
    // source-scoped comet refusal, the i-frames — one matrix consultation and
    // one death toll, for every path that can hurt a pilot. A second entry
    // point for the kernel would be a second set of gates to keep in step.
    //
    // ADDITIVE AND BEHAVIOUR-FREE: nothing in this file calls it differently
    // and no simulation state moves.
    hitPlayer,
    // termsFor(seat) — the ONE upgrade-term derivation. game.js's sim reads
    // it here (fire cooldown, the per-seat vcap, the pool's cap/regen), and
    // the phase-11 predictor calls the SAME formula through termsFromOwned:
    // terms over a BARE rank vector (the ACKED wire ow), one source, no copy.
    termsFor, termsFromOwned, ownedFor,
    // blastRadius(seat) — published for fire(), which STAMPS it on the round at
    // spawn (standing rule 5). It was a __test read before R5 and is a live one
    // now, and there is still exactly one derivation: the capture reads the
    // same function blastAt falls back to when no round is behind the splash.
    blastRadius,
    // The simulation event stream — see the queue at the top of the file.
    // Drained once per step() by the presentation side; events() is the
    // readonly view of what this tick queued.
    events, drainEvents,
    // emit is published for the ONE crossing that runs the other way:
    // game.js owns the ship's own cues (fire, the wall thud, the wall tick)
    // and queues them here, defensively, exactly as it reads everything
    // else off this namespace.
    emit,
    // The RESTART discontinuity marker, published as its own call because
    // restart() must NOT emit it: restart() clears the event queue by design
    // (a stale cue may not sound over the new run's opening tick), and every
    // suite and every golden trace calls restart() at trace start — a marker
    // emitted there would land in the first drain of every committed fixture.
    // The AUTHORITY that ordered the cut emits it instead (server/server.js,
    // right after it restarts the sim), so the wire carries the marker on the
    // tick the sim actually took the cut and no fixture moves.
    markRestart: () => emit("restart"),
    // D38's build total (S4 fix 10) — published for `poseKernelSeats`, which is
    // the ONE pusher, and for the legs that assert the presence rule.
    presentPurchases,
    // Entity identity — the monotonic counter every constructor stamps from.
    // Published so game.js's bullets draw from the SAME id space as the
    // bodies: a replication layer keys by id alone.
    nextId,
    // the phase-15 fire-time rebate — game.js's fire() calls it immediately
    // after the bullet push when the drained frame's latched Δ is positive.
    // Published here (not __test) because the SHIPPED fire path calls it.
    rebate,
    // read-only live positions for game.js HUD layers — the minimap contact
    // dots today. Callers draw from these arrays and never mutate them;
    // render-path only, so the one tiny wrapper object per call is free and
    // the seeded stream is untouched. restart() REPLACES E.enemies/E.orbs, so
    // callers read through this accessor every frame instead of caching it.
    // ---- RE-POINTED AT THE SUCCESSOR PLANE (S3b lane 3, commit D4) -------
    // The corner map's contact dots read this, and `E.enemies` is permanently
    // empty from the flip — so without this the minimap goes blank in exactly
    // the way `lights()` made the field go dark, and for exactly the same
    // reason. Commit C closed that one; this closes its twin.
    //
    // BOTH ORB PLANES CROSS, because both are real: production still pays a
    // PvP death out in orbs and the successor plane drops the enemy plane's.
    // A caller drawing dots does not care which produced them.
    //
    // A FRESH WRAPPER PER CALL is this accessor's own contract and it is kept —
    // the arrays inside are LIVE and callers read them without mutating, which
    // is why `restart()` replacing them is safe. The concat is one allocation
    // per frame on the render path, which is where this accessor already lived.
    mapState: () => {
      // the LOCAL host's own list, which is what decides whether the kernel's
      // orb plane is there to concatenate. It is `presentedBodies()`'s local
      // answer, asked separately because the ORB question is about this page's
      // kernel and not about which plane the screen presents.
      const kb = typeof window !== "undefined" && window.EncounterHost
        && window.EncounterHost.installed() ? window.EncounterHost.bodies() : null;
      const ko = kb && window.DemoKernel ? window.DemoKernel.S.orbs : null;
      // ---- ONE PLANE PER FAMILY NOW (S3b lane 3, commit D5) -------------
      // The BODY half no longer concatenates: production's own list is
      // deleted, so the kernel's is the whole answer and the fresh array is
      // the filter's own. The ORB half still concatenates because BOTH planes
      // really do produce orbs — production pays a PvP death out in them.
      // `missiles` is an EMPTY LITERAL, not a dropped key: js/game.js builds a
      // `FRAME.missiles` shadow from it every frame and a missing key is a
      // `TypeError` on the render path, which is the one place a retirement
      // must not surface.
      // ---- A NET CLIENT READS ITS OWN DECODE (commit D5) ----------------
      // It steps no simulation, so `EncounterHost.bodies()` is empty on it and
      // the branch below would hand the renderer nothing. js/net.js decodes the
      // wire's body and ordnance rows into its own store and publishes it; this
      // is the ONE reader. The orbs still concatenate: the client decodes
      // production's own orb row into `E.orbs`, exactly as it always has.
      // ...and the BODY half is `presentedBodies()` on both branches now
      // (S4-CX-2, the fix round) — the same provider the FOES count and the
      // stall surface read, so no reader can be one plane behind another.
      if (typeof window !== "undefined" && window.Net && Net.active() && Net.view) {
        const nv = Net.view();
        return { enemies: presentedBodies(), orbs: E.orbs, missiles: nv.missiles };
      }
      const pb = presentedBodies();
      return { enemies: pb ? pb.filter(bodyIsLive) : [],
               orbs: ko && ko.length ? E.orbs.concat(ko) : E.orbs,
               missiles: [] };
    },
    lights, // ...and, on the same read-only footing, every body's position,
            // radius and kind for the glow layer — see lights() above. It takes
            // the same presentation view Encounter.draw does.
    // ...and, on the same read-only footing, one seat's PRESENTED survival
    // state: what game.js's ship draw needs to paint a hull that has been
    // shot at. Everything here already exists — hull/hullMax are the damage,
    // hitFlash is the 20-tick hit reaction, respawnT the downed countdown —
    // and every field of it is written from that seat's OWN wire record on a
    // net client (js/net.js's apply), so a REMOTE ship reads exactly as hurt
    // on this screen as it does on its own. `rspMax` rides along because the
    // countdown ring needs a denominator and ECFG never crosses into game.js.
    // A fresh plain object per call, like mapState's wrapper: render-path
    // only, nothing here is hashed, and NOTHING here is ever written back.
    seatHealth: (s) => {
      const S = E.seats[s];
      if (!S) return null;
      return { hull: S.hull, hullMax: S.hullMax, flash: S.hitFlash,
               inv: S.invuln, rsp: S.respawnT, rspMax: ECFG.player.respawn,
               claim: S.claimT, absent: !!S.absent, // the two states past the
                             // countdown: held for a click, and gone. The draw
                             // needs `absent` because an unseated seat has no
                             // wreck on the field either — there is no hull to
                             // present when there is no pilot
               wt: E.waveTick }; // the encounter's own presented clock — the
                                 // one the graced-ship ring already blinks on
    },
    // (ringCardShown/hudSuppressed are gone. game.js's UI pass used to ask this
    // file one suppression question before drawing the corner map; the layer
    // that needed the answer — a row's opaque explainer bitmap — has had no
    // row to belong to since the WSAD row was retired, and its replacement
    // clears the map by placement instead. Nothing suppresses anything now.)
    // the shop panel's pointer surface. game.js owns the native pointer, the
    // gutters and the panel transforms; this file owns every rect and every
    // decision made against one — both calls speak LOGICAL PANEL coordinates.
    shopHover, shopClick,
    // ...and the board's, which is the same contract in the other gutter:
    // LOGICAL PANEL coordinates in, a handled/not-handled answer out. The card
    // box speaks FIELD coordinates instead, because that is the space it is
    // drawn in — game.js converts the drawn cursor into both.
    boardClick, nameCardClick,
    // ...and the panels themselves: the fixed logical spaces game.js fits
    // into the gutters, and the two draws it runs under those transforms
    panelSpec, drawShopPanel, drawBoard,
    // the per-seat liveness answer game.js's drain, fire gate and draw ask —
    // a seat is alive while its hull holds; respawnSeat is what revives it
    seatAlive,
    // (the enemy tuning surface RETIRED at commit D4, with the nine archetype
    // blocks its rows drove)
  };

  // ---- test hook extension — deterministic checks drive the slice --------
  function snapState() {
    return {
      state: E.state,
      wave: E.wave,
      loop: E.loop,   // the arc loop counter — hashed sim state, published so a
                      // check can read a turn or a wipe without reaching into E
      waveTick: E.waveTick,
      hull: E.hull,
      hullMax: E.hullMax,
      xp: E.xp,
      score: E.score, // seat 0's scoreboard — per-seat, hashed, zeroed by
                      // exactly one event in the sim: DYING (any death now,
                      // not the PvP kill this line used to name)
      seats: E.seats.map(({ termSeq, ...S }) => ({ ...S, owned: S.owned.slice(),
                                                  hand: S.hand.slice(), bought: S.bought.slice() })),
                              // the market hand is DEEP-copied for `owned`'s own
                              // reason, and it is the reason that matters more
                              // here: a deal REPLACES the arrays, but a purchase
                              // writes ONE cell of `bought` in place, so a hand
                              // riding the spread by reference would let a sale
                              // rewrite a "before" snapshot a check is holding
      marketWave: E.marketWave, // which deal the hands above belong to: the
      marketLoop: E.marketLoop, // PHYSICAL cleared wave and its loop. 0 is
                              // NEVER DEALT, and a wipe puts it back there
                              // `best` rides this spread — it is unhashed but
                              // it IS seat state, and a check that reads a
                              // standing reads it here

                              // every seat's record, copied — ranks
                              // DEEP-copied, so a "before" snapshot cannot be
                              // mutated by a buy. termSeq is EXCLUDED on the
                              // same ground it is unhashed: the epoch is
                              // monotonic ACROSS restarts by design, so a
                              // state summary carrying it would make two
                              // identical seeded runs read as different.
                              // A check that pins the epoch reads
                              // E.seats[s].termSeq live.
      owned: E.owned.slice(), // seat 0's vector, a copy — a TEST view, not the local seat's —
                              // checks compare before/after freely
      invuln: E.invuln,
      // `enemies` is KEPT and reads 0 — a counter that vanishes and a counter
      // that reads zero say different things to a reader of a snapshot. The
      // three ROSTER-shaped views beside it (`darts`, `chargers`, `byType`)
      // are RETIRED with the roster: each named types D9 replaced, and a
      // by-type census keyed on an empty vocabulary is a census of nothing.
      // ...and `missiles`, `queued` and `groups` join it at commit D5 under the
      // same rule, now that the three arrays themselves are deleted. THIS IS A
      // VIEW OF PRODUCTION'S OWN STATE and 0 is the honest answer for it: the
      // bodies on the field are the successor plane's and are read through
      // `mapState`, which is the accessor that crosses to that plane.
      enemies: 0,
      missiles: 0,
      missilesShot: E.missilesShot,
      orbs: E.orbs.length,
      queued: 0,
      kills: E.kills,
      hitsDealt: E.hitsDealt,
      hitsTaken: E.hitsTaken,
      contactsDealt: E.contactsDealt,
      mods: termsFor(0), // SEAT 0's derived terms (the local seat) — a fresh
              // object every call, so a check that watches a purchase land or
              // die with the run reads a stable copy, never live state
      shopHover: E.shopHover, // the card under the pointer, or -1 — the shop's whole input state
      stats: E.stats, // replaced each wave; tuning.refresh() retunes its members in
                      // place — handed out by reference so callers see live retunes
      groups: [],
    };
  }
  // The encounter's contribution to the harness state hash. The allow-list
  // contract matches game.js's: a field belongs here iff it describes what the
  // simulation will do next — a missile's trail and the shop's hover state are
  // presentation, E.stats is a pure function of the wave, and all three stay
  // out. Declared lists, never Object.keys, so a later phase adding a field
  // cannot silently re-key every committed fixture.
  // the three aggro fields are IN: target seat, commitment countdown and
  // last-attacker all decide what the body does next — the charter's rule
  const ENEMY_HASH = ["x", "y", "vx", "vy", "r", "hp", "type", "orbDrop", "mode",
    "cd", "t", "face", "lockA", "flash", "pulseHit", "dashHit", "contactCd", "contactTaken",
    "tgtSeat", "aggroT", "lastAtk"];
  const MISSILE_HASH = ["x", "y", "vx", "vy", "r", "hp", "age"];
  const ORB_HASH = ["x", "y", "vx", "vy"];
  const GROUP_HASH = ["count", "type", "warnAt", "spawnAt", "spawned", "owner"];
  // per-seat survival/wallet walk — score is ADMITTED (per-seat, hashed);
  // xp and score both describe what the shop and the scoreboard will do
  // next, and respawnT/stock decide whether and when a seat comes back
  const SEAT_HASH = ["hull", "hullMax", "xp", "score", "invuln", "hitFlash", "respawnT", "stock"];
  function hashEncounter(h) {
    h.str(E.state);
    h.num(E.wave); h.num(E.waveTick); h.num(E.clearTick);
    h.num(E.lobbyWaiters); // the quarter-rule switch — it decides whether a death
                           // consumes a life, so it is simulation state
    h.u32(E.seats.length); // length-prefixed, ascending seat order — like hashShip
    for (const S of E.seats) {
      for (const f of SEAT_HASH) h.num(S[f]);
    }
    // The seats' PERSONAL rank vectors, folded to the LAST RANK ANYONE BOUGHT
    // and no further — the pvpCd/claimT guarded-fold idiom, and here it is the
    // CHARTER rule itself. Ranks decide what the sim does next (every effective
    // term is termsFor of them), so they belong in the hash; but `owned` is
    // SHOP.map(() => 0), so folded whole beside the SEAT_HASH fields its LENGTH
    // PREFIX is a shop-row counter baked into every trace ever captured. A
    // ninth shop row that NOBODY BUYS would move that prefix from 8 to 9, fold
    // one more zero per seat, and re-key every fixture and the boot self-check
    // for content that changed no behaviour. That tax is what makes content
    // expensive, and this is where it is refused.
    //   Note WHICH suppression this is, because the weaker one is not enough.
    // Guarding only the ALL-STOCK room would still tax every trace in which
    // somebody bought anything — duo-shop, pvp-duel and pvp-ram all move under
    // that version, which is most of the traces a shop round cares about. So
    // the trailing DEFAULT RUN goes on every seat: a stock room folds ZERO
    // BYTES, and a room where seat 1 bought AFTERBURNER folds exactly as many
    // ranks as it takes to say so, whatever the shop's width has grown to.
    // server/snapshot.mjs's trimRanks does the identical thing to the same
    // vector on the wire, for the identical reason; the two cannot import each
    // other (classic script against ES module), so they are two spellings of
    // one rule and each names the other.
    //   Trailing zeros carry NO information to suppress: an absent entry is
    // rank 0 by rankAt's own contract, so a wire-decoded short vector and a
    // full one holding the same ranks are the same state and MUST hash alike —
    // the sim cannot tell them apart and neither may the oracle.
    //   Two collisions to close, and the block closes both. It is entered ONCE
    // for the whole room — not per seat — so "seat 0 bought a cell" and "seat 1
    // bought a cell" cannot fold the same bytes; and each seat keeps its OWN
    // length prefix inside the block, so a two-rank seat beside a five-rank one
    // can never run together into one ambiguous stream.
    //   The derived terms are still NOT hashed: pure functions of these ranks
    // and unhashed tunables, the standing energyMax/vcap rule — folding them
    // too would hash the same truth twice. termSeq stays out: derived
    // bookkeeping, never a decision input.
    {
      const ranked = E.seats.map((S) => {
        let n = S.owned.length;
        while (n > 0 && !S.owned[n - 1]) n--;
        return n;
      });
      if (ranked.some((n) => n > 0)) for (let i = 0; i < E.seats.length; i++) {
        const S = E.seats[i];
        h.u32(ranked[i]);
        for (let r = 0; r < ranked[i]; r++) h.num(S.owned[r]);
      }
    }
    // The PvP pair windows, folded ONLY when the store is non-empty: an empty
    // store contributes ZERO BYTES, which is the whole reason every one-seat
    // trace and every PvP-free multi-seat trace kept its committed hash when
    // this phase landed. Non-empty, it folds deterministically — a count
    // prefix, then the keys in sorted order with their remaining ticks — so
    // insertion order can never move a hash. It decides what the next tick
    // does (whether a pair may bite), so it belongs in the hash.
    {
      const ks = Object.keys(E.pvpCd).sort();
      if (ks.length) {
        h.u32(ks.length);
        for (const k of ks) { h.str(k); h.num(E.pvpCd[k]); }
      }
    }
    // The claim window and the unseat, folded ONLY when at least one seat is in
    // one of those two states — the pvpCd idiom again, and for the identical
    // reason: SEAT_HASH above walks every seat unconditionally, so admitting
    // claimT/absent there would fold two zeros PER SEAT into every trace ever
    // captured and re-key all 21 fixtures and the boot self-check. Guarded, a
    // room where nobody is waiting on a click contributes ZERO BYTES and every
    // committed hash stands. They belong in the hash under the charter's own
    // rule — they decide whether the seat comes back — and once the block is
    // entered EVERY seat's pair folds, so "seat 1 is absent" and "seat 0 is
    // absent" can never collide.
    {
      let held = false;
      for (const S of E.seats) if (S.claimT > 0 || S.absent) { held = true; break; }
      if (held) for (const S of E.seats) { h.num(S.claimT); h.u32(S.absent ? 1 : 0); }
    }
    // The armed wipe edge, folded ONLY while it is set — the pvpCd idiom just
    // above, kept for the same reason: false contributes ZERO BYTES, so every
    // committed fixture and the server's boot self-check keep their hashes.
    // It belongs in the hash under the charter's own rule — it decides what the
    // next tick does — and there ARE tick boundaries where it stands true:
    // __test.damagePlayer does not step, and a check can kill both seats
    // through a bare resolveBulletHits with no encStep after it. Left out, two
    // different futures would hash the same. Folded UNCONDITIONALLY, the extra
    // four bytes would move every hash and the boot self-check would exit(1).
    if (E.wipePending) h.u32(1);
    // THE ARC LOOP COUNTER, on the same guarded footing and for the same reason
    // (PORT-S S7). It is hashed because it is a decision input — it is a part of
    // the market's deal key, so two rooms on the same wave with different loop
    // counts deal different hands and must not hash alike. Folded ONLY while it
    // is non-zero: a run that has neither turned its arc nor wiped folds ZERO
    // BYTES, which is what lets every fixture captured before this field existed
    // reproduce unchanged, and what keeps the server's boot self-check at its
    // committed hash. MEASURED: with the guard, byte-identical.
    if (E.loop) h.u32(E.loop);
    // ---- D37'S MARKET HAND, THE FIFTH GUARDED FOLD (PORT-S S7) -----------
    // The hands and their bought bits, folded ONLY once SOME seat has been
    // dealt one — the pvpCd idiom the three blocks above already keep, and for
    // the identical reason: every committed fixture and the server's boot
    // self-check were captured before a hand existed, and an UNCONDITIONAL fold
    // would move all 46 checkpoints of 12 of the 13 traces. That is not an
    // argument, it is a measurement: the same fold dealt at run start was run
    // and it did exactly that.
    //
    // THE IDENTITY PAIR SITS INSIDE THE GUARD. It has to: an empty room must
    // fold nothing whether or not the pair exists, and once ANY hand stands the
    // pair is what distinguishes "this hand, dealt for reward wave 3 of loop 0"
    // from the same four cards dealt for reward wave 3 of loop 1 — two rooms
    // that must never hash alike, because a wipe is supposed to take a hand
    // away for good.
    //
    // ENTERED ONCE FOR THE WHOLE ROOM, like the rank block: every seat's hand
    // then folds, each behind its OWN length prefix, so "seat 0 was dealt these
    // four" and "seat 1 was dealt these four" can never fold the same bytes and
    // a two-card hand beside a four-card one can never run together into one
    // ambiguous stream. The bought bit rides beside its own card rather than in
    // a second pass, so a card and its state cannot be separated by a length.
    //
    // BOTH BELONG IN THE HASH under the charter's own rule — they decide what
    // the sim does next. A hand decides what a seat may buy; a bought bit
    // decides whether it may buy it twice.
    {
      let dealt = false;
      for (const S of E.seats) if (S.hand.length) { dealt = true; break; }
      if (dealt) {
        h.u32(E.marketWave);
        h.u32(E.marketLoop);
        for (const S of E.seats) {
          h.u32(S.hand.length);
          for (let i = 0; i < S.hand.length; i++) { h.num(S.hand[i]); h.u32(S.bought[i] ? 1 : 0); }
        }
      }
    }
    // shipPrev folds as the array encStep writes; a suite's staged single
    // {x, y} folds as a one-entry walk so the hash never throws mid-suite
    const sp = Array.isArray(E.shipPrev) ? E.shipPrev : E.shipPrev ? [E.shipPrev] : null;
    h.u32(sp ? sp.length : 0);
    if (sp) for (const p of sp) { h.num(p.x); h.num(p.y); }
    h.num(E.kills); h.num(E.missilesShot);
    h.num(E.hitsDealt); h.num(E.hitsTaken); h.num(E.contactsDealt);
    h.u32(stock.keyThrust ? 1 : 0); // the one non-purchase term left: global
                            // stock gear, still a sim decision input (the key
                            // thrust gate), so it stays in — the old per-mod
                            // walk is gone with the shared mods object itself
    // ---- THE THREE RETIRED FOLDS, AND THE MERGE HAZARDS THEY WERE ------
    // PORT-S S3b lane 3, commit D4. The GROUP fold, the ROSTER-ordered ENEMY
    // walk and the MISSILE fold are deleted. All 25 committed traces re-key at
    // this lane's freeze, which is what licenses touching this block at all —
    // S3B-MAP §5c's fold-order conditionals were about surviving the deletion
    // WITHOUT a recapture, and the recapture is already bought.
    //
    // AND TWO OF js/engine.js's THREE MERGE HAZARDS ARE ANSWERED HERE, IN
    // WRITING, because this is the block they were about:
    //
    //   HAZARD 1 — `h.u32(i)`, THE ENEMIES-ONLY ARRAY INDEX. "A merged list
    //   must still answer 'what is this body's dense index among enemies only,
    //   in enemies-only insertion order', and deriving it from a merged
    //   position is simply wrong." IT NO LONGER HAS TO ANSWER: the fold that
    //   asked the question is gone, because production has no enemies-only
    //   array to index. Nothing else in this codebase folds a container index,
    //   and nothing does now.
    //
    //   HAZARD 2 — ENEMIES WERE NOT LENGTH-PREFIXED while missiles and orbs
    //   were, "and the asymmetry is load-bearing: a type with zero live members
    //   folds NOTHING, which is what lets ROSTER grow without moving a
    //   committed hash." THE ASYMMETRY IS GONE WITH THE ASYMMETRIC PARTY. What
    //   is left is ORBS, length-prefixed, which is the shape the other two
    //   already had — so a merged registry walk that adds a per-KIND header has
    //   nothing left to break here.
    //
    //   HAZARD 3 is the 45 id-less synthetic bullet pushes across tests/ and
    //   test/, and it is NOT this block's: it belongs to js/game.js's bullet
    //   fold and is answered at commit D5, with the merge itself.
    //
    // `E.groups`, `E.enemies` and `E.missiles` REMAIN as permanently empty
    // arrays and are NOT deleted here. Their storage is the merge's question
    // (commit D5) and every one of the twenty wire, presentation and decode
    // crossings S3B-MAP counted still reads them; emptying a list and deleting
    // it are different changes and they get different commits.
    h.u32(E.orbs.length);
    for (const o of E.orbs) for (const f of ORB_HASH) h.val(o[f]);
  }

  // ---- headless drain -----------------------------------------------------
  // The RAF loop owns the real drain (game.js's drainCues, after each
  // tick); a headless suite drives clientStep() through advance() and the direct
  // hooks below instead, so the same forwarding runs here — and, while a
  // trace asks, each drained event is recorded with the simTick it fired on,
  // which is how the golden suite asserts cue ORDER with no audio device.
  const evRec = { on: false, list: [] };
  function drainStep() {
    for (const ev of drainEvents()) {
      // termChange is a MARKER, not a cue: its seat+termSeq are recorded (the
      // fixtures pin the epoch through them) but it never reaches the audio
      // layer — the spread keeps every OTHER recorded event's shape exactly
      // what the committed event-stream fixtures pinned.
      if (evRec.on) evRec.list.push({ tick: simTick, kind: ev.kind, gain: ev.gain === undefined ? null : ev.gain,
        ...(ev.termSeq !== undefined ? { seat: ev.seat, termSeq: ev.termSeq } : {}) });
      if (ev.kind !== "termChange" && window.Sfx) Sfx.cue(ev.kind, ev.at, ev.gain, ev.seat);
    }
  }
  // the recorder sees only what THIS drain forwards — events the RAF loop
  // drains (game.js's drainCues) pass it by, which is why the frame-loop
  // trace asserts through the Sfx log instead
  const recordEvents = () => { evRec.list = []; evRec.on = true; };
  const stopEvents = () => { evRec.on = false; return evRec.list; };

  Object.assign(window.__test, {
    enc: {
      cfg: ECFG,
      E,
      hashInto: hashEncounter, // folds encounter state into a game.js fnv hasher
      rngState: () => rand.state(), // reads the stream's position without advancing it
      // (`roster` RETIRED at commit D4 — the golden suite's phantom-type check
      // mutated and restored it, and both the roster and that check are gone.)
      mods, // the seat-0 compatibility VIEW (getter-backed on termsFor) —
            // kept only for the standing test surface; sim code never reads it
      termsFor,
      ownedFor,
      resetSeatUpgrades, // the per-seat rank reset — restart()'s per-seat leg,
                         // and phase 14's PvP-death hook
      reset: (seed) => restart(seed),
      restart,
      syncSeats,    // size E.seats to players[] WITHOUT restarting. restart()
                    // is the only site that may change the count between
                    // matches in local play, but a NET client learns the seat
                    // count from the wire mid-stream: without this its
                    // E.seats stays one long, every remote seat's hull, wallet
                    // and ranks are silently dropped at apply()'s guard, and a
                    // client granted seat 1 reads seat 0's HUD. Pure — fresh
                    // records, no rand(), no events, no wave state touched.
      markRestart: () => emit("restart"), // the discontinuity marker restart()
                    // deliberately does NOT emit — see window.Encounter above
      advance: (n) => { for (let i = 0; i < n; i++) { clientStep(); drainStep(); } }, // the full CLIENT tick
                    // (bank + camera-free step), encounter included — drained
                    // per step, exactly as the frame loop drains
      edgeArrows: computeEdgeArrows, // D58's resolved chevron list off any view
                                     // (or off live state with none) — the seam
                                     // the bucket, cap and cull legs read
      arrowCfg: ARROWS,              // inset/cap/buckets — a check reads these,
                                     // it never copies them
      interestR,                     // ...and the derived cull radius, so a leg
                                     // can stage a body just inside and just
                                     // outside it without spelling the formula
      recordEvents, // start recording the (tick, kind, gain) stream the drain forwards
      stopEvents,   // ...and stop, returning the recorded list
      state: snapState,
      // ---- THE ENEMY PLANE'S TEST SEAM IS RETIRED (commit D4) -----------
      // `spawnEnemy`, `spawnMissile`, `waveGroups`, `countsFor`, `statsFor`,
      // `TIER_LADDER`, `TIER_TYPES`, `tierRow` and `tierInk` (D2). Every one
      // was a door onto the roster D9 replaced, and a door onto a room that
      // has been demolished is not a door.
      //
      // WHAT REPLACES THEM AS A STAGING SEAM: the successor plane's own
      // `bodies()` and `damageBody()` (commit B), published on js/demo-kernel.js
      // and wrapped by js/encounter-host.js — which is where a check now goes
      // to put a body on the field and hurt it.
      // the direct hooks that can emit outside a step: each drains after the
      // call, so a suite's log assertions see the cue on the same call — and
      // each keeps its exact return value
      hitPlayer, // the BARE combat primitive, undrained: the server's dev
                 // seat-kill lever calls it so the death marker still rides
                 // the wire's own event drain instead of dying in drainStep
      // damagePlayer keeps its (n, seat) argument order and gains a THIRD
      // argument again — but a different one from the killer seat it once had.
      // That one selected the PvP toll and died with the toll going
      // unconditional; this one is hitPlayer's `src` RECORD, and it exists so a
      // leg can say what KIND of damage it is staging (D28 made that decide the
      // comet refusal). Omitted, the hit is UNCLASSIFIED: no comet refusal, no
      // matrix consultation — which is the right default for a seam whose ~65
      // callers are staging generic hull damage and mean nothing more by it.
      damagePlayer: (n, seat = 0, src) => { const hit = hitPlayer(seat, n === undefined ? 1 : n, src); drainStep(); return hit; },
      addXp,
      buy,
      // the suites' wave elevator: the old flow rode continueFromShop, and
      // the panel shop has no wave button — encStep deals waves itself, and
      // a check that needs wave n NOW stages it exactly as encStep would
      // ---- IT REFUSES LOUDLY NOW (FIX ROUND, S3BR-09) ------------------
      // `startWave` deals nothing since commit D4 — the dealer, the roster and
      // the schedule are deleted — and `applyKernelHud` overwrites both fields
      // this used to set on the very next tick. So the seam RAN and CHANGED
      // NOTHING while its caller logged success, and the live latency rig used
      // it as a condition selector: a run requested as wave 10 was journaled
      // and scored as wave 10 while the field stayed at wave 1.
      //
      // ---- RE-AIMED AT THE KERNEL'S DIRECTOR (PORT-S S4, commit G) --------
      // The refusal's own note routed the work: *"THE DIRECTOR IS THE KERNEL'S,
      // and pointing this lever at it means deciding what 'deal wave N' means to
      // a curated arc — which setpiece, which entries, what happens to the one
      // in flight. That is S4's."* The answers, in order: setpiece N of the
      // kernel's own WAVES table; that setpiece's entries and no others; and the
      // one in flight is WIPED — board, arrivals and enemy ordnance together.
      //
      // THAT WIPE IS THE SHAPE D21 FORBIDS, and it is why this is an INSTRUMENT
      // rather than a rule. A latency run that wants to measure setpiece 10
      // cannot fly to it, so the rig needs a jump; a PLAYER must never get one,
      // because "the next arc wipes the board and starts" is the exact sentence
      // the owner ruled out. The two are reconciled by the CALLER, not by the
      // mechanism: the only non-test caller in the tree is
      // `server/server.js`'s `applyLabFlags()`, behind `devTuneOn()`, and
      // `test/node-golden.mjs` holds that census as a source shape in both
      // directions so a second caller cannot arrive quietly.
      //
      // IT STILL REFUSES WITHOUT A KERNEL, loudly and for the original reason:
      // production has had no dealer since commit D4, so with no host installed
      // there is nothing to point the lever at. The rig's own
      // `assertDealWaveHonest` tripwire stays live for exactly that case.
      //
      // IT RETURNS THE WAVE IT LANDED ON — a number, not `true` — so a caller
      // journals what HAPPENED. FIX 9's lesson was never about the lever; it was
      // about a caller logging a success it had not had.
      dealWave: (n) => {
        if (!kernelDriving() || !window.EncounterHost
            || typeof window.EncounterHost.devDealSetpiece !== "function") {
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[scmelee] dealWave(" + n + ") REFUSED — production deals no waves since "
              + "PORT-S S3b commit D4, and no successor-plane host is installed to deal one. "
              + "The wave is UNCHANGED at " + E.wave + ".");
          }
          return false;
        }
        return window.EncounterHost.devDealSetpiece(n);
      },
      respawnSeat, // the direct deal — a check can stage a re-entry without
                   // waiting the timer out
      unseatSeat,  // ...and its opposite, published for the SERVER: a socket
                   // whose grace lapsed has its sim seat taken off the field
                   // through this one function, so the rule that "leaving is
                   // not dying" has exactly one implementation
      reseatSeat,  // ...and the way BACK for the server: a parked seat that has
                   // been granted to a socket again is waiting on a click, not
                   // empty — see reseatSeat's own block
      seatParked,  // ...and the PARK AS A STATE THE SERVER CAN SEE (S4-CX-1):
                   // `reapAbsentSeats` revokes every socket whose sim seat is
                   // absent, and a parked seat is absent — so the sweep tore
                   // down the grant D17 had just parked. The park cannot be
                   // inferred from `absent`; it is asked for by name.
      parkSeat,    // parking, for startRound and restartRound's restart cut:
                   // absent with no wipe arm, no toll and no cue — see
                   // parkSeat's own block
      vacateSeat,  // ...and the ONE terminal write all three share, published
                   // for the NET CLIENT: js/net.js's decoder takes a parked
                   // seat's four-key record (v8) through this same function,
                   // so the six terminal fields are folded by one body on the
                   // server and on every screen — a seventh added here cannot
                   // be cleared on the sim's path and left stale on the wire's.
                   // Pure on the seat record, no rand(), no event, idempotent.
      // phase 15: the pose ring and the rebate, bare, for the suites — a
      // check may STAGE rows exactly as the standing legs stage E.shipPrev,
      // and rebate here lets a leg drive era arithmetic without a socket
      poseLog, rowForAge, rebate, LIVE_SWEEP, REWIND_ROWS,
      applyRebateHits, rebateQueue, // corrective pass 2: a direct-call leg
                    // queues with rebate() and pays with applyRebateHits() —
                    // the same split encStep runs; the queue is inspectable
                    // so a leg can pin it EMPTY at every tick end
      // the resolved catalog view the panel itself draws from — name,
      // live price, owned rank, cap state and the can() availability
      shopLayout,     // every rect the mouse UI uses, in LOGICAL PANEL space
      shopTextPlan,   // ...and the type that rides it: the font sizes, the icon's
                      // drawn size, the wrap budget and the PROSE cut, all derived
                      // from the fit's CSS-px-per-logical-unit ratio alone
      shopWrap,       // the character-budget word wrap both prose surfaces run on
      shopHintLine,   // the gutter's whole remaining band: one idle hint, and the
                      // baseline whose ink clears the last card by construction
      shopHoverBand,  // the FIELD channel the hover panel is allowed to sit in —
                      // between the status stack's right edge and the corner map's
                      // left one, in field coordinates
      shopHoverPlan,  // ...and the panel itself: its box, its header strings, the
                      // lines under them and the reason-first order they keep
      shopPriceLabel, // the ONE price string the card and the panel both print
      waveHeader,     // the ONE director line the draw prints and the width
                      // contract measures — wave, encounter index, arc loop,
                      // and the CLEAR suffix last
      statusStackRight, // the left edge of that channel, derived from the same
                        // numbers encDrawHud sets the status stack with
      shopHover,      // the hit test, in panel coordinates
      // the board's own draw cache and the card's box, so a click leg can press
      // the EXACT rect the last frame drew instead of re-deriving geometry that
      // would then agree with itself and with nothing on screen. Copies out:
      // these are live draw state and a check may not hold a handle on them.
      boardRows: () => boardRows.map((r) => ({ ...r })),
      nameBoxRect: () => (nameCardRect ? { ...nameCardRect } : null),
      // ...and the ship strip's cells, on the same terms and for the same
      // reason: a leg presses the rect the last frame drew.
      skinRects: () => skinCellRects.map((r) => ({ ...r })),
      SKINS: () => SKINS.map((sk) => ({ id: sk.id, label: sk.label })),
      shopClick,      // ...and the click that runs through it
      shopInfo: (seat = localSeat()) => SHOP.map((row, i) => ({ // the SEAT's resolved view —
        // prices/ranks/availability all differ per seat now; the default is
        // the LOCAL seat, so every no-arg caller keeps its exact old meaning
        // (seat 0 in local play and on the server, the granted seat in net)
        name: row.name, cost: shopCost(i, seat), owned: rankAt(i, seat),
        maxed: shopMaxed(i, seat), available: !row.can || !!row.can(seat),
        icon: row.icon || null, iconReady: !!(ICONS[i] && ICONS[i].ok),
        desc: row.desc, // the sentence the FIELD panel sets — published so a
                        // check can wrap the real string instead of a copy
      })),
      // ---- D37'S HAND, BESIDE THE CATALOG AND NEVER INSTEAD OF IT ---------
      // `shopInfo()` STAYS THE CATALOG. Its `.length` is a load-bearing WIRE
      // contract in three other places — `server/snapshot.test.mjs:21` reads it
      // as the rank-vector width, `tests/net-checks.js:1545` pads a trimmed `ow`
      // back to it, and `js/net.js:1353` resolves BLAST CHARGE's catalog index
      // through it and then indexes `S.owned` with the answer. Narrowing it to
      // four cards would make the predictor read a rank at the wrong index on
      // every net client, SILENTLY, because `S.owned[i] | 0` answers 0 past the
      // end. So the hand gets its OWN reader.
      //
      // Same record shape as a catalog row, plus `bought`: a card the seat has
      // already spent this reward wave. The card's `i` is its CATALOG index —
      // the hover, the wire's `item` and `buy()` all speak catalog indices, and
      // the hand is a MEMBERSHIP test over them, not a second address space.
      handInfo: (seat = localSeat()) => {
        const S = E.seats[seat];
        if (!S) return [];
        return S.hand.map((i, k) => ({
          i, name: SHOP[i].name, cost: shopCost(i, seat), owned: rankAt(i, seat),
          maxed: shopMaxed(i, seat), bought: !!S.bought[k],
          icon: SHOP[i].icon || null, iconReady: !!(ICONS[i] && ICONS[i].ok),
          desc: SHOP[i].desc,
        }));
      },
      // WHICH deal the standing hands belong to: the PHYSICAL cleared wave and
      // its loop. `{wave: 0, loop: 0}` is NEVER DEALT — waves start at 1 — and
      // a wipe puts a room back there.
      market: () => ({ wave: E.marketWave, loop: E.marketLoop }),
      // ---- THE EXPLICIT STAGING SEAM (PORT-S S7) --------------------------
      // The ONE way a check stages a hand short of driving a real clear. It
      // writes the ids and zeroes the bits and TOUCHES NOTHING ELSE — not the
      // identity pair, not `E.loop` — so a production deal at a later clear
      // replaces a staged hand exactly as it would replace any other.
      //
      // IT VALIDATES AND THROWS. A silent coercion here is how a re-staged leg
      // goes VACUOUS instead of red: a hand containing -1, or a repeat, or the
      // flat row, would let a later `buy()` refuse for the wrong reason and a
      // contract about nothing would report green.
      dealHand: (seat, ids) => {
        const S = E.seats[seat];
        if (!S) throw new Error("dealHand: no seat " + seat);
        if (!Array.isArray(ids)) throw new Error("dealHand: ids must be an array");
        if (ids.length > 4) throw new Error("dealHand: a hand is at most four cards, got " + ids.length);
        const seen = new Set();
        for (const i of ids) {
          if (!Number.isInteger(i) || !SHOP[i]) throw new Error("dealHand: not a catalog row: " + i);
          if (SHOP[i].curve !== "double") throw new Error("dealHand: " + SHOP[i].name + " is not a market row — the flat row is exempt, outside the hand");
          if (seen.has(i)) throw new Error("dealHand: repeated card " + i + " — a hand is drawn WITHOUT replacement");
          seen.add(i);
        }
        S.hand = ids.slice();
        S.bought = ids.map(() => 0);
        return true;
      },
      // ...and the production dealer itself, published so a check can drive the
      // REAL deal by key without a clear. Named apart from the staging seam
      // above on purpose: one deals, the other stages.
      dealSeatHand,
      segCircleHit,
      segCircleEntryT,
      downCardLine, // the SHIP DOWN card's copy — a rules CLAIM, so it is pinned
                    // by a check rather than left as an unguarded literal
      claimCardLine, // ...and the same card's line once the countdown is spent
      absentCardLine, // ...and the third state's, once the window is spent too
                     // and the seat is waiting on a click, published on the
                     // identical ground: it states the release rule in words
      refusedCardLine, // ...and the correction the same card prints once the ask
                       // has come back empty — the one line that stops the card
                       // promising a seat that is not there any more
      spectatorCardLine,    // ...and the pair the seatless screen gets instead,
      spectatorRefusedLine, // pinned on identical ground: both state the claim
                            // rule in words, and the whole point of the guard
                            // above is WHICH screen reads which sentence
      claimRefusedHere, // ...with its own gate, published for the same reason
                        // releasedHere is: which of two lines a screen gets is a
                        // predicate question, and a check drives the predicate
      releasedHere,   // ...and the GATE that decides whose screen that line is
                      // drawn on. The shopLayout idiom again: whether a released
                      // pilot and only a released pilot sees the card is a
                      // predicate question, and a check drives the real
                      // predicate rather than diffing a scrim for it
      boardScoreLine, // ...and the board's score line, published on exactly the
                      // same ground: it states which number is the standing and
                      // which is the live run
      kingSeat,       // ...and WHO LEADS, the one derivation the board's crowned
                      // row and the field's crown both read. Published here on
                      // the same ground as boardRanking: "which seat leads" is
                      // a predicate question, and a check that diffed two
                      // panels for it could not say whether they AGREE.
      boardRanking,   // ...and the ROW ORDER those lines are drawn in. The
                      // shopLayout idiom: a check drives the real comparator
                      // rather than diffing pixels for an ordering question
      resolveBulletHits, // the first-along-the-path pass, staged directly: a check that
                         // wants ONE arbitration must not also pay for the integrate step
                         // that moved the bullet there
      resolvePvpRams, // the PvP ram sweep, staged directly — a check drives one tick of
                      // it without threading a whole comet burn through the input ring
      nearestSeat, // D18's selection, published so the acquire legs can ask the
                   // SHIPPED consumer rather than a copy of it: routing it
                   // through Engine.acquire is only worth something if the
                   // tie-break, the dead-seat skip and the empty-room -1 are
                   // proved on the function production actually calls
      blastAt, // the splash itself, staged directly, on the same precedent as the two
               // passes above: D1's PvP row is a question about ONE application at ONE
               // point, and threading a bullet through a sweep to ask it would put the
               // sweep's own arbitration inside the answer
      pvpCd: () => ({ ...E.pvpCd }), // a COPY of the windows: the pacing folds ZERO
                                     // BYTES while empty and never reaches the wire, so a
                                     // check reads it here rather than inventing its own
                                     // bookkeeping. It holds TWO key shapes since FIX 14 —
                                     // `a:v` seat pairs (resolvePvpRams) and `b<id>` BODY
                                     // windows (resolveCometBodyRams) — and a body key dies
                                     // with its body, which is the retired contract.
      frozen,
      fireOnce: () => { fire(); drainStep(); }, // the real firing gate, without the autofire path
      setBounce: (v) => { BOUNCE = !!v; },
      setLoadout: (v) => { LOADOUT = !!v; }, // the rail band's isolating lever —
                     // the PANELS idiom, for a layer only this leg answers to.
                     // It moves the DRAW and never shopLayout(), so card 0's
                     // own ink is identical on both sides of the toggle and a
                     // probe on the band is measuring the band
      // ---- THE `ENEMY` WINDOW IS RETIRED (S3b lane 3, commit D4) --------
      // It was the fixture oracle's view of the enemy constants — a per-type
      // (hp, split, arc, tier) serialization over `statsFor(1)` and `ROSTER`,
      // so a diagnosis line could say "an ECFG hull retune moved the hashes"
      // instead of leaving a reader with bare hash failures. Every one of
      // those constants went with the roster.
      //
      // THE JOB IT DID IS NOT LOST, and it is worth saying where it went: the
      // successor plane's own constants are pinned by
      // tests/fixtures/demo-bounded-reference, which compares 23,000 ticks of
      // SERIALIZED STATE rather than a hand-picked window onto a table — a
      // strictly stronger oracle, and one that already exists and already runs
      // in this gate. What the flight tunables below still buy is production's
      // own half, which no kernel fixture covers.
      tunables: () => ({ BCOOL, BLIFE, AUTOFIRE, BSPEED, BMAX, VMAX, TICK, BDMG, CONTACTCD, BLASTR, BLASTGAIN, COMETDMG, COMETCD, PVPORBS, PVPREWIND, ENCPERREWARD }),
                       // ENCPERREWARD rides here for PVPORBS's exact reason: the
                       // ENCOUNTER reads it, it decides which clears deal a market
                       // hand, and a hand is HASHED — so a capture taken at a
                       // non-default dial has to be detectable, by name, in the
                       // diagnosis line rather than as a bare hash mismatch
      rewardWave: () => rewardWaveOf(E.wave),
      dueForReward: () => dueForReward(E.wave),
                       // PVPORBS rides here too, and for the same reason COMETCD does:
                       // the ENCOUNTER is what reads it (deathToll deals the orbs — on
                       // EVERY death now, which is why the name still says PvP and the
                       // behaviour no longer does), and it sizes a drop the fixtures
                       // pin, so the meta diagnosis line has to be able to say "the
                       // constant moved" about it.
                       // COMETCD rides HERE and not in flightTunables: the encounter is
                       // what stamps it, beside the CONTACTCD it was split off from
      blastRadius, // the live effective radius, exactly as blastAt() reads it
    },
  });
})();
