import { paintMast } from '../art/scenes/mast';
import type { Chapter } from '../game/chapter';
import { LevelBuilder, type LevelData } from '../game/level';

function buildMast(): LevelData {
  const G = 560;
  const W = 900;
  const b = new LevelBuilder('mast', 'mast', W, 620, G, 4014);
  b.solid(-200, G, W + 400, 200, 'deck');
  b.solid(-40, -400, 40, 1100, 'none');
  b.solid(W, -400, 40, 1100, 'none');
  b.spawn(150, G, 1);
  b.weather({ rain: 0, wind: 0.22, fog: 0.7 });

  b.oneWay(372, 480, 168, 'catwalk');
  b.ladder(392, 480, G);
  b.oneWay(572, 470, 60, 'catwalk');
  b.pickup('tape_mast', 604, 452);
  b.ladder(520, 400, 480);
  b.oneWay(424, 400, 116, 'catwalk');
  b.oneWay(330, 400, 64, 'catwalk');
  b.ladder(346, 320, 400);
  b.oneWay(326, 320, 148, 'catwalk');
  // A solid landing: its edge is the ledge-grab lesson.
  b.solid(470, 272, 96, 6, 'slab');
  b.ladder(548, 190, 272);
  b.oneWay(418, 190, 148, 'catwalk');

  b.prop('gondola', 812, G);
  b.prop('crates', 268, G);
  b.prop('barrel', 706, G);
  b.interact('beacon', 450, 190, 'Replace the lamp', true, 16);
  b.interact('gondola', 832, G, 'Ride down', false, 22);

  b.trigger('t_ladder', 356, 500, 80, 70);
  b.trigger('t_gap', 424, 360, 60, 50);
  b.trigger('t_ledge', 410, 280, 64, 50);
  b.checkpoint('cp_p3', 330, 280, 60, 50, 356, 320);
  return b.build();
}

/**
 * Prologue — Night Shift.
 * A routine repair above the fog, a voice on a dead band, and a decision.
 */
export const mast: Chapter = {
  id: 'mast',
  kicker: 'PROLOGUE',
  title: 'NIGHT SHIFT',
  subtitle: 'Mast 14. Two hundred metres above the fog.',
  music: 'mast',
  amb: { city: 0.25, crowd: 0 },
  route: [
    [392, 560],
    [392, 480],
    [520, 480],
    [520, 400],
    [440, 400],
    [370, 400],
    [346, 400],
    [346, 320],
    [462, 320],
    [480, 272],
    [548, 272],
    [548, 190],
    [450, 190],
  ],
  build: buildMast,
  paint: paintMast,

  setup(d) {
    const w = d.world;
    const done = d.flag('mast.call') > 0;
    w.signals.beacon = done ? 1 : 0;
    w.thing('beacon').enabled = !done;
    w.thing('gondola').enabled = done;
    d.objective(done ? 'Ride the gondola down to the Lanes' : 'Climb the mast and replace the beacon');
  },

  async intro(d) {
    d.lock();
    await d.bars(true, 0);
    // Open on the sea of fog with the focus far out, drifting across it.
    // Looking down across the fog from above the platform: the lens is tipped well below the horizon.
    d.cut({ x: 590, y: 250, zoom: 1, rack: -0.9, roll: -0.012, shiftX: 50, shiftY: -120 });
    await d.wait(0.5);
    void d.fade(0, 2.6);
    d.drift({ x: 480, y: 232, zoom: 1.05, rack: -0.9, roll: 0.008, shiftX: 20, shiftY: -80 }, 6.5, 'linear');
    await d.card('PROLOGUE', 'NIGHT SHIFT', 'Mast 14. Two hundred metres above the fog.');
    // Crane down the mast as the focus comes back onto the steel...
    await d.move({ x: 450, y: 330, zoom: 1.12, rack: 0, roll: 0, shiftX: 0, shiftY: -30 }, 2.6);
    await d.move({ x: 300, y: 500, zoom: 1.3 }, 2.6);
    // ...and find her on the deck.
    await d.move({ on: 'sol', zoom: 1.7, dy: -8 }, 1.8);
    await d.say('sol', 'Mast fourteen. Beacon two is dead again.');
    await d.say('sol', 'Forty minutes. Then home.');
    d.release(1.6);
    await d.bars(false);
    d.unlock();
    d.objective('Climb the mast and replace the beacon');
    d.mark('cp_start');
  },

  triggers: {
    t_ladder(d) {
      d.toast('UP  —  climb ladders');
      // A look up the climb ahead.
      d.glance({ x: 440, y: 330, zoom: 1 }, 2.2, 0.6);
    },
    t_gap(d) {
      d.toast('JUMP  —  clear the gap');
    },
    t_ledge(d) {
      d.toast('Jump and hold toward a ledge to grab it.  UP to pull yourself over.');
    },
  },

  interacts: {
    async beacon(d) {
      const w = d.world;
      d.lock();
      await d.bars(true);
      await d.walk('sol', 438, 30);
      d.face('sol', 1);
      d.pose('sol', 'kneel');
      // Push in on her hands at the lamp housing.
      d.drift({ on: 'sol', zoom: 1.85, dx: 14, dy: -6 }, 1.6);
      d.sfx('switch');
      await d.wait(1.5);
      w.signals.beacon = 1;
      w.thing('beacon').enabled = false;
      d.sfx('relay', 0.7);
      d.flash(0.18, 0.7);
      // Cut wide as the red light comes on, then rise past it toward the moon.
      d.cut({ x: 450, y: 252, zoom: 1, rack: 0 });
      d.drift({ x: 470, y: 150, zoom: 1.08, rack: -0.5 }, 5, 'out');
      d.pose('sol', null);
      await d.wait(0.9);
      await d.say('sol', 'There. Green across the board.');
      await d.wait(1.4);
      d.sfx('static');
      // The set on her back crackles: snap in on it, off level.
      d.cut({ on: 'sol', zoom: 2.1, dx: -8, dy: 2, rack: 0, roll: 0.022 });
      d.shake(0.12);
      await d.say('mun', '...fourteen. Is anybody on fourteen.');
      await d.say('sol', 'That is the old open band. Nobody is licensed to be on the old open band.');
      d.drift({ on: 'sol', zoom: 1.5, dx: 0, dy: -6, roll: 0 }, 1.2);
      await d.tune({ id: 'handset', freq: 0.31, hold: 1.2, label: 'HANDSET · OPEN BAND' });
      // The call: one long, slow push while she listens.
      d.drift({ on: 'sol', zoom: 1.9, dx: 10, dy: -4 }, 26, 'linear');
      await d.say('mun', 'There you are. Do not hang up. My name is Mun. I used to run a station called Radio Magpie.');
      await d.say('sol', 'Magpie went off the air when I was a kid.');
      await d.say('mun', 'Magpie was taken off the air. There is a difference, and tonight it matters.');
      await d.say('mun', 'A surge is coming up the harbour before dawn. Meridian told its Assure members two hours ago.');
      d.sfx('spot', 0.5);
      // The paid alert lands like a slap: a hard cut, wider, colder, tilted.
      d.cut({ on: 'sol', zoom: 1.25, dx: -34, roll: -0.03 });
      d.mood({ saturation: -0.28, vignette: 0.16 }, 0.2);
      await d.say('alert', 'SURGE ADVISORY IN YOUR AREA. FULL DETAILS FOR ASSURE MEMBERS. UPGRADE NOW?');
      d.calm(1.6);
      d.drift({ on: 'sol', zoom: 1.6, dx: 0, roll: 0 }, 3);
      await d.say('sol', '...That is the only version I got.');
      await d.say('mun', 'The Lanes, the Yards, Pier Street. Nobody down there got any version at all.');
      // She looks out over the fog: the focus goes with her, to the city under it.
      d.drift({ on: 'sol', zoom: 1.15, dx: 70, dy: 20, rack: -0.7 }, 3.6);
      await d.say('mun', 'I have four old relays hidden in this city and nobody left who can climb. You are already two hundred metres up.');
      const pick = await d.choose(['My mother lives on Pier Street.', 'If Meridian finds out, I never work a mast again.']);
      d.drift({ on: 'sol', zoom: 1.7, dx: 0, dy: -4, rack: 0 }, 1.6);
      if (pick === 0) await d.say('mun', 'Then you already know why.');
      else await d.say('mun', 'I know what I am asking. I asked it of myself, once.');
      d.set('choice.why', pick + 1);
      await d.say('sol', 'Where is the first one?');
      await d.say('mun', 'The Lanes. Take the service gondola down. And, Sol. Thank you.');
      d.release(2);
      await d.bars(false);
      d.unlock();
      d.set('mast.call', 1);
      w.thing('gondola').enabled = true;
      d.objective('Ride the gondola down to the Lanes');
      d.mark('cp_top');
    },

    async gondola(d) {
      d.lock();
      await d.bars(true);
      d.drift({ x: 770, y: 495, zoom: 1.15 }, 2.2);
      d.sfx('switch');
      await d.wait(0.9);
      // Tilt up off the deck into open sky as the picture goes out.
      d.drift({ x: 700, y: 300, zoom: 1, rack: -0.8 }, 3.4);
      await d.fade(1, 2.2);
      d.music('title');
      await d.card('', 'SKYWAVE', 'Radio travels farthest at night.');
      d.leave('lanes');
    },
  },
};
