// Neon Tides — screenshot scenes behind ?shot=drive|chase|foot|start.
// Each scene stages the real game (same world, same systems) into a readable
// frame: the player driving a neon street with traffic, a four-star police
// chase, Rook on foot at a mission marker, and the start screen over the city.
// After the scene has simulated for a few seconds the page sets
// window.__shotReady = true so the capture tool knows the frame is staged.

export const SHOT_NAMES = ['drive', 'chase', 'foot', 'start'];

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
  if (name === 'foot') {
    // Rook on foot in the city, closing on the marked Solace coupe: the gold
    // mission beam, the target car, pedestrians and the skyline in one frame.
    game.missions.start(2, true);
    const step = game.missions.step;
    player.placeAt(step.at.x - 6, step.at.z + 6, -0.78);
    game.camYaw = -0.78;
    game.camPitch = 0.3;
    game.hud.showPhone('Vex: Buyer wants that magenta Solace coupe, east side. Take it, bring it to the garage.', 60000);
    game.hud.setObjective(game.missions.objectiveText());
    for (let i = 0; i < 6; i += 1) {
      const ped = game.pedestrians.peds[i];
      if (ped) ped.mesh.position.set(step.at.x - 12 + i * 2.6, 0, step.at.z + 10 + (i % 2) * 2.4);
    }
    return 1.4;
  }
  if (name === 'chase') {
    // Four stars: Rook in a coupe on a main avenue, interceptors right behind.
    // The camera sits ahead of Rook's car looking back, so the frame holds the
    // player car, the flashing pursuit and the avenue in one shot.
    const car = game.traffic.cars[0] || game.traffic.parked[0];
    car.mesh.position.set(-56, 0, 30);
    car.heading = Math.PI; // facing +Z along the avenue
    car.speed = 15;
    game.enterCar(car, true);
    game.police.clearWanted();
    game.camYaw = 0; // ahead of the car, looking back down the avenue
    game.camPitch = 0.3;
    game.police.setWanted(4);
    game.police.spawnCarNear({ x: -56, z: 10 });
    game.police.spawnCarNear({ x: -50, z: 2 });
    const c1 = game.police.cars[0];
    const c2 = game.police.cars[1];
    if (c1) { c1.mesh.position.set(-59.5, 0, 13); c1.heading = Math.PI; c1.speed = 14; }
    if (c2) { c2.mesh.position.set(-50.5, 0, 4); c2.heading = Math.PI; c2.speed = 13; }
    game.missions.start(2, true);
    game.hud.setObjective('The Solace Job: Deliver the Solace to the garage');
    game.hud.showPhone('Vex: They are on you, Rook — lose them and bring me that car!', 60000);
    return 1.7;
  }
  // drive (the cover): golden-hour cruise down the neon avenue with traffic.
  const car = game.traffic.cars[1] || game.traffic.cars[0];
  car.mesh.position.set(0, 0, 84);
  car.heading = Math.PI;
  car.speed = 11;
  game.enterCar(car, true);
  game.police.clearWanted();
  game.camYaw = car.heading;
  game.camPitch = 0.24;
  // Traffic companions ahead and alongside for depth.
  const others = game.traffic.cars.filter((c) => c !== car).slice(0, 4);
  const spots = [[-3.4, 52], [3.4, 30], [-3.4, 108], [3.2, 130]];
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
