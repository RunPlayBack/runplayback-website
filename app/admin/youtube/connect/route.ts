import { NextResponse, type NextRequest } from "next/server";
import { getYouTubeOAuthUrl } from "@/lib/google/oauth";

export async function GET(request: NextRequest) {
  const state = crypto.randomUUID();

  try {
    const response = NextResponse.redirect(
      getYouTubeOAuthUrl(request.nextUrl.origin, state),
    );
    response.cookies.set("youtube_oauth_state", state, {
      httpOnly: true,
      maxAge: 600,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
    return response;
  } catch (error) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/admin/videos";
    redirectUrl.search = "";
    redirectUrl.searchParams.set(
      "error",
      error instanceof Error ? error.message : "Unable to start YouTube OAuth.",
    );
    return NextResponse.redirect(redirectUrl);
  }
}
