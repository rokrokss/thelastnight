import { clamp01 } from '../src/core/math';
import { SPEAKERS } from '../src/game/director';
import { LETTERBOX } from './scene';

/** Text laid over the picture. Times are on the trailer's clock, in seconds. */
export type Title = { at: number; dur: number } & (
  | { kind: 'card'; lines: string[]; kicker?: string; foot?: string; tint?: string; glitch?: boolean; dim?: number }
  | { kind: 'caption'; who: string; text: string }
  | { kind: 'stamp'; text: string; sub: string }
  | { kind: 'logo'; tag: string; foot: string }
);

type Ctx = CanvasRenderingContext2D;

const WHITE = '#f4f1ea';
const TEAL = '#49e0d0';
const GREY = '#9aa7b8';

/** Native pixel size of each face: drawn at this size, a glyph lands exactly on the pixel grid. */
const FACES = {
  small: ['12px Galmuri11', 12],
  bold: ['700 12px Galmuri11', 12],
  big: ['15px Galmuri14', 15],
} as const;
type Face = keyof typeof FACES;

const sprites = new Map<string, HTMLCanvasElement>();

/**
 * A line of text as a 1-bit sprite at the font's native size. Antialiasing is
 * thresholded away so that, scaled up by whole numbers, it stays pixel art.
 */
function sprite(text: string, face: Face, color: string, spacing = 0): HTMLCanvasElement {
  const key = `${face}|${color}|${spacing}|${text}`;
  const hit = sprites.get(key);
  if (hit) return hit;
  const [font, px] = FACES[face];
  const c = document.createElement('canvas');
  let k = c.getContext('2d')!;
  k.font = font;
  k.letterSpacing = `${spacing}px`;
  c.width = Math.max(1, Math.ceil(k.measureText(text).width) + 2 - spacing);
  c.height = px + 4;
  k = c.getContext('2d', { willReadFrequently: true })!;
  k.font = font;
  k.letterSpacing = `${spacing}px`;
  k.textBaseline = 'top';
  k.fillStyle = color;
  k.fillText(text, 1, 1);
  const img = k.getImageData(0, 0, c.width, c.height);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i]! >= 112 ? 255 : 0;
  k.putImageData(img, 0, 0);
  sprites.set(key, c);
  return c;
}

/** Fade in, hold, fade out. */
const envelope = (t: number, dur: number, fin: number, fout: number): number =>
  clamp01(Math.min(fin > 0 ? t / fin : 1, fout > 0 ? (dur - t) / fout : 1));

const noise = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Draws the trailer's titles at output resolution. `u` is one UI pixel (3 at
 * 1080p, as in the game), and every glyph pixel is a whole number of them.
 */
export class Overlay {
  private k: Ctx;
  private W: number;
  private H: number;
  private u: number;

  constructor(k: Ctx, w: number, h: number) {
    this.k = k;
    this.W = w;
    this.H = h;
    this.u = Math.max(1, Math.round(h / 360));
    k.imageSmoothingEnabled = false;
  }

  /** Draw a sprite with its centre (ax = 0.5) or left edge (ax = 0) at x. */
  private put(s: HTMLCanvasElement, x: number, y: number, scale: number, ax = 0.5): void {
    const w = s.width * scale;
    this.k.drawImage(s, Math.round(x - w * ax), Math.round(y), w, s.height * scale);
  }

  draw(titles: Title[], t: number, frame: number): void {
    for (const it of titles) {
      const lt = t - it.at;
      if (lt < 0 || lt >= it.dur) continue;
      if (it.kind === 'card') this.card(it, lt, frame);
      else if (it.kind === 'caption') this.caption(it, lt);
      else if (it.kind === 'stamp') this.stamp(it, lt);
      else this.logo(it, lt);
    }
    this.k.globalAlpha = 1;
  }

  private card(it: Extract<Title, { kind: 'card' }>, lt: number, frame: number): void {
    const { k, u, W, H } = this;
    const scale = 2 * u;
    const lineH = 20 * scale;
    const kickH = it.kicker ? 22 * u : 0;
    const footH = it.foot ? 24 * u : 0;
    const total = kickH + it.lines.length * lineH + footH;
    let y = Math.round((H - total) / 2);
    const a = envelope(lt, it.dur, it.glitch ? 0.04 : 0.28, 0.3);
    if (it.dim) {
      // Over a picture: darken it so the words read.
      k.globalAlpha = a * it.dim;
      k.fillStyle = '#000';
      k.fillRect(0, 0, W, H);
    }
    // A burst of interference as the card arrives: the whole block tears sideways for a few frames.
    const tear = it.glitch && lt < 0.4 ? (1 - lt / 0.4) * 26 * u : 0;
    const shift = (row: number): number => (tear > 0 ? Math.round((noise(frame * 3.1 + row * 17.7) - 0.5) * tear) : 0);
    k.globalAlpha = a;
    if (it.kicker) {
      this.put(sprite(it.kicker, 'bold', it.tint ?? TEAL, 4), W / 2 + shift(0), y, u);
      y += kickH;
    }
    it.lines.forEach((line, i) => {
      // Each line lands a moment after the one above it.
      const la = it.glitch ? 1 : clamp01((lt - i * 0.22) / 0.28);
      k.globalAlpha = a * la;
      if (tear > 0) {
        // Red and cyan ghosts either side of the torn line.
        k.globalAlpha = a * 0.55;
        this.put(sprite(line, 'big', '#ff5a4a', 3), W / 2 + shift(i + 1) - tear * 0.3, y, scale);
        this.put(sprite(line, 'big', '#4adfff', 3), W / 2 + shift(i + 1) + tear * 0.3, y, scale);
        k.globalAlpha = a;
      }
      this.put(sprite(line, 'big', WHITE, 3), W / 2 + shift(i + 1), y, scale);
      y += lineH;
    });
    if (it.foot) {
      k.globalAlpha = a * clamp01((lt - 0.5) / 0.4);
      this.put(sprite(it.foot, 'small', GREY, 2), W / 2 + shift(9), y + 8 * u, u);
    }
  }

  /** A line of dialogue, set in the lower bar like a subtitle. */
  private caption(it: Extract<Title, { kind: 'caption' }>, lt: number): void {
    const { k, u, W, H } = this;
    const sp = SPEAKERS[it.who];
    const shown = it.text.slice(0, Math.max(1, Math.floor(lt * 46)));
    const name = sprite(sp?.radio ? `((•)) ${sp.name}` : (sp?.name ?? it.who), 'big', sp?.color ?? WHITE, 1);
    // Lay out against the full line so the text does not slide as it types on.
    const full = sprite(it.text, 'big', WHITE);
    const gap = 10 * u;
    const width = name.width * u + gap + full.width * u;
    const x = Math.round((W - width) / 2);
    const y = Math.round(H * (1 - LETTERBOX / 2) - 10 * u);
    k.globalAlpha = envelope(lt, it.dur, 0.12, 0.25);
    this.put(name, x, y, u, 0);
    this.put(sprite(shown, 'big', WHITE), x + name.width * u + gap, y, u, 0);
  }

  /** Place and time, small, in the corner of the picture. */
  private stamp(it: Extract<Title, { kind: 'stamp' }>, lt: number): void {
    const { k, u, W, H } = this;
    const x = Math.round(W * 0.055);
    const y = Math.round(H * (LETTERBOX + 0.045));
    k.globalAlpha = envelope(lt, it.dur, 0.5, 0.6);
    this.put(sprite(it.text.slice(0, Math.max(1, Math.floor(lt * 22))), 'big', TEAL, 4), x, y, u, 0);
    k.globalAlpha = envelope(lt - 0.6, it.dur - 0.6, 0.5, 0.6);
    this.put(sprite(it.sub, 'small', GREY, 2), x, y + 21 * u, u, 0);
  }

  private logo(it: Extract<Title, { kind: 'logo' }>, lt: number): void {
    const { k, u, W, H } = this;
    const scale = 4 * u;
    const s = sprite('SKYWAVE', 'big', '#fff6e6', 2);
    const y = Math.round(H * 0.5 - 13 * scale);
    // On from its very first frame: the cut to the title lands with the last hit of the score.
    const a = envelope(lt, it.dur, 0, 0.7);
    // The sign warms up: an over-bright flare on the cut that settles into a steady glow.
    const flare = Math.exp(-lt * 3.2);
    const glow: [string, number, number][] = [
      ['rgba(255, 110, 40, 1)', 60, 0.5 + 0.5 * flare],
      ['rgba(255, 140, 60, 1)', 22, 0.75 + 0.25 * flare],
      ['rgba(255, 190, 120, 1)', 6, 1],
    ];
    for (const [color, blur, amount] of glow) {
      k.globalAlpha = a * amount;
      k.shadowColor = color;
      k.shadowBlur = blur * u;
      this.put(s, W / 2, y, scale);
    }
    k.shadowBlur = 0;
    k.shadowColor = 'transparent';
    k.globalAlpha = a * clamp01((lt - 1.25) / 0.5);
    this.put(sprite(it.tag, 'bold', TEAL, 4), W / 2, y + 23 * scale, u);
    k.globalAlpha = a * clamp01((lt - 2.5) / 0.5);
    this.put(sprite(it.foot, 'small', GREY, 2), W / 2, y + 23 * scale + 22 * u, u);
  }
}
