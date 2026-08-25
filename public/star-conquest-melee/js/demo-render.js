(function () {
  "use strict";

  let kernel;
  let S, W, H, PLAY_W, PLAY_H, C, RGB, WAVES, STATS, TAU;
  let ARENA_W, ARENA_H, ARENA_COLS, ARENA_ROWS;
  let BOUNDED = false;
  let rgba, rgbFor, cssFor, wrap, delta, angleDelta, easeOut, clamp, lerp, starEaterSegments, findEnemy;
  let wx;
  let lx;
  let DPR = 1;

  // The camera lives in the render plane and nowhere else: written once per
  // render() call, read only by draw code. The kernel never sees it — the sim
  // derives its encounter frame from the player's own position. That is
  // production's FRAME.cam contract (js/game.js:4033). The BASE ORDERING below
  // is production's too — lead into the ease target, then the leash, then the
  // world clamp — but the file no longer stops there: the SCALE (camWide,
  // zoomFor, camScale and every / z that follows from them) and the CURSOR PULL
  // have no production counterpart whatever. Production's camera has no scale
  // term anywhere, and its lead uses a UNIT cursor direction, so it has no
  // cursor-DISTANCE term either. Read the marked sites before assuming a line
  // here can be found in js/game.js. With WORLD_BOUNDED off the camera stays
  // pinned at the origin and no draw pass translates, so the wrapping build's
  // pixels do not move.
  const CAM_EASE_HZ = 60;   // the tick rate that constant was tuned at
  const CAM_DT_MAX = 0.1;   // a slept tab hands back one huge frame; the ease ignores the excess
  // The THIRTEEN the lab exposes, in three kinds — the count and the kinds both
  // matter, because a reader who takes the whole set for "production's numbers,
  // retuned" mis-reads seven of the rows entirely:
  //   2 OWNER-RULED RETUNINGS of a production number — ease 0.08 -> 0.05,
  //     camLead 25 -> 60 (owner feel gate, 2026-08-24);
  //   2 UNCHANGED, production-equal — edgeMargin 60, leadDz 200;
  //   9 NEW SEAT-SELECTED MECHANISMS with NO production counterpart at all —
  //     cursorPull, which is the owner's OWN camera rule of 2026-08-24 and which
  //     production cannot express at all, the four zoom dials (zoomWide /
  //     zoomRef / zoomDead / zoomEase), which production's updateCamera() has
  //     nothing whatever to correspond to (it has no scale at all), and starLit,
  //     starSize, zoomLW and streak, which are not camera numbers at all.
  // Production's own number stays cited on every row
  // that has one beside the lab final, because both are load-bearing: production's is what
  // PORT-S restores when it deletes this block, the lab final is what the owner
  // asked to fly. See the PORT-S DEBT note at the head of the lookahead block.
  // They are presentation-plane state: the kernel never reads one, and nothing
  // persists them, so a reload is these numbers again.
  const CAM_DIAL_DEFAULTS = {
    ease: 0.05,             // owner 2026-08-24; production js/game.js:1614 CAMEASE = 0.08 — the gap closed per 60 Hz tick
    edgeMargin: 60,         // js/game.js:1621 EDGEMARGIN — min px between ship and view edge (owner: unchanged)
    camLead: 60,            // owner 2026-08-24; production js/game.js:1616 CAMLEAD = 25 — ticks of velocity the target leads by
    // THE OWNER'S OWN RULE, 2026-08-24. NO production counterpart. 1.0 is his
    // Blend 0.5 — the camera exactly halfway between the cursor and the ship
    // PLUS ITS VELOCITY LEAD. The plain ship-to-cursor midpoint holds only at
    // rest: at vx 245 with camLead 60 the centre sits 122.5 px past it, because
    // the velocity half is added before the pull, not blended against it. The
    // browser proof that measured 0.0 px error was run ship-at-rest, so it
    // proves the rest case and not the general one. (Codex vendor-cross, 03R.)
    // The whole derivation is at cursorOffset() and leadVec(); read it before
    // changing this number or its meaning.
    cursorPull: 1.0,
    leadDz: 200,            // js/game.js:1620 LEADDZ — ms a conflicting lead must persist to commit (owner: unchanged)
    // ---- the zoom, hop 3P. NO production counterpart: production's camera has
    // no scale term anywhere. Asked for by the owner at the 2026-08-24 gate:
    // "not being able to dynamically control how far I see (by measuring
    // distance between cursor and ship) makes it feel like I'm always choosing
    // between seeing in front or behind depending on which angle I put my
    // mouse." The aim lead PANS — it buys forward reach by selling rearward
    // reach. Zoom does not trade.
    // OFF, BY THE OWNER'S RULING, 2026-08-24: "zoom / widen is something we can
    // play with but we dont need at all and i never asked for". 1.0 is the
    // byte-exact OFF and it is now the shipped default. The dial stays on the
    // panel as a toy, and PORT-S-DEBT.md carries it as DROPPABLE rather than as
    // something to port: if it is still at 1.0 after his next fly it gets
    // deleted rather than carried.
    zoomWide: 1.0,          // the widest the view gets, as a MULTIPLE of PLAY_W. 1 = OFF, byte-exact
    zoomRef: 420,           // stage px of cursor travel past zoomDead over which the full widening is spent
    zoomDead: 200,          // stage px around the PANE CENTRE that hold 1x — the calm zone
    zoomEase: 0.04,         // the ease on camWide, per 60 Hz tick. DELIBERATELY under `ease` 0.05 so the zoom never leads the pan
    // Not a camera number at all — it rides this panel because this panel is
    // where the owner is flying. A multiplier on the whole bounded star field's
    // alpha, so the field can be settled by eye without another round.
    starLit: 1.0,
    // ASKED FOR BY NAME, 2026-08-24: "If this star pass doesn't work, you're
    // going to have to give me a star size factor slider to play with". A
    // MULTIPLIER on st.size, applied UNDER the STAR_MIN_PX floor, so it can only
    // add. 1.0 is the field as 03R-C ships it.
    //
    // AND IT IS THE VARIANCE DIAL AS WELL, which is worth knowing before it is
    // turned: st.size runs 0.353 to 1.600 in this world, so at StarSize 1.0 the
    // 2 px floor catches ALL 177 stars and every one of them draws at exactly
    // 2.000 px. Size variance is gone at the shipped setting — depth is carried
    // in STAR_LAYER_LIT alone. At 2.0 the floor catches 90 and the rest spread up
    // to 3.2 px; at 4.0 it catches 25 and they spread to 6.4.
    //
    // THE RAIL STARTS AT 1 AND THE FLOOR STAYS. Under 2 px is not "smaller
    // stars", it is the regime this round just left: worst-case peak coverage is
    // (min(s, 2) / 2)^2 — 0.25 at s = 1.0, 0.64 at s = 1.6, 1.00 at s >= 2. A
    // dial reaching into that band would have him tuning against a rasterizer
    // artefact and reading it as "dimmer", which is the exact loop that cost
    // three rounds. The lever for TOO BRIGHT is starLit, which is already on the
    // panel. Dimmer-but-crisp is correct; smaller-and-smeared is the defect.
    starSize: 1.0,
    // Stroke-weight compensation under zoom, 0 = none, 1 = full. See lw().
    zoomLW: 0.5,
    // The star streak, and it SHIPS INERT. 0 draws the field exactly as 03R-C
    // left it, down to the canvas calls; the owner turns it on. That is what
    // keeps 03R-C (the star size) and 03R-D (the sheet placement) judgeable on
    // their own at the same fly. Also not a camera number.
    streak: 0
  };
  let CAM_EASE = CAM_DIAL_DEFAULTS.ease;
  let EDGEMARGIN = CAM_DIAL_DEFAULTS.edgeMargin;
  let CAMLEAD = CAM_DIAL_DEFAULTS.camLead;
  let CURSORPULL = CAM_DIAL_DEFAULTS.cursorPull;
  let LEADDZ = CAM_DIAL_DEFAULTS.leadDz;
  let ZOOMWIDE = CAM_DIAL_DEFAULTS.zoomWide;
  let ZOOMREF = CAM_DIAL_DEFAULTS.zoomRef;
  let ZOOMDEAD = CAM_DIAL_DEFAULTS.zoomDead;
  let ZOOMEASE = CAM_DIAL_DEFAULTS.zoomEase;
  let STARLIT = CAM_DIAL_DEFAULTS.starLit;
  let STARSIZE = CAM_DIAL_DEFAULTS.starSize;
  let ZOOMLW = CAM_DIAL_DEFAULTS.zoomLW;
  let STREAK = CAM_DIAL_DEFAULTS.streak;
  // DEPTH IS CARRIED IN BRIGHTNESS, NOT IN AREA. See the star loop for the whole
  // argument; these are the three layers' alpha multipliers, near to far read
  // right to left. They are roughly the AREA ratios the old size multipliers
  // produced (0.25 / 0.49 / 0.81 of a full-size star, so 0.31 / 0.60 / 1.00
  // normalised), lifted at the far end so that layer 0 still registers instead of
  // disappearing. Order and count are tied to `i % 3` below.
  const STAR_LAYER_LIT = [0.5, 0.72, 1];
  // TWO PIXELS, NOT ONE. Canvas coverage antialiasing is INK-CONSERVING: a rect
  // at a fractional offset spreads the same total ink over more pixels and only
  // the DISTRIBUTION changes. Measured in headless Chrome at DPR 1 on this
  // build's own background:
  //
  //     s = 1.00, offset 0.0  ->  peak 241.0, ink 71.1, 1 lit px
  //     s = 1.00, offset 0.5  ->  peak  59.9, ink 68.0, 4 lit px
  //
  // Ink falls 4 %. PEAK FALLS 75 % — 241.0 to 59.9, which is a FOUR-FOLD DROP.
  // (An earlier revision of this comment said "302 %", which is the same pair of
  // numbers read backwards: 181.1/59.9 is the reverse INCREASE, not the fall.
  // Codex vendor-cross, 03R review.) Hop 3Q measured the INK column, found 1.042
  // and reported "no fade" while the owner was still looking at a field that
  // dimmed; the eye reads the PEAK column. That is why his complaint survived a
  // round that measured itself green.
  //
  // The measured law is `worst-case peak coverage = (min(s, 2) / 2)^2`: 0.25 at
  // s = 1, and 1.00 at EVERY subpixel offset once s >= 2. NINETY of the 177 stars
  // sat at exactly 1.000 px under the old floor, so this is most of the field and
  // not a tail.
  //
  // WHAT THIS IS NOT, corrected 2026-08-25 (03R-F) because the 03R-C commit
  // message overstated it: this is NOT the round's dominant cause and it is NOT a
  // cure for static dimness. Statically no star was too dim — 0 of 177 fall under
  // 0.05 effective per-pixel alpha at any alignment, and the worst case in the
  // field still puts 9.6 code values of luma over a background of 7.3. The floor
  // cures a MOTION-ONLY beat (1.25 / 2.50 / 3.75 Hz per layer in steady flight),
  // and it is a real cure — 03R's R4 measured thrust-over-still pixels above +128
  // going 0.765 to 1.096. THE DOMINANT CAUSE WAS THE SHEET-YANK, fixed in 03R-D,
  // which was teleporting the whole field by up to 36x the camera's own motion.
  //
  // DO NOT COMPENSATE BY LOWERING THIS BACK UNDER 2. That reinstates the
  // mechanism. If the field reads too bright the dial is StarLit, which is on the
  // panel for exactly this; if the SIZE VARIANCE is wanted back, the shape is
  // `Math.max(2, st.size * 1.25)`, which keeps the top of the range alive.
  //
  // It is also FASTER: 0.132 ms against 0.177 ms, measured, because an
  // integer-sized rect skips the AA path altogether.
  const STAR_MIN_PX = 2;
  let camX = 0;
  let camY = 0;
  // THE STAR SHEET'S SCREEN OFFSET, INTEGRATED, and it has to be integrated.
  //
  // The sheet used to be placed from an ABSOLUTE world coordinate, `camX * depth
  // * z`. Differentiate that and the per-frame move is
  //
  //     depth * ( z * dCamX  +  camX * dz )
  //
  // and the second term has no business being there. It is the ARENA COORDINATE
  // times the change in scale, so while z is easing the whole field is yanked by
  // an amount that grows with how far from the world origin the ship happens to
  // be. Measured while the zoom eased: 6.1 to 148.7 px of sheet motion per frame
  // against the camera's own screen motion — 6x to 49x — which is every star
  // teleporting to an uncorrelated place, every frame. That is the other half of
  // the owner's complaint, in his words: the field goes wrong "especially when my
  // mouse is moving AND THE CAMERA IS ZOOMING AROUND".
  //
  // The requirement is that the sheet move with the CAMERA's screen motion, which
  // is `z * dCamX` — the first term alone. There is no closed form for its
  // integral, because z varies, so it is accumulated:
  //
  //     starPanX += z * (camX - camPrevX)      each camera step
  //     screen offset = starPanX * depth       each star
  //
  // AT CONSTANT z THIS IS THE OLD EXPRESSION. The sum telescopes to z * camX,
  // and it is SEEDED with exactly that on a restart, so at the shipped ZoomMax
  // 1.0 the sheet is placed where it was placed before this change. Note what is
  // and is not claimed: telescoping is exact in the REALS, and a running sum of
  // differences is not guaranteed to be exact in IEEE-754. Measured instead — a
  // 600-frame drive with the ship sweeping the arena and the cursor sweeping the
  // pane came back BIT-identical to camX * z on every frame, worst |diff| 0. If a
  // future drive finds a ULP of drift, it is a ULP on a tiling background, not a
  // regression to argue about.
  //
  // The fix is armed for the day the owner turns the zoom up, and dormant until
  // then — which is the reason to land it even though 03R-B's default hides it.
  let starPanX = 0;
  let starPanY = 0;
  let camPrevX = 0;
  let camPrevY = 0;
  // The camera's SCREEN displacement over the last presented frame — the same
  // increment starPanX accumulates, kept rather than only added. It is what the
  // star streak is drawn along, and it is in screen px because the streak is a
  // screen-space mark. ZEROED ON A RESTART, exactly as gate.seeded is: the camera
  // snaps there, and a snap is not travel to be drawn as a smear.
  let camVX = 0;
  let camVY = 0;
  // The zoom state is the WIDTH, not the scale: camWide === 1 / z. Easing the
  // width is what makes the VISIBLE WIDTH linear in cursor travel, and the
  // visible width is the quantity the eye actually reads. Easing z itself would
  // put the motion in the wrong variable and the widening would crawl at the
  // near end and lunge at the far end.
  let camWide = 1;
  // The lowest scale the arena clamp can survive, computed from the world rather
  // than written down: below it the view is WIDER than the arena, the clamp's
  // upper bound `ARENA_W - PLAY_W / z` goes negative and Math.max(0, negative)
  // pins the camera at 0. Set in setKernel() — 1/6 in today's 6x11 world, where
  // the horizontal binds first (1/6 against the vertical's 1/11). THE FAILURE IS
  // COSMETIC, NOT A LOST SHIP: once the view covers the whole arena the kernel's
  // own wall bounce keeps the ship inside it, so what actually happens is a
  // pinned view, not a ship off screen. Widen's rail is 3, half of what it takes
  // to reach this floor, so the panel cannot get there at all.
  let ZOOM_FLOOR = 1 / 6;
  // The PRESENTED pose the last camera step clamped against. Recorded for the
  // test seam alone and read by nothing that draws: the leash is applied to the
  // presented pose, so any instrument that measures the ship's distance to a view
  // edge from S.player instead is off by up to one tick of motion (about 4 px at
  // this ship's speed) and reports a margin violation that is not there.
  let camPose = null;
  // The shake the last presented frame applied, in SCREEN px. Recorded for the
  // test seam alone and read by nothing that draws — the shake itself is a
  // ctx.translate() and does not need to be remembered to be drawn.
  let lastShakeX = 0;
  let lastShakeY = 0;
  let camClock = 0;         // the previous presented time, for the ease's dt
  let camTick = -1;         // the previous S.tick — a fall means the kernel reset
  // The cursor as the page last saw it, in STAGE coordinates. A stage point is
  // stored and a world point is derived per frame, because the camera the point
  // rides on moves between the pointermove and the frame that reads it. NaN is
  // "no cursor" — AUTO, or HUMAN before the first pointermove.
  let curStageX = NaN;
  let curStageY = NaN;

  function setKernel(k) {
    kernel = k;
    S = k.S;
    W = k.W;
    H = k.H;
    PLAY_W = k.PLAY_W;
    PLAY_H = k.PLAY_H;
    ARENA_W = k.ARENA_W;
    ARENA_H = k.ARENA_H;
    ARENA_COLS = k.ARENA_COLS;
    ARENA_ROWS = k.ARENA_ROWS;
    BOUNDED = k.WORLD_BOUNDED === true;
    C = k.C;
    RGB = k.RGB;
    WAVES = k.WAVES;
    STATS = k.STATS;
    TAU = k.TAU;
    rgba = k.rgba;
    rgbFor = k.rgbFor;
    cssFor = k.cssFor;
    wrap = k.wrap;
    delta = k.delta;
    angleDelta = k.angleDelta;
    easeOut = k.easeOut;
    clamp = k.clamp;
    lerp = k.lerp;
    starEaterSegments = k.starEaterSegments;
    findEnemy = k.findEnemy;
    // Read from the world, never written down. See ZOOM_FLOOR's declaration.
    ZOOM_FLOOR = Math.max(PLAY_W / ARENA_W, PLAY_H / ARENA_H);
    camTick = -1; // a fresh binding is a fresh run — the next render snaps the camera
    camWide = 1;  // and a fresh run is 1x until the first cursor says otherwise
  }

  // The live scale. z = 1 means one world px per stage px, which is what the
  // wrapping build has always drawn at — so this is 1 there by construction and
  // never by an ease that happens to have settled.
  function camScale() {
    return BOUNDED ? 1 / camWide : 1;
  }

  // The ONE stage-to-world conversion. Its only caller today is provider() in
  // demo-play.html — the render plane's own caller was aimDir(), which the
  // owner's camera rule deleted (hop 3R), and cursorOffset() deliberately does
  // NOT call it (it needs a camera-independent DISPLACEMENT, not a point; see
  // the derivation there). TWO COPIES OF `stage / z + cam` IS HOW THE 03M-D AIM
  // DRIFT COMES BACK (1f118bb) — the owner has flown that exact signature once
  // and will name it in seconds. If a caller needs a world POINT, it calls this;
  // it does not rebuild it from getCamOrigin().
  //
  // The inverse of what beginCanvas() applies: a world point (wx, wy) is drawn at
  // stage (z * (wx - camX), z * (wy - camY)), so wx = sx / z + camX.
  //
  // At z === 1 this is `sx + camX`, the arithmetic every caller used before the
  // zoom, unchanged: division by 1.0 is exact in IEEE-754, it preserves signed
  // zero, and NaN / 1 === NaN so the "no cursor yet" hold survives untouched.
  function stageToWorld(sx, sy) {
    const z = camScale();
    const cam = getCamOrigin();
    return { x: sx / z + cam.x, y: sy / z + cam.y };
  }

  // z = 1 / (1 + t * (WIDEN - 1)) makes the VISIBLE WIDTH linear in cursor
  // travel, which is the quantity the eye reads. Easing z itself would not be.
  //
  // D IS MEASURED FROM THE PANE CENTRE, NOT FROM THE SHIP, and that is the one
  // place this feature deviates from the owner's own words ("by measuring
  // distance between cursor and ship"). The reason is hard, not a preference:
  // the ship's SCREEN position is z * (pose.x - camX), so a ship-anchored D makes
  // z depend on a quantity z moves. camX cannot follow inside a frame (it eases
  // at 0.05/tick, tau 0.325 s), so the frame-timescale loop gain is
  // (PLAY_W / 2z) * |dz/dD| = 1.52 at z = 1 — ABOVE UNITY — and the result is a
  // period-2 limit cycle with z alternating between the rails every frame across
  // most of the pane. A WORLD-px distance is worse: the law becomes the implicit
  // equation u * f(u) = D, which is bistable and hysteretic — walking the mouse
  // out to 160 px and back to 140 px gives z = 0.726 going out and 0.580 coming
  // back, a camera that depends on where your hand has BEEN.
  //
  // The pane centre has loop gain EXACTLY ZERO: curStageX is written only by
  // trackCursor() from the element rect and is a pure function of the mouse
  // pixel. The cost is small and honest — with the cursor exactly on the ship, D
  // is |lead| * z rather than 0, up to 273 px, which pokes 73 px past the dead
  // zone at full speed and buys about a 6 % widening. Imperceptible.
  //
  // DO NOT "FIX" THIS TO THE SHIP. The next editor will read the owner's words
  // and reintroduce the oscillation.
  function zoomFor(D) {
    if (!(ZOOMWIDE > 1)) return 1;   // OFF, and NaN-safe: !(NaN > 0) is true
    const t = Math.min(1, Math.max(0, (D - ZOOMDEAD) / ZOOMREF));
    // A SECOND FLOOR UNDER THE BLANK-PANE TRAP. Math.max(0, NaN) is NaN, so a
    // non-finite D would return NaN and ctx.scale(NaN, NaN) draws nothing at all.
    // updateCamera()'s !aiming() branch is the real defence and this must never
    // be the thing that saves it — but a scale is not a number to be casual
    // about, and !(t >= 0) fires on NaN and on nothing else a finite D produces.
    if (!(t >= 0)) return 1;
    return 1 / (1 + t * (ZOOMWIDE - 1));
  }

  // Bounded: there is no seam to cross, so the presented pose is the plain lerp.
  // Wrapping: the step may have crossed the seam, so the move is the SHORT way
  // round and the result comes back inside the field.
  function renderPos(o, alpha) {
    if (BOUNDED) {
      return {
        x: o.px + (o.x - o.px) * alpha,
        y: o.py + (o.y - o.py) * alpha
      };
    }
    return {
      x: wrap(o.px + delta(o.px, o.x, W) * alpha, W),
      y: wrap(o.py + delta(o.py, o.y, H) * alpha, H)
    };
  }

  // The ghost copies an entity needs while it straddles the seam. A bounded
  // world has no seam, so it has no copies — the callers loop over nothing.
  const NO_OFFSETS = [];

  function wrappedRenderOffsets(pos, margin) {
    if (BOUNDED) return NO_OFFSETS;
    const xs = [0];
    const ys = [0];
    if (pos.x < margin) xs.push(W);
    if (pos.x > W - margin) xs.push(-W);
    if (pos.y < margin) ys.push(H);
    if (pos.y > H - margin) ys.push(-H);
    const offsets = [];
    for (let xi = 0; xi < xs.length; xi++) {
      for (let yi = 0; yi < ys.length; yi++) {
        if (xs[xi] || ys[yi]) offsets.push({ x: xs[xi], y: ys[yi] });
      }
    }
    return offsets;
  }

  // ---- the lookahead, KNOWINGLY TEMPORARY ---------------------------------
  // Everything from here to gatedLead() is production-DERIVED lead maths
  // (js/game.js:1644-1657 leadVec, :1671-1703 gatedLead), living here only
  // because the lab has no camera of its own. PORT-S brings the kernel under
  // production's own updateCamera() via FRAME.cam and MUST DELETE this block —
  // two lead maths is not the end state. getCamOrigin() is the
  // seam that survives the deletion.
  //
  // DERIVED, not a copy, and since hop 3R it is not even the same RULE. Two of
  // the differences are re-expressions of the same quantity — the commit timer
  // counts SECONDS off the render dt instead of ticks, and the velocity half
  // divides by 60 because the demo stores px/s. The THIRD is not a re-expression
  // at all: the lead's second term is the owner's CURSOR PULL, which scales with
  // how far the cursor is from the pane centre. Production has no such term and
  // cannot get one by assignment — its cursorDir() (js/game.js:2110-2115)
  // computes that distance and divides it away on the very next line. Do not let
  // the word "copy" back into this paragraph.
  //
  // PORT-S DEBT — IT GOT BIGGER, AND THIS COMMENT IS NOT THE RECORD OF IT. Until
  // hop 3R the debt was a set of NUMBERS: PORT-S deletes this block, adopts
  // production's updateCamera(), and the owner's ease 0.05 and camLead 60 need
  // carrying over production's 0.08 and 25 (js/game.js:1614, :1616). It is now a
  // RULE. `ship + vel*CAMLEAD + CursorPull*cursorOffset` is not a retuning of
  // `ship + [vel*CAMLEAD*(1-B) + unitDir*AIMLEAD*B]`; the two disagree about what
  // the camera is FOR. So PORT-S can no longer delete this block and use
  // production's camera without reverting a mechanism the owner asked for by name
  // — either production gains the rule, or he loses it, and that is his call and
  // not the port's. The durable record is
  // .ai-reference/prompts/port-w-20260824/PORT-S-DEBT.md and PLAN.md's PORT-S
  // paragraph — a comment on a block marked for deletion cannot be the record.

  // The page hands over the cursor's STAGE point and nothing else. It cannot
  // hand over a world point: by the time a frame reads it the camera has moved,
  // so a world point banked at pointermove time is stale by exactly the camera
  // step. Null (or any non-finite pair) clears it.
  function setCursorStage(sx, sy) {
    const ok = Number.isFinite(sx) && Number.isFinite(sy);
    curStageX = ok ? sx : NaN;
    curStageY = ok ? sy : NaN;
  }

  // production's aiming() (js/game.js:1773) is the right-hold aim MODE. The lab
  // has exactly one aim mode, so its reading is simply "the cursor is flying".
  function aiming() {
    return Number.isFinite(curStageX);
  }

  // THE CURSOR HALF OF THE OWNER'S CAMERA RULE.
  //
  // He stated the rule himself, 2026-08-24, after four rounds of camera work had
  // chased something else:
  //
  //   "the whole camera adjustments i really wanted was just the ability to
  //    slide the camera center away from the center of the ship depending on
  //    where the cursor is and the current velocity vector of the ship, with a
  //    blend between those two."
  //   "(( ShipCenter + leadVec ) * (1 - Blend) + CursorCenter * (Blend)
  //    So halfway between ShipCenter and CursorCenter at 0.5, right?"
  //
  // IMPLEMENTED IN ITS SOLVED FORM, AND THAT IS NOT A LIBERTY. The literal
  // formula has the camera on BOTH sides: CursorCenter is a WORLD point, and the
  // stage -> world conversion runs through the camera itself. Write the camera
  // CENTRE as Cc, the ship as Sh, the velocity lead as L, and the cursor's offset
  // from the PANE CENTRE in world px as u. The cursor's world point is Cc + u by
  // the definition of the pane centre, so
  //
  //     Cc = (Sh + L) * (1 - B) + (Cc + u) * B
  //     Cc * (1 - B) = (Sh + L) * (1 - B) + u * B
  //     Cc = Sh + L + u * B / (1 - B)
  //
  // TWO CONSEQUENCES, and both are written down here because neither is what the
  // formula READS like:
  //
  // 1. THE MIX TERM IS A GAIN, B / (1 - B). So the dial IS that gain, and it is
  //    named CursorPull and not Blend. CursorPull 1.0 IS the owner's Blend 0.5 —
  //    the camera exactly halfway between the ship and the cursor. The literal
  //    dial would have been dead over most of its rail: gain 0.33 at B 0.25, 1 at
  //    0.5, 3 at 0.75, 9 at 0.9, and UNDEFINED at B 1, where no solution exists
  //    at all (a screen-FIXED cursor cannot be put at the view centre). The Edge
  //    leash saturates that instead of letting it diverge, which is exactly why
  //    it would have been mistaken for a dial that "stops doing anything" above
  //    about 0.6. CursorPull is linear across its whole rail and has no
  //    singularity anywhere on it.
  //    DO NOT "RESTORE" THE LITERAL FORMULA. The panel has no tooltips, and this
  //    comment is the only place the equivalence is recorded.
  //
  // 2. THE (1 - B) ON THE LEAD CANCELS. The velocity lead arrives at FULL
  //    strength at every setting. CamLead and CursorPull are two INDEPENDENT
  //    amounts and not a seesaw — "lead my own motion" and "look where I point"
  //    are tuned separately, which is a feature. It is also why no (1 - pull)
  //    factor appears anywhere below, and why its absence is not an omission.
  //
  // u IS CAMERA-INDEPENDENT, which is why this is NOT a second copy of the
  // stage -> world conversion stageToWorld() owns. u is a stage -> world
  // DISPLACEMENT, (stage - paneCentre) / z, and the camera origin cancels out of
  // it exactly. The 03M-D aim drift (1f118bb) came from banking an absolute world
  // POINT that the camera then moved out from under; a displacement has no
  // absolute point in it and cannot carry that fault.
  //
  // NO CURSOR IS NO PULL. curStageX is NaN in AUTO, and in HUMAN before the first
  // pointermove. Zero is the right answer there, and it is the same answer the
  // zoom's !aiming() branch gives: with no cursor there is nothing to look
  // toward. The aim ramp this replaces took the OPPOSITE convention — it reported
  // dist Infinity with no cursor so the ramp SATURATED — and that convention died
  // with the ramp. Do not carry it back here.
  function cursorOffset() {
    if (!aiming()) return { x: 0, y: 0 };
    const z = camScale();
    return { x: (curStageX - PLAY_W / 2) / z, y: (curStageY - PLAY_H / 2) / z };
  }

  // The whole lead: the velocity half, then the owner's cursor pull.
  //
  // The velocity half is js/game.js:1644-1657's, and it is the trap: production's
  // P.vel is px/TICK, so `vel * CAMLEAD` is CAMLEAD ticks of it, while the demo's
  // S.player.vx is px/SECOND — the /60 buys the same quantity. The demo flies
  // about twice production's speed (245 vs 120 px/s), so that half throws about
  // twice as far at the shipped CAMLEAD. The arithmetic is right and the dial is
  // the lever; do not rescale the default to hide it.
  //
  // AND THE DIAL WAS PULLED — the other way. The owner flew this and moved
  // camLead 25 -> 60, MORE throw, not less (owner feel gate, 2026-08-24). So the
  // instruction above stands unviolated: nothing was rescaled to hide the 2x, the
  // lever was simply used. The direction is itself the surprise worth recording —
  // at twice production's speed the throw still read SHORT to him, which is
  // evidence the 2x conversion is not what the camera feels like, and a reason to
  // leave the /60 exactly as it is.
  //
  // THE CURSOR TERM IS PART OF THE LEAD, AND ON PURPOSE. It goes through
  // gatedLead() with the velocity half rather than around it, because the gate
  // exists to stop the view shaking on a quick reversal and the cursor is where
  // the quick reversals come from. Putting the pull outside the gate would leave
  // the gate guarding the calmer of the two terms.
  //
  // Production's LEADSRC selector (js/game.js:1617, "vel" | "aim" | "blend" |
  // "add" | "swap") is GONE from this plane. It selected among mixes of a
  // velocity lead and a UNIT-direction aim lead, and the owner's rule has no unit
  // direction in it, so four of its five branches had nothing left to select.
  // Production still has the selector, and this file no longer mirrors it; that
  // divergence is recorded in PORT-S-DEBT.md, not here.
  function leadVec() {
    const vx = S.player.vx / 60 * CAMLEAD;
    const vy = S.player.vy / 60 * CAMLEAD;
    const u = cursorOffset();
    return { x: vx + CURSORPULL * u.x, y: vy + CURSORPULL * u.y };
  }

  // js/game.js:1671-1703. A quick reversal flips the ideal lead by up to
  // ~2 x VMAX x CAMLEAD px in one frame and the ease starts chasing at once, so
  // the camera follows a persistent COMMITTED lead instead: it tracks the ideal
  // live while the two stay within 60 degrees (or either is near zero), and a
  // sharp conflict freezes the committed lead and times the candidate instead.
  //
  // The TIMER is where the port diverges, deliberately. Production counts ticks
  // and commits at Math.max(1, Math.round(LEADDZ / TICK)) = 12 at 60 Hz. This
  // camera runs once per render(), on a dt already clamped to [0, CAM_DT_MAX],
  // so the timer accumulates SECONDS off that same dt and commits at
  // LEADDZ / 1000. One clock, and 200 ms is 200 ms on a 144 Hz panel too.
  const gate = { x: 0, y: 0, cx: 0, cy: 0, timer: 0, seeded: false };

  function gatedLead(dt) {
    const i = leadVec();
    if (LEADDZ === 0 || !gate.seeded) { // gate off, or fresh after a restart — take the ideal as-is
      gate.x = i.x;
      gate.y = i.y;
      gate.timer = 0;
      gate.seeded = true;
      return { x: gate.x, y: gate.y };
    }
    // THE `< 1` BYPASS, RE-CHECKED AGAINST THE NEW MAGNITUDES (hop 3R) rather
    // than inherited: a lead under one px has no meaningful DIRECTION, so the
    // 60-degree conflict test would be comparing noise. Under the old aim ramp
    // the lead was 300 px flat whenever a cursor existed and this branch was
    // effectively unreachable in HUMAN. Under the owner's rule the lead is
    // vel*CAMLEAD + CursorPull * (cursor offset from the PANE CENTRE), so it is
    // small exactly when the ship is nearly stopped AND the cursor is nearly on
    // the pane centre — which is the spawn pose, and is a real event rather than
    // an impossible one. It is still the right guard, and it now fires: at the
    // shipped dials a stationary ship with the cursor 1 px off centre has a lead
    // of 1 px. Left exactly as production wrote it.
    const im = Math.hypot(i.x, i.y);
    const cm = Math.hypot(gate.x, gate.y);
    if (im < 1 || cm < 1 || i.x * gate.x + i.y * gate.y >= 0.5 * im * cm) {
      gate.x = i.x; // no sharp conflict (dot >= cos 60 x |i||c|) — track live
      gate.y = i.y;
      gate.timer = 0;
    } else {
      // sharp conflict — hold the committed lead and time the candidate
      if (gate.timer > 0 && i.x * gate.cx + i.y * gate.cy >= 0.5 * im * Math.hypot(gate.cx, gate.cy)) {
        gate.timer += dt; // the ideal is still pointing the candidate's way
      } else {
        gate.cx = i.x; // a new direction — restart the persistence clock on it
        gate.cy = i.y;
        gate.timer = dt;
      }
      if (gate.timer >= LEADDZ / 1000) {
        gate.x = i.x; // held long enough — commit; the ease glides from here
        gate.y = i.y;
        gate.timer = 0;
      }
    }
    return { x: gate.x, y: gate.y };
  }

  // A scale that changes by an ASSIGNMENT rather than by an ease has to carry
  // the origin with it, or the picture jumps. The ship's screen x is
  // z * (pose.x - camX), so holding that product fixed across the switch is one
  // line per axis: camX' = pose.x - (pose.x - camX) * zBefore / z.
  //
  // THE ANCHOR IS THE SHIP, NOT THE PANE CENTRE, and the difference is not a
  // preference. Anchoring the centre still moves the ship by
  // (z - zBefore) * (pose.x - centre), which the camera lead alone can make 150
  // screen px. Anchoring the ship makes the displacement identically zero.
  //
  // THE LEASH CANNOT INVERT UNDER THIS MAP, by construction rather than by luck.
  // The leash bounds the SAME quantity this map scales — it asks for
  // EDGEMARGIN / z <= pose.x - camX <= (PLAY_W - EDGEMARGIN) / z — and the map
  // multiplies (pose.x - camX) by exactly zBefore / z. So a camera legal at
  // zBefore lands legal at z, on both axes, at every scale. The arena clamp
  // below is a separate bound and may still shave the result at a wall; it is
  // the same clamp that would have run anyway.
  function reanchorScale(pose, zBefore) {
    const z = camScale();
    if (!(zBefore > 0) || !(z > 0) || z === zBefore) return;
    const k = zBefore / z;
    camX = pose.x - (pose.x - camX) * k;
    camY = pose.y - (pose.y - camY) * k;
  }

  // One camera step per presented frame. The target is the ship's PRESENTED
  // pose, so the camera and the ship it follows read the same interpolation.
  // The order is production's: the lead enters the ease TARGET only, then the
  // leash, then the world clamp last.
  function updateCamera(alpha) {
    if (!S.player) return;
    const pose = renderPos(S.player, alpha);
    camPose = pose;
    const clock = S.time + alpha * kernel.STEP;
    const restart = camTick < 0 || S.tick < camTick;
    let dt = restart ? 0 : clock - camClock;
    if (!(dt > 0)) dt = 0; // a stalled or rewound clock is no time at all
    if (dt > CAM_DT_MAX) dt = CAM_DT_MAX;
    camClock = clock;
    camTick = S.tick;
    // ---- the zoom step, FIRST, and deliberately so -------------------------
    // camWide is a pure function of the cursor's stage point and the dials. It
    // reads nothing the camera writes, so putting it first costs nothing and
    // gives every line below it this frame's own scale rather than last frame's.
    //
    // THE AUTO TRAP: curStageX is NaN in AUTO, and NaN would run straight
    // through zoomFor() into ctx.scale(NaN, NaN), which draws A BLANK PANE. The
    // !aiming() branch is not a nicety, it is the whole defence. And it EASES
    // rather than snaps, so leaving Human mode glides back to 1x over about a
    // second. Both cursor-fed terms in this file now agree on the convention —
    // no cursor is no zoom here, and no cursor is no pull in cursorOffset().
    // OFF IS A SWITCH, NOT A TRANSITION, and it has to be. An asymptotic ease
    // reaches 1.0 only in the limit: measured in the browser, coming from Widen 2
    // it was still 0.9990 after 2.5 s and 0.99999 after 5 s, so "Widen 1.0 is the
    // byte-exact OFF" would have been a claim that came true about eight seconds
    // after the pilot let go of the slider — which is to say, not a claim. At the
    // OFF rail camWide is ASSIGNED 1, so z is exactly 1 on the very next frame.
    // (This is a feel property, not a hash one: the no-recapture argument rests
    // on WORLD_BOUNDED, not on this dial.)
    //
    // THE SCALE CANNOT SWITCH ALONE. A scale is half of a view; the other half
    // is the origin it scales about, and assigning one without the other moves
    // every world point on the glass. Measured in Chrome at the OFF rail from a
    // settled z = 0.5000000097: the ship jumped 545.28, 306.84 screen px on the
    // next frame and then crawled back at ~33 px a frame. Hence reanchorScale()
    // below — the switch keeps the ship exactly where it is and only the FIELD
    // OF VIEW changes, which is what "off" is supposed to look like.
    const zoomOff = !(ZOOMWIDE > 1);
    let targetWide = 1;
    if (!zoomOff && aiming()) {
      const D = Math.hypot(curStageX - PLAY_W / 2, curStageY - PLAY_H / 2);
      targetWide = 1 / zoomFor(D);
    }
    // THREE CASES, NOT TWO, and folding the first two together is what made the
    // view ease back out after every death. A restart wants the width it would
    // have SETTLED at, which with a live cursor at a corner is about 2 — not 1.
    // Measured before this fix: reset with the cursor in the corner gave
    // target 0.5, then z = 1, .9615, .9272, .8966, .8690 ... — the ease crawling
    // back out over about a second, in a build whose own comment two lines down
    // says a restart must never glide in from anywhere.
    if (restart) {
      // targetWide is already 1 when the zoom is off or there is no cursor, so
      // this one assignment covers all three of those. The snap below re-seeds
      // camX/camY from the pose against exactly this z, so there is no origin
      // continuity to preserve and reanchorScale() has no work to do here.
      camWide = targetWide;
    } else if (zoomOff) {
      const zBefore = camScale();
      camWide = 1;
      reanchorScale(pose, zBefore);
    } else {
      const zEase = 1 - Math.pow(1 - ZOOMEASE, dt * CAM_EASE_HZ);
      camWide += (targetWide - camWide) * zEase;
      // The last hair snaps, so a settled view is exactly its target rather than
      // a double a few ULP away from it.
      if (Math.abs(targetWide - camWide) < 1e-9) camWide = targetWide;
    }
    const z = camScale();
    if (restart) {
      // A reset moves the ship without moving it: snap, never glide in from
      // wherever the last run parked the view.
      // THE WIDTH IS SNAPPED WITH IT, and it is snapped ABOVE, in the zoom step,
      // where the rest of the width lives. It was written `camWide = 1` there
      // once, which is not the same thing at all: a restart with a live cursor
      // wants that cursor's own width, and 1 made the view ease back out after
      // every death. Measured, and now instrumented — port-w-3q-probe.mjs
      // `creep` reads camScale() on each of the first frames after a reset.
      camX = pose.x - PLAY_W / (2 * z);
      camY = pose.y - PLAY_H / (2 * z);
      // production's setCamMode (js/game.js:1636-1637): the gate re-seeds from
      // the next ideal, so a restart never replays the old run's stale timer.
      gate.seeded = false;
      gate.timer = 0;
    } else {
      // The TARGET swings only when the gate commits — the ease still glides there.
      const l = gatedLead(dt);
      const ease = 1 - Math.pow(1 - CAM_EASE, dt * CAM_EASE_HZ);
      camX += (pose.x + l.x - PLAY_W / (2 * z) - camX) * ease;
      camY += (pose.y + l.y - PLAY_H / (2 * z) - camY) * ease;
      // The leash (js/game.js:1717-1718) — whatever the ease asked for, the ship
      // stays at least EDGEMARGIN px inside every view edge. The clamp below may
      // shave that margin at an arena wall; the ship still never leaves the view.
      // Every margin divides by z: the ship's screen x is z * (pose.x - camX),
      // so "at least EDGEMARGIN screen px inside the edge" is EDGEMARGIN / z
      // WORLD px. The interval is non-empty iff PLAY_W >= 2 * EDGEMARGIN, and
      // Z CANCELS out of that test entirely, so it holds at every zoom.
      // BOTH AXES ARE PART OF THE CLAIM: the y line below needs
      // PLAY_H >= 2 * EDGEMARGIN in its own right, and PLAY_H is the SHORTER
      // side, so the binding condition is min(PLAY_W, PLAY_H) >= 2 * EDGEMARGIN
      // — 120 <= 720 at the shipped Edge 60, and 400 <= 720 at the panel's rail
      // of 200. Naming PLAY_W alone proved half of it. setCamDials() enforces
      // exactly this bound, on the short side, so no caller can empty it either.
      camX = Math.max(pose.x - (PLAY_W - EDGEMARGIN) / z, Math.min(pose.x - EDGEMARGIN / z, camX));
      camY = Math.max(pose.y - (PLAY_H - EDGEMARGIN) / z, Math.min(pose.y - EDGEMARGIN / z, camY));
    }
    // js/game.js:1628-1630, parameterized by the arena AND by the zoom: the view
    // is PLAY_W / z world px wide now, so that is what has to fit. z is floored
    // at ZOOM_FLOOR because below it the upper bound goes negative — see the
    // ZOOM_FLOOR declaration for why that failure is cosmetic and why the panel
    // cannot reach it.
    const zc = Math.max(z, ZOOM_FLOOR);
    camX = Math.max(0, Math.min(ARENA_W - PLAY_W / zc, camX));
    camY = Math.max(0, Math.min(ARENA_H - PLAY_H / zc, camY));
    // The star sheet's screen offset, integrated from the camera's SCREEN motion.
    // See the declaration above for the derivation and for why the absolute form
    // it replaces yanked the field. LAST in the function, deliberately: the ease,
    // the leash and the arena clamp have all had their say by here, so what is
    // accumulated is the camera's real motion and not what the ease asked for.
    //
    // A restart SEEDS rather than accumulates, so a fresh run puts the sheet
    // exactly where the absolute expression would have put it. The camera has
    // just snapped, and the difference across a snap is not motion.
    if (restart) {
      starPanX = camX * z;
      starPanY = camY * z;
      camVX = 0;
      camVY = 0;
    } else {
      camVX = z * (camX - camPrevX);
      camVY = z * (camY - camPrevY);
      starPanX += camVX;
      starPanY += camVY;
    }
    camPrevX = camX;
    camPrevY = camY;
  }

  // The RAW origin: no shake, no interpolation of its own. The shake must stay
  // out because the cursor does not shake with the picture.
  //
  // ADDING THIS TO A STAGE POINT IS NOT THE CONVERSION, and it stopped being it
  // the moment the zoom landed: a world point is stage / z + origin, and only at
  // z === 1 are those the same arithmetic. Callers want stageToWorld(), which is
  // the one place that divide lives. This is kept exported for the callers that
  // want the ORIGIN itself, and for PORT-S, which keeps it as the seam.
  function getCamOrigin() {
    if (!BOUNDED) return { x: 0, y: 0 };
    return { x: camX, y: camY };
  }

  // The lab dials. A PARTIAL object: only the finite numbers land, unknown keys
  // are ignored, and a slider that sends a blank value leaves the dial alone.
  // This only STORES — with WORLD_BOUNDED off nothing ever reads what it wrote.
  //
  // FINITE IS NOT A DOMAIN. The HTML sliders cannot send an out-of-range number,
  // but this function is exported and the sliders are not its only caller — and
  // some of these dials have values that are finite and still destroy the frame:
  //   zoomEase -1  makes camWide 0 on the next step and z = Infinity;
  //   zoomEase  2  makes 1 - Math.pow(-1, dt * 60) NaN at any fractional-frame
  //                exponent, and ctx.scale(NaN, NaN) DRAWS A BLANK PANE;
  //   ease         the same two failures, in the pan instead of the zoom;
  //   zoomWide 12  puts the view wider than the arena, where the clamp's upper
  //                bound goes negative — see ZOOM_FLOOR;
  //   zoomRef  0   divides by zero inside zoomFor();
  //   edgeMargin 400 empties the leash interval — see the non-inversion proof
  //                in updateCamera(), which is exactly this bound.
  // So each dial is checked against its OWN domain and an out-of-domain value is
  // ignored, the same way an unknown key is. Where the domain is forced by the
  // maths it is derived here (zoomWide against ZOOM_FLOOR, edgeMargin against
  // the play box) rather than written down. Where the domain is a MEANING rather
  // than a limit — leadBlend is a 0..1 mix — the panel's rail is used and said so.
  function dial(v, lo, hi) {
    return Number.isFinite(v) && v >= lo && v <= hi;
  }
  // Half the SHORTER side: the leash needs EDGEMARGIN / z px at both ends of
  // both axes, so min(PLAY_W, PLAY_H) >= 2 * EDGEMARGIN is the real condition.
  function edgeCap() {
    return Number.isFinite(PLAY_W) && Number.isFinite(PLAY_H)
      ? Math.min(PLAY_W, PLAY_H) / 2 : Infinity;
  }
  function setCamDials(next) {
    if (!next || typeof next !== "object") return;
    if (dial(next.ease, 0, 1)) CAM_EASE = next.ease;                 // 1 - (1-e)^n needs 1-e >= 0
    if (dial(next.edgeMargin, 0, edgeCap())) EDGEMARGIN = next.edgeMargin;
    if (Number.isFinite(next.camLead)) CAMLEAD = next.camLead;       // a multiplier; any finite is safe
    // A GAIN, not a length, and not a 0..1 mix — see the derivation at
    // cursorOffset(). Any finite non-negative value is meaningful: the leash
    // saturates the large end, and 0 is the OFF switch (camera on ship + lead).
    // Negative is rejected because it would pull the camera AWAY from the cursor,
    // which is not a setting of this rule but a different rule.
    if (dial(next.cursorPull, 0, Infinity)) CURSORPULL = next.cursorPull;
    if (dial(next.leadDz, 0, Infinity)) LEADDZ = next.leadDz;        // ms, and 0 is the documented OFF
    if (dial(next.zoomWide, 1, 1 / ZOOM_FLOOR)) ZOOMWIDE = next.zoomWide;
    if (dial(next.zoomRef, Number.MIN_VALUE, Infinity)) ZOOMREF = next.zoomRef;  // strictly positive: it divides
    if (dial(next.zoomDead, 0, Infinity)) ZOOMDEAD = next.zoomDead;
    if (dial(next.zoomEase, 0, 1)) ZOOMEASE = next.zoomEase;         // as `ease`, and the blank-pane one
    if (dial(next.starLit, 0, Infinity)) STARLIT = next.starLit;     // an alpha multiplier, clamped at use
    // A SIZE multiplier, floored at use by STAR_MIN_PX — so no value of this dial
    // can put a star under 2 px and the sub-pixel regime is unreachable through
    // it. But FINITE IS NOT A DOMAIN, which is the lesson 03Q-E already paid for
    // on the zoom dials and which this pair had not: the floor bounds the LOW
    // side and nothing bounded the high one, so starSize Number.MAX_VALUE draws
    // sizes that overflow to Infinity and streak does the same to the tail
    // length. Both now take the PANEL's own rail as their domain, which is what
    // the slider can already express and therefore costs no reachable value.
    // (Codex vendor-cross, 03R review.)
    if (dial(next.starSize, 1, 4)) STARSIZE = next.starSize;         // the panel rail; the 2 px floor still applies UNDER the multiply
    if (dial(next.zoomLW, 0, 1)) ZOOMLW = next.zoomLW;               // MEANING: none .. full compensation
    if (dial(next.streak, 0, 2)) STREAK = next.streak;               // frames of camera travel drawn as a tail; 0 = OFF
  }

  function getCamDials() {
    return {
      ease: CAM_EASE,
      edgeMargin: EDGEMARGIN,
      camLead: CAMLEAD,
      cursorPull: CURSORPULL,
      leadDz: LEADDZ,
      zoomWide: ZOOMWIDE,
      zoomRef: ZOOMREF,
      zoomDead: ZOOMDEAD,
      zoomEase: ZOOMEASE,
      starLit: STARLIT,
      starSize: STARSIZE,
      zoomLW: ZOOMLW,
      streak: STREAK
    };
  }

  // Stroke weight under zoom. Line art is specified in WORLD px and the canvas
  // draws it at z * w device px, so at z = 0.5 the player hull's 1.65 becomes
  // 0.83 device px — sub-pixel, and canvas alpha-blends what it cannot fill, so
  // THE LINE ART DIMS AS WELL AS SHRINKS. That is the same defect class as the
  // starfield complaint (03P-B): ink lost to sub-pixel coverage, read by the eye
  // as a fade. This multiplies the requested width by (1/z)^ZOOMLW.
  //
  // ZOOMLW is a dial and not a decision, because neither end is obviously right:
  // 1 holds the stroke at a constant DEVICE width, which keeps every line crisp
  // but makes the fleet look heavier as the view widens; 0 is today's behaviour
  // and lets it dim. 0.5 is the geometric mean and the shipped default, pending
  // the owner's eye.
  //
  // AT z === 1 THIS IS EXACTLY THE IDENTITY: Math.pow(1, k) is exactly 1 for
  // every k, and w * 1 is w for every double — so the wrapping build, where
  // camScale() is 1 by construction, is bit-identical with no branch at all.
  //
  // ALL 39 IN-SCOPE SITES OR NONE. Half a fleet with compensated strokes looks
  // worse than none. The 4 remaining `lineWidth` tokens in this file are the
  // `w`+`x`.lineWidth writes inside the `if (!BOUNDED)` backdrop body and are OUT OF
  // SCOPE. Counting them: an assignment to lineWidth through `ctx` must appear
  // in this file EXACTLY ONCE, on the next line but one; there must be 39 calls
  // to the helper; and there must be 4 `wx` writes left, all inside the backdrop.
  // The greps are written with character classes so they do not match this
  // comment and inflate their own answers:
  //   grep -c 'ct[x]\.lineWidth'  ->  1
  //   grep -c 'l[w](ctx, '        -> 40 (39 call sites plus this definition)
  //   grep -c 'w[x]\.lineWidth'   ->  4
  function lw(ctx, w) {
    ctx.lineWidth = w * Math.pow(1 / camScale(), ZOOMLW);
  }

  function glow(ctx, x, y, radius, color, alpha) {
    if (radius <= 0 || alpha <= 0) return;
    const rgb = rgbFor(color);
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, rgba(rgb, alpha));
    g.addColorStop(0.2, rgba(rgb, alpha * 0.55));
    g.addColorStop(1, rgba(rgb, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // The world-space entry point. Everything drawn after it sits at SIM
  // coordinates, so the camera translate belongs here, on top of the shake.
  // The background and the light clear run BEFORE it and stay screen-space.
  // TRANSFORM ORDER IS LOAD-BEARING IN BOTH DIRECTIONS. The scale goes AFTER the
  // shake, which keeps the shake a SCREEN-px constant instead of one that shrinks
  // as the view widens. It goes BEFORE the camera translate, which is what makes
  // -camX a WORLD offset. Swap them and the wrong world point is anchored.
  function beginCanvas(ctx, shakeX, shakeY) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.translate(shakeX || 0, shakeY || 0);
    if (BOUNDED) {
      const z = camScale();
      ctx.scale(z, z);
      ctx.translate(-camX, -camY);
    }
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
  }

  // The canvas extent in CSS pixels — what a full-surface fill or clear must
  // cover. It equals the play box today, and stops being the same number the
  // moment the view is allowed to be wider than the box encounters are built for.
  function canvasW(ctx) { return ctx.canvas.width / DPR; }
  function canvasH(ctx) { return ctx.canvas.height / DPR; }

  // A positive modulo that tiles the star field across the view. This is screen
  // dressing, not world topology: the bounded world has no seam, the star sheet
  // simply repeats so a panning camera never runs off the end of it.
  function tileMod(n, size) { return ((n % size) + size) % size; }

  function drawBackground() {
    wx.setTransform(DPR, 0, 0, DPR, 0, 0);
    wx.fillStyle = C.dark;
    wx.fillRect(0, 0, canvasW(wx), canvasH(wx));
    // Screen-pinned art, kept for the wrapping build only. drawBackground()
    // resets the transform before beginCanvas() applies the camera translate, so
    // every draw below rides the monitor and not the world. In a wrapping field
    // that is correct — the field IS the view. In a scrolling arena the same draw
    // reads as a vignette stuck to the glass rather than a place you fly past, so
    // the bounded build skips it (owner feel gate, 2026-08-24). Guarded, never
    // deleted: with WORLD_BOUNDED off these pixels must not move.
    if (!BOUNDED) {
      const nebula = wx.createRadialGradient(PLAY_W * 0.72, PLAY_H * 0.24, 0, PLAY_W * 0.72, PLAY_H * 0.24, Math.max(PLAY_W, PLAY_H) * 0.58);
      nebula.addColorStop(0, "rgba(89,25,113,0.11)");
      nebula.addColorStop(0.45, "rgba(27,31,77,0.045)");
      nebula.addColorStop(1, "rgba(0,0,0,0)");
      wx.fillStyle = nebula;
      wx.fillRect(0, 0, canvasW(wx), canvasH(wx));

      const blueCloud = wx.createRadialGradient(PLAY_W * 0.18, PLAY_H * 0.78, 0, PLAY_W * 0.18, PLAY_H * 0.78, Math.max(PLAY_W, PLAY_H) * 0.42);
      blueCloud.addColorStop(0, "rgba(18,92,122,0.075)");
      blueCloud.addColorStop(0.5, "rgba(21,40,84,0.035)");
      blueCloud.addColorStop(1, "rgba(0,0,0,0)");
      wx.fillStyle = blueCloud;
      wx.fillRect(0, 0, canvasW(wx), canvasH(wx));

      // A quiet eclipsed planet supplies the large celestial scale visible in
      // Nova Drift's battlefields without competing with combat silhouettes.
      const planetR = clamp(Math.min(PLAY_W, PLAY_H) * 0.14, 62, 138);
      const planetX = PLAY_W * 0.16;
      const planetY = PLAY_H * 0.76;
      wx.save();
      wx.translate(planetX, planetY);
      wx.rotate(-0.24);
      wx.strokeStyle = "rgba(102,214,240,0.10)";
      wx.lineWidth = 4;
      wx.beginPath();
      wx.ellipse(0, 0, planetR * 1.72, planetR * 0.24, 0, 0, TAU);
      wx.stroke();
      wx.restore();
      wx.save();
      wx.translate(planetX, planetY);
      const planet = wx.createRadialGradient(-planetR * 0.42, -planetR * 0.48, planetR * 0.04, 0, 0, planetR);
      planet.addColorStop(0, "rgba(70,58,105,0.44)");
      planet.addColorStop(0.38, "rgba(19,20,43,0.96)");
      planet.addColorStop(1, "rgba(2,3,10,0.995)");
      wx.fillStyle = planet;
      wx.beginPath();
      wx.arc(0, 0, planetR, 0, TAU);
      wx.fill();
      wx.strokeStyle = "rgba(235,93,196,0.16)";
      wx.lineWidth = 1.2;
      wx.stroke();
      wx.rotate(-0.24);
      wx.strokeStyle = "rgba(190,103,221,0.11)";
      wx.lineWidth = 1.5;
      wx.beginPath();
      wx.ellipse(0, 0, planetR * 1.72, planetR * 0.24, 0, 0.08, Math.PI - 0.08);
      wx.stroke();
      wx.restore();

      wx.save();
      wx.globalAlpha = 0.075;
      wx.strokeStyle = "#7280aa";
      wx.lineWidth = 0.55;
      const grid = 96;
      const ox = (S.time * -2.2) % grid;
      const oy = (S.time * 1.25) % grid;
      wx.beginPath();
      for (let x = ox; x < PLAY_W; x += grid) { wx.moveTo(x, 0); wx.lineTo(x, PLAY_H); }
      for (let y = oy; y < PLAY_H; y += grid) { wx.moveTo(0, y); wx.lineTo(PLAY_W, y); }
      wx.stroke();
      wx.restore();
    }
    // Bounded: three depths by star index, drifting at a quarter, a half and
    // three quarters of the camera's motion, THE FAR ONES DRAWN DIMMER RATHER
    // THAN SMALLER. A wrapping world has nothing to be parallax TO — the field is
    // the world, so the star sheet is nailed to it.
    //
    // WHY THE DEPTH MOVED OUT OF THE AREA (owner, 2026-08-24: "the starfield
    // looks dimmer when my ship is in motion, why is that? It feels like it's not
    // really selling the 'motion' very well because it's like they fade when I
    // move"). Three faults compounded:
    //   1. THE SHRINK COST AREA. Stars are generated at 0.35..1.60 px
    //      (js/demo-kernel.js:430) and the bounded draw multiplied that by
    //      0.5 / 0.7 / 0.9. Half the SIZE is a QUARTER of the ink, so across the
    //      three layers the bounded field carried about HALF the light the
    //      wrapping build had.
    //   2. LAYER 0 RAN 0.175 TO 0.80 px, well under a whole pixel.
    //   3. MOTION EXPOSED IT — which is exactly the complaint. Stationary, a
    //      sub-pixel star puts its ink in the same one or two pixels every frame
    //      and the eye integrates it. Moving, sx sweeps across pixel boundaries
    //      and the peak is re-divided every frame. Each layer sweeps at a
    //      different rate, so they never agree.
    // The fix is to floor the drawn size and express depth as an alpha multiplier
    // on top of the existing twinkle.
    //
    // CORRECTION, 2026-08-25 (03R-F), because this block used to overstate what
    // fault 2 was. IT WAS NEVER STATIC DIMNESS. Photometry over all 177 stars:
    // at twinkle mid, ZERO of them fall under 0.05 effective per-pixel alpha at
    // ANY sub-pixel alignment, and even the worst case in the whole field —
    // twinkle floor, layer 0, s = 1.0, centred on a pixel corner — still delivers
    // 9.6 code values of luma over a background of 7.3. Visible. The line that
    // said "about a quarter of the field drew nothing a human eye could find" was
    // wrong and is deleted rather than softened.
    // What the floor actually cures is a MOTION-ONLY artefact: 90 of the 177
    // stars sat at exactly 1.000 px under the old floor, and a 1 px square's peak
    // 2D coverage swings the full 4:1 with sub-pixel phase — which in steady
    // flight beats at 1.25 / 2.50 / 3.75 Hz per layer, a slow fade riding on top
    // of the twinkle and present ONLY in motion. That is real, and hop 3R's R4
    // measured it: thrust-over-still pixels above +128 went 0.765 before the
    // floor to 1.096 after it. It is simply not the same claim as "too faint to
    // see", and the difference matters to the next reader who has to decide
    // whether the floor may be lowered.
    //
    // BOUNDED ONLY. The else branch is the flag-OFF path and must not move one
    // byte — and that matters more since the backdrop removal, because the
    // starfield is now the only BACKGROUND motion cue in the bounded build. Not
    // the only motion cue: the ship's own drift past the enemies, the bullets
    // and the portals all read as motion too. The star sheet is the only thing
    // left that says how fast the WORLD is going by.
    //
    // THE FADE QUESTION IS CLOSED, and the metric is why it stayed open so long.
    // Hop 3Q measured MEAN LUMINANCE of the isolated pass and got 1.042 moving
    // over still — no fade — while the owner was still looking at a field that
    // dimmed. Canvas coverage antialiasing is INK-CONSERVING, so mean luminance
    // is the one number that CANNOT see this defect: the ink does not move, only
    // its distribution does. Hop 3R re-measured by PEAK CONTRAST instead —
    // device pixels counted by how far above the background they sit — and the
    // fade was there in the numbers: pixels above +128 came in at 0.765 moving
    // over still before the floor, and 1.096 after it.
    const z = camScale();
    // THE STREAK, and it ships at 0 so this whole paragraph is dormant until the
    // owner moves the slider. What sells travel is not the star, it is the smear
    // the star leaves, and the smear is a real quantity here rather than an
    // invention: a layer's screen displacement over the last frame is exactly
    // -camV * depth (see starPanX), so the tail is drawn from where the star WAS
    // to where it is. STREAK is how many frames of that travel to draw, so the
    // length is proportional to speed with no second constant to tune.
    //
    // save/restore ONLY when it is on. lineCap is inherited canvas state and the
    // star pass is not the only thing that strokes; a "round" left behind here
    // has been seen to leak into the first frame of another pass. Wrapping the
    // loop unconditionally would also have changed the canvas call sequence of
    // the OFF path, and the OFF path is the one that has to stay byte-exact.
    const streakOn = BOUNDED && STREAK > 0;
    if (streakOn) wx.save();
    for (let i = 0; i < S.stars.length; i++) {
      const st = S.stars[i];
      const twinkle = 0.32 + (Math.sin(S.time * st.speed + st.phase) * 0.5 + 0.5) * 0.55;
      wx.fillStyle = rgba(rgbFor(st.tint), twinkle);
      if (BOUNDED) {
        const layer = i % 3;
        const depth = 0.25 + layer * 0.25;
        // DEPTH IS NOT IN THIS LINE. It is in STAR_LAYER_LIT, one line down,
        // and it is in NO OTHER LINE — a size multiplier here would charge the
        // far layers twice, once in area and once in alpha, which is the very
        // double penalty the paragraph above says was removed.
        // THE MULTIPLIER GOES UNDER THE FLOOR, NOT OVER IT. Math.max last is what
        // makes the sub-pixel band unreachable from the panel at any dial value.
        const size = Math.max(STAR_MIN_PX, st.size * STARSIZE);
        // The shared fillStyle above is REPLACED here and not on the else path,
        // so the wrapping build's star pixels are bit-identical to what they were.
        wx.fillStyle = rgba(rgbFor(st.tint), Math.min(1, Math.max(0, twinkle * STAR_LAYER_LIT[layer] * STARLIT)));
        // drawBackground() resets the transform, so this pass is screen space and
        // the tile covers the canvas whatever the zoom. starPanX is the camera's
        // SCREEN travel, integrated in updateCamera() — not `camX * z`, which is
        // an absolute world coordinate times a scale that moves, and which yanked
        // the whole field by up to 49x the camera's own motion whenever the zoom
        // was easing. The derivation is at the declaration, together with the
        // measurement showing the two agree bit for bit at the shipped ZoomMax
        // 1.0, where z never moves.
        const sx = tileMod(st.x * PLAY_W - starPanX * depth, PLAY_W);
        const sy = tileMod(st.y * PLAY_H - starPanY * depth, PLAY_H);
        // The tail runs BACKWARD along the star's own motion, so it points at
        // where the star came from. The star moved by -camV * depth, hence the
        // plain +camV * depth here, times the frames the dial asks for.
        const tx = streakOn ? camVX * depth * STREAK : 0;
        const ty = streakOn ? camVY * depth * STREAK : 0;
        // Under half a pixel of tail is not a mark, it is a rounding artefact, so
        // a slow frame draws the plain square and the two looks do not flicker
        // against each other at low speed.
        const streaking = Math.hypot(tx, ty) > 0.5;
        // A star that straddles a tile seam has to appear on BOTH sides of it.
        // Without the companion it thins to a sliver against the seam and then
        // pops back whole on the other side. The extent to test is the union of
        // the square and its tail, which is why the tail's sign matters: tileMod
        // puts the anchor in [0, PLAY_W) and the square alone can only cross the
        // FAR seam, but a tail pointing back can cross the near one.
        const loX = sx + Math.min(0, tx);
        const hiX = sx + size + Math.max(0, tx);
        const loY = sy + Math.min(0, ty);
        const hiY = sy + size + Math.max(0, ty);
        const xs = [0];
        if (hiX > PLAY_W) xs.push(-PLAY_W);
        if (loX < 0) xs.push(PLAY_W);
        const ys = [0];
        if (hiY > PLAY_H) ys.push(-PLAY_H);
        if (loY < 0) ys.push(PLAY_H);
        // AT STREAK 0 THIS DRAWS THE OLD PIXELS: tx and ty are 0, so loX/loY can
        // never go under 0, the two pushes reduce to the old overX / overY tests,
        // and the else branch is the same set of fillRects. One thing IS different
        // and is stated rather than glossed — the nested loop emits them in a
        // different ORDER (0,0 / 0,-H / -W,0 / -W,-H rather than 0,0 / -W,0 /
        // 0,-H / -W,-H). The four rects are at four distinct tile offsets and
        // cannot overlap unless a star is wider than the pane, so the composited
        // result is the same. Order, not pixels.
        if (streaking) {
          wx.strokeStyle = wx.fillStyle;
          wx.lineWidth = size;
          wx.lineCap = "round";   // EXPLICIT: inherited state has leaked into a frame here before
          wx.beginPath();
          for (let xi = 0; xi < xs.length; xi++) {
            for (let yi = 0; yi < ys.length; yi++) {
              const hx = sx + size / 2 + xs[xi];
              const hy = sy + size / 2 + ys[yi];
              wx.moveTo(hx, hy);
              wx.lineTo(hx + tx, hy + ty);
            }
          }
          wx.stroke();
        } else {
          for (let xi = 0; xi < xs.length; xi++) {
            for (let yi = 0; yi < ys.length; yi++) {
              wx.fillRect(sx + xs[xi], sy + ys[yi], size, size);
            }
          }
        }
      } else {
        wx.fillRect(st.x * PLAY_W, st.y * PLAY_H, st.size, st.size);
      }
    }
    if (streakOn) wx.restore();
    const def = WAVES[S.wave];
    // The fifth screen-pinned element (owner feel gate, 2026-08-24). Anchored at
    // PLAY_W * 0.82, PLAY_H * 0.34 with the transform still reset, so it rides the
    // monitor exactly as the four above it do. The CALL is guarded and the function
    // is left whole: a dead call is one line to restore, a dead function is not.
    if (!BOUNDED && def && def.omen && S.wave < WAVES.length - 1) drawStarEaterOmen(wx, def.omen);
  }

  function drawStarEaterOmen(ctx, intensity) {
    const x = PLAY_W * 0.82;
    const y = PLAY_H * 0.34;
    const pulse = 0.82 + Math.sin(S.time * 1.3) * 0.18;
    ctx.save();
    ctx.globalAlpha = intensity;
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.min(PLAY_W, PLAY_H) * 0.2);
    g.addColorStop(0, rgba(RGB.ink, 0.52 * pulse));
    g.addColorStop(0.06, rgba(RGB.red, 0.55 * pulse));
    g.addColorStop(0.3, rgba(RGB.red, 0.13));
    g.addColorStop(1, rgba(RGB.red, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - PLAY_H * 0.24, y - PLAY_H * 0.24, PLAY_H * 0.48, PLAY_H * 0.48);
    ctx.strokeStyle = rgba(RGB.red, 0.12 + intensity * 0.16);
    lw(ctx, 2);
    for (let i = 0; i < 3; i++) {
      const sx = x - 72 - i * 66;
      const sy = y + 26 + Math.sin(S.time * 0.46 + i * 0.9) * 18;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 48, 20, -0.28 + Math.sin(S.time * 0.2 + i) * 0.08, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPortal(ctx, entry, alpha, glowPass) {
    if (entry.age < 0) return;
    const t = clamp(entry.age / entry.duration, 0, 1);
    const fade = entry.spawned ? clamp(1 - (entry.age - entry.duration) / 0.62, 0, 1) : 1;
    const pos = renderPos(entry, alpha);
    const color = STATS[entry.type].color;
    const bossScale = STATS[entry.type].boss ? 1.9 : 1;
    // `edge` entries used to return here and draw NO PORTAL AT ALL. That was
    // survivable in the wrapping build, where an edge entry materialises at the
    // rim of a field that IS the view. In the bounded arena it is not: 45 of the
    // 171 entries are `edge`, and 27 % of those materialise OUTSIDE the 1x frame
    // (worst measured 738 px out) because the ship drifts a median 198 px during
    // the 0.95 s entry. Under the zoom the pilot then watches ships appear out of
    // nothing in open space, which is the worst single surprise the wider view
    // exposes. So in the BOUNDED build `edge` now falls through to the petal
    // portal the `portal` kind already draws — RENDERER ONLY, no sim change, no
    // hash move.
    //
    // GUARDED ON BOUNDED, and that guard is not decoration. The --shots gate
    // samples 23 ticks and none of them happens to hold an `edge` entry mid-entry,
    // so an ungated version passes 46/46 BY LUCK while still moving pixels in the
    // shipped wrapping build at other ticks. ?bounded=0 is the owner's A/B
    // control and the same rule the backdrop removal was held to applies here:
    // with WORLD_BOUNDED off these pixels must not move. If the wrapping build
    // should gain the portal too, that is a separate call and an owner's to make.
    //
    // THREE OTHER EXPOSURES FOUND IN THE SAME SURVEY ARE DELIBERATELY NOT TOUCHED
    // HERE — the 86.4 px portal margin, the warden despawn box, and the
    // corner-clamped twin spawns. All three are SIM behaviour, all three move the
    // hash, and the warden one needs its own commit and its own re-capture.
    if (!BOUNDED && entry.kind === "edge") return;
    if (glowPass) {
      glow(ctx, pos.x, pos.y, (34 + Math.sin(t * Math.PI) * 18) * bossScale, color, 0.24 * fade);
      return;
    }
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(entry.spin);
    ctx.globalAlpha = fade;
    ctx.strokeStyle = cssFor(color);
    lw(ctx, 1.2);
    if (entry.kind === "depth") {
      const r = lerp(2, 31 * bossScale, easeOut(t));
      ctx.globalAlpha *= 0.8;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 1.5, 0); ctx.lineTo(r * 1.5, 0);
      ctx.moveTo(0, -r * 1.5); ctx.lineTo(0, r * 1.5);
      ctx.stroke();
    } else {
      const petals = 8;
      const r = 9 + Math.sin(t * Math.PI) * 22;
      for (let i = 0; i < petals; i++) {
        ctx.rotate(TAU / petals);
        ctx.beginPath();
        ctx.moveTo(r * 0.28, 0);
        ctx.quadraticCurveTo(r * 0.76, -r * 0.24, r, 0);
        ctx.quadraticCurveTo(r * 0.76, r * 0.24, r * 0.28, 0);
        ctx.stroke();
      }
      ctx.rotate(-entry.spin * 1.7);
      ctx.strokeStyle = C.ink;
      ctx.globalAlpha *= 0.55;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  // `mine` — THE ENTITY DRAW, AND IT IS THE BULLET DRAW VERBATIM.
  //
  // The promotion is a storage decision, and D10's own charter keeps the demo's
  // LOOK: "the look is half the ruling". R6 holds an architecture licence and
  // not a visual one, so a player must not be able to see that a mine stopped
  // being a round. The first attempt put the octagon inside drawEnemy's generic
  // frame and cross-vendor review enumerated what that cost — the entity's
  // hashed `angle` added to the time/id spin, a different fill and line width,
  // a 23.1-radius alpha-.12 glow where the round had 28.6 at .36, and the 7px
  // motion-trail stroke gone entirely.
  //
  // So this owns its whole frame instead, and every number below is read off
  // drawBullet's own branches for a round of r 11 (`b.r >= 9` is true for a
  // mine, which is what selects the heavier fill, the 2px line and the .36
  // glow). THE TRAIL LIVES IN THE GLOW PASS, which is why it looked absent:
  // drawBullet's flat pass explicitly skips the trail for a mine and its GLOW
  // pass strokes one at 7px for every round of r >= 9.
  //
  // THE COLOUR COMES FROM `STATS.mine`, and that is the registry's `present`
  // obligation doing its job rather than a convenience: the row declares what
  // draws this kind and what colour it is, and this is the consumer.
  //
  // The wrapped-copy radius is the BULLET's (max(24, r * 3)), not drawEnemy's
  // (max(34, r * 2.4)), because a mine at the seam must produce the same copies
  // it always did.
  function drawMine(ctx, e, alpha, glowPass, copyPass) {
    const p = renderPos(e, alpha);
    const color = STATS[e.type].color;
    if (!copyPass) {
      const offsets = wrappedRenderOffsets(p, Math.max(24, e.r * 3));
      for (let i = 0; i < offsets.length; i++) {
        ctx.save(); ctx.translate(offsets[i].x, offsets[i].y);
        drawMine(ctx, e, alpha, glowPass, true);
        ctx.restore();
      }
    }
    const prevX = p.x - delta(e.px, e.x, W) * 1.8;
    const prevY = p.y - delta(e.py, e.y, H) * 1.8;
    if (glowPass) {
      glow(ctx, p.x, p.y, Math.max(13, e.r * 2.6), color, 0.36);
      ctx.strokeStyle = rgba(rgbFor(color), 0.14);
      lw(ctx, 7);
      ctx.beginPath(); ctx.moveTo(prevX, prevY); ctx.lineTo(p.x, p.y); ctx.stroke();
      return;
    }
    ctx.strokeStyle = cssFor(color);
    ctx.fillStyle = "rgba(8,8,18,0.88)";
    lw(ctx, 2);
    // ...and NO motion-trail stroke on the flat pass: drawBullet skipped it for
    // a mine and only a mine, so the octagon sits still on a moving line.
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(S.time * 0.7 + e.id);
    polygon(ctx, 8, e.r, Math.PI / 8); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = e.armed > 0 ? rgba(RGB.gold, 0.35) : C.ink;
    lw(ctx, e.armed > 0 ? 1 : 1.7);
    ctx.beginPath(); ctx.arc(0, 0, e.r + 6 + Math.sin(S.time * 7 + e.id) * 2, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  function drawEnemy(ctx, e, alpha, glowPass, copyPass) {
    const pos = renderPos(e, alpha);
    const st = STATS[e.type];
    // BEFORE the generic frame, not inside it — see drawMine. Everything below
    // this line is the body treatment, and a mine is not a body to look at.
    if (e.type === "mine") { drawMine(ctx, e, alpha, glowPass, copyPass); return; }
    const scale = e.emerge > 0 ? 0.08 + easeOut(1 - e.emerge / e.emergeMax) * 0.92 : 1;
    const ang = lerpAngle(e.pangle, e.angle, alpha);
    if (!copyPass) {
      const offsets = wrappedRenderOffsets(pos, Math.max(34, st.r * (st.boss ? 4 : 2.4)));
      for (let i = 0; i < offsets.length; i++) {
        ctx.save(); ctx.translate(offsets[i].x, offsets[i].y);
        drawEnemy(ctx, e, alpha, glowPass, true);
        ctx.restore();
      }
    }
    if (e.type === "starEater") drawStarEaterSegments(ctx, e, pos, ang, lerp(e.pphase == null ? e.phase : e.pphase, e.phase, alpha), glowPass, scale);
    if (e.type === "cherub") drawSupportLink(ctx, e, pos, glowPass);
    if (e.type === "constructor") drawConstructorGrid(ctx, e, pos, glowPass);
    if (glowPass) {
      const active = e.state === "charge" || e.state === "telegraph" || e.state === "dash" || e.state === "open" ||
        e.state === "retaliate" || e.state === "orbCharge" || e.state === "lanceCharge" || e.state === "lasers" ||
        e.state === "beam" || e.state === "beamTell" || e.state === "lungeTell" || e.lance > 0;
      glow(ctx, pos.x, pos.y, (st.r * 2.1 + (active ? 12 : 0)) * scale, st.color, active ? 0.27 : 0.12);
      if (e.type === "hive") glow(ctx, pos.x, pos.y, 48 * scale, "violet", 0.12);
      if (st.boss) glow(ctx, pos.x, pos.y, st.r * 3.1 * scale, st.color, 0.16);
      if (!copyPass && e.type === "swarmling" && e.lance > 0) drawWrappedEffect(ctx, e, pos, drawLanceGlow);
      if (!copyPass && e.type === "stationOmega" && e.state === "lasers") drawWrappedEffect(ctx, e, pos, drawStationLasersGlow);
      if (!copyPass && e.type === "starEater" && (e.state === "beam" || e.state === "beamTell")) drawWrappedEffect(ctx, e, pos, drawStarBeamGlow);
      return;
    }
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(ang);
    ctx.scale(scale, scale);
    ctx.globalAlpha = e.emerge > 0 ? 0.42 + 0.58 * easeOut(1 - e.emerge / e.emergeMax) : 1;
    ctx.strokeStyle = e.hit > 0 ? C.ink : cssFor(st.color);
    ctx.fillStyle = "rgba(7,9,20,0.88)";
    lw(ctx, e.hit > 0 ? 2.2 : 1.45);
    if (e.type === "swarmling") pathSwarmling(ctx, e);
    else if (e.type === "warden") pathWarden(ctx, e);
    else if (e.type === "interceptor") pathInterceptor(ctx, e);
    else if (e.type === "hammerhead") pathHammerhead(ctx, e);
    else if (e.type === "hive") pathHive(ctx, e);
    else if (e.type === "drone") pathDrone(ctx, e);
    else if (e.type === "tracer") pathTracer(ctx, e);
    else if (e.type === "minelayer") pathMinelayer(ctx, e);
    else if (e.type === "myrmidon") pathMyrmidon(ctx, e);
    else if (e.type === "snapper") pathSnapper(ctx, e);
    else if (e.type === "bulwark") pathBulwark(ctx, e);
    else if (e.type === "cherub") pathCherub(ctx, e);
    else if (e.type === "constructor") pathConstructor(ctx, e);
    else if (e.type === "turret") pathTurret(ctx, e);
    else if (e.type === "vanguard") pathVanguard(ctx, e);
    else if (e.type === "pulsar") pathPulsar(ctx, e);
    else if (e.type === "omegaDefender") pathOmegaDefender(ctx, e);
    else if (e.type === "spitfire") pathSpitfire(ctx, e);
    else if (e.type === "stationOmega") pathStationOmega(ctx, e);
    else if (e.type === "starEater") pathStarEater(ctx, e);
    ctx.restore();
    if (!copyPass && e.emerge <= e.emergeMax * 0.25) {
      if (e.type === "swarmling" && e.lance > 0) drawWrappedEffect(ctx, e, pos, drawLance);
      if (e.type === "warden" && e.state === "charge") drawWrappedEffect(ctx, e, pos, drawWardenTelegraph);
      if (e.type === "hammerhead" && e.state === "telegraph") drawWrappedEffect(ctx, e, pos, drawHammerLane);
      if (e.type === "snapper" && e.state === "open") drawWrappedEffect(ctx, e, pos, drawSnapperLane);
      if (e.type === "bulwark" && e.state === "retaliate") drawWrappedEffect(ctx, e, pos, drawBulwarkCone);
      if (e.type === "spitfire" && (e.state === "orbCharge" || e.state === "lanceCharge")) drawWrappedEffect(ctx, e, pos, drawSpitfireTelegraph);
      if (e.type === "stationOmega" && e.state === "lasers") drawWrappedEffect(ctx, e, pos, drawStationLasers);
      if (e.type === "starEater" && (e.state === "beam" || e.state === "beamTell" || e.state === "lungeTell")) drawWrappedEffect(ctx, e, pos, drawStarTelegraph);
    }
    if (e.shield > 0 || e.shieldPulse > 0) drawEnemyShield(ctx, e, pos);
  }

  function drawStarEaterSegments(ctx, e, basePos, baseAngle, renderPhase, glowPass, scale) {
    const segments = starEaterSegments(e, basePos, baseAngle, renderPhase);
    for (let i = segments.length - 1; i >= 0; i--) {
      const s = segments[i];
      if (glowPass) {
        glow(ctx, s.x, s.y, 92 * scale, "red", 0.12 + (e.enraged ? 0.07 : 0));
        continue;
      }
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.scale(scale, scale);
      ctx.fillStyle = "rgba(12,5,13,0.9)";
      ctx.strokeStyle = e.enraged ? C.ink : C.red;
      lw(ctx, e.enraged ? 2.2 : 1.5);
      ctx.beginPath();
      ctx.ellipse(0, 0, 49 - i * 3, 31 - i * 2, 0, 0, TAU);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = rgba(RGB.red, 0.68);
      ctx.beginPath(); ctx.arc(-4, 0, 19, -1.2, 1.2); ctx.stroke();
      for (let n = -1; n <= 1; n += 2) {
        ctx.beginPath(); ctx.moveTo(8, n * 24); ctx.lineTo(-10, n * 34); ctx.lineTo(-21, n * 22); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // A beam or a cone may be longer than the field, so the wrapping build draws
  // it nine times and lets the view clip the eight it does not need. The bounded
  // build draws the one that is really there.
  function drawWrappedEffect(ctx, entity, pos, drawEffect) {
    if (BOUNDED) {
      drawEffect(ctx, entity, pos);
      return;
    }
    for (let ix = -1; ix <= 1; ix++) {
      for (let iy = -1; iy <= 1; iy++) {
        drawEffect(ctx, entity, { x: pos.x + ix * W, y: pos.y + iy * H });
      }
    }
  }

  function lerpAngle(a, b, t) { return a + angleDelta(a, b) * t; }

  function pathSwarmling(ctx, e) {
    const pulse = 1 + Math.sin(S.time * 8 + e.phase) * 0.08;
    ctx.scale(pulse, pulse);
    ctx.beginPath();
    ctx.moveTo(11, 0); ctx.lineTo(2, -5); ctx.lineTo(-7, -9); ctx.lineTo(-5, -2);
    ctx.lineTo(-10, 0); ctx.lineTo(-5, 2); ctx.lineTo(-7, 9); ctx.lineTo(2, 5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.globalAlpha *= 0.88;
    ctx.beginPath(); ctx.arc(2, 0, 2.2, 0, TAU); ctx.fill();
  }

  function pathWarden(ctx, e) {
    ctx.beginPath();
    ctx.moveTo(18, 0); ctx.lineTo(8, -10); ctx.lineTo(-6, -14); ctx.lineTo(-14, -7);
    ctx.lineTo(-10, 0); ctx.lineTo(-14, 7); ctx.lineTo(-6, 14); ctx.lineTo(8, 10); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, -10); ctx.lineTo(-1, 0); ctx.lineTo(-4, 10); ctx.stroke();
    const charge = e.state === "charge" ? 1 - e.timer / 1.12 : 0;
    ctx.fillStyle = charge > 0 ? rgba(RGB.red, 0.45 + charge * 0.55) : rgba(RGB.red, 0.45);
    ctx.beginPath(); ctx.arc(6, 0, 3 + charge * 2.5, 0, TAU); ctx.fill();
  }

  function pathInterceptor(ctx, e) {
    ctx.beginPath();
    ctx.moveTo(16, 0); ctx.lineTo(3, -5); ctx.lineTo(-7, -14); ctx.lineTo(-5, -4);
    ctx.lineTo(-14, 0); ctx.lineTo(-5, 4); ctx.lineTo(-7, 14); ctx.lineTo(3, 5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.magenta;
    ctx.beginPath(); ctx.arc(-5, -10, 1.7, 0, TAU); ctx.arc(-5, 10, 1.7, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(RGB.ink, 0.7);
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(9, 0); ctx.stroke();
  }

  function pathHammerhead(ctx, e) {
    ctx.beginPath();
    ctx.moveTo(18, -14); ctx.lineTo(18, 14); ctx.lineTo(9, 11); ctx.lineTo(3, 6);
    ctx.lineTo(-16, 6); ctx.lineTo(-10, 0); ctx.lineTo(-16, -6); ctx.lineTo(3, -6); ctx.lineTo(9, -11); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.ink;
    ctx.globalAlpha *= 0.75;
    ctx.beginPath(); ctx.moveTo(12, -10); ctx.lineTo(12, 10); ctx.stroke();
    if (e.state === "dash") {
      ctx.fillStyle = C.gold;
      ctx.beginPath(); ctx.moveTo(-15, -4); ctx.lineTo(-25, 0); ctx.lineTo(-15, 4); ctx.fill();
    }
  }

  function pathHive(ctx, e) {
    const pulse = 1 + Math.sin(S.time * 2.7 + e.phase) * 0.055;
    ctx.scale(pulse, pulse);
    polygon(ctx, 6, 25, Math.PI / 6);
    ctx.fill(); ctx.stroke();
    ctx.save();
    ctx.rotate(-e.angle * 1.9 + S.time * 0.32);
    ctx.strokeStyle = rgba(RGB.ink, 0.68);
    polygon(ctx, 6, 16, 0); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      ctx.rotate(TAU / 6);
      ctx.fillStyle = C.violet;
      ctx.beginPath(); ctx.arc(19, 0, 2, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = rgba(RGB.violet, 0.7);
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
  }

  function pathDrone(ctx) {
    ctx.beginPath();
    ctx.moveTo(8, 0); ctx.lineTo(-5, -6); ctx.lineTo(-2, 0); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  function pathTracer(ctx, e) {
    ctx.beginPath();
    ctx.moveTo(18, 0); ctx.lineTo(2, -5); ctx.lineTo(-8, -15); ctx.lineTo(-5, -4);
    ctx.lineTo(-16, 0); ctx.lineTo(-5, 4); ctx.lineTo(-8, 15); ctx.lineTo(2, 5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.green;
    ctx.beginPath(); ctx.moveTo(-9, -10); ctx.lineTo(3, -3); ctx.moveTo(-9, 10); ctx.lineTo(3, 3); ctx.stroke();
    ctx.fillStyle = e.state === "combo" ? C.ink : C.green;
    ctx.beginPath(); ctx.arc(6, 0, e.state === "combo" ? 3.4 : 2.2, 0, TAU); ctx.fill();
  }

  function pathMinelayer(ctx, e) {
    ctx.beginPath();
    ctx.moveTo(20, -11); ctx.lineTo(12, -17); ctx.lineTo(-13, -12); ctx.lineTo(-20, 0);
    ctx.lineTo(-13, 12); ctx.lineTo(12, 17); ctx.lineTo(20, 11); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.gold;
    lw(ctx, 2.2);
    ctx.beginPath(); ctx.arc(7, 0, 20, -0.82, 0.82); ctx.stroke();
    ctx.fillStyle = C.gold;
    ctx.beginPath(); ctx.arc(-12, -8, 2.3, 0, TAU); ctx.arc(-12, 8, 2.3, 0, TAU); ctx.fill();
  }

  function pathMyrmidon(ctx, e) {
    ctx.beginPath();
    ctx.moveTo(22, 0); ctx.lineTo(10, -13); ctx.lineTo(-5, -17); ctx.lineTo(-19, -8);
    ctx.lineTo(-14, 0); ctx.lineTo(-19, 8); ctx.lineTo(-5, 17); ctx.lineTo(10, 13); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.blue;
    ctx.beginPath(); ctx.arc(2, 0, 11, -1.1, 1.1); ctx.stroke();
    ctx.fillStyle = C.blue;
    ctx.beginPath(); ctx.arc(8, 0, 4, 0, TAU); ctx.fill();
  }

  function pathSnapper(ctx, e) {
    const open = e.state === "open" ? 7 + (1 - e.timer / 0.95) * 7 : e.state === "lunge" ? 2 : 5;
    ctx.beginPath();
    ctx.moveTo(22, -open); ctx.lineTo(5, -17); ctx.lineTo(-18, -10); ctx.lineTo(-10, 0);
    ctx.lineTo(-18, 10); ctx.lineTo(5, 17); ctx.lineTo(22, open);
    ctx.lineTo(8, 2); ctx.lineTo(8, -2); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.magenta;
    ctx.beginPath(); ctx.moveTo(20, -open); ctx.lineTo(4, -2); ctx.moveTo(20, open); ctx.lineTo(4, 2); ctx.stroke();
    if (e.vulnerable) {
      ctx.fillStyle = C.ink;
      ctx.beginPath(); ctx.arc(7, 0, 4.2 + Math.sin(S.time * 12) * 0.8, 0, TAU); ctx.fill();
    }
  }

  function pathBulwark(ctx, e) {
    ctx.beginPath();
    ctx.moveTo(23, -18); ctx.lineTo(6, -22); ctx.lineTo(-18, -13); ctx.lineTo(-24, 0);
    ctx.lineTo(-18, 13); ctx.lineTo(6, 22); ctx.lineTo(23, 18); ctx.lineTo(14, 0); ctx.closePath();
    ctx.fill(); ctx.stroke();
    const heat = clamp(e.shieldHeat / 24, 0, 1);
    ctx.strokeStyle = heat > 0.72 ? C.ink : heat > 0.34 ? C.orange : C.cyan;
    lw(ctx, 2.4 + heat * 2);
    ctx.beginPath(); ctx.arc(3, 0, 31, -0.96, 0.96); ctx.stroke();
    ctx.fillStyle = rgba(RGB.orange, 0.45 + heat * 0.45);
    ctx.beginPath(); ctx.arc(5, 0, 4 + heat * 2, 0, TAU); ctx.fill();
  }

  function pathCherub(ctx, e) {
    ctx.beginPath();
    ctx.moveTo(13, 0); ctx.lineTo(2, -7); ctx.lineTo(-8, -13); ctx.lineTo(-5, -4);
    ctx.lineTo(-13, 0); ctx.lineTo(-5, 4); ctx.lineTo(-8, 13); ctx.lineTo(2, 7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.green;
    ctx.beginPath(); ctx.arc(0, 0, 8 + Math.sin(S.time * 4 + e.phase), 0, TAU); ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.beginPath(); ctx.arc(1, 0, 2.5, 0, TAU); ctx.fill();
  }

  function pathConstructor(ctx, e) {
    polygon(ctx, 8, 22, Math.PI / 8); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.violet;
    ctx.beginPath(); ctx.arc(0, 0, 13, S.time * 0.4, S.time * 0.4 + Math.PI * 1.45); ctx.stroke();
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath(); ctx.moveTo(-2, i * 10); ctx.lineTo(14, i * 16); ctx.stroke();
    }
    ctx.fillStyle = C.violet;
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
  }

  function pathTurret(ctx, e) {
    polygon(ctx, 6, 9, Math.PI / 6); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.ink;
    lw(ctx, 2);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(15, 0); ctx.stroke();
    ctx.fillStyle = C.violet;
    ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, TAU); ctx.fill();
  }

  function pathVanguard(ctx, e) {
    ctx.beginPath();
    ctx.moveTo(22, 0); ctx.lineTo(4, -7); ctx.lineTo(-4, -20); ctx.lineTo(-8, -8);
    ctx.lineTo(-20, -4); ctx.lineTo(-10, 0); ctx.lineTo(-20, 4); ctx.lineTo(-8, 8);
    ctx.lineTo(-4, 20); ctx.lineTo(4, 7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.red;
    ctx.beginPath(); ctx.arc(-4, -15, 2, 0, TAU); ctx.arc(-4, 15, 2, 0, TAU); ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(14, 0); ctx.stroke();
  }

  function pathPulsar(ctx, e) {
    ctx.save(); ctx.rotate(S.time * 1.7 + e.phase);
    for (let i = 0; i < 5; i++) {
      ctx.rotate(TAU / 5);
      ctx.beginPath(); ctx.moveTo(3, -3); ctx.lineTo(12, 0); ctx.lineTo(3, 3); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = C.gold;
    ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, TAU); ctx.fill();
  }

  function pathOmegaDefender(ctx, e) {
    ctx.beginPath();
    ctx.moveTo(14, 0); ctx.lineTo(1, -9); ctx.lineTo(-11, -5); ctx.lineTo(-6, 0);
    ctx.lineTo(-11, 5); ctx.lineTo(1, 9); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.cyan;
    ctx.beginPath(); ctx.arc(0, 0, 6, -1.2, 1.2); ctx.stroke();
  }

  function pathSpitfire(ctx, e) {
    ctx.beginPath();
    ctx.moveTo(37, 0); ctx.lineTo(12, -9); ctx.lineTo(-5, -31); ctx.lineTo(-13, -13);
    ctx.lineTo(-34, -18); ctx.lineTo(-22, 0); ctx.lineTo(-34, 18); ctx.lineTo(-13, 13);
    ctx.lineTo(-5, 31); ctx.lineTo(12, 9); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.orange;
    lw(ctx, 2);
    ctx.beginPath(); ctx.moveTo(-8, -25); ctx.lineTo(15, -7); ctx.moveTo(-8, 25); ctx.lineTo(15, 7); ctx.stroke();
    const charge = e.state === "orbCharge" ? 1 - e.timer / 1.35 : e.state === "lanceCharge" ? 1 - e.timer / 1.4 : 0;
    ctx.fillStyle = charge > 0 ? C.ink : C.orange;
    ctx.beginPath(); ctx.arc(16, 0, 4 + charge * 5, 0, TAU); ctx.fill();
  }

  function pathStationOmega(ctx, e) {
    polygon(ctx, 10, 60, Math.PI / 10); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = rgba(RGB.cyan, 0.72);
    lw(ctx, 1.2);
    polygon(ctx, 5, 43, -Math.PI * 0.5); ctx.stroke();
    ctx.save();
    ctx.rotate(-e.angle * 1.35 + S.time * 0.17);
    polygon(ctx, 10, 27, 0); ctx.stroke();
    ctx.restore();
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5;
      const alive = i >= (e.brokenNodes || 0);
      ctx.fillStyle = alive ? (e.weakPulse > 0 ? C.ink : C.cyan) : rgba(RGB.cyan, 0.12);
      ctx.beginPath(); ctx.arc(Math.cos(a) * 31, Math.sin(a) * 31, alive ? 5.2 : 3.2, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = C.ink;
    ctx.beginPath(); ctx.arc(0, 0, 8 + Math.sin(S.time * 3) * 1.2, 0, TAU); ctx.fill();
  }

  function pathStarEater(ctx, e) {
    const jaw = e.state === "beamTell" || e.state === "beam" || e.state === "burst" ? 18 : 11;
    ctx.beginPath();
    ctx.moveTo(66, -jaw); ctx.lineTo(34, -38); ctx.lineTo(-6, -47); ctx.lineTo(-45, -28);
    ctx.lineTo(-61, 0); ctx.lineTo(-45, 28); ctx.lineTo(-6, 47); ctx.lineTo(34, 38); ctx.lineTo(66, jaw);
    ctx.lineTo(29, 5); ctx.lineTo(29, -5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = e.enraged ? C.ink : C.red;
    lw(ctx, e.enraged ? 2.5 : 1.7);
    ctx.beginPath(); ctx.moveTo(63, -jaw); ctx.lineTo(24, -5); ctx.moveTo(63, jaw); ctx.lineTo(24, 5); ctx.stroke();
    ctx.fillStyle = e.enraged ? C.ink : C.red;
    ctx.beginPath(); ctx.arc(24, 0, 7 + Math.sin(S.time * 5) * 1.5, 0, TAU); ctx.fill();
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath(); ctx.moveTo(-18, i * 35); ctx.lineTo(-35, i * 53); ctx.lineTo(-43, i * 30); ctx.stroke();
    }
  }

  function drawSupportLink(ctx, e, pos, glowPass) {
    const target = findEnemy(e.supportTarget);
    if (!target) return;
    const tx = pos.x + delta(e.x, target.x, W);
    const ty = pos.y + delta(e.y, target.y, H);
    ctx.save();
    ctx.strokeStyle = rgba(RGB.green, glowPass ? 0.12 : 0.36);
    lw(ctx, glowPass ? 8 : 1);
    ctx.setLineDash(glowPass ? [] : [4, 7]);
    ctx.lineDashOffset = -S.time * 18;
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  }

  function drawConstructorGrid(ctx, e, pos, glowPass) {
    const children = [];
    for (let i = 0; i < S.enemies.length; i++) if (!S.enemies[i].dead && S.enemies[i].parent === e.id && S.enemies[i].type === "turret") children.push(S.enemies[i]);
    if (!children.length) return;
    ctx.save();
    ctx.strokeStyle = rgba(RGB.violet, glowPass ? 0.12 : 0.3);
    lw(ctx, glowPass ? 7 : 1);
    for (let i = 0; i < children.length; i++) {
      const tx = pos.x + delta(e.x, children[i].x, W);
      const ty = pos.y + delta(e.y, children[i].y, H);
      ctx.beginPath(); ctx.moveTo(pos.x, pos.y); ctx.lineTo(tx, ty); ctx.stroke();
    }
    ctx.restore();
  }

  function drawEnemyShield(ctx, e, pos) {
    ctx.save();
    ctx.strokeStyle = rgba(rgbFor(STATS[e.type].color), 0.25 + Math.min(0.35, e.shield * 0.04));
    lw(ctx, e.shieldPulse > 0 ? 2.2 : 1);
    ctx.beginPath(); ctx.arc(pos.x, pos.y, e.r + 7 + Math.sin(S.time * 5 + e.id) * 1.5, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  function polygon(ctx, sides, radius, offset) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = offset + i * TAU / sides;
      const x = Math.cos(a) * radius;
      const y = Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function drawLance(ctx, e, pos) {
    const elapsed = 0.44 - e.lance;
    const hot = elapsed > 0.21 && elapsed < 0.35;
    const opacity = hot ? 0.92 : elapsed < 0.21 ? 0.16 + elapsed / 0.21 * 0.28 : clamp(e.lance / 0.09, 0, 1);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(e.lanceAngle);
    ctx.strokeStyle = hot ? C.ink : C.cyan;
    ctx.globalAlpha = opacity;
    lw(ctx, hot ? 2.4 : 0.8);
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(hot ? 132 : 116, 0); ctx.stroke();
    if (hot) {
      ctx.strokeStyle = C.cyan;
      lw(ctx, 0.7);
      ctx.beginPath(); ctx.moveTo(15, -3); ctx.lineTo(126, -1); ctx.moveTo(15, 3); ctx.lineTo(126, 1); ctx.stroke();
    }
    ctx.restore();
  }

  function drawLanceGlow(ctx, e, pos) {
    const elapsed = 0.44 - e.lance;
    if (elapsed < 0.18 || elapsed > 0.38) return;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(e.lanceAngle);
    const g = ctx.createLinearGradient(8, 0, 132, 0);
    g.addColorStop(0, rgba(RGB.cyan, 0.05));
    g.addColorStop(0.65, rgba(RGB.cyan, 0.24));
    g.addColorStop(1, rgba(RGB.cyan, 0));
    ctx.strokeStyle = g;
    lw(ctx, 9);
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(132, 0); ctx.stroke();
    ctx.restore();
  }

  function drawWardenTelegraph(ctx, e, pos) {
    const charge = clamp(1 - e.timer / 1.12, 0, 1);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(e.chargeAngle);
    ctx.globalAlpha = 0.18 + charge * 0.46;
    ctx.strokeStyle = C.red;
    ctx.setLineDash([3, 8]);
    ctx.lineDashOffset = -S.time * 25;
    lw(ctx, 0.9);
    ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(210, 0); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawHammerLane(ctx, e, pos) {
    const charge = clamp(1 - e.timer / 0.92, 0, 1);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(e.dashAngle);
    ctx.globalAlpha = 0.22 + charge * 0.52;
    ctx.strokeStyle = charge > 0.72 ? C.gold : C.orange;
    lw(ctx, 1);
    ctx.setLineDash([18, 11]);
    ctx.lineDashOffset = -S.time * 55;
    ctx.beginPath();
    ctx.moveTo(20, -9); ctx.lineTo(Math.min(460, Math.max(PLAY_W, PLAY_H) * 0.48), -9);
    ctx.moveTo(20, 9); ctx.lineTo(Math.min(460, Math.max(PLAY_W, PLAY_H) * 0.48), 9);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawSnapperLane(ctx, e, pos) {
    const charge = clamp(1 - e.timer / 0.95, 0, 1);
    ctx.save(); ctx.translate(pos.x, pos.y); ctx.rotate(e.dashAngle);
    ctx.globalAlpha = 0.18 + charge * 0.5;
    ctx.strokeStyle = charge > 0.72 ? C.ink : C.magenta;
    lw(ctx, 1);
    ctx.setLineDash([9, 12]); ctx.lineDashOffset = -S.time * 40;
    ctx.beginPath();
    ctx.moveTo(22, -12); ctx.lineTo(430, -12);
    ctx.moveTo(22, 12); ctx.lineTo(430, 12); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  }

  function drawBulwarkCone(ctx, e, pos) {
    const charge = clamp(1 - e.timer / 0.82, 0, 1);
    const heat = clamp(e.shieldHeat / 24, 0.15, 1);
    ctx.save(); ctx.translate(pos.x, pos.y); ctx.rotate(e.angle);
    ctx.globalAlpha = 0.18 + charge * 0.48;
    ctx.strokeStyle = heat > 0.72 ? C.ink : C.orange;
    ctx.fillStyle = rgba(RGB.orange, 0.025 + charge * 0.04);
    ctx.beginPath(); ctx.moveTo(24, 0); ctx.arc(0, 0, 260, -0.62, 0.62); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawSpitfireTelegraph(ctx, e, pos) {
    ctx.save(); ctx.translate(pos.x, pos.y);
    if (e.state === "orbCharge") {
      const charge = clamp(1 - e.timer / 1.35, 0, 1);
      const x = Math.cos(e.chargeAngle) * 46;
      const y = Math.sin(e.chargeAngle) * 46;
      ctx.strokeStyle = rgba(RGB.orange, 0.3 + charge * 0.55);
      lw(ctx, 1 + charge * 1.5);
      ctx.beginPath(); ctx.arc(x, y, 7 + charge * 13, S.time * 2, S.time * 2 + Math.PI * 1.6); ctx.stroke();
    } else {
      const charge = clamp(1 - e.timer / 1.4, 0, 1);
      ctx.rotate(e.chargeAngle);
      ctx.strokeStyle = charge > 0.72 ? C.ink : C.gold;
      ctx.globalAlpha = 0.22 + charge * 0.55;
      ctx.setLineDash([22, 12]); ctx.lineDashOffset = -S.time * 65;
      lw(ctx, 1.2);
      ctx.beginPath(); ctx.moveTo(38, -7); ctx.lineTo(680, -7); ctx.moveTo(38, 7); ctx.lineTo(680, 7); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawStationLasers(ctx, e, pos) {
    const length = Math.max(PLAY_W, PLAY_H) * 1.15;
    ctx.save(); ctx.translate(pos.x, pos.y); ctx.rotate(e.angle);
    ctx.strokeStyle = C.ink;
    ctx.globalAlpha = 0.8;
    lw(ctx, 2.4);
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(length, 0); ctx.stroke();
    ctx.strokeStyle = C.cyan;
    lw(ctx, 1);
    for (let i = 0; i < 5; i++) {
      ctx.save(); ctx.rotate(i * TAU / 5);
      ctx.beginPath(); ctx.moveTo(31, 0); ctx.lineTo(length * 0.68, 0); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }

  function drawStationLasersGlow(ctx, e, pos) {
    const length = Math.max(PLAY_W, PLAY_H) * 1.15;
    ctx.save(); ctx.translate(pos.x, pos.y); ctx.rotate(e.angle);
    ctx.strokeStyle = rgba(RGB.cyan, 0.18); lw(ctx, 18);
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(length, 0); ctx.stroke();
    lw(ctx, 10);
    for (let i = 0; i < 5; i++) {
      ctx.save(); ctx.rotate(i * TAU / 5);
      ctx.beginPath(); ctx.moveTo(31, 0); ctx.lineTo(length * 0.68, 0); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }

  function drawStarTelegraph(ctx, e, pos) {
    ctx.save(); ctx.translate(pos.x, pos.y); ctx.rotate(e.dashAngle || e.angle);
    const active = e.state === "beam";
    const lunge = e.state === "lungeTell";
    ctx.globalAlpha = active ? 0.92 : 0.28 + Math.sin(S.time * 10) * 0.08;
    ctx.strokeStyle = active ? C.ink : C.red;
    lw(ctx, active ? 5 : 1.2);
    if (lunge) {
      ctx.setLineDash([24, 15]); ctx.lineDashOffset = -S.time * 70;
      ctx.beginPath(); ctx.moveTo(58, -31); ctx.lineTo(Math.max(PLAY_W, PLAY_H), -31); ctx.moveTo(58, 31); ctx.lineTo(Math.max(PLAY_W, PLAY_H), 31); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.beginPath(); ctx.moveTo(54, 0); ctx.lineTo(Math.max(PLAY_W, PLAY_H) * 1.2, 0); ctx.stroke();
      if (active) {
        ctx.strokeStyle = C.red; lw(ctx, 1.2);
        ctx.beginPath(); ctx.moveTo(54, -12); ctx.lineTo(Math.max(PLAY_W, PLAY_H), -4); ctx.moveTo(54, 12); ctx.lineTo(Math.max(PLAY_W, PLAY_H), 4); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawStarBeamGlow(ctx, e, pos) {
    ctx.save(); ctx.translate(pos.x, pos.y); ctx.rotate(e.dashAngle || e.angle);
    const active = e.state === "beam";
    ctx.strokeStyle = rgba(RGB.red, active ? 0.25 : 0.09);
    lw(ctx, active ? 34 : 13);
    ctx.beginPath(); ctx.moveTo(48, 0); ctx.lineTo(Math.max(PLAY_W, PLAY_H) * 1.2, 0); ctx.stroke();
    ctx.restore();
  }

  function drawBullet(ctx, b, alpha, glowPass, copyPass) {
    const p = renderPos(b, alpha);
    if (!copyPass) {
      const offsets = wrappedRenderOffsets(p, Math.max(24, b.r * 3));
      for (let i = 0; i < offsets.length; i++) {
        ctx.save(); ctx.translate(offsets[i].x, offsets[i].y);
        drawBullet(ctx, b, alpha, glowPass, true);
        ctx.restore();
      }
    }
    const prevX = p.x - delta(b.px, b.x, W) * 1.8;
    const prevY = p.y - delta(b.py, b.y, H) * 1.8;
    if (glowPass) {
      const radius = b.team === "player" ? 10 : Math.max(13, b.r * 2.6);
      glow(ctx, p.x, p.y, radius, b.color, b.r >= 9 ? 0.36 : 0.22);
      ctx.strokeStyle = rgba(rgbFor(b.color), b.team === "player" ? 0.22 : 0.14);
      lw(ctx, b.kind === "kineticLance" ? 13 : b.r >= 9 ? 7 : 3);
      ctx.beginPath(); ctx.moveTo(prevX, prevY); ctx.lineTo(p.x, p.y); ctx.stroke();
      return;
    }
    ctx.strokeStyle = cssFor(b.color);
    ctx.fillStyle = b.r >= 9 ? "rgba(8,8,18,0.88)" : cssFor(b.color);
    lw(ctx, b.r >= 9 ? 2 : 1.25);
    if (b.kind !== "mine") { ctx.beginPath(); ctx.moveTo(prevX, prevY); ctx.lineTo(p.x, p.y); ctx.stroke(); }
    if (b.kind === "heavy") {
      ctx.beginPath(); ctx.arc(p.x, p.y, b.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = C.ink; lw(ctx, 1); ctx.stroke();
      ctx.strokeStyle = C.red; ctx.beginPath(); ctx.arc(p.x, p.y, b.r + 4, S.time, S.time + Math.PI * 1.3); ctx.stroke();
    } else if (b.kind === "mine") {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(S.time * 0.7 + b.id);
      polygon(ctx, 8, b.r, Math.PI / 8); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = b.armed > 0 ? rgba(RGB.gold, 0.35) : C.ink;
      lw(ctx, b.armed > 0 ? 1 : 1.7);
      ctx.beginPath(); ctx.arc(0, 0, b.r + 6 + Math.sin(S.time * 7 + b.id) * 2, 0, TAU); ctx.stroke();
      ctx.restore();
    } else if (b.kind === "plasma" || b.kind === "spitOrb" || b.kind === "omegaSphere" || b.kind === "splitter" || b.kind === "vortex") {
      ctx.beginPath(); ctx.arc(p.x, p.y, b.r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = C.ink; lw(ctx, 1);
      ctx.beginPath(); ctx.arc(p.x, p.y, b.r * 0.52, -S.time * 2 + b.id, -S.time * 2 + b.id + Math.PI * 1.35); ctx.stroke();
      ctx.strokeStyle = cssFor(b.color);
      ctx.beginPath(); ctx.arc(p.x, p.y, b.r + 4, S.time * 1.6, S.time * 1.6 + Math.PI); ctx.stroke();
    } else if (b.kind === "kineticLance" || b.kind === "rocket") {
      const a = Math.atan2(b.vy, b.vx);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
      ctx.fillStyle = b.kind === "kineticLance" ? C.ink : cssFor(b.color);
      ctx.beginPath(); ctx.moveTo(b.r * 1.6, 0); ctx.lineTo(-b.r, -b.r * 0.48); ctx.lineTo(-b.r * 0.5, 0); ctx.lineTo(-b.r, b.r * 0.48); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    } else if (b.kind === "asteroid") {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(S.time * 0.8 + b.id);
      polygon(ctx, 7, b.r, b.id * 0.17); ctx.fill(); ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = cssFor(b.color);
      ctx.beginPath(); ctx.arc(p.x, p.y, b.r, 0, TAU); ctx.fill();
    }
  }

  function drawPlayer(ctx, alpha, glowPass, copyPass) {
    const p = S.player;
    const pos = renderPos(p, alpha);
    const angle = lerpAngle(p.pangle, p.angle, alpha);
    if (!p.alive) return;
    if (!copyPass) {
      const offsets = wrappedRenderOffsets(pos, 34);
      for (let i = 0; i < offsets.length; i++) {
        ctx.save(); ctx.translate(offsets[i].x, offsets[i].y);
        drawPlayer(ctx, alpha, glowPass, true);
        ctx.restore();
      }
    }
    if (glowPass) {
      glow(ctx, pos.x, pos.y, 29, p.flash > 0 ? "red" : "cyan", p.flash > 0 ? 0.32 : 0.16);
      const bx = pos.x - Math.cos(p.thrustAngle) * 11;
      const by = pos.y - Math.sin(p.thrustAngle) * 11;
      glow(ctx, bx, by, 19, "cyan", 0.2);
      return;
    }
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);
    if (p.invuln > 0 && Math.floor(S.time * 18) % 2) ctx.globalAlpha = 0.5;
    ctx.fillStyle = "rgba(9,12,25,0.92)";
    ctx.strokeStyle = p.flash > 0 ? C.red : C.ink;
    lw(ctx, 1.65);
    ctx.beginPath();
    ctx.moveTo(17, 0); ctx.lineTo(-8, -9); ctx.lineTo(-3, -3); ctx.lineTo(-13, 0);
    ctx.lineTo(-3, 3); ctx.lineTo(-8, 9); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.cyan;
    lw(ctx, 1);
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-4, -4); ctx.moveTo(7, 0); ctx.lineTo(-4, 4); ctx.stroke();
    ctx.fillStyle = C.cyan;
    ctx.beginPath(); ctx.arc(2, 0, 1.9, 0, TAU); ctx.fill();
    ctx.restore();
    if (p.invuln > 0) {
      ctx.save();
      ctx.strokeStyle = rgba(RGB.cyan, 0.18 + 0.2 * (Math.sin(S.time * 9) * 0.5 + 0.5));
      lw(ctx, 1);
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 16 + Math.sin(S.time * 6) * 1.5, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }

  function drawParticles(ctx, alpha, glowPass) {
    for (let i = 0; i < S.particles.length; i++) {
      const p = S.particles[i];
      const at = renderPos(p, alpha);
      const t = clamp(p.life / p.max, 0, 1);
      if (glowPass) {
        if (p.kind === "trail" || p.r > 1.5) glow(ctx, at.x, at.y, p.r * (p.kind === "trail" ? 5 : 3.5), p.color, t * 0.12);
      } else {
        ctx.globalAlpha = t;
        ctx.fillStyle = cssFor(p.color);
        if (p.kind === "chip") {
          ctx.save(); ctx.translate(at.x, at.y); ctx.rotate(p.spin);
          ctx.fillRect(-p.r * 1.5, -0.45, p.r * 3, 0.9); ctx.restore();
        } else {
          ctx.beginPath(); ctx.arc(at.x, at.y, p.r * (0.35 + t * 0.65), 0, TAU); ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawFragments(ctx, alpha) {
    for (let i = 0; i < S.fragments.length; i++) {
      const f = S.fragments[i];
      const at = renderPos(f, alpha);
      ctx.save();
      ctx.translate(at.x, at.y); ctx.rotate(f.angle);
      ctx.globalAlpha = clamp(f.life / 0.7, 0, 1);
      ctx.strokeStyle = cssFor(f.color); lw(ctx, 1);
      ctx.beginPath(); ctx.moveTo(-f.size, -f.size * 0.3); ctx.lineTo(f.size, 0); ctx.lineTo(-f.size * 0.4, f.size * 0.65); ctx.stroke();
      ctx.restore();
    }
  }

  function drawOrbs(ctx, alpha, glowPass) {
    for (let i = 0; i < S.orbs.length; i++) {
      const o = S.orbs[i];
      const at = renderPos(o, alpha);
      const pulse = 1 + Math.sin(o.phase) * 0.18;
      if (glowPass) glow(ctx, at.x, at.y, 16 * pulse, "gold", 0.2);
      else {
        ctx.save(); ctx.translate(at.x, at.y); ctx.rotate(o.phase * 0.32);
        ctx.strokeStyle = C.gold; ctx.fillStyle = rgba(RGB.gold, 0.2); lw(ctx, 1);
        polygon(ctx, 4, 4.5 * pulse, Math.PI / 4); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }
  }

  function drawShockwaves(ctx, glowPass) {
    for (let i = 0; i < S.shockwaves.length; i++) {
      const s = S.shockwaves[i];
      const t = 1 - s.life / s.max;
      const radius = lerp(s.r, s.end, easeOut(t));
      const alpha = (1 - t) * (glowPass ? 0.12 : 0.55);
      ctx.strokeStyle = rgba(rgbFor(s.color), alpha);
      lw(ctx, glowPass ? 7 : Math.max(0.6, 2.2 * (1 - t)));
      if (BOUNDED) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, radius, 0, TAU);
        ctx.stroke();
      } else {
        // A ring wider than the field shows on the far side too
        for (let ix = -1; ix <= 1; ix++) {
          for (let iy = -1; iy <= 1; iy++) {
            ctx.beginPath();
            ctx.arc(s.x + ix * W, s.y + iy * H, radius, 0, TAU);
            ctx.stroke();
          }
        }
      }
    }
  }

  function render(ctxs, alpha, reducedMotion = false) {
    wx = ctxs.world;
    lx = ctxs.light;
    if (BOUNDED) updateCamera(alpha); // before the first draw — the background reads it too
    drawBackground();
    lx.setTransform(DPR, 0, 0, DPR, 0, 0);
    lx.clearRect(0, 0, canvasW(lx), canvasH(lx));
    const shakeX = !reducedMotion && S.shake > 0.05 ? Math.sin(S.time * 91.7) * S.shake : 0;
    const shakeY = !reducedMotion && S.shake > 0.05 ? Math.sin(S.time * 77.3 + 1.2) * S.shake : 0;
    lastShakeX = shakeX;  // the test seam's only reader — see __test.shipScreen()
    lastShakeY = shakeY;
    beginCanvas(wx, shakeX, shakeY);
    beginCanvas(lx, shakeX, shakeY);
    lx.globalCompositeOperation = "lighter";

    for (let i = 0; i < S.entries.length; i++) {
      drawPortal(wx, S.entries[i], alpha, false);
      drawPortal(lx, S.entries[i], alpha, true);
    }
    drawShockwaves(wx, false);
    drawShockwaves(lx, true);
    drawOrbs(wx, alpha, false);
    drawOrbs(lx, alpha, true);
    for (let i = 0; i < S.bullets.length; i++) {
      drawBullet(wx, S.bullets[i], alpha, false);
      drawBullet(lx, S.bullets[i], alpha, true);
    }
    for (let i = 0; i < S.enemies.length; i++) {
      drawEnemy(wx, S.enemies[i], alpha, false);
      drawEnemy(lx, S.enemies[i], alpha, true);
    }
    drawFragments(wx, alpha);
    drawParticles(wx, alpha, false);
    drawParticles(lx, alpha, true);
    drawPlayer(wx, alpha, false);
    drawPlayer(lx, alpha, true);
    lx.globalCompositeOperation = "source-over";
    wx.globalAlpha = 1;
    lx.globalAlpha = 1;
  }

  window.DemoRender = {
    setKernel: setKernel,
    render: render,
    getCamOrigin: getCamOrigin,
    // Kept EXPORTED AND UNCHANGED for compatibility. New callers want
    // stageToWorld(): a raw origin is only half a conversion since the zoom.
    stageToWorld: stageToWorld,
    setCursorStage: setCursorStage,
    setCamDials: setCamDials,
    getCamDials: getCamDials,
    // A TEST SEAM, the kernel's __test idiom (js/demo-kernel.js). The camera's
    // interesting functions are internal and no gate could reach them, which is
    // how the on-hull aim-lead escape lived: a discontinuity from 0 px to the
    // full ceiling across a millionth of a pixel, invisible to every suite.
    // Nothing in the shipped page reads this object.
    //
    // IT DOES NOT LIVE INSIDE THE BLOCK PORT-S DELETES, and the line that said
    // so was wrong. That block is the lookahead, and this export is at the tail
    // of the file, outside it. Half of what it publishes (zoomFor, camScale,
    // setCam, shipScreen) is not lookahead code at all. So PORT-S must remove or
    // REWIRE this seam explicitly, by name — and the debt note records it, since
    // a comment on a block that gets deleted cannot carry a debt past its own
    // deletion. See .ai-reference/prompts/port-w-20260824/PORT-S-DEBT.md.
    __test: {
      cursorOffset: cursorOffset,
      leadVec: leadVec,
      // The star sheet's integrated screen offset, so the sheet-yank measurement
      // reads the number the star pass actually uses instead of re-deriving it
      // and proving its own arithmetic. Multiply by a layer's depth to get that
      // layer's screen anchor.
      starPan: function () { return { x: starPanX, y: starPanY }; },
      // The whole camera step, so a gate can assert the RULE against the camera
      // that actually ships rather than against a re-spelling of leadVec(). It
      // needs no canvas: it reads the presented pose, the dials and the clock,
      // and writes camX/camY. Advance S.time between calls to give it a dt.
      updateCamera: updateCamera,
      zoomFor: zoomFor,
      camScale: camScale,
      setCam: function (x, y, wide) { camX = x; camY = y; if (Number.isFinite(wide)) camWide = wide; },
      // The ship's position in the PANE, BEFORE the screen-space shake — from
      // the same presented pose the leash clamped against, so a margin
      // measurement asks the question the leash actually answers. Null before
      // the first camera step.
      //
      // "ON THE GLASS" WAS THE WRONG WORDS and they mattered: beginCanvas()
      // translates by the shake AFTER this frame of reference, and the shake
      // reaches 13 px at S.shake 9. So x, y is where the leash put the ship and
      // NOT where a photograph of the monitor would find it. Both are wanted,
      // and neither may be quietly substituted for the other, so the shake this
      // frame actually used is handed back beside them: the buffer numbers stay
      // the leash's, and a caller that wants the photographed point adds shakeX
      // and shakeY itself, deliberately.
      shipScreen: function () {
        if (!camPose) return null;
        const z = camScale();
        return { x: z * (camPose.x - camX), y: z * (camPose.y - camY), z: z,
                 shakeX: lastShakeX, shakeY: lastShakeY };
      }
    }
  };
})();

