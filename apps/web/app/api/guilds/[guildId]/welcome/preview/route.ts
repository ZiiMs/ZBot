import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { DEFAULT_WELCOME_TEMPLATE, renderWelcomeTemplate } from "@/lib/welcome";

const DISCORD_API = "https://discord.com/api/v10";

async function getCurrentDiscordUser(accessToken: string): Promise<{
  id: string;
  username: string;
}> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  if (!res.ok) {
    throw new Error("discord_user_fetch_failed");
  }
  return (await res.json()) as { id: string; username: string };
}

async function getGuildName(accessToken: string, guildId: string): Promise<string | null> {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  if (!res.ok) {
    return null;
  }

  const guilds = (await res.json()) as Array<{ id: string; name: string }>;
  const guild = guilds.find((item) => item.id === guildId);
  return guild?.name ?? null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { guildId: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const template =
    typeof body.template === "string" && body.template.trim().length > 0
      ? body.template
      : DEFAULT_WELCOME_TEMPLATE;

  let userName = "NewUser";
  let mention = "@NewUser";
  try {
    const user = await getCurrentDiscordUser(session.access_token);
    userName = user.username;
    mention = `<@${user.id}>`;
  } catch {
    // preview still works with defaults
  }

  let serverName = `Guild ${params.guildId}`;
  try {
    const guildName = await getGuildName(session.access_token, params.guildId);
    if (guildName) {
      serverName = guildName;
    }
  } catch {
    // preview still works with defaults
  }

  const preview = renderWelcomeTemplate(template, {
    user: userName,
    server: serverName,
    mention
  });

  return NextResponse.json(preview);
}
