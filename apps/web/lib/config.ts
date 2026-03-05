function readEnv(name: string, fallback = ""): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    return fallback;
  }
  return value.trim();
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function parseIdList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export interface WebConfig {
  databaseUrl: string;
  betterAuthSecret: string;
  betterAuthUrl: string;
  discordClientId?: string;
  discordClientSecret?: string;
  discordGuildId: string;
  discordBotToken: string;
  recruitmentApiToken: string;
  voterRoleIds: string[];
  moderatorRoleIds: string[];
}

let cachedConfig: WebConfig | null = null;

export function getWebConfig(): WebConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  cachedConfig = {
    databaseUrl: requireEnv("DATABASE_URL"),
    betterAuthSecret: requireEnv("BETTER_AUTH_SECRET"),
    betterAuthUrl: readEnv("BETTER_AUTH_URL", "http://localhost:3000"),
    discordClientId: readEnv("DISCORD_CLIENT_ID") || undefined,
    discordClientSecret: readEnv("DISCORD_CLIENT_SECRET") || undefined,
    discordGuildId: requireEnv("DISCORD_GUILD_ID"),
    discordBotToken: requireEnv("DISCORD_BOT_TOKEN"),
    recruitmentApiToken: requireEnv("RECRUITMENT_API_TOKEN"),
    voterRoleIds: parseIdList(process.env.VOTER_ROLE_IDS),
    moderatorRoleIds: parseIdList(process.env.MODERATOR_ROLE_IDS),
  };

  return cachedConfig;
}
