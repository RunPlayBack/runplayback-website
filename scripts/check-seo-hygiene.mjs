import { readFileSync } from "node:fs";

const checks = [];

function check(name, assertion) {
  checks.push({ name, assertion });
}

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const redirectsSource = read("lib/redirects.ts");
const sitemapSource = read("app/sitemap.ts");
const articlePageSource = read("app/articles/[slug]/page.tsx");
const categoryPageSource = read("app/articles/categories/[category]/page.tsx");
const adminLayoutSource = read("app/admin/layout.tsx");
const searchPageSource = read("app/search/page.tsx");

const redirectRules = [
  ...redirectsSource.matchAll(
    /source:\s*"([^"]+)"[\s\S]*?destination:\s*"([^"]+)"/g,
  ),
].map((match) => ({
  source: match[1],
  destination: match[2],
}));

check("redirect source paths are unique", () => {
  const sources = redirectRules.map((rule) => rule.source);
  return new Set(sources).size === sources.length;
});

check("redirects do not point to themselves", () =>
  redirectRules.every((rule) => rule.source !== rule.destination),
);

check("sitemap does not include admin URLs", () =>
  !sitemapSource.includes('"/admin') && !sitemapSource.includes("'/admin"),
);

check("sitemap does not include API URLs", () =>
  !sitemapSource.includes('"/api') && !sitemapSource.includes("'/api"),
);

check("sitemap only reads published articles", () =>
  sitemapSource.includes("getPublishedArticles"),
);

check("sitemap filters low-count categories", () =>
  sitemapSource.includes("minimumIndexedCategoryArticles") &&
  sitemapSource.includes("getArticlesForCategory"),
);

check("article pages define canonical URLs", () =>
  articlePageSource.includes("canonical: `/articles/${article.slug}`"),
);

check("missing article pages are noindex", () =>
  articlePageSource.includes("Review not found") &&
  articlePageSource.includes("index: false"),
);

check("category pages use the category index threshold", () =>
  categoryPageSource.includes("minimumIndexedCategoryArticles") &&
  categoryPageSource.includes("robots:"),
);

check("admin pages are noindex", () =>
  adminLayoutSource.includes("index: false") &&
  adminLayoutSource.includes("follow: false"),
);

check("search query pages are noindex", () =>
  searchPageSource.includes("canonical: \"/search\"") &&
  searchPageSource.includes("index: false"),
);

const failures = checks.filter((item) => !item.assertion());

if (failures.length) {
  console.error("SEO hygiene checks failed:");
  for (const failure of failures) {
    console.error(`- ${failure.name}`);
  }
  process.exit(1);
}

console.log(`SEO hygiene checks passed (${checks.length}/${checks.length}).`);
