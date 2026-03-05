import { pool } from "./db";
import { auth } from "../auth";

export { auth };

export interface AuthenticatedUser {
  session: {
    user: {
      id: string;
    };
  } & Record<string, unknown>;
  discordUserId: string;
}

async function loadDiscordAccountIdForUser(userId: string): Promise<string | null> {
  try {
    const result = await pool.query<{ accountId: string }>(
      `SELECT "accountId" FROM account WHERE "userId" = $1 AND "providerId" = 'discord' LIMIT 1`,
      [userId]
    );
    if (result.rows[0]?.accountId) {
      return result.rows[0].accountId;
    }
  } catch {
    // Supports snake_case schema variants.
  }

  try {
    const result = await pool.query<{ account_id: string }>(
      `SELECT account_id FROM account WHERE user_id = $1 AND provider_id = 'discord' LIMIT 1`,
      [userId]
    );
    if (result.rows[0]?.account_id) {
      return result.rows[0].account_id;
    }
  } catch {
    return null;
  }

  return null;
}

export async function getAuthenticatedUser(requestHeaders: Headers): Promise<AuthenticatedUser | null> {
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });

  if (!session) {
    return null;
  }

  const discordAccountId = await loadDiscordAccountIdForUser(session.user.id);
  return {
    session,
    discordUserId: discordAccountId ?? session.user.id,
  };
}
