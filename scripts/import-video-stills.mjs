import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { resolve } from "node:path";

const defaultBucket = "article-stills";
const defaultStillCount = 4;
const defaultZoom = 1;
const defaultCandidateCount = 5;
const defaultSampleWindow = 60;
const previewWidth = 160;
const previewHeight = 90;

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

  if (value) {
    return value.slice(prefix.length);
  }

  const index = process.argv.indexOf(`--${name}`);

  if (index !== -1 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }

  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required in .env.local.`);
  }

  return value;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(
          new Error(
            `${command} failed with exit code ${code}.\n${stderr.trim() || stdout.trim()}`,
          ),
        );
      }
    });
  });
}

function runCommandBuffer(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    const stdout = [];
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout.push(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout));
      } else {
        reject(
          new Error(
            `${command} failed with exit code ${code}.\n${stderr.trim()}`,
          ),
        );
      }
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatTimestamp(seconds) {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function getSafeZoom(value) {
  const zoom = Number(value) || defaultZoom;

  return Math.min(2.25, Math.max(1, zoom));
}

function getFrameFilter(zoom) {
  const safeZoom = getSafeZoom(zoom);

  if (safeZoom <= 1.01) {
    return "scale='min(1600,iw)':-2";
  }

  return `crop=iw/${safeZoom}:ih/${safeZoom}:(iw-iw/${safeZoom})/2:(ih-ih/${safeZoom})/2,scale='min(1600,iw)':-2`;
}

function getPreviewFrameFilter(zoom) {
  const safeZoom = getSafeZoom(zoom);
  const scaleFilter = `scale=${previewWidth}:${previewHeight}`;

  if (safeZoom <= 1.01) {
    return scaleFilter;
  }

  return `crop=iw/${safeZoom}:ih/${safeZoom}:(iw-iw/${safeZoom})/2:(ih-ih/${safeZoom})/2,${scaleFilter}`;
}

function getYouTubeVideoIdFromText(value = "") {
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
    /-([A-Za-z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);

    if (match?.[1]) {
      return match[1];
    }
  }

  return "";
}

function getArticleVideo(article) {
  const video = Array.isArray(article.videos) ? article.videos[0] : article.videos;
  const videoId =
    video?.youtube_video_id ||
    getYouTubeVideoIdFromText(`${video?.video_url || ""}\n${article.slug}\n${article.content || ""}`);
  const videoUrl = video?.video_url || (videoId ? `https://youtu.be/${videoId}` : "");

  return {
    videoId,
    videoUrl,
  };
}

function getFrameTimestamps(duration, count) {
  const safeDuration = Math.max(0, Number(duration) || 0);
  const safeCount = Math.max(1, Number(count) || defaultStillCount);

  if (!safeDuration) {
    return [];
  }

  const interval = safeDuration / (safeCount + 1);

  return Array.from({ length: safeCount }, (_, index) =>
    Math.round(interval * (index + 1)),
  );
}

function getCandidateTimestamps(timestamp, duration, candidateCount, sampleWindow) {
  const safeCandidateCount = Math.max(1, Math.round(candidateCount));
  const safeWindow = Math.max(0, Number(sampleWindow) || 0);
  const halfWindow = safeWindow / 2;
  const start = Math.max(1, timestamp - halfWindow);
  const end = Math.min(Math.max(1, duration - 1), timestamp + halfWindow);

  if (safeCandidateCount === 1 || start >= end) {
    return [Math.round(Math.min(Math.max(1, timestamp), Math.max(1, duration - 1)))];
  }

  const interval = (end - start) / (safeCandidateCount - 1);

  return Array.from({ length: safeCandidateCount }, (_, index) =>
    Math.round(start + interval * index),
  );
}

function getLuminance(buffer, pixelIndex) {
  const offset = pixelIndex * 3;

  return (
    buffer[offset] * 0.2126 +
    buffer[offset + 1] * 0.7152 +
    buffer[offset + 2] * 0.0722
  );
}

function scorePreviewFrame(buffer) {
  if (buffer.length < previewWidth * previewHeight * 3) {
    return 0;
  }

  let centerDetail = 0;
  let centerContrast = 0;
  let centerPixels = 0;
  let centerBrightness = 0;
  let outerDetail = 0;
  let outerPixels = 0;
  const centerLeft = Math.round(previewWidth * 0.2);
  const centerRight = Math.round(previewWidth * 0.8);
  const centerTop = Math.round(previewHeight * 0.14);
  const centerBottom = Math.round(previewHeight * 0.88);

  for (let y = 1; y < previewHeight; y += 1) {
    for (let x = 1; x < previewWidth; x += 1) {
      const pixelIndex = y * previewWidth + x;
      const luminance = getLuminance(buffer, pixelIndex);
      const left = getLuminance(buffer, pixelIndex - 1);
      const above = getLuminance(buffer, pixelIndex - previewWidth);
      const detail = Math.abs(luminance - left) + Math.abs(luminance - above);
      const isCenter =
        x >= centerLeft &&
        x <= centerRight &&
        y >= centerTop &&
        y <= centerBottom;

      if (isCenter) {
        centerDetail += detail;
        centerContrast += Math.abs(luminance - 128);
        centerBrightness += luminance;
        centerPixels += 1;
      } else {
        outerDetail += detail;
        outerPixels += 1;
      }
    }
  }

  const averageCenterDetail = centerDetail / Math.max(1, centerPixels);
  const averageOuterDetail = outerDetail / Math.max(1, outerPixels);
  const averageCenterContrast = centerContrast / Math.max(1, centerPixels);
  const averageCenterBrightness = centerBrightness / Math.max(1, centerPixels);
  const exposurePenalty =
    averageCenterBrightness < 35 || averageCenterBrightness > 225 ? 18 : 0;

  return (
    averageCenterDetail * 1.35 +
    averageCenterContrast * 0.18 -
    averageOuterDetail * 0.28 -
    exposurePenalty
  );
}

function extractMarkdownImages(content) {
  return [...content.matchAll(/^!\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/gm)].map(
    (match) => ({
      alt: match[1],
      url: match[2],
    }),
  );
}

function countVideoStills(content) {
  return getExistingVideoStills(content).length;
}

function getExistingVideoStills(content) {
  return extractMarkdownImages(content).filter(
    (image) =>
      image.alt.toLowerCase().startsWith("video still") ||
      image.url.includes("/article-stills/"),
  );
}

function removeExistingVideoStills(content) {
  return content
    .split("\n")
    .filter((line) => {
      const match = line
        .trim()
        .match(/^!\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/);

      if (!match) {
        return true;
      }

      return (
        !match[1].toLowerCase().startsWith("video still") &&
        !match[2].includes("/article-stills/")
      );
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function getMarkdownImageLines(content) {
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

function replaceVideoStillUrl(content, stillIndex, replacementUrl, fallbackAlt) {
  const lines = content.split("\n");
  const stills = getMarkdownImageLines(content).filter(
    (image) =>
      image.alt.toLowerCase().startsWith("video still") ||
      image.url.includes("/article-stills/"),
  );
  const still = stills[stillIndex];

  if (!still) {
    throw new Error("That video still could not be found.");
  }

  lines[still.index] = `![${still.alt || fallbackAlt}](${replacementUrl})`;

  return lines.join("\n");
}

function normalizeHeading(line) {
  return line.replace(/^#{1,6}\s+/, "").replaceAll("**", "").trim().toLowerCase();
}

function isHeading(line) {
  const trimmed = line.trim();

  return (
    /^#{1,6}\s+/.test(trimmed) ||
    (trimmed.length < 80 &&
      !/^https?:\/\//.test(trimmed) &&
      !/^!\[/.test(trimmed) &&
      !trimmed.endsWith(".") &&
      !trimmed.endsWith("?") &&
      !trimmed.endsWith("!"))
  );
}

function shouldStopStillPlacementAtHeading(heading) {
  return (
    heading === "links" ||
    heading === "related reviews" ||
    heading === "watch the video" ||
    heading === "video" ||
    heading.startsWith("video chapters")
  );
}

function isSkippableStillPlacementHeading(heading) {
  return (
    !heading ||
    heading === "introduction" ||
    heading === "intro" ||
    heading === "final thoughts" ||
    heading === "final verdict" ||
    heading === "conclusion"
  );
}

function getEligibleHeadingIndexes(lines) {
  const indexes = [];
  let hasSeenBodyText = false;
  let shouldStop = false;

  lines.forEach((line, index) => {
    if (shouldStop) {
      return;
    }

    const trimmed = line.trim();

    if (!trimmed) {
      return;
    }

    if (isHeading(trimmed)) {
      const heading = normalizeHeading(trimmed);

      if (shouldStopStillPlacementAtHeading(heading)) {
        shouldStop = true;
        return;
      }

      if (hasSeenBodyText && !isSkippableStillPlacementHeading(heading)) {
        indexes.push(index);
      }

      return;
    }

    if (
      /^!\[/.test(trimmed) ||
      /^https?:\/\//.test(trimmed) ||
      trimmed.length < 80
    ) {
      return;
    }

    hasSeenBodyText = true;
  });

  return indexes;
}

function distributeVideoStills(content, stills) {
  if (!stills.length) {
    return content;
  }

  const lines = removeExistingVideoStills(content).split("\n");
  const headingIndexes = getEligibleHeadingIndexes(lines);

  if (!headingIndexes.length) {
    return content;
  }

  const stillsToPlace = stills.slice(0, Math.min(stills.length, headingIndexes.length));
  const targetIndexes = stillsToPlace.map((_, index) => {
    const targetPosition = Math.round(
      ((index + 1) * headingIndexes.length) / (stillsToPlace.length + 1),
    );

    return headingIndexes[Math.min(headingIndexes.length - 1, targetPosition)];
  });
  const insertions = new Map();

  stillsToPlace.forEach((still, index) => {
    const targetIndex = targetIndexes[index];
    const existing = insertions.get(targetIndex) || [];

    existing.push(`![${still.alt}](${still.url})`);
    insertions.set(targetIndex, existing);
  });

  const output = [];

  lines.forEach((line, index) => {
    if (insertions.has(index)) {
      output.push(...insertions.get(index), "");
    }

    output.push(line);
  });

  return output.join("\n").replace(/\n{3,}/g, "\n\n");
}

async function ensureBucket(supabase, bucket) {
  const { error } = await supabase.storage.createBucket(bucket, {
    public: true,
  });

  if (error && !/already exists/i.test(error.message)) {
    throw error;
  }
}

function getYtDlpAuthArgs(options) {
  if (!options.cookiesFromBrowser) {
    return [];
  }

  return ["--cookies-from-browser", options.cookiesFromBrowser];
}

async function getVideoInfo(videoUrl, options) {
  const output = await runCommand("yt-dlp", [
    "--dump-single-json",
    "--no-warnings",
    "--skip-download",
    "--no-playlist",
    ...getYtDlpAuthArgs(options),
    videoUrl,
  ]);

  return JSON.parse(output);
}

async function getDirectVideoUrl(videoUrl, options) {
  const output = await runCommand("yt-dlp", [
    "-g",
    "-f",
    "best[ext=mp4][height<=1080]/best[height<=1080]/best",
    "--no-warnings",
    "--no-playlist",
    ...getYtDlpAuthArgs(options),
    videoUrl,
  ]);

  return output.split("\n").find(Boolean) || output;
}

async function extractFrame({ directVideoUrl, outputPath, timestamp, zoom }) {
  await runCommand("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    String(timestamp),
    "-i",
    directVideoUrl,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    "-vf",
    getFrameFilter(zoom),
    outputPath,
  ]);
}

async function extractPreviewFrame({ directVideoUrl, timestamp, zoom }) {
  return runCommandBuffer("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    String(timestamp),
    "-i",
    directVideoUrl,
    "-frames:v",
    "1",
    "-vf",
    getPreviewFrameFilter(zoom),
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "pipe:1",
  ]);
}

async function chooseBestTimestamp({
  candidateCount,
  directVideoUrl,
  duration,
  sampleWindow,
  timestamp,
  zoom,
}) {
  const candidates = getCandidateTimestamps(
    timestamp,
    duration,
    candidateCount,
    sampleWindow,
  );
  let best = {
    score: -Infinity,
    timestamp,
  };

  for (const candidate of candidates) {
    try {
      const buffer = await extractPreviewFrame({
        directVideoUrl,
        timestamp: candidate,
        zoom,
      });
      const score = scorePreviewFrame(buffer);

      if (score > best.score) {
        best = {
          score,
          timestamp: candidate,
        };
      }
    } catch (error) {
      console.log(
        `Skipped candidate at ${formatTimestamp(candidate)}: ${error.message}`,
      );
    }
  }

  return best;
}

async function uploadStill({ bucket, filePath, objectPath, supabase }) {
  const bytes = await readFile(filePath);
  const { error } = await supabase.storage.from(bucket).upload(objectPath, bytes, {
    contentType: "image/jpeg",
    upsert: true,
  });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);

  return data.publicUrl;
}

async function fetchArticles(supabase, { slug }) {
  let query = supabase
    .from("articles")
    .select(
      "id,title,slug,content,status,published_at,videos(youtube_video_id,video_url,title)",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (slug) {
    query = query.eq("slug", slug);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

async function processArticle(supabase, article, options) {
  const { videoId, videoUrl } = getArticleVideo(article);
  const existingVideoStills = getExistingVideoStills(article.content || "");

  if (options.reflowOnly) {
    if (!existingVideoStills.length) {
      console.log(`Skipped: ${article.title} has no existing video stills to reflow.`);
      return false;
    }

    if (!options.apply) {
      console.log(`Dry run: would reflow existing still placement for ${article.slug}.`);
      return true;
    }

    const nextContent = distributeVideoStills(
      article.content || "",
      existingVideoStills.slice(0, options.count),
    );
    const { error } = await supabase
      .from("articles")
      .update({
        content: nextContent,
        updated_at: new Date().toISOString(),
      })
      .eq("id", article.id);

    if (error) {
      throw error;
    }

    console.log(`Reflowed existing still placement: ${article.slug}`);
    return true;
  }

  if (!videoId || !videoUrl) {
    console.log(`Skipped: ${article.title} has no matched YouTube video.`);
    return false;
  }

  const existingStillCount = countVideoStills(article.content || "");

  if (existingStillCount >= options.count && !options.force) {
    console.log(`Skipped: ${article.title} already has ${existingStillCount} video stills.`);
    return false;
  }

  console.log(`\n${article.title}`);
  console.log(`Extracting ${options.count} stills from ${videoUrl}`);

  if (!options.apply) {
    console.log("Dry run: no images extracted or saved.");
    return true;
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "runplayback-stills-"));

  try {
    const videoInfo = await getVideoInfo(videoUrl, options);
    const duration = Number(videoInfo.duration || 0);
    const timestamps = getFrameTimestamps(duration, options.count);
    const directVideoUrl = await getDirectVideoUrl(videoUrl, options);
    const stills = [];

    for (const [index, timestamp] of timestamps.entries()) {
      const frameNumber = index + 1;
      const bestFrame = await chooseBestTimestamp({
        candidateCount: options.candidates,
        directVideoUrl,
        duration,
        sampleWindow: options.sampleWindow,
        timestamp,
        zoom: options.zoom,
      });
      const zoomLabel = `z${String(options.zoom).replace(".", "p")}`;
      const fileName = `${videoId}-${String(frameNumber).padStart(2, "0")}-${zoomLabel}.jpg`;
      const filePath = path.join(tempDir, fileName);
      const objectPath = `${videoId}/${fileName}`;

      await extractFrame({
        directVideoUrl,
        outputPath: filePath,
        timestamp: bestFrame.timestamp,
        zoom: options.zoom,
      });

      const publicUrl = await uploadStill({
        bucket: options.bucket,
        filePath,
        objectPath,
        supabase,
      });

      stills.push({
        alt: `Video still from ${article.title} at ${formatTimestamp(bestFrame.timestamp)}`,
        url: publicUrl,
      });
      console.log(
        `Saved still ${frameNumber}/${options.count} at ${formatTimestamp(bestFrame.timestamp)} ` +
          `(target ${formatTimestamp(timestamp)}, score ${bestFrame.score.toFixed(1)})`,
      );
    }

    const nextContent = distributeVideoStills(article.content || "", stills);
    const { error } = await supabase
      .from("articles")
      .update({
        content: nextContent,
        updated_at: new Date().toISOString(),
      })
      .eq("id", article.id);

    if (error) {
      throw error;
    }

    console.log(`Updated article: ${article.slug}`);
    return true;
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

async function extractReplacementStill(supabase, article, stillIndex, options, jobId) {
  const { videoId, videoUrl } = getArticleVideo(article);

  if (!videoId || !videoUrl) {
    throw new Error("This review does not have a matched YouTube video.");
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "runplayback-still-job-"));

  try {
    const videoInfo = await getVideoInfo(videoUrl, options);
    const duration = Number(videoInfo.duration || 0);
    const timestamps = getFrameTimestamps(duration, options.count);
    const timestamp = timestamps[stillIndex];

    if (!timestamp) {
      throw new Error("Could not calculate a timestamp for this still.");
    }

    const directVideoUrl = await getDirectVideoUrl(videoUrl, options);
    const bestFrame = await chooseBestTimestamp({
      candidateCount: options.candidates,
      directVideoUrl,
      duration,
      sampleWindow: options.sampleWindow,
      timestamp,
      zoom: options.zoom,
    });
    const zoomLabel = `z${String(options.zoom).replace(".", "p")}`;
    const fileName = `${videoId}-${String(stillIndex + 1).padStart(2, "0")}-${jobId}-${zoomLabel}.jpg`;
    const filePath = path.join(tempDir, fileName);
    const objectPath = `${videoId}/${fileName}`;

    await extractFrame({
      directVideoUrl,
      outputPath: filePath,
      timestamp: bestFrame.timestamp,
      zoom: options.zoom,
    });

    const url = await uploadStill({
      bucket: options.bucket,
      filePath,
      objectPath,
      supabase,
    });

    return {
      alt: `Video still from ${article.title} at ${formatTimestamp(bestFrame.timestamp)}`,
      targetTimestamp: timestamp,
      timestamp: bestFrame.timestamp,
      url,
    };
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

async function fetchQueuedStillJobs(supabase, limit) {
  const { data, error } = await supabase
    .from("video_still_jobs")
    .select(
      "id,still_index,articles(id,title,slug,content,status,published_at,videos(youtube_video_id,video_url,title))",
    )
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data || [];
}

async function updateStillJob(supabase, id, values) {
  const { error } = await supabase
    .from("video_still_jobs")
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw error;
  }
}

async function processQueuedStillJobs(supabase, options, limit) {
  const jobs = await fetchQueuedStillJobs(supabase, limit || 10);
  let processed = 0;
  let failed = 0;

  console.log(`Queued still jobs found: ${jobs.length}`);

  for (const [index, job] of jobs.entries()) {
    const article = Array.isArray(job.articles) ? job.articles[0] : job.articles;

    if (!article) {
      failed += 1;
      await updateStillJob(supabase, job.id, {
        error_message: "Review not found.",
        status: "failed",
      });
      continue;
    }

    try {
      console.log(`\n${article.title}`);
      console.log(`Regenerating still ${job.still_index + 1}/${options.count}`);

      await updateStillJob(supabase, job.id, {
        error_message: null,
        status: "processing",
      });

      if (!options.apply) {
        console.log("Dry run: no replacement still generated.");
        processed += 1;
        continue;
      }

      const replacement = await extractReplacementStill(
        supabase,
        article,
        job.still_index,
        options,
        job.id,
      );
      const nextContent = replaceVideoStillUrl(
        article.content || "",
        job.still_index,
        replacement.url,
        replacement.alt,
      );
      const { error: articleError } = await supabase
        .from("articles")
        .update({
          content: nextContent,
          updated_at: new Date().toISOString(),
        })
        .eq("id", article.id);

      if (articleError) {
        throw articleError;
      }

      await updateStillJob(supabase, job.id, {
        error_message: null,
        processed_at: new Date().toISOString(),
        replacement_url: replacement.url,
        status: "done",
      });

      console.log(
        `Updated still ${job.still_index + 1} at ${formatTimestamp(replacement.timestamp)} ` +
          `(target ${formatTimestamp(replacement.targetTimestamp)})`,
      );
      processed += 1;
    } catch (error) {
      failed += 1;
      const cause = error?.cause?.message || error?.cause?.code || "";
      const message = `${error.message}${cause ? `; cause: ${cause}` : ""}`;

      console.log(`Failed: ${message}`);
      await updateStillJob(supabase, job.id, {
        error_message: message,
        processed_at: new Date().toISOString(),
        status: "failed",
      });

      if (!options.continueOnError || failed >= options.maxErrors) {
        throw error;
      }
    }

    if (options.sleepSeconds && index < jobs.length - 1) {
      console.log(`Pausing ${options.sleepSeconds} seconds before the next job...`);
      await sleep(options.sleepSeconds * 1000);
    }
  }

  console.log(`\nProcessed jobs: ${processed}`);
  console.log(`Failed jobs: ${failed}`);
}

async function main() {
  loadEnv();

  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
  const options = {
    apply: hasFlag("apply"),
    bucket: getArg("bucket", defaultBucket),
    candidates:
      Number(getArg("candidates", String(defaultCandidateCount))) ||
      defaultCandidateCount,
    cookiesFromBrowser: getArg("cookies-from-browser", ""),
    count: Number(getArg("count", String(defaultStillCount))) || defaultStillCount,
    force: hasFlag("force"),
    continueOnError: hasFlag("continue-on-error") || hasFlag("all"),
    maxErrors: Number(getArg("max-errors", "20")) || 20,
    processQueue: hasFlag("process-queue"),
    reflowOnly: hasFlag("reflow-only"),
    sampleWindow:
      Number(getArg("sample-window", String(defaultSampleWindow))) ||
      defaultSampleWindow,
    sleepSeconds: Number(getArg("sleep", "0")) || 0,
    zoom: getSafeZoom(getArg("zoom", String(defaultZoom))),
  };
  const limit =
    hasFlag("all") || getArg("limit", "") === "all"
      ? undefined
      : Number(getArg("limit", "0")) || undefined;
  const slug = getArg("slug", "");
  const videoId = getArg("video-id", "") || getYouTubeVideoIdFromText(slug);

  console.log(
    `${options.apply ? "Importing" : "Dry run: scanning"} video stills for published articles...`,
  );
  console.log(`Still count per article: ${options.count}`);
  console.log(`Frame zoom crop: ${options.zoom}x`);
  console.log(
    `Frame selection: ${options.candidates} candidates over ${options.sampleWindow} seconds per still`,
  );
  if (options.cookiesFromBrowser) {
    console.log(`yt-dlp auth: using ${options.cookiesFromBrowser} browser cookies`);
  }
  if (options.sleepSeconds) {
    console.log(`Pause between articles: ${options.sleepSeconds} seconds`);
  }
  if (options.continueOnError) {
    console.log(`Continue on errors: yes, stopping after ${options.maxErrors} errors`);
  }
  if (options.reflowOnly) {
    console.log("Reflow only: yes, existing stills will be moved without downloading videos");
  }
  if (options.processQueue) {
    console.log("Queue mode: processing requested still regenerations");
  }

  if (options.apply) {
    await ensureBucket(supabase, options.bucket);
  }

  if (options.processQueue) {
    await processQueuedStillJobs(supabase, options, limit || 10);
    return;
  }

  let articles = await fetchArticles(supabase, { slug });

  if (!articles.length && slug && videoId) {
    console.log(
      `No article matched slug "${slug}". Searching published articles by video ID ${videoId} instead.`,
    );
    articles = await fetchArticles(supabase, { slug: "" });
  }

  const candidates = articles
    .filter(
      (article) =>
        (options.reflowOnly
          ? countVideoStills(article.content || "") > 0
          : options.force ||
          slug ||
          countVideoStills(article.content || "") < options.count) &&
        (options.reflowOnly || Boolean(getArticleVideo(article).videoId)) &&
        (!videoId || getArticleVideo(article).videoId === videoId),
    )
    .slice(0, limit || undefined);
  let processed = 0;
  let failed = 0;

  for (const [index, article] of candidates.entries()) {
    try {
      const didProcess = await processArticle(supabase, article, options);

      if (didProcess) {
        processed += 1;
      }
    } catch (error) {
      failed += 1;
      const cause = error?.cause?.message || error?.cause?.code || "";
      console.log(
        `Failed: ${article.title}\n${error.message}${cause ? `; cause: ${cause}` : ""}`,
      );

      if (!options.continueOnError || failed >= options.maxErrors) {
        throw error;
      }
    }

    if (options.sleepSeconds && index < candidates.length - 1) {
      console.log(`Pausing ${options.sleepSeconds} seconds before the next article...`);
      await sleep(options.sleepSeconds * 1000);
    }
  }

  console.log(`\nScanned: ${articles.length}`);
  console.log(`Candidates: ${candidates.length}`);
  console.log(`Processed: ${processed}`);
  console.log(`Failed: ${failed}`);
}

main().catch((error) => {
  const cause = error?.cause?.message || error?.cause?.code || "";
  console.error(
    `Video still import failed: ${error.message}${cause ? `; cause: ${cause}` : ""}`,
  );
  process.exit(1);
});
