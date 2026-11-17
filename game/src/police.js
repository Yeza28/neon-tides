// Neon Tides — the Port Vireo Police Department: wanted stars and response.
// Crimes reported to addCrime() raise the 0–5 star wanted level. Interceptor
// cars spawn in proportion to the stars, chase and ram the player; at 3+ stars
// officers on foot join and shoot. If officers pin the player (close and slow)
// the bust meter fills toward BUSTED. Staying unseen decays the stars.

import * as THREE from '../vendor/three/three.module.min.js';
import {
  WANTED_MAX, WANTED_DECAY_SECONDS, BUST_RANGE, BUST_FILL_SECONDS,
  POLICE_FOOT_MIN_STARS, POLICE_MAX_SPEED, clamp, angleDelta,
} from './config.js';
import { Vehicle } from './vehicles.js';
import { createPersonMesh, animatePerson } from './pedestrians.js';

export const CRIME_WEIGHTS = {
  carjack: 1,
  carjackSeen: 2,
  hitPedestrian: 2,
  killPedestrian: 2,
  gunfire: 1,
  hitPolice: 2,
  hitCar: 0, // minor scrapes are free; hard hits on police are not
  missionHeat: 3,
};

export class PoliceManager {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.wanted = 0; // float; stars shown = ceil-ish via floor of heat
    this.heat = 0; // 0..WANTED_MAX in star units
    this.cars = [];
    this.officers = [];
    this.unseenTimer = 0;
    this.bustMeter = 0;
    this.spawnTimer = 0;
    this.shootTimer = 0;
    this.seenByPolice = false;
  }

  get stars() { return clamp(Math.floor(this.heat + 0.001), 0, WANTED_MAX); }

  addCrime(kind) {
    const w = CRIME_WEIGHTS[kind] || 0;
    if (w <= 0) return;
    this.heat = clamp(this.heat + w, 0, WANTED_MAX);
    this.unseenTimer = 0;
  }

  clearWanted() {
    this.heat = 0;
    this.unseenTimer = 0;
    this.bustMeter = 0;
  }

  setWanted(stars) {
    this.heat = clamp(stars, 0, WANTED_MAX);
    this.unseenTimer = 0;
  }

  desiredCars() {
    const s = this.stars;
    if (s <= 0) return 0;
    return [0, 2, 3, 4, 5, 7][s];
  }

  desiredOfficers() {
    const s = this.stars;
    return s >= POLICE_FOOT_MIN_STARS ? (s - 2) * 2 : 0;
  }

  spawnCarNear(playerPos) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 55 + Math.random() * 25;
    const x = clamp(playerPos.x + Math.cos(angle) * dist, -200, 220);
    const z = clamp(playerPos.z + Math.sin(angle) * dist, -195, 195);
    const car = new Vehicle('police', 0xffffff, x, z, Math.random() * Math.PI * 2);
    car.driver = 'police';
    this.scene.add(car.mesh);
    this.cars.push(car);
    return car;
  }

  spawnOfficerNear(playerPos) {
    const mesh = createPersonMesh(0x1d2f57, 0x141824);
    const angle = Math.random() * Math.PI * 2;
    mesh.position.set(
      clamp(playerPos.x + Math.cos(angle) * 26, -205, 230),
      0,
      clamp(playerPos.z + Math.sin(angle) * 26, -200, 200),
    );
    this.scene.add(mesh);
    const officer = {
      mesh, health: 80, fallen: false, fallTimer: 0, walkPhase: Math.random() * 6,
      get x() { return this.mesh.position.x; },
      get z() { return this.mesh.position.z; },
    };
    this.officers.push(officer);
    return officer;
  }

  removeCar(car) {
    this.scene.remove(car.mesh);
    this.cars = this.cars.filter((c) => c !== car);
  }

  damageOfficer(officer, amount) {
    if (officer.fallen) return;
    officer.health -= amount;
    if (officer.health <= 0) {
      officer.fallen = true;
      officer.fallTimer = 8;
      animatePerson(officer.mesh, 0, 0, true);
      this.addCrime('hitPolice');
    }
  }

  update(dt, playerPos, playerSpeed, playerInCar) {
    const game = this.game;
    this.spawnTimer -= dt;
    // Spawn / despawn to match the wanted level.
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.8;
      if (this.cars.length < this.desiredCars()) this.spawnCarNear(playerPos);
      if (this.officers.length < this.desiredOfficers()) this.spawnOfficerNear(playerPos);
    }
    if (this.stars === 0) {
      for (const car of [...this.cars]) {
        if (Math.hypot(car.x - playerPos.x, car.z - playerPos.z) > 90) this.removeCar(car);
      }
      for (const o of [...this.officers]) {
        if (Math.hypot(o.x - playerPos.x, o.z - playerPos.z) > 70) {
          this.scene.remove(o.mesh);
          this.officers = this.officers.filter((x) => x !== o);
        }
      }
    }
    // Visibility: any police unit with line-of-range sight refreshes the hunt.
    this.seenByPolice = false;
    let nearestPin = Infinity;
    for (const car of this.cars) {
      const d = Math.hypot(car.x - playerPos.x, car.z - playerPos.z);
      if (d < 60) this.seenByPolice = true;
      if (d < nearestPin) nearestPin = d;
      this.driveChase(car, dt, playerPos);
    }
    for (const o of this.officers) {
      const d = Math.hypot(o.x - playerPos.x, o.z - playerPos.z);
      if (d < 45) this.seenByPolice = true;
      if (d < nearestPin) nearestPin = d;
      this.updateOfficer(o, dt, playerPos);
    }
    // Wanted decay while unseen.
    if (this.heat > 0) {
      if (this.seenByPolice) this.unseenTimer = 0;
      else {
        this.unseenTimer += dt;
        if (this.unseenTimer > WANTED_DECAY_SECONDS) {
          this.unseenTimer = 0;
          this.heat = Math.max(0, this.heat - 1);
          if (this.heat === 0) game.onWantedCleared();
        }
      }
    }
    // Bust meter: pinned = a unit very close while the player is slow.
    const slow = playerSpeed < 2.2;
    if (this.stars > 0 && nearestPin < BUST_RANGE && slow) {
      this.bustMeter += dt / BUST_FILL_SECONDS;
      if (this.bustMeter >= 1) {
        this.bustMeter = 0;
        game.onBusted();
      }
    } else {
      this.bustMeter = Math.max(0, this.bustMeter - dt * 0.7);
    }
    // Officer gunfire.
    this.shootTimer -= dt;
    if (this.shootTimer <= 0) {
      this.shootTimer = 0.55;
      for (const o of this.officers) {
        if (o.fallen) continue;
        const d = Math.hypot(o.x - playerPos.x, o.z - playerPos.z);
        if (d < 30 && this.stars >= POLICE_FOOT_MIN_STARS) {
          game.onPoliceShot(o, d);
        }
      }
      void playerInCar;
    }
    game.audio.setSiren(this.stars > 0 && this.cars.length > 0, dt);
  }

  driveChase(car, dt, target) {
    const dx = target.x - car.x;
    const dz = target.z - car.z;
    const dist = Math.hypot(dx, dz);
    const desired = Math.atan2(-dx, -dz);
    const delta = angleDelta(car.heading, desired);
    const steer = clamp(delta * 1.4, -0.85, 0.85);
    let throttle = 1;
    if (Math.abs(delta) > 2.4) throttle = -0.8; // target behind: reverse around
    else if (Math.abs(delta) > 1.2) throttle = 0.45;
    if (dist < 4 && car.speed > 6) throttle = -0.4; // overshoot guard; ramming is at speed
    car.drive(dt, { throttle, steer, handbrake: Math.abs(delta) > 1.1 && car.speed > 8 }, 1.05);
    // Flash the lightbar.
    const bar = car.mesh.getObjectByName('lightbar');
    if (bar) {
      const phase = Math.floor(performance.now() / 220) % 2;
      bar.children[0].material.color.setHex(phase ? 0xff2244 : 0x550000);
      bar.children[1].material.color.setHex(phase ? 0x000055 : 0x2266ff);
    }
    void POLICE_MAX_SPEED;
  }

  updateOfficer(officer, dt, target) {
    if (officer.fallen) {
      officer.fallTimer -= dt;
      if (officer.fallTimer <= 0) {
        this.scene.remove(officer.mesh);
        this.officers = this.officers.filter((x) => x !== officer);
      }
      return;
    }
    const dx = target.x - officer.x;
    const dz = target.z - officer.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 13) {
      const h = Math.atan2(-dx, -dz);
      officer.mesh.position.x += -Math.sin(h) * 3.6 * dt;
      officer.mesh.position.z += -Math.cos(h) * 3.6 * dt;
      officer.mesh.rotation.y = h;
      officer.walkPhase += dt * 9;
      animatePerson(officer.mesh, officer.walkPhase, 1, false);
    } else {
      officer.mesh.rotation.y = Math.atan2(-dx, -dz);
      animatePerson(officer.mesh, officer.walkPhase, 0.1, false);
    }
  }
}
