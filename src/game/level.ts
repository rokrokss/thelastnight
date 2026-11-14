import type { Rect } from '../core/math';
import type { Anim } from '../art/puppet';

/**
 * Level data: everything the simulation needs, with no rendering types.
 * Painters read the same data (plus `props`) so art always matches collision.
 */

export interface Solid extends Rect {
  /** Blocks light and line of sight (walls, containers). The ground does not. */
  occlude?: boolean;
  tag?: string;
}

export interface OneWay {
  x: number;
  y: number;
  w: number;
  tag?: string;
}

export interface Ladder {
  /** Centre x. */
  x: number;
  y0: number;
  y1: number;
}

export type Flicker = 'none' | 'buzz' | 'pulse' | 'broken' | 'candle' | 'blink';

export interface LightDef {
  id?: string;
  x: number;
  y: number;
  r: number;
  color: string;
  /** Intensity multiplier. */
  k?: number;
  cone?: { dx: number; dy: number; inner: number; outer: number };
  shadow?: boolean;
  flicker?: Flicker;
  falloff?: number;
  on?: boolean;
}

export interface PropDef {
  kind: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  text?: string;
  color?: string;
  seed?: number;
  variant?: number;
  flip?: boolean;
  /** Draw in front of the actors instead of behind them. */
  front?: boolean;
}

export interface NpcDef {
  id: string;
  x: number;
  y: number;
  look: string;
  facing?: 1 | -1;
  anim?: Anim;
  /** Walks back and forth between these x positions. */
  patrol?: [number, number];
  speed?: number;
  /** Shown above the head when the player is close enough to talk. */
  prompt?: string;
  hidden?: boolean;
  /** Purely decorative: cannot be talked to. */
  extra?: boolean;
  /** Drawn behind mid-depth set dressing (a vendor behind their counter). */
  behind?: boolean;
}

export interface DroneDef {
  id: string;
  path: [number, number][];
  speed?: number;
  pause?: number;
  range?: number;
  /** Cone half-angle (radians). */
  half?: number;
  /** Cone direction angle (radians, 0 = right, PI/2 = down). */
  aim?: number;
  sweep?: { amp: number; speed: number };
  active?: boolean;
  /** Path is a closed loop instead of ping-pong. */
  loop?: boolean;
  /** Never stops to investigate: keeps sweeping along its path (pursuit set pieces). */
  relentless?: boolean;
}

export interface MoverDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  path: [number, number][];
  speed: number;
  pause?: number;
  active?: boolean;
  kind?: string;
  occlude?: boolean;
  /** Stop at the last waypoint instead of ping-ponging. */
  once?: boolean;
}

export interface PickupDef {
  id: string;
  x: number;
  y: number;
}

export interface InteractDef {
  id: string;
  x: number;
  y: number;
  /** Reach distance (px). */
  r?: number;
  prompt: string;
  enabled?: boolean;
}

export interface TriggerDef extends Rect {
  id: string;
}

export interface CheckpointDef extends Rect {
  id: string;
  /** Respawn feet position. */
  sx: number;
  sy: number;
}

export interface CamZone extends Rect {
  /** Fix the camera's top edge. */
  lockY?: number;
  /** Shift the vertical framing (negative looks up). */
  offY?: number;
  zoom?: number;
  /** Bias the horizontal framing. */
  offX?: number;
}

export interface Weather {
  rain: number;
  /** Rain slant / ambient wind, -1..1. */
  wind: number;
  fog: number;
  storm?: boolean;
}

export interface LevelData {
  id: string;
  theme: string;
  width: number;
  height: number;
  spawn: { x: number; y: number; facing: 1 | -1 };
  solids: Solid[];
  oneWays: OneWay[];
  ladders: Ladder[];
  hides: Rect[];
  lights: LightDef[];
  props: PropDef[];
  npcs: NpcDef[];
  drones: DroneDef[];
  movers: MoverDef[];
  pickups: PickupDef[];
  interacts: InteractDef[];
  triggers: TriggerDef[];
  checkpoints: CheckpointDef[];
  camZones: CamZone[];
  /** Areas where the player walks instead of running (narrative pacing). */
  walkZones: Rect[];
  /** Areas protected from wind gusts. */
  shelters: Rect[];
  /** Falling below this y is fatal. */
  killY: number;
  /** Reference ground height for fog and ambience. */
  groundY: number;
  weather: Weather;
  seed: number;
}

/** Small fluent helper so chapter files read like a floor plan. */
export class LevelBuilder {
  readonly d: LevelData;

  constructor(id: string, theme: string, width: number, height: number, groundY: number, seed: number) {
    this.d = {
      id,
      theme,
      width,
      height,
      spawn: { x: 40, y: groundY, facing: 1 },
      solids: [],
      oneWays: [],
      ladders: [],
      hides: [],
      lights: [],
      props: [],
      npcs: [],
      drones: [],
      movers: [],
      pickups: [],
      interacts: [],
      triggers: [],
      checkpoints: [],
      camZones: [],
      walkZones: [],
      shelters: [],
      killY: height + 60,
      groundY,
      weather: { rain: 0, wind: 0, fog: 0.3 },
      seed,
    };
  }

  spawn(x: number, y: number, facing: 1 | -1 = 1): this {
    this.d.spawn = { x, y, facing };
    return this;
  }

  solid(x: number, y: number, w: number, h: number, tag?: string, occlude = false): this {
    this.d.solids.push({ x, y, w, h, tag, occlude });
    return this;
  }

  /** Light-blocking solid (wall, container, pillar). */
  wall(x: number, y: number, w: number, h: number, tag?: string): this {
    return this.solid(x, y, w, h, tag, true);
  }

  oneWay(x: number, y: number, w: number, tag?: string): this {
    this.d.oneWays.push({ x, y, w, tag });
    return this;
  }

  ladder(x: number, y0: number, y1: number): this {
    this.d.ladders.push({ x, y0, y1 });
    return this;
  }

  hide(x: number, y: number, w: number, h: number): this {
    this.d.hides.push({ x, y, w, h });
    return this;
  }

  light(l: LightDef): this {
    this.d.lights.push(l);
    return this;
  }

  prop(kind: string, x: number, y: number, o: Omit<PropDef, 'kind' | 'x' | 'y'> = {}): this {
    this.d.props.push({ kind, x, y, ...o });
    return this;
  }

  npc(n: NpcDef): this {
    this.d.npcs.push(n);
    return this;
  }

  drone(dr: DroneDef): this {
    this.d.drones.push(dr);
    return this;
  }

  mover(m: MoverDef): this {
    this.d.movers.push(m);
    return this;
  }

  pickup(id: string, x: number, y: number): this {
    this.d.pickups.push({ id, x, y });
    return this;
  }

  interact(id: string, x: number, y: number, prompt: string, enabled = true, r = 16): this {
    this.d.interacts.push({ id, x, y, prompt, enabled, r });
    return this;
  }

  trigger(id: string, x: number, y: number, w: number, h: number): this {
    this.d.triggers.push({ id, x, y, w, h });
    return this;
  }

  checkpoint(id: string, x: number, y: number, w: number, h: number, sx: number, sy: number): this {
    this.d.checkpoints.push({ id, x, y, w, h, sx, sy });
    return this;
  }

  camZone(z: CamZone): this {
    this.d.camZones.push(z);
    return this;
  }

  walkZone(x: number, y: number, w: number, h: number): this {
    this.d.walkZones.push({ x, y, w, h });
    return this;
  }

  shelter(x: number, y: number, w: number, h: number): this {
    this.d.shelters.push({ x, y, w, h });
    return this;
  }

  weather(w: Weather): this {
    this.d.weather = w;
    return this;
  }

  build(): LevelData {
    return this.d;
  }
}
