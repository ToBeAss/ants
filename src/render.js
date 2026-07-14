// ============================================================
// Render — canvas setup (HiDPI-aware) and per-frame drawing.
// Reads ant state; never mutates it.
// ============================================================
import { ants } from './ants.js';
import { ANT_LENGTH, WALK_FRAME_COUNT } from './config.js';

export const canvas = document.getElementById('canvas');
export const ctx = canvas.getContext('2d');

// ------------------------------------------------------------
// Sprite frames — a short walk-cycle extracted from the source sheet
// (assets/walk/ant_0.png .. ant_5.png). All frames share one crop box,
// so the pivot point doesn't drift frame to frame.
//
// The frames face "up" (-Y). rotation=0 in this sim means facing
// "right" (+X), matching the Math.cos/sin convention used in
// integrate()/wander(). SPRITE_ANGLE_OFFSET corrects for that
// mismatch — adjust or remove this if different-orientation frames
// are swapped in later.
// ------------------------------------------------------------
const SPRITE_ANGLE_OFFSET = Math.PI / 2;

const antFrames = [];
let framesLoaded = 0;
let spriteReady = false;

for (let i = 0; i < WALK_FRAME_COUNT; i++) {
  const img = new Image();
  img.onload = () => {
    framesLoaded++;
    if (framesLoaded === WALK_FRAME_COUNT) spriteReady = true;
  };
  img.src = `assets/walk/ant_${i}.png`;
  antFrames.push(img);
}

// Draw size in world px, independent of the source PNGs' resolution.
// ANT_LENGTH is the nose-to-center distance used elsewhere (hard clamp,
// etc.) — drawn nose-to-tail length is roughly double that.
const SPRITE_DRAW_HEIGHT = ANT_LENGTH * 2.4;
let spriteDrawWidth = SPRITE_DRAW_HEIGHT * 0.81; // fallback aspect until frame 0 loads
antFrames[0].addEventListener('load', () => {
  spriteDrawWidth = SPRITE_DRAW_HEIGHT * (antFrames[0].naturalWidth / antFrames[0].naturalHeight);
});

// Frames loop forward: 0,1,2,3,4,5,0,1,2,... The closing seam (5->0) is
// roughly the same magnitude as every other inter-frame step at this
// sampling coarseness, so it doesn't read as a pop — and unlike ping-pong,
// legs always advance in one direction rather than visibly reversing stride.

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
  const frame = antFrames[Math.floor(animPhase) % WALK_FRAME_COUNT];
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

export function render() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  ctx.clearRect(0, 0, w, h);

  for (let i = 0; i < ants.count; i++) {
    if (spriteReady) {
      drawAntSprite(ants.x[i], ants.y[i], ants.rotation[i], ants.animPhase[i]);
    } else {
      drawAntFallback(ants.x[i], ants.y[i], ants.rotation[i]);
    }
  }
}