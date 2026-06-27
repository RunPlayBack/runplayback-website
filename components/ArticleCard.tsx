import Link from "next/link";
import type { PublicArticle } from "@/lib/articles";
import { getArticleCategory } from "@/lib/article-categories";

type ArticleCardProps = {
  article: PublicArticle;
  showCategory?: boolean;
};

export function formatArticleDate(value: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export function ArticleCard({ article, showCategory = true }: ArticleCardProps) {
  const category = getArticleCategory(article);

  return (
    <article className="article-card">
      {article.featuredImageUrl ? (
        <Link
          aria-label={`Read ${article.title}`}
          href={`/articles/${article.slug}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          <img src={article.featuredImageUrl} alt="" />
        </Link>
      ) : null}
      {showCategory ? (
        <Link
          className="category-link"
          href={`/articles/categories/${category.slug}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          {category.label}
        </Link>
      ) : null}
      <h3>
        <Link
          href={`/articles/${article.slug}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          {article.title}
        </Link>
      </h3>
      {article.displayPublishedAt ? (
        <p className="article-date">{formatArticleDate(article.displayPublishedAt)}</p>
      ) : null}
      <p>{article.seoDescription}</p>
      <div className="tag-list">
        <span className="status published">published</span>
      </div>
    </article>
  );
}
