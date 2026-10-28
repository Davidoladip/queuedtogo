"use server";

// Guests change or cancel their RSVP from the private link in their confirmation. The token is the
// only credential; the database function checks the deadline, the guest limit and the waitlist.
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";
import { RSVP_KEYS, type RsvpStatus } from "@/lib/rsvp";
import { RSVP_TOKEN, loadRsvpByToken } from "@/lib/rsvp-data";
import { dispatchQueued } from "@/server/messaging";

export type RsvpChangeResult = { ok: true; status: RsvpStatus; party: number; waitlisted: boolean } | { ok: false; error: string };

export async function updateRsvp(token: string, status: unknown, party: unknown): Promise<RsvpChangeResult> {
  if (typeof token !== "string" || !RSVP_TOKEN.test(token)) return { ok: false, error: "We couldn't find this RSVP." };
  if (typeof status !== "string" || !RSVP_KEYS.includes(status as RsvpStatus)) return { ok: false, error: "Choose one of the answers." };
  const g = await loadRsvpByToken(token);
  if (!g) return { ok: false, error: "We couldn't find this RSVP." };
  const field = g.form.fields.find((f) => f.type === "rsvp");
  const i = RSVP_KEYS.indexOf(status as RsvpStatus);
  if (field && !field.options[i]?.trim()) return { ok: false, error: "Choose one of the answers." };
  const max = Math.max(1, Math.min(50, field?.config.partyMax ?? 1));
  let n = status === "no" ? 0 : 1;
  if (status !== "no" && max > 1) {
    n = Number(party);
    if (!Number.isInteger(n) || n < 1 || n > max) return { ok: false, error: `Enter how many people are coming (1 to ${max}).` };
  }
  const admin = adminClient();
  if (!admin) return { ok: false, error: "RSVP changes aren't available right now. Try again later." };
  const { data, error } = await admin.rpc("update_rsvp", { p_token: token, p_status: status, p_party: n });
  if (error) {
    const shown = ["QTG08", "QTG09", "QTG11", "QTG12"].includes(error.code ?? "");
    return { ok: false, error: shown ? error.message : "We couldn't save your change. Try again." };
  }
  // Someone may have come off the waitlist: send their email after replying.
  after(() => dispatchQueued({ orgId: g.org.id }));
  revalidatePath(`/r/${token}`);
  const r = data as { status: RsvpStatus; party: number; waitlisted: boolean };
  return { ok: true, status: r.status, party: r.party, waitlisted: r.waitlisted };
}
