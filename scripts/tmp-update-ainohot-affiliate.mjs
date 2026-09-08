import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path = ".env.local") {
  if (!fs.existsSync(path)) return;

  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}

loadEnvFile();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required.");
if (!supabaseKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");

const supabase = createClient(supabaseUrl, supabaseKey);

const SLUG = "ainohot-s20-veloinno-review-4-wheel-electric-motobike-dKj79mhbpGs";
const YOUTUBE_ID = "dKj79mhbpGs";
const NEW_LABEL = "Ainohot S20 (use promo code RunPlayBack100 for a discount)";
const NEW_URL =
  "https://ainohot.com/products/ainohot-s20?sca_ref=11399781.eKldTPFpKuyPg";

const AINOHOT_LINK_RE =
  /https?:\/\/(?:www\.)?ainohot\.com\/products\/ainohot-s20[^\s)\]]*/gi;
const AINOHOT_LABEL_RE =
  /Ainohot S20\s*\([^)]*RunPlayBack(?:100|200)[^)]*\)/gi;
const MATCH_RE =
  /Ainohot S20|ainohot-s20|RunPlayBack200|RunPlayBack100|ainohot\.com\/products\/ainohot-s20/i;

function replaceString(value) {
  if (typeof value !== "string") return value;

  return value
    .replace(/RunPlayBack200/gi, "RunPlayBack100")
    .replace(AINOHOT_LABEL_RE, NEW_LABEL)
    .replace(AINOHOT_LINK_RE, NEW_URL);
}

function getUpdates(row, forceLinkFields = false) {
  const updates = {};
  const rowMatches = Object.values(row).some(
    (value) => typeof value === "string" && MATCH_RE.test(value),
  );

  for (const [field, value] of Object.entries(row)) {
    if (typeof value !== "string") continue;

    let next = replaceString(value);

    if ((forceLinkFields || rowMatches) && ["url", "href", "link"].includes(field)) {
      next = NEW_URL;
    }

    if (
      (forceLinkFields || rowMatches) &&
      ["label", "title", "name", "text"].includes(field)
    ) {
      next = NEW_LABEL;
    }

    if (next !== value) updates[field] = next;
  }

  return updates;
}

async function updateRow(table, row, updates) {
  if (!row.id || Object.keys(updates).length === 0) return false;

  const { error } = await supabase.from(table).update(updates).eq("id", row.id);
  if (error) throw new Error(`${table}: ${error.message}`);

  return true;
}

const { data: article, error: articleError } = await supabase
  .from("articles")
  .select("*")
  .eq("slug", SLUG)
  .maybeSingle();

if (articleError) throw articleError;
if (!article) throw new Error(`Article not found: ${SLUG}`);

let articleUpdated = false;
const articleUpdates = getUpdates(article);
if (Object.keys(articleUpdates).length > 0) {
  const { error } = await supabase.from("articles").update(articleUpdates).eq("id", article.id);
  if (error) throw error;
  articleUpdated = true;
}

const possibleVideoIds = new Set(
  [YOUTUBE_ID, article.video_id, article.youtube_video_id, article.youtube_id].filter(Boolean),
);
const tables = ["video_links", "description_links", "article_links"];
let linkRowsUpdated = 0;

for (const table of tables) {
  const { data, error } = await supabase.from(table).select("*").limit(2000);
  if (error) continue;

  for (const row of data ?? []) {
    const rowText = Object.values(row)
      .filter((value) => typeof value === "string")
      .join("\n");
    const articleMatch = row.article_id === article.id;
    const videoMatch =
      possibleVideoIds.has(row.video_id) ||
      possibleVideoIds.has(row.youtube_video_id) ||
      possibleVideoIds.has(row.youtube_id);
    const textMatch = MATCH_RE.test(rowText);

    if (!articleMatch && !videoMatch && !textMatch) continue;

    const updates = getUpdates(row, textMatch);
    if (await updateRow(table, row, updates)) linkRowsUpdated += 1;
  }
}

const { data: verify, error: verifyError } = await supabase
  .from("articles")
  .select("*")
  .eq("slug", SLUG)
  .maybeSingle();

if (verifyError) throw verifyError;

const articleText = Object.values(verify ?? {})
  .filter((value) => typeof value === "string")
  .join("\n");

console.log(
  JSON.stringify({
    articleUpdated,
    linkRowsUpdated,
    oldTextRemaining: /RunPlayBack200/i.test(articleText),
    updatedLabel: NEW_LABEL,
    updatedUrl: NEW_URL,
  }),
);
