import { describe, expect, test } from "bun:test";
import { mapRaiderIoResponse } from "../src/raiderio.js";

const selection = {
  raidTiers: [
    { slug: "tier-mn-1", label: "MN Tier 1 (VS / DR / MQD)" },
    { slug: "manaforge-omega", label: "Manaforge Omega" },
    { slug: "liberation-of-undermine", label: "Liberation of Undermine" },
    { slug: "nerubar-palace", label: "Nerub-ar Palace" },
  ],
  mythicPlusSeasons: [
    { slug: "season-mn-1", label: "MN Season 1" },
    { slug: "season-tww-3", label: "TWW Season 3" },
    { slug: "season-tww-2", label: "TWW Season 2" },
    { slug: "season-tww-1", label: "TWW Season 1" },
  ],
};

describe("mapRaiderIoResponse", () => {
  test("maps raid progression and four seasonal scores", () => {
    const mapped = mapRaiderIoResponse(
      { region: "us", realm: "hyjal", name: "Ziims" },
      {
        name: "Ziims",
        region: "us",
        realm: "Hyjal",
        profile_url: "https://raider.io/characters/us/hyjal/Ziims",
        raid_progression: {
          "manaforge-omega": {
            total_bosses: 9,
            normal_bosses_killed: 9,
            heroic_bosses_killed: 6,
            mythic_bosses_killed: 2,
          },
          "liberation-of-undermine": {
            total_bosses: 8,
            normal_bosses_killed: 0,
            heroic_bosses_killed: 0,
            mythic_bosses_killed: 0,
          },
        },
        mythic_plus_scores_by_season: [
          { scores: { all: 0 } },
          { scores: { all: 3200.4 } },
          { scores: { all: 3011.2 } },
          { scores: { all: 2801.1 } },
        ],
      },
      selection
    );

    expect(mapped.raidTiers[0]).toMatchObject({
      slug: "tier-mn-1",
      normal: "N/A",
      heroic: "N/A",
      mythic: "N/A",
      hasExperience: false,
    });
    expect(mapped.raidTiers[1]).toMatchObject({
      slug: "manaforge-omega",
      normal: "9/9",
      heroic: "6/9",
      mythic: "2/9",
      hasExperience: true,
    });
    expect(mapped.raidTiers[2]).toMatchObject({
      slug: "liberation-of-undermine",
      normal: "N/A",
      heroic: "N/A",
      mythic: "N/A",
      hasExperience: false,
    });
    expect(mapped.mythicPlusSeasons[0].score).toBeNull();
    expect(mapped.mythicPlusSeasons[1].score).toBe(3200.4);
    expect(mapped.mythicPlusSeasons[2].score).toBe(3011.2);
    expect(mapped.mythicPlusSeasons[3].score).toBe(2801.1);
  });

  test("fills missing values with N/A/null", () => {
    const mapped = mapRaiderIoResponse(
      { region: "us", realm: "hyjal", name: "Ziims" },
      {
        name: "Ziims",
      },
      selection
    );

    expect(mapped.raidTiers).toHaveLength(4);
    expect(mapped.raidTiers.every((tier) => tier.hasExperience === false)).toBe(true);
    expect(mapped.mythicPlusSeasons).toHaveLength(4);
    expect(mapped.mythicPlusSeasons.every((season) => season.score === null)).toBe(true);
  });
});
