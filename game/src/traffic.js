// Neon Tides — traffic AI and the parked-car pool.
// Traffic cars follow the road grid in right-hand lanes, slow for the car or
// pedestrian ahead, and pick a new direction at intersections. Cars far from
// the player teleport to a road near (but out of sight of) the player, so the
// city always feels busy without simulating the whole map. Parked cars line
// the kerbs waiting to be stolen.

import * as THREE from '../vendor/three/three.module.min.js';
import {
  BLOCK_PITCH, ROAD_HALF, GRID_MIN, GRID_MAX, CAR_COLORS, CAR_CRUISE_SPEED,
  TRAFFIC_COUNT, PARKED_COUNT, mulberry32, roadCoord, clamp,
} from './config.js';
import { Vehicle, forwardOf } from './vehicles.js';

const KINDS = ['coupe', 'hatch', 'truck', 'muscle', 'sport', 'van', 'coupe', 'hatch', 'muscle', 'sport'];

export class TrafficManager {
  constructor(scene) {
    this.scene = scene;
    this.rng = mulberry32(777);
    this.cars = [];
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
      const car = this.spawnCar(null);
      this.cars.push(car);
    }
    this.parked = [];
    for (let i = 0; i < PARKED_COUNT; i += 1) {
      const car = this.spawnParked();
      this.parked.push(car);
    }
  }

  randomRoadPoint(near) {
    const rng = this.rng;
    const horizontal = rng() < 0.5;
    const lineIdx = GRID_MIN + Math.floor(rng() * (GRID_MAX - GRID_MIN + 1));
    const line = roadCoord(lineIdx);
    let along = (GRID_MIN + rng() * (GRID_MAX - GRID_MIN)) * BLOCK_PITCH;
    if (near) along = clamp(near + (rng() - 0.5) * 190, -190, 190);
    const dir = rng() < 0.5 ? 1 : -1;
    // Right-hand traffic: lane offset depends on travel direction and axis.
    if (horizontal) {
      return { x: along, z: line + dir * ROAD_HALF * 0.48, heading: dir > 0 ? -Math.PI / 2 : Math.PI / 2, axis: 'x', dir, line };
    }
    return { x: line - dir * ROAD_HALF * 0.48, z: along, heading: dir > 0 ? Math.PI : 0, axis: 'z', dir, line };
  }

  spawnCar(nearZ) {
    const p = this.randomRoadPoint(nearZ);
    const kind = KINDS[Math.floor(this.rng() * KINDS.length)];
    const color = CAR_COLORS[Math.floor(this.rng() * CAR_COLORS.length)];
    const car = new Vehicle(kind, color, p.x, p.z, p.heading);
    car.driver = 'traffic';
    car.ai = { axis: p.axis, dir: p.dir, line: p.line, speed: CAR_CRUISE_SPEED * (0.8 + this.rng() * 0.45), nextTurn: 0 };
    this.scene.add(car.mesh);
    return car;
  }

  spawnParked() {
    const rng = this.rng;
    for (let tries = 0; tries < 12; tries += 1) {
      const horizontal = rng() < 0.5;
      const line = roadCoord(GRID_MIN + Math.floor(rng() * (GRID_MAX - GRID_MIN + 1)));
      const along = (GRID_MIN + rng() * (GRID_MAX - GRID_MIN)) * BLOCK_PITCH + (rng() - 0.5) * 20;
      const side = rng() < 0.5 ? -1 : 1;
      const x = horizontal ? along : line + side * (ROAD_HALF + 2.1);
      const z = horizontal ? line + side * (ROAD_HALF + 2.1) : along;
      const heading = horizontal ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : (side > 0 ? Math.PI : 0);
      const kind = KINDS[Math.floor(rng() * KINDS.length)];
      const car = new Vehicle(kind, CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)], x, z, heading);
      car.driver = null;
      this.scene.add(car.mesh);
      return car;
    }
    return null;
  }

  /** All cars the player could enter: traffic + parked, minus police cars. */
  enterable() {
    return [...this.cars, ...this.parked].filter(Boolean);
  }

  removeCar(car) {
    this.scene.remove(car.mesh);
    this.cars = this.cars.filter((c) => c !== car);
    this.parked = this.parked.filter((c) => c !== car);
  }

  update(dt, playerPos, allVehicles, onPedestrianHit) {
    for (const car of this.cars) {
      if (car.driver !== 'traffic') continue; // stolen cars leave the AI pool
      if (car.wrecked) continue; // wrecks sit where they died, smoking
      const ai = car.ai;
      const f = forwardOf(car.heading);
      // Slow down if something is right ahead.
      let target = ai.speed;
      for (const other of allVehicles) {
        if (other === car) continue;
        const dx = other.x - car.x;
        const dz = other.z - car.z;
        const ahead = dx * f.x + dz * f.z;
        const side = Math.abs(dx * f.z - dz * f.x);
        if (ahead > 0 && ahead < 9 && side < 2.2) target = Math.min(target, Math.max(0, (ahead - 5) * 1.6));
      }
      const dxp = playerPos.x - car.x;
      const dzp = playerPos.z - car.z;
      const aheadP = dxp * f.x + dzp * f.z;
      const sideP = Math.abs(dxp * f.z - dzp * f.x);
      if (aheadP > 0 && aheadP < 7 && sideP < 2) target = 0;
      // Accelerate / brake toward the target cruise speed.
      const throttle = car.speed < target ? 0.55 : car.speed > target + 0.5 ? -0.7 : 0;
      car.drive(dt, { throttle, steer: this.steerToLane(car), handbrake: false }, 0.55);
      // At an intersection, maybe turn onto the crossing road.
      this.maybeTurn(car, dt);
      // Respawn far-away cars near the player.
      const dist = Math.hypot(car.x - playerPos.x, car.z - playerPos.z);
      if (dist > 240) {
        const p = this.randomRoadPoint(playerPos.z);
        car.mesh.position.set(p.x, 0, p.z);
        car.heading = p.heading;
        car.speed = 0;
        car.ai = { axis: p.axis, dir: p.dir, line: p.line, speed: CAR_CRUISE_SPEED, nextTurn: 0 };
      }
      void onPedestrianHit;
    }
  }

  steerToLane(car) {
    const ai = car.ai;
    // Desired lane centre for the current road and direction.
    let laneCoord;
    let posCoord;
    if (ai.axis === 'x') {
      laneCoord = ai.line + ai.dir * ROAD_HALF * 0.48;
      posCoord = car.z;
    } else {
      laneCoord = ai.line - ai.dir * ROAD_HALF * 0.48;
      posCoord = car.x;
    }
    const err = laneCoord - posCoord;
    return clamp(err * 0.12, -0.5, 0.5) * (ai.axis === 'x' ? 1 : -1) * (ai.axis === 'x' ? 1 : 1);
  }

  maybeTurn(car, dt) {
    const ai = car.ai;
    ai.nextTurn -= dt;
    const crossCoord = ai.axis === 'x' ? car.x : car.z;
    const nearest = Math.round(crossCoord / BLOCK_PITCH) * BLOCK_PITCH;
    if (Math.abs(crossCoord - nearest) > 3.2 || ai.nextTurn > 0) return;
    ai.nextTurn = 1.2;
    if (this.rng() < 0.45) return; // go straight
    const turnLeft = this.rng() < 0.5;
    if (ai.axis === 'x') {
      const newDir = turnLeft ? ai.dir : -ai.dir; // turning swaps travel axis
      ai.axis = 'z';
      ai.line = nearest;
      ai.dir = newDir * (turnLeft ? 1 : 1);
      car.heading = ai.dir > 0 ? Math.PI : 0;
      if (!turnLeft) car.heading = ai.dir > 0 ? 0 : Math.PI;
      // Snap heading cleanly: for z travel, dir +1 heads -Z (heading PI faces +Z? see forwardOf)
      car.heading = this.headingFor(ai.axis, ai.dir);
    } else {
      ai.axis = 'x';
      ai.line = nearest;
      ai.dir = turnLeft ? -ai.dir : ai.dir;
      car.heading = this.headingFor(ai.axis, ai.dir);
    }
  }

  headingFor(axis, dir) {
    if (axis === 'x') return dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    return dir > 0 ? Math.PI : 0;
  }
}
