// ============================================================
// Main — wires everything together and starts the loop.
// This is the only file that should be an ES module entry point
// (loaded from index.html via <script type="module" src="src/main.js">).
// ============================================================
import { SIM_DT, INITIAL_ANT_COUNT } from './config.js';
import { spawnAnt } from './ants.js';
import { simStep } from './sim.js';
import { resizeCanvas, render, canvas } from './render.js';
import { initWorld, nest, spawnFoodAt } from './world.js';
import { initPheromones } from './pheromones.js';

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
initWorld(window.innerWidth, window.innerHeight);
initPheromones(window.innerWidth, window.innerHeight);

// Food only ever appears via click — no auto-spawn, no auto-respawn.
// getBoundingClientRect() converts the click's viewport coordinates into
// canvas-local coordinates; currently equivalent to world coordinates
// since there's no camera/pan/zoom yet (see earlier discussion — that's
// a deliberately deferred feature). Once a camera exists, this is the
// exact spot that'll need updating to project through it.
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  spawnFoodAt(e.clientX - rect.left, e.clientY - rect.top);
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