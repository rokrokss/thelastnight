import { VIEW_H, VIEW_W } from '../core/constants';
import { clamp, damp, easeInOut, lerp, pointInRect } from '../core/math';
import type { CamZone } from './level';
import type { World } from './world';

/** Where the lens is and how it is set. (x, y) is the centre of the frame in world px. */
export interface Pose {
  x: number;
  y: number;
  /** Magnification of the play layer (1 = the whole 480x270 view). */
  zoom: number;
  /** Roll in radians (Dutch tilt). */
  roll: number;
  /** Focus pull: 0 on the subject, toward +1 the foreground, toward -1 the far distance. */
  rack: number;
  /**
   * Lens shift, in screen px: where the vanishing point sits relative to the
   * frame centre. The play plane does not move; everything in front of and
   * behind it does. Up (negative y) looks down onto floors and roofs; left or
   * right looks along the street and opens up the sides of buildings.
   */
  shiftX: number;
  shiftY: number;
}

/** Everyday lens shift: the horizon rides a little above the middle of the frame, so the ground has room. */
export const SHIFT_Y = -42;

export type Ease = 'inOut' | 'in' | 'out' | 'linear';

/**
 * A camera setup, as a director would call it. Anything left out keeps its
 * value from the moment the shot begins, so `{ zoom: 1.5 }` is a push-in from
 * wherever the camera already is.
 */
export interface ShotSpec {
  /** World point to centre on. */
  x?: number;
  y?: number;
  /** Frame these bodies instead ('sol', an NPC id or a drone id) and keep following them. */
  on?: string | string[];
  /** With `on`: choose a zoom that holds everyone comfortably. */
  fit?: boolean;
  /** Composition: push the frame this many screen px off the subject (dx > 0 puts the subject left of centre). */
  dx?: number;
  dy?: number;
  zoom?: number;
  roll?: number;
  rack?: number;
  /** Lens shift (see Pose): where the vanishing point goes, in screen px from the frame centre. */
  shiftX?: number;
  shiftY?: number;
  /**
   * 0..1. Below 1 the shot only leans the gameplay camera toward this setup,
   * for a glance at something while the player keeps control.
   */
  weight?: number;
}

/** Everyday framing: a touch tighter than the full view, so a wide shot reads as wide. */
export const BASE_ZOOM = 1.08;

const EASE: Record<Ease, (t: number) => number> = {
  inOut: easeInOut,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  linear: (t) => t,
};

const mixPose = (a: Pose, b: Pose, t: number): Pose => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  zoom: lerp(a.zoom, b.zoom, t),
  roll: lerp(a.roll, b.roll, t),
  rack: lerp(a.rack, b.rack, t),
  shiftX: lerp(a.shiftX, b.shiftX, t),
  shiftY: lerp(a.shiftY, b.shiftY, t),
});

/** Where a named body is, for framing purposes (about chest height). */
export function subjectPoint(w: World, id: string): [number, number] {
  if (id === 'sol') return [w.player.drawX, w.player.drawY - 15];
  const a = w.actors.find((x) => x.id === id);
  if (a) return [a.x, a.y - 14];
  const d = w.drones.find((x) => x.id === id);
  if (d) return [d.x, d.y];
  throw new Error(`camera: nothing called "${id}" in ${w.level.id}`);
}

/**
 * The camera rig. Two things can drive it: the gameplay framing, which
 * follows the player and reacts to what they are doing, and a scripted shot
 * (cut or move) placed by the story. Releasing a shot eases back to gameplay.
 */
export class Camera {
  /** Top-left of the unzoomed view in world px: what the compositor draws from. */
  x = 0;
  y = 0;
  zoom = 1;
  roll = 0;
  rack = 0;
  shiftX = 0;
  shiftY = SHIFT_Y;
  shake = 0;
  /** Counts shots placed, so a delayed release can tell whether its shot is still the current one. */
  serial = 0;
  private look = 0;
  private anchor = 0;
  private idle = 0;
  private game: Pose = { x: 0, y: 0, zoom: BASE_ZOOM, roll: 0, rack: 0, shiftX: 0, shiftY: SHIFT_Y };
  private shot: {
    from: Pose;
    spec: ShotSpec;
    t: number;
    dur: number;
    ease: Ease;
    done: (() => void) | null;
  } | null = null;
  private back: { from: Pose; t: number; dur: number } | null = null;

  get pose(): Pose {
    return {
      x: this.x + VIEW_W / 2,
      y: this.y + VIEW_H / 2,
      zoom: this.zoom,
      roll: this.roll,
      rack: this.rack,
      shiftX: this.shiftX,
      shiftY: this.shiftY,
    };
  }

  /** A scripted shot (not the gameplay framing) currently owns the camera. */
  get scripted(): boolean {
    return this.shot !== null;
  }

  // ------------------------------------------------------------- direction

  /** Jump straight to a shot. */
  cut(w: World, spec: ShotSpec): void {
    this.finishShot();
    this.serial++;
    // `from` is always the pose before the shot began: unspecified fields inherit from it.
    const from = this.pose;
    this.shot = { from, spec, t: 1, dur: 0, ease: 'linear', done: null };
    this.back = null;
    this.apply(w, this.resolve(w, spec, from));
  }

  /** Travel to a shot over `seconds`; `done` fires on arrival. */
  move(spec: ShotSpec, seconds: number, ease: Ease = 'inOut', done: (() => void) | null = null): void {
    this.finishShot();
    this.serial++;
    this.shot = { from: this.pose, spec, t: seconds > 0 ? 0 : 1, dur: seconds, ease, done };
    this.back = null;
    if (seconds <= 0) this.finishShot(true);
  }

  /** Hand the camera back to gameplay, easing over `seconds`. */
  release(seconds = 1.2): void {
    this.finishShot();
    if (!this.shot && !this.back) return;
    this.shot = null;
    this.back = seconds > 0 ? { from: this.pose, t: 0, dur: seconds } : null;
  }

  /** Resolve whoever was waiting on the current move (it is being replaced or has arrived). */
  private finishShot(keep = false): void {
    const s = this.shot;
    if (!s) return;
    const done = s.done;
    s.done = null;
    if (!keep && s.t < 1) s.t = 1;
    done?.();
  }

  addShake(amount: number): void {
    this.shake = Math.min(1.5, Math.max(this.shake, amount));
  }

  // --------------------------------------------------------------- framing

  /** The pose a spec asks for right now (subjects may be moving). */
  private resolve(w: World, spec: ShotSpec, base: Pose): Pose {
    let x = spec.x ?? base.x;
    let y = spec.y ?? base.y;
    let zoom = spec.zoom ?? base.zoom;
    if (spec.on) {
      const ids = Array.isArray(spec.on) ? spec.on : [spec.on];
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const id of ids) {
        const [sx, sy] = subjectPoint(w, id);
        x0 = Math.min(x0, sx);
        x1 = Math.max(x1, sx);
        y0 = Math.min(y0, sy);
        y1 = Math.max(y1, sy);
      }
      x = (x0 + x1) / 2;
      y = (y0 + y1) / 2;
      if (spec.fit && spec.zoom === undefined) {
        zoom = clamp(Math.min(250 / (x1 - x0 + 110), 150 / (y1 - y0 + 90)), 1, 1.9);
      }
    }
    x += (spec.dx ?? 0) / zoom;
    y += (spec.dy ?? 0) / zoom;
    return {
      x,
      y,
      zoom,
      roll: spec.roll ?? base.roll,
      rack: spec.rack ?? base.rack,
      shiftX: spec.shiftX ?? base.shiftX,
      shiftY: spec.shiftY ?? base.shiftY,
    };
  }

  /** How the camera frames ordinary play: follows, leads, and reacts. */
  private gameplay(dt: number, w: World): Pose {
    const p = w.player;
    const speed = Math.abs(p.vx);
    this.look = damp(this.look, speed > 20 ? p.facing * 40 : p.facing * 16, 1.6, dt);
    // Follow height changes only once the player has settled or left the frame's comfort band.
    if (p.onGround || p.state === 'ladder' || p.state === 'hang' || p.state === 'climb') {
      this.anchor = damp(this.anchor, p.state === 'hang' || p.state === 'climb' ? p.y + 20 : p.feet, 6, dt);
    } else if (p.feet > this.anchor + 30) {
      this.anchor = damp(this.anchor, p.feet - 30, 8, dt);
    } else if (p.feet < this.anchor - 64) {
      this.anchor = damp(this.anchor, p.feet + 64, 8, dt);
    }
    let zone: CamZone | null = null;
    for (const z of w.level.camZones) {
      if (pointInRect(p.cx, p.feet - 8, z)) {
        zone = z;
        break;
      }
    }
    const tension = Math.max(w.detect, w.heat);
    this.idle = speed < 5 && p.onGround && w.locked <= 0 ? this.idle + dt : 0;

    // Pull back at a run, lean in when the player stops, hides, or has someone to talk to.
    let zoom = zone?.zoom ?? BASE_ZOOM;
    if (speed > 70) zoom -= 0.05;
    if (this.idle > 3) zoom += 0.04;
    if (p.crouching) zoom += 0.07;
    if (w.near) zoom += 0.04;
    zoom = clamp(zoom + tension * 0.08, 1, 1.5);

    let x = p.cx + this.look + (zone?.offX ?? 0);
    if (w.near) {
      const tx = w.near.kind === 'npc' ? w.near.actor.x : w.near.it.x;
      x = lerp(x, (p.cx + tx) / 2, 0.5);
    }
    // Feet sit about two thirds of the way down the frame.
    let y = this.anchor - 47 / zoom + (zone?.offY ?? 0);
    if (zone?.lockY !== undefined) {
      // A locked horizon gives way toward the player as the frame tightens.
      y = lerp(zone.lockY + VIEW_H / 2, y, clamp((zoom - 1) * 2, 0, 0.75));
    }
    if (p.state === 'ladder' || p.state === 'hang' || p.state === 'climb') y -= 14;

    // Unease tilts the horizon; wind shoves it; a chase sets it swaying.
    const roll =
      Math.sin(w.time * 1.3) * 0.012 * tension +
      clamp(w.wind / 400, -1, 1) * 0.022 +
      (w.heat > 0.5 ? Math.sin(w.time * 0.8) * 0.016 : 0);
    // The lens leans a little the way she is going, so the street ahead opens up.
    return { x, y, zoom, roll, rack: zone?.rack ?? 0, shiftX: this.look * 0.6, shiftY: zone?.shiftY ?? SHIFT_Y };
  }

  /** A glance must never lose the player: hold them inside the frame, clear of its edges. */
  private keep(w: World, pose: Pose): Pose {
    const p = w.player;
    const hw = Math.max(0, VIEW_W / 2 / pose.zoom - 56);
    const hh = Math.max(0, VIEW_H / 2 / pose.zoom - 40);
    pose.x = clamp(pose.x, p.cx - hw, p.cx + hw);
    pose.y = clamp(pose.y, p.feet - 18 - hh, p.feet - 18 + hh);
    return pose;
  }

  /** Keep the visible (zoomed) region inside the level, then publish the pose. */
  private apply(w: World, pose: Pose): void {
    const hw = VIEW_W / 2 / pose.zoom;
    const hh = VIEW_H / 2 / pose.zoom;
    const cx = w.level.width > hw * 2 ? clamp(pose.x, hw, w.level.width - hw) : w.level.width / 2;
    const cy = w.level.height > hh * 2 ? clamp(pose.y, hh, w.level.height - hh) : w.level.height / 2;
    this.x = cx - VIEW_W / 2;
    this.y = cy - VIEW_H / 2;
    this.zoom = pose.zoom;
    this.roll = pose.roll;
    this.rack = pose.rack;
    this.shiftX = pose.shiftX;
    this.shiftY = pose.shiftY;
  }

  /** Put the camera on the player with no travel (spawn, restart). */
  snap(w: World): void {
    this.finishShot();
    this.shot = null;
    this.back = null;
    this.anchor = w.player.feet;
    this.look = w.player.facing * 30;
    this.idle = 0;
    this.game = this.gameplay(0, w);
    this.apply(w, this.game);
  }

  update(dt: number, w: World): void {
    const want = this.gameplay(dt, w);
    const g = this.game;
    g.x = damp(g.x, want.x, 4.2, dt);
    g.y = damp(g.y, want.y, 3.2, dt);
    g.zoom = damp(g.zoom, want.zoom, 1.4, dt);
    g.roll = damp(g.roll, want.roll, 2.5, dt);
    g.rack = damp(g.rack, want.rack, 1.5, dt);
    g.shiftX = damp(g.shiftX, want.shiftX, 1.2, dt);
    g.shiftY = damp(g.shiftY, want.shiftY, 1.2, dt);

    let pose: Pose = g;
    const s = this.shot;
    if (s) {
      if (s.t < 1) s.t = Math.min(1, s.t + dt / s.dur);
      const k = EASE[s.ease](s.t);
      const target = this.resolve(w, s.spec, s.from);
      pose = s.spec.weight !== undefined ? this.keep(w, mixPose(g, target, s.spec.weight * k)) : mixPose(s.from, target, k);
      if (s.t >= 1 && s.done) this.finishShot(true);
    } else if (this.back) {
      const b = this.back;
      b.t = Math.min(1, b.t + dt / b.dur);
      pose = mixPose(b.from, g, easeInOut(b.t));
      if (b.t >= 1) this.back = null;
    }
    this.apply(w, pose);
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }
}
