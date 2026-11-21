import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { buildCsp, cspHeaderName } from "@/lib/csp";

export async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", dev: process.env.NODE_ENV === "development", enforce: process.env.CSP_ENFORCE === "on",
    framable: /^\/demo(\/|$)/.test(request.nextUrl.pathname),
  });
  const name = cspHeaderName();
  // Next.js reads the nonce from the request's policy header and puts it on its own scripts. The request always
  // carries it as Content-Security-Policy (the name Next reads first; the report-only name alone was not reaching
  // the renderer on Vercel, so pages went out without nonces); the browser gets the header named by CSP_ENFORCE.
  const response = await updateSession(request, { "x-nonce": nonce, "content-security-policy": csp });
  response.headers.set(name, csp);
  return response;
}

export const config = {
  matcher: [
    // Everything except static files, images, and webhooks (and link prefetches, which don't render HTML).
    {
      source: "/((?!_next/static|_next/image|favicon.ico|api/twilio/|api/cron/|api/stripe/|api/payments/square/webhook|api/csp-report|api/auth/email|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }],
    },
  ],
};
