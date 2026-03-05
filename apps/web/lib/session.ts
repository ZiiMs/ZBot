import crypto from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { config } from "@/lib/config";

const COOKIE_NAME = "zbot_session";

type SessionRecord = {
  session_id: string;
  user_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
};

function sign(value: string): string {
  return crypto
    .createHmac("sha256", config.sessionSecret)
    .update(value)
    .digest("hex");
}

function encodeCookie(sessionId: string): string {
  return `${sessionId}.${sign(sessionId)}`;
}

function decodeCookie(raw: string | undefined): string | null {
  if (!raw) return null;
  const [sessionId, signature] = raw.split(".");
  if (!sessionId || !signature) return null;
  return sign(sessionId) === signature ? sessionId : null;
}

export async function createSession(input: {
  userId: string;
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds: number;
}): Promise<void> {
  const sessionId = crypto.randomUUID();
  await db.query(
    `INSERT INTO oauth_sessions
     (session_id, user_id, access_token, refresh_token, expires_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW() + ($5 || ' seconds')::interval, NOW(), NOW())`,
    [
      sessionId,
      input.userId,
      input.accessToken,
      input.refreshToken ?? null,
      input.expiresInSeconds.toString()
    ]
  );

  cookies().set(COOKIE_NAME, encodeCookie(sessionId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });
}

export async function getSession(): Promise<SessionRecord | null> {
  const sessionId = decodeCookie(cookies().get(COOKIE_NAME)?.value);
  if (!sessionId) return null;

  const { rows } = await db.query<SessionRecord>(
    `SELECT session_id, user_id, access_token, refresh_token, expires_at
     FROM oauth_sessions
     WHERE session_id = $1 AND expires_at > NOW()`,
    [sessionId]
  );
  return rows[0] ?? null;
}

export async function destroySession(): Promise<void> {
  const sessionId = decodeCookie(cookies().get(COOKIE_NAME)?.value);
  if (sessionId) {
    await db.query("DELETE FROM oauth_sessions WHERE session_id = $1", [sessionId]);
  }
  cookies().delete(COOKIE_NAME);
}
