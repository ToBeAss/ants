// ============================================================
// Render — canvas setup (HiDPI-aware) and per-frame drawing.
// Reads ant state; never mutates it.
// ============================================================
import { ants } from './ants.js';
import { ANT_LENGTH, ANT_WIDTH } from './config.js';

export const canvas = document.getElementById('canvas');
export const ctx = canvas.getContext('2d');

export function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels, not device pixels
}

export function render() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = '#e8d8b8';
  for (let i = 0; i < ants.count; i++) {
    const x = ants.x[i];
    const y = ants.y[i];
    const a = ants.rotation[i];
    const cos = Math.cos(a);
    const sin = Math.sin(a);

    // triangle: nose forward, two back corners
    const noseX = x + cos * ANT_LENGTH;
    const noseY = y + sin * ANT_LENGTH;
    const backX = x - cos * ANT_LENGTH * 0.6;
    const backY = y - sin * ANT_LENGTH * 0.6;
    const perpX = -sin * ANT_WIDTH;
    const perpY = cos * ANT_WIDTH;

    ctx.beginPath();
    ctx.moveTo(noseX, noseY);
    ctx.lineTo(backX + perpX, backY + perpY);
    ctx.lineTo(backX - perpX, backY - perpY);
    ctx.closePath();
    ctx.fill();
  }
}
