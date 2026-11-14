import { PAD } from '../core/constants';
import { shade } from '../core/color';
import { Rng } from '../core/math';
import { Art } from '../gfx/art';
import type { LevelData } from '../game/level';
import { hazeBand, paintSky, paintSkyline, paintSpire, paintTrain } from './city';
import { GLOW } from './palette';
import { cable } from './paint';
import { layerFloor, layerSize, type SceneArt } from './scene';

export interface BackdropOpts {
  seed: number;
  skyStops: string[];
  stars: number;
  clouds: number;
  cloudColor: string;
  moon?: { x: number; y: number; r: number; color: string };
  sun?: { x: number; y: number; r: number; color: string };
  /** Fog colour the distance fades into. */
  haze: string;
  /** Silhouette colours, far → near. */
  bodies: [string, string, string, string];
  /** Screen row of the horizon when the camera is at the level floor. */
  horizon: number;
  /** Where the spire stands, as a fraction of the far layer's width (omit to hide it). */
  spire?: number;
  rail?: boolean;
  /** Overall brightness of distant windows. */
  lit: number;
  traffic: number;
}

/**
 * The city beyond the street: sky, two far skylines, two mid-distance blocks,
 * plus moving details (air traffic, a train, the spire's beacon).
 */
export function cityBackdrop(level: LevelData, art: SceneArt, o: BackdropOpts): void {
  const warm = ['#ffcf7a', '#ffb860', '#9fd8ff', '#ffe2a8'];
  const cool = ['#9fd8ff', '#bfe6ff', '#ffcf7a', '#7fb0ff'];

  // Sky.
  {
    const py = 0.02;
    const s = layerSize(level, 0, py);
    const sky = paintSky({
      w: s.w,
      h: s.h,
      stops: o.skyStops,
      stars: o.stars,
      clouds: o.clouds,
      cloudColor: o.cloudColor,
      moon: o.moon ? { ...o.moon, x: o.moon.x + PAD, y: o.moon.y + PAD } : undefined,
      sun: o.sun ? { ...o.sun, x: o.sun.x + PAD, y: o.sun.y + PAD } : undefined,
      seed: o.seed,
    });
    art.layers.push({ group: 'far', art: sky, px: 0, py, ox: -PAD, oy: -PAD });
  }

  // Far skyline A, with the spire.
  {
    const p = 0.05;
    const s = layerSize(level, p, p);
    const base = layerFloor(level, p, o.horizon - 12);
    const sk = paintSkyline({
      w: s.w,
      h: s.h,
      baseY: base,
      seed: o.seed + 1,
      width: [16, 42],
      height: [44, 120],
      gap: [0, 8],
      body: o.bodies[0],
      haze: o.haze,
      hazeAmt: 0.8,
      lit: cool,
      litRatio: 0.1 * o.lit,
      cell: [1, 1, 3, 4],
      signs: 0.12,
      beacons: 0.5,
      towers: 0.16,
    });
    if (o.spire !== undefined) {
      const spire = paintSpire(210, shade(o.bodies[0], 1.25));
      const sx = Math.floor(s.w * o.spire);
      sk.blit(spire, sx, base - 205);
      hazeBand(sk, base - 90, base + 6, o.haze, 0.5);
      const bx = sx + 23 - PAD;
      const by = base - 205 - PAD;
      art.dynamics.push((st, t) => {
        if (Math.sin(t * 2.6) > 0.3) {
          st.layerRect('far', bx - 1, by - 1, 3, 3, p, p, GLOW.red, true);
          st.layerRect('far', bx - 3, by - 3, 7, 7, p, p, GLOW.red, true, 0.25);
        }
      });
    }
    art.layers.push({ group: 'far', art: sk, px: p, py: p, ox: -PAD, oy: -PAD });
  }

  // Far skyline B.
  {
    const p = 0.12;
    const s = layerSize(level, p, p);
    const sk = paintSkyline({
      w: s.w,
      h: s.h,
      baseY: layerFloor(level, p, o.horizon - 4),
      seed: o.seed + 2,
      width: [22, 58],
      height: [56, 150],
      gap: [0, 14],
      body: o.bodies[1],
      haze: o.haze,
      hazeAmt: 0.7,
      lit: warm,
      litRatio: 0.15 * o.lit,
      cell: [2, 1, 4, 4],
      signs: 0.28,
      beacons: 0.4,
      towers: 0.2,
    });
    art.layers.push({ group: 'far', art: sk, px: p, py: p, ox: -PAD, oy: -PAD });

    // Air traffic drifting between the towers.
    const rng = new Rng(o.seed + 40);
    const n = Math.round(6 * o.traffic);
    const lift = Math.max(0, level.height - 270) * p;
    const craft = Array.from({ length: n }, () => ({
      y: lift + rng.int(20, Math.max(21, Math.floor(o.horizon * 0.55))),
      speed: rng.range(7, 19) * (rng.chance(0.5) ? 1 : -1),
      phase: rng.range(0, 1),
    }));
    const span = s.w + 80;
    art.dynamics.push((st, t) => {
      for (const cft of craft) {
        const x = ((((cft.phase * span + t * cft.speed) % span) + span) % span) - 40;
        st.layerRect('far', x, cft.y, 3, 1, p, p, '#0a0e18');
        st.layerRect('far', cft.speed > 0 ? x + 3 : x - 1, cft.y, 1, 1, p, p, '#ffffff', true);
        if (Math.sin(t * 5 + cft.phase * 20) > 0.2) {
          st.layerRect('far', cft.speed > 0 ? x : x + 2, cft.y, 1, 1, p, p, GLOW.red, true);
        }
      }
    });
  }

  // Mid block A.
  {
    const p = 0.3;
    const s = layerSize(level, p, p);
    const sk = paintSkyline({
      w: s.w,
      h: s.h,
      baseY: layerFloor(level, p, o.horizon + 4),
      seed: o.seed + 3,
      width: [46, 104],
      height: [84, 190],
      gap: [0, 26],
      body: o.bodies[2],
      haze: o.haze,
      hazeAmt: 0.55,
      lit: warm,
      litRatio: 0.2 * o.lit,
      cell: [2, 3, 5, 7],
      signs: 0.5,
      beacons: 0.25,
      towers: 0.14,
    });
    art.layers.push({ group: 'mid', art: sk, px: p, py: p, ox: -PAD, oy: -PAD });
  }

  // Mid block B, with an elevated line.
  {
    const p = 0.55;
    const s = layerSize(level, p, p);
    const base = layerFloor(level, p, o.horizon + 12);
    const sk = paintSkyline({
      w: s.w,
      h: s.h,
      baseY: base,
      seed: o.seed + 4,
      width: [58, 128],
      height: [56, 150],
      gap: [8, 64],
      body: o.bodies[3],
      haze: o.haze,
      hazeAmt: 0.42,
      lit: warm,
      litRatio: 0.22 * o.lit,
      cell: [3, 4, 7, 9],
      signs: 0.55,
      beacons: 0.1,
      towers: 0.08,
    });
    if (o.rail) {
      const ry = base - 74;
      const body = shade(o.bodies[3], 0.8);
      sk.rect(0, ry, s.w, 4, body);
      sk.rect(0, ry, s.w, 1, shade(o.bodies[3], 1.6));
      sk.rect(0, ry - 5, s.w, 1, body);
      for (let x = 20; x < s.w; x += 8) sk.rect(x, ry - 5, 1, 5, body);
      for (let x = 30; x < s.w; x += 92) {
        sk.rect(x, ry + 4, 7, s.h - ry, body);
        sk.rect(x - 3, ry + 4, 13, 3, body);
        sk.rect(x, ry + 4, 1, s.h - ry, shade(o.bodies[3], 1.4));
      }
      const train = paintTrain(5, '#1c2634');
      const span = s.w + train.w + 900;
      art.dynamics.push((st, t) => {
        const x = ((t * 82) % span) - train.w - 40;
        st.layer('mid', train, x - PAD, ry - 11 - PAD, p, p);
      });
    }
    art.layers.push({ group: 'mid', art: sk, px: p, py: p, ox: -PAD, oy: -PAD });
  }
}

export type ForegroundKind = 'street' | 'roof' | 'port' | 'none';

/**
 * Out-of-focus foreground: dark shapes close to the lens that slide past
 * faster than the world, selling depth.
 */
export function paintForeground(level: LevelData, art: SceneArt, kind: ForegroundKind, seed: number): void {
  if (kind === 'none') return;
  const p = 1.45;
  const s = layerSize(level, p, p);
  const a = new Art(s.w, s.h);
  const rng = new Rng(seed);
  const floor = layerFloor(level, p, 270);
  const dark = '#04060a';
  const rim = '#111823';

  if (kind === 'street') {
    let prev: [number, number] | null = null;
    for (let x = rng.int(120, 260); x < s.w; x += rng.int(330, 560)) {
      const top = floor - rng.int(232, 252);
      a.rect(x, top, 7, s.h - top, dark);
      a.rect(x, top, 1, s.h - top, rim);
      a.rect(x - 18, top + 10, 43, 3, dark);
      a.rect(x - 12, top + 22, 31, 2, dark);
      for (const ix of [-16, -6, 10, 21]) a.rect(x + ix, top + 6, 2, 4, dark);
      // Transformer can and a service lamp.
      a.rect(x + 8, top + 34, 13, 20, dark);
      a.rect(x + 8, top + 34, 1, 20, rim);
      if (rng.chance(0.7)) a.emit(x + 2, top + 62, 3, 2, rng.pick([GLOW.sodium, GLOW.red, GLOW.teal]), 0.5);
      if (prev) {
        for (let k = 0; k < 4; k++) cable(a, prev[0] + 3, prev[1] + 10 + k * 4, x + 3, top + 10 + k * 4, 16 + k * 7 + rng.int(0, 8), dark);
      }
      prev = [x, top];
    }
    // Low clutter along the bottom edge.
    for (let x = rng.int(40, 200); x < s.w; x += rng.int(210, 460)) {
      const k = rng.int(0, 2);
      if (k === 0) {
        // Railing.
        const w = rng.int(50, 110);
        a.rect(x, floor - 22, w, 2, dark);
        a.rect(x, floor - 12, w, 1, dark);
        for (let i = 0; i <= w; i += 12) a.rect(x + i, floor - 22, 2, 24, dark);
      } else if (k === 1) {
        // Potted shrubs.
        for (let i = 0; i < 26; i++) {
          const lx = x + rng.int(0, 40);
          a.line(lx, floor, lx + rng.int(-9, 9), floor - rng.int(10, 36), dark, 2);
        }
      } else {
        // Stacked crates.
        a.rect(x, floor - 26, 34, 28, dark);
        a.rect(x + 28, floor - 14, 26, 16, dark);
        a.rect(x, floor - 26, 34, 1, rim);
      }
    }
  } else if (kind === 'roof') {
    for (let x = rng.int(60, 220); x < s.w; x += rng.int(240, 520)) {
      const k = rng.int(0, 2);
      if (k === 0) {
        // Aerial mast with a warning light.
        const top = floor - rng.int(150, 240);
        a.rect(x, top, 3, s.h - top, dark);
        for (let i = 0; i < 4; i++) a.rect(x - 12 + i * 2, top + 10 + i * 9, 27 - i * 4, 1, dark);
        a.emit(x, top - 2, 3, 2, GLOW.red, 0.5);
      } else if (k === 1) {
        const w = rng.int(60, 130);
        a.rect(x, floor - 30, w, 3, dark);
        for (let i = 0; i <= w; i += 10) a.rect(x + i, floor - 30, 2, 32, dark);
      } else {
        // Vent stack.
        a.rect(x, floor - 44, 20, 46, dark);
        a.rect(x - 3, floor - 48, 26, 5, dark);
        a.rect(x, floor - 44, 1, 46, rim);
      }
    }
  } else {
    for (let x = rng.int(40, 180); x < s.w; x += rng.int(260, 520)) {
      if (rng.chance(0.5)) {
        // Chain-link fence panel.
        const w = rng.int(90, 170);
        for (let i = 0; i <= w; i += 30) a.rect(x + i, floor - 62, 3, 64, dark);
        a.rect(x, floor - 62, w, 2, dark);
        for (let i = 0; i < w; i += 5) {
          a.line(x + i, floor - 60, x + i + 5, floor - 2, shade(dark, 2.2));
        }
      } else {
        // Mooring bollard and coiled rope.
        a.rect(x, floor - 24, 22, 26, dark);
        a.rect(x - 4, floor - 28, 30, 6, dark);
        a.rect(x, floor - 24, 1, 24, rim);
        a.emit(x + 9, floor - 31, 3, 2, GLOW.amber, 0.5);
      }
    }
  }
  art.layers.push({ group: 'fg', art: a, px: p, py: p, ox: -PAD, oy: -PAD });
}
