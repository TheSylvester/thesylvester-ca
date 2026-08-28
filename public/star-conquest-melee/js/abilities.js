// ---- the ABILITY catalog, and the per-seat SLOT record --------------------
// A classic script, loaded FIRST — before js/game.js — on both surfaces: the
// page (index.html) and the server vm (server/sim-host.mjs's SIM_FILES). It
// declares no DOM reference at module level, because the vm boots it against
// the throwing DOM stub; a bare `document` here breaks the SERVER, not a test.
//
// WHY IT LOADS FIRST, and not appended after js/audio.js. js/game.js builds
// `players` AT LOAD TIME (`const players = [makePlayer(0)]`), and makePlayer
// now allocates each seat's slot record from this file. A catalog that loaded
// after game.js would be undefined at that call. Nothing here reads game.js or
// encounter.js at load, so first is the only order with no cycle. deploy.sh
// derives what it ships from the same one-line declaration by sed, and order
// is nothing to it.
//
// WHAT LIVES HERE. Two things, and the reason they share a file is that the
// second is indexed by the first:
//   1. the ability IDS and their records — the bench. The input masks index
//      THIS table and nothing else.
//   2. the per-seat SLOT record (plan §2.3, primitive P5) — six fields per
//      ability id, all zero at rest, hashed behind a guarded zero-default fold.
//
// WHAT DOES NOT LIVE HERE. A slot INDEX. The simulation never learns what a
// loadout position is: the masks index abilities, the cooldowns are keyed by
// ability id, and ownership is judged against the rank vector the sim already
// holds. Key binding, drag-and-drop rebinding and swapping on 1/2/3 are pure
// client UI, forever, at zero sim cost and zero wire cost. Do not put a slot
// index on the wire.

// ---- the ids ---------------------------------------------------------------
// Fire is 0 and comet is 1 because they are the two abilities that already
// shipped, not because they are special: both ride the same two masks as
// everything after them (plan §2.5.8 — they are bench records).
// APPEND ONLY. An id is a BIT POSITION in a mask and an INDEX into the slot
// record, so inserting one renumbers every ability above it and re-keys every
// committed trace — tests/fixtures/README.md's "APPEND is free, INSERT is not"
// applies here exactly as it applies to a shop row.
const ABILITY = {
  FIRE: 0,     // the basic round — permanent for the milestone
  COMET: 1,    // the ram/burn mode; a HOLD, and now also an explicit press edge
  RAILSHOT: 2, // one round at 4x speed on a short fuse — a rifle
};
const ABILITY_COUNT = 3; // slot-record width, and the count the arm rule validates

// The mask LID. Both masks are clamped to this at every boundary that admits a
// frame; it is a transport bound, never hashed, so widening it later is free
// and re-keys nothing. 16 bits today against 3 abilities, so the catalog may
// quadruple before this number is the thing that has to move.
const ABILITY_BITS = 16;
const ABILITY_MASK_MAX = (1 << ABILITY_BITS) - 1; // 65535
// ...and the CATALOG mask: the bits that actually name an ability today. The two
// are different jobs and the difference is load-bearing — see Abilities.mask.
const ABILITY_CATALOG_MASK = (1 << ABILITY_COUNT) - 1; // 0b111 at R1

// ---- the bench records -----------------------------------------------------
// Standing rule 3: the numbers live in the RECORD that invokes the behavior,
// never in a new global. Nothing below is a tunable, nothing below is bound to
// a slider, and section M of tests/golden-traces.js (the live-tunable pin)
// therefore does not move.
//
// `cd` is in TICKS and is the ability's own cooldown, keyed by ABILITY ID —
// which is what closes the loadout-swap dodge: moving an ability to another
// button cannot hand it a fresh cooldown, because the cooldown was never
// stored against the button.
//
// FIRE and COMET carry `cd: 0` and a null spawn deliberately. Their state
// predates this record and is already hashed and already on the wire under its
// own keys — fire's cooldown is `P.cool` (folded by hashShip, sent as `cool`,
// rebased by the predictor) and comet's is the energy pool. Re-encoding either
// into the slot record would move 25 committed traces to change no behavior at
// all, so they keep their scalars and their rows here are declarations, not
// storage. Every ability from RAILSHOT upward is stored here and nowhere else.
const ABILITY_DEFS = [
  { id: 0, key: "fire", name: "FIRE", cd: 0, tags: ["projectile", "single"], spawn: null },
  { id: 1, key: "comet", name: "COMET", cd: 0, tags: ["self", "sustained"], spawn: null },
  {
    id: 2, key: "railshot", name: "RAILSHOT", cd: 45, en: 18,
    tags: ["projectile", "single"],
    // IT COSTS SOMETHING, and the plan (§2.5.8) is why: "the cost model becomes
    // per-ability declared — energy, cooldown, or both. The pool is ALREADY
    // general." An ability with no price is a strict upgrade every player takes
    // for free, which is not a build choice. `en` spends from the SAME per-seat
    // pool the comet burns, so the two compete: a pilot who empties the pool on
    // rifle shots has no ram and no damage negation left. `cd` is the other half
    // — 45 ticks against the basic gun's 8 since D50 / OPEN 2 (PORT-F), and
    // against its 24 before that — so the rifle is burst and reach bought with
    // rate and fuel, not free damage on top. The RATE half of that trade got
    // 3x harder in one commit: the basic gun now fires 7.5 times a second and
    // the rifle still fires 1.33. Named, not re-priced; the row is R8a's.
    // the spawn pattern, and every number the behavior needs. One round, four
    // times the standing muzzle speed, six ticks of life: it crosses about the
    // same distance as an ordinary round and gets there in a sixth of the time.
    // ttl 6 is deliberately above the wire's floor — a round is swept for `ttl`
    // segments and appears in `ttl - 1` snapshots, so a shorter fuse would deal
    // damage nobody could see.
    // ...and the two RENDER-ONLY fields beside them. `ink` and `streak` are
    // stamped onto the round and read by js/game.js's bullet draw; NEITHER is
    // in BULLET_HASH, which is a declared allow-list, and neither is on the
    // wire — the same footing as ox/oy, and for the same reason. They live in
    // the RECORD rather than in a new global because the record is what
    // invokes the behaviour: a second ability with its own look states it
    // here and the draw needs no new branch.
    //   The look matters as much as the numbers do. A rifle drawn in the basic
    // gun's ink at the basic gun's radius is a shot the player cannot tell
    // they took — which is exactly what happened. CLAY against the standard
    // round's white is the palette's own attack channel, and the streak says
    // the thing the radius cannot: this round is four times as fast.
    // `streak` is a MAXIMUM in px; the draw clamps it to the distance actually
    // flown, so a round never wears ink behind its own muzzle.
    // `cue` is the third: the ability's OWN sound. Sharing the standard gun's
    // `fire` event made the rifle acoustically identical to the basic round,
    // and a cue the ear cannot separate teaches nothing. A record with no
    // `cue` sounds as `fire`, so the two shipped rows are unchanged.
    cue: "rail",
    // `dmg` is the fourth: 5.0 was FIVE TIMES the basic LMB round at BDMG 1 and
    // is TWO AND A HALF times it since D50 / OPEN 2 (PORT-F) took BDMG to 2 —
    // owner ruling 2026-08-22, "the railgun should just kill anything. Almost
    // anything." The 2.5 it replaces read as a merely-better bullet.
    // ---- RESCALED AT THE FIX ROUND (S3BR-04) --------------------------
    // `r` and `streak` are ARENA-PX and stayed at 40 % scale through commit C:
    // the ordinary production round moved 2.2 -> 5.5, and the rail's velocity
    // already scaled itself through `BSPEED * spd` (37.5 x 4 then; 650/60 x
    // 13.846153846153845 = the same 150 px/tick now), so only its
    // COLLISION RADIUS and its render streak were left behind. A graze between
    // 2.2 and 5.5 px of the rail's swept centre missed, although the pre-flip
    // rail used the ordinary round's own radius.
    //   THE OTHER FOUR ARE CORRECTLY EXEMPT and it is worth saying which:
    // `spd` is a MULTIPLIER on an already-scaled speed, `ttl` is TICKS, `dmg`
    // is damage and `spread` is an angle. None has a length in it.
    //   AND `spd` IS RE-DERIVED AT D50 / OPEN 2 (PORT-F). It is a multiplier on
    // BSPEED, and BSPEED fell 37.5 -> 650/60. At `spd: 4` the rail would fly at
    // 43.33 px/tick — 2600 px/s with a 260 px reach, SHORTER than the basic gun
    // it is meant to out-reach, and the row's own "burst and reach" text would
    // go false. The ruling keeps the rail's ABSOLUTE speed: 150 / (650/60) =
    // 13.846153846153845, and `(650/60) * that === 150` exactly, so the rail
    // still flies 150 px/tick = 9000 px/s with a 6 x 150 = 900 px reach.
    spawn: { n: 1, spd: 150 / (650 / 60), ttl: 6, r: 5.5, dmg: 5.0, spread: 0,
             ink: "#d97757", streak: 27.5 }, // ...the two render-only ones sit in
                          // the SPAWN block beside `r`, because they describe
                          // the ROUND; `cue` above is the ABILITY's and stays
                          // one level up, where the arm can read it with no
                          // spawn to look inside.

  },
];

// ---- the SLOT record (P5) --------------------------------------------------
// One per ability id per seat. The six fields are the whole primitive:
//   cd    ticks until this ability may arm again — counted down once per tick
//   t     ticks spent in the current stage; a telegraph or fuse clock
//   stage 0 idle, 1 telegraph, 2 active — the enemy lance's proven shape
//   mode  a small integer the ability's own record gives meaning to
//   want  the seat's HELD level for this ability, off the `ah` mask
//   press the seat's PRESS edge, off the `ap` mask, spent at the fire site
//
// FOUR of the six are HASHED — cd, t, stage, mode — because those four decide
// what the simulation does next. want and press are NOT, and that is the
// shipped split restated rather than a new rule: their exact analogues
// (cometWant/fireHeld and cometPress/claimPress) sit in makePlayer's `input`
// block, which says in as many words "the seat's whole input transport — never
// hashed (input state, not simulation state)". A button is an ask; what the sim
// DID about the ask is the state. The derived comet flag is hashed; the want
// behind it is not, and an ability's want is the same kind of thing.
//
// All four hashed fields are zero at rest, which is what makes the fold cost
// nothing. `t`, `stage` and `mode` have NO WRITER yet — they are the declared
// contract the first telegraphed or staged ability will use, built now because
// building half the record now and half later is the waste the P5 ruling exists
// to prevent. They are hashed from the start so that ability adds a behavior
// and not an oracle change.
//
// want/press for abilities 0 and 1 are NOT used: fire's are `claimPress` /
// `fireHeld` and comet's are `cometPress` / `cometWant`, all four unhashed
// input transport read at some twenty sites across three files. Renaming them
// into this record changes no behavior and no byte; it is a follow-up, not this
// round's business. The drain writes THIS record for every id from 2 upward.
function makeAbilitySlots() {
  const out = [];
  for (let i = 0; i < ABILITY_COUNT; i++) out.push({ cd: 0, t: 0, stage: 0, mode: 0, want: 0, press: 0 });
  return out;
}
// the guard's own test, and it reads the HASHED four only. want and press are
// input transport (see the record's note above), so a held button must not be
// what drags the whole room's slot record into the fold.
const slotIsHashedDefault = (s) => !s.cd && !s.t && !s.stage && !s.mode;

const Abilities = {
  ABILITY,
  COUNT: ABILITY_COUNT,
  BITS: ABILITY_BITS,
  MASK_MAX: ABILITY_MASK_MAX,
  CATALOG_MASK: ABILITY_CATALOG_MASK,
  DEFS: ABILITY_DEFS,
  makeSlots: makeAbilitySlots,

  // id -> bit. Out-of-range ids answer 0, so a mask can never carry a bit the
  // catalog cannot name.
  // Integer-hardened, though no caller can currently reach it with anything
  // else: this is the catalog's public API and a caller it does not have yet is
  // exactly the one that would pass 2.9 or null. bit(2.9) must not answer 4.
  bit(id) { return Number.isInteger(id) && id >= 0 && id < ABILITY_COUNT ? (1 << id) : 0; },
  has(mask, id) { return ((mask | 0) & Abilities.bit(id)) !== 0; },
  def(id) { return ABILITY_DEFS[id] || null; },
  // the ability's CUE NAME — the js/audio.js recipe its shot sounds. One
  // derivation for three callers: the sim's own emit, the predictor's
  // speculative sink in js/net.js, and the own-echo test that stops the wire's
  // copy of an already-sounded shot from doubling it. A record with no `cue`
  // answers "fire", so nothing that shipped changes.
  cueFor(id) { const d = ABILITY_DEFS[id]; return (d && d.cue) || "fire"; },
  // ...and the set of them, for that echo test — DERIVED from the catalog so
  // a new ability's cue is covered the day it is declared, rather than the day
  // somebody remembers to widen a literal list in js/net.js.
  CUE_KINDS: ABILITY_DEFS.map((d) => d.cue).filter(Boolean),
  exists(id) { return Number.isInteger(id) && id >= 0 && id < ABILITY_COUNT; },

  // THE ONE NORMALIZER for a mask arriving from anywhere — the DOM producer, a
  // fixture, a socket. Never the `+f.ap || 0` idiom, which admits Infinity (the
  // defect bf2c961 fixed). A frame carrying no mask at all normalizes to 0 — no
  // ability pressed, no ability held — and never to undefined.
  //
  // THREE guards, and the middle one is a REFUSAL rather than a clamp. That is
  // the correction a review caught, and the reason is that a bitfield is not a
  // magnitude: clamping 100000 to the lid used to hand the sim 65535, which is
  // EVERY BIT SET — one nonsense scalar pressed fire, armed the comet and armed
  // every ability at once. A coordinate clamps because a too-large coordinate
  // still means "far right"; a too-large mask means nothing at all, so the
  // honest answer is silence.
  //   The third guard is the CATALOG mask, and it is what makes
  // sim-host's "a bit the catalog cannot name is not a value the sim should ever
  // see" true at the boundary rather than merely true by luck downstream. It
  // widens for free the day the catalog does, because it is derived from it.
  mask(v) {
    if (!Number.isFinite(v)) return 0;         // Infinity, NaN, a string, null
    const n = Math.trunc(v);                   // a fraction is not a bitfield
    if (n < 0 || n > ABILITY_MASK_MAX) return 0; // out of the transport range: REFUSED
    return n & ABILITY_CATALOG_MASK;           // ...and only the bits we can name
  },

  // the seat's slot for an id, allocating nothing — an unknown id answers null
  // rather than growing the record, so a mask bit the catalog does not name can
  // never become state.
  slot(K, id) {
    const s = K && K.slots;
    return s && id >= 0 && id < s.length ? s[id] : null;
  },

  // one tick of every slot's clocks, called from the integrate slice beside
  // `if (K.cool > 0) K.cool--` — the shipped cooldown's own decrement, and the
  // reason a corpse's cooldown still runs down applies here unchanged.
  tick(K) {
    const s = K && K.slots;
    if (!s) return;
    for (let i = 0; i < s.length; i++) {
      if (s[i].cd > 0) s[i].cd--;
      if (s[i].stage > 0) s[i].t++;
    }
  },

  // every slot back to rest — a restart, a respawn, or a frozen overlay's
  // discard. Presses die with it: a press made under the shop is not a request
  // to shoot on continue.
  reset(K) {
    const s = K && K.slots;
    if (!s) return;
    for (let i = 0; i < s.length; i++) {
      s[i].cd = s[i].t = s[i].stage = s[i].mode = s[i].want = s[i].press = 0;
    }
  },
  clearPresses(K) {
    const s = K && K.slots;
    if (!s) return;
    for (let i = 0; i < s.length; i++) s[i].press = 0;
  },

  // ---- the guarded zero-default fold ---------------------------------------
  // Standing rule 1, and tests/fixtures/README.md's idiom. While every seat's
  // every slot is at rest this folds ZERO BYTES, so adding an ability nobody
  // arms costs no trace. Once ANY seat has moved ANY slot the block is entered
  // ONCE FOR THE WHOLE ROOM and EVERY seat folds — the README's collision trap:
  // a per-seat guard with no room-wide entry lets "seat 1 armed" and "seat 0
  // armed" hash alike. The width `n` is folded first and then used for every
  // seat, so the per-seat part is fixed-width and needs no second prefix;
  // players.length is already folded by hashShip above this call.
  hashInto(h, roster) {
    // Math.max, and it is load-bearing. A plain `n = i + 1` reads correctly for
    // ONE seat (the walk is ascending, so the last non-default index wins) and
    // is wrong the moment there are two: a later seat whose highest moved slot
    // is LOWER would narrow the room's width and cut an earlier seat's slot out
    // of the fold entirely. Two states would then hash alike — the same class of
    // silent collision the room-wide entry below closes, reopened one axis over,
    // and invisible to every instrument this repo has because hashState() would
    // simply agree. Latent while the catalog holds one bench ability; live the
    // day a second one lands.
    let n = 0;
    for (const P of roster) {
      const s = P.slots;
      if (!s) continue;
      for (let i = 0; i < s.length; i++) if (!slotIsHashedDefault(s[i])) n = Math.max(n, i + 1);
    }
    if (n === 0) return;
    h.u32(n);
    for (const P of roster) {
      const s = P.slots || [];
      for (let i = 0; i < n; i++) {
        const k = s[i] || { cd: 0, t: 0, stage: 0, mode: 0 };
        h.num(k.cd); h.num(k.t); h.num(k.stage); h.num(k.mode);
      }
    }
  },

  // NOTE: the wire's cooldown trim is NOT here. server/snapshot.mjs owns it, as
  // trimCd beside trimRanks, because that is where the encoding rule it obeys
  // ("only a suffix may go") already lives and is already argued. A copy in this
  // file would be a second authority on one rule, which is the thing this round
  // spent itself removing from the input plane.
};

window.Abilities = Abilities; // the vm sandbox and the page both reach it here;
                              // a classic script's top-level const is not a
                              // window property (the window.Flight precedent)
