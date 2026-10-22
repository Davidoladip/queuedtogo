/* eslint-disable @typescript-eslint/no-explicit-any */
// Design settings are addressed by short paths, as in the prototype:
//   th.page                    theme colour, font, radius, layout
//   e.<elementId>.bg.color     one element's own style
//   g.<kind>.border.width      shared style for all elements of a kind
//   pg.tex / cd.tex            page and form-card textures
//   adv.progress               advanced options
//   img.<fieldId>.w            an artwork block's image settings
//   ev.submitLabel             form-level text
//   ha.w                       heading artwork
//   fa.<fieldId>.w / fs.<fieldId>.size          a question's artwork / colour swatches
//   o.<fieldId>.<n>.bg.color                    one option's own style
//   oa.<fieldId>.<n>.w / os.<fieldId>.<n>.gap   one option's artwork / swatches
import { bestOn, contrast } from "@/lib/design/color";
import { IMG_DEFAULT, SAFE_ID, SHARED_KINDS, type FormField, type FormModel } from "@/lib/design/engine";
import { emptyMeta } from "@/lib/design/media";

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
  applyOne(d, path, v);
  // Options and outline buttons start with a see-through background. Picking a background colour
  // should show it, so also make the fill opaque unless an opacity was already chosen here.
  if (/^(e|g|o)\..*\.bg\.color$/.test(path) && v) {
    const op = path.replace(/color$/, "opacity");
    if (readOverride(d, op) == null) applyOne(d, op, 100);
  }
}

function readOverride(d: FormModel, path: string): unknown {
  const [root, a, ...rest] = path.split(".");
  let cur: unknown =
    root === "e" ? d.design.el[a]
      : root === "g" ? d.design.shared[a as (typeof SHARED_KINDS)[number]]
        : root === "o" ? d.fields.find((x) => x.id === a)?.config.optMeta?.[Number(rest.shift())]?.style
          : undefined;
  for (const k of rest) cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[k] : undefined;
  return cur;
}

function applyOne(d: FormModel, path: string, v: unknown) {
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
    case "ha":
      if (d.design.headArt && rest.length) setIn(d.design.headArt as unknown as Record<string, any>, rest, v);
      return;
    case "fa": case "fs": {
      const [fid, ...keys] = rest;
      const f = d.fields.find((x) => x.id === fid);
      const target = f && (root === "fa" ? f.config.art : f.config.swatches);
      if (target && keys.length) setIn(target as unknown as Record<string, any>, keys, v);
      return;
    }
    case "o": case "oa": case "os": {
      const [fid, n, ...keys] = rest;
      const meta = optMeta(d, fid, Number(n));
      if (!meta || !keys.length) return;
      if (root === "o") setIn(meta.style, keys, v);
      else {
        const target = root === "oa" ? meta.art : meta.swatches;
        if (target) setIn(target as unknown as Record<string, any>, keys, v);
      }
      return;
    }
  }
}

/** The option's extras (artwork, swatches, own style), creating empty entries up to it if needed. */
export function optMeta(d: FormModel, fid: string, n: number) {
  const f: FormField | undefined = d.fields.find((x) => x.id === fid);
  if (!f || !Number.isInteger(n) || n < 0 || n >= f.options.length) return null;
  const list = (f.config.optMeta ??= []);
  while (list.length <= n) list.push(emptyMeta());
  list[n].style ??= {};
  return list[n];
}

/** Remove an override (element or shared style) so the inherited value applies again. */
export function resetPath(d: FormModel, path: string) {
  const [root, scope, ...keys] = path.split(".");
  if (root === "e" && !BLOCKED.has(scope) && Object.hasOwn(d.design.el, scope)) {
    deleteIn(d.design.el[scope], keys);
    if (!Object.keys(d.design.el[scope]).length) delete d.design.el[scope];
  }
  if (root === "g" && (SHARED_KINDS as readonly string[]).includes(scope)) deleteIn(d.design.shared[scope as (typeof SHARED_KINDS)[number]], keys);
  if (root === "o") {
    const [n, ...rest] = keys;
    const f = d.fields.find((x) => x.id === scope);
    const meta = f?.config.optMeta?.[Number(n)];
    if (meta?.style && rest.length) deleteIn(meta.style, rest);
  }
}

export const canReset = (path: string) => /^(e|g|o)\./.test(path);
