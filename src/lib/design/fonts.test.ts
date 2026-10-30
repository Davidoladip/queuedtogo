import { describe, expect, it } from "vitest";
import { FONTS, FONT_STACKS, designCss, normalizeDesign, normalizeSettings, usedFontKeys, type FormModel } from "./engine";
import { FONT_CATALOG, googleFontsUrls } from "./fonts";

const form = (design: unknown): FormModel => ({
  id: "0f8fad5b-d9cb-469f-a165-70867728950e", title: "T", slug: "t", eventDate: null, venue: "", intro: "", thanks: "", submitLabel: "Go",
  settings: normalizeSettings({}), design: normalizeDesign(design), fields: [],
});

describe("fonts", () => {
  it("every font style uses fonts that exist", () => {
    for (const f of Object.values(FONTS)) { expect(FONT_CATALOG[f.head]).toBeTruthy(); expect(FONT_CATALOG[f.body]).toBeTruthy(); }
  });
  it("loads only the fonts a form uses, and nothing the app already loads", () => {
    expect(googleFontsUrls(usedFontKeys(form({})))).toEqual([]);
    const f = form({ theme: { font: "romantic" }, el: { __ctitle: { font: "pinyon" } }, shared: { label: { font: "montserrat" } } });
    expect([...usedFontKeys(f)].sort()).toEqual(["cormorant", "greatvibes", "montserrat", "pinyon"]);
    expect(googleFontsUrls(usedFontKeys(f))).toEqual([
      "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap",
      "https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap",
      "https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300..800;1,400&display=swap",
      "https://fonts.googleapis.com/css2?family=Pinyon+Script&display=swap",
    ]);
  });
  it("ignores unknown fonts safely", () => {
    const f = form({ el: { __ctitle: { font: "'); background:url(x" } } });
    expect(usedFontKeys(f).has("'); background:url(x")).toBe(false);
    expect(designCss(f, "")).toContain(FONT_STACKS.plex);
  });
  it("a new font style changes the heading font in the CSS", () => {
    expect(designCss(form({ theme: { font: "romantic" } }), "")).toContain("'Great Vibes'");
  });
});
