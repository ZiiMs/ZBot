import { randomUUID } from "crypto";
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

  const form = await req.formData();
  const catalog = await db.query<{
    pack: string;
    key: string;
  }>("SELECT pack, key FROM wow_preset_catalog");

  await db.query("BEGIN");
  try {
    for (const preset of catalog.rows) {
      const roleField = `role_${preset.pack}_${preset.key}`;
      const enabledField = `enabled_${preset.pack}_${preset.key}`;
      const roleIdRaw = String(form.get(roleField) ?? "").trim();
      const enabled = form.get(enabledField) === "on";

      if (!roleIdRaw) {
        await db.query(
          "DELETE FROM role_panel_preset_mappings WHERE panel_id = $1 AND pack = $2 AND preset_key = $3",
          [params.panelId, preset.pack, preset.key]
        );
        continue;
      }

      await db.query(
        `INSERT INTO role_panel_preset_mappings (id, panel_id, pack, preset_key, role_id, enabled, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT (panel_id, pack, preset_key)
         DO UPDATE SET role_id = EXCLUDED.role_id, enabled = EXCLUDED.enabled, updated_at = NOW()`,
        [
          randomUUID(),
          params.panelId,
          preset.pack,
          preset.key,
          roleIdRaw,
          enabled
        ]
      );
    }

    await db.query(
      "UPDATE role_panels SET sync_state = 'pending', updated_at = NOW() WHERE id = $1 AND guild_id = $2",
      [params.panelId, params.guildId]
    );

    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }

  return NextResponse.redirect(
    new URL(`/guilds/${params.guildId}/roles?mapped=1`, req.url)
  );
}
