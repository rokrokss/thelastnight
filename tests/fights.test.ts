import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WAVES } from '../src/content/ch3b';
import { G, RESPAWN_X } from '../src/content/ch3b.level';
import { MAX_HP } from '../src/game/combat';
import { fight, idle, until } from './helpers/playthrough';
import { SessionDriver } from './helpers/session-driver';

/**
 * The two fights with something at stake: going down sends Sol back to the
 * last checkpoint, with the fight picked up from there and not from the top.
 * (The full playthroughs run them harmless; the rules that hurt have their
 * own unit tests in combat.test.ts and kaiju.test.ts.)
 */
describe('the fights, for real', () => {
  let errors: unknown[][] = [];
  beforeEach(() => {
    errors = [];
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errors.push(a));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Stand where she is, in the open, until it puts her down; then wait to be put back. */
  const goDown = async (d: SessionDriver): Promise<void> => {
    const before = d.world;
    d.lethal = true;
    await until(d, 'going down', () => d.fails.length > 0, 90);
    expect(d.fails).toEqual(['downed']);
    expect(before.failed).toBe('downed');
    await until(d, 'being put back', () => d.world !== before, 10);
    d.lethal = false;
    d.fails.length = 0;
  };

  it('the quay: going down costs the wave she was on, not the ones already won', async () => {
    const d = new SessionDriver();
    await d.enter('quay');
    await until(d, 'quay intro', idle(d), 90);
    await fight(d, 'the first wave', () => d.flags['quay.wave'] === 1);
    expect(d.session.checkpoint).toBe('cp_w2');
    // The second wave is on its way in.
    await until(d, 'the second wave', () => d.world.combat!.standing === WAVES[1]!.length, 10);

    await goDown(d);
    const w = d.world;
    expect(d.flags['quay.wave']).toBe(1);
    expect(w.combat!.armed).toBe(true);
    expect(w.combat!.hp).toBe(MAX_HP);
    expect(w.player.cx).toBeCloseTo(RESPAWN_X, 0);
    expect(w.player.feet).toBeCloseTo(G, 0);
    // The same wave again, from its start.
    expect(w.combat!.standing).toBe(0);
    await until(d, 'the second wave again', () => d.world.combat!.standing === WAVES[1]!.length, 10);

    await fight(d, 'the rest of the quay', () => d.exit !== null);
    expect(d.exit).toBe('tide');
    expect(errors).toEqual([]);
  }, 60000);

  it('the Undertow: going down costs the phase she was on, not the barbs already out', async () => {
    const d = new SessionDriver();
    await d.enter('tide');
    await until(d, 'tide intro', idle(d), 90);
    expect(d.session.checkpoint).toBe('cp_p1');
    await fight(d, 'the first phase', () => d.flags['tide.phase'] === 2, 400);
    expect(d.session.checkpoint).toBe('cp_p2');
    await until(d, 'its second assault', () => d.world.combat!.kaiju!.mode === 'assault' && d.world.combat!.kaiju!.phase === 2, 20);

    await goDown(d);
    const k = d.world.combat!.kaiju!;
    expect(d.flags['tide.phase']).toBe(2);
    expect(d.world.combat!.hp).toBe(MAX_HP);
    // It is still standing in the channel, and it starts its second phase over with the first one's barbs gone.
    expect(k.rise).toBe(1);
    await until(d, 'its second assault again', () => k.mode === 'assault', 20);
    expect(k.phase).toBe(2);
    expect(k.hooksLeft(1)).toBe(0);
    expect(k.root(1)!.gone).toBe(true);
    expect(k.hooksLeft(2)).toBe(2);
    expect(errors).toEqual([]);
  }, 60000);
});
