// ============================================================
// Spoil — the excavated earth, and where it ends up.
//
// Until this existed, a carved cell simply became tunnel and the dirt
// ceased to exist. Real excavation is a transport problem as much as a
// digging one: workers roll the spoil into pellets, carry them up and out,
// and drop them at the surface, which is why every ground-nesting colony
// sits in the middle of a crater of its own making.
//
// Owns the surface mound only — one concern, one file (the ant-side haul is
// digging.js's, drawing is render.js's). The mound is modeled as an angular
// histogram of pile height around the entrance rather than a heightfield:
// a crater IS radially symmetric to a first approximation, 24 numbers are
// enough to read as one, and it makes the deposit rule trivial.
//
// The deposit rule comes from the crater-optimization literature: ants
// working on flat ground come close to least-cost waste disposal, and given
// a quarter of their crater removed they concentrate subsequent dumping in
// that quarter — consistent with "drop at the nearest point whose pile is
// below optimal." That's what chooseDumpSite() implements, and it's why the
// crater fills evenly and would refill a gap if one were ever cleared,
// without anything coordinating it.
//
// Purely visual so far: the mound doesn't block movement (real mounds are
// walkable) and nothing reads its height back. It IS persistent, though —
// an accumulating record of how much this particular colony has dug, which
// is the kind of trace the always-on framing is built around.
// ============================================================
import { nest } from './world.js';
import {
  SPOIL_BIN_COUNT, SPOIL_INNER_RADIUS, SPOIL_BAND_WIDTH,
  SPOIL_HEIGHT_PER_PELLET, SPOIL_FULL_HEIGHT, SPOIL_LEVEL_TOLERANCE,
  SPOIL_EDGE_MARGIN,
} from './config.js';

const bins = new Float32Array(SPOIL_BIN_COUNT);
const BIN_ARC = (Math.PI * 2) / SPOIL_BIN_COUNT;

// Bounds are needed because the nest sits in a screen corner (world.js), so
// a good half of the crater's directions point off-world. Those bins are
// skipped when choosing where to dump, which makes the colony pile its
// spoil on the side it actually has room for — the same "nearest point with
// room" logic, just with the wall as part of the terrain.
let worldW = 0;
let worldH = 0;

export function initSpoil(width, height) {
  bins.fill(0);
  worldW = width;
  worldH = height;
}

function binAngle(bin) {
  return (bin + 0.5) * BIN_ARC;
}

// Where a pellet dropped into this bin lands: further out the higher the
// pile already is, so the crater grows outward rather than upward forever.
function binPoint(bin) {
  const a = binAngle(bin);
  const fill = Math.min(1, bins[bin] / SPOIL_FULL_HEIGHT);
  const r = SPOIL_INNER_RADIUS + fill * SPOIL_BAND_WIDTH;
  return { x: nest.x + Math.cos(a) * r, y: nest.y + Math.sin(a) * r };
}

function binUsable(bin) {
  const p = binPoint(bin);
  return (
    p.x >= SPOIL_EDGE_MARGIN && p.x <= worldW - SPOIL_EDGE_MARGIN &&
    p.y >= SPOIL_EDGE_MARGIN && p.y <= worldH - SPOIL_EDGE_MARGIN
  );
}

// "Nearest point whose pile is below optimal" — the lowest bins are found
// first, then the one nearest the ant wins among those within tolerance of
// the lowest. Tolerance is what stops every ant marching to the single
// globally-lowest bin: several are usually tied, so each ant takes the
// closest of them and the crater fills evenly from wherever ants emerge.
export function chooseDumpSite(fromX, fromY) {
  let lowest = Infinity;
  for (let b = 0; b < SPOIL_BIN_COUNT; b++) {
    if (!binUsable(b)) continue;
    if (bins[b] < lowest) lowest = bins[b];
  }
  if (lowest === Infinity) return { x: nest.x, y: nest.y }; // nowhere to put it — drop at the door

  let best = null;
  let bestDistSq = Infinity;
  for (let b = 0; b < SPOIL_BIN_COUNT; b++) {
    if (!binUsable(b)) continue;
    if (bins[b] > lowest + SPOIL_LEVEL_TOLERANCE) continue;
    const p = binPoint(b);
    const dx = p.x - fromX, dy = p.y - fromY;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = p;
    }
  }
  return best ?? { x: nest.x, y: nest.y };
}

// Records a pellet dropped at a world position — binned by its direction
// from the entrance, so a pellet dropped short (a hauler that timed out on
// its way to the rim) still lands on the mound in the right direction
// rather than being discarded.
export function depositSpoil(x, y) {
  const a = Math.atan2(y - nest.y, x - nest.x);
  let t = a % (Math.PI * 2);
  if (t < 0) t += Math.PI * 2;
  const bin = Math.min(SPOIL_BIN_COUNT - 1, Math.floor(t / BIN_ARC));
  bins[bin] += SPOIL_HEIGHT_PER_PELLET;
}

export function getSpoil() {
  return {
    bins,
    binCount: SPOIL_BIN_COUNT,
    binArc: BIN_ARC,
    innerRadius: SPOIL_INNER_RADIUS,
    bandWidth: SPOIL_BAND_WIDTH,
    fullHeight: SPOIL_FULL_HEIGHT,
    cx: nest.x,
    cy: nest.y,
  };
}
