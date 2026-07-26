// ============================================================
// Sim step — orchestrates behaviors.js and foraging.js across every
// live ant. No physics/steering logic lives here directly; this just
// decides which behaviors run per-state and applies the shared
// hard-clamp backstop.
// ============================================================
import { ants } from './ants.js';
import { updateIdleState, wander, avoidSurfaces, integrate, separationSteer } from './behaviors.js';
import { checkFoodDetection, checkNestDetection, updateForageSteer, updateHandling } from './foraging.js';
import { checkDigRecruitment, updateDigging } from './digging.js';
import { updateStoring } from './provisioning.js';
import { updateNestPlan } from './nestPlan.js';
import { updateQueen } from './queen.js';
import { avoidTunnelWalls, pushOutOfDirt } from './underground.js';
import { depositPheromone, decayPheromones, diffusePheromones, followTrail } from './pheromones.js';
import { rebuildSpatialGrid } from './spatialGrid.js';
import { obstacles } from './world.js';
import {
  ANT_LENGTH, SIM_SPEEDS,
  IDLE_TWITCH_CHANCE, IDLE_TWITCH_AMOUNT,
  DIG_TWITCH_CHANCE, DIG_TWITCH_AMOUNT,
  WALK_ANIM_FPS,
  STATE_IDLE, STATE_WANDER, STATE_HANDLING, STATE_FORAGE, STATE_RETURN, STATE_DIG, STATE_STORE,
  HOME_VECTOR_ERROR_RATE,
  FORAGE_SPEED_MULT, RETURN_SPEED_MULT,
  DOMAIN_UNDERGROUND, ENTRANCE_EXIT_OVERSHOOT,
} from './config.js';

// How many times faster than real time the simulation is being run. Lives
// here rather than in main.js because it's a property of the simulation,
// not of the loop that drives it — main.js reads it to decide how much time
// to feed the accumulator, render.js reads it to label the view. Neither
// imports the other, which keeps the two draw/loop paths independent.
let speedIndex = 0;

export function getSimSpeed() {
  return SIM_SPEEDS[speedIndex];
}

// Cycles and wraps back to 1x, same shape as the other single-key toggles.
export function cycleSimSpeed() {
  speedIndex = (speedIndex + 1) % SIM_SPEEDS.length;
  return getSimSpeed();
}

export function simStep(dt) {
  const w = window.innerWidth;
  const h = window.innerHeight;

  decayPheromones(dt); // once per tick, not per ant — a single pass over the whole grid
  diffusePheromones(dt); // ditto — spreads the trail, separate concern from decay shrinking it
  rebuildSpatialGrid(ants); // ditto — bins every ant fresh, used by separationSteer below
  updateNestPlan(dt); // ditto — colony-level, not per-ant: decides whether the nest currently needs a new
                      // chamber dug, and retires a project once its last cell is open (see nestPlan.js)
  updateQueen(dt); // ditto — she's one entity, not part of the ant store: lays eggs against the food the
                   // colony has actually got underground, and walks down if the nest deepens past her

  for (let i = 0; i < ants.count; i++) {
    const state = ants.state[i];

    if (state === STATE_IDLE || state === STATE_WANDER) {
      const idle = updateIdleState(ants, i, dt);

      if (idle) {
        if (Math.random() < IDLE_TWITCH_CHANCE * dt) {
          ants.rotation[i] += (Math.random() - 0.5) * IDLE_TWITCH_AMOUNT;
        }
        // animPhase intentionally not advanced — ant holds on the walk
        // frame it stopped on. See behaviors.js.
        continue;
      }

      wander(ants, i, dt);
      followTrail(ants, i, dt, ants.carrying[i] === 1); // eager pull if lost & still carrying — see pheromones.js
      checkFoodDetection(ants, i); // may promote WANDER -> FORAGE (skipped if already carrying)
      checkNestDetection(ants, i); // may promote WANDER -> RETURN (only if carrying, near true nest)
      checkDigRecruitment(ants, i, dt); // may promote WANDER -> DIG (crosses underground the same tick — see digging.js)
    } else if (state === STATE_HANDLING) {
      // Brief handling pause — frozen in place, same treatment as idle:
      // small twitch for character, no movement, no animation advance.
      updateHandling(ants, i, dt);
      if (Math.random() < IDLE_TWITCH_CHANCE * dt) {
        ants.rotation[i] += (Math.random() - 0.5) * IDLE_TWITCH_AMOUNT;
      }
      continue;
    } else if (state === STATE_STORE) {
      // Carrying a load down to a chamber. Same shape as STATE_DIG: it spans
      // both domains, and returns true only while frozen mid-handover.
      if (updateStoring(ants, i, dt)) {
        if (Math.random() < IDLE_TWITCH_CHANCE * dt) {
          ants.rotation[i] += (Math.random() - 0.5) * IDLE_TWITCH_AMOUNT;
        }
        if (ants.domain[i] === DOMAIN_UNDERGROUND) pushOutOfDirt(ants, i);
        continue;
      }
    } else if (state === STATE_DIG) {
      // updateDigging returns true only while frozen mid-carve — same
      // "skip movement entirely during the pause" treatment as
      // STATE_HANDLING above. False covers both active steering AND
      // the tick a digger finishes and crosses back to the surface
      // (see digging.js) — that transition tick still moves normally,
      // using its fresh domain/position, via the domain check below.
      if (updateDigging(ants, i, dt)) {
        // Frozen at the dirt face for the whole carve (~10-15s), so the
        // twitch matters more here than anywhere else it's used: idle
        // and handling pauses are brief, but a digger holding perfectly
        // still this long reads as a hung ant rather than a working
        // one. Faster and smaller than the idle twitch (see config.js)
        // — scraping at a wall, not glancing around.
        if (Math.random() < DIG_TWITCH_CHANCE * dt) {
          ants.rotation[i] += (Math.random() - 0.5) * DIG_TWITCH_AMOUNT;
        }
        // The dirt backstop still applies while frozen. This path `continue`s
        // before the movement tail, so a carving ant used to be exempt from
        // it for the whole 9-16s of a carve — by far the worst place to have
        // that gap, since a carver is the one ant guaranteed to be standing
        // against a dirt face, and it holds still long enough for anyone
        // watching to see it embedded in the earth. A centre-in-dirt check
        // over moving ants reported 0% and completely missed this.
        if (ants.domain[i] === DOMAIN_UNDERGROUND) pushOutOfDirt(ants, i);
        continue;
      }
    } else {
      // FORAGE or RETURN — task-committed: no idling, no wander noise,
      // straight-line steering toward the current target instead.
      updateForageSteer(ants, i, dt, w, h);

      if (state === STATE_RETURN) {
        // Returning ants also lean toward nearby existing trail, not
        // just their own homeVector belief — without this, every
        // returning ant independently computes a slightly different
        // path home, spreading deposits across many nearby-but-distinct
        // cells instead of one shared route. This is what lets multiple
        // trips actually reinforce the SAME path (the classic tight
        // ant-trail convergence effect), rather than each ant
        // permanently carving its own line. Reuses the exact same
        // sensing/steering as WANDER's trail-following — it doesn't
        // care why it's being called, just biases toward what's nearby.
        followTrail(ants, i, dt);
      }
    }

    // Re-read domain here, not reuse anything captured before the
    // dispatch above — checkDigRecruitment/updateDigging may have just
    // crossed this ant between views this same tick (see digging.js),
    // and movement/physics need to match WHERE it actually is right
    // now, same reasoning as the currentState re-read just below.
    // Underground movement is a genuinely separate system (own
    // avoidance function, no pheromones, no obstacles, no
    // separation/path-integration yet — see underground.js) rather
    // than a branch inside the surface tail below.
    if (ants.domain[i] === DOMAIN_UNDERGROUND) {
      avoidTunnelWalls(ants, i, dt);
      integrate(ants, i, dt);
      ants.animPhase[i] += WALK_ANIM_FPS * dt;

      // hard clamp to the underground grid's bounds — same backstop
      // role as the surface wall clamp below, sized identically since
      // the grid spans the same viewport dimensions
      if (ants.x[i] < ANT_LENGTH) ants.x[i] = ANT_LENGTH;
      if (ants.x[i] > w - ANT_LENGTH) ants.x[i] = w - ANT_LENGTH;
      // Top edge deliberately allows an overshoot: the shaft mouth is a way
      // OUT, and an ant leaving climbs above the edge and off the picture
      // before it crosses domains (see atNestExit). Clamping it at
      // ANT_LENGTH like the other three sides would pin it on the boundary
      // and make it vanish in full view.
      if (ants.y[i] < -ENTRANCE_EXIT_OVERSHOOT * 2) ants.y[i] = -ENTRANCE_EXIT_OVERSHOOT * 2;
      if (ants.y[i] > h - ANT_LENGTH) ants.y[i] = h - ANT_LENGTH;

      // ...and out of solid dirt, the underground counterpart of the
      // obstacle clamp at the bottom of the surface tail. This domain had
      // no such backstop, which made avoidTunnelWalls() the ONLY thing
      // keeping ants out of the earth — and it can't hold a narrow
      // corridor on its own (see underground.js). Ants were spending
      // 14.6% of their underground time buried before this was added.
      pushOutOfDirt(ants, i);
      continue;
    }

    // Re-read state here rather than reuse the `state` captured above —
    // checkFoodDetection/updateForageSteer may have just changed it this
    // same tick (e.g. WANDER -> FORAGE), and we want THIS tick's actual
    // speed to match whatever it's doing right now, not what it was
    // doing a moment ago.
    const currentState = ants.state[i];
    let speedMult = 1;
    if (currentState === STATE_FORAGE) speedMult = FORAGE_SPEED_MULT;
    else if (currentState === STATE_RETURN) {
      speedMult = RETURN_SPEED_MULT;
      depositPheromone(ants.x[i], ants.y[i], dt); // laying trail on the way home with food
    }

    // wander()/updateForageSteer() only adjust rotation — integrate()
    // below is the only thing that actually moves the ant, so the
    // pre-movement position can be captured here regardless of which
    // branch ran above.
    const prevX = ants.x[i];
    const prevY = ants.y[i];

    avoidSurfaces(ants, i, w, h, obstacles, dt); // walls AND rocks, one coherent correction — see behaviors.js
    separationSteer(ants, i, dt); // steer away from crowding — see behaviors.js/spatialGrid.js
    integrate(ants, i, dt, speedMult);

    // Path integration: continuously accumulate this tick's true
    // movement, plus a small proportional random error (imperfect
    // odometry). This is a single running direction+distance ESTIMATE,
    // not a recorded route — the ant never retraces the path it
    // actually walked, it just beelines toward wherever it currently
    // believes home is. (Actual route-retracing is a different
    // mechanism — closer to what pheromone trails will provide later.)
    // Runs for every state that reaches this point — WANDER, FORAGE,
    // and RETURN alike — so the estimate keeps updating on the way
    // home too, self-correcting toward zero as the ant approaches the
    // nest. See foraging.js for how RETURN steers using this.
    const dx = ants.x[i] - prevX;
    const dy = ants.y[i] - prevY;
    const dist = Math.hypot(dx, dy);
    ants.homeVectorX[i] += dx + (Math.random() - 0.5) * HOME_VECTOR_ERROR_RATE * dist;
    ants.homeVectorY[i] += dy + (Math.random() - 0.5) * HOME_VECTOR_ERROR_RATE * dist;

    ants.animPhase[i] += WALK_ANIM_FPS * speedMult * dt;

    // hard clamp accounts for body extent, not just center point —
    // ANT_LENGTH is the furthest offset from center (the nose)
    if (ants.x[i] < ANT_LENGTH) ants.x[i] = ANT_LENGTH;
    if (ants.x[i] > w - ANT_LENGTH) ants.x[i] = w - ANT_LENGTH;
    if (ants.y[i] < ANT_LENGTH) ants.y[i] = ANT_LENGTH;
    if (ants.y[i] > h - ANT_LENGTH) ants.y[i] = h - ANT_LENGTH;

    // obstacle hard clamp — same backstop role as the wall clamp above:
    // obstacleAvoid should normally prevent this, but if steering ever
    // doesn't react fast enough (very fast approach, tight corner
    // between obstacles, etc.), push the ant back out to the surface
    // rather than letting it visibly clip inside a rock.
    for (const obs of obstacles) {
      const dx = ants.x[i] - obs.x;
      const dy = ants.y[i] - obs.y;
      const dist = Math.hypot(dx, dy);
      const minDist = obs.radius + ANT_LENGTH;
      if (dist < minDist && dist > 0.0001) {
        const push = minDist - dist;
        ants.x[i] += (dx / dist) * push;
        ants.y[i] += (dy / dist) * push;
      }
    }
  }
}