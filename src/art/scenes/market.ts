import { PAD } from '../../core/constants';
import type { LevelData } from '../../game/level';
import { cityBackdrop, paintForeground } from '../backdrop';
import { street } from '../paint';
import { paintProp } from '../props';
import { beginScene, DEFAULT_LOOK, paintLadder, paintOneWay, paintSolid, type SceneArt } from '../scene';

/**
 * The Lanes: a night market at street level, wet tarmac under tarp stalls and
 * shop signs. The epilogue revisits the same street at dawn.
 */
export function paintMarket(level: LevelData): SceneArt {
  const dawn = level.theme === 'dawn';
  const { c, art } = beginScene(
    level,
    dawn
      ? {
          ...DEFAULT_LOOK,
          ambPlay: [0.92, 0.78, 0.74],
          fogColor: [0.62, 0.46, 0.44],
          fogMid: 0.26,
          groundFog: 0.4,
          scatter: 0.04,
          reflect: 0.72,
          ripple: 1.2,
          bloom: 0.42,
          bloomWide: 1.4,
          streak: 0.1,
          exposure: 1.02,
          contrast: 1.02,
          saturation: 1.06,
          shadowTint: [0.01, 0.01, 0.04],
          highTint: [0.06, 0.026, 0.0],
          vignette: 0.34,
        }
      : {
          ...DEFAULT_LOOK,
          ambPlay: [0.19, 0.24, 0.37],
          fogColor: [0.1, 0.13, 0.19],
          fogMid: 0.24,
          groundFog: 0.3,
          scatter: 0.11,
        },
  );
  street(c, -PAD, level.width + PAD, level.groundY, level.height + PAD, level.seed);
  for (const p of level.props) paintProp(c, art, p);
  for (const s of level.solids) paintSolid(c, s);
  for (const o of level.oneWays) paintOneWay(c, o);
  for (const l of level.ladders) paintLadder(c.back, l.x, l.y0, l.y1);

  if (dawn) {
    // Daylight has arrived: the street's own lamps barely register against it.
    for (const l of art.lights) {
      l.k = (l.k ?? 1) * 0.16;
      l.shadow = false;
    }
    cityBackdrop(level, art, {
      seed: level.seed,
      skyStops: ['#2a3f70', '#5873a8', '#b094b8', '#f09c92', '#ffb878', '#ffdca0'],
      stars: 0,
      clouds: 0.6,
      cloudColor: '#ffc0a4',
      sun: { x: 318, y: 150, r: 7, color: '#ff9a4a' },
      haze: '#f4b49c',
      bodies: ['#8a86b0', '#6f6c9c', '#56557e', '#3f4060'],
      horizon: 214,
      spire: 0.62,
      rail: true,
      lit: 0.2,
      traffic: 0.5,
    });
  } else {
    cityBackdrop(level, art, {
      seed: level.seed,
      skyStops: ['#04060e', '#081020', '#101c34', '#1e2a44', '#35354a', '#54424a'],
      stars: 26,
      clouds: 0.55,
      cloudColor: '#3a3a54',
      moon: { x: 372, y: 46, r: 7, color: '#cdd8ea' },
      haze: '#2a2c44',
      bodies: ['#101a32', '#0c1528', '#0d1420', '#090d15'],
      horizon: 214,
      spire: 0.62,
      rail: true,
      lit: 1,
      traffic: 1,
    });
  }
  paintForeground(level, art, 'street', level.seed + 77);
  return art;
}
