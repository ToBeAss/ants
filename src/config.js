// ============================================================
// Config — every tunable constant lives here. Nothing else should
// hardcode a tuning value; import it from here instead.
// ============================================================

export const MAX_ANTS = 500;
export const INITIAL_ANT_COUNT = 500;    // was 100. Equals MAX_ANTS — no headroom left if anything else
                                          // ever spawns additional ants later

// Sprite
export const ANT_LENGTH = 5;   // was 9 — smaller ants make the fixed viewport feel like a bigger world
export const ANT_WIDTH = 2.5;  // currently only used by the brief pre-load triangle fallback

// Shadow — an unblurred ellipse under each ant, rotated to match body
// heading and elongated along the long axis (nose-to-tail), same
// convention as the sprite draw. Offset stays fixed in world space
// regardless of heading — it represents a constant light direction, not
// something tied to the ant's own orientation. Kept slightly SMALLER than
// the sprite's own footprint and only lightly offset, so it mostly sits
// hidden under the opaque body — a visible sliver peeking out past the
// sprite reads as a separate pale object next to the ant, not a shadow
// attached to it. Still cheap: no blur, no gradient, just a filled shape.
export const SHADOW_COLOR = 'rgba(0, 0, 0, 0.45)';
export const SHADOW_LENGTH = ANT_LENGTH * 0.95; // semi-axis along body's long axis
export const SHADOW_WIDTH = ANT_LENGTH * 0.35;  // semi-axis across the body
export const SHADOW_OFFSET_Y = ANT_LENGTH * 0.12; // small fixed world-space offset (light direction)

// Walk-cycle animation
export const WALK_FRAME_COUNT = 6;   // frames extracted from the source sheet
export const WALK_ANIM_FPS = 14;     // frame-steps/sec at baseline (WANDER) speed — cadence of the leg
                                      // swing. Scaled by the same per-state speed multiplier as actual
                                      // movement (see FORAGE_SPEED_MULT/RETURN_SPEED_MULT below), so
                                      // legs visibly speed up/slow down along with the body — was a
                                      // TODO here before per-state speeds existed.
                                      //
                                      // Idle uses these same frames — sim.js stops advancing animPhase
                                      // while idle, so the ant just holds its last walking frame.

// Per-state speed — WANDER stays exactly at the ant's own spawned base
// speed (unchanged), acting as the middle point: FORAGE is faster
// (urgency, beelining for spotted food), RETURN is slower (encumbered,
// carrying it back). Flat multipliers for now, uniform regardless of
// what's being carried — food currently has no weight/type attribute
// to vary by. Natural follow-up once food sources have any variety
// worth differentiating: read a per-food weight instead of a flat
// RETURN_SPEED_MULT.
export const FORAGE_SPEED_MULT = 1.15;
export const RETURN_SPEED_MULT = 0.85;

// Pheromones — RETURN-state ants (carrying food) deposit trail as they
// walk; it decays continuously over time. This first pass is grid +
// deposit + decay + visualization only — no ant reacts to the trail
// yet. Trail-FOLLOWING (wandering ants biasing toward nearby
// concentration) is real steering complexity on its own; deliberately
// a separate next step once the trail itself looks/feels right.
export const PHEROMONE_CELL_SIZE = 8;            // px — world-space size of one grid cell
export const PHEROMONE_DEPOSIT_RATE = 40;        // concentration/sec added to an ant's current cell while RETURNing
export const PHEROMONE_MAX = 100;                // per-cell cap — prevents unbounded buildup where many ants overlap
export const PHEROMONE_DECAY_RATE = 0.015;       // per second, exponential (~46s half-life) — was 0.035
                                                  // (~20s), too fast for a trail meant to persist and
                                                  // visibly strengthen over many trips
export const PHEROMONE_DIFFUSE_RATE = 0.4;       // per second — how quickly each cell blends toward its
                                                  // neighbors' average, softening/widening the trail over
                                                  // time. Separate concern from decay: decay shrinks
                                                  // magnitude, diffusion spreads shape. A single-cell-wide
                                                  // trail is hard for a 3-point sensor to reliably hit
                                                  // unless approaching nearly parallel to it.
export const PHEROMONE_COLOR = [100, 200, 255];  // RGB — teal, visually distinct from the green food/carry markers

// Trail-following — wandering ants sample pheromone at 3 points ahead
// (forward, forward-left, forward-right) and gently bias steering
// toward whichever direction reads strongest. Only applies during
// WANDER — FORAGE/RETURN are already task-committed to a known target
// and ignore the trail entirely. One-directional limitation: this
// single trail type doesn't distinguish "toward food" from "toward
// nest" — following it can help either a searching ant OR a lost
// carrying ant (the trail connects both landmarks), but there's no way
// to know which end is which from concentration alone. A second
// direction-specific pheromone would resolve that; deliberately not
// built yet.
export const TRAIL_SENSOR_DISTANCE = 26;    // px — how far ahead the 3 sensor points sample
export const TRAIL_SENSOR_ANGLE = 0.6;      // rad (~34°) — angular spread of the left/right sensors
export const TRAIL_STEER_RATE = 4.5;        // rad/sec — needs a real margin over wander's own noise floor
                                             // (equilibrium ~1.63 rad/sec) to reliably win out, same lesson
                                             // learned tuning wall-hugging earlier. Was 2.0 — too close to
                                             // wander's own noise to consistently pull an ant onto a trail.
export const TRAIL_FOLLOW_THRESHOLD = 3;    // minimum concentration worth reacting to — filters out
                                             // near-decayed residue so faint noise doesn't cause twitching
export const LOST_TRAIL_STEER_RATE = 7.0;   // rad/sec — stronger pull than TRAIL_STEER_RATE, used only
                                             // for carrying ants that gave up on their belief and fell
                                             // back to WANDER (see foraging.js) — actively hunting for ANY
                                             // trail home, not casually noticing one while searching for food

// Separation — ants steer away from others that get too close. Uses a
// spatial grid (spatialGrid.js) for efficient nearby-ant lookup rather
// than checking every ant against every other ant — O(n²) brute-force
// would be far too expensive at the ant counts this project targets
// (10k+); binning brings it down to roughly O(n * ants-per-cell).
// Rotation-only (steers heading away from crowding), same additive-bias
// pattern as edgeAvoid/followTrail — doesn't apply to IDLE/HANDLING
// ants, which don't move at all regardless.
export const SEPARATION_RADIUS = 12;        // px — personal space radius
export const SEPARATION_STEER_RATE = 1.2;   // rad/sec — was 3.0, comparable in strength to SEEK_STEER_RATE
                                             // (3.5)/TRAIL_STEER_RATE (4.5). On a busy trail an ant has
                                             // near-constant neighbors within SEPARATION_RADIUS, so at 3.0
                                             // this wasn't an occasional nudge, it was fighting the
                                             // homeward pull almost every tick — enough sustained sideways
                                             // pressure to drag RETURN ants into persistent off-path
                                             // excursions, which then got dutifully deposited as spur
                                             // trails leading nowhere. Should still prevent literal
                                             // stacking over time, just without overpowering intent.

// Sim rate
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

// States
export const STATE_IDLE = 0;
export const STATE_WANDER = 1;
export const STATE_FORAGE = 2;   // beelining toward a detected food source
export const STATE_RETURN = 3;   // beelining back to the nest, carrying food
export const STATE_HANDLING = 4; // paused briefly for pickup or dropoff — see foraging.js for how
                                  // the `carrying` flag disambiguates which one it is on completion

// Foraging — proximity-based detection only, no pheromones yet. Once an
// ant is FORAGE/RETURN it's task-committed: no wander noise, no idling,
// straight-line steering to the target. Speed is currently the same
// across all states — a natural follow-up once this feels stable is
// discrete per-state speed (urgency while foraging, slowdown while
// carrying), same idea flagged for WALK_ANIM_FPS above.
export const SENSE_RADIUS = 95;                 // px — was 75. How far a wandering ant NOTICES food, or (while
                                                  // carrying) that it's in the general vicinity of the
                                                  // nest — a broad awareness radius, same for both. This
                                                  // is NOT delivery precision — see NEST_ARRIVE_RADIUS
                                                  // below for that. Sensing the nest switches steering to
                                                  // aim at its true position (see foraging.js), same as
                                                  // FORAGE already steers at food's true position, not an
                                                  // estimate.
export const NEST_RADIUS = 24;                  // px — counts as reaching the ant's own BELIEVED target
                                                  // while the true nest hasn't been sensed yet (may not be
                                                  // the true nest at all — see foraging.js's WANDER fallback)
export const SEEK_STEER_RATE = 3.5;             // rad/sec — turn-toward-target speed while tasked
export const FOOD_AMOUNT = 40;                  // was 10. Pickups per source before it's fully depleted (no auto-respawn — see world.js)
export const NEST_CORNER_MARGIN = 60;           // px — nest inset from the bottom-left corner
export const NEST_DRAW_RADIUS = 20;             // px — visual size of the nest marker
export const FOOD_DRAW_RADIUS = 9;              // px — visual size of a food marker. Was 6 — bumped up,
                                                  // partly cosmetic, partly to give PICKUP_RADIUS below more
                                                  // room now that it's actually derived from this.
export const NEST_ARRIVE_RADIUS = NEST_DRAW_RADIUS + ANT_LENGTH; // px — tight delivery precision once the
                                                  // true nest has been sensed — symmetric to PICKUP_RADIUS
                                                  // for food. Must be physically at the nest, not just
                                                  // "roughly nearby," to actually complete a dropoff.
export const PICKUP_RADIUS = FOOD_DRAW_RADIUS + ANT_LENGTH; // px — same formula as NEST_ARRIVE_RADIUS above.
                                                  // Previously an independent ANT_LENGTH*1.4 (~7px) that
                                                  // happened to sit close to the old FOOD_DRAW_RADIUS (6px)
                                                  // by coincidence, not by design — every FORAGE ant steering
                                                  // at food's exact single point, combined with a radius this
                                                  // tight, meant separation had almost no room to work,
                                                  // producing visible jams/circling right at the food marker.

// Handling pauses — pickup/dropoff aren't instant. Ant holds still
// (frozen on its current walk frame, same as idle) for a brief random
// duration before continuing. Both use STATE_HANDLING; which duration
// applies depends on context at the moment the pause starts (see
// foraging.js). Reuses stateTimer, same mechanism as IDLE_MIN/MAX.
export const PICKUP_MIN = 0.5;  // seconds — was 0.3. Brief pause "grabbing" food before departing
export const PICKUP_MAX = 1.0;  // was 0.7
export const DROPOFF_MIN = 0.5; // was 0.3. Brief pause "handing off" food at the nest
export const DROPOFF_MAX = 1.0; // was 0.7

// Path integration (dead reckoning) — RETURN steering uses this instead
// of reading nest.x/y directly. Updated every tick an ant actually
// moves (see sim.js), continuously integrating true displacement plus a
// small proportional random error, mimicking imperfect ant "odometry."
// Reset to exactly zero once an ant's own belief says it has arrived —
// real ants recalibrate via local nest cues on arrival, this is that.
// Kept conservative: high enough to be a visible subtle wobble, low
// enough that accumulated drift should stay well under NEST_RADIUS for
// typical trip lengths. Raise it to make homing visibly less precise.
export const HOME_VECTOR_ERROR_RATE = 0.08;

// Idle behavior
export const IDLE_ENTER_CHANCE = 0.08;   // per second — chance to start idling while wandering
export const IDLE_MIN = 0.2;             // seconds
export const IDLE_MAX = 2.5;             // seconds
export const IDLE_TWITCH_CHANCE = 4.5;   // per second — how often a twitch fires while idle
export const IDLE_TWITCH_AMOUNT = 0.6;   // radians, single snap

// Wander (open-field behavior)
export const WANDER_STRENGTH = 4.0;      // rad/sec² — noise magnitude injected into angular velocity
export const WANDER_DAMPING = 3.0;       // 1/sec — how strongly angular velocity is pulled back to 0

// Surface avoidance — shared by walls AND obstacles (see avoidSurfaces()
// in behaviors.js). These used to be two separate, independently-tuned
// systems (EDGE_* for walls, OBSTACLE_* for rocks) that could fight
// each other when a rock sat close to a wall — each computed its own
// steering correction with no idea the other existed, same class of
// problem as the obstacle-obstacle notch bug, just between two systems
// that were never unified. Now genuinely one system: walls and
// obstacles both contribute a push vector to the SAME combined
// calculation, so there's only ever one coherent correction, regardless
// of how many surfaces (walls, rocks, or both) an ant is near at once.
export const AVOID_MARGIN = 12;          // px — was 18, before that 30/20. Kept shrinking for the same
                                          // reason each time: narrow gaps between obstacles read as
                                          // blocked when two nearby margin zones overlap in the opening.
export const AVOID_STEER_BASE = 1.0;     // was 1.5. Gentle bias while roughly parallel to a surface — kept loose
                                          // deliberately, so wander/seek can occasionally win and let an
                                          // ant break away, rather than getting trapped hugging forever
                                          // (circles especially have no corner to force an exit)
export const AVOID_STEER_URGENCY = 12.0; // extra correction when heading straight at a surface — this is
                                          // the part that needs to win decisively
export const AVOID_HUG_FRACTION = 0.85;  // 0-1 — target closeness once hugging

// Obstacles — hand-placed circular rocks (Shift+Click, see main.js).
// Obstacle count is expected to stay small (hand-placed), so avoidance
// does a plain per-ant linear scan over all obstacles — no spatial grid
// needed here, unlike ant-ant separation where ant count can be huge.
export const OBSTACLE_RADIUS = 25;       // px — size of a placed rock