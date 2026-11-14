import { PAD } from '../../core/constants';
import { shade } from '../../core/color';
import { Rng } from '../../core/math';
import { Art } from '../../gfx/art';
import type { LevelData, OneWay, PropDef, Solid } from '../../game/level';
import { hazeBand, paintSky, paintSkyline, paintSpire } from '../city';
import { FOCAL } from '../../gfx/world';
import { backCopy, concreteTile, ground, waterTile } from '../depth';
import { GLOW, RAMP } from '../palette';
import { cable, maskFloor, maskOccluder, type PaintCtx } from '../paint';
import { paintProp } from '../props';
import { beginScene, DEFAULT_LOOK, layerFloor, layerSize, paintLadder, paintOneWay, paintSolid, type SceneArt } from '../scene';
import { boxSkins, boxStack, dock, gantry, stackDepth, yardProp } from './yards';

/** How far behind the walking line the quay ends and the channel begins. */
export const EDGE_Z = 64;
/** The channel lies this far below the deck. */
export const WATER_DROP = 12;

/**
 * Screen rows (with the camera at the level floor) where each painted band of
 * the harbour meets the water. The water itself is a real plane in the
 * scene's depth, running from the quay's edge to the horizon; a band painted
 * at row 190 + 12 x its parallax stands on that plane at the distance its
 * parallax implies, wherever the lens goes (the far bank sits a little
 * higher: on the horizon, where the plane ends). The Undertow stands on the
 * water between the far bank and the pier, so the pier's cranes are in front
 * of it and the city is behind.
 */
const ROW = { bankA: 187, bankB: 188, pier: 195 };

const WATER = { deep: '#05080f', mid: '#0a111c', light: '#141f30' };

/**
 * Open water from `y0` to the bottom of a layer. It is the ground everything
 * on the quay is seen against, so it stays dark and quiet: a few ripples, and
 * here and there the port's lights lying broken on it.
 */
function water(a: Art, y0: number, rng: Rng, glints: readonly string[], density: number, ripple: number): void {
  const h = a.h - y0;
  if (h <= 0) return;
  a.dither(0, y0, a.w, h, WATER.mid, WATER.deep, (_u, v) => 0.3 + v * 1.4);
  // The far edge of a band catches the sky.
  a.rect(0, y0, a.w, 1, WATER.light);
  for (let i = 0; i < (a.w * Math.min(h, 90) * ripple) / 420; i++) {
    const y = y0 + 1 + Math.floor(Math.pow(rng.next(), 1.6) * (Math.min(h, 90) - 2));
    a.rect(rng.int(0, a.w), y, rng.int(2, 3 + Math.floor(ripple * 5)), 1, shade(WATER.light, rng.range(0.55, 1)));
  }
  for (let i = 0; i < a.w * density; i++) {
    const x = rng.int(0, a.w - 1);
    const col = rng.pick(glints);
    const len = rng.int(3, 5 + Math.floor(ripple * 8));
    const k = rng.range(0.16, 0.42);
    for (let j = 0; j < len; j += rng.int(1, 3)) a.emit(x + (rng.chance(0.3) ? 1 : 0), y0 + 1 + j, 1, 1, shade(col, k * (1 - j / (len + 2))), 0.4);
  }
}

/** The harbour behind the quay: sky, the far bank and the Spire, open water, a working pier. */
function harbour(level: LevelData, art: SceneArt, stormy: boolean): void {
  const seed = level.seed;
  const haze = '#262c3e';
  const lights = ['#ffcf7a', '#ffb860', '#9fd8ff', '#ffe2a8'];

  // Sky: a low lid of cloud, lit from underneath by the port.
  {
    const py = 0.02;
    const s = layerSize(level, 0, py);
    const sky = paintSky({
      w: s.w,
      h: s.h,
      stops: stormy ? ['#070b14', '#0b1220', '#131c2e', '#1b2638', '#283246', '#36384a'] : ['#04060c', '#080e1b', '#0e182b', '#182337', '#262d40', '#353542'],
      stars: 0,
      clouds: stormy ? 1 : 0.85,
      cloudColor: stormy ? '#3a4258' : '#2e3348',
      seed: seed + 9,
    });
    art.layers.push({ group: 'far', art: sky, px: 0, py, ox: -PAD, oy: -PAD });
  }

  // The far bank, with the Spire standing over it.
  {
    const p = 0.05;
    const s = layerSize(level, p, p);
    const base = layerFloor(level, p, ROW.bankA);
    const body = '#101a2c';
    const sk = paintSkyline({
      w: s.w,
      h: s.h,
      baseY: base,
      seed: seed + 1,
      width: [14, 38],
      height: [30, 92],
      gap: [0, 6],
      body,
      haze,
      hazeAmt: 0.75,
      lit: ['#9fd8ff', '#bfe6ff', '#ffcf7a', '#7fb0ff'],
      litRatio: 0.085,
      cell: [1, 1, 3, 4],
      signs: 0.1,
      beacons: 0.5,
      towers: 0.12,
    });
    const spire = paintSpire(176, shade(body, 1.3));
    const sx = Math.floor(s.w * 0.7);
    sk.blit(spire, sx, base - 171);
    hazeBand(sk, base - 70, base + 4, haze, 0.5);
    water(sk, base, new Rng(seed + 21), lights, 0.14, 0.2);
    const bx = sx + 23 - PAD;
    const by = base - 171 - PAD;
    art.dynamics.push((st, t) => {
      if (Math.sin(t * 2.6) > 0.3) {
        st.layerRect('far', bx - 1, by - 1, 3, 3, p, p, GLOW.red, true);
        st.layerRect('far', bx - 3, by - 3, 7, 7, p, p, GLOW.red, true, 0.25);
      }
    });
    art.layers.push({ group: 'far', art: sk, px: p, py: p, ox: -PAD, oy: -PAD });
  }

  // Its waterfront: sheds, tanks, a line of sodium lamps along the wall.
  {
    const p = 0.1;
    const s = layerSize(level, p, p);
    const base = layerFloor(level, p, ROW.bankB);
    const body = '#0c1422';
    const sk = paintSkyline({
      w: s.w,
      h: s.h,
      baseY: base,
      seed: seed + 2,
      width: [26, 70],
      height: [10, 38],
      gap: [0, 18],
      body,
      haze,
      hazeAmt: 0.6,
      lit: lights,
      litRatio: 0.07,
      cell: [2, 1, 4, 4],
      signs: 0,
      beacons: 0.3,
      towers: 0.06,
    });
    const rng = new Rng(seed + 22);
    sk.rect(0, base - 2, s.w, 2, shade(body, 0.8));
    for (let x = rng.int(0, 8); x < s.w; x += rng.int(10, 22)) sk.emit(x, base - 4, 1, 1, shade(rng.chance(0.8) ? GLOW.sodium : '#dbeeff', 0.7), 0.5);
    water(sk, base, rng, [GLOW.sodium, GLOW.sodium, '#dbeeff', '#ffcf7a'], 0.16, 0.35);
    art.layers.push({ group: 'far', art: sk, px: p, py: p, ox: -PAD, oy: -PAD });
  }

  // (The Undertow stands here, out on the water, put there by drawKaiju.)

  // A finger pier: small cranes in port yellow, a ship alongside. This is what it dwarfs.
  {
    const p = 0.42;
    const s = layerSize(level, p, p);
    const a = new Art(s.w, s.h);
    // The deck stands 14 px clear of the water on its piles.
    const top = layerFloor(level, p, ROW.pier) - 14;
    const rng = new Rng(seed + 60);
    const body = '#0a0f18';
    const steel = '#3c3320';
    const steelLit = '#544626';
    const steelDark = '#221d12';
    // Piles down to the water; the water between them is the scene's own.
    for (let x = 6; x < s.w; x += 22) a.rect(x, top + 5, 3, 9, '#05070c');
    a.rect(0, top, s.w, 5, '#101724');
    a.rect(0, top, s.w, 1, '#283446');
    for (let x = rng.int(30, 120); x < s.w; x += rng.int(190, 320)) {
      const h = rng.int(46, 66);
      for (const lx of [x, x + 28]) {
        a.rect(lx, top - h, 3, h, steel);
        a.rect(lx, top - h, 1, h, steelLit);
      }
      a.line(x + 1, top - h + 3, x + 29, top - 8, steelDark);
      a.line(x + 29, top - h + 3, x + 1, top - 8, steelDark);
      a.rect(x - 24, top - h, 88, 3, steel);
      a.rect(x - 24, top - h, 88, 1, steelLit);
      a.rect(x - 24, top - h - 12, 88, 1, steel);
      for (let i = x - 24; i < x + 60; i += 12) {
        a.line(i, top - h - 11, i + 6, top - h, steelDark);
        a.line(i + 6, top - h, i + 12, top - h - 11, steelDark);
      }
      a.rect(x + 38, top - h + 3, 11, 7, '#1c2430');
      a.emit(x - 24, top - h - 14, 2, 2, GLOW.red, 0.5);
      a.emit(x + 62, top - h - 14, 2, 2, GLOW.red, 0.5);
      a.emit(x + 40, top - h + 5, 7, 3, '#9fc6ce', 0.4);
      a.emit(x + 13, top - h + 4, 2, 1, '#eef6ff', 0.6);
      // A box on the hook.
      const fall = rng.int(10, 30);
      a.rect(x + 56, top - h + 3, 1, fall, '#05070c');
      a.rect(x + 50, top - h + 3 + fall, 13, 6, rng.pick(['#3a2622', '#1e3440', '#30381e']));
    }
    // Sheds and lamp posts along the deck.
    for (let x = rng.int(0, 60); x < s.w; x += rng.int(60, 130)) {
      if (rng.chance(0.45)) {
        const w = rng.int(26, 54);
        const h = rng.int(8, 16);
        a.rect(x, top - h, w, h, body);
        a.rect(x, top - h, w, 1, '#1c2634');
        if (rng.chance(0.6)) a.emit(x + rng.int(3, w - 6), top - h + 3, 3, 2, '#ffd9a0', 0.4);
      } else {
        a.rect(x, top - 14, 1, 14, body);
        a.emit(x - 1, top - 15, 3, 1, GLOW.sodium, 0.6);
      }
    }
    // The ship.
    const hx = Math.floor(s.w * 0.52);
    a.rect(hx, top - 22, 300, 30, '#0b1018');
    a.rect(hx, top - 22, 300, 2, '#1c2634');
    a.rect(hx + 214, top - 44, 58, 22, '#0f151e');
    a.rect(hx + 236, top - 54, 8, 10, '#0f151e');
    for (let i = 0; i < 7; i++) a.emit(hx + 219 + i * 7, top - 38, 3, 2, '#ffd9a0', 0.5);
    for (let i = 0; i < 18; i++) a.emit(hx + 12 + i * 16, top - 16, 2, 1, '#ffd9a0', 0.4);
    a.text('HAVEN LINE', hx + 110, top - 11, '#232d3a', { font: 'g7', align: 'center' });
    hazeBand(a, top - 50, top + 2, haze, 0.16);
    art.layers.push({ group: 'mid', art: a, px: p, py: p, ox: -PAD, oy: -PAD });
  }

}

/** Close to the lens, out of focus: mooring bollards along the near edge, and a line or two made fast to them. */
function foreground(level: LevelData, art: SceneArt, seed: number): void {
  const p = 1.45;
  const s = layerSize(level, p, p);
  const a = new Art(s.w, s.h);
  const rng = new Rng(seed);
  const floor = layerFloor(level, p, 270);
  const dark = '#04060a';
  const rim = '#121a26';
  for (let x = rng.int(60, 200); x < s.w; x += rng.int(360, 620)) {
    a.rect(x, floor - 26, 24, 28, dark);
    a.rect(x - 5, floor - 31, 34, 7, dark);
    a.rect(x, floor - 26, 1, 26, rim);
    a.rect(x - 5, floor - 31, 34, 1, rim);
    if (rng.chance(0.6)) {
      // A hawser running up and away out of frame.
      const dir = rng.chance(0.5) ? 1 : -1;
      cable(a, x + 12, floor - 22, x + 12 + dir * rng.int(150, 240), floor - rng.int(170, 250), 22, dark);
      cable(a, x + 12, floor - 21, x + 12 + dir * rng.int(150, 240), floor - rng.int(170, 250), 23, dark);
    }
    if (rng.chance(0.5)) a.emit(x + 10, floor - 34, 3, 2, GLOW.amber, 0.5);
  }
  art.layers.push({ group: 'fg', art: a, px: p, py: p, ox: -PAD, oy: -PAD });
}

/** A concrete barrier: waist-high, with a band of hazard paint. */
function barrier(c: PaintCtx, s: Solid): void {
  const a = c.back;
  const cc = RAMP.concrete;
  const { x, y, w, h } = s;
  a.rect(x, y + h - 5, w, 5, cc[1]);
  a.rect(x + 1, y + h - 8, w - 2, 3, cc[1]);
  a.rect(x + 2, y + 1, w - 4, h - 8, cc[2]);
  a.rect(x + 3, y, w - 6, 1, cc[3]);
  a.rect(x + 2, y + 1, w - 4, 1, cc[3]);
  a.rect(x + 2, y + 2, 1, h - 9, cc[3]);
  a.rect(x + w - 3, y + 2, 1, h - 6, cc[0]);
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < w - 4; i++) a.px(x + 2 + i, y + 5 + j, ((i + j) >> 1) % 2 ? '#c8a82a' : '#1c1e22');
  }
  a.rect(x, y + h - 1, w, 1, cc[0]);
  a.tint(x, y + h - 6, w, 6, '#14161a', 0.3);
  maskOccluder(c, x + 1, y, w - 2, h);
}

/** The deck grating over the trench, seen edge-on. */
function grating(c: PaintCtx, o: OneWay): void {
  const a = c.back;
  const m = RAMP.metal;
  a.rect(o.x, o.y, o.w, 1, m[3]);
  a.rect(o.x, o.y + 1, o.w, 2, m[1]);
  for (let i = o.x + 1; i < o.x + o.w; i += 2) a.px(i, o.y + 1, '#07080b');
  for (let i = o.x; i < o.x + o.w; i += 22) a.rect(i, o.y, 2, 4, m[2]);
  a.rect(o.x + o.w - 2, o.y, 2, 4, m[2]);
}

/** The cable trench under the grating: the landing of Meridian's sea-cable, dead since spring. */
function trench(c: PaintCtx, x: number, y: number, w: number, depth: number, bottom: number): void {
  const a = c.back;
  const pv = RAMP.paving;
  a.rect(x, y, w, depth, '#12151c');
  a.rect(x, y, w, 4, '#090b10');
  for (let i = x + 26; i < x + w; i += 44) a.rect(i, y + 4, 1, depth - 4, '#0a0c11');
  // The cable itself, as thick as a leg, and its lesser neighbours.
  a.rect(x, y + 11, w, 6, '#06070a');
  a.rect(x, y + 11, w, 1, '#222a36');
  a.rect(x, y + 16, w, 1, '#020304');
  for (let i = x + 12; i < x + w; i += 36) {
    a.rect(i, y + 9, 4, 10, '#2c323c');
    a.rect(i, y + 9, 4, 1, '#4a5260');
  }
  a.rect(x, y + 22, w, 2, '#0b0d12');
  a.rect(x, y + 26, w, 1, '#0b0d12');
  a.rect(x + 70, y + 12, 9, 4, '#16484f');
  a.text('MRDN SC-4', x + 84, y + 12, '#1e5a62', { font: 'g7' });
  // Floor and the cut faces of the deck.
  a.rect(x, y + depth, w, bottom - y - depth, pv[1]);
  a.rect(x, y + depth, w, 1, pv[3]);
  a.rect(x - 1, y + 1, 1, depth, pv[3]);
  a.rect(x + w, y + 1, 1, depth, pv[0]);
  // Nothing mirrors in the hole; its floor is wet like the deck.
  c.mask.fillStyle = '#000';
  c.mask.fillRect(x, y, w, depth);
  maskFloor(c, x, y + depth, w, bottom - y - depth, (_px, row) => (row < 2 ? 0.1 : 0.34));
  for (const lx of [x + 46, x + w - 46]) {
    a.rect(lx - 2, y + 4, 5, 3, '#30363e');
    a.emit(lx - 1, y + 6, 3, 2, GLOW.amber, 0.7);
    c.lights.push({ x: lx, y: y + 10, r: 64, color: GLOW.amber, k: 0.6, falloff: 1.5 });
  }
}

function quayProp(c: PaintCtx, art: SceneArt, p: PropDef): boolean {
  const a = c.back;
  const x = p.x;
  const y = p.y;
  const m = RAMP.metal;
  switch (p.kind) {
    case 'pedestal': {
      // The crane's override: a key, a lamp, and the hook where the rivet gun lived.
      a.rect(x + 2, y - 14, 6, 14, m[1]);
      a.rect(x, y - 22, 10, 8, m[2]);
      a.rect(x, y - 22, 10, 1, m[3]);
      a.rect(x + 2, y - 20, 3, 3, '#0c1014');
      a.rect(x + 6, y - 20, 2, 4, '#c8a82a');
      a.rect(x + 9, y - 16, 4, 1, m[0]);
      art.playDynamics.push((st, t, sig) => {
        const on = (sig.cab ?? 0) >= 1;
        st.emit(x + 2, y - 19, 2, 1, on ? GLOW.green : GLOW.amber, on || Math.sin(t * 4) > 0 ? 1 : 0.2);
      });
      c.lights.push({ x: x + 5, y: y - 20, r: 30, color: GLOW.amber, k: 0.35, falloff: 1.6 });
      return true;
    }
    case 'brake': {
      // Slew brake housing on the crane leg: red, and meant to be found.
      a.rect(x - 7, y - 7, 14, 14, '#7a2a24');
      a.rect(x - 7, y - 7, 14, 1, '#b4483c');
      a.rect(x - 7, y + 6, 14, 1, '#4a1814');
      a.rect(x - 4, y - 4, 8, 8, '#521c18');
      a.rect(x - 1, y - 12, 2, 6, m[2]);
      a.rect(x - 3, y - 13, 6, 2, '#c8a82a');
      for (let i = 0; i < 14; i += 4) a.rect(x - 7 + i, y + 8, 2, 2, '#c8a82a');
      return true;
    }
    case 'switch': {
      // Knife switch for the quay floodlights.
      a.rect(x - 5, y - 26, 10, 14, m[1]);
      a.rect(x - 5, y - 26, 10, 1, m[3]);
      a.rect(x - 1, y - 12, 2, 12, m[0]);
      a.rect(x - 3, y - 23, 6, 8, '#0c1014');
      art.playDynamics.push((st, _t, sig) => {
        const on = (sig.floods ?? 0) >= 1;
        st.rect(x - 1, on ? y - 23 : y - 20, 2, 5, '#c8433c');
        st.emit(x + 2, y - 25, 2, 1, on ? GLOW.green : GLOW.red, 1);
      });
      c.lights.push({ x, y: y - 22, r: 26, color: GLOW.red, k: 0.3, falloff: 1.6 });
      return true;
    }
    case 'launch': {
      // Meridian patrol launch, tied up under the quay wall: it floats in the channel behind the edge,
      // so only its upper works show above the deck.
      const d = c.depth;
      const W = 150;
      const H = 66;
      const r = d.region(W, H);
      const l = d.atlas;
      const hull = '#1a222e';
      // Local rows: 0 is the masthead, 54 the deck line it used to be drawn to, 66 the water.
      const dy = 54;
      l.rect(0, dy - 7, W, 7 + WATER_DROP, hull);
      l.rect(0, dy - 7, W, 1, '#3a4658');
      l.rect(8, dy - 5, 134, 1, '#2ac8d8');
      l.rect(0, dy + 4, W, 1, '#0d1219');
      l.rect(40, dy - 30, 56, 23, '#222c3a');
      l.rect(40, dy - 30, 56, 1, '#4a586c');
      l.emit(44, dy - 26, 48, 8, '#8fd8e8', 0.2);
      for (const mx of [59, 75]) l.rect(mx, dy - 26, 1, 8, '#222c3a');
      l.text('MERIDIAN', 68, dy - 16, '#7fb8c8', { font: 'g7', align: 'center' });
      l.rect(66, dy - 52, 2, 22, hull);
      l.rect(58, dy - 46, 18, 2, '#2a3442');
      l.rect(100, dy - 14, 30, 7, '#1e2632');
      l.rect(8, dy - 12, 2, 5, '#1e2632');
      l.emit(65, dy - 54, 4, 2, GLOW.blue, 0.6);
      l.emit(104, dy - 12, 3, 2, '#eaf6ff', 0.7);
      d.seal(r);
      // Drawn a little large, so that it is the size it was painted once it stands this far back.
      const z = EDGE_Z + 18;
      const k = 1 + z / FOCAL;
      const foot = y + WATER_DROP;
      d.face(x, x + W * k, foot - H * k, foot, z, r, { cut: true, shade: 1.5 });
      c.lights.push({ x: x + 67 * k, y: foot - (H - 1) * k, z, r: 90, color: GLOW.blue, k: 0.7, flicker: 'blink' });
      c.lights.push({ x: x + 68 * k, y: foot - 32 * k, z, r: 80, color: '#8fd8e8', k: 0.45 });
      // Its searchlight is laid along the quay, toward whoever is behind the crates.
      c.lights.push({ x: x + 104, y: y - 10, r: 200, color: '#dbeeff', k: 0.8, cone: { dx: -0.96, dy: 0.26, inner: 0.16, outer: 0.34 }, shadow: true, falloff: 1.1 });
      // Gangway from the edge down onto the deck.
      a.line(x + 4, y - 3, x - 20, y, m[2]);
      a.line(x + 4, y - 4, x - 20, y - 1, m[3]);
      return true;
    }
  }
  return false;
}

/** The quay under SG-07: the Yards' steel and rain, with the harbour open behind it. */
export function paintQuay(level: LevelData): SceneArt {
  const tide = level.id === 'tide';
  const { c, art } = beginScene(level, {
    ...DEFAULT_LOOK,
    ambPlay: tide ? [0.18, 0.23, 0.36] : [0.19, 0.24, 0.36],
    fogColor: [0.12, 0.15, 0.2],
    fogMid: tide ? 0.24 : 0.28,
    groundFog: 0.36,
    scatter: tide ? 0.19 : 0.15,
    reflect: 0.78,
    ripple: 3.0,
    // The far side of the harbour is what this place is about: keep it readable.
    blurFar: tide ? 0.8 : 1.3,
    blurMid: tide ? 0.45 : 0.6,
    bloom: 0.55,
    saturation: 1.04,
    shadowTint: [0.0, 0.012, 0.032],
    highTint: [0.012, 0.012, 0.02],
  });
  const a = c.back;
  const G = level.groundY;
  dock(c, -PAD, level.width + PAD, G);
  // The apron runs out to the lens and back to the quay's edge, a few steps behind the fight; then the channel.
  ground(c, concreteTile(c.depth, level.seed + 11), {
    wet: 0.75,
    lanes: [{ z: -104, color: '#b89a2a' }],
    rails: [-24, -36, 34, 46],
    shore: { z: EDGE_Z, drop: WATER_DROP, water: waterTile(c.depth, level.seed + 12, '#0a121e'), wall: concreteTile(c.depth, level.seed + 13) },
  });
  const skins = boxSkins(c);
  const grate = level.oneWays.find((o) => o.tag === 'grating');
  const pit = level.solids.find((s) => s.tag === 'pit');
  if (grate && pit) trench(c, grate.x, grate.y, grate.w, pit.y - grate.y, level.height + PAD);

  for (const p of level.props) if (!quayProp(c, art, p) && !yardProp(c, art, p)) paintProp(c, art, p);
  for (const s of level.solids) {
    if (s.tag === 'container') {
      boxStack(c, s);
      stackDepth(c, skins, s);
    } else if (s.tag === 'barrier') barrier(c, s);
    else if (s.tag !== 'dock' && s.tag !== 'pit') paintSolid(c, s);
  }
  for (const o of level.oneWays) {
    if (o.tag === 'grating') grating(c, o);
    else {
      paintOneWay(c, o);
      a.rect(o.x, o.y - 12, o.w, 1, '#8a6a22');
      for (let i = o.x; i < o.x + o.w; i += 14) a.rect(i, o.y - 12, 1, 12, '#6a521c');
    }
  }
  for (const l of level.ladders) paintLadder(a, l.x, l.y0, l.y1);

  // What the story switches on the crane: Gil in the cab, and the hook he lowers at the end.
  const crane = level.props.find((p) => p.kind === 'gantry');
  if (crane) {
    // The crane straddles its rails: this is the frame on the seaward side.
    backCopy(c, crane.x - 74, G - 326, 548, 326, 40, (cc) => gantry(cc, crane.x, G));
    const deckY = G - 240;
    const cabX = crane.x + 250;
    const fallX = crane.x + 343;
    art.playDynamics.push((st, t, sig) => {
      if ((sig.cab ?? 0) >= 1) {
        st.emit(cabX + 4, deckY + 14, 38, 2, '#ffd9a0', 0.9, 0.6);
        st.rect(cabX + 15, deckY + 17, 4, 4, '#141a22');
        st.rect(cabX + 13, deckY + 21, 8, 7, '#141a22');
      }
      const v = sig.hook ?? 0;
      if (v > 0) {
        const hy = Math.round(G - 100 + (56 - 100 + 100) * v + Math.sin(t * 1.7) * (1 - v));
        st.rect(fallX, G - 100, 1, hy - (G - 100), '#0c0e12');
        st.rect(fallX - 3, hy, 7, 5, '#c8a82a');
        st.rect(fallX - 3, hy, 7, 1, '#e8c84a');
        st.rect(fallX, hy + 5, 1, 4, '#30363e');
        st.rect(fallX - 2, hy + 8, 3, 1, '#30363e');
        st.rect(fallX - 2, hy + 6, 1, 2, '#30363e');
      }
    });
  }

  harbour(level, art, tide);
  foreground(level, art, level.seed + 5);
  return art;
}
