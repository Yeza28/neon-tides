// Neon Tides — shared tuning and world layout constants for Port Vireo.
// The city is a square grid of blocks; roads run on the grid lines, the ocean
// borders the east edge, and every other module reads its numbers from here.

export const BLOCK_PITCH = 56; // metres between neighbouring road centrelines
export const ROAD_HALF = 7; // half the road width in metres
export const GRID_MIN = -3; // westernmost / southernmost road index
export const GRID_MAX = 3; // easternmost / northernmost road index
export const CITY_EDGE = GRID_MAX * BLOCK_PITCH + 30; // sand starts past this x
export const OCEAN_X = CITY_EDGE + 26; // water plane centre offset
export const WORLD_LIMIT = GRID_MAX * BLOCK_PITCH + 22; // hard play boundary

export const PLAYER_WALK_SPEED = 5.2;
export const PLAYER_RUN_SPEED = 9.5;
export const PLAYER_RADIUS = 0.55;
export const PLAYER_MAX_HEALTH = 100;

export const CAR_MAX_SPEED = 34; // m/s, sports tune
export const CAR_CRUISE_SPEED = 13; // traffic cruise speed
export const POLICE_MAX_SPEED = 36;

export const WANTED_MAX = 5;
export const WANTED_DECAY_SECONDS = 14; // unseen seconds per star shed
export const BUST_RANGE = 7; // police pin range in metres
export const BUST_FILL_SECONDS = 2.4; // pinned time that ends in BUSTED

export const PISTOL_DAMAGE = 34;
export const PISTOL_MAGAZINE = 12;
export const PISTOL_RESERVE_START = 60;
export const PISTOL_FIRE_MS = 190;
export const PISTOL_RANGE = 90;

export const TRAFFIC_COUNT = 14;
export const PARKED_COUNT = 16;
export const PEDESTRIAN_COUNT = 26;
export const POLICE_FOOT_MIN_STARS = 3;

export const SAVE_KEY = 'neon-tides-save-v1';

export const CAR_COLORS = [0xff5964, 0x35a7ff, 0xffd23f, 0x3ddc84, 0xff8c42, 0xc77dff, 0xe8e8ec, 0x22242a, 0x00c2a8, 0xff3d8a];
export const PED_COLORS = [0xffd166, 0xef476f, 0x06d6a0, 0x118ab2, 0xf78c6b, 0x9b5de5, 0xf1fa8c, 0xe0e0e0];
export const NEON_COLORS = [0xff2e88, 0x00e5ff, 0xffe14d, 0x7c4dff, 0x00ffa3, 0xff6b35];

export function roadCoord(index) { return index * BLOCK_PITCH; }

export function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }

export function lerp(a, b, t) { return a + (b - a) * t; }

/** Shortest signed angle from a to b, in radians. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Deterministic PRNG so screenshot scenes and city layout are stable. */
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
