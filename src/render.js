// ============================================================
// Render — canvas setup (HiDPI-aware) and per-frame drawing.
// Reads ant state; never mutates it.
// ============================================================
import { ants } from './ants.js';
import { nest, food } from './world.js';
import { getPheromoneGrid } from './pheromones.js';
import {
  ANT_LENGTH, WALK_FRAME_COUNT,
  SHADOW_COLOR, SHADOW_LENGTH, SHADOW_WIDTH, SHADOW_OFFSET_Y,
  NEST_DRAW_RADIUS, FOOD_DRAW_RADIUS,
  PHEROMONE_COLOR, PHEROMONE_MAX,
} from './config.js';

export const canvas = document.getElementById('canvas');
export const ctx = canvas.getContext('2d');

// ------------------------------------------------------------
// Sprite frames — the walk cycle (6 frames). Used for both wandering
// AND idle: while idle, sim.js stops advancing animPhase, so the ant
// simply holds on whatever frame it was mid-stride on — a natural
// freeze rather than a separate rest pose.
//
// Faces "up" (-Y). rotation=0 in this sim means facing "right" (+X),
// matching the Math.cos/sin convention used in integrate()/wander().
// SPRITE_ANGLE_OFFSET corrects for that — adjust if a different-
// orientation sprite is swapped in later.
// ------------------------------------------------------------
const SPRITE_ANGLE_OFFSET = Math.PI / 2;

const walkFrames = [];
let framesLoaded = 0;
let spriteReady = false;

for (let i = 0; i < WALK_FRAME_COUNT; i++) {
  const img = new Image();
  img.onload = () => {
    framesLoaded++;
    if (framesLoaded === WALK_FRAME_COUNT) spriteReady = true;
  };
  img.src = `assets/ant_${i}.png`;
  walkFrames.push(img);
}

// Draw size in world px, independent of the source PNGs' resolution.
// ANT_LENGTH is the nose-to-center distance used elsewhere (hard clamp,
// etc.) — drawn nose-to-tail length is roughly double that.
const SPRITE_DRAW_HEIGHT = ANT_LENGTH * 2.4;
let spriteDrawWidth = SPRITE_DRAW_HEIGHT * 0.81; // fallback aspect until frame 0 loads
walkFrames[0].addEventListener('load', () => {
  spriteDrawWidth = SPRITE_DRAW_HEIGHT * (walkFrames[0].naturalWidth / walkFrames[0].naturalHeight);
});

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

function drawAntFallback(x, y, angle) {
  // Triangle placeholder — used only until frames have loaded, so
  // there's never a blank frame on page load.
  const ANT_WIDTH = 2.5;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const noseX = x + cos * ANT_LENGTH;
  const noseY = y + sin * ANT_LENGTH;
  const backX = x - cos * ANT_LENGTH * 0.6;
  const backY = y - sin * ANT_LENGTH * 0.6;
  const perpX = -sin * ANT_WIDTH;
  const perpY = cos * ANT_WIDTH;

  ctx.fillStyle = '#e8d8b8';
  ctx.beginPath();
  ctx.moveTo(noseX, noseY);
  ctx.lineTo(backX + perpX, backY + perpY);
  ctx.lineTo(backX - perpX, backY - perpY);
  ctx.closePath();
  ctx.fill();
}

function drawAntSprite(x, y, angle, animPhase) {
  const frame = walkFrames[Math.floor(animPhase) % WALK_FRAME_COUNT];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + SPRITE_ANGLE_OFFSET);
  ctx.drawImage(
    frame,
    -spriteDrawWidth / 2, -SPRITE_DRAW_HEIGHT / 2,
    spriteDrawWidth, SPRITE_DRAW_HEIGHT
  );
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

function drawPheromones() {
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

function drawWorld() {
  // nest — simple dirt-mound marker
  ctx.beginPath();
  ctx.arc(nest.x, nest.y, NEST_DRAW_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#5c4326';
  ctx.fill();

  // food sources
  ctx.fillStyle = '#8fd14f';
  for (const f of food) {
    ctx.beginPath();
    ctx.arc(f.x, f.y, FOOD_DRAW_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCarryIndicator(x, y) {
  // small morsel marker on top of an ant currently returning with food
  ctx.beginPath();
  ctx.arc(x, y, 2, 0, Math.PI * 2);
  ctx.fillStyle = '#8fd14f';
  ctx.fill();
}

export function render() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  ctx.clearRect(0, 0, w, h);

  drawPheromones();
  drawWorld();

  for (let i = 0; i < ants.count; i++) {
    // drawAntShadow(ants.x[i], ants.y[i], ants.rotation[i]); // disabled for now — see config.js for tuning notes if re-enabling
    if (spriteReady) {
      drawAntSprite(ants.x[i], ants.y[i], ants.rotation[i], ants.animPhase[i]);
    } else {
      drawAntFallback(ants.x[i], ants.y[i], ants.rotation[i]);
    }
    if (ants.carrying[i]) {
      drawCarryIndicator(ants.x[i], ants.y[i]);
    }
  }
}