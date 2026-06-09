export function getYouTubeVideoId(input: string) {
  const value = input.trim();

  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);

    if (url.hostname.includes("youtu.be")) {
      return url.pathname.split("/").filter(Boolean)[0] || "";
    }

    if (url.hostname.includes("youtube.com")) {
      if (url.pathname.startsWith("/shorts/")) {
        return url.pathname.split("/").filter(Boolean)[1] || "";
      }

      if (url.pathname.startsWith("/embed/")) {
        return url.pathname.split("/").filter(Boolean)[1] || "";
      }

      return url.searchParams.get("v") || "";
    }
  } catch {
    return value;
  }

  return value;
}
