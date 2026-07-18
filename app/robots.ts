import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "AwarioBot",
        disallow: "/",
      },
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/admin/", "/admin/*", "/api", "/api/*"],
      },
    ],
    sitemap: [
      "https://runplayback.com/sitemap.xml",
      "https://runplayback.com/rss.xml",
    ],
  };
}
