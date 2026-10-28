// Guest list helpers: totals, search and CSV. Plain functions shared by pages, the harness and tests.
import { prettyPhone, toCsv } from "@/lib/eventday";
import { formatAnswer, type Answer } from "@/lib/submission";
import type { RsvpStatus } from "@/lib/rsvp";

export type Guest = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: RsvpStatus;
  party: number;
  waitlisted: boolean;
  checkedInAt: string | null;
  respondedAt: string;
  answers: Record<string, Answer>;
};

export type GuestTotals = {
  /** Replies that said yes and have a place (not waitlisted). */
  yes: number;
  /** People coming: confirmed replies plus their guests. */
  headcount: number;
  maybe: number; maybePeople: number;
  no: number;
  waitlist: number; waitlistPeople: number;
  /** People checked in at the door (whole parties). */
  arrived: number;
  replies: number;
};

export function guestTotals(gs: Guest[]): GuestTotals {
  const t: GuestTotals = { yes: 0, headcount: 0, maybe: 0, maybePeople: 0, no: 0, waitlist: 0, waitlistPeople: 0, arrived: 0, replies: gs.length };
  for (const g of gs) {
    if (g.status === "yes" && g.waitlisted) { t.waitlist++; t.waitlistPeople += g.party; }
    else if (g.status === "yes") { t.yes++; t.headcount += g.party; }
    else if (g.status === "maybe") { t.maybe++; t.maybePeople += g.party; }
    else t.no++;
    if (g.checkedInAt && g.status !== "no") t.arrived += g.party;
  }
  return t;
}

export type GuestFilter = "all" | "coming" | "yes" | "maybe" | "no" | "waitlist" | "arrived" | "expected";

export function filterGuests(gs: Guest[], f: GuestFilter): Guest[] {
  switch (f) {
    case "coming": return gs.filter((g) => g.status !== "no" && !g.waitlisted);
    case "yes": return gs.filter((g) => g.status === "yes" && !g.waitlisted);
    case "maybe": return gs.filter((g) => g.status === "maybe");
    case "no": return gs.filter((g) => g.status === "no");
    case "waitlist": return gs.filter((g) => g.waitlisted);
    case "arrived": return gs.filter((g) => g.checkedInAt);
    case "expected": return gs.filter((g) => g.status !== "no" && !g.waitlisted && !g.checkedInAt);
    default: return gs;
  }
}

/** Name or email contains the text, or the last 4 digits of the phone match. */
export function searchGuests<T extends Pick<Guest, "name" | "email" | "phone">>(gs: T[], term: string): T[] {
  const t = term.trim().toLowerCase();
  if (!t) return gs;
  const digits = t.replace(/\D/g, "");
  return gs.filter((g) =>
    (g.name ?? "").toLowerCase().includes(t) || (g.email ?? "").toLowerCase().includes(t) || (digits.length >= 4 && (g.phone ?? "").endsWith(digits)));
}

/** Waitlist first-come order, then everyone else by name. */
export function sortGuests<T extends Guest>(gs: T[]): T[] {
  const rank = (g: Guest) => (g.waitlisted ? 3 : g.status === "yes" ? 0 : g.status === "maybe" ? 1 : 4);
  return [...gs].sort((a, b) => rank(a) - rank(b) || (a.waitlisted ? a.respondedAt.localeCompare(b.respondedAt) : (a.name ?? "").localeCompare(b.name ?? "", "en", { sensitivity: "base" })));
}

export const replyLabel = (g: Pick<Guest, "status" | "waitlisted">) => (g.waitlisted ? "Waitlist" : g.status === "yes" ? "Yes" : g.status === "maybe" ? "Maybe" : "No");

export function guestsCsv(gs: Guest[], timeZone: string): string {
  const questions: string[] = [];
  for (const g of gs) for (const a of Object.values(g.answers ?? {})) if (a?.label && a.type !== "rsvp" && !questions.includes(a.label)) questions.push(a.label);
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
  const header = ["Name", "Reply", "People", "Email", "Mobile", "Replied", "Checked in", ...questions];
  const rows = sortGuests(gs).map((g) => {
    const byLabel = new Map(Object.values(g.answers ?? {}).map((a) => [a.label, a]));
    return [g.name ?? "", replyLabel(g), g.party, g.email ?? "", prettyPhone(g.phone), when(g.respondedAt), when(g.checkedInAt),
      ...questions.map((q) => { const a = byLabel.get(q); return a ? formatAnswer(a) : ""; })];
  });
  return toCsv(header, rows);
}
