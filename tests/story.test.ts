import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAPTERS, ORDER } from '../src/content';
import { ScriptedControls } from '../src/core/input';
import type { Chapter } from '../src/game/chapter';
import type { Presenter } from '../src/game/director';
import { Session } from '../src/game/session';
import { reached, release, steer } from './helpers/bot';

/** A presenter that reads nothing and agrees with everything, instantly. */
function stubUi(picks: number[] = []): Presenter & { lines: number; said: string[] } {
  const ui = {
    lines: 0,
    said: [] as string[],
    say: (l: { text: string }) => {
      ui.lines++;
      ui.said.push(l.text);
      return Promise.resolve();
    },
    bark: () => undefined,
    choose: (opts: string[]) => Promise.resolve(Math.min(opts.length - 1, picks.shift() ?? 0)),
    card: () => Promise.resolve(),
    objective: () => undefined,
    toast: () => undefined,
    tune: () => Promise.resolve(),
    clear: () => undefined,
  };
  return ui;
}

const sound = { sfx: () => undefined, music: () => undefined };

interface Run {
  session: Session;
  c: ScriptedControls;
  exit: string | null;
  fails: string[];
}

function begin(ch: Chapter, flags: Record<string, number>, picks: number[] = []): Run {
  const run: Run = { session: null as unknown as Session, c: new ScriptedControls(), exit: null, fails: [] };
  run.session = new Session(ch, flags, null, stubUi(picks), sound, {
    onSave: () => undefined,
    onFail: (r) => run.fails.push(r),
    onRespawn: () => undefined,
    onExit: (next) => {
      run.exit = next;
    },
  });
  return run;
}

/** One simulation step, then let pending story continuations run. */
async function tick(run: Run): Promise<void> {
  const w = run.session.world;
  // Story tests cover logic and traversal; stealth and weather have their own tests.
  w.stealthOff = true;
  w.wind = 0;
  run.session.update(1 / 60, run.c);
  run.c.endFrame();
  w.fx.length = 0;
  for (let k = 0; k < 12; k++) await Promise.resolve();
}

async function until(run: Run, what: string, ok: () => boolean, maxSec = 60): Promise<void> {
  release(run.c);
  for (let i = 0; i < maxSec * 60; i++) {
    if (ok()) return;
    await tick(run);
  }
  const p = run.session.world.player;
  throw new Error(`timed out waiting for: ${what} (player at ${p.cx.toFixed(0)}, ${p.feet.toFixed(0)}; busy ${run.session.director.busy})`);
}

async function go(run: Run, x: number, y: number, maxSec = 20): Promise<void> {
  for (let i = 0; i < maxSec * 60; i++) {
    const w = run.session.world;
    if (run.exit) return;
    if (run.fails.length) throw new Error(`died (${run.fails.join(',')}) heading to ${x},${y}`);
    if (w.locked <= 0 && reached(w, x, y)) {
      release(run.c);
      for (let k = 0; k < 6; k++) await tick(run);
      return;
    }
    if (w.locked > 0) release(run.c);
    else steer(w, run.c, x, y);
    await tick(run);
  }
  const p = run.session.world.player;
  throw new Error(`could not reach ${x},${y} (player at ${p.cx.toFixed(0)}, ${p.feet.toFixed(0)}, ${p.state})`);
}

async function use(run: Run, id: string): Promise<void> {
  await until(run, `idle before using ${id}`, () => run.session.director.busy === 0 && run.session.world.locked <= 0, 30);
  const w = run.session.world;
  for (let k = 0; k < 20; k++) await tick(run);
  const near = w.near;
  const nearId = near ? (near.kind === 'npc' ? near.actor.id : near.it.id) : null;
  expect(nearId, `expected to be next to "${id}"`).toBe(id);
  run.c.tap('interact');
  await tick(run);
  await tick(run);
}

const idle = (run: Run) => (): boolean => run.session.director.busy === 0 && run.session.world.locked <= 0;

async function follow(run: Run, pts: readonly (readonly [number, number, 'ride'?])[]): Promise<void> {
  for (const [x, y] of pts) await go(run, x, y);
}

describe('full story', () => {
  let errors: unknown[][] = [];
  beforeEach(() => {
    errors = [];
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errors.push(a));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const ending of [1, 2, 3]) {
    it(`can be played from the prologue to ending ${ending}`, async () => {
      const flags: Record<string, number> = {};
      let run: Run;

      // ---- Prologue: the mast ----
      run = begin(CHAPTERS.mast!, flags);
      await until(run, 'mast intro', idle(run));
      await follow(run, CHAPTERS.mast!.route!);
      await use(run, 'beacon');
      await until(run, 'call with Mun', () => flags['mast.call'] === 1 && idle(run)());
      await follow(run, [
        [548, 190],
        [548, 272],
        [440, 320],
        [346, 320],
        [346, 400],
        [370, 400],
        [440, 400],
        [520, 400],
        [520, 480],
        [392, 480],
        [392, 560],
        [832, 560],
      ]);
      await use(run, 'gondola');
      await until(run, 'leave the mast', () => run.exit !== null);
      expect(run.exit).toBe('lanes');

      // ---- One: the Lanes ----
      run = begin(CHAPTERS.lanes!, flags);
      await until(run, 'lanes intro', idle(run));
      await go(run, 1212, 214);
      await use(run, 'baek');
      await until(run, 'drone lesson', () => run.session.world.thing('relay1').enabled, 40);
      await follow(run, [
        [1508, 214],
        [1508, 150],
        [1704, 150],
        [1704, 96],
        [1806, 96],
      ]);
      await use(run, 'relay1');
      await until(run, 'relay 1', () => flags['lanes.relay'] === 1 && idle(run)());
      await follow(run, [
        [1862, 96],
        [1960, 214],
        [2826, 214],
      ]);
      await use(run, 'jin');
      await until(run, 'leave the lanes', () => run.exit !== null);
      expect(run.exit).toBe('tops');

      // ---- Two: the Tops ----
      run = begin(CHAPTERS.tops!, flags);
      await until(run, 'tops intro', idle(run));
      await follow(run, CHAPTERS.tops!.route!);
      await use(run, 'relay2');
      await until(run, 'relay 2', () => flags['tops.relay'] === 1 && idle(run)());
      await follow(run, [
        [2196, 306],
        [2196, 386],
        [2322, 386],
        [2384, 406],
        [2630, 406],
        [2704, 406],
        [2950, 406],
        [3014, 374],
        [3250, 374],
        [3314, 394],
        [3548, 394],
      ]);
      await until(run, 'leave the tops', () => run.exit !== null);
      expect(run.exit).toBe('yards');

      // ---- Three: the Yards ----
      run = begin(CHAPTERS.yards!, flags, [0, ending === 2 ? 1 : 0]);
      await until(run, 'yards intro', idle(run));
      await go(run, 306, 560);
      await use(run, 'gil');
      await until(run, 'talk with Gil', () => flags['yards.gil'] > 0 && idle(run)());
      await follow(run, CHAPTERS.yards!.route!.slice(0, 27));
      await go(run, 2500, 320);
      await until(run, 'Officer Cha', () => flags['choice.cha'] > 0 && idle(run)());
      await follow(run, [
        [2730, 320],
        [2730, 240],
        [2610, 240],
      ]);
      await use(run, 'relay3');
      await until(run, 'leave the yards', () => run.exit !== null);
      expect(run.exit).toBe('spire');

      // ---- Four: the Spire ----
      run = begin(CHAPTERS.spire!, flags, [ending - 1]);
      await until(run, 'spire intro', idle(run));
      const route = CHAPTERS.spire!.route!;
      const rideAt = route.findIndex((p) => p[2] === 'ride');
      await follow(run, route.slice(0, rideAt));
      await use(run, 'lift');
      await until(run, 'lift ride', () => flags['spire.lift'] === 1 && idle(run)(), 60);
      await follow(run, route.slice(rideAt + 1));
      await use(run, 'main');
      await until(run, 'leave the spire', () => run.exit !== null);
      expect(run.exit).toBe('dawn');
      expect(flags['choice.ending']).toBe(ending);

      // ---- Epilogue ----
      run = begin(CHAPTERS.dawn!, flags);
      await until(run, 'dawn intro', idle(run));
      await go(run, 1300, 214, 120);
      await until(run, 'credits', () => run.exit !== null, 60);
      expect(run.exit).toBe('credits');

      expect(run.fails).toEqual([]);
      expect(errors, `script errors: ${JSON.stringify(errors.map((e) => String(e[1] ?? e[0])))}`).toEqual([]);
    }, 120000);
  }

  it('every chapter in the play order exists and has matching scripts', () => {
    for (const id of ORDER) {
      const ch = CHAPTERS[id]!;
      expect(ch, id).toBeTruthy();
      const level = ch.build();
      for (const t of Object.keys(ch.triggers)) {
        expect(level.triggers.some((x) => x.id === t), `${id}: trigger script "${t}" has no zone`).toBe(true);
      }
      for (const t of level.triggers) {
        expect(ch.triggers[t.id], `${id}: trigger zone "${t.id}" has no script`).toBeTypeOf('function');
      }
      for (const it of level.interacts) {
        expect(ch.interacts[it.id], `${id}: interactable "${it.id}" has no script`).toBeTypeOf('function');
      }
      for (const n of level.npcs) {
        if (n.prompt && !n.extra) expect(ch.interacts[n.id], `${id}: NPC "${n.id}" has no script`).toBeTypeOf('function');
      }
      expect(level.width).toBeLessThanOrEqual(4064);
      expect(level.height).toBeLessThanOrEqual(4064);
    }
  });
});

describe('sequence breaks', () => {
  it('boarding the cable car before waking the relay does not strand the player', async () => {
    const flags: Record<string, number> = {};
    const run = begin(CHAPTERS.tops!, flags);
    await until(run, 'tops intro', idle(run));
    const w = run.session.world;
    w.player.place(3548, 394);
    for (let i = 0; i < 30; i++) await tick(run);
    expect(run.exit).toBeNull();
    expect(flags['tops.t.board']).toBeUndefined();
    // Now do it properly: the same trigger must still fire.
    flags['tops.relay'] = 1;
    await until(run, 'cable car leaves', () => run.exit !== null, 30);
    expect(run.exit).toBe('yards');
  });
});
