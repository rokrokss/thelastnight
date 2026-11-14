import { loadFonts } from '../src/gfx/fonts';
import { Renderer } from '../src/gfx/renderer';
import { FILM, type Take } from './film';
import { Overlay } from './overlay';
import { Player, STEP } from './player';
import { bounce, wav, type Air, type Heard } from './sound';

/**
 * Renders the trailer offline: the game is stepped at a fixed 60 Hz, each
 * frame is drawn at full quality however long that takes, and the finished
 * picture is handed to the tool that launched this page (tools/trailer.mjs).
 *
 *   ?mode=render   every frame, then the soundtrack
 *   ?mode=audio    the soundtrack only (the takes are run, but nothing is drawn)
 *   ?mode=sheet    a contact sheet: a few frames from every take
 *   (no mode)      nothing; drive it by hand through window.__trailer
 */
const q = new URLSearchParams(location.search);
const W = Number(q.get('w') ?? 1920);
const H = Number(q.get('h') ?? 1080);
const FPS = Number(q.get('fps') ?? 60);
const MODE = q.get('mode');
const ONLY = q.get('only')?.split(',') ?? null;

const hud = document.getElementById('hud')!;
const say = (text: string): void => {
  hud.textContent = text;
};

async function post(path: string, body?: BodyInit): Promise<void> {
  const r = await fetch(`/__sink/${path}`, { method: 'POST', body });
  if (!r.ok) throw new Error(`sink refused ${path}: ${r.status} ${await r.text()}`);
}

const blob = (c: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));

async function main(): Promise<void> {
  await loadFonts();
  const out = document.getElementById('out') as HTMLCanvasElement;
  out.width = W;
  out.height = H;
  const k = out.getContext('2d', { willReadFrequently: true })!;
  const renderer = new Renderer(document.createElement('canvas'));
  renderer.quality = 'high';
  renderer.resize(W, H, 1);
  const overlay = new Overlay(k, W, H);

  // Sound effects are noted against the trailer's clock and mixed afterwards.
  let clock = 0;
  const heard: Heard[] = [];
  const air: Air[] = [];
  const player = new Player(renderer, { sfx: (name, vol = 1) => void heard.push({ t: clock, name, vol }) });

  const startOf = (t: Take): number => Math.round(t.at * FPS);
  const endOf = (t: Take): number => Math.round((t.at + t.dur) * FPS);
  const takeAt = (frame: number): Take | null => FILM.takes.find((t) => frame >= startOf(t) && frame < endOf(t)) ?? null;

  /** Draw the picture for trailer time `t` from whatever the player currently holds. */
  const compose = (t: number, frame: number): void => {
    if (player.draw(1 / FPS)) k.drawImage(renderer.canvas, 0, 0);
    else {
      k.fillStyle = '#000';
      k.fillRect(0, 0, W, H);
    }
    overlay.draw(FILM.titles, t, frame);
  };

  /** Open a take and run it to `local` seconds in, then draw that frame. */
  const still = async (name: string, local: number): Promise<void> => {
    const take = FILM.takes.find((t) => t.name === name);
    if (!take) throw new Error(`no take "${name}"`);
    await player.open(take);
    for (let i = 0; i < Math.round(local / STEP); i++) await player.step();
    clock = take.at + local;
    compose(clock, Math.round(clock * FPS));
  };

  /** Run the whole cut. With `picture`, every frame is drawn and sent; without, only the sound is gathered. */
  const render = async (picture: boolean): Promise<void> => {
    const frames = Math.round(FILM.duration * FPS);
    const sub = Math.round(1 / FPS / STEP);
    if (picture) {
      const gl = renderer.gl;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown';
      await post('begin', JSON.stringify({ w: W, h: H, fps: FPS, frames, gpu }));
    }
    heard.length = 0;
    air.length = 0;
    let current: Take | null | undefined;
    for (let f = 0; f < frames; f++) {
      clock = f / FPS;
      const take = takeAt(f);
      if (take !== current) {
        current = take;
        await player.open(take ?? { name: 'black', at: clock, dur: 0 });
      } else for (let i = 0; i < sub; i++) await player.step();
      if (f % 6 === 0) air.push({ t: clock, mix: player.scene?.atmos() ?? null });
      if (picture) {
        compose(clock, f);
        await post(`frame?i=${f}`, k.getImageData(0, 0, W, H).data);
      }
      if (f % 30 === 0) say(`frame ${f} / ${frames}   ${take?.name ?? 'black'}`);
    }
    say('mixing the soundtrack');
    await post('audio', wav(await bounce(FILM, heard, air)));
    await post('done');
    say('done');
  };

  /** A few frames from every take, tiled, so the whole cut can be checked at a glance. */
  const sheet = async (): Promise<void> => {
    const takes = FILM.takes.filter((t) => !ONLY || ONLY.includes(t.name));
    const cols = 4;
    const cw = 480;
    const chh = 270;
    const cells: [Take, number][] = [];
    for (const t of takes) for (const u of t.dur > 2.6 ? [0.02, 0.35, 0.68, 0.98] : [0.04, 0.5, 0.96]) cells.push([t, u * t.dur]);
    const perPage = cols * 6;
    for (let page = 0; page * perPage < cells.length; page++) {
      const part = cells.slice(page * perPage, (page + 1) * perPage);
      const c = document.createElement('canvas');
      c.width = cols * cw;
      c.height = Math.ceil(part.length / cols) * chh;
      const ck = c.getContext('2d')!;
      let open: Take | null = null;
      let at = 0;
      for (let i = 0; i < part.length; i++) {
        const [take, local] = part[i]!;
        if (open !== take) {
          await player.open(take);
          open = take;
          at = 0;
        }
        while (at + STEP / 2 < local) {
          await player.step();
          at += STEP;
        }
        clock = take.at + local;
        compose(clock, Math.round(clock * FPS));
        const x = (i % cols) * cw;
        const y = Math.floor(i / cols) * chh;
        ck.drawImage(out, x, y, cw, chh);
        ck.font = '12px ui-monospace, monospace';
        ck.fillStyle = '#000';
        ck.fillRect(x, y, 150, 16);
        ck.fillStyle = '#7fe6d6';
        ck.fillText(`${take.name}  +${local.toFixed(2)}s`, x + 4, y + 12);
        say(`sheet ${page + 1}: ${i + 1} / ${part.length}`);
      }
      await post(`file?name=sheet-${page + 1}.png`, await blob(c));
    }
    await post('done');
    say('done');
  };

  Object.assign(window, { __trailer: { film: FILM, player, renderer, still, render, sheet, heard, air } });
  if (MODE === 'render') await render(true);
  else if (MODE === 'audio') await render(false);
  else if (MODE === 'sheet') await sheet();
  else say(`ready: ${FILM.takes.length} takes, ${FILM.duration}s`);
}

const fail = (e: unknown): void => {
  const text = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
  say(`FAILED\n${text}`);
  void fetch('/__sink/fail', { method: 'POST', body: text }).catch(() => undefined);
};
window.addEventListener('error', (e) => fail(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => fail(e.reason));
// A take's script reports its own errors through console.error; they must stop the render too.
const report = console.error.bind(console);
console.error = (...a: unknown[]): void => {
  report(...a);
  fail(a.find((x) => x instanceof Error) ?? a.map(String).join(' '));
};
main().catch(fail);
