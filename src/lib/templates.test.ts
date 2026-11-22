import { describe, expect, it } from "vitest";
import { TEMPLATES, TEMPLATE_GROUPS, blankTemplate, templateByKey } from "./templates";
import { contrast } from "./design/color";
import { normalizeDesign, normalizeSettings } from "./design/engine";
import { formIsPaid } from "./pricing";

describe("event templates", () => {
  it("has templates in every group, with unique keys", () => {
    for (const g of TEMPLATE_GROUPS) expect(TEMPLATES.some((t) => t.group === g.key), g.key).toBe(true);
    expect(new Set(TEMPLATES.map((t) => t.key)).size).toBe(TEMPLATES.length);
    expect(templateByKey("wedding")?.name).toBe("Wedding");
    expect(templateByKey("nope")).toBeNull();
  });

  for (const t of TEMPLATES) {
    it(`${t.name}: a complete, valid form that matches its group`, () => {
      const f = t.build();
      expect(f.fields.at(-1)?.type).toBe("submit");
      expect(new Set(f.fields.map((x) => x.id)).size).toBe(f.fields.length);
      // Survives the same normalising as saved forms (nothing is silently dropped or reset).
      expect(normalizeDesign(JSON.parse(JSON.stringify(f.design))).theme).toEqual(f.design.theme);
      expect(normalizeSettings(JSON.parse(JSON.stringify(f.settings))).mode).toBe(f.settings.mode);
      expect(f.settings.mode === "rsvp").toBe(t.group === "rsvp");
      if (t.group === "rsvp") expect(f.fields.some((x) => x.type === "rsvp")).toBe(true);
      expect(formIsPaid(f)).toBe(t.group === "tickets");
      // Two builds never share question ids (each new form gets its own).
      expect(t.build().fields[0].id).not.toBe(f.fields[0].id);
    });

    it(`${t.name}: readable colours (text on card, button text on accent)`, () => {
      const th = t.build().design.theme;
      expect(contrast(th.text, th.card), "text on card").toBeGreaterThanOrEqual(4.5);
      expect(contrast(th.accentText || "#FFFFFF", th.accent), "button text").toBeGreaterThanOrEqual(3);
    });
  }

  it("the blank start keeps the original starter questions", () => {
    const f = blankTemplate("My event");
    expect(f.title).toBe("My event");
    expect(f.fields.map((x) => x.type)).toEqual(["short", "phone", "choice", "long", "submit"]);
  });
});
