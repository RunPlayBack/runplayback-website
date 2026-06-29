import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

import {
  injectAffiliateLinksIntoContent,
  isAffiliateEligibleUrl,
} from "../lib/article-affiliate-links.ts";

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const fileContents = fs.readFileSync(envPath, "utf8");

  for (const rawLine of fileContents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();

    if (!key || process.env[key]) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function createAdminClient() {
  loadDotEnvLocal();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local.",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function parseArgs(argv) {
  return argv.reduce(
    (options, argument) => {
      if (argument === "--apply") {
        options.apply = true;
      } else if (argument === "--all") {
        options.all = true;
      } else if (argument === "--verbose") {
        options.verbose = true;
      } else if (argument.startsWith("--slug=")) {
        options.slug = argument.slice("--slug=".length);
      } else if (argument.startsWith("--limit=")) {
        const parsed = Number.parseInt(argument.slice("--limit=".length), 10);

        if (Number.isFinite(parsed) && parsed > 0) {
          options.limit = parsed;
        }
      }

      return options;
    },
    { apply: false, all: false, slug: "", limit: 25, verbose: false },
  );
}

function normalizeUrl(url) {
  return url.trim().toLowerCase();
}

function mergeUniqueLinks(...linkGroups) {
  const seen = new Set();
  const merged = [];

  for (const group of linkGroups) {
    for (const link of group || []) {
      const url = link?.url?.trim();
      const key = url ? normalizeUrl(url) : "";

      if (!url || !key || seen.has(key)) {
        continue;
      }

      seen.add(key);
      merged.push({
        id: link.id || key,
        label: link.label || url,
        url,
      });
    }
  }

  return merged;
}

function isDisplayArticleLinkNoise(link) {
  const normalizedLabel = (link.label || "").trim().toLowerCase();
  const normalizedUrl = (link.url || "").trim().toLowerCase();

  const isRunPlayBackArticleLink =
    normalizedUrl.includes("runplayback.com/articles") ||
    normalizedUrl.includes("/articles/");
  const isRunPlayBackContactLink =
    normalizedUrl.includes("runplayback.com/contact") ||
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
    normalizedLabel.startsWith("video still from ") ||
    normalizedUrl.includes("/article-stills/") ||
    normalizedUrl.includes("/storage/v1/object/public/article-stills/") ||
    isRunPlayBackArticleLink ||
    isRunPlayBackContactLink ||
    isSocialOrChannelLink ||
    isRunPlayBackStorefrontLink ||
    isVideoPartLink
  );
}

function filterRenderableArticleLinks(links) {
  return (links || []).filter((link) => {
    const label = (link.label || "").trim().toLowerCase();
    const url = (link.url || "").trim().toLowerCase();

    if (!url) {
      return false;
    }

    if (
      url.includes("runplayback.com/articles") ||
      url.includes("runplayback.com/contact") ||
      url === "http://runplayback.com" ||
      url === "https://runplayback.com" ||
      url.includes("amazon.com/shop/runplayback") ||
      url.includes("/article-stills/")
    ) {
      return false;
    }

    if (
      label === "instagram" ||
      label === "facebook" ||
      label === "twitter" ||
      label === "x" ||
      label === "threads" ||
      label === "youtube" ||
      label === "contact" ||
      label === "email me" ||
      label === "articles" ||
      label === "amazon.com" ||
      /^part\s+\d+\b/.test(label) ||
      label.startsWith("full review") ||
      label.startsWith("watch on youtube") ||
      label.startsWith("video still from ")
    ) {
      return false;
    }

    if (
      url.includes("instagram.com/runplayback") ||
      url.includes("facebook.com/runplayback") ||
      url.includes("twitter.com/runplayback") ||
      url.includes("x.com/runplayback") ||
      url.includes("youtube.com/@") ||
      url.includes("youtube.com/channel/") ||
      url.includes("youtu.be/")
    ) {
      return false;
    }

    return true;
  });
}

function isStrictPublicDescriptionLink(link) {
  const label = (link.label || "").trim().toLowerCase();
  const url = (link.url || "").trim().toLowerCase();
  const isVideoStillLink =
    label.includes("video still") ||
    url.includes("/article-stills/") ||
    url.includes("/storage/v1/object/public/article-stills/");

  if (!url || !isAffiliateEligibleUrl(url)) {
    return false;
  }

  if (
    isVideoStillLink ||
    url.includes("amazon.com/shop/runplayback") ||
    /^part\s+\d+\b/.test(label) ||
    label === "instagram" ||
    label === "facebook" ||
    label === "twitter" ||
    label === "x" ||
    label === "threads" ||
    label === "youtube" ||
    label === "contact" ||
    label === "email me" ||
    label === "articles" ||
    label === "amazon.com" ||
    label.startsWith("full review") ||
    label.startsWith("watch on youtube")
  ) {
    return false;
  }

  return true;
}

function buildStrictPublicDescriptionLinks(...linkGroups) {
  return filterRenderableArticleLinks(
    mergeUniqueLinks(...linkGroups)
      .filter((link) => !isDisplayArticleLinkNoise(link))
      .filter(isStrictPublicDescriptionLink),
  );
}

function getYouTubeVideoIdFromText(value) {
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

function mapSupabaseArticle(row) {
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
    ? buildStrictPublicDescriptionLinks(videoAffiliateLinks)
    : buildStrictPublicDescriptionLinks(row.affiliate_links);

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    content: row.content || "",
    articleType: row.article_type || null,
    links: mergedLinks,
    video: videos[0] || null,
    videos,
  };
}

async function getSourceArticleDetails(supabase, articleId) {
  const { data: sourceRows, error: sourceError } = await supabase
    .from("article_sources")
    .select("source_article_id,sort_order")
    .eq("article_id", articleId)
    .order("sort_order", { ascending: true });

  if (sourceError || !sourceRows?.length) {
    return { links: [], videos: [] };
  }

  const sourceIds = sourceRows.map((row) => row.source_article_id);
  const { data: sourceArticles, error: articleError } = await supabase
    .from("articles")
    .select(
      "id,title,slug,content,affiliate_links(id,label,url),videos(published_at,youtube_video_id,video_url,title,affiliate_links(id,label,url))",
    )
    .in("id", sourceIds);

  if (articleError || !sourceArticles?.length) {
    return { links: [], videos: [] };
  }

  const articleById = new Map(sourceArticles.map((article) => [article.id, article]));
  const videos = [];

  for (const row of sourceRows) {
    const sourceArticle = articleById.get(row.source_article_id);
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
        affiliateLinks: buildStrictPublicDescriptionLinks(videoRow.affiliate_links || []),
      });
    }
  }

  return {
    links: buildStrictPublicDescriptionLinks(
      videos.flatMap((video) => video.affiliateLinks || []),
    ),
    videos,
  };
}

function isComparisonArticle(article) {
  return article.articleType === "comparison";
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const supabase = createAdminClient();

  let query = supabase
    .from("articles")
    .select(
      "id,title,slug,content,article_type,status,published_at,affiliate_links(id,label,url),videos(published_at,youtube_video_id,video_url,title,affiliate_links(id,label,url))",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false });

  if (options.slug) {
    query = query.eq("slug", options.slug);
  } else if (!options.all) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const rows = data || [];
  let changed = 0;
  let unchanged = 0;
  let skipped = 0;

  console.log(
    `${options.apply ? "Applying" : "Dry run"} affiliate inline-link backfill for ${rows.length} published articles...`,
  );

  for (const row of rows) {
    const article = mapSupabaseArticle(row);
    const sourceDetails = await getSourceArticleDetails(supabase, article.id);
    const articleVideos = article.videos.length
      ? article.videos.slice()
      : article.video
        ? [article.video]
        : [];

    for (const sourceVideo of sourceDetails.videos) {
      if (!articleVideos.some((video) => video.youtubeVideoId === sourceVideo.youtubeVideoId)) {
        articleVideos.push(sourceVideo);
      }
    }

    const orderedVideoDescriptionLinks = buildStrictPublicDescriptionLinks(
      ...articleVideos.map((video) => video.affiliateLinks || []),
    );
    const fallbackArticleLinks = isComparisonArticle(article)
      ? []
      : buildStrictPublicDescriptionLinks(article.links);
    const displayLinks = orderedVideoDescriptionLinks.length
      ? orderedVideoDescriptionLinks
      : fallbackArticleLinks;

    if (!displayLinks.length) {
      skipped += 1;
      if (options.verbose) {
        console.log(`SKIP ${article.slug} (no eligible links)`);
      }
      continue;
    }

    const updatedContent = injectAffiliateLinksIntoContent(article.content, displayLinks);

    if (updatedContent === article.content) {
      unchanged += 1;
      if (options.verbose) {
        console.log(`OK   ${article.slug} (already current)`);
      }
      continue;
    }

    changed += 1;

    if (!options.apply) {
      console.log(`UPDATE ${article.slug}`);
      continue;
    }

    const { error: updateError } = await supabase
      .from("articles")
      .update({ content: updatedContent })
      .eq("id", article.id);

    if (updateError) {
      throw new Error(`${article.slug}: ${updateError.message}`);
    }

    console.log(`UPDATED ${article.slug}`);
  }

  console.log("");
  console.log(`Scanned: ${rows.length}`);
  console.log(`Changed: ${changed}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Skipped: ${skipped}`);

  if (!options.apply && changed > 0) {
    console.log("");
    console.log("Run again with --apply to save changes.");
  }
}

main().catch((error) => {
  console.error(`Affiliate inline-link backfill failed: ${error.message}`);
  process.exitCode = 1;
});
