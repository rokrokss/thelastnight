import { paintTops } from '../art/scenes/tops';
import type { Chapter } from '../game/chapter';
import type { Director } from '../game/director';
import { LevelBuilder, type LevelData } from '../game/level';

const H = 560;
const W = 3600;

function buildTops(): LevelData {
  const b = new LevelBuilder('tops', 'tops', W, H, H, 2207);
  const roof = (x0: number, x1: number, y: number): void => {
    b.wall(x0, y, x1 - x0, H - y + 140, 'roof');
  };
  roof(0, 300, 430);
  roof(340, 640, 430);
  roof(690, 930, 398);
  roof(960, 1250, 418);
  b.oneWay(1246, 418, 92, 'plank');
  roof(1334, 1590, 418);
  roof(1630, 1900, 366);
  roof(1940, 2330, 386);
  roof(2370, 2640, 406);
  roof(2690, 2960, 406);
  roof(3000, 3260, 374);
  roof(3300, 3524, 394);
  b.solid(-40, -400, 40, 1300, 'none');
  b.solid(W + 60, -400, 40, 1300, 'none');
  b.d.killY = H + 30;
  b.spawn(110, 430, 1);
  b.weather({ rain: 0.28, wind: 0.3, fog: 0.3 });

  // R1
  b.prop('stairhead', 20, 430);
  b.prop('chair', 104, 430);
  b.prop('skylight', 170, 430, { w: 34 });
  b.prop('aerial', 262, 430);
  // R2
  b.prop('tank', 356, 430);
  b.prop('shed', 430, 430, { w: 64 });
  b.hide(435, 392, 22, 38);
  b.prop('acbank', 520, 430, { variant: 2 });
  b.prop('dish', 600, 430);
  // R3
  b.prop('laundry', 704, 398, { w: 52 });
  b.prop('shed', 770, 398, { w: 72 });
  b.hide(775, 360, 22, 38);
  b.prop('ventstack', 868, 398);
  b.prop('aerial', 912, 398);
  // R4
  b.prop('tank', 986, 418);
  b.hide(984, 380, 28, 38);
  b.prop('chair', 1040, 418);
  b.prop('skylight', 1062, 418, { w: 30 });
  b.prop('billboard', 1112, 418, { w: 112, h: 40, text: 'MERIDIAN', color: 'cyan', variant: 1 });
  // R5
  b.prop('shed', 1380, 418, { w: 64, variant: 0 });
  b.hide(1385, 380, 22, 38);
  b.prop('acbank', 1470, 418, { variant: 2 });
  b.solid(1556, 400, 28, 18, 'metal');
  // R6
  b.prop('ventstack', 1646, 366, { variant: 4 });
  b.prop('billboard', 1690, 366, { w: 150, h: 44, text: 'QUIET IS CIVIC', color: 'pink' });
  b.oneWay(1688, 302, 154, 'none');
  b.ladder(1852, 302, 366);
  b.oneWay(1842, 302, 22, 'catwalk');
  b.pickup('tape_tops', 1740, 284);
  b.hide(1760, 328, 36, 38);
  b.prop('dish', 1880, 366);
  // R7: the water tower
  b.prop('aerial', 1966, 386);
  b.prop('shed', 1990, 386, { w: 64 });
  b.hide(1995, 348, 22, 38);
  b.prop('acbank', 2070, 386, { variant: 2 });
  b.prop('watertower', 2140, 386);
  b.ladder(2196, 306, 386);
  b.oneWay(2130, 306, 164, 'catwalk');
  b.wall(2134, 244, 154, 6, 'none');
  b.prop('relay', 2262, 306, { text: 'relay2' });
  b.interact('relay2', 2262, 306, 'Tune relay', true, 18);
  // The run
  b.prop('tank', 2400, 406);
  b.prop('laundry', 2460, 406, { w: 80 });
  b.prop('skylight', 2572, 406, { w: 34 });
  b.prop('acbank', 2716, 406, { variant: 3 });
  b.prop('aerial', 2850, 406);
  b.prop('ventstack', 2902, 406);
  b.prop('billboard', 3046, 374, { w: 130, h: 40, text: 'ASSURE', color: 'amber', variant: 1 });
  b.prop('dish', 3224, 374);
  b.prop('chair', 3330, 394);
  b.prop('cablestation', 3462, 394);
  b.mover({ id: 'gondola', x: 3524, y: 394, w: 60, h: 8, path: [[3524, 394], [3900, 520]], speed: 46, active: false, kind: 'gondola', once: true, pause: 0 });

  b.drone({ id: 'd1', path: [[720, 318], [1190, 330]], speed: 30, range: 124, half: 0.36 });
  b.drone({ id: 'd2', path: [[1390, 318], [1880, 268]], speed: 28, range: 124, half: 0.36, sweep: { amp: 0.25, speed: 1.0 } });
  b.drone({ id: 'd3', path: [[1960, 276], [2110, 276]], speed: 24, range: 130, half: 0.36, pause: 1.6 });
  b.drone({ id: 'sweeper', path: [[1700, 236], [3700, 236]], speed: 60, range: 250, half: 0.3, active: false, relentless: true });

  b.npc({ id: 'jin', x: 150, y: 430, look: 'jin', facing: 1 });

  b.trigger('tr1', 236, 340, 64, 100);
  b.trigger('tr2', 570, 340, 70, 100);
  b.trigger('tr3', 694, 300, 60, 110);
  b.trigger('tr3b', 860, 300, 70, 110);
  b.trigger('tr4', 1170, 320, 80, 110);
  b.trigger('tr5', 1500, 320, 60, 110);
  b.trigger('tr6', 1830, 270, 70, 110);
  b.trigger('board', 3524, 330, 56, 70);
  b.checkpoint('cp_r3', 700, 340, 60, 60, 722, 398);
  b.checkpoint('cp_r5', 1340, 360, 60, 60, 1362, 418);
  b.checkpoint('cp_r7', 1944, 326, 46, 62, 1962, 386);
  b.checkpoint('cp_chase', 2226, 270, 60, 38, 2244, 306);
  return b.build();
}

/** Where Jin waits after each beat, so a restart finds her in the right place. */
const JIN_STAGES: [string, number, number][] = [
  ['tops.t.tr1', 610, 430],
  ['tops.t.tr2', 760, 398],
  ['tops.t.tr3b', 1228, 418],
  ['tops.t.tr4', 1540, 418],
  ['tops.t.tr5', 1870, 366],
  ['tops.t.tr6', 2030, 386],
];

/** Jin's orders are queued: triggers can fire faster than she can run. */
function jinRun(d: Director, steps: (['walk', number] | ['hop', number, number, number?])[]): Promise<void> {
  return d.queue('jin', async () => {
    for (const s of steps) {
      if (s[0] === 'walk') await d.walk('jin', s[1], 112);
      else await d.hop('jin', s[1], s[2], 0.42, s[3] ?? 22);
    }
  });
}

/**
 * Chapter Two — The Tops.
 * Jin leads Sol across the roofs to the old water tower; then the big light comes.
 */
export const tops: Chapter = {
  id: 'tops',
  kicker: 'CHAPTER TWO',
  title: 'THE TOPS',
  subtitle: 'The roofs belong to the children.',
  music: 'tops',
  amb: { city: 0.5, crowd: 0.15 },
  route: [
    [286, 430],
    [356, 430],
    [626, 430],
    [706, 398],
    [916, 398],
    [976, 418],
    [1350, 418],
    [1570, 400],
    [1650, 366],
    [1886, 366],
    [1956, 386],
    [2196, 386],
    [2196, 306],
    [2262, 306],
  ],
  build: buildTops,
  paint: paintTops,

  setup(d) {
    const w = d.world;
    const relay = d.flag('tops.relay') > 0;
    w.signals.relay2 = relay ? 1 : 0;
    w.thing('relay2').enabled = !relay;
    for (const id of ['d1', 'd2', 'd3']) w.drone(id).active = !relay;
    const sweeper = w.drone('sweeper');
    sweeper.active = relay;
    sweeper.reset(1700, 236);
    const jin = w.actor('jin');
    if (relay) jin.visible = false;
    else {
      for (const [flag, x, y] of JIN_STAGES) {
        if (d.flag(flag)) {
          jin.x = x;
          jin.y = y;
        }
      }
      if (d.flag('tops.t.tr3') && !d.flag('tops.t.tr3b')) d.pose('jin', 'crouch');
      if (d.flag('tops.t.tr6')) d.pose('jin', 'crouch');
    }
    d.objective(relay ? 'Run for the cable car' : 'Follow Jin to the water tower');
  },

  async intro(d) {
    d.lock();
    await d.bars(true, 0);
    await d.wait(0.5);
    void d.fade(0, 2.2);
    await d.card('CHAPTER TWO', 'THE TOPS', 'The roofs belong to the children.');
    await d.walk('sol', 132, 34);
    d.faceEachOther('jin');
    await d.say('jin', 'Rule one. If I jump, you jump.');
    await d.say('jin', 'Rule two. If I get small, you get small. The Listeners only like tall things.');
    await d.say('sol', 'What is rule three?');
    await d.say('jin', 'There is no rule three. Two is already a lot.');
    void d.walk('jin', 270, 112);
    await d.bars(false);
    d.unlock();
    d.objective('Follow Jin to the water tower');
    d.mark('cp_start');
  },

  triggers: {
    async tr1(d) {
      d.bark('jin', 'Little gaps you just jump!', 3);
      await jinRun(d, [['walk', 288], ['hop', 360, 430], ['walk', 610]]);
    },
    async tr2(d) {
      d.bark('jin', 'This one is high. Catch it with your hands and pull.', 4.5);
      d.toast('Jump and hold toward a ledge to grab it.  UP to pull yourself over.');
      await jinRun(d, [['walk', 628], ['hop', 706, 398, 34], ['walk', 760]]);
      if (!d.flag('tops.t.tr3b')) d.pose('jin', 'crouch');
    },
    tr3(d) {
      d.bark('jin', 'Listener! Get in the doorway and get small.', 4.5);
      d.toast('Hold DOWN in a doorway or behind cover to hide.');
    },
    async tr3b(d) {
      d.pose('jin', null);
      d.bark('jin', 'Now, now, while it is looking the other way!', 3.5);
      await jinRun(d, [['walk', 916], ['hop', 976, 418], ['walk', 1228]]);
    },
    async tr4(d) {
      d.bark('jin', 'The plank is good. Mostly.', 3);
      await jinRun(d, [['walk', 1540]]);
    },
    async tr5(d) {
      d.bark('jin', 'Big one. Use the box.', 3);
      await jinRun(d, [['walk', 1548], ['hop', 1570, 400, 16], ['hop', 1650, 366, 30], ['walk', 1870]]);
    },
    async tr6(d) {
      d.bark('jin', 'There. Gran says it has not held water since before she was born.', 5);
      await jinRun(d, [['walk', 1886], ['hop', 1956, 386], ['walk', 2030]]);
      d.pose('jin', 'crouch');
      d.bark('jin', 'One more Listener. I am staying small. Ladder is on the far leg.', 5);
      d.objective('Climb the water tower and wake the relay');
    },
    async board(d) {
      const w = d.world;
      if (!d.flag('tops.relay')) {
        // Too early: re-arm the trigger so the car still works once the relay is awake.
        delete d.flags['tops.t.board'];
        w.fired.delete('board');
        if (!d.flag('tops.early')) {
          d.flags['tops.early'] = 1;
          d.bark('mun', 'Not yet. The relay is back on the water tower.', 4);
        }
        return;
      }
      d.lock();
      w.stealthOff = true;
      await d.bars(true);
      d.sfx('switch');
      w.mover('gondola').active = true;
      await d.say('mun', 'I have you on the cable. Breathe. Two relays up.');
      await d.say('sol', 'The kid?');
      await d.say('mun', 'Home before her gran woke, I would bet my licence. If I had one.');
      await d.fade(1, 1.4);
      d.leave('yards');
    },
  },

  interacts: {
    async jin(d) {
      d.bark('jin', d.flag('tops.t.tr6') ? 'Ladder. Far leg. Go.' : 'Keep up!', 2.5);
    },

    async relay2(d) {
      const w = d.world;
      d.lock();
      await d.bars(true);
      await d.walk('sol', 2250, 30);
      d.face('sol', 1);
      d.pose('sol', 'kneel');
      d.sfx('switch');
      await d.wait(0.5);
      await d.say('mun', 'This one drifts in two directions. Find the pitch, then bring the strength up to meet it.');
      await d.tune({ id: 'relay2', freq: 0.42, gain: 0.68, hold: 1.5, label: 'RELAY 2 · TOPS' });
      w.signals.relay2 = 1;
      w.thing('relay2').enabled = false;
      d.sfx('relay');
      d.flash(0.25, 0.8);
      d.shake(0.25);
      d.pose('sol', null);
      await d.wait(0.8);
      await d.say('mun', 'Two. The Lanes and the Tops are talking to each other. Can you hear it? That is a network.');
      for (const id of ['d1', 'd2', 'd3']) w.drone(id).active = false;
      d.sfx('caught', 0.5);
      d.shake(0.5);
      d.focus(1980, 300, 1, 1.4);
      await d.wait(1.4);
      const sw = w.drone('sweeper');
      sw.reset(1700, 236);
      sw.active = true;
      await d.say('sol', 'What is that?');
      await d.say('mun', 'A Warden. They sent the big light. Sol, you cannot hide from that one.');
      d.release();
      const jin = w.actor('jin');
      d.bark('jin', 'Run for the cable car! Do not look at it! Go!', 4);
      void d
        .queue('jin', async () => {
          d.pose('jin', null);
          await d.walk('jin', 1960, 120);
          jin.visible = false;
        })
        .catch(() => undefined);
      await d.bars(false);
      d.unlock();
      d.set('tops.relay', 1);
      d.music('spire');
      d.objective('Run for the cable car');
      d.mark('cp_chase');
    },
  },
};
