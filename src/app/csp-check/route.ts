import { headers } from "next/headers";

export const dynamic = "force-dynamic";

/** Temporary diagnostic: which proxy-set request headers reach the renderer (names only, no values). */
export async function GET() {
  const h = await headers();
  const names = [...h.keys()].filter((k) => /nonce|security-policy|middleware/i.test(k));
  return Response.json({ xNonce: !!h.get("x-nonce"), csp: !!h.get("content-security-policy"), cspRO: !!h.get("content-security-policy-report-only"), names });
}
