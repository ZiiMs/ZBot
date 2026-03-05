import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/discord";
import { getSession } from "@/lib/session";

export async function POST(
  req: NextRequest,
  { params }: { params: { guildId: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/setup", req.url));
  }

  const user = await getCurrentUser(session.access_token);

  await db.query(
    `INSERT INTO guild_installations (guild_id, installed_by_user_id, installed_at, last_verified_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (guild_id)
     DO UPDATE SET installed_by_user_id = EXCLUDED.installed_by_user_id, last_verified_at = NOW()`,
    [params.guildId, user.id]
  );

  return NextResponse.redirect(new URL("/setup?verified=1", req.url));
}
