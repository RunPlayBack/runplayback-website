import Link from "next/link";
import { getPopularVideos } from "@/lib/popular-videos";

export default async function PopularVideosPage() {
  const videos = await getPopularVideos();

  return (
    <main className="page">
      <div className="legacy-page">
        <div className="page-kicker">
          <span>Popular Videos</span>
        </div>
        <div className="video-grid">
          {videos.map((video) => (
            <Link
              className="video-tile"
              href={`/popularvideos/${video.youtubeVideoId}`}
              key={video.id}
              aria-label={video.title}
            >
              <img src={video.thumbnailUrl} alt="" />
              <span className="play-mark" />
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
