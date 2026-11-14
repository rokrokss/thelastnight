import type { SceneArt } from '../src/art/scene';
import type { AmbienceMix } from '../src/audio/audio';
import { ScriptedControls } from '../src/core/input';
import { clamp, damp } from '../src/core/math';
import type { Chapter } from '../src/game/chapter';
import { Director, type Presenter } from '../src/game/director';
import type { LevelData } from '../src/game/level';
import { View } from '../src/game/view';
import { World } from '../src/game/world';
import type { FrameParams } from '../src/gfx/renderer';
import type { Stage } from '../src/gfx/stage';
import { reached, release, steer } from '../tests/helpers/bot';

/** Where a take sends its sound effects: by name, at the moment they happen. */
export interface Foley {
  sfx(name: string, vol?: number): void;
}

/** Continuous sound the picture implies: weather, city, a drone close by. */
export interface Atmos extends AmbienceMix {
  hum: number;
}

/** A camera that travels with Sol on a dolly: eased, and level unless told otherwise. */
export interface Track {
  /** Screen px of room in front of the lens centre (negative trails behind her). */
  lead: number;
  /** World y of the frame centre; omit to ride at her height. */
  y?: number;
  zoom: number;
  roll?: number;
  /** Radians of slow sway added to the roll (a pursuit). */
  sway?: number;
  rack?: number;
}

/** Nobody reads captions on a film set. */
const QUIET: Presenter = {
  say: () => Promise.resolve(),
  bark: () => undefined,
  choose: () => Promise.resolve(0),
  card: () => Promise.resolve(),
  objective: () => undefined,
  toast: () => undefined,
  tune: () => Promise.resolve(),
  clear: () => undefined,
};

/** The trailer is letterboxed throughout, like the game's own cutscenes. */
export const LETTERBOX = 0.105;

/**
 * One take: a chapter's world with nobody playing it. The story's triggers
 * are asleep and nothing can catch or kill Sol, so a shot can place her and
 * everyone else wherever the frame needs them.
 */
export class Scene {
  readonly chapter: Chapter;
  readonly w: World;
  readonly d: Director;
  readonly view: View;
  readonly pad = new ScriptedControls();
  /** Seconds since the take's first frame (negative while it is being set up). */
  t = 0;
  private route: [number, number][] = [];
  private foley: Foley;
  private dolly: Track | null = null;
  private dollyX = NaN;
  private dollyY = NaN;

  constructor(chapter: Chapter, level: LevelData, art: SceneArt, foley: Foley) {
    this.chapter = chapter;
    this.foley = foley;
    const w = new World(level);
    w.stealthOff = true;
    this.w = w;
    this.d = new Director(w, {}, QUIET, { sfx: (n, v) => foley.sfx(n, v), music: () => undefined });
    this.d.cine.letterbox = LETTERBOX;
    this.view = new View(art, w);
    this.view.onThunder = () => {
      w.after(0.25 + Math.random() * 0.4, () => foley.sfx('thunder', 0.55));
      w.camera.addShake(0.12);
    };
  }

  /** Put Sol somewhere (feet position), with the camera already on her. */
  sol(x: number, feet: number, facing: 1 | -1 = 1): this {
    const p = this.w.player;
    p.place(x, feet);
    p.facing = facing;
    this.w.camera.snap(this.w);
    return this;
  }

  /** Hand Sol to the autopilot: she runs, jumps and climbs through these waypoints (feet positions). */
  run(...points: [number, number][]): void {
    this.route = points;
  }

  /** Follow Sol on a dolly from now on (until a cut or move takes the camera). */
  track(t: Track): void {
    this.dolly = t;
    this.dollyX = NaN;
    this.dollyY = NaN;
    this.follow(0);
  }

  private follow(dt: number): void {
    const tr = this.dolly;
    if (!tr) return;
    const p = this.w.player;
    const wantX = p.cx + tr.lead / tr.zoom;
    const wantY = tr.y ?? p.feet - 50 / tr.zoom;
    this.dollyX = Number.isNaN(this.dollyX) ? wantX : damp(this.dollyX, wantX, 5, dt);
    this.dollyY = Number.isNaN(this.dollyY) ? wantY : damp(this.dollyY, wantY, 2.2, dt);
    this.w.camera.cut(this.w, {
      x: this.dollyX,
      y: this.dollyY,
      zoom: tr.zoom,
      roll: (tr.roll ?? 0) + (tr.sway ? Math.sin(this.w.time * 1.1) * tr.sway : 0),
      rack: tr.rack ?? 0,
    });
  }

  /** A lightning strike, with its thunder. */
  strike(): void {
    this.view.lightning = 1;
    this.view.onThunder?.();
  }

  step(dt: number): void {
    const w = this.w;
    const next = this.route[0];
    if (next) {
      if (reached(w, next[0], next[1])) {
        this.route.shift();
        if (this.route.length === 0) release(this.pad);
      } else steer(w, this.pad, next[0], next[1]);
    }
    w.update(dt * this.d.timeScale, this.pad);
    this.d.update(dt);
    this.pad.endFrame();
    this.t += dt;
    this.follow(dt);

    // What the body does is heard and kicks up dust, exactly as in play.
    const v = this.view;
    for (const f of w.fx) {
      switch (f.type) {
        case 'step':
          this.foley.sfx('step', f.a ?? 1);
          if (w.weather.rain > 0.2) v.burst('splash', f.x, f.y, 1);
          break;
        case 'land':
          this.foley.sfx('land', clamp((f.a ?? 20) / 70, 0.3, 1));
          v.burst('dust', f.x, f.y, 3 + Math.floor((f.a ?? 0) / 14));
          break;
        case 'spark':
          this.foley.sfx('spark');
          v.burst('spark', f.x, f.y, 10);
          break;
        case 'jump':
        case 'grab':
        case 'climb':
        case 'rung':
          this.foley.sfx(f.type);
          break;
      }
    }
    w.fx.length = 0;
  }

  draw(stage: Stage, dt: number): FrameParams {
    return this.view.draw(stage, this.w, dt, this.d.cine);
  }

  atmos(): Atmos {
    const w = this.w;
    let hum = 0;
    for (const d of w.drones) {
      if (d.active) hum = Math.max(hum, 1 - Math.hypot(d.x - w.player.cx, d.y - w.player.y) / 240);
    }
    return {
      rain: w.weather.rain,
      wind: clamp(Math.abs(w.weather.wind) * 0.6 + Math.abs(w.wind) / 500 + (w.weather.storm ? 0.3 : 0), 0, 1),
      city: this.chapter.amb.city,
      crowd: this.chapter.amb.crowd,
      hum,
    };
  }
}
