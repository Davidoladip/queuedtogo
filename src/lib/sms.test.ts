import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => null }));

import {
  explainError, isStartWord, isStopWord, mapStatus, renderSms, sendSms, smsSegments, twilioConfig, twilioSetupStatus,
  twilioSignature, validTwilioSignature, type TwilioConfig,
} from "./sms";
import { dispatchQueued } from "@/server/messaging";

const AC = "AC" + "a".repeat(32);
const MG = "MG" + "b".repeat(32);
const SK = "SK" + "c".repeat(32);
const TOKEN = "t".repeat(32);
const cfg: TwilioConfig = { accountSid: AC, user: AC, pass: TOKEN, authToken: TOKEN, messagingServiceSid: MG, from: null };

describe("Twilio settings", () => {
  it("needs an account, a token and a sender", () => {
    expect(twilioConfig({})).toBeNull();
    expect(twilioConfig({ TWILIO_ACCOUNT_SID: AC, TWILIO_AUTH_TOKEN: TOKEN })).toBeNull();
    expect(twilioConfig({ TWILIO_ACCOUNT_SID: "nope", TWILIO_AUTH_TOKEN: TOKEN, TWILIO_MESSAGING_SERVICE_SID: MG })).toBeNull();
    expect(twilioConfig({ TWILIO_ACCOUNT_SID: AC, TWILIO_AUTH_TOKEN: TOKEN, TWILIO_MESSAGING_SERVICE_SID: MG })?.messagingServiceSid).toBe(MG);
    expect(twilioConfig({ TWILIO_ACCOUNT_SID: AC, TWILIO_AUTH_TOKEN: TOKEN, TWILIO_FROM_NUMBER: "+18885550100" })?.from).toBe("+18885550100");
  });
  it("prefers an API key for sending when one is set", () => {
    const c = twilioConfig({ TWILIO_ACCOUNT_SID: AC, TWILIO_AUTH_TOKEN: TOKEN, TWILIO_MESSAGING_SERVICE_SID: MG, TWILIO_API_KEY_SID: SK, TWILIO_API_KEY_SECRET: "s".repeat(32) });
    expect(c?.user).toBe(SK);
    expect(c?.authToken).toBe(TOKEN);
  });
  it("reports which pieces are missing without revealing values", () => {
    expect(twilioSetupStatus({ TWILIO_ACCOUNT_SID: AC })).toEqual({ accountSid: true, authToken: false, sender: false, ready: false });
  });
});

describe("message wording", () => {
  const v = { name: "Lena Ortiz", order: 1001, link: "https://queuedtogo.com/t/abc", business: "Threadtogo", stage: "Ready" };
  it("fills in the details and uses the first name", () => {
    expect(renderSms("Hi {name}, order {order} is {stage}: {link} - {business}", v))
      .toBe("Hi Lena, order QTG-1001 is Ready: https://queuedtogo.com/t/abc - Threadtogo Reply STOP to opt out.");
  });
  it("doesn't add a second opt-out line, and keeps unknown placeholders visible", () => {
    expect(renderSms("Hi {name}. Reply STOP to stop texts.", v)).toBe("Hi Lena. Reply STOP to stop texts.");
    expect(renderSms("Hi {nickname}", v)).toContain("{nickname}");
  });
  it("copes with missing names", () => {
    expect(renderSms("Hi {name}!", { ...v, name: null })).toMatch(/^Hi there!/);
  });
  it("counts SMS segments", () => {
    expect(smsSegments("x".repeat(160))).toBe(1);
    expect(smsSegments("x".repeat(161))).toBe(2);
    expect(smsSegments("😀".repeat(40))).toBe(2);
  });
});

describe("sending", () => {
  it("posts to Twilio with the messaging service and status callback", async () => {
    const f = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      void init;
      return new Response(JSON.stringify({ sid: "SM" + "1".repeat(32), status: "accepted" }), { status: 201 });
    });
    const r = await sendSms(cfg, "+15551234567", "Hello", "https://queuedtogo.com/api/twilio/status", f as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, sid: "SM" + "1".repeat(32), status: "accepted" });
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe(`https://api.twilio.com/2010-04-01/Accounts/${AC}/Messages.json`);
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("MessagingServiceSid")).toBe(MG);
    expect(body.get("To")).toBe("+15551234567");
    expect(body.get("StatusCallback")).toBe("https://queuedtogo.com/api/twilio/status");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Basic " + Buffer.from(`${AC}:${TOKEN}`).toString("base64"));
  });
  it("reports Twilio errors and which ones are worth retrying", async () => {
    const stop = vi.fn(async () => new Response(JSON.stringify({ code: 21610, message: "Attempt to send to unsubscribed recipient" }), { status: 400 }));
    expect(await sendSms(cfg, "+15551234567", "x", null, stop as unknown as typeof fetch)).toMatchObject({ ok: false, code: "21610", retry: false });
    const busy = vi.fn(async () => new Response("{}", { status: 429 }));
    expect(await sendSms(cfg, "+15551234567", "x", null, busy as unknown as typeof fetch)).toMatchObject({ ok: false, retry: true });
    const down = vi.fn(async () => { throw new Error("socket hang up"); });
    expect(await sendSms(cfg, "+15551234567", "x", null, down as unknown as typeof fetch)).toMatchObject({ ok: false, code: "network", retry: true });
    expect(await sendSms(cfg, "555-1234", "x", null, busy as unknown as typeof fetch)).toMatchObject({ ok: false, code: "21211" });
  });
  it("maps delivery statuses and explains errors", () => {
    expect(mapStatus("accepted")?.status).toBe("sent");
    expect(mapStatus("delivered")?.rank).toBe(2);
    expect(mapStatus("failed")?.status).toBe("failed");
    expect(mapStatus("weird")).toBeNull();
    expect(explainError("30034")).toMatch(/10DLC/);
  });
});

describe("webhooks", () => {
  it("matches Twilio's documented signature example", () => {
    // From Twilio's webhook security documentation.
    const params = { CallSid: "CA1234567890ABCDE", Caller: "+12349013030", Digits: "1234", From: "+12349013030", To: "+18005551212" };
    expect(twilioSignature("12345", "https://mycompany.com/myapp.php?foo=1&bar=2", params)).toBe("0/KCTR6DLpKmkAf8muzZqo1nDgQ=");
  });
  it("rejects missing or forged signatures", () => {
    const p = { MessageSid: "SM1", MessageStatus: "delivered" };
    const good = twilioSignature(TOKEN, "https://queuedtogo.com/api/twilio/status", p);
    expect(validTwilioSignature(TOKEN, "https://queuedtogo.com/api/twilio/status", p, good)).toBe(true);
    expect(validTwilioSignature(TOKEN, "https://queuedtogo.com/api/twilio/status", { ...p, MessageStatus: "failed" }, good)).toBe(false);
    expect(validTwilioSignature(TOKEN, "https://evil.example/api/twilio/status", p, good)).toBe(false);
    expect(validTwilioSignature(TOKEN, "https://queuedtogo.com/api/twilio/status", p, null)).toBe(false);
  });
  it("recognises opt-out and opt-in replies", () => {
    expect(isStopWord(" stop ")).toBe(true);
    expect(isStopWord("Unsubscribe.")).toBe(true);
    expect(isStopWord("please stop by later")).toBe(false);
    expect(isStartWord("START")).toBe(true);
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
      return { data: hit.map((r) => ({ ...r, jobs: { number: 1001, tracking_token: "tok" }, customers: { name: "Lena Ortiz" }, organizations: { name: "Threadtogo" }, workflow_stages: { name: "Ready" } })), error: null };
    };
    const b: R = {
      select: () => { if (op === "update") returning = true; return b; },
      update: (p: R) => { op = "update"; patch = p; return b; },
      insert: (p: R) => { op = "insert"; patch = p; return b; },
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return b; },
      in: (k: string, v: unknown[]) => { filters.push((r) => v.includes(r[k])); return b; },
      not: (k: string, _o: string, v: unknown) => { filters.push((r) => r[k] !== v); return b; },
      order: () => b,
      limit: () => b,
      then: (res: (x: unknown) => unknown) => Promise.resolve(run()).then(res),
    };
    return b;
  };
  return { from } as never;
}
const queued = (id: string, extra: R = {}): R => ({ id, org_id: "o1", job_id: "j1", kind: "stage_update", channel: "sms", to_address: "+15551234567", template: "Hi {name}, {order} is ready: {link}", body: null, attempts: 0, status: "queued", created_at: new Date().toISOString(), customer_id: "c1", ...extra });

describe("sending queued texts", () => {
  it("sends, records the Twilio id and adds a history line", async () => {
    const tables = { messages: [queued("m1")], job_events: [] as R[] };
    const f = vi.fn(async () => new Response(JSON.stringify({ sid: "SM" + "2".repeat(32), status: "accepted" }), { status: 201 }));
    const r = await dispatchQueued({ orgId: "o1" }, { admin: fakeAdmin(tables), cfg, fetchImpl: f as unknown as typeof fetch });
    expect(r.sent).toBe(1);
    expect(tables.messages[0]).toMatchObject({ status: "sent", provider_sid: "SM" + "2".repeat(32), attempts: 1 });
    expect(String(tables.messages[0].body)).toMatch(/^Hi Lena, QTG-1001 is ready: .*\/t\/tok Reply STOP to opt out\.$/);
    expect(tables.job_events[0]).toMatchObject({ type: "notification", idempotency_key: "message:m1" });
  });
  it("never sends the same text twice", async () => {
    const tables = { messages: [queued("m1", { status: "sending" })], job_events: [] as R[] };
    const f = vi.fn();
    await dispatchQueued({ orgId: "o1" }, { admin: fakeAdmin(tables), cfg, fetchImpl: f as unknown as typeof fetch });
    expect(f).not.toHaveBeenCalled();
  });
  it("retries temporary failures, then gives up with a reason", async () => {
    const tables = { messages: [queued("m1")], job_events: [] as R[] };
    const f = vi.fn(async () => new Response("{}", { status: 503 }));
    const deps = { admin: fakeAdmin(tables), cfg, fetchImpl: f as unknown as typeof fetch };
    await dispatchQueued({ orgId: "o1" }, deps);
    expect(tables.messages[0].status).toBe("queued");
    await dispatchQueued({ orgId: "o1" }, deps);
    await dispatchQueued({ orgId: "o1" }, deps);
    expect(tables.messages[0]).toMatchObject({ status: "failed", attempts: 3 });
    expect(f).toHaveBeenCalledTimes(3);
  });
  it("turns off updates for a customer who replied STOP", async () => {
    const tables = { messages: [queued("m1")], job_events: [] as R[], customers: [{ id: "c1", phone: "+15551234567", consent_updates: true }] };
    const f = vi.fn(async () => new Response(JSON.stringify({ code: 21610, message: "unsubscribed" }), { status: 400 }));
    await dispatchQueued({ orgId: "o1" }, { admin: fakeAdmin(tables), cfg, fetchImpl: f as unknown as typeof fetch });
    expect(tables.messages[0]).toMatchObject({ status: "failed", error_code: "21610" });
    expect(tables.customers[0].consent_updates).toBe(false);
  });
  it("doesn't pretend to send when Twilio isn't set up, and drops stale texts", async () => {
    const tables = { messages: [queued("m1"), queued("m2", { created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() })], job_events: [] as R[] };
    await dispatchQueued({ orgId: "o1", ids: ["m1"] }, { admin: fakeAdmin(tables), cfg: null });
    expect(tables.messages[0]).toMatchObject({ status: "skipped", skip_reason: "Texting isn't connected to Twilio yet." });
    const f = vi.fn();
    await dispatchQueued({ orgId: "o1" }, { admin: fakeAdmin(tables), cfg, fetchImpl: f as unknown as typeof fetch });
    expect(tables.messages[1]).toMatchObject({ status: "skipped" });
    expect(f).not.toHaveBeenCalled();
  });
});
