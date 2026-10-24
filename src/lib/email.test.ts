import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => null }));

import { customerEmail, emailConfig, emailSetupStatus, sendEmail, stripSmsOptOut, teamAlertEmail, type EmailConfig } from "./email";
import { dispatchQueued } from "@/server/messaging";

const KEY = "re_" + "a".repeat(30);
const cfg: EmailConfig = { apiKey: KEY, from: "QueuedToGo <updates@queuedtogo.com>" };

describe("email settings", () => {
  it("needs a Resend key and a sender address", () => {
    expect(emailConfig({})).toBeNull();
    expect(emailConfig({ RESEND_API_KEY: KEY })).toBeNull();
    expect(emailConfig({ RESEND_API_KEY: "sk_live_x", EMAIL_FROM: "updates@queuedtogo.com" })).toBeNull();
    expect(emailConfig({ RESEND_API_KEY: KEY, EMAIL_FROM: "updates@queuedtogo.com" })?.from).toBe("updates@queuedtogo.com");
    expect(emailConfig({ RESEND_API_KEY: KEY, EMAIL_FROM: "QueuedToGo <updates@queuedtogo.com>" })).not.toBeNull();
    expect(emailConfig({ RESEND_API_KEY: KEY, EMAIL_FROM: "Bad\r\nBcc: x <a@b.co>" })).toBeNull();
    expect(emailSetupStatus({ RESEND_API_KEY: KEY })).toEqual({ apiKey: true, from: false, ready: false });
  });
});

describe("email content", () => {
  const base = { business: "Threadtogo", customerName: "Lena Ortiz", orderNumber: 1042, summary: "Hoodie · M × 2", formTitle: "Food Fest", stage: "Ready", trackingUrl: "https://queuedtogo.com/t/abc", replyTo: "hello@threadtogo.com" };
  it("writes an order confirmation with the order number and tracking button", () => {
    const e = customerEmail({ ...base, kind: "confirmation", stopUrl: null });
    expect(e.subject).toBe("Threadtogo: we've got your order QTG-1042");
    expect(e.html).toContain("Hi Lena,");
    expect(e.html).toContain('href="https://queuedtogo.com/t/abc"');
    expect(e.text).toContain("Track your order: https://queuedtogo.com/t/abc");
    expect(e.text).toContain("Reply to this email to reach Threadtogo.");
  });
  it("writes stage updates without the texting opt-out line, with a stop link", () => {
    const e = customerEmail({ ...base, kind: "stage_update", message: "Hi Lena, order QTG-1042 is ready to collect. Reply STOP to opt out.", stopUrl: "https://queuedtogo.com/t/abc?stop=1" });
    expect(e.subject).toBe("Threadtogo: order QTG-1042 · Ready");
    expect(e.text).not.toContain("STOP");
    expect(e.html).toContain("Stop order updates");
    expect(stripSmsOptOut("Done! Reply STOP to stop texts.")).toBe("Done!");
  });
  it("escapes anything a customer or business typed", () => {
    const e = customerEmail({ ...base, kind: "confirmation", customerName: "<img src=x onerror=alert(1)>", summary: '"><script>x</script>', stopUrl: null });
    expect(e.html).not.toContain("<script>");
    expect(e.html).not.toContain("<img src=x");
    expect(e.html).toContain("&lt;script&gt;");
  });
  it("writes the team's new-order alert with a link to the job", () => {
    const e = teamAlertEmail({ business: "Threadtogo", orderNumber: 1042, customerName: "Lena Ortiz", summary: "Hoodie", formTitle: "Food Fest", jobUrl: "https://queuedtogo.com/w/threadtogo/board/j1", settingsUrl: "https://queuedtogo.com/w/threadtogo/notifications#alerts" });
    expect(e.subject).toBe("New order QTG-1042 from Lena Ortiz");
    expect(e.html).toContain("Open the job");
    expect(e.text).toContain("Change your alerts:");
  });
});

describe("sending email", () => {
  it("calls Resend with the business name, reply-to and a no-duplicates key", async () => {
    const f = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => { void init; return new Response(JSON.stringify({ id: "email_123456789" }), { status: 200 }); });
    const r = await sendEmail(cfg, { to: "lena@example.com", subject: "Hi", html: "<p>x</p>", text: "x", replyTo: "hello@threadtogo.com", idempotencyKey: "qtg-m1", fromName: "Threadtogo", unsubscribeUrl: "https://queuedtogo.com/t/abc?stop=1" }, f as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, id: "email_123456789" });
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe("https://api.resend.com/emails");
    const h = init?.headers as Record<string, string>;
    expect(h.Authorization).toBe(`Bearer ${KEY}`);
    expect(h["Idempotency-Key"]).toBe("qtg-m1");
    const body = JSON.parse(String(init?.body));
    expect(body.from).toBe("Threadtogo via QueuedToGo <updates@queuedtogo.com>");
    expect(body.reply_to).toBe("hello@threadtogo.com");
    expect(body.headers["List-Unsubscribe"]).toBe("<https://queuedtogo.com/t/abc?stop=1>");
  });
  it("reports errors and which are worth retrying", async () => {
    const bad = vi.fn(async () => new Response(JSON.stringify({ name: "validation_error", message: "domain not verified" }), { status: 422 }));
    expect(await sendEmail(cfg, { to: "a@b.co", subject: "s", html: "h", text: "t" }, bad as unknown as typeof fetch)).toMatchObject({ ok: false, code: "validation_error", retry: false });
    const busy = vi.fn(async () => new Response("{}", { status: 503 }));
    expect(await sendEmail(cfg, { to: "a@b.co", subject: "s", html: "h", text: "t" }, busy as unknown as typeof fetch)).toMatchObject({ ok: false, retry: true });
    expect(await sendEmail(cfg, { to: "not-an-email", subject: "s", html: "h", text: "t" }, busy as unknown as typeof fetch)).toMatchObject({ ok: false, code: "invalid_to" });
  });
});

// ------------------------------------------------------------------ dispatch with a fake database
type R = Record<string, unknown>;
function fakeAdmin(tables: Record<string, R[]>) {
  const from = (t: string) => {
    let op: "select" | "update" | "insert" = "select";
    let patch: R = {};
    let returning = false;
    const filters: ((r: R) => boolean)[] = [];
    const run = () => {
      const rows = (tables[t] ??= []);
      if (op === "insert") { rows.push(patch); return { data: [patch], error: null }; }
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "update") { hit.forEach((r) => Object.assign(r, patch)); return { data: returning ? hit.map((r) => ({ id: r.id })) : null, error: null }; }
      return {
        data: hit.map((r) => ({
          ...r,
          jobs: { id: "j1", number: 1042, tracking_token: "tok", summary: "Hoodie", title: "Food Fest · Lena", forms: { title: "Food Fest" } },
          customers: { name: "Lena Ortiz" }, organizations: { name: "Threadtogo", slug: "threadtogo", reply_to_email: "hello@threadtogo.com" }, workflow_stages: { name: "Ready" },
        })),
        error: null,
      };
    };
    const b: R = {
      select: () => { if (op === "update") returning = true; return b; },
      update: (p: R) => { op = "update"; patch = p; return b; },
      insert: (p: R) => { op = "insert"; patch = p; return b; },
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return b; },
      in: (k: string, v: unknown[]) => { filters.push((r) => v.includes(r[k])); return b; },
      not: () => b, order: () => b, limit: () => b,
      then: (res: (x: unknown) => unknown) => Promise.resolve(run()).then(res),
    };
    return b;
  };
  return { from } as never;
}
const msg = (id: string, extra: R = {}): R => ({ id, org_id: "o1", job_id: "j1", kind: "confirmation", channel: "email", to_address: "lena@example.com", template: null, body: null, subject: null, attempts: 0, status: "queued", created_at: new Date().toISOString(), customer_id: "c1", ...extra });

describe("sending queued emails", () => {
  it("sends the confirmation and records it on the job's history", async () => {
    const tables = { messages: [msg("m1")], job_events: [] as R[] };
    const f = vi.fn(async () => new Response(JSON.stringify({ id: "email_abcdef123" }), { status: 200 }));
    const r = await dispatchQueued({ orgId: "o1" }, { admin: fakeAdmin(tables), email: cfg, cfg: null, fetchImpl: f as unknown as typeof fetch });
    expect(r.sent).toBe(1);
    expect(tables.messages[0]).toMatchObject({ status: "sent", provider_sid: "email_abcdef123", subject: "Threadtogo: we've got your order QTG-1042" });
    expect(tables.job_events[0]).toMatchObject({ type: "notification", idempotency_key: "message:m1" });
  });
  it("sends team alerts without adding them to the customer's history", async () => {
    const tables = { messages: [msg("m2", { kind: "team_alert", to_address: "grace@threadtogo.com", customer_id: null })], job_events: [] as R[] };
    const f = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => { void init; return new Response(JSON.stringify({ id: "email_team12345" }), { status: 200 }); });
    await dispatchQueued({ orgId: "o1" }, { admin: fakeAdmin(tables), email: cfg, cfg: null, fetchImpl: f as unknown as typeof fetch });
    expect(tables.messages[0].status).toBe("sent");
    expect(tables.job_events).toHaveLength(0);
    const body = JSON.parse(String(f.mock.calls[0][1]?.body));
    expect(body.reply_to).toBeUndefined();
    expect(body.html).toContain("/w/threadtogo/board/j1");
  });
  it("says so when email isn't connected, without touching texts", async () => {
    const tables = { messages: [msg("m3")], job_events: [] as R[] };
    await dispatchQueued({ orgId: "o1" }, { admin: fakeAdmin(tables), email: null, cfg: null });
    expect(tables.messages[0]).toMatchObject({ status: "skipped", skip_reason: "Email isn't connected yet." });
  });
  it("explains a rejected email", async () => {
    const tables = { messages: [msg("m4")], job_events: [] as R[] };
    const f = vi.fn(async () => new Response(JSON.stringify({ name: "validation_error", message: "The queuedtogo.com domain is not verified" }), { status: 403 }));
    await dispatchQueued({ orgId: "o1" }, { admin: fakeAdmin(tables), email: cfg, cfg: null, fetchImpl: f as unknown as typeof fetch });
    expect(tables.messages[0]).toMatchObject({ status: "failed" });
    expect(String(tables.messages[0].error_message)).toMatch(/verified in Resend/);
  });
});
