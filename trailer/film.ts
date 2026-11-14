import { ARENA, FLOOD_X, G as QUAY, HANG, HOLD_X, LATCH, LAUNCH_X, PEDESTAL_X, POST } from '../src/content/ch3b.level';
import { Kaiju } from '../src/game/kaiju';
import type { Mood } from '../src/game/view';
import type { Title } from './overlay';
import { armed, fire, posted, risen } from './previews';
import type { Scene } from './scene';

/** One shot of the trailer. */
export interface Take {
  name: string;
  /** Start on the trailer's clock, in seconds. */
  at: number;
  dur: number;
  /** Chapter to shoot in. Omit for black (title cards). */
  chapter?: string;
  /** Seconds the scene runs before its first frame, so rain, steam and bodies are already moving. */
  pre?: number;
  /** A white flash on the cut into this take, 0..1 (the montage cuts on the beat). */
  punch?: number;
  /** Dress the set: place people, set the weather, park the camera. */
  setup?(s: Scene): void;
  /** Direction, from the first frame. Written like a story script: await waits, call shots. */
  play?(s: Scene): Promise<void> | void;
  /** Runs after every simulation step, for anything that has to be held frame by frame. */
  each?(s: Scene, t: number, dt: number): void;
}

export interface Film {
  duration: number;
  takes: Take[];
  titles: Title[];
}

/**
 * The cut is laid out on a musical grid: 96 beats a minute, so one bar is
 * exactly 2.5 seconds and every cut can land on a bar or half-bar.
 */
export const BPM = 96;
export const BAR = 2.5;
const HALF = BAR / 2;

/** The look of being hunted: colour drains, the corners close in. */
const COLD: Partial<Mood> = { vignette: 0.18, saturation: -0.16, aberration: 0.008 };
/** The transmitter is live. */
const WARM: Partial<Mood> = { bloom: 0.2, exposure: 0.06 };
/** The fight on the quay: cold, but with enough light to follow who is shooting at whom. */
const FIGHT: Partial<Mood> = { vignette: 0.16, saturation: -0.08, exposure: 0.14, aberration: 0.006 };
/** Under the Undertow: the storm flattens the colour and lifts the dark. */
const STORM: Partial<Mood> = { vignette: 0.12, saturation: -0.08, exposure: 0.06 };

const ignore = (): undefined => undefined;

/** Above the weather on the Spire: no rain, no storm, thin air. */
function clearSky(s: Scene): void {
  const we = s.w.weather;
  we.rain = 0;
  we.storm = false;
  we.wind = 0.12;
  we.fog = 0.12;
}

/** Roofs with nobody on them but whoever the shot is about. */
function emptyRoofs(s: Scene): void {
  for (const id of ['d1', 'd2', 'd3']) s.w.drone(id).active = false;
}

const takes: Take[] = [
  // ------------------------------------------------------------ cold open
  {
    name: 'fog',
    at: BAR,
    dur: 3 * BAR,
    chapter: 'mast',
    pre: 3,
    setup(s) {
      s.sol(232, 560, 1);
      s.w.locked = 1;
      s.w.signals.beacon = 1;
      s.d.cine.fade = [0, 0, 0, 1];
      // Begin on the moon and the fog sea, with the mast only a soft shape in front of them.
      s.d.cut({ x: 610, y: 190, zoom: 1, rack: -1, roll: -0.012, shiftX: 60, shiftY: -130 });
    },
    play(s) {
      void s.d.fade(0, 2.6);
      // One long crane down the steel to the woman who keeps it standing.
      s.d.drift({ x: 320, y: 470, zoom: 1.24, rack: 0, roll: 0, shiftX: 0, shiftY: -30 }, 7.5);
      void s.d.walk('sol', 300, 18).catch(ignore);
    },
  },

  // ------------------------------------------------------------- the city
  {
    name: 'market',
    at: 4 * BAR,
    dur: 2 * BAR,
    chapter: 'lanes',
    setup(s) {
      s.sol(424, 214, 1);
      s.w.locked = 1;
      // Start with the lens on the wires and lamps in front of her.
      s.d.cut({ on: 'sol', zoom: 1.08, dx: 50, dy: -4, rack: 0.5, roll: 0, shiftX: 90, shiftY: -170 });
    },
    play(s) {
      void s.d.walk('sol', 780, 38).catch(ignore);
      // From above the tarp roofs and the wet road, down to walk beside her.
      s.d.drift({ on: 'sol', zoom: 1.2, dx: 64, dy: -14, rack: 0, shiftX: 0, shiftY: -30 }, 3.6);
    },
  },
  {
    name: 'stall',
    at: 6 * BAR,
    dur: BAR,
    chapter: 'lanes',
    setup(s) {
      s.sol(1254, 214, -1);
      s.w.locked = 1;
      s.w.player.pose = 'sit';
      // Begin on Baek's regular, stripped to the waist over his bowl.
      s.d.cut({ x: 1216, y: 197, zoom: 3.2, rack: 0, roll: 0, shiftX: -70, shiftY: -36 });
    },
    play(s) {
      s.w.actor('baek').talking = 2;
      // Pull back and slide sideways to find her beside him: the stall turns a little, like a real thing.
      s.d.drift({ x: 1232, y: 188, zoom: 2.05, shiftX: 60, shiftY: -44 }, BAR, 'out');
    },
  },
  {
    name: 'listener',
    at: 7 * BAR,
    dur: BAR,
    chapter: 'lanes',
    setup(s) {
      // Small behind the crates while the Listener goes over.
      s.sol(1381, 214, -1);
      s.pad.set('down', true);
      s.w.drone('d1').active = true;
      s.d.mood(COLD, 0);
      s.d.cut({ x: 1368, y: 150, zoom: 1.32, roll: 0.045, rack: 0 });
    },
    play(s) {
      s.w.drone('d1').reset(1446, 112);
      s.d.sfx('spot', 0.5);
      s.d.drift({ x: 1350, y: 152, zoom: 1.42 }, BAR, 'linear');
    },
  },

  // 8 * BAR: card — the alert.

  {
    name: 'roofs',
    at: 9 * BAR,
    dur: 2 * BAR,
    chapter: 'tops',
    pre: 1.2,
    setup(s) {
      emptyRoofs(s);
      s.sol(190, 430, 1);
      const jin = s.w.actor('jin');
      jin.x = 262;
      s.track({ lead: 70, y: 380, zoom: 1.16, sway: 0.006, shiftY: -84, shiftX: 30 });
    },
    play(s) {
      const d = s.d;
      s.run([286, 430], [356, 430], [626, 430], [706, 398], [916, 398]);
      // Jin goes first, the way she does in the chapter.
      void (async () => {
        await d.walk('jin', 288, 112);
        await d.hop('jin', 360, 430, 0.42, 22);
        await d.walk('jin', 628, 112);
        await d.hop('jin', 706, 398, 0.42, 34);
        await d.walk('jin', 880, 112);
      })().catch(ignore);
    },
  },
  {
    name: 'relay',
    at: 11 * BAR,
    dur: BAR,
    chapter: 'lanes',
    setup(s) {
      s.sol(1794, 96, 1);
      s.w.locked = 1;
      s.w.player.pose = 'kneel';
      s.d.cut({ on: 'sol', zoom: 1.75, dx: 12, dy: -6, rack: 0, roll: 0 });
    },
    async play(s) {
      const d = s.d;
      d.drift({ on: 'sol', zoom: 1.9, dx: 12, dy: -6 }, 0.6);
      await d.wait(0.55);
      // It wakes: jump wide over the roofs and let the focus run out to the Spire.
      s.w.signals.relay1 = 1;
      d.sfx('relay');
      d.flash(0.3, 0.8);
      d.shake(0.25);
      s.w.player.pose = null;
      d.cut({ x: 1806, y: 110, zoom: 1.35, rack: 0 });
      d.drift({ x: 1790, y: 135, zoom: 1, rack: -0.7 }, 1.9, 'out');
    },
  },

  // 12 * BAR: card — the warning was sold.

  // ------------------------------------------------------------ the climb
  {
    name: 'crane',
    at: 13 * BAR,
    dur: BAR,
    chapter: 'yards',
    pre: 1.5,
    setup(s) {
      s.sol(2338, 560, 1);
      s.run([2362, 560], [2362, 440], [2396, 440], [2396, 320]);
      s.d.cut({ x: 2440, y: 480, zoom: 1.12, rack: 0, roll: 0 });
    },
    play(s) {
      // She is already on the ladder; the camera leaves her behind on its way up to the boom.
      s.d.drift({ x: 2540, y: 250, zoom: 1, rack: -0.2 }, BAR, 'in');
    },
  },
  {
    name: 'boom',
    at: 14 * BAR,
    dur: BAR,
    chapter: 'yards',
    setup(s) {
      for (const id of ['d1', 'd2']) s.w.drone(id).active = false;
      s.sol(2598, 240, 1);
      s.w.locked = 1;
      s.w.signals.relay3 = 1;
      s.d.cut({ on: 'sol', zoom: 1.6, dx: 10, dy: -8, rack: 0, roll: 0 });
    },
    play(s) {
      // The third relay, out on the end of the boom: pull back until she is a light over the water.
      s.d.flash(0.25, 0.7);
      s.d.sfx('relay');
      s.d.drift({ on: 'sol', zoom: 1.04, dx: 30, dy: -20, rack: -0.35, roll: 0.03 }, BAR, 'out');
    },
  },
  {
    name: 'boxes',
    at: 15 * BAR,
    dur: BAR,
    chapter: 'yards',
    pre: 2.1,
    setup(s) {
      // Up the stacked containers on the floodlit apron, a Listener working the row.
      s.sol(1790, 560, 1);
      s.run([1810, 560], [1856, 500], [1928, 470], [2010, 440], [2084, 440], [2156, 470]);
      s.track({ lead: 34, zoom: 1.34, roll: -0.012, shiftY: -96, shiftX: -40 });
      s.d.mood({ exposure: 0.12 }, 0);
    },
    each(s) {
      // The Listener's lamp is on the stack she is about to jump to.
      const dr = s.w.drone('d2');
      dr.x = s.w.player.cx + 54;
      dr.y = 384;
    },
  },
  {
    name: 'cha',
    at: 16 * BAR,
    dur: BAR,
    chapter: 'yards',
    setup(s) {
      // Close enough that her lamp is the light on his face.
      s.sol(2508, 320, 1);
      s.w.locked = 1;
      const cha = s.w.actor('cha');
      cha.visible = true;
      cha.x = 2584;
      cha.facing = -1;
      s.d.mood({ vignette: 0.14, saturation: -0.1 }, 0);
      s.d.cut({ on: 'cha', zoom: 2.2, dx: -14, dy: -5, roll: -0.03, rack: 0 });
    },
    async play(s) {
      const d = s.d;
      s.w.actor('cha').talking = 1.2;
      d.drift({ on: 'cha', zoom: 2.4, dx: -14, dy: -5 }, HALF, 'linear');
      await d.wait(HALF);
      // Reverse shot, tipped the other way.
      d.cut({ on: 'sol', zoom: 2.2, dx: 14, dy: -5, roll: 0.03 });
      d.drift({ on: 'sol', zoom: 2.4, dx: 14, dy: -5 }, HALF, 'linear');
    },
  },
  {
    name: 'warden',
    at: 17 * BAR,
    dur: 2 * BAR,
    chapter: 'tops',
    pre: 1,
    setup(s) {
      emptyRoofs(s);
      s.w.actor('jin').visible = false;
      s.w.signals.relay2 = 1;
      s.w.heat = 1;
      s.d.mood(COLD, 0);
      s.sol(2400, 406, 1);
      s.w.drone('sweeper').active = true;
      s.run([2636, 406], [2694, 406], [2956, 406], [3004, 374], [3256, 374], [3304, 394], [3500, 394]);
      s.track({ lead: -30, y: 352, zoom: 1.12, sway: 0.02, shiftY: -70 });
    },
    async play(s) {
      s.d.sfx('caught', 0.5);
      await s.d.wait(3.2);
      // A breath of slow motion as she takes the last gap.
      await s.d.slowmo(0.3, 0.5);
    },
    each(s) {
      // The big light stays on her heels however fast she runs.
      const sw = s.w.drone('sweeper');
      sw.x = s.w.player.cx - 128 + Math.min(70, Math.max(0, s.t) * 15);
      sw.y = 236;
      sw.sus = 0.8;
    },
  },
  {
    name: 'skyline',
    at: 19 * BAR,
    dur: BAR,
    chapter: 'tops',
    setup(s) {
      emptyRoofs(s);
      s.w.actor('jin').visible = false;
      s.w.signals.relay2 = 1;
      s.sol(2244, 306, 1);
      s.w.locked = 1;
      // The whole city, sharp, with the tower she has just woken soft in front of it.
      s.d.cut({ x: 2120, y: 214, zoom: 1.1, rack: -1, roll: 0 });
    },
    play(s) {
      s.d.drift({ x: 2300, y: 226, zoom: 1 }, BAR, 'linear');
    },
  },

  // -------------------------------------------------------------- montage
  {
    name: 'tower',
    at: 20 * BAR,
    dur: HALF,
    chapter: 'spire',
    setup(s) {
      s.sol(150, 2340, 1);
      s.w.locked = 1;
      s.d.cut({ x: 320, y: 2200, zoom: 1, roll: 0.035, rack: 0 });
    },
    play(s) {
      s.strike();
      s.d.drift({ x: 320, y: 1950, zoom: 1.06, roll: 0.02 }, HALF, 'in');
    },
  },
  {
    name: 'rungs',
    at: 20 * BAR + HALF,
    dur: HALF,
    chapter: 'spire',
    pre: 0.7,
    setup(s) {
      s.sol(232, 2340, 1);
      s.run([232, 2260], [414, 2260], [414, 2180]);
      s.d.cut({ on: 'sol', zoom: 1.7, dx: 0, dy: -12, roll: -0.04, rack: 0 });
    },
  },
  {
    name: 'scan',
    at: 21 * BAR,
    dur: HALF,
    chapter: 'spire',
    setup(s) {
      // Behind a shield plate while a Warden's light rakes the floor.
      s.sol(226, 1420, 1);
      s.pad.set('down', true);
      s.d.mood(COLD, 0);
      s.d.cut({ x: 300, y: 1392, zoom: 1.22, roll: -0.03, rack: 0 });
    },
    play(s) {
      s.w.drone('d1').reset(120, 1436);
      s.d.drift({ zoom: 1.32 }, HALF, 'linear');
    },
  },
  {
    name: 'sprint',
    at: 21 * BAR + HALF,
    dur: HALF,
    chapter: 'lanes',
    pre: 0.8,
    setup(s) {
      s.sol(1900, 214, 1);
      s.w.heat = 1;
      s.w.drone('d2').active = true;
      s.d.mood(COLD, 0);
      s.run([2196, 214]);
      s.track({ lead: 44, y: 150, zoom: 1.28, sway: 0.018 });
    },
    each(s) {
      // The Listener has her: its lamp goes red and it keeps pace.
      const dr = s.w.drone('d2');
      dr.x = s.w.player.cx - 34;
      dr.y = 108;
      dr.sus = 0.8;
    },
  },

  // The quay: Meridian stops sending lamps and sends rifles.
  {
    name: 'gun',
    at: 22 * BAR,
    dur: HALF,
    chapter: 'quay',
    setup(s) {
      const c = armed(s);
      c.armed = false;
      s.sol(PEDESTAL_X + 28, QUAY, -1);
      s.w.locked = 1;
      s.w.actor('gil').talking = 1.2;
      s.d.mood(FIGHT, 0);
      s.d.cut({ on: ['sol', 'gil'], zoom: 1.95, dx: 0, dy: -8, roll: 0, rack: 0, shiftX: -50, shiftY: -30 });
    },
    async play(s) {
      const d = s.d;
      d.drift({ on: ['sol', 'gil'], zoom: 2.15, dy: -8, shiftX: 30 }, HALF, 'linear');
      // Thirty years of rivets; tonight it is a gun.
      await d.wait(0.5);
      s.w.combat!.armed = true;
      d.sfx('recharge');
    },
  },
  {
    name: 'ashore',
    at: 22 * BAR + HALF,
    dur: HALF,
    chapter: 'quay',
    pre: 1.6,
    setup(s) {
      const c = armed(s);
      c.spawn([
        { id: 'a', x: LAUNCH_X - 10, y: QUAY, posts: [POST.c] },
        { id: 'b', x: LAUNCH_X + 34, y: QUAY, posts: [POST.d] },
        { id: 's', kind: 'shield', x: LAUNCH_X - 60, y: QUAY, posts: [POST.a] },
      ]);
      s.sol(PEDESTAL_X + 28, QUAY, 1);
      s.w.locked = 1;
      s.d.mood(FIGHT, 0);
      // From low on the deck: they come on over the lens, the launch and the channel behind them.
      s.d.cut({ x: LAUNCH_X - 150, y: QUAY - 44, zoom: 1.5, roll: -0.03, rack: 0, shiftX: 70, shiftY: 26 });
    },
    play(s) {
      s.d.drift({ x: LAUNCH_X - 200, y: QUAY - 46, zoom: 1.6, roll: -0.012, shiftX: 20 }, HALF, 'linear');
    },
  },
  {
    name: 'cover',
    at: 23 * BAR,
    dur: BAR,
    chapter: 'quay',
    pre: 4.9,
    setup(s) {
      const c = armed(s);
      posted(c, [{ id: 'a', at: POST.a }, { id: 'c', at: POST.c }, { id: 'd', at: POST.d }, { id: 'b', at: POST.b2 }]);
      s.sol(HOLD_X, QUAY, 1);
      s.pad.set('down', true);
      s.w.heat = 0.4;
      s.d.mood(FIGHT, 0);
      // Down the length of the apron, the black channel beyond it.
      s.d.cut({ x: 566, y: QUAY - 58, zoom: 1.3, roll: 0.012, rack: 0, shiftX: -70, shiftY: -84 });
    },
    play(s) {
      s.d.drift({ x: 580, y: QUAY - 58, zoom: 1.4, roll: -0.006, shiftX: 40, shiftY: -60 }, BAR, 'linear');
    },
    each(s) {
      // Small while they shoot; then up over the barrier to answer it.
      const up = fire(s, 0.7, 1.9);
      s.pad.set('down', !up);
      s.pad.set('fire', up);
    },
  },
  {
    name: 'enforcer',
    at: 24 * BAR,
    dur: HALF,
    chapter: 'quay',
    pre: 0.8,
    setup(s) {
      const c = armed(s);
      posted(c, [{ id: 'c', at: POST.c }]);
      s.sol(HOLD_X, QUAY, 1);
      s.pad.set('down', true);
      s.d.mood(FIGHT, 0);
      // One of them: up over its cover, the red line, the burst.
      s.d.cut({ x: POST.c - 30, y: QUAY - 26, zoom: 2.5, roll: -0.02, rack: 0, shiftX: 40, shiftY: -16 });
    },
    play(s) {
      s.d.drift({ x: POST.c - 44, y: QUAY - 26, zoom: 2.2, roll: 0, shiftX: -20 }, HALF, 'out');
    },
  },
  {
    name: 'shield',
    at: 24 * BAR + HALF,
    dur: HALF,
    chapter: 'quay',
    pre: 2.1,
    setup(s) {
      const c = armed(s);
      c.spawn([{ id: 's', kind: 'shield', x: 700, y: QUAY, posts: [610, 560] }]);
      posted(c, [{ id: 'd', at: POST.d }]);
      s.sol(HOLD_X + 40, QUAY, 1);
      s.w.heat = 0.4;
      s.d.mood(FIGHT, 0);
      // The big one walks in behind its own wall, and her rivets go off it.
      s.d.cut({ x: 540, y: QUAY - 50, zoom: 1.62, roll: -0.014, rack: 0, shiftX: 30, shiftY: -40 });
    },
    play(s) {
      s.d.drift({ x: 526, y: QUAY - 50, zoom: 1.72, shiftX: -20 }, HALF, 'linear');
    },
    each(s) {
      s.pad.set('fire', fire(s, -2, 1.2));
    },
  },
  {
    name: 'drop',
    at: 25 * BAR,
    dur: BAR,
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
      s.sol(HOLD_X + 46, QUAY, 1);
      s.w.heat = 0.4;
      s.d.mood(FIGHT, 0);
      // Three of them dug in under Gil's box, and the one thing holding it up.
      s.d.cut({ x: 552, y: QUAY - 70, zoom: 1.36, roll: 0.01, rack: 0, shiftX: -30, shiftY: -24 });
    },
    async play(s) {
      const d = s.d;
      const c = s.w.combat!;
      const latch = c.marks[0]!;
      d.drift({ x: 566, y: QUAY - 62, zoom: 1.56, shiftX: 20 }, BAR, 'out');
      // Hold on the three of them long enough to count them, then the one rivet.
      await d.wait(0.85);
      s.pad.tap('fire');
      while (!latch.gone) await d.wait(0.02);
      c.drop(s.w, HANG.id);
      // The fall, stretched.
      await d.slowmo(0.35, 0.45);
    },
  },

  // ------------------------------------------------- the tide (bars 26-29)
  {
    name: 'rise',
    at: 26 * BAR,
    dur: 2 * BAR,
    chapter: 'tide',
    pre: 2.4,
    setup(s) {
      const c = armed(s);
      const k = new Kaiju(ARENA);
      c.kaiju = k;
      s.sol(1010, QUAY, 1);
      s.w.locked = 1;
      s.d.mood(STORM, 0);
      k.surface();
      // Looking down on the black channel from the quay's edge.
      s.d.cut({ x: 1070, y: QUAY - 104, zoom: 1.12, rack: -0.6, roll: -0.01, shiftX: -50, shiftY: -96 });
    },
    play(s) {
      s.d.sfx('call');
      s.d.shake(0.35);
      // The lens tips back as it comes up, and keeps tipping: the horizon drops out from under it.
      s.d.drift({ x: 1090, y: QUAY - 92, zoom: 1, rack: -0.75, roll: 0.012, shiftX: 30, shiftY: 84 }, 2 * BAR, 'inOut');
    },
    each(s, t) {
      if (t > 3.55 && t < 3.6) s.strike();
    },
  },
  {
    name: 'slam',
    at: 28 * BAR,
    dur: HALF,
    chapter: 'tide',
    pre: 2.3,
    setup(s) {
      risen(s, 1);
      s.sol(760, QUAY, 1);
      s.d.cut({ x: 800, y: QUAY - 66, zoom: 1.08, rack: 0, roll: 0.014, shiftX: 0, shiftY: 30 });
    },
    play(s) {
      // She has stood her ground a moment too long: out from under it as the arm comes down.
      s.run([852, QUAY]);
      s.d.drift({ x: 816, y: QUAY - 66, zoom: 1.12, roll: -0.01 }, HALF, 'linear');
    },
  },
  {
    name: 'barb',
    at: 28 * BAR + HALF,
    dur: HALF,
    chapter: 'tide',
    pre: 3.6,
    setup(s) {
      risen(s, 1);
      s.sol(800, QUAY, 1);
      s.d.cut({ x: 780, y: QUAY - 60, zoom: 1.3, rack: 0, roll: -0.012, shiftX: 0, shiftY: 10 });
    },
    play(s) {
      // The limb is planted where she was standing: the barb in its wrist, and a rivet gun.
      s.sol(728, QUAY, 1);
      s.d.cut({ x: 772, y: QUAY - 62, zoom: 1.36, rack: 0, roll: -0.012, shiftX: -30, shiftY: 10 });
      s.d.drift({ x: 778, y: QUAY - 66, zoom: 1.5, shiftX: 20 }, HALF, 'out');
    },
    each(s) {
      s.pad.set('fire', fire(s, 0.15, 0.25) || fire(s, 0.6, 0.7) || fire(s, 1.0, 1.1));
    },
  },
  {
    name: 'floods',
    at: 29 * BAR,
    dur: BAR,
    chapter: 'tide',
    setup(s) {
      risen(s);
      s.sol(FLOOD_X + 14, QUAY, 1);
      s.w.locked = 1;
      s.d.cut({ x: 1040, y: QUAY - 96, zoom: 1, rack: -0.8, roll: -0.02, shiftX: -30, shiftY: 70 });
    },
    async play(s) {
      const d = s.d;
      const k = s.w.combat!.kaiju!;
      d.drift({ x: 1070, y: QUAY - 100, zoom: 1.06, roll: 0.01, shiftX: 20, shiftY: 90 }, BAR, 'out');
      await d.wait(0.3);
      // Every lamp on the quay, turned on it.
      s.w.signals.floods = 1;
      k.floods = true;
      d.sfx('floods');
      d.flash(0.3, 0.5);
      await d.wait(0.5);
      k.rearUp(s.w);
      d.shake(0.6);
      await d.wait(1.0);
      // ...and the picture burns out to white.
      void d.fade(1, 0.6, [1, 1, 1]);
    },
  },

  // ---------------------------------------------------------------- break
  {
    name: 'above',
    at: 30 * BAR,
    dur: 2 * BAR,
    chapter: 'spire',
    setup(s) {
      clearSky(s);
      s.sol(286, 580, 1);
      s.w.locked = 1;
      s.d.cine.fade = [1, 1, 1, 1];
      s.d.cut({ x: 320, y: 300, zoom: 1, rack: -1, roll: 0 });
    },
    play(s) {
      void s.d.fade(0, 1.2, [1, 1, 1]);
      // Out of the white: the sky she has climbed into, and then, far below it, her.
      s.d.drift({ x: 310, y: 512, zoom: 1.12, rack: 0 }, 2 * BAR, 'inOut');
    },
  },

  // --------------------------------------------------------------- finale
  {
    name: 'wake',
    at: 32 * BAR,
    dur: BAR,
    chapter: 'spire',
    setup(s) {
      clearSky(s);
      s.sol(282, 420, -1);
      s.w.locked = 1;
      s.w.player.pose = 'kneel';
      s.d.cut({ x: 320, y: 330, zoom: 1, rack: 0, roll: 0 });
    },
    play(s) {
      const d = s.d;
      // The transmitter comes alive on the downbeat, and the camera goes up the mast with the rings.
      s.w.signals.main = 1;
      s.w.player.pose = null;
      d.sfx('relay');
      d.sfx('lock');
      d.flash(0.6, 1);
      d.shake(0.5);
      d.mood(WARM, 0.6);
      d.drift({ x: 320, y: 140, zoom: 1.06 }, BAR, 'out');
    },
  },
  {
    name: 'onair',
    at: 33 * BAR,
    dur: BAR,
    chapter: 'spire',
    setup(s) {
      clearSky(s);
      s.w.signals.main = 1;
      s.sol(346, 420, 1);
      s.w.locked = 1;
      s.w.player.pose = 'talk';
      s.d.mood(WARM, 0);
      s.d.cut({ on: 'sol', zoom: 1.7, dx: 6, dy: -6, roll: 0, rack: 0 });
    },
    play(s) {
      s.d.drift({ on: 'sol', zoom: 2.2, dx: 6, dy: -6 }, BAR, 'linear');
    },
  },
  {
    name: 'morning',
    at: 34 * BAR,
    dur: BAR,
    chapter: 'dawn',
    setup(s) {
      s.w.walkOnly = true;
      s.sol(2540, 214, -1);
      s.w.locked = 1;
      s.d.cut({ x: 2290, y: 160, zoom: 1.1, rack: -0.6, roll: 0, shiftX: -80, shiftY: -170 });
    },
    play(s) {
      // First light, tracking level down the street she warned.
      void s.d.walk('sol', 2400, 30).catch(ignore);
      s.d.drift({ x: 2420, y: 168, zoom: 1.15, rack: 0, shiftX: 0, shiftY: -40 }, BAR, 'linear');
    },
  },
  {
    name: 'mun',
    at: 35 * BAR,
    dur: BAR,
    chapter: 'dawn',
    setup(s) {
      // The voice, with a face at last.
      s.sol(1284, 214, -1);
      s.w.locked = 1;
      s.d.cut({ on: ['sol', 'mun'], fit: true, dx: 0, dy: -8, roll: 0, rack: 0, shiftX: 60, shiftY: -40 });
    },
    play(s) {
      s.w.actor('mun').talking = 1.5;
      s.d.drift({ on: ['sol', 'mun'], zoom: 2.05, dy: -6, shiftX: -60 }, BAR, 'linear');
    },
  },

  // 36 * BAR: logo.
];

const titles: Title[] = [
  { at: 0.7, dur: 3.3, kind: 'caption', who: 'mun', text: 'This is Radio Magpie. Is anybody still listening?' },
  { at: 5.4, dur: 4.3, kind: 'stamp', text: 'SALTGATE', sub: 'THE NIGHT OF THE SURGE' },
  {
    at: 8 * BAR,
    dur: BAR,
    kind: 'card',
    kicker: 'MERIDIAN ASSURE',
    tint: '#ff8a7a',
    lines: ['STORM SURGE ALERT'],
    foot: 'DELIVERED TO PREMIUM MEMBERS ONLY',
    glitch: true,
  },
  { at: 12 * BAR, dur: BAR, kind: 'card', lines: ['THE WARNING', 'WAS SOLD.'] },
  { at: 16 * BAR + 0.1, dur: 2.3, kind: 'caption', who: 'cha', text: 'Stop there. Spectrum Authority.' },
  { at: 19 * BAR + 0.1, dur: 2.35, kind: 'card', lines: ['FOUR DEAD RELAYS.', 'ONE NIGHT.'], dim: 0.42 },
  { at: 22 * BAR + 0.1, dur: 2.3, kind: 'caption', who: 'gil', text: 'Thirty years of rivets. Tonight it is a gun.' },
  { at: 26 * BAR + 0.6, dur: 1.7, kind: 'caption', who: 'sol', text: 'Gil. What is that.' },
  { at: 27 * BAR + 0.3, dur: 2.1, kind: 'caption', who: 'gil_radio', text: 'That is no surge. That is the Undertow.' },
  { at: 30 * BAR + 0.6, dur: 2.5, kind: 'caption', who: 'mun', text: "They cut my carrier at Marrow Lane. I never got to the P's." },
  { at: 30 * BAR + 3.3, dur: 1.6, kind: 'caption', who: 'sol', text: '...Pier Street.' },
  { at: 33 * BAR + 0.1, dur: 2.3, kind: 'caption', who: 'sol', text: 'This is the open band. This is not a test.' },
  {
    at: 36 * BAR,
    dur: 2 * BAR,
    kind: 'logo',
    tag: 'THE WARNING WAS SOLD.  SEND IT ANYWAY.',
    foot: 'A CINEMATIC PIXEL-ART PLATFORMER',
  },
];

// The montage is cut to the kick drum: each of its takes arrives with a flicker of light.
for (const t of takes) if (t.at >= 20 * BAR && t.at < 26 * BAR) t.punch = 0.2;

export const FILM: Film = { duration: 38 * BAR, takes, titles };
