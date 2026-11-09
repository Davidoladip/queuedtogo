// The public demo forms behind "Try the demo" on the homepage. They run in the browser only:
// answers are checked with the same rules as real forms, but nothing is saved or sent.
import { blankField, normalizeDesign, normalizeSettings, type FormModel } from "@/lib/design/engine";
import { formFromPublished } from "@/lib/design/fromDb";
import { LOOKS } from "@/lib/design/looks";
import styleAndSip from "@/lib/samples/style-and-sip.json";
import liveEmbroidery from "@/lib/samples/live-embroidery.json";

export const DEMO_BUSINESS = "ThreadToGo";

/** Real ThreadToGo forms from past events (copies of what customers saw; images load from the form-assets bucket). */
export const SAMPLE_FORMS = {
  "style-and-sip": { config: styleAndSip, id: "d0000000-0000-4000-8000-00000000d011", caption: "Style and Sip: tote bags made on the spot" },
  embroidery: { config: liveEmbroidery, id: "d0000000-0000-4000-8000-00000000d012", caption: "Live embroidery at a baby celebration: personalised toiletry bags" },
} as const;
export type SampleKey = keyof typeof SAMPLE_FORMS;

export function sampleForm(key: SampleKey): FormModel {
  const s = SAMPLE_FORMS[key];
  return formFromPublished(s.id, key, structuredClone(s.config) as Record<string, unknown>);
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
