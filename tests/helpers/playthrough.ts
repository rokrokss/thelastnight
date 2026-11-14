import { expect } from 'vitest';
import { CHAPTERS } from '../../src/content';
import type { Action } from '../../src/core/input';
import type { World } from '../../src/game/world';
import { FLOOD_X, G as QUAY_G, HANG, HOLD_X } from '../../src/content/ch3b.level';
import { brawl, reached, release, steer, type Pad } from './bot';

/**
 * Something that can play the game. The same script of actions runs against
 * a bare Session (fast, story logic only) and against the whole Game with its
 * real UI and chapter transitions.
 */
export interface Driver {
  /** False while the next chapter is loading. */
  readonly ready: boolean;
  readonly world: World;
  readonly flags: Record<string, number>;
  /** A story script holds the stage, or the player is locked. */
  readonly busy: boolean;
  /** Where the current chapter handed over to, once it has. */
  readonly exit: string | null;
  readonly fails: string[];
  readonly pad: Pad & { tap(a: Action): void };
  /** Answers for upcoming dialogue choices, in order (default: the first option). */
  picks: number[];
  /** Start in, or arrive in, a chapter. */
  enter(id: string): Promise<void>;
  /** One 60 Hz step. */
  tick(): Promise<void>;
}

const where = (d: Driver): string => {
  if (!d.ready) return 'loading';
  const p = d.world.player;
  return `player at ${p.cx.toFixed(0)}, ${p.feet.toFixed(0)}, ${p.state}`;
};

export async function until(d: Driver, what: string, ok: () => boolean, maxSec = 60): Promise<void> {
  release(d.pad);
  for (let i = 0; i < maxSec * 60; i++) {
    if (ok()) return;
    await d.tick();
  }
  throw new Error(`timed out waiting for: ${what} (${where(d)})`);
}

export const idle = (d: Driver) => (): boolean => d.ready && !d.busy;

export async function go(d: Driver, x: number, y: number, maxSec = 20): Promise<void> {
  for (let i = 0; i < maxSec * 60; i++) {
    if (d.exit) return;
    if (d.fails.length) throw new Error(`died (${d.fails.join(',')}) heading to ${x},${y}`);
    if (d.ready) {
      const w = d.world;
      if (w.locked <= 0 && reached(w, x, y)) {
        release(d.pad);
        for (let k = 0; k < 6; k++) await d.tick();
        return;
      }
      if (w.locked > 0) release(d.pad);
      else steer(w, d.pad, x, y);
    }
    await d.tick();
  }
  throw new Error(`could not reach ${x},${y} (${where(d)})`);
}

export async function follow(d: Driver, pts: readonly (readonly [number, number, 'ride'?])[]): Promise<void> {
  for (const [x, y] of pts) await go(d, x, y);
}

/** Press the interact button next to a named thing or person. */
export async function use(d: Driver, id: string): Promise<void> {
  await until(d, `idle before using ${id}`, idle(d), 30);
  for (let k = 0; k < 20; k++) await d.tick();
  const near = d.world.near;
  const nearId = near ? (near.kind === 'npc' ? near.actor.id : near.it.id) : null;
  expect(nearId, `expected to be next to "${id}"`).toBe(id);
  d.pad.tap('interact');
  await d.tick();
  await d.tick();
}

/** Fight until something is true: shoot what can be shot, stand still through the scenes. */
export async function fight(d: Driver, what: string, done: () => boolean, maxSec = 300): Promise<void> {
  for (let i = 0; i < maxSec * 60; i++) {
    if (done()) {
      release(d.pad);
      return;
    }
    if (d.fails.length) throw new Error(`went down (${d.fails.join(',')}) fighting: ${what}`);
    if (d.ready && !d.busy) brawl(d.world, d.pad);
    else release(d.pad);
    await d.tick();
  }
  throw new Error(`timed out fighting: ${what} (${where(d)})`);
}

async function leaves(d: Driver, from: string, to: string, maxSec = 60): Promise<void> {
  await until(d, `leave ${from}`, () => d.exit !== null, maxSec);
  expect(d.exit).toBe(to);
}

/** Play the whole game, prologue to credits, reaching the given ending (1..3). */
export async function playThrough(d: Driver, ending: number): Promise<void> {
  // ---- Prologue: the mast ----
  await d.enter('mast');
  await until(d, 'mast intro', idle(d));
  await follow(d, CHAPTERS.mast!.route!);
  await use(d, 'beacon');
  await until(d, 'call with Mun', () => d.flags['mast.call'] === 1 && idle(d)());
  await follow(d, [
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
  await use(d, 'gondola');
  await leaves(d, 'the mast', 'lanes');

  // ---- One: the Lanes ----
  await d.enter('lanes');
  await until(d, 'lanes intro', idle(d));
  await go(d, 1212, 214);
  await use(d, 'baek');
  await until(d, 'drone lesson', () => d.world.thing('relay1').enabled, 40);
  await follow(d, [
    [1508, 214],
    [1508, 150],
    [1704, 150],
    [1704, 96],
    [1806, 96],
  ]);
  await use(d, 'relay1');
  await until(d, 'relay 1', () => d.flags['lanes.relay'] === 1 && idle(d)());
  await follow(d, [
    [1862, 96],
    [1960, 214],
    [2826, 214],
  ]);
  await use(d, 'jin');
  await leaves(d, 'the lanes', 'tops');

  // ---- Two: the Tops ----
  await d.enter('tops');
  await until(d, 'tops intro', idle(d));
  await follow(d, CHAPTERS.tops!.route!);
  await use(d, 'relay2');
  await until(d, 'relay 2', () => d.flags['tops.relay'] === 1 && idle(d)());
  await follow(d, [
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
  await leaves(d, 'the tops', 'yards');

  // ---- Three: the Yards ----
  d.picks = [0, ending === 2 ? 1 : 0];
  await d.enter('yards');
  await until(d, 'yards intro', idle(d));
  await go(d, 306, 560);
  await use(d, 'gil');
  await until(d, 'talk with Gil', () => d.flags['yards.gil'] > 0 && idle(d)());
  await follow(d, CHAPTERS.yards!.route!.slice(0, 27));
  await go(d, 2500, 320);
  await until(d, 'Officer Cha', () => d.flags['choice.cha'] > 0 && idle(d)());
  await follow(d, [
    [2730, 320],
    [2730, 240],
    [2610, 240],
  ]);
  await use(d, 'relay3');
  await leaves(d, 'the yards', 'quay');

  // ---- Three, part two: the Quay ----
  d.picks = [];
  await d.enter('quay');
  await until(d, 'quay intro', idle(d), 90);
  expect(d.world.combat?.armed).toBe(true);
  await go(d, HOLD_X, QUAY_G);
  await fight(d, 'holding the quay', () => d.exit !== null);
  expect(d.flags['quay.wave']).toBe(3);
  expect(d.exit).toBe('tide');

  // ---- Three, part three: the Undertow ----
  await d.enter('tide');
  await until(d, 'tide intro', idle(d), 90);
  await fight(d, 'the first barbs', () => d.world.thing('floods').enabled, 400);
  expect(d.flags['tide.phase']).toBe(2);
  await go(d, FLOOD_X + 14, QUAY_G, 40);
  await use(d, 'floods');
  await fight(d, 'the rest of the barbs', () => d.flags['tide.free'] === 1 && idle(d)(), 600);
  expect(d.world.combat?.kaiju?.barbsLeft).toBe(0);
  await go(d, HANG.x + HANG.w / 2, QUAY_G - HANG.h, 40);
  await use(d, 'hook');
  await leaves(d, 'the quay', 'spire');

  // ---- Four: the Spire ----
  d.picks = [ending - 1];
  await d.enter('spire');
  await until(d, 'spire intro', idle(d));
  const route = CHAPTERS.spire!.route!;
  const rideAt = route.findIndex((p) => p[2] === 'ride');
  await follow(d, route.slice(0, rideAt));
  await use(d, 'lift');
  await until(d, 'lift ride', () => d.flags['spire.lift'] === 1 && idle(d)(), 60);
  await follow(d, route.slice(rideAt + 1));
  await use(d, 'main');
  await leaves(d, 'the spire', 'dawn', 180);
  expect(d.flags['choice.ending']).toBe(ending);

  // ---- Epilogue ----
  d.picks = [];
  await d.enter('dawn');
  await until(d, 'dawn intro', idle(d));
  await go(d, 1300, 214, 120);
  await leaves(d, 'the epilogue', 'credits');

  expect(d.fails).toEqual([]);
}
