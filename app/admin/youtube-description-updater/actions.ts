"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  buildYouTubeDescriptionUpdate,
  fetchYouTubeVideoSnippet,
  updateYouTubeVideoDescription,
} from "@/lib/youtube/description-updater";
import { getYouTubeVideoId } from "@/lib/youtube/video-id";

type VideoRow = {
  id: string;
  title: string;
  youtube_video_id: string;
};

type ArticleRow = {
  id: string;
  slug: string;
  title: string;
};

function getString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function redirectWithError(youtubeVideoId: string, error: unknown): never {
  const message =
    error instanceof Error
      ? error.message
      : "Unable to update the YouTube description.";
  const searchParams = new URLSearchParams({
    error: message,
  });

  if (youtubeVideoId) {
    searchParams.set("video", youtubeVideoId);
  }

  redirect(`/admin/youtube-description-updater?${searchParams.toString()}`);
}

async function findPublishedArticleForVideo(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  youtubeVideoId: string,
) {
  const { data: video, error: videoError } = await supabase
    .from("videos")
    .select("id,title,youtube_video_id")
    .eq("youtube_video_id", youtubeVideoId)
    .maybeSingle<VideoRow>();

  if (videoError) {
    throw videoError;
  }

  if (!video) {
    throw new Error("No imported video was found for that YouTube video ID.");
  }

  const { data: article, error: articleError } = await supabase
    .from("articles")
    .select("id,title,slug")
    .eq("video_id", video.id)
    .eq("status", "published")
    .maybeSingle<ArticleRow>();

  if (articleError) {
    throw articleError;
  }

  if (!article) {
    throw new Error("No matching published review was found for that video.");
  }

  return { article, video };
}

export async function applyYouTubeDescriptionUpdate(formData: FormData) {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/login");
  }

  const rawVideoInput = getString(formData, "youtube_video_id");
  const youtubeVideoId = getYouTubeVideoId(rawVideoInput);

  if (!youtubeVideoId) {
    redirectWithError("", new Error("Paste a valid YouTube URL or video ID."));
  }

  let redirectPath = "";

  try {
    const { article, video } = await findPublishedArticleForVideo(
      supabase,
      youtubeVideoId,
    );
    const liveVideo = await fetchYouTubeVideoSnippet(supabase, youtubeVideoId);
    const preview = buildYouTubeDescriptionUpdate({
      articleSlug: article.slug,
      currentDescription: liveVideo.snippet.description || "",
    });

    if (!preview.changed) {
      redirectPath = `/admin/youtube-description-updater?video=${encodeURIComponent(
        youtubeVideoId,
      )}&nochange=1`;
    } else {
      await updateYouTubeVideoDescription({
        description: preview.proposedDescription,
        snippet: liveVideo.snippet,
        supabase,
        youtubeVideoId,
      });

      await supabase
        .from("videos")
        .update({ description: preview.proposedDescription })
        .eq("id", video.id);

      const { data: userData } = await supabase.auth.getUser();

      await supabase.from("youtube_description_update_logs").insert({
        article_id: article.id,
        article_slug: article.slug,
        changes: preview.changes,
        new_description: preview.proposedDescription,
        old_description: liveVideo.snippet.description || "",
        updated_by: userData.user?.id || null,
        video_id: video.id,
        youtube_video_id: youtubeVideoId,
      });

      revalidatePath("/admin/youtube-description-updater");
      revalidatePath("/admin/videos");

      redirectPath = `/admin/youtube-description-updater?video=${encodeURIComponent(
        youtubeVideoId,
      )}&updated=1`;
    }
  } catch (error) {
    redirectWithError(youtubeVideoId, error);
  }

  redirect(redirectPath);
}
