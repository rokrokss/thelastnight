import { clamp, clamp01 } from '../core/math';
import type { TuneConfig } from './director';

/**
 * Radio tuning: steer a dial (and optionally a gain knob) onto a wandering
 * signal and hold it there until it locks.
 */
export class Tuner {
  readonly cfg: TuneConfig;
  f: number;
  g: number;
  lock = 0;
  done = false;
  t = 0;
  /** > 0 right after an interference burst (for feedback). */
  kicked = 0;
  private held = 0;
  private rnd: () => number;

  constructor(cfg: TuneConfig, rnd: () => number = Math.random) {
    this.cfg = cfg;
    this.rnd = rnd;
    this.f = cfg.freq < 0.5 ? cfg.freq + 0.4 : cfg.freq - 0.4;
    this.g = cfg.gain === undefined ? 1 : cfg.gain < 0.5 ? cfg.gain + 0.4 : cfg.gain - 0.4;
  }

  /** Where the signal is right now (it drifts). */
  get targetF(): number {
    const d = this.cfg.drift ?? 0;
    return clamp(this.cfg.freq + d * (Math.sin(this.t * 0.9) * 0.6 + Math.sin(this.t * 0.37 + 1) * 0.4), 0.04, 0.96);
  }

  get closeness(): number {
    const cf = 1 - clamp01(Math.abs(this.f - this.targetF) / 0.2);
    const cg = this.cfg.gain === undefined ? 1 : 1 - clamp01(Math.abs(this.g - this.cfg.gain) / 0.3);
    return cf * cg;
  }

  update(dt: number, ax: number, ay: number): void {
    if (this.done) return;
    this.t += dt;
    this.kicked = Math.max(0, this.kicked - dt);
    // Tapping nudges; holding sweeps faster.
    this.held = ax !== 0 || ay !== 0 ? this.held + dt : 0;
    const speed = 0.1 + Math.min(1, this.held / 0.7) * 0.34;
    this.f = clamp01(this.f + ax * speed * dt);
    if (this.cfg.gain !== undefined) this.g = clamp01(this.g - ay * speed * dt);
    const kick = this.cfg.kick ?? 0;
    if (kick > 0 && this.rnd() < kick * dt) {
      this.f = clamp01(this.f + (this.rnd() - 0.5) * 0.34);
      this.lock *= 0.5;
      this.kicked = 0.35;
    }
    if (this.closeness > 0.88) this.lock += dt / (this.cfg.hold ?? 1.6);
    else this.lock = Math.max(0, this.lock - dt * 0.7);
    if (this.lock >= 1) {
      this.lock = 1;
      this.done = true;
    }
  }
}
