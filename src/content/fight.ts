import type { Director } from '../game/director';

/** Wait for something in the world to come true. */
export async function until(d: Director, ok: () => boolean, every = 0.1): Promise<void> {
  while (!ok()) await d.wait(every);
}

/** How to use the rivet gun, in one line. */
export const GUN_HELP = 'F or J to fire  —  hold DOWN behind cover  —  six rivets, then the gun builds pressure';
