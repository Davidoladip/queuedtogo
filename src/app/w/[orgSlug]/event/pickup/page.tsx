import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { completeStage, isUuid } from "@/lib/board";
import { itemsLine } from "@/lib/eventday";
import { loadDayJobs } from "@/lib/eventday-data";
import { moveJob } from "@/server/actions/jobs";
import { PickupScreen } from "@/components/event/PickupScreen";

export const metadata: Metadata = { title: "Pickup" };

export default async function PickupPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { org } = await requireWorkspace(orgSlug);
  const supabase = await createClient();
  const { stages, jobs } = await loadDayJobs(supabase, org.id, { formId: isUuid(sp.form) ? sp.form : null, doneSinceDays: 7 });
  return (
    <>
      <div className="view-head no-print">
        <div>
          <Link href={`/w/${org.slug}/event`} className="btn ghost small">← Event day</Link>
          <h1 style={{ marginTop: 8 }}>Pickup</h1>
          <p>Type the customer&apos;s order number, name or the last 4 digits of their phone.</p>
        </div>
      </div>
      <PickupScreen
        jobs={jobs.map((j) => ({ id: j.id, number: j.number, customerName: j.customerName, phone: j.phone ? j.phone.slice(-4) : null, stageId: j.stageId, items: itemsLine(j, 140) }))}
        stages={stages}
        completeStageId={completeStage(stages)?.id ?? null}
        move={moveJob.bind(null, org.slug)}
        jobHref={`/w/${org.slug}/board/`}
      />
    </>
  );
}
