import { rgb, shade } from '../core/color';

export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function ctx2d(c: HTMLCanvasElement, readback = false): Ctx {
  const x = c.getContext('2d', readback ? { willReadFrequently: true } : undefined);
  if (!x) throw new Error('2D canvas is not available');
  x.imageSmoothingEnabled = false;
  return x;
}

export type FontId = 'g7' | 'g9' | 'g11' | 'g11b' | 'g14';
const FONTS: Record<FontId, string> = {
  g7: '8px Galmuri7',
  g9: '10px Galmuri9',
  g11: '12px Galmuri11',
  g11b: 'bold 12px Galmuri11',
  g14: '15px Galmuri14',
};

interface TextMask {
  w: number;
  h: number;
  /** Horizontal runs: [x, y, length] triples. */
  runs: Int16Array;
}

const maskCache = new Map<string, TextMask>();
let scratch: Ctx | null = null;

/** Rasterise a string to crisp 1-bit runs (trimmed to its ink box). */
function textMask(str: string, font: FontId): TextMask {
  const key = font + '\u0001' + str;
  const hit = maskCache.get(key);
  if (hit) return hit;
  if (!scratch) scratch = ctx2d(makeCanvas(512, 40), true);
  const s = scratch;
  s.font = FONTS[font];
  const mw = Math.min(510, Math.ceil(s.measureText(str).width) + 4);
  const mh = 36;
  s.clearRect(0, 0, 512, 40);
  s.fillStyle = '#fff';
  s.textBaseline = 'alphabetic';
  s.fillText(str, 2, 24);
  const data = s.getImageData(0, 0, mw, mh).data;
  let minX = mw;
  let minY = mh;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      if (data[(y * mw + x) * 4 + 3]! > 110) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const runs: number[] = [];
  if (maxX >= 0) {
    for (let y = minY; y <= maxY; y++) {
      let start = -1;
      for (let x = minX; x <= maxX + 1; x++) {
        const on = x <= maxX && data[(y * mw + x) * 4 + 3]! > 110;
        if (on && start < 0) start = x;
        else if (!on && start >= 0) {
          runs.push(start - minX, y - minY, x - start);
          start = -1;
        }
      }
    }
  }
  const m: TextMask = {
    w: maxX >= 0 ? maxX - minX + 1 : 0,
    h: maxY >= 0 ? maxY - minY + 1 : 0,
    runs: Int16Array.from(runs),
  };
  maskCache.set(key, m);
  return m;
}

export interface TextOpts {
  font?: FontId;
  scale?: number;
  /** Draw as an emissive (self-lit, blooming) shape. */
  emit?: boolean;
  base?: number;
  align?: 'left' | 'center' | 'right';
  /** Stack characters top to bottom (Korean vertical signboards). */
  vertical?: boolean;
  gap?: number;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export interface BlitOpts {
  flip?: boolean;
  alpha?: number;
}

/**
 * A piece of pixel art with two aligned surfaces:
 *  - `color`: albedo, multiplied by scene lighting at render time;
 *  - `glow`: self-emitted light (neon, lamps, windows), unlit and fed to bloom.
 * Opaque shapes write black into `glow` so they correctly occlude lights behind them.
 */
export class Art {
  readonly w: number;
  readonly h: number;
  readonly color: HTMLCanvasElement;
  readonly glow: HTMLCanvasElement;
  readonly c: Ctx;
  readonly g: Ctx;
  /** Drawing origin: painters work in world coordinates, offset into the surface by this. */
  ox = 0;
  oy = 0;

  constructor(w: number, h: number) {
    this.color = makeCanvas(w, h);
    this.glow = makeCanvas(w, h);
    this.w = this.color.width;
    this.h = this.color.height;
    this.c = ctx2d(this.color, true);
    this.g = ctx2d(this.glow, true);
  }

  /** Shift every subsequent drawing call by (ox, oy). */
  setOrigin(ox: number, oy: number): this {
    this.ox = ox;
    this.oy = oy;
    this.c.setTransform(1, 0, 0, 1, ox, oy);
    this.g.setTransform(1, 0, 0, 1, ox, oy);
    return this;
  }

  clearAll(): this {
    this.c.clearRect(-this.ox, -this.oy, this.w, this.h);
    this.g.clearRect(-this.ox, -this.oy, this.w, this.h);
    return this;
  }

  clear(x: number, y: number, w: number, h: number): this {
    this.c.clearRect(x | 0, y | 0, w | 0, h | 0);
    this.g.clearRect(x | 0, y | 0, w | 0, h | 0);
    return this;
  }

  private styles(col: string, emissive: boolean, base: number): void {
    if (emissive) {
      this.c.fillStyle = shade(col, base);
      this.g.fillStyle = col;
    } else {
      this.c.fillStyle = col;
      this.g.fillStyle = '#000';
    }
  }

  private span(x: number, y: number, w: number, h: number): void {
    this.c.fillRect(x, y, w, h);
    this.g.fillRect(x, y, w, h);
  }

  rect(x: number, y: number, w: number, h: number, col: string): this {
    if (w <= 0 || h <= 0) return this;
    this.styles(col, false, 0);
    this.span(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    return this;
  }

  /** Self-lit rectangle. `base` is how bright the albedo underneath is. */
  emit(x: number, y: number, w: number, h: number, col: string, base = 0.3): this {
    if (w <= 0 || h <= 0) return this;
    this.styles(col, true, base);
    this.span(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    return this;
  }

  px(x: number, y: number, col: string): this {
    return this.rect(x, y, 1, 1, col);
  }

  epx(x: number, y: number, col: string, base = 0.3): this {
    return this.emit(x, y, 1, 1, col, base);
  }

  private rasterLine(x0: number, y0: number, x1: number, y1: number, th: number): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const o = (th - 1) >> 1;
    for (;;) {
      this.span(x0 - o, y0 - o, th, th);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** Aliased (crisp) line. */
  line(x0: number, y0: number, x1: number, y1: number, col: string, th = 1): this {
    this.styles(col, false, 0);
    this.rasterLine(x0, y0, x1, y1, th);
    return this;
  }

  disc(cx: number, cy: number, r: number, col: string, emissive = false, base = 0.3): this {
    this.styles(col, emissive, base);
    cx = Math.round(cx);
    cy = Math.round(cy);
    const rr = (r + 0.35) * (r + 0.35);
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      const half = Math.floor(Math.sqrt(Math.max(0, rr - dy * dy)));
      if (rr - dy * dy < 0) continue;
      this.span(cx - half, cy + dy, half * 2 + 1, 1);
    }
    return this;
  }

  /**
   * Two-colour ordered-dither fill. `fn(u, v)` returns the 0..1 share of
   * `colB` at that point; u and v run 0..1 across the rectangle.
   */
  dither(
    x: number,
    y: number,
    w: number,
    h: number,
    colA: string,
    colB: string,
    fn: (u: number, v: number) => number,
  ): this {
    x = Math.round(x);
    y = Math.round(y);
    w = Math.round(w);
    h = Math.round(h);
    if (w <= 0 || h <= 0) return this;
    const img = this.c.createImageData(w, h);
    const d = img.data;
    const A = rgb(colA);
    const B = rgb(colB);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const t = fn(w > 1 ? i / (w - 1) : 0, h > 1 ? j / (h - 1) : 0);
        const th = (BAYER[((y + j) & 3) * 4 + ((x + i) & 3)]! + 0.5) / 16;
        const C = t > th ? B : A;
        const k = (j * w + i) * 4;
        d[k] = C[0];
        d[k + 1] = C[1];
        d[k + 2] = C[2];
        d[k + 3] = 255;
      }
    }
    this.c.putImageData(img, x + this.ox, y + this.oy);
    this.g.fillStyle = '#000';
    this.g.fillRect(x, y, w, h);
    return this;
  }

  /** Translucent overlay that only affects pixels already drawn (grime, shade, baked light). */
  tint(x: number, y: number, w: number, h: number, style: string | CanvasGradient, alpha: number, dimGlow = true): this {
    const c = this.c;
    c.save();
    c.globalCompositeOperation = 'source-atop';
    c.globalAlpha = alpha;
    c.fillStyle = style;
    c.fillRect(x, y, w, h);
    c.restore();
    if (dimGlow) {
      const g = this.g;
      g.save();
      g.globalCompositeOperation = 'source-atop';
      g.globalAlpha = alpha;
      g.fillStyle = '#000';
      g.fillRect(x, y, w, h);
      g.restore();
    }
    return this;
  }

  /** Free-floating soft halo (adds pixels; use for haze around distant lights). */
  halo(cx: number, cy: number, r: number, col: string, alpha: number): this {
    const A = rgb(col);
    for (const k of [this.c, this.g]) {
      k.save();
      const grad = k.createRadialGradient(cx, cy, 0, cx, cy, r);
      const a = k === this.c ? alpha * 0.25 : alpha;
      grad.addColorStop(0, `rgba(${A[0]},${A[1]},${A[2]},${a})`);
      grad.addColorStop(1, `rgba(${A[0]},${A[1]},${A[2]},0)`);
      k.fillStyle = grad;
      k.fillRect(cx - r, cy - r, r * 2, r * 2);
      k.restore();
    }
    return this;
  }

  /** Scatter single pixels over existing art (texture, grit, rivets). */
  speckle(x: number, y: number, w: number, h: number, col: string, count: number, rnd: () => number): this {
    const c = this.c;
    c.save();
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = col;
    for (let i = 0; i < count; i++) c.fillRect(Math.floor(x + rnd() * w), Math.floor(y + rnd() * h), 1, 1);
    c.restore();
    return this;
  }

  text(str: string, x: number, y: number, col: string, o: TextOpts = {}): this {
    const font = o.font ?? 'g11';
    const scale = o.scale ?? 1;
    this.styles(col, !!o.emit, o.base ?? 0.3);
    x = Math.round(x);
    y = Math.round(y);
    if (o.vertical) {
      const gap = o.gap ?? 1;
      const chars = [...str];
      let widest = 0;
      for (const ch of chars) widest = Math.max(widest, textMask(ch, font).w);
      let cy = y;
      for (const ch of chars) {
        const m = textMask(ch, font);
        const ox = x + Math.floor(((widest - m.w) * scale) / 2);
        for (let i = 0; i < m.runs.length; i += 3) {
          this.span(ox + m.runs[i]! * scale, cy + m.runs[i + 1]! * scale, m.runs[i + 2]! * scale, scale);
        }
        cy += (ch === ' ' ? 4 : m.h) * scale + gap * scale;
      }
      return this;
    }
    const m = textMask(str, font);
    const ox = o.align === 'center' ? x - Math.floor((m.w * scale) / 2) : o.align === 'right' ? x - m.w * scale : x;
    for (let i = 0; i < m.runs.length; i += 3) {
      this.span(ox + m.runs[i]! * scale, y + m.runs[i + 1]! * scale, m.runs[i + 2]! * scale, scale);
    }
    return this;
  }

  /** Copy another piece of art in (both surfaces). */
  blit(src: Art, dx: number, dy: number, o: BlitOpts = {}): this {
    dx = Math.round(dx);
    dy = Math.round(dy);
    for (const [k, img] of [
      [this.c, src.color],
      [this.g, src.glow],
    ] as const) {
      if (o.flip || o.alpha !== undefined) {
        k.save();
        if (o.alpha !== undefined) k.globalAlpha = o.alpha;
        if (o.flip) {
          k.translate(dx + src.w, dy);
          k.scale(-1, 1);
          k.drawImage(img, 0, 0);
        } else k.drawImage(img, dx, dy);
        k.restore();
      } else k.drawImage(img, dx, dy);
    }
    return this;
  }
}
