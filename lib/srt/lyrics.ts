const SECTION_HEADING_PATTERN =
  /^\s*\[(?:verse(?:\s+\d+)?|chorus|hook|bridge|outro)\]\s*$/i;

function keepOnlyWordChars(value: string) {
  return value
    .replace(/[’`]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ");
}

function cleanApostrophes(token: string) {
  let output = "";

  for (let index = 0; index < token.length; index += 1) {
    const char = token[index];

    if (char !== "'") {
      output += char;
      continue;
    }

    const previous = token[index - 1];
    const next = token[index + 1];
    if (/[a-z0-9]/.test(previous ?? "") && /[a-z0-9]/.test(next ?? "")) {
      output += char;
    }
  }

  return output;
}

export function normalizeLyricTranscript(transcript: string) {
  return transcript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !SECTION_HEADING_PATTERN.test(line))
    .map(keepOnlyWordChars)
    .join(" ")
    .split(/\s+/)
    .map(cleanApostrophes)
    .filter(Boolean);
}

export function normalizeWordForAlignment(word: string) {
  return cleanApostrophes(keepOnlyWordChars(word).trim()).replace(/'/g, "");
}
