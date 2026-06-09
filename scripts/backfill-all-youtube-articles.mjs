import { spawn } from "node:child_process";

const defaultBatchSize = 10;
const defaultScanLimit = 100;
const defaultStart = 1;
const defaultEnd = 800;
const defaultYtDlpSleep = 8;
const defaultPauseBetweenBatchesSeconds = 30;
const defaultRateLimitPauseSeconds = 3600;

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));

  return value ? value.slice(prefix.length) : fallback;
}

function getNumberArg(name, fallback) {
  const value = Number(getArg(name, ""));

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function runImporter(args) {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", "backfill:articles", "--", ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });

    child.on("close", (code) => {
      resolve({
        code,
        output,
      });
    });
  });
}

function getFoundCount(output) {
  const match = output.match(/Found (\d+) videos\./);

  return match ? Number(match[1]) : 0;
}

function getCreatedCount(output) {
  return (output.match(/Published article created:/g) || []).length;
}

function isRateLimited(output) {
  return /rate-limited|try again later|too many requests|429/i.test(output);
}

function isOpenAIQuotaError(output) {
  return /insufficient_quota|exceeded your current quota|check your plan and billing|OpenAI quota is exhausted/i.test(
    output,
  );
}

async function main() {
  const batchSize = getNumberArg("batch-size", defaultBatchSize);
  const scanLimit = getNumberArg("scan-limit", defaultScanLimit);
  const scanStart = getNumberArg("scan-start", defaultStart);
  const scanEnd = getNumberArg("scan-end", defaultEnd);
  const ytDlpSleep = getNumberArg("yt-dlp-sleep", defaultYtDlpSleep);
  const pauseBetweenBatchesSeconds = getNumberArg(
    "pause-between-batches",
    defaultPauseBetweenBatchesSeconds,
  );
  const rateLimitPauseSeconds = getNumberArg(
    "rate-limit-pause",
    defaultRateLimitPauseSeconds,
  );
  let currentStart = scanStart;
  let totalCreated = 0;

  console.log("Starting overnight RunPlayBack article backfill.");
  console.log(
    `Batch size ${batchSize}, scan windows ${scanLimit}, range ${scanStart}-${scanEnd}.`,
  );

  while (currentStart <= scanEnd) {
    const currentEnd = currentStart + scanLimit - 1;

    console.log(`\n=== Scanning channel videos ${currentStart}-${currentEnd} ===`);

    const result = await runImporter([
      `--limit=${batchSize}`,
      `--scan-start=${currentStart}`,
      `--scan-limit=${scanLimit}`,
      "--publish",
      "--yt-dlp-channel",
      "--yt-dlp-srt",
      "--skip-captions",
      `--yt-dlp-sleep=${ytDlpSleep}`,
    ]);
    const foundCount = getFoundCount(result.output);
    const createdCount = getCreatedCount(result.output);

    totalCreated += createdCount;

    if (isOpenAIQuotaError(result.output)) {
      console.log(
        "\nOpenAI quota is exhausted, so the overnight run is stopping. Add billing/credits or wait for quota to reset, then rerun this command.",
      );
      process.exit(1);
    }

    if (result.code !== 0 && isRateLimited(result.output)) {
      console.log(
        `\nYouTube rate-limited this run. Waiting ${rateLimitPauseSeconds} seconds, then retrying the same range...`,
      );
      await wait(rateLimitPauseSeconds * 1000);
      continue;
    }

    if (result.code !== 0) {
      console.log("\nImporter failed for a non-rate-limit reason. Moving to the next range.");
      currentStart += scanLimit;
      continue;
    }

    if (foundCount === 0) {
      console.log("No new article candidates in this range. Moving to the next range.");
      currentStart += scanLimit;
    } else {
      console.log(
        `Created ${createdCount} article${createdCount === 1 ? "" : "s"} in this pass. Rechecking the same range for more uncovered videos.`,
      );
    }

    await wait(pauseBetweenBatchesSeconds * 1000);
  }

  console.log(`\nOvernight backfill complete. Created ${totalCreated} articles.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
