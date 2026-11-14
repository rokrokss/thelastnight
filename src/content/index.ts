import type { Chapter } from '../game/chapter';
import { mast } from './ch0';
import { lanes } from './ch1';
import { tops } from './ch2';
import { yards } from './ch3';
import { quay } from './ch3b';
import { tide } from './ch3c';
import { spire } from './ch4';
import { dawn, ENDINGS } from './ch5';

export { ENDINGS };

export const CHAPTERS: Record<string, Chapter> = {
  mast,
  lanes,
  tops,
  yards,
  quay,
  tide,
  spire,
  dawn,
};

/** Play order (also the order shown in chapter select). */
export const ORDER: string[] = ['mast', 'lanes', 'tops', 'yards', 'quay', 'tide', 'spire', 'dawn'];
export const FIRST_CHAPTER = 'mast';

/** The backdrop behind the title menu: a real scene with nobody at the controls. */
export const titleChapter: Chapter = {
  ...mast,
  id: 'title',
  intro: undefined,
  route: undefined,
  triggers: {},
  interacts: {},
  setup(d) {
    d.world.locked = 1;
    d.world.stealthOff = true;
    d.world.signals.beacon = 1;
    d.world.player.place(196, d.world.level.groundY);
    d.world.player.facing = -1;
  },
};

export const CREDITS = `
<h1>SKYWAVE</h1>
A night on the open band

<b>STORY, DESIGN, CODE, ART, SOUND</b>
Built as a single original work.
Every pixel, light and note is generated at runtime;
no image or audio files ship with the game.

<b>TYPEFACE</b>
Galmuri by Lee Minseo
SIL Open Font License 1.1

<b>MADE WITH</b>
TypeScript · WebGL2 · Web Audio · Vite

<b>FOR</b>
Everyone who ever kept a small station on the air.


Thank you for listening.
`;
