// Subtle local procedural tactile audio matched to Clay, Liquid Chrome, and Blown Glass.
export class StudioAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.material = 'clay';
    this.master = null;
    this.rubFilter = null;
    this.rubGain = null;
    this.lastPulseAt = 0;
    this.lastToneAt = 0;
  }

  _init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    // Filtered pink-noise bed for soft clay friction / surface rub
    const sr = this.ctx.sampleRate;
    const len = sr * 2;
    const buf = this.ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.05;
      b6 = w * 0.115926;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    this.rubFilter = this.ctx.createBiquadFilter();
    this.rubFilter.type = 'bandpass';
    this.rubFilter.frequency.value = 380;
    this.rubFilter.Q.value = 1.4;

    this.rubGain = this.ctx.createGain();
    this.rubGain.gain.value = 0;

    src.connect(this.rubFilter);
    this.rubFilter.connect(this.rubGain);
    this.rubGain.connect(this.master);
    src.start();

    window.setInterval(() => {
      if (this.rubGain && this.ctx && performance.now() - this.lastPulseAt > 95) {
        this.rubGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
      }
    }, 80);
  }

  // Unlock Web Audio cleanly on the first user gesture (zero browser autoplay warnings)
  unlock() {
    if (!this.enabled) return;
    this._init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.master.gain.setTargetAtTime(1, this.ctx.currentTime, 0.08);
  }

  async toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) {
      this._init();
      if (!this.ctx) {
        this.enabled = false;
        return false;
      }
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      this.master.gain.setTargetAtTime(1, this.ctx.currentTime, 0.14);
    } else if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
    }
    return this.enabled;
  }

  setMaterial(matId) {
    this.material = matId;
    if (this.enabled) {
      this.playPinchLock();
    }
  }

  playPinchLock() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();

    if (this.material === 'clay') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(165, t);
      osc.frequency.exponentialRampToValueAtTime(88, t + 0.065);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.08, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
    } else if (this.material === 'chrome') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(340, t);
      osc.frequency.exponentialRampToValueAtTime(510, t + 0.09);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.045, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.036, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    }

    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  pulseSculpt(speed) {
    if (!this.enabled || !this.ctx || !this.rubGain) return;
    this.lastPulseAt = performance.now();
    const t = this.ctx.currentTime;

    if (this.material === 'clay') {
      this.rubFilter.frequency.setTargetAtTime(260 + speed * 420, t, 0.04);
      this.rubGain.gain.setTargetAtTime(Math.min(0.16, 0.04 + speed * 0.14), t, 0.03);
    } else {
      this.rubFilter.frequency.setTargetAtTime(640 + speed * 800, t, 0.05);
      this.rubGain.gain.setTargetAtTime(Math.min(0.05, 0.015 + speed * 0.04), t, 0.04);

      if (this.lastPulseAt - this.lastToneAt > 180 && speed > 0.12) {
        this.lastToneAt = this.lastPulseAt;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        const notes = this.material === 'chrome'
          ? [220, 261.6, 329.6, 392, 440]
          : [587.3, 659.25, 783.99, 880, 1174.66];
        const freq = notes[Math.floor(Math.random() * notes.length)];
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.022, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        osc.connect(g);
        g.connect(this.master);
        osc.start(t);
        osc.stop(t + 0.48);
      }
    }
  }
}
