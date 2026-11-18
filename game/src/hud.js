// Neon Tides — the HUD: health, cash, wanted stars, objective, timer,
// speedometer, weapon/ammo, interaction prompt, bust meter, phone popups,
// and the iter1 additions: a neon-cache counter and a helicopter warning.

export class Hud {
  constructor() {
    this.el = {
      health: document.getElementById('health-fill'),
      cash: document.getElementById('cash'),
      stars: document.getElementById('stars'),
      objective: document.getElementById('objective'),
      timer: document.getElementById('timer'),
      speed: document.getElementById('speedo'),
      weapon: document.getElementById('weapon'),
      prompt: document.getElementById('prompt'),
      phone: document.getElementById('phone'),
      phoneText: document.getElementById('phone-text'),
      bust: document.getElementById('bust-fill'),
      bustWrap: document.getElementById('bust-wrap'),
      missionTitle: document.getElementById('mission-title'),
      caches: document.getElementById('caches'),
      heli: document.getElementById('heli'),
    };
    this.phoneTimer = null;
    this.lastStars = -1;
    this.lastCaches = -1;
  }

  setHealth(ratio) {
    this.el.health.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
    this.el.health.style.background = ratio < 0.3 ? '#ff4455' : '#3ddc84';
  }

  setCash(amount) {
    this.el.cash.textContent = `$${amount.toLocaleString('en-US')}`;
  }

  setStars(stars) {
    if (stars === this.lastStars) return;
    this.lastStars = stars;
    this.el.stars.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    this.el.stars.style.color = stars > 0 ? '#ffd23f' : '#5a6270';
  }

  setObjective(text) { this.el.objective.textContent = text || ''; }

  setMissionTitle(text) { this.el.missionTitle.textContent = text || ''; }

  setTimer(seconds) {
    if (seconds < 0 || seconds === undefined) {
      this.el.timer.textContent = '';
      return;
    }
    const s = Math.max(0, Math.ceil(seconds));
    const mm = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    this.el.timer.textContent = `⏱ ${mm}:${ss}`;
    this.el.timer.style.color = s < 15 ? '#ff5566' : '#ffe9a8';
  }

  setSpeed(kmh, visible) {
    this.el.speed.style.display = visible ? 'block' : 'none';
    if (visible) this.el.speed.textContent = `${Math.round(kmh)} km/h`;
  }

  setWeapon(name, ammo, reserve, visible) {
    this.el.weapon.style.display = visible ? 'block' : 'none';
    if (visible) this.el.weapon.textContent = `${name} ${ammo} / ${reserve}`;
  }

  /** Neon-cache counter (activities.js): "Caches 3/10", cyan when complete. */
  setCaches(found, total) {
    if (found === this.lastCaches) return;
    this.lastCaches = found;
    this.el.caches.textContent = `◆ Caches ${found}/${total}`;
    this.el.caches.style.color = found >= total ? '#3ddc84' : '#00e5ff';
  }

  /** Helicopter warning: shown only while the air unit is overhead. */
  setHeli(active) {
    this.el.heli.style.display = active ? 'block' : 'none';
    if (active) this.el.heli.textContent = '🚁 AIR UNIT — stars frozen';
  }

  setPrompt(text) {
    this.el.prompt.style.display = text ? 'block' : 'none';
    if (text) this.el.prompt.textContent = text;
  }

  setBust(ratio) {
    this.el.bustWrap.style.display = ratio > 0.02 ? 'block' : 'none';
    this.el.bust.style.width = `${ratio * 100}%`;
  }

  showPhone(text, ms) {
    this.el.phoneText.textContent = text;
    this.el.phone.style.display = 'block';
    if (this.phoneTimer) clearTimeout(this.phoneTimer);
    this.phoneTimer = setTimeout(() => {
      this.el.phone.style.display = 'none';
    }, ms || 5200);
  }
}
