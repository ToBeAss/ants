// ============================================================
// Nest plan — the colony's excavation intent: which chambers exist,
// which one it currently needs, where that one goes, and which cells
// have to be carved to get there. Diggers (digging.js) carry the plan
// out; they don't decide anything about it beyond which cell they
// personally take next.
//
// This is the piece that makes the nest a NEST rather than a cavity.
// Digging used to be "walk to the nearest unexcavated dirt and remove
// it," which erodes a blob outward from the entrance — busy-looking,
// but the colony was never building anything. Here, every dug cell
// belongs to a project: a corridor branching off an existing chamber,
// plus the chamber at the end of it, dug for a stated purpose.
//
// Two rules do most of the work, and both come straight from real
// ant-keeping:
//
//   1. Dig only what's NEEDED, when it's needed. Each chamber purpose
//      has a demand rule reading actual colony state (population for
//      brood space, colony.food for storage). Demand met => nobody digs
//      at all, and diggers already underground come back up.
//   2. One project at a time, with a cooldown between. A colony that
//      excavates ahead of demand has spent effort it didn't have to and
//      opened more tunnel than it can defend — expanding early is a
//      real risk, not just waste.
//
// Owns planning only: the physical grid is underground.js's, the ant
// state machine is digging.js's, drawing is undergroundRender.js's.
// ============================================================
import { ants, idToIndex } from './ants.js';
import { colony } from './colony.js';
import {
  startChamber,
  getGridSize, cellCoords, cellCenter, inGrid, isTunnelCell, hasAdjacentTunnel,
  digCell,
} from './underground.js';
import {
  STATE_DIG,
  UNDERGROUND_CELL_SIZE, UNDERGROUND_CHAMBER_RADIUS,
  CHAMBER_RADIUS_BROOD, CHAMBER_RADIUS_FOOD,
  ANTS_PER_BROOD_CHAMBER, FOOD_PER_STORAGE_CHAMBER,
  NEST_PROJECT_COOLDOWN,
  NEST_TUNNEL_LENGTH_MIN, NEST_TUNNEL_LENGTH_MAX, NEST_TUNNEL_RADIUS,
  NEST_CHAMBER_CLEARANCE, NEST_SITE_ANGLE_SPREAD, NEST_SITE_ATTEMPTS,
  DIG_FORCE_MAX,
} from './config.js';

// Chamber purposes. Strings rather than the numeric-constant style used
// for ant states (config.js): there will only ever be a handful, they're
// never compared in a hot loop, and they're the natural label for the
// renderer to print. Adding a purpose = adding a radius here and a
// demand rule below; nothing else in the file is purpose-specific.
export const PURPOSE_QUEEN = 'queen';
export const PURPOSE_BROOD = 'brood';
export const PURPOSE_FOOD = 'food';

const CHAMBER_RADIUS = {
  [PURPOSE_QUEEN]: UNDERGROUND_CHAMBER_RADIUS,
  [PURPOSE_BROOD]: CHAMBER_RADIUS_BROOD,
  [PURPOSE_FOOD]: CHAMBER_RADIUS_FOOD,
};

// Demand rules, highest priority first. Each returns how many chambers
// of that purpose the colony should have RIGHT NOW; a project opens
// whenever that exceeds how many it has (built + under construction).
//
// The queen chamber is deliberately absent: it's the starting chamber,
// registered at init, and a colony never needs a second one.
//
// Brood demand currently reads worker population, standing in for brood
// count until brood entities exist (ROADMAP.md Phase C/D) — floor(), so
// the starting chamber covers the colony until it has genuinely
// outgrown it, and each further chamber waits for real growth rather
// than being dug in anticipation of it. Swap the reader, not the shape
// of the rule, once brood is real.
const DEMAND_RULES = [
  {
    purpose: PURPOSE_BROOD,
    required: () => Math.floor(ants.count / ANTS_PER_BROOD_CHAMBER),
  },
  {
    purpose: PURPOSE_FOOD,
    required: () => Math.floor(colony.food / FOOD_PER_STORAGE_CHAMBER),
  },
];

// Finished chambers: { purpose, x, y, radius }. The starting chamber is
// entry zero. Phases C/E will read this to place the queen and to find
// the brood chamber nurses should work in.
let chambers = [];

// At most one project in flight, ever (rule 2 above):
//   { purpose, x, y, radius, fromX, fromY,
//     pending: Map(cellKey -> {col,row,x,y}),   // planned, not yet dug
//     claims: Map(cellKey -> antId),            // being carved right now
//     claimByAnt: Map(antId -> cellKey) }
let project = null;
let cooldown = 0;

// Ant ids (not indices — indices aren't stable identity, see ants.js)
// of everyone currently assigned to digging. Used to cap the dig force
// so excavation stays a side activity rather than the whole colony.
const digForce = new Set();

export function initNestPlan() {
  chambers = [{
    purpose: PURPOSE_QUEEN,
    x: startChamber.x,
    y: startChamber.y,
    radius: startChamber.radius,
  }];
  project = null;
  cooldown = 0;
  digForce.clear();
}

export function getChambers() {
  return chambers;
}

export function getActiveProject() {
  return project;
}

// ------------------------------------------------------------
// Per-tick planning — called once per tick from sim.js, not per ant.
// ------------------------------------------------------------
export function updateNestPlan(dt) {
  pruneDigForce();

  if (project) {
    if (project.pending.size === 0) {
      // Every planned cell is open — the chamber exists now.
      chambers.push({
        purpose: project.purpose,
        x: project.x,
        y: project.y,
        radius: project.radius,
      });
      project = null;
      cooldown = NEST_PROJECT_COOLDOWN;
    } else if (project.claims.size === 0 && !hasClaimableCell()) {
      // Cells left, nobody carving, and nothing reachable to carve —
      // the corridor got severed from open space somehow (shouldn't
      // happen: paths are laid out 4-connected from an existing
      // chamber). Abandon rather than leave diggers circling forever;
      // the demand is still unmet, so a fresh site gets planned after
      // the cooldown. Same "give up on a belief that isn't working"
      // fallback foraging.js uses for lost carriers.
      project = null;
      cooldown = NEST_PROJECT_COOLDOWN;
    }
    return;
  }

  if (cooldown > 0) {
    cooldown -= dt;
    return;
  }

  const purpose = findUnmetNeed();
  if (!purpose) return; // nothing the colony needs — nobody digs

  project = planProject(purpose);
  if (!project) {
    // No site fit — the nest has run out of room to grow into (bounds
    // plus inter-chamber clearance). Back off for a full cooldown
    // rather than re-rolling NEST_SITE_ATTEMPTS candidate sites every
    // tick forever: an always-on sim will sit in this state
    // indefinitely once the ground is full, and it should sit there
    // cheaply. Colony demand is what un-sticks it (or nothing does,
    // which is a fine end state for a nest that has filled its ground).
    cooldown = NEST_PROJECT_COOLDOWN;
  }
}

function findUnmetNeed() {
  for (const rule of DEMAND_RULES) {
    let have = 0;
    for (const c of chambers) if (c.purpose === rule.purpose) have++;
    if (rule.required() > have) return rule.purpose;
  }
  return null;
}

// ------------------------------------------------------------
// Site selection + cell layout
// ------------------------------------------------------------
function planProject(purpose) {
  const radius = CHAMBER_RADIUS[purpose];
  const { cols, rows, cellSize } = getGridSize();
  if (cols === 0 || rows === 0) return null;

  const worldW = cols * cellSize;
  const worldH = rows * cellSize;
  const margin = radius + cellSize;

  for (let attempt = 0; attempt < NEST_SITE_ATTEMPTS; attempt++) {
    // Branch off an existing chamber — a new room hangs off the nest
    // that's already there, it doesn't appear somewhere unconnected.
    const parent = chambers[Math.floor(Math.random() * chambers.length)];

    // Downward-biased direction (+y is deeper, canvas coords). Nests
    // grow down and outward; nothing wants to be dug back up toward
    // the surface.
    const angle = Math.PI / 2 + (Math.random() * 2 - 1) * NEST_SITE_ANGLE_SPREAD;
    const dist =
      parent.radius + radius +
      NEST_TUNNEL_LENGTH_MIN + Math.random() * (NEST_TUNNEL_LENGTH_MAX - NEST_TUNNEL_LENGTH_MIN);

    const x = parent.x + Math.cos(angle) * dist;
    const y = parent.y + Math.sin(angle) * dist;

    if (x < margin || x > worldW - margin || y < margin || y > worldH - margin) continue;

    // Keep real dirt between rooms, so the nest reads as separate
    // chambers rather than one merged cavity.
    let clear = true;
    for (const c of chambers) {
      if (Math.hypot(x - c.x, y - c.y) < c.radius + radius + NEST_CHAMBER_CLEARANCE) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;

    const pending = layOutCells(parent.x, parent.y, x, y, radius);
    if (pending.size === 0) continue; // nothing left to dig here (already open ground)

    return {
      purpose, x, y, radius,
      fromX: parent.x, fromY: parent.y,
      pending,
      claims: new Map(),
      claimByAnt: new Map(),
    };
  }

  return null; // no site fit this tick — try again next tick
}

// Builds the ordered set of cells a project consists of: the corridor
// from the parent chamber to the new site, then the chamber itself
// hollowed out from its center. Cells already open are skipped (a
// corridor may run through existing tunnel).
//
// Insertion order is the colony's preferred dig order, but it isn't
// enforced — what actually sequences the work is the "must touch open
// space" claim rule, which lets a corridor only be dug outward from its
// mouth while allowing several ants to widen a chamber at once.
function layOutCells(fromX, fromY, toX, toY, radius) {
  const pending = new Map();

  for (const p of pathCells(fromX, fromY, toX, toY)) {
    addDisc(pending, p.x, p.y, NEST_TUNNEL_RADIUS);
  }
  addDisc(pending, toX, toY, radius);

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
// touch open space, so a corridor with a diagonal-only link in it would
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
