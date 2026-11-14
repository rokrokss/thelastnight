import { freeTarget, makeCanvasTexture, makeProg, makeTarget, type Prog, type Target } from './gl';
import { PAD, TEX_H, TEX_W, VIEW_H, VIEW_W } from '../core/constants';
import * as S from './shaders';

export { PAD, TEX_H, TEX_W, VIEW_H, VIEW_W } from '../core/constants';

export type Vec3 = [number, number, number];

export interface Light {
  /** Scene px: world position minus the (float) camera position. */
  x: number;
  y: number;
  r: number;
  color: Vec3;
  /** Cone direction (normalised). Omit for an omni light. */
  dx?: number;
  dy?: number;
  /** Cone half-angles in radians. */
  inner?: number;
  outer?: number;
  shadow?: boolean;
  falloff?: number;
}

/** Per-scene art direction for the presentation pipeline. */
export interface Look {
  ambFar: Vec3;
  ambMid: Vec3;
  ambPlay: Vec3;
  ambFg: Vec3;
  fogColor: Vec3;
  fogMid: number;
  groundFog: number;
  scatter: number;
  reflect: number;
  ripple: number;
  /** Depth-of-field blur per group, in low-res pixels. */
  blurFar: number;
  blurMid: number;
  blurFg: number;
  bloom: number;
  bloomWide: number;
  streak: number;
  exposure: number;
  contrast: number;
  saturation: number;
  shadowTint: Vec3;
  highTint: Vec3;
  vignette: number;
  grain: number;
  aberration: number;
}

export interface FrameParams {
  time: number;
  zoom: number;
  /** Fractional part of the camera position; the play canvas is drawn at the integer part. */
  fracX: number;
  fracY: number;
  /** Ground-fog band in scene px (starts at y0, full at y1). */
  groundFogY0: number;
  groundFogY1: number;
  lights: Light[];
  look: Look;
  letterbox: number;
  fade: [number, number, number, number];
  flash: number;
}

export interface Surfaces {
  farC: HTMLCanvasElement;
  farG: HTMLCanvasElement;
  midC: HTMLCanvasElement;
  midG: HTMLCanvasElement;
  playC: HTMLCanvasElement;
  playG: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  fgC: HTMLCanvasElement;
  fgG: HTMLCanvasElement;
}

export type Quality = 'low' | 'medium' | 'high';
const MAX_HEIGHT: Record<Quality, number> = { low: 540, medium: 810, high: 1080 };

type TexName = keyof Surfaces;
const TEX_NAMES: TexName[] = ['farC', 'farG', 'midC', 'midG', 'playC', 'playG', 'mask', 'fgC', 'fgG'];

interface GroupTargets {
  a: Target;
  b: Target;
}

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  readonly canvas: HTMLCanvasElement;
  quality: Quality = 'high';
  shadows = true;
  private hdr = false;
  private vao!: WebGLVertexArrayObject;
  private pLight!: Prog;
  private pGroup!: Prog;
  private pBlur2!: Prog;
  private pBlur1!: Prog;
  private pMain!: Prog;
  private pDown!: Prog;
  private pUp!: Prog;
  private pFinal!: Prog;
  private tex = {} as Record<TexName, WebGLTexture>;
  private ow = 0;
  private oh = 0;
  private lightRT: Target | null = null;
  private groups: Record<'far' | 'mid' | 'fg', GroupTargets> | null = null;
  private sceneRT: Target | null = null;
  private bloom: Target[] = [];
  private streak: Target[] = [];
  private lost = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.init();
      const w = this.ow;
      const h = this.oh;
      this.ow = this.oh = 0;
      this.allocTargets(w, h);
    });
    this.init();
  }

  private init(): void {
    const gl = this.gl;
    this.hdr = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    gl.getExtension('OES_texture_float_linear');
    this.pLight = makeProg(gl, S.VS_LIGHT, S.FS_LIGHT, 'light');
    this.pGroup = makeProg(gl, S.VS_FULL, S.FS_GROUP, 'group');
    this.pBlur2 = makeProg(gl, S.VS_FULL, S.FS_BLUR2, 'blur2');
    this.pBlur1 = makeProg(gl, S.VS_FULL, S.FS_BLUR1, 'blur1');
    this.pMain = makeProg(gl, S.VS_FULL, S.FS_MAIN, 'main');
    this.pDown = makeProg(gl, S.VS_FULL, S.FS_DOWN, 'down');
    this.pUp = makeProg(gl, S.VS_FULL, S.FS_UP, 'up');
    this.pFinal = makeProg(gl, S.VS_FULL, S.FS_FINAL, 'final');
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('createVertexArray failed');
    this.vao = vao;
    gl.bindVertexArray(vao);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    for (const n of TEX_NAMES) this.tex[n] = makeCanvasTexture(gl, TEX_W, TEX_H);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
  }

  /** Fit the drawing buffer to the canvas's CSS size (capped by the quality setting). */
  resize(cssW: number, cssH: number, dpr: number): void {
    const maxH = MAX_HEIGHT[this.quality];
    let h = Math.round(cssH * dpr);
    let w = Math.round(cssW * dpr);
    if (h > maxH) {
      w = Math.round((w * maxH) / h);
      h = maxH;
    }
    w = Math.max(160, w);
    h = Math.max(90, h);
    this.allocTargets(w, h);
  }

  private allocTargets(w: number, h: number): void {
    if (w === this.ow && h === this.oh) return;
    const gl = this.gl;
    this.ow = w;
    this.oh = h;
    this.canvas.width = w;
    this.canvas.height = h;
    freeTarget(gl, this.lightRT);
    freeTarget(gl, this.sceneRT);
    if (this.groups) {
      for (const g of Object.values(this.groups)) {
        freeTarget(gl, g.a);
        freeTarget(gl, g.b);
      }
    }
    for (const t of this.bloom) freeTarget(gl, t);
    for (const t of this.streak) freeTarget(gl, t);
    const hw = Math.ceil(w / 2);
    const hh = Math.ceil(h / 2);
    this.lightRT = makeTarget(gl, hw, hh, 1, this.hdr);
    const grp = (): GroupTargets => ({ a: makeTarget(gl, hw, hh, 2, false), b: makeTarget(gl, hw, hh, 2, false) });
    this.groups = { far: grp(), mid: grp(), fg: grp() };
    this.sceneRT = makeTarget(gl, w, h, 2, this.hdr);
    this.bloom = [];
    let bw = hw;
    let bh = hh;
    for (let i = 0; i < 6; i++) {
      this.bloom.push(makeTarget(gl, bw, bh, 1, this.hdr));
      bw = Math.max(2, Math.ceil(bw / 2));
      bh = Math.max(2, Math.ceil(bh / 2));
    }
    const sw = this.bloom[2]!.w;
    const sh = this.bloom[2]!.h;
    this.streak = [makeTarget(gl, sw, sh, 1, this.hdr), makeTarget(gl, sw, sh, 1, this.hdr)];
  }

  get outputSize(): [number, number] {
    return [this.ow, this.oh];
  }

  private bind(t: Target | null): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null);
    gl.viewport(0, 0, t ? t.w : this.ow, t ? t.h : this.oh);
  }

  private sampler(unit: number, texture: WebGLTexture, loc: WebGLUniformLocation | null | undefined): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(loc ?? null, unit);
  }

  private full(): void {
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  render(src: Surfaces, fp: FrameParams): void {
    if (this.lost || !this.sceneRT || !this.lightRT || !this.groups) return;
    const gl = this.gl;
    const look = fp.look;
    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);

    for (const n of TEX_NAMES) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex[n]);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src[n]);
    }

    // ---- lights ----
    this.bind(this.lightRT);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    {
      const u = this.pLight.u;
      gl.useProgram(this.pLight.p);
      this.sampler(0, this.tex.mask, u.uMask);
      gl.uniform2f(u.uView ?? null, VIEW_W, VIEW_H);
      gl.uniform2f(u.uTexSize ?? null, TEX_W, TEX_H);
      gl.uniform1f(u.uPad ?? null, PAD);
      gl.uniform1f(u.uZoom ?? null, fp.zoom);
      gl.uniform2f(u.uOffPlay ?? null, fp.fracX, fp.fracY);
      const z = fp.zoom;
      for (const L of fp.lights) {
        const sx = (L.x - VIEW_W / 2) * z + VIEW_W / 2;
        const sy = (L.y - VIEW_H / 2) * z + VIEW_H / 2;
        const R = L.r * z;
        const x0 = Math.max(-1, ((sx - R) / VIEW_W) * 2 - 1);
        const x1 = Math.min(1, ((sx + R) / VIEW_W) * 2 - 1);
        const y0 = Math.max(-1, 1 - ((sy + R) / VIEW_H) * 2);
        const y1 = Math.min(1, 1 - ((sy - R) / VIEW_H) * 2);
        if (x0 >= x1 || y0 >= y1) continue;
        gl.uniform4f(u.uRect ?? null, x0, y0, x1, y1);
        gl.uniform2f(u.uLpos ?? null, L.x, L.y);
        gl.uniform1f(u.uRadius ?? null, L.r);
        gl.uniform3f(u.uColor ?? null, L.color[0], L.color[1], L.color[2]);
        if (L.inner !== undefined && L.outer !== undefined) {
          gl.uniform2f(u.uLdir ?? null, L.dx ?? 0, L.dy ?? 1);
          gl.uniform2f(u.uCone ?? null, Math.cos(L.inner), Math.cos(L.outer));
        } else {
          gl.uniform2f(u.uLdir ?? null, 0, 1);
          gl.uniform2f(u.uCone ?? null, 1, -1);
        }
        gl.uniform1f(u.uShadow ?? null, L.shadow && this.shadows ? 1 : 0);
        gl.uniform1f(u.uFalloff ?? null, L.falloff ?? 2);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
    gl.disable(gl.BLEND);

    // ---- depth groups: resolve to screen space, then blur for depth of field ----
    const blurs: ['far' | 'mid' | 'fg', WebGLTexture, WebGLTexture, number][] = [
      ['far', this.tex.farC, this.tex.farG, look.blurFar],
      ['mid', this.tex.midC, this.tex.midG, look.blurMid],
      ['fg', this.tex.fgC, this.tex.fgG, look.blurFg],
    ];
    const resolved = {} as Record<'far' | 'mid' | 'fg', Target>;
    for (const [name, tc, tg, blurPx] of blurs) {
      const g = this.groups[name];
      this.bind(g.a);
      {
        const u = this.pGroup.u;
        gl.useProgram(this.pGroup.p);
        this.sampler(0, tc, u.uC);
        this.sampler(1, tg, u.uG);
        gl.uniform2f(u.uView ?? null, VIEW_W, VIEW_H);
        gl.uniform2f(u.uTexSize ?? null, TEX_W, TEX_H);
        gl.uniform1f(u.uPad ?? null, PAD);
        gl.uniform1f(u.uZoom ?? null, fp.zoom);
        gl.uniform2f(u.uOff ?? null, 0, 0);
        gl.uniform1f(u.uPxScale ?? null, (g.a.w / VIEW_W) * fp.zoom);
        this.full();
      }
      let cur = g.a;
      let other = g.b;
      const radius = blurPx * (g.a.w / VIEW_W) * fp.zoom;
      if (radius > 0.3) {
        const iters = radius > 7 ? 2 : 1;
        const r = radius / Math.sqrt(iters);
        const u = this.pBlur2.u;
        gl.useProgram(this.pBlur2.p);
        for (let i = 0; i < iters * 2; i++) {
          this.bind(other);
          this.sampler(0, cur.tex[0]!, u.uA);
          this.sampler(1, cur.tex[1]!, u.uB);
          if (i % 2 === 0) gl.uniform2f(u.uDir ?? null, r / 4 / cur.w, 0);
          else gl.uniform2f(u.uDir ?? null, 0, r / 4 / cur.h);
          this.full();
          [cur, other] = [other, cur];
        }
      }
      resolved[name] = cur;
    }

    // ---- main composite ----
    this.bind(this.sceneRT);
    {
      const u = this.pMain.u;
      gl.useProgram(this.pMain.p);
      this.sampler(0, resolved.far.tex[0]!, u.uFarC);
      this.sampler(1, resolved.far.tex[1]!, u.uFarG);
      this.sampler(2, resolved.mid.tex[0]!, u.uMidC);
      this.sampler(3, resolved.mid.tex[1]!, u.uMidG);
      this.sampler(4, this.tex.playC, u.uPlayC);
      this.sampler(5, this.tex.playG, u.uPlayG);
      this.sampler(6, this.tex.mask, u.uMask);
      this.sampler(7, resolved.fg.tex[0]!, u.uFgC);
      this.sampler(8, resolved.fg.tex[1]!, u.uFgG);
      this.sampler(9, this.lightRT.tex[0]!, u.uLight);
      gl.uniform2f(u.uView ?? null, VIEW_W, VIEW_H);
      gl.uniform2f(u.uTexSize ?? null, TEX_W, TEX_H);
      gl.uniform1f(u.uPad ?? null, PAD);
      gl.uniform1f(u.uZoom ?? null, fp.zoom);
      gl.uniform1f(u.uPxScale ?? null, (this.ow / VIEW_W) * fp.zoom);
      gl.uniform1f(u.uTime ?? null, fp.time);
      gl.uniform2f(u.uOffPlay ?? null, fp.fracX, fp.fracY);
      gl.uniform3fv(u.uAmbFar ?? null, look.ambFar);
      gl.uniform3fv(u.uAmbMid ?? null, look.ambMid);
      gl.uniform3fv(u.uAmbPlay ?? null, look.ambPlay);
      gl.uniform3fv(u.uAmbFg ?? null, look.ambFg);
      gl.uniform3fv(u.uFogColor ?? null, look.fogColor);
      gl.uniform1f(u.uFogMid ?? null, look.fogMid);
      gl.uniform3f(u.uGroundFog ?? null, look.groundFog, fp.groundFogY0, fp.groundFogY1);
      gl.uniform1f(u.uScatter ?? null, look.scatter);
      gl.uniform1f(u.uReflect ?? null, look.reflect);
      gl.uniform1f(u.uRipple ?? null, look.ripple);
      this.full();
    }

    // ---- bloom: progressive downsample, then additive upsample ----
    {
      const u = this.pDown.u;
      gl.useProgram(this.pDown.p);
      let srcTex = this.sceneRT.tex[1]!;
      let sw = this.sceneRT.w;
      let sh = this.sceneRT.h;
      for (const level of this.bloom) {
        this.bind(level);
        this.sampler(0, srcTex, u.uT);
        gl.uniform2f(u.uTexel ?? null, 1 / sw, 1 / sh);
        this.full();
        srcTex = level.tex[0]!;
        sw = level.w;
        sh = level.h;
      }
    }
    // Streak source is taken before the upsample pass mixes wider levels into it.
    {
      const u = this.pBlur1.u;
      gl.useProgram(this.pBlur1.p);
      const src = this.bloom[2]!;
      this.bind(this.streak[0]!);
      this.sampler(0, src.tex[0]!, u.uA);
      gl.uniform2f(u.uDir ?? null, 2.2 / src.w, 0);
      gl.uniform1f(u.uThreshold ?? null, 0.22);
      this.full();
      this.bind(this.streak[1]!);
      this.sampler(0, this.streak[0]!.tex[0]!, u.uA);
      gl.uniform2f(u.uDir ?? null, 5.5 / src.w, 0);
      gl.uniform1f(u.uThreshold ?? null, 0);
      this.full();
    }
    // Per-level weights; wider levels give the soft halo that reads as fog.
    const wide = look.bloomWide;
    const T = [1, 1 + 0.25 * wide, 1 + 0.6 * wide, 1 + 1.0 * wide, 1 + 1.4 * wide, 1 + 1.8 * wide];
    let bloomNorm = 0;
    for (const v of T) bloomNorm += v;
    {
      const u = this.pUp.u;
      gl.useProgram(this.pUp.p);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = this.bloom.length - 1; i > 0; i--) {
        const from = this.bloom[i]!;
        this.bind(this.bloom[i - 1]!);
        this.sampler(0, from.tex[0]!, u.uT);
        gl.uniform2f(u.uTexel ?? null, 0.5 / from.w, 0.5 / from.h);
        gl.uniform1f(u.uWeight ?? null, T[i]! / T[i - 1]!);
        this.full();
      }
      gl.disable(gl.BLEND);
    }

    // ---- lens + film, to the screen ----
    this.bind(null);
    {
      const u = this.pFinal.u;
      gl.useProgram(this.pFinal.p);
      this.sampler(0, this.sceneRT.tex[0]!, u.uScene);
      this.sampler(1, this.bloom[0]!.tex[0]!, u.uBloom);
      this.sampler(2, this.streak[1]!.tex[0]!, u.uStreak);
      gl.uniform2f(u.uOut ?? null, this.ow, this.oh);
      gl.uniform1f(u.uTime ?? null, fp.time);
      gl.uniform1f(u.uBloomAmt ?? null, look.bloom / bloomNorm);
      gl.uniform1f(u.uStreakAmt ?? null, look.streak);
      gl.uniform1f(u.uAberr ?? null, look.aberration);
      gl.uniform1f(u.uVignette ?? null, look.vignette);
      gl.uniform1f(u.uGrain ?? null, look.grain);
      gl.uniform1f(u.uLetterbox ?? null, fp.letterbox);
      gl.uniform1f(u.uExposure ?? null, look.exposure);
      gl.uniform1f(u.uContrast ?? null, look.contrast);
      gl.uniform1f(u.uSaturation ?? null, look.saturation);
      gl.uniform3fv(u.uShadowTint ?? null, look.shadowTint);
      gl.uniform3fv(u.uHighTint ?? null, look.highTint);
      gl.uniform4fv(u.uFade ?? null, fp.fade);
      gl.uniform1f(u.uFlash ?? null, fp.flash);
      this.full();
    }
  }
}
