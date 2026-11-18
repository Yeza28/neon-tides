// Neon Tides — the PVPD police helicopter: the five-star response.
// At wanted 4–5 a helicopter circles Rook about 40 m up, its searchlight cone
// tracking the player and painting a bright pool on the ground below. While
// it is overhead the wanted stars do not decay (see police.js): the only way
// out is to break line of sight and lose the ground units, or finish the job.
// Rotor wash scatters nearby pedestrians. Sound is a low thump loop from the
// AudioEngine (setRotor), started and stopped with the helicopter itself.

import * as THREE from '../vendor/three/three.module.min.js';
import { HELI_MIN_STARS, HELI_HEIGHT, HELI_RADIUS, clamp } from './config.js';

export class PoliceHelicopter {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.active = false;
    this.forced = false; // screenshot staging pins it up regardless of stars
    this.angle = 0.6;
    this.orbitRate = 0.5; // radians/s around the player; staging can pin it to 0
    this.stageHeight = 0; // screenshot staging: fly lower/closer so it is in frame
    this.stageRadius = 0;
    this.scatterTimer = 0;
    this.group = new THREE.Group();
    const navy = new THREE.MeshLambertMaterial({ color: 0x1d2f57 });
    const white = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
    // White body so the helicopter reads against the purple dusk sky.
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.3, 1.7), white);
    this.group.add(body);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.45, 0.4, 1.75), navy);
    stripe.position.y = 0.1;
    this.group.add(stripe);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.5), white);
    nose.position.set(0, -0.1, -1.9);
    this.group.add(nose);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3.2), navy);
    tail.position.set(0, 0.2, 2.8);
    this.group.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.1, 0.9), white);
    fin.position.set(0, 0.7, 4.2);
    this.group.add(fin);
    for (const side of [-1, 1]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 3.0), white);
      skid.position.set(side * 0.9, -0.85, 0);
      this.group.add(skid);
    }
    // Main rotor: two long blades on a mast, spun every frame.
    this.rotor = new THREE.Group();
    const bladeMat = new THREE.MeshLambertMaterial({ color: 0x14161c });
    for (const side of [-1, 1]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.08, 0.5), bladeMat);
      blade.position.x = side * 3.8;
      this.rotor.add(blade);
    }
    this.rotor.position.y = 0.95;
    this.group.add(this.rotor);
    // Searchlight: a real spotlight aimed at the player plus a visible cone
    // and a bright ground pool, so the beam reads even at screenshot scale.
    this.spot = new THREE.SpotLight(0xfff6c9, 0, 90, 0.2, 0.6, 0.9);
    this.spotTarget = new THREE.Object3D();
    this.group.add(this.spot, this.spotTarget);
    this.spot.target = this.spotTarget;
    this.spot.position.set(0, -0.6, -0.5);
    this.spotTarget.position.set(0, -HELI_HEIGHT, 0);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(7, HELI_HEIGHT, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff6c9, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }),
    );
    cone.rotation.x = 0; // apex up at the helicopter, base on the ground
    cone.position.y = -HELI_HEIGHT / 2;
    this.cone = cone;
    this.group.add(cone);
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(7, 20),
      new THREE.MeshBasicMaterial({ color: 0xfff6c9, transparent: true, opacity: 0.16, depthWrite: false }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = -HELI_HEIGHT + 0.1;
    this.pool = pool;
    this.group.add(pool);
    this.group.visible = false;
    scene.add(this.group);
  }

  get pos() { return { x: this.group.position.x, z: this.group.position.z }; }

  /** Screenshot staging: keep the helicopter up whatever the stars say. */
  showForShot() {
    this.forced = true;
    this.active = true;
    this.group.visible = true;
  }

  hide() {
    this.forced = false;
    this.active = false;
    this.group.visible = false;
    this.game.audio.setRotor(false, 0);
  }

  update(dt, playerPos, stars) {
    const wantUp = this.forced || stars >= HELI_MIN_STARS;
    if (wantUp && !this.active) {
      this.active = true;
      this.group.visible = true;
      this.game.hud.showPhone('PVPD air unit overhead — stars will not fade while it watches.', 3600);
    } else if (!wantUp && this.active) {
      this.hide();
      return;
    }
    if (!this.active) return;
    // Circle the player, always looking down at them. Staging may override
    // the cruise height/radius so the helicopter sits inside the shot frame.
    const H = this.stageHeight || HELI_HEIGHT;
    const R = this.stageRadius || HELI_RADIUS;
    this.angle += dt * this.orbitRate;
    const x = playerPos.x + Math.cos(this.angle) * R;
    const z = playerPos.z + Math.sin(this.angle) * R;
    this.group.position.set(x, H, z);
    this.group.rotation.y = Math.atan2(-(playerPos.x - x), -(playerPos.z - z));
    this.rotor.rotation.y += dt * 22;
    // The beam tracks the player, not the circle: the cone and pool are
    // re-aimed from the helicopter's position onto the player's ground point.
    const dx = playerPos.x - x;
    const dz = playerPos.z - z;
    const dist = Math.hypot(dx, dz);
    this.spotTarget.position.set(dx, -H, dz);
    // Tilt the visible cone from the helicopter down onto the player.
    this.cone.position.set(dx / 2, -H / 2, dz / 2);
    this.cone.rotation.set(Math.atan2(dz, H), 0, -Math.atan2(dx, H));
    this.cone.scale.y = H / HELI_HEIGHT; // cone geometry is built for HELI_HEIGHT
    this.pool.position.set(dx, -H + 0.1, dz);
    this.spot.intensity = 550; // bright pool on the player, not a white-out
    this.game.audio.setRotor(true, dt);
    void dist;
    // Rotor wash: pedestrians under the beam scatter every couple of seconds.
    this.scatterTimer -= dt;
    if (this.scatterTimer <= 0) {
      this.scatterTimer = 2.2;
      this.game.pedestrians.scatterFrom(playerPos, 26);
    }
    void clamp;
  }
}
