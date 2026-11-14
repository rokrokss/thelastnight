import { describe, expect, it } from 'vitest';
import { ScriptedControls } from '../src/core/input';
import { segmentHitsRect, Rng } from '../src/core/math';
import { SaveStore, type KV } from '../src/core/save';
import { LevelBuilder } from '../src/game/level';
import { Tuner } from '../src/game/tuner';
import { FATAL_FALL, World } from '../src/game/world';

const flat = (): LevelBuilder => {
  const b = new LevelBuilder('t', 't', 800, 300, 200, 1);
  b.solid(-100, 200, 1000, 100, 'none');
  b.spawn(100, 200, 1);
  return b;
};

const run = (w: World, c: ScriptedControls, sec: number): void => {
  for (let i = 0; i < Math.round(sec * 60); i++) {
    w.update(1 / 60, c);
    c.endFrame();
  }
};

describe('math', () => {
  it('rng is deterministic', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
  });
  it('segment/rect intersection', () => {
    const r = { x: 10, y: 10, w: 10, h: 10 };
    expect(segmentHitsRect(0, 15, 30, 15, r)).toBe(true);
    expect(segmentHitsRect(0, 0, 30, 5, r)).toBe(false);
    expect(segmentHitsRect(15, 0, 15, 30, r)).toBe(true);
  });
});

describe('player physics', () => {
  it('stands on the ground and runs', () => {
    const w = new World(flat().build());
    const c = new ScriptedControls();
    run(w, c, 0.2);
    expect(w.player.onGround).toBe(true);
    expect(w.player.feet).toBeCloseTo(200, 3);
    const x0 = w.player.cx;
    c.set('right', true);
    run(w, c, 1);
    expect(w.player.cx - x0).toBeGreaterThan(70);
    expect(w.player.anim).toBe('run');
  });

  it('jump height is frame-rate independent and about 36 px', () => {
    const peaks: number[] = [];
    for (const hz of [30, 60, 144]) {
      const w = new World(flat().build());
      const c = new ScriptedControls();
      for (let i = 0; i < 20; i++) {
        w.update(1 / hz, c);
        c.endFrame();
      }
      c.set('jump', true);
      let peak = 200;
      for (let i = 0; i < hz; i++) {
        w.update(1 / hz, c);
        c.endFrame();
        peak = Math.min(peak, w.player.feet);
      }
      peaks.push(200 - peak);
    }
    for (const p of peaks) {
      expect(p).toBeGreaterThan(34);
      expect(p).toBeLessThan(41);
    }
    expect(Math.abs(peaks[0]! - peaks[2]!)).toBeLessThan(3);
  });

  it('releasing jump early gives a short hop', () => {
    const w = new World(flat().build());
    const c = new ScriptedControls();
    run(w, c, 0.2);
    c.tap('jump');
    let peak = 200;
    for (let i = 0; i < 60; i++) {
      w.update(1 / 60, c);
      c.endFrame();
      peak = Math.min(peak, w.player.feet);
    }
    expect(200 - peak).toBeLessThan(18);
  });

  it('walls stop the player', () => {
    const b = flat();
    b.wall(160, 100, 20, 100);
    const w = new World(b.build());
    const c = new ScriptedControls();
    c.set('right', true);
    run(w, c, 2);
    expect(w.player.x + w.player.w).toBeLessThanOrEqual(160.001);
  });

  it('grabs a ledge and climbs up', () => {
    const b = flat();
    b.solid(160, 150, 100, 50, 'none');
    const w = new World(b.build());
    const c = new ScriptedControls();
    w.player.place(140, 200);
    run(w, c, 0.1);
    c.set('right', true);
    c.set('jump', true);
    let hung = false;
    for (let i = 0; i < 90 && !hung; i++) {
      w.update(1 / 60, c);
      c.endFrame();
      hung = w.player.state === 'hang';
    }
    expect(hung).toBe(true);
    c.releaseAll();
    c.set('up', true);
    run(w, c, 0.8);
    expect(w.player.state).toBe('normal');
    expect(w.player.feet).toBeCloseTo(150, 1);
    expect(w.player.cx).toBeGreaterThan(160);
  });

  it('climbs ladders and steps off at the top', () => {
    const b = flat();
    b.ladder(140, 120, 200);
    b.oneWay(120, 120, 60);
    const w = new World(b.build());
    const c = new ScriptedControls();
    w.player.place(140, 200);
    run(w, c, 0.1);
    c.set('up', true);
    run(w, c, 2.5);
    expect(w.player.state).toBe('normal');
    expect(w.player.feet).toBeCloseTo(120, 1);
  });

  it('drops through one-way platforms with down + jump', () => {
    const b = flat();
    b.oneWay(60, 150, 120);
    const w = new World(b.build());
    const c = new ScriptedControls();
    w.player.place(100, 150);
    run(w, c, 0.2);
    expect(w.player.feet).toBeCloseTo(150, 3);
    c.set('down', true);
    c.tap('jump');
    run(w, c, 0.8);
    expect(w.player.feet).toBeCloseTo(200, 3);
  });

  it('a long fall is fatal, a short one is not', () => {
    const mk = (height: number): World => {
      const b = flat();
      const w = new World(b.build());
      w.player.place(100, 200 - height);
      return w;
    };
    const c = new ScriptedControls();
    const safe = mk(FATAL_FALL - 30);
    run(safe, c, 2);
    expect(safe.failed).toBeNull();
    const dead = mk(FATAL_FALL + 30);
    run(dead, c, 2);
    expect(dead.failed).toBe('fall');
  });

  it('wind pushes a standing player but not a braced one', () => {
    const w = new World(flat().build());
    const c = new ScriptedControls();
    run(w, c, 0.2);
    w.wind = 300;
    const x0 = w.player.cx;
    run(w, c, 1);
    expect(w.player.cx - x0).toBeGreaterThan(20);
    const x1 = w.player.cx;
    c.set('down', true);
    run(w, c, 1);
    expect(Math.abs(w.player.cx - x1)).toBeLessThan(14);
  });
});

describe('drones', () => {
  const withDrone = (): World => {
    const b = flat();
    b.drone({ id: 'd', path: [[300, 120]], range: 140, half: 0.4 });
    b.hide(280, 150, 40, 50);
    return new World(b.build());
  };

  it('catch a player standing in the light', () => {
    const w = withDrone();
    const c = new ScriptedControls();
    w.player.place(300, 200);
    run(w, c, 2);
    expect(w.failed).toBe('caught');
  });

  it('miss a player hiding in cover', () => {
    const w = withDrone();
    const c = new ScriptedControls();
    w.player.place(300, 200);
    w.drone('d').active = false;
    c.set('down', true);
    run(w, c, 0.3);
    expect(w.player.hidden).toBe(true);
    w.drone('d').active = true;
    run(w, c, 3);
    expect(w.failed).toBeNull();
    expect(w.detect).toBe(0);
  });

  it('cannot see through walls', () => {
    const b = flat();
    b.drone({ id: 'd', path: [[300, 120]], range: 160, half: 0.6 });
    b.wall(250, 150, 100, 6);
    const w = new World(b.build());
    const c = new ScriptedControls();
    w.player.place(300, 200);
    run(w, c, 3);
    expect(w.failed).toBeNull();
  });
});

describe('tuner', () => {
  it('locks when held on the signal and not otherwise', () => {
    const t = new Tuner({ id: 'x', freq: 0.6, hold: 1, label: '' }, () => 0.5);
    for (let i = 0; i < 120; i++) t.update(1 / 60, 0, 0);
    expect(t.done).toBe(false);
    for (let i = 0; i < 600 && !t.done; i++) {
      const d = t.targetF - t.f;
      t.update(1 / 60, Math.abs(d) < 0.01 ? 0 : Math.sign(d), 0);
    }
    expect(t.done).toBe(true);
  });

  it('needs the gain matched when a gain target is set', () => {
    const t = new Tuner({ id: 'x', freq: 0.5, gain: 0.8, hold: 0.5, label: '' }, () => 0.5);
    t.f = 0.5;
    for (let i = 0; i < 300; i++) t.update(1 / 60, 0, 0);
    expect(t.done).toBe(false);
    for (let i = 0; i < 900 && !t.done; i++) {
      const d = 0.8 - t.g;
      t.update(1 / 60, 0, Math.abs(d) < 0.02 ? 0 : -Math.sign(d));
    }
    expect(t.done).toBe(true);
  });
});

describe('save', () => {
  const mem = (): KV & { m: Map<string, string> } => {
    const m = new Map<string, string>();
    return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
  };

  it('round-trips progress and settings', () => {
    const kv = mem();
    const a = new SaveStore(kv);
    a.data.settings.music = 0.3;
    a.setProgress({ chapter: 'lanes', checkpoint: 'cp_baek', flags: { 'lanes.baek': 1 } });
    const b = new SaveStore(kv);
    expect(b.data.settings.music).toBe(0.3);
    expect(b.data.progress?.checkpoint).toBe('cp_baek');
    expect(b.data.progress?.flags['lanes.baek']).toBe(1);
    expect(b.data.reached).toContain('lanes');
  });

  it('survives corrupt or missing storage', () => {
    const kv = mem();
    kv.m.set('skywave.save.v1', '{not json');
    expect(new SaveStore(kv).data.progress).toBeNull();
    expect(new SaveStore(null).data.settings.master).toBeGreaterThan(0);
    const broken: KV = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    const s = new SaveStore(broken);
    expect(() => s.setProgress({ chapter: 'lanes', checkpoint: null, flags: {} })).not.toThrow();
  });
});
