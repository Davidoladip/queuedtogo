// Event-day tools: item counts for the production summary, CSV export and pickup search.
// Plain functions so the server pages, the harness and the unit tests share them.
import { formatAnswer, type Answer } from "@/lib/submission";

export type DayJob = {
  id: string;
  number: number;
  title: string;
  summary: string | null;
  stageId: string;
  dueDate: string | null;
  priority: number;
  customerName: string | null;
  phone: string | null;
  email: string | null;
  consent: boolean;
  formId: string | null;
  formTitle: string | null;
  assignee: string | null;
  createdAt: string;
  completedAt: string | null;
  answers: Record<string, Answer>;
};

const COUNTED = new Set(["choice", "dropdown", "multi", "sizes"]);

export type Tally = { question: string; items: { item: string; count: number }[]; total: number };

/** How many of each option were ordered, per question (choices, multi-choice and sizes). */
export function tallyItems(jobs: Pick<DayJob, "answers">[]): Tally[] {
  const byQ = new Map<string, Map<string, number>>();
  const add = (q: string, item: string, n: number) => {
    if (!item || !(n > 0)) return;
    const m = byQ.get(q) ?? new Map<string, number>();
    m.set(item, (m.get(item) ?? 0) + n);
    byQ.set(q, m);
  };
  for (const j of jobs) {
    for (const a of Object.values(j.answers ?? {})) {
      if (!a || !COUNTED.has(a.type)) continue;
      const q = a.label || "Question";
      const v = a.value;
      const colour = (opt: string) => a.optionColours?.[opt] ? `${opt} · ${a.optionColours[opt].replace(/\s*\(#[0-9a-f]{3,8}\)$/i, "")}` : opt;
      if (typeof v === "string") add(q, colour(v), 1);
      else if (Array.isArray(v)) v.forEach((x) => add(q, colour(String(x)), 1));
      else if (v && typeof v === "object" && !("file" in v)) for (const [k, n] of Object.entries(v)) add(q, k, Number(n));
    }
  }
  return [...byQ.entries()].map(([question, m]) => {
    const items = [...m.entries()].map(([item, count]) => ({ item, count })).sort((a, b) => b.count - a.count || a.item.localeCompare(b.item));
    return { question, items, total: items.reduce((s, x) => s + x.count, 0) };
  });
}

/** One CSV cell. Quotes when needed, and stops spreadsheet formulas ("=", "+", "-", "@") from running. */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(header: string[], rows: unknown[][]): string {
  // The BOM makes Excel open UTF-8 (names with accents, emoji) correctly.
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** US numbers as (555) 123-4567, so spreadsheets don't treat them as formulas or numbers. */
export const prettyPhone = (p: string | null) => {
  if (!p) return "";
  const m = p.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : p;
};

/** Orders as CSV: fixed columns, then one column per question (in first-seen order). */
export function ordersCsv(jobs: DayJob[], stageName: (id: string) => string, timeZone: string): string {
  const questions: string[] = [];
  for (const j of jobs) for (const a of Object.values(j.answers ?? {})) if (a?.label && !questions.includes(a.label)) questions.push(a.label);
  const header = ["Order", "Placed", "Form", "Stage", "Customer", "Mobile", "Email", "Agreed to updates", "Due", "Priority", "Assigned to", "Summary", ...questions];
  const when = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const rows = jobs.map((j) => {
    const byLabel = new Map(Object.values(j.answers ?? {}).map((a) => [a.label, a]));
    return [
      `QTG-${j.number}`, when(j.createdAt), j.formTitle ?? "", stageName(j.stageId), j.customerName ?? "", prettyPhone(j.phone), j.email ?? "",
      j.consent ? "Yes" : "No", j.dueDate ?? "", j.priority >= 2 ? "Urgent" : j.priority === 1 ? "High" : "Normal", j.assignee ?? "", j.summary ?? "",
      ...questions.map((q) => { const a = byLabel.get(q); return a ? formatAnswer(a) : ""; }),
    ];
  });
  return toCsv(header, rows);
}

/** Pickup search: an order number (with or without QTG-), part of a name, or the last 4 digits of a phone. */
export function searchPickup<T extends Pick<DayJob, "number" | "customerName" | "phone">>(jobs: T[], term: string): T[] {
  const t = term.trim().toLowerCase();
  if (!t) return [];
  const digits = t.replace(/^qtg-?/, "").replace(/\D/g, "");
  return jobs.filter((j) => {
    if (digits && String(j.number) === digits) return true;
    if (digits.length >= 3 && String(j.number).startsWith(digits) && /^(qtg-?)?\d+$/.test(t)) return true;
    if (digits.length === 4 && (j.phone ?? "").endsWith(digits)) return true;
    return /[a-z]/.test(t) && (j.customerName ?? "").toLowerCase().includes(t);
  });
}

/** Short item line for labels and tickets. */
export function itemsLine(j: Pick<DayJob, "answers" | "summary">, max = 90): string {
  const parts = Object.values(j.answers ?? {}).filter((a) => COUNTED.has(a.type)).map((a) => formatAnswer(a));
  const s = parts.length ? parts.join(" · ") : j.summary ?? "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
