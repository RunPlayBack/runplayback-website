import { videos as placeholderVideos } from "@/lib/placeholder-data";
import { createClient } from "@/lib/supabase/server";
import { fetchTopRunPlayBackVideos } from "@/lib/youtube/top-videos";
import { getYouTubeVideoId } from "@/lib/youtube/video-id";

export type PopularVideo = {
  id: string;
  youtubeVideoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  videoUrl: string;
  position: number;
  isActive: boolean;
};

type PopularVideoRow = {
  id: string;
  youtube_video_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  video_url: string;
  position: number | null;
  is_active: boolean | null;
};

function getYouTubeThumbnailUrl(youtubeVideoId: string) {
  return `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`;
}

function getThumbnailUrl(youtubeVideoId: string, thumbnailUrl?: string | null) {
  if (!thumbnailUrl || thumbnailUrl.includes("images.squarespace-cdn.com")) {
    return getYouTubeThumbnailUrl(youtubeVideoId);
  }

  return thumbnailUrl;
}

function mapPopularVideo(row: PopularVideoRow): PopularVideo {
  return {
    id: row.id,
    youtubeVideoId: row.youtube_video_id,
    title: row.title,
    description: row.description || "",
    thumbnailUrl: getThumbnailUrl(row.youtube_video_id, row.thumbnail_url),
    videoUrl: row.video_url,
    position: row.position || 1,
    isActive: row.is_active ?? true,
  };
}

function getFallbackVideos() {
  return placeholderVideos
    .map((video, index) => {
      const youtubeVideoId = getYouTubeVideoId(video.url);

      return {
        id: video.id,
        youtubeVideoId,
        title: video.title,
        description: video.description,
        thumbnailUrl: getYouTubeThumbnailUrl(youtubeVideoId),
        videoUrl: video.url,
        position: index + 1,
        isActive: true,
      };
    })
    .filter((video) => video.youtubeVideoId);
}

async function getYouTubeTopVideosFallback() {
  try {
    const topVideos = await fetchTopRunPlayBackVideos({
      limit: 8,
      recentMonths: 12,
      scanLimit: 500,
    });

    return topVideos.map((video, index) => ({
      id: video.youtubeVideoId,
      youtubeVideoId: video.youtubeVideoId,
      title: video.title,
      description: video.description,
      thumbnailUrl: video.thumbnailUrl,
      videoUrl: video.videoUrl,
      position: index + 1,
      isActive: true,
    }));
  } catch {
    return [];
  }
}

export async function getPopularVideos(options?: {
  includeInactive?: boolean;
  useFallback?: boolean;
}) {
  const supabase = await createClient();

  if (!supabase) {
    if (options?.useFallback === false) {
      return [];
    }

    const topVideos = await getYouTubeTopVideosFallback();

    return topVideos.length ? topVideos : getFallbackVideos();
  }

  let query = supabase
    .from("popular_videos")
    .select(
      "id,youtube_video_id,title,description,thumbnail_url,video_url,position,is_active",
    )
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (!options?.includeInactive) {
    query = query.eq("is_active", true).limit(8);
  }

  const { data, error } = await query;

  if (error) {
    if (options?.useFallback === false) {
      return [];
    }

    const topVideos = await getYouTubeTopVideosFallback();

    return topVideos.length ? topVideos : getFallbackVideos();
  }

  const videos = (data || []).map(mapPopularVideo);

  if (!videos.length && options?.useFallback !== false) {
    const topVideos = await getYouTubeTopVideosFallback();

    return topVideos.length ? topVideos : getFallbackVideos();
  }

  return videos;
}

export async function getPopularVideoByYouTubeId(youtubeVideoId: string) {
  const supabase = await createClient();

  if (!supabase) {
    return getFallbackVideos().find(
      (video) => video.youtubeVideoId === youtubeVideoId,
    );
  }

  const { data, error } = await supabase
    .from("popular_videos")
    .select(
      "id,youtube_video_id,title,description,thumbnail_url,video_url,position,is_active",
    )
    .eq("youtube_video_id", youtubeVideoId)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    return getFallbackVideos().find(
      (video) => video.youtubeVideoId === youtubeVideoId,
    );
  }

  return mapPopularVideo(data);
}
