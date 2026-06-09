export type YouTubeMetadata = {
  title: string;
  description: string;
  publishedAt: string | null;
  thumbnailUrl: string;
};

type YouTubeVideosResponse = {
  items?: Array<{
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      thumbnails?: Record<string, { url?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

function getBestThumbnail(
  thumbnails: Record<string, { url?: string }> | undefined,
  videoId: string,
) {
  return (
    thumbnails?.maxres?.url ||
    thumbnails?.standard?.url ||
    thumbnails?.high?.url ||
    thumbnails?.medium?.url ||
    thumbnails?.default?.url ||
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
  );
}

export async function fetchYouTubeMetadata(
  videoId: string,
): Promise<YouTubeMetadata | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return null;
  }

  const params = new URLSearchParams({
    id: videoId,
    key: apiKey,
    part: "snippet",
  });

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`,
  );

  const data = (await response.json()) as YouTubeVideosResponse;

  if (!response.ok) {
    throw new Error(data.error?.message || "Unable to fetch YouTube metadata.");
  }

  const snippet = data.items?.[0]?.snippet;

  if (!snippet?.title) {
    throw new Error("No YouTube video found for that URL.");
  }

  return {
    title: snippet.title,
    description: snippet.description || "",
    publishedAt: snippet.publishedAt || null,
    thumbnailUrl: getBestThumbnail(snippet.thumbnails, videoId),
  };
}
