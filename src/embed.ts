import { EmbedBuilder } from "discord.js";
import type { CharacterSummary } from "./raiderio.js";
import type { RaiderIoLink } from "./url-parser.js";

function formatScore(score: number | null): string {
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return "N/A";
  }
  return score.toFixed(1);
}

function formatTierLabel(tierSlug: string | null): string {
  if (!tierSlug) {
    return "Previous Tier";
  }
  return `Previous Tier (${tierSlug})`;
}

export function buildCharacterEmbed(character: CharacterSummary, descriptionText: string): EmbedBuilder {
  const displayDescription =
    descriptionText.length > 0 ? descriptionText : "No additional context provided.";

  return new EmbedBuilder()
    .setColor(0xff7a00)
    .setTitle(`${character.name} - ${character.realm} (${character.region.toUpperCase()})`)
    .setURL(character.profileUrl)
    .setDescription(displayDescription)
    .addFields(
      {
        name: formatTierLabel(character.raid.tierSlug),
        value: `Normal: ${character.raid.normal}\nHeroic: ${character.raid.heroic}\nMythic: ${character.raid.mythic}`,
        inline: true,
      },
      {
        name: "Mythic+ Score",
        value: `Current: ${formatScore(character.mythicPlus.current)}\nPrevious: ${formatScore(character.mythicPlus.previous)}`,
        inline: true,
      }
    )
    .setFooter({ text: "Data by Raider.IO" })
    .setTimestamp();
}

export function buildUnavailableEmbed(link: RaiderIoLink, descriptionText: string, reason: string): EmbedBuilder {
  const displayDescription =
    descriptionText.length > 0 ? descriptionText : "No additional context provided.";
  const profileUrl = `https://raider.io/characters/${encodeURIComponent(link.region)}/${encodeURIComponent(
    link.realm
  )}/${encodeURIComponent(link.name)}`;

  return new EmbedBuilder()
    .setColor(0xcf3a3a)
    .setTitle(`${link.name} - ${link.realm} (${link.region.toUpperCase()})`)
    .setURL(profileUrl)
    .setDescription(displayDescription)
    .addFields(
      {
        name: "Previous Tier",
        value: "Normal: N/A\nHeroic: N/A\nMythic: N/A",
        inline: true,
      },
      {
        name: "Mythic+ Score",
        value: "Current: N/A\nPrevious: N/A",
        inline: true,
      },
      {
        name: "Notes",
        value: reason,
        inline: false,
      }
    )
    .setFooter({ text: "Data by Raider.IO" })
    .setTimestamp();
}
