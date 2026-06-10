import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

const siteUrl = "https://runplayback.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "RunPlayBack - EV Lifestyle Tech Tips",
    template: "%s | RunPlayBack",
  },
  description:
    "RunPlayBack shares EV lifestyle tech tips, electric bike and scooter reviews, mini bike videos, battery advice, accessories, and real-world riding experience.",
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
    title: "RunPlayBack - EV Lifestyle Tech Tips",
    description:
      "EV lifestyle tech tips, electric bike and scooter reviews, mini bike videos, battery advice, accessories, and real-world riding experience.",
  },
  twitter: {
    card: "summary_large_image",
    creator: "@runplayback",
    title: "RunPlayBack - EV Lifestyle Tech Tips",
    description:
      "EV lifestyle tech tips, electric bike and scooter reviews, mini bike videos, battery advice, accessories, and real-world riding experience.",
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
};

const navItems = [
  { href: "/articles", label: "Reviews" },
  { href: "/partner", label: "Partner" },
  { href: "/popularvideos", label: "Popular Videos" },
  { href: "/search", label: "Search" },
  { href: "/contact", label: "Contact" },
];

type SocialPlatform = "facebook" | "instagram" | "x" | "youtube";

function SocialIcon({ platform }: { platform: SocialPlatform }) {
  if (platform === "youtube") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path
          d="M21.6 7.2c-.2-.8-.9-1.4-1.7-1.6C18.4 5.2 12 5.2 12 5.2s-6.4 0-7.9.4c-.8.2-1.5.8-1.7 1.6C2 8.7 2 12 2 12s0 3.3.4 4.8c.2.8.9 1.4 1.7 1.6 1.5.4 7.9.4 7.9.4s6.4 0 7.9-.4c.8-.2 1.5-.8 1.7-1.6.4-1.5.4-4.8.4-4.8s0-3.3-.4-4.8ZM10 15.3V8.7l5.8 3.3L10 15.3Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (platform === "instagram") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path
          d="M8 2h8c3.3 0 6 2.7 6 6v8c0 3.3-2.7 6-6 6H8c-3.3 0-6-2.7-6-6V8c0-3.3 2.7-6 6-6Zm0 2.2C5.9 4.2 4.2 5.9 4.2 8v8c0 2.1 1.7 3.8 3.8 3.8h8c2.1 0 3.8-1.7 3.8-3.8V8c0-2.1-1.7-3.8-3.8-3.8H8Zm4 4.1A3.7 3.7 0 1 1 12 15.7 3.7 3.7 0 0 1 12 8.3Zm0 2.2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm4.1-2.6a1 1 0 1 1 1-1 1 1 0 0 1-1 1Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (platform === "facebook") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path
          d="M14.2 8.1V6.7c0-.7.5-1.1 1.2-1.1h1.5V3h-2.2c-2.6 0-4.1 1.5-4.1 4v1.1H8v3h2.6V21h3.6v-9.9h2.5l.5-3h-3Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M4 4h4.4l3.9 5.2L16.8 4H20l-6.1 7.1L20.5 20h-4.4l-4.3-5.8L6.8 20H3.5l6.7-7.8L4 4Zm3.1 2 10 12h1.3L8.4 6H7.1Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: "RunPlayBack",
        url: siteUrl,
        description:
          "RunPlayBack covers electric bikes, scooters, mini bikes, battery safety, EV accessories, and real-world riding.",
        sameAs: [
          "https://www.youtube.com/runplayback",
          "https://www.instagram.com/runplayback",
          "https://www.facebook.com/runplayback",
          "https://twitter.com/runplayback",
        ],
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: "RunPlayBack",
        description: "EV Lifestyle Tech Tips",
        publisher: {
          "@id": `${siteUrl}/#organization`,
        },
        potentialAction: {
          "@type": "SearchAction",
          target: `${siteUrl}/search?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };

  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <header className="site-header">
          <Link className="brand" href="/" aria-label="RunPlayBack home">
            RunPlayBack
          </Link>
          <p className="tagline">EV Lifestyle Tech Tips</p>
          <nav className="site-nav" aria-label="Main navigation">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        {children}
        <footer className="site-footer">
          <div className="social-row" aria-label="Social links">
            <a
              href="https://www.youtube.com/runplayback"
              aria-label="YouTube"
              rel="noopener noreferrer"
              target="_blank"
            >
              <SocialIcon platform="youtube" />
            </a>
            <a
              href="http://instagram.com/runplayback"
              aria-label="Instagram"
              rel="noopener noreferrer"
              target="_blank"
            >
              <SocialIcon platform="instagram" />
            </a>
            <a
              href="http://www.facebook.com/runplayback"
              aria-label="Facebook"
              rel="noopener noreferrer"
              target="_blank"
            >
              <SocialIcon platform="facebook" />
            </a>
            <a
              href="http://twitter.com/runplayback"
              aria-label="X"
              rel="noopener noreferrer"
              target="_blank"
            >
              <SocialIcon platform="x" />
            </a>
          </div>
          <Link className="admin-link" href="/admin/login">
            Admin
          </Link>
        </footer>
      </body>
    </html>
  );
}
