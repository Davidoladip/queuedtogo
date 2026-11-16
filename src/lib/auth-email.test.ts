import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
import { POST } from "@/app/api/auth/email/route";
import { authEmail } from "@/lib/email";

const SECRET_B64 = Buffer.from("a-test-secret-that-is-long-enough-123").toString("base64");
function signed(body: string, opts: { secret?: string; ts?: number } = {}) {
  const id = "msg_123";
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", Buffer.from(opts.secret ?? SECRET_B64, "base64")).update(`${id}.${ts}.${body}`).digest("base64");
  return new Request("https://queuedtogo.com/api/auth/email", { method: "POST", body, headers: { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": `v1,${sig}` } });
}
const payload = (o: Record<string, unknown> = {}) => JSON.stringify({
  user: { email: "new@example.com" },
  email_data: { token: "123456", token_hash: "pkce_abcdef1234567890", redirect_to: "https://queuedtogo.com/auth/confirm?next=%2Fonboarding", email_action_type: "signup", ...o },
});

describe("account emails through the Supabase hook", () => {
  const sent: { body: string }[] = [];
  beforeEach(() => {
    vi.stubEnv("SEND_EMAIL_HOOK_SECRET", `v1,whsec_${SECRET_B64}`);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://queuedtogo.com");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC" + "0".repeat(32));
    vi.stubEnv("TWILIO_AUTH_TOKEN", "t".repeat(32));
    vi.stubEnv("EMAIL_FROM", "QueuedToGo <updates@queuedtogo.com>");
    sent.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => { sent.push({ body: String(init.body) }); return new Response(JSON.stringify({ operation_id: "op_1" }), { status: 202 }); }));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("sends a QueuedToGo-branded confirmation with a link back to queuedtogo.com", async () => {
    const res = await POST(signed(payload()));
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    const b = sent[0].body;
    expect(b).toContain("new@example.com");
    expect(b).toContain("Confirm your email for QueuedToGo");
    expect(b).toContain("https://queuedtogo.com/auth/confirm?token_hash=pkce_abcdef1234567890&type=signup&next=%2Fonboarding");
    expect(b).not.toMatch(/supabase/i);
  });
  it("sends password resets to the reset page", async () => {
    await POST(signed(payload({ email_action_type: "recovery", redirect_to: "https://queuedtogo.com/auth/confirm?next=/reset-password" })));
    expect(sent[0].body).toContain("type=recovery&next=%2Freset-password");
  });
  it("never links off-site, whatever redirect Supabase passes", async () => {
    await POST(signed(payload({ redirect_to: "https://evil.com/auth/confirm?next=https://evil.com" })));
    expect(sent[0].body).toContain("next=%2Fonboarding");
    expect(sent[0].body).not.toContain("evil.com");
  });
  it("refuses unsigned, wrongly signed or stale requests", async () => {
    expect((await POST(new Request("https://x", { method: "POST", body: payload() }))).status).toBe(401);
    expect((await POST(signed(payload(), { secret: Buffer.from("wrong-secret-wrong-secret-wrong").toString("base64") }))).status).toBe(401);
    expect((await POST(signed(payload(), { ts: Math.floor(Date.now() / 1000) - 3600 }))).status).toBe(401);
    expect(sent).toHaveLength(0);
  });
  it("refuses email types QueuedToGo doesn't use", async () => {
    expect((await POST(signed(payload({ email_action_type: "email_change" })))).status).toBe(400);
  });
  it("words each email plainly", () => {
    expect(authEmail("recovery", { link: "https://q/x" }).subject).toBe("Reset your QueuedToGo password");
    expect(authEmail("signup", { link: "https://q/x" }).html).toContain("Confirm email");
  });
});
