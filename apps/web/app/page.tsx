import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { canAccessBoard } from "@/lib/access";
import { resolvePermissionContext } from "@/lib/permissions";
import { listCandidates } from "@/lib/recruitment";
import { BoardClient } from "./board-client";

export default async function HomePage() {
  const headerStore = await headers();
  const permission = await resolvePermissionContext(new Headers(headerStore));

  if (!permission) {
    redirect("/sign-in?callbackURL=%2F");
  }

  if (!canAccessBoard(permission)) {
    return (
      <main>
        <p className="notice">You are authenticated, but your Discord roles do not grant board access.</p>
      </main>
    );
  }

  const initialCandidates = await listCandidates();

  return (
    <BoardClient
      discordUserId={permission.discordUserId}
      canVote={permission.canVote}
      canModerate={permission.canModerate}
      initialCandidates={initialCandidates}
    />
  );
}
