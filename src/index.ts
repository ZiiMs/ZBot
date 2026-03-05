import { Client, GatewayIntentBits } from "discord.js";
import { getConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { buildRecruitmentIntakePayload, sendRecruitmentIntake } from "./recruitment-intake.js";

async function main(): Promise<void> {
  const config = getConfig();
  const logger = createLogger(config.logLevel);

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  });

  client.once("clientReady", () => {
    logger.info(`Bot online as ${client.user?.tag ?? "unknown"}`);
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (message.channelId !== config.discordTargetChannelId) return;

    const intakePayload = buildRecruitmentIntakePayload(message);
    if (intakePayload && intakePayload.guildId === config.discordGuildId) {
      try {
        await sendRecruitmentIntake(config.recruitmentIntakeUrl, config.recruitmentApiToken, intakePayload);
      } catch (error) {
        logger.warn("Failed to send recruitment intake payload", {
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });

  await client.login(config.discordBotToken);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Used disallowed intents")) {
    console.error(
      "[FATAL] Discord rejected privileged intents. In Discord Developer Portal, open your application -> Bot -> Privileged Gateway Intents and enable Message Content Intent, then restart the bot."
    );
  }
  console.error("[FATAL] Bot failed to start:", error);
  process.exit(1);
});
