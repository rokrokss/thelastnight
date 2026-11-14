import { describe, expect, it } from 'vitest';
import { citizen, lookFor, LOOKS } from '../src/art/palette';
import {
  drawPuppet,
  PUPPET_H,
  PUPPET_OX,
  PUPPET_OY,
  PUPPET_W,
  type Anim,
  type HairStyle,
  type PuppetLook,
} from '../src/art/puppet';
import type { Art } from '../src/gfx/art';

// Written as records so the compiler complains when a member is added and this list is not.
const HAIR: Record<HairStyle, true> = {
  short: true,
  bob: true,
  bun: true,
  cap: true,
  beanie: true,
  hood: true,
  long: true,
  elder: true,
  visor: true,
  bald: true,
  balding: true,
  buzz: true,
  spiky: true,
  curly: true,
  afro: true,
  ponytail: true,
  pigtails: true,
  braid: true,
  topknot: true,
  flatcap: true,
  hardhat: true,
  brim: true,
  swimcap: true,
  headscarf: true,
};
const ANIMS: Record<Anim, true> = {
  idle: true,
  walk: true,
  run: true,
  jump: true,
  fall: true,
  land: true,
  crouch: true,
  brace: true,
  hang: true,
  climb: true,
  ladder: true,
  sit: true,
  talk: true,
  reach: true,
  lean: true,
  cook: true,
  kneel: true,
};
const COLOURS = [
  'skin',
  'hair',
  'top',
  'bottom',
  'shoes',
  'skirtColor',
  'shirt',
  'tie',
  'stripe',
  'apron',
  'armband',
  'hat',
  'mask',
  'headphones',
  'scarf',
  'towel',
  'packColor',
  'cane',
  'carryColor',
  'umbrella',
  'flat',
] as const;
const CHOICES: { [K in keyof PuppetLook]?: readonly PuppetLook[K][] } = {
  build: ['slim', 'average', 'broad', 'stocky', 'heavy'],
  age: ['child', 'teen', 'adult', 'elder'],
  gender: ['f', 'm'],
  sleeves: ['long', 'short', 'none'],
  legs: ['long', 'shorts', 'bare'],
  swim: ['trunks', 'onepiece'],
  beard: ['stubble', 'moustache', 'full', 'long'],
  eyewear: ['glasses', 'shades', 'goggles'],
  pack: ['radio', 'bag', 'satchel'],
  carry: ['bag', 'case'],
};
const RANGES: { [K in keyof PuppetLook]?: [number, number] } = {
  scale: [0.5, 1.5],
  height: [-4, 6],
  belly: [0, 5],
  stoop: [0, 3],
  coat: [0, 12],
  skirt: [1, 12],
  boots: [0, 5],
};

/** The archetypes the levels were promised, by id. */
const ARCHETYPES = [
  'heavy_m',
  'heavy_f',
  'elder_m',
  'elder_f',
  'swim_m',
  'swim_f',
  'tall_m',
  'kid_f',
  'suit_m',
  'dock_m',
  'teen_m',
  'rain_f',
];

const crowd = (n: number): [string, PuppetLook][] => Array.from({ length: n }, (_, i) => [`c${i + 1}`, lookFor(`c${i + 1}`)]);
const everyone = (): [string, PuppetLook][] => [...Object.entries(LOOKS), ...crowd(40)];
const count = <T>(list: T[], f: (v: T) => boolean): number => list.filter(f).length;

describe('looks', () => {
  it('have valid fields', () => {
    for (const [id, L] of everyone()) {
      for (const k of COLOURS) {
        if (L[k] !== undefined) expect(L[k], `${id}.${k}`).toMatch(/^#[0-9a-f]{6}$/);
      }
      expect(HAIR[L.hairStyle], `${id}.hairStyle ${L.hairStyle}`).toBe(true);
      for (const [k, allowed] of Object.entries(CHOICES)) {
        const v = L[k as keyof PuppetLook];
        if (v !== undefined) expect(allowed, `${id}.${k}`).toContain(v);
      }
      for (const [k, [lo, hi]] of Object.entries(RANGES)) {
        const v = L[k as keyof PuppetLook];
        if (v === undefined) continue;
        expect(typeof v === 'number' && Number.isFinite(v), `${id}.${k}`).toBe(true);
        expect(v, `${id}.${k}`).toBeGreaterThanOrEqual(lo);
        expect(v, `${id}.${k}`).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('include the archetypes, each one different from the rest', () => {
    for (const id of ARCHETYPES) expect(LOOKS[id], id).toBeDefined();
    const named = Object.entries(LOOKS);
    for (let i = 0; i < named.length; i++) {
      for (let j = i + 1; j < named.length; j++) {
        const [a, A] = named[i]!;
        const [b, B] = named[j]!;
        // Two people may share a shape or a wardrobe, never both.
        const shape = (L: PuppetLook): string => [L.build, L.age, L.gender, L.height, L.belly, L.hairStyle].join();
        const dress = (L: PuppetLook): string => [L.top, L.bottom, L.coat, L.skirt, L.swim, L.overalls, L.apron].join();
        expect(shape(A) === shape(B) && dress(A) === dress(B), `${a} and ${b} look the same`).toBe(false);
      }
    }
    expect(LOOKS.heavy_m!.build).toBe('heavy');
    expect(LOOKS.heavy_m!.bare).toBe(true);
    expect(LOOKS.heavy_f!.build).toBe('heavy');
    expect(LOOKS.elder_m!.cane).toBeDefined();
    expect(LOOKS.elder_f!.age).toBe('elder');
    expect(LOOKS.swim_m!.swim).toBe('trunks');
    expect(LOOKS.swim_f!.swim).toBe('onepiece');
    expect(LOOKS.kid_f!.age).toBe('child');
    expect(LOOKS.dock_m!.overalls).toBe(true);
    expect(LOOKS.teen_m!.headphones).toBeDefined();
  });

  it('leave Sol as she was designed', () => {
    expect(LOOKS.sol).toEqual({
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
    });
  });
});

describe('crowd', () => {
  it('is deterministic', () => {
    for (const n of [1, 2, 9, 10, 24, 25, 133]) expect(citizen(n)).toEqual(citizen(n));
    expect(lookFor('c7')).toBe(lookFor('c7'));
    expect(citizen(3)).not.toEqual(citizen(4));
  });

  it('copes with any number', () => {
    for (const n of [0, -5, 2.5, 100000]) expect(citizen(n).skin).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('only lets the walkers, c1..c9, carry umbrellas', () => {
    const c = crowd(60);
    expect(count(c.slice(0, 9), ([, L]) => !!L.umbrella)).toBeGreaterThanOrEqual(2);
    expect(count(c.slice(9), ([, L]) => !!L.umbrella)).toBe(0);
  });

  it('is a mix of builds, ages, men and women', () => {
    const c = crowd(40).map(([, L]) => L);
    for (const build of ['slim', 'average', 'broad', 'stocky', 'heavy']) {
      expect(count(c, (L) => L.build === build), build).toBeGreaterThanOrEqual(3);
    }
    expect(count(c, (L) => L.age === 'child')).toBeGreaterThanOrEqual(2);
    expect(count(c, (L) => L.age === 'teen')).toBeGreaterThanOrEqual(2);
    expect(count(c, (L) => L.age === 'elder')).toBeGreaterThanOrEqual(5);
    expect(count(c, (L) => L.age === 'adult')).toBeGreaterThanOrEqual(20);
    expect(count(c, (L) => L.gender === 'f')).toBeGreaterThanOrEqual(15);
    expect(count(c, (L) => L.gender === 'm')).toBeGreaterThanOrEqual(15);
    const heights = c.map((L) => L.height ?? 0);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThanOrEqual(5);
    expect(new Set(c.map((L) => L.skin)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(c.map((L) => L.hair)).size).toBeGreaterThanOrEqual(7);
    expect(new Set(c.map((L) => L.hairStyle)).size).toBeGreaterThanOrEqual(12);
  });

  it('is dressed in more than one way', () => {
    const c = crowd(40).map(([, L]) => L);
    expect(count(c, (L) => !!L.skirt && !L.swim), 'skirts and dresses').toBeGreaterThanOrEqual(6);
    expect(count(c, (L) => (L.coat ?? 0) >= 6), 'long coats and raincoats').toBeGreaterThanOrEqual(5);
    expect(count(c, (L) => L.hairStyle === 'hood' || !!L.hoodDown), 'hoods').toBeGreaterThanOrEqual(3);
    expect(count(c, (L) => !!L.shirt), 'suits').toBeGreaterThanOrEqual(2);
    expect(count(c, (L) => !!L.overalls), 'overalls').toBeGreaterThanOrEqual(2);
    expect(count(c, (L) => !!L.apron), 'aprons').toBeGreaterThanOrEqual(3);
    expect(count(c, (L) => L.legs === 'shorts'), 'shorts').toBeGreaterThanOrEqual(1);
    expect(count(c, (L) => L.swim === 'trunks'), 'trunks').toBeGreaterThanOrEqual(1);
    expect(count(c, (L) => L.swim === 'onepiece'), 'swimsuits').toBeGreaterThanOrEqual(1);
    expect(count(c, (L) => !!L.cane), 'canes').toBeGreaterThanOrEqual(1);
    expect(count(c, (L) => !!L.pack || !!L.carry), 'bags').toBeGreaterThanOrEqual(8);
    expect(count(c, (L) => !!L.scarf), 'scarves').toBeGreaterThanOrEqual(1);
    expect(count(c, (L) => L.eyewear === 'glasses'), 'glasses').toBeGreaterThanOrEqual(2);
    expect(count(c, (L) => !!L.headphones), 'headphones').toBeGreaterThanOrEqual(2);
    expect(count(c, (L) => !!L.mask), 'masks').toBeGreaterThanOrEqual(1);
  });

  it('keeps aprons on c21..c23, who stand behind the market counters', () => {
    for (const id of ['c21', 'c22', 'c23']) expect(lookFor(id).apron, id).toBeDefined();
  });

  it('never undresses a child', () => {
    for (const [id, L] of [...Object.entries(LOOKS), ...crowd(300)]) {
      if (L.age !== 'child') continue;
      expect(L.swim, id).toBeUndefined();
      expect(L.sleeves, id).not.toBe('none');
      expect(L.legs, id).not.toBe('bare');
    }
  });
});

/** Stands in for an Art: records where the puppet draws, not what it looks like. */
class Probe {
  x0 = Infinity;
  y0 = Infinity;
  x1 = -Infinity;
  y1 = -Infinity;
  bad = 0;
  log: string[] = [];
  private span(x: number, y: number, w: number, h: number, col: string): void {
    if (![x, y, w, h].every(Number.isFinite)) {
      this.bad++;
      return;
    }
    this.x0 = Math.min(this.x0, x);
    this.y0 = Math.min(this.y0, y);
    this.x1 = Math.max(this.x1, x + w - 1);
    this.y1 = Math.max(this.y1, y + h - 1);
    this.log.push(`${x},${y},${w},${h},${col}`);
  }
  rect(x: number, y: number, w: number, h: number, col: string): this {
    if (w > 0 && h > 0 && Math.round(w) > 0 && Math.round(h) > 0) this.span(Math.round(x), Math.round(y), Math.round(w), Math.round(h), col);
    return this;
  }
  emit(x: number, y: number, w: number, h: number, col: string): this {
    return this.rect(x, y, w, h, col);
  }
  px(x: number, y: number, col: string): this {
    return this.rect(x, y, 1, 1, col);
  }
  epx(x: number, y: number, col: string): this {
    return this.rect(x, y, 1, 1, col);
  }
  line(ax: number, ay: number, bx: number, by: number, col: string, th = 1): this {
    const o = (th - 1) >> 1;
    const x = Math.min(Math.round(ax), Math.round(bx));
    const y = Math.min(Math.round(ay), Math.round(by));
    this.span(x - o, y - o, Math.abs(Math.round(bx) - Math.round(ax)) + th, Math.abs(Math.round(by) - Math.round(ay)) + th, col);
    return this;
  }
}

const draw = (L: PuppetLook, anim: Anim, phase = 0, t = 1.3): Probe => {
  const probe = new Probe();
  drawPuppet(probe as unknown as Art, PUPPET_OX, PUPPET_OY, L, { anim, phase, t, antX: 1.5 });
  return probe;
};

// Not a test of how anyone looks (that is judged by eye on the cast sheets), only of where the pixels land.
describe('puppet geometry', () => {
  const anims = Object.keys(ANIMS) as Anim[];
  // Poses that keep at least one foot planted.
  const planted: Anim[] = ['idle', 'walk', 'talk', 'sit', 'crouch', 'brace', 'kneel', 'land', 'reach', 'lean', 'cook'];

  it('draws every pose of every look inside the sprite, feet on the ground', () => {
    for (const [id, L] of everyone()) {
      for (const anim of anims) {
        for (const phase of [0, 0.2, 0.45, 0.7, 0.95, 3.3]) {
          const p = draw(L, anim, phase, phase * 4);
          const at = `${id} ${anim} ${phase}`;
          expect(p.bad, `${at}: broken coordinates`).toBe(0);
          expect(p.log.length, `${at}: drew nothing`).toBeGreaterThan(20);
          expect(p.x0, at).toBeGreaterThanOrEqual(0);
          expect(p.y0, at).toBeGreaterThanOrEqual(0);
          expect(p.x1, at).toBeLessThan(PUPPET_W);
          expect(p.y1, at).toBeLessThan(PUPPET_H);
          // A hanging body dangles below the point the world calls its feet; nobody else goes through the floor.
          if (anim !== 'hang' && anim !== 'climb') expect(p.y1, at).toBeLessThan(PUPPET_OY);
          if (planted.includes(anim)) expect(p.y1, `${at}: floating`).toBe(PUPPET_OY - 1);
        }
      }
    }
  });

  it('keeps working as a silhouette and at other scales', () => {
    for (const id of ['sol', 'heavy_m', 'heavy_f', 'elder_m', 'swim_m', 'kid_f', 'rain_f', 'c1', 'c5']) {
      for (const anim of anims) {
        const flat = draw({ ...lookFor(id), flat: '#0a0c12' }, anim, 0.3);
        expect(flat.bad).toBe(0);
        expect(new Set(flat.log.map((s) => s.split(',')[4])), `${id} ${anim}`).toEqual(new Set(['#0a0c12']));
        for (const scale of [0.7, 1.15]) {
          const p = draw({ ...lookFor(id), scale }, anim, 0.3);
          expect(p.bad, `${id} ${anim} x${scale}`).toBe(0);
          expect(p.x0, `${id} ${anim} x${scale}`).toBeGreaterThanOrEqual(0);
          expect(p.x1, `${id} ${anim} x${scale}`).toBeLessThan(PUPPET_W);
          expect(p.y0, `${id} ${anim} x${scale}`).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('dresses a child even when the look asks for swimwear or a bare chest', () => {
    const kid = LOOKS.kid_f!;
    for (const swim of ['trunks', 'onepiece'] as const) {
      expect(draw({ ...kid, swim }, 'walk', 0.3).log).toEqual(draw(kid, 'walk', 0.3).log);
    }
    expect(draw({ ...kid, bare: true, ink: '#2c5866' }, 'walk', 0.3).log).toEqual(draw(kid, 'walk', 0.3).log);
  });

  it('strips a bare look to the waist: skin and ink where the top would be', () => {
    const L = LOOKS.heavy_m!;
    const colours = (look: PuppetLook, anim: Anim): Set<string | undefined> => new Set(draw(look, anim, 0.3).log.map((s) => s.split(',')[4]));
    for (const anim of ['idle', 'walk', 'sit', 'talk'] as const) {
      const seen = colours(L, anim);
      expect(seen.has(L.top), anim).toBe(false);
      expect(seen.has(L.skin), anim).toBe(true);
      expect(seen.has(L.ink), anim).toBe(true);
    }
    // The same man with his shirt on is drawn in it, and the ink is under the cloth.
    const dressed = colours({ ...L, bare: false }, 'idle');
    expect(dressed.has(L.top)).toBe(true);
    expect(dressed.has(L.ink)).toBe(false);
  });
});
