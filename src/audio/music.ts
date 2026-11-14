/**
 * Generative score. Each track is a chord loop plus 16-step patterns; the
 * sequencer in AudioSys voices it with synthesised pads, bass, arpeggio, a
 * bell lead and light percussion. 'x' is a full hit, 'o' a soft one.
 */
export interface TrackDef {
  bpm: number;
  /** MIDI note of the tonic. */
  root: number;
  /** Chords as semitone offsets from the root. */
  chords: number[][];
  barsPerChord: number;
  /** Scale tones the lead may borrow. */
  scale: number[];
  /** The lead repeats every `phrase` bars, so it sounds written rather than random. */
  phrase: number;
  pad: number;
  padBright: number;
  bass: string;
  bassGain: number;
  arp: string;
  arpOct: number;
  arpGain: number;
  lead: number;
  leadOct: number;
  leadGain: number;
  kick: string;
  hat: string;
  snare: string;
  drumGain: number;
}

const NONE = '................';
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

export const TRACKS: Record<string, TrackDef> = {
  // Title: wide, slow, a little lonely.
  title: {
    bpm: 66,
    root: 50,
    chords: [
      [0, 3, 7, 10, 14],
      [-4, 0, 3, 7],
      [-7, -3, 0, 4],
      [-5, -2, 2, 5],
    ],
    barsPerChord: 2,
    scale: MINOR,
    phrase: 8,
    pad: 1,
    padBright: 1500,
    bass: 'x...............',
    bassGain: 0.7,
    arp: NONE,
    arpOct: 1,
    arpGain: 0,
    lead: 0.2,
    leadOct: 2,
    leadGain: 1,
    kick: NONE,
    hat: NONE,
    snare: NONE,
    drumGain: 0,
  },
  // Prologue: above the fog. Thin air, single bell.
  mast: {
    bpm: 60,
    root: 52,
    chords: [
      [0, 7, 10, 14],
      [-2, 5, 10, 12],
    ],
    barsPerChord: 4,
    scale: MINOR,
    phrase: 8,
    pad: 0.9,
    padBright: 1100,
    bass: NONE,
    bassGain: 0,
    arp: NONE,
    arpOct: 1,
    arpGain: 0,
    lead: 0.14,
    leadOct: 2,
    leadGain: 0.9,
    kick: NONE,
    hat: NONE,
    snare: NONE,
    drumGain: 0,
  },
  // The Lanes: warm, strolling, steam and bulbs.
  lanes: {
    bpm: 84,
    root: 57,
    chords: [
      [0, 3, 7, 10],
      [-4, 0, 3, 7],
      [-9, -5, -2, 3],
      [-2, 2, 5, 9],
    ],
    barsPerChord: 2,
    scale: MINOR,
    phrase: 8,
    pad: 0.8,
    padBright: 1300,
    bass: 'x.....o...x.....',
    bassGain: 1,
    arp: '..x...x...x..x..',
    arpOct: 1,
    arpGain: 0.9,
    lead: 0.16,
    leadOct: 2,
    leadGain: 0.9,
    kick: 'x.........x.....',
    hat: '..o...o...o...o.',
    snare: '........o.......',
    drumGain: 0.6,
  },
  // The Tops: light on its feet, running over rooftops.
  tops: {
    bpm: 98,
    root: 52,
    chords: [
      [0, 3, 7, 10],
      [-4, 0, 3, 7],
      [3, 7, 10, 14],
      [-2, 2, 5, 9],
    ],
    barsPerChord: 2,
    scale: MINOR,
    phrase: 8,
    pad: 0.6,
    padBright: 1700,
    bass: 'x..x..x...x..o..',
    bassGain: 0.9,
    arp: 'x.x.x.x.x.x.x.x.',
    arpOct: 1,
    arpGain: 1,
    lead: 0.2,
    leadOct: 2,
    leadGain: 0.9,
    kick: 'x.....x...x.....',
    hat: 'o.x.o.x.o.x.o.x.',
    snare: '....o.......o...',
    drumGain: 0.7,
  },
  // The Yards: heavy machinery in the dark.
  yards: {
    bpm: 76,
    root: 49,
    chords: [
      [0, 3, 7],
      [-4, 0, 3],
      [-7, -4, 0],
      [-2, 2, 5],
    ],
    barsPerChord: 2,
    scale: MINOR,
    phrase: 4,
    pad: 0.9,
    padBright: 900,
    bass: 'x...x...x...x.o.',
    bassGain: 1.2,
    arp: '......x.......x.',
    arpOct: 0,
    arpGain: 0.8,
    lead: 0.1,
    leadOct: 1,
    leadGain: 0.8,
    kick: 'x.......x.......',
    hat: '....o.......o...',
    snare: '............o...',
    drumGain: 0.8,
  },
  // The Spire: the climb. Driving, rising.
  spire: {
    bpm: 108,
    root: 53,
    chords: [
      [0, 3, 7, 10],
      [-2, 2, 5, 8],
      [-4, 0, 3, 7],
      [-5, -1, 2, 7],
    ],
    barsPerChord: 2,
    scale: MINOR,
    phrase: 4,
    pad: 0.8,
    padBright: 2000,
    bass: 'x.x.x.x.x.x.x.x.',
    bassGain: 1,
    arp: 'x..x..x.x..x..x.',
    arpOct: 1,
    arpGain: 1,
    lead: 0.22,
    leadOct: 2,
    leadGain: 1,
    kick: 'x...x...x...x...',
    hat: '..x...x...x...x.',
    snare: '....x.......x...',
    drumGain: 0.85,
  },
  // Dawn: the same city, forgiven by daylight.
  dawn: {
    bpm: 74,
    root: 60,
    chords: [
      [0, 4, 7, 11],
      [-5, -1, 2, 7],
      [-3, 0, 4, 7],
      [-7, -3, 0, 4],
    ],
    barsPerChord: 2,
    scale: MAJOR,
    phrase: 8,
    pad: 1,
    padBright: 1900,
    bass: 'x.........o.....',
    bassGain: 0.8,
    arp: '..x..x..x..x..x.',
    arpOct: 1,
    arpGain: 0.8,
    lead: 0.26,
    leadOct: 2,
    leadGain: 1,
    kick: NONE,
    hat: NONE,
    snare: NONE,
    drumGain: 0,
  },
};
