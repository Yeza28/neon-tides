// Neon Tides — Iter2: pay-n-spray garage ("Spray Shop").
// The GTA-staple wanted-evasion system, built on the GARAGE delivery point
// in missions.js. Drive in while wanted with $150+ and the bay resprays the
// car a new colour, wipes the wanted level and sends Rook on his way.
// Rules: only while driving, wanted stars > 0, cash >= 150; 2.5s spray with
// the car hidden behind the roller door; 20s cooldown so it cannot be spammed.

import * as THREE from '../vendor/three/three.module.min.js';
import { CAR_COLORS } from './config.js';
import { GARAGE } from './missions.js';

export const SPRAY_COST = 150;
export const SPRAY_SECONDS = 2.5;
export const SPRAY_COOLDOWN = 20;

export class Garage {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.x = GARAGE.x;
    this.z = GARAGE.z;
    this.spraying = false;
    this.sprayTimer = 0;
    this.cooldown = 0;
    this._sprayCar = null;

    const g = new THREE.Group();
    // Low garage block: back + side walls, open front (facing -z / the road),
    // roller-door lintel above the bay. No collider is registered — the bay
    // must stay drivable, and the mission deliver step uses the same point.
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x3d4356 });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x232633 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(18, 6, 1), wallMat);
    back.position.set(0, 3, 6);
    g.add(back);
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 6, 13), wallMat);
      wall.position.set(side * 8.5, 3, 0);
      g.add(wall);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(18, 1.6, 1), darkMat);
    lintel.position.set(0, 5.4, -6);
    g.add(lintel);
    // Roller door (slides down visually while spraying).
    this.door = new THREE.Mesh(
      new THREE.BoxGeometry(15, 5, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x8a93a8 }),
    );
    this.door.position.set(0, 2.5, -6);
    this.door.visible = false;
    g.add(this.door);
    // Painted ground bay.
    const bay = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 11),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.16 }),
    );
    bay.rotation.x = -Math.PI / 2;
    bay.position.set(0, 0.06, 0);
    g.add(bay);
    const bayEdge = new THREE.Mesh(
      new THREE.RingGeometry(3.4, 4.2, 28),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    bayEdge.rotation.x = -Math.PI / 2;
    bayEdge.position.y = 0.1;
    g.add(bayEdge);
    // "SPRAY SHOP" neon sign over the door.
    const c = document.createElement('canvas');
    c.width = 512; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0b0e18';
    ctx.fillRect(0, 0, 512, 64);
    ctx.font = 'bold 36px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#00e5ff';
    ctx.fillText('SPRAY SHOP', 256, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 2),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    sign.position.set(0, 7.2, -6.2);
    sign.rotation.y = Math.PI; // face the road (-z)
    g.add(sign);
    // Cyan marker beam + ring, same language as mission/fare markers.
    this.marker = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 22, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 11;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.4, 28),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    this.marker.add(beam, ring);
    this.marker.position.set(this.x, 0, this.z);
    scene.add(this.marker);
    g.position.set(this.x, 0, this.z);
    scene.add(g);
    this.group = g;
  }

  distTo(pos) { return Math.hypot(pos.x - this.x, pos.z - this.z); }

  inBay(pos) { return this.distTo(pos) < 7; }

  canUse() {
    const game = this.game;
    return !!game.player.inCar && !this.spraying && this.cooldown <= 0
      && game.police.stars > 0 && game.cash >= SPRAY_COST && this.inBay(game.playerPos());
  }

  /** HUD prompt for the bay, or '' when nothing applies. */
  getPrompt() {
    if (this.spraying) return 'Spraying…';
    if (!this.game.player.inCar || !this.inBay(this.game.playerPos())) return '';
    if (this.game.police.stars <= 0) return 'Pay-n-Spray — no heat to lose';
    if (this.game.cash < SPRAY_COST) return `Pay-n-Spray — need $${SPRAY_COST}`;
    if (this.cooldown > 0) return `Pay-n-Spray — cooling down ${Math.ceil(this.cooldown)}s`;
    return `E — Pay-n-Spray ($${SPRAY_COST})`;
  }

  startSpray() {
    if (!this.canUse()) return false;
    const car = this.game.player.inCar;
    this.spraying = true;
    this.sprayTimer = SPRAY_SECONDS;
    this._sprayCar = car;
    car.speed = 0;
    car.mesh.visible = false; // hidden behind the roller door
    this.door.visible = true;
    this.game.audio.pickup();
    return true;
  }

  _finishSpray() {
    const game = this.game;
    const car = this._sprayCar;
    this.spraying = false;
    this._sprayCar = null;
    this.cooldown = SPRAY_COOLDOWN;
    this.door.visible = false;
    if (car) {
      car.mesh.visible = true;
      // Repaint: the body is the first child mesh of the car group.
      const body = car.mesh.children[0];
      if (body && body.material && body.material.color) {
        const next = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
        body.material.color.setHex(next);
      }
    }
    game.cash -= SPRAY_COST;
    game.hud.setCash(game.cash);
    game.police.clearWanted();
    game.hud.showPhone('Vex: Fresh paint, clean slate. The PVPD lost you — drive like it.', 3600);
    game.audio.success();
  }

  update(dt, playerPos, inCar) {
    this.marker.rotation.y += dt * 0.8;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.spraying) {
      this.sprayTimer -= dt;
      if (this._sprayCar) this._sprayCar.speed = 0;
      if (this.sprayTimer <= 0) this._finishSpray();
    }
    void playerPos;
    void inCar;
  }
}
