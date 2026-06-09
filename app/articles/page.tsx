import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedArticles } from "@/lib/articles";

export const dynamic = "force-dynamic";

const articlesPerPage = 9;

type ArticlesPageProps = {
  searchParams?: Promise<{
    page?: string;
  }>;
};

export const metadata: Metadata = {
  title: "Reviews",
  description:
    "RunPlayBack reviews created from EV lifestyle videos, captions, descriptions, affiliate links, and real-world riding experience.",
  alternates: {
    canonical: "/articles",
  },
  openGraph: {
    title: "RunPlayBack Reviews",
    description:
      "EV lifestyle reviews that complement RunPlayBack YouTube videos with searchable writeups, links, and real-world ride notes.",
    url: "/articles",
  },
};

function formatArticleDate(value: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function getPageNumber(value: string | undefined, totalPages: number) {
  const pageNumber = Number(value || "1");

  if (!Number.isFinite(pageNumber) || pageNumber < 1) {
    return 1;
  }

  return Math.min(Math.floor(pageNumber), totalPages);
}

function getPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "end-ellipsis", totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [
      1,
      "start-ellipsis",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [
    1,
    "start-ellipsis",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "end-ellipsis",
    totalPages,
  ];
}

export default async function ArticlesPage({ searchParams }: ArticlesPageProps) {
  const resolvedSearchParams = await searchParams;
  const articles = await getPublishedArticles();
  const featuredArticle = articles[0] || null;
  const listArticles = featuredArticle ? articles.slice(1) : articles;
  const totalPages = Math.max(1, Math.ceil(listArticles.length / articlesPerPage));
  const currentPage = getPageNumber(resolvedSearchParams?.page, totalPages);
  const startIndex = (currentPage - 1) * articlesPerPage;
  const visibleArticles = listArticles.slice(
    startIndex,
    startIndex + articlesPerPage,
  );
  const firstVisibleArticle = listArticles.length ? startIndex + 1 : 0;
  const lastVisibleArticle = Math.min(
    startIndex + articlesPerPage,
    listArticles.length,
  );
  const paginationItems = getPaginationItems(currentPage, totalPages);

  return (
    <main className="page">
      <div className="legacy-page">
        <div className="page-kicker">
          <span>Reviews</span>
          <span>⌄</span>
        </div>
        {featuredArticle && currentPage === 1 ? (
          <article className="featured-article">
            <p className="eyebrow">Latest Review</p>
            {featuredArticle.featuredImageUrl ? (
              <Link
                aria-label={`Read ${featuredArticle.title}`}
                href={`/articles/${featuredArticle.slug}`}
              >
                <img src={featuredArticle.featuredImageUrl} alt="" />
              </Link>
            ) : null}
            <h1>
              <Link href={`/articles/${featuredArticle.slug}`}>
                {featuredArticle.title}
              </Link>
            </h1>
            {featuredArticle.displayPublishedAt ? (
              <p className="article-date">
                {formatArticleDate(featuredArticle.displayPublishedAt)}
              </p>
            ) : null}
            <p>{featuredArticle.seoDescription}</p>
          </article>
        ) : null}
        {listArticles.length ? (
          <div className="article-list-header">
            <p>
              Showing {firstVisibleArticle}-{lastVisibleArticle} of{" "}
              {listArticles.length} reviews
            </p>
            <p>
              Page {currentPage} of {totalPages}
            </p>
          </div>
        ) : null}
        <div className="article-grid">
          {visibleArticles.length ? (
            visibleArticles.map((article) => (
              <article className="article-card" key={article.id}>
                {article.featuredImageUrl ? (
                  <Link
                    aria-label={`Read ${article.title}`}
                    href={`/articles/${article.slug}`}
                  >
                    <img src={article.featuredImageUrl} alt="" />
                  </Link>
                ) : null}
                <h3>
                  <Link href={`/articles/${article.slug}`}>{article.title}</Link>
                </h3>
                {article.displayPublishedAt ? (
                  <p className="article-date">
                    {formatArticleDate(article.displayPublishedAt)}
                  </p>
                ) : null}
                <p>{article.seoDescription}</p>
                <div className="tag-list">
                  <span className="status published">published</span>
                </div>
              </article>
            ))
          ) : (
            <div className="admin-card">
              <h2>No published reviews yet</h2>
              <p>Publish a review from the admin to show it here.</p>
            </div>
          )}
        </div>
        {totalPages > 1 ? (
          <nav className="article-pagination" aria-label="Review pages">
            {currentPage > 1 ? (
              <Link
                className="button secondary-button"
                href={
                  currentPage === 2
                    ? "/articles"
                    : `/articles?page=${currentPage - 1}`
                }
              >
                Previous
              </Link>
            ) : (
              <span />
            )}
            <div className="article-page-links">
              {paginationItems.map((item) => {
                if (typeof item === "string") {
                  return (
                    <span className="article-page-ellipsis" key={item}>
                      ...
                    </span>
                  );
                }

                const pageNumber = item;

                return (
                  <Link
                    aria-current={pageNumber === currentPage ? "page" : undefined}
                    className="article-page-link"
                    href={pageNumber === 1 ? "/articles" : `/articles?page=${pageNumber}`}
                    key={pageNumber}
                  >
                    {pageNumber}
                  </Link>
                );
              })}
              <form action="/articles" className="article-page-jump" method="get">
                <label htmlFor="article-page-jump">Page</label>
                <input
                  defaultValue={currentPage}
                  id="article-page-jump"
                  max={totalPages}
                  min="1"
                  name="page"
                  type="number"
                />
                <button type="submit">Go</button>
              </form>
            </div>
            {currentPage < totalPages ? (
              <Link className="button" href={`/articles?page=${currentPage + 1}`}>
                Next
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </div>
    </main>
  );
}
