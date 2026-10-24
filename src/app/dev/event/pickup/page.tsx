import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PickupScreen } from "@/components/event/PickupScreen";
import { completeStage } from "@/lib/board";
import { itemsLine } from "@/lib/eventday";
import { harnessEnabled } from "../../sample";
import { store } from "../../board/store";
import { devMoveJob } from "../../board/actions";
import { dayJobs } from "../data";

/** Development harness: the pickup screen. 404 unless QTG_DEV_HARNESS=1. */
export default async function DevPickup() {
  await connection();
  if (!harnessEnabled()) notFound();
  const stages = structuredClone(store().stages);
  return (
    <main className="page wrap">
      <PickupScreen jobs={dayJobs().map((j) => ({ id: j.id, number: j.number, customerName: j.customerName, phone: j.phone ? j.phone.slice(-4) : null, stageId: j.stageId, items: itemsLine(j, 140) }))}
        stages={stages} completeStageId={completeStage(stages)?.id ?? null} move={devMoveJob} jobHref="/dev/board/" />
    </main>
  );
}
