"use client";

import "./design-panel.css";
import { useCallback, useMemo, useState } from "react";
import { cc } from "@/lib/design/color";
import { elementsOf, type FormModel } from "@/lib/design/engine";
import { Design, type DesignCtx, type PreviewState } from "./design/context";
import { applyPath, resetPath } from "./design/paths";
import { SECTIONS } from "./design/sections";
import type { Update, Upload } from "./Builder";

type Props = {
  form: FormModel;
  update: Update;
  selected: string | null;
  setSelected: (s: string | null) => void;
  upload: Upload;
  assetBase: string;
  ps: PreviewState;
  setPs: (p: PreviewState) => void;
  brand: string[];
  setBrand: (c: string[]) => Promise<string | null>;
  canEditBrand: boolean;
  otherForms: { id: string; title: string }[];
  copyDesignFrom: (id: string) => Promise<string | null>;
  insertArtwork: (file: File, index: number) => Promise<void>;
  notify: (t: string) => void;
};

const OPEN_KEY = "qtg-design-open";
const RECENT_KEY = "qtg-recent-colors";

function readJSON<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function writeJSON(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked: keep in memory only */ }
}

export function DesignPanel(p: Props) {
  const { form, update, selected } = p;
  const [scope, setScope] = useState<"el" | "q" | "g">("el");
  const [open, setOpen] = useState<Record<string, boolean>>(() => ({ theme: true, ...readJSON<Record<string, boolean>>(OPEN_KEY, {}) }));
  const [recent, setRecent] = useState<string[]>(() => readJSON<string[]>(RECENT_KEY, []).map(cc).filter((x): x is string => !!x).slice(0, 10));

  const toggle = useCallback((key: string, o: boolean) => {
    setOpen((prev) => { const next = { ...prev, [key]: o }; writeJSON(OPEN_KEY, next); return next; });
  }, []);

  const el = selected ? elementsOf(form).find((e) => e.sid === selected) : null;
  // Selecting something in the preview opens its style section.
  const elementOpen = open.element || !!el;

  const ctx: DesignCtx = useMemo(() => ({
    form,
    apply: (path, v, coalesce) => update((d) => applyPath(d, path, v), coalesce ? { coalesce: "d:" + path } : undefined),
    reset: (path) => update((d) => resetPath(d, path)),
    update: (fn) => update(fn),
    selected,
    setSelected: p.setSelected,
    scope,
    setScope,
    ps: p.ps,
    setPs: p.setPs,
    open: { ...open, element: elementOpen },
    toggle,
    brand: p.brand,
    setBrand: p.setBrand,
    canEditBrand: p.canEditBrand,
    recent,
    pushRecent: (c) => setRecent((r) => { const n = [c, ...r.filter((x) => x !== c)].slice(0, 10); writeJSON(RECENT_KEY, n); return n; }),
    clearRecent: () => { setRecent([]); writeJSON(RECENT_KEY, []); },
    upload: p.upload,
    assetBase: p.assetBase,
    otherForms: p.otherForms,
    copyDesignFrom: p.copyDesignFrom,
    insertArtwork: p.insertArtwork,
    notify: p.notify,
  }), [form, update, selected, scope, open, elementOpen, toggle, recent, p.setSelected, p.ps, p.setPs, p.brand, p.setBrand, p.canEditBrand, p.upload, p.assetBase, p.otherForms, p.copyDesignFrom, p.insertArtwork, p.notify]);

  return (
    <Design.Provider value={ctx}>
      <div className="dpanel">
        {SECTIONS.map(([k, title, Sec]) => {
          const isOpen = k === "element" ? elementOpen : !!open[k];
          return (
            <details key={k} className="dsec" open={isOpen} onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; if (o !== isOpen) { toggle(k, o); if (k === "element" && !o) p.setSelected(null); } }}>
              <summary>{title}{k === "element" && el && <span className="tag">{el.name.slice(0, 22)}</span>}</summary>
              {isOpen && <div className="dsec-b"><Sec /></div>}
            </details>
          );
        })}
      </div>
    </Design.Provider>
  );
}
