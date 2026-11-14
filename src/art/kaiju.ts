import { mix, shade } from '../core/color';
import { clamp, clamp01, hash2, lerp, Rng, valueNoise } from '../core/math';
import { SWEEP_LEN, type Barb, type Kaiju } from '../game/kaiju';
import { Art } from '../gfx/art';
import type { Vec3 } from '../gfx/renderer';
import type { Stage } from '../gfx/stage';
import { FOCAL } from '../gfx/world';
import { WATER_DROP } from './scenes/quay';

/**
 * The Undertow, as a picture.
 *
 * Everything that draws it goes through `drawKaiju`. Its body stands far out
 * in the channel: it is composed each frame into one scratch surface and
 * stood on the water at its real distance, so the lens sees round it as it
 * moves; white water spreads from it across the same plane; only its limbs,
 * and the barbs in them, are drawn in the play layer, where the quay's
 * lights reach them.
 */

/** How far out in the channel it stands: behind the finger pier, in front of the far bank. */
export const KAIJU_Z = 900;
/** Drawn this much larger than it is painted, so that at that distance it fills the frame as painted. */
const KS = 1 + KAIJU_Z / FOCAL;
/** It carries its own light and stands beyond the reach of the quay's lamps: this lifts it out of the scene's night. */
const GAIN = 2.2;
/** World x it stands opposite. */
export const KAIJU_X = 1100;
/** The live cable barbs. */
export const BARB = '#d86bff';
const BARB_HOT = '#f6dcff';
const EYE = '#eaffb4';
const BIO = '#49e0d0';
/** The colour of wet air with the port's lamps in it. */
const AIR = '#4a5f80';

/** Scratch surface the body is composed into, and the row of the waterline inside it. */
const BW = 340;
const BH = 214;
const WL = 198;
/** Scratch surface for one band of white water round it; the water's surface is its bottom row. */
const FOAM_W = 640;
const FOAM_H = 22;

interface Tones {
  base: string;
  hi: string;
  plate: string;
  rim: string;
  side: string;
  glint: string;
  belly: string;
  tooth: string;
  weed: string;
}

/** In the dark it is a shape with a wet edge. */
const DARK: Tones = { base: '#0b1019', hi: '#111926', plate: '#06090e', rim: '#31425a', side: '#1a2433', glint: '#6583a6', belly: '#131c29', tooth: '#3a4352', weed: '#0b1512' };
/** With the floodlights on it, lit from below and in front, it has a surface. */
const LIT: Tones = { base: '#1d2937', hi: '#34495f', plate: '#0e161f', rim: '#9dbcd8', side: '#5d7b98', glint: '#d6e8f6', belly: '#3d5268', tooth: '#c8d2da', weed: '#17301f' };

// ---------------------------------------------------------------------------
// Painting helpers
// ---------------------------------------------------------------------------

type P2 = [number, number];

function ellipse(a: Art, cx: number, cy: number, rx: number, ry: number, col: string, wob = 0, seed = 0): void {
  for (let dy = -ry; dy <= ry; dy++) {
    const k = Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry)));
    const n = wob ? (valueNoise(dy * 0.17, seed) - 0.5) * wob : 0;
    const half = Math.round(rx * k + n);
    if (half > 0) a.rect(Math.round(cx) - half, Math.round(cy) + dy, half * 2, 1, col);
  }
}

/** Crisp scan-line polygon fill. */
function poly(a: Art, pts: P2[], col: string): void {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    y0 = Math.min(y0, p[1]);
    y1 = Math.max(y1, p[1]);
  }
  const n = pts.length;
  for (let y = Math.ceil(y0); y <= Math.floor(y1); y++) {
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      const [ax, ay] = pts[i]!;
      const [bx, by] = pts[(i + 1) % n]!;
      if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.round(xs[k]!);
      const x1 = Math.round(xs[k + 1]!);
      if (x1 > x0) a.rect(x0, y, x1 - x0, 1, col);
    }
  }
}

/** Light catching the top and the near side of whatever has been drawn. */
function rim(a: Art, top: string, side: string, rng: Rng): void {
  const d = a.c.getImageData(0, 0, a.w, a.h).data;
  const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < a.w && y < a.h && d[(y * a.w + x) * 4 + 3]! > 128;
  for (let y = 0; y < a.h; y++) {
    for (let x = 0; x < a.w; x++) {
      if (!solid(x, y)) continue;
      if (!solid(x, y - 1)) {
        a.px(x, y, top);
        if (solid(x, y + 1) && rng.chance(0.45)) a.px(x, y + 1, shade(top, 0.62));
      } else if (!solid(x - 1, y) && rng.chance(0.75)) a.px(x, y, side);
    }
  }
}

/** Hide: overlapping plates, weed, shell. All of it only lands on what is already drawn. */
function hide(a: Art, T: Tones, rng: Rng, lit: boolean): void {
  const { w, h } = a;
  // Plates: dark seams that sag in the middle.
  for (let y = 8; y < h; y += rng.int(7, 11)) {
    for (let x = 0; x < w; x += 6) {
      const sag = Math.round(Math.sin(x * 0.045 + y * 0.3) * 2.5);
      a.tint(x, y + sag, 6, 1, T.plate, 0.7);
      if (lit) a.tint(x, y + sag + 1, 6, 1, T.hi, 0.35);
    }
  }
  // Broad planes of light and shade.
  for (let i = 0; i < 26; i++) {
    const x = rng.int(0, w - 30);
    const y = rng.int(0, h - 14);
    a.tint(x, y, rng.int(18, 60), rng.int(5, 16), rng.chance(0.5) ? T.hi : T.plate, rng.range(0.14, 0.3));
  }
  // Shell and scar.
  a.speckle(0, 0, w, h, T.glint, Math.floor((w * h) / (lit ? 260 : 700)), () => rng.next());
  a.speckle(0, 0, w, h, T.plate, Math.floor((w * h) / 90), () => rng.next());
  for (let i = 0; i < Math.floor(w / 9); i++) {
    const x = rng.int(0, w - 2);
    const y = rng.int(0, h - 20);
    a.tint(x, y, 1, rng.int(8, 34), T.weed, 0.8);
  }
}

// ---------------------------------------------------------------------------
// Static pieces (painted once, in a dark and a floodlit version)
// ---------------------------------------------------------------------------

/** Rows of the torso piece: v = 0 (waterline) sits at this row. */
const TORSO_H = 150;
const TORSO_V0 = 146;

function paintTorso(T: Tones, lit: boolean): Art {
  const a = new Art(BW, TORSO_H);
  const Y = (v: number): number => TORSO_V0 - v;
  const rng = new Rng(4409);
  // Dorsal spines first, so the back overlaps their roots.
  for (let i = 0; i < 9; i++) {
    const u = 170 + i * 17;
    const top = 126 - Math.abs(i - 3) * 5 + (i % 2) * 6;
    const hgt = 16 + ((i * 7) % 11);
    poly(a, [[u - 7, Y(top - 12)], [u + 3, Y(top + hgt)], [u + 9, Y(top - 14)]], T.base);
  }
  ellipse(a, 190, Y(38), 106, 86, T.base, 5, 3);
  ellipse(a, 130, Y(70), 54, 46, T.base, 4, 9);
  ellipse(a, 240, Y(74), 56, 48, T.base, 4, 17);
  ellipse(a, 80, Y(22), 44, 44, T.base, 4, 23);
  ellipse(a, 298, Y(24), 42, 48, T.base, 4, 31);
  hide(a, T, rng, lit);
  // Paler plates down the chest, which shows when it rears.
  for (let v = 12; v < 92; v += 8) {
    const half = 22 - Math.abs(v - 46) * 0.28;
    const x0 = 118 - half + Math.sin(v * 0.4) * 2;
    a.tint(x0, Y(v), half * 2, 4, T.belly, lit ? 0.26 : 0.2);
    a.tint(x0 + 3, Y(v) + 4, half * 2 - 6, 1, T.plate, 0.6);
  }
  if (lit) {
    // Lit from the quay: strongest low and on the side toward the lamps, dying toward the top of its back.
    for (let i = 0; i < 7; i++) a.tint(0, 0, BW, 22 + i * 11, '#060a11', 0.2);
    const g = a.c.createLinearGradient(0, 0, BW, 0);
    g.addColorStop(0, 'rgba(120,150,180,0.28)');
    g.addColorStop(0.45, 'rgba(120,150,180,0)');
    g.addColorStop(0.7, 'rgba(6,10,17,0)');
    g.addColorStop(1, 'rgba(6,10,17,0.6)');
    a.tint(0, 0, BW, TORSO_H, g, 1);
    // The dome behind each shoulder falls into shadow.
    for (const [cx, cy, r] of [
      [196, 64, 58],
      [270, 44, 50],
    ] as const) {
      const sh = a.c.createRadialGradient(cx, Y(cy), 4, cx, Y(cy), r);
      sh.addColorStop(0, 'rgba(6,10,17,0.5)');
      sh.addColorStop(1, 'rgba(6,10,17,0)');
      a.tint(cx - r, Y(cy) - r, r * 2, r * 2, sh, 1);
    }
  } else {
    a.tint(0, Y(40), BW, 40, '#05080d', 0.35);
  }
  rim(a, T.rim, T.side, rng);
  return a;
}

/** Size of a head piece; the joint to the neck sits at its centre. */
const HEAD = 150;
const HJ = HEAD / 2;

interface HeadArt {
  art: Art;
  /** Offsets from the joint: where the eyes are, and where the barbels hang from. */
  eyes: P2[];
  chin: P2[];
  /** The root of the throat, where the last barb sits. */
  throat: P2;
}

function paintHead(T: Tones, lit: boolean, angle: number, gape: number): HeadArt {
  const a = new Art(HEAD, HEAD);
  const rng = new Rng(977);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // Head space: f runs along the snout, u up through the crown. It faces left.
  const at = (f: number, u: number): P2 => [HJ - f * c + u * s, HJ - f * s - u * c];
  const off = (f: number, u: number): P2 => [-f * c + u * s, -f * s - u * c];
  // Crest behind the skull.
  for (const [f, h] of [
    [-16, 15],
    [-6, 19],
    [5, 13],
  ] as const) {
    poly(a, [at(f - 6, 12), at(f - 3, 16 + h), at(f + 5, 13)], T.base);
  }
  // Lower jaw, hanging open by `gape`.
  poly(a, [at(-20, -6), at(0, -6), at(22, -10 - gape), at(44, -12 - gape), at(55, -10 - gape), at(57, -7 - gape), at(42, -17 - gape), at(16, -20 - gape * 0.6), at(-8, -18), at(-22, -10)], T.base);
  // Skull and upper jaw.
  poly(a, [at(-26, 2), at(-20, 15), at(-5, 20), at(12, 17), at(30, 11), at(46, 7), at(58, 3), at(61, -1), at(56, -4), at(40, -5), at(20, -6), at(0, -6), at(-22, -9)], T.base);
  hide(a, T, rng, lit);
  // Brow: a heavy ridge over the eyes.
  for (let f = 14; f < 46; f++) {
    const [x, y] = at(f, 13 - (f - 14) * 0.2);
    a.tint(Math.round(x), Math.round(y), 2, 2, T.plate, 0.85);
  }
  // Gill slits.
  for (const f of [-14, -9, -4]) {
    const [x0, y0] = at(f, 6);
    const [x1, y1] = at(f - 2, -5);
    a.line(x0, y0, x1, y1, T.plate);
  }
  // The dark of the mouth, and teeth along the upper jaw.
  if (gape > 1) poly(a, [at(2, -6), at(20, -6), at(40, -5), at(55, -4), at(54, -9 - gape), at(44, -11 - gape), at(22, -9 - gape)], '#04060a');
  for (let f = 22; f < 56; f += 5) {
    const [x, y] = at(f, -6);
    a.rect(Math.round(x), Math.round(y), 1, 2 + (f % 2), T.tooth);
  }
  if (lit) {
    // Uplight: the underside of the jaw is the brightest thing on it.
    for (let f = -6; f < 54; f += 2) {
      const [x, y] = at(f, -15 - gape * 0.7);
      a.tint(Math.round(x) - 1, Math.round(y) - 2, 4, 5, T.belly, 0.6);
    }
    for (let i = 0; i < 4; i++) a.tint(0, 0, HEAD, 40 + i * 9, '#070b12', 0.16);
  }
  rim(a, T.rim, T.side, rng);
  return {
    art: a,
    eyes: [off(22, 8), off(31, 6), off(39, 4)],
    chin: [off(8, -19 - gape * 0.6), off(22, -19 - gape), off(36, -17 - gape), off(48, -13 - gape)],
    throat: off(-8, -18),
  };
}

type HeadPose = 'level' | 'up' | 'down' | 'look';
const HEAD_POSE: Record<HeadPose, [number, number]> = { level: [-0.2, 2], up: [0.5, 12], down: [-0.78, 6], look: [-0.06, 0] };

/** A limb come down on the quay: a forearm out of the dark overhead, a wrist, three claws spread on the deck. */
const LIMB_W = 100;
const LIMB_H = 600;
const LIMB_RISE = 300;

function paintLimb(): Art {
  const a = new Art(LIMB_W, LIMB_H);
  const rng = new Rng(6151);
  const cx = LIMB_W / 2;
  const hideCol = '#27313e';
  const F = LIMB_H;
  const wrist = F - 52;
  // Forearm: it leans as it comes down, swells below the elbow and narrows to the wrist.
  const mid = (y: number): number => cx + Math.sin((y / wrist) * 2.4 + 0.5) * 6 - (1 - y / wrist) * 9;
  const half = (y: number): number => {
    const u = y / wrist;
    return lerp(30, 18, u) + Math.exp(-Math.pow((u - 0.62) / 0.16, 2)) * 5 + (valueNoise(y * 0.09, 3) - 0.5) * 3;
  };
  for (let y = 0; y < wrist; y++) {
    const h = Math.round(half(y));
    a.rect(Math.round(mid(y)) - h, y, h * 2, 1, hideCol);
  }
  // A ragged fin down its trailing edge.
  for (let y = 30; y < wrist - 30; y += rng.int(26, 44)) {
    const x = Math.round(mid(y) + half(y)) - 2;
    const len = rng.int(7, 13);
    poly(a, [[x, y - 9], [x + len, y + 4], [x, y + 12]], hideCol);
  }
  // Wrist, a webbed palm, and three hooked claws that take the weight.
  ellipse(a, cx, wrist + 4, 25, 14, hideCol, 3, 5);
  poly(a, [[cx - 23, wrist], [cx + 23, wrist], [cx + 40, F - 16], [cx + 30, F - 9], [cx + 12, F - 14], [cx, F - 9], [cx - 12, F - 14], [cx - 30, F - 9], [cx - 40, F - 16]], hideCol);
  poly(a, [[cx - 40, F - 20], [cx - 47, F - 6], [cx - 46, F], [cx - 30, F], [cx - 27, F - 12]], hideCol);
  poly(a, [[cx - 9, F - 16], [cx - 9, F], [cx + 9, F], [cx + 9, F - 16]], hideCol);
  poly(a, [[cx + 40, F - 20], [cx + 47, F - 6], [cx + 46, F], [cx + 30, F], [cx + 27, F - 12]], hideCol);
  // Round it: light on the side toward the quay lamps, dark on the other.
  const g = a.c.createLinearGradient(cx - 34, 0, cx + 34, 0);
  g.addColorStop(0, 'rgba(96,124,150,0.5)');
  g.addColorStop(0.3, 'rgba(96,124,150,0)');
  g.addColorStop(0.62, 'rgba(6,9,14,0)');
  g.addColorStop(1, 'rgba(6,9,14,0.7)');
  a.tint(0, 0, LIMB_W, F, g, 1);
  // Plates across the forearm, each with a lit lip; they sag like the hide of something very old.
  for (let y = 10; y < wrist - 6; y += rng.int(11, 17)) {
    for (let x = 0; x < LIMB_W; x += 4) {
      const sag = Math.round(Math.sin((x - cx) * 0.07) * 3 + Math.cos(x * 0.5 + y) * 0.6);
      a.tint(x, y + sag, 4, 2, '#0e141b', 0.85);
      a.tint(x, y + sag + 2, 4, 1, '#46586b', 0.5);
    }
  }
  a.speckle(0, 0, LIMB_W, F, '#8296a4', 260, () => rng.next());
  a.speckle(0, 0, LIMB_W, F, '#0d1218', 520, () => rng.next());
  // Shell crusted where the plates overlap; weed hanging from it.
  for (let i = 0; i < 9; i++) {
    const bx = rng.int(24, 70);
    const by = rng.int(20, wrist - 20);
    for (let j = 0; j < 7; j++) a.tint(bx + rng.int(-4, 4), by + rng.int(-3, 3), 2, 2, rng.chance(0.5) ? '#93a4ae' : '#5c6c78', 0.9);
  }
  for (let i = 0; i < 22; i++) a.tint(rng.int(16, 82), rng.int(0, wrist - 40), 1, rng.int(18, 70), i % 3 ? '#16301f' : '#0f2418', 0.92);
  // Claws: bone, worn pale at the tips.
  for (const tx of [cx - 47, cx - 9, cx + 30]) {
    a.tint(tx, F - 12, 18, 12, '#6a7682', 0.55);
    a.tint(tx, F - 6, 18, 6, '#aab4bc', 0.6);
    a.tint(tx, F - 2, 18, 2, '#d4dade', 0.7);
  }
  a.tint(0, F - 22, LIMB_W, 5, '#0b1017', 0.45);
  // The cable, wound three times round the wrist and pulled tight into the hide.
  for (const y of [wrist - 12, wrist - 5, wrist + 3]) {
    a.tint(0, y, LIMB_W, 3, '#020304', 0.97);
    a.tint(0, y, LIMB_W, 1, '#2c3644', 0.9);
  }
  rim(a, '#5c7289', '#44566a', rng);
  return a;
}

/** The same limb laid along the deck: dragged for a sweep, or slack when it is stunned. Claws at the right-hand end. */
const SWEEP_W = 230;
const SWEEP_ART_H = 30;

function paintSweep(): Art {
  const a = new Art(SWEEP_W, SWEEP_ART_H);
  const rng = new Rng(2087);
  const hideCol = '#27313e';
  const F = SWEEP_ART_H;
  const arm = SWEEP_W - 44;
  // The top of the forearm, as it lies: humped behind the wrist, running down to the deck at the elbow end.
  const top = (x: number): number => {
    const u = x / arm;
    return F - 4 - Math.round(lerp(10, 15, u) + Math.sin(u * 5.2) * 2 + Math.exp(-Math.pow((u - 0.7) / 0.14, 2)) * 4);
  };
  for (let x = 0; x < arm; x++) a.rect(x, top(x), 1, F - top(x), hideCol);
  // Fins along its back.
  for (let x = 16; x < arm - 12; x += rng.int(18, 30)) {
    const h = rng.int(4, 7);
    poly(a, [[x - 5, top(x) + 1], [x + 2, top(x) - h], [x + 7, top(x) + 1]], hideCol);
  }
  ellipse(a, SWEEP_W - 46, F - 12, 14, 11, hideCol, 2, 3);
  poly(a, [[SWEEP_W - 46, F - 23], [SWEEP_W - 20, F - 26], [SWEEP_W - 2, F - 16], [SWEEP_W - 16, F - 15], [SWEEP_W - 36, F - 14]], hideCol);
  poly(a, [[SWEEP_W - 46, F - 14], [SWEEP_W - 16, F - 13], [SWEEP_W, F - 7], [SWEEP_W - 14, F - 6], [SWEEP_W - 40, F - 6]], hideCol);
  poly(a, [[SWEEP_W - 46, F - 7], [SWEEP_W - 22, F - 6], [SWEEP_W - 6, F - 1], [SWEEP_W - 42, F - 1]], hideCol);
  // Lit along the top, dark where it meets the deck.
  const g = a.c.createLinearGradient(0, 0, 0, F);
  g.addColorStop(0, 'rgba(96,124,150,0.5)');
  g.addColorStop(0.45, 'rgba(96,124,150,0)');
  g.addColorStop(0.6, 'rgba(6,9,14,0)');
  g.addColorStop(1, 'rgba(6,9,14,0.7)');
  a.tint(0, 0, SWEEP_W, F, g, 1);
  for (let x = 8; x < arm - 6; x += rng.int(11, 16)) {
    a.tint(x, 0, 2, F, '#0e141b', 0.85);
    a.tint(x + 2, 0, 1, F, '#46586b', 0.5);
  }
  a.speckle(0, 0, SWEEP_W, F, '#8296a4', 110, () => rng.next());
  a.speckle(0, 0, SWEEP_W, F, '#0d1218', 220, () => rng.next());
  for (const [tx, ty] of [
    [SWEEP_W - 12, F - 19],
    [SWEEP_W - 10, F - 10],
    [SWEEP_W - 15, F - 4],
  ] as const) {
    a.tint(tx - 6, ty - 1, 18, 5, '#6a7682', 0.5);
    a.tint(tx, ty, 12, 4, '#d4dade', 0.75);
  }
  for (const x of [SWEEP_W - 66, SWEEP_W - 60]) {
    a.tint(x, 0, 3, F, '#020304', 0.97);
    a.tint(x, 0, 1, F, '#2c3644', 0.9);
  }
  rim(a, '#6c8299', '#44566a', rng);
  return a;
}

/** Mist behind its head and shoulders, so the dark of it stands off the dark of the sky. */
function paintHalo(): Art {
  const a = new Art(420, 300);
  a.halo(200, 150, 190, '#5c7496', 0.24);
  a.halo(170, 120, 120, '#7c96b8', 0.2);
  return a;
}

interface Pieces {
  torso: Art;
  torsoLit: Art;
  heads: Record<HeadPose, { dark: HeadArt; lit: HeadArt }>;
  limb: Art;
  sweep: Art;
  halo: Art;
  /** Made the first time they are wanted. */
  dot?: Art;
  fall?: Art;
  foam?: Art;
  /** The container Gil swings into it, as seen from the quay. */
  load: Art;
}

let made: Pieces | null = null;

function pieces(): Pieces {
  if (made) return made;
  const head = (pose: HeadPose): { dark: HeadArt; lit: HeadArt } => {
    const [angle, gape] = HEAD_POSE[pose];
    return { dark: paintHead(DARK, false, angle, gape), lit: paintHead(LIT, true, angle, gape) };
  };
  const load = new Art(34, 17);
  load.rect(8, 0, 18, 2, '#4a3f20');
  load.rect(0, 2, 34, 15, '#1c2836');
  load.rect(0, 2, 34, 1, '#5c7896');
  load.rect(0, 2, 1, 15, '#3d5068');
  for (let i = 2; i < 34; i += 3) load.rect(i, 4, 1, 11, '#121b26');
  load.emit(1, 0, 2, 2, '#ff4b3a', 0.6);
  load.emit(31, 0, 2, 2, '#ff4b3a', 0.6);
  made = {
    torso: paintTorso(DARK, false),
    torsoLit: paintTorso(LIT, true),
    heads: { level: head('level'), up: head('up'), down: head('down'), look: head('look') },
    limb: paintLimb(),
    sweep: paintSweep(),
    halo: paintHalo(),
    load,
  };
  return made;
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/** The surface the body is put together on each frame. */
let scratch: Art | null = null;

/** Where on the body each barb is carried (creature space: u right, v up from the waterline), by barb id. */
const BARB_AT: Record<string, { on: 'torso' | 'neck' | 'throat'; at: number | P2 }> = {
  p1h1: { on: 'torso', at: [98, 96] },
  p1h2: { on: 'torso', at: [124, 112] },
  p1r: { on: 'torso', at: [128, 72] },
  p2h1: { on: 'torso', at: [262, 110] },
  p2h2: { on: 'torso', at: [288, 84] },
  p2r: { on: 'neck', at: 0.42 },
  p3h1: { on: 'torso', at: [206, 122] },
  p3h2: { on: 'neck', at: 0.14 },
  p3r: { on: 'throat', at: 0 },
};

/** Quadratic curve through the neck. */
function bez(a: P2, c: P2, b: P2, u: number): P2 {
  const k = 1 - u;
  return [k * k * a[0] + 2 * k * u * c[0] + u * u * b[0], k * k * a[1] + 2 * k * u * c[1] + u * u * b[1]];
}

/**
 * A tapering tube, rim-lit on its upper left. Drawn as filled arcs straight
 * onto the two surfaces: it is redrawn every frame, and this layer is out of
 * focus, so the cost of crisp rows would buy nothing.
 */
function tube(a: Art, pts: P2[], r0: number, r1: number, col: string, rimCol: string): void {
  const steps: [number, number, number][] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8));
    for (let j = 0; j <= n; j++) {
      const u = (i + j / n) / (pts.length - 1);
      steps.push([lerp(x0, x1, j / n), lerp(y0, y1, j / n), lerp(r0, r1, u)]);
    }
  }
  const fill = (k: CanvasRenderingContext2D, style: string, off: number): void => {
    k.fillStyle = style;
    k.beginPath();
    for (const [x, y, r] of steps) {
      k.moveTo(Math.round(x) + off + r, Math.round(y) + off);
      k.arc(Math.round(x) + off, Math.round(y) + off, r, 0, Math.PI * 2);
    }
    k.fill();
  };
  fill(a.c, rimCol, -1);
  fill(a.g, '#000', -1);
  fill(a.c, col, 0);
  fill(a.g, '#000', 0);
}

/** Light that glows, laid only onto what is already drawn (its own lights, under the hide). */
function glowAtop(a: Art, x: number, y: number, w: number, h: number, col: string, alpha: number): void {
  for (const k of [a.c, a.g]) {
    k.save();
    k.globalCompositeOperation = 'source-atop';
    k.globalAlpha = alpha;
    k.fillStyle = col;
    k.fillRect(Math.round(x), Math.round(y), w, h);
    k.restore();
  }
}

// ---------------------------------------------------------------------------
// The one way in
// ---------------------------------------------------------------------------

/** A light the Undertow puts on the quay, in world space. */
export interface KaijuLight {
  x: number;
  y: number;
  r: number;
  color: Vec3;
  dx?: number;
  dy?: number;
  inner?: number;
  outer?: number;
  shadow?: boolean;
  falloff?: number;
}

/**
 * Draw the Undertow as the simulation has it at time `t` (seconds, for
 * breathing, water and pulse). Far group: the body. Mid group: spray at the
 * waterline. Play layer: limbs on the quay, and the barbs in them.
 */
export function drawKaiju(st: Stage, k: Kaiju, t: number): void {
  if (k.mode === 'under' || k.mode === 'gone') return;
  const P = pieces();
  const deck = k.arena.deck;
  const a = k.attack;

  const up = k.rise * k.rise * (3 - 2 * k.rise);
  const sink = Math.round((1 - up) * 205 + k.slump * 16 - k.rear * 8 + Math.sin(t * 0.7) * 1.5);
  const lit = k.lit;
  const tone = (key: keyof Tones): string => (lit <= 0.01 ? DARK[key] : lit >= 0.99 ? LIT[key] : mix(DARK[key], LIT[key], lit));
  // Creature space (u right, v up from the waterline) → the scratch surface.
  const X = (u: number): number => u;
  const Y = (v: number): number => WL - v + sink;

  // ---- head and neck ----
  const sway = Math.sin(t * 0.43) * 3;
  const lean = a && a.zones[0] ? clamp(((a.zones[0].x0 + a.zones[0].x1) / 2 - KAIJU_X) / 700, -1, 1) * 12 : 0;
  let hu = 96 + sway + lean;
  let hv = 138 + Math.sin(t * 0.9) * 2;
  hu = lerp(hu, 132, k.rear);
  hv = lerp(hv, 142, k.rear);
  hu = lerp(hu, 70, k.slump);
  hv = lerp(hv, 80, k.slump);
  if (k.calm > 0) {
    // Freed: its head comes round and down toward the harbour lights.
    hu = lerp(hu, 88, k.calm);
    hv = lerp(hv, 118, k.calm);
  }
  hu += (hash2(Math.floor(t * 30), 3) - 0.5) * 5 * k.pain;
  const pose: HeadPose = k.slump > 0.5 ? 'down' : k.rear > 0.45 || k.pain > 0.55 ? 'up' : k.calm > 0.5 ? 'look' : 'level';
  const head = P.heads[pose];
  const neckBase: P2 = [X(152), Y(98)];
  const joint: P2 = [X(hu), Y(hv)];
  const bend: P2 = [X(lerp(152, hu, 0.5) + 9), Y(lerp(98, hv, 0.5) + 12 - k.slump * 6)];

  const s = (scratch ??= new Art(BW, BH));
  s.clearAll();

  // ---- far arm, torso, neck, head, near arm ----
  const arm = (i: 0 | 1): void => {
    const r = k.raise[i];
    const e = r * r * (3 - 2 * r);
    const sh: P2 = i === 0 ? [X(102), Y(84)] : [X(284), Y(88)];
    const elDown: P2 = i === 0 ? [X(66), Y(40)] : [X(320), Y(40)];
    const elUp: P2 = i === 0 ? [X(54), Y(132)] : [X(326), Y(136)];
    const wrDown: P2 = i === 0 ? [X(84), Y(-14)] : [X(302), Y(-14)];
    const wrUp: P2 = i === 0 ? [X(90), Y(250)] : [X(292), Y(250)];
    const el: P2 = [lerp(elDown[0], elUp[0], e), lerp(elDown[1], elUp[1], e)];
    const wr: P2 = [lerp(wrDown[0], wrUp[0], e), lerp(wrDown[1], wrUp[1], e)];
    tube(s, [sh, el, wr], 21, 13, tone('base'), tone('rim'));
  };
  arm(1);
  s.blit(P.torso, 0, Y(0) - TORSO_V0);
  if (lit > 0.01) s.blit(P.torsoLit, 0, Y(0) - TORSO_V0, { alpha: lit });
  const neck: P2[] = [];
  for (let i = 0; i <= 8; i++) neck.push(bez(neckBase, bend, joint, i / 8));
  tube(s, neck, 31, 19, tone('base'), tone('rim'));
  // A row of spines continues up the back of the neck.
  for (let i = 2; i <= 7; i++) {
    const [nx, ny] = neck[i]!;
    const r = lerp(31, 19, i / 8);
    poly(s, [[nx + r * 0.5 - 4, ny - r * 0.72], [nx + r * 0.62 + 2, ny - r - 5 - (i % 2) * 3], [nx + r * 0.86 + 3, ny - r * 0.42]], tone('base'));
  }
  const hx = Math.round(joint[0] - HJ);
  const hy = Math.round(joint[1] - HJ);
  s.blit(head.dark.art, hx, hy);
  if (lit > 0.01) s.blit(head.lit.art, hx, hy, { alpha: lit });
  arm(0);

  // ---- barbels hanging from the jaw ----
  for (let i = 0; i < head.dark.chin.length; i++) {
    const [cx, cy] = head.dark.chin[i]!;
    let px = joint[0] + cx;
    let py = joint[1] + cy;
    const len = 14 + ((i * 7) % 12);
    for (let j = 1; j <= len; j += 3) {
      const nx = joint[0] + cx + Math.sin(t * 1.4 + i * 1.9 + j * 0.2) * (j * 0.16);
      const ny = joint[1] + cy + j;
      s.line(px, py, nx, ny, tone('weed'));
      px = nx;
      py = ny;
    }
  }

  // ---- the cable, and the barbs it is hooked in by ----
  const barbAt = (b: Barb): P2 => {
    const where = BARB_AT[b.id] ?? { on: 'torso' as const, at: [190, 60] as P2 };
    if (where.on === 'neck') {
      const [nx, ny] = bez(neckBase, bend, joint, where.at as number);
      return [nx - 20, ny + 8];
    }
    if (where.on === 'throat') return [joint[0] + head.dark.throat[0], joint[1] + head.dark.throat[1]];
    const [u, v] = where.at as P2;
    return [X(u), Y(v)];
  };
  for (const ph of [1, 2, 3]) {
    const mine = k.barbs.filter((b) => b.phase === ph);
    const cutNow = k.cut[ph - 1]! >= 0;
    const since = Math.max(0, k.cut[ph - 1]!);
    // A cut length slides off it and is gone into the water.
    const drop = since * since * 70;
    if (drop > 240) continue;
    const pts = mine.map(barbAt);
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, y0] = pts[i]!;
      const [x1, y1] = pts[i + 1]!;
      const n = 6;
      let px = x0;
      let py = y0 + drop;
      for (let j = 1; j <= n; j++) {
        const u = j / n;
        const nx = lerp(x0, x1, u);
        const ny = lerp(y0, y1, u) + Math.sin(Math.PI * u) * (7 + since * 30) + drop * (1 + 0.3 * Math.sin(u * 5));
        s.line(px, py, nx, ny, '#020304', 2);
        px = nx;
        py = ny;
      }
    }
    if (cutNow) continue;
    for (let i = 0; i < mine.length; i++) {
      const b = mine[i]!;
      const [bx, by] = pts[i]!;
      const big = b.kind === 'root';
      s.rect(bx - (big ? 3 : 2), by - (big ? 3 : 2), big ? 6 : 4, big ? 6 : 4, '#06080c');
      if (b.gone) continue;
      // Live: it beats. Quicker when it is hurting.
      const beat = 0.55 + 0.45 * Math.sin(t * (big ? 7 : 5) + i * 1.7 + ph);
      const col = k.pain > 0.3 ? BARB_HOT : beat > 0.8 ? BARB_HOT : BARB;
      s.emit(bx - 1, by - 1, big ? 3 : 2, big ? 3 : 2, col, 0.85);
      if (big) {
        s.emit(bx - 3, by, 7, 1, shade(BARB, 0.7 * beat + 0.2), 0.6);
        s.emit(bx, by - 3, 1, 7, shade(BARB, 0.7 * beat + 0.2), 0.6);
      }
    }
  }

  // ---- eyes ----
  const blink = (t * 0.23) % 1 > 0.97 || (k.calm > 0.5 && (t * 0.11) % 1 > 0.9);
  const lid = k.slump > 0.5 ? 0.25 : k.pain > 0.4 ? 0.55 : 1;
  if (!blink) {
    for (let i = 0; i < head.dark.eyes.length; i++) {
      const [ex, ey] = head.dark.eyes[i]!;
      const x = Math.round(joint[0] + ex);
      const y = Math.round(joint[1] + ey);
      const wide = i === 0 ? 3 : 2;
      s.emit(x - 1, y, wide, lid < 0.5 ? 1 : 2, shade(EYE, 0.55 + 0.45 * lid), 0.9);
      if (lid >= 0.5) s.rect(x, y, 1, 2, '#0a0d08');
    }
  }

  // ---- its own light, once the cable is off it ----
  if (k.calm > 0.02) {
    for (let i = 0; i < 46; i++) {
      const u = 60 + ((i * 53) % 250);
      const v = 14 + ((i * 29) % 96) + Math.sin(u * 0.05) * 6;
      const tw = 0.5 + 0.5 * Math.sin(t * 1.3 - u * 0.03 + i);
      if (tw < 0.25) continue;
      glowAtop(s, X(u), Y(v), 1 + (i % 3 === 0 ? 1 : 0), 1, BIO, k.calm * tw * 0.85);
    }
    for (let i = 1; i <= 7; i++) {
      const [nx, ny] = neck[i]!;
      glowAtop(s, nx - 10, ny + 4, 2, 1, BIO, k.calm * (0.4 + 0.5 * Math.sin(t * 1.3 + i)));
    }
  }

  // ---- water running off it, and the wet catching light ----
  const run = k.churn;
  if (run > 0.03) {
    for (let i = 0; i < 54; i++) {
      const x = (i * 37 + 11) % BW;
      const y = Math.floor(((hash2(i, 5) + t * (0.5 + hash2(i, 9) * 0.6)) % 1) * BH);
      s.tint(x, y, 1, 5 + (i % 5), '#8fb0cc', run * 0.34);
    }
  }
  for (let i = 0; i < 40; i++) {
    const n = hash2(i, Math.floor(t * 3 + i * 0.37));
    if (n > 0.3) continue;
    s.tint(Math.floor(hash2(i, 77) * BW), Math.floor(hash2(i, 91) * (WL - 6)), 1, 1, tone('glint'), 0.9);
  }

  // ---- the air between it and the quay: rain and spray lift its darks, most of all low down ----
  for (const [y0, h, k] of [[0, 90, 0.08], [90, 60, 0.14], [150, BH - 150, 0.22]] as const) s.tint(0, y0, BW, h, AIR, k * (1 - 0.6 * lit), false);

  // ---- the waterline: everything below it is under ----
  s.clear(0, WL, BW, BH - WL);
  const foam = 0.15 + run * 0.85;
  for (let x = 20; x < BW - 10; x += 2) {
    const n = valueNoise(x * 0.13 + t * 1.6, t * 0.6, 7);
    const m = valueNoise(x * 0.47 - t * 2.3, 3.1, 11);
    if (n < 0.78 - foam * 0.4 || m < 0.3) continue;
    const h = 1 + Math.floor(n * m * 5 * foam);
    s.tint(x, WL - h, 2, h, m > 0.7 ? '#c8dcec' : '#7f9db8', 0.25 + 0.45 * foam, false);
  }

  // ---- present: standing on the water, at its distance ----
  const waterY = deck + WATER_DROP;
  const bx = KAIJU_X - (BW / 2) * KS;
  const by = waterY - WL * KS;
  /** A point of the scratch surface, in the world. */
  const wx = (u: number): number => bx + u * KS;
  const wy = (v: number): number => by + v * KS;
  // Mist is not a thing with an edge: it goes on the far backdrop, where the body's own distance would put it.
  const hp = 1 / KS;
  st.layer('far', P.halo, 240 * (1 - hp) + bx * hp - 40, (135 + st.lift) * (1 - hp) + by * hp - 60 + sink * 0.5, hp, hp, clamp01(up * 1.2) * (0.8 + 0.2 * lit));
  st.depthSprite(s, bx, by, KAIJU_Z, false, KS, GAIN, 0);

  // The relay's pulse, breaking over it.
  if (k.shock > 0.01) {
    const r = 14 + (1 - k.shock) * 210;
    const dot = (P.dot ??= new Art(2, 2).emit(0, 0, 2, 2, BIO, 0.9));
    for (let i = 0; i < 72; i++) {
      // It thins out as it spreads, instead of fading.
      if (hash2(i, 17) > k.shock * 1.4) continue;
      const ang = (i / 72) * Math.PI * 2;
      const wob = 1 + 0.04 * Math.sin(i * 5 + t * 30);
      st.depthSprite(dot, wx(hu + Math.cos(ang) * r * wob), wy(Y(hv) + Math.sin(ang) * r * 0.72 * wob), KAIJU_Z - 12, false, KS, GAIN, 0);
    }
  }

  // Something Gil has swung into it.
  if (k.swing > 0.01) {
    const u = k.swing;
    const sx = lerp(-150, hu - 30, u * u);
    const sy = lerp(Y(60), Y(hv) - 8, u) - Math.sin(Math.PI * u) * 30;
    const fall = (P.fall ??= new Art(1, 200).rect(0, 0, 1, 200, '#05070b'));
    st.depthSprite(fall, wx(sx + 16), wy(sy - 200), KAIJU_Z - 14, false, KS, GAIN, 0);
    st.depthSprite(P.load, wx(sx), wy(sy), KAIJU_Z - 14, false, KS, GAIN, 0);
  }

  // Rings of white water spreading from it across the channel, each band nearer the quay than the last.
  if (up > 0.02) {
    const f = (P.foam ??= new Art(FOAM_W, FOAM_H));
    const dark = '#0a121e';
    for (let band = 0; band < 4; band++) {
      f.clearAll();
      for (let i = band; i < 26; i += 4) {
        const phase = (t * (0.11 + band * 0.03) + i * 0.137) % 1;
        const reach = 30 + phase * (150 + run * 120);
        const side = i % 2 ? 1 : -1;
        const x = FOAM_W / 2 + side * reach + (hash2(i, 3) - 0.5) * 26;
        const alpha = (1 - phase) * (0.16 + run * 0.55) * clamp01(up * 3);
        if (alpha < 0.03) continue;
        f.rect(Math.round(x), FOAM_H - 1, 6 + Math.floor(phase * 14), 1, mix(dark, '#bcd6ea', Math.min(1, alpha * 1.5)));
      }
      if (band === 0 && run > 0.15) {
        // Spray thrown up where the water breaks against it.
        for (let i = 0; i < 30; i++) {
          const n = hash2(i, Math.floor(t * 18));
          const a2 = run * (1 - n) * 0.8;
          if (a2 < 0.2) continue;
          f.rect(Math.round(FOAM_W / 2 - BW / 2 + 40 + hash2(i, 41) * (BW - 80)), Math.round(FOAM_H - 2 - n * 18 * run), 1, 1 + (i % 2), mix(dark, '#e4f0fa', Math.min(1, a2 * 1.4)));
        }
      }
      // A band lies flat on the water: stood at its own depth, its foot on the surface.
      const fz = KAIJU_Z - 30 - band * 90;
      const fs = 1 + fz / FOCAL;
      st.depthSprite(f, KAIJU_X - (FOAM_W / 2) * fs, waterY - FOAM_H * fs, fz, false, fs, GAIN, 0);
    }
  }

  // ---- play layer: what reaches the quay ----
  if (a && a.kind === 'slam') {
    for (const z of a.zones) {
      // Claws on the deck when it is down; held `LIMB_RISE` px above it, out of sight, when it is not.
      const down = k.limbDown(a, z);
      const cx = Math.round((z.x0 + z.x1) / 2);
      const jolt = z.landed && a.t - z.at < 0.25 ? Math.round(Math.sin((a.t - z.at) * 60) * 2) : 0;
      st.sprite(P.limb, cx - LIMB_W / 2, Math.round(deck - LIMB_H - (1 - down) * LIMB_RISE) + jolt, z.limb === 1);
      if (z.landed && a.stage !== 'lift') st.occluder(cx - 16, deck - 230, 32, 190);
    }
  }
  if (a && a.kind === 'sweep') {
    const tell = a.stage === 'tell';
    const lead = a.pos + (tell ? Math.sin(t * 50) * 1.5 : 0);
    const x = a.dir > 0 ? lead - SWEEP_W : lead;
    st.sprite(P.sweep, x, deck - SWEEP_ART_H + 1, a.dir < 0);
    if (!tell) {
      for (let i = 0; i < 6; i++) {
        st.emit(lead - a.dir * (2 + hash2(i, Math.floor(t * 40)) * SWEEP_LEN), deck - 1 - Math.floor(hash2(i + 5, Math.floor(t * 33)) * 5), 1, 1, i % 2 ? '#ffe24a' : '#ffb347', 1, 0.9);
      }
    }
  }
  if (k.slump > 0.02) {
    // Slack along the quay, its wrist where she can reach it.
    const fall = Math.round((1 - k.slump * k.slump) * -260);
    const away = k.restDir > 0;
    st.sprite(P.sweep, away ? k.restX - 46 : k.restX - (SWEEP_W - 46), deck - SWEEP_ART_H + 1 + fall, away);
  }
  for (const b of k.barbs) if (b.armed && !b.gone) drawBarb(st, b, t, k.pain);
}

/** A barb in the play layer: a cable pod hooked into the hide, lit from inside. */
function drawBarb(st: Stage, b: Barb, t: number, pain: number): void {
  const x = Math.round(b.x);
  const y = Math.round(b.y);
  const big = b.kind === 'root';
  const beat = 0.5 + 0.5 * Math.sin(t * (big ? 9 : 7));
  const hit = b.hitT < 0.1;
  const core = hit ? '#ffffff' : pain > 0.3 || beat > 0.75 ? BARB_HOT : BARB;
  const hw = big ? 5 : 4;
  const hh = big ? 7 : 5;
  // Prongs sunk into the limb, the pod, the cable tails.
  st.rect(x - hw - 3, y - 1, 3, 2, '#05070a');
  st.rect(x + hw, y - 1, 3, 2, '#05070a');
  st.rect(x - 1, y + hh, 2, big ? 5 : 3, '#05070a');
  if (big) {
    st.rect(x - hw - 5, y + 1, 2, 4, '#05070a');
    st.rect(x + hw + 3, y + 1, 2, 4, '#05070a');
  }
  st.rect(x - hw, y - hh, hw * 2, hh * 2, '#11151c');
  st.rect(x - hw, y - hh, hw * 2, 1, '#3a4452');
  st.rect(x - hw, y - hh, 1, hh * 2, '#2a323e');
  st.emit(x - hw + 2, y - hh + 2, hw * 2 - 4, hh * 2 - 4, core, 0.75 + 0.25 * beat, 0.7);
  st.emit(x - 1, y - hh - 2, 2, 2, BARB, 0.5 + 0.5 * beat, 0.6);
  // How much of it is left.
  for (let i = 0; i < b.max; i++) st.emit(x - b.max * 2 + i * 4 + 1, y + hh + (big ? 7 : 5), 2, 1, i < b.hp ? BARB_HOT : '#30263a', 1, i < b.hp ? 0.7 : 0.3);
}

/**
 * Light the Undertow puts on the quay (world space): its barbs, the flash of
 * a limb landing, and the quay's own floodlights once they are turned on it.
 * `lamps` are the heads of the floodlight masts.
 */
export function kaijuLights(k: Kaiju, t: number, lamps: P2[]): KaijuLight[] {
  const out: KaijuLight[] = [];
  if (k.mode === 'under' || k.mode === 'gone') return out;
  const deck = k.arena.deck;
  for (const b of k.barbs) {
    if (!b.armed || b.gone) continue;
    const beat = 0.7 + 0.3 * Math.sin(t * 8);
    const big = b.kind === 'root';
    out.push({ x: b.x, y: b.y, r: big ? 86 : 64, color: [0.95 * beat, 0.42 * beat, 1.15 * beat], falloff: 1.4 });
  }
  const a = k.attack;
  if (a && a.kind === 'slam') {
    for (const z of a.zones) {
      const since = a.t - z.at;
      if (z.landed && since < 0.22) {
        const f = 1 - since / 0.22;
        out.push({ x: (z.x0 + z.x1) / 2, y: deck - 8, r: 150, color: [0.9 * f, 1.0 * f, 1.2 * f], falloff: 1.2 });
      }
    }
  }
  if (k.lit > 0.01) {
    // Beams in the rain, all converging on where it stands.
    for (const [x, y] of lamps) {
      const tx = KAIJU_X + (x - KAIJU_X) * 0.25;
      const ty = deck - 420;
      const d = Math.hypot(tx - x, ty - y) || 1;
      out.push({ x, y, r: 420, color: [1.35 * k.lit, 1.5 * k.lit, 1.7 * k.lit], dx: (tx - x) / d, dy: (ty - y) / d, inner: 0.07, outer: 0.2, falloff: 0.9 });
    }
  }
  return out;
}
