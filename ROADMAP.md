# Roadmap

Living plan — update this as phases complete or priorities shift. For stable architecture/conventions, see `CLAUDE.md`.

## Vision

Real-time, always-on ant colony simulation for a dedicated screen — a digital alternative to keeping real ants (inspired by AntsCanada-style ant-keeping), without the live-insect logistics. Built for the enjoyment of the craft, and also a deliberate proving ground for patterns intended for reuse in a separate project ("SAM"): structure-of-arrays performance patterns, config-driven tuning, and incremental state-machine design.

Core design intent:
- Ambient and persistent — like a living terrarium on a monitor. Runs whether you're watching or not; idle time should still feel alive, not static.
- Interaction model is **stewardship, not control** — nudge the colony (drop food, expand nest, adjust conditions, switch views, name colonies), never command individual ants directly.
- The trick is making *non-interaction* feel rewarding — ants should be visibly busy doing ant things on their own schedule.
- The goal is to get as close to real ant-keeping as reasonably possible, with simplifications where needed — not a pathfinding tech demo. A colony that lives, grows, and needs tending is what makes this an ant *colony* simulation rather than a foraging-and-pheromones sandbox.

Originally suggested build layers:
1. Core loop entities: queen, workers, brood, food, nest space, territory
2. Movement + pheromone trail behavior
3. Task switching: foraging, nursing, digging
4. Colony growth + stress states (hunger, crowding, predators)
5. Edge-case richness: fungus, rival colonies, weather, pathfinding failures, dead ends

## Status vs. original plan

| Layer | Status | Notes |
|---|---|---|
| Core entities | Partial | Workers, food, nest (fixed point, not expandable), and territory (canvas bounds) done. **No queen, no brood** — the two entities most central to "colony" as a concept are entirely missing. |
| Movement + pheromone trails | Done, deep | Wander, wall/obstacle avoidance, separation, full foraging state machine, path integration, pheromone deposit/decay/diffuse/follow. Absorbed nearly all development time so far. |
| Task switching (forage/nurse/dig) | Partial | Foraging fully realized. No nursing, no digging — direct consequence of no brood existing yet. |
| Colony growth + stress states | Not started | No hunger, no crowding stress, no predators, no population dynamics. Population is fixed at spawn (`INITIAL_ANT_COUNT`) and never changes. |
| Edge-case richness | Partial | Obstacles/mazes built (a whole debugging arc — see `CLAUDE.md`'s steering lessons). No fungus, no rival colonies, no weather. |

**Honest summary:** what's built so far is a single fixed population of workers with a fully-realized foraging loop, pheromone recruitment, and obstacle navigation — real, well-engineered infrastructure, and a legitimately interesting emergent-behavior sandbox in its own right. But it is not yet a colony simulation in the sense the vision describes: no queen, no brood, no growth, no need for tending.

## Priority: colony growth (phases A–F)

Colony growth is what turns this into an ant *colony* simulation rather than a foraging demo. It's the explicit next focus, not one option among several.

Everything built so far has been "one population of workers doing one thing (forage) well." Colony growth introduces a different *shape* of problem:
- A **second kind of entity** (brood) — doesn't move, doesn't decide, just develops over time and needs feeding.
- A **third kind of entity** (queen) — stationary, doesn't forage, converts food into new brood over time.
- A **shared resource** (colony food store) that doesn't exist yet — currently, food an ant delivers just evaporates.
- **Population that changes over time** — new workers must be able to spawn *during* the simulation, not just at init.
- A **second movement domain** (underground tunnels, Phase B) — surface ants steer continuously through open space; tunnel-digging and tunnel-dwelling ants move through a space that starts as solid and is carved out over time. Different enough from the surface layer to warrant its own files, not a retrofit of `behaviors.js`.

Treat this as its own design pass, not an incremental tweak to `foraging.js`.

### Phase A — Colony food store (foundation) — done
- [x] Add a persistent food reserve to the colony — landed as `colony.food` in a new `colony.js` (not `world.js`; see note below), mutated only via `addColonyFood()`, same external-mutation-through-a-function pattern as `world.js`'s `depleteFood()`.
- [x] Wire `foraging.js`'s `updateHandling` dropoff completion to increment this store, instead of food just disappearing on delivery.
- Landed in `colony.js` rather than `world.js` as originally sketched — colony state (resources, and later the queen) is conceptually distinct from `world.js`'s job of physical environment layout (nest position, food placement, obstacles), and Phase C already anticipated needing a `colony.js` for the queen. Starting it here avoids a migration later.
- Doesn't change visible behavior yet, but it's the prerequisite resource every later phase spends from.

### Phase B — Underground nest & tunnels

Decided 2026-07-24: the nest becomes two linked views — the existing top-down surface, plus a new underground side-view cross-section where tunnels are visibly dug (the "ant farm against glass" simplification: real ants dig in 3D, this project only digs in the single 2D plane visible against glass, same spirit as the project's existing no-pathfinding simplifications). Moved ahead of Phase C (queen) because the queen/brood are moving underground as part of this work — building them at a flat surface point first and relocating them later would be pure rework.

**Containment framing (added 2026-07-26, inspired by AntsCanada-style ant-keeping):** a real starter colony doesn't get a full formicarium on day one — it starts in a small test tube, and the keeper connects a bigger container as the colony outgrows it. Modeled here as: the underground grid exists at full size from the start (simplest to implement), but only a small region around the entrance chamber is *diggable* at first — diggers can only carve cells within the currently unlocked region, not the whole grid. Expanding the unlocked region is a new player-facing stewardship action, same category as dropping food or placing an obstacle, not something diggers unlock on their own. This also gives Phase F (crowding stress) a natural trigger later: colony outgrows its current unlocked space, player expands it.

- [x] **Underground data model**: landed in `underground.js` — a `Uint8Array` grid of `DIRT`/`TUNNEL` cells (side-view cross-section), sized to the full viewport at init, same coarse-grid pattern as `pheromones.js`.
- [x] **Movement through tunnels**: `avoidTunnelWalls()` (in `underground.js`) mirrors `avoidSurfaces()`'s sum-push-vectors-first pattern, sourcing "surfaces" from nearby `DIRT` cells instead of an obstacle list. Called from `sim.js` for every `DOMAIN_UNDERGROUND` ant each tick, as its own movement tail (own avoidance, no pheromones/obstacles/separation — see `sim.js`'s domain branch) rather than folded into the surface tail.
- [x] **Entrance linkage**: `ants.domain` (`DOMAIN_SURFACE`/`DOMAIN_UNDERGROUND`, in `ants.js`) plus `enterUnderground()`/`exitToSurface()` (in `underground.js`), called from `digging.js`'s recruitment/completion.
- [x] **View switching**: single canvas, `V` key toggles between surface and underground draw paths (`render.js`'s `toggleView()`/`getCurrentView()`, wired in `main.js` — `T` was already taken by the trail toggle). Click-to-spawn-food/obstacle is guarded to the surface view only; no underground click interaction is defined yet. The two draw paths are fully separate functions/files (`render.js` vs `undergroundRender.js`) per the dual-screen note below, not intertwined.
- [x] **Digging task**: new `digging.js`, worker state `STATE_DIG` (dual-purpose via `stateTimer`, same pattern `STATE_WANDER` already uses for idling — see `config.js`). `checkDigRecruitment()` promotes a WANDERing, non-carrying ant near the nest with a small per-second chance (`DIG_ENTER_CHANCE`); `updateDigging()` seeks the nearest frontier cell (`findFrontierCell()`, `underground.js`) and carves it, bounded by the unlocked region; falls back to the surface once nothing reachable is left to dig. Verified with a 120-simulated-second headless run: recruitment, steering, carving, and surface-return all fired correctly, tunnel cell count grew from 78→161, up to 9 simultaneous diggers, zero NaN/out-of-bounds positions.
- [x] **Initial chamber**: `initUnderground()` digs a starting chamber (`UNDERGROUND_CHAMBER_RADIUS`) around the entrance at init, so the queen (Phase C) and first brood (Phase D) have somewhere to be immediately. Also defines the initial "test tube" — the starting unlocked region is centered on this chamber.
- [ ] **Container expansion interaction**: new player action that grows the unlocked/diggable region (e.g. click a control, or click just outside the current boundary). `expandUnlockedRegion()` (in `underground.js`) is ready for this to call; not yet wired to input. Analogous to `placeObstacle` in `main.js`'s input handling. With digging now live, this is the next piece that gives it real long-term work to do (currently the diggable ring around the starting chamber is finite and will empty out).
- [x] **Rendering**: `undergroundRender.js` draws dirt vs. tunnel cells, the entrance marker, and the unlocked-region boundary (visualizes the current "container size"). Queen/brood-in-chamber visuals are deferred until those entities exist (Phases C/D); the underground-ant draw loop (dot placeholder) is live and correctly draws active diggers now.

Not yet browser-verified visually (only headless/Node-checked so far — see main thread) — worth a manual look at the `V` view with digging in progress before calling Phase B's core loop fully done.

Note for later, still true: the two rendering paths (surface vs. underground) stay cleanly separable — independent draw functions/files, not intertwined — so that a future dual-*screen* setup, one physical screen per view each oriented to match its view angle (closer to a real terrarium), is a natural extension rather than a rearchitecture. Confirmed as the eventual ideal; the keypress toggle above is the deliberate near-term scope.

### Phase C — Queen + egg-laying
- [ ] Add a queen: a single stationary entity, now placed in the underground chamber from Phase B rather than at the surface nest point. She has almost none of a worker's behavior (no wander, no forage, no state machine) — she likely does **not** belong in the `ants.js` SoA store. A plain object (e.g. `export const queen = { x, y, eggTimer, ... }`, probably in `underground.js` or a new `colony.js` given she now lives underground) is more appropriate and avoids distorting the worker-optimized data structure.
- [ ] Queen lays eggs over time, at a rate that consumes from the colony food store (Phase A). No food reserve, no eggs — first real "stewardship" pressure the vision calls for.
- [ ] Eggs start as simple objects in a plain array — brood population is very unlikely to need SoA-scale optimization for a long while (hundreds, not thousands). Match structure to actual scale, same justification already used for `spatialGrid.js`'s `Map`.

### Phase D — Brood lifecycle
- [ ] Extend brood objects with a stage (`egg → larva → pupa → adult`) and a per-stage timer.
- [ ] Larvae need feeding (further draws on the colony food store) to progress — this is where "hunger" first becomes meaningful, ahead of full stress-state work.
- [ ] On reaching `adult`, spawn a new worker via `spawnAnt()` (already exists in `ants.js`), placed at the underground chamber rather than the old flat nest point. **Requires `MAX_ANTS`/`INITIAL_ANT_COUNT` to leave real headroom** — currently `10000`/`100`, so this is already in place.

### Phase E — Nursing task
- [ ] New worker state, `NURSE` (extends the existing `IDLE/WANDER/FORAGE/RETURN/HANDLING` machine, same dispatch pattern already established in `sim.js`).
- [ ] Nurses feed larvae from the colony food store, likely via a new `nursing.js` file — consistent with the project's one-file-per-concern convention (`foraging.js` is the direct structural precedent).
- Brood now has a real chamber (Phase B/C), so the earlier-considered simplification of "brood just exists at an abstract nest point" is superseded — nurses feed brood in the actual underground chamber. Multiple chambers by brood stage (real ants do this for temperature/humidity) is still not necessary for a first version; revisit only if it later feels important.

### Phase F — Stress states
- [ ] Hunger, crowding, predators — the original plan's layer 4. These only mean something once there's a real population and food economy for them to act on. Sequenced after, not parallel to, phases A–E.

## Secondary items (whenever, not competing with the above)

- **Colony relocation to a bigger nest** (added 2026-07-26, aspirational — distinct from Phase B's in-place container expansion). Real ant-keeping practice (AntsCanada-style) doesn't just widen the existing tube forever — an outgrown colony gets moved wholesale to a new, larger formicarium, with workers relocating brood and the queen over. That's a bigger mechanic than expanding the unlocked region in place: a second underground structure, a migration behavior (workers ferrying brood/queen between old and new chambers), and a decision point (player- or crowding-triggered) about when it happens. Needs Phase F's crowding stress to motivate *why* it happens before it's worth designing in full. Revisit after Phase F.
- Obstacle removal interaction (quick, no design questions)
- Food quality → trail strength (small, well-scoped — see biology notes below)
- Food weight/type → carry speed (distinct from the above: affects movement, not deposit rate; needs a weight field on food sources)
- Re-enable/re-tune the shadow system (already built, disabled in `render.js`)
- Landmark-based mid-route path-integration correction using existing obstacles — obstacles are already static, positioned, persistent, so an ant passing near a known one could correct `homeVector` partway toward its true position, not just at the final "sensed true nest" snap. Progressive drift correction along a familiar route, not just at the end.
- Alarm/danger pheromone — biologically general (unlike the no-entry signal), but blocked: there's no threat/predator mechanic yet for one to attach to. Revisit once Phase E (stress states) introduces a threat source.
- Camera/pan/zoom — matters more once colony growth makes a bigger world worth having, but isn't itself part of the colony-growth work
- Worker roles/castes — explicitly deferred until brood/nursing exist to differentiate roles against (a roaming-radius approximation was correctly rejected earlier as a throwaway stand-in for this)
- Second pheromone type — deprioritized after the biology research below
- Fungus, rival colonies, weather — not yet approached at all

## Biology notes (for future feature decisions)

- **Path integration (dead reckoning) is genuinely general** across ants and bees, not a desert-ant-only quirk. What's built (`homeVector`) is well-grounded.
- **A single ant trail does not inherently encode direction** (Carthy, 1951). The current single-pheromone design is arguably more biologically accurate than a directional pheromone pair would be.
- **The "no-entry"/repellent pheromone is a genuine outlier**, first documented in Pharaoh ants specifically, repeatedly described as unusual. Legitimate to build, but it's "borrowing one species' trick," not "how ants work."
- **Landmark recognition is general and well-documented.** The existing "sensed true nest" mechanism is functionally a crude analog already.
- **Alarm/danger pheromones are general**, but there's no threat mechanic yet for one to attach to.
- **Food quality/colony-need modulating trail strength is real and well-documented.** Small, well-grounded extension once food sources have any variety.
- **Colony growth grounding:** real ant colony lifecycle — egg, larva (fed by workers via trophallaxis/regurgitation), pupa (dormant, unfed), then eclosion into an adult worker. Queens lay eggs continuously, at a rate influenced by colony food reserves and season/conditions. Brood is tended by nurse workers, typically younger workers in real colonies (age-based division of labor, "temporal polyethism") — relevant context if/when worker roles are built later, but not required for a first colony-growth pass.
