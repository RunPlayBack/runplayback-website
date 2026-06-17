import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleCard } from "@/components/ArticleCard";
import {
  articleCategories,
  getArticleCategoryBySlug,
  getArticlesForCategory,
} from "@/lib/article-categories";
import { getPublishedArticles } from "@/lib/articles";

export const dynamic = "force-dynamic";

type CategoryPageProps = {
  params: Promise<{
    category: string;
  }>;
  searchParams?: Promise<{
    page?: string;
  }>;
};

const articlesPerPage = 9;

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

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { category: categorySlug } = await params;
  const category = getArticleCategoryBySlug(categorySlug);

  if (!category) {
    return {};
  }

  return {
    title: `${category.label} Reviews`,
    description: category.description,
    alternates: {
      canonical: `/articles/categories/${category.slug}`,
    },
    openGraph: {
      title: `RunPlayBack ${category.label} Reviews`,
      description: category.description,
      url: `/articles/categories/${category.slug}`,
    },
  };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { category: categorySlug } = await params;
  const resolvedSearchParams = await searchParams;
  const category = getArticleCategoryBySlug(categorySlug);

  if (!category) {
    notFound();
  }

  const articles = await getPublishedArticles();
  const categoryArticles = getArticlesForCategory(articles, category.slug);
  const totalPages = Math.max(1, Math.ceil(categoryArticles.length / articlesPerPage));
  const currentPage = getPageNumber(resolvedSearchParams?.page, totalPages);
  const startIndex = (currentPage - 1) * articlesPerPage;
  const visibleArticles = categoryArticles.slice(
    startIndex,
    startIndex + articlesPerPage,
  );
  const firstVisibleArticle = categoryArticles.length ? startIndex + 1 : 0;
  const lastVisibleArticle = Math.min(
    startIndex + articlesPerPage,
    categoryArticles.length,
  );
  const paginationItems = getPaginationItems(currentPage, totalPages);
  const categoryPath = `/articles/categories/${category.slug}`;

  return (
    <main className="page">
      <div className="legacy-page category-page">
        <div className="page-kicker">
          <span>Reviews</span>
        </div>
        <nav className="category-nav" aria-label="Review categories">
          {articleCategories.map((item) => (
            <Link
              aria-current={item.slug === category.slug ? "page" : undefined}
              href={`/articles/categories/${item.slug}`}
              key={item.slug}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <section className="category-hero">
          <p className="eyebrow">Category</p>
          <h1>{category.label}</h1>
          <p>{category.description}</p>
          <Link className="button secondary-button" href="/articles">
            All Reviews
          </Link>
        </section>
        {categoryArticles.length ? (
          <div className="article-list-header">
            <p>
              Showing {firstVisibleArticle}-{lastVisibleArticle} of{" "}
              {categoryArticles.length}{" "}
              {categoryArticles.length === 1 ? "review" : "reviews"}
            </p>
            <p>
              Page {currentPage} of {totalPages}
            </p>
          </div>
        ) : null}
        <div className="article-grid">
          {visibleArticles.length ? (
            visibleArticles.map((article) => (
              <ArticleCard article={article} key={article.id} showCategory={false} />
            ))
          ) : (
            <div className="admin-card">
              <h2>No reviews yet</h2>
              <p>This category will fill automatically as matching reviews are published.</p>
            </div>
          )}
        </div>
        {totalPages > 1 ? (
          <nav className="article-pagination" aria-label={`${category.label} review pages`}>
            {currentPage > 1 ? (
              <Link
                className="button secondary-button"
                href={
                  currentPage === 2
                    ? categoryPath
                    : `${categoryPath}?page=${currentPage - 1}`
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
                    href={pageNumber === 1 ? categoryPath : `${categoryPath}?page=${pageNumber}`}
                    key={pageNumber}
                  >
                    {pageNumber}
                  </Link>
                );
              })}
              <form action={categoryPath} className="article-page-jump" method="get">
                <label htmlFor="category-page-jump">Page</label>
                <input
                  defaultValue={currentPage}
                  id="category-page-jump"
                  max={totalPages}
                  min="1"
                  name="page"
                  type="number"
                />
                <button type="submit">Go</button>
              </form>
            </div>
            {currentPage < totalPages ? (
              <Link className="button" href={`${categoryPath}?page=${currentPage + 1}`}>
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
