import { getWebConfig } from "./config";

interface DiscordMemberResponse {
  roles?: string[];
}

const config = getWebConfig();

export async function fetchGuildMemberRoles(discordUserId: string): Promise<string[]> {
  const response = await fetch(
    `https://discord.com/api/v10/guilds/${config.discordGuildId}/members/${discordUserId}`,
    {
      headers: {
        Authorization: `Bot ${config.discordBotToken}`,
      },
      cache: "no-store",
    }
  );

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord member lookup failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as DiscordMemberResponse;
  return data.roles ?? [];
}

export function hasAnyRequiredRole(memberRoles: string[], requiredRoleIds: string[]): boolean {
  if (requiredRoleIds.length === 0) {
    return true;
  }

  const roleSet = new Set(memberRoles);
  return requiredRoleIds.some((roleId) => roleSet.has(roleId));
}
