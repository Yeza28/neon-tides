// Neon Tides — main orchestration: renderer, dusk sky, camera, input, the
// game loop, car entry/theft, crime reporting, BUSTED/WASTED flow, pause and
// start screens, saving, wrecked cars, and the ?shot= screenshot staging.
// Every system module (city, vehicles, traffic, pedestrians, police,
// helicopter, missions, activities, weapons, combat, hud, minimap, audio,
// save) is wired together here.

import * as THREE from '../vendor/three/three.module.min.js';
import { PLAYER_MAX_HEALTH, WORLD_LIMIT, clamp } from './config.js';
import { buildCity } from './city.js';
import { Vehicle } from './vehicles.js';
import { TrafficManager } from './traffic.js';
import { PedestrianManager } from './pedestrians.js';
import { Player } from './player.js';
import { Combat } from './combat.js';
import { PoliceManager } from './police.js';
import { PoliceHelicopter } from './helicopter.js';
import { Activities } from './activities.js';
import { WeaponCrates } from './weapons.js';
import { MissionManager, TARGET_CAR_SPOT } from './missions.js';
import { DayNight } from './daynight.js';
import { Garage } from './garage.js';
import { Hud } from './hud.js';
import { Minimap } from './minimap.js';
import { AudioEngine } from './audio.js';
import { loadSave, writeSave, clearSave, hasSave } from './save.js';
import { isShotMode, shotName, stageShot } from './shots.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6b4472);
scene.fog = new THREE.Fog(0x8a5f74, 120, 430);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(-150, 8, 165);

// Iter2: the day/night cycle (daynight.js) owns the sky dome, sun disc and
// moon disc; the lights below are passed in and driven per frame.

const hemi = new THREE.HemisphereLight(0xffe3c0, 0x3a3048, 1.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb36b, 2.1);
sun.position.set(-140, 90, -60);
scene.add(sun);
const neonGlow = new THREE.AmbientLight(0x8a6aa8, 0.85);
scene.add(neonGlow);

class Game {
  constructor() {
    this.audio = new AudioEngine();
    this.hud = new Hud();
    this.city = buildCity(scene);
    this.daynight = new DayNight(scene, { sun, hemi, ambient: neonGlow, glowMat: this.city.lampGlowMat });
    this.garage = new Garage(scene, this);
    this.player = new Player(scene);
    this.traffic = new TrafficManager(scene);
    this.pedestrians = new PedestrianManager(scene);
    this.police = new PoliceManager(scene, this);
    this.helicopter = new PoliceHelicopter(scene, this);
    this.activities = new Activities(scene, this);
    this.weapons = new WeaponCrates(scene, this);
    this.combat = new Combat(scene, camera, this.audio, this);
    this.missions = new MissionManager(scene, this);
    this.minimap = new Minimap(document.getElementById('minimap'));
    this.cash = 250;
    this.state = 'menu'; // menu | playing | paused | over
    this.overKind = '';
    this.keys = {};
    this.camYaw = 0.6;
    this.camPitch = 0.32;
    this.mouseDown = false;
    this.lastCrimeAt = {};
    this.targetCar = null;
    // One shared headlight beam, hung on the player's car each frame.
    this.headlight = new THREE.SpotLight(0xffeebb, 0, 36, 0.52, 0.55, 1.1);
    this.headlightTarget = new THREE.Object3D();
    scene.add(this.headlight, this.headlightTarget);
    this.headlight.target = this.headlightTarget;
    this.elapsed = 0;
    this.shotTimer = -1;
    this.regenTimer = 0;
  }

  // ---- positions and identity helpers -------------------------------------
  playerPos() {
    if (this.player.inCar) return { x: this.player.inCar.x, z: this.player.inCar.z };
    return this.player.pos;
  }

  playerHeading() {
    return this.player.inCar ? this.player.inCar.heading : this.player.heading;
  }

  playerSpeed() {
    if (this.player.inCar) return Math.abs(this.player.inCar.speed);
    return this.player.speedNow;
  }

  isGameOver() { return this.state === 'over'; }

  addCash(amount) {
    this.cash += amount;
    this.hud.setCash(this.cash);
  }

  // ---- crime and combat callbacks -----------------------------------------
  crimeSeenBy(pos, radius) {
    for (const ped of this.pedestrians.peds) {
      if (!ped.fallen && Math.hypot(ped.x - pos.x, ped.z - pos.z) < radius) return true;
    }
    return this.police.cars.length > 0 || this.police.officers.length > 0;
  }

  reportCrime(kind, pos, cooldownMs) {
    const now = performance.now();
    if (cooldownMs && this.lastCrimeAt[kind] && now - this.lastCrimeAt[kind] < cooldownMs) return;
    this.lastCrimeAt[kind] = now;
    this.police.addCrime(kind);
  }

  onGunFired(pos) {
    this.pedestrians.scareAll(pos, 26, 4);
    if (this.crimeSeenBy(pos, 34)) this.reportCrime('gunfire', pos, 3500);
  }

  onPedestrianDown(ped) {
    const pp = this.playerPos();
    if (Math.hypot(ped.x - pp.x, ped.z - pp.z) < 40 && this.crimeSeenBy(ped.mesh.position, 30)) {
      this.reportCrime('killPedestrian', ped.mesh.position, 1500);
    }
  }

  shootableMeshes() {
    const list = [];
    for (const ped of this.pedestrians.peds) list.push(ped.mesh);
    for (const o of this.police.officers) list.push(o.mesh);
    for (const car of this.allVehicles()) list.push(car.mesh);
    return list;
  }

  ownerOf(object) {
    let node = object;
    while (node) {
      if (node.userData && node.userData.owner) return node.userData.owner;
      node = node.parent;
    }
    return null;
  }

  onShotHit(object, point) {
    const owner = this.ownerOf(object);
    if (!owner) return;
    const dmg = this.combat.weapon.damage; // pistol 34, SMG 22 per bullet
    if (owner.type === 'ped') {
      owner.ref.damage(dmg, this);
      this.pedestrians.scareAll(point, 18, 4);
    } else if (owner.type === 'officer') {
      this.police.damageOfficer(owner.ref, dmg);
      this.reportCrime('hitPolice', point, 1200);
    } else if (owner.type === 'car') {
      owner.ref.health -= Math.round(dmg * 0.4);
      this.combat.particles.burst(point, 0xffaa55, 6, 2.4, 2);
      if (owner.ref.kind === 'police') this.reportCrime('hitPolice', point, 1500);
    }
  }

  onPunch(reach) {
    for (const ped of this.pedestrians.peds) {
      if (!ped.fallen && Math.hypot(ped.x - reach.x, ped.z - reach.z) < 1.1) {
        ped.damage(26, this);
        this.pedestrians.scareAll(reach, 10, 3);
        if (this.crimeSeenBy(reach, 22)) this.reportCrime('gunfire', reach, 3000);
        return;
      }
    }
    for (const o of this.police.officers) {
      if (!o.fallen && Math.hypot(o.x - reach.x, o.z - reach.z) < 1.1) {
        this.police.damageOfficer(o, 20);
        return;
      }
    }
  }

  onPoliceShot(officer, dist) {
    this.audio.blip(180, 0.09, 'square', 0.1, 70);
    const pp = this.playerPos();
    const chance = clamp(0.62 - dist * 0.014, 0.12, 0.6);
    if (Math.random() < chance) {
      const dmg = this.player.inCar ? 3 + Math.random() * 4 : 5 + Math.random() * 6;
      this.combat.particles.burst(new THREE.Vector3(pp.x, 1.2, pp.z), 0xff6655, 5, 2, 2);
      this.hurtPlayer(dmg);
    } else {
      this.combat.particles.burst(new THREE.Vector3(pp.x + (Math.random() - 0.5) * 3, 0.4, pp.z + (Math.random() - 0.5) * 3), 0xffcc66, 4, 2, 1.5);
    }
  }

  hurtPlayer(dmg) {
    if (this.state !== 'playing') return;
    if (this.player.hurt(dmg)) this.onWasted();
  }

  onWantedCleared() {
    if (this.state === 'playing') this.hud.showPhone('You lost the PVPD. Stay quiet, Rook.', 2600);
  }

  onBusted() {
    if (this.state !== 'playing') return;
    this.state = 'over';
    this.overKind = 'BUSTED';
    this.cash = Math.max(0, this.cash - 150);
    document.exitPointerLock?.();
    showEndScreen('BUSTED', 'The PVPD pinned you. Bail cost $150 — the job restarts.');
  }

  onWasted() {
    if (this.state !== 'playing') return;
    this.state = 'over';
    this.overKind = 'WASTED';
    this.cash = Math.max(0, this.cash - 100);
    document.exitPointerLock?.();
    showEndScreen('WASTED', 'Port Vireo\'s clinic patched you up for $100 — the job restarts.');
  }

  respawnAfterEnd() {
    this.player.dead = false;
    this.player.health = PLAYER_MAX_HEALTH;
    if (this.player.inCar) this.exitCar(true);
    this.police.clearWanted();
    this.helicopter.hide();
    this.activities.resetFare(); // a fresh run starts with no fare aboard
    for (const car of [...this.police.cars]) this.police.removeCar(car);
    for (const o of [...this.police.officers]) {
      scene.remove(o.mesh);
    }
    this.police.officers = [];
    this.player.placeAt(-140, 150, 0.6);
    this.state = 'playing';
    document.getElementById('end-screen').style.display = 'none';
    // Retry the current job from its first step (index 6 = free roam).
    this.missions.start(Math.min(this.missions.index, 6), false);
    this.hud.setCash(this.cash);
  }

  // ---- cars ----------------------------------------------------------------
  allVehicles() {
    const list = [...this.traffic.cars, ...this.traffic.parked, ...this.police.cars];
    if (this.targetCar && !list.includes(this.targetCar)) list.push(this.targetCar);
    return list.filter(Boolean);
  }

  nearestEnterable() {
    const p = this.player.pos;
    let best = null;
    let bestD = 3.4;
    for (const car of this.allVehicles()) {
      if (car.driver === 'police') continue;
      if (car.wrecked) continue; // wrecks are scenery now, not rides
      const d = Math.hypot(car.x - p.x, car.z - p.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  enterCar(car, silent) {
    if (!car || car.wrecked) return;
    const wasTraffic = car.driver === 'traffic';
    if (wasTraffic) {
      // The driver bails out and runs.
      const fleeing = this.pedestrians.peds.find((ped) => ped.fallen) || null;
      void fleeing;
      const driverPed = this.spawnFleeingDriver(car);
      void driverPed;
      if (this.crimeSeenBy(car.mesh.position, 26)) this.reportCrime('carjackSeen', car.mesh.position, 2000);
      else this.reportCrime('carjack', car.mesh.position, 2000);
    }
    if (car === this.targetCar) this.hud.showPhone('Vex: That is the Solace. Garage — now.', 3000);
    car.driver = 'player';
    car.occupied = true;
    this.player.inCar = car;
    this.player.mesh.visible = false;
    this.traffic.cars = this.traffic.cars.filter((c) => c !== car);
    this.traffic.parked = this.traffic.parked.filter((c) => c !== car);
    if (!silent) this.audio.doorSlam();
  }

  spawnFleeingDriver(car) {
    // Reuse the pedestrian system: teleport a far pedestrian in as the driver.
    const pp = this.playerPos();
    let candidate = null;
    let bestD = -1;
    for (const ped of this.pedestrians.peds) {
      const d = Math.hypot(ped.x - pp.x, ped.z - pp.z);
      if (d > bestD) { bestD = d; candidate = ped; }
    }
    if (candidate) {
      candidate.mesh.position.set(car.x + 1.6, 0, car.z + 0.6);
      candidate.scare(car.mesh.position, 5);
    }
    return candidate;
  }

  exitCar(silent) {
    const car = this.player.inCar;
    if (!car) return;
    car.driver = null;
    car.occupied = false;
    car.speed = 0;
    this.traffic.parked.push(car);
    const side = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
    this.player.placeAt(car.x + side.x * 2.2, car.z + side.z * 2.2, car.heading);
    this.player.inCar = null;
    this.player.mesh.visible = true;
    if (!silent) this.audio.doorSlam();
    this.audio.setEngine(-1);
  }

  ensureTargetCar() {
    if (this.targetCar) return;
    const car = new Vehicle('coupe', 0xff2e88, TARGET_CAR_SPOT.x, TARGET_CAR_SPOT.z, 0.4);
    car.driver = null;
    car.isTarget = true;
    scene.add(car.mesh);
    this.targetCar = car;
    this.traffic.parked.push(car);
  }

  /** Health-zero cars become wrecks (vehicles.js): smoke, stop, and if Rook
   *  was driving, put him on the street. Wrecks near the player keep smoking. */
  checkWrecks() {
    const pp = this.playerPos();
    for (const car of this.allVehicles()) {
      if (car.health <= 0 && !car.wrecked) {
        const wasPlayerCar = this.player.inCar === car;
        car.makeWreck();
        this.combat.particles.burst(new THREE.Vector3(car.x, 1, car.z), 0x888899, 12, 3, 3);
        if (wasPlayerCar) {
          this.exitCar(true);
          this.hud.showPhone('That car is wrecked — it will not drive again.', 3200);
        }
      } else if (car.wrecked && Math.hypot(car.x - pp.x, car.z - pp.z) < 32 && Math.random() < 0.06) {
        this.combat.particles.smoke(new THREE.Vector3(car.x, 1.2, car.z));
      }
    }
  }

  // ---- save / start ----------------------------------------------------------
  saveProgress() {
    const p = this.playerPos();
    writeSave({
      cash: this.cash,
      missionIndex: this.missions.index,
      missionsDone: this.missions.index >= 6,
      x: p.x, z: p.z,
      heading: this.playerHeading(),
      totalEarned: this.cash,
      cachesCollected: this.activities.cachesCollected,
      weaponId: this.combat.weaponId,
    });
    this.hud.setCash(this.cash);
  }

  newGame() {
    clearSave();
    this.cash = 250;
    this.player.placeAt(-140, 150, 0.6);
    this.player.health = PLAYER_MAX_HEALTH;
    this.police.clearWanted();
    this.helicopter.hide();
    this.activities.reset();
    this.weapons.reset();
    this.combat.setWeapon('pistol');
    this.missions.start(0, false);
    this.hud.setCash(this.cash);
    this.hud.setObjective(this.missions.objectiveText());
  }

  continueGame() {
    const data = loadSave();
    if (!data) { this.newGame(); return; }
    this.cash = data.cash;
    this.player.placeAt(data.x, data.z, data.heading);
    this.player.health = PLAYER_MAX_HEALTH;
    this.police.clearWanted();
    this.helicopter.hide();
    this.activities.setCollected(data.cachesCollected || 0);
    if (data.weaponId === 'smg') this.combat.setWeapon('smg');
    this.missions.start(Math.min(data.missionIndex, 6), false);
    this.hud.setCash(this.cash);
    this.hud.setObjective(this.missions.objectiveText());
  }

  dismissStartScreen() {
    document.getElementById('start-screen').style.display = 'none';
    if (this.state === 'menu') this.state = 'playing';
  }

  showStartScreen() {
    document.getElementById('start-screen').style.display = 'flex';
    this.state = 'menu';
  }

  orbitCameraTo(pos, yaw, dist) {
    this.camYaw = yaw;
    camera.position.set(
      pos.x + Math.sin(yaw) * dist,
      3.4,
      pos.z + Math.cos(yaw) * dist,
    );
    camera.lookAt(pos.x, 1.6, pos.z);
  }
}

const game = new Game();
window.__game = game;

// Tag meshes with owners for the combat raycast.
for (const ped of game.pedestrians.peds) ped.mesh.userData.owner = { type: 'ped', ref: ped };
setInterval(() => {
  for (const ped of game.pedestrians.peds) if (!ped.mesh.userData.owner) ped.mesh.userData.owner = { type: 'ped', ref: ped };
  for (const o of game.police.officers) if (!o.mesh.userData.owner) o.mesh.userData.owner = { type: 'officer', ref: o };
  for (const car of game.allVehicles()) if (!car.mesh.userData.owner) car.mesh.userData.owner = { type: 'car', ref: car };
}, 700);

// ---- screens ---------------------------------------------------------------
const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const endScreen = document.getElementById('end-screen');
document.getElementById('continue-btn').style.display = hasSave() ? 'block' : 'none';

function beginPlay(fromContinue) {
  game.audio.start();
  startScreen.style.display = 'none';
  game.state = 'playing';
  if (fromContinue) game.continueGame();
  else game.newGame();
}

function showEndScreen(kind, text) {
  document.getElementById('end-title').textContent = kind;
  document.getElementById('end-title').style.color = kind === 'BUSTED' ? '#6db3ff' : '#ff4455';
  document.getElementById('end-text').textContent = text;
  endScreen.style.display = 'flex';
}

document.getElementById('new-game-btn').addEventListener('click', () => beginPlay(false));
document.getElementById('continue-btn').addEventListener('click', () => beginPlay(true));
document.getElementById('respawn-btn').addEventListener('click', () => game.respawnAfterEnd());
document.getElementById('resume-btn').addEventListener('click', () => {
  pauseScreen.style.display = 'none';
  game.state = 'playing';
});
document.getElementById('save-btn').addEventListener('click', () => {
  game.saveProgress();
  game.hud.showPhone('Progress saved.', 2200);
});
document.getElementById('restart-btn').addEventListener('click', () => {
  pauseScreen.style.display = 'none';
  game.newGame();
  game.state = 'playing';
});

// ---- input -------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  game.keys[e.code] = true;
  if (game.state === 'playing') {
    if (e.code === 'KeyE' || e.code === 'KeyF') {
      // Iter2: E in the spray bay (while driving, wanted) starts a respray
      // instead of exiting the car.
      if (e.code === 'KeyE' && game.player.inCar && game.garage.canUse()) {
        game.garage.startSpray();
      } else if (game.player.inCar) game.exitCar(false);
      else if (game.nearestEnterable()) game.enterCar(game.nearestEnterable(), false);
      else if (e.code === 'KeyF') game.combat.punch(game); // F punches only with no car in reach
    }
    if (e.code === 'KeyR') game.combat.tryReload(performance.now());
    if (e.code === 'Escape') {
      pauseScreen.style.display = 'flex';
      game.state = 'paused';
    }
  } else if (game.state === 'paused' && e.code === 'Escape') {
    pauseScreen.style.display = 'none';
    game.state = 'playing';
  }
});
window.addEventListener('keyup', (e) => { game.keys[e.code] = false; });
canvas.addEventListener('mousedown', (e) => {
  game.audio.start();
  if (game.state !== 'playing') return;
  if (document.pointerLockElement !== canvas) {
    canvas.requestPointerLock?.();
    return;
  }
  if (e.button === 0 && !game.player.inCar) {
    game.combat.shoot(performance.now(), game.playerPos());
  }
});
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas && game.state === 'playing') {
    game.camYaw -= e.movementX * 0.0032;
    game.camPitch = clamp(game.camPitch + e.movementY * 0.0024, 0.06, 1.15);
  }
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- per-frame update ----------------------------------------------------------
function inputVector() {
  const k = game.keys;
  return {
    f: !!k.KeyW || !!k.ArrowUp,
    b: !!k.KeyS || !!k.ArrowDown,
    l: !!k.KeyA || !!k.ArrowLeft,
    r: !!k.KeyD || !!k.ArrowRight,
    sprint: !!k.ShiftLeft || !!k.ShiftRight,
  };
}

function driveInput() {
  const k = game.keys;
  return {
    throttle: (k.KeyW || k.ArrowUp ? 1 : 0) + (k.KeyS || k.ArrowDown ? -1 : 0),
    steer: (k.KeyA || k.ArrowLeft ? -1 : 0) + (k.KeyD || k.ArrowRight ? 1 : 0),
    handbrake: !!k.Space,
  };
}

let lastTime = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (dt <= 0) dt = 0.016;
  updateGame(dt, now);
  if (game.shotTimer > 0) {
    game.shotTimer -= dt;
    if (game.shotTimer <= 0) {
      game.shotTimer = -1;
      window.__shotReady = true;
    }
  }
  renderer.render(scene, camera);
}

function updateGame(dt, now) {
  game.elapsed += dt;
  const playing = game.state === 'playing';
  const pp = game.playerPos();
  // Iter2: the clock always advances while the game runs (menu included,
  // so the start screen sits over a living sky); the HUD clock reads it.
  game.daynight.update(dt);
  game.hud.setClock(game.daynight.timeString());

  if (playing) {
    // Player: on foot or driving.
    if (game.player.inCar) {
      const car = game.player.inCar;
      car.drive(dt, driveInput(), 1);
      game.audio.setEngine(clamp(Math.abs(car.speed) / 34, 0, 1));
      if (car.crashImpulse > 7) {
        game.combat.addShake(clamp(car.crashImpulse / 16, 0.2, 0.9));
        game.audio.crash(car.crashImpulse);
        if (car.crashImpulse > 15) game.hurtPlayer(4);
      }
      game.hud.setSpeed(Math.abs(car.speed) * 3.6, true);
    } else {
      game.player.update(dt, inputVector(), game.camYaw);
      game.audio.setEngine(-1);
      game.hud.setSpeed(0, false);
    }
    // World systems.
    const vehicles = game.allVehicles();
    game.traffic.update(dt, pp, vehicles, null);
    game.pedestrians.update(dt, game);
    game.police.update(dt, game.playerPos(), game.playerSpeed(), !!game.player.inCar);
    // Iter1 systems: helicopter pursuit, side activities, weapon crates.
    game.helicopter.update(dt, game.playerPos(), game.police.stars);
    game.activities.update(dt, game.playerPos(), !!game.player.inCar);
    game.weapons.update(game.playerPos());
    // Iter2: pay-n-spray garage (bay state + spray timer).
    game.garage.update(dt, game.playerPos(), !!game.player.inCar);
    game.checkWrecks();
    // Car-to-car collisions.
    for (let i = 0; i < vehicles.length; i += 1) {
      for (let j = i + 1; j < vehicles.length; j += 1) {
        const impact = vehicles[i].collideWith(vehicles[j]);
        if (impact > 8) {
          const a = vehicles[i];
          const b = vehicles[j];
          if ((a.driver === 'player' || b.driver === 'player')) {
            game.combat.addShake(0.4);
            game.audio.crash(impact);
            if (b.kind === 'police' || a.kind === 'police') game.reportCrime('hitPolice', game.playerPos(), 2500);
          }
        }
      }
    }
    // Cars vs pedestrians (player-driven hits are crimes).
    for (const car of vehicles) {
      if (Math.abs(car.speed) < 3) continue;
      for (const ped of game.pedestrians.peds) {
        if (ped.fallen) continue;
        if (Math.hypot(ped.x - car.x, ped.z - car.z) < 2.0) {
          ped.damage(70, car.driver === 'player' ? game : null);
          if (car.driver === 'player' && game.crimeSeenBy(ped.mesh.position, 30)) {
            game.reportCrime('hitPedestrian', ped.mesh.position, 1500);
          }
          game.combat.particles.burst(new THREE.Vector3(ped.x, 1, ped.z), 0xff8866, 8, 3, 3);
        }
      }
      if (car.crashImpulse > 0) car.crashImpulse = 0;
    }
    // Missions + HUD refresh.
    const inTarget = !!game.player.inCar && game.player.inCar === game.targetCar;
    game.missions.update(dt, game.playerPos(), inTarget);
    game.hud.setObjective(game.missions.objectiveText());
    game.hud.setMissionTitle(game.missions.current ? game.missions.current.title : 'Free Roam');
    game.hud.setHealth(game.player.health / PLAYER_MAX_HEALTH);
    game.hud.setStars(game.police.stars);
    game.hud.setBust(game.police.bustMeter);
    game.hud.setWeapon(game.combat.weapon.name, game.combat.ammo, game.combat.reserve, !game.player.inCar);
    game.hud.setCaches(game.activities.cachesCollected, game.activities.cachesTotal);
    game.hud.setHeli(game.helicopter.active);
    const near = game.player.inCar ? null : game.nearestEnterable();
    const garagePrompt = game.garage.getPrompt();
    game.hud.setPrompt(garagePrompt || (game.player.inCar ? 'F — Exit vehicle' : near ? 'E — Enter vehicle' : ''));
    // Slow health regen out of trouble.
    game.regenTimer += dt;
    if (game.regenTimer > 4 && game.police.stars === 0 && game.player.health > 0) {
      game.regenTimer = 0;
      game.player.heal(3);
    }
  }

  // Camera: third-person orbit follow.
  const target = game.player.inCar
    ? new THREE.Vector3(game.player.inCar.x, 1.6, game.player.inCar.z)
    : new THREE.Vector3(game.player.x, 1.7, game.player.z);
  if (game.player.inCar && game.state !== 'menu') {
    // While driving, ease the orbit behind the car when moving.
    const car = game.player.inCar;
    if (Math.abs(car.speed) > 4 && document.pointerLockElement !== canvas && !game.shotMode) {
      const behind = car.heading;
      let delta = ((behind - game.camYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      game.camYaw += delta * Math.min(1, dt * 1.6);
    }
  }
  const dist = game.player.inCar ? 10.5 : 7.5;
  const shake = game.combat.shakeOffset();
  const camX = target.x + Math.sin(game.camYaw) * Math.cos(game.camPitch) * dist + shake.x;
  const camZ = target.z + Math.cos(game.camYaw) * Math.cos(game.camPitch) * dist + shake.y;
  const camY = target.y + Math.sin(game.camPitch) * dist + 0.6;
  camera.position.lerp(new THREE.Vector3(camX, Math.max(1.2, camY), camZ), game.state === 'menu' ? 1 : 0.35);
  camera.lookAt(target.x, target.y + 0.4, target.z);

  // Shared headlight follows the driven car, off on foot.
  if (game.player.inCar) {
    const car = game.player.inCar;
    const fx = -Math.sin(car.heading);
    const fz = -Math.cos(car.heading);
    game.headlight.intensity = Math.round(900 * game.daynight.headlightFactor());
    game.headlight.position.set(car.x + fx * 2, 1.1, car.z + fz * 2);
    game.headlightTarget.position.set(car.x + fx * 20, 0, car.z + fz * 20);
  } else {
    game.headlight.intensity = 0;
  }
  game.combat.update(now);
  game.combat.particles.update(dt);
  if (game.city.ocean) game.city.ocean.position.y = -0.4 + Math.sin(game.elapsed * 0.7) * 0.08;
  game.minimap.draw(game);
}

// ---- boot -----------------------------------------------------------------------
if (isShotMode()) {
  game.cash = 1250;
  game.hud.setCash(game.cash);
  game.shotMode = true;
  const simSeconds = stageShot(game, shotName());
  if (shotName() !== 'start') {
    game.state = 'playing';
    // Fixed-step warm-up: simulate the staged scene deterministically, so the
    // captured frame shows real action (traffic rolling, police closing in)
    // no matter how slow the capturing machine renders.
    let fakeNow = performance.now();
    for (let t = 0; t < simSeconds; t += 1 / 30) {
      fakeNow += 33;
      updateGame(1 / 30, fakeNow);
    }
  }
  window.__shotReady = true;
} else {
  game.hud.setCash(game.cash);
  game.hud.showPhone('', 1);
  document.getElementById('phone').style.display = 'none';
}
requestAnimationFrame(frame);
