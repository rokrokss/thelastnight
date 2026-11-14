import { mix, shade } from '../core/color';
import { Rng } from '../core/math';
import { Art, type Ctx } from '../gfx/art';
import type { WorldBuilder } from '../gfx/world';
import type { Flicker, LevelData, LightDef } from '../game/level';
import { GLOW, RAMP, type GlowName } from './palette';

/** Things a painter leaves behind for the view to animate each frame. */
export interface Emitter {
  kind: 'steam' | 'smoke' | 'moth' | 'vent';
  x: number;
  y: number;
  rate: number;
  w?: number;
}

export interface FlickerRect {
  x: number;
  y: number;
  w: number;
  h: number;
  mode: Flicker;
  seed: number;
}

export interface PaintCtx {
  /** Play layer, behind everyone. */
  back: Art;
  /** Play layer, in front of actors flagged `behind` but behind everyone else (counters). */
  mid: Art;
  /** Play layer, in front of everyone. */
  front: Art;
  /** Reflection (R,G) and light-occluder (B) mask, aligned with the play layer. */
  mask: Ctx;
  lights: LightDef[];
  emitters: Emitter[];
  flickers: FlickerRect[];
  level: LevelData;
  /** Origin of world (0, 0) inside the mask canvas (same as the play surfaces). */
  ox: number;
  oy: number;
  /** Where floors and the sides and tops of things go. */
  depth: WorldBuilder;
}

export const glow = (name: string | undefined, fallback: GlowName = 'warm'): string =>
  (name && (GLOW as Record<string, string>)[name]) || (name && name.startsWith('#') ? name : GLOW[fallback]);

export const seedOf = (x: number, y: number, salt = 0): number =>
  (Math.imul(Math.round(x) + 977, 73856093) ^ Math.imul(Math.round(y) + 131, 19349663) ^ Math.imul(salt + 7, 83492791)) >>> 0;

// ---------------------------------------------------------------------------
// Mask helpers
// ---------------------------------------------------------------------------

/**
 * Mark a floor band as reflective. Each row stores its distance below the
 * mirror line so the shader can mirror the scene above it.
 */
export function maskFloor(
  c: PaintCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  refl: (px: number, row: number) => number,
): void {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.min(250, Math.round(h));
  if (w <= 0 || h <= 0) return;
  const mk = c.mask;
  const img = mk.createImageData(w, h);
  const d = img.data;
  for (let row = 0; row < h; row++) {
    for (let i = 0; i < w; i++) {
      const k = (row * w + i) * 4;
      d[k] = row + 1;
      d[k + 1] = Math.max(0, Math.min(255, Math.round(refl(x + i, row) * 255)));
      d[k + 2] = 0;
      d[k + 3] = 255;
    }
  }
  mk.putImageData(img, x + c.ox, y + c.oy);
}

export function maskOccluder(c: PaintCtx, x: number, y: number, w: number, h: number): void {
  const mk = c.mask;
  mk.save();
  mk.globalCompositeOperation = 'lighter';
  mk.fillStyle = '#0000ff';
  mk.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  mk.restore();
}

// ---------------------------------------------------------------------------
// Surface helpers
// ---------------------------------------------------------------------------

/** Flat wall with grime, streaks and a little noise so it does not read as a plain rectangle. */
export function wall(a: Art, x: number, y: number, w: number, h: number, ramp: readonly string[], rng: Rng): void {
  if (w <= 0 || h <= 0) return;
  a.rect(x, y, w, h, ramp[1]!);
  a.speckle(x, y, w, h, mix(ramp[1]!, ramp[2]!, 0.6), Math.floor((w * h) / 64), () => rng.next());
  a.speckle(x, y, w, h, mix(ramp[1]!, ramp[0]!, 0.5), Math.floor((w * h) / 100), () => rng.next());
  // Water streaks running down from the top.
  const streaks = Math.floor(w / 13);
  for (let i = 0; i < streaks; i++) {
    const sx = x + rng.int(1, Math.max(1, w - 3));
    const len = rng.int(Math.floor(h * 0.15), Math.floor(h * 0.7));
    a.tint(sx, y, rng.int(1, 3), len, ramp[0]!, rng.range(0.16, 0.34));
  }
  // Darker toward the ground, where dirt collects.
  a.tint(x, y + h - 9, w, 9, ramp[0]!, 0.3);
  a.tint(x, y + h - 3, w, 3, ramp[0]!, 0.35);
}

export function bricks(a: Art, x: number, y: number, w: number, h: number, ramp: readonly string[]): void {
  for (let j = 0; j < h; j += 4) {
    a.tint(x, y + j + 3, w, 1, ramp[0]!, 0.5);
    for (let i = (j / 4) % 2 ? 4 : 0; i < w; i += 8) a.tint(x + i, y + j, 1, 3, ramp[0]!, 0.4);
  }
}

export function tiles(a: Art, x: number, y: number, w: number, h: number, ramp: readonly string[], size = 4): void {
  for (let j = size - 1; j < h; j += size) a.tint(x, y + j, w, 1, ramp[0]!, 0.3);
  for (let i = size - 1; i < w; i += size) a.tint(x + i, y, 1, h, ramp[0]!, 0.22);
}

/** Corrugated roll-up shutter. */
export function shutter(a: Art, x: number, y: number, w: number, h: number, ramp: readonly string[], rng: Rng): void {
  a.rect(x, y, w, h, ramp[1]!);
  for (let j = 0; j < h; j += 3) {
    a.rect(x, y + j, w, 1, ramp[2]!);
    a.rect(x, y + j + 2, w, 1, ramp[0]!);
  }
  a.rect(x, y, w, 2, ramp[0]!);
  a.rect(x, y + h - 2, w, 2, ramp[3]!);
  a.rect(x + Math.floor(w / 2) - 1, y + h - 5, 3, 3, ramp[0]!);
  // Spray tag.
  if (rng.chance(0.7)) {
    const tc = rng.pick(['#c84a7a', '#4ac8b8', '#d8c84a', '#8a6ad8']);
    let tx = x + rng.int(3, Math.max(4, w - 22));
    let ty = y + rng.int(8, Math.max(9, h - 12));
    for (let i = 0; i < 7; i++) {
      const nx = tx + rng.int(1, 4);
      const ny = ty + rng.int(-4, 4);
      a.line(tx, ty, nx, ny, mix(tc, ramp[1]!, 0.18));
      tx = nx;
      ty = ny;
    }
  }
}

export interface WindowOpts {
  lit?: string | null;
  style?: 'plain' | 'blinds' | 'curtain' | 'bars' | 'figure' | 'plant';
  frame?: string;
}

/** A window; lit ones are emissive and show a hint of the room inside. */
export function windowUnit(a: Art, x: number, y: number, w: number, h: number, o: WindowOpts, rng: Rng): void {
  const frame = o.frame ?? '#2a2e38';
  a.rect(x - 1, y - 1, w + 2, h + 2, frame);
  a.rect(x - 1, y - 1, w + 2, 1, shade(frame, 1.5));
  if (o.lit) {
    const c = o.lit;
    a.emit(x, y, w, h, c, 0.18);
    a.emit(x, y, w, 2, shade(c, 0.8), 0.18);
    // Interior shapes are darker emissive, like objects against a lit wall.
    const dark = shade(c, 0.42);
    const style = o.style ?? 'plain';
    if (style === 'blinds') {
      for (let j = 1; j < h; j += 2) a.emit(x, y + j, w, 1, shade(c, 0.6), 0.18);
    } else if (style === 'curtain') {
      const cw = rng.int(Math.floor(w * 0.25), Math.floor(w * 0.6));
      a.emit(rng.chance(0.5) ? x : x + w - cw, y, cw, h, shade(c, 0.62), 0.18);
    } else if (style === 'figure') {
      const fx = x + rng.int(2, Math.max(2, w - 6));
      a.emit(fx, y + h - 9, 4, 9, dark, 0.3);
      a.emit(fx + 1, y + h - 12, 3, 3, dark, 0.3);
    } else if (style === 'plant') {
      const fx = x + rng.int(1, Math.max(1, w - 5));
      a.emit(fx, y + h - 3, 4, 3, dark, 0.3);
      a.emit(fx + 1, y + h - 7, 2, 4, shade(c, 0.5), 0.3);
      a.emit(fx - 1, y + h - 6, 1, 2, shade(c, 0.5), 0.3);
      a.emit(fx + 4, y + h - 5, 1, 2, shade(c, 0.5), 0.3);
    } else if (style === 'bars') {
      for (let i = 2; i < w; i += 3) a.emit(x + i, y, 1, h, dark, 0.3);
    }
  } else {
    const g = RAMP.glass;
    a.rect(x, y, w, h, g[1]);
    a.rect(x, y, w, Math.max(1, Math.floor(h / 3)), g[2]);
    a.line(x + 1, y + h - 2, x + Math.min(w - 2, 5), y + 1, g[3]);
    if (o.style === 'bars') for (let i = 2; i < w; i += 3) a.rect(x + i, y, 1, h, '#1a1e26');
  }
  // Mullion and sill.
  a.rect(x + Math.floor(w / 2), y, 1, h, frame);
  a.rect(x - 2, y + h + 1, w + 4, 2, shade(frame, 1.7));
  a.rect(x - 2, y + h + 3, w + 4, 1, shade(frame, 0.6));
}

/** Wall-mounted air conditioner with its drip stain. */
export function acUnit(a: Art, x: number, y: number, rng: Rng): void {
  const m = RAMP.plaster;
  a.rect(x, y, 12, 8, m[2]);
  a.rect(x, y, 12, 1, m[3]);
  a.rect(x, y + 7, 12, 1, m[0]);
  a.rect(x + 1, y + 2, 7, 5, m[0]);
  for (let i = 0; i < 3; i++) a.rect(x + 2, y + 2 + i * 2, 5, 1, m[1]);
  a.px(x + 10, y + 2, '#3a4046');
  a.rect(x + 2, y + 8, 1, 2, RAMP.metal[0]);
  a.tint(x + 1, y + 9, 3, rng.int(8, 22), '#20242a', 0.3);
}

/** Dark signboard with glowing lettering. */
export function signBoard(
  c: PaintCtx,
  a: Art,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  color: string,
  lightbox = false,
): void {
  if (lightbox) {
    a.rect(x - 1, y - 1, w + 2, h + 2, '#22262e');
    a.emit(x, y, w, h, shade(color, 0.82), 0.5);
    a.emit(x, y, w, 1, color, 0.5);
    a.text(text, x + Math.floor(w / 2), y + Math.floor((h - 7) / 2), '#141820', { font: 'g9', align: 'center' });
  } else {
    a.rect(x - 1, y - 1, w + 2, h + 2, '#30343e');
    a.rect(x, y, w, h, '#14171d');
    a.rect(x, y, w, 1, '#0c0e12');
    a.text(text, x + Math.floor(w / 2), y + Math.floor((h - 7) / 2), color, {
      font: 'g9',
      align: 'center',
      emit: true,
      base: 0.5,
    });
  }
  c.lights.push({ x: x + w / 2, y: y + h / 2 + 4, r: 56 + w * 0.35, color, k: lightbox ? 0.55 : 0.5, falloff: 1.7 });
}

/** Projecting blade sign with stacked letters. */
export function bladeSign(c: PaintCtx, a: Art, x: number, y: number, text: string, color: string, rng: Rng): void {
  const chars = [...text];
  const h = chars.length * 9 + 5;
  const w = 12;
  a.rect(x - 4, y + 3, 4, 1, '#3a404c');
  a.rect(x - 4, y + h - 5, 4, 1, '#3a404c');
  a.rect(x - 1, y - 1, w + 2, h + 2, '#343a46');
  a.rect(x, y, w, h, '#12151b');
  a.rect(x + w, y, 1, h, '#4a5260');
  a.text(text, x + 2, y + 3, color, { font: 'g9', vertical: true, emit: true, base: 0.5, gap: 2 });
  c.lights.push({ x: x + w / 2, y: y + h / 2, r: 50 + h * 0.5, color, k: 0.55, falloff: 1.6 });
  if (rng.chance(0.35)) c.flickers.push({ x: x - 1, y: y - 1, w: w + 3, h: h + 2, mode: 'buzz', seed: seedOf(x, y) });
}

/** Free-standing neon lettering (tube sign) with no backing board. */
export function neonText(
  c: PaintCtx,
  a: Art,
  x: number,
  y: number,
  text: string,
  color: string,
  scale = 1,
  flicker: Flicker = 'none',
): void {
  a.text(text, x + 1, y + 1, '#0b0d12', { font: 'g11b', scale, align: 'center' });
  a.text(text, x, y, color, { font: 'g11b', scale, align: 'center', emit: true, base: 0.55 });
  const w = text.length * 7 * scale;
  c.lights.push({ x, y: y + 6 * scale, r: 64 + w * 0.5, color, k: 0.75, falloff: 1.6 });
  if (flicker !== 'none') {
    c.flickers.push({ x: x - w / 2 - 2, y: y - 2, w: w + 4, h: 12 * scale + 4, mode: flicker, seed: seedOf(x, y) });
  }
}

/** Sagging cable between two points. */
export function cable(a: Art, x0: number, y0: number, x1: number, y1: number, sag: number, col = '#0c0e13'): void {
  const n = Math.max(4, Math.ceil(Math.abs(x1 - x0) / 6));
  let px = x0;
  let py = y0;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const nx = x0 + (x1 - x0) * u;
    const ny = y0 + (y1 - y0) * u + Math.sin(Math.PI * u) * sag;
    a.line(px, py, nx, ny, col);
    px = nx;
    py = ny;
  }
}

/** A string of bare bulbs. */
export function bulbString(c: PaintCtx, a: Art, x0: number, y0: number, x1: number, y1: number, sag: number, color: string): void {
  cable(a, x0, y0, x1, y1, sag);
  const n = Math.max(2, Math.floor(Math.abs(x1 - x0) / 11));
  for (let i = 1; i < n; i++) {
    const u = i / n;
    const bx = Math.round(x0 + (x1 - x0) * u);
    const by = Math.round(y0 + (y1 - y0) * u + Math.sin(Math.PI * u) * sag);
    a.px(bx, by + 1, '#30343c');
    a.emit(bx, by + 2, 2, 2, color, 0.7);
  }
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2 + sag;
  c.lights.push({ x: mx, y: my + 4, r: Math.abs(x1 - x0) * 0.55 + 46, color, k: 0.5, falloff: 1.5 });
}

// ---------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------

/** Wet street: asphalt band below the walking line, with patchy reflectivity and puddles. */
/**
 * The kerb along the walking line. The road itself is not painted here any
 * more: it is a real plane in the scene's depth (see art/depth.ts), so it
 * can run toward the lens and away to the horizon.
 */
export function street(c: PaintCtx, x0: number, x1: number, gy: number, _bottom: number, seed: number): void {
  const a = c.back;
  const w = x1 - x0;
  const as = RAMP.asphalt;
  const pv = RAMP.paving;
  const rng = new Rng(seed);
  a.rect(x0, gy, w, 1, pv[3]);
  a.rect(x0, gy + 1, w, 2, pv[1]);
  a.rect(x0, gy + 3, w, 1, as[0]);
  for (let i = x0 + rng.int(0, 20); i < x1; i += 24) a.rect(i, gy + 1, 1, 2, pv[0]);
}

// ---------------------------------------------------------------------------
// Street furniture
// ---------------------------------------------------------------------------

/** Sodium street lamp. Lamp head points toward `dir`. */
export function lamp(c: PaintCtx, x: number, gy: number, dir: 1 | -1 = 1, height = 78, color: string = GLOW.sodium): void {
  const a = c.back;
  const y = gy;
  const m = RAMP.metal;
  a.rect(x - 1, y - 6, 4, 6, m[1]);
  a.rect(x, y - height, 2, height - 6, m[1]);
  a.rect(x, y - height, 1, height - 6, m[2]);
  const ax = dir > 0 ? x + 2 : x - 14;
  a.rect(ax, y - height, 14, 2, m[1]);
  a.rect(ax, y - height, 14, 1, m[2]);
  const hx = dir > 0 ? x + 9 : x - 14;
  a.rect(hx, y - height + 2, 7, 2, m[0]);
  a.emit(hx + 1, y - height + 4, 5, 2, color, 0.8);
  c.lights.push({
    x: hx + 3.5,
    y: gy - height + 7,
    r: 150,
    color,
    k: 1.05,
    cone: { dx: 0, dy: 1, inner: 0.5, outer: 1.02 },
    shadow: true,
    falloff: 1.25,
  });
  c.lights.push({ x: hx + 3.5, y: gy - height + 6, r: 34, color, k: 0.6 });
  c.emitters.push({ kind: 'moth', x: hx + 3.5, y: gy - height + 12, rate: 1 });
}

export function vending(c: PaintCtx, x: number, gy: number, color: string, rng: Rng): void {
  const a = c.back;
  const y = gy;
  const body = rng.pick(['#8a2a30', '#2a4f8a', '#d8d4cc', '#2a6a5a']);
  a.rect(x, y - 36, 20, 36, body);
  a.rect(x, y - 36, 20, 1, shade(body, 1.4));
  a.rect(x, y - 36, 1, 36, shade(body, 0.7));
  a.rect(x + 19, y - 36, 1, 36, shade(body, 0.6));
  a.emit(x + 2, y - 33, 13, 19, shade(color, 0.72), 0.5);
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 4; i++) {
      a.emit(x + 3 + i * 3, y - 31 + j * 6, 2, 4, rng.pick(['#e8584a', '#4ac8a8', '#e8c84a', '#f0f0f0', '#5a8ae8']), 0.5);
    }
    a.rect(x + 2, y - 27 + j * 6, 13, 1, '#20242c');
  }
  a.rect(x + 16, y - 32, 3, 8, '#16181e');
  a.epx(x + 17, y - 30, GLOW.green);
  a.epx(x + 17, y - 27, GLOW.red);
  a.rect(x + 3, y - 10, 13, 6, '#0e1014');
  a.rect(x + 1, y - 2, 18, 2, '#14161a');
  c.lights.push({ x: x + 9, y: gy - 24, r: 62, color, k: 0.7, falloff: 1.6 });
}

/** Left edges of the two stools in front of a stall (so levels can seat customers on them). */
export const stallSeats = (x: number, w: number): [number, number] => [x + 14, x + w - 24];

/** Tarp-covered food stall: the warm heart of the night market. */
export function stall(c: PaintCtx, x: number, gy: number, w: number, text: string, rampName: 'tarpOrange' | 'tarpBlue' | 'tarpRed', rng: Rng): void {
  const a = c.back;
  const f = c.mid;
  const y = gy;
  const t = RAMP[rampName];
  const roofY = y - 50;
  const eaveY = y - 39;
  const m = RAMP.metal;
  const lightCol = rampName === 'tarpBlue' ? '#bfe0ff' : GLOW.warm;

  // Back wall of tarp, lit from inside so it glows through the cloth.
  const inner = rampName === 'tarpBlue' ? '#3f7fa8' : rampName === 'tarpRed' ? '#c8523a' : '#e07a2c';
  a.emit(x + 2, eaveY, w - 4, 39, shade(inner, 0.62), 0.5);
  for (let i = x + 2; i < x + w - 2; i += 9) a.emit(i, eaveY, 1, 39, shade(inner, 0.46), 0.5);
  a.emit(x + 2, eaveY, w - 4, 3, shade(inner, 0.4), 0.5);
  // Shelf silhouettes against the glow: bottles, bowls, a kettle.
  const shelfY = y - 27;
  a.emit(x + 6, shelfY, w - 12, 1, shade(inner, 0.24), 0.3);
  for (let i = x + 8; i < x + w - 10; i += rng.int(4, 7)) {
    const bh = rng.int(3, 7);
    a.emit(i, shelfY - bh, rng.int(2, 3), bh, shade(inner, rng.range(0.2, 0.34)), 0.3);
  }
  // Frame poles.
  a.rect(x, eaveY - 2, 2, 41, m[1]);
  a.rect(x + w - 2, eaveY - 2, 2, 41, m[1]);
  a.rect(x, eaveY - 2, 1, 41, m[2]);
  // Roof tarp with a sagging front edge.
  for (let j = 0; j < 11; j++) {
    const inset = Math.max(0, 5 - j);
    const shadeIdx = j < 2 ? 3 : j < 7 ? 2 : 1;
    a.rect(x - 4 + inset, roofY + j, w + 8 - inset * 2, 1, t[shadeIdx]);
  }
  for (let i = x - 2; i < x + w + 2; i += 12) a.rect(i, roofY + 2, 1, 9, t[1]);
  // Scalloped valance hanging from the eave.
  for (let i = x - 4; i < x + w + 4; i += 6) {
    a.rect(i, eaveY, 6, 4, t[1]);
    a.rect(i + 1, eaveY + 4, 4, 1, t[1]);
    a.rect(i, eaveY, 1, 4, t[0]);
  }
  a.rect(x - 4, eaveY - 1, w + 8, 1, t[0]);
  // Menu banner.
  const bw = Math.min(w - 28, text.length * 6 + 10);
  const bx = x + Math.floor((w - bw) / 2);
  a.rect(bx, eaveY - 8, bw, 10, '#ece6d6');
  a.rect(bx, eaveY + 1, bw, 1, '#b8b2a2');
  a.rect(bx, eaveY - 8, 1, 10, '#cfc8b6');
  a.text(text, bx + Math.floor(bw / 2), eaveY - 6, '#8a2218', { font: 'g9', align: 'center' });
  // Hanging bulbs.
  for (const i of [x + 7, x + w - 8]) {
    a.rect(i, eaveY + 3, 1, 4, '#1a1c22');
    a.emit(i - 1, eaveY + 7, 3, 3, lightCol, 0.8);
    c.lights.push({ x: i + 0.5, y: gy - 30, r: 84, color: lightCol, k: 0.62, falloff: 1.5 });
  }
  // Counter, in front of anyone standing in the stall.
  const cy = y - 17;
  f.rect(x + 3, cy, w - 6, 3, RAMP.wood[2]);
  f.rect(x + 3, cy, w - 6, 1, RAMP.wood[3]);
  f.rect(x + 3, cy + 3, w - 6, 14, t[1]);
  for (let i = x + 3; i < x + w - 3; i += 8) f.rect(i, cy + 3, 1, 14, t[0]);
  f.rect(x + 3, cy + 15, w - 6, 2, t[0]);
  // Pots and a steaming pan on the counter.
  const px = x + 10;
  f.rect(px, cy - 5, 11, 5, m[2]);
  f.rect(px, cy - 5, 11, 1, m[3]);
  f.rect(px - 1, cy - 4, 1, 2, m[1]);
  f.rect(px + 11, cy - 4, 1, 2, m[1]);
  c.emitters.push({ kind: 'steam', x: px + 5, y: gy - 23, rate: 9, w: 8 });
  const kx = x + w - 24;
  f.rect(kx, cy - 3, 9, 3, m[1]);
  f.rect(kx + 9, cy - 2, 4, 1, m[0]);
  for (let i = 0; i < 4; i++) f.rect(x + 26 + i * 5, cy - 2 - (i % 2), 3, 2 + (i % 2), i % 2 ? '#d8d2c4' : '#b84a3a');
  c.emitters.push({ kind: 'steam', x: kx + 4, y: gy - 21, rate: 4, w: 6 });
  // Plastic stools out front.
  for (const sx of stallSeats(x, w)) {
    const sc = rng.pick(['#b83a34', '#2a6a9a', '#c8b83a']);
    f.rect(sx, y - 8, 8, 2, sc);
    f.rect(sx, y - 8, 8, 1, shade(sc, 1.3));
    f.rect(sx + 1, y - 6, 1, 6, shade(sc, 0.7));
    f.rect(sx + 6, y - 6, 1, 6, shade(sc, 0.7));
  }
}

/** Small scattered objects that make a street feel used. */
export function clutter(c: PaintCtx, kind: string, x: number, gy: number, rng: Rng, front = false): void {
  const a = front ? c.front : c.back;
  const y = gy;
  switch (kind) {
    case 'crates': {
      const wd = RAMP.wood;
      const n = rng.int(2, 3);
      for (let i = 0; i < n; i++) {
        const cx = x + i * 13 + rng.int(-1, 1);
        const stack = i === 1 ? 2 : 1;
        for (let s = 0; s < stack; s++) {
          const cy = y - 11 - s * 11;
          a.rect(cx, cy, 12, 11, wd[2]);
          a.rect(cx, cy, 12, 1, wd[3]);
          a.rect(cx, cy + 10, 12, 1, wd[0]);
          a.rect(cx, cy, 1, 11, wd[1]);
          a.rect(cx + 11, cy, 1, 11, wd[1]);
          a.line(cx + 1, cy + 1, cx + 10, cy + 9, wd[1]);
        }
      }
      break;
    }
    case 'bags': {
      for (let i = 0; i < 3; i++) {
        const bx = x + i * 8 + rng.int(-1, 1);
        const bh = rng.int(6, 9);
        const col = rng.pick(['#1c2026', '#23282e', '#2a3038']);
        a.rect(bx, y - bh, 9, bh, col);
        a.rect(bx + 1, y - bh - 1, 7, 1, col);
        a.px(bx + 4, y - bh - 2, '#3a404a');
        a.px(bx + 2, y - bh + 2, '#3a424e');
      }
      break;
    }
    case 'cone': {
      a.rect(x, y - 2, 8, 2, '#2a2e34');
      a.rect(x + 2, y - 5, 4, 3, '#d8642a');
      a.rect(x + 2, y - 7, 4, 2, '#e8e4dc');
      a.rect(x + 3, y - 11, 2, 4, '#d8642a');
      break;
    }
    case 'barrel': {
      const col = rng.pick(['#2a5a7a', '#6a3a2a', '#4a5a3a']);
      a.rect(x, y - 16, 11, 16, col);
      a.rect(x, y - 16, 11, 1, shade(col, 1.4));
      a.rect(x, y - 11, 11, 1, shade(col, 0.6));
      a.rect(x, y - 5, 11, 1, shade(col, 0.6));
      a.rect(x, y - 16, 2, 16, shade(col, 0.75));
      break;
    }
    case 'plant': {
      a.rect(x + 1, y - 7, 8, 7, '#7a4a34');
      a.rect(x, y - 8, 10, 2, '#94583e');
      for (let i = 0; i < 9; i++) {
        const lx = x + rng.int(0, 9);
        const lh = rng.int(4, 13);
        a.line(lx, y - 8, lx + rng.int(-3, 3), y - 8 - lh, rng.pick(['#2a5a3a', '#3a7a4a', '#1e4a34']));
      }
      break;
    }
    case 'scooter': {
      const body = rng.pick(['#b83a34', '#d8d4cc', '#2a5a8a', '#2a2e36']);
      a.disc(x + 4, y - 4, 3.5, '#101216');
      a.disc(x + 23, y - 4, 3.5, '#101216');
      a.px(x + 4, y - 4, '#5a6270');
      a.px(x + 23, y - 4, '#5a6270');
      a.rect(x + 6, y - 9, 14, 4, body);
      a.rect(x + 2, y - 12, 9, 3, '#1a1c22');
      a.rect(x + 1, y - 18, 6, 6, shade(body, 0.8));
      a.rect(x + 1, y - 18, 6, 1, shade(body, 1.3));
      a.line(x + 20, y - 8, x + 23, y - 17, body, 2);
      a.rect(x + 20, y - 18, 6, 1, '#1a1c22');
      a.epx(x + 25, y - 14, '#ffe9b0', 0.6);
      a.epx(x + 1, y - 10, '#ff4b3a', 0.5);
      break;
    }
    case 'bike': {
      a.disc(x + 5, y - 6, 5, '#14161a');
      a.disc(x + 24, y - 6, 5, '#14161a');
      a.px(x + 5, y - 6, '#5a6270');
      a.px(x + 24, y - 6, '#5a6270');
      a.line(x + 5, y - 6, x + 13, y - 14, '#6a7482');
      a.line(x + 13, y - 14, x + 22, y - 14, '#6a7482');
      a.line(x + 22, y - 14, x + 24, y - 6, '#6a7482');
      a.line(x + 13, y - 14, x + 15, y - 6, '#6a7482');
      a.rect(x + 11, y - 16, 5, 2, '#1a1c22');
      a.rect(x + 21, y - 18, 4, 1, '#1a1c22');
      break;
    }
    case 'bollard': {
      a.rect(x, y - 13, 4, 13, '#3a404a');
      a.rect(x, y - 13, 4, 1, '#5a6270');
      a.rect(x, y - 10, 4, 2, '#d8c84a');
      break;
    }
    case 'bin': {
      a.rect(x, y - 15, 10, 15, '#2f4a3a');
      a.rect(x - 1, y - 17, 12, 2, '#3f634c');
      a.rect(x, y - 15, 2, 15, '#243a2e');
      a.rect(x + 3, y - 11, 5, 1, '#1a2a22');
      break;
    }
    case 'pallet': {
      const wd = RAMP.wood;
      a.rect(x, y - 4, 26, 1, wd[3]);
      a.rect(x, y - 3, 26, 1, wd[1]);
      for (let i = 0; i < 3; i++) a.rect(x + i * 11, y - 2, 4, 2, wd[2]);
      break;
    }
    case 'stool': {
      const sc = rng.pick(['#b83a34', '#2a6a9a', '#c8b83a']);
      a.rect(x, y - 8, 8, 2, sc);
      a.rect(x + 1, y - 6, 1, 6, shade(sc, 0.7));
      a.rect(x + 6, y - 6, 1, 6, shade(sc, 0.7));
      break;
    }
    case 'hydrant': {
      a.rect(x + 1, y - 10, 5, 10, '#a83a2e');
      a.rect(x, y - 11, 7, 2, '#c84a3a');
      a.rect(x - 1, y - 7, 9, 2, '#8a2e24');
      a.rect(x + 2, y - 13, 3, 2, '#c84a3a');
      break;
    }
    case 'radio': {
      // A battered transistor radio: a recurring motif.
      a.rect(x, y - 7, 11, 7, '#6a4a3a');
      a.rect(x, y - 7, 11, 1, '#8a6a4e');
      a.rect(x + 1, y - 5, 5, 4, '#2a2420');
      a.px(x + 8, y - 4, '#d8c8a8');
      a.line(x + 9, y - 7, x + 13, y - 14, '#8a8f98');
      break;
    }
  }
}

/** Poster or flyer pasted on a wall. */
export function poster(a: Art, x: number, y: number, rng: Rng, text?: string): void {
  const w = text ? Math.max(18, text.length * 5 + 6) : rng.int(9, 14);
  const h = text ? 12 : rng.int(11, 16);
  const bg = rng.pick(['#c8c0a8', '#a8b8b0', '#c8a890', '#b0a8c0', '#d0c890']);
  a.rect(x, y, w, h, bg);
  a.rect(x, y + h - 1, w, 1, shade(bg, 0.7));
  if (text) {
    a.text(text, x + Math.floor(w / 2), y + 3, '#2a2428', { font: 'g7', align: 'center' });
  } else {
    a.rect(x + 2, y + 2, w - 4, Math.floor(h / 2) - 1, rng.pick(['#8a3a34', '#3a5a7a', '#5a6a3a', '#2a2a34']));
    for (let j = Math.floor(h / 2) + 2; j < h - 2; j += 2) a.rect(x + 2, y + j, rng.int(3, w - 4), 1, '#5a5650');
  }
  if (rng.chance(0.4)) a.rect(x + w - 3, y, 3, 3, shade(bg, 0.55));
}

/** Corrugated sheet fencing around an empty lot. */
export function fence(c: PaintCtx, x: number, gy: number, w: number, h: number, rng: Rng): void {
  const a = c.back;
  const m = RAMP.metal;
  for (let px = x; px < x + w; px += 22) {
    const pw = Math.min(22, x + w - px);
    const ph = h + rng.int(-3, 3);
    const base = rng.chance(0.3) ? RAMP.rust[1] : rng.pick([m[1], m[2], '#3f4f5a', '#4a4650']);
    a.rect(px, gy - ph, pw, ph, base);
    for (let i = 1; i < pw; i += 3) a.rect(px + i, gy - ph, 1, ph, shade(base, 0.78));
    a.rect(px, gy - ph, pw, 1, shade(base, 1.35));
    a.rect(px, gy - ph, 1, ph, shade(base, 0.6));
    a.tint(px, gy - 10, pw, 10, '#14161a', 0.35);
    if (rng.chance(0.35)) poster(a, px + rng.int(2, 8), gy - ph + rng.int(6, 16), rng);
  }
}

/** A short stoop in front of a doorway. */
export function steps(c: PaintCtx, x: number, gy: number, w: number, n = 3): void {
  const cc = RAMP.concrete;
  for (let i = 0; i < n; i++) {
    const sx = x + i * 3;
    const sw = w - i * 6;
    const sy = gy - (i + 1) * 4;
    c.back.rect(sx, sy, sw, 4, cc[2]);
    c.back.rect(sx, sy, sw, 1, cc[3]);
    c.back.rect(sx, sy + 3, sw, 1, cc[0]);
  }
}
