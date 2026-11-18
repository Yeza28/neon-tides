// Neon Tides — weapons: pistol and SMG definitions plus weapon-crate pickups.
// The SMG is the iter1 upgrade: faster fire, a 30-round mag and more damage
// per second than the pistol, found in three orange crates around Port Vireo.
// Combat reads the current weapon def, so fire rate, mag size, range and
// damage all follow whichever weapon Rook is carrying.

import * as THREE from '../vendor/three/three.module.min.js';

export const WEAPONS = {
  pistol: { id: 'pistol', name: 'PISTOL', damage: 34, magazine: 12, reserveStart: 60, fireMs: 190, range: 90 },
  smg: { id: 'smg', name: 'SMG', damage: 22, magazine: 30, reserveStart: 90, fireMs: 95, range: 80 },
};

// Crates sit on sidewalks near landmarks Rook already knows: the depot, the
// marina and the beach hideout, so a player exploring the story finds them.
export const WEAPON_CRATE_SPOTS = [
  { x: -168, z: -152 }, // by Vex's depot, south-west
  { x: 176, z: -112 }, // by the marina, north-east shore
  { x: 196, z: 84 }, // by the beach hideout, east shore
];

export class WeaponCrates {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.crates = WEAPON_CRATE_SPOTS.map((spot) => {
      const group = new THREE.Group();
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.8, 1.1),
        new THREE.MeshLambertMaterial({ color: 0xff8c42 }),
      );
      box.position.y = 0.4;
      group.add(box);
      const lid = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.14, 1.2),
        new THREE.MeshLambertMaterial({ color: 0x2a2e38 }),
      );
      lid.position.y = 0.86;
      group.add(lid);
      // A gun silhouette on the lid, so the crate reads as a weapon cache.
      const barrel = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.1, 0.16),
        new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
      );
      barrel.position.y = 0.96;
      group.add(barrel);
      group.position.set(spot.x, 0, spot.z);
      scene.add(group);
      return { x: spot.x, z: spot.z, mesh: group, taken: false };
    });
  }

  get remaining() { return this.crates.filter((c) => !c.taken).length; }

  /** Rook walks over a crate to swap the pistol for the SMG. */
  update(playerPos) {
    for (const crate of this.crates) {
      if (crate.taken) continue;
      crate.mesh.rotation.y += 0.008;
      if (Math.hypot(playerPos.x - crate.x, playerPos.z - crate.z) < 2.4) {
        crate.taken = true;
        crate.mesh.visible = false;
        this.game.combat.setWeapon('smg');
        this.game.audio.pickup();
        this.game.hud.showPhone('SMG acquired — 30-round mag, faster fire. Vex approves.', 3600);
      }
    }
  }

  /** A fresh story run restocks every crate. */
  reset() {
    for (const crate of this.crates) {
      crate.taken = false;
      crate.mesh.visible = true;
    }
  }
}
