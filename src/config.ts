type LogLevel = "debug" | "info" | "warn" | "error";

export interface AppConfig {
  discordBotToken: string;
  discordTargetChannelId: string;
  raiderIoAccessKey?: string;
  logLevel: LogLevel;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function parseLogLevel(value: string | undefined): LogLevel {
  const normalized = value?.toLowerCase();
  switch (normalized) {
    case "debug":
    case "info":
    case "warn":
    case "error":
      return normalized;
    default:
      return "info";
  }
}

export function getConfig(): AppConfig {
  return {
    discordBotToken: requireEnv("DISCORD_BOT_TOKEN"),
    discordTargetChannelId: requireEnv("DISCORD_TARGET_CHANNEL_ID"),
    raiderIoAccessKey: process.env.RAIDERIO_ACCESS_KEY?.trim() || undefined,
    logLevel: parseLogLevel(process.env.LOG_LEVEL),
  };
}
