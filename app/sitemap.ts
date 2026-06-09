import type { MetadataRoute } from "next";
import { getPublishedArticles } from "@/lib/articles";

export const dynamic = "force-dynamic";

const siteUrl = "https://runplayback.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages = [
    "",
    "/partner",
    "/articles",
    "/popularvideos",
    "/search",
    "/contact",
  ];
  const articles = await getPublishedArticles();

  return [
    ...staticPages.map((path) => ({
      url: `${siteUrl}${path}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1 : 0.8,
    })),
    ...articles.map((article) => ({
      url: `${siteUrl}/articles/${article.slug}`,
      lastModified: article.displayPublishedAt
        ? new Date(article.displayPublishedAt)
        : new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
