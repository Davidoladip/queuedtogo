import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { SESSION_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";

/** Paths that need a signed-in user. Pages check again on the server; this only redirects early. */
const PROTECTED = [/^\/w(\/|$)/, /^\/onboarding(\/|$)/, /^\/reset-password(\/|$)/];

/**
 * Refreshes the Supabase session cookie on every request and redirects signed-out
 * visitors away from protected pages.
 */
export async function updateSession(request: NextRequest, extraRequestHeaders: Record<string, string> = {}) {
  // Headers for the page render: the request's own (with any refreshed cookies) plus the extras (CSP nonce).
  const forward = () => {
    const h = new Headers(request.headers);
    for (const [k, v] of Object.entries(extraRequestHeaders)) h.set(k, v);
    return { headers: h };
  };
  let response = NextResponse.next({ request: forward() });

  const supabase = createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: forward() });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Do not run code between createServerClient and getClaims: getClaims refreshes the session.
  let signedIn = false;
  try {
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims?.sub);
  } catch {
    signedIn = false;
  }

  const path = request.nextUrl.pathname;
  if (!signedIn && PROTECTED.some((re) => re.test(path))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", path + request.nextUrl.search);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return response;
}
