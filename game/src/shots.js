// Neon Tides — screenshot scenes behind ?shot=drive|chase|combat|start.
// Each scene stages the real game (same world, same systems) into a readable
// frame: a golden-hour cruise with dense traffic, a five-star chase under the
// police helicopter, Rook on foot firing at officers in the marina ambush,
// and the start screen over the city. After the scene has simulated for a few
// seconds the page sets window.__shotReady = true so the capture tool knows
// the frame is staged.

import * as THREE from '../vendor/three/three.module.min.js';
import { MARINA } from './missions.js';

export const SHOT_NAMES = ['drive', 'chase', 'combat', 'start'];

export function isShotMode() {
  return new URLSearchParams(window.location.search).has('shot');
}

export function shotName() {
  const name = new URLSearchParams(window.location.search).get('shot');
  return SHOT_NAMES.includes(name) ? name : 'drive';
}

/** Stage the named scene on a freshly built game. Returns seconds to simulate. */
export function stageShot(game, name) {
  const player = game.player;
  game.dismissStartScreen();
  if (name === 'start') {
    game.showStartScreen();
    player.placeAt(-104, 118, 2.4);
    game.orbitCameraTo(player.pos, 2.4, 9);
    return 1.2;
  }
  if (name === 'combat') {
    // Iter1 combat scene: the Marina Ambush — Rook on foot at the marina,
    // firing at three closing officers, muzzle flash and tracer held on the
    // lead officer, the gold mission beam and the harbor cranes behind.
    game.missions.start(3, true);
    player.placeAt(MARINA.x - 8, MARINA.z + 6, -0.98);
    game.camYaw = -0.98;
    game.camPitch = 0.28;
    game.police.setWanted(3);
    const officers = [];
    for (let i = 0; i < 3; i += 1) {
      const o = game.police.spawnOfficerNear(player.pos);
      o.mesh.position.set(MARINA.x + 1 + i * 3.2, 0, MARINA.z - 1 - i * 2.2);
      officers.push(o);
    }
    // The staged shot: flash + tracer from Rook's gun to the lead officer,
    // re-aimed from the live camera every frame by Combat.update.
    const lead = officers[0];
    game.combat.stageMuzzleFlash(new THREE.Vector3(lead.mesh.position.x, 1.3, lead.mesh.position.z));
    game.hud.setObjective('Marina Ambush: Survive the ambush — hold the marina for 60s');
    game.hud.setTimer(47);
    game.hud.showPhone('Vex: They are on the pier, Rook — hold the marina, then run north!', 60000);
    return 1.4;
  }
  if (name === 'chase') {
    // Five stars: Rook in a coupe on a main avenue, the police helicopter
    // overhead with its searchlight on him, interceptors right behind. The
    // camera sits ahead of Rook's car looking back, so the frame holds the
    // player car, the helicopter beam, the flashing pursuit and the avenue.
    const car = game.traffic.cars[0] || game.traffic.parked[0];
    car.mesh.position.set(-56, 0, 30);
    car.heading = Math.PI; // facing +Z along the avenue
    car.speed = 15;
    game.enterCar(car, true);
    game.police.clearWanted();
    game.camYaw = 0; // ahead of the car, looking back down the avenue
    game.camPitch = 0.3;
    game.police.setWanted(5);
    game.helicopter.showForShot();
    // Fly the helicopter low and ahead of the car so it is actually in the
    // frame (at cruise height it sits above the camera's view), pinned over
    // the avenue — a circling helicopter drifts over the buildings and hides
    // behind them. Clear traffic out of the camera's sightline, keeping it
    // close enough that it does not respawn on top of the camera.
    game.helicopter.stageHeight = 14;
    game.helicopter.stageRadius = 34;
    game.helicopter.orbitRate = 0;
    game.helicopter.angle = -Math.PI / 2;
    game.camPitch = 0.18;
    game.helicopter.update(0.016, game.playerPos(), 5);
    game.traffic.cars.forEach((other, i) => {
      if (other === car) return;
      // Distant traffic down the avenue, ahead in the frame: close enough
      // (under 240 m) that the respawner leaves them alone.
      other.mesh.position.set(-56 + (i % 2 ? -3.4 : 3.4), 0, -70 - i * 10);
      other.heading = Math.PI;
      other.speed = 9;
    });
    game.police.spawnCarNear({ x: -56, z: 10 });
    game.police.spawnCarNear({ x: -50, z: 2 });
    game.police.spawnCarNear({ x: -62, z: 18 });
    const c1 = game.police.cars[0];
    const c2 = game.police.cars[1];
    const c3 = game.police.cars[2];
    if (c1) { c1.mesh.position.set(-59.5, 0, 13); c1.heading = Math.PI; c1.speed = 14; }
    if (c2) { c2.mesh.position.set(-50.5, 0, 4); c2.heading = Math.PI; c2.speed = 13; }
    if (c3) { c3.mesh.position.set(-62, 0, 22); c3.heading = Math.PI; c3.speed = 12; }
    game.missions.start(4, true);
    game.hud.setObjective('Harbor Run: Reach the harbor docks with five stars on you');
    game.hud.showPhone('Vex: Five stars and the air unit is up — lose them at the docks!', 60000);
    return 1.7;
  }
  // drive (the cover): golden-hour cruise down the neon avenue with dense traffic.
  const car = game.traffic.cars[1] || game.traffic.cars[0];
  car.mesh.position.set(0, 0, 84);
  car.heading = Math.PI;
  car.speed = 11;
  game.enterCar(car, true);
  game.police.clearWanted();
  game.camYaw = car.heading;
  game.camPitch = 0.24;
  // Traffic companions ahead, alongside and behind for depth: six cars.
  const others = game.traffic.cars.filter((c) => c !== car).slice(0, 6);
  const spots = [[-3.4, 52], [3.4, 30], [-3.4, 108], [3.2, 130], [-3.4, 10], [3.4, 150]];
  others.forEach((other, i) => {
    const [sx, sz] = spots[i % spots.length];
    other.mesh.position.set(sx, 0, sz);
    other.heading = other.ai && other.ai.dir > 0 ? Math.PI : 0;
    if (sz < 84) other.heading = Math.PI;
    other.speed = 9;
  });
  game.missions.start(1, true);
  game.hud.setObjective('Rush Hour: Deliver to the client in Midtown — hurry!');
  game.hud.setTimer(61);
  game.hud.showPhone('Vex: Client is waiting in Midtown. Fast, not fancy.', 60000);
  return 1.5;
}
