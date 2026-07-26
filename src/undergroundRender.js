// ============================================================
// Underground render — draws the side-view tunnel cross-section
// (ROADMAP.md Phase B). Reads underground.js's grid/entrance state
// and ants.js's domain flag; never mutates either. Sibling to
// render.js's surface draw path, kept in its own file per the
// project's "new concerns get new files" convention — also keeps the
// two draw paths cleanly separable for the eventual dual-screen setup
// (see ROADMAP.md).
// ============================================================
import { ants } from './ants.js';
import { getUndergroundGrid, DIRT } from './underground.js';
import { DOMAIN_UNDERGROUND } from './config.js';

const DIRT_COLOR = '#7a5230';
const TUNNEL_COLOR = '#241812';   // dark negative space — reads as "dug out," distinct from open ground
const UNLOCKED_BOUNDARY_COLOR = 'rgba(255, 255, 255, 0.35)';
const ENTRANCE_COLOR = '#c9a24b';
const PLACEHOLDER_ANT_COLOR = '#e8d8b8'; // no real underground ants yet — see module-level loop below

export function drawUnderground(ctx) {
  const { grid, cols, rows, cellSize, entrance, unlockedCenter, unlockedRadius } = getUndergroundGrid();
  if (cols === 0 || rows === 0) return;

  // Dirt fills the whole background in one rect; only tunnel cells get
  // drawn on top as "removed" — dirt is the common case almost
  // everywhere early on, so this is far fewer draw calls than filling
  // every dirt cell individually.
  ctx.fillStyle = DIRT_COLOR;
  ctx.fillRect(0, 0, cols * cellSize, rows * cellSize);

  ctx.fillStyle = TUNNEL_COLOR;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (grid[row * cols + col] === DIRT) continue;
      ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
    }
  }

  // Unlocked-region boundary — visualizes the current "container size"
  // (see ROADMAP.md's containment framing). Purely informational, same
  // spirit as the pheromone overlay: doesn't affect the simulation.
  ctx.beginPath();
  ctx.arc(unlockedCenter.x, unlockedCenter.y, unlockedRadius, 0, Math.PI * 2);
  ctx.strokeStyle = UNLOCKED_BOUNDARY_COLOR;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Entrance marker — the single point linking the two views.
  ctx.beginPath();
  ctx.arc(entrance.x, entrance.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = ENTRANCE_COLOR;
  ctx.fill();

  // Underground-dwelling ants — none currently exist (nothing sends an
  // ant underground yet; see underground.js's entrance linkage), so
  // this loop never draws anything today. Left in place, correct, for
  // when the digging task starts assigning ants here. Simple dot
  // placeholder rather than the sprite — no real underground ant to
  // visually verify against yet, and reusing render.js's sprite/anim
  // state here would couple the two draw paths together.
  for (let i = 0; i < ants.count; i++) {
    if (ants.domain[i] !== DOMAIN_UNDERGROUND) continue;
    ctx.beginPath();
    ctx.arc(ants.x[i], ants.y[i], 2.5, 0, Math.PI * 2);
    ctx.fillStyle = PLACEHOLDER_ANT_COLOR;
    ctx.fill();
  }
}
