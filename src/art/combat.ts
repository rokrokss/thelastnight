import { VIEW_W } from '../core/constants';
import { shade } from '../core/color';
import { clamp, clamp01, hash2 } from '../core/math';
import { segEnter, solMuzzle, type Combat, type Enforcer, type Mark } from '../game/combat';
import { SWEEP_H, WAVE_H, WAVE_LEN, type Attack, type Kaiju } from '../game/kaiju';
import type { Fx, Mover, World } from '../game/world';
import { Art } from '../gfx/art';
import type { Light, Vec3 } from '../gfx/renderer';
import type { Stage } from '../gfx/stage';
import { BARB, drawKaiju, kaijuLights } from './kaiju';
import { GLOW } from './palette';
import { paintBox } from './scenes/yards';

/**
 * Everything a fight adds to the picture, drawn through the Stage: the
 * Enforcers, the rivet gun in Sol's hands, rounds in the air, the marks worth
 * shooting, and the warnings that come before each of the Undertow's attacks.
 * The simulation (game/combat, game/kaiju) decides; this only shows.
 */

const HOT = '#ffe9b0';
const EMBER = '#ff9a44';
const ROUND = '#ff4b3a';
const WARN = '#ffb347';

// ---------------------------------------------------------------------------
// Small helpers over the Stage
// ---------------------------------------------------------------------------

/** A line in the play layer, drawn as runs of whole pixels. */
function seg(st: Stage, x0: number, y0: number, x1: number, y1: number, col: string, alpha = 1, glow = true, th = 1): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const put = (x: number, y: number, w: number, h: number): void => {
    if (glow) st.emit(x, y, w, h, col, alpha, 0.6);
    else st.rect(x, y, w, h, col, alpha);
  };
  if (Math.abs(dx) >= Math.abs(dy)) {
    const n = Math.max(1, Math.round(Math.abs(dx)));
    const sx = dx >= 0 ? 1 : -1;
    let runX = Math.round(x0);
    let runY = Math.round(y0);
    let len = 0;
    for (let i = 0; i <= n; i++) {
      const y = Math.round(y0 + (dy * i) / n);
      if (y !== runY) {
        put(sx > 0 ? runX : runX - len + 1, runY, len, th);
        runX = Math.round(x0) + sx * i;
        runY = y;
        len = 0;
      }
      len++;
    }
    put(sx > 0 ? runX : runX - len + 1, runY, len, th);
  } else {
    const n = Math.max(1, Math.round(Math.abs(dy)));
    const sy = dy >= 0 ? 1 : -1;
    let runX = Math.round(x0);
    let runY = Math.round(y0);
    let len = 0;
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + (dx * i) / n);
      if (x !== runX) {
        put(runX, sy > 0 ? runY : runY - len + 1, th, len);
        runY = Math.round(y0) + sy * i;
        runX = x;
        len = 0;
      }
      len++;
    }
    put(runX, sy > 0 ? runY : runY - len + 1, th, len);
  }
}

/** Where a ray from (x, y) first meets something solid, up to `max` px away. */
function rayEnd(w: World, x: number, y: number, tx: number, ty: number, max: number): [number, number] {
  const d = Math.hypot(tx - x, ty - y) || 1;
  const ex = x + ((tx - x) / d) * max;
  const ey = y + ((ty - y) / d) * max;
  let best = 1;
  for (const s of w.level.solids) best = Math.min(best, segEnter(x, y, ex, ey, s));
  for (const m of w.movers) best = Math.min(best, segEnter(x, y, ex, ey, m));
  return [x + (ex - x) * best, y + (ey - y) * best];
}

// ---------------------------------------------------------------------------
// Enforcers
// ---------------------------------------------------------------------------

const E = { dark: '#1c2430', body: '#323e4d', plate: '#465669', edge: '#8196ae', paint: '#2ab8c8', shield: '#465468', shieldEdge: '#93a8c2' };

type Pose = 'stand' | 'aim' | 'walk0' | 'walk1' | 'duck' | 'fold' | 'heap';
const TROOPER_W = 30;
const TROOPER_H = 40;
const SHIELD_W = 36;
const SHIELD_H = 42;

const sprites = new Map<string, Art>();

/** A backward-kneed leg: hip, knee, ankle, then a flat foot. */
function leg(a: Art, hx: number, hy: number, kx: number, ky: number, ax: number, ay: number, col: string, th: number, floor: number): void {
  a.line(hx, hy, kx, ky, col, th);
  a.line(kx, ky, ax, ay, col, Math.max(2, th - 1));
  a.line(kx + 1, ky, ax + 1, ay - 1, shade(col, 1.5));
  a.px(kx, ky, E.edge);
  a.rect(ax, floor - 2, 5, 2, E.dark);
  a.rect(ax, floor - 2, 5, 1, shade(col, 1.4));
}

function trooper(pose: Pose): Art {
  const a = new Art(TROOPER_W, TROOPER_H);
  const F = TROOPER_H - 1;
  if (pose === 'heap') {
    // Folded up and dark.
    a.rect(8, F - 4, 15, 4, E.dark);
    a.rect(10, F - 7, 9, 4, E.body);
    a.rect(10, F - 7, 9, 1, E.plate);
    a.rect(17, F - 5, 7, 2, E.plate);
    a.line(5, F - 1, 21, F - 8, E.dark);
    a.rect(13, F - 5, 4, 1, shade(E.paint, 0.5));
    a.rect(20, F - 9, 2, 3, E.body);
    return a;
  }
  if (pose === 'duck' || pose === 'fold') {
    const dy = pose === 'fold' ? 3 : 0;
    a.rect(10, F - 4, 10, 4, E.dark);
    a.rect(17, F - 8, 4, 6, E.body);
    a.rect(9, F - 13 + dy, 10, 9 - dy, E.body);
    a.rect(11, F - 12 + dy, 8, 5, E.plate);
    a.rect(9, F - 13 + dy, 10, 1, E.edge);
    a.emit(12, F - 9 + dy, 6, 1, shade(E.paint, 0.6), 0.6);
    a.rect(6, F - 12 + dy, 3, 7, E.dark);
    a.rect(13, F - 16 + dy, 7, 4, E.body);
    a.rect(13, F - 16 + dy, 7, 1, E.edge);
    a.rect(16, F - 15 + dy, 4, 2, '#0a0d12');
    a.line(10, F - 2, 8, F - 14 + dy, E.dark);
    return a;
  }
  // Legs.
  if (pose === 'walk0') {
    leg(a, 14, 23, 13, 30, 8, 35, E.dark, 3, F + 1);
    leg(a, 15, 23, 20, 28, 17, 34, E.body, 3, F + 1);
  } else if (pose === 'walk1') {
    leg(a, 14, 23, 19, 29, 16, 35, E.dark, 3, F + 1);
    leg(a, 15, 23, 15, 30, 10, 35, E.body, 3, F + 1);
  } else {
    leg(a, 14, 23, 16, 30, 11, 35, E.dark, 3, F + 1);
    leg(a, 15, 23, 18, 29, 14, 35, E.body, 3, F + 1);
  }
  a.rect(12, 21, 7, 3, E.dark);
  // Pack and whip aerial.
  a.rect(7, 12, 3, 8, E.dark);
  a.line(8, 12, 6, 1, E.dark);
  // Torso.
  a.rect(10, 11, 10, 10, E.body);
  a.rect(12, 12, 8, 6, E.plate);
  a.rect(10, 11, 10, 1, E.edge);
  a.emit(13, 16, 6, 1, shade(E.paint, 0.6), 0.6);
  a.rect(19, 12, 1, 8, shade(E.plate, 1.25));
  a.rect(9, 10, 5, 4, E.plate);
  a.rect(9, 10, 5, 1, E.edge);
  // Head: a flat sensor block with one slot for the lamp.
  a.rect(15, 10, 3, 1, E.dark);
  a.rect(13, 5, 7, 5, E.body);
  a.rect(13, 5, 7, 1, E.edge);
  a.rect(16, 7, 4, 2, '#0a0d12');
  // Rifle.
  if (pose === 'aim') {
    a.line(12, 13, 17, 14, E.plate, 2);
    a.rect(11, 13, 4, 3, E.dark);
    a.rect(13, 12, 13, 2, E.dark);
    a.rect(13, 12, 13, 1, '#3d4858');
    a.px(21, 11, E.edge);
    a.rect(18, 14, 2, 3, E.dark);
  } else {
    a.line(12, 13, 15, 18, E.plate, 2);
    a.line(13, 18, 23, 22, E.dark, 2);
    a.rect(12, 17, 3, 3, E.dark);
  }
  return a;
}

function shieldUnit(pose: 'march0' | 'march1' | 'open' | 'heap'): Art {
  const a = new Art(SHIELD_W, SHIELD_H);
  const F = SHIELD_H - 1;
  if (pose === 'heap') {
    a.rect(7, F - 5, 20, 5, E.dark);
    a.rect(10, F - 9, 12, 5, E.body);
    a.rect(10, F - 9, 12, 1, E.plate);
    a.rect(18, F - 3, 14, 3, E.shield);
    a.rect(18, F - 3, 14, 1, E.shieldEdge);
    a.rect(13, F - 6, 5, 1, shade(E.paint, 0.5));
    return a;
  }
  if (pose === 'march1') {
    leg(a, 15, 25, 21, 31, 18, 37, E.dark, 4, F + 1);
    leg(a, 17, 25, 16, 32, 11, 37, E.body, 4, F + 1);
  } else {
    leg(a, 15, 25, 16, 32, 11, 37, E.dark, 4, F + 1);
    leg(a, 17, 25, 21, 31, 17, 37, E.body, 4, F + 1);
  }
  a.rect(12, 23, 10, 3, E.dark);
  a.rect(7, 11, 4, 11, E.dark);
  a.line(8, 11, 6, 2, E.dark);
  a.rect(10, 10, 13, 13, E.body);
  a.rect(12, 11, 11, 8, E.plate);
  a.rect(10, 10, 13, 1, E.edge);
  a.emit(13, 16, 9, 1, shade(E.paint, 0.6), 0.6);
  a.emit(13, 18, 9, 1, shade(E.paint, 0.45), 0.6);
  a.rect(9, 8, 6, 5, E.plate);
  a.rect(9, 8, 6, 1, E.edge);
  a.rect(13, 3, 9, 6, E.body);
  a.rect(14, 2, 7, 1, E.body);
  a.rect(13, 3, 9, 1, E.edge);
  a.rect(17, 5, 5, 2, '#0a0d12');
  if (pose === 'open') {
    // Shield grounded at its side, rifle up.
    a.rect(22, 27, 10, 4, E.shield);
    a.rect(22, 27, 10, 1, E.shieldEdge);
    a.rect(24, 31, 3, 9, E.shield);
    a.line(13, 14, 18, 17, E.plate, 2);
    a.rect(15, 16, 14, 2, E.dark);
    a.rect(15, 16, 14, 1, '#3d4858');
    a.rect(13, 17, 4, 4, E.dark);
  } else {
    // Shield up: a slab as tall as the machine.
    a.rect(25, 5, 6, 35, E.shield);
    a.rect(25, 5, 1, 35, E.shieldEdge);
    a.rect(25, 5, 6, 1, E.shieldEdge);
    a.rect(30, 6, 1, 34, shade(E.shield, 0.7));
    a.emit(27, 10, 1, 22, shade(E.paint, 0.6), 0.6);
    a.rect(26, 8, 4, 2, '#0a0d12');
    for (let i = 0; i < 6; i++) a.px(25 + i, 35 + ((i >> 1) % 2), '#c8a82a');
    a.rect(22, 18, 3, 3, E.plate);
  }
  return a;
}

function sprite(key: string, make: () => Art): Art {
  let a = sprites.get(key);
  if (!a) {
    a = make();
    sprites.set(key, a);
  }
  return a;
}

/** The same sprite burnt out to white: one frame of it says "hit". */
function whiteOf(key: string, src: Art): Art {
  return sprite(`${key}:hit`, () => {
    const a = new Art(src.w, src.h);
    a.blit(src, 0, 0);
    for (const k of [a.c, a.g]) {
      k.save();
      k.globalCompositeOperation = 'source-atop';
      k.fillStyle = '#eaf6ff';
      k.fillRect(0, 0, src.w, src.h);
      k.restore();
    }
    return a;
  });
}

function drawEnforcer(st: Stage, e: Enforcer, w: World, t: number): void {
  const flip = e.facing < 0;
  const f = e.facing;
  const x = Math.round(e.x);
  const y = Math.round(e.y);
  const dead = !e.alive;
  if (e.kind === 'shield') {
    const pose = dead ? (e.t < 0.35 ? 'open' : 'heap') : e.shielded ? (e.state === 'walk' && Math.floor(e.phase * 2) % 2 ? 'march1' : 'march0') : 'open';
    const art = sprite(`s:${pose}`, () => shieldUnit(pose));
    const sy = y - SHIELD_H + (dead && e.t < 0.35 ? Math.round(e.t * 20) : 0);
    st.sprite(art, x - SHIELD_W / 2, sy, flip);
    if (e.hitT < 0.07) st.sprite(whiteOf(`s:${pose}`, art), x - SHIELD_W / 2, sy, flip, 0.8);
    if (!dead) {
      const lamp = e.state === 'aim' || e.state === 'fire' ? GLOW.red : e.state === 'rise' ? GLOW.amber : GLOW.cyan;
      st.emit(f > 0 ? x - 1 : x - 4, y - 37, 5, 2, lamp, 1, 0.7);
    }
  } else {
    let pose: Pose;
    if (dead) pose = e.t < 0.18 ? 'duck' : e.t < 0.4 ? 'fold' : 'heap';
    else if (e.state === 'walk') pose = Math.floor(e.phase * 2) % 2 ? 'walk1' : 'walk0';
    else if (e.state === 'duck') pose = 'duck';
    else if (e.state === 'rise') pose = e.t < 0.1 ? 'duck' : 'stand';
    else if (e.state === 'aim' || e.state === 'fire') pose = 'aim';
    else if (e.state === 'stagger') pose = e.t < 0.25 ? 'stand' : 'duck';
    else pose = 'stand';
    const art = sprite(`t:${pose}`, () => trooper(pose));
    const kick = e.state === 'fire' ? -f : e.state === 'stagger' && e.t < 0.2 ? -f * 2 : 0;
    st.sprite(art, x - TROOPER_W / 2 + kick, y - TROOPER_H, flip);
    if (e.hitT < 0.07) st.sprite(whiteOf(`t:${pose}`, art), x - TROOPER_W / 2 + kick, y - TROOPER_H, flip, 0.8);
    if (!dead) {
      const low = pose === 'duck';
      const lamp = e.state === 'aim' || e.state === 'fire' ? GLOW.red : e.state === 'rise' ? GLOW.amber : GLOW.cyan;
      st.emit((f > 0 ? x + 1 : x - 4) + kick, low ? y - 15 : y - 33, 4, 2, lamp, 1, 0.7);
    }
  }
  if (dead && e.t < 2.2) {
    // It goes down sparking.
    for (let i = 0; i < 3; i++) {
      const n = hash2(Math.floor(t * 24) + i * 7, x + i);
      if (n < 0.34 - e.t * 0.12) st.emit(x - 8 + Math.floor(n * 50), y - 4 - Math.floor(hash2(i, Math.floor(t * 31)) * 12), 1, 1, i % 2 ? GLOW.yellow : GLOW.cyan, 1, 0.9);
    }
  }
  if (e.aiming || e.state === 'fire') {
    // The tell: a line from the muzzle to where the burst will go.
    const [mx, my] = e.muzzle();
    const [ex, ey] = rayEnd(w, mx, my, e.aimX, e.aimY, 460);
    const hard = e.locked;
    const a = hard ? 0.85 : 0.22 + 0.18 * Math.sin(t * 40);
    seg(st, mx, my, ex, ey, ROUND, a);
    if (hard) st.emit(Math.round(ex) - 1, Math.round(ey) - 1, 3, 3, ROUND, 0.9, 0.8);
    if (e.state === 'fire') st.emit(Math.round(mx + f), Math.round(my) - 1, 3, 3, '#ffd9c8', 0.9, 0.9);
  }
}

// ---------------------------------------------------------------------------
// Containers, marks
// ---------------------------------------------------------------------------

const boxArt = new Map<string, Art>();

function drawBox(st: Stage, m: Mover): void {
  if (m.y + m.h < st.camY - 80) return;
  let a = boxArt.get(m.id);
  if (!a) {
    a = new Art(m.w, m.h);
    paintBox(a, 0, 0, 9100 + m.id.length * 131 + m.id.charCodeAt(m.id.length - 1));
    boxArt.set(m.id, a);
  }
  st.sprite(a, m.x, m.y);
}

function drawMark(st: Stage, m: Mark, t: number): void {
  const x = Math.round(m.x);
  const y = Math.round(m.y);
  if (m.id === 'latch') {
    // The hook plate on the spreader.
    st.rect(x - 2, y - 3, 6, 6, m.gone ? '#30363e' : '#c8a82a');
    st.rect(x - 2, y - 3, 6, 1, m.gone ? '#4a5260' : '#f0d060');
    if (!m.gone) st.rect(x, y - 1, 2, 2, '#1c1e22');
  }
  if (!m.armed || m.gone) return;
  // Brackets closing on it, so the eye finds it at once.
  const beat = 0.5 + 0.5 * Math.sin(t * 9);
  const r = m.r + 2 + Math.round(beat * 2);
  const col = m.hitT < 0.1 ? '#ffffff' : WARN;
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    st.emit(x + sx * r - (sx > 0 ? 2 : 0), y + sy * r, 3, 1, col, 0.9, 0.7);
    st.emit(x + sx * r, y + sy * r - (sy > 0 ? 2 : 0), 1, 3, col, 0.9, 0.7);
  }
  st.emit(x - 1, y - 1, 2, 2, col, 0.5 + 0.5 * beat, 0.8);
}

// ---------------------------------------------------------------------------
// The Undertow's warnings and what arrives on the deck
// ---------------------------------------------------------------------------

function drawWarnings(st: Stage, k: Kaiju, a: Attack, t: number): void {
  const deck = k.arena.deck;
  if (a.kind === 'slam' || a.kind === 'throw') {
    for (const z of a.zones) {
      if (z.landed) continue;
      // The marked stretch: a shadow that deepens over it, a lit edge along the deck that closes
      // from both ends as the time runs out, and arrows pointing down at it. Red for the last moment.
      const u = clamp01(a.t / z.at);
      const w = z.x1 - z.x0;
      const last = z.at - a.t < 0.35;
      const col = last ? ROUND : WARN;
      const blink = last ? 1 : 0.7 + 0.3 * Math.sin(t * (10 + u * 18));
      st.rect(z.x0, deck - 190, w, 190, '#020306', 0.06 + 0.14 * u);
      st.rect(z.x0, deck, w, 6, '#020306', 0.3 + 0.5 * u);
      st.emit(z.x0, deck - 1, w, 1, col, 0.3 * blink, 0.5);
      const run = Math.round((w / 2) * u);
      st.emit(z.x0, deck - 2, run, 2, col, blink, 0.8);
      st.emit(z.x1 - run, deck - 2, run, 2, col, blink, 0.8);
      for (const ex of [z.x0, z.x1 - 2]) {
        st.emit(ex, deck - 12, 2, 12, col, blink, 0.8);
        st.emit(ex === z.x0 ? ex : ex - 4, deck - 12, 6, 2, col, blink, 0.8);
      }
      const drop = Math.floor((t * 26) % 10);
      for (let x = z.x0 + 14; x < z.x1 - 8; x += 14) {
        for (let i = -2; i <= 2; i++) st.emit(x + i, deck - 36 + drop + (2 - Math.abs(i)), 1, 2, col, blink * 0.9, 0.8);
      }
      if (a.kind === 'throw') {
        // A container's outline, so it is clear what is coming.
        const top = deck - 30;
        for (const cx of [z.x0, z.x1 - 8]) st.emit(cx, top, 8, 1, col, blink, 0.7);
        st.emit(z.x0, top, 1, 8, col, blink, 0.7);
        st.emit(z.x1 - 1, top, 1, 8, col, blink, 0.7);
      }
    }
    return;
  }
  if (a.stage !== 'tell') return;
  // Sweep and wave cross the whole deck: arrows run along it the way the thing will come.
  const u = clamp01(a.t / a.tell);
  const wave = a.kind === 'wave';
  const col = wave ? '#9fd8ff' : WARN;
  const h = wave ? WAVE_H : SWEEP_H;
  const x0 = Math.max(k.arena.x0, st.camX - 20);
  const x1 = Math.min(k.arena.x1, st.camX + VIEW_W + 20);
  const drift = (t * 90 * a.dir) % 24;
  const blink = 0.5 + 0.5 * Math.sin(t * (9 + u * 14));
  const rows = wave ? [deck - 8, deck - 18] : [deck - 6];
  for (let x = Math.floor(x0 / 24) * 24 + drift; x < x1; x += 24) {
    for (const mid of rows) {
      for (let i = -2; i <= 2; i++) st.emit(x + a.dir * (2 - Math.abs(i)), mid + i, 1, 1, col, blink, 0.7);
    }
  }
  // How high it will reach.
  st.emit(x0, deck - h, x1 - x0, 1, col, 0.16 + 0.3 * u * blink, 0.5);
}

function drawWave(st: Stage, k: Kaiju, a: Attack, t: number): void {
  const deck = k.arena.deck;
  const lead = a.pos;
  for (let i = 0; i < WAVE_LEN; i += 2) {
    const x = a.dir > 0 ? lead - i - 2 : lead + i;
    const u = i / WAVE_LEN;
    // A steep front that curls, and a long back running out to nothing.
    const shape = u < 0.1 ? 0.5 + u * 6.5 : Math.pow(1 - (u - 0.1) / 0.9, 0.8) * 1.15;
    const h = Math.max(2, Math.round((WAVE_H + 8) * shape + Math.sin(t * 13 + i * 0.35) * 1.6));
    // Water you can see the quay through, darker at the foot; the white where it breaks carries its own light.
    st.rect(x, deck - h, 2, h + 2, '#6aa6cc', 0.45);
    st.rect(x, deck - Math.floor(h * 0.4), 2, Math.floor(h * 0.4) + 2, '#1c3c54', 0.45);
    const crest = u < 0.3 ? 4 : 2;
    st.emit(x, deck - h, 2, crest, '#cfe6f4', u < 0.3 ? 0.95 : 0.55, 0.8);
    if (hash2(i, Math.floor(t * 12)) < 0.22) st.emit(x, deck - Math.floor(h * hash2(i + 1, Math.floor(t * 7))), 1, 3, '#a8cce0', 0.5, 0.8);
    if (hash2(i + 7, Math.floor(t * 16)) < 0.35) st.emit(x, deck - h - 1 - Math.floor(hash2(i + 3, Math.floor(t * 9)) * 7), 1, 1, '#eaf6ff', 0.9, 0.9);
  }
  // The curl ahead of the front, and spray thrown forward from it.
  for (let j = 0; j < 7; j++) {
    st.emit(lead + a.dir * (j + 1) - (a.dir < 0 ? 1 : 0), deck - WAVE_H - 5 + j * 2, 2, 3, '#d8ecf8', 0.85 - j * 0.09, 0.85);
  }
  for (let i = 0; i < 16; i++) {
    const n = hash2(i, Math.floor(t * 20));
    st.emit(lead + a.dir * (3 + n * 30), deck - 3 - hash2(i + 9, Math.floor(t * 17)) * (WAVE_H + 14), 1, 1 + (i % 2), '#eaf6ff', 0.85, 0.9);
  }
  // White water left on the deck behind it.
  for (let i = 0; i < 20; i++) {
    const n = hash2(i, Math.floor(t * 6));
    const x = lead - a.dir * (WAVE_LEN + n * 160);
    st.emit(x, deck - 1, 3 + Math.floor(n * 6), 1, '#b8d4e4', 0.5 * (1 - n), 0.7);
  }
}

// ---------------------------------------------------------------------------
// Sol's rivet gun
// ---------------------------------------------------------------------------

function drawGun(st: Stage, w: World, c: Combat): void {
  const p = w.player;
  if (p.state === 'dead') return;
  const f = p.facing;
  const x = Math.round(p.drawX);
  const y = Math.round(p.drawY);
  // Dark metal: it sits right under her head lamp and would burn out otherwise.
  const steel = '#1b2028';
  const lit = '#39424f';
  const tank = '#8f7820';
  if (p.state !== 'normal') {
    // Slung across her back while her hands are busy.
    seg(st, x - f * 6, y - 14, x - f * 1, y - 25, steel, 1, false, 2);
    st.rect(x - f * 5 - (f > 0 ? 0 : 1), y - 19, 2, 3, tank);
    return;
  }
  if (p.crouching) {
    // Held low, out of the line of fire.
    seg(st, x + f * 2, y - 12, x + f * 10, y - 9, steel, 1, false, 2);
    st.rect(x + f * 4 - (f > 0 ? 0 : 2), y - 9, 3, 2, tank);
    return;
  }
  const kick = c.flash < 0.07 ? 1 : 0;
  const up = clamp(c.flash < 0.4 ? c.aimY : 0, -0.9, 0.6);
  const gx = x + f * (3 - kick);
  const gy = y - 25;
  const tx = gx + f * 10;
  const ty = Math.round(gy + up * 9);
  // A forearm brought up to the grip, so it reads as held.
  seg(st, x + f * 1, y - 21, gx + f * 2, gy + 1, '#8a4a1c', 1, false, 2);
  seg(st, gx, gy, tx, ty, steel, 1, false, 2);
  seg(st, gx + f * 1, gy, tx, ty, lit, 1, false, 1);
  st.rect(gx + (f > 0 ? 2 : -4), gy + 2, 3, 3, tank);
  st.rect(gx + (f > 0 ? 2 : -4), gy + 2, 3, 1, '#b89c30');
  st.rect(gx - (f > 0 ? 2 : -1), gy + 1, 2, 3, steel);
  if (c.flash < 0.06) {
    const [mx, my] = solMuzzle(p);
    st.emit(Math.round(mx + c.aimX * 3) - 1, Math.round(my + c.aimY * 3) - 1, 3, 3, '#fff6dc', 1, 0.95);
    seg(st, mx + c.aimX * 4, my + c.aimY * 4, mx + c.aimX * 11, my + c.aimY * 11, HOT, 0.9);
  } else if (c.pressure <= 0 && c.recharge > 0) {
    // Venting while it builds pressure.
    const n = Math.floor((1 - c.recharge) * 20);
    st.rect(gx + f * 4, gy - 2 - (n % 3), 1, 1, '#c4ccd6', 0.5);
  }
}

// ---------------------------------------------------------------------------
// Hooks called by the View
// ---------------------------------------------------------------------------

/** Behind the actors: the Undertow, containers, marks, Enforcers, warnings on the deck. */
export function drawCombatBack(st: Stage, w: World, t: number): void {
  const c = w.combat;
  if (!c) return;
  if (c.kaiju) drawKaiju(st, c.kaiju, t);
  for (const m of w.movers) if (m.kind === 'box') drawBox(st, m);
  for (const m of c.marks) drawMark(st, m, t);
  const a = c.kaiju?.attack;
  if (c.kaiju && a) drawWarnings(st, c.kaiju, a, t);
  for (const e of c.enforcers) {
    if (e.x < st.camX - 60 || e.x > st.camX + VIEW_W + 60) continue;
    if (!e.alive) drawEnforcer(st, e, w, t);
  }
  for (const e of c.enforcers) {
    if (e.x < st.camX - 60 || e.x > st.camX + VIEW_W + 60) continue;
    if (e.alive) drawEnforcer(st, e, w, t);
  }
}

/** In front of the actors: the gun, rounds in flight, water on the deck. */
export function drawCombatFront(st: Stage, w: World, t: number): void {
  const c = w.combat;
  if (!c) return;
  const p = w.player;
  if (c.armed) drawGun(st, w, c);
  if (c.invuln > 0.45 && p.state !== 'dead') st.emit(Math.round(p.drawX) - 6, Math.round(p.drawY) - 30, 12, 30, '#ff6a5a', 0.35, 0.7);
  for (const s of c.shots) {
    const d = Math.hypot(s.vx, s.vy) || 1;
    const ux = s.vx / d;
    const uy = s.vy / d;
    if (s.from === 'sol') {
      seg(st, s.x - ux * 16, s.y - uy * 16, s.x - ux * 6, s.y - uy * 6, EMBER, 0.55);
      seg(st, s.x - ux * 6, s.y - uy * 6, s.x, s.y, HOT, 1);
    } else {
      seg(st, s.x - ux * 12, s.y - uy * 12, s.x - ux * 4, s.y - uy * 4, ROUND, 0.5);
      seg(st, s.x - ux * 4, s.y - uy * 4, s.x, s.y, '#ffc0b0', 1);
    }
  }
  const k = c.kaiju;
  if (k) {
    const a = k.attack;
    if (a && a.kind === 'wave' && a.stage === 'strike') drawWave(st, k, a, t);
    for (const b of k.barbs) {
      if (!b.open()) continue;
      // The barb itself is part of the creature; this is the game telling you it can be hit.
      const beat = 0.5 + 0.5 * Math.sin(t * 8);
      const r = b.r + 3 + Math.round(beat * 2);
      const col = b.hitT < 0.1 ? '#ffffff' : BARB;
      for (const sx of [-1, 1]) {
        const bx = Math.round(b.x) + sx * r;
        st.emit(bx, Math.round(b.y) - 4, 1, 9, col, 0.85, 0.8);
        st.emit(sx > 0 ? bx - 2 : bx, Math.round(b.y) - 4, 3, 1, col, 0.85, 0.8);
        st.emit(sx > 0 ? bx - 2 : bx, Math.round(b.y) + 4, 3, 1, col, 0.85, 0.8);
      }
    }
  }
}

/** Lights the fight adds: muzzle flashes, lamps, glowing barbs, the floodlights turned on the channel. */
export function combatLights(w: World, camX: number, camY: number, t: number, out: Light[]): void {
  const c = w.combat;
  if (!c) return;
  const p = w.player;
  const add = (x: number, y: number, r: number, color: Vec3, falloff = 1.6): void => {
    if (x + r < camX - 40 || x - r > camX + VIEW_W + 40) return;
    out.push({ x: x - camX, y: y - camY, r, color, falloff });
  };
  if (c.armed && c.flash < 0.08 && p.state !== 'dead') {
    const [mx, my] = solMuzzle(p);
    add(mx, my, 62, [1.1, 0.8, 0.36], 1.5);
  }
  let n = 0;
  for (const s of c.shots) {
    if (n++ > 10) break;
    if (s.from === 'sol') add(s.x, s.y, 22, [0.9, 0.62, 0.26]);
    else add(s.x, s.y, 16, [0.8, 0.2, 0.15]);
  }
  for (const e of c.enforcers) {
    if (!e.alive) continue;
    const hot = e.state === 'aim' || e.state === 'fire';
    const col: Vec3 = hot ? [0.95, 0.2, 0.15] : [0.18, 0.6, 0.66];
    add(e.x + e.facing * 3, e.y - (e.up ? 32 : 14), hot ? 34 : 24, col);
    if (e.state === 'fire') {
      const [mx, my] = e.muzzle();
      add(mx, my, 46, [1.1, 0.5, 0.36], 1.4);
    }
  }
  for (const m of c.marks) {
    if (!m.armed || m.gone) continue;
    const k = 0.6 + 0.3 * Math.sin(t * 9);
    add(m.x, m.y, 40, [1.1 * k, 0.72 * k, 0.26 * k]);
  }
  if (c.kaiju) {
    const lamps = w.level.props.filter((q) => q.kind === 'floodtower').map((q): [number, number] => [q.x + 2, w.level.groundY - (q.h ?? 150) + 4]);
    for (const L of kaijuLights(c.kaiju, t, lamps)) {
      if (L.x + L.r < camX - 60 || L.x - L.r > camX + VIEW_W + 60) continue;
      out.push({ ...L, x: L.x - camX, y: L.y - camY });
    }
  }
}

// ---------------------------------------------------------------------------
// Events: what each one sounds like and throws up
// ---------------------------------------------------------------------------

export interface FxSound {
  sfx(name: string, vol?: number): void;
}

export interface FxDust {
  burst(kind: 'dust' | 'spark' | 'splash', x: number, y: number, n: number): void;
}

/** Turn one of the fight's events into sound and particles. Returns false if it was not one of ours. */
export function combatFx(f: Fx, sound: FxSound, v: FxDust, w: World): boolean {
  const wet = w.weather.rain > 0.2;
  switch (f.type) {
    case 'rivet':
      sound.sfx('rivet');
      break;
    case 'dry':
      sound.sfx('dry', 0.7);
      break;
    case 'recharge':
      sound.sfx('recharge', 0.7);
      break;
    case 'round':
      sound.sfx('rifle', 0.6);
      break;
    case 'ricochet':
      sound.sfx('ricochet', f.a ? 0.45 : 0.7);
      v.burst('spark', f.x, f.y, f.a ? 3 : 5);
      break;
    case 'deflect':
      sound.sfx('ricochet', 0.9);
      v.burst('spark', f.x, f.y, 6);
      break;
    case 'clank':
    case 'barbhit':
      sound.sfx('clank');
      v.burst('spark', f.x, f.y, 7);
      break;
    case 'hurt':
      sound.sfx('hit');
      v.burst('spark', f.x, f.y, 4);
      break;
    case 'heal':
      sound.sfx('heal', 0.5);
      break;
    case 'aim':
      sound.sfx('aim', 0.55);
      break;
    case 'wreck':
      sound.sfx('wreck');
      v.burst('spark', f.x, f.y, 16);
      v.burst('dust', f.x, f.y + 14, 4);
      break;
    case 'snap':
    case 'unlatch':
      sound.sfx('unlatch');
      v.burst('spark', f.x, f.y, 9);
      break;
    case 'crash':
      sound.sfx('crash');
      v.burst('dust', f.x - 24, f.y, 8);
      v.burst('dust', f.x + 24, f.y, 8);
      v.burst('spark', f.x, f.y - 4, 10);
      if (wet) v.burst('splash', f.x, f.y, 12);
      break;
    case 'warn':
      sound.sfx(f.a === 2 ? 'swell' : f.a === 1 ? 'scrape' : 'warn', 0.7);
      break;
    case 'slam':
      sound.sfx('slam');
      for (const dx of [-34, -14, 10, 30]) v.burst('dust', f.x + dx, f.y, 5);
      if (wet) for (const dx of [-40, -20, 0, 20, 40]) v.burst('splash', f.x + dx, f.y, 6);
      break;
    case 'stun':
      sound.sfx('slam', 0.8);
      for (const dx of [-60, -30, 0, 30, 60]) v.burst('dust', f.x + dx, f.y, 4);
      break;
    case 'sweep':
      sound.sfx('scrape');
      break;
    case 'wave':
      sound.sfx('wave');
      break;
    case 'roar':
      sound.sfx(f.a === 1 ? 'roar' : 'call', f.a === 2 ? 0.8 : 1);
      break;
    case 'barb':
      sound.sfx('barb');
      v.burst('spark', f.x, f.y, 18);
      break;
    default:
      return false;
  }
  return true;
}
