// ============================================================
// Digging — the DIG task (ROADMAP.md Phase B): proximity-based
// recruitment near the nest, walking to the nest and physically
// crossing at the entrance (both directions — no teleporting in from
// open ground), seek-steering to the nearest frontier dirt cell, and
// carving it. Mirrors foraging.js's conventions throughout (proximity
// detection, seek-steering toward a target, a brief "handling" pause
// on arrival) since it's the same shape of problem — a worker task
// state machine — just underground.
// ============================================================
import { enterUnderground, exitToSurface, findFrontierCell, digCell, entrance } from './underground.js';
import { nest } from './world.js';
import {
  STATE_WANDER, STATE_DIG,
  DOMAIN_SURFACE,
  SENSE_RADIUS, SEEK_STEER_RATE, NEST_ARRIVE_RADIUS,
  DIG_ENTER_CHANCE, DIG_ARRIVE_RADIUS, DIG_MIN, DIG_MAX,
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

// Called during surface WANDER — mirrors checkFoodDetection's
// proximity-based promotion, but probabilistic (IDLE_ENTER_CHANCE
// style) rather than deterministic-on-proximity: not every ant that
// wanders near the nest should become a digger, or the colony would
// have no foragers left, and the player never directly assigns this
// role (stewardship, not control). Skips carrying ants — an ant
// mid-trip (including one that fell back to WANDER while lost, still
// carrying — see foraging.js) shouldn't get reassigned. Domain stays
// DOMAIN_SURFACE here — updateDigging() walks the ant the rest of the
// way to the nest and crosses only once it physically arrives (see
// below), rather than teleporting in from wherever it happened to be
// within SENSE_RADIUS.
export function checkDigRecruitment(ants, i, dt) {
  if (ants.carrying[i]) return;
  const dist = Math.hypot(nest.x - ants.x[i], nest.y - ants.y[i]);
  if (dist > SENSE_RADIUS) return;
  if (Math.random() < DIG_ENTER_CHANCE * dt) {
    ants.state[i] = STATE_DIG;
    ants.stateTimer[i] = 0; // starts in "traveling to a target" mode, not paused
    ants.digExiting[i] = 0;
  }
}

// Called while STATE_DIG. Returns true if the ant should be frozen
// this tick (still paused, mid-carve) — sim.js uses this the same way
// updateIdleState()'s return value gates movement for idling ants.
// Returns false while actively steering (surface-side approach to the
// nest, underground seek toward a frontier cell, or underground
// approach to the entrance to exit) — same-tick crossings included,
// mirroring how other same-tick state transitions elsewhere in sim.js
// still move normally once they've landed in their new domain.
export function updateDigging(ants, i, dt) {
  // Not yet underground — walk to the nest, the single crossing point
  // (ROADMAP.md's entrance linkage), and only cross once physically
  // there. Same arrival precision foraging.js requires for a real
  // dropoff (NEST_ARRIVE_RADIUS), not the loose SENSE_RADIUS that
  // triggered recruitment above.
  if (ants.domain[i] === DOMAIN_SURFACE) {
    const dist = steerToward(ants, i, dt, nest.x, nest.y);
    if (dist <= NEST_ARRIVE_RADIUS) {
      enterUnderground(ants, i); // flips domain — the shared movement tail below re-reads it this same tick
    }
    return false;
  }

  // Underground from here on.
  if (ants.stateTimer[i] > 0) {
    ants.stateTimer[i] -= dt;
    if (ants.stateTimer[i] <= 0) {
      // The pause just finished — carve NOW, not back on arrival, so
      // the dirt visibly holds solid for the whole carving duration
      // instead of vanishing the instant the ant gets there. Reads
      // ants.digTargetX/Y rather than re-querying findFrontierCell(),
      // since the ant must keep carving the SAME cell it paused for,
      // not whatever happens to be nearest right now.
      digCell(ants.digTargetX[i], ants.digTargetY[i]);
    }
    return true;
  }

  if (ants.digExiting[i]) {
    // Nothing left to dig — walk back to the entrance and cross up,
    // rather than despawning mid-tunnel and popping back in at the
    // nest. Symmetric to the surface-side approach above.
    const dist = steerToward(ants, i, dt, entrance.x, entrance.y);
    if (dist <= DIG_ARRIVE_RADIUS) {
      exitToSurface(ants, i);
      ants.state[i] = STATE_WANDER;
      ants.digExiting[i] = 0;
    }
    return false;
  }

  const target = findFrontierCell(ants.x[i], ants.y[i]);
  if (!target) {
    // Nothing left to dig within the unlocked region — head back to
    // the entrance instead of exiting immediately (handled next tick,
    // the branch above). Same "give up, fall back to the general
    // mechanism" idea foraging.js uses when a belief turns out wrong.
    ants.digExiting[i] = 1;
    return false;
  }

  const dist = steerToward(ants, i, dt, target.x, target.y);
  if (dist <= DIG_ARRIVE_RADIUS) {
    ants.digTargetX[i] = target.x;
    ants.digTargetY[i] = target.y;
    ants.stateTimer[i] = DIG_MIN + Math.random() * (DIG_MAX - DIG_MIN);
  }

  return false;
}
