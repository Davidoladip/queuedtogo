import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { adminClient } from "@/lib/supabase/admin";

/** The visitor's IP address, as Vercel reports it. Used only to make keyed hashes, never stored as-is. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "").trim();
}

/** A keyed hash, so IPs and emails used for rate limits can't be read back. Uses its own secret. */
export function keyedHash(value: string, scope: string): string {
  const salt = process.env.SUBMISSION_IP_SALT || process.env.SUPABASE_SECRET_KEY || "local-dev-only";
  return createHmac("sha256", salt).update(`${scope}|${value}`).digest("hex");
}

/**
 * Take one use of a rate limit (max uses per window). Returns false when the limit is reached.
 * If the database can't be reached the request is allowed (Supabase's own limits still apply).
 */
export async function takeRateLimit(scope: string, value: string, max: number, windowSeconds: number): Promise<boolean> {
  if (!value) return true;
  const admin = adminClient();
  if (!admin) return true;
  const { data, error } = await admin.rpc("rate_limit_take", { p_key: `${scope}:${keyedHash(value.toLowerCase(), scope)}`, p_max: max, p_window_seconds: windowSeconds });
  if (error) {
    console.error("rate limit", scope, error.message);
    return true;
  }
  return data === true;
}

/** Cloudflare Turnstile is on only when both keys are set. */
export const botCheckOn = () => !!process.env.TURNSTILE_SECRET_KEY && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * Checks the Turnstile token a form sent ("cf-turnstile-response"). Passes when Turnstile isn't set up.
 * A token Cloudflare rejects fails; if Cloudflare can't be reached, the visitor is let through
 * (orders at a live event matter more, and the rate limits still apply).
 */
export async function passesBotCheck(fd: FormData, ip: string): Promise<boolean> {
  if (!botCheckOn()) return true;
  const token = String(fd.get("cf-turnstile-response") ?? "");
  if (!token || token.length > 2048) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token, ...(ip ? { remoteip: ip } : {}) }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return true;
    const j = (await res.json()) as { success?: boolean };
    return j.success === true;
  } catch (e) {
    console.error("bot check unreachable", e instanceof Error ? e.message : e);
    return true;
  }
}

export const BOT_MESSAGE = "We couldn't check that you're a person. Reload the page and try again.";
export const SLOW_DOWN = "Too many tries from your connection. Wait a few minutes and try again.";
