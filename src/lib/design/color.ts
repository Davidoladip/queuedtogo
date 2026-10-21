// Colour utilities, ported from the prototype (prototype/index.html, "Colour").
// Every function accepts untrusted strings and returns either a normalised #RRGGBB(AA) value or null.

export type RGBA = { r: number; g: number; b: number; a: number };

export function parseColor(str: unknown): RGBA | null {
  if (str == null) return null;
  const s = String(str).trim().toLowerCase();
  let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = h.split("").map((c) => c + c).join("");
    const v = [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2) || "ff", 16));
    return { r: v[0], g: v[1], b: v[2], a: +(v[3] / 255).toFixed(3) };
  }
  m = s.match(/^rgba?\(\s*([\d.]+%?)\s*[,\s]\s*([\d.]+%?)\s*[,\s]\s*([\d.]+%?)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/);
  if (m) {
    const ch = (x: string) => (x.endsWith("%") ? parseFloat(x) * 2.55 : parseFloat(x));
    const r = ch(m[1]), g = ch(m[2]), b = ch(m[3]);
    const a = m[4] == null ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    if ([r, g, b].some((v) => !(v >= 0 && v <= 255)) || !(a >= 0 && a <= 1)) return null;
    return { r: Math.round(r), g: Math.round(g), b: Math.round(b), a: +a.toFixed(3) };
  }
  return null;
}

const h2 = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0").toUpperCase();
export const toHex = (c: RGBA) => "#" + h2(c.r) + h2(c.g) + h2(c.b) + (c.a < 0.999 ? h2(c.a * 255) : "");
/** Clean colour: a safe hex string, or null for anything that isn't a colour. */
export const cc = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  const c = parseColor(v);
  return c ? toHex(c) : null;
};
export const alphaMul = (v: unknown, m: number): string | null => {
  const c = parseColor(v);
  return c ? toHex({ ...c, a: Math.max(0, Math.min(1, c.a * m)) }) : null;
};
export const rgbOf = (v: unknown): RGBA => parseColor(v) || { r: 0, g: 0, b: 0, a: 1 };
export function over(fg: unknown, bg: unknown) {
  const f = rgbOf(fg), b = rgbOf(bg), a = f.a;
  return toHex({ r: f.r * a + b.r * (1 - a), g: f.g * a + b.g * (1 - a), b: f.b * a + b.b * (1 - a), a: 1 });
}
export function mix(a: unknown, b: unknown, t: number) {
  const A = rgbOf(a), B = rgbOf(b);
  return toHex({ r: A.r + (B.r - A.r) * t, g: A.g + (B.g - A.g) * t, b: A.b + (B.b - A.b) * t, a: 1 });
}
export function lum(h: unknown) {
  const c = rgbOf(h);
  return [c.r, c.g, c.b]
    .map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
}
export const contrast = (a: unknown, b: unknown) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
export function sat(h: unknown) {
  const c = rgbOf(h), r = c.r / 255, g = c.g / 255, b = c.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx === mn) return 0;
  const l = (mx + mn) / 2;
  return (mx - mn) / (1 - Math.abs(2 * l - 1));
}
export const bestOn = (bg: unknown) => (contrast(bg, "#FFFFFF") >= contrast(bg, "#141414") ? "#FFFFFF" : "#141414");
export const shade = (c: unknown, t: number) => (lum(c) > 0.2 ? mix(c, "#000000", t) : mix(c, "#FFFFFF", t));

/** Up to 6 distinct dominant colours from raw RGBA pixel data (e.g. a small canvas of the artwork). */
export function paletteFromPixels(d: Uint8ClampedArray): string[] {
  const buckets: Record<string, { n: number; r: number; g: number; b: number }> = {};
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const k = [d[i], d[i + 1], d[i + 2]].map((v) => v >> 4).join(",");
    const bk = (buckets[k] = buckets[k] || { n: 0, r: 0, g: 0, b: 0 });
    bk.n++; bk.r += d[i]; bk.g += d[i + 1]; bk.b += d[i + 2];
  }
  const list = Object.values(buckets).sort((a, b) => b.n - a.n).map((b) => toHex({ r: b.r / b.n, g: b.g / b.n, b: b.b / b.n, a: 1 }));
  const out: string[] = [];
  for (const c of list) {
    if (out.every((o) => { const A = rgbOf(o), B = rgbOf(c); return Math.hypot(A.r - B.r, A.g - B.g, A.b - B.b) > 60; })) out.push(c);
    if (out.length >= 6) break;
  }
  return out;
}

export type ThemeColours = { page: string; card: string; text: string; accent: string; accentText: string };

/** A readable theme built from an artwork palette: page from the dominant colour, accent from the most vivid. */
export function themeFromPalette(p: string[]): ThemeColours | null {
  if (!p.length) return null;
  const page = p[0], darkPage = lum(page) < 0.05;
  const card = darkPage ? mix(page, "#FFFFFF", 0.08) : mix(page, "#FFFFFF", 0.92);
  const text = darkPage ? mix(page, "#FFFFFF", 0.93) : mix(page, "#000000", 0.82);
  let accent = [...p].sort((a, b) => (sat(b) - Math.abs(lum(b) - 0.35)) - (sat(a) - Math.abs(lum(a) - 0.35)))[0] || page;
  for (let i = 0; i < 12 && contrast(accent, card) < 1.8; i++) accent = mix(accent, darkPage ? "#FFFFFF" : "#000000", 0.12);
  return { page, card, text, accent, accentText: bestOn(accent) };
}
