import { connection } from "next/server";
import { notFound } from "next/navigation";
import { harnessEnabled } from "../../sample";
import { sampleRsvpForm } from "../sample";
import { DemoManage } from "./DemoManage";

/** Development harness: a guest's change-RSVP page. ?closed=1 after the deadline; ?locked=1 when changes are off. */
export default async function DevManagePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection();
  if (!harnessEnabled()) notFound();
  const sp = await searchParams;
  return <div className="pf-page"><DemoManage form={sampleRsvpForm()} closed={sp.closed === "1"} canChange={sp.locked !== "1"} /></div>;
}
