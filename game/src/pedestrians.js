// Neon Tides — pedestrians: low-poly walkers with swinging limbs who stroll
// the sidewalks, cross at intersections, and flee from gunfire, punches and
// fast cars. Each has health; being run over or shot drops them (and, if the
// player did it, raises the wanted level through the game's crime callback).

import * as THREE from '../vendor/three/three.module.min.js';
import {
  BLOCK_PITCH, GRID_MIN, GRID_MAX, ROAD_HALF, PED_COLORS, PEDESTRIAN_COUNT,
  mulberry32, roadCoord, clamp,
} from './config.js';
import { collideCircle } from './city.js';

export function createPersonMesh(shirtColor, pantsColor) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: pantsColor });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.34), shirt);
  torso.position.y = 1.12;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.4), skin);
  head.position.y = 1.78;
  group.add(head);
  const limbs = {};
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), shirt);
    arm.geometry.translate(0, -0.3, 0);
    arm.position.set(side * 0.4, 1.44, 0);
    group.add(arm);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.78, 0.2), pants);
    leg.geometry.translate(0, -0.36, 0);
    leg.position.set(side * 0.17, 0.78, 0);
    group.add(leg);
    limbs[side < 0 ? 'armL' : 'armR'] = arm;
    limbs[side < 0 ? 'legL' : 'legR'] = leg;
  }
  group.userData.limbs = limbs;
  return group;
}

export function animatePerson(mesh, walkPhase, speedRatio, fallen) {
  const limbs = mesh.userData.limbs;
  if (!limbs) return;
  if (fallen) {
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.25;
    return;
  }
  mesh.rotation.x = 0;
  mesh.position.y = 0;
  const swing = Math.sin(walkPhase) * 0.55 * clamp(speedRatio, 0, 1.4);
  limbs.legL.rotation.x = swing;
  limbs.legR.rotation.x = -swing;
  limbs.armL.rotation.x = -swing * 0.8;
  limbs.armR.rotation.x = swing * 0.8;
}

export class Pedestrian {
  constructor(rng, x, z) {
    this.mesh = createPersonMesh(
      PED_COLORS[Math.floor(rng() * PED_COLORS.length)],
      PED_COLORS[Math.floor(rng() * PED_COLORS.length)],
    );
    this.mesh.position.set(x, 0, z);
    this.heading = rng() * Math.PI * 2;
    this.speed = 1.3 + rng() * 0.9;
    this.health = 50;
    this.fallen = false;
    this.fallTimer = 0;
    this.fleeTimer = 0;
    this.fleeFrom = null;
    this.walkPhase = rng() * 6;
    this.wanderTimer = 2 + rng() * 5;
    this.axis = rng() < 0.5 ? 'x' : 'z';
    this.line = roadCoord(GRID_MIN + Math.floor(rng() * (GRID_MAX - GRID_MIN + 1)));
    this.side = rng() < 0.5 ? -1 : 1;
    this.dir = rng() < 0.5 ? -1 : 1;
  }

  get x() { return this.mesh.position.x; }
  get z() { return this.mesh.position.z; }

  scare(fromPos, seconds) {
    if (this.fallen) return;
    this.fleeTimer = Math.max(this.fleeTimer, seconds || 3);
    this.fleeFrom = { x: fromPos.x, z: fromPos.z };
  }

  damage(amount, game) {
    if (this.fallen) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.fallen = true;
      this.fallTimer = 9;
      animatePerson(this.mesh, 0, 0, true);
      if (game) game.onPedestrianDown(this);
    } else {
      this.scare(game ? game.playerPos() : this.mesh.position, 4);
    }
  }

  update(dt, game) {
    if (this.fallen) {
      this.fallTimer -= dt;
      return this.fallTimer > 0; // false => remove from world
    }
    let speed = this.speed;
    if (this.fleeTimer > 0) {
      this.fleeTimer -= dt;
      speed = 5.0; // iter1: fleeing is a touch faster now the helicopter scatters crowds too
      if (this.fleeFrom) {
        // Flee direction d = position - threat; with forward = (-sin h, -cos h),
        // the heading that runs straight away from the threat is atan2(-dx, -dz).
        const dx = this.x - this.fleeFrom.x;
        const dz = this.z - this.fleeFrom.z;
        this.heading = Math.atan2(-dx, -dz);
      }
    } else {
      // Stroll along a sidewalk: hold the lane offset, walk the axis, flip at ends.
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 3 + Math.random() * 6;
        if (Math.random() < 0.3) this.dir *= -1;
        if (Math.random() < 0.2) {
          this.axis = this.axis === 'x' ? 'z' : 'x';
          this.line = roadCoord(GRID_MIN + Math.floor(Math.random() * (GRID_MAX - GRID_MIN + 1)));
        }
      }
      const targetHeading = this.axis === 'x'
        ? (this.dir > 0 ? -Math.PI / 2 : Math.PI / 2)
        : (this.dir > 0 ? Math.PI : 0);
      this.heading = targetHeading;
      // Drift back toward the sidewalk line.
      if (this.axis === 'x') {
        const targetZ = this.line + this.side * (ROAD_HALF + 2.2);
        this.mesh.position.z += clamp(targetZ - this.z, -dt * 2, dt * 2);
      } else {
        const targetX = this.line + this.side * (ROAD_HALF + 2.2);
        this.mesh.position.x += clamp(targetX - this.x, -dt * 2, dt * 2);
      }
      if (Math.abs(this.x) > 195 || Math.abs(this.z) > 195) this.dir *= -1;
    }
    const fx = -Math.sin(this.heading);
    const fz = -Math.cos(this.heading);
    let nx = this.x + fx * speed * dt;
    let nz = this.z + fz * speed * dt;
    [nx, nz] = collideCircle(nx, nz, 0.45);
    this.mesh.position.x = clamp(nx, -210, 240);
    this.mesh.position.z = clamp(nz, -205, 205);
    this.mesh.rotation.y = this.heading;
    this.walkPhase += dt * speed * 2.6;
    animatePerson(this.mesh, this.walkPhase, speed / 2, false);
    return true;
  }
}

export class PedestrianManager {
  constructor(scene) {
    this.scene = scene;
    this.rng = mulberry32(4242);
    this.peds = [];
    for (let i = 0; i < PEDESTRIAN_COUNT; i += 1) {
      const line = roadCoord(GRID_MIN + Math.floor(this.rng() * (GRID_MAX - GRID_MIN + 1)));
      const along = (this.rng() - 0.5) * 330;
      const ped = new Pedestrian(this.rng, line + (this.rng() < 0.5 ? -1 : 1) * (ROAD_HALF + 2.2), along);
      this.peds.push(ped);
      scene.add(ped.mesh);
    }
  }

  scareAll(fromPos, radius, seconds) {
    for (const ped of this.peds) {
      if (Math.hypot(ped.x - fromPos.x, ped.z - fromPos.z) < radius) ped.scare(fromPos, seconds);
    }
  }

  /** Rotor wash: everyone under the helicopter's beam scatters (helicopter.js). */
  scatterFrom(fromPos, radius) {
    this.scareAll(fromPos, radius, 3);
  }

  update(dt, game) {
    const kept = [];
    for (const ped of this.peds) {
      if (ped.update(dt, game)) kept.push(ped);
      else this.scene.remove(ped.mesh);
    }
    this.peds = kept;
    // Top the crowd back up far from the player.
    while (this.peds.length < PEDESTRIAN_COUNT) {
      const pp = game.playerPos();
      const line = roadCoord(GRID_MIN + Math.floor(this.rng() * (GRID_MAX - GRID_MIN + 1)));
      const along = pp.z + (this.rng() < 0.5 ? -1 : 1) * (90 + this.rng() * 60);
      const ped = new Pedestrian(this.rng, line + (this.rng() < 0.5 ? -1 : 1) * (ROAD_HALF + 2.2), clamp(along, -195, 195));
      this.peds.push(ped);
      this.scene.add(ped.mesh);
    }
  }
}
