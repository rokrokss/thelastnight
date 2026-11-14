import { PAD } from '../../core/constants';
import { shade } from '../../core/color';
import { Rng } from '../../core/math';
import { Art } from '../../gfx/art';
import type { LevelData, PropDef, Solid } from '../../game/level';
import { cityBackdrop, paintForeground } from '../backdrop';
import { concreteTile, corrugatedTile, ground, waterTile } from '../depth';
import type { TexRegion } from '../../gfx/world';
import { GLOW, RAMP } from '../palette';
import { cable, maskFloor, maskOccluder, seedOf, type PaintCtx } from '../paint';
import { paintProp } from '../props';
import { beginScene, DEFAULT_LOOK, layerFloor, layerSize, paintLadder, paintOneWay, paintSolid, type SceneArt } from '../scene';

export const BOX_W = 72;
export const BOX_H = 30;

const BOX_COLORS = ['#8f3a2e', '#2f607c', '#5f7436', '#96702a', '#6a4a7c', '#3c6a66', '#7c7f86', '#a04e2a'];
const OWNERS = ['SGTE', 'MRDN', 'HVNL', 'TIDE', 'KOBU', 'PIER'];

/** One shipping container: corrugated sides, castings, lock rods, stencilled ID. */
export function paintBox(a: Art, x: number, y: number, seed: number): void {
  const rng = new Rng(seed);
  const base = rng.pick(BOX_COLORS);
  const k = rng.range(0.82, 1.06);
  const c1 = shade(base, k);
  a.rect(x, y, BOX_W, BOX_H, c1);
  for (let i = 2; i < BOX_W - 1; i += 3) a.rect(x + i, y + 2, 1, BOX_H - 4, shade(c1, 0.76));
  a.rect(x, y, BOX_W, 2, shade(c1, 1.32));
  a.rect(x, y + BOX_H - 2, BOX_W, 2, shade(c1, 0.5));
  a.rect(x, y, 2, BOX_H, shade(c1, 0.62));
  a.rect(x + BOX_W - 2, y, 2, BOX_H, shade(c1, 0.56));
  for (const [cx, cy] of [
    [0, 0],
    [BOX_W - 3, 0],
    [0, BOX_H - 3],
    [BOX_W - 3, BOX_H - 3],
  ] as const) {
    a.rect(x + cx, y + cy, 3, 3, '#15171b');
  }
  if (rng.chance(0.45)) {
    // Door end: lock rods and handles.
    for (const dx of [50, 56, 62]) a.rect(x + dx, y + 3, 1, BOX_H - 6, shade(c1, 1.4));
    a.rect(x + 49, y + 15, 15, 1, shade(c1, 0.5));
    a.rect(x + 47, y + 2, 1, BOX_H - 4, shade(c1, 0.5));
  }
  const id = `${rng.pick(OWNERS)} ${rng.int(1000, 9999)}`;
  a.text(id, x + 6, y + 5, shade(c1, 1.75), { font: 'g7' });
  if (rng.chance(0.5)) a.rect(x + 6, y + 15, rng.int(8, 16), 6, shade(c1, 1.5));
  for (let i = 0; i < 3; i++) {
    a.tint(x + rng.int(3, BOX_W - 6), y + 2, rng.int(1, 3), rng.int(8, BOX_H - 4), '#2a160e', rng.range(0.2, 0.42));
  }
}

export function boxStack(c: PaintCtx, s: Solid): void {
  const cols = Math.max(1, Math.round(s.w / BOX_W));
  const rows = Math.max(1, Math.round(s.h / BOX_H));
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) paintBox(c.back, s.x + i * BOX_W, s.y + j * BOX_H, seedOf(s.x + i * BOX_W, s.y + j * BOX_H, 9));
  }
  maskOccluder(c, s.x, s.y, s.w, s.h);
  // Wet steel on top catches a little light.
  maskFloor(c, s.x, s.y, s.w, 2, () => 0.2);
}

/** Corrugated steel in each container colour, for the sides and tops the front view never showed. */
export function boxSkins(c: PaintCtx): Map<string, TexRegion> {
  const skins = new Map<string, TexRegion>();
  for (const col of BOX_COLORS) skins.set(col, corrugatedTile(c.depth, col));
  return skins;
}

/** The colour `paintBox` gives the container at this position (same seed, same first draw). */
const boxColor = (x: number, y: number): string => new Rng(seedOf(x, y, 9)).pick(BOX_COLORS);

/** A stack's missing sides and tops, container by container, so each keeps its own colour. */
export function stackDepth(c: PaintCtx, skins: Map<string, TexRegion>, s: Solid, z0 = 0): void {
  const cols = Math.max(1, Math.round(s.w / BOX_W));
  const rows = Math.max(1, Math.round(s.h / BOX_H));
  // A box is as wide as it is tall; a stack is one box deep.
  const z1 = z0 + BOX_H + 4;
  for (let j = 0; j < rows; j++) {
    for (const i of [0, cols - 1]) {
      const x = s.x + i * BOX_W;
      const skin = skins.get(boxColor(x, s.y + j * BOX_H))!;
      const edge = i === 0 ? x : x + BOX_W;
      if (i === 0 || cols === 1) c.depth.side(x, s.y + j * BOX_H, s.y + (j + 1) * BOX_H, z0, z1, skin, { tile: true });
      if (i === cols - 1) c.depth.side(edge === x ? x + BOX_W : edge, s.y + j * BOX_H, s.y + (j + 1) * BOX_H, z0, z1, skin, { tile: true });
    }
  }
  for (let i = 0; i < cols; i++) {
    const x = s.x + i * BOX_W;
    c.depth.floor(x, x + BOX_W, s.y, z0, z1, skins.get(boxColor(x, s.y))!, { tile: true, shade: 0.85, wet: 0.25 });
  }
}

/**
 * More stacks standing back from the play plane, row behind row: each is
 * painted as a real face in the atlas and given sides and a top.
 */
function stackRows(c: PaintCtx, skins: Map<string, TexRegion>, z: number, seed: number, maxRows: number): void {
  const d = c.depth;
  const G = c.level.groundY;
  const rng = new Rng(seed);
  let x = -500 + rng.int(0, 90);
  while (x < c.level.width + 500) {
    const cols = rng.int(1, 3);
    const rows = rng.int(1, maxRows);
    const w = cols * BOX_W;
    const h = rows * BOX_H;
    const r = d.region(w, h);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) paintBox(d.atlas, i * BOX_W, j * BOX_H, seedOf(x + i * BOX_W, G - h + j * BOX_H, 9));
    d.seal(r);
    d.face(x, x + w, G - h, G, z, r, { shade: 0.9 });
    stackDepth(c, skins, { x, y: G - h, w, h }, z);
    x += w + rng.int(18, 150);
  }
}

/** The quay's edge under the walking line. The apron itself is a plane in the scene's depth. */
export function dock(c: PaintCtx, x0: number, x1: number, gy: number): void {
  const a = c.back;
  const pv = RAMP.paving;
  a.rect(x0, gy, x1 - x0, 1, pv[3]);
  a.rect(x0, gy + 1, x1 - x0, 1, pv[2]);
}

/** Floodlight tower: the hard white light of a working port. */
export function floodTower(c: PaintCtx, x: number, gy: number, h: number, dir: 1 | -1): void {
  const a = c.back;
  const m = RAMP.metal;
  a.rect(x - 2, gy - 8, 7, 8, m[1]);
  for (let y = gy - h; y < gy - 8; y += 12) {
    a.line(x - 1, y, x + 3, y + 12, m[0]);
    a.line(x + 3, y, x - 1, y + 12, m[0]);
  }
  a.rect(x - 1, gy - h, 1, h - 8, m[2]);
  a.rect(x + 3, gy - h, 1, h - 8, m[1]);
  a.rect(x - 9, gy - h - 4, 22, 4, m[1]);
  a.rect(x - 9, gy - h - 4, 22, 1, m[3]);
  for (let i = 0; i < 4; i++) a.emit(x - 8 + i * 5, gy - h, 4, 3, '#eef6ff', 0.9);
  c.lights.push({
    x: x + 2 + dir * 6,
    y: gy - h + 4,
    r: 250,
    color: '#dbeeff',
    k: 1.25,
    cone: { dx: dir * 0.55, dy: 0.84, inner: 0.42, outer: 0.82 },
    shadow: true,
    falloff: 1.15,
  });
  c.lights.push({ x: x + 2, y: gy - h + 2, r: 40, color: '#dbeeff', k: 0.8 });
}

/** Ship-to-shore gantry crane. Collision supplies the ladders and decks; this is its steel. */
export function gantry(c: PaintCtx, x: number, gy: number): void {
  const a = c.back;
  const col = '#b8862a';
  const dark = shade(col, 0.55);
  const lit = shade(col, 1.3);
  const deckY = gy - 240;
  const topY = gy - 320;
  // Legs.
  for (const lx of [x, x + 130]) {
    a.rect(lx, topY, 14, gy - topY, col);
    a.rect(lx, topY, 2, gy - topY, lit);
    a.rect(lx + 12, topY, 2, gy - topY, dark);
    for (let y = topY + 20; y < gy; y += 30) a.rect(lx, y, 14, 1, dark);
    a.rect(lx - 4, gy - 10, 22, 10, '#22262c');
    a.rect(lx - 2, gy - 4, 6, 4, '#0e1014');
    a.rect(lx + 10, gy - 4, 6, 4, '#0e1014');
  }
  // Portal bracing.
  for (let y = gy - 220; y < gy - 20; y += 100) {
    a.line(x + 14, y, x + 130, y + 100, dark, 3);
    a.line(x + 130, y, x + 14, y + 100, dark, 3);
  }
  a.rect(x, gy - 120, 144, 6, col);
  a.rect(x, gy - 120, 144, 1, lit);
  // Boom: a long truss reaching out over the water.
  const bx0 = x - 70;
  const bx1 = x + 470;
  a.rect(bx0, deckY, bx1 - bx0, 8, col);
  a.rect(bx0, deckY, bx1 - bx0, 1, lit);
  a.rect(bx0, deckY + 7, bx1 - bx0, 1, dark);
  a.rect(bx0, topY, bx1 - bx0, 5, col);
  a.rect(bx0, topY, bx1 - bx0, 1, lit);
  for (let i = bx0; i < bx1 - 30; i += 40) {
    a.line(i, topY + 5, i + 20, deckY, dark, 2);
    a.line(i + 20, deckY, i + 40, topY + 5, dark, 2);
  }
  // Machinery house.
  a.rect(x + 20, deckY - 52, 96, 52, '#3a424e');
  a.rect(x + 20, deckY - 52, 96, 2, '#5a6676');
  for (let i = x + 24; i < x + 114; i += 5) a.rect(i, deckY - 48, 1, 44, '#2c333d');
  a.rect(x + 30, deckY - 34, 20, 34, '#1a1e24');
  a.emit(x + 92, deckY - 40, 16, 10, '#c79a56', 0.2);
  a.text('SG-07', x + 56, deckY - 44, '#9aa6b4', { font: 'g7' });
  c.lights.push({ x: x + 100, y: deckY - 34, r: 70, color: '#ffcf8a', k: 0.5 });
  // Operator's cab slung under the boom.
  const cx = x + 250;
  a.rect(cx, deckY + 8, 46, 30, '#2f3742');
  a.rect(cx, deckY + 8, 46, 2, '#4f5b6a');
  a.emit(cx + 4, deckY + 14, 38, 14, '#8fb8cc', 0.18);
  a.emit(cx + 22, deckY + 14, 1, 14, '#3f5560', 0.18);
  a.emit(cx + 10, deckY + 20, 6, 8, '#34464e', 0.18);
  c.lights.push({ x: cx + 23, y: deckY + 24, r: 84, color: '#bfe6ee', k: 0.6 });
  // Trolley and falls.
  const tx = x + 330;
  a.rect(tx, deckY + 8, 26, 8, '#22262c');
  for (const hx of [tx + 3, tx + 22]) a.rect(hx, deckY + 16, 1, 120, '#0c0e12');
  a.rect(tx - 2, deckY + 136, 30, 4, '#c8a82a');
  // Beacons.
  for (const [lx, ly] of [
    [bx0 + 2, topY - 3],
    [bx1 - 4, topY - 3],
    [x + 6, topY - 3],
  ] as const) {
    a.emit(lx, ly, 3, 3, GLOW.red, 0.6);
    c.lights.push({ x: lx + 1, y: ly + 1, r: 56, color: GLOW.red, k: 0.7, flicker: 'blink' });
  }
  // Work lights along the boom.
  for (let i = bx0 + 60; i < bx1; i += 150) {
    a.emit(i, deckY + 8, 5, 2, '#eef6ff', 0.9);
    c.lights.push({
      x: i + 2,
      y: deckY + 12,
      r: 170,
      color: '#dbeeff',
      k: 0.8,
      cone: { dx: 0, dy: 1, inner: 0.4, outer: 0.85 },
      shadow: true,
      falloff: 1.2,
    });
  }
}

export function yardProp(c: PaintCtx, art: SceneArt, p: PropDef): boolean {
  const a = p.front ? c.front : c.back;
  const x = p.x;
  const y = p.y;
  const m = RAMP.metal;
  switch (p.kind) {
    case 'floodtower':
      floodTower(c, x, y, p.h ?? 150, p.flip ? -1 : 1);
      return true;
    case 'gantry':
      gantry(c, x, y);
      return true;
    case 'openbox': {
      // A container standing open: somewhere to duck into.
      paintBox(a, x, y - BOX_H, p.seed ?? seedOf(x, y, 2));
      a.rect(x + 4, y - BOX_H + 3, 40, BOX_H - 4, '#07080b');
      a.rect(x + 44, y - BOX_H + 2, 3, BOX_H - 2, '#30363e');
      a.rect(x + 3, y - BOX_H + 2, 1, BOX_H - 2, '#30363e');
      return true;
    }
    case 'firebarrel': {
      a.rect(x, y - 16, 12, 16, '#3a2a22');
      a.rect(x, y - 16, 12, 1, '#6a4a34');
      a.rect(x, y - 11, 12, 1, '#20160f');
      a.rect(x, y - 5, 12, 1, '#20160f');
      a.rect(x, y - 16, 2, 16, '#2a1c16');
      art.playDynamics.push((st, t) => {
        for (let i = 0; i < 5; i++) {
          const fh = 3 + Math.floor((Math.sin(t * 11 + i * 2.3) * 0.5 + 0.5) * 6);
          st.emit(x + 2 + i * 2, y - 16 - fh, 2, fh, i % 2 ? '#ffd24a' : '#ff8a2a', 1, 0.8);
        }
      });
      c.lights.push({ x: x + 6, y: y - 20, r: 96, color: '#ff9a44', k: 0.95, flicker: 'candle', falloff: 1.4 });
      c.emitters.push({ kind: 'smoke', x: x + 6, y: y - 24, rate: 4, w: 6 });
      return true;
    }
    case 'gatehouse': {
      const pl = RAMP.concrete;
      a.rect(x, y - 46, 70, 46, pl[1]);
      a.rect(x - 4, y - 50, 78, 5, m[1]);
      a.rect(x - 4, y - 50, 78, 1, m[3]);
      a.rect(x + 6, y - 36, 18, 36, '#1c2026');
      a.rect(x + 30, y - 36, 34, 18, '#20242c');
      a.emit(x + 31, y - 35, 32, 16, '#8fb8cc', 0.18);
      a.emit(x + 46, y - 35, 1, 16, '#3f5560', 0.18);
      a.text('YARD 7', x + 31, y - 14, pl[3], { font: 'g7' });
      c.lights.push({ x: x + 47, y: y - 26, r: 90, color: '#bfe6ee', k: 0.6 });
      // Barrier arm.
      a.rect(x + 76, y - 22, 3, 22, m[1]);
      for (let i = 0; i < 9; i++) a.rect(x + 79 + i * 8, y - 20, 8, 3, i % 2 ? '#d8d4cc' : '#c8433c');
      return true;
    }
    case 'yardfence': {
      const w = p.w ?? 140;
      for (let i = 0; i <= w; i += 28) {
        a.rect(x + i, y - 54, 2, 54, m[1]);
        a.rect(x + i, y - 54, 1, 54, m[2]);
      }
      a.rect(x, y - 54, w, 1, m[2]);
      a.rect(x, y - 2, w, 1, m[0]);
      for (let i = 0; i < w; i += 4) {
        a.line(x + i, y - 52, x + i + 4, y - 4, '#2a323c');
        a.line(x + i + 4, y - 52, x + i, y - 4, '#232a33');
      }
      a.rect(x + 20, y - 38, 34, 14, '#c8a82a');
      a.text('NO ENTRY', x + 37, y - 34, '#1a1c20', { font: 'g7', align: 'center' });
      return true;
    }
    case 'forklift': {
      a.rect(x, y - 16, 26, 12, '#c89a2a');
      a.rect(x, y - 16, 26, 1, '#e8be4a');
      a.rect(x + 6, y - 30, 14, 14, '#22262c');
      a.rect(x + 6, y - 30, 14, 1, '#4a5260');
      a.rect(x + 26, y - 32, 2, 30, '#30363e');
      a.rect(x + 28, y - 4, 14, 2, '#30363e');
      a.disc(x + 5, y - 4, 4, '#0e1014');
      a.disc(x + 21, y - 4, 4, '#0e1014');
      a.epx(x + 1, y - 13, GLOW.red, 0.5);
      return true;
    }
    case 'bollardbig':
      a.rect(x + 2, y - 12, 10, 12, '#2a2e36');
      a.rect(x, y - 15, 14, 4, '#3a404a');
      a.rect(x, y - 15, 14, 1, '#5a6270');
      return true;
  }
  return false;
}

/** The Yards: container canyons under floodlights, rain on steel. */
export function paintYards(level: LevelData): SceneArt {
  const { c, art } = beginScene(level, {
    ...DEFAULT_LOOK,
    ambPlay: [0.19, 0.24, 0.36],
    fogColor: [0.12, 0.15, 0.2],
    fogMid: 0.3,
    groundFog: 0.36,
    scatter: 0.15,
    reflect: 0.78,
    ripple: 3.0,
    bloom: 0.55,
    saturation: 1.04,
    shadowTint: [0.0, 0.012, 0.032],
    highTint: [0.012, 0.012, 0.02],
  });
  const a = c.back;
  dock(c, -PAD, level.width + PAD, level.groundY);
  // The apron runs out to the lens and back to the quay's edge; beyond that, the harbour.
  ground(c, concreteTile(c.depth, level.seed + 11), {
    wet: 0.7,
    lanes: [{ z: -96, color: '#b89a2a' }],
    rails: [-22, -34, 150, 162],
    shore: { z: 300, drop: 10, water: waterTile(c.depth, level.seed + 12), wall: concreteTile(c.depth, level.seed + 13) },
  });
  const skins = boxSkins(c);
  stackRows(c, skins, 92, level.seed + 14, 3);
  stackRows(c, skins, 196, level.seed + 15, 4);
  for (const p of level.props) if (!yardProp(c, art, p)) paintProp(c, art, p);
  for (const s of level.solids) {
    if (s.tag === 'container') {
      boxStack(c, s);
      stackDepth(c, skins, s);
    } else paintSolid(c, s);
  }
  for (const o of level.oneWays) {
    paintOneWay(c, o);
    if (o.tag !== 'none') {
      a.rect(o.x, o.y - 12, o.w, 1, '#8a6a22');
      for (let i = o.x; i < o.x + o.w; i += 14) a.rect(i, o.y - 12, 1, 12, '#6a521c');
    }
  }
  for (const l of level.ladders) paintLadder(a, l.x, l.y0, l.y1);

  cityBackdrop(level, art, {
    seed: level.seed,
    skyStops: ['#03050b', '#070d1a', '#0d172a', '#172236', '#252c3e', '#353440'],
    stars: 0,
    clouds: 0.8,
    cloudColor: '#2c3044',
    haze: '#232838',
    bodies: ['#0f1728', '#0c1320', '#0c121c', '#080c13'],
    horizon: level.groundY - (level.height - 270) + 12,
    spire: 0.78,
    rail: false,
    lit: 0.7,
    traffic: 0.6,
  });

  // Middle distance: other cranes and a ship at berth.
  {
    const p = 0.4;
    const s = layerSize(level, p, p);
    const mid = new Art(s.w, s.h);
    const base = layerFloor(level, p, 236);
    const rng = new Rng(level.seed + 60);
    const body = '#0a0f18';
    for (let x = rng.int(40, 160); x < s.w; x += rng.int(170, 300)) {
      const h = rng.int(90, 130);
      mid.rect(x, base - h, 5, h, body);
      mid.rect(x + 44, base - h, 5, h, body);
      mid.rect(x - 40, base - h, 150, 5, body);
      mid.rect(x - 40, base - h - 22, 150, 3, body);
      for (let i = x - 40; i < x + 100; i += 20) mid.line(i, base - h - 19, i + 10, base - h, body);
      mid.line(x + 2, base - h + 5, x + 46, base - 10, body);
      mid.emit(x - 40, base - h - 24, 2, 2, GLOW.red, 0.5);
      mid.emit(x + 108, base - h - 24, 2, 2, GLOW.red, 0.5);
      mid.emit(x + 20, base - h + 6, 3, 2, '#eef6ff', 0.6);
    }
    // Hull.
    const hx = Math.floor(s.w * 0.55);
    mid.rect(hx, base - 34, 420, 60, '#0c1119');
    mid.rect(hx, base - 34, 420, 2, '#1c2634');
    mid.rect(hx + 300, base - 66, 80, 32, '#10161f');
    for (let i = 0; i < 9; i++) mid.emit(hx + 306 + i * 8, base - 58, 3, 2, '#ffd9a0', 0.5);
    for (let i = 0; i < 26; i++) mid.emit(hx + 14 + i * 16, base - 26, 2, 1, '#ffd9a0', 0.4);
    mid.text('HAVEN LINE', hx + 150, base - 16, '#27323f', { font: 'g11b', align: 'center' });
    art.layers.push({ group: 'mid', art: mid, px: p, py: p, ox: -PAD, oy: -PAD });
  }
  paintForeground(level, art, 'port', level.seed + 5);
  cable(a, -PAD, 40, 200, 70, 14, '#0b0d11');
  return art;
}
