type VideoSource = {
  title: string;
  description: string | null;
  captions_text: string | null;
  video_url: string;
  thumbnail_url: string | null;
};

export type GeneratedArticleDraft = {
  title: string;
  slug: string;
  seo_title: string;
  seo_description: string;
  content: string;
};

const runPlayBackStyleGuide = `# RunPlayBack Article Style Guide

Purpose:
Convert YouTube video transcripts into SEO-friendly written articles that feel like professionally written reviews.
The goal is not to create a transcript summary.
The goal is to create an article similar to Engadget, Electrek, or The Verge while preserving the authentic RunPlayBack voice.

Writing style:
- Write in first person from the RunPlayBack host's point of view, as if "I" personally installed, tested, rode, and reviewed the product.
- Use "I" for personal observations and "we" only when talking about RunPlayBack as a channel/community.
- Never refer to the host as "he", "him", "the reviewer", "the host", or "RunPlayBack" when describing the ride, install, testing, opinions, or takeaways.
- Write like a human rider sharing real-world experience.
- Sound conversational and approachable.
- Use first-person observations throughout when supported by the video.
- Explain how features actually affect the riding experience.
- Prioritize ride impressions over specifications.
- Use short paragraphs.
- Use subheadings frequently.
- Focus on what matters to real riders.

Avoid:
- Marketing copy.
- Product brochure language.
- Framing the article as a description or recap of a video.
- Phrases like "this video", "in the video", "the video notes", "the reviewer", or "the rider in the video".
- Repeating specifications without context.
- "Let's recap the specs."
- Giant bullet lists.
- Overused technical jargon.
- Inventing information not stated in the video.
- Numbered section headings such as "## 1. Introduction".

Preferred article flow:
- Title that feels like a real review article.
- Introduction that begins with an opinion, observation, or interesting hook.
- First impressions focused on size, appearance, build quality, and immediate reactions.
- Ride experience as the largest section, covering acceleration, comfort, handling, braking, suspension, and power delivery.
- Features that matter, introduced naturally with why they matter.
- Real-world use cases for commuting, recreation, cargo, light off-road riding, or mobility where supported.
- What We Like as a short bullet section.
- Things To Consider as a short bullet section.
- Final Thoughts covering who should buy it, who should skip it, and the overall impression.
- Links section.

SEO:
- Include the product name in the title and introduction.
- Use natural keyword repetition.
- Use descriptive subheadings.
- Target 1,200-2,500 words when there is enough transcript/source material.

Voice:
The article should feel like a rider talking to another rider: honest, practical, and experience-driven.
It should not feel AI generated, like a press release, like a spec sheet, or like an Amazon listing.`;

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

  if (cause && typeof cause === "object") {
    const code =
      "code" in cause && typeof cause.code === "string" ? ` (${cause.code})` : "";
    const message =
      "message" in cause && typeof cause.message === "string"
        ? cause.message
        : JSON.stringify(cause);
    return `${error.message}; cause: ${message}${code}`;
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
      if (!contentItem || typeof contentItem !== "object") {
        continue;
      }

      if (
        "text" in contentItem &&
        typeof (contentItem as { text?: unknown }).text === "string"
      ) {
        textParts.push((contentItem as { text: string }).text);
      }
    }
  }

  return textParts.join("\n").trim();
}

export async function generateArticleDraftFromVideo(
  video: VideoSource,
): Promise<GeneratedArticleDraft> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5.2";

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing from .env.local.");
  }

  const sourceText = [
    `Video title: ${video.title}`,
    `Video URL: ${video.video_url}`,
    `Thumbnail URL: ${video.thumbnail_url || ""}`,
    "YouTube description:",
    video.description || "No description imported yet.",
    "Captions:",
    video.captions_text || "No captions imported yet.",
  ].join("\n\n");

  const prompt = `Create a polished draft article for RunPlayBack using the source material below.

Return ONLY valid JSON with these exact keys:
{
  "title": "string",
  "slug": "string",
  "seo_title": "string",
  "seo_description": "string",
  "content": "string"
}

Follow this style guide:
${runPlayBackStyleGuide}

Important:
- Write a finished article, not an outline.
- Write from my first-person perspective. The article should sound like I personally tested the product, not like someone else is reporting on me.
- Do not write "he", "him", "the reviewer", "the host", or "RunPlayBack" when referring to my ride impressions, install experience, testing, or opinions.
- Do not frame the article as a video recap. Avoid phrases like "this video", "in the video", "the video shows", "the video notes", or "from the video". Write it as a standalone article from my hands-on experience.
- Avoid transcript-summary phrasing like "I mention", "I share", "I call out", "I note", or "I say" when describing what happened. Write naturally instead: "I noticed", "the result was", "for comparison", "I’d recommend", or just state the observation directly.
- Do not use numbered headings like "## 1. Introduction".
- Do not begin with specifications.
- Start with a strong editorial hook that explains why this product is interesting or different.
- Make the ride experience and practical usefulness the center of the article.
- Use specifications only when they support the real-world experience.
- Prefer section headings like "First Impressions", "Comfort Is the Real Selling Point", "Power and Performance", "Real-World Use Cases", "What We Like", "Things To Consider", and "Final Thoughts".
- Do not invent exact specs if they are not in the source.
- If captions are missing, write a useful draft based on the title and description and clearly keep it general.
- Include a "Links" section that preserves any URLs found in the description.
- Format product and affiliate links as Markdown links with only the product/link name visible, like [Zondoo ZO01 Plus](https://amzn.to/example). Do not show raw URLs after the link name.
- Do not include a "Video" section in the article body. The website automatically embeds the YouTube video below the article.
- Do not include the current YouTube video URL in the article body or Links section.
- The slug should be lowercase, URL-safe, and concise.
- The content field should contain markdown-formatted article body text.
- Do not use bold markdown for phrase emphasis. Avoid wrapping words or phrases in **double asterisks**.

Source material:
${sourceText}`;

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
      `Could not reach the OpenAI API. Check your internet connection, OPENAI_API_KEY, and OPENAI_MODEL. Details: ${
        getFetchErrorDetails(error)
      }`,
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI draft generation failed: ${errorText}`);
  }

  const data = await response.json();
  const outputText = extractResponseText(data);

  if (!outputText) {
    throw new Error("OpenAI response did not include any text output.");
  }

  const parsed = JSON.parse(extractJson(outputText)) as Partial<GeneratedArticleDraft>;
  const title = parsed.title || video.title;

  return {
    title,
    slug: parsed.slug ? slugify(parsed.slug) : slugify(title),
    seo_title: parsed.seo_title || title,
    seo_description:
      parsed.seo_description ||
      `RunPlayBack article companion for ${video.title}.`,
    content:
      parsed.content ||
      `Introduction\n\nDraft article for ${video.title}.\n\nVideo\n\n${video.video_url}`,
  };
}
