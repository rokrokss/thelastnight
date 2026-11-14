import { paintQuay } from '../art/scenes/quay';
import type { Chapter } from '../game/chapter';
import { Combat, type EnforcerDef } from '../game/combat';
import type { Director } from '../game/director';
import { Kaiju } from '../game/kaiju';
import { ARENA, buildQuay, FLOOD_X, G, GATE_X, HANG, LATCH, LAUNCH_X, PEDESTAL_X, POST, TRENCH, VISTA } from './ch3b.level';
import { GUN_HELP, until } from './fight';
import { both, single, twoShot } from './shots';

/**
 * Three waves. Troopers work from cover and move up; shield units walk in
 * behind their own wall. The last wave digs in under the hung container.
 */
export const WAVES: EnforcerDef[][] = [
  [
    { id: 'w1a', x: GATE_X, y: G, posts: [POST.c] },
    { id: 'w1b', x: GATE_X + 40, y: G, posts: [POST.d, POST.b1], delay: 1.4 },
  ],
  [
    { id: 'w2a', x: GATE_X, y: G, posts: [POST.d, POST.c] },
    { id: 'w2b', x: GATE_X + 30, y: G, posts: [POST.c, POST.a], delay: 1.2 },
    { id: 'w2s', kind: 'shield', x: GATE_X + 10, y: G, posts: [770, 700, 630], delay: 3 },
  ],
  [
    { id: 'w3s1', kind: 'shield', x: GATE_X, y: G, posts: [POST.b1], dug: true },
    { id: 'w3s2', kind: 'shield', x: GATE_X + 26, y: G, posts: [POST.b2], dug: true },
    { id: 'w3t', x: GATE_X + 52, y: G, posts: [POST.b3], delay: 3.2 },
    { id: 'w3a', x: GATE_X + 20, y: G, posts: [POST.d], delay: 5 },
    { id: 'w3b', x: GATE_X + 20, y: G, posts: [POST.c], delay: 8 },
  ],
];

/** The three under the box. */
const DUG = ['w3s1', 'w3s2', 'w3t'];

const HOLD = 'Hold the quay until the crane is ready';

/** The latch: Gil calls it once they are all standing under his box. */
async function latchBeat(d: Director): Promise<void> {
  const w = d.world;
  const c = w.combat!;
  const latch = c.marks.find((m) => m.id === 'latch')!;
  const trio = c.enforcers.filter((e) => DUG.includes(e.id));
  await until(d, () => trio.every((e) => !e.alive || (e.state !== 'wait' && e.state !== 'walk')));
  if (trio.every((e) => !e.alive)) return;
  latch.armed = true;
  d.objective('Shoot the latch of the box over their heads');
  d.bark('gil_radio', 'They are digging in under my box. The latch, mast-girl. On the spreader. Shoot the latch!', 6);
  d.glance({ x: HANG.x + 36, y: HANG.y + 10, zoom: 1.12 }, 2.2, 0.55);
  await until(d, () => latch.gone || trio.every((e) => !e.alive));
  d.objective(HOLD);
  if (!latch.gone) {
    latch.armed = false;
    return;
  }
  c.drop(w, HANG.id);
  // The fall, stretched: long enough to see what is under it.
  await d.slowmo(0.35, 0.45);
  await d.wait(0.5);
  d.bark('gil_radio', 'I never liked that box. Get behind it. It will stop anything they have.', 6);
}

/** The fight itself. Runs from whichever wave the flags say is next, so it also restarts a checkpoint. */
async function battle(d: Director): Promise<void> {
  const w = d.world;
  const c = w.combat!;
  for (let n = d.flag('quay.wave'); n < WAVES.length; n++) {
    // The first wave may already be walking in (it comes ashore during the opening).
    if (c.standing === 0) {
      await d.wait(n === 0 ? 0.4 : 1.6);
      c.spawn(WAVES[n]!);
    }
    if (n === 0) {
      await until(d, () => c.enforcers.some((e) => e.aiming) || c.standing === 0);
      d.bark('unit', 'SG-07 IS MERIDIAN PROPERTY. STEP AWAY FROM THE CONTROLS.', 4.5);
      await d.wait(5);
      if (c.standing > 0) d.bark('mun', 'They show you where the shot is going. A red line. Get small before it goes.', 5.5);
    } else if (n === 1) {
      d.bark('mun', 'That big one carries its own wall. It has to drop the wall to shoot.', 5.5);
      d.glance({ x: GATE_X - 90, y: G - 40, zoom: 1 }, 1.6, 0.5);
    } else {
      d.bark('unit', 'CRANE CONTROL IS TO BE DISABLED. HOLD POSITION UNDER THE LOAD.', 5);
      void latchBeat(d).catch(() => undefined);
    }
    await until(d, () => c.standing === 0);
    d.set('quay.wave', n + 1);
    if (n === 0) {
      d.bark('gil_radio', 'Forty seconds. Keep them off the legs.', 4);
      d.mark('cp_w2');
    } else if (n === 1) {
      d.bark('gil_radio', 'Twenty. She is coming up to pressure.', 4);
      d.mark('cp_w3');
    }
  }
  await ending(d);
}

/** Quiet, for about a breath. Then the water. */
async function ending(d: Director): Promise<void> {
  const w = d.world;
  const c = w.combat!;
  await d.wait(1.2);
  d.lock();
  d.heat(0);
  d.music('yards');
  await d.bars(true);
  d.drift({ on: 'sol', zoom: 1.6, dx: 16, dy: -8, roll: 0, rack: 0 }, 1.8);
  await d.say('gil_radio', 'That was the last of them. Pressure is up. Walk to the hook, mast-girl.');
  await d.say('sol', 'You can have your gun back.');
  await d.say('gil_radio', 'Keep it. I have a feeling about tonight.');
  // The quay lurches. Whatever was still hanging lets go by itself.
  d.sfx('call', 0.7);
  d.shake(0.5);
  if (!w.mover(HANG.id).arrived) c.drop(w, HANG.id);
  // Out in the channel, behind the pier, a line of something breaks the water. No more of it than that, yet.
  const k = new Kaiju(ARENA);
  c.kaiju = k;
  k.surface();
  void until(d, () => k.rise >= 0.44)
    .then(() => {
      k.mode = 'looming';
    })
    .catch(() => undefined);
  d.cut({ x: VISTA.x - 40, y: VISTA.y + 70, zoom: 1, rack: -0.9, roll: 0.02 });
  d.mood({ saturation: -0.14, vignette: 0.14 }, 1.4);
  await d.wait(2);
  await d.say('mun', 'Sol. Every tide gauge in the harbour just went off the top of its paper.');
  d.drift({ x: VISTA.x, y: VISTA.y + 50, zoom: 1, roll: 0.045 }, 5, 'in');
  await d.say('mun', 'That is not the storm. Storms do not come up the channel against the wind.');
  d.sfx('call');
  d.shake(0.7);
  await d.fade(1, 1.8);
  d.leave('tide');
}

/**
 * Chapter Three, part two — The Quay.
 * Meridian sends its security machines to stop the crane. Gil has one tool to lend.
 */
export const quay: Chapter = {
  id: 'quay',
  kicker: 'CHAPTER THREE · II',
  title: 'THE QUAY',
  subtitle: 'Meridian does not send people. People ask questions.',
  music: 'yards',
  amb: { city: 0.7, crowd: 0 },
  // A walk over everything the quay is built from: cover, the mast, the trench, the far box.
  route: [
    [318, G],
    [456, G],
    [690, G],
    [FLOOD_X, G],
    [FLOOD_X, G - 64],
    [FLOOD_X, G],
    [TRENCH.x + 12, G],
    [TRENCH.x + 12, G + TRENCH.h],
    [1010, G + TRENCH.h],
    [TRENCH.x + TRENCH.w - 12, G + TRENCH.h],
    [TRENCH.x + TRENCH.w - 12, G],
    [1220, G],
    [1286, G - 30],
    [1380, G],
  ],
  build: () => buildQuay('quay'),
  paint: paintQuay,

  setup(d) {
    const w = d.world;
    const c = new Combat();
    w.combat = c;
    c.armed = d.flag('quay.armed') > 0;
    const wave = d.flag('quay.wave');
    const latch = c.mark('latch', LATCH.x, LATCH.y, 1, 8);
    if (wave >= WAVES.length) {
      // Fought out: the box is down, one way or the other.
      const box = w.mover(HANG.id);
      box.y = G - HANG.h;
      box.arrived = true;
      latch.hp = 0;
    }
    w.actor('gil').visible = !c.armed;
    w.signals.cab = c.armed ? 1 : 0;
    d.objective(c.armed ? HOLD : null);
    if (c.armed) {
      d.heat(0.4);
      d.music('spire');
      d.run(battle, false);
    }
  },

  async intro(d) {
    const w = d.world;
    const c = w.combat!;
    const gil = w.actor('gil');
    d.lock();
    await d.bars(true, 0);
    // Open down the quay on the launch coming alongside, then pull back the length of the apron to the crane.
    d.cut({ x: LAUNCH_X + 70, y: 480, zoom: 1.2, rack: 0, roll: -0.012 });
    await d.wait(0.5);
    void d.fade(0, 2.2);
    d.drift({ x: 600, y: 430, zoom: 1, rack: -0.25, roll: 0 }, 6.5);
    await d.card('CHAPTER THREE · II', 'THE QUAY', 'Meridian does not send people. People ask questions.');
    twoShot(d, 'gil', 2);
    await d.walk('sol', PEDESTAL_X + 28, 36);
    d.faceEachOther('gil');
    await d.say('gil', 'Override wants a minute to build pressure. Old hydraulics. Old driver.');
    await d.say('mun', 'You do not have a minute. A Meridian launch just tied up at the east steps.');
    // What is coming off it.
    c.spawn(WAVES[0]!.map((e) => ({ ...e, x: LAUNCH_X - 40 + (e.delay ?? 0) * 26 })));
    d.sfx('spot', 0.6);
    d.cut({ x: LAUNCH_X - 110, y: G - 70, zoom: 1.3, roll: -0.03, rack: 0 });
    d.mood({ vignette: 0.14, saturation: -0.1 }, 0.4);
    d.drift({ x: LAUNCH_X - 220, y: G - 66, zoom: 1.4 }, 6, 'linear');
    await d.say('sol', 'Those are not Listeners.');
    await d.say('gil', 'Enforcers. Dock security. Meridian does not send people down here. People ask questions.');
    // He takes the rivet gun down off the pedestal.
    both(d, 'gil');
    d.calm(1.5);
    d.sfx('grab');
    await d.wait(0.5);
    await d.say('gil', 'Thirty years of rivets. Tonight it is a gun.');
    c.armed = true;
    d.sfx('recharge');
    single(d, 'sol', 1.9);
    await d.say('sol', 'I climb things, Gil. I do not shoot things.');
    single(d, 'gil');
    await d.say('gil', 'Things is all they are. Keep some steel between you and them. When you see a red line, get small.');
    // He goes for the cab; stay with her.
    d.drift({ on: 'sol', zoom: 1.3, dx: 60, dy: -10, rack: 0, roll: 0 }, 2.2);
    await d.walk('gil', PEDESTAL_X - 62, 46);
    gil.visible = false;
    w.signals.cab = 1;
    d.release(1.4);
    await d.bars(false);
    d.unlock();
    d.toast(GUN_HELP);
    d.objective(HOLD);
    d.heat(0.4);
    d.music('spire');
    d.set('quay.armed', 1);
    d.mark('cp_w1');
    d.run(battle, false);
  },

  triggers: {},
  interacts: {},
};
