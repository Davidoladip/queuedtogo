import { connection } from "next/server";
import { notFound } from "next/navigation";
import { harnessEnabled } from "../sample";
import { DemoBilling } from "./DemoBilling";
import "@/components/billing/billing.css";

/**
 * Development harness: the Billing page with sample data. 404 unless QTG_DEV_HARNESS=1.
 * ?state=free|trial|active|pastdue|cancelling|comped  &member=1  &off=1 (payments not connected)  &checkout=plan|pass|cancelled
 */
export default async function DevBillingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection();
  if (!harnessEnabled()) notFound();
  const sp = await searchParams;
  return (
    <main className="page wrap">
      <DemoBilling state={sp.state ?? "free"} member={sp.member === "1"} off={sp.off === "1"} norsvp={sp.norsvp === "1"}
        checkout={(["plan", "pass", "pending", "cancelled"] as const).find((c) => c === sp.checkout) ?? null} />
    </main>
  );
}
