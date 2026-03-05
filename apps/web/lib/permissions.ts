import { getWebConfig } from "./config";
import { fetchGuildMemberRoles, hasAnyRequiredRole } from "./discord";
import { getAuthenticatedUser } from "./auth";

const config = getWebConfig();

export interface PermissionContext {
  discordUserId: string;
  canVote: boolean;
  canModerate: boolean;
}

export async function resolvePermissionContext(headers: Headers): Promise<PermissionContext | null> {
  const authUser = await getAuthenticatedUser(headers);
  if (!authUser) {
    return null;
  }

  const roles = await fetchGuildMemberRoles(authUser.discordUserId);

  const canVote = hasAnyRequiredRole(roles, config.voterRoleIds);
  const canModerate = hasAnyRequiredRole(roles, config.moderatorRoleIds);

  return {
    discordUserId: authUser.discordUserId,
    canVote,
    canModerate,
  };
}
