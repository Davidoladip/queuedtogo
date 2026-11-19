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

/** A ticketed event form with a priced add-on, for the payments browser tests. */
export function samplePaidForm(): FormModel {
  const name = blankField("short"); name.id = "a1f0c3d2-1111-4a1a-8a1a-000000000001"; name.label = "Your name"; name.required = true;
  const email = blankField("email"); email.id = "a1f0c3d2-1111-4a1a-8a1a-000000000002"; email.required = true;
  const tickets = blankField("tickets"); tickets.id = "a1f0c3d2-1111-4a1a-8a1a-000000000003";
  tickets.options = ["General admission", "VIP", "Early bird"];
  tickets.config.tickets = [
    { id: "tt_general01", price: 2500, qty: 200, max: null, ends: null },
    { id: "tt_vip000001", price: 6000, qty: 20, max: 4, ends: null },
    { id: "tt_early0001", price: 2000, qty: null, max: null, ends: "2020-01-01T00:00:00.000Z" },
  ];
  const shirt = blankField("choice"); shirt.id = "a1f0c3d2-1111-4a1a-8a1a-000000000004"; shirt.label = "Add an event tee?"; shirt.options = ["No thanks", "Event tee"]; shirt.config.prices = [0, 1800];
  return {
    ...sampleForm(),
    id: "5d1f8c2e-6c43-4a8e-9b1e-2a7f1c0d9e11",
    title: "Harbourfront Gala",
    slug: "harbourfront-gala",
    submitLabel: "Continue to payment",
    fields: [name, email, tickets, shirt, blankField("submit")],
  };
}

export const harnessEnabled = () => process.env.QTG_DEV_HARNESS === "1" && process.env.VERCEL !== "1";
