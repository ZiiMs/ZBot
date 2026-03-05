"use client";

import { type FormEvent, useMemo, useState } from "react";

import type { DiscordGuildChannel } from "@/types/discord";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_WELCOME_TEMPLATE } from "@/lib/welcome";

type WelcomeConfigFormProps = {
  guildId: string;
  channels: DiscordGuildChannel[];
  initialConfig: {
    enabled: boolean;
    channelId: string | null;
    template: string;
  };
};

type PreviewResponse = {
  content: string;
  usedVariables: string[];
  unknownPlaceholders: string[];
};

const VARIABLE_HINT = "Variables: {user} {server} {mention}";

export function WelcomeConfigForm({ guildId, channels, initialConfig }: WelcomeConfigFormProps) {
  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [channelId, setChannelId] = useState(initialConfig.channelId ?? "");
  const [template, setTemplate] = useState(initialConfig.template || DEFAULT_WELCOME_TEMPLATE);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingSave, setLoadingSave] = useState(false);

  const channelChoices = useMemo(() => channels, [channels]);

  async function onPreview() {
    setLoadingPreview(true);
    setSaveStatus(null);

    try {
      const res = await fetch(`/api/guilds/${guildId}/welcome/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template })
      });

      if (!res.ok) {
        throw new Error("preview_failed");
      }

      const payload = (await res.json()) as PreviewResponse;
      setPreview(payload);
    } catch {
      setSaveStatus("Preview failed. Check your session and try again.");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoadingSave(true);
    setSaveStatus(null);

    try {
      const res = await fetch(`/api/guilds/${guildId}/welcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          channelId,
          template
        })
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({ error: "save_failed" }))) as {
          error?: string;
        };
        if (payload.error === "channel_required_when_enabled") {
          throw new Error("Please select a channel when welcome messages are enabled.");
        }
        if (payload.error === "template_required") {
          throw new Error("Template is required.");
        }
        throw new Error("Save failed.");
      }

      setSaveStatus("Welcome configuration saved.");
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setLoadingSave(false);
    }
  }

  return (
    <form onSubmit={onSave} className="space-y-4">
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded-none border border-input bg-background"
          />
          Enable welcome messages
        </Label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="welcome-channel">Channel</Label>
        {channelChoices.length > 0 ? (
          <select
            id="welcome-channel"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            className="flex h-10 w-full rounded-none border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Select a channel</option>
            {channelChoices.map((channel) => (
              <option key={channel.id} value={channel.id}>
                #{channel.name}
              </option>
            ))}
          </select>
        ) : (
          <Input
            id="welcome-channel"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            placeholder="Channel ID"
            className="rounded-none"
          />
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="welcome-template">Template</Label>
        <Textarea
          id="welcome-template"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          className="min-h-[140px] rounded-none"
          placeholder={DEFAULT_WELCOME_TEMPLATE}
        />
        <p className="text-xs text-muted-foreground">{VARIABLE_HINT}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="rounded-none" disabled={loadingSave}>
          {loadingSave ? "Saving..." : "Save Welcome Config"}
        </Button>
        <Button type="button" variant="secondary" className="rounded-none" onClick={onPreview} disabled={loadingPreview}>
          {loadingPreview ? "Generating Preview..." : "Preview"}
        </Button>
      </div>

      {saveStatus && <p className="text-sm text-muted-foreground">{saveStatus}</p>}

      {preview && (
        <div className="space-y-2 border-2 border-border p-3">
          <p className="text-sm font-semibold">Preview (Discord markdown)</p>
          <pre className="whitespace-pre-wrap break-words border border-border p-2 text-sm">{preview.content}</pre>
          <p className="text-xs text-muted-foreground">
            Used: {preview.usedVariables.length > 0 ? preview.usedVariables.join(", ") : "none"}
          </p>
          <p className="text-xs text-muted-foreground">
            Unknown placeholders: {preview.unknownPlaceholders.length > 0 ? preview.unknownPlaceholders.join(", ") : "none"}
          </p>
        </div>
      )}
    </form>
  );
}
