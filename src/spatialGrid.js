// ============================================================
// Spatial grid — bins ants into coarse cells each tick so nearby-ant
// queries (used for separation/collision avoidance) don't need to
// check every ant against every other ant. O(n²) brute-force would be
// far too expensive at the ant counts this project already targets
// (10k+) — this brings it down to roughly O(n * ants-per-cell).
//
// Rebuilt fresh every simStep call, not persisted between ticks —
// ants move every tick, so a stale grid would be wrong immediately.
//
// Uses a Map keyed by "cx,cy" rather than a flat typed array like the
// pheromone grid — simpler for a first version (no need to know world
// bounds up front), but Map operations have real overhead (string-key
// hashing) compared to raw array indexing. If this becomes a measured
// bottleneck at high ant counts, a flat-array spatial hash (same
// pattern pheromones.js already uses) is the natural next optimization.
// ============================================================
import { SEPARATION_RADIUS } from './config.js';

// Cell size >= search radius guarantees any ant within SEPARATION_RADIUS
// is always found in the current cell or one of the 8 adjacent cells —
// standard uniform-grid neighbor-search guarantee.
const CELL_SIZE = SEPARATION_RADIUS;

let cellMap = new Map();

export function rebuildSpatialGrid(ants) {
  cellMap.clear();
  for (let i = 0; i < ants.count; i++) {
    const cx = Math.floor(ants.x[i] / CELL_SIZE);
    const cy = Math.floor(ants.y[i] / CELL_SIZE);
    const key = cx + ',' + cy;
    let bucket = cellMap.get(key);
    if (!bucket) {
      bucket = [];
      cellMap.set(key, bucket);
    }
    bucket.push(i);
  }
}

// Calls callback(j) for every ant index j sharing ant i's cell or an
// adjacent one (a 3x3 neighborhood) — a superset of ants truly within
// SEPARATION_RADIUS. Caller still does its own precise distance check.
export function forEachNearby(ants, i, callback) {
  const cx = Math.floor(ants.x[i] / CELL_SIZE);
  const cy = Math.floor(ants.y[i] / CELL_SIZE);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const bucket = cellMap.get((cx + dx) + ',' + (cy + dy));
      if (!bucket) continue;
      for (const j of bucket) {
        if (j !== i) callback(j);
      }
    }
  }
}
