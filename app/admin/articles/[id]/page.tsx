import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/AdminLayout";
import { articleCategories, getArticleCategory } from "@/lib/article-categories";
import type { PublicArticle } from "@/lib/articles";
import { createClient } from "@/lib/supabase/server";
import {
  addProductImagesToArticle,
  deleteArticle,
  publishArticle,
  saveArticle,
  unpublishArticle,
  uploadFeaturedImage,
} from "../actions";

type AdminArticleEditorPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    error?: string;
    featuredImageUpdated?: string;
    published?: string;
    imagesUpdated?: string;
    saved?: string;
    unpublished?: string;
  }>;
};

type AdminArticle = {
  id: string;
  title: string;
  slug: string;
  seo_title: string | null;
  seo_description: string | null;
  featured_image_url: string | null;
  author_name: string | null;
  category_slug: string | null;
  content: string;
  status: "draft" | "published";
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

function getStatusMessage(searchParams?: {
  error?: string;
  featuredImageUpdated?: string;
  published?: string;
  imagesUpdated?: string;
  saved?: string;
  unpublished?: string;
}) {
  if (searchParams?.error) {
    return { className: "form-error", text: searchParams.error };
  }

  if (searchParams?.saved) {
    return { className: "form-success", text: "Draft saved." };
  }

  if (searchParams?.published) {
    return { className: "form-success", text: "Review published." };
  }

  if (searchParams?.imagesUpdated) {
    return { className: "form-success", text: "Product images updated." };
  }

  if (searchParams?.featuredImageUpdated) {
    return { className: "form-success", text: "Featured image uploaded." };
  }

  if (searchParams?.unpublished) {
    return { className: "form-success", text: "Review moved back to draft." };
  }

  return null;
}

export default async function AdminArticleEditorPage({
  params,
  searchParams,
}: AdminArticleEditorPageProps) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const supabase = await createClient();

  if (!supabase) {
    notFound();
  }

  const { data: article, error } = await supabase
    .from("articles")
    .select(
      "id,title,slug,seo_title,seo_description,featured_image_url,author_name,category_slug,content,status,published_at,videos(published_at,title,video_url,youtube_video_id)",
    )
    .eq("id", id)
    .single<AdminArticle>();

  if (error || !article) {
    notFound();
  }

  const saveArticleWithId = saveArticle.bind(null, article.id);
  const uploadFeaturedImageWithId = uploadFeaturedImage.bind(null, article.id);
  const addProductImagesToArticleWithId = addProductImagesToArticle.bind(
    null,
    article.id,
  );
  const publishArticleWithId = publishArticle.bind(null, article.id);
  const unpublishArticleWithId = unpublishArticle.bind(null, article.id);
  const deleteArticleWithId = deleteArticle.bind(null, article.id);
  const statusMessage = getStatusMessage(resolvedSearchParams);
  const video = Array.isArray(article.videos) ? article.videos[0] : article.videos;
  const automaticCategory = getArticleCategory({
    authorName: article.author_name || "RunPlayBack",
    categorySlug: null,
    content: article.content,
    articleType: null,
    displayPublishedAt: video?.published_at || article.published_at,
    featuredImageUrl: article.featured_image_url || "",
    id: article.id,
    links: [],
    publishedAt: article.published_at,
    sourceArticles: [],
    seoDescription: article.seo_description || "",
    seoTitle: article.seo_title || article.title,
    slug: article.slug,
    status: article.status,
    title: article.title,
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

  return (
    <AdminLayout>
      <div className="admin-card">
        <p className="eyebrow">Review editor</p>
        <h1>{article.title}</h1>
        <div className="tag-list">
          <span className={`status ${article.status}`}>{article.status}</span>
          {article.published_at ? (
            <span className="tag">
              Published {new Date(article.published_at).toLocaleDateString()}
            </span>
          ) : null}
        </div>
      </div>
      {statusMessage ? (
        <p className={statusMessage.className}>{statusMessage.text}</p>
      ) : null}
      <form action={saveArticleWithId} className="admin-card form">
        <label>
          Title
          <input name="title" required defaultValue={article.title} />
        </label>
        <label>
          Slug
          <input name="slug" required defaultValue={article.slug} />
        </label>
        <label>
          SEO title
          <input name="seo_title" defaultValue={article.seo_title || article.title} />
        </label>
        <label>
          SEO description
          <textarea
            name="seo_description"
            defaultValue={article.seo_description || ""}
          />
        </label>
        <label>
          Featured image URL
          <input
            name="featured_image_url"
            placeholder="https://img.youtube.com/vi/video-id/hqdefault.jpg"
            defaultValue={article.featured_image_url || ""}
          />
        </label>
        <div className="featured-image-upload">
          {article.featured_image_url ? (
            <img src={article.featured_image_url} alt="" />
          ) : (
            <div className="featured-image-placeholder">No featured image yet</div>
          )}
          <label>
            Upload featured image
            <input
              accept="image/jpeg,image/png,image/webp"
              name="featured_image_file"
              type="file"
            />
          </label>
          <button
            className="button secondary-button"
            formAction={uploadFeaturedImageWithId}
            type="submit"
          >
            Upload Image
          </button>
        </div>
        <label>
          Author
          <select name="author_name" defaultValue={article.author_name || "RunPlayBack"}>
            <option value="RunPlayBack">RunPlayBack</option>
            <option value="Sully">Sully</option>
          </select>
        </label>
        <label>
          Category
          <select name="category_slug" defaultValue={article.category_slug || ""}>
            <option value="">Auto: {automaticCategory.label}</option>
            {articleCategories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Review content
          <textarea name="content" defaultValue={article.content} />
        </label>
        <div className="actions">
          <button className="button" type="submit">
            Save Draft
          </button>
        </div>
      </form>
      <div className="admin-card">
        <p className="meta">Review images</p>
        <p>
          Pull two product images from official product pages or Google image
          search and replace the current review images.
        </p>
        <form action={addProductImagesToArticleWithId}>
          <button className="button" type="submit">
            Update Product Images
          </button>
        </form>
      </div>
      <div className="admin-card">
        <p className="meta">Publish controls</p>
        <p>
          Publish makes this review available to the public review library.
          Unpublish moves it back to draft.
        </p>
        <div className="actions">
          <form action={publishArticleWithId}>
            <button className="button" type="submit">
              Publish
            </button>
          </form>
          <form action={unpublishArticleWithId}>
            <button className="button" type="submit">
              Unpublish
            </button>
          </form>
        </div>
      </div>
      <div className="admin-card danger-zone">
        <p className="meta">Danger zone</p>
        <p>
          Permanently delete this review from Supabase. This cannot be undone.
        </p>
        <form action={deleteArticleWithId}>
          <button className="button danger-button" type="submit">
            Delete Review
          </button>
        </form>
      </div>
    </AdminLayout>
  );
}
