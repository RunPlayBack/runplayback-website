"use client";

import { useEffect, useMemo, useState } from "react";

type GenerationResult = {
  audioDuration: number;
  lyricWordCount: number;
  automaticallyAligned: number;
  estimated: number;
  status: string;
  srt: string;
};

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function SrtMakerClient() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [lyricsFile, setLyricsFile] = useState<File | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [status, setStatus] = useState("Waiting for MP3 and TXT.");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const downloadUrl = useMemo(() => {
    if (!result?.srt) {
      return "";
    }

    return URL.createObjectURL(
      new Blob([result.srt], { type: "application/x-subrip;charset=utf-8" }),
    );
  }, [result?.srt]);

  useEffect(() => {
    document.body.classList.add("deranged-fan-route");

    return () => {
      document.body.classList.remove("deranged-fan-route");

      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]);

  async function handleGenerate() {
    if (!audioFile || !lyricsFile) {
      setError("Choose one MP3 acapella file and one TXT lyric file.");
      return;
    }

    setIsGenerating(true);
    setError("");
    setResult(null);
    setStatus("Transcribing vocals and aligning lyrics.");

    const formData = new FormData();
    formData.append("audio", audioFile);
    formData.append("lyrics", lyricsFile);

    try {
      const response = await fetch("/api/srt-maker", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Generation failed.");
      }

      setResult(payload);
      setStatus(payload.status);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong while generating the SRT.",
      );
      setStatus("Generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <main className="deranged-fan-app min-h-screen bg-[#fbfbf7] px-5 py-12 text-[#151515] sm:px-8">
      <section className="mx-auto max-w-3xl">
        <div className="mb-10">
          <p className="m-0 text-5xl font-black leading-none tracking-normal sm:text-7xl">
            DERANGED FAN
          </p>
          <h1 className="m-0 text-5xl font-black leading-none tracking-normal sm:text-7xl">
            SRT MAKER
          </h1>
        </div>

        <div className="grid gap-6">
          <label className="grid gap-2 text-sm font-black uppercase">
            Acapella
            <input
              accept=".mp3,audio/mpeg"
              className="w-full rounded border border-[#151515] bg-white p-4 text-base font-bold normal-case"
              type="file"
              onChange={(event) => {
                setAudioFile(event.target.files?.[0] ?? null);
                setResult(null);
                setError("");
              }}
            />
          </label>

          <label className="grid gap-2 text-sm font-black uppercase">
            Lyrics
            <input
              accept=".txt,text/plain"
              className="w-full rounded border border-[#151515] bg-white p-4 text-base font-bold normal-case"
              type="file"
              onChange={(event) => {
                setLyricsFile(event.target.files?.[0] ?? null);
                setResult(null);
                setError("");
              }}
            />
          </label>

          <button
            className="rounded bg-[#151515] px-6 py-4 text-base font-black uppercase text-white disabled:cursor-not-allowed disabled:bg-[#8b8b8b]"
            disabled={isGenerating || !audioFile || !lyricsFile}
            type="button"
            onClick={handleGenerate}
          >
            {isGenerating ? "Generating SRT" : "Generate SRT"}
          </button>
        </div>

        <div className="mt-8 grid gap-3 border-t border-[#151515] pt-6 text-base font-bold">
          <p className="m-0">audio duration: {formatDuration(result?.audioDuration ?? 0)}</p>
          <p className="m-0">number of lyric words: {result?.lyricWordCount ?? 0}</p>
          <p className="m-0">
            number automatically aligned: {result?.automaticallyAligned ?? 0}
          </p>
          <p className="m-0">number estimated: {result?.estimated ?? 0}</p>
          <p className="m-0">generation status: {status}</p>
          {error ? <p className="m-0 text-[#b42318]">{error}</p> : null}
        </div>

        {result ? (
          <div className="mt-8 grid gap-4">
            <a
              className="inline-flex w-fit rounded bg-[#e7702b] px-6 py-4 text-base font-black uppercase text-white no-underline"
              download="deranged-fan-lyrics.srt"
              href={downloadUrl}
            >
              Download SRT
            </a>
            <textarea
              aria-label="Generated SRT preview"
              className="min-h-[420px] w-full resize-y rounded border border-[#151515] bg-white p-4 font-mono text-sm leading-relaxed text-[#151515]"
              readOnly
              value={result.srt}
            />
          </div>
        ) : null}
      </section>
    </main>
  );
}
