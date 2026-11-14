import { BAR, BPM } from './film';

/**
 * The trailer's music, written out bar by bar and scheduled in one go on an
 * offline audio context. Like the game's score it is all synthesis; unlike
 * the game's, which loops, this one has a beginning, a middle and an end.
 *
 * The theme is the Radio Magpie call-sign the player hears when a relay locks.
 */
const midi = (n: number): number => 440 * 2 ** ((n - 69) / 12);
const BEAT = 60 / BPM;
/** One sixteenth note. */
const S = BEAT / 4;
/** Bar and sixteenth-step to seconds. */
const at = (bar: number, step = 0): number => bar * BAR + step * S;

/** The call-sign, one note per step (-1 is a rest). */
const THEME = [69, -1, 72, 76, -1, 74, 72, -1, 69, -1, 67, 69, -1, -1, 64, -1];

interface Chord {
  /** Bass note. */
  root: number;
  pad: number[];
  /** Tones the arpeggio walks, low to high. */
  arp: number[];
}

const Am: Chord = { root: 33, pad: [57, 60, 64, 71], arp: [57, 60, 64, 69, 72, 76] };
const F: Chord = { root: 41, pad: [53, 57, 60, 64], arp: [53, 57, 60, 65, 69, 72] };
const C: Chord = { root: 36, pad: [55, 60, 62, 64], arp: [55, 60, 64, 67, 72, 76] };
const G: Chord = { root: 43, pad: [55, 59, 62, 69], arp: [55, 59, 62, 67, 71, 74] };
const E: Chord = { root: 40, pad: [56, 59, 64, 68], arp: [52, 56, 59, 64, 68, 71] };

export class Score {
  private ctx: BaseAudioContext;
  private out: GainNode;
  private wet: GainNode;
  private echo: GainNode;
  private noiseBuf: AudioBuffer;

  constructor(ctx: BaseAudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.connect(dest);

    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // A large, dark hall: decaying filtered noise as the impulse response.
    const irLen = Math.floor(ctx.sampleRate * 3.4);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < irLen; i++) {
        const t = i / irLen;
        lp += (Math.random() * 2 - 1 - lp) * (0.45 - t * 0.36);
        d[i] = lp * Math.pow(1 - t, 2.2);
      }
    }
    const hall = ctx.createConvolver();
    hall.buffer = ir;
    this.wet = ctx.createGain();
    const hallOut = ctx.createGain();
    hallOut.gain.value = 0.5;
    this.wet.connect(hall);
    hall.connect(hallOut);
    hallOut.connect(dest);

    // Dotted-eighth echo, in time.
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = BEAT * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.34;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2600;
    this.echo = ctx.createGain();
    this.echo.connect(delay);
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    damp.connect(this.out);
    damp.connect(this.wet);
  }

  // ------------------------------------------------------------- voices
  private tone(type: OscillatorType, freq: number, t: number, attack: number, decay: number, peak: number, dest: AudioNode, slideTo?: number): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + attack + decay);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  private hiss(t: number, attack: number, decay: number, peak: number, type: BiquadFilterType, freq: number, q: number, dest: AudioNode, sweepTo?: number): void {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.loopStart = Math.random();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + decay);
    f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(t);
    s.stop(t + attack + decay + 0.05);
  }

  /** Slow strings: detuned saws behind a filter that opens and closes over the chord. */
  private pad(t: number, len: number, notes: number[], gain: number, bright: number): void {
    for (const n of notes) {
      for (const det of [-8, 7]) {
        const o = this.ctx.createOscillator();
        const lp = this.ctx.createBiquadFilter();
        const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.value = midi(n);
        o.detune.value = det;
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(320, t);
        lp.frequency.linearRampToValueAtTime(bright, t + len * 0.5);
        lp.frequency.linearRampToValueAtTime(320, t + len + 1);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.03 * gain, t + Math.min(1.2, len * 0.35));
        g.gain.setValueAtTime(0.03 * gain, t + len * 0.8);
        g.gain.linearRampToValueAtTime(0.0001, t + len + 1.2);
        o.connect(lp);
        lp.connect(g);
        g.connect(this.out);
        g.connect(this.wet);
        o.start(t);
        o.stop(t + len + 1.3);
      }
    }
  }

  /** A held low note that fades in and out: the floor under a quiet passage. */
  private drone(t0: number, t1: number, note: number, gain: number): void {
    for (const [type, n, level] of [
      ['sine', note, 0.07],
      ['sawtooth', note + 12, 0.03],
      ['sine', note + 19, 0.02],
    ] as const) {
      const o = this.ctx.createOscillator();
      const lp = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = midi(n);
      lp.type = 'lowpass';
      lp.frequency.value = 500;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(level * gain, t0 + (t1 - t0) * 0.45);
      g.gain.linearRampToValueAtTime(0.0001, t1);
      o.connect(lp);
      lp.connect(g);
      g.connect(this.out);
      g.connect(this.wet);
      o.start(t0);
      o.stop(t1 + 0.05);
    }
  }

  private bass(t: number, note: number, len: number, gain: number): void {
    this.tone('triangle', midi(note + 12), t, 0.006, len, 0.17 * gain, this.out);
    this.tone('sine', midi(note), t, 0.006, len * 0.9, 0.2 * gain, this.out);
  }

  private pluck(t: number, note: number, gain: number): void {
    this.tone('square', midi(note), t, 0.004, S * 1.5, 0.024 * gain, this.echo);
    this.tone('triangle', midi(note), t, 0.004, S * 1.9, 0.045 * gain, this.out);
  }

  /** A struck bell (two-operator FM). */
  private bell(t: number, note: number, gain: number, len = 1.3): void {
    const f = midi(note);
    const car = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const mg = this.ctx.createGain();
    const g = this.ctx.createGain();
    mod.frequency.value = f * 2;
    mg.gain.setValueAtTime(f * 1.5, t);
    mg.gain.exponentialRampToValueAtTime(1, t + 0.5);
    mod.connect(mg);
    mg.connect(car.frequency);
    car.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.075 * gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    car.connect(g);
    g.connect(this.out);
    g.connect(this.wet);
    g.connect(this.echo);
    car.start(t);
    mod.start(t);
    car.stop(t + len + 0.05);
    mod.stop(t + len + 0.05);
  }

  private kick(t: number, gain: number): void {
    this.tone('sine', 132, t, 0.002, 0.2, 0.34 * gain, this.out, 42);
    this.hiss(t, 0.001, 0.02, 0.05 * gain, 'lowpass', 1800, 0.7, this.out);
  }

  private snare(t: number, gain: number): void {
    this.hiss(t, 0.001, 0.13, 0.11 * gain, 'bandpass', 1900, 0.9, this.out);
    this.hiss(t, 0.001, 0.3, 0.05 * gain, 'bandpass', 1900, 0.9, this.wet);
    this.tone('triangle', 190, t, 0.001, 0.07, 0.07 * gain, this.out, 120);
  }

  private hat(t: number, gain: number): void {
    this.hiss(t, 0.001, 0.035, 0.045 * gain, 'highpass', 7200, 0.7, this.out);
  }

  /** The trailer hit: a sub drop and a thump, with a long tail in the hall. */
  private boom(t: number, gain: number): void {
    this.tone('sine', 64, t, 0.004, 2.4, 0.36 * gain, this.out, 29);
    this.tone('sine', 128, t, 0.003, 0.5, 0.16 * gain, this.out, 40);
    this.hiss(t, 0.002, 0.4, 0.2 * gain, 'lowpass', 900, 0.6, this.out, 120);
    this.hiss(t, 0.002, 0.9, 0.16 * gain, 'lowpass', 500, 0.6, this.wet, 90);
    this.tone('sine', 55, t + 0.02, 0.01, 1.6, 0.22 * gain, this.wet, 30);
  }

  /** Rising noise and pitch that cuts off dead at `t1`. */
  private riser(t0: number, t1: number, gain: number): void {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(240, t0);
    f.frequency.exponentialRampToValueAtTime(7200, t1);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.13 * gain, t1);
    g.gain.setValueAtTime(0.0001, t1 + 0.012);
    s.connect(f);
    f.connect(g);
    g.connect(this.out);
    g.connect(this.wet);
    s.start(t0);
    s.stop(t1 + 0.05);
    const o = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t0);
    o.frequency.exponentialRampToValueAtTime(440, t1);
    og.gain.setValueAtTime(0.0001, t0);
    og.gain.exponentialRampToValueAtTime(0.03 * gain, t1);
    og.gain.setValueAtTime(0.0001, t1 + 0.012);
    o.connect(og);
    og.connect(this.wet);
    o.start(t0);
    o.stop(t1 + 0.05);
  }

  /** A chord that grows out of nothing and stops at `t1`: the breath before a downbeat. */
  private swell(t0: number, t1: number, notes: number[], gain: number): void {
    for (const n of notes) {
      const o = this.ctx.createOscillator();
      const lp = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = midi(n);
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(300, t0);
      lp.frequency.exponentialRampToValueAtTime(3600, t1);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.045 * gain, t1);
      g.gain.setValueAtTime(0.0001, t1 + 0.015);
      o.connect(lp);
      lp.connect(g);
      g.connect(this.out);
      g.connect(this.wet);
      o.start(t0);
      o.stop(t1 + 0.05);
    }
  }

  /** Air moving past the lens on a cut. */
  private whoosh(t: number, gain: number): void {
    this.hiss(t - 0.16, 0.16, 0.24, 0.05 * gain, 'bandpass', 600, 0.8, this.wet, 3200);
  }

  // ------------------------------------------------------------ patterns
  private bars(from: number, chords: Chord[], each: (bar: number, c: Chord, i: number) => void): void {
    chords.forEach((c, i) => each(from + i, c, i));
  }

  /** Sixteenth-note arpeggio up and down the chord. */
  private arp(bar: number, c: Chord, gain: number, octave = 0): void {
    const walk = [0, 2, 4, 3, 1, 3, 5, 4, 2, 4, 3, 1, 0, 2, 5, 3];
    for (let s = 0; s < 16; s++) {
      const accent = s % 4 === 0 ? 1 : s % 2 === 0 ? 0.8 : 0.62;
      this.pluck(at(bar, s), c.arp[walk[s]!]! + 12 * octave, gain * accent);
    }
  }

  private pulse(bar: number, c: Chord, gain: number, sixteenths = false): void {
    for (let s = 0; s < 16; s += sixteenths ? 1 : 2) {
      const up = sixteenths && s % 2 === 1;
      this.bass(at(bar, s), c.root + (up ? 12 : 0), S * (sixteenths ? 1.6 : 2.6), gain * (up ? 0.55 : s % 4 === 0 ? 1 : 0.8));
    }
  }

  private beat(bar: number, kick: string, snare: string, hat: string, gain: number): void {
    const hit = (p: string, s: number): number => (p[s] === 'x' ? 1 : p[s] === 'o' ? 0.5 : 0);
    for (let s = 0; s < 16; s++) {
      const t = at(bar, s);
      const k = hit(kick, s);
      const sn = hit(snare, s);
      const h = hit(hat, s);
      if (k) this.kick(t, k * gain);
      if (sn) this.snare(t, sn * gain);
      if (h) this.hat(t, h * gain);
    }
  }

  /** The theme, `step` sixteenths per note. */
  private theme(t0: number, step: number, transpose: number, gain: number, voice: 'bell' | 'signal'): void {
    THEME.forEach((n, i) => {
      if (n < 0) return;
      const t = t0 + i * step * S;
      if (voice === 'bell') {
        this.bell(t, n + transpose, gain, 1.5);
        this.tone('triangle', midi(n + transpose - 12), t, 0.008, step * S * 1.8, 0.05 * gain, this.out);
      } else {
        // As the game's tuner plays it: a plain triangle with its octave on top.
        this.tone('triangle', midi(n + transpose), t, 0.01, 0.42, 0.2 * gain, this.out);
        this.tone('sine', midi(n + transpose + 12), t, 0.01, 0.26, 0.07 * gain, this.wet);
        this.tone('triangle', midi(n + transpose), t, 0.01, 0.5, 0.06 * gain, this.wet);
      }
    });
  }

  // ----------------------------------------------------------- the piece
  compose(): void {
    const NONE = '................';

    // Cold open (bars 0-3). Only a low note under the static, swelling toward the first downbeat.
    this.drone(2.2, at(4) + 1.5, 33, 0.9);
    this.riser(at(3, 6), at(4), 0.55);

    // The city (4-7). The theme's first notes, one to a half bar, as far-off bells.
    this.boom(at(4), 0.6);
    this.pad(at(4), 2 * BAR, Am.pad, 1, 1200);
    this.pad(at(6), 2 * BAR, F.pad, 1, 1300);
    this.bass(at(4), Am.root, 4.2, 0.7);
    this.bass(at(6), F.root, 4.2, 0.7);
    [69, 72, 76, 74, 72, 69].forEach((n, i) => this.bell(at(4, 8 + i * 8), n, 0.8, 2.2));
    // Somebody is listening: a heartbeat, and a wrong note in the strings.
    this.beat(6, 'x..o............', NONE, NONE, 0.55);
    this.beat(7, 'x..o....x..o....', NONE, NONE, 0.7);
    this.pad(at(7), BAR, [52, 53], 0.7, 700);
    this.riser(at(7, 10), at(8), 0.4);

    // The alert (8): everything stops for it.
    this.boom(at(8), 1);
    for (const s of [1, 5, 9]) {
      this.tone('square', 1480, at(8, s), 0.002, 0.07, 0.035, this.out);
      this.tone('square', 1110, at(8, s) + 0.09, 0.002, 0.11, 0.035, this.out);
    }
    this.pad(at(8), BAR, [40, 52, 56, 59], 0.7, 800);
    this.riser(at(8, 10), at(9), 0.4);

    // Over the roofs (9-10): the pulse starts.
    this.bars(9, [C, G], (bar, c) => {
      this.pad(at(bar), BAR, c.pad, 0.9, 1500);
      this.pulse(bar, c, 0.75);
      this.arp(bar, c, 0.7);
      this.beat(bar, 'x.......x.....o.', NONE, '..o...o...o...o.', 0.75);
    });
    // The first relay (11): one bright chord as it lights.
    this.pad(at(11), BAR, Am.pad, 0.9, 1400);
    this.bass(at(11), Am.root, 2.2, 0.8);
    this.kick(at(11), 0.7);
    [81, 84, 88, 93].forEach((n, i) => this.bell(at(11) + 0.55 + i * 0.07, n, 0.75, 2.4));
    this.riser(at(11, 10), at(12), 0.5);

    // "The warning was sold" (12): a hit and an empty bar.
    this.boom(at(12), 1.1);
    this.pad(at(12), BAR, [45, 52, 57], 0.9, 520);
    this.swell(at(12, 8), at(13), Am.pad, 0.8);

    // The climb (13-18): each pair of bars adds something.
    this.bars(13, [F, F, C, C, G, E], (bar, c, i) => {
      const lift = 0.7 + i * 0.06;
      this.pad(at(bar), BAR, c.pad, 0.85, 1400 + i * 180);
      this.pulse(bar, c, 0.85);
      this.arp(bar, c, lift);
      if (i < 2) this.beat(bar, 'x...x...x...x...', NONE, '..o...o...o...o.', 0.8);
      else if (i < 4) this.beat(bar, 'x...x...x...x...', '....x.......x...', '..x...x...x...x.', 0.85);
      else this.beat(bar, 'x...x...x...x.o.', '....x.......x...', 'o.x.o.x.o.x.o.x.', 0.9);
    });
    this.boom(at(13), 0.6);
    this.boom(at(17), 0.7);
    for (let s = 8; s < 16; s++) this.snare(at(18, s), 0.35 + (s - 8) * 0.06);
    this.riser(at(18, 4), at(19), 0.7);

    // "Four dead relays. One night." (19): the floor drops out; a clock ticks.
    this.boom(at(19), 1.1);
    this.pad(at(19), BAR, [45, 57, 62, 64], 0.9, 900);
    for (let s = 0; s < 16; s++) this.hat(at(19, s), s % 4 === 0 ? 0.6 : 0.28);
    this.riser(at(19, 2), at(20), 0.9);
    this.swell(at(19, 8), at(20), F.pad, 0.9);

    // Montage (20-25): everything, with a cut every half bar.
    const lead = [69, 72, 71, 74, 72, 76, 76, 79, 77, 81, 80, 83];
    this.bars(20, [F, G, Am, C, F, E], (bar, c, i) => {
      this.pad(at(bar), BAR, c.pad, 1, 2200);
      this.pulse(bar, c, 0.9, true);
      this.arp(bar, c, 0.95);
      this.arp(bar, c, 0.5, 1);
      this.beat(bar, 'x...x...x...x...', '....x.......x..o', 'x.xxx.xxx.xxx.xx', 0.95);
      this.bell(at(bar), lead[i * 2]!, 1, 1.4);
      this.bell(at(bar, 8), lead[i * 2 + 1]!, 1, 1.4);
      this.whoosh(at(bar), 1);
      this.whoosh(at(bar, 8), 1);
    });
    this.boom(at(20), 1);
    this.boom(at(22), 0.7);
    this.boom(at(24), 0.8);
    for (let s = 0; s < 8; s++) this.snare(at(25, s), 0.3 + s * 0.04);
    for (let s = 16; s < 32; s++) this.snare(at(25) + s * (S / 2), 0.5 + (s - 16) * 0.035);
    this.riser(at(24, 8), at(26), 1.1);

    // The break (26-27): one hit, then nothing but a high, thin note and the hall.
    this.boom(at(26), 1.25);
    {
      const t0 = at(26) + 0.9;
      const t1 = at(28) - 0.3;
      for (const [n, level] of [
        [88, 0.02],
        [95, 0.008],
      ] as const) {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.value = midi(n);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(level, t0 + 1.6);
        g.gain.linearRampToValueAtTime(0.0001, t1);
        o.connect(g);
        g.connect(this.out);
        g.connect(this.wet);
        o.start(t0);
        o.stop(t1 + 0.05);
      }
    }
    this.swell(at(27, 6), at(28), [48, 55, 60, 64, 67], 1.1);
    this.riser(at(27, 8), at(28), 0.6);

    // On the air (28-31): the relative major, and the theme at last, twice, the second time higher.
    const C2: Chord = { root: 36, pad: [48, 55, 60, 64, 67, 72], arp: [60, 64, 67, 72, 76, 79] };
    const G2: Chord = { root: 43, pad: [55, 59, 62, 67, 71], arp: [59, 62, 67, 71, 74, 79] };
    const Am2: Chord = { root: 33, pad: [57, 60, 64, 69, 72], arp: [57, 60, 64, 69, 72, 76] };
    const F2: Chord = { root: 41, pad: [53, 57, 60, 65, 69], arp: [57, 60, 65, 69, 72, 77] };
    this.bars(28, [C2, G2, Am2, F2], (bar, c, i) => {
      this.pad(at(bar), BAR, c.pad, 1.15, 2800);
      this.bass(at(bar), c.root, BAR * 0.95, 1);
      this.pulse(bar, c, 0.7);
      this.arp(bar, c, 0.85, 1);
      this.beat(bar, 'x.....x...o.....', '........x.......', 'x.x.x.x.x.x.x.x.', 1);
      this.boom(at(bar), i === 0 ? 1.2 : 0.55);
    });
    this.theme(at(28), 2, 12, 1.1, 'bell');
    this.theme(at(30), 2, 24, 0.9, 'bell');
    this.theme(at(30), 2, 12, 0.8, 'bell');
    for (let s = 8; s < 16; s++) this.snare(at(31, s), 0.4 + (s - 8) * 0.07);
    this.riser(at(31, 4), at(32), 0.9);

    // SKYWAVE (32-33): the last chord, and the call-sign once, plainly, the way the game plays it.
    this.boom(at(32), 1.3);
    this.pad(at(32), 3.2, [48, 55, 60, 62, 64, 67], 1.1, 2000);
    this.bass(at(32), 36, 4, 1);
    this.theme(at(32, 4), 1, 12, 1, 'signal');
    this.bell(at(33, 4) + 0.1, 88, 0.7, 2.4);
  }
}
