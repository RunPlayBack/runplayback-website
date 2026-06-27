import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  resolveStillFilenameArray,
  suggestStillFilenames,
} from "./still-filename-ai.mjs";

const defaultBucket = "article-stills";

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

function loadJsonManifest(manifestPath) {
  if (!manifestPath) {
    return null;
  }

  const resolved = resolve(process.cwd(), manifestPath);

  if (!existsSync(resolved)) {
    throw new Error(`Manifest file not found: ${resolved}`);
  }

  return JSON.parse(readFileSync(resolved, "utf8"));
}

function getMarkdownImages(content = "") {
  return [...content.matchAll(/^!\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/gm)].map(
    (match) => ({
      alt: match[1],
      markdown: match[0],
      url: match[2],
    }),
  );
}

function isVideoStill(image, bucket) {
  return (
    image.alt.toLowerCase().startsWith("video still") ||
    image.url.includes(`/storage/v1/object/public/${bucket}/`) ||
    image.url.includes("/article-stills/")
  );
}

function getObjectPathFromPublicUrl(url, bucket) {
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

function getManifestFilename(manifest, articleSlug, index) {
  if (!manifest || !articleSlug) {
    return "";
  }

  const entry = manifest[articleSlug];

  if (!entry) {
    return "";
  }

  if (Array.isArray(entry)) {
    return normalizeFilename(entry[index] || "");
  }

  if (typeof entry === "string") {
    return normalizeFilename(index === 0 ? entry : "");
  }

  if (typeof entry === "object") {
    const keys = [String(index + 1), String(index), `still-${index + 1}`];

    for (const key of keys) {
      if (entry[key]) {
        return normalizeFilename(entry[key]);
      }
    }
  }

  return "";
}

function getRenamedObjectPath(article, index, options) {
  const manifestFilename = getManifestFilename(
    options.manifest,
    article.slug,
    index,
  );

  if (manifestFilename) {
    const safeSlug = slugifyFilePart(article.slug || article.title || "runplayback-review");
    return `${safeSlug}/${manifestFilename}`;
  }

  const safeSlug = slugifyFilePart(article.slug || article.title || "runplayback-review");
  const safeIndex = String(index + 1).padStart(2, "0");

  return `${safeSlug}/${safeSlug}-${safeIndex}.jpg`;
}

async function fetchArticles(supabase, slug) {
  let query = supabase
    .from("articles")
    .select(
      "id,title,slug,content,status,videos(youtube_video_id,video_url,title,description)",
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

function replaceAll(value, replacements) {
  let nextValue = value;

  for (const [from, to] of replacements) {
    nextValue = nextValue.split(from).join(to);
  }

  return nextValue;
}

async function renameArticleStills(supabase, article, options) {
  const stillImages = getMarkdownImages(article.content || "").filter((image) =>
    isVideoStill(image, options.bucket),
  );

  if (!stillImages.length) {
    return { renamed: 0, skipped: 0 };
  }

  let aiFilenames = [];

  if (options.aiFilenames) {
    try {
      const video = Array.isArray(article.videos) ? article.videos[0] : article.videos;
      const suggestion = await suggestStillFilenames({
        article,
        video: {
          description: video?.description || "",
          title: video?.title || article.title,
          video_url: video?.video_url || "",
        },
        stills: stillImages.map((image, index) => ({
          index,
          imageUrl: image.url,
          timestamp: "",
        })),
      });
      aiFilenames = suggestion.filenames;

      if (!options.quiet) {
        console.log(`AI filename suggestions: ${aiFilenames.join(", ")}`);
      }
    } catch (error) {
      console.log(`AI filename suggestion failed: ${error.message}`);
    }
  }

  const resolvedFilenames = resolveStillFilenameArray({
    articleSlug: article.slug,
    stillCount: stillImages.length,
    manualEntry: options.manifest?.[article.slug],
    aiFilenames,
  });
  const articleOptions = {
    ...options,
    manifest: {
      ...(options.manifest || {}),
      [article.slug]: resolvedFilenames,
    },
  };
  const replacements = [];
  let renamed = 0;
  let skipped = 0;

  for (const [index, image] of stillImages.entries()) {
    const oldObjectPath = getObjectPathFromPublicUrl(image.url, options.bucket);
    const newObjectPath = getRenamedObjectPath(article, index, articleOptions);

    if (!oldObjectPath) {
      skipped += 1;
      if (!options.quiet) {
        console.log(`Skipped non-storage still URL: ${image.url}`);
      }
      continue;
    }

    const { data: publicData } = supabase.storage
      .from(options.bucket)
      .getPublicUrl(newObjectPath);
    const newUrl = publicData.publicUrl;

    if (oldObjectPath === newObjectPath && image.url === newUrl) {
      skipped += 1;
      continue;
    }

    replacements.push([image.url, newUrl]);
    renamed += 1;

    if (!options.quiet) {
      console.log(`- ${oldObjectPath}`);
      console.log(`+ ${newObjectPath}`);
    }

    if (!options.apply) {
      continue;
    }

    const { data: oldFile, error: downloadError } = await supabase.storage
      .from(options.bucket)
      .download(oldObjectPath);

    if (downloadError) {
      throw downloadError;
    }

    const bytes = await oldFile.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from(options.bucket)
      .upload(newObjectPath, bytes, {
        contentType: oldFile.type || "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }
  }

  if (options.apply && replacements.length) {
    const nextContent = replaceAll(article.content || "", replacements);
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
  }

  return { renamed, skipped };
}

async function main() {
  loadEnv();

  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const options = {
    apply: hasFlag("apply"),
    bucket: getArg("bucket", process.env.SUPABASE_ARTICLE_UPLOAD_BUCKET || defaultBucket),
    aiFilenames: hasFlag("ai-filenames"),
    quiet: hasFlag("quiet") || hasFlag("summary-only"),
    manifest: loadJsonManifest(getArg("manifest", "")),
    slug: getArg("slug", ""),
  };

  console.log(
    `${options.apply ? "Renaming" : "Dry run: checking"} article still filenames...`,
  );

  if (options.slug) {
    console.log(`Only scanning slug: ${options.slug}`);
  }

  const articles = await fetchArticles(supabase, options.slug);
  let scanned = 0;
  let renamed = 0;
  let skipped = 0;

  for (const article of articles) {
    scanned += 1;
    const result = await renameArticleStills(supabase, article, options);

    if (!options.quiet && (result.renamed || result.skipped)) {
      console.log(`\n${article.title}`);
      console.log(`Slug: ${article.slug}`);
      console.log(`Renamed: ${result.renamed}, skipped: ${result.skipped}`);
    }

    renamed += result.renamed;
    skipped += result.skipped;
  }

  console.log("\nDone.");
  console.log(`Scanned: ${scanned}`);
  console.log(`Renamed: ${renamed}`);
  console.log(`Skipped: ${skipped}`);

  if (!options.apply) {
    console.log("\nRun again with --apply to update Supabase.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Still filename rename failed: ${error.message}`);
    process.exit(1);
  });
}

export {
  fetchArticles,
  getMarkdownImages,
  getObjectPathFromPublicUrl,
  getRenamedObjectPath,
  isVideoStill,
  normalizeFilename,
  renameArticleStills,
  resolveStillFilenameArray,
  slugifyFilePart,
  suggestStillFilenames,
};
