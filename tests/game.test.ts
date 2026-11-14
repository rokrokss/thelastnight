// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameDriver } from './helpers/game-driver';
import { idle, playThrough, until } from './helpers/playthrough';

/**
 * These run the real Game class with its real UI, renderer, painters and
 * chapter loading (canvas and WebGL calls are no-ops under jsdom). They cover
 * what the Session-level story tests cannot: the title menu, hand-over from
 * one chapter to the next, saving and continuing.
 */
describe('the whole game', () => {
  let errors: unknown[][] = [];

  beforeEach(() => {
    errors = [];
    window.localStorage.clear();
    document.body.innerHTML = '';
    // No real-time loop: the tests step the game themselves.
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errors.push(a));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const noErrors = (): void => {
    expect(errors, `errors: ${JSON.stringify(errors.map((e) => e.map(String).join(' ')))}`).toEqual([]);
  };

  it('plays from the title screen through every chapter hand-over to the credits', async () => {
    const d = new GameDriver();
    await playThrough(d, 1);
    noErrors();

    // Credits roll, then the title returns with nothing to continue but chapters to revisit.
    expect(d.game.ui.waiting).toBe('credits');
    await d.press('cancel');
    await d.game.idle();
    expect(d.game.session?.chapter.id).toBe('title');
    const menu = d.menu();
    expect(menu.find((m) => m.label === 'CONTINUE')?.enabled).toBe(false);
    expect(menu.find((m) => m.label === 'CHAPTERS')?.enabled).toBe(true);
    expect(d.game.save.data.endings).toEqual(['warning']);
    noErrors();
  }, 240000);

  it('offers CONTINUE once a game is under way, and resumes without replaying the intro', async () => {
    const d = new GameDriver();
    await d.boot();
    expect(d.menu().find((m) => m.label === 'CONTINUE')?.enabled).toBe(false);

    await d.enter('mast');
    await until(d, 'mast intro', idle(d));
    expect(d.game.save.data.progress).toMatchObject({ chapter: 'mast', checkpoint: 'cp_start' });

    // Pause, then QUIT TO TITLE (fourth item).
    await d.press('pause');
    expect(d.menu().map((m) => m.label)).toEqual(['RESUME', 'RESTART FROM CHECKPOINT', 'SETTINGS', 'QUIT TO TITLE']);
    await d.press('down');
    await d.press('down');
    await d.press('down');
    await d.press('confirm');
    await d.game.idle();
    expect(d.game.session?.chapter.id).toBe('title');

    const menu = d.menu();
    expect(menu[0]).toMatchObject({ label: 'CONTINUE', enabled: true, selected: true });
    await d.press('confirm');
    await d.game.idle();
    expect(d.game.session?.chapter.id).toBe('mast');
    // Straight back into play: no intro scene, controls live.
    for (let i = 0; i < 90; i++) await d.tick();
    expect(d.busy).toBe(false);
    noErrors();
  }, 60000);
});
