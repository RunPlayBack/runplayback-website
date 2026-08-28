import { NextResponse } from "next/server";
import { alignLyricWordsToWhisper, type WhisperWord } from "@/lib/srt/alignment";
import { normalizeLyricTranscript } from "@/lib/srt/lyrics";
import { generateSrt } from "@/lib/srt/srt";

export const runtime = "nodejs";
export const maxDuration = 300;

type WhisperVerboseResponse = {
  duration?: number;
  words?: Array<{
    word?: string;
    start?: number;
    end?: number;
  }>;
};

function isMp3(file: File) {
  return file.name.toLowerCase().endsWith(".mp3");
}

function isTxt(file: File) {
  return file.name.toLowerCase().endsWith(".txt");
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return jsonError("OPENAI_API_KEY is not set on the server.", 500);
  }

  const formData = await request.formData();
  const audio = formData.get("audio");
  const lyrics = formData.get("lyrics");

  if (!(audio instanceof File) || !(lyrics instanceof File)) {
    return jsonError("Upload one MP3 acapella file and one TXT lyric file.");
  }

  if (!isMp3(audio)) {
    return jsonError("The acapella upload must be a .mp3 file.");
  }

  if (!isTxt(lyrics)) {
    return jsonError("The lyric upload must be a .txt file.");
  }

  const lyricWords = normalizeLyricTranscript(await lyrics.text());

  if (lyricWords.length === 0) {
    return jsonError("The lyric TXT did not contain any usable lyric words.");
  }

  const transcriptionForm = new FormData();
  transcriptionForm.append("file", audio, audio.name);
  transcriptionForm.append("model", "whisper-1");
  transcriptionForm.append("response_format", "verbose_json");
  transcriptionForm.append("timestamp_granularities[]", "word");

  const transcriptionResponse = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: transcriptionForm,
    },
  );

  if (!transcriptionResponse.ok) {
    const detail = await transcriptionResponse.text();
    return jsonError(
      `OpenAI transcription failed: ${detail || transcriptionResponse.statusText}`,
      502,
    );
  }

  const transcription =
    (await transcriptionResponse.json()) as WhisperVerboseResponse;
  const detectedWords: WhisperWord[] = (transcription.words ?? [])
    .filter(
      (word) =>
        typeof word.word === "string" &&
        typeof word.start === "number" &&
        typeof word.end === "number",
    )
    .map((word) => ({
      word: word.word!,
      start: word.start!,
      end: word.end!,
    }));

  if (detectedWords.length === 0) {
    return jsonError("Whisper did not return word-level timestamps.", 502);
  }

  const fallbackDuration = detectedWords.at(-1)?.end ?? 0;
  const audioDuration = transcription.duration ?? fallbackDuration;
  const alignment = alignLyricWordsToWhisper(
    lyricWords,
    detectedWords,
    audioDuration,
  );
  const srt = generateSrt(alignment.words);

  return NextResponse.json({
    audioDuration,
    lyricWordCount: lyricWords.length,
    automaticallyAligned: alignment.automaticallyAligned,
    estimated: alignment.estimated,
    status:
      alignment.estimated === 0
        ? "Generated with every word automatically aligned."
        : "Generated with estimated timing for unmatched lyric words.",
    srt,
  });
}
