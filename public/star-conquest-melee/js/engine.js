// ---- the ENGINE: the one door damage walks through -------------------------
// A classic script, loaded between js/abilities.js and js/game.js on both
// surfaces: the pages (index.html, demo-play.html, demo-lab.html and the parity
// page) and the server vm (server/sim-host.mjs's SIM_FILES). It declares no DOM
// reference at module level, because the vm boots it against the throwing DOM
// stub; a bare `document` here breaks the SERVER, not a test. Nothing here
// reads game.js or encounter.js at load, so it has no cycle with either.
//
// WHY A NEW FILE, and not js/encounter.js or js/abilities.js (ruled, plan §3
// R5). encounter.js is the file PORT-S dismantles, so a plane built inside it
// would be ported twice. abilities.js is the CATALOG — the records an ability
// is AUTHORED as — and the funnel is the machine those records feed, not
// another record. R6 grows this same file with the entity registry, so
// SIM_FILES pays its growth exactly once instead of once per plane.
//
// WHAT LIVES HERE at R5 step 1: applyEffect, and nothing else yet.
//
// ---- WHAT THE DOOR OWNS, AND WHAT IT MUST NEVER OWN ------------------------
// The funnel is THIN, and thin is a requirement rather than a style: every
// behavior that moves in here is a behavior the five call sites stop being able
// to spell differently, so anything that ALREADY differs per site must stay
// there or the move is a silent retune.
//
// IT OWNS, and these four are the whole list:
//   1. the amount pipeline — `baseAmount` is what the caller asked for,
//      `amount` is what actually lands, and `amount` defaults to `baseAmount`;
//   2. the subtraction itself, against the pool the TARGET's class declares;
//   3. credit — `lastAtk`, under the exact guard the sites spell today;
//   4. (from R5 commit C) the matrix consultation: may this source class hit
//      this target class, with this kind of effect.
//
// IT DOES NOT OWN: cues (`emit`), impact fx (`spawnImpactFx`), the counters
// (`E.hitsDealt`, `E.contactsDealt`, `E.hitsTaken`, `E.missilesShot`), i-frames,
// the hit FLASH, contact cooldowns and per-tick claims, or death handling. Every
// one of those stays at the call site, byte-identically. The flash is the
// instructive case: all five enemy sites write `flash = 8` and it LOOKS liftable,
// but the player leg's flash is `hitFlash = 20` behind three gates, so a funnel
// that owned "the flash" would own two different things under one name. It stays
// out, and the rule that keeps it out is the paragraph above, not this sentence.
//
// ---- THE PREVENTION RULE (for the hook layer that does not exist yet) ------
// When effects become hookable — a shield that eats a hit, a ward that refuses
// one — there are exactly TWO ways to stop damage and they are NOT the same:
//
//   IMMUNITY  SKIPS the event.  Nothing happened. No credit, no counter, no
//             cue, no death check. The event never ran.
//   BLOCK     ZEROES the event and the event STILL RUNS. Zero damage lands,
//             but the hit registered: it credits, it counts, it cues, and
//             anything watching for "was I hit" saw a hit.
//
// Collapsing the two is the classic effect-system defect — a "block" that skips
// silently drops the on-hit triggers that made blocking a decision. The two
// GRANDFATHERS below predate the rule and are named so nobody later reads them
// as precedent for it:
//
//   THE NARROWED COMET REFUSAL (`hitPlayer`, js/encounter.js) — a burning pilot
//   refuses BODY-CONTACT damage and nothing else. It SKIPS the event (no hull
//   loss, no i-frame consumption, no hitFlash, the ramming caller cannot tell it
//   apart from a graced hit) and yet it BILLS `COMETHIT` energy. Under the rule
//   that is a block wearing a skip's clothes; it ships as it is.
//   **IT NARROWED IN R5, and the narrowing is what makes it survivable.** It
//   used to refuse EVERY incoming path at once. D26 rules the comet a damage
//   SOURCE rather than a shield — protection becomes emergent, because a threat
//   the burn destroys never lands — and D28 then keeps exactly one exemption,
//   the ram, because the ram is the comet's ATTACK and its exchange already
//   ships (the body pays COMETDMG * fury, the pilot pays COMETHIT). Which kinds
//   count as contact is the `CONTACT_KINDS` declaration below; the GATE stays at
//   the site, as a grandfather must.
//
//   THE ANVIL ARC-BLOCK (`resolveBulletHits` and `applyRebateHits`,
//   js/encounter.js) — it consumes the round, cues the clang, sparks with the
//   WALL kind, pays no `hitsDealt`, and excludes the blocking body from its own
//   splash. It is a block that reached the site before the door existed.
//
//   THE SHIELD / PARRY ARC REFUSAL — **ARRIVING, NOT ARRIVED (D29).** Owner-
//   ruled 2026-08-25 ("yes, add SHIELD / PARRY ARC back"), reversing a deferral
//   whose only stated warrant D26 had just removed. It is named here NOW,
//   unbuilt, because this is the section a future author reads before adding a
//   third refusal, and the shape is already decided:
//     WHAT IT IS — a seat refusing damage that arrives inside its own frontal
//     arc. The POR calls it "the same edit on the PvP leg the anvil already
//     runs on the PvE leg", and that is exact: the geometry is the shipped
//     enemy test at js/encounter.js's live sweep and its lag-compensation twin
//     (`stats.arc > 0 && |angDiff(atan2(iy - y, ix - x), face)| <= stats.arc`),
//     read off the swept ENTRY point so the block and the spark can never
//     disagree about where the round stopped.
//     SOURCE-SCOPED, exactly as D28's contact refusal is — and the parameter it
//     needs is `hitPlayer`'s `src`, ALREADY BOUGHT by D28. Do not price it a
//     second time.
//     REFUSAL ONLY. NEVER DEFLECT, NEVER KNOCKBACK. "A parry that nullifies
//     writes no velocity and needs no P7; a parry that pushes IS P7", and P7 is
//     a dropped owner ruling. A future author who reaches for a velocity write
//     here is reopening that ruling, not implementing this one.
//     IT INHERITS THE ANVIL'S SPLASH TRAP. The blocked round still splashes for
//     everything ELSE in reach and the blocker is excluded from it — pass the
//     blocked party, never `null`. The anvil's own comment records why in full:
//     the impact point sits 13 px off centre while BLASTR alone is 18, so
//     `null` would let a purchase deal full damage straight through the shield.
//     WHY IT IS NOT REDUNDANT WITH THE COMET: §2.11's rule is that a comet is
//     hurt by exactly what it cannot destroy, and a parry arc covers precisely
//     that family — which is why the two reflexes must be bindable at once.
//   WHAT BLOCKS IT: §2.12's seat-facing ruling is OPEN, and it is the one that
//   decides whether the ability has any skill in it — an arc that always points
//   where you aim is a wall, not a skill check (the enemy's own `turnRate`
//   comment makes that argument for the PvE side). The bench record lands in
//   R8a; the `hd` heading key and the remote look are R7's. R5 owns this
//   paragraph and no code.
//
// The first two ship as they are; the third is a declaration of intent. R5 moved
// a subtraction and, in D28's case, the SCOPE of one gate — never a gate's home.

// ---- the CLASS list --------------------------------------------------------
// The shared vocabulary of the whole plane: the collision matrix declares who
// may hit whom in these terms, and (R5 commit E) `acquire` chooses among them
// in the same terms. "May A hit B" and "which B do I choose" are two predicates
// over ONE declaration, and building them apart is how the three-copy drift
// starts — the `Flight.cometOn` incident, repeated for targeting.
//
// The values are BIT POSITIONS, deliberately. A target-class rule then reads as
// one mask (`SHIP | BODY | CONSTRUCT`) instead of an array membership test, and
// that shape is load-bearing rather than tidy: R6 merges the four entity arrays
// (bullets, enemies, missiles, orbs) into ONE registry list, and any rule
// written as "is it in S.enemies" is erased the day that merge lands.
//
// APPEND ONLY, like the ability ids: a value here is a bit position, so
// inserting one renumbers every class above it.
const CLASS = {
  SHIP: 1,       // a pilot's ship — a seat's hull
  BODY: 2,       // an enemy combatant
  ORDNANCE: 4,   // an in-flight round: a bullet or a missile, either side's
  CONSTRUCT: 8,  // a placed object — the demo's drone today, `mine` after R6
  ORB: 16,       // an XP pickup on the floor
  AURA: 32,      // the comet's burn — see below. A SOURCE class, never a target
};

// ---- AURA: the comet's damaging area (D26), DECLARED HERE AND BUILT IN R6 ---
// D26 rules the comet a DAMAGE SOURCE rather than a shield: the held burn
// carries a small persistent damaging area with the ship, and protection
// becomes EMERGENT — a threat the aura destroys never lands, a threat it cannot
// destroy does. That makes the aura a new PARTICIPANT in the matrix rather than
// a fresh pairing of the classes already here, which is why it gets a line.
//
// WHAT IT IS — ruled at the orchestrator seat: A PER-SEAT SWEEP, not a registry
// kind and not an entity. Its existence and its radius DERIVE per tick from
// state that is already hashed (the seat's comet flag and its energy), so it
// carries ZERO new hashed state and re-keys nothing. That is the
// `resolvePvpRams` precedent exactly. An entity copy would be derived state
// standing beside the state it derives from, which is a thing that can drift.
//
// WHAT R5 BUILDS: this declaration, and an applyEffect that accepts an
// AREA-SHAPED source payload (see the payload block below). NOTHING ELSE.
// There is NO sweep pass and there are NO matrix rows for it in this round — so
// an aura-sourced effect fired today reaches `mayHit`, finds no row for the
// source class, and THROWS by name. That is the design working: the class is
// declared, the rows are owed, and the throw says which round owes them.
//
// WHAT R6 BUILDS: the rows, the sweep pass, and the ordering LAW that comes with
// it — the aura damage pass runs BEFORE the ordnance-vs-player pass on the same
// tick, so a child spawned inside a burning comet dies the tick after it spawns
// instead of landing. R6 also brings the `hp > 0` filter that decides what the
// burn actually eats, and the aura must read that same filter rather than open a
// second destruction path (D10's "the fix is ONE field" depends on it).
// PORT-S brings the burn itself to the kernel, with the drift retune.
//
// AURA IS A SOURCE AND NEVER A TARGET, which is why it declares no POOL entry
// below: an area has nothing to subtract. Whether an aura may be DESTROYED is
// not a question this class leaves open — it is not a thing that exists to be
// hit.

// Which POOL each class spends, DECLARED rather than sniffed off the record.
// A class with no entry declares itself undamageable, and ORB is the one that
// does: an orb is picked up or it is not, and nothing in the game reduces it.
//
// The two field names are spelled out at the two writes below rather than
// indexed through this table, and that is not redundancy — it is what lets the
// single-writer count leg (test/node-golden.mjs) SEE the funnel's own writes.
// A `t[pool] -= amount` would hide them from the scan and the gate would go
// quietly vacuous, counting zero writers and asserting zero.
const POOL = {};
POOL[CLASS.SHIP] = "hull";
POOL[CLASS.BODY] = "hp";
POOL[CLASS.ORDNANCE] = "hp"; // R6 gives ordnance an `hp`; today no round carries one
POOL[CLASS.CONSTRUCT] = "hp";

// ---- the COLLISION MATRIX (P3) ---------------------------------------------
// Who may hit whom, and how hard. Keyed [kind][source class][target class] and
// valued with a FACTOR: 0 is off, 1 is full, and anything between is a retune
// that never touches code — which is exactly what D1's ruling promises
// ("the retune, if a playtest asks for one, is a data edit to the factor").
//
// WHY THE KIND IS PART OF THE KEY. A ship damages an enemy body with both a
// shot and a blast, and the two do NOT agree about everything else: D10 turns
// shot -> ORDNANCE on while blast -> ORDNANCE stays off, because a splash that
// swept rounds out of the air would quietly delete the harrier's whole threat
// (js/encounter.js's blastAt says so in its own comment). A matrix keyed only
// by the two classes could not hold both truths at once.
//
// THE THREE LOOKUP OUTCOMES, and they are deliberately not the same thing:
//   an undeclared KIND               -> throws. A kind is a declaration; an
//                                       undeclared one is a caller bug.
//   an undeclared SOURCE class for a
//     declared kind                  -> throws. Nobody has decided what this
//                                       source may do with this effect.
//   an undeclared TARGET class in a
//     declared row                   -> OFF. The row was written and did not
//                                       list this target: that IS the decision.
// So the matrix is closed by default at the leaf and loud at the branch, which
// is what stops a typo from silently switching a shipped interaction off.
//
// WHAT IS DECLARED HERE IS TODAY'S TRUTH, one row per shipped interaction, plus
// exactly one licensed change (D1) and one inert declaration (D10).
const MATRIX = {
  // a body contact — a ram, either way round
  ram: {},
  // a round that reached its target along its swept path
  shot: {},
  // the splash a terminating player round leaves
  blast: {},
  // a body's death detonating a NEIGHBOURING body — the demo kernel's
  // hammerhead chain. It is its own kind rather than a `blast` row because the
  // source is a BODY and the reach is the dying body's, not a shooter's rank:
  // folding it into `blast` would make one cell answer for two mechanisms.
  chain: {},
  // a hitscan segment — production's lance pulse. Its own kind because a beam
  // has NO BODY: nothing can intercept it, which is exactly why D26 makes it
  // one of the three families that hurt a burning pilot. A `shot` row would
  // say the opposite by implication, since shots are the things an aura eats.
  beam: {},
  // the player-hull leg. hitPlayer takes NO damage source (an owner ruling), so
  // this kind is never looked up: it arrives with no source class at all and
  // applyEffect skips the consultation. The row is declared EMPTY rather than
  // omitted so that the day hitPlayer learns its source, the lookup throws and
  // names this comment instead of silently refusing every hit in the game.
  hit: {},
};
MATRIX.ram[CLASS.SHIP] = {};
MATRIX.ram[CLASS.SHIP][CLASS.BODY] = 1;   // contactEvent's ram damage to the body
MATRIX.ram[CLASS.SHIP][CLASS.SHIP] = 1;   // resolvePvpRams — a comet ramming a rival
MATRIX.ram[CLASS.BODY] = {};
MATRIX.ram[CLASS.BODY][CLASS.SHIP] = 1;   // the body's half of the same contact
MATRIX.shot[CLASS.SHIP] = {};
MATRIX.shot[CLASS.SHIP][CLASS.BODY] = 1;      // the live sweep and the rebate resolve
MATRIX.shot[CLASS.SHIP][CLASS.ORDNANCE] = 1;  // D10, DECLARED AND INERT — see below
MATRIX.shot[CLASS.SHIP][CLASS.SHIP] = 1;      // a rival's round reaching a pilot
MATRIX.shot[CLASS.BODY] = {};
MATRIX.shot[CLASS.BODY][CLASS.SHIP] = 1;      // an enemy round reaching a pilot.
                                              // Production fields no enemy
                                              // bullets — only seekers, which
                                              // arrive as ORDNANCE below — so
                                              // this row is still record-only.
MATRIX.shot[CLASS.ORDNANCE] = {};
MATRIX.shot[CLASS.ORDNANCE][CLASS.SHIP] = 1;  // a seeker detonating on a pilot
MATRIX.beam[CLASS.BODY] = {};
MATRIX.beam[CLASS.BODY][CLASS.SHIP] = 1;      // the lance pulse
MATRIX.chain[CLASS.BODY] = {};
MATRIX.chain[CLASS.BODY][CLASS.BODY] = 1; // the kernel's hammerhead detonation
MATRIX.blast[CLASS.SHIP] = {};
MATRIX.blast[CLASS.SHIP][CLASS.BODY] = 1;     // the splash, as shipped
MATRIX.blast[CLASS.SHIP][CLASS.SHIP] = 1;     // D1 — THE ONE LICENSED CHANGE
MATRIX.blast[CLASS.SHIP][CLASS.ORDNANCE] = 0; // OFF: covers enemy rounds AND the
                                              // seekers in E.missiles, which are
                                              // one class here. A splash that
                                              // swept ordnance out of the air
                                              // would delete the harrier threat.
MATRIX.blast[CLASS.SHIP][CLASS.ORB] = 0;      // OFF: an orb is a pickup, not a body
// blast -> CONSTRUCT is deliberately NOT declared. Production ships no placed
// object for a splash to reach, so there is no "today's truth" to record, and
// inventing a factor here would be a balance decision wearing a completeness
// argument. Undeclared is OFF, and the day a construct exists in the blast's
// world the row is one line.

// D1 IN FULL (owner-ruled): player -> player splash is ON at factor 1.0. A
// splashed rival is treated exactly like an enemy body by the blast, and then
// walks through hitPlayer's own gates (invuln, the comet negation, dead) like
// any other damage a pilot takes. The owner accepted that area weapons become
// strong in a four-pilot arena. This is the ONE deliberate behavior change in
// R5, and it is why D6's PvPvE rows live in this table rather than in a branch.
//
// THE SHOOTER'S OWN SEAT IS EXCLUDED, and that is a SEAT rule rather than a
// class rule — the class row above cannot express it, because attacker and
// victim are both CLASS.SHIP. It is declared as data for the same reason the
// factor is: a later flip is an edit here, never a code change.
const SELF_SPLASH = false;

// D10's row (shot -> ORDNANCE) is DECLARED AND INERT, and both halves are true
// today. No ordnance carries `hp` until R6's seventh registry obligation, and
// the collision pass that would consult this row is R6's as well, so nothing in
// the tree reads it yet and no behavior changes. It is declared now because R5
// is where the class list is written and D10's damage half was scheduled here:
// the row is the declaration, the pass is R6's.

// ---- BODY CONTACT (D28) ----------------------------------------------------
// Which effect kinds are a physical hull-on-hull touch. Declared here, beside
// the matrix, because it is the same sort of fact and the same vocabulary — and
// because it is DATA: the day another kind becomes a contact, this list is the
// edit.
//
// It is a KIND question and not a class question, and that distinction is the
// whole of it: a BODY delivers both a ram and a lance pulse, so "was this body
// contact" cannot be answered from the source's class. Asking the class would
// make the lance refuse on a burning pilot, which is precisely the case D26
// exists to stop refusing.
//
// WHO READS IT: `hitPlayer`'s narrowed comet refusal (D28 — ramming costs the
// comet pilot no hull, because the ram is the comet's attack and its exchange
// already ships: the body pays COMETDMG * fury, the pilot pays COMETHIT). The
// refusal stays AT THE SITE, as a grandfather must; only the CLASSIFICATION
// lives here, where the rest of the plane's vocabulary is.
const CONTACT_KINDS = ["ram"];
const isContact = (kind) => CONTACT_KINDS.indexOf(kind) >= 0;

// The lookup. Returns the FACTOR, and the three outcomes above are its whole
// contract. Exported as Engine.mayHit for the one shipped consultation that
// cannot happen inside applyEffect: blastAt's D1 loop, whose damage goes
// through hitPlayer and therefore arrives at the door with no source.
function mayHit(kind, srcCls, tgtCls) {
  const byKind = MATRIX[kind];
  if (byKind === undefined) {
    throw new Error("Engine: no collision row for effect kind '" + kind +
      "' — a kind is a declaration, and an undeclared one is a caller bug");
  }
  const bySrc = byKind[srcCls];
  if (bySrc === undefined) {
    throw new Error("Engine: '" + kind + "' has no row for source class " + srcCls +
      " — nobody has decided what that source may do with this effect");
  }
  const f = bySrc[tgtCls];
  return f === undefined ? 0 : f; // an undeclared target in a written row is OFF
}

// ---- ACQUIRE (P8), and D25's mask ------------------------------------------
// "May A hit B" and "which B do I choose" are two predicates over ONE
// declaration. The matrix above answers the first; this answers the second, off
// the same class list — and building them apart is how the three-copy drift
// starts. The research names the failure it prevents in as many words: *"three
// consumers of 'who is my target' will drift exactly as three consumers of 'may
// this seat arm' did"* — the `Flight.cometOn` incident, repeated for targeting.
//
// D25 IS LAW: HOMING TRACKS SHIPS AND STRUCTURES, NEVER SHOTS. The acquirable
// classes are the combatants (BODY, a rival SHIP) and CONSTRUCT — the demo's
// drone today, `mine` once D10 promotes it — and NEVER ORDNANCE. Damageable is
// not acquirable, and that is the whole rule. Three of D10's own warrants say
// why: the hp-6 tier exists because "popping one early must be an investment,
// never a reflex", and auto-acquisition makes it precisely a reflex the weapon
// performs unasked; the hp-2 tier's stated warrant is that "shoot down the
// incoming rocket" is the readable interaction the feature is bought for, which
// is unreadable if the weapon does it silently; and under YES every destructible
// round in flight becomes ARMOUR for the ship that fired it, so the enemies
// dealing the most ordnance would be the hardest for homing to reach.
//
// IT IS A DECLARATIVE CLASS MASK, and that shape is the ruling's own
// requirement rather than a preference: R6 merges the four entity arrays into
// one registry list, so a rule written as "is it in S.enemies rather than
// S.bullets" is ERASED the day that merge lands. A mask survives it.
//
// BULLET ACQUISITION IS RESERVED, NOT FORBIDDEN. POINT_DEFENCE is declared and
// nothing passes it today; the mask PARAMETER is what makes an explicit
// point-defence weapon or modifier a data edit later instead of a retro-fit of
// the damageable-vs-acquirable axis after content depends on the conflation.
// That is the whole reason D25 costs anything now — it is cheapest to reverse
// PROVIDED the boundary is installed here.
//
// AND THE BOUNDARY D25 LEAVES IMPLICIT: ACQUISITION IS NOT COLLISION. Say it
// in the AURA's own terms, because that is the pairing that makes it look like
// a contradiction: THE AURA IS A COLLISION VOLUME AND MAY DESTROY ORDNANCE —
// that is a MATRIX fact, and D26 rules the burn a damage source precisely so it
// can eat incoming rounds — while `acquire` may still NEVER TAKE ordnance, which
// is the D25 mask. The same is true of the shipped gun: D10's
// shot -> ORDNANCE row is already declared on, and manual interception is proven
// play (js/encounter.js kills a seeker for "no orb, no XP, no entry in E.kills").
//
// So the two rulings read the same class list and reach opposite conclusions,
// and both are right, because they are answering different questions. What may
// I HIT is collision. What will my weapon CHOOSE for me is acquisition. D25's
// whole warrant is that the second must stay a decision the player makes —
// "shoot down the incoming rocket" is unreadable if the weapon does it
// silently. Absent this paragraph the plan carries two rulings that look like
// they contradict each other, and someone eventually "fixes" one of them.
const ACQUIRE = {
  // what an ordinary weapon may take
  DEFAULT: CLASS.SHIP | CLASS.BODY | CLASS.CONSTRUCT,
  // RESERVED. Declared so the reversal is one argument, never built into
  // anything today — see the paragraph above.
  POINT_DEFENCE: CLASS.ORDNANCE,
};

// The selection itself: the NEAREST admissible living candidate to a point, or
// null when there is none.
//
// NO LATCHED TARGET ID, and that is a design constraint rather than an
// omission. It is a pure function of the current tick's state: same arguments,
// same answer, no memory between calls, nothing stored on Engine. A commitment
// window is a real and useful thing — the encounter has one, `e.aggroT`, and it
// keeps a planted attack honest — but it belongs to the BODY that made the
// commitment, on hashed state, and never inside the selector. A selector with
// its own memory is a second, unhashed authority on "who is my target", which
// is exactly the drift this primitive exists to prevent.
//
// Candidates are `{ cls, live, x, y }` plus whatever the caller wants back.
// Ties resolve to the EARLIEST candidate, because the scan keeps a strict `<` —
// so a caller that supplies its list in ascending id order gets the
// deterministic tie-break it already had.
function acquire(x, y, candidates, mask) {
  const m = mask === undefined ? ACQUIRE.DEFAULT : mask; // read at CALL time, so
                                                         // the mask stays data
  let best = null;
  let bd = Infinity;
  for (const c of candidates) {
    if (!(c.cls & m)) continue; // the class mask, before anything else is read
    if (!c.live) continue;
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

// ---- applyEffect -----------------------------------------------------------
// ONE event, one payload. The plan sketched it positionally
// (`applyEffect(kind, amount, source, target, flags)`); it is written as a
// single record because the identity half COLLAPSES RIGHTWARD and a positional
// call cannot express "defaulted" without a run of `undefined`s.
//
// THE PAYLOAD
//   kind        what sort of effect this is — "ram", "shot", "blast" today.
//               It is part of the matrix key, not decoration: a SHIP damages a
//               BODY with both a shot and a blast, and D10 turns one of those
//               pairings on against ORDNANCE while the other stays off.
//   target      the record whose pool moves.
//   tgtCls      its CLASS. Declared by the caller; never inferred from the
//               record's shape, because R6's merged list makes every entity
//               look alike.
//   source      the record that dealt it. Optional: the splash's wall and
//               missile paths carry no attacker, and the player-hull leg
//               carries no source at all. TWO SHAPES, and the door is
//               deliberately blind to the difference:
//                 the POINT form  `{ cls, seat }` — a ship, a body, a round;
//                 the AREA form   `{ cls, seat, x, y, r }` — the comet's AURA
//                                 (D26), whose overlap is a volume rather than
//                                 a contact.
//               The door reads `cls` and `seat` from either and nothing else.
//               The geometry belongs to the PASS that decided the overlap and
//               never to the funnel: a door that knew about radii would have to
//               know about every future shape of reach, and R6's aura sweep
//               would be re-teaching it what it already computed.
//   baseAmount  what the caller asked for.
//   amount      what lands. Defaults to baseAmount.
//   statSource  who this counts FOR. Defaults to the seat in `source`.
//   credit      who this is blamed ON. Defaults to statSource.
//
// THE IDENTITY COLLAPSE exists because three questions that are the same today
// are not the same later: a drone's kill should credit its owner (source is the
// drone, statSource and credit are the pilot), and a reflected round should
// blame the reflector rather than the shooter. Splitting them now costs three
// `undefined` checks; splitting them after content depends on the conflation
// costs a re-audit of every site.
//
// THE CREDIT GUARD is `credit !== undefined && credit >= 0`, which is
// `blastAt`'s guard verbatim. The other four enemy sites write `lastAtk`
// UNCONDITIONALLY, so unifying is only safe if their credit can never be
// undefined or negative — and it cannot, provably, at every one of them:
//   contactEvent's `seat` — both callers pass the index of an ascending
//     `for (let s = 0; s < players.length; s++)` loop (`stepEnemy`'s dash
//     sweep and `resolveContacts`), so it is a non-negative integer;
//   resolveBulletHits' `shooter` — the sweep does `if (shooter < 0) continue;`
//     before it reaches the write, so `shooter >= 0` is guaranteed in-code;
//   applyRebateHits' `h.src` — the rebate's shooter, which arrives from
//     `fire(seat)`, and `fire` returns early on `!seatAlive(seat)`, which is
//     false for every negative index.
// So the unified guard is a no-op at four sites and verbatim at the fifth.
//
// THE SCOPE OF THAT PROOF, narrowed after the Codex cross-review found its
// edge. It holds for every SHIPPED owner value, which is what "behaviour
// -identical" has to mean here — but it is not literal identity over every
// value JavaScript admits. `bulletSeat` accepts any number, and `NaN` passes
// BOTH tests: `NaN < 0` is false, so the sweep's `continue` does not fire, and
// `NaN >= 0` is false, so this guard declines. The old unconditional write
// stamped `lastAtk = NaN`; this one leaves the previous attacker standing.
//   No constructor in the game produces that owner — `fire(seat)` and the
// ability spawn both write a seat index — so the divergence is reachable only
// through a hand-built bullet in the `__test` seam. A synthetic owner is
// outside the contract, and the honest statement of the proof is "identical for
// every owner the game can create", not "identical for every double". If a
// later round wants the stronger claim, the place to buy it is a finite-integer
// owner check at the boundary, not a policy flag here.
//
// NO CREDIT ON A SHIP. Nothing writes `lastAtk` onto a seat record: the
// player-hull leg passes the source CLASS only, so `statSource` and `credit`
// stay undefined and the guard declines. SEAT_HASH is a per-seat allow-list
// walk, so a stray key there would be unhashed state sitting on a hashed
// record. The day a ship-class effect wants a credit, the answer belongs in a
// declaration beside the matrix, not in a condition here.
//
// NO NEW VALIDATION. The door does not test the amount for finiteness and does
// not throw on a strange one. Today `e.hp -= NaN` quietly makes hp NaN; a throw
// here would be a behavior change wearing a correctness argument, and R5 step 1
// is byte-identical.
//
// RETURNS the amount actually applied, or **null when the matrix REFUSED** —
// and that distinction is the prevention rule's own, made real on the one leg
// that already needs it. A refusal is a SKIP: nothing happened, so a caller
// must not go on to consume an i-frame, paint a flash or bill a counter for it.
// `hitPlayer` is the caller that does exactly that check, because its gates sit
// AFTER the subtraction rather than before it.
//
// `null` and `0` are therefore different answers: null is "the event never
// ran", 0 is "it ran and landed nothing". A zeroed BLOCK, when the hook layer
// brings one, returns 0 and keeps its on-hit consequences. That is the whole
// rule, and the return type is where it first becomes checkable.
//
// THE FACTOR IS APPLIED HERE AND NOWHERE ELSE. A caller that consults `mayHit`
// itself must use the answer as a GATE and pass the RAW amount — pre-multiplying
// and then handing the product to this door applies the factor twice. That is
// not hypothetical: `blastAt`'s D1 loop did exactly that for one commit, and it
// was invisible at every shipped row (1 x 1 = 1) until a leg dialled the cell to
// 0.5 and got 0.25.
function applyEffect(ev) {
  const t = ev.target;
  const pool = POOL[ev.tgtCls];
  if (!pool) {
    throw new Error("Engine.applyEffect: target class " + ev.tgtCls +
      " declares no damage pool — a class is damageable only where POOL says so");
  }

  // the amount pipeline: the caller's ask, then the matrix factor.
  let amount = ev.amount === undefined ? ev.baseAmount : ev.amount;

  // THE MATRIX CONSULTATION, and it happens only for a CLASSIFIED source. An
  // event that declares no source class is UNCLASSIFIED and the matrix is not
  // asked — it has nothing to ask about. That is not a loophole: it is the
  // shape of hitPlayer, which takes no damage source by an owner ruling, so
  // every hit a pilot takes arrives here unclassified. The rows for those
  // pairings are declared all the same (see MATRIX) and go live the day
  // hitPlayer learns its source; until then they are the record, not the gate.
  //
  // A REFUSED event is a SKIP, in the prevention rule's exact sense: no
  // subtraction, no credit, nothing happened. A factor between 0 and 1 is a
  // reduction and the event runs normally. Every shipped row is 1, and
  // `x * 1` is exactly `x` for every finite double, so routing the shipped
  // pairings through the factor moves no hash.
  if (ev.source !== undefined && ev.source.cls !== undefined) {
    const f = mayHit(ev.kind, ev.source.cls, ev.tgtCls);
    if (f === 0) return null; // REFUSED — a skip, and the caller can tell
    amount *= f;
  }

  // the subtraction. Spelled per pool so the count leg can find it — see POOL.
  if (pool === "hull") t.hull -= amount;
  else t.hp -= amount;

  // credit, collapsing rightward
  const statSource = ev.statSource === undefined
    ? (ev.source === undefined ? undefined : ev.source.seat)
    : ev.statSource;
  const credit = ev.credit === undefined ? statSource : ev.credit;
  if (credit !== undefined && credit >= 0) t.lastAtk = credit;

  return amount;
}

const Engine = {
  CLASS,
  applyEffect,
  mayHit,
  selfSplash: () => SELF_SPLASH,
  // The table itself, published MUTABLE and on purpose. D1's ruling says the
  // retune is "a data edit to the factor, never a code change", and a claim
  // like that is only true if something can actually make the edit — so the
  // matrix leg in tests/wave1-checks.js flips `blast: SHIP -> SHIP` to 0,
  // re-runs the identical scenario, and restores it. That flip IS the leg's
  // sabotage, and it is also the demonstration that the row is CONSULTED
  // rather than decorative. Nothing in the shipped game writes here.
  MATRIX,
  acquire,
  // ...and the acquire masks, published on the MATRIX's footing and for the
  // same reason: D25's whole cost argument is that reversing it must be a
  // DECLARATION change, so the declaration has to be reachable. The D25 leg
  // admits ORDNANCE to DEFAULT, proves the nearer ordnance candidate is then
  // taken, and puts it back — that flip is the leg's sabotage.
  ACQUIRE,
  isContact,
  CONTACT_KINDS, // published for the same reason MATRIX is: D28's scope is data,
                 // and the leg that proves the narrowed refusal edits it
};

window.Engine = Engine; // the vm sandbox and the page both reach it here; a
                        // classic script's top-level const is not a window
                        // property (the window.Flight / window.Abilities
                        // precedent)
