import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPopularVideoByYouTubeId } from "@/lib/popular-videos";

type PopularVideoDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

const urlPattern = /https?:\/\/[^\s)\]}>"']+/g;

type VideoDescriptionContent = {
  links: Array<{
    label: string;
    url: string;
  }>;
  summary: string;
};

function cleanUrl(url: string) {
  return url.replace(/[.,;!?]+$/, "");
}

function parseDescriptionLinkLine(line: string) {
  const url = line.match(urlPattern)?.[0];

  if (!url) {
    return null;
  }

  const clean = cleanUrl(url);
  const label = line
    .slice(0, line.indexOf(url))
    .replace(/^[•*\-\s]+/g, "")
    .replace(/[-–—:;|.\s]+$/g, "")
    .trim();

  try {
    return {
      label: label || new URL(clean).hostname.replace(/^www\./, ""),
      url: clean,
    };
  } catch {
    return null;
  }
}

function getVideoDescriptionContent(description: string): VideoDescriptionContent {
  const lines = description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const summary: string[] = [];
  const links: VideoDescriptionContent["links"] = [];
  let isCollectingLinks = false;
  let hasSeenMerchLink = false;
  const seenUrls = new Set<string>();

  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    const isLinksHeading = /^links?\b/.test(lowerLine);
    const isStopHeading =
      /^(chapters?|timestamps?|follow|subscribe|social|website|contact|music|gear|camera|disclaimer|business)\b/.test(
        lowerLine,
      );

    if (isLinksHeading) {
      isCollectingLinks = true;
      continue;
    }

    if (isStopHeading || hasSeenMerchLink) {
      break;
    }

    const link = parseDescriptionLinkLine(line);

    if (link) {
      isCollectingLinks = true;

      if (!seenUrls.has(link.url)) {
        links.push(link);
        seenUrls.add(link.url);
      }

      if (link.label.toLowerCase().includes("runplayback merch")) {
        hasSeenMerchLink = true;
      }

      continue;
    }

    if (isCollectingLinks) {
      continue;
    }

    const cleanLine = line.replace(/(?:\s+#\w+)+$/g, "").trim();

    if (cleanLine) {
      summary.push(cleanLine);
    }
  }

  return {
    links,
    summary: summary.join("\n\n").trim(),
  };
}

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

  const descriptionContent = getVideoDescriptionContent(video.description);

  return (
    <main className="page">
      <div className="legacy-page">
        <div className="page-kicker">
          <span>Popular Videos</span>
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
          {descriptionContent.summary ? <p>{descriptionContent.summary}</p> : null}
          {descriptionContent.links.length ? (
            <section className="video-detail-links" aria-label="Video links">
              <h2 className="section-title">Links</h2>
              <div className="article-link-list video-detail-link-list">
                {descriptionContent.links.map((link) => (
                  <a href={link.url} key={link.url} rel="noreferrer" target="_blank">
                    {link.label}
                  </a>
                ))}
              </div>
            </section>
          ) : null}
          <div className="video-detail-actions">
            <Link className="button secondary-button" href="/popularvideos">
              Back to Popular Videos
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
