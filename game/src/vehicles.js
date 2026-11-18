// Neon Tides — original low-poly cars and arcade driving physics.
// A car is a box body + cabin + four cylinder wheels + headlights; variants are
// coupe, hatch, truck, muscle (iter1: wide body + spoiler) and the
// black-and-white Port Vireo police interceptor. A car whose health hits zero
// becomes a wreck (iter1): darkened, stopped, undrivable, a solid obstacle.
// Physics is arcade: throttle/brake/reverse, speed-sensitive steering, handbrake
// drift, building and car collision with a crash impulse the game turns into
// screen shake, sound and wanted heat.

import * as THREE from '../vendor/three/three.module.min.js';
import { CAR_MAX_SPEED, clamp } from './config.js';
import { collideCircle } from './city.js';

export const CAR_KINDS = {
  coupe: { w: 1.9, l: 4.4, h: 0.62, cabinL: 2.0, topSpeed: 1.0 },
  hatch: { w: 1.85, l: 3.9, h: 0.72, cabinL: 2.3, topSpeed: 0.85 },
  truck: { w: 2.1, l: 5.4, h: 0.95, cabinL: 1.4, topSpeed: 0.72 },
  // Iter1: the muscle car — wider body, rear spoiler, near-coupe top speed.
  muscle: { w: 2.05, l: 4.7, h: 0.58, cabinL: 1.9, topSpeed: 0.97 },
  police: { w: 1.95, l: 4.6, h: 0.66, cabinL: 2.1, topSpeed: 1.06 },
};

export function createCarMesh(kind, colorHex) {
  const spec = CAR_KINDS[kind] || CAR_KINDS.coupe;
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: colorHex });
  const dark = new THREE.MeshLambertMaterial({ color: 0x14161c });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fd8ef });
  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.l), paint);
  body.position.y = 0.55 + spec.h / 2 - 0.3;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.82, 0.55, spec.cabinL), kind === 'police' ? new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }) : glass);
  cabin.position.set(0, body.position.y + spec.h / 2 + 0.26, -0.2);
  group.add(cabin);
  if (kind === 'truck') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.94, 0.5, 2.6), dark);
    bed.position.set(0, body.position.y + 0.3, 1.2);
    group.add(bed);
  }
  if (kind === 'muscle') {
    // Rear spoiler on two struts, plus a hood scoop for the muscle look.
    const wing = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.94, 0.1, 0.42), dark);
    wing.position.set(0, body.position.y + spec.h / 2 + 0.42, spec.l / 2 - 0.35);
    group.add(wing);
    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), dark);
      strut.position.set(side * spec.w * 0.36, body.position.y + spec.h / 2 + 0.2, spec.l / 2 - 0.35);
      group.add(strut);
    }
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.9), dark);
    scoop.position.set(0, body.position.y + spec.h / 2 + 0.06, -spec.l / 2 + 1.1);
    group.add(scoop);
  }
  if (kind === 'police') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(spec.w + 0.04, 0.3, spec.l * 0.98), dark);
    stripe.position.y = body.position.y;
    group.add(stripe);
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2244 }));
    red.position.x = -0.32;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.x = 0.32;
    bar.add(red, blue);
    bar.position.set(0, cabin.position.y + 0.42, -0.2);
    bar.name = 'lightbar';
    group.add(bar);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  const wheels = [];
  for (const [wx, wz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx * (spec.w / 2 - 0.05), 0.36, wz * (spec.l / 2 - 0.85));
    group.add(wheel);
    wheels.push(wheel);
  }
  // Headlights: two small emissive boxes + one spotlight cone at dusk.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), lightMat);
    lamp.position.set(side * spec.w * 0.3, 0.72, -spec.l / 2 - 0.02);
    group.add(lamp);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.08), new THREE.MeshBasicMaterial({ color: 0xff3344 }));
    tail.position.set(side * spec.w * 0.3, 0.74, spec.l / 2 + 0.02);
    group.add(tail);
  }
  // No per-car spotlight: thirty dynamic lights would stall the renderer.
  // The game hangs one shared headlight beam on whichever car the player drives.
  group.userData.wheels = wheels;
  group.userData.spec = spec;
  return group;
}

let nextCarId = 1;

export class Vehicle {
  constructor(kind, colorHex, x, z, heading) {
    this.id = nextCarId;
    nextCarId += 1;
    this.kind = kind;
    this.mesh = createCarMesh(kind, colorHex);
    this.mesh.position.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.wrecked = false; // iter1: health 0 turns a car into an undrivable wreck
    this.driver = null; // 'traffic' | 'police' | 'player' | null (parked)
    this.occupied = false;
    this.crashImpulse = 0; // set on impact, consumed by the game for shake/sound
    this.skid = 0;
    this.updateMesh();
  }

  get x() { return this.mesh.position.x; }
  get z() { return this.mesh.position.z; }
  get spec() { return CAR_KINDS[this.kind] || CAR_KINDS.coupe; }

  updateMesh() {
    this.mesh.rotation.y = this.heading;
    const wheels = this.mesh.userData.wheels;
    for (let i = 0; i < wheels.length; i += 1) {
      wheels[i].rotation.x += this.speed * 0.06;
      if (i < 2) wheels[i].rotation.y = this.steer * 0.5;
    }
  }

  /** A wrecked car stops dead, darkens, and can never be driven again. */
  makeWreck() {
    if (this.wrecked) return;
    this.wrecked = true;
    this.speed = 0;
    this.driver = this.driver === 'player' ? 'player' : null;
    this.mesh.traverse((node) => {
      if (node.isMesh && node.material && node.material.color) node.material.color.multiplyScalar(0.45);
    });
  }

  /**
   * Arcade step. input: {throttle -1..1, steer -1..1, handbrake bool}.
   * Returns nothing; collisions resolve against buildings and world bounds.
   * A wreck never moves again, whatever input it is given.
   */
  drive(dt, input, topSpeedScale) {
    if (this.wrecked) { this.speed = 0; return; }
    const spec = this.spec;
    const maxSpeed = CAR_MAX_SPEED * spec.topSpeed * (topSpeedScale || 1);
    const accel = 15;
    if (input.throttle > 0) {
      this.speed += accel * input.throttle * dt * (this.speed < 0 ? 2.2 : 1);
    } else if (input.throttle < 0) {
      this.speed += accel * 1.4 * input.throttle * dt * (this.speed > 0.5 ? 1.6 : 1);
    } else {
      this.speed -= this.speed * 0.55 * dt;
      if (Math.abs(this.speed) < 0.04) this.speed = 0;
    }
    const maxReverse = -11;
    this.speed = clamp(this.speed, maxReverse, maxSpeed);
    if (input.handbrake) this.speed -= this.speed * 1.7 * dt;
    const steerTarget = (input.steer || 0) * (input.handbrake ? 0.85 : 0.55);
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 7);
    const speedFactor = clamp(Math.abs(this.speed) / 9, 0, 1);
    const turnRate = this.steer * 1.9 * speedFactor * (input.handbrake ? 1.5 : 1);
    if (Math.abs(this.speed) > 0.05) {
      this.heading -= turnRate * dt * Math.sign(this.speed);
    }
    this.skid = Math.abs(turnRate * this.speed) > 9 ? 1 : Math.max(0, this.skid - dt * 2);
    // Forward is local -Z rotated by heading: forward = (-sin h, -cos h).
    const fx = -Math.sin(this.heading);
    const fz = -Math.cos(this.heading);
    const mx = this.x + fx * this.speed * dt;
    const mz = this.z + fz * this.speed * dt;
    const before = Math.abs(this.speed);
    const [cx, cz] = collideCircle(mx, mz, 1.7);
    if (Math.abs(cx - mx) > 0.01 || Math.abs(cz - mz) > 0.01) {
      if (before > 4) {
        this.crashImpulse = before;
        this.health -= before * 1.1;
      }
      this.speed *= -0.25;
    }
    this.mesh.position.x = clamp(cx, -215, 235);
    this.mesh.position.z = clamp(cz, -205, 205);
    this.updateMesh();
  }

  /** Simple separation from another car; returns impact speed or 0. Wrecks
   *  are solid obstacles: they neither move nor take further damage. */
  collideWith(other) {
    if (this.wrecked || other.wrecked) {
      const dx = this.x - other.x;
      const dz = this.z - other.z;
      const d2 = dx * dx + dz * dz;
      const min = 3.1;
      if (d2 > min * min || d2 < 0.0001) return 0;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      const ux = dx / d;
      const uz = dz / d;
      if (!this.wrecked) { this.mesh.position.x += ux * push; this.mesh.position.z += uz * push; this.speed *= 0.3; }
      if (!other.wrecked) { other.mesh.position.x -= ux * push; other.mesh.position.z -= uz * push; other.speed *= 0.3; }
      return Math.abs(this.speed - other.speed);
    }
    const dx = this.x - other.x;
    const dz = this.z - other.z;
    const d2 = dx * dx + dz * dz;
    const min = 3.1;
    if (d2 > min * min || d2 < 0.0001) return 0;
    const d = Math.sqrt(d2);
    const push = (min - d) / 2;
    const ux = dx / d;
    const uz = dz / d;
    this.mesh.position.x += ux * push;
    this.mesh.position.z += uz * push;
    other.mesh.position.x -= ux * push;
    other.mesh.position.z -= uz * push;
    const impact = Math.abs(this.speed - other.speed);
    if (impact > 5) {
      this.crashImpulse = Math.max(this.crashImpulse, impact);
      other.crashImpulse = Math.max(other.crashImpulse, impact);
      this.health -= impact;
      other.health -= impact;
      this.speed *= 0.45;
      other.speed *= 0.45;
    }
    return impact;
  }
}

export function forwardOf(heading) {
  return { x: -Math.sin(heading), z: -Math.cos(heading) };
}
