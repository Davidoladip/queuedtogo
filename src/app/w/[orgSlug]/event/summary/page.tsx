import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDay, isUuid, todayIn } from "@/lib/board";
import { loadDayJobs } from "@/lib/eventday-data";
import { SummaryView } from "@/components/event/SummaryView";
import { PrintButton } from "@/components/event/PrintButton";

export const metadata: Metadata = { title: "Daily summary" };

export default async function SummaryPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { org } = await requireWorkspace(orgSlug);
  const supabase = await createClient();
  const formId = isUuid(sp.form) ? sp.form : null;
  const { stages, jobs } = await loadDayJobs(supabase, org.id, { formId, doneSinceDays: 2 });
  const today = todayIn(org.timezone);
  const formTitle = formId ? jobs.find((j) => j.formId === formId)?.formTitle : null;
  return (
    <>
      <div className="view-head no-print">
        <div>
          <Link href={`/w/${org.slug}/event`} className="btn ghost small">← Event day</Link>
          <h1 style={{ marginTop: 8 }}>Daily summary</h1>
        </div>
        <PrintButton />
      </div>
      <SummaryView jobs={jobs} stages={stages} today={today} title={`${org.name}${formTitle ? ` · ${formTitle}` : ""} · ${formatDay(today, { weekday: "long", month: "long", day: "numeric" })}`} />
    </>
  );
}
