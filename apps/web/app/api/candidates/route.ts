import { canAccessBoard } from "@/lib/access";
import { resolvePermissionContext } from "@/lib/permissions";
import { listCandidates } from "@/lib/recruitment";

export async function GET(request: Request) {
  const permission = await resolvePermissionContext(request.headers);
  if (!canAccessBoard(permission)) {
    return Response.json({ error: "Authentication and role access required." }, { status: 403 });
  }

  const candidates = await listCandidates();
  return Response.json({ candidates });
}
