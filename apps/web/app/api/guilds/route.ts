import { NextResponse } from "next/server";
import { getManageableGuilds } from "@/lib/discord";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const guilds = await getManageableGuilds(session.access_token);
  return NextResponse.json({ guilds });
}
