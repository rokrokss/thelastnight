import { ScriptedControls, type Action } from '../../src/core/input';
import type { World } from '../../src/game/world';

const ALL: Action[] = ['left', 'right', 'up', 'down', 'jump'];

function oneWayUnder(w: World, x: number, feet: number): boolean {
  for (const o of w.level.oneWays) if (x >= o.x && x < o.x + o.w && Math.abs(o.y - feet) < 1.5) return true;
  return false;
}

export function reached(w: World, tx: number, ty: number): boolean {
  const p = w.player;
  return Math.abs(tx - p.cx) <= 5 && Math.abs(ty - p.feet) <= 3 && (p.onGround || p.state === 'ladder');
}

/**
 * A deliberately simple autopilot: walk toward the waypoint, jump at gaps and
 * walls, grab and climb ledges, use ladders. If this can follow a route, a
 * player certainly can.
 */
export function steer(w: World, c: ScriptedControls, tx: number, ty: number): void {
  const p = w.player;
  const want = new Set<Action>();
  const dx = tx - p.cx;
  const dy = ty - p.feet;
  const dir: Action = dx > 0 ? 'right' : 'left';
  if (p.state === 'hang') {
    want.add('up');
  } else if (p.state === 'ladder') {
    if (dy < -4) want.add('up');
    else if (dy > 1) want.add('down');
    else want.add(Math.abs(dx) > 2 ? dir : 'up');
  } else if (p.state === 'normal') {
    const L = w.ladderAt(p.cx, p.feet - 6);
    const top = w.ladderTopAt(p.cx, p.feet);
    if (L && Math.abs(L.x - tx) <= 8 && dy < -6 && p.feet > L.y0 + 2) want.add('up');
    else if (top && Math.abs(top.x - tx) <= 8 && dy > 6 && p.onGround) want.add('down');
    else {
      if (Math.abs(dx) > 2) want.add(dir);
      const s = dx > 0 ? 1 : -1;
      const aheadX = p.cx + s * 8;
      const ground = w.rectBlocked(aheadX - 1, p.feet, 2, 4) || oneWayUnder(w, aheadX, p.feet);
      const wall = w.rectBlocked(s > 0 ? p.x + p.w : p.x - 3, p.y + 2, 3, p.h - 6);
      const reachUp = dy < -8 && Math.abs(dx) < 30;
      const dropping = dy > 20;
      if (p.onGround && Math.abs(dx) > 6 && ((!ground && !dropping) || wall || reachUp)) want.add('jump');
      if (!p.onGround && p.vy < 0) want.add('jump');
    }
  }
  for (const a of ALL) c.set(a, want.has(a));
}

export function release(c: ScriptedControls): void {
  for (const a of ALL) c.set(a, false);
}

/** Synchronous drive for pure traversal tests (no story scripts involved). */
export function driveTo(w: World, c: ScriptedControls, tx: number, ty: number, maxSec = 14): boolean {
  const dt = 1 / 60;
  for (let i = 0; i < maxSec * 60; i++) {
    if (w.failed || w.player.state === 'dead') return false;
    if (reached(w, tx, ty)) {
      release(c);
      for (let k = 0; k < 6; k++) {
        w.update(dt, c);
        c.endFrame();
      }
      return true;
    }
    steer(w, c, tx, ty);
    w.update(dt, c);
    c.endFrame();
    w.fx.length = 0;
  }
  return false;
}
