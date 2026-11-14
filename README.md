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
```

**Rendering.** Each frame the `Stage` draws four depth groups (far, mid, play,
foreground) into small canvases, each as a colour layer and a separate glow
layer. The `Renderer` uploads them and runs, in order: dynamic lights with
ray-marched shadows from an occluder mask, depth-of-field blur per group, the
main composite (lit play layer, wet-floor reflections read from a per-pixel
mirror mask, light scattering so beams show in fog, ground fog), bloom with an
anamorphic streak, then a film pass (tone curve, grade, aberration, vignette,
grain, letterbox, fades).

**Art.** There are no sprite sheets. Characters are small jointed puppets
solved with two-bone IK and rasterised with aliased lines, so motion is
continuous. Scenes are painted by code from the same level data the simulation
collides against, so art and collision cannot drift apart.

**Simulation.** `World` knows nothing about rendering, audio or the DOM. That
is what makes the automated playthroughs possible.

**Story.** Chapter scripts are plain async functions over a `Director`
(`say`, `walk`, `wait`, `tune`, `fade`...). Restarting from a checkpoint
disposes the director, which cancels whatever script was in flight.

## Tests

`npm test` runs three suites:

- `core.test.ts`: movement physics (including frame-rate independence), ledges,
  ladders, wind, drone detection and cover, the tuning model, save data.
- `routes.test.ts`: a deliberately simple autopilot follows each chapter's
  critical path, proving every jump and climb is makeable.
- `story.test.ts`: plays the whole game from the prologue to each of the three
  endings with the story scripts running, and checks that every trigger and
  interaction has a script.

The story suite runs with stealth and wind switched off; those have their own
unit tests.

## Third-party

- [Galmuri](https://github.com/quiple/galmuri) bitmap fonts by Lee Minseo,
  SIL Open Font License 1.1. The licence text is in
  `public/licenses/Galmuri-OFL.txt` and ships with the build.

Build tooling: Vite, TypeScript, Vitest.

## Known limits

- Needs WebGL2. The game shows a plain message if it is missing.
- Audio is synthesised and was checked by measurement (levels, no errors), not
  by a mix engineer's ears.
- The name SKYWAVE has not been checked against existing trademarks.
