import Link from "next/link";
import { AdminLayout } from "@/components/AdminLayout";
import { articleCategories, getArticleCategory } from "@/lib/article-categories";
import type { PublicArticle } from "@/lib/articles";
import { createClient } from "@/lib/supabase/server";
import { generateComparisonBuyingGuide } from "./actions";

type GenerateArticlePageProps = {
  searchParams?: Promise<{
    error?: string;
    category?: string;
    page?: string;
    q?: string;
  }>;
};

type SourceArticleRow = {
  id: string;
  title: string;
  slug: string;
  seo_description: string | null;
  featured_image_url: string | null;
  author_name: string | null;
  category_slug: string | null;
  content: string;
  published_at: string | null;
  videos:
    | {
        published_at: string | null;
        title: string;
        video_url: string;
        youtube_video_id: string;
      }
    | Array<{
        published_at: string | null;
        title: string;
        video_url: string;
        youtube_video_id: string;
      }>
    | null;
};

type SourceImage = {
  altText: string;
  url: string;
};

const ARTICLES_PER_PAGE = 18;

function buildPageHref(page: number, query: string, categorySlug: string) {
  const params = new URLSearchParams();

  if (query) {
    params.set("q", query);
  }

  if (categorySlug) {
    params.set("category", categorySlug);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const queryString = params.toString();

  return queryString
    ? `/admin/generate-article?${queryString}`
    : "/admin/generate-article";
}

function getVideo(row: SourceArticleRow) {
  return Array.isArray(row.videos) ? row.videos[0] : row.videos;
}

function getAutomaticCategory(row: SourceArticleRow) {
  const video = getVideo(row);

  return getArticleCategory({
    authorName: row.author_name || "RunPlayBack",
    categorySlug: row.category_slug,
    content: row.content,
    articleType: null,
    displayPublishedAt: video?.published_at || row.published_at,
    featuredImageUrl: row.featured_image_url || "",
    id: row.id,
    links: [],
    publishedAt: row.published_at,
    sourceArticles: [],
    seoDescription: row.seo_description || "",
    seoTitle: row.title,
    slug: row.slug,
    status: "published",
    title: row.title,
    video: video
      ? {
          publishedAt: video.published_at,
          title: video.title,
          videoUrl: video.video_url,
          youtubeVideoId: video.youtube_video_id,
        }
      : null,
    videos: video
      ? [
          {
            publishedAt: video.published_at,
            title: video.title,
            videoUrl: video.video_url,
            youtubeVideoId: video.youtube_video_id,
          },
        ]
      : [],
  } satisfies PublicArticle);
}

export default async function GenerateArticlePage({
  searchParams,
}: GenerateArticlePageProps) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createClient();
  let articles: SourceArticleRow[] = [];
  let loadError = "";
  const query = (resolvedSearchParams?.q || "").trim();
  const selectedCategory = (resolvedSearchParams?.category || "").trim();
  const requestedPage = Math.max(
    1,
    Number.parseInt(resolvedSearchParams?.page || "1", 10) || 1,
  );

  if (supabase) {
    const { data, error } = await supabase
      .from("articles")
      .select(
        "id,title,slug,seo_description,featured_image_url,author_name,category_slug,content,published_at,videos(published_at,title,video_url,youtube_video_id)",
      )
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(600);

    articles = (data || []) as unknown as SourceArticleRow[];
    loadError = error?.message || "";
  }

  const filteredArticles = articles
    .map((article) => ({
      article,
      category: getAutomaticCategory(article),
    }))
    .filter(({ article, category }) => {
      const haystack = [
        article.title,
        article.slug,
        article.seo_description || "",
        category.label,
      ]
        .join(" ")
        .toLowerCase();
      const matchesQuery = !query || haystack.includes(query.toLowerCase());
      const matchesCategory =
        !selectedCategory || category.slug === selectedCategory;

      return matchesQuery && matchesCategory;
    });
  const totalPages = Math.max(
    1,
    Math.ceil(filteredArticles.length / ARTICLES_PER_PAGE),
  );
  const currentPage = Math.min(requestedPage, totalPages);
  const visibleArticles = filteredArticles.slice(
    (currentPage - 1) * ARTICLES_PER_PAGE,
    currentPage * ARTICLES_PER_PAGE,
  );
  const resultStart = filteredArticles.length
    ? (currentPage - 1) * ARTICLES_PER_PAGE + 1
    : 0;
  const resultEnd = Math.min(
    currentPage * ARTICLES_PER_PAGE,
    filteredArticles.length,
  );

  return (
    <AdminLayout>
      <div className="admin-card">
        <p className="eyebrow">Article generator</p>
        <h1>Comparison & Buying Guide Generator</h1>
        <p>
          Create Best Of and Versus drafts from existing published RunPlayBack
          reviews. Nothing publishes automatically.
        </p>
        <p>
          After a guide is generated, it opens in the normal review editor as a
          draft so you can review, edit, and publish it.
        </p>
      </div>
      {resolvedSearchParams?.error ? (
        <p className="form-error">{resolvedSearchParams.error}</p>
      ) : null}
      {loadError ? <p className="form-error">{loadError}</p> : null}
      <form className="admin-card form generator-filter-form">
        <div className="generator-filter-grid">
          <label>
            Search reviews
            <input
              defaultValue={query}
              name="q"
              placeholder="Search by product, title, or category"
              type="search"
            />
          </label>
          <label>
            Category
            <select name="category" defaultValue={selectedCategory}>
              <option value="">All categories</option>
              {articleCategories.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="actions">
          <button className="button" type="submit">
            Filter Reviews
          </button>
          <Link className="button secondary-button" href="/admin/generate-article">
            Clear
          </Link>
        </div>
      </form>
      <form action={generateComparisonBuyingGuide} className="admin-card form generator-form">
        <input name="category_slug" type="hidden" value={selectedCategory} />
        <div className="generator-grid">
          <label>
            Article type
            <select name="article_type" required defaultValue="best_of">
              <option value="best_of">Best Of</option>
              <option value="versus">Versus</option>
            </select>
          </label>
          <div className="generated-title-note">
            <span>Title</span>
            <strong>Generated automatically from the selected reviews</strong>
          </div>
        </div>
        <div className="generator-help">
          <p>
            For Best Of, select two or more reviews. For Versus, select exactly
            two reviews. Use the order field to control ranking or comparison
            order.
          </p>
          <p>
            Showing {resultStart}-{resultEnd} of {filteredArticles.length}{" "}
            reviews.
          </p>
        </div>
        <div className="source-article-list">
          {visibleArticles.map(({ article, category }, index) => {
            return (
              <article className="source-article-option source-article-compact" key={article.id}>
                <div className="source-article-header">
                  <label className="source-select source-select-compact">
                    <input
                      name="source_article_ids"
                      type="checkbox"
                      value={article.id}
                    />
                    {article.featured_image_url ? (
                      <img
                        alt=""
                        className="source-thumbnail"
                        src={article.featured_image_url}
                      />
                    ) : (
                      <span className="source-thumbnail source-thumbnail-empty">
                        No image
                      </span>
                    )}
                    <span>{article.title}</span>
                  </label>
                  <input
                    aria-label={`Order for ${article.title}`}
                    className="source-order"
                    min="1"
                    name={`order_${article.id}`}
                    type="number"
                    defaultValue={(currentPage - 1) * ARTICLES_PER_PAGE + index + 1}
                  />
                </div>
                <p className="meta">
                  {category.label} ·{" "}
                  <Link href={`/articles/${article.slug}`} target="_blank">
                    View review
                  </Link>
                </p>
              </article>
            );
          })}
        </div>
        {totalPages > 1 ? (
          <nav className="generator-pagination" aria-label="Review pages">
            {currentPage > 1 ? (
              <Link href={buildPageHref(currentPage - 1, query, selectedCategory)}>
                Previous
              </Link>
            ) : null}
            <span>
              Page {currentPage} of {totalPages}
            </span>
            {currentPage < totalPages ? (
              <Link href={buildPageHref(currentPage + 1, query, selectedCategory)}>
                Next
              </Link>
            ) : null}
          </nav>
        ) : null}
        <div className="actions">
          <button className="button" type="submit">
            Generate Draft
          </button>
        </div>
      </form>
    </AdminLayout>
  );
}
