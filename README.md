# ZBot2 Raider.IO Formatter Bot

Discord bot that watches one channel for Raider.IO character links and reposts formatted embeds.

## Features

- Watches only one configured Discord channel
- Finds one or more Raider.IO character links in a message
- Creates one embed per character link
- Posts non-link message text as normal bot message content above the embed(s)
- Splits output into two sections per category: `Current` and `Previous (Last 3)`
- Shows `N/A` for raid tiers with zero/no progression
- Shows `Current` + `Previous 1/2/3` Mythic+ seasons (`N/A` when unavailable)
- Deletes original message after repost (if permissions allow)

## Setup

1. Install dependencies:

```bash
bun install
```

2. Copy `.env.example` to `.env` and set values:

- `DISCORD_BOT_TOKEN`
- `DISCORD_TARGET_CHANNEL_ID`
- `RAIDERIO_ACCESS_KEY` (optional)
- `LOG_LEVEL` (optional, default `info`)

3. Run locally:

```bash
bun run dev
```

4. In Discord Developer Portal, enable required intent:

- Go to `Applications -> <your app> -> Bot -> Privileged Gateway Intents`
- Enable `Message Content Intent`
- Save changes, then restart the bot

## Scripts

- `bun run dev` - run in watch mode
- `bun run start` - run once
- `bun run typecheck` - TypeScript typecheck
- `bun run test` - test suite

## Railway

- Runtime: Bun (or Nixpacks auto-detect with Bun lockfile)
- Start command: `bun run start`
- Add environment variables from `.env.example`
- Ensure bot has `Send Messages`, `Embed Links`, and `Manage Messages` in the target channel
- Ensure `Message Content Intent` is enabled in the Discord app settings
