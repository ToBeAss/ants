// ============================================================
// Underground — the side-view tunnel cross-section (ROADMAP.md Phase
// B). Owns the physical dirt/tunnel cell grid, parallel to how
// world.js owns the surface layout ("what's in the environment," not
// "who exists" or steering/rendering). Movement blocking (the
// avoidSurfaces-style tunnel steering), the DIG task, and rendering
// are separate, later Phase B pieces — this file is data + the
// carve/query API they'll all sit on top of.
//
// Containment framing (decided 2026-07-26, see ROADMAP.md): the grid
// is full-size from init, but only a small "unlocked" region around
// the starting chamber is diggable at first — an AntsCanada-style
// test tube, not a full formicarium on day one. Expanding the
// unlocked region is a future player-facing stewardship action (same
// category as dropping food or placing an obstacle); expandUnlockedRegion()
// is ready for main.js to wire up once that interaction is built.
//
// NOTE: does not currently resize with the window — same accepted
// "clears and reinitializes on resize" tradeoff already made for the
// pheromone grid (see pheromones.js/main.js), for the same reason:
// stale grid dimensions after a resize would misalign cell-to-world
// mapping, which is worse than losing dug progress.
// ============================================================
import {
  UNDERGROUND_CELL_SIZE,
  UNDERGROUND_CHAMBER_RADIUS,
  UNDERGROUND_UNLOCKED_RADIUS_INITIAL,
  UNDERGROUND_UNLOCKED_RADIUS_EXPAND,
  TUNNEL_AVOID_MARGIN,
  TUNNEL_AVOID_STEER_BASE,
  TUNNEL_AVOID_STEER_URGENCY,
  TUNNEL_AVOID_HUG_FRACTION,
  DOMAIN_SURFACE,
  DOMAIN_UNDERGROUND,
} from './config.js';
import { nest } from './world.js';

export const DIRT = 0;
export const TUNNEL = 1;

let cols = 0;
let rows = 0;
let grid = new Uint8Array(0);

// The single point linking the two views (ROADMAP.md's "entrance
// linkage") — horizontally aligned with the surface nest marker, at
// the top (y=0) of the underground cross-section.
export const entrance = { x: 0, y: 0 };

// Diggable region is a circle centered on the starting chamber (fixed
// once set at init — expansion grows the radius, not the center,
// same way a real formicarium grows outward from its original tube).
const unlockedCenter = { x: 0, y: 0 };
let unlockedRadius = UNDERGROUND_UNLOCKED_RADIUS_INITIAL;

export function initUnderground(width, height) {
  cols = Math.ceil(width / UNDERGROUND_CELL_SIZE);
  rows = Math.ceil(height / UNDERGROUND_CELL_SIZE);
  grid = new Uint8Array(cols * rows); // 0 = DIRT everywhere by default

  entrance.x = nest.x;
  entrance.y = 0;

  unlockedCenter.x = entrance.x;
  unlockedCenter.y = entrance.y + UNDERGROUND_CHAMBER_RADIUS;
  unlockedRadius = UNDERGROUND_UNLOCKED_RADIUS_INITIAL;

  // Starting chamber bypasses the unlocked-region gate (digCircle, not
  // digCell) since it IS what defines the initial unlocked region.
  digCircle(unlockedCenter.x, unlockedCenter.y, UNDERGROUND_CHAMBER_RADIUS);
}

function cellIndex(x, y) {
  const cx = Math.min(cols - 1, Math.max(0, Math.floor(x / UNDERGROUND_CELL_SIZE)));
  const cy = Math.min(rows - 1, Math.max(0, Math.floor(y / UNDERGROUND_CELL_SIZE)));
  return cy * cols + cx;
}

export function cellAt(x, y) {
  if (cols === 0 || rows === 0) return DIRT;
  return grid[cellIndex(x, y)];
}

export function isTunnel(x, y) {
  return cellAt(x, y) === TUNNEL;
}

// Whether (x, y) falls within the currently unlocked region — the gate
// digCell() enforces, and the future container-expansion action widens.
export function isDiggable(x, y) {
  return Math.hypot(x - unlockedCenter.x, y - unlockedCenter.y) <= unlockedRadius;
}

// Carves a single cell to TUNNEL, refusing outside the unlocked region.
// Called from the (not-yet-built) DIG task once it exists.
export function digCell(x, y) {
  if (cols === 0 || rows === 0 || !isDiggable(x, y)) return false;
  grid[cellIndex(x, y)] = TUNNEL;
  return true;
}

// Carves every cell within `radius` of (cx, cy), ignoring the unlocked-
// region gate — only used internally for the starting chamber at init.
function digCircle(cx, cy, radius) {
  const minCol = Math.max(0, Math.floor((cx - radius) / UNDERGROUND_CELL_SIZE));
  const maxCol = Math.min(cols - 1, Math.ceil((cx + radius) / UNDERGROUND_CELL_SIZE));
  const minRow = Math.max(0, Math.floor((cy - radius) / UNDERGROUND_CELL_SIZE));
  const maxRow = Math.min(rows - 1, Math.ceil((cy + radius) / UNDERGROUND_CELL_SIZE));

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const wx = (col + 0.5) * UNDERGROUND_CELL_SIZE;
      const wy = (row + 0.5) * UNDERGROUND_CELL_SIZE;
      if (Math.hypot(wx - cx, wy - cy) <= radius) {
        grid[row * cols + col] = TUNNEL;
      }
    }
  }
}

// Player-facing stewardship action (see module header) — not yet wired
// to input; main.js will call this once the container-expansion
// interaction is built.
export function expandUnlockedRegion(amount = UNDERGROUND_UNLOCKED_RADIUS_EXPAND) {
  unlockedRadius += amount;
}

// Finds the nearest DIRT cell that's both diggable (within the
// unlocked region) and 4-neighbor-adjacent to an existing TUNNEL cell
// — a real frontier reachable by carving outward from what's already
// dug, not an isolated dirt pocket. Called by digging.js. Only scans
// the unlocked region's bounding box (small and fixed relative to the
// full grid), not the whole grid — cheap even once per active digger
// per tick. Grows with unlockedRadius over time (container expansion),
// same accepted tradeoff as spatialGrid.js's Map: revisit only if
// this becomes a measured bottleneck.
export function findFrontierCell(fromX, fromY) {
  if (cols === 0 || rows === 0) return null;

  const minCol = Math.max(0, Math.floor((unlockedCenter.x - unlockedRadius) / UNDERGROUND_CELL_SIZE));
  const maxCol = Math.min(cols - 1, Math.ceil((unlockedCenter.x + unlockedRadius) / UNDERGROUND_CELL_SIZE));
  const minRow = Math.max(0, Math.floor((unlockedCenter.y - unlockedRadius) / UNDERGROUND_CELL_SIZE));
  const maxRow = Math.min(rows - 1, Math.ceil((unlockedCenter.y + unlockedRadius) / UNDERGROUND_CELL_SIZE));

  let best = null;
  let bestDistSq = Infinity;

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const idx = row * cols + col;
      if (grid[idx] !== DIRT) continue;

      const wx = (col + 0.5) * UNDERGROUND_CELL_SIZE;
      const wy = (row + 0.5) * UNDERGROUND_CELL_SIZE;
      if (!isDiggable(wx, wy)) continue;

      const hasAdjacentTunnel =
        (col > 0 && grid[idx - 1] === TUNNEL) ||
        (col < cols - 1 && grid[idx + 1] === TUNNEL) ||
        (row > 0 && grid[idx - cols] === TUNNEL) ||
        (row < rows - 1 && grid[idx + cols] === TUNNEL);
      if (!hasAdjacentTunnel) continue;

      const dx = wx - fromX, dy = wy - fromY;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = { x: wx, y: wy };
      }
    }
  }

  return best;
}

export function getUndergroundGrid() {
  return { grid, cols, rows, cellSize: UNDERGROUND_CELL_SIZE, entrance, unlockedCenter, unlockedRadius };
}

// ------------------------------------------------------------
// Entrance linkage — the single point connecting the two views
// (ROADMAP.md Phase B). Crossing flips an ant's `domain` flag (see
// ants.js) and relocates it to the corresponding point in the other
// view — no simultaneous dual-rendering, an ant is only ever in one
// view's coordinate space at a time.
//
// Called from digging.js: checkDigRecruitment() crosses a WANDERing
// ant in via enterUnderground(), updateDigging() crosses it back out
// via exitToSurface() once there's nothing left to dig.
// ------------------------------------------------------------
export function enterUnderground(ants, i) {
  ants.domain[i] = DOMAIN_UNDERGROUND;
  ants.x[i] = entrance.x;
  ants.y[i] = entrance.y + UNDERGROUND_CELL_SIZE; // just inside the dug starting chamber, not on its boundary
}

export function exitToSurface(ants, i) {
  ants.domain[i] = DOMAIN_SURFACE;
  ants.x[i] = nest.x;
  ants.y[i] = nest.y;
}

// ------------------------------------------------------------
// Tunnel movement — treats nearby DIRT cells as blocking mass, the
// underground analog of avoidSurfaces() in behaviors.js (same
// continuous-steering paradigm, deliberately NOT folded into that
// function itself: this reasons about grid cells rather than
// analytic wall/circle distances, and the underground plane is a
// genuinely separate movement domain from the surface — see
// ROADMAP.md Phase B). Each nearby dirt cell contributes a push AWAY
// from its center, weighted by proximity; every contribution is
// summed into ONE combined push vector before a single tangent
// direction is chosen, same "sum first, pick one tangent" lesson
// avoidSurfaces() already relies on (see CLAUDE.md's steering
// debugging notes) — picking a tangent per-cell independently would
// let adjacent cells cancel unpredictably at notches, exactly like
// the multi-obstacle bug that motivated avoidSurfaces() in the first
// place.
//
// Called from sim.js for every DOMAIN_UNDERGROUND ant, each tick.
// ------------------------------------------------------------
export function avoidTunnelWalls(ants, i, dt) {
  if (cols === 0 || rows === 0) return;

  const x = ants.x[i], y = ants.y[i];
  const hx = Math.cos(ants.rotation[i]), hy = Math.sin(ants.rotation[i]);
  const cellRadius = UNDERGROUND_CELL_SIZE / 2; // each dirt cell approximated as a small circle, same
                                                 // spirit as avoidSurfaces() subtracting obs.radius

  let pushX = 0, pushY = 0;
  let danger = 0;
  let any = false;
  let minSurfaceDist = Infinity;

  function addSurface(nx, ny, surfaceDist) {
    if (surfaceDist >= TUNNEL_AVOID_MARGIN) return;
    any = true;
    const weight = Math.max(0, 1 - surfaceDist / TUNNEL_AVOID_MARGIN);
    pushX += nx * weight;
    pushY += ny * weight;
    const headingDot = hx * nx + hy * ny;
    danger = Math.max(danger, Math.max(0, -headingDot));
    minSurfaceDist = Math.min(minSurfaceDist, surfaceDist);
  }

  // Only scan the small neighborhood that could possibly be within
  // margin range — cheap by construction, unlike a full-grid scan.
  const reach = TUNNEL_AVOID_MARGIN + cellRadius;
  const minCol = Math.max(0, Math.floor((x - reach) / UNDERGROUND_CELL_SIZE));
  const maxCol = Math.min(cols - 1, Math.floor((x + reach) / UNDERGROUND_CELL_SIZE));
  const minRow = Math.max(0, Math.floor((y - reach) / UNDERGROUND_CELL_SIZE));
  const maxRow = Math.min(rows - 1, Math.floor((y + reach) / UNDERGROUND_CELL_SIZE));

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (grid[row * cols + col] !== DIRT) continue;
      const cx = (col + 0.5) * UNDERGROUND_CELL_SIZE;
      const cy = (row + 0.5) * UNDERGROUND_CELL_SIZE;
      const dx = x - cx, dy = y - cy;
      const centerDist = Math.hypot(dx, dy);
      if (centerDist < 0.0001) continue; // degenerate: exactly at a cell's center
      addSurface(dx / centerDist, dy / centerDist, centerDist - cellRadius);
    }
  }

  if (!any) return;

  const pushMag = Math.hypot(pushX, pushY);
  if (pushMag < 0.0001) return; // canceled out (rare, symmetric squeeze) — nothing coherent this tick

  const nx = pushX / pushMag, ny = pushY / pushMag; // ONE combined outward normal, across every nearby dirt cell

  const tA = { x: -ny, y: nx };
  const tB = { x: ny, y: -nx };
  const tangent = (tA.x * hx + tA.y * hy) > (tB.x * hx + tB.y * hy) ? tA : tB;

  const depth = TUNNEL_AVOID_MARGIN - minSurfaceDist;
  const desiredDepth = TUNNEL_AVOID_MARGIN * TUNNEL_AVOID_HUG_FRACTION;
  const e = Math.max(-1, Math.min(1, (desiredDepth - depth) / TUNNEL_AVOID_MARGIN));
  const desiredX = tangent.x * (1 - Math.abs(e)) - nx * e;
  const desiredY = tangent.y * (1 - Math.abs(e)) - ny * e;

  const steerRate = TUNNEL_AVOID_STEER_BASE + TUNNEL_AVOID_STEER_URGENCY * danger;
  const targetAngle = Math.atan2(desiredY, desiredX);
  let diff = targetAngle - ants.rotation[i];
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  ants.rotation[i] += diff * steerRate * dt;
}
