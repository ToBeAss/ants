// ============================================================
// Colony — shared colony-level state: the food store, the queen, and the
// brood. Distinct from world.js, which owns physical environment layout
// (nest position, food placement, obstacles) rather than colony state.
//
// This file is a STORE, not behavior — the same split ants.js/behaviors.js
// already use. Everything that decides what the queen does with any of
// this lives in queen.js.
// ============================================================
import { FOOD_VALUE_PER_DELIVERY } from './config.js';

export const colony = { food: 0 };

// Called from provisioning.js when a load is handed over, and from
// foraging.js's give-up paths — mutation stays behind a function, same
// pattern world.js already uses for depleteFood(), rather than callers
// reaching in and incrementing colony.food directly.
export function addColonyFood(amount = FOOD_VALUE_PER_DELIVERY) {
  colony.food += amount;
}

// The counterpart, and the first thing in the sim to run it downward (the
// queen, paying for an egg). Clamped at zero: colony.food mirrors the food
// actually sitting in chambers but isn't derived from it — a load credited
// by an abandoning carrier (provisioning.js) never reached a room — so the
// two can disagree by a little and this must not go negative when they do.
export function spendColonyFood(amount) {
  colony.food = Math.max(0, colony.food - amount);
}

// The queen. A single stationary entity with none of a worker's machinery
// — no task state, no wander, no path integration — so she deliberately
// does NOT live in ants.js's SoA store: one plain object costs nothing and
// keeps the worker-optimized typed arrays free of fields only she uses.
// She is placed and moved by queen.js.
export const queen = {
  x: 0,
  y: 0,
  rotation: 0,
  animPhase: 0,   // only advances while she's actually walking
  layTimer: 0,
};

// Brood: plain objects in a plain array. Hundreds, not thousands, and
// nothing iterates them in a hot loop — the same "match the structure to
// the actual scale" reasoning that leaves spatialGrid.js a Map. Phase D
// extends these with a stage (egg -> larva -> pupa -> adult) and a timer;
// for now an item of brood is a position in a chamber.
export const brood = [];

export function addBrood(x, y) {
  brood.push({ x, y });
}

// Brood is tied to the chambers it was laid in, so it resets alongside the
// dug grid on a window resize (see main.js) — eggs piled in a room that no
// longer exists would be worse than losing them.
export function clearBrood() {
  brood.length = 0;
}
