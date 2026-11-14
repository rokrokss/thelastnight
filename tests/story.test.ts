import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAPTERS, ORDER } from '../src/content';
import { idle, playThrough, until } from './helpers/playthrough';
import { SessionDriver } from './helpers/session-driver';

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
      await playThrough(new SessionDriver(), ending);
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
    const d = new SessionDriver();
    await d.enter('tops');
    await until(d, 'tops intro', idle(d));
    d.world.player.place(3548, 394);
    for (let i = 0; i < 30; i++) await d.tick();
    expect(d.exit).toBeNull();
    expect(d.flags['tops.t.board']).toBeUndefined();
    // Now do it properly: the same trigger must still fire.
    d.flags['tops.relay'] = 1;
    await until(d, 'cable car leaves', () => d.exit !== null, 30);
    expect(d.exit).toBe('yards');
  });
});
