import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildLoginUrl } from "@/lib/discord";

export async function GET() {
  const state = crypto.randomUUID();
  cookies().set("discord_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });

  return NextResponse.redirect(buildLoginUrl(state));
}
