"use strict";

// js/palette.js — THE PALETTE. The one place a game colour is spelled.
//
// THREE tables since D46 (PORT-L), because the game paints in TWO passes and
// hosts a THIRD plane, and none of them shares a spelling. `flat` is the ink the
// flat pass lays down (js/game.js reads it as `C`, and js/encounter.js and
// js/net.js read it through the same name). `hot` is the light layer's own
// palette (js/fx.js reads it as `PAL`): warmer and brighter than the flat pass,
// because light reads as light only when it sits above the ink it surrounds.
// `demo` is the demo plane's table — the eleven bytes js/demo-render.js paints
// the kernel's bodies, rounds, stars and particles with, plus their RGB triples;
// `hot.kernel` is the same eleven, nested, for the light layer's kernel halos. A colour that means the same thing in both
// passes is therefore usually TWO DIFFERENT BYTES, and that is deliberate —
// borrowing the flat ink for a light cools the mark while every flame beside
// it stays hot. That shipped once, in the clay era; it is why the two tables
// are named apart instead of merged.
//   Where the two passes genuinely agree (steel, dim), `hot` REFERENCES the
// flat entry rather than re-typing the byte. Every byte these two tables carry
// is therefore written down exactly ONCE, here — but the tables are not the
// whole page. Colour that is out of the palette's scope still lives at its own
// site by design, and a retune must sweep those sites BY HAND. Grep the byte
// — line numbers drift, the bytes do not:
//   #9aa3b2 — js/game.js (a star row, the wall burst, the death-shatter
//             shard tint in drawShipBlasts); js/encounter.js (the arrow ink,
//             the scoreboard row); js/net.js (the banner's own CSS and its
//             plain state); index.html (the dev-panel and menu text)
//   #d97757 — js/net.js (the banner's accent state); index.html (the slider
//             and button accent, the live tab's border); js/abilities.js (the
//             rifle round's `ink`, a SIM file, held equal to flat.clay by a
//             pin in server/names.test.mjs)
//   #313a4e — js/net.js (the banner's border); index.html (the panel borders)
// index.html is the largest of these by site count and the easiest to forget,
// because a stylesheet is not a script: the page's own CSS is DOM chrome, the
// same scope js/net.js's banner sits in, and no `C` lookup can reach it.
// The claim this file makes is single-sourcing WITHIN C, PAL and the demo
// plane, not that no byte is spelled anywhere else. Two more copies of the demo
// `dark` byte live in page CSS (test/tools/demo-parity.html, demo-capture.html),
// and index.html carries SEVEN distinct hex bytes where the sweep above names
// three; js/game.js's three bare hull plates (#7fb2f0, #8fd18a, #c99adf) are a
// fourth site. They are named here, not fixed here.
//
// ONE CONSUMER IS UNGUARDED ON PURPOSE: js/fx.js:88 `const PAL = PALETTE.hot;`
// has no `typeof` guard and says why at its own site. js/fx.js never enters a
// sandbox, so the guard would only hide a load-order break. js/game.js and
// js/demo-render.js DO guard, because both run under a vm that omits this file.
//
// LOAD ORDER, and why this file is not a sim file. index.html loads this
// FIRST, ahead of js/abilities.js, so every consumer sees it. The headless sim
// host (server/sim-host.mjs) loads the SIM_FILES and NOT this one: the sim never
// draws, colour never reaches a hashed field, and adding a RENDER script to that
// list would ship one to the VPS. THE COUNT IS DELIBERATELY NOT WRITTEN HERE —
// this comment said "the four SIM_FILES" and "a fifth file", and the list has
// been SIX since R5 and is SEVEN since PORT-S S3b. The claim that matters is
// membership, not arity, and the one authority on membership is that literal.
// js/game.js
// therefore reads this table through a `typeof PALETTE` guard and falls back
// to an empty object under the vm — see the `C` declaration there.
// D46 (PORT-L) — THE DEMO PLANE'S TABLE. `js/demo-kernel.js:25-41` spells these
// eleven bytes and their nine RGB triples, and it KEEPS its literal: the
// precedent is written down at server/names.test.mjs:635-640 for js/abilities.js's
// `ink` — deriving it would put a render-only table under the vm loader — so the
// literal stays and a SOURCE alarm in server/names.test.mjs holds the two equal
// byte for byte. This table is declared ABOVE `PALETTE` because `PALETTE.flat`
// is an object literal and cannot reference a key of the object it is being
// built into; `PALETTE.demo` is assigned from here after the literal closes.
const DEMO_PALETTE = {
  ink: "#f7f8ff",
  cyan: "#74f5ff",
  blue: "#55aaff",
  magenta: "#ff4ead",
  violet: "#a879ff",
  red: "#ff626e",
  orange: "#ff9b63",
  gold: "#ffe07a",
  green: "#77ffbc",
  dim: "#313854",
  dark: "#050711",
  RGB: {
    ink: [247, 248, 255],
    cyan: [116, 245, 255],
    blue: [85, 170, 255],
    magenta: [255, 78, 173],
    violet: [168, 121, 255],
    red: [255, 98, 110],
    orange: [255, 155, 99],
    gold: [255, 224, 122],
    green: [119, 255, 188],
  },
};

const PALETTE = {
  flat: {
    pageBg: "#12151f",
    fieldBg: "#0e1119",
    wall: "#313a4e",
    bright: "#f2f3f5",
    clay: "#d97757",
    dim: "#5c6370",
    radar: "#4fd1c5", // the radar variants' sensor cyan — reads as "looks ahead",
                      // and collides with nothing: clay is attack, steel is hull
    steel: "#9aa3b2", // the tier-1 enemy PLATE — the byte every body always wore,
                      // named so the tier ink lookup holds no bare literal
    gold: DEMO_PALETTE.gold, // tier 3's plate — the owner chose yellow over red:
                      // hue distance beats a heat ramp beside cyan and steel.
                      // D46 (PORT-L) resolves the drift to the DEMO byte
                      // (#ffe07a, was #f2cf4a). THIS ROW HAS ZERO READERS today
                      // — every C.gold in the tree is js/demo-render.js, where
                      // `C` is the demo table — so the change moves no pixel. It
                      // is the LAW landing, not a retune.
  },
  hot: null, // filled below, so the equal-byte entries can reference `flat`
};
PALETTE.hot = {
  clay: "#ff8a4a",
  radar: "#3ef2dd",
  bright: "#ffffff",
  steel: PALETTE.flat.steel, // the two passes agree on the hull grey: one byte,
  dim: PALETTE.flat.dim,     // referenced, never a second spelling to drift
  gold: "#ffdf6b", // tier 3's hot twin of the flat gold — an ESTIMATE the
                   // owner judges under bloom
};
PALETTE.demo = DEMO_PALETTE;
// D44 (PORT-L) — the light layer's KERNEL hues, nested under `hot` so no demo
// byte collides with a flat name (`dim` is #313854 here and #5c6370 there). It
// is NESTED and never merged: js/fx.js looks a body's colour NAME up in
// PAL.kernel, and a merged table would let a hue named `kernel` resolve to an
// object. The eleven bytes come from DEMO_PALETTE, so they are still spelled
// once. RGB does not travel here — the light layer takes hex strings only.
PALETTE.hot.kernel = {
  ink: DEMO_PALETTE.ink,
  cyan: DEMO_PALETTE.cyan,
  blue: DEMO_PALETTE.blue,
  magenta: DEMO_PALETTE.magenta,
  violet: DEMO_PALETTE.violet,
  red: DEMO_PALETTE.red,
  orange: DEMO_PALETTE.orange,
  gold: DEMO_PALETTE.gold,
  green: DEMO_PALETTE.green,
  dim: DEMO_PALETTE.dim,
  dark: DEMO_PALETTE.dark,
};
