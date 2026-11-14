import type { Director } from '../game/director';

const withSol = (other: string | string[]): string[] => ['sol', ...(Array.isArray(other) ? other : [other])];

/** Conversation coverage: ease into a frame that holds everyone talking. */
export function twoShot(d: Director, other: string | string[], seconds = 1.3): void {
  d.drift({ on: withSol(other), fit: true, dy: -8, roll: 0, rack: 0 }, seconds);
}

/** Cut to one face, for a line that should land. */
export function single(d: Director, who: string, zoom = 1.9): void {
  d.cut({ on: who, zoom, dx: 0, dy: -5, roll: 0, rack: 0 });
}

/** Cut back out to everyone. */
export function both(d: Director, other: string | string[]): void {
  d.cut({ on: withSol(other), fit: true, dx: 0, dy: -8, roll: 0, rack: 0 });
}
