import type { Metadata } from "next";
import { SiteShell } from "@/components/SiteShell";
import "./globals.css";

const siteUrl = "https://runplayback.com";
const siteDescription = "Real EV reviews. Smarter purchases.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "RunPlayBack - Real EV Reviews",
    template: "%s | RunPlayBack",
  },
  description: siteDescription,
  keywords: [
    "RunPlayBack",
    "EV lifestyle",
    "electric bike reviews",
    "electric scooter reviews",
    "electric mini bike",
    "e-bike accessories",
    "battery tips",
    "YouTube EV channel",
  ],
  alternates: {
    canonical: "/",
    types: {
      "application/rss+xml": "/rss.xml",
    },
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "RunPlayBack",
    title: "RunPlayBack - Real EV Reviews",
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    creator: "@runplayback",
    title: "RunPlayBack - Real EV Reviews",
    description: siteDescription,
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
