import { Art } from './art';

/**
 * The world's depth: floors, the sides and tops of buildings, set-back walls.
 *
 * The play layer is still flat pixel art, drawn exactly as authored. What
 * stands behind and in front of it is real geometry, seen through a
 * perspective lens, so the ground runs away to a horizon and a building has
 * a side and a roof as well as a face.
 */

/** Distance from the lens to the play plane at zoom 1, in world px. Shorter is a wider, deeper-looking lens. */
export const FOCAL = 520;

/** Depth (world px behind the play plane) that a parallax scroll factor stands for. */
export const depthOf = (parallax: number): number => FOCAL * (1 / parallax - 1);

export interface TexRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Mean colour, used where the texture is too far away to resolve. */
  avg: [number, number, number];
}

export interface Surface {
  /** Brightness baked into the face (a side wall sits in shade). */
  shade?: number;
  /** How much the scene's lamps reach it, 0..1. */
  lit?: number;
  /** Wet-floor reflectivity, 0..1: puddles on it mirror, the ground between them only shines. */
  wet?: number;
  /** Open water: the whole surface mirrors, however far away it is. */
  water?: boolean;
  /** Repeat the texture 1:1 with world px instead of stretching it over the face. */
  tile?: boolean;
  /** Cut out where the texture is transparent (fences, props, set-back facades with a skyline). */
  cut?: boolean;
  /** Slide a tiled texture, so neighbours sharing one do not repeat in step. */
  u0?: number;
  v0?: number;
}

export interface WorldGeo {
  /** Interleaved: position 3, uv 2, atlas rect 4, material 4, mean colour 3. */
  verts: Float32Array;
  count: number;
  /** The same, for what stands in front of the play plane (drawn over it). */
  near: Float32Array;
  nearCount: number;
  atlas: Art;
  /** Height of the main ground: the plane wet reflections mirror about. */
  floorY: number;
}

export const WORLD_STRIDE = 16;

type V3 = [number, number, number];
type V2 = [number, number];

export class WorldBuilder {
  readonly atlas: Art;
  floorY = 0;
  private v: number[] = [];
  private nv: number[] = [];
  private size: number;
  private penX = 1;
  private penY = 1;
  private shelf = 0;

  constructor(size = 2048) {
    this.size = size;
    this.atlas = new Art(size, size);
  }

  /**
   * Reserve a block of the texture atlas and aim the atlas's drawing origin
   * at it, so a painter can draw from (0, 0). Call `seal` when done.
   */
  region(w: number, h: number): TexRegion {
    w = Math.max(1, Math.ceil(w));
    h = Math.max(1, Math.ceil(h));
    if (this.penX + w + 1 > this.size) {
      this.penX = 1;
      this.penY += this.shelf + 1;
      this.shelf = 0;
    }
    if (this.penY + h + 1 > this.size) throw new Error('world atlas is full');
    const r: TexRegion = { x: this.penX, y: this.penY, w, h, avg: [0.2, 0.22, 0.28] };
    this.penX += w + 1;
    this.shelf = Math.max(this.shelf, h);
    // Clip, so a painter that overshoots cannot scribble on its neighbours.
    for (const k of [this.atlas.c, this.atlas.g]) {
      k.save();
      k.setTransform(1, 0, 0, 1, r.x, r.y);
      k.beginPath();
      k.rect(0, 0, w, h);
      k.clip();
    }
    this.atlas.ox = r.x;
    this.atlas.oy = r.y;
    return r;
  }

  /** Finish a region: measure its mean colour and put the atlas origin back. */
  seal(r: TexRegion): TexRegion {
    for (const k of [this.atlas.c, this.atlas.g]) k.restore();
    this.atlas.setOrigin(0, 0);
    const d = this.atlas.c.getImageData(r.x, r.y, r.w, r.h).data;
    let n = 0;
    const sum = [0, 0, 0];
    const step = Math.max(1, Math.floor((r.w * r.h) / 1500)) * 4;
    for (let i = 0; i < d.length; i += step) {
      if (d[i + 3]! < 128) continue;
      sum[0]! += d[i]!;
      sum[1]! += d[i + 1]!;
      sum[2]! += d[i + 2]!;
      n++;
    }
    if (n > 0) r.avg = [sum[0]! / n / 255, sum[1]! / n / 255, sum[2]! / n / 255];
    return r;
  }

  private quad(p: [V3, V3, V3, V3], uv: [V2, V2, V2, V2], r: TexRegion, s: Surface, floor: boolean): void {
    const flags = (s.tile ? 1 : 0) + (s.cut ? 2 : 0) + (floor ? 4 : 0);
    // Upright things nearer than the play plane are drawn over it; floors never are.
    const out = !floor && p.every((q) => q[2] < 0) ? this.nv : this.v;
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const q = p[i]!;
      const t = uv[i]!;
      out.push(q[0], q[1], q[2], t[0], t[1], r.x, r.y, r.w, r.h, s.shade ?? 1, s.lit ?? 1, s.water ? 2 : Math.min(1, s.wet ?? 0), flags, r.avg[0], r.avg[1], r.avg[2]);
    }
  }

  /** A horizontal surface at height y, from depth z0 (near) back to z1. */
  floor(x0: number, x1: number, y: number, z0: number, z1: number, r: TexRegion, s: Surface = {}): void {
    const uv: [V2, V2, V2, V2] = s.tile
      ? [
          [x0, -z1],
          [x1, -z1],
          [x1, -z0],
          [x0, -z0],
        ]
      : [
          [0, 0],
          [r.w, 0],
          [r.w, r.h],
          [0, r.h],
        ];
    this.quad(
      [
        [x0, y, z1],
        [x1, y, z1],
        [x1, y, z0],
        [x0, y, z0],
      ],
      uv,
      r,
      s,
      true,
    );
  }

  /** A wall seen edge-on from the front: a plane of constant x running back from z0 to z1. */
  side(x: number, yTop: number, yBot: number, z0: number, z1: number, r: TexRegion, s: Surface = {}): void {
    const ua = s.u0 ?? 0;
    const va = s.tile ? (s.v0 ?? 0) - (yBot - yTop) : 0;
    const u1 = ua + (s.tile ? z1 - z0 : r.w);
    const v1 = va + (s.tile ? yBot - yTop : r.h);
    this.quad(
      [
        [x, yTop, z0],
        [x, yTop, z1],
        [x, yBot, z1],
        [x, yBot, z0],
      ],
      [
        [ua, va],
        [u1, va],
        [u1, v1],
        [ua, v1],
      ],
      r,
      { shade: 0.62, ...s },
      false,
    );
  }

  /** A wall facing the lens at depth z: a set-back facade, a fence, a cut-out prop. */
  face(x0: number, x1: number, yTop: number, yBot: number, z: number, r: TexRegion, s: Surface = {}): void {
    const ua = s.u0 ?? 0;
    // Tiled walls are laid from the ground up, so storeys line up with the street.
    const va = s.tile ? (s.v0 ?? 0) - (yBot - yTop) : 0;
    const u1 = ua + (s.tile ? x1 - x0 : r.w);
    const v1 = va + (s.tile ? yBot - yTop : r.h);
    this.quad(
      [
        [x0, yTop, z],
        [x1, yTop, z],
        [x1, yBot, z],
        [x0, yBot, z],
      ],
      [
        [ua, va],
        [u1, va],
        [u1, v1],
        [ua, v1],
      ],
      r,
      s,
      false,
    );
  }

  /**
   * The parts of a block that the flat front view never showed: its two
   * sides and its top, running back from the play plane to depth `z1`.
   */
  block(x0: number, x1: number, yTop: number, yBot: number, z1: number, tex: { side: TexRegion; top: TexRegion }, s: Surface = {}, z0 = 0): void {
    this.side(x0, yTop, yBot, z0, z1, tex.side, { tile: true, ...s });
    this.side(x1, yTop, yBot, z0, z1, tex.side, { tile: true, ...s });
    this.floor(x0, x1, yTop, z0, z1, tex.top, { tile: true, shade: 0.9, ...s });
  }

  build(): WorldGeo {
    return {
      verts: new Float32Array(this.v),
      count: this.v.length / WORLD_STRIDE,
      near: new Float32Array(this.nv),
      nearCount: this.nv.length / WORLD_STRIDE,
      atlas: this.atlas,
      floorY: this.floorY,
    };
  }
}

/**
 * Sprites that stand at a depth of their own this frame (people on the far
 * pavement, someone crossing close to the lens). Each is copied into a small
 * sheet and drawn as an upright card in the world, so it is lit, focused and
 * hidden by buildings like everything else at its distance.
 */
export class SpriteBatch {
  static readonly SIZE = 1024;
  readonly sheet = new Art(SpriteBatch.SIZE, 512);
  /** Vertices of sprites behind the play plane, then of those in front. */
  back: number[] = [];
  near: number[] = [];
  private penX = 0;
  private penY = 0;
  private shelf = 0;

  begin(): void {
    this.back.length = 0;
    this.near.length = 0;
    this.penX = 0;
    this.penY = 0;
    this.shelf = 0;
    this.sheet.clearAll();
  }

  /**
   * Stand `art` in the world with its top-left corner at (x, y) and depth z.
   * `scale` enlarges it about that corner (set dressing drawn small). `shade`
   * multiplies its colour and `lit` is how much of the scene's lamps it takes
   * (0 for something painted with its own light, far out of their reach).
   */
  add(art: Art, x: number, y: number, z: number, flip = false, scale = 1, shade = 1, lit = 1): void {
    const w = art.w;
    const h = art.h;
    if (this.penX + w + 1 > SpriteBatch.SIZE) {
      this.penX = 0;
      this.penY += this.shelf + 1;
      this.shelf = 0;
    }
    if (this.penY + h > this.sheet.h) return;
    const u = this.penX;
    const v = this.penY;
    this.sheet.c.drawImage(art.color, u, v);
    this.sheet.g.drawImage(art.glow, u, v);
    this.penX += w + 1;
    this.shelf = Math.max(this.shelf, h);
    const x1 = x + w * scale;
    const y1 = y + h * scale;
    const ua = flip ? w : 0;
    const ub = flip ? 0 : w;
    const out = z < 0 ? this.near : this.back;
    const corner = (px: number, py: number, tu: number, tv: number): void => {
      out.push(px, py, z, tu, tv, u, v, w, h, shade, lit, 0, 2, 0.2, 0.2, 0.2);
    };
    corner(x, y, ua, 0);
    corner(x1, y, ub, 0);
    corner(x1, y1, ub, h);
    corner(x, y, ua, 0);
    corner(x1, y1, ub, h);
    corner(x, y1, ua, h);
  }
}
