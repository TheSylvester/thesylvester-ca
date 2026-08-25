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
  // the comet's persistent damaging AREA (D26). Its OWN kind, on the exact
  // footing `chain` and `beam` took in R5: each new DELIVERY MECHANISM gets a
  // kind, because folding it into an existing one would make one cell answer
  // for two mechanisms. An aura is not a shot (nothing was fired), not a blast
  // (nothing terminated), and not a ram (no hull touched anything) — it is a
  // volume that overlaps, tick after tick, and that is a fourth mechanism.
  //   R6 DECLARES THE ROWS AND BUILDS NO SWEEP. The pass is PORT-S's, because
  // production has nothing for an aura to kill today (there is no enemy round
  // in production at all). So every row below is INERT: the table records the
  // decision, and the day the sweep exists it reads these cells rather than
  // asking someone to decide again.
  aura: {},
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

// ---- THE AURA'S ROWS (D26). R6 OWES THESE AND THIS IS THEM -----------------
// R5 declared the AURA class with NO row in any kind, deliberately, so that an
// aura-sourced effect would reach mayHit and THROW by name — "the class is
// declared, the rows are owed, and the throw says which round owes them". This
// is that round, and these are those rows. R5's own leg in tests/wave1-checks.js
// is re-aimed in this commit, because the red is how R6 was told it owed them.
MATRIX.aura[CLASS.AURA] = {};
MATRIX.aura[CLASS.AURA][CLASS.ORDNANCE] = 1; // THE RULING ITSELF. D26: "it should
                                             // destroy any new projectiles ...
                                             // with hp and therefore those don't
                                             // damage the player any more". What
                                             // the burn eats is decided by the
                                             // `hp > 0` filter and NEVER by a
                                             // second destruction path — D10's
                                             // "the fix is ONE field" depends on
                                             // that, and so does R7's anti-
                                             // doubling protection.
MATRIX.aura[CLASS.AURA][CLASS.BODY] = 1;     // ...and the other half of the same
                                             // sentence: "or drones with hp".
                                             // The demo's drone reaches the door
                                             // as a BODY today (R5 commit F), so
                                             // THIS row is what covers the owner's
                                             // drones. If a later round classifies
                                             // a placed object CONSTRUCT, that row
                                             // is one line and it is owed then,
                                             // not invented now.
MATRIX.aura[CLASS.AURA][CLASS.SHIP] = 0;     // OFF, and PENDING rather than
                                             // settled: whether a burning pilot's
                                             // aura hurts a rival pilot is a feel
                                             // question the comet round owns
                                             // (§2.11's open items), not one R6
                                             // may answer by writing a 1 here. It
                                             // is declared at 0 rather than left
                                             // undeclared — the ORB precedent
                                             // above — so the eventual ruling is
                                             // an edit to a cell that already
                                             // exists.
// aura -> ORB and aura -> CONSTRUCT are NOT declared, on `blast -> CONSTRUCT`'s
// own reasoning: an orb is a pickup and nothing in the game reduces it, and no
// kind is classified CONSTRUCT today. Undeclared is OFF.
//
// THE ORDERING LAW THAT COMES WITH THESE ROWS is not expressible in a factor,
// so it is declared in the tick-order table below (see PHASE_ORDER): the aura
// damage pass runs BEFORE the ordnance-vs-player pass on the same tick, so a
// child spawned inside a burning comet dies the tick after it spawns instead of
// landing. D26 calls that "part of the ruling"; §2.11 calls it "the law".

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

// ---- THE RNG SUBSTREAM MIXER (spec harvest §2.6.3b) ------------------------
// One shared random stream is a coupling nobody declared. Every draw advances
// it, so ADDING AN ENTITY OR A BRANCH ANYWHERE SHIFTS EVERY DRAW AFTER IT — a
// whole bug class, and the bench research already documents an instance of it
// by name: *"do not copy `splitBody` wholesale... it draws `rand()` for the base
// angle, and a player-triggered draw shifts every subsequent seeded wave deal"*.
// The demo kernel has the same shape and worse odds, because its FX consume the
// gameplay stream: one heavy kill spends about 203 draws on particles alone, so
// a burst is a bigger perturbation than the wave deal it displaces.
//
// THE FIX IS A SUBSTREAM PER PURPOSE. A draw derives its own generator from
// `(runSeed, waveId, spawnOrdinal, entityId, attackSequence, purposeTag)`, so
// two draws that should be independent ARE independent, and a new branch can
// never advance a stream it has nothing to do with.
//
// THE IN-REPO PRECEDENT, and it is exact: `makeStars` (js/demo-kernel.js)
// already builds its own `mulberry32((S.seed ^ 0x91e10da5) >>> 0)` and draws
// seven times per star without touching the gameplay stream. That is a
// substream, derived by XOR from the run seed, and it has been shipping since
// the demo was written. This is the same idea with a wider key.
//
// THE CANDIDATE-LIST RULE travels with the mixer and is stated here because it
// is the half a mixer alone does not buy: **a list is SORTED before it is
// sampled.** A substream makes the DRAW reproducible; sorting makes the
// SELECTION reproducible, and a stable draw over an unstable list is still
// unstable. Adoption happens where draws actually move (commit F); the rule is
// declared here so it is not rediscovered later as a defect.
//
// WHY THE ALGORITHM IS SPELLED HERE and not imported: js/engine.js loads BEFORE
// js/demo-kernel.js and must not depend on it, and js/encounter.js is the file
// PORT-S dismantles. So this is a THIRD copy of mulberry32 — and a third copy
// is only safe if something checks it, which is the repo's own hand-mirrored-
// copy alarm (NAME_MAX, SKIN_COUNT and the two draw tables all keep one). The
// leg in test/node-golden.mjs drives all three copies over a pinned seed and
// asserts they agree step for step.
// THE BODY IS THE TREE'S, LINE FOR LINE, and it has to be: a "mulberry32" that
// combined its rounds differently would be a different generator wearing a
// shared name, which is the worst outcome a mirrored copy can have. The alarm
// below caught exactly that on this function's first run — the first draft here
// carried `(t + Math.imul(...)) >>> 0` where the tree carries `... ^ t`, and the
// two disagree from draw zero. That is the whole argument for the alarm.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The purpose vocabulary — the census's own categories, which is the honest
// place for it to come from. A purpose is what makes two draws independent, so
// inventing them per call site would put the whole point back where it started.
const PURPOSE = {
  DEAL: "deal",         // the wave deal: which bodies, how many, in what shape
  SPAWN: "spawn",       // one body's own initialisation at birth
  BEHAVIOR: "behavior", // a living body's decisions
  SHAPE: "shape",       // a round's shape at spawn — the heavy's curve, the
                        // cluster's scatter
  ORB: "orb",           // the death reward's drift
  FX: "fx",             // EVERY presentation draw. The census is why this one
                        // exists: FX dominate the stream at run time, so an FX
                        // substream is what actually kills the coupling.
};

// ONLY INTEGER OPERATIONS, and that is a cross-runtime requirement rather than
// a style. Math.imul, xor, shift and the unsigned coercion are exact in every
// JavaScript engine; a float multiply is not guaranteed to be, and the whole
// value of a substream is that Node and a browser agree about it. The final
// division inside mulberry32 is by a power of two, which is exact in binary64.
function mixIn(h, v) {
  let x = (h ^ (v >>> 0)) >>> 0;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x = (x ^ (x >>> 13)) >>> 0;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}
// A purpose is a STRING at the call site, because a call site reading
// `PURPOSE.FX` is self-documenting in a way an integer never is. It folds to an
// integer here with FNV-1a over its code units — one authority, and no table of
// magic numbers to keep in step with the vocabulary above.
function purposeCode(tag) {
  let h = 0x811c9dc5;
  const s = String(tag === undefined || tag === null ? "" : tag);
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
// The seed derivation, separated from the generator so a caller can pin, log or
// compare a substream's KEY without drawing from it — and so the golden vector
// can assert the seed and the sequence independently.
function substreamSeed(runSeed, waveId, spawnOrdinal, entityId, attackSequence, purposeTag) {
  let h = (runSeed >>> 0);
  h = mixIn(h, waveId >>> 0);
  h = mixIn(h, spawnOrdinal >>> 0);
  h = mixIn(h, entityId >>> 0);
  h = mixIn(h, attackSequence >>> 0);
  h = mixIn(h, purposeCode(purposeTag));
  return h >>> 0;
}
// ...and the generator itself. SPAWN ORDINALS AND ATTACK SEQUENCES ARE HASHED
// STATE — the spec says so and it is what makes a substream reproducible across
// a replay: a key built from an unhashed counter would give a replay a
// different stream than the run it is replaying.
function substream(runSeed, waveId, spawnOrdinal, entityId, attackSequence, purposeTag) {
  return mulberry32(substreamSeed(runSeed, waveId, spawnOrdinal, entityId, attackSequence, purposeTag));
}

// ---- THE KIND REGISTRY (P2 `unit-list`, P9 `present-class`) ----------------
// The declaration plane for every entity the two simulations field. One row per
// KIND, seven obligations per row, and the row is the place a later round reads
// instead of re-deriving. R7 compiles its codec from here; PORT-S compiles the
// merged list from here.
//
// ---- WHAT THIS IS NOT, AND THE DEBT THAT BUYS IT --------------------------
// The plan's sentence is *"the four arrays (bullets, enemies, missiles, orbs)
// become one registry-driven list"*. THE PHYSICAL MERGE IS NOT IN THIS ROUND,
// and that is a seat ruling with a stated price rather than a corner cut. The
// production reconnaissance found ten hazards under byte-identity and three of
// them are structural:
//
//   1. `hashEncounter`'s enemy walk folds `h.u32(i)` — the ENEMIES-ONLY ARRAY
//      INDEX (js/encounter.js). Nothing else in the codebase folds a container
//      index. A merged list must still answer "what is this body's dense index
//      among enemies only, in enemies-only insertion order", and deriving it
//      from a merged position is simply wrong.
//   2. ENEMIES ARE NOT LENGTH-PREFIXED while missiles and orbs are, and the
//      asymmetry is load-bearing: a type with zero live members folds NOTHING,
//      which is what lets ROSTER grow without moving a committed hash. A
//      uniform registry walk that added a per-KIND header re-keys every trace.
//   3. FORTY-FIVE synthetic bullet pushes across tests/ and test/ carry no `id`
//      at all. A registry keyed by id, or one assuming a fixed record shape,
//      invalidates the very fixtures that prove byte-identity.
//
// So a physical merge re-keys every trace — which is exactly the cost D21's own
// logic routes to PORT-S, where the 25-fixture bill and the ~700-check rewrite
// are already priced. R6 builds the DECLARATION plane over the existing
// per-class storage. **THE MERGE IS NAMED DEBT, ASSIGNED TO PORT-S**, and this
// paragraph is the record of it.
//
// ---- THE SEVEN OBLIGATIONS ------------------------------------------------
// Every kind declares all seven. A kind missing one is RED (the completeness
// leg in test/node-golden.mjs), because a registry with holes is a registry a
// consumer has to guess around, and guessing is what the plane exists to stop.
//
//   hash        WHERE this kind's hashed field list lives — never a COPY of it.
//               A copy would be a second authority standing beside the one the
//               fixtures are actually folded from, and two authorities drift.
//               `{ where, fields, guarded }`, all by NAME, and `guarded` is a
//               LIST because a kind can have more than one guarded block. The
//               bolt has two: `blastR`'s, and P1's `{hp, trk, phase, flank}`.
//               It was a single string and the bolt named only the first, so
//               the row was complete BY SHAPE and incomplete IN FACT — a later
//               registry-driven hash consumer would have folded P1's block out
//               of existence and nothing would have said so. The pointer oracle
//               validates every name in the list.
//   wire        the wire row encoder, by name, or null for a kind that does not
//               replicate. R7 compiles from this column.
//   present     P9. The presentation lane the kind is drawn through — which
//               PRES cache on production, which draw pass in the demo.
//   clear       `{ store, onRestart }` — the collection the kind lives in, and
//               what a restart does to it.
//   cap         the cap policy. Vocabulary and contract: see CAP below.
//   ownerDeath  `persist | detach | despawn` — what becomes of a live instance
//               when whatever spawned it dies.
//   hp          D10's SEVENTH obligation. 0 (the default) means NEVER SHOOTABLE
//               and the collision pass skips the kind entirely, which is what
//               buys those kinds zero runtime, zero wire and zero cap
//               interaction. A string names an external authority for a kind
//               whose hp is table-driven rather than per-kind constant.
//
// EFFECTS AND BUFFS ARE NOT ENTITIES and get no row. They stay plain records —
// the plan says so in as many words, and the reason is that an entity carries
// seven obligations an effect has no answer for.
//
// ---- WHAT IS ENFORCED TODAY, AND WHAT IS ONLY WRITTEN DOWN ----------------
// A declaration nothing reads is DEBT, and calling it a gate would be worse
// than not writing it. Honestly, per column:
//
//   ENFORCED
//     hp        — commit F's bullet-vs-bullet pass filters on it, and a leg
//                 cross-checks every kernel bullet branch's assigned `hp`
//                 against the number declared here. The registry is the
//                 authority; a kernel edit that forgets this table reds.
//     cap       — commit B's contract, and the kernel's own cap is measured
//                 against it (it VIOLATED the contract before commit F).
//     clear     — a leg drives the kernel's `resetRun` and production's
//                 `restart` and asserts every declared store comes back empty.
//
//   DESCRIPTIVE — recorded truth with no consumer in the tree yet
//     hash      — a leg checks the NAMED list exists where the row says it
//                 does, which is a spelling gate and not a contents gate. The
//                 contents consumer is PORT-S's merged fold.
//     wire      — R7 compiles the codec from this column. Nothing reads it now.
//     present   — PORT-S's presentation plane reads it. Nothing reads it now.
//     ownerDeath— PORT-S. Nothing reads it now, and the two divergences it
//                 already records (see the kernel bullet row) are its first
//                 pieces of work.
//
// ---- TWO SURFACES, ON PURPOSE ---------------------------------------------
// `production` and `kernel` are separate maps because they are separate entity
// planes today with colliding names (both field an "orb"), and PORT-S is the
// round that merges the two. A single flat map would have to invent a
// namespacing convention this round cannot yet retire.
const OBLIGATIONS = ["hash", "wire", "present", "clear", "cap", "ownerDeath", "hp"];

// The owner-death vocabulary, exactly the three the plan names.
const OWNER_DEATH = {
  PERSIST: "persist",   // the instance outlives whatever made it
  DETACH: "detach",     // it survives, but loses its tie to the owner
  DESPAWN: "despawn",   // it goes when the owner goes
};

// ---- THE CAP-REJECTION CONTRACT --------------------------------------------
// "Cap policy" was a registry field with a name and no definition. This is the
// definition, harvested out of the enemy spec into this round (§2.6.3):
//
//   `rejectNewest` IS THE DEFAULT.
//   THE REJECTION CONSUMES THE ATTEMPTED COOLDOWN — a spawner refused at the
//     cap must not be able to retry every tick. Without this clause a capped
//     spawner spins its whole state machine on the spot, and the cap turns from
//     a limit into a busy loop.
//   IT EMITS A `capDenied` CUE. A refusal a player cannot perceive is
//     indistinguishable from a bug, and once D10 lets players DESTROY ordnance
//     that stops being a nicety: a silent eviction and a player kill look
//     exactly alike on screen.
//   IT NEVER SILENTLY EVICTS A LIVE ENTITY. **A cap that evicts is a bug, not a
//     policy** — the plan's own words. Something already in the world does not
//     stop existing because something else wanted to be born.
//
// THE FREED-SLOT RULE, which the plan asks this contract to answer and which
// D10 makes urgent: **a destroyed entity frees its slot at the COMPACTION
// FILTER, and a new spawn is admitted the moment the LIVE count is below the
// cap. Nothing is ever evicted to make room.** So a round destroyed mid-tick
// still holds its slot for the rest of that tick — it is marked dead and the
// filter has not run — and the slot opens on the next admission test after it.
// That is a consequence of reading the live count rather than a rule needing
// its own code, and it is written down because "when does a kill free a slot"
// is precisely the question a player asks with a full board.
//
// THE CONTRACT IS A FUNCTION, and that is the strongest form the "never evicts"
// clause can take: `capAdmit` is handed a count and returns an ADMISSION. It is
// never handed the collection, so it has no way to name a victim — the API
// cannot express an eviction at all. A caller that wants one has to write it
// itself, in the open, where a reviewer sees it.
const CAP = {
  // the policies
  REJECT_NEWEST: "rejectNewest",
  UNCAPPED: "uncapped",
  // the scopes. OWNER means the count is per spawner — one seat, one body —
  // so a crowded field can never starve an individual; SHARED means one budget
  // for the whole collection.
  OWNER: "owner",
  SHARED: "shared",
};
// `conformance` is the honest column: what the SHIPPED code at this cap
// actually does about the three clauses. It is recorded, never enforced by
// changing behavior — a cap that bills differently is a FEEL decision and R6
// rules none.
function capped(scope, max, source, conformance) {
  return { policy: CAP.REJECT_NEWEST, scope: scope, max: max, source: source, conformance: conformance };
}
const UNCAPPED = {
  policy: CAP.UNCAPPED, scope: null, max: null, source: null,
  conformance: "n/a — no cap, so there is nothing to conform to",
};
// The admission test. `live` is the count already in the world under this cap's
// SCOPE — the caller owns the counting, because only the caller knows whether
// the scope is one spawner's brood or the whole array.
function capAdmit(row, live) {
  const cap = row && row.cap;
  if (!cap) {
    throw new Error("Engine.capAdmit: the kind declares no cap policy — cap is one of " +
      "the seven registry obligations and an undeclared one is a caller bug");
  }
  if (cap.policy === CAP.UNCAPPED) return { admit: true, cue: null };
  if (cap.policy !== CAP.REJECT_NEWEST) {
    throw new Error("Engine.capAdmit: unknown cap policy '" + cap.policy +
      "' — a cap that evicts is a bug, not a policy");
  }
  if (live < cap.max) return { admit: true, cue: null };
  return { admit: false, cue: "capDenied" };
}

// The registry. Rows are grouped by family, and a family whose seven answers are
// identical is built by a named helper — so the ONE row that differs is visible
// rather than buried in sixteen copies of the same literal. The helper spells
// all seven itself, so a helper that dropped one reds the completeness leg for
// every row it built at once.
function prodBody(hp) {
  return {
    hash: { where: "js/encounter.js", fields: "ENEMY_HASH", guarded: [] },
    wire: "server/snapshot.mjs encodeEnemy",
    present: "PRES.enemies",
    clear: { store: "E.enemies", onRestart: "cleared" },
    cap: UNCAPPED,
    ownerDeath: OWNER_DEATH.PERSIST,
    hp: hp,
  };
}
// A kernel body. `hp` comes from the kernel's own STATS row, so the column names
// that authority rather than copying the number out of it.
function kernelBody(present) {
  return {
    hash: { where: "test/tools/demo-serial.js", fields: "INCLUDED S.enemies (whole record, keys sorted)", guarded: [] },
    wire: null,
    present: present,
    clear: { store: "S.enemies", onRestart: "cleared" },
    cap: UNCAPPED,
    ownerDeath: OWNER_DEATH.PERSIST,
    hp: "js/demo-kernel.js STATS",
  };
}
// A kernel enemy ROUND. Every one of the 21 shares six answers; only `hp`
// differs, and that column is D10's table plus D27.
function kernelRound(hp) {
  return {
    hash: { where: "test/tools/demo-serial.js", fields: "INCLUDED S.bullets (whole record, keys sorted)", guarded: [] },
    wire: null,
    present: "demo-render drawBullet",
    clear: { store: "S.bullets", onRestart: "cleared" },
    // 280 SHARED, and it is the kernel's one cap. It was the contract's only
    // outright VIOLATION — spawnEnemyBullet marked the LOWEST-INDEX live enemy
    // round dead and pushed anyway, and because the array is push-ordered with
    // order-preserving removals, lowest index means OLDEST. It was silent, so
    // on screen it was indistinguishable from the player having shot the round
    // down, which is the confusion D10 turns from cosmetic into a real one.
    // R6's kernel commit replaced it, and this column now records what SHIPS
    // rather than what shipped.
    cap: capped(CAP.SHARED, 280, "js/demo-kernel.js spawnEnemyBullet",
      "CONFORMS on all three clauses. The test is Engine.capAdmit on this row, " +
      "so the oldest survives and nothing is evicted; the refusal reaches the " +
      "host through setSink's cue channel; and the attempted cadence is billed, " +
      "because every caller in the kernel sets its cooldown outside the spawn " +
      "branch. It is a TRUE live-population ceiling: the count is tested before " +
      "the push and the push is refused, so enemy rounds never exceed 280. " +
      "Driven by the synthetic 280-round scenario in test/node-golden.mjs — the " +
      "fixture peaks at 44 and never reaches this path on its own."),
    // PERSIST is the GENERAL rule and the honest one: a round outlives the body
    // that fired it. THE DIVERGENCE, recorded rather than smoothed over: a round
    // whose owner was a BOSS is swept dead by killEnemy's boss branch, so the
    // kernel actually holds TWO rules keyed on the owner's class. Three values
    // cannot say that, and inventing a fourth here would be designing PORT-S's
    // vocabulary from R6. Debt, named.
    ownerDeath: OWNER_DEATH.PERSIST,
    hp: hp,
  };
}
const KINDS = {
  production: {
    // The player's round. It lives in G.bullets, in game.js rather than the
    // encounter — a module boundary, a hash-part boundary and a wire-filter
    // boundary all at once, and the single biggest reason the physical merge is
    // PORT-S's rather than this round's.
    bolt: {
      hash: { where: "js/game.js", fields: "BULLET_HASH", guarded: ["BULLET_HASH_GUARDED", "BULLET_ORDNANCE_GUARDED"] },
      wire: "server/snapshot.mjs encodeBullet",
      present: "PRES.bullets",
      clear: { store: "G.bullets", onRestart: "cleared" },
      // BMAX 15, OWNER-SCOPED so one seat can never starve another.
      cap: capped(CAP.OWNER, 15, "js/game.js BMAX / fire()",
        "rejectNewest: conforms — fire() returns and nothing is evicted. " +
        "DEBT, two clauses: the attempted cooldown is NOT billed (P.cool is set " +
        "after the cap test, so a refused shot leaves the trigger hot and fires " +
        "the instant a slot frees), and there is no capDenied cue. Both are FEEL " +
        "decisions on the player's own trigger and R6 rules none — recorded, not " +
        "changed. Note abilityFire diverges the other way and says so in place: " +
        "its cooldown is paid at the ARM, so its refusal DOES bill."),
      ownerDeath: OWNER_DEATH.PERSIST, // a dead seat's rounds fly on
      hp: 0, // production fields no destructible ordnance; nothing shoots a bolt
    },
    // The harrier's seeker. Its own array, its own hash block, its own encoder.
    missile: {
      hash: { where: "js/encounter.js", fields: "MISSILE_HASH", guarded: [] },
      wire: "server/snapshot.mjs encodeMissile",
      present: "PRES.missiles",
      clear: { store: "E.missiles", onRestart: "cleared" },
      cap: capped(CAP.SHARED, 6, "js/encounter.js ECFG.missile.max / spawnMissile",
        "rejectNewest: conforms, and the BILLING clause conforms too — the " +
        "lockon branch sets e.cd = P.cooldown outside the launch, with the " +
        "reason written beside it (\"a capped harrier cannot spin the lock over " +
        "and over\"). DEBT: no capDenied cue."),
      ownerDeath: OWNER_DEATH.PERSIST, // it ends on a hit, a wall or its fuse —
                                       // never on the body that launched it
      // A seeker IS shot down today, and it is the precedent D25 records: a
      // player round that kills one pays "no orb, no XP, no entry in E.kills".
      // Its hull is ECFG.missile.hp, so the column names that authority.
      hp: "js/encounter.js ECFG.missile.hp",
    },
    // The XP pickup. It declares no damage pool at all (see POOL), so its `hp`
    // is 0 in the strongest sense the column has: nothing in the game reduces it.
    orb: {
      hash: { where: "js/encounter.js", fields: "ORB_HASH", guarded: [] },
      wire: "server/snapshot.mjs encodeOrb",
      present: "PRES.orbs",
      clear: { store: "E.orbs", onRestart: "cleared" },
      cap: UNCAPPED,
      ownerDeath: OWNER_DEATH.PERSIST,
      hp: 0,
    },
    // THE ROSTER, in ROSTER order (js/encounter.js). ORDER IS A WIRE CONTRACT
    // against server/snapshot.mjs's ENEMY_TYPES and server/snapshot.test.mjs
    // pins the equality by reading the source, so this list is APPEND ONLY and
    // R6 must not reorder it. Every hull is table-driven from statsFor(), which
    // is why the column names the function instead of copying sixteen numbers.
    dart: prodBody("js/encounter.js statsFor().hull"),
    harrier: prodBody("js/encounter.js statsFor().hull"),
    radarHarrier: prodBody("js/encounter.js statsFor().hull"),
    charger: prodBody("js/encounter.js statsFor().hull"),
    radarCharger: prodBody("js/encounter.js statsFor().hull"),
    husk: prodBody("js/encounter.js statsFor().hull"),
    anvil: prodBody("js/encounter.js statsFor().hull"),
    shard: prodBody("js/encounter.js statsFor().hull"),
    radarDart: prodBody("js/encounter.js statsFor().hull"),
    packHusk: prodBody("js/encounter.js statsFor().hull"),
    wardAnvil: prodBody("js/encounter.js statsFor().hull"),
    eliteDart: prodBody("js/encounter.js statsFor().hull"),
    eliteHarrier: prodBody("js/encounter.js statsFor().hull"),
    eliteCharger: prodBody("js/encounter.js statsFor().hull"),
    eliteHusk: prodBody("js/encounter.js statsFor().hull"),
    eliteAnvil: prodBody("js/encounter.js statsFor().hull"),
  },
  kernel: {
    // ---- the 21 enemy ROUNDS, in the kind ladder's own code order ----------
    // `hp` is D10's owner-ruled table (.ai-reference/ordnance-taxonomy.md §4)
    // AS AMENDED BY D27. Radius predicts the default and the encounter
    // overrides it: kineticLance is r 10 and stays at 0, because at 720 px/s it
    // is the fastest thing in the game and a boss signature that "must be
    // dodged, not answered". That row is the whole argument against a flat rule.
    heavy: kernelRound(4),
    broadside: kernelRound(0),
    plasma: kernelRound(4),
    flame: kernelRound(0),
    // `mine` IS NOT HERE. D10 promotes it out of the round plane entirely and
    // it is declared below as an ENTITY, on the drone precedent.
    grenade: kernelRound(4),
    rocket: kernelRound(2),
    retaliation: kernelRound(0),
    arc: kernelRound(0),
    spitOrb: kernelRound(6),
    serpentFire: kernelRound(2),
    kineticLance: kernelRound(0),
    omegaSphere: kernelRound(6),
    omegaSide: kernelRound(0),
    darkFire: kernelRound(2),
    vortex: kernelRound(2),
    splitter: kernelRound(6),
    lightning: kernelRound(0),
    asteroid: kernelRound(4),
    // D27, and these two rows are the whole of it: `cluster` and `mineShard`
    // LEAVE the hp-0 tier so that a comet destroys splitting ordnance "entirely
    // (and their spawns)" without a special rule anywhere in the sim. D10
    // deferred the chaff tier on a statement about AIMING — "aiming at them is
    // not a real choice" — and AN AURA DOES NOT AIM, so giving them an hp
    // creates no bad aiming choice. D27 states the shape as "1-2" and leaves
    // the number to the balance pass; 1 is declared because it is the low end
    // of the stated band and D27's intent is that the burn clears these
    // outright. It is one player shot either way (the shot is damage 2).
    //   THE WIRE HALF OF D10'S BILL STAYS UNSPENT, which D27 requires: these
    // two declare `hp` WITHOUT a per-kind death event and vanish on the
    // existing ballistic despawn, so R7's anti-doubling protection holds.
    cluster: kernelRound(1),
    mineShard: kernelRound(1),
    // The player's round in the demo. It never passes through the kind ladder
    // and it is uncapped — today's truth, and commit F does not change it.
    bolt: {
      hash: { where: "test/tools/demo-serial.js", fields: "INCLUDED S.bullets (whole record, keys sorted)", guarded: [] },
      wire: null,
      present: "demo-render drawBullet",
      clear: { store: "S.bullets", onRestart: "cleared" },
      cap: UNCAPPED,
      ownerDeath: OWNER_DEATH.PERSIST,
      hp: 0,
    },
    // ---- the placed object ------------------------------------------------
    // `mine` — D10's entity promotion, ruled by the owner: "a slow stationary
    // hazard wearing a bullet's clothes, and it is the thing players most want
    // to shoot". Declared HERE as an entity in this commit; the promotion in
    // the kernel is commit F's. The `armed 0.72` fuse and the `proximity 74`
    // trigger are the mine's IDENTITY and move with it — they are not bullet
    // machinery. Its shrapnel (`mineShard`) stays a round, chaff by
    // construction.
    //   hp 2 is the DRONE precedent, which is the precedent the taxonomy names
    // for the promotion itself: one player shot pops a placed object. It is a
    // declaration and not balance — PORT-S tunes it with the rest.
    mine: {
      hash: { where: "test/tools/demo-serial.js", fields: "INCLUDED S.enemies (whole record, keys sorted)", guarded: [] },
      wire: null,
      present: "demo-render drawEnemy",
      clear: { store: "S.enemies", onRestart: "cleared" },
      // THIS IS A LAY-ATTEMPT THRESHOLD, NOT A LIVE-POPULATION CEILING, and
      // the distinction is the review's and it is correct. Two things put the
      // live count above 4:
      //   * A LAY IS A PAIR. One admission at three live mines lays two, so the
      //     count reaches five from a single admitted attempt.
      //   * DEATH DROPS BYPASS THE CENSUS ENTIRELY. killEnemy's minelayer
      //     branch drops three from its centre without consulting any cap,
      //     because a body's death is not a spawn cadence.
      // Measured on the bounded run: one owner reaches SEVEN live mines at tick
      // 4724. The number is a cadence limiter — how often a layer may add to
      // the field — and describing it as a ceiling would be describing a
      // behaviour the kernel does not have.
      //
      // IT IS DESCRIBED, NOT CHANGED. Making it a true ceiling means admitting
      // per mine rather than per attempt and deciding whether a death drop must
      // ask permission, and both are feel decisions this round does not own.
      cap: capped(CAP.OWNER, 4, "js/demo-kernel.js updateMinelayer census",
        "CONFORMS on all three clauses — the census declines, the cadence is set " +
        "outside the branch, and the refusal cues through the sink. But the " +
        "value is a LAY-ATTEMPT threshold and NOT a live ceiling: a lay is a " +
        "PAIR (an admission at 3 reaches 5) and killEnemy's death drop bypasses " +
        "the census entirely. Observed peak for one owner: 7 live, at tick 4724."),
      ownerDeath: OWNER_DEATH.PERSIST, // a laid mine outlives its layer, which
                                       // is the point of laying it
      hp: 2,
    },
    // ---- the ~20 bodies, in STATS declaration order ------------------------
    swarmling: kernelBody("demo-render drawEnemy"),
    warden: kernelBody("demo-render drawEnemy"),
    interceptor: kernelBody("demo-render drawEnemy"),
    hammerhead: kernelBody("demo-render drawEnemy"),
    hive: kernelBody("demo-render drawEnemy"),
    // The drone: the shipped shootable-projectile pattern, and the precedent
    // `mine` is promoted on. It already ships §6's denial-only reward — a drone
    // pays score and drops NO orb. Its cap is the hive's own six-child census,
    // the second conforming precedent commit B cites.
    drone: Object.assign(kernelBody("demo-render drawEnemy"), {
      // Unlike the mine's, this one IS a true ceiling: the hive spawns
      // min(3, 6 - children), so an admission can never carry the population
      // past the number. Nothing bypasses it — a hive's death spawns nothing.
      cap: capped(CAP.OWNER, 6, "js/demo-kernel.js updateHive census",
        "CONFORMS on the rejection and the billing, and it is a TRUE live " +
        "ceiling — the hive spawns min(3, 6 - children), so an admission cannot " +
        "carry the count past 6. DEBT: no capDenied cue; the hive declines " +
        "silently, which is the one clause of the three it still does not keep."),
    }),
    tracer: kernelBody("demo-render drawEnemy"),
    minelayer: kernelBody("demo-render drawEnemy"),
    myrmidon: kernelBody("demo-render drawEnemy"),
    snapper: kernelBody("demo-render drawEnemy"),
    bulwark: kernelBody("demo-render drawEnemy"),
    cherub: kernelBody("demo-render drawEnemy"),
    constructor: kernelBody("demo-render drawEnemy"),
    turret: kernelBody("demo-render drawEnemy"),
    vanguard: kernelBody("demo-render drawEnemy"),
    pulsar: kernelBody("demo-render drawEnemy"),
    omegaDefender: kernelBody("demo-render drawEnemy"),
    spitfire: kernelBody("demo-render drawEnemy"),
    stationOmega: kernelBody("demo-render drawEnemy"),
    starEater: kernelBody("demo-render drawEnemy"),
    // ---- the pickup --------------------------------------------------------
    orb: {
      hash: { where: "test/tools/demo-serial.js", fields: "INCLUDED S.orbs (whole record, keys sorted)", guarded: [] },
      wire: null,
      present: "demo-render drawOrb",
      clear: { store: "S.orbs", onRestart: "cleared" },
      cap: UNCAPPED,
      ownerDeath: OWNER_DEATH.PERSIST,
      hp: 0,
    },
  },
};

// ---- THE 14-PHASE REFERENCE TICK ORDER -------------------------------------
// Harvested from the enemy spec into this round as the REFERENCE ordering. It
// is a declaration and a measuring stick, NOT an adoption: neither simulation
// runs in this order today, and moving either one into it is a hash change with
// a fixture bill. The two mappings below are what a PORT-S author reads instead
// of re-deriving them.
//
// **DO NOT ADOPT ASCENDING-STABLE-ID ITERATION ANYWHERE.** The spec's phase
// preamble says arrays iterate by ascending stable id; today's rule is LIVE
// ARRAY ORDER in both simulations, and the production enemy fold puts the array
// INDEX into the hash. Insertion order stops equalling id order after the first
// splice, so adopting the spec's rule re-keys every trace. The reference is
// declared; the adoption is PORT-S's, with the bill.
const PHASE_ORDER = [
  "1  apply due removals, cancellations and spawns from prior ticks",
  "2  expire statuses, run due periodic status commands, recompute derived unions",
  "3  materialize due wave-director commands",
  "4  validate and acquire targets",
  "5  advance enemy FSMs; one transition per instance per tick",
  "6  generate attack/navigation/defense/child commands without mutating collections",
  "7  sum forces and integrate once",
  "8  activate existing projectile, beam, hazard, mine and deployable behaviors",
  "9  broad phase, then narrow collisions",
  "10 resolve combat events and procs through the funnel",
  "11 resolve deaths, splits, detaches, rewards and allowed resurrection claims",
  "12 stage newly commanded spatial attack entities for activation next tick",
  "13 evaluate wave clear",
  "14 emit tick-stamped presentation events, census and guarded state hash",
];

// WHERE THE AURA PASS GOES, and this is D26's LAW rather than a preference:
// **the aura damage pass runs BEFORE the ordnance-vs-player pass on the same
// tick.** A child spawned inside a burning comet then dies the tick after it
// spawns instead of landing, and the whole splitting family resolves without a
// branch anywhere in the sim. Both passes live inside phase 9/10, so the phase
// numbers alone cannot express it — hence this declaration. It is the same
// discipline P1 demands of `ordnance-step` ("the ordering matters, because
// px -> x is the swept hit segment"), stated once for the other pass.
// THE PASS ITSELF IS PORT-S'S: production has nothing for an aura to kill.
const AURA_PASS_SLOT = "phase 9/10, BEFORE the ordnance-vs-player pass (D26's law)";

// Today's PRODUCTION order, mapped. `step()` in js/game.js calls the encounter's
// `encStep()` partway through, so the two files interleave.
const PHASE_MAP_PRODUCTION = [
  ["js/game.js energyStep", "~2"],
  ["js/game.js per-seat integrate, ascending seat", "7"],
  ["js/game.js autofire / fire()", "12 — but it SPAWNS immediately; nothing is staged"],
  ["js/game.js stepImpacts, stepShipFx", "14"],
  ["js/game.js bullet integrate, expire, splice", "1 and 8 fused — removal and motion in one pass"],
  ["js/encounter.js state promote, clear elevator", "13 — RUNS FIRST HERE; the spec puts it 13th"],
  ["js/encounter.js waveTick, fast-clear slide, schedule hold", "3"],
  ["js/encounter.js group warn and spawn loop", "3 into 1 — spawns land inside the director phase"],
  ["js/encounter.js stepMissiles", "8 — before enemies, deliberately"],
  ["js/encounter.js stepEnemy loop", "4+5+6+7 FUSED in one function"],
  ["js/encounter.js resolveContacts", "9 and 10"],
  ["js/encounter.js resolvePvpRams", "9 and 10"],
  ["js/encounter.js applyRebateHits", "10"],
  ["js/encounter.js resolveBulletHits", "9 and 10"],
  ["js/encounter.js resolveWallBlasts", "10"],
  ["js/encounter.js reapDead", "11 — splits push into the list being walked"],
  ["js/encounter.js stepOrbs", "8 and 11"],
  ["js/encounter.js seat invuln and flash tick", "2"],
  ["js/encounter.js wipe sample, respawn loop", "11"],
  ["js/encounter.js recordPoseRow", "14"],
  ["js/game.js flushWallFx", "14"],
];

// Today's KERNEL order, mapped. Nine calls, and collision resolution is INSIDE
// phase 7's analogue rather than a phase of its own.
const PHASE_MAP_KERNEL = [
  ["updateDirector", "3 — wave clock, queueGroup, the gate census, advanceWave"],
  ["updateEntries", "3 into 1 — age, then spawnEnemy, then splice"],
  ["updatePlayer", "4 (nearestTarget) + 7 + 12 (firePlayer spawns immediately) + 11 (respawn)"],
  ["updateEnemies", "5+6+7 fused per body, then contact damage (9 and 10), then ONE compaction filter (1)"],
  ["updateBullets", "8, then resolveBulletHits (9 and 10), then ONE compaction filter (1)"],
  ["updateOrbs", "8 and 11"],
  ["updateEffects", "14"],
];

// THE DIVERGENCES, named as PORT-S debt rather than left for a reader to spot:
//   * phase 13 runs FIRST in production, not last.
//   * phases 4-7 are FUSED inside stepEnemy (production) and inside the
//     updateEnemies dispatch (kernel).
//   * phase 1 is SPLIT across four sites in production, each inside its own
//     motion pass, rather than at a tick-opening sweep.
//   * phase 12 has NO analogue on either side. Every spawn is immediate.
//   * COLLISION IS NOT A PHASE OF ITS OWN in the kernel — a 14-phase reference
//     that separates movement from collision will not map one-to-one here.
const PHASE_DIVERGENCES = [
  "production runs phase 13 first, not last",
  "phases 4-7 are fused inside one per-body function on both surfaces",
  "phase 1 is split across four motion passes in production",
  "phase 12 has no analogue on either surface — every spawn is immediate",
  "kernel collision resolution lives inside phase 7's analogue",
];

const Engine = {
  CLASS,
  applyEffect,
  mayHit,
  // The registry, published on the MATRIX's footing: a declaration plane is only
  // a plane if something can read it. The completeness leg walks it, commit F's
  // cross-check reads its `hp` column, and R7 compiles its codec from `wire`.
  KINDS,
  OBLIGATIONS,
  OWNER_DEATH,
  // The cap-rejection contract and its vocabulary. `capAdmit` is the ONE
  // authority: commit F's kernel calls it, the leg calls it, and neither can
  // reach a collection through it — which is how "never evicts" is enforced by
  // the shape of the API rather than by everyone remembering.
  CAP,
  capAdmit,
  // The substream mixer. Published whole — the seed derivation beside the
  // generator — because the golden vector pins BOTH, and a vector that could
  // only see the output could not tell a changed key from a changed generator.
  PURPOSE,
  mulberry32,
  substream,
  substreamSeed,
  // The reference ordering and the two mappings, published for the same reason.
  PHASE_ORDER,
  PHASE_MAP_PRODUCTION,
  PHASE_MAP_KERNEL,
  PHASE_DIVERGENCES,
  AURA_PASS_SLOT,
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
