import { afterEach, describe, expect, test } from "bun:test";
import { buildRecruitmentIntakePayload, sendRecruitmentIntake } from "../src/recruitment-intake.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("buildRecruitmentIntakePayload", () => {
  test("prefers forwarded message snapshot markdown", () => {
    const payload = buildRecruitmentIntakePayload({
      guildId: "123",
      channelId: "456",
      id: "789",
      url: "https://discord.com/channels/123/456/789",
      author: { id: "999" },
      content: "live text",
      embeds: [],
      messageSnapshots: new Map([
        [
          "snap",
          {
            content: "Forwarded content",
            embeds: [{ description: "Embedded details" }],
          },
        ],
      ]),
      createdTimestamp: 1730000000000,
    });

    expect(payload).not.toBeNull();
    expect(payload?.forwardedMarkdown).toContain("Forwarded content");
    expect(payload?.forwardedMarkdown).toContain("Embedded details");
    expect(payload?.forwardedMarkdown).not.toBe("live text");
  });

  test("returns null when no forwarded snapshot exists", () => {
    const payload = buildRecruitmentIntakePayload({
      guildId: "123",
      channelId: "456",
      id: "789",
      url: "https://discord.com/channels/123/456/789",
      author: { id: "999" },
      content: "Normal message markdown",
      embeds: [],
      messageSnapshots: new Map(),
      createdTimestamp: 1730000000000,
    });

    expect(payload).toBeNull();
  });
});

describe("sendRecruitmentIntake", () => {
  test("accepts 409 as idempotent duplicate", async () => {
    globalThis.fetch = ((async () =>
      new Response("duplicate", {
        status: 409,
      })) as unknown) as typeof fetch;

    await expect(
      sendRecruitmentIntake("https://example.test/intake", "secret", {
        guildId: "1",
        channelId: "2",
        messageId: "3",
        messageUrl: "https://discord.com/channels/1/2/3",
        authorDiscordId: "4",
        forwardedMarkdown: "hello",
        capturedAt: new Date().toISOString(),
      })
    ).resolves.toBeUndefined();
  });
});
