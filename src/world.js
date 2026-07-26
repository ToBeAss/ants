// ============================================================
// World — nest and food source state. This is "what's in the
// environment," kept separate from ants.js ("who exists"). Nest
// position is set at init (main.js) once canvas size is known. Food is
// NOT auto-spawned or auto-respawned — it only appears via spawnFoodAt(),
// called from a click handler in main.js.
//
// NOTE: nest does not currently re-position on window resize. Acceptable
// for now; revisit together if resizing mid-run becomes common.
// ============================================================
import { FOOD_AMOUNT } from './config.js';

export const nest = { x: 0, y: 0 };

// Array of {x, y, amount} — kept as an array even with click-driven
// spawning, so multiple simultaneous food sources just work without a
// data-model change.
export const food = [];

// Array of {x, y, radius} — circular obstacles, hand-placed via
// Shift+Click (see main.js). Kept simple: no shapes beyond circles for
// now, and no collision between obstacles themselves (overlapping rocks
// are visually fine, nothing needs them to be non-intersecting).
export const obstacles = [];

export function addObstacle(x, y, radius) {
  obstacles.push({ x, y, radius });
}

export function initWorld(width, height) {
  // Centre of the surface view, which also puts the underground entrance at
  // the top middle of its cross-section (underground.js derives it from
  // nest.x). Was the bottom-left corner, which cost more than it looked:
  // the descending shaft had a wall immediately to one side, so it could
  // only zig-zag one way and the nest grew lopsided; chambers hung on the
  // wall side were squeezed by the world edge rather than by their depth;
  // the spoil crater had half its directions off-world; and diggers
  // recruited against the wall got carried along it by avoidSurfaces'
  // hugging, away from the nest (see DIG_TRAVEL_TIMEOUT in digging.js).
  // Centring removes all four at once and makes the tunnel pattern legible.
  nest.x = width / 2;
  nest.y = height / 2;
  food.length = 0;
}

export function spawnFoodAt(x, y) {
  food.push({ x, y, amount: FOOD_AMOUNT });
}

export function nearestFood(x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const f of food) {
    const d = Math.hypot(f.x - x, f.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = f;
    }
  }
  return best ? { food: best, dist: bestDist } : null;
}

export function depleteFood(f) {
  f.amount--;
  if (f.amount <= 0) {
    const idx = food.indexOf(f);
    if (idx !== -1) food.splice(idx, 1);
    // no auto-respawn — new food only comes from clicking the screen
  }
}