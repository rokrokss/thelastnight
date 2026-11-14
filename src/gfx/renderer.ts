import { freeTarget, makeCanvasTexture, makeProg, makeTarget, type Prog, type Target } from './gl';
import { PAD, TEX_H, TEX_W, VIEW_H, VIEW_W } from '../core/constants';
import * as S from './shaders';
import { FOCAL, SpriteBatch, WORLD_STRIDE, type WorldGeo } from './world';

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
  /** Depth behind (+) or in front of (-) the play plane, for lighting the world's floors and walls. */
  z?: number;
}

/** What the world pass needs for one frame. */
export interface WorldFrame {
  geo: WorldGeo;
  /** World position of the lens: the point of the play plane that sits on the vanishing point. */
  eyeX: number;
  eyeY: number;
  /** Things standing on a floor, as soft shadows: x, floor height, depth, radius. */
  blobs: [number, number, number, number][];
  /** This frame's sprites that stand at a depth of their own. */
  sprites: SpriteBatch;
  /** 1 / distance of the focal plane, in focal lengths (the play plane is at `zoom`). */
  focusInv: number;
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
  /** Normally 0 (the play layer is the focal plane); raised during rack focus. */
  blurPlay: number;
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
  /** Magnification of the play layer. */
  zoom: number;
  /** Magnification of the other depth groups: a push-in moves near layers more than far ones. */
  zoomFar: number;
  zoomMid: number;
  zoomFg: number;
  /** 1 = foreground fully present; fades as the lens passes through it. */
  fgFade: number;
  /** Camera roll in radians. */
  roll: number;
  /** Lens shift: where the vanishing point sits relative to the frame centre, in scene px. */
  vanX: number;
  vanY: number;
  /** World position of the view's top-left corner on the play plane. */
  camX: number;
  camY: number;
  /** The scene's depth geometry, if it has any. */
  world: WorldFrame | null;
  /** Wipe transition progress, 0 (off) to 1. */
  wipe: number;
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
  private pWorld!: Prog;
  private pNear!: Prog;
  private worldVao: WebGLVertexArrayObject | null = null;
  private worldVbo: WebGLBuffer | null = null;
  private worldTex: [WebGLTexture, WebGLTexture] | null = null;
  private worldGeo: WorldGeo | null = null;
  private worldRT: Target | null = null;
  private nearRT: Target | null = null;
  private nearVao: WebGLVertexArrayObject | null = null;
  private nearVbo: WebGLBuffer | null = null;
  private spriteVao: WebGLVertexArrayObject | null = null;
  private spriteVbo: WebGLBuffer | null = null;
  private spriteTex: [WebGLTexture, WebGLTexture] | null = null;
  private tex = {} as Record<TexName, WebGLTexture>;
  private ow = 0;
  private oh = 0;
  private lightRT: Target | null = null;
  private groups: Record<'far' | 'mid' | 'play' | 'fg', GroupTargets> | null = null;
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
    this.pWorld = makeProg(gl, S.VS_WORLD, S.FS_WORLD, 'world');
    this.pNear = makeProg(gl, S.VS_FULL, S.FS_NEAR, 'near');
    this.worldGeo = null;
    this.spriteVao = null;
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
    freeTarget(gl, this.worldRT);
    freeTarget(gl, this.nearRT);
    this.worldRT = makeTarget(gl, w, h, 3, this.hdr, true);
    this.nearRT = makeTarget(gl, w, h, 3, this.hdr, true);
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
    this.groups = { far: grp(), mid: grp(), play: grp(), fg: grp() };
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

  /** A vertex array laid out for world geometry, and the buffer behind it. */
  private worldBuffer(data: Float32Array | null): [WebGLVertexArrayObject, WebGLBuffer] {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error('world buffers failed');
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    if (data) gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const stride = WORLD_STRIDE * 4;
    let at = 0;
    [3, 2, 4, 4, 3].forEach((n, i) => {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, n, gl.FLOAT, false, stride, at);
      at += n * 4;
    });
    gl.bindVertexArray(this.vao);
    return [vao, vbo];
  }

  private canvasPair(color: HTMLCanvasElement, glow: HTMLCanvasElement): [WebGLTexture, WebGLTexture] {
    const gl = this.gl;
    return [color, glow].map((canvas) => {
      const t = gl.createTexture();
      if (!t) throw new Error('createTexture failed');
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }) as [WebGLTexture, WebGLTexture];
  }

  /** Put a scene's depth geometry and its texture atlas on the GPU (once per scene). */
  private loadWorld(geo: WorldGeo): void {
    const gl = this.gl;
    for (const v of [this.worldVao, this.nearVao]) if (v) gl.deleteVertexArray(v);
    for (const b of [this.worldVbo, this.nearVbo]) if (b) gl.deleteBuffer(b);
    if (this.worldTex) for (const t of this.worldTex) gl.deleteTexture(t);
    [this.worldVao, this.worldVbo] = this.worldBuffer(geo.verts);
    [this.nearVao, this.nearVbo] = this.worldBuffer(geo.near);
    this.worldTex = this.canvasPair(geo.atlas.color, geo.atlas.glow);
    this.worldGeo = geo;
  }

  /** This frame's depth sprites: refresh their sheet and their vertices. */
  private loadSprites(batch: SpriteBatch): number[] {
    const gl = this.gl;
    if (!this.spriteVao || !this.spriteVbo || !this.spriteTex) {
      [this.spriteVao, this.spriteVbo] = this.worldBuffer(null);
      this.spriteTex = this.canvasPair(batch.sheet.color, batch.sheet.glow);
    }
    const nb = batch.back.length / WORLD_STRIDE;
    const nn = batch.near.length / WORLD_STRIDE;
    if (nb + nn > 0) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.spriteTex[0]);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, batch.sheet.color);
      gl.bindTexture(gl.TEXTURE_2D, this.spriteTex[1]);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, batch.sheet.glow);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteVbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([...batch.back, ...batch.near]), gl.DYNAMIC_DRAW);
    }
    return [nb, nn];
  }

  /** Draw the depth geometry, lit and fogged: what is behind the play plane, then what is in front of it. */
  private drawWorld(fp: FrameParams, wf: WorldFrame): void {
    const gl = this.gl;
    if (this.worldGeo !== wf.geo) this.loadWorld(wf.geo);
    if (!this.worldRT || !this.nearRT || !this.worldVao || !this.nearVao || !this.worldTex) return;
    const [spriteBack, spriteNear] = this.loadSprites(wf.sprites);
    const look = fp.look;
    const u = this.pWorld.u;
    gl.useProgram(this.pWorld.p);
    gl.uniform2f(u.uEye ?? null, wf.eyeX, wf.eyeY);
    gl.uniform2f(u.uVan ?? null, fp.vanX, fp.vanY);
    gl.uniform1f(u.uDz ?? null, FOCAL / fp.zoom);
    gl.uniform1f(u.uFocal ?? null, FOCAL);
    gl.uniform2f(u.uRot ?? null, Math.cos(fp.roll), Math.sin(fp.roll));
    gl.uniform2f(u.uView ?? null, VIEW_W, VIEW_H);
    // Unlike the play layer, the world's surfaces get no light buffer: lift their ambient to match.
    gl.uniform3f(u.uAmb ?? null, look.ambPlay[0] * 1.7 + 0.03, look.ambPlay[1] * 1.7 + 0.03, look.ambPlay[2] * 1.7 + 0.04);
    gl.uniform3fv(u.uFogColor ?? null, look.fogColor);
    gl.uniform1f(u.uFogK ?? null, look.fogMid * 0.0034);
    // Anything further than the mid layers' own depth is composited behind them.
    gl.uniform1f(u.uMidW ?? null, 1 / fp.zoom + 1.0);
    gl.uniform1f(u.uFocusInv ?? null, wf.focusInv);
    const n = Math.min(S.WORLD_LIGHTS, fp.lights.length);
    const pos = new Float32Array(S.WORLD_LIGHTS * 4);
    const col = new Float32Array(S.WORLD_LIGHTS * 4);
    const cone = new Float32Array(S.WORLD_LIGHTS * 4);
    // Brightest and widest first, in case there are more lamps than slots.
    const order = fp.lights
      .map((L) => ({ L, k: L.r * (L.color[0] + L.color[1] + L.color[2]) }))
      .sort((a, b) => b.k - a.k);
    for (let i = 0; i < n; i++) {
      const L = order[i]!.L;
      pos.set([L.x + fp.camX, L.y + fp.camY, L.z ?? 0, L.r], i * 4);
      col.set([L.color[0], L.color[1], L.color[2], L.falloff ?? 2], i * 4);
      if (L.inner !== undefined && L.outer !== undefined) cone.set([L.dx ?? 0, L.dy ?? 1, Math.cos(L.inner), Math.cos(L.outer)], i * 4);
      else cone.set([0, 1, 1, -1], i * 4);
    }
    gl.uniform1i(u.uNL ?? null, n);
    gl.uniform4fv(u.uLpos ?? null, pos);
    gl.uniform4fv(u.uLcol ?? null, col);
    gl.uniform4fv(u.uLcone ?? null, cone);
    const nb = Math.min(S.WORLD_BLOBS, wf.blobs.length);
    const blob = new Float32Array(S.WORLD_BLOBS * 4);
    for (let i = 0; i < nb; i++) blob.set(wf.blobs[i]!, i * 4);
    gl.uniform1i(u.uNB ?? null, nb);
    gl.uniform4fv(u.uBlob ?? null, blob);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    const pass = (rt: Target, vao: WebGLVertexArrayObject, count: number, first: number, sprites: number): void => {
      this.bind(rt);
      gl.clearColor(0, 0, 0, 0);
      gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (count > 0) {
        this.sampler(0, this.worldTex![0], u.uAtlasC);
        this.sampler(1, this.worldTex![1], u.uAtlasG);
        gl.uniform2f(u.uAtlasSize ?? null, wf.geo.atlas.w, wf.geo.atlas.h);
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLES, 0, count);
      }
      if (sprites > 0 && this.spriteVao && this.spriteTex) {
        this.sampler(0, this.spriteTex[0], u.uAtlasC);
        this.sampler(1, this.spriteTex[1], u.uAtlasG);
        gl.uniform2f(u.uAtlasSize ?? null, wf.sprites.sheet.w, wf.sprites.sheet.h);
        gl.bindVertexArray(this.spriteVao);
        gl.drawArrays(gl.TRIANGLES, first, sprites);
      }
    };
    pass(this.worldRT, this.worldVao, wf.geo.count, 0, spriteBack);
    pass(this.nearRT, this.nearVao, wf.geo.nearCount, spriteBack, spriteNear);
    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
  }

  render(src: Surfaces, fp: FrameParams): void {
    if (this.lost || !this.sceneRT || !this.lightRT || !this.groups) return;
    const gl = this.gl;
    const look = fp.look;
    const rc = Math.cos(fp.roll);
    const rs = Math.sin(fp.roll);
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
      gl.uniform2f(u.uRot ?? null, rc, rs);
      gl.uniform2f(u.uOffPlay ?? null, fp.fracX, fp.fracY);
      const z = fp.zoom;
      for (const L of fp.lights) {
        // Scene → screen: undo the roll, then scale about the centre.
        const lx = L.x - VIEW_W / 2;
        const ly = L.y - VIEW_H / 2;
        const sx = (lx * rc + ly * rs) * z + VIEW_W / 2;
        const sy = (-lx * rs + ly * rc) * z + VIEW_H / 2;
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
    type GroupName = 'far' | 'mid' | 'play' | 'fg';
    const playPre = look.blurPlay > 0.05;
    const blurs: [GroupName, WebGLTexture, WebGLTexture, number, number][] = [
      ['far', this.tex.farC, this.tex.farG, look.blurFar, fp.zoomFar],
      ['mid', this.tex.midC, this.tex.midG, look.blurMid, fp.zoomMid],
      ['fg', this.tex.fgC, this.tex.fgG, look.blurFg, fp.zoomFg],
    ];
    if (playPre) blurs.push(['play', this.tex.playC, this.tex.playG, look.blurPlay, fp.zoom]);
    const resolved = {} as Record<GroupName, Target>;
    for (const [name, tc, tg, blurPx, zoom] of blurs) {
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
        gl.uniform1f(u.uZoom ?? null, zoom);
        gl.uniform2f(u.uRot ?? null, rc, rs);
        // Only the play layer is drawn at whole pixels and needs the sub-pixel remainder.
        // It is also the one plane the lens shift leaves alone: the others grow about the vanishing point.
        if (name === 'play') {
          gl.uniform2f(u.uOff ?? null, fp.fracX, fp.fracY);
          gl.uniform2f(u.uVan ?? null, 0, 0);
        } else {
          gl.uniform2f(u.uOff ?? null, 0, 0);
          gl.uniform2f(u.uVan ?? null, fp.vanX, fp.vanY);
        }
        gl.uniform1f(u.uPxScale ?? null, (g.a.w / VIEW_W) * zoom);
        this.full();
      }
      let cur = g.a;
      let other = g.b;
      const radius = blurPx * (g.a.w / VIEW_W) * zoom;
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

    // ---- the world's depth geometry ----
    const worldBlur = look.blurFar * 1.6 * (this.ow / VIEW_W);
    if (fp.world) {
      this.drawWorld(fp, fp.world);
      if (this.nearRT) {
        // What stands in front of the play plane joins the foreground layers, softened by its own distance.
        const u = this.pNear.u;
        gl.useProgram(this.pNear.p);
        this.bind(resolved.fg);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        this.sampler(0, this.nearRT.tex[0]!, u.uC);
        this.sampler(1, this.nearRT.tex[1]!, u.uG);
        this.sampler(2, this.nearRT.tex[2]!, u.uA);
        gl.uniform1f(u.uWorldBlur ?? null, worldBlur);
        gl.uniform2f(u.uTexel ?? null, 1 / this.ow, 1 / this.oh);
        this.full();
        gl.disable(gl.BLEND);
      }
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
      const playR = playPre ? resolved.play : resolved.far;
      this.sampler(10, playR.tex[0]!, u.uPlayRC);
      this.sampler(11, playR.tex[1]!, u.uPlayRG);
      gl.uniform1f(u.uPlayPre ?? null, playPre ? 1 : 0);
      if (fp.world && this.worldRT) {
        this.sampler(12, this.worldRT.tex[0]!, u.uWorldC);
        this.sampler(13, this.worldRT.tex[1]!, u.uWorldG);
        this.sampler(14, this.worldRT.tex[2]!, u.uWorldA);
        // Out-of-focus radius in output px at full blur, matched to the far layers' own softness.
        gl.uniform1f(u.uWorldBlur ?? null, worldBlur);
        gl.uniform2f(u.uTexel ?? null, 1 / this.ow, 1 / this.oh);
        gl.uniform1f(u.uWorldOn ?? null, 1);
        gl.uniform1f(u.uFloorRow ?? null, fp.world.geo.floorY - fp.camY);
        gl.uniform1f(u.uHorizonRow ?? null, fp.world.eyeY - fp.camY);
      } else {
        // Samplers must still point somewhere valid.
        this.sampler(12, resolved.far.tex[0]!, u.uWorldC);
        this.sampler(13, resolved.far.tex[1]!, u.uWorldG);
        this.sampler(14, resolved.far.tex[1]!, u.uWorldA);
        gl.uniform1f(u.uWorldOn ?? null, 0);
      }
      gl.uniform1f(u.uFgFade ?? null, fp.fgFade);
      gl.uniform2f(u.uRot ?? null, rc, rs);
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
      gl.uniform1f(u.uWipe ?? null, fp.wipe);
      this.full();
    }
  }
}
