// ============================================================
// Main — wires everything together and starts the loop.
// This is the only file that should be an ES module entry point
// (loaded from index.html via <script type="module" src="src/main.js">).
// ============================================================
import { SIM_DT, INITIAL_ANT_COUNT } from './config.js';
import { spawnAnt } from './ants.js';
import { simStep } from './sim.js';
import { resizeCanvas, render, canvas, toggleTrailVisibility } from './render.js';
import { initWorld, nest, spawnFoodAt, addObstacle } from './world.js';
import { initPheromones } from './pheromones.js';
import { OBSTACLE_RADIUS } from './config.js';

// Pheromone grid dimensions are locked in at initPheromones() and never
// auto-adjust — sim.js recomputes ant movement bounds fresh from
// window.innerWidth/innerHeight every tick, but the grid doesn't, so a
// resize left it stale: cell-to-world mapping went misaligned (ants
// near new edges clamped into the wrong cells) AND the render code
// stretched the old-sized grid image to fit the new canvas dimensions,
// visibly distorting the trail. Reinitializing on resize fixes the
// corruption at the cost of clearing the accumulated trail — same
// "doesn't gracefully adapt to resize" tradeoff already accepted for
// nest/food placement, just applied here too since the alternative
// (visibly wrong data) is worse than a predictable reset.
window.addEventListener('resize', () => {
  resizeCanvas();
  initPheromones(window.innerWidth, window.innerHeight);
});
resizeCanvas();
initWorld(window.innerWidth, window.innerHeight);
initPheromones(window.innerWidth, window.innerHeight);

// Food only ever appears via click — no auto-spawn, no auto-respawn.
// Shift+Click places an obstacle instead. getBoundingClientRect()
// converts the click's viewport coordinates into canvas-local
// coordinates; currently equivalent to world coordinates since there's
// no camera/pan/zoom yet (see earlier discussion — that's a
// deliberately deferred feature). Once a camera exists, this is the
// exact spot that'll need updating to project through it.
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  if (e.shiftKey) {
    // Walls and obstacles are now genuinely one unified avoidance
    // system (see avoidSurfaces in behaviors.js) — a rock can safely be
    // placed right up against or overlapping the border, no separate
    // restriction needed. Only trivial clamp left: keep the obstacle's
    // CENTER on-canvas, so a click right at the very edge can't place
    // it somewhere the click coordinates didn't actually land.
    const clampedX = Math.max(0, Math.min(window.innerWidth, x));
    const clampedY = Math.max(0, Math.min(window.innerHeight, y));
    addObstacle(clampedX, clampedY, OBSTACLE_RADIUS);
  } else {
    spawnFoodAt(x, y);
  }
});

// 'T' toggles the pheromone trail overlay on/off — purely visual, has
// no effect on the actual simulation (ants still deposit/sense/decay
// the trail normally underneath, this just stops drawing it).
window.addEventListener('keydown', (e) => {
  if (e.key === 't' || e.key === 'T') {
    toggleTrailVisibility();
  }
});

// ============================================================
// Fixed timestep loop — sim runs at fixed rate, render runs at display rate
// ============================================================
let accumulator = 0;
let lastTime = performance.now();

function frame(now) {
  const frameTime = Math.min((now - lastTime) / 1000, 0.25); // clamp on tab-switch stalls
  lastTime = now;
  accumulator += frameTime;

  while (accumulator >= SIM_DT) {
    simStep(SIM_DT);
    accumulator -= SIM_DT;
  }

  render();
  requestAnimationFrame(frame);
}

// ============================================================
// Init
// ============================================================
for (let i = 0; i < INITIAL_ANT_COUNT; i++) {
  spawnAnt(
    nest.x + (Math.random() - 0.5) * 100,
    nest.y + (Math.random() - 0.5) * 100
  );
}

requestAnimationFrame(frame);