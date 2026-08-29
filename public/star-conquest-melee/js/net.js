"use strict";

// Net mode — the client half of the wire. Enabled by a URL parameter in one
// of TWO spellings, and inert without either: window.Net then answers active()
// false and every hook falls through to the local path, so local single-player
// is byte-identical with this file loaded. That last property is load-bearing
// rather than merely tidy — every browser suite navigates to a bare index.html
// and must keep stepping its own sim, so "no parameter" can never come to mean
// anything but local.
//
//   ?server=ws://…  names the endpoint outright. It keeps its exact meaning
//                   and WINS whenever both spellings appear, because the
//                   latency rig encodes its impairment profile in that URL's
//                   own path (ws://127.0.0.1:9100/d250j20) — a spelling that
//                   carries data cannot be replaced by one that does not.
//                   Present but VALUELESS still means local, as it always has.
//   ?mp             the short link a human can type or share. It expands to a
//                   default DERIVED from the page's own host (see mpDefault):
//                   a loopback or file:// page gets the server's own
//                   ws://127.0.0.1:8080 default, any other page gets
//                   wss://game.<page host>. Derivation, not a constant, is the
//                   point: no tracked client file names a production host, and
//                   the published mirror keeps that property.
//
// In net mode the client simulates NOTHING. Each frame-loop tick it banks
// the same input accumulator local play banks (bankTickInput — the identical
// ten-field record, the two ABILITY MASKS included: the banked
// frame goes upstream whole, so the server's sim learns comet mode
// through the same ring fields local play drains — bit 1 of `ap` for
// the press, bit 1 of `ah` for the hold — and the sim's per-seat comet flag
// rides every snapshot back DOWN as `comet`, with the seat's ENERGY pool and
// its live cap beside it, so a remote seat's glow renders from server truth,
// never from local guesswork: the client never runs the pool's gate and never
// derives its cap, it only presents what the sim decided), coalesces a slow
// animation frame's catch-up ticks into at most two records, flushes once per
// animation frame, and writes an interpolated snapshot INTO the very objects
// the draw pass already reads (every players[] seat,
// G.bullets, the encounter's E). The draw code never forks: local sim and
// net buffer fill the same presented state. The dev lag slider's rehearsal
// is over here — the real network is the delay now.
//
// The aim marker stays LOCAL: markerDir()/drawAim never read anything this
// file writes, so net latency can never drag the marker (commit a4f9077's
// principle, kept). The camera derives from the presented own-ship — it was
// never on the wire.
//
// Identity (phase 09): the server grants this client a seat and says so in a
// `you` message. Net.seat() answers with it, game.js's localSeat() reads that,
// and every LOCAL-view read in the page — camera, marker, flame, minimap, HUD
// column, shop panel, death card — follows. Two browsers on one loopback
// server therefore watch two different ships. A client with no seat spectates:
// it presents everything and sends nothing. `you` also carries the match and
// seat epochs; a snapshot from another match epoch is discarded, and the input
// sequence numbers are namespaced by (seat, seatEpoch) so a restart's ring can
// never mix two generations of frames. `you` also carries the ROSTER — how
// many seats are HELD, out of how many this room can seat, and whether the
// match has started — so the corner banner can answer the one question two
// people in two browsers actually have: has my friend arrived, and is the door
// still open? Those fields are ADDITIVE; see onYou for what each one counts.
//
// Wire knowledge: this file's decode/apply is the client end of the names
// server/snapshot.mjs encodes. Nothing outside apply()/onSnapshot() spells a
// wire key, and nothing in game.js or encounter.js ever sees one.
//
// Classic script, like encounter.js: it reads game.js's top-level bindings
// (players — seat 0's input bank included, in0, bankTickInput,
// refreshPointerWorld, INPUTMODE, setInputMode, thrustFrame, stepImpacts,
// spawnImpactFx, stepShipFx, spawnShipBlast, BLASTR, BLASTGAIN) through the shared global
// lexical scope, and the
// encounter's internals through the __test.enc surface exactly as
// server/sim-host.mjs does.
(() => {
  // the two shipped abilities' mask bits, resolved from the catalog rather than
  // written as 1 and 2 here — js/abilities.js owns the id table, and this file
  // reaches it through window like it reaches Flight
  const AB_FIRE = Abilities.bit(Abilities.ABILITY.FIRE);
  const AB_COMET = Abilities.bit(Abilities.ABILITY.COMET);
  // THE WIRE VERSION, READ AND NEVER MIRRORED (R0.3). js/wire.js is the one
  // source and index.html loads it above this file. What used to sit here was a
  // hand-written declaration of the number, carrying a comment that said it
  // MUST equal server/snapshot.mjs's, with nothing enforcing the MUST.
  const NET_V = Wire.VERSION;
  // THE parked-seat predicate — the wire contract in one place. Since v8 a
  // seat with nobody behind it crosses as the FOUR-KEY record `{ seat, hull,
  // hm, cl: -1 }` and nothing else (server/snapshot.mjs encodes it, its
  // snapshot.test.mjs pins the key set): no pose, no velocity, no flame, no
  // pool, no wallet, no ranks. A `cl` of -1 is the sentinel the encoder puts
  // on exactly that record and on no other — a seat waiting for its click carries
  // a positive `cl`, a live seat omits the key — so every consumer that must
  // tell a parked record from a seated one asks this and never spells the
  // sentinel itself. One spelling means one place to change if the contract
  // ever moves.
  const isParked = (pr) => pr.cl === -1;
  // ---- the opt-in, and the ?mp expansion -----------------------------------
  // The default ?mp stands for is DERIVED from the page it is running on, not
  // written down. A hardcoded host would put a production name into a tracked
  // client file and therefore into the published mirror; today `git grep` finds
  // that name only in server/server.js, which the mirror excludes, and this
  // keeps it that way. The arithmetic is deliberately dull:
  //
  //   loopback or file://  → ws://127.0.0.1:8080, which is exactly
  //                          server/server.js's own default HOST and PORT, so a
  //                          dev who runs `node server/server.js` and opens the
  //                          page from the same machine needs no URL at all
  //   anything else        → "wss://game." + the page host, a leading "www."
  //                          stripped, because www.example.com and example.com
  //                          are one site and must resolve to one endpoint
  //
  // On the published apex that yields wss://game.<apex> — the same endpoint the
  // long ?server= link spells out by hand. Takes a location-shaped object so the
  // rule is drivable from a test on a page it could never actually be served
  // from; production passes the real `location`.
  const LOOPBACK_HOSTS = ["", "localhost", "127.0.0.1", "[::1]"];
  const mpDefault = (loc) => {
    const host = String((loc && loc.hostname) || "");
    if (LOOPBACK_HOSTS.indexOf(host) >= 0) return "ws://127.0.0.1:8080";
    return "wss://game." + host.replace(/^www\./, "");
  };

  // Resolution order, and why it is presence-first rather than value-first:
  // ?server= WINS whenever it appears, and an empty one keeps meaning local
  // exactly as it did before ?mp existed. So a URL that carries both is decided
  // entirely by ?server= — including the degenerate "?server=&mp", which stays
  // local. One spelling deciding on its own presence is the only version of
  // this rule that cannot surprise the rig, whose whole configuration lives in
  // that parameter's value.
  const params = new URLSearchParams(location.search);
  const url = params.has("server") ? params.get("server")
    : params.has("mp") ? mpDefault(location)
    : "";

  // ---- the lobby preferences -------------------------------------------------
  // This module keeps two lobby values across visits: `scmelee.name` and
  // `scmelee.skin`. The server sanitizes them, stores them per SOCKET and fans
  // them out on the `you` roster — neither enters the sim, the snapshot, or any
  // hash, so no trace and no golden fixture can move for them. game.js
  // separately owns `scmelee.sfxvol` and `scmelee.sfxmute` through storeAudio.
  //
  // The READ has to live HERE, ahead of connect(): the hello fires from the
  // socket's own open handler moments after this module loads, long before any
  // DOM input exists, so a name typed on a previous visit can only reach that
  // hello from storage. A first-ever visitor has nothing stored and its hello
  // carries no name at all — the `ui: name` route is the only path on visit 1,
  // which is exactly what the field below sends.
  //
  // The client's copy is never authoritative. This sanitize mirrors the
  // server's so the field shows what the server will accept, but every name
  // that reaches a screen came back down off the wire.
  const NAME_MAX = 12; // mirrored by hand from server/server.js, like NET_V
  const NAME_KEY = "scmelee.name";
  // ...and so is the strip. Cc, Cf, Zl and Zp by category — Cf is the class
  // that carries the soft hyphen, the zero-width family, the invisible
  // operators and the bidi overrides — plus the invisibles no category catches,
  // because the Hangul and Khmer fillers are letters and the blank Braille
  // pattern is a symbol. server/server.js carries the same expression and the
  // long form of this reasoning; the two must move together, and the SERVER's
  // answer is the only one that reaches a screen.
  const NAME_STRIP = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u115F\u1160\u17B4\u17B5\u2800\u3164\uFFA0]/gu;
  function cleanName(v) {
    if (typeof v !== "string") return null; // type gate first — a non-string is ABSENT
    // strip, then trim, then cap: a name of STRIPPED characters has to come out
    // EMPTY here, or the box shows a blank it will not be able to explain and
    // the board draws a nameless row instead of falling back to Player-N. Only
    // of stripped ones — an invisible code point outside NAME_STRIP survives
    // this call as it survives the server's, and server/server.js records why
    // that residue is accepted.
    const trimmed = v.replace(NAME_STRIP, "").trim();
    if (!trimmed) return null;
    return Array.from(trimmed).slice(0, NAME_MAX).join("").trim() || null;
  }
  // Storage can throw outright — Safari's private mode, a file:// page, a
  // profile with site data blocked — and a name is the least important thing on
  // the screen. Both halves swallow, and the game runs on nameless.
  function storedName() {
    try { return cleanName(window.localStorage.getItem(NAME_KEY)); } catch { return null; }
  }
  function storeName(name) {
    try {
      if (name) window.localStorage.setItem(NAME_KEY, name);
      else window.localStorage.removeItem(NAME_KEY);
    } catch { /* a name that cannot be remembered is still a name this session */ }
  }

  // ---- the SHIP, the identity plane's second half ---------------------------
  // Mirrored BY HAND from server/server.js, like NAME_MAX and NET_V, and pinned
  // byte-equal by server/names.test.mjs. The server's answer is still the only
  // one that reaches a screen; this copy exists so the strip shows what the
  // server will accept instead of a pick it is about to refuse.
  const SKIN_COUNT = 4;
  const SKIN_KEY = "scmelee.skin";
  // No null here, unlike cleanName: every pilot flies something, and junk folds
  // to hull 0 — the default every existing pixel baseline was captured against.
  function cleanSkin(v) {
    if (!Number.isInteger(v) || v < 0 || v >= SKIN_COUNT) return 0;
    return v;
  }
  // Storage answers strings, so the parse is here rather than in cleanSkin:
  // cleanSkin is the WIRE gate and a wire skin is a number. Both halves swallow,
  // for the same reason the name's do.
  function storedSkin() {
    try { return cleanSkin(Number.parseInt(window.localStorage.getItem(SKIN_KEY), 10)); }
    catch { return 0; }
  }
  function storeSkin(id) {
    try { window.localStorage.setItem(SKIN_KEY, String(id)); }
    catch { /* a hull that cannot be remembered is still this session's hull */ }
  }

  // ---- the name editor (CANVAS-side, and deliberately not a DOM input) ------
  // What this replaces was a real <input> over the canvas, and it could not be
  // clicked in the DEFAULT aim mode at all. AIMMODE starts "locked", resume()
  // takes the session's ONE pointer lock and holds it until pause(), and under
  // a held lock the browser routes every mouse event to the locked element — so
  // no DOM node is hit-testable. The press was not merely lost either: it fell
  // through to the canvas handler, became inputFire(), and CLAIMED THE SEAT,
  // taking away the very card the box rode on. Escape freed the pointer and
  // landed in pause(), which hid the box. No steady state had that field both
  // visible and clickable.
  //
  // So the editor is canvas state now: a buffer, a flag, and one keydown
  // listener. js/encounter.js DRAWS it — on the claim card, and on the
  // scoreboard row this client owns — and js/game.js routes the press through
  // the drawn cursor, which reaches a gutter panel UNDER a held lock exactly as
  // the shop's click already does. Nothing here is DOM, so nothing here fights
  // the lock.
  //
  // Two hazards die with the old field. It committed on BLUR, and the blur came
  // off the per-frame visibility flag — so a wave clear, a granted seat or a
  // match epoch could commit a half-typed name. And Tab could focus it
  // invisibly, after which it swallowed the whole keyboard with no cue on
  // screen. This editor opens and closes on the player's own action (a click on
  // an affordance, Enter, Escape, a press anywhere else) or on pause(), and
  // there is nothing here for Tab to land on.
  //
  // It lives ABOVE the local/net split because local play has a name too — the
  // stored one, for seat 0 — and one editor with one commit path is the only
  // version of this that cannot disagree with itself.
  let ownName = storedName();
  let ownSkin = storedSkin();
  let editing = false;
  let editBuf = "";
  // set by the net branch below. Null in local play, where a name is stored and
  // drawn and never sent anywhere.
  let sendName = null;
  // ...and its twin for the hull. The two are separate hooks and ONE message:
  // see pushIdentity, which is the reason a ship pick and a name commit that
  // land inside one rate window leave together instead of racing.
  let sendSkin = null;
  // CODE POINTS, not UTF-16 units. The cap is the server's cap and the server
  // counts code points — see cleanName's own slice, and the maxLength note the
  // deleted input carried, which was wrong for exactly this reason.
  const cps = (v) => Array.from(v);

  function openNameEdit() {
    if (editing) return false; // idempotent: a second click on the same row is
                               // not a reason to throw away what was typed
    editing = true;
    editBuf = ownName || ""; // the ACCEPTED name, not the last raw typing — the
                             // box opens on what the server agreed to
    return true;
  }
  // commit === false is CANCEL: the buffer is dropped and nothing is sent.
  // Answers whether an edit was actually open, so a caller can tell a close
  // from a no-op.
  function closeNameEdit(commit) {
    if (!editing) return false;
    editing = false;
    const next = cleanName(editBuf);
    editBuf = "";
    if (!commit || next === ownName) return true;
    ownName = next;
    storeName(next); // remembered for the NEXT visit; this visit's copy is the
                     // one the server sanitizes and fans back out
    if (sendName) sendName(next);
    return true;
  }

  // The ship pick — the identity affordance's other control, and deliberately
  // NOT gated on the editor being open. A player picking a hull while typing a
  // name keeps what they typed: js/encounter.js reports the press HANDLED, so
  // js/game.js never reaches the commit-and-close a press anywhere else earns.
  // Answers whether the choice actually moved, so a caller can tell a pick from
  // a re-press of the hull already flying.
  function pickSkin(id) {
    const next = cleanSkin(id);
    if (next === ownSkin) return false;
    ownSkin = next;
    storeSkin(next); // remembered for the NEXT visit, exactly as the name is
    if (sendSkin) sendSkin(next);
    return true;
  }

  // CAPTURE phase on document, and it stops the bubble on every key it takes.
  // js/game.js and js/encounter.js both hang their keydown handlers on
  // `document` in the BUBBLE phase, so stopping here is what keeps W from
  // thrusting and R from restarting the match while somebody types "Warder".
  // Their own Net.typing() guards stay: the two are redundant on purpose, and
  // the old field's leak leg proved redundancy is what survives a refactor.
  //   Escape is why the stop is not optional. Without it the cancel would run
  // here and js/game.js's Escape branch would then read typing() as already
  // false and pause the game off the same keystroke.
  //   That stop bounds the PAGE's handlers and nothing above them, and the
  // distinction is worth writing down because it is easy to over-claim. In the
  // default aim mode the game holds a pointer lock, and a user agent drops that
  // lock on Escape at its own level: preventDefault cannot refuse it, and
  // js/game.js's pointerlockchange route pauses on the loss. So under a real
  // lock Escape DOES cancel the edit and pause, and the pause is harmless —
  // pause()'s own closeNameEdit finds nothing open, and resume is one click.
  // The suites cannot observe any of this: a headless page is granted no lock,
  // so their Escape legs only ever exercise the handler half.
  //   One listener per page, enforced rather than assumed — the same rule the
  // deleted input's one-id guard carried, and for the same reason: a page
  // normally evaluates this file once, but the browser suites re-evaluate it
  // under one URL after another to pin the ?server= / ?mp opt-in, and every
  // load that added a second listener would leave one behind for every later
  // load and every later suite.
  const onNameKey = (e) => {
    if (!editing) return;
    // the pause menu and the dev panel hold real controls, and either a player
    // or a suite may have one focused — a key aimed at a slider is not a letter
    // of anybody's name
    const tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") return;
    if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); closeNameEdit(true); return; }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeNameEdit(false); return; }
    if (e.key === "Backspace") {
      e.preventDefault(); // a Backspace that reaches the page navigates it
      e.stopPropagation();
      editBuf = cps(editBuf).slice(0, -1).join("");
      return;
    }
    // a shortcut is not a letter — and this guard is where the canvas editor is
    // POORER than the <input> it replaced, stated here rather than discovered.
    // Windows reports AltGr as ctrlKey && altKey, so every AltGr character is
    // untypable: the accented and Central European sets, and `@` on several
    // layouts. There is no composition handling either, so an IME cannot enter
    // a CJK name, and Ctrl+V cannot paste one. cleanName and the server both
    // still ACCEPT those code points — a name that arrives off the wire draws
    // fine — so what was lost is the ENTRY path alone, and only on this client.
    // Fixing it means a hidden input or a composition surface, which is a
    // design change and not a patch to this line.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // ...and neither is "Tab", "F5" or "ArrowLeft": exactly one code point is
    // what a printable key reports, and an emoji reports one here too
    if (cps(e.key).length !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    // the cap stops the TYPING, not the commit. Truncating at commit instead
    // would read as a handful of dropped keystrokes with no explanation.
    if (cps(editBuf).length >= NAME_MAX) return;
    editBuf += e.key;
  };
  if (window.__nameEditKeys) document.removeEventListener("keydown", window.__nameEditKeys, true);
  window.__nameEditKeys = onNameKey;
  document.addEventListener("keydown", onNameKey, true);

  if (!url) {
    // local mode: every hook declines, every caller falls through
    window.Net = {
      active: () => false,
      wireVersion: () => NET_V, // the build's wire version — answered in local
                                // mode too, because a suite may read it before
                                // any socket exists
      seat: () => 0, // local play is always seat 0 — localSeat() reads this
      released: () => false, // ...and there is no server to take it away, so the
                             // release latch is dead here; the card's own gate
                             // falls back to the seat record — see releasedHere
      refused: () => false,  // ...nor anyone to refuse an ask: solo, the click
                             // reaches the sim's own claim window directly
      clientTick: () => {},
      flushInputs: () => {},
      buy: () => false,
      restart: () => false,
      stats: () => null,
      // ...and the display name, which local play DOES have: there is no wire
      // to fan one out, so the stored name answers for seat 0 — this player's
      // own seat, and the only one solo ever has. Every other seat is nameless
      // and the board draws its Player-N fallback, unchanged.
      seatName: (s) => (s === 0 ? ownName : null),
      // ...and the EDITOR, which local play does have: the board is drawn here
      // too, the row is clickable here too, and the name it commits is the one
      // stored for the next visit. sendName stays null, so the commit stops at
      // storage — there is no wire to tell.
      ownName: () => ownName,
      nameEdit: () => (editing ? editBuf : null),
      openNameEdit, closeNameEdit,
      // ...and the HULL, which local play has for the same reason it has a
      // name: the picker is drawn here too and the choice is remembered for the
      // next visit. sendSkin stays null, so the pick stops at storage. Every
      // other seat answers null — nobody is flying it, which is not the same
      // sentence as "hull 0".
      seatSkin: (s) => (s === 0 ? ownSkin : null),
      ownSkin: () => ownSkin,
      pickSkin,
      typing: () => editing,
    };
    return;
  }

  // ---- the v5 enum tables ---------------------------------------------------
  // Mirrored BY HAND from server/snapshot.mjs's ENEMY_TYPES / ENEMY_MODES, for
  // the same reason NET_V is mirrored: a classic script cannot import the
  // module. Order is the wire contract — these two literals and the server's
  // must stay identical, and server/snapshot.test.mjs reads THIS file's source
  // and pins this literal to ENEMY_TYPES by text. The decode
  // hands back the SAME STRINGS the wire used to carry, so nothing downstream
  // of apply() — render, the scorer's buckets, the rig's samples — moved.
  // THE BODY'S KIND AND STATE COME OFF THE WIRE (R7 / r7a commit 6, R1.4).
  // What stood here were TWO HAND MIRRORS of server/snapshot.mjs's tables —
  // WIRE_TYPES (production's retired 16-name roster) and WIRE_MODES — plus the
  // two lookups that answered `dart` and `seek` for an index neither knew.
  //
  // THE R7 BILL THAT PARAGRAPH RECORDED IS PAID. Every successor body arrived
  // as `ty: -1`, because the kernel's twenty-one type names overlap that roster
  // NOT ONCE, so `wireType` answered `dart` for all of them and the decoded
  // record carried hp 1 and NO state. That was harmless for the render and NOT
  // harmless for D39: the clear-role table is keyed on the KIND and the fly-by
  // exception is read off the STATE, so a decoding client could apply neither —
  // a real MINE and a spent WARDEN both BLOCKED and both counted as FOES.
  //   js/wire.js is the one authority now. `Wire.BODY_TYPES` is the kernel's own
  // STATS order, pinned to its source text; the STATE crosses as a string
  // (R1.4's measured branch — the kernel declares no per-type state list, so a
  // 1-byte enum has nothing to be an enum OF, and it is filed as R8a debt); and
  // `hp` crosses beside them. The readers that carried the same note —
  // js/encounter.js's `bodyBlocks` and `stallSignature` — can ask their real
  // questions from this commit.

  // ---- state ---------------------------------------------------------------
  // The presentation buffer is ADAPTIVE at phase 12: DELAY_TICKS was a fixed 3
  // (50 ms) whatever the wire did, which overpays on a clean link and underpays
  // on a rough one. The live target is derived from MEASURED arrival jitter and
  // slewed slowly — see delayTicks() for the whole rule.
  const DELAY_MIN = 1;     // one tick of bracket is the floor: below it there is
                           // no s1 to interpolate toward and every frame holds
  const DELAY_MAX = 6;     // 100 ms — past this the buffer costs more lag than
                           // the jitter it hides, and rows 5/6 pay for it
  const DELAY_START = 3;   // the v4 constant, and the value the target holds
                           // until enough arrivals exist to measure anything
  const DELAY_SLEW = 0.01; // ticks of target per PRESENTED tick — 0.6 ticks per
                           // second, so the full 1→6 walk takes ~8 s and the
                           // d250j20 jitter profile cannot make it oscillate
  const DELAY_MIN_SAMPLES = 30; // arrivals needed before jitter means anything;
                           // a resync empties the ring and the target HOLDS its
                           // current value while it refills rather than jumping
  const GAP_RECOMPUTE = 30; // accepted arrivals between p95 recomputes — gapP95
                           // sorts a 300-element copy, which must never run per
                           // presented tick
  let delayTarget = DELAY_START; // the live, fractional target depth
  let jitterEst = 0;       // the cached arrival-jitter p95, milliseconds
  let jitterValid = false; // false until the ring has held DELAY_MIN_SAMPLES
  let gapsSinceCalc = GAP_RECOMPUTE; // force a first compute once samples exist
  const MAX_EXTRAP_TICKS = 2; // a starvation stretch may run this far, then holds hard
  const BUF_MAX = 120;     // ~2 s of snapshots; older ones have been presented
  const GAP_WINDOW = 300;  // five seconds of accepted arrivals at 60 Hz
  const buf = [];          // decoded snapshots, ascending by tick
  const evq = [];          // events awaiting their presented tick, in order
  // WHICH KINDS ARE RELIABLE IS js/wire.js's OWN COLUMN (R2.1 as O2.12 settles
  // it), read once here and never re-stated: r7a declared the table and its
  // values, and a second list on this side is the drift a single source exists
  // to stop. The fallback is FALSE — a kind this client's wire.js does not know
  // is one it cannot promise to keep.
  // ...and the CONSTRUCT set, read off js/wire.js's own exported list for the
  // same reason (r7b FIX 4): it is pinned to the kernel ladder's source text in
  // both directions, so a fifth homing kind is covered without a second literal
  // here to go stale.
  const isConstructKind = (k) => !!(window.Wire && Wire.CONSTRUCT_KINDS &&
    Wire.CONSTRUCT_KINDS.indexOf(k) >= 0);
  const RELIABLE_KINDS = new Set(
    (window.Wire && Wire.EVENT_KINDS ? Wire.EVENT_KINDS : [])
      .filter((r) => r.reliable).map((r) => r.k));
  const isReliable = (k) => RELIABLE_KINDS.has(k);
  // the event plane's own instruments, published on Net.stats().ev
  const evStats = { replayed: 0, cosmeticDropped: 0, resyncs: 0, fulls: 0, reliableHeld: 0 };
  const bCarry = new Map();// bullet id → the two RENDER-ONLY numbers the wire does
                           // not carry: {vx, vy} derived from the last bracket and
                           // {ox, oy}, where the round first appeared on screen.
                           // Rebuilt whole on every deal from the rounds just
                           // presented — never appended to, so it holds exactly the
                           // live set and cannot leak an entry per shot fired. It is
                           // dropped at both discontinuity cuts: an id is only a
                           // handle inside ONE match, and the server reissues ids
                           // from 1 at a restart, so a carry that outlived the cut
                           // would hand a fresh round a dead one's heading.
  const pendingInputs = [];// at most two records, flushed once per animation frame
  const snapGaps = [];     // accepted snapshot inter-arrival gaps, milliseconds
  let ws = null;
  let helloed = false;
  let pt = -1;             // the presented sim tick (fractional); -1 = nothing yet
  let ptPrev = -1;         // pt as of the PREVIOUS client tick — the older end of
                           // the pair the render's interpolation spans; present()
                           // rolls it before it moves pt, exactly once per tick
  let vtDrawn = -1;        // the phase-4 view-tick record: floor of the presented
                           // instant the LAST loop render actually drew for the
                           // REMOTE bodies (game.js's buildFrameView reports it
                           // through noteDrawn). -1 = no loop render has shown a
                           // snapshot yet — no view claim exists. Reset with pt
                           // in resync(): a dead stream's view is not a claim
                           // against a new match.
  let ntick = 0;           // the upstream frame counter
  let sent = 0;
  let snaps = 0;
  let stale = 0;           // newest-wins drops — TCP delivers bursts after loss
  let lastOwnedSum = -1;   // a rank rising between snapshots is the buy cue
  let blastIndex = -1;     // the BLAST CHARGE row, for the splash fx radius
  let attempts = 0;        // reconnect backoff exponent — an accepted snapshot resets it
  let reconnects = 0;      // sockets re-opened after the first, for stats
  let reconnectTimer = null;
  let intentional = false; // a deliberate Net.close() must never auto-reconnect
  let versionDead = false; // a 4001 is terminal — only a page refresh recovers
  let lastSnapAt = -1;
  let lastSnapGap = 0;
  let starved = 0;
  let starveRun = 0;
  let starveLongest = 0;

  // ---- identity: who this client is, and which match it is watching --------
  // The server deals all three in one `you` message and re-sends it on every
  // grant and every match-epoch change, so nothing here is ever inferred.
  // mySeat null means SPECTATOR: present everything, send no frames, and let
  // the camera follow seat 0 (localSeat()'s own fallback).
  let mySeat = null;
  let myMatchEpoch = -1;  // -1 = no `you` yet, so the snapshot epoch gate stands down
  let mySeatEpoch = -1;
  // ...and the one thing `mySeat === null` cannot say: WHICH null this is. A
  // spectator that never held a seat and a pilot the server just released are
  // the same value here, and the wire cannot tell them apart either — `cl: -1`
  // says a seat is gone, not whose screen it is gone from. So the transition is
  // latched instead: it is the only moment the difference exists. The SEAT
  // RELEASED card is drawn off this and nothing else (js/encounter.js), because
  // the alternative — reading `absent` off localSeatRec() — reads seat 0's
  // record once the seat is cleared, which shows the card to every spectator
  // and hides it from every released pilot on seats 1-3. Set on the `you` edge
  // and cleared only on EVIDENCE, which are two different messages on purpose:
  // see onYou and the apply.
  let released = false;
  // ...and the half of THAT the latch alone cannot say: whether the ask this
  // client has already made came back refused. `released` says a seat was taken
  // from this screen; it says nothing about whether one is still there to take,
  // and the card was written as if the two were the same question. They are not:
  // a released seat is open until somebody else takes it, and the client sees
  // none of that. So the refusal is latched separately and only the CARD'S LINE
  // reads it — the ask stays available, because a seat can open again at any
  // tick and the click is what asks.
  let refused = false;
  let youChanges = 0;     // identity re-issues seen, for stats
  let epochDrops = 0;     // snapshots discarded because their match was not ours
  // The lobby roster, as last told. -1 on the two counts means UNKNOWN, not
  // zero: a `you` from a server older than these fields carries neither, and
  // the banner must then read exactly as it did before rather than claim
  // "0 of 0 seated". A roster change alone is NOT an identity change — it
  // repaints the banner and touches nothing else.
  let rosGranted = -1;
  let rosMax = -1;
  let rosStarted = false;
  // ...and the display names, parallel to the seats and exactly rosMax long —
  // whatever the last `you` said. Empty until the first one lands, which reads
  // as "every seat nameless" and draws the ordinary Player-N fallbacks. Like
  // the two counts it is a LOBBY fact: a names-only `you` repaints the board
  // and tears nothing down (see onYou).
  let seatNames = [];
  let seatSkins = [];
  // ...and D37's MARKET HAND, this client's OWN (R7 / r7c commit 5, R3.5).
  // Four catalog indices and the four bought bits beside them, off the
  // SEATED branch of `you` — a spectator's `you` carries neither, and that
  // is deliberate: a hand fanned out on `roster` would publish every pilot's
  // shelf to the room, and D37's whole point is that the shelf is private.
  //   NULL IS "NOBODY HAS TOLD ME", AND IT IS NOT THE SAME AS []. The server
  // sends both arrays on EVERY seated `you`, empty until the room's first clear
  // deals one — so `[]` means "I hold no rows" and `null` means "I have never
  // been sent a shelf at all". Collapsing the two would make an oracle over
  // this accessor VACUOUS: a server that dropped the field entirely and a room
  // that has dealt nothing would read identically, and the leg that closes
  // S-0cg7r2 (test/tools/two-seat-proof.mjs) could not tell them apart.
  // the KEY LIST of the last `you` this client decoded (r7c FIX F12) — null
  // until one arrives. Read-only, published on Net.stats(); nothing on the
  // draw path reads it.
  let lastYouKeys = null;
  let seatHand = null;
  let seatBought = null;
  // ...and D39's STALL, as the SERVER decided it (r7c commit 7, R3.7). The
  // detector advances in the SIM STEP and a net client steps no local sim, so
  // this surface was dark on every `?mp` screen. It is a flag and not a state
  // because a stalled room is an ACTIVE one — see the apply.
  let netStalled = false;
  // ...and the SERVER's inter-wave break length, in ticks (r7c commit 8, R3.8).
  // 0 means "no server has said" — a real answer, and the one that makes the
  // countdown fall back to the client's own ECFG.clearHold rather than to zero.
  let netHold = 0;
  let lastAck = 0;        // the server's highest CONTIGUOUS RESOLVED input n

  // ---- the OWN-SHIP predictor (phase 11b) -----------------------------------
  // The local ship answers the stick NOW: every accepted snapshot rebases a
  // DETACHED kernel state (the 11a Flight slices — the predictor never
  // re-implements flight arithmetic) at the acked tick, replays the client's
  // own unacked sent frames forward, and the presented own pose is predicted
  // state plus a decaying RENDER offset. Corrections NEVER feed back into the
  // kernel state (walls and clamps branch on state); discontinuities (death,
  // respawn, restart, termChange, any `you` change) snap HARD — offset
  // dropped, authoritative state adopted wholesale. Wire-adopted fields at a
  // rebase: pose, velocity, flame, comet, the pool + cap, cool, enIdle. The
  // locally-continuous fields (aim state, thrustAcc, scur, the held bits) are
  // carried from the predictor's OWN prior prediction of that same tick —
  // they never ride the wire. Terms come from termsFromOwned over the ACKED
  // `ow` vector: the ONE derivation, fed the wire's rank truth. In net mode
  // the sim-affecting tunables are locked to file defaults (game.js's
  // NET_LOCKED_IDS), so the kernel globals the slices read match the server.
  //
  // The marker-tick contract (a termChange/death/respawn lands ON its
  // enclosing snapshot's tick) holds only while the server broadcasts every
  // tick — server.js asserts SNAPSHOT_EVERY === 1 at boot for exactly this.
  const PRED_DECAY = 0.8;       // offset decay per presented tick — ~10 ticks to noise
  const PRED_MAX_UNACKED = 180; // 3 s of unacked frames: past this, stand down
  let predOn = false;   // a base exists and the seat is up — the apply() carve-out gate
  let predK = null;     // the predicted kernel state — detached, never players[]
  let predTick = -1;    // the tick predK describes
  let lastCutTick = -1; // the SIM TICK of the newest discontinuity marker this
                        // client cut on — the marker's own `ev.t` since v11, not
                        // the tick of the snapshot that delivered it
  let predIdle = false; // hud dead, own rsp > 0, or no hull at all (the claim
                        // window and the release both sit at rsp 0) — no motion,
                        // no replay: there is nothing flying to predict
  const sentHist = [];  // { n, batch, f } — the client's own send history;
                        // one batch per flush = one server tick's admission
  let batchId = 0;
  const localAtTick = new Map(); // tick → the locally-continuous kernel fields
  let myOw = null;      // the ACKED rank vector — termsFromOwned's input
  // The wire's rank vector, back at full shop width. `ow` arrives trimmed of
  // its trailing default run (server/snapshot.mjs trimRanks), and `was` is the
  // vector already on the record — SHOP.map(() => 0) since restart() built it —
  // so its length is the width to restore. Whichever is longer wins the length,
  // so a server whose shop has grown past this client's still decodes whole
  // rather than silently truncated.
  const padRanks = (ow, was) => {
    const n = Math.max(ow.length, Array.isArray(was) ? was.length : 0);
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = ow[i] | 0;
    return out;
  };
  const off = { x: 0, y: 0 }; // the render correction offset — presentation only
  let rebases = 0;
  let lastRebaseMag = 0;
  const spec = { cueShown: 0, cueMatched: 0, cueRefused: 0,
                 cometCueShown: 0, cometRefused: 0,
                 cueRetracted: 0, cueBackfilled: 0 }; // monotone, render-side —
                        // the row-2 harness seam (latency-rig reads these).
                        // Both of the last two are the rebase reconciliation's
                        // bookkeeping (the cool-delta block in rebase), one per
                        // direction: cueRetracted when the rebase pulls the
                        // cooldown back under a cue already shown, cueBackfilled
                        // when it pushes the phase forward past a shot the
                        // incremental tick never modelled. The back-fill was
                        // once rejected for over-cueing, and that measurement
                        // was against TRACERS — it now sounds ONLY, so an
                        // over-cue costs a late pew and never a broken promise
                        // on screen. See the reconciliation block for the
                        // measurement that reopened it.
  const tracers = [];   // speculative rounds: {x,y,ox,oy,vx,vy,age,ttl} — NEVER G.bullets
  let maxOwnBulletId = -1; // the hand-off's high-water mark. Entity ids are
                        // MONOTONIC (nextId), so "new own bullet" is an id
                        // above this — a live-id SET flapped under jitter:
                        // the starvation branch presents the NEWEST snapshot,
                        // presentation then falls back to an older s0, and a
                        // set saw the same bullets "appear" twice, eating
                        // tracers that belonged to later shots

  function freshK() {
    return { ship: { x: 0, y: 0 }, vel: { x: 0, y: 0 },
      aimAngle: 0, aimOff: { x: 0, y: 0 }, aimed: false,
      // THE CONVERGED NOSE (D32), and the predictor MUST carry it or own-ship
      // prediction diverges on every ship-relative thrust: the frame rotates the
      // key vector by this seat's nose, so a kernel without one would rotate by
      // a default that is not the sim's and put every predicted W somewhere the
      // server did not. It is a HAND-WRITTEN bank like the rest of this record —
      // adding a field to makePlayer does NOT add it here, which is exactly why
      // it is named.
      heading: 0,
      cool: 0, comet: false, energy: 0, energyMax: 0, enIdle: 0,
      thrustAcc: { x: 0, y: 0 }, flame: { x: 0, y: 0 },
      // the ABILITY SLOT record — a HAND-WRITTEN bank, which is exactly why it
      // has to be named here: adding a field to makePlayer does NOT add it to
      // this one, and a kernel field the predictor lacks makes replay and
      // incremental disagree as rubber-banding. The wire's own `cd` is adopted
      // onto it in adoptWire below.
      slots: window.Abilities ? Abilities.makeSlots() : [],
      input: { scur: { x: 0, y: 0 }, fireHeld: false, cometWant: false,
               cometPress: 0 } };
  }
  function adoptWire(K, pr) {
    // v8: a PARKED seat's record is four keys — seat, hull, hm, cl: -1 — and
    // carries no pose, velocity, flame or pool. Adopting it would write
    // undefined into every kernel field; the kernel keeps freshK's zeros
    // instead. The only caller that can reach here with one is hardSnap (the
    // rebase's `down` test is true for it), and hardSnap turns the predictor
    // OFF, so the zeros are never presented.
    if (isParked(pr)) return;
    K.ship.x = pr.x; K.ship.y = pr.y;
    K.vel.x = pr.vx || 0; K.vel.y = pr.vy || 0;
    K.flame.x = pr.fx; K.flame.y = pr.fy;
    K.comet = !!pr.comet;
    K.energy = pr.en || 0;
    K.energyMax = pr.em || ENMAX;
    K.cool = pr.cool || 0;
    K.enIdle = pr.enIdle || 0;
    // the per-seat ability cooldowns, rebased exactly as `cool` is. The wire
    // sends the vector with its TRAILING DEFAULT RUN cut off and drops the key
    // entirely when it is empty (trimRanks' rule, and its reason), so the
    // absent case must write ZEROS rather than leave the last rebase standing.
    if (K.slots) {
      const cd = Array.isArray(pr.cd) ? pr.cd : [];
      for (let i = 0; i < K.slots.length; i++) K.slots[i].cd = cd[i] | 0;
    }
  }
  function carryLocal(K, tick) {
    const L = localAtTick.get(tick);
    if (L) {
      K.aimAngle = L.aimAngle; K.aimed = L.aimed;
      K.heading = L.heading; // ...and the nose, which is the whole point of
                             // carrying it: the convergence is RATE-LIMITED, so
                             // a replayed tick that started from freshK's zero
                             // would take the long way round to the same bearing
                             // and thrust somewhere else for every tick of the
                             // journey. A hard snap must not flip the frame for
                             // one RTT, and this is what stops it.
      K.aimOff.x = L.aimOffX; K.aimOff.y = L.aimOffY;
      K.thrustAcc.x = L.thrustAccX; K.thrustAcc.y = L.thrustAccY;
      K.input.scur.x = L.scurX; K.input.scur.y = L.scurY;
      K.input.fireHeld = L.fireHeld; K.input.cometWant = L.cometWant;
      // cometPress is deliberately NOT carried: the latch re-derives per tick
      // inside the replayed drain from the carried cometWant, so incremental
      // and replay agree with no stored copy to drift
    } else {
      // no prior prediction of this tick (first base, or after a hard snap):
      // seed from the live client input state — the honest zero
      K.input.scur.x = in0.scur.x; K.input.scur.y = in0.scur.y;
      K.input.fireHeld = !!G.leftHeld;
      K.input.cometWant = !!in0.cometWant;
      // ...and the NOSE from the live seat rather than freshK's zero. This is
      // the first-base and post-hard-snap path, and zero is not an honest seed
      // for a rate-limited value: it would point the predicted ship along +x
      // and converge back over the half-second the rate allows, thrusting wrong
      // the whole way. The seat record's own heading is what the sim last had.
      // `players` is read through the shared global lexical scope, the same
      // way this file already reads `in0` two lines up — not through __test,
      // which is the seam for the ENCOUNTER's internals and not for game.js's
      // own top-level bindings.
      const P0 = players[0];
      if (P0 && Number.isFinite(P0.heading)) K.heading = P0.heading;
    }
  }
  function recordLocal(K, tick) {
    localAtTick.set(tick, { aimAngle: K.aimAngle, aimed: K.aimed, heading: K.heading,
      aimOffX: K.aimOff.x, aimOffY: K.aimOff.y,
      thrustAccX: K.thrustAcc.x, thrustAccY: K.thrustAcc.y,
      scurX: K.input.scur.x, scurY: K.input.scur.y,
      fireHeld: K.input.fireHeld, cometWant: K.input.cometWant });
  }
  // the convergence, mirrored from game.js by VALUE for the reason game.js
  // mirrors it from the kernel: same operations, same order, or the predicted
  // nose and the simulated one drift apart in the last bits and the thrust
  // rotation drifts with them.
  const PRED_TAU = Math.PI * 2;
  function predRotateToward(a, b, max) {
    let d = (b - a) % PRED_TAU;
    if (d > Math.PI) d -= PRED_TAU;
    if (d < -Math.PI) d += PRED_TAU;
    return a + (d < -max ? -max : d > max ? max : d);
  }
  const predTerms = () =>
    (window.Encounter && Encounter.termsFromOwned ? Encounter.termsFromOwned(myOw) : null);

  // the fire direction as the SERVER resolves this seat: the banked scur,
  // then the stored aim, then the heading — seatFireDir's exact ladder,
  // evaluated on the predicted kernel state
  function predFireDir(K) {
    const dx = K.input.scur.x - K.ship.x;
    const dy = K.input.scur.y - K.ship.y;
    const m = Math.hypot(dx, dy);
    if (m >= 0.001) return { x: dx / m, y: dy / m };
    if (K.aimed) return { x: Math.cos(K.aimAngle), y: Math.sin(K.aimAngle) };
    const s = Math.hypot(K.vel.x, K.vel.y);
    return s < 0.05 ? null : { x: K.vel.x / s, y: K.vel.y / s };
  }
  // fire()'s refusal ladder and its cool arithmetic, modeled on K — no
  // bullet is ever spawned and no real cool is ever set: the REPLAY's K (or
  // the incremental prediction's) carries the cool the server will write
  function modelFire(K, terms) {
    if (K.cool > 0) return false;
    const d = predFireDir(K);
    if (!d) return false;
    const sp = Math.hypot(K.vel.x, K.vel.y);
    if (BMODE === "cq-scale" && sp < MIN_FIRE_V) return false;
    K.cool = Math.max(1, Math.round(BCOOL * (terms ? terms.cool : 1) / TICK));
    return true;
  }
  // the CUE half's tracer spawn: the visibility gates PLUS the owner-scoped
  // live-bullet budget (wire bullets carry `o`, and in-flight tracers count
  // against it) — pass fires muzzle + tracer from the predicted nose,
  // refuse shows nothing. Deliberately does NOT touch K.cool: the caller's
  // modelFire owns the state, this owns only the promise on screen.
  //   `rec` is an ability record's SPAWN block (js/abilities.js) — the cue
  // flies that record's ballistics and wears its render-only look. No rec is
  // the standard gun, byte-for-byte the shipped behavior. The dead gate, the
  // budget and the direction ladder are shared: they are the same field gates
  // abilityFire runs (minus the frozen overlay, which the predictor cannot
  // see — that miss is the documented pay-then-refuse residue).
  function spawnCue(K, terms, rec) {
    void terms;
    const newest = buf.length ? buf[buf.length - 1] : null;
    if (newest && newest.hud && newest.hud.state === "dead") return false;
    let mine = tracers.length;
    for (const b of G.bullets) if (b.owner === mySeat) mine++;
    if (mine >= BMAX) return false;
    const d = predFireDir(K);
    if (!d) return false;
    const sp = Math.hypot(K.vel.x, K.vel.y);
    let vx, vy;
    if (rec) {
      // abilityFire's exact speed rule: the record scales the BSPEED slider,
      // and BMODE is deliberately NOT read — no cq-scale arithmetic and no
      // stationary refusal, because the sim's ability path has neither
      vx = d.x * BSPEED * rec.spd; vy = d.y * BSPEED * rec.spd;
    } else if (BMODE === "cq-scale") {
      if (sp < MIN_FIRE_V) return false;
      vx = d.x * sp * BFACTOR; vy = d.y * sp * BFACTOR;
    } else {
      vx = d.x * BSPEED; vy = d.y * BSPEED;
      if (BMODE === "newtonian") { vx += K.vel.x * BFACTOR; vy += K.vel.y * BFACTOR; }
    }
    // the tracer's whole life: up-wire + sim + down-wire + the presentation
    // buffer, with a jitter allowance. Too short and an honest slow confirm
    // books itself as a refusal; the fade is the only cost of the slack, and
    // an unmatched tracer still refuses at expiry.
    // ...and the buffer term is the LIVE target, not a constant: an adaptive
    // depth that drifted away from a hard-coded 3 would mis-size this window in
    // both directions, and row 2's cue accounting is exactly what that breaks
    const ttl = Math.ceil(((rtt > 0 ? rtt * 1.25 : 320) + delayTicks() * TICK + 300) / TICK);
    // ...the record's LOOK rides on the tracer — render-only fields, undefined
    // for the standard gun, so the draw stays one `|| C.bright` and the
    // hand-off knows which cues carry a look to stamp. The muzzle is the
    // predicted NOSE (centre + SHIP_R along the fire direction), matching the
    // sim spawns, so the glow and the tail leave the nozzle on both surfaces;
    // the tracer's own pose stays the centre, where the predicted round is.
    tracers.push({ x: K.ship.x, y: K.ship.y,
      ox: K.ship.x + d.x * SHIP_R, oy: K.ship.y + d.y * SHIP_R,
      vx, vy, age: 0, ttl,
      ink: rec && rec.ink, streak: rec && rec.streak, r: rec && rec.r });
    spec.cueShown += 1;
    return true;
  }
  // a PRESS's cue: model the fire (the real refusal ladder + the cool set)
  // and show the promise in the same tick — a press is the player's own
  // edge, and the server ORs the press masks whatever the grouping
  function specFire(K, terms) {
    if (!modelFire(K, terms)) return false;
    return spawnCue(K, terms);
  }
  // ...and the same promise for the EAR. The wire's copy of these two events
  // is suppressed for this seat in fireEvents below, so this is not a second
  // sound: it is the same sound, a round trip earlier, on the tick the
  // player's own click produced it. Only fire and thud travel this way —
  // they are the only two effects the predictor authors, and every other cue
  // is the server's alone, with no local antecedent to sound early.
  //
  // The two arrive by different roads, and only one of them has a gate. FIRE
  // rides exactly the gates the TRACER rides and adds none of its own: it is
  // sounded only where spawnCue actually spawned, so a modelled-but-refused
  // shot is as silent as it is invisible. THUD has no tracer and no gate — the
  // flight slice calls it once per wall contact and it sounds, the way the sim
  // emits one; the recipe's own 90 ms gap is the only thing rate-limiting it.
  //   Fire carries one residue the tracer does not: the rebase can RETRACT a
  // promise, and while a popped tracer un-draws itself, nothing can un-play a
  // sound. The common retraction cancels a cue that is still PENDING and so
  // never sounded at all (js/net.js's dc < -4 branch takes that path first);
  // the residue is the just-spawned-tracer case, which leaves a heard pew whose
  // bullet the rebase withdrew.
  function ownCue(kind, at, gain) {
    if (window.Sfx) Sfx.cue(kind, at, gain, mySeat);
    // the screen shake's own-ability tap, on the same predicted edge the
    // sound rides — Shake.own takes ONLY ability cue kinds, so fire and thud
    // pass through silently. The wire's copy of the same shot re-enters
    // through fireEvents a round trip later, where Shake.cue strips ability
    // kinds — the pair cannot double.
    if (window.Shake) Shake.own(kind);
  }

  // one predicted kernel tick, in the server's exact per-tick order:
  // drain → energy → integrate, then the autofire pass. `fx.fire` decides
  // whether a fire press is a cue (incremental) or only a cool model (replay).
  const PRED_CTX = { alive: true, terms: null, keyThrust: null, thrustFrame: null, owned: null };
  let pendingAutofireCue = false; // incremental-only: an autofire shot was
                        // modeled last tick — its cue shows THIS tick if the
                        // trigger is still held (see the trail note below)
  function predTickK(K, frames, terms, cueing) {
    PRED_CTX.alive = true; // the predictor idles while the seat is down, so
                           // a live replayed tick is a live seat by contract
    PRED_CTX.terms = terms;
    // the ARM RULE's ownership term, and it has to be here or the predictor and
    // the sim answer Flight.abilityOn differently the day an ability gets a shop
    // row. myOw is the ACKED wire rank vector — the same value predTerms() feeds
    // termsFromOwned — and it is deliberately NOT padded: the arm rule reads it
    // through `| 0`, which answers rank 0 past the end, exactly as
    // termsFromOwned's `|| 0` does. That is the one property snapshot.mjs's trim
    // rests on, restated here because this is a raw index into a trimmed vector.
    PRED_CTX.owned = myOw;
    PRED_CTX.keyThrust = () => (terms ? terms.keyThrust !== false : true);
    // THE THRUST FRAME, MIRRORED — and it reads the PREDICTED kernel's nose, not
    // the sim seat's. That distinction is the whole correctness of it: the
    // replay walks the same banked frames the server will, and at each replayed
    // tick the nose is whatever the replay has converged it to, so the rotation
    // has to ask K. game.js's thrustFrame takes a SEAT because the sim has
    // several; here there is exactly one kernel and it is K.
    PRED_CTX.thrustFrame = (mode, kx, ky) => {
      // the DRAINED FRAME's mode, exactly as the sim reads it — never
      // THRUSTFRAME. The predictor replays the frames this client actually
      // SENT, so reading the live global would make a mid-flight T flip
      // re-predict every unacked tick under the new mode while the server
      // still holds them under the old one. The frame is the record of what
      // was asked for, and that is what a replay must obey.
      if (mode === "screen" || (kx === 0 && ky === 0)) return { x: kx, y: ky };
      if (!Number.isFinite(K.heading)) return { x: kx, y: ky };
      const sa = Math.sin(K.heading);
      const ca = Math.cos(K.heading);
      return { x: -kx * sa - ky * ca, y: kx * ca - ky * sa };
    };
    // `ability` shows the PICTURE and the SOUND on the press edge, exactly as
    // the gun's `fire` does. spawnCue reads the record's spawn block now, so
    // the cue flies the ability's own ballistics and wears its own ink — the
    // two reasons the picture used to be withheld (a wrong-shaped tracer, and
    // an unmatched one corrupting row 2's refusal instrument) are both gone:
    // the hand-off matches ability cues like any other, and the cue joins the
    // same spec.cueShown/cueMatched/cueRefused counters. The sound rides the
    // tracer's gates, the rule the gun states above: a refused picture is a
    // refused sound, so the dead gate, the budget and the direction ladder
    // answer the same on both channels — mirroring abilityFire, which skips
    // its `fire` emit with the spawn. A record with NO spawn block keeps the
    // old sound-only path: there is no round to promise a picture of.
    //   It is still a PROMISE the server may refuse. abilityFire's frozen-
    // overlay gate runs past the arm this sink sits behind, and the predictor
    // cannot see it — so that shot cues anyway, and its tracer now fades
    // unmatched as spec.cueRefused where it used to be audible-only. That is
    // the pay-then-refuse feel defect one file over, visible now; it is not
    // new, it is not a desync, and the trade is deliberate.
    //   The ARM and its COOLDOWN were always modelled here, because the drain
    // slice does both before it reaches this sink.
    const fx = cueing
      ? { fire: () => { if (specFire(K, terms)) ownCue("fire", K.ship); },
          ability: (id) => {
            const def = Abilities.def(id);
            const rec = def && def.spawn;
            if (!rec || spawnCue(K, terms, rec)) ownCue(Abilities.cueFor(id), K.ship);
          },
          // the sink hands the flight slice's own two numbers straight
          // through — the same world position and pre-bounce magnitude
          // FLIGHT_FX.thud gives Encounter.emit in the sim
          thud: (x, y, gain) => { ownCue("thud", { x, y }, gain); } }
      : { fire: () => { modelFire(K, terms); }, ability: () => {}, thud: () => {} };
    Flight.drainSlice(K, frames, PRED_CTX, fx);
    // THE NOSE TURNS, in the sim's own place in the order: after the drain's
    // thrust and before the energy slice, which is exactly where game.js's
    // headingStep() sits. Get that order wrong by one call and a ship-relative
    // tick rotates by a nose one step ahead of the server's, which is a steady
    // heading error rather than a visible glitch — the worst shape a desync
    // takes. The aim ladder is predFireDir's, the same one the server resolves
    // this seat's shots along, and a null answer HOLDS the nose exactly as the
    // sim's does.
    {
      const d = predFireDir(K);
      if (d) K.heading = predRotateToward(K.heading, Math.atan2(d.y, d.x), HEADRATE * (TICK / 1000));
    }
    Flight.energySlice(K, PRED_CTX);
    Flight.integrateSlice(K, PRED_CTX, fx);
    // the AUTOFIRE cue TRAILS its model by one banked frame. The model stays
    // server-faithful (the cool is set the tick the server would set it),
    // but a shot whose cooldown expires on the very tick the trigger
    // releases is a coin flip on the server — the ring's grouping decides
    // whether fireHeld still stood — and cueing it booked every lost flip as
    // a lie (measured 6-13% refusals at j20). Showing the cue one frame
    // later, only if the trigger is STILL held, turns those over-cues into
    // silent under-cues: a bullet with no tracer costs nothing, a tracer
    // with no bullet is a broken promise. A PRESS (bit 0 of `ap`) still
    // cues in its own tick — the merge ORs the press masks whatever the grouping.
    if (cueing && pendingAutofireCue) {
      pendingAutofireCue = false;
      // the ear inherits the trail rather than rebuilding it: the sound is
      // made where the tracer is, so autofire — the mode the player actually
      // holds the trigger in — sounds on the same honest edge the promise
      // does, and a shot the trail refuses stays silent in both senses
      if (K.input.fireHeld && spawnCue(K, terms)) ownCue("fire", K.ship);
    }
    if (AUTOFIRE && K.input.fireHeld && K.cool <= 0) {
      if (modelFire(K, terms) && cueing) pendingAutofireCue = true;
    }
  }

  // full teardown — a new identity, a match epoch cut, or a stream reset
  function predReset() {
    predOn = false;
    predIdle = false;
    predK = null;
    predTick = -1;
    lastCutTick = -1;   // a dead match's marker must not name this one's cut
    sentHist.length = 0;
    localAtTick.clear();
    tracers.length = 0;
    off.x = off.y = 0;
    myOw = null;
    maxOwnBulletId = -1;
    pendingAutofireCue = false;
  }

  // the HARD snap: offset dropped, authoritative state adopted wholesale,
  // history and ghosts cleared — never smoothed, that is the row-4 bar
  function hardSnap(s, pr, down) {
    off.x = off.y = 0;
    sentHist.length = 0;
    localAtTick.clear();
    tracers.length = 0;
    bCarry.clear(); // a restart reissues entity ids from 1, and G.bullets is NOT
                    // cleared here — the carry must go, or a fresh round with a
                    // recycled id inherits a dead run's heading and muzzle
    pendingAutofireCue = false;
    const K = freshK();
    adoptWire(K, pr);
    carryLocal(K, s.tick); // the map was just cleared — seeds from live input
    // No cue-edge detector to re-seed here any more. It used to exist because
    // the comet's press was DERIVED from a rise in the held level, so a detector
    // frozen across the predictor's idle window called a button held straight
    // through death a fresh press at respawn — tracker S-r3mfs8 leg R2. The
    // press bit rides the frame explicitly now and there is nothing to seed.
    predK = K;
    predTick = s.tick;
    predIdle = down;
    predOn = !down;
  }

  // per accepted NEWEST snapshot: rebase + replay
  function rebase(s) {
    if (mySeat === null) { predOn = false; return; }
    if (!s.players) return;
    const pr = s.players.find((p) => p.seat === mySeat);
    if (!pr) { predOn = false; return; }
    // ...and this one is NOT padded, unlike the seat record's copy below. myOw
    // has exactly one consumer — termsFromOwned — which reads it as
    // `owned[ROW_IX[name]] || 0` and so already means rank 0 by absence. Pad it
    // the day something INDEXES it directly, because a raw index into a trimmed
    // vector is the NaN that padRanks exists to stop.
    if (Array.isArray(pr.ow)) myOw = pr.ow.slice();
    // the discontinuity markers, read at ARRIVAL — and SINCE v11 EACH ONE
    // CARRIES ITS OWN TICK (R2.2). The old reading was "their tick IS this
    // snapshot's tick while SNAPSHOT_EVERY === 1", and that stopped being true
    // the moment the ring could REPLAY a marker: a socket the broadcast skipped
    // gets its markers on a LATER snapshot than the one they happened on, so
    // `s.tick` would name the delivery and not the event. The cut itself is
    // unchanged — the predictor snaps to the authoritative state this snapshot
    // carries either way — but the tick it RECORDS is the marker's own.
    // restart cuts everyone and death/respawn cut the local seat: those are
    // TELEPORTS, so the whole predictor snaps wholesale. termChange is a
    // TERMS discontinuity, not a teleport: the rebase below already replays
    // with the marker snapshot's own ow (terms switch AT the marker tick by
    // construction), so its hard half is only the offset — dropped, never
    // blended — while the unacked history stays: those frames are still in
    // front of the server, not behind the marker.
    let cut = false;
    let termCut = false;
    let cutT = -1;
    for (const ev of s.events || []) {
      // v11: the event's OWN tick, and `s.tick` only as the pre-v11 fallback a
      // decoder that saw no `t` would have used.
      const et = ev.t !== undefined ? ev.t : s.tick;
      if (ev.k === "restart") { cut = true; if (et > cutT) cutT = et; }
      else if ((ev.k === "death" || ev.k === "respawn") && ev.seat === mySeat) { cut = true; if (et > cutT) cutT = et; }
      else if (ev.k === "termChange" && ev.seat === mySeat) { termCut = true; if (et > cutT) cutT = et; }
    }
    if (cutT >= 0) lastCutTick = cutT;
    const down = (s.hud && s.hud.state === "dead") || (pr.rsp || 0) > 0 ||
                 pr.hull <= 0; // the HULL closes the gap the countdown left:
                 // a seat in its claim window, or unseated, sits at rsp 0 with no
                 // hull, and predicting flight for a wreck was the same latent bug
                 // the fx layer carried. The v8 PARKED record (isParked) is
                 // caught by this same clause and needs no term of its own: the
                 // sim's vacateSeat is the ONE writer of `absent` and zeroes the
                 // hull in the same write, and the encoder sends that hull raw
                 // (server/snapshot.mjs's four-key record carries `p.hull`), so a
                 // parked record ALWAYS reads hull 0 here — the ordinary rebase
                 // below, which adopts the pose, can never see one
    if (cut || down || !predK) { hardSnap(s, pr, down); return; }
    // ordinary rebase: drop what the ack resolved, then replay the rest
    while (sentHist.length && sentHist[0].n <= lastAck) sentHist.shift();
    if (sentHist.length > PRED_MAX_UNACKED) { predOn = false; return; }
    const K = freshK();
    adoptWire(K, pr);
    carryLocal(K, s.tick);
    const terms = predTerms();
    let t = s.tick;
    let i = 0;
    const frames = [];
    while (i < sentHist.length) {
      const b = sentHist[i].batch;
      frames.length = 0;
      // THE BATCH INVARIANT, stated because it is load-bearing and was not.
      // The inner loop stops at FRAMES_PER_TICK WITHOUT advancing past the rest
      // of the batch, so a batch of three would be replayed as TWO ticks the
      // server ran as one. It is safe only because appendInputFrame caps
      // pendingInputs at 2 and batchId increments once per flush — so a batch is
      // never wider than the lid. Raise FRAMES_PER_TICK, or let a third frame
      // into one flush, and this loop silently re-times the replay. It matters
      // more since R1: an ability arm SPENDS from the pool inside the drain, so
      // a mis-grouped press is an 18-point pool divergence rather than nothing.
      while (i < sentHist.length && sentHist[i].batch === b &&
             frames.length < FRAMES_PER_TICK) {
        frames.push(sentHist[i].f);
        i += 1;
      }
      t += 1;
      predTickK(K, frames, terms, false); // replay models cool, never cues
      recordLocal(K, t);
    }
    for (const tick of localAtTick.keys()) {
      if (tick < s.tick - 2) localAtTick.delete(tick);
    }
    // CUE RECONCILIATION — the replay is the fire schedule's truth. A
    // grouping collapse on the wire drifts the server's cooldown phase off
    // the incremental's by a tick; left alone, every drift event became a
    // broken promise (measured 6-13% refusals at j20): the incremental cued
    // at its stale expiry, the rebase pulled the cooldown BACK, and the shot
    // cued AGAIN at the true expiry — two tracers, one bullet. When the
    // rebase retards the phase under a just-shown cue, retract that cue: the
    // same shot will re-cue at the truth.
    //   THE SYMMETRIC CASE IS NOW BACK-FILLED, AS A SOUND AND NOTHING ELSE,
    // and the reversal is worth stating because this comment argued the other
    // way for two days. The fire cue is authored ONLY on an incremental tick —
    // predTickK takes cueing=false on the replay path and true on the
    // incremental one — so when a rebase pushes the cooldown phase FORWARD, the
    // replay models a shot the incremental never did, pendingAutofireCue is
    // never set, and ownCue never runs. This was left alone on the stated price
    // "an uncued bullet at worst steals one tracer". That price expired at
    // 76dcd1f: fireEvents now suppresses the wire's copy of own fire as an
    // own-echo whenever the predictor is live, so the only remaining copy of
    // that shot is the one this block declines to author, and the gun goes
    // SILENT rather than untraced. MEASURED 2026-08-22 in Firefox at ?mp, the
    // trigger held: 38 cues, inter-cue gaps 0.40 s × 31 and 0.80 s × 3 against a
    // 400 ms BCOOL — three shots fired and never heard, 7.5%, with the
    // predictor up throughout (pred.on, !idle, unacked 0) and tracers 0 against
    // BMAX 15, which excludes both the stand-down and the budget-refusal paths.
    // (Those are the numbers AS MEASURED, on a page whose BCOOL was 400 and
    // whose BMAX was 15. D50 / OPEN 2 (PORT-F) moved them to 130 and 20 and
    // D65 (PORT-P) took BCOOL to 230, so the 0.40 s gaps become 0.233 s and
    // the measurement is not re-runnable as
    // written — the finding it supports is unchanged and the fix is shipped.)
    //   The old rejection measured a back-fill that spawned a TRACER, where an
    // over-cue is a visible broken promise. This one calls ownCue alone: no
    // tracer, no promise, and at worst a late pew — the sound the player was
    // already expecting. It cannot double-cue either, because a shot the
    // incremental DID model leaves predK.cool already high, which puts dc near
    // zero and takes neither branch.
    if (!termCut) {
      const dc = K.cool - predK.cool;
      if (dc > 4) {
        ownCue("fire", K.ship); // sound only — never a tracer
        spec.cueBackfilled += 1;
      } else if (dc < -4) {
        // the early promise is usually still PENDING (the autofire cue
        // trails its model by one frame) — cancel it there first; only a
        // just-spawned tracer needs the pop
        if (pendingAutofireCue) {
          pendingAutofireCue = false;
          spec.cueRetracted += 1;
        } else {
          // ...popped blind to WEAPON — the second no-shot-id site beside the
          // hand-off's oldest-first match: a gun mispredict inside the window
          // can retract the rifle's cue here, and the stale gun phantom later
          // transplants white onto the real slug. Same accepted risk.
          const yt = tracers[tracers.length - 1];
          if (yt && yt.age <= 4) {
            tracers.pop();
            spec.cueRetracted += 1;
          }
        }
      }
    }
    // the correction: absorbed into the RENDER offset, decayed per tick —
    // the kernel state itself is replaced, never nudged
    lastRebaseMag = Math.hypot(predK.ship.x - K.ship.x, predK.ship.y - K.ship.y);
    if (termCut) {
      // the termChange HARD half: adopt, never blend — a purchase's effects
      // land as a cut, and any offset built before it dies with the old terms
      off.x = 0;
      off.y = 0;
      tracers.length = 0; // a pre-purchase cue must not confirm across the cut
    } else {
      off.x += predK.ship.x - K.ship.x;
      off.y += predK.ship.y - K.ship.y;
    }
    predK = K;
    predTick = t;
    predIdle = false;
    predOn = true;
    rebases += 1;
  }

  // per presented tick: age the cue state and decay the correction
  function predPresentTick() {
    off.x *= PRED_DECAY;
    off.y *= PRED_DECAY;
    for (let i = tracers.length - 1; i >= 0; i--) {
      const tr = tracers[i];
      tr.age += 1;
      tr.x += tr.vx;
      tr.y += tr.vy;
      if (tr.age > tr.ttl) {
        tracers.splice(i, 1);
        spec.cueRefused += 1; // shown, never confirmed — the cue lied
      }
    }
  }

  // ---- app-level RTT --------------------------------------------------------
  // The socket's own protocol ping is a 25 s liveness probe, not a measurement.
  // This is the measurement: a timestamp out every PING_MS, echoed verbatim,
  // smoothed the way RFC 3550 smooths — one eighth of the error per sample, and
  // the jitter is the smoothed absolute difference between successive samples.
  const PING_MS = 2000;
  const RTT_ALPHA = 0.125;
  let rtt = -1;
  let rttLast = -1;
  let rttJitter = -1;
  let rttMin = -1;
  let pongs = 0;

  const enc = () => window.__test.enc;

  // ---- the status banner (DOM, not canvas — the draw pass stays untouched) --
  const banner = document.createElement("div");
  banner.id = "netbanner";
  banner.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:9;" +
    "font:400 11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;" +
    "color:#9aa3b2;background:rgba(14,17,25,0.85);border:1px solid #313a4e;" +
    "padding:2px 8px;pointer-events:none;";
  const note = (text, accent) => {
    banner.textContent = text;
    banner.style.color = accent ? "#d97757" : "#9aa3b2";
  };
  document.body.appendChild(banner);
  note("NET connecting to " + url + " …");

  // ---- what the server has last been told -----------------------------------
  // It starts as what the hello carried, so a returning player who opens the
  // editor and closes it again sends nothing.
  let nameSent = ownName;
  let skinSent = ownSkin;
  let nameSentAt = -1;
  let namePending = false;
  // ONE message carries the WHOLE identity — the name and the hull together —
  // and that is not tidiness. The server rate-gates this route at a quarter
  // second and answers a dropped message with silence, so two messages sent
  // inside one window would lose the second half of an identity a player chose
  // in one moment. Sending the pair means the coalescing below can never split
  // them: whatever the flush finds in nameSent/skinSent is what leaves.
  function pushIdentity() {
    if (!ws || ws.readyState !== 1) return;
    const now = Date.now();
    const gap = now - nameSentAt;
    if (nameSentAt >= 0 && gap < 300) {
      if (!namePending) {
        namePending = true;
        setTimeout(() => { namePending = false; pushIdentity(); }, 300 - gap);
      }
      return;
    }
    nameSentAt = now;
    // an empty string, not an absent field: this is how a player CLEARS a name,
    // and the server's sanitize reads it as null exactly as it reads junk. The
    // skin has no such hole — 0 IS a hull — so it is sent as the number it is.
    ws.send(JSON.stringify({ v: NET_V, ui: "name", name: nameSent || "", skin: skinSent }));
  }
  // the editor's ONE way out to the wire, and closeNameEdit above is its only
  // caller — a name reaches the server because a player finished typing it,
  // never because a card went away. Local play leaves this null.
  sendName = (next) => {
    if (next === nameSent) return;
    nameSent = next;
    pushIdentity();
  };
  // ...and the picker's, on the same terms and through the same gate.
  sendSkin = (next) => {
    if (next === skinSent) return;
    skinSent = next;
    pushIdentity();
  };

  // ---- helpers ---------------------------------------------------------------
  const lerp = (a, b, k) => a + (b - a) * k;
  // angle lerp through the wrapped difference — no ±π seam
  const alerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

  // Keep the first tick in a RAF intact, then fold any catch-up tail into the
  // second slot. Deltas and fire edges accumulate; world points and held state
  // describe the newest sample. The server's two-frame clamp remains the hard
  // abuse boundary even if a client bypasses this queue.
  function mergeInputFrames(older, newer) {
    return {
      tx: older.tx + newer.tx, ty: older.ty + newer.ty,
      ax: older.ax + newer.ax, ay: older.ay + newer.ay,
      cx: newer.cx, cy: newer.cy,
      // ap ORs: a press that happened in EITHER merged frame happened, and a
      // mask is the only shape that merges correctly — the old fp COUNT summed,
      // which for ability ids 2 and 3 would have produced ability 5.
      ap: (older.ap | 0) | (newer.ap | 0),
      // ah takes the NEWEST, the fh/kx/ky rule: held is a LEVEL, not an event,
      // and the newest sample is what the buttons are actually doing.
      ah: newer.ah | 0,
      kx: newer.kx, ky: newer.ky,
      // the NEWEST view tick wins, the fh rule — and when neither frame
      // carries one the key stays undefined, which JSON drops: absence
      // survives the fold as absence
      vt: newer.vt !== undefined ? newer.vt : older.vt,
      // ...and the THRUST FRAME takes the NEWEST too — the `ah` rule, because a
      // mode is a LEVEL and not an event. It is deliberately NOT vt's rule: an
      // older frame's `screen` must not survive a newer frame that carries no
      // mode, because carrying no mode IS a statement (it means `ship`). Read
      // the newest's key straight through and absence folds to absence.
      tf: newer.tf,
    };
  }

  function appendInputFrame(out, f) {
    if (out.length < 2) out.push({ ...f });
    else out[1] = mergeInputFrames(out[1], f);
  }

  function gapP95() {
    if (!snapGaps.length) return 0;
    const sorted = snapGaps.slice().sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
  }

  // ---- the ADAPTIVE presentation buffer -------------------------------------
  // The buffer exists to hide ARRIVAL JITTER, not transport delay: a snapshot
  // that arrives late by more than the presented clock's own step is what makes
  // the presented world starve. So the target depth is the jitter EXCESS over
  // the nominal 60 Hz tick, in ticks, plus one tick of bracket:
  //
  //     want = clamp(ceil((gapP95 - TICK) / TICK) + 1, DELAY_MIN, DELAY_MAX)
  //
  // On a clean link gapP95 sits at the tick itself and want falls to 1 — a
  // third of v4's fixed cost, paid straight back to rows 5 and 6. On d250j20 it
  // settles near the old 3. The estimate is CACHED (gapP95 sorts a 300-element
  // copy; it may never run per presented tick) and the target SLEWS toward want
  // by DELAY_SLEW per presented tick, so no single late packet moves the
  // presented clock. A resync empties the gap ring; the target then holds its
  // current value until DELAY_MIN_SAMPLES arrivals have refilled it, which is
  // re-convergence rather than a jump.
  // the recompute, on the ARRIVAL cadence — the one place gapP95 is allowed to
  // sort. Called from onSnapshot for accepted arrivals only, which is the same
  // rule snapGaps itself is pushed under: the starvation guard is never fed by
  // this estimate and never fights it.
  function refreshJitter() {
    gapsSinceCalc += 1;
    if (snapGaps.length < DELAY_MIN_SAMPLES || gapsSinceCalc < GAP_RECOMPUTE) return;
    jitterEst = gapP95();
    jitterValid = true;
    gapsSinceCalc = 0;
  }
  // ...and the PURE read, safe to call from stats() or from every presented
  // tick: it sorts nothing and mutates nothing
  function wantedDepth() {
    if (!jitterValid) return null; // nothing measured yet, or a resync emptied
                                   // the ring — the target holds where it is
    const excess = Math.ceil((jitterEst - TICK) / TICK);
    return Math.max(DELAY_MIN, Math.min(DELAY_MAX, (excess > 0 ? excess : 0) + 1));
  }
  // called once per PRESENTED tick, from present()
  function slewDepth() {
    const want = wantedDepth();
    if (want === null) return;
    const d = want - delayTarget;
    if (Math.abs(d) <= DELAY_SLEW) delayTarget = want;
    else delayTarget += d > 0 ? DELAY_SLEW : -DELAY_SLEW;
    delayTarget = Math.max(DELAY_MIN, Math.min(DELAY_MAX, delayTarget));
  }
  // THE reader every consumer of the old DELAY_TICKS constant now goes through
  const delayTicks = () => delayTarget;

  // ---- THE DECODED BODY'S STATS ARE RETIRED (S3b lane 3, commit D4) --------
  // This cache read `Encounter.statsFor(wave)` — production's per-wave stat
  // table — and stamped every decoded body with it, because the client's own
  // draws (`drawAnvil`, the edge arrows) and its overshoot guard read it. D9
  // replaced the roster and commit D4 deleted the table, so there is nothing
  // to read and, after commit D2, nothing on this side that reads it.
  //
  // WHAT A DECODED BODY IS NOW, stated plainly because it is a KNOWN LIE and
  // not an oversight: the wire has no row for the successor plane's twenty-one
  // types, so every one of them arrives as `ty: -1`, decodes as "dart" and
  // falls into the `seek` policy. `?mp` IS UNDEPLOYABLE until R7 ships wire
  // v11 — the program's standing fact — and SOLO is the shipped surface. The
  // decode is left INTACT rather than gutted so R7 has one place to re-cut: it
  // is the round that gives those types real rows, and the stats they carry
  // will come from the same declaration the codec is compiled from.
  //
  // THE FALLBACKS BELOW ARE THEREFORE LIVE, and each says what it stands in
  // for: a body's RADIUS and its speed CEILING.
  // THE FALLBACKS ARE RETIRED (r7a commit 6). BODY_R_FALLBACK was "the old
  // dart's radius" and every decoded body wore it, because no body's KIND
  // reached the client. The kind reaches it now, so a body's radius is ITS OWN:
  // the kernel publishes its whole STATS table (js/demo-kernel.js's API), the
  // page loads the kernel, and `bodyStats` below reads the row the wire named.
  //   BODY_CAP_FALLBACK was the speed CEILING the decode guard bounds a pose
  // with — "the old charger dash", one number for every body. It is per kind
  // now, and the HEADROOM is derived from the number it replaces rather than
  // invented: 12.5 px/tick against the kernel roster's fastest body (152 px/s =
  // 2.53 px/tick) is 4.9x, so CAP_HEADROOM 5 keeps that generosity FOR EACH
  // KIND instead of granting the whole roster the fastest body's allowance.
  // A sanity bound should be generous enough never to clip an honest pose and
  // tight enough to refuse a decode that has gone wrong; per kind it is both.
  const BODY_R_UNKNOWN = 20;       // px — a body whose kind the table does not
                                   // know. It is drawn, not dropped, and it is
                                   // the ONLY caller left of a default radius.
  const CAP_HEADROOM = 5;
  const kernelStats = () => (window.DemoKernel && window.DemoKernel.STATS) || null;
  const bodyStats = (kind) => {
    const T = kernelStats();
    const row = T && kind ? T[kind] : null;
    return row || { r: BODY_R_UNKNOWN, speed: BODY_R_UNKNOWN * 7.5 };
  };

  function blastRadiusNow() {
    if (blastIndex < 0) blastIndex = enc().shopInfo().findIndex((r) => r.name === "BLAST CHARGE");
    // the LOCAL seat's decoded rank sizes the fx. Another seat's wider splash
    // still renders at the local rank until the event carries its shooter's.
    const S = enc().E.seats[localSeat()];
    const rank = blastIndex >= 0 && S ? S.owned[blastIndex] : 0;
    return rank > 0 ? BLASTR + BLASTGAIN * (rank - 1) : BLASTR;
  }

  // ---- the socket ------------------------------------------------------------
  function connect() {
    ws = new WebSocket(url);
    // v11 SENDS THE SNAPSHOT AS BINARY (R0.1). Without this a browser hands a
    // binary frame to the message listener as a Blob — asynchronous, and
    // nothing downstream is written to await one — so the whole snapshot plane
    // would go quiet with no error anywhere. Everything OTHER than the snapshot
    // stays JSON text (R0.2) and the listener branches on typeof.
    ws.binaryType = "arraybuffer";
    ws.addEventListener("open", () => {
      // the stored name rides the hello, and the server sets it BEFORE the
      // grant — so the very first roster this room fans out already carries it.
      // Omitted entirely when there is nothing stored: an absent field is the
      // honest shape for "this visitor has never typed one", and the server's
      // type gate reads it as absent either way.
      const hello = { v: NET_V, hello: true };
      const boot = storedName();
      if (boot) hello.name = boot;
      // the hull rides the hello unconditionally, because 0 is a real answer
      // and not an absence — there is no "nothing stored" hull the way there is
      // a nothing-stored name, and omitting it would only make the server's
      // fold the client's contract instead of its own guard.
      hello.skin = ownSkin;
      ws.send(JSON.stringify(hello));
      helloed = true;
      note("NET connected — " + url);
    });
    ws.addEventListener("message", (m) => {
      // THE ONE SITE THAT BRANCHES ON THE WIRE'S TWO FORMS (R0.2). The
      // SNAPSHOT is binary from v11; `you`, `pong`, `claim` and the `tune` echo
      // stay JSON TEXT, because non-snapshot traffic is 0.826 % of messages and
      // 0.00186 % of bytes and a codec for it would buy nothing. A string is
      // parsed, anything else is decoded — and nothing downstream of here can
      // tell which arrived.
      let s;
      if (typeof m.data === "string") {
        try { s = JSON.parse(m.data); } catch { return; }
      } else {
        try { s = Wire.decode(new Uint8Array(m.data)); } catch { return; }
      }
      if (!s) return;
      // A WRONG VERSION IS TERMINAL, not a silent drop (R4.7). Until R7 this
      // read `if (!s || s.v !== NET_V) return;` and a client one bump behind
      // sat on a live socket presenting a frozen world, with no message and no
      // log — the quietest failure on the wire. The 4001 close already says the
      // true thing for a stale HELLO; this says it for a stale SNAPSHOT, in the
      // same words and on the same terminal flag, because retrying cannot help:
      // only new code can.
      if (s.v !== NET_V) {
        if (!versionDead) {
          versionDead = true;
          note("NET new version — refresh the page", true);
          try { ws.close(4001, "version"); } catch {}
        }
        return;
      }
      // `you` first: the identity envelope carries a tick too (the sim tick at
      // send — a lobby fact, stamped, never a sim event), so a tick-shaped gate
      // ahead of it would swallow the one message that says who this client is
      if (s.you) { onYou(s.you); return; }
      if (s.pong !== undefined) { onPong(s.pong); return; }
      // the server's answer to an ask it could not fill. It is the ONLY way
      // this client can learn the seat it was promised is gone: the refusal
      // path sends no `you`, and the one the pre-start door does send says
      // `seat: null` — which onYou drops as a no-change, because a seatless
      // client being re-told it is seatless is what sendYouAll does on every
      // match epoch. Without this the card kept saying "a released seat is
      // open, not lost" at a seat somebody else was already flying.
      if (s.claim !== undefined) { refused = true; return; }
      if (!Number.isFinite(s.tick)) return;
      if (Number.isFinite(s.a) && s.a > lastAck) lastAck = s.a;
      onSnapshot(s);
    });
    ws.addEventListener("close", (e) => {
      helloed = false;
      // the identity died with the socket. Forgetting it is what makes the
      // rejoin's `you` read as a CHANGE — otherwise a reconnect that landed on
      // the same seat and epoch would skip the teardown and keep sequencing
      // from a number the server's fresh namespace has never heard of.
      mySeat = null;
      mySeatEpoch = -1;
      myMatchEpoch = -1;
      // ...and so did the roster. A room this client can no longer see is not
      // a room it may keep reporting, and forgetting it makes the rejoin's
      // first `you` a change on both counts rather than only the identity.
      // The NAMES are the roster's third field and go with the other two, for
      // that same reason and one more: they are the only roster value that is
      // drawn on the FIELD rather than in the banner, so a set kept here would
      // leave a frozen board labelled with the pilots of a room this client has
      // been disconnected from. Nothing depends on the clear — the identity
      // reset above forces the next `you` through the assignment either way —
      // so it is here to keep the sentence above true of every line under it.
      rosGranted = -1;
      rosMax = -1;
      rosStarted = false;
      seatNames = [];
      seatHand = null;   // ...and the hand and its bits, for the reason above
      seatBought = null; // and one more: the shelf is a SEAT's, and a socket
                         // that has lost its seat is holding a shelf it may not
                         // spend. Back to NULL, not [] — see the declaration
      seatSkins = []; // ...and the hulls with them, for the identical reason:
                      // they are drawn on the FIELD, and a set kept here would
                      // leave a frozen board wearing the hulls of a room this
                      // client can no longer see
      released = false; // ...the latch goes with it. A dropped socket is not a
                        // released seat — the rejoin asks for one like any fresh
                        // client, and a latch that survived the close would show
                        // the reclaim card to a socket with nothing to reclaim.
      refused = false;  // ...and so does the refusal it may have collected: the
                        // rejoin's ask is a new question to a room that has had
                        // a reconnect backoff's worth of time to change.
      ntick = 0;
      lastAck = 0;
      if (intentional) return; // the client hung up on purpose — stay down
      if (e.code === 4001) {
        // version mismatch is terminal by contract: retrying re-sends the
        // same stale hello forever, so the ONLY way forward is new code
        versionDead = true;
        note("NET new version — refresh the page", true);
        return;
      }
      // the 1012 path (SIGTERM: the server restarted, this match is over) and
      // every abnormal close (1006 …) auto-reconnect with capped backoff. The
      // rejoin asks for a seat like any fresh client, and that ask can now be
      // ANSWERED mid-match: the server holds a dropped socket's seat for a short
      // grace and offers it back through openSeat, so a refresh inside the window
      // gets the same seat with the same ship. It is not a reservation — there is
      // no token and no identity behind it, so whoever asks first inside the
      // window takes it — and past the window the seat has left the field and the
      // rejoining client spectates until something reopens the room.
      if (e.code === 1012) note("NET server restarted — match ended — reconnecting…", true);
      else note("NET disconnected (" + e.code + (e.reason ? " " + e.reason : "") + ") — reconnecting…", true);
      scheduleReconnect();
    });
    ws.addEventListener("error", () => {
      note("NET connection error — retrying…", true);
    });
  }

  // capped exponential backoff: 1 s, 2 s, 4 s, 8 s, then 10 s forever. The
  // exponent resets when a snapshot is ACCEPTED, not when a socket opens — an
  // open that dies before the first snapshot must not reset the clock.
  function scheduleReconnect() {
    if (reconnectTimer || versionDead || intentional) return;
    const delay = Math.min(10_000, 1000 * Math.pow(2, Math.min(attempts, 4)));
    attempts += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      resync();
      reconnects += 1;
      connect();
    }, delay);
  }

  // a rejoin is a fresh stream: the old buffer, pending cues, carries and the
  // presented clock all describe a match that no longer exists. pt returns to
  // -1, so the first snapshot after the rejoin renders immediately, exactly
  // like the first snapshot of a fresh page.
  function resync() {
    buf.length = 0;
    evq.length = 0;
    bCarry.clear(); // the streak's two derived numbers describe rounds of the
                    // match that just died, and the server reissues ids from 1
    clearDerived(); // ...and so do the derived stores: an id is a handle inside
                    // ONE match, and a derived round that outlived the cut would
                    // keep flying on a heading from a match that is over
    pendingInputs.length = 0;
    snapGaps.length = 0;
    // the jitter estimate described the stream that just died, so it stands
    // down — but delayTarget KEEPS its value and re-converges from wherever it
    // was once the ring refills. Resetting it to a constant here would make a
    // rejoin jump the presented clock, which is the one thing the slew exists
    // to prevent.
    jitterValid = false;
    gapsSinceCalc = GAP_RECOMPUTE;
    pt = -1;
    ptPrev = -1;
    vtDrawn = -1; // the record described frames of the match that just died —
                  // a fresh identity's first stamps must claim nothing until
                  // the loop has rendered the new stream
    stale = 0;
    lastOwnedSum = -1;
    lastSnapAt = -1;
    lastSnapGap = 0;
    starveRun = 0;
    predReset(); // the predicted state described the stream that just died
  }
  connect();

  // ---- identity --------------------------------------------------------------
  // ANY change to the IDENTITY in `you` tears the input state down (the roster
  // beside it does not — see below). Not only the epochs: a seat
  // change alone means every frame still queued describes another ship. The
  // SEQUENCE resets only when (seat, seatEpoch) moves, because that pair is
  // what the number is namespaced by — a bare match-epoch change leaves the
  // namespace intact, and rewinding n there would look like a replay attack to
  // the server's duplicate gate.
  //
  // The ROSTER rides the same message and is read here too, but it is a LOBBY
  // fact, not an identity: when only it moves, the banner repaints and nothing
  // else stirs — no teardown, no resync, and youChanges does not count it,
  // because that counter means "the server re-issued who I am". The fields are
  // ADDITIVE on a non-snapshot message, and they landed with NET_V 7 — the bump the
  // AFK unseat made for its conditional per-seat key. They were written for 6
  // with no bump, to spare every already-open client the terminal 4001 a
  // mismatch answers with; the bump beside them spent that anyway, and with it
  // the deploy window the -1 = UNKNOWN reading below was built for. A client on
  // this version only ever talks to a server that sends the roster.
  function onYou(you) {
    // ---- THE KEY LIST OF THE MESSAGE, RECORDED BEFORE ANYTHING READS IT ----
    // (r7c FIX F12.) A read-only record of WHICH FIELDS the last `you` carried,
    // published on `Net.stats()`. It exists because an instrument that asks
    // "did the server send the market hand?" was answering through
    // `Net.hand()`, and an ACCESSOR can only report what it decoded — its
    // null/[] distinction is a convention this file chose, not the message.
    // The key list is the message itself, so a leg over it cannot be softened
    // by a later change to how an absent field folds.
    //   IT IS SET AT THE TOP, ABOVE THE EARLY RETURN, so a `you` the guard
    // discards is recorded exactly like one that repaints — "what did the
    // server last send" is not the same question as "what changed".
    lastYouKeys = Object.keys(you);
    const seat = Number.isInteger(you.seat) ? you.seat : null;
    const seatEpoch = Number.isInteger(you.seatEpoch) ? you.seatEpoch : -1;
    const matchEpoch = Number.isFinite(you.matchEpoch) ? you.matchEpoch : -1;
    // both counts must be present and sane, or the roster reads as UNKNOWN —
    // a half-decoded roster would print a half-true banner, which is worse
    // than the honest old one. DEFENSIVE, and knowingly unreachable on a live
    // wire: the only server that answers a v8 hello sends all three fields on
    // every `you`, and an older one closes this client at 4001 before a `you`
    // can arrive. It stays because that is the honest shape for an additive
    // field and it costs one comparison — do not go looking for the deploy path
    // that reaches it, there is not one.
    const hasRoster = Number.isInteger(you.granted) && you.granted >= 0 &&
      Number.isInteger(you.maxSeats) && you.maxSeats > 0;
    const granted = hasRoster ? you.granted : -1;
    const maxSeats = hasRoster ? you.maxSeats : -1;
    const started = hasRoster && you.started === true;
    // the names, re-sanitized on arrival. NOT because the server is doubted —
    // it is the authority and this array is the only thing that ever reaches a
    // screen — but because a decode that trusts a shape it did not check is how
    // a stray object ends up as "[object Object]" on somebody's scoreboard row.
    // A non-array reads as no names at all, which is the same UNKNOWN the two
    // counts fall back to and draws exactly the pre-name board.
    const nextNames = Array.isArray(you.names) ? you.names.map(cleanName) : [];
    // ...and the hulls, on the same terms and with one difference the shapes
    // force: an entry may be null (nobody is flying that seat), so the fold to
    // hull 0 runs only on the entries that are NOT null. Collapsing null to 0
    // here would tell the board an empty seat had chosen a hull.
    const nextSkins = Array.isArray(you.skins)
      ? you.skins.map((v) => (v === null || v === undefined ? null : cleanSkin(v)))
      : [];
    const identitySame = seat === mySeat && seatEpoch === mySeatEpoch &&
      matchEpoch === myMatchEpoch;
    const rosterSame = granted === rosGranted && maxSeats === rosMax &&
      started === rosStarted;
    // ...and the names are the roster's third count for this purpose: a change
    // here is a LOBBY change, so it reaches the early return and nothing else.
    // The teardown below keys on IDENTITY alone — seat, seatEpoch, matchEpoch —
    // so a `you` that carries only a new name can never clear the input ring,
    // reset the sequence or resync the buffer. That is the whole reason a name
    // is allowed to ride this message at all.
    const namesSame = nextNames.length === seatNames.length &&
      nextNames.every((v, i) => v === seatNames[i]);
    // ...and the hulls are the roster's FOURTH count, held to the same rule: a
    // change here is a LOBBY change and reaches the early return and nothing
    // else. Folded in beside namesSame rather than given a paragraph of its own
    // because the two are one identity and every reader below treats them so.
    // ...and D37's MARKET HAND is the roster's FIFTH count, on exactly the same
    // rule. THE BILL THAT STOOD HERE IS PAID (R7 / r7c commit 5, S-0cg7r2). It
    // read, in full: "(R7 BILL) ...and D37's MARKET HAND is the roster's FIFTH
    // count, on exactly the same rule (PORT-S S7) ... Nothing to compare yet —
    // the wire has no hand at v10." The wire has one at v11.
    //   A fresh hand is a LOBBY change: it reaches the early return and nothing
    // else, and a hand that changed while this guard ignored it would be a
    // reroll the panel never drew. IT CARRIES NO TEARDOWN, for exactly the
    // reason the names do not — the identity triple alone decides that, which
    // is the whole reason a name (and now a hand) is allowed on this message —
    // so a `you` that brings only a new hand can never clear the input ring,
    // reset the sequence or resync the buffer.
    //   NULL-SAFE on BOTH sides, because null is a value here and not an
    // absence to fold away: two nulls are the same, a null and an array are
    // not, and that difference is what an oracle over this accessor reads.
    const arrSame = (a, b) => (a === null || b === null) ? a === b
      : a.length === b.length && a.every((v, i) => v === b[i]);
    const nextHand = Array.isArray(you.hand) ? you.hand.map((v) => v | 0) : null;
    const nextBought = Array.isArray(you.bought) ? you.bought.map((v) => (v ? 1 : 0)) : null;
    const handSame = arrSame(nextHand, seatHand) && arrSame(nextBought, seatBought);
    const skinsSame = nextSkins.length === seatSkins.length &&
      nextSkins.every((v, i) => v === seatSkins[i]);
    if (identitySame && rosterSame && namesSame && skinsSame && handSame) return;
    rosGranted = granted;
    rosMax = maxSeats;
    rosStarted = started;
    seatNames = nextNames;
    seatSkins = nextSkins;
    seatHand = nextHand;
    seatBought = nextBought;
    // ...and this client's OWN copy follows the server's answer for its own
    // seat. The server's sanitize is the only one that reaches a screen, and
    // the claim card draws from ownName rather than from a row it does not
    // have — without this it would keep showing what was typed instead of what
    // was accepted. A `you` that names nobody leaves the last accepted name
    // standing: a seatless roster is silence about this client, not a clear.
    if (Number.isInteger(seat) && seat >= 0 && seat < seatNames.length &&
        seatNames[seat]) ownName = seatNames[seat];
    // ...and the hull follows the server's answer for this client's own seat on
    // the same terms. The null test is NOT the name's truthiness test: hull 0 is
    // a real answer and `seatSkins[seat] &&` would refuse to ever adopt it.
    if (Number.isInteger(seat) && seat >= 0 && seat < seatSkins.length &&
        seatSkins[seat] !== null && seatSkins[seat] !== undefined) ownSkin = seatSkins[seat];
    if (identitySame) { noteIdentity(); return; } // a seat arrived, the door shut, or somebody named themselves
    const namespaceMoved = seat !== mySeat || seatEpoch !== mySeatEpoch;
    const matchMoved = matchEpoch !== myMatchEpoch;
    // the release latch, set on the EDGE. A `you` that takes a real seat away is
    // this client being unseated; a seatless client re-told it is seatless
    // changes nothing — sendYouAll fires on every match-epoch change, and a
    // spectator must not acquire a release it never had.
    //   It is NOT cleared here, and the grant is exactly the wrong edge to clear
    // it on. `you` carries IDENTITY and says nothing about the field, and the
    // case that matters is the one where nothing else does either: solo, the
    // lapse that parked the seat was the room's last, so it went to roomReset
    // and the loop is STOPPED when the reclaim click's grant comes back. No
    // snapshot follows it, and the seat record this client is holding is still
    // the corpse it was released as —
    // hull 0, rsp 0, cl -1. Clear the latch there and SEAT RELEASED stops
    // matching while no other overlay branch starts, and the player is left
    // staring at a blank field until a second, unprompted click. That is
    // absentCardLine's own "real and invisible, which is the worst of both",
    // reintroduced by the fix for it. Nor can the server paper over it: a
    // one-off snapshot from the grant would carry room.tick, which is the tick
    // the last broadcast already used, and onSnapshot drops it as stale.
    //   So the latch is spent by EVIDENCE instead — see the apply below. The
    // card stays up across the grant, which is honest: its copy invites a click,
    // and the click a seated socket sends is the first active frame, which is
    // what starts the round and makes snapshots flow. The card then clears
    // itself the moment real state arrives.
    if (seat === null && mySeat !== null) released = true;
    // ...and a refusal is spent by the GRANT, which is the only edge it needs.
    // A refusal can only be collected while seatless — handleClaim answers
    // nothing to a socket that is already flying — and the only way out of
    // seatless is this line, so a fresh release can never inherit an old
    // refusal to begin with. Clearing it here rather than beside `released`
    // above because it is the SEAT arriving that spends it, not the card's own
    // state: the promise was kept.
    if (seat !== null) refused = false;
    mySeat = seat;
    mySeatEpoch = seatEpoch;
    myMatchEpoch = matchEpoch;
    youChanges += 1;
    pendingInputs.length = 0;
    // the FULL input teardown: ring AND accumulator. The old code cleared
    // only the ring, so a partial tick's accumulated deltas survived an
    // identity change into the next seat's first banked frame — the phase-11
    // leak fix. clearTickInput is game.js's own boundary clear (it also
    // snaps seat 0's sim cursor through the render camera, which is correct
    // here: this IS the client boundary).
    clearTickInput();
    predReset(); // a new identity predicts nothing until its first snapshot
    if (namespaceMoved) { ntick = 0; lastAck = 0; }
    if (matchMoved) resync(); // the buffer, the cues and the presented clock all
                              // describe a match that no longer exists
    noteIdentity();
  }

  // The corner banner's identity line, composed from the state above so that a
  // roster-only `you` repaints through the SAME arithmetic an identity change
  // does. Two audiences:
  //
  //   seated     — "how many of us are here, and can anyone still join?" The
  //                count is seats HELD — sockets actually behind seats — and
  //                the ceiling is what THIS room can still deal: MAX_SEATS
  //                before the start, the match's own seat range after it. The
  //                server derives both (see youMessage); this end prints them.
  //                A seat whose socket closed drops out of the count as soon as
  //                the next `you` goes out, which is what makes the line honest
  //                now that a seat can be given up and taken by somebody else.
  //   SPECTATING — the one state a player can land in and not understand. It
  //                says why in plain words, in the server's own refusal order
  //                (a running match beats a full roster), so the answer to
  //                "why can't I fly?" is on screen rather than in a log — but
  //                only ever as far as THIS roster proves. Hence three cases,
  //                not two: started, then granted >= maxSeats, and then the
  //                leftover, seatless while the door is demonstrably open.
  //                That third one is real: roomReset clears every seat and
  //                re-grants in a SECOND pass, and each grant fans `you` out
  //                to everyone, so a socket still awaiting its turn in that
  //                pass is handed granted 1 of 4, not started, no seat. The
  //                old two-branch text called that a full house while the very
  //                next clause would have counted 1. It rights itself a grant
  //                later, but a banner whose whole job is an honest answer may
  //                not fill the gap with a guess — so the third line names the
  //                gap and promises nothing.
  //
  // Without a roster it prints exactly what it printed before the roster
  // existed. That branch is the defensive one onYou describes: no live server
  // this client will ever reach omits the fields, so it is kept for the shape
  // of an additive read rather than for a case a deploy can still produce.
  function noteIdentity() {
    const known = rosGranted >= 0 && rosMax > 0;
    if (mySeat === null) {
      let why = "";
      if (known) {
        why = rosStarted
          ? " — the match already started, so no seat was dealt"
          : rosGranted >= rosMax
            ? " — all " + rosMax + " seats are taken, so no seat was dealt"
            : " — no seat was dealt yet; the roster is still settling";
      }
      note("NET spectating — match " + myMatchEpoch + why, true);
      return;
    }
    const roster = known
      ? " — " + rosGranted + " of " + rosMax + " seated — " +
        (rosStarted ? "match running" : "waiting")
      : "";
    note("NET seat " + mySeat + " — match " + myMatchEpoch + roster, false);
  }

  // ---- app-level RTT ---------------------------------------------------------
  function onPong(t) {
    if (!Number.isFinite(t)) return;
    const r = performance.now() - t;
    if (!(r >= 0)) return; // a clock that ran backwards measures nothing
    pongs += 1;
    if (rttLast >= 0) {
      const d = Math.abs(r - rttLast);
      rttJitter = rttJitter < 0 ? d : rttJitter + (d - rttJitter) * RTT_ALPHA;
    }
    rttLast = r;
    rtt = rtt < 0 ? r : rtt + (r - rtt) * RTT_ALPHA;
    rttMin = rttMin < 0 ? r : Math.min(rttMin, r);
  }
  const pingTimer = setInterval(() => {
    if (ws && ws.readyState === 1 && helloed) {
      ws.send(JSON.stringify({ v: NET_V, ping: performance.now() }));
    }
  }, PING_MS);

  // ---- inbound: buffer with newest-wins -------------------------------------
  function onSnapshot(s) {
    // the epoch gate: a snapshot from a match this client was not told about is
    // another run's state. It stands down until the first `you` arrives, and a
    // server that sends no `me` at all (the test seam's injected snapshots) is
    // simply not gated — the gate closes on DISAGREEMENT, never on absence.
    if (myMatchEpoch >= 0 && Number.isFinite(s.me) && s.me !== myMatchEpoch) {
      epochDrops += 1;
      return;
    }
    // ---- THE HEADER'S TWO FLAGS (R2.5) ---------------------------------
    // `resync` says this socket's cursor fell past the ring's oldest entry, so
    // there is a HOLE in its reliable stream that no partial replay can repair;
    // `full` says the snapshot carries EVERY live round and orb, which is the
    // repair. They arrive together on the overflow path and `full` arrives alone
    // on a joiner's first snapshot.
    //   The resync is taken BEFORE the newest-wins gate below, because the whole
    // point of it is that the stream this client was following is gone.
    if (s.resync) {
      evStats.resyncs += 1;
      resync();
    }
    if (s.full) evStats.fulls += 1;
    const newest = buf.length ? buf[buf.length - 1].tick : -1;
    if (s.tick <= newest) {
      // a stale clump: TCP delivered a burst after loss and an older snapshot
      // arrived behind a newer one — the newer state already superseded it
      stale += 1;
      return;
    }
    const arrivedAt = performance.now();
    if (lastSnapAt >= 0) {
      lastSnapGap = arrivedAt - lastSnapAt;
      snapGaps.push(lastSnapGap);
      if (snapGaps.length > GAP_WINDOW) snapGaps.shift();
    }
    lastSnapAt = arrivedAt;
    refreshJitter(); // the adaptive buffer's estimate moves on the ARRIVAL
                     // cadence, never per presented tick
    buf.push(s);
    if (buf.length > BUF_MAX) buf.shift();
    snaps += 1;
    attempts = 0; // the stream is live again — the backoff clock starts over
    // v11 (R2.2): an entry is stamped with the EVENT's own tick, not the
    // snapshot's. A replayed reliable event arrives on a later snapshot than the
    // one it happened on, and stamping it with `s.tick` would fire it late.
    for (const e of s.events || []) {
      evq.push({ tick: e.t !== undefined ? e.t : s.tick, e, rel: isReliable(e.k) });
    }
    // a paused client stops presenting but keeps receiving — the pending
    // event list must not grow for as long as a pause lasts, and a resume
    // must not replay minutes of cues in one burst.
    //   ...AND THE TRIM DROPS COSMETIC ENTRIES ONLY (R2.9). The server's
    // exactly-once guarantee ends at `ws.send`; this queue is the client's own
    // drop point and it must not undo it. A dropped `fire` is a missed spark; a
    // dropped `death` is a hull that never blew up, and since the ballistic
    // split a dropped `roundSpawn` is a round that never appears at all. The
    // blind `splice(0, n)` that stood here could take either.
    if (evq.length > 300) {
      let over = evq.length - 300;
      for (let i = 0; i < evq.length && over > 0; i++) {
        if (evq[i].rel) continue;
        evq.splice(i, 1);
        i -= 1;
        over -= 1;
        evStats.cosmeticDropped += 1;
      }
      // ...and if the queue is 300 RELIABLE entries deep there is nothing left
      // to drop. It grows rather than losing one, which is the honest failure:
      // a reliable backlog that large means the presented clock has stalled, and
      // the resync path is what repairs that.
      evStats.reliableHeld = evq.length > 300 ? evq.length - 300 : 0;
    }
    // the first snapshot renders immediately — a one-frame snap beats a black
    // screen; the presented clock then slews back to the buffer depth
    if (pt < 0) pt = s.tick;
    // the predictor rebases at ARRIVAL on the newest accepted snapshot —
    // the stale gate above guarantees s is newest, and lastAck was consumed
    // off this very envelope before onSnapshot ran
    rebase(s);
  }

  // ---- the view-tick record (phase 4 — the vt honesty fix) -------------------
  // Called by game.js's buildFrameView, ONLY from the loop's own render (the
  // LOOP_RENDER gate there): the render reports the effective presented tick
  // this frame draws for the REMOTE bodies, and the stamp below reads it back.
  // Per the alpha scheme documented above buildFrameView, the interpolated
  // bodies show the OLDER end of the presented pair led by alpha — in this
  // file's clocks, lerp(ptPrev, pt, alpha) — while a live-branch frame
  // (alpha 1, or the FRAME_BYPASS seam) draws the applied world at pt itself.
  // Production-cheap by design: two scalar reads, one floor, one scalar write,
  // no allocation — never Net.stats(), whose object build is why the probe's
  // drawn.pt is armed-only.
  function noteDrawn(alpha, live) {
    if (pt < 0) { vtDrawn = -1; return; } // pre-first-snapshot: not a view claim
    const base = ptPrev >= 0 ? ptPrev : pt; // one applied world so far — no pair to span
    vtDrawn = Math.floor(live ? pt : base + (pt - base) * alpha);
  }

  // ---- the per-tick client boundary (called from game.js's loop) ------------
  function clientTick() {
    refreshPointerWorld();
    if (INPUTMODE === "tick") bankTickInput();
    const f = in0.ring.shift();
    in0.ring.length = 0; // net mode never queues a backlog — the wire is the delay
    if (f) {
      // the zero-lag sim cursor: the camera's aim lead and fireDir read seat
      // 0's scur, and in net mode this tick's banked world point IS the
      // current cursor
      in0.scur.x = f.cx;
      in0.scur.y = f.cy;
      // the view-tick stamp, phase-4 honest form: vtDrawn is the tick the
      // LAST RENDERED frame actually showed for the remote bodies — recorded
      // by render() itself (noteDrawn above; the alpha scheme on game.js's
      // buildFrameView is the contract), so what was on screen when the
      // button went down is what the frame claims. floor(pt) — the phase-15
      // stamp — is WRONG since phase 3: the interpolated bodies draw at
      // (tick − 1) + alpha of the presented clock, so pt overstates the view
      // by up to one tick and the server's fire-time rebate would rewind
      // short. OMITTED while vtDrawn < 0: pre-first-render frames start the
      // match and claim nothing (the old pt < 0 guard's spirit, kept).
      // A catch-up burst stamps every frame with the SAME record — all of
      // those inputs were made while that one frame stood on screen.
      if (vtDrawn >= 0) f.vt = vtDrawn;
      appendInputFrame(pendingInputs, f);
      // the INCREMENTAL prediction: the tick this frame describes, run now —
      // one kernel tick with cues live (the fire bit may fire the speculative
      // tracer, the comet press bit answers the comet cue). The next rebase's replay
      // re-derives the same window from the acked base and corrects.
      if (predOn && !predIdle && mySeat !== null) {
        const terms = predTerms();
        if ((f.ap | 0) & AB_COMET) {
          // the comet CUE answers THE arm rule — js/game.js's Flight.cometOn,
          // the one copy the sim and the HUD dim also call — on predicted
          // state. `press` is passed `true` because this block runs only on the
          // frame's own PRESS BIT, which is a fact and no longer a rise this
          // file has to reconstruct. There is no prevRh any more, and so no
          // hardSnap re-seed for it either: a button held straight through
          // death sets no bit at respawn, because no press was made. These are
          // telemetry counters; the halo reads predK.
          if (Flight.cometOn(predK.comet, predK.energy, predK.energyMax, true)) spec.cometCueShown += 1;
          else spec.cometRefused += 1;
        }
        predTick += 1;
        predTickK(predK, [f], terms, true);
        recordLocal(predK, predTick);
      }
    }
    stepImpacts(); // fx bursts age on the presented clock — the sim never steps here
    stepShipFx();  // ...and the ship blasts with them, on that same clock
    present();
    predPresentTick(); // the offset decays and the tracers age per presented tick
    if (predOn && mySeat !== null) {
      // the presented OWN pose: predicted state plus the render offset —
      // written AFTER present() so it stands whatever branch applied, and
      // the camera/aim/flame all read it from the same player struct
      const P = players[mySeat];
      if (P) {
        P.ship.x = predK.ship.x + off.x;
        P.ship.y = predK.ship.y + off.y;
        P.vel.x = predK.vel.x;
        P.vel.y = predK.vel.y;
        P.flame.x = predK.flame.x;
        P.flame.y = predK.flame.y;
      }
    }
  }

  // Frames go up SEAT-AGNOSTIC — the server binds each one to the socket's own
  // seat — but they are SEQUENCED and stamped with the seat epoch, which is the
  // namespace the server's resolved-ack runs in. A spectator sends nothing at
  // all, and so does a client whose grant has not landed yet.
  function flushInputs() {
    if (mySeat === null) {
      // A spectator still sends NO input — there is no seat epoch to sequence
      // it in and the server would drop it at the demux — but a CLICK is the
      // one thing it may say, and decision 2 requires it to: an unseated seat
      // parks RECLAIMABLE, and a connected client takes it by clicking. Without
      // this a spectator's clicks reached nothing at all and the only route into
      // a parked seat was a fresh page load. The fire edge already sitting in
      // the pending frames IS the click, so no new gesture and no new key: the
      // frames are still discarded, and only the ASK survives them. The server
      // decides whether anything is open; a claim on a full room is a no-op.
      const asked = pendingInputs.some((f) => (f.ap | 0) & AB_FIRE);
      pendingInputs.length = 0;
      if (asked && ws && ws.readyState === 1 && helloed) {
        ws.send(JSON.stringify({ v: NET_V, ui: "claim" }));
      }
      return;
    }
    if (ws && ws.readyState === 1 && helloed) {
      let flushed = 0;
      for (const f of pendingInputs) {
        ws.send(JSON.stringify({ v: NET_V, n: ++ntick, e: mySeatEpoch, f }));
        sent += 1;
        // the predictor's send history. ONE batch per flush: frames flushed
        // together arrive together and the server admits and drains them in
        // ONE tick (FRAMES_PER_TICK caps both ends), so the batch id IS the
        // replay's tick grouping.
        sentHist.push({ n: ntick, batch: batchId, f: { ...f } });
        flushed += 1;
      }
      if (flushed) batchId += 1;
    }
    pendingInputs.length = 0;
  }

  // ---- presentation: ONE policy table, then pick the pair and apply it -------
  //
  // Phase 12. At a quarter second of lag the presented world runs ~10 ticks
  // behind truth, and pose error is lag × speed — so the fast movers, and only
  // the fast movers, miss the 24 px bar. That shapes every column below.
  //
  //   interp     "lerp" | "hermite". Hermite uses the WIRE VELOCITIES as
  //              tangents over the bracket. Those velocities are a BACKWARD
  //              difference — the move that produced that snapshot's pose — so
  //              over a one-tick bracket the s1 tangent IS the chord and the
  //              curve degenerates to the lerp whenever motion is constant.
  //              Hermite therefore corrects CURVATURE; it never leads. It is
  //              worth having on turning bodies and worth nothing on straight
  //              ones, which is exactly what the table says.
  //   boundary   "hold" | null. See the hold rule below.
  //   project    a GAIN on the measured presentation lag, 0 = off. This is the
  //              only column that can move a body toward truth-now, and it is
  //              turned on ONE MODE AT A TIME, each with its own measurement.
  //
  // THE BOUNDARY-HOLD RULE, which is load-bearing. When s1 exists and its mode
  // differs from s0's, the body HOLDS its s0 pose, its s0 countdown `t` and its
  // s0 facing for the whole bracket. Nothing is interpolated across a
  // discontinuity and nothing is ever projected into the next mode: the old
  // `t` lerp manufactured countdown values the sim never held, and a
  // projection that crossed a windup→dash edge would invent a lunge before the
  // server committed to one. A body missing from s1 keeps the existing
  // hold-s0-pose branch — a vanishing id IS the death, and no projection may
  // invent a post-death pose.
  //
  // THE PROJECTION HORIZON is measured, never assumed:
  //
  //     leadTicks = (newest - pt) + (rtt > 0 ? (rtt / 2) / TICK : 0)
  //
  // the first term is how far the presented clock deliberately runs behind the
  // newest snapshot in hand (the adaptive buffer), the second is the measured
  // DOWN-wire transport from the app-level RTT. Bounded to PROJ_MAX_TICKS, and
  // bounded again per body by the remaining `t` of a counting-down mode and by
  // the world walls.
  //
  // THE OVERSHOOT GUARD is a clamp on the WIRE VELOCITY itself, before it
  // reaches either the Hermite tangent or the projection: no presented body
  // moves faster per tick than its class allows. Clamping the velocity rather
  // than the presented displacement is deliberate — a displacement clamp would
  // also smooth a TELEPORT, and row 4 requires a teleport to cross in one
  // presented frame. Positions are never touched by the guard, so the lerp path
  // and every discontinuity pass through it untouched. The ceiling comes from
  // the client's own statsFor() (max of maxSpeed and backSpeed, the same pair
  // stepEnemy caps on), overridden by the charger's constant dash speed; net
  // mode locks the enemy tuning tab, so those constants are file defaults.
  const PROJ_MAX_TICKS = 14; // ~230 ms — past a quarter second a lead built on
                             // one velocity sample describes nothing
  const POLICY = {
    // a remote ship answers a stick this client cannot see. Hermite yes,
    // projection NEVER: leading it on its last velocity fights every turn the
    // pilot makes, and input speculation about another player is forbidden.
    // ...and its ONE boundary is the respawn marker. A respawn is a DEAL, not
    // a move: the seat's pose jumps the width of the world in a single tick,
    // and a Hermite over that bracket draws the ship flying across the map for
    // the frames the presented clock spends inside it. Row 4 requires a
    // discontinuity to cross in ONE presented frame, so the bracket that spans
    // the marker holds at s0 and the next bracket opens on the dealt position.
    // The rule is keyed to the MARKER, never to the distance: ordinary remote
    // motion keeps its Hermite bracket, which is what row 5 measures.
    remoteShip: { interp: "hermite", boundary: "respawn", project: 0 },
    orb:        { interp: "lerp",    boundary: null, project: 0 },
    bullet:     { interp: "lerp",    boundary: null, project: 0 },
  };
  // enemies are keyed by MODE — the mode is the body's behaviour, so it is the
  // right key for how to present it
  // Every gain here is MEASURED, one mode at a time, at d250j20. The numbers
  // are in RESULTS §12; the short version is that only the modes that TRAVEL
  // are projected, because pose error is lag × speed and a planted body has no
  // speed to be wrong about.
  //   seek    26.1 px p95 → 4.6 (dart), 26.2 → 4.5 (radarDart), 15.7 → 2.5
  //           (harrier). The one mode that was ever over the bar, and the
  //           reason this column exists.
  //   dash    the charger's lunge, 7 px/tick and the roster's fastest body — and
  //           the one gain that was built, measured and then REFUSED. A dash
  //           projection halved it, 64.7 px p95 → 33.5, and 33.5 is still over
  //           the 24 px bar: the falsifier forbids shipping a projection that
  //           measures over, so the gain stays 0 and the mode is demoted with
  //           its number. windup and tired are demoted beside it for a cause no
  //           projection can touch — see the registry beside the p12 runs.
  //
  //           THE SUPPORT IS PRESENT AND OFF, not deleted. Acting on that
  //           refusal is a ONE-VALUE FLIP: set dash's `project` to 1 below and
  //           re-run the rig. Everything a lunge needs is already wired and
  //           exercised on this path — the countdown bound (`bodyLead`, which
  //           is inert for seek and load-bearing here), the wall clamp inside
  //           presentBody, the dash speed ceiling in enemyCap, and the boundary
  //           hold that stops the lead at the lunge's own edges. The 33.5 px
  //           figure was measured with exactly this code and nothing else.
  //   tele / pulse / lockon / windup / tired all measure at or under 6.3 px
  //           without a projection — they are planted or nearly so. Leading
  //           them would spend accuracy to buy nothing, so the gain stays 0
  //           and that is a measurement, not an omission.
  // the policy a body takes when the client does not know its state — see the
  // decode below for why this is not `seek`.
  const ENEMY_POLICY_UNKNOWN = { interp: "hermite", boundary: "hold", project: 0 };
  const ENEMY_POLICY = {
    seek:   { interp: "hermite", boundary: "hold", project: 1 },
    tele:   { interp: "hermite", boundary: "hold", project: 0 },
    pulse:  { interp: "hermite", boundary: "hold", project: 0 },
    lockon: { interp: "hermite", boundary: "hold", project: 0 },
    windup: { interp: "hermite", boundary: "hold", project: 0 },
    dash:   { interp: "hermite", boundary: "hold", project: 0 },
    tired:  { interp: "hermite", boundary: "hold", project: 0 },
  };
  // MISSILE_POLICY and missilePhase went with the missile decode (R0.4). They
  // derived a steering phase from the wire's `age` for a row that has had no
  // producer since the harrier's seeker retired, so both were reachable only
  // from a loop that always ran zero times.

  // a SHIP's ceiling, px/tick: the flight clamp's own formula, over the seat's
  // OWN decoded rank vector through the one derivation (termsFromOwned) and
  // its own comet flag. Net mode locks the flight sliders, so VMAX and
  // COMETVMAX here are the file defaults the server is running.
  function shipCap(pr) {
    const terms = window.Encounter && Encounter.termsFromOwned
      ? Encounter.termsFromOwned(Array.isArray(pr.ow) ? pr.ow : null) : null;
    const vcap = VMAX + (terms ? terms.speed : 0);
    return pr.comet ? vcap * COMETVMAX : vcap;
  }
  // the class ceiling, px/tick — PER CLASS again since r7a commit 6, which is
  // what the note here promised R7 would do. The kind comes off the wire and
  // the kernel publishes its own STATS, so the guard asks the per-class
  // question it could not ask while every body decoded as a dart. See
  // CAP_HEADROOM for where the 5 comes from: it is the generosity the single
  // shipped ceiling already had, kept per kind rather than granted to all.
  function enemyCap(kind) { return bodyStats(kind).speed / 60 * CAP_HEADROOM; }
  // the guard catches a SPIKE, not a rounding edge: a body travelling at
  // exactly its clamp prints a wire velocity that can round a hair over it, and
  // throttling that would be the guard inventing a lag of its own. The slack is
  // wide enough that no honest body ever meets the clamp and narrow enough that
  // a spike still cannot cross a screen.
  const GUARD_SLACK = 1.25;
  // scale a velocity down to the ceiling, direction preserved. Never scales up.
  function capVel(vx, vy, cap) {
    if (!(cap > 0)) return { x: vx, y: vy }; // no ceiling declared for the class
    const lim = cap * GUARD_SLACK;
    const m = Math.hypot(vx, vy);
    if (!(m > lim)) return { x: vx, y: vy };
    const s = lim / m;
    return { x: vx * s, y: vy * s };
  }
  // the cubic Hermite basis over a bracket h ticks wide, one axis
  function hermite1(p0, v0, p1, v1, k, h) {
    const k2 = k * k, k3 = k2 * k;
    return (2 * k3 - 3 * k2 + 1) * p0 + (k3 - 2 * k2 + k) * (v0 * h)
      + (-2 * k3 + 3 * k2) * p1 + (k3 - k2) * (v1 * h);
  }

  // THE presented-motion routine every class in the table goes through.
  //   pol         the policy row
  //   a, b        the bracketing wire records ({x,y,vx,vy}); b may be null
  //   k, h        position in the bracket, and its width in ticks
  //   cap         the class ceiling, px/tick
  //   held        true when the boundary rule fired — pose freezes at a
  //   lead        projection horizon in ticks, already bounded (0 = off)
  //   r           the body radius, for the wall clamp
  // Returns { x, y }.
  function presentBody(pol, a, b, k, h, cap, held, lead, r) {
    if (!b || held) return { x: a.x, y: a.y };
    const v0 = capVel(a.vx || 0, a.vy || 0, cap);
    const v1 = capVel(b.vx || 0, b.vy || 0, cap);
    let x, y;
    if (pol.interp === "hermite" && h === 1) {
      x = hermite1(a.x, v0.x, b.x, v1.x, k, h);
      y = hermite1(a.y, v0.y, b.y, v1.y, k, h);
    } else {
      // a wider bracket has lost the tangents' meaning (they describe ONE tick
      // of motion each), so it falls back to the straight line
      x = lerp(a.x, b.x, k);
      y = lerp(a.y, b.y, k);
    }
    if (lead > 0) {
      x += v1.x * lead;
      y += v1.y * lead;
      // the WALL. A projection may never slide a body through the boundary the
      // sim clamps it against — and the wire velocity of a body already pinned
      // there is honestly 0 on the clamped axis, so this only ever catches a
      // body arriving at the wall inside the lead window.
      x = Math.max(r, Math.min(WW - r, x));
      y = Math.max(r, Math.min(WH - r, y));
    }
    return { x, y };
  }

  // the MEASURED presentation lag, in ticks — the projection's horizon before
  // any per-body bound. See the formula in the table's note above.
  // ---- THE CLIENT'S OWN DECODE TARGET (S3b lane 3, commit D5) -------------
  // `E.enemies`, `E.missiles` and `E.groups` are DELETED from the simulation:
  // production deals no bodies, fires no ordnance and schedules no waves. This
  // client still DECODES all three off the wire, because the wire still
  // carries all three rows — v10's shape is frozen until R7 ships v11 — so the
  // decode needed somewhere to land that is not the sim's own state.
  //
  // IT IS NET-OWNED, and that is the point rather than a detail. A client
  // writing into `E` was writing into the object the state hash walks and the
  // sim steps; on a puppet client that read as harmless and it was never
  // harmless, it was unnoticed. Here the ownership is in the name.
  //
  // AND WHAT REACHES IT IS A KNOWN LIE UNTIL R7. Every successor-plane body
  // encodes `ty: -1` (commit C), so every decoded body reads back as the first
  // ROSTER name and the `seek` policy. `?mp` IS UNDEPLOYABLE until v11 gives
  // those twenty-one types real rows — the program's standing wire fact — and
  // SOLO is the shipped surface. The decode is kept INTACT rather than gutted
  // so R7 has one place to re-cut.
  // `missiles` IS AN EMPTY LITERAL WITH A LIVE READER, and it survives the row's
  // deletion (R0.4) for the reason js/encounter.js states at its own consumer:
  // "a `FRAME.missiles` shadow is built from it every frame and a missing key is
  // a TypeError on the render path, which is the one place a retirement must not
  // surface." The WIRE ROW is gone — the schema declares none and no snapshot
  // decodes one; what is left here is a shape the draw reads and nothing fills.
  const NETV = { enemies: [], missiles: [], groups: [], rounds: [], orbs: [] };

  // ---- THE DERIVED STORES (R7 / O2.2, O3) ---------------------------------
  // THE BALLISTIC SPLIT'S CLIENT HALF. Sixteen of the kernel's twenty round
  // kinds have a flight FIXED AT SPAWN, so they do not ride per tick at all:
  // the wire sends a reliable SPAWN EVENT and this store runs the KERNEL'S OWN
  // STEP to know where the round is on every tick after. Orbs ride the same
  // split — a scatter velocity and a fixed damping, both derivable.
  //
  // ONE COPY OF THE ARITHMETIC. `DemoKernel.flyRound` is the function the sim
  // itself calls (js/demo-kernel.js, exported at r7a commit 8); nothing is
  // re-implemented here. Two copies would be two answers to one question, and
  // one of them would be on the screen the player is watching.
  //
  // THE STORE NEVER SPAWNS. On a derived death — the step's own terminal
  // reason: a timer split, a life expiry, or the arena wall — it DROPS the
  // round and waits. The children of a split arrive as their OWN spawn events
  // (O2.1), and a store that manufactured one would be putting ordnance on the
  // player's screen that the server never fired.
  //
  // THE HALF-RTT GHOST IS ACCEPTED (O2.6, the owner's ruling). A derived round
  // is DISPLAY-ONLY and hits stay the server's, so for up to about half a round
  // trip after a server-side death the client draws a round that is already
  // dead. That is the industry norm and it is NOT a defect to design around —
  // no reconciliation is built for it.
  //
  // NOTHING FEEDS THESE STORES AT r7a'S TIP, and that is the expected state
  // rather than a gap: r7b emits the four kinds and routes them here. Until
  // then they are fed by `full` snapshots and by the test seam below, which is
  // what the determinism legs drive.
  const derivedRounds = new Map();  // id -> a kernel-shaped round record
  const derivedShots = new Map();   // id -> a PLAYER round, derived the same way
  const derivedOrbs = new Map();    // id -> a kernel-shaped orb record
  let derivedTick = -1;             // the sim tick the stores have been advanced to
  const KSTEP = 1 / 60;             // the kernel's own STEP; the client runs the
                                    // same fixed timestep or it is not the same run

  // PREV and CUR, so the presentation chain lerps a derived round through the
  // bracket it already uses for every other body (presentBody's shape). The
  // chain itself does not move: a derived round is a body like any other to it.
  const poseOf = (r) => ({ x: r.x, y: r.y, px: r.px, py: r.py });

  function seedRound(rec) {
    // the kernel's own round shape, which is what flyRound steps
    derivedRounds.set(rec.id, {
      id: rec.id, team: "enemy", kind: rec.kind,
      x: rec.x, y: rec.y, px: rec.x, py: rec.y,
      vx: rec.vx, vy: rec.vy,
      speed: rec.speed || Math.hypot(rec.vx, rec.vy),
      maxSpeed: rec.maxSpeed || 0, acceleration: rec.acceleration || 0,
      life: rec.life, homing: 0, homingDelay: 0, armed: rec.armed || 0,
      curve: rec.curve || 0, wiggle: rec.wiggle || 0,
      specialTimer: rec.specialTimer || 0,
      ownerId: rec.ownerId || 0, r: rec.r || 3, color: rec.color,
      dead: false,
    });
  }
  function seedOrb(rec) {
    derivedOrbs.set(rec.id, { id: rec.id, x: rec.x, y: rec.y, px: rec.x, py: rec.y,
      vx: rec.vx, vy: rec.vy, life: rec.life, value: rec.value || 1, dead: false });
  }
  // A PLAYER ROUND (O2.8, commit 10b). Its flight is EXACTLY straight on every
  // wire-reachable path — ordnanceStep is inert and BOUNCE has no wire writer —
  // so `x += vx` per tick IS the sim's own step, and there is no kernel
  // function to share because there is no curve to share. The pose the record
  // carries is POST-REBATE: js/encounter.js's rebate advances a round at spawn
  // and collapses px/py, so this is the state the round would have had on its
  // first snapshot.
  function seedShot(rec) {
    derivedShots.set(rec.id, { id: rec.id, seat: rec.seat, k: rec.k | 0,
      x: rec.x, y: rec.y, px: rec.x, py: rec.y,
      vx: rec.vx, vy: rec.vy, ttl: rec.ttl | 0 });
  }
  const dropShot = (id) => derivedShots.delete(id);
  const dropRound = (id) => derivedRounds.delete(id);
  const dropOrb = (id) => derivedOrbs.delete(id);

  // ONE SIM TICK of both stores. `sweeping` freezes an orb's life exactly as
  // the kernel does (`if (!sweeping && !o.captured) o.life -= dt`) — a client
  // that let the life run during a clear break would expire orbs the server
  // still holds.
  function stepDerived(tick, sweeping) {
    const K = window.DemoKernel;
    if (!K || !K.flyRound) return;
    const time = tick * KSTEP;
    for (const [id, b] of derivedRounds) {
      b.px = b.x; b.py = b.y;
      // NO SEEK TARGET. A derived round is by definition one that does not
      // home — CONSTRUCT_KINDS is exactly the homing set — so the branch is
      // unreachable for anything in this store, and passing null makes that a
      // property of the call rather than a hope about the data.
      const end = K.flyRound(b, KSTEP, time, null);
      if (end) dropRound(id);   // "split" | "expire" | "wall" — never a spawn
    }
    for (const [id, b] of derivedShots) {
      b.px = b.x; b.py = b.y;
      b.x += b.vx;
      b.y += b.vy;
      b.ttl -= 1;
      // TTL IS LOAD-BEARING: without it a derived round outlives its death tick
      // and keeps drawing. A round killed by a HIT is dropped by its roundDeath
      // event instead, which r7b emits — this is only the expiry the client can
      // see for itself.
      if (b.ttl <= 0) dropShot(id);
    }
    for (const [id, o] of derivedOrbs) {
      o.px = o.x; o.py = o.y;
      K.dampOrb(o, KSTEP);
      o.x = o.x + o.vx * KSTEP;
      o.y = o.y + o.vy * KSTEP;
      if (!sweeping) o.life -= KSTEP;
      if (o.life <= 0) dropOrb(id);
    }
  }
  // ---- THE LATE-ARRIVING SPAWN (r7b commit 8, O2.2 / O3) -------------------
  // A reliable event carries its OWN tick, and the ring can replay one that is
  // older than the store's current tick — a socket the broadcast skipped gets
  // the whole backlog on its next accepted send. Such a spawn is seeded AT ITS
  // SPAWN POSE and then stepped forward `now - t` times before it is ever drawn,
  // so it lands exactly where a round delivered on time would be.
  //   ONE ENTITY, NOT THE STORE. `stepDerived` advances everything; running it
  // here would double-advance every OTHER round in the store by the same gap.
  // The guard is `advanceDerived`'s own 600, and for its reason: a gap past it
  // is a resync's business, not a reason to integrate a big dt.
  function catchUpRound(b, fromTick, toTick) {
    const K = window.DemoKernel;
    if (!K || !K.flyRound) return true;
    let t = fromTick, guard = 0;
    while (t < toTick && guard++ < 600) {
      t += 1;
      b.px = b.x; b.py = b.y;
      if (K.flyRound(b, KSTEP, t * KSTEP, null)) return false;   // it ended en route
    }
    return true;
  }
  // ...and the PLAYER round's own catch-up (r7b FIX 1). Its step is `x += vx`
  // per tick and nothing else — ordnanceStep is INERT and BOUNCE has no wire
  // writer, both measured by r7a — so there is no kernel function to share
  // because there is no curve to share. `ttl` is spent on the way, and a round
  // whose ttl runs out en route is dropped rather than delivered dead.
  function catchUpShot(b, fromTick, toTick) {
    let t = fromTick, guard = 0;
    while (t < toTick && guard++ < 600) {
      t += 1;
      b.px = b.x; b.py = b.y;
      b.x += b.vx;
      b.y += b.vy;
      b.ttl -= 1;
      if (b.ttl <= 0) return false;
    }
    return true;
  }
  function catchUpOrb(o, fromTick, toTick, sweeping) {
    const K = window.DemoKernel;
    if (!K || !K.dampOrb) return true;
    let t = fromTick, guard = 0;
    while (t < toTick && guard++ < 600) {
      t += 1;
      o.px = o.x; o.py = o.y;
      K.dampOrb(o, KSTEP);
      o.x = o.x + o.vx * KSTEP;
      o.y = o.y + o.vy * KSTEP;
      if (!sweeping) o.life -= KSTEP;
      if (o.life <= 0) return false;
    }
    return true;
  }

  // ---- THE DERIVED PLANE'S INTAKE (r7b commit 8, O2.2 / O3) ----------------
  // ONE FUNCTION, TWO CALLERS, AND THE SECOND IS A TEST SEAM ON THE FIRST.
  // fireEvents calls this for every drained event; Net.__derived.apply() calls
  // the SAME function, so a leg that drives it is driving the shipped consumer
  // and not a copy of it. It is split out because the alternative — driving this
  // through hundreds of injected snapshots — walks the shared client's stream
  // past every leg that runs after it.
  function applyDerivedEvent(e, tick) {
    // ---- THE DERIVED PLANE'S INTAKE (r7b commit 8, O2.2 / O3) ----------
    // The four split kinds are STATE, not sound: they seed and drop r7a's
    // derived stores. They are applied BY THEIR OWN TICK — a spawn replayed
    // out of the ring is seeded at its spawn pose and stepped forward to now
    // before it is drawn, or the client would draw it `now - t` ticks behind
    // where the server has it.
    if (e.k === "roundSpawn") {
      // ---- A CONSTRUCT IS NEVER SEEDED (r7b FIX 4, the seat's S-D row) ------
      // O2.4 says a construct's spawn ALSO emits `roundSpawn`, so the client can
      // DRAW it the tick it appears — and it does, from `s0.rounds`, because
      // js/wire.js sends the four homing kinds PER TICK as wire rounds. Seeding
      // one here as well made it DRAWN TWICE: once as the true homing round from
      // the wire and once as a straight-flying ghost from this store, which
      // lives until its own `roundDeath` (measured divergence 377 px at seed
      // 4242, 576 px at 20260826).
      //   `stepDerived`'s own comment already claimed "the branch is unreachable
      // for anything in this store — CONSTRUCT_KINDS is exactly the homing set".
      // NOTHING ENFORCED IT. This is the line that does, and it reads the
      // EXPORTED list rather than a literal so a fifth homing kind is covered
      // the day the ladder gains one.
      if (isConstructKind(e.kindName)) return;
      seedRound({ id: e.id, kind: e.kindName, x: e.x, y: e.y, vx: e.vx, vy: e.vy,
        life: e.life, ownerId: e.ownerId, curve: e.curve, wiggle: e.wiggle,
        specialTimer: e.specialTimer });
      const b = derivedRounds.get(e.id);
      if (b && derivedTick > tick && !catchUpRound(b, tick, derivedTick)) dropRound(e.id);
    } else if (e.k === "roundDeath") {
      // IDEMPOTENT BY CONSTRUCTION, and the case that produces a miss is a
      // RACE rather than a duplicate: a derived round the client already
      // expired at its own `life` while the server's end for the same round
      // was still in flight. Map.delete on an absent key is a no-op and
      // nothing is counted, which is what makes the double drop invisible.
      dropRound(e.id);
      // r7b FIX 1: a PLAYER round's end lands here too, and it drops from the
      // OWN-ROUND store. The two stores hold disjoint id spaces — the kernel's
      // rounds cross at `id + KERNEL_WIRE_ID_BASE` — so asking both is exact
      // and neither drop can take the other's round.
      dropShot(e.id);
    } else if (e.k === "orbSpawn") {
      // ONE EVENT SEEDS `n` ORBS, NOT ONE (O2.11). `x`, `y` and `life` are
      // the batch's — killEnemy passes one spawn point and ORBLIFE to every
      // orb of one kill — while `id`, `vx`, `vy` and `value` are PER ORB:
      // the loop computes `value` per iteration and the first
      // `xpTotal % count` orbs each carry one more than the rest, so a
      // batch-level value cannot represent the batch. A batch applied as a
      // single orb is the defect this walk exists to prevent.
      const sweeping = !!(buf.length && buf[buf.length - 1].hud && buf[buf.length - 1].hud.sweep);
      for (const o of e.orbs || []) {
        seedOrb({ id: o.id, x: e.x, y: e.y, vx: o.vx, vy: o.vy,
          life: e.life, value: o.value });
        const seeded = derivedOrbs.get(o.id);
        if (seeded && derivedTick > tick && !catchUpOrb(seeded, tick, derivedTick, sweeping)) dropOrb(o.id);
      }
    } else if (e.k === "orbPickup") {
      // D55: the CREDIT already fired server-side at magnet entry. What the
      // client does here is remove the orb; the fly-in and its landing cue
      // are local (`pickup`, a cosmetic event of its own).
      dropOrb(e.id);
    } else if (e.k === "shot") {
      // A6-NO's own-round store. THE ROW AND THE STORE ARE r7a's AND NOTHING
      // EMITS THIS EVENT AT THIS TIP — see the lane report's FINDING 1. The
      // route is built because it is this lane's obligation (§4 step 8 (ii))
      // and because it costs one branch: the client half is then ready the
      // day the emit lands.
      seedShot({ id: e.id, seat: e.seat, k: e.rk, x: e.x, y: e.y,
        vx: e.vx, vy: e.vy, ttl: e.ttl });
      // ...and it is CAUGHT UP BY ITS OWN TICK, exactly as a roundSpawn is: a
      // `shot` replayed out of the ring is seeded at its spawn pose and stepped
      // forward `now - t` times before it is drawn.
      const sb = derivedShots.get(e.id);
      if (sb && derivedTick > tick && !catchUpShot(sb, tick, derivedTick)) dropShot(e.id);
    } else if (e.k === "restart" || e.k === "wipe") {
      // ...and a dead run's rounds never survive into a fresh match. `restart`
      // is already RELIABLE and already cuts the predictor; this is case 7's
      // client half.
      //   `wipe` JOINS IT AT r7b FIX 5 (the seat's S-C row), and it is the same
      // event on the sim's side: js/encounter.js's `wipeNow` reaches the
      // kernel's `resetRun`, which empties `S.bullets` AND `S.orbs` outright.
      // Measured at fa2f893 (seed 4242, tick 15788): the match wiped, NO
      // `restart` marker crossed, the kernel's five live `flame` rounds vanished
      // with no `roundDeath` of their own, and the client's store still held all
      // five with 1.87-2.02 s of `life` left — drawn over an empty field at the
      // moment every pilot is watching it. A 12-seed sweep found derived ORBS
      // ghosting for the whole of ORBLIFE (27.7-30 s) on 4 of 12 seeds, which is
      // the common case.
      //   `clearDerived()` and not a round-store-only clear: it also nulls
      // `DemoRender.setNetRounds` and re-seats `derivedTick`, and a clear that
      // left the render handle pointing at the ghost list would draw them anyway.
      clearDerived();
    }
  }

  // advance to a tick, one fixed step at a time. A gap larger than one tick is
  // a resync's business, not a reason to integrate a big dt: the kernel runs a
  // fixed timestep and a client that took a variable one would not be running
  // the same simulation at all.
  function advanceDerived(tick, sweeping) {
    if (derivedTick < 0) { derivedTick = tick; return; }
    let guard = 0;
    while (derivedTick < tick && guard++ < 600) {
      derivedTick += 1;
      stepDerived(derivedTick, sweeping);
    }
    if (derivedTick < tick) derivedTick = tick;  // a gap past the guard: catch up silently
  }
  function clearDerived() {
    derivedRounds.clear();
    derivedShots.clear();
    derivedOrbs.clear();
    derivedTick = -1;
    NETV.rounds = [];
    NETV.orbs = [];
    // ...and the renderer's handle with them. It is module-level in
    // js/demo-render.js and outlives this client, so a list left behind here is
    // a list some later page draws.
    if (window.DemoRender && DemoRender.setNetRounds) DemoRender.setNetRounds(null);
    // ...and the BODY handle with it, for the identical reason (S-fxg8ts): it
    // is module-level in js/demo-render.js and outlives this client, so a list
    // left behind here is a list some later page draws.
    if (window.DemoRender && DemoRender.setNetBodies) DemoRender.setNetBodies(null);
  }

  let starving = false; // set by present()'s starvation branch for the frame it
                        // drives — the projection stands down for that frame
  function leadTicks() {
    if (pt < 0 || !buf.length) return 0;
    const behind = buf[buf.length - 1].tick - pt;
    const transport = rtt > 0 ? (rtt / 2) / TICK : 0;
    const l = behind + transport;
    return Math.max(0, Math.min(PROJ_MAX_TICKS, l));
  }

  function present() {
    ptPrev = pt; // roll the pair FIRST, every tick: after this call pt is the
                 // newer end and ptPrev the older, whatever branch runs below —
                 // an early return leaves them equal, which is the honest
                 // degenerate bracket (the world did not move this tick)
    if (pt < 0 || !buf.length) return;
    slewDepth(); // the adaptive buffer walks toward its measured want, one
                 // DELAY_SLEW step per presented tick — never per arrival
    const newest = buf[buf.length - 1].tick;
    const target = newest - delayTicks();
    // advance one tick per tick, slewing gently toward the buffer depth; a
    // large error (join, long stall) jumps instead of gliding for seconds
    const err = target - pt;
    let nextPt;
    if (Math.abs(err) > 30) nextPt = target;
    else nextPt = pt + 1 + Math.max(-0.25, Math.min(0.25, err * 0.05));
    if (nextPt > newest) {
      // Starvation is exceptional, not a new latency policy: stretch the last
      // observed motion for two ticks, then pin the clock at that hard cap.
      starved += 1;
      starveRun += 1;
      starveLongest = Math.max(starveLongest, starveRun);
      starving = true; // the projection stands down: this branch already
                       // extrapolates, and the two must never stack
      pt = Math.min(nextPt, newest + MAX_EXTRAP_TICKS);
      const newestSnap = buf[buf.length - 1];
      const prev = buf.length > 1 ? buf[buf.length - 2] : null;
      if (prev && newestSnap.tick > prev.tick) {
        // Reverse the endpoints and use a negative k. That extrapolates from
        // newest while keeping every discrete bit and live-id set on newest.
        const k = -(pt - newest) / (newestSnap.tick - prev.tick);
        apply(newestSnap, prev, k);
      } else {
        // One sample has no slope. Keep both state and clock on newest until a
        // second accepted snapshot makes bounded extrapolation meaningful.
        pt = newest;
        apply(newestSnap, null, 0);
      }
      fireEvents();
      starving = false;
      if (buf.length > 2) buf.splice(0, buf.length - 2);
      return;
    }
    starveRun = 0;
    starving = false;
    pt = nextPt;
    if (pt < buf[0].tick) pt = buf[0].tick;
    // bracket pt: s0 is the newest snapshot at or under it
    let i0 = 0;
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].tick <= pt) { i0 = i; break; }
    }
    const s0 = buf[i0];
    const s1 = buf[i0 + 1] || null;
    const k = s1 ? (pt - s0.tick) / (s1.tick - s0.tick) : 0;
    apply(s0, s1, k);
    fireEvents();
    // Keep one sample before s0: it is the velocity source if arrivals stop on
    // the next tick and the starvation guard has to extrapolate.
    if (i0 > 1) buf.splice(0, i0 - 1);
  }

  function apply(s0, s1, k) {
    const E = enc().E;
    const cfg = enc().cfg;
    // the bracket's WIDTH in ticks. The Hermite tangents describe one tick of
    // motion each, so only h === 1 carries them; every other width — a gap in
    // the stream, and the starvation guard's deliberately REVERSED endpoints
    // (s1 older than s0, negative k) — falls back to the straight line the v4
    // client always drew. Starvation therefore keeps its exact old behaviour.
    const h = s1 ? s1.tick - s0.tick : 1;
    // ...and the projection's horizon, computed ONCE per applied frame. It is
    // hard 0 while the starvation guard is driving: that branch is already an
    // extrapolation, and stacking a projection on it would double-count.
    const lead = starving ? 0 : leadTicks();

    if (!s0.players.length) return; // the wire always carries seat 0; reject a malformed empty view
    appliedTick = s0.tick; // the tick the discrete state below belongs to — set
                           // AFTER the malformed-view reject, so a rejected
                           // apply cannot vouch for a tick it never wrote
    setPlayerCount(s0.players.length);
    enc().syncSeats(); // ...and the ENCOUNTER's seat records with them. Local
                       // play only ever resizes at restart(), so nothing else
                       // calls this; a net client learns the count mid-stream
                       // and without it every remote seat's record is dropped
                       // at the guard below — and a client granted seat 1
                       // would read seat 0's hull, wallet and ranks.
    const p1by = s1 ? new Map(s1.players.map((p) => [p.seat, p])) : null;

    // THE RESPAWN BOUNDARY, per seat. A death/respawn marker lands ON its own
    // snapshot's tick (the marker-tick contract asserted server-side), and the
    // dealt position is already in that same snapshot's player record — so the
    // bracket that must not be interpolated is the one whose LATER endpoint
    // carries the marker. Later is s1 in the ordinary case and s0 under the
    // starvation guard, whose endpoints are deliberately reversed: there the
    // lead runs PAST newest, so a marker on newest is still ahead of the pose
    // being drawn and still must not be crossed. Derived per bracket and held
    // nowhere, so nothing can outlive a restart (which clears the buffer with
    // the match epoch anyway) or arm a stale seat: the marker carries its own
    // seat and every seat named in the bracket holds independently.
    const respawned = new Set();
    if (POLICY.remoteShip.boundary === "respawn") {
      const marker = starving ? s0 : s1;
      for (const ev of (marker && marker.events) || []) {
        if (ev.k === "respawn" && ev.seat !== undefined) respawned.add(ev.seat | 0);
      }
    }

    // --- every ship: keyed by seat, with position/flame interpolation and the
    // presented delta as velocity. The own velocity drives camera lookahead;
    // remote velocity drives its comet tail. Discrete state stays on s0.
    for (const pr of s0.players) {
      const P = players[pr.seat];
      if (!P) continue;
      const S = E.seats[pr.seat];
      // v8: the PARKED seat — `{ seat, hull, hm, cl: -1 }` and nothing else
      // (isParked). The seat record takes the terminal fold through the sim's
      // OWN vacateSeat — absent, no window, no countdown, hull 0, no
      // invulnerability, no flash — the same function unseatSeat and parkSeat
      // call on the server, so a seventh terminal field added there cannot be
      // cleared on the sim's path and left stale on this one; then the one
      // field the fold does not own and the record does carry (hullMax), and
      // then the RESET the record cannot carry. The resets are the point: the
      // server's two parkSeat callers both park straight after a restart()
      // that zeroed xp, score and best and dealt every seat the fresh rank
      // vector, and a seat parked at that cut sends this four-key record from
      // its very first post-restart snapshot — so the zeros never cross, and
      // a record left as it was holds LAST MATCH's wallet and ranks. One
      // reader reaches them while the seat is parked: localSeatRec() folds a
      // seatless client to seat 0, so a spectator's HUD and shop read seat
      // 0's wallet and ranks even when seat 0 is parked, and a lapsed tab that
      // outlived a roomReset seatless read the old match's numbers — and the
      // blast fx sized off ranks nobody holds. The other parking path, an AFK
      // lapse through unseatSeat, leaves the ranks in place on the server; it
      // is the reclaim's first FULL record that restores them, and it overwrites
      // all four whichever way the seat was parked, so the choice here decides
      // only what the spectator fold shows while it lasts: zero, the honest
      // number for a seat with nobody behind it, and the server's own number
      // on the path that has a reader at every solo restart. (resetSeatUpgrades
      // also bumps the seat's termSeq and emits termChange; both are sim-side
      // — the sequence is unhashed and the event never crosses — so only the
      // vector is mirrored.) The ship's POSE is not touched: it goes STALE
      // across a park and nothing reads it while it lasts — drawShip is never
      // reached for an absent seat (the draw loop skips it ahead of the glow
      // and the probe) and the fx bloom and the invuln ring key off the hull
      // and the invulnerability the fold zeroes — and an assignment from this
      // record would write undefined into a pose the presented frame still
      // lerps. The velocity, pool and comet flag ARE zeroed, to the values a
      // missing key already decodes to (`vx`/`en` → 0, `em` → ENMAX), and the
      // flame on its own merits (the full path assigns `fx`/`fy` raw; a seat
      // with no ship has no plume): no thrust, no pool, no comet, and the
      // spectator fold's HUD bar reads the pool.
      if (isParked(pr)) {
        if (S) {
          // the sim's own terminal fold — see above. Typed, not trusted: a
          // cached js/encounter.js older than this round has no vacateSeat,
          // and this call sits on the hot path outside any try, so the
          // transition publish (old script, new client — the lookMs argument)
          // would hard-freeze the tab; until then the six fields fold inline.
          const E2 = enc();
          if (typeof E2.vacateSeat === "function") E2.vacateSeat(pr.seat);
          else { S.absent = true; S.claimT = 0; S.respawnT = 0; S.hull = 0; S.invuln = 0; S.hitFlash = 0; }
          S.hullMax = pr.hm;
          S.xp = 0;
          S.score = 0;
          S.best = 0;
          if (Array.isArray(S.owned)) S.owned = S.owned.map(() => 0);
        }
        P.vel.x = 0; P.vel.y = 0;
        P.flame.x = 0; P.flame.y = 0;
        P.energy = 0;
        P.energyMax = ENMAX;
        P.comet = false;
        continue; // the release latch below stays as it is: a parked record
                  // never cleared it
      }
      // ...and the bracket's OTHER record for this seat, which may itself be
      // the short one (s1 is the newer end, so a seat that PARKED on this tick;
      // under the starvation guard's reversed endpoints, one reclaimed): it
      // carries no pose, so it reads as "no other pose" — the bracket holds at
      // s0 — rather than lerping a number against undefined
      const p1r = p1by ? p1by.get(pr.seat) : null;
      const p1 = p1r && !isParked(p1r) ? p1r : null;
      // the phase-11 carve-out: while the predictor is live, the LOCAL
      // seat's pose/velocity/flame belong to it (clientTick writes them from
      // the predicted kernel + the render offset) — everything else on the
      // record keeps flowing wire→state as the state of record
      if (!(predOn && pr.seat === mySeat)) {
        // phase 12: the remote ship goes through the policy table like every
        // other class — Hermite over the v4 wire velocities, no projection,
        // and the ship's own radius as the wall bound (unused with the
        // projection off, but the routine is the same one for everybody)
        const held = respawned.has(pr.seat);
        const pose = presentBody(POLICY.remoteShip, pr, p1, k, h, shipCap(pr),
          held, 0, SHIP_R);
        P.ship.x = pose.x;
        P.ship.y = pose.y;
        // v4: the sim's OWN velocity rides the wire — adopted directly, no
        // more position-delta derivation. Discrete from s0 like every state bit.
        P.vel.x = pr.vx || 0;
        P.vel.y = pr.vy || 0;
        // the flame holds with the pose: a respawn refills the seat, and
        // lerping the plume across the deal draws a thrust the sim never had
        P.flame.x = p1 && !held ? lerp(pr.fx, p1.fx, k) : pr.fx;
        P.flame.y = p1 && !held ? lerp(pr.fy, p1.fy, k) : pr.fy;
        // v11: THE CONVERGED NOSE, adopted from the wire. Until this key
        // existed every remote plate on every screen held nose-right, and
        // test/tools/pred-frame-proof.mjs asserted exactly that as the
        // contract. It is an ANGLE, so it interpolates the short way round —
        // alerp, the same routine a body's `face` takes — and it HOLDS across a
        // respawn like the pose and the plume beside it.
        if (Number.isFinite(pr.hd)) {
          P.heading = p1 && !held && Number.isFinite(p1.hd)
            ? alerp(pr.hd, p1.hd, k) : pr.hd;
        }
      }
      // ...and the comet HALO'S RADIUS (S-5tqjej), presented truth for every
      // seat. A client sized a remote halo from its OWN rank because the
      // effective terms never cross; now the authoritative number does. Zero
      // means "no halo", which is what the zero-fold on the wire encodes.
      P.auraR = pr.auraR || 0;
      P.comet = !!pr.comet;
      P.cool = pr.cool || 0;     // v4: the fire cooldown and the recharge delay
      P.enIdle = pr.enIdle || 0; // — presented truth, and the predictor's rebase source
      // ...and the ability slots' cooldowns beside them, so the HUD's
      // availability dim reads presented truth on every seat. PADDED back to
      // the local catalog's width: a raw index into a trimmed vector is exactly
      // the NaN padRanks exists to stop (tests/fixtures/README.md's raw-index
      // caveat), and Flight.abilityOn indexes this record.
      if (P.slots) {
        const cd = Array.isArray(pr.cd) ? pr.cd : [];
        for (let i = 0; i < P.slots.length; i++) P.slots[i].cd = cd[i] | 0;
      }
      // ...and the pool the flag is spending, DISCRETE from s0 like every other
      // state bit: the halo sizes off it and the HUD bar reads it directly, so
      // both present server truth instead of a client-side simulation of it.
      // enMax defaults to the base slider because a client never sees mods.
      P.energy = pr.en || 0;
      P.energyMax = pr.em || ENMAX;
      // EVERY seat's own record is written from ITS OWN wire record — hull,
      // wallet, score, the high-water standing, flash, the respawn countdown
      // and the PERSONAL rank vector v2 moved onto the player records. Nothing here is seat-0
      // special any more: the HUD reads whichever seat localSeat() names, and
      // the scoreboard reads all of them. Guarded, because E.seats grows only
      // through restart() and a not-yet-dealt seat has no record to write.
      if (S) {
        S.hull = pr.hull;
        S.hullMax = pr.hm;
        S.invuln = pr.inv;
        S.hitFlash = pr.fl;
        S.xp = pr.xp;
        S.score = pr.score;
        S.best = pr.bst || 0;     // the seat's STANDING — what drawBoard ranks and
                                  // crowns by. A client cannot derive it: the credits
                                  // that built a remote seat's peak happened on the
                                  // server, and this seat's own `score` is only the
                                  // current run. Folded like rsp, so a record without
                                  // the key reads 0 rather than undefined
        S.respawnT = pr.rsp || 0; // the SHIP DOWN countdown card renders from
                                  // the wire, like the rest
        // ...and the window past it, out of the ONE conditional key the
        // encoder sends: anything above 0 is the window the click has left,
        // and no key is every live seat — so the decode has to fold the
        // absence, not just the value. The release (-1) took the short-record
        // branch at the top of the loop, so this record is a SEATED one.
        S.claimT = (pr.cl || 0) > 0 ? pr.cl : 0;
        S.absent = false;
        // ...and the rank vector, PADDED back to the local shop's width. Since
        // v8's diet the encoder cuts the trailing default run off `ow`, so a
        // stock seat arrives as `[]` and a seat holding only row 1 arrives as
        // two entries. An absent entry means rank 0 — that is what the trim
        // encodes — but a SHORT array reaching the sim record would leave every
        // index past its end reading undefined, and shopCost raises 2 to that.
        // rankAt's `| 0` is the second line of defence; this is the first, and
        // it keeps S.owned exactly the shape restart() built.
        if (Array.isArray(pr.ow)) S.owned = padRanks(pr.ow, S.owned);
        // ...and THIS is what spends the release latch: the seat this client
        // now holds, presented, showing something other than a release. Not the
        // grant that handed the seat over — see onYou for why that edge is a
        // blank field — and not the snapshot's ARRIVAL either, because the card
        // and the seat record have to change on the same frame. Clear it at
        // arrival and the buffer's own delay leaves a gap where the card is
        // gone and the record on screen is still the corpse, which matches no
        // overlay branch at all. Here the SHIP DOWN / claim-window card takes
        // over in the same draw, off state that is really on screen.
        //   `pr.seat === mySeat` and no other seat: a release is a fact about
        // ONE screen, and seat 0's record is what a released client's draw
        // reaches once localSeat() folds its null — the same fold releasedHere
        // exists to route around. A snapshot that carries no record for this
        // seat says nothing, so the latch simply stays. No parked test here:
        // a parked record took the isParked branch at the top of the loop, so
        // every record that reaches this line is a SEATED one.
        if (pr.seat === mySeat) released = false;
      }
    }
    // The local seat's AIM fields stay LOCAL — the marker follows the cursor,
    // never the wire. (E.hull and its siblings still delegate to seat 0 for the
    // standing test surface; the presented state above writes the records
    // themselves, so the delegation reads through to the same numbers.)

    // --- the encounter's presented fields, discrete ones from s0 (the
    // snapshot whose moment is on screen): the freeze renders exactly as the
    // sim reports, no client-side state machine
    // ---- THE STALL RIDES `hud.state` (R7 / r7c commit 7, R3.7) -------------
    // "stalled" is a SURFACE and not a director state: a stalled room is an
    // ACTIVE one that has stopped making progress, and js/encounter.js's own
    // count line is gated on `E.state === "active"`. Writing "stalled" straight
    // into E.state would DARKEN the very line the stall is supposed to light,
    // which is the opposite of R3.7. So the wire's value is split: the director
    // half goes to E.state and the alarm half to a flag the draw reads through
    // Net.stalled(), on the presentedBodies() cross-seam idiom.
    //   WHY IT IS THE SERVER'S WORD AND NOT THE CLIENT'S COUNT: presentedBodies()
    // on a net client returns THIS RECEIVER'S list, and from r7c commit 2 that
    // list is radius-culled (D22) — so two clients in one room legitimately
    // count different foes and neither count is the room's answer.
    netStalled = s0.hud.state === "stalled";
    E.state = netStalled ? "active" : s0.hud.state;
    E.wave = s0.hud.wave;
    // ---- `E.loop` RIDES THE SNAPSHOT (R7 / r7c commit 6, R3.6) -------------
    // THE BILL THAT STOOD HERE IS PAID. It read, in full:
    //   "(R7 BILL) `E.loop` — production's arc loop counter (PORT-S S7) — HAS NO
    //    SOURCE HERE. It is written by `applyKernelHud` watching the wave FALL
    //    and by the wipe, and a `?mp` client runs neither: it ASSIGNS E.wave
    //    from the snapshot on the line above, so a fall-watching derivation
    //    would fire on DECODE ORDER rather than on the sim. So a client's
    //    `E.loop` stays 0 until the wire carries it, and it rides the ROSTER
    //    message beside the seat's own market hand ... Nothing on the client
    //    reads E.loop today, so the hole costs nothing until R7 opens it."
    // Every sentence of the DIAGNOSIS is still true. The last one is not, and
    // the CHANNEL it names was reversed.
    //   IT DOES NOT RIDE THE ROSTER (R3.6, map items 19/50). Three measured
    // reasons, and the first alone settles it: a SPECTATOR HAS NO SEATED BRANCH,
    // so a loop that rode the hand's message would never reach the screen the
    // badge is drawn on. A JOINER between two `you` messages would hold a stale
    // loop for as long as nobody was granted or released. And the POR's own rule
    // is that PERSISTENT state rides snapshots — `state`, `wave` and `clearTick`
    // are on the three lines around this one for exactly that reason.
    //   AND SOMETHING READS IT NOW, which is the other half of the retired
    // sentence: js/encounter.js's `waveHeader` appends " · LOOP n" to the badge
    // for any `E.loop > 0`, and until this line that badge was dark on every
    // net client however many arcs the room had turned.
    E.loop = s0.hud.loop | 0;
    // ...and the SERVER's clear-hold LENGTH (r7c commit 8, R3.8). It is NOT
    // written into ECFG: that is the client's own configuration and a solo run
    // on the same page must keep its own. It is held here and read back through
    // Net.hudHold(), which js/encounter.js's countdown asks on the
    // presentedBodies() cross-seam idiom.
    netHold = s0.hud.hold | 0;
    E.clearTick = s0.hud.clearTick;
    E.waveTick = s1 ? lerp(s0.hud.waveTick, s1.hud.waveTick, k) : s0.hud.waveTick;
    // the buy cue reads the LOCAL seat's vector — a remote seat's purchase
    // must not ring the local player's till. A snapshot that carries no record
    // for the local seat (a spectator between deals) leaves the cue untouched
    // rather than ringing a phantom rank drop.
    const mine = s0.players.find((p) => p.seat === localSeat());
    // ...and a PARKED record says nothing either: it carries no `ow` (v8), and
    // vacateSeat leaves the seat's ranks in place, so reading it as an empty
    // vector would ring the till on the reclaim's first full record. localSeat()
    // folds a seatless client to 0, so this is every spectator's screen.
    if (mine && !isParked(mine)) {
      const ownedSum = (mine.ow || []).reduce((a, b) => a + b, 0);
      if (lastOwnedSum >= 0 && ownedSum > lastOwnedSum && window.Sfx) Sfx.cue("buy", null, undefined, localSeat());
      lastOwnedSum = ownedSum;
    }

    // --- enemies: keyed by id; a body in both snapshots lerps, one missing
    // from the newer holds its s0 pose until the presented clock passes its
    // death, one only in the newer appears when its snapshot becomes s0.
    // The client stamps e.stats via statsFor — drawAnvil and the edge arrows
    // read it, and a stats-less body throws.
    // (the per-wave stat table retired at commit D4; since r7a commit 6 the
    // KIND rides the wire, so a body's radius and its speed ceiling are its
    // own again — read off the kernel's published STATS by the name the wire
    // carried. See the block at BODY_R_UNKNOWN.)
    const e1by = s1 ? new Map(s1.enemies.map((e) => [e.id, e])) : null;
    NETV.enemies = s0.enemies.map((e0) => {
      const e1 = e1by ? e1by.get(e0.id) : null;
      // v5: the wire carries enum INDICES; the decode hands back exactly the
      // strings v4 carried, so stats lookup, render and every scorer bucket
      // downstream read the same values they always did
      // v11: the body names ITS OWN KIND and ITS OWN STATE. `kind` is null for
      // an index the table does not know — never "dart", which is the fallback
      // this commit retired: it answered for all 21 kernel types at once.
      const type = e0.kind || null;
      const mode = e0.state || "";
      const stats = { ...bodyStats(type) };
      // THE DEFAULT IS HOLD, NOT `seek` (r7a commit 6). ENEMY_POLICY is keyed on
      // production's retired mode names, and the kernel's thirty-six states are
      // not among them — so before this line the fallback was `seek`, THE ONE
      // POLICY WITH project: 1, and every kernel body was led forward on a
      // horizon the client invented. server/sim-host.mjs's own gather note
      // named that as part of the ty:-1 lie. An unknown state now HOLDS and
      // projects nothing, which is what a client that does not know a body's
      // behaviour should do. A per-state policy table for the kernel's states
      // is R8a's, filed with the state ENUM it belongs beside.
      const pol = ENEMY_POLICY[mode] || ENEMY_POLICY_UNKNOWN;
      // THE BOUNDARY. A mode change between the brackets is a discontinuity:
      // pose, countdown and facing all HOLD at s0, and nothing is projected
      // across it. (`t` is the load-bearing half — lerping a countdown through
      // a mode change manufactures values the sim never held.)
      const held = !!(e1 && pol.boundary === "hold" && (e1.state || "") !== mode);
      const cap = enemyCap(type);
      // THE PER-BODY BOUND on the horizon. A mode that counts down may never be
      // led past its own remaining ticks: the tick after `t` runs out is a mode
      // the client has not been told about, and leading into it is the same lie
      // the boundary hold refuses. The wall is bounded inside presentBody.
      //
      // HONESTY, because this reads as if it does more than it does: the bound
      // is INERT for `seek`, the only mode currently projected. A seeking body
      // never carries a live countdown — every transition INTO seek happens at
      // t <= 0 (js/encounter.js:1277, :1283, :1329) and nothing sets `t` while
      // seeking — so `e0.t > 0` is always false there and the horizon is the
      // measured lead alone. It is kept universal because it costs nothing and
      // is right, and it is LOAD-BEARING the moment `dash` is switched on: a
      // lunge is exactly a counting-down mode, `t` is its remaining dash ticks,
      // and without this a projection would fly the charger straight through
      // the end of its own lunge.
      const bodyLead = pol.project > 0
        ? Math.min(lead * pol.project, e0.t > 0 ? e0.t : Infinity) : 0;
      const pose = presentBody(pol, e0, e1, k, h, cap, held, bodyLead, stats.r);
      // HOISTED, because each is now read TWICE and a second expression is a
      // second thing to keep in step: `t` is both the wire's own key and the
      // renderer's `timer`, and the presented heading is both `face` and the
      // renderer's `angle`/`pangle`. One computation, two names.
      const tNow = e1 && !held ? lerp(e0.t, e1.t, k) : e0.t;
      const faceNow = e1 && !held ? alerp(e0.face, e1.face, k) : e0.face;
      return {
        id: e0.id, type,
        x: pose.x, y: pose.y,
        vx: 0, vy: 0, r: stats.r, hp: e0.hp | 0, stats, orbDrop: 0,
        mode, cd: 0,
        t: tNow,
        face: faceNow,
        lockA: 0,   // R1.12: lockA is not on the v11 wire — it was a hardcoded
                    // zero at server/sim-host.mjs and the encoder's conditional
                    // triple that read it was unreachable
        flash: e0.fl, pulseHit: false, dashHit: false,
        // ---- THE TELEGRAPH FIVE, DECODED (R7 / r7c commit 4, R3.4) --------
        // Back under the names js/demo-render.js reads them by — `lance`,
        // `lanceAngle`, `dashAngle`, `phase`, `enraged` — because the renderer
        // is the consumer and a second vocabulary at the decode would be a
        // second thing to keep in step. The wire's short names exist to save
        // bits, not to be a second API.
        //   HELD, NEVER INTERPOLATED. Every one of the five is either an
        // ANGLE the draw rotates by, a countdown the draw divides by, or a
        // BIT — and lerping any of them across a mode change manufactures a
        // value the sim never held, which is the same refusal `t` and the
        // boundary hold above already make. They ride s0 as they arrived.
        //   AND NOW THEY PAINT (S-fxg8ts). What stood here said "NO DRAW IS
        // ADDED HERE ... there is no setNetBodies seam — the wire half is R7's
        // and the draw half is the look plane's". The draw half landed: the
        // seam exists, js/demo-render.js's body loop reads the list this map
        // builds, and the fields below are what it reads. Still NO NEW DRAW —
        // the shipped `drawEnemy` is handed this body unedited, which is the
        // same rule DRAW-2 was refused under.
        lance: e0.lance, lanceAngle: e0.lanceA,
        dashAngle: e0.dashA, phase: e0.phase, enraged: !!e0.rage,
        // ---- THE RENDERER'S OWN NAMES (S-fxg8ts) ---------------------------
        // MEASURED, NOT GUESSED. The subject is the union of `e.<key>` reads
        // over js/demo-render.js's body draw (drawEnemy and everything it
        // calls): type state timer phase lance enraged emerge emergeMax angle
        // pangle x y px py shieldPulse shield pphase lanceAngle id hit
        // weakPulse vulnerable supportTarget shieldHeat r dashAngle
        // chargeAngle brokenNodes. Everything above already answers part of
        // it; this block answers the rest, IN THE SAME LITERAL — a second
        // object built per body per frame would be a second allocation and a
        // second place for the two name sets to drift.
        //
        //   `state` is the biggest miss of the set: 36 reads, and `drawEnemy`
        // BRANCHES on it for every telegraph. It is the same string `mode`
        // carries — the gather calls the kernel's `state` "mode" and the wire
        // calls it `state`; the renderer calls it `state` too, so it gets both.
        state: mode,
        //   THE HEADING, under the two names the draw rotates by. `angle` is
        // the pose it draws at and `pangle` the previous one; the successor
        // field renders at ALPHA 1 (js/game.js drawSuccessorField:
        // `DemoRender.render(..., 1)`), so `lerpAngle(pangle, angle, 1)` is
        // `angle` and the pair is the presented heading twice. VERIFIED at the
        // gather rather than assumed: server/sim-host.mjs maps `face: e.angle`
        // — the wire's `face` IS the kernel body's `angle`.
        angle: faceNow, pangle: faceNow,
        //   THE PREVIOUS POSE, for the same reason: `renderPos` reads `o.px`
        // and `o.py` and at alpha 1 returns `px + (x - px) * 1`. The presented
        // pose twice is exact there, and leaving them undefined is a NaN
        // position rather than a wrong one.
        px: pose.x, py: pose.y,
        //   THE PER-STATE CLOCK, in SECONDS, and the unit was verified at both
        // ends. server/sim-host.mjs's gather maps `t: e.timer`, and the kernel
        // counts that field down with `e.timer -= dt` in SECONDS
        // (js/demo-kernel.js: 1.35, 1.8, 5.8, 0.95 ...). Every renderer read is
        // `1 - e.timer / <a seconds constant>`, so the wire's `t` needs no
        // conversion at all: `t / 60` would be wrong by sixty and a fold to 0
        // would pin every telegraph at FULL CHARGE for its whole life.
        //   THE QUANTUM IS A KNOWN LOSS AND IT IS FILED, NOT PAPERED OVER.
        // js/wire.js's ROW_BODY spells `["t", U(16)]`, and `putField`'s `u`
        // arm ROUNDS — so a 1.35 s charge crosses as 1 and a 0.12 s one as 0.
        // The clock is the right clock in the right unit at a one-second
        // quantum. The bracket lerp above ramps it between the integer stops,
        // so a telegraph sweeps rather than steps; a `Q(16, 1/60)` row would
        // make it exact and costs no bits, and that is a WIRE change, which
        // this seam is not allowed to make. Filed with the state ENUM as R8a
        // debt, beside the row it belongs to.
        timer: tNow,
        //   THE HIT TINT, which the wire already carries. `drawEnemy` reads
        // `e.hit > 0` for its stroke colour and width; the gather sends
        // `flash: (e.hit || 0) * 60` and the decode names it `flash` above, so
        // the value is in hand and the divide gives it back under the
        // renderer's name. `fl` is U(8), a whole tick, and the tint is a
        // boolean read — the quantum cannot be seen.
        hit: (e0.fl || 0) / 60,
        //   ...AND THE ZERO FOLDS. Every remaining key the draw reads, present
        // and false, so no branch reads `undefined`. These are NOT on the wire
        // and this is not a claim that they are: an absent shield is no
        // shield, an absent emergence is a body already emerged, an absent
        // node count is an unbroken hull. `emergeMax: 1` rather than 0 because
        // the draw divides by it on the arm `emerge > 0` guards — a fold that
        // can never divide by zero even if the guard moves.
        //   `supportTarget: null` is safe at its reader: `findEnemy` is the
        // kernel's and its first line is `if (!id) return null`, and
        // `drawSupportLink` returns on a null target. Checked, not assumed.
        //   `pphase` mirrors `phase` for the star-eater's segment lerp, the
        // same alpha-1 identity `pangle` rides.
        emerge: 0, emergeMax: 1,
        shield: 0, shieldPulse: 0, shieldHeat: 0,
        weakPulse: 0, vulnerable: false, brokenNodes: 0,
        supportTarget: null, chargeAngle: 0, pphase: e0.phase,
        // the radar latch's PING is a PAST world point, draw-only: it is held
        // from s0 and never interpolated, never projected, never fed to any
        // interpolator. prT joins the hold column explicitly here.
        predX: 0, predY: 0, predT: 0,  // R1.12: the projection triple is not on
                                       // the v11 wire either, for the same reason
        contactCd: 0, contactTaken: false,
      };
    });

    // --- MISSILES: THE ROW IS GONE FROM THE WIRE (R0.4, r7a) ---------------
    // What stood here decoded `s0.missiles`, rebuilt a trail per missile from
    // presented positions, and derived the steering phase from the wire's
    // `age`. It was a TRAP: `missiles[]` has had no producer since the
    // harrier's seeker retired at PORT-S S3b lane 3 commit D4, so the map ran
    // over an empty array on every tick and nothing exercised the body — and
    // the first non-empty array would have thrown on `cfg.missile`, which the
    // client no longer configures. R0.4 deletes the schema row; this is the
    // decode that read it.
    //   `trails` and `liveIds` went with it — they were the missile trail's
    // own store and had no other reader. R7's kernel ROUNDS are the successor
    // ordnance and they arrive as their own row and their own store (r7a's
    // commit 8), not by reviving this one.
    NETV.missiles = [];   // ...and it stays empty: see the declaration above

    // --- orbs and bullets
    const o1by = s1 ? new Map(s1.orbs.map((o) => [o.id, o])) : null;
    // both stay LINEAR by policy, and neither carries a wire velocity: an orb
    // drifts, and a bullet is a straight mover whose whole life is a constant
    // vector — a curve has nothing to correct on either
    E.orbs = s0.orbs.map((o0) => {
      const o1 = o1by ? o1by.get(o0.id) : null;
      const pose = presentBody(POLICY.orb, o0, o1, k, h, 0, false, 0, 0);
      return { id: o0.id, x: pose.x, y: pose.y, vx: 0, vy: 0 };
    });
    // v11 (O2.8, commit 10b): `bullets[]` is `full`-ONLY. A player round's pose
    // stopped riding per tick — a reliable `shot` event carries the spawn and
    // the store below derives the straight flight — so this list is non-empty
    // only on a resync or a grant, and it RE-SEATS the store whole.
    if (s0.full) {
      derivedShots.clear();
      for (const b of s0.bullets || []) seedShot({ id: b.id, seat: b.o, k: b.k,
        x: b.x, y: b.y, vx: 0, vy: 0, ttl: 1 });
    }
    // ...and the presented list is the STORE's, not the wire's. Everything
    // downstream — the streak, the carry, the owner-scoped budget and the
    // tracer hand-off — reads exactly the shape it read before.
    const wireBullets = [...derivedShots.values()];
    const b1by = s1 ? new Map(s1.bullets.map((b) => [b.id, b])) : null;
    // what this client knew about each round LAST deal — read from bCarry and
    // NOT from the outgoing G.bullets, which the discontinuities do not clear:
    // resync() and hardSnap() leave the dead run's rounds standing in that
    // array, and a net client never restarts its own encounter, so a colliding
    // id out of the server's restarted id space would inherit a heading that
    // belongs to a match that is over. bCarry is cleared at both cuts.
    const bWas = new Map(bCarry);
    bCarry.clear();
    G.bullets = wireBullets.map((b0) => {
      const b1 = b1by ? b1by.get(b0.id) : null;
      const pose = presentBody(POLICY.bullet, b0, b1, k, h, 0, false, 0, 0);
      const x = pose.x, y = pose.y;
      const was = bWas.get(b0.id);
      // vx/vy is DERIVED, RENDER-ONLY, and never on the wire: the encoder sends
      // { id, x, y, o } and the byte band has no room for two more floats. It is
      // the forward difference across the very bracket the pose is lerped in, so
      // it is constant under alpha — the one property js/fx.js's streak needs
      // and the reason that draw refuses (x - px). Zero is what shipped here,
      // and zero is a round with NO streak at all: the own shot's tracer had one
      // and lost it at the hand-off, and no other seat's round ever wore one.
      //   h is s1.tick - s0.tick: +1 ordinarily, NEGATIVE under the starvation
      // guard, which reverses the endpoints deliberately (s1 older than s0).
      // Both sign flips cancel, so ONE expression serves both branches — the
      // divide is load-bearing and must not be simplified away.
      //   No b1 means the bracket has no second sample. Ordinarily that is the
      // round's death tick (a disappearing id IS the death, and presentBody
      // freezes the pose at s0 for it); under starvation the same shape means a
      // NEWBORN, absent from the older endpoint. The last vector we drew is the
      // honest answer to both, and a round never seen before keeps the 0.
      let vx = 0, vy = 0;
      if (b1) { vx = (b1.x - b0.x) / h; vy = (b1.y - b0.y) / h; }
      else if (was) { vx = was.vx; vy = was.vy; }
      // ...and ox/oy is where this round FIRST showed up on THIS screen, which
      // is all a clamp on its own streak can honestly mean here: the muzzle is
      // a sim fact the wire does not carry, and the server's lag rebate has
      // already flown the round most of a round trip before its first snapshot.
      // The own shot is the exception and it is handled at the hand-off below.
      //   The NOSE is out of reach here for the same reason the remote plates
      // hold nose-right: the wire carries no heading until R7 (v11), so a
      // remote round's nozzle cannot be honest yet — first-seen seeding is the
      // owner-accepted split-brain, restated for the nozzle.
      const ox = was ? was.ox : x, oy = was ? was.oy : y;
      // ...and the round's LOOK rides the carry the same way: the wire sends
      // no ink (the encoder's { id, x, y, o } band), so the only look a wire
      // round can wear on this screen is the one the hand-off below stamped
      // from its own tracer — a REMOTE seat's rifle round stays a white dot
      // until the wire learns to carry the record (R7's business, with the
      // heading). Undefined for every round the hand-off never touched.
      const ink = was ? was.ink : undefined, streak = was ? was.streak : undefined;
      const br = (was && was.r) || 2.2;
      bCarry.set(b0.id, { vx, vy, ox, oy, ink, streak, r: was && was.r });
                            // ...for the next deal to read. A round that stops
                            // appearing simply stops being written, so the map
                            // is swept by the rebuild itself, never by a
                            // live-id pass.
      // v4: the wire's owner seat replaces the hard-coded "player" stamp —
      // bulletSeat() reads the int directly, and the legacy-string alias
      // stays for local mode's suite synthetics only
      return { id: b0.id, x, y, px: x, py: y, vx, vy, ox, oy, ink, streak,
        r: br, dmg: 0, owner: Number.isInteger(b0.seat) ? b0.seat : 0,
        ttl: 1, dead: false, spent: false };
    });
    // the tracer HAND-OFF: the FIRST authoritative own bullet appearing in
    // the presented state takes over from the OLDEST live tracer. Matching
    // is owner + window — shot ids only if this ever proves ambiguous (one
    // seat's bullets confirm in send order over TCP, so it has not).
    if (mySeat !== null) {
      for (const b of G.bullets) {
        if (b.owner !== mySeat || b.id <= maxOwnBulletId) continue;
        maxOwnBulletId = b.id;
        if (tracers.length) {
          // the cue's MUZZLE rides across with it. Both live in the raw
          // predicted frame, so the two agree about where the shot left; take
          // the origin over and the streak the player has been watching keeps
          // its length instead of collapsing to nothing and growing back over
          // the three ticks after the hand-off.
          const cue = tracers.shift();
          b.ox = cue.ox;
          b.oy = cue.oy;
          // ...and the cue's LOOK, so the slug the player watched keeps its
          // clay ink and streak past the hand-off instead of turning into the
          // wire's white dot — render-only fields, stamped only where the cue
          // carried them, so a gun cue changes nothing.
          //   ACCEPTED RISK (owner, 2026-08-22): the match is OWNER + WINDOW,
          // oldest tracer first, no shot id — safe while every own round flew
          // alike, which stops being true here. A gun round confirming first
          // can eat a rifle cue (a slug in WHITE) and the reverse (a gun round
          // in CLAY); watch for it in play, do not redesign the matching.
          if (cue.ink !== undefined) {
            b.ink = cue.ink;
            b.streak = cue.streak;
            if (cue.r) b.r = cue.r;
          }
          const c = bCarry.get(b.id); // ...and into the carry, or the next deal
          if (c) {                    // re-seeds it at the round's own pose and
            c.ox = b.ox; c.oy = b.oy; // the transplant lasts exactly one frame
            c.ink = b.ink; c.streak = b.streak; c.r = b.r;
          }
          spec.cueMatched += 1;
        }
      }
    }

    // --- THE DERIVED PLANE (O2, O3): advance both stores to the presented
    // tick, seed from a `full` snapshot, and publish PREV/CUR poses so the
    // presentation chain lerps them through the bracket it already has.
    advanceDerived(s0.tick, !!(s0.hud && s0.hud.sweep));
    if (s0.full) {
      // a full snapshot carries EVERY live round and orb, un-culled (O2.5), so
      // it is the one message that can re-seat the stores whole. r7b's resync
      // and r7c's grant are what set the flag; nothing in r7a does.
      clearDerived();
      derivedTick = s0.tick;
      // ...and a CONSTRUCT is skipped HERE TOO (r7b FIX 4). `s0.rounds` is the
      // wire's construct list — `js/wire.js` filters it to `full || r.construct`
      // — so every row in it on an ordinary snapshot is already a construct, and
      // seeding one would double-draw it exactly as the event arm did. On a
      // `full` snapshot the list carries every live round, so the test is what
      // separates the two.
      for (const r of s0.rounds || []) if (r.kind && !isConstructKind(r.kind)) seedRound(r);
      for (const o of s0.orbs || []) seedOrb(o);
    }
    // the CONSTRUCTS ride per tick and are presented from the wire like any
    // other body; the DERIVED rounds are presented from the store. Both end up
    // in one list, because to the draw a round is a round.
    NETV.rounds = (s0.rounds || []).map((r) => ({ id: r.id, kind: r.kind,
      x: r.x, y: r.y, vx: r.vx, vy: r.vy, st: r.st, derived: false }))
      .concat([...derivedRounds.values()].map((b) => ({ id: b.id, kind: b.kind,
        x: b.x, y: b.y, vx: b.vx, vy: b.vy, st: 1, derived: true })));
    NETV.orbs = [...derivedOrbs.values()].map((o) => ({ id: o.id, x: o.x, y: o.y }));
    // ...AND THE DRAW (DRAW-1, §2.5(m)3). ONE SETTER, no new draw code: the
    // shipped renderer's round loop already walks a list, and it is handed this
    // one. The setter follows setHostedView/setCamOrigin's idiom exactly, which
    // is what a WIRE round is allowed to do to a render plane — copy the
    // reference call, design nothing. js/game.js's drawSuccessorField carries
    // the matching net arm, because in `?mp` no EncounterHost is installed and
    // its guard returned before this could reach a canvas.
    //
    // THE FIRST FORM OF THIS WROTE INTO THE DORMANT KERNEL'S OWN `S.bullets`,
    // which needs no setter at all — and it was MEASURED WRONG: the fx suite
    // shares that array on the same page, and the net client's apply() emptied
    // it under a leg that was drawing into it ("the standard round draws the
    // demo's BOLT" red on the first full gate). A dormant store is not a
    // private draw buffer. The setter owns a list of its own.
    if (window.DemoRender && DemoRender.setNetRounds) DemoRender.setNetRounds(NETV.rounds);
    // ...AND THE BODIES, THE SAME HAND-OFF (S-fxg8ts). `NETV.enemies` was
    // filled by the body map above, in this same function and above this line,
    // so the list handed over is this tick's. One setter, no new draw code:
    // js/demo-render.js's body loop walks ONE list and it is handed this one,
    // exactly as the round loop is handed `NETV.rounds`.
    //   THIS IS WHY THE ENEMIES WERE HITTABLE AND INVISIBLE. The decode has
    // filled this list since r7a commit 6 and `Encounter.mapState()` has fed it
    // to the hit tests and the edge arrows ever since — but nothing gave it to
    // the DRAW, so the renderer walked the dormant kernel's empty `S.enemies`.
    if (window.DemoRender && DemoRender.setNetBodies) DemoRender.setNetBodies(NETV.enemies);

    // --- spawn groups: the portals and the incoming markers draw from the
    // same fields the sim's own groups carry
    NETV.groups = s0.groups.map((g) => ({
      count: g.c, type: "dart", warnAt: 0, spawnAt: 0,
      spawned: !!g.s,
      points: g.w ? { anchor: { x: g.x, y: g.y }, pts: [] } : null,
    }));
  }

  // events fire when the presented clock reaches their snapshot's tick, so a
  // boom lands with the frame that shows it, not the moment the packet arrived
  // ...the tick the LAST apply() actually wrote state from (its s0 — discrete
  // bits stay on s0). fireEvents hands the comet instrument this so a cue from
  // any OTHER tick in a multi-tick drain window cannot claim the applied comet
  // flag as its own tick's truth — see noteCometCue's tickMatched.
  let appliedTick = -1;
  function fireEvents() {
    while (evq.length && evq[0].tick <= pt) {
      const { tick, e, rel } = evq.shift();
      // THE SECOND DROP POINT, and it is skipped for a RELIABLE entry (R2.9).
      // A resume after a pause drops the stale half-second's COSMETIC cues
      // silently instead of playing a backlog as one burst — but a replayed
      // `death` must still blow up the hull it belongs to, and since the split a
      // `roundSpawn` older than 30 ticks must still seed its round or the client
      // has a permanent hole in its derived store.
      if (!rel && tick < pt - 30) continue;
      if (rel) evStats.replayed += 1;
      // THE MEMBERSHIP IS TAKEN BEFORE THE INTAKE, and it has to be: the
      // intake DROPS the round, so asking the store afterwards always answers
      // "no" and the spark below would never fire. (Measured on the first
      // draft: N3 went dark.)
      const wasKernelRound = e.k === "roundDeath" && derivedRounds.has(e.id);
      applyDerivedEvent(e, tick);
      const at = Number.isFinite(e.x) ? { x: e.x, y: e.y } : null;
      // the local seat's own fire and thud already sounded on the PREDICTED
      // edge (predTickK's cueing fx), so the wire's copy is the same shot a
      // round trip later — the very lateness this whole path exists to end.
      // The conjunction is the same one that gates the cue-authoring pass, so a
      // predictor that has given up (an unacked burst) or is parked (the seat is
      // down) authors nothing and this client still hears its own gun.
      //   But it is READ HERE, at drain time, and the cue it is standing in for
      // was authored a round trip earlier — so on a tick where the predictor
      // changed state inside that window the two disagree. Going down costs a
      // doubled sound, which the recipe gaps largely swallow. Coming back up
      // costs the opposite: the queued copies of shots taken WHILE it was down
      // are the only copies there are, and they are dropped — up to the stale
      // guard's half-second of silence, as a bad link recovers. Latching the
      // decision on the authoring tick is the honest fix and is deliberately
      // not attempted here; see S-1qfnge's report.
      //   Only the Sfx line skips. FX.cue and the comet instrument below are
      // separate consumers of this same queue — a light flash and a tripwire
      // reading — and both must still see every event this client is handed.
      // ...and every ABILITY cue the catalog declares joins fire and thud in
      // that list, DERIVED rather than written out again: the predictor sounds
      // an ability on its press edge now, so the wire's copy a round trip
      // later is the same shot twice. The membership test is a four-entry
      // linear scan on a queue drain — cheaper than the Set it would replace.
      const ownEcho = predOn && !predIdle && e.seat === mySeat &&
                      (e.k === "fire" || e.k === "thud" ||
                       (window.Abilities && Abilities.CUE_KINDS.indexOf(e.k) >= 0));
      if (window.Sfx && !ownEcho) Sfx.cue(e.k, at, e.g, e.seat);
      // ...and the light layer, off the same presented queue: in net mode the
      // local sim never steps, so game.js's drainCues() never runs. It sits
      // ABOVE the null guard because the RESTART MARKER carries no position
      // and a net client never restarts its own encounter — that marker is the
      // only signal this layer gets that the authority cut the run. FX.cue
      // refuses a positionless cue itself, so nothing else reaches ink.
      // r7b (O2.3, and D64's row is the shape it raises): a wire `roundDeath`
      // sparks only for a DESTRUCTION — `shot`, `contact` (the kernel's own word
      // is `impact`) and `aura`. A CONSTRUCT's `split`/`expire` is an end the
      // client could see coming, and a `reaped` round was taken by something
      // that destroyed nothing; both drop the round silently. The row's own
      // `clay` hue stands in, because `col` is NOT a schema field — js/wire.js's
      // event row does not carry one — and js/encounter.js says exactly that
      // where `col` is declared: "a ?mp client draws the row's own fallback hue".
      //   ...AND THE SPARK IS THE KERNEL ROUND'S TELL AND NOTHING ELSE (r7b
      // FIX 1). A PLAYER bullet's own end already draws production's `hit` fx,
      // and a second spark per landed shot is a look change nobody ruled — so
      // the gate asks the DERIVED-ROUND store, which holds kernel rounds only.
      // An id neither store knows (a round this client never saw spawn) draws
      // nothing, which is the honest answer rather than a guess.
      const destroyed = e.k !== "roundDeath" ||
        ((e.reason === "shot" || e.reason === "contact" || e.reason === "aura") &&
         wasKernelRound);
      if (e.k !== "termChange" && destroyed && window.FX) FX.cue({ kind: e.k, at, gain: e.g, seat: e.seat });
      // the comet instrument's hurt half. game.js's drainCues() carries the
      // same call, and in net mode the local sim never steps, so this is the
      // only one that ever runs here. The third argument says whether this
      // event's tick is the one apply() wrote the comet flag from — a jump or
      // starvation drain empties a whole window against one flag, and the
      // instrument's tripwire must not fire on the mismatched ones.
      noteCometCue(e.k, e.seat, tick === appliedTick);
      // ...and the screen shake, a fourth consumer of the same queue. This
      // doorway (Shake.cue) covers kill/killheavy, clear and the local-seat
      // ram inference ONLY — it strips every ability cue kind itself, because
      // the own rail already tapped on the predicted edge in ownCue above and
      // the wire's copy here would double it.
      // `at` rides along because a KILL is culled by distance there, on the
      // same falloff js/audio.js attenuates this queue's sound with.
      if (window.Shake) Shake.cue(e.k, e.seat, at);
      if (!at) continue;
      // (NO DAMAGE TAP HERE ANY MORE — fix 11. Fix 9 counted decoded `hit`,
      // `boom` and `blast` events into D39's stall signature from this loop, and
      // the scoped check found that a wall hit, a PvP blast and a shot into a
      // nonblocking mine all arrive on this stream — so the term measured noise
      // rather than combat. It is the kernel's blocker-damage count now, which a
      // net client does not step: the client's signature is its blocking count
      // alone until R7 puts a body's kind and state on the wire. See
      // `js/encounter.js`'s `stallSignature` for the whole R7 bill.)
      // `boom` and `clang` are DELETED as disjuncts here (R2.9). A census over
      // js/ server/ tests/ test/ finds no producer of either: neither name
      // appears in an `emit(` or a `sink.cue(` call anywhere in the tree, and
      // neither is a row in js/wire.js's EVENT_KINDS, so the encoder would
      // REFUSE one with a metric before it could reach this line. The only live
      // mentions left are three CUE-NAME lists in tests/audio-checks.js, which
      // are the audio plane's own vocabulary and not this stream's.
      //   THE RETIRED-D45 BURST IS DELETED HERE (r7c commit 9, R3.9,
      // S-pfeza7). What stood on the `hit` arm was
      //     if (e.k === "hit") spawnImpactFx(at.x, at.y, 0, -1, "enemy");
      // and that is the EXACT CALL D45 deleted in production. js/encounter.js
      // records the deletion by name at its own site: "production's clay impact
      // burst is GONE from this branch. A hit on a kernel body used to paint 23
      // particles, 21 of them production's own orange, over the two the kernel
      // spawns in the body's colour. The kernel's pair is the whole tell now,
      // which is what the demo draws."
      //   IT SURVIVED HERE BECAUSE `?mp` WAS NOT SHIPPING. R7 ships it, and a
      // net client painting 21 orange particles over a kernel hit that a solo
      // client paints two for is the same wrong look D45 removed, on the one
      // surface nobody was looking at.
      //   THE CUE ITSELF STAYS, exactly as production kept `emit("hit")`: the
      // FLASH is still raised (js/fx.js's `hit` row is `flash: 0.35`), and the
      // sound and the light layer read the same event. This is a PARTICLE
      // decision, not a channel one — which is production's own sentence for it.
      //   `wall`, `blast` AND `death` KEEP THEIRS. D45 zeroed `kill`,
      // `killheavy` and `hit` and deleted the enemy impact burst; it touched
      // neither the wall spark nor the PvP blast, and tests/net-checks.js's
      // light-layer leg is staged on `blast` for exactly that reason.
      if (e.k === "wall") spawnImpactFx(at.x, at.y, 0, -1, "wall");
      else if (e.k === "blast") spawnImpactFx(at.x, at.y, 0, -1, "blast", blastRadiusNow());
      // a SEAT dying — the event carries the seat that paid, so this client
      // blows up every hull that goes, not only the one it happens to fly.
      // Landing it here means it lands on the frame that SHOWS the death,
      // like every other cue on this queue, and never the moment the packet
      // arrived. The wreck and its countdown are the ship draw's half.
      else if (e.k === "death") spawnShipBlast(at.x, at.y, e.seat | 0);
    }
  }

  // ---- upstream UI routes (the hooks encounter.js asks first) ---------------
  // A shop purchase travels as a RESOLVED row index ({v, ui: "buy", item}).
  // The client hit-tests locally through the shared shopLayout() table —
  // whose LOGICAL PANEL space is client-independent — and only the row
  // identity goes upstream: the server has no window, no dpr and no gutter,
  // so device-derived coordinates must never cross the wire. The legacy
  // {v, ui: "click", x, y} message is GONE from the wire entirely — the
  // server no longer decodes it (see the shape list above handleSeatMessage
  // in server.js), and a coordinate route cannot come back: shopClick(x, y)
  // carries no seat, so the server had to resolve the buyer through the sim's
  // own pointer path, which answered SEAT 0 for every client — one seat spent
  // another's wallet. It could not be made seat-aware either, because
  // E.shopHover, the slot that path writes on its way to buy(), is one global.
  // A resolved row index is the only purchase shape there is.
  // A spectator sends neither: the server ignores an unseated socket's game
  // messages anyway, and a client that knows it holds no seat should not spend
  // the wire proving it.
  function routeBuy(item) {
    if (mySeat !== null && ws && ws.readyState === 1 && helloed) {
      ws.send(JSON.stringify({ v: NET_V, ui: "buy", item }));
    }
    return true; // consumed either way — a net client never buys locally
  }

  function routeRestart() {
    if (mySeat !== null && ws && ws.readyState === 1 && helloed) {
      ws.send(JSON.stringify({ v: NET_V, ui: "restart" }));
    }
    return true;
  }

  // the sim consumes frames through the ring only in tick mode — net mode
  // pins it, and the wire is the only lag from here on
  setInputMode("tick");
  setInputLagNet();
  function setInputLagNet() {
    const el = document.getElementById("inputlag");
    if (el) el.disabled = true; // the rehearsal slider stands down — this IS the network
  }

  window.Net = {
    active: () => true,
    // THE DECODED VIEW (commit D5) — the client's own bodies, ordnance and
    // spawn portals, which used to be written straight into the simulation's
    // state. `Encounter.mapState()` is the ONE reader: it is the accessor
    // every presentation path already crosses to reach a body, so a net client
    // and a solo one hand the renderer the same shape from different sources.
    // Live references, never copies — the same contract `mapState` states for
    // its own arrays: callers draw from these and never mutate them.
    view: () => NETV,
    // the wire version this build speaks. Published so a suite can address the
    // live number instead of mirroring it by hand — a hand-written `v: 8` in a
    // test file is a FOURTH copy of a constant test/node-golden.mjs already
    // pins in three places, and it reds every wire bump for the wrong reason.
    wireVersion: () => NET_V,
    // THE seat this client flies, or null while it spectates or waits for its
    // grant. game.js's localSeat() reads it and folds null to 0.
    seat: () => mySeat,
    // the room's SEAT RANGE, straight off the last `you` — -1 until the first
    // one lands. It is NOT rosGranted: that is the seated COUNT (sockets held),
    // which says nothing about which ids exist. game.js's grantedSeat() bounds
    // the granted id against this instead of the last snapshot's player list,
    // because a grant can legitimately name a seat the snapshot has not shown
    // yet. A plain field read, no allocation — it is on the per-view path.
    maxSeats: () => rosMax,
    // ...and the seat's DISPLAY NAME, or null where there is none. Straight off
    // the last `you` — a plain indexed read with no allocation, because
    // js/encounter.js's board calls it once per row per frame. It answers null
    // for a seat outside the roster's range and for a seat with no record yet,
    // which is a real state: pre-start the server reports maxSeats 4 before any
    // snapshot has widened the player list, so a card can render for a seat
    // nothing else knows about. The board's Player-N fallback covers both.
    seatName: (s) => (Number.isInteger(s) && s >= 0 && s < seatNames.length
      ? seatNames[s] : null),
    // ...and the seat's hull, read off the same roster. Null for a seat outside
    // the room's range and for one nobody is flying — R4's drawHull reads this
    // and falls back to the default hull on a null, exactly as the board falls
    // back to Player-N on a nameless row.
    seatSkin: (s) => (Number.isInteger(s) && s >= 0 && s < seatSkins.length
      ? seatSkins[s] : null),
    // ...and THIS client's own market hand (R7 / r7c commit 5, D37). It is not
    // a roster read and takes no seat argument: `you`'s seated branch carries
    // ONE hand, this client's, so there is no other seat to ask about. The
    // panel reads it to draw the four rows it may actually buy — the shelf the
    // SERVER will honour, rather than whatever a local encounter happened to
    // deal itself.
    //   COPIES, not the live arrays: a caller that spliced the answer would be
    // editing this client's record of what it holds.
    // D39's stall, as the SERVER decided it (r7c commit 7). js/encounter.js's
    // count line reads this through its own cross-seam helper, so a net client
    // draws the room's answer instead of its own culled body census.
    stalled: () => netStalled,
    // the SERVER's clear-hold length in ticks, or 0 where no snapshot has said.
    // js/encounter.js's NEXT WAVE IN countdown reads this and falls back to its
    // own ECFG.clearHold on the zero — a client cannot count down a break it
    // has not been told the length of, and its own dial is the only other
    // number it has.
    hudHold: () => netHold,
    hand: () => (seatHand === null ? null : seatHand.slice()),
    handBought: () => (seatBought === null ? null : seatBought.slice()),
    // ...and THIS client's own name, which is not a roster read: a seatless
    // client has no row on the board and no entry in `names`, and the claim
    // card is exactly the screen where a name is worth asking for. It follows
    // the server's answer for this client's own seat as soon as one arrives
    // (see the `you` decode), because the server's sanitize is the only one
    // that reaches a screen.
    ownName: () => ownName,
    ownSkin: () => ownSkin,
    pickSkin,
    // ...and the editor over it. nameEdit answers the LIVE buffer while an edit
    // is open and null while none is — null, not "", because an empty buffer is
    // a real state (a player clearing a name) and js/encounter.js has to draw a
    // caret over it rather than fall back to the accepted name.
    nameEdit: () => (editing ? editBuf : null),
    // ...and the two levers. js/game.js opens on a click that lands on an
    // affordance and closes (COMMITTING) on any other press and on pause();
    // Enter and Escape close from the keydown listener above.
    openNameEdit, closeNameEdit,
    // ...and whether the keyboard currently belongs to the editor. js/game.js
    // and js/encounter.js ask before acting on a key. The listener above stops
    // the bubble besides — the two guards are redundant on purpose.
    typing: () => editing,
    // ...and the half of that null the fold destroys: this client, and only
    // this client, has had a seat taken back. Set by the `you` that took it and
    // spent by the first presented snapshot that says the seat is not released
    // — so it can outlive the grant that answers the reclaim, which is the
    // point. js/encounter.js draws the SEAT RELEASED card off it.
    released: () => released,
    // ...and whether the ask that card invites has already come back empty. The
    // card is drawn off `released` and only its SECOND LINE off this, so a
    // refusal changes what the screen promises without taking the screen away.
    refused: () => refused,
    clientTick,
    noteDrawn, // the loop render's view-tick report — see the record above
    flushInputs,
    buy: routeBuy,
    restart: routeRestart,
    stats: () => ({ url, sent, snaps, stale, pt, ptPrev, vtDrawn, ntick,
      // v11 (R2.2): the tick of the newest marker the predictor cut on. It is
      // the EVENT's tick and not the delivering snapshot's, which is the whole
      // difference a replayed marker makes.
      cutTick: lastCutTick,
      // ...and WHICH FIELDS the last `you` carried (r7c FIX F12). A copy, so a
      // caller that spliced the answer would not be editing this client's
      // record of what it was sent. Adding a key to this object is safe — the
      // census rule is that `test/tools/` is grepped before one is REMOVED.
      youKeys: lastYouKeys ? lastYouKeys.slice() : null,
      // ...and the EVENT PLANE's own five (R2.9). Adding a key to this object is
      // safe — the census rule is that `test/tools/` is grepped before one is
      // REMOVED, not before one is added.
      ev: { ...evStats },
      buffered: buf.length, newest: buf.length ? buf[buf.length - 1].tick : -1,
      snapshotGapMs: lastSnapGap, snapshotGapP95Ms: gapP95(),
      // the ADAPTIVE buffer's two instruments: the live (fractional) target
      // depth and the cached jitter estimate that derives it
      starved, starveLongest, targetDepth: delayTarget,
      targetDepthWant: wantedDepth(), jitterP95Ms: jitterEst,
      // the MEASURED presentation lag the projection column leads by, in ticks
      // — 0 while the starvation guard is driving. It is derived, not stored,
      // so publishing it costs nothing and a leg can assert the exact bound the
      // overshoot guard allowed rather than a generous one.
      leadTicks: starving ? 0 : leadTicks(),
      // the decoded body's speed CEILING, published so a check can name the
      // real bound instead of restating it — the `POINTER_MAX` idiom. It is a
      // single fallback since PORT-S S3b lane 3 commit D4 (the per-wave stat
      // table retired with the roster); R7 re-cuts it per class.
      // the decoded body's speed CEILING, published so a check can name the
      // real bound instead of restating it. It is the WIDEST of the per-class
      // ceilings from r7a commit 6 — one number a rig can read, derived from
      // the same table the per-body guard uses rather than from a retired
      // constant. bodyCapOf(kind) answers the per-class one.
      bodyCap: (() => {
        const T = kernelStats();
        if (!T) return BODY_R_UNKNOWN * 7.5 / 60 * CAP_HEADROOM;
        return Math.max(...Object.keys(T).map((k) => enemyCap(k)));
      })(),
      bodyCapOf: (kind) => enemyCap(kind),
      open: !!(ws && ws.readyState === 1),
      // identity — and the input the server has RESOLVED: ack is the highest
      // contiguous n it banked or explicitly discarded, so ntick − ack is what
      // is still in flight or lost
      seat: mySeat, matchEpoch: myMatchEpoch, seatEpoch: mySeatEpoch,
      ack: lastAck, inFlight: Math.max(0, ntick - lastAck),
      youChanges, epochDrops,
      // the lobby roster as last told: `granted` is seats HELD and `maxSeats`
      // what this room can still deal — both -1 while UNKNOWN, which before the
      // first `you` is the only way to reach it
      roster: { granted: rosGranted, maxSeats: rosMax, started: rosStarted },
      // app-level RTT, in ms; -1 until the first pong comes back
      rttMs: rtt, rttMinMs: rttMin, rttJitterMs: rttJitter, pongs,
      attempts, reconnects, versionDead,
      // the speculative-cue counters — monotone, render-side: the row-2
      // harness seam (cueRefused = shown but never confirmed, the lie count)
      spec: { ...spec },
      // the predictor's row-3 instrument: the CURRENT correction-offset
      // magnitude, the last rebase's absorbed delta, and its liveness
      pred: { on: predOn, idle: predIdle,
        offset: Math.hypot(off.x, off.y), lastRebaseMag, rebases,
        unacked: sentHist.length, tick: predTick,
        tracers: tracers.length } }),
    // the predictor's presented kernel view — the pool and cooldown for
    // game.js's presentedPool, the pose and velocity for the harness; null
    // while the predictor stands down. The comet flag left this record with
    // the halo-wire retirement: the machine's CONFIRMED state reads the wire
    // flag off the player struct, and nothing read predicted().comet any more.
    // R3 2026-08-22: `comet` is BACK, and its absence was a dead read the
    // measurement lane found by measuring. 9796fed ("two small honesty passes",
    // 2026-08-19) dropped the key on the reasonable-looking ground that nothing
    // SHIPPED consumed it — but test/tools/latency-rig.mjs consumed it at three
    // sites (the pc sample column, the achieved-window counter, and
    // scnSeekRam's own `burning` branch), and from that commit on all three
    // read `undefined`. The consequences were silent and total: every comet run
    // since reported 0 windows, latency-score's row-9 ram-disagreement metric
    // found 0 episodes and returned null, and the seek-and-ram pilot never
    // entered its burn branch — while the game itself was burning perfectly
    // (measured on the same runs: cometCueShown rose 411 times and the wire's
    // own comet flag stood on 641 sampled frames). The row-9 prior of 3.81 %
    // was taken at 51b2267 on 2026-08-17, BEFORE this landed, which is why it
    // was never noticed. This is the WIRE_V rotation trap in a second place:
    // an instrument's read is a contract, and a field with no shipped consumer
    // still has one. Render/telemetry only — predK.comet is the predictor's own
    // kernel flag, nothing here is hashed and no wire byte moves.
    //
    // TEST/TELEMETRY ONLY. Do NOT route this key back into presentedPool's
    // record: the comment above that function records why the halo round took it
    // out — the predictor arms comet a few ticks before the wire confirms, and
    // the old halo drew that prediction as truth. Publishing it HERE is safe
    // because both shipped consumers are blind to it (ownLeadOn reads only
    // truthiness; presentedPool builds an explicit en/enMax/cool literal with no
    // spread). Putting it back into the presented record would re-create the
    // defect that round retired.
    predicted: () => (predOn ? { energy: predK.energy, energyMax: predK.energyMax,
      cool: predK.cool, comet: predK.comet,
      x: predK.ship.x + off.x, y: predK.ship.y + off.y,
      vx: predK.vel.x, vy: predK.vel.y } : null),
    // the live speculative-tracer list — game.js draws it in the world pass
    tracers: () => tracers,
    // test seam, nothing shipped calls it: the ?mp expansion as a pure
    // function of a location-shaped object. A page served from 127.0.0.1 can
    // prove the loopback branch by simply existing, but it can never be served
    // from an apex host, so the OTHER branch's arithmetic is only reachable
    // through the rule itself rather than through the page's URL.
    mpDefault,
    // dev/test seam: send one tune message on THIS socket. The server's two
    // dev gates decide, and a connection must clear BOTH: production clears
    // neither, so it drops the message in silence — no reply, no state
    // change, nothing in the snapshot to tell a client it was even tried.
    // The gate conditions and the accepted key table live on the server side
    // and are deliberately not spelled out here. This file mirrors to a
    // PUBLIC site; server/ does not. Read server/tune.test.mjs for the real
    // contract — it pins both gates and the whole key table.
    tune: (key, val) => {
      if (ws && ws.readyState === 1 && helloed) {
        ws.send(JSON.stringify({ v: NET_V, ui: "tune", key, val }));
      }
    },
    // the deliberate hang-up: closes the socket and stands down for good —
    // the close handler sees `intentional` and never schedules a reconnect
    close: () => {
      intentional = true;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      clearInterval(pingTimer); // the RTT probe stands down with the socket
      pendingInputs.length = 0;
      if (ws) ws.close(1000);
      clearDerived();  // ...and the renderer's round AND body handles with the stores
      note("NET closed by the client", false);
    },
    // test seam, nothing shipped calls it: feed one decoded snapshot into the
    // buffer as if the socket delivered it — the one honest way to demonstrate
    // the newest-wins drop, since loopback TCP never reorders on demand
    inject: (s) => onSnapshot(s),
    // ...and its v11 SIBLING (R1.9). `inject` takes an OBJECT and every one of
    // its 65 call sites survives; `decode` takes REAL BYTES and hands back the
    // same object, so a leg can feed the wire's own output through the client's
    // own decoder into the client's own apply — the gate's first true
    // end-to-end trip. Before this the browser suite hand-built the object the
    // decoder was supposed to produce, and the decoder itself was covered by
    // nothing that ran in a browser.
    decode: (bytes) => Wire.decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)),
    // THE DERIVED PLANE'S TEST SEAM (R7 / O2.2, O3). Nothing shipped calls it.
    // Until r7b emits the four event kinds these stores have NO PRODUCER, and
    // the determinism legs are what drives them: seed a round, advance N ticks,
    // read the poses back, and compare against the kernel's own run.
    __derived: {
      // the pending-event queue itself, so a leg can read what SURVIVED a trim
      // rather than inferring it from a counter (R2.9's own claim is about the
      // queue's CONTENTS, and a counter cannot say which entries went)
      evq: () => evq.map((q) => ({ tick: q.tick, rel: q.rel, e: q.e })),
      // THE SHIPPED CONSUMER ITSELF (r7b commit 8), not a copy: fireEvents
      // calls this same function for every drained event.
      apply: (e, tick) => applyDerivedEvent(e, tick),
      seedRound, seedOrb, seedShot, dropRound, dropOrb, dropShot, clearDerived,
      shots: () => [...derivedShots.values()],
      step: (tick, sweeping) => stepDerived(tick, !!sweeping),
      setTick: (t) => { derivedTick = t; },
      rounds: () => [...derivedRounds.values()],
      orbs: () => [...derivedOrbs.values()],
    },
  };
})();
