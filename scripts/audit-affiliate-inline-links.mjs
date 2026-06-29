import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

import {
  getAffiliateLinkCandidates,
  injectAffiliateLinksIntoLine,
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
      if (argument.startsWith("--slug=")) {
        options.slug = argument.slice("--slug=".length);
      } else if (argument.startsWith("--limit=")) {
        const value = Number.parseInt(argument.slice("--limit=".length), 10);

        if (Number.isFinite(value) && value > 0) {
          options.limit = value;
        }
      } else if (argument === "--verbose") {
        options.verbose = true;
      }

      return options;
    },
    { limit: 25, slug: "", verbose: false },
  );
}

function normalizeUrl(url) {
  return url.trim().toLowerCase();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    content: row.content,
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
      "id,title,slug,featured_image_url,content,affiliate_links(id,label,url),videos(published_at,youtube_video_id,video_url,title,affiliate_links(id,label,url))",
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

function extractAuditedBodyLines(content) {
  const lines = content.split("\n");
  const output = [];
  let inLinksSection = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (/^#{1,6}\s+links$/i.test(trimmed)) {
      inLinksSection = true;
      continue;
    }

    if (inLinksSection) {
      if (/^#{1,6}\s+/.test(trimmed)) {
        break;
      }

      continue;
    }

    output.push(rawLine);
  }

  return output;
}

function buildCandidatePattern(candidate) {
  const words = candidate
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => escapeRegExp(word));

  if (!words.length) {
    return null;
  }

  return new RegExp(`(^|[^\\w])${words.join("[\\s\\-–—]+")}(?=$|[^\\w])`, "i");
}

const genericCandidateWords = new Set([
  "a",
  "an",
  "and",
  "at",
  "bar",
  "battery",
  "bike",
  "brake",
  "brakes",
  "bt",
  "cable",
  "charger",
  "charging",
  "clip",
  "controller",
  "controls",
  "cycles",
  "dirt",
  "display",
  "dongle",
  "e",
  "ebike",
  "ebikes",
  "electric",
  "fender",
  "for",
  "frame",
  "frameset",
  "from",
  "front",
  "gear",
  "gloves",
  "handlebar",
  "harness",
  "headlight",
  "helmet",
  "hip",
  "holder",
  "hub",
  "kit",
  "lever",
  "levers",
  "lithium",
  "mirror",
  "mips",
  "moto",
  "motor",
  "mount",
  "mtb",
  "on",
  "off",
  "pad",
  "pads",
  "pedals",
  "phone",
  "port",
  "power",
  "pre",
  "pro",
  "promo",
  "pump",
  "rear",
  "seat",
  "shock",
  "side",
  "sintered",
  "solid",
  "stand",
  "step",
  "storage",
  "switch",
  "the",
  "throttle",
  "tire",
  "tool",
  "top",
  "use",
  "voltage",
  "wire",
  "with",
]);

function isStrongCandidate(candidate) {
  const words = candidate
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  if (!words.length) {
    return false;
  }

  const significantWords = words.filter((word) => !genericCandidateWords.has(word));

  if (significantWords.some((word) => /\d/.test(word))) {
    return true;
  }

  return significantWords.length >= 2;
}

function linkIsMentionedInBody(link, bodyLines) {
  const candidates = getAffiliateLinkCandidates(link.label, link.url).filter(
    isStrongCandidate,
  );

  if (!candidates.length) {
    return false;
  }

  for (const candidate of candidates) {
    const pattern = buildCandidatePattern(candidate);

    if (!pattern) {
      continue;
    }

    for (const line of bodyLines) {
      const trimmed = line.trim();

      if (!trimmed) {
        continue;
      }

      if (pattern.test(trimmed)) {
        return true;
      }
    }
  }

  return false;
}

function collectMatchedUrls(content, links) {
  const matchedUrls = new Set();
  const lines = extractAuditedBodyLines(content);
  const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;

  for (const line of lines) {
    const linkedLine = injectAffiliateLinksIntoLine(line, links);

    for (const match of linkedLine.matchAll(markdownLinkPattern)) {
      const url = match[2]?.trim();

      if (url) {
        matchedUrls.add(normalizeUrl(url));
      }
    }
  }

  return matchedUrls;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const supabase = createAdminClient();

  let query = supabase
    .from("articles")
    .select(
      "id,title,slug,content,article_type,status,published_at,videos(published_at,youtube_video_id,video_url,title,affiliate_links(id,label,url)),affiliate_links(id,label,url)",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false });

  if (options.slug) {
    query = query.eq("slug", options.slug);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const rows = data || [];
  const failures = [];
  let withEligibleLinks = 0;
  let fullCoverage = 0;
  let partialCoverage = 0;
  let zeroCoverage = 0;

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

    const eligibleDisplayLinks = displayLinks.filter((link) =>
      isAffiliateEligibleUrl(link.url),
    );

    if (!eligibleDisplayLinks.length) {
      continue;
    }

    withEligibleLinks += 1;

    const bodyLines = extractAuditedBodyLines(article.content || "");
    const requiredInlineLinks = eligibleDisplayLinks.filter((link) =>
      linkIsMentionedInBody(link, bodyLines),
    );

    if (!requiredInlineLinks.length) {
      fullCoverage += 1;
      if (options.verbose) {
        console.log(`SKIP ${article.slug} (no in-body affiliate mentions)`);
      }
      continue;
    }

    const matchedUrls = collectMatchedUrls(article.content || "", requiredInlineLinks);
    const matchedLinks = requiredInlineLinks.filter((link) =>
      matchedUrls.has(normalizeUrl(link.url)),
    );

    if (matchedLinks.length === requiredInlineLinks.length) {
      fullCoverage += 1;
      if (options.verbose) {
        console.log(`OK  ${article.slug} (${matchedLinks.length}/${requiredInlineLinks.length})`);
      }
      continue;
    }

    if (matchedLinks.length === 0) {
      zeroCoverage += 1;
    } else {
      partialCoverage += 1;
    }

    failures.push({
      slug: article.slug,
      title: article.title,
      articleType: article.articleType || "review",
      matched: matchedLinks.length,
      total: requiredInlineLinks.length,
      missing: requiredInlineLinks
        .filter((link) => !matchedUrls.has(normalizeUrl(link.url)))
        .slice(0, 10)
        .map((link) => link.label),
    });
  }

  const output = {
    scanned: rows.length,
    withEligibleLinks,
    fullCoverage,
    partialCoverage,
    zeroCoverage,
    sampleFailures: failures.slice(0, options.limit),
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error("Affiliate inline-link audit failed:", error.message);
  process.exitCode = 1;
});
