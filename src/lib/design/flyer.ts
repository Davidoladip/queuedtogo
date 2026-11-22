// The look of a form, boiled down to what a small "flyer" thumbnail needs: colours, texture, typeface, layout.
import { FONTS, FONT_STACKS, RADII, srcOf, texUrl, type Design, type FormSettings } from "./engine";
import { FONT_CATALOG } from "./fonts";
import { cc } from "./color";

export type FlyerSpec = {
  page: string; pageTex: string | null; pageTexSize: number;
  card: string; text: string; accent: string; accentText: string;
  radius: number; layout: "banner" | "background" | "side";
  titleFont: string; titleFontKey: string; titleColor: string; titleUpper: boolean;
  bodyFont: string; bodyFontKey: string;
  art: string | null;
  envelope: { color: string; liner: string } | null;
};

export function flyerSpec(design: Design, settings: FormSettings, assetBase: string): FlyerSpec {
  const t = design.theme;
  const preset = FONTS[t.font] || FONTS.clean;
  const titleStyle = design.el?.__title ?? {};
  const titleKey = typeof titleStyle.font === "string" && titleStyle.font in FONT_CATALOG ? titleStyle.font : preset.head;
  const pt = design.page;
  const env = settings.cover?.on && settings.cover.envelope?.on ? settings.cover.envelope : null;
  return {
    page: cc(t.page) || "#2B2F4A",
    pageTex: pt && pt.tex !== "none" ? texUrl(pt.tex, pt.texColor, pt.texOp, pt.texScale) : null,
    pageTexSize: Math.max(8, Math.round((pt?.texScale ?? 14) * 0.6)),
    card: cc(t.card) || "#FFFFFF",
    text: cc(t.text) || "#1A1D2E",
    accent: cc(t.accent) || "#3346D3",
    accentText: cc(t.accentText) || "#FFFFFF",
    radius: Math.min(RADII[t.radius] ?? 12, 14),
    layout: t.layout === "side" || t.layout === "background" ? t.layout : "banner",
    titleFont: FONT_STACKS[titleKey] || FONT_STACKS.plex,
    titleFontKey: titleKey,
    titleColor: cc(titleStyle.color) || cc(t.text) || "#1A1D2E",
    titleUpper: !!preset.upper || titleStyle.transform === "uppercase",
    bodyFont: FONT_STACKS[preset.body] || FONT_STACKS.plex,
    bodyFontKey: preset.body,
    art: srcOf(design.art, assetBase),
    envelope: env ? { color: cc(env.color) || "#F1E8D4", liner: cc(env.liner) || cc(t.accent) || "#B8913A" } : null,
  };
}
