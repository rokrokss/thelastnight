import { CHAPTERS } from '../../src/content';
import { ScriptedControls } from '../../src/core/input';
import type { Presenter } from '../../src/game/director';
import { Session } from '../../src/game/session';
import type { World } from '../../src/game/world';
import type { Driver } from './playthrough';

const sound = { sfx: () => undefined, music: () => undefined };

/**
 * Plays chapters as bare Sessions: no Game, no DOM, and a presenter that
 * reads nothing and agrees with everything instantly. Fast, and focused on
 * story logic and traversal.
 */
export class SessionDriver implements Driver {
  session!: Session;
  exit: string | null = null;
  picks: number[] = [];
  readonly fails: string[] = [];
  readonly flags: Record<string, number> = {};
  readonly pad = new ScriptedControls();
  readonly ready = true;
  /** Let the fights hurt (they are harmless by default, like stealth and wind). */
  lethal = false;

  get world(): World {
    return this.session.world;
  }

  get busy(): boolean {
    return this.session.director.busy > 0 || this.world.locked > 0;
  }

  enter(id: string): Promise<void> {
    this.exit = null;
    const ui: Presenter = {
      say: () => Promise.resolve(),
      bark: () => undefined,
      choose: (opts) => Promise.resolve(Math.min(opts.length - 1, this.picks.shift() ?? 0)),
      card: () => Promise.resolve(),
      objective: () => undefined,
      toast: () => undefined,
      tune: () => Promise.resolve(),
      clear: () => undefined,
    };
    this.session = new Session(CHAPTERS[id]!, this.flags, null, ui, sound, {
      onSave: () => undefined,
      onFail: (r) => void this.fails.push(r),
      onRespawn: () => undefined,
      onExit: (next) => {
        this.exit = next;
      },
    });
    return Promise.resolve();
  }

  /** One simulation step, then let pending story continuations run. */
  async tick(): Promise<void> {
    const w = this.world;
    // Story tests cover logic and traversal; stealth and weather have their own tests.
    w.stealthOff = true;
    w.wind = 0;
    if (w.combat) w.combat.harmless = !this.lethal;
    this.session.update(1 / 60, this.pad);
    this.pad.endFrame();
    w.fx.length = 0;
    for (let k = 0; k < 12; k++) await Promise.resolve();
  }
}
