import type { Controls } from '../core/input';
import { TAPES, type Chapter } from './chapter';
import { Director, type Presenter, type SoundPort } from './director';
import type { LevelData } from './level';
import { World, type FailReason } from './world';

export interface SessionHooks {
  /** Persist progress (called at checkpoints). */
  onSave(checkpoint: string | null, flags: Record<string, number>): void;
  onFail(reason: FailReason): void;
  /** The world was rebuilt after a failure. */
  onRespawn(): void;
  onExit(next: string): void;
}

const RESPAWN_DELAY = 1.25;

/**
 * One run of a chapter: owns the world and the director, wires story
 * scripts to world events, and handles checkpoints and restarts.
 */
export class Session {
  readonly chapter: Chapter;
  readonly level: LevelData;
  world!: World;
  director!: Director;
  readonly flags: Record<string, number>;
  checkpoint: string | null;
  private snapshot: Record<string, number>;
  private failT = 0;
  private exited = false;
  private ui: Presenter;
  private sound: SoundPort;
  private hooks: SessionHooks;

  constructor(
    chapter: Chapter,
    flags: Record<string, number>,
    checkpoint: string | null,
    ui: Presenter,
    sound: SoundPort,
    hooks: SessionHooks,
  ) {
    this.chapter = chapter;
    this.level = chapter.build();
    this.flags = flags;
    this.checkpoint = checkpoint;
    this.snapshot = { ...flags };
    this.ui = ui;
    this.sound = sound;
    this.hooks = hooks;
    this.spawn(checkpoint === null);
  }

  private spawn(fresh: boolean): void {
    const ch = this.chapter;
    const flags = this.flags;
    const world = new World(this.level);
    const director = new Director(world, flags, this.ui, this.sound);
    this.world = world;
    this.director = director;
    this.failT = 0;

    for (const t of this.level.triggers) if (flags[`${ch.id}.t.${t.id}`]) world.fired.add(t.id);
    for (const pk of world.pickups) if (flags[`tape.${pk.id}`]) pk.taken = true;

    const cp = this.checkpoint ? this.level.checkpoints.find((c) => c.id === this.checkpoint) : null;
    if (cp) {
      world.player.place(cp.sx, cp.sy);
      world.checkpoint = cp;
    }
    world.camera.snap(world);

    world.onTrigger = (id) => {
      const key = `${ch.id}.t.${id}`;
      if (flags[key]) return;
      flags[key] = 1;
      // Triggers do not count as "busy": they may run long (a guide running ahead)
      // and must not stop the player from using things meanwhile.
      director.run(ch.triggers[id], false);
    };
    world.onInteract = (t) => {
      if (director.busy > 0) return;
      director.run(ch.interacts[t.kind === 'npc' ? t.actor.id : t.it.id]);
    };
    world.onPickup = (pk) => {
      flags[`tape.${pk.id}`] = 1;
      director.sfx('tape');
      director.toast(`TAPE RECOVERED  —  ${TAPES[pk.id]?.title ?? 'Unlabelled'}`);
    };
    world.onCheckpoint = (c) => this.mark(c.id);
    director.onMark = (id) => this.mark(id);

    director.cine.fade = [0, 0, 0, 1];
    ch.setup(director);
    if (fresh && ch.intro) director.run(ch.intro);
    else void director.fade(0, 0.9).catch(() => undefined);
  }

  private mark(id: string): void {
    this.checkpoint = id;
    this.snapshot = { ...this.flags };
    this.hooks.onSave(id, this.flags);
  }

  update(dt: number, input: Controls): void {
    if (this.exited) return;
    const w = this.world;
    w.update(dt, input);
    this.director.update(dt);

    if (w.failed) {
      if (this.failT === 0) {
        this.hooks.onFail(w.failed);
        void this.director.fade(1, w.failed === 'caught' ? 0.7 : 0.4).catch(() => undefined);
      }
      this.failT += dt;
      if (this.failT > RESPAWN_DELAY) this.respawn();
      return;
    }
    if (this.director.exit) {
      this.exited = true;
      const next = this.director.exit.next;
      this.director.dispose();
      this.hooks.onExit(next);
    }
  }

  /** Throw away everything since the last checkpoint and start again from it. */
  respawn(): void {
    this.director.dispose();
    for (const k of Object.keys(this.flags)) delete this.flags[k];
    Object.assign(this.flags, this.snapshot);
    this.spawn(this.checkpoint === null);
    this.hooks.onRespawn();
  }

  dispose(): void {
    this.exited = true;
    this.director.dispose();
  }
}
