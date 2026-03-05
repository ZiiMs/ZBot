import "./globals.css";
import Link from "next/link";

import { getSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <html lang="en" className="dark">
      <body>
        <main className="mx-auto min-h-screen w-full max-w-6xl p-4 md:p-8">
          <Card className="rounded-none border-2 border-border">
            <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="text-lg font-bold tracking-tight">ZBot Control</p>
                <p className="text-sm text-muted-foreground">Install and configure your Discord bot.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link className={cn(buttonVariants({ variant: "secondary" }), "rounded-none")} href="/setup">
                  Setup
                </Link>
                {session ? (
                  <form action="/api/auth/logout" method="post">
                    <Button type="submit" className="rounded-none">
                      Logout
                    </Button>
                  </form>
                ) : (
                  <Link className={cn(buttonVariants({ variant: "default" }), "rounded-none")} href="/api/auth/login">
                    Login with Discord
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>

          <section className="mt-4 space-y-4">{children}</section>
        </main>
      </body>
    </html>
  );
}
