import { PAD, VIEW_H } from '../../core/constants';
import { shade } from '../../core/color';
import { fbm, Rng } from '../../core/math';
import { Art } from '../../gfx/art';
import type { LevelData } from '../../game/level';
import { paintSkyline } from '../city';
import { backCopy, block, cloudTile, corrugatedTile, deckTile, plain } from '../depth';
import { GLOW, RAMP } from '../palette';
import { maskOccluder, type PaintCtx } from '../paint';
import { paintProp } from '../props';
import { beginScene, DEFAULT_LOOK, layerSize, paintLadder, paintOneWay, paintSolid, type SceneArt } from '../scene';
import { fogSea, steelDeck } from './mast';

/** World y at which the climb breaks out above the storm. */
export const CLOUD_TOP = 800;

/** Layer-space row that a world height reaches when it is centred on screen. */
const rowFor = (worldY: number, py: number): number => VIEW_H / 2 + (worldY - VIEW_H / 2) * py + PAD;

function core(c: PaintCtx, xl: number, xr: number, y0: number, y1: number): void {
  const a = c.back;
  const m = RAMP.metal;
  // Bracing first, legs over it.
  for (let y = y1; y < y0; y += 80) {
    const yb = Math.min(y0, y + 80);
    a.line(xl + 4, y, xr, yb, m[0], 2);
    a.line(xr, y, xl + 4, yb, m[0], 2);
    a.rect(xl, y, xr - xl + 6, 3, m[1]);
    a.rect(xl, y, xr - xl + 6, 1, m[2]);
  }
  for (const lx of [xl, xr]) {
    a.rect(lx, y1, 6, y0 - y1, m[1]);
    a.rect(lx, y1, 1, y0 - y1, m[3]);
    a.rect(lx + 5, y1, 1, y0 - y1, m[0]);
    for (let y = y1 + 12; y < y0; y += 20) a.rect(lx, y, 6, 1, m[0]);
  }
  // Cable tray up the spine.
  const sx = Math.floor((xl + xr) / 2) + 2;
  a.rect(sx, y1, 5, y0 - y1, '#14181e');
  for (let y = y1; y < y0; y += 6) a.rect(sx, y, 5, 1, '#262c36');
  a.rect(sx + 1, y1, 1, y0 - y1, '#3a2a22');
  a.rect(sx + 3, y1, 1, y0 - y1, '#1e3a40');
}

function gear(c: PaintCtx, level: LevelData, xl: number, xr: number): void {
  const a = c.back;
  const rng = new Rng(level.seed + 11);
  const m = RAMP.metal;
  for (let y = 520; y < level.groundY - 60; y += rng.int(70, 130)) {
    const left = rng.chance(0.5);
    const kind = rng.int(0, 2);
    const bx = left ? xl - 22 : xr + 10;
    if (kind === 0) {
      // Sector antenna.
      a.rect(bx + 6, y, 7, 30, '#b8c0c8');
      a.rect(bx + 6, y, 7, 1, '#e0e6ea');
      a.rect(bx + (left ? 12 : 6), y, 1, 30, '#8a9299');
      a.rect(left ? bx + 13 : bx - 2, y + 12, 9, 1, m[0]);
      a.epx(bx + 9, y + 26, GLOW.green);
    } else if (kind === 1) {
      a.disc(bx + 9, y + 10, 9, '#aab2ba');
      a.disc(bx + (left ? 8 : 10), y + 10, 7, '#cfd6dc');
      a.px(bx + 9, y + 10, m[0]);
      a.rect(left ? bx + 16 : bx - 6, y + 10, 8, 1, m[0]);
    } else {
      a.rect(bx + 2, y, 16, 20, m[1]);
      a.rect(bx + 2, y, 16, 1, m[3]);
      a.rect(bx + 4, y + 3, 12, 6, '#0c1014');
      a.epx(bx + 5, y + 13, GLOW.amber);
      a.epx(bx + 8, y + 13, GLOW.green);
      a.epx(bx + 11, y + 13, GLOW.green);
    }
  }
  // Aircraft warning lights.
  for (let y = 560; y < level.groundY; y += 240) {
    for (const bx of [xl - 4, xr + 8]) {
      a.rect(bx, y, 3, 3, m[0]);
      c.lights.push({ x: bx + 1, y: y - 2, r: 60, color: GLOW.red, k: 0.75, flicker: 'blink' });
    }
  }
}

/** The transmitter shack at the summit, and the old valve rig inside it. */
function shack(c: PaintCtx, x: number, y: number): void {
  const a = c.back;
  const m = RAMP.metal;
  a.rect(x, y - 58, 150, 58, '#1d2a30');
  for (let i = x + 3; i < x + 150; i += 5) a.rect(i, y - 56, 1, 54, '#17222a');
  a.rect(x - 4, y - 62, 158, 5, m[1]);
  a.rect(x - 4, y - 62, 158, 1, m[3]);
  a.rect(x, y - 58, 3, 58, m[0]);
  a.rect(x + 147, y - 58, 3, 58, m[0]);
  a.text('RADIO MAGPIE', x + 75, y - 53, '#39505a', { font: 'g9', align: 'center' });
  a.text('4.6 MHz  —  OPEN BAND', x + 75, y - 43, '#2c4048', { font: 'g7', align: 'center' });
  // Equipment rack.
  const rx = x + 16;
  a.rect(rx, y - 32, 60, 32, '#2a2622');
  a.rect(rx, y - 32, 60, 1, '#4a4238');
  a.rect(rx + 3, y - 29, 24, 12, '#0e0c0a');
  for (let i = 0; i < 4; i++) {
    a.emit(rx + 5 + i * 6, y - 27, 3, 7, '#ff9a3a', 0.6);
    a.emit(rx + 6 + i * 6, y - 28, 1, 1, '#ffd08a', 0.6);
  }
  c.flickers.push({ x: rx + 3, y: y - 29, w: 24, h: 12, mode: 'candle', seed: 77 });
  a.disc(rx + 42, y - 22, 7, '#d8d0b8');
  a.disc(rx + 42, y - 22, 5, '#ece6d2');
  a.line(rx + 42, y - 22, rx + 46, y - 26, '#8a2218');
  for (let i = 0; i < 5; i++) a.rect(rx + 4 + i * 10, y - 10, 6, 6, i % 2 ? '#3a3632' : '#4a4640');
  a.epx(rx + 54, y - 28, GLOW.green);
  c.lights.push({ x: rx + 14, y: y - 22, r: 70, color: '#ffa850', k: 0.75, flicker: 'candle', falloff: 1.4 });
  // Microphone on a stand.
  a.rect(x + 104, y - 22, 1, 22, m[2]);
  a.rect(x + 100, y - 1, 9, 1, m[1]);
  a.rect(x + 102, y - 27, 5, 6, '#9aa2aa');
  a.rect(x + 102, y - 27, 5, 1, '#d0d6dc');
  // A chair nobody has sat in for eleven years.
  a.rect(x + 118, y - 9, 9, 2, '#5a3a2a');
  a.rect(x + 126, y - 20, 2, 13, '#5a3a2a');
  a.rect(x + 118, y - 7, 1, 7, '#3a261c');
  a.rect(x + 126, y - 7, 1, 7, '#3a261c');
}

/** The Spire: a storm climb that ends above the weather. */
export function paintSpire(level: LevelData): SceneArt {
  const { c, art } = beginScene(level, {
    ...DEFAULT_LOOK,
    ambPlay: [0.2, 0.24, 0.36],
    fogColor: [0.1, 0.12, 0.17],
    fogMid: 0.34,
    groundFog: 0.2,
    scatter: 0.17,
    reflect: 0.45,
    blurFar: 1.8,
    blurMid: 1.3,
    blurFg: 5,
    bloom: 0.6,
    saturation: 1.05,
    shadowTint: [0.0, 0.012, 0.036],
    highTint: [0.012, 0.012, 0.02],
  });
  const a = c.back;
  const m = RAMP.metal;
  const G = level.groundY;
  const XL = 200;
  const XR = 440;
  const SUMMIT = 420;

  steelDeck(c, -PAD, level.width + PAD, G, level.seed);
  // The tower as a frame with a far side, its landings running back through it;
  // the storm's cloud deck is a real ceiling on the way up and a floor from above.
  const DEPTH = 230;
  // The sky here changes with height, not distance: it was composed for the frame, so it stays put.
  art.lift = 0;
  const deckTex = deckTile(c.depth, level.seed + 21);
  c.depth.floor(-400, level.width + 400, G, 0, 320, deckTex, { tile: true, wet: 0.5 });
  plain(c, CLOUD_TOP + 40, cloudTile(c.depth, level.seed + 22, '#4a5c82', '#a9bcdc'), { lit: 0, shade: 1.5 }, -480);
  backCopy(c, XL - 8, SUMMIT - 4, XR - XL + 20, G - SUMMIT + 4, DEPTH, (cc) => core(cc, XL, XR, G, SUMMIT));
  for (const o of level.oneWays) {
    // (Open grating: nothing pools on it, so it does not mirror.)
    if (o.tag === 'catwalk') c.depth.floor(o.x, o.x + o.w, o.y, 0, DEPTH, deckTex, { tile: true, shade: 0.8 });
  }
  for (const sd of level.solids) {
    if (sd.tag === 'slab') c.depth.floor(sd.x, sd.x + sd.w, sd.y, 0, 34, deckTex, { tile: true, shade: 0.85 });
  }
  const shackWall = corrugatedTile(c.depth, '#1d2a30');
  block(c, 246, 396, SUMMIT - 58, SUMMIT, 96, { side: shackWall, top: shackWall });
  core(c, XL, XR, G, SUMMIT);
  // Upper mast above the shack.
  for (let y = 80; y < SUMMIT - 60; y += 36) {
    a.line(304, y, 336, y + 36, m[0]);
    a.line(336, y, 304, y + 36, m[0]);
    a.rect(302, y, 38, 1, m[1]);
  }
  a.rect(302, 80, 3, SUMMIT - 140, m[1]);
  a.rect(337, 80, 3, SUMMIT - 140, m[1]);
  a.rect(319, 30, 3, 52, m[1]);
  a.rect(312, 46, 17, 1, m[1]);
  a.rect(315, 60, 11, 1, m[1]);
  gear(c, level, XL, XR);
  shack(c, 246, SUMMIT);

  for (const p of level.props) paintProp(c, art, p);
  for (const s of level.solids) {
    if (s.tag === 'panel') {
      // Wind and sight shield bolted to a landing.
      a.rect(s.x, s.y, s.w, s.h, m[2]);
      a.rect(s.x, s.y, s.w, 1, m[3]);
      a.rect(s.x, s.y, 1, s.h, m[3]);
      for (let y = s.y + 4; y < s.y + s.h; y += 8) a.rect(s.x + 1, y, s.w - 1, 3, y % 16 < 8 ? '#b89a2a' : '#1c1e22');
      maskOccluder(c, s.x, s.y, s.w, s.h);
    } else paintSolid(c, s);
  }
  for (const o of level.oneWays) {
    paintOneWay(c, o);
    if (o.tag !== 'none') {
      a.rect(o.x, o.y - 11, o.w, 1, m[2]);
      for (let i = o.x; i < o.x + o.w; i += 20) a.rect(i, o.y - 11, 1, 11, m[1]);
    }
  }
  for (const l of level.ladders) paintLadder(a, l.x, l.y0, l.y1);

  // A few caged work lamps on the way up.
  for (let y = 700; y < G - 40; y += 320) {
    const lx = (y / 320) % 2 < 1 ? XL + 14 : XR - 12;
    a.emit(lx, y, 4, 2, '#dff2ff', 0.8);
    c.lights.push({ x: lx + 2, y: y + 4, r: 130, color: '#cfe8ff', k: 0.7, cone: { dx: 0, dy: 1, inner: 0.5, outer: 1.05 }, shadow: true, falloff: 1.3 });
  }

  // The beacon, and the rings it throws once the transmitter is live.
  art.indicators.push({ id: 'main', x: 320, y: 30, kind: 'lamp' });
  art.playDynamics.push((st, t, signals) => {
    const k = 0.5 + 0.5 * Math.sin(t * 1.3);
    st.emit(319, 26, 3, 3, GLOW.red, 0.25 + 0.2 * k, 0.5);
    if ((signals.main ?? 0) < 1) return;
    // On the air: rings of carrier spreading from the masthead.
    for (let i = 0; i < 4; i++) {
      const u = (t * 0.32 + i / 4) % 1;
      const r = 8 + u * 190;
      const alpha = (1 - u) * 0.7;
      // Whole rings: the masthead sits at the very top of the frame, so it is the lower half that is seen.
      const steps = Math.max(48, Math.floor(r * 3));
      for (let s2 = 0; s2 < steps; s2++) {
        const ang = (s2 / steps) * Math.PI * 2;
        st.emit(320 + Math.cos(ang) * r, 30 + Math.sin(ang) * r * 0.62, 2, 2, i % 2 ? GLOW.teal : '#ffd9a0', alpha, 0.4);
      }
    }
    st.emit(317, 24, 7, 7, '#fff2d8', 0.5 + 0.5 * Math.sin(t * 9), 0.8);
  });

  // ------------------------------------------------------------ the sky
  {
    // Storm below, clear night and aurora above.
    const py = 0.1;
    const s = layerSize(level, 0, py);
    const sky = new Art(s.w, s.h);
    const g = sky.c.createLinearGradient(0, 0, 0, s.h);
    g.addColorStop(0, '#02030b');
    g.addColorStop(0.3, '#061026');
    g.addColorStop(0.5, '#0c1a30');
    g.addColorStop(0.75, '#141c2a');
    g.addColorStop(1, '#262a36');
    sky.c.fillStyle = g;
    sky.c.fillRect(0, 0, s.w, s.h);
    sky.g.fillStyle = '#000';
    sky.g.fillRect(0, 0, s.w, s.h);
    const rng = new Rng(level.seed + 3);
    const clear = rowFor(CLOUD_TOP, py);
    for (let i = 0; i < 260; i++) {
      const y = rng.int(0, Math.max(1, Math.floor(clear) - 10));
      sky.emit(rng.int(0, s.w - 1), y, 1, 1, shade('#cfe0ff', rng.range(0.3, 0.95)), 0.5);
    }
    // Aurora curtains: the ionosphere, the thing that carries radio over the horizon at night.
    const top = 6;
    const span = Math.max(40, Math.floor(clear * 0.62));
    for (let x = 0; x < s.w; x++) {
      const n = fbm(x * 0.018, 0.5, 4, level.seed + 5);
      const n2 = fbm(x * 0.05, 3.7, 3, level.seed + 8);
      const h = span * (0.35 + n * 0.75);
      const y0 = top + (1 - n) * 26 + n2 * 10;
      const bright = Math.max(0, n - 0.26) * 3.2;
      if (bright <= 0) continue;
      for (let y = 0; y < h; y += 1) {
        const u = y / h;
        const aCol = u < 0.22 ? '#ff5ab0' : u < 0.55 ? '#48f0c0' : '#2ac8a0';
        const al = bright * (1 - u * 0.85) * (0.45 + 0.55 * n2) * 0.9;
        if (al < 0.03) continue;
        sky.g.globalAlpha = Math.min(1, al);
        sky.g.fillStyle = aCol;
        sky.g.fillRect(x, Math.round(y0 + y), 1, 1);
      }
    }
    sky.g.globalAlpha = 1;
    // Moon.
    sky.halo(Math.floor(s.w * 0.78), Math.floor(clear * 0.42), 60, '#cdd8ea', 0.14);
    sky.disc(Math.floor(s.w * 0.78), Math.floor(clear * 0.42), 9, '#8894a8', true, 0.5);
    art.layers.push({ group: 'far', art: sky, px: 0, py, ox: -PAD, oy: -PAD });
  }
  {
    // The city, far below at the foot of the tower.
    const p = 0.16;
    const s = layerSize(level, p, p);
    const sk = paintSkyline({
      w: s.w,
      h: s.h,
      baseY: s.h - 24,
      seed: level.seed + 2,
      width: [18, 46],
      height: [40, 120],
      gap: [0, 8],
      body: '#0b1220',
      haze: '#1c2230',
      hazeAmt: 0.8,
      lit: ['#ffcf7a', '#9fd8ff', '#ffb860'],
      litRatio: 0.16,
      cell: [1, 1, 3, 4],
      signs: 0.3,
      beacons: 0.5,
      towers: 0.2,
    });
    art.layers.push({ group: 'far', art: sk, px: p, py: p, ox: -PAD, oy: -PAD });
  }
  // Storm deck: three drifting sheets, darkest in the middle of the climb, with a moonlit top.
  const sheets: [number, string, string, number, number, 'far' | 'mid'][] = [
    [0.24, '#121826', '#2a3854', 5, 1, 'far'],
    [0.42, '#171e2e', '#33446a', 11, 0.95, 'mid'],
    [0.66, '#1c2436', '#3a4c74', 19, 0.8, 'mid'],
  ];
  sheets.forEach(([p, tint, under, speed, density, group], i) => {
    const s = layerSize(level, p, p);
    const top = rowFor(CLOUD_TOP + i * 60, p);
    const sheet = fogSea(s.w + 360, s.h, top, level.seed + 40 + i * 7, tint, under, density);
    art.dynamics.push((st, t) => {
      st.layer(group, sheet, -PAD - ((t * speed) % 360), -PAD, p, p);
    });
  });
  // Girders crossing close to the lens, but only inside the storm: the summit stays open sky.
  {
    const p = 1.45;
    const s = layerSize(level, p, p);
    const fg = new Art(s.w, s.h);
    const rng = new Rng(level.seed + 9);
    for (let y = rowFor(CLOUD_TOP + 160, p); y < s.h; y += rng.int(190, 340)) {
      const x = rng.int(0, Math.max(1, s.w - 200));
      const w = rng.int(140, Math.max(141, s.w));
      fg.rect(x, y, w, 9, '#04060a');
      fg.rect(x, y, w, 1, '#111823');
      for (let i = 0; i < w; i += 18) fg.line(x + i, y + 9, x + i + 18, y + 40, '#04060a', 3);
      fg.rect(x, y + 40, w, 5, '#04060a');
      if (rng.chance(0.6)) fg.emit(x + rng.int(4, w - 4), y - 2, 3, 2, GLOW.red, 0.5);
    }
    art.layers.push({ group: 'fg', art: fg, px: p, py: p, ox: -PAD, oy: -PAD });
  }
  // Cloud tearing past the lens during the storm section.
  {
    const p = 1.45;
    const wisp = fogSea(760, 150, 30, level.seed + 90, '#2a3448', '#000000', 0.42);
    const lo = rowFor(CLOUD_TOP + 80, p);
    const hi = rowFor(level.height - 200, p);
    art.dynamics.push((st, t) => {
      for (let k = 0; k < 4; k++) {
        const x = ((t * (60 + k * 17) + k * 400) % 1700) - 760;
        const y = lo + ((hi - lo) * (k + 0.3)) / 4;
        st.layer('fg', wisp, x, y, p, p, 0.55);
      }
    });
  }
  return art;
}
