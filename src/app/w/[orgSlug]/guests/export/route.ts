// The guest list as a CSV download. Owners and admins only, because the file holds guests' contact details.
import { canManage, getMyWorkspaces, getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/board";
import { guestsCsv } from "@/lib/guests";
import { loadGuests, loadRsvpForms } from "@/lib/guests-data";

export async function GET(req: Request, { params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const user = await getUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  const org = (await getMyWorkspaces()).find((w) => w.slug === orgSlug);
  if (!org) return new Response("Not found", { status: 404 });
  if (!canManage(org.role)) return new Response("Only owners and admins can download the guest list.", { status: 403 });
  const formId = new URL(req.url).searchParams.get("form");
  if (!isUuid(formId)) return new Response("Choose an event first.", { status: 400 });
  const supabase = await createClient();
  const form = (await loadRsvpForms(supabase, org.id)).find((f) => f.id === formId);
  if (!form) return new Response("Not found", { status: 404 });
  const guests = await loadGuests(supabase, org.id, form.id);
  const name = form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "event";
  return new Response(guestsCsv(guests, org.timezone), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-guests-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
