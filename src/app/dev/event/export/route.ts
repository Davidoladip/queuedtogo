// Development harness: the CSV export from in-memory jobs. 404 unless QTG_DEV_HARNESS=1.
import { notFound } from "next/navigation";
import { ordersCsv } from "@/lib/eventday";
import { harnessEnabled } from "../../sample";
import { store } from "../../board/store";
import { dayJobs } from "../data";

export async function GET() {
  if (!harnessEnabled()) notFound();
  const names = new Map(store().stages.map((s) => [s.id, s.name]));
  return new Response(ordersCsv(dayJobs(), (id) => names.get(id) ?? "", "America/New_York"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="demo-orders.csv"' },
  });
}
