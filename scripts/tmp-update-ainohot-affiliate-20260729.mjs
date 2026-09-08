import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path = ".env.local") {
  if (!fs.existsSync(path)) return;

  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ||= value;
  }
}

loadEnvFile();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required.");
if (!supabaseKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

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

function replaceInString(value) {
  return value
    .replaceAll("RunPlayBack200", "RunPlayBack100")
    .replace(AINOHOT_LABEL_RE, NEW_LABEL)
    .replace(AINOHOT_LINK_RE, NEW_URL);
}

function replaceDeep(value) {
  if (typeof value === "string") return replaceInString(value);
  if (Array.isArray(value)) return value.map(replaceDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, replaceDeep(child)]),
    );
  }
  return value;
}

function hasMatch(value) {
  if (typeof value === "string") return MATCH_RE.test(value);
  if (Array.isArray(value)) return value.some(hasMatch);
  if (value && typeof value === "object") return Object.values(value).some(hasMatch);
  return false;
}

function updateLinkRow(row) {
  const next = {};

  for (const [key, value] of Object.entries(row)) {
    if (["id", "created_at", "updated_at", "article_id", "video_id"].includes(key)) {
      continue;
    }
    if (typeof value === "string") next[key] = replaceInString(value);
    else if (Array.isArray(value) || (value && typeof value === "object")) {
      next[key] = replaceDeep(value);
    }
  }

  for (const key of ["label", "title", "name", "text"]) {
    if (key in row && typeof row[key] === "string" && hasMatch(row[key])) {
      next[key] = NEW_LABEL;
    }
  }

  for (const key of ["url", "href", "link"]) {
    if (key in row && typeof row[key] === "string" && hasMatch(row[key])) {
      next[key] = NEW_URL;
    }
  }

  return next;
}

const { data: article, error: articleError } = await supabase
  .from("articles")
  .select("*")
  .eq("slug", SLUG)
  .single();

if (articleError) throw articleError;

const articleUpdate = {};
for (const [key, value] of Object.entries(article)) {
  if (["id", "created_at", "updated_at"].includes(key)) continue;
  if (typeof value === "string" && hasMatch(value)) {
    articleUpdate[key] = replaceInString(value);
  }
  if ((Array.isArray(value) || (value && typeof value === "object")) && hasMatch(value)) {
    articleUpdate[key] = replaceDeep(value);
  }
}

if (Object.keys(articleUpdate).length) {
  const { error } = await supabase.from("articles").update(articleUpdate).eq("id", article.id);
  if (error) throw error;
}

let linkRowsUpdated = 0;
for (const table of ["video_links", "description_links", "article_links"]) {
  const { data: rows, error } = await supabase.from(table).select("*");
  if (error) continue;

  for (const row of rows ?? []) {
    const scoped =
      row.article_id === article.id ||
      row.video_id === article.video_id ||
      row.video_id === YOUTUBE_ID ||
      hasMatch(row);

    if (!scoped || !hasMatch(row)) continue;

    const update = updateLinkRow(row);
    if (!Object.keys(update).length) continue;

    const { error: updateError } = await supabase.from(table).update(update).eq("id", row.id);
    if (updateError) throw updateError;

    linkRowsUpdated += 1;
  }
}

const { data: updated, error: updatedError } = await supabase
  .from("articles")
  .select("*")
  .eq("id", article.id)
  .single();

if (updatedError) throw updatedError;

console.log(
  JSON.stringify(
    {
      articleUpdatedFields: Object.keys(articleUpdate),
      linkRowsUpdated,
      oldPromoRemainingInArticle: JSON.stringify(updated).includes("RunPlayBack200"),
      newLabel: NEW_LABEL,
      newUrl: NEW_URL,
    },
    null,
    2,
  ),
);
