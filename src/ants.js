// ============================================================
// Ant data — Structure of Arrays (SoA). Index is NOT stable identity
// (swap-and-pop on kill) — use `id` + idToIndex for anything that
// needs to reference a specific ant persistently (favorites, names).
// ============================================================
import { MAX_ANTS, STATE_IDLE, WALK_FRAME_COUNT } from './config.js';
import { nest } from './world.js';

export const ants = {
  x: new Float32Array(MAX_ANTS),
  y: new Float32Array(MAX_ANTS),
  rotation: new Float32Array(MAX_ANTS),
  speed: new Float32Array(MAX_ANTS),
  rotationSpeed: new Float32Array(MAX_ANTS),
  state: new Uint8Array(MAX_ANTS),
  stateTimer: new Float32Array(MAX_ANTS),
  animPhase: new Float32Array(MAX_ANTS), // walk-cycle clock, in "frame steps"
  carrying: new Uint8Array(MAX_ANTS),    // 1 while returning to nest with food, else 0
  homeVectorX: new Float32Array(MAX_ANTS), // path-integration estimate: (believed) displacement from nest
  homeVectorY: new Float32Array(MAX_ANTS),
  id: new Uint32Array(MAX_ANTS),
  count: 0,
};

let nextId = 1;
export const idToIndex = new Map();

export function spawnAnt(x, y) {
  const i = ants.count++;
  const id = nextId++;
  ants.x[i] = x;
  ants.y[i] = y;
  ants.rotation[i] = Math.random() * 2 * Math.PI;
  ants.speed[i] = 40 + Math.random() * 15;
  ants.rotationSpeed[i] = Math.random() * 2 * Math.PI;
  ants.state[i] = STATE_IDLE;
  ants.stateTimer[i] = 0;
  ants.animPhase[i] = Math.random() * WALK_FRAME_COUNT; // random starting frame — avoids synced marching across ants
  ants.carrying[i] = 0;
  ants.homeVectorX[i] = x - nest.x; // accurate at spawn — drift only accumulates from movement onward
  ants.homeVectorY[i] = y - nest.y;
  ants.id[i] = id;
  idToIndex.set(id, i);
  return id;
}

export function killAnt(index) {
  const last = ants.count - 1;
  const deadId = ants.id[index];
  idToIndex.delete(deadId);

  if (index !== last) {
    // swap last into the gap
    ants.x[index] = ants.x[last];
    ants.y[index] = ants.y[last];
    ants.rotation[index] = ants.rotation[last];
    ants.speed[index] = ants.speed[last];
    ants.rotationSpeed[index] = ants.rotationSpeed[last];
    ants.state[index] = ants.state[last];
    ants.stateTimer[index] = ants.stateTimer[last];
    ants.animPhase[index] = ants.animPhase[last];
    ants.carrying[index] = ants.carrying[last];
    ants.homeVectorX[index] = ants.homeVectorX[last];
    ants.homeVectorY[index] = ants.homeVectorY[last];
    ants.id[index] = ants.id[last];
    idToIndex.set(ants.id[index], index); // update the moved ant's mapping
  }
  ants.count--;
}