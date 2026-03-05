import { NextRequest, NextResponse } from "next/server";
import { buildInviteUrl } from "@/lib/discord";
import { getSession } from "@/lib/session";

export async function GET(
  req: NextRequest,
  { params }: { params: { guildId: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/setup", req.url));
  }

  return NextResponse.redirect(buildInviteUrl(params.guildId));
}
