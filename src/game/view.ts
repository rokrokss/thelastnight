import { PAD, TEX_H, TEX_W, VIEW_H, VIEW_W } from '../core/constants';
import { shade, vec3 } from '../core/color';
import { clamp, hash2, lerp, smoothstep, valueNoise } from '../core/math';
import { GLOW, lookFor, RAMP } from '../art/palette';
import {
  drawPuppet,
  PUPPET_H,
  PUPPET_OX,
  PUPPET_OY,
  PUPPET_W,
  Spring,
  type Anim,
  type PuppetLook,
} from '../art/puppet';
import type { SceneArt } from '../art/scene';
import { Art } from '../gfx/art';
import type { FrameParams, Light, Look, Vec3 } from '../gfx/renderer';
import type { Stage } from '../gfx/stage';
import type { Flicker, LightDef } from './level';
import type { Drone, Mover, World } from './world';

/** Offsets a scene can lay over the chapter's look (all 0 = unchanged). */
export interface Mood {
  vignette: number;
  saturation: number;
  exposure: number;
  aberration: number;
  bloom: number;
}

/** Cinematic state owned by the director (cutscenes, transitions). */
export interface Cine {
  letterbox: number;
  fade: [number, number, number, number];
  flash: number;
  /** Wipe transition progress: 0 off, 0.5 frame covered, 1 gone. */
  wipe: number;
  mood: Mood;
}

export function flickerValue(mode: Flicker | undefined, t: number, seed: number): number {
  switch (mode) {
    case 'buzz': {
      const n = hash2(Math.floor(t * 22), seed & 1023);
      return n < 0.07 ? 0.3 : n < 0.12 ? 0.7 : 1;
    }
    case 'pulse':
      return 0.8 + 0.2 * Math.sin(t * 2.3 + (seed % 61));
    case 'broken': {
      const s = Math.sin(t * 1.1 + (seed % 17)) + Math.sin(t * 2.9 + (seed % 29));
      if (s > -0.3) return hash2(Math.floor(t * 30), seed & 511) < 0.08 ? 0.4 : 1;
      return hash2(Math.floor(t * 14), seed & 255) < 0.15 ? 0.8 : 0.08;
    }
    case 'candle':
      return 0.82 + 0.18 * valueNoise(t * 6, seed % 97);
    case 'blink':
      return Math.sin(t * 2.4 + (seed % 13)) > 0 ? 1 : 0.08;
    default:
      return 1;
  }
}

interface PLight {
  d: LightDef;
  rgb: Vec3;
  seed: number;
}

const enum K {
  Steam,
  Splash,
  Spark,
  Dust,
}

interface Part {
  k: K;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  col: string;
}

interface Drop {
  x: number;
  y: number;
  sp: number;
  len: number;
}

const mod = (v: number, m: number): number => ((v % m) + m) % m;

/**
 * Turns the simulation into a frame: draws scenery, actors, weather and
 * particles into the stage, and gathers the lights for the renderer.
 */
export class View {
  readonly art: SceneArt;
  /** Extra per-frame scenery supplied by the chapter (set pieces). */
  t = 0;
  /** 0..1, decays; set by storms. */
  lightning = 0;
  reduceFlash = false;
  /** 0 disables camera shake (accessibility setting). */
  shakeScale = 1;
  onThunder: (() => void) | null = null;
  private puppet = new Art(PUPPET_W, PUPPET_H);
  private springs = new Map<string, Spring>();
  private lastVx = new Map<string, number>();
  private lights: PLight[];
  private parts: Part[] = [];
  private drops: Drop[] = [];
  private fgDrops: Drop[] = [];
  private tops: { x0: number; x1: number; y: number }[] = [];
  private moverArt = new Map<string, Art>();
  private emitAcc: number[];
  private look: Look;
  private stormT = 3;
  private camX = 0;
  private camY = 0;
  private zoom = 1;
  private roll = 0;

  constructor(art: SceneArt, world: World) {
    this.art = art;
    this.lights = art.lights.map((d, i) => ({ d, rgb: vec3(d.color, d.k ?? 1), seed: (i * 7919 + 13) | 0 }));
    this.emitAcc = art.emitters.map(() => 0);
    this.look = { ...art.look };
    for (const s of world.level.solids) this.tops.push({ x0: s.x, x1: s.x + s.w, y: s.y });
    for (const o of world.level.oneWays) this.tops.push({ x0: o.x, x1: o.x + o.w, y: o.y });
    for (let i = 0; i < 170; i++) {
      this.drops.push({ x: Math.random() * TEX_W, y: Math.random() * TEX_H, sp: 250 + Math.random() * 110, len: 5 + Math.random() * 5 });
    }
    for (let i = 0; i < 26; i++) {
      this.fgDrops.push({ x: Math.random() * TEX_W, y: Math.random() * TEX_H, sp: 420 + Math.random() * 160, len: 16 + Math.random() * 12 });
    }
  }

  /** World position → view pixel (0..480, 0..270), for anchoring UI. Mirrors the renderer's camera transform. */
  toScreen(wx: number, wy: number): [number, number] {
    const dx = wx - this.camX - VIEW_W / 2;
    const dy = wy - this.camY - VIEW_H / 2;
    const c = Math.cos(this.roll);
    const s = Math.sin(this.roll);
    return [(dx * c + dy * s) * this.zoom + VIEW_W / 2, (-dx * s + dy * c) * this.zoom + VIEW_H / 2];
  }

  private spring(id: string): Spring {
    let s = this.springs.get(id);
    if (!s) {
      s = new Spring();
      this.springs.set(id, s);
    }
    return s;
  }

  private drawFigure(
    st: Stage,
    id: string,
    look: PuppetLook,
    x: number,
    y: number,
    facing: 1 | -1,
    anim: Anim,
    phase: number,
    t: number,
    vx: number,
    dt: number,
  ): void {
    const sp = this.spring(id);
    const prev = this.lastVx.get(id) ?? vx;
    const accel = dt > 0 ? (vx - prev) / dt : 0;
    this.lastVx.set(id, vx);
    // Antenna lags behind acceleration and trails when moving.
    sp.step(-accel * facing * 0.5 - Math.abs(vx) * 0.9, dt);
    const p = this.puppet;
    p.clearAll();
    drawPuppet(p, PUPPET_OX, PUPPET_OY, look, {
      anim,
      phase,
      t,
      antX: sp.x,
      blink: (t * 0.31 + (id.length % 5) * 0.17) % 1 > 0.965,
    });
    const flip = facing < 0;
    st.sprite(p, flip ? x - (PUPPET_W - 1 - PUPPET_OX) : x - PUPPET_OX, y - PUPPET_OY, flip);
  }

  private drawDrone(st: Stage, d: Drone): void {
    const x = Math.round(d.x);
    const y = Math.round(d.y + Math.sin(d.t * 2.4) * 1.5);
    const spin = Math.floor(d.t * 30) % 2;
    st.rect(x - 11 + spin, y - 6, 9 - spin * 2, 1, '#566170', 0.75);
    st.rect(x + 3 + spin, y - 6, 9 - spin * 2, 1, '#566170', 0.75);
    st.rect(x - 7, y - 5, 1, 2, '#161a20');
    st.rect(x + 7, y - 5, 1, 2, '#161a20');
    st.rect(x - 8, y - 3, 17, 2, '#1c222b');
    st.rect(x - 5, y - 3, 11, 5, '#232a34');
    st.rect(x - 5, y - 3, 11, 1, '#3e4958');
    st.rect(x - 3, y + 2, 7, 2, '#141920');
    const col = !d.active ? '#30363e' : d.sus > 0.6 ? GLOW.red : d.sus > 0.12 ? GLOW.amber : GLOW.cyan;
    if (d.active) {
      st.emit(x - 1, y - 1, 3, 2, col, 1, 0.6);
      st.emit(x - 1, y + 4, 3, 1, '#eaf6ff', 1, 0.7);
    } else st.rect(x - 1, y - 1, 3, 2, col);
  }

  private moverSprite(m: Mover): Art {
    let a = this.moverArt.get(m.id);
    if (a) return a;
    a = new Art(m.w, m.h + 4);
    const me = RAMP.metal;
    if (m.kind === 'container') {
      const base = ['#8a3a30', '#2f5f7a', '#6a7a3a', '#8a6a2a'][m.id.length % 4]!;
      a.rect(0, 0, m.w, m.h, base);
      for (let i = 2; i < m.w; i += 4) a.rect(i, 1, 1, m.h - 2, shade(base, 0.74));
      a.rect(0, 0, m.w, 1, shade(base, 1.4));
      a.rect(0, m.h - 1, m.w, 1, shade(base, 0.55));
      a.rect(0, 0, 2, m.h, shade(base, 0.6));
      a.rect(m.w - 2, 0, 2, m.h, shade(base, 0.6));
    } else if (m.kind === 'gondola') {
      a.rect(0, 0, m.w, m.h, '#2a3340');
      a.rect(0, 0, m.w, 1, '#4a5868');
      a.rect(2, 2, m.w - 4, 2, '#1a2028');
      a.rect(0, m.h - 2, m.w, 2, '#161b22');
    } else {
      a.rect(0, 0, m.w, m.h, me[1]);
      a.rect(0, 0, m.w, 1, me[3]);
      a.rect(0, m.h - 1, m.w, 1, me[0]);
      for (let i = 0; i < m.w; i += 8) {
        a.rect(i, 1, 4, Math.min(3, m.h - 2), '#c8a82a');
        a.rect(i + 4, 1, 4, Math.min(3, m.h - 2), '#1c1e22');
      }
    }
    this.moverArt.set(m.id, a);
    return a;
  }

  draw(st: Stage, w: World, dt: number, cine: Cine): FrameParams {
    this.t += dt;
    const t = this.t;
    const cam = w.camera;
    const sh = cam.shake * this.shakeScale;
    const shx = sh > 0 ? (valueNoise(t * 41, 3.1) - 0.5) * 9 * sh : 0;
    const shy = sh > 0 ? (valueNoise(t * 37, 9.7) - 0.5) * 7 * sh : 0;
    // A hand-held breath: slow, sub-pixel drift so a held frame never looks frozen.
    const hh = this.shakeScale;
    const hx = (valueNoise(t * 0.31, 1.7) - 0.5) * 1.3 * hh;
    const hy = (valueNoise(t * 0.27, 5.3) - 0.5) * 1.0 * hh;
    const camX = cam.x + shx + hx;
    const camY = cam.y + shy + hy;
    this.camX = camX;
    this.camY = camY;
    this.zoom = cam.zoom;
    this.roll = cam.roll + (valueNoise(t * 0.21, 8.1) - 0.5) * 0.0035 * hh + (sh > 0 ? (valueNoise(t * 29, 4.4) - 0.5) * 0.02 * sh : 0);
    st.begin(camX, camY);
    const art = this.art;
    const weather = w.weather;

    // ---- distant layers ----
    for (const L of art.layers) st.layer(L.group, L.art, L.ox, L.oy, L.px, L.py);
    for (const d of art.dynamics) d(st, t, w.signals);

    // ---- play layer ----
    st.strip(art.back, -PAD, -PAD);
    st.maskStrip(art.mask, -PAD, -PAD);

    for (const f of art.flickers) {
      if (f.x + f.w < camX - PAD || f.x > camX + VIEW_W + PAD) continue;
      st.dim(f.x, f.y, f.w, f.h, 1 - flickerValue(f.mode, t, f.seed));
    }

    for (const d of art.playDynamics) d(st, t, w.signals);

    for (const m of w.movers) {
      st.sprite(this.moverSprite(m), m.x, m.y);
      if (m.occlude) st.occluder(m.x, m.y, m.w, m.h);
      if (m.kind === 'container' || m.kind === 'platform') {
        // Hoist cables running up out of frame.
        st.rect(m.x + 3, m.y - 400, 1, 400, '#0c0e12');
        st.rect(m.x + m.w - 4, m.y - 400, 1, 400, '#0c0e12');
      }
    }

    for (const ind of art.indicators) {
      const v = w.signals[ind.id] ?? 0;
      if (ind.kind === 'lamp') {
        if (v >= 1 && Math.sin(t * 2.2) > -0.3) st.emit(ind.x - 2, ind.y - 4, 5, 8, GLOW.red, 1, 0.6);
        continue;
      }
      if (v >= 1) {
        st.emit(ind.x - 4, ind.y - 2, 8, 3, GLOW.teal, 1, 0.5);
        st.emit(ind.x + 3, ind.y + 6, 1, 1, GLOW.green);
      } else if (Math.sin(t * 5) > 0) st.emit(ind.x + 3, ind.y + 6, 1, 1, GLOW.red);
    }

    for (const pk of w.pickups) {
      if (pk.taken) continue;
      const by = Math.round(pk.y + Math.sin(t * 2.6 + pk.x) * 2);
      st.rect(pk.x - 5, by - 3, 10, 7, '#262a32');
      st.rect(pk.x - 4, by - 2, 8, 3, '#d9d0b6');
      st.rect(pk.x - 3, by - 1, 2, 1, '#262a32');
      st.rect(pk.x + 1, by - 1, 2, 1, '#262a32');
      st.emit(pk.x - 4, by + 2, 8, 1, GLOW.amber, 0.6 + 0.4 * Math.sin(t * 4 + pk.x));
    }

    for (let pass = 0; pass < 2; pass++) {
      for (const a of w.actors) {
        if (!a.visible || a.behind !== (pass === 0)) continue;
        if (a.x < camX - 40 || a.x > camX + VIEW_W + 40) continue;
        this.drawFigure(st, a.id, lookFor(a.look), a.x, a.y, a.facing, a.anim, a.phase, a.t, 0, dt);
      }
      if (pass === 0) st.strip(art.mid, -PAD, -PAD);
    }
    for (const d of w.drones) this.drawDrone(st, d);

    const p = w.player;
    const hideFade = p.hidden ? 0.55 : 1;
    if (p.state !== 'dead' || w.failed === 'caught') {
      const look = lookFor('sol');
      this.drawFigure(st, 'sol', look, p.drawX, p.drawY, p.facing, p.anim, p.phase, p.t, p.vx, dt);
      if (hideFade < 1) st.rect(p.cx - 9, p.feet - 24, 18, 24, '#04050a', 0.34);
    }

    st.strip(art.front, -PAD, -PAD);

    this.updateParticles(st, w, dt, camX, camY);
    this.drawWeather(st, w, dt, camX, camY);

    // ---- lights ----
    const lights: Light[] = [];
    const minX = camX - 200;
    const maxX = camX + VIEW_W + 200;
    const minY = camY - 200;
    const maxY = camY + VIEW_H + 200;
    for (const L of this.lights) {
      const d = L.d;
      if (d.on === false) continue;
      if (d.x + d.r < minX || d.x - d.r > maxX || d.y + d.r < minY || d.y - d.r > maxY) continue;
      const f = flickerValue(d.flicker, t, L.seed);
      lights.push({
        x: d.x - camX,
        y: d.y - camY,
        r: d.r,
        color: f === 1 ? L.rgb : [L.rgb[0] * f, L.rgb[1] * f, L.rgb[2] * f],
        dx: d.cone?.dx,
        dy: d.cone?.dy,
        inner: d.cone?.inner,
        outer: d.cone?.outer,
        shadow: d.shadow,
        falloff: d.falloff,
      });
    }
    for (const d of w.drones) {
      if (!d.active) continue;
      const s = d.sus;
      const col: Vec3 =
        s > 0.6
          ? [1.7, 0.28, 0.2]
          : s > 0.12
            ? [lerp(0.8, 1.5, (s - 0.12) / 0.48), lerp(1.05, 0.85, (s - 0.12) / 0.48), lerp(1.2, 0.3, (s - 0.12) / 0.48)]
            : [0.8, 1.05, 1.2];
      lights.push({
        x: d.x - camX,
        y: d.y + 4 - camY,
        r: d.range * 1.25,
        color: col,
        dx: Math.cos(d.aim),
        dy: Math.sin(d.aim),
        inner: d.half * 0.8,
        outer: d.half * 1.08,
        shadow: true,
        falloff: 1.1,
      });
      lights.push({ x: d.x - camX, y: d.y - camY, r: 26, color: [col[0] * 0.5, col[1] * 0.5, col[2] * 0.5] });
    }
    if (p.state !== 'dead' && !p.hidden) {
      // A faint fill so the lead never dissolves into the dark.
      lights.push({ x: p.drawX - camX, y: p.drawY - 16 - camY, r: 34, color: [0.2, 0.18, 0.16], falloff: 1.4 });
    }
    if (p.state !== 'dead' && !p.crouching) {
      const up = p.state === 'ladder' || p.state === 'hang' || p.state === 'climb';
      lights.push({
        x: p.drawX + p.facing * 3 - camX,
        y: p.drawY - 26 - camY,
        r: 118,
        color: [0.62, 0.58, 0.46],
        dx: up ? p.facing * 0.5 : p.facing * 0.97,
        dy: up ? -0.86 : 0.24,
        inner: 0.2,
        outer: 0.5,
        shadow: true,
        falloff: 1.3,
      });
    }
    for (const pk of w.pickups) {
      if (pk.taken) continue;
      const k = 0.5 + 0.2 * Math.sin(t * 4 + pk.x);
      lights.push({ x: pk.x - camX, y: pk.y - camY, r: 36, color: [1.0 * k, 0.7 * k, 0.3 * k] });
    }
    for (const ind of art.indicators) {
      if ((w.signals[ind.id] ?? 0) < 1) continue;
      if (ind.kind === 'lamp') {
        const k = Math.sin(t * 2.2) > -0.3 ? 1 : 0.1;
        lights.push({ x: ind.x - camX, y: ind.y - camY, r: 90, color: [1.3 * k, 0.28 * k, 0.2 * k] });
      } else lights.push({ x: ind.x - camX, y: ind.y - camY, r: 70, color: [0.25, 0.9, 0.85] });
    }

    // ---- storm ----
    if (weather.storm) {
      this.stormT -= dt;
      if (this.stormT <= 0) {
        this.stormT = 4 + Math.random() * 7;
        this.lightning = 1;
        this.onThunder?.();
      }
    }
    this.lightning = Math.max(0, this.lightning - dt * 2.6);
    const base = art.look;
    const look = this.look;
    Object.assign(look, base);
    const fogK = weather.fog / Math.max(0.01, w.level.weather.fog);
    if (fogK !== 1) {
      look.fogMid = base.fogMid * fogK;
      look.scatter = base.scatter * (0.5 + 0.5 * fogK);
    }
    if (this.lightning > 0) {
      // Two quick pulses per strike.
      const pulse = this.lightning * (0.6 + 0.4 * Math.sin(this.lightning * 26)) * (this.reduceFlash ? 0.25 : 1);
      look.ambPlay = [base.ambPlay[0] + 0.5 * pulse, base.ambPlay[1] + 0.56 * pulse, base.ambPlay[2] + 0.7 * pulse];
      look.ambFar = [base.ambFar[0] + 2.2 * pulse, base.ambFar[1] + 2.4 * pulse, base.ambFar[2] + 3 * pulse];
      look.ambMid = [base.ambMid[0] + 1.2 * pulse, base.ambMid[1] + 1.3 * pulse, base.ambMid[2] + 1.7 * pulse];
    }

    // ---- lens ----
    const z = cam.zoom;
    // Tighter framing means shallower focus.
    const aperture = 1 + (z - 1) * 0.7;
    look.blurFar = base.blurFar * aperture;
    look.blurMid = base.blurMid * aperture;
    look.blurFg = base.blurFg * aperture;
    look.blurPlay = 0;
    const rack = cam.rack;
    if (rack > 0.001) {
      // Focus pulled forward: the foreground sharpens, the subject and the city soften.
      look.blurFg = lerp(look.blurFg, 0.25, rack);
      look.blurPlay = 2.4 * rack;
      look.blurMid += 2.6 * rack;
      look.blurFar += 3 * rack;
    } else if (rack < -0.001) {
      // Focus pushed deep: the skyline sharpens, the subject softens.
      look.blurFar = lerp(look.blurFar, 0.35, -rack);
      look.blurMid = lerp(look.blurMid, 0.3, -rack);
      look.blurPlay = 2.2 * -rack;
      look.blurFg += 3 * -rack;
    }
    const mood = cine.mood;
    look.vignette += mood.vignette;
    look.saturation += mood.saturation;
    look.exposure += mood.exposure;
    look.aberration += mood.aberration;
    look.bloom += mood.bloom;

    // A push-in is a move through depth: near layers grow faster than far ones.
    const depth = (parallax: number): number => 1 / Math.max(0.25, 1 - parallax * (1 - 1 / z));
    const zoomFg = depth(1.45);

    return {
      time: t,
      zoom: z,
      zoomFar: depth(0.1),
      zoomMid: depth(0.45),
      zoomFg,
      fgFade: 1 - smoothstep(2.0, 3.2, zoomFg),
      roll: this.roll,
      wipe: cine.wipe,
      fracX: st.fracX,
      fracY: st.fracY,
      groundFogY0: w.level.groundY - camY - 30,
      groundFogY1: w.level.groundY - camY + 20,
      lights,
      look,
      letterbox: cine.letterbox,
      fade: cine.fade,
      flash: clamp(cine.flash + (this.reduceFlash ? 0 : this.lightning * 0.1), 0, 1),
    };
  }

  // ------------------------------------------------------------------ effects

  burst(kind: 'dust' | 'spark' | 'splash', x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      if (kind === 'dust') {
        this.parts.push({
          k: K.Dust,
          x: x + (Math.random() - 0.5) * 8,
          y: y - 1,
          vx: (Math.random() - 0.5) * 34,
          vy: -Math.random() * 14,
          life: 0,
          max: 0.35 + Math.random() * 0.3,
          size: 1 + (Math.random() > 0.6 ? 1 : 0),
          col: '#9aa4b0',
        });
      } else if (kind === 'spark') {
        this.parts.push({
          k: K.Spark,
          x,
          y,
          vx: (Math.random() - 0.5) * 90,
          vy: -30 - Math.random() * 70,
          life: 0,
          max: 0.3 + Math.random() * 0.4,
          size: 1,
          col: Math.random() > 0.5 ? GLOW.amber : GLOW.yellow,
        });
      } else {
        this.parts.push({
          k: K.Splash,
          x,
          y: y - 1,
          vx: (Math.random() - 0.5) * 46,
          vy: -18 - Math.random() * 32,
          life: 0,
          max: 0.16 + Math.random() * 0.14,
          size: 1,
          col: '#b4c6d8',
        });
      }
    }
  }

  private updateParticles(st: Stage, w: World, dt: number, camX: number, camY: number): void {
    const art = this.art;
    const wind = w.weather.wind;
    for (let i = 0; i < art.emitters.length; i++) {
      const e = art.emitters[i]!;
      if (e.x < camX - 60 || e.x > camX + VIEW_W + 60 || e.y < camY - 60 || e.y > camY + VIEW_H + 80) continue;
      if (e.kind === 'moth') {
        for (let k = 0; k < 3; k++) {
          const a = this.t * (1.7 + k * 0.6) + k * 2.1 + e.x;
          const r = 5 + 4 * Math.sin(this.t * 0.9 + k * 1.7);
          st.rect(e.x + Math.cos(a) * r, e.y + Math.sin(a * 1.3) * r * 0.6, 1, 1, '#f4ecd8', 0.9);
        }
        continue;
      }
      this.emitAcc[i]! += e.rate * dt;
      while (this.emitAcc[i]! >= 1) {
        this.emitAcc[i]! -= 1;
        const vent = e.kind === 'vent';
        this.parts.push({
          k: K.Steam,
          x: e.x + (Math.random() - 0.5) * (e.w ?? 6),
          y: e.y,
          vx: (Math.random() - 0.5) * 6 + (vent ? 9 : 0),
          vy: -(vent ? 9 : 15) - Math.random() * 9,
          life: 0,
          max: (vent ? 1.5 : 1.9) + Math.random() * 1.1,
          size: 2,
          col: '#c4ccd6',
        });
      }
    }

    const ps = this.parts;
    let n = 0;
    for (let i = 0; i < ps.length; i++) {
      const q = ps[i]!;
      q.life += dt;
      if (q.life >= q.max) continue;
      const u = q.life / q.max;
      if (q.k === K.Steam) {
        q.vx += (wind * 26 - q.vx) * dt * 0.8;
        q.vy *= 1 - dt * 0.35;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        const size = 2 + Math.floor(u * 4);
        const alpha = 0.3 * Math.min(1, u * 7) * (1 - u);
        st.rect(q.x - size / 2, q.y - size / 2, size, size, q.col, alpha);
      } else if (q.k === K.Spark) {
        q.vy += 260 * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        st.emit(q.x, q.y, 1, 1, q.col, 1 - u);
      } else {
        q.vy += (q.k === K.Dust ? 30 : 240) * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        st.rect(q.x, q.y, q.size, q.size, q.col, (1 - u) * (q.k === K.Dust ? 0.5 : 0.75));
      }
      ps[n++] = q;
    }
    ps.length = n;
  }

  private drawWeather(st: Stage, w: World, dt: number, camX: number, camY: number): void {
    const rain = w.weather.rain;
    if (rain <= 0.01) return;
    const slant = w.weather.wind + w.wind / 320;
    const count = Math.floor(this.drops.length * Math.min(1, rain));
    for (let i = 0; i < count; i++) {
      const d = this.drops[i]!;
      d.y += d.sp * dt;
      d.x += slant * d.sp * 0.42 * dt;
      // Keep the field wrapped around the camera so it scrolls with the world.
      const x = mod(d.x - camX + PAD, TEX_W) + camX - PAD;
      const y = mod(d.y - camY + PAD, TEX_H) + camY - PAD;
      const half = Math.ceil(d.len / 2);
      const off = Math.round(slant * 2);
      st.rect(x, y, 1, half, '#a9bdd2', 0.36);
      st.rect(x + off, y + half, 1, half, '#a9bdd2', 0.36);
    }
    const fgCount = Math.floor(this.fgDrops.length * Math.min(1, rain));
    for (let i = 0; i < fgCount; i++) {
      const d = this.fgDrops[i]!;
      d.y += d.sp * dt;
      d.x += slant * d.sp * 0.42 * dt;
      const x = mod(d.x, TEX_W) - PAD;
      const y = mod(d.y, TEX_H) - PAD;
      st.layerRect('fg', x + st.camX * 1.45, y + st.camY * 1.45, 2, d.len, 1.45, 1.45, '#6f8196', false, 0.2);
    }
    // Splashes where rain meets a surface.
    let spawn = rain * 34 * dt;
    while (spawn > 0) {
      if (spawn < 1 && Math.random() > spawn) break;
      spawn -= 1;
      const sx = camX + Math.random() * VIEW_W;
      let best = Infinity;
      for (const s of this.tops) {
        if (sx >= s.x0 && sx < s.x1 && s.y >= camY - 20 && s.y < best) best = s.y;
      }
      if (best < camY + VIEW_H) this.burst('splash', sx, best, 2);
    }
  }
}
