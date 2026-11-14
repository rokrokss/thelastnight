import { mix, rgb, shade } from '../core/color';
import { clamp01, fbm, Rng, smoothstep } from '../core/math';
import { Art } from '../gfx/art';
import { GLOW } from './palette';

/**
 * Distant scenery. These layers sit behind the focal plane and get blurred by
 * the depth-of-field pass, so they are painted for shape, value and points of
 * light rather than fine detail.
 */

export interface SkyOpts {
  w: number;
  h: number;
  /** Gradient stops from zenith to horizon. */
  stops: string[];
  stars: number;
  clouds: number;
  cloudColor: string;
  moon?: { x: number; y: number; r: number; color: string };
  /** A low sun: wide warm glow with a small disc. */
  sun?: { x: number; y: number; r: number; color: string };
  seed: number;
}

export function paintSky(o: SkyOpts): Art {
  const a = new Art(o.w, o.h);
  const g = a.c.createLinearGradient(0, 0, 0, o.h);
  o.stops.forEach((s, i) => g.addColorStop(i / (o.stops.length - 1), s));
  a.c.fillStyle = g;
  a.c.fillRect(0, 0, o.w, o.h);
  a.g.fillStyle = '#000';
  a.g.fillRect(0, 0, o.w, o.h);

  const rng = new Rng(o.seed);
  for (let i = 0; i < o.stars; i++) {
    const x = rng.int(0, o.w - 1);
    const y = Math.floor(Math.pow(rng.next(), 1.8) * o.h * 0.55);
    const b = rng.range(0.25, 0.8);
    a.emit(x, y, 1, 1, shade('#cfe0ff', b), 0.5);
  }

  if (o.moon) {
    const m = o.moon;
    a.halo(m.x, m.y, m.r * 5.5, m.color, 0.1);
    a.halo(m.x, m.y, m.r * 2.4, m.color, 0.16);
    a.disc(m.x, m.y, m.r, shade(m.color, 0.5), true, 0.4);
    a.disc(m.x - m.r * 0.3, m.y + m.r * 0.2, m.r * 0.28, shade(m.color, 0.4), true, 0.4);
  }

  if (o.sun) {
    const m = o.sun;
    a.halo(m.x, m.y, m.r * 16, m.color, 0.3);
    a.halo(m.x, m.y, m.r * 7, m.color, 0.5);
    a.halo(m.x, m.y, m.r * 3, '#fff2d8', 0.6);
    a.disc(m.x, m.y, m.r, '#fff6e0', true, 0.9);
  }

  if (o.clouds > 0) {
    // Cloud deck lit from below by the city.
    const img = a.c.getImageData(0, 0, o.w, o.h);
    const d = img.data;
    const C = rgb(o.cloudColor);
    for (let y = 0; y < o.h; y++) {
      const band = smoothstep(0.05, 0.75, y / o.h);
      for (let x = 0; x < o.w; x++) {
        const n = fbm(x * 0.012, y * 0.034, 5, o.seed);
        const t = clamp01((n - 0.42) * 3.2) * o.clouds * (0.35 + band * 0.65);
        if (t <= 0) continue;
        const k = (y * o.w + x) * 4;
        d[k] = d[k]! + (C[0] - d[k]!) * t;
        d[k + 1] = d[k + 1]! + (C[1] - d[k + 1]!) * t;
        d[k + 2] = d[k + 2]! + (C[2] - d[k + 2]!) * t;
      }
    }
    a.c.putImageData(img, 0, 0);
  }
  return a;
}

export interface SkylineOpts {
  w: number;
  h: number;
  /** Buildings stand on this row and extend to the bottom of the art. */
  baseY: number;
  seed: number;
  width: [number, number];
  height: [number, number];
  gap: [number, number];
  body: string;
  /** Colour the silhouettes fade into near the ground (fog). */
  haze: string;
  hazeAmt: number;
  lit: string[];
  litRatio: number;
  /** Window cell [w, h, pitchX, pitchY]. */
  cell: [number, number, number, number];
  /** Chance of a glowing billboard or neon band on a building. */
  signs: number;
  beacons: number;
  /** Chance a building is a much taller tower. */
  towers: number;
}

const SIGN_COLORS = [GLOW.pink, GLOW.cyan, GLOW.amber, GLOW.green, GLOW.red, GLOW.violet, GLOW.teal, GLOW.blue];

export function paintSkyline(o: SkylineOpts): Art {
  const a = new Art(o.w, o.h);
  const rng = new Rng(o.seed);
  const [cw, ch, px, py] = o.cell;
  let x = -rng.int(0, o.width[0]);
  while (x < o.w) {
    const bw = rng.int(o.width[0], o.width[1]);
    let bh = rng.int(o.height[0], o.height[1]);
    if (rng.chance(o.towers)) bh = Math.floor(bh * rng.range(1.5, 2.2));
    const top = o.baseY - bh;
    const body = shade(o.body, rng.range(0.82, 1.18));
    a.rect(x, top, bw, o.h - top, body);
    a.rect(x, top, 1, o.h - top, shade(body, 1.35));
    a.rect(x + bw - 1, top, 1, o.h - top, shade(body, 0.7));
    // Upper tier / crown.
    let crownTop = top;
    if (rng.chance(0.45) && bw > 14) {
      const tw = Math.floor(bw * rng.range(0.4, 0.75));
      const th = rng.int(6, Math.max(7, Math.floor(bh * 0.28)));
      const tx = x + rng.int(0, bw - tw);
      a.rect(tx, top - th, tw, th, body);
      a.rect(tx, top - th, 1, th, shade(body, 1.35));
      crownTop = top - th;
      if (rng.chance(0.5)) a.rect(tx + Math.floor(tw / 2), crownTop - rng.int(6, 22), 1, 22, shade(body, 0.8));
    } else if (rng.chance(0.4)) {
      a.rect(x + rng.int(2, Math.max(2, bw - 3)), top - rng.int(5, 18), 1, 18, shade(body, 0.8));
    }
    // Roof clutter.
    for (let i = 0; i < Math.floor(bw / 12); i++) {
      if (rng.chance(0.5)) a.rect(x + rng.int(1, Math.max(1, bw - 6)), top - rng.int(2, 4), rng.int(3, 6), 4, shade(body, 0.9));
    }

    // Windows.
    const ratio = o.litRatio * rng.range(0.35, 1.6);
    const tone = rng.pick(o.lit);
    const pattern = rng.int(0, 3);
    for (let wy = top + 4; wy < o.baseY - 2; wy += py) {
      const rowOn = pattern === 1 ? rng.chance(0.55) : true;
      if (!rowOn) continue;
      for (let wx = x + 3; wx + cw < x + bw - 2; wx += px) {
        if (pattern === 2 && ((wx - x) / px) % 3 === 2) continue;
        if (!rng.chance(pattern === 1 ? Math.min(0.9, ratio * 2) : ratio)) continue;
        const col = rng.chance(0.72) ? tone : rng.pick(o.lit);
        a.emit(wx, wy, cw, ch, shade(col, rng.range(0.55, 1)), 0.4);
      }
    }

    // Signage.
    if (rng.chance(o.signs) && bw > 12) {
      const sc = rng.pick(SIGN_COLORS);
      if (rng.chance(0.5)) {
        const sw = rng.int(Math.floor(bw * 0.5), bw - 2);
        const sh = rng.int(5, 12);
        const sx = x + rng.int(1, Math.max(1, bw - sw - 1));
        const sy = top + rng.int(3, Math.max(4, Math.floor(bh * 0.4)));
        a.emit(sx, sy, sw, sh, shade(sc, 0.8), 0.4);
        for (let i = 0; i < 3; i++) a.emit(sx + 1 + rng.int(0, Math.max(0, sw - 5)), sy + 1 + rng.int(0, Math.max(0, sh - 3)), rng.int(2, 4), 2, shade(sc, 0.4), 0.3);
      } else {
        const sx = x + (rng.chance(0.5) ? 2 : bw - 4);
        a.emit(sx, top + 5, 2, rng.int(10, Math.max(11, Math.floor(bh * 0.5))), sc, 0.4);
      }
    }
    if (rng.chance(o.beacons)) a.emit(x + Math.floor(bw / 2), crownTop - 1, 1, 1, GLOW.red, 0.5);

    x += bw + rng.int(o.gap[0], o.gap[1]);
  }
  hazeBand(a, o.baseY - Math.floor(o.height[1] * 0.75), o.baseY + 6, o.haze, o.hazeAmt);
  return a;
}

/** Fog gathering at the foot of a layer: fades existing pixels toward a colour. */
export function hazeBand(a: Art, y0: number, y1: number, color: string, amount: number): void {
  const C = rgb(color);
  for (const [k, isGlow] of [
    [a.c, false],
    [a.g, true],
  ] as const) {
    k.save();
    k.globalCompositeOperation = 'source-atop';
    const g = k.createLinearGradient(0, y0, 0, y1);
    if (isGlow) {
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${amount * 0.5})`);
    } else {
      g.addColorStop(0, `rgba(${C[0]},${C[1]},${C[2]},0)`);
      g.addColorStop(1, `rgba(${C[0]},${C[1]},${C[2]},${amount})`);
    }
    k.fillStyle = g;
    k.fillRect(0, y0, a.w, a.h - y0);
    k.restore();
  }
}

/** The broadcast spire: a landmark visible from every district. */
export function paintSpire(h: number, body: string): Art {
  const w = 46;
  const a = new Art(w, h);
  const cx = Math.floor(w / 2);
  const mastTop = 6;
  for (let y = mastTop; y < h; y++) {
    const u = (y - mastTop) / (h - mastTop);
    const half = Math.max(1, Math.round(1 + u * u * 15));
    a.rect(cx - half, y, 1, 1, body);
    a.rect(cx + half, y, 1, 1, body);
    if (y % 9 === 0) a.rect(cx - half, y, half * 2 + 1, 1, body);
    if (y % 9 === 4) {
      a.line(cx - half, y - 4, cx + half, y + 4, shade(body, 0.85));
      a.line(cx + half, y - 4, cx - half, y + 4, shade(body, 0.85));
    }
  }
  a.rect(cx, 0, 1, mastTop + 30, body);
  // Dish clusters and warning lights.
  for (const u of [0.22, 0.4, 0.62]) {
    const y = Math.floor(mastTop + u * (h - mastTop));
    const half = Math.round(1 + u * u * 15);
    a.rect(cx - half - 3, y - 1, half * 2 + 7, 3, shade(body, 1.2));
    a.emit(cx - half - 3, y, 1, 1, GLOW.red, 0.5);
    a.emit(cx + half + 3, y, 1, 1, GLOW.red, 0.5);
    a.emit(cx - 1, y + 3, 3, 1, mix(GLOW.cyan, '#ffffff', 0.3), 0.4);
  }
  a.emit(cx, 0, 1, 2, GLOW.red, 0.6);
  return a;
}

/** A lit train to run along an elevated line in the middle distance. */
export function paintTrain(cars: number, body: string): Art {
  const cw = 46;
  const a = new Art(cars * (cw + 2), 11);
  for (let i = 0; i < cars; i++) {
    const x = i * (cw + 2);
    a.rect(x, 1, cw, 9, body);
    a.rect(x, 1, cw, 1, shade(body, 1.4));
    a.rect(x, 9, cw, 1, shade(body, 0.6));
    for (let k = 3; k < cw - 4; k += 6) a.emit(x + k, 3, 4, 3, '#ffe2a8', 0.5);
    a.rect(x + cw, 4, 2, 3, shade(body, 0.6));
  }
  a.emit(0, 6, 1, 2, '#fff4d0', 0.6);
  a.emit(a.w - 3, 6, 1, 2, GLOW.red, 0.6);
  return a;
}
