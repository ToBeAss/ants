# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A real-time, always-on digital ant colony simulation (Canvas2D, vanilla JS ES modules, zero dependencies, no build step). Intended as an ambient screen you can leave running — see section on design philosophy below.

## Running it

There is no build/test/lint tooling (no `package.json`). To run:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`. **Do not open `index.html` via `file://`** — ES module imports fail silently under `file://` (blank canvas, check the browser console).

Controls: Click = spawn food at cursor (surface view only). Shift+Click = place a circular obstacle (surface view only). `T` = toggle pheromone trail overlay (visual only, doesn't affect simulation). `V` = toggle between the surface and underground views (visual only — the simulation keeps running in both regardless of which is on screen).

## Design philosophy (read before adding features)

The interaction model is **stewardship, not control** — the player nudges the colony (drop food, place obstacles, toggle views) and never commands individual ants directly. The goal is to approximate real ant-keeping, not to build a pathfinding tech demo; ants use proximity-based sensing and pheromone trails, not pathfinding. Idle/non-interaction time should still feel alive.

See `ROADMAP.md` for the current plan and priorities (colony growth — queen, brood, food economy, and a new underground tunnel system the queen/brood will live in — is the active focus; movement/foraging/pheromones are already deep).

## Architecture

```
index.html   — canvas element, loads src/main.js as the sole module entry point
src/
  config.js       — every tunable constant, including the full colour palette for both views; single source of truth, nothing hardcodes a tuning value elsewhere
  ants.js         — SoA (Structure-of-Arrays) typed-array store for ants + spawn/kill
  behaviors.js    — generic movement primitives: wander, avoidSurfaces, separationSteer, integrate
  foraging.js     — task state machine: food/nest detection, seek-steering, pickup/dropoff
  world.js        — environment data: nest, food sources, obstacles
  colony.js       — colony-level state: shared food store, and eventually the queen/brood (Phase C)
  underground.js  — underground tunnel grid (dirt/tunnel cells), entrance linkage, tunnel-wall avoidance
  nestPlan.js     — what the colony needs excavated and where: chamber registry, demand rules, one active project at a time
  digging.js      — the DIG task: recruitment, entrance crossing, claiming and carving one planned cell at a time
  pheromones.js   — trail grid: deposit/decay/diffuse/sample/follow
  spatialGrid.js  — coarse ant-position binning for fast neighbor queries
  sim.js          — per-tick orchestration; decides which behaviors run per ant state
  render.js       — surface drawing, plus the surface/underground view dispatcher; reads ant state, never mutates it
  undergroundRender.js — underground view drawing (dirt/tunnel cells, entrance, unlocked-region boundary)
  main.js         — wiring, input handling, fixed-timestep loop, init
```

**File ownership is strict** — each file owns one concern and nothing reaches into another's internals directly. Respect this when extending: new concerns get new files (e.g. a hypothetical nursing behavior would be `nursing.js`, not folded into `foraging.js`).

### Core architectural decisions

- **Structure-of-Arrays for ants, not per-ant objects.** `ants.x`, `ants.y`, `ants.rotation`, etc. are parallel typed arrays (`ants.js`), chosen for scale — the simulation targets up to `MAX_ANTS` (currently 10,000). Match structure to actual scale for new entity types rather than defaulting to SoA everywhere (e.g. `spatialGrid.js` uses a plain `Map` since simplicity mattered more than raw throughput there).
- **Ant array index is not stable identity.** `killAnt()` does swap-and-pop, so an index can silently refer to a different ant next tick. Anything that needs to reference a specific ant persistently must use `ants.id[i]` plus the `idToIndex` Map, never a raw index.
- **Fixed timestep simulation, decoupled from render rate.** `main.js`'s `frame()` runs an accumulator loop; `simStep(dt)` always advances in fixed `SIM_DT` (`1/60`s) chunks regardless of actual frame rate. Render runs once per animation frame at whatever rate the display allows.
- **Steering is additive and compositional.** Nearly every behavior follows the same pattern: compute a desired angle, take the normalized angle difference from current heading (`Math.atan2(Math.sin(diff), Math.cos(diff))`), nudge `rotation` by `diff * steerRate * dt`. Multiple behaviors (wander, avoidSurfaces, separationSteer, followTrail, seek) stack additively within one tick — see `sim.js` for the per-tick order.
- **Walls and obstacles are one unified avoidance system** (`avoidSurfaces()` in `behaviors.js`), not two independent systems. They used to be separate and could fight each other where a rock sat near a wall; now every nearby surface (4 walls + every obstacle) contributes to one combined push vector before a single steering correction is applied. When adding new surface-like hazards, fold them into this function rather than writing a parallel avoidance path.
- **Digging is demand-driven, and the decision lives above the ant.** `nestPlan.js` decides *what* the colony excavates (a chamber for a purpose — queen/brood/food store — only once a demand rule says it needs one, one project at a time, cooldown between); `digging.js` decides only how one ant carries that out (claim a cell, walk to it, carve it). An ant never picks a cell to dig on its own initiative, and with every need met, nobody digs at all. This replaced "carve the nearest reachable dirt," which eroded a shapeless blob outward from the entrance. Adding a new kind of chamber = a radius + a demand rule in `nestPlan.js`, nothing else.
- **Excavation is slow on purpose.** One cell takes `DIG_CARVE_MIN..MAX` (~10-15s), so a chamber is minutes of work for a whole dig force — an ambient-timescale activity, matching the project's "leave it running" framing rather than something you watch complete. Anything that makes a long carve look like a hung ant (e.g. removing the per-cell progress shading `underground.js` tracks for the renderer) is a regression, not a cleanup.
- **The ant sprite is a black silhouette with no outline, which constrains the whole palette.** An ant is only as visible as the ground behind it, so both views paint their own *light* ground (`GROUND_COLOR` / `UNDERGROUND_TUNNEL_COLOR`) and every colour lives in one palette section in `config.js` — the two views have to be picked together. This is why the underground reads "inverted" from a real formicarium photo: dug galleries are the light surface and packed earth is the dark mass, because the original way round (mid-brown dirt, near-black tunnels) put black ants on near-black ground in the exact spaces they spend their time. Don't darken a surface ants walk on.
- **Long pauses need visible motion.** A digger holds still for a whole carve, so it twitches (`DIG_TWITCH_*`, applied in `sim.js`) the way idle and handling ants do — faster and smaller than the idle twitch, reading as scraping rather than glancing around. Any future state that freezes an ant for more than a moment needs the same treatment, or it looks like a bug.
- **No pathfinding.** Ants use proximity detection (`SENSE_RADIUS`) plus straight-line seek-steering toward a believed target, path integration (dead reckoning via `homeVectorX/Y`) for returning to the nest, and pheromone trail-following (3-point sensor sampling) for recruitment. Delivery is not guaranteed — a lost carrying ant can wander indefinitely; this is accepted, not a bug.
- **`STATE_HANDLING` is a single shared state for both pickup and dropoff**, disambiguated by the `carrying` flag rather than separate states (`foraging.js`).
- **Time-dependent randomness must be tick-rate independent.** Noise scales with `sqrt(dt)` (e.g. wander's random walk), decay uses proper exponential decay (`Math.exp(-rate * dt)`, e.g. pheromone decay), not linear-per-frame approximations.
- **World size == viewport size**, currently. No camera/pan/zoom. Nest, food, and obstacle positions do not adapt to window resize (accepted limitation); the pheromone grid *does* reinitialize on resize (clears the trail, but avoids a worse bug: stale grid dimensions otherwise cause misaligned cell-to-world mapping and a visibly distorted trail overlay).

### Debugging lessons for steering code specifically

If you're touching `behaviors.js`, `foraging.js`, or `pheromones.js` steering logic:

1. Steering rates need a decisive margin over competing forces, not a narrow one — undershooting this has repeatedly caused visible wall-hugging/trail-following/obstacle-avoidance failures.
2. A strong *base* (non-urgency) steering rate can trap an agent in a stable orbit around a circular obstacle — circles have no corner to force an exit. Keep the base rate loose; reserve strength for the urgency/danger-driven term (see `AVOID_STEER_BASE` vs `AVOID_STEER_URGENCY` in `config.js`).
3. Sign/direction-convention bugs are easy to introduce when reusing a steering formula with a differently-signed variable — a wrong sign can look like "not strong enough" when it's actually "pointing the wrong way."
4. When summing avoidance contributions from multiple nearby surfaces, sum the radial push vectors first (always adds coherently), then choose one tangent direction from the combined result — choosing tangents independently per-surface can cancel unpredictably at notches between obstacles.
5. **Wall-hugging can hijack a task-committed ant, and a corner can hold it there forever.** `avoidSurfaces()` picks whichever tangent best matches current heading, so hugging *preserves* the direction of travel — an ant that touches a wall while seeking a target gets carried along it, with the urgency term (12) beating `SEEK_STEER_RATE` (3.5) the whole way, sometimes to the far corner, where the steering settles into a stable equilibrium pointing into the corner (position pinned by the hard clamp). WANDER ants escape via wander noise; task states have none, so they stay. This is why any long-lived seek-to-a-point task needs a give-up timeout (see `DIG_TRAVEL_TIMEOUT`) rather than assuming it will eventually arrive — it surfaced with diggers walking to the corner-placed nest, but nothing about it is dig-specific.

## Current known limitations (accepted, not bugs)

- No camera/pan/zoom; no obstacle removal interaction.
- Chamber sites are chosen by rejection-sampling a downward-biased direction off an existing chamber, so nest layout is organic rather than architected — no notion of a main shaft, of chamber depth mattering, or of tunnels reusing an existing corridor. Corridors are dug straight from parent chamber to new chamber, which means a long one can cut across older tunnels.
- A digger's claimed cell can be genuinely unreachable by straight-line steering (a chamber around a bend), which is what `DIG_TRAVEL_TIMEOUT`/`DIG_EXIT_TIMEOUT` exist to bound — accepted for the same reason lost foragers are.
- No player action to expand or shape the nest — digging responds only to colony demand (see `nestPlan.js`); the earlier "unlocked diggable region" cap was removed rather than wired to input.
- Single pheromone type (no directional/"no-entry" signal).
- `spatialGrid.js` uses a `Map`, not a flat typed array — a possible future optimization if it becomes a measured bottleneck.
- No queen, no brood, no population growth over time yet — population is fixed at spawn via `INITIAL_ANT_COUNT`. `MAX_ANTS`/`INITIAL_ANT_COUNT` are configured with headroom between them specifically to leave room for future runtime spawning.
- `assets/` contains only the 6-frame walk-cycle sprite (`ant_0.png`..`ant_5.png`); the shadow-drawing code in `render.js` exists but is currently commented out/disabled.
