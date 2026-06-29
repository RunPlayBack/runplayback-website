import fs from "fs";
import path from "path";

import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

type LocalEnv = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

let cachedLocalEnv: LocalEnv | null = null;

function readLocalEnvFile(): LocalEnv {
  if (cachedLocalEnv) {
    return cachedLocalEnv;
  }

  try {
    const envPath = path.join(process.cwd(), ".env.local");
    const raw = fs.readFileSync(envPath, "utf8");
    const parsed: LocalEnv = {};

    for (const line of raw.split("\n")) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (key === "NEXT_PUBLIC_SUPABASE_URL") {
        parsed.NEXT_PUBLIC_SUPABASE_URL = value;
      }

      if (key === "SUPABASE_SERVICE_ROLE_KEY") {
        parsed.SUPABASE_SERVICE_ROLE_KEY = value;
      }
    }

    cachedLocalEnv = parsed;
    return parsed;
  } catch {
    cachedLocalEnv = {};
    return cachedLocalEnv;
  }
}

export function createAdminClient() {
  const localEnv = readLocalEnvFile();
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    localEnv.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    localEnv.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createSupabaseAdminClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}
