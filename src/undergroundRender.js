// ============================================================
// Underground render — draws the side-view tunnel cross-section
// (ROADMAP.md Phase B). Reads underground.js's grid/entrance state,
// nestPlan.js's chambers/active project, and ants.js's domain flag;
// never mutates any of them. Sibling to render.js's surface draw path,
// kept in its own file per the project's "new concerns get new files"
// convention — also keeps the two draw paths cleanly separable for the
// eventual dual-screen setup (see ROADMAP.md).
// ============================================================
import { ants } from './ants.js';
import { getUndergroundGrid, DIRT } from './underground.js';
import {
  getChambers, getActiveProject, getQueenChamber, purposeOf,
  PURPOSE_ATRIUM, PURPOSE_BROOD, PURPOSE_FOOD,
} from './nestPlan.js';
import { drawAnt, drawCarryIndicator } from './antSprite.js';
import {
  DOMAIN_UNDERGROUND,
  UNDERGROUND_DIRT_COLOR, UNDERGROUND_TUNNEL_COLOR,
  CHAMBER_COLOR_QUEEN, CHAMBER_COLOR_BROOD, CHAMBER_COLOR_FOOD,
  CHAMBER_COLOR_ATRIUM, PLAN_COLOR, SOIL_MARKER_COLOR, FOOD_COLOR, CARRY_MARKER_COLOR,
} from './config.js';

// Parsed once from the palette above, for the carve-progress blend —
// the shading lerps dirt -> tunnel per cell, which needs components,
// not hex strings. Derived rather than duplicated so there's still one
// place to change a colour (see config.js's palette section).
function rgbOf(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
const DIRT_RGB = rgbOf(UNDERGROUND_DIRT_COLOR);
const TUNNEL_RGB = rgbOf(UNDERGROUND_TUNNEL_COLOR);

// Per-purpose chamber annotation: a ring + small label rather than a
// filled colour — the point is to make the nest legible as ROOMS WITH
// JOBS (the thing that separates ant-keeping from watching ants), while
// leaving the excavation itself the visually dominant thing.
const CHAMBER_STYLE = {
  [PURPOSE_ATRIUM]: { color: CHAMBER_COLOR_ATRIUM, label: 'atrium' },
  [PURPOSE_FOOD]: { color: CHAMBER_COLOR_FOOD, label: 'stores' },
  [PURPOSE_BROOD]: { color: CHAMBER_COLOR_BROOD, label: 'brood' },
};
// The queen's chamber is a position, not a purpose — the deepest one (see
// nestPlan.js). Annotating it distinctly is what makes the nest's vertical
// order legible at a glance: foragers unloading in the big rooms at the
// top, stores in the middle, the queen at the bottom of the shaft.
const QUEEN_STYLE = { color: CHAMBER_COLOR_QUEEN, label: 'queen' };
const CHAMBER_RING_INSET = 2; // px — keeps the ring on carved floor rather than straddling the dirt boundary,
                              // where a dark ring would half-vanish into the dark earth

export function drawUnderground(ctx) {
  const { grid, progress, cols, rows, cellSize } = getUndergroundGrid();
  if (cols === 0 || rows === 0) return;

  // Dirt fills the whole background in one rect; only tunnel cells get
  // drawn on top as "removed" — dirt is the common case almost
  // everywhere early on, so this is far fewer draw calls than filling
  // every dirt cell individually.
  ctx.fillStyle = UNDERGROUND_DIRT_COLOR;
  ctx.fillRect(0, 0, cols * cellSize, rows * cellSize);

  ctx.fillStyle = UNDERGROUND_TUNNEL_COLOR;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;
      if (grid[idx] === DIRT) continue;
      ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
    }
  }

  // Cells currently being carved, shaded part-way toward tunnel color.
  // A carve takes DIG_CARVE_MIN..MAX seconds now (see config.js), and
  // without this an ant standing still for ~12s looks broken rather
  // than busy. Separate pass from the loop above so the common case
  // (no fillStyle churn) stays a single style for every tunnel cell —
  // at most DIG_FORCE_MAX cells are ever in progress at once.
  for (let idx = 0; idx < progress.length; idx++) {
    const t = progress[idx];
    if (t <= 0) continue;
    const r = Math.round(DIRT_RGB[0] + (TUNNEL_RGB[0] - DIRT_RGB[0]) * t);
    const g = Math.round(DIRT_RGB[1] + (TUNNEL_RGB[1] - DIRT_RGB[1]) * t);
    const b = Math.round(DIRT_RGB[2] + (TUNNEL_RGB[2] - DIRT_RGB[2]) * t);
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    const col = idx % cols;
    const row = (idx - col) / cols;
    ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
  }

  // Chambers — what each room is FOR. Purely informational, same spirit
  // as the pheromone overlay: doesn't affect the simulation.
  ctx.lineWidth = 1.5;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  const queenChamber = getQueenChamber();
  for (const c of getChambers()) {
    // purposeOf(), not a stored field — a room's job is derived from its
    // depth and changes as the nest deepens under it (see nestPlan.js).
    const style = c === queenChamber ? QUEEN_STYLE : CHAMBER_STYLE[purposeOf(c)];
    if (!style) continue;
    ctx.beginPath();
    ctx.arc(c.x, c.y, Math.max(1, c.radius - CHAMBER_RING_INSET), 0, Math.PI * 2);
    ctx.strokeStyle = style.color;
    ctx.stroke();
    ctx.fillStyle = style.color;
    ctx.fillText(style.label, c.x, c.y + 3);

    // Food actually sitting in the room (provisioning.js). Drawn as a
    // cluster of morsels rather than a number or a bar: the point is to see
    // the larder filling up as foragers bring loads down, in the same visual
    // language as food on the surface.
    if (c.food > 0) {
      ctx.fillStyle = FOOD_COLOR;
      const n = Math.min(c.food, 40);
      for (let k = 0; k < n; k++) {
        // Deterministic scatter from the index, so morsels don't shimmer
        // between frames the way Math.random() in a draw call would.
        const a = k * 2.399963; // golden angle — even fill, no rings
        const rr = (c.radius - 6) * Math.sqrt((k + 0.5) / 40);
        ctx.beginPath();
        ctx.arc(c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // The chamber under construction, dashed — you can see where the
  // colony has decided to expand to before they've got there, which is
  // most of what makes the digging read as deliberate rather than
  // random. Vanishes into a solid ring above once finished.
  const project = getActiveProject();
  if (project) {
    ctx.beginPath();
    ctx.moveTo(project.fromX, project.fromY);
    ctx.lineTo(project.x, project.y);
    ctx.strokeStyle = PLAN_COLOR;
    ctx.setLineDash([3, 5]);
    ctx.stroke();

    // A chamber project also outlines the room to come; a shaft extension
    // is just the dashed line above, heading off into undug earth — which
    // is the right read for it, since the colony is deepening rather than
    // building a room yet (see nestPlan.js).
    const style = CHAMBER_STYLE[project.purpose];
    if (style) {
      ctx.beginPath();
      ctx.arc(project.x, project.y, project.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    if (style) {
      ctx.fillStyle = PLAN_COLOR;
      ctx.fillText(style.label, project.x, project.y + 3);
    }
  }
  ctx.textAlign = 'start';

  // No entrance marker down here. The shaft mouth already reads as the way
  // out — it's the one tunnel that reaches the top edge, and ants visibly
  // walk up through it and off the picture. A dot on top of it only drew
  // attention to a point where nothing happens.

  // Underground-dwelling ants — same drawAnt() as the surface view
  // (antSprite.js), so an ant looks identical whether it's above or
  // below ground, not a placeholder in one of the two views.
  for (let i = 0; i < ants.count; i++) {
    if (ants.domain[i] !== DOMAIN_UNDERGROUND) continue;
    drawAnt(ctx, ants.x[i], ants.y[i], ants.rotation[i], ants.animPhase[i]);
    if (ants.carryingSoil[i]) {
      // Same marker the surface view uses for a food-carrying ant, in earth
      // instead of green — so a digger hauling its pellet up the shaft reads
      // as carrying something in the view where it does most of the walking.
      drawCarryIndicator(ctx, ants.x[i], ants.y[i], SOIL_MARKER_COLOR);
    } else if (ants.carrying[i]) {
      // A forager bringing a load down to a chamber (provisioning.js).
      drawCarryIndicator(ctx, ants.x[i], ants.y[i], CARRY_MARKER_COLOR);
    }
  }
}
