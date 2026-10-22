import { blankField, normalizeDesign, normalizeSettings, starterFields, type FormModel } from "@/lib/design/engine";
import { SWATCH_DEFAULT, emptyMeta } from "@/lib/design/media";

/** Fixed sample form for the development harness and browser tests. */
export function sampleForm(): FormModel {
  const fields = starterFields();
  const page = blankField("page");
  const email = blankField("email");
  email.required = true;
  const sizes = blankField("sizes");
  fields.splice(2, 0, page);
  fields.splice(fields.length - 1, 0, email, sizes);
  // "What would you like?": the Hoodie option has its own colour swatches (required when Hoodie is picked).
  const item = fields.find((f) => f.type === "choice");
  if (item) item.config.optMeta = [emptyMeta(), { ...emptyMeta(), swatches: { ...structuredClone(SWATCH_DEFAULT), required: true, labels: true } }];
  return {
    id: "0f8fad5b-d9cb-469f-a165-70867728950e",
    title: "Harbourfront Food Fest",
    slug: "harbourfront-food-fest",
    eventDate: "2026-11-07",
    venue: "Pier 3, Harbourfront",
    intro: "Order your custom tee and pick it up before you leave.",
    thanks: "Thanks!",
    submitLabel: "Place my order",
    settings: normalizeSettings({}),
    design: normalizeDesign({ theme: { page: "#0F4C4A", card: "#FFF4E2", text: "#1B2B2A", accent: "#E8633A", font: "bold" } }),
    fields,
  };
}

export const harnessEnabled = () => process.env.QTG_DEV_HARNESS === "1" && process.env.VERCEL !== "1";
