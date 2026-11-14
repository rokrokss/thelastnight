import type { Controls } from '../core/input';
import { Rng, rectsOverlap, type Rect } from '../core/math';
import type { Kaiju } from './kaiju';
import type { Mover, Player, World } from './world';

/**
 * Fighting, as simulation: Sol's rivet gun, her health, the Enforcers and
 * everything that flies between them. Like the rest of the world it knows
 * nothing about drawing or sound: it moves numbers and emits events.
 *
 * The rules a player has to read:
 *  - solids stop every round, hers and theirs;
 *  - crouching makes Sol short enough to be covered by a waist-high solid,
 *    standing or jumping puts her head and shoulders above it;
 *  - an Enforcer always shows a line before it fires, and fires where the
 *    line was when it locked.
 */

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------
/** Rivets in a full tank of pressure. */
export const MAG = 6;
export const MAX_HP = 3;
/** Seconds between rivets while the trigger is held. */
export const SHOT_GAP = 0.2;
/** Seconds the gun takes to build pressure again once it is empty. */
export const RECHARGE = 1.3;
/** Seconds of holding fire after which a part-used tank tops itself up. */
export const TOPUP_AFTER = 2.2;
/** Seconds without being hit before health starts coming back. */
export const REGEN_AFTER = 5;
/** Seconds per pip once it does. */
export const REGEN_STEP = 0.55;
/** Seconds of grace after a hit, so one burst costs one pip. */
export const INVULN = 0.7;
export const RIVET_SPEED = 560;
export const ROUND_SPEED = 330;
/** How far aim assist looks. */
export const ASSIST_RANGE = 420;
/** Aim assist cone: generous upward (latches, barbs), tighter downward. */
const ASSIST_UP = 1.05;
const ASSIST_DOWN = 0.5;
/** Height of Sol's hurt box while she is crouched. */
export const CROUCH_H = 14;
/** How high a solid may stand and still be cover you can shoot over. */
export const COVER_H = 22;

const SHOT_LIFE = 1.4;
/** An Enforcer holds its fire beyond this distance. */
const REACH = 440;

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Where along a segment (0..1) it first enters a rectangle; Infinity if it never does. */
export function segEnter(x0: number, y0: number, x1: number, y1: number, r: Rect): number {
  let tmin = 0;
  let tmax = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  for (let axis = 0; axis < 2; axis++) {
    const o = axis === 0 ? x0 : y0;
    const d = axis === 0 ? dx : dy;
    const lo = axis === 0 ? r.x : r.y;
    const hi = lo + (axis === 0 ? r.w : r.h);
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

/** The part of Sol a round can hit: all of her standing, the bottom of her crouched. */
export function solBox(p: Player): Rect {
  if (p.crouching) return { x: p.x, y: p.feet - CROUCH_H, w: p.w, h: CROUCH_H };
  return { x: p.x, y: p.y + 2, w: p.w, h: p.h - 2 };
}

/** What an Enforcer aims at: her head and shoulders standing, her middle crouched. */
export function solAim(p: Player): [number, number] {
  return p.crouching ? [p.cx, p.feet - CROUCH_H / 2] : [p.cx, p.y + 4];
}

/** The end of the rivet gun. */
export function solMuzzle(p: Player): [number, number] {
  return [p.cx + p.facing * 9, p.y + 4];
}

// ---------------------------------------------------------------------------
// Things that can be shot
// ---------------------------------------------------------------------------

export interface Shootable {
  /** What a rivet has to touch, or null while it cannot be hit at all. */
  hitbox(): Rect | null;
  /** Aim assist may lock on, for a shooter standing at `fromX`. */
  open(fromX: number): boolean;
  /** Take a rivet travelling with horizontal speed `vx`. False means it glanced off. */
  struck(w: World, c: Combat, x: number, y: number, vx: number): boolean;
  /** Horizontal speed, so a shot can lead it. */
  readonly vx: number;
}

/** A small fixture worth a rivet: a latch, a brake, a barb. */
export class Mark implements Shootable {
  readonly id: string;
  x: number;
  y: number;
  hp: number;
  readonly max: number;
  r: number;
  /** Only an armed mark can be hit or aimed at. */
  armed = false;
  /** Seconds since it last took a rivet (for a flash). */
  hitT = 9;
  readonly vx = 0;

  constructor(id: string, x: number, y: number, hp: number, r = 7) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.hp = hp;
    this.max = hp;
    this.r = r;
  }

  get gone(): boolean {
    return this.hp <= 0;
  }

  hitbox(): Rect | null {
    if (!this.armed || this.hp <= 0) return null;
    return { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 };
  }

  open(): boolean {
    return this.armed && this.hp > 0;
  }

  struck(w: World): boolean {
    this.hp--;
    this.hitT = 0;
    w.emit(this.hp > 0 ? 'clank' : 'snap', this.x, this.y);
    return true;
  }
}

// ---------------------------------------------------------------------------
// Enforcers
// ---------------------------------------------------------------------------

export type EnforcerKind = 'trooper' | 'shield';

export type EnforcerState =
  | 'wait'
  | 'walk'
  | 'duck'
  | 'rise'
  | 'aim'
  | 'fire'
  | 'recover'
  | 'stagger'
  | 'dead';

export interface EnforcerDef {
  id: string;
  kind?: EnforcerKind;
  /** Where it walks in from. */
  x: number;
  /** Feet height. */
  y: number;
  /** Positions it holds, in the order it advances through them. */
  posts: number[];
  /** Seconds before it sets off. */
  delay?: number;
  /** A shield unit that plants itself and never lowers the shield. */
  dug?: boolean;
  hp?: number;
}

/** Seconds from standing up to the first round: the whole of the warning. */
export const TELL: Record<EnforcerKind, number> = { trooper: 0.97, shield: 1.3 };
/** The last part of the aim, when the line stops following and holds. */
export const LOCK = 0.25;
const RISE: Record<EnforcerKind, number> = { trooper: 0.22, shield: 0.34 };
const BURST: Record<EnforcerKind, number> = { trooper: 3, shield: 4 };
const ROUND_GAP = 0.1;
const RECOVER: Record<EnforcerKind, number> = { trooper: 0.35, shield: 0.55 };
const WALK: Record<EnforcerKind, number> = { trooper: 46, shield: 34 };
const HP: Record<EnforcerKind, number> = { trooper: 2, shield: 3 };
const HALF_W: Record<EnforcerKind, number> = { trooper: 6, shield: 8 };
export const UP_H: Record<EnforcerKind, number> = { trooper: 34, shield: 36 };
export const DUCK_H = 16;

/**
 * A Meridian security machine. Troopers work from cover: stay down, stand up,
 * show a line, fire a short burst, drop. Shield units carry their cover with
 * them and have to lower it to shoot.
 */
export class Enforcer implements Shootable {
  readonly id: string;
  readonly kind: EnforcerKind;
  x: number;
  y: number;
  facing: 1 | -1 = -1;
  state: EnforcerState = 'wait';
  /** Seconds in the current state. */
  t = 0;
  hp: number;
  vx = 0;
  /** Walk cycle, for drawing. */
  phase = 0;
  /** Where the line points. Fixed once `locked`. */
  aimX = 0;
  aimY = 0;
  locked = false;
  /** Seconds since it was last hit (for a flash). */
  hitT = 9;
  readonly dug: boolean;
  private posts: number[];
  private post = 0;
  private delay: number;
  private hold = 0;
  private cycles = 0;
  private burst = 0;
  private roundT = 0;
  private cover: Rect | null = null;
  private rng: Rng;

  constructor(d: EnforcerDef, seed: number) {
    this.id = d.id;
    this.kind = d.kind ?? 'trooper';
    this.x = d.x;
    this.y = d.y;
    this.posts = d.posts;
    this.delay = d.delay ?? 0;
    this.dug = !!d.dug;
    this.hp = d.hp ?? HP[this.kind];
    this.rng = new Rng(seed);
    if (this.posts.length > 0 && this.posts[0]! !== this.x) this.facing = this.posts[0]! > this.x ? 1 : -1;
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  /** Standing tall enough to be shot over cover. */
  get up(): boolean {
    if (this.kind === 'shield') return this.state !== 'dead';
    return this.state === 'walk' || this.state === 'wait' || this.state === 'rise' || this.state === 'aim' || this.state === 'fire' || this.state === 'recover' || this.state === 'stagger';
  }

  /** A shield unit with its shield raised turns rivets from the front. */
  get shielded(): boolean {
    return this.kind === 'shield' && (this.state === 'wait' || this.state === 'walk' || this.state === 'duck');
  }

  /** The line is showing. */
  get aiming(): boolean {
    return this.state === 'aim';
  }

  /** Where it will go next, so two units never choose the same spot. */
  get goal(): number {
    return this.posts[this.post] ?? this.x;
  }

  muzzle(): [number, number] {
    return this.kind === 'shield' ? [this.x + this.facing * 11, this.y - 24] : [this.x + this.facing * 10, this.y - 26];
  }

  hitbox(): Rect | null {
    if (this.state === 'dead') return null;
    const hw = HALF_W[this.kind];
    const h = this.up ? UP_H[this.kind] : DUCK_H;
    return { x: this.x - hw, y: this.y - h, w: hw * 2, h };
  }

  open(fromX: number): boolean {
    if (this.state === 'dead') return false;
    if (!this.shielded) return true;
    // Behind its shield it can only be taken from the back.
    return (fromX - this.x) * this.facing < 0;
  }

  struck(w: World, _c: Combat, x: number, y: number, vx: number): boolean {
    if (this.shielded && vx * this.facing < 0) {
      w.emit('deflect', x, y);
      return false;
    }
    this.hp--;
    this.hitT = 0;
    if (this.hp <= 0) {
      this.kill(w);
      return true;
    }
    w.emit('clank', x, y);
    // A hit knocks it off its aim: the burst never comes.
    this.go('stagger');
    return true;
  }

  kill(w: World): void {
    if (this.state === 'dead') return;
    this.go('dead');
    this.vx = 0;
    w.emit('wreck', this.x, this.y - 14);
  }

  private go(s: EnforcerState): void {
    this.state = s;
    this.t = 0;
    this.locked = false;
  }

  private settle(w: World): void {
    // Whatever low solid stands between it and the way it faces is its cover.
    this.cover = null;
    const f = this.facing;
    const rects: Rect[] = [...w.level.solids, ...w.movers];
    for (const s of rects) {
      // Only something it can shoot over counts; behind anything taller it would be firing blind.
      if (s.h > COVER_H + 4 || s.y > this.y - 6 || s.y + s.h < this.y - 1) continue;
      const gap = f > 0 ? s.x - this.x : this.x - (s.x + s.w);
      if (gap >= 0 && gap <= 24) this.cover = s;
    }
    this.cycles = 0;
    this.hold = this.kind === 'shield' ? this.rng.range(0.6, 1.1) : this.rng.range(0.5, 1.2);
    this.go('duck');
  }

  update(dt: number, w: World, c: Combat): void {
    this.t += dt;
    this.hitT += dt;
    this.vx = 0;
    const p = w.player;
    const face = (): void => {
      this.facing = p.cx >= this.x ? 1 : -1;
    };
    switch (this.state) {
      case 'wait':
        if (this.t >= this.delay) this.go('walk');
        break;

      case 'walk': {
        const tx = this.goal;
        const d = tx - this.x;
        const step = WALK[this.kind] * dt;
        if (Math.abs(d) <= step) {
          this.x = tx;
          face();
          this.settle(w);
        } else {
          const dir = d > 0 ? 1 : -1;
          // A shield unit keeps its shield toward her even when backing off.
          if (this.kind === 'shield') face();
          else this.facing = dir;
          this.x += dir * step;
          this.vx = dir * WALK[this.kind];
          this.phase += step / 14;
        }
        break;
      }

      case 'duck': {
        face();
        if (this.dug || this.t < this.hold) break;
        // Nothing stands up while a scene is playing.
        if (w.locked > 0 || p.state === 'dead') break;
        // Out of reach it closes in rather than shoot; in reach it moves up after a burst or two.
        const far = Math.abs(p.cx - this.x) > REACH;
        const next = this.posts[this.post + 1];
        const patience = this.kind === 'shield' ? 1 : 2;
        if (
          next !== undefined &&
          (far || this.cycles >= patience) &&
          Math.abs(next - p.cx) > 70 &&
          (next - p.cx) * (this.x - p.cx) > 0 &&
          !c.enforcers.some((e) => e !== this && e.alive && Math.abs(e.goal - next) < 12)
        ) {
          this.post++;
          this.go('walk');
        } else if (!far) this.go('rise');
        break;
      }

      case 'rise':
        face();
        if (this.t >= RISE[this.kind]) {
          [this.aimX, this.aimY] = solAim(p);
          this.go('aim');
        }
        break;

      case 'aim': {
        face();
        const len = TELL[this.kind] - RISE[this.kind];
        if (this.t < len - LOCK) [this.aimX, this.aimY] = solAim(p);
        else if (!this.locked) {
          this.locked = true;
          w.emit('aim', this.x, this.y - 26);
        }
        if (this.t >= len) {
          this.go('fire');
          this.locked = true;
          this.burst = BURST[this.kind];
          this.roundT = 0;
        }
        break;
      }

      case 'fire':
        this.locked = true;
        this.roundT -= dt;
        if (this.burst > 0 && this.roundT <= 0) {
          const [mx, my] = this.muzzle();
          c.round(w, mx, my, this.aimX, this.aimY, this.cover);
          this.burst--;
          this.roundT += ROUND_GAP;
        }
        if (this.burst <= 0 && this.roundT <= 0) this.go('recover');
        break;

      case 'recover':
        if (this.t >= RECOVER[this.kind]) {
          this.cycles++;
          this.hold = this.kind === 'shield' ? this.rng.range(0.9, 1.5) : this.rng.range(1.1, 2.3);
          this.go('duck');
        }
        break;

      case 'stagger':
        if (this.t >= 0.45) {
          // Caught on its way in, it carries on to its post; otherwise it gets back down.
          if (Math.abs(this.goal - this.x) > 1) this.go('walk');
          else {
            this.hold = this.rng.range(0.7, 1.3);
            this.go('duck');
          }
        }
        break;

      case 'dead':
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Rounds in flight
// ---------------------------------------------------------------------------

export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  from: 'sol' | 'foe';
  life: number;
  /** The shooter's own cover: its rounds leave over the top of it. */
  ignore: Rect | null;
}

export interface Aim {
  x: number;
  y: number;
  on: Shootable;
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

export class Combat {
  /** Sol has the rivet gun out. */
  armed = false;
  hp = MAX_HP;
  /** Rivets left before the gun has to build pressure again. */
  pressure = MAG;
  /** Seconds until an empty gun is ready (0 when it is not recharging). */
  recharge = 0;
  /** Seconds since the last rivet left the gun (muzzle flash, recoil). */
  flash = 9;
  /** Direction of the last rivet. */
  aimX = 1;
  aimY = 0;
  /** Seconds of grace left after a hit. */
  invuln = 0;
  /** Seconds since she was last hit. */
  sinceHit = 99;
  /**
   * Nothing can hurt Sol (story playthroughs and film sets). The fight still
   * runs: enemies shoot and the creature strikes, to no effect.
   */
  harmless = false;
  enforcers: Enforcer[] = [];
  marks: Mark[] = [];
  shots: Shot[] = [];
  kaiju: Kaiju | null = null;
  private cooldown = 0;
  private idle = 0;
  private wantFire = 0;
  private trigger = false;
  private regenT = 0;
  private falling: Mover[] = [];
  private seed = 7001;

  // ---- setting up ----

  spawn(defs: EnforcerDef[]): Enforcer[] {
    const made = defs.map((d) => new Enforcer(d, (this.seed += 7919)));
    this.enforcers.push(...made);
    return made;
  }

  mark(id: string, x: number, y: number, hp: number, r?: number): Mark {
    const m = new Mark(id, x, y, hp, r);
    this.marks.push(m);
    return m;
  }

  /** How many Enforcers are still standing. */
  get standing(): number {
    let n = 0;
    for (const e of this.enforcers) if (e.alive) n++;
    return n;
  }

  /** Let a hung container go. It crushes any Enforcer under it. */
  drop(w: World, id: string): void {
    const m = w.mover(id);
    if (m.arrived || this.falling.includes(m)) return;
    m.active = true;
    this.falling.push(m);
    w.emit('unlatch', m.x + m.w / 2, m.y);
  }

  // ---- queries ----

  private *shootables(): Generator<Shootable> {
    for (const e of this.enforcers) yield e;
    for (const m of this.marks) yield m;
    if (this.kaiju) for (const b of this.kaiju.barbs) yield b;
  }

  /** True if nothing solid lies on the line between two points. */
  clear(w: World, x0: number, y0: number, x1: number, y1: number, ignore: Rect | null = null): boolean {
    for (const s of w.level.solids) if (s !== ignore && segEnter(x0, y0, x1, y1, s) !== Infinity) return false;
    for (const m of w.movers) if (m !== ignore && segEnter(x0, y0, x1, y1, m) !== Infinity) return false;
    return true;
  }

  /** What the gun would be pointed at right now: the nearest open target in front of her, if any. */
  aimTarget(w: World): Aim | null {
    const p = w.player;
    const [mx, my] = solMuzzle(p);
    let best: Aim | null = null;
    let bestScore = Infinity;
    for (const s of this.shootables()) {
      if (!s.open(p.cx)) continue;
      const hb = s.hitbox();
      if (!hb) continue;
      let tx = hb.x + hb.w / 2;
      // The top of it: the part that shows over whatever it is standing behind.
      const ty = hb.y + Math.min(hb.h / 2, 7);
      let dx = tx - mx;
      const dy = ty - my;
      if (dx * p.facing < 4) continue;
      const dist = Math.hypot(dx, dy);
      if (dist > ASSIST_RANGE) continue;
      const ang = Math.atan2(dy, Math.abs(dx));
      if (ang < -ASSIST_UP || ang > ASSIST_DOWN) continue;
      // Lead a walking target by the time the rivet takes to arrive.
      tx += s.vx * (dist / RIVET_SPEED);
      dx = tx - mx;
      if (!this.clear(w, mx, my, tx, ty)) continue;
      const score = dist * (1 + 1.2 * Math.abs(ang));
      if (score < bestScore) {
        bestScore = score;
        best = { x: tx, y: ty, on: s };
      }
    }
    return best;
  }

  // ---- being hit ----

  /** Take `dmg` pips off Sol. Returns whether it landed. */
  hurt(w: World, dmg: number): boolean {
    const p = w.player;
    if (this.harmless || this.invuln > 0 || w.failed || p.state === 'dead' || w.locked > 0) return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.sinceHit = 0;
    this.regenT = 0;
    this.invuln = INVULN;
    w.emit('hurt', p.cx, p.y + 10, dmg);
    w.camera.addShake(0.25 + 0.12 * dmg);
    if (this.hp <= 0) {
      w.fail('downed');
      p.anim = 'crouch';
    }
    return true;
  }

  // ---- shooting ----

  /** An Enforcer's round, from its muzzle toward a point. */
  round(w: World, x: number, y: number, tx: number, ty: number, ignore: Rect | null): void {
    const d = Math.hypot(tx - x, ty - y) || 1;
    this.shots.push({
      x,
      y,
      vx: ((tx - x) / d) * ROUND_SPEED,
      vy: ((ty - y) / d) * ROUND_SPEED,
      from: 'foe',
      life: SHOT_LIFE,
      ignore,
    });
    w.emit('round', x, y);
  }

  private rivet(w: World): void {
    const p = w.player;
    const [mx, my] = solMuzzle(p);
    this.cooldown = SHOT_GAP;
    this.idle = 0;
    this.pressure--;
    let dx: number = p.facing;
    let dy = 0;
    const aim = this.aimTarget(w);
    if (aim) {
      const d = Math.hypot(aim.x - mx, aim.y - my) || 1;
      dx = (aim.x - mx) / d;
      dy = (aim.y - my) / d;
    }
    this.aimX = dx;
    this.aimY = dy;
    this.flash = 0;
    this.shots.push({ x: mx, y: my, vx: dx * RIVET_SPEED, vy: dy * RIVET_SPEED, from: 'sol', life: SHOT_LIFE, ignore: null });
    w.emit('rivet', mx, my);
    if (this.pressure <= 0) this.recharge = RECHARGE;
  }

  private flyShots(dt: number, w: World): void {
    const p = w.player;
    const live: Shot[] = [];
    for (const s of this.shots) {
      const nx = s.x + s.vx * dt;
      const ny = s.y + s.vy * dt;
      let best = Infinity;
      let what: Shootable | 'solid' | 'sol' | null = null;
      for (const r of w.level.solids) {
        if (r === s.ignore) continue;
        const t = segEnter(s.x, s.y, nx, ny, r);
        if (t < best) {
          best = t;
          what = 'solid';
        }
      }
      for (const r of w.movers) {
        if (r === s.ignore) continue;
        const t = segEnter(s.x, s.y, nx, ny, r);
        if (t < best) {
          best = t;
          what = 'solid';
        }
      }
      if (s.from === 'sol') {
        for (const target of this.shootables()) {
          const hb = target.hitbox();
          if (!hb) continue;
          const t = segEnter(s.x, s.y, nx, ny, hb);
          if (t < best) {
            best = t;
            what = target;
          }
        }
      } else if (p.state !== 'dead') {
        const t = segEnter(s.x, s.y, nx, ny, solBox(p));
        if (t < best) {
          best = t;
          what = 'sol';
        }
      }
      if (what === null) {
        s.x = nx;
        s.y = ny;
        s.life -= dt;
        if (s.life > 0 && nx > -60 && nx < w.level.width + 60 && ny > -200 && ny < w.level.height + 60) live.push(s);
        continue;
      }
      const hx = s.x + (nx - s.x) * best;
      const hy = s.y + (ny - s.y) * best;
      if (what === 'solid') w.emit('ricochet', hx, hy, s.from === 'sol' ? 0 : 1);
      else if (what === 'sol') {
        // A round that arrives during the grace after a hit is spent all the same.
        this.hurt(w, 1);
      } else what.struck(w, this, hx, hy, s.vx);
    }
    this.shots = live;
  }

  private settleBoxes(w: World): void {
    if (this.falling.length === 0) return;
    const p = w.player;
    const still: Mover[] = [];
    for (const m of this.falling) {
      // Everything the box will pass through before the next step.
      const sweep = { x: m.x + 1, y: m.y, w: m.w - 2, h: m.h + 10 };
      for (const e of this.enforcers) {
        const hb = e.hitbox();
        if (hb && rectsOverlap(hb, sweep)) e.kill(w);
      }
      if (!m.arrived && p.state !== 'dead' && rectsOverlap(p, sweep)) {
        // Standing under your own falling box is on you; step her clear of the steel either way.
        const left = p.cx < m.x + m.w / 2;
        p.x = left ? m.x - p.w - 1 : m.x + m.w + 1;
        this.invuln = 0;
        this.hurt(w, MAX_HP);
      }
      if (m.arrived) {
        w.emit('crash', m.x + m.w / 2, m.y + m.h);
        w.camera.addShake(0.9);
      } else still.push(m);
    }
    this.falling = still;
  }

  // ---- frame ----

  update(dt: number, inp: Controls, w: World): void {
    const p = w.player;
    this.flash += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.sinceHit += dt;
    for (const m of this.marks) m.hitT += dt;

    // Health comes back once she has been left alone for a while.
    if (this.hp < MAX_HP && this.hp > 0 && this.sinceHit >= REGEN_AFTER) {
      this.regenT += dt;
      if (this.regenT >= REGEN_STEP) {
        this.regenT = 0;
        this.hp++;
        w.emit('heal', p.cx, p.y);
      }
    }

    // Pressure: an empty gun recharges by itself; a part-used one tops up when rested.
    if (this.pressure <= 0) {
      this.recharge -= dt;
      if (this.recharge <= 0) {
        this.recharge = 0;
        this.pressure = MAG;
        w.emit('recharge', p.cx, p.y + 6);
      }
    } else if (this.pressure < MAG) {
      this.idle += dt;
      if (this.idle >= TOPUP_AFTER) {
        this.pressure = MAG;
        w.emit('recharge', p.cx, p.y + 6);
      }
    }

    // The trigger. A press just before the gun is ready still counts, and holding it keeps firing;
    // but it has to have been pulled while she had the gun in play, not left held from a menu or a scene.
    const live = this.armed && w.locked <= 0 && !p.auto;
    const can = live && p.state === 'normal' && !p.crouching;
    if (!inp.held('fire') || !live) this.trigger = false;
    if (inp.pressed('fire') && live) {
      this.trigger = true;
      this.wantFire = 0.15;
      if (can && this.pressure <= 0) w.emit('dry', p.cx, p.y + 6);
    } else this.wantFire = Math.max(0, this.wantFire - dt);
    if (can && this.pressure > 0 && this.cooldown <= 0 && (this.wantFire > 0 || (this.trigger && inp.held('fire')))) {
      this.wantFire = 0;
      this.rivet(w);
    }

    for (const e of this.enforcers) e.update(dt, w, this);
    this.kaiju?.update(dt, w, this);
    this.flyShots(dt, w);
    this.settleBoxes(w);
  }
}
