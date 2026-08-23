"use strict";

// js/palette.js — THE PALETTE. The one place a game colour is spelled.
//
// Two tables, because the game paints in TWO passes and they do not share a
// spelling. `flat` is the ink the flat pass lays down (js/game.js reads it as
// `C`, and js/encounter.js and js/net.js read it through the same name). `hot`
// is the light layer's own palette (js/fx.js reads it as `PAL`): warmer and
// brighter than the flat pass, because light reads as light only when it sits
// above the ink it surrounds. A colour that means the same thing in both
// passes is therefore usually TWO DIFFERENT BYTES, and that is deliberate —
// borrowing the flat ink for a light cools the mark while every flame beside
// it stays hot. That shipped once, in the clay era; it is why the two tables
// are named apart instead of merged.
//   Where the two passes genuinely agree (steel, dim), `hot` REFERENCES the
// flat entry rather than re-typing the byte. Every byte in the game's palette
// is written down exactly once in this file.
//
// LOAD ORDER, and why this file is not a sim file. index.html loads this
// FIRST, ahead of js/abilities.js, so every consumer sees it. The headless sim
// host (server/sim-host.mjs) loads only the four SIM_FILES and NOT this one:
// the sim never draws, colour never reaches a hashed field, and adding a fifth
// file to that list would ship a render script to the VPS. js/game.js
// therefore reads this table through a `typeof PALETTE` guard and falls back
// to an empty object under the vm — see the `C` declaration there.
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
    gold: "#f2cf4a",  // tier 3's plate — the owner chose yellow over red: hue
                      // distance beats a heat ramp beside cyan and steel
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
