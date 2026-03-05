import { NextRequest, NextResponse } from "next/server";

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

  const catalog = await db.query<{
    pack: string;
    key: string;
    label: string;
    emoji: string | null;
    sort_order: number;
  }>(
    `SELECT pack, key, label, emoji, sort_order
     FROM wow_preset_catalog
     ORDER BY pack, sort_order`
  );

  const mappings = await db.query<{
    panel_id: string;
    pack: string;
    preset_key: string;
    role_id: string;
    enabled: boolean;
  }>(
    `SELECT m.panel_id::text, m.pack, m.preset_key, m.role_id::text, m.enabled
     FROM role_panel_preset_mappings m
     JOIN role_panels p ON p.id = m.panel_id
     WHERE p.guild_id = $1`,
    [params.guildId]
  );

  return NextResponse.json({ catalog: catalog.rows, mappings: mappings.rows });
}
