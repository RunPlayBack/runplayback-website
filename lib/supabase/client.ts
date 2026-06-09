"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseBrowserConfig } from "./config";

export function createClient() {
  const config = getSupabaseBrowserConfig();

  if (!config) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return createBrowserClient(config.url, config.anonKey);
}
