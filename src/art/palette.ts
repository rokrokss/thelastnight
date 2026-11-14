import type { Age, Build, HairStyle, PuppetLook } from './puppet';

/**
 * Surface ramps are albedo (dark → light) and get multiplied by scene
 * lighting, so they sit in the mid range and stay fairly neutral.
 * Shadows lean cool, highlights lean warm.
 */
export const RAMP = {
  concrete: ['#3b404e', '#555b6a', '#727988', '#9299a6'],
  plaster: ['#57525f', '#77717e', '#97919d', '#b6b0b8'],
  tile: ['#4a5560', '#667480', '#8696a0', '#a8b6bc'],
  brick: ['#48303a', '#684248', '#885a54', '#a67868'],
  metal: ['#2c323c', '#434b57', '#5d6775', '#7f8997'],
  rust: ['#472b24', '#6c3f28', '#92572e', '#b6793e'],
  wood: ['#3a2924', '#583d30', '#78563e', '#987350'],
  tarpOrange: ['#86320f', '#bd4e19', '#e67429', '#ff9f49'],
  tarpBlue: ['#11334a', '#19506f', '#297397', '#499bbf'],
  tarpRed: ['#5e1620', '#8a2028', '#b83430', '#dc5a44'],
  roofGreen: ['#143a30', '#1d5843', '#2b7a5b', '#499e79'],
  asphalt: ['#13151b', '#1b1f27', '#252a35', '#323947'],
  paving: ['#2c303a', '#3d424e', '#525866', '#6a7180'],
  glass: ['#0d1521', '#152333', '#213549', '#2f4a60'],
  cloth: ['#55606c', '#77848f', '#9aa6ae', '#c0c9cc'],
  container: ['#2a3a4c', '#3a5068', '#4d6886', '#6584a2'],
} as const;

/** Self-lit colours (neon, lamps, screens). */
export const GLOW = {
  pink: '#ff3d9a',
  cyan: '#3df2ff',
  green: '#4dff9a',
  red: '#ff4b3a',
  amber: '#ffb347',
  violet: '#b56bff',
  white: '#e8f4ff',
  warm: '#ffd9a0',
  sodium: '#ffa84e',
  teal: '#49e0d0',
  yellow: '#ffe24a',
  blue: '#5a8cff',
} as const;

export type GlowName = keyof typeof GLOW;

/** Named character designs. */
export const LOOKS: Record<string, PuppetLook> = {
  sol: {
    skin: '#e6b08a',
    hair: '#231c24',
    hairStyle: 'bob',
    top: '#e2782a',
    bottom: '#3b4956',
    shoes: '#1a1c22',
    coat: 2,
    stripe: '#e9eef2',
    pack: 'radio',
    packColor: '#4d6a66',
    headlamp: true,
  },
  // Radio host: long plum coat, glasses, a scarf against the studio draught.
  mun: {
    skin: '#dba27a',
    hair: '#c9c6c2',
    hairStyle: 'bun',
    top: '#7a3f58',
    bottom: '#3a3440',
    shoes: '#241f26',
    gender: 'f',
    coat: 7,
    scarf: '#c8a24a',
    eyewear: 'glasses',
  },
  // Noodle cook: thick-set, sleeves rolled.
  baek: {
    skin: '#c98f6a',
    hair: '#2a2424',
    hairStyle: 'beanie',
    hat: '#b8b2a6',
    top: '#3f5a6a',
    bottom: '#2a2c34',
    shoes: '#1a1a1e',
    build: 'stocky',
    gender: 'm',
    height: 1,
    sleeves: 'short',
    beard: 'stubble',
    apron: '#d8d2c4',
    coat: 3,
  },
  jin: {
    skin: '#f0c4a0',
    hair: '#2a1e1e',
    hairStyle: 'cap',
    hat: '#c8433c',
    top: '#e8c53a',
    bottom: '#33405a',
    shoes: '#d9d4c8',
    age: 'child',
    height: 1,
    coat: 3,
    pack: 'bag',
    packColor: '#3d6a8a',
  },
  // Officer: square and upright.
  cha: {
    skin: '#c98f6a',
    hair: '#1c1a20',
    hairStyle: 'visor',
    hat: '#1c2638',
    top: '#24324a',
    bottom: '#1c2434',
    shoes: '#101216',
    build: 'broad',
    gender: 'm',
    height: 1,
    coat: 2,
    boots: 3,
    armband: '#3df2ff',
  },
  // Old crane driver: wiry, weathered, a working stoop.
  gil: {
    skin: '#a8734f',
    hair: '#8a8884',
    hairStyle: 'elder',
    top: '#5a6a3c',
    bottom: '#34363c',
    shoes: '#1a1a1e',
    age: 'elder',
    gender: 'm',
    stoop: 1.5,
    beard: 'stubble',
    coat: 2,
    boots: 2,
    stripe: '#d8e04a',
  },
  mime: {
    skin: '#f0e8e0',
    hair: '#18161c',
    hairStyle: 'short',
    top: '#e6e2dc',
    bottom: '#18161c',
    shoes: '#18161c',
  },
  // Jin's gran: small and bent, in a long cardigan.
  gran: {
    skin: '#dba27a',
    hair: '#d8d4cc',
    hairStyle: 'bun',
    top: '#5a7a6a',
    bottom: '#3a3a44',
    shoes: '#241f26',
    age: 'elder',
    gender: 'f',
    height: -2,
    coat: 5,
  },
  // Cab driver: a paunch from the seat.
  driver: {
    skin: '#dba27a',
    hair: '#3a3230',
    hairStyle: 'cap',
    hat: '#3a4a3c',
    top: '#6a5a44',
    bottom: '#2a2a30',
    shoes: '#16161a',
    gender: 'm',
    belly: 2,
    beard: 'stubble',
    coat: 2,
  },

  // --- Archetypes: people a level can place by id. ---
  heavy_m: {
    // A deep tan: bare skin has to hold its colour under the stall lamps.
    skin: '#bd8058',
    hair: '#2a2020',
    hairStyle: 'buzz',
    top: '#8a4a3a',
    bottom: '#3a3f4c',
    shoes: '#2a221e',
    build: 'heavy',
    gender: 'm',
    height: 1,
    beard: 'moustache',
    // Off shift and stripped to the waist: the night is hot under the tarps.
    bare: true,
    belly: 5,
    ink: '#2c5866',
  },
  heavy_f: {
    skin: '#c98f6a',
    hair: '#3a2c24',
    hairStyle: 'curly',
    top: '#8a4a6a',
    bottom: '#3a3644',
    shoes: '#2a2228',
    build: 'heavy',
    gender: 'f',
    height: -1,
    skirt: 8,
    carry: 'bag',
    carryColor: '#d8d2c4',
  },
  elder_m: {
    skin: '#e6b08a',
    hair: '#d8d4cc',
    hairStyle: 'flatcap',
    hat: '#5a5448',
    top: '#b08a3a',
    bottom: '#4a4a52',
    shoes: '#2a221e',
    age: 'elder',
    gender: 'm',
    beard: 'full',
    eyewear: 'glasses',
    coat: 3,
    cane: '#7a5a3a',
  },
  elder_f: {
    skin: '#f0c4a0',
    hair: '#b4b0aa',
    hairStyle: 'curly',
    top: '#7a5a8a',
    bottom: '#3a3644',
    shoes: '#5a3a3a',
    age: 'elder',
    gender: 'f',
    height: -1,
    skirt: 10,
    skirtColor: '#5a5468',
    carry: 'bag',
    carryColor: '#c8b88a',
  },
  swim_m: {
    skin: '#c98f6a',
    hair: '#1c1a20',
    hairStyle: 'short',
    top: '#d8d2c4',
    bottom: '#2a6a8a',
    shoes: '#3a3a44',
    gender: 'm',
    belly: 1,
    swim: 'trunks',
    towel: '#e8e2d4',
    sandals: true,
  },
  swim_f: {
    skin: '#e6b08a',
    hair: '#231c24',
    hairStyle: 'swimcap',
    hat: '#f0c83a',
    top: '#2a5a8a',
    bottom: '#2a5a8a',
    shoes: '#b8483c',
    gender: 'f',
    swim: 'onepiece',
    eyewear: 'goggles',
    towel: '#e8e2d4',
    sandals: true,
  },
  tall_m: {
    skin: '#8a5a3c',
    hair: '#1c1a20',
    hairStyle: 'short',
    top: '#3f6a5a',
    bottom: '#4a4a56',
    shoes: '#1a1c22',
    build: 'slim',
    gender: 'm',
    height: 5,
    coat: 2,
    scarf: '#c8a24a',
    eyewear: 'glasses',
    pack: 'satchel',
    packColor: '#6a4a34',
  },
  kid_f: {
    skin: '#f0c4a0',
    hair: '#3a2c24',
    hairStyle: 'pigtails',
    hat: '#f0c83a',
    top: '#c8483c',
    bottom: '#3a5a7a',
    shoes: '#f0c83a',
    age: 'child',
    gender: 'f',
    height: -3,
    coat: 3,
    boots: 2,
  },
  kid_m: {
    skin: '#a8734f',
    hair: '#1c1a20',
    hairStyle: 'buzz',
    top: '#3f8a6a',
    bottom: '#34405a',
    shoes: '#d9d4c8',
    age: 'child',
    gender: 'm',
    height: -2,
    coat: 2,
    hoodDown: true,
  },
  suit_m: {
    skin: '#f0c4a0',
    hair: '#2a2020',
    hairStyle: 'short',
    top: '#46506a',
    bottom: '#46506a',
    shoes: '#14161a',
    gender: 'm',
    coat: 2,
    shirt: '#e8e6e0',
    tie: '#b8433c',
    eyewear: 'glasses',
    carry: 'case',
    carryColor: '#5a4030',
  },
  suit_f: {
    skin: '#a8734f',
    hair: '#1c1a20',
    hairStyle: 'bob',
    top: '#7a4a62',
    bottom: '#3a3644',
    shoes: '#14161a',
    gender: 'f',
    coat: 2,
    shirt: '#e8e6e0',
    skirt: 5,
    pack: 'satchel',
    packColor: '#8a5a3a',
  },
  dock_m: {
    skin: '#c98f6a',
    hair: '#2a2020',
    hairStyle: 'hardhat',
    hat: '#e8c53a',
    top: '#6a6a5a',
    bottom: '#3a5a7a',
    shoes: '#1a1a1e',
    build: 'broad',
    gender: 'm',
    beard: 'full',
    overalls: true,
    boots: 3,
    stripe: '#d8e04a',
  },
  teen_m: {
    skin: '#e6b08a',
    hair: '#3fb8a8',
    hairStyle: 'spiky',
    top: '#5a5a66',
    bottom: '#3a4458',
    shoes: '#e8e6e0',
    age: 'teen',
    build: 'slim',
    gender: 'm',
    coat: 2,
    hoodDown: true,
    headphones: '#e8433c',
    pack: 'bag',
    packColor: '#6a4a8a',
  },
  teen_f: {
    skin: '#dba27a',
    hair: '#231c24',
    hairStyle: 'ponytail',
    top: '#34405a',
    bottom: '#2e2a34',
    shoes: '#e8e6e0',
    age: 'teen',
    build: 'slim',
    gender: 'f',
    coat: 2,
    shirt: '#e8e6e0',
    skirt: 5,
    skirtColor: '#6a6a82',
    pack: 'bag',
    packColor: '#b8483c',
  },
  rain_f: {
    skin: '#e6b08a',
    hair: '#231c24',
    hairStyle: 'hood',
    top: '#e8c53a',
    bottom: '#34405a',
    shoes: '#3a6a5a',
    gender: 'f',
    coat: 8,
    boots: 4,
  },
  jog_f: {
    skin: '#6b4530',
    hair: '#1c1a20',
    hairStyle: 'ponytail',
    top: '#3fb8a8',
    bottom: '#2e3440',
    shoes: '#e8e6e0',
    build: 'slim',
    gender: 'f',
    sleeves: 'short',
    legs: 'shorts',
    headphones: '#f0c83a',
  },
  fisher_m: {
    skin: '#a8734f',
    hair: '#b4b0aa',
    hairStyle: 'brim',
    hat: '#6a7a4a',
    top: '#8a8a4a',
    bottom: '#3a4a44',
    shoes: '#2a3a34',
    build: 'stocky',
    gender: 'm',
    beard: 'full',
    coat: 7,
    boots: 4,
    carry: 'case',
    carryColor: '#c8d4d8',
  },
  market_f: {
    skin: '#dba27a',
    hair: '#2a2020',
    hairStyle: 'curly',
    top: '#a8486a',
    bottom: '#54466a',
    shoes: '#2a2228',
    build: 'stocky',
    gender: 'f',
    coat: 3,
    scarf: '#3f8a8a',
    carry: 'bag',
    carryColor: '#e8e2d4',
  },
};

// Light to dark.
const SKIN = ['#f3d2b6', '#f0c4a0', '#e6b08a', '#dba27a', '#c98f6a', '#a8734f', '#8a5a3c', '#6b4530'];
// Black through brown and auburn to blond; the darkest skins keep to the first three.
const HAIRS = ['#1c1a20', '#2a2020', '#3a2c24', '#52463c', '#6a3a24', '#8a4a2a', '#b8935a'];
const GREYS = ['#8a8680', '#b4b0aa', '#d8d4cc'];
const DYES = ['#3fb8a8', '#d86a9a', '#8a6ad0', '#e0d49a'];
const TOPS = ['#4a5a78', '#6a4a5a', '#3f6a5a', '#7a6a4a', '#5a5a66', '#8a4a3a', '#3a4a5a', '#6a6a82', '#445046'];
const BRIGHTS = ['#b8483c', '#c89a3a', '#2f7a7a', '#6a9ac8', '#c86a7a', '#d8d2c4', '#7a8a3c', '#8a5a9a'];
const BOTTOMS = ['#343a48', '#3a3644', '#34485a', '#44403a', '#3a3a4a', '#3a5a7a', '#5a5e68', '#6a5a44'];
const SKIRTS = ['#6a6a82', '#7a4a5a', '#4a6a8a', '#8a7a5a', '#5a7a6a', '#a8483c'];
const COATS = ['#6a5644', '#4a5a72', '#7a6a50', '#5a5a66', '#7a3f48', '#3f6a54', '#8a7a5a'];
const TRUNKS = ['#2a6a8a', '#b8483c', '#2f7a7a', '#c89a3a', '#4a5a8a'];
const SUITS = ['#46506a', '#56566a', '#3a586a', '#62524a'];
const SLICKERS = ['#e8c53a', '#c8433c', '#3f8ab8', '#d8e0e0'];
const TOWELS = ['#e8e2d4', '#e8c53a', '#7ac0d8', '#a8d8b8'];
const SHOES = ['#18181c', '#2a221e', '#4a3428', '#d9d4c8'];
const UMBRELLAS = ['#c8433c', '#2a6a8a', '#d8c84a', '#3a3a44', '#7a4a8a', '#3f7a5a'];

/** How people of each kind wear their hair, before a hat or a hood says otherwise. */
const STYLES: Record<'f' | 'm', Record<Age, readonly HairStyle[]>> = {
  f: {
    child: ['pigtails', 'bob', 'ponytail'],
    teen: ['ponytail', 'bob', 'long', 'braid', 'curly'],
    adult: ['bob', 'long', 'bun', 'ponytail', 'braid', 'curly', 'afro', 'headscarf'],
    elder: ['bun', 'curly', 'headscarf', 'bob'],
  },
  m: {
    child: ['short', 'cap', 'buzz', 'spiky'],
    teen: ['spiky', 'short', 'cap', 'beanie', 'curly', 'buzz'],
    adult: ['short', 'buzz', 'cap', 'beanie', 'curly', 'spiky', 'bald', 'topknot', 'afro'],
    elder: ['balding', 'bald', 'elder', 'flatcap', 'short'],
  },
};

type Outfit = 'jacket' | 'coat' | 'knit' | 'hoodie' | 'dress' | 'skirt' | 'suit' | 'work' | 'rain' | 'apron' | 'sport' | 'swim';
type Cast = readonly [age: Age, build: Build, gender: 'f' | 'm', outfit: Outfit];

/**
 * Who is in the crowd. One pass through this list is 24 different people, so
 * c1..c24 never repeat a type. The market walks c1..c9 down the street (they
 * are the ones with umbrellas) and stands c21..c23 behind stall counters,
 * hence the aprons there.
 */
const CROWD: readonly Cast[] = [
  ['adult', 'heavy', 'm', 'jacket'],
  ['adult', 'slim', 'f', 'coat'],
  ['elder', 'average', 'm', 'knit'],
  ['teen', 'slim', 'm', 'hoodie'],
  ['adult', 'average', 'f', 'dress'],
  ['adult', 'slim', 'm', 'coat'],
  ['elder', 'average', 'f', 'knit'],
  ['child', 'average', 'f', 'rain'],
  ['adult', 'average', 'm', 'suit'],
  ['adult', 'heavy', 'f', 'dress'],
  ['adult', 'broad', 'm', 'jacket'],
  ['adult', 'average', 'f', 'skirt'],
  ['adult', 'slim', 'm', 'hoodie'],
  ['adult', 'stocky', 'f', 'knit'],
  ['adult', 'broad', 'm', 'work'],
  ['adult', 'slim', 'f', 'sport'],
  ['child', 'average', 'm', 'jacket'],
  ['elder', 'slim', 'f', 'coat'],
  ['adult', 'average', 'm', 'swim'],
  ['teen', 'average', 'f', 'skirt'],
  ['adult', 'stocky', 'm', 'apron'],
  ['adult', 'heavy', 'f', 'apron'],
  ['elder', 'slim', 'm', 'apron'],
  ['adult', 'average', 'f', 'swim'],
];

/** Deterministic background citizen. */
export function citizen(n: number): PuppetLook {
  const h = (k: number): number => {
    let x = Math.imul(n * 31 + k * 17 + 7, 2654435761) >>> 0;
    x ^= x >>> 15;
    return (Math.imul(x, 2246822519) >>> 0) / 4294967296;
  };
  const pick = <T>(list: readonly T[], k: number): T => list[Math.floor(h(k) * list.length)]!;
  const m = CROWD.length;
  const i = Math.floor(n) - 1;
  // Each later pass through the list starts somewhere else, so c25.. are not c1.. recoloured in order.
  const [age, build, gender, outfit] = CROWD[(((i + Math.floor(i / m) * 7) % m) + m) % m]!;
  const fem = gender === 'f';
  const grown = age === 'adult' || age === 'elder';

  const skin = Math.floor(h(2) * SKIN.length);
  const look: PuppetLook = {
    skin: SKIN[skin]!,
    hair: age === 'elder' ? pick(GREYS, 3) : age === 'teen' && h(11) < 0.4 ? pick(DYES, 3) : pick(skin > 5 ? HAIRS.slice(0, 3) : HAIRS, 3),
    hairStyle: pick(STYLES[gender][age], 1),
    hat: pick(grown ? TOPS : BRIGHTS, 4),
    top: pick(TOPS, 5),
    bottom: pick(BOTTOMS, 6),
    shoes: pick(SHOES, 12),
    age,
    build,
    gender,
    // A couple of pixels either way; lanky men are the tall end of the crowd.
    height: Math.round(h(10) * 4) - 2 + (fem ? -1 : 0) + (build === 'slim' && grown && !fem ? 2 : 0),
  };
  if (!fem && grown && h(13) < 0.4) look.beard = pick(['stubble', 'moustache', 'full'] as const, 14);
  if (outfit !== 'swim') {
    if (h(15) < 0.18) look.eyewear = 'glasses';
    if (age !== 'child' && h(42) < 0.12) look.mask = pick(['#e8eef2', '#9fc4d8', '#d8c8e0'] as const, 17);
  }
  // Not behind a counter: a cook needs both hands.
  if (age === 'elder' && outfit !== 'apron' && h(18) < 0.6) look.cane = pick(['#7a5a3a', '#4a3a30', '#8a8a92'] as const, 19);

  switch (outfit) {
    case 'jacket':
      look.coat = 2 + Math.floor(h(7) * 2);
      if (h(20) < 0.3) look.top = pick(BRIGHTS, 5);
      if (age === 'child') look.pack = 'bag';
      else if (h(21) < 0.3) look.scarf = pick(BRIGHTS, 22);
      break;
    case 'coat':
      look.top = pick(COATS, 5);
      look.coat = 7 + Math.floor(h(7) * 3);
      if (h(21) < 0.5) look.scarf = pick(BRIGHTS, 22);
      if (h(23) < 0.3) look.pack = 'satchel';
      break;
    case 'knit':
      // Cardigan; on women over a long skirt as often as not.
      look.top = pick(BRIGHTS, 5);
      look.coat = 3;
      if (fem && h(20) < 0.6) {
        look.skirt = 9 + Math.floor(h(7) * 3);
        look.skirtColor = pick(SKIRTS, 6);
      }
      if (!look.cane && h(23) < 0.6) look.carry = 'bag';
      break;
    case 'hoodie':
      look.coat = 2;
      look.shoes = '#d9d4c8';
      if (h(20) < 0.4) look.hairStyle = 'hood';
      else look.hoodDown = true;
      if (h(23) < 0.6) look.pack = 'bag';
      break;
    case 'dress':
      look.top = pick(BRIGHTS, 5);
      look.skirt = 6 + Math.floor(h(7) * 4);
      if (h(20) < 0.4) look.legs = 'bare';
      if (h(21) < 0.3) look.sleeves = 'short';
      if (h(23) < 0.5) look.carry = 'bag';
      break;
    case 'skirt':
      look.top = pick(h(20) < 0.5 ? BRIGHTS : TOPS, 5);
      look.skirt = 5 + Math.floor(h(7) * 3);
      look.skirtColor = pick(SKIRTS, 6);
      look.bottom = '#3a3644';
      if (age === 'teen') look.pack = 'bag';
      else if (h(23) < 0.5) look.pack = 'satchel';
      break;
    case 'suit':
      look.top = pick(SUITS, 5);
      look.bottom = look.top;
      look.shoes = '#14161a';
      look.coat = 2;
      look.shirt = '#e8e6e0';
      if (fem) look.skirt = 5;
      else look.tie = pick(BRIGHTS, 22);
      if (h(23) < 0.7) look.carry = 'case';
      break;
    case 'work':
      look.bottom = pick(['#3a5a7a', '#5a6a3c', '#4a5a66'] as const, 6);
      look.overalls = true;
      look.hairStyle = h(20) < 0.7 ? 'hardhat' : 'beanie';
      look.hat = pick(['#e8c53a', '#e0e0d8', '#d85a3a'] as const, 4);
      look.stripe = '#d8e04a';
      look.boots = 3;
      look.shoes = '#1a1a1e';
      break;
    case 'rain':
      look.top = pick(SLICKERS, 5);
      look.coat = age === 'child' ? 6 : 8;
      look.hairStyle = 'hood';
      look.boots = age === 'child' ? 2 : 4;
      look.shoes = pick(['#3a6a5a', '#c8433c', '#2a3a5a', '#e8c53a'] as const, 12);
      break;
    case 'apron':
      look.apron = pick(['#d8d2c4', '#c8b8a0', '#b84a3a', '#3f6a6a'] as const, 22);
      look.coat = 3;
      if (h(20) < 0.6) look.sleeves = 'short';
      if (age !== 'elder') look.hairStyle = fem ? pick(['bun', 'curly', 'headscarf'] as const, 1) : pick(['beanie', 'buzz', 'cap'] as const, 1);
      look.hat = pick(['#d8d2c4', '#b8b2a6', '#b84a3a'] as const, 4);
      break;
    case 'sport':
      look.top = pick(BRIGHTS, 5);
      look.sleeves = 'short';
      look.legs = 'shorts';
      look.shoes = '#e8e6e0';
      look.hairStyle = fem ? 'ponytail' : pick(['buzz', 'short', 'cap'] as const, 1);
      break;
    case 'swim': {
      // Back from the bathhouse: towel round the neck, or wrapped round the waist.
      const towel = pick(TOWELS, 22);
      look.sandals = true;
      look.shoes = pick(['#3a3a44', '#b8483c', '#2a6a8a'] as const, 12);
      if (fem) {
        look.swim = 'onepiece';
        look.top = pick(['#2a5a8a', '#b8483c', '#2f7a7a', '#34405a'] as const, 5);
        if (h(20) < 0.6) {
          look.hairStyle = 'swimcap';
          look.hat = pick(['#e8e6e0', '#f0c83a', '#d86a9a'] as const, 4);
          look.eyewear = 'goggles';
        }
        if (h(21) < 0.5) {
          look.skirt = 5;
          look.skirtColor = towel;
        } else look.towel = towel;
      } else {
        look.swim = 'trunks';
        look.bottom = pick(TRUNKS, 6);
        look.towel = towel;
      }
      break;
    }
  }

  // Headphones for the young, the runners and the hooded.
  if ((age === 'teen' || outfit === 'sport' || look.hoodDown) && look.hairStyle !== 'hood' && h(24) < 0.7) {
    look.headphones = pick(['#e8433c', '#3fb8a8', '#c89a3a', '#2a2e36'] as const, 25);
  }
  // Rain gear, swimmers and workers go without an umbrella.
  if (h(8) < 0.45 && outfit !== 'rain' && outfit !== 'swim' && outfit !== 'work' && look.hairStyle !== 'hood') {
    look.umbrella = pick(UMBRELLAS, 9);
  }
  return look;
}

const lookCache = new Map<string, PuppetLook>();

export function lookFor(id: string): PuppetLook {
  const named = LOOKS[id];
  if (named) return named;
  let look = lookCache.get(id);
  if (!look) {
    const m = /^c(\d+)$/.exec(id);
    const n = m ? Number(m[1]) : id.length * 7;
    look = citizen(n);
    // Only people out walking (c1..c9) carry umbrellas; seated and working figures do not.
    if (n >= 10) look.umbrella = undefined;
    lookCache.set(id, look);
  }
  return look;
}
