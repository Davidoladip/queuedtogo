/** The canonical public address of the site (no trailing slash), for SEO files and structured data. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://queuedtogo.com").replace(/\/$/, "");

/** Not pages at all (API, auth callbacks, dev tools): crawlers are asked not to fetch them. */
export const CRAWL_BLOCKED = ["/api/", "/auth/", "/dev/"];

/**
 * Signed-in, per-person or one-off link pages. They are NOT blocked in robots.txt, so a crawler that follows a
 * shared link can fetch them and see the noindex (sent as an X-Robots-Tag header, see next.config.ts); a blocked
 * URL can still be indexed from links alone.
 */
export const NOINDEX_PATHS = ["/w/:path*", "/pay/:path*", "/t/:path*", "/r/:path*", "/invite/:path*", "/onboarding", "/reset-password", "/forgot-password", "/f/:path*", "/demo/:path*", "/demo"];
