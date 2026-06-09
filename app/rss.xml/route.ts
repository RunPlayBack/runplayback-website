import { getPublishedArticles } from "@/lib/articles";

export const dynamic = "force-dynamic";

const siteUrl = "https://runplayback.com";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatRssDate(value: string | null) {
  return new Date(value || Date.now()).toUTCString();
}

export async function GET() {
  const articles = await getPublishedArticles();
  const items = articles
    .map((article) => {
      const articleUrl = `${siteUrl}/articles/${article.slug}`;

      return `<item>
        <title>${escapeXml(article.title)}</title>
        <link>${articleUrl}</link>
        <guid isPermaLink="true">${articleUrl}</guid>
        <pubDate>${formatRssDate(article.displayPublishedAt)}</pubDate>
        <description>${escapeXml(article.seoDescription)}</description>
      </item>`;
    })
    .join("");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>RunPlayBack Reviews</title>
    <link>${siteUrl}/articles</link>
    <atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml" />
    <description>Electric bike, scooter, mini bike, battery, accessory, and EV lifestyle reviews from RunPlayBack.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${items}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
