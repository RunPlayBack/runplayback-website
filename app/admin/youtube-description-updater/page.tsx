import Link from "next/link";
import { AdminLayout } from "@/components/AdminLayout";
import { createClient } from "@/lib/supabase/server";
import {
  buildYouTubeDescriptionUpdate,
  fetchYouTubeVideoSnippet,
} from "@/lib/youtube/description-updater";
import { getYouTubeVideoId } from "@/lib/youtube/video-id";
import { applyYouTubeDescriptionUpdate } from "./actions";

type YouTubeDescriptionUpdaterPageProps = {
  searchParams?: Promise<{
    error?: string;
    nochange?: string;
    updated?: string;
    video?: string;
  }>;
};

type VideoRow = {
  id: string;
  title: string;
  youtube_video_id: string;
};

type ArticleRow = {
  id: string;
  slug: string;
  title: string;
};

type UpdateLogRow = {
  article_slug: string;
  created_at: string;
  youtube_video_id: string;
};

type PreviewState = {
  article: ArticleRow;
  articleUrl: string;
  changed: boolean;
  changes: string[];
  currentDescription: string;
  proposedDescription: string;
  reviewUrl: string;
  video: VideoRow;
  youtubeTitle: string;
};

function getStatusMessage(searchParams?: {
  error?: string;
  nochange?: string;
  updated?: string;
}) {
  if (searchParams?.error) {
    return { className: "form-error", text: searchParams.error };
  }

  if (searchParams?.updated) {
    return { className: "form-success", text: "YouTube description updated." };
  }

  if (searchParams?.nochange) {
    return {
      className: "form-success",
      text: "No update needed. This description already has the requested links.",
    };
  }

  return null;
}

async function findPublishedArticleForVideo(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  youtubeVideoId: string,
) {
  const { data: video, error: videoError } = await supabase
    .from("videos")
    .select("id,title,youtube_video_id")
    .eq("youtube_video_id", youtubeVideoId)
    .maybeSingle<VideoRow>();

  if (videoError) {
    throw videoError;
  }

  if (!video) {
    throw new Error("No imported video was found for that YouTube video ID.");
  }

  const { data: article, error: articleError } = await supabase
    .from("articles")
    .select("id,title,slug")
    .eq("video_id", video.id)
    .eq("status", "published")
    .maybeSingle<ArticleRow>();

  if (articleError) {
    throw articleError;
  }

  if (!article) {
    throw new Error("No matching published review was found for that video.");
  }

  return { article, video };
}

export default async function YouTubeDescriptionUpdaterPage({
  searchParams,
}: YouTubeDescriptionUpdaterPageProps) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createClient();
  const statusMessage = getStatusMessage(resolvedSearchParams);
  const requestedVideo = resolvedSearchParams?.video || "";
  const youtubeVideoId = getYouTubeVideoId(requestedVideo);
  let preview: PreviewState | null = null;
  let previewError = "";
  let logs: UpdateLogRow[] = [];

  if (!supabase) {
    return (
      <AdminLayout>
        <div className="admin-card">
          <p className="eyebrow">YouTube Description Updater</p>
          <h1>Sign in required</h1>
          <p>Sign in to preview and update YouTube descriptions.</p>
        </div>
      </AdminLayout>
    );
  }

  if (youtubeVideoId) {
    try {
      const { article, video } = await findPublishedArticleForVideo(
        supabase,
        youtubeVideoId,
      );
      const liveVideo = await fetchYouTubeVideoSnippet(supabase, youtubeVideoId);
      const updatePreview = buildYouTubeDescriptionUpdate({
        articleSlug: article.slug,
        currentDescription: liveVideo.snippet.description || "",
      });

      preview = {
        article,
        articleUrl: `https://runplayback.com/articles/${article.slug}`,
        changed: updatePreview.changed,
        changes: updatePreview.changes,
        currentDescription: liveVideo.snippet.description || "",
        proposedDescription: updatePreview.proposedDescription,
        reviewUrl: updatePreview.reviewUrl,
        video,
        youtubeTitle: liveVideo.snippet.title || video.title,
      };
    } catch (error) {
      previewError =
        error instanceof Error
          ? error.message
          : "Unable to build a description preview.";
    }
  }

  const { data: logData } = await supabase
    .from("youtube_description_update_logs")
    .select("youtube_video_id,article_slug,created_at")
    .order("created_at", { ascending: false })
    .limit(10)
    .returns<UpdateLogRow[]>();

  logs = logData || [];

  return (
    <AdminLayout>
      <div className="admin-card">
        <p className="eyebrow">YouTube Description Updater</p>
        <h1>Preview one YouTube description update</h1>
        <p>
          Paste a YouTube URL or video ID. The tool only works when that video
          already has a matching published RunPlayBack review.
        </p>
        <div className="video-row-actions">
          <Link className="button secondary-button" href="/admin/youtube/connect">
            Connect YouTube
          </Link>
        </div>
      </div>
      {statusMessage ? (
        <p className={statusMessage.className}>{statusMessage.text}</p>
      ) : null}
      {previewError ? <p className="form-error">{previewError}</p> : null}
      <form
        action="/admin/youtube-description-updater"
        className="admin-card form"
        method="get"
      >
        <label>
          YouTube URL or video ID
          <input
            defaultValue={requestedVideo}
            name="video"
            placeholder="https://youtu.be/dKj79mhbpGs"
            required
          />
        </label>
        <button className="button" type="submit">
          Preview Update
        </button>
      </form>
      {preview ? (
        <>
          <div className="admin-card">
            <p className="eyebrow">Matched Video</p>
            <h2>{preview.youtubeTitle}</h2>
            <div className="description-updater-details">
              <p>
                <strong>YouTube video ID</strong>
                <span>{preview.video.youtube_video_id}</span>
              </p>
              <p>
                <strong>Matching article</strong>
                <a href={preview.articleUrl} rel="noreferrer" target="_blank">
                  {preview.articleUrl}
                </a>
              </p>
              <p>
                <strong>Review link to insert</strong>
                <span>{preview.reviewUrl}</span>
              </p>
            </div>
            {preview.changes.length ? (
              <div className="tag-list">
                {preview.changes.map((change) => (
                  <span className="tag" key={change}>
                    {change}
                  </span>
                ))}
              </div>
            ) : (
              <p>No changes are needed for this description.</p>
            )}
          </div>
          <div className="description-preview-grid">
            <div className="admin-card form">
              <label>
                Current description
                <textarea readOnly value={preview.currentDescription} />
              </label>
            </div>
            <div className="admin-card form">
              <label>
                Proposed description
                <textarea readOnly value={preview.proposedDescription} />
              </label>
            </div>
          </div>
          <form action={applyYouTubeDescriptionUpdate} className="admin-card">
            <input
              name="youtube_video_id"
              type="hidden"
              value={preview.video.youtube_video_id}
            />
            <button className="button" disabled={!preview.changed} type="submit">
              Apply Update
            </button>
          </form>
        </>
      ) : null}
      <div className="admin-card">
        <h2>Recent update log</h2>
        {logs.length ? (
          <div className="table-list">
            {logs.map((log) => (
              <div
                className="table-row youtube-description-log-row"
                key={`${log.youtube_video_id}-${log.created_at}`}
              >
                <div>
                  <strong>{log.youtube_video_id}</strong>
                  <p>{log.article_slug}</p>
                </div>
                <p>{new Date(log.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        ) : (
          <p>No YouTube descriptions have been updated yet.</p>
        )}
      </div>
    </AdminLayout>
  );
}
