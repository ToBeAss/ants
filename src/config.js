// ============================================================
// Config — every tunable constant lives here. Nothing else should
// hardcode a tuning value; import it from here instead.
// ============================================================

export const MAX_ANTS = 10000;
export const INITIAL_ANT_COUNT = 100;    // was 100. Equals MAX_ANTS — no headroom left if anything else
                                          // ever spawns additional ants later

// Sprite
export const ANT_LENGTH = 6;   // was 9 — smaller ants make the fixed viewport feel like a bigger world
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

// ============================================================
// Palette — every colour both draw paths use. Gathered here (they used
// to be file-local consts in render.js/undergroundRender.js) because
// they're tuning values like any other, and because the two views have
// to be considered TOGETHER: the ant sprite is a black silhouette with
// no outline, so it is only ever as visible as the ground behind it.
// That constraint drives everything below — ground tones stay light,
// and anything an ant walks on must stay well clear of the sprite's
// value.
// ============================================================

// Surface. Painted by render.js as a filled rect rather than left to
// the page background, so both views own their own ground and the
// palette lives in one place. index.html's CSS background should match
// GROUND_COLOR — it's only visible for the instant before the first
// frame draws.
export const GROUND_COLOR = '#f2e1b4';    // warm sand. Was #ffefc1 (in CSS) — barely changed in value, just
                                           // pulled toward sand and away from pale yellow, which reads more
                                           // like ground and is a little easier on a screen left running.
export const NEST_COLOR = '#5c4326';      // dirt-mound marker — the darkest thing on the surface besides ants
export const FOOD_COLOR = '#5aa832';      // was #8fd14f: too close to the sand's brightness to read as a
                                           // distinct object at FOOD_DRAW_RADIUS, and ants standing on a food
                                           // pile disappeared into it. Deeper green separates from both.
export const OBSTACLE_COLOR = '#9a9187';  // stone, warmed slightly so it sits in the same family as the sand
                                           // instead of reading as a cold grey hole in the picture
export const CARRY_MARKER_COLOR = '#bcf07a'; // the morsel on a carrying ant — deliberately LIGHTER than
                                           // FOOD_COLOR: it's drawn on top of a black sprite, not on sand
export const SOIL_MARKER_COLOR = '#e0bd8b'; // the spoil pellet on a hauling ant. Same reasoning as
                                           // CARRY_MARKER_COLOR — light, because it sits on the black sprite in
                                           // BOTH views. Warm earth, so it never reads as food.
export const SPOIL_COLOR = '#d6b585';     // the crater of excavated earth around the entrance. Darker than
                                           // GROUND_COLOR so the mound is legible, but kept well clear of the ant
                                           // sprite's value — ants walk on it, and the palette rule is never to
                                           // darken a surface ants walk on (see the note above)

// Underground. The old palette had this exactly backwards for
// legibility: dirt was mid-brown (#7a5230) and dug tunnels were nearly
// black (#241812), so ants — the only thing that moves down there —
// were black-on-black inside the very spaces they'd dug. Inverted: dug
// galleries are the light surface (ants sharply visible in them, same
// figure/ground relationship as the surface view), packed earth is the
// dark mass around them. Nest structure stays legible because the two
// are far apart in value; carve progress interpolates between them, so
// a cell being worked visibly lightens as it opens.
export const UNDERGROUND_DIRT_COLOR = '#6f4c2e';   // packed earth
export const UNDERGROUND_TUNNEL_COLOR = '#f0dcb4'; // open gallery — kept close to GROUND_COLOR so an ant looks
                                                    // equally readable in either view
export const ENTRANCE_COLOR = '#8c5a14';  // the one point linking the views; dark enough to read against the
                                           // light gallery it sits in

// Chamber annotation (undergroundRender.js) — a ring + label per
// chamber purpose, drawn INSIDE the finished chamber, i.e. on light
// gallery floor, so these are dark and saturated. PLAN_COLOR is the
// exception: the chamber under construction is outlined over undug
// earth, so it has to be light instead.
// Pre-load placeholder triangle (antSprite.js), for the moment before
// the sprite frames decode. Dark, matching the actual sprite — it was
// pale (#e8d8b8), which is near-invisible against either view's ground.
export const ANT_FALLBACK_COLOR = '#141210';

export const CHAMBER_COLOR_QUEEN = 'rgba(150, 84, 8, 0.8)';   // not a purpose of its own any more — the
                                                               // deepest chamber IS the queen's (see nestPlan.js),
                                                               // so this annotates whichever brood chamber
                                                               // currently sits at the bottom
export const CHAMBER_COLOR_BROOD = 'rgba(32, 78, 138, 0.75)';
export const CHAMBER_COLOR_FOOD = 'rgba(38, 104, 46, 0.75)';
export const CHAMBER_COLOR_ATRIUM = 'rgba(120, 72, 24, 0.75)'; // the big shallow rooms just under the entrance
export const PLAN_COLOR = 'rgba(255, 240, 210, 0.45)';

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
export const STATE_DIG = 5;      // underground, carving tunnel — see digging.js. Only DOMAIN_UNDERGROUND ants
                                  // are ever in this state (see ants.js's domain flag); doubles as both
                                  // "traveling to a frontier cell" and "paused, carving," disambiguated by
                                  // stateTimer > 0, same dual-purpose pattern STATE_WANDER already uses for
                                  // idling (see behaviors.js's updateIdleState)

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

// Colony — shared colony-level resources (colony.js), distinct from
// world.js's physical environment layout. First consumer: the queen's
// egg-laying rate, once she exists (see ROADMAP.md Phase C).
export const FOOD_VALUE_PER_DELIVERY = 1; // added to colony.food per completed dropoff

// Underground — side-view tunnel grid (underground.js, ROADMAP.md Phase
// B). Grid cell size mirrors PHEROMONE_CELL_SIZE's role: coarse enough
// to be cheap, fine enough that a dug chamber/tunnel reads as a shape
// rather than a single giant block.
export const UNDERGROUND_CELL_SIZE = 8;                // px — world-space size of one grid cell
// The diggable area is deliberately NOT capped any more (decided
// 2026-07-26). It used to be an unlocked-region circle around the
// starting chamber (AntsCanada "test tube" containment framing, see
// ROADMAP.md) — what actually bounds digging now is demand: nestPlan.js
// only ever opens an excavation project the colony currently needs, so
// there's no runaway digging for a hard cap to prevent. Containment as
// a player-facing stewardship action is deferred, not deleted — see
// ROADMAP.md Phase B.

// Tunnel movement (underground.js's avoidTunnelWalls()) — mirrors
// AVOID_* above (same continuous-steering paradigm, dirt cells treated
// as blocking mass), but kept as its OWN constants rather than reused
// ones: grid-cell geometry (blocky, cell-quantized) isn't the same as
// the analytic wall/circle distances avoidSurfaces() reasons about, so
// this will likely need its own separate tuning pass once ants actually
// move underground (not yet wired into sim.js — see underground.js).
export const TUNNEL_AVOID_MARGIN = 12;          // px
export const TUNNEL_AVOID_STEER_BASE = 1.0;     // rad/sec — kept loose, same "don't trap an ant in a stable
                                                 // orbit with no corner to escape through" lesson as
                                                 // AVOID_STEER_BASE (see CLAUDE.md), doubly relevant here since
                                                 // dug tunnels can easily curve into pockets
export const TUNNEL_AVOID_STEER_URGENCY = 12.0; // rad/sec — the term that must win decisively head-on
export const TUNNEL_AVOID_HUG_FRACTION = 0.2;   // 0-1 — how close an ant WANTS to sit to a tunnel wall. Was 0.85,
                                                 // copied from AVOID_HUG_FRACTION, and that was the real cause of
                                                 // ants looking buried: at 0.85 the target standoff is ~1.8px, so
                                                 // ants pressed themselves against the dirt face and their sprite
                                                 // (about 12px long) was drawn mostly over solid earth — 91% of all
                                                 // underground samples had the body overlapping dirt, even with the
                                                 // ant's centre legally in open tunnel 100% of the time.
                                                 //
                                                 // Hugging is right on the SURFACE, where following an edge is
                                                 // useful and the ant is a small dark shape on open sand. It is
                                                 // exactly wrong in a 20px-wide corridor cut into a dark mass: what
                                                 // reads correctly there is walking down the middle. At 0.2 the
                                                 // standoff is ~9.6px, which centres an ant in a corridor.

// There is deliberately NO forward-probe/"feeler" steering here, and it's
// worth knowing why, because adding one is an obvious-looking idea.
//
// The push logic above genuinely does go silent in a corridor: a corridor is
// 2*NEST_TUNNEL_RADIUS (20px) wide against a TUNNEL_AVOID_MARGIN of 12, so
// dirt sits within margin on BOTH sides and the pushes cancel to nothing.
// That looks like it needs a probe ahead to fix. It was built (probe ahead,
// turn toward the most open direction) and measured against a control, and
// it was worse on every axis: dig throughput fell 36% (85 carved cells ->
// 54), heading reversals rose 31%, and ants walked 28% further to do less.
//
// Two reasons. Every dig target IS a dirt cell, so "steer away from dirt
// ahead" is in direct opposition to "walk to the dirt you came to remove" —
// and avoidance wins. And a probe that reacts to whichever wall is nearest
// ping-pongs, because turning away from one wall presents the other.
//
// What actually fixed ants walking into the earth was the missing hard
// position clamp (pushOutOfDirt, called from sim.js) — the same backstop the
// surface path already had for walls and obstacles, and which this domain
// simply never got. It takes burial from 14.6% of underground time to 0.00%
// on its own, with no steering change at all. Reach for the clamp, not a
// cleverer controller.

// Ant domain — which view an ant currently exists in (entrance
// linkage, ROADMAP.md Phase B). Every ant starts on the surface;
// nothing currently moves an ant to DOMAIN_UNDERGROUND — the first
// real consumer is the digging task, still later in Phase B. Until
// then enterUnderground()/exitToSurface() (underground.js) exist with
// no caller, same "ready, not yet wired" state avoidTunnelWalls() is
// already in.
export const DOMAIN_SURFACE = 0;
export const DOMAIN_UNDERGROUND = 1;

// Digging (digging.js) — recruitment mirrors IDLE_ENTER_CHANCE's
// per-second-probability pattern: a WANDERing, non-carrying ant near
// the nest has a small per-second chance to become a digger, rather
// than every ant that passes by triggering it — no direct player
// command, same stewardship-not-control principle as everything else.
// Additionally gated on the colony actually HAVING excavation work
// (nestPlan.js) — with no unmet need, nobody goes underground at all.
export const DIG_ENTER_CHANCE = 0.06;    // per second, only rolled while within SENSE_RADIUS of the nest AND
                                          // while the nest plan has an active project short of diggers. Was
                                          // 0.03 back when digging was always available; now that it's
                                          // need-gated, a project that IS open should staff up reasonably fast.
export const DIG_ARRIVE_RADIUS = ANT_LENGTH + UNDERGROUND_CELL_SIZE; // px — same "close enough to physically
                                          // act" idea as PICKUP_RADIUS/NEST_ARRIVE_RADIUS
export const DIG_FORCE_MAX = 8;          // simultaneous diggers on the active project — the rest of the colony
                                          // keeps foraging. Excavation is a side activity, not the whole colony
                                          // downing tools.
// Excavating one cell is SLOW — real ants shift soil grain by grain,
// and a chamber is the work of many ants over a long time. Was 0.6-1.4s
// (a pickup-sized pause), which made a whole chamber appear in seconds
// and read as instant terraforming rather than labour. At ~12s/cell a
// typical project (see NEST_* below, roughly 60-90 cells) is a couple
// of minutes of visible work for a full dig force — deliberately on the
// ambient timescale the project is built around, not an action beat.
export const DIG_CARVE_MIN = 9;          // seconds to carve one cell
export const DIG_CARVE_MAX = 16;
export const DIG_TWITCH_CHANCE = 7.0;    // per second — faster than IDLE_TWITCH_CHANCE (4.5) and, below,
export const DIG_TWITCH_AMOUNT = 0.3;    // radians — a smaller snap than IDLE_TWITCH_AMOUNT (0.6). A carve
                                          // holds an ant still for DIG_CARVE_MIN..MAX seconds, far longer than
                                          // any idle/handling pause, so it needs visible activity or it reads
                                          // as a stuck ant — and busy scraping at a wall is a quick small
                                          // motion, where idle glancing-about is a slower larger one.
export const DIG_TRAVEL_TIMEOUT = 30;    // seconds — a digger that can't reach its claimed cell in this long is
                                          // stuck (no pathfinding: a claimed cell around a bend can be genuinely
                                          // unreachable by straight-line seeking). Gives up, releases the claim
                                          // for someone better-placed, and heads out. Same "give up on a belief
                                          // that isn't working" idea foraging.js uses for lost carriers.
export const DIG_EXIT_TIMEOUT = 45;      // seconds — backstop on the walk back to the entrance, for the same
                                          // reason; on expiry the ant surfaces regardless of where it got to,
                                          // same spirit as sim.js's hard position clamps

// Spoil (spoil.js) — the excavated earth. A carved cell used to just become
// tunnel with the dirt vanishing; now a digger carries a pellet up and out
// and drops it on a growing crater around the entrance, the way real
// ground-nesting colonies do. Visible in both views (a hauling ant wears a
// marker exactly like a food-carrying one) and persistent — the mound is an
// accumulating record of how much this colony has dug.
export const SPOIL_BIN_COUNT = 24;       // angular bins around the entrance the crater is tracked in — a crater is
                                          // radially symmetric to a first approximation, so a heightfield would be
                                          // a lot of machinery for the same picture
export const SPOIL_INNER_RADIUS = 26;    // px — inner edge of the mound, just clear of NEST_DRAW_RADIUS so the
                                          // nest marker still reads as the hole in the middle
export const SPOIL_BAND_WIDTH = 30;      // px — how far out the rim creeps once a direction is fully piled
export const SPOIL_HEIGHT_PER_PELLET = 1; // one carved cell = one pellet
export const SPOIL_FULL_HEIGHT = 26;     // pellets in one bin before that direction is piled as high as it gets
                                          // (further pellets there stop pushing the rim outward)
export const SPOIL_LEVEL_TOLERANCE = 1.5; // pellets — how far above the lowest pile still counts as "below
                                          // optimal". This is what stops every hauler walking to the single
                                          // globally-lowest bin: several bins are usually tied, so each ant takes
                                          // the nearest of them and the crater fills evenly on its own
export const SPOIL_EDGE_MARGIN = 14;     // px — dump points must stay this far inside the world. The nest is in a
                                          // corner, so half the crater's directions are off-world and the colony
                                          // correctly piles on the side it has room for
export const SPOIL_DROP_RADIUS = 9;      // px — close enough to the chosen rim point to drop the pellet
export const SPOIL_HAUL_TIMEOUT = 25;    // seconds — give-up bound on the walk to the rim, same role as
                                          // DIG_TRAVEL_TIMEOUT. On expiry the pellet is dropped where the ant
                                          // stands (still binned by direction), so spoil is never destroyed and a
                                          // wall-hugged hauler can't hold a dig-force slot forever

// Nest planning (nestPlan.js) — the colony decides WHAT to excavate and
// WHEN, and diggers carry out that plan. Chambers exist for a purpose and
// are only dug once the colony actually needs one: a nest that expands
// ahead of demand is wasted work and, in real ant-keeping terms, extra
// tunnel exposed to predators for no gain.
//
// Reworked 2026-07-26 (ROADMAP.md Phase B2) around the one thing real
// nest architecture is organized by: DEPTH. Chambers hang off a single
// mostly-vertical shaft, and how deep a chamber is decides how big it is
// and who lives in it. What this replaced — chambers branching off a
// randomly chosen existing chamber, with radius keyed to purpose — grew
// a spreading bush and put the queen in the shallowest room, which is
// backwards on both counts.

// --- The shaft ---
// Real shafts descend at 20-30 degrees from horizontal near the surface,
// steepening to 45-60 degrees deeper down, wandering in a loose helix
// (~4-6cm across in P. badius). These angles are measured ALONG that
// helix; this project only digs in the single plane visible against the
// glass, so what's modeled here is the helix's apparent descent in
// cross-section — steeper than the path angle, and read as a zig-zag
// rather than a spiral. Same "against the glass" simplification the
// underground view is built on.
export const SHAFT_SEGMENT_LENGTH = 55;  // px — one zig or zag of the descent
export const SHAFT_ANGLE_SHALLOW = 0.85; // rad from vertical (~49 deg) near the surface — a shallow, spreading
                                          // descent, which is also what spreads the big top chambers out
                                          // laterally rather than stacking them
export const SHAFT_ANGLE_DEEP = 0.35;    // rad from vertical (~20 deg) once deep — near-vertical, chambers stack
export const SHAFT_STEEPEN_DEPTH = 200;  // px of depth over which the angle interpolates shallow -> deep
export const SHAFT_ANGLE_WANDER = 0.22;  // rad — jitter per segment, so the descent isn't a mechanical zig-zag
export const SHAFT_INITIAL_DEPTH = 110;  // px — depth of the founding nest, dug before the sim starts. Real
                                          // incipient nests are already ~30cm deep against a mature 2.5-3m, so
                                          // the colony starts underground, not scratching at the surface.
export const SHAFT_MARGIN = 20;          // px — keep the shaft (and chambers) this far off the grid edges
// How deep the nest is ALLOWED to get, as a function of worker population.
// Measured nests are strikingly reluctant to deepen: every 10-fold
// increase in workers buys only ~2.4x the depth, while total chamber area
// grows ~7.5x. So a growing colony gets its space mostly from more and
// bigger rooms, not a longer shaft — and without this cap it doesn't:
// demand for brood chambers (which have to sit in the bottom third) drove
// the shaft straight to the bottom of the world at three times the
// population that should have reached it.
export const NEST_DEPTH_ALLOMETRY = 0.38;      // log10(2.4) — the measured exponent
export const NEST_DEPTH_REFERENCE_POP = 15;    // workers the FOUNDING nest's depth corresponds to. Small on
                                          // purpose: founding is one queen and her first cohort, so the starting
                                          // INITIAL_ANT_COUNT colony has already grown well past it and should
                                          // have expansion work waiting on day one. Set to 100 at first, which
                                          // meant a 100-ant colony was treated as exactly fitting its founding
                                          // nest — it had a space deficit it was structurally forbidden from
                                          // acting on, so it dug nothing at all and the underground view sat
                                          // static until the player dropped food.

// --- Chambers hang off the shaft ---
export const CHAMBER_STUB_LENGTH = 14;   // px — the short lateral neck from shaft to chamber. Short by
                                          // construction, which is what retires the old "a long corridor can cut
                                          // across older tunnels" problem: nothing long is ever dug between rooms.
export const CHAMBER_RADIUS_SHALLOW = 50; // px — chamber radius just under the surface
export const CHAMBER_RADIUS_DEEP = 22;   // px — chamber radius at the bottom of the nest. Radius decays
                                          // geometrically between the two, giving shallow chambers ~5x the AREA of
                                          // deep ones — the measured ratio is 5-6x, and roughly half of all
                                          // chamber area sitting in the top quarter falls out of this plus the
                                          // depth bands below.
export const CHAMBER_STUNT_LIMIT = 0.75; // 0-1 — reject a site where the surface overhead forces a room below
                                          // this fraction of the size its depth calls for. A colony waits for the
                                          // nest to deepen rather than settling for a token room, which is why an
                                          // incipient nest has no big top chambers: without this, two stunted
                                          // 17px "atriums" got dug 40px down and permanently occupied the spot
                                          // where the real ones belonged.
// Chamber enlargement. Real nests grow by deepening, adding rooms AND
// widening the rooms they already have, simultaneously — and widening
// contributes the MOST of the three. It's also the only way a room dug
// early (small, because it was the deep one at the time) can become the
// big shallow room it now sits at the depth of: without it every chamber
// keeps the size it was dug at, and a mature nest came out with shallow
// rooms only ~1.7x the area of deep ones instead of the measured 5-6x.
export const CHAMBER_ENLARGE_STEP = 8;   // px of radius per widening project — incremental, so a room grows
                                          // visibly over several rounds rather than jumping to size
export const CHAMBER_ENLARGE_MIN_GAIN = 5; // px — don't open a project to gain less than this
export const FOUNDING_CHAMBER_RADIUS = 26; // px — the single small room at the bottom of the founding shaft. The
                                          // queen and her first brood share one cramped chamber in reality; the
                                          // big rooms come later, as the nest deepens.

// Depth bands, as fractions of the shaft's CURRENT depth — so the nest
// keeps its proportions as it deepens, matching the finding that the
// size-free shape of a nest doesn't change as the colony grows. A
// chamber already dug stays put, so its band position drifts shallower
// over the colony's life; that's why top-heaviness is a distribution
// rather than a property of any one room.
export const BAND_ATRIUM_MIN = 0.08;     // atrium: the big shallow rooms where returning foragers unload
export const BAND_ATRIUM_MAX = 0.26;
export const BAND_FOOD_MIN = 0.36;       // stores: real harvester ants keep seeds in a strictly MIDDLE band
export const BAND_FOOD_MAX = 0.62;       // (40-100cm of a 2-3m nest) — never at the top, never at the bottom
export const BAND_BROOD_MIN = 0.68;      // brood, nurses, callows and the queen: the bottom third
export const BAND_BROOD_MAX = 1.0;

// --- Demand ---
// Demand is for chamber AREA per stratum, not a count of rooms. Counting
// rooms had two fatal problems: a demand of "15 brood chambers" is
// geometrically impossible in a bounded world, so the colony either dug
// to the floor chasing it or stalled forever; and widening an existing
// room satisfied no demand at all, which made enlargement — the dominant
// growth mode in real nests — dead code. Area fixes both, and it's what
// the colony actually needs. (Partly anticipates ROADMAP.md Phase B4's
// move from arbitrary counters to space adequacy.)
export const BROOD_AREA_PER_ANT = 26;    // px^2 of brood chamber the colony wants per worker. The founding
                                          // chamber is worth ~80 workers, so the starting colony has genuinely
                                          // outgrown it. Population stands in for brood count until brood exists
                                          // (Phase C/D), at which point this reads the brood array instead.
export const ATRIUM_AREA_PER_ANT = 30;   // px^2 per worker. The largest per-ant appetite of the three, which is
                                          // what makes total chamber area come out top-heavy the way measured
                                          // nests are (~half of all area in the top quarter)
export const STORE_AREA_PER_FOOD = 12;   // px^2 of store chamber per unit of colony.food held
export const NEST_PROJECT_COOLDOWN = 25; // seconds of quiet after finishing a project before the colony will
                                          // open another, even if demand is already there — keeps expansion
                                          // paced and deliberate rather than one continuous excavation

// --- Layout mechanics ---
export const NEST_TUNNEL_RADIUS = 10;    // px — shaft/stub half-width. Must exceed UNDERGROUND_CELL_SIZE/2 by a
                                          // real margin: a one-cell-wide corridor puts dirt within
                                          // TUNNEL_AVOID_MARGIN on BOTH sides, whose push vectors cancel (see
                                          // avoidTunnelWalls) and leave an ant steering blind down it.
export const NEST_CHAMBER_CLEARANCE_SHALLOW = 14; // px — dirt left between chamber edges near the surface
export const NEST_CHAMBER_CLEARANCE_DEEP = 34;    // px — and deep down. Spacing WIDENS with depth in real nests
                                          // (2-4cm near the surface to 20-30cm deep), which is the opposite of
                                          // what a single flat clearance value produces.
export const NEST_SITE_ATTEMPTS = 60;    // candidate attachment points tried along the band before giving up on
                                          // placing this chamber. Failing isn't an error: it means the band has
                                          // no room yet, and the colony deepens the shaft instead (see
                                          // nestPlan.js) — which grows every band's absolute room and is how the
                                          // nest gets deep enough for the big top chambers in the first place.