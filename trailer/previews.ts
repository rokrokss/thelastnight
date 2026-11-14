import { ARENA, G, HANG, HOLD_X, LATCH, LAUNCH_X, PEDESTAL_X, POST, VISTA } from '../src/content/ch3b.level';
import { Combat, type Enforcer, type EnforcerDef } from '../src/game/combat';
import { Kaiju } from '../src/game/kaiju';
import type { Mood } from '../src/game/view';
import type { Take } from './film';
import type { Scene } from './scene';

/**
 * Takes that show the two action sequences (the gunfight on the quay and the
 * Undertow), for looking at and for cutting into the trailer. They are not
 * part of the film: `node tools/trailer.mjs --sheet --only=<names>` renders
 * a few frames of each.
 */

const COLD: Partial<Mood> = { vignette: 0.16, saturation: -0.12, aberration: 0.006 };
const STORM: Partial<Mood> = { vignette: 0.12, saturation: -0.08, exposure: 0.06 };

/** A fight on a film set: armed, and nothing can hurt her. */
export function armed(s: Scene): Combat {
  const c = new Combat();
  c.armed = true;
  c.harmless = true;
  s.w.combat = c;
  return c;
}

/** Enforcers already at their posts. */
export function posted(c: Combat, defs: (Omit<EnforcerDef, 'x' | 'y' | 'posts'> & { at: number })[]): Enforcer[] {
  return c.spawn(defs.map((d) => ({ ...d, x: d.at, y: G, posts: [d.at] })));
}

/** The Undertow, up and waiting, with the box from the gunfight on the deck. */
export function risen(s: Scene, phase = 0): Kaiju {
  const c = armed(s);
  const k = new Kaiju(ARENA);
  c.kaiju = k;
  k.stand();
  const box = s.w.mover(HANG.id);
  box.y = G - HANG.h;
  box.arrived = true;
  if (phase > 0) k.begin(phase);
  s.d.mood(STORM, 0);
  return k;
}

export const fire = (s: Scene, from: number, to: number): boolean => s.t >= from && s.t < to;

/**
 * Where the game's own camera sits while she fights (see Camera.gameplay and
 * the two camera zones in ch3b.level.ts): her feet 47 px below centre, moved
 * by the zone's offset, at the zone's zoom plus a little for the heat.
 */
const QUAY_PLAY = { dx: 96 + 16, y: G - 47 - 14, zoom: 1.03 };
const TIDE_PLAY = { y: G - 47 - 18, zoom: 1.02 };

export const PREVIEWS: Take[] = [
  {
    // What Meridian sends: off the launch and along the quay.
    name: 'quay-ashore',
    at: 990,
    dur: 5,
    chapter: 'quay',
    pre: 1.2,
    setup(s) {
      const c = armed(s);
      c.spawn([
        { id: 'a', x: LAUNCH_X - 10, y: G, posts: [POST.c] },
        { id: 'b', x: LAUNCH_X + 34, y: G, posts: [POST.d] },
        { id: 's', kind: 'shield', x: LAUNCH_X - 60, y: G, posts: [POST.a] },
      ]);
      s.sol(PEDESTAL_X + 28, G, 1);
      s.w.locked = 1;
      s.d.mood(COLD, 0);
      s.d.cut({ x: LAUNCH_X - 60, y: G - 64, zoom: 1.3, roll: -0.03, rack: 0 });
    },
    play(s) {
      s.d.drift({ x: LAUNCH_X - 190, y: G - 60, zoom: 1.42, roll: -0.01 }, 5, 'linear');
    },
  },
  {
    // Thirty years of rivets.
    name: 'quay-gun',
    at: 996,
    dur: 2.5,
    chapter: 'quay',
    setup(s) {
      const c = armed(s);
      c.armed = false;
      s.sol(PEDESTAL_X + 28, G, -1);
      s.w.locked = 1;
      s.w.actor('gil').talking = 1.2;
      s.d.cut({ on: ['sol', 'gil'], zoom: 1.9, dx: 0, dy: -8, roll: 0, rack: 0 });
    },
    async play(s) {
      const d = s.d;
      d.drift({ on: ['sol', 'gil'], zoom: 2.1, dy: -8 }, 2.5, 'linear');
      await d.wait(1.1);
      s.w.combat!.armed = true;
      d.sfx('recharge');
    },
  },
  {
    // Enforcers working from cover; Sol under their fire, then up over the barrier to answer it.
    name: 'quay-cover',
    at: 1000,
    dur: 5,
    chapter: 'quay',
    pre: 4.2,
    setup(s) {
      const c = armed(s);
      posted(c, [{ id: 'a', at: POST.a }, { id: 'c', at: POST.c }, { id: 'd', at: POST.d }, { id: 'b', at: POST.b2 }]);
      s.sol(HOLD_X, G, 1);
      s.pad.set('down', true);
      s.w.heat = 0.4;
      s.d.mood(COLD, 0);
      s.d.cut({ x: 572, y: G - 62, zoom: 1.28, roll: 0.012, rack: 0 });
    },
    play(s) {
      s.d.drift({ x: 580, y: G - 60, zoom: 1.36, roll: -0.006 }, 5, 'linear');
    },
    each(s) {
      // Down while they shoot; up for two rivets; down again.
      const up = fire(s, 1.5, 2.3) || fire(s, 3.6, 4.6);
      s.pad.set('down', !up);
      s.pad.set('fire', up);
    },
  },
  {
    // The same fight as the player sees it: the game's own framing, no bars.
    name: 'quay-play',
    at: 1006,
    dur: 4,
    chapter: 'quay',
    pre: 4.2,
    setup(s) {
      const c = armed(s);
      posted(c, [{ id: 'a', at: POST.a }, { id: 'c', at: POST.c }, { id: 'd', at: POST.d }]);
      s.sol(HOLD_X, G, 1);
      s.pad.set('down', true);
      s.w.heat = 0.4;
      s.d.cine.letterbox = 0;
      s.d.cut({ x: HOLD_X + QUAY_PLAY.dx, y: QUAY_PLAY.y, zoom: QUAY_PLAY.zoom, roll: 0, rack: 0 });
    },
    each(s) {
      const up = fire(s, 1.2, 2) || fire(s, 3, 3.8);
      s.pad.set('down', !up);
      s.pad.set('fire', up);
    },
  },
  {
    // Close on one of them: up over its cover, the line, the burst.
    name: 'quay-enforcer',
    at: 1010,
    dur: 2.5,
    chapter: 'quay',
    pre: 0.75,
    setup(s) {
      const c = armed(s);
      posted(c, [{ id: 'c', at: POST.c }]);
      s.sol(HOLD_X, G, 1);
      s.pad.set('down', true);
      s.d.mood(COLD, 0);
      s.d.cut({ x: POST.c - 30, y: G - 26, zoom: 2.5, roll: -0.02, rack: 0 });
    },
    play(s) {
      s.d.drift({ x: POST.c - 44, y: G - 26, zoom: 2.2, roll: 0 }, 2.5, 'out');
    },
  },
  {
    // A shield unit walking in behind its own wall; rivets go off it until it drops the wall to shoot.
    name: 'quay-shield',
    at: 1020,
    dur: 5,
    chapter: 'quay',
    pre: 1.5,
    setup(s) {
      const c = armed(s);
      c.spawn([{ id: 's', kind: 'shield', x: 700, y: G, posts: [610, 560] }]);
      posted(c, [{ id: 'd', at: POST.d }]);
      s.sol(HOLD_X + 40, G, 1);
      s.w.heat = 0.4;
      s.d.mood(COLD, 0);
      s.d.cut({ x: 548, y: G - 56, zoom: 1.5, roll: -0.01, rack: 0 });
    },
    each(s) {
      s.pad.set('fire', fire(s, 0.2, 1.4) || fire(s, 3.0, 5));
    },
  },
  {
    // Three of them dug in under Gil's box. The latch goes; so does the box.
    name: 'quay-drop',
    at: 1040,
    dur: 5,
    chapter: 'quay',
    pre: 2.5,
    setup(s) {
      const c = armed(s);
      posted(c, [
        { id: 's1', kind: 'shield', at: POST.b1, dug: true },
        { id: 's2', kind: 'shield', at: POST.b2, dug: true },
        { id: 't', at: POST.b3 },
      ]);
      c.mark('latch', LATCH.x, LATCH.y, 1, 8).armed = true;
      s.sol(HOLD_X + 46, G, 1);
      s.w.heat = 0.4;
      s.d.mood(COLD, 0);
      s.d.cut({ x: 548, y: G - 74, zoom: 1.3, roll: 0.01, rack: 0 });
    },
    async play(s) {
      const d = s.d;
      const c = s.w.combat!;
      const latch = c.marks[0]!;
      d.drift({ x: 566, y: G - 66, zoom: 1.5 }, 5, 'out');
      await d.wait(1.1);
      s.pad.tap('fire');
      while (!latch.gone) await d.wait(0.02);
      c.drop(s.w, HANG.id);
      // The fall, stretched.
      await d.slowmo(0.35, 0.45);
    },
  },
  {
    // The last Enforcer is down. Out in the channel, something breaks the water.
    name: 'quay-wake',
    at: 1050,
    dur: 5,
    chapter: 'quay',
    pre: 1,
    setup(s) {
      const c = armed(s);
      c.kaiju = new Kaiju(ARENA);
      s.sol(HOLD_X, G, 1);
      s.w.locked = 1;
      s.d.mood({ saturation: -0.14, vignette: 0.14 }, 0);
      s.d.cut({ x: VISTA.x - 40, y: VISTA.y + 70, zoom: 1, rack: -0.9, roll: 0.02 });
    },
    play(s) {
      s.w.combat!.kaiju!.surface();
      s.d.sfx('call', 0.7);
      s.d.shake(0.5);
      s.d.drift({ x: VISTA.x, y: VISTA.y + 50, zoom: 1, roll: 0.045 }, 5, 'in');
    },
    each(s) {
      const k = s.w.combat!.kaiju!;
      if (k.rise >= 0.44) k.mode = 'looming';
    },
  },
  {
    // It comes up out of the channel behind the pier's cranes.
    name: 'tide-rise',
    at: 1060,
    dur: 7.5,
    chapter: 'tide',
    pre: 1.5,
    setup(s) {
      const c = armed(s);
      c.kaiju = new Kaiju(ARENA);
      s.sol(640, G, 1);
      s.w.locked = 1;
      s.d.mood(STORM, 0);
      s.d.cut({ x: VISTA.x, y: VISTA.y + 46, zoom: 1, rack: -0.9, roll: 0 });
    },
    play(s) {
      s.w.combat!.kaiju!.surface();
      s.d.sfx('call');
      s.d.drift({ x: VISTA.x, y: VISTA.y, zoom: 1, rack: -0.9, roll: 0.014 }, 7.5, 'inOut');
    },
    each(s, t) {
      if (t > 5.2 && t < 5.25) s.strike();
    },
  },
  {
    // The same, from where she stands: the quay small under it.
    name: 'tide-loom',
    at: 1080,
    dur: 5,
    chapter: 'tide',
    setup(s) {
      risen(s);
      s.sol(1020, G, 1);
      s.w.locked = 1;
      s.d.cine.letterbox = 0;
      s.d.cut({ x: 1010, y: TIDE_PLAY.y, zoom: TIDE_PLAY.zoom, rack: -0.5, roll: 0.01 });
    },
    play(s) {
      s.d.drift({ x: 1050, y: TIDE_PLAY.y, zoom: TIDE_PLAY.zoom, rack: -0.5, roll: -0.01 }, 5, 'linear');
    },
    each(s, t) {
      if (t > 2.4 && t < 2.45) s.strike();
    },
  },
  {
    // A shadow on the deck, and then the arm.
    name: 'tide-slam',
    at: 1100,
    dur: 5,
    chapter: 'tide',
    pre: 0.3,
    setup(s) {
      risen(s, 1);
      s.sol(760, G, 1);
      s.d.cine.letterbox = 0;
      s.d.cut({ x: 800, y: TIDE_PLAY.y, zoom: TIDE_PLAY.zoom, rack: 0, roll: 0.012 });
    },
    play(s) {
      s.d.drift({ x: 830, y: TIDE_PLAY.y, zoom: TIDE_PLAY.zoom, roll: -0.01 }, 5, 'linear');
    },
    each(s, t) {
      // She stands her ground a moment too long, then runs out from under it.
      if (t > 2.05 && t < 2.1) s.run([850, G]);
      if (t > 3.3 && t < 3.35) s.w.player.facing = -1;
    },
  },
  {
    // The arm is down: the barb in its wrist, and a rivet gun.
    name: 'tide-barb',
    at: 1120,
    dur: 5,
    chapter: 'tide',
    pre: 3.5,
    setup(s) {
      risen(s, 1);
      s.sol(800, G, 1);
      s.d.cut({ x: 780, y: G - 60, zoom: 1.3, rack: 0, roll: -0.012 });
    },
    play(s) {
      // The limb has landed where she was standing; she is beside it now, looking up at its wrist.
      s.sol(728, G, 1);
      s.d.cut({ x: 770, y: G - 62, zoom: 1.3, rack: 0, roll: -0.012 });
      s.d.drift({ x: 778, y: G - 66, zoom: 1.45 }, 5, 'out');
    },
    each(s) {
      // Three rivets, with room to see each one land.
      s.pad.set('fire', fire(s, 0.7, 0.8) || fire(s, 1.6, 1.7) || fire(s, 2.5, 2.6));
    },
  },
  {
    // A limb dragged the length of the deck. She goes over it.
    name: 'tide-sweep',
    at: 1130,
    dur: 5,
    chapter: 'tide',
    pre: 2,
    setup(s) {
      // Straight to the sweep: the second move of its second phase.
      risen(s).begin(2, 1);
      s.sol(720, G, 1);
      s.d.cine.letterbox = 0;
      s.d.cut({ x: 790, y: TIDE_PLAY.y, zoom: TIDE_PLAY.zoom, rack: 0, roll: -0.01 });
    },
    play(s) {
      s.d.drift({ x: 740, y: TIDE_PLAY.y, zoom: TIDE_PLAY.zoom, roll: 0.01 }, 5, 'linear');
    },
    each(s) {
      const a = s.w.combat!.kaiju!.attack;
      const near = !!a && a.kind === 'sweep' && a.stage === 'strike' && Math.abs(a.pos - s.w.player.cx) < 62;
      s.pad.set('jump', near);
    },
  },
  {
    // One of Gil's boxes, thrown.
    name: 'tide-throw',
    at: 1135,
    dur: 5,
    chapter: 'tide',
    pre: 0.4,
    setup(s) {
      risen(s).begin(3, 1);
      s.sol(806, G, 1);
      s.d.cine.letterbox = 0;
      s.d.cut({ x: 800, y: TIDE_PLAY.y, zoom: TIDE_PLAY.zoom, rack: 0, roll: 0.01 });
    },
    play(s) {
      s.d.drift({ x: 770, y: TIDE_PLAY.y, zoom: TIDE_PLAY.zoom, roll: -0.01 }, 5, 'linear');
    },
    each(s, t) {
      if (t > 1.9 && t < 1.95) s.run([720, G]);
    },
  },
  {
    // Gil lets the crane go at it.
    name: 'tide-crane',
    at: 1145,
    dur: 5,
    chapter: 'tide',
    setup(s) {
      const k = risen(s);
      k.floods = true;
      k.lit = 1;
      s.w.signals.floods = 1;
      s.sol(460, G, -1);
      s.w.locked = 1;
      s.d.cut({ x: VISTA.x - 60, y: VISTA.y + 20, zoom: 1, rack: -1, roll: 0.01 });
    },
    async play(s) {
      const d = s.d;
      const k = s.w.combat!.kaiju!;
      d.drift({ x: VISTA.x, y: VISTA.y + 10, zoom: 1, roll: -0.01 }, 5, 'out');
      await d.wait(0.6);
      d.sfx('unlatch');
      for (let i = 1; i <= 40; i++) {
        k.swing = (i / 40) * (i / 40);
        await d.wait(1.3 / 40);
      }
      d.sfx('crash');
      d.flash(0.3, 0.5);
      d.shake(1);
      k.rearUp(s.w);
      for (let i = 1; i <= 60; i++) {
        k.swing = 1 - i / 60;
        await d.wait(0.05);
      }
    },
  },
  {
    // Water over the deck, and the one place to be.
    name: 'tide-wave',
    at: 1140,
    dur: 5,
    chapter: 'tide',
    pre: 2.6,
    setup(s) {
      // Straight to the wave: the fourth move of its second phase.
      risen(s).begin(2, 3);
      s.sol(944, G, -1);
      s.run([866, G], [866, G - 44]);
      s.d.cine.letterbox = 0;
      s.d.cut({ x: 960, y: TIDE_PLAY.y, zoom: TIDE_PLAY.zoom, rack: 0, roll: 0.01 });
    },
    play(s) {
      s.d.drift({ x: 930, y: TIDE_PLAY.y, zoom: TIDE_PLAY.zoom, roll: -0.01 }, 5, 'linear');
    },
  },
  {
    // Every lamp on the quay, turned on it.
    name: 'tide-floods',
    at: 1160,
    dur: 5,
    chapter: 'tide',
    setup(s) {
      risen(s);
      s.sol(880, G, 1);
      s.w.locked = 1;
      s.d.cut({ x: VISTA.x, y: VISTA.y + 30, zoom: 1, rack: -1, roll: -0.02 });
    },
    async play(s) {
      const d = s.d;
      const k = s.w.combat!.kaiju!;
      d.drift({ x: VISTA.x, y: VISTA.y, zoom: 1, roll: 0.01 }, 5, 'out');
      await d.wait(1.3);
      s.w.signals.floods = 1;
      k.floods = true;
      d.sfx('floods');
      d.flash(0.3, 0.5);
      await d.wait(0.6);
      k.rearUp(s.w);
      d.shake(0.6);
    },
  },
  {
    // The last barb goes. The cable falls away; it looks at the lights; it goes back down.
    name: 'tide-release',
    at: 1180,
    dur: 10,
    chapter: 'tide',
    pre: 2.2,
    setup(s) {
      const k = risen(s, 3);
      k.floods = true;
      k.lit = 1;
      s.w.signals.floods = 1;
      // Only the last root barb is left in it.
      for (const b of k.barbs) if (b.id !== 'p3r') b.hp = 0;
      k.rearUp(s.w);
      s.sol(700, G, 1);
      k.stunNow(s.w);
      k.root()!.hp = 1;
      s.d.cut({ x: 770, y: G - 56, zoom: 1.3, rack: 0, roll: 0.01 });
    },
    async play(s) {
      const d = s.d;
      const k = s.w.combat!.kaiju!;
      await d.wait(0.7);
      s.pad.tap('fire');
      while (k.cleared < 3) await d.wait(0.02);
      d.flash(0.25, 0.6);
      await d.wait(0.9);
      k.free(s.w);
      k.floods = false;
      d.cut({ x: VISTA.x, y: VISTA.y + 14, zoom: 1, rack: -1, roll: 0 });
      d.mood({ vignette: 0.1, exposure: 0.05, bloom: 0.18 }, 2);
      d.drift({ x: VISTA.x - 40, y: VISTA.y, zoom: 1.06 }, 8, 'out');
      await d.wait(4.2);
      d.sfx('call', 0.7);
      k.sink();
    },
  },
];
