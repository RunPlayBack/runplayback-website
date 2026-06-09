import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPopularVideoByYouTubeId } from "@/lib/popular-videos";

type PopularVideoDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function generateMetadata({
  params,
}: PopularVideoDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const video = await getPopularVideoByYouTubeId(id);

  if (!video) {
    return {
      title: "Popular Video | RunPlayBack",
    };
  }

  return {
    title: `${video.title} | RunPlayBack`,
    description:
      video.description ||
      "Watch a featured RunPlayBack YouTube video about electric bikes, scooters, and EV lifestyle gear.",
    openGraph: {
      title: video.title,
      description: video.description,
      images: [video.thumbnailUrl],
      type: "video.other",
    },
  };
}

export default async function PopularVideoDetailPage({
  params,
}: PopularVideoDetailPageProps) {
  const { id } = await params;
  const video = await getPopularVideoByYouTubeId(id);

  if (!video) {
    notFound();
  }

  return (
    <main className="page">
      <div className="legacy-page">
        <div className="page-kicker">
          <span>Popular Videos</span>
          <span>⌄</span>
        </div>
        <iframe
          className="video-embed"
          src={`https://www.youtube.com/embed/${video.youtubeVideoId}`}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
        <div className="video-detail-copy">
          <h1>{video.title}</h1>
          {video.description ? <p>{video.description}</p> : null}
          <div className="video-detail-actions">
            <Link className="button secondary-button" href="/popularvideos">
              Back to Popular Videos
            </Link>
            <a className="button" href={video.videoUrl}>
              Watch on YouTube
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
