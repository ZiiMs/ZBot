# ZBot Monorepo

ZBot is now a monorepo with two apps:

- `apps/bot`: Rust Serenity bot runtime (interactions, scheduler, metrics, role buttons)
- `apps/web`: Next.js management site (Discord OAuth login, invite setup, role panel config)

## Quick Start

### 1. Start Postgres

Use the provided compose file:

```bash
docker compose -f infra/docker-compose.yml up -d
```

### 2. Run bot

```bash
cp apps/bot/.env.example .env
# fill BOT_TOKEN and DISCORD_CLIENT_ID
cargo run -p bot-app
```

### 3. Run web

```bash
cd apps/web
cp .env.example .env.local
npm install
npm run dev
```

## Bot Architecture

- `apps/bot/crates/bot-app`: runtime bootstrap and Serenity integration
- `apps/bot/crates/bot-core`: shared contracts, types, errors
- `apps/bot/crates/bot-infra`: Postgres repositories, scheduler, health/metrics server
- `apps/bot/crates/bot-features`: feature modules and interaction router

## Web Features

- Discord OAuth2 web login
- Invite/server setup section with guild selection and invite link generation
- Auto react role panel configuration (button-role mappings)
