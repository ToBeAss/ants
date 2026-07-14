// ============================================================
// Main — wires everything together and starts the loop.
// This is the only file that should be an ES module entry point
// (loaded from index.html via <script type="module" src="src/main.js">).
// ============================================================
import { SIM_DT, INITIAL_ANT_COUNT } from './config.js';
import { spawnAnt } from './ants.js';
import { simStep } from './sim.js';
import { resizeCanvas, render } from './render.js';

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

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
    window.innerWidth / 2 + (Math.random() - 0.5) * 100,
    window.innerHeight / 2 + (Math.random() - 0.5) * 100
  );
}

requestAnimationFrame(frame);
