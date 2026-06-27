"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

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

function slugifyFilePart(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}

function normalizeFilename(value = "") {
  const trimmed = String(value).trim().replace(/\\/g, "/");

  if (!trimmed) {
    return "";
  }

  const leaf = trimmed.split("/").filter(Boolean).pop() || "";
  const extMatch = leaf.match(/\.([a-z0-9]{2,5})$/i);
  const extension = extMatch ? `.${extMatch[1].toLowerCase()}` : ".jpg";
  const base = extMatch ? leaf.slice(0, -extMatch[0].length) : leaf;
  const safeBase = slugifyFilePart(base);

  return safeBase ? `${safeBase}${extension}` : "";
}

function resolveStillFilenameArray({
  articleSlug,
  stillCount,
  aiFilenames = [],
}: {
  articleSlug: string;
  aiFilenames?: string[];
  stillCount: number;
}) {
  const base = slugifyFilePart(articleSlug || "video-still") || "video-still";
  const merged = Array.from({ length: stillCount }, (_, index) => {
    const ai = normalizeFilename(aiFilenames[index]);
    const fallback = `${base}-${String(index + 1).padStart(2, "0")}.jpg`;

    return ai || fallback;
  });

  const seen = new Set<string>();

  return merged.map((value, index) => {
    const normalized = normalizeFilename(value);
    const fallback = `${base}-${String(index + 1).padStart(2, "0")}.jpg`;
    let candidate = normalized || fallback;

    if (!seen.has(candidate)) {
      seen.add(candidate);
      return candidate;
    }

    const parsed = candidate.match(/^(.+?)(\.[^.]+)$/);
    const stem = parsed?.[1] || candidate.replace(/\.[^.]+$/, "");
    const extension = parsed?.[2] || ".jpg";
    let suffix = 2;

    while (seen.has(`${stem}-${suffix}${extension}`)) {
      suffix += 1;
    }

    candidate = `${stem}-${suffix}${extension}`;
    seen.add(candidate);
    return candidate;
  });
}

function getObjectPathFromPublicUrl(url: string, bucket: string) {
  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const markerIndex = parsed.pathname.indexOf(marker);

    if (markerIndex === -1) {
      return "";
    }

    return decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
  } catch {
    return "";
  }
}

function replaceAll(value: string, replacements: Array<[string, string]>) {
  let nextValue = value;

  for (const [from, to] of replacements) {
    nextValue = nextValue.split(from).join(to);
  }

  return nextValue;
}

function getArticleUploadBucket() {
  return process.env.SUPABASE_ARTICLE_UPLOAD_BUCKET || "article-stills";
}

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase upload credentials are missing. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createSupabaseAdminClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}

async function loadFilenameHelpers() {
  return import("../../../../scripts/still-filename-ai.mjs");
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

export async function renameArticleVideoStillFilenames(articleId: string) {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/login");
  }

  const { data: article, error } = await supabase
    .from("articles")
    .select("id,title,slug,content,videos(title,video_url,description,youtube_video_id)")
    .eq("id", articleId)
    .single<{
      content: string;
      id: string;
      slug: string;
      title: string;
      videos:
        | {
            description: string | null;
            title: string | null;
            video_url: string | null;
            youtube_video_id: string | null;
          }
        | Array<{
            description: string | null;
            title: string | null;
            video_url: string | null;
            youtube_video_id: string | null;
          }>
        | null;
    }>();

  if (error || !article) {
    redirectWithError(articleId, error || new Error("Review not found."));
  }

  const stills = getMarkdownImageLines(article.content)
    .filter((image) => isVideoStillImage(image.alt, image.url))
    .slice(0, 4)
    .map((image, index) => ({
      index,
      imageUrl: image.url,
      timestamp: "",
      context: image.alt || "",
    }));

  if (!stills.length) {
    redirectWithError(articleId, new Error("No video stills found on this review."));
  }

  const video = Array.isArray(article.videos) ? article.videos[0] : article.videos;
  let aiFilenames: string[] = [];

  try {
    const { suggestStillFilenames } = await loadFilenameHelpers();
    const suggestion = await suggestStillFilenames({
      article: {
        content: article.content,
        slug: article.slug,
        title: article.title,
      },
      video: {
        description: video?.description || "",
        title: video?.title || article.title,
        video_url: video?.video_url || "",
      },
      stills,
    });
    aiFilenames = suggestion.filenames;
  } catch (suggestionError) {
    console.log(
      `AI filename suggestion failed for ${article.slug}: ${
        suggestionError instanceof Error ? suggestionError.message : "Unknown error"
      }`,
    );
  }

  const filenameHelpers = await loadFilenameHelpers();
  const resolvedFilenames = filenameHelpers.resolveStillFilenameArray({
    articleSlug: article.slug,
    stillCount: stills.length,
    aiFilenames,
  });
  const bucket = getArticleUploadBucket();
  const supabaseAdmin = getSupabaseAdminClient();
  const replacements: Array<[string, string]> = [];

  for (const [index, still] of stills.entries()) {
    const oldObjectPath = getObjectPathFromPublicUrl(still.imageUrl, bucket);
    const newObjectPath = `${slugifyFilePart(article.slug || article.title || "runplayback-review")}/${resolvedFilenames[index]}`;

    if (!oldObjectPath) {
      continue;
    }

    const { data: publicData } = supabaseAdmin.storage
      .from(bucket)
      .getPublicUrl(newObjectPath);
    const newUrl = publicData.publicUrl;

    if (oldObjectPath === newObjectPath && still.imageUrl === newUrl) {
      continue;
    }

    const { data: oldFile, error: downloadError } = await supabaseAdmin.storage
      .from(bucket)
      .download(oldObjectPath);

    if (downloadError) {
      throw downloadError;
    }

    const bytes = await oldFile.arrayBuffer();
    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(newObjectPath, bytes, {
        contentType: oldFile.type || "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    replacements.push([still.imageUrl, newUrl]);
  }

  if (!replacements.length) {
    redirect(addStatusToPath(`/admin/video-stills/${articleId}`, "renamed", "0"));
  }

  const nextContent = replaceAll(article.content, replacements);
  const { error: updateError } = await supabase
    .from("articles")
    .update({
      content: nextContent,
      updated_at: new Date().toISOString(),
    })
    .eq("id", article.id);

  if (updateError) {
    redirectWithError(articleId, updateError);
  }

  revalidatePath("/admin/video-stills");
  revalidatePath(`/admin/video-stills/${articleId}`);
  revalidatePath("/articles");
  revalidatePath(`/articles/${article.slug}`);
  redirect(addStatusToPath(`/admin/video-stills/${articleId}`, "renamed", String(replacements.length)));
}
