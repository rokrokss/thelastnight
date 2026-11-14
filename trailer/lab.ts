import type { Take } from './film';

/**
 * Throwaway set-ups for looking at one thing: a place, a lens, a light. Not
 * part of the trailer. Render with
 *   npm run trailer -- --sheet --only=<names> [--cell=960]
 */
export const LAB: Take[] = [
  {
    name: 'lab-regular',
    at: 1000,
    dur: 5,
    chapter: 'lanes',
    pre: 2,
    setup(s) {
      s.sol(1254, 214, -1);
      s.w.locked = 1;
      s.w.player.pose = 'sit';
      s.d.cut({ x: 1210, y: 196, zoom: 3.1, rack: 0, roll: 0, shiftX: -70, shiftY: -36 });
    },
    play(s) {
      s.w.actor('baek').talking = 2;
      s.d.drift({ x: 1232, y: 188, zoom: 2.05, shiftX: 60, shiftY: -44 }, 5, 'linear');
    },
  },
  {
    name: 'lab-lanes',
    at: 1000,
    dur: 4,
    chapter: 'lanes',
    setup(s) {
      s.sol(1180, 214, 1);
      // Bring the passers-by into shot.
      for (const [id, x] of [['far1', 1150], ['far2', 1330], ['far4', 1480], ['road1', 1290], ['near1', 1230], ['near2', 1420], ['road2', 1380], ['road3', 1190], ['c2', 1160], ['c3', 1330]] as const) s.w.actor(id).x = x;
    },
    play(s) {
      s.run([1420, 214]);
    },
  },
  {
    name: 'lab-lanes-high',
    at: 1000,
    dur: 4,
    chapter: 'lanes',
    setup(s) {
      s.sol(1260, 214, 1);
      s.w.locked = 1;
      s.d.cut({ x: 1260, y: 150, zoom: 1, shiftX: 0, shiftY: -30 });
    },
    play(s) {
      // Tilt the lens down and to one side: floors, roofs and side walls should open up.
      s.d.drift({ x: 1260, y: 170, zoom: 1, shiftX: 130, shiftY: -150 }, 4, 'linear');
    },
  },
  {
    name: 'lab-yards',
    at: 1000,
    dur: 4,
    chapter: 'yards',
    setup(s) {
      s.sol(560, 560, 1);
    },
    play(s) {
      s.run([640, 560], [716, 530], [788, 500]);
    },
  },
  {
    name: 'lab-yards-high',
    at: 1000,
    dur: 4,
    chapter: 'yards',
    setup(s) {
      s.sol(1500, 500, 1);
      s.w.locked = 1;
      s.d.cut({ x: 1500, y: 470, zoom: 1, shiftX: 0, shiftY: -30 });
    },
    play(s) {
      s.d.drift({ x: 1500, y: 490, zoom: 1, shiftX: -140, shiftY: -160 }, 4, 'linear');
    },
  },
  {
    name: 'lab-tops',
    at: 1000,
    dur: 4,
    chapter: 'tops',
    setup(s) {
      for (const id of ['d1', 'd2', 'd3']) s.w.drone(id).active = false;
      s.sol(560, 430, 1);
    },
    play(s) {
      s.run([626, 430], [706, 398], [916, 398]);
    },
  },
  {
    name: 'lab-tops-high',
    at: 1000,
    dur: 4,
    chapter: 'tops',
    setup(s) {
      for (const id of ['d1', 'd2', 'd3']) s.w.drone(id).active = false;
      s.sol(1100, 418, 1);
      s.w.locked = 1;
      s.d.cut({ x: 1150, y: 330, zoom: 1, shiftX: 0, shiftY: -30 });
    },
    play(s) {
      s.d.drift({ x: 1250, y: 360, zoom: 1, shiftX: 120, shiftY: -170 }, 4, 'linear');
    },
  },
  {
    name: 'lab-mast',
    at: 1000,
    dur: 4,
    chapter: 'mast',
    setup(s) {
      s.sol(250, 560, 1);
      s.w.signals.beacon = 1;
    },
    play(s) {
      s.run([392, 560], [392, 480]);
    },
  },
  {
    name: 'lab-spire',
    at: 1000,
    dur: 4,
    chapter: 'spire',
    setup(s) {
      s.sol(300, 2180, 1);
    },
    play(s) {
      s.run([232, 2180], [232, 2100]);
    },
  },
  {
    name: 'lab-spire-top',
    at: 1000,
    dur: 4,
    chapter: 'spire',
    setup(s) {
      const we = s.w.weather;
      we.rain = 0;
      we.storm = false;
      we.fog = 0.12;
      s.sol(300, 580, 1);
      s.w.locked = 1;
      s.d.cut({ x: 320, y: 520, zoom: 1, shiftX: 0, shiftY: -30 });
    },
    play(s) {
      s.d.drift({ x: 320, y: 540, zoom: 1, shiftX: -90, shiftY: -150 }, 4, 'linear');
    },
  },
  {
    name: 'lab-dawn',
    at: 1000,
    dur: 4,
    chapter: 'dawn',
    setup(s) {
      s.sol(1260, 214, 1);
      s.w.locked = 1;
      s.d.cut({ x: 1260, y: 150, zoom: 1, shiftX: 0, shiftY: -30 });
    },
    play(s) {
      s.d.drift({ x: 1260, y: 175, zoom: 1, shiftX: 150, shiftY: -170 }, 4, 'linear');
    },
  },
];
