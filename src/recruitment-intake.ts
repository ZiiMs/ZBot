export interface DiscordSnapshotEmbedLike {
  description: string | null;
}

export interface DiscordSnapshotLike {
  content: string;
  embeds: DiscordSnapshotEmbedLike[];
}

export interface DiscordMessageLike {
  guildId: string | null;
  channelId: string;
  id: string;
  url: string;
  author: {
    id: string;
  };
  content: string;
  embeds: DiscordSnapshotEmbedLike[];
  messageSnapshots: Map<string, DiscordSnapshotLike>;
  createdTimestamp: number;
}

export interface RecruitmentIntakePayload {
  guildId: string;
  channelId: string;
  messageId: string;
  messageUrl: string;
  authorDiscordId: string;
  forwardedMarkdown: string;
  capturedAt: string;
}

function collectSnapshotText(message: DiscordMessageLike): string {
  const blocks: string[] = [];

  for (const snapshot of message.messageSnapshots.values()) {
    if (snapshot.content?.trim()) {
      blocks.push(snapshot.content.trim());
    }

    for (const embed of snapshot.embeds) {
      if (embed.description?.trim()) {
        blocks.push(embed.description.trim());
      }
    }
  }

  return blocks.join("\n\n").trim();
}

export function buildRecruitmentIntakePayload(
  message: DiscordMessageLike
): RecruitmentIntakePayload | null {
  const guildId = message.guildId?.trim();
  if (!guildId) return null;

  const forwardedMarkdown = collectSnapshotText(message);
  if (!forwardedMarkdown) return null;

  return {
    guildId,
    channelId: message.channelId,
    messageId: message.id,
    messageUrl: message.url,
    authorDiscordId: message.author.id,
    forwardedMarkdown,
    capturedAt: new Date(message.createdTimestamp).toISOString(),
  };
}

export async function sendRecruitmentIntake(
  intakeUrl: string,
  apiToken: string,
  payload: RecruitmentIntakePayload
): Promise<void> {
  const response = await fetch(intakeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok && response.status !== 409) {
    const body = await response.text();
    throw new Error(`Recruitment intake failed (${response.status}): ${body}`);
  }
}
