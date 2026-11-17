// Neon Tides — canvas 2D minimap, north-up: ocean and beach to the east,
// the road grid, building blocks, the player arrow, the mission marker,
// police blips (red/blue) and traffic dots. Drawn every other frame.

import { BLOCK_PITCH, GRID_MIN, GRID_MAX, CITY_EDGE, roadCoord } from './config.js';

const MAP_WORLD = 480; // world metres spanned by the map
const MAP_CENTRE = 10;

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.frame = 0;
  }

  worldToMap(x, z) {
    const s = this.canvas.width / MAP_WORLD;
    return [
      this.canvas.width / 2 + (x - MAP_CENTRE) * s,
      this.canvas.height / 2 + (z - MAP_CENTRE) * s,
    ];
  }

  draw(game) {
    this.frame += 1;
    if (this.frame % 2 === 1) return;
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#39404e';
    ctx.fillRect(0, 0, w, h);
    // Ocean + beach.
    const [ox] = this.worldToMap(CITY_EDGE, 0);
    ctx.fillStyle = '#d9b380';
    ctx.fillRect(ox, 0, w - ox, h);
    const [wx] = this.worldToMap(CITY_EDGE + 26, 0);
    ctx.fillStyle = '#0e5f7a';
    ctx.fillRect(wx, 0, w - wx, h);
    // Blocks.
    ctx.fillStyle = '#2c313c';
    for (let bx = GRID_MIN; bx < GRID_MAX; bx += 1) {
      for (let bz = GRID_MIN; bz < GRID_MAX; bz += 1) {
        const [x1, y1] = this.worldToMap(roadCoord(bx) + 9, roadCoord(bz) + 9);
        const [x2, y2] = this.worldToMap(roadCoord(bx) + BLOCK_PITCH - 9, roadCoord(bz) + BLOCK_PITCH - 9);
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      }
    }
    // Roads.
    ctx.strokeStyle = '#59606e';
    ctx.lineWidth = 3;
    for (let i = GRID_MIN; i <= GRID_MAX; i += 1) {
      const [rx] = this.worldToMap(roadCoord(i), 0);
      ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx, h); ctx.stroke();
      const [, ry] = this.worldToMap(0, roadCoord(i));
      ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(w, ry); ctx.stroke();
    }
    const dot = (x, z, color, r) => {
      const [mx, my] = this.worldToMap(x, z);
      if (mx < -4 || my < -4 || mx > w + 4 || my > h + 4) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const car of game.traffic.cars) dot(car.x, car.z, '#aab4c4', 2);
    for (const car of game.police.cars) dot(car.x, car.z, (this.frame >> 2) % 2 ? '#ff4455' : '#4488ff', 3);
    for (const o of game.police.officers) dot(o.x, o.z, '#ff8899', 2);
    // Mission marker.
    const step = game.missions.step;
    if (step) {
      const [mx, my] = this.worldToMap(step.at.x, step.at.z);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(mx, my, 5 + Math.sin(this.frame * 0.2) * 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#14100a';
      ctx.font = 'bold 8px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('!', mx, my + 3);
    }
    // Player arrow.
    const p = game.playerPos();
    const [px, py] = this.worldToMap(p.x, p.z);
    const heading = game.playerHeading();
    ctx.save();
    ctx.translate(px, py);
    // The arrow is drawn pointing up (north, -z). Forward is (-sin h, -cos h)
    // on screen (x right, z down), which is exactly a rotation by -heading.
    ctx.rotate(-heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#11131a';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.4, 5);
    ctx.lineTo(0, 2.6);
    ctx.lineTo(-4.4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // North label + border.
    ctx.fillStyle = '#e8ecf4';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'right';
    ctx.fillText('N', w - 6, 13);
  }
}
