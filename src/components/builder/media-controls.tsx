"use client";
/* eslint-disable @next/next/no-img-element -- upload previews */

import { useState } from "react";
import { srcOf } from "@/lib/design/engine";
import { processImage } from "@/lib/design/image";
import { MAX_SWATCHES, SWATCH_DEFAULT, type ArtSettings, type SwatchSettings } from "@/lib/design/media";
import { ColorInput, NumberInput, Seg, Toggle } from "./controls";
import type { Upload } from "./Builder";

const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";

/** Upload / replace / remove an artwork image, with a preview. `onUploaded` receives the storage path. */
export function ArtUploader({ art, assetBase, upload, onUploaded, onRemove, label = "artwork", compact }: {
  art: ArtSettings | null | undefined; assetBase: string; upload: Upload;
  onUploaded: (path: string, name: string) => void; onRemove: () => void; label?: string; compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const src = art ? srcOf(art.src, assetBase) : null;
  return (
    <div className="b-field">
      <div className={`b-art${compact ? " sm" : ""}`}>
        {src ? <img src={src} alt="" /> : <span className="muted">No {label} yet. PNG, JPG, WebP or SVG, up to 10 MB.</span>}
        <span className="b-art-actions">
          <label className="btn small">
            {busy ? "Uploading…" : src ? `Replace ${label}` : `Upload ${label}`}
            <input type="file" accept={ACCEPT} hidden disabled={busy} onChange={async (e) => {
              const file = e.target.files?.[0]; e.target.value = "";
              if (!file) return;
              setErr(null); setBusy(true);
              try {
                const p = await processImage(file, 1400);
                const { path } = await upload(p);
                onUploaded(path, p.name);
              } catch (ex) { setErr((ex as Error).message); } finally { setBusy(false); }
            }} />
          </label>
          {src && <button type="button" className="btn small danger" onClick={onRemove}>Remove</button>}
        </span>
      </div>
      {err && <div className="notice error" role="alert">{err}</div>}
    </div>
  );
}

/** Quick placement controls shown next to an uploaded artwork (full styling lives in the Design tab). */
export function ArtQuick({ art, set, beside = true, asTitle = false }: { art: ArtSettings; set: (k: string, v: unknown) => void; beside?: boolean; asTitle?: boolean }) {
  const pos: [string, string][] = beside ? [["above", "Above"], ["below", "Below"], ["left", "Left"], ["right", "Right"]] : [["above", "Above"], ["below", "Below"]];
  if (asTitle) pos.push(["title", "Instead of title"]);
  return (
    <>
      <Seg label="Position" value={art.pos} options={pos as ["above", string][]} onChange={(v) => {
        set("pos", v);
        // A title artwork usually spans the card: start it wide if it's still a small logo size.
        if (v === "title" && art.wUnit === "px" && art.w < 300) { set("wUnit", "%"); set("w", 100); }
      }} />
      {art.pos === "title" && <p className="hint">The artwork replaces the title text. The title still names the page in the browser tab and for screen readers, so keep it filled in.</p>}
      <div className="row">
        <NumberInput label="Width" value={art.w} min={art.wUnit === "%" ? 5 : 16} max={art.wUnit === "%" ? 100 : 800} suffix={art.wUnit} onChange={(v) => set("w", v)} />
        <Seg label="Align" value={art.align} options={[["left", "Left"], ["center", "Centre"], ["right", "Right"]]} onChange={(v) => set("align", v)} />
      </div>
    </>
  );
}

/** Add, edit, reorder and remove round colour swatches, plus how they behave for customers. */
export function SwatchEditor({ value, onChange, onRemoveAll }: { value: SwatchSettings; onChange: (s: SwatchSettings) => void; onRemoveAll: () => void }) {
  const items = value.items;
  const setItems = (next: SwatchSettings["items"]) => onChange({ ...value, items: next });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const n = [...items]; [n[i], n[j]] = [n[j], n[i]]; setItems(n);
  };
  return (
    <div className="b-sw-ed">
      <ol className="b-sw-list">
        {items.map((it, i) => (
          <li key={i} className="b-sw-row">
            <ColorInput label={`Colour ${i + 1}`} value={it.color} onChange={(c) => { if (c) { const n = [...items]; n[i] = { ...it, color: c }; setItems(n); } }} />
            <div className="field">
              <label htmlFor={`swl-${i}`}>Name (optional)</label>
              <input id={`swl-${i}`} type="text" value={it.label} maxLength={40} placeholder="e.g. Navy" onChange={(e) => { const n = [...items]; n[i] = { ...it, label: e.target.value }; setItems(n); }} />
            </div>
            <span className="b-sw-tools">
              <button type="button" className="b-icon" aria-label={`Move colour ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="b-icon" aria-label={`Move colour ${i + 1} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button type="button" className="b-icon" aria-label={`Remove colour ${i + 1}`} disabled={items.length === 1} onClick={() => setItems(items.filter((_, k) => k !== i))}>✕</button>
            </span>
          </li>
        ))}
      </ol>
      <div className="b-row-actions">
        <button type="button" className="btn small" disabled={items.length >= MAX_SWATCHES} onClick={() => setItems([...items, { color: "#3346D3", label: "" }])}>+ Add colour</button>
        <button type="button" className="btn small danger" onClick={onRemoveAll}>Remove swatches</button>
      </div>
      <Toggle label="Customers pick a colour" hint="Their choice is sent with their answers." checked={value.selectable} onChange={(v) => onChange({ ...value, selectable: v, required: v && value.required })} />
      {value.selectable && <Toggle label="Colour choice is required" checked={value.required} onChange={(v) => onChange({ ...value, required: v })} />}
      <Toggle label="Show colour names under the swatches" checked={value.labels} onChange={(v) => onChange({ ...value, labels: v })} />
      <div className="row">
        <NumberInput label="Swatch size" value={value.size} min={12} max={96} suffix="px" onChange={(v) => onChange({ ...value, size: v })} />
        <NumberInput label="Space between" value={value.gap} min={0} max={48} suffix="px" onChange={(v) => onChange({ ...value, gap: v })} />
      </div>
      <p className="muted b-note">Border, shape, selected outline and spacing are in the Design tab when you click the swatches in the preview.</p>
    </div>
  );
}

export const newSwatches = (): SwatchSettings => structuredClone(SWATCH_DEFAULT);
