import { EmbedBuilder } from "discord.js";
import type { CharacterSummary } from "./raiderio.js";
import type { RaiderIoLink } from "./url-parser.js";

function formatScore(score: number | null): string {
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return "N/A";
  }
  return score.toFixed(1);
}

function formatRaidTierLine(label: string, hasExperience: boolean, normal: string, heroic: string, mythic: string): string {
  if (!hasExperience) {
    return `${label}: N/A`;
  }
  return `${label}: N ${normal} | H ${heroic} | M ${mythic}`;
}

function buildPreviousRaidLines(character: CharacterSummary): string {
  const lines: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const tier = character.raidTiers[i];
    if (!tier) {
      lines.push(`Previous ${i}: N/A`);
      continue;
    }
    lines.push(
      formatRaidTierLine(`Previous ${i} (${tier.label})`, tier.hasExperience, tier.normal, tier.heroic, tier.mythic)
    );
  }
  return lines.join("\n");
}

function buildPreviousMplusLines(character: CharacterSummary): string {
  const lines: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const season = character.mythicPlusSeasons[i];
    if (!season) {
      lines.push(`Previous ${i}: N/A`);
      continue;
    }
    lines.push(`Previous ${i} (${season.label}): ${formatScore(season.score)}`);
  }
  return lines.join("\n");
}

export function buildCharacterEmbed(character: CharacterSummary): EmbedBuilder {
  const currentRaid = character.raidTiers[0];
  const currentMplus = character.mythicPlusSeasons[0];

  const raidCurrentLine = currentRaid
    ? formatRaidTierLine(
        `${currentRaid.label}`,
        currentRaid.hasExperience,
        currentRaid.normal,
        currentRaid.heroic,
        currentRaid.mythic
      )
    : "Current: N/A";

  const raidPreviousLines = buildPreviousRaidLines(character);

  const mplusCurrentLine = currentMplus
    ? `${currentMplus.label}: ${formatScore(currentMplus.score)}`
    : "Current: N/A";

  const mplusPreviousLines = buildPreviousMplusLines(character);

  return new EmbedBuilder()
    .setColor(0xff7a00)
    .setTitle(`${character.name} - ${character.realm} (${character.region.toUpperCase()})`)
    .setURL(character.profileUrl)
    .addFields(
      {
        name: "Raid Experience",
        value: "\u200B",
        inline: false,
      },
      {
        name: "Current",
        value: raidCurrentLine,
        inline: true,
      },
      {
        name: "Previous (Last 3)",
        value: raidPreviousLines,
        inline: true,
      },
      {
        name: "Mythic+ Score",
        value: "\u200B",
        inline: false,
      },
      {
        name: "Current",
        value: mplusCurrentLine,
        inline: true,
      },
      {
        name: "Previous (Last 3)",
        value: mplusPreviousLines,
        inline: true,
      },
    )
    .setFooter({ text: "Data by Raider.IO" })
    .setTimestamp();
}

export function buildUnavailableEmbed(link: RaiderIoLink, reason: string): EmbedBuilder {
  const profileUrl = `https://raider.io/characters/${encodeURIComponent(link.region)}/${encodeURIComponent(
    link.realm
  )}/${encodeURIComponent(link.name)}`;

  return new EmbedBuilder()
    .setColor(0xcf3a3a)
    .setTitle(`${link.name} - ${link.realm} (${link.region.toUpperCase()})`)
    .setURL(profileUrl)
    .addFields(
      {
        name: "Raid Experience",
        value: "\u200B",
        inline: false,
      },
      {
        name: "Current",
        value: "Current: N/A",
        inline: true,
      },
      {
        name: "Previous (Last 3)",
        value: "Previous 1: N/A\nPrevious 2: N/A\nPrevious 3: N/A",
        inline: true,
      },
      {
        name: "Mythic+ Score",
        value: "\u200B",
        inline: false,
      },
      {
        name: "Current",
        value: "Current: N/A",
        inline: true,
      },
      {
        name: "Previous (Last 3)",
        value: "Previous 1: N/A\nPrevious 2: N/A\nPrevious 3: N/A",
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
