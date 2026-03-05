import { config } from "@/lib/config";
import type { DiscordGuild, DiscordGuildChannel, DiscordUser } from "@/types/discord";

const DISCORD_API = "https://discord.com/api/v10";

export function buildInviteUrl(guildId: string): string {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", config.botClientId);
  url.searchParams.set("scope", "bot applications.commands");
  url.searchParams.set("permissions", config.botRequiredPermissions);
  url.searchParams.set("guild_id", guildId);
  url.searchParams.set("disable_guild_select", "true");
  if (config.botRedirectUri) {
    url.searchParams.set("redirect_uri", config.botRedirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", guildId);
  }
  return url.toString();
}

export async function getCurrentUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    throw new Error("Failed to load Discord user");
  }
  return res.json();
}

export async function getManageableGuilds(accessToken: string): Promise<DiscordGuild[]> {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    throw new Error("Failed to load guilds");
  }

  const guilds = (await res.json()) as DiscordGuild[];
  const MANAGE_GUILD = BigInt(0x20);

  return guilds.filter((guild) => {
    const perms = BigInt(guild.permissions);
    return (perms & MANAGE_GUILD) === MANAGE_GUILD;
  });
}

export async function getGuildSelectableChannels(
  guildId: string
): Promise<DiscordGuildChannel[]> {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    console.warn("[discord] BOT_TOKEN missing for channel lookup");
    return [];
  }

  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
    headers: { Authorization: `Bot ${botToken}` },
    cache: "no-store"
  });

  if (!res.ok) {
    console.warn(
      `[discord] failed to fetch channels for guild ${guildId}: ${res.status}`
    );
    return [];
  }

  const channels = (await res.json()) as DiscordGuildChannel[];
  const allowedTypes = new Set([0, 5]);

  return channels
    .filter((channel) => allowedTypes.has(channel.type))
    .sort((a, b) => (a.position - b.position) || a.name.localeCompare(b.name));
}
