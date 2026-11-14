export type Action = 'left' | 'right' | 'up' | 'down' | 'jump' | 'interact' | 'fire' | 'pause' | 'confirm' | 'cancel';

/** What the simulation reads. The browser, a gamepad, touch buttons or a test script can all provide it. */
export interface Controls {
  held(a: Action): boolean;
  pressed(a: Action): boolean;
}

const KEYMAP: Record<string, Action[]> = {
  ArrowLeft: ['left'],
  KeyA: ['left'],
  ArrowRight: ['right'],
  KeyD: ['right'],
  ArrowUp: ['up'],
  KeyW: ['up'],
  ArrowDown: ['down'],
  KeyS: ['down'],
  Space: ['jump', 'confirm'],
  KeyZ: ['jump', 'confirm'],
  KeyK: ['jump'],
  KeyE: ['interact', 'confirm'],
  KeyX: ['interact', 'confirm'],
  KeyF: ['fire'],
  KeyJ: ['fire'],
  Enter: ['confirm', 'interact'],
  NumpadEnter: ['confirm', 'interact'],
  Escape: ['pause', 'cancel'],
  KeyP: ['pause'],
  Backspace: ['cancel'],
};

export type Device = 'keyboard' | 'gamepad' | 'touch';

export class Input implements Controls {
  private keys = new Set<string>();
  private queued = new Set<Action>();
  private virtual = new Set<Action>();
  private cur = new Set<Action>();
  private edge = new Set<Action>();
  private padPrev = new Set<Action>();
  device: Device = 'keyboard';
  /** Fired on the first user gesture (used to unlock audio). */
  onGesture: (() => void) | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      const acts = KEYMAP[e.code];
      if (!acts) return;
      if (!e.metaKey && !e.ctrlKey && !e.altKey) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      for (const a of acts) this.queued.add(a);
      this.device = 'keyboard';
      this.onGesture?.();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.virtual.clear();
    });
    window.addEventListener('pointerdown', () => this.onGesture?.());
  }

  /** Touch / on-screen buttons. */
  setVirtual(a: Action, on: boolean): void {
    if (on) {
      if (!this.virtual.has(a)) this.queued.add(a);
      this.virtual.add(a);
      this.device = 'touch';
    } else this.virtual.delete(a);
  }

  /** Inject a one-frame press (automation and tests). */
  tap(a: Action): void {
    this.queued.add(a);
  }

  /** Sample devices. Call once per frame before the game update. */
  poll(): void {
    const now = new Set<Action>(this.virtual);
    for (const code of this.keys) for (const a of KEYMAP[code] ?? []) now.add(a);

    const pad = new Set<Action>();
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const b = (i: number): boolean => !!gp.buttons[i]?.pressed;
      const ax = gp.axes[0] ?? 0;
      const ay = gp.axes[1] ?? 0;
      if (ax < -0.45 || b(14)) pad.add('left');
      if (ax > 0.45 || b(15)) pad.add('right');
      if (ay < -0.5 || b(12)) pad.add('up');
      if (ay > 0.5 || b(13)) pad.add('down');
      if (b(0)) {
        pad.add('jump');
        pad.add('confirm');
      }
      if (b(2) || b(3)) {
        pad.add('interact');
        pad.add('confirm');
      }
      if (b(1)) pad.add('cancel');
      if (b(1) || b(7)) pad.add('fire');
      if (b(9)) pad.add('pause');
      break;
    }
    if (pad.size > 0) {
      this.device = 'gamepad';
      this.onGesture?.();
    }

    this.edge.clear();
    for (const a of this.queued) {
      now.add(a);
      this.edge.add(a);
    }
    for (const a of pad) {
      now.add(a);
      if (!this.padPrev.has(a)) this.edge.add(a);
    }
    this.padPrev = pad;
    this.queued.clear();
    this.cur = now;
  }

  held(a: Action): boolean {
    return this.cur.has(a);
  }

  pressed(a: Action): boolean {
    return this.edge.has(a);
  }

  /** Swallow a press so a single key does not act twice in one frame. */
  consume(a: Action): void {
    this.edge.delete(a);
  }
}

/** Fixed, scripted input for tests and automated playthroughs. */
export class ScriptedControls implements Controls {
  private h = new Set<Action>();
  private p = new Set<Action>();
  set(a: Action, on: boolean): void {
    if (on) {
      if (!this.h.has(a)) this.p.add(a);
      this.h.add(a);
    } else this.h.delete(a);
  }
  tap(a: Action): void {
    this.p.add(a);
  }
  releaseAll(): void {
    this.h.clear();
  }
  /** Clear one-frame presses; call after each simulation step. */
  endFrame(): void {
    this.p.clear();
  }
  held(a: Action): boolean {
    return this.h.has(a) || this.p.has(a);
  }
  pressed(a: Action): boolean {
    return this.p.has(a);
  }
}
