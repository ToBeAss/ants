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

## Priority: colony growth (phases A–F, plus the B2–B5 realism pass)

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

### Phase B2 — Nest architecture realism pass (added 2026-07-26)

Phase B built the *machinery* of a planned nest — demand rules, projects, claims, slow carving — and that machinery is sound. What it doesn't yet produce is a nest shaped like a real one. A realism audit against the literature (see "Nest architecture biology" below) found the layout model inverted on its single most important axis: **depth**.

Real subterranean nests are organized by depth, and only by depth. Chambers hang off a shaft; how deep a chamber is determines how big it is and who lives in it. The current model has neither a shaft nor any notion that depth means anything: chambers branch off a *randomly chosen* existing chamber in a downward-ish direction, and size comes from `purpose` rather than from depth. The visible consequences:

- **The queen is in the shallowest chamber.** `initUnderground()` digs the starting chamber one radius below the entrance and `initNestPlan()` registers it as `PURPOSE_QUEEN` — so the queen would be placed as close to the surface as the nest ever gets. Reality is the exact opposite: the queen, brood, callows and nurses are in the **bottom third**, with worker density increasing sharply with depth, and even an incipient nest is already ~30 cm deep before the founding chamber is cut. This is the finding that prompted the pass, and it has to be fixed *before* Phase C places her — placing the queen now and relocating her later is the same rework trap that already moved Phase B ahead of Phase C.
- **It grows as a bush, not a nest.** Random parent chamber + `NEST_SITE_ANGLE_SPREAD` of 1.2 rad (±69° off vertical, i.e. "down" includes almost-horizontal) + a straight parent→child corridor gives a spreading shrub. Real nests are one mostly-vertical shaft with chambers hanging off it, branching **only in the top ~40 cm** regardless of how deep the nest goes.
- **Size is assigned by purpose, which is backwards.** `CHAMBER_RADIUS` maps queen 40 / brood 34 / food 26 — and the queen's is the largest. Reality: chamber area falls off steeply with depth (each depth decile ≈ half the area of the one above; shallow chambers 5–6× the area of deep ones; ~half of all chamber area in the top quarter), while vertical spacing *increases* with depth (2–4 cm near the surface to 20–30 cm deep). Purpose is a *consequence* of depth, not an input to size.

The fix is one reframe: **depth is the organizing variable.** Landed 2026-07-26.

**The key idea that made it work, found during implementation: a chamber's purpose is DERIVED from its current depth, not frozen when it was dug.** `purposeOf(chamber)` reads the depth band; nothing stores a purpose. This is what makes the founding chamber behave like a real one — it starts as the entire nest (deepest, so the queen's), and as the colony digs below it, it becomes a store, then an upper atrium. Freezing purpose at dig time was tried first and failed three ways at once: rooms stayed labelled `brood` while sitting halfway up a mature nest, blocking the stratum that belonged there; brood chambers "expired" as the shaft grew under them, so demand could never be met and the nest eroded to the floor of the world; and strata needed an explicit non-interleaving rule. Deriving purpose makes non-interleaving a *property* instead — `f` rises monotonically with depth and the thresholds are ordered, so a deeper room can never be in a shallower stratum.

Two other things had to change to make it coherent, both of which the research had already flagged and neither of which was in the original sketch:

- **Demand is for chamber AREA per stratum, not a count of rooms.** A count is impossible to satisfy in a bounded world ("15 brood chambers" doesn't fit at any depth), and — worse — impossible to satisfy by *widening* a room, which made enlargement dead code. This borrows Phase B4's first bullet early, because B2 doesn't work without it.
- **Depth is capped allometrically by population** (`NEST_DEPTH_ALLOMETRY`). Measured nests are strikingly reluctant to deepen: 10x the workers buys ~2.4x the depth but ~7.5x the area, so a growing colony gets space from more and bigger rooms. Without the cap, brood demand drove the shaft to the bottom of the world at a third of the population that should have reached it.

Also fixed a starvation bug found the same way: trying only the single most urgent need and giving up if it couldn't be sited meant a brood deficit with no geometric room to fix it blocked stores and atriums *permanently*. `openProject()` now walks the needs in priority order and takes the first it can actually plan — a real colony doesn't stop building storage because it's also short of nursery space.

- [x] **A main shaft.** `nestPlan.js` gains a shaft — a polyline descending from the entrance, extended downward a segment at a time, zig-zagging laterally (real shafts wander in a loose helix). Segment angle steepens with depth, matching the measured 20–30° from horizontal near the surface to 45–60° deeper: shallow chambers naturally spread out laterally, deep ones stack. Chambers attach to *the shaft*, not to other chambers, via a short stub — which also retires the "a long corridor can cut across older tunnels" limitation in `CLAUDE.md`, since stubs are short by construction. Branch shafts allowed only in the top ~30% of current depth, at most one or two.
- [x] **Depth drives radius and spacing.** Chamber radius becomes `f(depth)` — geometric falloff, big at the top, small at the bottom — and attachment points along the shaft space out with depth instead of the flat `NEST_CHAMBER_CLEARANCE`. `CHAMBER_RADIUS_BROOD`/`CHAMBER_RADIUS_FOOD` are replaced by a shallow/deep radius pair plus a falloff, so a chamber's size stops being a per-purpose constant.
- [x] **Purpose by depth band.** Top quarter: atrium/entrance chambers (the big top-heavy ones, where returning foragers unload). Middle: food/seed stores — real harvester ants store seeds *exclusively* in a mid-depth band, never at the top or bottom. Bottom third: brood, and the queen in the deepest chamber. Demand rules keep their current shape and reader; what changes is that satisfying a brood demand means **deepening the shaft and cutting the chamber at the new bottom**, which makes "the queen is deepest" fall out of the construction order instead of needing to be asserted.
- [x] **Founding state.** `initUnderground()` digs a short initial shaft with one small chamber at its bottom, rather than a wide chamber hanging off the surface. That single change is most of the visible realism win, and it's small.
- [x] **Chamber enlargement as a project type.** Landed, and it turned out not to be optional — Real nests grow by deepening, adding chambers, *and* enlarging existing ones simultaneously — and enlargement contributes the most (`Camponotus socius`). Currently a finished chamber is frozen forever. A project whose cell list is a ring around an existing chamber is a small addition to the existing plan machinery, and it's arguably a more faithful growth mode than adding rooms.

**Verified** with two headless harnesses: a fast structural test that drives `nestPlan.js` directly through pop 100 → 300 → 900 (queen chamber always deepest; zero strata inversions; brood in the bottom third, stores strictly mid-depth, atriums in the top band; chamber radius falls off monotonically with depth; spacing widens with depth; shaft steepens with depth, 51° → 30° from vertical; nest stays in bounds despite the corner entrance; digging stops dead once needs are met), and a full one-simulated-hour run of the real ant/dig loop (ants carved real cells, two store chambers appeared, zero NaN/out-of-bounds positions, no stuck ants). Chamber area came out 44% in the top quarter against the measured ~50%. Still not browser-verified visually — the render path is smoke-tested headlessly (including the dashed in-progress plan) but nobody has looked at the `V` view.

**Known shortfall, and the natural next step: a single shaft caps how many rooms a nest can host.** Shallow-vs-deep chamber area comes out ~1.8x against the measured 5-6x, and the top quarter holds 44% rather than ~50%, because those are *mature nest* statistics and one shaft simply can't host enough chambers to reach them. Real nests solve exactly this with **branch shafts** — up to 4-5 parallel vertical chamber series in large colonies, with every branch starting in the top of the nest (measured: less than 40cm down regardless of total depth). That was a bullet in this pass's original sketch and is the one piece deliberately left undone; it's the real capacity mechanism, not a tuning problem, and it's what would let a large colony's nest look mature rather than merely correct.

Deliberately **not** in this pass: the queen and brood migrating downward as the nest deepens. Real nests deepen throughout the colony's life, so the bottom third moves down and its occupants move with it — genuinely lovely ambient behavior, and it shares its whole mechanism with the parked "colony relocation" idea under Secondary items. Sequenced after Phase D (there has to be brood to ferry). For now, new brood chambers are added *above* the queen's, so she stays deepest without anything having to move.

### Phase B3 — Spoil: the dirt has to go somewhere (added 2026-07-26)

Currently a carved cell just becomes tunnel and the soil ceases to exist. Real excavation is a transport problem as much as a digging one: workers roll the spoil into pellets, carry them up and out, and drop them at the surface, building the crater-shaped mound every ground-nesting colony sits in the middle of. Highest visible payoff of anything in this plan, and it pays off in **both** views at once.

- [ ] **A pellet per carved cell.** Completing a carve gives the digger soil to carry (one flag on the ant, same shape as `carrying`), which it hauls to the entrance and out. This also fixes a simulation-side problem: a digger's life is currently ~87% standing perfectly still, and adding the haul leg makes diggers visibly commute the way an ant farm actually looks. Tuning question to settle when it lands — a haul trip per cell on top of a 9–16 s carve may be too slow; one pellet per cell with a haul every N cells is the fallback.
- [ ] **A growing surface mound.** New file (`spoil.js` — new concern, new file, per `CLAUDE.md`'s ownership rule), owning an angular histogram of deposited height around the entrance. The deposit rule comes straight from the crater-optimization work: drop at the nearest bin whose height is below optimal. That's a dozen lines, it self-organizes into an even crater, and it refills a gap if one is ever cleared — a persistent, accumulating trace of how much this particular colony has dug, which is exactly the always-on framing the project is built around.
- [ ] **Pellets as a stigmergic cue** (small, do it here): spoil dropped near a dig site attracts other workers to dig there, which is one of the documented mechanisms by which chambers *emerge* rather than being planned. Cheap version — bias cell claims toward cells near other active claims (see B4).

Sequential/relay transport (excavator drops the pellet near the face, a second ant carries it onward) is real and documented but skipped: it's a second task state for a detail the viewer won't read at this zoom.

### Phase B3 status — landed 2026-07-26

- [x] **A pellet per carved cell.** `ants.carryingSoil`, set when a carve completes, which also forces the ant out of the nest before it may claim another cell. Diggers now visibly commute instead of standing still for ~87% of their lives.
- [x] **A growing surface crater.** New `spoil.js` — an angular histogram of pile height around the entrance, with the deposit rule from the crater-optimization work ("nearest bin whose pile is below optimal"). Verified filling 23-24 of 24 directions evenly with no coordination. The nest is in a screen corner, so off-world bins are skipped and the colony correctly piles on the side it has room for.
- [x] **Visible in both views.** `drawCarryIndicator()` moved into `antSprite.js` (it's "how an ant looks", and both views need it — having `undergroundRender.js` import it from `render.js` created a cycle and broke the deliberate separation of the two draw paths). Same marker as food, in earth instead of green.
- [ ] **Pellets as a stigmergic cue.** Not done — deferred to B4's aggregation bullet, where it belongs.

Sequential/relay transport (excavator drops the pellet near the face, a second ant carries it onward) remains skipped: real and documented, but a second task state for a detail invisible at this zoom.

### The tunnel-burial bug, and a steering lesson (fixed 2026-07-26)

Reported symptom: ants sometimes walk into the dirt underground. Measured: **14.6% of all underground ant-time was spent with the ant's centre inside solid dirt**, in burials of up to 45 seconds.

Cause was a missing backstop, not bad steering. The surface movement tail has hard position clamps for both walls and obstacles; `sim.js`'s underground tail had only a grid-bounds clamp, so `avoidTunnelWalls()` was the *sole* thing keeping ants out of the earth — and it structurally cannot hold a corridor, because a corridor (20px) is narrower than `TUNNEL_AVOID_MARGIN` (12px on each side), so opposing pushes cancel to zero. That cancellation was already known and written off in a config comment as a rare symmetric squeeze; it is in fact the normal case for every corridor in the nest.

`pushOutOfDirt()` (underground.js, called from `sim.js`) fixes it completely: **14.6% → 0.00%**. It re-aims the ant at the opening as well as repositioning it, because otherwise a clamped ant keeps its old heading and walks straight back in.

**The lesson, which cost a round trip: a forward "feeler" probe was also built, and it was actively harmful.** It looked like the right fix for the cancellation problem — probe ahead, turn toward the most open direction. Measured against a control it was worse on every axis: dig throughput **fell 36%** (85 carved cells → 54), heading reversals rose 31%, and ants walked 28% further to achieve less. Two reasons, both worth remembering:

1. **Every dig target IS a dirt cell.** "Steer away from dirt ahead" directly opposes "walk to the dirt you came to remove", and avoidance wins — so diggers could never close on a target. This is a general hazard for any future avoidance behaviour: the underground is a domain where agents deliberately approach the hazard.
2. **A probe that reacts to the nearest wall ping-pongs**, because turning away from one wall presents the other. Making it proportional rather than bang-bang reduced but did not remove this.

It was deleted. `config.js` carries a note where the constants were, so it doesn't get reinvented. The clamp needs no steering change at all to work. (The 36%/31% figures above came from single stochastic runs and were later shown to be within run-to-run noise — the harnesses are seeded now. The *mechanism* stands and the user observed the ping-ponging directly, but don't quote those numbers.)

**And the actual dominant bug, found from a screenshot after all of the above: `TUNNEL_AVOID_HUG_FRACTION` was 0.85.** Copied from `AVOID_HUG_FRACTION`, where wall-hugging is correct — following an edge is useful on open sand. Underground it sets the target standoff from a dirt face to ~1.8px, so ants pressed themselves flat against the wall and their ~12px sprite was drawn mostly over solid earth. That is what "ants get stuck in the dirt" actually looked like, and no centre-based metric could see it: the ant's centre was in legal open tunnel 100% of the time while **91% of samples had the body overlapping dirt**.

Dropping it to 0.2 (≈9.6px standoff, which centres an ant in a 20px corridor) fixed far more than the visual:

| | before | after |
|---|---|---|
| sprite overlapping dirt | 91% | 2.4% |
| heading reversals (moving ants) | 10-13/s | 2.3-3.0/s |
| cells carved per 1200s | 12-85 per *2400s* | 111-119 |

Ants had been grinding along walls rather than walking, which is why throughput was so low and so erratic — and why the earlier feeler A/B was measuring noise on top of a much larger problem. **Lesson: the underground is not the surface with different constants.** Every `TUNNEL_*` value inherited from an `AVOID_*` one deserves the same scrutiny; the remaining ones (margin, steer base, steer urgency) have not had it.

Also fixed in the same pass, both found by seeding the harnesses (single unseeded runs had been passing by luck):
- **Enlargement was all-or-nothing.** It grew by exactly `+CHAMBER_ENLARGE_STEP` or gave up, so any room whose full step didn't fit was frozen at its dug size forever — the same frozen-at-dig-time artifact `purposeOf()` fixed, for radius. `fittableRadiusAt()` now returns the largest radius that fits (depth cap, world edges, inter-chamber gap, shaft) and both enlargement and new placement size to it instead of being rejected.
- **Enlargement ignored world bounds**, growing chambers off the edge of the world (one reached `x=32` with `r=34`). Same helper covers it.
- **The founding chamber was carved with no fit check at all**, so with the nest in a screen corner it could breach the world edge — and the edge then pinned its fittable radius to ~5px, meaning it could never be enlarged and stayed permanently smaller than every room above it, inverting the architecture's core relationship. Its centre is now inset far enough for the full radius to fit.
- **Chamber side is now chosen by which side has more room**, not at random, so rooms aren't squeezed by the nearby wall instead of by their depth.

Note on what is *not* guaranteed: chamber radius is **not** pairwise monotonic in depth. A room is sized for the depth it was dug at, and enlargement stops once its stratum's demand is met, so a room dug early can stay smaller than one dug later and deeper. The aggregate distribution is what's asserted (shallow half larger than deep half; shallowest larger than deepest), which is also what the source biology actually claims.

### Phase B4 — Regulate digging by crowding, not by counters (added 2026-07-26)

Demand-driven digging was the right call and the biology backs it — colonies measurably dig *less* once available space is adequate. But the current rules measure the wrong thing. `ANTS_PER_BROOD_CHAMBER` (60) and `FOOD_PER_STORAGE_CHAMBER` (50) are arbitrary discrete counters, and `DIG_FORCE_MAX` (8) is a hard cap standing in for a self-organizing process.

- [ ] **Space adequacy instead of chamber counts.** Demand becomes tunnel area per ant falling below a target — closer to both the biology and the ant-keeping feel, and it deletes two magic constants. The real mechanism is a local one: an ant estimates crowding from how often it collides with other ants and dead ends, and keeps digging while collisions are frequent. Measured participation runs ~50% early, decaying as roughly t^(-1/2) to a steady ~28% — worth knowing that a *soft, decaying* participation curve is the realistic shape, where `DIG_FORCE_MAX` is a step function.
- [ ] **Aggregation-driven claims.** `claimDigCell()` currently hands out the cell nearest the asking ant. Preferring cells near *other diggers* instead reproduces the documented density-dependent aggregation that makes chambers emerge as functional structures, and costs nothing.

### Phase B5 — Most of the colony lives inside (added 2026-07-26)

The largest single realism gap in the sim as it stands, and the one that decides whether the underground view is worth looking at. Right now essentially all 100 workers are on the surface wandering, and the underground holds at most 8 diggers. Reality inverts this on both counts: 40–50% of workers are persistently inactive at any moment, most of the colony is *inside*, and foragers are a minority occupying the top of the nest.

- [ ] **An underground resting/loitering state.** Workers that simply live in the nest — occupying chambers, mostly still, drifting slowly. Not a task; presence. Depends on B2 for chambers to be meaningful places to be.
- [ ] **A persistent per-ant activity tendency**, drawn at spawn. The inactivity research is specific that this is an individual, stable trait rather than per-tick randomness, and that inactive workers act as a **reserve** — they take over when active workers are lost. So the threshold should fall when the colony is short of labor, which gives the colony visible resilience for free and is the natural substrate for Phase F's stress states.
- [ ] **Depth preference by age** (after Phase D). Young workers deep, old workers at the top and outside — real temporal polyethism, and nearly free once brood exists, since a worker spawned from brood has a birth time. This is the honest version of the worker-roles idea parked under Secondary items: the sorting axis is age, and age only exists once brood does.

Note that `IDLE_MIN`/`IDLE_MAX` (0.2–2.5 s) is not this. That's a pause; this is a role.

### Phase B6 — A real third coordinate (added 2026-07-26)

Raised by the user while B2 was landing, and it's the right diagnosis: the two views' second screen axis means **physically different things**. On the surface (top-down) it's a horizontal axis; underground (side cross-section) it's altitude. Both are currently crammed into `ants.y`, which is why the two domains share one coordinate space at all — and why `spatialGrid.js` mixes them (see below). Add surface terrain later and the surface needs altitude too, so the conflation only gets worse.

The fix is `ants.z`, with each domain moving in a different 2D **plane** of one 3D space:

- Surface ants: altitude fixed (`z = 0` until terrain exists), moving in `(x, y)`.
- Underground ants: `y` fixed at the cross-section slab, moving in `(x, z)`.

Critically, this does **not** mean 3D digging. The "ant farm against glass" simplification stays exactly as it is — the underground remains a single plane, it just becomes an honestly-labelled one. Framing it as "each view is a different plane of a 3D space" is what keeps this a bookkeeping change rather than an invitation to volumetric tunnels.

What it buys: the domains occupy genuinely disjoint regions of space, so the spatial-grid bug below disappears by construction rather than needing a domain check; surface terrain becomes expressible; and `depthOf()` stops being a convention and becomes a coordinate.

- [ ] Add `ants.z` to the SoA store; `integrate()` needs to know which axis pair it's advancing along (the one genuinely awkward bit — `rotation` is a heading *within the ant's plane of movement*, which works fine for both, but the integrate step has to branch on domain).
- [ ] Move `underground.js`'s grid indexing, `avoidTunnelWalls()`, `digging.js`'s steering, and `nestPlan.js`'s depth math onto `(x, z)`.
- [ ] Render transform per view: surface `(x, y)`, underground `(x, z)`.

**Sequenced after B2, deliberately, and this is a scheduling call rather than a judgement on the idea.** It's a pure refactor with a crisp test — behavior must be *identical* afterward — and bundling it into B2's behavioral changes would have meant a failing check could be either the new architecture or the new coordinates, with no way to tell which. B2 was written with this migration in mind: `depthOf()` (in `underground.js`) already isolates the vertical convention, so the depth *semantics* are contained even though raw `.y` is still used for positions, distances and bounds checks.

### Bugs and long-run issues found during the audit (2026-07-26)

- **`colony.food` only ever increases.** `addColonyFood()` is the sole mutation and nothing consumes food yet, so on an always-on run the storage-chamber demand rule (`floor(colony.food / 50)`) grows without bound: the colony digs storage chambers until no site fits, then cooldown-loops forever. Phase C (the queen spending food on eggs) is the real fix, and B4's space-adequacy rule removes the unbounded reader anyway — but it's worth knowing this is the current long-run end state, since "leave it running for days" is the whole premise.
- **The spatial grid mixes the two domains.** `rebuildSpatialGrid()` bins every ant by raw x/y, and underground ants share the surface's coordinate space — so a surface ant and an underground ant at the same screen position land in the same bucket and read as neighbors. Currently mostly benign, because `separationSteer()` is only called from the surface movement tail, but it's wrong as written and will bite the moment underground ants need separation (which B5 requires — a chamber full of loitering workers is exactly the crowded case). Phase B6 dissolves this by construction; until then the stopgap is a domain check in `forEachNearby`, or one grid per domain.
- **`NEST_SITE_ANGLE_SPREAD = 1.2` rad was wider than it read.** ±69° off vertical meant a "downward-biased" tunnel could come out nearly horizontal; combined with random-parent branching it was a good part of why the nest grew outward rather than down. Removed by B2's shaft, but worth naming as the cause rather than a symptom.
- **Unsatisfiable demand now stalls instead of eroding.** Because `colony.food` only grows, store demand grows without bound and stays unmet forever. Post-B2 that's a graceful stall (a cheap cooldown loop, and other purposes still get their turn thanks to `openProject`) rather than the runaway digging it used to cause — but it's still the current long-run end state, and Phase C spending food on eggs is the real fix.

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
### Nest architecture biology (researched 2026-07-26, basis for Phase B2–B5)

Mostly from Walter Tschinkel's nest-casting work (*Pogonomyrmex badius*, *Camponotus socius*, *Odontomachus brunneus*, *Formica pallidefulva*) plus the self-organized-excavation literature.

- **Only two structural elements: shafts and chambers.** Near-vertical shafts, near-horizontal chambers hanging off them. All the species-typical variety is in the number, size and arrangement of those two things — which is a gift for a simulation, because the grid model already expresses both.
- **One shaft, branching only near the top.** *P. badius*: usually a single entrance and a single shaft descending as a loose helix ~4–6 cm across, rarely more than two branches, and **every branch starts less than 40 cm down no matter how deep the nest is** (they go to 2–3 m, deepest measured 3.06 m). *C. socius*: 2–10 chambers along one shaft descending at 45–90°, branching again only in the upper parts.
- **Shafts steepen with depth.** 20–30° from horizontal near the surface, 45–60° by ~50 cm.
- **Chamber area is top-heavy and falls off steeply with depth.** About half of all chamber area sits in the top quarter of the nest; each depth decile averages half the area of the one above; shallow chambers are 5–6× the area of deep ones. Chamber *height* stays ~1 cm throughout. Shallow chambers are large, complex and lobed; deep ones small, simple and compact.
- **Vertical spacing increases with depth** — 2–4 cm near the surface to 20–30 cm deep, peaking around the 7th–8th decile then closing up again.
- **Contents are strictly stratified by depth.** Foragers and the oldest workers at the top, sparse. Seeds stored *exclusively* between 40 and 100 cm — a mid-depth band, never top or bottom. Brood, callows, nurses **and the queen** in the bottom third, with worker density rising sharply with depth ("practically all floor space covered with ants" in the lowest chambers). Directly contradicts the current model's queen-at-the-entrance placement.
- **Nests grow by deepening, adding chambers, and enlarging existing chambers, all at once** — and enlargement contributes most (*C. socius*). The *size-free shape* is invariant: the relative distribution of area with relative depth doesn't change as the colony grows. Scaling is allometric and strongly favors area over depth: 10× workers → ~7.5× total chamber area but only ~2.4× maximum depth. Incipient nests are already 29–37 cm deep.
- **Chambers are not built to a blueprint — they emerge.** Excavation is decentralized response to local stimuli. In fungus-growers, a chamber forms *because* workers aggregate around deposited brood/fungus and dig more where density is higher. Spoil pellets dropped near a face act as stigmergic cues that recruit more diggers to that spot.
- **Digging effort is regulated by crowding.** An ant infers available space from its collision rate (mean free path) with other ants and dead ends, and keeps digging while collisions are frequent; a long tunnel gets dug less than a short one. Participation peaks ~50% and decays as ~t^(-1/2) to a steady ~28%. Workload ends up roughly even across individuals despite very uneven instantaneous activity.
- **Excavation is fast in absolute terms** — a whole nest in 3–6 days, each worker shifting 300–400× its own weight of sand per day. Worth knowing that the project's deliberately slow carve is a *pacing* choice for ambient viewing, not a realism one.
- **Spoil is transported and dumped, forming a crater.** Pellets are carried out and dropped on a mound, often piled toward one side of the entrance. Disposal closely approximates least-cost: given a quarter of their crater removed, ants concentrate subsequent dumping there — consistent with "deposit at the nearest point whose angle of elevation is below optimal." Sometimes relayed: one ant drops a pellet, another carries it onward.
- **40–50% of workers are inactive at any moment, and it's a stable individual trait, not noise.** Inactive workers function as a reserve labor force — remove the active ones and the inactive take over (but remove the inactive and they are *not* replaced). Colonies sort into inactives, inside-walkers, foragers, and nurses.

- **Colony growth grounding:** real ant colony lifecycle — egg, larva (fed by workers via trophallaxis/regurgitation), pupa (dormant, unfed), then eclosion into an adult worker. Queens lay eggs continuously, at a rate influenced by colony food reserves and season/conditions. Brood is tended by nurse workers, typically younger workers in real colonies (age-based division of labor, "temporal polyethism") — relevant context if/when worker roles are built later, but not required for a first colony-growth pass.
