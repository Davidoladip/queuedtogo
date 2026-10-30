import "server-only";
// Loads RSVP forms and their guest lists for a business, through the signed-in user's session
// (row level security limits every read to businesses they belong to).
import type { createClient } from "@/lib/supabase/server";
import type { Answer } from "@/lib/submission";
import type { Guest } from "@/lib/guests";
import type { RsvpStatus } from "@/lib/rsvp";

type Supa = Awaited<ReturnType<typeof createClient>>;
export type RsvpForm = { id: string; title: string; eventDate: string | null; status: string; capacity: number | null };

/** Forms that are (or have been published as) RSVP forms, newest event first. */
export async function loadRsvpForms(supabase: Supa, orgId: string): Promise<RsvpForm[]> {
  const { data } = await supabase.from("forms").select("id, title, event_date, status, settings, published_config").eq("org_id", orgId).order("event_date", { ascending: false, nullsFirst: false }).limit(200);
  const out: RsvpForm[] = [];
  for (const f of data ?? []) {
    const pub = (f.published_config as { settings?: { mode?: string; rsvp?: { capacity?: unknown } } } | null)?.settings;
    const draft = f.settings as { mode?: string } | null;
    if (pub?.mode !== "rsvp" && draft?.mode !== "rsvp") continue;
    const cap = Number(pub?.rsvp?.capacity);
    out.push({ id: f.id, title: f.title, eventDate: f.event_date, status: f.status, capacity: Number.isInteger(cap) && cap > 0 ? cap : null });
  }
  return out;
}

export async function loadGuests(supabase: Supa, orgId: string, formId: string): Promise<Guest[]> {
  const { data, error } = await supabase
    .from("rsvps")
    .select("id, name, email, phone, status, party_size, waitlisted, checked_in_at, responded_at, sms_consent, form_submissions(answers)")
    .eq("org_id", orgId).eq("form_id", formId).order("responded_at").limit(5000);
  if (error) throw new Error("We couldn't load the guest list.");
  return (data ?? []).map((r) => ({
    id: r.id, name: r.name, email: r.email, phone: r.phone, status: r.status as RsvpStatus, party: r.party_size, waitlisted: r.waitlisted,
    checkedInAt: r.checked_in_at, respondedAt: r.responded_at, texts: r.sms_consent,
    answers: ((r as unknown as { form_submissions: { answers: unknown } | null }).form_submissions?.answers ?? {}) as Record<string, Answer>,
  }));
}
