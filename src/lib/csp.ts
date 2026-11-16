/**
 * Content-Security-Policy: which scripts, styles, images and connections a page may use. A script injected by an
 * attacker has no nonce, so it can't run. Sent as report-only until CSP_ENFORCE=on (violations are logged at
 * /api/csp-report), so a missed source can't break checkout or forms at a live event.
 */
export function buildCsp(nonce: string, opts: { supabaseUrl: string; dev: boolean; enforce?: boolean; framable?: boolean }): string {
  const supa = opts.supabaseUrl.replace(/\/$/, "");
  const supaWs = supa.replace(/^http/, "ws");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com https://accounts.google.com/gsi/client${opts.dev ? " 'unsafe-eval'" : ""}`,
    // Inline styles: the form designer writes per-form CSS and React sets style attributes.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
    "font-src 'self' data: https://fonts.gstatic.com",
    `img-src 'self' data: blob: ${supa}`,
    `connect-src 'self' ${supa} ${supaWs} https://challenges.cloudflare.com https://accounts.google.com/gsi/`,
    "frame-src 'self' https://challenges.cloudflare.com https://accounts.google.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    // Same rule as next.config: only the demo forms may be framed, and only by this site.
    `frame-ancestors ${opts.framable ? "'self'" : "'none'"}`,
    `form-action 'self' ${supa} https://checkout.stripe.com https://billing.stripe.com`,
    ...(opts.enforce ? ["upgrade-insecure-requests"] : []),
    "report-uri /api/csp-report",
  ].join("; ");
}

export const cspHeaderName = () => (process.env.CSP_ENFORCE === "on" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only");
