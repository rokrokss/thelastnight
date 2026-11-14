import './ui.css';
import { VIEW_H, VIEW_W } from '../core/constants';
import type { Action, Input } from '../core/input';
import { clamp } from '../core/math';
import { SPEAKERS, type Line, type Presenter, type TuneConfig } from '../game/director';
import { Tuner } from '../game/tuner';

export interface UiSound {
  blip(pitch: number): void;
  sfx(name: string, vol?: number): void;
  /** Radio static ↔ signal mix while tuning; null stops it. */
  tuning(closeness: number | null): void;
}

export interface MenuItem {
  label: string;
  value?: () => string;
  enabled?: boolean;
  act?: () => void;
  left?: () => void;
  right?: () => void;
}

export interface MenuSpec {
  title?: string;
  items: MenuItem[];
  where: 'title' | 'center';
  note?: string;
  onBack?: () => void;
}

interface Caption {
  el: HTMLElement;
  textEl: HTMLElement;
  ghostEl: HTMLElement;
  text: string;
  shown: number;
  at: (() => [number, number]) | null;
  pitch: number;
  life: number;
  resolve: (() => void) | null;
  nextEl: HTMLElement | null;
}

interface OpenMenu {
  spec: MenuSpec;
  el: HTMLElement;
  rows: HTMLElement[];
  idx: number;
}

const el = (cls: string, parent?: HTMLElement, text?: string): HTMLElement => {
  const e = document.createElement('div');
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
};

/** DOM overlay: captions, choices, HUD, menus and the tuning scope. */
export class UI implements Presenter {
  readonly root: HTMLElement;
  textSpeed = 42;
  /** World → view pixels (0..480, 0..270). Set by the game when a scene is showing. */
  project: ((wx: number, wy: number) => [number, number]) | null = null;
  private input: Input;
  private sound: UiSound;
  private say_: Caption | null = null;
  private barks: Caption[] = [];
  private choice: { el: HTMLElement; rows: HTMLElement[]; idx: number; resolve: (i: number) => void } | null = null;
  private tuner: {
    el: HTMLElement;
    cv: HTMLCanvasElement;
    g: CanvasRenderingContext2D;
    model: Tuner;
    resolve: () => void;
    doneT: number;
    pct: HTMLElement;
  } | null = null;
  private cardS: { el: HTMLElement; t: number; resolve: () => void } | null = null;
  private menus: OpenMenu[] = [];
  private objectiveEl: HTMLElement;
  private toastEl: HTMLElement;
  private toastT = 0;
  private promptEl: HTMLElement;
  private detectEl: HTMLElement;
  private detectBar: HTMLElement;
  private dangerEl: HTMLElement;
  private veilEl: HTMLElement;
  private titleEl: HTMLElement;
  private hintEl: HTMLElement;
  private creditsS: { el: HTMLElement; roll: HTMLElement; y: number; done: () => void } | null = null;
  private touchEl: HTMLElement | null = null;
  private loadingEl: HTMLElement;
  private px = 0;
  private u = 0;

  constructor(root: HTMLElement, input: Input, sound: UiSound) {
    this.root = root;
    this.input = input;
    this.sound = sound;
    this.dangerEl = el('danger', root);
    this.objectiveEl = el('objective', root);
    this.detectEl = el('detect', root);
    this.detectBar = document.createElement('i');
    this.detectEl.appendChild(this.detectBar);
    this.promptEl = el('prompt hidden', root);
    this.toastEl = el('toast', root);
    this.veilEl = el('veil hidden', root);
    this.titleEl = el('title hidden', root);
    el('logo', this.titleEl, 'SKYWAVE');
    el('logo-sub', this.titleEl, 'A NIGHT ON THE OPEN BAND');
    this.hintEl = el('hint hidden', root);
    this.loadingEl = el('loading', root, 'TUNING…');
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch') this.enableTouch();
      },
      { passive: true },
    );
    this.layout();
  }

  // ------------------------------------------------------------------ layout
  private layout(): void {
    const w = this.root.clientWidth;
    if (w <= 0) return;
    const px = w / VIEW_W;
    if (Math.abs(px - this.px) < 0.001) return;
    this.px = px;
    this.u = Math.max(1, Math.round(px / 2));
    this.root.style.setProperty('--px', `${px}px`);
    this.root.style.setProperty('--u', `${this.u}px`);
  }

  /** Opaque veil while a chapter is built; the scene fades itself in afterwards. */
  setLoading(on: boolean, text?: string): void {
    if (text) this.loadingEl.textContent = text;
    this.loadingEl.classList.toggle('hidden', !on);
  }

  /** True while the UI owns the controls (dialogue, choices, tuning, menus). */
  get blocking(): boolean {
    return !!(this.say_ || this.choice || this.tuner || this.menus.length || this.creditsS);
  }

  get menuOpen(): boolean {
    return this.menus.length > 0 || !!this.creditsS;
  }

  private eat(...acts: Action[]): void {
    for (const a of acts) this.input.consume(a);
  }

  // ---------------------------------------------------------------- captions
  private makeCaption(line: Line, bark: boolean): Caption {
    const sp = SPEAKERS[line.who] ?? { name: line.who.toUpperCase(), color: '#e9eef4', pitch: 1 };
    const radio = !line.at;
    const box = el(`cap${radio ? ' cap-radio' : ''}${bark ? ' cap-bark' : ''}`, this.root);
    box.style.color = sp.color;
    const name = el('cap-name', box, sp.name);
    name.style.color = sp.color;
    const body = el('cap-text', box);
    body.style.color = '#e9eef4';
    const textEl = document.createElement('span');
    const ghostEl = document.createElement('span');
    ghostEl.className = 'ghost';
    ghostEl.textContent = line.text;
    body.append(textEl, ghostEl);
    return {
      el: box,
      textEl,
      ghostEl,
      text: line.text,
      shown: 0,
      at: line.at,
      pitch: sp.pitch,
      life: 0,
      resolve: null,
      nextEl: null,
    };
  }

  private type(c: Caption, dt: number): void {
    if (c.shown >= c.text.length) return;
    const before = Math.floor(c.shown);
    c.shown = Math.min(c.text.length, c.shown + this.textSpeed * dt);
    const now = Math.floor(c.shown);
    if (now === before) return;
    c.textEl.textContent = c.text.slice(0, now);
    c.ghostEl.textContent = c.text.slice(now);
    const ch = c.text[now - 1];
    if (ch && ch !== ' ' && now % 3 === 0) this.sound.blip(c.pitch);
  }

  private place(c: Caption): void {
    if (!c.at || !this.project) return;
    const [wx, wy] = c.at();
    const [sx, sy] = this.project(wx, wy);
    const halfW = c.el.offsetWidth / this.px / 2;
    const x = clamp(sx, halfW + 6, VIEW_W - halfW - 6);
    const y = clamp(sy, c.el.offsetHeight / this.px + 34, VIEW_H - 40);
    c.el.style.left = `${x * this.px}px`;
    c.el.style.top = `${y * this.px}px`;
  }

  say(line: Line): Promise<void> {
    this.say_?.el.remove();
    // A new blocking line from someone replaces their own passing remark.
    this.barks = this.barks.filter((b) => {
      if (b.at === line.at || (!b.at && !line.at)) {
        b.el.remove();
        return false;
      }
      return true;
    });
    const c = this.makeCaption(line, false);
    this.say_ = c;
    this.place(c);
    return new Promise<void>((resolve) => {
      c.resolve = resolve;
    });
  }

  bark(line: Line, seconds: number): void {
    const c = this.makeCaption(line, true);
    c.life = seconds;
    this.barks = this.barks.filter((b) => {
      if ((!b.at && !c.at) || this.barks.length > 2) {
        b.el.remove();
        return false;
      }
      return true;
    });
    this.barks.push(c);
    this.place(c);
  }

  choose(options: string[]): Promise<number> {
    this.choice?.el.remove();
    const box = el('choices', this.root);
    const rows = options.map((o, i) => {
      const r = el('choice', box, o);
      r.addEventListener('pointerenter', () => this.pickChoice(i));
      r.addEventListener('click', () => {
        this.pickChoice(i);
        this.confirmChoice();
      });
      return r;
    });
    return new Promise<number>((resolve) => {
      this.choice = { el: box, rows, idx: 0, resolve };
      this.pickChoice(0);
    });
  }

  private pickChoice(i: number): void {
    const c = this.choice;
    if (!c) return;
    c.idx = (i + c.rows.length) % c.rows.length;
    c.rows.forEach((r, k) => r.classList.toggle('on', k === c.idx));
  }

  private confirmChoice(): void {
    const c = this.choice;
    if (!c) return;
    this.choice = null;
    c.el.remove();
    this.sound.sfx('ui_ok');
    c.resolve(c.idx);
  }

  card(kicker: string, title: string, subtitle: string): Promise<void> {
    this.cardS?.el.remove();
    const box = el('card', this.root);
    el('card-kicker', box, kicker);
    el('card-title', box, title);
    el('card-sub', box, subtitle);
    void box.offsetWidth;
    box.classList.add('on');
    return new Promise<void>((resolve) => {
      this.cardS = { el: box, t: 0, resolve };
    });
  }

  private objectiveText: string | null = null;
  private hudOn = true;

  objective(text: string | null): void {
    this.objectiveText = text;
    if (text) this.objectiveEl.textContent = text;
    this.objectiveEl.classList.toggle('on', !!text && this.hudOn);
  }

  /** Hide the HUD while a scene is playing out. */
  setHud(on: boolean): void {
    if (on === this.hudOn) return;
    this.hudOn = on;
    this.objectiveEl.classList.toggle('on', !!this.objectiveText && on);
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    this.toastT = 3.6;
  }

  clear(): void {
    this.say_?.el.remove();
    this.say_ = null;
    for (const b of this.barks) b.el.remove();
    this.barks = [];
    this.choice?.el.remove();
    this.choice = null;
    if (this.tuner) {
      this.tuner.el.remove();
      this.tuner = null;
      this.sound.tuning(null);
    }
    this.cardS?.el.remove();
    this.cardS = null;
    this.toastT = 0;
    this.toastEl.classList.remove('on');
    this.setPrompt(null);
    this.setDetect(0);
  }

  // --------------------------------------------------------------------- HUD
  /** A small label anchored in the world. `key` overrides the button glyph ('' hides it). */
  setPrompt(p: { x: number; y: number; label: string; key?: string } | null): void {
    if (!p || !this.project || this.blocking) {
      this.promptEl.classList.add('hidden');
      return;
    }
    const [sx, sy] = this.project(p.x, p.y);
    const key = p.key ?? (this.input.device === 'gamepad' ? 'X' : this.input.device === 'touch' ? 'B' : 'E');
    const html = `${key ? `<span class="key">${key}</span>` : ''}${p.label}`;
    if (this.promptEl.innerHTML !== html) this.promptEl.innerHTML = html;
    this.promptEl.style.left = `${clamp(sx, 30, VIEW_W - 30) * this.px}px`;
    this.promptEl.style.top = `${clamp(sy, 16, VIEW_H - 8) * this.px}px`;
    this.promptEl.classList.remove('hidden');
  }

  setDetect(v: number): void {
    this.detectEl.classList.toggle('on', v > 0.02);
    this.detectEl.classList.toggle('hot', v > 0.6);
    this.detectBar.style.width = `${Math.round(clamp(v, 0, 1) * 100)}%`;
    this.dangerEl.style.opacity = String(clamp((v - 0.15) * 1.1, 0, 0.9));
  }

  setHint(text: string | null): void {
    this.hintEl.classList.toggle('hidden', !text);
    if (text) this.hintEl.textContent = text;
  }

  // ------------------------------------------------------------------- tuner
  tune(cfg: TuneConfig, tick: () => void): Promise<void> {
    void tick;
    this.tuner?.el.remove();
    const box = el('tuner', this.root);
    const head = el('tuner-label', box);
    el('', head, cfg.label);
    const pct = el('', head, 'NO SIGNAL');
    const cv = document.createElement('canvas');
    cv.width = 220;
    cv.height = 92;
    box.appendChild(cv);
    el('tuner-help', box, cfg.gain === undefined ? '◄ ►  TUNE     HOLD THE SIGNAL TO LOCK' : '◄ ►  TUNE     ▲ ▼  GAIN     HOLD TO LOCK');
    const g = cv.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    return new Promise<void>((resolve) => {
      this.tuner = { el: box, cv, g, model: new Tuner(cfg), resolve, doneT: 0, pct };
      this.sizeTuner();
    });
  }

  private sizeTuner(): void {
    const t = this.tuner;
    if (!t) return;
    t.cv.style.width = `${220 * this.u}px`;
    t.cv.style.height = `${92 * this.u}px`;
  }

  private drawTuner(): void {
    const t = this.tuner;
    if (!t) return;
    const { g, model: m } = t;
    const W = 220;
    const H = 92;
    const c = m.closeness;
    g.fillStyle = m.kicked > 0 ? '#1c0a0a' : '#04100e';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#0b2620';
    for (let x = 0; x < W; x += 11) g.fillRect(x, 0, 1, 64);
    for (let y = 0; y < 64; y += 8) g.fillRect(0, y, W, 1);
    const mid = 32;
    const wave = (f: number, amp: number, phase: number, jitter: number, color: string): void => {
      g.fillStyle = color;
      const cycles = 2 + f * 7;
      let py = mid;
      for (let x = 0; x < W; x++) {
        const y = Math.round(mid + Math.sin((x / W) * cycles * Math.PI * 2 + phase) * amp + (Math.random() - 0.5) * jitter);
        const y0 = Math.min(y, py);
        g.fillRect(x, x === 0 ? y : y0, 1, x === 0 ? 1 : Math.abs(y - py) + 1);
        py = y;
      }
    };
    const tg = m.cfg.gain ?? 1;
    wave(m.targetF, 5 + tg * 22, m.t * 3, 0, '#1f6f62');
    const bright = c > 0.88 ? '#aaffee' : c > 0.5 ? '#49e0d0' : '#e8a04a';
    wave(m.f, 5 + m.g * 22, m.t * 3, (1 - c) * 12, bright);
    // Dial.
    g.fillStyle = '#06181a';
    g.fillRect(0, 66, W, 14);
    g.fillStyle = '#2a6a60';
    for (let i = 0; i <= 44; i++) g.fillRect(Math.round((i / 44) * (W - 1)), 66, 1, i % 4 === 0 ? 7 : 3);
    g.fillStyle = '#ff5a4d';
    g.fillRect(Math.round(m.f * (W - 3)), 66, 3, 14);
    // Lock meter.
    g.fillStyle = '#0b2620';
    g.fillRect(0, 84, W, 8);
    g.fillStyle = m.done ? '#aaffee' : '#49e0d0';
    g.fillRect(0, 84, Math.round(W * m.lock), 8);
    t.pct.textContent = m.done ? 'LOCKED' : c > 0.88 ? 'HOLD…' : c > 0.4 ? 'CLOSE' : 'NO SIGNAL';
  }

  // ------------------------------------------------------------------- menus
  showTitle(on: boolean): void {
    this.titleEl.classList.toggle('hidden', !on);
  }

  showVeil(on: boolean): void {
    this.veilEl.classList.toggle('hidden', !on);
  }

  openMenu(spec: MenuSpec): void {
    const prev = this.menus[this.menus.length - 1];
    prev?.el.classList.add('hidden');
    const box = el(`menu ${spec.where === 'title' ? 'at-title' : 'at-center'}`, this.root);
    if (spec.title) el('menu-title', box, spec.title);
    const rows = spec.items.map((_item, i) => {
      const r = el('item', box);
      r.addEventListener('pointerenter', () => this.moveMenu(i, true));
      r.addEventListener('click', () => {
        this.moveMenu(i, true);
        this.activate();
      });
      return r;
    });
    if (spec.note) el('note', box, spec.note);
    const m: OpenMenu = { spec, el: box, rows, idx: 0 };
    this.menus.push(m);
    const first = spec.items.findIndex((it) => it.enabled !== false);
    m.idx = Math.max(0, first);
    this.renderMenu(m);
  }

  private renderMenu(m: OpenMenu): void {
    m.spec.items.forEach((it, i) => {
      const r = m.rows[i]!;
      r.className = `item${i === m.idx ? ' on' : ''}${it.enabled === false ? ' off' : ''}`;
      const v = it.value ? it.value() : '';
      const html = `<span>${it.label}</span>${v ? `<span class="val">${v}</span>` : ''}`;
      if (r.innerHTML !== html) r.innerHTML = html;
    });
  }

  private moveMenu(i: number, absolute = false): void {
    const m = this.menus[this.menus.length - 1];
    if (!m) return;
    const n = m.spec.items.length;
    if (absolute) {
      if (m.spec.items[i]?.enabled === false) return;
      if (m.idx !== i) this.sound.sfx('ui_move', 0.6);
      m.idx = i;
    } else {
      let k = m.idx;
      for (let step = 0; step < n; step++) {
        k = (k + i + n) % n;
        if (m.spec.items[k]?.enabled !== false) break;
      }
      if (k !== m.idx) this.sound.sfx('ui_move', 0.6);
      m.idx = k;
    }
    this.renderMenu(m);
  }

  private activate(): void {
    const m = this.menus[this.menus.length - 1];
    const it = m?.spec.items[m.idx];
    if (!m || !it || it.enabled === false) return;
    this.sound.sfx('ui_ok');
    if (it.act) it.act();
    else it.right?.();
    const top = this.menus[this.menus.length - 1];
    if (top) this.renderMenu(top);
  }

  closeMenu(): void {
    const m = this.menus.pop();
    m?.el.remove();
    this.menus[this.menus.length - 1]?.el.classList.remove('hidden');
  }

  closeAllMenus(): void {
    while (this.menus.length) this.menus.pop()!.el.remove();
  }

  showCredits(html: string, done: () => void): void {
    const box = el('credits', this.root);
    const roll = el('credits-roll', box);
    roll.innerHTML = html;
    this.creditsS = { el: box, roll, y: 0, done };
  }

  private endCredits(): void {
    const c = this.creditsS;
    if (!c) return;
    this.creditsS = null;
    c.el.remove();
    c.done();
  }

  // ------------------------------------------------------------------- touch
  private enableTouch(): void {
    if (this.touchEl) return;
    const t = el('touch', this.root);
    this.touchEl = t;
    const btn = (label: string, acts: Action[], css: Partial<CSSStyleDeclaration>): void => {
      const b = el('tbtn', t, label);
      Object.assign(b.style, css);
      const set = (on: boolean) => (e: Event) => {
        e.preventDefault();
        b.classList.toggle('down', on);
        for (const a of acts) this.input.setVirtual(a, on);
      };
      b.addEventListener('pointerdown', set(true));
      b.addEventListener('pointerup', set(false));
      b.addEventListener('pointercancel', set(false));
      b.addEventListener('pointerleave', set(false));
    };
    const p = (n: number): string => `calc(var(--px) * ${n})`;
    btn('◄', ['left'], { left: p(10), bottom: p(14) });
    btn('►', ['right'], { left: p(52), bottom: p(14) });
    btn('▲', ['up'], { left: p(31), bottom: p(52) });
    btn('▼', ['down'], { left: p(94), bottom: p(14) });
    btn('A', ['jump', 'confirm'], { right: p(10), bottom: p(14) });
    btn('B', ['interact', 'confirm'], { right: p(52), bottom: p(30) });
    btn('II', ['pause'], { right: p(10), top: p(8), width: p(22), height: p(22) });
  }

  // ------------------------------------------------------------------- frame
  /** `dt` is game time (0 while paused); `real` always advances (menus, credits). */
  update(dt: number, real: number): void {
    this.layout();
    this.sizeTuner();
    const inp = this.input;

    if (this.creditsS) {
      const c = this.creditsS;
      c.y += real * (inp.held('confirm') || inp.held('down') ? 150 : 26) * this.px;
      c.roll.style.transform = `translateY(${-c.y}px)`;
      if (c.y > c.roll.offsetHeight + c.el.offsetHeight || inp.pressed('cancel') || inp.pressed('pause')) this.endCredits();
      this.eat('confirm', 'cancel', 'pause', 'jump', 'interact');
      return;
    }

    if (this.menus.length) {
      const m = this.menus[this.menus.length - 1]!;
      const it = m.spec.items[m.idx];
      if (inp.pressed('up')) this.moveMenu(-1);
      else if (inp.pressed('down')) this.moveMenu(1);
      else if (inp.pressed('left') && it?.left) {
        it.left();
        this.sound.sfx('ui_move', 0.6);
        this.renderMenu(m);
      } else if (inp.pressed('right') && it?.right) {
        it.right();
        this.sound.sfx('ui_move', 0.6);
        this.renderMenu(m);
      } else if (inp.pressed('confirm')) this.activate();
      else if (inp.pressed('cancel') || inp.pressed('pause')) {
        if (m.spec.onBack) {
          this.sound.sfx('ui_back', 0.7);
          m.spec.onBack();
        }
      }
      this.eat('confirm', 'cancel', 'pause', 'jump', 'interact', 'up', 'down', 'left', 'right');
      return;
    }

    if (this.toastT > 0) {
      this.toastT -= real;
      if (this.toastT <= 0) this.toastEl.classList.remove('on');
    }

    if (this.cardS) {
      const c = this.cardS;
      c.t += dt;
      if (c.t > 3.0) c.el.classList.remove('on');
      if (c.t > 4.0) {
        this.cardS = null;
        c.el.remove();
        c.resolve();
      }
    }

    if (this.tuner) {
      const t = this.tuner;
      const ax = (inp.held('right') ? 1 : 0) - (inp.held('left') ? 1 : 0);
      const ay = (inp.held('down') ? 1 : 0) - (inp.held('up') ? 1 : 0);
      t.model.update(dt, ax, ay);
      this.sound.tuning(t.model.closeness);
      this.drawTuner();
      if (t.model.done) {
        if (t.doneT === 0) this.sound.sfx('lock');
        t.doneT += dt;
        if (t.doneT > 1.1) {
          this.tuner = null;
          t.el.remove();
          this.sound.tuning(null);
          t.resolve();
        }
      }
      this.eat('confirm', 'jump', 'interact');
    } else if (this.choice) {
      if (inp.pressed('up')) {
        this.pickChoice(this.choice.idx - 1);
        this.sound.sfx('ui_move', 0.6);
      } else if (inp.pressed('down')) {
        this.pickChoice(this.choice.idx + 1);
        this.sound.sfx('ui_move', 0.6);
      } else if (inp.pressed('confirm')) this.confirmChoice();
      this.eat('confirm', 'jump', 'interact');
    } else if (this.say_) {
      const c = this.say_;
      this.type(c, dt);
      const full = c.shown >= c.text.length;
      if (full && !c.nextEl) c.nextEl = el('cap-next', c.el, '▾');
      if (dt > 0 && inp.pressed('confirm')) {
        if (!full) {
          c.shown = c.text.length;
          c.textEl.textContent = c.text;
          c.ghostEl.textContent = '';
        } else {
          this.say_ = null;
          c.el.remove();
          c.resolve?.();
        }
      }
      this.eat('confirm', 'jump', 'interact');
      if (this.say_) this.place(c);
    }

    if (this.barks.length) {
      const live: Caption[] = [];
      for (const b of this.barks) {
        this.type(b, dt);
        b.life -= dt;
        if (b.life <= 0) {
          b.el.remove();
          continue;
        }
        if (b.life < 0.3) b.el.style.opacity = String(Math.max(0, b.life / 0.3));
        this.place(b);
        live.push(b);
      }
      this.barks = live;
    }
  }
}
