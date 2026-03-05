import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET(
  _req: NextRequest,
  { params }: { params: { guildId: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { rows } = await db.query(
    `SELECT id::text, guild_id::text, channel_id::text, message_id::text, title, description, is_active,
            sync_state, last_sync_error, last_synced_at
     FROM role_panels
     WHERE guild_id = $1
     ORDER BY created_at DESC`,
    [params.guildId]
  );

  return NextResponse.json({ panels: rows });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { guildId: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/setup", req.url));
  }

  const form = await req.formData();
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const channelId = String(form.get("channelId") ?? "").trim();

  if (!title || !description || !channelId) {
    return NextResponse.redirect(
      new URL(`/guilds/${params.guildId}/roles?error=validation`, req.url)
    );
  }

  await db.query(
    `INSERT INTO role_panels (id, guild_id, channel_id, title, description, is_active, sync_state, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, TRUE, 'pending', NOW(), NOW())`,
    [randomUUID(), params.guildId, channelId, title, description]
  );

  return NextResponse.redirect(
    new URL(`/guilds/${params.guildId}/roles?created=1`, req.url)
  );
}
