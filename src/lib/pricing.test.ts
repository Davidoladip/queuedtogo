import { describe, expect, it } from "vitest";
import { blankField, normalizeField, normalizeSettings, type FormField, type FormModel } from "./design/engine";
import { normalizeDesign } from "./design/engine";
import { checkSubmission } from "./submission";
import {
  DEFAULT_MAX_PER_ORDER, MAX_PER_ORDER_CAP, formIsPaid, maxPerOrder, money, normalizePay, normalizePrices, normalizeTickets,
  parsePrice, priceInput, quoteForm, quoteLines, refundText, shownPrice, unitFee } from "./pricing";
import { feeRate } from "./payments";

/** FormData-like test double that keeps repeated keys in order. */
function fd(entries: [string, string][]) {
  return {
    get: (k: string) => entries.find(([n]) => n === k)?.[1] ?? null,
    getAll: (k: string) => entries.filter(([n]) => n === k).map(([, v]) => v),
  };
}

function field(type: FormField["type"], patch: Omit<Partial<FormField>, "config"> & { config?: Record<string, unknown> } = {}): FormField {
  return normalizeField({ ...blankField(type), ...patch, config: { ...blankField(type).config, ...(patch.config ?? {}) } })!;
}

function formOf(fields: FormField[], settings: Record<string, unknown> = {}): FormModel {
  return {
    id: "00000000-0000-4000-8000-000000000001", title: "Gala", slug: "gala", eventDate: null, venue: "", intro: "", thanks: "", submitLabel: "Pay",
    settings: normalizeSettings(settings), design: normalizeDesign({}), fields,
  };
}

const name = field("short", { id: "name", label: "Your name", required: true });
const tickets = field("tickets", {
  id: "tix", label: "Tickets", options: ["General", "VIP", "Early bird"],
  config: { tickets: [{ id: "tt_general1", price: 2500 }, { id: "tt_vip00001", price: 6000, max: 4 }, { id: "tt_early001", price: 2000, ends: "2020-01-01T00:00:00Z" }] },
});
const shirt = field("choice", { id: "shirt", label: "Add a shirt?", options: ["No thanks", "Shirt"], config: { prices: [0, 1800] } });

describe("normalising prices and ticket types", () => {
  it("keeps whole cents only, one per option, and drops all-free lists", () => {
    expect(normalizePrices([500, "700", 2.5, -1, 2_000_000, 300], 4)).toEqual([500, 0, 0, 0]);
    expect(normalizePrices([0, 0], 2)).toBeUndefined();
    expect(normalizePrices("500", 2)).toBeUndefined();
    expect(normalizePrices([100], 3)).toEqual([100, 0, 0]);
  });
  it("lines ticket types up with their names and gives each a unique id", () => {
    const t = normalizeTickets([{ id: "tt_same0001", price: 100 }, { id: "tt_same0001", price: 200 }, { id: "<script>", qty: 0 }], 3);
    expect(t).toHaveLength(3);
    expect(new Set(t.map((x) => x.id)).size).toBe(3);
    expect(t[0].id).toBe("tt_same0001");
    expect(t[2].id).toMatch(/^tt_[0-9a-f]{18}$/);
    expect(t[2].qty).toBeNull();
    expect(normalizeTickets([{ max: 500, qty: 3, ends: "not a date" }], 1)[0]).toMatchObject({ max: null, qty: 3, ends: null });
    expect(normalizeTickets([], 2)).toHaveLength(2);
  });
  it("cleans the form's payment settings", () => {
    expect(normalizePay({})).toEqual({ feePayer: "guest", refund: "contact", refundDays: 7 });
    expect(normalizePay({ feePayer: "business", refund: "until", refundDays: 3 })).toEqual({ feePayer: "business", refund: "until", refundDays: 3 });
    expect(normalizePay({ feePayer: "x", refund: "y", refundDays: 9999 })).toEqual({ feePayer: "guest", refund: "contact", refundDays: 7 });
    expect(normalizeSettings({}).pay.feePayer).toBe("guest");
  });
  it("drops prices from question types that can't have them", () => {
    expect(field("short", { config: { prices: [500] } }).config.prices).toBeUndefined();
    expect(field("rsvp", { config: { prices: [500, 0, 0] } }).config.prices).toBeUndefined();
    expect(field("choice", { config: { tickets: [{ price: 5 }] } }).config.tickets).toBeUndefined();
  });
  it("marks a form paid when it has a tickets question or a priced option", () => {
    expect(formIsPaid(formOf([name]))).toBe(false);
    expect(formIsPaid(formOf([name, field("choice", { options: ["A", "B"], config: { prices: [0, 0] } })]))).toBe(false);
    expect(formIsPaid(formOf([name, shirt]))).toBe(true);
    expect(formIsPaid(formOf([name, field("tickets", { config: { tickets: [{ price: 0 }] } })]))).toBe(true);
  });
});

describe("quotes", () => {
  it("prices tickets and options to the cent with the guest paying the fee", () => {
    const form = formOf([name, tickets, shirt]);
    const q = quoteForm(form, fd([["name", "Ada"], ["tix", "2"], ["tix", "1"], ["tix", ""], ["shirt", "Shirt"]]), 0.02);
    expect(q.lines.map((l) => [l.name, l.qty, l.amount])).toEqual([["General", 2, 5000], ["VIP", 1, 6000], ["Shirt", 1, 1800]]);
    expect(q.subtotal).toBe(12800);
    expect(q.fee).toBe(256);
    expect(q.total).toBe(13056);
    expect(q.lines[0].ticket).toBe("tt_general1");
  });
  it("leaves the total alone when the business pays the fee", () => {
    const form = formOf([name, tickets], { pay: { feePayer: "business" } });
    const q = quoteForm(form, fd([["tix", "1"], ["tix", "0"], ["tix", "0"]]), 0.03);
    expect(q).toMatchObject({ subtotal: 2500, fee: 75, total: 2500, feePayer: "business" });
  });
  it("charges a fee that adds up exactly to the all-in prices shown on the form", () => {
    const lines = [{ fieldId: "a", option: 0, name: "x", unit: 1999, qty: 3, amount: 5997 }, { fieldId: "b", option: 0, name: "y", unit: 1250, qty: 1, amount: 1250 }];
    const q = quoteLines(lines, 0.03, "guest");
    expect(q.total).toBe(shownPrice(1999, 0.03, "guest") * 3 + shownPrice(1250, 0.03, "guest"));
    expect(shownPrice(1999, 0.03, "business")).toBe(1999);
    expect(unitFee(1999, 0)).toBe(0);
  });
  it("rounds the fee to the nearest cent and charges none on free orders or for comped businesses", () => {
    expect(quoteLines([{ fieldId: "a", option: 0, name: "x", unit: 1999, qty: 1, amount: 1999 }], 0.005, "guest").fee).toBe(10);
    expect(quoteLines([{ fieldId: "a", option: 0, name: "x", unit: 0, qty: 3, amount: 0 }], 0.03, "guest")).toMatchObject({ fee: 0, total: 0 });
    expect(feeRate("pro", false)).toBe(0.01);
    expect(feeRate("events", true)).toBe(0);
  });
  it("prices multi-select, dropdowns and sizes, ignoring choices that aren't on the form", () => {
    const multi = field("multi", { id: "m", options: ["Cap", "Mug", "Pin"], config: { prices: [1500, 1200, 0] } });
    const drop = field("dropdown", { id: "d", options: ["Small", "Large"], config: { prices: [0, 400] } });
    const sizes = field("sizes", { id: "s", options: ["S", "", "M"], config: { prices: [2000, 9999, 2200] } });
    const form = formOf([multi, drop, sizes]);
    const q = quoteForm(form, fd([["m", "Cap"], ["m", "Mug"], ["m", "Cap"], ["m", "Hat"], ["d", "Large"], ["s", "2"], ["s", "1"]]), 0);
    // The empty size option is hidden on the form, so the second box is M, not the hidden $99.99 one.
    expect(q.lines.map((l) => [l.name, l.qty, l.amount])).toEqual([["Cap", 1, 1500], ["Mug", 1, 1200], ["Large", 1, 400], ["S", 2, 4000], ["M", 1, 2200]]);
    expect(q.subtotal).toBe(9300);
  });
  it("ignores quantities that aren't whole numbers or are absurdly large", () => {
    const form = formOf([tickets]);
    expect(quoteForm(form, fd([["tix", "1.5"], ["tix", "-2"], ["tix", "1e9"]]), 0).subtotal).toBe(0);
  });
});

describe("server checks on paid answers", () => {
  const form = formOf([name, tickets, shirt]);
  it("accepts a valid ticket order and records priced lines on the answers", () => {
    const r = checkSubmission(form, fd([["name", "Ada"], ["tix", "2"], ["tix", ""], ["tix", ""], ["shirt", "Shirt"]]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.answers.tix.value).toEqual({ General: 2 });
    expect(r.answers.tix.lines?.[0]).toMatchObject({ unit: 2500, qty: 2, amount: 5000, ticket: "tt_general1" });
    expect(r.lines.reduce((n, l) => n + l.amount, 0)).toBe(6800);
    expect(r.summary).toContain("General × 2");
  });
  it("needs at least one ticket when the question is required", () => {
    const r = checkSubmission(form, fd([["name", "Ada"], ["tix", ""], ["tix", "0"], ["tix", ""]]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.tix).toBe("Choose at least one ticket.");
  });
  it("enforces the limit per order and the sales end", () => {
    const over = checkSubmission(form, fd([["name", "Ada"], ["tix", ""], ["tix", "5"], ["tix", ""]]));
    expect(!over.ok && over.errors.tix).toBe("You can buy up to 4 VIP tickets per order.");
    const ended = checkSubmission(form, fd([["name", "Ada"], ["tix", ""], ["tix", ""], ["tix", "1"]]));
    expect(!ended.ok && ended.errors.tix).toBe("Sales of Early bird have ended.");
    const frac = checkSubmission(form, fd([["name", "Ada"], ["tix", "1.5"], ["tix", ""], ["tix", ""]]));
    expect(!frac.ok && frac.errors.tix).toBe("Enter whole numbers of tickets.");
    expect(maxPerOrder({ id: "x", price: 0, qty: null, max: null, ends: null })).toBe(DEFAULT_MAX_PER_ORDER);
    expect(maxPerOrder({ id: "x", price: 0, qty: 3, max: 40, ends: null })).toBe(3);
    expect(maxPerOrder({ id: "x", price: 0, qty: null, max: 999, ends: null })).toBe(MAX_PER_ORDER_CAP);
  });
  it("never trusts a total or price sent by the browser", () => {
    const r = checkSubmission(form, fd([["name", "Ada"], ["tix", "1"], ["tix", ""], ["tix", ""], ["__total", "1"], ["price", "0"], ["shirt", "Shirt"]]));
    expect(r.ok && r.lines.reduce((n, l) => n + l.amount, 0)).toBe(4300);
  });
  it("leaves forms without prices exactly as before", () => {
    const plain = formOf([name, field("choice", { id: "c", options: ["A", "B"] })]);
    const r = checkSubmission(plain, fd([["name", "Ada"], ["c", "A"]]));
    expect(r.ok && r.lines).toEqual([]);
    expect(r.ok && r.answers.c.lines).toBeUndefined();
  });
});

describe("display helpers", () => {
  it("formats and parses prices", () => {
    expect(money(2500)).toBe("$25");
    expect(money(2550)).toBe("$25.50");
    expect(money(2500, true)).toBe("$25.00");
    expect(money(123456)).toBe("$1,234.56");
    expect(parsePrice("$25.5")).toBe(2550);
    expect(parsePrice("1,200")).toBe(120000);
    expect(parsePrice("")).toBe(0);
    expect(parsePrice("abc")).toBeNull();
    expect(parsePrice("10000.01")).toBeNull();
    expect(parsePrice("25.555")).toBeNull();
    expect(priceInput(2500)).toBe("25");
    expect(priceInput(2550)).toBe("25.50");
    expect(priceInput(0)).toBe("");
  });
  it("words the refund policy", () => {
    expect(refundText({ feePayer: "guest", refund: "none", refundDays: 7 })).toBe("All sales are final: no refunds.");
    expect(refundText({ feePayer: "guest", refund: "until", refundDays: 1 })).toBe("Refunds are available until 1 day before the event.");
    expect(refundText({ feePayer: "guest", refund: "contact", refundDays: 7 })).toBe("For refunds, contact the organizer.");
  });
});
