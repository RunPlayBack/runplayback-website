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
