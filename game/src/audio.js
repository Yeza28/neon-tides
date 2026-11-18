// Neon Tides — all sound is synthesized with WebAudio; there are no audio files.
// One AudioEngine owns the context, a looping dusk synth pad, an engine hum whose
// pitch follows speed, a two-tone siren, and one-shot effects (gunshot, crash,
// pickup, success sting, footsteps of the city: gulls and surf are filtered noise).

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.rotorOsc = null; // police helicopter rotor thump (helicopter.js)
    this.rotorGain = null;
    this.rotorTimer = 0;
    this.started = false;
  }

  /** Must be called from a user gesture; safe to call again. */
  start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.started = true;
    this.startPad();
    this.startEngine();
    this.startSurf();
  }

  startPad() {
    // Slow detuned triangle chord pad: Port Vireo at dusk, Am9 colours.
    const notes = [110, 164.81, 196, 246.94];
    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 0.05;
    this.padGain.connect(this.master);
    for (const freq of notes) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = (Math.random() - 0.5) * 9;
      osc.connect(this.padGain);
      osc.start();
    }
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(this.padGain.gain);
    lfo.start();
  }

  startSurf() {
    // Filtered noise loop for the ocean edge ambience.
    const buffer = this.noiseBuffer(2);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.035;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
  }

  startEngine() {
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  /** speedRatio 0..1 while driving, or -1 when on foot (engine silent). */
  setEngine(speedRatio) {
    if (!this.started || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    if (speedRatio < 0) {
      this.engineGain.gain.setTargetAtTime(0, t, 0.1);
      return;
    }
    this.engineOsc.frequency.setTargetAtTime(55 + speedRatio * 165, t, 0.08);
    this.engineGain.gain.setTargetAtTime(0.05 + speedRatio * 0.07, t, 0.1);
  }

  setSiren(on, dt) {
    if (!this.started) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'square';
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.018;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
    }
    if (!on && this.sirenOsc) {
      this.sirenOsc.stop();
      this.sirenOsc = null;
      this.sirenGain = null;
      return;
    }
    if (this.sirenOsc) {
      this.sirenTimer += dt;
      this.sirenOsc.frequency.value = this.sirenTimer % 0.9 < 0.45 ? 720 : 960;
    }
  }

  /** Rotor thump while the police helicopter is overhead; silent otherwise. */
  setRotor(on, dt) {
    if (!this.started) return;
    if (on && !this.rotorOsc) {
      this.rotorOsc = this.ctx.createOscillator();
      this.rotorOsc.type = 'sawtooth';
      this.rotorOsc.frequency.value = 38;
      this.rotorGain = this.ctx.createGain();
      this.rotorGain.gain.value = 0.022;
      this.rotorOsc.connect(this.rotorGain);
      this.rotorGain.connect(this.master);
      this.rotorOsc.start();
    }
    if (!on && this.rotorOsc) {
      this.rotorOsc.stop();
      this.rotorOsc = null;
      this.rotorGain = null;
      return;
    }
    if (this.rotorOsc) {
      // Slow chop: the blade beat rises and falls a few times a second.
      this.rotorTimer += dt;
      this.rotorOsc.frequency.value = 34 + Math.sin(this.rotorTimer * 21) * 9;
    }
  }

  noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  blip(freq, dur, type, vol, slideTo) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  gunshot() {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.16);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 700;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    this.blip(140, 0.1, 'square', 0.2, 45);
  }

  crash(strength) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.3);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(Math.min(0.6, 0.2 + strength * 0.05), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    this.blip(70, 0.22, 'sine', 0.3, 34);
  }

  pickup() { this.blip(660, 0.12, 'sine', 0.18); setTimeout(() => this.blip(990, 0.16, 'sine', 0.18), 70); }

  /** Brighter two-note chime for a neon cache or a fare pickup (activities.js). */
  cacheChime() { this.blip(880, 0.1, 'triangle', 0.16); setTimeout(() => this.blip(1318, 0.18, 'triangle', 0.16), 80); }

  success() {
    const seq = [523.25, 659.25, 783.99, 1046.5];
    seq.forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.2), i * 110));
  }

  fail() { this.blip(220, 0.3, 'sawtooth', 0.12, 110); }

  phoneBuzz() { this.blip(880, 0.07, 'square', 0.06); setTimeout(() => this.blip(880, 0.07, 'square', 0.06), 110); }

  doorSlam() { this.blip(95, 0.12, 'sine', 0.25, 50); }
}
