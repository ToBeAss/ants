// ============================================================
// Sim step — orchestrates behaviors.js across every live ant.
// No physics/steering logic lives here directly; this just decides
// which behaviors run and applies the shared hard-clamp backstop.
// ============================================================
import { ants } from './ants.js';
import { updateIdleState, wander, edgeAvoid, integrate } from './behaviors.js';
import {
  ANT_LENGTH,
  EDGE_MARGIN, EDGE_STEER_BASE, EDGE_STEER_URGENCY,
  IDLE_TWITCH_CHANCE, IDLE_TWITCH_AMOUNT,
  WALK_ANIM_FPS,
} from './config.js';

export function simStep(dt) {
  const w = window.innerWidth;
  const h = window.innerHeight;

  for (let i = 0; i < ants.count; i++) {
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
    edgeAvoid(ants, i, w, h, EDGE_MARGIN, dt, EDGE_STEER_BASE, EDGE_STEER_URGENCY);
    integrate(ants, i, dt);
    ants.animPhase[i] += WALK_ANIM_FPS * dt;

    // hard clamp accounts for body extent, not just center point —
    // ANT_LENGTH is the furthest offset from center (the nose)
    if (ants.x[i] < ANT_LENGTH) ants.x[i] = ANT_LENGTH;
    if (ants.x[i] > w - ANT_LENGTH) ants.x[i] = w - ANT_LENGTH;
    if (ants.y[i] < ANT_LENGTH) ants.y[i] = ANT_LENGTH;
    if (ants.y[i] > h - ANT_LENGTH) ants.y[i] = h - ANT_LENGTH;
  }
}