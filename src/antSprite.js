// ============================================================
// Ant sprite — the walk-cycle sprite draw, shared by both the surface
// (render.js) and underground (undergroundRender.js) draw paths so an
// ant looks identical in both views rather than one of them using a
// placeholder.
// ============================================================
import { ANT_LENGTH, ANT_WIDTH, WALK_FRAME_COUNT, ANT_FALLBACK_COLOR } from './config.js';

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
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const noseX = x + cos * ANT_LENGTH;
  const noseY = y + sin * ANT_LENGTH;
  const backX = x - cos * ANT_LENGTH * 0.6;
  const backY = y - sin * ANT_LENGTH * 0.6;
  const perpX = -sin * ANT_WIDTH;
  const perpY = cos * ANT_WIDTH;

  ctx.fillStyle = ANT_FALLBACK_COLOR;
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

// Small marker on top of an ant carrying something. Lives here, with the
// sprite, because it's part of how an ant LOOKS and because both views need
// it — putting it in render.js and importing it from undergroundRender.js
// made the two draw paths import each other, which the project
// deliberately keeps separate (see CLAUDE.md's dual-screen note).
//
// Colour is the only difference between a food morsel and a spoil pellet:
// same size, same position, because it's the same gesture — this ant's
// mandibles are full. Both markers are LIGHT, since they sit on a black
// silhouette rather than on the ground.
export function drawCarryIndicator(ctx, x, y, color) {
  ctx.beginPath();
  ctx.arc(x, y, 2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}
