const FPS = 24000 / 1001;
const SECONDS_PER_FRAME = 1 / FPS;
const PAUSE_GAP_SECONDS = 2;
const SECTION_HEADING_PATTERN =
  /^\s*\[(?:verse(?:\s+\d+)?|chorus|hook|bridge|outro)\]\s*$/i;

const html = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Deranged Fan SRT Maker</title>
    <meta name="description" content="Generate one-word SRT lyric captions from an acapella MP3 and TXT transcript." />
    <style>
      * { box-sizing: border-box; }
      body {
        background: #fbfbf7;
        color: #151515;
        font-family: Arial, Helvetica, sans-serif;
        margin: 0;
      }
      main {
        min-height: 100vh;
        padding: 48px 20px;
      }
      section {
        margin: 0 auto;
        max-width: 768px;
      }
      .title {
        font-size: clamp(48px, 9vw, 96px);
        font-weight: 900;
        line-height: 0.96;
        margin: 0 0 48px;
      }
      .fields {
        display: grid;
        gap: 24px;
      }
      label {
        display: grid;
        gap: 8px;
        font-size: 14px;
        font-weight: 900;
        text-transform: uppercase;
      }
      input {
        background: #fff;
        border: 1px solid #151515;
        border-radius: 4px;
        color: #151515;
        font: inherit;
        font-size: 16px;
        font-weight: 700;
        padding: 16px;
        text-transform: none;
        width: 100%;
      }
      button, .download {
        background: #151515;
        border: 0;
        border-radius: 4px;
        color: #fff;
        cursor: pointer;
        display: inline-flex;
        font: inherit;
        font-size: 16px;
        font-weight: 900;
        justify-content: center;
        padding: 16px 24px;
        text-decoration: none;
        text-transform: uppercase;
      }
      button:disabled {
        background: #999;
        cursor: not-allowed;
      }
      .stats {
        border-top: 1px solid #151515;
        display: grid;
        gap: 12px;
        font-size: 16px;
        font-weight: 700;
        margin-top: 40px;
        padding-top: 24px;
      }
      .stats p { margin: 0; }
      .error { color: #b42318; }
      .result {
        display: grid;
        gap: 16px;
        margin-top: 32px;
      }
      .download { background: #e7702b; width: fit-content; }
      textarea {
        background: #fff;
        border: 1px solid #151515;
        border-radius: 4px;
        color: #151515;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 14px;
        line-height: 1.55;
        min-height: 420px;
        padding: 16px;
        resize: vertical;
        width: 100%;
      }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1 class="title">DERANGED FAN<br />SRT MAKER</h1>
        <div class="fields">
          <label>Acapella <input id="audio" accept=".mp3,audio/mpeg" type="file" /></label>
          <label>Lyrics <input id="lyrics" accept=".txt,text/plain" type="file" /></label>
          <button id="generate" type="button" disabled>Generate SRT</button>
        </div>
        <div class="stats">
          <p>audio duration: <span id="duration">0:00</span></p>
          <p>number of lyric words: <span id="words">0</span></p>
          <p>number automatically aligned: <span id="aligned">0</span></p>
          <p>number estimated: <span id="estimated">0</span></p>
          <p>generation status: <span id="status">Waiting for MP3 and TXT.</span></p>
          <p id="error" class="error"></p>
        </div>
        <div id="result" class="result" hidden>
          <a id="download" class="download" download="deranged-fan-lyrics.srt">Download SRT</a>
          <textarea id="preview" aria-label="Generated SRT preview" readonly></textarea>
        </div>
      </section>
    </main>
    <script>
      const audio = document.getElementById("audio");
      const lyrics = document.getElementById("lyrics");
      const generate = document.getElementById("generate");
      const result = document.getElementById("result");
      const download = document.getElementById("download");
      const preview = document.getElementById("preview");
      const error = document.getElementById("error");
      const fields = {
        duration: document.getElementById("duration"),
        words: document.getElementById("words"),
        aligned: document.getElementById("aligned"),
        estimated: document.getElementById("estimated"),
        status: document.getElementById("status"),
      };
      let downloadUrl = "";

      function formatDuration(seconds) {
        if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
        const minutes = Math.floor(seconds / 60);
        const remaining = Math.round(seconds % 60);
        return minutes + ":" + String(remaining).padStart(2, "0");
      }

      function updateButton() {
        generate.disabled = !audio.files[0] || !lyrics.files[0];
        result.hidden = true;
        error.textContent = "";
      }

      audio.addEventListener("change", updateButton);
      lyrics.addEventListener("change", updateButton);

      generate.addEventListener("click", async () => {
        if (!audio.files[0] || !lyrics.files[0]) return;
        generate.disabled = true;
        error.textContent = "";
        result.hidden = true;
        fields.status.textContent = "Transcribing vocals and aligning lyrics.";

        const formData = new FormData();
        formData.append("audio", audio.files[0]);
        formData.append("lyrics", lyrics.files[0]);

        try {
          const response = await fetch("/api/srt-maker", { method: "POST", body: formData });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "Generation failed.");

          fields.duration.textContent = formatDuration(payload.audioDuration);
          fields.words.textContent = payload.lyricWordCount;
          fields.aligned.textContent = payload.automaticallyAligned;
          fields.estimated.textContent = payload.estimated;
          fields.status.textContent = payload.status;
          preview.value = payload.srt;

          if (downloadUrl) URL.revokeObjectURL(downloadUrl);
          downloadUrl = URL.createObjectURL(new Blob([payload.srt], { type: "application/x-subrip;charset=utf-8" }));
          download.href = downloadUrl;
          result.hidden = false;
        } catch (caught) {
          error.textContent = caught instanceof Error ? caught.message : "Something went wrong while generating the SRT.";
          fields.status.textContent = "Generation failed.";
        } finally {
          generate.disabled = !audio.files[0] || !lyrics.files[0];
        }
      });
    </script>
  </body>
</html>`;

function response(body, init = {}) {
  return new Response(body, {
    ...init,
    headers: {
      "content-type": "text/html;charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json;charset=utf-8" },
  });
}

function jsonError(message, status = 400) {
  return json({ error: message }, status);
}

function keepOnlyWordChars(value) {
  return value
    .replace(/[’`]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ");
}

function cleanApostrophes(token) {
  let output = "";
  for (let index = 0; index < token.length; index += 1) {
    const char = token[index];
    if (char !== "'") {
      output += char;
      continue;
    }
    const previous = token[index - 1] || "";
    const next = token[index + 1] || "";
    if (/[a-z0-9]/.test(previous) && /[a-z0-9]/.test(next)) output += char;
  }
  return output;
}

function normalizeLyricTranscript(transcript) {
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

function normalizeWordForAlignment(word) {
  return cleanApostrophes(keepOnlyWordChars(word).trim()).replace(/'/g, "");
}

function levenshteinDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + substitutionCost);
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] || 0;
}

function wordMatchCost(lyricWord, detectedWord) {
  const lyric = normalizeWordForAlignment(lyricWord);
  const detected = normalizeWordForAlignment(detectedWord);
  if (!lyric || !detected) return 1.2;
  if (lyric === detected) return 0;
  const longest = Math.max(lyric.length, detected.length);
  const distanceRatio = levenshteinDistance(lyric, detected) / longest;
  if (distanceRatio <= 0.22) return 0.35;
  if (longest >= 5 && (lyric.startsWith(detected) || detected.startsWith(lyric))) return 0.5;
  return 1.15;
}

function averageAlignedDuration(words) {
  const durations = words
    .filter((word) => word.start !== null && word.end !== null)
    .map((word) => Math.max(0.08, word.end - word.start));
  if (durations.length === 0) return 0.32;
  return durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
}

function estimateMissingTimings(words, audioDuration) {
  const defaultDuration = averageAlignedDuration(words);
  let index = 0;
  while (index < words.length) {
    if (words[index].start !== null && words[index].end !== null) {
      index += 1;
      continue;
    }
    const runStart = index;
    while (index < words.length && (words[index].start === null || words[index].end === null)) index += 1;
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
        const end = cursor === runEnd ? nextStart : previousEnd + step * (cursor - runStart + 1);
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

const PROJECT_FRAME_SECONDS = 1001 / 24000;

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

function refineLyricTimings(words) {
  const refined = words.map((word) => ({ ...word }));
  const floorFrame = (seconds) => Math.max(0, Math.floor(seconds / PROJECT_FRAME_SECONDS));
  const frameToSeconds = (frame) => frame * PROJECT_FRAME_SECONDS;

  for (let index = 0; index < refined.length - 1; index += 1) {
    const word = refined[index];
    const next = refined[index + 1];
    const normalized = normalizeWordForAlignment(word.word);
    const capFrames = CONNECTOR_SPLIT_CAP_FRAMES.get(normalized);

    if (!capFrames) continue;

    const duration = word.end - word.start;
    const nextDuration = next.end - next.start;
    const flowsIntoNext = Math.abs(next.speechStart - word.speechEnd) <= 0.08;

    if (duration > capFrames * PROJECT_FRAME_SECONDS + 0.2 && nextDuration <= 0.28 && flowsIntoNext) {
      const splitEnd = Math.min(word.end - 0.04, frameToSeconds(floorFrame(word.start) + capFrames));
      word.end = Math.max(word.start + 0.04, splitEnd);
      next.start = word.end;
    }
  }

  for (const word of refined) {
    const normalized = normalizeWordForAlignment(word.word);
    const capFrames = END_ANCHORED_CAP_FRAMES.get(normalized);

    if (!capFrames) continue;

    const cap = capFrames * PROJECT_FRAME_SECONDS;
    const duration = word.end - word.start;
    if (duration > cap + 0.16) {
      word.start = frameToSeconds(Math.max(0, floorFrame(word.end) - capFrames));
    }
  }

  return refined;
}

function alignLyricWordsToWhisper(lyricWords, detectedWords, audioDuration) {
  const rowCount = lyricWords.length + 1;
  const columnCount = detectedWords.length + 1;
  const scores = Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => Number.POSITIVE_INFINITY));
  const steps = Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => null));
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
      const candidates = [
        { score: scores[i - 1][j - 1] + wordMatchCost(lyricWords[i - 1], detectedWords[j - 1].word), step: "match" },
        { score: scores[i - 1][j] + deleteCost, step: "delete" },
        { score: scores[i][j - 1] + insertCost, step: "insert" },
      ];
      const best = candidates.reduce((winner, candidate) => (candidate.score < winner.score ? candidate : winner));
      scores[i][j] = best.score;
      steps[i][j] = best.step;
    }
  }

  const draftWords = lyricWords.map((word) => ({ word, start: null, end: null, source: "estimated" }));
  let lyricIndex = lyricWords.length;
  let detectedIndex = detectedWords.length;

  while (lyricIndex > 0 || detectedIndex > 0) {
    const step = steps[lyricIndex][detectedIndex];
    if (step === "match") {
      lyricIndex -= 1;
      detectedIndex -= 1;
      if (wordMatchCost(lyricWords[lyricIndex], detectedWords[detectedIndex].word) <= 0.5) {
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
  const automaticallyAligned = refinedWords.filter((word) => word.source === "aligned").length;
  return { words: refinedWords, automaticallyAligned, estimated: refinedWords.length - automaticallyAligned };
}

function secondsToStartFrame(seconds) {
  return Math.max(0, Math.floor(seconds / SECONDS_PER_FRAME));
}

function secondsToEndFrame(seconds) {
  return Math.max(0, Math.floor(seconds / SECONDS_PER_FRAME));
}

function frameToSeconds(frame) {
  return frame * SECONDS_PER_FRAME;
}

function formatTimestampFromFrame(frame) {
  const totalMilliseconds = Math.max(0, Math.round(frameToSeconds(frame) * 1000));
  const hours = Math.floor(totalMilliseconds / 3600000);
  const minutes = Math.floor((totalMilliseconds % 3600000) / 60000);
  const secs = Math.floor((totalMilliseconds % 60000) / 1000);
  const millis = totalMilliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function generateSrt(words) {
  const framedCues = [];
  for (const word of words) {
    const previous = framedCues.at(-1);
    const startFrame = Math.max(secondsToStartFrame(word.start), previous ? previous.startFrame + 1 : 0);
    framedCues.push({
      word: word.word,
      startFrame,
      naturalEndFrame: Math.max(startFrame + 1, secondsToEndFrame(word.end)),
    });
  }

  return framedCues
    .map((cue, index) => {
      const sourceWord = words[index];
      const nextCue = framedCues[index + 1];
      const nextSourceWord = words[index + 1];
      const rawGapToNext = nextSourceWord && sourceWord ? nextSourceWord.speechStart - sourceWord.speechEnd : Number.POSITIVE_INFINITY;
      let endFrame =
        nextCue && rawGapToNext >= 0 && rawGapToNext <= PAUSE_GAP_SECONDS ? nextCue.startFrame : cue.naturalEndFrame;
      if (nextCue) endFrame = Math.min(endFrame, nextCue.startFrame);
      endFrame = Math.max(cue.startFrame + 1, endFrame);
      return `${index + 1}\n${formatTimestampFromFrame(cue.startFrame)} --> ${formatTimestampFromFrame(endFrame)}\n${cue.word}`;
    })
    .join("\n\n");
}

async function handleSrtMaker(request, env) {
  if (!env.OPENAI_API_KEY) return jsonError("OPENAI_API_KEY is not set on the server.", 500);

  const formData = await request.formData();
  const audio = formData.get("audio");
  const lyrics = formData.get("lyrics");

  if (!(audio instanceof File) || !(lyrics instanceof File)) return jsonError("Upload one MP3 acapella file and one TXT lyric file.");
  if (!audio.name.toLowerCase().endsWith(".mp3")) return jsonError("The acapella upload must be a .mp3 file.");
  if (!lyrics.name.toLowerCase().endsWith(".txt")) return jsonError("The lyric upload must be a .txt file.");

  const lyricWords = normalizeLyricTranscript(await lyrics.text());
  if (lyricWords.length === 0) return jsonError("The lyric TXT did not contain any usable lyric words.");

  const transcriptionForm = new FormData();
  transcriptionForm.append("file", audio, audio.name);
  transcriptionForm.append("model", "whisper-1");
  transcriptionForm.append("response_format", "verbose_json");
  transcriptionForm.append("timestamp_granularities[]", "word");

  const transcriptionResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: transcriptionForm,
  });

  if (!transcriptionResponse.ok) {
    const detail = await transcriptionResponse.text();
    return jsonError(`OpenAI transcription failed: ${detail || transcriptionResponse.statusText}`, 502);
  }

  const transcription = await transcriptionResponse.json();
  const detectedWords = (transcription.words || [])
    .filter((word) => typeof word.word === "string" && typeof word.start === "number" && typeof word.end === "number")
    .map((word) => ({ word: word.word, start: word.start, end: word.end }));

  if (detectedWords.length === 0) return jsonError("Whisper did not return word-level timestamps.", 502);

  const fallbackDuration = detectedWords.at(-1)?.end || 0;
  const audioDuration = transcription.duration || fallbackDuration;
  const alignment = alignLyricWordsToWhisper(lyricWords, detectedWords, audioDuration);
  const srt = generateSrt(alignment.words);

  return json({
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/srt-maker") {
      return handleSrtMaker(request, env);
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/srt-maker")) {
      return response(html);
    }

    return response(html, { status: 404 });
  },
};
