import type { Controls } from '../core/input';
import {
  approach,
  lerp,
  pointInRect,
  rectsOverlap,
  segmentHitsRect,
  type Rect,
} from '../core/math';
import type { Anim } from '../art/puppet';
import { Camera } from './camera';
import type { Combat } from './combat';
import type {
  CheckpointDef,
  DroneDef,
  InteractDef,
  Ladder,
  LevelData,
  MoverDef,
  NpcDef,
  PickupDef,
  Weather,
} from './level';

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------
export const RUN_SPEED = 94;
export const WALK_SPEED = 40;
export const JUMP_V = 262;
export const GRAVITY = 880;
export const MAX_FALL_V = 430;
/** Falling farther than this (px) is fatal. */
export const FATAL_FALL = 150;
export const PLAYER_W = 10;
export const PLAYER_H = 28;
const WALK_CYCLE = 21.4;
const RUN_CYCLE = 41.7;
const CLIMB_TIME = 0.5;
const LADDER_SPEED = 50;
/** Fraction of gust strength that becomes drift speed on an exposed body. */
const WIND_DRAG = 0.22;

export interface Fx {
  type: string;
  x: number;
  y: number;
  a?: number;
  s?: string;
}

export type FailReason = 'caught' | 'fall' | 'downed';

interface AutoMove {
  x: number;
  speed: number;
  done: () => void;
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------
export class Player {
  x = 0;
  y = 0;
  readonly w = PLAYER_W;
  readonly h = PLAYER_H;
  vx = 0;
  vy = 0;
  facing: 1 | -1 = 1;
  onGround = false;
  state: 'normal' | 'hang' | 'climb' | 'ladder' | 'dead' = 'normal';
  crouching = false;
  hidden = false;
  anim: Anim = 'idle';
  phase = 0;
  t = 0;
  ledge: { x: number; y: number; dir: 1 | -1 } | null = null;
  ladder: Ladder | null = null;
  riding: Mover | null = null;
  auto: AutoMove | null = null;
  /** Forces an animation while scripted (e.g. kneeling at a relay). */
  pose: Anim | null = null;
  private coyote = 0;
  private jumpBuf = 0;
  private landT = 1;
  private climbT = 0;
  private regrab = 0;
  private dropT = 0;
  private reachT = 1;
  private peakFeet = 0;

  get cx(): number {
    return this.x + this.w / 2;
  }
  get feet(): number {
    return this.y + this.h;
  }

  /** Where the puppet's feet are drawn (differs from the body while hanging). */
  get drawX(): number {
    return (this.state === 'hang' || this.state === 'climb') && this.ledge
      ? this.ledge.x - 5 * this.ledge.dir
      : this.cx;
  }
  get drawY(): number {
    return (this.state === 'hang' || this.state === 'climb') && this.ledge ? this.ledge.y + 31 : this.feet;
  }

  place(cx: number, feet: number): void {
    this.x = cx - this.w / 2;
    this.y = feet - this.h;
    this.vx = 0;
    this.vy = 0;
    this.peakFeet = feet;
  }

  reach(): void {
    this.reachT = 0;
  }

  update(dt: number, inp: Controls, w: World): void {
    this.t += dt;
    if (this.state === 'dead') return;
    this.regrab = Math.max(0, this.regrab - dt);
    this.dropT = Math.max(0, this.dropT - dt);

    let ax = 0;
    let up = false;
    let down = false;
    let jumpP = false;
    let jumpH = false;
    if (this.auto) {
      const d = this.auto.x - this.cx;
      if (Math.abs(d) < 1.5) {
        const done = this.auto.done;
        this.auto = null;
        this.vx = 0;
        done();
      } else ax = d > 0 ? 1 : -1;
    } else if (w.locked <= 0) {
      ax = (inp.held('right') ? 1 : 0) - (inp.held('left') ? 1 : 0);
      up = inp.held('up');
      down = inp.held('down');
      jumpP = inp.pressed('jump');
      jumpH = inp.held('jump');
    }

    if (this.state === 'hang') {
      this.vx = this.vy = 0;
      this.anim = 'hang';
      this.hidden = false;
      if (up || jumpP) {
        this.state = 'climb';
        this.climbT = 0;
        w.emit('climb', this.cx, this.y);
      } else if (down) {
        this.state = 'normal';
        this.regrab = 0.35;
        this.peakFeet = this.feet;
      }
      return;
    }

    if (this.state === 'climb') {
      this.climbT += dt / CLIMB_TIME;
      this.anim = 'climb';
      this.phase = this.climbT;
      if (this.climbT >= 1 && this.ledge) {
        this.place(this.ledge.x + 4 * this.ledge.dir, this.ledge.y);
        this.facing = this.ledge.dir;
        this.state = 'normal';
        this.onGround = true;
        this.anim = 'idle';
        this.landT = 1;
      }
      return;
    }

    if (this.state === 'ladder' && this.ladder) {
      const L = this.ladder;
      this.anim = 'ladder';
      this.vx = this.vy = 0;
      this.hidden = false;
      const dir = (down ? 1 : 0) - (up ? 1 : 0);
      const dy = dir * LADDER_SPEED * dt;
      const before = Math.floor(this.phase * 2);
      this.phase += Math.abs(dy) / 15;
      if (Math.floor(this.phase * 2) !== before) w.emit('rung', this.cx, this.feet);
      this.y += dy;
      this.x = L.x - this.w / 2;
      // Stepping sideways off either end is allowed, so the top never feels sticky.
      if (ax !== 0 && this.feet - L.y0 <= 6) {
        this.place(L.x, L.y0);
        this.facing = ax > 0 ? 1 : -1;
        this.state = 'normal';
        this.onGround = true;
        this.ladder = null;
        return;
      }
      if (ax !== 0 && L.y1 - this.feet <= 4) {
        this.place(L.x, L.y1);
        this.state = 'normal';
        this.ladder = null;
        return;
      }
      if (dir < 0 && this.feet <= L.y0) {
        this.place(L.x, L.y0);
        this.state = 'normal';
        this.onGround = true;
        this.ladder = null;
      } else if (dir > 0 && this.feet >= L.y1) {
        this.place(L.x, L.y1);
        this.state = 'normal';
        this.ladder = null;
      } else if (jumpP) {
        this.state = 'normal';
        this.ladder = null;
        this.vy = -150;
        this.vx = ax * 70;
        this.regrab = 0.25;
        this.peakFeet = this.feet;
      }
      return;
    }

    // ---- normal locomotion ----
    if (!this.auto && w.locked <= 0 && this.regrab <= 0) {
      if (up) {
        const L = w.ladderAt(this.cx, this.feet - 6);
        if (L && this.feet > L.y0 + 2) {
          this.enterLadder(L, w);
          return;
        }
      }
      if (down && this.onGround) {
        const L = w.ladderTopAt(this.cx, this.feet);
        if (L) {
          this.y += 5;
          this.enterLadder(L, w);
          return;
        }
      }
    }

    const walking = w.walkOnly || w.inWalkZone(this.cx, this.feet - 4);
    const maxSp = this.auto ? this.auto.speed : walking ? WALK_SPEED : RUN_SPEED;
    this.crouching = this.onGround && down && !this.auto;
    if (this.crouching) ax = 0;
    const acc = this.onGround ? (ax !== 0 ? 760 : 1050) : 470;
    // A gust drags an exposed body along with it; bracing (crouching) or shelter cancels it.
    const exposed = w.wind !== 0 && w.locked <= 0 && !this.crouching && !w.sheltered(this.cx, this.feet - 10);
    const push = exposed ? w.wind * WIND_DRAG : 0;
    this.vx = approach(this.vx, ax * maxSp + push, acc * dt);
    if (ax !== 0) this.facing = ax > 0 ? 1 : -1;

    this.jumpBuf = jumpP ? 0.12 : Math.max(0, this.jumpBuf - dt);
    this.coyote = this.onGround ? 0.1 : Math.max(0, this.coyote - dt);
    if (this.jumpBuf > 0 && this.coyote > 0) {
      if (down && w.standingOnOneWay(this)) {
        this.dropT = 0.24;
        this.y += 1;
      } else {
        this.vy = -JUMP_V;
        w.emit('jump', this.cx, this.feet);
      }
      this.jumpBuf = 0;
      this.coyote = 0;
      this.onGround = false;
      this.crouching = false;
    }
    if (!jumpH && this.vy < -95) this.vy = -95;

    const vy0 = this.vy;
    this.vy = Math.min(MAX_FALL_V, this.vy + GRAVITY * dt);
    const dy = (vy0 + this.vy) * 0.5 * dt;
    const wasGround = this.onGround;
    const x0 = this.x;
    const hitWall = w.moveX(this, this.vx * dt);
    if (hitWall) this.vx = 0;
    if (w.moveY(this, dy, this.dropT > 0)) this.vy = 0;
    const ground = this.vy >= 0 ? w.groundUnder(this, this.dropT > 0) : null;
    this.onGround = ground !== null;
    this.riding = ground instanceof Mover ? ground : null;
    const moved = Math.abs(this.x - x0);

    if (this.onGround) {
      if (!wasGround) {
        const fall = this.feet - this.peakFeet;
        if (fall > FATAL_FALL) {
          w.fail('fall');
          return;
        }
        if (fall > 6) {
          this.landT = fall > 40 ? 0 : 0.5;
          w.emit('land', this.cx, this.feet, fall);
        }
      }
      this.peakFeet = this.feet;
    } else {
      this.peakFeet = Math.min(this.peakFeet, this.feet);
      if (this.vy > -40 && this.regrab <= 0 && !this.auto) {
        const dir = ax !== 0 ? (ax > 0 ? 1 : -1) : hitWall ? this.facing : 0;
        if (dir !== 0) {
          const ledge = w.findLedge(this, dir as 1 | -1);
          if (ledge) {
            this.ledge = ledge;
            this.state = 'hang';
            this.facing = ledge.dir;
            this.x = ledge.x - 5 * ledge.dir - this.w / 2;
            this.y = ledge.y + 3;
            this.vx = this.vy = 0;
            this.anim = 'hang';
            w.emit('grab', ledge.x, ledge.y);
            return;
          }
        }
      }
    }

    this.hidden = this.crouching && Math.abs(this.vx) < 8 && w.inHide(this.cx, this.feet - 6);

    // ---- animation ----
    if (this.pose) {
      this.anim = this.pose;
    } else if (this.onGround) {
      this.landT += dt / 0.24;
      const sp = Math.abs(this.vx);
      if (this.crouching) this.anim = w.wind !== 0 ? 'brace' : 'crouch';
      else if (sp > 58) {
        const before = Math.floor(this.phase * 2);
        this.anim = 'run';
        this.phase += moved / RUN_CYCLE;
        if (Math.floor(this.phase * 2) !== before) w.emit('step', this.cx, this.feet, 1);
      } else if (sp > 5) {
        const before = Math.floor(this.phase * 2);
        this.anim = 'walk';
        this.phase += moved / WALK_CYCLE;
        if (Math.floor(this.phase * 2) !== before) w.emit('step', this.cx, this.feet, 0.5);
      } else if (this.landT < 1) {
        this.anim = 'land';
        this.phase = this.landT;
      } else if (this.reachT < 1) {
        this.anim = 'reach';
        this.phase = this.reachT;
        this.reachT += dt / 0.4;
      } else this.anim = 'idle';
    } else {
      this.anim = this.vy < 0 ? 'jump' : 'fall';
    }
  }

  private enterLadder(L: Ladder, w: World): void {
    this.state = 'ladder';
    this.ladder = L;
    this.x = L.x - this.w / 2;
    this.vx = this.vy = 0;
    this.crouching = false;
    w.emit('rung', this.cx, this.feet);
  }
}

// ---------------------------------------------------------------------------
// Non-player characters (kinematic)
// ---------------------------------------------------------------------------
export class Actor {
  readonly id: string;
  look: string;
  x: number;
  y: number;
  facing: 1 | -1;
  anim: Anim;
  idleAnim: Anim;
  phase = 0;
  t: number;
  visible: boolean;
  /** Stands behind counters and other mid-depth set dressing. */
  behind: boolean;
  prompt: string | null;
  extra: boolean;
  patrol: [number, number] | null;
  speed: number;
  auto: AutoMove | null = null;
  /** Scripted hop along an arc (kid crossing rooftop gaps). */
  hop: { x0: number; y0: number; x1: number; y1: number; t: number; dur: number; h: number; done: () => void } | null =
    null;
  talking = 0;
  /** Depth: 0 is the play plane (see NpcDef.z). */
  z: number;
  private wait = 0;
  private dirSign: 1 | -1 = 1;

  constructor(d: NpcDef, seed: number) {
    this.z = d.z ?? 0;
    this.id = d.id;
    this.look = d.look;
    this.x = d.x;
    this.y = d.y;
    this.facing = d.facing ?? 1;
    this.idleAnim = d.anim ?? 'idle';
    this.anim = this.idleAnim;
    this.visible = !d.hidden;
    this.behind = !!d.behind;
    this.prompt = d.prompt ?? null;
    this.extra = !!d.extra;
    this.patrol = d.patrol ?? null;
    this.speed = d.speed ?? 26;
    this.t = (seed % 97) / 9.7;
    this.phase = (seed % 13) / 13;
  }

  update(dt: number): void {
    this.t += dt;
    this.talking = Math.max(0, this.talking - dt);
    if (this.hop) {
      const h = this.hop;
      h.t += dt / h.dur;
      const u = Math.min(1, h.t);
      this.x = lerp(h.x0, h.x1, u);
      this.y = lerp(h.y0, h.y1, u) - Math.sin(Math.PI * u) * h.h;
      this.anim = u < 0.5 ? 'jump' : 'fall';
      if (h.x1 !== h.x0) this.facing = h.x1 > h.x0 ? 1 : -1;
      if (u >= 1) {
        this.hop = null;
        this.anim = this.idleAnim;
        h.done();
      }
      return;
    }
    if (this.auto) {
      const d = this.auto.x - this.x;
      const step = this.auto.speed * dt;
      if (Math.abs(d) <= step) {
        this.x = this.auto.x;
        const done = this.auto.done;
        this.auto = null;
        this.anim = this.idleAnim;
        done();
      } else {
        this.facing = d > 0 ? 1 : -1;
        this.x += this.facing * step;
        this.anim = this.auto.speed > 58 ? 'run' : 'walk';
        this.phase += step / (this.auto.speed > 58 ? RUN_CYCLE : WALK_CYCLE);
      }
      return;
    }
    if (this.patrol && this.talking <= 0) {
      if (this.wait > 0) {
        this.wait -= dt;
        this.anim = this.idleAnim;
        return;
      }
      const target = this.dirSign > 0 ? this.patrol[1] : this.patrol[0];
      const step = this.speed * dt;
      if (Math.abs(target - this.x) <= step) {
        this.x = target;
        this.dirSign = this.dirSign > 0 ? -1 : 1;
        this.wait = 1.2 + ((this.t * 7.3) % 2.6);
      } else {
        this.facing = target > this.x ? 1 : -1;
        this.x += this.facing * step;
        this.anim = 'walk';
        this.phase += step / WALK_CYCLE;
      }
      return;
    }
    this.anim = this.talking > 0 && this.idleAnim === 'idle' ? 'talk' : this.idleAnim;
  }
}

// ---------------------------------------------------------------------------
// Moving platforms
// ---------------------------------------------------------------------------
export class Mover implements Rect {
  readonly id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: string;
  occlude: boolean;
  active: boolean;
  dx = 0;
  dy = 0;
  private path: [number, number][];
  private seg = 0;
  private dir = 1;
  private speed: number;
  private pause: number;
  private wait = 0;
  private once: boolean;
  arrived = false;

  constructor(d: MoverDef) {
    this.id = d.id;
    this.x = d.x;
    this.y = d.y;
    this.w = d.w;
    this.h = d.h;
    this.kind = d.kind ?? 'platform';
    this.occlude = !!d.occlude;
    this.active = d.active ?? true;
    this.path = d.path;
    this.speed = d.speed;
    this.pause = d.pause ?? 0.8;
    this.once = !!d.once;
  }

  update(dt: number): void {
    this.dx = 0;
    this.dy = 0;
    if (!this.active || this.path.length < 2 || this.arrived) return;
    if (this.wait > 0) {
      this.wait -= dt;
      return;
    }
    const next = this.seg + this.dir;
    const target = this.path[next];
    if (!target) return;
    const tx = target[0] - this.x;
    const ty = target[1] - this.y;
    const d = Math.hypot(tx, ty);
    const step = this.speed * dt;
    if (d <= step) {
      this.dx = tx;
      this.dy = ty;
      this.seg = next;
      this.wait = this.pause;
      if (this.seg + this.dir < 0 || this.seg + this.dir >= this.path.length) {
        if (this.once) this.arrived = true;
        else this.dir = -this.dir;
      }
    } else {
      this.dx = (tx / d) * step;
      this.dy = (ty / d) * step;
    }
    this.x += this.dx;
    this.y += this.dy;
  }
}

// ---------------------------------------------------------------------------
// Listener drones
// ---------------------------------------------------------------------------
const angDiff = (a: number, b: number): number => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export class Drone {
  readonly id: string;
  x: number;
  y: number;
  active: boolean;
  range: number;
  half: number;
  /** Current cone direction (radians). */
  aim: number;
  /** Suspicion 0..1; at 1 the player is caught. */
  sus = 0;
  t = 0;
  vx = 0;
  private path: [number, number][];
  private seg = 0;
  private dir = 1;
  private speed: number;
  private pause: number;
  private wait = 0;
  private baseAim: number;
  private sweep: { amp: number; speed: number } | null;
  private loop: boolean;
  private relentless: boolean;
  private spotted = false;

  constructor(d: DroneDef) {
    this.id = d.id;
    this.path = d.path;
    this.x = d.path[0]![0];
    this.y = d.path[0]![1];
    this.speed = d.speed ?? 30;
    this.pause = d.pause ?? 1;
    this.range = d.range ?? 120;
    this.half = d.half ?? 0.36;
    this.baseAim = d.aim ?? Math.PI / 2;
    this.aim = this.baseAim;
    this.sweep = d.sweep ?? null;
    this.active = d.active ?? true;
    this.loop = !!d.loop;
    this.relentless = !!d.relentless;
  }

  /** Put the drone back at a point on its path (set pieces, restarts). */
  reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.seg = 0;
    this.dir = 1;
    this.wait = 0;
    this.sus = 0;
  }

  update(dt: number, w: World): void {
    this.t += dt;
    this.vx = 0;
    if (!this.active) {
      this.sus = Math.max(0, this.sus - dt);
      return;
    }
    const p = w.player;
    const tx = p.cx - this.x;
    const ty = p.y + 9 - this.y;
    const dist = Math.hypot(tx, ty);
    const toPlayer = Math.atan2(ty, tx);
    const seen =
      p.state !== 'dead' &&
      !p.hidden &&
      !w.stealthOff &&
      dist < this.range &&
      Math.abs(angDiff(toPlayer, this.aim)) < this.half &&
      w.los(this.x, this.y, p.cx, p.y + 9);

    if (seen) {
      this.sus = Math.min(1, this.sus + dt * lerp(2.3, 0.95, dist / this.range));
      if (!this.spotted) {
        this.spotted = true;
        w.emit('spot', this.x, this.y);
      }
    } else {
      this.sus = Math.max(0, this.sus - dt * 0.45);
      if (this.spotted && this.sus <= 0) {
        this.spotted = false;
        w.emit('lost', this.x, this.y);
      }
    }
    if (this.sus >= 1) {
      w.fail('caught');
      return;
    }

    const tracking = !this.relentless && this.sus > 0.12;
    if (tracking && seen) {
      this.aim += angDiff(toPlayer, this.aim) * Math.min(1, dt * 3.2);
    } else {
      let want = this.baseAim;
      if (this.sweep) want += Math.sin(this.t * this.sweep.speed) * this.sweep.amp;
      this.aim += angDiff(want, this.aim) * Math.min(1, dt * (tracking ? 1 : 4));
    }
    if (tracking) return;

    if (this.path.length < 2) return;
    if (this.wait > 0) {
      this.wait -= dt;
      return;
    }
    let next = this.seg + this.dir;
    if (this.loop) next = (next + this.path.length) % this.path.length;
    const target = this.path[next];
    if (!target) return;
    const dx = target[0] - this.x;
    const dy = target[1] - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (d <= step) {
      this.x = target[0];
      this.y = target[1];
      this.seg = next;
      this.wait = this.pause;
      if (!this.loop && (this.seg + this.dir < 0 || this.seg + this.dir >= this.path.length)) this.dir = -this.dir;
    } else {
      this.x += (dx / d) * step;
      this.y += (dy / d) * step;
      this.vx = (dx / d) * this.speed;
    }
  }
}

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------
export interface Pickup extends PickupDef {
  taken: boolean;
}

export interface Interact extends InteractDef {
  enabled: boolean;
}

export type Target = { kind: 'npc'; actor: Actor } | { kind: 'thing'; it: Interact };

export class World {
  readonly level: LevelData;
  readonly player = new Player();
  readonly camera = new Camera();
  actors: Actor[] = [];
  drones: Drone[] = [];
  movers: Mover[] = [];
  pickups: Pickup[] = [];
  interacts: Interact[] = [];
  time = 0;
  /** While > 0 the player ignores input (cutscenes). */
  locked = 0;
  walkOnly = false;
  /** Horizontal gust acceleration (px/s²). */
  wind = 0;
  /** Drones ignore the player (cutscenes, epilogue). */
  stealthOff = false;
  /** Highest drone suspicion this frame, 0..1. */
  detect = 0;
  /** Story-set urgency, 0..1 (a pursuit, a storm): the camera and score lean on it. */
  heat = 0;
  failed: FailReason | null = null;
  /** Story-driven switches the scenery reacts to (relays lit, lamps on). */
  signals: Record<string, number> = {};
  weather: Weather;
  fx: Fx[] = [];
  near: Target | null = null;
  /** The fight, while there is one (set up by the chapter): the rivet gun, health, Enforcers, the Undertow. */
  combat: Combat | null = null;
  checkpoint: CheckpointDef | null = null;
  readonly fired = new Set<string>();
  onTrigger: ((id: string) => void) | null = null;
  onInteract: ((t: Target) => void) | null = null;
  onPickup: ((p: Pickup) => void) | null = null;
  onCheckpoint: ((c: CheckpointDef) => void) | null = null;
  private timers: { at: number; fn: () => void }[] = [];
  private blockers: Rect[] = [];

  constructor(level: LevelData) {
    this.level = level;
    this.weather = { ...level.weather };
    this.actors = level.npcs.map((d, i) => new Actor(d, level.seed + i * 31));
    this.drones = level.drones.map((d) => new Drone(d));
    this.movers = level.movers.map((d) => new Mover(d));
    this.pickups = level.pickups.map((d) => ({ ...d, taken: false }));
    this.interacts = level.interacts.map((d) => ({ ...d, enabled: d.enabled ?? true }));
    this.blockers = [...level.solids, ...this.movers];
    this.player.place(level.spawn.x, level.spawn.y);
    this.player.facing = level.spawn.facing;
    this.camera.snap(this);
  }

  // ---- queries ----
  actor(id: string): Actor {
    const a = this.actors.find((x) => x.id === id);
    if (!a) throw new Error(`no actor "${id}" in ${this.level.id}`);
    return a;
  }
  drone(id: string): Drone {
    const d = this.drones.find((x) => x.id === id);
    if (!d) throw new Error(`no drone "${id}" in ${this.level.id}`);
    return d;
  }
  mover(id: string): Mover {
    const m = this.movers.find((x) => x.id === id);
    if (!m) throw new Error(`no mover "${id}" in ${this.level.id}`);
    return m;
  }
  thing(id: string): Interact {
    const m = this.interacts.find((x) => x.id === id);
    if (!m) throw new Error(`no interactable "${id}" in ${this.level.id}`);
    return m;
  }

  emit(type: string, x: number, y: number, a?: number, s?: string): void {
    this.fx.push({ type, x, y, a, s });
  }

  /** Run `fn` after `sec` of game time. */
  after(sec: number, fn: () => void): void {
    this.timers.push({ at: this.time + sec, fn });
  }

  solidAt(px: number, py: number): boolean {
    for (const r of this.blockers) if (pointInRect(px, py, r)) return true;
    return false;
  }

  rectBlocked(x: number, y: number, w: number, h: number): boolean {
    const q = { x, y, w, h };
    for (const r of this.blockers) if (rectsOverlap(q, r)) return true;
    return false;
  }

  inWalkZone(x: number, y: number): boolean {
    for (const z of this.level.walkZones) if (pointInRect(x, y, z)) return true;
    return false;
  }
  sheltered(x: number, y: number): boolean {
    for (const z of this.level.shelters) if (pointInRect(x, y, z)) return true;
    return false;
  }
  inHide(x: number, y: number): boolean {
    for (const z of this.level.hides) if (pointInRect(x, y, z)) return true;
    return false;
  }

  ladderAt(x: number, y: number): Ladder | null {
    for (const L of this.level.ladders) if (Math.abs(L.x - x) <= 6 && y >= L.y0 - 2 && y <= L.y1 + 2) return L;
    return null;
  }
  ladderTopAt(x: number, feet: number): Ladder | null {
    for (const L of this.level.ladders) if (Math.abs(L.x - x) <= 6 && Math.abs(L.y0 - feet) <= 2) return L;
    return null;
  }

  /** Line of sight: blocked by light-occluding solids. */
  los(x0: number, y0: number, x1: number, y1: number): boolean {
    for (const s of this.level.solids) if (s.occlude && segmentHitsRect(x0, y0, x1, y1, s)) return false;
    for (const m of this.movers) if (m.occlude && segmentHitsRect(x0, y0, x1, y1, m)) return false;
    return true;
  }

  // ---- collision ----
  /** Move horizontally; returns true if a wall stopped the body. */
  moveX(b: Rect, dx: number): boolean {
    let hit = false;
    let rem = dx;
    while (rem !== 0) {
      const s = Math.abs(rem) > 3 ? Math.sign(rem) * 3 : rem;
      b.x += s;
      rem -= s;
      for (const r of this.blockers) {
        if (rectsOverlap(b, r)) {
          b.x = s > 0 ? r.x - b.w : r.x + r.w;
          hit = true;
          rem = 0;
        }
      }
    }
    return hit;
  }

  /** Move vertically; returns true if floor or ceiling stopped the body. */
  moveY(b: Rect, dy: number, drop: boolean): boolean {
    let hit = false;
    let rem = dy;
    while (rem !== 0) {
      const s = Math.abs(rem) > 3 ? Math.sign(rem) * 3 : rem;
      const prevBottom = b.y + b.h;
      b.y += s;
      rem -= s;
      for (const r of this.blockers) {
        if (rectsOverlap(b, r)) {
          b.y = s > 0 ? r.y - b.h : r.y + r.h;
          hit = true;
          rem = 0;
        }
      }
      if (s > 0 && !drop) {
        for (const o of this.level.oneWays) {
          if (prevBottom <= o.y + 0.01 && b.y + b.h >= o.y && b.x + b.w > o.x && b.x < o.x + o.w) {
            b.y = o.y - b.h;
            hit = true;
            rem = 0;
          }
        }
      }
    }
    return hit;
  }

  /** What the body is standing on, if anything. */
  groundUnder(b: Rect, drop: boolean): Rect | null {
    const probe = { x: b.x, y: b.y + b.h, w: b.w, h: 1 };
    for (const r of this.blockers) if (rectsOverlap(probe, r)) return r;
    if (!drop) {
      const feet = b.y + b.h;
      for (const o of this.level.oneWays) {
        if (Math.abs(feet - o.y) < 0.5 && b.x + b.w > o.x && b.x < o.x + o.w) return { x: o.x, y: o.y, w: o.w, h: 1 };
      }
    }
    return null;
  }

  standingOnOneWay(b: Rect): boolean {
    const probe = { x: b.x, y: b.y + b.h, w: b.w, h: 1 };
    for (const r of this.blockers) if (rectsOverlap(probe, r)) return false;
    const feet = b.y + b.h;
    for (const o of this.level.oneWays) {
      if (Math.abs(feet - o.y) < 0.5 && b.x + b.w > o.x && b.x < o.x + o.w) return true;
    }
    return false;
  }

  /** A grabbable top corner in front of the player's hands. */
  findLedge(p: Player, dir: 1 | -1): { x: number; y: number; dir: 1 | -1 } | null {
    const edgeX = dir > 0 ? p.x + p.w : p.x;
    const ok = (cx: number, cy: number): boolean => {
      if (Math.abs(cx - edgeX) > 5) return false;
      if (cy < p.y - 5 || cy > p.y + 10) return false;
      // Not a seam in the middle of a taller wall.
      if (this.solidAt(cx + dir, cy - 1)) return false;
      // Room to stand on top, and room to hang below.
      if (this.rectBlocked(dir > 0 ? cx : cx - p.w, cy - p.h, p.w, p.h)) return false;
      const hx = cx - 5 * dir - p.w / 2;
      if (this.rectBlocked(hx, cy + 3, p.w, p.h)) return false;
      return true;
    };
    for (const s of this.level.solids) {
      const cx = dir > 0 ? s.x : s.x + s.w;
      if (ok(cx, s.y)) return { x: cx, y: s.y, dir };
    }
    for (const o of this.level.oneWays) {
      const cx = dir > 0 ? o.x : o.x + o.w;
      if (ok(cx, o.y)) return { x: cx, y: o.y, dir };
    }
    return null;
  }

  fail(reason: FailReason): void {
    if (this.failed) return;
    this.failed = reason;
    this.player.state = 'dead';
    this.player.vx = 0;
    this.emit(reason === 'caught' ? 'caught' : 'fell', this.player.cx, this.player.feet);
  }

  // ---- frame ----
  update(dt: number, inp: Controls): void {
    this.time += dt;
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.time);
      if (due.length) {
        this.timers = this.timers.filter((t) => t.at > this.time);
        for (const t of due) t.fn();
      }
    }

    const p = this.player;
    for (const m of this.movers) {
      const riding = p.riding === m && p.state === 'normal';
      m.update(dt);
      if (m.dx === 0 && m.dy === 0) continue;
      if (riding) {
        // Carry the rider; walls still stop them.
        p.x += m.dx;
        for (const r of this.level.solids) {
          if (rectsOverlap(p, r)) p.x = m.dx > 0 ? r.x - p.w : r.x + r.w;
        }
        p.y = m.y - p.h;
      } else if (rectsOverlap(p, m)) {
        if (Math.abs(m.dx) > Math.abs(m.dy)) p.x = m.dx > 0 ? m.x + m.w : m.x - p.w;
        else p.y = m.dy > 0 ? m.y + m.h : m.y - p.h;
      }
    }

    p.update(dt, inp, this);
    for (const a of this.actors) a.update(dt);
    this.combat?.update(dt, inp, this);

    let detect = 0;
    for (const d of this.drones) {
      d.update(dt, this);
      if (d.sus > detect) detect = d.sus;
    }
    this.detect = detect;

    if (p.state !== 'dead') {
      if (p.y > this.level.killY) this.fail('fall');

      const body = p as Rect;
      for (const pk of this.pickups) {
        if (!pk.taken && Math.abs(pk.x - p.cx) < 10 && Math.abs(pk.y - (p.y + 14)) < 18) {
          pk.taken = true;
          this.emit('pickup', pk.x, pk.y);
          this.onPickup?.(pk);
        }
      }
      for (const t of this.level.triggers) {
        if (!this.fired.has(t.id) && rectsOverlap(body, t)) {
          this.fired.add(t.id);
          this.onTrigger?.(t.id);
        }
      }
      for (const c of this.level.checkpoints) {
        if (this.checkpoint !== c && rectsOverlap(body, c) && p.onGround) {
          this.checkpoint = c;
          this.onCheckpoint?.(c);
        }
      }

      // Nearest thing the player could interact with.
      let best: Target | null = null;
      let bestD = Infinity;
      if (this.locked <= 0 && p.state === 'normal' && p.onGround && !p.auto) {
        for (const it of this.interacts) {
          if (!it.enabled) continue;
          const d = Math.abs(it.x - p.cx);
          if (d <= (it.r ?? 16) && Math.abs(it.y - p.feet) < 30 && d < bestD) {
            best = { kind: 'thing', it };
            bestD = d;
          }
        }
        for (const a of this.actors) {
          if (!a.visible || a.extra || !a.prompt) continue;
          const d = Math.abs(a.x - p.cx);
          if (d <= 26 && Math.abs(a.y - p.feet) < 24 && d < bestD) {
            best = { kind: 'npc', actor: a };
            bestD = d;
          }
        }
      }
      this.near = best;
      if (best && inp.pressed('interact')) {
        p.reach();
        if (best.kind === 'npc') p.facing = best.actor.x >= p.cx ? 1 : -1;
        this.onInteract?.(best);
      }
    } else {
      this.near = null;
    }

    this.camera.update(dt, this);
  }
}
