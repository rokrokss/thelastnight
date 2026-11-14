import { paintYards } from '../art/scenes/yards';
import type { Chapter } from '../game/chapter';
import { LevelBuilder, type LevelData } from '../game/level';
import { both, single, twoShot } from './shots';

const G = 560;
const W = 3000;

function buildYards(): LevelData {
  const b = new LevelBuilder('yards', 'yards', W, 640, G, 3309);
  b.solid(-200, G, W + 400, 200, 'dock');
  b.solid(-40, -400, 40, 1300, 'none');
  b.solid(W, -400, 40, 1300, 'none');
  b.spawn(70, G, 1);
  b.weather({ rain: 0.85, wind: 0.35, fog: 0.5 });
  const box = (x: number, n: number, cols = 1): void => {
    b.wall(x, G - 30 * n, 72 * cols, 30 * n, 'container');
  };
  const hideBox = (x: number): void => {
    b.prop('openbox', x, G);
    b.hide(x + 4, G - 30, 40, 30);
  };

  // Gate.
  b.prop('gatehouse', 96, G);
  b.prop('yardfence', 190, G, { w: 112 });
  b.prop('stool', 322, G);
  b.prop('firebarrel', 350, G);
  b.prop('forklift', 384, G);
  b.npc({ id: 'gil', x: 326, y: G, look: 'gil', anim: 'sit', facing: 1, prompt: 'Talk' });

  // Low rows, one Listener.
  box(440, 1);
  box(512, 1);
  hideBox(600);
  box(680, 1);
  box(752, 2);
  box(824, 1);
  hideBox(930);
  b.prop('floodtower', 580, G, { h: 150 });
  b.prop('floodtower', 992, G, { h: 150, flip: true });
  b.drone({ id: 'd1', path: [[430, 430], [1010, 430]], speed: 30, range: 150, half: 0.36 });

  // The wall, and the box that crosses it.
  box(1028, 1);
  box(1100, 2);
  box(1172, 3);
  box(1262, 1);
  b.mover({ id: 'bridge', x: 1248, y: 470, w: 72, h: 30, path: [[1248, 470], [1288, 470]], speed: 13, pause: 1.8, kind: 'container', occlude: true });
  box(1360, 3, 2);
  box(1504, 2);
  box(1576, 1);
  b.prop('floodtower', 1338, G, { h: 190 });
  b.prop('floodtower', 1660, G, { h: 150, flip: true });

  // Floodlit apron.
  b.prop('floodtower', 1700, G, { h: 160 });
  hideBox(1736);
  box(1820, 2);
  box(1892, 3);
  b.mover({ id: 'lift', x: 1970, y: 470, w: 72, h: 30, path: [[1970, 470], [1970, 440]], speed: 12, pause: 1.8, kind: 'container', occlude: true });
  box(2048, 4);
  b.pickup('tape_yards', 2084, 420);
  box(2120, 3);
  box(2192, 2);
  box(2264, 1);
  b.prop('floodtower', 2326, G, { h: 170, flip: true });
  b.drone({ id: 'd2', path: [[1700, 392], [2290, 372]], speed: 28, range: 150, half: 0.34, sweep: { amp: 0.3, speed: 0.9 } });

  // The gantry.
  b.prop('gantry', 2380, G);
  b.ladder(2362, 440, G);
  b.oneWay(2340, 440, 66, 'catwalk');
  b.ladder(2396, 320, 440);
  b.oneWay(2320, 320, 520, 'catwalk');
  b.ladder(2730, 240, 320);
  b.oneWay(2560, 240, 260, 'catwalk');
  b.prop('relay', 2610, 240, { text: 'relay3' });
  b.interact('relay3', 2610, 240, 'Tune relay', true, 18);
  b.npc({ id: 'cha', x: 2640, y: 320, look: 'cha', facing: -1, hidden: true });
  b.prop('bollardbig', 2900, G);
  b.prop('barrel', 2930, G);

  b.trigger('rows', 410, 440, 30, 120);
  b.trigger('wall', 1000, 440, 28, 120);
  b.trigger('flood', 1690, 440, 28, 120);
  b.trigger('crane', 2320, 440, 28, 120);
  b.trigger('cha', 2470, 260, 40, 60);
  b.checkpoint('cp_wall', 1004, 480, 24, 80, 1012, G);
  b.checkpoint('cp_flood', 1650, 480, 40, 80, 1664, G);
  b.checkpoint('cp_crane', 2330, 480, 28, 80, 2346, G);
  b.checkpoint('cp_deck', 2400, 280, 40, 40, 2424, 320);
  return b.build();
}

/**
 * Chapter Three — The Yards.
 * Automated cranes, floodlights, and an officer with a choice to make.
 */
export const yards: Chapter = {
  id: 'yards',
  kicker: 'CHAPTER THREE',
  title: 'THE YARDS',
  subtitle: 'The cranes work nights. So does the tide.',
  music: 'yards',
  amb: { city: 0.8, crowd: 0 },
  route: [
    [426, 560],
    [476, 530],
    [560, 530],
    [650, 560],
    [716, 530],
    [788, 500],
    [860, 530],
    [990, 560],
    [1064, 530],
    [1136, 500],
    [1208, 470],
    [1396, 470],
    [1480, 470],
    [1540, 500],
    [1612, 530],
    [1716, 560],
    [1810, 560],
    [1856, 500],
    [1928, 470],
    [2084, 440],
    [2156, 470],
    [2228, 500],
    [2300, 530],
    [2362, 560],
    [2362, 440],
    [2396, 440],
    [2396, 320],
    [2730, 320],
    [2730, 240],
    [2610, 240],
  ],
  build: buildYards,
  paint: paintYards,

  setup(d) {
    const w = d.world;
    const relay = d.flag('yards.relay') > 0;
    w.signals.relay3 = relay ? 1 : 0;
    w.thing('relay3').enabled = !relay && d.flag('choice.cha') > 0;
    const cha = w.actor('cha');
    cha.visible = d.flag('yards.t.cha') > 0 && !relay;
    w.drone('d1').active = !relay;
    w.drone('d2').active = !relay;
    d.objective(relay ? null : d.flag('choice.cha') ? 'Wake the relay on top of the boom' : 'Reach the big crane, SG-07');
  },

  async intro(d) {
    d.lock();
    await d.bars(true, 0);
    // Open on the floodlights and the working cranes with the far yard sharp, then come down to the gate.
    d.cut({ x: 780, y: 300, zoom: 1, rack: -0.8, roll: 0 });
    await d.wait(0.5);
    void d.fade(0, 2.2);
    d.drift({ x: 320, y: 440, zoom: 1.05, rack: 0 }, 6.5);
    await d.card('CHAPTER THREE', 'THE YARDS', 'The cranes work nights. So does the tide.');
    d.drift({ on: 'sol', zoom: 1.3, dx: 30, dy: -10 }, 2.2);
    await d.walk('sol', 150, 34);
    // Look down the yard, the way she has to go.
    d.drift({ on: 'sol', zoom: 1, dx: 170, dy: -40, rack: -0.6 }, 2.6);
    await d.say('mun', 'The Yards. The third box is on SG-07, the tall crane at the far end. It used to carry my aerial.');
    // Low and close: the wet ground at her boots.
    d.drift({ on: 'sol', zoom: 1.7, dx: 0, dy: 12, rack: 0 }, 1.8);
    await d.say('sol', 'Water is already over the first bollards.');
    await d.say('mun', 'Then walk faster, dear.');
    d.release(1.4);
    await d.bars(false);
    d.unlock();
    d.objective('Reach the big crane, SG-07');
    d.mark('cp_start');
  },

  triggers: {
    rows(d) {
      d.bark('mun', 'Listener in the rows. The open boxes will hide you.', 4.5);
      d.glance({ on: 'd1', zoom: 1, dy: 50 }, 2, 0.6);
    },
    wall(d) {
      d.bark('sol', 'The cranes are still running. Nobody told them either.', 4.5);
      // Up the stacked wall to the box crossing it.
      d.glance({ x: 1290, y: 410, zoom: 1, rack: -0.25 }, 2.4, 0.75);
    },
    flood(d) {
      d.bark('mun', 'Floodlights. A Listener can only see what its own lamp shows it. The big lamps are just weather.', 6);
      d.glance({ on: 'd2', zoom: 1, dy: 46 }, 2.6, 0.6);
    },
    async crane(d) {
      const w = d.world;
      d.lock();
      w.stealthOff = true;
      await d.bars(true, 0.5);
      // Tilt up the whole height of the crane.
      d.bark('sol', 'SG-07. Long way up.', 3.5);
      await d.move({ x: 2470, y: 440, zoom: 1, rack: 0, roll: 0 }, 1);
      await d.move({ x: 2560, y: 240, zoom: 1, rack: -0.3 }, 3.2);
      await d.wait(0.7);
      d.release(1.6);
      await d.bars(false, 0.6);
      w.stealthOff = false;
      d.unlock();
    },
    async cha(d) {
      const w = d.world;
      const cha = w.actor('cha');
      d.lock();
      w.stealthOff = true;
      cha.visible = true;
      await d.bars(true);
      d.sfx('spot', 0.7);
      // He steps out of the cab: see him first, a little off level.
      d.cut({ on: 'cha', zoom: 1.5, dx: -24, dy: -6, roll: -0.025, rack: 0 });
      d.mood({ vignette: 0.14, saturation: -0.1 }, 0.4);
      await d.walk('cha', 2580, 30);
      d.faceEachOther('cha');
      await d.say('cha', 'Stop there. Spectrum Authority. Hands where I can see them.');
      // Shot and reverse shot, each tipped a little the other way.
      d.cut({ on: 'sol', zoom: 1.85, dx: 0, dy: -5, roll: 0.025 });
      await d.wait(0.8);
      both(d, 'cha');
      await d.say('cha', 'You are the carrier that came up in the Lanes. Then the Tops. You climb well.');
      d.cut({ on: 'sol', zoom: 1.9, dx: 0, dy: -5, roll: 0.02 });
      await d.say('sol', 'Meridian told its members about the surge two hours ago. How many people on Pier Street are members?');
      d.cut({ on: 'cha', zoom: 1.9, dx: 0, dy: -5, roll: -0.02 });
      await d.say('cha', 'That is not my department.');
      // Hold on him while she decides what to say, slowly closing and levelling.
      d.drift({ on: 'cha', zoom: 2.25, dy: -5, roll: 0 }, 7, 'out');
      const pick = await d.choose(['You grew up down here. I can hear it when you say Pier Street.', 'Arrest me after the tide. I will still be here.']);
      d.calm(2.5);
      if (pick === 0) {
        await d.say('cha', '...Pike Row. Three streets back from the water.');
        both(d, 'cha');
        await d.say('cha', 'I am going to walk the long way round to my radio. That is ten minutes.');
        // He looks up at the tower his Wardens are circling.
        d.drift({ on: ['sol', 'cha'], zoom: 1.08, dy: -46, rack: -0.5 }, 2.6);
        await d.say('cha', 'The Wardens over the Spire fly on my authorisation tonight. Paperwork gets lost in weather like this.');
        d.set('choice.cha', 1);
      } else {
        await d.say('cha', '...I have to call it in.');
        both(d, 'cha');
        await d.say('cha', 'I do not have to call it in quickly.');
        d.set('choice.cha', 2);
      }
      // He walks out of the frame; stay with her, watching him go.
      d.drift({ on: 'sol', zoom: 1.45, dx: 44, dy: -8, roll: 0, rack: 0 }, 2.2);
      await d.walk('cha', 2760, 34);
      cha.visible = false;
      await d.say('mun', 'I heard all of that. Remind me to be surprised by people more often.');
      d.release(1.4);
      await d.bars(false);
      w.stealthOff = false;
      w.thing('relay3').enabled = true;
      d.unlock();
      d.objective('Wake the relay on top of the boom');
      d.mark('cp_deck');
    },
  },

  interacts: {
    async gil(d) {
      d.lock();
      d.faceEachOther('gil');
      twoShot(d, 'gil');
      if (d.flag('yards.gil')) {
        await d.say('gil', 'Boxes move whether you are standing on them or not. Remember that.');
        d.release(1);
        d.unlock();
        return;
      }
      await d.say('gil', 'Nobody walks into Yard Seven at this hour unless they are lost or they are trouble.');
      single(d, 'sol', 1.8);
      await d.say('sol', 'I need to get up SG-07.');
      single(d, 'gil');
      await d.say('gil', 'Trouble, then. I drove that crane thirty years before they taught it to drive itself.');
      // Back to the two of them over the fire, closing slowly.
      both(d, 'gil');
      d.drift({ on: ['sol', 'gil'], zoom: 1.85, dy: -6 }, 9, 'out');
      await d.say('gil', 'The boxes move on their own now. Ride them. And there is an Authority man in the cab tonight. Cha. Not the worst of them.');
      const pick = await d.choose(['The water is coming up. You should go home.', 'Thanks for the warning.']);
      if (pick === 0) {
        single(d, 'gil');
        await d.say('gil', 'This is home. But I will take the fire up to the gatehouse roof. For you.');
        d.set('yards.gil', 1);
      } else {
        await d.say('gil', 'Warnings are cheap. That is the whole point of them.');
        d.set('yards.gil', 2);
      }
      d.release(1.2);
      d.unlock();
    },

    async relay3(d) {
      const w = d.world;
      d.lock();
      await d.bars(true);
      await d.walk('sol', 2598, 30);
      d.face('sol', 1);
      d.pose('sol', 'kneel');
      d.drift({ on: 'sol', zoom: 1.75, dx: 12, dy: -6 }, 1.4);
      d.sfx('switch');
      await d.wait(0.5);
      await d.say('mun', 'Careful. The whole boom is swaying, so the signal will wander. Follow it.');
      await d.tune({ id: 'relay3', freq: 0.72, gain: 0.36, drift: 0.1, hold: 1.6, label: 'RELAY 3 · YARDS' });
      w.signals.relay3 = 1;
      w.thing('relay3').enabled = false;
      d.sfx('relay');
      d.flash(0.25, 0.8);
      d.shake(0.3);
      // Wide off the side of the boom, the yard small underneath, drifting in.
      d.cut({ x: 2540, y: 330, zoom: 1, rack: 0, roll: 0 });
      d.drift({ x: 2590, y: 270, zoom: 1.12 }, 4, 'out');
      d.pose('sol', null);
      d.set('yards.relay', 1);
      for (const id of ['d1', 'd2']) w.drone(id).active = false;
      await d.wait(0.8);
      await d.say('mun', 'Three. The chain reaches the water. One more link and it reaches the sky.');
      // Up and out toward the Spire, the focus going with it.
      d.drift({ x: 2740, y: 150, zoom: 1, rack: -0.9 }, 2.6);
      await d.wait(1.9);
      await d.say('sol', 'The Spire. Its service lift is on the far side of the channel.');
      d.sfx('static');
      d.cut({ on: 'sol', zoom: 1.7, dx: 0, dy: -6, rack: 0 });
      await d.say('gil_radio', 'Then stay on the boom, mast-girl. I still have the override key. I will swing you across.');
      // The boom swings: the horizon tips and the frame pulls wide.
      d.shake(0.45);
      d.sfx('gust', 0.8);
      d.drift({ on: 'sol', zoom: 1.04, dx: 60, dy: -10, roll: 0.07, rack: -0.4 }, 1.9, 'in');
      await d.fade(1, 1.6);
      d.leave('spire');
    },
  },
};
