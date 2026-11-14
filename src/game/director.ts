import { clamp01, easeInOut } from '../core/math';
import type { Anim } from '../art/puppet';
import type { Cine } from './view';
import type { World } from './world';

/** Who can speak. `radio` voices come over Sol's set instead of from a body in the scene. */
export interface Speaker {
  name: string;
  color: string;
  /** Voice blip pitch multiplier. */
  pitch: number;
  radio?: boolean;
}

export const SPEAKERS: Record<string, Speaker> = {
  sol: { name: 'SOL', color: '#ffb46a', pitch: 1.0 },
  mun: { name: 'MUN', color: '#7fe6d6', pitch: 0.78, radio: true },
  baek: { name: 'BAEK', color: '#e8d8a8', pitch: 0.66 },
  jin: { name: 'JIN', color: '#ffe36a', pitch: 1.5 },
  cha: { name: 'OFFICER CHA', color: '#8fc8ff', pitch: 0.85 },
  gil: { name: 'OLD GIL', color: '#c8d87a', pitch: 0.6 },
  gil_radio: { name: 'OLD GIL', color: '#c8d87a', pitch: 0.6, radio: true },
  cha_radio: { name: 'OFFICER CHA', color: '#8fc8ff', pitch: 0.85, radio: true },
  driver: { name: 'DRIVER', color: '#d8b890', pitch: 0.74 },
  mime: { name: 'MIME', color: '#e8e4dc', pitch: 1.2 },
  alert: { name: 'MERIDIAN ASSURE', color: '#ff8a7a', pitch: 1.1, radio: true },
  dispatch: { name: 'DISPATCH', color: '#8fc8ff', pitch: 0.9, radio: true },
  city: { name: 'SALTGATE', color: '#b8c4d8', pitch: 1.0, radio: true },
};

export interface Line {
  who: string;
  text: string;
  /** World position to anchor the caption to (speaker's head). Null for voice-over. */
  at: (() => [number, number]) | null;
}

export interface TuneConfig {
  id: string;
  /** Target dial position, 0..1. */
  freq: number;
  /** Target gain, 0..1. Omit for a one-knob tune. */
  gain?: number;
  /** How fast the signal wanders (dial units per second). */
  drift?: number;
  /** Chance per second of an interference burst knocking the dial. */
  kick?: number;
  /** Seconds the signal must be held to lock. */
  hold?: number;
  label: string;
}

/** Everything the story needs from the presentation layer. The browser UI implements it; tests stub it. */
export interface Presenter {
  say(line: Line): Promise<void>;
  bark(line: Line, seconds: number): void;
  choose(options: string[]): Promise<number>;
  card(kicker: string, title: string, subtitle: string): Promise<void>;
  objective(text: string | null): void;
  toast(text: string): void;
  tune(cfg: TuneConfig, tick: () => void): Promise<void>;
  /** Drop all transient UI (captions, choices, tuner). */
  clear(): void;
}

export interface SoundPort {
  sfx(name: string, vol?: number): void;
  music(id: string | null): void;
}

class Cancelled extends Error {}

interface Tween {
  t: number;
  dur: number;
  step: (u: number) => void;
  done: () => void;
}

/**
 * The story's handle on the game: scripts are plain async functions that
 * call these methods ("say this, walk there, wait, fade"). Every awaited
 * call checks that the scene is still alive, so restarting from a
 * checkpoint or quitting simply abandons the running script.
 */
export class Director {
  readonly world: World;
  readonly flags: Record<string, number>;
  readonly cine: Cine = { letterbox: 0, fade: [0, 0, 0, 0], flash: 0 };
  alive = true;
  /** Set when a script asks to leave the chapter. */
  exit: { next: string } | null = null;
  /** Number of blocking scripts in flight (suppresses interaction). */
  busy = 0;
  /** Set by the session: records a checkpoint. */
  onMark: ((id: string) => void) | null = null;
  private ui: Presenter;
  private sound: SoundPort;
  private tweens: Tween[] = [];
  private chains = new Map<string, Promise<void>>();
  private onFlag: (() => void) | null;

  constructor(world: World, flags: Record<string, number>, ui: Presenter, sound: SoundPort, onFlag?: () => void) {
    this.world = world;
    this.flags = flags;
    this.ui = ui;
    this.sound = sound;
    this.onFlag = onFlag ?? null;
  }

  private check(): void {
    if (!this.alive) throw new Cancelled();
  }

  private async guard<T>(p: Promise<T>): Promise<T> {
    const v = await p;
    this.check();
    return v;
  }

  /** Run a script; errors other than cancellation are reported, never thrown into the game loop. */
  run(fn: ((d: Director) => Promise<void> | void) | undefined, blocking = true): void {
    if (!fn || !this.alive) return;
    if (blocking) this.busy++;
    Promise.resolve()
      .then(() => fn(this))
      .catch((e: unknown) => {
        if (!(e instanceof Cancelled)) console.error('script error', e);
      })
      .finally(() => {
        if (blocking) this.busy = Math.max(0, this.busy - 1);
      });
  }

  dispose(): void {
    this.alive = false;
    this.ui.clear();
  }

  update(dt: number): void {
    if (this.tweens.length === 0) return;
    const live: Tween[] = [];
    for (const tw of this.tweens) {
      tw.t += dt;
      const u = tw.dur <= 0 ? 1 : clamp01(tw.t / tw.dur);
      tw.step(u);
      if (u >= 1) tw.done();
      else live.push(tw);
    }
    this.tweens = live;
  }

  private tween(dur: number, step: (u: number) => void): Promise<void> {
    return new Promise<void>((done) => this.tweens.push({ t: 0, dur, step, done }));
  }

  // ---- flags ----
  flag(name: string): number {
    return this.flags[name] ?? 0;
  }
  set(name: string, v = 1): void {
    this.flags[name] = v;
    this.onFlag?.();
  }

  // ---- time ----
  wait(sec: number): Promise<void> {
    this.check();
    return this.guard(new Promise<void>((r) => this.world.after(sec, r)));
  }

  // ---- speech ----
  private head(who: string): (() => [number, number]) | null {
    const sp = SPEAKERS[who];
    if (!sp || sp.radio) return null;
    const w = this.world;
    if (who === 'sol') return () => [w.player.drawX, w.player.drawY - 34];
    const a = w.actors.find((x) => x.id === who || x.look === who);
    if (!a) return null;
    return () => [a.x, a.y - 34];
  }

  private noteTalking(who: string, text: string): void {
    const a = this.world.actors.find((x) => x.id === who || x.look === who);
    if (a) a.talking = 0.6 + text.length * 0.035;
  }

  /** A line the player must acknowledge. */
  say(who: string, text: string): Promise<void> {
    this.check();
    this.noteTalking(who, text);
    return this.guard(this.ui.say({ who, text, at: this.head(who) }));
  }

  /** A line that plays out on its own while the player keeps control. */
  bark(who: string, text: string, seconds?: number): void {
    if (!this.alive) return;
    this.noteTalking(who, text);
    this.ui.bark({ who, text, at: this.head(who) }, seconds ?? 1.6 + text.length * 0.055);
  }

  choose(options: string[]): Promise<number> {
    this.check();
    return this.guard(this.ui.choose(options));
  }

  card(kicker: string, title: string, subtitle: string): Promise<void> {
    this.check();
    return this.guard(this.ui.card(kicker, title, subtitle));
  }

  objective(text: string | null): void {
    if (this.alive) this.ui.objective(text);
  }

  toast(text: string): void {
    if (this.alive) this.ui.toast(text);
  }

  tune(cfg: TuneConfig): Promise<void> {
    this.check();
    return this.guard(this.ui.tune(cfg, () => this.check()));
  }

  // ---- staging ----
  lock(): void {
    this.world.locked++;
  }
  unlock(): void {
    this.world.locked = Math.max(0, this.world.locked - 1);
  }

  face(id: string, dir: 1 | -1): void {
    if (id === 'sol') this.world.player.facing = dir;
    else this.world.actor(id).facing = dir;
  }

  faceEachOther(id: string): void {
    const a = this.world.actor(id);
    const p = this.world.player;
    a.facing = p.cx >= a.x ? 1 : -1;
    p.facing = a.x >= p.cx ? 1 : -1;
  }

  pose(id: string, anim: Anim | null): void {
    if (id === 'sol') this.world.player.pose = anim;
    else {
      const a = this.world.actor(id);
      a.idleAnim = anim ?? 'idle';
      a.anim = a.idleAnim;
    }
  }

  /**
   * Run `fn` after everything already queued under `key` has finished. Use it
   * for a character who gets orders from several triggers, so two scripts
   * never steer the same body at once.
   */
  queue(key: string, fn: () => Promise<void>): Promise<void> {
    const prev = this.chains.get(key) ?? Promise.resolve();
    const next = prev.then(fn);
    this.chains.set(
      key,
      next.catch(() => undefined),
    );
    return next;
  }

  /** Walk a character to an x position and wait for them to arrive. */
  walk(id: string, x: number, speed = 40): Promise<void> {
    this.check();
    const w = this.world;
    return this.guard(
      new Promise<void>((done) => {
        const body = id === 'sol' ? w.player : w.actor(id);
        // A newer order replaces an unfinished one; release whoever was waiting on it.
        body.auto?.done();
        body.auto = { x, speed, done };
      }),
    );
  }

  /** Scripted jump for an NPC. */
  hop(id: string, x: number, y: number, dur = 0.5, height = 18): Promise<void> {
    this.check();
    const a = this.world.actor(id);
    return this.guard(
      new Promise<void>((done) => {
        a.hop?.done();
        a.hop = { x0: a.x, y0: a.y, x1: x, y1: y, t: 0, dur, h: height, done };
      }),
    );
  }

  // ---- camera and picture ----
  focus(x: number, y: number, zoom = 1, rate = 2.2): void {
    this.world.camera.focus = { x, y, zoom, rate };
  }
  release(): void {
    this.world.camera.focus = null;
  }
  shake(amount: number): void {
    this.world.camera.addShake(amount);
  }

  bars(on: boolean, dur = 0.7): Promise<void> {
    this.check();
    const from = this.cine.letterbox;
    const to = on ? 0.105 : 0;
    return this.guard(
      this.tween(dur, (u) => {
        this.cine.letterbox = from + (to - from) * easeInOut(u);
      }),
    );
  }

  fade(alpha: number, dur = 0.8, rgb: [number, number, number] = [0, 0, 0]): Promise<void> {
    this.check();
    const from = this.cine.fade[3];
    this.cine.fade[0] = rgb[0];
    this.cine.fade[1] = rgb[1];
    this.cine.fade[2] = rgb[2];
    return this.guard(
      this.tween(dur, (u) => {
        this.cine.fade[3] = from + (alpha - from) * u;
      }),
    );
  }

  flash(amount = 0.6, dur = 0.5): void {
    void this.tween(dur, (u) => {
      this.cine.flash = amount * (1 - u);
    });
  }

  // ---- sound ----
  sfx(name: string, vol = 1): void {
    if (this.alive) this.sound.sfx(name, vol);
  }
  music(id: string | null): void {
    if (this.alive) this.sound.music(id);
  }

  /** Save progress here, so a later failure does not replay what just happened. */
  mark(id: string): void {
    if (this.alive) this.onMark?.(id);
  }

  /** Leave the chapter. The session picks this up at the end of the frame. */
  leave(next: string): void {
    this.exit = { next };
  }
}
