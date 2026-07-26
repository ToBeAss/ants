// ============================================================
// Ant data — Structure of Arrays (SoA). Index is NOT stable identity
// (swap-and-pop on kill) — use `id` + idToIndex for anything that
// needs to reference a specific ant persistently (favorites, names).
// ============================================================
import { MAX_ANTS, STATE_IDLE, WALK_FRAME_COUNT, DOMAIN_SURFACE } from './config.js';
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
  domain: new Uint8Array(MAX_ANTS),      // DOMAIN_SURFACE or DOMAIN_UNDERGROUND — which view this ant
                                          // currently exists in (see underground.js's entrance linkage)
  digTargetX: new Float32Array(MAX_ANTS), // the cell a STATE_DIG ant has claimed from the nest plan —
  digTargetY: new Float32Array(MAX_ANTS), // remembered across its carve-pause so the cell converts at the END
                                           // of the pause, not on arrival (see digging.js/nestPlan.js)
  digCarveTotal: new Float32Array(MAX_ANTS), // full duration of the current carve — stateTimer counts down from
                                           // it, and the ratio of the two is the progress the renderer shades
  digTravelTimer: new Float32Array(MAX_ANTS), // seconds spent walking toward the claimed cell (or back to the
                                           // entrance) — bounded, since with no pathfinding a target around a
                                           // bend can be unreachable (see DIG_TRAVEL_TIMEOUT)
  digExiting: new Uint8Array(MAX_ANTS),   // 1 once a digger has no work left (or gave up reaching it) and is
                                           // walking back to the entrance to cross up, else 0 (see digging.js)
  carryingSoil: new Uint8Array(MAX_ANTS), // 1 while hauling a spoil pellet out of the nest, else 0. Separate from
                                           // `carrying` (food) rather than sharing it: an ant can't hold both, but
                                           // they're drawn differently, dropped in different places, and mean
                                           // different things to every state check that reads `carrying`
  storeTargetX: new Float32Array(MAX_ANTS), // the chamber a STATE_STORE ant is carrying food to (provisioning.js)
  storeTargetY: new Float32Array(MAX_ANTS),
  storeTravelTimer: new Float32Array(MAX_ANTS), // bounded like digTravelTimer — a chamber around a bend can be
                                           // unreachable by straight-line steering
  storeExiting: new Uint8Array(MAX_ANTS), // 1 once the load is delivered and the ant is walking back out
  spoilTargetX: new Float32Array(MAX_ANTS), // the point on the crater rim a hauler is walking to (spoil.js). Its
  spoilTargetY: new Float32Array(MAX_ANTS), // own field rather than reusing digTargetX/Y, which still holds the
                                           // UNDERGROUND cell just carved — setCellProgress() reads that, so
                                           // aliasing a surface coordinate into it would smear carve shading onto
                                           // an unrelated cell
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
  ants.domain[i] = DOMAIN_SURFACE;
  // Dig fields reset explicitly: a slot freed by killAnt() gets reused,
  // so these can hold a previous occupant's leftovers rather than the
  // zeros a freshly-allocated array would have.
  ants.digTargetX[i] = 0;
  ants.digTargetY[i] = 0;
  ants.digCarveTotal[i] = 0;
  ants.digTravelTimer[i] = 0;
  ants.digExiting[i] = 0;
  ants.carryingSoil[i] = 0;
  ants.spoilTargetX[i] = 0;
  ants.spoilTargetY[i] = 0;
  ants.storeTargetX[i] = 0;
  ants.storeTargetY[i] = 0;
  ants.storeTravelTimer[i] = 0;
  ants.storeExiting[i] = 0;
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
    ants.domain[index] = ants.domain[last];
    ants.digTargetX[index] = ants.digTargetX[last];
    ants.digTargetY[index] = ants.digTargetY[last];
    ants.digCarveTotal[index] = ants.digCarveTotal[last];
    ants.digTravelTimer[index] = ants.digTravelTimer[last];
    ants.digExiting[index] = ants.digExiting[last];
    ants.carryingSoil[index] = ants.carryingSoil[last];
    ants.spoilTargetX[index] = ants.spoilTargetX[last];
    ants.spoilTargetY[index] = ants.spoilTargetY[last];
    ants.storeTargetX[index] = ants.storeTargetX[last];
    ants.storeTargetY[index] = ants.storeTargetY[last];
    ants.storeTravelTimer[index] = ants.storeTravelTimer[last];
    ants.storeExiting[index] = ants.storeExiting[last];
    ants.id[index] = ants.id[last];
    idToIndex.set(ants.id[index], index); // update the moved ant's mapping
  }
  ants.count--;
}