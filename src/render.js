// ============================================================
// Render — canvas setup (HiDPI-aware) and per-frame drawing.
// Reads ant state; never mutates it.
// ============================================================
import { ants } from './ants.js';
import { nest, food, obstacles } from './world.js';
import { getPheromoneGrid } from './pheromones.js';
import { getSpoil } from './spoil.js';
import { drawUnderground } from './undergroundRender.js';
import { drawAnt, drawCarryIndicator, SPRITE_ANGLE_OFFSET } from './antSprite.js';
import {
  SHADOW_COLOR, SHADOW_LENGTH, SHADOW_WIDTH, SHADOW_OFFSET_Y,
  NEST_DRAW_RADIUS, FOOD_DRAW_RADIUS,
  PHEROMONE_COLOR, PHEROMONE_MAX,
  DOMAIN_SURFACE,
  GROUND_COLOR, NEST_COLOR, FOOD_COLOR, OBSTACLE_COLOR, CARRY_MARKER_COLOR,
  SOIL_MARKER_COLOR, SPOIL_COLOR,
} from './config.js';

export const canvas = document.getElementById('canvas');
export const ctx = canvas.getContext('2d');

export function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels, not device pixels
}

function drawAntShadow(x, y, angle) {
  // Flat filled ellipse, no blur — cheap by design (see config.js). Offset
  // stays in fixed world-space Y (constant light direction); the ellipse
  // itself rotates + elongates with heading, same convention as the sprite
  // draw (local Y after rotation = the body's long/nose-tail axis).
  ctx.save();
  ctx.translate(x, y + SHADOW_OFFSET_Y);
  ctx.rotate(angle + SPRITE_ANGLE_OFFSET);
  ctx.beginPath();
  ctx.ellipse(0, 0, SHADOW_WIDTH, SHADOW_LENGTH, 0, 0, Math.PI * 2);
  ctx.fillStyle = SHADOW_COLOR;
  ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------
// Pheromone overlay — the grid is coarse (PHEROMONE_CELL_SIZE px per
// cell), so it's rendered to a small offscreen canvas at grid
// resolution and blitted as ONE scaled drawImage call per frame — not
// per-cell rect fills, which would be far too many draw calls at
// realistic grid sizes (same category of perf concern as the sprite
// rotation cost discussed earlier). The backing ImageData buffer is
// created once and reused (its .data rewritten each frame), not
// reallocated every frame.
// ------------------------------------------------------------
const pheromoneCanvas = document.createElement('canvas');
const pheromoneCtx = pheromoneCanvas.getContext('2d');
let pheromoneImageData = null;
let showTrail = true; // toggled via the 'T' key, see main.js

export function toggleTrailVisibility() {
  showTrail = !showTrail;
}

function drawPheromones() {
  if (!showTrail) return; // toggled off — skip the per-cell loop too, not just the draw

  const { grid, cols, rows } = getPheromoneGrid();
  if (cols === 0 || rows === 0) return;

  if (!pheromoneImageData || pheromoneImageData.width !== cols || pheromoneImageData.height !== rows) {
    pheromoneCanvas.width = cols;
    pheromoneCanvas.height = rows;
    pheromoneImageData = pheromoneCtx.createImageData(cols, rows);
  }

  const data = pheromoneImageData.data;
  const [r, g, b] = PHEROMONE_COLOR;
  for (let i = 0; i < grid.length; i++) {
    const alpha = Math.min(1, grid[i] / PHEROMONE_MAX);
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = alpha * 180; // capped opacity — never fully obscures ants/ground beneath it
  }

  pheromoneCtx.putImageData(pheromoneImageData, 0, 0);
  ctx.drawImage(pheromoneCanvas, 0, 0, cols, rows, 0, 0, window.innerWidth, window.innerHeight);
}

// The crater of excavated earth around the entrance (spoil.js). Drawn
// BEFORE the nest marker so the marker stays the hole in the middle, and
// as annular wedges per angular bin — the rim creeps outward in whichever
// directions the colony has been dumping.
function drawSpoilMound() {
  const { bins, binCount, binArc, innerRadius, bandWidth, fullHeight, cx, cy } = getSpoil();
  ctx.fillStyle = SPOIL_COLOR;
  for (let b = 0; b < binCount; b++) {
    if (bins[b] <= 0) continue;
    const outer = innerRadius + Math.min(1, bins[b] / fullHeight) * bandWidth;
    const a0 = b * binArc;
    const a1 = a0 + binArc;
    ctx.beginPath();
    ctx.arc(cx, cy, outer, a0, a1);
    ctx.arc(cx, cy, innerRadius, a1, a0, true);
    ctx.closePath();
    ctx.fill();
  }
}

function drawWorld() {
  drawSpoilMound();

  // nest — simple dirt-mound marker
  ctx.beginPath();
  ctx.arc(nest.x, nest.y, NEST_DRAW_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = NEST_COLOR;
  ctx.fill();

  // food sources
  ctx.fillStyle = FOOD_COLOR;
  for (const f of food) {
    ctx.beginPath();
    ctx.arc(f.x, f.y, FOOD_DRAW_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  // obstacles — stone circles, distinct from the brown nest and green
  // food markers
  ctx.fillStyle = OBSTACLE_COLOR;
  for (const obs of obstacles) {
    ctx.beginPath();
    ctx.arc(obs.x, obs.y, obs.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// View toggle — 'V' switches between the surface and underground draw
// paths (same pattern as showTrail's 'T' toggle above, different key
// since T is taken). See ROADMAP.md Phase B: single canvas, one view
// rendered at a time, no simultaneous dual-rendering. Surface stays
// the default/starting view since that's still where all current
// gameplay (foraging) actually happens.
let currentView = 'surface'; // 'surface' | 'underground'

export function toggleView() {
  currentView = currentView === 'surface' ? 'underground' : 'surface';
}

export function getCurrentView() {
  return currentView;
}

function drawSurface() {
  // Ground is painted here rather than left to the page's CSS
  // background: both views then own their own ground colour from the
  // same palette (see config.js), instead of the surface's living in
  // index.html while the underground's lives in a draw call.
  ctx.fillStyle = GROUND_COLOR;
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

  drawPheromones();
  drawWorld();

  for (let i = 0; i < ants.count; i++) {
    if (ants.domain[i] !== DOMAIN_SURFACE) continue; // underground-dwelling ants belong to the other draw path
    // drawAntShadow(ants.x[i], ants.y[i], ants.rotation[i]); // disabled for now — see config.js for tuning notes if re-enabling
    drawAnt(ctx, ants.x[i], ants.y[i], ants.rotation[i], ants.animPhase[i]);
    if (ants.carrying[i]) {
      drawCarryIndicator(ctx, ants.x[i], ants.y[i], CARRY_MARKER_COLOR);
    } else if (ants.carryingSoil[i]) {
      // A digger that hauled a pellet up and is walking it out to the mound.
      drawCarryIndicator(ctx, ants.x[i], ants.y[i], SOIL_MARKER_COLOR);
    }
  }
}

export function render() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  ctx.clearRect(0, 0, w, h);

  if (currentView === 'underground') {
    drawUnderground(ctx);
  } else {
    drawSurface();
  }
}