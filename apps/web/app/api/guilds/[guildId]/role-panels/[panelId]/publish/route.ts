import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function POST(
  req: NextRequest,
  { params }: { params: { guildId: string; panelId: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/setup", req.url));
  }

  await db.query(
    `UPDATE role_panels
     SET sync_state = 'pending',
         last_sync_error = NULL,
         updated_at = NOW()
     WHERE id = $1 AND guild_id = $2`,
    [params.panelId, params.guildId]
  );

  return NextResponse.redirect(
    new URL(`/guilds/${params.guildId}/roles?publish=1`, req.url)
  );
}
