import { connection } from "next/server";
import { notFound } from "next/navigation";
import { SummaryView } from "@/components/event/SummaryView";
import { todayIn } from "@/lib/board";
import { harnessEnabled } from "../../sample";
import { store } from "../../board/store";
import { dayJobs } from "../data";

/** Development harness: the daily summary. 404 unless QTG_DEV_HARNESS=1. */
export default async function DevSummary() {
  await connection();
  if (!harnessEnabled()) notFound();
  return <main className="page wrap"><SummaryView jobs={dayJobs()} stages={structuredClone(store().stages)} today={todayIn("America/New_York")} title="Demo Business · Today" /></main>;
}
