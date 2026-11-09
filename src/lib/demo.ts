// The public demo forms behind "Try the demo" on the homepage. They run in the browser only:
// answers are checked with the same rules as real forms, but nothing is saved or sent.
import { blankField, normalizeDesign, normalizeSettings, starterFields, type FormModel } from "@/lib/design/engine";
import { SWATCH_DEFAULT, emptyMeta } from "@/lib/design/media";
import { LOOKS } from "@/lib/design/looks";

export const DEMO_BUSINESS = "Harbourfront Tees";

/** An order form for a custom-tee stand at a weekend market. */
export function demoOrderForm(): FormModel {
  const fields = starterFields();
  const page = blankField("page");
  const sizes = blankField("sizes");
  fields.splice(2, 0, page);
  fields.splice(fields.length - 1, 0, sizes);
  const item = fields.find((f) => f.type === "choice");
  if (item) item.config.optMeta = [emptyMeta(), { ...emptyMeta(), swatches: { ...structuredClone(SWATCH_DEFAULT), required: true, labels: true } }];
  return {
    id: "d0000000-0000-4000-8000-00000000d001",
    title: "Harbourfront Night Market",
    slug: "night-market",
    eventDate: null,
    venue: "Pier 3",
    intro: "Order a custom tee, keep browsing, and we'll text you when it's ready to pick up.",
    thanks: "Thanks! We're on it. We'll text you when it's ready.",
    submitLabel: "Place my order",
    settings: normalizeSettings({}),
    design: normalizeDesign({ theme: { page: "#0F4C4A", card: "#FFF4E2", text: "#1B2B2A", accent: "#E8633A", font: "bold" } }),
    fields,
  };
}

/** A luxury RSVP invitation with the envelope opening. */
export function demoInvitationForm(): FormModel {
  const id = (n: number) => `d0000000-0000-4000-8000-00000000e00${n}`;
  const name = blankField("short"); name.id = id(1); name.label = "Your name"; name.required = true;
  const email = blankField("email"); email.id = id(2); email.required = true;
  const rsvp = blankField("rsvp"); rsvp.id = id(3);
  const diet = blankField("long"); diet.id = id(4); diet.label = "Dietary needs";
  const submit = blankField("submit"); submit.id = id(5);
  const form: FormModel = {
    id: "d0000000-0000-4000-8000-00000000d002",
    title: "An Evening in Gold",
    slug: "evening-in-gold",
    eventDate: null,
    venue: "The Grand Hall",
    intro: "Dinner, music and dancing. Kindly reply so we can save you a seat.",
    thanks: "",
    submitLabel: "Send my RSVP",
    settings: normalizeSettings({ mode: "rsvp", rsvp: { start: "19:00", end: "23:00" } }),
    design: normalizeDesign({}),
    fields: [name, email, rsvp, diet, submit],
  };
  form.settings.cover = { ...form.settings.cover, on: true, text: "Join us for {form_title}.\nDinner, music and dancing at The Grand Hall." };
  LOOKS.luxury.apply(form);
  return form;
}
