import Link from "next/link";
import { getPublishedArticles } from "@/lib/articles";

type SearchPageProps = {
  searchParams?: Promise<{
    q?: string;
  }>;
};

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const resolvedSearchParams = await searchParams;
  const query = String(resolvedSearchParams?.q || "").trim();
  const normalizedQuery = normalizeSearchText(query);
  const articles = await getPublishedArticles();
  const matchingArticles = normalizedQuery
    ? articles
        .filter((article) =>
          [
            article.title,
            article.seoDescription,
            article.content,
            article.video?.title || "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery),
        )
        .slice(0, 24)
    : [];

  return (
    <main className="page">
      <div className="legacy-page">
        <div className="page-kicker">
          <span>Navigation</span>
          <span>⌄</span>
        </div>
        <form action="/search" className="search-box" method="get">
          <span className="search-icon">⌕</span>
          <input
            aria-label="Search RunPlayBack reviews"
            defaultValue={query}
            name="q"
            placeholder="Type to search…"
          />
          <button type="submit">Search</button>
        </form>
        {query ? (
          <section className="search-results">
            <h1>
              {matchingArticles.length
                ? `Results for “${query}”`
                : `No results for “${query}”`}
            </h1>
            {matchingArticles.length ? (
              <div className="search-result-list">
                {matchingArticles.map((article) => (
                  <article className="search-result" key={article.id}>
                    {article.featuredImageUrl ? (
                      <Link href={`/articles/${article.slug}`}>
                        <img src={article.featuredImageUrl} alt="" />
                      </Link>
                    ) : null}
                    <div>
                      <h2>
                        <Link href={`/articles/${article.slug}`}>
                          {article.title}
                        </Link>
                      </h2>
                      <p>{article.seoDescription}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="search-empty">
                Try searching for an e-bike, scooter, mini bike, battery, brand,
                or product name.
              </p>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
