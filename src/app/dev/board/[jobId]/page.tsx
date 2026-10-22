import { connection } from "next/server";
import { notFound } from "next/navigation";
import { JobPanel } from "@/components/board/JobPanel";
import { todayIn } from "@/lib/board";
import { harnessEnabled } from "../../sample";
import { jobEvents, store } from "../store";
import { notifyStore } from "../../notifications/store";
import { devAddNote, devMoveJob, devUpdateJob } from "../actions";

/** Development harness: one job. 404 unless QTG_DEV_HARNESS=1. */
export default async function DevJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  await connection();
  if (!harnessEnabled()) notFound();
  const { jobId } = await params;
  const s = store();
  const found = s.jobs.find((j) => j.id === jobId);
  if (!found) notFound();
  const { customer, ...job } = structuredClone(found);
  const events = jobEvents(jobId);
  return (
    <main className="page wrap">
      <JobPanel job={job} stages={structuredClone(s.stages)} members={s.members} events={structuredClone(events)} customer={customer}
        trackingUrl={"http://localhost:3000/t/" + "a".repeat(64)} submissionHref={null} boardHref="/dev/board"
        today={todayIn("America/New_York")} timeZone="America/New_York" move={devMoveJob} update={devUpdateJob} addNote={devAddNote}
        messages={notifyStore().log.filter((m) => m.jobId === jobId).map((m) => ({ ...m, to: null }))} notificationsHref="/dev/notifications" />
    </main>
  );
}
