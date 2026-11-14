import { COVER_H } from '../game/combat';
import type { Arena } from '../game/kaiju';
import { LevelBuilder, type LevelData } from '../game/level';

/**
 * The quay under crane SG-07: one stretch of waterfront, used twice. First
 * the Enforcers come along it (chapter `quay`), then the thing in the channel
 * reaches over it (chapter `tide`).
 *
 * West (left) is the yard, east is open quay; the channel lies behind, with
 * the Spire on its far bank.
 */

export const G = 560;
export const W = 1560;
export const H = 640;

/** Crane SG-07: legs at CRANE_X and CRANE_X + 130, boom 240 px up. */
export const CRANE_X = 250;
export const LEG_B = CRANE_X + 130;
/** The override pedestal at the foot of the crane, where Gil waits. */
export const PEDESTAL_X = 296;

/** The container hanging from the trolley. */
export const HANG = { id: 'hangbox', x: 557, y: G - 100, w: 72, h: 30 };
/** The latch on its spreader: what holds it up. */
export const LATCH = { x: HANG.x - 5, y: HANG.y - 4 };
/** The slew brake on the crane's near leg. */
export const BRAKE = { x: LEG_B + 7, y: G - 54 };

/** Sol's first piece of cover, and where she fights from. */
export const HOLD_X = 418;

/** Low cover, west to east: [left edge, width, tag]. */
export const COVER: [number, number, string][] = [
  [336, 20, 'crate'],
  [428, 16, 'barrier'],
  [478, 20, 'crate'],
  [536, 16, 'barrier'],
  [650, 16, 'barrier'],
  [716, 20, 'crate'],
];

/** Where an Enforcer stands behind each piece of cover east of Sol. */
export const POST = { a: 508, b1: 566, b2: 590, b3: 614, c: 676, d: 746 };
/** Where Enforcers walk in from: off the Meridian launch at the east steps. */
export const GATE_X = 860;

/** The cable trench: a grating in the deck with room to stand under it. */
export const TRENCH = { x: 900, y: G, w: 220, h: 32 };
/** The floodlight mast with the switch at its foot and a ladder up it. */
export const FLOOD_X = 866;
/** Where the patrol launch is tied up. */
export const LAUNCH_X = 1150;

export const ARENA: Arena = {
  x0: 180,
  x1: 1400,
  deck: G,
  trench: TRENCH,
  slots: [772, 1138],
  boxes: ['hurl1', 'hurl2'],
};

/** Where the camera looks to see the whole of the channel, and what stands in it. */
export const VISTA = { x: 1100, y: 385 };

/** Where she is put back after a failure. */
export const RESPAWN_X = 396;

export function buildQuay(id: 'quay' | 'tide'): LevelData {
  const b = new LevelBuilder(id, 'yards', W, H, G, 3411);
  // Deck, with the trench cut into it.
  b.solid(-200, G, TRENCH.x + 200, 200, 'dock');
  b.solid(TRENCH.x + TRENCH.w, G, W - TRENCH.x - TRENCH.w + 200, 200, 'dock');
  b.solid(TRENCH.x, G + TRENCH.h, TRENCH.w, 200 - TRENCH.h, 'pit');
  b.oneWay(TRENCH.x, G, TRENCH.w, 'grating');
  b.ladder(TRENCH.x + 12, G, G + TRENCH.h);
  b.ladder(TRENCH.x + TRENCH.w - 12, G, G + TRENCH.h);
  b.solid(-40, -400, 40, 1300, 'none');
  b.solid(W, -400, 40, 1300, 'none');
  b.spawn(id === 'quay' ? 268 : RESPAWN_X + 62, G, 1);
  b.weather(id === 'quay' ? { rain: 0.9, wind: 0.4, fog: 0.5 } : { rain: 1, wind: 0.55, fog: 0.55, storm: true });

  const box = (x: number, n: number, cols = 1): void => {
    b.wall(x, G - 30 * n, 72 * cols, 30 * n, 'container');
  };

  // West: the yard's last stacks. Nothing gets past them.
  box(-44, 4);
  box(28, 2);
  box(100, 3);
  b.prop('floodtower', 196, G, { h: 170 });

  // SG-07.
  b.prop('gantry', CRANE_X, G);
  b.ladder(CRANE_X - 18, G - 120, G);
  b.oneWay(CRANE_X - 40, G - 120, 66, 'catwalk');
  b.prop('pedestal', PEDESTAL_X, G);
  b.prop('brake', BRAKE.x, BRAKE.y);
  b.mover({ id: HANG.id, x: HANG.x, y: HANG.y, w: HANG.w, h: HANG.h, path: [[HANG.x, HANG.y], [HANG.x, G - HANG.h]], speed: 380, pause: 0, active: false, once: true, kind: 'box', occlude: true });

  // The apron: low cover all the way out.
  for (const [x, w, tag] of COVER) b.solid(x, G - COVER_H, w, COVER_H, tag, true);
  b.prop('pallet', 590, G);
  b.prop('cone', 620, G);
  b.prop('barrel', 800, G);

  // Mid quay: the floodlight mast, the trench, the launch.
  b.prop('floodtower', FLOOD_X, G, { h: 160, flip: true });
  b.ladder(FLOOD_X, G - 64, G);
  b.oneWay(FLOOD_X - 18, G - 64, 40, 'catwalk');
  b.prop('switch', FLOOD_X + 14, G);
  b.prop('launch', LAUNCH_X, G);
  b.prop('bollardbig', 1000, G);
  b.prop('bollardbig', 1126, G);

  // East: a single box to stand on, and the end of the quay.
  box(1250, 1);
  b.prop('floodtower', 1340, G, { h: 170, flip: true });
  box(1404, 3);
  box(1476, 2);
  b.prop('bollardbig', 1370, G);

  // Containers the Undertow can reach for, parked out of the world until it does.
  for (const hid of ARENA.boxes) {
    b.mover({ id: hid, x: -300, y: -400, w: 72, h: 30, path: [[-300, -400]], speed: 0, active: false, once: true, kind: 'box', occlude: true });
  }

  // Marks only: reached through the story, never by walking into them.
  const off = -900;
  if (id === 'quay') {
    b.npc({ id: 'gil', x: PEDESTAL_X - 12, y: G, look: 'gil', facing: 1 });
    for (const cp of ['cp_w1', 'cp_w2', 'cp_w3']) b.checkpoint(cp, off, off, 4, 4, RESPAWN_X, G);
    // The fight is held a little off-centre, with the room on the side they come from.
    b.camZone({ x: 180, y: 300, w: 900, h: 300, zoom: 1, offX: 96, offY: -14 });
  } else {
    b.interact('floods', FLOOD_X + 14, G, 'Turn the floods on it', false, 16);
    b.interact('hook', HANG.x + HANG.w / 2, G - HANG.h, 'Take the hook', false, 22);
    for (const cp of ['cp_p1', 'cp_p2', 'cp_p3', 'cp_free']) b.checkpoint(cp, off, off, 4, 4, RESPAWN_X + 62, G);
    // Wide, and looking up as far as leaves the deck clear of the captions: the rest of the frame is the channel's.
    // The lens looks up as well: the horizon drops, and what stands on it gets the top of the frame.
    b.camZone({ x: 0, y: 200, w: W, h: 440, zoom: 1, offY: -18, shiftY: 24 });
  }
  return b.build();
}
