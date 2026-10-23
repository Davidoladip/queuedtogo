/* eslint-disable @typescript-eslint/no-explicit-any */
// Artwork blocks (form heading, questions, options), round colour swatches and editable customer messages.
// Like the rest of the design engine, every stored value is re-checked here, so the generated CSS and
// markup only ever contain clamped numbers, whitelisted words, parsed colours and safe storage paths.

import { cc } from "./color";

const obj = (o: unknown): Record<string, any> => (o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, any>) : {});
const num = (v: unknown, min: number, max: number, d: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : d; };
const en = <T>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const SAFE_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*\.(webp|png|jpg|jpeg)$/;
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

// ---------------------------------------------------------------- shadows
export type Shadow = { on: boolean; x: number; y: number; blur: number; color: string };
export const SHADOW_DEFAULT: Shadow = { on: false, x: 0, y: 4, blur: 14, color: "#00000033" };
export function normalizeShadow(raw: unknown): Shadow {
  const s = obj(raw);
  return { on: s.on === true, x: num(s.x, -40, 40, 0), y: num(s.y, -40, 40, 4), blur: num(s.blur, 0, 80, 14), color: cc(s.color) || "#00000033" };
}
export const shadowCss = (raw: unknown) => { const s = normalizeShadow(raw); return s.on ? `${s.x}px ${s.y}px ${s.blur}px ${s.color}` : "none"; };

// ---------------------------------------------------------------- artwork
/** "title" (heading artwork only): the artwork takes the title's place; the title text stays for screen readers. */
export type ArtPos = "above" | "below" | "left" | "right" | "title";
export type ArtSettings = {
  src: { path: string } | null;
  name: string;
  alt: string;
  w: number; wUnit: "%" | "px";
  h: number; keep: boolean; fit: "contain" | "cover" | "fill";
  minW: number; maxW: number; maxH: number;
  pad: { t: number; r: number; b: number; l: number };
  mar: { t: number; r: number; b: number; l: number };
  align: "left" | "center" | "right";
  valign: "top" | "center" | "bottom";
  bw: number; bc: string; br: number;
  op: number; bg: string;
  shadow: Shadow;
  pos: ArtPos;
};
export const ART_DEFAULT: ArtSettings = {
  src: null, name: "", alt: "", w: 160, wUnit: "px", h: 120, keep: true, fit: "contain", minW: 0, maxW: 0, maxH: 0,
  pad: { t: 0, r: 0, b: 0, l: 0 }, mar: { t: 0, r: 0, b: 8, l: 0 }, align: "center", valign: "center",
  bw: 0, bc: "#000000", br: 8, op: 100, bg: "", shadow: SHADOW_DEFAULT, pos: "above",
};
/** Starting points that suit each place an artwork block can appear. */
export const artDefaultFor = (where: "head" | "field" | "option"): ArtSettings =>
  where === "head" ? { ...ART_DEFAULT, w: 120, pos: "above", align: "center" }
    : where === "option" ? { ...ART_DEFAULT, w: 72, pos: "above", align: "center", mar: { t: 0, r: 0, b: 6, l: 0 } }
      : { ...ART_DEFAULT, w: 160, wUnit: "px", pos: "above", align: "left" };

const box = (raw: unknown, d: { t: number; r: number; b: number; l: number }, min: number, max: number) => {
  const p = obj(raw);
  return { t: num(p.t, min, max, d.t), r: num(p.r, min, max, d.r), b: num(p.b, min, max, d.b), l: num(p.l, min, max, d.l) };
};

/** Clean artwork settings. Returns null when there's no valid uploaded image. */
export function normalizeArt(raw: unknown, base: ArtSettings = ART_DEFAULT): ArtSettings | null {
  const a = obj(raw);
  const path = obj(a.src).path;
  if (typeof path !== "string" || !SAFE_PATH.test(path)) return null;
  const wUnit = en(a.wUnit, ["%", "px"] as const, base.wUnit);
  return {
    src: { path },
    name: String(a.name ?? "").slice(0, 120),
    alt: String(a.alt ?? "").slice(0, 200),
    w: num(a.w, 1, wUnit === "%" ? 100 : 2000, base.w), wUnit,
    h: num(a.h, 10, 2000, base.h), keep: a.keep !== false, fit: en(a.fit, ["contain", "cover", "fill"] as const, base.fit),
    minW: num(a.minW, 0, 2000, 0), maxW: num(a.maxW, 0, 4000, 0), maxH: num(a.maxH, 0, 4000, 0),
    pad: box(a.pad, base.pad, 0, 200), mar: box(a.mar, base.mar, -40, 200),
    align: en(a.align, ["left", "center", "right"] as const, base.align),
    valign: en(a.valign, ["top", "center", "bottom"] as const, base.valign),
    bw: num(a.bw, 0, 20, base.bw), bc: cc(a.bc) || base.bc, br: num(a.br, 0, 999, base.br),
    op: num(a.op, 0, 100, base.op), bg: cc(a.bg) || "", shadow: normalizeShadow(a.shadow),
    pos: en(a.pos, ["above", "below", "left", "right", "title"] as const, base.pos),
  };
}

const JUSTIFY = { left: "flex-start", center: "center", right: "flex-end" } as const;
const ALIGN_ITEMS = { top: "flex-start", center: "center", bottom: "flex-end" } as const;

/** CSS for one artwork block. The wrapper carries data-sid="<sid>"; the image is its only <img>. */
export function artCss(W: string, sid: string, a: ArtSettings): string {
  if (!SAFE_ID.test(sid)) return "";
  const X = `${W} [data-sid="${sid}"]`;
  const w = a.wUnit === "%" ? `${a.w}%` : `${a.w}px`;
  let o = `${X}{display:flex;justify-content:${JUSTIFY[a.align]};align-items:${ALIGN_ITEMS[a.valign]};margin:${a.mar.t}px ${a.mar.r}px ${a.mar.b}px ${a.mar.l}px;min-width:0}`;
  o += `${X} .qf-art-in{display:block;width:${w};max-width:${a.maxW ? `min(100%,${a.maxW}px)` : "100%"};${a.minW ? `min-width:min(100%,${a.minW}px);` : ""}padding:${a.pad.t}px ${a.pad.r}px ${a.pad.b}px ${a.pad.l}px;background:${a.bg || "transparent"};border:${a.bw}px solid ${a.bw ? a.bc : "transparent"};border-radius:${a.br}px;box-shadow:${shadowCss(a.shadow)};opacity:${a.op / 100};box-sizing:border-box}`;
  o += `${X} img{display:block;width:100%;height:${a.keep ? "auto" : `${a.h}px`};${a.maxH ? `max-height:${a.maxH}px;` : ""}object-fit:${a.keep ? "contain" : a.fit};border-radius:${Math.max(0, a.br - a.bw)}px}`;
  return o;
}

// ---------------------------------------------------------------- colour swatches
export type Swatch = { color: string; label: string };
export type SwatchSettings = {
  items: Swatch[];
  size: number; gap: number;
  align: "left" | "center" | "right";
  bw: number; bc: string;
  round: boolean; br: number;
  ring: string; ringW: number;
  labels: boolean;
  /** Customers pick one colour; the choice is part of their answers. */
  selectable: boolean;
  required: boolean;
  mar: { t: number; b: number };
};
export const SWATCH_DEFAULT: SwatchSettings = {
  items: [{ color: "#111111", label: "Black" }, { color: "#FFFFFF", label: "White" }, { color: "#C62828", label: "Red" }],
  size: 28, gap: 8, align: "left", bw: 1, bc: "#00000033", round: true, br: 6, ring: "#3346D3", ringW: 3,
  labels: false, selectable: true, required: false, mar: { t: 8, b: 0 },
};
export const MAX_SWATCHES = 24;

export function normalizeSwatches(raw: unknown): SwatchSettings | null {
  const s = obj(raw);
  const items = (Array.isArray(s.items) ? s.items : [])
    .map((i) => ({ color: cc(obj(i).color), label: String(obj(i).label ?? "").slice(0, 40) }))
    .filter((i): i is Swatch => !!i.color)
    .slice(0, MAX_SWATCHES);
  if (!items.length) return null;
  const d = SWATCH_DEFAULT;
  return {
    items,
    size: num(s.size, 12, 96, d.size), gap: num(s.gap, 0, 48, d.gap),
    align: en(s.align, ["left", "center", "right"] as const, d.align),
    bw: num(s.bw, 0, 8, d.bw), bc: cc(s.bc) || d.bc,
    round: s.round !== false, br: num(s.br, 0, 48, d.br),
    ring: cc(s.ring) || d.ring, ringW: num(s.ringW, 1, 8, d.ringW),
    labels: s.labels === true, selectable: s.selectable !== false, required: s.required === true,
    mar: { t: num(obj(s.mar).t, -20, 80, d.mar.t), b: num(obj(s.mar).b, -20, 80, d.mar.b) },
  };
}

/** CSS for a swatch row. The row carries data-sid="<sid>". */
export function swatchCss(W: string, sid: string, s: SwatchSettings): string {
  if (!SAFE_ID.test(sid)) return "";
  const X = `${W} [data-sid="${sid}"]`;
  const r = s.round ? "50%" : `${s.br}px`;
  let o = `${X}{display:flex;flex-wrap:wrap;gap:${s.gap}px;justify-content:${JUSTIFY[s.align]};margin:${s.mar.t}px 0 ${s.mar.b}px}`;
  o += `${X} .qf-sw-dot{width:${s.size}px;height:${s.size}px;border-radius:${r};border:${s.bw}px solid ${s.bw ? s.bc : "transparent"}}`;
  o += `${X} input:checked+.qf-sw-dot,${X} .qf-sw-i.fs-selected .qf-sw-dot{box-shadow:0 0 0 2px var(--c),0 0 0 ${2 + s.ringW}px ${s.ring}}`;
  o += `${X} input:focus-visible+.qf-sw-dot{outline:2px solid ${s.ring};outline-offset:${2 + s.ringW}px}`;
  return o;
}

// ---------------------------------------------------------------- per-option extras
export type OptionMeta = { art: ArtSettings | null; swatches: SwatchSettings | null; style: Record<string, any> };
export function normalizeOptionMeta(raw: unknown, count: number): OptionMeta[] {
  const list = Array.isArray(raw) ? raw.slice(0, Math.min(count, 100)) : [];
  return list.map((m) => {
    const o = obj(m);
    const style: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj(o.style))) if (!["__proto__", "constructor", "prototype"].includes(k)) style[k] = v;
    return { art: normalizeArt(o.art, artDefaultFor("option")), swatches: normalizeSwatches(o.swatches), style };
  });
}
export const emptyMeta = (): OptionMeta => ({ art: null, swatches: null, style: {} });
export const hasMeta = (m: OptionMeta | undefined) => !!m && (!!m.art || !!m.swatches || Object.keys(m.style).length > 0);

// ---------------------------------------------------------------- customer messages
// Carrier rules: name the business, give the frequency, "Msg & data rates may apply", STOP and HELP.
export const DEFAULT_CONSENT = "Text me updates about this order from {business}. Up to 6 msgs per order. Msg & data rates may apply. Reply STOP to opt out, HELP for help.";
export const DEFAULT_THANKS = "Thanks! We've got your order and will send you updates as it moves along.";
export const CONSENT_VARS = ["channel", "business"] as const;
export const THANKS_VARS = ["order_number", "business", "form_title"] as const;

/** Placeholders like {order_number} that aren't in the allowed list. */
export function unknownPlaceholders(text: string, allowed: readonly string[]): string[] {
  const found = [...text.matchAll(/\{([^{}]{0,40})\}/g)].map((m) => m[1].trim());
  return [...new Set(found.filter((p) => !allowed.includes(p)))];
}
/** Fill placeholders. Unknown ones are left as typed. Output is plain text (rendered by React, never as HTML). */
export function fillMessage(text: string, vars: Record<string, string>): string {
  return text.replace(/\{([a-z_]{1,40})\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}
