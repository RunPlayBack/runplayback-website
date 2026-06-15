"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function getString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function addStatusToPath(path: string, key: string, value: string) {
  const separator = path.includes("?") ? "&" : "?";

  return `${path}${separator}${key}=${encodeURIComponent(value)}`;
}

function redirectWithError(articleId: string, error: unknown): never {
  const message = error instanceof Error ? error.message : "Unable to save still.";

  redirect(addStatusToPath(`/admin/video-stills/${articleId}`, "error", message));
}

function redirectWithMessage(articleId: string, key: string, value: string): never {
  redirect(addStatusToPath(`/admin/video-stills/${articleId}`, key, value));
}

function getMarkdownImageLines(content: string) {
  return content.split("\n").map((line, index) => {
    const match = line
      .trim()
      .match(/^!\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/);

    return {
      alt: match?.[1] || "",
      index,
      line,
      url: match?.[2] || "",
    };
  });
}

function isVideoStillImage(alt: string, url: string) {
  return alt.toLowerCase().startsWith("video still") || url.includes("/article-stills/");
}

function replaceVideoStillUrl(content: string, stillIndex: number, replacementUrl: string) {
  const lines = content.split("\n");
  const stills = getMarkdownImageLines(content).filter((image) =>
    isVideoStillImage(image.alt, image.url),
  );
  const still = stills[stillIndex];

  if (!still) {
    throw new Error("That video still could not be found.");
  }

  lines[still.index] = `![${still.alt || `Video still ${stillIndex + 1}`}](${replacementUrl})`;

  return lines.join("\n");
}

export async function replaceArticleVideoStill(articleId: string, formData: FormData) {
  const stillIndex = Number(getString(formData, "stillIndex"));
  const imageUrl = getString(formData, "imageUrl");
  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/login");
  }

  if (!Number.isInteger(stillIndex) || stillIndex < 0) {
    redirectWithError(articleId, new Error("Choose a valid still to replace."));
  }

  try {
    new URL(imageUrl);
  } catch {
    redirectWithError(articleId, new Error("Paste a valid image URL."));
  }

  const { data: article, error: articleError } = await supabase
    .from("articles")
    .select("id,slug,content")
    .eq("id", articleId)
    .single<{
      content: string;
      id: string;
      slug: string;
    }>();

  if (articleError || !article) {
    redirectWithError(articleId, articleError || new Error("Review not found."));
  }

  let nextContent = article.content;

  try {
    nextContent = replaceVideoStillUrl(article.content, stillIndex, imageUrl);
  } catch (error) {
    redirectWithError(articleId, error);
  }

  const { error } = await supabase
    .from("articles")
    .update({
      content: nextContent,
      updated_at: new Date().toISOString(),
    })
    .eq("id", article.id);

  if (error) {
    redirectWithError(articleId, error);
  }

  revalidatePath("/admin/video-stills");
  revalidatePath(`/admin/video-stills/${article.id}`);
  revalidatePath("/articles");
  revalidatePath(`/articles/${article.slug}`);
  redirect(addStatusToPath(`/admin/video-stills/${article.id}`, "saved", "1"));
}

export async function queueArticleVideoStillRegeneration(
  articleId: string,
  formData: FormData,
) {
  const stillIndex = Number(getString(formData, "stillIndex"));
  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/login");
  }

  if (!Number.isInteger(stillIndex) || stillIndex < 0 || stillIndex > 3) {
    redirectWithError(articleId, new Error("Choose a valid still to regenerate."));
  }

  const { error: deleteError } = await supabase
    .from("video_still_jobs")
    .delete()
    .eq("article_id", articleId)
    .eq("still_index", stillIndex)
    .in("status", ["queued", "failed"]);

  if (deleteError) {
    redirectWithError(articleId, deleteError);
  }

  const { error } = await supabase.from("video_still_jobs").insert({
    article_id: articleId,
    still_index: stillIndex,
    status: "queued",
  });

  if (error) {
    redirectWithError(articleId, error);
  }

  revalidatePath("/admin/video-stills");
  revalidatePath(`/admin/video-stills/${articleId}`);
  redirectWithMessage(articleId, "queued", "1");
}

export async function queueAllArticleVideoStillsRegeneration(articleId: string) {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/login");
  }

  const { error: deleteError } = await supabase
    .from("video_still_jobs")
    .delete()
    .eq("article_id", articleId)
    .in("status", ["queued", "failed"]);

  if (deleteError) {
    redirectWithError(articleId, deleteError);
  }

  const jobs = Array.from({ length: 4 }, (_, stillIndex) => ({
    article_id: articleId,
    still_index: stillIndex,
    status: "queued",
  }));
  const { error } = await supabase.from("video_still_jobs").insert(jobs);

  if (error) {
    redirectWithError(articleId, error);
  }

  revalidatePath("/admin/video-stills");
  revalidatePath(`/admin/video-stills/${articleId}`);
  redirectWithMessage(articleId, "queued", "all");
}
