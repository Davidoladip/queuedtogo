import { describe, expect, it } from "vitest";
import { cc, contrast, paletteFromPixels, themeFromPalette } from "./color";
import {
  assetBaseFor, designCss, elementsOf, merge, normalizeDesign, normalizeFields, normalizeSettings, pagesOf, safeUrl, srcOf, starterFields, themeVars,
  type FormModel,
} from "./engine";
import { parseDraft, toDraftInput } from "@/lib/validation/form";
import { formFromPublished } from "./fromDb";

const ORG = "7bb8b915-0b07-453d-90c3-56548f7b836f";
const BASE = assetBaseFor("https://ejeexndyexivsgjqlhuh.supabase.co");

function sample(over: Partial<FormModel> = {}): FormModel {
  return {
    id: "0f8fad5b-d9cb-469f-a165-70867728950e",
    title: "Food Fest",
    slug: "food-fest",
    eventDate: "2026-11-07",
    venue: "Pier 3",
    intro: "Order ahead",
    thanks: "Thanks!",
    submitLabel: "Order",
    settings: normalizeSettings({}),
    design: normalizeDesign({ theme: { accent: "#E8633A" } }),
    fields: starterFields(),
    ...over,
  };
}

describe("colours", () => {
  it("normalises valid colours and rejects everything else", () => {
    expect(cc("#abc")).toBe("#AABBCC");
    expect(cc("rgb(255, 0, 0)")).toBe("#FF0000");
    expect(cc("rgba(0,0,0,.5)")).toBe("#00000080");
    expect(cc("red;background:url(x)")).toBeNull();
    expect(cc("expression(alert(1))")).toBeNull();
    expect(cc("")).toBeNull();
  });
  it("builds a readable theme from an artwork palette", () => {
    const t = themeFromPalette(["#0F4C4A", "#F2994A", "#FFF4E2"])!;
    expect(t.page).toBe("#0F4C4A");
    expect(contrast(t.text, t.card)).toBeGreaterThan(4.5);
    expect(contrast(t.accentText, t.accent)).toBeGreaterThan(3);
  });
  it("finds dominant colours in pixel data", () => {
    const px = new Uint8ClampedArray(4 * 100);
    for (let i = 0; i < 100; i++) px.set(i < 70 ? [200, 30, 30, 255] : [20, 20, 200, 255], i * 4);
    const p = paletteFromPixels(px);
    expect(p.length).toBe(2);
    expect(p[0]).toBe("#C81E1E");
  });
});

describe("design CSS", () => {
  it("is scoped to the form and includes the accent colour", () => {
    const css = designCss(sample(), BASE);
    expect(css).toContain('.qf-wrap[data-qf="0f8fad5b-d9cb-469f-a165-70867728950e"] [data-sid="__submit"]');
    expect(css).toContain("#E8633A");
  });
  it("never lets design values break out of their CSS rule", () => {
    const f = sample();
    f.design.el["__submit"] = { color: "red}body{display:none", size: "999;}", font: "</style><script>", bg: { type: "image", img: { path: "https://evil.example/x.png" } } };
    f.design.shared.label = { align: "left;}*{color:red", transform: "uppercase}" };
    const css = designCss(f, BASE);
    expect(css).not.toContain("display:none");
    expect(css).not.toContain("evil.example");
    expect(css).not.toContain("<script");
    expect(css).not.toContain("</style");
    expect(css).not.toContain("*{color:red");
  });
  it("ignores element ids that aren't safe", () => {
    const f = sample();
    f.fields[0].id = 'x"]{}body{display:none}[x="';
    expect(designCss(f, BASE)).not.toContain("display:none");
  });
  it("applies shared styles, then per-element overrides", () => {
    const f = sample();
    const btn = elementsOf(f).find((e) => e.sid === "__submit")!;
    f.design.shared.button = { color: "#111111" };
    f.design.el.__submit = { color: "#222222" };
    expect(designCss(f, BASE)).toContain("color:#222222");
    expect(btn.kind).toBe("button");
  });
  it("theme variables only contain clean values", () => {
    const v = themeVars({ ...sample().design.theme, page: "url(javascript:alert(1))", font: "nope" });
    expect(v["--p"]).toBe("#2B2F4A");
    expect(v["--hf"]).toContain("IBM Plex Sans");
  });
});

describe("images and links", () => {
  it("only serves images from the business's storage folder", () => {
    expect(srcOf({ path: `${ORG}/forms/a/b.webp` }, BASE)).toBe(`${BASE}/${ORG}/forms/a/b.webp`);
    expect(srcOf({ path: "https://evil.example/x.webp" }, BASE)).toBeNull();
    expect(srcOf({ path: `${ORG}/../x.webp` }, BASE)).toBeNull();
    expect(srcOf({ path: `${ORG}/x.svg` }, BASE)).toBeNull();
    expect(srcOf({ data: "data:image/png;base64,AAAA" }, BASE)).toBeNull();
  });
  it("only allows web, email and phone links", () => {
    expect(safeUrl("https://example.com")).toBe("https://example.com/");
    expect(safeUrl("javascript:alert(1)")).toBe("");
    expect(safeUrl("data:text/html,x")).toBe("");
    expect(safeUrl("tel:+15551234567")).toBe("tel:+15551234567");
  });
  it("merge ignores prototype pollution keys", () => {
    const out = merge({ a: 1 }, JSON.parse('{"__proto__":{"polluted":true},"b":2}'));
    expect(out.b).toBe(2);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("normalising stored forms", () => {
  it("fills in a missing theme and drops unknown keys", () => {
    const d = normalizeDesign({ v: 1, theme: { page: "nope", radius: "blob" }, junk: 1, art: { path: "x" } });
    expect(d.theme.page).toBe("#2B2F4A");
    expect(d.theme.radius).toBe("rounded");
    expect(d.art).toBeNull();
    expect("junk" in d).toBe(false);
  });
  it("keeps exactly one submit block and drops unknown block types", () => {
    const fs = normalizeFields([{ id: "a", type: "short" }, { id: "b", type: "submit" }, { id: "c", type: "submit" }, { id: "d", type: "script" }]);
    expect(fs.map((f) => f.type)).toEqual(["short", "submit"]);
    expect(normalizeFields([{ id: "a", type: "short" }]).at(-1)!.type).toBe("submit");
  });
  it("splits multi-page forms at page breaks", () => {
    const f = sample();
    f.fields.splice(2, 0, { id: "11111111-1111-4111-8111-111111111111", type: "page", label: "", help: "", placeholder: "", required: false, options: [], config: { next: "Next" } });
    const pages = pagesOf(f);
    expect(pages.length).toBe(2);
    expect(pages[0].blocks.length).toBe(2);
    expect(pages[1].blocks.at(-1)!.f.type).toBe("submit");
  });
  it("reads a published snapshot", () => {
    const m = formFromPublished("0f8fad5b-d9cb-469f-a165-70867728950e", "food-fest", {
      title: "Food Fest", submit_label: "Go", design: { theme: { accent: "#123456" } }, fields: [{ id: "0f8fad5b-d9cb-469f-a165-70867728950f", type: "short", label: "Name" }],
    });
    expect(m.design.theme.accent).toBe("#123456");
    expect(m.fields.map((f) => f.type)).toEqual(["short", "submit"]);
  });
});

describe("draft validation", () => {
  it("accepts a normal draft", () => {
    const r = parseDraft(toDraftInput(sample()));
    expect(r.ok).toBe(true);
  });
  it("rejects bad slugs, missing titles and duplicate submit buttons", () => {
    expect(parseDraft(toDraftInput(sample({ slug: "Bad Slug!" }))).ok).toBe(false);
    expect(parseDraft(toDraftInput(sample({ title: "  " }))).ok).toBe(false);
    const f = sample();
    f.fields.push({ ...f.fields.at(-1)!, id: "22222222-2222-4222-8222-222222222222" });
    expect(parseDraft(toDraftInput(f))).toMatchObject({ ok: false, error: "A form needs exactly one submit button." });
  });
  it("rejects unknown block types and oversized designs", () => {
    const f = sample();
    (f.fields[0] as { type: string }).type = "script";
    expect(parseDraft(toDraftInput(f)).ok).toBe(false);
    const g = sample();
    g.design.el.big = { x: "y".repeat(250_000) };
    expect(parseDraft(toDraftInput(g))).toMatchObject({ ok: false, error: "The design is too large to save." });
  });
  it("re-normalises the design on the server", () => {
    const f = sample();
    (f.design as unknown as Record<string, unknown>).evil = "<script>";
    f.design.theme.accent = "javascript:alert(1)";
    const r = parseDraft(toDraftInput(f));
    if (!r.ok) throw new Error(r.error);
    expect("evil" in r.data.design).toBe(false);
    expect(r.data.design.theme.accent).toBe("#3346D3");
  });
});

describe("prototype pollution", () => {
  it("drops __proto__ element keys from stored designs", () => {
    const d = normalizeDesign(JSON.parse('{"el":{"__proto__":{"polluted":1},"__submit":{"color":"#000000"}}}'));
    expect(Object.keys(d.el)).toEqual(["__submit"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("new design settings survive save and reload", () => {
  it("round-trips heading artwork, question/option artwork, swatches, option styles and messages", async () => {
    const { formFromRows } = await import("./fromDb");
    const { SWATCH_DEFAULT, artDefaultFor } = await import("./media");
    const f = sample();
    const path = `${ORG}/forms/f/11111111-1111-4111-8111-111111111111.webp`;
    f.design.headArt = { ...artDefaultFor("head"), src: { path }, pos: "left", maxW: 200, shadow: { on: true, x: 0, y: 6, blur: 20, color: "#00000044" } };
    const q = f.fields.find((x) => x.type === "choice")!;
    q.config.art = { ...artDefaultFor("field"), src: { path }, pos: "below" };
    q.config.swatches = { ...structuredClone(SWATCH_DEFAULT), required: true };
    q.config.optMeta = [{ art: { ...artDefaultFor("option"), src: { path } }, swatches: null, style: { bg: { color: "#FFD54F", opacity: 100 } } }];
    f.settings.notify.consentText = "Text me, {business}.";
    f.thanks = "Order {order_number} received.";
    const r = parseDraft(toDraftInput(f));
    if (!r.ok) throw new Error(r.error);
    const back = formFromRows({ id: f.id, title: r.data.title, slug: r.data.slug, event_date: null, venue: "", intro: "", thanks: r.data.thanks, submit_label: r.data.submit_label, settings: r.data.settings, design: r.data.design },
      r.fields.map((x) => ({ ...x, options: x.options, config: x.config })));
    expect(back.design.headArt?.pos).toBe("left");
    expect(back.design.headArt?.maxW).toBe(200);
    expect(back.design.headArt?.shadow.on).toBe(true);
    const bq = back.fields.find((x) => x.type === "choice")!;
    expect(bq.config.art?.pos).toBe("below");
    expect(bq.config.swatches?.items.length).toBe(3);
    expect(bq.config.swatches?.required).toBe(true);
    expect(bq.config.optMeta?.[0].art?.src?.path).toBe(path);
    expect(bq.config.optMeta?.[0].style.bg.color).toBe("#FFD54F");
    expect(back.settings.notify.consentText).toBe("Text me, {business}.");
    expect(back.thanks).toBe("Order {order_number} received.");
  });
  it("cleans hostile artwork and swatch settings on the server", () => {
    const f = sample();
    const q = f.fields.find((x) => x.type === "choice")!;
    (q.config as Record<string, unknown>).art = { src: { path: "https://evil.example/x.png" } };
    (q.config as Record<string, unknown>).swatches = { items: [{ color: "red;}body{display:none", label: "x" }, { color: "#00FF00", label: "<b>g</b>" }], size: 9999 };
    (f.design as unknown as Record<string, unknown>).headArt = { src: { path: `${ORG}/x.webp` }, w: 1e9, pos: "evil", bc: "url(javascript:1)" };
    const r = parseDraft(toDraftInput(f));
    if (!r.ok) throw new Error(r.error);
    const rq = r.fields.find((x) => x.type === "choice")!;
    expect(rq.config.art).toBeUndefined();
    expect(rq.config.swatches?.items).toEqual([{ color: "#00FF00", label: "<b>g</b>" }]);
    expect(rq.config.swatches?.size).toBe(96);
    expect(r.data.design.headArt?.w).toBe(2000);
    expect(r.data.design.headArt?.pos).toBe("above");
    expect(r.data.design.headArt?.bc).toBe("#000000");
    const css = designCss({ ...f, design: r.data.design, fields: r.fields as FormModel["fields"] }, BASE);
    expect(css).not.toContain("display:none");
    expect(css).not.toContain("javascript");
  });
});
