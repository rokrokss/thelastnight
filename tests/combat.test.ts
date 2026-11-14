import { describe, expect, it } from 'vitest';
import { ScriptedControls } from '../src/core/input';
import {
  Combat,
  COVER_H,
  INVULN,
  LOCK,
  MAG,
  MAX_HP,
  RECHARGE,
  REGEN_AFTER,
  REGEN_STEP,
  segEnter,
  solBox,
  TELL,
  TOPUP_AFTER,
  type Enforcer,
} from '../src/game/combat';
import { LevelBuilder } from '../src/game/level';
import { World } from '../src/game/world';

const G = 200;

/** A flat quay. Sol starts at x = 100 facing right. */
const flat = (): LevelBuilder => {
  const b = new LevelBuilder('t', 't', 900, 300, G, 1);
  b.solid(-100, G, 1100, 100, 'none');
  b.spawn(100, G, 1);
  return b;
};

/** A waist-high barrier with its left edge at x. */
const barrier = (b: LevelBuilder, x: number): void => {
  b.solid(x, G - COVER_H, 16, COVER_H, 'barrier');
};

interface Rig {
  w: World;
  c: Combat;
  pad: ScriptedControls;
  fx: string[];
  run(sec: number): void;
  step(): void;
}

function rig(b: LevelBuilder): Rig {
  const w = new World(b.build());
  const c = new Combat();
  c.armed = true;
  w.combat = c;
  const pad = new ScriptedControls();
  const fx: string[] = [];
  const step = (): void => {
    w.update(1 / 60, pad);
    pad.endFrame();
    for (const f of w.fx) fx.push(f.type);
    w.fx.length = 0;
  };
  const r: Rig = {
    w,
    c,
    pad,
    fx,
    step,
    run(sec) {
      for (let i = 0; i < Math.round(sec * 60); i++) step();
    },
  };
  r.run(0.2);
  return r;
}

const count = (fx: string[], type: string): number => fx.filter((f) => f === type).length;

/** A trooper already at its post, about to stand up. */
function trooper(r: Rig, x: number, kind: 'trooper' | 'shield' = 'trooper'): Enforcer {
  const e = r.c.spawn([{ id: `e${x}`, kind, x, y: G, posts: [x] }])[0]!;
  return e;
}

describe('geometry', () => {
  it('finds where a segment enters a box', () => {
    const box = { x: 10, y: 10, w: 10, h: 10 };
    expect(segEnter(0, 15, 40, 15, box)).toBeCloseTo(0.25, 6);
    expect(segEnter(0, 0, 40, 5, box)).toBe(Infinity);
    expect(segEnter(12, 12, 40, 12, box)).toBe(0);
  });

  it('a crouch makes Sol short enough for waist-high cover', () => {
    const r = rig(flat());
    expect(solBox(r.w.player).h).toBeGreaterThan(COVER_H);
    r.pad.set('down', true);
    r.run(0.2);
    expect(r.w.player.crouching).toBe(true);
    expect(solBox(r.w.player).h).toBeLessThan(COVER_H);
  });
});

describe('the rivet gun', () => {
  it('does nothing until Sol is armed', () => {
    const r = rig(flat());
    r.c.armed = false;
    r.pad.set('fire', true);
    r.run(1);
    expect(r.c.shots.length).toBe(0);
    expect(r.c.pressure).toBe(MAG);
  });

  it('fires along her facing, six rivets, then has to build pressure', () => {
    const r = rig(flat());
    r.pad.tap('fire');
    r.step();
    expect(r.c.shots.length).toBe(1);
    expect(r.c.shots[0]!.vx).toBeGreaterThan(0);
    expect(r.c.shots[0]!.vy).toBe(0);
    r.pad.set('fire', true);
    r.run(2);
    expect(count(r.fx, 'rivet')).toBe(MAG);
    expect(r.c.pressure === 0 || r.c.pressure === MAG).toBe(true);
    // Empty: the trigger clicks and nothing leaves the gun until the recharge is done.
    const r2 = rig(flat());
    r2.pad.set('fire', true);
    while (r2.c.pressure > 0) r2.step();
    const fired = count(r2.fx, 'rivet');
    r2.run(RECHARGE - 0.1);
    expect(count(r2.fx, 'rivet')).toBe(fired);
    r2.run(0.3);
    expect(count(r2.fx, 'recharge')).toBe(1);
    expect(count(r2.fx, 'rivet')).toBe(fired + 1);
  });

  it('tops up a part-used tank after a rest', () => {
    const r = rig(flat());
    r.pad.tap('fire');
    r.run(0.5);
    expect(r.c.pressure).toBe(MAG - 1);
    r.run(TOPUP_AFTER);
    expect(r.c.pressure).toBe(MAG);
  });

  it('cannot be fired from a crouch, a ladder or during a scene', () => {
    const r = rig(flat());
    r.pad.set('down', true);
    r.run(0.2);
    r.pad.set('fire', true);
    r.run(0.5);
    expect(count(r.fx, 'rivet')).toBe(0);
    r.pad.releaseAll();
    r.w.locked = 1;
    r.pad.set('fire', true);
    r.run(0.5);
    expect(count(r.fx, 'rivet')).toBe(0);
  });

  it('fires as she stands up with the trigger already held, but not on a trigger left held from a scene', () => {
    const r = rig(flat());
    r.pad.set('down', true);
    r.run(0.2);
    r.pad.set('fire', true);
    r.run(0.3);
    expect(count(r.fx, 'rivet')).toBe(0);
    r.pad.set('down', false);
    r.run(0.1);
    expect(count(r.fx, 'rivet')).toBe(1);

    const s = rig(flat());
    s.w.locked = 1;
    s.pad.set('fire', true);
    s.run(0.3);
    s.w.locked = 0;
    s.run(0.5);
    expect(count(s.fx, 'rivet')).toBe(0);
    s.pad.set('fire', false);
    s.run(0.05);
    s.pad.set('fire', true);
    s.run(0.05);
    expect(count(s.fx, 'rivet')).toBe(1);
  });

  it('is stopped by anything solid', () => {
    const b = flat();
    b.wall(200, G - 60, 10, 60);
    const r = rig(b);
    const e = trooper(r, 300);
    r.pad.tap('fire');
    r.run(1);
    expect(count(r.fx, 'ricochet')).toBe(1);
    expect(e.hp).toBe(2);
  });
});

describe('aim assist', () => {
  it('turns the rivet toward an exposed enemy in front of her', () => {
    const b = flat();
    b.solid(240, G - 60, 80, 60, 'none');
    const r = rig(b);
    r.c.harmless = true;
    // Standing on a block, well above the muzzle.
    const e = r.c.spawn([{ id: 'hi', x: 280, y: G - 60, posts: [280] }])[0]!;
    while (!e.aiming) r.step();
    const aim = r.c.aimTarget(r.w);
    expect(aim?.on).toBe(e);
    r.pad.tap('fire');
    r.step();
    expect(r.c.shots[0]!.vy).toBeLessThan(0);
    r.run(0.6);
    expect(e.hp).toBe(1);
  });

  it('ignores what is behind her, behind cover, or out of range', () => {
    const b = flat();
    b.wall(180, G - 60, 10, 60);
    const r = rig(b);
    trooper(r, 300);
    expect(r.c.aimTarget(r.w)).toBeNull();
    const behind = trooper(r, 40);
    expect(r.c.aimTarget(r.w)).toBeNull();
    r.w.player.facing = -1;
    expect(r.c.aimTarget(r.w)?.on).toBe(behind);
    const r2 = rig(flat());
    trooper(r2, 800);
    expect(r2.c.aimTarget(r2.w)).toBeNull();
  });

  it('prefers the nearer of two', () => {
    const r = rig(flat());
    trooper(r, 320);
    const near = trooper(r, 220);
    expect(r.c.aimTarget(r.w)?.on).toBe(near);
  });
});

describe('enforcers', () => {
  it('always show a line before they fire, and fire where it locked', () => {
    const r = rig(flat());
    r.c.harmless = true;
    const e = trooper(r, 300);
    let rose = -1;
    let locked = -1;
    let fired = -1;
    for (let i = 0; i < 600 && fired < 0; i++) {
      r.step();
      const t = i / 60;
      if (rose < 0 && e.state === 'rise') rose = t;
      if (locked < 0 && e.locked) locked = t;
      if (count(r.fx, 'round') > 0) fired = t;
    }
    expect(rose).toBeGreaterThan(0);
    expect(fired - rose).toBeGreaterThanOrEqual(TELL.trooper - 0.04);
    expect(fired - locked).toBeGreaterThanOrEqual(LOCK - 0.04);
    expect(count(r.fx, 'aim')).toBe(1);
  });

  it('miss a target that got out from under the line after it locked', () => {
    const r = rig(flat());
    const e = trooper(r, 300);
    while (!e.locked) r.step();
    // The line is fixed at head height now: get under it.
    r.pad.set('down', true);
    r.run(2);
    expect(count(r.fx, 'round')).toBe(3);
    expect(r.c.hp).toBe(MAX_HP);
  });

  it('hit a target that stays where the line locked', () => {
    const r = rig(flat());
    const e = trooper(r, 300);
    while (!e.locked) r.step();
    r.run(2);
    expect(r.c.hp).toBe(MAX_HP - 1);
  });

  it('hit Sol standing behind low cover, not crouched behind it', () => {
    const stand = (crouch: boolean): Rig => {
      const b = flat();
      barrier(b, 110);
      const r = rig(b);
      trooper(r, 300);
      if (crouch) r.pad.set('down', true);
      r.run(8);
      return r;
    };
    const up = stand(false);
    expect(count(up.fx, 'round')).toBeGreaterThan(3);
    expect(up.c.hp).toBeLessThan(MAX_HP);
    const down = stand(true);
    expect(count(down.fx, 'round')).toBeGreaterThan(3);
    expect(down.c.hp).toBe(MAX_HP);
    expect(count(down.fx, 'ricochet')).toBeGreaterThan(3);
  });

  it('hit Sol crouched in the open', () => {
    const r = rig(flat());
    trooper(r, 300);
    r.pad.set('down', true);
    r.run(6);
    expect(r.c.hp).toBeLessThan(MAX_HP);
  });

  it('are safe behind their own cover until they stand up', () => {
    const b = flat();
    barrier(b, 274);
    const r = rig(b);
    const e = trooper(r, 300);
    r.run(0.1);
    expect(e.state).toBe('duck');
    // Down: nothing to aim at, and a level shot passes over its head.
    expect(r.c.aimTarget(r.w)).toBeNull();
    r.pad.tap('fire');
    r.run(0.4);
    expect(e.hp).toBe(2);
    while (!e.up) r.step();
    expect(r.c.aimTarget(r.w)?.on).toBe(e);
  });

  it('take two rivets, and a hit breaks off the burst', () => {
    const r = rig(flat());
    r.c.harmless = true;
    const e = trooper(r, 300);
    while (!e.aiming) r.step();
    r.pad.tap('fire');
    while (e.hp === 2) r.step();
    expect(e.state).toBe('stagger');
    r.run(0.5);
    expect(count(r.fx, 'round')).toBe(0);
    while (!e.up) r.step();
    r.pad.tap('fire');
    r.run(0.6);
    expect(e.alive).toBe(false);
    expect(count(r.fx, 'wreck')).toBe(1);
    expect(r.c.standing).toBe(0);
  });

  it('carry on to their post after being hit on the way in', () => {
    const r = rig(flat());
    r.c.harmless = true;
    const e = r.c.spawn([{ id: 'a', kind: 'shield', x: 500, y: G, posts: [300], hp: 9 }])[0]!;
    r.run(1);
    expect(e.state).toBe('walk');
    // From behind, so the shield does not turn it.
    expect(e.struck(r.w, r.c, e.x, G - 20, -500)).toBe(true);
    expect(e.state).toBe('stagger');
    r.run(8);
    expect(e.x).toBe(300);
  });

  it('hold their fire while a scene is playing', () => {
    const r = rig(flat());
    trooper(r, 300);
    r.w.locked = 1;
    r.run(6);
    expect(count(r.fx, 'round')).toBe(0);
  });

  it('advance from post to post', () => {
    const r = rig(flat());
    r.c.harmless = true;
    const e = r.c.spawn([{ id: 'a', x: 600, y: G, posts: [500, 300] }])[0]!;
    r.run(4);
    expect(e.x).toBe(500);
    // Two bursts from the first post, then it moves up.
    for (let i = 0; i < 60 * 25 && e.x !== 300; i++) r.step();
    expect(e.x).toBe(300);
    expect(count(r.fx, 'round')).toBe(6);
  });

  it('close in without shooting when she is out of reach', () => {
    const r = rig(flat());
    const e = r.c.spawn([{ id: 'a', x: 860, y: G, posts: [800, 400] }])[0]!;
    for (let i = 0; i < 60 * 25 && e.x !== 400; i++) r.step();
    expect(e.x).toBe(400);
    expect(count(r.fx, 'round')).toBe(0);
  });
});

describe('shield units', () => {
  it('turn rivets from the front until they lower the shield to shoot', () => {
    const r = rig(flat());
    r.c.harmless = true;
    const e = trooper(r, 260, 'shield');
    r.run(0.1);
    expect(e.shielded).toBe(true);
    expect(r.c.aimTarget(r.w)).toBeNull();
    r.pad.tap('fire');
    while (count(r.fx, 'deflect') === 0 && count(r.fx, 'clank') === 0) r.step();
    expect(count(r.fx, 'deflect')).toBe(1);
    expect(e.hp).toBe(3);
    while (e.shielded) r.step();
    expect(r.c.aimTarget(r.w)?.on).toBe(e);
    r.pad.tap('fire');
    r.run(0.4);
    expect(e.hp).toBe(2);
  });

  it('can be taken from behind', () => {
    const r = rig(flat());
    r.c.harmless = true;
    const e = trooper(r, 60, 'shield');
    r.run(0.1);
    // It faces Sol (to its right); a rivet arriving from its left is from behind.
    expect(e.facing).toBe(1);
    expect(e.struck(r.w, r.c, e.x, G - 20, 500)).toBe(true);
    expect(e.hp).toBe(2);
  });

  it('never lower a shield they have dug in behind', () => {
    const r = rig(flat());
    const e = r.c.spawn([{ id: 'd', kind: 'shield', x: 300, y: G, posts: [300], dug: true }])[0]!;
    r.run(10);
    expect(e.shielded).toBe(true);
    expect(count(r.fx, 'round')).toBe(0);
  });
});

describe('health', () => {
  it('one burst costs one pip, and three hits put her down', () => {
    const r = rig(flat());
    expect(r.c.hurt(r.w, 1)).toBe(true);
    expect(r.c.hurt(r.w, 1)).toBe(false);
    expect(r.c.hp).toBe(MAX_HP - 1);
    r.run(INVULN + 0.05);
    r.c.hurt(r.w, 1);
    r.run(INVULN + 0.05);
    expect(r.w.failed).toBeNull();
    r.c.hurt(r.w, 1);
    expect(r.c.hp).toBe(0);
    expect(r.w.failed).toBe('downed');
    expect(r.w.player.state).toBe('dead');
  });

  it('comes back after a few seconds without being hit', () => {
    const r = rig(flat());
    r.c.hurt(r.w, 2);
    r.run(REGEN_AFTER - 0.2);
    expect(r.c.hp).toBe(1);
    r.run(0.2 + REGEN_STEP * 2 + 0.1);
    expect(r.c.hp).toBe(MAX_HP);
  });

  it('cannot be lost while harmless or during a scene', () => {
    const r = rig(flat());
    r.c.harmless = true;
    expect(r.c.hurt(r.w, 3)).toBe(false);
    r.c.harmless = false;
    r.w.locked = 1;
    expect(r.c.hurt(r.w, 3)).toBe(false);
    expect(r.w.failed).toBeNull();
  });
});

describe('the hung container', () => {
  const yard = (): Rig => {
    const b = flat();
    b.mover({ id: 'box', x: 300, y: G - 100, w: 72, h: 30, path: [[300, G - 100], [300, G - 30]], speed: 380, pause: 0, active: false, once: true, kind: 'box', occlude: true });
    return rig(b);
  };

  it('falls when its latch is shot and crushes what is under it', () => {
    const r = yard();
    r.c.harmless = true;
    const under = r.c.spawn([
      { id: 'a', kind: 'shield', x: 320, y: G, posts: [320], dug: true },
      { id: 'b', kind: 'shield', x: 350, y: G, posts: [350], dug: true },
    ]);
    const clear = trooper(r, 420);
    const latch = r.c.mark('latch', 296, G - 104, 1);
    r.run(0.2);
    // Not armed yet: nothing to aim at but nothing either.
    expect(r.c.aimTarget(r.w)?.on).not.toBe(latch);
    latch.armed = true;
    while (clear.up) r.step();
    expect(r.c.aimTarget(r.w)?.on).toBe(latch);
    r.pad.tap('fire');
    while (!latch.gone) r.step();
    r.c.drop(r.w, 'box');
    r.run(1);
    expect(r.w.mover('box').arrived).toBe(true);
    expect(under.every((e) => !e.alive)).toBe(true);
    expect(clear.alive).toBe(true);
    expect(count(r.fx, 'crash')).toBe(1);
  });

  it('is fatal to stand under', () => {
    const r = yard();
    r.w.player.place(336, G);
    r.run(0.1);
    r.c.drop(r.w, 'box');
    r.run(1);
    expect(r.w.failed).toBe('downed');
  });
});
