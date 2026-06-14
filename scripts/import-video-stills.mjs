import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { resolve } from "node:path";

const defaultBucket = "article-stills";
const defaultStillCount = 6;

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

function formatTimestamp(seconds) {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
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

function extractMarkdownImages(content) {
  return [...content.matchAll(/^!\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/gm)].map(
    (match) => ({
      alt: match[1],
      url: match[2],
    }),
  );
}

function countVideoStills(content) {
  return extractMarkdownImages(content).filter(
    (image) =>
      image.alt.toLowerCase().startsWith("video still") ||
      image.url.includes("/article-stills/"),
  ).length;
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

function getEligibleParagraphIndexes(lines) {
  const indexes = [];
  let activeHeading = "";

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return;
    }

    if (isHeading(trimmed)) {
      activeHeading = normalizeHeading(trimmed);
      return;
    }

    if (
      activeHeading === "links" ||
      activeHeading === "video" ||
      activeHeading.startsWith("video chapters") ||
      /^!\[/.test(trimmed) ||
      /^https?:\/\//.test(trimmed) ||
      trimmed.length < 80
    ) {
      return;
    }

    indexes.push(index);
  });

  return indexes;
}

function distributeVideoStills(content, stills) {
  if (!stills.length) {
    return content;
  }

  const lines = removeExistingVideoStills(content).split("\n");
  const paragraphIndexes = getEligibleParagraphIndexes(lines);

  if (!paragraphIndexes.length) {
    return content;
  }

  const targetIndexes = stills.map((_, index) => {
    const targetPosition = Math.round(
      ((index + 1) * paragraphIndexes.length) / (stills.length + 1),
    );

    return paragraphIndexes[Math.min(paragraphIndexes.length - 1, targetPosition)];
  });
  const insertions = new Map();

  stills.forEach((still, index) => {
    const targetIndex = targetIndexes[index];
    const existing = insertions.get(targetIndex) || [];

    existing.push(`![${still.alt}](${still.url})`);
    insertions.set(targetIndex, existing);
  });

  const output = [];

  lines.forEach((line, index) => {
    output.push(line);

    if (insertions.has(index)) {
      output.push("", ...insertions.get(index), "");
    }
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

async function getVideoInfo(videoUrl) {
  const output = await runCommand("yt-dlp", [
    "--dump-single-json",
    "--no-warnings",
    "--skip-download",
    "--no-playlist",
    videoUrl,
  ]);

  return JSON.parse(output);
}

async function getDirectVideoUrl(videoUrl) {
  const output = await runCommand("yt-dlp", [
    "-g",
    "-f",
    "best[ext=mp4][height<=1080]/best[height<=1080]/best",
    "--no-warnings",
    "--no-playlist",
    videoUrl,
  ]);

  return output.split("\n").find(Boolean) || output;
}

async function extractFrame({ directVideoUrl, outputPath, timestamp }) {
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
    "scale='min(1600,iw)':-2",
    outputPath,
  ]);
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
    const videoInfo = await getVideoInfo(videoUrl);
    const duration = Number(videoInfo.duration || 0);
    const timestamps = getFrameTimestamps(duration, options.count);
    const directVideoUrl = await getDirectVideoUrl(videoUrl);
    const stills = [];

    for (const [index, timestamp] of timestamps.entries()) {
      const frameNumber = index + 1;
      const fileName = `${videoId}-${String(frameNumber).padStart(2, "0")}.jpg`;
      const filePath = path.join(tempDir, fileName);
      const objectPath = `${videoId}/${fileName}`;

      await extractFrame({
        directVideoUrl,
        outputPath: filePath,
        timestamp,
      });

      const publicUrl = await uploadStill({
        bucket: options.bucket,
        filePath,
        objectPath,
        supabase,
      });

      stills.push({
        alt: `Video still from ${article.title} at ${formatTimestamp(timestamp)}`,
        url: publicUrl,
      });
      console.log(`Saved still ${frameNumber}/${options.count} at ${formatTimestamp(timestamp)}`);
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
    count: Number(getArg("count", String(defaultStillCount))) || defaultStillCount,
    force: hasFlag("force"),
  };
  const limit = Number(getArg("limit", "0")) || undefined;
  const slug = getArg("slug", "");

  console.log(
    `${options.apply ? "Importing" : "Dry run: scanning"} video stills for published articles...`,
  );
  console.log(`Still count per article: ${options.count}`);

  if (options.apply) {
    await ensureBucket(supabase, options.bucket);
  }

  const articles = await fetchArticles(supabase, { slug });
  const candidates = articles
    .filter(
      (article) =>
        (options.force ||
          slug ||
          countVideoStills(article.content || "") < options.count) &&
        Boolean(getArticleVideo(article).videoId),
    )
    .slice(0, limit || undefined);
  let processed = 0;

  for (const article of candidates) {
    const didProcess = await processArticle(supabase, article, options);

    if (didProcess) {
      processed += 1;
    }
  }

  console.log(`\nScanned: ${articles.length}`);
  console.log(`Candidates: ${candidates.length}`);
  console.log(`Processed: ${processed}`);
}

main().catch((error) => {
  const cause = error?.cause?.message || error?.cause?.code || "";
  console.error(
    `Video still import failed: ${error.message}${cause ? `; cause: ${cause}` : ""}`,
  );
  process.exit(1);
});
