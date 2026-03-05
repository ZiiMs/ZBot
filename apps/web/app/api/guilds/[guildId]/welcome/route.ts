import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { DEFAULT_WELCOME_TEMPLATE } from "@/lib/welcome";

function parseBoolean(input: unknown): boolean {
  if (typeof input === "boolean") {
    return input;
  }
  if (typeof input === "string") {
    const lowered = input.toLowerCase();
    return lowered === "true" || lowered === "1" || lowered === "on";
  }
  return false;
}

function normalizeChannelId(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { guildId: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await db.query<{
    guild_id: string;
    enabled: boolean;
    channel_id: string | null;
    template: string;
  }>(
    `SELECT guild_id::text, enabled, channel_id::text, template
     FROM welcome_configs
     WHERE guild_id = $1`,
    [params.guildId]
  );

  const config =
    result.rows[0] ??
    ({
      guild_id: params.guildId,
      enabled: false,
      channel_id: null,
      template: DEFAULT_WELCOME_TEMPLATE
    } as const);

  return NextResponse.json({ config });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { guildId: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let enabled = false;
  let channelId: string | null = null;
  let template = DEFAULT_WELCOME_TEMPLATE;

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await req.json();
    enabled = parseBoolean(body.enabled);
    channelId = normalizeChannelId(body.channelId);
    if (typeof body.template === "string") {
      template = body.template.trim();
    }
  } else {
    const form = await req.formData();
    enabled = parseBoolean(form.get("enabled"));
    channelId = normalizeChannelId(String(form.get("channelId") ?? ""));
    template = String(form.get("template") ?? "").trim();
  }

  if (!template) {
    return NextResponse.json({ error: "template_required" }, { status: 400 });
  }

  if (enabled && !channelId) {
    return NextResponse.json({ error: "channel_required_when_enabled" }, { status: 400 });
  }

  await db.query(
    `INSERT INTO welcome_configs (guild_id, enabled, channel_id, template, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (guild_id)
     DO UPDATE SET
       enabled = EXCLUDED.enabled,
       channel_id = EXCLUDED.channel_id,
       template = EXCLUDED.template,
       updated_at = NOW()`,
    [params.guildId, enabled, channelId, template]
  );

  return NextResponse.json({
    config: {
      guild_id: params.guildId,
      enabled,
      channel_id: channelId,
      template
    }
  });
}
