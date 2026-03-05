import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  await auth.api.signOut({
    headers: req.headers
  });
  return NextResponse.redirect(new URL("/setup", req.url));
}
