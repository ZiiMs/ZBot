export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  databaseUrl: requiredEnv("DATABASE_URL"),
  discordClientId: requiredEnv("DISCORD_CLIENT_ID"),
  discordClientSecret: requiredEnv("DISCORD_CLIENT_SECRET"),
  botClientId: requiredEnv("BOT_CLIENT_ID"),
  botRedirectUri: process.env.BOT_REDIRECT_URI,
  botRequiredPermissions: process.env.BOT_REQUIRED_PERMISSIONS ?? "268435456",
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000"
};
