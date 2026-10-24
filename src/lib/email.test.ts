import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => null }));

import { customerEmail, emailConfig, emailSetupStatus, sendEmail, stripSmsOptOut, teamAlertEmail, type EmailConfig } from "./email";
import { dispatchQueued } from "@/server/messaging";

const AC = "AC" + "a".repeat(32);
const TOKEN = "t".repeat(32);
const cfg: EmailConfig = { user: AC, pass: TOKEN, from: "QueuedToGo <updates@queuedtogo.com>" };

describe("email settings", () => {
  it("uses the Twilio account and needs a sender address", () => {
    expect(emailConfig({})).toBeNull();
    expect(emailConfig({ TWILIO_ACCOUNT_SID: AC, TWILIO_AUTH_TOKEN: TOKEN })).toBeNull();
    expect(emailConfig({ EMAIL_FROM: "updates@queuedtogo.com" })).toBeNull();
    expect(emailConfig({ TWILIO_ACCOUNT_SID: AC, TWILIO_AUTH_TOKEN: TOKEN, EMAIL_FROM: "updates@queuedtogo.com" })).toEqual({ user: AC, pass: TOKEN, from: "updates@queuedtogo.com" });
    expect(emailConfig({ TWILIO_ACCOUNT_SID: AC, TWILIO_AUTH_TOKEN: TOKEN, TWILIO_API_KEY_SID: "SK" + "c".repeat(32), TWILIO_API_KEY_SECRET: "s".repeat(32), EMAIL_FROM: "QueuedToGo <updates@queuedtogo.com>" })?.user).toBe("SK" + "c".repeat(32));
    expect(emailConfig({ TWILIO_ACCOUNT_SID: AC, TWILIO_AUTH_TOKEN: TOKEN, EMAIL_FROM: "Bad\r\nBcc: x <a@b.co>" })).toBeNull();
    expect(emailSetupStatus({ TWILIO_ACCOUNT_SID: AC, TWILIO_AUTH_TOKEN: TOKEN })).toEqual({ twilio: true, from: false, ready: false });
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
    expect(e.text).toContain("Questions? Email Threadtogo at hello@threadtogo.com and quote QTG-1042.");
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
  it("calls Twilio Email with the Twilio account, the business name and tags", async () => {
    const f = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => { void init; return new Response(JSON.stringify({ operationId: "op_123456789" }), { status: 202 }); });
    const r = await sendEmail(cfg, { to: "lena@example.com", subject: "Hi", html: "<p>x</p>", text: "x", fromName: "Threadtogo ✨", unsubscribeUrl: "https://queuedtogo.com/t/abc?stop=1", tags: { message_id: "m-1", kind: "stage-update" } }, f as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, id: "op_123456789" });
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe("https://comms.twilio.com/v1/Emails");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Basic " + Buffer.from(`${AC}:${TOKEN}`).toString("base64"));
    const body = JSON.parse(String(init?.body));
    expect(body.from).toEqual({ address: "updates@queuedtogo.com", name: "Threadtogo via QueuedToGo" });
    expect(body.to).toEqual([{ address: "lena@example.com" }]);
    expect(body.content).toMatchObject({ subject: "Hi", html: "<p>x</p>", text: "x", headers: { "List-Unsubscribe": "<https://queuedtogo.com/t/abc?stop=1>" } });
    expect(body.tags).toEqual({ message_id: "m-1", kind: "stage-update" });
  });
  it("reports errors, and only retries when Twilio clearly didn't take the email", async () => {
    const bad = vi.fn(async () => new Response(JSON.stringify({ code: 400, message: "Sender domain not verified" }), { status: 400 }));
    expect(await sendEmail(cfg, { to: "a@b.co", subject: "s", html: "h", text: "t" }, bad as unknown as typeof fetch)).toMatchObject({ ok: false, code: "400", retry: false });
    const busy = vi.fn(async () => new Response("{}", { status: 503 }));
    expect(await sendEmail(cfg, { to: "a@b.co", subject: "s", html: "h", text: "t" }, busy as unknown as typeof fetch)).toMatchObject({ ok: false, retry: true });
    const dropped = vi.fn(async () => { throw new Error("socket hang up"); });
    expect(await sendEmail(cfg, { to: "a@b.co", subject: "s", html: "h", text: "t" }, dropped as unknown as typeof fetch)).toMatchObject({ ok: false, code: "network", retry: false });
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
    const f = vi.fn(async () => new Response(JSON.stringify({ operationId: "op_abcdef123" }), { status: 202 }));
    const r = await dispatchQueued({ orgId: "o1" }, { admin: fakeAdmin(tables), email: cfg, cfg: null, fetchImpl: f as unknown as typeof fetch });
    expect(r.sent).toBe(1);
    expect(tables.messages[0]).toMatchObject({ status: "sent", provider_sid: "op_abcdef123", subject: "Threadtogo: we've got your order QTG-1042" });
    expect(tables.job_events[0]).toMatchObject({ type: "notification", idempotency_key: "message:m1" });
  });
  it("sends team alerts without adding them to the customer's history", async () => {
    const tables = { messages: [msg("m2", { kind: "team_alert", to_address: "grace@threadtogo.com", customer_id: null })], job_events: [] as R[] };
    const f = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => { void init; return new Response(JSON.stringify({ operationId: "op_team12345" }), { status: 202 }); });
    await dispatchQueued({ orgId: "o1" }, { admin: fakeAdmin(tables), email: cfg, cfg: null, fetchImpl: f as unknown as typeof fetch });
    expect(tables.messages[0].status).toBe("sent");
    expect(tables.job_events).toHaveLength(0);
    const body = JSON.parse(String(f.mock.calls[0][1]?.body));
    expect(body.content.html).toContain("/w/threadtogo/board/j1");
    expect(body.content.headers).toBeUndefined();
  });
  it("says so when email isn't connected, without touching texts", async () => {
    const tables = { messages: [msg("m3")], job_events: [] as R[] };
    await dispatchQueued({ orgId: "o1" }, { admin: fakeAdmin(tables), email: null, cfg: null });
    expect(tables.messages[0]).toMatchObject({ status: "skipped", skip_reason: "Email isn't connected yet." });
  });
  it("explains a rejected email", async () => {
    const tables = { messages: [msg("m4")], job_events: [] as R[] };
    const f = vi.fn(async () => new Response(JSON.stringify({ code: 400, message: "The queuedtogo.com domain is not verified" }), { status: 400 }));
    await dispatchQueued({ orgId: "o1" }, { admin: fakeAdmin(tables), email: cfg, cfg: null, fetchImpl: f as unknown as typeof fetch });
    expect(tables.messages[0]).toMatchObject({ status: "failed" });
    expect(String(tables.messages[0].error_message)).toMatch(/verified sender domain in Twilio/);
  });
});
