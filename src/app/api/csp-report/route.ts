import { NextResponse } from "next/server";

/** Browsers post Content-Security-Policy violations here; they go to the logs (shortened, no cookies or bodies). */
export async function POST(req: Request) {
  try {
    const text = (await req.text()).slice(0, 4000);
    const body = JSON.parse(text) as { "csp-report"?: Record<string, unknown> } | Record<string, unknown>[];
    const reports = Array.isArray(body) ? body.map((r) => (r as { body?: Record<string, unknown> }).body ?? r) : [body["csp-report"] ?? body];
    for (const r of reports.slice(0, 5)) {
      const pick = (k: string) => String((r as Record<string, unknown>)[k] ?? "").slice(0, 200);
      console.warn("csp-violation", JSON.stringify({
        directive: pick("violated-directive") || pick("effectiveDirective"),
        blocked: pick("blocked-uri") || pick("blockedURL"),
        page: (pick("document-uri") || pick("documentURL")).replace(/\?.*$/, ""),
      }));
    }
  } catch {
    // Ignore malformed reports.
  }
  return new NextResponse(null, { status: 204 });
}
