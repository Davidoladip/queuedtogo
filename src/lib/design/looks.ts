// Ready-made looks: one click sets the colours, fonts, cover finish and key element styles.
// Everything a look sets can still be changed afterwards (and undone in the builder).
import type { FormModel, Style } from "./engine";

const btn = (font: string, bg1: string, bg2: string, text: string, edge: string): Style => ({
  font, size: 14, weight: 600, transform: "uppercase", spacing: 0.14, color: text,
  pad: { t: 16, r: 36, b: 16, l: 36 }, minH: 52,
  bg: { type: "gradient", gtype: "linear", angle: 135, color: bg1, color2: bg2, opacity: 100 },
  border: { style: "solid", width: 1, color: edge },
  radius: { linked: true, all: 2, tl: 2, tr: 2, br: 2, bl: 2 },
  shadow: { on: true, x: 0, y: 6, blur: 18, color: "#8C6A1F40" },
  st: { hover: { bg: bg2, color: "", border: "" }, active: { bg: edge, color: "", border: "" }, focus: { ring: "#B8913A73", ringW: 3, border: "" } },
});

export const LOOKS = {
  luxury: {
    label: "Luxury invitation",
    description: "A sealed ivory envelope with a gold liner and seal; the invitation slides out on a black page. Ivory card, rich gold, elegant serif and script lettering, a double gold frame, subtle sparkle, and a card that parts to reveal the form.",
    apply(d: FormModel) {
      const gold = "#B8913A", goldLight = "#E6CC85", goldDeep = "#8C6A1F", ink = "#141210", ivory = "#FBF7EE";
      d.design.theme = { ...d.design.theme, page: ink, card: ivory, text: "#26211B", accent: gold, accentText: ink, radius: "slight", font: "luxury", layout: d.design.art ? d.design.theme.layout : "banner" };
      d.design.page = { ...d.design.page, tex: "dots", texColor: gold, texOp: 10, texScale: 26 };
      d.design.card = { ...d.design.card, tex: "none" };
      d.settings.cover = {
        ...d.settings.cover, effect: "unveil", sparkle: true, frame: "double", foil: true,
        envelope: { ...d.settings.cover.envelope, on: true, color: "#F1E8D4", liner: gold, seal: d.design.coverArt ? "emblem" : "initials" },
      };
      const el = d.design.el;
      el.__ctitle = { ...el.__ctitle, font: "pinyon", size: 58, weight: 400, transform: "none", spacing: 0, lh: 1.15, color: gold, align: "center", mar: { t: 6, b: 0 } };
      el.__ctext = { ...el.__ctext, font: "cormorant", size: 21, weight: 500, lh: 1.6, spacing: 0.02, color: "#3A332A", align: "center" };
      el.__cbtn = { ...el.__cbtn, ...btn("cinzel", goldLight, gold, ink, goldDeep), place: "center" };
      el.__title = { ...el.__title, font: "pinyon", size: 50, weight: 400, transform: "none", color: gold };
      el.__intro = { ...el.__intro, font: "cormorant", size: 19, color: "#3A332A" };
      d.design.shared.button = { ...d.design.shared.button, ...btn("cinzel", goldLight, gold, ink, goldDeep) };
      d.design.shared.label = { ...d.design.shared.label, font: "cormorant", size: 19, weight: 600, color: ink };
      d.design.shared.heading = { ...d.design.shared.heading, font: "cinzel", color: goldDeep };
      d.design.shared.input = {
        ...d.design.shared.input, font: "cormorant", size: 18, bg: { type: "solid", color: "#FFFDF8", opacity: 100 },
        border: { style: "solid", width: 1, color: "#D9C79A" }, radius: { linked: true, all: 2, tl: 2, tr: 2, br: 2, bl: 2 },
        st: { hover: { border: gold, bg: "" }, focus: { border: gold, ring: "#B8913A40", ringW: 3 }, error: { border: "#B3261E", color: "#B3261E" }, disabled: { bg: "", color: "", border: "", opacity: 100 } },
      };
      d.design.shared.choice = {
        ...d.design.shared.choice, font: "cormorant", size: 18, weight: 600,
        border: { style: "solid", width: 1, color: "#CDB57A" }, radius: { linked: true, all: 2, tl: 2, tr: 2, br: 2, bl: 2 },
        st: { hover: { border: gold, bg: "", color: "" }, selected: { bg: gold, color: ink, border: goldDeep }, focus: { ring: "#B8913A59", ringW: 3 } },
      };
      // The emblem (cover artwork) sits large and centred at the top, with room to breathe.
      if (d.design.coverArt) d.design.coverArt = { ...d.design.coverArt, pos: "above", align: "center", w: 62, wUnit: "%", maxW: 340, bw: 0, br: 0, bg: "", mar: { t: 0, r: 0, b: 22, l: 0 }, shadow: { ...d.design.coverArt.shadow, on: false } };
      else d.design.coverArt = null;
    },
  },
} as const;
export type LookKey = keyof typeof LOOKS;
