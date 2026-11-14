import type { SceneArt } from '../src/art/scene';
import { CHAPTERS } from '../src/content';
import type { LevelData } from '../src/game/level';
import type { Renderer } from '../src/gfx/renderer';
import { Stage } from '../src/gfx/stage';
import type { Take } from './film';
import { Scene, type Foley } from './scene';

/** The simulation always runs at the game's 60 Hz, whatever the output frame rate. */
export const STEP = 1 / 60;

/** Let story-style scripts (promise continuations) catch up with the simulation. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

/** Runs takes: builds each one's scene, rolls it up to speed, then steps and draws it. */
export class Player {
  readonly stage = new Stage();
  scene: Scene | null = null;
  take: Take | null = null;
  private renderer: Renderer;
  private foley: Foley;
  private rolling = false;
  private sets = new Map<string, { level: LevelData; art: SceneArt }>();

  constructor(renderer: Renderer, foley: Foley) {
    this.renderer = renderer;
    this.foley = foley;
  }

  /** A chapter's level and painted scenery, built once and shared by every take shot there. */
  private set(id: string): { level: LevelData; art: SceneArt } {
    let s = this.sets.get(id);
    if (!s) {
      const ch = CHAPTERS[id];
      if (!ch) throw new Error(`trailer: no chapter "${id}"`);
      const level = ch.build();
      s = { level, art: ch.paint(level) };
      this.sets.set(id, s);
    }
    return s;
  }

  /** Build a take's scene and bring it to its first frame. */
  async open(take: Take): Promise<void> {
    this.take = take;
    this.scene = null;
    if (!take.chapter) return;
    const { level, art } = this.set(take.chapter);
    // Nothing that happens while the scene is being brought up to speed is heard.
    const s = new Scene(CHAPTERS[take.chapter]!, level, art, {
      sfx: (n, v) => {
        if (!this.rolling) this.foley.sfx(n, v);
      },
    });
    take.setup?.(s);
    const pre = Math.round((take.pre ?? 2) / STEP);
    this.rolling = true;
    s.t = -pre * STEP;
    for (let i = 0; i < pre; i++) {
      s.step(STEP);
      s.draw(this.stage, STEP);
      await settle();
    }
    this.rolling = false;
    s.t = 0;
    this.scene = s;
    if (take.punch) s.d.flash(take.punch, 0.16);
    if (take.play) s.d.run(() => take.play!(s), false);
    await settle();
    take.each?.(s, 0, 0);
  }

  /** Advance the open take by one simulation step. */
  async step(): Promise<void> {
    const s = this.scene;
    if (!s) return;
    s.step(STEP);
    this.take?.each?.(s, s.t, STEP);
    await settle();
  }

  /** Draw the take as it stands. False means there is no picture (a black frame). */
  draw(dt: number): boolean {
    const s = this.scene;
    if (!s) return false;
    this.renderer.render(this.stage.surf, s.draw(this.stage, dt));
    return true;
  }
}
