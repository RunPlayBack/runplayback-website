"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchYouTubeMetadata } from "@/lib/youtube/metadata";
import { fetchTopRunPlayBackVideos } from "@/lib/youtube/top-videos";
import { getYouTubeVideoId } from "@/lib/youtube/video-id";

function getString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function getPosition(formData: FormData) {
  const position = Number(formData.get("position") || 1);

  if (!Number.isFinite(position)) {
    return 1;
  }

  return Math.min(Math.max(Math.round(position), 1), 8);
}

function redirectWithError(error: unknown): never {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "Unable to save popular video.";

  redirect(`/admin/popular-videos?error=${encodeURIComponent(message)}`);
}

function revalidatePopularVideoPaths(youtubeVideoId?: string) {
  revalidatePath("/popularvideos");
  revalidatePath("/popular-videos");
  revalidatePath("/admin/popular-videos");

  if (youtubeVideoId) {
    revalidatePath(`/popularvideos/${youtubeVideoId}`);
  }
}

export async function addPopularVideo(formData: FormData) {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/login");
  }

  const rawUrl = getString(formData, "video_url");
  const youtubeVideoId = getYouTubeVideoId(rawUrl);

  if (!youtubeVideoId) {
    redirectWithError(new Error("Paste a valid YouTube URL."));
  }

  const videoUrl = `https://youtu.be/${youtubeVideoId}`;
  const fallbackThumbnailUrl = `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`;
  let metadata = null;

  try {
    metadata = await fetchYouTubeMetadata(youtubeVideoId);
  } catch {
    metadata = null;
  }

  const { error } = await supabase.from("popular_videos").upsert(
    {
      youtube_video_id: youtubeVideoId,
      title: metadata?.title || `RunPlayBack video ${youtubeVideoId}`,
      description: metadata?.description || "",
      thumbnail_url: metadata?.thumbnailUrl || fallbackThumbnailUrl,
      video_url: videoUrl,
      position: getPosition(formData),
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "youtube_video_id",
    },
  );

  if (error) {
    redirectWithError(error);
  }

  revalidatePopularVideoPaths(youtubeVideoId);
  redirect("/admin/popular-videos?saved=1");
}

export async function updatePopularVideo(videoId: string, formData: FormData) {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/login");
  }

  const youtubeVideoId = getString(formData, "youtube_video_id");
  const title = getString(formData, "title");
  const videoUrl = getString(formData, "video_url");
  const thumbnailUrl = getString(formData, "thumbnail_url");

  if (!title || !youtubeVideoId || !videoUrl) {
    redirectWithError(
      new Error("Title, YouTube video ID, and YouTube URL are required."),
    );
  }

  const { error } = await supabase
    .from("popular_videos")
    .update({
      youtube_video_id: youtubeVideoId,
      title,
      description: getString(formData, "description"),
      thumbnail_url:
        thumbnailUrl || `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`,
      video_url: videoUrl,
      position: getPosition(formData),
      is_active: formData.get("is_active") === "on",
      updated_at: new Date().toISOString(),
    })
    .eq("id", videoId);

  if (error) {
    redirectWithError(error);
  }

  revalidatePopularVideoPaths(youtubeVideoId);
  redirect("/admin/popular-videos?updated=1");
}

export async function deletePopularVideo(videoId: string) {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/login");
  }

  const { data } = await supabase
    .from("popular_videos")
    .select("youtube_video_id")
    .eq("id", videoId)
    .single();

  const { error } = await supabase
    .from("popular_videos")
    .delete()
    .eq("id", videoId);

  if (error) {
    redirectWithError(error);
  }

  revalidatePopularVideoPaths(data?.youtube_video_id);
  redirect("/admin/popular-videos?deleted=1");
}

export async function refreshPopularVideosFromYouTube() {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/login");
  }

  let videos = [];

  try {
    videos = await fetchTopRunPlayBackVideos({
      limit: 8,
      recentMonths: 12,
      scanLimit: 500,
    });
  } catch (error) {
    redirectWithError(error);
  }

  if (!videos.length) {
    redirectWithError(new Error("No full-length YouTube videos found."));
  }

  const now = new Date().toISOString();
  const { error: deactivateError } = await supabase
    .from("popular_videos")
    .update({ is_active: false, updated_at: now })
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (deactivateError) {
    redirectWithError(deactivateError);
  }

  const { error } = await supabase.from("popular_videos").upsert(
    videos.map((video, index) => ({
      youtube_video_id: video.youtubeVideoId,
      title: video.title,
      description: video.description || "",
      thumbnail_url: video.thumbnailUrl,
      video_url: video.videoUrl,
      position: index + 1,
      is_active: true,
      updated_at: now,
    })),
    {
      onConflict: "youtube_video_id",
    },
  );

  if (error) {
    redirectWithError(error);
  }

  revalidatePopularVideoPaths();
  redirect(`/admin/popular-videos?refreshed=${videos.length}`);
}
