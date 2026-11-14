import type { SceneArt } from '../art/scene';
import type { Director } from './director';
import type { LevelData } from './level';

export type Script = (d: Director) => Promise<void> | void;

/** A waypoint (feet position). 'ride' means: stand still and let a moving platform carry you there. */
export type RoutePoint = [number, number] | [number, number, 'ride'];

/** One playable chapter: a level, how it is painted, and its story scripts. */
export interface Chapter {
  id: string;
  /** e.g. "CHAPTER ONE". */
  kicker: string;
  title: string;
  subtitle: string;
  music: string;
  /** Ambient bed levels (rain and wind come from the weather). */
  amb: { city: number; crowd: number };
  /**
   * The critical path as waypoints (feet positions). Documents the intended
   * route and lets the automated playthrough prove every jump is makeable.
   */
  route?: RoutePoint[];
  build(): LevelData;
  paint(level: LevelData): SceneArt;
  /**
   * Arrange the world from story flags. Runs on entry and again after every
   * checkpoint restart, so it must depend only on flags.
   */
  setup(d: Director): void;
  /** Runs once when the chapter starts from the beginning. Responsible for fading in. */
  intro?: Script;
  triggers: Record<string, Script>;
  /** Keyed by interactable id or NPC id. */
  interacts: Record<string, Script>;
}

/** Cassettes hidden through the city; each is a voice that plays in the epilogue. */
export const TAPES: Record<string, { title: string; voice: string }> = {
  tape_mast: { title: 'Test Tone, 440 Hz', voice: 'This is a test. If you can hear this, somebody still cares enough to check.' },
  tape_lanes: { title: 'Market Night, Side A', voice: 'Two bowls. No, three. He always says two and eats three.' },
  tape_tops: { title: 'Rooftop Lullaby', voice: 'Sleep, little antenna. The whole sky is listening.' },
  tape_yards: { title: 'Crane Song', voice: 'Shift change at six. Tell my daughter I heard her on the radio.' },
  tape_spire: { title: 'Sign-Off, Year Zero', voice: 'This is Radio Magpie. We are not going off the air. We are just out of range.' },
};
