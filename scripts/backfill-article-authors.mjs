import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

function loadEnv() {
  if (!fs.existsSync(".env.local")) {
    return;
  }

  const lines = fs.readFileSync(".env.local", "utf8").split("\n");

  for (const line of lines) {
    if (!line || line.startsWith("#")) {
      continue;
    }

    const index = line.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function requiredEnv(key) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`${key} is required in .env.local.`);
  }

  return value;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function getArgValue(name, fallback = "") {
  const exact = process.argv.find((arg) => arg.startsWith(`${name}=`));

  if (exact) {
    return exact.slice(name.length + 1);
  }

  const index = process.argv.indexOf(name);

  if (index !== -1) {
    return process.argv[index + 1] || fallback;
  }

  return fallback;
}

function getVideoIdFromThumbnail(url = "") {
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

function imageFileToContent(path, label) {
  if (!path || !fs.existsSync(path)) {
    return [];
  }

  const extension = path.split(".").pop()?.toLowerCase();
  const mimeType =
    extension === "png"
      ? "image/png"
      : extension === "webp"
        ? "image/webp"
        : "image/jpeg";
  const base64 = fs.readFileSync(path).toString("base64");

  return [
    {
      type: "input_text",
      text: `${label}:`,
    },
    {
      type: "input_image",
      image_url: `data:${mimeType};base64,${base64}`,
    },
  ];
}

function extractResponseText(response) {
  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  const chunks = [];

  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

function parseAuthor(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const author = String(parsed.author || "").trim();

      if (["RunPlayBack", "Sully"].includes(author)) {
        return author;
      }
    } catch {
      // Fall through to loose matching.
    }
  }

  if (/\bsully\b/i.test(text)) {
    return "Sully";
  }

  return "RunPlayBack";
}

async function classifyAuthorWithOpenAI(article, referenceContent) {
  const apiKey = requiredEnv("OPENAI_API_KEY");
  const model =
    process.env.OPENAI_AUTHOR_MODEL || process.env.OPENAI_MODEL || "gpt-5.2";
  const imageUrl = article.featured_image_url || article.videos?.thumbnail_url || "";

  if (!imageUrl) {
    return {
      author: "RunPlayBack",
      reason: "No thumbnail was available, so the default author was used.",
    };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Classify the author for this RunPlayBack article from its YouTube thumbnail. " +
                "Use exactly one of these authors: RunPlayBack or Sully. " +
                "Rule: if the thumbnail shows the RunPlayBack host wearing an orange helmet, choose RunPlayBack. " +
                "If it shows the guy not wearing a helmet like the Sully example, choose Sully. " +
                "If uncertain, choose RunPlayBack. Return only JSON like {\"author\":\"RunPlayBack\",\"reason\":\"short reason\"}.",
            },
            ...referenceContent,
            {
              type: "input_text",
              text: `Target article: ${article.title}`,
            },
            {
              type: "input_image",
              image_url: imageUrl,
            },
          ],
        },
      ],
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error?.message || "OpenAI author classification failed.");
  }

  const text = extractResponseText(result);

  return {
    author: parseAuthor(text),
    reason: text.replace(/\s+/g, " ").slice(0, 160),
  };
}

async function main() {
  loadEnv();

  const apply = hasFlag("--apply");
  const classifyAll = hasFlag("--all");
  const limit = Number(getArgValue("--limit", "0")) || 0;
  const supabase = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
  const runplaybackReference = getArgValue(
    "--runplayback-reference",
    "/Users/rik/Desktop/runplayback.jpg",
  );
  const sullyReference = getArgValue("--sully-reference", "/Users/rik/Desktop/sully.jpg");
  const referenceContent = [
    ...imageFileToContent(runplaybackReference, "RunPlayBack reference image"),
    ...imageFileToContent(sullyReference, "Sully reference image"),
  ];

  let query = supabase
    .from("articles")
    .select(
      "id,title,slug,featured_image_url,author_name,videos(thumbnail_url,youtube_video_id,title)",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false });

  if (!classifyAll) {
    query = query.or("author_name.is.null,author_name.eq.");
  }

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const articles = data || [];
  let updated = 0;

  console.log(
    `${apply ? "Applying" : "Dry run"} author backfill for ${articles.length} published articles...`,
  );

  for (const article of articles) {
    const video = Array.isArray(article.videos) ? article.videos[0] : article.videos;
    const featuredImageUrl =
      article.featured_image_url ||
      (video?.youtube_video_id
        ? `https://img.youtube.com/vi/${video.youtube_video_id}/hqdefault.jpg`
        : video?.thumbnail_url || "");
    const classification = await classifyAuthorWithOpenAI(
      {
        ...article,
        featured_image_url: featuredImageUrl,
        videos: video,
      },
      referenceContent,
    );

    console.log(
      `${article.title} → ${classification.author} (${classification.reason})`,
    );

    if (!apply || article.author_name === classification.author) {
      continue;
    }

    const { error: updateError } = await supabase
      .from("articles")
      .update({
        author_name: classification.author,
        updated_at: new Date().toISOString(),
      })
      .eq("id", article.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    updated += 1;
  }

  console.log(`Done. Updated ${updated} articles.`);

  if (!apply) {
    console.log("Run again with --apply to save these authors.");
  }
}

main().catch((error) => {
  console.error(`Author backfill failed: ${error.message}`);
  process.exit(1);
});
