import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { buildCsp, cspHeaderName } from "@/lib/csp";

export async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", dev: process.env.NODE_ENV === "development", enforce: process.env.CSP_ENFORCE === "on",
    framable: /^\/demo(\/|$)/.test(request.nextUrl.pathname),
  });
  const name = cspHeaderName();
  // Next.js reads the nonce from the request's policy header and puts it on its own scripts.
  const response = await updateSession(request, { "x-nonce": nonce, [name]: csp });
  response.headers.set(name, csp);
  return response;
}

export const config = {
  matcher: [
    // Everything except static files, images, and webhooks (and link prefetches, which don't render HTML).
    {
      source: "/((?!_next/static|_next/image|favicon.ico|api/twilio/|api/cron/|api/stripe/|api/csp-report|api/auth/email|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }],
    },
  ],
};
