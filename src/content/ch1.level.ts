import { SHOP } from '../art/buildings';
import { stallSeats } from '../art/paint';
import { LevelBuilder, type LevelData } from '../game/level';

/** Chapter 1 — The Lanes: a night market at street level. */
export function buildLanes(): LevelData {
  const G = 214;
  const W = 3000;
  // The level is 44px taller than the view: the camera rides low, so the road fills the foot of the frame.
  const b = new LevelBuilder('lanes', 'market', W, 314, G, 1107);
  b.solid(-200, G, W + 400, 200, 'street');
  b.solid(-40, -300, 40, 600, 'none');
  b.solid(W, -300, 40, 600, 'none');
  b.spawn(64, G, 1);
  b.weather({ rain: 0.42, wind: 0.14, fog: 0.4 });
  b.camZone({ x: -200, y: -300, w: W + 400, h: 900, lockY: 44 });

  const F = (x: number, w: number, variant: number, text?: string, color?: string, h?: number): void => {
    b.prop('facade', x, G, { w, variant, text, color, h });
  };
  /** A customer on a stool: an id (which is also the look), or [id, look] for one of the named regulars. */
  type Seat = string | [string, string] | null;
  const stall = (x: number, w: number, text: string, color: string, seats: Seat[] = []): void => {
    b.prop('stall', x, G, { w, text, color });
    const [s0, s1] = stallSeats(x, w);
    seats.forEach((seat, i) => {
      if (!seat || i > 1) return;
      const [id, look] = typeof seat === 'string' ? [seat, seat] : seat;
      b.npc({ id, x: (i === 0 ? s0 : s1) + 4, y: G, look, anim: 'sit', facing: i === 0 ? 1 : -1, extra: true });
    });
  };

  // --- Zone A: arrival ---
  F(-16, 150, SHOP.stairs, 'TRAM', 'cyan');
  F(134, 128, SHOP.store, 'MART 24', 'cyan');
  F(262, 100, SHOP.shutter, 'TAILOR', undefined, 150);
  b.prop('lamp', 196, G);
  b.prop('vending', 112, G, { color: 'white' });
  b.prop('bags', 286, G);
  b.prop('bike', 318, G);
  b.walkZone(-40, 0, 330, 270);

  // --- Zone B: first lot ---
  b.prop('fence', 362, G, { w: 398, h: 46 });
  b.prop('lamp', 384, G, { flip: true });
  stall(408, 82, 'FISH CAKE', 'tarpRed', ['c11', ['c12', 'suit_f']]);
  stall(532, 72, 'TEA', 'tarpBlue', [null, ['c13', 'elder_f']]);
  b.prop('bulbs', 398, 150, { w: 220, h: -4, variant: 9, color: 'warm' });
  b.prop('crates', 622, G);
  b.prop('vending', 668, G, { color: 'cyan' });
  b.prop('plant', 700, G);
  b.prop('lamp', 730, G);
  b.npc({ id: 'vendor1', x: 446, y: G, look: 'c21', anim: 'cook', facing: 1, extra: true, behind: true });
  b.npc({ id: 'vendor2', x: 566, y: G, look: 'c22', anim: 'idle', facing: -1, extra: true, behind: true });
  b.npc({ id: 'mime', x: 640, y: G, look: 'mime', facing: -1, prompt: 'Watch' });

  // --- Zone C: arcade row ---
  F(760, 142, SHOP.eatery, 'DUMPLINGS', 'amber');
  F(902, 110, SHOP.arcade, 'ARCADE', 'pink', 150);
  F(1012, 92, SHOP.stairs, 'HOTEL', 'violet');
  b.prop('scooter', 800, G, { front: false });
  b.prop('bin', 886, G);
  b.prop('cone', 1000, G);
  b.npc({ id: 'driver', x: 838, y: G, look: 'driver', anim: 'lean', facing: -1, prompt: 'Talk' });

  // --- Zone D: Baek's lot ---
  b.prop('fence', 1104, G, { w: 380, h: 44 });
  b.prop('lamp', 1126, G);
  // Baek's one regular: a docker off shift, stripped to the waist over his bowl.
  stall(1186, 88, 'NOODLES', 'tarpOrange', [['c14', 'heavy_m'], null]);
  b.prop('bulbs', 1150, 152, { w: 170, h: 2, variant: 8, color: 'warm' });
  b.npc({ id: 'baek', x: 1228, y: G, look: 'baek', anim: 'cook', facing: 1, behind: true, prompt: 'Talk' });
  b.solid(1322, G - 28, 42, 28, 'crate', true);
  b.hide(1364, G - 40, 34, 40);
  b.prop('barrel', 1372, G);
  b.prop('bags', 1392, G);
  b.prop('pallet', 1424, G);
  b.prop('radio', 1262, G - 20, { front: true });

  // --- Zone E: the relay building ---
  F(1484, 236, SHOP.laundry, 'COIN LAUNDRY', 'teal');
  F(1720, 150, SHOP.repair, 'RADIO REPAIR', 'amber', 118);
  b.ladder(1508, 150, G);
  b.oneWay(1496, 150, 224, 'balcony');
  b.ladder(1704, 96, 150);
  b.oneWay(1694, 96, 26, 'catwalk');
  b.oneWay(1720, 96, 150, 'none');
  b.prop('relay', 1806, 96, { text: 'relay1' });
  b.interact('relay1', 1806, 96, 'Tune relay', false, 18);
  b.oneWay(1872, 158, 54, 'awning');
  b.prop('lamp', 1660, G, { flip: true });

  // --- Zone F: the gauntlet ---
  F(1870, 122, SHOP.store, 'PHARMACY', 'green');
  F(1992, 100, SHOP.shutter, 'LOCKSMITH');
  b.prop('fence', 2092, G, { w: 240, h: 44 });
  stall(2118, 80, 'SKEWERS', 'tarpOrange', [['c15', 'swim_m'], ['c16', 'teen_m']]);
  b.npc({ id: 'vendor3', x: 2160, y: G, look: 'c23', anim: 'cook', facing: 1, extra: true, behind: true });
  b.solid(2236, G - 14, 28, 14, 'crate');
  b.oneWay(2278, 166, 62, 'awning');
  b.pickup('tape_lanes', 2310, 150);
  b.prop('lamp', 2066, G);
  b.hide(1992, G - 44, 44, 44);
  b.hide(2196, G - 40, 40, 40);
  b.prop('bin', 2206, G);
  b.drone({ id: 'd1', path: [[1420, 112], [1090, 112]], speed: 34, range: 128, half: 0.36, active: false });
  b.drone({ id: 'd2', path: [[1960, 108], [2420, 108]], speed: 30, range: 128, half: 0.36, sweep: { amp: 0.3, speed: 1.1 }, active: false });

  // --- Zone G: the way up ---
  F(2332, 150, SHOP.eatery, 'HOT SOUP', 'red');
  F(2482, 120, SHOP.blank, 'NO UNLICENSED SOUND', undefined, 150);
  F(2602, 130, SHOP.arcade, 'KARAOKE', 'violet');
  F(2732, 300, SHOP.stairs, 'ROOF', 'green');
  b.prop('lamp', 2460, G);
  b.prop('steps', 2772, G, { w: 34 });
  b.prop('crates', 2700, G);
  b.npc({ id: 'jin', x: 2840, y: G, look: 'jin', anim: 'sit', facing: -1, prompt: 'Talk' });
  b.prop('scooter', 2560, G);

  // Passers-by.
  b.npc({ id: 'c1', x: 180, y: G, look: 'elder_m', patrol: [150, 350], speed: 13, extra: true });
  b.npc({ id: 'c2', x: 900, y: G, look: 'heavy_f', patrol: [770, 1090], speed: 20, extra: true });
  b.npc({ id: 'c3', x: 1560, y: G, look: 'market_f', patrol: [1500, 1700], speed: 20, extra: true });
  b.npc({ id: 'c4', x: 2400, y: G, look: 'teen_f', patrol: [2340, 2700], speed: 26, extra: true });
  b.npc({ id: 'c5', x: 520, y: G, look: 'suit_m', patrol: [380, 740], speed: 24, extra: true });

  // People at other depths: on the far pavement, crossing the road, passing close to the lens.
  b.npc({ id: 'far1', x: 620, y: G, look: 'rain_f', patrol: [300, 1250], speed: 20, extra: true, z: 292 });
  b.npc({ id: 'far2', x: 1520, y: G, look: 'tall_m', patrol: [1180, 2150], speed: 24, extra: true, z: 296 });
  b.npc({ id: 'far3', x: 2300, y: G, look: 'fisher_m', patrol: [1900, 2850], speed: 18, extra: true, z: 290 });
  b.npc({ id: 'far4', x: 1000, y: G, look: 'kid_m', patrol: [700, 1650], speed: 30, extra: true, z: 300 });
  b.npc({ id: 'road1', x: 1350, y: G, look: 'jog_f', patrol: [500, 2300], speed: 62, extra: true, z: -70 });
  b.npc({ id: 'near1', x: 900, y: G, look: 'swim_f', patrol: [150, 1800], speed: 28, extra: true, z: -150 });
  b.npc({ id: 'near2', x: 2050, y: G, look: 'dock_m', patrol: [1300, 2900], speed: 27, extra: true, z: -185 });
  b.npc({ id: 'road2', x: 2250, y: G, look: 'c7', patrol: [1500, 2800], speed: 19, extra: true, z: -52 });
  b.npc({ id: 'road3', x: 700, y: G, look: 'kid_f', patrol: [300, 1400], speed: 34, extra: true, z: -36 });

  // Story hooks.
  b.trigger('vista', 372, 0, 30, 270);
  b.trigger('market', 760, 0, 30, 270);
  b.trigger('baek_near', 1140, 0, 30, 270);
  b.trigger('gauntlet', 1900, 0, 30, 270);
  b.checkpoint('cp_start', 30, 0, 80, 270, 64, G);
  b.checkpoint('cp_baek', 1130, 0, 60, 270, 1150, G);
  b.checkpoint('cp_relay', 1780, 0, 60, 120, 1790, 96);
  b.checkpoint('cp_gauntlet', 1890, 150, 60, 120, 1930, G);
  b.checkpoint('cp_end', 2480, 0, 60, 270, 2500, G);
  return b.build();
}
