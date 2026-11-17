// Neon Tides — Rook, the player character on foot.
// A third-person low-poly wheelman with a walk/run limb swing, WASD movement
// relative to the mouse-orbit camera, Shift sprint, building collision, and a
// punch on F when unarmed distance allows. While driving, this controller is
// parked beside the car and hidden.

import * as THREE from '../vendor/three/three.module.min.js';
import {
  PLAYER_WALK_SPEED, PLAYER_RUN_SPEED, PLAYER_RADIUS, PLAYER_MAX_HEALTH, clamp,
} from './config.js';
import { collideCircle } from './city.js';
import { createPersonMesh, animatePerson } from './pedestrians.js';

export class Player {
  constructor(scene) {
    this.mesh = createPersonMesh(0x18c8b9, 0x23232e); // teal jacket: Rook's colours
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.14, 0.44),
      new THREE.MeshLambertMaterial({ color: 0xff2e88 }),
    );
    cap.position.y = 2.05;
    this.mesh.add(cap);
    scene.add(this.mesh);
    this.x = -140;
    this.z = 150;
    this.heading = 0.6;
    this.health = PLAYER_MAX_HEALTH;
    this.walkPhase = 0;
    this.speedNow = 0;
    this.inCar = null;
    this.dead = false;
    this.punchCooldown = 0;
  }

  get pos() { return { x: this.x, z: this.z }; }

  placeAt(x, z, heading) {
    this.x = x;
    this.z = z;
    if (typeof heading === 'number') this.heading = heading;
    this.syncMesh(0);
  }

  syncMesh(dt) {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    this.walkPhase += dt * (2 + this.speedNow * 1.6);
    animatePerson(this.mesh, this.walkPhase, this.speedNow / PLAYER_RUN_SPEED, false);
  }

  /**
   * Move on foot. input: {f,b,l,r booleans, sprint bool}; camYaw is the camera
   * orbit angle so W always walks away from the camera.
   */
  update(dt, input, camYaw) {
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    if (this.inCar || this.dead) return;
    let mx = 0;
    let mz = 0;
    if (input.f) mz -= 1;
    if (input.b) mz += 1;
    if (input.l) mx -= 1;
    if (input.r) mx += 1;
    const moving = mx !== 0 || mz !== 0;
    const speed = input.sprint ? PLAYER_RUN_SPEED : PLAYER_WALK_SPEED;
    this.speedNow = moving ? speed : 0;
    if (moving) {
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      // Camera basis on the ground: forward = (-sinYaw, -cosYaw) (the same
      // convention as character headings), right = (cosYaw, -sinYaw).
      // W arrives as mz=-1, so forward is scaled by -mz; D is mx=+1 = right.
      const fwdX = -Math.sin(camYaw);
      const fwdZ = -Math.cos(camYaw);
      const rightX = Math.cos(camYaw);
      const rightZ = -Math.sin(camYaw);
      const moveX = rightX * mx + fwdX * -mz;
      const moveZ = rightZ * mx + fwdZ * -mz;
      let nx = this.x + moveX * speed * dt;
      let nz = this.z + moveZ * speed * dt;
      [nx, nz] = collideCircle(nx, nz, PLAYER_RADIUS);
      this.x = clamp(nx, -212, 245);
      this.z = clamp(nz, -205, 205);
      this.heading = Math.atan2(-moveX, -moveZ);
    }
    this.syncMesh(dt);
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, PLAYER_MAX_HEALTH);
  }

  hurt(amount) {
    if (this.dead) return false;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      return true;
    }
    return false;
  }
}
