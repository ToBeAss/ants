// ============================================================
// Nest plan — the colony's excavation intent: what shape the nest is,
// which chamber it currently needs, where that one goes, and which cells
// have to be carved to get there. Diggers (digging.js) carry the plan
// out; they don't decide anything about it beyond which cell they
// personally take next.
//
// This is the piece that makes the nest a NEST rather than a cavity, and
// it's organized around the one variable real nest architecture is
// organized around: DEPTH.
//
//   A single mostly-vertical SHAFT descends from the entrance, zig-zagging
//   as it goes and steepening with depth. CHAMBERS hang off it on short
//   lateral stubs. How deep a chamber is decides how big it is and who
//   lives in it — big rooms near the surface where foragers unload, seed
//   stores in a strict middle band, and brood, nurses and the queen in the
//   bottom third.
//
// Three rules do most of the work, and all three come from real nests:
//
//   1. Dig only what's NEEDED, when it's needed. Each purpose has a demand
//      rule reading actual colony state. Demand met => nobody digs at all,
//      and diggers already underground come back up.
//   2. One project at a time, with a cooldown between. A colony that
//      excavates ahead of demand has spent effort it didn't have to and
//      opened more tunnel than it can defend.
//   3. Depth decides everything else. Radius decays geometrically with
//      depth (shallow chambers ~5x the area of deep ones), spacing WIDENS
//      with depth, and purpose is read off the depth band rather than
//      chosen freely.
//
// Reworked 2026-07-26 (ROADMAP.md Phase B2). What this replaced picked a
// random existing chamber, struck out in a downward-ish direction (+/-69
// degrees, so "down" included nearly horizontal), and sized the room by
// its purpose. That grew a spreading bush instead of a nest, and it put
// the queen in the shallowest room — backwards on both counts, since the
// queen belongs at the bottom.
//
// Owns planning only: the physical grid is underground.js's, the ant
// state machine is digging.js's, drawing is undergroundRender.js's.
// ============================================================
import { ants, idToIndex } from './ants.js';
import { colony } from './colony.js';
import {
  entrance, depthOf, carveDisc,
  getGridSize, cellCoords, cellCenter, inGrid, isTunnelCell, hasAdjacentTunnel,
  digCell,
} from './underground.js';
import {
  STATE_DIG,
  UNDERGROUND_CELL_SIZE,
  SHAFT_SEGMENT_LENGTH, SHAFT_ANGLE_SHALLOW, SHAFT_ANGLE_DEEP,
  SHAFT_STEEPEN_DEPTH, SHAFT_ANGLE_WANDER, SHAFT_INITIAL_DEPTH, SHAFT_MARGIN,
  NEST_DEPTH_ALLOMETRY, NEST_DEPTH_REFERENCE_POP,
  CHAMBER_STUB_LENGTH, CHAMBER_RADIUS_SHALLOW, CHAMBER_RADIUS_DEEP,
  CHAMBER_STUNT_LIMIT, CHAMBER_ENLARGE_STEP, CHAMBER_ENLARGE_MIN_GAIN,
  FOUNDING_CHAMBER_RADIUS,
  BAND_ATRIUM_MIN, BAND_ATRIUM_MAX, BAND_FOOD_MIN, BAND_FOOD_MAX,
  BAND_BROOD_MIN, BAND_BROOD_MAX,
  BROOD_AREA_PER_ANT, ATRIUM_AREA_PER_ANT, STORE_AREA_PER_FOOD,
  NEST_PROJECT_COOLDOWN, NEST_TUNNEL_RADIUS,
  NEST_CHAMBER_CLEARANCE_SHALLOW, NEST_CHAMBER_CLEARANCE_DEEP,
  NEST_SITE_ATTEMPTS,
  DIG_FORCE_MAX,
} from './config.js';

// Chamber purposes. Strings rather than the numeric-constant style used
// for ant states (config.js): there will only ever be a handful, they're
// never compared in a hot loop, and they're the natural label for the
// renderer to print. Adding a purpose = adding a depth band here and a
// demand rule below; nothing else in the file is purpose-specific.
//
// There is deliberately no PURPOSE_QUEEN. The queen's chamber isn't a
// kind of room, it's a POSITION — the deepest one (see getQueenChamber).
export const PURPOSE_ATRIUM = 'atrium';
export const PURPOSE_FOOD = 'food';
export const PURPOSE_BROOD = 'brood';

// Where each purpose is DUG, as a fraction of how deep the colony can
// currently reach. Relative rather than absolute so the nest keeps its
// proportions as it deepens (measured nests keep the same size-free shape
// at every colony size). Gaps between the bands are deliberate: a new
// room lands comfortably inside its stratum rather than on a boundary.
const DEPTH_BAND = {
  [PURPOSE_ATRIUM]: [BAND_ATRIUM_MIN, BAND_ATRIUM_MAX],
  [PURPOSE_FOOD]: [BAND_FOOD_MIN, BAND_FOOD_MAX],
  [PURPOSE_BROOD]: [BAND_BROOD_MIN, BAND_BROOD_MAX],
};

// What a chamber is FOR is derived from how deep it sits in the nest, not
// frozen at the moment it was dug — the single most important thing this
// file gets right, and the fix for a whole class of problem.
//
// Two denominators, doing two different jobs:
//   - the SHAFT's depth is how deep the colony can currently reach, and
//     it's what placement bands are measured against (a new deepest
//     chamber has to be sited below the deepest existing one, so this has
//     to extend past it).
//   - the DEEPEST CHAMBER's depth is how deep the nest actually IS, and
//     it's what a room's purpose is measured against.
//
// Deriving purpose is what makes the founding chamber behave the way a
// real one does: it starts as the whole nest (deepest, so the queen's),
// and as the colony digs below it, it becomes a store, then an upper
// atrium. Freezing purpose at dig time instead left it labelled 'brood'
// while sitting halfway up a mature nest, blocking the stratum that
// should have been there — and made brood chambers "expire" as the shaft
// grew under them, which drove runaway excavation to the grid floor
// chasing demand that could never be met.
//
// It also makes non-interleaving strata a property rather than a rule to
// enforce: f increases monotonically with depth and the thresholds are
// ordered, so a deeper chamber can never be in a shallower stratum.
export function purposeOf(chamber) {
  const total = nestDepth();
  const f = total > 0.0001 ? depthOf(chamber.y) / total : 1;
  if (f >= BAND_BROOD_MIN) return PURPOSE_BROOD;
  if (f >= BAND_FOOD_MIN) return PURPOSE_FOOD;
  return PURPOSE_ATRIUM;
}

// How deep the nest is, as opposed to how far the shaft reaches. The
// deepest chamber is by definition at f = 1.0, i.e. always the queen's.
function nestDepth() {
  let deepest = 0;
  for (const c of chambers) deepest = Math.max(deepest, depthOf(c.y));
  return deepest;
}

// Demand rules, highest priority first. Each returns how much chamber
// AREA of that purpose the colony wants right now, against which the
// summed area of the chambers currently in that stratum is compared.
//
// Area rather than a count of rooms, because a count is both impossible to
// satisfy in a bounded world ("15 brood chambers" doesn't fit) and
// impossible to satisfy by WIDENING one — which made enlargement, the
// dominant growth mode in real nests, unreachable.
//
// Brood demand currently reads worker population, standing in for brood
// count until brood entities exist (ROADMAP.md Phase C/D). Swap the
// reader, not the shape of the rule, once brood is real.
const DEMAND_RULES = [
  {
    purpose: PURPOSE_BROOD,
    requiredArea: () => ants.count * BROOD_AREA_PER_ANT,
  },
  {
    purpose: PURPOSE_FOOD,
    requiredArea: () => colony.food * STORE_AREA_PER_FOOD,
  },
  {
    purpose: PURPOSE_ATRIUM,
    requiredArea: () => ants.count * ATRIUM_AREA_PER_ANT,
  },
];

// Finished chambers: { x, y, radius }. No purpose field — that's derived
// from depth (purposeOf) and changes over the nest's life. Phases C/E read
// this to place the queen and to find the brood chambers nurses work in.
let chambers = [];

// The shaft: committed (already dug) nodes from the entrance downward,
// shaft[0] being the entrance mouth. Depth increases monotonically along
// it — every segment descends (see nextShaftNode), which is what lets
// shaftPointAtDepth() interpolate by depth instead of searching.
let shaft = [];
let shaftSide = 1; // which way the next segment prefers to lean; flips each segment (the zig-zag)

// Depth the founding nest actually reached at init — the reference the
// allometric depth cap scales from (see maxNestDepth).
let foundingDepth = 0;

// Project kinds. A chamber is what the colony actually wants; a shaft
// extension is the prerequisite it digs when no band has room yet.
const KIND_CHAMBER = 'chamber';   // a new room off the shaft
const KIND_SHAFT = 'shaft';       // one more segment of descent
const KIND_ENLARGE = 'enlarge';   // widen a room that already exists

// At most one project in flight, ever (rule 2 above):
//   { kind, purpose, x, y, radius, fromX, fromY, side?,
//     pending: Map(cellKey -> {col,row,x,y}),   // planned, not yet dug
//     claims: Map(cellKey -> antId),            // being carved right now
//     claimByAnt: Map(antId -> cellKey) }
let project = null;
let cooldown = 0;

// Ant ids (not indices — indices aren't stable identity, see ants.js)
// of everyone currently assigned to digging. Used to cap the dig force
// so excavation stays a side activity rather than the whole colony.
const digForce = new Set();

// Lays in the founding nest: a short shaft down from the entrance with
// one small chamber at its bottom. Real incipient nests are already
// ~30cm deep before there's a chamber at all, which is why the colony
// starts underground rather than with a wide room hanging off the
// surface — and why the founding chamber is cramped (FOUNDING_CHAMBER_-
// RADIUS) rather than the biggest room in the nest.
//
// This carves directly (carveDisc) rather than going through the dig
// task: it's the state the world starts in, not work the colony did.
export function initNestPlan() {
  chambers = [];
  shaft = [{ x: entrance.x, y: entrance.y }];
  shaftSide = Math.random() < 0.5 ? -1 : 1;
  project = null;
  cooldown = 0;
  digForce.clear();

  carveDisc(shaft[0].x, shaft[0].y, NEST_TUNNEL_RADIUS);

  while (shaftDepth() < SHAFT_INITIAL_DEPTH) {
    const node = nextShaftNode();
    if (!node) break; // grid too small to reach founding depth — take what we got
    const from = shaft[shaft.length - 1];
    for (const p of pathCells(from.x, from.y, node.x, node.y)) {
      carveDisc(p.x, p.y, NEST_TUNNEL_RADIUS);
    }
    commitShaftNode(node);
  }

  const bottom = shaft[shaft.length - 1];
  foundingDepth = depthOf(bottom.y);

  // Centred on the shaft's end, but pulled inward far enough that the whole
  // room fits inside the world. The nest sits in a screen corner (world.js),
  // and the founding shaft can end up within a radius of the wall — which
  // broke two things at once: the room visibly ran off the edge of the world,
  // and because fittableRadiusAt() then measured almost no room to that wall,
  // the founding chamber could never be enlarged and stayed permanently
  // smaller than the rooms dug above it, inverting the whole
  // shallow-rooms-are-bigger relationship the architecture is built on.
  //
  // Shifting the centre is safe: the offset is bounded by SHAFT_MARGIN (20),
  // less than FOUNDING_CHAMBER_RADIUS, so the room still swallows the shaft
  // node it hangs off and stays connected.
  const { cols, rows, cellSize } = getGridSize();
  const worldW = cols * cellSize;
  const worldH = rows * cellSize;
  const inset = FOUNDING_CHAMBER_RADIUS + SHAFT_MARGIN;
  const cx = Math.max(inset, Math.min(worldW - inset, bottom.x));
  const cy = Math.max(inset, Math.min(worldH - inset, bottom.y));

  carveDisc(cx, cy, FOUNDING_CHAMBER_RADIUS);
  chambers.push({ x: cx, y: cy, radius: FOUNDING_CHAMBER_RADIUS });
}

export function getChambers() {
  return chambers;
}

export function getShaft() {
  return shaft;
}

export function getActiveProject() {
  return project;
}

// The queen's chamber is not a purpose, it's a position: real colonies
// keep the queen, brood, nurses and callows in the bottom third, with
// worker density rising sharply toward the bottom. So the queen chamber
// is simply the deepest one — which means that as the nest deepens over
// the colony's life, hers follows it down for free.
//
// Phase C reads this to place her. The migration a real deepening implies
// (workers ferrying the queen and brood down to a newer, deeper chamber)
// is deferred until there's brood to ferry — see ROADMAP.md.
export function getQueenChamber() {
  let deepest = null;
  for (const c of chambers) {
    if (!deepest || c.y > deepest.y) deepest = c;
  }
  return deepest;
}

// ------------------------------------------------------------
// Per-tick planning — called once per tick from sim.js, not per ant.
// ------------------------------------------------------------
export function updateNestPlan(dt) {
  pruneDigForce();

  if (project) {
    if (project.pending.size === 0) {
      // Every planned cell is open — the structure exists now.
      if (project.kind === KIND_SHAFT) {
        commitShaftNode({ x: project.x, y: project.y, side: project.side });
      } else if (project.kind === KIND_ENLARGE) {
        project.target.radius = project.radius; // the room is physically bigger now
      } else {
        // No purpose stored — the room's job is read off its depth from
        // here on (purposeOf). project.purpose was the colony's INTENT in
        // digging it, which is a different thing and doesn't outlive the
        // project.
        chambers.push({ x: project.x, y: project.y, radius: project.radius });
      }
      project = null;
      cooldown = NEST_PROJECT_COOLDOWN;
    } else if (project.claims.size === 0 && !hasClaimableCell()) {
      // Cells left, nobody carving, and nothing reachable to carve — the
      // stub got severed from open space somehow (shouldn't happen: paths
      // are laid out 4-connected from tunnel that already exists).
      // Abandon rather than leave diggers circling forever; the demand is
      // still unmet, so a fresh site gets planned after the cooldown.
      // Same "give up on a belief that isn't working" fallback
      // foraging.js uses for lost carriers.
      project = null;
      cooldown = NEST_PROJECT_COOLDOWN;
    }
    return;
  }

  if (cooldown > 0) {
    cooldown -= dt;
    return;
  }

  project = openProject();
  if (!project) {
    // Neither a chamber site nor a deeper shaft fit — the nest has run
    // out of ground to grow into. Back off for a full cooldown rather
    // than re-rolling candidate sites every tick forever: an always-on
    // sim will sit in this state indefinitely once the ground is full,
    // and it should sit there cheaply. Colony demand is what un-sticks it
    // (or nothing does, which is a fine end state for a nest that has
    // filled its ground).
    cooldown = NEST_PROJECT_COOLDOWN;
  }
}

// Walks the needs in priority order and returns the first one it can
// actually open a project for. Trying only the single most urgent need and
// giving up if it can't be sited was a starvation bug: a brood deficit
// that the nest had no geometric room to fix blocked stores and atriums
// permanently, and a real colony doesn't stop building storage because
// it's also short of nursery space.
function openProject() {
  for (const rule of DEMAND_RULES) {
    let have = 0;
    for (const c of chambers) {
      if (purposeOf(c) === rule.purpose) have += Math.PI * c.radius * c.radius;
    }
    if (rule.requiredArea() <= have) continue;

    const p = planProject(rule.purpose);
    if (p) return p;
  }
  return null;
}

// ------------------------------------------------------------
// The shaft
// ------------------------------------------------------------
function shaftDepth() {
  if (shaft.length === 0) return 0;
  return depthOf(shaft[shaft.length - 1].y);
}

// The next segment of descent, or null if the shaft has nowhere left to
// go. Angle from vertical interpolates shallow -> steep with depth (real
// shafts descend at 20-30 degrees from horizontal near the surface and
// 45-60 degrees deeper), and the lateral direction alternates, which is
// how a real shaft's loose helix reads in a flat cross-section.
function nextShaftNode() {
  const { cols, rows, cellSize } = getGridSize();
  if (cols === 0 || rows === 0 || shaft.length === 0) return null;
  const worldW = cols * cellSize;
  const worldH = rows * cellSize;
  const last = shaft[shaft.length - 1];

  const t = Math.min(1, Math.max(0, shaftDepth() / SHAFT_STEEPEN_DEPTH));
  let fromVertical = SHAFT_ANGLE_SHALLOW + (SHAFT_ANGLE_DEEP - SHAFT_ANGLE_SHALLOW) * t;
  fromVertical += (Math.random() - 0.5) * SHAFT_ANGLE_WANDER;
  // Clamped well clear of horizontal so every segment genuinely descends
  // — shaftPointAtDepth() relies on depth increasing monotonically along
  // the polyline, and a segment that ran flat or upward would break it.
  fromVertical = Math.max(0, Math.min(1.2, fromVertical));

  const y = last.y + Math.cos(fromVertical) * SHAFT_SEGMENT_LENGTH;
  if (y > worldH - SHAFT_MARGIN) return null; // reached the bottom of its world

  // Zig-zag, but a shaft near a wall flips early rather than walking into
  // it. The nest sits in a screen corner (world.js), so in practice the
  // first few segments all lean away from the near wall before the
  // alternation takes over.
  const reach = Math.sin(fromVertical) * SHAFT_SEGMENT_LENGTH;
  let side = shaftSide;
  const wouldLeave = (s) =>
    last.x + s * reach < SHAFT_MARGIN || last.x + s * reach > worldW - SHAFT_MARGIN;
  if (wouldLeave(side)) side = -side;
  if (wouldLeave(side)) return null; // boxed in both ways

  return { x: last.x + side * reach, y, side };
}

function commitShaftNode(node) {
  shaft.push({ x: node.x, y: node.y });
  shaftSide = -node.side;
}

// Where the shaft is at a given depth. Linear interpolation along the
// polyline, valid because depth is monotonic along it (see above).
function shaftPointAtDepth(d) {
  for (let i = 1; i < shaft.length; i++) {
    const a = shaft[i - 1];
    const b = shaft[i];
    const db = depthOf(b.y);
    if (d <= db) {
      const da = depthOf(a.y);
      const span = db - da;
      const f = span > 0.0001 ? (d - da) / span : 0;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
  }
  const last = shaft[shaft.length - 1];
  return { x: last.x, y: last.y };
}

// ------------------------------------------------------------
// Depth -> geometry. The whole point of Phase B2: these two functions are
// where "chambers get smaller and further apart as you go down" lives.
// ------------------------------------------------------------
// How big a room at this depth WANTS to be. Geometric decay, so each step
// deeper costs a constant FRACTION of area — measured nests roughly halve
// chamber area per depth decile, ending up with shallow rooms ~5-6x the
// area of deep ones.
function chamberTargetRadiusAtDepth(d) {
  const total = shaftDepth();
  const t = total > 0.0001 ? Math.min(1, Math.max(0, d / total)) : 1;
  return CHAMBER_RADIUS_SHALLOW * Math.pow(CHAMBER_RADIUS_DEEP / CHAMBER_RADIUS_SHALLOW, t);
}

// The largest a room at this depth may actually be: what its depth calls
// for, less whatever the surface overhead won't allow. A room can't breach
// the ground it hangs under.
function chamberSizeCapAtDepth(d) {
  return Math.min(chamberTargetRadiusAtDepth(d), d - SHAFT_MARGIN);
}

function chamberClearanceAtDepth(d) {
  const total = shaftDepth();
  const t = total > 0.0001 ? Math.min(1, Math.max(0, d / total)) : 1;
  return (
    NEST_CHAMBER_CLEARANCE_SHALLOW +
    (NEST_CHAMBER_CLEARANCE_DEEP - NEST_CHAMBER_CLEARANCE_SHALLOW) * t
  );
}

// ------------------------------------------------------------
// Site selection + cell layout
// ------------------------------------------------------------
// The three ways a nest grows, tried in order. Measured nests do all
// three simultaneously — "nests grow by simultaneous deepening, addition
// of new chambers and/or shafts and enlargement of existing chambers" —
// with enlargement contributing the most. One project at a time here, so
// they interleave over the colony's life rather than literally at once.
function planProject(purpose) {
  // 1. A new room in the right band, if there's space for one.
  const chamber = planChamber(purpose);
  if (chamber) return chamber;

  // 2. Otherwise widen a room the colony already has. This is the
  // dominant growth mode in real nests, and it's the only way a chamber
  // dug early — small, because it was the DEEP one at the time — grows
  // into the big shallow room it now sits at the depth of.
  const bigger = planEnlargement(purpose);
  if (bigger) return bigger;

  // 3. Last resort, and only for brood: go deeper. Brood space is what a
  // growing colony is actually short of, and deepening also grows every
  // shallower band's absolute room, so atriums and stores become possible
  // as a consequence of the colony growing rather than on their own
  // account. Letting ANY unplaceable chamber deepen the shaft was a
  // runaway — a full top band drove the nest to the bottom of the world
  // chasing atrium space it had no population to justify.
  if (purpose !== PURPOSE_BROOD) return null;
  return planShaftExtension();
}

// Widens whichever chamber of this purpose is furthest below the size its
// depth calls for. Cheap to lay out and pleasant to watch: every cell of
// the new ring already touches open floor, so the whole dig force can
// work on the same room at once instead of queueing down a corridor.
function planEnlargement(purpose) {
  let best = null;
  let bestRadius = 0;
  let bestGain = 0;

  for (const c of chambers) {
    if (purposeOf(c) !== purpose) continue;
    // Grow by a step, or by whatever actually fits if a step is too much.
    // Taking the fit into account HERE rather than checking it afterwards is
    // the point: an all-or-nothing "+step or nothing" version gave up
    // entirely whenever the full step didn't fit, so rooms dug early — small,
    // because they were the deepest in the nest at the time — stayed stuck at
    // their original size forever even after the nest grew far below them.
    // That's the same frozen-at-dig-time artifact deriving purposeOf() fixed,
    // just for radius instead of job.
    const fit = fittableRadiusAt(c.x, c.y, depthOf(c.y), c);
    const radius = Math.min(c.radius + CHAMBER_ENLARGE_STEP, fit);
    const gain = radius - c.radius;
    if (gain > bestGain) {
      bestGain = gain;
      bestRadius = radius;
      best = c;
    }
  }
  if (!best || bestGain < CHAMBER_ENLARGE_MIN_GAIN) return null;

  const radius = bestRadius;
  const pending = new Map();
  addDisc(pending, best.x, best.y, radius);
  if (pending.size === 0) return null; // somehow already that big

  return {
    kind: KIND_ENLARGE,
    purpose,
    target: best,
    x: best.x, y: best.y, radius,
    fromX: best.x, fromY: best.y,
    pending,
    claims: new Map(),
    claimByAnt: new Map(),
  };
}

function planChamber(purpose) {
  const band = DEPTH_BAND[purpose];
  const total = shaftDepth();
  if (!band || total <= 0) return null;

  const { cols, rows } = getGridSize();
  if (cols === 0 || rows === 0) return null;

  for (let attempt = 0; attempt < NEST_SITE_ATTEMPTS; attempt++) {
    const d = (band[0] + Math.random() * (band[1] - band[0])) * total;
    const target = chamberTargetRadiusAtDepth(d);
    const attach = shaftPointAtDepth(d);

    // Hangs off one side of the shaft on a short stub. Both sides are
    // measured and the roomier one wins, rather than picking at random and
    // taking the first that merely fits.
    //
    // That matters because the nest sits in a screen corner (world.js), so
    // the shaft runs close to one wall: a room hung on the wall side gets
    // squeezed by the world edge instead of by its depth, which quietly
    // breaks the whole shallow-rooms-are-bigger relationship the
    // architecture rests on. Choosing by available room also just reads as
    // sensible excavation — dig where there's earth to dig into.
    let x = 0, y = attach.y, radius = -1;
    for (const side of [-1, 1]) {
      const sx = attach.x + side * (CHAMBER_STUB_LENGTH + target);
      const sr = fittableRadiusAt(sx, attach.y, d);
      // Ties broken randomly so a nest in open ground doesn't favour a hand.
      if (sr > radius || (sr === radius && Math.random() < 0.5)) {
        radius = sr;
        x = sx;
      }
    }

    // A colony won't settle for a badly stunted room — it waits until
    // there's somewhere better. This is why an incipient nest has no big
    // top chambers: the surface overhead isn't there yet, and digging a
    // token 15px "atrium" 30px down would permanently occupy the spot
    // where a real one belongs.
    if (radius < target * CHAMBER_STUNT_LIMIT) continue;

    {
      const pending = layOutChamber(attach, x, y, radius);
      if (pending.size === 0) continue; // nothing left to dig here (already open ground)

      return {
        kind: KIND_CHAMBER,
        purpose, x, y, radius,
        fromX: attach.x, fromY: attach.y,
        pending,
        claims: new Map(),
        claimByAnt: new Map(),
      };
    }
  }

  return null;
}

// How deep this colony is entitled to dig. Measured nests deepen far more
// slowly than they gain area — 10x the workers buys ~2.4x the depth but
// ~7.5x the total chamber area — so a growing colony has to get its space
// from more and bigger rooms, and the shaft is capped accordingly.
// Without this, brood demand (which can only be satisfied in the bottom
// third) drove the shaft to the floor of the world at a third of the
// population that should have reached it.
function maxNestDepth() {
  const { rows, cellSize } = getGridSize();
  const worldFloor = rows * cellSize - SHAFT_MARGIN;
  const pop = Math.max(1, ants.count);
  // Scaled from the depth the founding nest ACTUALLY reached, not from
  // SHAFT_INITIAL_DEPTH: the founding loop digs whole segments, so it
  // overshoots its target by up to a segment. Scaling from the config
  // value instead put the cap BELOW the nest that already existed, which
  // forbade deepening from the very first tick.
  const allometric =
    foundingDepth * Math.pow(pop / NEST_DEPTH_REFERENCE_POP, NEST_DEPTH_ALLOMETRY);
  return Math.min(worldFloor, allometric);
}

function planShaftExtension() {
  const node = nextShaftNode();
  if (!node) return null;
  if (depthOf(node.y) > maxNestDepth()) return null; // deep enough for this colony's size

  const from = shaft[shaft.length - 1];
  const pending = new Map();
  for (const p of pathCells(from.x, from.y, node.x, node.y)) {
    addDisc(pending, p.x, p.y, NEST_TUNNEL_RADIUS);
  }
  if (pending.size === 0) return null;

  return {
    kind: KIND_SHAFT,
    purpose: null,
    x: node.x, y: node.y, radius: NEST_TUNNEL_RADIUS,
    fromX: from.x, fromY: from.y,
    side: node.side,
    pending,
    claims: new Map(),
    claimByAnt: new Map(),
  };
}

// The largest radius a room centred here may have — every constraint on
// chamber size in one place, returning a SIZE rather than a yes/no.
//
// That shape matters. As a boolean "does radius R fit here?" this was asked
// with a radius already chosen, so a spot that could take a slightly smaller
// room was simply rejected: new chambers were skipped where one nearly fit,
// and enlargement gave up entirely whenever its full step didn't fit,
// permanently freezing rooms at the size they were dug. Returning the fit
// lets both callers size to the spot instead.
//
// Constraints, in order: what the depth calls for and the surface overhead
// allows (chamberSizeCapAtDepth), the world edges, the dirt left between
// rooms — which WIDENS with depth, matching measured spacing of 2-4cm near
// the surface against 20-30cm deep — and finally the shaft itself.
function fittableRadiusAt(x, y, depth, ignore = null) {
  const { cols, rows, cellSize } = getGridSize();
  const worldW = cols * cellSize;
  const worldH = rows * cellSize;

  let limit = chamberSizeCapAtDepth(depth);

  // World edges. Enlargement skipped this check when it was a separate
  // boolean, and rooms near the corner-placed nest grew straight out of the
  // world (one reached x = 32 with radius 34).
  limit = Math.min(limit, x - SHAFT_MARGIN, worldW - SHAFT_MARGIN - x);
  limit = Math.min(limit, y - SHAFT_MARGIN, worldH - SHAFT_MARGIN - y);

  const gap = chamberClearanceAtDepth(depth);
  for (const c of chambers) {
    if (c === ignore) continue; // widening a room: it overlaps itself by definition
    limit = Math.min(limit, Math.hypot(x - c.x, y - c.y) - c.radius - gap);
  }

  // Don't let a room swallow a length of shaft it isn't attached to. Nodes
  // within a segment of this depth are its own local attachment (the stub
  // cuts into the shaft on purpose); anything further away is a different
  // part of the descent, and eating it turns a room-off-a-passage into one
  // shapeless blob.
  for (const n of shaft) {
    if (Math.abs(depthOf(n.y) - depth) < SHAFT_SEGMENT_LENGTH) continue;
    limit = Math.min(limit, Math.hypot(x - n.x, y - n.y) - gap * 0.5);
  }

  return limit;
}

// Builds the ordered set of cells a chamber project consists of: the
// short stub from the shaft out to the site, then the chamber itself
// hollowed out from its center. Cells already open are skipped.
//
// Insertion order is the colony's preferred dig order, but it isn't
// enforced — what actually sequences the work is the "must touch open
// space" claim rule, which lets the stub only be dug outward from the
// shaft while allowing several ants to widen a chamber at once.
function layOutChamber(attach, x, y, radius) {
  const pending = new Map();

  for (const p of pathCells(attach.x, attach.y, x, y)) {
    addDisc(pending, p.x, p.y, NEST_TUNNEL_RADIUS);
  }
  addDisc(pending, x, y, radius);

  return pending;
}

// Adds every not-yet-dug cell whose center falls within `radius` of
// (cx, cy), nearest first — so a chamber opens out from the middle
// rather than in ring order.
function addDisc(pending, cx, cy, radius) {
  const { cols } = getGridSize();
  const min = cellCoords(cx - radius, cy - radius);
  const max = cellCoords(cx + radius, cy + radius);
  const found = [];

  for (let row = min.row; row <= max.row; row++) {
    for (let col = min.col; col <= max.col; col++) {
      if (!inGrid(col, row)) continue;
      if (isTunnelCell(col, row)) continue;
      const c = cellCenter(col, row);
      const d = Math.hypot(c.x - cx, c.y - cy);
      if (d > radius) continue;
      found.push({ col, row, x: c.x, y: c.y, d });
    }
  }

  found.sort((a, b) => a.d - b.d);
  for (const f of found) {
    const key = f.row * cols + f.col;
    if (!pending.has(key)) pending.set(key, { col: f.col, row: f.row, x: f.x, y: f.y });
  }
}

// Walks the cells a straight line passes through, 4-connected — when
// the line steps diagonally, the intervening cell is inserted too. That
// connectivity is load-bearing: the claim rule requires each cell to
// touch open space, so a path with a diagonal-only link in it would
// stall the project dead at that point.
function pathCells(fromX, fromY, toX, toY) {
  const cells = [];
  const dist = Math.hypot(toX - fromX, toY - fromY);
  const steps = Math.max(1, Math.ceil(dist / (UNDERGROUND_CELL_SIZE * 0.25)));

  let prev = null;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = fromX + (toX - fromX) * t;
    const y = fromY + (toY - fromY) * t;
    const { col, row } = cellCoords(x, y);
    if (prev && prev.col === col && prev.row === row) continue;

    if (prev && prev.col !== col && prev.row !== row) {
      const link = cellCenter(col, prev.row); // L-corner, restores 4-connectivity
      cells.push(link);
    }
    cells.push(cellCenter(col, row));
    prev = { col, row };
  }

  return cells;
}

// ------------------------------------------------------------
// Dig force + cell claims — the interface digging.js works against.
// Claims are keyed by ant id, never index (swap-and-pop, see ants.js).
// ------------------------------------------------------------

// Recruitment gate (digging.js): work exists and is short-handed.
export function needsDiggers() {
  return project !== null && digForce.size < DIG_FORCE_MAX;
}

export function joinDigForce(id) {
  digForce.add(id);
}

export function leaveDigForce(id) {
  releaseClaim(id);
  digForce.delete(id);
}

export function getDigForceSize() {
  return digForce.size;
}

// Drops ants that stopped digging without saying so — died (swap-and-pop
// means their id simply vanishes from idToIndex) or got knocked out of
// STATE_DIG by something else. Cheap: the set is capped at DIG_FORCE_MAX.
function pruneDigForce() {
  for (const id of digForce) {
    const i = idToIndex.get(id);
    if (i === undefined || ants.state[i] !== STATE_DIG) {
      releaseClaim(id);
      digForce.delete(id);
    }
  }
}

function isClaimable(cell) {
  return hasAdjacentTunnel(cell.col, cell.row);
}

// Whether there is a cell an arriving digger could actually start on
// right now. digging.js checks this at the entrance BEFORE crossing
// under: a project whose whole frontier is already claimed has nothing
// for one more ant, and sending it down just to have it turn around is
// both pointless and visible (it pops back out at the nest a moment
// after disappearing into it).
export function hasClaimableCell() {
  if (!project) return false;
  for (const [key, cell] of project.pending) {
    if (project.claims.has(key)) continue;
    if (isClaimable(cell)) return true;
  }
  return false;
}

// Hands the ant the nearest unclaimed cell it's allowed to start on, or
// null if there's nothing to do — which is digging.js's cue to surface.
// One ant per cell: two ants carving the same spot would either
// double-count the work or fight over the same few pixels of frontier.
export function claimDigCell(id, fromX, fromY) {
  if (!project) return null;

  let best = null;
  let bestKey = -1;
  let bestDistSq = Infinity;

  for (const [key, cell] of project.pending) {
    if (project.claims.has(key)) continue;
    if (!isClaimable(cell)) continue;
    const dx = cell.x - fromX, dy = cell.y - fromY;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = cell;
      bestKey = key;
    }
  }

  if (!best) return null;

  releaseClaim(id); // an ant only ever holds one cell
  project.claims.set(bestKey, id);
  project.claimByAnt.set(id, bestKey);
  return { x: best.x, y: best.y };
}

export function getClaim(id) {
  if (!project) return null;
  const key = project.claimByAnt.get(id);
  if (key === undefined) return null;
  const cell = project.pending.get(key);
  return cell ? { x: cell.x, y: cell.y } : null;
}

export function releaseClaim(id) {
  if (!project) return;
  const key = project.claimByAnt.get(id);
  if (key === undefined) return;
  project.claims.delete(key);
  project.claimByAnt.delete(id);
}

// The carve finished — open the cell for real and retire it from the
// plan. underground.js does the actual grid mutation; this file just
// stops tracking it.
export function completeClaim(id) {
  if (!project) return;
  const key = project.claimByAnt.get(id);
  if (key === undefined) return;
  const cell = project.pending.get(key);
  if (cell) digCell(cell.x, cell.y);
  project.pending.delete(key);
  project.claims.delete(key);
  project.claimByAnt.delete(id);
}
