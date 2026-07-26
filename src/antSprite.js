// ============================================================
// Ant sprite — the walk-cycle sprite draw, shared by both the surface
// (render.js) and underground (undergroundRender.js) draw paths so an
// ant looks identical in both views rather than one of them using a
// placeholder.
// ============================================================
import { ANT_LENGTH, WALK_FRAME_COUNT } from './config.js';

// Faces "up" (-Y). rotation=0 in this sim means facing "right" (+X),
// matching the Math.cos/sin convention used in integrate()/wander().
// SPRITE_ANGLE_OFFSET corrects for that — adjust if a different-
// orientation sprite is swapped in later.
export const SPRITE_ANGLE_OFFSET = Math.PI / 2;

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

function drawFallback(ctx, x, y, angle) {
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

function drawSprite(ctx, x, y, angle, animPhase) {
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

// Draws one ant at (x, y), heading `angle`, walk-cycle position
// `animPhase` on the given context — sprite once loaded, triangle
// fallback until then. Called identically by both draw paths.
export function drawAnt(ctx, x, y, angle, animPhase) {
  if (spriteReady) {
    drawSprite(ctx, x, y, angle, animPhase);
  } else {
    drawFallback(ctx, x, y, angle);
  }
}
