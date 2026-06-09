export type YouTubeChannelStats = {
  subscriberCount: number | null;
  viewCount: number | null;
};

type YouTubeChannelStatsResponse = {
  items?: Array<{
    statistics?: {
      hiddenSubscriberCount?: boolean;
      subscriberCount?: string;
      viewCount?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

const fallbackStats: YouTubeChannelStats = {
  subscriberCount: 60000,
  viewCount: 8000000,
};

function parseCount(value: string | undefined) {
  const count = Number(value || "");

  return Number.isFinite(count) ? count : null;
}

export function formatYouTubeCount(value: number | null, fallback: string) {
  if (value === null) {
    return fallback;
  }

  if (value >= 1_000_000) {
    const rounded = Math.floor(value / 100_000) / 10;

    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded} million`;
  }

  if (value >= 1_000) {
    return `${Math.floor(value / 1_000).toLocaleString("en-US")},000`;
  }

  return value.toLocaleString("en-US");
}

export async function fetchRunPlayBackChannelStats(): Promise<YouTubeChannelStats> {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return fallbackStats;
  }

  const params = new URLSearchParams({
    key: apiKey,
    part: "statistics",
  });

  if (process.env.YOUTUBE_CHANNEL_ID) {
    params.set("id", process.env.YOUTUBE_CHANNEL_ID);
  } else {
    params.set("forHandle", "runplayback");
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?${params.toString()}`,
      {
        next: {
          revalidate: 60 * 60 * 12,
        },
      },
    );
    const data = (await response.json()) as YouTubeChannelStatsResponse;

    if (!response.ok) {
      return fallbackStats;
    }

    const statistics = data.items?.[0]?.statistics;

    if (!statistics) {
      return fallbackStats;
    }

    return {
      subscriberCount: statistics.hiddenSubscriberCount
        ? fallbackStats.subscriberCount
        : parseCount(statistics.subscriberCount),
      viewCount: parseCount(statistics.viewCount),
    };
  } catch {
    return fallbackStats;
  }
}
