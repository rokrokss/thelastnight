import { describe, expect, it } from 'vitest';
import { CHAPTERS } from '../src/content';
import { SPEAKERS } from '../src/game/director';
import { BAR, BPM, FILM } from '../trailer/film';
import { PREVIEWS } from '../trailer/previews';

/** The cut is data: these checks catch a slipped edit before a long render does. */
describe('trailer cut', () => {
  const takes = [...FILM.takes].sort((a, b) => a.at - b.at);

  it('is laid out on the musical grid', () => {
    expect((60 / BPM) * 4).toBeCloseTo(BAR, 10);
    expect(FILM.duration / BAR).toBeCloseTo(Math.round(FILM.duration / BAR), 10);
    for (const t of takes) {
      // Every cut lands on a bar or half-bar, which is also a whole frame at 60 and 30 fps.
      expect((t.at / (BAR / 2)) % 1, `${t.name} starts off the grid`).toBeCloseTo(0, 10);
      expect((t.dur / (BAR / 2)) % 1, `${t.name} ends off the grid`).toBeCloseTo(0, 10);
    }
  });

  it('never shows two takes at once and never runs past the end', () => {
    for (let i = 0; i < takes.length; i++) {
      const t = takes[i]!;
      expect(t.dur, t.name).toBeGreaterThan(0);
      expect(t.at + t.dur, t.name).toBeLessThanOrEqual(FILM.duration + 1e-9);
      const next = takes[i + 1];
      if (next) expect(t.at + t.dur, `${t.name} runs into ${next.name}`).toBeLessThanOrEqual(next.at + 1e-9);
    }
  });

  it('shoots only in chapters that exist, under names that are unique', () => {
    const names = new Set<string>();
    for (const t of takes) {
      expect(names.has(t.name), `two takes called ${t.name}`).toBe(false);
      names.add(t.name);
      if (t.chapter) expect(CHAPTERS[t.chapter], `${t.name}: no chapter "${t.chapter}"`).toBeTruthy();
    }
  });

  it('has preview takes that shoot in real chapters, clear of the film and of each other', () => {
    const names = new Set(takes.map((t) => t.name));
    for (const t of PREVIEWS) {
      expect(names.has(t.name), `two takes called ${t.name}`).toBe(false);
      names.add(t.name);
      expect(t.dur, t.name).toBeGreaterThan(0);
      expect(CHAPTERS[t.chapter ?? ''], `${t.name}: no chapter "${t.chapter}"`).toBeTruthy();
      // Parked after the end of the film, so its titles never land on them.
      expect(t.at, t.name).toBeGreaterThanOrEqual(FILM.duration);
    }
  });

  it('keeps every title on screen within the running time, spoken by someone the game knows', () => {
    for (const it of FILM.titles) {
      expect(it.at).toBeGreaterThanOrEqual(0);
      expect(it.at + it.dur).toBeLessThanOrEqual(FILM.duration + 1e-9);
      if (it.kind === 'caption') expect(SPEAKERS[it.who], `caption by "${it.who}"`).toBeTruthy();
    }
  });
});
