// Neon Tides — Iter2: day/night cycle for Port Vireo.
// A 24h clock advances while playing (1 game-hour per ~45s, starting at
// 17:30 golden hour). Keyframes drive the sun + hemisphere light, fog, the
// sky-dome gradient, a sun disc by day and a moon disc by night, and the
// lamp/neon glow factor the city reads each frame. The HUD clock reads
// timeString(); shots.js stages a fixed hour with setTime().

import * as THREE from '../vendor/three/three.module.min.js';
import { clamp, lerp } from './config.js';

// One keyframe per phase: hour, sun colour/intensity, hemisphere intensity,
// fog colour, sky gradient (zenith/mid/horizon), night factor 0..1.
const KEYS = [
  { h: 0, sun: 0x223355, sunI: 0.05, hemiI: 0.25, fog: 0x0d1424, sky: ['#050914', '#0d1a33', '#1a2b4d'], night: 1 },
  { h: 5, sun: 0x223355, sunI: 0.05, hemiI: 0.25, fog: 0x0d1424, sky: ['#050914', '#0d1a33', '#1a2b4d'], night: 1 },
  { h: 6.5, sun: 0xff9a5c, sunI: 0.9, hemiI: 0.7, fog: 0x7a6a7a, sky: ['#3a2a55', '#8a5570', '#ffb36b'], night: 0.35 },
  { h: 9, sun: 0xfff2d0, sunI: 2.2, hemiI: 1.5, fog: 0x9ab8cc, sky: ['#2f6db3', '#7fb2dd', '#cfe8f5'], night: 0 },
  { h: 16, sun: 0xffe8b0, sunI: 2.1, hemiI: 1.4, fog: 0x93a8bd, sky: ['#2c5da6', '#7aa8d4', '#cfe0ea'], night: 0 },
  { h: 17.5, sun: 0xffb36b, sunI: 2.1, hemiI: 1.35, fog: 0x8a5f74, sky: ['#2c1e4f', '#6b4472', '#ff9a3d'], night: 0.05 },
  { h: 19, sun: 0xff7a4d, sunI: 0.7, hemiI: 0.7, fog: 0x4a3550, sky: ['#160f33', '#4a2c55', '#c65d7b'], night: 0.55 },
  { h: 20.5, sun: 0x223355, sunI: 0.05, hemiI: 0.3, fog: 0x11182c, sky: ['#050914', '#0d1a33', '#223355'], night: 1 },
  { h: 24, sun: 0x223355, sunI: 0.05, hemiI: 0.25, fog: 0x0d1424, sky: ['#050914', '#0d1a33', '#1a2b4d'], night: 1 },
];

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

function mixHex(a, b, t) {
  _c1.setHex(a);
  _c2.setHex(b);
  return _c1.clone().lerp(_c2, t);
}

export class DayNight {
  /**
   * @param scene - the three.js scene
   * @param lights - { sun: DirectionalLight, hemi: HemisphereLight,
   *   ambient: AmbientLight, glowMat: lamp-glow SpriteMaterial|null }
   */
  constructor(scene, lights) {
    this.scene = scene;
    this.lights = lights;
    this.hours = 17.5; // golden hour at boot, like iter1's fixed dusk
    this.rate = 1 / 45; // game-hours per real second (1h per ~45s)
    this._lastSkyHour = -1;

    // Sky dome: a 4x256 canvas gradient, rebuilt when the phase moves.
    this.skyCanvas = document.createElement('canvas');
    this.skyCanvas.width = 4;
    this.skyCanvas.height = 256;
    this.skyCtx = this.skyCanvas.getContext('2d');
    this.skyTex = new THREE.CanvasTexture(this.skyCanvas);
    this.skyTex.colorSpace = THREE.SRGBColorSpace;
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(700, 20, 14),
      new THREE.MeshBasicMaterial({ map: this.skyTex, side: THREE.BackSide, fog: false }),
    );
    scene.add(this.sky);

    // Sun disc (day/dusk) + moon disc (night), placed on the sky.
    this.sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(26, 24),
      new THREE.MeshBasicMaterial({ color: 0xff9a3d, fog: false }),
    );
    this.sunDisc.position.set(420, 34, -80);
    this.sunDisc.lookAt(0, 20, 0);
    scene.add(this.sunDisc);
    this.moonDisc = new THREE.Mesh(
      new THREE.CircleGeometry(16, 24),
      new THREE.MeshBasicMaterial({ color: 0xe8eefc, fog: false }),
    );
    this.moonDisc.position.set(-380, 260, -220);
    this.moonDisc.lookAt(0, 20, 0);
    scene.add(this.moonDisc);

    this._night = 0;
    this.update(0);
  }

  setTime(hours) {
    this.hours = ((hours % 24) + 24) % 24;
    this._lastSkyHour = -1;
    this.update(0);
  }

  timeString() {
    const h = Math.floor(this.hours);
    const m = Math.floor((this.hours - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  nightFactor() { return this._night; }

  /** Headlight multiplier: dimmer by day, full beam at night. */
  headlightFactor() { return 0.55 + 0.9 * this._night; }

  _sample() {
    const h = this.hours;
    let a = KEYS[KEYS.length - 1];
    let b = KEYS[0];
    for (let i = 0; i < KEYS.length - 1; i += 1) {
      if (h >= KEYS[i].h && h <= KEYS[i + 1].h) { a = KEYS[i]; b = KEYS[i + 1]; break; }
    }
    const span = Math.max(0.0001, b.h - a.h);
    const t = clamp((h - a.h) / span, 0, 1);
    return {
      sun: mixHex(a.sun, b.sun, t),
      sunI: lerp(a.sunI, b.sunI, t),
      hemiI: lerp(a.hemiI, b.hemiI, t),
      fog: mixHex(a.fog, b.fog, t),
      sky: [0, 1, 2].map((i) => mixHex(new THREE.Color(a.sky[i]).getHex(), new THREE.Color(b.sky[i]).getHex(), t)),
      night: lerp(a.night, b.night, t),
      t,
    };
  }

  _paintSky(s) {
    const g = this.skyCtx;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, `#${s.sky[0].getHexString()}`);
    grad.addColorStop(0.45, `#${s.sky[1].getHexString()}`);
    grad.addColorStop(0.78, `#${s.sky[1].getHexString()}`);
    grad.addColorStop(0.92, `#${s.sky[2].getHexString()}`);
    grad.addColorStop(1, `#${s.sky[2].getHexString()}`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    this.skyTex.needsUpdate = true;
  }

  update(dt) {
    if (dt > 0) this.hours = (this.hours + dt * this.rate) % 24;
    const s = this._sample();
    this._night = s.night;
    const { sun, hemi, ambient } = this.lights;
    if (sun) {
      sun.color.copy(s.sun);
      sun.intensity = s.sunI;
      // Sun swings east->west across the sky; low at dawn/dusk, high at noon.
      const dayT = clamp((this.hours - 6) / 12, 0, 1); // 0 dawn, 1 dusk
      const el = Math.sin(dayT * Math.PI) * 0.9 + 0.08;
      const az = lerp(-1.1, 1.1, dayT);
      sun.position.set(Math.sin(az) * 180, el * 160 + 12, -60 + Math.cos(az) * 60);
    }
    if (hemi) hemi.intensity = s.hemiI;
    if (ambient) ambient.intensity = 0.45 + 0.55 * s.night;
    if (this.scene.fog) {
      this.scene.fog.color.copy(s.fog);
      this.scene.background = s.fog;
    }
    // Sun disc visible by day, sinking at dusk; moon takes over at night.
    const sunUp = s.night < 0.9;
    this.sunDisc.visible = sunUp;
    if (sunUp) {
      this.sunDisc.material.color.copy(s.sun);
      this.sunDisc.material.opacity = 1;
      const dayT = clamp((this.hours - 6) / 12, 0, 1);
      this.sunDisc.position.set(lerp(420, -420, dayT), 34 + Math.sin(dayT * Math.PI) * 180, -80);
      this.sunDisc.lookAt(0, 20, 0);
    }
    this.moonDisc.visible = s.night > 0.25;
    this.moonDisc.material.opacity = clamp((s.night - 0.25) / 0.5, 0, 1);
    // Streetlamps + neon glow: lamps visibly switch on as night falls.
    if (this.lights.glowMat) this.lights.glowMat.opacity = s.night * 0.85;
    // Rebuild the sky gradient only when the phase has visibly moved.
    if (Math.abs(this.hours - this._lastSkyHour) > 0.08) {
      this._lastSkyHour = this.hours;
      this._paintSky(s);
    }
  }
}
