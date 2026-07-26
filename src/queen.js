// ============================================================
// Queen — the colony's only egg-layer, and the first thing in the sim that
// SPENDS food (ROADMAP.md Phase C).
//
// She is the store's counterpart to behaviors.js: colony.js holds what she
// IS, this file decides what she does. Which is very little, on purpose —
// she has no task state machine, doesn't wander, doesn't forage, and
// doesn't route around anything. She sits in the deepest chamber and lays.
//
// Two things she does do, and both are the point of the phase:
//
//   She EATS. Every egg costs QUEEN_EGG_FOOD_COST out of the food actually
//   sitting in the nest's chambers. Before this, colony.food only ever went
//   up: storage demand grew without bound and the deepest chamber became a
//   larder that filled forever. Food now has a sink, and it's the same sink
//   a real colony has — the brood.
//
//   She MOVES, rarely. Her chamber isn't a room she was assigned, it's a
//   position: the deepest one (see getQueenChamber). As the colony digs
//   below her that position changes, and she walks down to the new bottom
//   rather than teleporting into it. Ferrying the BROOD down with her needs
//   workers to do the carrying and is sequenced with Phase D/E; she can at
//   least take herself.
// ============================================================
import { queen, addBrood, clearBrood, spendColonyFood } from './colony.js';
import {
  getQueenChamber, chooseBroodChamber, takeNestFood, routeWaypoint,
} from './nestPlan.js';
import { entrance, isTunnel } from './underground.js';
import {
  WALK_ANIM_FPS,
  QUEEN_SPEED, QUEEN_STEER_RATE, QUEEN_SETTLE_RADIUS,
  QUEEN_TWITCH_CHANCE, QUEEN_TWITCH_AMOUNT,
  QUEEN_LAY_INTERVAL_MIN, QUEEN_LAY_INTERVAL_MAX, QUEEN_LAY_RETRY,
  QUEEN_EGG_FOOD_COST,
} from './config.js';

function layInterval() {
  return QUEEN_LAY_INTERVAL_MIN + Math.random() * (QUEEN_LAY_INTERVAL_MAX - QUEEN_LAY_INTERVAL_MIN);
}

// Seats the queen in the founding chamber. Must run after initNestPlan()
// (see main.js) — she is placed at a room that has to exist first.
//
// Clears the brood too: eggs are positions inside chambers, and on a resize
// the whole dug grid and every chamber with it are rebuilt, so brood from
// the old nest would be left piled in solid earth.
export function initQueen() {
  clearBrood();
  const home = getQueenChamber();
  queen.x = home ? home.x : entrance.x;
  queen.y = home ? home.y : entrance.y;
  queen.rotation = Math.random() * Math.PI * 2;
  queen.animPhase = 0;
  queen.layTimer = layInterval();
}

// Called once per tick from sim.js — colony-level, like updateNestPlan().
export function updateQueen(dt) {
  const home = getQueenChamber();
  if (!home) return; // no nest at all; nothing to be the bottom of

  walkHome(home, dt);
  updateLaying(dt);
}

// Deliberately not the ants' movement code: no avoidance, no separation, no
// integrate(). She follows the shaft via routeWaypoint() — the same router
// foragers and diggers use, and the reason she can turn the corner out of
// her old chamber — and simply refuses any step that would put her in the
// earth. That refusal replaces the whole avoidance stack for her: worst
// case she stands still for a moment, which for a queen is not a failure
// state (see CLAUDE.md on preferring a hard clamp over a cleverer
// controller down here).
function walkHome(home, dt) {
  const dist = Math.hypot(home.x - queen.x, home.y - queen.y);
  if (dist <= QUEEN_SETTLE_RADIUS) {
    // Home. Still, but not frozen — same reasoning as the digger twitch.
    if (Math.random() < QUEEN_TWITCH_CHANCE * dt) {
      queen.rotation += (Math.random() - 0.5) * QUEEN_TWITCH_AMOUNT;
    }
    return;
  }

  const wp = routeWaypoint(queen.x, queen.y, home.x, home.y);
  let diff = Math.atan2(wp.y - queen.y, wp.x - queen.x) - queen.rotation;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  queen.rotation += diff * QUEEN_STEER_RATE * dt;

  const step = QUEEN_SPEED * dt;
  const nx = queen.x + Math.cos(queen.rotation) * step;
  const ny = queen.y + Math.sin(queen.rotation) * step;
  if (!isTunnel(nx, ny)) return;

  queen.x = nx;
  queen.y = ny;
  // Leg cadence scaled to her pace against a worker's baseline (~45 px/s,
  // ants.js), the same relationship the per-state speed multipliers give
  // workers — she is slow, so her legs are slow.
  queen.animPhase += WALK_ANIM_FPS * (QUEEN_SPEED / 45) * dt;
}

// One egg per interval, but only if the colony can pay for it AND has
// somewhere to put it. Failing either one just re-arms a short retry: a
// hungry or cramped queen isn't broken, she's waiting, and she resumes on
// her own the moment a forager comes back down the shaft.
function updateLaying(dt) {
  queen.layTimer -= dt;
  if (queen.layTimer > 0) return;

  const room = chooseBroodChamber();
  if (!room) {
    queen.layTimer = QUEEN_LAY_RETRY;
    return;
  }
  if (!takeNestFood(QUEEN_EGG_FOOD_COST)) {
    queen.layTimer = QUEEN_LAY_RETRY;
    return;
  }
  spendColonyFood(QUEEN_EGG_FOOD_COST); // colony.food mirrors the chamber ledgers down

  // Scattered over the room's floor rather than heaped on its centre —
  // sqrt of a uniform draw keeps the scatter even instead of clustering in
  // the middle, and the inset keeps eggs off the dirt wall.
  const a = Math.random() * Math.PI * 2;
  const r = (room.radius - 5) * Math.sqrt(Math.random());
  addBrood(room.x + Math.cos(a) * r, room.y + Math.sin(a) * r);

  queen.layTimer = layInterval();
}
