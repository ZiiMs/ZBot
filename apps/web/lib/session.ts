import { headers } from "next/headers";
import { auth } from "@/lib/auth";

type SessionRecord = {
  session_id: string;
  user_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
};

export async function getSession(): Promise<SessionRecord | null> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) {
    return null;
  }

  try {
    const token = await auth.api.getAccessToken({
      body: {
        providerId: "discord",
        userId: session.user.id
      },
      headers: requestHeaders
    });

    return {
      session_id: session.session.id,
      user_id: session.user.id,
      access_token: token.accessToken,
      refresh_token: null,
      expires_at: token.accessTokenExpiresAt
        ? token.accessTokenExpiresAt.toISOString()
        : session.session.expiresAt.toISOString()
    };
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  await auth.api.signOut({
    headers: await headers()
  });
}
