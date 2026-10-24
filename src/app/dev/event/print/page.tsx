import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PrintSheet } from "@/components/event/PrintSheet";
import { qrSvg } from "@/lib/qr";
import { harnessEnabled } from "../../sample";
import { store } from "../../board/store";
import { dayJobs } from "../data";

/** Development harness: printable tickets (?kind=tickets) and labels (?kind=labels). 404 unless QTG_DEV_HARNESS=1. */
export default async function DevPrint({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection();
  if (!harnessEnabled()) notFound();
  const sp = await searchParams;
  const kind = sp.kind === "labels" ? "labels" : "tickets";
  const jobs = dayJobs().filter((j) => !j.completedAt);
  const qr = new Map<string, string>();
  if (kind === "tickets") for (const j of jobs) qr.set(j.id, await qrSvg(`http://localhost:3000/dev/board/${j.id}`));
  const names = new Map(store().stages.map((s) => [s.id, s.name]));
  return <main className="page wrap"><PrintSheet kind={kind} jobs={jobs} stageName={(id) => names.get(id) ?? ""} business="Demo Business" qr={qr} /></main>;
}
