import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/discord";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/setup?error=missing_session", req.url));
  }

  const guildId = req.nextUrl.searchParams.get("guild_id") ?? req.nextUrl.searchParams.get("state");
  if (!guildId) {
    return NextResponse.redirect(new URL("/setup?error=missing_guild", req.url));
  }

  try {
    const user = await getCurrentUser(session.access_token);
    await db.query(
      `INSERT INTO guild_installations (guild_id, installed_by_user_id, installed_at, last_verified_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (guild_id)
       DO UPDATE SET installed_by_user_id = EXCLUDED.installed_by_user_id, last_verified_at = NOW()`,
      [guildId, user.id]
    );

    return NextResponse.redirect(new URL(`/setup?verified=1&guild=${guildId}`, req.url));
  } catch {
    return NextResponse.redirect(new URL("/setup?error=install_callback", req.url));
  }
}
