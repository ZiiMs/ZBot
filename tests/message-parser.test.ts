import { describe, expect, test } from "bun:test";
import { parseMessageInputFromSources } from "../src/message-parser.js";

describe("parseMessageInputFromSources", () => {
  test("extracts links and cleaned text from forwarded-style multiline content", () => {
    const source = `Number of People Looking:
Two
Raider.IO:
1: https://raider.io/characters/us/thunderhorn/Mebedir
2:
https://raider.io/characters/us/thunderhorn/Shulanii
Additional information:
Returning players`;

    const parsed = parseMessageInputFromSources([source]);
    expect(parsed.links).toHaveLength(2);
    expect(parsed.links[0]).toMatchObject({ region: "us", realm: "thunderhorn", name: "Mebedir" });
    expect(parsed.links[1]).toMatchObject({ region: "us", realm: "thunderhorn", name: "Shulanii" });
    expect(parsed.outboundText).toContain("Number of People Looking:");
    expect(parsed.outboundText).not.toContain("https://raider.io/characters");
  });

  test("prefers source containing links when choosing outbound text", () => {
    const parsed = parseMessageInputFromSources([
      "Forwarded message",
      "Looks good? https://raider.io/characters/us/hyjal/Ziims?tier=32",
    ]);

    expect(parsed.links).toHaveLength(1);
    expect(parsed.outboundText).toBe("Looks good?");
  });
});
