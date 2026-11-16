import { headers } from "next/headers";

/** Only allow redirects to paths on this site ("/w/acme"), never to other sites ("//evil.com"). */
export function safeNext(next: unknown, fallback = "/"): string {
  if (typeof next !== "string" || next.length > 2048 || !next.startsWith("/")) return fallback;
  // Browsers drop tabs and newlines inside URLs and read "\\" as "/", so "/\t/evil.com" becomes "//evil.com".
  // Reject control characters and backslashes outright, then check the path really stays on this site.
  if (/[\u0000-\u001F\u007F\\]/.test(next) || next.startsWith("//")) return fallback;
  try {
    const base = "https://queuedtogo.invalid";
    const u = new URL(next, base);
    const out = `${u.pathname}${u.search}${u.hash}`;
    // "/.//evil.com" normalises to "//evil.com": check the cleaned-up path too.
    if (u.origin !== base || out.startsWith("//")) return fallback;
    return out;
  } catch {
    return fallback;
  }
}

/** The public address of the app, for links in emails and invitations. */
export async function siteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
