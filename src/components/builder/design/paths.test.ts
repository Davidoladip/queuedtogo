import { describe, expect, it } from "vitest";
import { normalizeDesign, normalizeSettings, starterFields, type FormModel } from "@/lib/design/engine";
import { applyPath, resetPath } from "./paths";

const form = (): FormModel => ({
  id: "0f8fad5b-d9cb-469f-a165-70867728950e", title: "T", slug: "t", eventDate: null, venue: "", intro: "", thanks: "", submitLabel: "Go",
  settings: normalizeSettings({}), design: normalizeDesign({}), fields: starterFields(),
});

describe("design paths", () => {
  it("sets theme, element, shared, texture, advanced and form values", () => {
    const f = form();
    applyPath(f, "th.page", "#111111");
    applyPath(f, "e.__submit.bg.color", "#222222");
    applyPath(f, "g.button.border.width", 3);
    applyPath(f, "pg.tex", "dots");
    applyPath(f, "adv.progress", false);
    applyPath(f, "ev.submitLabel", "Order now");
    expect(f.design.theme.page).toBe("#111111");
    expect(f.design.el.__submit.bg.color).toBe("#222222");
    expect(f.design.shared.button.border.width).toBe(3);
    expect(f.design.page.tex).toBe("dots");
    expect(f.design.adv.progress).toBe(false);
    expect(f.submitLabel).toBe("Order now");
  });
  it("keeps button text readable when the button colour changes", () => {
    const f = form();
    f.design.theme.accentText = "#FFFFFF";
    applyPath(f, "th.accent", "#FFF176");
    expect(f.design.theme.accentText).toBe("#141414");
  });
  it("ignores unsafe or unknown paths", () => {
    const f = form();
    applyPath(f, "e.__proto__.polluted", 1);
    applyPath(f, "g.__proto__.x", 1);
    applyPath(f, "e.bad id.color", "#000");
    applyPath(f, "th.notakey", "x");
    applyPath(f, "zz.a", 1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(f.design.el)).toEqual([]);
    expect("notakey" in f.design.theme).toBe(false);
  });
  it("reset removes an override and tidies empty objects", () => {
    const f = form();
    applyPath(f, "e.__title.color", "#C2185B");
    resetPath(f, "e.__title.color");
    expect(f.design.el.__title).toBeUndefined();
    applyPath(f, "g.label.st.hover.bg", "#000000");
    resetPath(f, "g.label.st.hover.bg");
    expect(f.design.shared.label).toEqual({});
  });
  it("edits an artwork block's image settings", () => {
    const f = form();
    f.fields.splice(0, 0, { id: "11111111-1111-4111-8111-111111111111", type: "image", label: "", help: "", placeholder: "", required: false, options: [], config: {} });
    applyPath(f, "img.11111111-1111-4111-8111-111111111111.w", 60);
    expect(f.fields[0].config.img?.w).toBe(60);
  });
});

describe("background colours", () => {
  it("picking a background colour makes a see-through fill visible", () => {
    const f = form();
    applyPath(f, "g.choice.bg.color", "#FFD54F");
    expect(f.design.shared.choice.bg.opacity).toBe(100);
    applyPath(f, "g.choice.bg.opacity", 40);
    applyPath(f, "g.choice.bg.color", "#000000");
    expect(f.design.shared.choice.bg.opacity).toBe(40);
  });
  it("styles one option without touching the others", () => {
    const f = form();
    const q = f.fields.find((x) => x.type === "choice")!;
    applyPath(f, `o.${q.id}.1.color`, "#C2185B");
    expect(q.config.optMeta?.[1].style.color).toBe("#C2185B");
    expect(q.config.optMeta?.[0].style).toEqual({});
    resetPath(f, `o.${q.id}.1.color`);
    expect(q.config.optMeta?.[1].style).toEqual({});
  });
});
