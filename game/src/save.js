// Neon Tides — localStorage save: cash, mission progress, player position,
// neon caches found and the current weapon (iter1). Wanted level is never
// saved: a loaded game always starts clean, by design.

import { SAVE_KEY } from './config.js';

export function defaultSave() {
  return { cash: 250, missionIndex: 0, missionsDone: false, x: -140, z: 150, heading: 0.6, totalEarned: 0, cachesCollected: 0, weaponId: 'pistol' };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
    return { ...defaultSave(), ...data };
  } catch {
    return null;
  }
}

export function hasSave() { return loadSave() !== null; }

export function writeSave(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable (private mode); the game simply runs unsaved.
  }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
