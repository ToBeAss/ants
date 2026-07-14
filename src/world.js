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
import { FOOD_AMOUNT, NEST_CORNER_MARGIN } from './config.js';

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
  // bottom-left corner, inset enough to clear the wall-hugging margin
  nest.x = NEST_CORNER_MARGIN;
  nest.y = height - NEST_CORNER_MARGIN;
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