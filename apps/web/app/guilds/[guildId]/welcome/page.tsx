import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { getGuildSelectableChannels } from "@/lib/discord";
import { getSession } from "@/lib/session";
import { DEFAULT_WELCOME_TEMPLATE } from "@/lib/welcome";

import { WelcomeConfigForm } from "./welcome-config-form";

type PageProps = {
  params: { guildId: string };
};

export default async function GuildWelcomePage({ params }: PageProps) {
  const session = await getSession();
  if (!session) {
    redirect("/setup");
  }

  const [configRows, channels] = await Promise.all([
    db.query<{
      enabled: boolean;
      channel_id: string | null;
      template: string;
    }>(
      `SELECT enabled, channel_id::text, template
       FROM welcome_configs
       WHERE guild_id = $1`,
      [params.guildId]
    ),
    getGuildSelectableChannels(params.guildId)
  ]);

  const config = configRows.rows[0] ?? {
    enabled: false,
    channel_id: null,
    template: DEFAULT_WELCOME_TEMPLATE
  };

  return (
    <>
      <Card className="rounded-none border-2 border-border">
        <CardHeader>
          <CardTitle>Welcome Messages</CardTitle>
          <CardDescription>
            Configure join welcome messages for guild <strong>{params.guildId}</strong>.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="rounded-none border-2 border-border">
        <CardContent className="pt-6">
          <WelcomeConfigForm
            guildId={params.guildId}
            channels={channels}
            initialConfig={{
              enabled: config.enabled,
              channelId: config.channel_id,
              template: config.template
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
