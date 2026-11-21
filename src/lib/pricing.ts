// Stage 10, step 2: prices on order questions and ticket types. The same functions price a form in the browser
// (the running total) and on the server (the amount actually charged), so the two always agree to the cent.
// Only the server's result is trusted: it prices the published form again from the answers, never from a
// total sent by the browser.

import type { FormField, FormModel } from "./design/engine";

/** Highest price for one item or ticket: $10,000. */
export const MAX_PRICE_CENTS = 1_000_000;
/** Most tickets of one type in one order when the business hasn't set its own limit. */
export const DEFAULT_MAX_PER_ORDER = 10;
/** Most tickets of one type in one order, whatever the business sets. */
export const MAX_PER_ORDER_CAP = 50;
/** Most tickets of all types in one order. */
export const MAX_TICKETS_PER_ORDER = 100;
/** Most tickets of one type a form can sell. */
export const MAX_TICKET_QTY = 100_000;

/** Questions whose options can carry a price. */
export const PRICEABLE = new Set<FormField["type"]>(["choice", "multi", "dropdown", "sizes"]);

/** One ticket type. `options[i]` of the Tickets question is its name; `config.tickets[i]` is the rest. */
export type TicketType = {
  /** Stable id, so tickets sold stay counted against the right type when it is renamed or moved. */
  id: string;
  /** Price in cents (0 for a free ticket). */
  price: number;
  /** How many the form can sell; null for no limit. */
  qty: number | null;
  /** Most per order; null means DEFAULT_MAX_PER_ORDER. */
  max: number | null;
  /** When sales of this type end (ISO time, UTC); null for no end. */
  ends: string | null;
};

export type FeePayer = "guest" | "business";
export type RefundPolicy = "none" | "until" | "contact";
export type PaySettings = {
  /** Who pays QueuedToGo's platform fee: added to the guest's total (default) or taken from the business's share. */
  feePayer: FeePayer;
  /** The refund policy shown on the form before payment. */
  refund: RefundPolicy;
  /** "until": refunds until this many days before the event. */
  refundDays: number;
};
export const DEFAULT_PAY: PaySettings = { feePayer: "guest", refund: "contact", refundDays: 7 };

const ID = /^[A-Za-z0-9_-]{6,40}$/;
const cents = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_PRICE_CENTS ? v : 0);
const intIn = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null);
export const newTicketId = () => {
  const b = new Uint8Array(9);
  globalThis.crypto.getRandomValues(b);
  return "tt_" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
};

/**
 * Prices for each option, in cents. Only whole numbers are accepted (never strings), so the database's
 * publish check, which reads the same JSON, sees exactly the prices the app charges.
 */
export function normalizePrices(raw: unknown, n: number): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = Array.from({ length: n }, (_, i) => cents(raw[i]));
  return out.some((p) => p > 0) ? out : undefined;
}

export function normalizeTickets(raw: unknown, n: number): TicketType[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  return Array.from({ length: n }, (_, i) => {
    const t = list[i] && typeof list[i] === "object" ? (list[i] as Record<string, unknown>) : {};
    let id = typeof t.id === "string" && ID.test(t.id) && !seen.has(t.id) ? t.id : newTicketId();
    if (seen.has(id)) id = newTicketId();
    seen.add(id);
    const ends = typeof t.ends === "string" && !Number.isNaN(Date.parse(t.ends)) ? new Date(t.ends).toISOString() : null;
    return { id, price: cents(t.price), qty: intIn(t.qty, 1, MAX_TICKET_QTY), max: intIn(t.max, 1, MAX_PER_ORDER_CAP), ends };
  });
}

/** A new ticket type for the builder. */
export const newTicketType = (price = 0): TicketType => ({ id: newTicketId(), price, qty: null, max: null, ends: null });

export function normalizePay(raw: unknown): PaySettings {
  const p = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    feePayer: p.feePayer === "business" ? "business" : "guest",
    refund: p.refund === "none" || p.refund === "until" ? p.refund : "contact",
    refundDays: intIn(p.refundDays, 1, 90) ?? DEFAULT_PAY.refundDays,
  };
}

export const maxPerOrder = (t: TicketType) => Math.min(t.max ?? DEFAULT_MAX_PER_ORDER, t.qty ?? MAX_PER_ORDER_CAP, MAX_PER_ORDER_CAP);
export const salesEnded = (t: TicketType, now = Date.now()) => !!t.ends && Date.parse(t.ends) <= now;

/** The price of option `i` (its index in `options`), in cents. */
export function optionPrice(f: FormField, i: number): number {
  if (f.type === "tickets") return f.config.tickets?.[i]?.price ?? 0;
  return PRICEABLE.has(f.type) ? f.config.prices?.[i] ?? 0 : 0;
}

/** The form takes money or sells tickets, so it needs a connected payment account and checkout. */
export const fieldIsPaid = (f: FormField) => f.type === "tickets" || (PRICEABLE.has(f.type) && (f.config.prices ?? []).some((p) => p > 0));
export const formIsPaid = (form: Pick<FormModel, "fields">) => form.fields.some(fieldIsPaid);

/** One priced line: "VIP × 2 at $60.00". `ticket` is the ticket type id for ticket lines. */
export type Line = { fieldId: string; option: number; name: string; unit: number; qty: number; amount: number; ticket?: string };

/** Minimal FormData-like interface (FormData, URLSearchParams-style test doubles). */
type Fields = { get(name: string): FormDataEntryValue | null; getAll(name: string): FormDataEntryValue[] };
const str = (v: FormDataEntryValue | null | undefined) => (typeof v === "string" ? v.trim() : "");

/** The options shown on the form, with their index in `options` (empty options are hidden). */
export const shownOptions = (f: FormField) => f.options.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o);

/**
 * The priced lines one question adds, read from the submitted answers. Choices that aren't on the form, and
 * quantities that aren't whole numbers, add nothing here (the answer checks reject them separately).
 * Quantities from the browser are capped, so a huge number can't overflow the total.
 */
export function fieldLines(f: FormField, fd: Fields): Line[] {
  const shown = shownOptions(f);
  const line = (i: number, qty: number, extra?: Partial<Line>): Line => {
    const unit = optionPrice(f, i);
    return { fieldId: f.id, option: i, name: f.options[i].trim(), unit, qty, amount: unit * qty, ...extra };
  };
  switch (f.type) {
    case "choice": case "dropdown": {
      const v = str(fd.get(f.id));
      const hit = shown.find((x) => x.o === v);
      return hit && optionPrice(f, hit.i) > 0 ? [line(hit.i, 1)] : [];
    }
    case "multi": {
      const vs = new Set(fd.getAll(f.id).map(str));
      return shown.filter((x) => vs.has(x.o) && optionPrice(f, x.i) > 0).map((x) => line(x.i, 1));
    }
    case "sizes": case "tickets": {
      const raw = fd.getAll(f.id).map(str);
      const out: Line[] = [];
      shown.forEach((x, pos) => {
        const n = Number(raw[pos] ?? "");
        if (!Number.isInteger(n) || n <= 0 || n > 9999) return;
        if (f.type === "tickets") out.push(line(x.i, n, { ticket: f.config.tickets?.[x.i]?.id }));
        else if (optionPrice(f, x.i) > 0) out.push(line(x.i, n));
      });
      return out;
    }
  }
  return [];
}

export type Quote = {
  lines: Line[];
  /** What the items and tickets cost, in cents. */
  subtotal: number;
  /** QueuedToGo's platform fee, in cents. */
  fee: number;
  feePayer: FeePayer;
  /** What the buyer pays, in cents. */
  total: number;
  currency: "usd";
};

/** Prices the whole form. `rate` is the business's platform fee rate (0 for comped businesses). */
export function quoteForm(form: FormModel, fd: Fields, rate: number): Quote {
  const lines = form.fields.flatMap((f) => fieldLines(f, fd));
  return quoteLines(lines, rate, form.settings.pay.feePayer);
}

/** The booking fee on one unit, in cents. Rounded per unit so an advertised all-in price always adds up to the total. */
export const unitFee = (unit: number, rate: number) => (unit > 0 && rate > 0 ? Math.round(unit * rate) : 0);

/**
 * The price to show for one item or ticket. When the buyer pays the booking fee it is included, as the FTC's fee
 * rule (16 CFR 464, live-event tickets) and Maryland's all-in ticket pricing law require: no fee appears for the
 * first time at checkout.
 */
export const shownPrice = (unit: number, rate: number, feePayer: FeePayer) => unit + (feePayer === "guest" ? unitFee(unit, rate) : 0);

export function quoteLines(lines: Line[], rate: number, feePayer: FeePayer): Quote {
  const subtotal = lines.reduce((n, l) => n + l.amount, 0);
  const fee = lines.reduce((n, l) => n + unitFee(l.unit, rate) * l.qty, 0);
  return { lines, subtotal, fee, feePayer, total: subtotal + (feePayer === "guest" ? fee : 0), currency: "usd" };
}

/** "$1,234.50"; whole dollars without cents ("$25"). */
export function money(c: number, alwaysCents = false): string {
  const whole = c % 100 === 0 && !alwaysCents;
  return (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}

/** Parses a price typed in the builder ("25", "$25.50", "1,200") into cents; null if it isn't a price. */
export function parsePrice(s: string): number | null {
  const t = s.replace(/[$,\s]/g, "");
  if (t === "") return 0;
  if (!/^\d{1,5}(\.\d{0,2})?$/.test(t)) return null;
  const c = Math.round(Number(t) * 100);
  return c <= MAX_PRICE_CENTS ? c : null;
}
/** Cents shown in a price box ("25" or "25.50"; empty for free). */
export const priceInput = (c: number) => (c > 0 ? (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2)) : "");

/** The refund policy as shown to buyers. */
export function refundText(p: PaySettings): string {
  if (p.refund === "none") return "All sales are final: no refunds.";
  if (p.refund === "until") return `Refunds are available until ${p.refundDays} day${p.refundDays === 1 ? "" : "s"} before the event.`;
  return "For refunds, contact the organizer.";
}
