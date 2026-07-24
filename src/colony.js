// ============================================================
// Colony — shared colony-level state (resources, and eventually the
// queen/brood once they move underground — see ROADMAP.md Phase C).
// Distinct from world.js, which owns physical environment layout
// (nest position, food placement, obstacles) rather than colony state.
// ============================================================
import { FOOD_VALUE_PER_DELIVERY } from './config.js';

export const colony = { food: 0 };

// Called from foraging.js on dropoff completion — mutation stays behind
// a function, same pattern world.js already uses for depleteFood(),
// rather than callers reaching in and incrementing colony.food directly.
export function addColonyFood(amount = FOOD_VALUE_PER_DELIVERY) {
  colony.food += amount;
}
