// ─────────────────────────────────────────────────────────────────────────────
//  Settings for Air Hero: how the game looks, how strict it is, and what counts as a tap.
//  The songs are in ./songs.js (add your own there). game.js is the machinery.
// ─────────────────────────────────────────────────────────────────────────────

// How a fingertip hits a note: if it's over the note's circle when the note lands, the note is hit. You can hold a
// finger on a circle for several notes in a row.
export const tap = {
  size: 1.25, // how big the hit area is compared with the circle you see (bigger = easier to hit)
  latency: 0.1, // seconds the camera and hand tracking run behind real life; your finger counts from this long ago.
  // If hits feel late even when you're on the beat, raise it a little; if they feel early, lower it.
};
// Which fingertips can tap: 8 = index finger. Add 12 (middle) or 4 (thumb) to tap with more fingers.
export const fingers = [8];

// The highway: where the lanes sit across the stage at the hit line (fractions of the width), and where the hit line is.
export const lanes = { left: 0.14, right: 0.86, topWidth: 0.35 }; // topWidth: how narrow the far end looks
export const hitLine = 0.82;

// How long a note takes to fall from the top to the hit line (seconds). Longer = easier to read.
export const fallSeconds = 2.3;

// How close to the beat a tap has to be (seconds either side) for Perfect and Good. Bigger = easier.
export const windows = { perfect: 0.1, good: 0.22 };
export const points = { perfect: 100, good: 50 };
export const comboStep = 10; // every this many hits in a row, the multiplier goes up by one (up to 4×)

// The count-in before the song starts, in beats.
export const countIn = 4;

// The look.
export const laneColors = ["#3ddc84", "#ff4d5e", "#ffd23f", "#4d9dff", "#ff9a3d"];
export const dimCamera = 0.5;

// Keyboard: these keys play the lanes from left to right (for practice, or without a camera). Enter starts, Escape stops.
export const keys = ["a", "s", "d", "f", "g"];

// Sound (in dB): the notes you play, the backing drums, and a quiet note when you tap with nothing there.
export const volume = { notes: -6, drums: -14, stray: -20 };
