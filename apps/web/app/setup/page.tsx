import Link from "next/link";

import { db } from "@/lib/db";
import { getManageableGuilds } from "@/lib/discord";
import { cn } from "@/lib/utils";
import { getSession } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default async function SetupPage() {
  const session = await getSession();

  if (!session) {
    return (
      <Card className="rounded-none border-2 border-border">
        <CardHeader>
          <CardTitle>First Launch Setup</CardTitle>
          <CardDescription>
            Sign in with Discord to list your servers and generate invite links.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link className={cn(buttonVariants({ variant: "default" }), "rounded-none")} href="/api/auth/login">
            Login with Discord
          </Link>
        </CardContent>
      </Card>
    );
  }

  const guilds = await getManageableGuilds(session.access_token);
  const installedRows = await db.query<{ guild_id: string }>(
    "SELECT guild_id::text FROM guild_installations"
  );
  const installedSet = new Set(installedRows.rows.map((row) => row.guild_id));

  return (
    <>
      <Card className="rounded-none border-2 border-border">
        <CardHeader>
          <CardTitle>Invite and Server Setup</CardTitle>
          <CardDescription>Select a server, invite the bot, then verify installation.</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {guilds.map((guild) => {
          const installed = installedSet.has(guild.id);
          return (
            <Card key={guild.id} className="rounded-none border-2 border-border">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg">{guild.name}</CardTitle>
                  <Badge variant={installed ? "secondary" : "outline"} className="rounded-none uppercase">
                    {installed ? "Installed" : "Not installed"}
                  </Badge>
                </div>
                <Separator />
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <a
                    className={cn(buttonVariants({ variant: "default" }), "rounded-none")}
                    href={`/api/guilds/${guild.id}/invite-url`}
                  >
                    Invite Bot
                  </a>
                  <form action={`/api/guilds/${guild.id}/verify-installation`} method="post">
                    <button className={cn(buttonVariants({ variant: "outline" }), "rounded-none")} type="submit">
                      Verify
                    </button>
                  </form>
                </div>
                <Link
                  className={cn(buttonVariants({ variant: "secondary" }), "rounded-none")}
                  href={`/guilds/${guild.id}/roles`}
                >
                  Configure Auto React Roles
                </Link>
                <Link
                  className={cn(buttonVariants({ variant: "outline" }), "rounded-none")}
                  href={`/guilds/${guild.id}/welcome`}
                >
                  Configure Welcome Messages
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
