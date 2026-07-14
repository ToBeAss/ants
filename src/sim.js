// ============================================================
// Sim step — orchestrates behaviors.js and foraging.js across every
// live ant. No physics/steering logic lives here directly; this just
// decides which behaviors run per-state and applies the shared
// hard-clamp backstop.
// ============================================================
import { ants } from './ants.js';
import { updateIdleState, wander, edgeAvoid, integrate, separationSteer } from './behaviors.js';
import { checkFoodDetection, checkNestDetection, updateForageSteer, updateHandling } from './foraging.js';
import { depositPheromone, decayPheromones, diffusePheromones, followTrail } from './pheromones.js';
import { rebuildSpatialGrid } from './spatialGrid.js';
import {
  ANT_LENGTH,
  EDGE_MARGIN, EDGE_STEER_BASE, EDGE_STEER_URGENCY,
  IDLE_TWITCH_CHANCE, IDLE_TWITCH_AMOUNT,
  WALK_ANIM_FPS,
  STATE_IDLE, STATE_WANDER, STATE_HANDLING, STATE_FORAGE, STATE_RETURN,
  HOME_VECTOR_ERROR_RATE,
  FORAGE_SPEED_MULT, RETURN_SPEED_MULT,
} from './config.js';

export function simStep(dt) {
  const w = window.innerWidth;
  const h = window.innerHeight;

  decayPheromones(dt); // once per tick, not per ant — a single pass over the whole grid
  diffusePheromones(dt); // ditto — spreads the trail, separate concern from decay shrinking it
  rebuildSpatialGrid(ants); // ditto — bins every ant fresh, used by separationSteer below

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
    } else if (state === STATE_HANDLING) {
      // Brief handling pause — frozen in place, same treatment as idle:
      // small twitch for character, no movement, no animation advance.
      updateHandling(ants, i, dt);
      if (Math.random() < IDLE_TWITCH_CHANCE * dt) {
        ants.rotation[i] += (Math.random() - 0.5) * IDLE_TWITCH_AMOUNT;
      }
      continue;
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

    // wander()/updateForageSteer()/edgeAvoid() only adjust rotation —
    // integrate() below is the only thing that actually moves the ant,
    // so the pre-movement position can be captured here regardless of
    // which branch ran above.
    const prevX = ants.x[i];
    const prevY = ants.y[i];

    edgeAvoid(ants, i, w, h, EDGE_MARGIN, dt, EDGE_STEER_BASE, EDGE_STEER_URGENCY);
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
  }
}