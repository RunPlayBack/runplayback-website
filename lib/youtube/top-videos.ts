export type YouTubeTopVideo = {
  description: string;
  durationSeconds: number;
  publishedAt: string | null;
  thumbnailUrl: string;
  title: string;
  videoUrl: string;
  viewCount: number;
  youtubeVideoId: string;
};

type ChannelVideosResponse = {
  items?: Array<{
    contentDetails?: {
      relatedPlaylists?: {
        uploads?: string;
      };
    };
  }>;
  error?: {
    message?: string;
  };
};

type PlaylistItemsResponse = {
  items?: Array<{
    contentDetails?: {
      videoId?: string;
      videoPublishedAt?: string;
    };
    snippet?: {
      description?: string;
      publishedAt?: string;
      thumbnails?: Record<string, { url?: string }>;
      title?: string;
    };
  }>;
  nextPageToken?: string;
  error?: {
    message?: string;
  };
};

type VideosResponse = {
  items?: Array<{
    id?: string;
    contentDetails?: {
      duration?: string;
    };
    snippet?: {
      description?: string;
      publishedAt?: string;
      thumbnails?: Record<string, { url?: string }>;
      title?: string;
    };
    statistics?: {
      viewCount?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

const defaultChannelHandle = "runplayback";
const defaultShortMaxSeconds = 180;
const defaultRecentMonths = 12;

function parseYouTubeDurationSeconds(duration: string) {
  const match = duration.match(
    /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/,
  );

  if (!match) {
    return 0;
  }

  const [, days = 0, hours = 0, minutes = 0, seconds = 0] = match;

  return (
    Number(days) * 86400 +
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds)
  );
}

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

function isLikelyShort(video: YouTubeTopVideo) {
  const searchable = `${video.title} ${video.description} ${video.videoUrl}`.toLowerCase();
  const configuredShortMaxSeconds = Number(
    process.env.YOUTUBE_SHORT_MAX_SECONDS || "",
  );
  const shortMaxSeconds =
    Number.isFinite(configuredShortMaxSeconds) && configuredShortMaxSeconds > 0
      ? configuredShortMaxSeconds
      : defaultShortMaxSeconds;

  return (
    (video.durationSeconds > 0 && video.durationSeconds <= shortMaxSeconds) ||
    /(^|\s)#shorts?\b/.test(searchable) ||
    searchable.includes("youtube.com/shorts/")
  );
}

function getRecentCutoffDate(months: number) {
  const cutoff = new Date();

  cutoff.setMonth(cutoff.getMonth() - months);

  return cutoff;
}

function wasPublishedAfter(video: YouTubeTopVideo, cutoffDate: Date) {
  if (!video.publishedAt) {
    return false;
  }

  const publishedAt = new Date(video.publishedAt);

  return Number.isFinite(publishedAt.getTime()) && publishedAt >= cutoffDate;
}

async function youtubeFetch<TResponse>(
  path: string,
  params: Record<string, string | number | undefined | null>,
) {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY is required in .env.local.");
  }

  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);

  for (const [key, value] of Object.entries({ ...params, key: apiKey })) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url);
  const data = (await response.json()) as TResponse & {
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(data.error?.message || `YouTube API failed for ${path}.`);
  }

  return data;
}

async function getUploadsPlaylistId() {
  if (process.env.YOUTUBE_UPLOADS_PLAYLIST_ID) {
    return process.env.YOUTUBE_UPLOADS_PLAYLIST_ID;
  }

  const params = process.env.YOUTUBE_CHANNEL_ID
    ? { id: process.env.YOUTUBE_CHANNEL_ID, part: "contentDetails" }
    : { forHandle: defaultChannelHandle, part: "contentDetails" };
  const data = await youtubeFetch<ChannelVideosResponse>("channels", params);
  const uploads = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

  if (!uploads) {
    throw new Error(
      "Unable to find RunPlayBack uploads playlist. Add YOUTUBE_CHANNEL_ID or YOUTUBE_UPLOADS_PLAYLIST_ID to .env.local.",
    );
  }

  return uploads;
}

async function fetchChannelVideos(scanLimit: number) {
  const uploadsPlaylistId = await getUploadsPlaylistId();
  const videos: Omit<YouTubeTopVideo, "durationSeconds" | "viewCount">[] = [];
  let pageToken = "";

  while (videos.length < scanLimit) {
    const data = await youtubeFetch<PlaylistItemsResponse>("playlistItems", {
      maxResults: 50,
      pageToken,
      part: "snippet,contentDetails",
      playlistId: uploadsPlaylistId,
    });

    for (const item of data.items || []) {
      const videoId = item.contentDetails?.videoId;
      const snippet = item.snippet || {};

      if (!videoId || snippet.title === "Private video") {
        continue;
      }

      videos.push({
        description: snippet.description || "",
        publishedAt:
          item.contentDetails?.videoPublishedAt || snippet.publishedAt || null,
        thumbnailUrl: getBestThumbnail(snippet.thumbnails, videoId),
        title: snippet.title || `YouTube Video ${videoId}`,
        videoUrl: `https://youtu.be/${videoId}`,
        youtubeVideoId: videoId,
      });

      if (videos.length >= scanLimit) {
        break;
      }
    }

    pageToken = data.nextPageToken || "";

    if (!pageToken) {
      break;
    }
  }

  return videos;
}

async function fetchVideoDetails(
  videos: Omit<YouTubeTopVideo, "durationSeconds" | "viewCount">[],
) {
  const detailedVideos: YouTubeTopVideo[] = [];

  for (let index = 0; index < videos.length; index += 50) {
    const chunk = videos.slice(index, index + 50);
    const data = await youtubeFetch<VideosResponse>("videos", {
      id: chunk.map((video) => video.youtubeVideoId).join(","),
      part: "contentDetails,statistics,snippet",
    });
    const byId = new Map(chunk.map((video) => [video.youtubeVideoId, video]));

    for (const item of data.items || []) {
      if (!item.id) {
        continue;
      }

      const fallback = byId.get(item.id);
      const snippet = item.snippet || {};

      if (!fallback) {
        continue;
      }

      detailedVideos.push({
        ...fallback,
        description: snippet.description || fallback.description,
        durationSeconds: parseYouTubeDurationSeconds(
          item.contentDetails?.duration || "",
        ),
        publishedAt: snippet.publishedAt || fallback.publishedAt,
        thumbnailUrl: getBestThumbnail(snippet.thumbnails, item.id),
        title: snippet.title || fallback.title,
        viewCount: Number(item.statistics?.viewCount || 0),
      });
    }
  }

  return detailedVideos;
}

export async function fetchTopRunPlayBackVideos(options?: {
  limit?: number;
  recentMonths?: number;
  scanLimit?: number;
}) {
  const limit = options?.limit || 8;
  const recentMonths = options?.recentMonths || defaultRecentMonths;
  const scanLimit = options?.scanLimit || 500;
  const cutoffDate = getRecentCutoffDate(recentMonths);
  const channelVideos = await fetchChannelVideos(scanLimit);
  const detailedVideos = await fetchVideoDetails(channelVideos);

  return detailedVideos
    .filter(
      (video) => !isLikelyShort(video) && wasPublishedAfter(video, cutoffDate),
    )
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, limit);
}
