import { describe, expect, it } from 'vitest';
import { VIEW_H, VIEW_W } from '../src/core/constants';
import { ScriptedControls } from '../src/core/input';
import { SHIFT_Y } from '../src/game/camera';
import { Director, type Presenter } from '../src/game/director';
import { LevelBuilder } from '../src/game/level';
import { World } from '../src/game/world';

const level = (): LevelBuilder => {
  const b = new LevelBuilder('t', 't', 2000, 800, 600, 1);
  b.solid(-100, 600, 2200, 200, 'none');
  b.spawn(1000, 600, 1);
  b.npc({ id: 'pal', x: 1100, y: 600, look: 'baek', facing: -1 });
  b.drone({ id: 'eye', path: [[1700, 300], [1900, 300]], speed: 0, range: 100, half: 0.3 });
  return b;
};

const ui: Presenter = {
  say: () => Promise.resolve(),
  bark: () => undefined,
  choose: () => Promise.resolve(0),
  card: () => Promise.resolve(),
  objective: () => undefined,
  toast: () => undefined,
  tune: () => Promise.resolve(),
  clear: () => undefined,
};
const sound = { sfx: () => undefined, music: () => undefined };

function setup(): { w: World; d: Director; pad: ScriptedControls; run: (sec: number) => Promise<void> } {
  const w = new World(level().build());
  w.stealthOff = true;
  const d = new Director(w, {}, ui, sound);
  const pad = new ScriptedControls();
  w.camera.snap(w);
  const run = async (sec: number): Promise<void> => {
    for (let i = 0; i < Math.round(sec * 60); i++) {
      w.update((1 / 60) * d.timeScale, pad);
      d.update(1 / 60);
      pad.endFrame();
      for (let k = 0; k < 6; k++) await Promise.resolve();
    }
  };
  return { w, d, pad, run };
}

/** Is a world point inside what the camera currently shows? */
const inFrame = (w: World, x: number, y: number): boolean => {
  const p = w.camera.pose;
  return Math.abs(x - p.x) <= VIEW_W / 2 / p.zoom && Math.abs(y - p.y) <= VIEW_H / 2 / p.zoom;
};

describe('camera', () => {
  it('follows the player in play and keeps them in frame', async () => {
    const { w, pad, run } = setup();
    pad.set('right', true);
    await run(3);
    expect(w.player.cx).toBeGreaterThan(1150);
    expect(w.camera.scripted).toBe(false);
    expect(inFrame(w, w.player.cx, w.player.feet - 16)).toBe(true);
  });

  it('cuts straight to a shot and frames the subject', async () => {
    const { w, d, run } = setup();
    d.cut({ on: 'pal', zoom: 2, roll: 0.05, rack: -1 });
    const p = w.camera.pose;
    expect(w.camera.scripted).toBe(true);
    expect(p.x).toBeCloseTo(1100, 0);
    expect(p.zoom).toBe(2);
    expect(p.roll).toBe(0.05);
    expect(p.rack).toBe(-1);
    // It holds there.
    await run(1);
    expect(w.camera.pose.x).toBeCloseTo(1100, 0);
  });

  it('a shot only changes what it names', async () => {
    const { w, d } = setup();
    d.cut({ x: 500, y: 400, zoom: 1.2 });
    d.cut({ zoom: 1.6 });
    const p = w.camera.pose;
    expect(p.x).toBeCloseTo(500, 3);
    expect(p.y).toBeCloseTo(400, 3);
    expect(p.zoom).toBe(1.6);
  });

  it('travels to a shot over time and reports arrival', async () => {
    const { w, d, run } = setup();
    d.cut({ x: 600, y: 400, zoom: 1 });
    let arrived = false;
    void d.move({ x: 900, zoom: 1.5 }, 2, 'linear').then(() => {
      arrived = true;
    });
    await run(1);
    expect(arrived).toBe(false);
    expect(w.camera.pose.x).toBeGreaterThan(700);
    expect(w.camera.pose.x).toBeLessThan(800);
    expect(w.camera.pose.zoom).toBeGreaterThan(1.2);
    expect(w.camera.pose.zoom).toBeLessThan(1.3);
    await run(1.1);
    expect(arrived).toBe(true);
    expect(w.camera.pose.x).toBeCloseTo(900, 3);
    expect(w.camera.pose.zoom).toBeCloseTo(1.5, 5);
  });

  it('a new shot releases whoever was waiting on the old one', async () => {
    const { d, run } = setup();
    let arrived = false;
    void d.move({ x: 900 }, 10).then(() => {
      arrived = true;
    });
    await run(0.2);
    d.cut({ x: 300 });
    await run(0.1);
    expect(arrived).toBe(true);
  });

  it('follows a moving subject for as long as the shot lasts', async () => {
    const { w, d, run } = setup();
    d.cut({ on: 'pal', zoom: 1.5 });
    void d.walk('pal', 1300, 60).catch(() => undefined);
    await run(2);
    expect(w.actor('pal').x).toBeGreaterThan(1200);
    expect(w.camera.pose.x).toBeCloseTo(w.actor('pal').x, 0);
  });

  it('fits a group of subjects into one frame', () => {
    const { w, d } = setup();
    d.cut({ on: ['sol', 'pal'], fit: true });
    const p = w.camera.pose;
    expect(p.zoom).toBeGreaterThan(1);
    expect(inFrame(w, w.player.cx, w.player.feet - 16)).toBe(true);
    expect(inFrame(w, 1100, 590)).toBe(true);
  });

  it('never shows anything outside the level, however tight the shot', () => {
    const { w, d } = setup();
    for (const zoom of [1, 1.5, 2.4]) {
      for (const [x, y] of [[-500, -500], [5000, 5000], [0, 800], [2000, 0]] as const) {
        d.cut({ x, y, zoom });
        const p = w.camera.pose;
        expect(p.x - VIEW_W / 2 / zoom).toBeGreaterThanOrEqual(-1e-6);
        expect(p.x + VIEW_W / 2 / zoom).toBeLessThanOrEqual(2000 + 1e-6);
        expect(p.y - VIEW_H / 2 / zoom).toBeGreaterThanOrEqual(-1e-6);
        expect(p.y + VIEW_H / 2 / zoom).toBeLessThanOrEqual(800 + 1e-6);
      }
    }
  });

  it('eases back to the player when a shot is released', async () => {
    const { w, d, run } = setup();
    d.cut({ x: 300, y: 300, zoom: 2, roll: 0.1, rack: 1 });
    d.release(1);
    expect(w.camera.scripted).toBe(false);
    await run(0.5);
    expect(w.camera.pose.x).toBeGreaterThan(400);
    await run(2.5);
    const p = w.camera.pose;
    expect(inFrame(w, w.player.cx, w.player.feet - 16)).toBe(true);
    expect(Math.abs(p.roll)).toBeLessThan(0.01);
    expect(Math.abs(p.rack)).toBeLessThan(0.01);
    expect(p.zoom).toBeLessThan(1.3);
  });

  it('shifts the lens for a shot without moving what the frame is centred on, and gives it back', async () => {
    const { w, d, run } = setup();
    d.cut({ x: 500, y: 400, zoom: 1.2, shiftX: 80, shiftY: -150 });
    let p = w.camera.pose;
    expect([p.x, p.y]).toEqual([500, 400]);
    expect([p.shiftX, p.shiftY]).toEqual([80, -150]);
    // A later shot that says nothing about the lens keeps it where it was.
    d.cut({ zoom: 1.6 });
    p = w.camera.pose;
    expect([p.shiftX, p.shiftY]).toEqual([80, -150]);
    // Travelling to a shot eases the lens over with everything else.
    void d.move({ shiftX: 0, shiftY: -30 }, 1, 'linear');
    await run(0.5);
    expect(w.camera.pose.shiftY).toBeGreaterThan(-110);
    expect(w.camera.pose.shiftY).toBeLessThan(-70);
    // Back in play, the horizon returns to its everyday place.
    d.release(0.5);
    await run(3);
    expect(w.camera.pose.shiftY).toBeCloseTo(SHIFT_Y, 0);
    expect(Math.abs(w.camera.pose.shiftX)).toBeLessThan(25);
  });

  it('a glance leans toward its target without losing the player, then lets go by itself', async () => {
    const { w, d, run } = setup();
    await run(2);
    const before = w.camera.pose.x;
    // The drone is 700px away: far outside any frame that also holds the player.
    d.glance({ on: 'eye', zoom: 1 }, 1, 0.9);
    await run(1.5);
    expect(w.camera.scripted).toBe(true);
    expect(w.camera.pose.x).toBeGreaterThan(before + 60);
    expect(inFrame(w, w.player.cx, w.player.feet - 16)).toBe(true);
    await run(3.5);
    expect(w.camera.scripted).toBe(false);
    expect(Math.abs(w.camera.pose.x - before)).toBeLessThan(3);
  });

  it('a glance does not cancel a shot that replaced it', async () => {
    const { w, d, run } = setup();
    d.glance({ on: 'eye' }, 0.5);
    await run(0.3);
    d.cut({ on: 'pal', zoom: 2 });
    await run(4);
    expect(w.camera.scripted).toBe(true);
    expect(w.camera.pose.zoom).toBe(2);
  });

  it('tension tightens and unsettles the gameplay frame', async () => {
    const { w, d, run } = setup();
    await run(2);
    const calm = w.camera.pose.zoom;
    d.heat(1);
    let roll = 0;
    for (let i = 0; i < 40; i++) {
      await run(0.1);
      roll = Math.max(roll, Math.abs(w.camera.pose.roll));
    }
    expect(w.camera.pose.zoom).toBeGreaterThan(calm + 0.04);
    expect(roll).toBeGreaterThan(0.008);
  });
});

describe('cinematic controls', () => {
  it('a wipe resolves with the frame covered, then clears', async () => {
    const { d, run } = setup();
    let covered = -1;
    void d.wipe().then(() => {
      covered = d.cine.wipe;
    });
    await run(0.4);
    expect(covered).toBeCloseTo(0.5, 2);
    await run(0.5);
    expect(d.cine.wipe).toBe(0);
  });

  it('slow motion slows the world and then gives the time back', async () => {
    const { d, run } = setup();
    let done = false;
    void d.slowmo(0.25, 0.5).then(() => {
      done = true;
    });
    await run(0.3);
    expect(d.timeScale).toBeCloseTo(0.25, 5);
    await run(1);
    expect(done).toBe(true);
    expect(d.timeScale).toBe(1);
  });

  it('the newest mood wins over one still easing in', async () => {
    const { d, run } = setup();
    d.mood({ vignette: 0.5, saturation: -0.4 }, 3);
    await run(0.5);
    d.calm(0.5);
    await run(4);
    expect(d.cine.mood.vignette).toBeCloseTo(0, 6);
    expect(d.cine.mood.saturation).toBeCloseTo(0, 6);
  });
});
