// Development harness: the board's in-memory jobs as event-day jobs, with sample answers.
import type { Answer } from "@/lib/submission";
import type { DayJob } from "@/lib/eventday";
import { store } from "../board/store";

const ANSWERS: Record<number, Record<string, Answer>> = {
  1001: { item: { label: "What would you like?", type: "choice", value: "Hoodie", optionColours: { Hoodie: "Red (#C62828)" } }, sizes: { label: "Sizes", type: "sizes", value: { M: 2 } } },
  1002: { item: { label: "What would you like?", type: "choice", value: "Cap" }, note: { label: "Anything else?", type: "long", value: "=SUM(A1) please" } },
  1003: { item: { label: "What would you like?", type: "choice", value: "Hoodie", optionColours: { Hoodie: "Red (#C62828)" } }, sizes: { label: "Sizes", type: "sizes", value: { M: 1, L: 1 } } },
  1004: { item: { label: "What would you like?", type: "choice", value: "T-shirt" } },
};

export function dayJobs(): DayJob[] {
  const s = store();
  const names = new Map(s.members.map((m) => [m.id, m.name]));
  return s.jobs.map((j) => ({
    id: j.id, number: j.number, title: j.title, summary: j.summary, stageId: j.stageId, dueDate: j.dueDate, priority: j.priority,
    customerName: j.customerName, phone: j.customer?.phone ?? null, email: j.customer?.email ?? null, consent: j.consent,
    formId: j.formId, formTitle: j.formTitle, assignee: j.assigneeId ? names.get(j.assigneeId) ?? null : null,
    createdAt: j.createdAt, completedAt: j.completedAt, answers: ANSWERS[j.number] ?? {},
  }));
}
