import { AudioSys } from '../src/audio/audio';
import { SPEAKERS } from '../src/game/director';
import { BAR, type Film } from './film';
import type { Atmos } from './scene';
import { Score } from './score';

/** A sound effect, logged against the trailer's clock while the picture was being shot. */
export interface Heard {
  t: number;
  name: string;
  vol: number;
}

/** What the air sounded like at a moment (null over black). */
export interface Air {
  t: number;
  mix: Atmos | null;
}

const RATE = 48000;
/** How often the offline render pauses to be fed the next events. */
const TICK = 1 / 60;

const SILENCE: Atmos = { rain: 0, wind: 0, city: 0, crowd: 0, hum: 0 };

/**
 * Mixes the trailer's soundtrack: the score, plus everything the game itself
 * would have played for the pictures (footsteps, weather, drones, relays),
 * replayed through the game's own sound engine at the moments it happened.
 */
export async function bounce(film: Film, heard: Heard[], air: Air[]): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(film.duration * RATE), RATE);

  // Everything meets on one bus with a gentle compressor to glue it together.
  const master = ctx.createGain();
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -12;
  glue.knee.value = 10;
  glue.ratio.value = 2;
  glue.attack.value = 0.012;
  glue.release.value = 0.25;
  // ...and a limiter after it, so the big hits do not decide how loud everything else may be.
  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -7;
  limit.knee.value = 2;
  limit.ratio.value = 20;
  limit.attack.value = 0.002;
  limit.release.value = 0.14;
  master.connect(glue);
  glue.connect(limit);
  limit.connect(ctx.destination);
  // Bring the whole thing down gently under the last seconds of the logo.
  master.gain.setValueAtTime(1, film.duration - 1.6);
  master.gain.linearRampToValueAtTime(0.0001, film.duration - 0.05);

  // The score is ridden like a fader, so the cut builds instead of sitting at one level:
  // [bar, level] pairs, each eased into over a few beats.
  const music = ctx.createGain();
  music.gain.value = 0.9;
  music.connect(master);
  for (const [bar, level] of [
    [4, 0.95],
    [9, 1.15],
    [13, 1.3],
    [17, 1.45],
    [19, 1.3],
    [20, 1.75],
    [26, 1.6],
    [30, 1.5],
    [32, 2.05],
    [36, 1.9],
  ] as const) {
    music.gain.setTargetAtTime(level, bar * BAR - 0.05, 0.12);
  }
  new Score(ctx, music).compose();

  // In the game the weather is the foreground; under a score it is set well back.
  const world = ctx.createGain();
  world.gain.value = 0.8;
  world.connect(master);
  const under = (m: Atmos): Atmos => ({ rain: m.rain * 0.3, wind: m.wind * 0.35, city: m.city * 0.3, crowd: m.crowd * 0.3, hum: m.hum * 0.8 });
  const game = new AudioSys();
  game.setVolumes(0.8, 0, 0.9);
  game.attach(ctx, world);

  // Captions type on with the game's dialogue blips.
  const events: Heard[] = heard.slice();
  for (const it of film.titles) {
    if (it.kind !== 'caption') continue;
    const pitch = SPEAKERS[it.who]?.pitch ?? 1;
    for (let i = 0; i < it.text.length; i += 3) {
      if (it.text[i] !== ' ') events.push({ t: it.at + i / 46, name: 'blip', vol: pitch });
    }
  }
  // A fog horn somewhere under the opening shot.
  events.push({ t: 4.2, name: 'horn', vol: 0.6 });
  events.sort((a, b) => a.t - b.t);

  /**
   * The cold open is a radio being tuned: static, a heterodyne whistle, and
   * the Magpie call-sign coming up out of it. 0..1 is how close the dial is.
   */
  const dial = (t: number): number | null => {
    if (t < 0.15 || t > 9.6) return null;
    if (t < 2.4) return 0.08 + 0.17 * (t / 2.4) + 0.05 * Math.sin(t * 5.1);
    return Math.min(0.56, 0.25 + ((t - 2.4) / 6.5) * 0.3 + 0.04 * Math.sin(t * 3.3));
  };

  let ei = 0;
  let ai = 0;
  let tuned = false;
  const tick = (t: number): void => {
    while (ei < events.length && events[ei]!.t < t + TICK) {
      const e = events[ei++]!;
      if (e.name === 'blip') game.blip(e.vol);
      else game.sfx(e.name, e.vol);
    }
    let mix: Atmos | null | undefined;
    while (ai < air.length && air[ai]!.t < t + TICK) mix = air[ai++]!.mix;
    if (mix !== undefined) {
      const m = under(mix ?? SILENCE);
      game.ambience(m);
      game.hum(m.hum);
    }
    const c = dial(t);
    if (c !== null) {
      game.tuning(c);
      tuned = true;
    } else if (tuned) {
      game.tuning(null);
      tuned = false;
    }
  };

  tick(0);
  for (let i = 1; i * TICK < film.duration; i++) {
    const t = i * TICK;
    void ctx.suspend(t).then(() => {
      tick(t);
      void ctx.resume();
    });
  }
  return ctx.startRendering();
}

/** Bring the loudest sample to just under full scale, then pack as 16-bit stereo WAV. */
export function wav(buf: AudioBuffer): Blob {
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  let peak = 0;
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]!), Math.abs(R[i]!));
  const k = peak > 0 ? 0.89 / peak : 1;
  const n = L.length;
  const out = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o: number, s: string): void => {
    for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  out.setUint32(4, 36 + n * 4, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 2, true);
  out.setUint32(24, buf.sampleRate, true);
  out.setUint32(28, buf.sampleRate * 4, true);
  out.setUint16(32, 4, true);
  out.setUint16(34, 16, true);
  str(36, 'data');
  out.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    out.setInt16(44 + i * 4, Math.round(Math.max(-1, Math.min(1, L[i]! * k)) * 32767), true);
    out.setInt16(46 + i * 4, Math.round(Math.max(-1, Math.min(1, R[i]! * k)) * 32767), true);
  }
  return new Blob([out], { type: 'audio/wav' });
}
