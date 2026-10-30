// RSVP mode: settings, wording and "add to calendar". Shared by the browser and the server; no secrets here.

export const RSVP_KEYS = ["yes", "no", "maybe"] as const;
export type RsvpStatus = (typeof RSVP_KEYS)[number];
/** The RSVP question's options are always [yes, no, maybe]; an empty "maybe" label hides that answer. */
export const RSVP_DEFAULT_OPTIONS = ["Yes, I'll be there", "Sorry, I can't make it", "Maybe"];
export const RSVP_DEFAULT_PARTY_LABEL = "How many people, including you?";
export const PARTY_LIMIT = 20;

export type RsvpTitles = { yes: string; no: string; maybe: string; wait: string };
export type RsvpSettings = {
  /** Most guests (including plus-ones) who can say yes. Null means no limit. */
  capacity: number | null;
  /** When full, later guests join a waitlist instead of being turned away. */
  waitlist: boolean;
  /** Last day to reply (YYYY-MM-DD, in the business's time zone). */
  deadline: string | null;
  /** Guests can change or cancel from the link in their confirmation. */
  allowChange: boolean;
  /** Event start and end times (HH:MM, 24-hour), used for "add to calendar". */
  start: string;
  end: string;
  /** Email guests who said yes or maybe the day before. */
  reminder: boolean;
  /** Offer texts (confirmation, reminder, waitlist news) to guests who tick the permission box. */
  texts: boolean;
  /** The permission checkbox wording. */
  consentText: string;
  titles: RsvpTitles;
};

export const DEFAULT_RSVP_CONSENT = "Text me about this event from {business}: my RSVP confirmation, a reminder the day before and waitlist news. Up to 4 msgs. Msg & data rates may apply. Reply STOP to opt out, HELP for help.";
export const RSVP_CONSENT_VARS = ["business"] as const;

export const DEFAULT_RSVP_TITLES: RsvpTitles = {
  yes: "You're on the list!",
  no: "Thanks for letting us know",
  maybe: "Thanks, we've noted you as a maybe",
  wait: "You're on the waitlist",
};
export const DEFAULT_RSVP_THANKS = "Thanks, {name}! Your reply for {form_title} is saved.";
export const RSVP_THANKS_VARS = ["name", "business", "form_title", "guests"] as const;
export const RSVP_SUBMIT_LABEL = "Send my RSVP";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isDate = (v: unknown): v is string => typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z"));
export const isTime = (v: unknown): v is string => typeof v === "string" && TIME.test(v);

const o = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const title = (v: unknown, d: string) => (typeof v === "string" && v.trim() ? v.slice(0, 80) : d);

export function normalizeRsvp(raw: unknown): RsvpSettings {
  const r = o(raw), t = o(r.titles);
  const cap = Number(r.capacity);
  return {
    capacity: Number.isInteger(cap) && cap > 0 && cap <= 99999 ? cap : null,
    waitlist: r.waitlist === true,
    deadline: isDate(r.deadline) ? r.deadline : null,
    allowChange: r.allowChange !== false,
    start: isTime(r.start) ? r.start : "",
    end: isTime(r.end) ? r.end : "",
    reminder: r.reminder === true,
    texts: r.texts === true,
    consentText: typeof r.consentText === "string" && r.consentText.trim() ? r.consentText.slice(0, 300) : DEFAULT_RSVP_CONSENT,
    titles: { yes: title(t.yes, DEFAULT_RSVP_TITLES.yes), no: title(t.no, DEFAULT_RSVP_TITLES.no), maybe: title(t.maybe, DEFAULT_RSVP_TITLES.maybe), wait: title(t.wait, DEFAULT_RSVP_TITLES.wait) },
  };
}

/** The headline shown after replying, from the business's wording. */
export function rsvpHeadline(s: RsvpSettings, status: RsvpStatus, waitlisted: boolean): string {
  const k = waitlisted ? "wait" : status;
  return s.titles[k]?.trim() || DEFAULT_RSVP_TITLES[k];
}

export function guestsText(n: number): string {
  return n === 1 ? "1 person" : `${n} people`;
}

// ---------------------------------------------------------------- dates, times and time zones

/** Minutes the zone is ahead of UTC at that instant. */
function offsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}
export function validZone(tz: string): string {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return "America/New_York"; }
}
/** A wall-clock time in a time zone as a UTC instant (handles daylight saving). */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const zone = validZone(tz);
  const [y, m, d] = date.split("-").map(Number), [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - offsetMinutes(new Date(guess), zone) * 60000;
  t = guess - offsetMinutes(new Date(t), zone) * 60000;
  return new Date(t);
}

export type EventTimes = { allDay: true; date: string; endDate: string } | { allDay: false; start: Date; end: Date };

const nextDay = (date: string) => new Date(Date.parse(date + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);

/** When the event happens. Without a start time it's an all-day event; without an end time it lasts two hours. */
export function eventTimes(date: string | null, s: Pick<RsvpSettings, "start" | "end">, tz: string): EventTimes | null {
  if (!isDate(date)) return null;
  if (!s.start) return { allDay: true, date, endDate: nextDay(date) };
  const start = zonedToUtc(date, s.start, tz);
  let end = s.end ? zonedToUtc(date, s.end, tz) : new Date(start.getTime() + 2 * 3600000);
  if (end <= start) end = s.end ? zonedToUtc(nextDay(date), s.end, tz) : new Date(start.getTime() + 2 * 3600000);
  return { allDay: false, start, end };
}

const to12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
/** "Saturday, November 7 · 6:00 PM – 9:00 PM" */
export function whenText(date: string | null, s: Pick<RsvpSettings, "start" | "end">): string {
  if (!isDate(date)) return "";
  const day = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  if (!s.start) return day;
  return `${day} · ${to12(s.start)}${s.end ? ` – ${to12(s.end)}` : ""}`;
}

// ---------------------------------------------------------------- add to calendar
export type CalEvent = { uid: string; title: string; location: string; description: string; url: string | null; times: EventTimes };

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const compactDate = (d: string) => d.replace(/-/g, "");

/** Text escaped for an .ics value (RFC 5545). */
export function icsText(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
/** Long .ics lines are folded at 75 characters. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 75) { out.push(rest.slice(0, 75)); rest = " " + rest.slice(75); }
  out.push(rest);
  return out.join("\r\n");
}
export function icsFile(e: CalEvent, now = new Date()): string {
  const t = e.times;
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//QueuedToGo//RSVP//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}@queuedtogo.com`,
    `DTSTAMP:${stamp(now)}`,
    ...(t.allDay ? [`DTSTART;VALUE=DATE:${compactDate(t.date)}`, `DTEND;VALUE=DATE:${compactDate(t.endDate)}`] : [`DTSTART:${stamp(t.start)}`, `DTEND:${stamp(t.end)}`]),
    `SUMMARY:${icsText(e.title)}`,
    ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
    ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
export function googleCalendarUrl(e: CalEvent): string {
  const t = e.times;
  const dates = t.allDay ? `${compactDate(t.date)}/${compactDate(t.endDate)}` : `${stamp(t.start)}/${stamp(t.end)}`;
  const p = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates });
  if (e.location) p.set("location", e.location);
  const details = [e.description, e.url].filter(Boolean).join("\n\n");
  if (details) p.set("details", details);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** Today's date (YYYY-MM-DD) in a time zone. */
export function localToday(tz: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: validZone(tz), year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
/** The reply deadline is the end of that day in the business's time zone. */
export const deadlinePassed = (s: Pick<RsvpSettings, "deadline">, tz: string, now = new Date()) => !!s.deadline && localToday(tz, now) > s.deadline;

// ---------------------------------------------------------------- texts

/** "Sat, Nov 7, 6:00 PM" (short, for texts). */
export function shortWhen(date: string | null, s: Pick<RsvpSettings, "start">): string {
  if (!isDate(date)) return "";
  const day = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  return s.start ? `${day}, ${to12(s.start)}` : day;
}

export type RsvpSmsInput = {
  kind: "rsvp_confirmation" | "rsvp_reminder" | "rsvp_promoted";
  business: string; event: string; when: string; venue: string;
  status: RsvpStatus; waitlisted: boolean; party: number; link: string;
};

/** The text a guest gets. Plain ASCII (one SMS segment is 160 characters), ends with the opt-out line. */
export function rsvpSms(v: RsvpSmsInput): string {
  const at = v.when ? `, ${v.when}` : "";
  let body: string;
  if (v.kind === "rsvp_reminder") body = `${v.business}: Reminder: ${v.event} is tomorrow${at}${v.venue ? ` at ${v.venue}` : ""}. Can't make it? ${v.link}`;
  else if (v.kind === "rsvp_promoted") body = `${v.business}: Good news! A place opened up and you're on the list for ${v.event}${at}. ${v.link}`;
  else if (v.waitlisted) body = `${v.business}: ${v.event} is full, so you're on the waitlist. We'll text you if a place opens up. ${v.link}`;
  else if (v.status === "yes") body = `${v.business}: You're on the list for ${v.event}${at}.${v.party > 1 ? ` Party of ${v.party}.` : ""} Your RSVP: ${v.link}`;
  else if (v.status === "maybe") body = `${v.business}: We've noted you as a maybe for ${v.event}${at}. Update your RSVP: ${v.link}`;
  else body = `${v.business}: Thanks for letting us know you can't make ${v.event}.`;
  body = body.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\s+/g, " ").trim();
  return `${body} Reply STOP to opt out.`.slice(0, 640);
}

/** Texts that aren't a direct reply to the guest (reminders, waitlist news) wait for 8 AM to 9 PM in the business's time zone. */
export function quietHours(tz: string, now = new Date()): boolean {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: validZone(tz), hour: "numeric", hourCycle: "h23" }).format(now));
  return h < 8 || h >= 21;
}
