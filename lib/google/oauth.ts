import type { SupabaseClient } from "@supabase/supabase-js";

const tokenId = "runplayback";

type StoredToken = {
  access_token: string;
  refresh_token: string | null;
  scope: string | null;
  expires_at: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

export function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
}

export function getYouTubeOAuthUrl(origin: string, state: string) {
  const config = getGoogleOAuthConfig();

  if (!config) {
    throw new Error("Google OAuth credentials are not configured.");
  }

  const params = new URLSearchParams({
    access_type: "offline",
    client_id: config.clientId,
    include_granted_scopes: "true",
    prompt: "consent",
    redirect_uri: `${origin}/admin/youtube/callback`,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube.force-ssl",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(origin: string, code: string) {
  const config = getGoogleOAuthConfig();

  if (!config) {
    throw new Error("Google OAuth credentials are not configured.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${origin}/admin/youtube/callback`,
    }),
  });

  const tokens = (await response.json()) as TokenResponse;

  if (!response.ok || !tokens.access_token) {
    throw new Error(
      tokens.error_description || tokens.error || "Google OAuth failed.",
    );
  }

  return tokens;
}

async function refreshAccessToken(refreshToken: string) {
  const config = getGoogleOAuthConfig();

  if (!config) {
    throw new Error("Google OAuth credentials are not configured.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const tokens = (await response.json()) as TokenResponse;

  if (!response.ok || !tokens.access_token) {
    throw new Error(
      tokens.error_description || tokens.error || "Unable to refresh YouTube token.",
    );
  }

  return tokens;
}

export async function saveYouTubeOAuthTokens(
  supabase: SupabaseClient,
  tokens: TokenResponse,
) {
  const { data: existing } = await supabase
    .from("youtube_oauth_tokens")
    .select("refresh_token")
    .eq("id", tokenId)
    .maybeSingle<Pick<StoredToken, "refresh_token">>();

  const expiresAt = new Date(
    Date.now() + (tokens.expires_in || 3600) * 1000,
  ).toISOString();

  const { error } = await supabase.from("youtube_oauth_tokens").upsert({
    id: tokenId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || existing?.refresh_token || null,
    scope: tokens.scope || null,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function getValidYouTubeAccessToken(supabase: SupabaseClient) {
  const { data: token, error } = await supabase
    .from("youtube_oauth_tokens")
    .select("access_token,refresh_token,scope,expires_at")
    .eq("id", tokenId)
    .maybeSingle<StoredToken>();

  if (error) {
    throw new Error(error.message);
  }

  if (!token) {
    throw new Error("Connect YouTube captions before importing captions.");
  }

  const expiresAt = new Date(token.expires_at).getTime();

  if (expiresAt > Date.now() + 60_000) {
    return token.access_token;
  }

  if (!token.refresh_token) {
    throw new Error("YouTube authorization expired. Reconnect YouTube captions.");
  }

  const refreshed = await refreshAccessToken(token.refresh_token);
  await saveYouTubeOAuthTokens(supabase, {
    ...refreshed,
    refresh_token: token.refresh_token,
  });

  return refreshed.access_token;
}
