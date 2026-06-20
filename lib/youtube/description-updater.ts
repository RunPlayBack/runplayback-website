import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidYouTubeAccessToken } from "@/lib/google/oauth";

export type YouTubeSnippet = {
  categoryId?: string;
  defaultAudioLanguage?: string;
  defaultLanguage?: string;
  description: string;
  tags?: string[];
  title: string;
};

export type DescriptionUpdatePreview = {
  changed: boolean;
  changes: string[];
  proposedDescription: string;
  reviewUrl: string;
};

type YouTubeVideosResponse = {
  error?: {
    message?: string;
  };
  items?: Array<{
    id: string;
    snippet?: YouTubeSnippet;
  }>;
};

const contactUrl = "https://runplayback.com/contact";
const articlesUrl = "https://runplayback.com/articles";
const markdownContactReplacementLine =
  "Contact - [https://runplayback.com/contact](https://runplayback.com/contact)";
const markdownArticlesReplacementLine =
  "Articles - [https://runplayback.com/articles](https://runplayback.com/articles)";
const plainContactReplacementLine = "Contact - https://runplayback.com/contact";
const plainArticlesReplacementLine = "Articles - https://runplayback.com/articles";

const markdownContactLinePattern =
  /^Email Me - \[http:\/\/runplayback\.com\]\(http:\/\/runplayback\.com\/?\)$/gm;
const plainContactLinePattern = /^Email Me - https?:\/\/runplayback\.com\/?$/gm;

const reviewIntro = "Read the full written review:";

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function replaceOldContactLine(description: string) {
  const pattern = markdownContactLinePattern.test(description)
    ? markdownContactLinePattern
    : plainContactLinePattern.test(description)
      ? plainContactLinePattern
      : null;
  const isMarkdownStyle = pattern === markdownContactLinePattern;

  markdownContactLinePattern.lastIndex = 0;
  plainContactLinePattern.lastIndex = 0;

  if (!pattern) {
    return {
      changed: false,
      description,
    };
  }

  const contactReplacementLine = isMarkdownStyle
    ? markdownContactReplacementLine
    : plainContactReplacementLine;
  const articlesReplacementLine = isMarkdownStyle
    ? markdownArticlesReplacementLine
    : plainArticlesReplacementLine;
  const descriptionWithoutOldLine = description.replace(pattern, "");
  const replacementLines = [
    descriptionWithoutOldLine.includes(contactUrl) ? null : contactReplacementLine,
    descriptionWithoutOldLine.includes(articlesUrl) ? null : articlesReplacementLine,
  ].filter((line): line is string => Boolean(line));

  return {
    changed: true,
    description: description.replace(pattern, replacementLines.join("\n")),
  };
}

function hasReviewLink(description: string, reviewUrl: string) {
  return (
    description.includes(reviewUrl) ||
    description.includes(reviewIntro) ||
    /runplayback\.com\/articles\/[a-z0-9-]+/i.test(description)
  );
}

function isAffiliateOrProductLine(line: string) {
  const normalized = line.toLowerCase();

  return [
    "amzn.to",
    "amazon.com",
    "shop.runplayback.com",
    "runplayback merch",
    "promo code",
    "coupon",
    "sca_ref",
  ].some((needle) => normalized.includes(needle));
}

function findFirstParagraphEnd(lines: string[]) {
  const firstContentIndex = lines.findIndex((line) => line.trim());

  if (firstContentIndex === -1) {
    return 0;
  }

  for (let index = firstContentIndex + 1; index < lines.length; index += 1) {
    if (!lines[index].trim()) {
      return index + 1;
    }
  }

  return lines.length;
}

function findProductInsertionIndex(lines: string[]) {
  const productIndex = lines.findIndex((line) => isAffiliateOrProductLine(line));

  if (productIndex === -1) {
    return -1;
  }

  for (let index = productIndex - 1; index >= 0; index -= 1) {
    if (!lines[index].trim()) {
      return index + 1;
    }
  }

  return productIndex;
}

function insertReviewBlock(description: string, reviewUrl: string) {
  const lines = description.split("\n");
  const productInsertionIndex = findProductInsertionIndex(lines);
  const paragraphEndIndex = findFirstParagraphEnd(lines);
  const insertionIndex =
    productInsertionIndex >= 0
      ? Math.min(paragraphEndIndex, productInsertionIndex)
      : paragraphEndIndex;
  const block = [reviewIntro, reviewUrl];
  const before = lines.slice(0, insertionIndex);
  const after = lines.slice(insertionIndex);
  const output = [
    ...before,
    before.at(-1)?.trim() ? "" : null,
    ...block,
    after[0]?.trim() ? "" : null,
    ...after,
  ].filter((line): line is string => line !== null);

  return output.join("\n").replace(/\n{4,}/g, "\n\n\n").trimEnd();
}

export function buildYouTubeDescriptionUpdate({
  articleSlug,
  currentDescription,
}: {
  articleSlug: string;
  currentDescription: string;
}): DescriptionUpdatePreview {
  const reviewUrl = `https://runplayback.com/articles/${articleSlug}`;
  const changes: string[] = [];
  let proposedDescription = normalizeLineEndings(currentDescription);
  const contactUpdate = replaceOldContactLine(proposedDescription);

  if (contactUpdate.changed) {
    proposedDescription = contactUpdate.description;
    changes.push("Replaced the old Email Me line with Contact and Articles links.");
  }

  if (!hasReviewLink(proposedDescription, reviewUrl)) {
    proposedDescription = insertReviewBlock(proposedDescription, reviewUrl);
    changes.push("Added the matching written review link after the opening paragraph.");
  }

  return {
    changed: proposedDescription !== normalizeLineEndings(currentDescription),
    changes,
    proposedDescription,
    reviewUrl,
  };
}

async function parseYouTubeResponse(response: Response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: { message: text || "YouTube API request failed." } };
  }
}

export async function fetchYouTubeVideoSnippet(
  supabase: SupabaseClient,
  youtubeVideoId: string,
) {
  const accessToken = await getValidYouTubeAccessToken(supabase);
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(
      youtubeVideoId,
    )}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  const payload = (await parseYouTubeResponse(response)) as YouTubeVideosResponse;

  if (!response.ok) {
    throw new Error(
      payload.error?.message || "Unable to fetch the YouTube description.",
    );
  }

  const item = payload.items?.[0];

  if (!item?.snippet) {
    throw new Error("YouTube video not found for this channel account.");
  }

  return {
    id: item.id,
    snippet: item.snippet,
  };
}

export async function updateYouTubeVideoDescription({
  description,
  snippet,
  supabase,
  youtubeVideoId,
}: {
  description: string;
  snippet: YouTubeSnippet;
  supabase: SupabaseClient;
  youtubeVideoId: string;
}) {
  const accessToken = await getValidYouTubeAccessToken(supabase);
  const updateSnippet: YouTubeSnippet = {
    title: snippet.title,
    description,
    categoryId: snippet.categoryId,
  };

  if (snippet.tags?.length) {
    updateSnippet.tags = snippet.tags;
  }

  if (snippet.defaultLanguage) {
    updateSnippet.defaultLanguage = snippet.defaultLanguage;
  }

  if (snippet.defaultAudioLanguage) {
    updateSnippet.defaultAudioLanguage = snippet.defaultAudioLanguage;
  }

  const response = await fetch(
    "https://www.googleapis.com/youtube/v3/videos?part=snippet",
    {
      body: JSON.stringify({
        id: youtubeVideoId,
        snippet: updateSnippet,
      }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      method: "PUT",
    },
  );
  const payload = (await parseYouTubeResponse(response)) as YouTubeVideosResponse;

  if (!response.ok) {
    throw new Error(
      payload.error?.message || "Unable to update the YouTube description.",
    );
  }

  return payload;
}
