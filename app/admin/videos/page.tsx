import { AdminLayout } from "@/components/AdminLayout";
import { createClient } from "@/lib/supabase/server";
import {
  addYouTubeVideo,
  deleteVideo,
  generateDraftArticleFromVideo,
  importCaptionsFromYouTube,
  updateVideoTranscript,
} from "./actions";

type AdminVideosPageProps = {
  searchParams?: Promise<{
    error?: string;
    saved?: string;
    transcriptSaved?: string;
    captionsImported?: string;
    deleted?: string;
    youtubeConnected?: string;
  }>;
};

type AdminVideo = {
  id: string;
  youtube_video_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  video_url: string;
  published_at: string | null;
  created_at: string;
  captions_text: string | null;
  affiliate_links: Array<{
    id: string;
    label: string;
    url: string;
  }>;
};

const videoSelect =
  "id,youtube_video_id,title,description,thumbnail_url,video_url,published_at,created_at,captions_text,affiliate_links(id,label,url)";

function isMissingArchivedAtColumn(errorMessage: string) {
  return (
    errorMessage.includes("videos.archived_at does not exist") ||
    (errorMessage.includes("archived_at") && errorMessage.includes("schema cache"))
  );
}

function getStatusMessage(searchParams?: {
  error?: string;
  saved?: string;
  transcriptSaved?: string;
  captionsImported?: string;
  deleted?: string;
  youtubeConnected?: string;
}) {
  if (searchParams?.error) {
    return { className: "form-error", text: searchParams.error };
  }

  if (searchParams?.saved) {
    return { className: "form-success", text: "Video saved." };
  }

  if (searchParams?.transcriptSaved) {
    return { className: "form-success", text: "Transcript saved." };
  }

  if (searchParams?.captionsImported) {
    return { className: "form-success", text: "YouTube captions imported." };
  }

  if (searchParams?.deleted) {
    return { className: "form-success", text: "Video removed from queue." };
  }

  if (searchParams?.youtubeConnected) {
    return { className: "form-success", text: "YouTube captions connected." };
  }

  return null;
}

function shouldShowYouTubeReconnect(message?: string) {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();

  return (
    normalized.includes("youtube captions access expired") ||
    normalized.includes("token has been expired or revoked") ||
    normalized.includes("youtube authorization expired") ||
    normalized.includes("connect youtube captions")
  );
}

export default async function AdminVideosPage({
  searchParams,
}: AdminVideosPageProps) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createClient();
  let videos: AdminVideo[] = [];
  let errorMessage = resolvedSearchParams?.error;
  const statusMessage = getStatusMessage(resolvedSearchParams);

  if (supabase) {
    const { data, error } = await supabase
      .from("videos")
      .select(videoSelect)
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    if (error && isMissingArchivedAtColumn(error.message)) {
      const fallback = await supabase
        .from("videos")
        .select(videoSelect)
        .order("created_at", { ascending: false });

      if (fallback.error) {
        errorMessage = fallback.error.message;
      } else {
        videos = fallback.data || [];
      }
    } else if (error) {
      errorMessage = error.message;
    } else {
      videos = data || [];
    }
  }

  return (
    <AdminLayout>
      <div className="admin-card">
        <p className="eyebrow">Videos</p>
        <h1>Imported YouTube videos</h1>
        <p>
          Paste a RunPlayBack YouTube URL. The YouTube API fills title,
          description, thumbnail, publish date, and description links when your
          API key is configured. Paste a transcript to help OpenAI write a more
          accurate review draft.
        </p>
        <div className="actions">
          <a className="button" href="/admin/youtube/connect">
            Connect YouTube Captions
          </a>
        </div>
      </div>
      {statusMessage ? (
        <div className={statusMessage.className}>
          <p>{statusMessage.text}</p>
          {shouldShowYouTubeReconnect(statusMessage.text) ? (
            <div className="actions compact-actions">
              <a className="button" href="/admin/youtube/connect">
                Reconnect YouTube Captions
              </a>
            </div>
          ) : null}
        </div>
      ) : null}
      {errorMessage && !statusMessage ? <p className="form-error">{errorMessage}</p> : null}
      <form action={addYouTubeVideo} className="admin-card form">
        <p className="meta">Add YouTube Video</p>
        <label>
          YouTube URL
          <input
            name="video_url"
            placeholder="https://youtu.be/dKj79mhbpGs"
            required
          />
        </label>
        <label>
          Title
          <input
            name="title"
            placeholder="Optional fallback if the YouTube API key is not configured."
          />
        </label>
        <label>
          Description
          <textarea
            name="description"
            placeholder="Optional fallback if the YouTube API key is not configured."
          />
        </label>
        <label>
          Transcript / captions
          <textarea
            name="captions_text"
            placeholder="Optional. Paste the YouTube transcript here so OpenAI can write from the actual video."
          />
        </label>
        <button className="button" type="submit">
          Save Video
        </button>
      </form>
      <div className="table-list">
        {videos.length ? (
          videos.map((video) => (
            <div className="video-row" key={video.id}>
              {video.thumbnail_url ? (
                <img src={video.thumbnail_url} alt="" />
              ) : (
                <div className="video-row-placeholder" />
              )}
              <div>
                <strong>{video.title}</strong>
                <p>{video.youtube_video_id}</p>
                {video.published_at ? (
                  <p>Published {new Date(video.published_at).toLocaleDateString()}</p>
                ) : null}
                {video.affiliate_links.length ? (
                  <p>{video.affiliate_links.length} description links imported</p>
                ) : null}
                {video.captions_text ? (
                  <p>{video.captions_text.length.toLocaleString()} transcript characters saved</p>
                ) : (
                  <p>No transcript saved yet</p>
                )}
                {video.description ? <p>{video.description}</p> : null}
                <form
                  action={updateVideoTranscript.bind(null, video.id)}
                  className="video-transcript-form"
                >
                  <label>
                    Transcript / captions
                    <textarea
                      name="captions_text"
                      defaultValue={video.captions_text || ""}
                      placeholder="Paste or update the transcript for this video."
                    />
                  </label>
                  <button className="button" type="submit">
                    Save Transcript
                  </button>
                </form>
              </div>
              <div className="video-row-actions">
                <form action={importCaptionsFromYouTube.bind(null, video.id)}>
                  <button className="button" type="submit">
                    Import Captions
                  </button>
                </form>
                <form action={generateDraftArticleFromVideo.bind(null, video.id)}>
                  <button className="button" type="submit">
                    Generate Review Draft
                  </button>
                </form>
                <a className="button" href={video.video_url}>
                  Open
                </a>
                <form action={deleteVideo.bind(null, video.id)}>
                  <button className="button danger-button" type="submit">
                    Delete Video
                  </button>
                </form>
              </div>
            </div>
          ))
        ) : (
          <div className="admin-card">
            <h2>No videos yet</h2>
            <p>Paste a YouTube URL above to create the first imported video.</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
