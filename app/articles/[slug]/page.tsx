import type { Metadata } from "next";
import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticleCategory } from "@/lib/article-categories";
import {
  getPublishedArticleBySlug,
  getPublishedArticles,
} from "@/lib/articles";
import rawArticleImageFallbacks from "@/data/article-image-fallbacks.json";

export const dynamic = "force-dynamic";

type ArticlePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

type ArticleBlock = {
  alt?: string;
  className?: string;
  href?: string;
  key: string;
  src?: string;
  text: string;
  type: "heading" | "image" | "list" | "paragraph";
};

type SharePlatform = "email" | "facebook" | "threads" | "x";

const articleImageFallbacks = rawArticleImageFallbacks as {
  articles: Record<string, string>;
  videos: Record<string, string>;
};

function containsUrl(line: string) {
  return /https?:\/\//.test(line);
}

const imageUrlReplacements = new Map([
  [
    "https://magicianebikes.com/cdn/shop/files/295f76d0-2bd0-4eff-93de-70ba6fb24942.png?v=1746688187&width=250",
    "https://magicianebikes.com/cdn/shop/files/B69069.png?v=1756883312&width=1090",
  ],
  [
    "https://www.mooncool.com/cdn/shop/files/TK1_7_9ad0f524-e2a4-49c9-8958-ca5a7c857970.png?v=1724665432&width=100",
    "https://www.mooncool.com/cdn/shop/files/20260311.61.png?v=1776239251&width=2048",
  ],
]);

const videoThumbnailImageReplacements = new Map(
  Object.entries(articleImageFallbacks.videos),
);
const articleImageReplacements = new Map(
  Object.entries(articleImageFallbacks.articles),
);

const knownLowQualityInlineImageUrls = new Set([
  "https://www.qronge.com/cdn/shop/files/3x_25.png?v=1775123287",
  "https://cdn.shopify.com/s/files/1/0583/5810/4213/files/Rectangle_9.jpg?v=1771140830",
  "https://www.sasikeibike.com/cdn/shop/files/1733390593915_160x.jpg?v=1733390617",
  "https://beyondriders.com/cdn/shop/files/Beyond_Riders_R_White__3.png?v=1755951808&width=600",
]);

function shouldUseFallbackInlineImage(src: string, alt = "") {
  if (knownLowQualityInlineImageUrls.has(src)) {
    return true;
  }

  if (alt.toLowerCase().includes("runplayback merch")) {
    return true;
  }

  try {
    const parsed = new URL(src);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const path = parsed.pathname.toLowerCase();
    const requestedWidth = Number(parsed.searchParams.get("width") || 0);

    return (
      (requestedWidth > 0 && requestedWidth < 600) ||
      host.endsWith("facebook.com") ||
      path.includes("pixel") ||
      path.includes("noscript") ||
      /_\d+x\./.test(path) ||
      path.includes("beyond_riders_r_white") ||
      path.endsWith(".gif")
    );
  } catch {
    return false;
  }
}

function getDisplayImageUrl(src: string, fallbackImageUrl = "", alt = "") {
  const replacement = imageUrlReplacements.get(src);

  if (replacement) {
    return replacement;
  }

  const thumbnailReplacement = videoThumbnailImageReplacements.get(
    getYouTubeThumbnailVideoId(src),
  );

  if (thumbnailReplacement) {
    return thumbnailReplacement;
  }

  if (fallbackImageUrl && shouldUseFallbackInlineImage(src, alt)) {
    return fallbackImageUrl;
  }

  return src;
}

function getYouTubeThumbnailVideoId(src: string) {
  try {
    const parsed = new URL(src);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

    if (!["img.youtube.com", "i.ytimg.com"].includes(host)) {
      return "";
    }

    return parsed.pathname.match(/\/vi\/([A-Za-z0-9_-]{11})\//)?.[1] || "";
  } catch {
    return "";
  }
}

function normalizeImageUrl(src: string) {
  try {
    const parsed = new URL(src);

    return `${parsed.hostname.replace(/^www\./, "").toLowerCase()}${parsed.pathname}`;
  } catch {
    return src;
  }
}

function isDuplicateArticleImage(
  src: string,
  featuredImageUrl = "",
  youtubeVideoId = "",
) {
  if (!src) {
    return true;
  }

  const srcVideoId = getYouTubeThumbnailVideoId(src);

  if (srcVideoId && (srcVideoId === youtubeVideoId || srcVideoId === getYouTubeThumbnailVideoId(featuredImageUrl))) {
    return true;
  }

  return Boolean(
    featuredImageUrl &&
      normalizeImageUrl(src) === normalizeImageUrl(featuredImageUrl),
  );
}

function parseGeneratedLinkLine(text: string) {
  const trimmed = text.replace(/^[-*]\s+/, "").trim();
  const labeledUrlMatch = trimmed.match(/^(.+?)\s*[:;|–—-]\s*(https?:\/\/\S+)$/);

  if (!labeledUrlMatch) {
    return {
      label: trimmed,
      url: "",
    };
  }

  const [, label, url] = labeledUrlMatch;
  const cleanLabel = label
    .replace(/^["“]|["”]$/g, "")
    .replaceAll("**", "")
    .trim();
  const cleanUrl = url.replace(/[.,;!?]+$/, "");

  if (!cleanLabel) {
    return {
      label: cleanUrl,
      url: "",
    };
  }

  return {
    label: cleanLabel,
    url: cleanUrl,
  };
}

function humanizeUrlLabel(url: string) {
  try {
    const parsed = new URL(url);
    const productPath = parsed.pathname
      .split("/")
      .filter(Boolean)
      .filter((part) => !["dp", "products", "shop", "list"].includes(part.toLowerCase()))
      .at(-1);

    if (productPath) {
      const label = productPath
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
        .trim();

      if (label && !/^[A-Z0-9]{8,}$/.test(label.replace(/\s/g, ""))) {
        return label;
      }
    }

    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function getArticleLinkLabel(label: string, url: string) {
  const cleanLabel = label
    .replace(/[-–—:;|]+$/g, "")
    .replaceAll("**", "")
    .trim();

  if (!cleanLabel || /^https?:\/\//i.test(cleanLabel)) {
    return humanizeUrlLabel(url);
  }

  return cleanLabel;
}

function renderLinkedText(text: string, keyPrefix: string): ReactNode[] {
  const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  const rawUrlPattern = /(https?:\/\/[^\s<]+)/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let markdownMatch: RegExpExecArray | null;

  while ((markdownMatch = markdownLinkPattern.exec(text)) !== null) {
    const [fullMatch, label, url] = markdownMatch;

    if (markdownMatch.index > lastIndex) {
      nodes.push(
        ...renderRawUrls(
          text.slice(lastIndex, markdownMatch.index),
          `${keyPrefix}-text-${lastIndex}`,
        ),
      );
    }

    nodes.push(
      <a
        className="inline-link"
        href={url}
        key={`${keyPrefix}-markdown-${markdownMatch.index}`}
        rel="noreferrer"
        target="_blank"
      >
        {label}
      </a>,
    );
    lastIndex = markdownMatch.index + fullMatch.length;
  }

  if (lastIndex < text.length) {
    nodes.push(
      ...renderRawUrls(text.slice(lastIndex), `${keyPrefix}-text-${lastIndex}`),
    );
  }

  function renderRawUrls(value: string, prefix: string): ReactNode[] {
    return value.split(rawUrlPattern).flatMap((part, index) => {
      if (!part.match(rawUrlPattern)) {
        return part;
      }

      const [, cleanUrl, trailing = ""] = part.match(/^(.+?)([.,;:!?)]*)$/) ?? [
        "",
        part,
        "",
      ];

      return [
        <a
          className="inline-link"
          href={cleanUrl}
          key={`${prefix}-url-${index}`}
          rel="noreferrer"
          target="_blank"
        >
          {cleanUrl}
        </a>,
        trailing,
      ];
    });
  }

  return nodes;
}

function renderInlineText(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).flatMap((part, index) => {
    const boldMatch = part.match(/^\*\*([^*]+)\*\*$/);

    if (boldMatch) {
      return renderLinkedText(boldMatch[1], `${keyPrefix}-bold-${index}`);
    }

    return renderLinkedText(part.replaceAll("**", ""), `${keyPrefix}-${index}`);
  });
}

function ShareIcon({ platform }: { platform: SharePlatform }) {
  if (platform === "email") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M4 6h16v12H4z" fill="none" stroke="currentColor" strokeWidth="2" />
        <path
          d="m4 7 8 6 8-6"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    );
  }

  if (platform === "facebook") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path
          d="M14.2 8.1V6.7c0-.7.5-1.1 1.2-1.1h1.5V3h-2.2c-2.6 0-4.1 1.5-4.1 4v1.1H8v3h2.6V21h3.6v-9.9h2.5l.5-3h-3z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (platform === "threads") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path
          d="M12.2 22c-5 0-8.5-3.3-8.5-9.9C3.7 5.4 7.2 2 12 2c3.7 0 6.5 1.9 7.7 5.2l-3.1 1.3c-.8-2.2-2.3-3.3-4.5-3.3-2.9 0-4.7 2.3-4.7 6.8 0 4.4 1.8 6.7 4.8 6.7 2.5 0 4.1-1.2 4.1-3 0-1-.5-1.7-1.4-2.1-.7 2-2.3 3.2-4.6 3.2-2.5 0-4.2-1.4-4.2-3.5 0-2.3 1.9-3.7 5-3.7.7 0 1.4.1 2 .2-.2-1.6-1.2-2.5-2.8-2.5-1.3 0-2.4.5-3.5 1.4l-1.8-2.3c1.5-1.3 3.3-1.9 5.4-1.9 3.5 0 5.6 2.1 5.8 5.8 2.1.7 3.3 2.4 3.3 4.6 0 3.8-3.2 6.1-7.4 6.1Zm-1.7-8.1c1.2 0 2-.7 2.3-1.9-.6-.1-1.2-.2-1.8-.2-1.2 0-1.9.5-1.9 1.1 0 .6.5 1 1.4 1Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M4 4h4.4l3.9 5.2L16.8 4H20l-6.1 7.1L20.5 20h-4.4l-4.3-5.8L6.8 20H3.5l6.7-7.8L4 4Zm3.1 2 10 12h1.3L8.4 6H7.1Z"
        fill="currentColor"
      />
    </svg>
  );
}

function stripMarkdownHeading(line: string) {
  return line.replace(/^#{1,6}\s+/, "").trim();
}

function normalizeHeading(line: string) {
  return stripMarkdownHeading(line).replaceAll("**", "").trim().toLowerCase();
}

function normalizeFirstPersonVoice(text: string) {
  return naturalizeReviewVoice(text
    .replace(/\bThis video is all about\b/gi, "My first impressions come down to")
    .replace(/\bThis video is a great reminder\b/gi, "This ride test is a great reminder")
    .replace(/\bThis episode is all about\b/gi, "My first impressions come down to")
    .replace(/\bIn this video, we take\b/gi, "For this review, I take")
    .replace(/\bIn this video, we did\b/gi, "For this review, I did")
    .replace(/\bIn this video, we install\b/gi, "For this review, I installed")
    .replace(/\bin this video\b/gi, "during my test")
    .replace(/\bfrom the video\b/gi, "from my test")
    .replace(/\bmentioned in the video\b/gi, "mentioned during my test")
    .replace(/\bas mentioned in the video\b/gi, "as I mentioned during testing")
    .replace(/\bas noted in the video\b/gi, "as I noted during testing")
    .replace(/\bper the video\b/gi, "based on my test")
    .replace(/\bthe video's vibe\b/gi, "my takeaway")
    .replace(/\bthe video calls out\b/gi, "I call out")
    .replace(/\bthe video notes\b/gi, "I note")
    .replace(/\bthe video suggests\b/gi, "my test suggests")
    .replace(/\bthe video features\b/gi, "this review features")
    .replace(/\bthe video mentions\b/gi, "I mention")
    .replace(/\bthe video points out\b/gi, "I point out")
    .replace(/\bthe video walks\b/gi, "I walk")
    .replace(/\bthe video\b/gi, "my test")
    .replace(/\bthe rider in my test\b/gi, "I")
    .replace(/\brider in my test\b/gi, "I")
    .replace(/\bfor the rider during my test\b/gi, "for me")
    .replace(/\bthe reviewer\b/gi, "I")
    .replace(/\bthe host\b/gi, "I")
    .replace(/\bI doesn’t\b/g, "I don’t")
    .replace(/\bI don't\b/g, "I don’t")
    .replace(/\bI strongly suggests\b/g, "I strongly suggest")
    .replace(/\bI also mentions\b/g, "I also mention")
    .replace(/\bI mentions\b/g, "I mention")
    .replace(/\bI suggests\b/g, "I suggest")
    .replace(/\bI reports\b/g, "I report")
    .replace(/\bI report ~(\d+)/g, "I saw around $1")
    .replace(/\bI report about (\d+)/g, "I saw about $1")
    .replace(/\bMy first impressions come down to first impressions[—-]/g, "My first impressions came down to ")
    .replace(/\bI shares\b/g, "I share")
    .replace(/\bI compares\b/g, "I compare")
    .replace(/\bI calls\b/g, "I call")
    .replace(/\bI notes\b/g, "I note")
    .replace(/\bI describes\b/g, "I describe"));
}

function naturalizeReviewVoice(text: string) {
  return text
    .replace(/\bI call out that\b/gi, "I noticed that")
    .replace(/\bI point out that\b/gi, "I noticed that")
    .replace(/\bI note that\b/gi, "I noticed that")
    .replace(/\bI mention that\b/gi, "I noticed that")
    .replace(/\bWith ([^,.]+), I noticed that it feels like\b/gi, "With $1, it feels like")
    .replace(/\bI share that\b/gi, "I found that")
    .replace(/\bI say that\b/gi, "I found that")
    .replace(/\band I say ([^.]+)/gi, "and $1")
    .replace(/\bthe ([a-z][a-z\s-]*?result) I share is\b/gi, "the $1 was")
    .replace(/\bthe ([a-z][a-z\s-]*?number) I share is\b/gi, "the $1 was")
    .replace(/\bthe ([a-z][a-z\s-]*?speed) I share is\b/gi, "the $1 was")
    .replace(/\bI share is\b/gi, "was")
    .replace(/\bI compare that to ([^.]+)\./gi, "For comparison, the stock setup hit $1.")
    .replace(
      /\bFor comparison, the stock setup hit ([^.]+) on the stock setup\./gi,
      "For comparison, the stock setup hit $1.",
    )
    .replace(/\bI walk step-by-step through\b/gi, "The install goes step-by-step through")
    .replace(/\bI walk through\b/gi, "The process covers")
    .replace(/\bI strongly suggest playing with\b/gi, "I’d start by playing with")
    .replace(/\bI suggest playing with\b/gi, "I’d start by playing with")
    .replace(/\bI strongly suggest\b/gi, "I’d recommend")
    .replace(/\bI suggest you’ll likely want\b/gi, "you’ll likely want")
    .replace(/\bI suggest you'll likely want\b/gi, "you’ll likely want")
    .replace(/\bI suggest you will likely want\b/gi, "you’ll likely want")
    .replace(/\(I bring up a ([^)]+) fitting easily\)/gi, "(a $1 fits easily)")
    .replace(/\bI bring up preferring\b/gi, "I prefer")
    .replace(/\bas I noted during testing\b/gi, "based on my testing")
    .replace(/\bI mention being about ([^)\\.]+)\b/gi, "I’m about $1")
    .replace(/\bI also mention comments from\b/gi, "I’ve also seen comments from")
    .replace(/\bI mention comments from\b/gi, "I’ve seen comments from")
    .replace(/\bI mention being\b/gi, "I’m")
    .replace(/\bI mention\b/gi, "I bring up")
    .replace(/\bI share\b/gi, "I found")
    .replace(/\bI call out\b/gi, "I noticed")
    .replace(/\bI point out\b/gi, "I noticed")
    .replace(/\bI note\b/gi, "I noticed")
    .replace(/\(I bring up a ([^)]+) fitting easily\)/gi, "(a $1 fits easily)")
    .replace(/\bI bring up preferring\b/gi, "I prefer");
}

function startsLikeSentence(line: string) {
  return /^(a|an|this|that|these|those|it|it's|its|there|there's|here|here's|if|when|while|with|without|for|in|on|across|coming|up front|downhill|uphill|one caveat)\b/i.test(
    stripMarkdownHeading(line),
  );
}

function shouldDemoteMarkdownHeading(line: string) {
  const strippedLine = stripMarkdownHeading(line);

  return startsLikeSentence(strippedLine) && !strippedLine.includes(":");
}

function isImplicitHeading(line: string) {
  const strippedLine = stripMarkdownHeading(line);
  const isUrlLine = containsUrl(strippedLine);
  const isDividerLine = /^[-*_]{3,}$/.test(strippedLine);
  const isListLine = /^[-*]\s+/.test(strippedLine) || /^\d+\.\s+/.test(strippedLine);

  return (
    strippedLine.length < 80 &&
    !isUrlLine &&
    !isDividerLine &&
    !isListLine &&
    !startsLikeSentence(strippedLine) &&
    !strippedLine.endsWith(".") &&
    !strippedLine.endsWith("?") &&
    !strippedLine.endsWith("!")
  );
}

function isYouTubeUrlLine(line: string) {
  const strippedLine = stripMarkdownHeading(line);

  return /^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//.test(strippedLine);
}

function containsYouTubeUrl(line: string) {
  return /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(line);
}

function isGeneratedThumbnailLine(line: string) {
  return /^thumbnail\s*:?\s+https?:\/\/\S+/i.test(stripMarkdownHeading(line));
}

function isYouTubeLink(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();

    return host === "youtube.com" || host === "youtu.be";
  } catch {
    return false;
  }
}

function getPlainArticleText(content: string) {
  return content
    .replace(/!\[[^\]]*\]\(https?:\/\/[^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getArticleKeywords(article: {
  title: string;
  video: { title: string } | null;
}) {
  const source = `${article.title} ${article.video?.title || ""}`.toLowerCase();
  const keywords = [
    "RunPlayBack",
    "EV lifestyle",
    "electric bike review",
    "electric scooter review",
    "electric mini bike",
    "e-bike review",
  ];

  if (source.includes("trike")) {
    keywords.push("electric trike review");
  }

  if (source.includes("battery")) {
    keywords.push("battery safety");
  }

  if (source.includes("tire") || source.includes("tires")) {
    keywords.push("electric bike tires");
  }

  return keywords;
}

const relatedArticleStopWords = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "back",
  "bike",
  "bikes",
  "can",
  "electric",
  "first",
  "for",
  "from",
  "full",
  "good",
  "has",
  "how",
  "into",
  "mini",
  "more",
  "new",
  "one",
  "over",
  "real",
  "review",
  "ride",
  "runplayback",
  "test",
  "testing",
  "the",
  "this",
  "top",
  "video",
  "what",
  "with",
  "world",
  "worth",
  "you",
]);

function getRelatedArticleTerms(article: {
  title: string;
  seoDescription: string;
  video: { title: string } | null;
}) {
  return `${article.title} ${article.video?.title || ""} ${article.seoDescription}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((term) => term.replace(/^-+|-+$/g, ""))
    .filter(
      (term) =>
        term.length > 2 &&
        !relatedArticleStopWords.has(term) &&
        !/^\d+$/.test(term),
    );
}

function getRelatedArticles(
  currentArticle: NonNullable<Awaited<ReturnType<typeof getPublishedArticleBySlug>>>,
  articles: Awaited<ReturnType<typeof getPublishedArticles>>,
) {
  const currentTerms = getRelatedArticleTerms(currentArticle);
  const currentTermSet = new Set(currentTerms);
  const currentSource = `${currentArticle.title} ${currentArticle.video?.title || ""}`.toLowerCase();

  return articles
    .filter((article) => article.slug !== currentArticle.slug)
    .map((article) => {
      const articleTerms = getRelatedArticleTerms(article);
      const articleTermSet = new Set(articleTerms);
      let score = 0;

      for (const term of articleTermSet) {
        if (currentTermSet.has(term)) {
          score += term.length > 5 ? 3 : 2;
        }
      }

      const relatedSource = `${article.title} ${article.video?.title || ""}`.toLowerCase();
      const sharedPhrases = [
        "surron",
        "sur ron",
        "onewheel",
        "trike",
        "folding",
        "fat tire",
        "battery",
        "brake",
        "helmet",
        "tire",
        "scooter",
        "mini bike",
        "dirt bike",
        "moped",
        "cargo",
        "drone",
      ];

      for (const phrase of sharedPhrases) {
        if (currentSource.includes(phrase) && relatedSource.includes(phrase)) {
          score += 6;
        }
      }

      if (article.authorName === currentArticle.authorName) {
        score += 1;
      }

      return {
        article,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return (
        new Date(b.article.displayPublishedAt || 0).getTime() -
        new Date(a.article.displayPublishedAt || 0).getTime()
      );
    })
    .slice(0, 5)
    .map((item) => item.article);
}

function isCurrentVideoLinkLine(line: string, youtubeVideoId = "") {
  if (!youtubeVideoId) {
    return false;
  }

  const strippedLine = stripMarkdownHeading(line);

  return (
    strippedLine.includes(`youtu.be/${youtubeVideoId}`) ||
    strippedLine.includes(`youtube.com/watch?v=${youtubeVideoId}`) ||
    strippedLine.includes(`youtube.com/embed/${youtubeVideoId}`)
  );
}

function buildArticleBlocks(
  content: string,
  fallbackImageUrl = "",
  youtubeVideoId = "",
): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  let activeHeading = "";
  let hasSeenMerchLink = false;
  let shouldSkipSection = false;
  let shouldSkipRemainingLinks = false;
  let shouldSkipNextYouTubeUrl = false;
  let inlineImageCount = 0;
  const lines = content.split("\n");

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return;
    }

    if (
      isGeneratedThumbnailLine(trimmed) ||
      isCurrentVideoLinkLine(trimmed, youtubeVideoId) ||
      /^(watch|video)\s*:?\s+https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(
        stripMarkdownHeading(trimmed),
      )
    ) {
      return;
    }

    if (shouldSkipNextYouTubeUrl && isYouTubeUrlLine(trimmed)) {
      shouldSkipNextYouTubeUrl = false;
      return;
    }

    shouldSkipNextYouTubeUrl = false;

    if (/^[-*_]{3,}$/.test(trimmed)) {
      return;
    }

    const headingMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
    const imageMatch = trimmed.match(/^!\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/);
    const listMatch = trimmed.match(/^[-*]\s+(.+)$/);
    const displayLine = headingMatch ? stripMarkdownHeading(trimmed) : trimmed;
    const isGeneratedLinksLine = activeHeading === "links";
    const isHeading =
      (Boolean(headingMatch) &&
        !containsUrl(displayLine) &&
        !shouldDemoteMarkdownHeading(trimmed)) ||
      (!isGeneratedLinksLine && isImplicitHeading(trimmed));
    const heading = stripMarkdownHeading(trimmed);

    if (isHeading) {
      activeHeading = normalizeHeading(trimmed);
      shouldSkipSection = activeHeading === "video";
      shouldSkipNextYouTubeUrl =
        !shouldSkipSection &&
        isYouTubeUrlLine(lines.slice(index + 1).find((nextLine) => nextLine.trim()) || "");

      if (shouldSkipSection || shouldSkipNextYouTubeUrl) {
        return;
      }

      blocks.push({
        key: `${heading}-${index}`,
        text: normalizeFirstPersonVoice(heading),
        type: "heading",
      });
      return;
    }

    if (imageMatch && !shouldSkipSection) {
      if (inlineImageCount > 0) {
        return;
      }

      const displayImageUrl = getDisplayImageUrl(
        imageMatch[2],
        fallbackImageUrl,
        imageMatch[1],
      );

      if (isDuplicateArticleImage(displayImageUrl, fallbackImageUrl, youtubeVideoId)) {
        return;
      }

      inlineImageCount += 1;
      blocks.push({
        alt: imageMatch[1] || "Review image",
        key: `article-image-${index}`,
        src: displayImageUrl,
        text: imageMatch[1] || "",
        type: "image",
      });
      return;
    }

    if (shouldSkipSection) {
      return;
    }

    const generatedLink = isGeneratedLinksLine
      ? parseGeneratedLinkLine(displayLine)
      : null;
    const linkText = generatedLink
      ? generatedLink.label
      : listMatch
        ? listMatch[1]
        : displayLine;
    const isHyperlinkLine = Boolean(generatedLink?.url) || /https?:\/\//.test(linkText);
    const isMerchLine = linkText
      .toLowerCase()
      .includes("runplayback merch");

    if (
      (isGeneratedLinksLine && shouldSkipRemainingLinks) ||
      (isGeneratedLinksLine && containsYouTubeUrl(linkText)) ||
      (hasSeenMerchLink && isHyperlinkLine && !isMerchLine)
    ) {
      return;
    }

    const isUrlLine = /^https?:\/\//.test(stripMarkdownHeading(trimmed));
    const className =
      isGeneratedLinksLine || isUrlLine
        ? isGeneratedLinksLine
          ? "article-compact-links article-generated-link"
          : "article-compact-links"
        : undefined;

    blocks.push({
      className: listMatch && !isGeneratedLinksLine
        ? `article-list-line ${className || ""}`.trim()
        : className,
      href: generatedLink?.url || undefined,
      key: `${linkText}-${index}`,
      text: normalizeFirstPersonVoice(linkText),
      type: listMatch && !isGeneratedLinksLine ? "list" : "paragraph",
    });

    if (
      isGeneratedLinksLine &&
      isMerchLine
    ) {
      shouldSkipRemainingLinks = true;
    }

    if (isMerchLine) {
      hasSeenMerchLink = true;
    }
  });

  return blocks;
}

function addFallbackArticleImage(
  blocks: ArticleBlock[],
  slug = "",
  youtubeVideoId = "",
  title = "Review image",
) {
  const fallbackImageUrl =
    articleImageReplacements.get(slug) ||
    videoThumbnailImageReplacements.get(youtubeVideoId);

  if (!fallbackImageUrl || blocks.some((block) => block.type === "image")) {
    return blocks;
  }

  const firstParagraphIndex = blocks.findIndex(
    (block) =>
      block.type === "paragraph" &&
      !block.className?.includes("article-compact-links"),
  );

  if (firstParagraphIndex === -1) {
    return blocks;
  }

  return [
    ...blocks.slice(0, firstParagraphIndex + 1),
    {
      alt: title,
      key: `fallback-article-image-${slug || youtubeVideoId}`,
      src: fallbackImageUrl,
      text: title,
      type: "image" as const,
    },
    ...blocks.slice(firstParagraphIndex + 1),
  ];
}

function formatArticleDate(value: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export async function generateMetadata({
  params,
}: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);

  if (!article) {
    return {};
  }

  return {
    title: article.seoTitle,
    description: article.seoDescription,
    alternates: {
      canonical: `/articles/${article.slug}`,
      types: {
        "application/rss+xml": "/rss.xml",
      },
    },
    openGraph: {
      type: "article",
      title: article.seoTitle,
      description: article.seoDescription,
      url: `/articles/${article.slug}`,
      images: article.featuredImageUrl
        ? [
            {
              url: article.featuredImageUrl,
              alt: article.title,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: article.seoTitle,
      description: article.seoDescription,
      images: article.featuredImageUrl ? [article.featuredImageUrl] : undefined,
    },
  };
}

export default async function ArticleDetailPage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  const articles = await getPublishedArticles();
  const currentArticleIndex = articles.findIndex((item) => item.slug === article.slug);
  const nextArticle =
    currentArticleIndex >= 0 ? articles[currentArticleIndex + 1] : null;
  const relatedArticles = getRelatedArticles(article, articles);
  const articleCategory = getArticleCategory(article);
  const articleUrl = `https://runplayback.com/articles/${article.slug}`;
  const plainArticleText = getPlainArticleText(article.content);
  const shareLinks = [
    {
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(articleUrl)}`,
      label: "Facebook",
      platform: "facebook" as const,
    },
    {
      href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(articleUrl)}&text=${encodeURIComponent(article.title)}`,
      label: "X",
      platform: "x" as const,
    },
    {
      href: `https://www.threads.net/intent/post?url=${encodeURIComponent(articleUrl)}&text=${encodeURIComponent(article.title)}`,
      label: "Threads",
      platform: "threads" as const,
    },
    {
      href: `mailto:?subject=${encodeURIComponent(article.title)}&body=${encodeURIComponent(articleUrl)}`,
      label: "Email",
      platform: "email" as const,
    },
  ];
  const articleBlocks = addFallbackArticleImage(
    buildArticleBlocks(
      article.content,
      article.featuredImageUrl,
      article.video?.youtubeVideoId,
    ),
    article.slug,
    article.video?.youtubeVideoId,
    article.title,
  );
  const firstBodyLinksBlockIndex = articleBlocks.findIndex(
    (block) => block.type === "heading" && normalizeHeading(block.text) === "links",
  );
  const relatedReviewsSection = relatedArticles.length ? (
    <section className="article-related-section" aria-label="Related reviews">
      <h2>Related Reviews</h2>
      <div className="article-related-links">
        {relatedArticles.map((relatedArticle) => (
          <Link href={`/articles/${relatedArticle.slug}`} key={relatedArticle.id}>
            {relatedArticle.title}
          </Link>
        ))}
      </div>
    </section>
  ) : null;
  const merchLinkIndex = article.links.findIndex((link) =>
    link.label.toLowerCase().includes("runplayback merch"),
  );
  const visibleArticleLinksBase =
    merchLinkIndex === -1
      ? article.links
      : article.links.slice(0, merchLinkIndex + 1);
  const visibleArticleLinks = visibleArticleLinksBase.filter(
    (link) => !isYouTubeLink(link.url),
  );

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${articleUrl}#article`,
        headline: article.title,
        datePublished: article.displayPublishedAt,
        dateModified: article.publishedAt || article.displayPublishedAt,
        description: article.seoDescription,
        image: article.featuredImageUrl,
        keywords: getArticleKeywords(article),
        wordCount: plainArticleText ? plainArticleText.split(/\s+/).length : undefined,
        author: {
          "@type": "Person",
          name: article.authorName,
        },
        publisher: {
          "@id": "https://runplayback.com/#organization",
        },
        mainEntityOfPage: {
          "@id": `${articleUrl}#webpage`,
        },
        ...(article.video
          ? {
              video: {
                "@id": `${articleUrl}#video`,
              },
            }
          : {}),
      },
      {
        "@type": "WebPage",
        "@id": `${articleUrl}#webpage`,
        url: articleUrl,
        name: article.seoTitle,
        description: article.seoDescription,
        isPartOf: {
          "@id": "https://runplayback.com/#website",
        },
        breadcrumb: {
          "@id": `${articleUrl}#breadcrumb`,
        },
        primaryImageOfPage: article.featuredImageUrl
          ? {
              "@type": "ImageObject",
              url: article.featuredImageUrl,
            }
          : undefined,
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${articleUrl}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: "https://runplayback.com/",
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Reviews",
            item: "https://runplayback.com/articles",
          },
          {
            "@type": "ListItem",
            position: 3,
            name: article.title,
            item: articleUrl,
          },
        ],
      },
      ...(article.video
        ? [
            {
              "@type": "VideoObject",
              "@id": `${articleUrl}#video`,
              name: article.video.title,
              description: article.seoDescription,
              thumbnailUrl: [
                `https://img.youtube.com/vi/${article.video.youtubeVideoId}/hqdefault.jpg`,
              ],
              embedUrl: `https://www.youtube.com/embed/${article.video.youtubeVideoId}`,
              url: article.video.videoUrl,
              uploadDate: article.video.publishedAt || article.displayPublishedAt,
              publisher: {
                "@id": "https://runplayback.com/#organization",
              },
            },
          ]
        : []),
    ],
  };

  return (
    <main className="page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <article className="legacy-page">
        <div className="page-kicker">
          <span>Review</span>
        </div>
        {article.featuredImageUrl ? (
          <img className="hero-image" src={article.featuredImageUrl} alt="" />
        ) : null}
        <div className="copy article-content">
          <h1>{article.title}</h1>
          <Link
            className="category-link"
            href={`/articles/categories/${articleCategory.slug}`}
          >
            {articleCategory.label}
          </Link>
          <p className="article-author">Written by {article.authorName}</p>
          {article.displayPublishedAt ? (
            <p className="article-date">
              {formatArticleDate(article.displayPublishedAt)}
            </p>
          ) : null}
          {articleBlocks.map((block, index) => {
            const shouldInsertRelatedReviews =
              relatedReviewsSection && index === firstBodyLinksBlockIndex;
            let renderedBlock: ReactNode;

            if (block.type === "heading") {
              renderedBlock = (
                <h2 key={block.key}>
                  {renderInlineText(block.text, `heading-${index}`)}
                </h2>
              );
            } else if (block.type === "list") {
              renderedBlock = (
                <p className={block.className} key={block.key}>
                  {block.className?.includes("article-generated-link") ? null : (
                    <span aria-hidden="true">• </span>
                  )}
                  {block.href ? (
                    <a
                      className="inline-link"
                      href={block.href}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {block.text}
                    </a>
                  ) : (
                    renderInlineText(block.text, `list-${index}`)
                  )}
                </p>
              );
            } else if (block.type === "image" && block.src) {
              renderedBlock = (
                <figure className="article-inline-image" key={block.key}>
                  <img src={block.src} alt={block.alt || ""} />
                </figure>
              );
            } else {
              renderedBlock = (
                <p className={block.className} key={block.key}>
                  {block.href ? (
                    <a
                      className="inline-link"
                      href={block.href}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {block.text}
                    </a>
                  ) : (
                    renderInlineText(block.text, `paragraph-${index}`)
                  )}
                </p>
              );
            }

            return (
              <Fragment key={block.key}>
                {shouldInsertRelatedReviews ? relatedReviewsSection : null}
                {renderedBlock}
              </Fragment>
            );
          })}
        </div>
        {article.video ? (
          <section className="article-video-section" aria-label="Review video">
            <h2 className="section-title">Watch The Video</h2>
            <iframe
              className="video-embed"
              src={`https://www.youtube.com/embed/${article.video.youtubeVideoId}`}
              title={`${article.title} video`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </section>
        ) : null}
        {firstBodyLinksBlockIndex === -1 ? relatedReviewsSection : null}
        {visibleArticleLinks.length ? (
          <section className="article-video-section" aria-label="Review links">
            <h2 className="section-title">Links</h2>
            <div className="article-link-list">
              {visibleArticleLinks.map((link) => (
                <a href={link.url} key={link.id} rel="noreferrer" target="_blank">
                  {getArticleLinkLabel(link.label, link.url)}
                </a>
              ))}
            </div>
          </section>
        ) : null}
        <section className="article-share-section" aria-label="Share this review">
          <h2 className="section-title">Share This Review</h2>
          <div className="article-share-links">
            {shareLinks.map((link) => (
              <a
                aria-label={`Share on ${link.label}`}
                href={link.href}
                key={link.label}
                rel="noreferrer"
                target="_blank"
              >
                <ShareIcon platform={link.platform} />
              </a>
            ))}
          </div>
        </section>
        <nav className="article-navigation" aria-label="Review navigation">
          <Link className="button secondary-button" href="/articles">
            All Reviews
          </Link>
          {nextArticle ? (
            <Link className="button" href={`/articles/${nextArticle.slug}`}>
              Next Review
            </Link>
          ) : null}
        </nav>
      </article>
    </main>
  );
}
