// ---------------------------------------------------------------------------
// js/encounter-host.js — THE ADAPTER FACADE between production's loop and
// window.DemoKernel. Born DORMANT at S3b lane 1 (HOSTING) and installed by
// NOBODY on any surface that ships today.
//
// WHAT THIS FILE IS FOR
// The PORT-S program ends with the demo kernel flying as THE encounter under
// production's loop and the server vm. Getting there is three lanes, and the
// first one's whole claim is that the kernel can be DRIVEN under production's
// cadence with the old enemy plane still running beside it as the byte-identical
// control. That claim needs a seam. This file is it: one place that knows how
// production's tick maps onto DemoKernel.step(dt), how the two resets compose,
// and where the kernel's sink goes. Every later lane edits this file instead of
// threading kernel calls through js/game.js.
//
// WHAT THIS FILE IS NOT
// It is not the go-live flip. Nothing here feeds E.*, nothing here touches the
// wire, and no world or metric is unified. Those are lane 3's, deliberately, and
// this file staying small is the evidence that the split held.
//
// OFF BY DEFAULT, ON EVERY SURFACE — the PORT-W topology idiom, restated
// This file installs nothing at load. Loading it publishes an API and mutates no
// state; the PAGE or the HOST decides whether the kernel is driven, and the
// kernel never decides for itself. That is the same rule js/demo-kernel.js's
// WORLD_BOUNDED flag follows (the flip lives at the page, never at the literal),
// and it is why this file can join SIM_FILES without moving one committed byte:
// the server vm loads it and never calls install().
//
// IT READS NO DOM. Like js/demo-kernel.js, this file boots inside
// server/sim-host.mjs's vm sandbox over server/dom-stub.mjs, whose guard THROWS
// on any document/navigator touch during a tick. So: no document, no navigator,
// no timers, no wall clock. `window` is touched exactly once, at the publish line
// at the tail, on the kernel's own idiom.
// ---------------------------------------------------------------------------
(function () {
  "use strict";

  // ---- state --------------------------------------------------------------
  // All of it null/zero at load. `kernel` doubles as the installed flag: there
  // is one thing that can be installed, so a second boolean beside it would be a
  // second authority on the same question.
  var kernel = null;
  var sink = null;
  var stepped = 0;
  // THE INPUT BRIDGE'S state (commit E). `banked` is a sparse array indexed by
  // seat: the most recent frame this host was handed for that seat, already
  // converted to the KERNEL's units and already reduced to an aim OFFSET. An
  // absent entry is a seat this host has never been handed a frame for.
  var banked = [];
  // ...and which seats this host has BRIDGED, which is not the same question:
  // a bridged seat with no frame yet is a real state (it serves the empty human
  // frame). uninstall() needs the list, because a provider this host installed
  // on a kernel it no longer drives is the shape of leak that outlives the page
  // that made it — the same reason the sink is detached there.
  var bridgedSeats = [];
  // ...and which seats this host has POSE-DRIVEN (S3b lane 3, commit A).
  // uninstall() needs the list for bridgedSeats' exact reason: a pose left on a
  // kernel this host no longer drives would freeze that seat's ship at the last
  // frame of a session that has ended.
  var posedSeats = [];
  // ...and the last pose this host ACCEPTED for each seat, already converted to
  // the kernel's units. A test seam on `served`'s footing and for the identical
  // measured reason: a mirrored record proves that SOMETHING crossed, and only
  // the accepted pose proves WHAT. It matters more here than it did there,
  // because the real caller now pushes the pose from INSIDE production's own
  // tick — so a leg that re-read production afterwards would be reading a state
  // the kernel step it is about to judge may itself have moved.
  var accepted = [];
  // ...and the LAST FRAME the provider actually served, per seat. This is a test
  // seam and it exists because of a measured failure: the first cut of the
  // bridge's leg asserted on the SHIP'S POSE after the frame had been served,
  // and three sabotages walked straight through it — an absolute aim point, a
  // non-uniform aim scale, and a nose read one step stale all leave a pose that
  // is different from the control in the same direction as a correct one. A pose
  // proves that SOMETHING reached the seat; only the served frame proves WHAT.
  var served = [];
  // ...and the PAYMENTS this host actually routed into production's economy
  // (commit D). A test seam on `served`'s footing and for the same measured
  // reason: a wallet that moved proves that SOMETHING was paid, and a wallet is
  // moved by orb pickups, by the suites and by anything else that calls addXp.
  // Only the route's own record proves WHAT this host paid, and to whom.
  //
  // IT IS BOUNDED, AND IT IS CLEARED ON A RESET (S3b-C fix 3). The first cut
  // was an unbounded array cleared only by install/uninstall, and the review
  // measured both halves of what that costs: a composed `reset()` — the match
  // restart, which every other piece of state in this file resynchronizes
  // across — left the previous match's payments in it, so a reader asking "what
  // did this match pay" got the answer for every match since the page loaded;
  // and a long session simply grew it forever. A DIAGNOSTIC that outlives the
  // thing it describes is worse than no diagnostic, and one that leaks memory on
  // a page nobody restarts is a defect on its own.
  //
  // THE CAP IS A RING WITH A COUNTER, never a silent truncation. `routedDropped`
  // says how many fell off the front, so a reader can always tell a complete
  // ledger from a window onto one. The size is generous against what a match can
  // actually pay — the demo's whole 16,000-tick arc drops a few hundred orbs —
  // so a run that reaches the cap is already telling you something.
  var routed = [];
  var routedDropped = 0;
  var ROUTED_MAX = 4096;
  // The two lids on a routed payment. SEAT_MAX is production's four-seat design
  // (the POR's §0, "Four seats per room is the design") with headroom, and it is
  // a lid rather than a live roster read because the roster's own answer is
  // production's to give — `addXp` reports it (fix 4) and this only refuses the
  // obviously absurd before asking. CREDIT_MAX is far above anything the kernel
  // can emit: the richest body in the STATS table drops 20.
  var SEAT_MAX = 64;
  var CREDIT_MAX = 1e6;

  function noop() {}

  // The sink's DEFAULT, and it is a real object rather than an absent one: the
  // kernel's own setSink() already folds a missing member to a noop, so handing
  // it three noops is the same contract stated where a reader of THIS file can
  // see it. A host that wants the kernel's captions and cues passes its own.
  // `hurt` is the one member whose default is a REFUSAL rather than a noop —
  // see the kernel's fifth channel. A host that hands the kernel this set is
  // saying "nobody owns these seats' hulls", and the honest answer to "did the
  // hull take it" is then no.
  function hurtRefused() { return false; }
  function noopSink() { return { state: noop, caption: noop, cue: noop, credit: noop, hurt: hurtRefused }; }

  // ---- THE CREDIT ROUTE (S3b lane 2, commit D) ----------------------------
  // The kernel emits `credit(seat, value)` when a seat banks an orb and stops
  // there — it reads no production surface, ever. THIS is where the payment
  // becomes money, and it is one call:
  //
  //     Encounter.addXp(value, seat)
  //
  // WHY ONE CALL IS THE WHOLE INTEGRATION, and it is worth stating because it
  // looks too small. `addXp` is production's ONE credit site and it moves three
  // things at once — the seat's WALLET (`S.xp`, which the shop is the only drain
  // on), its SCOREBOARD (`S.score`) and its HIGH-WATER MARK (`S.best`, "the
  // standing, maintained continuously rather than stamped at the death that
  // takes the score"). Everything downstream is a DERIVATION off those three and
  // needs no wiring at all: `ownedFor(seat)` reads what the wallet bought,
  // `termsFor(seat)` is the ONE derivation the shop panel and the phase-11
  // predictor both read, `boardRanking()` sorts on `best`, and `kingSeat()` — the
  // ONE derivation the board's crowned row and the field crown over the leader's
  // ship both call — reads the top of that ranking. So the crown follows the
  // scoring seat for free, and it follows it BECAUSE there is one derivation
  // rather than because this file arranged for it to.
  //
  // THE GUARDS, and each one refuses rather than folding:
  //   * NO PRODUCTION, NO ROUTE. demo-play.html and demo-lab.html load the
  //     kernel, the renderer and this host and do NOT load js/encounter.js, so
  //     on those pages there is nothing to pay and the route reports so. It is
  //     not an error: a lab page has no economy.
  //   * SEAT -1 IS NOBODY AND IS NOT SEAT 0. The kernel spells "no seat" as -1
  //     throughout, and `addXp`'s own signature defaults a MISSING seat to 0 —
  //     so handing it a -1 unguarded would be safe, and handing it `undefined`
  //     would silently pay seat 0. Refusing here is what keeps the two spellings
  //     from meeting.
  //   * A NON-POSITIVE OR NON-FINITE VALUE IS REFUSED. production's wallet is
  //     uncapped and `addXp` does no validation of its own — `S.xp += NaN`
  //     poisons a wallet permanently and no gate would say so — so the boundary
  //     check lives at the crossing, which is here. This is bf2c961's lesson
  //     (server input hardening) applied at a second seam.
  //
  // IT DOES NOT REPLACE THE CALLER'S SINK. A host that supplies its own `credit`
  // still gets called; the route is additive. Two different questions — "what
  // did the kernel pay" and "where did the money go" — and a host that muted one
  // by supplying the other would have no way to observe the first.
  // ---- D55's PICKUP STAGGER (PORT-P P-SIM batch 2) ------------------------
  // Three orbs taken on ONE tick used to be three `pickup` cues in one audio
  // instant, which the mixer hears as one louder pickup. D55 wants a RUN of
  // notes, so the cues are queued per seat and released one every
  // PICKUP_STAGGER ticks.
  //   THE NUMBER IS STRUCTURAL, NOT A DIAL (D67 class 4). It exists only to
  // clear js/audio.js's own per-seat gate, which is 45 ms: 4 ticks is 66.7 ms
  // at 60 Hz and clears it with margin, while 3 ticks is 50.0 ms — 5 ms of
  // margin against an audio layer that coalesces up to five sim ticks into one
  // instant. It is not a play number, so it gets no panel row. The read
  // accessor `pickupStagger()` publishes it, so a leg asserts the pacing
  // against the constant rather than against a restated literal.
  //   THE CLOCK IS `stepped`, the host's own tick counter, so the pacing is
  // deterministic and carries no wall clock.
  var PICKUP_STAGGER_TICKS = 4;
  var PICKUP_Q_MAX = 24;
  var pickupQ = [];
  var pickupNext = [];
  function queuePickup(at) {
    // demo-play.html steps the kernel DIRECTLY and never calls step(), so on
    // that page nothing would ever drain this queue. There is no production
    // there either, routeCue is already a no-op, and the page's own sink still
    // hears every pickup at the landing tick.
    if (!productionEncounter()) return;
    var a = at || null;
    var s = a && typeof a.seat === "number" && isFinite(a.seat)
      && Math.floor(a.seat) === a.seat && a.seat >= 0 && a.seat <= SEAT_MAX ? a.seat : -1;
    if (s < 0) { routeCue("pickup", a); return; }
    if (!pickupQ[s]) pickupQ[s] = [];
    if (pickupQ[s].length >= PICKUP_Q_MAX) pickupQ[s].shift();
    pickupQ[s].push({ x: a.x, y: a.y, seat: s });
  }
  function drainPickupCues() {
    for (var s = 0; s < pickupQ.length; s++) {
      var q = pickupQ[s];
      if (!q || !q.length) continue;
      if (stepped < (pickupNext[s] || 0)) continue;
      routeCue("pickup", q.shift());
      pickupNext[s] = stepped + PICKUP_STAGGER_TICKS;
    }
  }
  // ...AND THE STAGGER QUEUE CLEARS WITH THE LEDGER. A queue that survived a
  // restart would sound a pickup for an orb from the room before it.
  function clearLedger() { routed = []; routedDropped = 0; pickupQ = []; pickupNext = []; }

  function routeCredit(seat, value) {
    var enc = productionEncounter();
    if (!enc || typeof enc.addXp !== "function") return false;
    // ---- TOTAL, AND LIDDED (S3b-C fix 9) --------------------------------
    // The first cut led with `isFinite(seat)`, which is not total: `isFinite`
    // COERCES, and coercion THROWS for a BigInt and for a Symbol. A boundary
    // guard that throws on a value it was written to refuse is not a guard —
    // it turns a malformed payment into a page error, which is the opposite of
    // what "a refusal is whole" means. So the TYPE test comes first on both
    // arguments, and nothing is coerced after it.
    if (typeof seat !== "number" || !isFinite(seat)
        || Math.floor(seat) !== seat || seat < 0 || seat > SEAT_MAX) return false;
    // ...and the value carries a LID as well as a floor, which the first cut did
    // not. `addXp` is uncapped by design — "an uncapped wallet, no threshold, no
    // level; the shop is the only drain" — so two payments of Number.MAX_VALUE
    // put the wallet, the score AND the high-water mark at Infinity, and a
    // scoreboard of Infinity never comes back. The lid is production's own
    // POINTER_MAX idiom at a second seam (server/sim-host.mjs), and it is far
    // above anything the kernel can emit: the richest body in the table drops 20.
    if (typeof value !== "number" || !isFinite(value) || value <= 0
        || value > CREDIT_MAX) return false;
    // ...AND PRODUCTION GETS THE LAST WORD (S3b-C fix 4). The three guards
    // above check the payment's SHAPE; only production knows whether it owns
    // this seat. Its roster is sized by `setPlayerCount` and the kernel's is
    // sized separately, so a two-seat kernel against a one-seat room is an
    // ordinary state, not a corruption — `addXp` declines it silently and
    // always has. What was wrong was that this host RECORDED the payment and
    // told its caller it had happened. It reports now, and a decline is a
    // refusal like any other: no ledger entry, and `false` to the wrapper.
    if (enc.addXp(value, seat) !== true) return false;
    routed.push({ seat: seat, value: value });
    if (routed.length > ROUTED_MAX) { routed.shift(); routedDropped += 1; }
    return true;
  }

  // ---- THE HURT ROUTE (S3b lane 3, commit A) ------------------------------
  // The credit route's twin, at the other end of the same seam. The kernel
  // emits `hurt(seat, amount, src)` when it would have damaged a POSE-DRIVEN
  // seat and stops there — it reads no production surface, ever. THIS is where
  // the damage becomes a hull loss, and it is one call:
  //
  //     Encounter.hitPlayer(seat, amount, src)
  //
  // ONE CALL IS THE WHOLE INTEGRATION, for `addXp`'s reason at the other seam:
  // `hitPlayer` is production's ONE ship-damage site. It runs the dead-seat
  // refusal, D28's source-scoped comet refusal, the i-frame gate, the matrix
  // consultation and — where the hull reaches zero — `deathToll`, the crown, the
  // orb payout and the wipe arm. Everything downstream of a pilot's death is a
  // derivation off that one call, so nothing here has to arrange for any of it.
  //
  // THE SOURCE RECORD CROSSES UNCHANGED. `{ kind, cls }` is the shape R5's G1
  // scan pins on every production caller and it is the shape the kernel's five
  // constants are written in. This host does not classify: a host inventing a
  // kind would be a second authority on which damage the comet refuses, and the
  // kernel is the file that knows what dealt the blow.
  //
  // THE GUARDS ARE `routeCredit`'s, TOTAL AND LIDDED, and they are here for
  // bf2c961's lesson at a third seam. The type test comes FIRST on both
  // arguments and nothing is coerced after it, because `isFinite` throws for a
  // BigInt and a boundary guard that throws on a value it exists to refuse is
  // not a guard.
  //
  // THE AMOUNT'S LID IS `hitPlayer`'s OWN EXPOSURE. It subtracts through
  // `Engine.applyEffect` with no cap of its own, so an infinite or absurd
  // amount is an unkillable-to-instantly-dead switch with nothing in the gate
  // to say so. HURT_MAX is far above anything this kernel deals: its heaviest
  // single blow is the star eater's CONTACT 26 — the `contact:` field on its
  // STATS row (js/demo-kernel.js:235), reached through the generic contact
  // block. CORRECTED AT PORT-S S5 COMMIT A: this said "the star eater's 18",
  // which is its BEAM. The kernel's per-hit range is 5 (the snapper's
  // non-lunge contact) to 26, and the census that measures it is
  // test/tools/demo-host.mjs LEG 17.
  //
  // A REFUSAL RETURNS FALSE AND WRITES NOTHING. `hitPlayer` itself returns
  // false for each of its three gates, so a caller cannot tell a malformed
  // amount from a graced hit — which is correct, because the kernel's contact
  // branches ask one question and it is "did the hull take it".
  var HURT_MAX = 1e6;

  // See the cue route in `kernelSink` above. The guards are the family's:
  // a non-string name is refused whole, and a seat outside the enumeration is
  // dropped to "nobody" rather than folded to seat 0 — `emit`'s own `seat`
  // argument reaches `att()` and the audio layer's per-seat buckets, and the
  // kernel spells "nobody" as -1 exactly as production does.
  // `rec` (r7b) is the WIDE record the four split kinds carry. THIS ROUTE
  // DISCARDED EVERY FIELD BUT x/y/seat until r7b: `pos` below is built from two
  // numbers and `enc.emit` was called with four arguments, so a roundSpawn's
  // id, kind, velocity and life all died here. It rides as a trailing argument
  // rather than inside `pos`, so the narrow route's shape does not move.
  function routeCue(name, at, rec) {
    var enc = productionEncounter();
    if (!enc || typeof enc.emit !== "function") return false;
    if (typeof name !== "string" || !name) return false;
    var a = at || null;
    var pos = a && Number.isFinite(a.x) && Number.isFinite(a.y) ? { x: a.x, y: a.y } : undefined;
    var seat = a && typeof a.seat === "number" && isFinite(a.seat)
      && Math.floor(a.seat) === a.seat && a.seat >= 0 && a.seat <= SEAT_MAX ? a.seat : undefined;
    enc.emit(name, pos, undefined, seat, undefined, undefined, undefined, rec);
    return true;
  }

  // ---- THE SEAM SCALE (PORT-S S5, commit A) -------------------------------
  // THE ONE UNIT CONVERSION ON THIS SEAM, and it is the round's most important
  // line. The kernel deals damage in KERNEL HULL POINTS and production's ship
  // carries THREE. Unscaled — which is what shipped until this commit — the
  // kernel's SMALLEST blow (the snapper's contact 5, js/demo-kernel.js:3361)
  // one-shots a production pilot, and so does every one of the twenty-odd
  // blows above it, up to the star eater's GENERIC BODY CONTACT of 26 (the
  // `contact:` on the `starEater` STATS row, js/demo-kernel.js:235, reached
  // through the generic contact block at `:3359`). Nothing in the demo the
  // owner flew and PASSed behaves that way, because in the demo those numbers
  // are read against a hull of 100.
  //
  // IT IS NOT THE TAIL, and the census paragraph above already had this right
  // (CORRECTED AT THE S5 FIX ROUND, Codex CX-9). The star eater's TAIL
  // SEGMENTS deal 15 through `SRC_RAM` (js/demo-kernel.js:3397-3401) — a
  // separate block with its own amount, and one a burning pilot is immune to
  // by D28's letter. 26 is the body.
  //
  // SO THE RATIO IS WHAT CROSSES, not the number. `ECFG.player.hull /
  // KERNEL_HULL` = 3 / 100, and every kernel blow keeps the FRACTION OF A HULL
  // it costs in the demo: a 6-damage omegaSide round (js/demo-kernel.js:4265)
  // costs 6 % of a pilot, a 24-damage kinetic lance (`:4261`) 24 %, the star
  // eater's body contact 26 % — and its TAIL, which is a different block with a
  // different number, 15 %.
  //
  // KERNEL_HULL IS A NAME THIS FILE INVENTS, and it is named because the
  // kernel's own 100 is an inline literal written TWICE — js/demo-kernel.js:1380
  // (`hull: 100`) and `:1381` (`maxHull: 100`) on the bounded branch of
  // `newPlayer`, repeated verbatim at `:1388-1389` on the unbounded twin. There
  // is no constant there to import, so the derivation is written here beside
  // the number instead of being left to a reader's arithmetic.
  //
  // THE ALTERNATIVE WAS DECLINED, and it is worth naming so the next reader
  // does not re-propose it: production could have ADOPTED the kernel's hull of
  // 100 and rescaled its own ship-damage plane instead. That is a 13-trace
  // golden recapture plus selfcheck, paid for HUD legibility — the wrong trade
  // for a round whose whole proof is that nothing moves.
  //
  // THE PRODUCT STAYS EXACT. No rounding, no floor: `hull` is a float in the
  // encounter hash, and a `Math.round` here would quantize every kernel blow to
  // a whole production hull point — which at a scale of 0.03 rounds all but the
  // heaviest of them to ZERO.
  //
  // THE SINK STILL SEES THE KERNEL'S OWN NUMBER. `kernelSink`'s `hurt` wrapper
  // below hands the caller the amount it passed in, unscaled, because the
  // caller is the kernel and its cue/FX layer reasons in kernel units. Only the
  // number that reaches production's hull is converted.
  var KERNEL_HULL = 100;

  function kernelHurtScale() {
    var enc = productionEncounter();
    if (!enc || typeof enc.playerHullBase !== "function") return 1;
    var base = enc.playerHullBase();
    // A GUARD, NOT A DEFAULT WITH OPINIONS. An absent or malformed base leaves
    // the seam at 1 — the shipped behaviour — rather than inventing a ratio.
    if (typeof base !== "number" || !isFinite(base) || base <= 0) return 1;
    return base / KERNEL_HULL;
  }

  function routeHurt(seat, amount, src) {
    var enc = productionEncounter();
    if (!enc || typeof enc.hitPlayer !== "function") return false;
    if (typeof seat !== "number" || !isFinite(seat)
        || Math.floor(seat) !== seat || seat < 0 || seat > SEAT_MAX) return false;
    if (typeof amount !== "number" || !isFinite(amount) || amount <= 0
        || amount > HURT_MAX) return false;
    // THE GUARDS RUN ON THE KERNEL'S NUMBER, and the scale after them. The lid
    // is `hitPlayer`'s exposure expressed in kernel units, which is what the
    // caller passes; scaling first would let an absurd amount through the lid
    // by shrinking under it.
    var scaled = amount * kernelHurtScale();
    if (!isFinite(scaled) || scaled <= 0) return false;
    return enc.hitPlayer(seat, scaled, src) === true;
  }

  // ---- THE BODY SWEEP (S3b lane 3, commit B) ------------------------------
  // Production's player-bullet plane SURVIVES the retirement. The bench and its
  // ability masks, the fire-time rebate, the phase-11 predictor and every
  // committed flight fixture hang off it, and none of that is the demo's to
  // replace. What retires is the thing the plane SHOT AT, so the plane's enemy
  // arm re-aims here.
  //
  // TWO CALLS, BECAUSE THE ARM ASKS TWO QUESTIONS. `bodies()` is what is there;
  // `damageBody()` is hurt that. Both go through the kernel's own published
  // members, so this file is still the ONE place that knows there is a kernel.
  //
  // ---- THE FIELD CONTRACT, stated because production reads it directly -----
  // `bodies()` hands back the KERNEL'S LIVE ARRAY, on production's own
  // `mapState` footing: read-only, never mutated by a caller, and re-read each
  // tick rather than cached, because `resetRun` REPLACES it. Each record
  // carries `x`, `y`, `r`, `hp` and `dead` under those exact spellings — the
  // four fields a swept-circle test and a liveness gate need — and production's
  // sweep reads no other key on it.
  //
  // A COPY PER CALL WAS THE ALTERNATIVE AND IT IS THE WRONG TRADE. The sweep
  // runs per bullet per tick, so a wrapper array per call is a wrapper array
  // per bullet; the cost lands on the plane that is being kept.
  //
  // ---- WHAT THE ARM MAY NOT DO, and it is the anvil ------------------------
  // Production's frontal-arc block reads `hit.stats.arc` and `hit.face`, which
  // are the OLD roster's shield. This kernel has its own directional
  // reductions, inside `damageEnemy`, keyed on the `shot` cause — the bulwark's
  // 76 %, the minelayer's 55 %, the station's five weak points. So the arm does
  // NOT re-implement an arc for a kernel body: it hands the blow to the door
  // and the door applies whatever that body's own shield says. Two shields, one
  // owner each.
  //
  // ---- THE COORDINATE NOTE, AND IT HAS EXPIRED ----------------------------
  // This sweep compares production's bullet coordinates against kernel body
  // coordinates as plain numbers, which is only MEANINGFUL once the two worlds
  // are one. THEY ARE, since commit C: production took the kernel's arena
  // whole — 7680x7920, in 1280x720 boxes — and the 3072x3762 world it left
  // CEASED rather than being mapped. Nothing converts here because there is
  // nothing to convert, and the note is kept because a reader finding two
  // planes' coordinates compared as plain numbers deserves to be told why that
  // is sound. The refusal it records — no scale maps the old world onto the
  // new, the viewport grew NON-UNIFORMLY — is the same one the aim seam and
  // the pose bridge make, and it is why every trace was re-authored.
  function bodies() {
    if (!kernel || typeof kernel.bodies !== "function") return EMPTY_BODIES;
    var list = kernel.bodies();
    return list && typeof list.length === "number" ? list : EMPTY_BODIES;
  }
  // ONE frozen empty array rather than a fresh `[]` per call: the sweep asks
  // once per tick on a surface with no kernel at all, and a fresh array there
  // would be an allocation per tick for a plane that does not exist.
  var EMPTY_BODIES = [];

  // ---- THE ORDNANCE HALF OF THE SAME DOOR (D51, PORT-F) -------------------
  // `bodies()` is what production's rounds shoot AT; this is what they shoot
  // at NEXT. D51 makes production's gun able to intercept the kernel's enemy
  // ROUNDS — the thirteen hp-bearing kinds — and it is ROUTE H: the kernel is
  // not edited at all. `kernel.S` is a published member (js/demo-kernel.js:5560)
  // and this file already reads it twice, so the array is reachable without a
  // new kernel accessor and `sha256 js/demo-kernel.js` does not move. That
  // matters beyond tidiness: both bounded manifests carry a `kernelSha256`
  // field whose only comparison sits inside a divergence branch, so a kernel
  // edit here would leave a green gate and a false field.
  //   UNFILTERED, and that is the mirror of `bodies()`. The kernel's own
  // player-round pass filters its candidate list ONCE outside both loops
  // because it is O(rounds²) otherwise; production's sweep reads the LIVE
  // array, so the liveness terms travel with the CALLER (js/encounter.js) and
  // are applied per candidate. The visible consequence is a one-tick
  // disagreement about when a newborn shard becomes shootable, and it is
  // named at the caller.
  //   IT READS `S.bullets` AND NO OTHER MEMBER OF `S`, deliberately:
  // test/node-golden.mjs:1548-1578 scans this file for stray `S.players`
  // references, and the narrow read is what keeps that scan honest.
  function rounds() {
    var S = kernel && kernel.S;
    var list = S && S.bullets;
    return list && typeof list.length === "number" ? list : EMPTY_ROUNDS;
  }
  var EMPTY_ROUNDS = []; // EMPTY_BODIES' reason, not a second opinion about it

  // The guards are `routeHurt`'s, for `routeHurt`'s reason. The seat is an
  // ENUMERATION and is refused whole; the amount carries a floor and a LID,
  // because `damageEnemy` subtracts through `Engine.applyEffect` with no cap of
  // its own. The BODY is checked at the far end, by the kernel, which is the
  // only side that knows whether the reference is still live.
  function damageKernelBody(body, amount, x, y, seat, cause) {
    if (!kernel || typeof kernel.damageBody !== "function") return false;
    if (typeof seat !== "number" || !isFinite(seat)
        || Math.floor(seat) !== seat || seat < 0 || seat > SEAT_MAX) return false;
    if (typeof amount !== "number" || !isFinite(amount) || amount <= 0
        || amount > HURT_MAX) return false;
    return kernel.damageBody(body, amount, x, y, seat, cause) === true;
  }

  // The ordnance twin of `damageKernelBody`, and every difference from it is a
  // ruling rather than a shortcut (D51, PORT-F).
  //   SEATLESS, AND THAT IS A MEASUREMENT. js/demo-kernel.js:4787-4795 records
  // that adding a `seat` to the kernel's own ordnance `applyEffect` DIVERGES
  // the bounded AUTO fixture at tick 1952 — the tick a player round first
  // destroys an enemy round — for a key nothing in that kernel consults. So
  // this call mirrors :4798 exactly: a bare `{ cls: CLASS.SHIP }` source, no
  // `lastAtk`, no seat write. There is therefore no `seat` guard here, because
  // there is no seat: the whole enumeration check that `damageKernelBody`
  // carries would be guarding an argument that does not exist.
  //   IT GOES THROUGH `Engine.applyEffect` AND NOT THROUGH `o.hp -=`, and that
  // is enforced: test/node-golden.mjs:200-223 counts direct hp/hull writes
  // across the seven SIM_FILES and its own comment names this interaction as
  // wanted. `Engine` is a global here — js/engine.js:1675 publishes it and
  // js/demo-kernel.js:425 already calls it bare — and the Node host loads
  // engine, kernel and this file into ONE vm context.
  //   THE DEATH DETONATES, and D62 (PORT-P) IS THAT DECISION. This used to be
  // a BARE death, matching the kernel's own player-round pass rather than the
  // aura's `explodeEnemyBullet`; the two idioms disagreed — burning a grenade
  // fanned seven clusters and shooting the same grenade fanned none — and
  // reconciling them was called a balance decision that did not belong inside
  // D51's arm. The owner made it, the other way round: THE GUN DETONATES, THE
  // AURA DENIES. So the split happens HERE now, and the halo's death is bare
  // for every kind. It goes through the kernel's `explodeRound`, which stages
  // the children, so a gun-born child never enters the live array the sweep at
  // js/encounter.js is walking. Neither branch splices: the compaction at the
  // end of the kernel's own updateBullets takes the corpse on ITS next step,
  // so THE HOST NEVER SPLICES.
  //   AND NO `burst`: the kernel's death FX is kernel-internal, so a host-side
  // kill is visually silent. Named, not worked around from outside.
  //   The AMOUNT guards are `damageKernelBody`'s, for its reason: a floor and
  // a LID, because applyEffect subtracts with no cap of its own. The ROUND is
  // checked here for existence only; liveness is the caller's, per candidate.
  function damageKernelRound(round, amount) {
    if (!kernel || !round) return false;
    if (typeof amount !== "number" || !isFinite(amount) || amount <= 0
        || amount > HURT_MAX) return false;
    var dealt = Engine.applyEffect({
      kind: "shot", target: round, tgtCls: Engine.CLASS.ORDNANCE,
      source: { cls: Engine.CLASS.SHIP }, baseAmount: amount
    });
    if (dealt === null) return false; // the matrix refused: a SKIP, nothing happened
    if (round.hp <= 0) {
      // D62 (PORT-P) — THE POLARITY IS INVERTED. The gun detonates.
      if (kernel && typeof kernel.explodeRound === "function") kernel.explodeRound(round, "shot");
      else round.dead = true;
    }
    return true;
  }

  // ---- THE DEATH WINDOW, ROUTED (S3b lane 3, FIX 1 / S3BR-01) -------------
  // The sweep's third and fourth calls, and they are a PAIR: production arms
  // the window before its bullet-resolve phase and flushes it at `encStep`'s
  // reap slot, so a kernel body killed by a production round dies where the
  // retired `reapDead` died — AFTER the killing shot has emitted its own `hit`
  // and resolved its own blast.
  //
  // THE FLUSH IS UNCONDITIONAL AT ITS CALL SITE and this facade must therefore
  // never throw or wedge when it is uninstalled: both answer 0/false on a
  // kernel that is absent or does not publish the pair, exactly as `bodies()`
  // answers an empty list. A production tick on a page with no host must cost
  // nothing, which is what commit A's whole seam is built on.
  //
  // ARMING IS NOT IDEMPOTENT-BY-ACCIDENT: `armDeaths` clears the pending list,
  // so an arm without a matching flush drops the marks rather than carrying
  // them into the next tick. That is the safe direction — a carried mark is a
  // body that dies a tick late with a stale cause, and a dropped one is a body
  // already sitting at hp <= 0 that the kernel's own next pass reaps.
  function armKernelDeaths() {
    if (!kernel || typeof kernel.armDeaths !== "function") return false;
    kernel.armDeaths();
    return true;
  }
  function flushKernelDeaths() {
    if (!kernel || typeof kernel.flushDeaths !== "function") return 0;
    var n = kernel.flushDeaths();
    return typeof n === "number" && isFinite(n) ? n : 0;
  }

  // ---- THE ATOMIC RESET (S3b lane 3, FIX 10 / S3BR-10) --------------------
  // A one-seat WIPE reaches `DemoKernel.reset` from inside `Encounter.step` —
  // which is AFTER the tick's only pose push. `resetRun` rebuilds a native live
  // pilot at hull 100 in its own default position, and the host's bookkeeping
  // still marks that seat pose-driven, so for one whole tick production said
  // "absent, hull 0" while the kernel said "alive, hull 100, elsewhere". The
  // next tick's pose repaired it before any body advanced, which is what kept
  // the finding LOW rather than a live combat defect — but a hash expansion, an
  // end-of-tick kernel consumer or a render of that frame would all have seen
  // the phantom.
  //
  // TWO CALLS, AND THEY ARE DELIBERATELY NOT ONE. The reset cannot re-pose by
  // itself, and the first cut of this fix tried to: it re-applied the last
  // ACCEPTED pose, which is a pose from BEFORE the reset. On the `restart` path
  // that pose can be a DEAD seat — restart's whole job is to revive it — so
  // re-applying it un-revived the seat, production saw nobody alive, and the
  // next tick fired a WIPE that reset again. Measured, not reasoned: it broke
  // demo-host LEG 8's two-seat staging outright.
  //
  // SO PRODUCTION RE-POSES, because production is the only side that knows what
  // the seats are AFTER its own reset. The host's job is the second half: the
  // bridge BANKS a pose for the next step, and there is no next step before
  // control returns to `Encounter.step`, so `applyPosesNow` lands the banked
  // poses on the records inside the same statement.
  function resetKernel(seed) {
    if (!kernel || typeof kernel.reset !== "function") return false;
    kernel.reset(seed >>> 0);
    return true;
  }
  // ---- THE ROSTER'S SIZE, ACROSS THE SEAM (PORT-S S4, commit A) -----------
  // Production owns HOW MANY SEATS THE ROOM HAS; this kernel owns the records
  // that stand behind them. Before this call the two rosters were sized on
  // opposite sides of a seam with no crossing — `js/game.js`'s `setPlayerCount`
  // on one side, nothing at all on the other — and the kernel's stayed at the
  // ONE seat `resetRun` builds. `pushSeatPose` refused every seat past 0 for
  // that reason, and `poseKernelSeats`' own comment named the refusal.
  //
  // IT IS A SIZE, NOT A CLAIM LIST. Whether a seat is claimed, parked, absent
  // or flying stays production's fact and crosses in the POSE (`alive`), which
  // is the shape this seam already had. Nothing here reads a claim.
  //
  // CALLED FROM `poseKernelSeats`, once per tick, before the pose loop — which
  // is also the call every reset path already re-runs, so a `resetRun` that
  // rebuilt the roster back to one seat is repaired inside the same statement.
  function setSeatCount(n) {
    if (!kernel || typeof kernel.setSeatCount !== "function") return 0;
    return kernel.setSeatCount(n);
  }
  // ---- PRESENCE, ACROSS THE SEAM (PORT-S S4, commit D) --------------------
  // The SIZE crosses in `setSeatCount`; WHETHER SOMEBODY IS IN A SEAT crosses
  // here. They are two facts and they move on different clocks — a room keeps
  // four seats while a pilot parks and comes back — so they are two calls
  // rather than one composite the caller has to rebuild every tick.
  //
  // It is production's word and this file does not interpret it: `parkSeat` and
  // `unseatSeat` both set `absent` through `vacateSeat`, `reseatSeat` clears it,
  // and `poseKernelSeats` pushes `!absent`. What the kernel does with it — D14's
  // budget and D20's hull — is the kernel's.
  // ---- THE LIVE CENSUS, ACROSS THE SEAM (PORT-S S4, commit E) -------------
  // ONE derivation of "how many hostiles are on the field", and it is the
  // KERNEL'S: the clear gate reads it to decide whether a setpiece is over, and
  // production reads it through here for `foeCount()` and for the HUD's state
  // map. Before this, production walked `bodies()` and counted for itself in
  // TWO places, which is how a gate and a HUD come to disagree about whether a
  // room is empty.
  //
  // 0 WITH NOTHING INSTALLED, which is `bodies()`'s own contract and the truth
  // on a page with no encounter at all.
  function liveBodies() {
    if (!kernel || typeof kernel.liveBodies !== "function") return 0;
    return kernel.liveBodies();
  }
  // ---- THE DEV LEVER, ACROSS THE SEAM (PORT-S S4, commit G) ---------------
  // `devDealSetpiece(n)` jumps the kernel's director to setpiece n and returns
  // the wave it landed on. See the kernel's own block: it is the LATENCY RIG's
  // condition selector, its board wipe is the shape D21 forbids IN PLAY, and
  // what keeps it out of play is the CALLER — production's `dealWave`, whose
  // only non-test caller is `server/server.js`'s `applyLabFlags()` behind
  // `devTuneOn()`. This file adds no gate of its own, because a second gate here
  // would be a second authority on a question the census already answers.
  function devDealSetpiece(n) {
    if (!kernel || typeof kernel.devDealSetpiece !== "function") return false;
    return kernel.devDealSetpiece(n);
  }
  function setSeatPresent(seat, on) {
    if (!kernel || typeof kernel.setSeatPresent !== "function") return false;
    return kernel.setSeatPresent(seat, on);
  }
  // ---- D38's BUILD TOTAL, ACROSS THE SEAM (S4 fix 10) ---------------------
  // The same shape as `setSeatPresent` above and for the same reason: the SHOP
  // is production's plane and the kernel reads no production surface, so the
  // build arrives as ONE pushed scalar and the kernel decides what it means.
  // `poseKernelSeats` pushes it per tick; `bossHull` reads it at the deal. A
  // host with no kernel answers false, exactly as every other pass-through here.
  function setBuildPurchases(n) {
    if (!kernel || typeof kernel.setBuildPurchases !== "function") return false;
    return kernel.setBuildPurchases(n);
  }
  // ...and D38's DIAL ITSELF (the HOLD round, fix 14). The owner's ruling names
  // the DEV TUNE ROUTE as how the dial is turned, and the authoritative server
  // has no other door into the kernel: `server/server.js`'s `applyPvpTune` calls
  // this on change, behind the same two dev gates every tune rides. A host with
  // no kernel answers false, exactly as every pass-through here does.
  function setBuildScale(v) {
    if (!kernel || typeof kernel.setBuildScale !== "function") return false;
    return kernel.setBuildScale(v);
  }
  function applyPosesNow() {
    if (!kernel || typeof kernel.applyPoseNow !== "function") return 0;
    var n = 0;
    for (var s = 0; s < posedSeats.length; s++) {
      if (posedSeats[s] && kernel.applyPoseNow(s) === true) n++;
    }
    return n;
  }

  // ---- THE POSE BRIDGE (S3b lane 3, commit A) -----------------------------
  // The input bridge runs production's INTENT into the kernel; this runs
  // production's RESULT. They are two halves of one arrangement and the reason
  // both exist is the seat ruling this lane carries: PRODUCTION'S SHIP STAYS
  // THE SHIP and the kernel supplies THE ENCOUNTER.
  //
  // WHICH SEATS GET WHICH. A seat production flies is POSED and never BRIDGED —
  // bridging it would hand the kernel an input it is not going to integrate.
  // The bridge stays for the seats production does not own, which today is
  // every seat on the two lab pages, where there is no js/game.js at all.
  //
  // ---- EVERY UNIT THAT CROSSES, NAMED, on the input bridge's own footing ---
  //
  //   POSITION — CROSSES UNCHANGED, and this is the one line that is a promise
  //   about a LATER COMMIT rather than a conversion. The two worlds do not
  //   match today: production's is 3072x3762 and the kernel's arena is
  //   7680x7920. There is no scale that maps one onto the other — 3072x2.5 is
  //   7680 but 3762x2.5 is 9405 — which is exactly the NON-UNIFORM skew the aim
  //   seam refuses one screen up, and the reason this file has never scaled a
  //   position. So there is nothing to convert and nothing that COULD be
  //   converted: the flip commit gives production the kernel's arena, after
  //   which the two coordinate systems are one and this line is the identity by
  //   construction. Until then the only callers are harnesses that supply
  //   arena-space poses, and they say so at their staging.
  //
  //   VELOCITY — x60. Production's px/TICK against the kernel's px/SECOND, the
  //   same conversion the camera's third copy already carries, and it is TIME
  //   rather than distance so it survives the flip untouched.
  //
  //   ANGLE — CROSSES UNCHANGED. `heading` is production's converged nose (D32,
  //   hashed per-seat state); the kernel's `angle` is the same quantity under
  //   the same convention — radians, y DOWNWARD — so a conversion would be a
  //   rotation nobody asked for.
  //
  //   THE CLOCKS — ÷60. `invuln` and the hit flash are TICKS on production's
  //   side and SECONDS on the kernel's. They are mirrored rather than
  //   maintained: production owns both clocks, the kernel's copies exist so its
  //   own damage gate and its own hit tint agree with the one the wire carries.
  //
  //   THE HULL — CROSSES UNCHANGED, and it is a NUMBER on both sides with no
  //   scale between them. It is mirrored so bodies see an honest target: a
  //   kernel that kept its own hull would aggro on a pilot production had
  //   already killed.
  //
  // ---- THE SAME-TICK CONTRACT, AND THIS IS ITS ENFORCING SIDE -------------
  // `pushSeatFrame`'s block records that the cursor and the ship must be read
  // on the same tick, that nothing in this file could check it, and that lane 3
  // owed one of two things. This is where the obligation is paid, and the
  // answer taken is the MOVING-SHIP INTEGRATION LEG rather than a shared tick
  // token: a token would refuse a mismatch that a caller can simply avoid, and
  // this seam now has one real caller with one obvious pairing — the pose and
  // the frame are read from the SAME seat record in the SAME loop. A leg that
  // FLIES it is what proves the pairing; a token would only prove the token.
  // test/tools/demo-host.mjs LEG 7 is that leg, and it reds on a 0.157 rad
  // stale-anchor mutation — the exact size the Codex round measured.
  var POSE_TICKS_PER_SECOND = 60;

  function pushSeatPose(seat, pose) {
    if (!kernel || typeof kernel.setPose !== "function") return false;
    if (!Number.isInteger(seat) || seat < 0) return false;
    var q = pose || {};
    // Finite-or-nothing, never `v || 0`, and the whole pose is refused rather
    // than partly applied: a ship at a real position with a NaN velocity is a
    // ship the kernel's bodies would lead a shot against.
    if (!Number.isFinite(q.x) || !Number.isFinite(q.y)
        || !Number.isFinite(q.vx) || !Number.isFinite(q.vy)
        || !Number.isFinite(q.angle)) return false;
    var converted = {
      x: q.x,
      y: q.y,
      vx: q.vx * POSE_TICKS_PER_SECOND,
      vy: q.vy * POSE_TICKS_PER_SECOND,
      angle: q.angle,
      alive: q.alive !== false,
      hull: Number.isFinite(q.hull) ? q.hull : undefined,
      maxHull: Number.isFinite(q.hullMax) ? q.hullMax : undefined,
      invuln: Number.isFinite(q.invuln) ? q.invuln / POSE_TICKS_PER_SECOND : 0,
      flash: Number.isFinite(q.flash) ? q.flash / POSE_TICKS_PER_SECOND : 0,
      // THE HULL RADIUS — CROSSES UNCHANGED (commit C). It is a LENGTH, and
      // commit C's x2.5 already put production's `SHIP_R` into the arena's own
      // units, so a second conversion here would apply the ratio twice. The
      // kernel's four seat-radius sites read it and fall back to their own
      // shipped 7 and 8 when a pose carries none.
      r: Number.isFinite(q.r) && q.r > 0 ? q.r : undefined,
      // ---- THE COMET'S TWO POSE FIELDS (PORT-S S5, commit C) -------------
      // `comet` is production's BURNING flag and `auraR` is the halo radius it
      // computed for this tick. Both CROSS UNCHANGED: one is a boolean and the
      // other is a LENGTH in arena units, exactly like `r` beside it, so a
      // second conversion would apply a ratio that is already 1.
      //
      // THEY RIDE THE POSE AND NEVER THE RECORD. `test/tools/demo-serial.js`
      // hashes a kernel seat record WHOLE with its keys sorted, so one new key
      // on a player record re-keys both bounded manifests — the S3a STOP class.
      // The pose bank is not serialized, which is why the hull radius went the
      // same way at commit C of the previous lane.
      //
      // AN ABSENT PAIR MEANS NO AURA. A caller that knows nothing about comets
      // leaves both out and the kernel's `auraRadius` accessor answers its
      // caller-supplied default of 0 — no walk, and every surface unchanged.
      comet: q.comet === true,
      auraR: Number.isFinite(q.auraR) && q.auraR > 0 ? q.auraR : undefined
    };
    var ok = kernel.setPose(seat, converted);
    if (ok) { posedSeats[seat] = true; accepted[seat] = converted; }
    return ok;
  }

  // unposeSeat(seat) — the seat goes back to the kernel's own flight.
  // unbridgeSeat's shape, and it drops the record for the same reason: a pose
  // surviving a gap would be a ship from a session that ended.
  function unposeSeat(seat) {
    if (!Number.isInteger(seat) || seat < 0) return false;
    if (kernel && typeof kernel.setPose === "function") kernel.setPose(seat, null);
    posedSeats[seat] = false;
    accepted[seat] = null;
    return true;
  }

  // ---- install / uninstall ------------------------------------------------
  // The kernel is resolved HERE, at install time, and never at load time. That
  // is deliberate: a load-time resolve would make this file's script tag order
  // load-bearing on every page that carries it, for a dependency it does not use
  // until somebody drives it. Resolved late, the tag can sit anywhere.
  function resolveKernel(k) {
    if (k) return k;
    if (typeof window !== "undefined" && window.DemoKernel) return window.DemoKernel;
    if (typeof globalThis !== "undefined" && globalThis.DemoKernel) return globalThis.DemoKernel;
    return null;
  }

  // PRODUCTION, LOOKED UP LATE and never cached, for resolveKernel's reason and
  // one more of its own: the composed reset and the credit route are the only
  // two things here that reach production, they run on different pages, and a
  // page that has no js/encounter.js must get `null` rather than a stale
  // reference from whatever loaded last.
  function productionEncounter() {
    var enc = (typeof window !== "undefined" && window.Encounter)
      || (typeof globalThis !== "undefined" && globalThis.Encounter) || null;
    return enc || null;
  }

  // install(opts) — opts: { kernel, sink }, both optional.
  //   kernel  defaults to the published window.DemoKernel
  //   sink    defaults to three noops
  // Returns true when the host is installed and false when it refused, and it
  // REFUSES rather than half-installing: a kernel missing step, reset or a
  // numeric STEP is not a kernel this file can drive, and installing over it
  // would turn a load-order mistake into a silent no-tick at the first step().
  function install(opts) {
    var o = opts || {};
    var k = resolveKernel(o.kernel);
    if (!k || typeof k.step !== "function" || typeof k.reset !== "function"
        || typeof k.STEP !== "number") return false;
    // ---- AN INSTALL OVER A LIVE KERNEL DETACHES THE OLD ONE (fix 5) --------
    // The first cut overwrote the pointer and left the previous kernel wearing
    // this host's sink wrapper and this host's per-seat providers. The review
    // measured what that costs, and it is not only untidy: an event from the
    // ABANDONED kernel still routed money into production and still invoked the
    // NEW caller's sink, and after uninstall() the same event paid production
    // and then THREW, because the shared `sink` had been nulled while the
    // wrapper closing over it was still attached to k1.
    //
    // uninstall() already knew how to let a kernel go. Calling it is the fix,
    // and it is the right shape rather than a shortcut: "let go of the kernel I
    // am driving" has exactly one implementation, so a later member added to
    // the detach list cannot be forgotten here.
    if (kernel && kernel !== k) uninstall();
    kernel = k;
    clearLedger();
    setSink(o.sink);
    stepped = 0;
    return true;
  }

  // uninstall() — back to the load-time state, and it detaches the sink at the
  // KERNEL too. Leaving the host's sink installed on a kernel this file no
  // longer drives is the shape of leak that outlives the page that made it.
  function uninstall() {
    if (kernel && typeof kernel.setInput === "function") {
      for (var i = 0; i < bridgedSeats.length; i++) {
        if (bridgedSeats[i]) kernel.setInput(i, null);
      }
    }
    if (kernel && typeof kernel.setPose === "function") {
      for (var j = 0; j < posedSeats.length; j++) {
        if (posedSeats[j]) kernel.setPose(j, null);
      }
    }
    bridgedSeats = [];
    posedSeats = [];
    accepted = [];
    served = [];
    clearLedger();
    if (kernel && typeof kernel.setSink === "function") kernel.setSink(noopSink());
    kernel = null;
    sink = null;
    stepped = 0;
    banked = [];  // ...and the banked frames go with it, for uninstall()'s own
                  // reason: a frame surviving into the next install would be a
                  // pilot's input from a session that ended.
  }

  function installed() { return !!kernel; }

  // setSink(next) — wire the kernel's four channels. Absent members and an
  // absent argument both land on the noop set, which is what makes "the sink is
  // wired to a noop by default" true rather than merely intended.
  //
  // THREE CHANNELS PASS STRAIGHT THROUGH and the FOURTH IS INTERCEPTED. `state`,
  // `caption` and `cue` are things a host may want to see; `credit` is a payment
  // this host owes production, so what the kernel receives is a wrapper that
  // routes first and then hands the caller its own copy. The wrapper is built
  // once here rather than at each install, so there is one place that decides
  // what the kernel's sink IS.
  function setSink(next) {
    var n = next || {};
    sink = {
      state: typeof n.state === "function" ? n.state : noop,
      caption: typeof n.caption === "function" ? n.caption : noop,
      cue: typeof n.cue === "function" ? n.cue : noop,
      credit: typeof n.credit === "function" ? n.credit : noop,
      hurt: typeof n.hurt === "function" ? n.hurt : hurtRefused
    };
    if (kernel && typeof kernel.setSink === "function") kernel.setSink(kernelSink());
    return sink;
  }

  // What the KERNEL is handed. Distinct from `sink`, which is what the CALLER
  // asked for: the two differ on exactly one member and a reader who conflated
  // them would conclude the route was the caller's.
  function kernelSink() {
    return {
      state: function () { sink.state.apply(null, arguments); },
      caption: function (t) { sink.caption(t); },
      // ---- THE CUE ROUTE (S3b lane 3, commit D4) --------------------------
      // The credit and hurt routes' third sibling, and it arrives with the
      // commit that deletes production's own body cues. `reapDead` raised
      // `kill` and `killheavy`; `spawnGroup` raised `warn`, `spawn` and
      // `spawnheavy`; the anvil's block raised `clang`. All of them went with
      // the plane, and the successor plane raises its OWN — through this
      // channel, which reached the caller and stopped there.
      //
      // IT GOES INTO `Encounter.emit`, production's published queue, and that
      // is the whole integration for the same reason `addXp` was: ONE event
      // stream feeds the audio layer, the wire's `events[]` and every
      // fixture's recorded cue list. A route that reached js/audio.js directly
      // would sound on the local speakers and be invisible to the other three.
      //
      // `emit` IS PUBLISHED FOR EXACTLY THIS, and the publish block says so —
      // "the ONE crossing that runs the other way". js/game.js already uses it
      // for the ship's own cues; this is a second producer on the same footing.
      //
      // A CUE WITH NO POSITION IS POSITIONLESS, not at the origin. Production's
      // `emit(kind, at, gain, seat)` takes `at` as a record with x/y or
      // `undefined`, and `att()` measured from the world origin would silence a
      // cue the pilot is standing next to. The kernel's payload carries `x`,
      // `y` and `seat`; a payload with neither coordinate crosses as undefined.
      cue: function (name, at) {
        // D55: `pickup` is STAGGERED per seat; every other cue routes at once.
        // r7b: the kernel's payload carries `rec` for the four split kinds and
        // nothing else — every other cue forwards `undefined` and routes exactly
        // as it did.
        if (name === "pickup") queuePickup(at); else routeCue(name, at, at && at.rec);
        sink.cue(name, at);
      },
      credit: function (seat, value, at) {
        // ROUTE FIRST, THEN TELL THE CALLER. The order is deliberate and it is
        // the one a caller can reason about: by the time a host's own `credit`
        // handler runs, production's wallet has already moved, so a handler that
        // reads `Encounter.kingSeat()` sees the answer this payment produced
        // rather than the one before it.
        // ...AND THE PICKUP CUE NO LONGER RIDES WITH IT. It used to: the cue
        // was raised here, at the orb, and ONLY when the payment landed, so a
        // refused payment was silent. D55 (PORT-P) split the two moments — the
        // money moves at magnet entry and the orb is still in flight — so the
        // cue now leaves through the kernel's OWN cue channel at the LANDING,
        // at the taker's hull, and reaches this file through the staggered
        // `pickup` route above.
        //   IT COSTS ONE THING, NAMED: the cue and the payment are decoupled,
        // so an orb that lands after production DECLINED the payment (a
        // roster-size mismatch) still sounds. R7 owns that question.
        routeCredit(seat, value);
        sink.credit(seat, value, at);
      },
      // ---- THE HURT ROUTE (S3b lane 3, commit A) -------------------------
      // The credit channel's twin, and the SAME order for the same reason:
      // production decides first, then the caller is told what production
      // decided. It differs on one thing — this route RETURNS — because the
      // kernel's contact branches read the answer to arm their own cooldowns.
      //
      // WHAT THE CALLER'S OWN HANDLER GETS is production's verdict, not the
      // attempt: a handler that drew a hit spark on every call would draw one
      // for a refusal too, and the two commonest refusals here are exactly the
      // ones a pilot must SEE not happening — D28's comet contact refusal and
      // the i-frames.
      hurt: function (seat, amount, src) {
        var took = routeHurt(seat, amount, src);
        if (took) sink.hurt(seat, amount, src);
        return took;
      }
    };
  }

  // ---- THE RESET ORDER ----------------------------------------------------
  // FIXED, and a contract rather than a preference. The host owns the composed
  // reset precisely so a caller cannot get the order wrong:
  //
  //   1. PRODUCTION FIRST — window.Encounter.reset(seed), which is
  //      js/encounter.js's restart(seed) under its published name.
  //   2. THE KERNEL SECOND — DemoKernel.reset(seed).
  //
  // Production first because its restart is the GLOBAL discontinuity: it
  // re-syncs the seat records, re-deals wave 1, clears the event queue and
  // re-centres every ship, and everything else in the tree already
  // resynchronizes across it. A kernel seeded BEFORE that cut would be seeded
  // off state the cut is about to replace — which costs nothing today, because
  // nothing crosses the seam yet, and would cost a hash the first day something
  // does. One order, always, is cheaper than an order that becomes load-bearing
  // later.
  //
  // Production is OPTIONAL here on purpose: demo-play.html and demo-lab.html
  // load the kernel WITHOUT js/game.js and js/encounter.js, so on those pages
  // step 1 has nothing to call and is skipped. The return value reports which
  // halves actually ran, so a caller that expected both can tell.
  //
  // ---- THE ID-SPACE BILL FOR LANE 3, and it is NOT a collision -------------
  // S3B-MAP §2's restart row says the two resets "must run, in a fixed order, or
  // `nextId` spaces collide". Read against the tree, the ORDERING half is simply
  // not a mechanism:
  //
  //   js/encounter.js:536  `let nextEntityId = 1`, reset at :2952
  //   js/demo-kernel.js:266 `let nextId = 1`,      reset at :785
  //
  // Two variables, two separate IIFEs. Neither can see the other, so no ordering
  // of the two resets makes them interact and no ordering can make them collide.
  //
  // AN EARLIER DRAFT OF THIS BLOCK THEN NAMED THE WRONG HAZARD, and the Codex
  // vendor-cross round measured it wrong. It said equal id VALUES in different
  // families would alias, off production's own :532-535 clause about "a
  // replication layer keys by id alone". THEY DO NOT ALIAS. The wire keeps four
  // separate arrays (server/snapshot.mjs:312-333) and the client's presentation
  // decoder builds a SEPARATE Map per family — `e1by`, `m1by`, `o1by`, `b1by`
  // (js/net.js:2389, :2440, :2470, :2481). An enemy 7 and a bullet 7 are two
  // keys in two maps and never meet. A brief that prescribed "make the ids not
  // collide" would have bought a fix for a defect that is not there, and would
  // have shipped the real one.
  //
  // THE REAL CONSTRAINT IS GLOBAL MONOTONICITY, and it is imposed by the
  // PRESENTATION plane. js/game.js:4247-4260 declares ONE `PRES.maxId` across
  // all four id-keyed caches — "highest entity id ever captured — ids are
  // monotonic and never reused, so a NEW body wearing an id at or below this is
  // an ID-SPACE RESET". `presIdReset(list, map)` (:4280-4283) returns true when
  // ANY body in a list carries `id <= PRES.maxId` and is absent from ITS OWN
  // family map, and `capturePresent()` (:4314-4323) runs that test across all
  // four lists and, on any one of them, CLEARS ALL FOUR CACHES and zeroes
  // maxId. One global maximum, four families: this is the mechanism that
  // genuinely "cannot disambiguate by owning array".
  //
  // SO THE FAILURE NEEDS NO COLLISION AT ALL. Production has already presented
  // bullet id 100, so maxId is 100. After the flip the kernel introduces a NEW
  // enemy id 7, distinct from every live enemy id — no wire key is reused, no
  // map is aliased — and `7 <= 100 && !PRES.enemies.has(7)` fires. Every
  // presentation cache clears and the whole field takes an avoidable cold
  // presentation cut. A fix that only prevented duplicate VALUES, or that handed
  // the two producers disjoint RANGES, can still ship exactly this.
  //
  // LANE 3'S BILL, therefore, is one of two things and it must say which: A
  // GLOBALLY MONOTONE ID SOURCE ACROSS BOTH PRODUCERS, or a DELIBERATE
  // REPLACEMENT OF THE RESET DETECTOR. The review's proving leg, quoted:
  //
  //   "stage a high ID in one family, then introduce a distinct lower new ID in
  //    another and assert that the presentation caches do not globally reset.
  //    The lane-3 integration must coordinate a globally monotone ID source, or
  //    deliberately replace the reset detector; a duplicate-only mutation should
  //    red this leg."
  //
  // The leg is lane 3's to build, because lane 3 is where a second producer
  // first reaches `capturePresent()`. It is recorded here rather than only in a
  // lane report because this is the file the flip will be written in.
  function reset(seed) {
    var ranProduction = false;
    var ranKernel = false;
    var enc = productionEncounter();
    if (enc && typeof enc.reset === "function") { enc.reset(seed); ranProduction = true; }
    // ...AND THE KERNEL, unless production's own restart already carried it.
    // Since the flip (commit C) js/encounter.js's `restart` ends by resetting
    // the kernel whenever a host is installed — the SAME order this contract
    // states, kept in the one place production's four restart entry points all
    // reach. So on a flipped surface the reset below is already done, and doing
    // it twice would re-run a discontinuity that is meant to happen once.
    //
    // THE TEST IS `ranProduction`, not a flag: if production ran, and this host
    // is installed, then `kernelDriving()` was true inside it by construction —
    // the two predicates are the same call. Where there is no production at all
    // (the lab pages, every harness in this tree) nothing carried the kernel and
    // this line is the only reset it gets.
    if (kernel && !ranProduction) { kernel.reset(seed); ranKernel = true; }
    else if (kernel) ranKernel = true;
    stepped = 0;
    // ...AND THE PAYMENT LEDGER, for `stepped`'s own reason (S3b-C fix 3). A
    // restart is the global discontinuity everything else here resynchronizes
    // across; a ledger that survived it would answer "what did this match pay"
    // with every match since the page loaded.
    clearLedger();
    return { production: ranProduction, kernel: ranKernel };
  }

  // ---- THE CADENCE --------------------------------------------------------
  // ONE production tick, ONE kernel step, at the kernel's OWN fixed step.
  //
  // Production has no `dt` anywhere: the tick IS the unit, js/game.js's
  // FRAMES_PER_TICK is a render-side constant, and server/sim-host.mjs's
  // stepTick() advances the sim by exactly one. The kernel's step(dt) takes
  // SECONDS. So the conversion is the whole of this function, and it is a
  // constant, never a measurement.
  //
  // NEVER A WALL-CLOCK DELTA, and this is the load-bearing half. A host that
  // passed the real frame time would make the kernel's state a function of how
  // fast the machine ran, and every hash in this program is an equality between
  // two runs on two machines. demo-play.html and demo-lab.html both drive the
  // kernel off a rAF delta clamped to MAX_FRAME — correct for a page that only
  // has to LOOK right, and exactly what a hosted kernel may not do.
  //
  // kernel.STEP rather than a 1/60 written here: the kernel declares its own
  // step and a second copy in this file would be a second authority on it. An
  // install() that found no numeric STEP already refused, so this read is safe.
  function step() {
    if (!kernel) return false;
    kernel.step(kernel.STEP);
    stepped += 1;
    drainPickupCues();
    return true;
  }

  // ---- THE INPUT BRIDGE (commit E) ----------------------------------------
  // Production's banked per-seat input frames reach the kernel through per-seat
  // providers installed here. The shipped precedent this ports is
  // demo-play.html's own provider: it returns THRUST AXES and an AIM POINT as
  // two independent fields, and the page holds STAGE coordinates and converts
  // per step against the live origin.
  //
  // ---- EVERY UNIT THAT CROSSES, NAMED ------------------------------------
  // The two simulations disagree about time, about distance and about world
  // size, and each disagreement fails QUIETLY — as a ship in the wrong place
  // rather than as an error. So each one is spelled here rather than inferred.
  //
  //   THRUST — production banks `kx, ky` as a DIRECTION on the unit circle
  //   (keyDirection() normalises; sim-host clamps each component to [-1, 1]
  //   because "a client claiming a keyboard that pushes harder than a keyboard
  //   can" is not a value). The kernel's provider contract takes `x, y` as
  //   thrust axes and NORMALISES them itself, so magnitude does not matter on
  //   either side. THE PAIR CROSSES UNCHANGED, and THE x60 DOES NOT APPLY:
  //   the ×60 between these worlds is TIME (px/tick against px/second) and this
  //   pair is neither — it is a direction. Production's KEYTHRUST 16 and the
  //   kernel's own thrust constant sit on their OWN sides of the seam and
  //   neither crosses it.
  //
  //   AIM — an OFFSET FROM THE SEAT'S OWN SHIP, never an absolute world point.
  //   That is a seam rule and it was forced twice over. First by SIZE — and
  //   that half is now DISCHARGED, which is why this line is re-authored
  //   rather than left standing: the two worlds are the SAME 6x11 grid of
  //   view-sized rooms and the rooms are now the SAME SIZE. Production's field
  //   is 1280x720 for a 7680x7920 world (js/game.js:74-77) and the kernel's
  //   play box is 1280x720 for a 7680x7920 bounded arena
  //   (js/demo-kernel.js:250-258). This text said "512x342 for a 3072x3762
  //   world" and had been false since the FW flip; nothing derived from it.
  //   The rule stands on its SECOND leg alone, and that one is untouched —
  //   D13: an offset is derived from the tick's own cursor and carries no
  //   history, so an absolute point would smuggle one across the seam.
  //
  //   AIM SCALE — AIM_PX_PER_FIELD_PX below, and its derivation is written
  //   beside it because the choice is smaller than it looks. The kernel's aim
  //   pair reaches EXACTLY ONE consumer — a bearing (js/demo-kernel.js turns the
  //   nose toward atan2 of the delta, at 6.4 rad/s) — and a bearing is invariant
  //   under any POSITIVE UNIFORM scale. So the constant cannot get the aim
  //   DIRECTION wrong; what it decides is only how far out the aim point sits.
  //   What WOULD get the direction wrong is a NON-uniform scale, and the two
  //   worlds invite exactly that. Scaling the two axes by their own ratios would
  //   SKEW every bearing that is not on an axis — a diagonal aim would arrive
  //   several degrees off and nothing would say so. One uniform number,
  //   therefore, and it is the ACROSS ratio.
  //
  //   ---- CORRECTED AT PORT-S S4 COMMIT B: THE RATIO IS 1, NOT 2.5 ---------
  //   The S3b-R freeze reported this as residue and left it standing: the
  //   constant read `2.5 // = kernel PLAY_W 1280 / production FW 512`, and
  //   production's FW HAS BEEN 1280 since the flip (`js/game.js` — "logical
  //   field width — the VIEWPORT onto the world. x2.5, WAS 512"). The kernel's
  //   PLAY_W is 1280 too. So the stated derivation now evaluates to 1, and the
  //   number beside it was the answer to a world that no longer exists. The
  //   paragraph above it described that world as well and is corrected here.
  //
  //   THE CHANGE IS PROVEN NEUTRAL, NOT ASSERTED NEUTRAL. `test/tools/demo-
  //   host.mjs` LEG 14 drives TWO host builds — this one and one whose source
  //   carries the retired 2.5 — over a diagonal sweep of the whole field and
  //   compares the BEARING the kernel's own line computes, with `Object.is`.
  //   The invariance argument alone would not have been enough: the kernel's
  //   line is `atan2(delta(...), delta(...))` and `delta` WRAPS at half the
  //   world, so a large enough offset would wrap under one scale and not the
  //   other. It does not here — a cursor is bounded by the field, so 2.5x a
  //   half-field is 1600 px against a 3840 px half-world — and the leg is what
  //   says so rather than the reasoning.
  var AIM_PX_PER_FIELD_PX = 1; // = kernel PLAY_W 1280 / production FW 1280

  // FIRE is ability 0 (js/abilities.js:38, :73) and bit position IS the ability
  // id, so the trigger is bit 0 of the HELD mask. `ap` is the tick's press
  // EDGES and `ah` its live LEVELS; the kernel's `fire` is a held trigger, so it
  // reads the levels. A frame carrying neither mask decodes as 0 and 0 — no
  // ability pressed, none held — which is the shipped contract, not a guess.
  var FIRE_BIT = 1;

  // pushSeatFrame(seat, frame, ship) — hand this host ONE production-shaped
  // banked record for one seat.
  //
  //   frame  the record bankTickInput banks and pushInputFrame carries:
  //          { cx, cy, kx, ky, ap, ah, tf, ... }. cx/cy are PRODUCTION WORLD
  //          coordinates, already derived from screen space by clientStep()
  //          BEFORE step() on this same tick — which is why reading them here
  //          honours D13 rather than breaking it. This host re-derives nothing
  //          and banks no point of its own.
  //   ship   the SEAT'S OWN production ship position at bank time, { x, y }.
  //
  // WHY `ship` IS AN ARGUMENT AND NOT A LOOKUP. The offset needs production's
  // ship, and the only route to it from here is js/game.js's `__test` surface —
  // a test seam, which shipped code may not reach into. Passing it makes the
  // seam explicit at the call and keeps this file free of a seam it has no
  // right to. It also makes the offset's PAIRING obvious: the cursor and the
  // ship must be read on the SAME tick or the offset is a difference between
  // two moments.
  //
  // ---- AND THAT PAIRING IS A CONTRACT THIS SEAM CANNOT YET CHECK -----------
  // Written down here, and owed by the FIRST REAL CALLER, which is lane 3.
  //
  // `frame` and `ship` carry no common tick identity. Nothing in this function
  // can tell a correctly paired call from one whose anchor is a tick old, so a
  // caller that reads the cursor after the ship has already stepped gets a
  // silently rotated aim with no refusal and no diagnostic. The Codex
  // vendor-cross round measured the size of it: with the cursor at (200,200) and
  // the true ship at (100,100) the intended offset is (250,250), but an anchor
  // one tick stale at (90,120) banks (275,200) — a bearing shifted by about
  // 0.1566 rad, 8.97 degrees. That is a miss at range, and nothing says so.
  //
  // THE HARNESS IN test/tools/demo-host.mjs CANNOT CATCH IT, and it is worth
  // saying why rather than leaving a reader to assume otherwise: its 600-tick
  // two-seat integration supplies a CONSTANT ship, and its arithmetic probes
  // assume their own pair is correct. A wrong anchor supplied to either leaves
  // demo-host green. Only a MOVING ship, driven by the same loop that reads the
  // cursor, can expose the stale-anchor case.
  //
  // SO LANE 3 OWES ONE OF TWO THINGS, and it must say which:
  //   a MOVING-SHIP INTEGRATION LEG that banks the cursor and the ship from the
  //   SAME input tick and asserts the served bearing against the one that tick's
  //   pair implies; or a SHARED TICK TOKEN on the seam — a third field this
  //   function can compare and REFUSE on, which turns the contract from a
  //   sentence into a mechanism.
  //
  // THE ENFORCING LEG IS DEFERRED TO LANE 3 BY RULING, not by oversight. There
  // is no real caller yet: this lane's only callers are harnesses that supply
  // their own pair, so a leg written now would measure a staging choice rather
  // than a producer. The obligation is recorded at the API it constrains,
  // because that is the one place the caller who owes it will certainly read.
  //
  // THE THRUST FRAME RIDES THE FRAME, and ABSENCE IS A MEANING: `tf` absent is
  // `ship` — ship-relative, the D30/D32 default — and only the non-default is
  // spelled, exactly as bankTickInput spells it. The rotation itself is NOT done
  // here: it is done in the provider, against the kernel seat's CONVERGED NOSE
  // at the moment of the step, because that convergence is the passed feel and
  // a nose cached at bank time would be a nose one step stale.
  function pushSeatFrame(seat, frame, ship) {
    if (!Number.isInteger(seat) || seat < 0) return false; // an enumeration, refused
    var f = frame || {};
    var s = ship || {};
    // Finite-or-nothing, never `v || 0` — this repo has shipped the Infinity
    // defect once (bf2c961). A non-finite cursor or ship is "no aim this tick",
    // which the provider serves as a NaN pair, and the kernel's own boundary
    // then HOLDS the heading rather than snapping it to the world origin.
    var haveAim = Number.isFinite(f.cx) && Number.isFinite(f.cy)
      && Number.isFinite(s.x) && Number.isFinite(s.y);
    banked[seat] = {
      // the direction, unchanged, clamped on production's own lid
      kx: Number.isFinite(f.kx) ? Math.min(1, Math.max(-1, f.kx)) : 0,
      ky: Number.isFinite(f.ky) ? Math.min(1, Math.max(-1, f.ky)) : 0,
      // the aim, as an offset, converted once, here
      offX: haveAim ? (f.cx - s.x) * AIM_PX_PER_FIELD_PX : NaN,
      offY: haveAim ? (f.cy - s.y) * AIM_PX_PER_FIELD_PX : NaN,
      fire: !!((Number.isFinite(f.ah) ? f.ah : 0) & FIRE_BIT),
      shipRelative: f.tf !== "screen"
    };
    return true;
  }

  // bridgeSeat(seat) — install the per-seat provider that serves this seat's
  // banked frame to the kernel. One call per seat; the kernel's own
  // setInput(seat, fn) form (S3b commit D) is what makes it per seat at all.
  //
  // A seat that has been bridged but never handed a frame serves the EMPTY
  // HUMAN frame — nothing held, not firing, aim held — and never falls through
  // to AUTO. That is the kernel's shipped semantics preserved per seat, and it
  // is the right answer here too: a bridged seat has a pilot behind it whose
  // frame has not arrived, which is not the same thing as a seat flying itself.
  function bridgeSeat(seat) {
    if (!kernel || typeof kernel.setInput !== "function") return false;
    if (!Number.isInteger(seat) || seat < 0) return false;
    bridgedSeats[seat] = true;
    kernel.setInput(seat, function () {
      var b = banked[seat];
      if (!b) return {};                 // bridged, no frame yet: the EMPTY human frame
      var p = kernel.S && kernel.S.players && kernel.S.players[seat];
      var x = b.kx;
      var y = b.ky;
      // THE ROTATION, read at STEP time and never cached. The nose is
      // rotateToward'd at 6.4 rad/s, so it turns on every step, and the whole
      // point of ship-relative thrust is that W follows THAT nose. Rotating by
      // a + PI/2, because the ship's nose IS its angle and world y grows
      // DOWNWARD — a plain rotation by `a` is 90 degrees wrong and sends W hard
      // to port. Checked at the spawn pose a = -PI/2 (nose up): W (0,-1) maps to
      // (0,-1), still up; D (1,0) maps to (1,0), still right.
      //   The zero pair short-circuits, so an idle tick is BIT-IDENTICAL rather
      // than merely equivalent and no rotation can manufacture a -0 that the
      // kernel's own `moveX !== 0 || moveY !== 0` idle test would then meet.
      if (b.shipRelative && (x !== 0 || y !== 0) && p && Number.isFinite(p.angle)) {
        var sa = Math.sin(p.angle);
        var ca = Math.cos(p.angle);
        var rx = -x * sa - y * ca;
        var ry = x * ca - y * sa;
        x = rx;
        y = ry;
      }
      // The aim, rebuilt against THIS seat's kernel ship at THIS step. The
      // offset is what crossed; the anchor is read here, so the point is
      // current by construction and no world coordinate was ever banked.
      var aimX = p ? p.x + b.offX : b.offX;
      var aimY = p ? p.y + b.offY : b.offY;
      var out = { x: x, y: y, aimX: aimX, aimY: aimY, fire: b.fire };
      served[seat] = out;
      return out;
    });
    return true;
  }

  // unbridgeSeat(seat) — the seat goes back to AUTO and its banked frame is
  // dropped, so a re-bridge cannot serve a frame from before the gap.
  function unbridgeSeat(seat) {
    if (!Number.isInteger(seat) || seat < 0) return false;
    if (kernel && typeof kernel.setInput === "function") kernel.setInput(seat, null);
    bridgedSeats[seat] = false;
    banked[seat] = null;
    served[seat] = null;
    return true;
  }

  // ---- THE CAMERA (commit F) ----------------------------------------------
  // PORT-S-DEBT.md obligations 1, 2 and 3, with 3a, 3b and 3c. What arrives here
  // is the OWNER'S CAMERA RULE — D11, in the solved form js/game.js has been the
  // authority for since S2 commit A — and what leaves js/demo-render.js is its
  // DOOMED DUPLICATE: the lookahead block that file's own head comment marked
  // for deletion, `setCursorStage()` and `aiming()` included.
  //
  // WHY THE RULE LANDS IN THIS FILE AND NOT IN js/game.js's OWN FUNCTIONS. The
  // end state is the kernel under production's `updateCamera()` via `FRAME.cam`,
  // and that is lane 3's, because it needs a page that loads BOTH planes.
  // demo-play.html and demo-lab.html load js/demo-kernel.js, js/demo-render.js
  // and this file, and they do NOT load js/game.js — so on the pages the owner
  // actually flies there is no production camera to call. Deleting the lab block
  // without putting the rule somewhere those pages can reach it is precisely the
  // failure PORT-S-DEBT.md's own "hazard" section describes: the pages would
  // ease to the ship centre with the leash and the arena clamp and NO LEAD AT
  // ALL, and ease 0.05, camLead 30 and cursorPull 1.0 would be silently gone
  // from the build he passed.
  //
  // SO THIS IS A THIRD COPY OF THE ARITHMETIC, AND IT IS DECLARED AS ONE, WITH
  // AN ALARM ON IT. That is this repo's own answer to an unavoidable duplicate —
  // js/engine.js's mulberry32 is "a third copy with an alarm on it"
  // (test/node-golden.mjs), checked against the two it mirrors. The alarm here is
  // in test/tools/demo-host.mjs: it reads js/game.js's own CAMEASE, CAMLEAD,
  // CURSORPULL, EDGEMARGIN and LEADDZ out of the source and reds if any of the
  // five below disagrees. IF THE TWO EVER DISAGREE, PRODUCTION WINS — it is
  // where the rule ships, where the owner flies it at the feel gate, and where
  // test/tools/demo-aimlead.mjs PART 2 measures it.
  //
  // TWO RE-EXPRESSIONS ARE REAL AND MUST NOT BE "FIXED", and they are the two the
  // deleted block already carried:
  //   1. THE VELOCITY DIVIDE. Production's P.vel is px per TICK, so
  //      `vel * CAMLEAD` is CAMLEAD ticks of it and there is no divide. The
  //      kernel stores px per SECOND, so the /60 below buys the same quantity.
  //      The number 60 means the same thing in both files and only one may
  //      divide it.
  //   2. THE GATE'S CLOCK. Production counts TICKS and commits at
  //      max(1, round(LEADDZ / TICK)). This camera runs once per presented frame
  //      on a clamped dt, so the timer accumulates SECONDS and commits at
  //      LEADDZ / 1000. One clock, and 200 ms is 200 ms on a 144 Hz panel too.
  // A reader who "restores" either one breaks a unit or a clock.

  // THE FIVE CAMERA DIALS — 3b's five, and only those five. `starLit`,
  // `starSize` and `streak` are the STAR PASS's and do not move here: the panel
  // that drives all eight is MIXED, and a wholesale move misroutes the star
  // three exactly as a wholesale retirement would take the owner's panel with
  // it. js/demo-render.js keeps the star three and ROUTES the camera five here.
  var CAM_EASE = 0.05;      // js/game.js CAMEASE — the owner's, 2026-08-24
  var CAM_LEAD = 30;        // js/game.js CAMLEAD — the owner's, 2026-08-27 (D52; it
                            // was 60, chosen at the TOP of a 60-wide rail)
  var CURSOR_PULL = 1.0;    // js/game.js CURSORPULL — D11 itself; the gain B/(1-B)
  var EDGE_MARGIN = 60;     // js/game.js EDGEMARGIN
  var LEAD_DZ = 0;          // js/game.js LEADDZ, in ms — 0 is GATE OFF, the owner's
                            // choice at D52; it was 200

  // 3a — setCursorStage's REPLACEMENT, and it takes the same STAGE point.
  // The page cannot hand over a world point: by the time a frame reads it the
  // camera has moved, so a world point banked at pointermove time is stale by
  // exactly the camera step (03M-D, 1f118bb, and D13's law). Null or any
  // non-finite pair clears it. js/demo-render.js keeps a forwarder under the old
  // name so demo-play.html's two callers are untouched.
  var curStageX = NaN;
  var curStageY = NaN;
  function setCursorStage(sx, sy) {
    var okp = Number.isFinite(sx) && Number.isFinite(sy);
    curStageX = okp ? sx : NaN;
    curStageY = okp ? sy : NaN;
  }
  // The lab has exactly one aim mode, so "aiming" reads as "the cursor is on the
  // stage". NOT production's aiming(), which D30 deleted.
  function camAiming() { return Number.isFinite(curStageX); }

  // NO CURSOR IS NO PULL. curStageX is NaN in AUTO and in HUMAN before the first
  // pointermove; zero is the right answer there, because with no cursor there is
  // nothing to look toward.
  //
  // u IS CAMERA-INDEPENDENT — a stage-to-world DISPLACEMENT, (stage - paneCentre),
  // out of which the camera origin cancels exactly. That is why this is not a
  // second copy of the stage-to-world conversion, and why it cannot carry the
  // 03M-D fault: a displacement has no absolute point in it.
  function camCursorOffset() {
    var K = kernel;
    if (!camAiming() || !K) return { x: 0, y: 0 };
    return { x: curStageX - K.PLAY_W / 2, y: curStageY - K.PLAY_H / 2 };
  }

  // The whole lead: the velocity half, then the owner's cursor pull.
  //
  // THE MIX TERM IS A GAIN, B / (1 - B), which is why the dial is CursorPull and
  // not Blend: CursorPull 1.0 IS the owner's Blend 0.5, the camera exactly
  // halfway between the ship and the cursor. And THE (1 - B) ON THE LEAD CANCELS
  // — the velocity lead arrives at full strength at every setting, so CamLead and
  // CursorPull are two INDEPENDENT amounts and not a seesaw, and the absence of
  // any (1 - pull) factor below is not an omission. The full derivation ships in
  // js/game.js, which is the authority; it is not restated here, because a second
  // copy of a derivation drifts exactly the way a second copy of a number does.
  function camLeadVec() {
    var K = kernel;
    var local = K && K.S && K.S.players && K.S.players[0];
    if (!local) return { x: 0, y: 0 };
    var vx = local.vx / 60 * CAM_LEAD;
    var vy = local.vy / 60 * CAM_LEAD;
    var u = camCursorOffset();
    return { x: vx + CURSOR_PULL * u.x, y: vy + CURSOR_PULL * u.y };
  }

  // The commit gate. A quick reversal flips the ideal lead by up to
  // ~2 x VMAX x CAMLEAD px in one frame and the ease starts chasing at once, so
  // the camera follows a persistent COMMITTED lead: it tracks the ideal live
  // while the two stay within 60 degrees (or either is near zero), and a sharp
  // conflict freezes the committed lead and times the candidate instead.
  var camGate = { x: 0, y: 0, cx: 0, cy: 0, timer: 0, seeded: false };
  function camGatedLead(dt) {
    var i = camLeadVec();
    if (LEAD_DZ === 0 || !camGate.seeded) { // gate off, or fresh after a restart
      camGate.x = i.x;
      camGate.y = i.y;
      camGate.timer = 0;
      camGate.seeded = true;
      return { x: camGate.x, y: camGate.y };
    }
    // THE `< 1` BYPASS: a lead under one px has no meaningful DIRECTION, so the
    // 60-degree conflict test would be comparing noise. It is a real event under
    // this rule rather than an impossible one — a stationary ship with the cursor
    // on the pane centre — and it is left exactly as production wrote it.
    var im = Math.hypot(i.x, i.y);
    var cm = Math.hypot(camGate.x, camGate.y);
    if (im < 1 || cm < 1 || i.x * camGate.x + i.y * camGate.y >= 0.5 * im * cm) {
      camGate.x = i.x;
      camGate.y = i.y;
      camGate.timer = 0;
    } else {
      if (camGate.timer > 0
          && i.x * camGate.cx + i.y * camGate.cy >= 0.5 * im * Math.hypot(camGate.cx, camGate.cy)) {
        camGate.timer += dt;
      } else {
        camGate.cx = i.x;
        camGate.cy = i.y;
        camGate.timer = dt;
      }
      if (camGate.timer >= LEAD_DZ / 1000) {
        camGate.x = i.x;
        camGate.y = i.y;
        camGate.timer = 0;
      }
    }
    return { x: camGate.x, y: camGate.y };
  }
  // production's setCamMode (js/game.js): a restart re-seeds the gate from the
  // next ideal, so it never replays the old run's stale timer.
  function camReseed() { camGate.seeded = false; camGate.timer = 0; }

  // ---- THE DIALS' READ AND WRITE HALVES, AND THEY ARE A PAIR ---------------
  // 3b's whole point: move one without the other and the panel reads from a
  // camera it cannot write to. FINITE IS NOT A DOMAIN — each dial is checked
  // against its OWN domain and an out-of-domain value is ignored the same way an
  // unknown key is, because some finite values destroy the frame (ease -1 makes
  // the ease run away; ease 2 makes it NaN at a fractional-frame exponent; an
  // edgeMargin past half the SHORT side empties the leash interval).
  function camDial(v, lo, hi) { return Number.isFinite(v) && v >= lo && v <= hi; }
  function camEdgeCap() {
    var K = kernel;
    return K && Number.isFinite(K.PLAY_W) && Number.isFinite(K.PLAY_H)
      ? Math.min(K.PLAY_W, K.PLAY_H) / 2 : Infinity;
  }
  function setCamDials(next) {
    if (!next || typeof next !== "object") return;
    if (camDial(next.ease, 0, 1)) CAM_EASE = next.ease;
    if (camDial(next.edgeMargin, 0, camEdgeCap())) EDGE_MARGIN = next.edgeMargin;
    if (Number.isFinite(next.camLead)) CAM_LEAD = next.camLead; // a multiplier
    // A GAIN, not a length and not a 0..1 mix. Any finite non-negative value is
    // meaningful: the leash saturates the large end and 0 is the OFF switch.
    // Negative is rejected because it would pull the camera AWAY from the
    // cursor, which is not a setting of this rule but a different rule.
    if (camDial(next.cursorPull, 0, Infinity)) CURSOR_PULL = next.cursorPull;
    if (camDial(next.leadDz, 0, Infinity)) LEAD_DZ = next.leadDz; // ms; 0 = OFF
  }
  function getCamDials() {
    return { ease: CAM_EASE, edgeMargin: EDGE_MARGIN, camLead: CAM_LEAD,
             cursorPull: CURSOR_PULL, leadDz: LEAD_DZ };
  }

  // ---- publish ------------------------------------------------------------
  // The kernel's own idiom, so the two files are reachable the same way in a
  // page, in a Node vm sandbox and under module.exports.
  var API = {
    install: install,
    uninstall: uninstall,
    installed: installed,
    reset: reset,
    step: step,
    setSink: setSink,
    bridgeSeat: bridgeSeat,
    setCursorStage: setCursorStage,
    camGatedLead: camGatedLead,
    camReseed: camReseed,
    setCamDials: setCamDials,
    getCamDials: getCamDials,
    unbridgeSeat: unbridgeSeat,
    pushSeatFrame: pushSeatFrame,
    // THE POSE BRIDGE (S3b lane 3, commit A) — production's RESULT into the
    // kernel, beside the input bridge, which carries production's INTENT.
    pushSeatPose: pushSeatPose,
    // ---- D26'S AURA: THE DIAL IN, THE CHILDREN OUT (PORT-S S5, commit D) --
    // `setAuraDamage` is `setBuildPurchases`' twin — one production tunable,
    // pushed once per tick beside the poses, because the kernel reads no
    // production surface and may not hold its own copy of `COMETAURA`.
    //
    // `flushKernelChildren` is the narrow facade `armKernelDeaths` /
    // `flushKernelDeaths` are the precedent for. js/encounter.js calls it
    // IMMEDIATELY AFTER `reapRamClaims()` — the point at which the tick's
    // outgoing comet-body rams, rebates, production rounds, wall blasts and
    // death flush are all finished — so a child of an aura kill enters the
    // world with the combat window closed behind it, standing still, and is
    // eligible for anything only on the FOLLOWING tick.
    setAuraDamage: function (n) {
      if (!kernel || typeof kernel.setAuraDamage !== "function") return 0;
      return kernel.setAuraDamage(typeof n === "number" && isFinite(n) && n > 0 ? n : 0);
    },
    // D67'S FOUR ORB DIALS — `setAuraDamage`'s siblings, and the same refusal:
    // the kernel holds the number, production owns it, and a surface with no
    // kernel installed gets 0 back rather than a throw. Unlike the aura, a
    // non-finite push is REFUSED by the kernel (it keeps its own default) — an
    // orb life of 0 is not a quiet dial, it is every orb dead on its spawn tick.
    setOrbLife: function (n) {
      if (!kernel || typeof kernel.setOrbLife !== "function") return 0;
      return kernel.setOrbLife(n);
    },
    setOrbMagnet: function (n) {
      if (!kernel || typeof kernel.setOrbMagnet !== "function") return 0;
      return kernel.setOrbMagnet(n);
    },
    setOrbRing: function (n) {
      if (!kernel || typeof kernel.setOrbRing !== "function") return 0;
      return kernel.setOrbRing(n);
    },
    setOrbPull: function (n) {
      if (!kernel || typeof kernel.setOrbPull !== "function") return 0;
      return kernel.setOrbPull(n);
    },
    orbDials: function () {
      if (!kernel || typeof kernel.orbDials !== "function") return null;
      return kernel.orbDials();
    },
    // D55's stagger, READ-ONLY. It is a structural constant, not a dial, and
    // the leg that proves the pacing reads its value here rather than restating
    // it — so the day the number moves, the leg moves with it.
    pickupStagger: function () { return PICKUP_STAGGER_TICKS; },
    flushKernelChildren: function () {
      if (!kernel || typeof kernel.flushChildren !== "function") return 0;
      return kernel.flushChildren();
    },
    pendingKernelChildren: function () {
      if (!kernel || typeof kernel.pendingChildren !== "function") return 0;
      return kernel.pendingChildren();
    },
    // THE ROSTER'S SIZE (PORT-S S4, commit A) — production's seat count into
    // the kernel, beside the pose. See setSeatCount's own block.
    setSeatCount: setSeatCount,
    // PRESENCE (PORT-S S4, commit D) — claimed and not parked, per seat. See
    // setSeatPresent's own block: the size and the occupancy are two facts.
    setSeatPresent: setSeatPresent,
    setBuildPurchases: setBuildPurchases,  // D38's dial input — see its block
    setBuildScale: setBuildScale,          // ...and the dial, for the dev tune route
    // THE DEV LEVER (PORT-S S4, commit G) — the latency rig's condition
    // selector. See its own block; it is an instrument, not a rule.
    devDealSetpiece: devDealSetpiece,
    // THE LIVE CENSUS (PORT-S S4, commit E) — the kernel's own, so the clear
    // gate and production's FOES line are one derivation. See its block.
    liveBodies: liveBodies,
    unposeSeat: unposeSeat,
    // THE BODY SWEEP (S3b lane 3, commit B) — what production's surviving
    // bullet plane shoots at, and the one door it shoots through.
    bodies: bodies,
    damageKernelBody: damageKernelBody,
    // THE ORDNANCE SWEEP (D51, PORT-F) — the same door, the other class. See
    // the two blocks above for the route ruling and the seatless measurement.
    rounds: rounds,
    damageKernelRound: damageKernelRound,
    // THE ATOMIC RESET (FIX 10) — a PAIR. Production resets, re-poses from its
    // own post-reset state, then lands those poses on the records, so a wipe
    // cannot leave a phantom native pilot standing behind a dead seat.
    resetKernel: resetKernel,
    applyPosesNow: applyPosesNow,
    armKernelDeaths: armKernelDeaths,
    flushKernelDeaths: flushKernelDeaths,
    AIM_PX_PER_FIELD_PX: AIM_PX_PER_FIELD_PX,
    // A TEST SEAM, on js/demo-kernel.js's footing. `steps` is how a leg asks
    // "was the kernel driven exactly once per tick?" without counting through
    // the kernel's own state, and `kernel` is how it asks which kernel it is
    // driving. Both read-only in practice; neither is a way in.
    __test: {
      steps: function () { return stepped; },
      kernel: function () { return kernel; },
      sink: function () { return sink; },
      banked: function (seat) { return banked[seat] || null; },
      bridged: function (seat) { return !!bridgedSeats[seat]; },
      served: function (seat) { return served[seat] || null; },
      posed: function (seat) { return !!posedSeats[seat]; },
      pose: function (seat) { return accepted[seat] || null; },
      routed: function () { return routed.slice(); },
      routedDropped: function () { return routedDropped; },
      // THE WRAPPER THE KERNEL HOLDS, which is not the same object as `sink`
      // above: `sink` is what the CALLER asked for and this is what the kernel
      // actually emits into. The credit route lives on it, so a leg that wants
      // to drive the route's boundary drives this.
      kernelSink: kernelSink,
      // The camera's own seam, on js/demo-render.js's footing — its `__test`
      // published cursorOffset and leadVec, three live gates read them, and
      // PORT-S-DEBT.md's rule is that the seam MOVES or the tools go with it by
      // name. It moved; js/demo-render.js's members forward here.
      cursorOffset: camCursorOffset,
      leadVec: camLeadVec,
      aiming: camAiming
    }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (typeof window !== "undefined") window.EncounterHost = API;
  else if (typeof globalThis !== "undefined") globalThis.EncounterHost = API;
})();
