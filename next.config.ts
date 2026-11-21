import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Other sites' windows can't script ours (popups we open, like Google sign-in, still work).
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // No source maps in the browser bundle (they would publish the original source).
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Nothing can be framed, except the demo forms, which the homepage shows inside phone frames. The page policy
      // (frame-ancestors) is set per request by the proxy: a static Content-Security-Policy here would replace it on
      // Vercel, both the request header Next reads the nonce from and the policy the browser gets.
      { source: "/:path((?!demo(?:/|$)).*)", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
      { source: "/demo", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] },
      { source: "/demo/:path*", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] },
    ];
  },
};

export default nextConfig;
