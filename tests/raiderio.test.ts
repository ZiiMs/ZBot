import { describe, expect, test } from "bun:test";
import { mapRaiderIoResponse } from "../src/raiderio.js";

describe("mapRaiderIoResponse", () => {
  test("maps raid progression and seasonal scores", () => {
    const mapped = mapRaiderIoResponse(
      { region: "us", realm: "hyjal", name: "Ziims" },
      {
        name: "Ziims",
        region: "us",
        realm: "Hyjal",
        profile_url: "https://raider.io/characters/us/hyjal/Ziims",
        raid_progression: {
          "tier-mn-1": {
            total_bosses: 9,
            normal_bosses_killed: 9,
            heroic_bosses_killed: 6,
            mythic_bosses_killed: 2,
          },
        },
        mythic_plus_scores_by_season: [{ scores: { all: 3200.4 } }, { scores: { all: 3011.2 } }],
      }
    );

    expect(mapped.raid.normal).toBe("9/9");
    expect(mapped.raid.heroic).toBe("6/9");
    expect(mapped.raid.mythic).toBe("2/9");
    expect(mapped.mythicPlus.current).toBe(3200.4);
    expect(mapped.mythicPlus.previous).toBe(3011.2);
  });

  test("fills missing values with N/A/null", () => {
    const mapped = mapRaiderIoResponse(
      { region: "us", realm: "hyjal", name: "Ziims" },
      {
        name: "Ziims",
      }
    );

    expect(mapped.raid.normal).toBe("N/A");
    expect(mapped.raid.heroic).toBe("N/A");
    expect(mapped.raid.mythic).toBe("N/A");
    expect(mapped.mythicPlus.current).toBeNull();
    expect(mapped.mythicPlus.previous).toBeNull();
  });
});
