import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/session";
import { exchangeCodeForToken, getCurrentUser } from "@/lib/discord";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const savedState = cookies().get("discord_oauth_state")?.value;

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL("/setup?error=oauth_state", req.url));
  }

  cookies().delete("discord_oauth_state");

  try {
    const token = await exchangeCodeForToken(code);
    const user = await getCurrentUser(token.access_token);

    await createSession({
      userId: user.id,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresInSeconds: token.expires_in
    });

    return NextResponse.redirect(new URL("/setup", req.url));
  } catch {
    return NextResponse.redirect(new URL("/setup?error=oauth_callback", req.url));
  }
}
