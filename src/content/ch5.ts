import { stallSeats } from '../art/paint';
import { paintMarket } from '../art/scenes/market';
import { TAPES, type Chapter } from '../game/chapter';
import type { Director } from '../game/director';
import type { LevelData } from '../game/level';
import { buildLanes } from './ch1.level';

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
function radio(d: Director, tape: string): void {
  if (d.flag(`tape.${tape}`)) {
    d.sfx('static', 0.6);
    d.bark('city', `♪ ${TAPES[tape]!.voice}`, 6);
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
    await d.wait(0.6);
    void d.fade(0, 3, [1, 0.96, 0.9]);
    await d.card('EPILOGUE', 'DAWN', 'The water came. So did the warning.');
    await d.walk('sol', 2640, 30);
    await d.say('sol', 'Tide line is halfway up the shutters. And every door on the street is open.');
    await d.bars(false);
    d.unlock();
    d.objective('Walk back through the Lanes');
    d.mark('cp_start');
  },

  triggers: {
    async jin(d) {
      d.lock();
      d.faceEachOther('jin');
      await d.say('jin', 'Gran, that is her! That is the mast lady!');
      await d.say('jin', 'Gran heard you on her kitchen set. She says you talk too fast.');
      await d.say('sol', 'Tell her I was in a hurry.');
      d.unlock();
    },
    r1(d) {
      radio(d, 'tape_mast');
    },
    async driver(d) {
      d.lock();
      d.faceEachOther('driver');
      if (d.flag('lanes.driver') === 1) {
        await d.say('driver', 'Carver Hill! Dry as a biscuit. I owe you a fare, mast lady. Anywhere in the city.');
      } else {
        await d.say('driver', 'Cab is a fish tank. But I heard the radio in time to get my wife’s mother up the stairs. Fair trade.');
      }
      d.unlock();
    },
    r2(d) {
      radio(d, 'tape_lanes');
    },
    async mime(d) {
      if (d.flag('lanes.mime') === 1) {
        d.sfx('chime');
        d.pose('mime', 'talk');
        d.bark('sol', '(He is playing a harmonica. Out loud. Nobody is stopping him.)', 6);
      } else {
        d.bark('sol', '(The busker watches the open doors, hands in his pockets.)', 5);
      }
    },
    r3(d) {
      radio(d, 'tape_tops');
    },
    async ending(d) {
      const e = d.flag('choice.ending') || 1;
      if (e === 2) {
        d.lock();
        d.faceEachOther('cha');
        await d.say('cha', 'Sol Han. I am supposed to bring you in.');
        await d.say('cha', 'I seem to have lost the paperwork. It was very wet last night.');
        d.unlock();
      } else if (e === 3) {
        d.sfx('static', 0.6);
        d.bark('city', '♪ This is Radio Pier Street! Um. Is this on? My mum says hello!', 6);
      } else {
        d.sfx('static', 0.6);
        d.bark('city', '♪ Repeating. The water is going down. Nobody knows who to thank, so thank each other.', 6);
      }
    },
    r4(d) {
      radio(d, 'tape_yards');
    },
    r5(d) {
      radio(d, 'tape_spire');
    },
    async mun(d) {
      const e = d.flag('choice.ending') || 1;
      d.lock();
      await d.bars(true);
      await d.walk('sol', 1284, 30);
      d.face('sol', -1);
      d.focus(1250, 170, 1.2, 1.2);
      await d.wait(1.2);
      await d.say('mun', 'So that is what you look like.');
      await d.say('sol', 'You are shorter than your voice.');
      await d.say('mun', 'Everybody is, dear.');
      d.pose('baek', 'talk');
      await d.say('baek', 'Sit. Both of you. Three bowls, and nobody is paying.');
      d.pose('baek', 'cook');
      if (e === 1) await d.say('mun', 'Nobody knows who sent it. I find I like that. A city that warned itself.');
      else if (e === 2) await d.say('mun', 'They have your name now. So does everyone on Pier Street. I know which I would rather have.');
      else await d.say('mun', 'Forty stations by breakfast. Most of them terrible. It is the best thing I have ever heard.');
      await d.say('sol', 'What happens to Magpie?');
      await d.say('mun', 'Magpie has a rigger now. If she wants the job.');
      const pick = await d.choose(['I know a mast that needs a new beacon.', 'Ask me after the noodles.']);
      if (pick === 0) await d.say('mun', 'Then we are back on the air.');
      else await d.say('mun', 'Ha. That is the first sensible thing anyone has said all night.');
      d.objective(null);
      await d.fade(1, 2.6, [0.04, 0.03, 0.05]);
      const end = ENDINGS[e] ?? ENDINGS[1]!;
      await d.card('SKYWAVE', end.title, end.line);
      d.leave('credits');
    },
  },

  interacts: {},
};
