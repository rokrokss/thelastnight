import './style.css';
import { loadFonts } from './gfx/fonts';
import { Game } from './game/game';

function fail(message: string): void {
  const ui = document.getElementById('ui');
  if (!ui) return;
  ui.innerHTML = '';
  const box = document.createElement('div');
  box.style.cssText =
    'position:absolute;inset:0;display:grid;place-content:center;text-align:center;padding:24px;' +
    'font:16px/1.5 ui-monospace,monospace;color:#cfd8e3;background:#05070c;white-space:pre-line';
  box.textContent = message;
  ui.appendChild(box);
}

async function main(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement | null;
  const ui = document.getElementById('ui');
  if (!canvas || !ui) throw new Error('missing #game or #ui');
  await loadFonts();
  let game: Game;
  try {
    game = new Game(canvas, ui);
  } catch (e) {
    console.error(e);
    fail('SKYWAVE needs WebGL2 to draw its lights.\nPlease try a current version of Chrome, Edge, Firefox or Safari.');
    return;
  }
  if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
  await game.boot();
}

main().catch((e: unknown) => {
  console.error(e);
  fail('Something went wrong while starting SKYWAVE.\nReloading the page usually fixes it.');
});
