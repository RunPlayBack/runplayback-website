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
};

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

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { category: categorySlug } = await params;
  const category = getArticleCategoryBySlug(categorySlug);

  if (!category) {
    notFound();
  }

  const articles = await getPublishedArticles();
  const categoryArticles = getArticlesForCategory(articles, category.slug);

  return (
    <main className="page">
      <div className="legacy-page">
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
        <div className="article-list-header">
          <p>
            {categoryArticles.length} {categoryArticles.length === 1 ? "review" : "reviews"}
          </p>
          <p>{category.label}</p>
        </div>
        <div className="article-grid">
          {categoryArticles.length ? (
            categoryArticles.map((article) => (
              <ArticleCard article={article} key={article.id} showCategory={false} />
            ))
          ) : (
            <div className="admin-card">
              <h2>No reviews yet</h2>
              <p>This category will fill automatically as matching reviews are published.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
