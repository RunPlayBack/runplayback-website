import { articles as placeholderArticles } from "@/lib/placeholder-data";
import { createClient } from "@/lib/supabase/server";

export type PublicArticle = {
  id: string;
  title: string;
  slug: string;
  seoTitle: string;
  seoDescription: string;
  featuredImageUrl: string;
  authorName: string;
  categorySlug: string | null;
  content: string;
  displayPublishedAt: string | null;
  status: "draft" | "published";
  publishedAt: string | null;
  video: {
    publishedAt: string | null;
    youtubeVideoId: string;
    videoUrl: string;
    title: string;
  } | null;
  links: Array<{
    id: string;
    label: string;
    url: string;
  }>;
};

type SupabaseArticleRow = {
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
        youtube_video_id: string;
        video_url: string;
        title: string;
      }
    | Array<{
        published_at: string | null;
        youtube_video_id: string;
        video_url: string;
        title: string;
      }>
    | null;
  affiliate_links: Array<{
    id: string;
    label: string;
    url: string;
  }>;
};

function getYouTubeVideoIdFromText(value: string) {
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);

    if (match?.[1]) {
      return match[1];
    }
  }

  const slugMatch = value.match(/-([A-Za-z0-9_-]{11})$/);

  return slugMatch?.[1] || "";
}

function mapSupabaseArticle(row: SupabaseArticleRow): PublicArticle {
  const video = Array.isArray(row.videos) ? row.videos[0] : row.videos;
  const fallbackYouTubeVideoId =
    video?.youtube_video_id || getYouTubeVideoIdFromText(`${row.content}\n${row.slug}`);

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    seoTitle: row.seo_title || row.title,
    seoDescription:
      row.seo_description || `RunPlayBack article companion for ${row.title}.`,
    featuredImageUrl:
      row.featured_image_url ||
      (fallbackYouTubeVideoId
        ? `https://img.youtube.com/vi/${fallbackYouTubeVideoId}/hqdefault.jpg`
        : ""),
    authorName: row.author_name || "RunPlayBack",
    categorySlug: row.category_slug || null,
    content: row.content,
    displayPublishedAt: video?.published_at || row.published_at,
    status: row.status,
    publishedAt: row.published_at,
    video: fallbackYouTubeVideoId
      ? {
          publishedAt: video?.published_at || null,
          youtubeVideoId: fallbackYouTubeVideoId,
          videoUrl: video?.video_url || `https://youtu.be/${fallbackYouTubeVideoId}`,
          title: video?.title || row.title,
        }
      : null,
    links: row.affiliate_links || [],
  };
}

function mapPlaceholderArticles(): PublicArticle[] {
  return placeholderArticles
    .filter((article) => article.status === "published")
    .map((article) => ({
      id: article.id,
      title: article.title,
      slug: article.slug,
      seoTitle: article.title,
      seoDescription: article.seoDescription,
      featuredImageUrl: article.image,
      authorName: "RunPlayBack",
      categorySlug: null,
      content: `${article.excerpt}\n\nThis is placeholder content until Supabase published articles are available.`,
      displayPublishedAt: null,
      status: article.status,
      publishedAt: null,
      video: article.youtubeVideoId
        ? {
            publishedAt: null,
            youtubeVideoId: article.youtubeVideoId,
            videoUrl: `https://youtu.be/${article.youtubeVideoId}`,
            title: article.title,
          }
        : null,
      links: [],
    }));
}

export async function getPublishedArticles() {
  const supabase = await createClient();

  if (!supabase) {
    return mapPlaceholderArticles();
  }

  const { data, error } = await supabase
    .from("articles")
    .select(
      "id,title,slug,seo_title,seo_description,featured_image_url,author_name,category_slug,content,status,published_at,videos(published_at,youtube_video_id,video_url,title),affiliate_links(id,label,url)",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false });

  if (error) {
    console.error(error);
    return [];
  }

  return (data || []).map((row) =>
    mapSupabaseArticle(row as unknown as SupabaseArticleRow),
  );
}

export async function getPublishedArticleBySlug(slug: string) {
  const supabase = await createClient();

  if (!supabase) {
    return mapPlaceholderArticles().find((article) => article.slug === slug) || null;
  }

  const { data, error } = await supabase
    .from("articles")
    .select(
      "id,title,slug,seo_title,seo_description,featured_image_url,author_name,category_slug,content,status,published_at,videos(published_at,youtube_video_id,video_url,title),affiliate_links(id,label,url)",
    )
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapSupabaseArticle(data as unknown as SupabaseArticleRow);
}
