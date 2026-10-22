import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Board } from "@/components/board/Board";
import { todayIn } from "@/lib/board";
import { harnessEnabled } from "../sample";
import { DEV_ME, boardJobs, store } from "./store";
import { devMoveJob } from "./actions";

/** Development harness: the production board with in-memory jobs. 404 unless QTG_DEV_HARNESS=1. */
export default async function DevBoardPage() {
  await connection();
  if (!harnessEnabled()) notFound();
  const s = store();
  return (
    <main className="page wrap">
      <div className="view-head"><div><h1>Production board</h1><p>Development harness.</p></div></div>
      <Board stages={structuredClone(s.stages)} jobs={structuredClone(boardJobs())} members={s.members}
        forms={[{ id: "00000000-0000-4000-8d00-000000000001", title: "Food Fest" }]} me={DEV_ME} today={todayIn("America/New_York")}
        jobHref="/dev/board/" stagesHref="/dev/board/stages" move={devMoveJob} refreshEvery={5} />
    </main>
  );
}
