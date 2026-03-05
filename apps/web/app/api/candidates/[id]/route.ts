import { resolvePermissionContext } from "@/lib/permissions";
import { deleteCandidate } from "@/lib/recruitment";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const permission = await resolvePermissionContext(request.headers);
  if (!permission) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  if (!permission.canModerate) {
    return Response.json({ error: "Insufficient moderator permissions." }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    await deleteCandidate(id);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete candidate.";
    return Response.json({ error: message }, { status: 400 });
  }
}
