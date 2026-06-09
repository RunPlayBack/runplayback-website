import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens, saveYouTubeOAuthTokens } from "@/lib/google/oauth";

export async function GET(request: NextRequest) {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = "/admin/videos";
  redirectUrl.search = "";

  const expectedState = request.cookies.get("youtube_oauth_state")?.value;
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");

  if (oauthError) {
    redirectUrl.searchParams.set("error", oauthError);
    return NextResponse.redirect(redirectUrl);
  }

  if (!code || !state || state !== expectedState) {
    redirectUrl.searchParams.set("error", "Invalid YouTube OAuth callback.");
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = await createClient();

  if (!supabase) {
    redirectUrl.pathname = "/admin/login";
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const tokens = await exchangeCodeForTokens(request.nextUrl.origin, code);
    await saveYouTubeOAuthTokens(supabase, tokens);
    redirectUrl.searchParams.set("youtubeConnected", "1");
  } catch (error) {
    redirectUrl.searchParams.set(
      "error",
      error instanceof Error ? error.message : "Unable to connect YouTube.",
    );
  }

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.delete("youtube_oauth_state");
  return response;
}
