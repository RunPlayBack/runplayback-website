import type { TimedLyricWord } from "@/lib/srt/alignment";

const PROJECT_FRAMES_PER_SECOND = 24_000 / 1_001;
const PAUSE_GAP_SECONDS = 0.35;
const SECONDS_PER_FRAME = 1 / PROJECT_FRAMES_PER_SECOND;

type FramedCue = {
  word: string;
  startFrame: number;
  naturalEndFrame: number;
};

function secondsToStartFrame(seconds: number) {
  return Math.max(0, Math.floor(seconds / SECONDS_PER_FRAME));
}

function secondsToEndFrame(seconds: number) {
  return Math.max(0, Math.floor(seconds / SECONDS_PER_FRAME));
}

function frameToSeconds(frame: number) {
  return frame * SECONDS_PER_FRAME;
}

function formatTimestampFromFrame(frame: number) {
  const seconds = frameToSeconds(frame);
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((totalMilliseconds % 60_000) / 1000);
  const millis = totalMilliseconds % 1000;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0",
  )}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function buildFramedCues(words: TimedLyricWord[]) {
  const cues: FramedCue[] = [];

  for (const word of words) {
    const previous = cues.at(-1);
    const startFrame = Math.max(
      secondsToStartFrame(word.start),
      previous ? previous.startFrame + 1 : 0,
    );

    cues.push({
      word: word.word,
      startFrame,
      naturalEndFrame: Math.max(startFrame + 1, secondsToEndFrame(word.end)),
    });
  }

  return cues;
}

export function generateSrt(words: TimedLyricWord[]) {
  const framedCues = buildFramedCues(words);

  return framedCues
    .map((cue, index) => {
      const sourceWord = words[index];
      const nextCue = framedCues[index + 1];
      const nextSourceWord = words[index + 1];
      const rawGapToNext =
        nextSourceWord && sourceWord
          ? nextSourceWord.speechStart - sourceWord.speechEnd
          : Number.POSITIVE_INFINITY;
      let endFrame =
        nextCue && rawGapToNext >= 0 && rawGapToNext <= PAUSE_GAP_SECONDS
          ? nextCue.startFrame
          : cue.naturalEndFrame;

      if (nextCue) {
        endFrame = Math.min(endFrame, nextCue.startFrame);
      }

      endFrame = Math.max(cue.startFrame + 1, endFrame);

      return `${index + 1}
${formatTimestampFromFrame(cue.startFrame)} --> ${formatTimestampFromFrame(endFrame)}
${cue.word}`;
    })
    .join("\n\n");
}
