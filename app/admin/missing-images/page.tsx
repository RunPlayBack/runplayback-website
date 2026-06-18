import Link from "next/link";
import { AdminLayout } from "@/components/AdminLayout";
import { createClient } from "@/lib/supabase/server";
import { saveMissingArticleImage } from "./actions";

type MissingImagesPageProps = {
  searchParams?: Promise<{
    error?: string;
    q?: string;
    saved?: string;
  }>;
};

type ArticleRow = {
  content: string;
  featured_image_url: string | null;
  id: string;
  slug: string;
  title: string;
  videos:
    | {
        thumbnail_url: string | null;
        youtube_video_id: string | null;
      }
    | Array<{
        thumbnail_url: string | null;
        youtube_video_id: string | null;
      }>
    | null;
};

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

function getImageKey(url: string) {
  try {
    const parsed = new URL(url);

    return `${parsed.hostname.replace(/^www\./, "").toLowerCase()}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function extractMarkdownImages(content: string) {
  return [...content.matchAll(/^!\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/gm)].map(
    (match) => ({
      alt: match[1],
      url: match[2],
    }),
  );
}

function isVideoStillImage(url: string, alt = "") {
  return alt.toLowerCase().startsWith("video still") || url.includes("/article-stills/");
}

const knownLowQualityInlineImageUrls = new Set([
  "https://www.qronge.com/cdn/shop/files/3x_25.png?v=1775123287",
  "https://cdn.shopify.com/s/files/1/0583/5810/4213/files/Rectangle_9.jpg?v=1771140830",
  "https://www.sasikeibike.com/cdn/shop/files/1733390593915_160x.jpg?v=1733390617",
  "https://beyondriders.com/cdn/shop/files/Beyond_Riders_R_White__3.png?v=1755951808&width=600",
]);

function shouldUseFallbackInlineImage(url: string, alt = "") {
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

function isDuplicateThumbnailImage(
  url: string,
  { featuredImageUrl = "", youtubeVideoId = "" } = {},
) {
  const imageVideoId = getYouTubeThumbnailVideoId(url);

  if (
    imageVideoId &&
    (imageVideoId === youtubeVideoId ||
      imageVideoId === getYouTubeThumbnailVideoId(featuredImageUrl))
  ) {
    return true;
  }

  return Boolean(featuredImageUrl && getImageKey(url) === getImageKey(featuredImageUrl));
}

function hasRealProductImage(article: ArticleRow) {
  const video = Array.isArray(article.videos) ? article.videos[0] : article.videos;
  const featuredImageUrl = article.featured_image_url || video?.thumbnail_url || "";
  const youtubeVideoId = video?.youtube_video_id || "";

  return extractMarkdownImages(article.content).some(
    (image) =>
      !isVideoStillImage(image.url, image.alt) &&
      !shouldUseFallbackInlineImage(image.url, image.alt) &&
      !isDuplicateThumbnailImage(image.url, {
        featuredImageUrl,
        youtubeVideoId: youtubeVideoId || "",
      }),
  );
}

function getSearchQuery(title: string) {
  return title
    .replace(
      /\b(review|recipe|runplayback|youtube|video|real-world|first impressions|full|first ride)\b/gi,
      "",
    )
    .replace(/[:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default async function MissingImagesPage({
  searchParams,
}: MissingImagesPageProps) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createClient();
  let articles: ArticleRow[] = [];
  let missingCount = 0;
  let errorMessage = resolvedSearchParams?.error || "";
  const query = (resolvedSearchParams?.q || "").trim();
  const normalizedQuery = query.toLowerCase();
  const returnPath = `/admin/missing-images${query ? `?q=${encodeURIComponent(query)}` : ""}`;

  if (!supabase) {
    return (
      <AdminLayout>
        <div className="admin-card">
          <p className="eyebrow">Image Repair</p>
          <h1>Sign in required</h1>
          <p>Sign in to manage missing product images.</p>
        </div>
      </AdminLayout>
    );
  }

  const { data, error } = await supabase
    .from("articles")
    .select("id,title,slug,content,featured_image_url,videos(youtube_video_id,thumbnail_url)")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (error) {
    errorMessage = error.message;
  } else {
    const allArticles = (data || []) as unknown as ArticleRow[];
    const missingArticles = allArticles.filter((article) => !hasRealProductImage(article));

    missingCount = missingArticles.length;
    articles = normalizedQuery
      ? allArticles.filter((article) =>
          [article.title, article.slug].some((value) =>
            value.toLowerCase().includes(normalizedQuery),
          ),
        )
      : missingArticles;
  }

  return (
    <AdminLayout>
      <div className="admin-card">
        <p className="eyebrow">Image Repair</p>
        <h1>Product image repair</h1>
        <p>
          Search for a review, paste the correct product image URL, and save.
          Existing wrong images are replaced automatically.
        </p>
        <form action="/admin/missing-images" className="missing-image-search" method="get">
          <input
            defaultValue={query}
            name="q"
            placeholder="Search by title or slug"
            type="search"
          />
          <button className="button" type="submit">
            Search Reviews
          </button>
          {query ? (
            <Link className="button secondary-button" href="/admin/missing-images">
              Show Missing Only
            </Link>
          ) : null}
        </form>
        <p className="meta">
          {query
            ? `${articles.length} matching reviews.`
            : `${missingCount} reviews need product images.`}
        </p>
      </div>
      {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      {resolvedSearchParams?.saved ? (
        <p className="form-success">Product image saved.</p>
      ) : null}
      <div className="table-list">
        {articles.length ? (
          articles.map((article) => {
            const query = getSearchQuery(article.title);
            const searchUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(
              query,
            )}`;
            const hasProductImage = hasRealProductImage(article);

            return (
              <div className="missing-image-row" key={article.id}>
                <div>
                  <strong>{article.title}</strong>
                  <span className="image-repair-status">
                    {hasProductImage ? "Has image" : "Needs image"}
                  </span>
                  <p>{article.slug}</p>
                  <div className="video-row-actions">
                    <a
                      className="button secondary-button"
                      href={searchUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Search Images
                    </a>
                    <Link
                      className="button secondary-button"
                      href={`/articles/${article.slug}`}
                      target="_blank"
                    >
                      View Review
                    </Link>
                  </div>
                </div>
                <form action={saveMissingArticleImage} className="missing-image-form">
                  <input name="articleId" type="hidden" value={article.id} />
                  <input name="returnTo" type="hidden" value={returnPath} />
                  <label>
                    Product image URL
                    <input
                      name="imageUrl"
                      placeholder="Paste image URL"
                      required
                      type="url"
                    />
                  </label>
                  <button className="button" type="submit">
                    Save Image
                  </button>
                </form>
              </div>
            );
          })
        ) : (
          <div className="admin-card">
            <h2>No missing product images</h2>
            <p>Every published review currently has a product image.</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
