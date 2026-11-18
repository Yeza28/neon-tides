// Neon Tides — the story chain: six jobs for the fixer Vex, then free roam.
// Rook, an out-of-town wheelman, works off a debt to Vex job by job: a dock
// pickup, a timed cross-town delivery, stealing the marked "Solace" coupe for
// a buyer, a marina ambush he has to survive, a five-star harbor run under
// the police helicopter, and a three-star getaway to the beach hideout. Each
// mission is a list of steps with a glowing world marker, a minimap blip,
// phone messages from Vex, a cash reward, and fail/retry on timeout, BUSTED
// or WASTED. The 'survive' step action (iter1) holds Rook in place against
// waves of officers until its clock runs out.

import * as THREE from '../vendor/three/three.module.min.js';
import { BLOCK_PITCH, CITY_EDGE, roadCoord } from './config.js';

export const HIDEOUT = { x: CITY_EDGE + 18, z: -roadCoord(2) };
export const DOCKS = { x: CITY_EDGE + 30, z: roadCoord(3) + 10 };
export const DEPOT = { x: roadCoord(-3) + 6, z: roadCoord(-3) + 16 };
export const MIDTOWN = { x: roadCoord(0) + 12, z: roadCoord(1) + 12 };
export const TARGET_CAR_SPOT = { x: roadCoord(2) + 10, z: roadCoord(-1) + 14 };
export const GARAGE = { x: roadCoord(-2) + 12, z: roadCoord(2) + 12 };
export const MARINA = { x: CITY_EDGE + 14, z: roadCoord(-2) }; // north-east marina, ambush site
export const NORTH_PIER = { x: roadCoord(1) + 8, z: roadCoord(-3) - 6 };

export const MISSIONS = [
  {
    id: 'pickup',
    title: 'First Run',
    reward: 400,
    intro: 'Vex: Rook. You owe me, so you drive. Package waiting at Pier 9 docks, south-east shore. Pick it up, bring it to my depot across town. No questions.',
    steps: [
      { text: 'Pick up the package at Pier 9 docks', at: DOCKS, radius: 6, action: 'reach' },
      { text: 'Deliver the package to Vex\'s depot', at: DEPOT, radius: 7, action: 'reach' },
    ],
    outro: 'Vex: Clean. Maybe you are worth the debt after all. +$400',
  },
  {
    id: 'rush',
    title: 'Rush Hour',
    reward: 650,
    timeLimit: 95,
    intro: 'Vex: A client in Midtown needs documents before his boat leaves. Clock is running — the pier gate, then Midtown. Fast, not fancy.',
    steps: [
      { text: 'Grab the documents at the pier gate', at: { x: CITY_EDGE + 12, z: roadCoord(3) + 10 }, radius: 6, action: 'reach' },
      { text: 'Deliver to the client in Midtown — hurry!', at: MIDTOWN, radius: 7, action: 'reach' },
    ],
    outro: 'Vex: Boat made it. Client pays double next time. +$650',
  },
  {
    id: 'solace',
    title: 'The Solace Job',
    reward: 900,
    intro: 'Vex: Buyer wants a specific car: the magenta Solace coupe parked near Palm Row, east side. Take it, bring it to the garage. Expect attention.',
    steps: [
      { text: 'Steal the marked Solace coupe', at: TARGET_CAR_SPOT, radius: 8, action: 'stealTarget' },
      { text: 'Deliver the Solace to the garage', at: GARAGE, radius: 8, action: 'deliverTarget' },
    ],
    outro: 'Vex: Buyer is thrilled. You have a gift, Rook. +$900',
  },
  {
    id: 'ambush',
    title: 'Marina Ambush',
    reward: 1100,
    intro: 'Vex: It was a setup, Rook. The buyer\'s crew is waiting at the marina with badges on their side. Get there, hold the pier for sixty seconds, then run north. Use the SMG crates if you found one.',
    steps: [
      { text: 'Reach the marina ambush point', at: MARINA, radius: 7, action: 'reach' },
      { text: 'Survive the ambush — hold the marina for 60s', at: MARINA, radius: 16, action: 'survive', surviveSeconds: 60 },
      { text: 'Escape to the north pier', at: NORTH_PIER, radius: 7, action: 'reach' },
    ],
    outro: 'Vex: Sixty seconds against the whole marina and you walked out. +$1,100',
  },
  {
    id: 'harbor',
    title: 'Harbor Run',
    reward: 1200,
    intro: 'Vex: One more loud one before the finale. The harbor docks, five stars, the air unit already up. Reach the docks, then lose yourself at the beach hideout. Do not let the helicopter pin you.',
    steps: [
      { text: 'Reach the harbor docks with five stars on you', at: DOCKS, radius: 9, action: 'reach', heat: 5 },
      { text: 'Lose the heat at the beach hideout', at: HIDEOUT, radius: 9, action: 'reach' },
    ],
    outro: 'Vex: Five stars and a helicopter, and you still made the docks. +$1,200',
  },
  {
    id: 'getaway',
    title: 'Neon Getaway',
    reward: 1400,
    intro: 'Vex: Last job. The drop went loud — every badge in Port Vireo is awake. Lose yourself at the beach hideout, north-east shore. Survive the ride.',
    steps: [
      { text: 'Reach the beach hideout with the heat on you', at: HIDEOUT, radius: 9, action: 'reach', heat: 3 },
    ],
    outro: 'Vex: Debt paid, Rook. Port Vireo is yours now — the city, the tides, all of it. Free roam: earn, explore, stay ahead of the PVPD.',
  },
];

export class MissionManager {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.index = 0;
    this.stepIndex = 0;
    this.active = false;
    this.done = false;
    this.timeLeft = 0;
    this.surviveLeft = 0; // countdown for 'survive' steps (ambush)
    this.surviveSpawnTimer = 0;
    this.targetCar = null;
    // Glowing marker: light beam + ground ring, bobbing in the world.
    this.marker = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 26, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 13;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.4, 28),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    this.marker.add(beam, ring);
    this.marker.visible = false;
    scene.add(this.marker);
  }

  get current() { return this.done ? null : MISSIONS[this.index] || null; }
  get step() {
    const m = this.current;
    return m ? m.steps[this.stepIndex] || null : null;
  }

  start(index, silent) {
    this.index = index;
    this.stepIndex = 0;
    this.done = index >= MISSIONS.length;
    this.active = !this.done;
    const m = this.current;
    if (!m) {
      this.marker.visible = false;
      if (!silent) this.game.hud.showPhone('Vex: Free roam. The city is yours, Rook.');
      return;
    }
    this.timeLeft = m.timeLimit || 0;
    if (!silent) {
      this.game.hud.showPhone(m.intro);
      this.game.audio.phoneBuzz();
    }
    this.applyStep();
  }

  applyStep() {
    const step = this.step;
    if (!step) return;
    this.marker.position.set(step.at.x, 0, step.at.z);
    this.marker.visible = true;
    if (step.heat) this.game.police.setWanted(step.heat);
    if (step.action === 'stealTarget') this.game.ensureTargetCar();
    if (step.action === 'survive') {
      // Hold the ground: three stars, officers already closing in.
      this.surviveLeft = step.surviveSeconds || 60;
      this.surviveSpawnTimer = 0;
      this.game.police.setWanted(3);
      this.game.police.spawnOfficerNear(step.at);
      this.game.police.spawnOfficerNear(step.at);
      this.game.hud.setTimer(this.surviveLeft);
    }
    this.game.hud.setObjective(step.text);
  }

  /** Called every frame with the player's effective position (foot or car). */
  update(dt, pos, inTargetCar) {
    if (!this.active) return;
    const m = this.current;
    const step = this.step;
    if (!m || !step) return;
    this.marker.rotation.y += dt * 0.8;
    if (m.timeLimit) {
      this.timeLeft -= dt;
      this.game.hud.setTimer(this.timeLeft);
      if (this.timeLeft <= 0) {
        this.fail('Time up. Vex is not pleased.');
        return;
      }
    }
    const d = Math.hypot(pos.x - step.at.x, pos.z - step.at.z);
    if (step.action === 'survive') {
      // The clock, not the marker, ends this step: keep officers coming
      // while Rook holds the ground, and fail him if he runs too far.
      this.surviveLeft -= dt;
      this.game.hud.setTimer(this.surviveLeft);
      this.surviveSpawnTimer -= dt;
      if (this.surviveSpawnTimer <= 0) {
        this.surviveSpawnTimer = 4;
        if (this.game.police.officers.length < 4) this.game.police.spawnOfficerNear(step.at);
      }
      if (this.surviveLeft <= 0) {
        this.game.hud.setTimer(-1);
        this.advance();
      } else if (d > step.radius + 18) {
        this.fail('You abandoned the marina. Vex is not pleased.');
      }
      return;
    }
    if (step.action === 'reach' && d < step.radius) this.advance();
    else if (step.action === 'stealTarget' && inTargetCar) this.advance();
    else if (step.action === 'deliverTarget' && inTargetCar && d < step.radius) this.advance();
  }

  advance() {
    const m = this.current;
    this.game.audio.pickup();
    this.stepIndex += 1;
    if (this.stepIndex >= m.steps.length) {
      this.complete();
    } else {
      this.game.hud.showPhone('Vex: Good. Next leg — follow the marker.');
      this.applyStep();
    }
  }

  complete() {
    const m = this.current;
    this.active = false;
    this.marker.visible = false;
    this.game.addCash(m.reward);
    this.game.audio.success();
    this.game.hud.showPhone(m.outro);
    this.game.hud.setObjective('');
    this.game.hud.setTimer(-1);
    this.index += 1;
    this.game.saveProgress();
    const next = this;
    setTimeout(() => {
      if (!next.game.isGameOver()) next.start(next.index, false);
    }, 4200);
  }

  fail(reason) {
    this.active = false;
    this.marker.visible = false;
    this.game.audio.fail();
    this.game.hud.setTimer(-1);
    this.game.hud.showPhone(`${reason} Retry from the top of the job.`);
    const idx = this.index;
    const self = this;
    setTimeout(() => {
      if (!self.game.isGameOver()) self.start(idx, false);
    }, 2600);
  }

  objectiveText() {
    const m = this.current;
    const step = this.step;
    if (this.done) return 'Free roam — Port Vireo is yours';
    if (!m || !step) return '';
    return `${m.title}: ${step.text}`;
  }
}
