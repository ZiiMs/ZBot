import { describe, expect, test } from "bun:test";
import { extractRaiderIoLinks, stripRaiderIoLinksFromText } from "../src/url-parser.js";

describe("extractRaiderIoLinks", () => {
  test("extracts multiple links in order", () => {
    const input =
      "Hes okay https://raider.io/characters/us/hyjal/Ziims and buddy https://raider.io/characters/eu/tarren-mill/Friend";

    const links = extractRaiderIoLinks(input);
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({ region: "us", realm: "hyjal", name: "Ziims" });
    expect(links[1]).toMatchObject({ region: "eu", realm: "tarren-mill", name: "Friend" });
  });

  test("handles punctuation attached to url", () => {
    const input = "Check this out (https://raider.io/characters/us/hyjal/Ziims).";
    const links = extractRaiderIoLinks(input);
    expect(links).toHaveLength(1);
    expect(links[0].cleanedUrl).toBe("https://raider.io/characters/us/hyjal/Ziims");
  });
});

describe("stripRaiderIoLinksFromText", () => {
  test("removes all matched urls and compacts whitespace", () => {
    const input = "Hes okay and looking for guilds https://raider.io/characters/us/hyjal/Ziims";
    const links = extractRaiderIoLinks(input);
    const cleaned = stripRaiderIoLinksFromText(input, links);
    expect(cleaned).toBe("Hes okay and looking for guilds");
  });
});
