import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");

rmSync(dist, { force: true, recursive: true });
mkdirSync(join(dist, "server"), { recursive: true });
copyFileSync(
  join(root, "sites", "srt-maker-worker.js"),
  join(dist, "server", "index.js"),
);
