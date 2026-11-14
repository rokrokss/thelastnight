import type { PuppetLook } from './puppet';

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

const SKIN = ['#e6b08a', '#c98f6a', '#f0c4a0', '#a8734f', '#dba27a'];

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
  mun: {
    skin: '#dba27a',
    hair: '#c9c6c2',
    hairStyle: 'bun',
    top: '#7a3f58',
    bottom: '#3a3440',
    shoes: '#241f26',
    coat: 4,
  },
  baek: {
    skin: '#c98f6a',
    hair: '#2a2424',
    hairStyle: 'beanie',
    hat: '#b8b2a6',
    top: '#3f5a6a',
    bottom: '#2a2c34',
    shoes: '#1a1a1e',
    apron: '#d8d2c4',
    coat: 3,
  },
  jin: {
    scale: 0.76,
    skin: '#f0c4a0',
    hair: '#2a1e1e',
    hairStyle: 'cap',
    hat: '#c8433c',
    top: '#e8c53a',
    bottom: '#33405a',
    shoes: '#d9d4c8',
    coat: 3,
    pack: 'bag',
    packColor: '#3d6a8a',
  },
  cha: {
    skin: '#c98f6a',
    hair: '#1c1a20',
    hairStyle: 'visor',
    hat: '#1c2638',
    top: '#24324a',
    bottom: '#1c2434',
    shoes: '#101216',
    coat: 2,
    armband: '#3df2ff',
  },
  gil: {
    skin: '#a8734f',
    hair: '#8a8884',
    hairStyle: 'elder',
    top: '#5a6a3c',
    bottom: '#34363c',
    shoes: '#1a1a1e',
    coat: 2,
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
  gran: {
    skin: '#dba27a',
    hair: '#d8d4cc',
    hairStyle: 'bun',
    top: '#5a7a6a',
    bottom: '#3a3a44',
    shoes: '#241f26',
    coat: 5,
    scale: 0.92,
  },
  driver: {
    skin: '#dba27a',
    hair: '#3a3230',
    hairStyle: 'cap',
    hat: '#3a4a3c',
    top: '#6a5a44',
    bottom: '#2a2a30',
    shoes: '#16161a',
    coat: 2,
  },
};

const TOPS = ['#4a5a78', '#6a4a5a', '#3f6a5a', '#7a6a4a', '#5a5a66', '#8a4a3a', '#3a4a5a', '#6a6a82', '#445046'];
const BOTTOMS = ['#22262e', '#2e2a34', '#1e2a34', '#34302a', '#262630'];
const HAIRS = ['#1c1a20', '#2a2020', '#3a2c24', '#52463c', '#8a8680'];
const STYLES = ['short', 'bob', 'long', 'beanie', 'cap', 'hood', 'bun'] as const;
const UMBRELLAS = ['#c8433c', '#2a6a8a', '#d8c84a', '#3a3a44', '#7a4a8a', '#3f7a5a'];

/** Deterministic background citizen. */
export function citizen(n: number): PuppetLook {
  const h = (k: number): number => {
    let x = Math.imul(n * 31 + k * 17 + 7, 2654435761) >>> 0;
    x ^= x >>> 15;
    return (Math.imul(x, 2246822519) >>> 0) / 4294967296;
  };
  const style = STYLES[Math.floor(h(1) * STYLES.length)]!;
  return {
    skin: SKIN[Math.floor(h(2) * SKIN.length)]!,
    hair: HAIRS[Math.floor(h(3) * HAIRS.length)]!,
    hairStyle: style,
    hat: TOPS[Math.floor(h(4) * TOPS.length)],
    top: TOPS[Math.floor(h(5) * TOPS.length)]!,
    bottom: BOTTOMS[Math.floor(h(6) * BOTTOMS.length)]!,
    shoes: '#18181c',
    coat: Math.floor(h(7) * 6),
    umbrella: h(8) < 0.3 ? UMBRELLAS[Math.floor(h(9) * UMBRELLAS.length)] : undefined,
    scale: 0.94 + h(10) * 0.1,
  };
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
