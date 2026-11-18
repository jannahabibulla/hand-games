// ─────────────────────────────────────────────────────────────────────────────
//  THE FILE TO CHANGE for Cross the Road: a road-crossing game you play with one hand.
//  Swipe your hand to aim the arrow; pinch (thumb to index finger) to hop that way. Save and the page updates.
//  game.js is the machinery (camera, swipes, pinches, the world, drawing).
// ─────────────────────────────────────────────────────────────────────────────

// A swipe: your hand moving at least `distance` (fraction of the stage height) within `time` seconds. It follows
// the base of your index finger (the knuckle), so pinching doesn't move the arrow.
// After a swipe, wait `cooldown` seconds before the next counts.
export const swipe = { distance: 0.12, time: 0.3, cooldown: 0.35 };

// A pinch hops: touch your thumb to your index fingertip. It counts as a pinch when the gap between them is below
// `on` (compared with the size of your palm), and as let go above `off`; let go before pinching again.
// If pinches don't register, raise `on` a little (0.3); if hops happen by themselves, lower it (0.2).
export const pinch = { on: 0.25, off: 0.35 };

// true = a swipe hops right away, no pinching needed (faster, harder to control).
export const swipeHops = false;

// The world.
export const rowsVisible = 9; // how many rows fit on screen, top to bottom
export const hopSeconds = 0.14; // how long one hop takes
export const chances = { road: 0.45, river: 0.2 }; // the rest are grass
export const trees = 0.18; // how crowded the grass is with trees (0–0.4)
export const traffic = { slowest: 1.2, fastest: 3.2, logsSlowest: 0.8, logsFastest: 1.8 }; // cells per second
export const speedUp = { every: 25, by: 0.1 }; // every 25 rows, everything moves 10% faster

// The look.
export const colors = {
  grass: ["#8ad35e", "#7cc653"],
  tree: "#2f7d32",
  trunk: "#6d4c2f",
  road: "#4a4a55",
  stripe: "#e8e8e8",
  water: "#4fb3ff",
  log: "#9a6b3f",
  cars: ["#ff5b5b", "#ffb13b", "#4d7cff", "#b05bff", "#2ec4b6", "#ff7ac6"],
  chicken: "#ffffff",
  comb: "#ff3b3b",
  beak: "#ffa21f",
};
export const showCamera = true; // a small mirror of your camera in the corner, so you can see your hand
