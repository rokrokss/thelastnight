import { clamp, lerp, rectsOverlap, type Rect } from '../core/math';
import { Mark, type Combat } from './combat';
import type { Mover, World } from './world';

/**
 * The Undertow, as simulation: where its limbs are, what it is about to do,
 * which of the cable barbs in its hide can be reached. It stands far out in
 * the channel; only its limbs, the water it throws and the things it throws
 * ever arrive on the quay, so that is all this models.
 *
 * Every attack is a warning first, then a strike:
 *  - slam:  a marked stretch of deck; move out of it, or be under the deck;
 *  - sweep: a limb dragged along the deck; jump it, or be under the deck;
 *  - wave:  water across the whole deck; be on a ladder or on something tall;
 *  - throw: a container, onto a marked spot.
 *
 * A phase runs: assault (shoot the hooks off the planted limb) → pressed (it
 * will not lift its head until the quay makes it) → reared → stunned (the
 * root barb is in reach) → cleared.
 */

export interface Arena {
  /** The stretch of quay it can reach. */
  x0: number;
  x1: number;
  /** Feet height on the main deck. */
  deck: number;
  /** The space under the deck grating, out of reach of its limbs. */
  trench: Rect | null;
  /** Left edges of the places a thrown container may come down. */
  slots: number[];
  /** Mover ids of the containers it can throw. */
  boxes: string[];
}

export type KaijuMode =
  | 'under'
  | 'rising'
  | 'looming'
  | 'assault'
  | 'pressed'
  | 'reared'
  | 'stunned'
  | 'reeling'
  | 'freed'
  | 'sinking'
  | 'gone';

export type AttackKind = 'slam' | 'sweep' | 'wave' | 'throw';
export type Move = AttackKind | 'slam2';
export type AttackStage = 'tell' | 'strike' | 'hold' | 'lift';

/** What it takes to make it lift its head once the hooks are out. */
export type Opener = 'none' | 'floods' | 'crane';

export interface PhaseDef {
  /** Moves it cycles through while it still has hooks in it. */
  pattern: Move[];
  /** Moves it falls back on while it waits, head down, for the quay's answer. */
  pressed: Move[];
  hooks: number;
  /** Seconds of warning before a slam lands. */
  tell: number;
  /** Seconds a planted limb stays down. */
  hold: number;
  /** Seconds between attacks. */
  gap: number;
  opener: Opener;
}

export const PHASES: PhaseDef[] = [
  { pattern: ['slam'], pressed: ['slam'], hooks: 2, tell: 1.5, hold: 5, gap: 1.5, opener: 'none' },
  { pattern: ['slam', 'sweep', 'slam', 'wave'], pressed: ['sweep', 'wave'], hooks: 2, tell: 1.3, hold: 4.4, gap: 1.3, opener: 'floods' },
  { pattern: ['slam2', 'throw', 'sweep', 'slam', 'wave', 'throw'], pressed: ['sweep', 'slam2', 'wave'], hooks: 2, tell: 1.15, hold: 4, gap: 1.1, opener: 'crane' },
];

export const SLAM_W = 84;
export const SLAM_DMG = 2;
export const SWEEP_H = 14;
export const SWEEP_LEN = 46;
export const SWEEP_SPEED = 250;
export const SWEEP_TELL = 1.3;
export const WAVE_H = 24;
export const WAVE_LEN = 150;
export const WAVE_SPEED = 200;
export const WAVE_TELL = 2.2;
export const THROW_DMG = 2;
/** Seconds a thrown container is in the air. */
export const THROW_FLIGHT = 0.8;
/** Seconds a limb takes to leave the deck. */
export const LIFT = 0.8;
/** Seconds it takes to come up out of the channel, and to go back. */
export const RISE_TIME = 7;
export const SINK_TIME = 9;
/** How far above the deck a hook sits on a planted limb. */
export const HOOK_Y = 46;
const ROOT_Y = 28;

/** A cable barb in its hide. Hooks ride the limb that is planted; the root shows only while it is stunned. */
export class Barb extends Mark {
  readonly kind: 'hook' | 'root';
  readonly phase: number;

  constructor(id: string, kind: 'hook' | 'root', phase: number) {
    super(id, 0, 0, kind === 'hook' ? 3 : 5, kind === 'hook' ? 8 : 10);
    this.kind = kind;
    this.phase = phase;
  }

  override struck(w: World): boolean {
    this.hp--;
    this.hitT = 0;
    w.emit(this.hp > 0 ? 'barbhit' : 'barb', this.x, this.y);
    return true;
  }
}

/** One place a limb (or a container) comes down. */
export interface Zone {
  x0: number;
  x1: number;
  limb: 0 | 1;
  /** Seconds into the attack at which it lands. */
  at: number;
  landed: boolean;
}

export interface Attack {
  kind: AttackKind;
  /** Seconds since it began. */
  t: number;
  /** Seconds of warning before the first strike. */
  tell: number;
  stage: AttackStage;
  zones: Zone[];
  /** Travel direction of a sweep or a wave. */
  dir: 1 | -1;
  /** Leading edge of a sweep or a wave. */
  pos: number;
  hold: number;
  /** Seconds into the attack at which the limbs began to lift. */
  liftAt: number;
  /** It has already cost Sol what it is going to. */
  hit: boolean;
  /** The barb showing on the planted limb. */
  hook: Barb | null;
  box: Mover | null;
  /** Where a thrown container starts from. */
  from: [number, number];
}

export class Kaiju {
  readonly arena: Arena;
  mode: KaijuMode = 'under';
  /** 1..3 once the fight is on. */
  phase = 0;
  /** The last phase whose root barb is out. */
  cleared = 0;
  /** Seconds in the current mode. */
  t = 0;
  /** 0 under the water, 1 standing in the channel. */
  rise = 0;
  /** Poses, eased 0..1, for whoever draws it. */
  rear = 0;
  slump = 0;
  calm = 0;
  /** 0..1: how much floodlight is on it. */
  lit = 0;
  floods = false;
  /** 1 at the moment a barb comes out, decaying. */
  pain = 0;
  /** 0..1: how far the crane's load has swung out at it (the story drives this). */
  swing = 0;
  /** 0..1 for each arm: how far it is lifted over the quay. */
  raise: [number, number] = [0, 0];
  /** 0..1: how hard the water round it is churning. */
  churn = 0;
  /** 1 at the instant the relay's pulse hits it, decaying. */
  shock = 0;
  /** Seconds since each phase's length of cable was cut loose (-1 while it is still on). */
  cut: number[] = PHASES.map(() => -1);
  attack: Attack | null = null;
  readonly barbs: Barb[] = [];
  /** Where the wrist of its limb lies while it is stunned, and which way the arm runs from there. */
  restX: number;
  restDir: 1 | -1 = 1;
  private step = 0;
  private gap = 0;
  private limb: 0 | 1 = 0;
  private thrown = 0;

  constructor(arena: Arena) {
    this.arena = arena;
    this.restX = (arena.x0 + arena.x1) / 2;
    PHASES.forEach((ph, i) => {
      for (let h = 0; h < ph.hooks; h++) this.barbs.push(new Barb(`p${i + 1}h${h + 1}`, 'hook', i + 1));
      this.barbs.push(new Barb(`p${i + 1}r`, 'root', i + 1));
    });
  }

  // ---- direction (the story calls these) ----

  /** Come up out of the channel. */
  surface(): void {
    this.mode = 'rising';
    this.t = 0;
  }

  /** Already up (a restart from a checkpoint). */
  stand(): void {
    this.mode = 'looming';
    this.rise = 1;
    this.t = 0;
  }

  /** Start a phase (optionally some moves into its pattern). Everything from earlier phases is already out. */
  begin(phase: number, from = 0): void {
    this.phase = phase;
    this.cleared = phase - 1;
    for (const b of this.barbs) {
      b.armed = false;
      if (b.phase < phase) b.hp = 0;
    }
    this.mode = 'assault';
    this.rise = 1;
    this.t = 0;
    this.step = from;
    this.gap = 1.6;
    this.attack = null;
  }

  /** It throws its head back: whatever it was doing is abandoned. */
  rearUp(w: World): void {
    if (this.mode === 'reared') return;
    this.abandon();
    this.mode = 'reared';
    this.t = 0;
    w.emit('roar', w.player.cx, this.arena.deck - 120, 0);
  }

  /** The relay's pulse drops it: its limb lies along the quay with the root barb in reach. */
  stunNow(w: World): void {
    const ar = this.arena;
    const p = w.player;
    this.abandon();
    this.mode = 'stunned';
    this.t = 0;
    this.shock = 1;
    const mid = (ar.x0 + ar.x1) / 2;
    // Its wrist comes down a little way off from her, toward the middle of the quay,
    // and never where a container would stand between her and the barb.
    const side = p.cx < mid ? 1 : -1;
    const boxed = (x: number): boolean => w.rectBlocked(x - 16, ar.deck - 36, 32, 8);
    let rest = clamp(p.cx + side * 96, ar.x0 + 70, ar.x1 - 70);
    for (let i = 0; i < 12 && boxed(rest); i++) rest = clamp(rest + side * 24, ar.x0 + 70, ar.x1 - 70);
    for (let i = 0; i < 12 && boxed(rest); i++) rest = clamp(rest - side * 24, ar.x0 + 70, ar.x1 - 70);
    this.restX = rest;
    this.restDir = this.restX >= p.cx ? 1 : -1;
    const root = this.root(this.phase);
    if (root) {
      root.x = this.restX;
      root.y = ar.deck - ROOT_Y;
      root.armed = true;
    }
    w.emit('stun', this.restX, ar.deck);
  }

  /** The last barb is out. */
  free(w: World): void {
    this.abandon();
    this.mode = 'freed';
    this.t = 0;
    w.emit('roar', w.player.cx, this.arena.deck - 120, 2);
  }

  sink(): void {
    this.mode = 'sinking';
    this.t = 0;
  }

  // ---- queries ----

  def(): PhaseDef {
    return PHASES[clamp(this.phase, 1, PHASES.length) - 1]!;
  }

  /** Hooks of a phase still in its hide. */
  hooksLeft(phase = this.phase): number {
    let n = 0;
    for (const b of this.barbs) if (b.kind === 'hook' && b.phase === phase && !b.gone) n++;
    return n;
  }

  root(phase = this.phase): Barb | null {
    return this.barbs.find((b) => b.kind === 'root' && b.phase === phase) ?? null;
  }

  /** Every barb still in it, across all phases. */
  get barbsLeft(): number {
    let n = 0;
    for (const b of this.barbs) if (!b.gone) n++;
    return n;
  }

  /** How far down a limb is for a slam zone: 0 out of sight, 1 planted on the deck. */
  limbDown(a: Attack, z: Zone): number {
    if (a.stage === 'lift') return Math.max(0, 1 - (a.t - a.liftAt) / LIFT);
    if (z.landed) return 1;
    // It hangs over the mark through the warning, then drops in the last tenth of a second.
    const u = clamp(a.t / z.at, 0, 1);
    const drop = clamp((a.t - (z.at - 0.12)) / 0.12, 0, 1);
    return lerp(0.2 + 0.3 * u, 1, drop * drop);
  }

  // ---- attacks ----

  private abandon(): void {
    const a = this.attack;
    if (!a) return;
    if (a.hook && !a.hook.gone) a.hook.armed = false;
    if (a.kind === 'slam' && a.stage !== 'lift' && a.zones.some((z) => z.landed)) {
      a.stage = 'lift';
      a.liftAt = a.t;
    } else if (a.kind === 'throw' && a.t >= a.tell - THROW_FLIGHT && !a.zones[0]!.landed) {
      // A container already in the air still has to come down.
    } else if (a.stage !== 'lift') {
      // One it had not let go of yet goes back on the pile.
      if (a.kind === 'throw') this.thrown--;
      this.attack = null;
    }
  }

  private start(w: World): void {
    const ar = this.arena;
    const def = this.def();
    const list = this.mode === 'pressed' ? def.pressed : def.pattern;
    let move = list[this.step++ % list.length]!;
    const p = w.player;
    const a: Attack = {
      kind: 'slam',
      t: 0,
      tell: def.tell,
      stage: 'tell',
      zones: [],
      dir: 1,
      pos: 0,
      hold: def.hold,
      liftAt: 0,
      hit: false,
      hook: null,
      box: null,
      from: [0, 0],
    };

    if (move === 'throw') {
      const id = ar.boxes[this.thrown];
      const free = ar.slots.filter((s) => !w.movers.some((m) => Math.abs(m.x - s) < 4 && Math.abs(m.y + m.h - ar.deck) < 2));
      if (id === undefined || free.length === 0) move = 'slam';
      else {
        this.thrown++;
        const box = w.mover(id);
        let slot = free[0]!;
        for (const s of free) if (Math.abs(s + box.w / 2 - p.cx) < Math.abs(slot + box.w / 2 - p.cx)) slot = s;
        a.kind = 'throw';
        a.tell = def.tell + 0.5;
        a.box = box;
        a.zones.push({ x0: slot, x1: slot + box.w, limb: this.limb, at: a.tell, landed: false });
        a.from = [slot + (slot > (ar.x0 + ar.x1) / 2 ? -150 : 150), ar.deck - 340];
        w.emit('warn', slot + box.w / 2, ar.deck, 3);
      }
    }

    if (move === 'slam' || move === 'slam2') {
      const half = SLAM_W / 2;
      const cx = clamp(p.cx + p.vx * 0.25, ar.x0 + half, ar.x1 - half);
      a.kind = 'slam';
      a.zones.push({ x0: cx - half, x1: cx + half, limb: this.limb, at: a.tell, landed: false });
      const other: 0 | 1 = this.limb === 0 ? 1 : 0;
      if (move === 'slam2') {
        // The second claw closes the way she is most likely to run.
        const dir = p.vx !== 0 ? Math.sign(p.vx) : p.facing;
        let c2 = cx + dir * (SLAM_W + 26);
        if (c2 - half < ar.x0 || c2 + half > ar.x1) c2 = cx - dir * (SLAM_W + 26);
        a.zones.push({ x0: c2 - half, x1: c2 + half, limb: other, at: a.tell + 0.4, landed: false });
      }
      this.limb = other;
      w.emit('warn', cx, ar.deck, 0);
    } else if (move === 'sweep') {
      // It comes from the far end, so she has the whole deck to see it coming.
      a.kind = 'sweep';
      a.tell = SWEEP_TELL;
      a.dir = p.cx > (ar.x0 + ar.x1) / 2 ? 1 : -1;
      a.pos = a.dir > 0 ? ar.x0 - 24 : ar.x1 + 24;
      w.emit('warn', a.pos, ar.deck, 1);
    } else if (move === 'wave') {
      a.kind = 'wave';
      a.tell = WAVE_TELL;
      a.dir = -1;
      a.pos = ar.x1 + 40;
      w.emit('warn', p.cx, ar.deck, 2);
    }
    this.attack = a;
  }

  private strike(z: Zone, a: Attack, w: World, c: Combat): void {
    const ar = this.arena;
    const p = w.player;
    const mid = (z.x0 + z.x1) / 2;
    if (a.kind === 'throw') {
      const box = a.box!;
      box.x = z.x0;
      box.y = ar.deck - box.h;
      w.emit('crash', mid, ar.deck);
      w.camera.addShake(0.8);
      // (A falling box is solid and will have lifted her onto its lid on the way down: look above it too.)
      if (p.state !== 'dead' && rectsOverlap(p, { x: z.x0 - 2, y: box.y - 70, w: box.w + 4, h: box.h + 70 })) {
        p.x = p.cx < mid ? z.x0 - p.w - 1 : z.x1 + 1;
        c.hurt(w, THROW_DMG);
      }
      return;
    }
    w.emit('slam', mid, ar.deck);
    w.camera.addShake(0.9);
    // Under the deck grating the claw cannot reach.
    if (p.state !== 'dead' && p.feet <= ar.deck + 8 && p.x + p.w > z.x0 && p.x < z.x1 && c.hurt(w, SLAM_DMG) && !w.failed) {
      p.vx = (p.cx < mid ? -1 : 1) * 150;
      p.vy = -150;
    }
  }

  private advance(a: Attack, dt: number, w: World, c: Combat): void {
    const ar = this.arena;
    const p = w.player;
    const def = this.def();
    a.t += dt;
    const done = (): void => {
      this.attack = null;
      this.gap = def.gap;
    };

    if (a.kind === 'slam') {
      for (const z of a.zones) {
        if (!z.landed && a.stage !== 'lift' && a.t >= z.at) {
          z.landed = true;
          this.strike(z, a, w, c);
        }
      }
      const first = a.zones[0]!;
      const last = a.zones[a.zones.length - 1]!;
      if (a.stage === 'tell' && first.landed) {
        a.stage = 'hold';
        // The hook rides the wrist of whichever limb is down.
        const hook = this.mode === 'assault' ? this.barbs.find((b) => b.kind === 'hook' && b.phase === this.phase && !b.gone) : undefined;
        if (hook) {
          hook.x = (first.x0 + first.x1) / 2 + (first.limb === 0 ? 14 : -14);
          hook.y = ar.deck - HOOK_Y;
          hook.armed = true;
          a.hook = hook;
        }
      }
      if (a.stage === 'hold') {
        if (a.hook?.gone) {
          // Shot out: the limb comes off the deck at once.
          a.hook = null;
          a.stage = 'lift';
          a.liftAt = a.t;
          this.pain = 1;
          w.emit('roar', first.x0, ar.deck - 100, 1);
          if (this.hooksLeft() === 0) {
            if (def.opener === 'none') this.rearUp(w);
            else {
              this.mode = 'pressed';
              this.t = 0;
              this.step = 0;
            }
          }
        } else if (a.t >= last.at + a.hold) {
          if (a.hook) a.hook.armed = false;
          a.stage = 'lift';
          a.liftAt = a.t;
        }
      }
      if (a.stage === 'lift' && a.t >= a.liftAt + LIFT) done();
      return;
    }

    if (a.kind === 'throw') {
      const z = a.zones[0]!;
      const box = a.box!;
      const u = (a.t - (a.tell - THROW_FLIGHT)) / THROW_FLIGHT;
      if (!z.landed && u >= 0) {
        if (u >= 1) {
          z.landed = true;
          a.stage = 'lift';
          a.liftAt = a.t;
          this.strike(z, a, w, c);
        } else {
          a.stage = 'strike';
          box.x = lerp(a.from[0], z.x0, u);
          box.y = lerp(a.from[1], ar.deck - box.h, u * u);
        }
      }
      if (z.landed && a.t >= a.liftAt + 0.5) done();
      return;
    }

    // Sweep and wave travel the deck.
    if (a.stage === 'tell') {
      if (a.t < a.tell) return;
      a.stage = 'strike';
      w.emit(a.kind, a.pos, ar.deck);
      if (a.kind === 'wave') w.camera.addShake(0.4);
    }
    if (a.kind === 'sweep') {
      a.pos += a.dir * SWEEP_SPEED * dt;
      const claw = { x: a.dir > 0 ? a.pos - SWEEP_LEN : a.pos, y: ar.deck - SWEEP_H, w: SWEEP_LEN, h: SWEEP_H };
      if (!a.hit && p.state !== 'dead' && rectsOverlap(p, claw)) {
        a.hit = true;
        if (c.hurt(w, 1) && !w.failed) {
          p.vx = a.dir * 150;
          p.vy = -170;
        }
      }
      if (a.dir > 0 ? a.pos - SWEEP_LEN > ar.x1 + 30 : a.pos + SWEEP_LEN < ar.x0 - 30) done();
    } else {
      a.pos += a.dir * WAVE_SPEED * dt;
      // Deep enough to fill the trench as it passes over.
      const body = { x: a.dir > 0 ? a.pos - WAVE_LEN : a.pos, y: ar.deck - WAVE_H, w: WAVE_LEN, h: WAVE_H + 60 };
      if (p.state !== 'dead' && rectsOverlap(p, body)) {
        if (!a.hit) {
          a.hit = true;
          c.hurt(w, 1);
        }
        // It carries her along with it unless she has hold of something.
        if (p.state === 'normal' && !c.harmless && w.locked <= 0) w.moveX(p, a.dir * 150 * dt);
      }
      if (a.dir > 0 ? a.pos - WAVE_LEN > ar.x1 + 30 : a.pos + WAVE_LEN < ar.x0 - 30) done();
    }
  }

  // ---- frame ----

  /** What its body is doing meanwhile: arms, wake, the cut cable falling. Nothing here can hurt anyone. */
  private pose(dt: number): void {
    const a = this.attack;
    const want: [number, number] = [0, 0];
    if (a && (a.kind === 'slam' || a.kind === 'throw') && a.stage !== 'lift') for (const z of a.zones) want[z.limb] = 1;
    if (a && a.kind === 'sweep') want[a.dir > 0 ? 0 : 1] = 0.55;
    if (this.mode === 'reared') want[0] = want[1] = 0.42;
    if (this.mode === 'stunned') want[0] = 0.4;
    for (const i of [0, 1] as const) this.raise[i] = clamp(this.raise[i] + clamp(want[i] - this.raise[i], -dt * 1.6, dt * 2.6), 0, 1);
    const moving = this.mode === 'rising' || this.mode === 'sinking' || (this.mode === 'stunned' && this.t < 1.2);
    this.churn = clamp(Math.max(this.churn - dt * 0.4, moving ? 1 : 0, this.pain * 0.8), 0, 1);
    this.shock = Math.max(0, this.shock - dt * 1.1);
    PHASES.forEach((_ph, i) => {
      const root = this.root(i + 1);
      if (root && !root.gone) this.cut[i] = -1;
      else this.cut[i] = this.cut[i]! < 0 ? 0 : this.cut[i]! + dt;
    });
  }

  update(dt: number, w: World, c: Combat): void {
    this.t += dt;
    this.pain = Math.max(0, this.pain - dt * 0.8);
    for (const b of this.barbs) b.hitT += dt;
    this.pose(dt);
    const ease = (v: number, on: boolean, rate: number): number => clamp(v + (on ? dt : -dt) * rate, 0, 1);
    this.rear = ease(this.rear, this.mode === 'reared', 1.6);
    this.slump = ease(this.slump, this.mode === 'stunned', 1.2);
    this.calm = ease(this.calm, this.mode === 'freed' || this.mode === 'sinking' || this.mode === 'gone', 0.5);
    this.lit = ease(this.lit, this.floods, 1.4);

    if (this.attack) this.advance(this.attack, dt, w, c);

    switch (this.mode) {
      case 'rising':
        this.rise = Math.min(1, this.rise + dt / RISE_TIME);
        if (this.rise >= 1) {
          this.mode = 'looming';
          this.t = 0;
        }
        break;
      case 'sinking':
        this.rise = Math.max(0, this.rise - dt / SINK_TIME);
        if (this.rise <= 0) {
          this.mode = 'gone';
          this.t = 0;
        }
        break;
      case 'assault':
      case 'pressed':
        // It does not start anything new while a scene is playing or she is down.
        if (!this.attack && w.locked <= 0 && w.player.state !== 'dead') {
          this.gap -= dt;
          if (this.gap <= 0) this.start(w);
        }
        break;
      case 'stunned': {
        const root = this.root();
        if (root?.gone) {
          root.armed = false;
          this.cleared = this.phase;
          this.mode = 'reeling';
          this.t = 0;
          this.pain = 1;
          w.emit('roar', this.restX, this.arena.deck - 100, 1);
        }
        break;
      }
      case 'reeling':
        if (this.t >= 2.2) {
          this.mode = 'looming';
          this.t = 0;
        }
        break;
      default:
        break;
    }
  }
}
