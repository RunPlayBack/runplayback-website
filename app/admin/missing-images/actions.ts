"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function getString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function getSafeReturnPath(formData: FormData) {
  const returnTo = getString(formData, "returnTo");

  return returnTo.startsWith("/admin/missing-images")
    ? returnTo
    : "/admin/missing-images";
}

function addStatusToPath(path: string, key: string, value: string) {
  const separator = path.includes("?") ? "&" : "?";

  return `${path}${separator}${key}=${encodeURIComponent(value)}`;
}

function redirectWithError(error: unknown, returnPath = "/admin/missing-images"): never {
  const message = error instanceof Error ? error.message : "Unable to save image.";
  redirect(addStatusToPath(returnPath, "error", message));
}

function removeMarkdownImages(content: string) {
  return content
    .split("\n")
    .filter((line) => !/^!\[[^\]]*\]\(https?:\/\/[^)]+\)$/.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function insertImageAfterFirstParagraph(content: string, imageUrl: string, title: string) {
  const lines = removeMarkdownImages(content).split("\n");
  let firstParagraphIndex = -1;
  let activeHeading = "";

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed || firstParagraphIndex !== -1) {
      return;
    }

    const isHeading =
      /^#{1,6}\s+/.test(trimmed) ||
      (trimmed.length < 80 &&
        !/^https?:\/\//.test(trimmed) &&
        !trimmed.endsWith(".") &&
        !trimmed.endsWith("?") &&
        !trimmed.endsWith("!"));

    if (isHeading) {
      activeHeading = trimmed
        .replace(/^#{1,6}\s+/, "")
        .replaceAll("**", "")
        .toLowerCase();
      return;
    }

    if (activeHeading === "links" || activeHeading === "video") {
      return;
    }

    firstParagraphIndex = index;
  });

  if (firstParagraphIndex === -1) {
    return content;
  }

  const output: string[] = [];

  lines.forEach((line, index) => {
    output.push(line);

    if (index === firstParagraphIndex) {
      output.push("", `![${title}](${imageUrl})`, "");
    }
  });

  return output.join("\n").replace(/\n{3,}/g, "\n\n");
}

export async function saveMissingArticleImage(formData: FormData) {
  const articleId = getString(formData, "articleId");
  const imageUrl = getString(formData, "imageUrl");
  const returnPath = getSafeReturnPath(formData);
  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/login");
  }

  if (!articleId) {
    redirectWithError(new Error("Missing review ID."), returnPath);
  }

  try {
    new URL(imageUrl);
  } catch {
    redirectWithError(new Error("Paste a valid image URL."), returnPath);
  }

  const { data: article, error: articleError } = await supabase
    .from("articles")
    .select("id,title,slug,content")
    .eq("id", articleId)
    .single<{
      content: string;
      id: string;
      slug: string;
      title: string;
    }>();

  if (articleError || !article) {
    redirectWithError(articleError || new Error("Review not found."), returnPath);
  }

  const { error } = await supabase
    .from("articles")
    .update({
      content: insertImageAfterFirstParagraph(article.content, imageUrl, article.title),
      updated_at: new Date().toISOString(),
    })
    .eq("id", article.id);

  if (error) {
    redirectWithError(error, returnPath);
  }

  revalidatePath("/admin/missing-images");
  revalidatePath("/articles");
  revalidatePath(`/articles/${article.slug}`);
  redirect(addStatusToPath(returnPath, "saved", "1"));
}
