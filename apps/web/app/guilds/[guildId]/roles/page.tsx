import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { getGuildSelectableChannels } from "@/lib/discord";
import { getSession } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type PageProps = {
  params: { guildId: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

type SyncState = "pending" | "synced" | "error";

const PACK_LABELS: Record<string, string> = {
  class: "Class",
  role: "Role",
  region: "Region"
};

function getParam(searchParams: PageProps["searchParams"], key: string): string | undefined {
  const value = searchParams?.[key];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function syncBadgeVariant(state: SyncState): "secondary" | "default" | "destructive" {
  if (state === "synced") {
    return "secondary";
  }
  if (state === "error") {
    return "destructive";
  }
  return "default";
}

export default async function GuildRolesPage({ params, searchParams }: PageProps) {
  const session = await getSession();
  if (!session) {
    redirect("/setup");
  }

  const [panels, catalog, mappings, channels] = await Promise.all([
    db.query<{
      id: string;
      title: string;
      description: string;
      channel_id: string;
      message_id: string | null;
      is_active: boolean;
      sync_state: SyncState;
      last_sync_error: string | null;
      last_synced_at: string | null;
    }>(
      `SELECT id::text,
              title,
              description,
              channel_id::text,
              message_id::text,
              is_active,
              sync_state,
              last_sync_error,
              COALESCE(to_char(last_synced_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), NULL) AS last_synced_at
       FROM role_panels
       WHERE guild_id = $1
       ORDER BY created_at DESC`,
      [params.guildId]
    ),
    db.query<{
      pack: string;
      key: string;
      label: string;
      emoji: string | null;
      sort_order: number;
    }>(
      `SELECT pack, key, label, emoji, sort_order
       FROM wow_preset_catalog
       ORDER BY pack, sort_order`
    ),
    db.query<{
      panel_id: string;
      pack: string;
      preset_key: string;
      role_id: string;
      enabled: boolean;
    }>(
      `SELECT panel_id::text, pack, preset_key, role_id::text, enabled
       FROM role_panel_preset_mappings
       WHERE panel_id IN (
         SELECT id FROM role_panels WHERE guild_id = $1
       )`,
      [params.guildId]
    ),
    getGuildSelectableChannels(params.guildId)
  ]);

  const flashCreated = getParam(searchParams, "created") === "1";
  const flashMapped = getParam(searchParams, "mapped") === "1";
  const flashPublished = getParam(searchParams, "publish") === "1";
  const flashDeleted = getParam(searchParams, "deleted") === "1";
  const flashValidation = getParam(searchParams, "error") === "validation";

  const catalogByPack = new Map<string, Array<(typeof catalog.rows)[number]>>();
  for (const row of catalog.rows) {
    const group = catalogByPack.get(row.pack) ?? [];
    group.push(row);
    catalogByPack.set(row.pack, group);
  }

  const mappingIndex = new Map<string, (typeof mappings.rows)[number]>();
  for (const row of mappings.rows) {
    mappingIndex.set(`${row.panel_id}:${row.pack}:${row.preset_key}`, row);
  }

  return (
    <>
      <Card className="rounded-none border-2 border-border">
        <CardHeader>
          <CardTitle>Auto React Roles</CardTitle>
          <CardDescription>
            Configure WoW preset dropdown mappings for guild <strong>{params.guildId}</strong>.
          </CardDescription>
        </CardHeader>
      </Card>

      {(flashCreated || flashMapped || flashPublished || flashDeleted || flashValidation) && (
        <Card className="rounded-none border-2 border-border">
          <CardContent className="pt-6 text-sm">
            {flashCreated && <p>Panel created.</p>}
            {flashMapped && <p>Preset mappings saved.</p>}
            {flashPublished && <p>Panel marked for publish sync.</p>}
            {flashDeleted && <p>Panel deleted.</p>}
            {flashValidation && <p>Missing required fields. Title, channel, and description are required.</p>}
          </CardContent>
        </Card>
      )}

      <Card className="rounded-none border-2 border-border">
        <CardHeader>
          <CardTitle className="text-lg">Create Panel</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={`/api/guilds/${params.guildId}/role-panels`} method="post" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" required placeholder="WoW Role Selection" className="rounded-none" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="channelId">Channel ID</Label>
                {channels.length > 0 ? (
                  <select
                    id="channelId"
                    name="channelId"
                    required
                    defaultValue=""
                    className="flex h-10 w-full rounded-none border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  >
                    <option value="" disabled>
                      Select a channel
                    </option>
                    {channels.map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        #{channel.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id="channelId"
                    name="channelId"
                    required
                    placeholder="1234567890"
                    className="rounded-none"
                  />
                )}
                {channels.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Channel list unavailable. Enter channel ID manually.
                  </p>
                )}
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  required
                  placeholder="Choose your class, role, and region from the dropdowns below."
                  className="rounded-none"
                />
              </div>
            </div>
            <Button type="submit" className="rounded-none">
              Create Role Panel
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {panels.rows.map((panel) => (
          <Card className="rounded-none border-2 border-border" key={panel.id}>
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-lg">{panel.title}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant={panel.is_active ? "secondary" : "outline"} className="rounded-none uppercase">
                    {panel.is_active ? "active" : "inactive"}
                  </Badge>
                  <Badge variant={syncBadgeVariant(panel.sync_state)} className="rounded-none uppercase">
                    sync {panel.sync_state}
                  </Badge>
                </div>
              </div>
              <Separator />
            </CardHeader>
            <CardContent className="space-y-5 text-sm">
              <div className="space-y-1 text-muted-foreground">
                <p>{panel.description}</p>
                <p>
                  Channel: <code>{panel.channel_id}</code> | Message: <code>{panel.message_id ?? "not posted"}</code>
                </p>
                {panel.last_synced_at && <p>Last synced: {panel.last_synced_at}</p>}
                {panel.last_sync_error && <p className="text-destructive">Last error: {panel.last_sync_error}</p>}
              </div>

              <form
                action={`/api/guilds/${params.guildId}/role-panels/${panel.id}/preset-mappings`}
                method="post"
                className="space-y-4"
              >
                {Array.from(catalogByPack.entries()).map(([pack, options]) => (
                  <div key={`${panel.id}:${pack}`} className="space-y-2 border-2 border-border p-3">
                    <h3 className="font-semibold uppercase tracking-wide">{PACK_LABELS[pack] ?? pack}</h3>
                    <div className="space-y-2">
                      {options.map((option) => {
                        const key = `${panel.id}:${option.pack}:${option.key}`;
                        const mapping = mappingIndex.get(key);
                        const roleField = `role_${option.pack}_${option.key}`;
                        const enabledField = `enabled_${option.pack}_${option.key}`;

                        return (
                          <div key={key} className="grid gap-2 border border-border p-2 md:grid-cols-[minmax(180px,220px)_1fr_auto]">
                            <Label htmlFor={`${panel.id}-${roleField}`} className="flex items-center gap-2 font-mono">
                              <span>{option.emoji ?? ""}</span>
                              <span>{option.label}</span>
                            </Label>
                            <Input
                              id={`${panel.id}-${roleField}`}
                              name={roleField}
                              defaultValue={mapping?.role_id ?? ""}
                              placeholder="Discord role ID"
                              className="rounded-none"
                            />
                            <Label className="flex items-center gap-2 whitespace-nowrap">
                              <input
                                type="checkbox"
                                name={enabledField}
                                defaultChecked={mapping?.enabled ?? false}
                                className="h-4 w-4 rounded-none border border-border bg-background"
                              />
                              Enabled
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <div className="flex flex-wrap gap-2">
                  <Button type="submit" className="rounded-none">
                    Save Preset Mappings
                  </Button>
                </div>
              </form>

              <div className="flex flex-wrap gap-2">
                <form action={`/api/guilds/${params.guildId}/role-panels/${panel.id}/publish`} method="post">
                  <Button type="submit" variant="secondary" className="rounded-none">
                    Publish / Resync Panel
                  </Button>
                </form>
                <form action={`/api/guilds/${params.guildId}/role-panels/${panel.id}`} method="post">
                  <input type="hidden" name="_method" value="delete" />
                  <Button type="submit" variant="destructive" className="rounded-none">
                    Delete Panel
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
