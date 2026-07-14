// ============================================================
// Behaviors — the actual per-ant movement logic. Each function takes
// (ants, i, ...) and mutates that ant's slot directly. No return
// values except updateIdleState's idle flag.
// ============================================================
import {
  STATE_IDLE, STATE_WANDER,
  IDLE_ENTER_CHANCE, IDLE_MIN, IDLE_MAX,
  WANDER_STRENGTH, WANDER_DAMPING,
  AVOID_MARGIN, AVOID_STEER_BASE, AVOID_STEER_URGENCY, AVOID_HUG_FRACTION,
  SEPARATION_RADIUS, SEPARATION_STEER_RATE,
} from './config.js';
import { forEachNearby } from './spatialGrid.js';

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

// Steers away from ANY nearby surface — walls and obstacles alike —
// folding every one of them into ONE combined push vector, rather than
// two independent systems that could fight each other. This used to be
// two separate functions (edgeAvoid for walls, obstacleAvoid for
// rocks), each computing its own correction with no idea the other
// existed — if a rock sat close enough to a wall for both avoidance
// zones to overlap, an ant caught in the squeeze got two uncoordinated
// corrections pulling against each other. Genuinely unifying them (same
// coherent-sum technique already proven for multi-obstacle notches)
// removes that failure mode structurally, rather than working around it
// by restricting where rocks can be placed.
export function avoidSurfaces(ants, i, width, height, obstacles, dt) {
  const x = ants.x[i], y = ants.y[i];
  const hx = Math.cos(ants.rotation[i]), hy = Math.sin(ants.rotation[i]);

  let pushX = 0, pushY = 0;
  let danger = 0;
  let any = false;
  let minSurfaceDist = Infinity;

  // Folds one surface's contribution into the running totals. nx,ny
  // must be a unit vector pointing AWAY from that surface. No-ops if
  // this particular surface is farther than AVOID_MARGIN away — safe to
  // call unconditionally for all 4 walls plus every obstacle.
  function addSurface(nx, ny, surfaceDist) {
    if (surfaceDist >= AVOID_MARGIN) return;
    any = true;
    const weight = Math.max(0, 1 - surfaceDist / AVOID_MARGIN); // 0 at margin's outer edge, 1 at surface
    pushX += nx * weight;
    pushY += ny * weight;
    const headingDot = hx * nx + hy * ny;
    danger = Math.max(danger, Math.max(0, -headingDot));
    minSurfaceDist = Math.min(minSurfaceDist, surfaceDist);
  }

  // walls — only the near side of each axis can possibly be in range
  if (x < width / 2) addSurface(1, 0, x);
  else addSurface(-1, 0, width - x);
  if (y < height / 2) addSurface(0, 1, y);
  else addSurface(0, -1, height - y);

  // obstacles
  for (const obs of obstacles) {
    const dx = x - obs.x, dy = y - obs.y;
    const centerDist = Math.hypot(dx, dy);
    if (centerDist < 0.0001) continue; // degenerate: exactly at an obstacle's center
    addSurface(dx / centerDist, dy / centerDist, centerDist - obs.radius);
  }

  if (!any) return;

  const pushMag = Math.hypot(pushX, pushY);
  if (pushMag < 0.0001) return; // genuinely canceled out (rare, perfectly symmetric squeeze) — nothing coherent this tick

  const nx = pushX / pushMag, ny = pushY / pushMag; // ONE combined outward normal, across every nearby surface

  const tA = { x: -ny, y: nx };
  const tB = { x: ny, y: -nx };
  const tangent = (tA.x * hx + tA.y * hy) > (tB.x * hx + tB.y * hy) ? tA : tB;

  // depth INCREASES toward the nearest surface (0 at margin's outer
  // edge, ~margin at the surface) — the convention the hug-blend
  // formula below expects. (minSurfaceDist runs the opposite way, 0 AT
  // the surface, so it gets converted here rather than fed in directly
  // — this exact mismatch was the sign-inversion bug from before.)
  const depth = AVOID_MARGIN - minSurfaceDist;
  const desiredDepth = AVOID_MARGIN * AVOID_HUG_FRACTION;
  const e = Math.max(-1, Math.min(1, (desiredDepth - depth) / AVOID_MARGIN));
  const desiredX = tangent.x * (1 - Math.abs(e)) - nx * e;
  const desiredY = tangent.y * (1 - Math.abs(e)) - ny * e;

  const steerRate = AVOID_STEER_BASE + AVOID_STEER_URGENCY * danger;
  const targetAngle = Math.atan2(desiredY, desiredX);
  let diff = targetAngle - ants.rotation[i];
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  ants.rotation[i] += diff * steerRate * dt;
}

export function integrate(ants, i, dt, speedMultiplier = 1) {
  const speed = ants.speed[i] * speedMultiplier;
  ants.x[i] += Math.cos(ants.rotation[i]) * speed * dt;
  ants.y[i] += Math.sin(ants.rotation[i]) * speed * dt;
}

// Steers away from other ants that get too close — rotation only, same
// additive-bias pattern as edgeAvoid. Queries the spatial grid rather
// than every other ant directly (see spatialGrid.js). Combines all
// nearby pushes into one direction, weighted so closer ants push
// harder, rather than reacting to just the single nearest one.
export function separationSteer(ants, i, dt) {
  let pushX = 0;
  let pushY = 0;
  let count = 0;
  const radiusSq = SEPARATION_RADIUS * SEPARATION_RADIUS;

  forEachNearby(ants, i, (j) => {
    const dx = ants.x[i] - ants.x[j];
    const dy = ants.y[i] - ants.y[j];
    const distSq = dx * dx + dy * dy;
    if (distSq < radiusSq && distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      const weight = (SEPARATION_RADIUS - dist) / SEPARATION_RADIUS; // closer = stronger push
      pushX += (dx / dist) * weight;
      pushY += (dy / dist) * weight;
      count++;
    }
  });

  if (count === 0) return; // nothing nearby, nothing to do

  const targetAngle = Math.atan2(pushY, pushX);
  let diff = targetAngle - ants.rotation[i];
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  ants.rotation[i] += diff * SEPARATION_STEER_RATE * dt;
}