import { Client, GatewayIntentBits } from "discord.js";
import { getConfig } from "./config.js";
import { buildCharacterEmbed, buildUnavailableEmbed } from "./embed.js";
import { createLogger } from "./logger.js";
import { fetchCharacterSummary } from "./raiderio.js";
import { extractRaiderIoLinks, stripRaiderIoLinksFromText } from "./url-parser.js";

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

    const links = extractRaiderIoLinks(message.content);
    if (links.length === 0) return;

    logger.info(
      `Processing ${links.length} Raider.IO link(s) from message ${message.id} in channel ${message.channelId}`
    );

    const descriptionText = stripRaiderIoLinksFromText(message.content, links);

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
        const embed = buildCharacterEmbed(summary, descriptionText);
        if (summary.thumbnailUrl) {
          embed.setThumbnail(summary.thumbnailUrl);
        }
        await message.channel.send({ embeds: [embed] });
      } catch (error) {
        logger.warn("Failed to fetch character summary", {
          link: link.cleanedUrl,
          error: error instanceof Error ? error.message : String(error),
        });

        const fallback = buildUnavailableEmbed(
          link,
          descriptionText,
          "Unable to retrieve Raider.IO data right now."
        );
        await message.channel.send({ embeds: [fallback] });
      }
    }

    try {
      await message.delete();
    } catch (error) {
      logger.warn(
        `Could not delete source message ${message.id}. Ensure the bot has Manage Messages permission.`,
        error
      );
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
