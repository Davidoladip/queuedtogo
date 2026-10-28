import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => null }));

import { blankField, elementsOf, normalizeField, normalizeSettings, type FormModel } from "./design/engine";
import { normalizeDesign } from "./design/engine";
import { checkSubmission, formatAnswer } from "./submission";
import { deadlinePassed, eventTimes, googleCalendarUrl, icsFile, localToday, normalizeRsvp, rsvpHeadline, whenText, zonedToUtc } from "./rsvp";
import { filterGuests, guestTotals, guestsCsv, searchGuests, type Guest } from "./guests";
import { rsvpEmail } from "./email";
import { dispatchQueued } from "@/server/messaging";

function rsvpForm(over: Partial<FormModel> = {}): FormModel {
  const rsvp = blankField("rsvp");
  rsvp.id = "f-rsvp";
  const name = blankField("short"); name.id = "f-name"; name.label = "Your name"; name.required = true;
  const email = blankField("email"); email.id = "f-email"; email.required = true;
  return {
    id: "0f8fad5b-d9cb-469f-a165-70867728950e", title: "Launch Party", slug: "launch", eventDate: "2026-11-07", venue: "Pier 3", intro: "", thanks: "", submitLabel: "Send my RSVP",
    settings: normalizeSettings({ mode: "rsvp", rsvp: { start: "18:00", end: "21:30" } }), design: normalizeDesign({}),
    fields: [name, email, rsvp, blankField("submit")], ...over,
  };
}
const fd = (o: Record<string, string>) => {
  const m = new Map(Object.entries(o));
  return { get: (k: string) => m.get(k) ?? null, getAll: (k: string) => (m.has(k) ? [m.get(k)!] : []) };
};

describe("RSVP settings and question", () => {
  it("normalises settings safely", () => {
    const s = normalizeRsvp({ capacity: "120", waitlist: true, deadline: "2026-11-01", start: "25:00", end: "21:00", titles: { yes: "  ", no: "Boo" } });
    expect(s).toMatchObject({ capacity: 120, waitlist: true, deadline: "2026-11-01", start: "", end: "21:00", allowChange: true, reminder: false });
    expect(s.titles.yes).toBe("You're on the list!");
    expect(s.titles.no).toBe("Boo");
    expect(normalizeRsvp({ capacity: -3, deadline: "2026-02-31x" })).toMatchObject({ capacity: null, deadline: null });
    expect(normalizeSettings({}).mode).toBe("order");
    expect(normalizeSettings({ mode: "rsvp" }).mode).toBe("rsvp");
  });
  it("always has yes, no and maybe answers, is always required, and keeps the guest count in range", () => {
    const f = normalizeField({ id: "abc", type: "rsvp", options: ["Count me in"], required: false, config: { partyMax: 99, display: "list" } })!;
    expect(f.options).toEqual(["Count me in", "Sorry, I can't make it", ""]);
    expect(f.required).toBe(true);
    expect(f.config.partyMax).toBe(20);
    expect(f.config.display).toBeUndefined();
    expect(normalizeField({ id: "x", type: "short", config: { partyMax: 3 } })!.config.partyMax).toBeUndefined();
  });
  it("is styled like choice options, with each answer and the guest count box as their own elements", () => {
    const els = elementsOf(rsvpForm());
    const mine = els.filter((e) => e.f?.id === "f-rsvp").map((e) => `${e.sid}:${e.kind}`);
    expect(mine).toEqual(["f-rsvp:choice", "f-rsvp__label:label", "f-rsvp__party:input", "f-rsvp__o0:choice", "f-rsvp__o1:choice", "f-rsvp__o2:choice"]);
  });
  it("uses the business's headline wording, falling back to the defaults", () => {
    const s = normalizeRsvp({ titles: { wait: "Hang tight!" } });
    expect(rsvpHeadline(s, "yes", true)).toBe("Hang tight!");
    expect(rsvpHeadline({ ...s, titles: { ...s.titles, yes: "" } }, "yes", false)).toBe("You're on the list!");
  });
});

describe("checking an RSVP on the server", () => {
  it("accepts yes with a guest count and builds the guest", () => {
    const c = checkSubmission(rsvpForm(), fd({ "f-name": "Ava Stone", "f-email": "AVA@example.com", "f-rsvp": "yes", "f-rsvp__party": "3" }));
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.rsvp).toEqual({ status: "yes", party: 3 });
    expect(c.consent).toBe(false);
    expect(c.answers["f-rsvp"]).toMatchObject({ value: "Yes, I'll be there", rsvp: "yes", party: 3 });
    expect(formatAnswer(c.answers["f-rsvp"])).toBe("Yes, I'll be there · 3 people");
    expect(c.customer.email).toBe("ava@example.com");
  });
  it("counts nobody for a no, and ignores a typed guest count", () => {
    const c = checkSubmission(rsvpForm(), fd({ "f-name": "Ben", "f-email": "ben@example.com", "f-rsvp": "no", "f-rsvp__party": "9" }));
    expect(c.ok && c.rsvp).toEqual({ status: "no", party: 0 });
  });
  it("refuses made-up answers, hidden maybes, bad counts and a missing reply", () => {
    const base = { "f-name": "Cy", "f-email": "cy@example.com" };
    expect(checkSubmission(rsvpForm(), fd({ ...base, "f-rsvp": "Yes, I'll be there" })).ok).toBe(false);
    expect(checkSubmission(rsvpForm(), fd({ ...base, "f-rsvp": "yes", "f-rsvp__party": "5" }))).toMatchObject({ ok: false, errors: { "f-rsvp": "Enter how many people are coming (1 to 4)." } });
    expect(checkSubmission(rsvpForm(), fd({ ...base, "f-rsvp": "yes", "f-rsvp__party": "1.5" })).ok).toBe(false);
    expect(checkSubmission(rsvpForm(), fd(base))).toMatchObject({ ok: false, errors: { "f-rsvp": "This is required." } });
    const noMaybe = rsvpForm();
    noMaybe.fields[2].options[2] = "";
    expect(checkSubmission(noMaybe, fd({ ...base, "f-rsvp": "maybe" })).ok).toBe(false);
  });
  it("needs an RSVP question on an RSVP form", () => {
    const f = rsvpForm();
    f.fields = f.fields.filter((x) => x.type !== "rsvp");
    expect(checkSubmission(f, fd({ "f-name": "Dee", "f-email": "d@example.com" }))).toMatchObject({ ok: false, message: expect.stringContaining("needs an RSVP question") });
  });
});

describe("dates, time zones and calendars", () => {
  it("turns local event times into UTC across daylight saving", () => {
    expect(zonedToUtc("2026-11-07", "18:00", "America/New_York").toISOString()).toBe("2026-11-07T23:00:00.000Z");
    expect(zonedToUtc("2026-07-04", "18:00", "America/New_York").toISOString()).toBe("2026-07-04T22:00:00.000Z");
    expect(zonedToUtc("2026-07-04", "18:00", "Not/AZone").toISOString()).toBe("2026-07-04T22:00:00.000Z");
  });
  it("handles all-day events, missing end times and parties past midnight", () => {
    expect(eventTimes("2026-11-07", { start: "", end: "" }, "America/New_York")).toEqual({ allDay: true, date: "2026-11-07", endDate: "2026-11-08" });
    const t = eventTimes("2026-11-07", { start: "22:00", end: "01:00" }, "America/New_York");
    expect(t && !t.allDay && [t.start.toISOString(), t.end.toISOString()]).toEqual(["2026-11-08T03:00:00.000Z", "2026-11-08T06:00:00.000Z"]);
    const two = eventTimes("2026-11-07", { start: "18:00", end: "" }, "America/New_York");
    expect(two && !two.allDay && two.end.toISOString()).toBe("2026-11-08T01:00:00.000Z");
    expect(eventTimes(null, { start: "", end: "" }, "UTC")).toBeNull();
    expect(whenText("2026-11-07", { start: "18:00", end: "21:30" })).toBe("Saturday, November 7 · 6:00 PM – 9:30 PM");
  });
  it("writes a valid calendar file with escaped text", () => {
    const times = eventTimes("2026-11-07", { start: "18:00", end: "21:30" }, "America/New_York")!;
    const ics = icsFile({ uid: "r1", title: "Launch; Party, 2026", location: "Pier 3\nHarbourfront", description: "Hi", url: "https://queuedtogo.com/r/abc", times }, new Date("2026-10-28T00:00:00Z"));
    expect(ics).toContain("BEGIN:VCALENDAR\r\nVERSION:2.0");
    expect(ics).toContain("DTSTART:20261107T230000Z\r\nDTEND:20261108T023000Z");
    expect(ics).toContain("SUMMARY:Launch\\; Party\\, 2026");
    expect(ics).toContain("LOCATION:Pier 3\\nHarbourfront");
    expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true);
    const g = new URL(googleCalendarUrl({ uid: "r1", title: "Launch", location: "Pier 3", description: "", url: null, times }));
    expect(g.searchParams.get("dates")).toBe("20261107T230000Z/20261108T023000Z");
    expect(g.searchParams.get("text")).toBe("Launch");
  });
  it("closes replies after the end of the deadline day in the business's time zone", () => {
    const at = new Date("2026-11-02T03:30:00Z"); // 10:30 PM on Nov 1 in New York
    expect(localToday("America/New_York", at)).toBe("2026-11-01");
    expect(deadlinePassed({ deadline: "2026-11-01" }, "America/New_York", at)).toBe(false);
    expect(deadlinePassed({ deadline: "2026-11-01" }, "UTC", at)).toBe(true);
    expect(deadlinePassed({ deadline: null }, "UTC", at)).toBe(false);
  });
});

describe("guest list", () => {
  const g = (id: string, o: Partial<Guest>): Guest => ({ id, name: id, email: `${id}@example.com`, phone: null, status: "yes", party: 1, waitlisted: false, checkedInAt: null, respondedAt: "2026-10-01T10:00:00Z", answers: {}, ...o });
  const list = [g("ava", { party: 3, checkedInAt: "2026-11-07T23:10:00Z" }), g("ben", { status: "maybe", party: 2 }), g("cy", { status: "no", party: 0 }), g("dee", { waitlisted: true, party: 2 }), g("eve", { phone: "+15555550142" })];
  it("totals people, not just replies", () => {
    expect(guestTotals(list)).toEqual({ yes: 2, headcount: 4, maybe: 1, maybePeople: 2, no: 1, waitlist: 1, waitlistPeople: 2, arrived: 3, replies: 5 });
  });
  it("filters and searches", () => {
    expect(filterGuests(list, "expected").map((x) => x.id)).toEqual(["ben", "eve"]);
    expect(filterGuests(list, "waitlist").map((x) => x.id)).toEqual(["dee"]);
    expect(searchGuests(list, "0142").map((x) => x.id)).toEqual(["eve"]);
    expect(searchGuests(list, "BEN@").map((x) => x.id)).toEqual(["ben"]);
  });
  it("exports a CSV that spreadsheets can't run as formulas", () => {
    const csv = guestsCsv([g("x", { name: "=HYPERLINK(1)", answers: { n: { label: "Dietary needs", type: "long", value: "Vegan" } } })], "UTC");
    expect(csv).toContain("Name,Reply,People,Email,Mobile,Replied,Checked in,Dietary needs");
    expect(csv).toContain("'=HYPERLINK(1),Yes,1");
    expect(csv).toContain("Vegan");
  });
});

describe("RSVP emails", () => {
  const base = { business: "Threadtogo", guestName: "Ava Stone", eventTitle: "Launch Party", when: "Saturday, November 7 · 6:00 PM", venue: "Pier 3", status: "yes" as const, waitlisted: false, party: 2,
    headline: "You're on the list!", answer: "Yes, I'll be there", manageUrl: "https://queuedtogo.com/r/abc", canChange: true, googleUrl: "https://calendar.google.com/x", icsUrl: "https://queuedtogo.com/r/abc/calendar.ics", replyTo: "hello@threadtogo.com" };
  it("confirms a yes with calendar links and the change link", () => {
    const e = rsvpEmail({ ...base, kind: "rsvp_confirmation", accent: { bg: "#E8633A", text: "#FFFFFF" } });
    expect(e.subject).toBe("Threadtogo: you're on the list for Launch Party");
    expect(e.html).toContain("Change my RSVP");
    expect(e.html).toContain("Add to Google Calendar");
    expect(e.html).toContain("background:#E8633A");
    expect(e.text).toContain("Party: 2 people");
  });
  it("tells waitlisted guests they're waiting, without calendar links", () => {
    const e = rsvpEmail({ ...base, kind: "rsvp_confirmation", waitlisted: true });
    expect(e.subject).toContain("waitlist");
    expect(e.html).not.toContain("Add to Google Calendar");
  });
  it("writes reminders and waitlist promotions, and escapes what guests typed", () => {
    expect(rsvpEmail({ ...base, kind: "rsvp_reminder" }).subject).toBe("Reminder: Launch Party is tomorrow");
    expect(rsvpEmail({ ...base, kind: "rsvp_promoted" }).subject).toBe("Good news: you're off the waitlist for Launch Party");
    const bad = rsvpEmail({ ...base, kind: "rsvp_confirmation", guestName: "<script>x</script>", accent: { bg: "red;x:1", text: "#fff" } });
    expect(bad.html).not.toContain("<script>");
    expect(bad.html).toContain("background:#3346D3");
  });
});

describe("sending queued RSVP emails", () => {
  it("sends the confirmation built from the published form", async () => {
    const form = rsvpForm();
    const published = { title: form.title, event_date: form.eventDate, venue: form.venue, settings: form.settings, design: form.design, fields: form.fields };
    const tables: Record<string, Record<string, unknown>[]> = {
      messages: [{ id: "m1", org_id: "o1", job_id: null, kind: "rsvp_confirmation", channel: "email", to_address: "ava@example.com", template: null, body: null, subject: null, attempts: 0, status: "queued", created_at: new Date().toISOString(), customer_id: null,
        rsvps: { id: "r1", token: "a".repeat(64), name: "Ava Stone", status: "yes", party_size: 2, waitlisted: false, form_id: "form1" } }],
      forms: [{ id: "form1", slug: "launch", published_config: published }],
      job_events: [],
    };
    const from = (t: string) => {
      let op = "select"; let patch: Record<string, unknown> = {};
      const filters: ((r: Record<string, unknown>) => boolean)[] = [];
      const b: Record<string, unknown> = {
        select: () => b, update: (p: Record<string, unknown>) => { op = "update"; patch = p; return b; },
        insert: (p: Record<string, unknown>) => { op = "insert"; tables[t].push(p); return b; },
        eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return b; }, in: () => b, not: () => b, order: () => b, limit: () => b,
        maybeSingle: () => Promise.resolve({ data: tables[t].find((r) => filters.every((f) => f(r))) ?? null, error: null }),
        then: (res: (x: unknown) => unknown) => {
          const hit = (tables[t] ?? []).filter((r) => filters.every((f) => f(r)));
          if (op === "update") hit.forEach((r) => Object.assign(r, patch));
          return Promise.resolve({ data: op === "update" ? hit.map((r) => ({ id: r.id })) : hit.map((r) => ({ ...r, organizations: { name: "Threadtogo", slug: "threadtogo", reply_to_email: null, timezone: "America/New_York" } })), error: null }).then(res);
        },
      };
      return b;
    };
    const f = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => { void init; return new Response(JSON.stringify({ operationId: "op_rsvp12345" }), { status: 202 }); });
    const r = await dispatchQueued({ orgId: "o1" }, { admin: { from } as never, email: { user: "AC" + "a".repeat(32), pass: "t".repeat(32), from: "updates@queuedtogo.com" }, cfg: null, fetchImpl: f as unknown as typeof fetch });
    expect(r.sent).toBe(1);
    expect(tables.messages[0]).toMatchObject({ status: "sent", subject: "Threadtogo: you're on the list for Launch Party" });
    const body = JSON.parse(String(f.mock.calls[0][1]?.body));
    expect(body.content.html).toContain(`/r/${"a".repeat(64)}`);
    expect(body.content.text).toContain("When: Saturday, November 7 · 6:00 PM – 9:30 PM");
    expect(tables.job_events).toHaveLength(0);
  });
});
