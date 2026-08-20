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
// eleven-field record, the right-hold comet bit `rh` included: the banked
// frame goes upstream whole, so the server's sim learns comet mode through
// the same ring field local play drains — and the sim's per-seat comet flag
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
// refreshPointerWorld, INPUTMODE, setInputMode, stepImpacts, spawnImpactFx,
// stepShipFx, spawnShipBlast, BLASTR, BLASTGAIN) through the shared global
// lexical scope, and the
// encounter's internals through the __test.enc surface exactly as
// server/sim-host.mjs does.
(() => {
  const NET_V = 8; // MUST equal server/snapshot.mjs's SNAPSHOT_VERSION — a
                   // classic script cannot import it, so this mirrors it by
                   // hand; the s.v gate below silently drops every snapshot
                   // if the two ever drift, and a stale hello meets 4001
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

  // ---- the display name ------------------------------------------------------
  // The ONE piece of state this repository keeps across visits, and the only
  // localStorage key it writes anywhere (js/fx.js's flag comment names the
  // exception). It is a LOBBY fact: the server sanitizes it, stores it per
  // SOCKET and fans it out on the `you` roster — it never enters the sim, the
  // snapshot, or any hash, so no trace and no golden fixture can move for it.
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
  let editing = false;
  let editBuf = "";
  // set by the net branch below. Null in local play, where a name is stored and
  // drawn and never sent anywhere.
  let sendName = null;
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
      typing: () => editing,
    };
    return;
  }

  // ---- the v5 enum tables ---------------------------------------------------
  // Mirrored BY HAND from server/snapshot.mjs's ENEMY_TYPES / ENEMY_MODES, for
  // the same reason NET_V is mirrored: a classic script cannot import the
  // module. Order is the wire contract — these two literals and the server's
  // must stay identical, and the enum tests on both sides pin them. The decode
  // hands back the SAME STRINGS the wire used to carry, so nothing downstream
  // of apply() — render, the scorer's buckets, the rig's samples — moved.
  const WIRE_TYPES = ["dart", "harrier", "radarHarrier", "charger",
    "radarCharger", "husk", "anvil", "shard", "radarDart"];
  const WIRE_MODES = ["seek", "tele", "pulse", "lockon", "windup",
    "dash", "tired"];
  // an index neither table knows (the encoder's -1) names itself as the
  // roster's baseline body and its baseline mode — the same fallback statsFor
  // already applies to an unknown type, never a throw on a live stream
  const wireType = (i) => WIRE_TYPES[i] || "dart";
  const wireMode = (i) => WIRE_MODES[i] || "seek";

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
  const trails = new Map();// missile id → rebuilt trail samples
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
  let statsWave = -1;      // per-wave statsFor cache for enemy body stamping
  let statsSet = null;
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
  let predIdle = false; // hud dead, own rsp > 0, or no hull at all (the claim
                        // window and the release both sit at rsp 0) — no motion,
                        // no replay: there is nothing flying to predict
  const sentHist = [];  // { n, batch, f } — the client's own send history;
                        // one batch per flush = one server tick's admission
  let batchId = 0;
  const localAtTick = new Map(); // tick → the locally-continuous kernel fields
  let myOw = null;      // the ACKED rank vector — termsFromOwned's input
  const off = { x: 0, y: 0 }; // the render correction offset — presentation only
  let rebases = 0;
  let lastRebaseMag = 0;
  let prevRh = 0;       // the comet cue's press-edge detector
  const spec = { cueShown: 0, cueMatched: 0, cueRefused: 0,
                 cometCueShown: 0, cometRefused: 0,
                 cueRetracted: 0 }; // monotone, render-side — the row-2
                        // harness seam (latency-rig reads these).
                        // cueRetracted is the rebase reconciliation's
                        // bookkeeping (the cool-delta block in rebase); there
                        // is deliberately NO cueLate counter — back-filling a
                        // never-cued server shot with a late cue was tried,
                        // over-cued in measurement (rebases land between the
                        // flush and the next incremental tick), and rejected
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
      cool: 0, comet: false, energy: 0, energyMax: 0, enIdle: 0,
      thrustAcc: { x: 0, y: 0 }, flame: { x: 0, y: 0 },
      input: { scur: { x: 0, y: 0 }, fireHeld: false, cometWant: false } };
  }
  function adoptWire(K, pr) {
    // v8: a PARKED seat's record is four keys — seat, hull, hm, cl: -1 — and
    // carries no pose, velocity, flame or pool. Adopting it would write
    // undefined into every kernel field; the kernel keeps freshK's zeros
    // instead. The only caller that can reach here with one is hardSnap (the
    // rebase's `down` test is true for it), and hardSnap turns the predictor
    // OFF, so the zeros are never presented.
    if (pr.cl === -1) return;
    K.ship.x = pr.x; K.ship.y = pr.y;
    K.vel.x = pr.vx || 0; K.vel.y = pr.vy || 0;
    K.flame.x = pr.fx; K.flame.y = pr.fy;
    K.comet = !!pr.comet;
    K.energy = pr.en || 0;
    K.energyMax = pr.em || ENMAX;
    K.cool = pr.cool || 0;
    K.enIdle = pr.enIdle || 0;
  }
  function carryLocal(K, tick) {
    const L = localAtTick.get(tick);
    if (L) {
      K.aimAngle = L.aimAngle; K.aimed = L.aimed;
      K.aimOff.x = L.aimOffX; K.aimOff.y = L.aimOffY;
      K.thrustAcc.x = L.thrustAccX; K.thrustAcc.y = L.thrustAccY;
      K.input.scur.x = L.scurX; K.input.scur.y = L.scurY;
      K.input.fireHeld = L.fireHeld; K.input.cometWant = L.cometWant;
    } else {
      // no prior prediction of this tick (first base, or after a hard snap):
      // seed from the live client input state — the honest zero
      K.input.scur.x = in0.scur.x; K.input.scur.y = in0.scur.y;
      K.input.fireHeld = !!G.leftHeld;
      K.input.cometWant = !!in0.cometWant;
    }
  }
  function recordLocal(K, tick) {
    localAtTick.set(tick, { aimAngle: K.aimAngle, aimed: K.aimed,
      aimOffX: K.aimOff.x, aimOffY: K.aimOff.y,
      thrustAccX: K.thrustAcc.x, thrustAccY: K.thrustAcc.y,
      scurX: K.input.scur.x, scurY: K.input.scur.y,
      fireHeld: K.input.fireHeld, cometWant: K.input.cometWant });
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
  function spawnCue(K, terms) {
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
    if (BMODE === "cq-scale") {
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
    tracers.push({ x: K.ship.x, y: K.ship.y, ox: K.ship.x, oy: K.ship.y,
      vx, vy, age: 0, ttl });
    spec.cueShown += 1;
    return true;
  }
  // a PRESS's cue: model the fire (the real refusal ladder + the cool set)
  // and show the promise in the same tick — a press is the player's own
  // edge, and the server consumes it as an fp count whatever the grouping
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
  }

  // one predicted kernel tick, in the server's exact per-tick order:
  // drain → energy → integrate, then the autofire pass. `fx.fire` decides
  // whether an fp edge is a cue (incremental) or only a cool model (replay).
  const PRED_CTX = { alive: true, terms: null, keyThrust: null };
  let pendingAutofireCue = false; // incremental-only: an autofire shot was
                        // modeled last tick — its cue shows THIS tick if the
                        // trigger is still held (see the trail note below)
  function predTickK(K, frames, terms, cueing) {
    PRED_CTX.alive = true; // the predictor idles while the seat is down, so
                           // a live replayed tick is a live seat by contract
    PRED_CTX.terms = terms;
    PRED_CTX.keyThrust = () => (terms ? terms.keyThrust !== false : true);
    const fx = cueing
      ? { fire: () => { if (specFire(K, terms)) ownCue("fire", K.ship); },
          // the sink hands the flight slice's own two numbers straight
          // through — the same world position and pre-bounce magnitude
          // FLIGHT_FX.thud gives Encounter.emit in the sim
          thud: (x, y, gain) => { ownCue("thud", { x, y }, gain); } }
      : { fire: () => { modelFire(K, terms); }, thud: () => {} };
    Flight.drainSlice(K, frames, PRED_CTX, fx);
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
    // with no bullet is a broken promise. A PRESS (fp) still cues in its
    // own tick — the server consumes fp counts whatever the grouping.
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
    sentHist.length = 0;
    localAtTick.clear();
    tracers.length = 0;
    off.x = off.y = 0;
    myOw = null;
    prevRh = 0;
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
    pendingAutofireCue = false;
    const K = freshK();
    adoptWire(K, pr);
    carryLocal(K, s.tick); // the map was just cleared — seeds from live input
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
    if (Array.isArray(pr.ow)) myOw = pr.ow.slice();
    // the discontinuity markers, read at ARRIVAL (their tick IS this
    // snapshot's tick while SNAPSHOT_EVERY === 1 — asserted server-side).
    // restart cuts everyone and death/respawn cut the local seat: those are
    // TELEPORTS, so the whole predictor snaps wholesale. termChange is a
    // TERMS discontinuity, not a teleport: the rebase below already replays
    // with the marker snapshot's own ow (terms switch AT the marker tick by
    // construction), so its hard half is only the offset — dropped, never
    // blended — while the unacked history stays: those frames are still in
    // front of the server, not behind the marker.
    let cut = false;
    let termCut = false;
    for (const ev of s.events || []) {
      if (ev.k === "restart") cut = true;
      else if ((ev.k === "death" || ev.k === "respawn") && ev.seat === mySeat) cut = true;
      else if (ev.k === "termChange" && ev.seat === mySeat) termCut = true;
    }
    const down = (s.hud && s.hud.state === "dead") || (pr.rsp || 0) > 0 ||
                 (pr.hull | 0) <= 0 || // the HULL closes the gap the countdown left:
                 // a seat in its claim window, or unseated, sits at rsp 0 with no
                 // hull, and predicting flight for a wreck was the same latent bug
                 // the fx layer carried
                 pr.cl === -1; // ...and the v8 short record says so by its
                 // sentinel as well as its hull — stated here so the ordinary
                 // rebase below, which adopts the pose, can never see one
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
    // same shot will re-cue at the truth. (The symmetric "server fired a
    // shot we never cued" case is deliberately NOT back-filled with a late
    // cue — rebases land asynchronously between the flush and the next
    // incremental tick, and a dc-threshold back-fill over-cued in
    // measurement; an uncued bullet at worst steals one tracer.)
    if (!termCut) {
      const dc = K.cool - predK.cool;
      if (dc < -4) {
        // the early promise is usually still PENDING (the autofire cue
        // trails its model by one frame) — cancel it there first; only a
        // just-spawned tracer needs the pop
        if (pendingAutofireCue) {
          pendingAutofireCue = false;
          spec.cueRetracted += 1;
        } else {
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
  let nameSentAt = -1;
  let namePending = false;
  function pushName() {
    if (!ws || ws.readyState !== 1) return;
    const now = Date.now();
    const gap = now - nameSentAt;
    if (nameSentAt >= 0 && gap < 300) {
      if (!namePending) {
        namePending = true;
        setTimeout(() => { namePending = false; pushName(); }, 300 - gap);
      }
      return;
    }
    nameSentAt = now;
    // an empty string, not an absent field: this is how a player CLEARS a name,
    // and the server's sanitize reads it as null exactly as it reads junk
    ws.send(JSON.stringify({ v: NET_V, ui: "name", name: nameSent || "" }));
  }
  // the editor's ONE way out to the wire, and closeNameEdit above is its only
  // caller — a name reaches the server because a player finished typing it,
  // never because a card went away. Local play leaves this null.
  sendName = (next) => {
    if (next === nameSent) return;
    nameSent = next;
    pushName();
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
      fp: older.fp + newer.fp,
      fh: newer.fh, kx: newer.kx, ky: newer.ky, rh: newer.rh,
      // the NEWEST view tick wins, the fh rule — and when neither frame
      // carries one the key stays undefined, which JSON drops: absence
      // survives the fold as absence
      vt: newer.vt !== undefined ? newer.vt : older.vt,
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

  function statsFor(wave) {
    if (statsWave !== wave) {
      statsWave = wave;
      statsSet = enc().statsFor(wave);
    }
    return statsSet;
  }

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
    ws.addEventListener("open", () => {
      // the stored name rides the hello, and the server sets it BEFORE the
      // grant — so the very first roster this room fans out already carries it.
      // Omitted entirely when there is nothing stored: an absent field is the
      // honest shape for "this visitor has never typed one", and the server's
      // type gate reads it as absent either way.
      const hello = { v: NET_V, hello: true };
      const boot = storedName();
      if (boot) hello.name = boot;
      ws.send(JSON.stringify(hello));
      helloed = true;
      note("NET connected — " + url);
    });
    ws.addEventListener("message", (m) => {
      let s;
      try { s = JSON.parse(m.data); } catch { return; }
      if (!s || s.v !== NET_V) return;
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

  // a rejoin is a fresh stream: the old buffer, pending cues, trails and the
  // presented clock all describe a match that no longer exists. pt returns to
  // -1, so the first snapshot after the rejoin renders immediately, exactly
  // like the first snapshot of a fresh page.
  function resync() {
    buf.length = 0;
    evq.length = 0;
    trails.clear();
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
    const seat = Number.isInteger(you.seat) ? you.seat : null;
    const seatEpoch = Number.isInteger(you.seatEpoch) ? you.seatEpoch : -1;
    const matchEpoch = Number.isFinite(you.matchEpoch) ? you.matchEpoch : -1;
    // both counts must be present and sane, or the roster reads as UNKNOWN —
    // a half-decoded roster would print a half-true banner, which is worse
    // than the honest old one. DEFENSIVE, and knowingly unreachable on a live
    // wire: the only server that answers a v7 hello sends all three fields on
    // every `you`, and a v6-era one closes this client at 4001 before a `you`
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
    if (identitySame && rosterSame && namesSame) return;
    rosGranted = granted;
    rosMax = maxSeats;
    rosStarted = started;
    seatNames = nextNames;
    // ...and this client's OWN copy follows the server's answer for its own
    // seat. The server's sanitize is the only one that reaches a screen, and
    // the claim card draws from ownName rather than from a row it does not
    // have — without this it would keep showing what was typed instead of what
    // was accepted. A `you` that names nobody leaves the last accepted name
    // standing: a seatless roster is silence about this client, not a clear.
    if (Number.isInteger(seat) && seat >= 0 && seat < seatNames.length &&
        seatNames[seat]) ownName = seatNames[seat];
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
    for (const e of s.events || []) evq.push({ tick: s.tick, e });
    // a paused client stops presenting but keeps receiving — the pending
    // event list must not grow for as long as a pause lasts, and a resume
    // must not replay minutes of cues in one burst
    if (evq.length > 300) evq.splice(0, evq.length - 300);
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
      // one kernel tick with cues live (fp/fh edges may fire the speculative
      // tracer, rh edges answer the comet cue). The next rebase's replay
      // re-derives the same window from the acked base and corrects.
      if (predOn && !predIdle && mySeat !== null) {
        const terms = predTerms();
        if (f.rh && !prevRh) {
          // the comet CUE answers the EXACT arm rule on predicted state: a
          // running comet continues while the pool holds, a new one needs
          // the floor — counted at the press edge, shown by the halo
          const armed = predK.energy > 0 && predK.energy >= predK.energyMax * ENARM;
          if (predK.comet ? predK.energy > 0 : armed) spec.cometCueShown += 1;
          else spec.cometRefused += 1;
        }
        prevRh = f.rh ? 1 : 0;
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
      const asked = pendingInputs.some((f) => f.fp);
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
  const ENEMY_POLICY = {
    seek:   { interp: "hermite", boundary: "hold", project: 1 },
    tele:   { interp: "hermite", boundary: "hold", project: 0 },
    pulse:  { interp: "hermite", boundary: "hold", project: 0 },
    lockon: { interp: "hermite", boundary: "hold", project: 0 },
    windup: { interp: "hermite", boundary: "hold", project: 0 },
    dash:   { interp: "hermite", boundary: "hold", project: 0 },
    tired:  { interp: "hermite", boundary: "hold", project: 0 },
  };
  // ...and missiles by their derived steering PHASE, which is the same idea:
  // a missile under `arm` is ballistic, then it turns, then the authority
  // decays away. The phase is DERIVED from the wire's `age` and the missile
  // cfg — it never rides the wire itself.
  const MISSILE_POLICY = {
    ballistic: { interp: "hermite", boundary: "hold", project: 0 },
    turning:   { interp: "hermite", boundary: "hold", project: 0 },
    decaying:  { interp: "hermite", boundary: "hold", project: 0 },
  };
  const missilePhase = (age, M) => (age < M.arm ? "ballistic"
    : M.life - age < M.decay ? "decaying" : "turning");

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
  // the class ceiling, px/tick. statsFor is the client's own derivation of the
  // server's per-wave stats, and stepEnemy caps on max(maxSpeed, backSpeed).
  function enemyCap(stats, type, cfg) {
    const base = Math.max(stats.maxSpeed || 0, stats.backSpeed || 0);
    // the dash is a CONSTANT across waves and far above any seek speed, so a
    // charger's ceiling is the dash whatever mode it is currently in — the
    // guard is a sanity bound, not a mode-dependent physics rule
    if (type === "charger" || type === "radarCharger") {
      return Math.max(base, cfg.charger.dashSpeed);
    }
    return base;
  }
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
      // v8: the PARKED seat — `{ seat, hull, hm, cl: -1 }` and nothing else.
      // The seat record takes what the record carries plus the folds the sim's
      // own vacateSeat makes (no invulnerability, no flash, no countdown, no
      // window); xp, score, best and owned stay as they were, because the
      // server holds the truth, every board filters an absent row, and the next
      // FULL record on reclaim overwrites all four. One reader does reach them
      // while the seat is parked: localSeatRec() folds a seatless client to
      // seat 0, so a spectator's HUD reads seat 0's wallet and ranks even when
      // seat 0 is parked — stale-but-finite numbers it read at v7 too, and the
      // cards that must not promise a seat go through seatless() instead of
      // this record. The ship, flame, pool and
      // comet fields are not touched at all — they go STALE across a park, and
      // nothing reads them while it lasts: drawShip returns on `absent`, the
      // draw loop skips the seat ahead of the glow and the probe, and the fx
      // bloom and the invuln ring key off the hull and the invulnerability this
      // branch zeroes. An assignment from this record would write undefined
      // into a pose the presented frame still lerps.
      if (pr.cl === -1) {
        if (S) {
          S.absent = true;
          S.hull = pr.hull | 0;
          S.hullMax = pr.hm;
          S.invuln = 0;
          S.hitFlash = 0;
          S.respawnT = 0;
          S.claimT = 0;
        }
        continue; // the release latch below stays as it is: a record with
                  // cl === -1 never cleared it
      }
      // ...and the bracket's OTHER record for this seat, which may itself be
      // the short one (s1 is the newer end, so a seat that PARKED on this tick;
      // under the starvation guard's reversed endpoints, one reclaimed): it
      // carries no pose, so it reads as "no other pose" — the bracket holds at
      // s0 — rather than lerping a number against undefined
      const p1r = p1by ? p1by.get(pr.seat) : null;
      const p1 = p1r && p1r.cl !== -1 ? p1r : null;
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
      }
      P.comet = !!pr.comet;
      P.cool = pr.cool || 0;     // v4: the fire cooldown and the recharge delay
      P.enIdle = pr.enIdle || 0; // — presented truth, and the predictor's rebase source
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
        if (Array.isArray(pr.ow)) S.owned = pr.ow.slice();
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
        // seat says nothing, so the latch simply stays.
        if (pr.seat === mySeat && pr.cl !== -1) released = false;
      }
    }
    // The local seat's AIM fields stay LOCAL — the marker follows the cursor,
    // never the wire. (E.hull and its siblings still delegate to seat 0 for the
    // standing test surface; the presented state above writes the records
    // themselves, so the delegation reads through to the same numbers.)

    // --- the encounter's presented fields, discrete ones from s0 (the
    // snapshot whose moment is on screen): the freeze renders exactly as the
    // sim reports, no client-side state machine
    E.state = s0.hud.state;
    E.wave = s0.hud.wave;
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
    if (mine && mine.cl !== -1) {
      const ownedSum = (mine.ow || []).reduce((a, b) => a + b, 0);
      if (lastOwnedSum >= 0 && ownedSum > lastOwnedSum && window.Sfx) Sfx.cue("buy", null, undefined, localSeat());
      lastOwnedSum = ownedSum;
    }

    // --- enemies: keyed by id; a body in both snapshots lerps, one missing
    // from the newer holds its s0 pose until the presented clock passes its
    // death, one only in the newer appears when its snapshot becomes s0.
    // The client stamps e.stats via statsFor — drawAnvil and the edge arrows
    // read it, and a stats-less body throws.
    const st = statsFor(s0.hud.wave);
    const e1by = s1 ? new Map(s1.enemies.map((e) => [e.id, e])) : null;
    E.enemies = s0.enemies.map((e0) => {
      const e1 = e1by ? e1by.get(e0.id) : null;
      // v5: the wire carries enum INDICES; the decode hands back exactly the
      // strings v4 carried, so stats lookup, render and every scorer bucket
      // downstream read the same values they always did
      const type = wireType(e0.ty);
      const mode = wireMode(e0.md);
      const stats = st[type] || st.dart;
      const pol = ENEMY_POLICY[mode] || ENEMY_POLICY.seek;
      // THE BOUNDARY. A mode change between the brackets is a discontinuity:
      // pose, countdown and facing all HOLD at s0, and nothing is projected
      // across it. (`t` is the load-bearing half — lerping a countdown through
      // a mode change manufactures values the sim never held.)
      const held = !!(e1 && pol.boundary === "hold" && wireMode(e1.md) !== mode);
      const cap = enemyCap(stats, type, cfg);
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
      return {
        id: e0.id, type,
        x: pose.x, y: pose.y,
        vx: 0, vy: 0, r: stats.r, hp: 1, stats, orbDrop: 0,
        mode, cd: 0,
        t: e1 && !held ? lerp(e0.t, e1.t, k) : e0.t,
        face: e1 && !held ? alerp(e0.face, e1.face, k) : e0.face,
        lockA: e1 && !held ? alerp(e0.lk, e1.lk, k) : e0.lk,
        flash: e0.fl, pulseHit: false, dashHit: false,
        // the radar latch's PING is a PAST world point, draw-only: it is held
        // from s0 and never interpolated, never projected, never fed to any
        // interpolator. prT joins the hold column explicitly here.
        predX: e0.prX || 0, predY: e0.prY || 0, predT: e0.prT || 0,
        contactCd: 0, contactTaken: false,
      };
    });

    // --- missiles, with the trail rebuilt from presented positions: one
    // sample per presented tick, capped at the sim's own trail length
    const m1by = s1 ? new Map(s1.missiles.map((m) => [m.id, m])) : null;
    const liveIds = new Set();
    E.missiles = s0.missiles.map((m0) => {
      const m1 = m1by ? m1by.get(m0.id) : null;
      // v5: `age` rides the wire and the steering PHASE is derived from it
      // here — the same three segments stepMissile runs (ballistic under
      // `arm`, full turn, then decaying inside `decay`). The phase is the
      // policy key; it is never wire weight.
      const age = m0.age | 0;
      const phase = missilePhase(age, cfg.missile);
      const pol = MISSILE_POLICY[phase];
      const held = !!(m1 && pol.boundary === "hold" &&
        missilePhase(m1.age | 0, cfg.missile) !== phase);
      const bodyLead = pol.project > 0 ? lead * pol.project : 0;
      const pose = presentBody(pol, m0, m1, k, h, cfg.missile.speed, held,
        bodyLead, cfg.missile.r);
      const x = pose.x, y = pose.y;
      liveIds.add(m0.id);
      let tr = trails.get(m0.id);
      if (!tr) { tr = []; trails.set(m0.id, tr); }
      tr.push({ x, y });
      while (tr.length > cfg.missile.trail) tr.shift();
      return { id: m0.id, x, y, vx: m0.vx, vy: m0.vy,
        r: cfg.missile.r, hp: 1, age, trail: tr, radar: !!m0.radar };
    });
    for (const id of trails.keys()) {
      if (!liveIds.has(id)) trails.delete(id); // a dead id disappearing IS the death
    }

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
    const b1by = s1 ? new Map(s1.bullets.map((b) => [b.id, b])) : null;
    G.bullets = s0.bullets.map((b0) => {
      const b1 = b1by ? b1by.get(b0.id) : null;
      const pose = presentBody(POLICY.bullet, b0, b1, k, h, 0, false, 0, 0);
      const x = pose.x, y = pose.y;
      // v4: the wire's owner seat replaces the hard-coded "player" stamp —
      // bulletSeat() reads the int directly, and the legacy-string alias
      // stays for local mode's suite synthetics only
      return { id: b0.id, x, y, px: x, py: y, vx: 0, vy: 0,
        r: 2.2, dmg: 0, owner: Number.isInteger(b0.o) ? b0.o : 0,
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
          tracers.shift();
          spec.cueMatched += 1;
        }
      }
    }

    // --- spawn groups: the portals and the incoming markers draw from the
    // same fields the sim's own groups carry
    E.groups = s0.groups.map((g) => ({
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
      const { tick, e } = evq.shift();
      if (tick < pt - 30) continue; // a resume after a pause drops the stale
                                    // half-second's cues silently instead of
                                    // playing a backlog as one burst
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
      const ownEcho = predOn && !predIdle && e.seat === mySeat &&
                      (e.k === "fire" || e.k === "thud");
      if (window.Sfx && !ownEcho) Sfx.cue(e.k, at, e.g, e.seat);
      // ...and the light layer, off the same presented queue: in net mode the
      // local sim never steps, so game.js's drainCues() never runs. It sits
      // ABOVE the null guard because the RESTART MARKER carries no position
      // and a net client never restarts its own encounter — that marker is the
      // only signal this layer gets that the authority cut the run. FX.cue
      // refuses a positionless cue itself, so nothing else reaches ink.
      if (e.k !== "termChange" && window.FX) FX.cue({ kind: e.k, at, gain: e.g, seat: e.seat });
      // the comet instrument's hurt half. game.js's drainCues() carries the
      // same call, and in net mode the local sim never steps, so this is the
      // only one that ever runs here. The third argument says whether this
      // event's tick is the one apply() wrote the comet flag from — a jump or
      // starvation drain empties a whole window against one flag, and the
      // instrument's tripwire must not fire on the mismatched ones.
      noteCometCue(e.k, e.seat, tick === appliedTick);
      if (!at) continue;
      if (e.k === "hit" || e.k === "boom") spawnImpactFx(at.x, at.y, 0, -1, "enemy");
      else if (e.k === "clang" || e.k === "wall") spawnImpactFx(at.x, at.y, 0, -1, "wall");
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
    // ...and THIS client's own name, which is not a roster read: a seatless
    // client has no row on the board and no entry in `names`, and the claim
    // card is exactly the screen where a name is worth asking for. It follows
    // the server's answer for this client's own seat as soon as one arrives
    // (see the `you` decode), because the server's sanitize is the only one
    // that reaches a screen.
    ownName: () => ownName,
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
    predicted: () => (predOn ? { energy: predK.energy, energyMax: predK.energyMax,
      cool: predK.cool,
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
      note("NET closed by the client", false);
    },
    // test seam, nothing shipped calls it: feed one decoded snapshot into the
    // buffer as if the socket delivered it — the one honest way to demonstrate
    // the newest-wins drop, since loopback TCP never reorders on demand
    inject: (s) => onSnapshot(s),
  };
})();
