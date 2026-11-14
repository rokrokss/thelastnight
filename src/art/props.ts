import { Rng } from '../core/math';
import type { PropDef } from '../game/level';
import { facade } from './buildings';
import {
  bladeSign,
  bulbString,
  cable,
  clutter,
  fence,
  glow,
  lamp,
  neonText,
  poster,
  seedOf,
  stall,
  steps,
  vending,
  type PaintCtx,
} from './paint';
import { paintRelay, type SceneArt } from './scene';

const CLUTTER = new Set([
  'crates',
  'bags',
  'cone',
  'barrel',
  'plant',
  'scooter',
  'bike',
  'bollard',
  'bin',
  'pallet',
  'stool',
  'hydrant',
  'radio',
]);

/** Paint one prop from level data. Returns false for kinds a scene must handle itself. */
export function paintProp(c: PaintCtx, art: SceneArt, p: PropDef): boolean {
  const rng = new Rng(p.seed ?? seedOf(p.x, p.y, 1));
  const a = p.front ? c.front : c.back;
  switch (p.kind) {
    case 'facade':
      facade(c, p);
      return true;
    case 'stall':
      stall(c, p.x, p.y, p.w ?? 76, p.text ?? 'NOODLES', (p.color as 'tarpOrange' | 'tarpBlue' | 'tarpRed') ?? 'tarpOrange', rng);
      return true;
    case 'lamp':
      lamp(c, p.x, p.y, p.flip ? -1 : 1, p.h ?? 78, glow(p.color, 'sodium'));
      return true;
    case 'vending':
      vending(c, p.x, p.y, glow(p.color, 'white'), rng);
      return true;
    case 'blade':
      bladeSign(c, a, p.x, p.y, p.text ?? 'BAR', glow(p.color, 'pink'), rng);
      return true;
    case 'neon':
      neonText(c, a, p.x, p.y, p.text ?? '', glow(p.color, 'pink'), p.variant ?? 1, p.flip ? 'buzz' : 'none');
      return true;
    case 'bulbs':
      bulbString(c, a, p.x, p.y, p.x + (p.w ?? 80), p.y + (p.h ?? 0), p.variant ?? 7, glow(p.color, 'warm'));
      return true;
    case 'cable':
      cable(a, p.x, p.y, p.x + (p.w ?? 80), p.y + (p.h ?? 0), p.variant ?? 8);
      return true;
    case 'poster':
      poster(a, p.x, p.y, rng, p.text);
      return true;
    case 'relay':
      paintRelay(c, art, p.text ?? 'relay', p.x, p.y);
      return true;
    case 'fence':
      fence(c, p.x, p.y, p.w ?? 120, p.h ?? 44, rng);
      return true;
    case 'steps':
      steps(c, p.x, p.y, p.w ?? 30, p.variant ?? 3);
      return true;
    case 'gondola': {
      // Open service car hanging from its hanger arm.
      const x = p.x;
      const y = p.y;
      a.rect(x + 19, y - 62, 2, 30, '#20262e');
      a.rect(x + 12, y - 64, 16, 3, '#2c343e');
      a.rect(x, y - 34, 40, 3, '#3a4654');
      a.rect(x, y - 34, 40, 1, '#5a6a7c');
      a.rect(x, y - 31, 2, 31, '#2c343e');
      a.rect(x + 38, y - 31, 2, 31, '#2c343e');
      a.rect(x, y - 12, 40, 12, '#b8882a');
      a.rect(x, y - 12, 40, 1, '#e0b04a');
      for (let i = 4; i < 40; i += 8) a.rect(x + i, y - 11, 3, 10, '#1c1e22');
      a.rect(x, y - 1, 40, 1, '#15181c');
      a.emit(x + 18, y - 30, 4, 2, '#ffe2a8', 0.7);
      c.lights.push({ x: x + 20, y: y - 24, r: 60, color: '#ffd9a0', k: 0.55, falloff: 1.4 });
      return true;
    }
    case 'steam':
      c.emitters.push({ kind: 'steam', x: p.x, y: p.y, rate: p.variant ?? 6, w: p.w ?? 8 });
      return true;
    default:
      if (CLUTTER.has(p.kind)) {
        clutter(c, p.kind, p.x, p.y, rng, !!p.front);
        return true;
      }
      return false;
  }
}
