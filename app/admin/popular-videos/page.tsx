import { AdminLayout } from "@/components/AdminLayout";
import { getPopularVideos } from "@/lib/popular-videos";
import {
  addPopularVideo,
  deletePopularVideo,
  refreshPopularVideosFromYouTube,
  updatePopularVideo,
} from "./actions";

type AdminPopularVideosPageProps = {
  searchParams?: Promise<{
    deleted?: string;
    error?: string;
    saved?: string;
    refreshed?: string;
    updated?: string;
  }>;
};

function getStatusMessage(searchParams?: {
  deleted?: string;
  error?: string;
  saved?: string;
  refreshed?: string;
  updated?: string;
}) {
  if (searchParams?.error) {
    return { className: "form-error", text: searchParams.error };
  }

  if (searchParams?.saved) {
    return { className: "form-success", text: "Popular video saved." };
  }

  if (searchParams?.refreshed) {
    return {
      className: "form-success",
      text: `Top ${searchParams.refreshed} YouTube videos from the past 12 months refreshed.`,
    };
  }

  if (searchParams?.updated) {
    return { className: "form-success", text: "Popular video updated." };
  }

  if (searchParams?.deleted) {
    return { className: "form-success", text: "Popular video deleted." };
  }

  return null;
}

export default async function AdminPopularVideosPage({
  searchParams,
}: AdminPopularVideosPageProps) {
  const resolvedSearchParams = await searchParams;
  const statusMessage = getStatusMessage(resolvedSearchParams);
  const popularVideos = await getPopularVideos({
    includeInactive: true,
    useFallback: false,
  });

  return (
    <AdminLayout>
      <div className="admin-card">
        <p className="eyebrow">Popular Videos</p>
        <h1>Choose the videos on the Popular Videos page</h1>
        <p>
          Add up to 8 YouTube videos, set their order, and choose which ones are
          active on the public page. The automatic refresh uses the highest-view
          full-length videos from the past 12 months.
        </p>
        <div className="actions">
          <form action={refreshPopularVideosFromYouTube}>
            <button className="button" type="submit">
              Refresh Recent Top 8 from YouTube
            </button>
          </form>
        </div>
      </div>
      {statusMessage ? (
        <p className={statusMessage.className}>{statusMessage.text}</p>
      ) : null}
      <form action={addPopularVideo} className="admin-card form">
        <p className="meta">Add Popular Video</p>
        <label>
          YouTube URL
          <input
            name="video_url"
            placeholder="https://youtu.be/dKj79mhbpGs"
            required
          />
        </label>
        <label>
          Position
          <input defaultValue="1" max="8" min="1" name="position" type="number" />
        </label>
        <button className="button" type="submit">
          Add Popular Video
        </button>
      </form>
      <div className="table-list">
        {popularVideos.length ? (
          popularVideos.map((video) => (
            <div className="video-row popular-video-row" key={video.id}>
              <img src={video.thumbnailUrl} alt="" />
              <form
                action={updatePopularVideo.bind(null, video.id)}
                className="popular-video-form"
              >
                <div className="popular-video-form-grid">
                  <label>
                    Position
                    <input
                      defaultValue={video.position}
                      max="8"
                      min="1"
                      name="position"
                      type="number"
                    />
                  </label>
                  <label>
                    YouTube Video ID
                    <input
                      defaultValue={video.youtubeVideoId}
                      name="youtube_video_id"
                      required
                    />
                  </label>
                  <label>
                    YouTube URL
                    <input defaultValue={video.videoUrl} name="video_url" required />
                  </label>
                  <label>
                    Thumbnail URL
                    <input defaultValue={video.thumbnailUrl} name="thumbnail_url" />
                  </label>
                </div>
                <label>
                  Title
                  <input defaultValue={video.title} name="title" required />
                </label>
                <label>
                  Description
                  <textarea
                    defaultValue={video.description}
                    name="description"
                    rows={4}
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    defaultChecked={video.isActive}
                    name="is_active"
                    type="checkbox"
                  />
                  Show on Popular Videos page
                </label>
                <div className="actions">
                  <button className="button" type="submit">
                    Save
                  </button>
                  <a
                    className="button secondary-button"
                    href={`/popularvideos/${video.youtubeVideoId}`}
                  >
                    Preview
                  </a>
                </div>
              </form>
              <form action={deletePopularVideo.bind(null, video.id)}>
                <button className="button danger-button" type="submit">
                  Delete
                </button>
              </form>
            </div>
          ))
        ) : (
          <div className="admin-card">
            <h2>No popular videos selected yet</h2>
            <p>
              Paste a YouTube URL above to choose the first video for the public
              Popular Videos page.
            </p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
