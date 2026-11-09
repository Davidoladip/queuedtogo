import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://queuedtogo.com"),
  title: { default: "QueuedToGo", template: "%s · QueuedToGo" },
  openGraph: { type: "website", siteName: "QueuedToGo", images: [{ url: "/og.png", width: 1200, height: 630, alt: "QueuedToGo: order forms and updates for live events" }] },
  twitter: { card: "summary_large_image" },
  description: "Order forms for live events that turn every submission into a tracked production job.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-US">
      <head>
        {/* Loaded by the browser at runtime so builds don't depend on Google Fonts being reachable. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;500;600;700;800&family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600;700&family=Oswald:wght@400;500;600;700&family=Playfair+Display:wght@400;600;700;800&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
