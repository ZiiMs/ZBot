import { describe, expect, test } from "bun:test";
import { buildCharacterEmbed, buildUnavailableEmbed } from "../src/embed.js";

describe("buildCharacterEmbed", () => {
  test("splits current and previous into separate raid and m+ sections", () => {
    const embed = buildCharacterEmbed(
      {
        name: "Ziims",
        region: "us",
        realm: "Hyjal",
        profileUrl: "https://raider.io/characters/us/hyjal/Ziims",
        raidTiers: [
          {
            slug: "tier-current",
            label: "Current Tier",
            normal: "N/A",
            heroic: "N/A",
            mythic: "N/A",
            totalBosses: 8,
            hasExperience: false,
          },
          {
            slug: "tier-prev-1",
            label: "Previous Tier 1",
            normal: "N/A",
            heroic: "N/A",
            mythic: "N/A",
            totalBosses: 8,
            hasExperience: false,
          },
          {
            slug: "tier-prev-2",
            label: "Previous Tier 2",
            normal: "8/8",
            heroic: "6/8",
            mythic: "2/8",
            totalBosses: 8,
            hasExperience: true,
          },
          {
            slug: "tier-prev-3",
            label: "Previous Tier 3",
            normal: "N/A",
            heroic: "N/A",
            mythic: "N/A",
            totalBosses: 8,
            hasExperience: false,
          },
        ],
        mythicPlusSeasons: [
          { slug: "season-current", label: "Season Current", score: null },
          { slug: "season-prev-1", label: "Season Prev 1", score: 2400.6 },
          { slug: "season-prev-2", label: "Season Prev 2", score: null },
          { slug: "season-prev-3", label: "Season Prev 3", score: null },
        ],
      }
    ).toJSON();

    expect(embed.fields?.map((field) => field.name)).toEqual([
      "Raid Experience",
      "Current",
      "Previous (Last 3)",
      "Mythic+ Score",
      "Current",
      "Previous (Last 3)",
    ]);

    const raidHeader = embed.fields?.[0];
    const currentRaid = embed.fields?.[1];
    const previousRaid = embed.fields?.[2];
    const mplusHeader = embed.fields?.[3];
    const currentMplus = embed.fields?.[4];
    const previousMplus = embed.fields?.[5];

    expect(raidHeader?.value).toBe("\u200B");
    expect(currentRaid?.value).toContain("Current Tier: N/A");
    expect(previousRaid?.value).toContain("Previous 2 (Previous Tier 2): N 8/8 | H 6/8 | M 2/8");
    expect(mplusHeader?.value).toBe("\u200B");
    expect(currentMplus?.value).toBe("Season Current: N/A");
    expect(previousMplus?.value).toContain("Previous 1 (Season Prev 1): 2400.6");
  });
});

describe("buildUnavailableEmbed", () => {
  test("uses same current/previous section structure", () => {
    const embed = buildUnavailableEmbed(
      {
        rawMatch: "https://raider.io/characters/us/hyjal/Ziims",
        cleanedUrl: "https://raider.io/characters/us/hyjal/Ziims",
        region: "us",
        realm: "hyjal",
        name: "Ziims",
      },
      "error"
    ).toJSON();

    expect(embed.fields?.map((field) => field.name)).toEqual([
      "Raid Experience",
      "Current",
      "Previous (Last 3)",
      "Mythic+ Score",
      "Current",
      "Previous (Last 3)",
      "Notes",
    ]);
  });
});
