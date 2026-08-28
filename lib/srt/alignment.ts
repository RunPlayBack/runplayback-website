import { normalizeWordForAlignment } from "@/lib/srt/lyrics";

export type WhisperWord = {
  word: string;
  start: number;
  end: number;
};

export type TimedLyricWord = {
  word: string;
  start: number;
  end: number;
  speechStart: number;
  speechEnd: number;
  source: "aligned" | "estimated";
};

export type AlignmentResult = {
  words: TimedLyricWord[];
  automaticallyAligned: number;
  estimated: number;
};

type DraftTimedWord = {
  word: string;
  start: number | null;
  end: number | null;
  source: "aligned" | "estimated";
};

type Step = "match" | "delete" | "insert";

function levenshteinDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];

    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost,
      );
    }

    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length] ?? 0;
}

function wordMatchCost(lyricWord: string, detectedWord: string) {
  const lyric = normalizeWordForAlignment(lyricWord);
  const detected = normalizeWordForAlignment(detectedWord);

  if (!lyric || !detected) {
    return 1.2;
  }

  if (lyric === detected) {
    return 0;
  }

  const longest = Math.max(lyric.length, detected.length);
  const distanceRatio = levenshteinDistance(lyric, detected) / longest;

  if (distanceRatio <= 0.22) {
    return 0.35;
  }

  if (
    longest >= 5 &&
    (lyric.startsWith(detected) || detected.startsWith(lyric))
  ) {
    return 0.5;
  }

  return 1.15;
}

function averageAlignedDuration(words: DraftTimedWord[]) {
  const durations = words
    .filter((word) => word.start !== null && word.end !== null)
    .map((word) => Math.max(0.08, word.end! - word.start!));

  if (durations.length === 0) {
    return 0.32;
  }

  return durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
}

function estimateMissingTimings(words: DraftTimedWord[], audioDuration: number) {
  const defaultDuration = averageAlignedDuration(words);
  let index = 0;

  while (index < words.length) {
    if (words[index].start !== null && words[index].end !== null) {
      index += 1;
      continue;
    }

    const runStart = index;
    while (
      index < words.length &&
      (words[index].start === null || words[index].end === null)
    ) {
      index += 1;
    }
    const runEnd = index - 1;
    const count = runEnd - runStart + 1;
    const previous = runStart > 0 ? words[runStart - 1] : null;
    const next = index < words.length ? words[index] : null;
    const previousEnd = previous?.end ?? null;
    const nextStart = next?.start ?? null;

    if (previousEnd !== null && nextStart !== null && nextStart > previousEnd) {
      const step = (nextStart - previousEnd) / count;
      for (let cursor = runStart; cursor <= runEnd; cursor += 1) {
        const start = previousEnd + step * (cursor - runStart);
        const end =
          cursor === runEnd ? nextStart : previousEnd + step * (cursor - runStart + 1);
        words[cursor].start = start;
        words[cursor].end = Math.max(start + 0.04, end);
      }
      continue;
    }

    if (previousEnd !== null) {
      for (let cursor = runStart; cursor <= runEnd; cursor += 1) {
        const start = previousEnd + defaultDuration * (cursor - runStart);
        words[cursor].start = start;
        words[cursor].end = start + defaultDuration;
      }
      continue;
    }

    if (nextStart !== null) {
      const firstStart = Math.max(0, nextStart - defaultDuration * count);
      for (let cursor = runStart; cursor <= runEnd; cursor += 1) {
        const start = firstStart + defaultDuration * (cursor - runStart);
        words[cursor].start = start;
        words[cursor].end = Math.min(nextStart, start + defaultDuration);
      }
      continue;
    }

    const boundedDuration = audioDuration > 0 ? audioDuration / count : defaultDuration;
    for (let cursor = runStart; cursor <= runEnd; cursor += 1) {
      const start = boundedDuration * (cursor - runStart);
      words[cursor].start = start;
      words[cursor].end = start + boundedDuration;
    }
  }
}

const PROJECT_FRAME_SECONDS = 1_001 / 24_000;

const CONNECTOR_SPLIT_CAP_FRAMES = new Map([
  ["a", 4],
  ["your", 4],
]);

const END_ANCHORED_CAP_FRAMES = new Map([
  ["but", 2],
  ["dont", 6],
  ["don't", 6],
  ["how", 10],
  ["if", 3],
  ["might", 6],
  ["nothing", 10],
  ["some", 10],
  ["we", 2],
  ["who", 8],
  ["years", 8],
]);

function refineLyricTimings(words: TimedLyricWord[]) {
  const refined = words.map((word) => ({ ...word }));
  const floorFrame = (seconds: number) =>
    Math.max(0, Math.floor(seconds / PROJECT_FRAME_SECONDS));
  const frameToSeconds = (frame: number) => frame * PROJECT_FRAME_SECONDS;

  for (let index = 0; index < refined.length - 1; index += 1) {
    const word = refined[index];
    const next = refined[index + 1];
    const normalized = normalizeWordForAlignment(word.word);
    const capFrames = CONNECTOR_SPLIT_CAP_FRAMES.get(normalized);

    if (!capFrames) {
      continue;
    }

    const duration = word.end - word.start;
    const nextDuration = next.end - next.start;
    const flowsIntoNext = Math.abs(next.speechStart - word.speechEnd) <= 0.08;

    if (
      duration > capFrames * PROJECT_FRAME_SECONDS + 0.2 &&
      nextDuration <= 0.28 &&
      flowsIntoNext
    ) {
      const splitEnd = Math.min(
        word.end - 0.04,
        frameToSeconds(floorFrame(word.start) + capFrames),
      );
      word.end = Math.max(word.start + 0.04, splitEnd);
      next.start = word.end;
    }
  }

  for (const word of refined) {
    const normalized = normalizeWordForAlignment(word.word);
    const capFrames = END_ANCHORED_CAP_FRAMES.get(normalized);

    if (!capFrames) {
      continue;
    }

    const cap = capFrames * PROJECT_FRAME_SECONDS;
    const duration = word.end - word.start;
    if (duration > cap + 0.16) {
      word.start = frameToSeconds(Math.max(0, floorFrame(word.end) - capFrames));
    }
  }

  return refined;
}

export function alignLyricWordsToWhisper(
  lyricWords: string[],
  detectedWords: WhisperWord[],
  audioDuration: number,
): AlignmentResult {
  const rowCount = lyricWords.length + 1;
  const columnCount = detectedWords.length + 1;
  const scores = Array.from({ length: rowCount }, () =>
    Array.from({ length: columnCount }, () => Number.POSITIVE_INFINITY),
  );
  const steps = Array.from({ length: rowCount }, () =>
    Array.from({ length: columnCount }, (): Step | null => null),
  );
  const deleteCost = 0.86;
  const insertCost = 0.64;

  scores[0][0] = 0;

  for (let i = 1; i < rowCount; i += 1) {
    scores[i][0] = scores[i - 1][0] + deleteCost;
    steps[i][0] = "delete";
  }

  for (let j = 1; j < columnCount; j += 1) {
    scores[0][j] = scores[0][j - 1] + insertCost;
    steps[0][j] = "insert";
  }

  for (let i = 1; i < rowCount; i += 1) {
    for (let j = 1; j < columnCount; j += 1) {
      const candidates: Array<{ score: number; step: Step }> = [
        {
          score:
            scores[i - 1][j - 1] +
            wordMatchCost(lyricWords[i - 1], detectedWords[j - 1].word),
          step: "match",
        },
        { score: scores[i - 1][j] + deleteCost, step: "delete" },
        { score: scores[i][j - 1] + insertCost, step: "insert" },
      ];
      const best = candidates.reduce((winner, candidate) =>
        candidate.score < winner.score ? candidate : winner,
      );

      scores[i][j] = best.score;
      steps[i][j] = best.step;
    }
  }

  const draftWords: DraftTimedWord[] = lyricWords.map((word) => ({
    word,
    start: null,
    end: null,
    source: "estimated",
  }));

  let lyricIndex = lyricWords.length;
  let detectedIndex = detectedWords.length;

  while (lyricIndex > 0 || detectedIndex > 0) {
    const step = steps[lyricIndex][detectedIndex];

    if (step === "match") {
      lyricIndex -= 1;
      detectedIndex -= 1;

      if (
        wordMatchCost(lyricWords[lyricIndex], detectedWords[detectedIndex].word) <=
        0.5
      ) {
        draftWords[lyricIndex] = {
          word: lyricWords[lyricIndex],
          start: detectedWords[detectedIndex].start,
          end: detectedWords[detectedIndex].end,
          source: "aligned",
        };
      }
      continue;
    }

    if (step === "delete") {
      lyricIndex -= 1;
      continue;
    }

    if (step === "insert") {
      detectedIndex -= 1;
      continue;
    }

    break;
  }

  estimateMissingTimings(draftWords, audioDuration);

  const words = draftWords.map((word, index) => {
    const start = Math.max(0, word.start ?? 0);
    const end = Math.max(start + 0.04, word.end ?? start + 0.32);
    const boundedEnd =
      audioDuration > 0 && index === draftWords.length - 1
        ? Math.min(Math.max(start + 0.04, end), Math.max(audioDuration, start + 0.04))
        : end;

    return {
      word: word.word,
      start,
      end: boundedEnd,
      speechStart: start,
      speechEnd: boundedEnd,
      source: word.source,
    };
  });
  const refinedWords = refineLyricTimings(words);

  const automaticallyAligned = refinedWords.filter(
    (word) => word.source === "aligned",
  ).length;

  return {
    words: refinedWords,
    automaticallyAligned,
    estimated: refinedWords.length - automaticallyAligned,
  };
}
