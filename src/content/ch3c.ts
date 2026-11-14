import { paintQuay } from '../art/scenes/quay';
import type { Chapter } from '../game/chapter';
import { Combat } from '../game/combat';
import type { Director } from '../game/director';
import { Kaiju, type AttackKind } from '../game/kaiju';
import { ARENA, BRAKE, buildQuay, CRANE_X, FLOOD_X, G, HANG, TRENCH, VISTA } from './ch3b.level';
import { until } from './fight';

/** Said once each, the first time it tries something. */
const COACH: Record<AttackKind, { who: string; line: string; tip: string }> = {
  slam: { who: 'gil_radio', line: 'Shadow on the deck! Move!', tip: 'A shadow on the deck means its arm is coming down there.  Get out from under it.' },
  sweep: { who: 'gil_radio', line: 'Low, along the deck! Jump it!', tip: 'SWEEP  —  jump over it, or get under the deck grating' },
  wave: { who: 'gil_radio', line: 'Water coming over! Get up on something!', tip: 'WAVE  —  climb a ladder or stand on something tall' },
  throw: { who: 'gil_radio', line: 'It has one of my boxes! Watch where the shadow falls!', tip: 'A square shadow: a container is coming down there.' },
};

/** Barks that explain each attack the first time it is seen, and the first barb. */
async function coach(d: Director, ph: number): Promise<void> {
  const k = d.world.combat!.kaiju!;
  while (k.phase === ph && (k.mode === 'assault' || k.mode === 'pressed')) {
    const a = k.attack;
    if (a && a.stage === 'tell' && !d.flag(`tide.saw.${a.kind}`)) {
      d.flags[`tide.saw.${a.kind}`] = 1;
      const c = COACH[a.kind];
      d.bark(c.who, c.line, 3.5);
      d.toast(c.tip);
    }
    if (a?.hook && !d.flag('tide.saw.hook')) {
      d.flags['tide.saw.hook'] = 1;
      d.bark('mun', 'There, on its wrist: a barb. Hit it while the arm is down!', 5);
    }
    await d.wait(0.1);
  }
}

const PULSE_LINE = [
  'It has its head back. Relay three is right over it, and I can ring that relay like a bell. Hold the dial for me.',
  'It cannot bear to look. Again, Sol. Hold the dial.',
  'One more. The last of the carrier is in that knot. Ring it out.',
];

/** Mun rings relay 3 through Sol's set: the tuning scope, then the Undertow drops. */
async function pulse(d: Director, ph: number): Promise<void> {
  const w = d.world;
  const k = w.combat!.kaiju!;
  d.lock();
  await d.bars(true, 0.5);
  d.pose('sol', 'kneel');
  d.drift({ on: 'sol', zoom: 1.5, dx: 0, dy: -12, rack: 0, roll: 0 }, 1.2);
  await d.say('mun', PULSE_LINE[ph - 1]!);
  await d.tune({
    id: `pulse${ph}`,
    freq: [0.34, 0.66, 0.46][ph - 1]!,
    gain: ph === 3 ? 0.62 : undefined,
    drift: 0.04 + ph * 0.02,
    hold: 1.1,
    label: 'RELAY 3 · PULSE',
  });
  d.pose('sol', null);
  // The relay rings: one hard note across the whole harbour.
  d.sfx('pulse');
  d.flash(0.45, 0.9);
  d.shake(0.7);
  k.stunNow(w);
  d.cut({ x: k.restX, y: G - 120, zoom: 1, rack: -0.5, roll: 0.02 });
  await d.wait(1.7);
  d.release(1.2);
  await d.bars(false, 0.5);
  d.unlock();
}

/** Ease a 0..1 value over some seconds of game time. */
async function ease(d: Director, set: (v: number) => void, from: number, to: number, seconds: number): Promise<void> {
  const n = Math.max(1, Math.round(seconds * 30));
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    set(from + (to - from) * u * u);
    await d.wait(seconds / n);
  }
}

/** The three phases. Runs from whichever the flags say is next, so it also restarts a checkpoint. */
async function fight(d: Director): Promise<void> {
  const w = d.world;
  const c = w.combat!;
  const k = c.kaiju!;
  for (let ph = Math.max(1, d.flag('tide.phase')); ph <= 3; ph++) {
    await until(d, () => k.mode === 'looming');
    await d.wait(ph === 1 ? 0.4 : 1.2);
    k.begin(ph);
    d.heat(0.3);
    d.objective('Shoot the barbs out of its arm while it is down');
    void coach(d, ph).catch(() => undefined);
    await until(d, () => k.mode !== 'assault');

    if (k.mode === 'pressed' && ph === 2) {
      // It will not lift its head. The floodlights make it.
      d.bark('gil_radio', 'It has its head down. The bell will not reach it there.', 4.5);
      await d.wait(4.6);
      d.bark('mun', 'It flinches from the floodlights. I have watched it do it.', 4.5);
      await d.wait(4.6);
      d.bark('gil_radio', 'Then give it all of them. Switch is at the foot of the mast.', 5);
      w.thing('floods').enabled = true;
      d.objective('Turn the floodlights on it');
      d.glance({ x: FLOOD_X, y: G - 70, zoom: 1.05 }, 2, 0.6);
      // (The switch has its own scene; carry on once that has played out.)
      await until(d, () => d.flag('tide.floods') > 0);
    } else if (k.mode === 'pressed' && ph === 3) {
      // Nor for the lights, now. Gil has a crane.
      const brake = c.marks.find((m) => m.id === 'brake')!;
      d.bark('gil_radio', 'Eyes shut. The floods are no use. So I will lift its head for it.', 5);
      await d.wait(5.1);
      d.bark('gil_radio', 'Slew brake, near leg of my crane, the red housing. Shoot it off and stand clear of the boom.', 7);
      brake.armed = true;
      d.objective('Shoot the brake off the near leg of the crane');
      d.glance({ x: BRAKE.x, y: BRAKE.y - 20, zoom: 1.1 }, 2, 0.6);
      await until(d, () => brake.gone);
      // The boom swings out over the channel and into it.
      d.sfx('unlatch');
      d.shake(0.4);
      d.glance({ x: VISTA.x, y: VISTA.y, zoom: 1, rack: -0.6 }, 2.6, 0.8);
      await ease(d, (v) => (k.swing = v), 0, 1, 1.3);
      d.sfx('crash');
      d.flash(0.3, 0.5);
      d.shake(1);
      k.rearUp(w);
      d.bark('gil_radio', 'Sorry, old thing.', 3);
      void ease(d, (v) => (k.swing = v), 1, 0, 3).catch(() => undefined);
    }

    await until(d, () => k.mode === 'reared');
    d.objective(null);
    await d.wait(1.4);
    await pulse(d, ph);
    d.objective('Shoot the root barb while it is down');
    d.bark('mun', ph === 1 ? 'It is down. The root barb, by its claws. Now!' : 'Down again. The root barb!', 4);
    await until(d, () => k.cleared >= ph);
    d.shake(0.6);
    if (ph < 3) d.glance({ x: VISTA.x, y: VISTA.y + 30, zoom: 1, rack: -0.6, roll: 0.02 }, 1.6, 0.9);
    if (ph === 1) d.bark('gil_radio', 'First knot is out. It felt that.', 4);
    if (ph === 2) d.bark('gil_radio', 'Two. It is slower now. Or I am hoping.', 4);
    if (ph < 3) {
      d.set('tide.phase', ph + 1);
      d.mark(`cp_p${ph + 1}`);
    }
  }
  await release(d);
}

/** The last barb is out. */
async function release(d: Director): Promise<void> {
  const w = d.world;
  const k = w.combat!.kaiju!;
  d.lock();
  d.heat(0);
  d.objective(null);
  k.free(w);
  // Gil takes the lights off it: what is left to see by is its own.
  k.floods = false;
  d.music('mast');
  await d.bars(true);
  // The cable goes slack and slides off it into the water. Stay wide, the far bank sharp.
  d.cut({ x: VISTA.x, y: VISTA.y + 14, zoom: 1, rack: -1, roll: 0 });
  d.mood({ vignette: 0.1, exposure: 0.05, bloom: 0.18 }, 2.5);
  await d.wait(2.6);
  await d.say('mun', 'The carrier on that cable just went. All of it. Nothing is shouting in its head any more.');
  // It looks at the harbour lights for a long moment.
  d.drift({ x: VISTA.x - 40, y: VISTA.y, zoom: 1.06 }, 8, 'out');
  await d.wait(4.2);
  d.cut({ on: 'sol', zoom: 1.9, dx: 0, dy: -6, rack: 0, roll: 0 });
  await d.say('sol', 'Go on. Deep water.');
  d.cut({ x: VISTA.x - 40, y: VISTA.y, zoom: 1.06, rack: -1 });
  d.sfx('call', 0.7);
  k.sink();
  d.drift({ x: VISTA.x, y: VISTA.y + 60, zoom: 1 }, 8.5);
  await d.wait(6.5);
  await d.say('gil_radio', 'Thirty years on this water. Never once saw its face.');
  await d.say('mun', 'Somebody will say it was a wave. They will be half right.');
  d.calm(3);
  d.drift({ on: 'sol', zoom: 1.4, dx: 20, dy: -12, rack: 0 }, 2.4);
  await d.say('gil_radio', 'Hook is coming down, mast-girl. I still owe you a ride.');
  void ease(d, (v) => (w.signals.hook = v), 0, 1, 2.5).catch(() => undefined);
  d.release(1.5);
  await d.bars(false);
  d.unlock();
  w.thing('hook').enabled = true;
  d.objective('Take the hook');
  d.set('tide.free', 1);
  d.mark('cp_free');
}

/**
 * Chapter Three, part three — The Undertow.
 * What Meridian's members were really warned about, and what was done to it.
 */
export const tide: Chapter = {
  id: 'tide',
  kicker: 'CHAPTER THREE · III',
  title: 'THE UNDERTOW',
  subtitle: 'The members were not warned about weather.',
  music: 'spire',
  amb: { city: 0.5, crowd: 0 },
  route: [
    [CRANE_X - 18, G],
    [CRANE_X - 18, G - 120],
    [CRANE_X - 18, G],
    [TRENCH.x + 12, G],
    [TRENCH.x + 12, G + TRENCH.h],
    [TRENCH.x + TRENCH.w - 12, G + TRENCH.h],
    [TRENCH.x + TRENCH.w - 12, G],
  ],
  build: () => buildQuay('tide'),
  paint: paintQuay,

  setup(d) {
    const w = d.world;
    const c = new Combat();
    const k = new Kaiju(ARENA);
    w.combat = c;
    c.kaiju = k;
    c.armed = true;
    c.mark('brake', BRAKE.x, BRAKE.y, 2, 8);
    // The box from the fight on the quay is on the deck now.
    const box = w.mover(HANG.id);
    box.y = G - HANG.h;
    box.arrived = true;
    w.signals.cab = 1;
    w.signals.floods = d.flag('tide.floods') > 0 ? 1 : 0;
    k.floods = w.signals.floods > 0;
    if (k.floods) k.lit = 1;
    if (d.flag('tide.free')) {
      // Afterwards: nothing in the channel but water.
      for (const b of k.barbs) b.hp = 0;
      k.mode = 'gone';
      k.calm = 1;
      w.signals.hook = 1;
      w.thing('hook').enabled = true;
      d.objective('Take the hook');
    } else if (d.flag('tide.phase')) {
      k.stand();
      d.run(fight, false);
    } else d.objective(null);
  },

  async intro(d) {
    const w = d.world;
    const k = w.combat!.kaiju!;
    d.lock();
    await d.bars(true, 0);
    // Black, and the call. Then the channel, and what is standing up in it.
    d.cut({ x: VISTA.x, y: VISTA.y + 50, zoom: 1, rack: -0.9, roll: 0 });
    d.sfx('call');
    await d.wait(1.4);
    void d.fade(0, 2.8);
    k.surface();
    d.drift({ x: VISTA.x, y: VISTA.y, zoom: 1, rack: -0.9, roll: 0.014 }, 7, 'inOut');
    await d.card('CHAPTER THREE · III', 'THE UNDERTOW', 'The members were not warned about weather.');
    await until(d, () => k.mode === 'looming');
    d.sfx('call');
    d.shake(0.6);
    await d.wait(1.2);
    d.cut({ on: 'sol', zoom: 1.7, dx: 0, dy: -8, rack: 0, roll: 0.02 });
    await d.say('sol', 'Gil. What is that.');
    d.cut({ x: VISTA.x - 30, y: VISTA.y + 6, zoom: 1, rack: -1, roll: -0.01 });
    d.drift({ x: VISTA.x + 30, y: VISTA.y - 6 }, 16, 'linear');
    await d.say('gil_radio', 'That is no surge. That is the Undertow.');
    await d.say('gil_radio', 'Dockers’ word, for the thing that takes anchors. Thirty years, and I only ever saw its wake.');
    await d.say('mun', 'Sol, look at its hide. That is cable. Meridian’s sea-cable, the one that went dead in the spring.');
    await d.say('mun', 'Those lights are the repeater barbs. Still powered. Still hooked in.');
    await d.say('mun', 'Meridian did not sell its members a storm warning. It sold them this.');
    d.cut({ on: 'sol', zoom: 1.8, dx: 0, dy: -6, rack: 0, roll: 0 });
    await d.say('sol', 'It is not attacking the harbour. It is trying to get the hooks out.');
    await d.say('gil_radio', 'It will take my crane apart trying. So get them out for it, mast-girl.');
    d.release(1.4);
    await d.bars(false);
    d.unlock();
    d.set('tide.phase', 1);
    d.mark('cp_p1');
    d.run(fight, false);
  },

  triggers: {},

  interacts: {
    async floods(d) {
      const w = d.world;
      const k = w.combat!.kaiju!;
      d.lock();
      w.thing('floods').enabled = false;
      d.sfx('switch');
      await d.wait(0.4);
      // Every lamp on the quay swings round onto it.
      w.signals.floods = 1;
      k.floods = true;
      d.sfx('floods');
      d.flash(0.3, 0.5);
      d.cut({ x: VISTA.x, y: VISTA.y + 40, zoom: 1, rack: -1, roll: -0.02 });
      d.drift({ x: VISTA.x, y: VISTA.y }, 3, 'out');
      await d.wait(0.5);
      k.rearUp(w);
      d.shake(0.6);
      await d.wait(2.2);
      d.release(1.2);
      d.set('tide.floods', 1);
      d.unlock();
    },

    async hook(d) {
      d.lock();
      await d.bars(true);
      await d.walk('sol', HANG.x + HANG.w / 2, 28);
      d.drift({ on: 'sol', zoom: 1.6, dx: 0, dy: -10, rack: 0 }, 1.6);
      await d.say('gil_radio', 'Both hands. She swings wide.');
      // The boom swings: the horizon tips and the frame pulls wide.
      d.shake(0.45);
      d.sfx('gust', 0.8);
      d.drift({ on: 'sol', zoom: 1.04, dx: 60, dy: -10, roll: 0.07, rack: -0.4 }, 1.9, 'in');
      await d.fade(1, 1.6);
      d.leave('spire');
    },
  },
};
