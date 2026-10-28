import { connection } from "next/server";
import { notFound } from "next/navigation";
import { harnessEnabled } from "../sample";
import { sampleGuests } from "../rsvp/sample";
import { formatAnswer } from "@/lib/submission";
import { DemoGuests } from "./DemoGuests";

/** Development harness: the guest list. ?door=1 opens door check-in. 404 unless QTG_DEV_HARNESS=1. */
export default async function DevGuestsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection();
  if (!harnessEnabled()) notFound();
  const sp = await searchParams;
  const rows = sampleGuests().map(({ answers, ...g }) => ({ ...g, notes: Object.values(answers).map((a) => `${a.label}: ${formatAnswer(a)}`).join(" · ") }));
  return <main className="page wrap"><DemoGuests guests={rows} door={sp.door === "1"} /></main>;
}
