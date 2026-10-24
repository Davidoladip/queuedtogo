import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/board";
import { loadDayJobs } from "@/lib/eventday-data";
import { siteUrl } from "@/lib/urls";
import { qrSvg } from "@/lib/qr";
import { PrintSheet } from "@/components/event/PrintSheet";
import { PrintButton } from "@/components/event/PrintButton";

export const metadata: Metadata = { title: "Print" };

/** ?kind=tickets|labels, optional ?form, ?stage, or ?ids=a,b (specific jobs, e.g. from a job page). */
export default async function PrintPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { org } = await requireWorkspace(orgSlug);
  const kind = sp.kind === "labels" ? "labels" : "tickets";
  const ids = (sp.ids ?? "").split(",").filter(isUuid).slice(0, 500);
  const supabase = await createClient();
  const { stages, jobs } = await loadDayJobs(supabase, org.id, ids.length
    ? { ids }
    : { formId: isUuid(sp.form) ? sp.form : null, stageId: isUuid(sp.stage) ? sp.stage : null, openOnly: !isUuid(sp.stage), limit: 500 });
  const site = await siteUrl();
  const qr = new Map<string, string>();
  if (kind === "tickets") await Promise.all(jobs.map(async (j) => qr.set(j.id, await qrSvg(`${site}/w/${org.slug}/board/${j.id}`))));
  const names = new Map(stages.map((s) => [s.id, s.name]));
  return (
    <>
      <div className="view-head no-print">
        <div>
          <Link href={`/w/${org.slug}/event`} className="btn ghost small">← Event day</Link>
          <h1 style={{ marginTop: 8 }}>{kind === "tickets" ? "Order tickets" : "Labels"} · {jobs.length}</h1>
          <p>{kind === "tickets" ? "Prints one ticket per 4×6 in page. On a regular printer, choose 4×6 paper or scale to fit." : "For Avery 5160 / 8160 sheets (US Letter). In the print dialog, set scale to 100% and margins to default."}</p>
        </div>
        <PrintButton />
      </div>
      <PrintSheet kind={kind} jobs={jobs} stageName={(id) => names.get(id) ?? ""} business={org.name} qr={qr} />
    </>
  );
}
