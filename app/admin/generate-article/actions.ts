"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  type BuyingGuideArticleType,
  type BuyingGuideSourceArticle,
  type BuyingGuideSourceImage,
  generateBuyingGuideDraft,
} from "@/lib/openai/comparison-guide-generator";
import { articleCategories } from "@/lib/article-categories";
import { createClient } from "@/lib/supabase/server";

type SourceArticleRow = {
  id: string;
  title: string;
  slug: string;
  seo_description: string | null;
  featured_image_url: string | null;
  category_slug: string | null;
  content: string;
  videos:
    | {
        title: string;
        video_url: string;
        youtube_video_id: string;
      }
    | Array<{
        title: string;
        video_url: string;
        youtube_video_id: string;
      }>
    | null;
};

type SourceImage = {
  altText: string;
  sourceArticleId: string;
  url: string;
};

function getString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function redirectWithError(error: unknown): never {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "Unable to generate draft.";

  redirect(`/admin/generate-article?error=${encodeURIComponent(message)}`);
}

function getVideo(row: SourceArticleRow) {
  return Array.isArray(row.videos) ? row.videos[0] : row.videos;
}

function normalizeBaseUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://runplayback.com").replace(
    /\/$/,
    "",
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function shortenTitle(title: string) {
  return title
    .replace(/\s+review\b.*$/i, "")
    .replace(/\s+full\b.*$/i, "")
    .replace(/\s+first impressions\b.*$/i, "")
    .replace(/[:—-]\s*.*$/, "")
    .trim()
    .slice(0, 70);
}

function getCategoryLabel(categorySlug: string | null | undefined) {
  return articleCategories.find((category) => category.slug === categorySlug)?.label;
}

function makeAutomaticTitle(
  articleType: BuyingGuideArticleType,
  categorySlug: string | null,
  rows: SourceArticleRow[],
) {
  if (articleType === "versus" && rows.length >= 2) {
    return `${shortenTitle(rows[0].title)} vs ${shortenTitle(rows[1].title)}: We Tested Both`;
  }

  const categoryLabel = getCategoryLabel(categorySlug);

  if (categoryLabel) {
    return `Best ${categoryLabel} of 2026: RunPlayBack Picks`;
  }

  return "Best EV Reviews We’ve Tested: RunPlayBack Picks";
}

function normalizeImageUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function isYouTubeThumbnailUrl(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.includes("ytimg.com");
  } catch {
    return url.includes("ytimg.com");
  }
}

function extractArticleImages(row: SourceArticleRow) {
  const images: SourceImage[] = [];
  const seen = new Set<string>();
  const featuredImageUrl = row.featured_image_url
    ? normalizeImageUrl(row.featured_image_url)
    : "";

  for (const match of row.content.matchAll(/^!\[([^\]]*)]\((https?:\/\/[^)]+)\)\s*$/gm)) {
    const url = match[2].trim();
    const normalizedUrl = normalizeImageUrl(url);

    if (
      !url ||
      seen.has(normalizedUrl) ||
      normalizedUrl === featuredImageUrl ||
      isYouTubeThumbnailUrl(url)
    ) {
      continue;
    }

    seen.add(normalizedUrl);
    images.push({
      altText: match[1]?.trim() || row.title,
      sourceArticleId: row.id,
      url,
    });
  }

  return images;
}

function selectSourceImages(
  articleType: BuyingGuideArticleType,
  orderedRows: SourceArticleRow[],
) {
  const imagesPerSource = articleType === "versus" ? 2 : 1;

  return orderedRows.flatMap((row) =>
    extractArticleImages(row).slice(0, imagesPerSource),
  );
}

async function getUniqueSlug(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  slug: string,
) {
  const baseSlug = slugify(slug) || `runplayback-guide-${Date.now()}`;
  let nextSlug = baseSlug;
  let suffix = 2;

  while (true) {
    const { data, error } = await supabase
      .from("articles")
      .select("id")
      .eq("slug", nextSlug)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return nextSlug;
    }

    nextSlug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

export async function generateComparisonBuyingGuide(formData: FormData) {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/login");
  }

  const articleType = getString(formData, "article_type") as BuyingGuideArticleType;
  const title = getString(formData, "title");
  const categorySlug = getString(formData, "category_slug");
  const selectedIds = formData
    .getAll("source_article_ids")
    .map((value) => String(value))
    .filter(Boolean);

  if (articleType !== "best_of" && articleType !== "versus") {
    redirectWithError(new Error("Choose Best Of or Versus."));
  }

  if (articleType === "versus" && selectedIds.length !== 2) {
    redirectWithError(new Error("Versus drafts need exactly two source reviews."));
  }

  if (articleType === "best_of" && selectedIds.length < 2) {
    redirectWithError(new Error("Best Of drafts need at least two source reviews."));
  }

  const { data, error } = await supabase
    .from("articles")
    .select(
      "id,title,slug,seo_description,featured_image_url,category_slug,content,videos(title,video_url,youtube_video_id)",
    )
    .eq("status", "published")
    .in("id", selectedIds);

  if (error || !data) {
    redirectWithError(error || new Error("Could not load selected reviews."));
  }

  const rows = data as unknown as SourceArticleRow[];
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const orderedRows = selectedIds
    .map((id) => rowById.get(id))
    .filter((row): row is SourceArticleRow => Boolean(row))
    .sort((a, b) => {
      const orderA = Number(getString(formData, `order_${a.id}`)) || 999;
      const orderB = Number(getString(formData, `order_${b.id}`)) || 999;
      return orderA - orderB;
    });

  if (orderedRows.length !== selectedIds.length) {
    redirectWithError(new Error("One or more selected reviews could not be found."));
  }

  const baseUrl = normalizeBaseUrl();
  const selectedImages = selectSourceImages(articleType, orderedRows);
  const imagesBySource = new Map<string, SourceImage[]>();

  for (const image of selectedImages) {
    imagesBySource.set(image.sourceArticleId, [
      ...(imagesBySource.get(image.sourceArticleId) || []),
      image,
    ]);
  }

  const images: BuyingGuideSourceImage[] = orderedRows.flatMap((row, sourceIndex) =>
    (imagesBySource.get(row.id) || []).map((image, imageIndex) => ({
      altText: image.altText || row.title,
      placementKey: `[[IMAGE:${sourceIndex + 1}-${imageIndex + 1}]]`,
      sourceArticleId: row.id,
      url: image.url,
    })),
  );
  const resolvedCategorySlug = categorySlug || orderedRows[0]?.category_slug || null;
  const resolvedCategoryLabel = getCategoryLabel(resolvedCategorySlug) || "";
  const resolvedTitle = title || makeAutomaticTitle(articleType, resolvedCategorySlug, orderedRows);

  const sources: BuyingGuideSourceArticle[] = orderedRows.map((row, index) => {
    const video = getVideo(row);

    return {
      categoryLabel: getCategoryLabel(row.category_slug) || "",
      categorySlug: row.category_slug || "",
      content: row.content,
      fullReviewUrl: `${baseUrl}/articles/${row.slug}`,
      id: row.id,
      notes: "",
      order: index + 1,
      seoDescription: row.seo_description || "",
      title: row.title,
      videoUrl: video?.video_url || "",
      youtubeVideoId: video?.youtube_video_id || "",
    };
  });

  let draft;

  try {
    draft = await generateBuyingGuideDraft({
      articleType,
      categoryLabel: resolvedCategoryLabel,
      images,
      sources,
      title: resolvedTitle,
    });
  } catch (error) {
    redirectWithError(error);
  }

  const slug = await getUniqueSlug(supabase, draft.slug);
  const featuredImageUrl = images[0]?.url || "";

  const { data: article, error: insertError } = await supabase
    .from("articles")
    .insert({
      article_type: articleType,
      author_name: "RunPlayBack",
      category_slug: resolvedCategorySlug,
      content: draft.content,
      featured_image_url: featuredImageUrl || null,
      seo_description: draft.seo_description,
      seo_title: draft.seo_title,
      slug,
      status: "draft",
      title: draft.title,
    })
    .select("id")
    .single();

  if (insertError || !article) {
    redirectWithError(insertError || new Error("Could not save generated draft."));
  }

  const sourceRows = sources.map((source) => ({
    article_id: article.id,
    notes: source.notes || null,
    sort_order: source.order,
    source_article_id: source.id,
  }));

  if (sourceRows.length) {
    const { error: sourceError } = await supabase
      .from("article_sources")
      .insert(sourceRows);

    if (sourceError) {
      redirectWithError(sourceError);
    }
  }

  if (images.length) {
    const { error: imageError } = await supabase
      .from("generated_article_images")
      .insert(
        images.map((image, index) => ({
          alt_text: image.altText,
          article_id: article.id,
          image_url: image.url,
          placement: image.placementKey,
          sort_order: index + 1,
          source_article_id: image.sourceArticleId,
        })),
      );

    if (imageError) {
      redirectWithError(imageError);
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/articles");
  revalidatePath("/articles");

  redirect(`/admin/articles/${article.id}?saved=1`);
}
