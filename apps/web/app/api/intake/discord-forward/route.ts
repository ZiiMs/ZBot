import { getWebConfig } from "@/lib/config";
import { createCandidateFromIntake } from "@/lib/recruitment";

interface IntakeRequestBody {
  guildId?: string;
  channelId?: string;
  messageId?: string;
  messageUrl?: string;
  authorDiscordId?: string;
  forwardedMarkdown?: string;
  capturedAt?: string;
}

const config = getWebConfig();

function unauthorized() {
  return Response.json({ error: "Unauthorized." }, { status: 401 });
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${config.recruitmentApiToken}`) {
    return unauthorized();
  }

  const body = (await request.json()) as IntakeRequestBody;
  if (
    !body.guildId ||
    !body.channelId ||
    !body.messageId ||
    !body.messageUrl ||
    !body.authorDiscordId ||
    !body.forwardedMarkdown ||
    !body.capturedAt
  ) {
    return Response.json({ error: "Invalid payload." }, { status: 400 });
  }

  if (body.guildId !== config.discordGuildId) {
    return Response.json({ error: "Guild mismatch." }, { status: 400 });
  }

  const result = await createCandidateFromIntake({
    guildId: body.guildId,
    channelId: body.channelId,
    messageId: body.messageId,
    messageUrl: body.messageUrl,
    authorDiscordId: body.authorDiscordId,
    forwardedMarkdown: body.forwardedMarkdown,
    capturedAt: body.capturedAt,
  });

  if (!result.created) {
    return Response.json({ id: result.id, duplicate: true }, { status: 409 });
  }

  return Response.json({ id: result.id }, { status: 201 });
}
