import { mix, shade } from '../core/color';
import { Rng } from '../core/math';
import type { Art } from '../gfx/art';
import type { PropDef } from '../game/level';
import { GLOW, RAMP } from './palette';
import {
  acUnit,
  bladeSign,
  bricks,
  glow,
  neonText,
  poster,
  seedOf,
  shutter,
  signBoard,
  tiles,
  wall,
  windowUnit,
  type PaintCtx,
} from './paint';

const GH = 52; // ground-floor height
const FH = 36; // upper-floor height

const LIT = ['#d9a560', '#c98f4e', '#e2b272', '#8fb8cc', '#a5cfe0', '#c8a078', '#7f90d8', '#c0607f'];
const WIN_STYLES = ['plain', 'blinds', 'curtain', 'figure', 'plant', 'curtain', 'plain'] as const;

export const SHOP = {
  shutter: 0,
  store: 1,
  eatery: 2,
  stairs: 3,
  repair: 4,
  arcade: 5,
  laundry: 6,
  blank: 7,
} as const;

function door(a: Art, x: number, y: number, w: number, h: number, col: string, lit?: string): void {
  a.rect(x - 1, y - 1, w + 2, h + 1, '#22262e');
  if (lit) {
    a.emit(x, y, w, h, shade(lit, 0.7), 0.18);
    a.rect(x + Math.floor(w / 2), y, 1, h, '#22262e');
    a.rect(x, y + Math.floor(h * 0.45), w, 1, '#22262e');
  } else {
    a.rect(x, y, w, h, col);
    a.rect(x, y, w, 1, shade(col, 1.3));
    a.rect(x + 2, y + 3, w - 4, Math.floor(h * 0.4), shade(col, 0.8));
    a.rect(x + 2, y + Math.floor(h * 0.55), w - 4, Math.floor(h * 0.35), shade(col, 0.8));
  }
  a.rect(x + w - 3, y + Math.floor(h / 2), 1, 3, '#b8b8a8');
}

function shopFront(c: PaintCtx, a: Art, x: number, gy: number, w: number, p: PropDef, m: readonly string[], rng: Rng): void {
  const kind = p.variant ?? rng.int(0, 7);
  const col = glow(p.color, rng.pick(['pink', 'cyan', 'amber', 'green', 'red', 'violet'] as const));
  const text = p.text ?? '';
  const signY = gy - GH + 3;
  const baseY = gy - 39;
  const wx = gy;

  // Plinth.
  a.rect(x, gy - 4, w, 4, m[0]!);
  a.rect(x, gy - 4, w, 1, m[1]!);

  switch (kind) {
    case SHOP.shutter: {
      if (text) {
        // Faded, unlit sign.
        a.rect(x + 5, signY, w - 10, 10, '#4a4f58');
        a.rect(x + 5, signY, w - 10, 1, '#666c78');
        a.text(text, x + Math.floor(w / 2), signY + 2, '#262a32', { font: 'g9', align: 'center' });
      }
      shutter(a, x + 6, baseY, w - 30, 39, RAMP.metal, rng);
      door(a, x + w - 20, gy - 35, 14, 35, '#3c4450');
      break;
    }
    case SHOP.store: {
      const lit = '#a9d2dc';
      signBoard(c, a, x + 5, signY, w - 10, 10, text || 'MART', col, true);
      const ww = w - 34;
      a.rect(x + 6, baseY - 1, ww + 2, 32, '#22262e');
      a.emit(x + 7, baseY, ww, 30, shade(lit, 0.56), 0.18);
      // Shelves of goods.
      for (let j = 0; j < 3; j++) {
        const sy = baseY + 8 + j * 8;
        a.emit(x + 7, sy, ww, 1, shade(lit, 0.34), 0.3);
        for (let i = x + 9; i < x + 5 + ww; i += rng.int(3, 4)) {
          a.emit(i, sy - rng.int(3, 5), 2, rng.int(3, 5), rng.pick(['#c86a5a', '#5ab8a0', '#d8c060', '#e8e8e8', '#6a8ad0', '#c890c0']), 0.18);
        }
      }
      a.emit(x + 7, baseY, ww, 2, shade(lit, 0.5), 0.4);
      a.line(x + 9, baseY + 26, x + 20, baseY + 3, shade(lit, 1.0));
      door(a, x + w - 22, gy - 35, 15, 35, '#3c4450', lit);
      a.emit(x + w - 20, gy - 33, 9, 4, '#e84a3a', 0.5);
      c.lights.push({ x: x + 7 + ww / 2, y: wx - 22, r: 118, color: '#bfe6ee', k: 0.55, falloff: 1.5 });
      c.lights.push({ x: x + w - 14, y: wx - 20, r: 64, color: '#bfe6ee', k: 0.4, falloff: 1.5 });
      break;
    }
    case SHOP.eatery: {
      const lit = '#d9a25a';
      a.rect(x + 5, signY - 1, w - 10, 12, '#30343e');
      a.rect(x + 6, signY, w - 12, 10, '#191310');
      a.text(text || 'NOODLES', x + Math.floor(w / 2), signY + 2, col, { font: 'g9', align: 'center', emit: true, base: 0.5 });
      c.lights.push({ x: x + w / 2, y: wx - GH + 12, r: 70 + w * 0.3, color: col, k: 0.5, falloff: 1.7 });
      const ww = w - 36;
      a.rect(x + 6, baseY + 3, ww + 2, 26, '#2a221e');
      a.emit(x + 7, baseY + 4, ww, 24, shade(lit, 0.72), 0.18);
      // Diners at a counter.
      for (let i = x + 11; i < x + ww - 2; i += rng.int(9, 13)) {
        a.emit(i, baseY + 15, 5, 13, shade(lit, 0.26), 0.3);
        a.emit(i + 1, baseY + 11, 3, 4, shade(lit, 0.26), 0.3);
      }
      a.emit(x + 7, baseY + 22, ww, 2, shade(lit, 0.36), 0.3);
      for (let i = x + 10; i < x + ww; i += 12) a.emit(i, baseY + 4, 1, 4, shade(lit, 1.25), 0.6);
      // Half curtain over the door.
      const dx = x + w - 23;
      a.rect(dx - 1, gy - 36, 18, 36, '#2a221e');
      a.emit(dx, gy - 35, 16, 35, shade(lit, 0.6), 0.18);
      for (let i = 0; i < 3; i++) {
        a.rect(dx + i * 5 + (i ? 1 : 0), gy - 35, 5, 12, '#27386a');
        a.rect(dx + i * 5 + (i ? 1 : 0), gy - 24, 5, 1, '#1b2850');
        a.px(dx + i * 5 + 2, gy - 30, '#d8d8e0');
      }
      c.lights.push({ x: x + 7 + ww / 2, y: wx - 18, r: 104, color: '#ffd09a', k: 0.72, falloff: 1.5 });
      c.emitters.push({ kind: 'vent', x: x + 10, y: wx - GH + 14, rate: 5, w: 5 });
      a.rect(x + 7, signY + 12, 7, 4, '#3a404a');
      break;
    }
    case SHOP.stairs: {
      // Dark stairwell with a bare bulb, plus service clutter on the wall.
      const dx = x + Math.floor(w * 0.18);
      a.rect(dx - 1, gy - 40, 22, 40, '#22262e');
      a.rect(dx, gy - 39, 20, 39, '#0b0c11');
      for (let i = 0; i < 6; i++) a.rect(dx + i * 3, gy - 4 - i * 6, 20 - i * 3, 1, '#2c3038');
      a.emit(dx + 9, gy - 37, 2, 2, GLOW.warm, 0.8);
      c.lights.push({ x: dx + 10, y: wx - 30, r: 52, color: GLOW.warm, k: 0.55, falloff: 1.4, flicker: 'broken' });
      if (text) {
        a.rect(dx - 2, gy - 50, 24, 8, '#14171d');
        a.text(text, dx + 10, gy - 49, col, { font: 'g7', align: 'center', emit: true, base: 0.5 });
      }
      // Meter boxes and conduit.
      const bx = dx + 30;
      for (let i = 0; i < 3 && bx + i * 11 < x + w - 12; i++) {
        a.rect(bx + i * 11, gy - 34, 9, 12, RAMP.metal[2]);
        a.rect(bx + i * 11, gy - 34, 9, 1, RAMP.metal[3]);
        a.rect(bx + i * 11 + 2, gy - 31, 5, 4, '#1a1e24');
        a.rect(bx + i * 11 + 4, gy - 22, 1, 22, RAMP.metal[0]);
      }
      for (let i = 0; i < 3; i++) {
        const px = x + rng.int(Math.floor(w * 0.5), Math.max(Math.floor(w * 0.5), w - 18));
        if (px > bx + 34) poster(a, px, gy - rng.int(30, 44), rng);
      }
      break;
    }
    case SHOP.repair: {
      const lit = '#a8843e';
      a.rect(x + 5, signY, w - 10, 10, '#d0c8b0');
      a.rect(x + 5, signY + 9, w - 10, 1, '#a09880');
      a.text(text || 'RADIO REPAIR', x + Math.floor(w / 2), signY + 2, '#7a2a20', { font: 'g9', align: 'center' });
      const ww = w - 34;
      a.rect(x + 6, baseY + 1, ww + 2, 30, '#2a2620');
      a.emit(x + 7, baseY + 2, ww, 28, shade(lit, 0.7), 0.18);
      // Stacked sets and parts.
      for (let i = x + 8; i < x + 4 + ww; i += rng.int(7, 11)) {
        const bh = rng.int(6, 18);
        const bw = rng.int(6, 9);
        a.emit(i, baseY + 30 - bh, bw, bh, shade(lit, rng.range(0.22, 0.36)), 0.3);
        if (rng.chance(0.5)) a.emit(i + 1, baseY + 31 - bh, bw - 3, 3, rng.pick(['#58e0a0', '#6aa8ff', '#e8d070']), 0.5);
      }
      c.flickers.push({ x: x + 7, y: baseY + 2, w: ww, h: 28, mode: 'pulse', seed: seedOf(x, gy, 4) });
      door(a, x + w - 22, gy - 35, 15, 35, '#4a3c30');
      c.lights.push({ x: x + 7 + ww / 2, y: wx - 20, r: 92, color: '#f0c070', k: 0.6, falloff: 1.5 });
      break;
    }
    case SHOP.arcade: {
      a.rect(x + 3, gy - GH + 1, w - 6, GH - 5, '#15131c');
      a.rect(x + 3, gy - GH + 1, w - 6, 1, '#2a2634');
      neonText(c, a, x + Math.floor(w / 2), signY - 1, text || 'ARCADE', col, 1, 'buzz');
      const dx = x + Math.floor(w / 2) - 10;
      a.rect(dx, gy - 34, 20, 34, '#08080c');
      const second = col === GLOW.cyan ? GLOW.pink : GLOW.cyan;
      a.emit(dx - 2, gy - 36, 24, 1, second, 0.6);
      a.emit(dx - 2, gy - 36, 1, 36, second, 0.6);
      a.emit(dx + 21, gy - 36, 1, 36, second, 0.6);
      c.lights.push({ x: dx + 10, y: wx - 20, r: 74, color: second, k: 0.62, falloff: 1.6 });
      // Cabinet screens glimpsed inside.
      for (const sx of [x + 9, x + w - 21]) {
        if (sx > dx - 14 && sx < dx + 22) continue;
        a.rect(sx, gy - 30, 12, 20, '#0c0c12');
        a.emit(sx + 2, gy - 28, 8, 7, rng.pick(['#6aa8ff', '#58e0a0', '#e870c0']), 0.5);
        c.flickers.push({ x: sx + 2, y: gy - 28, w: 8, h: 7, mode: 'pulse', seed: seedOf(sx, gy, 9) });
      }
      break;
    }
    case SHOP.laundry: {
      const lit = '#b8e4ea';
      signBoard(c, a, x + 5, signY, w - 10, 10, text || 'COIN LAUNDRY', col, true);
      const ww = w - 14;
      a.rect(x + 6, baseY - 1, ww + 2, 39, '#22262e');
      a.emit(x + 7, baseY, ww, 37, shade(lit, 0.56), 0.18);
      for (let i = x + 11; i + 13 < x + 7 + ww; i += 16) {
        a.emit(i, baseY + 14, 13, 22, shade(lit, 0.5), 0.4);
        a.emit(i + 2, baseY + 19, 9, 9, shade(lit, 0.22), 0.3);
        a.emit(i + 4, baseY + 21, 5, 5, shade(lit, 0.42), 0.3);
        a.emit(i + 2, baseY + 16, 3, 1, GLOW.green, 0.6);
      }
      a.emit(x + 7, baseY + 4, ww, 2, '#d8f0f4', 0.4);
      c.lights.push({ x: x + 7 + ww / 2, y: wx - 20, r: 124, color: '#c8f0f6', k: 0.6, falloff: 1.5 });
      break;
    }
    default: {
      // Blank service wall.
      const n = Math.floor(w / 26);
      for (let i = 0; i < n; i++) {
        if (rng.chance(0.75)) poster(a, x + 6 + i * 26 + rng.int(0, 8), gy - rng.int(26, 44), rng, i === 1 ? text : undefined);
      }
      const vx = x + rng.int(6, Math.max(6, w - 16));
      a.rect(vx, gy - 49, 10, 6, RAMP.metal[1]);
      for (let k = 0; k < 3; k++) a.rect(vx + 1, gy - 48 + k * 2, 8, 1, RAMP.metal[0]);
      c.emitters.push({ kind: 'vent', x: vx + 5, y: wx - 50, rate: 4, w: 6 });
      break;
    }
  }
}

/**
 * A street-facing building: a ground-floor shop under storeys of windows,
 * air conditioners, pipes and signs.
 */
export function facade(c: PaintCtx, p: PropDef): void {
  const a = c.back;
  const rng = new Rng(p.seed ?? seedOf(p.x, p.y, 3));
  const x = p.x;
  const gy = p.y;
  const w = p.w ?? 120;
  const roofY = gy - (p.h ?? 9999);
  const top = Math.max(-c.oy, roofY);
  const roofVisible = roofY >= -c.oy + 4;
  const matName = rng.pick(['concrete', 'plaster', 'tile', 'brick', 'concrete', 'plaster'] as const);
  const m = RAMP[matName];

  wall(a, x, top, w, gy - top, m, rng);
  if (matName === 'brick') bricks(a, x, top, w, gy - top - GH, m);
  if (matName === 'tile') tiles(a, x, top, w, gy - top - GH, m, 5);
  a.rect(x, top, 1, gy - top, m[2]);
  a.rect(x + w - 2, top, 2, gy - top, m[0]);

  // Storeys.
  const bays = Math.max(1, Math.floor((w - 10) / 27));
  const bayW = 27;
  const startX = x + Math.floor((w - bays * bayW) / 2) + 5;
  const balconyRow = rng.int(0, 6);
  let row = 0;
  for (let fy = gy - GH; fy - FH >= top + (roofVisible ? 2 : -FH); fy -= FH, row++) {
    a.rect(x, fy - 1, w, 1, m[3]);
    a.rect(x, fy, w, 2, m[0]);
    const wy = fy - FH + 9;
    const balcony = row === balconyRow;
    for (let b = 0; b < bays; b++) {
      const bx = startX + b * bayW;
      if (rng.chance(0.07)) continue;
      const lit = rng.chance(0.4) ? rng.pick(LIT) : null;
      windowUnit(a, bx, wy, 16, 18, { lit, style: rng.pick(WIN_STYLES), frame: shade(m[0], 0.8) }, rng);
      if (!balcony && rng.chance(0.3)) acUnit(a, bx + rng.int(0, 5), wy + 23, rng);
    }
    if (balcony) {
      const by = wy + 12;
      a.rect(x + 2, by, w - 4, 1, RAMP.metal[3]);
      a.rect(x + 2, by + 11, w - 4, 2, RAMP.metal[1]);
      for (let i = x + 3; i < x + w - 3; i += 3) a.rect(i, by + 1, 1, 10, RAMP.metal[1]);
      // Laundry left out in the damp.
      for (let i = x + rng.int(6, 16); i < x + w - 14; i += rng.int(9, 22)) {
        if (rng.chance(0.55)) {
          const cc = rng.pick(RAMP.cloth);
          a.rect(i, by + 1, rng.int(5, 8), rng.int(6, 9), mix(cc, rng.pick(['#8a5a5a', '#5a6a8a', '#8a8a5a']), 0.4));
        }
      }
    }
  }

  // Drain pipe and a conduit run.
  const pipeX = x + (rng.chance(0.5) ? 3 : w - 6);
  a.rect(pipeX, top, 2, gy - top - 2, RAMP.metal[1]);
  a.rect(pipeX, top, 1, gy - top - 2, RAMP.metal[2]);
  for (let py = top + 14; py < gy - 6; py += 22) a.rect(pipeX - 1, py, 4, 1, RAMP.metal[0]);

  shopFront(c, a, x, gy, w, p, m, rng);

  // Blade sign on an upper storey.
  if (p.variant !== SHOP.shutter && rng.chance(0.62) && gy - top > GH + 60) {
    const words = ['HOTEL', 'BAR', 'SAUNA', 'CLINIC', 'TEA', 'BILLIARDS', 'PAWN', 'DENTAL', 'KARAOKE', 'INN'];
    const word = rng.pick(words);
    const side = rng.chance(0.5) ? x + 8 : x + w - 20;
    const sy = Math.max(top + 4, gy - GH - 16 - word.length * 9 - rng.int(0, 30));
    bladeSign(c, a, side, sy, word, rng.pick([GLOW.pink, GLOW.cyan, GLOW.green, GLOW.amber, GLOW.red, GLOW.violet]), rng);
  }

  if (roofVisible) {
    a.rect(x - 1, roofY, w + 2, 3, m[2]);
    a.rect(x - 1, roofY, w + 2, 1, m[3]);
    a.rect(x - 1, roofY + 3, w + 2, 1, m[0]);
    // Something on the roof: a water tank or an aerial.
    if (rng.chance(0.6)) {
      const tx = x + rng.int(8, Math.max(8, w - 30));
      const tk = rng.pick(['#c8b83a', '#6a8090', '#8a8f98']);
      a.rect(tx + 2, roofY - 5, 1, 5, RAMP.metal[0]);
      a.rect(tx + 15, roofY - 5, 1, 5, RAMP.metal[0]);
      a.rect(tx, roofY - 19, 18, 14, tk);
      a.rect(tx, roofY - 19, 18, 1, shade(tk, 1.3));
      a.rect(tx, roofY - 19, 3, 14, shade(tk, 0.72));
      a.rect(tx, roofY - 12, 18, 1, shade(tk, 0.72));
    } else {
      const tx = x + rng.int(8, Math.max(8, w - 12));
      a.rect(tx, roofY - 26, 1, 26, '#12141a');
      a.rect(tx - 4, roofY - 22, 9, 1, '#12141a');
      a.rect(tx - 2, roofY - 17, 5, 1, '#12141a');
    }
  }
}
