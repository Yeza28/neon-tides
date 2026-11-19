// Neon Tides — Port Vireo: a procedural neon coastal city built with three.js.
// A grid of roads with lane markings and sidewalks, varied flat-shaded buildings
// with lit-window canvas textures, canvas neon signs, streetlights, palm trees,
// beach props and an ocean edge. Buildings register AABB colliders used by the
// player, cars and AI alike.

import * as THREE from '../vendor/three/three.module.min.js';
import {
  BLOCK_PITCH, ROAD_HALF, GRID_MIN, GRID_MAX, CITY_EDGE, OCEAN_X,
  NEON_COLORS, mulberry32, roadCoord,
} from './config.js';

export const colliders = []; // {minX, maxX, minZ, maxZ}
export const roadLines = []; // road centrelines for minimap + AI: {axis:'x'|'z', at:number}

function makeWindowTexture(rng, base, litRatio) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 122; y += 12) {
    for (let x = 6; x < 58; x += 12) {
      const lit = rng() < litRatio;
      g.fillStyle = lit ? (rng() < 0.25 ? '#ffd9a0' : '#bfe9ff') : '#141a26';
      g.fillRect(x, y, 7, 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSignTexture(text, colorCss) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#0b0e18';
  g.fillRect(0, 0, 256, 64);
  g.font = 'bold 34px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = colorCss;
  g.shadowBlur = 18;
  g.fillStyle = colorCss;
  g.fillText(text, 128, 34);
  g.shadowBlur = 6;
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRoadTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3f4c';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#454b5a';
  for (let i = 0; i < 90; i += 1) g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const SIGN_WORDS = ['TIDES', 'HOTEL LUMA', 'RAMEN', 'VIREO BAY', 'CLUB NOVA', 'PIER 9', 'CASINO SOL', 'BAR MAREA', 'TACO SUR', 'HOTEL REEF', 'DISCO LUNA', 'SURF SHOP', 'NEON TIDES', 'SPRAY SHOP', 'HOTEL AZUL', 'KARAOKE', 'BODEGA 24', 'TATTOO INK'];
const BUILDING_BASES = ['#3a4152', '#4a3f4d', '#2f3e4d', '#51463a', '#3d3550', '#2e4a44', '#5a4250', '#39435c'];

export function buildCity(scene) {
  const rng = mulberry32(20261117);
  const group = new THREE.Group();
  scene.add(group);
  const span = (GRID_MAX - GRID_MIN) * BLOCK_PITCH + ROAD_HALF * 2 + 90;

  // Ground: city slab, then sand and water to the east.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(span + 260, span + 120),
    new THREE.MeshLambertMaterial({ color: 0x424a58 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(20, -0.05, 0);
  group.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(70, span + 120),
    new THREE.MeshLambertMaterial({ color: 0xd9b380 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(CITY_EDGE + 30, 0.0, 0);
  group.add(sand);

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(420, span + 300),
    new THREE.MeshPhongMaterial({ color: 0x0e5f7a, shininess: 120, specular: 0x99ddff }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(OCEAN_X + 190, -0.4, 0);
  ocean.name = 'ocean';
  group.add(ocean);

  // Roads: dark strips along every grid line, both directions. Iter2: a
  // Phong road so headlights and neon read as a wet dusk street.
  const roadTex = makeRoadTexture();
  const roadMat = new THREE.MeshPhongMaterial({ map: roadTex, color: 0xffffff, shininess: 60, specular: 0x334455 });
  const roadLen = (GRID_MAX - GRID_MIN) * BLOCK_PITCH + ROAD_HALF * 4;
  for (let i = GRID_MIN; i <= GRID_MAX; i += 1) {
    const at = roadCoord(i);
    roadLines.push({ axis: 'z', at }, { axis: 'x', at });
    const alongZ = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, roadLen), roadMat);
    alongZ.rotation.x = -Math.PI / 2;
    alongZ.rotation.z = Math.PI / 2;
    alongZ.position.set(at, 0.02, 0);
    group.add(alongZ);
    const alongX = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, ROAD_HALF * 2), roadMat);
    alongX.rotation.x = -Math.PI / 2;
    alongX.position.set(0, 0.02, at);
    group.add(alongX);
    // Centre dashes: one InstancedMesh for every dash on both road directions,
    // so the whole city's lane markings cost two draw calls, not hundreds.
    const dashCount = Math.floor((roadLen - 10) / 9);
    if (!group.userData.dashMesh) {
      const total = (dashCount + 2) * (GRID_MAX - GRID_MIN + 1) * 2;
      const inst = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(0.35, 3.4),
        new THREE.MeshBasicMaterial({ color: 0xf5d76e }),
        total,
      );
      inst.userData.next = 0;
      group.userData.dashMesh = inst;
      group.add(inst);
    }
    const inst = group.userData.dashMesh;
    const m4 = new THREE.Matrix4();
    const rotFlat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const rotFlatSide = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2));
    const one = new THREE.Vector3(1, 1, 1);
    for (let d = -roadLen / 2 + 6; d < roadLen / 2 - 4; d += 9) {
      m4.compose(new THREE.Vector3(at, 0.04, d), rotFlat, one);
      inst.setMatrixAt(inst.userData.next, m4);
      inst.userData.next += 1;
      m4.compose(new THREE.Vector3(d, 0.04, at), rotFlatSide, one);
      inst.setMatrixAt(inst.userData.next, m4);
      inst.userData.next += 1;
    }
    inst.instanceMatrix.needsUpdate = true;
    // Sidewalk slabs flanking each road.
    const walkMat = new THREE.MeshLambertMaterial({ color: 0x767e8c });
    for (const side of [-1, 1]) {
      const w1 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.22, roadLen), walkMat);
      w1.position.set(at + side * (ROAD_HALF + 1.3), 0.11, 0);
      group.add(w1);
      const w2 = new THREE.Mesh(new THREE.BoxGeometry(roadLen, 0.22, 2.6), walkMat);
      w2.position.set(0, 0.11, at + side * (ROAD_HALF + 1.3));
      group.add(w2);
    }
  }

  // Buildings: one or two per block, varied height, lit windows, rooftop neon.
  const signMats = [];
  let signIndex = 0;
  const tallest = []; // iter2: rooftop billboards go on the tallest towers
  for (let bx = GRID_MIN; bx < GRID_MAX; bx += 1) {
    for (let bz = GRID_MIN; bz < GRID_MAX; bz += 1) {
      const cx = roadCoord(bx) + BLOCK_PITCH / 2;
      const cz = roadCoord(bz) + BLOCK_PITCH / 2;
      if (cx > CITY_EDGE - 20) continue; // keep the beachfront open
      const nearDock = bx <= GRID_MIN + 1 && bz >= GRID_MAX - 1;
      const w = 20 + rng() * 12;
      const d = 20 + rng() * 12;
      const h = nearDock ? 6 + rng() * 5 : 12 + rng() * rng() * 46;
      if (h > 34) tallest.push({ x: cx, z: cz, h, w, d });
      const base = BUILDING_BASES[Math.floor(rng() * BUILDING_BASES.length)];
      const tex = makeWindowTexture(rng, base, 0.42);
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(cx + (rng() - 0.5) * 4, h / 2, cz + (rng() - 0.5) * 4);
      group.add(mesh);
      colliders.push({ minX: mesh.position.x - w / 2, maxX: mesh.position.x + w / 2, minZ: mesh.position.z - d / 2, maxZ: mesh.position.z + d / 2 });
      // Roof trim in a neon colour.
      const neon = NEON_COLORS[Math.floor(rng() * NEON_COLORS.length)];
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.5, 0.5, d + 0.5),
        new THREE.MeshBasicMaterial({ color: neon }),
      );
      trim.position.set(mesh.position.x, h + 0.25, mesh.position.z);
      group.add(trim);
      // A readable neon sign on taller buildings.
      if (h > 20 && signIndex < SIGN_WORDS.length * 2) {
        const word = SIGN_WORDS[signIndex % SIGN_WORDS.length];
        signIndex += 1;
        const css = `#${neon.toString(16).padStart(6, '0')}`;
        const signMat = new THREE.MeshBasicMaterial({ map: makeSignTexture(word, css) });
        signMats.push(signMat);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(13, 3.2), signMat);
        const faceSouth = rng() < 0.5;
        if (faceSouth) {
          sign.position.set(mesh.position.x, h * 0.72, mesh.position.z + d / 2 + 0.15);
        } else {
          sign.rotation.y = Math.PI / 2;
          sign.position.set(mesh.position.x + w / 2 + 0.15, h * 0.72, mesh.position.z);
        }
        group.add(sign);
      }
    }
  }

  if (group.userData.dashMesh) group.userData.dashMesh.count = group.userData.dashMesh.userData.next;
  // Iter2: large rooftop billboards on the three tallest towers.
  tallest.sort((a, b) => b.h - a.h);
  const billboardWords = ['NEON TIDES', 'CASINO SOL', 'CLUB NOVA'];
  for (let i = 0; i < Math.min(3, tallest.length); i += 1) {
    const t = tallest[i];
    const css = `#${NEON_COLORS[i % NEON_COLORS.length].toString(16).padStart(6, '0')}`;
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 5),
      new THREE.MeshBasicMaterial({ map: makeSignTexture(billboardWords[i], css) }),
    );
    board.position.set(t.x, t.h + 3.4, t.z + t.d / 2 + 0.2);
    group.add(board);
    const boardBack = board.clone();
    boardBack.rotation.y = Math.PI;
    boardBack.position.z = t.z - t.d / 2 - 0.2;
    group.add(boardBack);
  }
  const lampGlowMat = buildPalmsAndLights(group, rng);
  buildBeachProps(group, rng);
  buildDocks(group);
  return { ocean, group, lampGlowMat };
}

function buildPalmsAndLights(group, rng) {
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e9e5b });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x30343c });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  // Iter2: one shared radial-glow material for every lamp; day/night sets
  // its opacity globally, so the lamps visibly switch on after dark.
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 64; glowCanvas.height = 64;
  const gg = glowCanvas.getContext('2d');
  const grad = gg.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,233,168,0.9)');
  grad.addColorStop(0.4, 'rgba(255,233,168,0.28)');
  grad.addColorStop(1, 'rgba(255,233,168,0)');
  gg.fillStyle = grad;
  gg.fillRect(0, 0, 64, 64);
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  const lampGlowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffe9a8, transparent: true, opacity: 0, depthWrite: false });
  for (let i = GRID_MIN; i <= GRID_MAX; i += 1) {
    for (let s = -3; s <= 3; s += 1) {
      const along = s * 44 + (rng() - 0.5) * 8;
      // Palm trees near the beach and scattered inland.
      if (rng() < 0.75) {
        const px = roadCoord(i) + ROAD_HALF + 4.5;
        const palm = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 6.5, 6), trunkMat);
        trunk.position.y = 3.25;
        trunk.rotation.z = (rng() - 0.5) * 0.16;
        palm.add(trunk);
        for (let leaf = 0; leaf < 6; leaf += 1) {
          const frond = new THREE.Mesh(new THREE.ConeGeometry(0.5, 4.6, 4), leafMat);
          const a = (leaf / 6) * Math.PI * 2;
          frond.position.set(Math.cos(a) * 1.5, 7.1, Math.sin(a) * 1.5);
          frond.rotation.z = Math.PI / 2.4;
          frond.rotation.y = -a;
          palm.add(frond);
        }
        palm.position.set(px, 0, along);
        group.add(palm);
      }
      // Streetlight poles on both road directions.
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6.4, 6), poleMat);
      pole.position.set(roadCoord(i) - ROAD_HALF - 1.2, 3.2, along + 20);
      group.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), lampMat);
      lamp.position.set(roadCoord(i) - ROAD_HALF - 1.2, 6.5, along + 20);
      group.add(lamp);
      const glow = new THREE.Sprite(lampGlowMat);
      glow.scale.set(7, 7, 1);
      glow.position.copy(lamp.position);
      group.add(glow);
    }
  }
  return lampGlowMat;
}

function buildBeachProps(group, rng) {
  // Umbrellas and crates on the sand.
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x9c7248 });
  for (let i = 0; i < 14; i += 1) {
    const ux = CITY_EDGE + 8 + rng() * 34;
    const uz = -150 + rng() * 300;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 5), crateMat);
    pole.position.set(ux, 1.3, uz);
    group.add(pole);
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(2.3, 0.8, 8),
      new THREE.MeshLambertMaterial({ color: NEON_COLORS[i % NEON_COLORS.length] }),
    );
    top.position.set(ux, 2.8, uz);
    group.add(top);
  }
}

function buildDocks(group) {
  // Wooden pier at the south-east: the package pickup point of mission 1.
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x7a5c38 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(46, 1.2, 10), woodMat);
  pier.position.set(CITY_EDGE + 34, 0.6, roadCoord(GRID_MAX) + 10);
  group.add(pier);
  const hut = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 8), new THREE.MeshLambertMaterial({ color: 0x4d5a68 }));
  hut.position.set(CITY_EDGE + 16, 3.1, roadCoord(GRID_MAX) + 10);
  group.add(hut);
  colliders.push({ minX: CITY_EDGE + 11.5, maxX: CITY_EDGE + 20.5, minZ: roadCoord(GRID_MAX) + 6, maxZ: roadCoord(GRID_MAX) + 14 });
  // Iter1: two harbor cranes over the docks, so the Harbor Run destination
  // reads as a working port — and the marina ambush site has a landmark.
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xffd23f });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x30343c });
  for (const [cx, cz] of [[CITY_EDGE + 8, roadCoord(GRID_MAX) - 18], [CITY_EDGE + 8, roadCoord(-2) - 6]]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(3, 26, 3), craneMat);
    tower.position.set(cx, 13, cz);
    group.add(tower);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 24), darkMat);
    jib.position.set(cx, 25, cz - 8);
    group.add(jib);
    const hook = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.MeshLambertMaterial({ color: 0xff2e88 }));
    hook.position.set(cx, 18, cz - 18);
    group.add(hook);
  }
}

/** Resolve a circle (x,z,radius) out of every building AABB; returns corrected [x,z]. */
export function collideCircle(x, z, radius) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx;
    const dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * radius;
        z = nz + (dz / d) * radius;
      } else {
        // Centre inside the box: push out along the smallest penetration axis.
        const left = x - c.minX;
        const right = c.maxX - x;
        const top = z - c.minZ;
        const bottom = c.maxZ - z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = c.minX - radius;
        else if (m === right) x = c.maxX + radius;
        else if (m === top) z = c.minZ - radius;
        else z = c.maxZ + radius;
      }
    }
  }
  return [x, z];
}

/** True when a point is inside any building footprint (with margin). */
export function insideBuilding(x, z, margin) {
  for (const c of colliders) {
    if (x > c.minX - margin && x < c.maxX + margin && z > c.minZ - margin && z < c.maxZ + margin) return true;
  }
  return false;
}
