// Neon Tides — combat: Rook's pistol, punches, particles and screen shake.
// Shooting is a hitscan ray from the camera through the crosshair: muzzle flash,
// a tracer line, spark bursts on impact, WebAudio gunshot, pedestrians and
// police take damage and fall. Firing in public is a crime: the game raises
// the wanted level and nearby pedestrians flee.

import * as THREE from '../vendor/three/three.module.min.js';
import {
  PISTOL_DAMAGE, PISTOL_MAGAZINE, PISTOL_RESERVE_START, PISTOL_FIRE_MS, PISTOL_RANGE,
} from './config.js';

export class ParticleBurst {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    const geo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    for (let i = 0; i < 90; i += 1) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffcc66 });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      scene.add(m);
      this.pool.push({ mesh: m, vel: new THREE.Vector3(), life: 0 });
    }
    this.index = 0;
  }

  burst(pos, color, count, spread, up) {
    for (let n = 0; n < count; n += 1) {
      const p = this.pool[this.index];
      this.index = (this.index + 1) % this.pool.length;
      p.mesh.visible = true;
      p.mesh.material.color.setHex(color);
      p.mesh.position.copy(pos);
      p.vel.set((Math.random() - 0.5) * spread, Math.random() * (up || 3), (Math.random() - 0.5) * spread);
      p.life = 0.4 + Math.random() * 0.5;
    }
  }

  smoke(pos) {
    this.burst(pos, 0x888899, 3, 1.2, 2.2);
  }

  update(dt) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.vel.y -= 6 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
    }
  }
}

export class Combat {
  constructor(scene, camera, audio, game) {
    this.scene = scene;
    this.camera = camera;
    this.audio = audio;
    this.game = game;
    this.ammo = PISTOL_MAGAZINE;
    this.reserve = PISTOL_RESERVE_START;
    this.lastShot = 0;
    this.reloadingUntil = 0;
    this.particles = new ParticleBurst(scene);
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = PISTOL_RANGE;
    // Muzzle flash: a small additive plane + point light at the gun.
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0 }),
    );
    scene.add(this.flash);
    this.tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.tracer = new THREE.Line(this.tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 }));
    scene.add(this.tracer);
    this.flashUntil = 0;
    this.shake = 0;
  }

  addShake(amount) { this.shake = Math.min(1.2, this.shake + amount); }

  shakeOffset() {
    if (this.shake <= 0.001) return { x: 0, y: 0 };
    this.shake *= 0.88;
    return { x: (Math.random() - 0.5) * this.shake * 0.5, y: (Math.random() - 0.5) * this.shake * 0.5 };
  }

  tryReload(now) {
    if (this.ammo >= PISTOL_MAGAZINE || this.reserve <= 0 || now < this.reloadingUntil) return;
    const take = Math.min(PISTOL_MAGAZINE - this.ammo, this.reserve);
    this.reloadingUntil = now + 900;
    setTimeout(() => {
      this.ammo += take;
      this.reserve -= take;
    }, 900);
    this.audio.blip(300, 0.08, 'square', 0.08);
  }

  /** Fire one shot from the camera centre. originPos = shooter's world position. */
  shoot(now, originPos) {
    if (now - this.lastShot < PISTOL_FIRE_MS || now < this.reloadingUntil) return false;
    if (this.ammo <= 0) {
      this.tryReload(now);
      return false;
    }
    this.lastShot = now;
    this.ammo -= 1;
    this.audio.gunshot();
    this.game.onGunFired(originPos);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const origin = this.camera.position.clone();
    this.raycaster.set(origin, dir);
    // Candidate targets: pedestrian meshes, police, cars.
    const targets = this.game.shootableMeshes();
    const hits = this.raycaster.intersectObjects(targets, true);
    let end = origin.clone().addScaledVector(dir, PISTOL_RANGE);
    if (hits.length > 0) {
      end = hits[0].point.clone();
      this.game.onShotHit(hits[0].object, end);
      this.particles.burst(end, 0xffcc66, 10, 3.4, 3);
    }
    // Muzzle flash at the camera's lower right, tracer to the hit point.
    const muzzle = origin.clone().addScaledVector(dir, 1.1);
    muzzle.y -= 0.18;
    this.flash.position.copy(muzzle);
    this.flash.lookAt(end);
    this.flash.material.opacity = 0.95;
    const pts = [muzzle, end];
    this.tracer.geometry.setFromPoints(pts);
    this.tracer.material.opacity = 0.85;
    this.flashUntil = now + 55;
    this.addShake(0.12);
    if (this.ammo === 0) this.tryReload(now);
    return true;
  }

  /** Unarmed punch: short range, quieter than a shot but still a crime up close. */
  punch(game) {
    const p = game.player;
    if (p.punchCooldown > 0 || p.inCar) return;
    p.punchCooldown = 0.45;
    this.audio.blip(120, 0.07, 'sine', 0.15, 60);
    const fx = -Math.sin(p.heading);
    const fz = -Math.cos(p.heading);
    const reach = { x: p.x + fx * 1.3, z: p.z + fz * 1.3 };
    game.onPunch(reach);
  }

  update(now) {
    if (now > this.flashUntil) {
      this.flash.material.opacity = 0;
      this.tracer.material.opacity = 0;
    }
  }
}
