/* eslint-disable @typescript-eslint/no-explicit-any */
// Form design engine, ported from the prototype (prototype/index.html, "Design system").
// It turns a form's saved design JSON into scoped CSS. Every value is checked here (numbers clamped,
// enums whitelisted, colours parsed), so the design JSON can come from anywhere and still only
// produce safe CSS. Images are referenced by storage path only, never by arbitrary URL.

import { alphaMul, bestOn, cc, lum, mix, over, rgbOf, shade } from "./color";

// ---------------------------------------------------------------- constants
export const FONT_STACKS: Record<string, string> = {
  plex: "'IBM Plex Sans',system-ui,sans-serif",
  bricolage: "'Bricolage Grotesque',system-ui,sans-serif",
  playfair: "'Playfair Display',Georgia,serif",
  oswald: "'Oswald','Arial Narrow',sans-serif",
  baloo: "'Baloo 2',system-ui,sans-serif",
  system: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
  serif: "Georgia,'Times New Roman',serif",
  mono: "'IBM Plex Mono',ui-monospace,Menlo,monospace",
};
export const FONTS: Record<string, { label: string; head: string; body: string; upper?: boolean }> = {
  clean: { label: "Clean", head: "plex", body: "plex" },
  bold: { label: "Bold", head: "bricolage", body: "plex" },
  elegant: { label: "Elegant", head: "playfair", body: "plex" },
  sporty: { label: "Sporty", head: "oswald", body: "plex", upper: true },
  friendly: { label: "Friendly", head: "baloo", body: "baloo" },
};
export const RADII: Record<string, number> = { square: 2, slight: 6, rounded: 12, pill: 999 };
export const SHAPES: [string, string][] = [["square", "Square"], ["slight", "Slightly rounded"], ["rounded", "Rounded"], ["pill", "Pill"]];
export const LAYOUTS: Record<string, string> = { banner: "Banner on top", background: "Full background", side: "Side by side" };
export const SHARED_KINDS = ["button", "input", "choice", "label", "heading", "text"] as const;
export type SharedKind = (typeof SHARED_KINDS)[number];
export const TEXTURES: [string, string][] = [
  ["none", "None"], ["dots", "Dots"], ["grid", "Grid"], ["stripes", "Stripes"], ["cross", "Crosshatch"],
  ["waves", "Waves"], ["stitch", "Stitches"], ["linen", "Linen"], ["checks", "Gingham"], ["grain", "Grain"],
];
export const CHANNELS: Record<string, string> = { sms: "SMS", whatsapp: "WhatsApp", email: "Email" };

export const BLOCKS = {
  short: { name: "Short answer", k: "Aa" },
  long: { name: "Long answer", k: "¶" },
  email: { name: "Email", k: "@" },
  phone: { name: "Phone", k: "#" },
  number: { name: "Number", k: "12" },
  choice: { name: "Choice buttons", k: "◉", opts: true },
  multi: { name: "Multi-select", k: "☑", opts: true },
  dropdown: { name: "Dropdown", k: "▾", opts: true },
  sizes: { name: "Quantity per size", k: "S/M", opts: true },
  date: { name: "Date", k: "D" },
  upload: { name: "File upload", k: "↑" },
  button: { name: "Link button", k: "↗", deco: true },
  heading: { name: "Heading", k: "H", deco: true },
  text: { name: "Text", k: "T", deco: true },
  divider: { name: "Divider", k: "—", deco: true },
  image: { name: "Artwork / image", k: "▣", deco: true },
  page: { name: "Page break", k: "⤓", deco: true },
  submit: { name: "Submit button", k: "✓", deco: true, internal: true },
} as const satisfies Record<string, { name: string; k: string; opts?: boolean; deco?: boolean; internal?: boolean }>;
export type FieldType = keyof typeof BLOCKS;
export const FIELD_TYPES = Object.keys(BLOCKS) as FieldType[];
export const hasOptions = (t: FieldType) => "opts" in BLOCKS[t];
export const isInput = (t: FieldType) => !("deco" in BLOCKS[t]);

export const IMG_DEFAULT = { alt: "", name: "", w: 100, wUnit: "%", h: 240, keep: true, fit: "cover", align: "center", marX: 0, marY: 0, bw: 0, bc: "#000000", br: 12, op: 100, link: "" };
export const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** Storage paths are always "{org uuid}/..." with a short, plain file path. */
export const SAFE_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*\.(webp|png|jpg|jpeg)$/;

// ---------------------------------------------------------------- types
export type ImageRef = { path: string };
export type Theme = { page: string; card: string; text: string; accent: string; accentText: string; radius: string; font: string; layout: string };
export type Style = Record<string, any>;
export type TexLayer = { tex: string; texColor: string; texOp: number; texScale: number };
export type Design = {
  v: 1;
  theme: Theme;
  art: ImageRef | null;
  palette: string[];
  shared: Record<SharedKind, Style>;
  el: Record<string, Style>;
  page: TexLayer;
  card: TexLayer;
  adv: { progress: boolean; disableUntilValid: boolean };
};
export type FieldConfig = {
  display?: "list" | "buttons";
  url?: string;
  img?: typeof IMG_DEFAULT & { src?: ImageRef | null };
  next?: string;
  prev?: string;
};
export type FormField = {
  id: string;
  type: FieldType;
  label: string;
  help: string;
  placeholder: string;
  required: boolean;
  options: string[];
  config: FieldConfig;
};
export type FormSettings = { notify: { channel: "sms" | "whatsapp" | "email"; consent: boolean } };
export type FormModel = {
  id: string;
  title: string;
  slug: string;
  eventDate: string | null;
  venue: string;
  intro: string;
  thanks: string;
  submitLabel: string;
  settings: FormSettings;
  design: Design;
  fields: FormField[];
};

// ---------------------------------------------------------------- helpers
export const obj = (o: unknown): Record<string, any> => (o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, any>) : {});
export const num = (v: unknown, min: number, max: number, d: number) => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : d;
};
export const en = <T>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
export function safeUrl(u: unknown): string {
  try {
    const x = new URL(String(u || "").trim());
    return ["http:", "https:", "mailto:", "tel:"].includes(x.protocol) ? x.href : "";
  } catch {
    return "";
  }
}
export function merge(...os: unknown[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const o of os) {
    if (!o || typeof o !== "object") continue;
    for (const k of Object.keys(o)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      const v = (o as Record<string, any>)[k];
      if (v === undefined || v === null) continue;
      if (typeof v === "object" && !Array.isArray(v)) out[k] = merge(obj(out[k]), v);
      else out[k] = v;
    }
  }
  return out;
}
/** Public URL for an image stored in the form-assets bucket, or null if the reference isn't a safe path. */
export function srcOf(ref: unknown, assetBase: string): string | null {
  const p = obj(ref).path;
  return typeof p === "string" && SAFE_PATH.test(p) ? `${assetBase}/${p}` : null;
}
export const assetBaseFor = (supabaseUrl: string) => `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/form-assets`;
export const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : fallbackUuid());
function fallbackUuid() {
  const h = [...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "form";

const radiusObj = (v: number) => ({ linked: true, all: v, tl: v, tr: v, br: v, bl: v });
const pad4 = (t: number, r: number, b: number, l: number) => ({ t, r, b, l });
const fontStack = (k: string, f: FormModel) => {
  const fs = FONTS[f.design.theme.font] || FONTS.clean;
  if (k === "head") k = fs.head;
  else if (k === "body") k = fs.body;
  return FONT_STACKS[k] || FONT_STACKS.plex;
};

// ---------------------------------------------------------------- elements and their defaults
export type El = { sid: string; kind: string; name: string; btn?: string; title?: boolean; intro?: boolean; f?: FormField; part?: string };

export function elementsOf(form: FormModel): El[] {
  const L: El[] = [
    { sid: "__title", kind: "heading", name: "Form title", title: true },
    { sid: "__intro", kind: "text", name: "Intro text", intro: true },
  ];
  let pages = 0;
  for (const f of form.fields) {
    const nm = (f.label || BLOCKS[f.type].name).slice(0, 34);
    switch (f.type) {
      case "submit": L.push({ sid: "__submit", kind: "button", btn: "submit", name: "Submit button" }); break;
      case "page": pages++; break;
      case "heading": L.push({ sid: f.id, kind: "heading", name: "Heading: " + nm, f }); break;
      case "text": L.push({ sid: f.id, kind: "text", name: "Text: " + nm, f }); break;
      case "divider": L.push({ sid: f.id, kind: "divider", name: "Divider", f }); break;
      case "button": L.push({ sid: f.id, kind: "button", btn: "link", name: "Link button: " + nm, f }); break;
      case "image": L.push({ sid: f.id, kind: "image", name: "Artwork: " + ((f.config.img?.alt || f.config.img?.name) || "image").slice(0, 30), f }); break;
      default: {
        const ch = f.type === "choice" || f.type === "multi";
        L.push({ sid: f.id, kind: ch ? "choice" : "input", name: nm + (ch ? " · options" : " · input box"), f, part: "main" });
        L.push({ sid: f.id + "__label", kind: "label", name: nm + " · label", f, part: "label" });
      }
    }
  }
  if (pages) L.push({ sid: "__next", kind: "button", btn: "next", name: "Next buttons" }, { sid: "__prev", kind: "button", btn: "prev", name: "Back buttons" });
  return L;
}

export function elDefault(form: FormModel, el: El): Style {
  const T = form.design.theme, R = RADII[T.radius] ?? 12, up = !!(FONTS[T.font] || {}).upper;
  const card = T.card, txt = T.text, acc = T.accent, dark = lum(over(card, T.page)) < 0.3;
  const base = { font: "body", size: 15, unit: "px", weight: 400, color: txt, align: "left", transform: "none", spacing: 0, lh: 1.5, mar: { t: 0, b: 0 } };
  const bg0 = (c: string) => ({ type: "solid", color: c, opacity: 100, color2: mix(acc, txt, 0.35), angle: 135, gtype: "linear", tex: "dots", texColor: bestOn(acc), texOp: 25, texScale: 14, img: null, imgSize: "cover", imgScale: 100, pos: "center", repeat: "no-repeat" });
  switch (el.kind) {
    case "button": {
      const filled = el.btn === "submit" || el.btn === "next", prev = el.btn === "prev";
      const bg = bg0(acc);
      if (!filled) bg.opacity = 0;
      return {
        ...base, font: filled ? "head" : "body", size: filled ? 16 : 15, weight: filled ? 700 : 600, color: filled ? T.accentText : txt, align: "center",
        transform: filled && up ? "uppercase" : "none", spacing: filled ? 0.01 : 0, lh: 1.2, width: "auto", w: 240, wUnit: "px", minH: filled ? 50 : 44,
        pad: filled ? pad4(14, 26, 14, 26) : pad4(10, 18, 10, 18), place: "left", bg,
        border: { style: filled ? "none" : "solid", width: 2, color: prev ? mix(txt, card, 0.7) : acc }, radius: radiusObj(R),
        st: {
          hover: { color: "", bg: filled ? shade(acc, 0.1) : alphaMul(acc, 0.14), border: "" },
          active: { color: "", bg: filled ? shade(acc, 0.2) : alphaMul(acc, 0.24), border: "" },
          focus: { ring: alphaMul(acc, 0.45), ringW: 3, border: "" },
          disabled: { opacity: 45, color: "", bg: "", border: "" },
        },
      };
    }
    case "input": {
      const t = el.f ? el.f.type : "short";
      return {
        ...base, lh: 1.4, ph: mix(txt, card, 0.5), width: "full", w: 100, wUnit: "%", minH: t === "long" ? 96 : 46, pad: pad4(11, 13, 11, 13),
        bg: bg0(mix(card, txt, 0.05)), border: { style: t === "upload" ? "dashed" : "solid", width: 1.5, color: mix(txt, card, 0.75) }, radius: radiusObj(Math.min(R, 12)),
        st: {
          hover: { border: mix(acc, card, 0.35), bg: "" },
          focus: { border: acc, ring: alphaMul(acc, 0.3), ringW: 3 },
          error: { border: "#E5484D", color: dark ? "#FF8A80" : "#C62828" },
          disabled: { bg: mix(card, txt, 0.1), color: mix(txt, card, 0.45), border: "", opacity: 100 },
        },
      };
    }
    case "choice": {
      const bg = bg0(acc);
      bg.opacity = 0;
      return {
        ...base, weight: 500, lh: 1.3, width: "auto", w: 160, wUnit: "px", minH: 0, pad: pad4(10, 16, 10, 16), bg,
        border: { style: "solid", width: 1.5, color: mix(txt, card, 0.72) }, radius: radiusObj(R),
        st: { hover: { border: acc, bg: "", color: "" }, selected: { bg: acc, color: T.accentText, border: acc }, focus: { ring: alphaMul(acc, 0.4), ringW: 3 } },
      };
    }
    case "label": return { ...base, weight: 600, lh: 1.4 };
    case "heading":
      return el.title
        ? { ...base, font: "head", size: 40, weight: 700, transform: up ? "uppercase" : "none", spacing: -0.01, lh: 1.08 }
        : { ...base, font: "head", size: 21, weight: 700, transform: up ? "uppercase" : "none", lh: 1.2, mar: { t: 6, b: 0 } };
    case "text": return { ...base, color: mix(txt, card, 0.15) };
    case "divider": return { mar: { t: 0, b: 0 }, border: { style: "solid", width: 1.5, color: mix(txt, card, 0.82) } };
  }
  return base;
}
export function computed(form: FormModel, el: El): Style {
  const shared = (SHARED_KINDS as readonly string[]).includes(el.kind) ? form.design.shared[el.kind as SharedKind] : null;
  return merge(elDefault(form, el), shared, form.design.el[el.sid]);
}

// ---------------------------------------------------------------- CSS generation
export function texUrl(id: string, color: unknown, op: unknown, s: unknown): string | null {
  const c = cc(color) || "#000000", col = c.slice(0, 7), o = +((num(op, 0, 100, 25) / 100) * rgbOf(c).a).toFixed(3), S = num(s, 4, 80, 14), sw = +Math.max(1, S / 12).toFixed(2);
  const st = `stroke='${col}' stroke-opacity='${o}' fill='none'`;
  let b: string;
  switch (id) {
    case "dots": b = `<circle cx='${S / 2}' cy='${S / 2}' r='${(S / 7).toFixed(2)}' fill='${col}' fill-opacity='${o}'/>`; break;
    case "grid": b = `<path d='M${S} 0V${S}H0' ${st} stroke-width='${sw}'/>`; break;
    case "stripes": b = `<path d='M-1 ${S + 1}L${S + 1} -1M${-S / 2} ${S / 2}L${S / 2} ${-S / 2}M${S / 2} ${S * 1.5}L${S * 1.5} ${S / 2}' ${st} stroke-width='${sw * 1.6}'/>`; break;
    case "cross": b = `<path d='M0 0L${S} ${S}M${S} 0L0 ${S}' ${st} stroke-width='${sw}'/>`; break;
    case "waves": b = `<path d='M0 ${S / 2}Q${S / 4} ${S / 4} ${S / 2} ${S / 2}T${S} ${S / 2}' ${st} stroke-width='${sw * 1.3}'/>`; break;
    case "stitch": b = `<path d='M${S * 0.06} ${S * 0.27}H${S * 0.44}M${S * 0.56} ${S * 0.77}H${S * 0.94}' ${st} stroke-width='${sw * 1.6}' stroke-linecap='round'/>`; break;
    case "linen": b = `<path d='M0 ${S / 3}H${S}M0 ${(S * 2) / 3}H${S}M${S / 3} 0V${S}M${(S * 2) / 3} 0V${S}' ${st} stroke-width='${sw * 0.8}'/>`; break;
    case "checks": b = `<rect width='${S / 2}' height='${S}' fill='${col}' fill-opacity='${o * 0.55}'/><rect width='${S}' height='${S / 2}' fill='${col}' fill-opacity='${o * 0.55}'/>`; break;
    case "grain": {
      const r = rgbOf(col);
      b = `<filter id='g'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${(r.r / 255).toFixed(3)} 0 0 0 0 ${(r.g / 255).toFixed(3)} 0 0 0 0 ${(r.b / 255).toFixed(3)} 0 0 0 ${(o * 1.8).toFixed(3)} 0'/></filter><rect width='100%' height='100%' filter='url(%23g)'/>`;
      break;
    }
    default: return null;
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${S}' height='${S}' viewBox='0 0 ${S} ${S}'>${b}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/%2523/g, "%23")}")`;
}
const D = (o: Record<string, unknown>) => Object.entries(o).filter(([, v]) => v != null && v !== "").map(([k, v]) => k + ":" + v).join(";");
function sizeCss(s: Style) {
  const u = en(s.unit, ["px", "rem", "em"], "px"), v = num(s.size, u === "px" ? 8 : 0.5, u === "px" ? 120 : 8, 16);
  if (u === "px" && v > 24) {
    const lo = Math.max(22, Math.round(v * 0.7));
    return `clamp(${lo}px,${(v / 6.2).toFixed(2)}cqi,${v}px)`;
  }
  return v + u;
}
function textCss(s: Style, form: FormModel) {
  return D({
    "font-family": fontStack(String(s.font), form), "font-size": sizeCss(s), "font-weight": en(+s.weight, [300, 400, 500, 600, 700, 800], 400),
    color: cc(s.color), "text-align": en(s.align, ["left", "center", "right"], "left"), "text-transform": en(s.transform, ["none", "uppercase", "lowercase", "capitalize"], "none"),
    "letter-spacing": num(s.spacing, -0.1, 0.5, 0) + "em", "line-height": num(s.lh, 0.8, 3, 1.5),
  });
}
const dim = (v: unknown, u: unknown) => (u === "%" ? num(v, 1, 100, 100) + "%" : num(v, 1, 2000, 200) + "px");
const padCss = (p: unknown) => { const q = obj(p); return [q.t, q.r, q.b, q.l].map((v) => num(v, 0, 80, 0) + "px").join(" "); };
function radiusCss(r: unknown) {
  const q = obj(r);
  if (q.linked !== false) return num(q.all, 0, 999, 0) + "px";
  return [q.tl, q.tr, q.br, q.bl].map((v) => num(v, 0, 999, 0) + "px").join(" ");
}
function borderCss(b: unknown) {
  const q = obj(b), st = en(q.style, ["none", "solid", "dashed", "dotted"], "solid");
  return st === "none" ? "border-style:none" : D({ "border-width": num(q.width, 0, 12, 1) + "px", "border-style": st, "border-color": cc(q.color) || "transparent" });
}
function bgCss(bgIn: unknown, assetBase: string) {
  const bg = obj(bgIn), type = en(bg.type, ["solid", "gradient", "texture", "image"], "solid"), op = num(bg.opacity, 0, 100, 100) / 100;
  const c1 = alphaMul(bg.color, op) || "transparent";
  if (type === "gradient") {
    const c2 = alphaMul(bg.color2, op) || c1;
    return "background:" + (bg.gtype === "radial" ? `radial-gradient(circle at center,${c1},${c2})` : `linear-gradient(${num(bg.angle, 0, 360, 135)}deg,${c1},${c2})`);
  }
  if (type === "texture") {
    const u = texUrl(en(bg.tex, TEXTURES.map((t) => t[0]), "dots"), bg.texColor, bg.texOp, bg.texScale), sc = num(bg.texScale, 4, 80, 14);
    return D({ "background-color": c1, "background-image": u, "background-size": u ? sc + "px " + sc + "px" : null, "background-repeat": "repeat" });
  }
  if (type === "image") {
    const src = srcOf(bg.img, assetBase);
    if (src) {
      const base = alphaMul(bg.color, 1) || "#FFFFFF", ov = alphaMul(bg.color, 1 - op) || "transparent";
      const size = bg.imgSize === "custom" ? num(bg.imgScale, 5, 400, 100) + "%" : en(bg.imgSize, ["cover", "contain", "auto"], "cover");
      const pos = en(bg.pos, ["center", "top", "bottom", "left", "right", "top left", "top right", "bottom left", "bottom right"], "center");
      return `background-color:${base};background-image:linear-gradient(${ov},${ov}),url("${src}");background-size:auto,${size};background-position:center,${pos};background-repeat:no-repeat,${en(bg.repeat, ["no-repeat", "repeat", "repeat-x", "repeat-y"], "no-repeat")}`;
    }
  }
  return "background:" + c1;
}
function ringCss(f: Style) {
  const ring = cc(f.ring);
  return ring ? `outline:none;box-shadow:0 0 0 ${num(f.ringW, 1, 10, 3)}px ${ring}` : "outline:2px solid currentColor;outline-offset:2px";
}
function texLayer(t: unknown) {
  const q = obj(t);
  if (!q.tex || q.tex === "none") return "";
  const u = texUrl(String(q.tex), q.texColor, q.texOp, q.texScale);
  if (!u) return "";
  const sc = num(q.texScale, 4, 80, 14);
  return `background-image:${u};background-size:${sc}px ${sc}px`;
}
const ALIGN: Record<string, string> = { left: "flex-start", center: "center", right: "flex-end" };

function elCss(W: string, el: El, s: Style, form: FormModel, assetBase: string): string {
  const id = el.sid;
  if (!SAFE_ID.test(id)) return "";
  const X = `${W} [data-sid="${id}"]`, st = obj(s.st);
  let o = "";
  const mar = `margin-top:${num(obj(s.mar).t, -40, 200, 0)}px;margin-bottom:${num(obj(s.mar).b, -40, 200, 0)}px`;
  const stateD = (x: unknown) => D({ color: cc(obj(x).color), background: cc(obj(x).bg), "border-color": cc(obj(x).border) });
  switch (el.kind) {
    case "button": {
      const wm = en(s.width, ["auto", "full", "custom"], "auto"), nav = el.btn !== "link", pl = en(s.place, ["left", "center", "right"], "left");
      let w: string;
      if (wm === "full") w = nav ? "flex:1 1 0;width:auto" : "align-self:stretch;width:100%";
      else {
        w = wm === "custom" ? `width:${dim(s.w, s.wUnit)}` : "width:auto";
        if (el.btn !== "prev") w += ";" + (nav ? { left: "margin-right:auto", center: "margin-inline:auto", right: "margin-left:auto" }[pl] : "align-self:" + ALIGN[pl]);
      }
      o += `${X}{${textCss(s, form)};justify-content:${ALIGN[en(s.align, ["left", "center", "right"], "center")]};${w};min-height:${num(s.minH, 0, 200, 44)}px;padding:${padCss(s.pad)};${mar};${bgCss(s.bg, assetBase)};${borderCss(s.border)};border-radius:${radiusCss(s.radius)}}`;
      o += `${X}:hover:not(:disabled),${X}.fs-hover{${stateD(st.hover)}}`;
      o += `${X}:active:not(:disabled),${X}.fs-active{${stateD(st.active)};transform:translateY(1px)}`;
      const f = obj(st.focus);
      o += `${X}:focus-visible,${X}.fs-focus{${ringCss(f)}${cc(f.border) ? ";border-color:" + cc(f.border) : ""}}`;
      const d = obj(st.disabled);
      o += `${X}:disabled,${X}.fs-disabled{opacity:${num(d.opacity, 10, 100, 45) / 100};cursor:not-allowed;${stateD(d)}}`;
      break;
    }
    case "input": {
      const I = `${X} .qf-in,${X} .qf-upload`, wm = en(s.width, ["auto", "full", "custom"], "full");
      const w = wm === "full" ? "width:100%" : wm === "custom" ? `width:${dim(s.w, s.wUnit)};max-width:100%` : "width:auto;max-width:100%";
      o += `${I}{${textCss(s, form)};${w};min-height:${num(s.minH, 0, 400, 46)}px;padding:${padCss(s.pad)};${bgCss(s.bg, assetBase)};${borderCss(s.border)};border-radius:${radiusCss(s.radius)}}`;
      o += `${X}{${mar}}`;
      if (cc(s.ph)) o += `${X} .qf-in::placeholder{color:${cc(s.ph)};opacity:1}`;
      const hv = obj(st.hover);
      o += `${X} .qf-in:hover:not(:disabled):not(:focus),${X} .qf-upload:hover,${X}.fs-hover .qf-in,${X}.fs-hover .qf-upload{${D({ "border-color": cc(hv.border), background: cc(hv.bg) })}}`;
      const f = obj(st.focus);
      o += `${X} .qf-in:focus,${X}.fs-focus .qf-in,${X}.fs-focus .qf-upload{${ringCss(f)}${cc(f.border) ? ";border-color:" + cc(f.border) : ""}}`;
      const er = obj(st.error);
      o += `${X}.invalid .qf-in,${X}.invalid .qf-upload,${X}.fs-error .qf-in,${X}.fs-error .qf-upload{${D({ "border-color": cc(er.border) })}}${X} .qf-ferr{${D({ color: cc(er.color) })}}`;
      const d = obj(st.disabled);
      o += `${X} .qf-in:disabled,${X}.fs-disabled .qf-in{${D({ background: cc(d.bg), color: cc(d.color), "border-color": cc(d.border) })};opacity:${num(d.opacity, 10, 100, 100) / 100}}`;
      break;
    }
    case "choice": {
      const O = `${X} .qf-opt span,${X} .qf-li`, wm = en(s.width, ["auto", "full", "custom"], "auto");
      o += `${O}{${textCss(s, form)};min-height:${num(s.minH, 0, 200, 0)}px;padding:${padCss(s.pad)};${bgCss(s.bg, assetBase)};${borderCss(s.border)};border-radius:${radiusCss(s.radius)}}`;
      o += `${X}{${mar}}`;
      if (wm === "full") o += `${X} .qf-opt{flex:1 1 100%}${X} .qf-opt span{width:100%}`;
      else if (wm === "custom") o += `${X} .qf-opt span,${X} .qf-li{width:${dim(s.w, s.wUnit)};max-width:100%}`;
      o += `${X} .qf-opt span{justify-content:${ALIGN[en(s.align, ["left", "center", "right"], "left")]}}`;
      o += `${X} .qf-opt:hover span,${X} .qf-li:hover,${X}.fs-hover .qf-opt span,${X}.fs-hover .qf-li{${stateD(st.hover)}}`;
      const sel = obj(st.selected);
      o += `${X} .qf-opt input:checked+span,${X} .qf-li:has(input:checked),${X}.fs-selected .qf-opt:first-child span,${X}.fs-selected .qf-li:first-child{${stateD(sel)}}`;
      if (cc(sel.bg)) o += `${X} .qf-li input{accent-color:${cc(sel.bg)}}`;
      o += `${X} .qf-opt input:focus-visible+span,${X} .qf-li:has(input:focus-visible),${X}.fs-focus .qf-opt:first-child span,${X}.fs-focus .qf-li:first-child{${ringCss(obj(st.focus))}}`;
      break;
    }
    case "label": case "heading": case "text":
      o += `${X}{${textCss(s, form)};${mar}}`;
      break;
    case "divider": {
      const b = obj(s.border), bs = en(b.style, ["none", "solid", "dashed", "dotted"], "solid");
      o += `${X}{border:0;border-top:${bs === "none" ? "0" : num(b.width, 0, 12, 1.5) + "px " + bs + " " + (cc(b.color) || "transparent")};${mar}}`;
      break;
    }
    case "image": {
      const g = merge(IMG_DEFAULT, el.f?.config.img), keep = g.keep !== false;
      o += `${X}{justify-content:${ALIGN[en(g.align, ["left", "center", "right"], "center")]};padding:0 ${num(g.marX, 0, 200, 0)}px;margin:${num(g.marY, 0, 200, 0)}px 0}`;
      o += `${X} .qf-img-in{width:${dim(g.w, g.wUnit)}}`;
      o += `${X} img{height:${keep ? "auto" : num(g.h, 10, 2000, 240) + "px"};object-fit:${keep ? "contain" : en(g.fit, ["contain", "cover", "fill"], "cover")};border:${num(g.bw, 0, 20, 0)}px solid ${cc(g.bc) || "transparent"};border-radius:${num(g.br, 0, 999, 0)}px;opacity:${num(g.op, 0, 100, 100) / 100}}`;
      break;
    }
  }
  return o;
}

/** Scoped CSS for one form. The scope is the form's id, so two forms on one page never clash. */
export function designCss(form: FormModel, assetBase: string): string {
  if (!SAFE_ID.test(form.id)) return "";
  const W = `.qf-wrap[data-qf="${form.id}"]`;
  let out = "";
  const pt = texLayer(form.design.page), ct = texLayer(form.design.card);
  if (pt) out += `${W}{${pt}}`;
  if (ct) out += `${W} .qf-card{${ct}}`;
  for (const el of elementsOf(form)) out += elCss(W, el, el.kind === "image" ? {} : computed(form, el), form, assetBase);
  // Defence in depth: CSS can never close the <style> element it is placed in.
  return out.replace(/<\//g, "<\\/");
}

/** CSS custom properties for the theme, as a React style object. */
export function themeVars(t: Theme): Record<string, string> {
  const f = FONTS[t.font] || FONTS.clean;
  return {
    "--p": cc(t.page) || "#2B2F4A", "--c": cc(t.card) || "#FFFFFF", "--t": cc(t.text) || "#1A1D2E", "--a": cc(t.accent) || "#3346D3",
    "--at": cc(t.accentText) || "#FFFFFF", "--r": `${RADII[t.radius] ?? 12}px`, "--hf": FONT_STACKS[f.head], "--bf": FONT_STACKS[f.body],
    "--pt": bestOn(over(t.page, "#FFFFFF")),
  };
}

// ---------------------------------------------------------------- normalising stored data
export const DEFAULT_THEME: Theme = { page: "#2B2F4A", card: "#FFFFFF", text: "#1A1D2E", accent: "#3346D3", accentText: "#FFFFFF", radius: "rounded", font: "clean", layout: "banner" };

export function normalizeDesign(raw: unknown): Design {
  const d = obj(raw), T = obj(d.theme);
  const theme: Theme = {
    page: cc(T.page) || DEFAULT_THEME.page,
    card: cc(T.card) || DEFAULT_THEME.card,
    text: cc(T.text) || DEFAULT_THEME.text,
    accent: cc(T.accent) || DEFAULT_THEME.accent,
    accentText: "",
    radius: T.radius in RADII ? T.radius : "rounded",
    font: FONTS[T.font] ? T.font : "clean",
    layout: LAYOUTS[T.layout] ? T.layout : "banner",
  };
  theme.accentText = cc(T.accentText) || bestOn(theme.accent);
  const shared = {} as Record<SharedKind, Style>;
  for (const k of SHARED_KINDS) shared[k] = obj(obj(d.shared)[k]);
  const el: Record<string, Style> = {};
  for (const [k, v] of Object.entries(obj(d.el))) if (SAFE_ID.test(k)) el[k] = obj(v);
  const art = obj(d.art).path && SAFE_PATH.test(obj(d.art).path) ? { path: String(obj(d.art).path) } : null;
  return {
    v: 1,
    theme,
    art,
    palette: Array.isArray(d.palette) ? d.palette.map(cc).filter((x): x is string => !!x).slice(0, 6) : [],
    shared,
    el,
    page: { tex: "none", texColor: "#FFFFFF", texOp: 12, texScale: 18, ...obj(d.page) },
    card: { tex: "none", texColor: theme.text, texOp: 6, texScale: 14, ...obj(d.card) },
    adv: { progress: obj(d.adv).progress !== false, disableUntilValid: obj(d.adv).disableUntilValid === true },
  };
}

export function normalizeField(raw: unknown): FormField | null {
  const f = obj(raw);
  if (!FIELD_TYPES.includes(f.type)) return null;
  const type = f.type as FieldType;
  const config = { ...obj(f.config) } as FieldConfig;
  if (type === "image") config.img = { ...IMG_DEFAULT, ...obj(config.img) } as FieldConfig["img"];
  if (type === "page") { config.next = String(config.next || "Next"); config.prev = String(config.prev || "Back"); }
  return {
    id: typeof f.id === "string" && SAFE_ID.test(f.id) ? f.id : newId(),
    type,
    label: String(f.label ?? ""),
    help: String(f.help ?? ""),
    placeholder: String(f.placeholder ?? ""),
    required: f.required === true,
    options: Array.isArray(f.options) ? f.options.map(String) : [],
    config,
  };
}

export function normalizeFields(raw: unknown): FormField[] {
  const list = (Array.isArray(raw) ? raw : []).map(normalizeField).filter((f): f is FormField => !!f);
  const seen = new Set<string>();
  let hasSubmit = false;
  const out = list.filter((f) => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    if (f.type !== "submit") return true;
    if (hasSubmit) return false;
    hasSubmit = true;
    return true;
  });
  if (!hasSubmit) out.push(blankField("submit"));
  return out;
}

export function normalizeSettings(raw: unknown): FormSettings {
  const n = obj(obj(raw).notify);
  return { notify: { channel: en(n.channel, ["sms", "whatsapp", "email"] as const, "sms"), consent: n.consent !== false } };
}

export function blankField(type: FieldType): FormField {
  const f: FormField = { id: newId(), type, label: "", help: "", placeholder: "", required: false, options: [], config: {} };
  switch (type) {
    case "short": f.label = "Your answer"; break;
    case "long": f.label = "Tell us more"; break;
    case "email": f.label = "Email"; break;
    case "phone": f.label = "Mobile number"; f.placeholder = "(555) 123-4567"; break;
    case "number": f.label = "How many?"; break;
    case "choice": case "multi": case "dropdown": f.label = "Pick one"; f.options = ["Option 1", "Option 2"]; if (type === "multi") f.label = "Pick any"; break;
    case "sizes": f.label = "Quantity per size"; f.options = ["S", "M", "L", "XL"]; break;
    case "date": f.label = "Date"; break;
    case "upload": f.label = "Upload your design"; break;
    case "button": f.label = "Learn more"; f.config.url = "https://"; break;
    case "heading": f.label = "Section heading"; break;
    case "text": f.label = "Add some helpful text here."; break;
    case "image": f.config.img = { ...IMG_DEFAULT, src: null }; break;
    case "page": f.config.next = "Next"; f.config.prev = "Back"; break;
  }
  return f;
}

/** The starter blocks for a brand-new form. */
export function starterFields(): FormField[] {
  const name = blankField("short"); name.label = "Your name"; name.required = true;
  const phone = blankField("phone"); phone.required = true; phone.help = "We'll text you when your order is ready.";
  const item = blankField("choice"); item.label = "What would you like?"; item.options = ["T-shirt", "Hoodie", "Cap"]; item.required = true;
  const notes = blankField("long"); notes.label = "Anything else?";
  return [name, phone, item, notes, blankField("submit")];
}

/** Pages of a form, split at page breaks. Used by the renderer for multi-step forms. */
export function pagesOf(form: FormModel) {
  const pages: { blocks: { f: FormField; i: number }[]; pb: { f: FormField; i: number } | null }[] = [{ blocks: [], pb: null }];
  form.fields.forEach((f, i) => {
    if (f.type === "page") {
      pages[pages.length - 1].pb = { f, i };
      pages.push({ blocks: [], pb: null });
    } else pages[pages.length - 1].blocks.push({ f, i });
  });
  // A trailing page break with nothing after it is ignored.
  const last = pages[pages.length - 1];
  if (!last.blocks.length && pages.length > 1) { pages.pop(); pages[pages.length - 1].pb = null; }
  return pages;
}
