import type { MetadataRoute } from "next";
import { LEGAL } from "@/lib/legal";
import { SITE_URL } from "@/lib/site";

/** Public, indexable pages only (demos and business order forms are noindex, so they are left out). */
export default function sitemap(): MetadataRoute.Sitemap {
  const legal = new Date(LEGAL.updated);
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/signup`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/login`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms-of-service`, lastModified: new Date(LEGAL.tosUpdated), changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, lastModified: new Date(LEGAL.privacyUpdated), changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, lastModified: legal, changeFrequency: "yearly", priority: 0.2 },
  ];
}
