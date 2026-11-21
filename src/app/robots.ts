import type { MetadataRoute } from "next";
import { CRAWL_BLOCKED, SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  // Only production is indexable; preview deployments tell crawlers to stay out entirely.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: CRAWL_BLOCKED },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
