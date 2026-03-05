import type { PermissionContext } from "./permissions";

export function canAccessBoard(permission: PermissionContext | null): boolean {
  if (!permission) {
    return false;
  }
  return permission.canVote || permission.canModerate;
}
