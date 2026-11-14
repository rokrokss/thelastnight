import { PAD, TEX_H, TEX_W, VIEW_H, VIEW_W } from '../core/constants';
import { shade } from '../core/color';
import { Rng } from '../core/math';
import { Art, ctx2d, makeCanvas } from '../gfx/art';
import type { Look } from '../gfx/renderer';
import type { LayerGroup, Stage } from '../gfx/stage';
import type { LevelData, LightDef, OneWay, Solid } from '../game/level';
import { RAMP } from './palette';
import { maskOccluder, seedOf, wall, type Emitter, type FlickerRect, type PaintCtx } from './paint';

export interface SceneLayer {
  group: LayerGroup;
  art: Art;
  /** Scroll factors relative to the camera. */
  px: number;
  py: number;
  /** Position of the art in its own layer space. */
  ox: number;
  oy: number;
}

/**
 * Per-frame scenery (trains, beacons, traffic). Receives seconds since scene
 * start and the story's signal switches (relays lit, transmitter live).
 */
export type Dynamic = (s: Stage, t: number, signals: Record<string, number>) => void;

/** A lamp or relay whose state the story can switch. */
export interface Indicator {
  id: string;
  x: number;
  y: number;
  kind: 'relay' | 'lamp';
}

export interface SceneArt {
  layers: SceneLayer[];
  /** Play-layer strips; world (0,0) sits at (PAD, PAD) inside them. */
  back: Art;
  mid: Art;
  front: Art;
  mask: HTMLCanvasElement;
  look: Look;
  lights: LightDef[];
  emitters: Emitter[];
  flickers: FlickerRect[];
  /** Per-frame scenery in the distant layers. */
  dynamics: Dynamic[];
  /** Per-frame scenery in the play layer (drawn over the back strip, behind actors). */
  playDynamics: Dynamic[];
  indicators: Indicator[];
}

export interface SceneBuild {
  c: PaintCtx;
  art: SceneArt;
}

export const DEFAULT_LOOK: Look = {
  ambFar: [1, 1, 1],
  ambMid: [1, 1, 1],
  ambPlay: [0.2, 0.25, 0.38],
  ambFg: [1, 1, 1],
  fogColor: [0.09, 0.12, 0.18],
  fogMid: 0.22,
  groundFog: 0.3,
  scatter: 0.1,
  reflect: 0.6,
  ripple: 2.2,
  blurFar: 2.0,
  blurMid: 0.8,
  blurFg: 4.0,
  bloom: 0.5,
  bloomWide: 1.0,
  streak: 0.2,
  exposure: 1.0,
  contrast: 1.05,
  saturation: 1.1,
  shadowTint: [0.0, 0.01, 0.03],
  highTint: [0.03, 0.01, 0.0],
  vignette: 0.5,
  grain: 0.03,
  aberration: 0.01,
};

/** Allocate the play surfaces and mask for a level. */
export function beginScene(level: LevelData, look: Look): SceneBuild {
  const w = level.width + PAD * 2;
  const h = level.height + PAD * 2;
  const back = new Art(w, h).setOrigin(PAD, PAD);
  const mid = new Art(w, h).setOrigin(PAD, PAD);
  const front = new Art(w, h).setOrigin(PAD, PAD);
  const maskCanvas = makeCanvas(w, h);
  const mask = ctx2d(maskCanvas, true);
  mask.fillStyle = '#000';
  mask.fillRect(0, 0, w, h);
  mask.setTransform(1, 0, 0, 1, PAD, PAD);
  const lights: LightDef[] = [...level.lights];
  const emitters: Emitter[] = [];
  const flickers: FlickerRect[] = [];
  const art: SceneArt = {
    layers: [],
    back,
    mid,
    front,
    mask: maskCanvas,
    look,
    lights,
    emitters,
    flickers,
    dynamics: [],
    playDynamics: [],
    indicators: [],
  };
  return { c: { back, mid, front, mask, lights, emitters, flickers, level, ox: PAD, oy: PAD }, art };
}

/** Size a parallax layer so it covers every camera position in the level. */
export function layerSize(level: LevelData, px: number, py: number): { w: number; h: number } {
  return {
    w: Math.ceil(Math.max(0, level.width - VIEW_W) * px) + TEX_W,
    h: Math.ceil(Math.max(0, level.height - VIEW_H) * py) + TEX_H,
  };
}

/** Layer-space y that lands on screen row `screenY` when the camera is at the level floor. */
export function layerFloor(level: LevelData, py: number, screenY: number): number {
  return screenY + PAD + Math.max(0, level.height - VIEW_H) * py;
}

// ---------------------------------------------------------------------------
// Generic structure painting (collision geometry → art)
// ---------------------------------------------------------------------------

export function paintLadder(a: Art, x: number, y0: number, y1: number): void {
  const m = RAMP.metal;
  a.rect(x - 5, y0 - 5, 1, y1 - y0 + 5, m[2]);
  a.rect(x + 4, y0 - 5, 1, y1 - y0 + 5, m[2]);
  a.rect(x - 4, y0 - 5, 1, y1 - y0 + 5, m[0]);
  a.rect(x + 5, y0 - 5, 1, y1 - y0 + 5, m[0]);
  for (let y = y0 + 2; y < y1; y += 5) {
    a.rect(x - 4, y, 8, 1, m[3]);
    a.rect(x - 4, y + 1, 8, 1, m[0]);
  }
  a.rect(x - 6, y0 - 5, 3, 1, m[3]);
  a.rect(x + 4, y0 - 5, 3, 1, m[3]);
}

export function paintOneWay(c: PaintCtx, o: OneWay): void {
  const a = c.back;
  const rng = new Rng(seedOf(o.x, o.y, 11));
  const m = RAMP.metal;
  switch (o.tag) {
    case 'awning': {
      const cols = rng.pick([
        ['#a83a34', '#e0d8c8'],
        ['#2a5f8a', '#e0d8c8'],
        ['#3f7a5a', '#d8d2c0'],
        ['#c87a2a', '#3a3440'],
      ]);
      a.rect(o.x, o.y, o.w, 2, shade(cols[0]!, 0.8));
      for (let i = 0; i < o.w; i += 6) {
        const col = (i / 6) % 2 ? cols[1]! : cols[0]!;
        a.rect(o.x + i, o.y + 2, Math.min(6, o.w - i), 5, col);
        a.rect(o.x + i, o.y + 7, Math.min(6, o.w - i), 1, shade(col, 0.7));
      }
      a.rect(o.x, o.y, o.w, 1, shade(cols[0]!, 1.3));
      a.rect(o.x + 2, o.y + 2, 1, 10, m[0]);
      a.rect(o.x + o.w - 3, o.y + 2, 1, 10, m[0]);
      break;
    }
    case 'plank': {
      const wd = RAMP.wood;
      a.rect(o.x, o.y, o.w, 3, wd[2]);
      a.rect(o.x, o.y, o.w, 1, wd[3]);
      a.rect(o.x, o.y + 3, o.w, 1, wd[0]);
      for (let i = o.x + rng.int(6, 12); i < o.x + o.w; i += rng.int(9, 16)) a.rect(i, o.y, 1, 3, wd[1]);
      break;
    }
    case 'balcony': {
      const cc = RAMP.concrete;
      // Railing behind, slab on top.
      a.rect(o.x, o.y - 12, o.w, 1, m[3]);
      for (let i = o.x + 1; i < o.x + o.w; i += 4) a.rect(i, o.y - 11, 1, 11, m[1]);
      a.rect(o.x - 1, o.y, o.w + 2, 4, cc[2]);
      a.rect(o.x - 1, o.y, o.w + 2, 1, cc[3]);
      a.rect(o.x - 1, o.y + 4, o.w + 2, 1, cc[0]);
      for (let i = o.x + 4; i < o.x + o.w; i += 18) a.rect(i, o.y + 5, 2, 4, cc[0]);
      break;
    }
    case 'pipe': {
      a.rect(o.x, o.y, o.w, 4, RAMP.rust[2]);
      a.rect(o.x, o.y, o.w, 1, RAMP.rust[3]);
      a.rect(o.x, o.y + 3, o.w, 1, RAMP.rust[0]);
      for (let i = o.x + 10; i < o.x + o.w; i += 28) a.rect(i, o.y - 1, 3, 6, RAMP.rust[1]);
      break;
    }
    case 'cable': {
      a.rect(o.x, o.y, o.w, 1, '#101216');
      a.rect(o.x, o.y + 1, o.w, 1, '#07080b');
      break;
    }
    case 'none':
      break;
    default: {
      // Steel catwalk with open grating.
      a.rect(o.x, o.y, o.w, 1, m[3]);
      a.rect(o.x, o.y + 1, o.w, 2, m[1]);
      a.rect(o.x, o.y + 3, o.w, 1, m[0]);
      for (let i = o.x + 1; i < o.x + o.w; i += 3) a.px(i, o.y + 1, m[0]);
      for (let i = o.x + 5; i < o.x + o.w - 2; i += 22) a.line(i, o.y + 4, i + 5, o.y + 9, m[0]);
      break;
    }
  }
}

/** Paint a collision solid according to its tag. Returns false if the scene must handle it. */
export function paintSolid(c: PaintCtx, s: Solid): boolean {
  const a = c.back;
  const rng = new Rng(seedOf(s.x, s.y, 5));
  switch (s.tag) {
    case 'crate': {
      const wd = RAMP.wood;
      const cols = Math.max(1, Math.round(s.w / 14));
      const rows = Math.max(1, Math.round(s.h / 14));
      const cw = s.w / cols;
      const chh = s.h / rows;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const x = Math.round(s.x + i * cw);
          const y = Math.round(s.y + j * chh);
          const w = Math.round(s.x + (i + 1) * cw) - x;
          const h = Math.round(s.y + (j + 1) * chh) - y;
          const k = rng.range(0.88, 1.08);
          a.rect(x, y, w, h, shade(wd[2], k));
          a.rect(x, y, w, 1, shade(wd[3], k));
          a.rect(x, y + h - 1, w, 1, wd[0]);
          a.rect(x, y, 1, h, wd[1]);
          a.rect(x + w - 1, y, 1, h, wd[1]);
          a.rect(x + 2, y + 2, w - 4, 1, wd[1]);
          a.rect(x + 2, y + h - 3, w - 4, 1, wd[1]);
          if (rng.chance(0.5)) a.line(x + 2, y + 3, x + w - 3, y + h - 4, wd[1]);
          else a.line(x + w - 3, y + 3, x + 2, y + h - 4, wd[1]);
        }
      }
      break;
    }
    case 'block': {
      const cc = RAMP.concrete;
      wall(a, s.x, s.y, s.w, s.h, cc, rng);
      a.rect(s.x, s.y, s.w, 1, cc[3]);
      a.rect(s.x, s.y + 1, s.w, 1, cc[2]);
      a.rect(s.x, s.y, 1, s.h, cc[2]);
      a.rect(s.x + s.w - 1, s.y, 1, s.h, cc[0]);
      break;
    }
    case 'metal': {
      const m = RAMP.metal;
      a.rect(s.x, s.y, s.w, s.h, m[1]);
      a.rect(s.x, s.y, s.w, 1, m[3]);
      a.rect(s.x, s.y + s.h - 1, s.w, 1, m[0]);
      a.rect(s.x, s.y, 1, s.h, m[2]);
      a.rect(s.x + s.w - 1, s.y, 1, s.h, m[0]);
      for (let i = s.x + 6; i < s.x + s.w - 2; i += 12) a.px(i, s.y + 2, m[3]);
      break;
    }
    case 'slab': {
      // Solid steel landing (grabbable edge), drawn like a heavy catwalk.
      const m = RAMP.metal;
      a.rect(s.x, s.y, s.w, s.h, m[1]);
      a.rect(s.x, s.y, s.w, 1, m[3]);
      a.rect(s.x, s.y + s.h - 1, s.w, 1, m[0]);
      a.rect(s.x, s.y, 1, s.h, m[3]);
      a.rect(s.x + s.w - 1, s.y, 1, s.h, m[0]);
      for (let i = s.x + 3; i < s.x + s.w - 2; i += 6) a.px(i, s.y + 2, m[0]);
      for (let i = s.x + 8; i < s.x + s.w - 6; i += 24) a.line(i, s.y + s.h, i + 6, s.y + s.h + 6, m[0]);
      break;
    }
    case 'none':
      break;
    default:
      return false;
  }
  if (s.occlude) maskOccluder(c, s.x, s.y, s.w, s.h);
  return true;
}

/** Signal relay cabinet: the thing the player climbs to and tunes. */
export function paintRelay(c: PaintCtx, art: SceneArt, id: string, x: number, y: number): void {
  const a = c.back;
  const m = RAMP.metal;
  a.rect(x - 7, y - 18, 14, 18, m[1]);
  a.rect(x - 7, y - 18, 14, 1, m[3]);
  a.rect(x - 7, y - 18, 1, 18, m[2]);
  a.rect(x + 6, y - 18, 1, 18, m[0]);
  a.rect(x - 5, y - 15, 10, 6, '#0c1014');
  a.rect(x - 5, y - 7, 4, 4, m[0]);
  a.rect(x + 1, y - 7, 4, 1, m[3]);
  a.rect(x + 1, y - 5, 4, 1, m[3]);
  a.rect(x - 1, y - 30, 1, 12, '#14161a');
  a.rect(x - 4, y - 27, 7, 1, '#14161a');
  a.rect(x - 3, y - 23, 5, 1, '#14161a');
  a.line(x + 4, y - 18, x + 9, y - 26, '#14161a');
  art.indicators.push({ id, x, y: y - 12, kind: 'relay' });
}
