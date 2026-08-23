"use strict";

// Synthesized sfx — every sound is generated at run time; nothing is loaded,
// no request leaves the page. This whole layer is a strict OBSERVER of the
// simulation: it reads localPlayer() (the local seat's ship), G, the tuner lets and the encounter's
// live state, writes none of it, and never touches the seeded rand() stream that makes a
// wave replay identically. Delete this file and the page behaves
// byte-identically to the one that never had audio — every call site out
// there is the same lazy, permissively guarded read (if (window.Sfx) ...)
// that game.js already uses for window.Encounter, for exactly the same
// reason.
//
// Three rules carry the design. CUES ARE DROPPED, NEVER QUEUED: a deferred
// cue arrives after the event it describes, and a queue is a bank of voices
// waiting to fire all at once the moment a suspended context wakes — one
// rule covers every failure mode. (The SFXLOOK lookahead every envelope is
// anchored at — anchorAt(), clamped to LOOK_MAX — is not a queue and does not
// bend the rule: the cue's nodes are created and start()ed in the same call,
// nothing waits in JS, and a context that is suspended when the cue is
// authored was already refused at the suspended gate — the offset lives
// inside the audio clock, where a few ms of lead is what keeps the envelope's
// head from landing in the render's past. See the step players.) THE HUM IS
// THE FLAME: the engine voice reads the local seat's flame through drawFlame's
// own curve and its own 1.5 px visibility floor, so the engine is audible on
// exactly the frames the flame is drawn and the ear and the eye cannot
// disagree about how hard the ship is burning. THE ARMED GATE IS USER
// ACTIVATION, NOT CONTEXT STATE: headless
// automation can hand a suite a RUNNING AudioContext with no gesture at all,
// and a synthetic ui.resume() never carries activation — so no voice is ever
// scheduled until a REAL gesture has reached unlock(), which is what keeps
// both check suites silent by construction instead of by luck.
//
// Everything here degrades to silence, never to an exception: each public
// method's whole body sits in one try/catch, nothing is async, and no
// promise escapes un-.catch'ed — ac.resume() measurably never settles under
// headless chrome, so it is fired and forgotten from unlock() alone, never
// awaited, never called per cue.
(() => {
  // the context is named ac throughout — game.js owns the name ctx globally
  // (its canvas 2d context), and a classic-script shadow of it here would be
  // an invitation to a very quiet bug the day a draw call lands in this file.
  let ac = null;
  let dead = false;  // permanent — no constructor, a failed build, or a closed
                     // context; a second context is exactly the leak we refuse
  let armed = false; // a real user gesture has reached unlock() — see above

  // the permanent graph, built once inside the first successful unlock().
  // master carries the volume curve; the ceiling is a pure safety stage and
  // never a mixer — it sits BEFORE the master trim on purpose, so its drive
  // is a property of the mix and a ≤1 trim downstream can never re-clip. FOUR
  // contributors sum into it, not three: the three buses (one per slider) and
  // the ENGINE, which bypasses the buses entirely (engOsc → engFilt → engDyn →
  // engWatch → ceiling) and is trimmed by SFXENG alone. The engine is the one
  // PERMANENT contributor — up to ENG_GAIN 0.17 (engCalc scales it by the
  // flame's drive, so 0.17 is the full-thrust ceiling) whenever the flame is
  // lit — a floor under every burst the buses carry, which is why the
  // S-4ew0wr mix pass halved its default: headroom bought under the bursts
  // pays on every peak.
  //   The ceiling is a WaveShaper soft clip (softClipCurve below): linear to
  // 0.8, a tanh knee above it, never past 1.0. It is MEMORYLESS — it has no
  // detector, no attack, no release, so it cannot pump — and it is the same
  // arithmetic in every engine. It replaced a DynamicsCompressor (-6 dB
  // threshold, 12:1) that was anything but the same: Firefox's node still runs
  // WebKit's sidechain pre-emphasis, which Chromium removed, so the square and
  // saw palette drove its detector hard and the whole mix ducked under bursts
  // — measured on a four-seat melee, reduction p50 −2.6 dB / p95 −5.6 dB in
  // Firefox against −0.04 dB in Chrome, and the death cue 5–7 dB quieter. A
  // memoryless knee cannot differ between browsers, which is the only property
  // a safety ceiling needs.
  let master = null, ceiling = null;
  let busShot = null, busFoe = null, busUi = null;
  // the engine — the one persistent voice: saw → lowpass → drive gain →
  // dead-man watch. Created and start()ed once, never stopped or re-created:
  // three fixed nodes for the page's life, a cost rather than a leak.
  let engOsc = null, engFilt = null, engDyn = null, engWatch = null;
  let engHold = 0; // an audition owns the engine ramp until this ac time —
                   // frame() must not stomp the test cue's audible bump

  const MAXVOICES = 32; // whole-cue admission budget — a cue starts all of its
                        // steps or none of them, never half a recipe.
                        // The SFXLOOK lookahead adds its 20 ms to every
                        // voice's hold (o.stop(t + dur + 0.02) with t already
                        // 20 ms ahead, and `live` counted from creation), so
                        // budget pressure rose with it — MEASURED, not felt:
                        // the 10 s four-seat melee of the audio-duck harness
                        // (test/tools/audio-duck, e2.live) asked 311
                        // / played 311 / refused 0 both BEFORE and AFTER the
                        // lookahead, in Firefox and in Chrome. stats().live is
                        // the number to watch if the mix is ever raised.
  // the master trim: master.gain = SFXVOL^1.6 × MASTER_TRIM (the ancestor's own
  // curve, printed beside the slider by game.js). 0.5, not the 0.4 the
  // compressor era carried: the Chrome compressor added ≈+2 dB of makeup on
  // every solo cue (fire 0.054 live vs 0.042 bypassed), and the ceiling adds
  // none, so the trim absorbs it and Chrome's level does not move. The mix
  // level as a whole is a separate, eared decision.
  const MASTER_TRIM = 0.5;
  // the lookahead's ceiling, ms. SFXLOOK is a console-typed let; a huge value
  // would schedule every voice seconds ahead and hold the MAXVOICES budget
  // until those ends pass — the page goes silent for that long. 1 s is far
  // above any lookahead that could ever be wanted and far below "the page
  // went quiet". anchorAt is the ONE copy of the clamp the step players use:
  // SFXLOOK ms → [0, LOOK_MAX] (NaN, Infinity and negatives read 0) → seconds,
  // plus the step's own delay — pure math, so a headless check can assert it.
  const LOOK_MAX = 1000;
  const anchorAt = (look, delay) =>
    (Number.isFinite(look) ? Math.min(LOOK_MAX, Math.max(0, look)) : 0) / 1000 + delay;
  // the ONE read of the tuner let. SFXLOOK is a bare `let` in js/game.js, and
  // this file is a separate classic script: a cache skew that serves an OLD
  // game.js (no `let SFXLOOK`) beside a NEW audio.js makes the bare name a
  // ReferenceError on every cue — thrown inside the step players' try, caught
  // as "nothing started", and the page goes silent with no log line to say
  // why. `typeof` on an undeclared name is the one read that cannot throw, so
  // the players read through here and fall back to the shipped 20 ms. The
  // build stamp only helps a tab that re-fetches index.html; the transition
  // publish — old page, new script, or the reverse — is exactly the window.
  const lookMs = () => (typeof SFXLOOK === "number" ? SFXLOOK : 20);
  // ...and the same typed read for every tuner let this file grew AFTER the
  // lookahead: a stale game.js across a deploy must fall to the shipped
  // default, never throw. SFXVARY is the variation toggle (on).
  const varyOn = () => (typeof SFXVARY === "boolean" ? SFXVARY : true);
  // SFXPAN is the stereo width (0.6), clamped to [0, 1] on the read.
  const panWidth = () => (typeof SFXPAN === "number" ? Math.max(0, Math.min(1, SFXPAN)) : 0.6);
  // the ceiling's transfer function — pure math, one copy, so a headless check
  // can assert it: linear to T, then a tanh knee that approaches but never
  // reaches ±1. The node samples it on [-1, 1] (odd length, so x = 0 maps to
  // exactly 0) and clamps its input to that span, so past ±1 the NODE holds
  // the endpoint value while the function keeps creeping toward ±1 — both
  // under 1.0, which is the only claim the ceiling makes.
  const softClipAt = (x, T = 0.8) => {
    const ax = Math.abs(x);
    return ax <= T ? x : Math.sign(x) * (T + (1 - T) * Math.tanh((ax - T) / (1 - T)));
  };
  function softClipCurve(n = 4097) {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = softClipAt((i / (n - 1)) * 2 - 1);
    return c;
  }
  // the master curve as pure math — one copy. sliderGain is what the volume
  // slider's position is worth (game.js prints it as state().gain beside the
  // slider, so the readout cannot drift from the node); masterGain is what the
  // node actually carries, which is that or 0 under the mute switch.
  const sliderGain = () => Math.pow(SFXVOL, 1.6) * MASTER_TRIM;
  const masterGain = () => (SFXMUTE ? 0 : sliderGain());
  // ...and the voices each tier must LEAVE for the tiers above it. The table is
  // keyed by the SPENDER: tier 0 stops at 24 and so hands 8 to tiers 1 and 2,
  // tier 1 stops at 28 and hands 4 to tier 2, and tier 2 — which nothing
  // outranks — spends the lot.
  //   The budget was 16 and was almost certainly never reached: one throttle
  // covered every seat, so a tick could only ever ask for as many cues as it had
  // distinct NAMES. (The live count is not per-tick — a voice is held until its
  // scheduled stop fires onended, so a death carries two of them across the next
  // half-second of ticks — but the gap gate kept the arrival rate low enough
  // that the sum stayed far under 16.) Keying the throttle per seat multiplies
  // the arrivals by the seats in the room, so the budget goes live for the first
  // time — and a flat cap refuses whichever cue happens to ask last. That is the
  // wrong cue to lose: death is two voices over half a second and the only sound
  // in the palette that says the run is over, and it would be refused by the
  // exact line that refuses a wall tick. The reservation is what buys the
  // difference — a tier may spend down to its own floor and no further, so the
  // field's chatter can never starve the five cues that carry what nothing else
  // does.
  const RESERVE = { 0: 8, 1: 4, 2: 0 };
  // the engine band is 40–66 Hz, deliberately narrow and deliberately deep:
  // wide enough that speed still reads in the pitch, narrow enough that the
  // hum never becomes a NOTE the ear tracks. The gain pays for the tight
  // lowpass below — most of the saw's energy dies in that filter, and what
  // survives is the rumble.
  const ENG_GAIN = 0.17, ENG_F0 = 40, ENG_F1 = 26;
  // ---- the AFTERBURNER ------------------------------------------------------
  // Comet mode drives the ONE persistent engine voice harder instead of adding
  // a second one: a new voice would be a new thing to leak, to mute and to
  // stop, and the hum is already the ship's own sound.
  //
  // Three parameters move, and the PITCH is deliberately not among them. The
  // pitch belongs to speed alone — it is the only cue that says how fast this
  // ship is going, and the flat layer keeps its halo and its tail separable
  // for exactly the same reason. What moves instead is the timbre: the lowpass
  // opens so more of the saw's harmonics survive, the resonance at the cutoff
  // rises into a growl, and a floor under the drive means a COASTING comet
  // still rumbles when no thrust is being asked for at all.
  const ENG_BURN_CUT = 110; // Hz the lowpass opens by at a full burn, from 120
  const ENG_BURN_Q = 0.9;   // ...and the resonance it gains there
  const ENG_BURN_DRIVE = 0.55; // the drive floor a burn holds with no flame
  const ENG_BURN_WIND = 0.45;  // ...and the fraction of it a WINDUP reaches, so
                               // the ask is audible and the confirm still lands

  // distance attenuation — the listener is the SHIP, not the camera: the ship
  // is what the sounds are about, and a lookahead camera would otherwise make
  // an enemy quieter for aiming at it. Squared falloff, one hypot per cue; a
  // result of 0 drops the cue before a single node is allocated, so the
  // world's far rooms cost nothing.
  const NEAR = 260;  // px — full volume; about half a viewport
  const FAR = 1100;  // px — silent; past this a body is barely on the corner map
  function att(at) {
    const d = Math.hypot(at.x - localPlayer().ship.x, at.y - localPlayer().ship.y);
    if (d <= NEAR) return 1;
    if (d >= FAR) return 0;
    const k = 1 - (d - NEAR) / (FAR - NEAR);
    return k * k;
  }
  // stereo PAN — the camera never rotates, so the world-x offset from the
  // listener (the same ship att() measures from) maps straight to pan: linear,
  // saturating at ±PAN_FULL, scaled by the width slider. PAN_FULL is 2 × NEAR,
  // "about a viewport" by att()'s own comment — a body at the far edge of the
  // screen sits at the rail, a body behind it is no wider. One subtraction and
  // one clamp per cue, computed once in cue() beside att(). A positionless cue
  // pans 0. Which voices pan is decided per STEP on the resolved bus: shot and
  // foe pan, ui (and the engine, which never passes through here) stay
  // centred — a banner or a till has no place in the world.
  //   NOT a PannerNode and NOT HRTF, both refused: a native distance model never
  // reaches exactly zero, and att() === 0 is the free cull that stops a distant
  // event allocating any node at all; a convolution per voice is a cost the
  // palette's 32-voice budget has no room for. A StereoPannerNode per voice
  // (see the step players for the √2) is the whole mechanism.
  const PAN_FULL = 2 * NEAR; // the stated invariant IS the code — retune NEAR and the rail follows
  function pan(at) {
    const dx = at.x - localPlayer().ship.x;
    return Math.max(-1, Math.min(1, dx / PAN_FULL)) * panWidth();
  }

  // the noise table: four mono half-second buffers of FLAT white noise, built
  // once at the context's real sample rate, filled from hash32 — game.js's
  // own hash — driving the same LCG the starfield and the impact bursts use.
  // No Math.random() anywhere in this file, at init or at cue time. The decay
  // lives in the gain envelope, not in the samples, which is why one flat
  // buffer serves a 35 ms tick and a 400 ms rumble alike — the ancestor baked
  // the decay into the samples and therefore leaked a fresh buffer per call.
  // A plain counter picks the buffer, so two hits in a row are not
  // phase-locked and nothing consults a random stream to achieve it.
  const NOISE_SEED = 0xA53C9D11;
  const NOISE = [];
  let nix = 0;
  const lcgNext = (h) => (Math.imul(h, 1664525) + 1013904223) >>> 0;

  // cue VARIATION — the five repeat cues (flagged `vary` in the table:
  // fire, hit, wall, clang, kill) take a small pitch and level jitter so a
  // barrage reads as many shots rather than one sample looping. Per CUE, not
  // per step: hit's knock and its noise burst must move together or the two
  // halves drift apart into two sounds. The draw comes from the noise table's
  // own generator — hash32 seeded off NOISE_SEED, then the LCG — advanced by
  // its own plain counter (vix): NEVER nix (the noise-buffer pick would then
  // phase-lock to the jitter), NEVER the sim's seeded rand() (one stolen draw
  // moves every group anchor in a replay — section G of the audio checks pins
  // exactly that), and no Math.random() at init or at cue time. The counter
  // advances only when a varied cue reaches the step loop, so a refused cue
  // (gap, far, bus, budget) costs no draw and the sequence is a pure function
  // of the admitted sequence. The authored phrases — clear, buy, denied, warn,
  // death — are excluded by name: they are tuned figures, not repeats.
  const VARY_PITCH = 0.04; // ±4 % on f0 and f1 — under a semitone (5.9 %), so the family still reads
  const VARY_VOL = 0.10;   // ±10 % on every step's vol — under 1 dB, felt as life, not as a mix move
  const VARY_NONE = { pitch: 1, vol: 1 }; // the shared no-op, never mutated
  let vix = 0;
  function varyAt(i) {
    let h = hash32(i, 0, 0, NOISE_SEED);
    h = lcgNext(h);
    const u1 = h / 0x100000000;
    h = lcgNext(h);
    const u2 = h / 0x100000000;
    return { pitch: 1 + (u1 * 2 - 1) * VARY_PITCH, vol: 1 + (u2 * 2 - 1) * VARY_VOL };
  }

  // the cue LOG — the testable heart of the layer. cue() appends one entry at
  // EVERY return point, {name, played, why, t}, whether or not a context even
  // exists, so a headless suite with no audio device, no gesture and no
  // scheduled voice can still assert precisely which sim event asked for
  // which sound and why it did or did not play. Capped; the oldest is shifted.
  const LOG = [];
  const LOG_MAX = 256;
  let played = 0, dropped = 0;

  // the SEAT a cue belongs to, and the one sentinel every seatless caller
  // folds onto. A sentinel rather than a falsy test, because seat 0 is a real
  // seat: `seat || 0` and a bare `seat | 0` both answer 0 for `undefined`,
  // which would alias the audition — the one cue in the page that belongs to
  // no seat — onto whoever is flying seat 0. Finiteness is asked explicitly, so
  // absent and zero can never be the same answer. The sentinel is a STRING and
  // not a number for the same reason: every numeric choice is some seat id, and
  // a key space where "absent" is spelled like a seat is one rename away from
  // the bug this whole change is about.
  const NOSEAT = "none";
  const seatKey = (name, seat) =>
    name + "#" + (Number.isFinite(seat) ? seat | 0 : NOSEAT);

  // per-name, PER-SEAT wall-clock throttles. Wall-clock (ac.currentTime), not
  // tick-counted, deliberately: the loop legitimately runs up to five sim
  // ticks inside one rAF at one audio instant, and coalescing those into one
  // sound is precisely what a throttle is FOR. Per-seat because coalescing
  // stops being right the moment the second sound is somebody ELSE's: keyed by
  // name alone, every seat in a match shared one 45 ms fire gap, and a remote
  // pew 30 ms before yours ate yours. Measured on the live build: 78 of 78 lost
  // own-fire cues were stolen by another seat inside the prior gap — 15–23% of
  // a stock duo's own pews, past 50% in a four-seat melee. The suites do not
  // need audible behavior to test — the LOG records every call either way, and
  // the armed gate keeps them silent regardless.
  const lastAt = Object.create(null);

  // the live-voice list. live counts started node-chains and onended both
  // decrements and disconnects — that is the whole leak story: every voice
  // has a scheduled stop(), so onended always fires, and frame()'s stale
  // sweep covers the browser that loses one.
  const voices = [];
  let live = 0;

  // pickup's melody memory — the only cue with any. Successive banked orbs
  // step up an eight-note run instead of playing twenty copies of one blip;
  // the streak advances only on a PLAYED pickup (a throttled one does not, or
  // the run would skip notes) and resets after 400 ms of silence. Keyed the
  // same way the throttle is, and for the same reason: as two module-level
  // numbers, one player's orbs walked another player's arpeggio, and a run of
  // eight notes shared by four seats is a run nobody hears the shape of.
  const streak = Object.create(null);
  const lastPickupT = Object.create(null);

  // ---- the cue table -------------------------------------------------------
  // two primitives, the ancestor's signatures kept:
  //   ["b", f0, f1, dur, type, vol, delay, bus?]  — beep: swept oscillator
  //   ["n", dur, vol, freq, delay, bus?]          — noise: filtered flat grain
  // gap is the minimum spacing in ms between two cues of this name FROM ONE
  // SEAT (see lastAt above — a remote pew must never eat your own); pri is the
  // admission tier, 0 for the field's chatter that the ear loses nothing by
  // losing one of, 2 for the five cues that carry what nothing else carries,
  // 1 for everything with a cause on screen; the optional trailing bus
  // overrides the cue's bus for that step alone — exactly one cue uses it
  // (test, which exercises all four buses in one press so the sliders balance
  // a MIX rather than a knob). The recipe volumes are the single place a
  // sound is tuned; the bus sliders are trims over them.
  const CUES = {
    // the reference's fire() verbatim — the sound this game's ancestor made.
    // 45 ms gap (not 70): RAPID LOADER caps near 5.5/s at the stock BCOOL,
    // but BCOOL is a live dev slider, and the gap must clear whatever cadence
    // a retuned page fires at.
    fire: { bus: "shot", gap: 45, pri: 0, vary: true, steps: [["b", 880, 380, 0.05, "square", 0.22, 0]] },
    // THE RIFLE, and it is deliberately fire's opposite in the one dimension
    // an ear separates fastest. fire is a short falling square at 880→380;
    // this is a short falling SAWTOOTH an octave and a half above it, over a
    // brief noise edge — bright and hard where the gun is blunt, so a rifle
    // shot inside a held burst of ordinary fire is still countable. Its own
    // 90 ms gap is the ability's own 45-tick cooldown with room to spare, and
    // it stays on the SHOT bus because it is the player's own weapon and must
    // trim with the rest of them. pri 1, one above fire: the rifle costs
    // energy and a cooldown, and a shot the player paid for outranks one of
    // the shots they did not.
    rail: { bus: "shot", gap: 90, pri: 1, vary: true, steps: [["b", 2400, 900, 0.07, "sawtooth", 0.22, 0],
                                                              ["n", 0.03, 0.14, 4200, 0]] },
    // mass meeting a wall; mag carries the flipped component's pre-bounce
    // speed, so a graze whispers and a slam lands.
    thud: { bus: "shot", gap: 90, pri: 0, steps: [["b", 110, 62, 0.10, "sine", 0.30, 0],
                                                  ["n", 0.06, 0.18, 700, 0]] },
    // the reference's bounce(), one notch quieter — a dull tick for something
    // inert being struck, never competing with fire.
    wall: { bus: "shot", gap: 60, pri: 0, vary: true, steps: [["b", 140, 140, 0.03, "square", 0.10, 0]] },
    // the shot landing on a body that lives: a short falling knock UNDER
    // fire's band, triangle where the guns are square — a volley reads
    // guns-high, landings-low, and the kill still owns the only real note.
    // (It was once a bare 35 ms click, and next to fire it read as silence —
    // a landed hit the ear cannot find is a miss.)
    // the volumes sit near kill's on purpose: hit must survive the player's
    // own fire barrage, and the kill moment still outranks it because the
    // killing landing plays BOTH cues in the same instant.
    hit: { bus: "shot", gap: 45, pri: 0, vary: true, steps: [["b", 340, 190, 0.06, "triangle", 0.30, 0],
                                                 ["n", 0.05, 0.20, 1900, 0]] },
    // a bullet stopped dead by the anvil's frontal shield. Deliberately the
    // OPPOSITE of hit in every dimension it has: high and metallic square
    // where hit is a low soft knock — one volley into the
    // front of that body teaches the shield by ear, with nothing on screen.
    clang: { bus: "shot", gap: 45, pri: 0, vary: true, steps: [["b", 1250, 880, 0.05, "square", 0.20, 0],
                                                   ["n", 0.03, 0.12, 3200, 0]] },
    // a missile ending, however it ended — shot down, spent on the hull, run
    // into a wall or burnt out. It sits on the SHOT bus and not on foe because
    // most booms in a run are the player's own bullet killing it, and the
    // falling square between kill and killheavy is what places its mass.
    boom: { bus: "shot", gap: 70, pri: 0, steps: [["b", 230, 80, 0.11, "square", 0.26, 0],
                                                  ["n", 0.09, 0.22, 1100, 0]] },
    // the reference's kill() shape — a falling square plus a burst is a body
    // coming apart.
    kill: { bus: "shot", gap: 55, pri: 1, vary: true, steps: [["b", 300, 110, 0.08, "square", 0.30, 0],
                                                  ["n", 0.05, 0.18, 1500, 0]] },
    // the same gesture an octave down and twice as long: pitch is mass, and
    // the charger is the heavy body.
    killheavy: { bus: "shot", gap: 90, pri: 2, steps: [["b", 190, 70, 0.16, "square", 0.34, 0],
                                                       ["n", 0.13, 0.26, 900, 0]] },
    // the reference's smart() bomb at a tenth: the splash IS a small smart
    // bomb, and sounding like one teaches what was bought.
    blast: { bus: "shot", gap: 90, pri: 1, steps: [["b", 150, 50, 0.14, "sawtooth", 0.24, 0],
                                                   ["n", 0.12, 0.28, 1800, 0]] },
    // a rising saw is "winding up on you"; it starts the tick the lance angle
    // locks, so the sound and the dodge window begin together. 0.32 (from
    // 0.14) is the S-4ew0wr telegraph trade: at the 0.7 foe trim the tell must
    // land NEAR the player's own 0.22 gun (0.32 × 0.7 = 0.224 effective) or a
    // barrage buries the one sound that buys the dodge — paid for INSIDE the
    // bus by cutting zap, measured flat on the audio-duck e4 dart wave.
    charge: { bus: "foe", gap: 60, pri: 1, steps: [["b", 320, 780, 0.16, "sawtooth", 0.32, 0]] },
    // the reference's laser(), shortened — the confirmation a dodged lance
    // otherwise never gives. 0.12 (from 0.20) is the other half of the trade:
    // the beam already firing is information that arrives too late to act on,
    // so it funds the telegraphs above it; 0.10 is its floor — the confirm
    // must stay audible.
    zap: { bus: "foe", gap: 80, pri: 1, steps: [["b", 1400, 700, 0.10, "sawtooth", 0.12, 0]] },
    // the charge gesture an octave and a half lower and twice as long: the
    // bigger telegraph earns the bigger sound, recognisably one family —
    // 0.36 keeps it charge + 0.04 through the trade.
    windup: { bus: "foe", gap: 90, pri: 1, steps: [["b", 80, 190, 0.34, "sawtooth", 0.36, 0]] },
    // a lowpassed whoosh with a falling body under it — mass moving, not
    // energy discharging.
    dash: { bus: "foe", gap: 90, pri: 1, steps: [["n", 0.20, 0.30, 620, 0],
                                                 ["b", 220, 120, 0.16, "triangle", 0.16, 0]] },
    // the harrier's launch reticle closing: windup's rising saw an octave up,
    // half as long and quieter — unmistakably the same family, from the
    // lighter body. It starts the tick the missile's bearing latches, so the
    // sound and the sidestep window begin together, exactly as charge does.
    lock: { bus: "foe", gap: 90, pri: 1, steps: [["b", 160, 380, 0.17, "sawtooth", 0.32, 0]] }, // 0.32 with charge — same trade, same read
    // the missile leaving the rail: dash's whoosh with the body RISING under
    // it instead of falling — this mass is departing, not arriving.
    launch: { bus: "foe", gap: 70, pri: 1, steps: [["n", 0.16, 0.26, 900, 0],
                                                   ["b", 180, 430, 0.14, "triangle", 0.18, 0]] },
    // the reference's spawn(); one cue per GROUP — three darts landing is one
    // event, and the emission site honors that.
    spawn: { bus: "foe", gap: 120, pri: 0, steps: [["b", 200, 300, 0.08, "triangle", 0.16, 0]] },
    // the only warning that the lone body on the edge is a charger.
    spawnheavy: { bus: "foe", gap: 120, pri: 1, steps: [["b", 110, 170, 0.16, "triangle", 0.22, 0]] },
    // the fall says something was lost; the player's i-frames gate repeats
    // for free — hitPlayer returns early while graced.
    hurt: { bus: "foe", gap: 200, pri: 2, steps: [["b", 220, 90, 0.18, "sawtooth", 0.32, 0],
                                                  ["n", 0.12, 0.20, 700, 0]] },
    // the reference's death() verbatim; the only sound over half a second,
    // which is what makes it read as final.
    death: { bus: "foe", gap: 800, pri: 2, steps: [["b", 300, 48, 0.55, "sawtooth", 0.50, 0],
                                                   ["n", 0.40, 0.35, 500, 0]] },
    // the scale replaces f0 with the note this SEAT's run is standing on and
    // f1 with f0 × 1.5 — the cleared-banner orb flood plays a rising arpeggio,
    // and four players flood four of them (see pickupNote).
    pickup: { bus: "ui", gap: 45, pri: 1, scale: [523, 587, 659, 784, 880, 988, 1175, 1319],
              steps: [["b", 523, 785, 0.06, "square", 0.26, 0]] },
    // the one FALLING two-note figure in the palette: alarms fall, rewards rise.
    warn: { bus: "ui", gap: 150, pri: 2, steps: [["b", 660, 660, 0.07, "sine", 0.22, 0],
                                                 ["b", 495, 495, 0.10, "sine", 0.22, 0.08]] },
    // the reference's gateOpen() verbatim — this game's one victory phrase
    // was its ancestor's too.
    clear: { bus: "ui", gap: 600, pri: 2, room: true, steps: [["b", 392, 392, 0.09, "sine", 0.40, 0],
                                                  ["b", 587, 587, 0.11, "sine", 0.40, 0.09],
                                                  ["b", 784, 784, 0.16, "sine", 0.40, 0.20]] },
    // two notes of that triad at half the level: a smaller door than a
    // cleared wave, same family.
    shop: { bus: "ui", gap: 200, pri: 1, steps: [["b", 523, 523, 0.08, "sine", 0.26, 0],
                                                 ["b", 784, 784, 0.12, "sine", 0.26, 0.07]] },
    // the reference's extraShip() tightened — a purchase is a small fanfare.
    buy: { bus: "ui", gap: 80, pri: 1, steps: [["b", 523, 523, 0.10, "triangle", 0.34, 0],
                                               ["b", 659, 659, 0.10, "triangle", 0.34, 0.06],
                                               ["b", 784, 784, 0.14, "triangle", 0.34, 0.12]] },
    // the reference's denied() verbatim. The highest-value cue in the list: a
    // refused purchase previously had no feedback at all.
    denied: { bus: "ui", gap: 120, pri: 1, steps: [["b", 120, 90, 0.14, "square", 0.36, 0]] },
    // the comet REFUSAL, fired at the PRESS EDGE (js/game.js's cometPresTick,
    // with noteCometRetract as the late backstop). It is now the ONLY answer a
    // refused ask gets — the windup ring and the retract collapse were removed
    // — so it has to be heard, not merely present. It used to sit at 110→78 Hz
    // at 0.22 for 0.10 s: a falling square below the range a laptop or monitor
    // speaker reproduces at all, which is why the owner could not hear it.
    // Two octaves up into a register that plays, 60 % longer, and ABOVE
    // denied's 0.36 — this cue answers the pilot's own pool, and the pool is
    // what they are staring at. `gap: 200` is unchanged and is what stops a
    // mashed button from machine-gunning it.
    refuse: { bus: "ui", gap: 200, pri: 1, steps: [["b", 320, 180, 0.16, "square", 0.40, 0]] },
    // the audition: one press exercises all four buses in 0.42 s, and the eng
    // field bumps the engine — the only way to hear it from the paused panel
    // its slider lives on.
    test: { bus: "ui", gap: 350, pri: 1, eng: 0.30,
            steps: [["b", 880, 380, 0.05, "square", 0.22, 0, "shot"],
                    ["b", 320, 780, 0.16, "sawtooth", 0.14, 0.09, "foe"],
                    ["b", 523, 523, 0.09, "triangle", 0.30, 0.24, "ui"],
                    ["b", 784, 784, 0.12, "triangle", 0.30, 0.30, "ui"]] },
  };

  // ---- small shared helpers ------------------------------------------------
  function busFor(tag) {
    return tag === "foe" ? busFoe : tag === "ui" ? busUi : busShot;
  }
  function busLevel(tag) {
    return tag === "foe" ? SFXFOE : tag === "ui" ? SFXUI : SFXSHOT;
  }
  // every return point of cue() lands here, so the log can never miss an exit
  function log(name, ok, why) {
    if (LOG.length >= LOG_MAX) LOG.shift();
    LOG.push({ name, played: ok, why, t: ac ? ac.currentTime : 0 });
    if (!ok) dropped++;
    return ok;
  }
  // master and the three buses read their tuner lets LIVE — written here at
  // every admitted cue and again every frame. setTargetAtTime throughout,
  // never an exponential ramp, because these params legitimately hold 0.
  function applyLevels(now) {
    master.gain.setTargetAtTime(masterGain(), now, 0.02);
    busShot.gain.setTargetAtTime(SFXSHOT, now, 0.02);
    busFoe.gain.setTargetAtTime(SFXFOE, now, 0.02);
    busUi.gain.setTargetAtTime(SFXUI, now, 0.02);
  }
  // the admission arithmetic, as pure math over the live count: cue() calls
  // this and nothing else decides admission, so the __test seam below asserts
  // the exact answer cue() would give with no audio device and no gesture, and
  // the two cannot drift apart because there is only one copy — the same shape
  // engCalc() gives frame(). "budget" is a cue the FULL cap refuses; "reserved"
  // is one only its tier's floor refuses. Both are refusals, both are dropped
  // and logged, and the two names are what make the reservation assertable at
  // all — a single reason could not tell a starved palette from a busy one.
  function admit(pri, want, liveNow) {
    if (liveNow + want <= MAXVOICES - (RESERVE[pri] || 0)) return "ok";
    return liveNow + want > MAXVOICES ? "budget" : "reserved";
  }
  // ...and pickup's note, the same way: the step this seat's run is standing
  // on and the frequency that step names, with the 400 ms reset folded in.
  // Pure — the caller banks the step it was given — so the arpeggio's whole
  // arithmetic is assertable on a page where nothing plays.
  function pickupNote(scale, step, last, now) {
    const s = last !== undefined && now - last > 0.4 ? 0 : step;
    return { step: s, freq: scale[Math.min(s, scale.length - 1)] };
  }

  // one voice comes apart in one place: budget back, nodes disconnected. The
  // indexOf guard makes it idempotent — onended and the stale sweep can both
  // reach the same voice without double-decrementing live.
  function release(v) {
    const i = voices.indexOf(v);
    if (i < 0) return;
    voices.splice(i, 1);
    live = Math.max(0, live - 1);
    for (const n of v.nodes) { try { n.disconnect(); } catch {} }
  }
  // a browser that loses an onended cannot strand budget: anything whose
  // scheduled end is more than 2 s past is forced out here, every frame
  function sweepStale(now) {
    for (let i = voices.length - 1; i >= 0; i--) {
      if (now > voices[i].end + 2) {
        const v = voices[i];
        try { v.nodes[0].stop(); } catch {}
        release(v);
      }
    }
  }

  // ---- the step players ----------------------------------------------------
  // the envelope is the ancestor's, verbatim: setValueAtTime straight into an
  // exponential ramp — no attack stage; the click IS the chiptune transient.
  //   Every envelope is anchored SFXLOOK ms AHEAD of ac.currentTime — t =
  // ac.currentTime + anchorAt(SFXLOOK, delay), clamped to LOOK_MAX — and the
  // whole step derives from that one t, so the envelope moves as a piece. The
  // lead exists for Firefox: its currentTime is a main-thread snapshot that
  // does not advance inside a task, its start()/automation messages reach the
  // graph only at the end of the task, and its timeline evaluates a ramp from
  // the ORIGINAL t0 rather than re-anchoring a past event to the render head
  // as Chromium does. A cue authored mid-frame therefore lost as many device
  // periods of its head as the frame took — measured −8 dB on 73 % of fire
  // cues at 0 ms of lead under a 7 ms frame task, clean at 15 ms. Chrome loses
  // nothing either way and pays the 20 ms. The gap stamp (lastAt) stays on the
  // raw now — the throttle measures when cues were ASKED for, not scheduled.
  // Every gain that touches an exponential ramp is floored at 0.001, because
  // exponentialRampToValueAtTime(0) throws a RangeError (measured). Each body
  // is try/caught so a constructor failing under memory pressure disconnects
  // its partial nodes and reports false — a half-built cue cannot strand
  // budget, because live counts only chains that actually started.
  //   panArg is the trailing pan, a number for a shot/foe step and null for a
  // ui step (or a browser with no StereoPannerNode): a number puts one
  // StereoPannerNode between the envelope gain and the bus, pushed into nodes
  // AFTER index 0 (sweepStale stops nodes[0]) so release() disconnects it.
  //   THE √2. StereoPannerNode is equal-power: at pan 0 each channel carries
  // cos(π/4) = 0.707 of the input, where today's mono voice up-mixes to L = R
  // = x at full level. Without compensation every panned cue lands 3 dB
  // quieter per channel than the mix that was tuned, while the engine (mono,
  // up-mixed) and the ui bus do not — the tuned ratios would be silently
  // invalidated. So a panned voice's envelope starts at vol × √2: at pan 0
  // the per-channel level is IDENTICAL to today, across the arc the power is
  // constant, and at the rail of width 0.6 (θ = 72°) the loud side peaks at
  // √2 · sin 72° = 1.35×. The audio-duck harness's e4 measures what that 1.35×
  // costs at the ceiling's knee per channel — see the oversample comment.
  function startBeep(f0, f1, dur, type, vol, delay, busNode, panArg) {
    let o = null, g = null, p = null;
    try {
      const t = ac.currentTime + anchorAt(lookMs(), delay);
      o = ac.createOscillator();
      g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(Math.max(f0, 1), t);
      o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
      if (typeof panArg === "number" && typeof ac.createStereoPanner === "function") {
        p = ac.createStereoPanner();
        p.pan.value = panArg;
      }
      const gv = p ? vol * Math.SQRT2 : vol;
      g.gain.setValueAtTime(Math.max(0.001, gv), t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      (p ? o.connect(g).connect(p) : o.connect(g)).connect(busNode);
      o.start(t);
      o.stop(t + dur + 0.02);
      const v = { nodes: p ? [o, g, p] : [o, g], end: t + dur + 0.02 };
      voices.push(v);
      live++;
      o.onended = () => release(v);
      return true;
    } catch {
      try { if (o) o.disconnect(); } catch {}
      try { if (g) g.disconnect(); } catch {}
      try { if (p) p.disconnect(); } catch {}
      return false;
    }
  }
  function startNoise(dur, vol, freq, delay, busNode, panArg) {
    if (!NOISE.length) return false; // an exotic sample rate emptied the
                                     // table — noise steps skip, beeps still play
    let src = null, f = null, g = null, p = null;
    try {
      const t = ac.currentTime + anchorAt(lookMs(), delay);
      src = ac.createBufferSource();
      src.buffer = NOISE[nix++ % NOISE.length];
      f = ac.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = freq;
      g = ac.createGain();
      if (typeof panArg === "number" && typeof ac.createStereoPanner === "function") {
        p = ac.createStereoPanner();
        p.pan.value = panArg;
      }
      const gv = p ? vol * Math.SQRT2 : vol;
      g.gain.setValueAtTime(Math.max(0.001, gv), t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      (p ? src.connect(f).connect(g).connect(p) : src.connect(f).connect(g)).connect(busNode);
      src.start(t);
      src.stop(t + dur + 0.02);
      const v = { nodes: p ? [src, f, g, p] : [src, f, g], end: t + dur + 0.02 };
      voices.push(v);
      live++;
      src.onended = () => release(v);
      return true;
    } catch {
      try { if (src) src.disconnect(); } catch {}
      try { if (f) f.disconnect(); } catch {}
      try { if (g) g.disconnect(); } catch {}
      try { if (p) p.disconnect(); } catch {}
      return false;
    }
  }

  // ---- Sfx.cue -------------------------------------------------------------
  // fire one named cue. at is optional — any object with numeric .x/.y in
  // world coordinates, read for attenuation only and never mutated; mag is an
  // optional 0..1 volume factor (only thud passes one — the flipped
  // component's pre-bounce speed, floored so even a graze is a sound and not
  // a rounding error); seat is the seat the event BELONGS to, optional and
  // trailing exactly as it is on the simulation's own emit(kind, at, gain,
  // seat, termSeq) — the throttle and the melody memory are keyed by it, and a
  // caller with no seat behind it (the audition, a screen cue) simply omits it
  // and lands on the seatless sentinel. Returns true only if voices actually
  // started; every caller discards the return — it exists for __test.
  //
  // the gates run in this exact order, and the order is load-bearing: mute
  // sits ABOVE the context checks precisely so a headless suite with no
  // context at all can still observe the mute gate through the log.
  function positionAt(rec, at) {
    let factor = 1, stereo = 0;
    if (!rec.room && at && Number.isFinite(at.x) && Number.isFinite(at.y)) {
      factor = att(at);
      if (factor !== 0) stereo = pan(at);
    }
    return { far: factor === 0, factor, pan: stereo };
  }
  function peakAt(steps, bus, k, panComp, varyHi) {
    let peak = 0;
    for (const s of steps) {
      const tag = (s[0] === "b" ? s[7] : s[5]) || bus;
      peak = Math.max(peak, (s[0] === "b" ? s[5] : s[2]) * k * varyHi * (tag === "ui" ? 1 : panComp));
    }
    return peak;
  }
  function cue(name, at, mag, seat) {
    try {
      const rec = CUES[name];
      if (!rec) return log(name, false, "unknown");
      if (SFXMUTE || SFXVOL <= 0) return log(name, false, "mute");
      if (dead) return log(name, false, "dead");
      if (!ac) return log(name, false, "idle");
      if (ac.state !== "running") return log(name, false, "suspended");
      if (!armed) return log(name, false, "unarmed");
      const now = ac.currentTime;
      const key = seatKey(name, seat);
      const last = lastAt[key];
      if (last !== undefined && (now - last) * 1000 < rec.gap) return log(name, false, "gap");
      let k = Number.isFinite(mag) ? Math.max(0.15, Math.min(1, mag)) : 1;
      const position = positionAt(rec, at);
      if (position.far) return log(name, false, "far"); // nothing was allocated
      k *= position.factor;
      const p = position.pan; // 0 for a room/positionless cue; the ui gate is per step, below
      // the bus gate reads each step's EFFECTIVE bus — the per-step override
      // when one carries one, the recipe's bus otherwise, the same resolution
      // the step loop below uses. test is why the distinction matters: its
      // steps fan out across three buses, and gating on its declared "ui"
      // alone meant one zeroed slider dropped the whole audition — the exact
      // deaf-knob state the audition exists to prevent. A step whose own bus
      // sits at 0 is filtered out here once, so the budget never reserves
      // voices for it and the peak scan never counts a leg nobody can hear.
      const liveSteps = rec.steps.filter(
        (s) => busLevel((s[0] === "b" ? s[7] : s[5]) || rec.bus) > 0);
      if (!liveSteps.length) return log(name, false, "bus");
      const adm = admit(rec.pri, liveSteps.length, live);
      if (adm !== "ok") return log(name, false, adm);
      // a cue whose loudest step lands at or under the envelope floor would
      // schedule voices nobody can hear — skip it whole, same as too far. The
      // estimate is the level the step players below actually SCHEDULE: the
      // step's vol × k, × √2 for a step that will get a panner (every
      // non-ui step, when the context has one — the same condition
      // startBeep/startNoise test, and the same Math.max(0.001, …) floor
      // they clamp the envelope's start at), and × the vary factor's UPPER
      // bound when this cue varies. The bound, not the draw: the draw is
      // taken AFTER admission (vix advances only for cues that reach the
      // step loop — the sequence comment above), and a cull must err toward
      // playing — a cue is dropped here only if even its loudest possible
      // outcome sits at the floor, never for a draw that might have been
      // audible.
      const panComp = typeof ac.createStereoPanner === "function" ? Math.SQRT2 : 1;
      const varyHi = rec.vary && varyOn() ? 1 + VARY_VOL : 1;
      const peak = peakAt(liveSteps, rec.bus, k, panComp, varyHi);
      if (peak <= 0.001) return log(name, false, "far");
      applyLevels(now); // the knobs are live — an admitted cue plays at the
                        // sliders' CURRENT values, not last frame's
      // pickup's melody memory resolves before any step schedules — this
      // seat's run, never the room's
      let scaleF = 0, scaleStep = 0;
      if (rec.scale) {
        const note = pickupNote(rec.scale, streak[key] || 0, lastPickupT[key], now);
        scaleStep = note.step;
        scaleF = note.freq;
      }
      // the variation draw, once per admitted cue (see varyAt) — the pitch
      // factor rides the beep's f0/f1 (the scale-driven pickup is not varied
      // and keeps its note), the level factor rides every step's vol
      const v = rec.vary && varyOn() ? varyAt(vix++) : VARY_NONE;
      let started = false;
      for (const s of liveSteps) {
        // the step's bus tag is resolved ONCE: it picks the bus node and gates
        // the pan — a ui step gets null (no panner, the mono path exactly as
        // before), a shot or foe step the cue's pan
        if (s[0] === "b") {
          const tag = s[7] || rec.bus;
          const f0 = (rec.scale ? scaleF : s[1]) * v.pitch;
          const f1 = (rec.scale ? scaleF * 1.5 : s[2]) * v.pitch;
          if (startBeep(f0, f1, s[3], s[4], s[5] * k * v.vol, s[6] || 0, busFor(tag),
                        tag === "ui" ? null : p)) started = true;
        } else {
          const tag = s[5] || rec.bus;
          if (startNoise(s[1], s[2] * k * v.vol, s[3], s[4] || 0, busFor(tag),
                         tag === "ui" ? null : p)) started = true;
        }
      }
      if (!started) return log(name, false, "failed"); // every constructor
                        // refused (rung 8/9) — lastAt is NOT stamped, so the
                        // next attempt is not throttled against a silence
      lastAt[key] = now;
      played++;
      if (rec.scale) { streak[key] = scaleStep + 1; lastPickupT[key] = now; }
      // the audition's engine bump: ramp up and back, and hold frame() off
      // the param until the ramp is over — the only thing that makes the
      // engine audible from the paused dev panel, where its slider lives.
      // The bump must re-arm the dead-man too, because the panel is only
      // reachable while paused and a paused page renders once per transition:
      // by the time a slider is touched, frame()'s last 400 ms ramp has long
      // since landed engWatch on exactly 0, and an engDyn ramp alone would
      // multiply into digital silence. So the audition owns BOTH gains it
      // depends on — the watch is held wide open through the bump and then
      // given the same 400 ms fade, which keeps the dead-man's guarantee
      // intact with no frames running at all; the next render's frame()
      // overwrites this schedule exactly as it always did.
      if (rec.eng && engDyn && engWatch) {
        engDyn.gain.cancelScheduledValues(now);
        engDyn.gain.setTargetAtTime(rec.eng * SFXENG, now, 0.04);
        engDyn.gain.setTargetAtTime(0, now + 0.4, 0.06);
        engHold = now + 0.55;
        engWatch.gain.cancelScheduledValues(now);
        engWatch.gain.setValueAtTime(1, now);
        engWatch.gain.setValueAtTime(1, engHold);
        engWatch.gain.linearRampToValueAtTime(0, engHold + 0.4);
      }
      return log(name, true, "ok");
    } catch {
      return false;
    }
  }

  // ---- Sfx.unlock ----------------------------------------------------------
  // idempotent, and the only place the context is ever constructed or
  // resumed. Called from exactly two real-gesture paths: the top of game.js's
  // resume() (the page's one entry gesture — above its frozen branch, so a
  // death-screen click arms audio too) and the audio tab's audition(). The
  // arming line is the conjunction the measurements demand: an automation
  // flag can produce a RUNNING context with no gesture, and a synthetic
  // resume() from a suite carries no user activation — so ac.state is never
  // trusted alone. A browser too old to have the API is trusted, because
  // every caller of unlock() is a real-gesture path in normal play.
  function unlock() {
    try {
      if (dead) return;
      if (!ac) {
        if (!window.AudioContext) { dead = true; return; }
        // a is hoisted above its try so the catch can still reach it: once
        // the constructor has succeeded the ua owns a render thread and an
        // output stream, and dropping the last reference is not defined to
        // release either — close() is the only defined hand-back
        let a = null;
        try {
          a = new AudioContext();
          master = a.createGain();
          master.gain.value = masterGain();
          master.connect(a.destination);
          ceiling = a.createWaveShaper();
          ceiling.curve = softClipCurve();
          ceiling.oversample = "none"; // memoryless and cheap — and the S-4ew0wr
                                       // unit-3 mix pass RE-MEASURED it (the revisit
                                       // the old comment demanded): at the new
                                       // defaults (SFXFOE 0.7, SFXENG 0.5) the
                                       // four-seat e2 melee peaks 0.62–0.69
                                       // pre-master against 0.82 before the trim —
                                       // UNDER the 0.8 knee now, where the old
                                       // defaults just reached it. The in-bus
                                       // telegraph trade (charge/lock 0.14 → 0.32,
                                       // windup 0.20 → 0.36, paid for by zap
                                       // 0.20 → 0.12) spent none of that headroom:
                                       // the telegraph-heavy e4 dart wave measures
                                       // knee engagement 0 % both before and after
                                       // the trade (pre-master peak 0.42–0.44 trim-
                                       // only vs 0.41–0.42 traded), and with pan
                                       // 0.6 the louder channel still peaks 0.43,
                                       // engagement 0 % per channel. So the knee is
                                       // now pure insurance and oversampling it
                                       // buys nothing. The master still sits
                                       // DOWNSTREAM, so only bus and cue levels can
                                       // ever drive it — a future raise re-runs
                                       // the audio-duck e2/e4 pair before it ships
          ceiling.connect(master);
          busShot = a.createGain(); busShot.gain.value = SFXSHOT; busShot.connect(ceiling);
          busFoe = a.createGain(); busFoe.gain.value = SFXFOE; busFoe.connect(ceiling);
          busUi = a.createGain(); busUi.gain.value = SFXUI; busUi.connect(ceiling);
          engOsc = a.createOscillator();
          engOsc.type = "sawtooth"; // the harmonics are the point: small
                                    // speakers cannot voice a 40 Hz fundamental,
                                    // so the 80/120 Hz partials ARE the engine
                                    // on a laptop; a sine here would vanish
          engOsc.frequency.value = ENG_F0;
          engFilt = a.createBiquadFilter();
          engFilt.type = "lowpass";
          engFilt.frequency.value = 120; // this cutoff is what makes the saw a
                                         // RUMBLE instead of a synth-bass note —
                                         // it was 360, which passed enough
                                         // harmonics to give the hum a pitch
                                         // the ear could sing along to
          engFilt.Q.value = 1.1; // a hint of resonance at the cutoff — the
                                 // "thrum" of a body, not a filter sweep
          engDyn = a.createGain();
          engDyn.gain.value = 0; // silent until frame() drives it off the flame
          engWatch = a.createGain();
          engWatch.gain.value = 1;
          engOsc.connect(engFilt).connect(engDyn).connect(engWatch).connect(ceiling);
          engOsc.start();
          ac = a; // assigned LAST — a throw above leaves the ac binding null,
                  // and the catch closes the context it belonged to
        } catch {
          // the partial NODE graph is discarded, never used — but a context
          // that constructed before a later node threw is a live resource,
          // not garbage, so it is close()d rather than dropped; the promise
          // is swallowed the same way unlock() swallows resume()'s. dead is
          // permanent — no retry, no console noise, the page simply has no
          // audio
          try {
            const p = a && a.close();
            if (p && typeof p.catch === "function") p.catch(() => {});
          } catch {}
          master = ceiling = busShot = busFoe = busUi = null;
          engOsc = engFilt = engDyn = engWatch = null;
          ac = null;
          dead = true;
          return;
        }
        // the noise table gets its own try: createBuffer failing at an exotic
        // sample rate must cost the noise steps alone, not the whole layer
        try {
          for (let i = 0; i < 4; i++) {
            const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.5), ac.sampleRate);
            const d = buf.getChannelData(0);
            let h = hash32(i, 0, 0, NOISE_SEED);
            for (let j = 0; j < d.length; j++) {
              h = lcgNext(h);
              d[j] = (h / 0x100000000) * 2 - 1;
            }
            NOISE.push(buf);
          }
        } catch { NOISE.length = 0; }
      }
      if (ac.state === "closed") { dead = true; return; } // a closed context
                        // cannot resume, and a second one is the leak we refuse
      if (!armed) armed = navigator.userActivation ? navigator.userActivation.isActive : true;
      const p = ac.resume(); // fire and forget — headless, this promise
                             // measurably never settles; never await it
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  // ---- Sfx.frame -----------------------------------------------------------
  // the observer, called once at the end of render() — the draw path, never
  // step(), so five coalesced sim ticks cost one param write and a suite's
  // advance() never touches audio at all. It refreshes the live levels,
  // re-arms the dead-man, sweeps stale voices, and drives the engine.
  //
  // THE HUM IS THE FLAME: m, len and the 1.5 px floor below are drawFlame()'s
  // own curve and early-return reused rather than re-invented, so the engine
  // is audible on exactly the frames the flame is drawn and saturates at
  // exactly the thrust where the visible tongue stops growing. Pitch rides
  // SPEED, not thrust, so braking at top speed still sings while easing away
  // from rest does not.
  //
  // what stops it droning, four independent ways: this gate, re-evaluated
  // every frame (pause renders once on the transition, so the ease lands on
  // zero; the shop and the death screen keep G.running true but frozen()
  // catches both, and the loop keeps rendering there); the dead-man watch
  // below; visibilitychange, which already routes through game.js's pause()
  // — this file registers NO listener of its own and needs none; and a page
  // that never started, which has no context and no oscillator at all.
  // The engine's WHOLE drive calculation, as pure math over live state: no
  // node is touched here, so the __test seam below can assert every one of
  // these numbers with no audio device and no user gesture, and frame() and
  // that seam are structurally unable to drift apart because there is only
  // one copy. Throws are the caller's to answer — both callers guard.
  //
  // The comet term reads game.js's cometView, which is the SAME presentation
  // owner the halo, the light layer's bloom, the wake and the HUD bar read.
  // That is the deliberate choice: frame() otherwise reads LIVE struct state,
  // and reading the struct's comet flag here would make the rumble arrive on
  // the wire's clock while every visual on the screen arrived on the
  // predictor's. A cue that leads the visuals by the same prediction is
  // consistent; one that mixes the two sources is not.
  function engCalc() {
    const on = armed && G.running && !SFXMUTE
            && !(window.Encounter && Encounter.frozen());
    const m = Math.hypot(localPlayer().flame.x, localPlayer().flame.y); // the SAME vector drawFlame reads
    const len = Math.min(m * FLAME_GAIN, FLAME_MAX);  // ...through drawFlame's own curve
    const drive = len < 1.5 ? 0 : len / FLAME_MAX;    // ...and its own visibility gate
    // the LOCAL seat's own cap (the same ship whose flame and velocity feed
    // this hum), through the one term derivation
    const cap = VMAX + (window.Encounter ? Encounter.termsFor(localSeat()).speed : 0);
    const sp = Math.min(1, Math.hypot(localPlayer().vel.x, localPlayer().vel.y) / Math.max(0.001, cap));
    const cv = cometView(localSeat());
    const burn = cv.phase === CP_LIVE ? 1
               : cv.phase === CP_WIND ? ENG_BURN_WIND * cv.wind : 0;
    return { on, drive, burn,
      gain: ENG_GAIN * Math.min(1, drive + ENG_BURN_DRIVE * burn),
      cut: 120 + ENG_BURN_CUT * burn,
      q: 1.1 + ENG_BURN_Q * burn,
      freq: ENG_F0 + ENG_F1 * sp };
  }

  function frame() {
    try {
      if (!ac || ac.state !== "running") return;
      const now = ac.currentTime;
      applyLevels(now);
      // the dead-man: re-armed every frame; if frames stop for ANY reason — a
      // backgrounded tab that never fired visibilitychange, a devtools pause,
      // a crashed loop — the engine fades to silence inside 400 ms and stays
      // there. Nothing has to notice the failure for the failure to be silent.
      engWatch.gain.cancelScheduledValues(now);
      engWatch.gain.setValueAtTime(1, now);
      engWatch.gain.linearRampToValueAtTime(0, now + 0.4);
      sweepStale(now);
      if (now < engHold) return; // an audition owns the engine ramp — do not stomp it
      const E = engCalc();
      engDyn.gain.setTargetAtTime(E.on ? E.gain * SFXENG : 0, now, 0.05);
      engOsc.frequency.setTargetAtTime(E.freq, now, 0.08);
      // the afterburner's two timbre writes. Slower constants than the gain
      // ramp on purpose: a filter that snapped with the flag would click, and
      // the burn is a thing the ship LEANS into over a breath. They ramp back
      // to the stock 120 Hz / 1.1 whenever the burn is 0, so a page that never
      // touches comet mode holds exactly the voice it had before.
      engFilt.frequency.setTargetAtTime(E.cut, now, 0.09);
      engFilt.Q.setTargetAtTime(E.q, now, 0.12);
    } catch {}
  }

  // ---- Sfx.state -----------------------------------------------------------
  // line is a ready-made lowercase readout for showTuner() — game.js never
  // formats audio internals, it prints this string beside the audition button.
  function state() {
    try {
      let line, ctxs;
      if (dead) {
        line = "unavailable — this browser has no audiocontext";
        ctxs = "unavailable";
      } else if (!ac) {
        line = "idle — audio starts on the first click";
        ctxs = "none";
      } else if (ac.state === "running") {
        line = "running · master " + masterGain().toFixed(3);
        ctxs = "running";
      } else if (ac.state === "closed") {
        line = "closed";
        ctxs = "closed";
      } else { // suspended, or ios's "interrupted" — the next gesture wakes it
        line = "suspended — click the field to wake it";
        ctxs = ac.state;
      }
      // gain is the slider's worth as pure math, whatever the context's state
      // and mute aside (mute has its own readout) — game.js prints it beside
      // the volume slider, so the readout and the node share one curve
      return { line, ctx: ctxs, armed, voices: live, played, dropped, gain: sliderGain() };
    } catch {
      return { line: "unavailable — this browser has no audiocontext",
               ctx: "unavailable", armed: false, voices: 0, played, dropped, gain: 0 };
    }
  }

  // ---- publish — one namespace, one assignment -----------------------------
  window.Sfx = { cue, unlock, frame, state };

  // the test surface, hung off window.__test exactly as encounter.js hangs
  // enc — game.js creates __test at its tail, which is the whole reason this
  // file loads last. The log-first design means every assertion below works
  // headless: no audio device, no gesture, no scheduled voice required.
  Object.assign(window.__test, {
    audio: {
      cue, unlock, frame, state,             // the public four, same functions
      log: () => LOG.slice(),                // a copy — checks compare freely
      clearLog: () => { LOG.length = 0; },
      names: () => Object.keys(CUES),
      recipe: (n) => CUES[n],                // the table itself — read, never copied
      position: positionAt,                  // room identity and the live distance cull, one body
      peak: peakAt,                          // the live audibility-floor estimate, pure math
      levels: () => ({ SFXVOL, SFXMUTE, SFXSHOT, SFXFOE, SFXUI, SFXENG, SFXLOOK: lookMs(),
                       SFXVARY: varyOn(), SFXPAN: panWidth() }),
      look: lookMs,                          // the read the step players make — the skew fallback, assertable
      // the ceiling's transfer function (the math the curve is sampled from —
      // the node clamps past ±1, see softClipAt) and the master trim, as the
      // pure math unlock() and applyLevels() use — assertable with no context
      curveAt: softClipAt,
      trim: () => MASTER_TRIM,
      // the envelope anchor as the step players compute it — the clamp is the
      // only part of the lookahead a page with no gesture can ever observe
      anchor: (look, delay) => anchorAt(look, delay),
      stats: () => ({ played, dropped, live }),
      armed: () => armed,                    // the user-activation gate, readable
      att: (x, y) => att({ x, y }),          // the rolloff, assertable as pure math
      pan: (x, y) => pan({ x, y }),          // the stereo position, the same way
      // the variation draw as the pure function cue() calls, and the names it
      // applies to — the bounds, the determinism and the exclusion list are
      // all assertable on a page where nothing plays
      vary: varyAt,
      varied: () => Object.keys(CUES).filter((n) => CUES[n].vary),
      // THE calc frame() uses — the same function, not a copy of it — off live
      // G, so a check can assert the hum-is-the-flame invariant and the whole
      // afterburner with no audio device and no gesture
      engine: () => {
        try { return engCalc(); }
        catch {
          return { on: false, drive: 0, burn: 0, gain: 0,
                   cut: 120, q: 1.1, freq: ENG_F0 };
        }
      },
      // the three decisions cue() makes below the context gates, as the very
      // functions it calls — a page with no audio device can never drive a cue
      // past "idle", so this seam is the only way those rungs are assertable
      // at all, and being the single copy is what keeps the assertion honest
      key: seatKey,
      admit,
      note: pickupNote,
      resetThrottles: () => {
        for (const k in lastAt) delete lastAt[k];
        for (const k in streak) delete streak[k];
        for (const k in lastPickupT) delete lastPickupT[k];
      },
    },
  });
})();
