import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { guildId: string; panelId: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await db.query("DELETE FROM role_panels WHERE id = $1 AND guild_id = $2", [
    params.panelId,
    params.guildId
  ]);
  return NextResponse.json({ ok: true });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { guildId: string; panelId: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/setup", req.url));
  }

  const form = await req.formData();
  const method = String(form.get("_method") ?? "").toLowerCase();
  if (method === "delete") {
    await db.query("DELETE FROM role_panels WHERE id = $1 AND guild_id = $2", [
      params.panelId,
      params.guildId
    ]);
  }

  return NextResponse.redirect(new URL(`/guilds/${params.guildId}/roles?deleted=1`, req.url));
}
