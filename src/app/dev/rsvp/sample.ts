import { blankField, normalizeSettings, type FormModel } from "@/lib/design/engine";
import { sampleForm } from "../sample";
import type { Guest } from "@/lib/guests";

/** Fixed RSVP form for the development harness and browser tests. */
export function sampleRsvpForm(): FormModel {
  const base = sampleForm();
  const name = blankField("short"); name.id = "a0000000-0000-4000-8000-000000000001"; name.label = "Your name"; name.required = true;
  const email = blankField("email"); email.id = "a0000000-0000-4000-8000-000000000002"; email.required = true;
  const rsvp = blankField("rsvp"); rsvp.id = "a0000000-0000-4000-8000-000000000003";
  const diet = blankField("long"); diet.id = "a0000000-0000-4000-8000-000000000004"; diet.label = "Dietary needs";
  const submit = blankField("submit"); submit.id = "a0000000-0000-4000-8000-000000000005";
  return {
    ...base,
    title: "Harbourfront Launch Party",
    slug: "launch-party",
    intro: "Join us for food, music and the new collection.",
    thanks: "",
    submitLabel: "Send my RSVP",
    settings: normalizeSettings({ mode: "rsvp", rsvp: { capacity: 10, waitlist: true, start: "18:00", end: "21:30", reminder: true } }),
    fields: [name, email, rsvp, diet, submit],
  };
}

export const sampleGuests = (): Guest[] => [
  { id: "b0000000-0000-4000-8000-000000000001", name: "Ava Stone", email: "ava@example.com", phone: "+15555550101", status: "yes", party: 3, waitlisted: false, checkedInAt: null, respondedAt: "2026-10-20T15:00:00Z", texts: true, answers: { d: { label: "Dietary needs", type: "long", value: "One vegan" } } },
  { id: "b0000000-0000-4000-8000-000000000002", name: "Ben Ortiz", email: "ben@example.com", phone: null, status: "yes", party: 1, waitlisted: false, checkedInAt: "2026-11-07T23:05:00Z", respondedAt: "2026-10-21T15:00:00Z", answers: {} },
  { id: "b0000000-0000-4000-8000-000000000003", name: "Cy Park", email: "cy@example.com", phone: "+15555550142", status: "maybe", party: 2, waitlisted: false, checkedInAt: null, respondedAt: "2026-10-22T15:00:00Z", answers: {} },
  { id: "b0000000-0000-4000-8000-000000000004", name: "Dee Lane", email: "dee@example.com", phone: null, status: "no", party: 0, waitlisted: false, checkedInAt: null, respondedAt: "2026-10-23T15:00:00Z", answers: {} },
  { id: "b0000000-0000-4000-8000-000000000005", name: "Eve Moss", email: "eve@example.com", phone: null, status: "yes", party: 2, waitlisted: true, checkedInAt: null, respondedAt: "2026-10-24T15:00:00Z", answers: {} },
];
