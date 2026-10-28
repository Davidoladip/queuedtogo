import "server-only";
// Loads one guest's RSVP by their private link. Server only (service role): the token is the guest's
// only credential, so it is checked for shape here and matched exactly in the database.
import { adminClient } from "@/lib/supabase/admin";
import { formFromPublished } from "@/lib/design/fromDb";
import type { FormModel } from "@/lib/design/engine";
import { eventTimes, type CalEvent, type RsvpStatus } from "@/lib/rsvp";

export const RSVP_TOKEN = /^[0-9a-f]{64}$/;

export type GuestRsvp = {
  id: string; token: string; name: string | null; email: string | null; status: RsvpStatus; party: number; waitlisted: boolean;
  form: FormModel; formStatus: string; org: { id: string; name: string; timezone: string; replyTo: string | null };
};

export async function loadRsvpByToken(token: string): Promise<GuestRsvp | null> {
  if (!RSVP_TOKEN.test(token)) return null;
  const admin = adminClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("rsvps")
    .select("id, token, name, email, status, party_size, waitlisted, forms(id, slug, status, published_config), organizations(id, name, timezone, reply_to_email)")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error("We couldn't load this RSVP.");
  const r = data as unknown as {
    id: string; token: string; name: string | null; email: string | null; status: RsvpStatus; party_size: number; waitlisted: boolean;
    forms: { id: string; slug: string; status: string; published_config: Record<string, unknown> | null } | null;
    organizations: { id: string; name: string; timezone: string; reply_to_email: string | null } | null;
  } | null;
  if (!r || !r.forms?.published_config || !r.organizations) return null;
  return {
    id: r.id, token: r.token, name: r.name, email: r.email, status: r.status, party: r.party_size, waitlisted: r.waitlisted,
    form: formFromPublished(r.forms.id, r.forms.slug, r.forms.published_config), formStatus: r.forms.status,
    org: { id: r.organizations.id, name: r.organizations.name, timezone: r.organizations.timezone, replyTo: r.organizations.reply_to_email },
  };
}

/** The guest's event for "add to calendar", or null when the form has no event date. */
export function calendarFor(g: GuestRsvp, manageUrl: string): CalEvent | null {
  const times = eventTimes(g.form.eventDate, g.form.settings.rsvp, g.org.timezone);
  if (!times) return null;
  return {
    uid: g.id, title: g.form.title, location: g.form.venue, url: manageUrl, times,
    description: `Hosted by ${g.org.name}.${g.party > 1 ? ` Your party: ${g.party} people.` : ""} Change your RSVP: ${manageUrl}`,
  };
}
