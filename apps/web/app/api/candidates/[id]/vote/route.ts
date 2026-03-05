import { castVote } from "@/lib/recruitment";
import { resolvePermissionContext } from "@/lib/permissions";

interface VoteBody {
  vote?: string;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const permission = await resolvePermissionContext(request.headers);
  if (!permission) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  if (!permission.canVote) {
    return Response.json({ error: "Insufficient voting permissions." }, { status: 403 });
  }

  const body = (await request.json()) as VoteBody;
  if (!body.vote) {
    return Response.json({ error: "Vote is required." }, { status: 400 });
  }

  const { id } = await context.params;

  try {
    await castVote(id, permission.discordUserId, body.vote);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cast vote.";
    return Response.json({ error: message }, { status: 400 });
  }
}
