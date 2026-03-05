import { resolvePermissionContext } from "@/lib/permissions";
import { restartVoting } from "@/lib/recruitment";

interface RestartBody {
  reason?: string;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const permission = await resolvePermissionContext(request.headers);
  if (!permission) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  if (!permission.canModerate) {
    return Response.json({ error: "Insufficient moderator permissions." }, { status: 403 });
  }

  const body = (await request.json()) as RestartBody;
  const { id } = await context.params;

  try {
    await restartVoting(id, permission.discordUserId, body.reason);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to restart voting.";
    return Response.json({ error: message }, { status: 400 });
  }
}
