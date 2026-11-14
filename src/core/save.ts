export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  shake: boolean;
  reduceFlash: boolean;
  quality: Quality;
  /** Characters per second for dialogue. */
  textSpeed: number;
}

export interface Progress {
  chapter: string;
  checkpoint: string | null;
  flags: Record<string, number>;
}

export interface SaveData {
  v: 1;
  settings: Settings;
  progress: Progress | null;
  /** Chapters reached at least once (for chapter select). */
  reached: string[];
  endings: string[];
}

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const KEY = 'skywave.save.v1';

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  music: 0.7,
  sfx: 0.9,
  shake: true,
  reduceFlash: false,
  quality: 'high',
  textSpeed: 42,
};

const fresh = (): SaveData => ({
  v: 1,
  settings: { ...DEFAULT_SETTINGS },
  progress: null,
  reached: [],
  endings: [],
});

/** Persistent settings and progress. Storage failures (private mode, quota) never break the game. */
export class SaveStore {
  data: SaveData = fresh();
  private kv: KV | null;

  constructor(kv: KV | null) {
    this.kv = kv;
    this.load();
  }

  private load(): void {
    try {
      const raw = this.kv?.getItem(KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as Partial<SaveData>;
      if (d.v !== 1) return;
      this.data = {
        v: 1,
        settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) },
        progress: d.progress ?? null,
        reached: Array.isArray(d.reached) ? d.reached : [],
        endings: Array.isArray(d.endings) ? d.endings : [],
      };
    } catch {
      this.data = fresh();
    }
  }

  write(): void {
    try {
      this.kv?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Storage unavailable: keep playing with in-memory state.
    }
  }

  setProgress(p: Progress | null): void {
    this.data.progress = p ? { ...p, flags: { ...p.flags } } : null;
    if (p && !this.data.reached.includes(p.chapter)) this.data.reached.push(p.chapter);
    this.write();
  }

  addEnding(id: string): void {
    if (!this.data.endings.includes(id)) this.data.endings.push(id);
    this.write();
  }
}
