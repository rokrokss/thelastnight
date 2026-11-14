import { PAD } from '../../core/constants';
import { mix, shade } from '../../core/color';
import { Rng } from '../../core/math';
import type { LevelData, PropDef, Solid } from '../../game/level';
import { cityBackdrop, paintForeground } from '../backdrop';
import { backRow, plain, roofClutter, roofTile, sideWallTile, streetBelowTile, streetKit } from '../depth';
import { GLOW, RAMP } from '../palette';
import { acUnit, cable, glow, maskFloor, maskOccluder, seedOf, wall, windowUnit, type PaintCtx } from '../paint';
import { paintProp } from '../props';
import { beginScene, DEFAULT_LOOK, paintLadder, paintOneWay, paintSolid, type SceneArt } from '../scene';

const LIT = ['#d9a560', '#c98f4e', '#8fb8cc', '#c8a078', '#7f90d8'];

/** A building seen from its roof down: green waterproofed slab, then the facade falling away. */
function roofBlock(c: PaintCtx, s: Solid, bottom: number): void {
  const a = c.back;
  const rng = new Rng(seedOf(s.x, s.y, 21));
  const m = RAMP[rng.pick(['concrete', 'plaster', 'tile', 'brick'] as const)];
  const g = RAMP.roofGreen;
  const top = s.y;
  const h = bottom - top;
  wall(a, s.x, top + 11, s.w, h - 11, m, rng);
  a.rect(s.x, top + 11, 1, h - 11, m[2]);
  a.rect(s.x + s.w - 2, top + 11, 2, h - 11, m[0]);
  // Windows on the way down.
  const bays = Math.max(1, Math.floor((s.w - 12) / 28));
  const startX = s.x + Math.floor((s.w - bays * 28) / 2) + 6;
  for (let fy = top + 24; fy + 20 < bottom; fy += 36) {
    for (let b = 0; b < bays; b++) {
      if (rng.chance(0.12)) continue;
      const lit = rng.chance(0.34) ? rng.pick(LIT) : null;
      windowUnit(a, startX + b * 28, fy, 16, 17, { lit, style: rng.pick(['plain', 'blinds', 'curtain', 'figure'] as const), frame: shade(m[0], 0.8) }, rng);
      if (rng.chance(0.22)) acUnit(a, startX + b * 28 + 2, fy + 22, rng);
    }
    a.rect(s.x, fy + 30, s.w, 1, m[0]);
  }
  // Parapet cap and painted slab.
  a.rect(s.x - 2, top, s.w + 4, 2, RAMP.concrete[3]);
  a.rect(s.x - 2, top + 2, s.w + 4, 1, RAMP.concrete[1]);
  a.rect(s.x, top + 3, s.w, 8, g[1]);
  a.rect(s.x, top + 3, s.w, 1, g[2]);
  a.rect(s.x, top + 10, s.w, 1, g[0]);
  for (let x = s.x + rng.int(10, 30); x < s.x + s.w - 4; x += rng.int(26, 48)) a.rect(x, top + 3, 1, 8, g[0]);
  a.speckle(s.x, top + 3, s.w, 8, g[3], Math.floor(s.w / 9), () => rng.next());
  for (let i = 0; i < Math.floor(s.w / 40); i++) {
    a.tint(s.x + rng.int(2, s.w - 6), top + 10, rng.int(2, 4), rng.int(10, 34), '#12161c', 0.3);
  }
  maskFloor(c, s.x, top, s.w, 9, (px) => (px % 37 < 20 ? 0.3 : 0.16));
  maskOccluder(c, s.x, top + 6, s.w, h - 6);
}

function tank(c: PaintCtx, x: number, y: number, rng: Rng): void {
  const a = c.back;
  const col = rng.pick(['#c8b83a', '#3f7fa8', '#8a9299']);
  a.rect(x + 2, y - 8, 2, 8, RAMP.metal[0]);
  a.rect(x + 18, y - 8, 2, 8, RAMP.metal[0]);
  a.rect(x, y - 30, 22, 22, col);
  a.rect(x, y - 30, 22, 1, shade(col, 1.35));
  a.rect(x, y - 30, 3, 22, shade(col, 0.7));
  a.rect(x, y - 20, 22, 1, shade(col, 0.75));
  a.rect(x + 3, y - 33, 16, 3, shade(col, 0.85));
  a.rect(x + 22, y - 14, 5, 2, RAMP.metal[1]);
  a.rect(x + 26, y - 14, 2, 14, RAMP.metal[1]);
}

/** Rooftop room: the classic add-on shack with a door and one lit window. */
function shed(c: PaintCtx, x: number, y: number, w: number, lit: boolean, rng: Rng): void {
  const a = c.back;
  const m = RAMP[rng.pick(['plaster', 'tile', 'concrete'] as const)];
  const h = 42;
  wall(a, x, y - h, w, h, m, rng);
  a.rect(x - 3, y - h - 4, w + 6, 5, RAMP.metal[1]);
  a.rect(x - 3, y - h - 4, w + 6, 1, RAMP.metal[3]);
  for (let i = x - 2; i < x + w + 3; i += 4) a.rect(i, y - h - 3, 1, 3, RAMP.metal[0]);
  // Doorway (a dark recess someone could stand in).
  a.rect(x + 7, y - 34, 18, 34, '#090a0e');
  a.rect(x + 6, y - 35, 20, 1, m[3]);
  a.rect(x + 6, y - 35, 1, 35, m[0]);
  a.rect(x + 25, y - 35, 1, 35, m[0]);
  if (w > 46) {
    const col = lit ? rng.pick(LIT) : null;
    windowUnit(a, x + 34, y - 30, Math.min(20, w - 42), 14, { lit: col, style: 'curtain', frame: shade(m[0], 0.8) }, rng);
    if (col) c.lights.push({ x: x + 42, y: y - 22, r: 62, color: col, k: 0.55, falloff: 1.5 });
  }
  a.emit(x + 15, y - 39, 2, 2, GLOW.warm, 0.7);
  c.lights.push({ x: x + 16, y: y - 34, r: 44, color: GLOW.warm, k: 0.4, falloff: 1.4, flicker: 'candle' });
  maskOccluder(c, x + 26, y - h, w - 26, h);
}

function billboard(c: PaintCtx, p: PropDef, rng: Rng): void {
  const a = c.back;
  const w = p.w ?? 120;
  const h = p.h ?? 44;
  const x = p.x;
  const y = p.y;
  const col = glow(p.color, 'pink');
  const m = RAMP.metal;
  // Scaffold.
  for (let i = 0; i <= w; i += Math.floor(w / 3)) {
    a.rect(x + Math.min(i, w - 2), y - 18 - h, 2, h + 18, m[0]);
  }
  a.line(x, y, x + Math.floor(w / 3), y - 18, m[0]);
  a.line(x + w, y, x + w - Math.floor(w / 3), y - 18, m[0]);
  a.rect(x, y - 18, w, 1, m[1]);
  // Panel.
  a.rect(x - 2, y - 20 - h, w + 4, h + 2, '#1a1e26');
  a.emit(x, y - 18 - h, w, h, shade(col, 0.42), 0.15);
  a.emit(x, y - 18 - h, w, 1, shade(col, 0.8), 0.2);
  const text = p.text ?? 'MERIDIAN';
  a.text(text, x + Math.floor(w / 2), y - 18 - Math.floor(h / 2) - 9, '#f4f8ff', { font: 'g14', align: 'center', emit: true, base: 0.6 });
  if (p.variant) {
    a.text('ASSURE  —  BE THE FIRST TO KNOW', x + Math.floor(w / 2), y - 18 - Math.floor(h / 2) + 9, shade(col, 1.5), {
      font: 'g7',
      align: 'center',
      emit: true,
      base: 0.5,
    });
  }
  c.lights.push({ x: x + w / 2, y: y - 18 - h / 2, r: 130, color: col, k: 0.6, falloff: 1.5 });
  c.lights.push({ x: x + w / 2, y: y + 6, r: 90, color: col, k: 0.4, falloff: 1.5 });
  if (rng.chance(0.5)) c.flickers.push({ x: x, y: y - 18 - h, w, h, mode: 'buzz', seed: seedOf(x, y, 2) });
}

/** The old water tower: a riveted tank on a braced frame. Collision supplies its ladder and gallery. */
function waterTower(c: PaintCtx, x: number, y: number): void {
  const a = c.back;
  const m = RAMP.rust;
  const legTop = y - 80;
  for (const lx of [x, x + 138]) {
    a.rect(lx, legTop, 4, 80, m[1]);
    a.rect(lx, legTop, 1, 80, m[3]);
  }
  for (let yy = legTop; yy < y; yy += 40) {
    a.line(x + 3, yy, x + 138, yy + 40, m[0], 2);
    a.line(x + 138, yy, x + 3, yy + 40, m[0], 2);
    a.rect(x, yy, 142, 2, m[1]);
  }
  // Tank.
  const ty = legTop - 62;
  a.rect(x - 6, ty, 154, 62, m[2]);
  for (let i = x - 6; i < x + 148; i += 14) a.rect(i, ty, 1, 62, m[1]);
  a.rect(x - 6, ty, 154, 2, m[3]);
  a.rect(x - 6, ty + 20, 154, 2, m[1]);
  a.rect(x - 6, ty + 42, 154, 2, m[1]);
  a.rect(x - 6, ty, 8, 62, m[0]);
  a.rect(x - 6, ty + 60, 154, 2, m[0]);
  a.tint(x + 20, ty + 4, 30, 54, '#1a1410', 0.25);
  a.tint(x + 90, ty + 10, 18, 50, '#1a1410', 0.3);
  // Conical cap and vane.
  for (let i = 0; i < 12; i++) a.rect(x - 6 + i * 6, ty - 1 - i, 154 - i * 12, 1, i % 3 === 0 ? m[3] : m[1]);
  a.rect(x + 70, ty - 26, 1, 14, m[0]);
  a.emit(x + 70, ty - 28, 1, 2, GLOW.red, 0.6);
  a.text('SALTGATE', x + 71, ty + 26, shade(m[3], 1.25), { font: 'g9', align: 'center' });
  c.lights.push({ x: x + 70, y: ty - 26, r: 50, color: GLOW.red, k: 0.6, flicker: 'blink' });
}

function roofProp(c: PaintCtx, p: PropDef): boolean {
  const a = p.front ? c.front : c.back;
  const rng = new Rng(p.seed ?? seedOf(p.x, p.y, 4));
  const x = p.x;
  const y = p.y;
  const m = RAMP.metal;
  switch (p.kind) {
    case 'tank':
      tank(c, x, y, rng);
      return true;
    case 'shed':
      shed(c, x, y, p.w ?? 64, p.variant !== 0, rng);
      return true;
    case 'billboard':
      billboard(c, p, rng);
      return true;
    case 'watertower':
      waterTower(c, x, y);
      return true;
    case 'acbank': {
      const n = p.variant ?? 2;
      for (let i = 0; i < n; i++) {
        const ax = x + i * 20;
        a.rect(ax, y - 14, 18, 14, RAMP.plaster[2]);
        a.rect(ax, y - 14, 18, 1, RAMP.plaster[3]);
        a.rect(ax, y - 1, 18, 1, RAMP.plaster[0]);
        a.disc(ax + 9, y - 7, 4.5, '#22262c');
        a.line(ax + 6, y - 7, ax + 12, y - 7, RAMP.plaster[1]);
        a.line(ax + 9, y - 10, ax + 9, y - 4, RAMP.plaster[1]);
      }
      return true;
    }
    case 'ventstack':
      a.rect(x + 3, y - 18, 6, 18, m[1]);
      a.rect(x + 3, y - 18, 1, 18, m[3]);
      a.rect(x, y - 22, 12, 4, m[2]);
      a.rect(x, y - 22, 12, 1, m[3]);
      c.emitters.push({ kind: 'steam', x: x + 6, y: y - 23, rate: p.variant ?? 5, w: 8 });
      return true;
    case 'aerial':
      a.rect(x, y - 34, 1, 34, '#0e1014');
      a.rect(x - 6, y - 30, 13, 1, '#0e1014');
      a.rect(x - 4, y - 25, 9, 1, '#0e1014');
      a.rect(x - 2, y - 20, 5, 1, '#0e1014');
      a.line(x, y - 8, x + 8, y, '#0e1014');
      return true;
    case 'dish':
      a.rect(x + 5, y - 8, 2, 8, m[0]);
      a.disc(x + 6, y - 13, 7, '#aab2ba');
      a.disc(x + 7, y - 14, 5, '#cfd6dc');
      a.line(x + 7, y - 14, x + 12, y - 20, m[0]);
      return true;
    case 'laundry': {
      const w = p.w ?? 70;
      a.rect(x, y - 30, 1, 30, m[0]);
      a.rect(x + w, y - 30, 1, 30, m[0]);
      cable(a, x, y - 29, x + w, y - 29, 3, '#1a1c22');
      for (let i = x + 5; i < x + w - 8; i += rng.int(8, 13)) {
        const cc = mix(rng.pick(RAMP.cloth), rng.pick(['#9a5a5a', '#5a6a9a', '#9a9a5a', '#d8d8d8', '#5a8a7a']), 0.5);
        const ch = rng.int(8, 14);
        a.rect(i, y - 27, rng.int(5, 9), ch, cc);
        a.rect(i, y - 27, 1, ch, shade(cc, 0.75));
      }
      return true;
    }
    case 'skylight': {
      const w = p.w ?? 34;
      a.rect(x, y - 8, w, 8, '#20242c');
      a.emit(x + 1, y - 7, w - 2, 6, '#c79a56', 0.3);
      for (let i = x + 8; i < x + w - 2; i += 8) a.rect(i, y - 7, 1, 6, '#20242c');
      c.lights.push({ x: x + w / 2, y: y - 12, r: 70, color: '#ffcf8a', k: 0.55, cone: { dx: 0, dy: -1, inner: 0.5, outer: 1.2 }, falloff: 1.4 });
      return true;
    }
    case 'stairhead': {
      const pl = RAMP.concrete;
      a.rect(x, y - 48, 62, 48, pl[1]);
      a.rect(x, y - 48, 62, 2, pl[3]);
      a.rect(x + 60, y - 48, 2, 48, pl[0]);
      a.rect(x + 34, y - 36, 20, 36, '#0a0b0f');
      a.emit(x + 43, y - 42, 3, 2, GLOW.green, 0.6);
      a.text('EXIT', x + 6, y - 40, pl[3], { font: 'g7' });
      c.lights.push({ x: x + 44, y: y - 30, r: 50, color: GLOW.green, k: 0.4 });
      return true;
    }
    case 'chair':
      a.rect(x, y - 8, 7, 2, '#b83a34');
      a.rect(x, y - 15, 2, 9, '#b83a34');
      a.rect(x, y - 6, 1, 6, '#7a2a26');
      a.rect(x + 6, y - 6, 1, 6, '#7a2a26');
      return true;
    case 'cablestation': {
      a.rect(x, y - 92, 6, 92, m[1]);
      a.rect(x, y - 92, 1, 92, m[3]);
      a.rect(x - 18, y - 92, 56, 5, m[1]);
      a.disc(x + 28, y - 84, 7, m[0]);
      a.disc(x + 28, y - 84, 4, m[2]);
      cable(a, x + 28, y - 78, c.level.width + PAD, y - 20, 8, '#0b0d11');
      cable(a, x - 18, y - 90, x - 220, y - 10, 4, '#0b0d11');
      a.emit(x + 1, y - 100, 4, 3, GLOW.amber, 0.6);
      c.lights.push({ x: x + 3, y: y - 98, r: 64, color: GLOW.amber, k: 0.6, flicker: 'pulse' });
      return true;
    }
  }
  return false;
}

/** The Tops: a roofscape of water tanks, add-on rooms and aerials, above the glow of the streets. */
export function paintTops(level: LevelData): SceneArt {
  const { c, art } = beginScene(level, {
    ...DEFAULT_LOOK,
    ambPlay: [0.22, 0.27, 0.41],
    fogColor: [0.1, 0.13, 0.2],
    fogMid: 0.16,
    groundFog: 0.5,
    scatter: 0.1,
    reflect: 0.4,
  });
  const a = c.back;
  const bottom = level.height + PAD;
  const roofs = level.solids.filter((s) => s.tag === 'roof').sort((p, q) => p.x - q.x);

  // Street light welling up between the buildings.
  for (let i = 0; i < roofs.length - 1; i++) {
    const gx0 = roofs[i]!.x + roofs[i]!.w;
    const gx1 = roofs[i + 1]!.x;
    const cx = (gx0 + gx1) / 2;
    const col = i % 3 === 0 ? '#ffa85a' : i % 3 === 1 ? '#5fd8d0' : '#ff7ab0';
    a.halo(cx, bottom - 10, 150, col, 0.5);
    a.halo(cx, bottom + 30, 90, '#ffffff', 0.22);
  }
  // The roofs as the tops of whole buildings: each runs back from its parapet,
  // its walls drop into the street far below, and more of the city stands behind.
  const kit = streetKit(c, 0.3);
  const roofTex = roofTile(c.depth, level.seed + 31);
  const street = level.height + 520;
  c.depth.floorY = street;
  plain(c, street, streetBelowTile(c.depth, level.seed + 32), { wet: 0.5, lit: 0 }, -400);
  const wallTex = [RAMP.concrete, RAMP.brick, RAMP.plaster].map((r, i) => sideWallTile(c.depth, r, level.seed + 40 + i));
  roofs.forEach((s, i) => {
    const depth = 200 + ((s.x * 7) % 140);
    c.depth.side(s.x, s.y, street, 0, depth, wallTex[i % 3]!, { tile: true });
    c.depth.side(s.x + s.w, s.y, street, 0, depth, wallTex[i % 3]!, { tile: true, u0: 36 });
    c.depth.floor(s.x, s.x + s.w, s.y, 0, depth, roofTex, { tile: true, wet: 0.3 });
    roofClutter(c, s.x, s.x + s.w, s.y, depth, level.seed + 50 + i);
  });
  backRow(c, kit, { z: 420, height: [430, 700], width: [120, 240], gap: [20, 90], foot: street, seed: level.seed + 33 });
  backRow(c, kit, { z: 760, height: [520, 860], width: [140, 260], gap: [0, 60], foot: street, seed: level.seed + 34 });
  for (const s of roofs) roofBlock(c, s, bottom);
  for (const p of level.props) if (!roofProp(c, p)) paintProp(c, art, p);
  for (const s of level.solids) if (s.tag !== 'roof') paintSolid(c, s);
  for (const o of level.oneWays) paintOneWay(c, o);
  for (const l of level.ladders) paintLadder(a, l.x, l.y0, l.y1);

  cityBackdrop(level, art, {
    seed: level.seed,
    skyStops: ['#04060f', '#081022', '#0f1c36', '#1a2946', '#2c3350', '#473c52'],
    stars: 40,
    clouds: 0.6,
    cloudColor: '#34365a',
    moon: { x: 96, y: 52, r: 8, color: '#cdd8ea' },
    haze: '#2a2c48',
    bodies: ['#111b34', '#0d172c', '#0e1522', '#0a0e17'],
    horizon: 236,
    spire: 0.5,
    rail: false,
    lit: 1.15,
    traffic: 1.4,
  });
  paintForeground(level, art, 'roof', level.seed + 5);
  return art;
}
