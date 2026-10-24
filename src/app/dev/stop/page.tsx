import { connection } from "next/server";
import { notFound } from "next/navigation";
import { StopUpdates } from "@/components/ui/StopUpdates";
import { harnessEnabled } from "../sample";
import { notifyStore } from "../notifications/store";
import { devStopUpdates } from "../notifications/actions";

/** Development harness: the tracking page's "Stop order updates" control. 404 unless QTG_DEV_HARNESS=1. */
export default async function DevStopPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection();
  if (!harnessEnabled()) notFound();
  const sp = await searchParams;
  return (
    <main className="auth-shell wrap"><div className="auth-card">
      {!notifyStore().stopped ? <StopUpdates business="Demo Business" prompt={sp.stop === "1"} stop={devStopUpdates} /> : <p>Order updates are already off for this order.</p>}
    </div></main>
  );
}
