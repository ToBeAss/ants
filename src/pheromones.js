// ============================================================
// Pheromones — a coarse grid of decaying trail concentration.
// RETURN-state ants (carrying food) deposit as they walk; every cell
// decays continuously in real time. This first version only handles
// deposit + decay + reading — no ant behavior reacts to it yet.
// Trail-following is a separate, later step.
//
// NOTE: does not currently resize with the window, same accepted
// limitation as nest/food placement in world.js.
// ============================================================
import {
  PHEROMONE_CELL_SIZE, PHEROMONE_DEPOSIT_RATE, PHEROMONE_MAX, PHEROMONE_DECAY_RATE, PHEROMONE_DIFFUSE_RATE,
  TRAIL_SENSOR_DISTANCE, TRAIL_SENSOR_ANGLE, TRAIL_STEER_RATE, TRAIL_FOLLOW_THRESHOLD, LOST_TRAIL_STEER_RATE,
} from './config.js';

let cols = 0;
let rows = 0;
let grid = new Float32Array(0);
let gridBack = new Float32Array(0); // second buffer for diffusePheromones — see below

export function initPheromones(width, height) {
  cols = Math.ceil(width / PHEROMONE_CELL_SIZE);
  rows = Math.ceil(height / PHEROMONE_CELL_SIZE);
  grid = new Float32Array(cols * rows);
  gridBack = new Float32Array(cols * rows);
}

function cellIndex(x, y) {
  const cx = Math.min(cols - 1, Math.max(0, Math.floor(x / PHEROMONE_CELL_SIZE)));
  const cy = Math.min(rows - 1, Math.max(0, Math.floor(y / PHEROMONE_CELL_SIZE)));
  return cy * cols + cx;
}

// Called once per tick per RETURN-state ant (see sim.js). Adds to the
// single cell the ant currently occupies — no spreading to neighbors
// yet, so trails currently read as slightly blocky rather than smooth
// until diffusion (mentioned in the original project brief) is added.
export function depositPheromone(x, y, dt) {
  const idx = cellIndex(x, y);
  grid[idx] = Math.min(PHEROMONE_MAX, grid[idx] + PHEROMONE_DEPOSIT_RATE * dt);
}

// Called once per simStep (not per ant) — a single pass over the whole
// grid. Proper exponential decay, dt-independent regardless of tick
// rate, same care taken elsewhere in this codebase (wander noise, etc.)
export function decayPheromones(dt) {
  const decay = Math.exp(-PHEROMONE_DECAY_RATE * dt);
  for (let i = 0; i < grid.length; i++) {
    grid[i] *= decay;
  }
}

// Called once per simStep, right after decayPheromones. Spreads each
// cell's value toward its 4-neighbor average — a separate concern from
// decay (which shrinks magnitude; this spreads shape). Needs a second
// buffer: writing diffused values back into the same array mid-pass
// would let already-updated cells leak into their not-yet-updated
// neighbors' reads, corrupting the result. gridBack is reused every
// call (allocated once in initPheromones), not reallocated per tick —
// grid/gridBack just swap which is "current" vs "scratch."
export function diffusePheromones(dt) {
  const rate = Math.min(1, PHEROMONE_DIFFUSE_RATE * dt);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const idx = y * cols + x;
      let sum = 0;
      let count = 0;
      if (x > 0) { sum += grid[idx - 1]; count++; }
      if (x < cols - 1) { sum += grid[idx + 1]; count++; }
      if (y > 0) { sum += grid[idx - cols]; count++; }
      if (y < rows - 1) { sum += grid[idx + cols]; count++; }
      const neighborAvg = count > 0 ? sum / count : grid[idx];
      gridBack[idx] = grid[idx] * (1 - rate) + neighborAvg * rate;
    }
  }

  const swap = grid;
  grid = gridBack;
  gridBack = swap;
}

export function samplePheromone(x, y) {
  if (cols === 0 || rows === 0) return 0;
  return grid[cellIndex(x, y)];
}

export function getPheromoneGrid() {
  return { grid, cols, rows, cellSize: PHEROMONE_CELL_SIZE };
}

// Called during WANDER (and RETURN — see sim.js) only. Samples 3 points
// projected ahead of the ant — forward, forward-left, forward-right —
// and gently steers toward whichever direction reads strongest. Does
// nothing if all three are below TRAIL_FOLLOW_THRESHOLD (nothing
// meaningful nearby). This is an additive bias on top of wander()'s own
// noise, not a replacement for it — same layering pattern as edgeAvoid.
//
// `eager` uses a meaningfully stronger steer rate — for a carrying ant
// that gave up on its own belief and fell back to WANDER (foraging.js),
// actively hunting for any trail home rather than just casually
// noticing one while it happens to be searching for food.
export function followTrail(ants, i, dt, eager = false) {
  const heading = ants.rotation[i];
  const x = ants.x[i];
  const y = ants.y[i];

  const leftAngle = heading - TRAIL_SENSOR_ANGLE;
  const rightAngle = heading + TRAIL_SENSOR_ANGLE;

  const center = samplePheromone(
    x + Math.cos(heading) * TRAIL_SENSOR_DISTANCE,
    y + Math.sin(heading) * TRAIL_SENSOR_DISTANCE
  );
  const left = samplePheromone(
    x + Math.cos(leftAngle) * TRAIL_SENSOR_DISTANCE,
    y + Math.sin(leftAngle) * TRAIL_SENSOR_DISTANCE
  );
  const right = samplePheromone(
    x + Math.cos(rightAngle) * TRAIL_SENSOR_DISTANCE,
    y + Math.sin(rightAngle) * TRAIL_SENSOR_DISTANCE
  );

  const strongest = Math.max(center, left, right);
  if (strongest < TRAIL_FOLLOW_THRESHOLD) return; // nothing worth reacting to

  let targetAngle = heading; // default: center strongest (or tied) — keep going straight
  if (left > center && left >= right) targetAngle = leftAngle;
  else if (right > center && right > left) targetAngle = rightAngle;

  let diff = targetAngle - heading;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  ants.rotation[i] += diff * (eager ? LOST_TRAIL_STEER_RATE : TRAIL_STEER_RATE) * dt;
}