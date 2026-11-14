import { shade } from '../core/color';
import { fbm, Rng } from '../core/math';
import type { Art } from '../gfx/art';
import { FOCAL, type Surface, type TexRegion, type WorldBuilder } from '../gfx/world';
import type { PropDef } from '../game/level';
import { RAMP } from './palette';
import { seedOf, type PaintCtx } from './paint';

/**
 * Textures and helpers for the world's depth: what the ground is made of as
 * it runs toward the horizon, and what the sides and roofs of buildings look
 * like where the flat front view never showed them.
 *
 * Everything here is pixel art at the same scale as the play layer (one texel
 * is one world px), so a wall's side reads as the same material as its face.
 */

type Ramp = readonly string[];

/** How far the ground is drawn toward the lens, and how far away from it. */
const NEAR = -FOCAL * 0.93;
const FAR = FOCAL * 46;
/** Sideways reach beyond the level, so the ground never ends inside the frame. */
const REACH = 6000;

const LIT = ['#d9a560', '#c98f4e', '#e2b272', '#8fb8cc', '#a5cfe0', '#7f90d8'];

function tex(d: WorldBuilder, w: number, h: number, paint: (a: Art, w: number, h: number) => void): TexRegion {
  const r = d.region(w, h);
  paint(d.atlas, r.w, r.h);
  return d.seal(r);
}

// --------------------------------------------------------------- ground

export function asphaltTile(d: WorldBuilder, seed: number): TexRegion {
  return tex(d, 128, 128, (a, w, h) => {
    const as = RAMP.asphalt;
    const rng = new Rng(seed);
    a.rect(0, 0, w, h, as[2]);
    a.speckle(0, 0, w, h, as[3], 1700, () => rng.next());
    a.speckle(0, 0, w, h, as[1], 1500, () => rng.next());
    a.speckle(0, 0, w, h, '#4a5262', 260, () => rng.next());
    // Old repairs: darker tar patches and the seams around them.
    for (let i = 0; i < 4; i++) {
      const x = rng.int(4, w - 44);
      const y = rng.int(4, h - 30);
      const pw = rng.int(18, 40);
      const ph = rng.int(8, 22);
      a.rect(x, y, pw, ph, as[1]);
      a.speckle(x, y, pw, ph, as[0], Math.floor(pw * ph * 0.12), () => rng.next());
      a.rect(x, y, pw, 1, as[0]);
      a.rect(x, y, 1, ph, as[0]);
    }
    for (let i = 0; i < 3; i++) {
      let x = rng.int(0, w);
      let y = rng.int(0, h - 40);
      for (let k = 0; k < rng.int(18, 40); k++) {
        a.px(x, y, as[0]);
        y += 1;
        x += rng.int(-1, 1);
      }
    }
  });
}

export function pavingTile(d: WorldBuilder, seed: number, ramp: Ramp = RAMP.paving): TexRegion {
  return tex(d, 96, 96, (a, w, h) => {
    const rng = new Rng(seed);
    a.rect(0, 0, w, h, ramp[1]!);
    for (let y = 0; y < h; y += 16) {
      const off = (y / 16) % 2 ? 12 : 0;
      for (let x = -off; x < w; x += 24) {
        const k = rng.range(0.9, 1.1);
        a.rect(x + 1, y + 1, 23, 15, shade(ramp[1]!, k));
        a.rect(x + 1, y + 1, 23, 1, shade(ramp[2]!, k));
      }
    }
    a.speckle(0, 0, w, h, ramp[0]!, 420, () => rng.next());
    a.speckle(0, 0, w, h, ramp[2]!, 240, () => rng.next());
  });
}

export function concreteTile(d: WorldBuilder, seed: number): TexRegion {
  return tex(d, 128, 128, (a, w, h) => {
    const cc = RAMP.concrete;
    const rng = new Rng(seed);
    a.rect(0, 0, w, h, shade(cc[1], 0.74));
    a.speckle(0, 0, w, h, shade(cc[2], 0.74), 1500, () => rng.next());
    a.speckle(0, 0, w, h, shade(cc[0], 0.8), 1300, () => rng.next());
    // Expansion joints every slab, and tyre-black scuffs along them.
    for (const k of [0, 64]) {
      a.rect(0, k, w, 1, cc[0]);
      a.rect(k, 0, 1, h, cc[0]);
      a.rect(0, k + 1, w, 1, shade(cc[2], 0.8));
    }
    for (let i = 0; i < 9; i++) a.rect(rng.int(0, w - 26), rng.int(0, h), rng.int(8, 26), 1, shade(cc[0], 0.7));
    for (let i = 0; i < 5; i++) a.rect(rng.int(0, w - 12), rng.int(0, h - 4), rng.int(4, 12), rng.int(2, 4), shade(cc[0], 0.85));
  });
}

export function deckTile(d: WorldBuilder, seed: number): TexRegion {
  return tex(d, 96, 96, (a, w, h) => {
    const m = RAMP.metal;
    const rng = new Rng(seed);
    a.rect(0, 0, w, h, m[1]);
    // Tread plate: a weave of short raised bars.
    for (let y = 0; y < h; y += 6) {
      for (let x = (y / 6) % 2 ? 3 : 0; x < w; x += 6) {
        if ((x + y) % 12 < 6) a.rect(x, y + 1, 3, 1, m[2]);
        else a.rect(x + 1, y, 1, 3, m[2]);
      }
    }
    for (const k of [0, 48]) {
      a.rect(0, k, w, 1, m[0]);
      a.rect(k, 0, 1, h, m[0]);
      a.rect(0, k + 1, w, 1, m[3]);
      for (let i = 6; i < w; i += 12) {
        a.px(i, k + 3, m[3]);
        a.px(k + 3, i, m[3]);
      }
    }
    a.speckle(0, 0, w, h, RAMP.rust[1], 160, () => rng.next());
  });
}

export function roofTile(d: WorldBuilder, seed: number): TexRegion {
  return tex(d, 128, 128, (a, w, h) => {
    const rng = new Rng(seed);
    const base = '#262b36';
    a.rect(0, 0, w, h, base);
    a.speckle(0, 0, w, h, '#313746', 1500, () => rng.next());
    a.speckle(0, 0, w, h, '#1b1f28', 1200, () => rng.next());
    // Felt laid in overlapping strips, with a few patched squares.
    for (let y = 0; y < h; y += 32) {
      a.rect(0, y, w, 1, '#171a22');
      a.rect(0, y + 1, w, 1, '#3a4152');
    }
    for (let i = 0; i < 3; i++) {
      const x = rng.int(4, w - 30);
      const y = rng.int(4, h - 24);
      a.rect(x, y, rng.int(12, 26), rng.int(10, 20), '#2f3644');
      a.rect(x, y, rng.int(12, 26), 1, '#444c5e');
    }
  });
}

/** Striped market tarp seen from above. */
export function tarpTile(d: WorldBuilder, ramp: Ramp): TexRegion {
  return tex(d, 32, 32, (a, w, h) => {
    a.rect(0, 0, w, h, ramp[2]!);
    for (let x = 0; x < w; x += 16) a.rect(x, 0, 8, h, ramp[1]!);
    for (let y = 0; y < h; y += 16) a.rect(0, y, w, 1, ramp[0]!);
    a.rect(0, 0, w, 1, ramp[3]!);
  });
}

/** Open water at night: near-black, with the long backs of small waves. */
export function waterTile(d: WorldBuilder, seed: number, base = '#0b1420'): TexRegion {
  return tex(d, 128, 64, (a, w, h) => {
    const rng = new Rng(seed);
    a.rect(0, 0, w, h, base);
    for (let i = 0; i < 46; i++) {
      const y = rng.int(0, h - 1);
      const x = rng.int(0, w - 1);
      const len = rng.int(6, 26);
      a.rect(x, y, len, 1, shade(base, rng.chance(0.5) ? 1.5 : 0.7));
    }
  });
}

/** The top of a bank of cloud or fog, seen from above (or its underside, from below). */
export function cloudTile(d: WorldBuilder, seed: number, dark: string, light: string): TexRegion {
  return tex(d, 128, 128, (a, w, h) => {
    // Sample the noise on a torus so the tile repeats without a seam.
    a.dither(0, 0, w, h, dark, light, (u, v) => {
      const ax = Math.cos(u * Math.PI * 2) * 1.4;
      const ay = Math.sin(u * Math.PI * 2) * 1.4;
      const bx = Math.cos(v * Math.PI * 2) * 1.4;
      const by = Math.sin(v * Math.PI * 2) * 1.4;
      return (fbm(ax + bx * 0.5 + 9, ay + by + 3, 3, seed) + fbm(bx - ay * 0.5, by + ax * 0.5 + 7, 3, seed + 1)) * 0.5 * 1.5 - 0.25;
    });
  });
}

/** A steel rail let into the ground, tiled along x. */
export function railTile(d: WorldBuilder): TexRegion {
  return tex(d, 18, 3, (a) => {
    a.rect(0, 0, 18, 1, '#9aa2ac');
    a.rect(0, 1, 18, 1, '#5d6775');
    a.rect(0, 2, 18, 1, '#1a1c20');
    a.rect(0, 0, 2, 3, '#22252b');
  });
}

/** A street seen from high above at night: dark, with the small lights of lamps and traffic. */
export function streetBelowTile(d: WorldBuilder, seed: number): TexRegion {
  return tex(d, 128, 128, (a, w, h) => {
    const rng = new Rng(seed);
    a.rect(0, 0, w, h, '#10131b');
    a.speckle(0, 0, w, h, '#191d28', 1200, () => rng.next());
    // Lane lines and a scatter of lamps and headlights.
    for (const y of [40, 88]) for (let x = 0; x < w; x += 16) a.rect(x, y, 8, 1, '#3a3f4c');
    for (let i = 0; i < 12; i++) a.emit(rng.int(0, w - 3), rng.int(0, h - 2), 2, 1, rng.pick(['#ffb860', '#ffd9a0', '#ff5a4a', '#9fd8ff']), 0.5);
  });
}

/** Worn road paint: a dash with a gap after it, tiled along x. */
export function dashTile(d: WorldBuilder, color: string, seed: number): TexRegion {
  return tex(d, 64, 4, (a) => {
    const rng = new Rng(seed);
    a.rect(0, 0, 36, 4, color);
    for (let i = 0; i < 26; i++) a.c.clearRect(rng.int(0, 35), rng.int(0, 3), rng.int(1, 3), 1);
  });
}

// ----------------------------------------------------------------- walls

/**
 * The side of a building: the same wall as its face, with a few small
 * windows, drainpipes and stains. Tiles along depth; one storey high rows.
 */
export function sideWallTile(d: WorldBuilder, ramp: Ramp, seed: number, storey = 36): TexRegion {
  return tex(d, 96, storey * 3, (a, w, h) => {
    const rng = new Rng(seed);
    a.rect(0, 0, w, h, ramp[1]!);
    a.speckle(0, 0, w, h, ramp[0]!, 520, () => rng.next());
    a.speckle(0, 0, w, h, ramp[2]!, 300, () => rng.next());
    for (let row = 0; row < 3; row++) {
      const y = row * storey;
      a.rect(0, y, w, 1, ramp[2]!);
      a.rect(0, y + 1, w, 1, ramp[0]!);
      for (const x of [14, 58]) {
        if (rng.chance(0.25)) continue;
        const lit = rng.chance(0.3);
        a.rect(x - 1, y + 9, 16, 18, ramp[0]!);
        if (lit) a.emit(x, y + 10, 14, 16, rng.pick(LIT), 0.5);
        else a.rect(x, y + 10, 14, 16, RAMP.glass[rng.int(0, 2)]!);
        a.rect(x + 6, y + 10, 1, 16, ramp[0]!);
        a.rect(x - 1, y + 27, 16, 1, ramp[3]!);
        // Rain streak under the sill.
        a.rect(x + rng.int(1, 10), y + 28, 1, rng.int(3, 7), ramp[0]!);
      }
    }
    // A drainpipe the height of the tile.
    a.rect(44, 0, 2, h, shade(ramp[0]!, 0.8));
    a.rect(46, 0, 1, h, ramp[2]!);
    for (let y = 10; y < h; y += storey) a.rect(43, y, 5, 1, ramp[0]!);
  });
}

/**
 * The face of an ordinary building, tiled: three bays by three storeys of
 * windows, some of them lit. Used for the row of buildings across the street.
 */
export function frontWallTile(d: WorldBuilder, ramp: Ramp, seed: number, lit: number, storey = 36): TexRegion {
  return tex(d, 108, storey * 3, (a, w, h) => {
    const rng = new Rng(seed);
    a.rect(0, 0, w, h, ramp[1]!);
    a.speckle(0, 0, w, h, ramp[0]!, 620, () => rng.next());
    a.speckle(0, 0, w, h, ramp[2]!, 360, () => rng.next());
    for (let row = 0; row < 3; row++) {
      const y = row * storey;
      a.rect(0, y, w, 1, ramp[3]!);
      a.rect(0, y + 1, w, 2, ramp[0]!);
      for (let bay = 0; bay < 3; bay++) {
        const x = bay * 36 + 8;
        a.rect(x - 1, y + 8, 22, 20, ramp[0]!);
        if (rng.chance(lit)) {
          const col = rng.pick(LIT);
          a.emit(x, y + 9, 20, 18, col, 0.55);
          // A curtain or a figure against the light.
          if (rng.chance(0.5)) a.emit(x, y + 9, rng.int(4, 9), 18, shade(col, 0.6), 0.4);
          else a.rect(x + rng.int(4, 12), y + 16, 4, 11, '#1a1c24');
        } else {
          a.rect(x, y + 9, 20, 18, RAMP.glass[rng.int(0, 2)]!);
          a.rect(x, y + 9, 20, 1, RAMP.glass[3]);
        }
        a.rect(x + 9, y + 9, 1, 18, ramp[0]!);
        a.rect(x - 1, y + 28, 22, 1, ramp[3]!);
        if (rng.chance(0.3)) {
          // An air conditioner under the sill, and the stain below it.
          a.rect(x + 12, y + 29, 9, 5, RAMP.metal[2]);
          a.rect(x + 12, y + 29, 9, 1, RAMP.metal[3]);
          a.rect(x + 15, y + 34, 1, rng.int(1, 2), ramp[0]!);
        }
      }
    }
    a.rect(0, 0, 1, h, ramp[0]!);
  });
}

/** Corrugated sheet, for sheds, fences and the long sides of containers. */
export function corrugatedTile(d: WorldBuilder, base: string): TexRegion {
  return tex(d, 32, 30, (a, w, h) => {
    a.rect(0, 0, w, h, base);
    for (let x = 2; x < w; x += 4) a.rect(x, 1, 1, h - 2, shade(base, 0.74));
    a.rect(0, 0, w, 1, shade(base, 1.4));
    a.rect(0, h - 1, w, 1, shade(base, 0.55));
  });
}

// --------------------------------------------------------------- helpers

export interface GroundOpts {
  /** Standing water: how mirror-like the surface is, 0..1. */
  wet?: number;
  /** Depth of the paved strip along the foot of the walls; 0 for none. */
  kerb?: number;
  /** Tile for that strip. */
  paving?: TexRegion;
  /** Painted lane lines at these depths (negative is toward the lens). */
  lanes?: { z: number; color: string }[];
  /** Rails let into the ground at these depths. */
  rails?: number[];
  /** The ground stops at a quay edge this far back, with water beyond and below it. */
  shore?: { z: number; drop: number; water: TexRegion; wall: TexRegion };
}

/**
 * The ground of a level: one plane at its ground height, from just in front
 * of the lens to the horizon. This replaces the flat strip the play layer
 * used to paint under everyone's feet.
 */
export function ground(c: PaintCtx, tile: TexRegion, o: GroundOpts = {}): void {
  const d = c.depth;
  const y = c.level.groundY;
  const x0 = -REACH;
  const x1 = c.level.width + REACH;
  const wet = o.wet ?? 0.5;
  const kerb = o.kerb ?? 0;
  d.floor(x0, x1, y, NEAR, -kerb, tile, { tile: true, wet });
  if (o.shore) {
    const sh = o.shore;
    d.floor(x0, x1, y, 0, sh.z, tile, { tile: true, wet: wet * 0.8 });
    // The quay's edge seen from above is a lip of light concrete; the water lies below and beyond it.
    d.floor(x0, x1, y - 0.2, sh.z - 3, sh.z, sh.wall, { tile: true, shade: 1.5 });
    d.floor(x0, x1, y + sh.drop, sh.z, FAR, sh.water, { tile: true, water: true, lit: 0.6 });
  } else d.floor(x0, x1, y, 0, FAR, tile, { tile: true, wet: wet * 0.8, lit: 0.8 });
  const rail = o.rails?.length ? railTile(d) : null;
  for (const z of o.rails ?? []) d.floor(x0, x1, y - 0.25, z - 1.5, z + 1.5, rail!, { tile: true, wet: 0.5 });
  if (kerb > 0 && o.paving) {
    // Pavement along the foot of the buildings, a step lighter than the road, and its kerb edge.
    d.floor(x0, x1, y, -kerb, 0, o.paving, { tile: true, wet: wet * 0.45 });
    d.floor(x0, x1, y - 0.2, -kerb - 2, -kerb, o.paving, { tile: true, wet: 0, shade: 1.5 });
  }
  let n = 0;
  for (const lane of o.lanes ?? []) {
    const dash = dashTile(d, lane.color, c.level.seed + 31 * ++n);
    d.floor(x0, x1, y - 0.3, lane.z - 2, lane.z + 2, dash, { tile: true, cut: true, wet: 0.2, shade: 0.8 });
  }
}

export interface BlockLook {
  side: TexRegion;
  top: TexRegion;
}

/** A flat plane at height y from depth z0 back to the horizon (a street far below, a sea of cloud). */
export function plain(c: PaintCtx, y: number, tile: TexRegion, s: Surface = {}, z0 = NEAR): void {
  c.depth.floor(-REACH, c.level.width + REACH, y, z0, FAR, tile, { tile: true, ...s });
}

/**
 * The far side of something open (a lattice mast, a tower frame): run the
 * same painter again into a cut-out and stand it `z` behind the original, so
 * the structure has a back as well as a front.
 */
export function backCopy(c: PaintCtx, x: number, y: number, w: number, h: number, z: number, paint: (c: PaintCtx) => void, s: Surface = {}): void {
  const d = c.depth;
  const r = d.region(w, h);
  // Painters work in world coordinates: slide the atlas origin so (x, y) lands on the region's corner.
  d.atlas.setOrigin(r.x - x, r.y - y);
  paint({ ...c, back: d.atlas, mid: d.atlas, front: d.atlas, lights: [], emitters: [], flickers: [] });
  d.seal(r);
  d.face(x, x + w, y, y + h, z, r, { cut: true, shade: 0.72, ...s });
}

/**
 * Something standing on the ground between the action and the lens (a
 * bollard, a hydrant, a parked scooter): a small cut-out, drawn dark and out
 * of focus, that slides past faster than the street behind it.
 */
export function nearProp(c: PaintCtx, x: number, z: number, w: number, h: number, paint: (a: Art, w: number, h: number) => void): void {
  const d = c.depth;
  const r = d.region(w, h);
  paint(d.atlas, w, h);
  d.seal(r);
  const G = c.level.groundY;
  d.face(x - w / 2, x + w / 2, G - h, G, z, r, { cut: true, shade: 0.75 });
}

/** Something standing at depth `z` with its foot at height `foot`: a cut-out with real position. */
export function standing(c: PaintCtx, x: number, foot: number, z: number, w: number, h: number, paint: (a: Art, w: number, h: number) => void, s: Surface = {}): void {
  const d = c.depth;
  const r = d.region(w, h);
  paint(d.atlas, w, h);
  d.seal(r);
  d.face(x - w / 2, x + w / 2, foot - h, foot, z, r, { cut: true, shade: 0.85, ...s });
}

/** The usual furniture of a flat roof, scattered back across it: tanks, air handlers, aerials, a lit skylight. */
export function roofClutter(c: PaintCtx, x0: number, x1: number, y: number, depth: number, seed: number): void {
  const rng = new Rng(seed);
  const m = RAMP.metal;
  const n = Math.max(1, Math.round((x1 - x0) / 90));
  for (let i = 0; i < n; i++) {
    const x = rng.int(x0 + 16, Math.max(x0 + 17, x1 - 16));
    const z = rng.int(36, Math.max(40, depth - 24));
    const kind = rng.int(0, 3);
    if (kind === 0) {
      standing(c, x, y, z, 22, 28, (a) => {
        a.rect(2, 0, 18, 17, '#2f3644');
        a.rect(2, 0, 18, 1, '#525b6c');
        a.rect(2, 6, 18, 1, '#1e232d');
        a.rect(2, 12, 18, 1, '#1e232d');
        for (const lx of [3, 9, 15, 18]) a.rect(lx, 17, 1, 11, '#1e232d');
      });
    } else if (kind === 1) {
      standing(c, x, y, z, 18, 11, (a) => {
        a.rect(0, 0, 18, 11, m[1]);
        a.rect(0, 0, 18, 1, m[3]);
        a.disc(6, 6, 3, m[0]);
        a.rect(12, 3, 4, 5, m[0]);
      });
    } else if (kind === 2) {
      standing(c, x, y, z, 12, 40, (a) => {
        a.rect(5, 0, 1, 40, '#14161a');
        a.rect(1, 6, 10, 1, '#14161a');
        a.rect(3, 12, 6, 1, '#14161a');
        a.epx(5, 0, '#ff4b3a');
      });
    } else {
      // A stair-head hut with a lit window.
      standing(c, x, y, z, 26, 24, (a) => {
        a.rect(0, 2, 26, 22, '#343b49');
        a.rect(0, 0, 26, 3, '#4a5262');
        a.rect(3, 8, 8, 16, '#1c2029');
        a.emit(15, 8, 8, 7, rng.pick(LIT), 0.5);
      });
    }
  }
}

/** Street furniture for the near side of a road, scattered along the level. */
export function nearStreet(c: PaintCtx, seed: number): void {
  const rng = new Rng(seed);
  const m = RAMP.metal;
  for (let x = 120 + rng.int(0, 120); x < c.level.width - 60; x += rng.int(170, 330)) {
    const z = -rng.int(90, 210);
    const kind = rng.int(0, 3);
    if (kind === 0) {
      // Bollard with a reflective band.
      nearProp(c, x, z, 6, 16, (a) => {
        a.rect(1, 2, 4, 14, m[1]);
        a.rect(1, 2, 4, 1, m[3]);
        a.rect(0, 0, 6, 2, m[2]);
        a.rect(1, 6, 4, 2, '#b89a2a');
      });
    } else if (kind === 1) {
      // Fire hydrant.
      nearProp(c, x, z, 10, 14, (a) => {
        a.rect(3, 3, 4, 11, '#8a2a24');
        a.rect(2, 1, 6, 3, '#a8382e');
        a.rect(0, 6, 10, 3, '#8a2a24');
        a.rect(3, 3, 1, 11, '#c0503e');
        a.rect(2, 13, 6, 1, '#4a1612');
      });
    } else if (kind === 2) {
      // A rubbish bin on a post.
      nearProp(c, x, z, 12, 22, (a) => {
        a.rect(5, 0, 2, 22, m[0]);
        a.rect(1, 4, 10, 11, '#2c4a3c');
        a.rect(1, 4, 10, 1, '#4a7a62');
        a.rect(1, 14, 10, 1, '#16261e');
      });
    } else {
      // A parked scooter.
      nearProp(c, x, z, 30, 20, (a) => {
        const body = rng.pick(['#2f607c', '#8a3a30', '#c8b84a', '#3a3a44']);
        a.disc(5, 15, 4, '#101216');
        a.disc(24, 15, 4, '#101216');
        a.rect(6, 10, 16, 4, body);
        a.rect(18, 4, 3, 8, body);
        a.rect(16, 3, 8, 2, m[1]);
        a.rect(7, 7, 9, 3, '#15171b');
        a.rect(6, 10, 16, 1, shade(body, 1.4));
      });
    }
  }
}

/** Give something the play layer draws flat its missing sides and top. */
export function block(c: PaintCtx, x0: number, x1: number, yTop: number, yBot: number, depth: number, look: BlockLook, s: Surface = {}): void {
  c.depth.block(x0, x1, yTop, yBot, depth, look, s);
}

/** Wall materials a facade may be built of, in the order `facade()` picks from. */
const FACADE_MATS = ['concrete', 'plaster', 'tile', 'brick', 'concrete', 'plaster'] as const;

type WallMat = (typeof FACADE_MATS)[number];

/** Shared textures for a street of buildings, made once per scene. */
export interface StreetKit {
  walls: Record<WallMat, TexRegion>;
  fronts: Record<WallMat, TexRegion>;
  roof: TexRegion;
}

/** `lit` is the share of windows with a light on: high at night, low at dawn. */
export function streetKit(c: PaintCtx, lit = 0.32): StreetKit {
  const d = c.depth;
  const seed = c.level.seed;
  return {
    walls: {
      concrete: sideWallTile(d, RAMP.concrete, seed + 1),
      plaster: sideWallTile(d, RAMP.plaster, seed + 2),
      tile: sideWallTile(d, RAMP.tile, seed + 3),
      brick: sideWallTile(d, RAMP.brick, seed + 4),
    },
    fronts: {
      concrete: frontWallTile(d, RAMP.concrete, seed + 6, lit),
      plaster: frontWallTile(d, RAMP.plaster, seed + 7, lit),
      tile: frontWallTile(d, RAMP.tile, seed + 8, lit),
      brick: frontWallTile(d, RAMP.brick, seed + 9, lit),
    },
    roof: roofTile(d, seed + 5),
  };
}

export interface RowOpts {
  /** Depth of the row's front faces behind the play plane. */
  z: number;
  /** Building heights, px. */
  height: [number, number];
  width?: [number, number];
  /** Gaps between buildings (alleys). */
  gap?: [number, number];
  /** Where the buildings' feet are, if not on the level's ground (rooftop scenes look down on them). */
  foot?: number;
  seed: number;
}

/**
 * A row of whole buildings standing back from the play plane: the far side of
 * the street, seen over fences and between the buildings in front. Each has a
 * face, two sides and a roof, so the row has real corners and alleys.
 */
export function backRow(c: PaintCtx, kit: StreetKit, o: RowOpts): void {
  const d = c.depth;
  const G = o.foot ?? c.level.groundY;
  const rng = new Rng(o.seed);
  const mats: WallMat[] = ['concrete', 'plaster', 'tile', 'brick'];
  // Far enough out to cover the frame's edges at the row's depth, at either end of the level.
  let x = -700 + rng.int(0, 60);
  const end = c.level.width + 700;
  while (x < end) {
    const w = rng.int(o.width?.[0] ?? 90, o.width?.[1] ?? 190);
    const h = Math.round(rng.int(o.height[0], o.height[1]) / 36) * 36 + 8;
    const depth = rng.int(160, 260);
    const mat = rng.pick(mats);
    const top = G - h;
    const u0 = rng.int(0, 2) * 36;
    const v0 = rng.int(0, 2) * 36;
    d.face(x, x + w, top, G, o.z, kit.fronts[mat], { tile: true, u0, v0, shade: 0.9 });
    d.side(x, top, G, o.z, o.z + depth, kit.walls[mat], { tile: true, u0, v0 });
    d.side(x + w, top, G, o.z, o.z + depth, kit.walls[mat], { tile: true, u0: u0 + 36, v0 });
    d.floor(x, x + w, top, o.z, o.z + depth, kit.roof, { tile: true, shade: 0.9 });
    if (rng.chance(0.4)) {
      // A hanging neon blade on one corner, the kind every block in this city has.
      const col = rng.pick(['#ff3d9a', '#3df2ff', '#4dff9a', '#ffb347', '#b56bff']);
      const sh = rng.int(34, 70);
      const sign = d.region(9, sh);
      d.atlas.rect(0, 0, 9, sh, '#14161c');
      d.atlas.emit(1, 1, 7, sh - 2, col, 0.5);
      for (let y = 5; y < sh - 4; y += rng.int(6, 9)) d.atlas.emit(2, y, 5, 2, '#ffffff', 0.7);
      d.seal(sign);
      const sx = rng.chance(0.5) ? x + 6 : x + w - 15;
      d.face(sx, sx + 9, top + 30, top + 30 + sh, o.z - 4, sign, { lit: 0 });
    }
    if (rng.chance(0.5)) {
      // A water tank on the roof, on legs.
      const tank = d.region(22, 26);
      d.atlas.rect(2, 0, 18, 16, '#2a303c');
      d.atlas.rect(2, 0, 18, 1, '#48505e');
      d.atlas.rect(2, 5, 18, 1, '#1c2029');
      d.atlas.rect(2, 11, 18, 1, '#1c2029');
      for (const lx of [3, 9, 15, 18]) d.atlas.rect(lx, 16, 1, 10, '#1c2029');
      d.seal(tank);
      const tx = x + rng.int(8, Math.max(9, w - 32));
      d.face(tx, tx + 22, top - 26, top, o.z + depth * 0.4, tank, { cut: true, shade: 0.8 });
    }
    x += w + rng.int(o.gap?.[0] ?? 0, o.gap?.[1] ?? 34);
  }
}

/** The body of a street-front building behind its painted face. */
export function facadeBlock(c: PaintCtx, kit: StreetKit, p: PropDef): void {
  // Same seed and first draw as the face painter, so the side is the same material as the front.
  const rng = new Rng(p.seed ?? seedOf(p.x, p.y, 3));
  const mat = rng.pick(FACADE_MATS);
  const w = p.w ?? 120;
  const top = Math.max(-c.oy, p.y - (p.h ?? 9999));
  const depth = 150 + (seedOf(p.x, p.y, 9) % 120);
  block(c, p.x, p.x + w, top, p.y, depth, { side: kit.walls[mat], top: kit.roof });
}
