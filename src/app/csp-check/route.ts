import { headers } from "next/headers";

export const dynamic = "force-dynamic";

/** Temporary diagnostic: shape of the proxy-set CSP request headers (directive names only). */
export async function GET() {
  const h = await headers();
  const shape = (v: string | null) => v && v.split(/[;,]/).map((d) => d.trim().split(/\s+/)[0]);
  return Response.json({
    csp: shape(h.get("content-security-policy")),
    cspRO: shape(h.get("content-security-policy-report-only")),
    hasNonceInCsp: /'nonce-/.test(h.get("content-security-policy") ?? ""),
  });
}
