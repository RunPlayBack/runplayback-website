// @ts-nocheck
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const defaultModel = "gpt-5.2";

export function slugifyFilePart(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}

export function normalizeFilename(value = "") {
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

export function imageFileToContent(filePath, label) {
  if (!filePath || !existsSync(filePath)) {
    return [];
  }

  const extension = path.extname(filePath).slice(1).toLowerCase();
  const mimeType =
    extension === "png"
      ? "image/png"
      : extension === "webp"
        ? "image/webp"
        : extension === "gif"
          ? "image/gif"
          : "image/jpeg";
  const base64 = readFileSync(filePath).toString("base64");

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

export function imageUrlToContent(imageUrl, label) {
  if (!imageUrl) {
    return [];
  }

  return [
    {
      type: "input_text",
      text: `${label}:`,
    },
    {
      type: "input_image",
      image_url: imageUrl,
    },
  ];
}

export function extractResponseText(response) {
  if (typeof response?.output_text === "string") {
    return response.output_text;
  }

  if (!Array.isArray(response?.output)) {
    return "";
  }

  return response.output
    .flatMap((item) => item?.content || [])
    .map((item) => item?.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function cleanText(value = "") {
  return String(value)
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function shortenText(value = "", maxLength = 1200) {
  const clean = cleanText(value);

  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, maxLength).trim()}…`;
}

function parseStillIndex(value, fallbackIndex) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallbackIndex;
}

function buildManifestEntryArray(entry, count) {
  const filenames = Array.from({ length: count }, () => "");

  if (!entry) {
    return filenames;
  }

  if (Array.isArray(entry)) {
    entry.forEach((value, index) => {
      filenames[index] = normalizeFilename(value);
    });
    return filenames;
  }

  if (typeof entry === "string") {
    filenames[0] = normalizeFilename(entry);
    return filenames;
  }

  if (typeof entry === "object") {
    for (const [key, value] of Object.entries(entry)) {
      const index = parseStillIndex(key.replace(/^still-/, ""), -1);

      if (index >= 0 && index < count) {
        filenames[index] = normalizeFilename(value);
      }
    }
  }

  return filenames;
}

function uniqueFilename(value, seen, fallbackBase, index) {
  const normalized = normalizeFilename(value);
  const base = slugifyFilePart(fallbackBase || "video-still") || "video-still";
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
}

function normalizeFilenames(values, fallbackBase) {
  const seen = new Set();

  return values.map((value, index) =>
    uniqueFilename(value, seen, fallbackBase, index),
  );
}

function parseFilenameResponse(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const candidate = jsonMatch ? jsonMatch[0] : text.trim();
  const parsed = JSON.parse(candidate);

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (Array.isArray(parsed?.filenames)) {
    return parsed.filenames;
  }

  if (parsed && typeof parsed === "object") {
    return Object.entries(parsed)
      .map(([key, value]) => ({
        filename: value,
        index: Number(key),
      }))
      .filter((entry) => Number.isFinite(entry.index));
  }

  return [];
}

function buildStillPrompt(article, video, stills) {
  const articleText = shortenText(
    [
      `Article title: ${article?.title || ""}`,
      `Article slug: ${article?.slug || ""}`,
      `Video title: ${video?.title || ""}`,
      `Video URL: ${video?.video_url || ""}`,
      `Video description: ${shortenText(video?.description || "", 1000)}`,
      `Article context: ${shortenText(article?.content || "", 1600)}`,
    ].join("\n"),
    4000,
  );

  const stillSummary = stills
    .map((still) => {
      const timestamp = still.timestamp ? ` at ${still.timestamp}` : "";
      const context = still.context ? ` ${shortenText(still.context, 220)}` : "";
      return `- Still ${still.index + 1}${timestamp}${context}`;
    })
    .join("\n");

  return `
You are naming article still image files for RunPlayBack.

Use these rules:
- Return JSON only.
- One filename per still, in the same order as the stills provided.
- Filenames must be lowercase and hyphen-separated.
- Keep them short, clear, and evergreen.
- Describe what is visible in the image itself.
- Include the product name only when it naturally helps identify the image.
- Do not keyword-stuff.
- Do not use words like review, video, article, RunPlayBack, ebike, best, or 2026 unless they are genuinely needed to describe the image.
- If two filenames would be the same, make them distinct by using a short numeric suffix like -2 or -3.
- Prefer filenames such as controller-heatsink.jpg, dashboard-screen.jpg, side-profile.jpg, rear-drive-chain.jpg.

Return exactly this shape:
{
  "filenames": [
    { "index": 0, "filename": "controller-heatsink.jpg", "reason": "short reason" }
  ]
}

${articleText}

Stills:
${stillSummary}
`.trim();
}

export function resolveStillFilenameArray({
  articleSlug,
  stillCount,
  manualEntry,
  aiFilenames = [],
}: {
  articleSlug: string;
  stillCount: number;
  manualEntry?: unknown;
  aiFilenames?: string[];
}) {
  const base = slugifyFilePart(articleSlug || "video-still") || "video-still";
  const manualFilenames = buildManifestEntryArray(manualEntry, stillCount);
  const merged = Array.from({ length: stillCount }, (_, index) => {
    const manual = normalizeFilename(manualFilenames[index]);
    const ai = normalizeFilename(aiFilenames[index]);
    const fallback = `${base}-${String(index + 1).padStart(2, "0")}.jpg`;

    return manual || ai || fallback;
  });

  return normalizeFilenames(merged, base);
}

export async function suggestStillFilenames({
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_FILENAME_MODEL || process.env.OPENAI_MODEL || defaultModel,
  article,
  video,
  stills,
}) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for AI filename suggestions.");
  }

  const input = [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: buildStillPrompt(article, video, stills),
        },
        ...stills.flatMap((still) => {
          const label = `Still ${still.index + 1}${still.timestamp ? ` (${still.timestamp})` : ""}`;

          if (still.filePath) {
            return imageFileToContent(still.filePath, label);
          }

          if (still.imageUrl) {
            return imageUrlToContent(still.imageUrl, label);
          }

          return [
            {
              type: "input_text",
              text: `${label}: no image was provided.`,
            },
          ];
        }),
      ],
    },
  ];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input,
      text: {
        format: {
          type: "json_object",
        },
      },
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error?.message || "OpenAI filename suggestion request failed.",
    );
  }

  const text = extractResponseText(result);
  const parsed = parseFilenameResponse(text);
  const filenames = Array.from({ length: stills.length }, () => "");

  for (const entry of parsed) {
    const index = Number(entry?.index);

    if (!Number.isFinite(index) || index < 0 || index >= stills.length) {
      continue;
    }

    const value = entry?.filename || entry?.name || "";

    if (value) {
      filenames[index] = normalizeFilename(value);
    }
  }

  return {
    filenames: resolveStillFilenameArray({
      articleSlug: article?.slug || article?.title || "video-still",
      stillCount: stills.length,
      aiFilenames: filenames,
    }),
    rawText: text,
  };
}
