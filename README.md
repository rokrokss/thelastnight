# SKYWAVE

A cinematic pixel-art platformer for the browser. One foggy night in the port
city of Saltgate, a tower rigger climbs from the night market to the top of the
broadcast spire to wake a dead pirate station, because the storm warning was
only sent to people who paid for it.

SKYWAVE is an original game: its story, characters, world, art and music were
made for this project. Everything you see and hear is generated at runtime;
no image or audio files ship with it.

## Play

```bash
npm install
npm run dev
```

Then open http://localhost:5173. A full run takes about 25 to 35 minutes and
has three endings.

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Move | Arrow keys or WASD | Stick or D-pad |
| Jump, confirm | Space or Z | A |
| Use, talk | E, X or Enter | X |
| Hide, brace against wind, drop through a platform | Down (drop: Down + Jump) | Down |
| Grab a ledge | Jump and hold toward it, then Up to pull over | same |
| Pause | Esc or P | Start |

Touch buttons appear on a touch screen. Progress saves at checkpoints; settings
(volume, text speed, screen shake, reduced flashes, graphics quality,
fullscreen) are in the pause menu and on the title screen.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check, then build a static site into `dist/` |
| `npm run preview` | Serve the built site locally |
| `npm run typecheck` | Type-check only |
| `npm test` | Unit tests and automated playthroughs |
| `npm run trailer` | Render the trailer to `trailer/out/skywave-trailer.mp4` (see below) |

`dist/` is plain static files with relative paths, so it can be hosted anywhere
or wrapped in a desktop shell.

## How it is built

The world is authored at 480x270 and drawn as pixel art, then lit and graded at
the display's resolution. That split is the look: crisp pixels under smooth
light.

```
src/
  core/      math, colour, input, save data, shared constants
  gfx/       Art (pixel drawing toolkit), Stage (per-frame 2D compositor),
             Renderer and shaders (WebGL2 presentation pipeline)
  art/       procedural art: characters, buildings, props, skylines, one
             painter per scene in art/scenes/
  audio/     Web Audio synthesis: effects, ambience, generative score
  game/      simulation and story plumbing (World, Director, Session, View)
  content/   the chapters: level layout plus story script for each
  ui/        DOM overlay: captions, choices, menus, HUD, tuning scope
tests/       unit tests, route tests and full-story playthroughs
trailer/     the trailer: its cut, titles, score and offline renderer
tools/       trailer.mjs, which drives the render and encodes the video
```

**Rendering.** Each frame the `Stage` draws four depth groups (far, mid, play,
foreground) into small canvases, each as a colour layer and a separate glow
layer. The `Renderer` uploads them and runs, in order: dynamic lights with
ray-marched shadows from an occluder mask, depth-of-field blur per group, the
main composite (lit play layer, wet-floor reflections read from a per-pixel
mirror mask, light scattering so beams show in fog, ground fog), bloom with an
anamorphic streak, then a film pass (tone curve, grade, aberration, vignette,
grain, letterbox, fades).

**Camera.** `game/camera.ts` is a rig with a lens, not a scrolling window. A
shot is a small spec (`{ on: 'baek', zoom: 1.9, roll: 0.03, rack: -0.5 }`):
what to frame, how tight, how far off level, and where the focus sits. The
story cuts to shots, travels between them, or leans the gameplay camera toward
something for a moment (`cut`, `move`, `drift`, `glance`, `release` on the
`Director`). A push-in is a move through depth, not a crop: near layers grow
faster than far ones and the depth of field tightens with it. Rack focus pulls
the sharp plane to the foreground or out to the skyline. In play the same rig
frames by itself: it leads the direction of travel, opens up at a run, closes
in when Sol hides or talks, and tips and sways under pursuit or wind. The
director also has wipes, slow motion and mood offsets (`wipe`, `slowmo`,
`mood`).

**Art.** There are no sprite sheets. Characters are small jointed puppets
solved with two-bone IK and rasterised with aliased lines, so motion is
continuous. Scenes are painted by code from the same level data the simulation
collides against, so art and collision cannot drift apart.

**Simulation.** `World` knows nothing about rendering, audio or the DOM. That
is what makes the automated playthroughs possible.

**Story.** Chapter scripts are plain async functions over a `Director`
(`say`, `walk`, `wait`, `tune`, `fade`...). Restarting from a checkpoint
disposes the director, which cancels whatever script was in flight.

## Trailer

```bash
npm run trailer              # 1920x1080, 60 fps
npm run trailer -- --draft   # 960x540, 30 fps: a quick look at the cut
npm run trailer -- --sheet   # contact sheets: a few frames from every take
npm run trailer -- --audio   # the soundtrack only
npm run trailer -- --crf=15  # a larger file, as an upload master
```

Output goes to `trailer/out/` (not tracked by git). It needs Google Chrome and
ffmpeg on the machine; nothing else is installed.

The trailer is shot in the game itself, not captured from a play session.
`trailer/film.ts` is the cut: a list of takes on a 96 bpm grid (one bar is 2.5
seconds), each of which dresses a chapter's world, places Sol and the cast,
and directs the camera with the same shot calls the story uses. Where Sol
runs and climbs she is driven by the autopilot from the route tests, so those
are the real physics. The page `trailer.html` steps the simulation at a fixed
60 Hz and draws each frame at full quality however long it takes;
`tools/trailer.mjs` opens that page in headless Chrome, receives the frames
over HTTP and pipes them into ffmpeg.

Sound is rendered offline to match: `trailer/score.ts` is a through-composed
piece built on the Radio Magpie call-sign, and every footstep, relay and drone
the pictures imply is replayed through the game's own sound engine at the
moment it happened. Titles are drawn over the picture from the game's pixel
font at whole-number scales.

## Tests

`npm test` runs six suites:

- `core.test.ts`: movement physics (including frame-rate independence), ledges,
  ladders, wind, drone detection and cover, the tuning model, save data.
- `routes.test.ts`: a deliberately simple autopilot follows each chapter's
  critical path, proving every jump and climb is makeable.
- `story.test.ts`: plays the story from the prologue to each of the three
  endings as bare sessions (no UI), and checks that every trigger and
  interaction has a script.
- `game.test.ts`: runs the real `Game` under jsdom, with its real UI, menus,
  renderer and chapter loading (canvas and WebGL calls are no-ops there). It
  starts from the title menu, answers captions, choices and the tuning scope
  through the input layer, crosses every chapter hand-over to the credits, and
  checks saving and CONTINUE.

- `camera.test.ts`: the camera rig and the director's cinematic calls: cuts,
  timed moves, subjects that keep being followed, group framing, the level
  limits, a glance that never loses the player and lets go by itself, wipes,
  slow motion, moods.
- `trailer.test.ts`: the trailer's cut as data: every take on the grid, none
  overlapping, every chapter and speaker real.

The playthrough suites share one script of actions (`tests/helpers/playthrough.ts`)
and differ only in what they drive. They run with stealth and wind switched
off; those have their own unit tests.

## Third-party

- [Galmuri](https://github.com/quiple/galmuri) bitmap fonts by Lee Minseo,
  SIL Open Font License 1.1. The licence text is in
  `public/licenses/Galmuri-OFL.txt` and ships with the build.

Build tooling: Vite, TypeScript, Vitest (with jsdom for the full-game tests).

## Known limits

- Needs WebGL2. The game shows a plain message if it is missing.
- Audio is synthesised and was checked by measurement (levels, no errors), not
  by a mix engineer's ears. The same is true of the trailer's score.
- The trailer renderer is a development tool: it is not part of the build and
  has only been run on macOS.
- The name SKYWAVE has not been checked against existing trademarks.
