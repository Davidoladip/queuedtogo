// In-memory notification settings for the development harness. Never used on Vercel.
import type { LogEntry, StageMessage } from "@/lib/notify";

type Store = { textingOn: boolean; stages: StageMessage[]; log: LogEntry[] };
const id = (n: number) => `00000000-0000-4000-8f00-${String(n).padStart(12, "0")}`;

function seed(): Store {
  const at = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  return {
    textingOn: false,
    stages: [
      { id: id(1), name: "New order", color: "#7B8194", notify: true, template: "Hi {name}, we have your order {order}. Follow it here: {link} - {business}" },
      { id: id(2), name: "In production", color: "#3346D3", notify: true, template: "Good news {name}! Order {order} is being made now. - {business}" },
      { id: id(3), name: "Quality check", color: "#C9821B", notify: false, template: "Hi {name}, order {order} is going through quality checks. - {business}" },
      { id: id(4), name: "Ready for collection", color: "#1D8657", notify: true, template: "Hi {name}, order {order} is ready to collect. - {business}" },
    ],
    log: [
      { id: id(11), at: at(3), kind: "stage_update", status: "delivered", to: "+15551234567", body: "Hi Lena, we have your order QTG-1001. Follow it here: http://localhost:3000/t/aaa - Demo Business Reply STOP to opt out.", reason: null, jobId: "00000000-0000-4000-8c00-000000000001", orderNumber: 1001, customer: "Lena Ortiz", stage: "New order" },
      { id: id(12), at: at(9), kind: "stage_update", status: "skipped", to: null, body: null, reason: "The customer didn't agree to order updates.", jobId: "00000000-0000-4000-8c00-000000000004", orderNumber: 1004, customer: "Tom Hardy", stage: "Ready for collection" },
      { id: id(13), at: at(20), kind: "stage_update", status: "failed", to: "+15550000000", body: "Hi Sam, order QTG-1002 is being made now. - Demo Business Reply STOP to opt out.", reason: "The number doesn't exist.", jobId: "00000000-0000-4000-8c00-000000000002", orderNumber: 1002, customer: "Sam Lee", stage: "In production" },
    ],
  };
}
const g = globalThis as unknown as { __qtgNotify?: Store };
export const notifyStore = (): Store => (g.__qtgNotify ??= seed());
export const resetNotify = () => { g.__qtgNotify = seed(); };
