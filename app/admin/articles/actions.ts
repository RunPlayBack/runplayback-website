"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  findArticleImageCandidates,
  insertArticleImages,
} from "@/lib/article-images";
import { articleCategories, getArticleCategoryBySlug } from "@/lib/article-categories";
import { createClient } from "@/lib/supabase/server";

function getString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function redirectWithError(path: string, error: unknown): never {
  const message = error instanceof Error ? error.message : "Unable to save changes.";
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

type ArticleImageSourceRow = {
  content: string;
  featured_image_url: string | null;
  slug: string;
  title: string;
  videos:
    | {
        description: string | null;
        title: string;
        youtube_video_id: string | null;
      }
    | Array<{
        description: string | null;
        title: string;
        youtube_video_id: string | null;
      }>
    | null;
};

type DraftArticlePublishRow = {
  id: string;
  slug: string;
  videos:
    | {
        published_at: string | null;
      }
    | Array<{
        published_at: string | null;
      }>
    | null;
};

function getCategorySlug(formData: FormData) {
  const categorySlug = getString(formData, "category_slug");

  if (!categorySlug) {
    return null;
  }

  if (!getArticleCategoryBySlug(categorySlug)) {
    throw new Error("Choose a valid category.");
  }

  return categorySlug;
}

function revalidateCategoryPages() {
  for (const category of articleCategories) {
    revalidatePath(`/articles/categories/${category.slug}`);
  }
}

function cleanBrokenMarkdownImageFragments(content: string) {
  const output: string[] = [];
  let skippingImageFragment = false;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    const isFullMarkdownImage = /^!\[[^\]]*\]\(https?:\/\/[^)]+\)$/.test(trimmed);
    const isBrokenMarkdownImageStart = /^!\[[^\]]*(?:\]|\]\(.*)?$/i.test(trimmed);

    if (skippingImageFragment) {
      if (trimmed.endsWith(")")) {
        skippingImageFragment = false;
      }

      continue;
    }

    if (isBrokenMarkdownImageStart && !isFullMarkdownImage) {
      skippingImageFragment = !trimmed.endsWith(")");
      continue;
    }

    output.push(line);
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n");
}

export async function createDraftArticle() {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/login");
  }

  const timestamp = Date.now();
  const { data, error } = await supabase
    .from("articles")
    .insert({
      title: "New RunPlayBack Review",
      slug: `draft-${timestamp}`,
      seo_title: "New RunPlayBack Review",
      seo_description: "Draft review created in the RunPlayBack admin.",
      featured_image_url: "https://img.youtube.com/vi/dKj79mhbpGs/hqdefault.jpg",
      author_name: "RunPlayBack",
      category_slug: null,
      content:
        "Introduction\n\nFirst impressions\n\nTechnical specifications\n\nReal world experience\n\nPros\n\nCons\n\nFinal thoughts\n\nVideo\n\nLinks",
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !data) {
    redirectWithError("/admin/articles", error);
  }

  revalidatePath("/admin/articles");
  redirect(`/admin/articles/${data.id}`);
}

export async function saveArticle(articleId: string, formData: FormData) {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/login");
  }

  let categorySlug: string | null = null;

  try {
    categorySlug = getCategorySlug(formData);
  } catch (error) {
    redirectWithError(`/admin/articles/${articleId}`, error);
  }

  const { error } = await supabase
    .from("articles")
    .update({
      title: getString(formData, "title"),
      slug: getString(formData, "slug"),
      seo_title: getString(formData, "seo_title"),
      seo_description: getString(formData, "seo_description"),
      featured_image_url: getString(formData, "featured_image_url"),
      author_name: getString(formData, "author_name") || "RunPlayBack",
      category_slug: categorySlug,
      content: cleanBrokenMarkdownImageFragments(
        String(formData.get("content") || ""),
      ),
      updated_at: new Date().toISOString(),
    })
    .eq("id", articleId);

  if (error) {
    redirectWithError(`/admin/articles/${articleId}`, error);
  }

  revalidatePath("/admin/articles");
  revalidatePath(`/admin/articles/${articleId}`);
  revalidatePath("/articles");
  revalidateCategoryPages();
  redirect(`/admin/articles/${articleId}?saved=1`);
}

export async function updateArticleCategory(articleId: string, formData: FormData) {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/login");
  }

  let categorySlug: string | null = null;

  try {
    categorySlug = getCategorySlug(formData);
  } catch (error) {
    redirectWithError("/admin/articles", error);
  }

  const { data: article, error: findError } = await supabase
    .from("articles")
    .select("slug")
    .eq("id", articleId)
    .single<{ slug: string }>();

  if (findError || !article) {
    redirectWithError(
      "/admin/articles",
      findError || new Error("Review not found."),
    );
  }

  const { error } = await supabase
    .from("articles")
    .update({
      category_slug: categorySlug,
      updated_at: new Date().toISOString(),
    })
    .eq("id", articleId);

  if (error) {
    redirectWithError("/admin/articles", error);
  }

  revalidatePath("/admin/articles");
  revalidatePath(`/admin/articles/${articleId}`);
  revalidatePath("/articles");
  revalidatePath(`/articles/${article.slug}`);
  revalidateCategoryPages();
  redirect("/admin/articles?categoryUpdated=1");
}

export async function updateArticleAuthor(articleId: string, formData: FormData) {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/login");
  }

  const authorName = getString(formData, "author_name") || "RunPlayBack";

  if (!["RunPlayBack", "Sully"].includes(authorName)) {
    redirectWithError("/admin/articles", new Error("Choose a valid author."));
  }

  const { data: article, error: findError } = await supabase
    .from("articles")
    .select("slug")
    .eq("id", articleId)
    .single<{ slug: string }>();

  if (findError || !article) {
    redirectWithError(
      "/admin/articles",
      findError || new Error("Review not found."),
    );
  }

  const { error } = await supabase
    .from("articles")
    .update({
      author_name: authorName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", articleId);

  if (error) {
    redirectWithError("/admin/articles", error);
  }

  revalidatePath("/admin/articles");
  revalidatePath(`/admin/articles/${articleId}`);
  revalidatePath("/articles");
  revalidatePath(`/articles/${article.slug}`);
  revalidateCategoryPages();
  redirect("/admin/articles?authorUpdated=1");
}

export async function addProductImagesToArticle(articleId: string) {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/login");
  }

  const { data: article, error: articleError } = await supabase
    .from("articles")
    .select("content,featured_image_url,slug,title,videos(description,title,youtube_video_id)")
    .eq("id", articleId)
    .single();

  if (articleError || !article) {
    redirectWithError(
      `/admin/articles/${articleId}`,
      articleError || new Error("Review not found."),
    );
  }

  const sourceArticle = article as unknown as ArticleImageSourceRow;
  const video = Array.isArray(sourceArticle.videos)
    ? sourceArticle.videos[0]
    : sourceArticle.videos;
  const images = await findArticleImageCandidates({
    description: video?.description || "",
    limit: 2,
    title: video?.title || sourceArticle.title,
  });

  if (!images.length) {
    redirectWithError(
      `/admin/articles/${articleId}`,
      new Error("No product images found from the YouTube description links."),
    );
  }

  const { error } = await supabase
    .from("articles")
    .update({
      content: insertArticleImages(sourceArticle.content, images, {
        featuredImageUrl: sourceArticle.featured_image_url,
        youtubeVideoId: video?.youtube_video_id,
      }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", articleId);

  if (error) {
    redirectWithError(`/admin/articles/${articleId}`, error);
  }

  revalidatePath("/admin/articles");
  revalidatePath(`/admin/articles/${articleId}`);
  revalidatePath(`/articles/${sourceArticle.slug}`);
  redirect(`/admin/articles/${articleId}?imagesUpdated=1`);
}

export async function publishArticle(articleId: string) {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/login");
  }

  const { data: article, error: articleError } = await supabase
    .from("articles")
    .select("videos(published_at)")
    .eq("id", articleId)
    .single<{
      videos:
        | { published_at: string | null }
        | Array<{ published_at: string | null }>
        | null;
    }>();

  if (articleError || !article) {
    redirectWithError(
      `/admin/articles/${articleId}`,
      articleError || new Error("Review not found."),
    );
  }

  const video = Array.isArray(article.videos) ? article.videos[0] : article.videos;
  const publishedAt = video?.published_at || new Date().toISOString();

  const { error } = await supabase
    .from("articles")
    .update({
      status: "published",
      published_at: publishedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", articleId);

  if (error) {
    redirectWithError(`/admin/articles/${articleId}`, error);
  }

  revalidatePath("/admin/articles");
  revalidatePath(`/admin/articles/${articleId}`);
  revalidatePath("/articles");
  revalidateCategoryPages();
  redirect(`/admin/articles/${articleId}?published=1`);
}

export async function unpublishArticle(articleId: string) {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/login");
  }

  const { error } = await supabase
    .from("articles")
    .update({
      status: "draft",
      published_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", articleId);

  if (error) {
    redirectWithError(`/admin/articles/${articleId}`, error);
  }

  revalidatePath("/admin/articles");
  revalidatePath(`/admin/articles/${articleId}`);
  revalidatePath("/articles");
  revalidateCategoryPages();
  redirect(`/admin/articles/${articleId}?unpublished=1`);
}

export async function publishAllDraftArticles() {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/login");
  }

  const { data: articles, error: findError } = await supabase
    .from("articles")
    .select("id,slug,videos(published_at)")
    .eq("status", "draft");

  if (findError) {
    redirectWithError("/admin/articles", findError);
  }

  const drafts = (articles || []) as unknown as DraftArticlePublishRow[];

  for (const article of drafts) {
    const video = Array.isArray(article.videos)
      ? article.videos[0]
      : article.videos;
    const publishedAt = video?.published_at || new Date().toISOString();
    const { error } = await supabase
      .from("articles")
      .update({
        status: "published",
        published_at: publishedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", article.id);

    if (error) {
      redirectWithError("/admin/articles", error);
    }

    revalidatePath(`/articles/${article.slug}`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/articles");
  revalidatePath("/articles");
  revalidateCategoryPages();
  redirect(`/admin/articles?publishedAll=${drafts.length}`);
}

export async function deleteArticle(articleId: string) {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/login");
  }

  const { data: article, error: findError } = await supabase
    .from("articles")
    .select("slug")
    .eq("id", articleId)
    .single<{ slug: string }>();

  if (findError || !article) {
    redirectWithError(
      `/admin/articles/${articleId}`,
      findError || new Error("Review not found."),
    );
  }

  const { error } = await supabase
    .from("articles")
    .delete()
    .eq("id", articleId);

  if (error) {
    redirectWithError(`/admin/articles/${articleId}`, error);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/articles");
  revalidatePath("/articles");
  revalidatePath(`/articles/${article.slug}`);
  revalidateCategoryPages();
  redirect("/admin/articles?deleted=1");
}
