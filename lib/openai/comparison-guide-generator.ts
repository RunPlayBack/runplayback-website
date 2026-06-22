export type BuyingGuideArticleType = "best_of" | "versus";

export type BuyingGuideSourceImage = {
  altText: string;
  placementKey: string;
  sourceArticleId: string;
  url: string;
};

export type BuyingGuideSourceArticle = {
  categoryLabel: string;
  categorySlug: string;
  content: string;
  fullReviewUrl: string;
  id: string;
  notes: string;
  order: number;
  seoDescription: string;
  title: string;
  videoUrl: string;
  youtubeVideoId: string;
};

export type GeneratedBuyingGuideDraft = {
  content: string;
  seo_description: string;
  seo_title: string;
  slug: string;
  title: string;
};

const runPlayBackStyleGuide = `RunPlayBack writing style:
- Friendly, casual, and practical.
- Real-world testing based.
- Honest and useful.
- No corporate jargon.
- No fake hype.
- No invented specs, claims, range numbers, or ride impressions.
- Make it clear these recommendations come from RunPlayBack hands-on reviews.
- Write these guides from the RunPlayBack perspective using "we" and "our" naturally.
- Keep paragraphs short and easy to scan.
- Write like a buyer is deciding what to spend money on, not like a manufacturer brochure.
- Put source review links only in the Related Reviews section.`;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function extractJson(text: string) {
  const trimmed = text.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  return match ? match[0] : trimmed;
}

function getFetchErrorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return "network request failed";
  }

  const cause = "cause" in error ? error.cause : undefined;

  if (cause instanceof Error) {
    const code =
      "code" in cause && typeof cause.code === "string" ? ` (${cause.code})` : "";
    return `${error.message}; cause: ${cause.message}${code}`;
  }

  return error.message;
}

function extractResponseText(data: unknown) {
  if (!data || typeof data !== "object") {
    return "";
  }

  if (
    "output_text" in data &&
    typeof (data as { output_text?: unknown }).output_text === "string"
  ) {
    return (data as { output_text: string }).output_text;
  }

  const output = "output" in data ? (data as { output?: unknown }).output : undefined;

  if (!Array.isArray(output)) {
    return "";
  }

  const textParts: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const content =
      "content" in item ? (item as { content?: unknown }).content : undefined;

    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      if (
        contentItem &&
        typeof contentItem === "object" &&
        "text" in contentItem &&
        typeof (contentItem as { text?: unknown }).text === "string"
      ) {
        textParts.push((contentItem as { text: string }).text);
      }
    }
  }

  return textParts.join("\n").trim();
}

function trimSourceContent(content: string) {
  return content
    .replace(/^!\[[^\]]*]\(https?:\/\/[^)]+\)\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 7000);
}

function getArticleTypeInstructions(articleType: BuyingGuideArticleType) {
  if (articleType === "versus") {
    return `Create a Versus comparison article that answers the search intent: "X vs Y — which one should I buy?"

Strong title examples:
- Jasion Patrol vs SASIKEIBIKE Y7: Which Fat Tire eBike Makes More Sense?
- Yozma IN 10 Pro Battles Valtinsu EM5 Pro: We Tested Both Bikes
- The High Powered Pedal eBike Results Are In: EKX21 Max vs Jasion Patrol
- Valtinsu EM5 and Valtinsu EM5 Pro Hands-On Comparison

Required structure:
- Hook: Start with the buying decision, not background filler. Do not use a heading for the hook.
- First Impressions
- Power & Acceleration
- Comfort
- Handling
- Features
- Winner by Category
- Who Should Buy [Product A]
- Who Should Buy [Product B]
- Final Verdict
- Related Reviews`;
  }

  return `Create a Best Of buying guide article where every selected product earns a clear reason to exist.

Strong title examples:
- Best Mini Electric Bikes of Summer 2026
- Best Electric Dirt Bikes for 2026
- We Tested Electric Trikes: Here's What We Recommend
- Best Mini Electric Bikes We've Tested: Our Top Picks Right Now

Required structure:
- Hook: Explain why this category is tricky and why there is not one perfect product for everyone. Do not use a heading for the hook.
- Award sections like "Best Overall", "Most Fun", "Best Value", "Best for Comfort", "Best for Pure Power", or other useful buyer-focused awards based on the selected reviews.
- Each product section should explain why that product won its award.
- Each product section should include a "Why We Like It" subsection with short bullets.
- Buying Advice
- Final Thoughts
- Related Reviews`;
}

function buildSourceMaterial(
  sources: BuyingGuideSourceArticle[],
  images: BuyingGuideSourceImage[],
) {
  return sources
    .map((source) => {
      const sourceImages = images
        .filter((image) => image.sourceArticleId === source.id)
        .map(
          (image) =>
            `- ${image.placementKey}: ${image.altText || source.title}`,
        )
        .join("\n");

      return `SOURCE_${source.order}
Article ID: ${source.id}
Title: ${source.title}
Source category: ${source.categoryLabel || source.categorySlug || "Not assigned"}
Full review URL: ${source.fullReviewUrl}
Original YouTube video: ${source.videoUrl || source.youtubeVideoId || "Not available"}
Admin note: ${source.notes || "None"}
Available image placeholders:
${sourceImages || "- No selected images"}
SEO summary:
${source.seoDescription || "No summary available."}
Article content:
${trimSourceContent(source.content)}`;
    })
    .join("\n\n---\n\n");
}

function replaceImagePlaceholders(
  content: string,
  images: BuyingGuideSourceImage[],
) {
  let nextContent = content;

  for (const image of images) {
    const markdown = `![${image.altText}](${image.url})`;
    nextContent = nextContent.replaceAll(image.placementKey, markdown);
  }

  nextContent = nextContent
    .replace(/\[\[IMAGE:[^\]]+]]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const missingImages = images.filter((image) => !nextContent.includes(image.url));

  if (!missingImages.length) {
    return nextContent;
  }

  const lines = nextContent.split("\n");
  const stopIndex = lines.findIndex((line) =>
    /^#{1,3}\s+(Related Reviews|Links)\b/i.test(line.trim()),
  );
  const insertLimit = stopIndex === -1 ? lines.length : stopIndex;
  const headingIndexes = lines
    .slice(0, insertLimit)
    .map((line, index) => ({ index, line: line.trim() }))
    .filter(({ index, line }) => {
      return (
        index > 0 &&
        /^#{2,3}\s+/.test(line) &&
        !/^#{2,3}\s+(Introduction|Related Reviews|Links)\b/i.test(line)
      );
    })
    .map(({ index }) => index);

  if (headingIndexes.length) {
    const insertions = missingImages.map((image, imageIndex) => {
      const headingIndex = headingIndexes[
        Math.min(
          headingIndexes.length - 1,
          Math.floor((imageIndex * headingIndexes.length) / missingImages.length),
        )
      ];

      return {
        index: headingIndex,
        markdown: `![${image.altText}](${image.url})`,
      };
    });

    for (const insertion of insertions.reverse()) {
      lines.splice(insertion.index, 0, insertion.markdown, "");
    }

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  const imageBlock = missingImages
    .map((image) => `![${image.altText}](${image.url})`)
    .join("\n\n");

  if (stopIndex !== -1) {
    lines.splice(stopIndex, 0, imageBlock, "");

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  return `${nextContent}\n\n${imageBlock}`;
}

export async function generateBuyingGuideDraft({
  articleType,
  categoryLabel,
  images,
  sources,
  title,
}: {
  articleType: BuyingGuideArticleType;
  categoryLabel: string;
  images: BuyingGuideSourceImage[];
  sources: BuyingGuideSourceArticle[];
  title: string;
}): Promise<GeneratedBuyingGuideDraft> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5.2";

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing from .env.local.");
  }

  const prompt = `Create a new RunPlayBack ${articleType === "best_of" ? "Best Of" : "Versus"} draft article from existing RunPlayBack review articles.

Return ONLY valid JSON with these exact keys:
{
  "title": "string",
  "slug": "string",
  "seo_title": "string",
  "seo_description": "string",
  "content": "string"
}

Requested title:
${title}

Selected category:
${categoryLabel || "Mixed / uncategorized"}

${getArticleTypeInstructions(articleType)}

Style guide:
${runPlayBackStyleGuide}

Rules:
- Save the tone as a finished article, not an outline.
- Do not publish; this is draft content.
- Make the title, SEO title, and SEO description specific, catchy, and useful.
- Do not use generic titles like "Best RunPlayBack Reviews" or "Comparison Guide".
- Title must include the actual product names or category.
- SEO title should be search-friendly and specific.
- SEO description should summarize the real buying decision in one compelling sentence.
- Do not invent specs.
- Do not invent ride impressions.
- Only use information from the selected source articles.
- If a detail is missing, leave it out or write generally.
- Use the selected category as a vocabulary guardrail.
- Do not infer product category from aggressive styling alone.
- If the selected category is Electric Bikes, describe products as electric bikes, e-bikes, fat tire e-bikes, moped-style e-bikes, or dirt-bike-inspired e-bikes when accurate. Do not call them mini dirt bikes, mini e-motos, mini enduros, mini-moto, electric dirt bikes, or Electric Dirt Bikes unless the selected category or source category explicitly says Electric Dirt Bikes or Mini Electric Dirt Bikes.
- If a bike only looks aggressive, write "dirt-bike-inspired e-bike" or "moto-styled e-bike" instead of changing the category.
- Do not add inline parenthetical links like "(Full review: ...; video: ...)" anywhere in the article body.
- Do not add bullet lines like "[Product] full review (video: YouTube)" anywhere in the article body.
- Do not add YouTube video links in the article body; related videos are embedded below the article.
- Put full review links only in the Related Reviews section.
- Use Markdown links only for the Related Reviews section.
- Do not include specs tables.
- Do not write long feature lists.
- Do not sound like manufacturer marketing copy.
- For Versus articles, clearly name winners by category when the source material supports it.
- For Best Of articles, give each selected product a buyer-focused award instead of gluing several reviews together.
- Use selected image placeholders near the relevant product sections.
- Use available image placeholders as article stills from the source reviews.
- Distribute image placeholders evenly and intentionally throughout the article body.
- Do not place image placeholders in the introduction, inside a paragraph, in Related Reviews, or below Related Reviews.
- Put each image placeholder on its own line directly before a relevant section heading or product subsection.
- Prefer using every available image placeholder when it helps the article, but never reuse one.
- Keep image placeholders on their own line.
- Do not use the same image placeholder more than once.
- Do not include raw image URLs.
- Do not use bold markdown for phrase emphasis.
- For Related Reviews, include the selected source reviews and their full review links.

Source material:
${buildSourceMaterial(sources, images)}`;

  let response: Response;

  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: prompt,
        text: {
          format: {
            type: "json_object",
          },
        },
      }),
    });
  } catch (error) {
    throw new Error(
      `Could not reach the OpenAI API. Check OPENAI_API_KEY and OPENAI_MODEL. Details: ${
        getFetchErrorDetails(error)
      }`,
    );
  }

  if (!response.ok) {
    throw new Error(`OpenAI draft generation failed: ${await response.text()}`);
  }

  const data = await response.json();
  const outputText = extractResponseText(data);

  if (!outputText) {
    throw new Error("OpenAI response did not include any text output.");
  }

  const parsed = JSON.parse(extractJson(outputText)) as Partial<GeneratedBuyingGuideDraft>;
  const resolvedTitle = parsed.title || title;

  return {
    title: resolvedTitle,
    slug: parsed.slug ? slugify(parsed.slug) : slugify(resolvedTitle),
    seo_title: parsed.seo_title || resolvedTitle,
    seo_description:
      parsed.seo_description ||
      `RunPlayBack ${articleType === "best_of" ? "buying guide" : "comparison"} based on hands-on reviews.`,
    content: replaceImagePlaceholders(
      parsed.content || `Introduction\n\nDraft article for ${resolvedTitle}.`,
      images,
    ),
  };
}
