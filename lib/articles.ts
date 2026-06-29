import { articles as placeholderArticles } from "@/lib/placeholder-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAffiliateEligibleUrl } from "@/lib/article-affiliate-links";

export type PublicArticleVideo = {
  publishedAt: string | null;
  youtubeVideoId: string;
  videoUrl: string;
  title: string;
  affiliateLinks?: Array<{
    id?: string;
    label: string;
    url: string;
  }>;
};

export type PublicArticleSource = {
  content: string;
  id: string;
  title: string;
  slug: string;
  featuredImageUrl: string;
};

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
  articleType: string | null;
  displayPublishedAt: string | null;
  status: "draft" | "published";
  publishedAt: string | null;
  sourceArticles: PublicArticleSource[];
  video: PublicArticleVideo | null;
  videos: PublicArticleVideo[];
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
  article_type: string | null;
  status: "draft" | "published";
  published_at: string | null;
  videos:
    | {
        published_at: string | null;
        youtube_video_id: string;
        video_url: string;
        title: string;
        affiliate_links?: Array<{
          id: string;
          label: string;
          url: string;
        }> | null;
      }
    | Array<{
        published_at: string | null;
        youtube_video_id: string;
        video_url: string;
        title: string;
        affiliate_links?: Array<{
          id: string;
          label: string;
          url: string;
        }> | null;
      }>
    | null;
  affiliate_links: Array<{
    id: string;
    label: string;
    url: string;
  }>;
};

type ArticleSourceRow = {
  sort_order: number;
  source_article_id: string;
};

type SourceArticleVideoRow = {
  content: string | null;
  id: string;
  title: string;
  slug: string;
  featured_image_url: string | null;
  affiliate_links?: Array<{
    id: string;
    label: string;
    url: string;
  }> | null;
  videos:
    | {
        published_at: string | null;
        youtube_video_id: string;
        video_url: string;
        title: string;
        affiliate_links?: Array<{
          id: string;
          label: string;
          url: string;
        }> | null;
      }
    | Array<{
        published_at: string | null;
        youtube_video_id: string;
        video_url: string;
        title: string;
        affiliate_links?: Array<{
          id: string;
          label: string;
          url: string;
        }> | null;
      }>
    | null;
};

function mergeUniqueLinks(
  ...linkGroups: Array<
    Array<{
      id?: string;
      label: string;
      url: string;
    }> | null | undefined
  >
) {
  const seen = new Set<string>();
  const merged: Array<{
    id: string;
    label: string;
    url: string;
  }> = [];

  for (const group of linkGroups) {
    for (const link of group || []) {
      const key = link.url.trim().toLowerCase();

      if (!key || seen.has(key)) {
        continue;
      }

      seen.add(key);
      merged.push({
        id: link.id || key,
        label: link.label,
        url: link.url,
      });
    }
  }

  return merged;
}

function isPublicArticleLinkNoise(link: { label: string; url: string }) {
  const normalizedLabel = link.label.trim().toLowerCase();
  const normalizedUrl = link.url.trim().toLowerCase();
  const isVideoStillLink =
    normalizedLabel.includes("video still") ||
    normalizedUrl.includes("/article-stills/") ||
    normalizedUrl.includes("/storage/v1/object/public/article-stills/");

  const isRunPlayBackArticleLink =
    normalizedUrl.includes("runplayback.com/articles") ||
    normalizedUrl.includes("/articles/");
  const isRunPlayBackContactLink =
    normalizedUrl.includes("runplayback.com/contact") ||
    normalizedUrl === "http://runplayback.com" ||
    normalizedUrl === "https://runplayback.com" ||
    normalizedLabel === "contact" ||
    normalizedLabel === "email me" ||
    normalizedLabel === "articles";
  const isSocialOrChannelLink =
    normalizedLabel === "instagram" ||
    normalizedLabel === "facebook" ||
    normalizedLabel === "twitter" ||
    normalizedLabel === "x" ||
    normalizedLabel === "threads" ||
    normalizedLabel === "youtube" ||
    normalizedUrl.includes("instagram.com/runplayback") ||
    normalizedUrl.includes("facebook.com/runplayback") ||
    normalizedUrl.includes("twitter.com/runplayback") ||
    normalizedUrl.includes("x.com/runplayback") ||
    normalizedUrl.includes("youtube.com/@") ||
    normalizedUrl.includes("youtube.com/channel/") ||
    normalizedUrl.includes("youtu.be/");
  const isRunPlayBackStorefrontLink =
    normalizedLabel === "amazon.com" ||
    normalizedUrl.includes("amazon.com/shop/runplayback");
  const isVideoPartLink =
    /^part\s+\d+\b/.test(normalizedLabel) ||
    normalizedLabel.startsWith("full review") ||
    normalizedLabel.startsWith("watch on youtube");

  return (
    !isAffiliateEligibleUrl(link.url) ||
    isVideoStillLink ||
    isRunPlayBackArticleLink ||
    isRunPlayBackContactLink ||
    isSocialOrChannelLink ||
    isRunPlayBackStorefrontLink ||
    isVideoPartLink
  );
}

function filterPublicArticleLinks(
  ...linkGroups: Array<
    Array<{
      id?: string;
      label: string;
      url: string;
    }> | null | undefined
  >
) {
  return mergeUniqueLinks(
    ...linkGroups.map((group) =>
      (group || []).filter(
        (link) => link.url.trim() && !isPublicArticleLinkNoise(link),
      ),
    ),
  );
}

function extractLinksFromContent(content: string) {
  if (!content.trim()) {
    return [] as Array<{
      id: string;
      label: string;
      url: string;
    }>;
  }

  const markdownLinks = Array.from(
    content.matchAll(/(?<!!)\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g),
  ).map((match) => ({
    id: `${match[2].trim().toLowerCase()}-${match[1].trim().toLowerCase()}`,
    label: match[1].trim(),
    url: match[2].trim(),
  }));

  const lines = content.split("\n");
  const extractedLines: Array<{
    id: string;
    label: string;
    url: string;
  }> = [];
  let inLinksSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    if (/^#{1,6}\s+links$/i.test(line)) {
      inLinksSection = true;
      continue;
    }

    if (!inLinksSection) {
      continue;
    }

    if (/^#{1,6}\s+/.test(line)) {
      break;
    }

    const strippedLine = line.replace(/^[-*•]\s+/, "").trim();
    const labeledUrlMatch = strippedLine.match(
      /^(.+?)\s*[:;|–—-]\s*(https?:\/\/\S+)$/i,
    );

    if (!labeledUrlMatch) {
      continue;
    }

    const label = labeledUrlMatch[1]
      .replace(/^["“]|["”]$/g, "")
      .replaceAll("**", "")
      .trim();
    const url = labeledUrlMatch[2].replace(/[.,;!?]+$/, "").trim();

    if (!label || !url) {
      continue;
    }

    if (isPublicArticleLinkNoise({ label, url })) {
      continue;
    }

    extractedLines.push({
      id: `${url.toLowerCase()}-${label.toLowerCase()}`,
      label,
      url,
    });
  }

  return filterPublicArticleLinks(markdownLinks, extractedLines);
}

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
  const videoRows = Array.isArray(row.videos)
    ? row.videos
    : row.videos
      ? [row.videos]
      : [];
  const video = videoRows[0] || null;
  const fallbackYouTubeVideoId =
    video?.youtube_video_id ||
    getYouTubeVideoIdFromText(
      row.article_type ? row.content || "" : `${row.content}\n${row.slug}`,
    );
  const videos = videoRows
    .map((videoRow) => ({
      affiliateLinks: videoRow.affiliate_links || [],
      publishedAt: videoRow.published_at || null,
      youtubeVideoId: videoRow.youtube_video_id,
      videoUrl: videoRow.video_url || `https://youtu.be/${videoRow.youtube_video_id}`,
      title: videoRow.title || row.title,
    }))
    .filter((videoRow) => videoRow.youtubeVideoId);

  if (
    fallbackYouTubeVideoId &&
    !videos.some((videoRow) => videoRow.youtubeVideoId === fallbackYouTubeVideoId)
  ) {
    videos.push({
      affiliateLinks: video?.affiliate_links || [],
      publishedAt: video?.published_at || null,
      youtubeVideoId: fallbackYouTubeVideoId,
      videoUrl: video?.video_url || `https://youtu.be/${fallbackYouTubeVideoId}`,
      title: video?.title || row.title,
    });
  }

  const videoAffiliateLinks = videoRows.flatMap(
    (videoRow) => videoRow.affiliate_links || [],
  );
  const mergedLinks = videoAffiliateLinks.length
    ? filterPublicArticleLinks(videoAffiliateLinks)
    : filterPublicArticleLinks(row.affiliate_links);
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
    articleType: row.article_type || null,
    displayPublishedAt: video?.published_at || row.published_at,
    status: row.status,
    publishedAt: row.published_at,
    sourceArticles: [],
    video: videos[0] || null,
    videos,
    links: mergedLinks,
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
      articleType: null,
      displayPublishedAt: null,
      status: article.status,
      publishedAt: null,
      sourceArticles: [],
      video: article.youtubeVideoId
        ? {
            publishedAt: null,
            youtubeVideoId: article.youtubeVideoId,
            videoUrl: `https://youtu.be/${article.youtubeVideoId}`,
            title: article.title,
          }
        : null,
      videos: article.youtubeVideoId
        ? [
            {
              publishedAt: null,
              youtubeVideoId: article.youtubeVideoId,
              videoUrl: `https://youtu.be/${article.youtubeVideoId}`,
              title: article.title,
            },
          ]
        : [],
      links: [],
    }));
}

async function getSourceArticleDetails(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  articleId: string,
) {
  const { data: sourceRows, error: sourceError } = await supabase
    .from("article_sources")
    .select("source_article_id,sort_order")
    .eq("article_id", articleId)
    .order("sort_order", { ascending: true });

  if (sourceError || !sourceRows?.length) {
    return { sourceArticles: [], videos: [], links: [] };
  }

  const orderedSourceRows = sourceRows as unknown as ArticleSourceRow[];
  const sourceIds = orderedSourceRows.map((row) => row.source_article_id);
  const { data: sourceArticles, error: articleError } = await supabase
    .from("articles")
    .select("id,title,slug,featured_image_url,content,affiliate_links(id,label,url),videos(published_at,youtube_video_id,video_url,title,affiliate_links(id,label,url))")
    .in("id", sourceIds);

  if (articleError || !sourceArticles?.length) {
    return { sourceArticles: [], videos: [], links: [] };
  }

  const articleById = new Map(
    (sourceArticles as unknown as SourceArticleVideoRow[]).map((article) => [
      article.id,
      article,
    ]),
  );
  const videos: PublicArticleVideo[] = [];
  const orderedSourceArticles: PublicArticleSource[] = [];

  for (const row of orderedSourceRows) {
    const sourceArticle = articleById.get(row.source_article_id);

    if (sourceArticle?.featured_image_url) {
      orderedSourceArticles.push({
        content: sourceArticle.content || "",
        id: sourceArticle.id,
        title: sourceArticle.title,
        slug: sourceArticle.slug,
        featuredImageUrl: sourceArticle.featured_image_url,
      });
    }

    const videoRows = Array.isArray(sourceArticle?.videos)
      ? sourceArticle.videos
      : sourceArticle?.videos
        ? [sourceArticle.videos]
        : [];

    for (const videoRow of videoRows) {
      if (
        !videoRow.youtube_video_id ||
        videos.some((video) => video.youtubeVideoId === videoRow.youtube_video_id)
      ) {
        continue;
      }

      videos.push({
        publishedAt: videoRow.published_at || null,
        youtubeVideoId: videoRow.youtube_video_id,
        videoUrl: videoRow.video_url || `https://youtu.be/${videoRow.youtube_video_id}`,
        title: videoRow.title || sourceArticle?.title || "RunPlayBack review video",
        affiliateLinks: filterPublicArticleLinks(videoRow.affiliate_links || []),
      });
    }
  }

  return {
    sourceArticles: orderedSourceArticles,
    videos,
    links: filterPublicArticleLinks(
      videos.flatMap((video) => video.affiliateLinks || []),
    ),
  };
}

export async function getPublishedArticles() {
  const supabase = createAdminClient() || (await createClient());

  if (!supabase) {
    return mapPlaceholderArticles();
  }

  const { data, error } = await supabase
    .from("articles")
    .select(
      "id,title,slug,seo_title,seo_description,featured_image_url,author_name,category_slug,content,article_type,status,published_at,videos(published_at,youtube_video_id,video_url,title,affiliate_links(id,label,url)),affiliate_links(id,label,url)",
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
  const supabase = createAdminClient() || (await createClient());

  if (!supabase) {
    return mapPlaceholderArticles().find((article) => article.slug === slug) || null;
  }

  const { data, error } = await supabase
    .from("articles")
    .select(
      "id,title,slug,seo_title,seo_description,featured_image_url,author_name,category_slug,content,article_type,status,published_at,videos(published_at,youtube_video_id,video_url,title,affiliate_links(id,label,url)),affiliate_links(id,label,url)",
    )
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const article = mapSupabaseArticle(data as unknown as SupabaseArticleRow);
  const sourceDetails = await getSourceArticleDetails(supabase, article.id);

  if (
    !sourceDetails.sourceArticles.length &&
    !sourceDetails.videos.length &&
    !sourceDetails.links.length
  ) {
    return article;
  }

  const videos = [...article.videos];

  for (const sourceVideo of sourceDetails.videos) {
    if (!videos.some((video) => video.youtubeVideoId === sourceVideo.youtubeVideoId)) {
      videos.push(sourceVideo);
    }
  }

  return {
    ...article,
    links: sourceDetails.links.length
      ? filterPublicArticleLinks(sourceDetails.links)
      : filterPublicArticleLinks(article.links),
    sourceArticles: sourceDetails.sourceArticles,
    video: videos[0] || null,
    videos,
  };
}
