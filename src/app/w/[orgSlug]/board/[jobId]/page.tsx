import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadJob } from "@/lib/board-data";
import { loadMessageLog } from "@/lib/notify-data";
import { isUuid, todayIn } from "@/lib/board";
import { siteUrl } from "@/lib/urls";
import { addNote, moveJob, updateJob } from "@/server/actions/jobs";
import { JobPanel } from "@/components/board/JobPanel";

export const metadata: Metadata = { title: "Job" };

export default async function JobPage({ params }: { params: Promise<{ orgSlug: string; jobId: string }> }) {
  const { orgSlug, jobId } = await params;
  const { org } = await requireWorkspace(orgSlug);
  if (!isUuid(jobId)) notFound();
  const supabase = await createClient();
  const data = await loadJob(supabase, org.id, jobId);
  if (!data) notFound();
  const [site, messages] = await Promise.all([siteUrl(), loadMessageLog(supabase, org.id, { jobId, limit: 30 })]);

  return (
    <JobPanel
      job={data.job}
      stages={data.stages}
      members={data.members}
      events={data.events}
      customer={data.customer}
      trackingUrl={`${site}/t/${data.trackingToken}`}
      submissionHref={data.submissionId ? `/w/${org.slug}/submissions/${data.submissionId}` : null}
      boardHref={`/w/${org.slug}/board`}
      today={todayIn(org.timezone)}
      timeZone={org.timezone}
      move={moveJob.bind(null, org.slug)}
      update={updateJob.bind(null, org.slug)}
      addNote={addNote.bind(null, org.slug)}
      messages={messages}
      notificationsHref={`/w/${org.slug}/notifications`}
    />
  );
}
