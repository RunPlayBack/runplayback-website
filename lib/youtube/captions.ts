import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidYouTubeAccessToken } from "@/lib/google/oauth";

type CaptionListResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      language?: string;
      name?: string;
      trackKind?: string;
      isDraft?: boolean;
      status?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

function stripCaptionMarkup(value: string) {
  return value
    .replace(/^WEBVTT[\s\S]*?\n\n/, "")
    .replace(/^\d+\s*$/gm, "")
    .replace(/\d{2}:\d{2}:\d{2}[.,]\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}[.,]\d{3}.*$/gm, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function chooseCaptionTrack(items: NonNullable<CaptionListResponse["items"]>) {
  return (
    items.find(
      (item) =>
        item.id &&
        !item.snippet?.isDraft &&
        item.snippet?.status === "serving" &&
        item.snippet?.language?.toLowerCase().startsWith("en"),
    ) ||
    items.find((item) => item.id && !item.snippet?.isDraft) ||
    items.find((item) => item.id)
  );
}

export async function importOfficialYouTubeCaptions(
  supabase: SupabaseClient,
  youtubeVideoId: string,
) {
  const accessToken = await getValidYouTubeAccessToken(supabase);
  const listParams = new URLSearchParams({
    part: "snippet",
    videoId: youtubeVideoId,
  });

  const listResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/captions?${listParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  const listData = (await listResponse.json()) as CaptionListResponse;

  if (!listResponse.ok) {
    throw new Error(
      listData.error?.message || "Unable to list YouTube captions.",
    );
  }

  const track = chooseCaptionTrack(listData.items || []);

  if (!track?.id) {
    throw new Error("No caption track found for this video.");
  }

  const downloadParams = new URLSearchParams({
    tfmt: "srt",
  });
  const downloadResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/captions/${track.id}?${downloadParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const captionText = await downloadResponse.text();

  if (!downloadResponse.ok) {
    throw new Error(captionText || "Unable to download YouTube captions.");
  }

  return stripCaptionMarkup(captionText);
}
