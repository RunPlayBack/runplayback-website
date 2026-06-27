export const affiliateDisclosureText =
  "Some links in this article may be affiliate links. If you buy through them, RunPlayBack may earn a small commission at no extra cost to you.";

const excludedHosts = new Set([
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "threads.net",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "youtu.be",
  "youtube.com",
]);

function getHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function isAffiliateEligibleUrl(url: string) {
  const host = getHostname(url);

  if (!host) {
    return false;
  }

  if (host.endsWith("runplayback.com")) {
    return false;
  }

  for (const excludedHost of excludedHosts) {
    if (host === excludedHost || host.endsWith(`.${excludedHost}`)) {
      return false;
    }
  }

  return true;
}

export function getAffiliateDisclosureText() {
  return affiliateDisclosureText;
}

export function getAffiliateLinkCandidates(label: string) {
  const normalized = normalizeWhitespace(
    label
      .replaceAll("**", "")
      .replace(/^["“]|["”]$/g, "")
      .replace(/[-–—:;|]+$/g, "")
      .trim(),
  );

  if (!normalized) {
    return [];
  }

  const candidates = new Set<string>();
  candidates.add(normalized);

  const parts = normalized
    .split(/\s+(?:x|vs\.?|versus)\s+/i)
    .flatMap((part) => part.split(/\s*[|:;–—-]\s*/g));

  for (const part of parts) {
    const cleanedPart = normalizeWhitespace(
      part
        .replace(/\b(full\s+)?review\b$/i, "")
        .replace(/\b(video|youtube|article|link|links)\b$/i, "")
        .replace(/\b(the|a|an)\b$/i, "")
        .trim(),
    );

    if (cleanedPart.length >= 3) {
      candidates.add(cleanedPart);
    }
  }

  return Array.from(candidates).sort((a, b) => b.length - a.length);
}

function buildCandidatePattern(candidate: string) {
  const words = candidate
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => escapeRegExp(word));

  if (!words.length) {
    return null;
  }

  const pattern = words.join("[\\s\\-–—]+");

  return new RegExp(`(^|[^\\w])(${pattern})(?=$|[^\\w])`, "i");
}

function linkifyPlainTextSegment(
  segment: string,
  links: Array<{ label: string; url: string }>,
  usedUrls: Set<string>,
) {
  let output = segment;

  for (const link of links) {
    if (usedUrls.has(link.url)) {
      continue;
    }

    const candidates = getAffiliateLinkCandidates(link.label);

    for (const candidate of candidates) {
      const pattern = buildCandidatePattern(candidate);

      if (!pattern) {
        continue;
      }

      const match = output.match(pattern);

      if (!match || match.index === undefined) {
        continue;
      }

      const [fullMatch, prefix = "", matchedText = ""] = match;
      const replacement = `${prefix}[${matchedText}](${link.url})`;
      const matchedIndex = match.index;

      output =
        output.slice(0, matchedIndex) +
        replacement +
        output.slice(matchedIndex + fullMatch.length);
      usedUrls.add(link.url);
      break;
    }
  }

  return output;
}

function linkifyLine(
  line: string,
  links: Array<{ label: string; url: string }>,
  usedUrls: Set<string>,
) {
  const trimmed = line.trim();

  if (
    !trimmed ||
    /^#{1,6}\s+/.test(trimmed) ||
    /^[-*•]\s+/.test(trimmed) ||
    /^\d+\.\s+/.test(trimmed) ||
    /^>\s+/.test(trimmed) ||
    /^!\[[^\]]*]\(https?:\/\/[^)]+\)$/i.test(trimmed) ||
    /^https?:\/\/\S+$/i.test(trimmed)
  ) {
    return line;
  }

  const markdownLinkPattern = /\[[^\]]+]\([^)]+\)/g;
  let lastIndex = 0;
  let output = "";
  let match: RegExpExecArray | null;

  while ((match = markdownLinkPattern.exec(line)) !== null) {
    output += linkifyPlainTextSegment(
      line.slice(lastIndex, match.index),
      links,
      usedUrls,
    );
    output += match[0];
    lastIndex = match.index + match[0].length;
  }

  output += linkifyPlainTextSegment(line.slice(lastIndex), links, usedUrls);
  return output;
}

export function injectAffiliateLinksIntoContent(
  content: string,
  links: Array<{ label: string; url: string }>,
) {
  const affiliateLinks = links.filter((link) => isAffiliateEligibleUrl(link.url));

  if (!affiliateLinks.length) {
    return content;
  }

  const lines = content.split("\n");
  const usedUrls = new Set<string>();
  const output: string[] = [];
  let inLinksSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^#{1,6}\s+links$/i.test(trimmed)) {
      inLinksSection = true;
      output.push(line);
      continue;
    }

    if (inLinksSection) {
      output.push(line);
      continue;
    }

    output.push(linkifyLine(line, affiliateLinks, usedUrls));
  }

  return output.join("\n");
}
