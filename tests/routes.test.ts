import { describe, expect, it } from 'vitest';
import { CHAPTERS, ORDER } from '../src/content';
import { ScriptedControls } from '../src/core/input';
import { World } from '../src/game/world';
import { driveTo } from './helpers/bot';

describe('critical paths', () => {
  for (const id of ORDER) {
    const ch = CHAPTERS[id]!;
    if (!ch.route) continue;
    it(`${id}: every waypoint on the route is reachable`, () => {
      const level = ch.build();
      const w = new World(level);
      // Traversal only: stealth and weather are covered elsewhere.
      w.stealthOff = true;
      // Looping machinery runs; one-shot rides (lifts) wait for the player.
      for (const m of level.movers) if (!m.once) w.mover(m.id).active = true;
      const c = new ScriptedControls();
      const first = ch.route![0]!;
      // Start from the first waypoint if the spawn is far from it (routes may begin mid-level).
      if (Math.abs(first[0] - w.player.cx) > 600) w.player.place(first[0], first[1]);
      ch.route!.forEach(([x, y, how], i) => {
        if (how === 'ride') {
          const p = w.player;
          const under = w.groundUnder(p, false);
          for (const m of w.movers) if (m === under) m.active = true;
          for (let k = 0; k < 60 * 40 && Math.abs(p.feet - y) > 2; k++) {
            w.update(1 / 60, c);
            c.endFrame();
          }
        }
        const ok = driveTo(w, c, x, y);
        expect(ok, `${id} waypoint #${i} (${x}, ${y}); player at (${w.player.cx.toFixed(1)}, ${w.player.feet.toFixed(1)}), state ${w.player.state}, failed ${w.failed}`).toBe(true);
      });
    });
  }
});
