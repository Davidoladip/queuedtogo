// Orders as a CSV download. Owners and admins only, because the file holds customers' contact details.
import { canManage, getMyWorkspaces, getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/board";
import { ordersCsv } from "@/lib/eventday";
import { loadDayJobs } from "@/lib/eventday-data";

export async function GET(req: Request, { params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const user = await getUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  const org = (await getMyWorkspaces()).find((w) => w.slug === orgSlug);
  if (!org) return new Response("Not found", { status: 404 });
  if (!canManage(org.role)) return new Response("Only owners and admins can download orders.", { status: 403 });
  const form = new URL(req.url).searchParams.get("form");
  const supabase = await createClient();
  const { stages, jobs } = await loadDayJobs(supabase, org.id, { formId: isUuid(form) ? form : null, limit: 10000 });
  const names = new Map(stages.map((s) => [s.id, s.name]));
  const date = new Date().toISOString().slice(0, 10);
  return new Response(ordersCsv(jobs, (id) => names.get(id) ?? "", org.timezone), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${org.slug}-orders-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
