import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { existsSync, openAsBlob, readFileSync } from "node:fs";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const tokenId = "runplayback";
const defaultChannelHandle = "runplayback";
const defaultShortMaxSeconds = 180;
const defaultYtDlpSleepSeconds = 3;

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

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.stdio || "pipe",
      ...options,
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          `${command} failed with exit code ${code}.${
            stderr ? ` ${stderr.trim().slice(0, 800)}` : ""
          }`,
        ),
      );
    });
  });
}

async function commandExists(command) {
  try {
    await runCommand("which", [command]);
    return true;
  } catch {
    return false;
  }
}

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is missing from .env.local.`);
  }

  return value;
}

function getErrorDetails(error) {
  if (!(error instanceof Error)) {
    return "unknown error";
  }

  const cause = error.cause;

  if (cause instanceof Error) {
    const code = typeof cause.code === "string" ? ` (${cause.code})` : "";

    return `${error.message}; cause: ${cause.message}${code}`;
  }

  if (cause && typeof cause === "object") {
    const code = typeof cause.code === "string" ? ` (${cause.code})` : "";
    const message =
      typeof cause.message === "string" ? cause.message : JSON.stringify(cause);

    return `${error.message}; cause: ${message}${code}`;
  }

  return error.message;
}

function isOpenAIQuotaError(message) {
  return /insufficient_quota|exceeded your current quota|check your plan and billing/i.test(
    message,
  );
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function cleanUrl(url) {
  return url.replace(/[.,;!?]+$/, "");
}

function getLinkLabel(description, url) {
  const index = description.indexOf(url);
  const line =
    index >= 0
      ? description.slice(0, index).split("\n").at(-1)?.trim() || ""
      : "";
  const label = line
    .replace(/[-–—:;|]+$/g, "")
    .replace(/^[•*\-\s]+/g, "")
    .trim();

  return label || new URL(url).hostname.replace(/^www\./, "");
}

function extractLinksFromDescription(description) {
  const matches = description.match(/https?:\/\/[^\s)\]}>"']+/g) || [];
  const seen = new Set();

  return matches.flatMap((match) => {
    const url = cleanUrl(match);

    if (seen.has(url)) {
      return [];
    }

    seen.add(url);

    try {
      return [
        {
          label: getLinkLabel(description, url),
          url,
        },
      ];
    } catch {
      return [];
    }
  });
}

function getBestThumbnail(thumbnails, videoId) {
  return (
    thumbnails?.maxres?.url ||
    thumbnails?.standard?.url ||
    thumbnails?.high?.url ||
    thumbnails?.medium?.url ||
    thumbnails?.default?.url ||
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
  );
}

function getBestYtDlpThumbnail(thumbnails, videoId) {
  if (!Array.isArray(thumbnails)) {
    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  }

  return (
    thumbnails
      .filter((thumbnail) => thumbnail?.url)
      .sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url ||
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
  );
}

function parseYtDlpUploadDate(value) {
  const match = String(value || "").match(/^(\d{4})(\d{2})(\d{2})$/);

  if (!match) {
    return null;
  }

  return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`).toISOString();
}

function parseYouTubeDurationSeconds(duration) {
  const match = duration.match(
    /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/,
  );

  if (!match) {
    return 0;
  }

  const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = match;

  return (
    Number(days) * 86400 +
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds)
  );
}

function getShortMaxSeconds() {
  const configuredValue = Number(
    getArg("short-max-seconds", process.env.YOUTUBE_SHORT_MAX_SECONDS || ""),
  );

  return Number.isFinite(configuredValue) && configuredValue > 0
    ? configuredValue
    : defaultShortMaxSeconds;
}

function isLikelyShort(video, durationSeconds) {
  const searchable = `${video.title} ${video.description} ${video.videoUrl}`.toLowerCase();
  const shortMaxSeconds = getShortMaxSeconds();

  return (
    (durationSeconds > 0 && durationSeconds <= shortMaxSeconds) ||
    /(^|\s)#shorts?\b/.test(searchable) ||
    searchable.includes("youtube.com/shorts/")
  );
}

async function youtubeFetch(path, params) {
  const apiKey = requiredEnv("YOUTUBE_API_KEY");
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);

  for (const [key, value] of Object.entries({ ...params, key: apiKey })) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let response;

  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`Network error calling YouTube API: ${getErrorDetails(error)}`);
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || `YouTube API failed for ${path}.`);
  }

  return data;
}

async function fetchVideoDurations(videoIds) {
  const durations = new Map();

  for (let index = 0; index < videoIds.length; index += 50) {
    const chunk = videoIds.slice(index, index + 50);
    const data = await youtubeFetch("videos", {
      id: chunk.join(","),
      part: "contentDetails",
    });

    for (const item of data.items || []) {
      const duration = item.contentDetails?.duration || "";

      if (item.id && duration) {
        durations.set(item.id, parseYouTubeDurationSeconds(duration));
      }
    }
  }

  return durations;
}

async function getUploadsPlaylistId() {
  if (process.env.YOUTUBE_UPLOADS_PLAYLIST_ID) {
    return process.env.YOUTUBE_UPLOADS_PLAYLIST_ID;
  }

  const channelId = process.env.YOUTUBE_CHANNEL_ID;
  const params = channelId
    ? { id: channelId, part: "contentDetails" }
    : { forHandle: defaultChannelHandle, part: "contentDetails" };
  const data = await youtubeFetch("channels", params);
  const uploads = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

  if (!uploads) {
    throw new Error(
      "Unable to find RunPlayBack uploads playlist. Add YOUTUBE_CHANNEL_ID or YOUTUBE_UPLOADS_PLAYLIST_ID to .env.local.",
    );
  }

  return uploads;
}

async function fetchAllChannelVideos(limit, supabase = null) {
  const uploadsPlaylistId = await getUploadsPlaylistId();
  const videos = [];
  let pageToken = "";

  while (videos.length < limit) {
    const data = await youtubeFetch("playlistItems", {
      maxResults: 50,
      pageToken,
      part: "snippet,contentDetails",
      playlistId: uploadsPlaylistId,
    });
    const playlistVideos = [];

    for (const item of data.items || []) {
      const videoId = item.contentDetails?.videoId;
      const snippet = item.snippet || {};

      if (!videoId || snippet.title === "Private video") {
        continue;
      }

      playlistVideos.push({
        description: snippet.description || "",
        publishedAt: item.contentDetails?.videoPublishedAt || snippet.publishedAt || null,
        thumbnailUrl: getBestThumbnail(snippet.thumbnails, videoId),
        title: snippet.title || `YouTube Video ${videoId}`,
        videoUrl: `https://youtu.be/${videoId}`,
        youtubeVideoId: videoId,
      });
    }

    const durations = await fetchVideoDurations(
      playlistVideos.map((video) => video.youtubeVideoId),
    );

    for (const video of playlistVideos) {
      const durationSeconds = durations.get(video.youtubeVideoId) || 0;

      if (isLikelyShort(video, durationSeconds)) {
        console.log(
          `Skipping Short: ${video.title} (${durationSeconds || "unknown"} seconds)`,
        );
        continue;
      }

      if (supabase) {
        const article = await findExistingArticleForVideo(
          supabase,
          null,
          video.youtubeVideoId,
        );

        if (article) {
          continue;
        }
      }

      videos.push({
        ...video,
        durationSeconds,
      });

      if (videos.length >= limit) {
        break;
      }
    }

    pageToken = data.nextPageToken || "";

    if (!pageToken || videos.length >= limit) {
      break;
    }
  }

  return videos;
}

async function fetchChannelVideosWithYtDlp(supabase, limit) {
  if (!(await commandExists("yt-dlp"))) {
    throw new Error("yt-dlp is not installed. Install it with: brew install yt-dlp");
  }

  const channelUrl = process.env.YOUTUBE_CHANNEL_URL || "https://www.youtube.com/@runplayback/videos";
  const sleepSeconds = getNumberArg("yt-dlp-sleep", defaultYtDlpSleepSeconds);
  const scanLimit = getNumberArg("scan-limit", Math.max(limit * 6, 60));
  const scanStart = Math.max(1, getNumberArg("scan-start", 1));
  const scanEnd = scanStart + scanLimit - 1;

  console.log(`Scanning channel videos ${scanStart}-${scanEnd}.`);
  const { stdout } = await runCommand("yt-dlp", [
    "--dump-single-json",
    "--ignore-errors",
    "--no-warnings",
    "--sleep-requests",
    String(sleepSeconds),
    "--sleep-interval",
    String(sleepSeconds),
    "--max-sleep-interval",
    String(sleepSeconds + 3),
    "--playlist-start",
    String(scanStart),
    "--playlist-end",
    String(scanEnd),
    channelUrl,
  ]);
  const data = JSON.parse(stdout);
  const videos = [];
  let existingCount = 0;

  for (const entry of data.entries || []) {
    const videoId = entry.id;

    if (!videoId || !entry.title) {
      continue;
    }

    const video = {
      description: entry.description || "",
      durationSeconds: Number(entry.duration || 0),
      publishedAt:
        entry.timestamp ? new Date(entry.timestamp * 1000).toISOString() : parseYtDlpUploadDate(entry.upload_date),
      thumbnailUrl: getBestYtDlpThumbnail(entry.thumbnails, videoId),
      title: entry.title,
      videoUrl: entry.webpage_url || `https://youtu.be/${videoId}`,
      youtubeVideoId: videoId,
    };

    if (isLikelyShort(video, video.durationSeconds)) {
      console.log(
        `Skipping Short: ${video.title} (${video.durationSeconds || "unknown"} seconds)`,
      );
      continue;
    }

    const article = await findExistingArticleForVideo(supabase, null, video.youtubeVideoId);

    if (article) {
      existingCount += 1;
      continue;
    }

    videos.push(video);

    if (videos.length >= limit) {
      break;
    }
  }

  if (existingCount) {
    console.log(`Skipped ${existingCount} videos that already have articles.`);
  }

  return videos;
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
    throw new Error("Connect YouTube captions in the admin before running backfill.");
  }

  if (new Date(token.expires_at).getTime() > Date.now() + 60_000) {
    return token.access_token;
  }

  if (!token.refresh_token) {
    throw new Error("YouTube authorization expired. Reconnect YouTube captions.");
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

function stripCaptionMarkup(value) {
  return value
    .replace(/^WEBVTT[\s\S]*?\n\n/, "")
    .replace(/^\d+\s*$/gm, "")
    .replace(/\d{2}:\d{2}:\d{2}[.,]\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}[.,]\d{3}.*$/gm, "")
    .replace(/\d{2}:\d{2}[.,]\d{3}\s+-->\s+\d{2}:\d{2}[.,]\d{3}.*$/gm, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function chooseCaptionTrack(items) {
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

async function importOfficialCaptions(supabase, youtubeVideoId) {
  const accessToken = await getValidYouTubeAccessToken(supabase);
  const listUrl = new URL("https://www.googleapis.com/youtube/v3/captions");
  listUrl.searchParams.set("part", "snippet");
  listUrl.searchParams.set("videoId", youtubeVideoId);

  const listResponse = await fetch(listUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const listData = await listResponse.json();

  if (!listResponse.ok) {
    throw new Error(listData.error?.message || "Unable to list YouTube captions.");
  }

  const track = chooseCaptionTrack(listData.items || []);

  if (!track?.id) {
    return "";
  }

  const downloadUrl = new URL(
    `https://www.googleapis.com/youtube/v3/captions/${track.id}`,
  );
  downloadUrl.searchParams.set("tfmt", "srt");

  const downloadResponse = await fetch(downloadUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const captionText = await downloadResponse.text();

  if (!downloadResponse.ok) {
    throw new Error(captionText || "Unable to download YouTube captions.");
  }

  return stripCaptionMarkup(captionText);
}

async function downloadSrtWithYtDlp(video) {
  if (!(await commandExists("yt-dlp"))) {
    throw new Error("yt-dlp is not installed. Install it with: brew install yt-dlp");
  }

  const workDir = await mkdtemp(join(tmpdir(), "runplayback-srt-"));
  const outputTemplate = join(workDir, `${video.youtubeVideoId}.%(ext)s`);
  const sleepSeconds = getNumberArg("yt-dlp-sleep", defaultYtDlpSleepSeconds);

  try {
    await runCommand("yt-dlp", [
      "--no-playlist",
      "--ignore-errors",
      "--skip-download",
      "--sleep-requests",
      String(sleepSeconds),
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      "en.*,en",
      "--sub-format",
      "srt/vtt/best",
      "-o",
      outputTemplate,
      video.videoUrl,
    ]);

    const files = await readdir(workDir);
    const subtitleFile = files.find((file) => file.endsWith(".srt")) ||
      files.find((file) => file.endsWith(".vtt"));

    if (!subtitleFile) {
      throw new Error("No SRT or VTT captions were found for this video.");
    }

    const captionText = readFileSync(join(workDir, subtitleFile), "utf8");

    return stripCaptionMarkup(captionText);
  } finally {
    await rm(workDir, { force: true, recursive: true });
  }
}

function extractResponseText(data) {
  if (typeof data?.output_text === "string") {
    return data.output_text;
  }

  if (!Array.isArray(data?.output)) {
    return "";
  }

  return data.output
    .flatMap((item) => item?.content || [])
    .map((item) => item?.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractJson(text) {
  const trimmed = text.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  return trimmed.match(/\{[\s\S]*\}/)?.[0] || trimmed;
}

async function generateArticleDraft(video) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    body: JSON.stringify({
      input: `Create a polished RunPlayBack article draft from this YouTube source.

Return ONLY valid JSON:
{
  "title": "string",
  "slug": "string",
  "seo_title": "string",
  "seo_description": "string",
  "content": "string"
}

Style:
- Conversational EV lifestyle review.
- Write in first person from the RunPlayBack host's point of view, as if "I" personally installed, tested, rode, and reviewed the product.
- Use "I" for personal observations and "we" only when talking about RunPlayBack as a channel/community.
- Never refer to the host as "he", "him", "the reviewer", "the host", or "RunPlayBack" when describing ride impressions, install experience, testing, opinions, or takeaways.
- Do not frame the article as a video recap. Avoid phrases like "this video", "in the video", "the video shows", "the video notes", or "from the video". Write it as a standalone article from my hands-on experience.
- Avoid transcript-summary phrasing like "I mention", "I share", "I call out", "I note", or "I say" when describing what happened. Write naturally instead: "I noticed", "the result was", "for comparison", "I’d recommend", or just state the observation directly.
- Prioritize real-world riding impressions over specs.
- Use short paragraphs and descriptive subheadings.
- Include What We Like, Things To Consider, Final Thoughts, and Links sections.
- Format product and affiliate links as Markdown links with only the product/link name visible, like [Zondoo ZO01 Plus](https://amzn.to/example). Do not show raw URLs after the link name.
- Do not include a Video section in the article body. The website automatically embeds the YouTube video below the article.
- Do not include the current YouTube video URL in the article body or Links section.
- Preserve URLs from the description in the Links section.
- Do not invent specs that are not supported by the source.
- Do not use bold markdown for phrase emphasis. Avoid wrapping words or phrases in **double asterisks**.

Video title:
${video.title}

Video URL:
${video.video_url}

Thumbnail URL:
${video.thumbnail_url || ""}

YouTube description:
${video.description || ""}

Captions:
${video.captions_text || "No captions imported."}`,
      model: process.env.OPENAI_MODEL || "gpt-5.2",
      text: {
        format: {
          type: "json_object",
        },
      },
    }),
    headers: {
      Authorization: `Bearer ${requiredEnv("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`OpenAI draft generation failed: ${await response.text()}`);
  }

  const data = await response.json();
  const outputText = extractResponseText(data);

  if (!outputText) {
    throw new Error("OpenAI response did not include text.");
  }

  const parsed = JSON.parse(extractJson(outputText));
  const title = parsed.title || video.title;

  return {
    content:
      parsed.content ||
      `Introduction\n\nDraft article for ${video.title}.\n\nVideo\n\n${video.video_url}`,
    seo_description:
      parsed.seo_description || `RunPlayBack article companion for ${video.title}.`,
    seo_title: parsed.seo_title || title,
    slug: parsed.slug ? slugify(parsed.slug) : slugify(title),
    title,
  };
}

async function generateArticleDraftWithRetry(video, maxAttempts = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await generateArticleDraft(video);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);

      if (isOpenAIQuotaError(message)) {
        throw error;
      }

      if (attempt === maxAttempts) {
        break;
      }

      console.log(
        `OpenAI draft generation failed on attempt ${attempt}/${maxAttempts}: ${message}`,
      );
      console.log("Retrying draft generation...");
      await wait(3000 * attempt);
    }
  }

  throw lastError || new Error("OpenAI draft generation failed.");
}

async function transcribeAudioFile(audioPath) {
  const body = new FormData();
  const audioBlob = await openAsBlob(audioPath, {
    type: "audio/mpeg",
  });

  body.set("model", process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1");
  body.set("file", audioBlob, "audio.mp3");

  let response;

  try {
    response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      body,
      headers: {
        Authorization: `Bearer ${requiredEnv("OPENAI_API_KEY")}`,
      },
      method: "POST",
    });
  } catch (error) {
    throw new Error(`Could not reach OpenAI transcription API: ${getErrorDetails(error)}`);
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "OpenAI transcription failed.");
  }

  if (!data.text) {
    throw new Error("OpenAI transcription response did not include text.");
  }

  return data.text.trim();
}

async function downloadAudioForTranscription(video) {
  const workDir = await mkdtemp(join(tmpdir(), "runplayback-audio-"));
  const outputTemplate = join(workDir, `${video.youtubeVideoId}.%(ext)s`);

  try {
    await runCommand(
      "yt-dlp",
      [
        "--no-playlist",
        "--extract-audio",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "64K",
        "-o",
        outputTemplate,
        video.videoUrl,
      ],
      {
        stdio: "pipe",
      },
    );

    const files = await readdir(workDir);
    const audioFile = files.find((file) => file.endsWith(".mp3"));

    if (!audioFile) {
      throw new Error("yt-dlp did not create an MP3 audio file.");
    }

    return {
      audioPath: join(workDir, audioFile),
      cleanup: () => rm(workDir, { force: true, recursive: true }),
    };
  } catch (error) {
    await rm(workDir, { force: true, recursive: true });
    throw error;
  }
}

async function transcribeVideoAudio(video) {
  if (!(await commandExists("yt-dlp"))) {
    throw new Error("yt-dlp is not installed. Install it with: brew install yt-dlp");
  }

  if (!(await commandExists("ffmpeg"))) {
    throw new Error("ffmpeg is not installed. Install it with: brew install ffmpeg");
  }

  console.log("Downloading audio for OpenAI transcription...");
  const { audioPath, cleanup } = await downloadAudioForTranscription(video);

  try {
    const audioStats = await stat(audioPath);
    console.log(
      `Audio ready: ${(audioStats.size / 1024 / 1024).toFixed(1)} MB. Transcribing...`,
    );

    return await transcribeAudioFile(audioPath);
  } finally {
    await cleanup();
  }
}

function decodeHtmlEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function isUsableImageUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const path = parsed.pathname.toLowerCase();
    const requestedWidth = Number(parsed.searchParams.get("width") || 0);

    return (
      parsed.protocol.startsWith("http") &&
      (!requestedWidth || requestedWidth >= 600) &&
      !host.endsWith("facebook.com") &&
      !host.endsWith("m.media-amazon.com") &&
      !url.includes("{") &&
      !url.includes("}") &&
      !url.toLowerCase().includes("%7b") &&
      !url.toLowerCase().includes("%7d") &&
      !path.includes("favicon") &&
      !path.includes("logo") &&
      !path.includes("noscript") &&
      !path.includes("pixel") &&
      !path.includes("sprite") &&
      !/_\d+x\./.test(path) &&
      !path.includes("beyond_riders_r_white") &&
      !path.endsWith(".gif") &&
      !path.endsWith(".svg")
    );
  } catch {
    return false;
  }
}

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function isOfficialProductSource(url) {
  const host = getHostname(url);
  const blockedHosts = [
    "youtube.com",
    "youtu.be",
    "instagram.com",
    "facebook.com",
    "tiktok.com",
    "x.com",
    "twitter.com",
    "amazon.com",
    "amzn.to",
    "ebay.com",
    "walmart.com",
  ];

  return Boolean(host) && !blockedHosts.some((blockedHost) => host.endsWith(blockedHost));
}

function imageKey(url) {
  try {
    const parsed = new URL(url);

    return `${parsed.hostname.replace(/^www\./, "").toLowerCase()}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function getProductPageImages(html, pageUrl) {
  const matches = [
    ...html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image|twitter:image:src)["'][^>]+content=["']([^"']+)["'][^>]*>/gi),
    ...html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image|twitter:image:src)["'][^>]*>/gi),
    ...html.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi),
  ];
  const seen = new Set();
  const images = [];

  for (const match of matches) {
    try {
      const url = new URL(decodeHtmlEntities(match[1]), pageUrl)
        .toString()
        .replace(/^http:\/\//, "https://");
      const key = imageKey(url);

      if (!isUsableImageUrl(url) || seen.has(key)) {
        continue;
      }

      images.push(url);
      seen.add(key);
    } catch {
      // Ignore malformed image URLs.
    }
  }

  return images;
}

function lifestyleScore(url) {
  const searchable = url.toLowerCase();
  let score = 0;

  if (/\b(ride|riding|rider|lifestyle|outdoor|street|road)\b/.test(searchable)) {
    score += 8;
  }

  if (/\b(camp|field|park|trail)\b/.test(searchable)) {
    score += 6;
  }

  if (/green-8|green-7|green-6|green-5|green-4/.test(searchable)) {
    score += 4;
  }

  if (!/-1\./.test(searchable)) {
    score += 1;
  }

  return score;
}

async function findArticleImages(description, title) {
  const officialLinks = extractLinksFromDescription(description)
    .filter((link) => isOfficialProductSource(link.url))
    .slice(0, 5);
  const candidates = [];
  const seen = new Set();

  for (const link of officialLinks) {
    try {
      const response = await fetch(link.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; RunPlayBackArticleBot/1.0; +https://runplayback.com)",
        },
        redirect: "follow",
      });

      if (!response.ok) {
        continue;
      }

      const html = await response.text();

      for (const url of getProductPageImages(html, response.url || link.url)) {
        const key = imageKey(url);

        if (seen.has(key)) {
          continue;
        }

        candidates.push({
          alt: link.label || title,
          url,
        });
        seen.add(key);
      }
    } catch {
      // Product images are helpful, not required.
    }
  }

  if (candidates.length < 2) {
    return candidates;
  }

  return [
    candidates[0],
    candidates.slice(1).sort((a, b) => lifestyleScore(b.url) - lifestyleScore(a.url))[0],
  ];
}

function getYouTubeThumbnailVideoId(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

    if (!["img.youtube.com", "i.ytimg.com"].includes(host)) {
      return "";
    }

    return parsed.pathname.match(/\/vi\/([A-Za-z0-9_-]{11})\//)?.[1] || "";
  } catch {
    return "";
  }
}

function isDuplicateThumbnailImage(url, { featuredImageUrl = "", youtubeVideoId = "" } = {}) {
  const imageVideoId = getYouTubeThumbnailVideoId(url);

  if (
    imageVideoId &&
    (imageVideoId === youtubeVideoId ||
      imageVideoId === getYouTubeThumbnailVideoId(featuredImageUrl || ""))
  ) {
    return true;
  }

  return Boolean(featuredImageUrl && imageKey(url) === imageKey(featuredImageUrl));
}

function insertArticleImages(content, images, options = {}) {
  const selectedImages = images
    .filter((image) => !isDuplicateThumbnailImage(image.url, options))
    .slice(0, 1);

  if (!selectedImages.length) {
    return content;
  }

  const lines = content
    .split("\n")
    .filter((line) => !/^!\[[^\]]*\]\(https?:\/\/[^)]+\)$/.test(line.trim()));
  let firstParagraphIndex = -1;
  let activeHeading = "";

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
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

    if (firstParagraphIndex === -1) {
      firstParagraphIndex = index;
    }
  });

  if (firstParagraphIndex === -1) {
    return content;
  }

  const insertions = [
    {
      index: firstParagraphIndex,
      markdown: `![${selectedImages[0].alt}](${selectedImages[0].url})`,
      placement: "after",
    },
  ];
  const output = [];

  lines.forEach((line, index) => {
    const beforeImage = insertions.find(
      (insertion) => insertion.index === index && insertion.placement === "before",
    );

    if (beforeImage) {
      output.push("", beforeImage.markdown, "");
    }

    output.push(line);

    const afterImage = insertions.find(
      (insertion) => insertion.index === index && insertion.placement === "after",
    );

    if (afterImage) {
      output.push("", afterImage.markdown, "");
    }
  });

  return output.join("\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

async function upsertAffiliateLinks(supabase, videoId, description, dryRun) {
  const links = extractLinksFromDescription(description);

  if (!links.length || dryRun) {
    return links.length;
  }

  await supabase.from("affiliate_links").delete().eq("video_id", videoId);
  const { error } = await supabase.from("affiliate_links").insert(
    links.map((link) => ({
      label: link.label,
      url: link.url,
      video_id: videoId,
    })),
  );

  if (error) {
    throw new Error(error.message);
  }

  return links.length;
}

async function findExistingArticleForVideo(supabase, videoId, youtubeVideoId) {
  if (videoId) {
    const { data: article, error } = await supabase
      .from("articles")
      .select("id,title,slug")
      .eq("video_id", videoId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (article) {
      return article;
    }
  }

  const { data: matchingArticles, error } = await supabase
    .from("articles")
    .select("id,title,slug")
    .like("slug", `%-${youtubeVideoId}`)
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return matchingArticles?.[0] || null;
}

async function fetchSavedVideos(supabase, limit) {
  const { data, error } = await supabase
    .from("videos")
    .select(
      "id,youtube_video_id,title,description,thumbnail_url,video_url,published_at,captions_text",
    )
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit * 3);

  if (error) {
    throw new Error(error.message);
  }

  const videos = [];

  for (const video of data || []) {
    const article = await findExistingArticleForVideo(
      supabase,
      video.id,
      video.youtube_video_id,
    );

    if (article) {
      continue;
    }

    videos.push({
      captionsText: video.captions_text || "",
      description: video.description || "",
      durationSeconds: 0,
      id: video.id,
      publishedAt: video.published_at,
      thumbnailUrl:
        video.thumbnail_url ||
        `https://img.youtube.com/vi/${video.youtube_video_id}/hqdefault.jpg`,
      title: video.title,
      videoUrl: video.video_url || `https://youtu.be/${video.youtube_video_id}`,
      youtubeVideoId: video.youtube_video_id,
    });

    if (videos.length >= limit) {
      break;
    }
  }

  return videos;
}

async function main() {
  loadEnv();

  const limit = Number(getArg("limit", "5"));
  const dryRun = hasFlag("dry-run");
  const publish = hasFlag("publish");
  const savedOnly = hasFlag("saved-only");
  const skipCaptions = hasFlag("skip-captions");
  const transcribeAudio = hasFlag("transcribe-audio");
  const ytDlpChannel = hasFlag("yt-dlp-channel");
  const ytDlpSrt = hasFlag("yt-dlp-srt");
  const supabase = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
      },
    },
  );

  console.log(
    savedOnly
      ? `Fetching up to ${limit} saved videos without articles...`
      : ytDlpChannel
        ? `Fetching up to ${limit} RunPlayBack videos with yt-dlp...`
      : `Fetching up to ${limit} RunPlayBack videos...`,
  );
  console.log(publish ? "New articles will be published." : "New articles will be saved as drafts.");
  if (transcribeAudio) {
    console.log("Missing transcripts will be created from downloaded audio with OpenAI.");
  }
  if (ytDlpSrt) {
    console.log("Missing transcripts will be pulled from SRT/VTT captions with yt-dlp.");
  }
  let channelVideos = [];
  let usingSavedVideos = savedOnly;
  const usingYtDlpChannel = ytDlpChannel;

  if (savedOnly) {
    channelVideos = await fetchSavedVideos(supabase, limit);
  } else if (ytDlpChannel) {
    try {
      channelVideos = await fetchChannelVideosWithYtDlp(supabase, limit);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      console.log(`yt-dlp channel scan failed: ${message}`);
      console.log("Falling back to saved videos that do not have articles yet.");
      usingSavedVideos = true;
      channelVideos = await fetchSavedVideos(supabase, limit);
    }
  } else {
    try {
      channelVideos = await fetchAllChannelVideos(limit, supabase);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (!message.toLowerCase().includes("quota")) {
        throw error;
      }

      console.log(`YouTube quota blocked the channel fetch: ${message}`);
      console.log("Falling back to saved videos that do not have articles yet.");
      usingSavedVideos = true;
      channelVideos = await fetchSavedVideos(supabase, limit);
    }
  }

  const failedVideos = [];
  console.log(`Found ${channelVideos.length} videos.`);

  for (const [index, channelVideo] of channelVideos.entries()) {
    console.log(`\n[${index + 1}/${channelVideos.length}] ${channelVideo.title}`);
    console.log(
      channelVideo.durationSeconds
        ? `Duration: ${Math.round(channelVideo.durationSeconds / 60)} minutes`
        : "Duration: unknown",
    );

    try {
      const { data: existingVideo } = channelVideo.id
        ? {
            data: {
              id: channelVideo.id,
              captions_text: channelVideo.captionsText,
            },
          }
        : await supabase
            .from("videos")
            .select("id,captions_text")
            .eq("youtube_video_id", channelVideo.youtubeVideoId)
            .maybeSingle();

      const videoPayload = {
        description: channelVideo.description,
        published_at: channelVideo.publishedAt,
        thumbnail_url: channelVideo.thumbnailUrl,
        title: channelVideo.title,
        video_url: channelVideo.videoUrl,
        youtube_video_id: channelVideo.youtubeVideoId,
      };

      let videoId = existingVideo?.id;

      if (!dryRun) {
        const { data: upsertedVideo, error: videoError } = await supabase
          .from("videos")
          .upsert(videoPayload, { onConflict: "youtube_video_id" })
          .select("id,captions_text")
          .single();

        if (videoError || !upsertedVideo) {
          throw new Error(videoError?.message || "Unable to upsert video.");
        }

        videoId = upsertedVideo.id;
      }

      console.log(videoId ? `Video saved: ${videoId}` : "Video would be saved.");

      if (videoId) {
        const linkCount = await upsertAffiliateLinks(
          supabase,
          videoId,
          channelVideo.description,
          dryRun,
        );
        console.log(`${dryRun ? "Would save" : "Saved"} ${linkCount} description links.`);
      }

      const article = await findExistingArticleForVideo(
        supabase,
        videoId,
        channelVideo.youtubeVideoId,
      );

      if (article) {
        console.log(
          `Article already exists. Skipping draft generation: ${article.title}`,
        );
        continue;
      }

      let captionsText = existingVideo?.captions_text || "";

      if (!skipCaptions && !usingSavedVideos && !usingYtDlpChannel && !captionsText) {
        try {
          captionsText = await importOfficialCaptions(supabase, channelVideo.youtubeVideoId);
          console.log(captionsText ? "Captions imported." : "No captions found.");

          if (!dryRun && videoId && captionsText) {
            await supabase
              .from("videos")
              .update({ captions_text: captionsText })
              .eq("id", videoId);
          }
        } catch (error) {
          console.log(`Captions skipped: ${error.message}`);
        }
      }

      if (ytDlpSrt && !captionsText) {
        captionsText = await downloadSrtWithYtDlp(channelVideo);
        console.log("yt-dlp SRT transcript imported.");

        if (!dryRun && videoId && captionsText) {
          await supabase
            .from("videos")
            .update({ captions_text: captionsText })
            .eq("id", videoId);
        }
      }

      if (transcribeAudio && !captionsText) {
        captionsText = await transcribeVideoAudio(channelVideo);
        console.log("OpenAI audio transcript created.");

        if (!dryRun && videoId && captionsText) {
          await supabase
            .from("videos")
            .update({ captions_text: captionsText })
            .eq("id", videoId);
        }
      }

      const draftSource = {
        captions_text: captionsText || null,
        description: channelVideo.description,
        thumbnail_url: channelVideo.thumbnailUrl,
        title: channelVideo.title,
        video_url: channelVideo.videoUrl,
      };
      const draft = await generateArticleDraftWithRetry(draftSource);
      const images = await findArticleImages(channelVideo.description, channelVideo.title);
      const content = insertArticleImages(draft.content, images, {
        featuredImageUrl: channelVideo.thumbnailUrl,
        youtubeVideoId: channelVideo.youtubeVideoId,
      });
      const slug = `${draft.slug}-${channelVideo.youtubeVideoId}`;

      if (dryRun) {
        console.log(
          `Would create ${publish ? "published" : "draft"} article: ${draft.title}`,
        );
        continue;
      }

      const { data: createdArticle, error: articleError } = await supabase
        .from("articles")
        .insert({
          content,
          author_name: "RunPlayBack",
          featured_image_url: channelVideo.thumbnailUrl,
          published_at: channelVideo.publishedAt,
          seo_description: draft.seo_description,
          seo_title: draft.seo_title,
          slug,
          status: publish ? "published" : "draft",
          title: draft.title,
          video_id: videoId,
        })
        .select("id")
        .single();

      if (articleError || !createdArticle) {
        throw new Error(articleError?.message || "Unable to create article.");
      }

      console.log(`${publish ? "Published" : "Draft"} article created: ${createdArticle.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      failedVideos.push({
        title: channelVideo.title,
        youtubeVideoId: channelVideo.youtubeVideoId,
        message,
      });
      console.log(`Skipped this video after an error: ${message}`);
    }
  }

  if (failedVideos.length) {
    console.log("\nSome videos were skipped:");
    failedVideos.forEach((failure) => {
      console.log(`- ${failure.title} (${failure.youtubeVideoId}): ${failure.message}`);
    });

    if (failedVideos.some((failure) => isOpenAIQuotaError(failure.message))) {
      throw new Error(
        "OpenAI quota is exhausted. Add billing/credits or wait for quota to reset, then rerun the importer.",
      );
    }
  }

  console.log("\nBackfill complete.");
}

main().catch((error) => {
  console.error(`\nBackfill failed: ${error.message}`);
  process.exit(1);
});
