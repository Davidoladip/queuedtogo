import { blankField, normalizeDesign, starterFields, type FormModel } from "@/lib/design/engine";

/** Fixed sample form for the development harness and browser tests. */
export function sampleForm(): FormModel {
  const fields = starterFields();
  const page = blankField("page");
  const email = blankField("email");
  email.required = true;
  const sizes = blankField("sizes");
  fields.splice(2, 0, page);
  fields.splice(fields.length - 1, 0, email, sizes);
  return {
    id: "0f8fad5b-d9cb-469f-a165-70867728950e",
    title: "Harbourfront Food Fest",
    slug: "harbourfront-food-fest",
    eventDate: "2026-11-07",
    venue: "Pier 3, Harbourfront",
    intro: "Order your custom tee and pick it up before you leave.",
    thanks: "Thanks!",
    submitLabel: "Place my order",
    settings: { notify: { channel: "sms", consent: true } },
    design: normalizeDesign({ theme: { page: "#0F4C4A", card: "#FFF4E2", text: "#1B2B2A", accent: "#E8633A", font: "bold" } }),
    fields,
  };
}

export const harnessEnabled = () => process.env.QTG_DEV_HARNESS === "1" && process.env.VERCEL !== "1";
