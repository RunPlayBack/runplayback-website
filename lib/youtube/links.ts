export type ExtractedLink = {
  label: string;
  url: string;
};

const urlPattern = /https?:\/\/[^\s)\]}>"']+/g;

function cleanUrl(url: string) {
  return url.replace(/[.,;!?]+$/, "");
}

function getLabel(description: string, url: string) {
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

export function extractLinksFromDescription(description: string): ExtractedLink[] {
  const matches = description.match(urlPattern) || [];
  const seen = new Set<string>();

  return matches.flatMap((match) => {
    const url = cleanUrl(match);

    if (seen.has(url)) {
      return [];
    }

    seen.add(url);

    try {
      return [
        {
          label: getLabel(description, url),
          url,
        },
      ];
    } catch {
      return [];
    }
  });
}
