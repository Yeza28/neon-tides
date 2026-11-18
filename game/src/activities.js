// Neon Tides — free-roam side activities: neon caches and taxi fares.
// (a) Ten glowing neon caches are hidden around Port Vireo — on sidewalks,
// the pier, the beach and the docks. Each is worth $150 and the HUD counts
// them (Caches n/10), so free roam always pays.
// (b) Taxi fares: a fare marker spawns at a random kerb, a waiting pedestrian
// stands beside it, and Rook (in a car) picks them up and delivers them to a
// destination within a timer for $200–$400. Fares reuse the mission marker
// look (beam + ring, green instead of gold) and the HUD timer.

import * as THREE from '../vendor/three/three.module.min.js';
import { createPersonMesh } from './pedestrians.js';
import { CACHE_REWARD, FARE_TIME_LIMIT, roadCoord, clamp } from './config.js';

export const CACHE_SPOTS = [
  { x: -168, z: 168 }, { x: -112, z: -56 }, { x: -56, z: 112 }, { x: 0, z: -168 },
  { x: 56, z: 56 }, { x: 112, z: -112 }, { x: 168, z: 168 }, { x: 198, z: -28 },
  { x: 140, z: -168 }, { x: -28, z: 196 },
];

const FARE_PICKUPS = [
  { x: -56, z: 112 }, { x: 56, z: -56 }, { x: -112, z: 56 }, { x: 112, z: 112 },
  { x: 0, z: -112 }, { x: -168, z: -112 }, { x: 56, z: 168 }, { x: 168, z: 0 },
];
const FARE_DESTS = [
  { x: 168, z: -168 }, { x: -168, z: 168 }, { x: 112, z: -56 }, { x: -56, z: -168 },
  { x: 196, z: 56 }, { x: -112, z: -112 }, { x: 0, z: 168 }, { x: 168, z: 112 },
];

export class Activities {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.caches = CACHE_SPOTS.map((spot) => {
      const mesh = new THREE.Group();
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.75),
        new THREE.MeshBasicMaterial({ color: 0x00e5ff }),
      );
      gem.position.y = 1.1;
      mesh.add(gem);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1.15, 24),
        new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.12;
      mesh.add(ring);
      mesh.position.set(spot.x, 0, spot.z);
      scene.add(mesh);
      return { x: spot.x, z: spot.z, mesh, gem, taken: false };
    });
    // Fare marker: green beam + ring, same language as the mission marker.
    this.fareMarker = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 22, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 11;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 3.1, 28),
      new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    this.fareMarker.add(beam, ring);
    this.fareMarker.visible = false;
    scene.add(this.fareMarker);
    // The waiting fare: a pedestrian who stands at the pickup until collected.
    this.farePed = createPersonMesh(0xffd166, 0x23232e);
    this.farePed.visible = false;
    scene.add(this.farePed);
    this.fareState = 'idle'; // idle | waiting | riding
    this.farePickup = null;
    this.fareDest = null;
    this.fareTimer = 0;
    this.fareCooldown = 6; // first fare appears a few seconds into free roam
    this.farePay = 0;
  }

  get cachesCollected() { return this.caches.filter((c) => c.taken).length; }
  get cachesTotal() { return this.caches.length; }

  /** A loaded save marks its caches taken so they do not pay twice. */
  setCollected(count) {
    this.caches.forEach((cache, i) => {
      cache.taken = i < count;
      cache.mesh.visible = !cache.taken;
    });
  }

  reset() {
    this.caches.forEach((cache) => { cache.taken = false; cache.mesh.visible = true; });
    this.resetFare();
  }

  resetFare() {
    this.fareState = 'idle';
    this.fareTimer = 0;
    this.fareCooldown = 6;
    this.fareMarker.visible = false;
    this.farePed.visible = false;
  }

  spawnFare() {
    const pick = FARE_PICKUPS[Math.floor(Math.random() * FARE_PICKUPS.length)];
    let dest = FARE_DESTS[Math.floor(Math.random() * FARE_DESTS.length)];
    if (Math.hypot(dest.x - pick.x, dest.z - pick.z) < 120) {
      dest = FARE_DESTS[(FARE_DESTS.indexOf(dest) + 3) % FARE_DESTS.length];
    }
    this.farePickup = pick;
    this.fareDest = dest;
    this.fareState = 'waiting';
    this.farePay = 200 + Math.floor(Math.random() * 5) * 50; // $200–$400
    this.fareMarker.position.set(pick.x, 0, pick.z);
    this.fareMarker.visible = true;
    this.farePed.position.set(pick.x + 1.6, 0, pick.z + 1.2);
    this.farePed.visible = true;
    this.game.hud.showPhone(`Taxi fare waiting near ${pick.x < 0 ? 'west' : 'east'} side — drive up in a car. Pays $${this.farePay}.`, 4200);
  }

  update(dt, playerPos, inCar) {
    // Neon caches: spin, bob, pay on touch (on foot or by car).
    for (const cache of this.caches) {
      if (cache.taken) continue;
      cache.gem.rotation.y += dt * 1.6;
      cache.gem.position.y = 1.1 + Math.sin(this.game.elapsed * 2 + cache.x) * 0.25;
      if (Math.hypot(playerPos.x - cache.x, playerPos.z - cache.z) < 2.6) {
        cache.taken = true;
        cache.mesh.visible = false;
        this.game.addCash(CACHE_REWARD);
        this.game.audio.cacheChime();
        const n = this.cachesCollected;
        this.game.hud.showPhone(
          n >= this.cachesTotal ? `Neon cache ${n}/${this.cachesTotal} — all caches found! +$${CACHE_REWARD}` : `Neon cache ${n}/${this.cachesTotal} — +$${CACHE_REWARD}`,
          3000,
        );
      }
    }
    // Taxi fares: idle -> waiting -> riding -> paid, then a short cooldown.
    if (this.fareState === 'idle') {
      this.fareCooldown -= dt;
      if (this.fareCooldown <= 0) this.spawnFare();
      return;
    }
    this.fareMarker.rotation.y += dt * 0.8;
    if (this.fareState === 'waiting') {
      if (inCar && Math.hypot(playerPos.x - this.farePickup.x, playerPos.z - this.farePickup.z) < 4.5) {
        this.fareState = 'riding';
        this.fareTimer = FARE_TIME_LIMIT;
        this.farePed.visible = false; // the fare is in the car now
        this.fareMarker.position.set(this.fareDest.x, 0, this.fareDest.z);
        this.game.audio.pickup();
        this.game.hud.showPhone(`Fare aboard — deliver them before the clock runs out. Pays $${this.farePay}.`, 3600);
      }
      return;
    }
    // riding
    this.fareTimer -= dt;
    if (!this.game.missions.current || !this.game.missions.current.timeLimit) {
      this.game.hud.setTimer(this.fareTimer);
    }
    if (Math.hypot(playerPos.x - this.fareDest.x, playerPos.z - this.fareDest.z) < 7) {
      this.game.addCash(this.farePay);
      this.game.audio.success();
      this.game.hud.showPhone(`Fare delivered. +$${this.farePay} — Vex would call that honest work.`, 3600);
      this.game.hud.setTimer(-1);
      this.resetFare();
      this.fareCooldown = 10;
      return;
    }
    if (this.fareTimer <= 0) {
      this.game.audio.fail();
      this.game.hud.showPhone('Fare gave up and walked off. Next one will come.', 3200);
      this.game.hud.setTimer(-1);
      this.resetFare();
      this.fareCooldown = 8;
    }
    void clamp;
    void roadCoord;
  }
}
