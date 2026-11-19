import { connection } from "next/server";
import { notFound } from "next/navigation";
import { harnessEnabled } from "../sample";
import { DemoPayments } from "./DemoPayments";
import "@/components/billing/billing.css";
import "@/components/payments/payments.css";

/**
 * Development harness: the Get paid page with sample data. 404 unless QTG_DEV_HARNESS=1.
 * ?state=none|pending|restricted|active|square|disconnected  &role=owner|admin|member  &allowed=1  &nosquare=1  &comped=1
 */
export default async function DevPaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection();
  if (!harnessEnabled()) notFound();
  const sp = await searchParams;
  return (
    <main className="page wrap">
      <DemoPayments state={sp.state ?? "none"} role={(["owner", "admin", "member"] as const).find((r) => r === sp.role) ?? "owner"}
        allowed={sp.allowed === "1"} nosquare={sp.nosquare === "1"} comped={sp.comped === "1"} />
    </main>
  );
}
