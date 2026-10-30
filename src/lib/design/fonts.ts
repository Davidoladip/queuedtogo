// Fonts for forms. Each has a CSS stack and (for Google Fonts) the family spec used to load it.
// Forms load only the fonts they use (see googleFontsUrl); the app's own fonts load in the root layout.

export type FontGroup = "Sans serif" | "Serif" | "Display" | "Script and handwritten" | "System";
export type FontDef = { label: string; stack: string; group: FontGroup; google?: string; /** Already loaded by the root layout. */ base?: boolean };

const sans = "system-ui,sans-serif", serif = "Georgia,serif", script = "cursive";

export const FONT_CATALOG: Record<string, FontDef> = {
  // Sans serif
  plex: { label: "IBM Plex Sans", stack: "'IBM Plex Sans',system-ui,sans-serif", group: "Sans serif", base: true },
  bricolage: { label: "Bricolage Grotesque", stack: "'Bricolage Grotesque',system-ui,sans-serif", group: "Sans serif", base: true },
  baloo: { label: "Baloo 2", stack: "'Baloo 2',system-ui,sans-serif", group: "Sans serif", base: true },
  montserrat: { label: "Montserrat", stack: `'Montserrat',${sans}`, group: "Sans serif", google: "Montserrat:ital,wght@0,300..800;1,400" },
  poppins: { label: "Poppins", stack: `'Poppins',${sans}`, group: "Sans serif", google: "Poppins:wght@300;400;500;600;700;800" },
  raleway: { label: "Raleway", stack: `'Raleway',${sans}`, group: "Sans serif", google: "Raleway:wght@300..800" },
  josefin: { label: "Josefin Sans", stack: `'Josefin Sans',${sans}`, group: "Sans serif", google: "Josefin Sans:wght@300..700" },
  quicksand: { label: "Quicksand", stack: `'Quicksand',${sans}`, group: "Sans serif", google: "Quicksand:wght@400..700" },
  fredoka: { label: "Fredoka", stack: `'Fredoka',${sans}`, group: "Sans serif", google: "Fredoka:wght@400..700" },
  // Serif
  playfair: { label: "Playfair Display", stack: "'Playfair Display',Georgia,serif", group: "Serif", base: true },
  cormorant: { label: "Cormorant Garamond", stack: `'Cormorant Garamond',${serif}`, group: "Serif", google: "Cormorant Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500" },
  cinzel: { label: "Cinzel (capitals)", stack: `'Cinzel',${serif}`, group: "Serif", google: "Cinzel:wght@400..800" },
  baskerville: { label: "Libre Baskerville", stack: `'Libre Baskerville',${serif}`, group: "Serif", google: "Libre Baskerville:ital,wght@0,400;0,700;1,400" },
  dmserif: { label: "DM Serif Display", stack: `'DM Serif Display',${serif}`, group: "Serif", google: "DM Serif Display:ital@0;1" },
  lora: { label: "Lora", stack: `'Lora',${serif}`, group: "Serif", google: "Lora:ital,wght@0,400..700;1,400..700" },
  // Display
  oswald: { label: "Oswald", stack: "'Oswald','Arial Narrow',sans-serif", group: "Display", base: true },
  abril: { label: "Abril Fatface", stack: `'Abril Fatface',${serif}`, group: "Display", google: "Abril Fatface" },
  bebas: { label: "Bebas Neue (capitals)", stack: `'Bebas Neue','Arial Narrow',sans-serif`, group: "Display", google: "Bebas Neue" },
  righteous: { label: "Righteous", stack: `'Righteous',${sans}`, group: "Display", google: "Righteous" },
  lobster: { label: "Lobster", stack: `'Lobster',${script}`, group: "Display", google: "Lobster" },
  // Script and handwritten (best for headings)
  greatvibes: { label: "Great Vibes", stack: `'Great Vibes',${script}`, group: "Script and handwritten", google: "Great Vibes" },
  parisienne: { label: "Parisienne", stack: `'Parisienne',${script}`, group: "Script and handwritten", google: "Parisienne" },
  allura: { label: "Allura", stack: `'Allura',${script}`, group: "Script and handwritten", google: "Allura" },
  pinyon: { label: "Pinyon Script", stack: `'Pinyon Script',${script}`, group: "Script and handwritten", google: "Pinyon Script" },
  sacramento: { label: "Sacramento", stack: `'Sacramento',${script}`, group: "Script and handwritten", google: "Sacramento" },
  dancing: { label: "Dancing Script", stack: `'Dancing Script',${script}`, group: "Script and handwritten", google: "Dancing Script:wght@400..700" },
  pacifico: { label: "Pacifico", stack: `'Pacifico',${script}`, group: "Script and handwritten", google: "Pacifico" },
  caveat: { label: "Caveat", stack: `'Caveat',${script}`, group: "Script and handwritten", google: "Caveat:wght@400..700" },
  amatic: { label: "Amatic SC", stack: `'Amatic SC',${script}`, group: "Script and handwritten", google: "Amatic SC:wght@400;700" },
  // System
  system: { label: "System sans-serif", stack: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", group: "System" },
  serif: { label: "Georgia (serif)", stack: "Georgia,'Times New Roman',serif", group: "System" },
  mono: { label: "Monospace", stack: "'IBM Plex Mono',ui-monospace,Menlo,monospace", group: "System", base: true },
};

export const FONT_GROUPS: FontGroup[] = ["Sans serif", "Serif", "Display", "Script and handwritten", "System"];

const familyUrl = (spec: string) =>
  "https://fonts.googleapis.com/css2?family=" + spec.replace(/ /g, "+") + "&display=swap";

/**
 * Google Fonts stylesheets for the given font keys, one per family (so one font failing never stops
 * the others), skipping fonts the app already loads. Fonts show as they arrive (display=swap).
 */
export function googleFontsUrls(keys: Iterable<string>): string[] {
  return [...new Set([...keys].map((k) => FONT_CATALOG[k]).filter((f) => f?.google && !f.base).map((f) => f!.google!))].sort().map(familyUrl);
}
