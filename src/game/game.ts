import { AudioSys } from '../audio/audio';
import { CHAPTERS, CREDITS, ENDINGS, FIRST_CHAPTER, ORDER, titleChapter } from '../content';
import { Input, type Action, type Controls } from '../core/input';
import { clamp, pointInRect } from '../core/math';
import { SaveStore, type Quality } from '../core/save';
import { Renderer } from '../gfx/renderer';
import { Stage } from '../gfx/stage';
import { UI } from '../ui/ui';
import type { Chapter } from './chapter';
import { Session } from './session';
import { View, type Cine } from './view';
import type { FailReason, World } from './world';

const NO_INPUT: Controls = { held: () => false, pressed: () => false };
const BLACK: Cine = {
  letterbox: 0,
  fade: [0, 0, 0, 1],
  flash: 0,
  wipe: 0,
  mood: { vignette: 0, saturation: 0, exposure: 0, aberration: 0, bloom: 0 },
};

/** Wait for the next painted frame (or a short timeout, so loading never stalls in a hidden tab). */
const frame = (): Promise<void> =>
  new Promise((resolve) => {
    let done = false;
    const fin = (): void => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(fin);
    window.setTimeout(fin, 120);
  });

const bar = (v: number): string => '■'.repeat(Math.round(v * 10)) + '□'.repeat(10 - Math.round(v * 10));

/** Top-level state: title, play, pause, chapter transitions, settings. */
export class Game {
  readonly renderer: Renderer;
  readonly stage = new Stage();
  readonly input = new Input();
  readonly audio = new AudioSys();
  readonly ui: UI;
  readonly save: SaveStore;
  session: Session | null = null;
  view: View | null = null;
  /** Pause when the tab is hidden. Automation turns this off. */
  autoPause = true;
  /** Automation: stop the real-time loop from advancing the simulation (it still redraws). */
  hold = false;
  private mode: 'title' | 'play' = 'title';
  private paused = false;
  private busy = false;
  private last = 0;
  private flags: Record<string, number> = {};
  /** A chapter asked to hand over during this frame; acted on once the frame is finished. */
  private pendingExit: string | null = null;
  private clock = 0;
  private hornT = 20;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.renderer = new Renderer(canvas);
    this.save = new SaveStore(storage());
    this.ui = new UI(uiRoot, this.input, this.audio);
    this.input.onGesture = () => this.audio.resume();
    const fit = (): void => {
      const b = canvas.getBoundingClientRect();
      this.renderer.resize(b.width, b.height, window.devicePixelRatio || 1);
    };
    window.addEventListener('resize', fit);
    document.addEventListener('visibilitychange', () => {
      if (!this.autoPause) return;
      if (document.hidden) {
        this.audio.suspend();
        if (this.mode === 'play' && !this.paused && !this.ui.menuOpen) this.openPause();
      } else if (this.audio.started) this.audio.resume();
    });
    this.applySettings();
    fit();
  }

  async boot(): Promise<void> {
    await this.showTitle();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------- settings
  private applySettings(): void {
    const s = this.save.data.settings;
    this.audio.setVolumes(s.master, s.music, s.sfx);
    this.ui.textSpeed = s.textSpeed;
    if (this.renderer.quality !== s.quality) {
      this.renderer.quality = s.quality;
      const b = this.renderer.canvas.getBoundingClientRect();
      this.renderer.resize(b.width, b.height, window.devicePixelRatio || 1);
    }
    this.renderer.shadows = s.quality !== 'low';
    if (this.view) {
      this.view.reduceFlash = s.reduceFlash;
      this.view.shakeScale = s.shake ? 1 : 0;
    }
  }

  private settingsMenu(): void {
    const s = this.save.data.settings;
    const commit = (): void => {
      this.applySettings();
      this.save.write();
    };
    const vol = (label: string, key: 'master' | 'music' | 'sfx') => ({
      label,
      value: () => bar(s[key]),
      left: () => {
        s[key] = clamp(Math.round((s[key] - 0.1) * 10) / 10, 0, 1);
        commit();
      },
      right: () => {
        s[key] = clamp(Math.round((s[key] + 0.1) * 10) / 10, 0, 1);
        commit();
      },
    });
    const speeds: [string, number][] = [
      ['SLOW', 26],
      ['NORMAL', 42],
      ['FAST', 80],
    ];
    const qualities: Quality[] = ['low', 'medium', 'high'];
    const cycle = <T>(list: T[], cur: T, dir: number): T => list[(list.indexOf(cur) + dir + list.length) % list.length]!;
    const speedStep = (dir: number): void => {
      const i = Math.max(0, speeds.findIndex((x) => x[1] === s.textSpeed));
      s.textSpeed = speeds[(i + dir + speeds.length) % speeds.length]![1];
      commit();
    };
    this.ui.openMenu({
      where: 'center',
      title: 'SETTINGS',
      onBack: () => this.ui.closeMenu(),
      items: [
        vol('MASTER VOLUME', 'master'),
        vol('MUSIC', 'music'),
        vol('SOUND', 'sfx'),
        {
          label: 'TEXT SPEED',
          value: () => speeds.find((x) => x[1] === s.textSpeed)?.[0] ?? 'NORMAL',
          left: () => speedStep(-1),
          right: () => speedStep(1),
        },
        {
          label: 'SCREEN SHAKE',
          value: () => (s.shake ? 'ON' : 'OFF'),
          left: () => {
            s.shake = !s.shake;
            commit();
          },
          right: () => {
            s.shake = !s.shake;
            commit();
          },
        },
        {
          label: 'REDUCE FLASHES',
          value: () => (s.reduceFlash ? 'ON' : 'OFF'),
          left: () => {
            s.reduceFlash = !s.reduceFlash;
            commit();
          },
          right: () => {
            s.reduceFlash = !s.reduceFlash;
            commit();
          },
        },
        {
          label: 'GRAPHICS',
          value: () => s.quality.toUpperCase(),
          left: () => {
            s.quality = cycle(qualities, s.quality, -1);
            commit();
          },
          right: () => {
            s.quality = cycle(qualities, s.quality, 1);
            commit();
          },
        },
        {
          label: 'FULLSCREEN',
          value: () => (document.fullscreenElement ? 'ON' : 'OFF'),
          act: () => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void document.documentElement.requestFullscreen?.().catch(() => undefined);
          },
        },
        { label: 'BACK', act: () => this.ui.closeMenu() },
      ],
    });
  }

  // ------------------------------------------------------------------- title
  private async showTitle(): Promise<void> {
    this.mode = 'title';
    this.paused = false;
    this.ui.closeAllMenus();
    this.ui.showVeil(false);
    await this.load(titleChapter, null, {});
    this.audio.music('title');
    this.ui.showTitle(true);
    this.ui.setHint('ARROWS / WASD  MOVE     SPACE  JUMP     E  USE     ESC  PAUSE');
    this.titleMenu();
  }

  private titleMenu(): void {
    const p = this.save.data.progress;
    this.ui.openMenu({
      where: 'title',
      items: [
        { label: 'CONTINUE', enabled: !!p && !!CHAPTERS[p.chapter], act: () => void this.continueGame() },
        { label: 'NEW GAME', act: () => this.newGame() },
        { label: 'CHAPTERS', enabled: this.save.data.reached.length > 0, act: () => this.chapterMenu() },
        { label: 'SETTINGS', act: () => this.settingsMenu() },
        { label: 'CREDITS', act: () => this.ui.showCredits(CREDITS, () => undefined) },
      ],
    });
  }

  /** Starting over replaces the save, so ask first when there is one. */
  private newGame(): void {
    if (!this.save.data.progress) {
      void this.start(FIRST_CHAPTER, null, {});
      return;
    }
    this.ui.openMenu({
      where: 'center',
      title: 'NEW GAME',
      note: 'Your current progress will be replaced.',
      onBack: () => this.ui.closeMenu(),
      items: [
        { label: 'BACK', act: () => this.ui.closeMenu() },
        { label: 'START OVER', act: () => void this.start(FIRST_CHAPTER, null, {}) },
      ],
    });
  }

  private chapterMenu(): void {
    const reached = this.save.data.reached;
    const tapes = this.save.data.progress?.flags ?? {};
    this.ui.openMenu({
      where: 'center',
      title: 'CHAPTERS',
      onBack: () => this.ui.closeMenu(),
      note: 'Starting from a chapter replaces your current save.',
      items: [
        ...ORDER.map((id) => {
          const ch = CHAPTERS[id]!;
          return {
            label: `${ch.kicker}  —  ${ch.title}`,
            enabled: reached.includes(id),
            act: () => {
              // Keep recovered tapes and earlier choices when replaying.
              const keep: Record<string, number> = {};
              for (const [k, v] of Object.entries(tapes)) if (k.startsWith('tape.') || k.startsWith('choice.')) keep[k] = v;
              void this.start(id, null, keep);
            },
          };
        }),
        { label: 'BACK', act: () => this.ui.closeMenu() },
      ],
    });
  }

  private async continueGame(): Promise<void> {
    const p = this.save.data.progress;
    if (!p) return;
    await this.start(p.chapter, p.checkpoint, { ...p.flags });
  }

  // -------------------------------------------------------------------- play
  private async start(id: string, checkpoint: string | null, flags: Record<string, number>): Promise<void> {
    const ch = CHAPTERS[id];
    if (!ch || this.busy) return;
    this.audio.resume();
    this.ui.closeAllMenus();
    this.ui.showTitle(false);
    this.ui.showVeil(false);
    this.ui.setHint(null);
    this.mode = 'play';
    this.paused = false;
    await this.load(ch, checkpoint, flags);
    this.audio.music(ch.music);
    this.save.setProgress({ chapter: id, checkpoint, flags });
  }

  /** Build a chapter's world and art behind a loading veil. */
  private async load(ch: Chapter, checkpoint: string | null, flags: Record<string, number>): Promise<void> {
    this.busy = true;
    this.pendingExit = null;
    this.ui.setLoading(true, ch.id === 'title' ? 'SKYWAVE' : 'TUNING…');
    this.ui.clear();
    this.ui.objective(null);
    this.session?.dispose();
    this.session = null;
    this.view = null;
    await frame();
    await frame();
    try {
      this.flags = flags;
      const session = new Session(ch, flags, checkpoint, this.ui, this.audio, {
        onSave: (cp, f) => {
          if (this.mode === 'play') this.save.setProgress({ chapter: ch.id, checkpoint: cp, flags: f });
        },
        onFail: (reason) => this.onFail(reason),
        onRespawn: () => undefined,
        // Called from inside the session's update. Tearing the session down
        // there would pull it out from under the rest of that frame, so only
        // note the request; tick() acts on it once the frame is finished.
        onExit: (next) => {
          this.pendingExit = next;
        },
      });
      const view = new View(ch.paint(session.level), session.world);
      view.onThunder = () => {
        window.setTimeout(() => this.audio.sfx('thunder'), 250 + Math.random() * 500);
        session.world.camera.addShake(0.12);
      };
      this.session = session;
      this.view = view;
      this.ui.project = (x, y) => view.toScreen(x, y);
      this.applySettings();
      this.ui.setLoading(false);
    } catch (e) {
      // Say so, rather than leaving an unexplained black screen. The pause menu still leads back to the title.
      console.error(e);
      this.ui.setLoading(true, 'THIS CHAPTER COULD NOT BE LOADED.  PLEASE RELOAD THE PAGE.');
    }
    this.busy = false;
  }

  private onFail(reason: FailReason): void {
    this.audio.sfx(reason === 'caught' ? 'caught' : 'fell');
    this.session?.world.camera.addShake(reason === 'caught' ? 0.5 : 0.8);
  }

  private async onExit(next: string): Promise<void> {
    if (next === 'credits') {
      const ending = ENDINGS[this.flags['choice.ending'] ?? 1] ?? ENDINGS[1]!;
      this.save.addEnding(ending.id);
      this.save.setProgress(null);
      this.audio.music('dawn');
      this.ui.clear();
      this.ui.objective(null);
      this.ui.showCredits(CREDITS, () => void this.showTitle());
      return;
    }
    if (next === 'title' || !CHAPTERS[next]) {
      await this.showTitle();
      return;
    }
    await this.start(next, null, this.flags);
  }

  private openPause(): void {
    if (this.mode !== 'play' || this.busy) return;
    this.paused = true;
    this.ui.showVeil(true);
    this.ui.setHint('ARROWS / WASD  MOVE     SPACE  JUMP     E  USE     DOWN  HIDE     ESC  PAUSE');
    this.audio.sfx('ui_back', 0.6);
    const resume = (): void => {
      this.ui.closeAllMenus();
      this.ui.showVeil(false);
      this.ui.setHint(null);
      this.paused = false;
    };
    this.ui.openMenu({
      where: 'center',
      title: 'PAUSED',
      onBack: resume,
      items: [
        { label: 'RESUME', act: resume },
        {
          label: 'RESTART FROM CHECKPOINT',
          act: () => {
            resume();
            this.session?.respawn();
          },
        },
        { label: 'SETTINGS', act: () => this.settingsMenu() },
        {
          label: 'QUIT TO TITLE',
          act: () => {
            resume();
            void this.showTitle();
          },
        },
      ],
    });
  }

  // ------------------------------------------------------------------- frame
  private frame(now: number): void {
    // Book the next frame before doing any work: if something below throws,
    // the error is reported and the game carries on, instead of freezing on
    // whatever picture happened to be on screen.
    requestAnimationFrame((t) => this.frame(t));
    const real = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.tick(this.hold ? 0 : real, true);
  }

  /**
   * Automation hook: run the game forward by `seconds` at a fixed 60 Hz
   * without waiting for display frames, optionally holding or tapping
   * controls. Used for scripted playthroughs.
   */
  async advance(seconds: number, hold: Action[] = [], tap: Action[] = []): Promise<void> {
    const steps = Math.max(1, Math.round(seconds * 60));
    for (const a of hold) this.input.setVirtual(a, true);
    for (const a of tap) this.input.tap(a);
    for (let i = 0; i < steps; i++) {
      this.tick(1 / 60, i === steps - 1);
      // Let story scripts (promise continuations) run between simulation steps.
      for (let k = 0; k < 8; k++) await null;
      if (i % 20 === 19) await new Promise<void>((r) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = () => r();
        ch.port2.postMessage(0);
      });
    }
    for (const a of hold) this.input.setVirtual(a, false);
  }

  /** Automation hook: resolves once no chapter is loading. */
  async idle(): Promise<void> {
    while (this.busy) await new Promise<void>((r) => window.setTimeout(r, 30));
  }

  private tick(real: number, render: boolean): void {
    this.clock += real;
    const input = this.input;
    input.poll();

    const s = this.session;
    const v = this.view;
    if (this.mode === 'play' && !this.busy && !this.ui.menuOpen && input.pressed('pause')) {
      this.openPause();
      // The same key press must not also be read by the menu it just opened.
      input.consume('pause');
      input.consume('cancel');
    }
    const dt = this.paused || this.busy ? 0 : real;

    if (s && v) {
      const w = s.world;
      if (dt > 0) {
        if (this.mode === 'title') {
          // A slow crane up and down the mast behind the menu.
          w.camera.cut(w, {
            x: 520 + Math.sin(this.clock * 0.06) * 110,
            y: 330 + Math.sin(this.clock * 0.045) * 90,
            zoom: 1.04 + Math.sin(this.clock * 0.033) * 0.04,
            roll: Math.sin(this.clock * 0.05) * 0.006,
            rack: 0,
          });
        }
        s.update(dt, this.ui.blocking || this.mode === 'title' ? NO_INPUT : input);
      }
      // The session may have swapped its world during the update (respawn).
      const world = s.world;
      this.consumeFx(world, v);
      this.updateHud(s);
      this.updateSound(s, dt);
      const fp = v.draw(this.stage, world, dt, s.director.cine);
      if (render) this.renderer.render(this.stage.surf, fp);
    } else if (render) {
      this.renderer.render(this.stage.surf, {
        time: 0,
        zoom: 1,
        zoomFar: 1,
        zoomMid: 1,
        zoomFg: 1,
        fgFade: 1,
        roll: 0,
        wipe: 0,
        fracX: 0,
        fracY: 0,
        groundFogY0: 0,
        groundFogY1: 1,
        lights: [],
        look: BLANK_LOOK,
        letterbox: BLACK.letterbox,
        fade: BLACK.fade,
        flash: 0,
      });
    }
    this.ui.update(dt, real);
    this.audio.update();
    // Hand over to the next chapter last, when nothing else in this frame
    // still needs the session that is about to be replaced.
    if (this.pendingExit !== null) {
      const next = this.pendingExit;
      this.pendingExit = null;
      void this.onExit(next);
    }
  }

  private consumeFx(w: World, v: View): void {
    for (const f of w.fx) {
      switch (f.type) {
        case 'step':
          this.audio.sfx('step', f.a ?? 1);
          if (w.weather.rain > 0.2) v.burst('splash', f.x, f.y, 1);
          break;
        case 'jump':
          this.audio.sfx('jump');
          break;
        case 'land':
          this.audio.sfx('land', clamp((f.a ?? 20) / 70, 0.3, 1));
          v.burst('dust', f.x, f.y, 3 + Math.floor((f.a ?? 0) / 14));
          if ((f.a ?? 0) > 70) w.camera.addShake(0.25);
          break;
        case 'grab':
          this.audio.sfx('grab');
          break;
        case 'climb':
          this.audio.sfx('climb');
          break;
        case 'rung':
          this.audio.sfx('rung');
          break;
        case 'spot':
          this.audio.sfx('spot');
          break;
        case 'lost':
          this.audio.sfx('lost');
          break;
        case 'spark':
          this.audio.sfx('spark');
          v.burst('spark', f.x, f.y, 10);
          break;
      }
    }
    w.fx.length = 0;
  }

  private updateHud(s: Session): void {
    const w = s.world;
    const p = w.player;
    if (this.mode !== 'play' || this.paused) {
      this.ui.setPrompt(null);
      this.ui.setDetect(0);
      return;
    }
    this.ui.setDetect(w.failed ? 0 : w.detect);
    this.ui.setHud(w.locked <= 0 && s.director.cine.letterbox < 0.01);
    if (s.director.busy > 0 || w.locked > 0) {
      this.ui.setPrompt(null);
      return;
    }
    if (w.near) {
      if (w.near.kind === 'npc') this.ui.setPrompt({ x: w.near.actor.x, y: w.near.actor.y - 38, label: w.near.actor.prompt ?? 'Talk' });
      else this.ui.setPrompt({ x: w.near.it.x, y: w.near.it.y - 34, label: w.near.it.prompt });
      return;
    }
    // Hiding affordance: only worth showing while something is hunting.
    const hunted = w.drones.some((d) => d.active);
    if (hunted && p.onGround && w.level.hides.some((h) => pointInRect(p.cx, p.feet - 6, h))) {
      this.ui.setPrompt({ x: p.cx, y: p.y - 6, label: p.hidden ? 'HIDDEN' : 'Hold DOWN to hide', key: p.hidden ? '' : '▼' });
      return;
    }
    this.ui.setPrompt(null);
  }

  private updateSound(s: Session, dt: number): void {
    const w = s.world;
    const ch = s.chapter;
    this.audio.ambience({
      rain: this.paused ? w.weather.rain * 0.5 : w.weather.rain,
      wind: clamp(Math.abs(w.weather.wind) * 0.6 + Math.abs(w.wind) / 500 + (w.weather.storm ? 0.3 : 0), 0, 1),
      city: ch.amb.city,
      crowd: ch.amb.crowd,
    });
    let near = 0;
    for (const d of w.drones) {
      if (!d.active) continue;
      const dist = Math.hypot(d.x - w.player.cx, d.y - w.player.y);
      near = Math.max(near, 1 - dist / 240);
    }
    this.audio.hum(this.paused ? 0 : Math.max(0, near));
    this.audio.tension(this.paused || w.failed ? 0 : w.detect);
    // A fog horn somewhere out on the water.
    if (dt > 0 && this.mode !== 'title') {
      this.hornT -= dt;
      if (this.hornT <= 0) {
        this.hornT = 38 + Math.random() * 50;
        this.audio.sfx('horn', 0.5);
      }
    }
  }
}

function storage(): Storage | null {
  try {
    const k = '__skywave_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    return null;
  }
}

const BLANK_LOOK = {
  ambFar: [0, 0, 0] as [number, number, number],
  ambMid: [0, 0, 0] as [number, number, number],
  ambPlay: [0, 0, 0] as [number, number, number],
  ambFg: [0, 0, 0] as [number, number, number],
  fogColor: [0, 0, 0] as [number, number, number],
  fogMid: 0,
  groundFog: 0,
  scatter: 0,
  reflect: 0,
  ripple: 0,
  blurFar: 0,
  blurMid: 0,
  blurPlay: 0,
  blurFg: 0,
  bloom: 0,
  bloomWide: 0,
  streak: 0,
  exposure: 1,
  contrast: 1,
  saturation: 1,
  shadowTint: [0, 0, 0] as [number, number, number],
  highTint: [0, 0, 0] as [number, number, number],
  vignette: 0,
  grain: 0,
  aberration: 0,
};
