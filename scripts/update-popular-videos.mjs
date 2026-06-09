import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const defaultChannelHandle = "runplayback";
const defaultShortMaxSeconds = 180;
const defaultRecentMonths = 12;

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");

  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);

    if (!match) {
      continue;
    }

    const key = match[1].trim();
    const value = match[2].trim().replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required in .env.local.`);
  }

  return value;
}

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));

  return value ? value.slice(prefix.length) : fallback;
}

function getNumberArg(name, fallback) {
  const value = Number(getArg(name, ""));

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseYouTubeDurationSeconds(duration) {
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

function getBestThumbnail(thumbnails, videoId) {
  return (
    thumbnails?.maxres?.url ||
    thumbnails?.standard?.url ||
    thumbnails?.high?.url ||
    thumbnails?.medium?.url ||
    thumbnails?.default?.url ||
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
  );
}

function isLikelyShort(video) {
  const searchable = `${video.title} ${video.description} ${video.videoUrl}`.toLowerCase();
  const shortMaxSeconds = getNumberArg(
    "short-max-seconds",
    Number(process.env.YOUTUBE_SHORT_MAX_SECONDS || "") || defaultShortMaxSeconds,
  );

  return (
    (video.durationSeconds > 0 && video.durationSeconds <= shortMaxSeconds) ||
    /(^|\s)#shorts?\b/.test(searchable) ||
    searchable.includes("youtube.com/shorts/")
  );
}

function getRecentCutoffDate(months) {
  const cutoff = new Date();

  cutoff.setMonth(cutoff.getMonth() - months);

  return cutoff;
}

function wasPublishedAfter(video, cutoffDate) {
  if (!video.publishedAt) {
    return false;
  }

  const publishedAt = new Date(video.publishedAt);

  return Number.isFinite(publishedAt.getTime()) && publishedAt >= cutoffDate;
}

async function youtubeFetch(path, params) {
  const apiKey = requiredEnv("YOUTUBE_API_KEY");
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);

  for (const [key, value] of Object.entries({ ...params, key: apiKey })) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let response;

  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(
      `Network error calling YouTube API: ${error?.message || String(error)}`,
    );
  }

  const data = await response.json();

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
  const data = await youtubeFetch("channels", params);
  const uploads = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

  if (!uploads) {
    throw new Error(
      "Unable to find RunPlayBack uploads playlist. Add YOUTUBE_CHANNEL_ID or YOUTUBE_UPLOADS_PLAYLIST_ID to .env.local.",
    );
  }

  return uploads;
}

async function fetchChannelVideoIds() {
  const uploadsPlaylistId = await getUploadsPlaylistId();
  const scanLimit = getNumberArg("scan-limit", 500);
  const videos = [];
  let pageToken = "";

  while (videos.length < scanLimit) {
    const data = await youtubeFetch("playlistItems", {
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
        publishedAt: item.contentDetails?.videoPublishedAt || snippet.publishedAt || null,
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

async function fetchVideoDetails(videos) {
  const details = [];

  for (let index = 0; index < videos.length; index += 50) {
    const chunk = videos.slice(index, index + 50);
    const data = await youtubeFetch("videos", {
      id: chunk.map((video) => video.youtubeVideoId).join(","),
      part: "contentDetails,statistics,snippet",
    });
    const byId = new Map(chunk.map((video) => [video.youtubeVideoId, video]));

    for (const item of data.items || []) {
      const fallback = byId.get(item.id);
      const snippet = item.snippet || {};
      const durationSeconds = parseYouTubeDurationSeconds(
        item.contentDetails?.duration || "",
      );

      if (!fallback) {
        continue;
      }

      details.push({
        ...fallback,
        description: snippet.description || fallback.description,
        durationSeconds,
        publishedAt: snippet.publishedAt || fallback.publishedAt,
        thumbnailUrl: getBestThumbnail(snippet.thumbnails, item.id),
        title: snippet.title || fallback.title,
        viewCount: Number(item.statistics?.viewCount || 0),
      });
    }
  }

  return details;
}

function createSupabaseServiceClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required in .env.local.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}

async function savePopularVideos(supabase, videos) {
  const now = new Date().toISOString();
  const { error: deactivateError } = await supabase
    .from("popular_videos")
    .update({ is_active: false, updated_at: now })
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (deactivateError) {
    throw deactivateError;
  }

  const rows = videos.map((video, index) => ({
    youtube_video_id: video.youtubeVideoId,
    title: video.title,
    description: video.description || "",
    thumbnail_url: video.thumbnailUrl,
    video_url: video.videoUrl,
    position: index + 1,
    is_active: true,
    updated_at: now,
  }));

  const { error } = await supabase.from("popular_videos").upsert(rows, {
    onConflict: "youtube_video_id",
  });

  if (error) {
    throw error;
  }
}

async function main() {
  loadEnv();

  const limit = getNumberArg("limit", 8);
  const recentMonths = getNumberArg("recent-months", defaultRecentMonths);
  const cutoffDate = getRecentCutoffDate(recentMonths);

  console.log(
    `Fetching RunPlayBack channel videos from the past ${recentMonths} months...`,
  );

  const channelVideos = await fetchChannelVideoIds();
  console.log(`Fetched ${channelVideos.length} channel videos.`);

  const detailedVideos = await fetchVideoDetails(channelVideos);
  const fullLengthVideos = detailedVideos.filter(
    (video) => !isLikelyShort(video) && wasPublishedAfter(video, cutoffDate),
  );
  const topVideos = fullLengthVideos
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, limit);

  if (!topVideos.length) {
    throw new Error(`No full-length videos found in the past ${recentMonths} months.`);
  }

  const supabase = createSupabaseServiceClient();
  await savePopularVideos(supabase, topVideos);

  console.log(`Saved top ${topVideos.length} popular videos from the past ${recentMonths} months:`);
  for (const [index, video] of topVideos.entries()) {
    console.log(
      `${index + 1}. ${video.title} (${video.viewCount.toLocaleString("en-US")} views)`,
    );
  }
}

main().catch((error) => {
  console.error(`Popular videos update failed: ${error.message || error}`);
  process.exit(1);
});
