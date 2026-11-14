import { CLOUD_TOP, paintSpire } from '../art/scenes/spire';
import type { Chapter } from '../game/chapter';
import type { Director } from '../game/director';
import { LevelBuilder, type LevelData } from '../game/level';

const G = 2340;
const W = 640;
const X0 = 208;
const X1 = 438;
const LEFT = 232;
const RIGHT = 414;

function buildSpire(): LevelData {
  const b = new LevelBuilder('spire', 'spire', W, 2400, G, 5518);
  b.solid(-200, G, W + 400, 200, 'deck');
  b.solid(-40, -400, 40, 3200, 'none');
  b.solid(W, -400, 40, 3200, 'none');
  b.spawn(96, G, 1);
  b.weather({ rain: 1, wind: 0.5, fog: 0.6, storm: true });
  const floor = (y: number, x0 = X0, x1 = X1): void => {
    b.oneWay(x0, y, x1 - x0, 'catwalk');
  };
  /** Shield plate on a landing: cover from wind and from the scanning lights. */
  const shield = (y: number, side: 'l' | 'r'): void => {
    if (side === 'l') {
      b.wall(202, y - 40, 6, 40, 'panel');
      b.hide(210, y - 40, 30, 40);
      b.shelter(208, y - 44, 44, 44);
    } else {
      b.wall(440, y - 40, 6, 40, 'panel');
      b.hide(408, y - 40, 30, 40);
      b.shelter(394, y - 44, 46, 44);
    }
  };

  // A: the first landings, then out onto the face.
  floor(2260);
  b.ladder(LEFT, 2260, G);
  floor(2180);
  b.ladder(RIGHT, 2180, 2260);
  shield(2180, 'l');
  floor(2100);
  b.ladder(LEFT, 2100, 2180);
  shield(2100, 'l');
  b.solid(448, 2068, 72, 6, 'slab');
  b.solid(470, 2020, 90, 6, 'slab');
  b.solid(350, 1980, 88, 6, 'slab');
  floor(1980, 290, 350);

  // B: the service lift.
  b.mover({ id: 'lift', x: 212, y: 1980, w: 72, h: 8, path: [[212, 1980], [212, 1500]], speed: 36, pause: 0, active: false, once: true, kind: 'platform' });
  b.interact('lift', 248, 1980, 'Start the lift', true, 20);
  floor(1500, 290, X1);

  // C: the scanned floors.
  b.ladder(RIGHT, 1420, 1500);
  floor(1420);
  shield(1420, 'l');
  b.ladder(LEFT, 1340, 1420);
  floor(1340);
  shield(1340, 'l');
  b.ladder(RIGHT, 1260, 1340);
  floor(1260);
  shield(1260, 'l');
  b.solid(448, 1228, 72, 6, 'slab');
  b.solid(470, 1180, 90, 6, 'slab');
  b.solid(350, 1140, 88, 6, 'slab');
  floor(1140, X0, 350);
  b.ladder(LEFT, 1060, 1140);
  floor(1060);
  shield(1060, 'r');
  b.ladder(RIGHT, 980, 1060);
  floor(980);
  shield(980, 'l');
  b.ladder(LEFT, 900, 980);
  floor(900);
  shield(900, 'l');
  b.ladder(RIGHT, 820, 900);
  floor(820);

  // D: above the weather.
  b.ladder(LEFT, 740, 820);
  floor(740);
  b.solid(448, 708, 72, 6, 'slab');
  b.pickup('tape_spire', 486, 690);
  b.ladder(RIGHT, 660, 740);
  floor(660);
  b.ladder(LEFT, 580, 660);
  floor(580);
  b.ladder(322, 420, 580);
  b.solid(204, 420, 240, 6, 'slab');
  b.interact('main', 292, 420, 'Wake the transmitter', true, 20);

  b.drone({ id: 'd1', path: [[120, 1490], [120, 1230]], speed: 22, range: 340, half: 0.2, aim: 0, pause: 1.2 });
  b.drone({ id: 'd2', path: [[604, 1290], [604, 1050]], speed: 20, range: 340, half: 0.2, aim: Math.PI, pause: 1.2 });
  b.drone({ id: 'd3', path: [[120, 1090], [120, 880]], speed: 22, range: 340, half: 0.2, aim: 0, pause: 1.2 });

  b.trigger('face', 400, 2060, 40, 40);
  b.trigger('mid', 300, 1440, 138, 60);
  b.trigger('clear', X0, 760, X1 - X0, 50);
  b.checkpoint('cp_a', 320, 2060, 80, 40, 340, 2100);
  b.checkpoint('cp_lift', 296, 1940, 50, 40, 320, 1980);
  b.checkpoint('cp_mid', 300, 1460, 60, 40, 330, 1500);
  b.checkpoint('cp_c9', 240, 1100, 60, 40, 262, 1140);
  b.checkpoint('cp_cloud', 300, 780, 60, 40, 330, 820);
  b.checkpoint('cp_top', 280, 540, 80, 40, 300, 580);
  return b.build();
}

/** Storm gusts: a warning, then a shove. Stops above the clouds. */
async function gusts(d: Director): Promise<void> {
  const w = d.world;
  let warned = d.flag('spire.gust') > 0;
  for (;;) {
    await d.wait(4.5 + Math.random() * 3.5);
    if (w.locked > 0 || w.player.feet < CLOUD_TOP + 60 || d.flag('spire.t.clear')) {
      w.wind = 0;
      continue;
    }
    d.sfx('gust');
    if (!warned) {
      d.toast('GUST COMING  —  hold DOWN to brace, or get behind a shield plate');
      warned = true;
      d.flags['spire.gust'] = 1;
    }
    await d.wait(0.9);
    const dir = Math.random() < 0.75 ? 1 : -1;
    w.wind = dir * 400;
    w.weather.wind = dir * 0.9;
    d.shake(0.14);
    await d.wait(1.5);
    w.wind = 0;
    w.weather.wind = dir * 0.5;
  }
}

/**
 * Chapter Four — The Spire.
 * The climb, the reason Magpie went quiet, and the choice of what to send.
 */
export const spire: Chapter = {
  id: 'spire',
  kicker: 'CHAPTER FOUR',
  title: 'THE SPIRE',
  subtitle: 'They built it around her transmitter.',
  music: 'spire',
  amb: { city: 0.3, crowd: 0 },
  route: [
    [LEFT, G],
    [LEFT, 2260],
    [RIGHT, 2260],
    [RIGHT, 2180],
    [LEFT, 2180],
    [LEFT, 2100],
    [430, 2100],
    [484, 2068],
    [462, 2068],
    [476, 2020],
    [432, 1980],
    [320, 1980],
    [248, 1980],
    [248, 1500, 'ride'],
    [330, 1500],
    [RIGHT, 1500],
    [RIGHT, 1420],
    [LEFT, 1420],
    [LEFT, 1340],
    [RIGHT, 1340],
    [RIGHT, 1260],
    [430, 1260],
    [484, 1228],
    [462, 1228],
    [476, 1180],
    [432, 1140],
    [LEFT, 1140],
    [LEFT, 1060],
    [RIGHT, 1060],
    [RIGHT, 980],
    [LEFT, 980],
    [LEFT, 900],
    [RIGHT, 900],
    [RIGHT, 820],
    [LEFT, 820],
    [LEFT, 740],
    [RIGHT, 740],
    [RIGHT, 660],
    [LEFT, 660],
    [LEFT, 580],
    [322, 580],
    [322, 420],
    [292, 420],
  ],
  build: buildSpire,
  paint: paintSpire,

  setup(d) {
    const w = d.world;
    const done = d.flag('spire.main') > 0;
    w.signals.main = done ? 1 : 0;
    w.thing('main').enabled = !done;
    const lifted = d.flag('spire.lift') > 0;
    w.thing('lift').enabled = !lifted;
    if (lifted) {
      const lift = w.mover('lift');
      lift.y = 1500;
      lift.arrived = true;
    }
    // If the officer chose to help, one of the Wardens never shows up.
    w.drone('d3').active = d.flag('choice.cha') !== 1;
    if (d.flag('spire.t.clear')) {
      w.weather.rain = 0;
      w.weather.storm = false;
      w.weather.wind = 0.12;
      w.weather.fog = 0.12;
    }
    d.objective(done ? null : 'Climb the Spire');
    d.run(gusts, false);
  },

  async intro(d) {
    d.lock();
    await d.bars(true, 0);
    // Start well up the tower in the storm, tipped by the wind, and crane all the way down to her.
    // From below, looking up: the lens is tipped above the horizon so the tower's frame runs away overhead.
    d.cut({ x: 330, y: 1780, zoom: 1, rack: -0.5, roll: 0.035, shiftX: 0, shiftY: 90 });
    await d.wait(0.5);
    void d.fade(0, 2.2);
    d.drift({ x: 300, y: 2150, zoom: 1, rack: 0, roll: 0, shiftY: -30 }, 7);
    await d.card('CHAPTER FOUR', 'THE SPIRE', 'They built it around her transmitter.');
    await d.move({ on: 'sol', zoom: 1.4, dx: 40, dy: -24, rack: 0, roll: 0 }, 2.4);
    await d.say('sol', 'Six hundred metres. In this.');
    // Follow her eyes up the steel while Mun talks.
    d.drift({ on: 'sol', zoom: 1, dx: 110, dy: -90, rack: -0.4 }, 4.5);
    await d.say('mun', 'My old rig is still in the crown. They could never get it out, so they built their Spire around it and pretended it was not there.');
    d.drift({ on: 'sol', zoom: 1.65, dx: 10, dy: -6, rack: 0 }, 1.6);
    await d.say('mun', 'Climb, Sol. The tide turns in forty minutes.');
    d.release(1.4);
    await d.bars(false);
    d.unlock();
    d.objective('Climb the Spire');
    d.mark('cp_start');
  },

  triggers: {
    face(d) {
      d.bark('mun', 'The ladder is gone above you. You will have to go out on the face. Wait for the gusts to pass.', 6);
      // Out to the ledges hanging over the drop.
      d.glance({ x: 480, y: 2000, zoom: 1, roll: 0.025 }, 2.8, 0.75);
    },
    mid(d) {
      if (d.flag('choice.cha') === 1) {
        d.sfx('static');
        d.bark('cha_radio', 'Spire Wardens, stand down for recalibration. Authorisation Cha. ...That is all the minutes I have.', 7);
      } else {
        d.sfx('static');
        d.bark('dispatch', 'All Wardens to the Spire. Unlicensed carrier ascending. Scan every floor.', 6);
      }
      d.toast('Scanning lights sweep the floors.  Shield plates will hide you: hold DOWN behind one.');
      d.glance({ on: 'd1', zoom: 1, dx: 60, roll: -0.02 }, 2.6, 0.6);
    },
    async clear(d) {
      const w = d.world;
      w.wind = 0;
      w.weather.storm = false;
      d.music('mast');
      for (let i = 0; i < 12; i++) {
        w.weather.rain = Math.max(0, w.weather.rain - 0.09);
        w.weather.fog = Math.max(0.12, w.weather.fog - 0.045);
        w.weather.wind *= 0.8;
        await d.wait(0.25);
      }
      w.weather.rain = 0;
      await d.wait(1.2);
      // Out of the cloud: open the frame right up and let the focus go to the sky.
      d.glance({ on: 'sol', zoom: 1, dy: -46, rack: -0.5, roll: 0 }, 10, 0.9);
      d.bark('sol', '...I am above it. Mun, there are stars.', 4);
      await d.wait(4.5);
      d.bark('mun', 'There always were. That shimmer over them is what carries us, at night. We just stopped looking up.', 7);
    },
  },

  interacts: {
    async lift(d) {
      const w = d.world;
      const lift = w.mover('lift');
      d.lock();
      w.wind = 0;
      w.stealthOff = true;
      await d.bars(true);
      await d.walk('sol', 248, 30);
      d.sfx('switch');
      w.thing('lift').enabled = false;
      lift.active = true;
      d.shake(0.2);
      // Tight on her as the platform jerks into motion, then let the tower fall away around her.
      d.cut({ on: 'sol', zoom: 1.9, dx: 0, dy: -5, roll: 0, rack: 0 });
      await d.wait(1.0);
      d.drift({ on: 'sol', zoom: 1, dx: 70, dy: 24, rack: -0.3 }, 7);
      await d.say('mun', 'Eleven years ago tonight there was another surge. Smaller. A harbour pilot told me before he told anyone.');
      await d.say('mun', 'I read the warning out street by street, in alphabetical order, so people would know when to listen for theirs.');
      // The night they cut her off: come back in close for it.
      d.drift({ on: 'sol', zoom: 2, dx: 0, dy: -5, rack: 0 }, 3);
      await d.say('mun', 'Meridian cut my carrier at Marrow Lane. I never got to the P’s.');
      await d.say('sol', '...Pier Street.');
      d.drift({ on: 'sol', zoom: 1.25, dx: 30, dy: -24 }, 3.5);
      await d.say('mun', 'I have had eleven years to finish that list. Tonight you are going to let me.');
      while (!lift.arrived) await d.wait(0.2);
      d.shake(0.15);
      d.set('spire.lift', 1);
      w.stealthOff = false;
      d.release(1.2);
      await d.bars(false);
      d.unlock();
      d.mark('cp_mid');
    },

    async main(d) {
      const w = d.world;
      d.lock();
      w.stealthOff = true;
      await d.bars(true);
      await d.walk('sol', 282, 30);
      d.face('sol', -1);
      d.pose('sol', 'kneel');
      // Push in on her at the old valve rig.
      d.drift({ on: 'sol', zoom: 1.9, dx: -14, dy: -4, rack: 0, roll: 0 }, 1.8);
      d.sfx('switch');
      await d.wait(0.6);
      await d.say('sol', 'Valves. Hand-wound coils. This is older than the tower.');
      await d.say('mun', 'My first transmitter. Be gentle with her and firm with the dial. The lightning will try to knock you off the mark.');
      await d.tune({ id: 'main', freq: 0.56, gain: 0.6, drift: 0.05, kick: 0.22, hold: 2.2, label: 'MAIN TRANSMITTER' });
      w.signals.main = 1;
      w.thing('main').enabled = false;
      d.sfx('relay');
      d.sfx('lock');
      d.flash(0.5, 1.4);
      d.shake(0.5);
      d.pose('sol', null);
      d.set('spire.main', 1);
      d.music('dawn');
      // She is on the air: cut wide and crane up the masthead as the rings go out.
      d.cut({ x: 320, y: 330, zoom: 1, rack: 0, roll: 0 });
      d.mood({ bloom: 0.2, exposure: 0.06 }, 1.5);
      await d.move({ x: 320, y: 140, zoom: 1.06 }, 3.6, 'out');
      await d.wait(0.5);
      // Back down to her behind a wipe.
      await d.wipe();
      d.cut({ on: 'sol', zoom: 1.5, dx: 14, dy: -6, rack: 0 });
      await d.say('mun', 'Four. Sol, you are on the air. The whole open band, from the Lanes to the water.');
      // The question: close slowly on her while she decides.
      d.drift({ on: 'sol', zoom: 2.15, dx: 0, dy: -5 }, 9, 'out');
      await d.say('mun', 'What do we send?');
      const pick = await d.choose([
        'Just the warning. Clear, and nobody’s name on it.',
        'The warning, and who decided to sell it. In my own name.',
        'Open the band. Let every street speak for itself.',
      ]);
      d.set('choice.ending', pick + 1);
      if (pick === 0) {
        await d.say('mun', 'Clean. Nobody to arrest, nobody to thank. It will simply have been said.');
      } else if (pick === 1) {
        await d.say('mun', 'They will take your ticket for it. They may take more.');
        await d.say('sol', 'They can have it. I am done climbing for them.');
      } else {
        await d.say('mun', 'Every kitchen set a station. It will be chaos.');
        await d.say('sol', 'It will be loud. You said it used to be loud.');
      }
      // She crosses to the microphone: go with her, then come in close for the broadcast.
      d.drift({ on: 'sol', zoom: 1.35, dx: 20, dy: -10 }, 1.6);
      d.face('sol', 1);
      await d.walk('sol', 346, 26);
      d.pose('sol', 'talk');
      d.drift({ on: 'sol', zoom: 2.2, dx: 6, dy: -6 }, 5, 'out');
      await d.say('sol', pick === 1 ? 'This is Sol Han, on the open band, from the top of the Spire.' : 'This is the open band. This is not a test.');
      await d.say('sol', 'A storm surge will reach the harbour before dawn. If you live below Carver Hill, go up. Go now. Knock on doors.');
      d.pose('sol', null);
      d.sfx('static');
      // Mun takes the air: leave Sol small on the deck and rise with the signal into the sky.
      d.cut({ on: 'sol', zoom: 1.12, dx: 0, dy: -34, rack: 0 });
      await d.say('mun', 'This is Radio Magpie. I was reading you a list.');
      d.drift({ x: 320, y: 135, zoom: 1, rack: -0.9 }, 10);
      await d.say('mun', 'Marrow Lane. Needle Court. Old Quay.');
      await d.say('mun', 'Pier Street.');
      void d.fade(1, 3.2, [1, 0.96, 0.9]);
      await d.say('mun', 'Pike Row. Quarry Steps. Rope Walk...');
      await d.wait(1.4);
      d.leave('dawn');
    },
  },
};
