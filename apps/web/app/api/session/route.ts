import { resolvePermissionContext } from "@/lib/permissions";

export async function GET(request: Request) {
  const permission = await resolvePermissionContext(request.headers);
  if (!permission) {
    return Response.json({ authenticated: false }, { status: 200 });
  }

  return Response.json({
    authenticated: true,
    discordUserId: permission.discordUserId,
    canVote: permission.canVote,
    canModerate: permission.canModerate,
  });
}
