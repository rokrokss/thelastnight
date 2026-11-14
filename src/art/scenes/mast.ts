import { PAD } from '../../core/constants';
import { rgb, shade } from '../../core/color';
import { clamp01, fbm, Rng, smoothstep } from '../../core/math';
import { Art } from '../../gfx/art';
import type { LevelData } from '../../game/level';
import { paintSky, paintSpire } from '../city';
import { GLOW, RAMP } from '../palette';
import { cable, maskFloor, type PaintCtx } from '../paint';
import { paintProp } from '../props';
import {
  beginScene,
  DEFAULT_LOOK,
  layerFloor,
  layerSize,
  paintLadder,
  paintOneWay,
  paintSolid,
  type SceneArt,
} from '../scene';

/** A band of cloud seen from above: bright rim, city glow bleeding up from beneath. */
export function fogSea(w: number, h: number, top: number, seed: number, tint: string, under: string, density: number): Art {
  const a = new Art(w, h);
  const img = a.c.createImageData(w, h);
  const gimg = a.g.createImageData(w, h);
  const d = img.data;
  const gd = gimg.data;
  const T = rgb(tint);
  const U = rgb(under);
  for (let y = 0; y < h; y++) {
    const depth = (y - top) / Math.max(1, h - top);
    for (let x = 0; x < w; x++) {
      const n = fbm(x * 0.012, y * 0.05, 5, seed);
      const edge = top + (n - 0.5) * 46;
      const a0 = smoothstep(edge - 3, edge + 12, y) * density;
      if (a0 <= 0.003) continue;
      const k = (y * w + x) * 4;
      // Billows: brighter crests, darker troughs.
      const billow = fbm(x * 0.03 + 9, y * 0.11, 3, seed + 7);
      const lum = 0.55 + billow * 0.6 - clamp01(depth) * 0.25;
      const glowN = fbm(x * 0.007 + 3, y * 0.02, 3, seed + 21);
      const ug = clamp01((glowN - 0.48) * 4) * clamp01(depth * 1.6 + 0.15);
      d[k] = Math.min(255, T[0] * lum);
      d[k + 1] = Math.min(255, T[1] * lum);
      d[k + 2] = Math.min(255, T[2] * lum);
      d[k + 3] = a0 * 255;
      gd[k] = U[0] * ug * 0.8;
      gd[k + 1] = U[1] * ug * 0.8;
      gd[k + 2] = U[2] * ug * 0.8;
      gd[k + 3] = a0 * 255;
    }
  }
  a.c.putImageData(img, 0, 0);
  a.g.putImageData(gimg, 0, 0);
  return a;
}

/** Steel service deck with hazard edging, a handrail and trusses dropping away beneath it. */
export function steelDeck(c: PaintCtx, x0: number, x1: number, G: number, seed: number): void {
  const a = c.back;
  const m = RAMP.metal;
  const w = x1 - x0;
  for (let x = x0; x < x1; x += 46) {
    a.rect(x, G + 12, 5, 120, m[0]);
    a.line(x + 2, G + 12, x + 48, G + 70, shade(m[0], 0.8), 2);
  }
  a.rect(x0, G, w, 12, m[1]);
  a.rect(x0, G, w, 1, m[3]);
  a.rect(x0, G + 1, w, 1, m[2]);
  for (let x = x0; x < x1; x += 32) {
    a.rect(x, G + 2, 1, 6, m[0]);
    a.px(x + 4, G + 3, m[3]);
    a.px(x + 27, G + 3, m[3]);
  }
  for (let x = x0; x < x1; x += 8) {
    a.rect(x, G + 8, 4, 4, '#b89a2a');
    a.rect(x + 4, G + 8, 4, 4, '#1a1c20');
  }
  a.rect(x0, G + 12, w, 2, '#0a0c10');
  maskFloor(c, x0, G, w, 8, (px) => 0.2 + 0.25 * fbm(px * 0.04, 1.3, 2, seed));
  a.rect(x0, G - 14, w, 1, m[2]);
  a.rect(x0, G - 7, w, 1, m[0]);
  for (let x = x0 + 6; x < x1; x += 22) a.rect(x, G - 14, 1, 14, m[1]);
}

/** Lattice mast: two converging legs with cross-bracing. */
function truss(c: PaintCtx, xl0: number, xr0: number, y0: number, xl1: number, xr1: number, y1: number): void {
  const a = c.back;
  const m = RAMP.metal;
  const at = (y: number): [number, number] => {
    const u = (y - y1) / (y0 - y1);
    return [xl1 + (xl0 - xl1) * u, xr1 + (xr0 - xr1) * u];
  };
  for (let y = y1; y < y0; y += 40) {
    const [l0, r0] = at(y);
    const [l1, r1] = at(Math.min(y0, y + 40));
    a.line(l0 + 1, y, r1 - 1, Math.min(y0, y + 40), m[0]);
    a.line(r0 - 1, y, l1 + 1, Math.min(y0, y + 40), m[0]);
    a.rect(l0, y, r0 - l0, 2, m[1]);
    a.rect(l0, y, r0 - l0, 1, m[2]);
  }
  for (let y = y1; y < y0; y++) {
    const [l, r] = at(y);
    a.rect(l - 1, y, 3, 1, m[1]);
    a.px(l - 1, y, m[3]);
    a.rect(r - 1, y, 3, 1, m[1]);
    a.px(r + 1, y, m[0]);
  }
}

/** Prologue — Mast 14, standing out of the fog above Saltgate. */
export function paintMast(level: LevelData): SceneArt {
  const { c, art } = beginScene(level, {
    ...DEFAULT_LOOK,
    ambPlay: [0.33, 0.39, 0.56],
    fogColor: [0.2, 0.26, 0.36],
    fogMid: 0.1,
    groundFog: 0.62,
    scatter: 0.13,
    reflect: 0.35,
    blurFar: 1.6,
    blurMid: 1.1,
    blurFg: 5,
    bloom: 0.6,
    shadowTint: [0.0, 0.012, 0.04],
    highTint: [0.02, 0.012, 0.0],
  });
  const a = c.back;
  const m = RAMP.metal;
  const G = level.groundY;
  const W = level.width;
  const rng = new Rng(level.seed);

  steelDeck(c, -PAD, W + PAD, G, level.seed);

  // The mast itself.
  truss(c, 338, 562, G, 428, 472, 96);
  a.rect(449, 40, 2, 60, m[1]);
  a.rect(444, 60, 12, 1, m[1]);
  a.rect(446, 76, 8, 1, m[1]);
  // Antenna panels and dishes clipped to the legs.
  for (const [px, py, flip] of [
    [352, 452, false],
    [540, 372, true],
    [372, 292, false],
    [524, 226, true],
  ] as const) {
    a.rect(px, py, 6, 22, '#b8c0c8');
    a.rect(px, py, 6, 1, '#e0e6ea');
    a.rect(px + (flip ? 0 : 5), py, 1, 22, '#8a9299');
    a.rect(flip ? px - 5 : px + 6, py + 8, 5, 1, m[0]);
    a.epx(px + 2, py + 19, GLOW.green);
  }
  a.disc(410, 356, 8, '#aab2ba');
  a.disc(411, 356, 6, '#cfd6dc');
  a.px(411, 356, m[0]);
  a.disc(498, 300, 6, '#aab2ba');
  a.disc(497, 300, 4, '#cfd6dc');
  // Feeder cables down one leg.
  for (let y = 110; y < G; y += 3) {
    const u = (y - 96) / (G - 96);
    a.px(Math.round(430 - 90 * u) + 3, y, '#0c0e12');
  }

  // Service hut.
  {
    const x = 28;
    const pl = RAMP.plaster;
    a.rect(x, G - 44, 78, 44, pl[1]);
    for (let i = x + 2; i < x + 78; i += 4) a.rect(i, G - 44, 1, 44, pl[0]);
    a.rect(x - 3, G - 48, 84, 5, m[1]);
    a.rect(x - 3, G - 48, 84, 1, m[3]);
    a.rect(x + 8, G - 34, 18, 34, '#2a3440');
    a.rect(x + 8, G - 34, 18, 1, '#44505e');
    a.rect(x + 22, G - 18, 1, 3, '#c8c8b8');
    a.rect(x + 37, G - 33, 28, 18, '#20242c');
    a.emit(x + 38, G - 32, 26, 16, '#c79a56', 0.2);
    a.emit(x + 50, G - 32, 1, 16, '#6a5230', 0.2);
    a.emit(x + 42, G - 24, 6, 8, '#6a5230', 0.2);
    a.text('M-14', x + 40, G - 12, '#2a2e36', { font: 'g7' });
    c.lights.push({ x: x + 51, y: G - 22, r: 78, color: '#ffcf8a', k: 0.6, falloff: 1.5 });
    c.emitters.push({ kind: 'vent', x: x + 70, y: G - 50, rate: 3, w: 4 });
    a.rect(x + 66, G - 54, 8, 6, m[1]);
  }

  // Gondola dock: pylon, wheel and a cable sloping away into the fog.
  {
    const x = 792;
    a.rect(x, G - 96, 6, 96, m[1]);
    a.rect(x, G - 96, 1, 96, m[3]);
    a.rect(x - 22, G - 96, 60, 5, m[1]);
    a.rect(x - 22, G - 96, 60, 1, m[3]);
    a.disc(x + 30, G - 88, 7, m[0]);
    a.disc(x + 30, G - 88, 4, m[2]);
    cable(a, x + 30, G - 82, W + PAD, G - 40, 6, '#0b0d11');
    cable(a, x - 22, G - 94, 640, G - 14, 3, '#0b0d11');
    a.emit(x + 1, G - 104, 4, 3, GLOW.amber, 0.6);
    c.lights.push({ x: x + 3, y: G - 102, r: 60, color: GLOW.amber, k: 0.6, flicker: 'pulse' });
  }

  // Work lamps on poles.
  for (const [lx, dir] of [
    [232, 1],
    [672, -1],
  ] as const) {
    a.rect(lx, G - 70, 2, 56, m[1]);
    a.rect(dir > 0 ? lx : lx - 8, G - 70, 10, 2, m[1]);
    a.emit(dir > 0 ? lx + 6 : lx - 8, G - 68, 4, 2, '#dff2ff', 0.8);
    c.lights.push({
      x: lx + dir * 7,
      y: G - 64,
      r: 176,
      color: '#cfe8ff',
      k: 1.1,
      cone: { dx: dir * 0.35, dy: 0.94, inner: 0.5, outer: 1.0 },
      shadow: true,
      falloff: 1.3,
    });
  }

  for (const p of level.props) paintProp(c, art, p);
  for (const s of level.solids) {
    paintSolid(c, s);
    if (s.tag === 'slab') {
      a.rect(s.x, s.y - 11, s.w, 1, m[2]);
      a.rect(s.x + s.w - 1, s.y - 11, 1, 11, m[1]);
    }
  }
  for (const o of level.oneWays) {
    paintOneWay(c, o);
    if (o.tag !== 'none') {
      // Knee rail on each landing.
      a.rect(o.x, o.y - 11, o.w, 1, m[2]);
      a.rect(o.x, o.y - 11, 1, 11, m[1]);
      a.rect(o.x + o.w - 1, o.y - 11, 1, 11, m[1]);
    }
  }
  for (const l of level.ladders) paintLadder(a, l.x, l.y0, l.y1);

  // Aircraft warning lights up the mast.
  for (const [bx, by] of [
    [366, 480],
    [540, 400],
    [352, 320],
    [556, 272],
  ] as const) {
    a.rect(bx - 1, by - 5, 3, 3, m[0]);
    art.playDynamics.push((st, t) => {
      if (Math.sin(t * 2.2 + by * 0.05) > 0.1) st.emit(bx - 1, by - 8, 3, 3, GLOW.red, 1, 0.6);
    });
    c.lights.push({ x: bx, y: by - 7, r: 46, color: GLOW.red, k: 0.7, flicker: 'blink' });
  }
  // Top beacon: dark until Sol replaces the lamp.
  a.rect(446, 176, 9, 14, m[1]);
  a.rect(446, 176, 9, 1, m[3]);
  a.rect(448, 168, 5, 8, '#30343c');
  art.indicators.push({ id: 'beacon', x: 450, y: 172, kind: 'lamp' });

  // ---- distance ----
  {
    const py = 0.03;
    const s = layerSize(level, 0, py);
    const sky = paintSky({
      w: s.w,
      h: s.h,
      stops: ['#02030a', '#050a1c', '#0a1630', '#12284a', '#1e3c5e'],
      stars: 140,
      clouds: 0.12,
      cloudColor: '#1c2c4a',
      moon: { x: 372 + PAD, y: 58 + PAD, r: 11, color: '#dfe8f6' },
      seed: level.seed,
    });
    art.layers.push({ group: 'far', art: sky, px: 0, py, ox: -PAD, oy: -PAD });
  }
  {
    // Far: other masts and the Spire standing out of the cloud.
    const p = 0.06;
    const s = layerSize(level, p, p);
    const far = new Art(s.w, s.h);
    const base = layerFloor(level, p, 214);
    const body = '#0b1326';
    for (let i = 0; i < 9; i++) {
      const x = rng.int(10, s.w - 10);
      const h = rng.int(30, 90);
      far.rect(x, base - h, 1, h + 40, body);
      far.rect(x - 2, base - h + 6, 5, 1, body);
      far.emit(x, base - h - 1, 1, 1, GLOW.red, 0.5);
    }
    const spire = paintSpire(210, '#0e1830');
    far.blit(spire, Math.floor(s.w * 0.68), base - 170);
    far.blit(fogSea(s.w, s.h, base - 52, level.seed + 3, '#3d5278', '#ff9a4a', 1), 0, 0);
    art.layers.push({ group: 'far', art: far, px: p, py: p, ox: -PAD, oy: -PAD });
  }
  {
    // Mid: a nearer bank of cloud, drifting.
    const p = 0.22;
    const s = layerSize(level, p, p);
    const bank = fogSea(s.w + 300, s.h, layerFloor(level, p, 198), level.seed + 9, '#465c82', '#ffa858', 0.9);
    art.dynamics.push((st, t) => {
      st.layer('mid', bank, -PAD - ((t * 3) % 300), -PAD, p, p);
    });
  }
  {
    const p = 0.5;
    const s = layerSize(level, p, p);
    const bank = fogSea(s.w + 400, s.h, layerFloor(level, p, 228), level.seed + 15, '#506a90', '#7fd6d0', 0.8);
    art.dynamics.push((st, t) => {
      st.layer('mid', bank, -PAD - ((t * 7) % 400), -PAD, p, p);
    });
  }
  {
    // Foreground: guy wires and a wisp of cloud passing the lens.
    const p = 1.45;
    const s = layerSize(level, p, p);
    const fg = new Art(s.w, s.h);
    for (let i = 0; i < 5; i++) {
      const x = rng.int(0, s.w);
      fg.line(x, 0, x + rng.int(-260, 260), s.h, '#05070b', 2);
    }
    const floor = layerFloor(level, p, 270);
    fg.rect(0, floor - 20, s.w, 2, '#05070b');
    for (let x = 0; x < s.w; x += 26) fg.rect(x, floor - 20, 2, 26, '#05070b');
    art.layers.push({ group: 'fg', art: fg, px: p, py: p, ox: -PAD, oy: -PAD });
    const wisp = fogSea(700, 120, 40, level.seed + 31, '#5a7092', '#000000', 0.35);
    art.dynamics.push((st, t) => {
      const x = ((t * 22) % (s.w + 900)) - 700;
      st.layer('fg', wisp, x, floor - 150, p, p, 0.5);
    });
  }
  return art;
}
