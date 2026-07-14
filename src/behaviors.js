// ============================================================
// Behaviors — the actual per-ant movement logic. Each function takes
// (ants, i, ...) and mutates that ant's slot directly. No return
// values except updateIdleState's idle flag.
// ============================================================
import {
  STATE_IDLE, STATE_WANDER,
  IDLE_ENTER_CHANCE, IDLE_MIN, IDLE_MAX,
  WANDER_STRENGTH, WANDER_DAMPING,
  HUG_FRACTION,
} from './config.js';

export function updateIdleState(ants, i, dt) {
  if (ants.state[i] === STATE_IDLE) {
    ants.stateTimer[i] -= dt;
    if (ants.stateTimer[i] <= 0) {
      ants.state[i] = STATE_WANDER;
    }
    return true; // currently idle
  }

  // wandering — roll for a chance to start idling this tick
  if (Math.random() < IDLE_ENTER_CHANCE * dt) {
    ants.state[i] = STATE_IDLE;
    ants.stateTimer[i] = IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN);
    // animPhase deliberately left untouched — freezes on whatever walk
    // frame was mid-stride, so idle reads as a natural pause rather than
    // snapping to a fixed rest pose.
    return true;
  }

  return false; // stays wandering
}

export function wander(ants, i, dt) {
  const noise = (Math.random() - 0.5) * Math.sqrt(12); // rescale to unit variance
  ants.rotationSpeed[i] += WANDER_STRENGTH * noise * Math.sqrt(dt);
  ants.rotationSpeed[i] -= ants.rotationSpeed[i] * WANDER_DAMPING * dt;
  ants.rotation[i] += ants.rotationSpeed[i] * dt;
}

export function edgeAvoid(ants, i, width, height, margin, dt, steerBase, steerUrgency) {
  let pushX = 0, pushY = 0;
  if (ants.x[i] < margin) pushX += (margin - ants.x[i]);
  else if (ants.x[i] > width - margin) pushX -= (ants.x[i] - (width - margin));
  if (ants.y[i] < margin) pushY += (margin - ants.y[i]);
  else if (ants.y[i] > height - margin) pushY -= (ants.y[i] - (height - margin));

  if (pushX === 0 && pushY === 0) return;

  const depth = Math.hypot(pushX, pushY); // 0 at margin's outer edge, ~margin at the wall
  const nx = pushX / depth, ny = pushY / depth; // points away from wall

  const hx = Math.cos(ants.rotation[i]), hy = Math.sin(ants.rotation[i]);
  const tA = { x: -ny, y: nx };
  const tB = { x: ny, y: -nx };
  const tangent = (tA.x * hx + tA.y * hy) > (tB.x * hx + tB.y * hy) ? tA : tB;

  // signed error vs desired hug distance: positive = too far from wall, negative = too close
  const desiredDepth = margin * HUG_FRACTION;
  const e = Math.max(-1, Math.min(1, (desiredDepth - depth) / margin));
  // e>0 pulls toward the wall (-normal), e<0 pushes away from it (+normal) — same vector, signed
  const desiredX = tangent.x * (1 - Math.abs(e)) - nx * e;
  const desiredY = tangent.y * (1 - Math.abs(e)) - ny * e;

  // danger: how directly the ant is currently heading INTO the wall.
  // +1 = heading straight away from wall (safe), -1 = heading straight at it (urgent).
  const headingDot = hx * nx + hy * ny;
  const danger = Math.max(0, -headingDot); // 0 when safe/parallel, ramps to 1 when charging straight in

  // blend base (loose hug, lets wander win) with urgency (sharp correction to avoid headbutt)
  const steerRate = steerBase + steerUrgency * danger;

  const targetAngle = Math.atan2(desiredY, desiredX);
  let diff = targetAngle - ants.rotation[i];
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));

  ants.rotation[i] += diff * steerRate * dt;
}

export function integrate(ants, i, dt) {
  ants.x[i] += Math.cos(ants.rotation[i]) * ants.speed[i] * dt;
  ants.y[i] += Math.sin(ants.rotation[i]) * ants.speed[i] * dt;
}