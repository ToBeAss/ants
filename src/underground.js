// ============================================================
// Underground — the side-view tunnel cross-section (ROADMAP.md Phase
// B). Owns the physical dirt/tunnel cell grid, parallel to how
// world.js owns the surface layout ("what's in the environment," not
// "who exists" or steering/rendering). Movement blocking (the
// avoidSurfaces-style tunnel steering), the DIG task, and rendering
// are separate, later Phase B pieces — this file is data + the
// carve/query API they'll all sit on top of.
//
// The whole grid is diggable (changed 2026-07-26 — there used to be an
// "unlocked region" circle gating digCell()). What bounds digging now
// is demand, not geography: nestPlan.js only opens an excavation
// project when the colony needs a chamber, so this file went back to
// being what it says it is — the physical medium — with the decision
// of what to carve owned one level up. This file still knows nothing
// about WHY a cell is being dug.
//
// NOTE: does not currently resize with the window — same accepted
// "clears and reinitializes on resize" tradeoff already made for the
// pheromone grid (see pheromones.js/main.js), for the same reason:
// stale grid dimensions after a resize would misalign cell-to-world
// mapping, which is worse than losing dug progress.
// ============================================================
import {
  UNDERGROUND_CELL_SIZE,
  TUNNEL_AVOID_MARGIN,
  TUNNEL_AVOID_STEER_BASE,
  TUNNEL_AVOID_STEER_URGENCY,
  TUNNEL_AVOID_HUG_FRACTION,
  DOMAIN_SURFACE,
  DOMAIN_UNDERGROUND,
  NEST_DRAW_RADIUS,
} from './config.js';
import { nest } from './world.js';

export const DIRT = 0;
export const TUNNEL = 1;

// How far pushOutOfDirt() searches, in cells, for open ground to put a
// buried ant back into. A few cells is plenty: this is a backstop for
// steering that reacted slightly too late, not a rescue from deep burial.
const DIRT_ESCAPE_CELLS = 5;

let cols = 0;
let rows = 0;
let grid = new Uint8Array(0);
// Per-cell carve progress, 0..1, for DIRT cells currently being worked
// on by a digger (see digging.js). Purely presentational — nothing in
// the simulation reads it, and a cell is still solid DIRT for movement
// purposes until it flips to TUNNEL. It exists because carving one cell
// now takes DIG_CARVE_MIN..MAX seconds: without it, an ant that stops
// for 12 seconds and then blinks a cell open reads as broken rather
// than as slow, deliberate work.
let progress = new Float32Array(0);

// The single point linking the two views (ROADMAP.md's "entrance
// linkage") — horizontally aligned with the surface nest marker, at
// the top (y=0) of the underground cross-section.
export const entrance = { x: 0, y: 0 };

// Depth of a world y, measured from the entrance downward. The single
// place the underground's vertical convention is expressed: +y is deeper
// because that's what the canvas does, so depth is just y offset from the
// entrance. Everything that reasons about depth (nestPlan.js does, a
// lot) goes through this rather than reading y directly, so flipping the
// convention later — putting the underground in its own coordinate range
// so the two domains stop sharing one, see ROADMAP.md — is a change here
// plus the render transform, not a sweep through the planner.
export function depthOf(y) {
  return y - entrance.y;
}

// Grid only. The SHAPE the nest starts as (a short founding shaft with
// one small chamber at its bottom) is a planning decision and belongs to
// nestPlan.js, which carves it via carveDisc() at init — this file used
// to dig a `startChamber` here and export it, which put "what the nest
// looks like" in the file that owns "what dirt is."
export function initUnderground(width, height) {
  cols = Math.ceil(width / UNDERGROUND_CELL_SIZE);
  rows = Math.ceil(height / UNDERGROUND_CELL_SIZE);
  grid = new Uint8Array(cols * rows); // 0 = DIRT everywhere by default
  progress = new Float32Array(cols * rows);

  entrance.x = nest.x;
  entrance.y = 0;
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

// ------------------------------------------------------------
// Cell-coordinate API — nestPlan.js lays out corridors and chambers in
// grid space (which cells make up a project), so it needs to address
// cells by (col, row) rather than only by world position. Everything
// here is a thin accessor; the grid itself stays private to this file.
// ------------------------------------------------------------
export function getGridSize() {
  return { cols, rows, cellSize: UNDERGROUND_CELL_SIZE };
}

export function cellCoords(x, y) {
  return {
    col: Math.floor(x / UNDERGROUND_CELL_SIZE),
    row: Math.floor(y / UNDERGROUND_CELL_SIZE),
  };
}

export function cellCenter(col, row) {
  return {
    x: (col + 0.5) * UNDERGROUND_CELL_SIZE,
    y: (row + 0.5) * UNDERGROUND_CELL_SIZE,
  };
}

export function inGrid(col, row) {
  return col >= 0 && col < cols && row >= 0 && row < rows;
}

export function isTunnelCell(col, row) {
  if (!inGrid(col, row)) return false;
  return grid[row * cols + col] === TUNNEL;
}

// True if any 4-neighbor is already dug — i.e. this cell can be reached
// and carved from existing open space. nestPlan.js uses this to decide
// which of a project's planned cells are claimable yet, which is what
// makes a corridor get dug outward in order instead of ants opening
// disconnected pockets partway down it.
export function hasAdjacentTunnel(col, row) {
  return (
    isTunnelCell(col - 1, row) ||
    isTunnelCell(col + 1, row) ||
    isTunnelCell(col, row - 1) ||
    isTunnelCell(col, row + 1)
  );
}

// Carves a single cell to TUNNEL. No gating left beyond "the grid
// exists" — what may be dug is nestPlan.js's call now (see header).
export function digCell(x, y) {
  if (cols === 0 || rows === 0) return false;
  const idx = cellIndex(x, y);
  grid[idx] = TUNNEL;
  progress[idx] = 0; // done being worked on — the cell is open now
  return true;
}

// How far along a digger is on a cell it hasn't opened yet (0..1).
// Cleared by digCell() on completion, and by digging.js when an ant
// abandons a cell (partial progress doesn't survive being abandoned —
// simpler than tracking who did how much, and rare enough not to matter).
export function setCellProgress(x, y, t) {
  if (cols === 0 || rows === 0) return;
  progress[cellIndex(x, y)] = Math.max(0, Math.min(1, t));
}

// Carves every cell within `radius` of (cx, cy) in one go. Used by
// nestPlan.js to lay in the founding nest at init — the one case where
// tunnel appears without an ant having dug it. Everything after init
// goes through digCell(), one slow cell at a time.
export function carveDisc(cx, cy, radius) {
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

// There is deliberately no "find the nearest diggable dirt" query here
// any more. There used to be (findFrontierCell), and it's what made
// diggers behave like erosion — nibbling whatever dirt happened to be
// closest, producing a blob rather than a nest. Target selection now
// comes from nestPlan.js's active project, so a carved cell is always
// part of a corridor or a chamber the colony decided it needed.

export function getUndergroundGrid() {
  return { grid, progress, cols, rows, cellSize: UNDERGROUND_CELL_SIZE, entrance };
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
  ants.rotation[i] = Math.PI / 2 + (Math.random() - 0.5) * 0.8; // heading down into the chamber, not back up
                                                                 // at the ceiling it just came through
}

export function exitToSurface(ants, i) {
  ants.domain[i] = DOMAIN_SURFACE;
  // Emerge from somewhere inside the entrance hole, heading outward —
  // not from one exact pixel. Snapping every returning ant to the nest's
  // center point looked like a teleport (most visibly when an ant
  // crossed down and straight back up again: it appeared to jump from
  // the edge of the nest marker to its middle), and stacked every
  // emerging ant on the same spot for separation to then untangle.
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * NEST_DRAW_RADIUS * 0.6;
  ants.x[i] = nest.x + Math.cos(angle) * r;
  ants.y[i] = nest.y + Math.sin(angle) * r;
  ants.rotation[i] = angle;
  // Physically at the nest, so its path-integration estimate is
  // knowably zero — same recalibration foraging.js does on a confirmed
  // arrival, which this is one of.
  ants.homeVectorX[i] = 0;
  ants.homeVectorY[i] = 0;
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
// Probes ahead; if the way is blocked, turns toward whichever direction has
// the most open tunnel. Runs alongside the summed-push steering below, and
// covers the case that steering structurally cannot: in a corridor barely
// wider than TUNNEL_AVOID_MARGIN, dirt on opposite sides cancels to a zero
// push vector and the ant gets no correction at all. A probe can't cancel
// out, which is the whole point (see TUNNEL_FEELER_* in config.js).
//
// Hard backstop: if an ant's centre has ended up inside solid dirt, move it
// to the nearest open cell and point it at the opening. Same role as the
// wall and obstacle position clamps in sim.js — steering should normally
// prevent this, but when it doesn't, an ant embedded in the earth is the
// most obviously broken thing in the simulation, and the underground path
// was the one movement domain with no such backstop at all.
//
// Re-aiming matters as much as repositioning: without it an ant clamped out
// of a wall keeps its old heading, walks straight back in, and oscillates.
export function pushOutOfDirt(ants, i) {
  if (cols === 0 || rows === 0) return false;

  const col = Math.floor(ants.x[i] / UNDERGROUND_CELL_SIZE);
  const row = Math.floor(ants.y[i] / UNDERGROUND_CELL_SIZE);
  if (isTunnelCell(col, row)) return false;

  let bestDistSq = Infinity;
  let bx = 0, by = 0;
  for (let dr = -DIRT_ESCAPE_CELLS; dr <= DIRT_ESCAPE_CELLS; dr++) {
    for (let dc = -DIRT_ESCAPE_CELLS; dc <= DIRT_ESCAPE_CELLS; dc++) {
      if (!isTunnelCell(col + dc, row + dr)) continue;
      const c = cellCenter(col + dc, row + dr);
      const dx = c.x - ants.x[i], dy = c.y - ants.y[i];
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bx = c.x;
        by = c.y;
      }
    }
  }
  if (bestDistSq === Infinity) return false; // no open cell anywhere near — leave it be

  ants.rotation[i] = Math.atan2(by - ants.y[i], bx - ants.x[i]);
  ants.x[i] = bx;
  ants.y[i] = by;
  return true;
}

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
