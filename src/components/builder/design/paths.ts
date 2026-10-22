/* eslint-disable @typescript-eslint/no-explicit-any */
// Design settings are addressed by short paths, as in the prototype:
//   th.page                    theme colour, font, radius, layout
//   e.<elementId>.bg.color     one element's own style
//   g.<kind>.border.width      shared style for all elements of a kind
//   pg.tex / cd.tex            page and form-card textures
//   adv.progress               advanced options
//   img.<fieldId>.w            an artwork block's image settings
//   ev.submitLabel             form-level text
import { bestOn, contrast } from "@/lib/design/color";
import { IMG_DEFAULT, SAFE_ID, SHARED_KINDS, type FormModel } from "@/lib/design/engine";

const BLOCKED = new Set(["__proto__", "constructor", "prototype"]);

function setIn(o: Record<string, any>, keys: string[], v: unknown) {
  let cur = o;
  for (const k of keys.slice(0, -1)) {
    if (BLOCKED.has(k)) return;
    if (!cur[k] || typeof cur[k] !== "object" || Array.isArray(cur[k])) cur[k] = {};
    cur = cur[k];
  }
  const last = keys[keys.length - 1];
  if (BLOCKED.has(last)) return;
  cur[last] = v;
}

function deleteIn(o: Record<string, any>, keys: string[]) {
  const stack: [Record<string, any>, string][] = [];
  let cur = o;
  for (const k of keys.slice(0, -1)) {
    if (!cur[k] || typeof cur[k] !== "object") return;
    stack.push([cur, k]);
    cur = cur[k];
  }
  delete cur[keys[keys.length - 1]];
  // Remove empty parent objects so "reset" really returns to the default.
  for (let i = stack.length - 1; i >= 0; i--) {
    const [parent, k] = stack[i];
    if (Object.keys(parent[k]).length === 0) delete parent[k];
    else break;
  }
}

/** Apply a value at a design path to the draft form. Unknown paths are ignored. */
export function applyPath(d: FormModel, path: string, v: unknown) {
  const [root, ...rest] = path.split(".");
  switch (root) {
    case "th": {
      const k = rest[0] as keyof FormModel["design"]["theme"];
      if (!(k in d.design.theme)) return;
      (d.design.theme as Record<string, unknown>)[k] = v;
      // Keep button text readable when the button colour changes.
      if (k === "accent" && contrast(d.design.theme.accentText, v) < 4.5) d.design.theme.accentText = bestOn(v);
      return;
    }
    case "e": {
      const [sid, ...keys] = rest;
      if (!SAFE_ID.test(sid) || BLOCKED.has(sid) || !keys.length) return;
      if (!Object.hasOwn(d.design.el, sid)) d.design.el[sid] = {};
      setIn(d.design.el[sid], keys, v);
      return;
    }
    case "g": {
      const [kind, ...keys] = rest;
      if (!(SHARED_KINDS as readonly string[]).includes(kind) || !keys.length) return;
      setIn(d.design.shared[kind as (typeof SHARED_KINDS)[number]], keys, v);
      return;
    }
    case "pg": setIn(d.design.page as unknown as Record<string, any>, rest, v); return;
    case "cd": setIn(d.design.card as unknown as Record<string, any>, rest, v); return;
    case "adv": setIn(d.design.adv as unknown as Record<string, any>, rest, v); return;
    case "img": {
      const [fid, ...keys] = rest;
      const f = d.fields.find((x) => x.id === fid && x.type === "image");
      if (!f || !keys.length) return;
      f.config.img = { ...IMG_DEFAULT, ...f.config.img };
      setIn(f.config.img as unknown as Record<string, any>, keys, v);
      return;
    }
    case "ev":
      if (rest[0] === "submitLabel") d.submitLabel = String(v ?? "");
      return;
  }
}

/** Remove an override (element or shared style) so the inherited value applies again. */
export function resetPath(d: FormModel, path: string) {
  const [root, scope, ...keys] = path.split(".");
  if (root === "e" && !BLOCKED.has(scope) && Object.hasOwn(d.design.el, scope)) {
    deleteIn(d.design.el[scope], keys);
    if (!Object.keys(d.design.el[scope]).length) delete d.design.el[scope];
  }
  if (root === "g" && (SHARED_KINDS as readonly string[]).includes(scope)) deleteIn(d.design.shared[scope as (typeof SHARED_KINDS)[number]], keys);
}

export const canReset = (path: string) => /^(e|g)\./.test(path);
