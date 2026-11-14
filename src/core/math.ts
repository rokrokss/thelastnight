export const TAU = Math.PI * 2;

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential approach. */
export const damp = (cur: number, target: number, lambda: number, dt: number): number =>
  cur + (target - cur) * (1 - Math.exp(-lambda * dt));
export const approach = (cur: number, target: number, maxDelta: number): number =>
  cur < target ? Math.min(cur + maxDelta, target) : Math.max(cur - maxDelta, target);
export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Deterministic PRNG (mulberry32). */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  /** Integer in [a, b] inclusive. */
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]!;
  }
}

/** Stateless hash → [0,1). */
export function hash2(x: number, y: number, seed = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function valueNoise(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let fx = x - xi;
  let fy = y - yi;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}

export function fbm(x: number, y: number, octaves = 4, seed = 0): number {
  let s = 0;
  let a = 0.5;
  let n = 0;
  for (let i = 0; i < octaves; i++) {
    s += a * valueNoise(x, y, seed + i * 31);
    n += a;
    x = x * 2.03 + 17;
    y = y * 2.03 + 9;
    a *= 0.5;
  }
  return s / n;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const pointInRect = (px: number, py: number, r: Rect): boolean =>
  px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h;

/** Segment vs AABB intersection test (used for line-of-sight). */
export function segmentHitsRect(x0: number, y0: number, x1: number, y1: number, r: Rect): boolean {
  let tmin = 0;
  let tmax = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  for (let axis = 0; axis < 2; axis++) {
    const o = axis === 0 ? x0 : y0;
    const d = axis === 0 ? dx : dy;
    const lo = axis === 0 ? r.x : r.y;
    const hi = lo + (axis === 0 ? r.w : r.h);
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return false;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}
