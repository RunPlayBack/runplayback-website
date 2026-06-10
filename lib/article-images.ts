import { extractLinksFromDescription } from "@/lib/youtube/links";

export type ArticleImageCandidate = {
  alt: string;
  sourceUrl: string;
  url: string;
};

type FindArticleImageCandidateOptions = {
  description: string | null;
  limit?: number;
  title: string;
};

type InsertArticleImagesOptions = {
  featuredImageUrl?: string | null;
  youtubeVideoId?: string | null;
};

type GoogleImageSearchResponse = {
  items?: Array<{
    image?: {
      contextLink?: string;
    };
    link?: string;
    title?: string;
  }>;
};

const blockedSourceHosts = [
  "youtube.com",
  "youtu.be",
  "instagram.com",
  "facebook.com",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "ebay.com",
  "walmart.com",
];

function decodeHtmlEntities(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function getImageKey(url: string) {
  try {
    const parsed = new URL(url);

    return `${parsed.hostname.replace(/^www\./, "").toLowerCase()}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function getYouTubeThumbnailVideoId(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

    if (!["img.youtube.com", "i.ytimg.com"].includes(host)) {
      return "";
    }

    return parsed.pathname.match(/\/vi\/([A-Za-z0-9_-]{11})\//)?.[1] || "";
  } catch {
    return "";
  }
}

function isDuplicateThumbnailImage(
  url: string,
  { featuredImageUrl = "", youtubeVideoId = "" }: InsertArticleImagesOptions,
) {
  const imageVideoId = getYouTubeThumbnailVideoId(url);

  if (
    imageVideoId &&
    (imageVideoId === youtubeVideoId ||
      imageVideoId === getYouTubeThumbnailVideoId(featuredImageUrl || ""))
  ) {
    return true;
  }

  return Boolean(featuredImageUrl && getImageKey(url) === getImageKey(featuredImageUrl));
}

function uniqueImageUrls(values: string[]) {
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const value of values.filter(Boolean)) {
    const key = getImageKey(value);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    urls.push(value.replace(/^http:\/\//, "https://"));
  }

  return urls;
}

function getHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function isOfficialProductSource(url: string) {
  const host = getHostname(url);

  if (!host) {
    return false;
  }

  return !blockedSourceHosts.some((blockedHost) => host.endsWith(blockedHost));
}

function isUsableImageUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const path = parsed.pathname.toLowerCase();
    const requestedWidth = Number(parsed.searchParams.get("width") || 0);

    return (
      parsed.protocol.startsWith("http") &&
      (!requestedWidth || requestedWidth >= 600) &&
      !host.endsWith("facebook.com") &&
      !url.includes("{") &&
      !url.includes("}") &&
      !url.toLowerCase().includes("%7b") &&
      !url.toLowerCase().includes("%7d") &&
      !path.includes("favicon") &&
      !path.includes("logo") &&
      !path.includes("noscript") &&
      !path.includes("pixel") &&
      !path.includes("sprite") &&
      !/_\d+x\./.test(path) &&
      !path.includes("beyond_riders_r_white") &&
      !path.endsWith(".gif") &&
      !path.endsWith(".svg")
    );
  } catch {
    return false;
  }
}

async function hasUsableImageDimensions(url: string) {
  try {
    const response = await fetch(url, { method: "HEAD" });
    const width = Number(response.headers.get("width") || 0);
    const height = Number(response.headers.get("height") || 0);

    if (!width || !height) {
      return true;
    }

    return width >= 600 && height >= 350;
  } catch {
    return true;
  }
}

function absolutizeUrl(value: string, pageUrl: string) {
  try {
    return new URL(decodeHtmlEntities(value), pageUrl).toString();
  } catch {
    return "";
  }
}

function getMetaContents(html: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escapedName}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "gi",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapedName}["'][^>]*>`,
      "gi",
    ),
  ];
  const values: string[] = [];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      if (match[1]) {
        values.push(decodeHtmlEntities(match[1].trim()));
      }
    }
  }

  return uniqueValues(values);
}

function getTitleFromHtml(html: string) {
  const title =
    getMetaContents(html, "og:title")[0] ||
    getMetaContents(html, "twitter:title")[0] ||
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
    "";

  return decodeHtmlEntities(title.replace(/\s+/g, " ").trim());
}

function collectJsonLdImages(value: unknown): string[] {
  if (!value) {
    return [];
  }

  if (typeof value === "string") {
    return isUsableImageUrl(value) || value.startsWith("/") ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectJsonLdImages(item));
  }

  if (typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const images = collectJsonLdImages(record.image);

  return [
    ...images,
    ...Object.values(record)
      .filter((item) => typeof item === "object")
      .flatMap((item) => collectJsonLdImages(item)),
  ];
}

function getJsonLdImages(html: string, pageUrl: string) {
  const matches = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  const images: string[] = [];

  for (const match of matches) {
    try {
      const parsed = JSON.parse(decodeHtmlEntities(match[1].trim()));
      images.push(
        ...collectJsonLdImages(parsed).map((image) => absolutizeUrl(image, pageUrl)),
      );
    } catch {
      // Some stores embed non-standard JSON-LD. Meta and image tags cover those.
    }
  }

  return uniqueImageUrls(images).filter(isUsableImageUrl);
}

function getImageTagImages(html: string, pageUrl: string) {
  const images: string[] = [];
  const imgMatches = html.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi);

  for (const match of imgMatches) {
    images.push(absolutizeUrl(match[1], pageUrl));
  }

  return uniqueImageUrls(images).filter(isUsableImageUrl);
}

function getProductPageImages(html: string, pageUrl: string) {
  const metaImages = [
    ...getMetaContents(html, "og:image"),
    ...getMetaContents(html, "og:image:secure_url"),
    ...getMetaContents(html, "twitter:image"),
    ...getMetaContents(html, "twitter:image:src"),
  ].map((image) => absolutizeUrl(image, pageUrl));

  return uniqueImageUrls([
    ...metaImages,
    ...getJsonLdImages(html, pageUrl),
    ...getImageTagImages(html, pageUrl),
  ]).filter(isUsableImageUrl);
}

async function fetchHtml(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; RunPlayBackArticleBot/1.0; +https://runplayback.com)",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    return {
      html: await response.text(),
      url: response.url || url,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getImagesFromProductPage(
  sourceUrl: string,
): Promise<ArticleImageCandidate[]> {
  const fetched = await fetchHtml(sourceUrl);

  if (!fetched) {
    return [];
  }

  const title = getTitleFromHtml(fetched.html) || "Product image";

  const images: ArticleImageCandidate[] = [];

  for (const url of getProductPageImages(fetched.html, fetched.url)) {
    if (!(await hasUsableImageDimensions(url))) {
      continue;
    }

    images.push({
      alt: title,
      sourceUrl,
      url,
    });
  }

  return images;
}

function getLifestyleImageScore(image: ArticleImageCandidate) {
  const searchable = `${image.alt} ${image.url}`.toLowerCase();
  let score = 0;

  if (/\b(ride|riding|rider|lifestyle|outdoor|street|road)\b/.test(searchable)) {
    score += 8;
  }

  if (/\b(camp|field|park|trail)\b/.test(searchable)) {
    score += 6;
  }

  if (/green-8|green-7|green-6|green-5|green-4/.test(searchable)) {
    score += 4;
  }

  if (!/-1\./.test(searchable)) {
    score += 1;
  }

  return score;
}

function chooseDistinctArticleImages(
  candidates: ArticleImageCandidate[],
  limit: number,
) {
  if (limit !== 2 || candidates.length <= 2) {
    return candidates.slice(0, limit);
  }

  const firstImage = candidates[0];
  const secondImage =
    candidates
      .slice(1)
      .sort(
        (first, second) =>
          getLifestyleImageScore(second) - getLifestyleImageScore(first),
      )[0] || candidates[1];

  return [firstImage, secondImage];
}

function getSearchQuery(title: string) {
  return title
    .replace(/\b(review|runplayback|youtube|video)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function getImagesFromGoogleSearch(
  title: string,
  limit: number,
): Promise<ArticleImageCandidate[]> {
  const apiKey = process.env.GOOGLE_IMAGE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_IMAGE_SEARCH_CX;

  if (!apiKey || !cx) {
    return [];
  }

  const params = new URLSearchParams({
    cx,
    key: apiKey,
    num: String(Math.min(limit, 10)),
    q: getSearchQuery(title),
    safe: "active",
    searchType: "image",
  });

  try {
    const response = await fetch(
      `https://www.googleapis.com/customsearch/v1?${params.toString()}`,
    );

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as GoogleImageSearchResponse;

    return (data.items || [])
      .filter((item) => item.link && isUsableImageUrl(item.link))
      .map((item) => ({
        alt: item.title || title,
        sourceUrl: item.image?.contextLink || item.link || "",
        url: item.link || "",
      }));
  } catch {
    return [];
  }
}

export async function findArticleImageCandidates({
  description,
  limit = 2,
  title,
}: FindArticleImageCandidateOptions) {
  const candidates: ArticleImageCandidate[] = [];
  const seenImages = new Set<string>();
  const officialLinks = extractLinksFromDescription(description || "")
    .filter((link) => isOfficialProductSource(link.url))
    .slice(0, 5);

  for (const link of officialLinks) {
    const images = await getImagesFromProductPage(link.url);

    for (const image of images) {
      const imageKey = getImageKey(image.url);

      if (seenImages.has(imageKey)) {
        continue;
      }

      candidates.push({
        ...image,
        url: image.url.replace(/^http:\/\//, "https://"),
        alt: link.label || image.alt,
      });
      seenImages.add(imageKey);
    }
  }

  if (candidates.length >= limit) {
    return chooseDistinctArticleImages(candidates, limit);
  }

  const googleImages = await getImagesFromGoogleSearch(title, limit);

  for (const image of googleImages) {
    const imageKey = getImageKey(image.url);

    if (seenImages.has(imageKey)) {
      continue;
    }

    candidates.push(image);
    seenImages.add(imageKey);

    if (candidates.length >= limit) {
      break;
    }
  }

  return chooseDistinctArticleImages(candidates, limit);
}

export function insertArticleImages(
  content: string,
  images: ArticleImageCandidate[],
  options: InsertArticleImagesOptions = {},
) {
  const selectedImages = images
    .filter((image) => !isDuplicateThumbnailImage(image.url, options))
    .slice(0, 1);

  if (!selectedImages.length) {
    return content;
  }

  const lines = content
    .split("\n")
    .filter((line) => !/^!\[[^\]]*\]\(https?:\/\/[^)]+\)$/.test(line.trim()));
  let firstParagraphIndex = -1;
  let activeHeading = "";

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return;
    }

    const isHeading =
      /^#{1,6}\s+/.test(trimmed) ||
      (trimmed.length < 80 &&
        !/^https?:\/\//.test(trimmed) &&
        !trimmed.endsWith(".") &&
        !trimmed.endsWith("?") &&
        !trimmed.endsWith("!"));

    if (isHeading) {
      activeHeading = trimmed
        .replace(/^#{1,6}\s+/, "")
        .replaceAll("**", "")
        .toLowerCase();

      return;
    }

    if (
      activeHeading === "links" ||
      activeHeading === "video" ||
      /^!\[.*\]\(https?:\/\//.test(trimmed)
    ) {
      return;
    }

    if (firstParagraphIndex === -1) {
      firstParagraphIndex = index;
    }
  });

  if (firstParagraphIndex === -1) {
    return content;
  }

  const insertions = [
    {
      index: firstParagraphIndex,
      markdown: `![${selectedImages[0].alt}](${selectedImages[0].url})`,
      placement: "after",
    },
  ];

  const output: string[] = [];

  lines.forEach((line, index) => {
    const beforeImage = insertions.find(
      (insertion) => insertion.index === index && insertion.placement === "before",
    );

    if (beforeImage) {
      output.push("", beforeImage.markdown, "");
    }

    output.push(line);

    const afterImage = insertions.find(
      (insertion) => insertion.index === index && insertion.placement === "after",
    );

    if (afterImage) {
      output.push("", afterImage.markdown, "");
    }
  });

  return output.join("\n").replace(/\n{4,}/g, "\n\n\n").trim();
}
