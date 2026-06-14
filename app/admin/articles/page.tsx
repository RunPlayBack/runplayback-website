import Link from "next/link";
import { AdminLayout } from "@/components/AdminLayout";
import { articleCategories, getArticleCategory } from "@/lib/article-categories";
import type { PublicArticle } from "@/lib/articles";
import { createClient } from "@/lib/supabase/server";
import {
  createDraftArticle,
  publishAllDraftArticles,
  updateArticleCategory,
  updateArticleAuthor,
} from "./actions";

type AdminArticlesPageProps = {
  searchParams?: Promise<{
    deleted?: string;
    error?: string;
    authorUpdated?: string;
    categoryUpdated?: string;
    publishedAll?: string;
  }>;
};

type AdminArticle = {
  id: string;
  title: string;
  slug: string;
  seo_description: string | null;
  featured_image_url: string | null;
  author_name: string | null;
  category_slug: string | null;
  content: string;
  status: "draft" | "published";
  updated_at: string;
  videos:
    | {
        title: string;
      }
    | Array<{
        title: string;
      }>
    | null;
};

export default async function AdminArticlesPage({
  searchParams,
}: AdminArticlesPageProps) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createClient();
  let articles: AdminArticle[] = [];
  let errorMessage = resolvedSearchParams?.error;

  if (supabase) {
    const { data, error } = await supabase
      .from("articles")
      .select("id,title,slug,seo_description,featured_image_url,author_name,category_slug,content,status,updated_at,videos(title)")
      .order("updated_at", { ascending: false });

    if (error) {
      errorMessage = error.message;
    } else {
      articles = data || [];
    }
  }

  return (
    <AdminLayout>
      <div className="admin-card">
        <p className="eyebrow">Reviews</p>
        <h1>Drafts and published reviews</h1>
        <p>Review, edit, publish, and unpublish RunPlayBack reviews.</p>
        <div className="actions">
          <form action={createDraftArticle}>
            <button className="button" type="submit">
              Create Draft Review
            </button>
          </form>
          <form action={publishAllDraftArticles}>
            <button className="button" type="submit">
              Publish All Drafts
            </button>
          </form>
        </div>
      </div>
      {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      {resolvedSearchParams?.deleted ? (
        <p className="form-success">Review deleted.</p>
      ) : null}
      {resolvedSearchParams?.authorUpdated ? (
        <p className="form-success">Author updated.</p>
      ) : null}
      {resolvedSearchParams?.categoryUpdated ? (
        <p className="form-success">Category updated.</p>
      ) : null}
      {resolvedSearchParams?.publishedAll ? (
        <p className="form-success">
          {resolvedSearchParams.publishedAll === "0"
            ? "No draft reviews left to publish."
            : `Published ${resolvedSearchParams.publishedAll} draft review${
                resolvedSearchParams.publishedAll === "1" ? "" : "s"
              }.`}
        </p>
      ) : null}
      <div className="table-list">
        {articles.length ? (
          articles.map((article) => {
            const updateArticleAuthorWithId = updateArticleAuthor.bind(
              null,
              article.id,
            );
            const updateArticleCategoryWithId = updateArticleCategory.bind(
              null,
              article.id,
            );
            const video = Array.isArray(article.videos)
              ? article.videos[0]
              : article.videos;
            const automaticCategory = getArticleCategory({
              authorName: article.author_name || "RunPlayBack",
              categorySlug: null,
              content: article.content,
              displayPublishedAt: null,
              featuredImageUrl: article.featured_image_url || "",
              id: article.id,
              links: [],
              publishedAt: null,
              seoDescription: article.seo_description || "",
              seoTitle: article.title,
              slug: article.slug,
              status: article.status,
              title: article.title,
              video: video
                ? {
                    publishedAt: null,
                    title: video.title,
                    videoUrl: "",
                    youtubeVideoId: "",
                  }
                : null,
            } satisfies PublicArticle);

            return (
              <div className="table-row article-admin-row" key={article.id}>
                {article.featured_image_url ? (
                  <img
                    alt=""
                    className="article-admin-thumbnail"
                    src={article.featured_image_url}
                  />
                ) : (
                  <div className="article-admin-thumbnail-placeholder" />
                )}
                <div>
                  <strong>{article.title}</strong>
                  <p>{article.slug}</p>
                </div>
                <span className={`status ${article.status}`}>{article.status}</span>
                <form
                  action={updateArticleAuthorWithId}
                  className="quick-author-form"
                >
                  <label>
                    Author
                    <select
                      name="author_name"
                      defaultValue={article.author_name || "RunPlayBack"}
                    >
                      <option value="RunPlayBack">RunPlayBack</option>
                      <option value="Sully">Sully</option>
                    </select>
                  </label>
                  <button className="button secondary-button" type="submit">
                    Save
                  </button>
                </form>
                <form
                  action={updateArticleCategoryWithId}
                  className="quick-author-form"
                >
                  <label>
                    Category
                    <select
                      name="category_slug"
                      defaultValue={article.category_slug || ""}
                    >
                      <option value="">Auto: {automaticCategory.label}</option>
                      {articleCategories.map((category) => (
                        <option key={category.slug} value={category.slug}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="button secondary-button" type="submit">
                    Save
                  </button>
                </form>
                <Link className="button" href={`/admin/articles/${article.id}`}>
                  Edit
                </Link>
              </div>
            );
          })
        ) : (
          <div className="admin-card">
            <h2>No reviews yet</h2>
            <p>Create a draft review to start testing the review workflow.</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
