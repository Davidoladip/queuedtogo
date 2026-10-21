import type { FormModel } from "@/lib/design/engine";

export type SaveState = "saved" | "dirty" | "saving" | "error";
type Saver = (form: FormModel) => Promise<{ ok: true } | { ok: false; error: string }>;

const HISTORY = 60;
const OFFLINE = "We couldn't reach the server. Your changes will save when you're back online.";

/**
 * Holds the builder's working copy, its undo history and the autosave queue.
 * Saves are debounced and never overlap; if the form changes during a save, another save follows.
 */
export class DraftStore {
  current: FormModel;
  private past: FormModel[] = [];
  private future: FormModel[] = [];
  private lastKey: { key: string; at: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<boolean> | null = null;

  constructor(
    initial: FormModel,
    private saver: Saver,
    private onChange: (form: FormModel) => void,
    private onSave: (state: SaveState, error: string | null) => void,
    private delay = 900,
  ) {
    this.current = initial;
  }

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  get busy() { return this.timer !== null || this.inflight !== null; }

  /** Apply a change. Changes with the same `coalesce` key within 1.5 s are one undo step (typing). */
  apply(fn: (draft: FormModel) => void, coalesce?: string) {
    const prev = this.current;
    const draft = structuredClone(prev);
    fn(draft);
    const now = Date.now();
    const merging = coalesce && this.lastKey && this.lastKey.key === coalesce && now - this.lastKey.at < 1500;
    if (!merging) {
      this.past.push(prev);
      if (this.past.length > HISTORY) this.past.shift();
    }
    this.lastKey = coalesce ? { key: coalesce, at: now } : null;
    this.future = [];
    this.set(draft);
  }

  undo() {
    const p = this.past.pop();
    if (!p) return;
    this.future.push(this.current);
    this.lastKey = null;
    this.set(p);
  }

  redo() {
    const n = this.future.pop();
    if (!n) return;
    this.past.push(this.current);
    this.lastKey = null;
    this.set(n);
  }

  private set(next: FormModel) {
    this.current = next;
    this.onChange(next);
    this.onSave("dirty", null);
    this.schedule();
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delay);
  }

  /** Save now. Resolves true when the latest version is saved. */
  async flush(): Promise<boolean> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.inflight) await this.inflight;
    const snapshot = this.current;
    this.onSave("saving", null);
    this.inflight = this.saver(snapshot).then(
      (res) => {
        if (!res.ok) { this.onSave("error", res.error); return false; }
        this.onSave(this.current === snapshot ? "saved" : "dirty", null);
        return true;
      },
      () => { this.onSave("error", OFFLINE); return false; },
    );
    const ok = await this.inflight;
    this.inflight = null;
    if (ok && this.current !== snapshot) return this.flush();
    return ok;
  }
}
