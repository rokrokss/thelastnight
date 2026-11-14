#!/usr/bin/env node
/**
 * Renders the trailer to a video file.
 *
 *   npm run trailer              1920x1080, 60 fps  ->  trailer/out/skywave-trailer.mp4
 *   npm run trailer -- --draft   960x540, 30 fps (quick look at the cut)
 *   npm run trailer -- --sheet   contact sheets only: a few frames from every take
 *   npm run trailer -- --sheet --only=fog,market
 *   npm run trailer -- --audio   the soundtrack only (trailer/out/skywave-trailer.wav)
 *   npm run trailer -- --crf=15  larger file, for an upload master
 *
 * How it works: this script serves the project with Vite, opens
 * trailer.html in headless Chrome, and receives finished frames over HTTP,
 * piping them straight into ffmpeg. Needs Google Chrome and ffmpeg.
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;

const mode = flag('sheet') ? 'sheet' : flag('audio') ? 'audio' : 'render';
const draft = flag('draft');
const W = Number(opt('w', draft ? 960 : 1920));
const H = Number(opt('h', draft ? 540 : 1080));
const FPS = Number(opt('fps', draft ? 30 : 60));
const only = opt('only', '');
// x264 quality: 18 keeps the film grain and stays a shareable size; pass --crf=15 for an upload master.
const crf = opt('crf', draft ? '21' : '18');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'trailer', 'out');
mkdirSync(outDir, { recursive: true });
const name = draft ? 'skywave-trailer-draft' : 'skywave-trailer';
const silent = join(outDir, `${name}.video.mp4`);
const wav = join(outDir, `${name}.wav`);
const final = join(outDir, `${name}.mp4`);

const CHROME =
  process.env.CHROME ??
  ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'].find((p) => existsSync(p));
if (!CHROME) {
  console.error('Google Chrome was not found. Set CHROME=/path/to/chrome and try again.');
  process.exit(1);
}

let ffmpeg = null;
let total = 0;
let got = 0;
let started = 0;
let chrome = null;
let server = null;
let profile = null;
let lastBeat = Date.now();

const body = async (req) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
};

const run = (cmd, argv) =>
  new Promise((ok, bad) => {
    const p = spawn(cmd, argv, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', bad);
    p.on('exit', (code) => (code === 0 ? ok() : bad(new Error(`${cmd} exited with ${code}\n${err.slice(-2000)}`))));
  });

async function finish(code) {
  try {
    chrome?.kill('SIGKILL');
  } catch {}
  await server?.close().catch(() => undefined);
  if (profile) rmSync(profile, { recursive: true, force: true });
  process.exit(code);
}

async function handle(req, res) {
  lastBeat = Date.now();
  const url = new URL(req.url, 'http://x');
  const what = url.pathname.slice(1);
  const data = await body(req);
  if (what === 'begin') {
    const info = JSON.parse(data.toString());
    total = info.frames;
    started = Date.now();
    console.log(`rendering ${info.frames} frames at ${info.w}x${info.h}, ${info.fps} fps  (GPU: ${info.gpu})`);
    ffmpeg = spawn(
      'ffmpeg',
      [
        '-y', '-loglevel', 'error',
        '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${info.w}x${info.h}`, '-r', String(info.fps), '-i', '-',
        '-an',
        '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', crf,
        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
        '-movflags', '+faststart',
        silent,
      ],
      { stdio: ['pipe', 'inherit', 'inherit'] },
    );
    ffmpeg.on('exit', (code) => {
      if (code !== 0 && got < total) {
        console.error(`ffmpeg stopped early (exit ${code})`);
        void finish(1);
      }
    });
  } else if (what === 'frame') {
    if (!ffmpeg.stdin.write(data)) await once(ffmpeg.stdin, 'drain');
    got++;
    if (got % 120 === 0 || got === total) {
      const rate = got / ((Date.now() - started) / 1000);
      console.log(`  ${got} / ${total} frames   ${rate.toFixed(1)} fps   about ${Math.ceil((total - got) / rate)} s left`);
    }
  } else if (what === 'file') {
    const file = join(outDir, url.searchParams.get('name').replace(/[^\w.-]/g, '_'));
    writeFileSync(file, data);
    console.log(`wrote ${file}`);
  } else if (what === 'audio') {
    writeFileSync(wav, data);
    console.log(`wrote ${wav}`);
  } else if (what === 'log') {
    console.log(`page: ${data.toString()}`);
  } else if (what === 'fail') {
    console.error(`\nThe trailer page failed:\n${data.toString()}`);
    res.end('ok');
    return finish(1);
  } else if (what === 'done') {
    res.end('ok');
    if (ffmpeg) {
      ffmpeg.stdin.end();
      await once(ffmpeg, 'exit');
      if (existsSync(wav)) {
        await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', final]);
        rmSync(silent);
      } else {
        await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-c', 'copy', '-movflags', '+faststart', final]);
        rmSync(silent);
      }
      console.log(`\n${final}   (${((Date.now() - started) / 1000).toFixed(0)} s)`);
    }
    return finish(0);
  } else {
    res.statusCode = 404;
  }
  res.end('ok');
}

server = await createServer({
  root,
  configFile: false,
  base: './',
  logLevel: 'warn',
  cacheDir: join(root, 'node_modules', '.vite-trailer'),
  server: { port: Number(opt('port', 5199)), strictPort: false, host: '127.0.0.1' },
  plugins: [
    {
      name: 'trailer-sink',
      configureServer(s) {
        s.middlewares.use('/__sink', (req, res) => {
          handle(req, res).catch((e) => {
            console.error(e);
            res.statusCode = 500;
            res.end(String(e));
          });
        });
      },
    },
  ],
});
await server.listen();
const port = server.config.server.port;
const address = server.httpServer.address();
const page = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : port}/trailer.html?mode=${mode}&w=${W}&h=${H}&fps=${FPS}${only ? `&only=${only}` : ''}`;

profile = mkdtempSync(join(tmpdir(), 'skywave-trailer-'));
chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--mute-audio',
    '--hide-scrollbars',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    `--window-size=${Math.min(W, 1920)},${Math.min(H, 1080)}`,
    page,
  ],
  { stdio: 'ignore' },
);
chrome.on('exit', () => {
  // Chrome going away before the page reports in means nothing more will arrive.
  setTimeout(() => {
    console.error('Chrome exited before the render finished.');
    void finish(1);
  }, 500);
});
console.log(`${mode}: ${page}`);

// If the page goes quiet (a hang, a crashed tab), give up rather than wait forever.
setInterval(() => {
  if (Date.now() - lastBeat > 180000) {
    console.error('No word from the page for three minutes; giving up.');
    void finish(1);
  }
}, 5000);
process.on('SIGINT', () => void finish(130));
