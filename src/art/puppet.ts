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
 *
 * People differ in build, age and dress, and at thirty pixels tall that has
 * to show in the silhouette. A look resolves to a `Frame` (bone lengths and
 * girth); poses are authored once for the default body and fitted to it.
 */

export type HairStyle =
  | 'short'
  | 'bob'
  | 'bun'
  | 'cap'
  | 'beanie'
  | 'hood'
  | 'long'
  | 'elder'
  | 'visor'
  | 'bald'
  | 'balding'
  | 'buzz'
  | 'spiky'
  | 'curly'
  | 'afro'
  | 'ponytail'
  | 'pigtails'
  | 'braid'
  | 'topknot'
  | 'flatcap'
  | 'hardhat'
  | 'brim'
  | 'swimcap'
  | 'headscarf';

export type Build = 'slim' | 'average' | 'broad' | 'stocky' | 'heavy';
export type Age = 'child' | 'teen' | 'adult' | 'elder';

export interface PuppetLook {
  scale?: number;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  top: string;
  bottom: string;
  shoes: string;

  // --- body ---
  /** Girth and limb thickness. Default 'average'. */
  build?: Build;
  /** Life stage: children are short-limbed under a full-size head; elders stoop and take short steps. */
  age?: Age;
  /** 'f' draws fuller hips under a narrower shoulder line, 'm' a squarer upper back: one pixel each way, no more. */
  gender?: 'f' | 'm';
  /** Standing height in px relative to the norm for the age (about -4 .. +5), shared by legs, torso and arms. */
  height?: number;
  /** Paunch in px in front of the torso. 'stocky' and 'heavy' builds bring their own. */
  belly?: number;
  /** Forward curve of the upper back in px. Elders default to 2. */
  stoop?: number;

  // --- dress ---
  /** Extra coat length below the hip, in px. From 6 up it is a long coat that drapes over the legs. */
  coat?: number;
  /** How much of the arm the top covers; the rest is skin. Default 'long'. */
  sleeves?: 'long' | 'short' | 'none';
  /** How much of the leg the bottom covers; the rest is skin. Default 'long'. */
  legs?: 'long' | 'shorts' | 'bare';
  /** Skirt length below the hip in px; it stretches with the stride. */
  skirt?: number;
  /** Skirt colour. Without it the skirt takes the top's colour and reads as a dress. */
  skirtColor?: string;
  /** Bib and braces in the bottom's colour over the top (dungarees, work overalls). */
  overalls?: boolean;
  /** Shirt showing at the collar and down the front of a jacket. */
  shirt?: string;
  tie?: string;
  /** Hood lying on the shoulders. A raised hood is the 'hood' hair style. */
  hoodDown?: boolean;
  /**
   * Swimwear, worn like people walking home from the bathhouse: 'trunks' bares
   * the chest and legs below short trunks in the bottom's colour, 'onepiece'
   * is a suit in the top's colour with bare arms and legs. Ignored for children.
   */
  swim?: 'trunks' | 'onepiece';
  /** Stripped to the waist over ordinary trousers, the way men sit out a hot night at a stall. Ignored for children. */
  bare?: boolean;
  /** Tattoo ink colour, down a bare shoulder, flank and upper arm. */
  ink?: string;
  /** Shoe colour carried this many px up the shin (wellingtons, work boots). */
  boots?: number;
  /** Open footwear: a sole in the shoe colour under a bare foot. */
  sandals?: boolean;
  /** Reflective tape colour across chest and sleeve. */
  stripe?: string;
  apron?: string;
  /** Emissive band on the far arm (authority officers). */
  armband?: string;

  // --- head ---
  hat?: string;
  /** Facial hair in the hair colour. */
  beard?: 'stubble' | 'moustache' | 'full' | 'long';
  /** 'goggles' sit pushed up on the forehead. */
  eyewear?: 'glasses' | 'shades' | 'goggles';
  /** Face mask colour. */
  mask?: string;
  /** Over-ear headphones colour. */
  headphones?: string;
  headlamp?: boolean;

  // --- carried ---
  scarf?: string;
  /** Towel round the neck, ends down the chest. */
  towel?: string;
  pack?: 'radio' | 'bag' | 'satchel';
  packColor?: string;
  /** Walking cane colour. Held in the near hand and planted on the ground. */
  cane?: string;
  /** Something in the near hand: a shopping bag or a briefcase. */
  carry?: 'bag' | 'case';
  carryColor?: string;
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

// The default body, which every pose below is authored against. LEG is the
// thigh and again the shin; ARM is the upper arm and again the forearm.
const LEG = 6;
const ARM = 5;
const TORSO = 9;
const STAND_HIP = -14;

/** Coats this long stop being a jacket hem and hang over the legs like a skirt. */
const LONG_COAT = 6;

interface BuildSpec {
  /** Torso depth behind and in front of the spine column, in px. */
  back: number;
  front: number;
  /** Extra px in front at chest height. */
  chest: number;
  /** Extra px behind at shoulder height. */
  yoke: number;
  belly: number;
  thigh: number;
  shin: number;
  arm: number;
  fore: number;
  /** Height the build adds on its own. */
  dh: number;
  /** Extra half-width of the stance. */
  spread: number;
  stride: number;
}

const BUILDS: Record<Build, BuildSpec> = {
  slim: { back: 2, front: 2, chest: 1, yoke: 0, belly: 0, thigh: 2, shin: 2, arm: 2, fore: 2, dh: 0, spread: 0, stride: 1 },
  average: { back: 3, front: 2, chest: 1, yoke: 0, belly: 0, thigh: 3, shin: 2, arm: 2, fore: 2, dh: 0, spread: 0, stride: 1 },
  broad: { back: 3, front: 2, chest: 2, yoke: 1, belly: 0, thigh: 3, shin: 2, arm: 3, fore: 2, dh: 0, spread: 0.5, stride: 1 },
  stocky: { back: 3, front: 3, chest: 1, yoke: 0, belly: 1, thigh: 3, shin: 3, arm: 3, fore: 2, dh: -1.5, spread: 0.5, stride: 0.95 },
  heavy: { back: 4, front: 3, chest: 1, yoke: 0, belly: 3, thigh: 4, shin: 3, arm: 3, fore: 3, dh: 0, spread: 1, stride: 0.9 },
};

/** Bone lengths and girth of one person: a pure function of the look. */
interface Frame {
  /** Length of the thigh, and of the shin. */
  leg: number;
  /** Length of the upper arm, and of the forearm. */
  arm: number;
  torso: number;
  /** Leg and arm length relative to the default body. */
  ls: number;
  as: number;
  /** Step length relative to the default body, and the cadence that keeps the feet from sliding. */
  stride: number;
  cadence: number;
  /** How much bounce the gait has (elders shuffle). */
  spring: number;
  back: number;
  front: number;
  chest: number;
  yoke: number;
  belly: number;
  stoop: number;
  /** Px the hip sinks because the knees never quite straighten. */
  knee: number;
  spread: number;
  thighTh: number;
  shinTh: number;
  armTh: number;
  foreTh: number;
  fem: boolean;
  /** Exactly the default body: poses are used as authored. */
  plain: boolean;
}

function frameOf(L: PuppetLook): Frame {
  const B = BUILDS[L.build ?? 'average'];
  const child = L.age === 'child';
  const elder = L.age === 'elder';
  const fem = L.gender === 'f';
  // People shrink a little with age, and teenagers have not finished growing.
  const dh = (L.height ?? 0) + B.dh + (elder || L.age === 'teen' ? -1 : 0);
  // Height goes mostly into the legs, as it does on real people.
  const leg = (child ? 4 : LEG) + dh * 0.3;
  const arm = (child ? 3.5 : ARM) + dh * 0.2;
  const ls = leg / LEG;
  const stride = clamp(ls, 0.5, 1.2) * B.stride * (elder ? 0.72 : 1);
  const thin = child ? 1 : 0;
  return {
    leg,
    arm,
    torso: (child ? 6 : TORSO) + dh * 0.4,
    ls,
    as: arm / ARM,
    stride,
    cadence: 1 / stride,
    spring: elder ? 0.6 : 1,
    back: Math.max(2, B.back - thin),
    front: B.front,
    chest: B.chest,
    // A man's upper back is a pixel squarer, unless the build already squares it.
    yoke: B.yoke + (L.gender === 'm' && B.yoke === 0 && !child ? 1 : 0),
    belly: L.belly ?? (child ? 0 : B.belly),
    stoop: L.stoop ?? (elder ? 2 : 0),
    knee: elder ? 1 : 0,
    spread: B.spread,
    thighTh: Math.max(2, B.thigh - thin),
    shinTh: Math.max(2, B.shin - thin),
    armTh: Math.max(2, B.arm - thin),
    foreTh: Math.max(2, B.fore - thin),
    fem,
    plain: B === BUILDS.average && (L.age ?? 'adult') === 'adult' && !L.gender && !L.height && !L.belly && !L.stoop,
  };
}

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

function solve(p: PuppetPose, F: Frame): Solved {
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
      // The world advances the phase by distance, so a shorter step has to come round sooner.
      const g = ph * F.cadence;
      const reach = 6 * F.stride;
      s.fNear = gaitFoot(g, reach, 0.56, 2.6 * F.spring, 0);
      s.fFar = gaitFoot(g + 0.5, reach, 0.56, 2.6 * F.spring, 0);
      s.hy = STAND_HIP + 0.4 - 0.9 * F.spring * Math.cos(g * TAU * 2);
      s.lean = 0.05;
      const sw = Math.sin(g * TAU);
      s.aNear = { sh: sw * 0.5 * F.spring, el: 0.25 + Math.max(0, sw) * 0.3 };
      s.aFar = { sh: -sw * 0.5 * F.spring, el: 0.25 + Math.max(0, -sw) * 0.3 };
      break;
    }
    case 'run': {
      const g = ph * F.cadence;
      const reach = 7.5 * F.stride;
      s.fNear = gaitFoot(g, reach, 0.36, 3.2 * F.spring, 3.6 * F.spring);
      s.fFar = gaitFoot(g + 0.5, reach, 0.36, 3.2 * F.spring, 3.6 * F.spring);
      s.hy = STAND_HIP + 0.6 - 1.6 * F.spring * Math.abs(Math.sin(g * TAU));
      s.lean = 0.26 * F.spring;
      const sw = Math.sin(g * TAU + 0.4);
      s.aNear = { sh: sw * 1.05 * F.spring, el: 1.45 };
      s.aFar = { sh: -sw * 1.05 * F.spring, el: 1.45 };
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
  if (!F.plain) fit(s, p.anim, F);
  return s;
}

/**
 * Carry a pose authored for the default body onto another skeleton: legs keep
 * their shape at the new length, and hands keep their place relative to the
 * shoulder, scaled by the arm.
 */
function fit(s: Solved, anim: Anim, F: Frame): void {
  // Where the default body's shoulder is in this pose.
  const dx = s.hx + Math.sin(s.lean) * TORSO;
  const dy = s.hy - Math.cos(s.lean) * TORSO;
  const k = F.ls;
  // Gaits already step at this frame's stride.
  const gait = anim === 'walk' || anim === 'run';
  s.hy = -2 + (s.hy + 2) * k + F.knee;
  for (const f of [s.fNear, s.fFar]) {
    if (!gait) f[0] = f[0] * k + Math.sign(f[0]) * F.spread;
    f[1] = -2 + (f[1] + 2) * k;
  }
  const nx = s.hx + Math.sin(s.lean) * F.torso + F.stoop;
  const ny = s.hy - Math.cos(s.lean) * F.torso + F.stoop * 0.35;
  for (const arm of [s.aNear, s.aFar]) {
    if (!('ik' in arm)) continue;
    // A ladder does not move for a shorter climber.
    if (anim !== 'ladder') arm.ik[0] = nx + (arm.ik[0] - dx) * F.as;
    arm.ik[1] = ny + (arm.ik[1] - dy) * F.as;
  }
}

export const PUPPET_W = 48;
export const PUPPET_H = 76;
/** Where the puppet's feet sit inside its scratch surface. The room above is for the climb, which lifts the body a full reach. */
export const PUPPET_OX = 24;
export const PUPPET_OY = 70;

type Tint = (c: string, k?: number) => string;

/** Scratch list of segments for `drape` (x0, y0, x1, y1 each), reused so drawing allocates nothing. */
const SEGS: number[] = [];

/**
 * Fill between the first `n` segments of SEGS row by row, from the leftmost
 * to the rightmost of them on each row: cloth pulled taut over whatever is
 * underneath. `floor` is the last row it may reach.
 */
function drape(a: Art, n: number, floor: number, fill: string, edge: string): void {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    y0 = Math.min(y0, SEGS[i * 4 + 1]!, SEGS[i * 4 + 3]!);
    y1 = Math.max(y1, SEGS[i * 4 + 1]!, SEGS[i * 4 + 3]!);
  }
  // Cloth piles up on the ground rather than passing through it.
  y1 = Math.min(y1, floor);
  for (let y = y0; y <= y1; y++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < n; i++) {
      const ax = SEGS[i * 4]!;
      const ay = SEGS[i * 4 + 1]!;
      const bx = SEGS[i * 4 + 2]!;
      const by = SEGS[i * 4 + 3]!;
      if ((y < ay && y < by) || (y > ay && y > by)) continue;
      if (ay === by) {
        lo = Math.min(lo, ax, bx);
        hi = Math.max(hi, ax, bx);
      } else {
        const x = ax + ((bx - ax) * (y - ay)) / (by - ay);
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
    }
    const l = Math.round(lo);
    const w = Math.round(hi) - l + 1;
    // A lone pixel is the tip of a corner poking out, not cloth.
    if (!(w > 1)) continue;
    a.rect(l, y, w, 1, fill);
    a.px(l, y, edge);
  }
}

/** Hair, hats and hoods. (x, y) is the top-left pixel of the face, which looks right. */
function drawHair(a: Art, x: number, y: number, L: PuppetLook, c: Tint, drift: number): void {
  const hair = c(L.hair);
  const hat = L.hat ?? L.hair;
  switch (L.hairStyle) {
    case 'short':
      a.rect(x, y - 1, 5, 2, hair);
      a.rect(x, y + 1, 1, 3, hair);
      break;
    case 'bob':
      a.rect(x, y - 1, 5, 2, hair);
      a.rect(x, y + 1, 2, 5, hair);
      a.px(x + 4, y + 1, hair);
      break;
    case 'long':
      a.rect(x, y - 1, 5, 2, hair);
      a.rect(x - 1, y + 1, 2, 8, hair);
      break;
    case 'bun':
      a.rect(x, y - 1, 5, 2, hair);
      a.rect(x, y + 1, 1, 3, hair);
      a.rect(x - 1, y - 2, 2, 2, hair);
      break;
    case 'elder':
      a.rect(x, y, 2, 4, hair);
      a.rect(x, y - 1, 4, 1, hair);
      break;
    case 'beanie':
      a.rect(x, y - 1, 5, 3, c(hat));
      a.rect(x, y + 1, 5, 1, c(hat, 0.75));
      a.rect(x, y + 2, 1, 3, hair);
      break;
    case 'cap':
      a.rect(x, y - 1, 5, 2, c(hat));
      a.rect(x + 3, y + 1, 4, 1, c(hat, 0.8));
      a.rect(x, y + 1, 1, 3, hair);
      break;
    case 'visor':
      a.rect(x, y - 1, 5, 2, c(hat));
      a.rect(x - 1, y, 1, 1, c(hat));
      a.rect(x + 3, y + 1, 3, 1, c(hat, 0.6));
      a.rect(x, y + 1, 1, 3, hair);
      break;
    case 'hood':
      a.rect(x - 1, y - 1, 6, 2, c(L.top));
      a.rect(x - 1, y + 1, 3, 6, c(L.top));
      a.px(x - 1, y - 1, c(L.top, 0.74));
      break;
    case 'bald':
      break;
    case 'balding':
      // A fringe round the back; the crown is bare.
      a.rect(x, y + 2, 2, 2, hair);
      a.px(x, y + 4, hair);
      break;
    case 'buzz':
      a.rect(x, y, 5, 1, hair);
      a.rect(x, y + 1, 1, 2, hair);
      break;
    case 'spiky':
      a.rect(x, y - 1, 5, 2, hair);
      a.rect(x, y + 1, 1, 3, hair);
      a.px(x + 1, y - 2, hair);
      a.rect(x + 3, y - 2, 2, 1, hair);
      break;
    case 'curly':
      a.rect(x, y - 2, 4, 1, hair);
      a.rect(x - 1, y - 1, 6, 2, hair);
      a.rect(x - 1, y + 1, 2, 3, hair);
      break;
    case 'afro':
      a.rect(x, y - 3, 5, 1, hair);
      a.rect(x - 1, y - 2, 7, 1, hair);
      a.rect(x - 2, y - 1, 8, 1, hair);
      a.rect(x - 2, y, 4, 1, hair);
      a.rect(x - 2, y + 1, 3, 2, hair);
      a.rect(x - 1, y + 3, 2, 1, hair);
      break;
    case 'ponytail':
      a.rect(x, y - 1, 5, 2, hair);
      a.rect(x, y + 1, 1, 3, hair);
      a.rect(x - 2, y, 2, 2, hair);
      // The tail hangs at rest and streams back at a run.
      a.line(x - 2, y + 2, x - 2 - drift * 2, y + 6 - drift * 2, hair, 1);
      break;
    case 'pigtails':
      a.rect(x, y - 1, 5, 2, hair);
      a.rect(x, y + 1, 1, 3, hair);
      a.rect(x - 2, y + 1, 2, 3, hair);
      a.px(x - 1, y + 1, c(hat));
      break;
    case 'braid':
      a.rect(x, y - 1, 5, 2, hair);
      a.rect(x, y + 1, 1, 3, hair);
      a.rect(x - 1, y + 2, 1, 8, hair);
      for (let i = 0; i < 3; i++) a.px(x - 1, y + 4 + i * 2, c(L.hair, 0.7));
      a.px(x - 1, y + 10, c(hat));
      break;
    case 'topknot':
      a.rect(x, y - 1, 5, 2, hair);
      a.rect(x, y + 1, 1, 2, hair);
      a.rect(x + 1, y - 3, 2, 2, hair);
      break;
    case 'flatcap':
      a.rect(x, y - 1, 5, 1, c(hat));
      a.rect(x - 1, y, 6, 1, c(hat));
      a.rect(x + 5, y, 1, 1, c(hat, 0.7));
      a.rect(x, y + 1, 1, 3, hair);
      break;
    case 'hardhat':
      a.rect(x + 1, y - 2, 3, 1, c(hat, 1.15));
      a.rect(x, y - 1, 5, 2, c(hat));
      a.rect(x - 1, y + 1, 7, 1, c(hat, 0.8));
      a.rect(x, y + 2, 1, 2, hair);
      break;
    case 'brim':
      a.rect(x, y - 2, 5, 2, c(hat));
      a.rect(x - 2, y, 9, 1, c(hat, 0.8));
      a.rect(x, y + 1, 1, 3, hair);
      break;
    case 'swimcap':
      a.rect(x, y - 1, 5, 2, c(hat));
      a.rect(x, y + 1, 2, 2, c(hat));
      a.px(x + 3, y - 1, c(hat, 1.25));
      break;
    case 'headscarf':
      a.rect(x - 1, y - 1, 6, 2, c(hat));
      a.rect(x - 1, y + 1, 3, 5, c(hat));
      a.rect(x, y + 6, 4, 1, c(hat, 0.86));
      a.px(x - 1, y - 1, c(hat, 0.74));
      break;
  }
}

/**
 * Draw a puppet facing right, with its feet centred at (ox, oy) — oy is the
 * ground row, so the lowest body pixel lands on oy - 1.
 */
export function drawPuppet(a: Art, ox: number, oy: number, L: PuppetLook, p: PuppetPose): void {
  const sc = L.scale ?? 1;
  const F = frameOf(L);
  const s = solve(p, F);
  const an = p.anim;
  const flat = L.flat;
  const X = (v: number): number => ox + (v + s.rx) * sc;
  const Y = (v: number): number => oy + (v + s.ry) * sc;
  const col: Tint = (c, k = 1) => flat ?? (k === 1 ? c : shade(c, k));
  const thighTh = sc > 0.85 ? F.thighTh : Math.max(2, F.thighTh - 1);
  const shinTh = F.shinTh;

  // Children are always fully dressed, whatever the look asks for.
  const swim = L.age === 'child' ? undefined : L.swim;
  /** Stripped to the waist over trousers; trunks bare the chest too, but keep their own waistband. */
  const stripped = L.age !== 'child' && !swim && !!L.bare;
  const sleeves = swim || stripped ? 'none' : (L.sleeves ?? 'long');
  const legs = swim === 'onepiece' ? 'bare' : swim === 'trunks' ? 'shorts' : (L.legs ?? 'long');
  // The bare chest takes the same shading as cloth, so it is simply a top in skin colour.
  const body = swim === 'trunks' || stripped ? L.skin : L.top;

  const hipX = s.hx;
  const hipY = s.hy;
  const sdx = Math.sin(s.lean) * F.torso;
  const sdy = -Math.cos(s.lean) * F.torso;
  const shX = hipX + sdx + F.stoop;
  const shY = hipY + sdy + F.stoop * 0.35;
  // A bent back pushes the head forward and lets it sink.
  const headU = shX + Math.sin(s.lean) * 2 + s.headX + F.stoop * 0.5;
  const nod = F.stoop >= 1.5 ? 1 : 0;
  // Hair and scarf tails trail with speed.
  const drift = an === 'run' ? 2 : an === 'walk' ? 1 : 0;

  /** Pixel the spine passes through at height u (0 hip .. 1 shoulder); a stoop curls the top forward. */
  const spineX = (u: number): number => Math.round(X(hipX + sdx * u + F.stoop * u * u));
  const spineY = (u: number): number => Math.round(Y(hipY + sdy * u + F.stoop * 0.35 * u * u));
  /** Torso depth behind and in front of the spine at height u. */
  const backAt = (u: number): number =>
    F.back + (u > 0.7 ? F.yoke : 0) + (F.fem && u < 0.2 ? 1 : 0) - (F.back > 3 && u > 0.9 ? 1 : 0);
  const frontAt = (u: number): number => {
    let f = F.front + ((F.fem ? u > 0.5 && u < 0.85 : u > 0.45) ? F.chest : 0);
    if (F.belly > 0) f += Math.round(F.belly * Math.max(0, 1 - ((u - 0.28) / 0.5) ** 2));
    return f;
  };

  // --- hands: a prop takes one over and the other picks up the gesture ---
  let aNear = s.aNear;
  let aFar = s.aFar;
  const handsFree = an !== 'hang' && an !== 'climb' && an !== 'ladder';
  const gesture = an === 'talk' || an === 'reach' || an === 'cook' || an === 'sit';
  let caneTip: P2 | null = null;
  let nearBusy = false;
  if (L.cane && (an === 'idle' || an === 'talk' || an === 'walk' || an === 'reach' || an === 'lean' || an === 'sit' || an === 'cook')) {
    // Planted clear of the belly; at a walk it steps with the far leg, as a cane does.
    let tx = hipX + frontAt(0.3) + 2.5;
    let ty = -1;
    if (an === 'walk') {
      const f = gaitFoot(p.phase * F.cadence + 0.5, 4.5 * F.stride, 0.6, 1.6, 0);
      tx += f[0];
      ty = f[1] + 1;
    } else if (an === 'sit') tx = s.fNear[0] + 3;
    caneTip = [tx, ty];
    if (gesture) aFar = aNear;
    aNear = { ik: [tx - 1, ty - (F.leg * 2 + 0.5)] };
    nearBusy = true;
  } else if (L.carry && (an === 'idle' || an === 'talk' || an === 'walk' || an === 'run' || an === 'reach' || an === 'land')) {
    if (gesture) aFar = aNear;
    // A loaded arm hangs and barely swings.
    aNear = { sh: 0.08 + ('sh' in aNear && !gesture ? aNear.sh * 0.3 : 0), el: 0.14 };
    nearBusy = true;
  }
  // An umbrella is only up while there is a hand to hold it: not when both are on a ledge, the ground or a relay.
  const brolly = !!L.umbrella && handsFree && an !== 'crouch' && an !== 'brace' && an !== 'kneel';
  if (brolly) {
    const grip: Arm = { ik: [headU + 3, shY + 5 + s.headY] };
    if (nearBusy) aFar = grip;
    else {
      if (gesture) aFar = aNear;
      aNear = grip;
    }
  }

  const armJoints = (arm: Arm, sx: number, sy: number): [P2, P2] => {
    if ('ik' in arm) {
      const el = ik2(sx, sy, arm.ik[0], arm.ik[1], F.arm, F.arm, -1);
      const d = Math.hypot(arm.ik[0] - sx, arm.ik[1] - sy);
      const max = F.arm + F.arm - 0.05;
      const hand: P2 = d > max ? [sx + ((arm.ik[0] - sx) * max) / d, sy + ((arm.ik[1] - sy) * max) / d] : arm.ik;
      return [el, hand];
    }
    const a1 = arm.sh + s.lean * 0.5;
    const ex = sx + Math.sin(a1) * F.arm;
    const ey = sy + Math.cos(a1) * F.arm;
    const a2 = a1 + arm.el;
    return [
      [ex, ey],
      [ex + Math.sin(a2) * F.arm, ey + Math.cos(a2) * F.arm],
    ];
  };

  const drawArm = (arm: Arm, dark: boolean): void => {
    // The near arm is a touch darker than the torso so it separates from it.
    const k = dark ? 0.62 : 0.88;
    const sx = shX + (dark ? -0.5 : 0.5);
    const sy = shY + 1.5;
    const [el, hand] = armJoints(arm, sx, sy);
    const upper = sleeves === 'none' ? col(L.skin, dark ? 0.7 : 0.9) : col(L.top, k);
    const lower = sleeves === 'long' ? col(L.top, k * 0.94) : col(L.skin, dark ? 0.66 : 0.86);
    if (!dark && !flat && stripped) {
      // A bare arm over a bare chest is skin on skin: the shadow behind it is what separates them.
      const sh = shade(L.skin, 0.62);
      a.line(X(sx) - 1, Y(sy), X(el[0]) - 1, Y(el[1]), sh, F.armTh);
      a.line(X(el[0]) - 1, Y(el[1]), X(hand[0]) - 1, Y(hand[1]), sh, F.foreTh);
    }
    a.line(X(sx), Y(sy), X(el[0]), Y(el[1]), upper, F.armTh);
    a.line(X(el[0]), Y(el[1]), X(hand[0]), Y(hand[1]), lower, F.foreTh);
    if (L.stripe && !dark && !flat) a.px(Math.round(X(el[0])), Math.round(Y(el[1])), L.stripe);
    if (L.ink && stripped && !dark && !flat) {
      // A band of ink round the upper arm.
      const mx = Math.round(X(lerp(sx, el[0], 0.55)));
      const my = Math.round(Y(lerp(sy, el[1], 0.55)));
      a.rect(mx - 1, my, F.armTh, 1, L.ink);
    }
    if (L.armband && dark && !flat) {
      const mx = Math.round(X((sx + el[0]) / 2));
      const my = Math.round(Y((sy + el[1]) / 2));
      a.emit(mx, my, 2, 1, L.armband, 0.5);
    }
    a.rect(Math.round(X(hand[0])), Math.round(Y(hand[1])), 2, 2, col(L.skin, k));
  };

  const kneeFar = ik2(hipX, hipY, s.fFar[0], s.fFar[1], F.leg, F.leg, 1);
  const kneeNear = ik2(hipX, hipY, s.fNear[0], s.fNear[1], F.leg, F.leg, 1);
  if (!F.plain) {
    // A thick thigh folded right down would otherwise be drawn through the ground.
    const lowest = (-1 - (thighTh >> 1)) / sc;
    kneeFar[1] = Math.min(kneeFar[1], lowest);
    kneeNear[1] = Math.min(kneeNear[1], lowest);
  }

  const drawLeg = (foot: P2, knee: P2, dark: boolean): void => {
    const k = dark ? 0.68 : 1;
    const ks = dark ? 0.74 : 1;
    const hx = X(hipX);
    const hy = Y(hipY);
    const kx = X(knee[0]);
    const ky = Y(knee[1]);
    const fx0 = X(foot[0]);
    const fy0 = Y(foot[1]);
    if (legs === 'long') {
      a.line(hx, hy, kx, ky, col(L.bottom, k), thighTh);
      a.line(kx, ky, fx0, fy0, col(L.bottom, k * 0.92), shinTh);
    } else {
      a.line(hx, hy, kx, ky, col(L.skin, ks), thighTh);
      a.line(kx, ky, fx0, fy0, col(L.skin, ks * 0.94), shinTh);
      if (legs === 'shorts') {
        // Trunks stop higher up the thigh than shorts.
        const t = swim ? 0.5 : 0.75;
        a.line(hx, hy, lerp(hx, kx, t), lerp(hy, ky, t), col(L.bottom, k), thighTh);
      }
    }
    if (L.boots) {
      const t = clamp01((L.boots * sc) / Math.max(1, Math.hypot(fx0 - kx, fy0 - ky)));
      a.line(lerp(fx0, kx, t), lerp(fy0, ky, t), fx0, fy0, col(L.shoes, k * 0.9), shinTh);
    }
    const fx = Math.round(fx0);
    const fy = Math.round(fy0);
    a.rect(fx - 1, fy, 3, 1, L.sandals ? col(L.skin, ks) : col(L.shoes, k));
    a.rect(fx - 1, fy + 1, 4, 1, col(L.shoes, k * 0.8));
  };

  /** A point `len` along a leg from the hip, for hems that follow the legs. */
  const along = (knee: P2, foot: P2, len: number): P2 => {
    if (len <= F.leg) return [lerp(hipX, knee[0], len / F.leg), lerp(hipY, knee[1], len / F.leg)];
    const t = Math.min(1, (len - F.leg) / F.leg);
    return [lerp(knee[0], foot[0], t), lerp(knee[1], foot[1], t)];
  };

  /** A skirt or long coat: hangs from the hip, flares, and is pulled out by whichever way the legs go. */
  const hangCloth = (len: number, flare: number, fill: string, edge: string): void => {
    const cx = Math.round(X(hipX));
    const cy = Math.round(Y(hipY));
    const wb = backAt(0);
    const wf = frontAt(0) - 1;
    const pad = (thighTh >> 1) + 1;
    let n = 0;
    const seg = (x0: number, y0: number, x1: number, y1: number): void => {
      SEGS[n * 4] = x0;
      SEGS[n * 4 + 1] = y0;
      SEGS[n * 4 + 2] = x1;
      SEGS[n * 4 + 3] = y1;
      n++;
    };
    /** Both sides and the far end of a sleeve of cloth round one stretch of leg. */
    const band = (ax: number, ay: number, bx: number, by: number): void => {
      // Snap to the pixels the leg itself is drawn on, so the cloth sits evenly round it.
      const x0 = Math.round(ax);
      const y0 = Math.round(ay);
      const x1 = Math.round(bx);
      const y1 = Math.round(by);
      const d = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
      const nx = Math.round((-(y1 - y0) / d) * pad);
      const ny = Math.round(((x1 - x0) / d) * pad);
      seg(x0 + nx, y0 + ny, x1 + nx, y1 + ny);
      seg(x0 - nx, y0 - ny, x1 - nx, y1 - ny);
      seg(x1 + nx, y1 + ny, x1 - nx, y1 - ny);
    };
    let low = 0;
    for (const [knee, foot] of [
      [kneeFar, s.fFar],
      [kneeNear, s.fNear],
    ] as const) {
      const end = along(knee, foot, len);
      low += end[1];
      if (len > F.leg) {
        band(X(hipX), Y(hipY), X(knee[0]), Y(knee[1]));
        band(X(knee[0]), Y(knee[1]), X(end[0]), Y(end[1]));
      } else band(X(hipX), Y(hipY), X(end[0]), Y(end[1]));
    }
    // Free cloth hangs straight down; seated, it lies along the thighs instead.
    const drop = Math.round(Y(hipY + len * clamp((low / 2 - hipY) / len, 0.3, 1)));
    seg(cx - wb, cy, cx - wb - flare, drop);
    seg(cx - wb - flare, drop, cx + wf + flare, drop);
    seg(cx + wf + flare, drop, cx + wf, cy);
    drape(a, n, Math.round(Y(-1)), fill, edge);
  };

  // --- back to front ---
  drawArm(aFar, true);
  drawLeg(s.fFar, kneeFar, true);

  // Backpack sits behind the torso.
  let packTop: P2 | null = null;
  if ((L.pack === 'radio' || L.pack === 'bag') && !flat) {
    const pc = L.packColor ?? '#4d5a5e';
    const off = 3 + backAt(0.55);
    const bx = Math.round(X(hipX + sdx * 0.55 - off + F.stoop * 0.3));
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

  drawLeg(s.fNear, kneeNear, false);

  if (swim === 'onepiece') {
    // The suit closes between the legs.
    const cx = Math.round(X(hipX));
    const cy = Math.round(Y(hipY));
    a.rect(cx - 1, cy + 1, 3, 1, col(L.top, 0.9));
    a.px(cx, cy + 2, col(L.top, 0.8));
  }
  if (L.skirt) hangCloth(L.skirt, 1, col(L.skirtColor ?? L.top, 0.94), col(L.skirtColor ?? L.top, 0.72));
  const hem = L.coat ?? 0;
  if (hem >= LONG_COAT) hangCloth(hem, 0, col(L.top, 0.92), col(L.top, 0.7));

  if (F.belly >= 2 && !swim) {
    // A big belly hangs a row below the belt.
    const cx = Math.round(X(hipX));
    a.rect(cx, Math.round(Y(hipY)) + 1, frontAt(0) - 1, 1, col(body, stripped ? 0.7 : 0.82));
  }

  // Torso, drawn as rows so a lean shears it cleanly.
  // Rounded up, so rows never land more than a pixel apart and leave a gap.
  const rows = Math.max(2, Math.ceil(F.torso * sc));
  for (let i = 0; i <= rows; i++) {
    const u = i / rows;
    const back = backAt(u);
    const wide = back + frontAt(u);
    const tx = spineX(u) - back;
    const ty = spineY(u);
    a.rect(tx, ty, wide, 1, col(body));
    if (!flat) {
      a.px(tx, ty, shade(body, 0.74));
      if (u > 0.5) a.px(tx + wide - 1, ty, shade(body, 1.14));
      if (swim === 'trunks' && i < 2) a.rect(tx, ty, wide, 1, i ? L.bottom : shade(L.bottom, 0.85));
      if (stripped) {
        // Skin has more shape than cloth. The waistband shows behind a belly that hangs over it.
        const flat0 = back + F.front + (F.belly >= 2 ? 0 : frontAt(u) - F.front);
        if (i === 0) a.rect(tx, ty, flat0, 1, shade(L.bottom, 0.8));
        // The underside of the belly is in its own shadow, and the lamp catches the top of it.
        else if (F.belly > 0 && u < 0.2) a.rect(tx + back + 1, ty, wide - back - 1, 1, shade(L.skin, 0.86));
        if (i === 0 && wide > flat0) a.rect(tx + flat0, ty, wide - flat0, 1, shade(L.skin, 0.8));
        if (F.belly > 0 && u >= 0.2 && u <= 0.5) a.px(tx + wide - 1, ty, shade(L.skin, 1.12));
        if (F.belly >= 2 && i === Math.round(rows * 0.22)) a.px(tx + wide - 2, ty, shade(L.skin, 0.7)); // navel
        // A fold under the chest.
        if (i === Math.round(rows * 0.56)) a.rect(tx + wide - 3, ty, 2, 1, shade(L.skin, 0.8));
        if (i === rows) a.px(tx + back, ty, shade(L.skin, 1.16)); // wet shoulder
        if (L.ink && u > 0.42) {
          // Old ink across the shoulder blade and down the flank, broken up so it reads as a drawing.
          a.px(tx + 1, ty, L.ink);
          if (i % 2 === 0 && back > 2) a.px(tx + 2, ty, L.ink);
        }
      }
      if (swim === 'onepiece' && u > 0.8) {
        // Bare shoulders under a strap.
        a.rect(tx, ty, wide, 1, L.skin);
        a.px(tx + back - 1, ty, L.top);
        a.px(tx, ty, shade(L.skin, 0.74));
      }
      if (L.overalls) {
        if (u < 0.68) {
          a.rect(tx, ty, wide, 1, L.bottom);
          a.px(tx, ty, shade(L.bottom, 0.74));
        } else {
          a.px(tx + back - 1, ty, L.bottom);
          a.px(tx + wide - 1, ty, shade(L.bottom, 1.1));
        }
      }
      if (L.shirt && u > 0.6) {
        a.px(tx + wide - 1, ty, L.shirt);
        if (i === rows) a.px(tx + wide - 2, ty, L.shirt);
      }
      if (L.tie && u > 0.4 && i < rows) a.px(tx + wide - 1, ty, L.tie);
      if (L.apron && u < 0.75) a.rect(tx + back - 1, ty, wide - back + 1, 1, L.apron);
    }
  }
  if (L.stripe && !flat) {
    const u = 0.52;
    const back = backAt(u);
    a.rect(spineX(u) - back, spineY(u), back + frontAt(u), 1, L.stripe);
  }
  // Coat or jacket hem over the thighs.
  if (hem > 0 && hem < LONG_COAT) {
    const moving = an === 'run' ? 1.5 : an === 'walk' ? 0.5 : 0;
    const back = backAt(0);
    const wide = back + frontAt(0) + 1;
    // A small body folded right down has less leg than hem: the hem stops at the ground.
    const rowsLeft = Math.round(Y(-1)) - Math.round(Y(hipY));
    for (let i = 1; i <= hem && i <= rowsLeft; i++) {
      const hx2 = Math.round(X(hipX - (i / hem) * moving)) - back;
      a.rect(hx2, Math.round(Y(hipY)) + i, wide, 1, col(L.top, i === hem ? 0.8 : 0.92));
      if (L.apron && !flat) a.rect(hx2 + back - 1, Math.round(Y(hipY)) + i, wide - back + 1, 1, L.apron);
    }
  }
  // The top of the shoulders: collars, straps and scarves hang from here.
  const topX = spineX(1);
  const topY = spineY(1);
  if (L.pack === 'satchel' && !flat) {
    // Strap across the chest to a bag on the far hip.
    const pc = L.packColor ?? '#4d5a5e';
    const bx = Math.round(X(hipX)) - backAt(0) - 1;
    const by = Math.round(Y(hipY)) - 2;
    a.line(topX + frontAt(1) - 1, topY, bx + 2, by, shade(pc, 0.8), 1);
    a.rect(bx, by, 4, 4, pc);
    a.rect(bx, by, 4, 1, shade(pc, 1.25));
  }
  if (L.hoodDown) {
    const bx = topX - backAt(1) - 1;
    a.rect(bx, topY - 1, 3, 2, col(L.top, 0.86));
    a.px(bx, topY, col(L.top, 0.68));
  }

  // Head.
  const hcx = Math.round(X(headU));
  const htop = Math.round(Y(shY)) - 7 + Math.round(s.headY * sc) + nod;
  const hx0 = hcx - 2;
  if (flat) {
    a.rect(hx0, htop, 5, 6, flat);
    a.rect(hx0 + 1, htop - 1, 3, 1, flat);
    drawHair(a, hx0, htop, L, col, drift);
  } else {
    // Five rows of full-width head, then a narrower chin row so the jaw tapers.
    a.rect(hx0, htop, 5, 5, L.skin);
    if (F.belly >= 3) {
      // A heavy face keeps its width down to the collar.
      a.rect(hx0, htop + 5, 5, 1, L.skin);
      if (!nod) a.rect(hx0, htop + 6, 5, 1, shade(L.skin, 0.84));
    } else {
      a.rect(hx0, htop + 5, 4, 1, L.skin);
      if (!nod) a.rect(hx0 + 1, htop + 6, 3, 1, shade(L.skin, 0.8)); // neck
    }
    drawHair(a, hx0, htop, L, col, drift);
    if (L.beard === 'stubble') {
      a.rect(hx0 + 2, htop + 4, 3, 1, shade(L.skin, 0.8));
      a.rect(hx0 + 1, htop + 5, 3, 1, shade(L.skin, 0.8));
    } else if (L.beard === 'moustache') {
      a.rect(hx0 + 3, htop + 4, 2, 1, L.hair);
    } else if (L.beard) {
      a.rect(hx0 + 2, htop + 4, 3, 1, L.hair);
      a.rect(hx0 + 1, htop + 5, 3, 1, L.hair);
      a.px(hx0 + 1, htop + 4, L.hair);
      if (L.beard === 'long') a.rect(hx0 + 2, htop + 6, 3, 2, L.hair);
    }
    if (!p.blink) a.px(hx0 + 3, htop + 2, '#1a1418');
    if (L.mask) {
      a.rect(hx0 + 2, htop + 3, 3, 2, L.mask);
      a.rect(hx0 + 2, htop + 5, 2, 1, shade(L.mask, 0.86));
      a.px(hx0 + 1, htop + 3, shade(L.mask, 0.8));
    }
    if (L.eyewear === 'glasses') {
      a.px(hx0 + 2, htop + 2, '#4a4e58');
      a.px(hx0 + 4, htop + 2, '#cfe6f2');
    } else if (L.eyewear === 'shades') {
      a.rect(hx0 + 1, htop + 2, 4, 1, '#16181e');
    } else if (L.eyewear === 'goggles') {
      a.rect(hx0, htop, 5, 1, '#20242c');
      a.rect(hx0 + 3, htop, 2, 1, '#9fd8ee');
    }
    if (L.headphones) {
      a.rect(hx0, htop - 2, 3, 1, shade(L.headphones, 0.7));
      a.rect(hx0, htop + 1, 2, 3, L.headphones);
      a.px(hx0, htop + 2, shade(L.headphones, 0.6));
    }
    if (L.headlamp) {
      // Strap across the brow, lamp sitting proud of the forehead.
      a.rect(hx0, htop + 1, 5, 1, '#2a2e36');
      a.epx(hx0 + 5, htop + 1, '#fff2c8', 0.8);
    }
  }
  if (L.scarf) {
    // Wound round the neck with a tail down the back.
    const bx = topX - backAt(1);
    a.rect(bx, topY - 1, backAt(1) + frontAt(1), 2, col(L.scarf));
    a.rect(bx, topY, backAt(1) + frontAt(1), 1, col(L.scarf, 0.82));
    a.line(bx, topY + 1, bx - 1 - drift, topY + 4 - drift, col(L.scarf, 0.9), 2);
  }
  if (L.towel) {
    const bx = topX - backAt(1);
    a.rect(bx, topY - 1, backAt(1) + 2, 2, col(L.towel));
    a.rect(topX, topY + 1, 2, 5, col(L.towel));
    a.rect(topX, topY + 5, 2, 1, col(L.towel, 0.78));
    a.px(bx, topY, col(L.towel, 0.78));
  }

  // Whatever the near hand holds goes under the hand, so the fingers close over it.
  const sx = shX + 0.5;
  const sy = shY + 1.5;
  if (nearBusy || (L.cane && handsFree) || (L.carry && an === 'sit')) {
    const [, hand] = armJoints(aNear, sx, sy);
    const hx = Math.round(X(hand[0]));
    const hy = Math.round(Y(hand[1]));
    if (L.cane) {
      const cc = col(L.cane);
      // Off the ground it is carried pointing ahead.
      const tx = caneTip ? Math.round(X(caneTip[0])) : hx + 6;
      const ty = caneTip ? Math.round(Y(caneTip[1])) : Math.min(Math.round(Y(-1)), hy + 9);
      a.line(hx + 1, hy + 1, tx, ty, cc, 1);
      a.rect(hx - 1, hy, 3, 1, cc);
      if (!flat) a.px(tx, ty, shade(L.cane, 0.6));
    } else if (L.carry) {
      const cc = L.carryColor ?? '#d8d2c4';
      // Seated, it is put down by the feet.
      const bx = an === 'sit' ? Math.round(X(hipX - 6)) - 5 : hx - 2;
      const floor = Math.round(Y(-1)) + 1;
      if (L.carry === 'case') {
        const by = an === 'sit' ? floor - 5 : Math.min(hy + 2, floor - 5);
        a.rect(bx, by, 7, 5, col(cc));
        a.rect(bx, by, 7, 1, col(cc, 1.25));
        a.rect(bx + 2, by - 1, 3, 1, col(cc, 0.7));
        if (!flat) a.px(bx + 3, by + 2, shade(cc, 1.5));
      } else {
        const by = an === 'sit' ? floor - 6 : Math.min(hy + 3, floor - 6);
        a.rect(bx + 1, by - 1, 1, 1, col(cc, 0.8));
        a.rect(bx + 4, by - 1, 1, 1, col(cc, 0.8));
        a.rect(bx, by, 6, 6, col(cc));
        a.rect(bx, by + 5, 6, 1, col(cc, 0.78));
        a.rect(bx, by, 1, 5, col(cc, 0.86));
      }
    }
  }
  drawArm(aNear, false);

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

  if (L.umbrella && brolly) {
    // Held out in front, where a hand can reach the handle.
    const ux = hcx + 3;
    const uy = htop - 6;
    const uc = col(L.umbrella);
    a.rect(ux - 9, uy + 2, 19, 1, col(L.umbrella, 0.8));
    a.rect(ux - 8, uy + 1, 17, 1, uc);
    a.rect(ux - 6, uy, 13, 1, uc);
    a.rect(ux - 3, uy - 1, 7, 1, col(L.umbrella, 1.15));
    a.rect(ux, uy + 2, 1, 18, flat ?? '#20242c');
    // The hand that holds it is redrawn over the shaft.
    const held = nearBusy ? aFar : aNear;
    const [, hand] = armJoints(held, nearBusy ? shX - 0.5 : sx, sy);
    a.rect(Math.round(X(hand[0])), Math.round(Y(hand[1])), 2, 2, col(L.skin, nearBusy ? 0.62 : 0.88));
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
