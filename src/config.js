// ============================================================
// Config — every tunable constant lives here. Nothing else should
// hardcode a tuning value; import it from here instead.
// ============================================================

export const MAX_ANTS = 10000;
export const INITIAL_ANT_COUNT = 100;

// Sprite
export const ANT_LENGTH = 9;   // was 6 — also doubles as the wall hard-clamp radius, see sim.js
export const ANT_WIDTH = 2.5;  // currently only used by the brief pre-load triangle fallback

// Walk-cycle animation
export const WALK_FRAME_COUNT = 6;   // frames extracted from the source sheet
export const WALK_ANIM_FPS = 14;     // frame-steps/sec while wandering — cadence of the leg swing
                                      // TODO: currently fixed regardless of ants.speed[i]. Fine while
                                      // speed variance is small, but once discrete per-state speeds
                                      // exist (forage/carry/etc.), scale this by speed ratio so faster
                                      // ants visibly step faster — e.g. WALK_ANIM_FPS * (speed / baseSpeed)
                                      //
                                      // Idle uses these same frames — sim.js stops advancing animPhase
                                      // while idle, so the ant just holds its last walking frame.

// Sim rate
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

// States
export const STATE_IDLE = 0;
export const STATE_WANDER = 1;

// Idle behavior
export const IDLE_ENTER_CHANCE = 0.08;   // per second — chance to start idling while wandering
export const IDLE_MIN = 0.2;             // seconds
export const IDLE_MAX = 2.5;             // seconds
export const IDLE_TWITCH_CHANCE = 4.5;   // per second — how often a twitch fires while idle
export const IDLE_TWITCH_AMOUNT = 0.6;   // radians, single snap

// Wander (open-field behavior)
export const WANDER_STRENGTH = 4.0;      // rad/sec² — noise magnitude injected into angular velocity
export const WANDER_DAMPING = 3.0;       // 1/sec — how strongly angular velocity is pulled back to 0

// Edge behavior
export const EDGE_MARGIN = 22;           // px — band width where edge logic activates
export const EDGE_STEER_BASE = 1.5;      // gentle bias while roughly parallel to the wall
export const EDGE_STEER_URGENCY = 9.0;   // extra correction when heading straight at the wall
export const HUG_FRACTION = 0.85;        // 0-1 — target closeness to wall once hugging