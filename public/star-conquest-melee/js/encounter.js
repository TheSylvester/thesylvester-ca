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
    enemy: {                 // dart baseline — statsFor scales hp and maxSpeed per wave
      r: 7, hp: 2,
      maxSpeed: 2.4,         // px/tick — 144 px/s, just over the ship's 120 top speed
      steer: 0.06,           // fraction of (target − velocity) applied per tick
      prefer: 84,            // the ring it holds around the player, px
      band: 14,              // hold tolerance — inside prefer−band it backs off
      backSpeed: 1.2,        // retreat speed when the player crowds it
      sepR: 30,              // separation radius between pack members, px
      jitter: 26,            // group spread around the shared spawn anchor, px
    },
    lance: {
      // THE TWO HALVES OF "FIRING RANGE", and they are not the same number.
      // `engage` is where the dart STOPS AND PLANTS; `len` is how far the beam
      // it then fires actually reaches. Between the two sits a 45-tick
      // telegraph in which the dart is a statue — so a player who runs gains
      // ground on a body that has already committed, and the reach has to
      // cover the plant distance PLUS whatever the runner banks in those 45
      // ticks. At the old 110/118 a stock 2.0 px/tick ship fleeing straight
      // was 189.6 px out when the beam lit and the beam reached 127.5: wave 1
      // could not land a single lance on anyone simply holding top speed.
      // Both numbers now sit well outside that, so a dart is a standoff
      // threat rather than a body you walk away from. The dodge is unchanged
      // and is what it always was — leave the LINE, do not outrun it.
      engage: 130,           // start the telegraph inside this player distance
      len: 180,              // beam length, px
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
      engage: 240,           // a rested charger plants inside this player distance
      windup: 50,            // plant ticks — the dash line locks at windup START
      dashSpeed: 7,          // px/tick along the locked line, constant across waves
      dashTicks: 26,         //   so is the duration — dodge difficulty stays fair
      rest: 90,              // tired ticks after a lunge — statsFor shortens this
      cooldown: 30,          // seek ticks before the next lunge is considered
      dmg: 1,
    },
    // The standoff carrier — the roster's RANGE axis. Its retreat speed is
    // HIGHER than its approach speed, which is the whole read: crowding a
    // harrier makes it run instead of trade, so the answer to it is to close
    // the 185 px ring, not to duel across it. It never rams by intent.
    harrier: {
      r: 8, hp: 4,
      maxSpeed: 1.80,        // approach — still slower than the 2.0 ship
      steer: 0.05,
      prefer: 185,           // the ring it holds
      band: 30,
      backSpeed: 1.85,       // ...and it backs off FASTER than it closes. 1.85 is
                             // the smallest step on the panel's 0.05 grid that
                             // holds retreat above the raised 1.80 approach, and
                             // it keeps the widest chase margin under the 2.0 ship.
      sepR: 46,
      engage: 200,           // dart 130, harrier 200, charger 240 — the harrier is
                             // NO LONGER the gate king. The standoff identity now
                             // rides the THREAT ENVELOPE, not the plant gate:
                             // harrier 200 + missile reach 260 = 460 px, against
                             // the charger's 240 + dash 182 (7 × 26) = 422. The
                             // range archetype keeps the crown by 38 px. The floor
                             // is therefore whatever holds engage + reach above
                             // 422 and engage above the dart's 130 — with reach at
                             // 260 that is engage 163; 200 is the playtested value
                             // and leaves 37 px over the envelope floor.
      lockon: 45,            // 0.75 s of plant — the research's floor is ~25 ticks,
                             // the time the player needs to develop the lateral
                             // break that beats a missile; below it the first
                             // missile of every wave is an unavoidable hit
      cooldown: 150,         // ticks between launches — statsFor shortens it, floor 90
      orbDrop: 2,
    },
    // The seeker missile. speed × life = 260 px of reach. It NO LONGER crosses
    // the 512 px field: the reach is now cut to the launcher, and must clear the
    // harrier's engage of 200 by AT LEAST 40 px — 260 clears it by 60 — so a
    // missile fired at the gate still arrives with margin and one fired at
    // nothing dies well short of the far wall. `turn` is what keeps the speed
    // fair. The quantity that decides a dodge is NOT the turn radius — a faster
    // pursuer beats a circling target at any radius — it is the total HEADING
    // AUTHORITY the fuse can spend: (life − arm − decay/2) × turn, which the
    // shorter fuse drops from ≈72° to ≈44°. The table below is the original
    // tuning, taken at life 90 over the then-live band; the current values are
    // re-proven, not assumed, because the wave1 suite re-runs the break fight
    // over the LIVE band every run (now the ring-to-engage band, 155–200 px;
    // it was 210–270 before this retune, and 240–400 when first tuned):
    //   turn 0.030 (108°) — the break is HIT at every range. Not minor homing.
    //   turn 0.022 ( 79°) — the break wins, with no margin.
    //   turn 0.020 ( 72°) — the break wins from a standstill too, and survives
    //                       half a second of hesitation; a HALF-committed 45°
    //                       break is still hit, and so is running away, which
    //                       is exactly the shape a homing threat should have.
    // Running away is the one line of that table the shorter fuse repeals: see
    // the note on `speed`. So the counter is a committed lateral break, decided
    // early — or a straight full-speed run — or, for the
    // confident, a jink held until the last 60 px, which beats it at any of
    // these values. The margin is wide enough that AFTERBURNER, which RAISES
    // the player's own turn radius as v²/a, cannot invert the fight.
    // NONE of these scale with the wave: like the charger's dashSpeed, dodge
    // difficulty stays fair forever and only the launcher's hp and cadence grow.
    missile: {
      r: 3.5, hp: 1,         // r + SHIP_R = 10.5 px of hit radius; one bullet kills it
      speed: 4.00,           // px/tick — 240 px/s, 2× the ship's top speed. Running IS
                             // now an answer: measured against this loop, a straight
                             // full-speed run escapes by 105–150 px at afterburner
                             // rank 0 and by 249–264 px at rank 1. The owner accepted
                             // that. What the values still guarantee, and what the
                             // wave1 suite pins: a PARKED player is hit across the
                             // whole band, and a committed lateral break — the
                             // intended counter — misses by 131–138 px.
      life: 65,              // ~1.08 s
      turn: 0.020,           // rad/tick — 69°/s; R = 300 px, ~20× the ship's own 16.7
      arm: 12,               // ballistic at launch: the straight opening segment is
                             // what makes the bearing readable before it bends
      decay: 30,             // steering fades linearly to 0 over the final ticks —
                             // the fuse tell and the anti-orbit fix in one
      dmg: 1,
      trail: 14,             // the trail IS the UI for the turn radius; a bare dot
                             // travelling 4 px/tick reads as a teleport
      max: 6,                // a guard, not a mechanic: a harrier's cadence is its
                             // cooldown (150, floor 90) plus lockon 45, so even at the
                             // deepest wave 135 ticks separate launches against a
                             // 65-tick life — no harrier ever has two of its own in
                             // flight, and 3 of them cannot reach 6
    },
    // The radar variants — the aim-attack archetypes' predictive siblings.
    // Base attacks punish a still player; a predicted attack punishes CONSTANT
    // VELOCITY, so the counter inverts: change velocity during the telegraph.
    // The prediction is latched exactly once, at telegraph/windup/lockon start
    // — the same honesty rule every base attack keeps.
    radar: {
      leadScale: 1,     // 0..1.5 — fraction of the computed lead actually taken
      deadband: 0.3,    // px/tick — below it a ship reads as still and radar aim
                        // collapses to the base bearing, so the variant is
                        // legible only through motion
      missileTurn: 0.010, // rad/tick for the RADAR missile only — the predicted
                        // launch bearing spends less of the heading budget the
                        // base 0.020 was tuned around, so this starts at half
                        // and slides to 0 (pure ballistic predictor)
    },
    // The shield — the roster's FACING axis. prefer 0 makes the shared
    // ring-hold code close forever, and maxSpeed below the ship's 2.0 means it
    // can always be escaped: its threat is that it is standing where you
    // wanted to be. engage 0 is no attack mode at all — contact is its whole
    // offense. turnRate is what makes the shield a skill check instead of a
    // wall: a player at 2.0 px/tick has angular rate 2.0/dist about the body,
    // so the player out-turns 0.015 rad/tick inside 133 px and cannot flank it
    // beyond that. Get close to get around it — and close is where its contact
    // damage lives.
    anvil: {
      r: 11, hp: 9, maxSpeed: 1.2, steer: 0.04, prefer: 0, band: 0, backSpeed: 0,
      sepR: 52, engage: 0, orbDrop: 3,
      turnRate: 0.015,       // rad/tick — 0.86°/tick, the only body that does not snap
      arc: (70 * Math.PI) / 180, // HALF-angle: a ±70° frontal shield, 140° of cover
      flee: 200,             // flanked and inside this, it thrusts along its OWN facing
                             // instead of closing — it cannot escape a 2.0 px/tick
                             // ship, so the kill is never denied; the flank just
                             // becomes a moving problem that drags across the field
    },
    // The bomb — the roster's DEATH TIME axis. No attack but contact; the
    // whole threat is the burst the player themself triggers, which is what
    // makes the kill a decision instead of a reflex.
    husk: {
      r: 13, hp: 6, maxSpeed: 0.9, steer: 0.03, prefer: 0, band: 0, backSpeed: 0,
      sepR: 58, engage: 0, orbDrop: 1,
      split: 3,              // shards dealt on a seeded fan at the death point
      kick: 2.2,             // px/tick of outward velocity on each shard
      push: 0.6,             // fraction of r each shard starts out from the centre
    },
    // The husk's payload, never a wave-schedule type: shards carry no split
    // field, so there is no recursion to bound. Faster than the player's 2.0 on
    // purpose — they must be shot, not outrun.
    shard: {
      r: 5, hp: 2, maxSpeed: 2.9, steer: 0.09, prefer: 0, band: 0, backSpeed: 0,
      sepR: 22, engage: 0, orbDrop: 1,
    },
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
    seatGap: 48,
    // physical ship-body contact costs the player one hull; the enemy side of
    // the same event pays BDMG (one bullet) and is paced by the CONTACTCD
    // tuner, so ramming stays a real tactic without melting a body in a
    // handful of overlapping ticks
    contact: { dmgToPlayer: 1 },
    orb: { r: 3, drift: 1.1, damp: 0.94, attract: 72, pull: 0.55, vmax: 7, pickup: 12,
           clearPull: 3, clearVmax: 24 }, // the cleared-banner sweep: pull/speed strong
                                          // enough to bank any orb in the world within
                                          // the clearHold window, so a wave's income is
                                          // fully in the wallet before its shop opens
    spawnGap: 48,            // px outside the camera rectangle
    minPlayerDist: 90,       // an enemy never appears closer to the player
    clearHold: 480,          // ticks of inter-wave break. NOT the banner's life:
                             // the WAVE CLEAR card retires on its own 210-tick
                             // clock (bannerHold), so the celebration and the
                             // break are two different numbers — retune this one
                             // and the card does not stretch with it. Sweep
                             // floor: the orb magnet needs ~206 ticks to bank
                             // the world diagonal, so 480 leaves 274 ticks of
                             // margin where 210 left 4.
  };

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
    { name: "AFTERBURNER", desc: "max speed +1.0 px/tick", base: 4, curve: "double",
      icon: "afterburner.png" },  // uncapped — the doubling price is the brake
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
  //   speed  — ADDITIVE px/tick on VMAX: 1.0 × AFTERBURNER rank, uncapped
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
      speed: rk("AFTERBURNER"),
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
  function emit(kind, at, gain, seat, termSeq) {
    EVENTS.push({ kind, at: at ? { x: at.x, y: at.y } : null, gain, seat,
                  ...(termSeq !== undefined ? { termSeq } : {}) });
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
  // shards AND game.js's bullets — a replication layer keys by id alone and
  // cannot disambiguate by owning array. An id is never reused: shards take
  // fresh ids and the dead husk's id retires with it.
  let nextEntityId = 1;
  const nextId = () => nextEntityId++;

  // ---- wave scaling — pure functions of the wave number ------------------
  // countsFor/statsFor/waveGroups read only ECFG constants: the same wave
  // number always deals the same schedule and the same stats. startWave
  // resolves statsFor ONCE into E.stats and spawnEnemy stamps that object
  // onto each body, so nothing reads a mutated global mid-wave.
  // One new idea per wave with a wave of air between it and the last: W1
  // darts alone (untouched), W2 the harrier — the first ranged threat, by
  // itself, against a schedule the player has already learned — W3 the
  // charger, W4 the husk, W5 the anvil. Every archetype debuts as a SINGLE
  // body, so its behavior is legible before it is multiplied.
  function countsFor(wave) {
    return {
      darts: Math.min(5 + 2 * (wave - 1), 21),
      chargers: wave >= 3 ? Math.min(1 + Math.floor((wave - 3) / 2), 4) : 0,
      harriers: wave >= 2 ? Math.min(1 + Math.floor((wave - 2) / 3), 3) : 0,
      husks: wave >= 4 ? Math.min(1 + Math.floor((wave - 4) / 4), 2) : 0,
      anvils: wave >= 5 ? Math.min(1 + Math.floor((wave - 5) / 4), 2) : 0,
      // the radar variants seed SPARSELY, each two waves after its parent has
      // taught the base read: the lead is only legible against the aim it varies
      radarDarts: wave >= 2 ? Math.min(1 + Math.floor((wave - 2) / 3), 3) : 0,
      radarHarriers: wave >= 4 ? Math.min(1 + Math.floor((wave - 4) / 4), 2) : 0,
      radarChargers: wave >= 5 ? Math.min(1 + Math.floor((wave - 5) / 4), 2) : 0,
    };
  }

  // The one rotation the whole file REPORTS types by: snapState's byType and
  // the state hash both walk it, so its order is a committed contract and the
  // radar single stays beside its parent here. shard is absent on purpose — it
  // is the husk's payload, never scheduled.
  const ROTATION = ["dart", "harrier", "radarHarrier", "charger", "radarCharger", "husk", "anvil"];
  // The DEAL order is a separate question, and the answer is not the report
  // order. A wave interleaves its ordinary archetypes through the body of the
  // schedule and CLOSES on the radar variants: the player reads what each
  // archetype does first, then meets the sibling that leads its shot as the
  // wave's last beat. The two radar heavies alternate so a pair never lands
  // back to back, and the radarDart rides the LAST dart packs (see waveGroups).
  const DEALFIRST = ["dart", "harrier", "charger", "husk", "anvil"];
  const DEALLAST = ["radarHarrier", "radarCharger"];
  // ...and the full roster, which is the rotation plus the bodies that are
  // never their own scheduled group: the husk's shard payload, and the
  // radarDart, which replaces a member inside a dart pack. This is the
  // membership test spawnEnemy uses, so an unknown name can never reach
  // E.stats through the prototype chain.
  const ROSTER = ROTATION.concat("shard", "radarDart");

  function statsFor(wave) {
    const hpBonus = Math.min(Math.floor((wave - 1) / 3), 4); // +1 hull every third wave, capped
    const mul = Math.min(1 + 0.08 * (wave - 1), 2); // shared speed multiplier — the cap doubles the base
    // the parent entries resolve first as consts, so the radar variants below
    // can derive from them instead of re-stating a curve they must never drift from
    const dart = {
        r: ECFG.enemy.r,
        hp: ECFG.enemy.hp + hpBonus, // 2..6 — the hpBonus cap bounds it
        maxSpeed: ECFG.enemy.maxSpeed * mul, // 2.4..4.8
        steer: ECFG.enemy.steer, prefer: ECFG.enemy.prefer, band: ECFG.enemy.band,
        backSpeed: ECFG.enemy.backSpeed, sepR: ECFG.enemy.sepR,
        cooldown: Math.max(72, Math.round(ECFG.lance.cooldown * Math.pow(0.95, wave - 1))),
        engage: ECFG.lance.engage, // every type carries an engage, 0 meaning "no attack
                                   // mode" — that is what lets stepEnemy ask P.engage
                                   // instead of type-testing for a range
        orbDrop: 1, // a dart still drops exactly one orb at every wave
    };
    const charger = {
        r: ECFG.charger.r,
        hp: ECFG.charger.hp + hpBonus,
        maxSpeed: ECFG.charger.maxSpeed * mul,
        steer: ECFG.charger.steer, prefer: ECFG.charger.prefer, band: ECFG.charger.band,
        backSpeed: ECFG.charger.backSpeed, sepR: ECFG.charger.sepR,
        rest: Math.max(54, Math.round(ECFG.charger.rest * Math.pow(0.95, wave - 1))),
        engage: ECFG.charger.engage,
        orbDrop: 2, // the heavier body pays out double
    };
    // the same two scaling rules as above — hp + hpBonus, maxSpeed × mul —
      // govern the whole roster, so no type ever needs its own curve. The
      // launcher's CADENCE shortens on the dart's 0.95^(wave-1) curve; the
      // missile it fires does not scale at all (see ECFG.missile).
      // The three new archetypes scale in HP and CADENCE only — their speeds
      // are wave-invariant, on the same rule the shard and the missile follow
      // and for the same reason the charger's dashSpeed never moved: a speed
      // that a fairness claim rests on must not expire. Each of these three
      // makes such a claim. The harrier's whole read is that it flees FASTER
      // than it closes (crowd it and it runs), and the shared multiplier scales
      // maxSpeed while leaving backSpeed alone, so the kite would invert at wave 4
      // and the body would outrun the ship at wave 10. The anvil promises you
      // can always walk away from it; at 1.2 × mul it out-paces a 2.0 px/tick
      // ship from wave 10 and becomes a shielded body you cannot escape OR
      // shoot from the front. The dart and the charger still carry the roster's
      // speed escalation, exactly as they always did — that curve is untouched.
    const harrier = {
        r: ECFG.harrier.r,
        hp: ECFG.harrier.hp + hpBonus,
        maxSpeed: ECFG.harrier.maxSpeed, // invariant — see above
        steer: ECFG.harrier.steer, prefer: ECFG.harrier.prefer, band: ECFG.harrier.band,
        backSpeed: ECFG.harrier.backSpeed, sepR: ECFG.harrier.sepR,
        engage: ECFG.harrier.engage,
        cooldown: Math.max(90, Math.round(ECFG.harrier.cooldown * Math.pow(0.95, wave - 1))),
        orbDrop: ECFG.harrier.orbDrop,
    };
    return {
      dart, charger, harrier,
      // The radar variants: the SAME body — every stat the parent resolved,
      // by reference to the const above, never re-derived — except orbDrop
      // (+1, the smarter aim pays a little more) and the two markers behavior
      // code reads. `base` is how shared code resolves the archetype; `radar`
      // is the aim switch. No hp or speed bump on purpose: the threat must be
      // the aim, and a stat bump would blur that read.
      radarDart: { ...dart, orbDrop: dart.orbDrop + 1, radar: true, base: "dart" },
      radarCharger: { ...charger, orbDrop: charger.orbDrop + 1, radar: true, base: "charger" },
      radarHarrier: { ...harrier, orbDrop: harrier.orbDrop + 1, radar: true, base: "harrier" },
      anvil: {
        r: ECFG.anvil.r,
        hp: ECFG.anvil.hp + hpBonus,
        maxSpeed: ECFG.anvil.maxSpeed, // invariant — 1.2 stays well under the ship's
                                       // 2.0 forever, which is the promise the whole
                                       // archetype rests on: you can always leave
        steer: ECFG.anvil.steer, prefer: ECFG.anvil.prefer, band: ECFG.anvil.band,
        backSpeed: ECFG.anvil.backSpeed, sepR: ECFG.anvil.sepR,
        engage: ECFG.anvil.engage, // 0 — contact is its whole offense
        turnRate: ECFG.anvil.turnRate, // the presence of this field is what makes a
        arc: ECFG.anvil.arc,           // body turn instead of snap, and carry a shield
        flee: ECFG.anvil.flee,
        orbDrop: ECFG.anvil.orbDrop,
      },
      husk: {
        r: ECFG.husk.r,
        hp: ECFG.husk.hp + hpBonus,
        maxSpeed: ECFG.husk.maxSpeed, // invariant — the husk's threat is the burst,
                                      // and choosing WHERE to pop it is only a choice
                                      // while the drifter is slower than the ship
        steer: ECFG.husk.steer, prefer: ECFG.husk.prefer, band: ECFG.husk.band,
        backSpeed: ECFG.husk.backSpeed, sepR: ECFG.husk.sepR,
        engage: ECFG.husk.engage,
        split: ECFG.husk.split, // the presence of this field is what makes a body burst
        orbDrop: ECFG.husk.orbDrop,
      },
      // shards come from statsFor too, so a husk that dies on wave 9 bursts
      // into wave-9 shards — scaled in hp, deliberately NOT in speed: the
      // charger's dashSpeed set the precedent that a dodge stays fair forever.
      shard: {
        r: ECFG.shard.r,
        hp: ECFG.shard.hp + hpBonus,
        maxSpeed: ECFG.shard.maxSpeed,
        steer: ECFG.shard.steer, prefer: ECFG.shard.prefer, band: ECFG.shard.band,
        backSpeed: ECFG.shard.backSpeed, sepR: ECFG.shard.sepR,
        engage: ECFG.shard.engage,
        orbDrop: ECFG.shard.orbDrop,
      },
    };
  }

  // The spawn queue for a wave, in wave ticks (60 Hz). Wave 1 is the
  // hand-tuned slice schedule, byte-identical to the original vertical
  // slice; later waves split their dart count into packs of three, land every
  // heavy alone, and INTERLEAVE the queues so a wave is a composition rather
  // than "all the darts, then all the heavies" — difficulty here comes from
  // what stands beside what, not from any single body. The interleave is a
  // pure function of the counts, so a wave still deals identically every run.
  function waveGroups(wave) {
    if (wave === 1) {
      return [
        { count: 3, type: "dart", warnAt: 36, spawnAt: 126 },   // warn at 0.6 s, land at 2.1 s
        { count: 2, type: "dart", warnAt: 810, spawnAt: 900 },  // second pack warns at 13.5 s, lands at 15 s
      ];
    }
    const n = countsFor(wave);
    const queues = { dart: [], harrier: [], radarHarrier: [], charger: [], radarCharger: [], husk: [], anvil: [] };
    for (let left = n.darts; left > 0; left -= 3) queues.dart.push({ count: Math.min(3, left), type: "dart" });
    for (let i = 0; i < n.harriers; i++) queues.harrier.push({ count: 1, type: "harrier" });
    for (let i = 0; i < n.chargers; i++) queues.charger.push({ count: 1, type: "charger" });
    for (let i = 0; i < n.husks; i++) queues.husk.push({ count: 1, type: "husk" });
    for (let i = 0; i < n.anvils; i++) queues.anvil.push({ count: 1, type: "anvil" });
    // the radar heavies land as singles like their parents; the radarDart is
    // never its own group — the LAST packs each carry ONE, as member 0, so the
    // body wearing the cyan ring leads a pack the player meets late in the
    // wave. Deterministic, and no rand() consumed.
    for (let i = 0; i < n.radarHarriers; i++) queues.radarHarrier.push({ count: 1, type: "radarHarrier" });
    for (let i = 0; i < n.radarChargers; i++) queues.radarCharger.push({ count: 1, type: "radarCharger" });
    for (let i = 0; i < Math.min(n.radarDarts, queues.dart.length); i++) {
      queues.dart[queues.dart.length - 1 - i].radar = 1;
    }
    // round-robin over the ordinary types, one group per non-empty queue per
    // pass. The total bounds the loop, so a queue running dry can never spin it.
    const total = DEALFIRST.reduce((s, t) => s + queues[t].length, 0);
    const groups = [];
    for (let pass = 0; groups.length < total; pass++) {
      for (const t of DEALFIRST) if (queues[t][pass]) groups.push(queues[t][pass]);
    }
    // ...then the radar tail closes the wave, alternating between the two
    // heavies. Same round-robin, same determinism — a different queue set.
    const tail = DEALLAST.reduce((s, t) => s + queues[t].length, 0);
    for (let pass = 0; groups.length < total + tail; pass++) {
      for (const t of DEALLAST) if (queues[t][pass]) groups.push(queues[t][pass]);
    }
    // the pitch bounds a wave's LENGTH as its group count grows: few groups
    // keep today's exact 5 s spacing, while an 18-group late wave tightens to
    // 2.5 s instead of running a minute and a half. The 90-tick warning and
    // the 126-tick first-spawn offset are untouched.
    const pitch = Math.max(150, Math.min(300, Math.round(1800 / groups.length)));
    return groups.map((g, k) => ({ count: g.count, type: g.type, radar: g.radar, warnAt: 126 + pitch * k - 90, spawnAt: 126 + pitch * k }));
  }

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
             owned: SHOP.map(() => 0), termSeq: 0 };
  }
  const E = {
    state: "idle", // idle | warning | active | cleared | dead (every seat down
                   // with no respawn pending — reachable only under the
                   // quarter rule; open play cycles the first four forever)
    wave: 1,
    waveTick: 0,
    groups: [],
    stats: null,   // this wave's resolved statsFor object — startWave deals it
    enemies: [],
    missiles: [], // live seeker missiles — a projectile family the encounter owns
                  // outright, wholly separate from G.bullets
    orbs: [],
    seats: players.map(() => makeSeat()), // one record per seat, index = seat id;
                                          // restart() keeps it in step with players[]
    // (owned moved onto each seat record — E.owned below delegates to seat 0,
    //  a TEST-surface alias now; the panel reads localSeatRec().owned)
    shopHover: -1,               // the shop-panel card under the pointer, or -1 — the ONE piece
                                 // of shop input state, read by the draw, the detail line and
                                 // the hover art alike, so they cannot disagree inside a frame
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
  // already sends every tick — the fire edge. game.js latches `fp` into the
  // seat's own input bank at the drain (and clears every bank once the tick is
  // over), so this read is deterministic at encStep time and costs no new wire
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
  function reseatSeat(s) {
    const S = E.seats[s];
    if (!S || !S.absent) return;
    S.absent = false;
    S.claimT = ECFG.player.claim;
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
  function recordPoseRow() {
    poseLog.push({
      t: simTick, // diagnostic stamp — the wave-boundary contiguity leg pins
                  // rows one tick apart; rowForAge still addresses relatively
      ships: players.map((pl, s) => ({ x: pl.ship.x, y: pl.ship.y,
                                       alive: seatAlive(s) })),
      // vx,vy ride every row (corrective pass 2): a live-class (projected)
      // body's rebated sweep reconstructs the PRESENTED pose from its era
      // pose and era velocity — the frozen-NOW form was an aim assist
      enemies: E.enemies.map((e) => ({ id: e.id, x: e.x, y: e.y, r: e.r,
                                       vx: e.vx, vy: e.vy,
                                       live: LIVE_SWEEP[e.mode] ? 1 : 0 })),
      missiles: E.missiles.map((m) => ({ id: m.id, x: m.x, y: m.y, r: m.r })),
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
  const queuedCount = () => E.groups.reduce((n, g) => n + (g.spawned ? 0 : g.count), 0);
  // Prices derive from the BUYING seat's own rank — two seats holding
  // different ranks read different prices for the same row. The seat
  // defaults to localSeat(), which is what every panel/label caller means:
  // seat 0 in local play and on the server, the granted seat in net mode.
  // The sim and the wire encoder always pass an explicit seat.
  const rankAt = (i, seat) => { const S = E.seats[seat]; return S ? S.owned[i] : 0; };
  const shopCost = (i, seat = localSeat()) => SHOP[i].curve === "double" ? SHOP[i].base * Math.pow(2, rankAt(i, seat)) : SHOP[i].base;
  const shopMaxed = (i, seat = localSeat()) => SHOP[i].cap !== undefined && rankAt(i, seat) >= SHOP[i].cap;
  // What a row COSTS, as the player reads it. Both places that print a price —
  // the gutter card and the field hover panel — call this, so the two cannot
  // disagree: a row that says MAXED on its card must not say "64 XP" on the
  // panel naming that same card.
  const shopPriceLabel = (i, seat = localSeat()) =>
    shopMaxed(i, seat) ? "MAXED"
    : (!SHOP[i].can || SHOP[i].can(seat)) ? shopCost(i, seat) + " XP"
    : "—";

  // The nearest LIVING seat to a point, or -1 when every seat is down.
  // Ascending scan with a strict < keeps the settled tie-break: two ships
  // exactly equidistant resolve to the lower seat id, deterministically.
  function nearestSeat(x, y) {
    let best = -1;
    let bd = Infinity;
    for (let s = 0; s < players.length; s++) {
      if (!seatAlive(s)) continue;
      const p = players[s].ship;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
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

  // signed difference between two bearings, always in (−π, π]. atan2 of the
  // sine and cosine rather than subtract-and-wrap: there is no ±π seam to get
  // wrong, which is where the single most common heading bug lives. The
  // anvil's facing and its shield arc both read this.
  function angDiff(a, b) {
    const d = a - b;
    return Math.atan2(Math.sin(d), Math.cos(d));
  }

  // Predicted-intercept aim for a radar body: advance the ship through the
  // attack's fixed delay, then (for a real projectile) solve the intercept
  // quadratic |rel + vel·t| = speed·t and take the smallest positive root.
  // Falls back to the pure-pursuit time when no positive root exists (a
  // faster-than-projectile or receding ship). Pure arithmetic on live state —
  // no rand(), no clock — and clamped into the world so a lead can never
  // point at a spot the ship cannot occupy.
  function predictAim(e, delayTicks, projSpeed) {
    const R = ECFG.radar;
    // the latch tracks the body's CHOSEN target (e.tgtSeat); a caller without
    // one — the __test hook hands in bare {x, y} probes — falls back to the
    // nearest living ship, which is what a fresh body would have chosen
    const tgt = (e.tgtSeat >= 0 && seatAlive(e.tgtSeat) ? players[e.tgtSeat] : null) ||
                targetPlayer(e.x, e.y);
    if (!tgt) return { a: e.face || 0, x: e.x, y: e.y }; // all dead — hold the bearing, never throw
    let vx = tgt.vel.x, vy = tgt.vel.y;
    if (Math.hypot(vx, vy) < R.deadband) { vx = 0; vy = 0; }
    vx *= R.leadScale; vy *= R.leadScale;
    let tx = tgt.ship.x + vx * delayTicks;
    let ty = tgt.ship.y + vy * delayTicks;
    if (projSpeed > 0 && (vx || vy)) {
      const rx = tx - e.x, ry = ty - e.y;
      const a = vx * vx + vy * vy - projSpeed * projSpeed;
      const b = 2 * (rx * vx + ry * vy);
      const c = rx * rx + ry * ry;
      let t = -1;
      if (Math.abs(a) < 1e-9) { if (b < 0) t = -c / b; }
      else {
        const disc = b * b - 4 * a * c;
        if (disc >= 0) {
          const sq = Math.sqrt(disc);
          const t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
          t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
        }
      }
      if (!(t > 0)) t = Math.hypot(rx, ry) / projSpeed; // pure-pursuit fallback
      tx += vx * t; ty += vy * t;
    }
    tx = Math.max(SHIP_R, Math.min(WW - SHIP_R, tx));
    ty = Math.max(SHIP_R, Math.min(WH - SHIP_R, ty));
    return { a: Math.atan2(ty - e.y, tx - e.x), x: tx, y: ty };
  }

  // ---- spawning ----------------------------------------------------------
  // One anchor per group, dealt on an edge of a view-sized DEALING RECTANGLE
  // centred on the target ship, spawnGap px outside it, clamped into the
  // world and held off the player. The rectangle is FW×FH and world-clamped
  // exactly as the camera clamp was, so edge-of-world spawn distances stay
  // fair — but it is a dealing construct anchored on a SHIP, never the render
  // camera: the sim deals the same spawns with no camera at all.
  function rollAnchor(owner) {
    const gap = ECFG.spawnGap;
    // the wave's OWNER anchors the deal: the rectangle is that seat's own
    // FW×FH view rect, world-clamped, so the group lands OFF-SCREEN FROM THE
    // OWNER — the per-player-waves decision. With one seat this is the seat
    // the old targetPlayer always answered, byte for byte.
    const s = players[owner >= 0 && players[owner] ? owner : 0].ship;
    const rx = Math.max(0, Math.min(WW - FW, s.x - FW / 2));
    const ry = Math.max(0, Math.min(WH - FH, s.y - FH / 2));
    for (let tries = 0; tries < 24; tries++) {
      const edge = Math.floor(rand() * 4);
      const t = rand();
      let x, y;
      if (edge === 0) { x = rx - gap; y = ry + t * FH; }
      else if (edge === 1) { x = rx + FW + gap; y = ry + t * FH; }
      else if (edge === 2) { x = rx + t * FW; y = ry - gap; }
      else { x = rx + t * FW; y = ry + FH + gap; }
      const c = clampWorld(x, y);
      // a rectangle pinned against a world wall clamps this edge's candidate
      // back INSIDE it — reject it, another edge always has room
      const inRect = c.x > rx && c.x < rx + FW && c.y > ry && c.y < ry + FH;
      // the hold-off is against the NEAREST living ship: if the nearest one
      // clears the ring, every ship does — "held off all living ships"
      const tgt = targetPlayer(c.x, c.y);
      if (!inRect && (!tgt || Math.hypot(c.x - tgt.ship.x, c.y - tgt.ship.y) >= ECFG.minPlayerDist + ECFG.enemy.jitter)) return c;
    }
    // no candidate — the owner's own position stands in
    return clampWorld(s.x + ECFG.minPlayerDist + ECFG.enemy.jitter + ECFG.spawnGap, s.y);
  }

  function rollGroupPoints(count, owner) {
    const anchor = rollAnchor(owner === undefined ? 0 : owner);
    const pts = [];
    for (let i = 0; i < count; i++) {
      const p = clampWorld(anchor.x + (rand() * 2 - 1) * ECFG.enemy.jitter,
                           anchor.y + (rand() * 2 - 1) * ECFG.enemy.jitter);
      pts.push(p);
    }
    return { anchor, pts };
  }

  // The ONE body constructor. spawnEnemy runs it after the scheduled push-out;
  // the husk's split runs it directly, because a burst is not a spawn.
  function makeBody(x, y, kind, i, vx, vy, owner) {
    const st = E.stats[kind];
    // the body's OPENING target: a wave-owned spawn aggros its wave's owner
    // and holds it for the owner-lock window (the user's ≥2 s rule); an
    // unowned body (shards, direct test spawns) takes the nearest living
    // ship with no lock. All three aggro fields are HASHED simulation state.
    const owned = owner !== undefined && owner >= 0 && seatAlive(owner);
    const tgtSeat = owned ? owner : nearestSeat(x, y);
    const tgt = tgtSeat >= 0 ? players[tgtSeat] : null; // the anvil opens facing its chosen target
    E.enemies.push({
      id: nextId(), // identity, not simulation state — the hash allow-list ignores it
      x, y, vx: vx || 0, vy: vy || 0, r: st.r, hp: st.hp, type: kind,
      tgtSeat,                             // the CHOSEN seat, or -1 with all dead
      aggroT: owned ? ECFG.aggro.ownerLock : 0, // commitment ticks left on that choice
      lastAtk: -1,                         // the most recent seat that damaged this body
      stats: st,      // the resolved per-wave stats ride on the body — a live
                      // enemy keeps them even after the wave clock moves on
      orbDrop: st.orbDrop,
      mode: "seek", // seek | tele | pulse (dart) — seek | windup | dash | tired
                    // (charger) — seek | lockon (harrier); the shieldless drifters
                    // and the shards never leave seek at all
      cd: 30 + (i || 0) * 24, // staggered first attacks — the pack never sync-fires
      t: 0,
      // a body that TURNS instead of snapping (the anvil) must not open the
      // fight facing +x while its shield is what the player has to read, so it
      // is dealt already looking at the ship; everything else overwrites face
      // on its first seek tick anyway and keeps the old 0
      face: st.turnRate && tgt ? Math.atan2(tgt.ship.y - y, tgt.ship.x - x) : 0,
      lockA: 0, flash: 0, pulseHit: false, dashHit: false,
      predT: 0, // ticks left on a radar latch's ping at (predX, predY) — drawing only
      contactCd: 0, // ticks left before this body can take contact damage again
      contactTaken: false, // this body already paid a contact THIS tick — cleared in stepEnemy
    });
  }

  function spawnEnemy(x, y, i, type, owner) {
    // an unnamed or unknown type is a dart, which is what keeps every 3-arg
    // call in the suites and in this file spawning exactly what it always did.
    // Membership is tested against the ROSTER, never with a bare `E.stats[type]`
    // read: that read walks Object.prototype, so "constructor", "toString" and
    // "__proto__" would all answer truthy and stamp a body whose hp, r and
    // steer are undefined — NaN coordinates on the next tick and a phantom kill
    // on the one after. Production only ever passes a roster name; the __test
    // hook is open to anything.
    const kind = ROSTER.includes(type) ? type : "dart";
    const st = E.stats[kind];
    // never on a ship — push out to the minimum ring against EVERY living
    // seat, ascending, so a spawn can land in no one's lap. With one seat
    // this is exactly the old single push-out.
    for (let s = 0; s < players.length; s++) {
      if (!seatAlive(s)) continue;
      const ship = players[s].ship;
      let dx = x - ship.x;
      let dy = y - ship.y;
      let d = Math.hypot(dx, dy);
      if (d < ECFG.minPlayerDist) {
        if (d < 0.001) { dx = 1; dy = 0; d = 1; }
        const c = clampWorld(ship.x + (dx / d) * ECFG.minPlayerDist,
                             ship.y + (dy / d) * ECFG.minPlayerDist, st.r);
        x = c.x;
        y = c.y;
      }
    }
    makeBody(x, y, kind, i, 0, 0, owner);
  }

  function spawnGroup(g) {
    if (!g.points) g.points = rollGroupPoints(g.count, g.owner);
    // a radar-stamped pack deals its variant as member 0 — the pack leader
    // wearing the cyan ring is the first thing the pack shows
    g.points.pts.forEach((p, i) => spawnEnemy(p.x, p.y, i, g.radar && i === 0 ? "radarDart" : g.type, g.owner));
  }

  // ---- combat ------------------------------------------------------------
  // hitPlayer takes NO damage source any more. It used to: a seat NUMBER
  // meant another player dealt the blow, and the death branch read it to
  // decide whether the victim paid the toll — a PvP kill took the score and
  // the purchases, a PvE death took neither. The user reversed that rule, so
  // the toll is unconditional and the parameter had exactly zero readers
  // left; it is deleted rather than kept as a lie the doc block would have
  // to explain. `src` still travels where it is still READ — blastAt's splash
  // attribution and an enemy's `lastAtk` (the rebate queue carries it for
  // both) — and nothing on the wire has ever said why a seat died, which is
  // what lets the client draw one neutral down card for every death.
  function hitPlayer(seat, dmg) {
    const S = E.seats[seat];
    if (!S || S.hull <= 0) return false; // a dead seat cannot be hit again — respawn revives it
    // COMET MODE negates ALL incoming damage: no hull loss, no i-frame
    // consumption, no hitFlash — the refusal reads exactly like a graced hit
    // to every caller (the lance keeps sweeping, a missile still detonates).
    // cometActive is game.js's read of the seat's hashed comet flag.
    // The negation is WORK, so it bills COMETHIT — one half of the same knob
    // contactEvent's ram pays, and inert at the shipped 0.
    if (cometActive(seat)) { energySpend(seat, COMETHIT); return false; }
    if (S.invuln > 0 || E.state === "dead") return false;
    S.hull -= dmg;
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
    emit(S.hull <= 0 ? "death" : "hurt", players[seat].ship, undefined, seat);
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
    S.hullMax = ECFG.player.hull;
    const c = clampWorld(players[seat].ship.x, players[seat].ship.y, ECFG.orb.r);
    for (let k = 0; k < PVPORBS; k++) {
      const a = rand() * Math.PI * 2; // each drop dealt its own drift, exactly as reapDead deals one
      E.orbs.push({ id: nextId(), x: c.x, y: c.y, vx: Math.cos(a) * ECFG.orb.drift, vy: Math.sin(a) * ECFG.orb.drift });
    }
  }

  // One mutual contact event — the single primitive every physical ship-body
  // touch routes through (the generic overlap sweep and the charger's dash
  // connect alike; the lance is a beam, not a body, and stays a bare
  // hitPlayer). The two sides are gated INDEPENDENTLY: the player side keeps
  // the i-frame rules inside hitPlayer, while the enemy side pays one bullet
  // (BDMG) whenever its own contact cooldown has expired. That is deliberate —
  // an i-framed ram still bites every body it sweeps through, which is the
  // point of a melee tactic; CONTACTCD, not the gate structure, is the knob
  // that paces it, and no caller may hang the PLAYER side off the body's
  // cooldown — that would make an enemy-facing slider a hidden invulnerability.
  // The enemy side is claimed per tick as well as per window: contactCd alone
  // cannot mark the claim, because CONTACTCD is dialable to 0 and a 0 stamp is
  // indistinguishable from "free", which would let a dash connect bill itself
  // twice on one tick (stepEnemy's dash sweep, then resolveContacts).
  // Returns whether the PLAYER took the hit, so the dash's one-hit-per-lunge
  // flag keeps its exact old meaning.
  function contactEvent(e, dmgToPlayer, seat) {
    const playerHit = hitPlayer(seat, dmgToPlayer);
    if (e.contactCd <= 0 && !e.contactTaken) {
      // a comet-mode touch is the comet's own weapon: COMETDMG instead of the
      // one-bullet BDMG — and OVERLOAD makes a DRAINING comet bite harder, the
      // rank's fraction paid out linearly as the pool empties. The cd/claim
      // pacing is untouched: CONTACTCD still paces the windows, contactTaken
      // still claims the tick. The ram bills COMETHIT, the other half of the
      // knob hitPlayer's negation pays — 0 by default, so the comet is priced
      // by TIME and not by work until someone drags that slider.
      if (cometActive(seat)) {
        const fury = 1 + COMETFURY * termsFor(seat).fury * (1 - energyFrac(seat)); // the RAMMING seat's own rank
        e.hp -= COMETDMG * fury;
        energySpend(seat, COMETHIT);
      } else {
        e.hp -= BDMG;
      }
      e.flash = 8; // the same hit feedback a bullet gives
      // the two rates were welded together until now: the comet's bite rate is
      // what prices COMETHIT and pays OVERLOAD, so it gets its own knob and a
      // normal ram keeps CONTACTCD untouched. The stamps are read off the
      // constants independently — moving one must never move the other.
      e.contactCd = cometActive(seat) ? COMETCD : CONTACTCD;
      e.contactTaken = true; // one contact per body per tick, at every slider value —
                             // UNTOUCHED by the split, and it is what keeps a COMETCD of
                             // 0 from billing a dash connect twice on one tick
      e.lastAtk = seat; // a ram is damage — the aggro switch reads it at the next decision point
      E.contactsDealt++;
      // visual only — the burst sits on the body's surface facing the ship and
      // rides game.js's own hash stream, never the sim's seeded rand().
      // pl is the player who MADE the contact — never the enemy's chosen target
      const pl = players[seat];
      const cdx = e.x - pl.ship.x;
      const cdy = e.y - pl.ship.y;
      const cm = Math.hypot(cdx, cdy) || 1;
      spawnImpactFx(e.x - (cdx / cm) * e.r, e.y - (cdy / cm) * e.r, cdx / cm, cdy / cm, "enemy");
      // inside the claim block on purpose: the claim IS the damage edge, so a
      // sustained overlap sounds once per CONTACTCD window, never per tick.
      // The seat is the rammer's — the throttle keys it like fire's
      emit("hit", e, undefined, seat);
    }
    return playerHit;
  }

  // The aggro decision, taken ONLY at a decision point (a seek-mode tick) —
  // never mid-windup, mid-dash, mid-lock-on or mid-pulse, which is the whole
  // telegraph-honesty rule: a planted attack keeps the line it showed.
  // Rules, in order: a live committed target holds for its whole commitment
  // window; then the most recent attacker (damage aggro) wins if alive; then
  // the nearest living ship. Every actual switch opens a fresh commitment
  // window, so alternating shots from two seats can never flip-flop a body
  // faster than once per window. A dead target voids its commitment at once.
  function retargetAtDecision(e) {
    const curAlive = e.tgtSeat >= 0 && seatAlive(e.tgtSeat);
    if (curAlive && e.aggroT > 0) return; // committed — hold, whatever happened
    const atk = e.lastAtk >= 0 && seatAlive(e.lastAtk) ? e.lastAtk : -1;
    const want = atk >= 0 ? atk : nearestSeat(e.x, e.y);
    if (want !== e.tgtSeat) {
      e.tgtSeat = want;
      e.aggroT = want >= 0 ? ECFG.aggro.commit : 0;
    }
    e.lastAtk = -1; // the grievance is consumed at the decision, kept or not
  }

  function stepEnemy(e) {
    const P = e.stats;       // stamped at spawn — never a mutated mid-wave global
    const L = ECFG.lance;    // beam geometry — unchanged at every wave
    const CH = ECFG.charger; // lunge geometry — likewise constant
    if (e.flash > 0) e.flash--;
    if (e.predT > 0) e.predT--; // the ping fades on the sim clock, like flash —
                                // the draw path never mutates it
    if (e.contactCd > 0) e.contactCd--;
    if (e.aggroT > 0) e.aggroT--; // commitment is wall-tick time, telegraphs included
    e.contactTaken = false; // a fresh tick — this body's contact is unclaimed again
    if (e.mode === "seek") retargetAtDecision(e); // the ONE decision point
    // the body's CHOSEN target — headings and ranges only; the delivery
    // sweeps below take their own per-seat loops. With every seat down the
    // body has no target: it separates, damps and never attacks or throws.
    const tgt = targetOf(e);
    const dx = tgt ? tgt.ship.x - e.x : 0;
    const dy = tgt ? tgt.ship.y - e.y : 0;
    const dist = tgt ? Math.hypot(dx, dy) || 0.001 : 0.001;
    const ux = dx / dist;
    const uy = dy / dist;
    if (e.mode === "seek") {
      let tx = 0;
      let ty = 0;
      if (tgt) {
        const aim = Math.atan2(dy, dx);
        // a body carrying a turnRate ROTATES toward the player at that rate — it
        // is the one thing that makes a directional shield a skill check instead
        // of a wall — and everything else snaps, exactly as it always has
        e.face = P.turnRate ? e.face + Math.max(-P.turnRate, Math.min(P.turnRate, angDiff(aim, e.face))) : aim;
        // hold the preferred ring: approach outside it, back off inside it
        if (dist > P.prefer + P.band) { tx = ux * P.maxSpeed; ty = uy * P.maxSpeed; }
        else if (dist < P.prefer - P.band) { tx = -ux * P.backSpeed; ty = -uy * P.backSpeed; }
        // ...unless it has been FLANKED: a shielded body whose armored face has
        // been walked around thrusts along its OWN heading, forward and away,
        // instead of closing. It cannot escape a 2.0 px/tick ship, so this never
        // denies the kill — it keeps the flank a moving problem and drags the
        // fight across the field, into whatever else the wave dealt.
        if (P.flee > 0 && dist < P.flee && Math.abs(angDiff(aim, e.face)) > P.arc) {
          tx = Math.cos(e.face) * P.maxSpeed;
          ty = Math.sin(e.face) * P.maxSpeed;
        }
      }
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
      // the cap is the FASTER of the two gaits, not the approach one: the
      // harrier is the first body that retreats quicker than it closes, and a
      // flat maxSpeed cap would silently delete exactly the behavior that makes
      // it a kiter. Every body whose backSpeed is the slower of the two — dart
      // and charger both — sees the identical number it always saw.
      const cap = Math.max(P.maxSpeed, P.backSpeed);
      const tm = Math.hypot(tx, ty);
      if (tm > cap) { tx *= cap / tm; ty *= cap / tm; }
      e.vx += (tx - e.vx) * P.steer;
      e.vy += (ty - e.vy) * P.steer;
      if (e.cd > 0) e.cd--;
      // the range comes off the body's own stats — dart 130, harrier 200,
      // charger 240 — and a type whose engage is 0 (the anvil, the husk, the
      // shards) has no attack mode to enter at any distance
      else if (tgt && P.engage > 0 && dist <= P.engage) {
        // a radar variant behaves as its base archetype everywhere but the
        // latch itself: the bearing points at the predicted intercept instead
        // of the ship, computed ONCE, right here — never re-aimed during the
        // telegraph, the same honesty every base attack keeps
        const kin = P.base || e.type;
        const latch = (delay, projSpeed) => {
          if (P.radar) {
            const pr = predictAim(e, delay, projSpeed);
            e.lockA = pr.a;
            e.face = pr.a;        // the nose shows the lead — one more honest tell
            e.predX = pr.x; e.predY = pr.y; e.predT = 20; // the latch ping, drawing only
          } else {
            e.lockA = e.face;
          }
        };
        if (kin === "charger") { // rested and in range — plant to lunge
          e.mode = "windup";
          e.t = CH.windup;
          latch(CH.windup, CH.dashSpeed); // the dash line locks NOW, so the lunge
          e.dashHit = false;              // can be dodged; the dash IS the projectile
          // the tell starts the tick the line locks, so the sound and the
          // dodge window begin together — same deal as the dart's charge
          emit("windup", e);
        } else if (kin === "harrier") { // standoff and rested — plant to launch
          e.mode = "lockon";
          e.t = ECFG.harrier.lockon;
          latch(ECFG.harrier.lockon, ECFG.missile.speed); // the missile leaves on
                                    // THIS bearing, not the live one
          emit("lock", e); // a smaller sibling of windup — the
                           // same family, a lighter body
        } else { // in range and rested — plant and telegraph
          e.mode = "tele";
          e.t = L.telegraph;
          latch(L.telegraph, 0); // the lance direction locks here, so it can be
          e.pulseHit = false;    // dodged; the beam is instant at fire — no
                                 // intercept term, just the delay
          emit("charge", e);
        }
      }
    } else if (e.mode === "tele") {
      e.vx *= 0.8; // plant to fire — the telegraph stays honest
      e.vy *= 0.8;
      if (--e.t <= 0) { e.mode = "pulse"; e.t = ECFG.lance.pulse; emit("zap", e); }
    } else if (e.mode === "pulse") {
      e.vx *= 0.8;
      e.vy *= 0.8;
      if (!e.pulseHit) {
        const bx = e.x + Math.cos(e.lockA) * L.len;
        const by = e.y + Math.sin(e.lockA) * L.len;
        const rr = L.halfWidth + SHIP_R;
        // DELIVERY, not choice: the beam sweeps EVERY living ship, ascending
        // seat order, whoever the body was chasing — and each ship's own
        // travel is sampled too, so a top-slider-speed ship must not step
        // across the beam between two ticks untouched. One hit per pulse.
        for (let s = 0; s < players.length && !e.pulseHit; s++) {
          if (!seatAlive(s)) continue;
          const pl = players[s];
          const pv = prevOf(s);
          const n = Math.max(1, Math.ceil(Math.hypot(pl.ship.x - pv.x, pl.ship.y - pv.y) / rr));
          for (let k = 1; k <= n; k++) {
            const sx = pv.x + ((pl.ship.x - pv.x) * k) / n;
            const sy = pv.y + ((pl.ship.y - pv.y) * k) / n;
            if (segCircleHit(e.x, e.y, bx, by, sx, sy, rr)) {
              if (hitPlayer(s, L.dmg)) e.pulseHit = true; // one hit per pulse
              break;
            }
          }
        }
      }
      if (--e.t <= 0) { e.mode = "seek"; e.cd = P.cooldown; } // per-wave lance cadence
    } else if (e.mode === "lockon") {
      e.vx *= 0.85; // plant while the launch reticle brightens along lockA — the
      e.vy *= 0.85; // same sinking body the charger's windup shows
      if (--e.t <= 0) {
        launchMissile(e);   // exactly one missile per lock, on the latched angle
        e.mode = "seek";
        e.cd = P.cooldown;  // the cadence is paid whether or not the launch above
                            // was refused by the missile cap, so a capped harrier
                            // cannot spin the lock over and over
      }
    } else if (e.mode === "windup") {
      e.vx *= 0.85; // plant — the body sinks to rest while the intent line brightens
      e.vy *= 0.85;
      if (--e.t <= 0) { e.mode = "dash"; e.t = CH.dashTicks; emit("dash", e); }
    } else if (e.mode === "dash") {
      // constant-speed lunge along the LOCKED line — reassigned every tick
      // so no damping bleeds in; the wall clamp below can still end it
      e.vx = Math.cos(e.lockA) * CH.dashSpeed;
      e.vy = Math.sin(e.lockA) * CH.dashSpeed;
      if (!e.dashHit) {
        // ram contact sweeps BOTH motions, like the lance: the charger's own
        // movement segment against sampled positions along the ship's travel
        // — neither the dashing body nor a top-speed ship can tunnel through.
        // Delivery, not choice: the lunge bites ANY living ship on its lane,
        // ascending seat order, at most one registered hit per dash.
        const nx = e.x + e.vx;
        const ny = e.y + e.vy;
        const rr = e.r + SHIP_R;
        for (let s = 0; s < players.length && !e.dashHit; s++) {
          if (!seatAlive(s)) continue;
          const pl = players[s];
          const pv = prevOf(s);
          const n = Math.max(1, Math.ceil(Math.hypot(pl.ship.x - pv.x, pl.ship.y - pv.y) / rr));
          for (let k = 1; k <= n; k++) {
            const sx = pv.x + ((pl.ship.x - pv.x) * k) / n;
            const sy = pv.y + ((pl.ship.y - pv.y) * k) / n;
            if (segCircleHit(e.x, e.y, nx, ny, sx, sy, rr)) {
              // both sides pay: the player at most once per dash (dashHit), the
              // charger at most once per CONTACTCD window even though this sweep
              // keeps re-firing while the player is graced
              if (contactEvent(e, CH.dmg, s)) e.dashHit = true; // at most one hit per dash
              break;
            }
          }
        }
      }
      if (--e.t <= 0) { e.mode = "tired"; e.t = P.rest; }
    } else if (e.mode === "tired") {
      if (tgt) e.face = Math.atan2(dy, dx); // spent but watching — the body turns back
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

  // ---- the seeker missile -------------------------------------------------
  // The harrier's ordnance: a small, fast, lightly-homing body the encounter
  // owns end to end. It consumes NO randomness at all — every term below is
  // arithmetic on live state — so a wave replays identically whether a missile
  // flew, hit, was shot down or fizzled.
  //
  // The one constructor, shared by the launcher and the test hook, so a check
  // drives production code rather than a fixture. Returns the missile, or null
  // when the safety cap refuses it.
  function spawnMissile(x, y, a, radar) {
    const M = ECFG.missile;
    if (E.missiles.length >= M.max) return null;
    const m = {
      id: nextId(), // same id space as the bodies — see nextId
      x, y, vx: Math.cos(a) * M.speed, vy: Math.sin(a) * M.speed,
      r: M.r, hp: M.hp,
      age: 0,      // ticks flown — arm, decay and expiry all read this one clock
      trail: [],   // recent positions, newest last; drawing only
      radar: !!radar, // a radar launcher's round steers on ECFG.radar.missileTurn
                      // instead of the base turn — everything else is identical
    };
    E.missiles.push(m);
    return m;
  }

  // One missile leaves the rail on the angle the lockon LATCHED, not the live
  // bearing — the same honesty the lance and the dash keep, so the telegraph
  // can be sidestepped. It starts clear of the launcher's own hull so the
  // launch frame draws it at the muzzle rather than inside the body.
  function launchMissile(e) {
    const M = ECFG.missile;
    const off = e.r + M.r + 1;
    const m = spawnMissile(e.x + Math.cos(e.lockA) * off, e.y + Math.sin(e.lockA) * off, e.lockA, e.stats.radar);
    if (m) emit("launch", e); // positional, on the launcher — a
                              // harrier firing from the screen's
                              // edge is heard as well as seen
  }

  // Every way a missile ends, in one place: the list removal, the burst and
  // the cue can never disagree about which happened. `kind` is the fx look —
  // "enemy" for a detonation on the player, "wall" for the inert endings.
  function endMissile(i, kind, seat) {
    const m = E.missiles[i];
    E.missiles.splice(i, 1);
    const s = Math.hypot(m.vx, m.vy) || 1; // a UNIT heading, like every other fx
    spawnImpactFx(m.x, m.y, m.vx / s, m.vy / s, kind); // call site — the burst sprays
                                                       // back off the direction of travel
    // one cue per ending, however it ended: the audio table's boom is defined
    // as "a missile ending", and most endings are the player's own bullet
    // killing it — which is why it sits on the shot bus and not on foe.
    // `seat` is the seat the ending belongs to, handed in by the three call
    // sites that have one in scope — the ship struck, the bullet's shooter, the
    // rewound hit's source — so the cue rides THAT seat's throttle bucket like
    // hit/clang/kill/blast/wall do (6418a4e), and four players no longer share
    // one 70 ms bucket (boom's own gap in js/audio.js) for every missile that
    // comes apart. The two WALL endings (the boundary and the fuse) have only
    // the missile, hand undefined, and stay on the room-wide bucket — which in
    // SOLO play means a shoot-down and a fuse-out inside the same 70 ms now
    // both sound, one on the seat's bucket and one on the room's; intended,
    // they are two different endings. The audio-order trace pins (tick, kind)
    // only, so the seat moves no hash.
    emit("boom", m, undefined, seat);
  }

  // Steer, then move, once per tick. The rotation form is provably
  // speed-preserving and has no angle-wrap seam: homing changes HEADING only,
  // which is what keeps a 4 px/tick body readable.
  function stepMissiles() {
    const M = ECFG.missile;
    for (let i = E.missiles.length - 1; i >= 0; i--) {
      const m = E.missiles[i];
      const ttl = M.life - m.age;
      // 0 while arming (a straight opening segment is what makes the bearing
      // readable), full through the middle, then fading linearly to 0 over the
      // last decay ticks — the fuse tell and the anti-orbit fix in one term
      // the radar round's turn reads LIVE, so the tuner slider acts on missiles
      // already in flight; at 0 it is a pure ballistic predictor
      const turn = m.radar ? ECFG.radar.missileTurn : M.turn;
      const lim = m.age < M.arm ? 0 : ttl < M.decay ? turn * (ttl / M.decay) : turn;
      const tgt = targetPlayer(m.x, m.y); // homing tracks the nearest living ship —
                                          // ordnance is delivery, it holds no grudge
      if (lim > 0 && tgt) {
        const dx = tgt.ship.x - m.x;
        const dy = tgt.ship.y - m.y;
        const cross = m.vx * dy - m.vy * dx; // sign: which way to turn
        const dot = m.vx * dx + m.vy * dy;
        const ang = Math.atan2(cross, dot);  // signed, already wrapped
        const w = Math.max(-lim, Math.min(lim, ang));
        const cs = Math.cos(w);
        const sn = Math.sin(w);
        const nvx = m.vx * cs - m.vy * sn;
        const nvy = m.vx * sn + m.vy * cs;
        m.vx = nvx;
        m.vy = nvy;
      }
      m.trail.push({ x: m.x, y: m.y }); // sampled BEFORE the move, so the newest
      if (m.trail.length > M.trail) m.trail.shift(); // sample is the last frame drawn
      const nx = m.x + m.vx;
      const ny = m.y + m.vy;
      // swept contact against BOTH motions, exactly as the lance and the dash
      // do it: neither a 4 px/tick missile nor a top-slider ship may tunnel
      let struck = -1; // the seat the warhead met, or -1
      const rr = m.r + SHIP_R;
      // delivery over EVERY living ship, ascending — the first one on the
      // missile's segment eats it, whoever it was homing on
      for (let s = 0; s < players.length && struck < 0; s++) {
        if (!seatAlive(s)) continue;
        const pl = players[s];
        const pv = prevOf(s);
        const n = Math.max(1, Math.ceil(Math.hypot(pl.ship.x - pv.x, pl.ship.y - pv.y) / rr));
        for (let k = 1; k <= n; k++) {
          const sx = pv.x + ((pl.ship.x - pv.x) * k) / n;
          const sy = pv.y + ((pl.ship.y - pv.y) * k) / n;
          if (segCircleHit(m.x, m.y, nx, ny, sx, sy, rr)) { struck = s; break; }
        }
      }
      if (struck >= 0) {
        // the detonation is unconditional: an i-framed player still eats the
        // missile, because the grace is the PLAYER's and never the ordnance's
        hitPlayer(struck, M.dmg);
        m.x = nx;
        m.y = ny;
        endMissile(i, "enemy", struck); // the ship it hit is the seat the boom belongs to
        continue;
      }
      m.x = nx;
      m.y = ny;
      m.age++;
      if (m.x < 0 || m.x > WW || m.y < 0 || m.y > WH) {
        // dies AT the boundary, not wherever the overshoot landed, so the
        // burst sits on the wall the player watched it hit
        m.x = Math.max(0, Math.min(WW, m.x));
        m.y = Math.max(0, Math.min(WH, m.y));
        endMissile(i, "wall"); // no seat in scope — the boom takes the room bucket
      } else if (m.age >= M.life) {
        endMissile(i, "wall"); // a fuse running out is an inert thing coming
                               // apart — the burst is what confirms a dodge;
                               // no seat in scope here either, the room bucket
      }
    }
  }

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
  // bullet's damage, once. Enemies only: the player, the orbs and the missiles
  // are never touched by a blast, at any rank — a splash that swept ordnance
  // out of the air would quietly delete the harrier's whole threat.
  function blastAt(x, y, direct, dmg, attacker) {
    const R = blastRadius(attacker); // the SHOOTER's rank sizes the splash
    if (R <= 0) return;
    for (const e of E.enemies) {
      if (e === direct || e.hp <= 0) continue; // the direct hit already paid; a
                                               // corpse is reapDead's, not ours
      const dx = e.x - x;
      const dy = e.y - y;
      const reach = R + e.r; // the body CIRCLE has to intersect the blast, not its center
      if (dx * dx + dy * dy <= reach * reach) {
        e.hp -= dmg; // exactly one bullet-equivalent, exactly once per body per blast
        e.flash = 8;
        if (attacker !== undefined && attacker >= 0) e.lastAtk = attacker; // splash is damage — aggro reads it
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
  // says so: "uncapped — the doubling price is the brake"). Two comets
  // crossing at right angles miss each other outright under the attacker-only
  // sweep from 20 px of travel each per tick — AFTERBURNER rank 5, which is
  // 124 XP and an ordinary mid-run purchase, not a whale. The relative frame
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
        if (hitPlayer(v, COMETDMG * fury)) {
          energySpend(a, COMETHIT); // the ram half of the knob, mirroring contactEvent
          if (COMETCD > 0) cd[key] = COMETCD;
        } else if (cometActive(v)) {
          if (COMETCD > 0) cd[key] = COMETCD; // negated, not graced — stamp, or the
                                              // overlap re-bills COMETHIT every tick
        }
      }
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
      let hit = null;   // the enemy body, when a body is nearest
      let mi = -1;      // ...or the missile's index, when ordnance is
      let vs = -1;      // ...or the VICTIM SEAT, when another player's hull is
      for (const e of E.enemies) {
        if (e.hp <= 0) continue;
        const t = segCircleEntryT(b.px, b.py, b.x, b.y, e.x, e.y, e.r + b.r);
        if (t >= 0 && (bestT < 0 || t < bestT)) { bestT = t; hit = e; mi = -1; vs = -1; }
      }
      for (let i = 0; i < E.missiles.length; i++) {
        const m = E.missiles[i];
        const t = segCircleEntryT(b.px, b.py, b.x, b.y, m.x, m.y, m.r + b.r);
        if (t >= 0 && (bestT < 0 || t < bestT)) { bestT = t; hit = null; mi = i; vs = -1; }
      }
      // ...and the PvP class. A seat never shoots itself (v !== shooter), and
      // an UNOWNED bullet reaches no ship at all — the shooter < 0 continue
      // above already dropped it, so no unattributable round can take a hull.
      for (let v = 0; v < players.length; v++) {
        if (v === shooter || !seatAlive(v)) continue;
        const sh = players[v].ship;
        const t = segCircleEntryT(b.px, b.py, b.x, b.y, sh.x, sh.y, SHIP_R + b.r);
        if (t >= 0 && (bestT < 0 || t < bestT)) { bestT = t; hit = null; mi = -1; vs = v; }
      }
      if (vs >= 0) {
        // The round struck a body. It is CONSUMED whatever the gate decided —
        // a comet negated it, a grace period ate it, or it landed: all three
        // are a bullet that stopped on a hull, and the anvil's blocked-shot
        // precedent above is the same rule. hitsDealt counts only the hits
        // that REGISTERED, so a negated strike inflates no statistic. No
        // `hit` event is emitted here: hitPlayer already sounds the one cue
        // per registered hit (hurt, or death), and a second cue would break
        // the audio suite's one-cue rule. The splash stays enemies-only by
        // blastAt's own contract — BLAST does not reach players in v1.
        const bm = Math.hypot(b.vx, b.vy) || 1;
        const ix = b.px + (b.x - b.px) * bestT;
        const iy = b.py + (b.y - b.py) * bestT;
        b.dead = true;
        if (hitPlayer(vs, b.dmg)) E.hitsDealt++;
        spawnImpactFx(ix, iy, b.vx / bm, b.vy / bm, "enemy");
        continue;
      }
      if (mi >= 0) {
        const bx = b.px + (b.x - b.px) * bestT;
        const by = b.py + (b.y - b.py) * bestT;
        b.dead = true;   // consumed exactly once, same as a body hit
        E.missilesShot++; // not a kill: no orb, no XP, no entry in E.kills
        endMissile(mi, "enemy", shooter); // the shooter's seat carries the boom
        // the file's standing rule — every player bullet that TERMINATES pays
        // its splash where it stopped, bodies and walls alike — so an
        // interception is not quietly the one shot that forfeits the upgrade.
        // null, because the thing the bullet paid for was not an enemy body;
        // blastAt itself never reaches ordnance, so no missile is ever swept
        // out of the air by a splash.
        blastAt(bx, by, null, b.dmg, shooter);
        continue;
      }
      if (hit) {
        const bm = Math.hypot(b.vx, b.vy) || 1; // visual only — the burst rides game.js's own hash stream
        const ix = b.px + (b.x - b.px) * bestT;
        const iy = b.py + (b.y - b.py) * bestT;
        // The anvil's shield, and the whole of it: a bullet whose swept ENTRY
        // POINT lands inside the frontal arc is consumed with no damage. The
        // test reads the same entry parameter the spark is drawn at, so the
        // block and the spark can never disagree about where the bullet
        // stopped. Three deliberate asymmetries live here: a blocked bullet
        // still DIES (and sparks with the wall kind, so the clang reads as an
        // inert thing struck, not as a hit), it pays no hitsDealt — nothing was
        // hit — and its splash still goes off for every OTHER body in reach,
        // because blastAt applies damage at a POINT rather than along a path.
        // The shielded body itself is excluded from that splash, and it is the
        // one place this file does not simply follow "a terminating bullet
        // splashes where it stopped": the impact point sits 13 px off the
        // anvil's centre and BLASTR alone is 18, so passing null here would let
        // an 8 XP purchase deal FULL damage through the shield on every blocked
        // round — the archetype would evaporate at rank 1. BLAST CHARGE still
        // answers this body, in the honest way: kill anything near it, or bury
        // a shot in the wall behind it, and the splash washes over its back.
        if (hit.stats.arc > 0 && Math.abs(angDiff(Math.atan2(iy - hit.y, ix - hit.x), hit.face)) <= hit.stats.arc) {
          b.dead = true;
          spawnImpactFx(ix, iy, b.vx / bm, b.vy / bm, "wall");
          emit("clang", hit, undefined, shooter); // pitched and short, obviously not
                              // the hit click — the shield is
                              // learnable by ear in one volley
          blastAt(ix, iy, hit, b.dmg, shooter); // hit, not null: everything else in reach
                                       // pays, the body that stopped the round does not
          continue;
        }
        hit.hp -= b.dmg; // the first body along the path takes the hit
        hit.flash = 8;
        hit.lastAtk = shooter; // damage aggro — the switch applies at the next decision point
        b.dead = true; // consumed exactly once — the game sweep removes it
        E.hitsDealt++;
        spawnImpactFx(ix, iy, b.vx / bm, b.vy / bm, "enemy");
        emit("hit", hit, undefined, shooter); // the landing, not the kill —
                          // reapDead owns the one canonical kill sound
        blastAt(ix, iy, hit, b.dmg, shooter); // the splash lands where the bullet stopped
      }
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
  // No per-bullet field is added — BULLET_HASH is a declared allow-list and
  // must not grow.
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
    const cands = []; // { t, kind (0 enemy | 1 missile | 2 ship), id/seat }
    for (const re of row.enemies) {
      let t;
      if (re.live) {
        if (!findEnemy(re.id)) continue; // a live-sweep body resolves before it sweeps
        // the presented pose: era pose led by the era velocity over the
        // whole rebate window, clamped into the world exactly as the
        // client's projection clamps (presentBody's wall rule)
        let ex = re.x + (re.vx || 0) * dTotal;
        let ey = re.y + (re.vy || 0) * dTotal;
        ex = Math.max(re.r, Math.min(WW - re.r, ex));
        ey = Math.max(re.r, Math.min(WH - re.r, ey));
        t = segCircleEntryT(b.px, b.py, b.x, b.y, ex, ey, re.r + b.r);
      } else {
        t = segCircleEntryT(b.px, b.py, b.x, b.y, re.x, re.y, re.r + b.r);
      }
      if (t >= 0) cands.push({ t, kind: 0, id: re.id });
    }
    for (const rm of row.missiles) {
      const t = segCircleEntryT(b.px, b.py, b.x, b.y, rm.x, rm.y, rm.r + b.r);
      if (t >= 0) cands.push({ t, kind: 1, id: rm.id });
    }
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
    // earliest entry wins; on an exact tie the smaller kind — enemies, then
    // missiles, then ships — exactly the live pass's tie order
    cands.sort((a, c) => a.t - c.t || a.kind - c.kind);
    for (const c of cands) {
      const ix = b.px + (b.x - b.px) * c.t;
      const iy = b.py + (b.y - b.py) * c.t;
      const bm = Math.hypot(b.vx, b.vy) || 1;
      if (c.kind === 0) {
        const e = findEnemy(c.id);
        if (!e || e.hp <= 0) continue; // died in the window — discarded, sweep on
      }
      if (c.kind === 1 && E.missiles.findIndex((m) => m.id === c.id) < 0) continue;
      // the winner: consume the bullet NOW (kinematics), pay at the resolve
      // phase (applyRebateHits) — a ship winner is consumed regardless of
      // what hitPlayer will decide there (phase 14's rule)
      b.dead = true;
      rebateQueue.push({ bid: b.id | 0, kind: c.kind, id: c.id, seat: c.seat,
        dmg: b.dmg, src: shooter, ix, iy, dx: b.vx / bm, dy: b.vy / bm });
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
      if (h.kind === 0) {
        const e = findEnemy(h.id);
        if (!e || e.hp <= 0) continue; // died before the resolve slot — dropped
        // the anvil's frontal shield HOLDS against rebated hits (corrective
        // pass 2): the winner is resolved at NOW, so face and arc are in
        // hand — the same block the live path runs, angle taken from the
        // NOW body to the rebated impact point (the available truth; the
        // ring holds no face). Blocked is consumed-with-no-damage: the
        // clang, the wall-kind spark, and the shield-excluded splash all
        // mirror the live branch.
        if (e.stats.arc > 0 && Math.abs(angDiff(Math.atan2(h.iy - e.y, h.ix - e.x), e.face)) <= e.stats.arc) {
          spawnImpactFx(h.ix, h.iy, h.dx, h.dy, "wall");
          emit("clang", e, undefined, h.src);
          blastAt(h.ix, h.iy, e, h.dmg, h.src);
          continue;
        }
        // the landed branch, mirroring the live sweep's. blastAt at the
        // REBATED impact point damages LIVE bodies — era-mixed splash is
        // deliberate: damage-at-NOW, wherever the terminating point was.
        e.hp -= h.dmg;
        e.flash = 8;
        e.lastAtk = h.src;
        E.hitsDealt++;
        spawnImpactFx(h.ix, h.iy, h.dx, h.dy, "enemy");
        emit("hit", e, undefined, h.src);
        blastAt(h.ix, h.iy, e, h.dmg, h.src);
        continue;
      }
      if (h.kind === 1) {
        const mi = E.missiles.findIndex((m) => m.id === h.id);
        if (mi < 0) continue; // already down or detonated — dropped
        E.missilesShot++;
        endMissile(mi, "enemy", h.src); // the rewound hit's source seat carries the boom
        blastAt(h.ix, h.iy, null, h.dmg, h.src);
        continue;
      }
      // a SHIP: hitPlayer's own gates decide at the resolve phase — a
      // mutual lethal trade lands BOTH tolls, because both shots were
      // already spawned and consumed during the drain while both seats
      // still lived; hitsDealt counts only a registered hit. `h.src` is not
      // passed: hitPlayer stopped reading a damage source when the toll went
      // unconditional. The queue still CARRIES src — the enemy and missile
      // branches above hand it to blastAt and to `lastAtk`.
      if (hitPlayer(h.seat, h.dmg)) E.hitsDealt++;
      spawnImpactFx(h.ix, h.iy, h.dx, h.dy, "enemy");
    }
    rebateQueue.length = 0;
  }
  // id-resolve against the LIVE array. No id index exists and ids are
  // monotonic, never reused — a linear scan is fine at these counts.
  function findEnemy(id) {
    for (const e of E.enemies) if (e.id === id) return e;
    return null;
  }

  // The other way a player bullet terminates on an impact: it left the world at
  // a wall, which game.js marks spent and sparks (FX_KINDS.wall). This runs
  // AFTER resolveBulletHits so a bullet a body ate on its exit tick is already
  // dead here and blasts on the body instead — exactly the rule flushWallFx
  // uses for the spark. A BOUNCING bullet never reaches this: it was mirrored
  // back inside the world and did not terminate. The contact point comes from
  // game.js's own wallExitPoint(), so damage and spark can never disagree, and
  // nothing here reads FXINT — the splash is sim, the spark is decoration.
  function resolveWallBlasts() {
    for (const b of G.bullets) {
      // per seat: the OWNER's rank gates its own bullets — a rank-0 seat's
      // wall exits stay silent while a ranked seat's splash (blastAt reads
      // the same owner rank, so the early continue is only a fast path)
      if (b.dead || !b.spent || bulletSeat(b) < 0) continue;
      if (termsFor(bulletSeat(b)).blast <= 0) continue;
      if (!outOfWorld(b)) continue; // a mid-air ttl fade hit nothing
      const w = wallExitPoint(b);
      blastAt(w.x, w.y, null, b.dmg, bulletSeat(b));
    }
  }

  // Generic ship-body contact — swept along the ship's own travel like the
  // lance and the dash, so a top-slider ship cannot skip through a 14 px body
  // between two ticks. Only a dead body is skipped here: the touch itself is
  // real every tick it happens, and contactEvent owns BOTH gates — the player's
  // i-frames and the body's own cooldown/per-tick claim. Skipping the whole
  // event on contactCd would silently pace the player's damage off an
  // enemy-facing knob (and pace it differently from the dash path, which calls
  // contactEvent unconditionally). The dash cannot double-count either: it ran
  // first in stepEnemy and took this tick's claim.
  function resolveContacts() {
    for (const e of E.enemies) {
      if (e.hp <= 0) continue;
      // every living ship's travel is swept, ascending seat order; each
      // side's own gates (i-frames, contactCd, the per-tick claim) still
      // arbitrate inside contactEvent exactly as before
      for (let s = 0; s < players.length; s++) {
        if (!seatAlive(s)) continue;
        const pl = players[s];
        const pv = prevOf(s);
        // a comet-mode seat's reach grows with its POOL, so the halo the player
        // already sees becomes the thing that actually connects. At the shipped
        // COMETAOEDMG of 0 this is byte-identical to the body contact the sweep
        // has always done — the committed traces move only because the pool is
        // hashed. The PLAYER side is deliberately NOT widened: contactEvent
        // routes both, and a comet negates all incoming damage anyway
        // (hitPlayer), so a wider comet reach cannot cost the player a thing.
        const reach = e.r + SHIP_R + (cometActive(s) ? COMETAOEDMG * energyFrac(s) : 0);
        if (segCircleHit(pv.x, pv.y, pl.ship.x, pl.ship.y, e.x, e.y, reach)) {
          contactEvent(e, ECFG.contact.dmgToPlayer, s);
        }
      }
    }
  }

  // pitch is mass: the three bodies that read as heavy sing killheavy, the
  // light hulls sing kill. A lookup rather than a ternary, so appending a type
  // is a row here and not a nested conditional. The same set names the heavy
  // SPAWN cue, for the same reason — the lone body arriving on the edge is
  // either something big or it is not.
  const HEAVY = { charger: true, radarCharger: true, anvil: true, husk: true };

  // A husk's death burst: three shards on a seeded fan, ONE rand() draw for the
  // base angle and 120° between them, each pushed clear of the corpse and given
  // outward velocity. It deliberately does NOT route through spawnEnemy: a husk
  // killed in your face is SUPPOSED to burst in your face, and the
  // minPlayerDist push-out that protects a scheduled spawn would teleport the
  // threat away from the player who just earned it.
  function splitBody(e) {
    const H = ECFG.husk;
    const n = e.stats.split;
    const st = E.stats.shard;
    const base = rand() * Math.PI * 2; // exactly one draw per burst, whatever n is
    for (let k = 0; k < n; k++) {
      const a = base + (k * 2 * Math.PI) / n;
      const c = clampWorld(e.x + Math.cos(a) * e.r * H.push, e.y + Math.sin(a) * e.r * H.push, st.r);
      makeBody(c.x, c.y, "shard", k, Math.cos(a) * H.kick, Math.sin(a) * H.kick);
    }
  }

  function reapDead() {
    for (let i = E.enemies.length - 1; i >= 0; i--) {
      const e = E.enemies[i];
      if (e.hp > 0) continue;
      E.enemies.splice(i, 1); // a body dies at most once
      E.kills++;
      // the ONE canonical kill site — bullet, blast and contact deaths all
      // arrive here, so no path can sound a body twice. BEFORE the orb loop,
      // which consumes rand(): the emit reads nothing and reorders nothing,
      // and keeping it above the draws makes that obvious at a glance. The
      // seat is the last one that damaged the body — -1 when none has (all but
      // unreachable: every damage site stamps lastAtk before reapDead runs),
      // and the audio layer keys that as its own single "kill#-1" bucket.
      emit(HEAVY[e.type] ? "killheavy" : "kill", e, undefined, e.lastAtk);
      for (let k = 0; k < e.orbDrop; k++) { // 1 a dart or a shard, 2 a charger or a
                                            // harrier, 3 an anvil, 1 the husk itself —
                                            // whose three shards make the burst pay 4
        const a = rand() * Math.PI * 2; // each drop dealt its own drift
        E.orbs.push({ id: nextId(), x: e.x, y: e.y, vx: Math.cos(a) * ECFG.orb.drift, vy: Math.sin(a) * ECFG.orb.drift });
      }
      // after the orbs, and on the reverse-iterating loop that makes appending
      // safe: the shards land at the end of the list, below the index this loop
      // is walking down through, so they are never reaped on the tick they were
      // born. A shard carries no split field, so there is no recursion to bound.
      if (e.stats.split) splitBody(e);
    }
  }

  // The ONE credit site, now per seat: the collecting seat's wallet, its
  // scoreboard and its high-water mark all rise together. Nothing HERE ever
  // lowers score — spending keeps it — and exactly one site anywhere does:
  // deathToll, on every death. The seat defaults to 0 so every
  // existing single-seat caller (the suites' enc.addXp(n)) still credits the
  // local seat unchanged.
  function addXp(n, seat = 0) {
    const S = E.seats[seat];
    if (!S) return;
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
  function buy(i, seat = localSeat()) {
    // the cues live HERE, not at the click site, so one site covers the
    // pointer and the suites' direct enc.buy() calls alike. The refusals a
    // player can reach by clicking each sound denied; a missing row or seat
    // is a programming error, not a player action asking for feedback.
    const S = E.seats[seat];
    const row = SHOP[i];
    if (!S || !row) return false;
    if (E.state === "dead") return false; // the match is over — nothing sells
    // a downed seat may browse the shelf; only a live one may spend — the
    // documented choice, surfaced at the phase gate
    if (S.hull <= 0) { if (window.Sfx) Sfx.cue("denied", null, undefined, seat); return false; }
    if (shopMaxed(i, seat)) { if (window.Sfx) Sfx.cue("denied", null, undefined, seat); return false; }
    if (row.can && !row.can(seat)) { if (window.Sfx) Sfx.cue("denied", null, undefined, seat); return false; }
    const cost = shopCost(i, seat); // the BUYER's own rank prices the row
    if (S.xp < cost) { if (window.Sfx) Sfx.cue("denied", null, undefined, seat); return false; }
    S.xp -= cost; // the wallet pays; S.score never moves — spending is not un-scoring
    S.owned[i]++; // the purchase IS the rank — termsFor derives everything else
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

  // Reset ONE seat's ranks to stock. TWO callers: deathToll (every death now,
  // not just a PvP kill — the note here used to say "phase 14's PvP death")
  // and restart(), which walks every seat. The epoch INCREMENTS — never
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
    const p = rollAnchor(anchorSeat >= 0 ? anchorSeat : s);
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
    // PER-PLAYER WAVES (the user's phase-05-gate decision): every seat gets
    // its OWN copy of the wave's schedule, owner-stamped. The owner anchors
    // the spawn geometry (off-screen from the owner — rollAnchor) and takes
    // the pack's initial aggro for the owner-lock window (makeBody). Copies
    // interleave seat-ascending inside each base group, so with one seat the
    // deal is byte-identical to the single-player schedule.
    //   THE PRESENCE GATE (the drop-in round): a PARKED seat — `absent`,
    // nobody behind it — is dealt NO copy at all. The gate lives HERE, at the
    // deal, and nowhere else: skipping an absent owner at SPAWN time instead
    // would leave its groups forever un-spawned and deadlock the wave-clear
    // check (`every g.spawned`). The deal is the one place the wave's size is
    // decided, so it is the one place presence may shrink it — and a deal in
    // which EVERY seat is absent lawfully produces ZERO groups: the schedule
    // holds, `every` on an empty list clears vacuously, and the field stays
    // empty until a reclaim asks for wave 1 (see the re-deal in encStep).
    // E.seats[] can be shorter than players[] mid-setup, so the record's
    // existence is guarded; a missing record reads as "present" — exactly
    // what syncSeats is about to make it.
    E.groups = [];
    for (const g of waveGroups(n)) {
      for (let s = 0; s < players.length; s++) {
        const S = E.seats[s];
        if (S && S.absent) continue;
        E.groups.push({ count: g.count, type: g.type, radar: g.radar, owner: s,
                        warnAt: g.warnAt, spawnAt: g.spawnAt, points: null, spawned: false });
      }
    }
    E.stats = statsFor(n); // resolved ONCE — bodies stamp this at spawn
  }

  // full restart: back to wave 1 with enemies, bullets, orbs and transient
  // state cleared, mods included; recenters the ship and camera — and
  // touches no tuner value, so every slider survives
  function restart(seed) {
    syncSeats(); // seats[] tracks players[] — BEFORE the wave deal reads the count
    // every seat's ranks die with the run, through the same primitive every
    // DEATH uses — each epoch still INCREMENTS. Deliberately BEFORE
    // the EVENTS clear below: a restart is a GLOBAL discontinuity every
    // client resynchronizes across anyway, so its termChange markers die
    // with the queue like every other stale cue.
    for (let s = 0; s < E.seats.length; s++) resetSeatUpgrades(s);
    startWave(1);
    if (seed !== undefined) rand = mulberry32(seed >>> 0); // explicit test seeds still override
    E.state = "idle";
    E.enemies = [];
    E.missiles = []; // ordnance never survives a restart — a wave-9 seeker
                     // arriving on the new wave 1 would be unaccountable
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
  }

  // ---- per-tick update — called from game step() after the bullet sweep --
  function encStep() {
    if (E.state === "idle") E.state = "warning"; // the first played tick opens Wave 1
    if (frozen()) return; // double safety — game step() already gates these
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
    if (E.state === "cleared" && !E.wipePending && E.waveTick - E.clearTick >= ECFG.clearHold) {
      startWave(E.wave + 1);
      E.state = "warning";
      recordPoseRow(); // the deal tick still SETTLES a pose set (nothing
                       // moved — the poses are last tick's, which is exactly
                       // what settled means); skipping it left every era one
                       // tick (~15 px) too old for a ring-depth of ticks
                       // after every wave deal (corrective pass 2)
      return;
    }
    E.waveTick++;
    // A cleared field does not wait out the clock. Once the wave is under way,
    // if every body is dead and no ordnance is in the air, the REST of the
    // schedule slides forward so the next group warns on this tick and lands
    // its 90 ticks later. Only the dead time is cut: the warning still runs in
    // full, and the remaining groups keep their pitch relative to each other,
    // so a wave the player clears fast reads as pressure instead of a timer.
    // The wave's OPENING beat is deliberately exempt — the gate needs a group
    // already down, so continuing from the shop still lands its first pack on
    // the committed 126-tick offset. "Settled" is the clear gate's own test,
    // missiles included: a dead harrier's last seeker is still the wave.
    if (E.state === "active" && E.enemies.length === 0 && E.missiles.length === 0) {
      const next = E.groups.find((g) => !g.spawned);
      if (next && E.waveTick < next.warnAt) {
        const slide = next.warnAt - E.waveTick;
        for (const g of E.groups) if (!g.spawned) { g.warnAt -= slide; g.spawnAt -= slide; }
      }
    }
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
    if (!players.some((_, s) => seatAlive(s)))
      for (const g of E.groups) if (!g.spawned) { g.warnAt++; g.spawnAt++; }
    for (const g of E.groups) {
      // the warn event lands strictly AFTER the seeded anchor draws — emit
      // touches no randomness, and the queue keeps it that way by design;
      // the spawn event is one per GROUP, never per body — spawnEnemy is
      // also a test hook and three darts landing is one event — and it
      // carries the anchor the incoming marker points at, so the ear and
      // the chevron agree on the direction
      if (!g.points && E.waveTick >= g.warnAt) { g.points = rollGroupPoints(g.count, g.owner); emit("warn", g.points.anchor); }
      if (!g.spawned && E.waveTick >= g.spawnAt) { spawnGroup(g); g.spawned = true; emit(HEAVY[g.type] ? "spawnheavy" : "spawn", g.points.anchor); }
    }
    if (E.state === "warning" && E.enemies.length) E.state = "active";
    // BEFORE the enemy loop, so a missile launched this tick first flies on the
    // NEXT one and the launch frame always draws it at the muzzle
    stepMissiles();
    for (const e of E.enemies) stepEnemy(e);
    // this tick's settled positions, after the dash branch has had first claim
    // on its own window, and before reapDead() so a contact kill reaps, counts
    // and pays its orbs on the same tick a bullet kill would
    resolveContacts();
    // BETWEEN the two: enemy contacts keep today's timing to the tick (they
    // resolve before anything a PvP death could remove from the field), and a
    // ram kill still lands before the bullet pass, so a seat killed by a ram
    // is already excluded from bullet candidacy on the same tick
    resolvePvpRams();
    applyRebateHits(); // the drain's queued rebate winners pay HERE — the
                       // slot live bullet damage occupies, so a rebated kill
                       // and a live kill share one timing (corrective pass 2)
    resolveBulletHits();
    resolveWallBlasts(); // after the sweep, before the reap: a wall blast's kill
                         // counts and pays its orbs on the tick it happened
    reapDead();
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
    const emptyDealAsk = () =>
      !E.groups.length && !players.some((_, i) => seatAlive(i));
    let reclaimedIntoEmptyDeal = false;
    for (let s = 0; s < E.seats.length; s++) {
      const S = E.seats[s];
      const press = claimPress(s);
      if (S.hull > 0) continue;
      if (S.absent) {
        // the RECLAIM. A press on a parked seat takes it back — and it can only
        // reach here from a client the server has bound to this seat, which is
        // what keeps a seat nobody is behind from dealing itself in
        if (press) {
          if (emptyDealAsk()) reclaimedIntoEmptyDeal = true;
          S.absent = false;
          respawnSeat(s);
        }
      } else if (S.respawnT > 0) {
        // the press is READ on the expiry tick, and it is an EDGE, not a level.
        // claimPress is latched off a frame's `fp` — the fire presses that began
        // inside that tick — so a player who holds the button down through the
        // whole countdown asserts nothing here and is NOT dealt back: the timer
        // expires unclaimed and the seat falls through to the claim window below,
        // where a fresh click still takes it. That is the feature, not a gap in
        // it. A held button is the one piece of state an abandoned tab reliably
        // leaves behind — `fh` and `rh` ride every frame a dead tab sends, which
        // is why neutralizeHeldBanks exists and why frameIsActive refuses them
        // both — so a level would deal the seat back to nobody and put the ghost
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
      E.enemies = [];  // a ceremony-free mass despawn: this bypasses reapDead, so no
      E.missiles = []; // kill cue, no orbs, no FX — the field simply empties, and the
      E.orbs = [];     // loose bounty goes with it, because an orb banked after the cut
      E.pvpCd = {};    // would pay a wallet this same block has just emptied
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
      // darts per present seat. Nothing is done about it HERE. The schedule
      // hold at the top of encStep is what holds it, and it holds every tick
      // the field is empty rather than sliding once by a guess at the return:
      // this block has no idea when — or whether — anybody comes back, and it
      // must not pretend to.
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
    if (reclaimedIntoEmptyDeal && !E.groups.length) startWave(1);
    // A wave clears only when the queue is empty AND the field is empty AND no
    // ordnance is still in the air — still an explicit simplification of Nova
    // Drift's timer-driven overlapping scheduler. The missile term is what
    // keeps the break and its orb sweep from running under a live seeker: a
    // dead harrier's last missile is still the wave. The break runs clearHold
    // ticks while the sweep banks the orbs — the CLEAR card retires earlier,
    // on bannerHold() = min(210, clearHold) — then the elevator deals.
    if (E.state === "active" && E.enemies.length === 0 && E.missiles.length === 0 &&
        E.groups.every((g) => g.spawned)) {
      E.state = "cleared";
      E.clearTick = E.waveTick;
      emit("clear", null, undefined, 0); // the run's one victory phrase — positionless: it is a ROOM fact, and att() measured from a far seat's own ship would silence it
    }
    // every seat's settled position, one record per seat — see E.shipPrev
    E.shipPrev = players.map((pl) => ({ x: pl.ship.x, y: pl.ship.y }));
    recordPoseRow(); // ...and the phase-15 ring's row, from the same settled
                     // poses: reapDead ran above, so no dead body enters it
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

  // Which way a silhouette points: a planted attack shows the LOCKED angle, so
  // the body and its telegraph can never disagree about where the threat goes.
  const bodyAngle = (e) => (e.mode === "seek" || e.mode === "tired" ? e.face : e.lockA);

  // One draw function per type, dispatched off a table instead of a chain of
  // type tests. Every silhouette is Canvas primitives in the palette the whole
  // game already speaks — no assets, and no unique hue per enemy: motion, size
  // and telegraph carry the distinction instead. Draw only: nothing here
  // mutates sim state and nothing here draws randomness.
  function drawDart(e) {
    const L = ECFG.lance;
    if (e.mode === "tele") {
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
    ctx.rotate(bodyAngle(e));
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

  function drawCharger(e) {
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
    ctx.rotate(bodyAngle(e));
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
  }

  // the standoff hull: a narrow spine with swept rails, and — while it locks —
  // a lane line down the missile's real bearing under a reticle that CLOSES
  // onto the muzzle as the launch nears. Two tells for one attack, same as the
  // charger: the lane says where, the reticle says when.
  function drawHarrier(e) {
    const H = ECFG.harrier;
    if (e.mode === "lockon") {
      const p = 1 - e.t / H.lockon;
      const reach = ECFG.missile.speed * ECFG.missile.life * 0.35; // a slice of the
      // 260 px reach — the whole flight drawn as a line would read as a beam
      ctx.strokeStyle = C.clay;
      ctx.globalAlpha = 0.15 + 0.5 * p;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + Math.cos(e.lockA) * reach, e.y + Math.sin(e.lockA) * reach);
      ctx.stroke();
      ctx.globalAlpha = 0.3 + 0.6 * p;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(e.lockA) * (e.r + 12), e.y + Math.sin(e.lockA) * (e.r + 12), 8 - 5.5 * p, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(bodyAngle(e));
    ctx.fillStyle = e.flash > 0 ? C.bright : "#9aa3b2";
    ctx.beginPath(); // a long nose over a deeply notched tail — nothing like a dart
    ctx.moveTo(10, 0);
    ctx.lineTo(1, 3.5);
    ctx.lineTo(-7, 6.5);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-7, -6.5);
    ctx.lineTo(1, -3.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.clay; // the rails the missile leaves from
    ctx.fillRect(-2, -5.6, 6, 1.3);
    ctx.fillRect(-2, 4.3, 6, 1.3);
    ctx.restore();
  }

  // the wedge, drawn with its shield ARC on: the covered 140° is painted in the
  // danger accent so the answer to this body — walk around it — is visible
  // rather than discovered by wasting a magazine on the front
  function drawAnvil(e) {
    const P = e.stats;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(bodyAngle(e));
    ctx.fillStyle = e.flash > 0 ? C.bright : "#9aa3b2";
    ctx.beginPath();
    ctx.moveTo(11, 0);   // the armored prow
    ctx.lineTo(3, 9);
    ctx.lineTo(-9, 10);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-9, -10);
    ctx.lineTo(3, -9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.clay;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 2;
    ctx.beginPath(); // the shield itself, on exactly the arc the sim tests
    ctx.arc(0, 0, e.r + 3, -P.arc, P.arc);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // the bloated drifter: a swollen hull with three seams already showing where
  // it will come apart, so the death burst is telegraphed by the body itself
  function drawHusk(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(bodyAngle(e));
    ctx.fillStyle = e.flash > 0 ? C.bright : "#9aa3b2";
    ctx.beginPath();
    ctx.arc(0, 0, e.r - 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.clay;
    for (let k = 0; k < 3; k++) { // the three shards, visible under the skin
      const a = (k * 2 * Math.PI) / 3;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 5.5, Math.sin(a) * 5.5, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = C.dim; // the strained outer skin
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // the payload: a dart's shape at half scale, so a burst reads instantly as
  // "three small fast things" without a new vocabulary
  function drawShard(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(bodyAngle(e));
    ctx.fillStyle = e.flash > 0 ? C.bright : "#9aa3b2";
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, 3.6);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-4, -3.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // The radar identity, painted OVER the parent silhouette: a cyan core dot, a
  // slow sweep ring (the "sensor" read), and — for predT ticks after a latch —
  // an expanding ping at the predicted point, the "this is where it thinks you
  // will be" mark. The sweep rotates off E.waveTick: drawing only, determinism
  // intact, and it freezes with the sim like every other pulse in this file.
  function drawRadarAccent(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = C.radar; // the cyan core over the parent's clay dot
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.radar;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.2;
    const sa = E.waveTick * 0.09; // the sweep — a short arc walking the rim
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 4, sa, sa + 1.2);
    ctx.stroke();
    ctx.restore();
    if (e.predT > 0) {
      const p = 1 - e.predT / 20; // expands and fades over the 20-tick ping
      ctx.strokeStyle = C.radar;
      ctx.globalAlpha = 0.85 * (1 - p);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(e.predX, e.predY, 3 + 10 * p, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(e.predX, e.predY, 1.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // the radar variants route through the PARENT draw — modes, lockA and
  // telegraph all render unchanged, so the leading line comes for free — and
  // the accent overlays the shared cyan identity on top
  const drawRadarDart = (e) => { drawDart(e); drawRadarAccent(e); };
  const drawRadarCharger = (e) => { drawCharger(e); drawRadarAccent(e); };
  const drawRadarHarrier = (e) => { drawHarrier(e); drawRadarAccent(e); };

  const DRAW_BODY = { dart: drawDart, charger: drawCharger, harrier: drawHarrier,
                      anvil: drawAnvil, husk: drawHusk, shard: drawShard,
                      radarDart: drawRadarDart, radarCharger: drawRadarCharger,
                      radarHarrier: drawRadarHarrier };

  // the missile, and the trail that is the actual UI for it: a bare dot moving
  // 4 px/tick reads as a teleport, while a tapering 14-sample tail shows the
  // turn radius the player has to beat. Newest sample is brightest and widest,
  // and the live position closes the tail so there is never a gap at the tip.
  function drawMissiles(list) {
    for (const m of list || E.missiles) {
      // a radar round wears the sensor cyan nose to tail, so which turn budget
      // is chasing you is readable from the trail alone
      const col = m.radar ? C.radar : C.clay;
      for (let i = 1; i <= m.trail.length; i++) {
        const a0 = m.trail[i - 1];
        const a1 = i < m.trail.length ? m.trail[i] : m;
        const p = i / m.trail.length;
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.05 + 0.35 * p;
        ctx.lineWidth = 0.6 + 2 * p;
        ctx.beginPath();
        ctx.moveTo(a0.x, a0.y);
        ctx.lineTo(a1.x, a1.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(m.x, m.y);
      // the nose heading: a FRAME copy carries headR — the interpolated
      // heading rolled in game.js's capture (the enemies' pf/cf idiom) — so
      // the nose turns smoothly between ticks; a live object (no copy, or a
      // headless caller) keeps the raw velocity heading, byte-identical
      ctx.rotate(typeof m.headR === "number" ? m.headR : Math.atan2(m.vy, m.vx));
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(5.5, 0);
      ctx.lineTo(-3, 2.6);
      ctx.lineTo(-1.5, 0);
      ctx.lineTo(-3, -2.6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C.bright; // the hot tip — the one bright pixel that says
      ctx.beginPath();          // this is live ordnance and not a spark
      ctx.arc(3, 0, 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

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
  // arrays, because restart() replaces E.enemies/E.missiles/E.orbs whole.
  // LIGHTS is module-level and cleared per call — the same reused-buffer idiom
  // the arrow tracker uses.
  const LIGHTS = [];
  function lights(view) {
    LIGHTS.length = 0;
    if (E.state === "idle") return LIGHTS;
    for (const e of (view && view.enemies) || E.enemies) LIGHTS.push({ x: e.x, y: e.y, r: e.r, t: e.type });
    for (const m of (view && view.missiles) || E.missiles) LIGHTS.push({ x: m.x, y: m.y, r: m.r, t: m.radar ? "radarMissile" : "missile" });
    for (const o of (view && view.orbs) || E.orbs) LIGHTS.push({ x: o.x, y: o.y, r: ECFG.orb.r, t: "orb" });
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
    for (const o of (view && view.orbs) || E.orbs) {
      ctx.fillStyle = C.clay;
      ctx.beginPath();
      ctx.arc(o.x, o.y, ECFG.orb.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.bright;
      ctx.beginPath();
      ctx.arc(o.x, o.y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // enemy bodies, telegraphs, beams and trails — one function per type off
    // the dispatch table; an unknown type falls back to the dart rather than
    // vanishing, because an invisible body is the worst possible bug here
    for (const e of (view && view.enemies) || E.enemies) (DRAW_BODY[e.type] || drawDart)(e);
    // ordnance paints OVER the bodies: a missile crossing a pack is the thing
    // the player has to answer first, so it must never be hidden behind one
    drawMissiles(view && view.missiles);
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

  // ---- drawing: HUD and overlays (screen space, no camera) ---------------
  function drawIncomingMarker(a, wt, vc) {
    // vc is the PRESENTED camera (view.cam) — the marker's world → screen
    // conversion must use the same camera the world pass drew with, or the
    // chevron steps against a smooth field. Callers without a view fall back
    // to the tick camera.
    const c = vc || cam;
    const sx = a.x - c.x;
    const sy = a.y - c.y;
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

  // ---- screen-edge arrows -------------------------------------------------
  // Quiet chevrons on an inset rect, one per direction to an enemy the
  // viewport has lost. Pure functions of live state (E.enemies, E.missiles,
  // cam, FW/FH, and E.waveTick for the halo's pulse clock): no rand(), no
  // Math.random(), no Date.now() — the draw path can never desync a replay.
  // Directions closer than a bucket apart merge into one arrow (the nearest
  // body of the bucket represents it) and a nearest-first cap bounds the
  // worst case, so a swarm behind you stays readable. HOT is the escalation:
  // a body whose telegraph is running right now — a harrier mid-lock, a
  // charger mid-windup — outranks proximity for its bucket's claim and
  // survives the cap first, because the marker's job in that moment is the
  // shooter, not the nearest walker standing in front of it.
  const ARROWS = { inset: 14, cap: 16, buckets: 48, far: 1200 };
  function computeEdgeArrows(view) {
    // view is game.js's presentation FRAME: the camera AND the bodies read
    // the presented instant together, so an arrow's visibility cut and its
    // bearing agree with the world pass. A caller without a view (the __test
    // export, a headless page) keeps the live state — same geometry, tick
    // camera.
    const c = (view && view.cam) || cam;
    const foes = (view && view.enemies) || E.enemies;
    const miss = (view && view.missiles) || E.missiles;
    const vx = c.x + FW / 2; // the view centre — position and heading share
    const vy = c.y + FH / 2; // this ray, so an arrow points where it sits
    const slots = new Array(ARROWS.buckets).fill(null); // fixed slot order — deterministic
    // one bucket claim, shared by the bodies and the ordnance so both fold into
    // the SAME merge and the same nearest-wins rule
    const track = (o, type, hot) => {
      const sx = o.x - c.x;
      const sy = o.y - c.y;
      if (sx >= -o.r && sx <= FW + o.r && sy >= -o.r && sy <= FH + o.r) return; // any part visible — no arrow
      const dx = o.x - vx;
      const dy = o.y - vy;
      const dist = Math.hypot(dx, dy);
      const step = (2 * Math.PI) / ARROWS.buckets;
      const bi = ((Math.round(Math.atan2(dy, dx) / step) % ARROWS.buckets) + ARROWS.buckets) % ARROWS.buckets;
      const s = slots[bi];
      if (!s) slots[bi] = { dx, dy, dist, n: 1, type, bi, hot: !!hot };
      else {
        s.n++;
        // hot wins the bucket outright; among peers the nearest wins, as ever
        if ((hot && !s.hot) || (!!hot === !!s.hot && dist < s.dist)) {
          s.dx = dx; s.dy = dy; s.dist = dist; s.type = type; s.hot = !!hot;
        }
      }
    };
    for (const e of foes) {
      if (e.hp <= 0) continue;
      // a radar variant resolves through its base archetype, so its telegraph
      // buys the same hot flag, scale and danger accent as the parent's —
      // never a silently quiet-steel chevron
      const kin = e.stats.base || e.type;
      track(e, kin, (kin === "harrier" && e.mode === "lockon") ||
                    (kin === "charger" && e.mode === "windup"));
    }
    // missiles earn arrows too: a 512×342 window on a 3072×3762 world makes an
    // unheralded off-screen seeker unfair, and a harrier that fires from
    // outside the view is exactly the case this layer was built for
    for (const m of miss) track(m, "missile");
    const hw = FW / 2 - ARROWS.inset;
    const hh = FH / 2 - ARROWS.inset;
    return slots.filter(Boolean)
      .sort((a, b) => (b.hot ? 1 : 0) - (a.hot ? 1 : 0) || a.dist - b.dist || a.bi - b.bi) // hot first,
      .slice(0, ARROWS.cap)                     // then nearest; explicit tie-break — deterministic order
      .map((s) => {
        // an off-screen body always overshoots one half-extent, so k < 1 and
        // the arrow lands exactly ON the inset rect — inside the field clip,
        // never in the letterbox bars
        const k = Math.min(hw / Math.max(Math.abs(s.dx), 1e-9), hh / Math.max(Math.abs(s.dy), 1e-9));
        return { x: FW / 2 + s.dx * k, y: FH / 2 + s.dy * k,
          ang: Math.atan2(s.dy, s.dx), dist: s.dist, n: s.n, type: s.type, hot: s.hot };
      });
  }
  // per-type chevron size and colour, as two small lookups rather than a
  // growing ternary. Size is mass — the heavies read bigger, ordnance smaller.
  // The danger accent has two grades. The standing accent (colour) goes to the
  // three things that can reach you from where they are: the charger (as it
  // always did), the harrier that shoots across the field, and the missile
  // already on its way. The bodies that have to walk to you keep the quiet
  // steel. HOT is the second grade — the telegraph is running RIGHT NOW —
  // and it buys full strength and a pulsing halo, so the one chevron that is
  // about to cost a hull reads over every quiet one on the rect.
  const ARROW_SCALE = { charger: 1.25, anvil: 1.25, husk: 1.15, missile: 0.7 };
  const ARROW_ACCENT = { charger: true, harrier: true, missile: true };
  function drawEdgeArrows(view) {
    for (const a of computeEdgeArrows(view)) {
      const sc = (ARROW_SCALE[a.type] || 1) * (1 + Math.min(a.n - 1, 3) * 0.15);
      ctx.save();
      ctx.globalAlpha = a.hot ? 0.9
        : 0.3 + 0.45 * Math.max(0, Math.min(1, 1 - a.dist / ARROWS.far));
      ctx.translate(a.x, a.y);
      ctx.rotate(a.ang);
      ctx.scale(sc, sc);
      ctx.fillStyle = ARROW_ACCENT[a.type] ? C.clay : "#9aa3b2";
      ctx.beginPath(); // the incoming-marker chevron, same proportions
      ctx.moveTo(7, 0);
      ctx.lineTo(-4, 5);
      ctx.lineTo(-1, 0);
      ctx.lineTo(-4, -5);
      ctx.closePath();
      ctx.fill();
      if (a.hot) {
        // the telegraph halo: an expanding, fading ring, pulsed off the SIM
        // tick — the same determinism contract as the geometry above, and it
        // freezes with the sim, which is honest: a paused lock is not
        // advancing on you. One pulse per half second, comfortably inside
        // the 45-tick lock, so even the first lock of a wave pulses.
        const ph = (E.waveTick % 30) / 30;
        ctx.globalAlpha = 0.7 * (1 - ph);
        ctx.strokeStyle = C.clay;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 6 + ph * 8, 0, 2 * Math.PI);
        ctx.stroke();
      }
      ctx.restore(); // restore() puts globalAlpha back — nothing leaks
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

  function shopLayout() {
    const S = SHOPUI;
    const cards = SHOP.map((row, i) => ({
      i,
      x: S.pad,
      y: S.headerH + i * (S.cardH + S.gapY),
      w: S.cardW, h: S.cardH,
    }));
    const last = cards[cards.length - 1];
    const detailTop = last.y + last.h + S.gapY; // where the card column's gap
                                                // ends — the line the hint's
                                                // INK may not cross
    const detailH = HINTPX + HINTAIR; // exactly one line of hint at the widest
                                      // that line can ever be set, plus its air
    return {
      cards,
      w: S.w,
      h: detailTop + detailH,
      // the header's DESIGN baseline. It is a baseline, not a rect, so the draw
      // is allowed to push it DOWN when a floor-grown font's ascenders would
      // otherwise climb out of the space the rects leave — see drawShopPanel.
      // It never moves a card, a hit test or a wire index, and at the design
      // sizes the draw lands on this exact number.
      headerY: S.headerY,
      detailTop, detailH,
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
    // prose; the suites' own 780x493 fits at 0.3549 and lands it at 7.01, so
    // they do not, and every expectation those suites already carry is
    // unchanged. A degenerate ratio means "the design sizes" everywhere else
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
  function statusStackRight() {
    const wave = E.state === "cleared" ? "WAVE " + E.wave + " · CLEAR" : "WAVE " + E.wave;
    const foes = "FOES " + (E.enemies.length + queuedCount());
    return Math.max(
      8 + EMW * 10 * wave.length,
      8 + (localSeatRec().hullMax * 10 - 3) + 1, // the energy bar's outer stroke edge
      8 + EMW * 9 * ("XP " + localSeatRec().xp).length,
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
    const rec = ICONS[i];
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
    let anyBuyable = false; // feeds the hint's warm colour after the loop
    SHOP.forEach((row, i) => {
      const c = L.cards[i];
      const maxed = shopMaxed(i);
      const offered = !row.can || row.can(localSeat()); // rows never hide — a card that
                                              // leaves the shelf stays, greyed
      const cost = shopCost(i);
      const buyable = !down && !maxed && offered && localSeatRec().xp >= cost;
      if (buyable) anyBuyable = true;
      const hot = E.shopHover === i;
      ctx.fillStyle = hot ? "#161b28" : C.fieldBg; // the card lifts under the pointer
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.lineWidth = 1;
      // during the break an unhovered affordable card warms to bright — not to
      // clay, which would erase the hover step exactly when clicks are wanted.
      // Keyed on the discrete state, never a clock: two renders in one tick
      // must paint identical bytes for the gutter pixel probes.
      const warm = E.state === "cleared";
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
      ctx.fillStyle = (E.state === "cleared" && anyBuyable) ? C.clay : C.dim;
      ctx.fillText(B.text, L.w / 2, B.base);
    }
    ctx.restore();
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
    // the crowned row: the leader by STANDING, and only while it has
    // actually scored. Reading best rather than the live score is what keeps
    // the crown on a leader who just died — under the new death rule the
    // score half of that test would be 0 for the whole respawn timer.
    const king = ranked.length && ranked[0].S.best > 0 ? ranked[0].s : -1;
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
    if (E.state === "idle") return;
    ctx.save();
    const wt = E.waveTick;
    // --- off-screen trackers, first so everything else paints over them ---
    // a chevron parked on the inset rect's left column would otherwise sit on
    // top of the hull pips, the XP bar and the readouts below
    if (EDGEARROWS) drawEdgeArrows(view);
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
    ctx.fillText(E.state === "cleared" ? "WAVE " + E.wave + " · CLEAR" : "WAVE " + E.wave, 8, 16);
    const LS = localSeatRec(); // the LOCAL seat — every readout in this column is ITS state
    for (let i = 0; i < LS.hullMax; i++) { // hull pips — the LIVE max, MAX HULL grows the row
      if (i < LS.hull) {
        ctx.fillStyle = C.clay;
        ctx.fillRect(8 + i * 10, 21, 7, 7);
      } else {
        ctx.strokeStyle = C.dim;
        ctx.lineWidth = 1;
        ctx.strokeRect(8.5 + i * 10, 21.5, 6, 6);
      }
    }
    // the ENERGY bar, under the hull pips and on the same left margin and pip
    // width, so the two columns read as one instrument. The pool comes off the
    // PLAYER STRUCT, never off a fresh energyCap() call: on a net client the
    // mods are never synced and only the mirror the wire hands down is right.
    // presentedPool: the struct's wire mirror everywhere, the PREDICTED pool
    // for the local seat in net mode — the bar answers the stick, not the RTT
    const EB = presentedPool(localSeat());
    const ebW = LS.hullMax * 10 - 3; // the hull row's own width: pips at 10 px, less the last gap
    const ebF = EB.enMax > 0 ? Math.max(0, Math.min(1, EB.en / EB.enMax)) : 0;
    ctx.strokeStyle = C.dim;
    ctx.lineWidth = 1;
    ctx.strokeRect(8.5, 31.5, ebW, 4);
    if (ebF > 0) {
      // a seat below the re-arm floor and not already in comet is LOCKED OUT,
      // not merely low — the dimmer fill is what makes "why won't it turn on"
      // answerable from the screen, and the notch below says where the line is.
      // "already in comet" comes off the ONE presentation owner the halo, the
      // light layer and the wake read (game.js's cometView), so a bar that has
      // gone bright and a ship that has not lit up cannot happen: a WINDUP
      // brightens the bar too, because the pilot has asked and the screen owes
      // them the answer to that ask rather than to the round trip.
      ctx.globalAlpha = cometView(localSeat(), EB).phase === CP_OFF && ebF < ENARM ? 0.4 : 1;
      ctx.fillStyle = C.clay;
      ctx.fillRect(9, 32, Math.max(1, (ebW - 1) * ebF), 3);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = C.dim; // the floor itself, one px wide
    ctx.fillRect(9 + (ebW - 1) * ENARM, 32, 1, 3);
    ctx.fillStyle = C.dim; // the wallet — a flat count; an uncapped wallet has no denominator to bar
    ctx.font = "400 9px " + FONT;
    // the two readouts sit 6 px lower than they used to: the ENERGY bar took
    // the band directly under the pips, which is the only place it can read as
    // part of the same instrument
    ctx.fillText("XP " + LS.xp, 8, 46);
    ctx.fillText("FOES " + (E.enemies.length + queuedCount()), 8, 57);
    // (the THRUST LOCKED — SHOP notice died with the lock: key thrust is
    // stock now, so the line it defended against cannot occur)
    // --- spawn warnings ---
    for (const g of E.groups) {
      if (g.points && !g.spawned) drawIncomingMarker(g.points.anchor, wt, view && view.cam);
    }
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
    if (E.state === "cleared" && wt >= E.clearTick && wt - E.clearTick < ECFG.clearHold) {
      const left = ECFG.clearHold - (wt - E.clearTick);
      ctx.textAlign = "center";
      ctx.font = "700 11px " + FONT;
      ctx.fillStyle = left <= 180 ? C.clay : C.dim; // the last three seconds warm up
      ctx.fillText("NEXT WAVE IN " + Math.ceil(left / 60), FW / 2, 30);
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
    if (E.state === "cleared" && wt - E.clearTick < bannerHold()) {
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
  // statsFor's hard floors (dart cooldown 72, harrier cooldown 90, charger
  // rest 54) stay in statsFor — sliders move the baselines under them.
  const TUNING = {
    groups: [ // display order; one titled section per group in the enemies tab
      { key: "dart", label: "DART + LANCE", rows: [
        { id: "dart-hp", label: "hp", min: 1, max: 12, step: 1,
          get: () => ECFG.enemy.hp, set: (v) => { ECFG.enemy.hp = v; },
          fmt: (v) => v + " base · " + (E.stats ? E.stats.dart.hp + " live @ w" + E.wave : "no wave") + " · +1 per 3 waves (cap +4)" },
        { id: "dart-max-speed", label: "max speed", min: 1.2, max: 6, step: 0.05,
          get: () => ECFG.enemy.maxSpeed, set: (v) => { ECFG.enemy.maxSpeed = v; },
          fmt: (v) => v.toFixed(2) + " px/tick base · " + (E.stats ? E.stats.dart.maxSpeed.toFixed(2) + " live @ w" + E.wave : "no wave") },
        { id: "dart-steer", label: "steer", min: 0.02, max: 0.2, step: 0.001,
          get: () => ECFG.enemy.steer, set: (v) => { ECFG.enemy.steer = v; },
          fmt: (v) => v.toFixed(3) + " of (target − velocity) per tick" },
        { id: "dart-prefer", label: "prefer ring", min: 40, max: 240, step: 1,
          get: () => ECFG.enemy.prefer, set: (v) => { ECFG.enemy.prefer = v; },
          fmt: (v) => v + " px ring around the player" },
        { id: "dart-band", label: "band", min: 4, max: 48, step: 1,
          get: () => ECFG.enemy.band, set: (v) => { ECFG.enemy.band = v; },
          fmt: (v) => v + " px hold tolerance" },
        { id: "dart-back-speed", label: "back speed", min: 0.4, max: 3, step: 0.05,
          get: () => ECFG.enemy.backSpeed, set: (v) => { ECFG.enemy.backSpeed = v; },
          fmt: (v) => v.toFixed(2) + " px/tick retreat" },
        { id: "dart-sep-r", label: "separation", min: 12, max: 90, step: 1,
          get: () => ECFG.enemy.sepR, set: (v) => { ECFG.enemy.sepR = v; },
          fmt: (v) => v + " px between pack members" },
        { id: "dart-lance-engage", label: "lance engage", min: 55, max: 300, step: 1,
          get: () => ECFG.lance.engage, set: (v) => { ECFG.lance.engage = v; },
          fmt: (v) => v + " px — telegraph starts inside this" },
        { id: "dart-lance-len", label: "lance length", min: 60, max: 300, step: 1,
          get: () => ECFG.lance.len, set: (v) => { ECFG.lance.len = v; },
          fmt: (v) => v + " px beam" },
        { id: "dart-lance-half-width", label: "lance half-width", min: 1, max: 8, step: 0.05,
          get: () => ECFG.lance.halfWidth, set: (v) => { ECFG.lance.halfWidth = v; },
          fmt: (v) => v.toFixed(2) + " px half-width" },
        { id: "dart-lance-telegraph", label: "telegraph", min: 15, max: 120, step: 1,
          get: () => ECFG.lance.telegraph, set: (v) => { ECFG.lance.telegraph = v; },
          fmt: (v) => v + " ticks · " + (v / 60).toFixed(2) + " s of warning" },
        { id: "dart-lance-pulse", label: "pulse", min: 4, max: 40, step: 1,
          get: () => ECFG.lance.pulse, set: (v) => { ECFG.lance.pulse = v; },
          fmt: (v) => v + " ticks beam live" },
        { id: "dart-lance-cooldown", label: "lance cooldown", min: 60, max: 360, step: 1,
          get: () => ECFG.lance.cooldown, set: (v) => { ECFG.lance.cooldown = v; },
          fmt: (v) => v + " ticks base · " + (E.stats ? E.stats.dart.cooldown + " live @ w" + E.wave : "no wave") + " · floor 72" },
      ]},
      { key: "charger", label: "CHARGER", rows: [
        { id: "charger-hp", label: "hp", min: 1, max: 20, step: 1,
          get: () => ECFG.charger.hp, set: (v) => { ECFG.charger.hp = v; },
          fmt: (v) => v + " base · " + (E.stats ? E.stats.charger.hp + " live @ w" + E.wave : "no wave") },
        { id: "charger-max-speed", label: "max speed", min: 0.8, max: 4, step: 0.05,
          get: () => ECFG.charger.maxSpeed, set: (v) => { ECFG.charger.maxSpeed = v; },
          fmt: (v) => v.toFixed(2) + " px/tick base · " + (E.stats ? E.stats.charger.maxSpeed.toFixed(2) + " live @ w" + E.wave : "no wave") },
        { id: "charger-prefer", label: "prefer ring", min: 75, max: 400, step: 1,
          get: () => ECFG.charger.prefer, set: (v) => { ECFG.charger.prefer = v; },
          fmt: (v) => v + " px ring around the player" },
        { id: "charger-engage", label: "engage", min: 130, max: 600, step: 1,
          get: () => ECFG.charger.engage, set: (v) => { ECFG.charger.engage = v; },
          fmt: (v) => v + " px — a rested charger plants inside this" },
        { id: "charger-windup", label: "windup", min: 15, max: 150, step: 1,
          get: () => ECFG.charger.windup, set: (v) => { ECFG.charger.windup = v; },
          fmt: (v) => v + " ticks planted · " + (v / 60).toFixed(2) + " s · dash line locks at start" },
        { id: "charger-dash-speed", label: "dash speed", min: 3, max: 16, step: 0.05,
          get: () => ECFG.charger.dashSpeed, set: (v) => { ECFG.charger.dashSpeed = v; },
          fmt: (v) => v.toFixed(2) + " px/tick along the locked line — never wave-scaled" },
        { id: "charger-dash-ticks", label: "dash ticks", min: 10, max: 80, step: 1,
          get: () => ECFG.charger.dashTicks, set: (v) => { ECFG.charger.dashTicks = v; },
          fmt: (v) => v + " ticks · " + Math.round(v * ECFG.charger.dashSpeed) + " px of travel" },
        { id: "charger-rest", label: "rest", min: 45, max: 300, step: 1,
          get: () => ECFG.charger.rest, set: (v) => { ECFG.charger.rest = v; },
          fmt: (v) => v + " ticks base · " + (E.stats ? E.stats.charger.rest + " live @ w" + E.wave : "no wave") + " · floor 54" },
        { id: "charger-cooldown", label: "cooldown", min: 10, max: 120, step: 1,
          get: () => ECFG.charger.cooldown, set: (v) => { ECFG.charger.cooldown = v; },
          fmt: (v) => v + " seek ticks before the next lunge" },
      ]},
      { key: "harrier", label: "HARRIER", rows: [
        { id: "harrier-hp", label: "hp", min: 1, max: 16, step: 1,
          get: () => ECFG.harrier.hp, set: (v) => { ECFG.harrier.hp = v; },
          fmt: (v) => v + " base · " + (E.stats ? E.stats.harrier.hp + " live @ w" + E.wave : "no wave") },
        { id: "harrier-max-speed", label: "max speed", min: 0.6, max: 3, step: 0.05,
          get: () => ECFG.harrier.maxSpeed, set: (v) => { ECFG.harrier.maxSpeed = v; },
          fmt: (v) => v.toFixed(2) + " px/tick approach — never wave-scaled" },
        { id: "harrier-back-speed", label: "back speed", min: 0.8, max: 4, step: 0.05,
          get: () => ECFG.harrier.backSpeed, set: (v) => { ECFG.harrier.backSpeed = v; },
          fmt: (v) => v.toFixed(2) + " px/tick retreat — the kite needs this above approach" },
        { id: "harrier-prefer", label: "prefer ring", min: 120, max: 480, step: 1,
          get: () => ECFG.harrier.prefer, set: (v) => { ECFG.harrier.prefer = v; },
          fmt: (v) => v + " px standoff ring" },
        { id: "harrier-band", label: "band", min: 10, max: 90, step: 1,
          get: () => ECFG.harrier.band, set: (v) => { ECFG.harrier.band = v; },
          fmt: (v) => v + " px hold tolerance" },
        { id: "harrier-engage", label: "engage", min: 135, max: 540, step: 1,
          get: () => ECFG.harrier.engage, set: (v) => { ECFG.harrier.engage = v; },
          fmt: (v) => v + " px — lock-on opens inside this" },
        { id: "harrier-lockon", label: "lock-on", min: 25, max: 150, step: 1,
          get: () => ECFG.harrier.lockon, set: (v) => { ECFG.harrier.lockon = v; },
          fmt: (v) => v + " ticks planted · " + (v / 60).toFixed(2) + " s" },
        { id: "harrier-cooldown", label: "cooldown", min: 75, max: 480, step: 1,
          get: () => ECFG.harrier.cooldown, set: (v) => { ECFG.harrier.cooldown = v; },
          fmt: (v) => v + " ticks base · " + (E.stats ? E.stats.harrier.cooldown + " live @ w" + E.wave : "no wave") + " · floor 90" },
      ]},
      { key: "missile", label: "SEEKER MISSILE", rows: [
        { id: "missile-speed", label: "speed", min: 3, max: 12, step: 0.05,
          get: () => ECFG.missile.speed, set: (v) => { ECFG.missile.speed = v; },
          fmt: (v) => v.toFixed(2) + " px/tick · " + Math.round(v * 60) + " px/s" },
        { id: "missile-life", label: "life", min: 45, max: 240, step: 1,
          get: () => ECFG.missile.life, set: (v) => { ECFG.missile.life = v; },
          fmt: (v) => v + " ticks · " + (v / 60).toFixed(2) + " s · " + Math.round(v * ECFG.missile.speed) + " px of reach" },
        { id: "missile-turn", label: "turn", min: 0.008, max: 0.06, step: 0.001,
          get: () => ECFG.missile.turn, set: (v) => { ECFG.missile.turn = v; },
          fmt: (v) => v.toFixed(3) + " rad/tick · " + Math.round((ECFG.missile.life - ECFG.missile.arm - ECFG.missile.decay / 2) * v * 180 / Math.PI) + "° of heading authority" },
        { id: "missile-arm", label: "arm", min: 0, max: 45, step: 1,
          get: () => ECFG.missile.arm, set: (v) => { ECFG.missile.arm = v; },
          fmt: (v) => v + " ticks ballistic at launch" },
        { id: "missile-decay", label: "decay", min: 0, max: 90, step: 1,
          get: () => ECFG.missile.decay, set: (v) => { ECFG.missile.decay = v; },
          fmt: (v) => v + " final ticks of fading steering" },
        { id: "missile-max", label: "max in flight", min: 1, max: 24, step: 1,
          get: () => ECFG.missile.max, set: (v) => { ECFG.missile.max = v; },
          fmt: (v) => v + " live missiles — a guard, not a mechanic" },
      ]},
      { key: "anvil", label: "ANVIL", rows: [
        { id: "anvil-hp", label: "hp", min: 3, max: 30, step: 1,
          get: () => ECFG.anvil.hp, set: (v) => { ECFG.anvil.hp = v; },
          fmt: (v) => v + " base · " + (E.stats ? E.stats.anvil.hp + " live @ w" + E.wave : "no wave") },
        { id: "anvil-max-speed", label: "max speed", min: 0.5, max: 2.4, step: 0.05,
          get: () => ECFG.anvil.maxSpeed, set: (v) => { ECFG.anvil.maxSpeed = v; },
          fmt: (v) => v.toFixed(2) + " px/tick — must stay under the ship's 2.0 to keep the escape promise" },
        { id: "anvil-turn-rate", label: "turn rate", min: 0.005, max: 0.06, step: 0.001,
          get: () => ECFG.anvil.turnRate, set: (v) => { ECFG.anvil.turnRate = v; },
          fmt: (v) => v.toFixed(3) + " rad/tick · out-turned inside " + Math.round(2.0 / v) + " px" },
        { id: "anvil-flee", label: "flee", min: 80, max: 480, step: 1,
          get: () => ECFG.anvil.flee, set: (v) => { ECFG.anvil.flee = v; },
          fmt: (v) => v + " px — flanked inside this, it runs along its own facing" },
        // the stored value is the radian half-angle; convert only at this
        // boundary so the exact radians round-trip without drift
        { id: "anvil-arc", label: "shield arc", min: 20, max: 170, step: 1,
          get: () => ECFG.anvil.arc * 180 / Math.PI,
          set: (v) => { ECFG.anvil.arc = v * Math.PI / 180; },
          fmt: (v) => "±" + Math.round(v) + "° half-angle · " + Math.round(v * 2) + "° of cover" },
      ]},
      { key: "husk", label: "HUSK + SHARD", rows: [
        { id: "husk-hp", label: "hp", min: 2, max: 24, step: 1,
          get: () => ECFG.husk.hp, set: (v) => { ECFG.husk.hp = v; },
          fmt: (v) => v + " base · " + (E.stats ? E.stats.husk.hp + " live @ w" + E.wave : "no wave") },
        { id: "husk-max-speed", label: "max speed", min: 0.4, max: 2, step: 0.05,
          get: () => ECFG.husk.maxSpeed, set: (v) => { ECFG.husk.maxSpeed = v; },
          fmt: (v) => v.toFixed(2) + " px/tick drift" },
        { id: "husk-split", label: "split", min: 1, max: 8, step: 1,
          get: () => ECFG.husk.split, set: (v) => { ECFG.husk.split = v; },
          fmt: (v) => v + " shards on the death fan" },
        { id: "husk-kick", label: "kick", min: 1, max: 6, step: 0.05,
          get: () => ECFG.husk.kick, set: (v) => { ECFG.husk.kick = v; },
          fmt: (v) => v.toFixed(2) + " px/tick outward on each shard" },
        { id: "husk-shard-hp", label: "shard hp", min: 1, max: 8, step: 1,
          get: () => ECFG.shard.hp, set: (v) => { ECFG.shard.hp = v; },
          fmt: (v) => v + " base · " + (E.stats ? E.stats.shard.hp + " live @ w" + E.wave : "no wave") },
        { id: "husk-shard-max-speed", label: "shard max speed", min: 1.4, max: 6, step: 0.05,
          get: () => ECFG.shard.maxSpeed, set: (v) => { ECFG.shard.maxSpeed = v; },
          fmt: (v) => v.toFixed(2) + " px/tick — above the ship's 2.0 so it must be shot" },
        { id: "husk-shard-steer", label: "shard steer", min: 0.03, max: 0.25, step: 0.001,
          get: () => ECFG.shard.steer, set: (v) => { ECFG.shard.steer = v; },
          fmt: (v) => v.toFixed(3) + " of (target − velocity) per tick" },
      ]},
      { key: "radar", label: "RADAR VARIANTS", rows: [
        { id: "radar-lead-scale", label: "lead scale", min: 0, max: 1.5, step: 0.05,
          get: () => ECFG.radar.leadScale, set: (v) => { ECFG.radar.leadScale = v; },
          fmt: (v) => v.toFixed(2) + "× of full lead · 0 = aims like the base type" },
        { id: "radar-deadband", label: "vel deadband", min: 0, max: 1, step: 0.05,
          get: () => ECFG.radar.deadband, set: (v) => { ECFG.radar.deadband = v; },
          fmt: (v) => v.toFixed(2) + " px/tick · below it a ship reads as still" },
        { id: "radar-missile-turn", label: "missile turn", min: 0, max: 0.03, step: 0.001,
          get: () => ECFG.radar.missileTurn, set: (v) => { ECFG.radar.missileTurn = v; },
          fmt: (v) => v.toFixed(3) + " rad/tick · 0 = ballistic predictor (base seeker: " + ECFG.missile.turn.toFixed(3) + ")" },
      ]},
      { key: "player", label: "PLAYER + CONTACT", rows: [
        { id: "player-hull", label: "hull", min: 1, max: 10, step: 1,
          get: () => ECFG.player.hull, set: (v) => { ECFG.player.hull = v; },
          fmt: (v) => v + " hull — applies on the next restart, not the live run" },
        { id: "player-invuln", label: "invuln", min: 20, max: 240, step: 1,
          get: () => ECFG.player.invuln, set: (v) => { ECFG.player.invuln = v; },
          fmt: (v) => v + " ticks · " + (v / 60).toFixed(2) + " s of post-hit grace" },
        { id: "player-respawn", label: "respawn", min: 60, max: 600, step: 1,
          get: () => ECFG.player.respawn, set: (v) => { ECFG.player.respawn = v; },
          fmt: (v) => v + " ticks · " + (v / 60).toFixed(2) + " s a downed seat waits" },
        { id: "player-claim", label: "claim window", min: 60, max: 3600, step: 60,
          get: () => ECFG.player.claim, set: (v) => { ECFG.player.claim = v; },
          fmt: (v) => v + " ticks · " + (v / 60).toFixed(2) + " s to click before the seat is released" },
        { id: "player-contact-dmg", label: "contact dmg", min: 0, max: 4, step: 1,
          get: () => ECFG.contact.dmgToPlayer, set: (v) => { ECFG.contact.dmgToPlayer = v; },
          fmt: (v) => v + " hull per body contact" },
      ]},
    ],
    // Re-resolve the live wave's stats IN PLACE. Object.assign into the
    // existing objects preserves the identity every body's e.stats references,
    // so live bodies see new values on their next tick; hp/r are per-body
    // copies and apply from the next spawn.
    refresh() {
      if (!E.stats) return; // no wave dealt yet — the next startWave resolves fresh
      const ns = statsFor(E.wave);
      for (const k of ROSTER) Object.assign(E.stats[k], ns[k]);
    },
  };

  // ---- publish — one namespace, one assignment ---------------------------
  restart(ECFG.seed);
  window.Encounter = { step: encStep, draw: encDraw, drawHud: encDrawHud, frozen, mods, reset: restart,
    // termsFor(seat) — the ONE upgrade-term derivation. game.js's sim reads
    // it here (fire cooldown, the per-seat vcap, the pool's cap/regen), and
    // the phase-11 predictor calls the SAME formula through termsFromOwned:
    // terms over a BARE rank vector (the ACKED wire ow), one source, no copy.
    termsFor, termsFromOwned,
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
    mapState: () => ({ enemies: E.enemies, orbs: E.orbs, missiles: E.missiles }),
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
    // the enemy tuning surface — inert until a set() is called; the panel in
    // game.js owns the controls, this file owns the fields and the refresh
    tuning: TUNING };

  // ---- test hook extension — deterministic checks drive the slice --------
  function snapState() {
    return {
      state: E.state,
      wave: E.wave,
      waveTick: E.waveTick,
      hull: E.hull,
      hullMax: E.hullMax,
      xp: E.xp,
      score: E.score, // seat 0's scoreboard — per-seat, hashed, zeroed by
                      // exactly one event in the sim: DYING (any death now,
                      // not the PvP kill this line used to name)
      seats: E.seats.map(({ termSeq, ...S }) => ({ ...S, owned: S.owned.slice() })),
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
      enemies: E.enemies.length,
      // darts and chargers stay as their own fields — the suite reads them —
      // and byType is the general answer beside them, every roster key always
      // present (0 when absent) so a check never distinguishes missing from none
      darts: E.enemies.reduce((n, e) => n + (e.type === "dart" ? 1 : 0), 0),
      chargers: E.enemies.reduce((n, e) => n + (e.type === "charger" ? 1 : 0), 0),
      byType: E.enemies.reduce((m, e) => { m[e.type] = (m[e.type] || 0) + 1; return m; },
                               ROSTER.reduce((m, t) => { m[t] = 0; return m; }, {})),
      missiles: E.missiles.length,
      missilesShot: E.missilesShot,
      orbs: E.orbs.length,
      queued: queuedCount(),
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
      groups: E.groups.map((g) => ({ spawned: g.spawned, warned: !!g.points })),
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
      // the seat's PERSONAL rank vector, length-prefixed — ranks decide what
      // the sim does next (every effective term is termsFor of them). The
      // derived terms themselves are NOT hashed: pure functions of these
      // ranks and unhashed tunables, the standing energyMax/vcap rule —
      // folding them too would hash the same truth twice. termSeq stays out:
      // derived bookkeeping, never a decision input.
      h.u32(S.owned.length);
      for (const n of S.owned) h.num(n);
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
    h.u32(E.groups.length);
    for (const g of E.groups) {
      for (const f of GROUP_HASH) h.val(g[f]);
      h.u32(g.points ? 1 : 0);
      if (g.points) {
        h.num(g.points.anchor.x); h.num(g.points.anchor.y);
        for (const p of g.points.pts) { h.num(p.x); h.num(p.y); }
      }
    }
    // enemies walk grouped in ROSTER order, so a new archetype cannot escape
    // the hash without being admitted here — and a type with zero live members
    // contributes NOTHING (no name, no zero count), so roster growth alone can
    // never move a committed hash. The live index folds with each body because
    // array order is itself simulation state: the separation pass and the
    // bullet arbitration both walk it.
    for (const type of ROSTER) {
      for (let i = 0; i < E.enemies.length; i++) {
        const e = E.enemies[i];
        if (e.type !== type) continue;
        h.u32(i);
        for (const f of ENEMY_HASH) h.val(e[f]);
      }
    }
    h.u32(E.missiles.length);
    for (const m of E.missiles) for (const f of MISSILE_HASH) h.val(m[f]);
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
      roster: ROSTER, // the live array — the golden suite's phantom-type check mutates and restores it
      mods, // the seat-0 compatibility VIEW (getter-backed on termsFor) —
            // kept only for the standing test surface; sim code never reads it
      termsFor,
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
      recordEvents, // start recording the (tick, kind, gain) stream the drain forwards
      stopEvents,   // ...and stop, returning the recorded list
      state: snapState,
      spawnEnemy,
      spawnMissile, // the real constructor, cap included — checks drive production
                    // code and never build a fixture the sim would not have made
      waveGroups,
      countsFor,
      statsFor,
      // the direct hooks that can emit outside a step: each drains after the
      // call, so a suite's log assertions see the cue on the same call — and
      // each keeps its exact return value
      hitPlayer, // the BARE combat primitive, undrained: the server's dev
                 // seat-kill lever calls it so the death marker still rides
                 // the wire's own event drain instead of dying in drainStep
      // damagePlayer keeps its (n, seat) argument order. Its old THIRD
      // argument — a killer seat, the only way to reach the PvP toll through
      // this seam — went with hitPlayer's `src`: every death collects the
      // whole toll now, so there is nothing for a source to select. Legs that
      // still pass a third value are harmless (JS drops it), but they no
      // longer mean anything and the PvP section was restated accordingly.
      damagePlayer: (n, seat = 0) => { const hit = hitPlayer(seat, n === undefined ? 1 : n); drainStep(); return hit; },
      addXp,
      buy,
      // the suites' wave elevator: the old flow rode continueFromShop, and
      // the panel shop has no wave button — encStep deals waves itself, and
      // a check that needs wave n NOW stages it exactly as encStep would
      dealWave: (n) => { startWave(n); E.state = "warning"; },
      respawnSeat, // the direct deal — a check can stage a re-entry without
                   // waiting the timer out
      unseatSeat,  // ...and its opposite, published for the SERVER: a socket
                   // whose grace lapsed has its sim seat taken off the field
                   // through this one function, so the rule that "leaving is
                   // not dying" has exactly one implementation
      reseatSeat,  // ...and the way BACK for the server: a parked seat that has
                   // been granted to a socket again is waiting on a click, not
                   // empty — see reseatSeat's own block
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
      statusStackRight, // the left edge of that channel, derived from the same
                        // numbers encDrawHud sets the status stack with
      shopHover,      // the hit test, in panel coordinates
      // the board's own draw cache and the card's box, so a click leg can press
      // the EXACT rect the last frame drew instead of re-deriving geometry that
      // would then agree with itself and with nothing on screen. Copies out:
      // these are live draw state and a check may not hold a handle on them.
      boardRows: () => boardRows.map((r) => ({ ...r })),
      nameBoxRect: () => (nameCardRect ? { ...nameCardRect } : null),
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
      boardRanking,   // ...and the ROW ORDER those lines are drawn in. The
                      // shopLayout idiom: a check drives the real comparator
                      // rather than diffing pixels for an ordering question
      resolveBulletHits, // the first-along-the-path pass, staged directly: a check that
                         // wants ONE arbitration must not also pay for the integrate step
                         // that moved the bullet there
      resolvePvpRams, // the PvP ram sweep, staged directly — a check drives one tick of
                      // it without threading a whole comet burn through the input ring
      pvpCd: () => ({ ...E.pvpCd }), // a COPY of the pair windows: the pacing is unhashed
                                     // while empty and never on the wire, so a check reads
                                     // it here rather than inventing its own bookkeeping
      predictAim, // the radar latch's aim solver, on the live target player's
                  // ship/vel — checks recompute the closed form and compare
                  // against production

      frozen,
      fireOnce: () => { fire(); drainStep(); }, // the real firing gate, without the autofire path
      setBounce: (v) => { BOUNCE = !!v; },
      edgeArrows: computeEdgeArrows, // the resolved arrow list, straight off live state
      arrowCfg: ARROWS,              // inset/cap/buckets — checks read these, never copy them
      tunables: () => ({ BCOOL, BLIFE, AUTOFIRE, BSPEED, BMAX, VMAX, TICK, BDMG, CONTACTCD, BLASTR, BLASTGAIN, COMETDMG, COMETCD, PVPORBS, PVPREWIND }),
                       // PVPORBS rides here too, and for the same reason COMETCD does:
                       // the ENCOUNTER is what reads it (deathToll deals the orbs — on
                       // EVERY death now, which is why the name still says PvP and the
                       // behaviour no longer does), and it sizes a drop the fixtures
                       // pin, so the meta diagnosis line has to be able to say "the
                       // constant moved" about it.
                       // COMETCD rides HERE and not in flightTunables: the encounter is
                       // what stamps it, beside the CONTACTCD it was split off from
      blastRadius, // the live effective radius, exactly as blastAt() reads it
      tuning: TUNING, // the same object window.Encounter.tuning publishes
    },
  });
})();
