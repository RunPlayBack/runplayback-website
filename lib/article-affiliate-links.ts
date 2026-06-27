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

function stripTrailingAffiliateNoise(value: string) {
  return value
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+(?:use\s+)?promo\s+code\b.*$/i, "")
    .trim();
}

const merchantSuffixes = [
  "accessories",
  "batteries",
  "battery",
  "bikes",
  "bike",
  "controls",
  "control",
  "cycles",
  "cycle",
  "display",
  "ebikes",
  "ebike",
  "gear",
  "lithium",
  "motor",
  "motors",
  "parts",
  "power",
  "shop",
  "store",
  "tech",
];

function humanizeHostname(url: string) {
  const host = getHostname(url);

  if (!host) {
    return "";
  }

  let root = host.split(".").slice(0, -1).join(" ") || host;

  for (const suffix of merchantSuffixes) {
    root = root.replace(
      new RegExp(`([a-z0-9])(${suffix})(?=$|\\s)`, "gi"),
      "$1 $2",
    );
  }

  return normalizeWhitespace(
    root
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase()),
  );
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

export function getAffiliateLinkCandidates(label: string, url = "") {
  const normalized = normalizeWhitespace(
    stripTrailingAffiliateNoise(
      label
        .replaceAll("**", "")
        .replace(/[“"][^”"]+[”"]/g, " ")
        .replace(/^["“]|["”]$/g, "")
        .replace(/[-–—:;|]+$/g, "")
        .trim(),
    ),
  );

  if (!normalized) {
    return [];
  }

  const candidates = new Set<string>();
  const merchantName = humanizeHostname(url);
  const addCandidate = (value: string) => {
    const cleaned = normalizeWhitespace(value);

    if (cleaned) {
      candidates.add(cleaned);
    }
  };

  addCandidate(normalized);

  const parts = normalized
    .split(/\s+(?:x|vs\.?|versus)\s+/i)
    .flatMap((part) => part.split(/\s*[|:;–—-]\s*/g));

  for (const part of parts) {
    const cleanedPart = normalizeWhitespace(
      part
        .replace(/[“"][^”"]+[”"]/g, " ")
        .replace(/\s+\b(?:on|for)\s+the\s+[a-z0-9.+\-_ ]+$/i, "")
        .replace(/\s+\b(?:on|for)\s+[a-z0-9.+\-_ ]+$/i, "")
        .replace(/\b(full\s+)?review\b$/i, "")
        .replace(/\b(video|youtube|article|link|links)\b$/i, "")
        .replace(/\b(the|a|an)\b$/i, "")
        .trim(),
    );

    if (cleanedPart.length >= 3) {
      addCandidate(cleanedPart);

      const words = cleanedPart.split(/\s+/).filter(Boolean);

      if (words.length >= 2) {
        addCandidate(words.slice(1).join(" "));
      }

      if (words.length >= 3) {
        addCandidate(words.slice(0, -1).join(" "));
      }

      const voltageWordIndex = words.findIndex((word) => /^\d+\s*v$/i.test(word) || /^\d+v$/i.test(word));
      const batteryWordIndex = words.findIndex((word) => /^batter(?:y|ies)$/i.test(word));

      if (voltageWordIndex >= 0 && batteryWordIndex > voltageWordIndex) {
        const voltageBatteryPhrase = words
          .slice(voltageWordIndex, batteryWordIndex + 1)
          .join(" ");

        addCandidate(voltageBatteryPhrase);

        if (merchantName) {
          addCandidate(`${merchantName} ${voltageBatteryPhrase}`);
          addCandidate(`${voltageBatteryPhrase} from ${merchantName}`);
        }
      }
    }
  }

  if (merchantName) {
    const currentCandidates = Array.from(candidates);
    const merchantWords = merchantName.split(/\s+/).filter(Boolean);
    const merchantFirstWord = merchantWords[0]?.toLowerCase() || "";

    for (const candidate of currentCandidates) {
      if (
        !candidate ||
        candidate.toLowerCase().includes(merchantName.toLowerCase())
      ) {
        continue;
      }

      addCandidate(`${candidate} from ${merchantName}`);
      addCandidate(`${candidate} at ${merchantName}`);

      const candidateWords = candidate.split(/\s+/).filter(Boolean);

      if (
        merchantFirstWord &&
        candidateWords.length >= 2 &&
        candidateWords[0]?.toLowerCase() === merchantFirstWord
      ) {
        const withoutMerchant = candidateWords.slice(1).join(" ");

        if (withoutMerchant) {
          addCandidate(withoutMerchant);
          addCandidate(`${withoutMerchant} from ${merchantName}`);
          addCandidate(`${withoutMerchant} at ${merchantName}`);
        }
      }
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
  let bestMatch:
    | {
        fullMatch: string;
        index: number;
        link: { label: string; url: string };
        matchedText: string;
        prefix: string;
      }
    | undefined;

  for (const link of links) {
    if (usedUrls.has(link.url)) {
      continue;
    }

    const candidates = getAffiliateLinkCandidates(link.label, link.url);

    for (const candidate of candidates) {
      const pattern = buildCandidatePattern(candidate);

      if (!pattern) {
        continue;
      }

      const match = segment.match(pattern);

      if (!match || match.index === undefined) {
        continue;
      }

      const [fullMatch, prefix = "", matchedText = ""] = match;

      if (
        !bestMatch ||
        matchedText.length > bestMatch.matchedText.length ||
        (matchedText.length === bestMatch.matchedText.length &&
          match.index < bestMatch.index)
      ) {
        bestMatch = {
          fullMatch,
          index: match.index,
          link,
          matchedText,
          prefix,
        };
      }
    }
  }

  if (!bestMatch) {
    return segment;
  }

  const replacement = `${bestMatch.prefix}[${bestMatch.matchedText}](${bestMatch.link.url})`;

  usedUrls.add(bestMatch.link.url);

  return (
    segment.slice(0, bestMatch.index) +
    replacement +
    segment.slice(bestMatch.index + bestMatch.fullMatch.length)
  );
}

function buildFallbackAffiliateLine(
  links: Array<{ label: string; url: string }>,
  usedUrls: Set<string>,
) {
  const remainingLinks = links.filter((link) => !usedUrls.has(link.url));

  if (!remainingLinks.length) {
    return "";
  }

  const fallbackLinks = remainingLinks.slice(0, 2);
  const linkedLabels = fallbackLinks
    .map((link) => `[${link.label}](${link.url})`)
    .join(" and ");

  return `Read more: ${linkedLabels}`;
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
  let insertedInlineAffiliateLink = false;

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

    const linkedLine = linkifyLine(line, affiliateLinks, usedUrls);

    if (linkedLine !== line && !insertedInlineAffiliateLink) {
      insertedInlineAffiliateLink = true;
    }

    output.push(linkedLine);
  }

  if (!insertedInlineAffiliateLink) {
    const fallbackLine = buildFallbackAffiliateLine(affiliateLinks, usedUrls);

    if (fallbackLine) {
      const insertionIndex = output.findIndex((line) => {
        const trimmed = line.trim();

        return (
          trimmed &&
          !/^#{1,6}\s+/.test(trimmed) &&
          !/^[-*•]\s+/.test(trimmed) &&
          !/^\d+\.\s+/.test(trimmed) &&
          !/^!\[[^\]]*]\(https?:\/\/[^)]+\)$/i.test(trimmed)
        );
      });

      if (insertionIndex === -1) {
        output.push("");
        output.push(fallbackLine);
      } else {
        output.splice(insertionIndex + 1, 0, "", fallbackLine);
      }
    }
  }

  return output.join("\n");
}
