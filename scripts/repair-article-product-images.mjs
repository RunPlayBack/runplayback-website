import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

function loadEnv() {
  if (!fs.existsSync(".env.local")) {
    return;
  }

  const lines = fs.readFileSync(".env.local", "utf8").split("\n");

  for (const line of lines) {
    if (!line || line.startsWith("#")) {
      continue;
    }

    const index = line.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function requiredEnv(key) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`${key} is required in .env.local.`);
  }

  return value;
}

function getArgValue(name, fallback = "") {
  const exact = process.argv.find((arg) => arg.startsWith(`${name}=`));

  if (exact) {
    return exact.slice(name.length + 1);
  }

  const index = process.argv.indexOf(name);

  if (index !== -1) {
    return process.argv[index + 1] || fallback;
  }

  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function debugLog(message) {
  if (hasFlag("--debug-images")) {
    console.log(message);
  }
}

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

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

function loadArticleImageFallbacks() {
  try {
    return JSON.parse(fs.readFileSync("data/article-image-fallbacks.json", "utf8"));
  } catch {
    return {
      articles: {},
      videos: {},
    };
  }
}

const articleImageFallbacks = loadArticleImageFallbacks();
const knownArticleProductImages = new Map(
  Object.entries(articleImageFallbacks.articles || {}),
);
const knownVideoProductImages = new Map(
  Object.entries(articleImageFallbacks.videos || {}),
);

function isOfficialProductSource(url) {
  const host = getHostname(url);

  return Boolean(host) && !blockedSourceHosts.some((blockedHost) => host.endsWith(blockedHost));
}

function decodeHtmlEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function absolutizeUrl(value, pageUrl) {
  try {
    return new URL(decodeHtmlEntities(value), pageUrl).toString();
  } catch {
    return "";
  }
}

function getImageKey(url) {
  try {
    const parsed = new URL(url);

    return `${parsed.hostname.replace(/^www\./, "").toLowerCase()}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function getYouTubeThumbnailVideoId(url) {
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

function isDuplicateThumbnailImage(url, { featuredImageUrl = "", youtubeVideoId = "" } = {}) {
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

const knownLowQualityInlineImageUrls = new Set([
  "https://www.qronge.com/cdn/shop/files/3x_25.png?v=1775123287",
  "https://cdn.shopify.com/s/files/1/0583/5810/4213/files/Rectangle_9.jpg?v=1771140830",
  "https://www.sasikeibike.com/cdn/shop/files/1733390593915_160x.jpg?v=1733390617",
  "https://beyondriders.com/cdn/shop/files/Beyond_Riders_R_White__3.png?v=1755951808&width=600",
]);

function shouldUseFallbackInlineImage(url, alt = "") {
  if (knownLowQualityInlineImageUrls.has(url)) {
    return true;
  }

  if (alt.toLowerCase().includes("runplayback merch")) {
    return true;
  }

  try {
    const parsed = new URL(url);
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

function isUsableImageUrl(url) {
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

function getMetaContents(html, name) {
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
  const values = [];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      if (match[1]) {
        values.push(decodeHtmlEntities(match[1].trim()));
      }
    }
  }

  return [...new Set(values.filter(Boolean))];
}

function getSrcsetUrls(value, pageUrl) {
  return value
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .map((candidate) => absolutizeUrl(candidate, pageUrl))
    .filter(Boolean);
}

function getProductPageImages(html, pageUrl) {
  const urls = [];

  for (const name of ["og:image", "og:image:secure_url", "twitter:image"]) {
    urls.push(...getMetaContents(html, name).map((url) => absolutizeUrl(url, pageUrl)));
  }

  for (const match of html.matchAll(/<img\b[^>]+>/gi)) {
    const tag = match[0];
    const srcset =
      tag.match(/\bsrcset=["']([^"']+)["']/i)?.[1] ||
      tag.match(/\bdata-srcset=["']([^"']+)["']/i)?.[1];
    const src =
      tag.match(/\bsrc=["']([^"']+)["']/i)?.[1] ||
      tag.match(/\bdata-src=["']([^"']+)["']/i)?.[1];

    if (srcset) {
      urls.push(...getSrcsetUrls(srcset, pageUrl));
    }

    if (src) {
      urls.push(absolutizeUrl(src, pageUrl));
    }
  }

  const seen = new Set();
  const usable = [];

  for (const url of urls) {
    if (!url || !isUsableImageUrl(url)) {
      continue;
    }

    const key = getImageKey(url);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    usable.push(url.replace(/^http:\/\//, "https://"));
  }

  return usable;
}

function getSearchQuery(article) {
  return article.title
    .replace(/\b(review|recipe|runplayback|youtube|video|real-world|first impressions|full|first ride)\b/gi, "")
    .replace(/[:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function csvEscape(value) {
  return `"${String(value || "").replaceAll('"', '""')}"`;
}

function htmlEscape(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function writeMissingReport(rows) {
  if (!rows.length) {
    return "";
  }

  fs.mkdirSync("tmp", { recursive: true });

  const csvPath = "tmp/missing-article-images.csv";
  const htmlPath = "tmp/missing-article-images.html";
  const header = [
    "title",
    "slug",
    "youtube_video_id",
    "search_query",
    "google_images_url",
    "article_url",
  ];
  const csvRows = rows.map((row) =>
    [
      row.title,
      row.slug,
      row.youtubeVideoId,
      row.searchQuery,
      row.googleImagesUrl,
      row.articleUrl,
    ]
      .map(csvEscape)
      .join(","),
  );

  fs.writeFileSync(csvPath, [header.join(","), ...csvRows].join("\n"));

  const htmlRows = rows
    .map((row) => {
      const command = `npm run repair:article-images -- --slug=${row.slug} --image-url="PASTE_IMAGE_URL_HERE" --apply`;

      return `<tr>
        <td>${htmlEscape(row.title)}</td>
        <td><a href="${htmlEscape(row.googleImagesUrl)}" target="_blank" rel="noreferrer">Search images</a></td>
        <td><a href="${htmlEscape(row.articleUrl)}" target="_blank" rel="noreferrer">Article</a></td>
        <td><code>${htmlEscape(row.slug)}</code></td>
        <td><code>${htmlEscape(command)}</code></td>
      </tr>`;
    })
    .join("\n");

  fs.writeFileSync(
    htmlPath,
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>RunPlayBack Missing Article Images</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 32px; color: #181818; }
      h1 { font-size: 32px; margin-bottom: 8px; }
      p { color: #555; font-size: 16px; line-height: 1.5; max-width: 920px; }
      table { border-collapse: collapse; width: 100%; margin-top: 24px; }
      th, td { border: 1px solid #ddd; padding: 12px; text-align: left; vertical-align: top; }
      th { background: #f5f5f5; }
      code { display: block; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; }
      a { color: #111; font-weight: 700; }
    </style>
  </head>
  <body>
    <h1>Missing Article Product Images</h1>
    <p>Open a search link, choose a clear product image from the company/product page when possible, copy the image address, then paste it into the command for that article.</p>
    <table>
      <thead>
        <tr>
          <th>Article</th>
          <th>Image Search</th>
          <th>Article Page</th>
          <th>Slug</th>
          <th>Repair Command</th>
        </tr>
      </thead>
      <tbody>
        ${htmlRows}
      </tbody>
    </table>
  </body>
</html>`,
  );

  return `${csvPath} and ${htmlPath}`;
}

async function getImagesFromGoogleSearch(article) {
  const apiKey = process.env.GOOGLE_IMAGE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_IMAGE_SEARCH_CX;

  if (!apiKey || !cx) {
    return [];
  }

  const query = getSearchQuery(article);
  const params = new URLSearchParams({
    cx,
    key: apiKey,
    num: "10",
    q: query,
    safe: "active",
    searchType: "image",
  });

  try {
    const response = await fetch(
      `https://www.googleapis.com/customsearch/v1?${params.toString()}`,
    );

    if (!response.ok) {
      const body = await response.text();
      debugLog(
        `Google image search failed for "${query}": ${response.status} ${body.slice(0, 240)}`,
      );
      return [];
    }

    const data = await response.json();
    debugLog(
      `Google image search for "${query}" returned ${(data.items || []).length} results.`,
    );

    return (data.items || [])
      .map((item) => ({
        alt: item.title || article.title,
        url: item.link || "",
      }))
      .filter((image) => image.url && isUsableImageUrl(image.url))
      .slice(0, 10);
  } catch {
    return [];
  }
}

async function getImagesFromDuckDuckGo(article) {
  const query = `${getSearchQuery(article)} product image`;

  try {
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;
    const searchResponse = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; RunPlayBackArticleBot/1.0; +https://runplayback.com)",
      },
    });

    if (!searchResponse.ok) {
      return [];
    }

    const searchHtml = await searchResponse.text();
    const vqd =
      searchHtml.match(/vqd=['"]([^'"]+)['"]/)?.[1] ||
      searchHtml.match(/vqd=([^&"']+)/)?.[1];

    if (!vqd) {
      return [];
    }

    const params = new URLSearchParams({
      l: "us-en",
      o: "json",
      q: query,
      vqd,
      f: ",,,",
      p: "1",
    });
    const imageResponse = await fetch(`https://duckduckgo.com/i.js?${params.toString()}`, {
      headers: {
        Referer: searchUrl,
        "User-Agent":
          "Mozilla/5.0 (compatible; RunPlayBackArticleBot/1.0; +https://runplayback.com)",
      },
    });

    if (!imageResponse.ok) {
      return [];
    }

    const data = await imageResponse.json();

    return (data.results || [])
      .map((item) => ({
        alt: item.title || article.title,
        url: item.image || item.thumbnail || "",
      }))
      .filter((image) => image.url && isUsableImageUrl(image.url))
      .slice(0, 10);
  } catch {
    return [];
  }
}

function extractMarkdownImages(content) {
  return [...content.matchAll(/^!\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/gm)].map(
    (match) => ({
      alt: match[1],
      markdown: match[0],
      url: match[2],
    }),
  );
}

function hasRealInlineProductImage(article, video) {
  const images = extractMarkdownImages(article.content || "");
  const context = {
    featuredImageUrl: article.featured_image_url || video?.thumbnail_url || "",
    youtubeVideoId: video?.youtube_video_id || "",
  };

  return images.some(
    (image) =>
      !isVideoStillImage(image.url, image.alt) &&
      !shouldUseFallbackInlineImage(image.url, image.alt) &&
      !isDuplicateThumbnailImage(image.url, context),
  );
}

function isVideoStillImage(url, alt = "") {
  return alt.toLowerCase().startsWith("video still") || url.includes("/article-stills/");
}

function removeProductMarkdownImages(content) {
  return content
    .split("\n")
    .filter((line) => {
      const match = line
        .trim()
        .match(/^!\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/);

      if (!match) {
        return true;
      }

      return isVideoStillImage(match[2], match[1]);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function insertImageAfterFirstParagraph(content, image) {
  const lines = removeProductMarkdownImages(content).split("\n");
  let firstParagraphIndex = -1;
  let activeHeading = "";

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed || firstParagraphIndex !== -1) {
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

    if (activeHeading === "links" || activeHeading === "video") {
      return;
    }

    firstParagraphIndex = index;
  });

  if (firstParagraphIndex === -1) {
    return content;
  }

  const output = [];

  lines.forEach((line, index) => {
    output.push(line);

    if (index === firstParagraphIndex) {
      output.push("", `![${image.alt}](${image.url})`, "");
    }
  });

  return output.join("\n").replace(/\n{3,}/g, "\n\n");
}

async function findProductImage(article, video) {
  const knownImage =
    (manualImageUrl && targetSlug === article.slug ? manualImageUrl : "") ||
    knownArticleProductImages.get(article.slug) ||
    knownVideoProductImages.get(video?.youtube_video_id || "");

  if (knownImage) {
    return {
      alt: article.title,
      url: knownImage,
    };
  }

  const links = (article.affiliate_links || []).filter((link) =>
    isOfficialProductSource(link.url),
  );
  const context = {
    featuredImageUrl: article.featured_image_url || video?.thumbnail_url || "",
    youtubeVideoId: video?.youtube_video_id || "",
  };

  for (const link of links.slice(0, 6)) {
    try {
      const response = await fetch(link.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; RunPlayBackArticleBot/1.0; +https://runplayback.com)",
        },
        redirect: "follow",
      });

      if (!response.ok) {
        continue;
      }

      const html = await response.text();
      const imageUrl = getProductPageImages(html, response.url || link.url).find(
        (url) => !isDuplicateThumbnailImage(url, context),
      );

      if (imageUrl) {
        return {
          alt: link.label || article.title,
          url: imageUrl,
        };
      }
    } catch {
      // Keep scanning the next product link.
    }
  }

  const searchImages = await getImagesFromDuckDuckGo(article);
  const googleImages = await getImagesFromGoogleSearch(article);
  const searchImage = [...googleImages, ...searchImages].find(
    (image) => !isDuplicateThumbnailImage(image.url, context),
  );

  if (searchImage) {
    return searchImage;
  }

  return null;
}

loadEnv();

const shouldApply = hasFlag("--apply");
const limit = Number(getArgValue("--limit", "0")) || Infinity;
const targetSlug = getArgValue("--slug", "");
const manualImageUrl = getArgValue("--image-url", "");
const supabase = createClient(
  requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: {
      persistSession: false,
    },
  },
);

console.log(
  shouldApply
    ? "Scanning published articles and repairing missing product images..."
    : "Dry run: scanning published articles with missing product images...",
);

if (!process.env.GOOGLE_IMAGE_SEARCH_API_KEY || !process.env.GOOGLE_IMAGE_SEARCH_CX) {
  console.log(
    "Google image search fallback is not configured, so repair will only use saved product links and known fallbacks.",
  );
}

if (targetSlug) {
  console.log(`Only scanning slug: ${targetSlug}`);
}

if (manualImageUrl && !targetSlug) {
  throw new Error("--image-url must be used with --slug so the manual image only updates one article.");
}

let query = supabase
  .from("articles")
  .select(
    "id,title,slug,content,featured_image_url,status,videos(youtube_video_id,title,description,thumbnail_url),affiliate_links(label,url)",
  )
  .eq("status", "published")
  .order("published_at", { ascending: false });

if (targetSlug) {
  query = query.eq("slug", targetSlug);
}

const { data: articles, error } = await query;

if (error) {
  throw error;
}

let scanned = 0;
let missing = 0;
let repaired = 0;
let skipped = 0;
const skippedRows = [];

for (const article of articles || []) {
  if (scanned >= limit) {
    break;
  }

  scanned += 1;
  const video = Array.isArray(article.videos) ? article.videos[0] : article.videos;

  if (hasRealInlineProductImage(article, video)) {
    continue;
  }

  missing += 1;
  const image = await findProductImage(article, video);

  if (!image) {
    skipped += 1;
    const searchQuery = getSearchQuery(article);
    const youtubeVideoId = video?.youtube_video_id || "";
    skippedRows.push({
      articleUrl: `https://runplayback.com/articles/${article.slug}`,
      googleImagesUrl: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchQuery)}`,
      searchQuery,
      slug: article.slug,
      title: article.title,
      youtubeVideoId,
    });
    console.log(`No product image found: ${article.title}`);
    continue;
  }

  const nextContent = insertImageAfterFirstParagraph(article.content, image);
  console.log(`Repairing: ${article.title}`);
  console.log(`  Image: ${image.url}`);

  if (!shouldApply) {
    continue;
  }

  const { error: updateError } = await supabase
    .from("articles")
    .update({
      content: nextContent,
      updated_at: new Date().toISOString(),
    })
    .eq("id", article.id);

  if (updateError) {
    throw updateError;
  }

  repaired += 1;
}

console.log("");
console.log(`Scanned: ${scanned}`);
console.log(`Missing product image: ${missing}`);
console.log(`Repaired: ${repaired}`);
console.log(`Skipped without image: ${skipped}`);

const reportPath = writeMissingReport(skippedRows);

if (reportPath) {
  console.log(`Missing image report: ${reportPath}`);
}

if (!shouldApply) {
  console.log("");
  console.log("Run again with --apply to update Supabase.");
}
