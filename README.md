# ZBot2 Recruitment + Raider.IO

This repo now contains:

- A Discord bot (root package) that:
  - Keeps Raider.IO link parsing and embed posting
  - Captures forwarded recruitment text and sends it to the web intake API
- A web app (`apps/web`) that:
  - Stores forwarded recruitment posts
  - Shows `Voting`, `Accepted`, and `Declined` sections
  - Allows role-gated voting (`Checkmark` / `X`)
  - Auto-finalizes (`3 checks => accepted`, `1 X => declined`)
  - Supports moderator restart/re-vote per candidate

## Root Bot Setup

1. Install dependencies:

```bash
bun install
```

2. Copy `.env.example` to `.env` and fill:

- `DISCORD_BOT_TOKEN`
- `DISCORD_TARGET_CHANNEL_ID`
- `DISCORD_GUILD_ID`
- `RAIDERIO_ACCESS_KEY` (optional)
- `RECRUITMENT_INTAKE_URL` (for example `http://localhost:3000/api/intake/discord-forward`)
- `RECRUITMENT_API_TOKEN` (must match web app)
- `LOG_LEVEL` (optional)

3. Run bot:

```bash
bun run dev
```

## Web App Setup (`apps/web`)

1. Install dependencies from repo root:

```bash
npm install
```

2. Copy `apps/web/.env.example` to `apps/web/.env.local` and fill values:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_GUILD_ID`
- `DISCORD_BOT_TOKEN`
- `RECRUITMENT_API_TOKEN`
- `VOTER_ROLE_IDS` (comma-separated)
- `MODERATOR_ROLE_IDS` (comma-separated)

3. Run web app:

```bash
npm run dev:web
```

## Scripts

- `bun run dev` - bot watch mode
- `bun run start` - bot run once
- `npm run dev:web` - web app dev server
- `npm run start:web` - web app production start
- `bun run typecheck` - bot typecheck
- `bun run test` - bot tests

## Notes

- Web app schema is auto-created on first API call and SQL is mirrored in `apps/web/sql/init.sql`.
- Bot no longer reposts plain text from messages.
- Bot no longer deletes source Discord messages, preserving source message links.
