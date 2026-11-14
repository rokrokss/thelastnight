import { TRACKS, type TrackDef } from './music';

/**
 * All sound is synthesised at runtime with Web Audio: no samples ship with
 * the game. Three buses (music / sfx / ambience) feed a shared reverb and a
 * master limiter.
 */

const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

export interface AmbienceMix {
  rain: number;
  wind: number;
  city: number;
  crowd: number;
}

interface Bed {
  gain: GainNode;
  target: number;
}

interface LiveTrack {
  def: TrackDef;
  out: GainNode;
  step: number;
  next: number;
}

export class AudioSys {
  private ctx: AudioContext | OfflineAudioContext | null = null;
  /** Rendering to a buffer rather than the speakers (see attach). */
  private offline = false;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private reverbIn!: GainNode;
  private delayIn!: GainNode;
  private noiseBuf!: AudioBuffer;
  private beds: Record<keyof AmbienceMix | 'hum' | 'tension', Bed> | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private track: LiveTrack | null = null;
  private wantTrack: string | null = null;
  private tune: {
    staticG: GainNode;
    sigG: GainNode;
    whistle: OscillatorNode;
    whistleG: GainNode;
    sigFilter: BiquadFilterNode;
    step: number;
    next: number;
  } | null = null;
  private vol = { master: 0.8, music: 0.7, sfx: 0.9 };
  private mix: AmbienceMix = { rain: 0, wind: 0, city: 0, crowd: 0 };
  private lastStep = 0;

  /** Must be called from a user gesture at least once. */
  resume(): void {
    if (!this.ctx) this.init();
    if (this.ctx && !this.offline && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /**
   * Play into an offline context instead of the speakers, optionally through
   * `out` rather than straight to its destination. Used to bounce a soundtrack
   * to a file: the caller advances the context and calls sfx()/update() as it goes.
   */
  attach(ctx: OfflineAudioContext, out?: AudioNode): void {
    this.offline = true;
    this.init(ctx, out);
  }

  /** Whether sound can be scheduled now. An offline render counts even while it is paused to be fed. */
  private get live(): boolean {
    return !!this.ctx && (this.offline || this.ctx.state === 'running');
  }

  /** True once a user gesture has created the audio context. */
  get started(): boolean {
    return !!this.ctx;
  }

  /** Silence everything while the tab is hidden (the continuous beds would otherwise keep playing). */
  suspend(): void {
    if (this.ctx && !this.offline && this.ctx.state === 'running') void (this.ctx as AudioContext).suspend();
  }

  private init(given?: OfflineAudioContext, out?: AudioNode): void {
    let ctx: AudioContext | OfflineAudioContext | undefined = given;
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    this.ctx = ctx;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 12;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.2;
    limiter.connect(out ?? ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(limiter);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.ambBus.connect(this.master);

    // White noise source material.
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Reverb: decaying filtered noise as the impulse response.
    const irLen = Math.floor(ctx.sampleRate * 2.6);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < irLen; i++) {
        const t = i / irLen;
        lp += (Math.random() * 2 - 1 - lp) * (0.5 - t * 0.38);
        d[i] = lp * Math.pow(1 - t, 2.4);
      }
    }
    const reverb = ctx.createConvolver();
    reverb.buffer = ir;
    this.reverbIn = ctx.createGain();
    const reverbOut = ctx.createGain();
    reverbOut.gain.value = 0.55;
    this.reverbIn.connect(reverb);
    reverb.connect(reverbOut);
    reverbOut.connect(this.master);

    // Tempo-agnostic echo for plucked voices.
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.36;
    const fb = ctx.createGain();
    fb.gain.value = 0.36;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2400;
    this.delayIn = ctx.createGain();
    this.delayIn.connect(delay);
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    damp.connect(this.musicBus);
    damp.connect(this.reverbIn);

    this.buildBeds();
    this.applyVolumes();
    if (this.wantTrack) this.startTrack(this.wantTrack);
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.vol = { master, music, sfx };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    // Bus trims set from measured output so the three sit together under the limiter.
    this.musicBus.gain.setTargetAtTime(this.vol.music * 1.9, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx * 1.7, t, 0.05);
    this.ambBus.gain.setTargetAtTime(this.vol.sfx * 2.3, t, 0.05);
  }

  // ---------------------------------------------------------------- helpers
  private noise(): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.loopStart = Math.random();
    return s;
  }

  /** One enveloped oscillator note. */
  private tone(
    type: OscillatorType,
    freq: number,
    t0: number,
    attack: number,
    decay: number,
    peak: number,
    dest: AudioNode,
    slideTo?: number,
    detune = 0,
  ): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + attack + decay);
    o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    o.connect(g);
    g.connect(dest);
    o.start(t0);
    o.stop(t0 + attack + decay + 0.05);
  }

  /** One enveloped, filtered noise burst. */
  private burst(
    t0: number,
    attack: number,
    decay: number,
    peak: number,
    type: BiquadFilterType,
    freq: number,
    q: number,
    dest: AudioNode,
    sweepTo?: number,
  ): void {
    const ctx = this.ctx!;
    const s = this.noise();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + attack + decay);
    f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(t0);
    s.stop(t0 + attack + decay + 0.05);
  }

  // -------------------------------------------------------------------- sfx
  sfx(name: string, vol = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.live) return;
    const t = ctx.currentTime;
    const d = this.sfxBus;
    const wet = this.reverbIn;
    const v = vol;
    switch (name) {
      case 'step': {
        // Rate-limit so two feet landing on the same frame do not double up.
        if (t - this.lastStep < 0.09) return;
        this.lastStep = t;
        const r = 0.85 + Math.random() * 0.3;
        this.burst(t, 0.002, 0.05, 0.11 * v, 'bandpass', 1500 * r, 1.2, d);
        this.tone('sine', 95 * r, t, 0.002, 0.05, 0.1 * v, d, 55);
        if (this.mix.rain > 0.1) this.burst(t + 0.01, 0.004, 0.08, 0.05 * v, 'highpass', 3800, 0.7, d);
        break;
      }
      case 'jump':
        this.burst(t, 0.01, 0.14, 0.09 * v, 'bandpass', 500, 1.2, d, 1300);
        break;
      case 'land':
        this.tone('sine', 110, t, 0.002, 0.16, 0.3 * v, d, 42);
        this.burst(t, 0.002, 0.12, 0.16 * v, 'lowpass', 900, 0.7, d);
        break;
      case 'grab':
        this.burst(t, 0.002, 0.06, 0.16 * v, 'bandpass', 2400, 2, d);
        this.tone('triangle', 240, t, 0.002, 0.06, 0.08 * v, d, 140);
        break;
      case 'climb':
        this.burst(t, 0.03, 0.3, 0.07 * v, 'bandpass', 900, 0.8, d, 1700);
        break;
      case 'rung':
        this.tone('triangle', 1150 + Math.random() * 200, t, 0.001, 0.05, 0.05 * v, d);
        this.burst(t, 0.001, 0.03, 0.05 * v, 'highpass', 3000, 1, d);
        break;
      case 'tape':
        [76, 81, 88].forEach((n, i) => {
          this.tone('triangle', midi(n), t + i * 0.09, 0.005, 0.5, 0.13 * v, d);
          this.tone('sine', midi(n), t + i * 0.09, 0.005, 0.7, 0.07 * v, wet);
        });
        break;
      case 'lock':
        [62, 69, 74, 81].forEach((n, i) => {
          this.tone('sine', midi(n), t + i * 0.07, 0.01, 1.3, 0.12 * v, d);
          this.tone('triangle', midi(n), t + i * 0.07, 0.01, 1.6, 0.06 * v, wet);
        });
        this.burst(t, 0.3, 0.9, 0.05 * v, 'bandpass', 2600, 4, wet, 5200);
        break;
      case 'relay':
        this.tone('sawtooth', 55, t, 0.5, 0.9, 0.09 * v, d, 110);
        this.tone('square', 1760, t + 0.5, 0.002, 0.07, 0.05 * v, d);
        this.burst(t, 0.01, 0.2, 0.045 * v, 'highpass', 5000, 1, d);
        break;
      case 'ui_move':
        this.tone('square', 660, t, 0.002, 0.035, 0.05 * v, d);
        break;
      case 'ui_ok':
        this.tone('square', 880, t, 0.002, 0.05, 0.06 * v, d);
        this.tone('square', 1320, t + 0.05, 0.002, 0.08, 0.06 * v, d);
        break;
      case 'ui_back':
        this.tone('square', 440, t, 0.002, 0.06, 0.06 * v, d, 300);
        break;
      case 'spot':
        this.tone('square', 1480, t, 0.002, 0.07, 0.11 * v, d);
        this.tone('square', 1110, t + 0.09, 0.002, 0.11, 0.11 * v, d);
        break;
      case 'lost':
        this.tone('sine', 520, t, 0.01, 0.3, 0.06 * v, d, 300);
        break;
      case 'caught':
        this.tone('sawtooth', 180, t, 0.005, 0.7, 0.26 * v, d, 60);
        this.tone('square', 93, t, 0.005, 0.9, 0.2 * v, d, 40);
        this.burst(t, 0.005, 0.5, 0.22 * v, 'bandpass', 1900, 6, d, 300);
        this.tone('sine', 50, t + 0.05, 0.01, 1.2, 0.4 * v, wet, 28);
        break;
      case 'fell':
        this.burst(t, 0.15, 0.5, 0.2 * v, 'bandpass', 1200, 0.8, d, 250);
        this.tone('sine', 80, t + 0.45, 0.003, 0.4, 0.45 * v, d, 30);
        break;
      case 'thunder':
        this.burst(t, 0.02, 0.35, 0.5 * v, 'lowpass', 1800, 0.5, d, 200);
        this.burst(t + 0.12, 0.3, 3.4, 0.42 * v, 'lowpass', 220, 0.6, d, 60);
        this.burst(t + 0.2, 0.4, 3.0, 0.3 * v, 'lowpass', 300, 0.6, wet, 80);
        break;
      case 'gust':
        this.burst(t, 0.7, 1.5, 0.3 * v, 'bandpass', 350, 0.9, d, 1100);
        break;
      case 'static':
        // Kept low: broadband noise reads as much louder than its level suggests.
        this.burst(t, 0.01, 0.28, 0.042 * v, 'bandpass', 2600, 0.6, d);
        this.tone('sine', 1900, t, 0.01, 0.2, 0.009 * v, d, 700);
        break;
      case 'horn':
        this.tone('sawtooth', 98, t, 0.4, 2.6, 0.1 * v, wet, 92);
        this.tone('sawtooth', 147, t, 0.4, 2.6, 0.06 * v, wet, 138);
        this.tone('sine', 98, t, 0.4, 2.6, 0.14 * v, d);
        break;
      case 'train':
        this.burst(t, 1.2, 4.5, 0.2 * v, 'lowpass', 260, 0.7, d);
        this.burst(t + 0.5, 1.0, 3.5, 0.05 * v, 'bandpass', 2200, 3, d);
        break;
      case 'switch':
        this.burst(t, 0.001, 0.03, 0.2 * v, 'highpass', 2500, 1, d);
        this.tone('square', 220, t, 0.001, 0.03, 0.08 * v, d);
        break;
      case 'chime':
        [72, 79, 84, 91].forEach((n, i) => this.tone('sine', midi(n), t + i * 0.16, 0.01, 1.8, 0.1 * v, wet));
        break;
      case 'spark':
        this.burst(t, 0.001, 0.09, 0.2 * v, 'highpass', 4500, 2, d);
        break;

      // ---- the fight on the quay ----
      case 'rivet': {
        // A pneumatic thump, struck steel ringing on top of it, and the air letting go.
        const r = 0.94 + Math.random() * 0.12;
        this.burst(t, 0.001, 0.07, 0.22 * v, 'bandpass', 1300 * r, 0.9, d, 500);
        this.tone('square', 190 * r, t, 0.001, 0.07, 0.12 * v, d, 70);
        this.tone('triangle', 2350 * r, t + 0.005, 0.001, 0.16, 0.035 * v, d);
        this.burst(t + 0.02, 0.01, 0.12, 0.04 * v, 'highpass', 5200, 0.8, d);
        break;
      }
      case 'dry':
        this.burst(t, 0.001, 0.025, 0.12 * v, 'highpass', 3200, 1, d);
        this.tone('square', 320, t, 0.001, 0.02, 0.04 * v, d);
        break;
      case 'recharge':
        // Air coming back up to pressure, and the valve seating.
        this.burst(t, 0.08, 0.34, 0.06 * v, 'bandpass', 1800, 1.4, d, 4200);
        this.tone('square', 660, t + 0.36, 0.001, 0.04, 0.05 * v, d);
        break;
      case 'rifle': {
        const r = 0.92 + Math.random() * 0.16;
        this.burst(t, 0.001, 0.05, 0.16 * v, 'bandpass', 2600 * r, 1.4, d, 900);
        this.tone('sawtooth', 420 * r, t, 0.001, 0.06, 0.07 * v, d, 110);
        break;
      }
      case 'ricochet': {
        const f = 2200 + Math.random() * 1800;
        this.tone('triangle', f, t, 0.001, 0.22, 0.06 * v, d, f * 0.45);
        this.burst(t, 0.001, 0.03, 0.1 * v, 'highpass', 4000, 1, d);
        break;
      }
      case 'clank':
        this.tone('square', 310, t, 0.001, 0.09, 0.1 * v, d, 190);
        this.tone('triangle', 1240 + Math.random() * 300, t, 0.001, 0.14, 0.06 * v, d);
        this.burst(t, 0.001, 0.05, 0.14 * v, 'bandpass', 2200, 2, d);
        break;
      case 'hit':
        // Sol is hit: a thud, and a spit of static from her set.
        this.tone('sine', 150, t, 0.002, 0.16, 0.3 * v, d, 60);
        this.burst(t, 0.002, 0.12, 0.14 * v, 'bandpass', 1800, 1.2, d, 600);
        break;
      case 'heal':
        this.tone('sine', 660, t, 0.01, 0.16, 0.04 * v, d, 880);
        break;
      case 'aim':
        this.tone('square', 1320, t, 0.002, 0.05, 0.05 * v, d);
        this.tone('square', 1760, t + 0.07, 0.002, 0.09, 0.05 * v, d);
        break;
      case 'wreck':
        // A machine going down: the power sags out of it, then the plates settle.
        this.tone('sawtooth', 320, t, 0.005, 0.55, 0.12 * v, d, 38);
        this.burst(t, 0.002, 0.16, 0.18 * v, 'highpass', 3800, 1.5, d);
        this.burst(t + 0.28, 0.002, 0.12, 0.16 * v, 'bandpass', 700, 1.2, d);
        this.tone('square', 96, t + 0.3, 0.002, 0.14, 0.12 * v, d, 50);
        break;
      case 'unlatch':
        this.tone('square', 520, t, 0.001, 0.05, 0.1 * v, d, 240);
        this.burst(t, 0.001, 0.08, 0.2 * v, 'bandpass', 1500, 3, d);
        this.tone('triangle', 1900, t + 0.01, 0.001, 0.4, 0.05 * v, wet);
        break;
      case 'crash':
        // Thirty tonnes of box meeting the deck.
        this.tone('sine', 70, t, 0.003, 0.7, 0.45 * v, d, 26);
        this.burst(t, 0.002, 0.45, 0.36 * v, 'lowpass', 1400, 0.6, d, 160);
        this.burst(t + 0.03, 0.01, 0.9, 0.2 * v, 'bandpass', 520, 2.5, wet, 180);
        this.tone('square', 147, t + 0.02, 0.002, 0.3, 0.12 * v, d, 60);
        break;
      case 'downed':
        this.tone('sine', 120, t, 0.004, 0.6, 0.34 * v, d, 40);
        this.burst(t, 0.004, 0.35, 0.16 * v, 'bandpass', 1500, 1.5, d, 300);
        this.tone('sine', 55, t + 0.1, 0.01, 1.0, 0.3 * v, wet, 30);
        break;

      // ---- the Undertow ----
      case 'call':
        // Its voice: something very large, a long way down. Slow tones bending against each other.
        for (const [f0, f1, at, len, g0] of [
          [62, 98, 0, 2.6, 0.2],
          [93, 139, 0.25, 2.4, 0.12],
          [124, 82, 1.5, 2.2, 0.12],
        ] as const) {
          this.tone('sawtooth', f0, t + at, 0.6, len, g0 * 0.5 * v, wet, f1);
          this.tone('sine', f0, t + at, 0.6, len, g0 * v, d, f1);
        }
        this.burst(t + 0.2, 0.9, 2.2, 0.08 * v, 'bandpass', 300, 2, wet, 520);
        break;
      case 'roar':
        // In pain: the same voice, torn.
        this.tone('sawtooth', 150, t, 0.04, 1.3, 0.2 * v, d, 60);
        this.tone('sawtooth', 226, t, 0.04, 1.1, 0.12 * v, wet, 84);
        this.tone('square', 75, t, 0.04, 1.4, 0.16 * v, d, 40);
        this.burst(t, 0.05, 1.1, 0.2 * v, 'bandpass', 700, 1.4, wet, 240);
        break;
      case 'warn':
        // Something overhead, moving a great deal of air.
        this.burst(t, 0.5, 0.9, 0.14 * v, 'bandpass', 220, 1.2, d, 520);
        this.tone('sine', 60, t, 0.4, 0.9, 0.16 * v, d, 90);
        break;
      case 'slam':
        this.tone('sine', 58, t, 0.003, 0.9, 0.5 * v, d, 22);
        this.burst(t, 0.002, 0.5, 0.36 * v, 'lowpass', 1100, 0.6, d, 120);
        this.burst(t + 0.02, 0.01, 1.2, 0.2 * v, 'lowpass', 400, 0.8, wet, 90);
        this.burst(t, 0.001, 0.12, 0.2 * v, 'highpass', 2800, 0.8, d);
        break;
      case 'scrape':
        this.burst(t, 0.2, 1.0, 0.16 * v, 'bandpass', 900, 3.5, d, 1700);
        this.burst(t, 0.2, 1.0, 0.14 * v, 'lowpass', 300, 0.8, d);
        break;
      case 'swell':
        this.burst(t, 1.6, 0.9, 0.2 * v, 'lowpass', 500, 0.7, d, 1500);
        break;
      case 'wave':
        this.burst(t, 0.25, 2.6, 0.34 * v, 'lowpass', 2400, 0.6, d, 500);
        this.burst(t, 0.2, 2.0, 0.12 * v, 'highpass', 3600, 0.7, d);
        this.tone('sine', 52, t, 0.2, 1.6, 0.2 * v, d, 36);
        break;
      case 'barb':
        // A live barb coming out: a crack of current, and a note that dies.
        this.burst(t, 0.001, 0.09, 0.3 * v, 'highpass', 3600, 1.5, d);
        this.tone('sawtooth', 1480, t, 0.002, 0.5, 0.07 * v, d, 180);
        this.tone('sine', 880, t + 0.02, 0.005, 0.9, 0.08 * v, wet, 440);
        break;
      case 'pulse':
        // Relay three, rung like a bell.
        [50, 62, 69, 74].forEach((n, i) => {
          this.tone('sine', midi(n), t + i * 0.015, 0.005, 2.2, 0.16 * v, d);
          this.tone('triangle', midi(n + 12), t + i * 0.015, 0.005, 2.6, 0.07 * v, wet);
        });
        this.burst(t, 0.002, 0.3, 0.16 * v, 'bandpass', 2600, 3, wet, 900);
        break;
      case 'floods':
        // Breakers going over, one bank of lamps after another.
        [0, 0.09, 0.2].forEach((at, i) => {
          this.burst(t + at, 0.001, 0.05, 0.18 * v, 'bandpass', 900 + i * 300, 2, d);
          this.tone('sawtooth', 100, t + at, 0.01, 0.5, 0.04 * v, d);
        });
        break;
    }
  }

  /** Dialogue blip: a soft, pitched tick per few characters. */
  blip(pitch: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.live) return;
    const f = 430 * pitch * (0.94 + Math.random() * 0.12);
    this.tone('triangle', f, ctx.currentTime, 0.003, 0.045, 0.05, this.sfxBus);
  }

  // --------------------------------------------------------------- ambience
  private buildBeds(): void {
    const ctx = this.ctx!;
    const bed = (): Bed => {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.ambBus);
      return { gain, target: 0 };
    };
    const beds = { rain: bed(), wind: bed(), city: bed(), crowd: bed(), hum: bed(), tension: bed() };
    this.beds = beds;

    // Rain: a bright hiss over a softer patter.
    {
      const n = this.noise();
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1700;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 7500;
      n.connect(hp);
      hp.connect(lp);
      lp.connect(beds.rain.gain);
      n.start();
    }
    // Wind: band of noise whose centre wanders.
    {
      const n = this.noise();
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 420;
      f.Q.value = 0.9;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.13;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 220;
      lfo.connect(lfoG);
      lfoG.connect(f.frequency);
      n.connect(f);
      f.connect(beds.wind.gain);
      n.start();
      lfo.start();
      this.windFilter = f;
    }
    // City: a low electrical drone and distant traffic wash.
    {
      for (const [hz, g0] of [
        [55, 0.5],
        [82.5, 0.28],
        [110.4, 0.16],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = hz;
        const g = ctx.createGain();
        g.gain.value = g0;
        o.connect(g);
        g.connect(beds.city.gain);
        o.start();
      }
      const n = this.noise();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 260;
      const g = ctx.createGain();
      g.gain.value = 0.7;
      n.connect(f);
      f.connect(g);
      g.connect(beds.city.gain);
      n.start();
    }
    // Crowd: murmur made of slowly pulsing voice-band noise.
    {
      for (const [hz, rate] of [
        [420, 0.9],
        [640, 1.7],
        [950, 2.6],
      ] as const) {
        const n = this.noise();
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = hz;
        f.Q.value = 2.2;
        const g = ctx.createGain();
        g.gain.value = 0.5;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = rate;
        const lg = ctx.createGain();
        lg.gain.value = 0.45;
        lfo.connect(lg);
        lg.connect(g.gain);
        n.connect(f);
        f.connect(g);
        g.connect(beds.crowd.gain);
        n.start();
        lfo.start();
      }
    }
    // Drone rotor hum (scaled by proximity).
    {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 138;
      const o2 = ctx.createOscillator();
      o2.type = 'sawtooth';
      o2.frequency.value = 207.6;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      const trem = ctx.createOscillator();
      trem.frequency.value = 31;
      const tg = ctx.createGain();
      tg.gain.value = 0.35;
      const g = ctx.createGain();
      g.gain.value = 0.6;
      trem.connect(tg);
      tg.connect(g.gain);
      o.connect(f);
      o2.connect(f);
      f.connect(g);
      g.connect(beds.hum.gain);
      o.start();
      o2.start();
      trem.start();
    }
    // Tension: a held dissonance and a slow pulse when a drone is closing in.
    {
      for (const hz of [146.8, 155.6, 311.1]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = hz;
        const g = ctx.createGain();
        g.gain.value = 0.3;
        o.connect(g);
        g.connect(beds.tension.gain);
        o.start();
      }
      const pulse = ctx.createOscillator();
      pulse.type = 'sine';
      pulse.frequency.value = 49;
      const pg = ctx.createGain();
      pg.gain.value = 0.0;
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 1.9;
      const lg = ctx.createGain();
      lg.gain.value = 0.6;
      lfo.connect(lg);
      lg.connect(pg.gain);
      pulse.connect(pg);
      pg.connect(beds.tension.gain);
      pulse.start();
      lfo.start();
    }
  }

  private setBed(name: keyof AmbienceMix | 'hum' | 'tension', v: number, slew = 0.6): void {
    const b = this.beds?.[name];
    if (!b || !this.ctx || Math.abs(b.target - v) < 0.004) return;
    b.target = v;
    b.gain.gain.setTargetAtTime(v, this.ctx.currentTime, slew);
  }

  ambience(m: AmbienceMix): void {
    this.mix = m;
    this.setBed('rain', m.rain * 0.16);
    this.setBed('wind', m.wind * 0.3);
    this.setBed('city', m.city * 0.1);
    this.setBed('crowd', m.crowd * 0.06);
    if (this.windFilter && this.ctx) {
      this.windFilter.frequency.setTargetAtTime(380 + m.wind * 500, this.ctx.currentTime, 1);
    }
  }

  /** 0..1 nearness of the closest drone. */
  hum(v: number): void {
    this.setBed('hum', v * 0.05, 0.15);
  }

  /** 0..1 detection pressure. */
  tension(v: number): void {
    this.setBed('tension', v * 0.09, 0.2);
  }

  // ----------------------------------------------------------- radio tuning
  tuning(c: number | null): void {
    const ctx = this.ctx;
    if (!ctx || !this.live) return;
    const t = ctx.currentTime;
    if (c === null) {
      const tn = this.tune;
      if (!tn) return;
      this.tune = null;
      tn.staticG.gain.setTargetAtTime(0, t, 0.1);
      tn.sigG.gain.setTargetAtTime(0, t, 0.4);
      tn.whistleG.gain.setTargetAtTime(0, t, 0.05);
      tn.whistle.stop(t + 1.5);
      return;
    }
    if (!this.tune) {
      const n = this.noise();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2200;
      bp.Q.value = 0.5;
      const staticG = ctx.createGain();
      staticG.gain.value = 0;
      n.connect(bp);
      bp.connect(staticG);
      staticG.connect(this.sfxBus);
      n.start();
      n.stop(t + 600);
      const sigFilter = ctx.createBiquadFilter();
      sigFilter.type = 'lowpass';
      sigFilter.frequency.value = 500;
      const sigG = ctx.createGain();
      sigG.gain.value = 0;
      sigFilter.connect(sigG);
      sigG.connect(this.sfxBus);
      sigG.connect(this.reverbIn);
      const whistle = ctx.createOscillator();
      whistle.type = 'sine';
      const whistleG = ctx.createGain();
      whistleG.gain.value = 0;
      whistle.connect(whistleG);
      whistleG.connect(this.sfxBus);
      whistle.start();
      this.tune = { staticG, sigG, whistle, whistleG, sigFilter, step: 0, next: t + 0.05 };
    }
    const tn = this.tune;
    tn.staticG.gain.setTargetAtTime(0.055 * (1 - c * 0.92), t, 0.05);
    tn.sigG.gain.setTargetAtTime(0.95 * c * c, t, 0.08);
    tn.sigFilter.frequency.setTargetAtTime(400 + c * c * 5000, t, 0.08);
    tn.whistle.frequency.setTargetAtTime(260 + (1 - c) * 2100, t, 0.03);
    tn.whistleG.gain.setTargetAtTime(0.024 * Math.sin(Math.PI * c), t, 0.05);
    // The Magpie call-sign, looping underneath the static.
    const JINGLE = [69, -1, 72, 76, -1, 74, 72, -1, 69, -1, 67, 69, -1, -1, 64, -1];
    while (tn.next < t + 0.2) {
      const note = JINGLE[tn.step % JINGLE.length]!;
      if (note >= 0) {
        this.tone('triangle', midi(note), tn.next, 0.01, 0.34, 0.3, tn.sigFilter);
        this.tone('sine', midi(note + 12), tn.next, 0.01, 0.2, 0.1, tn.sigFilter);
      }
      tn.step++;
      tn.next += 0.19;
    }
  }

  // ------------------------------------------------------------------ music
  music(id: string | null): void {
    if (this.wantTrack === id) return;
    this.wantTrack = id;
    if (this.ctx) this.startTrack(id);
  }

  private startTrack(id: string | null): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    if (this.track) {
      const old = this.track.out;
      old.gain.setTargetAtTime(0, t, 0.9);
      // (Offline, wall-clock time means nothing; the faded track is simply left connected.)
      if (!this.offline) window.setTimeout(() => old.disconnect(), 6000);
      this.track = null;
    }
    const def = id ? TRACKS[id] : undefined;
    if (!def) return;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(1, t + 0.3, 1.4);
    out.connect(this.musicBus);
    this.track = { def, out, step: 0, next: t + 0.4 };
  }

  /** Schedule upcoming notes. Call every frame. */
  update(): void {
    const ctx = this.ctx;
    const tr = this.track;
    if (!ctx || !tr || !this.live) return;
    const stepDur = 60 / tr.def.bpm / 4;
    if (tr.next < ctx.currentTime - 0.2) tr.next = ctx.currentTime + 0.05;
    while (tr.next < ctx.currentTime + 0.25) {
      this.scheduleStep(tr, tr.step, tr.next, stepDur);
      tr.step++;
      tr.next += stepDur;
    }
  }

  private scheduleStep(tr: LiveTrack, step: number, t: number, stepDur: number): void {
    const d = tr.def;
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const chord = d.chords[Math.floor(bar / d.barsPerChord) % d.chords.length]!;
    const out = tr.out;
    const wet = this.reverbIn;
    const rnd = (k: number): number => {
      let x = Math.imul((bar % d.phrase) * 131 + s * 17 + k * 7 + 3, 2654435761) >>> 0;
      x ^= x >>> 15;
      return (Math.imul(x, 2246822519) >>> 0) / 4294967296;
    };

    // Pad: restated once per chord, long overlap.
    if (s === 0 && bar % d.barsPerChord === 0 && d.pad > 0) {
      const len = stepDur * 16 * d.barsPerChord;
      for (const n of chord) {
        const f = midi(d.root + n);
        for (const det of [-7, 6]) {
          const o = this.ctx!.createOscillator();
          const g = this.ctx!.createGain();
          const lp = this.ctx!.createBiquadFilter();
          o.type = 'sawtooth';
          o.frequency.value = f;
          o.detune.value = det;
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(380, t);
          lp.frequency.linearRampToValueAtTime(d.padBright, t + len * 0.5);
          lp.frequency.linearRampToValueAtTime(380, t + len + 1);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.035 * d.pad, t + len * 0.35);
          g.gain.linearRampToValueAtTime(0.0001, t + len + 1.4);
          o.connect(lp);
          lp.connect(g);
          g.connect(out);
          g.connect(wet);
          o.start(t);
          o.stop(t + len + 1.5);
        }
      }
    }

    const hit = (pat: string): number => {
      const c = pat[s];
      return c === 'x' ? 1 : c === 'o' ? 0.5 : 0;
    };

    const b = hit(d.bass);
    if (b > 0) {
      const n = d.root + chord[0]! - 12 + (s === 10 && rnd(1) > 0.6 ? 7 : 0);
      this.tone('triangle', midi(n), t, 0.008, stepDur * 2.6, 0.2 * b * d.bassGain, out);
      this.tone('sine', midi(n - 12), t, 0.008, stepDur * 2.2, 0.16 * b * d.bassGain, out);
    }

    const a = hit(d.arp);
    if (a > 0) {
      const tones = chord.length;
      const idx = (Math.floor(s / 2) + (bar % 2 ? 1 : 0)) % tones;
      const n = d.root + chord[idx]! + 12 * d.arpOct;
      this.tone('square', midi(n), t, 0.004, stepDur * 1.5, 0.028 * a * d.arpGain, this.delayIn);
      this.tone('triangle', midi(n), t, 0.004, stepDur * 1.8, 0.04 * a * d.arpGain, out);
    }

    // Lead: a sparse bell line picked from chord and scale tones.
    if (d.lead > 0 && s % 2 === 0 && rnd(2) < d.lead * (s % 8 === 0 ? 1.6 : 1)) {
      const pool = rnd(3) < 0.7 ? chord : d.scale;
      const n = d.root + pool[Math.floor(rnd(4) * pool.length)]! + 12 * d.leadOct;
      const f = midi(n);
      const car = this.ctx!.createOscillator();
      const mod = this.ctx!.createOscillator();
      const mg = this.ctx!.createGain();
      const g = this.ctx!.createGain();
      mod.frequency.value = f * 2;
      mg.gain.setValueAtTime(f * 1.4, t);
      mg.gain.exponentialRampToValueAtTime(1, t + 0.5);
      mod.connect(mg);
      mg.connect(car.frequency);
      car.frequency.value = f;
      const len = stepDur * 6;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.06 * d.leadGain, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      car.connect(g);
      g.connect(out);
      g.connect(wet);
      g.connect(this.delayIn);
      car.start(t);
      mod.start(t);
      car.stop(t + len + 0.05);
      mod.stop(t + len + 0.05);
    }

    const k = hit(d.kick);
    if (k > 0) this.tone('sine', 128, t, 0.002, 0.17, 0.3 * k * d.drumGain, out, 44);
    const h = hit(d.hat);
    if (h > 0) this.burst(t, 0.001, 0.035, 0.05 * h * d.drumGain, 'highpass', 7000, 0.7, out);
    const sn = hit(d.snare);
    if (sn > 0) {
      this.burst(t, 0.001, 0.11, 0.09 * sn * d.drumGain, 'bandpass', 1900, 0.9, out);
      this.burst(t, 0.001, 0.2, 0.04 * sn * d.drumGain, 'bandpass', 1900, 0.9, wet);
    }
  }
}
