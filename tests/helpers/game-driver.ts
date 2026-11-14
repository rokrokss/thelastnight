import { expect } from 'vitest';
import type { Action } from '../../src/core/input';
import { Game } from '../../src/game/game';
import type { World } from '../../src/game/world';
import type { Driver } from './playthrough';

/**
 * A stand-in for canvas contexts under jsdom: every property is itself,
 * every call returns itself, and it reads as 0 in arithmetic. Drawing and
 * WebGL calls become no-ops, so the real renderer, painters and view all run.
 */
function blackHole(): unknown {
  const hole: unknown = new Proxy(function () {}, {
    get: (_t, prop) => (prop === Symbol.toPrimitive ? () => 0 : prop === 'then' ? undefined : hole),
    set: () => true,
    apply: () => hole,
    construct: () => hole as object,
  });
  return hole;
}

export function installFakeCanvas(): void {
  const hole = blackHole();
  HTMLCanvasElement.prototype.getContext = (() => hole) as never;
}

/**
 * Plays the real Game: title menu, real UI (captions, choices, the tuning
 * scope), real chapter loading and hand-over. Needs a DOM (jsdom).
 */
export class GameDriver implements Driver {
  readonly game: Game;
  picks: number[] = [];
  readonly fails: string[] = [];
  private holds = new Set<Action>();
  private taps: Action[] = [];
  private current: string | null = null;
  private choosing = false;
  private want = 0;
  private failedWorld: World | null = null;

  readonly pad = {
    set: (a: Action, on: boolean): void => {
      if (on) this.holds.add(a);
      else this.holds.delete(a);
    },
    tap: (a: Action): void => {
      this.taps.push(a);
    },
  };

  constructor() {
    installFakeCanvas();
    const canvas = document.createElement('canvas');
    const ui = document.createElement('div');
    Object.defineProperty(ui, 'clientWidth', { value: 960 });
    document.body.append(canvas, ui);
    this.game = new Game(canvas, ui);
    this.game.autoPause = false;
  }

  get ready(): boolean {
    return this.game.session !== null;
  }

  get world(): World {
    return this.game.session!.world;
  }

  get flags(): Record<string, number> {
    return this.game.session!.flags;
  }

  get busy(): boolean {
    const s = this.game.session;
    return !s || s.director.busy > 0 || s.world.locked > 0;
  }

  get exit(): string | null {
    if (this.game.ui.waiting === 'credits') return 'credits';
    const id = this.game.session?.chapter.id;
    return id && id !== this.current ? id : null;
  }

  /** Open the game on its title screen. */
  async boot(): Promise<void> {
    await this.game.boot();
    expect(this.game.session?.chapter.id).toBe('title');
    this.current = 'title';
  }

  async enter(id: string): Promise<void> {
    if (this.current === null) await this.boot();
    if (this.current === 'title') {
      // On a fresh save NEW GAME is the first item that can be selected.
      await this.game.advance(1 / 60, [], ['confirm']);
    }
    await this.game.idle();
    expect(this.game.session?.chapter.id).toBe(id);
    this.current = id;
  }

  /** One 60 Hz frame of the real game, answering the UI the way a player would. */
  async tick(): Promise<void> {
    const g = this.game;
    if (!g.session) {
      await g.idle();
      return;
    }
    const w = g.session.world;
    // Stealth and weather have their own tests; here the subject is the game around them.
    w.stealthOff = true;
    w.wind = 0;
    if (w.combat) w.combat.harmless = true;
    if (w.failed && w !== this.failedWorld) {
      this.failedWorld = w;
      this.fails.push(w.failed);
    }
    const taps = this.taps.splice(0);
    let holds = [...this.holds];
    const waiting = g.ui.waiting;
    if (waiting !== 'choice') this.choosing = false;
    if (waiting === 'say') {
      taps.push('confirm');
    } else if (waiting === 'choice') {
      if (!this.choosing) {
        this.choosing = true;
        this.want = this.picks.shift() ?? 0;
      }
      taps.push(g.ui.choiceIndex < this.want ? 'down' : 'confirm');
    } else if (waiting === 'tuner') {
      const m = g.ui.tuning!;
      holds = [];
      const df = m.targetF - m.f;
      if (Math.abs(df) > 0.012) holds.push(df > 0 ? 'right' : 'left');
      if (m.cfg.gain !== undefined) {
        const dg = m.cfg.gain - m.g;
        if (Math.abs(dg) > 0.02) holds.push(dg > 0 ? 'up' : 'down');
      }
    }
    await g.advance(1 / 60, holds, taps);
  }

  /** Tap one action and run a frame. */
  async press(a: Action): Promise<void> {
    await this.game.advance(1 / 60, [], [a]);
  }

  /** The visible menu, top to bottom. */
  menu(): { label: string; enabled: boolean; selected: boolean }[] {
    return [...this.game.ui.root.querySelectorAll('.menu:not(.hidden) .item')].map((el) => ({
      label: el.querySelector('span')?.textContent ?? '',
      enabled: !el.classList.contains('off'),
      selected: el.classList.contains('on'),
    }));
  }
}
