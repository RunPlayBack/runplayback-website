"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  findArticleImageCandidates,
  insertArticleImages,
} from "@/lib/article-images";
import { generateArticleDraftFromVideo } from "@/lib/openai/article-generator";
import { extractLinksFromDescription } from "@/lib/youtube/links";
import { importOfficialYouTubeCaptions } from "@/lib/youtube/captions";
import { fetchYouTubeMetadata } from "@/lib/youtube/metadata";
import { getYouTubeVideoId } from "@/lib/youtube/video-id";

function getString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function redirectWithError(path: string, error: unknown): never {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "Unable to save video.";
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function isMissingArchivedAtColumn(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : error instanceof Error
        ? error.message
        : "";

  return (
    message.includes("videos.archived_at does not exist") ||
    (message.includes("archived_at") && message.includes("schema cache"))
  );
}

export async function addYouTubeVideo(formData: FormData) {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/login");
  }

  const rawUrl = getString(formData, "video_url");
  const youtubeVideoId = getYouTubeVideoId(rawUrl);
  const manualTitle = getString(formData, "title");
  const manualDescription = getString(formData, "description");
  const captionsText = String(formData.get("captions_text") || "").trim();

  if (!youtubeVideoId) {
    redirectWithError("/admin/videos", new Error("Paste a valid YouTube URL."));
  }

  const videoUrl = `https://youtu.be/${youtubeVideoId}`;
  const fallbackThumbnailUrl = `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`;
  let metadata = null;

  try {
    metadata = await fetchYouTubeMetadata(youtubeVideoId);
  } catch (error) {
    redirectWithError("/admin/videos", error);
  }

  const description = metadata?.description || manualDescription;
  const thumbnailUrl = metadata?.thumbnailUrl || fallbackThumbnailUrl;
  const title = metadata?.title || manualTitle || `YouTube Video ${youtubeVideoId}`;

  const { data: video, error } = await supabase
    .from("videos")
    .upsert(
    {
      youtube_video_id: youtubeVideoId,
      title,
      description,
      thumbnail_url: thumbnailUrl,
      video_url: videoUrl,
      published_at: metadata?.publishedAt || null,
      captions_text: captionsText || null,
    },
    {
      onConflict: "youtube_video_id",
    },
    )
    .select("id")
    .single();

  if (error || !video) {
    redirectWithError("/admin/videos", error);
  }

  const links = extractLinksFromDescription(description);

  if (links.length) {
    await supabase.from("affiliate_links").delete().eq("video_id", video.id);
    const { error: linksError } = await supabase.from("affiliate_links").insert(
      links.map((link) => ({
        video_id: video.id,
        label: link.label,
        url: link.url,
      })),
    );

    if (linksError) {
      redirectWithError("/admin/videos", linksError);
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/videos");
  redirect("/admin/videos?saved=1");
}

export async function updateVideoTranscript(videoId: string, formData: FormData) {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/login");
  }

  const captionsText = String(formData.get("captions_text") || "").trim();

  const { error } = await supabase
    .from("videos")
    .update({
      captions_text: captionsText || null,
    })
    .eq("id", videoId);

  if (error) {
    redirectWithError("/admin/videos", error);
  }

  revalidatePath("/admin/videos");
  redirect("/admin/videos?transcriptSaved=1");
}

export async function importCaptionsFromYouTube(videoId: string) {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/login");
  }

  const { data: video, error: videoError } = await supabase
    .from("videos")
    .select("id,youtube_video_id")
    .eq("id", videoId)
    .single();

  if (videoError || !video) {
    redirectWithError("/admin/videos", videoError || new Error("Video not found."));
  }

  let captionsText = "";

  try {
    captionsText = await importOfficialYouTubeCaptions(
      supabase,
      video.youtube_video_id,
    );
  } catch (error) {
    redirectWithError("/admin/videos", error);
  }

  const { error } = await supabase
    .from("videos")
    .update({
      captions_text: captionsText || null,
    })
    .eq("id", video.id);

  if (error) {
    redirectWithError("/admin/videos", error);
  }

  revalidatePath("/admin/videos");
  redirect("/admin/videos?captionsImported=1");
}

export async function generateDraftArticleFromVideo(videoId: string) {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/login");
  }

  const { data: video, error: videoError } = await supabase
    .from("videos")
    .select(
      "id,youtube_video_id,title,description,thumbnail_url,video_url,captions_text",
    )
    .eq("id", videoId)
    .single();

  if (videoError || !video) {
    redirectWithError("/admin/videos", videoError || new Error("Video not found."));
  }

  let draft;

  try {
    draft = await generateArticleDraftFromVideo(video);
  } catch (error) {
    redirectWithError("/admin/videos", error);
  }

  const articleImages = await findArticleImageCandidates({
    description: video.description,
    limit: 2,
    title: video.title,
  });
  const contentWithImages = insertArticleImages(draft.content, articleImages, {
    featuredImageUrl: video.thumbnail_url,
    youtubeVideoId: video.youtube_video_id,
  });
  const slug = `${draft.slug}-${video.youtube_video_id}`;

  const { data: article, error: articleError } = await supabase
    .from("articles")
    .insert({
      video_id: video.id,
      title: draft.title,
      slug,
      seo_title: draft.seo_title,
      seo_description: draft.seo_description,
      featured_image_url: video.thumbnail_url,
      author_name: "RunPlayBack",
      content: contentWithImages,
      status: "draft",
    })
    .select("id")
    .single();

  if (articleError || !article) {
    redirectWithError("/admin/videos", articleError);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/articles");
  revalidatePath("/admin/videos");
  redirect(`/admin/articles/${article.id}?saved=1`);
}

export async function deleteVideo(videoId: string) {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/login");
  }

  const { data: video, error: findError } = await supabase
    .from("videos")
    .select("id")
    .eq("id", videoId)
    .single();

  if (findError || !video) {
    redirectWithError(
      "/admin/videos",
      findError || new Error("Video not found."),
    );
  }

  const { error } = await supabase
    .from("videos")
    .update({
      archived_at: new Date().toISOString(),
    })
    .eq("id", videoId);

  if (error && isMissingArchivedAtColumn(error)) {
    const { error: deleteError } = await supabase
      .from("videos")
      .delete()
      .eq("id", videoId);

    if (deleteError) {
      redirectWithError("/admin/videos", deleteError);
    }
  } else if (error) {
    redirectWithError("/admin/videos", error);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/videos");
  revalidatePath("/admin/articles");
  revalidatePath("/articles");
  redirect("/admin/videos?deleted=1");
}
