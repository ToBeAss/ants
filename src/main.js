// ============================================================
// Main — wires everything together and starts the loop.
// This is the only file that should be an ES module entry point
// (loaded from index.html via <script type="module" src="src/main.js">).
// ============================================================
import { SIM_DT, INITIAL_ANT_COUNT } from './config.js';
import { spawnAnt } from './ants.js';
import { simStep, getSimSpeed, cycleSimSpeed } from './sim.js';
import { resizeCanvas, render, canvas, toggleTrailVisibility, toggleView, getCurrentView } from './render.js';
import { initWorld, nest, spawnFoodAt, addObstacle } from './world.js';
import { initPheromones } from './pheromones.js';
import { initUnderground } from './underground.js';
import { initNestPlan } from './nestPlan.js';
import { initQueen } from './queen.js';
import { initSpoil } from './spoil.js';
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
// initUnderground() reads nest.x (see underground.js's "entrance
// linkage"). nest itself doesn't reposition on resize (same accepted
// limitation as world.js), so re-reading it here is just re-deriving
// the entrance from whatever nest.x already is, not moving it.
// initNestPlan() must follow initUnderground() in both places — it lays
// in the founding nest (a short shaft down from the entrance with one
// small chamber at its bottom, see nestPlan.js), so it both reads the
// entrance initUnderground() just derived and carves into the grid it
// just allocated. On resize the dug grid resets, so the plan (shaft,
// chambers dug, project in progress) has to reset with it or it would
// describe tunnels that no longer exist.
// initQueen() must follow initNestPlan() in both places for the same
// reason: it seats the queen in the deepest chamber, which has to exist
// before she can be put in it, and it clears the brood — eggs are
// positions inside chambers, so a rebuilt nest can't keep the old ones.
window.addEventListener('resize', () => {
  resizeCanvas();
  initPheromones(window.innerWidth, window.innerHeight);
  initUnderground(window.innerWidth, window.innerHeight);
  initNestPlan();
  initQueen();
  initSpoil(window.innerWidth, window.innerHeight);
});
resizeCanvas();
initWorld(window.innerWidth, window.innerHeight);
initPheromones(window.innerWidth, window.innerHeight);
initUnderground(window.innerWidth, window.innerHeight);
initNestPlan();
initQueen();
// initSpoil() needs the viewport because the nest sits in a corner: half the
// crater's directions point off-world and have to be excluded when choosing
// where to dump. Reset alongside the dug grid on resize — a mound whose
// bounds no longer match the window would let haulers walk off-screen.
initSpoil(window.innerWidth, window.innerHeight);

// Food only ever appears via click — no auto-spawn, no auto-respawn.
// Shift+Click places an obstacle instead. getBoundingClientRect()
// converts the click's viewport coordinates into canvas-local
// coordinates; currently equivalent to world coordinates since there's
// no camera/pan/zoom yet (see earlier discussion — that's a
// deliberately deferred feature). Once a camera exists, this is the
// exact spot that'll need updating to project through it.
canvas.addEventListener('click', (e) => {
  if (getCurrentView() !== 'surface') return; // no click interaction defined for the underground view yet
                                               // (the future container-expansion action is the first
                                               // candidate — see ROADMAP.md Phase B)
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
// 'V' toggles between the surface and underground views (ROADMAP.md
// Phase B) — also purely a rendering switch; the simulation underneath
// keeps running in both views regardless of which one is on screen.
// 'F' cycles the fast-forward speed (1x -> 2x -> ... -> 1x). Unlike the
// two above this is NOT purely visual — it really does run the colony
// faster — but it changes nothing about how the colony behaves: the sim is
// fixed-timestep, so this only alters how many identical SIM_DT steps get
// run per frame (see config.js's SIM_SPEEDS).
window.addEventListener('keydown', (e) => {
  if (e.key === 't' || e.key === 'T') {
    toggleTrailVisibility();
  } else if (e.key === 'v' || e.key === 'V') {
    toggleView();
  } else if (e.key === 'f' || e.key === 'F') {
    cycleSimSpeed();
  }
});

// ============================================================
// Fixed timestep loop — sim runs at fixed rate, render runs at display rate
// ============================================================
let accumulator = 0;
let lastTime = performance.now();

function frame(now) {
  // Clamp FIRST, scale second. The clamp is there to stop a tab-switch
  // stall dumping a minute of real time into the accumulator; applying the
  // speed multiplier before it would let 16x turn that same stall into 16
  // simulated minutes in one frame.
  //
  // The clamp is also what makes fast-forward safe on a machine that can't
  // keep up: at most 0.25 * speed simulated seconds are ever queued per
  // frame, so the loop falls behind real time gracefully instead of the
  // accumulator running away.
  const frameTime = Math.min((now - lastTime) / 1000, 0.25) * getSimSpeed();
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