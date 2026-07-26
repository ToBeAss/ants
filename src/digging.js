// ============================================================
// Digging — the DIG task (ROADMAP.md Phase B): recruitment near the
// nest, walking to the nest and physically crossing at the entrance
// (both directions — no teleporting in from open ground), then working
// through the colony's excavation plan one cell at a time. Mirrors
// foraging.js's conventions throughout (proximity detection,
// seek-steering toward a target, a "handling" pause on arrival) since
// it's the same shape of problem — a worker task state machine — just
// underground.
//
// This file decides how ONE ant behaves. What gets dug and why is
// nestPlan.js's job: a digger asks for a cell, walks to it, and carves
// it. It has no idea whether it's opening a corridor or hollowing a
// brood chamber, which is roughly the right amount for one ant to know.
//
// Carving is slow now (DIG_CARVE_MIN..MAX, ~10-15s per cell rather than
// the ~1s it used to be), so most of a digger's life is standing at a
// cell working on it. The pause reports progress to underground.js so
// the cell visibly crumbles instead of an ant appearing to be stuck.
// ============================================================
import { enterUnderground, exitToSurface, setCellProgress, entrance } from './underground.js';
import {
  needsDiggers, hasClaimableCell, joinDigForce, leaveDigForce,
  claimDigCell, getClaim, releaseClaim, completeClaim,
} from './nestPlan.js';
import { nest } from './world.js';
import {
  STATE_WANDER, STATE_DIG,
  DOMAIN_SURFACE,
  SENSE_RADIUS, SEEK_STEER_RATE, NEST_ARRIVE_RADIUS,
  DIG_ENTER_CHANCE, DIG_ARRIVE_RADIUS, DIG_CARVE_MIN, DIG_CARVE_MAX,
  DIG_TRAVEL_TIMEOUT, DIG_EXIT_TIMEOUT,
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

// Sends the ant home the moment its dig job is over or hopeless. Split
// out because three separate paths need it (no work available, stuck en
// route, project abandoned under it) and each must drop the ant's claim
// — a leaked claim would block that cell for the rest of the project.
function abandonDig(ants, i) {
  releaseClaim(ants.id[i]);
  setCellProgress(ants.digTargetX[i], ants.digTargetY[i], 0);
  ants.digExiting[i] = 1;
  ants.digTravelTimer[i] = 0;
}

// Called during surface WANDER — mirrors checkFoodDetection's
// proximity-based promotion, but probabilistic (IDLE_ENTER_CHANCE
// style) rather than deterministic-on-proximity: not every ant that
// wanders near the nest should become a digger, or the colony would
// have no foragers left, and the player never directly assigns this
// role (stewardship, not control). Skips carrying ants — an ant
// mid-trip (including one that fell back to WANDER while lost, still
// carrying — see foraging.js) shouldn't get reassigned.
//
// The needsDiggers() gate is the whole point of the rework: ants go
// underground because the colony has decided it needs a chamber and is
// short-handed on it, not because dirt exists. With every need met,
// this never fires and the nest simply stops growing.
//
// Domain stays DOMAIN_SURFACE here — updateDigging() walks the ant the
// rest of the way to the nest and crosses only once it physically
// arrives (see below), rather than teleporting in from wherever it
// happened to be within SENSE_RADIUS.
export function checkDigRecruitment(ants, i, dt) {
  if (ants.carrying[i]) return;
  if (!needsDiggers()) return;
  const dist = Math.hypot(nest.x - ants.x[i], nest.y - ants.y[i]);
  if (dist > SENSE_RADIUS) return;
  if (Math.random() < DIG_ENTER_CHANCE * dt) {
    ants.state[i] = STATE_DIG;
    ants.stateTimer[i] = 0; // starts in "traveling to a target" mode, not paused
    ants.digExiting[i] = 0;
    ants.digTravelTimer[i] = 0;
    joinDigForce(ants.id[i]);
  }
}

// Called while STATE_DIG. Returns true if the ant should be frozen
// this tick (still paused, mid-carve) — sim.js uses this the same way
// updateIdleState()'s return value gates movement for idling ants.
// Returns false while actively steering (surface-side approach to the
// nest, underground approach to a claimed cell, or the walk back to the
// entrance to exit) — same-tick crossings included, mirroring how other
// same-tick state transitions elsewhere in sim.js still move normally
// once they've landed in their new domain.
export function updateDigging(ants, i, dt) {
  const id = ants.id[i];

  // Not yet underground — walk to the nest, the single crossing point
  // (ROADMAP.md's entrance linkage), and only cross once physically
  // there. Same arrival precision foraging.js requires for a real
  // dropoff (NEST_ARRIVE_RADIUS), not the loose SENSE_RADIUS that
  // triggered recruitment above.
  if (ants.domain[i] === DOMAIN_SURFACE) {
    ants.digTravelTimer[i] += dt;
    const dist = steerToward(ants, i, dt, nest.x, nest.y);
    if (dist <= NEST_ARRIVE_RADIUS) {
      if (!hasClaimableCell()) {
        // Checked here, at the entrance, rather than only underground:
        // the plan can fill up or finish during the walk over, and an
        // ant that crosses down only to turn around immediately reads
        // as a glitch from the surface — it vanishes into the nest and
        // reappears out of it a moment later. Turning it away at the
        // door keeps every crossing meaningful.
        ants.state[i] = STATE_WANDER;
        ants.digTravelTimer[i] = 0;
        leaveDigForce(id);
        return false;
      }
      enterUnderground(ants, i); // flips domain — the shared movement tail below re-reads it this same tick
      ants.digTravelTimer[i] = 0;
    } else if (ants.digTravelTimer[i] > DIG_TRAVEL_TIMEOUT) {
      // Bounded, for the same reason the underground leg is — and it
      // bites here more often than you'd expect, because the nest sits
      // in a screen corner: an ant recruited right against a wall gets
      // picked up by avoidSurfaces' wall-hugging, which preserves the
      // direction it's already traveling and can carry it along the
      // wall AWAY from the nest, seek-steering losing to the avoidance
      // urgency term the whole way. Left unbounded it can end up parked
      // in a corner in a stable steering equilibrium, permanently: task
      // states have no wander noise to break out with, and the ant
      // would also hold a dig-force slot forever, quietly capping
      // recruitment for the rest of the run. Dropping back to WANDER
      // fixes both — wander noise gets it off the wall, and the colony
      // re-recruits someone better placed.
      ants.state[i] = STATE_WANDER;
      ants.digTravelTimer[i] = 0;
      leaveDigForce(id);
    }
    return false;
  }

  // Underground from here on.
  if (ants.stateTimer[i] > 0) {
    ants.stateTimer[i] -= dt;

    if (ants.stateTimer[i] <= 0) {
      // The pause just finished — the cell converts NOW, not back on
      // arrival, so the dirt visibly holds solid (and visibly crumbles,
      // via the progress report below) for the whole carving duration
      // instead of vanishing the instant the ant gets there.
      completeClaim(id);
    } else {
      // Fraction carved so far, for the renderer only — nothing in the
      // simulation reads it, and the cell stays solid until it flips.
      const done = 1 - ants.stateTimer[i] / ants.digCarveTotal[i];
      setCellProgress(ants.digTargetX[i], ants.digTargetY[i], done);
    }
    return true;
  }

  if (ants.digExiting[i]) {
    // Job's done (or hopeless) — walk back to the entrance and cross
    // up, rather than despawning mid-tunnel and popping back in at the
    // nest. Symmetric to the surface-side approach above.
    ants.digTravelTimer[i] += dt;
    const dist = steerToward(ants, i, dt, entrance.x, entrance.y);
    if (dist <= DIG_ARRIVE_RADIUS || ants.digTravelTimer[i] > DIG_EXIT_TIMEOUT) {
      // The timeout is a backstop, not the normal path: with no
      // pathfinding, an ant in a far chamber can fail to straight-line
      // its way back out. Surfacing it anyway beats leaving it grinding
      // against a tunnel wall forever — same role as sim.js's hard
      // position clamps.
      exitToSurface(ants, i);
      ants.state[i] = STATE_WANDER;
      ants.digExiting[i] = 0;
      ants.digTravelTimer[i] = 0;
      leaveDigForce(id);
    }
    return false;
  }

  // Get (or keep) a cell to work on. Losing a claim mid-approach is
  // normal — the project can finish or be abandoned under an ant that's
  // still walking — so this re-checks every tick rather than trusting
  // digTargetX/Y to still mean anything.
  let target = getClaim(id);
  if (!target) {
    target = claimDigCell(id, ants.x[i], ants.y[i]);
    if (!target) {
      // Nothing claimable: the plan is complete, on cooldown, or every
      // reachable cell is already taken. Head out — a digger with no
      // work belongs back on the surface, not loitering in a tunnel.
      abandonDig(ants, i);
      return false;
    }
    ants.digTargetX[i] = target.x;
    ants.digTargetY[i] = target.y;
    ants.digTravelTimer[i] = 0;
  }

  ants.digTravelTimer[i] += dt;
  if (ants.digTravelTimer[i] > DIG_TRAVEL_TIMEOUT) {
    // Can't get there — probably around a bend straight-line steering
    // won't negotiate. Give the cell back so a better-placed ant can
    // take it, and surface. See DIG_TRAVEL_TIMEOUT in config.js.
    abandonDig(ants, i);
    return false;
  }

  const dist = steerToward(ants, i, dt, target.x, target.y);
  if (dist <= DIG_ARRIVE_RADIUS) {
    ants.digTargetX[i] = target.x;
    ants.digTargetY[i] = target.y;
    ants.digCarveTotal[i] = DIG_CARVE_MIN + Math.random() * (DIG_CARVE_MAX - DIG_CARVE_MIN);
    ants.stateTimer[i] = ants.digCarveTotal[i];
  }

  return false;
}
