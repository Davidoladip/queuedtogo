"use server";

// Door check-in and removing a guest. Check-in is open to every team member; removing is for
// owners and admins. Row level security enforces both again in the database.
import { revalidatePath } from "next/cache";
import { canManage, requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/board";

export type GuestResult = { ok: true } | { ok: false; error: string };

export async function setCheckedIn(orgSlug: string, rsvpId: string, on: unknown): Promise<GuestResult> {
  const { org } = await requireWorkspace(orgSlug);
  if (!isUuid(rsvpId) || typeof on !== "boolean") return { ok: false, error: "That guest isn't on the list any more. Reload the page." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("rsvps").update({ checked_in_at: on ? new Date().toISOString() : null }).eq("org_id", org.id).eq("id", rsvpId).select("id");
  if (error) return { ok: false, error: "We couldn't save that. Try again." };
  if (!data.length) return { ok: false, error: "That guest isn't on the list any more. Reload the page." };
  revalidatePath(`/w/${org.slug}/guests`);
  return { ok: true };
}

export async function removeGuest(orgSlug: string, rsvpId: string): Promise<GuestResult> {
  const { org } = await requireWorkspace(orgSlug);
  if (!canManage(org.role)) return { ok: false, error: "Only owners and admins can remove guests." };
  if (!isUuid(rsvpId)) return { ok: false, error: "That guest isn't on the list any more. Reload the page." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("rsvps").delete().eq("org_id", org.id).eq("id", rsvpId).select("id");
  if (error) return { ok: false, error: "We couldn't remove the guest. Try again." };
  if (!data.length) return { ok: false, error: "That guest isn't on the list any more. Reload the page." };
  revalidatePath(`/w/${org.slug}/guests`);
  return { ok: true };
}
