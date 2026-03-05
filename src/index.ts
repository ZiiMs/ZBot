import { Client, GatewayIntentBits } from "discord.js";
import { getConfig } from "./config.js";
import { buildCharacterEmbed, buildUnavailableEmbed } from "./embed.js";
import { createLogger } from "./logger.js";
import { parseMessageInputFromSources } from "./message-parser.js";
import { fetchCharacterSummary } from "./raiderio.js";
import { buildRecruitmentIntakePayload, sendRecruitmentIntake } from "./recruitment-intake.js";

function collectTextSourcesForParsing(message: {
  content: string;
  embeds: Array<{ description: string | null }>;
  messageSnapshots: Map<string, { content: string; embeds: Array<{ description: string | null }> }>;
}): string[] {
  const sources: string[] = [];

  if (message.content?.trim()) {
    sources.push(message.content);
  }

  for (const embed of message.embeds) {
    if (embed.description?.trim()) {
      sources.push(embed.description);
    }
  }

  for (const snapshot of message.messageSnapshots.values()) {
    if (snapshot.content?.trim()) {
      sources.push(snapshot.content);
    }
    for (const embed of snapshot.embeds) {
      if (embed.description?.trim()) {
        sources.push(embed.description);
      }
    }
  }

  return sources;
}

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

    const parsedInput = parseMessageInputFromSources(collectTextSourcesForParsing(message));
    const { links } = parsedInput;
    if (links.length === 0) return;

    logger.info(
      `Processing ${links.length} Raider.IO link(s) from message ${message.id} in channel ${message.channelId}`
    );

    const embeds = [];

    for (const link of links) {
      try {
        const summary = await fetchCharacterSummary(
          {
            region: link.region,
            realm: link.realm,
            name: link.name,
          },
          config.raiderIoAccessKey
        );
        const embed = buildCharacterEmbed(summary);
        if (summary.thumbnailUrl) {
          embed.setThumbnail(summary.thumbnailUrl);
        }
        embeds.push(embed);
      } catch (error) {
        logger.warn("Failed to fetch character summary", {
          link: link.cleanedUrl,
          error: error instanceof Error ? error.message : String(error),
        });

        const fallback = buildUnavailableEmbed(link, "Unable to retrieve Raider.IO data right now.");
        embeds.push(fallback);
      }
    }

    if (embeds.length > 0) {
      await message.channel.send({
        embeds,
      });
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
