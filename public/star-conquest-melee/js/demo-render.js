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
  // production's FRAME.cam contract (js/game.js:4356). The BASE ORDERING below
  // is production's too — lead into the ease target, then the leash, then the
  // world clamp — and the file no longer diverges from it in kind. THE SCALE IS
  // GONE (camWide, zoomFor, camScale and every / z that followed from them,
  // deleted on the owner's ruling), and THE CURSOR PULL IS NO LONGER A
  // DIVERGENCE EITHER: D11 gave js/game.js the same rule. What is left that a
  // reader should not go looking for in js/game.js is the two RE-EXPRESSIONS
  // named at the lookahead block — the seconds clock and the px/s velocity.
  // With WORLD_BOUNDED off the camera stays
  // pinned at the origin and no draw pass translates, so the wrapping build's
  // pixels do not move.
  const CAM_EASE_HZ = 60;   // the tick rate that constant was tuned at
  const CAM_DT_MAX = 0.1;   // a slept tab hands back one huge frame; the ease ignores the excess
  // The EIGHT the lab exposes, in two kinds — the count and the kinds both
  // matter, because a reader who takes the whole set for "production's numbers,
  // retuned" mis-reads three of the rows entirely:
  //   5 PRODUCTION-EQUAL, all five since D11 — ease 0.05 and camLead 30, which
  //     production shipped as 0.08 and 25 until the owner's feel gate of
  //     2026-08-24 moved both and 2026-08-27 (D52) halved camLead to 30 and
  //     took leadDz to 0; edgeMargin 60, which never moved;
  //     and cursorPull 1.0, which was the largest item on the PORT-S debt and
  //     which production expresses now;
  //   3 SEAT-SELECTED, and not camera numbers at all — starLit, starSize and
  //     streak, which belong to the star pass and ride this panel only because
  //     this panel is where the owner is flying.
  // THE COUNT WAS THIRTEEN AND THE MISSING FIVE ARE THE ZOOM: zoomWide, zoomRef,
  // zoomDead, zoomEase and zoomLW, deleted on the owner's own ruling — see the
  // block where they used to sit, below.
  // Production's own number stays cited on every row that has one, because both
  // are load-bearing: production's is what a reader would otherwise take this
  // file to have invented, the lab final is what the owner asked to fly.
  //
  // AND SINCE D11, PRODUCTION IS THE AUTHORITY FOR THE FIVE THAT HAVE ONE.
  // js/game.js holds the owner's ease, camLead, cursorPull, edgeMargin and leadDz
  // as its shipped defaults, with a `cursor pull` row on the pause screen, and
  // that is the build he flies at the feel gate. THESE FIVE ROWS ARE A DUPLICATE
  // WITH A DEATH DATE — S3b, per the ruling at the head of the lookahead block —
  // so if the two files ever disagree about one of them, production is right and
  // this file is stale. Change production first, always.
  // They are presentation-plane state: the kernel never reads one, and nothing
  // persists them, so a reload is these numbers again.
  const CAM_DIAL_DEFAULTS = {
    // THE FOUR ANCHORS BELOW ARE PORT-L's. They read :1699/:1702/:1707/:1712/:1713
    // until then, which were pre-PORT-S line numbers and had been wrong for
    // several rounds. Line numbers drift; the NAMES do not, so grep the name.
    ease: 0.05,             // owner 2026-08-24; production js/game.js:1961 CAMEASE — the same 0.05 since D11, over the 0.08 it shipped
    edgeMargin: 60,         // js/game.js:1975 EDGEMARGIN — min px between ship and view edge (owner: unchanged)
    camLead: 30,            // owner 2026-08-27 (D52); production js/game.js:1964 CAMLEAD — it was 60 from D11 until the owner flew the wider rail
    // THE OWNER'S OWN RULE, 2026-08-24 — and production's too since D11, where
    // it is CURSORPULL at js/game.js:1707. 1.0 is his
    // Blend 0.5 — the camera exactly halfway between the cursor and the ship
    // PLUS ITS VELOCITY LEAD. The plain ship-to-cursor midpoint holds only at
    // rest: at vx 245 with camLead 30 the centre sits 122.5 px past it, because
    // the velocity half is added before the pull, not blended against it. The
    // browser proof that measured 0.0 px error was run ship-at-rest, so it
    // proves the rest case and not the general one. (Codex vendor-cross, 03R.)
    // The whole derivation is at cursorOffset() and leadVec(); read it before
    // changing this number or its meaning.
    cursorPull: 1.0,        // js/game.js:1969 CURSORPULL
    leadDz: 0,              // js/game.js:1974 LEADDZ — ms a conflicting lead must persist
                            // to commit. 0 is GATE OFF, the owner's D52 choice; it was 200
    // ---- THE ZOOM IS GONE, and the five rows that were here went with it
    // (zoomWide / zoomRef / zoomDead / zoomEase, and zoomLW below them). The
    // owner ruled it out at the 2026-08-24 gate — "zoom / widen is something we
    // can play with but we dont need at all and i never asked for" — so hop 3R
    // put zoomWide to 1.0, the byte-exact OFF, and PORT-S-DEBT.md carried the
    // rows as DROPPABLE rather than as work to port, under a clause with a
    // condition on it: if ZoomMax is still at 1.0 after his next fly, the zoom is
    // DELETED rather than ported. HE FLEW IT (feel gate, 2026-08-25) and never
    // touched the dial, so the condition is satisfied and this is the deletion.
    // The camera has no scale term again, which is also what production's has
    // always had — nothing here to port and nothing there to receive it.
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
    // The star streak, and it SHIPS INERT. 0 draws the field exactly as 03R-C
    // left it, down to the canvas calls; the owner turns it on. That is what
    // keeps 03R-C (the star size) and 03R-D (the sheet placement) judgeable on
    // their own at the same fly. Also not a camera number.
    streak: 0
  };
  // ---- THE FIVE CAMERA DIALS LEFT THIS FILE (S3b lane 1, commit F) --------
  // PORT-S-DEBT.md obligation 3b: the eight rows of this panel are TWO SYSTEMS.
  // Five are the CAMERA's — ease, edgeMargin, camLead, cursorPull, leadDz — and
  // they moved to js/encounter-host.js with the rule that reads them. Three are
  // the STAR PASS's — starLit, starSize, streak — and the star pass does not
  // move to production at all, so they stay right here. The literals above are
  // kept as the DOCUMENTED SOURCE of the owner's numbers and as the defaults the
  // panel restores from; the host holds the live five, and setCamDials/
  // getCamDials below ROUTE each row to its own system. A wholesale move
  // misroutes the star three; a wholesale retirement takes the owner's panel.
  let STARLIT = CAM_DIAL_DEFAULTS.starLit;
  let STARSIZE = CAM_DIAL_DEFAULTS.starSize;
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
  // ---- THE SUPPLIED ORIGIN (PORT-S S3b lane 3, commit C) -------------------
  // PORT-S-DEBT.md obligation 2's END STATE: "host the kernel under production's
  // camera via FRAME.cam, with getCamOrigin() as the surviving seam". This is
  // that seam's write half.
  //
  // ONE CAMERA PER PAGE, and which one is the PAGE's decision. On index.html
  // production's own `updateCamera` is the rule that drives — it is where the
  // owner's D11 dials ship, where he will fly them at the feel gate, and where
  // demo-aimlead PART 2 measures them — so this renderer is HANDED the origin
  // and its own camera does not run at all. On the two lab pages, which load no
  // js/game.js, nothing supplies an origin and the host's declared third copy
  // drives exactly as it has since lane 1.
  //
  // A BLEND OF THE TWO IS THE FAILURE THIS PREVENTS. Two rules easing toward
  // the same ship at different rates is not a compromise; it is a camera that
  // fights itself, and it would pass every centre measurement taken after it
  // settled.
  let camSupplied = false;
  // ---- THE HOSTED VIEW (PORT-S S3b lane 3, commit C) ----------------------
  // This renderer was written for a page it OWNS: two canvases sized to the
  // play box, its own devicePixelRatio transform, its own background, its own
  // ship. On index.html it owns none of those. Production letterboxes a single
  // field canvas with a fitted `scale/ox/oy` transform, fills its own field
  // ground, draws three HASHED parallax star layers and draws THE SHIP —
  // production's ship, which stays the ship.
  //
  // So a hosted view is four declarations, and each one names the thing
  // production already owns:
  //   transform   production's fitted letterbox matrix, used where this file
  //               would otherwise set its own DPR transform. Without it every
  //               draw lands outside the letterbox and the field is empty.
  //   extent      the logical field size a full-surface fill must cover. This
  //               file derives it from canvas pixels, which is the PANE on a
  //               page it owns and the whole letterboxed canvas on one it does
  //               not.
  //   background  OFF under a host: this file's background fills the extent
  //               with flat dark and would paint over production's field ground
  //               and its star layers, which are the ones that ship.
  //   players     OFF under a host: production draws the ship, with its hull
  //               damage, its seat hue, its crown and its comet halo. Two ships
  //               is the failure, and it is one this file cannot detect.
  // `setHostedView(null)` gives all four back, which is the shape every seam in
  // this program uses for "stop driving this".
  let hosted = null;
  // The census counter. `updateCamera` bumps it, so "the host copy never runs
  // on index.html" is a NUMBER a page leg can read rather than a claim. It is
  // not reset by a supplied frame — a single stray step has to stay visible.
  let camSteps = 0;
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
  // ---- A TRAP FOR S3b, AND IT FAILS SILENTLY -------------------------------
  // These four are NOT passive state. Their ONLY per-frame writer is inside
  // updateCamera() below, and the star sheet and the streak read them every
  // frame in the star pass. S3b retires that updateCamera() — so unless it
  // brings a replacement step driven from production's FRAME.cam, the camera
  // comes out correct and THE SKY STOPS MOVING, which every camera-centre
  // assertion in the world passes straight through.
  // The debt entry states the obligation and the assertion that refuses it:
  // .ai-reference/prompts/port-w-20260824/PORT-S-DEBT.md, "What S3b OWES",
  // items 3c and 4e. (Codex vendor-cross on S2, finding #3.)
  // THERE IS NO SCALE STATE ANY MORE. `camWide` (the view WIDTH, 1 / z) and
  // ZOOM_FLOOR (the width at which the arena clamp inverted) were the zoom's
  // whole state and they went with it. One world px is one stage px, always,
  // which is what the wrapping build has always drawn at and what production's
  // camera has always been.
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
  // (THE CURSOR'S STAGE POINT LEFT THIS FILE at S3b lane 1 commit F. It is held
  // by js/encounter-host.js, beside the rule that reads it; setCursorStage()
  // above forwards there under the same name, for demo-play.html's two callers.
  // A STAGE point is still what crosses, and a world point is still derived per
  // frame — the camera the point rides on moves between the pointermove and the
  // frame that reads it, which is 03M-D and D13's law.)

  let netRounds = null;
  function setNetRounds(list) { netRounds = list || null; }

  // ...and the BODIES, the same seam one plane over (S-fxg8ts). The wire has
  // decoded bodies into `Net.view().enemies` since r7a commit 6, and
  // js/encounter.js's mapState() has handed that list to the hit tests and the
  // edge arrows since — but the DRAW read the dormant kernel's own S.enemies,
  // which is empty on a net client. So in `?mp` the enemies were hittable and
  // INVISIBLE. The round loop's own note names this split ("the wire half is
  // R7's and the draw half is the look plane's"); this is the draw half.
  //   ONE SETTER, no new draw code, exactly as setNetRounds: the body loop
  // already walks a list and it is handed this one. `null` means "read the
  // kernel's own store", which is every solo page and every suite that does
  // not set it, so the shipped path pays one null test.
  let netBodies = null;
  function setNetBodies(list) { netBodies = list || null; }

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
    // D46 (PORT-L): the demo table lives in js/palette.js now. The guard is
    // js/game.js:379's idiom, and it is load-bearing: `PALETTE` is a
    // script-lexical const (there is no window.PALETTE), and this file is also
    // run inside vm boxes that load the kernel without the palette. Those boxes
    // fall back to the kernel's own literal, which a source pin in
    // server/names.test.mjs holds equal to PALETTE.demo byte for byte.
    C = typeof PALETTE !== "undefined" ? PALETTE.demo : k.C;
    RGB = typeof PALETTE !== "undefined" ? PALETTE.demo.RGB : k.RGB;
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
    camTick = -1; // a fresh binding is a fresh run — the next render snaps the camera
  }

  // The ONE stage-to-world conversion. Its only caller today is provider() in
  // demo-play.html — the render plane's own caller was aimDir(), which the
  // owner's camera rule deleted (hop 3R), and cursorOffset() deliberately does
  // NOT call it (it needs a camera-independent DISPLACEMENT, not a point; see
  // the derivation there). TWO COPIES OF `stage + cam` IS HOW THE 03M-D AIM
  // DRIFT COMES BACK (1f118bb) — the owner has flown that exact signature once
  // and will name it in seconds. If a caller needs a world POINT, it calls this;
  // it does not rebuild it from getCamOrigin().
  //
  // The inverse of what beginCanvas() applies: with no scale, a world point
  // (wx, wy) is drawn at stage (wx - camX, wy - camY), so wx = sx + camX. That
  // is the arithmetic every caller used before the zoom, restored by deleting
  // the divide rather than by a scale that happens to sit at 1 — and the ONE
  // place it lives is still here.
  //
  // NaN STILL HOLDS: a non-finite stage point comes back non-finite, so the
  // kernel's "no cursor yet" hold survives untouched.
  function stageToWorld(sx, sy) {
    const cam = getCamOrigin();
    return { x: sx + cam.x, y: sy + cam.y };
  }

  // zoomFor() SAT HERE and it is deleted with the rest of the zoom. What it knew
  // is worth one paragraph, because the next person asked for a widening will
  // rediscover it the hard way: D was measured from the PANE CENTRE and never
  // from the ship, however plainly the owner's words said ship. A ship-anchored
  // D makes the scale depend on a quantity the scale moves — measured loop gain
  // 1.52 at z = 1, above unity, so the view alternated between the rails every
  // frame across most of the pane; a WORLD-px distance is worse still, bistable
  // and hysteretic, a camera that depends on where your hand has BEEN. The pane
  // centre has loop gain exactly zero. Anyone rebuilding this starts there.
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

  // ---- THE LOOKAHEAD BLOCK IS DELETED (S3b lane 1, commit F) --------------
  // PORT-S-DEBT.md obligation 1, and this file's own head comment asked for it:
  // "PORT-S brings the kernel under production's own updateCamera() via
  // FRAME.cam and MUST DELETE this block — two lead maths is not the end state."
  // What stood here was setCursorStage(), aiming(), cursorOffset(), leadVec(),
  // gatedLead() and the commit gate's state — the production-DERIVED lead maths
  // this file carried only because the lab had no camera of its own.
  //
  // WHERE IT WENT, and it went ONE place: js/encounter-host.js's camera block.
  // demo-play.html and demo-lab.html load that file (SIM_FILES member 7, script
  // tags added at S3b commit B) and do NOT load js/game.js, so the host is the
  // only place on those pages that can hold the rule. Deleting the block without
  // putting the rule where those pages reach it is exactly the failure
  // PORT-S-DEBT.md's "hazard" section describes: the camera would ease to the
  // ship centre with the leash and the arena clamp and NO LEAD AT ALL, and the
  // owner's ease 0.05, camLead 30 and cursorPull 1.0 would be silently gone from
  // the build he passed.
  //
  // WHAT SURVIVES HERE, and why each one is a forwarder and not a re-spelling:
  //   setCursorStage(sx, sy) — obligation 3a. It has a PUBLIC export and TWO
  //     page callers (demo-play.html's pointermove handler and its AUTO/HUMAN
  //     switch). The name stays and the body forwards, so the two callers are
  //     untouched and still hand over the same STAGE point.
  //   __test.cursorOffset / __test.leadVec — obligation 3's seam rule: the seam
  //     MOVES and the tools are re-pointed, or the seam and the tools go
  //     together by name. It moved; these forward, so
  //     test/tools/demo-aimlead.mjs PART 1 measures the hosted rule through the
  //     same names it always used.
  //   updateCamera() — the camera itself, and it does NOT move at this commit.
  //     Obligation 2's END STATE (the kernel under production's FRAME.cam) is
  //     lane 3's, because it needs a page that loads both planes. What changed
  //     here is where its LEAD comes from.
  //
  // A note on WHAT IS NOT DUPLICATED. The derivation of the solved form — the
  // gain B/(1-B), the cancelled (1-B), the camera-independence of u — ships in
  // js/game.js, which is the authority. It is not restated in the host and it is
  // not restated here, because a second copy of a derivation drifts exactly the
  // way a second copy of a number does.
  //
  // ---- THE HOST IS REQUIRED, AND ITS ABSENCE IS LOUD ----------------------
  // An earlier draft of this block claimed host absence was "LOUD-BY-BEHAVIOUR".
  // IT WAS NOT. The forwarders silently substituted a ZERO LEAD and the DEFAULT
  // dials, which is a plain ease to the ship centre with the leash and the arena
  // clamp — precisely the PORT-S-DEBT hazard, arriving quietly. The Codex
  // vendor-cross round also showed the load census in that comment was false:
  // it named the two lab pages, and test/node-golden.mjs's frameWith() and
  // test/tools/demo-parity.html load this file with no host at all.
  //
  // SO ABSENCE IS A THROW, unless the loader has said out loud that it is
  // rendering WITHOUT A CAMERA. One declaration, one spelling, greppable in a
  // second:
  //
  //     DemoRender.declareNoCamera("<why this render needs no camera>")
  //
  // A grep for `declareNoCamera` is the whole census, and it can never be stale
  // the way a prose list is: a loader that neither installs the host nor
  // declares itself gets an exception naming both routes out, on the first frame
  // it draws. That is the mechanism the old comment described and did not have.
  //
  // THE DECLARATION IS NOT A SUPPRESSION. It changes nothing about the camera —
  // a declared render still gets the zero lead and the default dials, because
  // that is what "no camera" means. What it buys is that the answer was CHOSEN,
  // and that a later edit turning one of those loaders into a bounded moving
  // frame has a sentence beside it to contradict.
  //
  // IT IS LAZY, deliberately: the throw fires when the camera is ASKED FOR, not
  // when this file loads. index.html carries the tag and never calls setKernel
  // or render, so a load-time check would force a declaration onto a page that
  // draws nothing through this plane.
  function host() {
    return (typeof window !== "undefined" && window.EncounterHost)
      || (typeof globalThis !== "undefined" && globalThis.EncounterHost) || null;
  }
  let noCameraReason = "";
  function declareNoCamera(why) {
    noCameraReason = String(why == null || why === "" ? "unstated" : why);
    return noCameraReason;
  }
  function requireHost(asked) {
    const h = host();
    if (h) return h;
    if (noCameraReason) return null;   // declared: the documented no-camera render
    throw new Error(
      "js/demo-render.js: " + asked + ", but no EncounterHost is installed and this "
      + "loader has not declared a no-camera render.\n"
      + "  The owner's camera RULE (D11 — ease, edgeMargin, camLead, cursorPull, leadDz) "
      + "lives in js/encounter-host.js since PORT-S S3b. Without it this plane would ease "
      + "to the ship centre with no lead at all, which is the failure "
      + ".ai-reference/prompts/port-w-20260824/PORT-S-DEBT.md calls 'the hazard'.\n"
      + "  Two ways out, and pick the true one:\n"
      + "    load js/encounter-host.js and EncounterHost.install({ kernel }) — a real camera; or\n"
      + "    DemoRender.declareNoCamera(\"why this render needs no camera\") — no camera, on purpose.");
  }
  function setCursorStage(sx, sy) {
    const h = requireHost("a cursor stage point was handed to the camera");
    if (h) h.setCursorStage(sx, sy);
  }
  function hostedLead(dt) {
    const h = requireHost("the camera lead was asked for");
    return h ? h.camGatedLead(dt) : { x: 0, y: 0 };
  }
  function hostedDials() {
    const h = requireHost("the camera dials were asked for");
    return h ? h.getCamDials() : CAM_DIAL_DEFAULTS;
  }

  // One camera step per presented frame. The target is the ship's PRESENTED
  // pose, so the camera and the ship it follows read the same interpolation.
  // The order is production's: the lead enters the ease TARGET only, then the
  // leash, then the world clamp last.
  function updateCamera(alpha) {
    const local = S.players[0]; // the camera follows the LOCAL seat
    if (!local) return;
    const pose = renderPos(local, alpha);
    camPose = pose;
    const clock = S.time + alpha * kernel.STEP;
    camSteps += 1; // the census — see camSteps' declaration
    const restart = camTick < 0 || S.tick < camTick;
    let dt = restart ? 0 : clock - camClock;
    if (!(dt > 0)) dt = 0; // a stalled or rewound clock is no time at all
    if (dt > CAM_DT_MAX) dt = CAM_DT_MAX;
    camClock = clock;
    camTick = S.tick;
    if (restart) {
      // A reset moves the ship without moving it: snap, never glide in from
      // wherever the last run parked the view. There is no width to snap beside
      // it any more — the zoom step that used to run above this is deleted.
      camX = pose.x - PLAY_W / 2;
      camY = pose.y - PLAY_H / 2;
      // production's setCamMode: the gate re-seeds from the next ideal, so a
      // restart never replays the old run's stale timer. The gate lives in the
      // host now; this is the same call through the seam.
      // requireHost, not host(): a RESTART frame is still a camera step, and it
      // is the frame every one-shot renderer draws. Asking here is what makes
      // the declaration census complete rather than only covering the second
      // frame onward.
      const h0 = requireHost("the camera gate was re-seeded on a restart frame");
      if (h0) h0.camReseed();
    } else {
      // The TARGET swings only when the gate commits — the ease still glides
      // there. The lead is the HOST's now: one lead maths, in the file the
      // owner's rule moved to. THE DIALS ARE READ PER FRAME, from the same
      // place, so the panel's write half and this read half cannot disagree.
      const D = hostedDials();
      const CAM_EASE = D.ease;
      const EDGEMARGIN = D.edgeMargin;
      const l = hostedLead(dt);
      const ease = 1 - Math.pow(1 - CAM_EASE, dt * CAM_EASE_HZ);
      camX += (pose.x + l.x - PLAY_W / 2 - camX) * ease;
      camY += (pose.y + l.y - PLAY_H / 2 - camY) * ease;
      // The leash (js/game.js:1895-1896) — whatever the ease asked for, the ship
      // stays at least EDGEMARGIN px inside every view edge. The clamp below may
      // shave that margin at an arena wall; the ship still never leaves the view.
      // No margin divides by anything now: the ship's screen x is pose.x - camX,
      // so "at least EDGEMARGIN screen px inside the edge" is EDGEMARGIN WORLD
      // px. The interval is non-empty iff PLAY_W >= 2 * EDGEMARGIN.
      // BOTH AXES ARE PART OF THE CLAIM: the y line below needs
      // PLAY_H >= 2 * EDGEMARGIN in its own right, and PLAY_H is the SHORTER
      // side, so the binding condition is min(PLAY_W, PLAY_H) >= 2 * EDGEMARGIN
      // — 120 <= 720 at the shipped Edge 60, and 400 <= 720 at the panel's rail
      // of 200. Naming PLAY_W alone proved half of it. setCamDials() enforces
      // exactly this bound, on the short side, so no caller can empty it either.
      camX = Math.max(pose.x - (PLAY_W - EDGEMARGIN), Math.min(pose.x - EDGEMARGIN, camX));
      camY = Math.max(pose.y - (PLAY_H - EDGEMARGIN), Math.min(pose.y - EDGEMARGIN, camY));
    }
    // js/game.js:1720-1723 (clampCam), parameterized by the arena: the view is
    // PLAY_W world px wide, so that is what has to fit. The ZOOM_FLOOR that used
    // to floor this divide is gone with the scale it floored — a view wider than
    // the arena is no longer reachable at all.
    camX = Math.max(0, Math.min(ARENA_W - PLAY_W, camX));
    camY = Math.max(0, Math.min(ARENA_H - PLAY_H, camY));
    // The star sheet's screen offset, integrated from the camera's SCREEN motion.
    // LAST in the function, deliberately: the ease, the leash and the arena clamp
    // have all had their say by here, so what is accumulated is the camera's real
    // motion and not what the ease asked for.
    //
    // WITHOUT A SCALE THIS TELESCOPES EXACTLY TO camX, and it is left as a sum
    // anyway rather than collapsed, for one reason that is not tidiness: camVX is
    // the PER-FRAME increment and the star streak is drawn along it, so the
    // difference has to be taken whatever the sheet is placed from. The `* z`
    // factors that made the two quantities differ are gone with the zoom.
    //
    // A restart SEEDS rather than accumulates. The camera has just snapped, and
    // the difference across a snap is not motion.
    stepStarPan(restart);
  }

  // ---- THE STAR-PAN AND STREAK STEP (PORT-S-DEBT obligation 3c) ------------
  // A WRITER IN ITS OWN RIGHT, extracted here at S3b lane 1 commit F. It used to
  // be four inline lines at the tail of updateCamera(), and the debt entry names
  // exactly that as the trap: "their ONLY writer is inside the lab
  // updateCamera() that this obligation lets S3b retire … without it the camera
  // is correct and the sky stops moving", and it "passes every camera assertion
  // above it". Naming the writer is what makes it survivable: whatever becomes
  // of updateCamera() at lane 3, THIS function is what the hosted camera calls,
  // and a lane that drops it deletes a named function rather than four lines
  // nobody was looking at.
  //
  // SEEDED, NEVER ACCUMULATED, ON A RESTART. The camera has just snapped, and
  // the difference across a snap is not motion — it would be drawn as one huge
  // streak and would put the sheet a whole snap out of place.
  //
  // IT RUNS LAST, after the ease, the leash and the arena clamp have all had
  // their say, so what is accumulated is the camera's REAL screen motion and not
  // what the ease asked for.
  function stepStarPan(restart) {
    if (restart) {
      starPanX = camX;
      starPanY = camY;
      camVX = 0;
      camVY = 0;
    } else {
      camVX = camX - camPrevX;
      camVY = camY - camPrevY;
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

  // setCamOrigin(x, y) — hand this renderer the origin production's own camera
  // just computed, and put it in SUPPLIED mode for good. `setCamOrigin(null)`
  // hands the camera back, which is the shape every other seam in this program
  // uses for "stop driving this" (setInput, setPose, unbridgeSeat).
  //
  // A NON-FINITE PAIR IS REFUSED WHOLE rather than folded: a NaN origin
  // translates every draw off the canvas and the field simply vanishes, which
  // is the least diagnosable failure a camera has.
  // See the hosted-view declaration above. A partial object is a partial
  // declaration: every key defaults to this file's own behaviour, so a host
  // that only wants the transform gets exactly that.
  function setHostedView(v) {
    if (v === null || v === undefined) { hosted = null; return true; }
    if (typeof v !== "object") return false;
    hosted = {
      transform: v.transform && Number.isFinite(v.transform.a) ? v.transform : null,
      extent: v.extent && Number.isFinite(v.extent.w) && Number.isFinite(v.extent.h) ? v.extent : null,
      background: v.background !== false,
      players: v.players !== false
    };
    return true;
  }

  function setCamOrigin(x, y) {
    if (x === null || x === undefined) { camSupplied = false; return true; }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    camSupplied = true;
    camX = x;
    camY = y;
    return true;
  }

  // The lab dials. A PARTIAL object: only the finite numbers land, unknown keys
  // are ignored, and a slider that sends a blank value leaves the dial alone.
  //
  // FINITE IS NOT A DOMAIN. The HTML sliders cannot send an out-of-range number,
  // but these functions are exported and the sliders are not their only caller —
  // and some dials have values that are finite and still destroy the frame. The
  // CAMERA five carry that check with them into js/encounter-host.js, where the
  // maths that makes each bound real now lives (ease outside [0,1] runs the ease
  // away or makes it NaN; an edgeMargin past half the SHORT side empties the
  // leash interval). What is left here is the STAR three, checked below.
  //   THE FOUR ZOOM DIALS USED TO BE THE WORST OF THESE — zoomEase -1 made the
  // view width 0 and the scale Infinity, zoomWide 12 put the view wider than the
  // arena and inverted the clamp, zoomRef 0 divided by zero. They are deleted,
  // and the lesson they paid for is kept: FINITE IS NOT A DOMAIN.
  function dial(v, lo, hi) {
    return Number.isFinite(v) && v >= lo && v <= hi;
  }
  // ---- THE ROUTER (PORT-S-DEBT obligation 3b) ------------------------------
  // The accessors keep their NAMES and their CALLERS — demo-play.html:609 reads
  // the shipped set, :639 writes each slider's patch and :649 restores — and
  // become the place the panel's two systems are separated. The five CAMERA rows
  // go to the host, which now holds the rule that reads them; the three STAR
  // rows stay here, because the star pass is not production's camera and does
  // not move to production at all.
  //
  // THEY ARE STILL A PAIR. That is the whole of 3b: move the read half without
  // the write half and the panel reads from a camera it cannot write to. Both
  // halves route, both to the same two places, in this one block.
  function setCamDials(next) {
    if (!next || typeof next !== "object") return;
    const h = host();
    if (h) h.setCamDials(next);   // ease, edgeMargin, camLead, cursorPull, leadDz —
                                  // each checked against its OWN domain there
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
    if (dial(next.streak, 0, 2)) STREAK = next.streak;               // frames of camera travel drawn as a tail; 0 = OFF
  }

  function getCamDials() {
    const D = hostedDials();
    return {
      ease: D.ease,
      edgeMargin: D.edgeMargin,
      camLead: D.camLead,
      cursorPull: D.cursorPull,
      leadDz: D.leadDz,
      starLit: STARLIT,
      starSize: STARSIZE,
      streak: STREAK
    };
  }

  // The one place a stroke width is written, and it is now a plain assignment.
  //
  // IT USED TO COMPENSATE FOR THE ZOOM: line art is specified in WORLD px and a
  // scaled canvas drew it at z * w device px, so at z = 0.5 the player hull's
  // 1.65 became 0.83 device px — sub-pixel, alpha-blended, and the line art DIMMED
  // as well as shrank. The `zoomLW` dial traded that against a fleet that looked
  // heavier as the view widened. With no scale there is nothing to compensate: the
  // old expression was `w * Math.pow(1 / camScale(), ZOOMLW)`, and at camScale() 1
  // that is `w * 1`, which is `w` for every double. So this deletion is
  // BIT-IDENTICAL at the shipped setting rather than merely close.
  //
  // THE HELPER STAYS EVEN SO, and that is not sentiment. ALL IN-SCOPE SITES OR
  // NONE: the day a width rule comes back it must arrive at ONE place, and
  // forty-two inlined width writes would make that a forty-two-site edit that
  // half a fleet would be left out of.
  //
  // THE COUNTS BELOW WERE STALE AND ARE RE-MEASURED HERE. The block used to
  // claim 1 / 40 / 4; the file grew and the true figures are 1 / 43 / 5. The
  // fifth `w`+`x` write is the STAR STREAK's, which is not in the backdrop at
  // all — so the old sentence "all inside the `if (!BOUNDED)` backdrop body" was
  // false as well as under-counted. A self-check that is not re-run is not a
  // self-check. Character classes keep the greps from matching this comment:
  //   grep -o 'ct[x]\.lineWidth' | wc -l  ->  1  (the helper itself, below)
  //   grep -o 'l[w](ctx, '        | wc -l  -> 43  (42 call sites + the definition)
  //   grep -o 'w[x]\.lineWidth'   | wc -l  ->  5  (4 in the backdrop, 1 in the streak)
  function lw(ctx, w) {
    ctx.lineWidth = w;
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
  // THE SCALE THAT SAT BETWEEN THESE TWO TRANSLATES IS GONE with the zoom. Its
  // ORDER was load-bearing in both directions and the reason is worth keeping in
  // case one ever comes back: it went AFTER the shake, which kept the shake a
  // SCREEN-px constant instead of one that shrank as the view widened, and BEFORE
  // the camera translate, which is what makes -camX a WORLD offset. ctx.scale(1,
  // 1) is the identity transform, so removing it is bit-identical to leaving it.
  // The base transform every pass starts from: this file's own DPR matrix on a
  // page it owns, and the HOST's fitted letterbox matrix on one it does not.
  function baseTransform(ctx) {
    if (hosted && hosted.transform) {
      const m = hosted.transform;
      ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    } else {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
  }

  function beginCanvas(ctx, shakeX, shakeY) {
    baseTransform(ctx);
    ctx.translate(shakeX || 0, shakeY || 0);
    if (BOUNDED) {
      ctx.translate(-camX, -camY);
    }
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
  }

  // The canvas extent in CSS pixels — what a full-surface fill or clear must
  // cover. It equals the play box today, and stops being the same number the
  // moment the view is allowed to be wider than the box encounters are built for.
  function canvasW(ctx) { return hosted && hosted.extent ? hosted.extent.w : ctx.canvas.width / DPR; }
  function canvasH(ctx) { return hosted && hosted.extent ? hosted.extent.h : ctx.canvas.height / DPR; }

  // A positive modulo that tiles the star field across the view. This is screen
  // dressing, not world topology: the bounded world has no seam, the star sheet
  // simply repeats so a panning camera never runs off the end of it.
  function tileMod(n, size) { return ((n % size) + size) % size; }

  function drawBackground() {
    // A HOST OWNS ITS OWN GROUND — see the hosted-view declaration.
    if (hosted && hosted.background === false) return;
    baseTransform(wx);
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
        // the tile covers the canvas. starPanX is the camera's SCREEN travel,
        // integrated in updateCamera(). It used to be `camX * z` — an absolute
        // world coordinate times a scale that moved — which yanked the whole
        // field by up to 49x the camera's own motion whenever the zoom was
        // easing. With the zoom deleted the integral telescopes to camX exactly,
        // so the two forms are now the same number; the sum is kept because
        // camVX, which the streak draws along, is its own increment.
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
      // THIS IS THE GLOW'S OWN LIST AND IT STAYS HERE. PORT-S S3b lane 2 briefly
      // merged it with the kernel's aggro gate, on the argument that "is this
      // body showing something" and "may this body re-decide" were one
      // question. A vendor-cross round measured that they are not: this list is
      // tuned for READING and carries `dash` without `lunge`, because a
      // hammerhead's ram wants the extra glow and a snapper's does not — and
      // the gate that inherited the omission let a snapper retarget mid-dash
      // and pass through the seat standing in its own painted lane.
      //
      // So the two are separate and each says so. The gate is
      // DemoKernel.committedToALine, which asks whether an ATTACK IS IN
      // PROGRESS; this asks whether the body should be brighter.
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
    // THE ONE OTHER `S.enemies` WALK, AND IT STAYS ON THE KERNEL (S-fxg8ts).
    // It IS a draw read — the grid lines to a constructor's turrets — so the
    // body loop's net arm was measured against it and REFUSED: the walk keys
    // on `parent`, and `parent` is on NO wire row (js/wire.js ROW_BODY). A
    // decoded body carries no such key, so pointing this at the net list would
    // find `undefined === e.id` for every body and draw exactly what it draws
    // now, which is nothing. A constructor's grid reaching a net client needs
    // the FIELD on the wire first; that is a wire round's, not this seam's.
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
      // ---- D63: TWO OF THESE FIVE SAY WHAT THEY DO ----------------------
      // The arm above is one silhouette for five kinds that behave nothing
      // alike, and a player who cannot tell them apart cannot answer them.
      // The three that keep it — spitOrb, omegaSphere, vortex — are BYTE FOR
      // BYTE unchanged; the two with a rule worth reading get a mark, drawn
      // OVER the shared body so the family still reads as a family.
      if (b.kind === "splitter") {
        // "MORE OF ME INSIDE" — two filled cores along the flight line, the
        // children it is carrying. Along the VELOCITY, not the heading: the
        // fan opens across the direction of travel, so the two cores sit
        // where the halves will be.
        const sa = Math.atan2(b.vy, b.vx);
        ctx.fillStyle = cssFor(b.color);
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(sa) * b.r * 0.45, p.y + Math.sin(sa) * b.r * 0.45, b.r * 0.35, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x - Math.cos(sa) * b.r * 0.45, p.y - Math.sin(sa) * b.r * 0.45, b.r * 0.35, 0, TAU);
        ctx.fill();
      } else if (b.kind === "plasma") {
        // "DENY ME" — a second outline ring standing off the body. The plasma
        // orb is the one round in this family that a shot can stop before it
        // arms (js/demo-kernel.js's triggerPlasmaOrb), so its tell is a shell
        // to aim at rather than a mass to run from.
        lw(ctx, 1);
        ctx.beginPath(); ctx.arc(p.x, p.y, b.r + 3, 0, TAU); ctx.stroke();
      }
    } else if (b.kind === "grenade") {
      // ---- D63: THE GRENADE HAD NO ARM AT ALL ---------------------------
      // It fell to the bare `else` below with ten other kinds — one flat disc,
      // no way to know it is about to become a fan. "I WILL BURST": today's
      // disc, plus a fuse on the TRAILING side (opposite the velocity, so it
      // never hides under the streak the line above already drew) that
      // BLINKS. The blink is off S.time and the round's own id, so two
      // grenades in one frame are out of phase and the eye reads two.
      ctx.fillStyle = cssFor(b.color);
      ctx.beginPath(); ctx.arc(p.x, p.y, b.r, 0, TAU); ctx.fill();
      const ga = Math.atan2(b.vy, b.vx);
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(S.time * 12 + b.id);
      ctx.strokeStyle = cssFor(b.color);
      lw(ctx, 1.25);
      ctx.beginPath();
      ctx.moveTo(p.x - Math.cos(ga) * b.r, p.y - Math.sin(ga) * b.r);
      ctx.lineTo(p.x - Math.cos(ga) * b.r * 1.8, p.y - Math.sin(ga) * b.r * 1.8);
      ctx.stroke();
      ctx.restore();
    } else if (b.kind === "kineticLance" || b.kind === "rocket") {
      const a = Math.atan2(b.vy, b.vx);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
      ctx.fillStyle = b.kind === "kineticLance" ? C.ink : cssFor(b.color);
      ctx.beginPath(); ctx.moveTo(b.r * 1.6, 0); ctx.lineTo(-b.r, -b.r * 0.48); ctx.lineTo(-b.r * 0.5, 0); ctx.lineTo(-b.r, b.r * 0.48); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    } else if (b.kind === "lightning") {
      // ---- THE LANCE SILHOUETTE (OPEN 5, owner-ruled: the lance) ---------
      // The Star Eater's blue bolt had NO arm: it fell to the bare `else`
      // below and came out as a filled disc, the same shape as ten unrelated
      // kinds. It is not a mass — it is a dart, and the owner ruled the dart.
      //   NO DISC AT ALL. One line, thinner and 2.5x longer than the plain
      // round's streak the chain drew above it: a lance reads as a direction
      // and a length, and a body drawn at its head would only argue with
      // that. The line is drawn back along the SAME prev-pose vector the
      // streak uses, so it cannot disagree with the round's own motion.
      //   b.r AND b.color ARE UNTOUCHED — both are hashed, and the halo in
      // the glow pass is floored at Math.max(13, b.r * 2.6) anyway, so a
      // radius change would dim nothing. The colour move ("cyan" -> "blue")
      // and the ladder row are P-SIM batch 2's, not this lane's.
      lw(ctx, 1);
      ctx.beginPath();
      ctx.moveTo(p.x - 2.5 * (p.x - prevX), p.y - 2.5 * (p.y - prevY));
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else if (b.kind === "asteroid") {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(S.time * 0.8 + b.id);
      polygon(ctx, 7, b.r, b.id * 0.17); ctx.fill(); ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = cssFor(b.color);
      ctx.beginPath(); ctx.arc(p.x, p.y, b.r, 0, TAU); ctx.fill();
    }
  }

  // EVERY SEAT IS DRAWN, in ascending order (PORT-S S3a commit E). The seat
  // loop is OUTSIDE the ship-drawing function rather than inside it, because
  // `drawSeat` recurses into itself for the wrap copies and a loop at the top of
  // a self-calling function would re-walk the roster once per copy.
  //
  // ORDER IS PRESENTATION HERE, NOT ARITHMETIC — this file draws, it does not
  // step — but it is ascending anyway, so that a reader who finds the pinned
  // order in the kernel does not have to wonder whether the renderer disagrees.
  function drawPlayer(ctx, alpha, glowPass) {
    const list = S.players;
    for (let s = 0; s < list.length; s++) drawSeat(ctx, list[s], alpha, glowPass, false);
  }

  function drawSeat(ctx, p, alpha, glowPass, copyPass) {
    const pos = renderPos(p, alpha);
    const angle = lerpAngle(p.pangle, p.angle, alpha);
    if (!p.alive) return;
    if (!copyPass) {
      const offsets = wrappedRenderOffsets(pos, 34);
      for (let i = 0; i < offsets.length; i++) {
        ctx.save(); ctx.translate(offsets[i].x, offsets[i].y);
        drawSeat(ctx, p, alpha, glowPass, true);
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
    // ---- THE HOST MAY OWN THE GLOW (commit C) ---------------------------
    // js/fx.js is production's bloom and it already reads every body in the
    // room through `Encounter.lights()`. A second light pass here would put the
    // same halos on the same surface twice, at a different radius, under a
    // composite this file sets and that file does not expect. So a hosted view
    // with no `light` context runs the WORLD pass alone, and `lit` is what says
    // so at each of the eight paired draws below.
    const lit = !!lx;
    // ...unless an origin was SUPPLIED, in which case this renderer has no
    // camera of its own to run — see setCamOrigin.
    if (BOUNDED && !camSupplied) updateCamera(alpha); // before the first draw — the background reads it too
    drawBackground();
    // A HOST'S LIGHT SURFACE IS ITS OWN TO CLEAR: js/fx.js clears and composes
    // its glow layer on its own schedule, and a second clear here would erase
    // the ink production's own passes had already put on it.
    if (lit && !hosted) {
      lx.setTransform(DPR, 0, 0, DPR, 0, 0);
      lx.clearRect(0, 0, canvasW(lx), canvasH(lx));
    }
    const shakeX = !reducedMotion && S.shake > 0.05 ? Math.sin(S.time * 91.7) * S.shake : 0;
    const shakeY = !reducedMotion && S.shake > 0.05 ? Math.sin(S.time * 77.3 + 1.2) * S.shake : 0;
    lastShakeX = shakeX;  // the test seam's only reader — see __test.shipScreen()
    lastShakeY = shakeY;
    beginCanvas(wx, shakeX, shakeY);
    if (lit) beginCanvas(lx, shakeX, shakeY);
    if (lit) lx.globalCompositeOperation = "lighter";

    for (let i = 0; i < S.entries.length; i++) {
      drawPortal(wx, S.entries[i], alpha, false);
      if (lit) drawPortal(lx, S.entries[i], alpha, true);
    }
    drawShockwaves(wx, false);
    if (lit) drawShockwaves(lx, true);
    drawOrbs(wx, alpha, false);
    if (lit) drawOrbs(lx, alpha, true);
    // THE ROUND LIST, and since R7 it may come from somewhere other than the
    // kernel. A NET client steps no kernel: its rounds arrive on the wire (the
    // homing CONSTRUCTS) or are derived from spawn events (everything else),
    // and js/net.js hands the presented list through setNetRounds. The draw is
    // the SAME draw — a round is a round, and inventing a second one for the
    // wire is how two planes start looking different.
    //   THE HANDLE IS GATED ON A LIVE NET CLIENT, and that is not tidiness — it
    // was MEASURED, TWICE. This is a MODULE-LEVEL handle and it OUTLIVES A
    // SUITE: the net suite sets it, a later suite runs on the same page, and
    // the round draw then reads a list belonging to a client that is no longer
    // there. The fx suite's BOLT leg red INTERMITTENTLY on the full gate while
    // passing 3/3 on its own — and it kept doing so after a first fix that only
    // fell back on an EMPTY list, because js/net.js reassigns NETV.rounds to a
    // NEW ARRAY on every deal while this handle still points at the old one.
    // Disabling the handle entirely made three full runs green, which is what
    // named the coupling as ours.
    //   `Net.active()` is the same condition js/game.js's drawSuccessorField
    // asks, so the two arms of DRAW-1 agree by construction rather than by two
    // conditions kept in step. js/net.js ALSO clears the handle at both
    // discontinuity cuts and at close; this is the outer lock.
    const netLive = !!(window.Net && Net.active && Net.active());
    const rounds = (netLive && netRounds && netRounds.length) ? netRounds : S.bullets;
    for (let i = 0; i < rounds.length; i++) {
      drawBullet(wx, rounds[i], alpha, false);
      if (lit) drawBullet(lx, rounds[i], alpha, true);
    }
    // THE SAME `netLive` CONDITION the round loop above reads, and the same
    // fallback: a net client draws the wire's bodies, every other page draws
    // the kernel's. Both arms walk ONE list through the SAME drawEnemy — a
    // second body draw inside js/net.js is DRAW-2, and it stays refused.
    const bodies = (netLive && netBodies && netBodies.length) ? netBodies : S.enemies;
    for (let i = 0; i < bodies.length; i++) {
      // A KIND THE WIRE COULD NOT NAME decodes with `type: null` (js/net.js,
      // the BODY_R_UNKNOWN block), and STATS has no row for it — drawEnemy's
      // second line reads `STATS[e.type].r` and a throw there takes the WHOLE
      // frame, not one body. Skipped instead. On the solo path this is a
      // proven no-op: every kernel body's `type` is a STATS key by
      // construction, so the test is true for all of them.
      if (!STATS[bodies[i].type]) continue;
      drawEnemy(wx, bodies[i], alpha, false);
      if (lit) drawEnemy(lx, bodies[i], alpha, true);
    }
    drawFragments(wx, alpha);
    drawParticles(wx, alpha, false);
    if (lit) drawParticles(lx, alpha, true);
    if (!(hosted && hosted.players === false)) {
      drawPlayer(wx, alpha, false);
      if (lit) drawPlayer(lx, alpha, true);
    }
    if (lit) lx.globalCompositeOperation = "source-over";
    wx.globalAlpha = 1;
    if (lit) lx.globalAlpha = 1;
  }

  window.DemoRender = {
    setKernel: setKernel,
    // R7: the NET client's round list, presented. null means "read the
    // kernel's own store", which is every solo page and every suite that does
    // not set it — so this costs the shipped path one null test.
    setNetRounds: setNetRounds,
    // ...and the net client's BODY list, presented, under the same contract
    // (S-fxg8ts). null means "read the kernel's own store".
    setNetBodies: setNetBodies,
    render: render,
    getCamOrigin: getCamOrigin,
    // Kept EXPORTED AND UNCHANGED for compatibility. New callers want
    // stageToWorld(): a raw origin is only half a conversion since the zoom.
    stageToWorld: stageToWorld,
    // THESE THREE ARE S3b's TOO, and the seam table in the debt file did not
    // name them at first. setCursorStage is DELETED by the lookahead block's
    // retirement while demo-play.html still calls it twice; setCamDials is the
    // WRITE half of a pair whose read half the table did name, and the panel
    // they drive mixes five production camera dials with three star-pass ones.
    // See PORT-S-DEBT.md, "What S3b OWES", items 3a and 3b.
    setCamOrigin: setCamOrigin,
    setHostedView: setHostedView,
    setCursorStage: setCursorStage,
    declareNoCamera: declareNoCamera,
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
    // of the file, outside it — setCam and shipScreen are not lookahead code at
    // all. So PORT-S removes or REWIRES this seam explicitly, by name, and the
    // debt note records it, since a comment on a block that gets deleted cannot
    // carry a debt past its own deletion. See
    // .ai-reference/prompts/port-w-20260824/PORT-S-DEBT.md.
    __test: {
      // FORWARDERS, since S3b lane 1 commit F. The rule moved to
      // js/encounter-host.js; PORT-S-DEBT.md's seam rule is that the seam moves
      // and the tools are re-pointed, or the seam and the tools go together by
      // name. It moved, so these keep the names test/tools/demo-aimlead.mjs
      // PART 1 reads and now measure the hosted rule through them.
      cursorOffset: function () { const h = host(); return h ? h.__test.cursorOffset() : { x: 0, y: 0 }; },
      leadVec: function () { const h = host(); return h ? h.__test.leadVec() : { x: 0, y: 0 }; },
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
      // zoomFor and camScale LEFT THIS SEAM with the zoom, and setCam lost its
      // third argument with them — there is no width to set. Both were read by
      // test/tools/demo-zoom-aim.mjs, which is retired by name in the same
      // commit, and by .ai-reference/tools/port-w-3q-probe.mjs, which is
      // gitignored reference tooling and is left broken deliberately rather than
      // shimmed. Nothing else in tests/ or test/ reads either name.
      setCam: function (x, y) { camX = x; camY = y; },
      // The census reads: how many times THIS renderer's own camera ran, and
      // whether it is in supplied mode at all. index.html's page leg asserts
      // the first is zero.
      camSteps: function () { return camSteps; },
      camSupplied: function () { return camSupplied; },
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
        // The `z` key went with the scale. A caller that multiplied by it was
        // multiplying by 1; a caller that reads it now gets undefined and finds
        // out, which is the outcome a silent 1 would have denied it.
        return { x: camPose.x - camX, y: camPose.y - camY,
                 shakeX: lastShakeX, shakeY: lastShakeY };
      }
    }
  };
})();

