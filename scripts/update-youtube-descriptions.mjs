import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const tokenId = "runplayback";
const contactUrl = "https://runplayback.com/contact";
const articlesUrl = "https://runplayback.com/articles";
const reviewIntro = "Read the full written review:";
const markdownContactReplacementLine =
  "Contact - [https://runplayback.com/contact](https://runplayback.com/contact)";
const markdownArticlesReplacementLine =
  "Articles - [https://runplayback.com/articles](https://runplayback.com/articles)";
const plainContactReplacementLine = "Contact - https://runplayback.com/contact";
const plainArticlesReplacementLine = "Articles - https://runplayback.com/articles";
const markdownContactLinePattern =
  /^Email Me - \[http:\/\/runplayback\.com\]\(http:\/\/runplayback\.com\/?\)$/gm;
const plainContactLinePattern = /^Email Me - https?:\/\/runplayback\.com\/?$/gm;

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");

  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);

    if (!match) {
      continue;
    }

    const key = match[1].trim();
    const value = match[2].trim().replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));

  return value ? value.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function getNumberArg(name, fallback) {
  const value = Number(getArg(name, ""));

  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is missing from .env.local.`);
  }

  return value;
}

function wait(ms) {
  return new Promise((resolveWait) => {
    setTimeout(resolveWait, ms);
  });
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function isQuotaError(message) {
  return /quota|exceeded/i.test(message);
}

function getYouTubeVideoId(value) {
  const input = String(value || "").trim();

  if (!input) {
    return "";
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
    return input;
  }

  try {
    const url = new URL(input);
    const shortId = url.hostname.includes("youtu.be")
      ? url.pathname.split("/").filter(Boolean)[0]
      : "";
    const watchId = url.searchParams.get("v") || "";
    const embedId = url.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/)?.[1] || "";
    const id = shortId || watchId || embedId;

    return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : "";
  } catch {
    return "";
  }
}

function normalizeLineEndings(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function replaceOldContactLine(description) {
  markdownContactLinePattern.lastIndex = 0;
  plainContactLinePattern.lastIndex = 0;

  const hasMarkdownLine = markdownContactLinePattern.test(description);
  const hasPlainLine = plainContactLinePattern.test(description);

  markdownContactLinePattern.lastIndex = 0;
  plainContactLinePattern.lastIndex = 0;

  const pattern = hasMarkdownLine
    ? markdownContactLinePattern
    : hasPlainLine
      ? plainContactLinePattern
      : null;

  if (!pattern) {
    return { changed: false, description };
  }

  const isMarkdownStyle = pattern === markdownContactLinePattern;
  const descriptionWithoutOldLine = description.replace(pattern, "");
  const replacementLines = [
    descriptionWithoutOldLine.includes(contactUrl)
      ? null
      : isMarkdownStyle
        ? markdownContactReplacementLine
        : plainContactReplacementLine,
    descriptionWithoutOldLine.includes(articlesUrl)
      ? null
      : isMarkdownStyle
        ? markdownArticlesReplacementLine
        : plainArticlesReplacementLine,
  ].filter(Boolean);

  return {
    changed: true,
    description: description.replace(pattern, replacementLines.join("\n")),
  };
}

function hasReviewLink(description, reviewUrl) {
  return (
    description.includes(reviewUrl) ||
    description.includes(reviewIntro) ||
    /runplayback\.com\/articles\/[a-z0-9-]+/i.test(description)
  );
}

function isAffiliateOrProductLine(line) {
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

function findFirstParagraphEnd(lines) {
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

function findProductInsertionIndex(lines) {
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

function insertReviewBlock(description, reviewUrl) {
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
  ].filter((line) => line !== null);

  return output.join("\n").replace(/\n{4,}/g, "\n\n\n").trimEnd();
}

function buildYouTubeDescriptionUpdate({ articleSlug, currentDescription }) {
  const reviewUrl = `https://runplayback.com/articles/${articleSlug}`;
  const changes = [];
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

async function parseJsonResponse(response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: { message: text || "Request failed." } };
  }
}

async function refreshAccessToken(refreshToken) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    body: new URLSearchParams({
      client_id: requiredEnv("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: requiredEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });
  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description || data.error || "Unable to refresh YouTube token.",
    );
  }

  return data;
}

async function getValidYouTubeAccessToken(supabase) {
  const { data: token, error } = await supabase
    .from("youtube_oauth_tokens")
    .select("access_token,refresh_token,scope,expires_at")
    .eq("id", tokenId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!token) {
    throw new Error("Connect YouTube Captions in the admin before updating descriptions.");
  }

  if (new Date(token.expires_at).getTime() > Date.now() + 60_000) {
    return token.access_token;
  }

  if (!token.refresh_token) {
    throw new Error("YouTube authorization expired. Reconnect YouTube Captions.");
  }

  const refreshed = await refreshAccessToken(token.refresh_token);
  const expiresAt = new Date(
    Date.now() + (refreshed.expires_in || 3600) * 1000,
  ).toISOString();
  const { error: saveError } = await supabase.from("youtube_oauth_tokens").upsert({
    id: tokenId,
    access_token: refreshed.access_token,
    refresh_token: token.refresh_token,
    scope: refreshed.scope || token.scope,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });

  if (saveError) {
    throw new Error(saveError.message);
  }

  return refreshed.access_token;
}

async function fetchYouTubeVideoSnippet(supabase, youtubeVideoId) {
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
  const payload = await parseJsonResponse(response);

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

async function updateYouTubeVideoDescription({
  description,
  snippet,
  supabase,
  youtubeVideoId,
}) {
  const accessToken = await getValidYouTubeAccessToken(supabase);
  const updateSnippet = {
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
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      payload.error?.message || "Unable to update the YouTube description.",
    );
  }

  return payload;
}

async function fetchPublishedArticleCandidates(supabase) {
  const { data, error } = await supabase
    .from("articles")
    .select("id,title,slug,status,published_at,video_id,videos(id,title,youtube_video_id)")
    .eq("status", "published")
    .not("video_id", "is", null)
    .order("published_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || [])
    .map((article) => {
      const video = Array.isArray(article.videos) ? article.videos[0] : article.videos;

      return {
        ...article,
        video,
      };
    })
    .filter((article) => article.video?.youtube_video_id);
}

function previewLines(description, limit = 16) {
  const lines = normalizeLineEndings(description).split("\n").slice(0, limit);

  return lines.join("\n").trim();
}

async function logUpdate(supabase, { article, liveDescription, preview, video }) {
  const { error } = await supabase.from("youtube_description_update_logs").insert({
    article_id: article.id,
    article_slug: article.slug,
    changes: preview.changes,
    new_description: preview.proposedDescription,
    old_description: liveDescription,
    updated_by: null,
    video_id: video.id,
    youtube_video_id: video.youtube_video_id,
  });

  if (error) {
    console.warn(`Log skipped: ${error.message}`);
  }
}

async function main() {
  loadEnv();

  const apply = hasFlag("apply");
  const continueOnError = hasFlag("continue-on-error");
  const continueOnQuota = hasFlag("continue-on-quota");
  const all = hasFlag("all");
  const requestedVideoId = getYouTubeVideoId(getArg("video", ""));
  const limit = all ? Number.POSITIVE_INFINITY : getNumberArg("limit", 10);
  const start = Math.max(1, Math.floor(getNumberArg("start", 1)));
  const sleepSeconds = getNumberArg("sleep", apply ? 3 : 0);
  const batchSize = Math.max(1, Math.floor(getNumberArg("batch-size", 25)));
  const batchPauseSeconds = getNumberArg("batch-pause", 0);
  const supabase = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
      },
    },
  );
  const candidates = (await fetchPublishedArticleCandidates(supabase)).filter(
    (article) =>
      !requestedVideoId || article.video.youtube_video_id === requestedVideoId,
  );
  const selectedCandidates = candidates.slice(start - 1, start - 1 + limit);
  const summary = {
    errors: 0,
    scanned: candidates.length,
    selected: selectedCandidates.length,
    skippedNoChange: 0,
    updated: 0,
    wouldUpdate: 0,
  };

  console.log(
    apply
      ? "Applying YouTube description updates..."
      : "Dry run: previewing YouTube description updates...",
  );
  console.log(
    all ? "Limit: all matching published reviews" : `Limit: ${selectedCandidates.length}`,
  );
  console.log(`Start position: ${start}`);
  console.log(`Pause after each video: ${sleepSeconds} seconds`);

  if (batchPauseSeconds > 0) {
    console.log(
      `Long pause: ${batchPauseSeconds} seconds after every ${batchSize} videos`,
    );
  }

  if (requestedVideoId && selectedCandidates.length === 0) {
    throw new Error(`No matching published review found for ${requestedVideoId}.`);
  }

  for (const [index, article] of selectedCandidates.entries()) {
    const video = article.video;
    const displayIndex = start + index;
    const label = `[${displayIndex}/${candidates.length}] ${video.title || article.title}`;

    console.log(`\n${label}`);
    console.log(`YouTube video: ${video.youtube_video_id}`);
    console.log(`Review: https://runplayback.com/articles/${article.slug}`);

    try {
      const liveVideo = await fetchYouTubeVideoSnippet(
        supabase,
        video.youtube_video_id,
      );
      const liveDescription = liveVideo.snippet.description || "";
      const preview = buildYouTubeDescriptionUpdate({
        articleSlug: article.slug,
        currentDescription: liveDescription,
      });

      if (!preview.changed) {
        summary.skippedNoChange += 1;
        console.log("No changes needed.");
        continue;
      }

      if (!apply) {
        summary.wouldUpdate += 1;
        console.log(`Would update: ${preview.changes.join(" ")}`);
        console.log("\n--- Proposed description preview ---");
        console.log(previewLines(preview.proposedDescription));
        console.log("--- End preview ---");
        continue;
      }

      await updateYouTubeVideoDescription({
        description: preview.proposedDescription,
        snippet: liveVideo.snippet,
        supabase,
        youtubeVideoId: video.youtube_video_id,
      });

      await supabase
        .from("videos")
        .update({ description: preview.proposedDescription })
        .eq("id", video.id);

      await logUpdate(supabase, {
        article,
        liveDescription,
        preview,
        video,
      });

      summary.updated += 1;
      console.log(`Updated: ${preview.changes.join(" ")}`);
    } catch (error) {
      const message = getErrorMessage(error);
      summary.errors += 1;
      console.error(`Failed: ${message}`);

      if (isQuotaError(message) && !continueOnQuota) {
        console.error(
          "YouTube quota appears to be exhausted. Stopping here so the script does not keep making failed requests.",
        );
        break;
      }

      if (!continueOnError) {
        throw error;
      }
    } finally {
      const hasMore = index < selectedCandidates.length - 1;

      if (hasMore && sleepSeconds > 0) {
        await wait(sleepSeconds * 1000);
      }

      if (
        hasMore &&
        batchPauseSeconds > 0 &&
        (index + 1) % batchSize === 0
      ) {
        console.log(
          `Pausing ${batchPauseSeconds} seconds after ${index + 1} selected videos...`,
        );
        await wait(batchPauseSeconds * 1000);
      }
    }
  }

  console.log("\nYouTube description update complete.");
  console.log(`Published reviews scanned: ${summary.scanned}`);
  console.log(`Videos selected: ${summary.selected}`);
  console.log(`Would update: ${summary.wouldUpdate}`);
  console.log(`Updated: ${summary.updated}`);
  console.log(`Skipped unchanged: ${summary.skippedNoChange}`);
  console.log(`Errors: ${summary.errors}`);

  if (!apply) {
    console.log("\nDry run only. Add --apply when you are ready to update YouTube.");
  }
}

main().catch((error) => {
  console.error(`YouTube description update failed: ${getErrorMessage(error)}`);
  process.exit(1);
});
