// ============================================================
// Foraging — proximity-based food AND nest detection, straight-line
// seek-steering toward a target, and pickup/dropoff state transitions.
// No pathfinding and no pheromones yet: an ant notices things within
// SENSE_RADIUS and beelines toward its own best guess. If a guess turns
// out wrong, it falls back to undirected wandering — the same
// discovery mechanism used to find food in the first place.
// ============================================================
import { nearestFood, depleteFood, nest } from './world.js';
import { beginStoring } from './provisioning.js';
import { nestEntranceApproach } from './underground.js';
import {
  STATE_WANDER, STATE_FORAGE, STATE_RETURN, STATE_HANDLING,
  SENSE_RADIUS, PICKUP_RADIUS, NEST_RADIUS, ENTRANCE_CROSS_RADIUS,
  SEEK_STEER_RATE, ANT_LENGTH,
  PICKUP_MIN, PICKUP_MAX,
} from './config.js';

// Called during WANDER. Promotes WANDER -> FORAGE if food is within
// range. Skips carrying ants entirely — an ant already holding food
// doesn't also go pick up more (see sim.js for why this guard matters:
// without it, a carrying ant "discovering" food would corrupt the
// pickup/dropoff disambiguation in updateHandling).
export function checkFoodDetection(ants, i) {
  if (ants.carrying[i]) return;
  const result = nearestFood(ants.x[i], ants.y[i]);
  if (result && result.dist <= SENSE_RADIUS) {
    ants.state[i] = STATE_FORAGE;
  }
}

// Called during WANDER. The symmetric counterpart to checkFoodDetection:
// only relevant for carrying ants, and only fires once a carrying ant
// senses the TRUE nest is nearby. Doesn't deliver here — just switches
// into RETURN, where updateForageSteer will steer it directly at the
// nest's real position and require tight physical proximity
// (ENTRANCE_CROSS_RADIUS) before actually going down it. Same pattern
// as checkFoodDetection promoting WANDER -> FORAGE, not an instant pickup.
export function checkNestDetection(ants, i) {
  if (!ants.carrying[i]) return;
  const dist = Math.hypot(nest.x - ants.x[i], nest.y - ants.y[i]);
  if (dist <= SENSE_RADIUS) {
    ants.state[i] = STATE_RETURN;
  }
}

// Called while FORAGE or RETURN. Steers heading toward the current
// target and handles arrival. width/height keep the RETURN target from
// ever pointing off-canvas.
export function updateForageSteer(ants, i, dt, width, height) {
  const isForaging = ants.state[i] === STATE_FORAGE;
  let targetX, targetY, arriveRadius, targetFood = null;
  let nestSensed = false; // only meaningful for RETURN — see below

  if (isForaging) {
    const result = nearestFood(ants.x[i], ants.y[i]);
    if (!result) {
      // food vanished from under it (another ant claimed the last unit,
      // or none exists) — fall back to wandering rather than seeking a
      // target that no longer exists
      ants.state[i] = STATE_WANDER;
      return;
    }
    targetFood = result.food;
    targetX = targetFood.x;
    targetY = targetFood.y;
    arriveRadius = PICKUP_RADIUS;
  } else {
    // RETURN — two modes, matching how food already works (WANDER
    // notices roughly, FORAGE steers precisely at the true position):
    //   - not yet sensed: steer using the imperfect belief, clamped to
    //     on-screen bounds, loose arrival radius. Reaching this without
    //     ever sensing the true nest means the belief was wrong.
    //   - sensed (within SENSE_RADIUS of the true nest): steer directly
    //     at the true position instead, tight arrival radius — delivery
    //     only completes once physically at the nest, same precision
    //     PICKUP_RADIUS already requires for food.
    const trueDistToNest = Math.hypot(nest.x - ants.x[i], nest.y - ants.y[i]);
    nestSensed = trueDistToNest <= SENSE_RADIUS;

    if (nestSensed) {
      targetX = nest.x;
      targetY = nest.y;
      arriveRadius = ENTRANCE_CROSS_RADIUS;
    } else {
      const rawTargetX = ants.x[i] - ants.homeVectorX[i];
      const rawTargetY = ants.y[i] - ants.homeVectorY[i];
      targetX = Math.max(ANT_LENGTH, Math.min(width - ANT_LENGTH, rawTargetX));
      targetY = Math.max(ANT_LENGTH, Math.min(height - ANT_LENGTH, rawTargetY));
      arriveRadius = NEST_RADIUS;
    }
  }

  const dx = targetX - ants.x[i];
  const dy = targetY - ants.y[i];
  const dist = Math.hypot(dx, dy);

  // steer heading toward the target — same normalized-angle-diff pattern
  // used for edge steering, just aimed at a point instead of a wall normal
  const targetAngle = Math.atan2(dy, dx);
  let diff = targetAngle - ants.rotation[i];
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  ants.rotation[i] += diff * SEEK_STEER_RATE * dt;

  // Sharpen the final approach to the entrance, or the ant can't turn tightly
  // enough to land on it and visibly circles the hole instead.
  //
  // This belongs HERE and not only in the tasks that cross into the nest: a
  // returning forager is in STATE_RETURN for the whole approach and only
  // becomes STATE_STORE once it has actually arrived, so putting it solely in
  // provisioning.js/digging.js left the ants doing the approaching — the ones
  // that were visibly spinning — untouched.
  if (!isForaging && nestSensed) nestEntranceApproach(ants, i, dt);

  if (isForaging) {
    if (dist <= arriveRadius) {
      ants.state[i] = STATE_HANDLING;
      depleteFood(targetFood);
      // carrying deliberately NOT set yet — flips true once this pickup
      // pause completes (updateHandling), which also disambiguates
      // "pickup pause" from "dropoff pause" there.
      ants.stateTimer[i] = PICKUP_MIN + Math.random() * (PICKUP_MAX - PICKUP_MIN);
    }
    return;
  }

  if (dist <= arriveRadius) {
    if (nestSensed) {
      // Physically at the entrance — go straight down, no pause. There used
      // to be a dropoff pause here, from when this was where the food
      // actually changed hands. It isn't any more: the handover happens at a
      // chamber inside the nest (provisioning.js), and that's where the
      // pause belongs. Leaving it here made every forager stop dead on the
      // doorstep for no reason anyone could see.
      ants.homeVectorX[i] = 0; // recalibrate — confirmed physically at the nest
      ants.homeVectorY[i] = 0;
      beginStoring(ants, i);
    } else {
      // reached the BELIEF, but the true nest was never sensed along
      // the way — the estimate was wrong. No pheromones to fall back
      // on, so: stop trusting it and switch to undirected wandering,
      // same mechanism that found food in the first place. Still
      // carrying — checkNestDetection (during WANDER) is the only way
      // this trip completes now.
      ants.state[i] = STATE_WANDER;
    }
  }
}

// Called while STATE_HANDLING. Counts down stateTimer (reusing the same
// field/pattern as idle); on expiry the ant picks its food up and heads
// home.
//
// PICKUP ONLY, as of the provisioning rework. This used to serve both ends
// of the trip, disambiguated by the `carrying` flag — but the dropoff end no
// longer pauses at the nest at all: a returning forager walks straight in and
// the handover pause happens at the chamber where the food actually changes
// hands (provisioning.js). `carrying` is still what tells the two apart
// conceptually; there's just only one case left here.
export function updateHandling(ants, i, dt) {
  ants.stateTimer[i] -= dt;
  if (ants.stateTimer[i] > 0) return; // still paused

  ants.carrying[i] = 1;
  ants.state[i] = STATE_RETURN;
}