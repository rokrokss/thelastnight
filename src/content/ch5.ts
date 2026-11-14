import { stallSeats } from '../art/paint';
import { paintMarket } from '../art/scenes/market';
import { TAPES, type Chapter } from '../game/chapter';
import type { Director } from '../game/director';
import type { LevelData } from '../game/level';
import { buildLanes } from './ch1.level';
import { single, twoShot, both } from './shots';

const G = 214;

export const ENDINGS: Record<number, { id: string; title: string; line: string }> = {
  1: { id: 'warning', title: 'THE WARNING', line: 'Nobody ever learned who sent it. Everybody heard it.' },
  2: { id: 'witness', title: 'THE WITNESS', line: 'She said her name on the air, and the city wrote it down.' },
  3: { id: 'open', title: 'THE OPEN BAND', line: 'By breakfast there were forty stations. By evening, four hundred.' },
};

/** The same street as Chapter One, at first light, with everyone awake. */
function buildDawn(): LevelData {
  const d = buildLanes();
  d.id = 'dawn';
  d.theme = 'dawn';
  d.weather = { rain: 0, wind: 0.05, fog: 0.5 };
  d.drones = [];
  d.pickups = [];
  d.hides = [];
  d.interacts = [];
  d.checkpoints = [];
  d.walkZones = [{ x: -200, y: -200, w: d.width + 400, h: 800 }];
  d.spawn = { x: 2700, y: G, facing: -1 };
  const [, seat] = stallSeats(1186, 88);
  d.npcs = [
    ...d.npcs.filter((n) => n.extra && n.id !== 'c14'),
    { id: 'baek', x: 1228, y: G, look: 'baek', anim: 'cook', facing: 1, behind: true },
    { id: 'mun', x: seat + 4, y: G, look: 'mun', anim: 'sit', facing: -1 },
    { id: 'jin', x: 2452, y: G, look: 'jin', facing: 1 },
    { id: 'gran', x: 2434, y: G, look: 'gran', facing: 1 },
    { id: 'driver', x: 2050, y: G, look: 'driver', anim: 'lean', facing: 1 },
    { id: 'mime', x: 1716, y: G, look: 'mime', facing: 1 },
    { id: 'cha', x: 1500, y: G, look: 'cha', facing: 1, hidden: true },
  ];
  for (const x of [2262, 1904, 1606, 1404, 1322]) d.props.push({ kind: 'radio', x, y: G });
  const zone = (id: string, x: number): void => {
    d.triggers.push({ id, x, y: 0, w: 26, h: 270 });
  };
  d.triggers = [];
  zone('jin', 2486);
  zone('r1', 2290);
  zone('driver', 2090);
  zone('r2', 1932);
  zone('mime', 1754);
  zone('r3', 1634);
  zone('ending', 1540);
  zone('r4', 1432);
  zone('r5', 1350);
  zone('mun', 1294);
  return d;
}

/** A radio on the street plays back a recovered tape (or static, if it was never found). */
function radio(d: Director, tape: string, x: number): void {
  if (d.flag(`tape.${tape}`)) {
    d.sfx('static', 0.6);
    d.bark('city', `♪ ${TAPES[tape]!.voice}`, 6);
    // Lean in on the set that is playing it.
    d.glance({ x, y: G - 24, zoom: 1.4 }, 3.2, 0.6);
  }
}

/**
 * Epilogue — Dawn.
 * A walk back through the Lanes after the water, to finally meet the voice.
 */
export const dawn: Chapter = {
  id: 'dawn',
  kicker: 'EPILOGUE',
  title: 'DAWN',
  subtitle: 'The water came. So did the warning.',
  music: 'dawn',
  amb: { city: 0.35, crowd: 1 },
  build: buildDawn,
  paint: paintMarket,

  setup(d) {
    const w = d.world;
    w.stealthOff = true;
    w.walkOnly = true;
    w.actor('cha').visible = d.flag('choice.ending') === 2;
    d.objective(null);
  },

  async intro(d) {
    d.lock();
    await d.bars(true, 0);
    // First light: a long level track down the street with the far roofs sharp, before it finds her.
    d.cut({ x: 2240, y: 150, zoom: 1.15, rack: -1, roll: 0, shiftX: -70, shiftY: -150 });
    await d.wait(0.6);
    void d.fade(0, 3, [1, 0.96, 0.9]);
    // Morning seen from above the street, coming down to walk it.
    d.drift({ x: 2550, y: 160, zoom: 1.1, rack: -0.2, shiftX: 0, shiftY: -30 }, 7.5, 'linear');
    await d.card('EPILOGUE', 'DAWN', 'The water came. So did the warning.');
    d.drift({ on: 'sol', zoom: 1.35, dx: -34, dy: -10, rack: 0 }, 2.4);
    await d.walk('sol', 2640, 30);
    await d.say('sol', 'Tide line is halfway up the shutters. And every door on the street is open.');
    d.release(1.6);
    await d.bars(false);
    d.unlock();
    d.objective('Walk back through the Lanes');
    d.mark('cp_start');
  },

  triggers: {
    async jin(d) {
      d.lock();
      d.faceEachOther('jin');
      twoShot(d, ['jin', 'gran']);
      await d.say('jin', 'Gran, that is her! That is the mast lady!');
      single(d, 'jin', 2);
      await d.say('jin', 'Gran heard you on her kitchen set. She says you talk too fast.');
      single(d, 'sol');
      await d.say('sol', 'Tell her I was in a hurry.');
      d.release(1.2);
      d.unlock();
    },
    r1(d) {
      radio(d, 'tape_mast', 2262);
    },
    async driver(d) {
      d.lock();
      d.faceEachOther('driver');
      twoShot(d, 'driver');
      if (d.flag('lanes.driver') === 1) {
        await d.say('driver', 'Carver Hill! Dry as a biscuit. I owe you a fare, mast lady. Anywhere in the city.');
      } else {
        await d.say('driver', 'Cab is a fish tank. But I heard the radio in time to get my wife’s mother up the stairs. Fair trade.');
      }
      d.release(1.2);
      d.unlock();
    },
    r2(d) {
      radio(d, 'tape_lanes', 1904);
    },
    async mime(d) {
      if (d.flag('lanes.mime') === 1) {
        d.sfx('chime');
        d.pose('mime', 'talk');
        d.bark('sol', '(He is playing a harmonica. Out loud. Nobody is stopping him.)', 6);
      } else {
        d.bark('sol', '(The busker watches the open doors, hands in his pockets.)', 5);
      }
      d.glance({ on: 'mime', zoom: 1.55, dy: -6 }, 3.6, 0.7);
    },
    r3(d) {
      radio(d, 'tape_tops', 1606);
    },
    async ending(d) {
      const e = d.flag('choice.ending') || 1;
      if (e === 2) {
        d.lock();
        d.faceEachOther('cha');
        twoShot(d, 'cha');
        await d.say('cha', 'Sol Han. I am supposed to bring you in.');
        single(d, 'cha');
        await d.say('cha', 'I seem to have lost the paperwork. It was very wet last night.');
        d.release(1.2);
        d.unlock();
      } else {
        d.sfx('static', 0.6);
        if (e === 3) d.bark('city', '♪ This is Radio Pier Street! Um. Is this on? My mum says hello!', 6);
        else d.bark('city', '♪ Repeating. The water is going down. Nobody knows who to thank, so thank each other.', 6);
        // The city is talking: open up and look across the roofs it is coming from.
        d.glance({ on: 'sol', zoom: 1, rack: -0.5 }, 4.5, 0.85);
      }
    },
    r4(d) {
      radio(d, 'tape_yards', 1404);
    },
    r5(d) {
      radio(d, 'tape_spire', 1322);
    },
    async mun(d) {
      const e = d.flag('choice.ending') || 1;
      d.lock();
      await d.bars(true);
      // The voice, with a face at last: the camera goes ahead of Sol and finds her first.
      d.drift({ on: 'mun', zoom: 1.7, dx: 0, dy: -6, rack: 0, roll: 0 }, 2.4);
      await d.walk('sol', 1284, 30);
      d.face('sol', -1);
      await d.wait(0.9);
      await d.say('mun', 'So that is what you look like.');
      single(d, 'sol');
      await d.say('sol', 'You are shorter than your voice.');
      single(d, 'mun', 2);
      await d.say('mun', 'Everybody is, dear.');
      d.cut({ on: ['sol', 'mun', 'baek'], fit: true, dx: 0, dy: -8 });
      d.pose('baek', 'talk');
      await d.say('baek', 'Sit. Both of you. Three bowls, and nobody is paying.');
      d.pose('baek', 'cook');
      single(d, 'mun', 1.9);
      if (e === 1) await d.say('mun', 'Nobody knows who sent it. I find I like that. A city that warned itself.');
      else if (e === 2) await d.say('mun', 'They have your name now. So does everyone on Pier Street. I know which I would rather have.');
      else await d.say('mun', 'Forty stations by breakfast. Most of them terrible. It is the best thing I have ever heard.');
      // The two of them, and a long slow push while the offer is made.
      both(d, 'mun');
      d.drift({ on: ['sol', 'mun'], zoom: 2, dy: -6 }, 14, 'out');
      await d.say('sol', 'What happens to Magpie?');
      await d.say('mun', 'Magpie has a rigger now. If she wants the job.');
      const pick = await d.choose(['I know a mast that needs a new beacon.', 'Ask me after the noodles.']);
      if (pick === 0) await d.say('mun', 'Then we are back on the air.');
      else await d.say('mun', 'Ha. That is the first sensible thing anyone has said all night.');
      d.objective(null);
      // Leave them to it: pull back until the stall is one light in the street, the focus running out to the Spire.
      d.drift({ on: ['sol', 'mun'], zoom: 1, dx: 0, dy: -30, rack: -0.9 }, 6);
      d.mood({ bloom: 0.15, exposure: 0.05 }, 5);
      await d.wait(3);
      await d.fade(1, 2.6, [0.04, 0.03, 0.05]);
      const end = ENDINGS[e] ?? ENDINGS[1]!;
      await d.card('SKYWAVE', end.title, end.line);
      d.leave('credits');
    },
  },

  interacts: {},
};
