import { shade } from '../core/color';
import { clamp, clamp01, easeInOut, lerp, TAU } from '../core/math';
import type { Art } from '../gfx/art';

/**
 * Procedural pixel characters.
 *
 * A character is a small jointed puppet: legs and (optionally) arms are
 * solved with two-bone IK from foot/hand targets, then rasterised with
 * aliased lines straight onto the pixel grid. Because poses are continuous
 * functions of a phase, motion is fluid rather than a handful of frames.
 */

export type HairStyle = 'short' | 'bob' | 'bun' | 'cap' | 'beanie' | 'hood' | 'long' | 'elder' | 'visor';

export interface PuppetLook {
  scale?: number;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  top: string;
  bottom: string;
  shoes: string;
  /** Extra coat length below the hip, in px. */
  coat?: number;
  /** Reflective tape colour across chest and sleeve. */
  stripe?: string;
  pack?: 'radio' | 'bag';
  packColor?: string;
  hat?: string;
  apron?: string;
  /** Emissive band on the far arm (authority officers). */
  armband?: string;
  headlamp?: boolean;
  umbrella?: string;
  /** Render as a flat silhouette of this colour (distant crowds). */
  flat?: string;
}

export type Anim =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'fall'
  | 'land'
  | 'crouch'
  | 'brace'
  | 'hang'
  | 'climb'
  | 'ladder'
  | 'sit'
  | 'talk'
  | 'reach'
  | 'lean'
  | 'cook'
  | 'kneel';

export interface PuppetPose {
  anim: Anim;
  /** Cycle phase 0..1 (walk / run / ladder) or progress 0..1 (land / climb). */
  phase: number;
  /** Free-running seconds, for breathing and small idle motion. */
  t: number;
  /** Antenna tip offset from secondary-motion spring. */
  antX?: number;
  /** 0..1 blend toward a faster gait (walk → run handled by caller choosing anim). */
  blink?: boolean;
}

type P2 = [number, number];
type Arm = { ik: P2 } | { sh: number; el: number };

interface Solved {
  hx: number;
  hy: number;
  lean: number;
  fNear: P2;
  fFar: P2;
  aNear: Arm;
  aFar: Arm;
  headX: number;
  headY: number;
  /** Extra root offset (climb). */
  rx: number;
  ry: number;
}

const THIGH = 6;
const SHIN = 6;
const UARM = 5;
const FARM = 5;
const TORSO = 9;
const STAND_HIP = -14;

/** Two-bone IK; returns the middle joint. `fwd` > 0 bends it toward +x. */
function ik2(ax: number, ay: number, tx: number, ty: number, l1: number, l2: number, fwd: number): P2 {
  let dx = tx - ax;
  let dy = ty - ay;
  let d = Math.hypot(dx, dy);
  const max = l1 + l2 - 0.05;
  if (d > max) {
    dx *= max / d;
    dy *= max / d;
    d = max;
  }
  if (d < 0.01) {
    d = 0.01;
    dy = 0.01;
  }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const mx = ax + (dx * a) / d;
  const my = ay + (dy * a) / d;
  const px = -dy / d;
  const py = dx / d;
  const x1 = mx + px * h;
  const x2 = mx - px * h;
  return (x1 - x2) * fwd >= 0 ? [x1, my + py * h] : [x2, my - py * h];
}

/** Foot path for a gait: planted while the body passes over it, then swung forward. */
function gaitFoot(ph: number, reach: number, stance: number, lift: number, kick: number): P2 {
  ph -= Math.floor(ph);
  if (ph < stance) {
    return [lerp(reach, -reach, ph / stance), -2];
  }
  const u = (ph - stance) / (1 - stance);
  const e = easeInOut(u);
  // The foot lifts early (heel kick) and reaches forward late.
  const y = -2 - lift * Math.sin(Math.PI * Math.pow(u, 0.75)) - kick * Math.sin(Math.PI * clamp01(u * 1.6));
  return [lerp(-reach, reach, e), y];
}

function solve(p: PuppetPose): Solved {
  const s: Solved = {
    hx: 0,
    hy: STAND_HIP,
    lean: 0,
    fNear: [1.5, -2],
    fFar: [-1.5, -2],
    aNear: { sh: 0.08, el: 0.18 },
    aFar: { sh: -0.06, el: 0.14 },
    headX: 0,
    headY: 0,
    rx: 0,
    ry: 0,
  };
  const ph = p.phase;
  const breathe = Math.sin(p.t * 1.9) > 0.55 ? 1 : 0;
  switch (p.anim) {
    case 'idle': {
      s.headY = breathe ? 0 : 0;
      s.hy = STAND_HIP + (breathe ? 0.6 : 0);
      break;
    }
    case 'talk': {
      const g = Math.sin(p.t * 5.1) * 0.5 + 0.5;
      s.hy = STAND_HIP + (breathe ? 0.6 : 0);
      s.aNear = { sh: 0.5 + g * 0.5, el: 1.3 + g * 0.5 };
      s.headY = Math.sin(p.t * 6.3) > 0.7 ? 1 : 0;
      break;
    }
    case 'walk': {
      s.fNear = gaitFoot(ph, 6, 0.56, 2.6, 0);
      s.fFar = gaitFoot(ph + 0.5, 6, 0.56, 2.6, 0);
      s.hy = STAND_HIP + 0.4 - 0.9 * Math.cos(ph * TAU * 2);
      s.lean = 0.05;
      const sw = Math.sin(ph * TAU);
      s.aNear = { sh: sw * 0.5, el: 0.25 + Math.max(0, sw) * 0.3 };
      s.aFar = { sh: -sw * 0.5, el: 0.25 + Math.max(0, -sw) * 0.3 };
      break;
    }
    case 'run': {
      s.fNear = gaitFoot(ph, 7.5, 0.36, 3.2, 3.6);
      s.fFar = gaitFoot(ph + 0.5, 7.5, 0.36, 3.2, 3.6);
      s.hy = STAND_HIP + 0.6 - 1.6 * Math.abs(Math.sin(ph * TAU));
      s.lean = 0.26;
      const sw = Math.sin(ph * TAU + 0.4);
      s.aNear = { sh: sw * 1.05, el: 1.45 };
      s.aFar = { sh: -sw * 1.05, el: 1.45 };
      s.headX = 0.5;
      break;
    }
    case 'jump': {
      s.fNear = [3, -5.5];
      s.fFar = [-2.5, -3];
      s.hy = STAND_HIP;
      s.lean = 0.12;
      s.aNear = { sh: 2.2, el: 0.5 };
      s.aFar = { sh: -0.9, el: 0.6 };
      break;
    }
    case 'fall': {
      const w = Math.sin(p.t * 14) * 0.6;
      s.fNear = [2.5 + w * 0.5, -2.5];
      s.fFar = [-3, -3.5 - w * 0.5];
      s.hy = STAND_HIP - 0.5;
      s.lean = -0.05;
      s.aNear = { sh: 2.5 + w * 0.2, el: 0.35 };
      s.aFar = { sh: -2.3 - w * 0.2, el: 0.35 };
      break;
    }
    case 'land': {
      const k = 1 - easeInOut(clamp01(ph));
      s.hy = STAND_HIP + 4.5 * k;
      s.lean = 0.3 * k;
      s.fNear = [3, -2];
      s.fFar = [-3, -2];
      s.aNear = { sh: 0.5 * k, el: 0.6 * k + 0.18 };
      s.aFar = { sh: -0.6 * k, el: 0.5 * k + 0.14 };
      s.headY = Math.round(k);
      break;
    }
    case 'crouch': {
      s.hy = -8;
      s.lean = 0.42;
      s.fNear = [3.5, -2];
      s.fFar = [-3, -2];
      s.aNear = { ik: [5.5, -7] };
      s.aFar = { ik: [1, -6] };
      s.headY = 1;
      s.headX = 0.5;
      break;
    }
    case 'brace': {
      s.hy = -8.5;
      s.lean = 0.5;
      s.fNear = [4.5, -2];
      s.fFar = [-4, -2];
      s.aNear = { ik: [7, -19 + Math.sin(p.t * 9) * 0.5] };
      s.aFar = { ik: [2, -7] };
      s.headY = 1;
      s.headX = 1;
      break;
    }
    case 'kneel': {
      s.hy = -8;
      s.lean = 0.2;
      s.fNear = [4, -2];
      s.fFar = [-4.5, -2];
      const w = Math.sin(p.t * 6) * 0.8;
      s.aNear = { ik: [7, -11 + w] };
      s.aFar = { ik: [6, -8 - w] };
      s.headY = 1;
      break;
    }
    case 'hang': {
      const sway = Math.sin(p.t * 2.2) * 0.7;
      s.hy = -15;
      s.fNear = [1 + sway, -2.5];
      s.fFar = [-0.5 + sway * 0.6, -1.5];
      s.aNear = { ik: [5, -31] };
      s.aFar = { ik: [4, -31] };
      s.headY = 1;
      break;
    }
    case 'climb': {
      // Root travels from the hang position up and over the ledge.
      const u = clamp01(ph);
      const rise = easeInOut(clamp01(u / 0.72));
      const over = easeInOut(clamp01((u - 0.4) / 0.6));
      s.ry = lerp(0, -31, rise);
      s.rx = lerp(0, 9, over);
      // Hands stay on the ledge corner (5, -31 in hang space) until the body is over it.
      const handY = -31 - s.ry;
      const handX = 5 - s.rx;
      const lift = Math.sin(Math.PI * clamp01((u - 0.3) / 0.6));
      s.hy = STAND_HIP + 5 * lift * (1 - over * 0.4);
      s.lean = 0.5 * lift;
      s.fNear = [2 + 3 * lift, -2 - 4 * lift * (1 - over)];
      s.fFar = [-2, -2 - 1.5 * lift * (1 - over)];
      if (u < 0.78) {
        s.aNear = { ik: [handX, Math.min(-6, handY)] };
        s.aFar = { ik: [handX - 1, Math.min(-6, handY)] };
      }
      s.headY = lift > 0.5 ? 1 : 0;
      break;
    }
    case 'ladder': {
      const a = Math.sin(ph * TAU);
      const b = Math.sin(ph * TAU + Math.PI);
      s.hx = -1;
      s.hy = STAND_HIP + 1;
      s.fNear = [2.5, -3 - Math.max(0, a) * 3.5];
      s.fFar = [2, -3 - Math.max(0, b) * 3.5];
      s.aNear = { ik: [4.5, -23 - Math.max(0, b) * 4] };
      s.aFar = { ik: [4, -23 - Math.max(0, a) * 4] };
      s.lean = 0.08;
      break;
    }
    case 'sit': {
      s.hy = -9;
      s.fNear = [5.5, -2];
      s.fFar = [4.5, -2];
      s.lean = 0.1;
      const w = Math.sin(p.t * 1.3 + ph * TAU) > 0.75 ? 1 : 0;
      s.aNear = { ik: [6, -12 - w * 3] };
      s.aFar = { ik: [5, -11] };
      s.headY = breathe ? 1 : 0;
      break;
    }
    case 'cook': {
      const w = Math.sin(p.t * 7 + ph * TAU);
      s.hy = STAND_HIP + 0.5;
      s.lean = 0.14;
      s.aNear = { ik: [7 + w * 1.5, -15 + Math.abs(w)] };
      s.aFar = { ik: [5 - w, -14] };
      break;
    }
    case 'reach': {
      const k = Math.sin(Math.PI * clamp01(ph));
      s.lean = 0.14 * k;
      s.aNear = { ik: [lerp(2, 8, k), lerp(-12, -18, k)] };
      break;
    }
    case 'lean': {
      s.lean = -0.12;
      s.hx = -0.5;
      s.fNear = [3, -2];
      s.fFar = [0.5, -2];
      s.aNear = { ik: [2.5, -15] };
      s.aFar = { ik: [1.5, -15] };
      s.headY = breathe ? 1 : 0;
      break;
    }
  }
  return s;
}

export const PUPPET_W = 48;
export const PUPPET_H = 56;
/** Where the puppet's feet sit inside its scratch surface. */
export const PUPPET_OX = 24;
export const PUPPET_OY = 50;

/**
 * Draw a puppet facing right, with its feet centred at (ox, oy) — oy is the
 * ground row, so the lowest body pixel lands on oy - 1.
 */
export function drawPuppet(a: Art, ox: number, oy: number, L: PuppetLook, p: PuppetPose): void {
  const sc = L.scale ?? 1;
  const s = solve(p);
  const flat = L.flat;
  const X = (v: number): number => ox + (v + s.rx) * sc;
  const Y = (v: number): number => oy + (v + s.ry) * sc;
  const col = (c: string, k = 1): string => flat ?? (k === 1 ? c : shade(c, k));
  const legTh = sc > 0.85 ? 3 : 2;
  const shinTh = 2;
  const armTh = 2;

  const hipX = s.hx;
  const hipY = s.hy;
  const sdx = Math.sin(s.lean) * TORSO;
  const sdy = -Math.cos(s.lean) * TORSO;
  const shX = hipX + sdx;
  const shY = hipY + sdy;

  const drawLeg = (foot: P2, dark: boolean): void => {
    const k = dark ? 0.68 : 1;
    const knee = ik2(hipX, hipY, foot[0], foot[1], THIGH, SHIN, 1);
    a.line(X(hipX), Y(hipY), X(knee[0]), Y(knee[1]), col(L.bottom, k), legTh);
    a.line(X(knee[0]), Y(knee[1]), X(foot[0]), Y(foot[1]), col(L.bottom, k * 0.92), shinTh);
    const fx = Math.round(X(foot[0]));
    const fy = Math.round(Y(foot[1]));
    a.rect(fx - 1, fy, 3, 1, col(L.shoes, k));
    a.rect(fx - 1, fy + 1, 4, 1, col(L.shoes, k * 0.8));
  };

  const armJoints = (arm: Arm, sx: number, sy: number): [P2, P2] => {
    if ('ik' in arm) {
      const el = ik2(sx, sy, arm.ik[0], arm.ik[1], UARM, FARM, -1);
      const d = Math.hypot(arm.ik[0] - sx, arm.ik[1] - sy);
      const max = UARM + FARM - 0.05;
      const hand: P2 = d > max ? [sx + ((arm.ik[0] - sx) * max) / d, sy + ((arm.ik[1] - sy) * max) / d] : arm.ik;
      return [el, hand];
    }
    const a1 = arm.sh + s.lean * 0.5;
    const ex = sx + Math.sin(a1) * UARM;
    const ey = sy + Math.cos(a1) * UARM;
    const a2 = a1 + arm.el;
    return [
      [ex, ey],
      [ex + Math.sin(a2) * FARM, ey + Math.cos(a2) * FARM],
    ];
  };

  const drawArm = (arm: Arm, dark: boolean): void => {
    // The near arm is a touch darker than the torso so it separates from it.
    const k = dark ? 0.62 : 0.88;
    const sx = shX + (dark ? -0.5 : 0.5);
    const sy = shY + 1.5;
    const [el, hand] = armJoints(arm, sx, sy);
    a.line(X(sx), Y(sy), X(el[0]), Y(el[1]), col(L.top, k), armTh);
    a.line(X(el[0]), Y(el[1]), X(hand[0]), Y(hand[1]), col(L.top, k * 0.94), armTh);
    if (L.stripe && !dark && !flat) a.px(Math.round(X(el[0])), Math.round(Y(el[1])), L.stripe);
    if (L.armband && dark && !flat) {
      const mx = Math.round(X((sx + el[0]) / 2));
      const my = Math.round(Y((sy + el[1]) / 2));
      a.emit(mx, my, 2, 1, L.armband, 0.5);
    }
    a.rect(Math.round(X(hand[0])), Math.round(Y(hand[1])), 2, 2, col(L.skin, k));
  };

  // --- back to front ---
  drawArm(s.aFar, true);
  drawLeg(s.fFar, true);

  // Backpack sits behind the torso.
  let packTop: P2 | null = null;
  if (L.pack && !flat) {
    const pc = L.packColor ?? '#4d5a5e';
    const bx = Math.round(X(hipX + sdx * 0.55 - 6));
    const by = Math.round(Y(hipY + sdy * 0.95));
    if (L.pack === 'radio') {
      a.rect(bx, by, 4, 7, pc);
      a.rect(bx, by, 4, 1, shade(pc, 1.3));
      a.rect(bx, by + 6, 4, 1, shade(pc, 0.7));
      a.rect(bx, by + 1, 1, 5, shade(pc, 0.8));
      a.epx(bx + 2, by + 2, '#55ff9c', 0.6);
      packTop = [bx + 1, by];
    } else {
      a.rect(bx + 1, by + 1, 3, 6, pc);
      a.rect(bx + 1, by + 1, 3, 1, shade(pc, 1.25));
    }
  }

  drawLeg(s.fNear, false);

  // Torso, drawn as rows so a lean shears it cleanly.
  const rows = Math.max(2, Math.round(TORSO * sc));
  for (let i = 0; i <= rows; i++) {
    const u = i / rows;
    const tx = Math.round(X(hipX + sdx * u)) - 3;
    const ty = Math.round(Y(hipY + sdy * u));
    const wide = u > 0.45 ? 6 : 5;
    a.rect(tx, ty, wide, 1, col(L.top));
    if (!flat) {
      a.px(tx, ty, shade(L.top, 0.74));
      if (u > 0.5) a.px(tx + wide - 1, ty, shade(L.top, 1.14));
      if (L.apron && u < 0.75) a.rect(tx + 2, ty, wide - 2, 1, L.apron);
    }
  }
  if (L.stripe && !flat) {
    const u = 0.52;
    a.rect(Math.round(X(hipX + sdx * u)) - 3, Math.round(Y(hipY + sdy * u)), 6, 1, L.stripe);
  }
  // Coat or jacket hem over the thighs.
  const hem = L.coat ?? 0;
  if (hem > 0) {
    const moving = p.anim === 'run' ? 1.5 : p.anim === 'walk' ? 0.5 : 0;
    for (let i = 1; i <= hem; i++) {
      const hx2 = Math.round(X(hipX - (i / hem) * moving)) - 3;
      a.rect(hx2, Math.round(Y(hipY)) + i, 6, 1, col(L.top, i === hem ? 0.8 : 0.92));
      if (L.apron && !flat) a.rect(hx2 + 2, Math.round(Y(hipY)) + i, 4, 1, L.apron);
    }
  }

  // Head.
  const hcx = Math.round(X(shX + Math.sin(s.lean) * 2 + s.headX));
  const htop = Math.round(Y(shY)) - 7 + Math.round(s.headY * sc);
  const hx0 = hcx - 2;
  if (flat) {
    a.rect(hx0, htop, 5, 6, flat);
    a.rect(hx0 + 1, htop - 1, 3, 1, flat);
  } else {
    const hair = L.hair;
    // Five rows of full-width head, then a narrower chin row so the jaw tapers.
    a.rect(hx0, htop, 5, 5, L.skin);
    a.rect(hx0, htop + 5, 4, 1, L.skin);
    a.rect(hx0 + 1, htop + 6, 3, 1, shade(L.skin, 0.8)); // neck
    switch (L.hairStyle) {
      case 'short':
        a.rect(hx0, htop - 1, 5, 2, hair);
        a.rect(hx0, htop + 1, 1, 3, hair);
        break;
      case 'bob':
        a.rect(hx0, htop - 1, 5, 2, hair);
        a.rect(hx0, htop + 1, 2, 5, hair);
        a.px(hx0 + 4, htop + 1, hair);
        break;
      case 'long':
        a.rect(hx0, htop - 1, 5, 2, hair);
        a.rect(hx0 - 1, htop + 1, 2, 8, hair);
        break;
      case 'bun':
        a.rect(hx0, htop - 1, 5, 2, hair);
        a.rect(hx0, htop + 1, 1, 3, hair);
        a.rect(hx0 - 1, htop - 2, 2, 2, hair);
        break;
      case 'elder':
        a.rect(hx0, htop, 2, 4, hair);
        a.rect(hx0, htop - 1, 4, 1, hair);
        break;
      case 'beanie':
        a.rect(hx0, htop - 1, 5, 3, L.hat ?? hair);
        a.rect(hx0, htop + 1, 5, 1, shade(L.hat ?? hair, 0.75));
        a.rect(hx0, htop + 2, 1, 3, hair);
        break;
      case 'cap':
        a.rect(hx0, htop - 1, 5, 2, L.hat ?? hair);
        a.rect(hx0 + 3, htop + 1, 4, 1, shade(L.hat ?? hair, 0.8));
        a.rect(hx0, htop + 1, 1, 3, hair);
        break;
      case 'visor':
        a.rect(hx0, htop - 1, 5, 2, L.hat ?? hair);
        a.rect(hx0 - 1, htop, 1, 1, L.hat ?? hair);
        a.rect(hx0 + 3, htop + 1, 3, 1, shade(L.hat ?? hair, 0.6));
        a.rect(hx0, htop + 1, 1, 3, hair);
        break;
      case 'hood':
        a.rect(hx0 - 1, htop - 1, 6, 2, L.top);
        a.rect(hx0 - 1, htop + 1, 3, 6, L.top);
        a.px(hx0 - 1, htop - 1, shade(L.top, 0.74));
        break;
    }
    if (!p.blink) a.px(hx0 + 3, htop + 2, '#1a1418');
    if (L.headlamp) {
      // Strap across the brow, lamp sitting proud of the forehead.
      a.rect(hx0, htop + 1, 5, 1, '#2a2e36');
      a.epx(hx0 + 5, htop + 1, '#fff2c8', 0.8);
    }
  }

  drawArm(s.aNear, false);

  // Whip antenna with a spring-driven tip.
  if (packTop && L.pack === 'radio') {
    const tip = (p.antX ?? 0) * 1.0;
    const len = 12;
    let prevX = packTop[0];
    let prevY = packTop[1];
    for (let i = 1; i <= len; i++) {
      const u = i / len;
      const nx = Math.round(packTop[0] + tip * u * u);
      const ny = packTop[1] - i;
      a.line(prevX, prevY, nx, ny, '#1b2026', 1);
      prevX = nx;
      prevY = ny;
    }
    if (Math.sin(p.t * 3.4) > -0.2) a.epx(prevX, prevY, '#ff5a4d', 0.7);
    else a.px(prevX, prevY, '#5a1d1a');
  }

  if (L.umbrella) {
    const ux = hcx + 1;
    const uy = htop - 6;
    const uc = col(L.umbrella);
    a.rect(ux - 9, uy + 2, 19, 1, col(L.umbrella, 0.8));
    a.rect(ux - 8, uy + 1, 17, 1, uc);
    a.rect(ux - 6, uy, 13, 1, uc);
    a.rect(ux - 3, uy - 1, 7, 1, col(L.umbrella, 1.15));
    a.rect(ux, uy + 2, 1, 14, flat ?? '#20242c');
  }
}

/** Critically-damped-ish spring used for antenna and cloth follow-through. */
export class Spring {
  x = 0;
  v = 0;
  step(accel: number, dt: number, stiffness = 90, damping = 9): void {
    this.v += (-stiffness * this.x - damping * this.v + accel) * dt;
    this.x += this.v * dt;
    this.x = clamp(this.x, -6, 6);
  }
}
