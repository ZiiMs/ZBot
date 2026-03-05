import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(req: Request) {
  const response = await auth.api.signInSocial({
    body: {
      provider: "discord",
      callbackURL: "/setup"
    },
    headers: req.headers
  });

  if (!response.url) {
    return NextResponse.redirect(new URL("/setup?error=oauth_start", req.url));
  }

  return NextResponse.redirect(response.url);
}
