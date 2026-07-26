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
| Task switching (forage/nurse/dig) | Partial | Foraging fully realized. Digging realized and demand-driven (workers excavate the chambers the colony currently needs — see Phase B). No nursing — direct consequence of no brood existing yet. |
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

**Demand-driven excavation (added 2026-07-26, supersedes the containment cap below):** ants dig what the colony *needs, when it needs it*, not whatever dirt is nearest. A chamber is excavated for a purpose (queen / brood / food store), and only once a demand rule says the colony is short one: brood chambers as the colony grows (not in anticipation of growth), storage chambers as delivered food accumulates. One project at a time, with a cooldown between — expanding the nest early isn't just wasted labour, it's more tunnel exposed to predators than the colony can use. Carving one cell also takes ~10-15s rather than ~1s, so a chamber is minutes of collective work; this is the difference between an ant-*keeping* simulator and an ant simulator. Landed as `nestPlan.js` (chamber registry + demand rules + the active project's cell list) with `digging.js` reduced to carrying the plan out one claimed cell at a time.

**Containment framing (added 2026-07-26, set aside the same day):** a real starter colony doesn't get a full formicarium on day one — it starts in a small test tube, and the keeper connects a bigger container as the colony outgrows it. Modeled as an "unlocked" diggable region around the entrance chamber that a player action would widen. Removed when demand-driven digging landed: demand already bounds excavation, so a geographic cap was redundant *as a limit on diggers*. Still viable later as a purely player-facing stewardship action (and still a natural Phase F crowding trigger) — just don't reintroduce it as a hard cap.

- [x] **Underground data model**: landed in `underground.js` — a `Uint8Array` grid of `DIRT`/`TUNNEL` cells (side-view cross-section), sized to the full viewport at init, same coarse-grid pattern as `pheromones.js`.
- [x] **Movement through tunnels**: `avoidTunnelWalls()` (in `underground.js`) mirrors `avoidSurfaces()`'s sum-push-vectors-first pattern, sourcing "surfaces" from nearby `DIRT` cells instead of an obstacle list. Called from `sim.js` for every `DOMAIN_UNDERGROUND` ant each tick, as its own movement tail (own avoidance, no pheromones/obstacles/separation — see `sim.js`'s domain branch) rather than folded into the surface tail.
- [x] **Entrance linkage**: `ants.domain` (`DOMAIN_SURFACE`/`DOMAIN_UNDERGROUND`, in `ants.js`) plus `enterUnderground()`/`exitToSurface()` (in `underground.js`), called from `digging.js`'s recruitment/completion.
- [x] **View switching**: single canvas, `V` key toggles between surface and underground draw paths (`render.js`'s `toggleView()`/`getCurrentView()`, wired in `main.js` — `T` was already taken by the trail toggle). Click-to-spawn-food/obstacle is guarded to the surface view only; no underground click interaction is defined yet. The two draw paths are fully separate functions/files (`render.js` vs `undergroundRender.js`) per the dual-screen note below, not intertwined.
- [x] **Digging task**: new `digging.js`, worker state `STATE_DIG` (dual-purpose via `stateTimer`, same pattern `STATE_WANDER` already uses for idling — see `config.js`). `checkDigRecruitment()` promotes a WANDERing, non-carrying ant near the nest with a small per-second chance (`DIG_ENTER_CHANCE`), *only* while the nest plan has an under-staffed project; `updateDigging()` claims a planned cell, walks to it and carves it, and surfaces when there's nothing left to claim. Give-up timeouts bound both the walk to a claimed cell and the walk back out (`DIG_TRAVEL_TIMEOUT`/`DIG_EXIT_TIMEOUT`) — without one on the surface leg, diggers wall-hugged out of the corner-placed nest and parked permanently in screen corners (see `CLAUDE.md`'s steering lesson 5).
- [x] **Nest plan**: new `nestPlan.js` — chamber registry (the starting chamber is registered as the queen's), demand rules per purpose, chamber site selection (downward-biased rejection sampling off an existing chamber, with clearance between rooms), 4-connected corridor layout, and per-cell claims so several diggers share a project without fighting over the same cell. Verified with a 2400-simulated-second headless run: brood chamber dug first (population demand), then storage chambers as delivered food accumulated, then digging stopped entirely with all needs met and the dig force drained to zero; ~87% of underground digger time spent actually carving; zero NaN/out-of-bounds positions, no stuck ants.
- [x] **Initial chamber**: `initUnderground()` digs a starting chamber (`UNDERGROUND_CHAMBER_RADIUS`) around the entrance at init, so the queen (Phase C) and first brood (Phase D) have somewhere to be immediately. Also defines the initial "test tube" — the starting unlocked region is centered on this chamber.
- [ ] **Container expansion interaction** (deferred, no longer blocking): a player action that shapes or extends the nest. The unlocked-region version of this was removed with the digging rework — digging now has permanent long-term work (colony growth keeps generating demand), so this is a stewardship *want*, not a mechanism digging depends on. If revisited, it should be something the plan responds to (e.g. offering space the colony may then choose to use), not a cap on diggers.
- [x] **Rendering**: `undergroundRender.js` draws dirt vs. tunnel cells, per-cell carve progress (a cell visibly crumbles over the ~10-15s it takes to open, so a stationary digger reads as working), chamber rings labelled by purpose, the chamber currently under construction as a dashed outline, and the entrance marker. Queen/brood-in-chamber visuals are deferred until those entities exist (Phases C/D); ants underground draw with the same sprite as the surface view.

Not yet browser-verified visually (headless/Node-checked only, including the render path via a recording canvas stub — the Chrome extension wasn't connected) — worth a manual look at the `V` view with digging in progress before calling Phase B's core loop fully done.

Note for later, still true: the two rendering paths (surface vs. underground) stay cleanly separable — independent draw functions/files, not intertwined — so that a future dual-*screen* setup, one physical screen per view each oriented to match its view angle (closer to a real terrarium), is a natural extension rather than a rearchitecture. Confirmed as the eventual ideal; the keypress toggle above is the deliberate near-term scope.

### Phase C — Queen + egg-laying
- Chamber placement is already solved for both: `nestPlan.js` registers the starting chamber as the queen chamber and hands back brood chambers by purpose, so the queen and brood have real, queryable locations to be placed in rather than an abstract nest point. Once brood exists, swap the brood-chamber demand rule's population proxy for a real brood count — the rule's shape is already right.
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
