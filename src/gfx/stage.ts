import { shade } from '../core/color';
import { ctx2d, makeCanvas, type Art, type Ctx } from './art';
import { PAD, TEX_H, TEX_W, type Surfaces } from './renderer';
import { SpriteBatch } from './world';

export type LayerGroup = 'far' | 'mid' | 'fg';

function drawClipped(k: Ctx, img: HTMLCanvasElement, dx: number, dy: number): void {
  const sx = dx < 0 ? Math.floor(-dx) : 0;
  const sy = dy < 0 ? Math.floor(-dy) : 0;
  const ddx = dx + sx;
  const ddy = dy + sy;
  const w = Math.min(img.width - sx, Math.ceil(TEX_W - ddx) + 1);
  const h = Math.min(img.height - sy, Math.ceil(TEX_H - ddy) + 1);
  if (w <= 0 || h <= 0) return;
  k.drawImage(img, sx, sy, w, h, ddx, ddy, w, h);
}

/**
 * Per-frame 2D compositor. Draws the world into the low-res group canvases
 * that the Renderer then lights and grades on the GPU.
 *
 * The play group is drawn at integer pixel positions (crisp pixels; the
 * fractional camera remainder is applied on the GPU). Parallax groups are
 * drawn at fractional positions with smoothing, since they are out of focus.
 */
export class Stage {
  readonly surf: Surfaces;
  /** Sprites standing at their own depth this frame. */
  readonly sprites = new SpriteBatch();
  private pc: Ctx;
  private pg: Ctx;
  private mk: Ctx;
  private lc: Record<LayerGroup, Ctx>;
  private lg: Record<LayerGroup, Ctx>;
  private all: Ctx[];
  camX = 0;
  camY = 0;
  ix = 0;
  iy = 0;
  /** The lens position, as a view corner like camX/camY: equal to them when the lens is not shifted. */
  eyeX = 0;
  eyeY = 0;
  /** Where the vanishing point sits relative to the frame centre. */
  vanX = 0;
  vanY = 0;
  /**
   * How far below the frame centre the ground lay when the distant layers
   * were painted (0 if the scene has no ground plane). With a real horizon,
   * each layer rises by its share of this, so its foot stands on the ground at
   * its own distance instead of on the play plane's ground line.
   */
  lift = 0;
  /** The lens shift the scene's foreground layers were composed for: they only move when it departs from this. */
  restY = 0;

  constructor() {
    const mk = (): HTMLCanvasElement => makeCanvas(TEX_W, TEX_H);
    this.surf = {
      farC: mk(),
      farG: mk(),
      midC: mk(),
      midG: mk(),
      playC: mk(),
      playG: mk(),
      mask: mk(),
      fgC: mk(),
      fgG: mk(),
    };
    const s = this.surf;
    this.pc = ctx2d(s.playC);
    this.pg = ctx2d(s.playG);
    this.mk = ctx2d(s.mask);
    this.lc = { far: ctx2d(s.farC), mid: ctx2d(s.midC), fg: ctx2d(s.fgC) };
    this.lg = { far: ctx2d(s.farG), mid: ctx2d(s.midG), fg: ctx2d(s.fgG) };
    for (const k of [...Object.values(this.lc), ...Object.values(this.lg)]) k.imageSmoothingEnabled = true;
    this.all = [this.pc, this.pg, ...Object.values(this.lc), ...Object.values(this.lg)];
  }

  begin(camX: number, camY: number, eyeX = camX, eyeY = camY, vanX = 0, vanY = 0): void {
    this.camX = camX;
    this.camY = camY;
    this.eyeX = eyeX;
    this.eyeY = eyeY;
    this.vanX = vanX;
    this.vanY = vanY;
    this.ix = Math.floor(camX);
    this.iy = Math.floor(camY);
    this.sprites.begin();
    for (const k of this.all) k.clearRect(0, 0, TEX_W, TEX_H);
    this.mk.fillStyle = '#000';
    this.mk.fillRect(0, 0, TEX_W, TEX_H);
  }

  get fracX(): number {
    return this.camX - this.ix;
  }
  get fracY(): number {
    return this.camY - this.iy;
  }

  // ---------------------------------------------------------------- play group

  /** Large static art anchored at a world position (level strips). */
  strip(art: Art, wx: number, wy: number): void {
    const dx = wx - this.ix + PAD;
    const dy = wy - this.iy + PAD;
    drawClipped(this.pc, art.color, dx, dy);
    drawClipped(this.pg, art.glow, dx, dy);
  }

  /** Small art at a world position, snapped to the pixel grid. */
  sprite(art: Art, wx: number, wy: number, flip = false, alpha = 1): void {
    const dx = Math.round(wx) - this.ix + PAD;
    const dy = Math.round(wy) - this.iy + PAD;
    if (dx >= TEX_W || dy >= TEX_H || dx + art.w <= 0 || dy + art.h <= 0) return;
    for (let i = 0; i < 2; i++) {
      const k = i === 0 ? this.pc : this.pg;
      const img = i === 0 ? art.color : art.glow;
      if (flip || alpha !== 1) {
        k.save();
        k.globalAlpha = alpha;
        if (flip) {
          k.translate(dx + art.w, dy);
          k.scale(-1, 1);
          k.drawImage(img, 0, 0);
        } else k.drawImage(img, dx, dy);
        k.restore();
      } else k.drawImage(img, dx, dy);
    }
  }

  /** Small art standing at depth z (behind the play plane if positive, in front if negative). */
  depthSprite(art: Art, wx: number, wy: number, z: number, flip = false, scale = 1, shade = 1, lit = 1): void {
    this.sprites.add(art, wx, wy, z, flip, scale, shade, lit);
  }

  rect(wx: number, wy: number, w: number, h: number, col: string, alpha = 1): void {
    const dx = Math.round(wx) - this.ix + PAD;
    const dy = Math.round(wy) - this.iy + PAD;
    this.pc.globalAlpha = alpha;
    this.pg.globalAlpha = alpha;
    this.pc.fillStyle = col;
    this.pc.fillRect(dx, dy, w, h);
    this.pg.fillStyle = '#000';
    this.pg.fillRect(dx, dy, w, h);
    this.pc.globalAlpha = 1;
    this.pg.globalAlpha = 1;
  }

  emit(wx: number, wy: number, w: number, h: number, col: string, alpha = 1, base = 0.3): void {
    const dx = Math.round(wx) - this.ix + PAD;
    const dy = Math.round(wy) - this.iy + PAD;
    this.pc.globalAlpha = alpha;
    this.pg.globalAlpha = alpha;
    this.pc.fillStyle = shade(col, base);
    this.pc.fillRect(dx, dy, w, h);
    this.pg.fillStyle = col;
    this.pg.fillRect(dx, dy, w, h);
    this.pc.globalAlpha = 1;
    this.pg.globalAlpha = 1;
  }

  /** Dim whatever emissive pixels are already inside a rectangle (sign flicker). */
  dim(wx: number, wy: number, w: number, h: number, amount: number): void {
    if (amount <= 0) return;
    const dx = Math.round(wx) - this.ix + PAD;
    const dy = Math.round(wy) - this.iy + PAD;
    const g = this.pg;
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = amount;
    g.fillStyle = '#000';
    g.fillRect(dx, dy, w, h);
    g.restore();
  }

  // ------------------------------------------------------------ parallax groups

  /**
   * Vertical correction for a layer with scroll factor `py`. Distant layers
   * rise so their feet stand on the ground at their own distance. Foreground
   * layers were composed by eye around the action, so they stay where they
   * were put for the scene's resting lens.
   */
  private settle(py: number): number {
    return py > 1 ? this.restY * (1 - py) : this.lift * (1 - py);
  }

  /**
   * Draw art into a parallax group. (lx, ly) is the art's position in that
   * layer's own space; px / py are its scroll factors relative to the camera.
   */
  layer(group: LayerGroup, art: Art, lx: number, ly: number, px: number, py: number, alpha = 1): void {
    // Distant layers scroll with the lens and hang off the vanishing point.
    let dx = lx - this.eyeX * px + this.vanX + PAD;
    let dy = ly - this.eyeY * py + this.vanY - this.settle(py) + PAD;
    // A backdrop that fills the frame must keep filling it: a shifted lens may
    // slide it, but never far enough to show its side or top edge. (Its lower
    // edge is always behind the ground.)
    if (art.w >= TEX_W) dx = Math.min(0, Math.max(TEX_W - art.w, dx));
    if (art.h >= TEX_H) dy = Math.min(0, dy);
    if (dx >= TEX_W || dy >= TEX_H || dx + art.w <= 0 || dy + art.h <= 0) return;
    const c = this.lc[group];
    const g = this.lg[group];
    if (alpha !== 1) {
      c.globalAlpha = alpha;
      g.globalAlpha = alpha;
    }
    drawClipped(c, art.color, dx, dy);
    drawClipped(g, art.glow, dx, dy);
    if (alpha !== 1) {
      c.globalAlpha = 1;
      g.globalAlpha = 1;
    }
  }

  layerRect(
    group: LayerGroup,
    lx: number,
    ly: number,
    w: number,
    h: number,
    px: number,
    py: number,
    col: string,
    emissive = false,
    alpha = 1,
  ): void {
    const dx = lx - this.eyeX * px + this.vanX + PAD;
    const dy = ly - this.eyeY * py + this.vanY - this.settle(py) + PAD;
    const c = this.lc[group];
    const g = this.lg[group];
    c.globalAlpha = alpha;
    g.globalAlpha = alpha;
    c.fillStyle = emissive ? shade(col, 0.3) : col;
    c.fillRect(dx, dy, w, h);
    g.fillStyle = emissive ? col : '#000';
    g.fillRect(dx, dy, w, h);
    c.globalAlpha = 1;
    g.globalAlpha = 1;
  }

  // ----------------------------------------------------------------------- mask

  /** Static reflection / occluder mask for the level, aligned with the play group. */
  maskStrip(mask: HTMLCanvasElement, wx: number, wy: number): void {
    drawClipped(this.mk, mask, wx - this.ix + PAD, wy - this.iy + PAD);
  }

  /** Dynamic light occluder (moving platforms, doors). */
  occluder(wx: number, wy: number, w: number, h: number): void {
    const k = this.mk;
    k.save();
    k.globalCompositeOperation = 'lighter';
    k.fillStyle = '#0000ff';
    k.fillRect(Math.round(wx) - this.ix + PAD, Math.round(wy) - this.iy + PAD, w, h);
    k.restore();
  }
}
