import { describe, expect, it } from 'vitest';
import { ScriptedControls } from '../src/core/input';
import { Combat, MAX_HP } from '../src/game/combat';
import {
  HOOK_Y,
  Kaiju,
  LIFT,
  PHASES,
  RISE_TIME,
  SINK_TIME,
  SLAM_DMG,
  SLAM_W,
  SWEEP_TELL,
  THROW_FLIGHT,
  WAVE_H,
  WAVE_TELL,
  type Arena,
  type Attack,
} from '../src/game/kaiju';
import { LevelBuilder } from '../src/game/level';
import { World } from '../src/game/world';

const G = 200;
const ARENA: Arena = { x0: 60, x1: 760, deck: G, trench: { x: 300, y: G, w: 120, h: 32 }, slots: [520, 640], boxes: ['hurl1', 'hurl2'] };

/**
 * A stretch of quay with a grated trench at 300..420, a box to stand on at
 * 200..272, a ladder at 140 and two containers parked out of sight.
 */
const quay = (): LevelBuilder => {
  const b = new LevelBuilder('t', 't', 900, 400, G, 1);
  b.solid(-100, G, 400, 200, 'none');
  b.solid(420, G, 600, 200, 'none');
  b.solid(300, G + 32, 120, 170, 'none');
  b.oneWay(300, G, 120, 'catwalk');
  b.solid(200, G - 30, 72, 30, 'none');
  b.ladder(140, G - 80, G);
  b.oneWay(120, G - 80, 40, 'catwalk');
  for (const id of ARENA.boxes) b.mover({ id, x: 0, y: -400, w: 72, h: 30, path: [[0, -400]], speed: 0, active: false, once: true, kind: 'box', occlude: true });
  b.spawn(600, G, 1);
  return b;
};

interface Rig {
  w: World;
  c: Combat;
  k: Kaiju;
  pad: ScriptedControls;
  fx: string[];
  step(): void;
  run(sec: number): void;
  /** Step until the next attack exists (and return it). */
  next(): Attack;
  /** Step until the current attack is over. */
  finish(): void;
}

function rig(): Rig {
  const w = new World(quay().build());
  const c = new Combat();
  const k = new Kaiju(ARENA);
  c.armed = true;
  c.kaiju = k;
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
    k,
    pad,
    fx,
    step,
    run(sec) {
      for (let i = 0; i < Math.round(sec * 60); i++) step();
    },
    next() {
      for (let i = 0; i < 600 && !k.attack; i++) step();
      if (!k.attack) throw new Error('no attack came');
      return k.attack;
    },
    finish() {
      for (let i = 0; i < 1800 && k.attack; i++) step();
      if (k.attack) throw new Error('the attack never ended');
    },
  };
  r.run(0.2);
  return r;
}

const count = (fx: string[], type: string): number => fx.filter((f) => f === type).length;

/** Use only one kind of move for a phase, for the length of a test. */
function only<T>(phase: number, moves: PhaseMoves, fn: () => T): T {
  const def = PHASES[phase - 1]!;
  const keep = { pattern: def.pattern, pressed: def.pressed };
  def.pattern = moves;
  def.pressed = moves;
  try {
    return fn();
  } finally {
    def.pattern = keep.pattern;
    def.pressed = keep.pressed;
  }
}
type PhaseMoves = (typeof PHASES)[number]['pattern'];

describe('the Undertow: coming and going', () => {
  it('rises out of the channel, then waits', () => {
    const r = rig();
    expect(r.k.mode).toBe('under');
    r.k.surface();
    r.run(RISE_TIME / 2);
    expect(r.k.mode).toBe('rising');
    expect(r.k.rise).toBeGreaterThan(0.4);
    expect(r.k.rise).toBeLessThan(0.6);
    r.run(RISE_TIME / 2 + 0.1);
    expect(r.k.mode).toBe('looming');
    // Until the fight is called it does nothing.
    r.run(5);
    expect(r.k.attack).toBeNull();
    expect(r.c.hp).toBe(MAX_HP);
  });

  it('lifts an arm over the quay for a slam, and churns the water when it moves', () => {
    const r = rig();
    r.c.harmless = true;
    r.k.surface();
    r.run(1);
    expect(r.k.churn).toBe(1);
    r.run(RISE_TIME + 3);
    expect(r.k.churn).toBe(0);
    r.k.begin(1);
    const a = r.next();
    const limb = a.zones[0]!.limb;
    r.run(a.tell);
    expect(r.k.raise[limb]).toBe(1);
    expect(r.k.raise[limb === 0 ? 1 : 0]).toBe(0);
    r.finish();
    r.run(1);
    expect(r.k.raise[limb]).toBe(0);
  });

  it('drops each length of cable when its root barb comes out', () => {
    const r = rig();
    r.k.stand();
    r.run(0.5);
    expect(r.k.cut).toEqual([-1, -1, -1]);
    r.k.begin(2);
    r.run(1);
    expect(r.k.cut[0]).toBeGreaterThan(0.9);
    expect(r.k.cut[1]).toBe(-1);
    expect(r.k.cut[2]).toBe(-1);
  });

  it('goes back under once it is free', () => {
    const r = rig();
    r.k.stand();
    r.k.free(r.w);
    r.run(2.5);
    expect(r.k.calm).toBe(1);
    r.k.sink();
    r.run(SINK_TIME + 0.1);
    expect(r.k.mode).toBe('gone');
    expect(r.k.rise).toBe(0);
  });
});

describe('the Undertow: attacks', () => {
  it('marks a stretch of deck, then slams it', () => {
    const r = rig();
    r.k.begin(1);
    const a = r.next();
    expect(a.kind).toBe('slam');
    const z = a.zones[0]!;
    expect(z.x1 - z.x0).toBe(SLAM_W);
    expect(z.x0).toBeLessThan(r.w.player.cx);
    expect(z.x1).toBeGreaterThan(r.w.player.cx);
    expect(count(r.fx, 'warn')).toBe(1);
    // The whole warning passes before anything lands.
    r.run(a.tell - 0.1);
    expect(a.stage).toBe('tell');
    expect(r.c.hp).toBe(MAX_HP);
    expect(r.k.limbDown(a, z)).toBeLessThan(0.5);
    r.run(0.2);
    expect(count(r.fx, 'slam')).toBe(1);
    expect(r.k.limbDown(a, z)).toBe(1);
    expect(r.c.hp).toBe(MAX_HP - SLAM_DMG);
  });

  it('misses her if she has left the mark', () => {
    const r = rig();
    r.k.begin(1);
    const a = r.next();
    r.pad.set('left', true);
    r.run(a.tell + 0.2);
    expect(count(r.fx, 'slam')).toBe(1);
    expect(r.w.player.cx).toBeLessThan(a.zones[0]!.x0);
    expect(r.c.hp).toBe(MAX_HP);
  });

  it('cannot reach her under the deck grating', () => {
    const r = rig();
    r.w.player.place(360, G + 32);
    r.run(0.1);
    r.k.begin(1);
    const a = r.next();
    expect(a.zones[0]!.x0).toBeLessThan(360);
    r.run(a.tell + 0.2);
    expect(count(r.fx, 'slam')).toBe(1);
    expect(r.c.hp).toBe(MAX_HP);
  });

  it('keeps its limb planted, with a hook showing, and then lifts it', () => {
    const r = rig();
    r.c.harmless = true;
    r.k.begin(1);
    const a = r.next();
    const hook = r.k.barbs.find((b) => b.id === 'p1h1')!;
    expect(hook.open()).toBe(false);
    r.run(a.tell + 0.1);
    expect(a.stage).toBe('hold');
    expect(hook.open()).toBe(true);
    expect(hook.y).toBe(G - HOOK_Y);
    expect(Math.abs(hook.x - (a.zones[0]!.x0 + a.zones[0]!.x1) / 2)).toBeLessThan(20);
    r.run(PHASES[0]!.hold);
    expect(a.stage).toBe('lift');
    expect(hook.open()).toBe(false);
    r.run(LIFT + 0.1);
    expect(r.k.attack).toBeNull();
    // Then the next one comes.
    expect(r.next()).not.toBe(a);
  });

  it('brings a second claw down where she would run to', () => {
    const r = rig();
    r.c.harmless = true;
    const a = only(1, ['slam2'], () => {
      r.k.begin(1);
      return r.next();
    });
    expect(a.zones.length).toBe(2);
    const [z1, z2] = a.zones as [(typeof a.zones)[0], (typeof a.zones)[0]];
    expect(z2.at).toBeGreaterThan(z1.at);
    expect(z2.x0 >= z1.x1 || z2.x1 <= z1.x0).toBe(true);
    expect(z2.limb).not.toBe(z1.limb);
    r.run(z2.at + 0.1);
    expect(count(r.fx, 'slam')).toBe(2);
  });

  it('sweeps the deck: standing is hit, jumping is not, nor is the trench', () => {
    const sweep = (act: (r: Rig, a: Attack) => void): Rig => {
      const r = rig();
      only(1, ['sweep'], () => {
        r.k.begin(1);
        const a = r.next();
        expect(a.kind).toBe('sweep');
        expect(a.tell).toBe(SWEEP_TELL);
        r.run(a.tell - 0.1);
        expect(r.c.hp).toBe(MAX_HP);
        act(r, a);
        r.finish();
      });
      return r;
    };
    const stood = sweep(() => undefined);
    expect(stood.c.hp).toBe(MAX_HP - 1);

    const jumped = sweep((r, a) => {
      // Jump as the claw arrives.
      for (let i = 0; i < 600 && Math.abs(a.pos - r.w.player.cx) > 56; i++) r.step();
      r.pad.set('jump', true);
      r.run(0.5);
      r.pad.set('jump', false);
    });
    expect(jumped.c.hp).toBe(MAX_HP);

    const hid = sweep((r) => r.w.player.place(360, G + 32));
    expect(hid.c.hp).toBe(MAX_HP);
  });

  it('sends a wave across the deck: only height is safe', () => {
    const wave = (act: (r: Rig) => void): Rig => {
      const r = rig();
      only(1, ['wave'], () => {
        r.k.begin(1);
        const a = r.next();
        expect(a.kind).toBe('wave');
        r.run(WAVE_TELL - 0.1);
        expect(a.stage).toBe('tell');
        expect(r.c.hp).toBe(MAX_HP);
        act(r);
        r.finish();
      });
      return r;
    };
    const stood = wave(() => undefined);
    expect(stood.c.hp).toBe(MAX_HP - 1);
    // It carried her along with it.
    expect(stood.w.player.cx).toBeLessThan(560);

    const below = wave((r) => r.w.player.place(360, G + 32));
    expect(below.c.hp).toBe(MAX_HP - 1);

    const onBox = wave((r) => r.w.player.place(236, G - 30));
    expect(onBox.c.hp).toBe(MAX_HP);
    expect(G - 30).toBeLessThanOrEqual(G - WAVE_H);

    const onLadder = wave((r) => {
      r.w.player.place(140, G);
      r.pad.set('up', true);
      r.run(1);
      r.pad.set('up', false);
      expect(r.w.player.state).toBe('ladder');
    });
    expect(onLadder.c.hp).toBe(MAX_HP);
    expect(onLadder.w.player.cx).toBe(140);
  });

  it('throws a container onto a marked spot, where it stays', () => {
    const r = rig();
    r.w.player.place(560, G);
    const a = only(1, ['throw'], () => {
      r.k.begin(1);
      return r.next();
    });
    expect(a.kind).toBe('throw');
    const z = a.zones[0]!;
    expect(ARENA.slots).toContain(z.x0);
    expect(z.x0).toBe(520);
    const box = r.w.mover('hurl1');
    r.run(a.tell - THROW_FLIGHT - 0.1);
    expect(box.y).toBe(-400);
    r.run(0.3);
    expect(box.y).toBeGreaterThan(-400);
    expect(box.y).toBeLessThan(G - 60);
    expect(r.c.hp).toBe(MAX_HP);
    r.run(THROW_FLIGHT);
    expect(count(r.fx, 'crash')).toBe(1);
    expect(box.x).toBe(520);
    expect(box.y).toBe(G - 30);
    expect(r.c.hp).toBe(MAX_HP - 2);
    // She was put clear of it, and it is solid now.
    expect(r.w.rectBlocked(r.w.player.x, r.w.player.y, r.w.player.w, r.w.player.h)).toBe(false);
    expect(r.w.solidAt(556, G - 10)).toBe(true);
  });

  it('does not throw at a spot that is taken, or more boxes than it has', () => {
    const r = rig();
    r.c.harmless = true;
    only(1, ['throw'], () => {
      r.k.begin(1);
      const spots: number[] = [];
      for (let n = 0; n < 2; n++) {
        const a = r.next();
        expect(a.kind).toBe('throw');
        spots.push(a.zones[0]!.x0);
        r.finish();
      }
      expect(spots.sort()).toEqual([520, 640]);
      expect(r.next().kind).toBe('slam');
    });
  });

  it('starts nothing while a scene is playing', () => {
    const r = rig();
    r.k.begin(1);
    r.w.locked = 1;
    r.run(8);
    expect(r.k.attack).toBeNull();
    r.w.locked = 0;
    expect(r.next().kind).toBe('slam');
  });
});

describe('the Undertow: phases', () => {
  /** Pull every hook of the current phase, one planted limb at a time. */
  const pullHooks = (r: Rig): void => {
    for (let guard = 0; guard < 4000 && r.k.hooksLeft() > 0; guard++) {
      const hook = r.k.barbs.find((b) => b.open());
      if (hook) while (!hook.gone) hook.struck(r.w);
      r.step();
    }
    expect(r.k.hooksLeft()).toBe(0);
  };

  it('has two hooks and a root barb to lose in each phase', () => {
    const k = new Kaiju(ARENA);
    expect(k.barbs.length).toBe(9);
    for (const ph of [1, 2, 3]) {
      expect(k.hooksLeft(ph)).toBe(2);
      expect(k.root(ph)?.gone).toBe(false);
    }
  });

  it('phase one: hooks out, it rears; pulsed, it drops; root out, the phase is cleared', () => {
    const r = rig();
    r.c.harmless = true;
    r.k.begin(1);
    expect(r.k.mode).toBe('assault');
    pullHooks(r);
    expect(count(r.fx, 'barb')).toBe(2);
    expect(r.k.mode).toBe('reared');
    expect(r.k.root()!.open()).toBe(false);
    r.run(2);
    expect(r.k.rear).toBe(1);
    expect(r.k.attack).toBeNull();

    r.k.stunNow(r.w);
    expect(r.k.mode).toBe('stunned');
    const root = r.k.root()!;
    expect(root.open()).toBe(true);
    expect(root.y).toBeGreaterThan(G - 40);
    expect(Math.abs(root.x - r.w.player.cx)).toBeLessThan(120);
    expect(r.k.cleared).toBe(0);
    // It stays down for as long as the barb is in.
    r.run(20);
    expect(r.k.mode).toBe('stunned');
    expect(r.k.attack).toBeNull();

    while (!root.gone) root.struck(r.w);
    r.step();
    expect(r.k.cleared).toBe(1);
    expect(r.k.mode).toBe('reeling');
    r.run(2.5);
    expect(r.k.mode).toBe('looming');
  });

  it('never lays its wrist where a container would hide the root barb', () => {
    const r = rig();
    r.c.harmless = true;
    // Standing just short of the box at 200..272: the plain choice of spot would be inside it.
    r.w.player.place(110, G);
    r.run(0.1);
    r.k.begin(1);
    r.k.rearUp(r.w);
    r.k.stunNow(r.w);
    const root = r.k.root()!;
    expect(r.w.rectBlocked(root.x - root.r, root.y - root.r, root.r * 2, root.r * 2)).toBe(false);
    expect(root.x).toBeGreaterThan(272);
    // From beside it, on the deck, the gun finds it.
    r.w.player.place(root.x + 60, G);
    r.w.player.facing = -1;
    expect(r.c.aimTarget(r.w)?.on).toBe(root);
  });

  it('phases two and three: with the hooks out it keeps its head down until made to lift it', () => {
    for (const ph of [2, 3]) {
      const r = rig();
      r.c.harmless = true;
      r.k.begin(ph);
      expect(r.k.cleared).toBe(ph - 1);
      // Everything from earlier phases is already out.
      expect(r.k.hooksLeft(ph - 1)).toBe(0);
      expect(r.k.root(ph - 1)!.gone).toBe(true);
      pullHooks(r);
      expect(r.k.mode).toBe('pressed');
      // It goes on attacking, with nothing left to shoot at.
      r.finish();
      const a = r.next();
      expect(PHASES[ph - 1]!.pressed).toContain(a.zones.length === 2 ? 'slam2' : a.kind);
      r.run(12);
      expect(r.k.mode).toBe('pressed');
      expect(r.k.barbs.some((b) => b.open())).toBe(false);
      r.k.rearUp(r.w);
      expect(r.k.mode).toBe('reared');
      r.k.stunNow(r.w);
      const root = r.k.root()!;
      while (!root.gone) root.struck(r.w);
      r.step();
      expect(r.k.cleared).toBe(ph);
    }
  });

  it('a rivet gets a hook out only while the limb is down', () => {
    const r = rig();
    r.c.harmless = true;
    r.k.begin(1);
    const a = r.next();
    const hook = r.k.barbs.find((b) => b.id === 'p1h1')!;
    // Stand to one side of the mark, facing it.
    const z = a.zones[0]!;
    r.w.player.place(z.x0 - 50, G);
    r.w.player.facing = 1;
    r.pad.set('fire', true);
    r.run(a.tell - 0.2);
    expect(hook.hp).toBe(hook.max);
    r.run(2.5);
    expect(hook.gone).toBe(true);
    expect(a.stage).toBe('lift');
    expect(r.k.pain).toBeGreaterThan(0);
    expect(count(r.fx, 'roar')).toBe(1);
  });

  it('gets harder: shorter warnings and holds, more kinds of attack', () => {
    for (let i = 1; i < PHASES.length; i++) {
      expect(PHASES[i]!.tell).toBeLessThan(PHASES[i - 1]!.tell);
      expect(PHASES[i]!.hold).toBeLessThan(PHASES[i - 1]!.hold);
      expect(new Set(PHASES[i]!.pattern).size).toBeGreaterThan(new Set(PHASES[i - 1]!.pattern).size);
    }
    // No warning is ever shorter than a second.
    for (const ph of PHASES) expect(ph.tell).toBeGreaterThanOrEqual(1);
  });
});
