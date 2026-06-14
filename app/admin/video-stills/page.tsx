import Link from "next/link";
import { AdminLayout } from "@/components/AdminLayout";
import { createClient } from "@/lib/supabase/server";

type VideoStillsPageProps = {
  searchParams?: Promise<{
    q?: string;
  }>;
};

type ArticleRow = {
  content: string;
  id: string;
  slug: string;
  title: string;
  videos:
    | {
        youtube_video_id: string | null;
      }
    | Array<{
        youtube_video_id: string | null;
      }>
    | null;
};

function getVideoStillCount(content: string) {
  return [...content.matchAll(/^!\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/gm)].filter(
    (match) =>
      match[1].toLowerCase().startsWith("video still") ||
      match[2].includes("/article-stills/"),
  ).length;
}

function getVideoId(article: ArticleRow) {
  const video = Array.isArray(article.videos) ? article.videos[0] : article.videos;

  return video?.youtube_video_id || "";
}

export default async function VideoStillsPage({
  searchParams,
}: VideoStillsPageProps) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createClient();
  const query = (resolvedSearchParams?.q || "").trim();
  const normalizedQuery = query.toLowerCase();
  let articles: ArticleRow[] = [];
  let errorMessage = "";

  if (!supabase) {
    return (
      <AdminLayout>
        <div className="admin-card">
          <p className="eyebrow">Video Stills</p>
          <h1>Sign in required</h1>
          <p>Sign in to manage video still imports.</p>
        </div>
      </AdminLayout>
    );
  }

  const { data, error } = await supabase
    .from("articles")
    .select("id,title,slug,content,videos(youtube_video_id)")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (error) {
    errorMessage = error.message;
  } else {
    articles = ((data || []) as unknown as ArticleRow[]).filter((article) =>
      normalizedQuery
        ? [article.title, article.slug].some((value) =>
            value.toLowerCase().includes(normalizedQuery),
          )
        : true,
    );
  }

  const completeCount = articles.filter(
    (article) => getVideoStillCount(article.content) >= 6,
  ).length;
  const missingCount = articles.length - completeCount;

  return (
    <AdminLayout>
      <div className="admin-card">
        <p className="eyebrow">Video Stills</p>
        <h1>Review video stills</h1>
        <p>
          Track which published reviews have six stills from the matching
          YouTube video. The importer extracts evenly spaced frames, uploads
          them to Supabase Storage, and inserts them throughout the review.
        </p>
        <form action="/admin/video-stills" className="missing-image-search" method="get">
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
            <Link className="button secondary-button" href="/admin/video-stills">
              Show All
            </Link>
          ) : null}
        </form>
      </div>
      {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      <div className="stats">
        <div className="admin-card stat">
          <strong>{completeCount}</strong>
          <p>Reviews with 6 stills</p>
        </div>
        <div className="admin-card stat">
          <strong>{missingCount}</strong>
          <p>Reviews needing stills</p>
        </div>
      </div>
      <div className="admin-card">
        <h2>Run an import batch</h2>
        <p>
          This heavy extraction step should run as a background script, not
          inside a browser request.
        </p>
        <pre className="admin-command">
{`cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run import:video-stills -- --limit=5 --apply`}
        </pre>
      </div>
      <div className="table-list">
        {articles.map((article) => {
          const stillCount = getVideoStillCount(article.content);
          const videoId = getVideoId(article);

          return (
            <div className="table-row" key={article.id}>
              <div>
                <strong>{article.title}</strong>
                <p>{article.slug}</p>
                <p className="meta">
                  {videoId ? `YouTube video: ${videoId}` : "No matched YouTube video"}
                </p>
              </div>
              <span className={`status ${stillCount >= 6 ? "published" : "draft"}`}>
                {stillCount}/6 stills
              </span>
              <Link className="button secondary-button" href={`/articles/${article.slug}`}>
                View
              </Link>
            </div>
          );
        })}
      </div>
    </AdminLayout>
  );
}
