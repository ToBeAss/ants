// ============================================================
// Provisioning — carrying gathered food down into the nest and putting it
// somewhere (ROADMAP.md Phase B7).
//
// Until this existed, a forager reaching the nest marker had its food
// evaporate into a single colony-wide number. Food never entered the nest
// at all, which meant the underground view showed a colony that ate
// nothing, and the food store chambers the plan was digging had nothing to
// put in them.
//
// WHERE food goes is the interesting part, and it follows the same rule the
// nest architecture follows: food goes where it is CONSUMED. In a real
// colony that's the brood and the queen, at the bottom — most ants don't
// warehouse food in rooms at all, they carry it in their own crops and pass
// it around by trophallaxis. Dedicated granaries are a granivore
// speciality (harvester ants and their seeds), which is why a store chamber
// here is a preference rather than a requirement: if the colony has one
// with room, food goes there; otherwise it goes to the deepest chamber,
// where the consumers live.
//
// Simplification, deliberate and worth knowing: a real forager does NOT
// walk its load to the bottom of the nest. It unloads near the entrance to
// a receiver worker, which passes it on, and the food reaches the deep
// chambers through a chain of mouth-to-mouth handoffs rather than one ant's
// journey. Modeling that needs a second task (receivers) and food that
// lives in ants rather than in rooms; this file does the one-ant version so
// that food physically moves through the nest now. The relay is the natural
// refinement once brood exists to be fed (Phase E).
// ============================================================
import {
  enterUnderground, exitToSurface, atNestExit, nestEntranceApproach, entrance,
} from './underground.js';
import { chooseStoreChamber, depositChamberFood, routeWaypoint } from './nestPlan.js';
import { addColonyFood } from './colony.js';
import { nest } from './world.js';
import {
  STATE_WANDER, STATE_STORE,
  DOMAIN_SURFACE,
  SEEK_STEER_RATE, ENTRANCE_CROSS_RADIUS, ENTRANCE_EXIT_OVERSHOOT,
  STORE_ARRIVE_RADIUS, STORE_HANDOVER_MIN, STORE_HANDOVER_MAX,
  STORE_TRAVEL_TIMEOUT, STORE_EXIT_TIMEOUT,
} from './config.js';

function steerToward(ants, i, dt, targetX, targetY) {
  const dx = targetX - ants.x[i];
  const dy = targetY - ants.y[i];
  const targetAngle = Math.atan2(dy, dx);
  let diff = targetAngle - ants.rotation[i];
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  ants.rotation[i] += diff * SEEK_STEER_RATE * dt;
  return Math.hypot(dx, dy);
}

// The load is credited to the colony wherever the ant happens to give up.
// Losing it entirely would make a timeout quietly destroy food the colony
// worked for — the same reasoning that makes a spoil pellet get dropped
// where the hauler stands rather than vanishing (see digging.js).
function abandonLoad(ants, i) {
  if (ants.carrying[i]) {
    ants.carrying[i] = 0;
    addColonyFood();
  }
  ants.state[i] = STATE_WANDER;
  ants.storeTravelTimer[i] = 0;
  ants.storeExiting[i] = 0;
}

// Called from foraging.js when a delivery pause finishes at the nest. The
// ant keeps its load — the trip isn't over, it has only reached the door.
export function beginStoring(ants, i) {
  const target = chooseStoreChamber();
  if (!target) {
    // No nest to speak of yet. Credit it and carry on, so the food economy
    // still works if the underground somehow isn't there.
    abandonLoad(ants, i);
    return;
  }
  ants.state[i] = STATE_STORE;
  ants.storeTargetX[i] = target.x;
  ants.storeTargetY[i] = target.y;
  ants.storeTravelTimer[i] = 0;
  ants.storeExiting[i] = 0;
  ants.stateTimer[i] = 0;
}

// Called while STATE_STORE. Returns true if the ant should be frozen this
// tick (mid-handover), same contract as updateDigging().
export function updateStoring(ants, i, dt) {
  // Handover pause, at the chamber — this is where the food actually
  // changes hands, so the pause belongs here rather than at the surface.
  if (ants.stateTimer[i] > 0) {
    ants.stateTimer[i] -= dt;
    if (ants.stateTimer[i] <= 0) {
      depositChamberFood(ants.storeTargetX[i], ants.storeTargetY[i]);
      addColonyFood();
      ants.carrying[i] = 0;
      ants.storeExiting[i] = 1;
      ants.storeTravelTimer[i] = 0;
    }
    return true;
  }

  if (ants.domain[i] === DOMAIN_SURFACE) {
    // Either walking in with a load, or walking out again having delivered.
    if (ants.storeExiting[i]) {
      ants.state[i] = STATE_WANDER;
      ants.storeExiting[i] = 0;
      return false;
    }

    ants.storeTravelTimer[i] += dt;
    steerToward(ants, i, dt, nest.x, nest.y);
    // Sharpen the turn as it closes, or it can't turn tightly enough to land
    // on the hole and just circles it (see nestEntranceApproach).
    const dist = nestEntranceApproach(ants, i, dt);
    if (dist <= ENTRANCE_CROSS_RADIUS) {
      enterUnderground(ants, i);
      ants.storeTravelTimer[i] = 0;
    } else if (ants.storeTravelTimer[i] > STORE_TRAVEL_TIMEOUT) {
      abandonLoad(ants, i);
    }
    return false;
  }

  // Underground.
  if (ants.storeExiting[i]) {
    ants.storeTravelTimer[i] += dt;
    // Routed along the shaft rather than beelined: a chamber hangs off the
    // shaft on a stub, so the way out is an L, and steering straight at the
    // entrance just walks into the chamber wall (see routeWaypoint).
    const wp = routeWaypoint(ants.x[i], ants.y[i], entrance.x, entrance.y);
    const climbing = wp.x === entrance.x && wp.y === entrance.y;
    // Once the mouth is in sight, aim ABOVE it so the ant climbs through
    // instead of easing to a halt just inside.
    steerToward(ants, i, dt, wp.x, climbing ? entrance.y - ENTRANCE_EXIT_OVERSHOOT * 2 : wp.y);
    if (atNestExit(ants, i) || ants.storeTravelTimer[i] > STORE_EXIT_TIMEOUT) {
      exitToSurface(ants, i);
      ants.state[i] = STATE_WANDER;
      ants.storeExiting[i] = 0;
      ants.storeTravelTimer[i] = 0;
    }
    return false;
  }

  ants.storeTravelTimer[i] += dt;
  const wp = routeWaypoint(ants.x[i], ants.y[i], ants.storeTargetX[i], ants.storeTargetY[i]);
  steerToward(ants, i, dt, wp.x, wp.y);
  const dist = Math.hypot(ants.storeTargetX[i] - ants.x[i], ants.storeTargetY[i] - ants.y[i]);
  if (dist <= STORE_ARRIVE_RADIUS) {
    ants.stateTimer[i] = STORE_HANDOVER_MIN + Math.random() * (STORE_HANDOVER_MAX - STORE_HANDOVER_MIN);
  } else if (ants.storeTravelTimer[i] > STORE_TRAVEL_TIMEOUT) {
    // Couldn't reach the chamber — no pathfinding, so a room around a bend
    // can be genuinely unreachable (the same bound DIG_TRAVEL_TIMEOUT
    // exists for). Credit the load and head back out rather than circling.
    if (ants.carrying[i]) {
      ants.carrying[i] = 0;
      addColonyFood();
    }
    ants.storeExiting[i] = 1;
    ants.storeTravelTimer[i] = 0;
  }
  return false;
}
