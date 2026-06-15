import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/AdminLayout";
import { createClient } from "@/lib/supabase/server";
import { replaceArticleVideoStill } from "../actions";

type VideoStillEditorPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    error?: string;
    saved?: string;
  }>;
};

type ArticleRow = {
  content: string;
  id: string;
  slug: string;
  title: string;
  videos:
    | {
        title: string | null;
        video_url: string | null;
        youtube_video_id: string | null;
      }
    | Array<{
        title: string | null;
        video_url: string | null;
        youtube_video_id: string | null;
      }>
    | null;
};

type VideoStill = {
  alt: string;
  url: string;
};

const targetStillCount = 4;

function getVideoStills(content: string) {
  return [...content.matchAll(/^!\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/gm)]
    .map((match) => ({
      alt: match[1],
      url: match[2],
    }))
    .filter(
      (image) =>
        image.alt.toLowerCase().startsWith("video still") ||
        image.url.includes("/article-stills/"),
    )
    .slice(0, targetStillCount);
}

function getVideo(article: ArticleRow) {
  return Array.isArray(article.videos) ? article.videos[0] : article.videos;
}

function getStatusMessage(searchParams?: { error?: string; saved?: string }) {
  if (searchParams?.error) {
    return { className: "form-error", text: searchParams.error };
  }

  if (searchParams?.saved) {
    return { className: "form-success", text: "Video still saved." };
  }

  return null;
}

function StillCard({
  articleId,
  index,
  still,
}: {
  articleId: string;
  index: number;
  still: VideoStill;
}) {
  const replaceStillWithId = replaceArticleVideoStill.bind(null, articleId);

  return (
    <div className="video-still-card">
      <div>
        <p className="meta">Still {index + 1}</p>
        <Image
          alt={still.alt || `Video still ${index + 1}`}
          className="video-still-preview"
          height={360}
          src={still.url}
          unoptimized
          width={640}
        />
      </div>
      <form action={replaceStillWithId} className="video-still-form">
        <input name="stillIndex" type="hidden" value={index} />
        <label>
          Current image URL
          <input readOnly value={still.url} />
        </label>
        <label>
          Replacement image URL
          <input
            name="imageUrl"
            placeholder="Paste the new still image URL"
            required
            type="url"
          />
        </label>
        <button className="button" type="submit">
          Save Still
        </button>
      </form>
    </div>
  );
}

export default async function VideoStillEditorPage({
  params,
  searchParams,
}: VideoStillEditorPageProps) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const supabase = await createClient();

  if (!supabase) {
    notFound();
  }

  const { data: article, error } = await supabase
    .from("articles")
    .select("id,title,slug,content,videos(title,video_url,youtube_video_id)")
    .eq("id", id)
    .single<ArticleRow>();

  if (error || !article) {
    notFound();
  }

  const video = getVideo(article);
  const statusMessage = getStatusMessage(resolvedSearchParams);
  const stills = getVideoStills(article.content);

  return (
    <AdminLayout>
      <div className="admin-card">
        <p className="eyebrow">Video Stills</p>
        <h1>{article.title}</h1>
        <p>{article.slug}</p>
        <div className="video-row-actions">
          <Link className="button secondary-button" href="/admin/video-stills">
            Back to Video Stills
          </Link>
          <Link
            className="button secondary-button"
            href={`/articles/${article.slug}`}
            target="_blank"
          >
            View Review
          </Link>
          {video?.video_url ? (
            <a
              className="button secondary-button"
              href={video.video_url}
              rel="noreferrer"
              target="_blank"
            >
              Open YouTube Video
            </a>
          ) : null}
        </div>
      </div>
      {statusMessage ? (
        <p className={statusMessage.className}>{statusMessage.text}</p>
      ) : null}
      <div className="admin-card">
        <h2>Replace one still at a time</h2>
        <p>
          Paste a replacement image URL into the still you want to update. The
          other stills and the review text will stay unchanged.
        </p>
        {video?.youtube_video_id ? (
          <p className="meta">YouTube video: {video.youtube_video_id}</p>
        ) : null}
      </div>
      <div className="video-still-grid">
        {stills.length ? (
          stills.map((still, index) => (
            <StillCard
              articleId={article.id}
              index={index}
              key={`${still.url}-${index}`}
              still={still}
            />
          ))
        ) : (
          <div className="admin-card">
            <h2>No video stills found</h2>
            <p>
              Run the video still importer for this review first, then come
              back here to replace individual stills.
            </p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
