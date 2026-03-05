CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id BIGINT PRIMARY KEY,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  locale TEXT NOT NULL DEFAULT 'en-US',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY,
  guild_id BIGINT NOT NULL,
  channel_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  payload_json JSONB NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  claimed_by TEXT,
  claimed_until TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_due_status
  ON reminders (status, due_at, claimed_until);

CREATE TABLE IF NOT EXISTS job_locks (
  job_name TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  lease_until TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS command_audit (
  id UUID PRIMARY KEY,
  interaction_id TEXT NOT NULL,
  user_id BIGINT,
  guild_id BIGINT,
  route_key TEXT NOT NULL,
  outcome TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS managed_guilds (
  guild_id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  owner_user_id BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guild_installations (
  guild_id BIGINT PRIMARY KEY,
  installed_by_user_id BIGINT NOT NULL,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_panels (
  id UUID PRIMARY KEY,
  guild_id BIGINT NOT NULL,
  channel_id BIGINT NOT NULL,
  message_id BIGINT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sync_state TEXT NOT NULL DEFAULT 'pending',
  last_sync_error TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_panel_items (
  id UUID PRIMARY KEY,
  panel_id UUID NOT NULL REFERENCES role_panels(id) ON DELETE CASCADE,
  custom_id TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  emoji TEXT,
  role_id BIGINT NOT NULL,
  style TEXT NOT NULL DEFAULT 'primary',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_role_panels_guild
  ON role_panels (guild_id);

CREATE INDEX IF NOT EXISTS idx_role_panel_items_panel
  ON role_panel_items (panel_id);

CREATE TABLE IF NOT EXISTS wow_preset_catalog (
  pack TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  emoji TEXT,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (pack, key)
);

CREATE TABLE IF NOT EXISTS role_panel_preset_mappings (
  id UUID PRIMARY KEY,
  panel_id UUID NOT NULL REFERENCES role_panels(id) ON DELETE CASCADE,
  pack TEXT NOT NULL,
  preset_key TEXT NOT NULL,
  role_id BIGINT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (panel_id, pack, preset_key)
);

CREATE INDEX IF NOT EXISTS idx_role_panel_preset_mappings_panel
  ON role_panel_preset_mappings (panel_id, pack);

CREATE TABLE IF NOT EXISTS oauth_sessions (
  session_id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO wow_preset_catalog (pack, key, label, emoji, sort_order) VALUES
  ('class', 'death_knight', 'Death Knight', '⚔️', 1),
  ('class', 'demon_hunter', 'Demon Hunter', '😈', 2),
  ('class', 'druid', 'Druid', '🌿', 3),
  ('class', 'evoker', 'Evoker', '🐉', 4),
  ('class', 'hunter', 'Hunter', '🏹', 5),
  ('class', 'mage', 'Mage', '🪄', 6),
  ('class', 'monk', 'Monk', '🥋', 7),
  ('class', 'paladin', 'Paladin', '🛡️', 8),
  ('class', 'priest', 'Priest', '✨', 9),
  ('class', 'rogue', 'Rogue', '🗡️', 10),
  ('class', 'shaman', 'Shaman', '⚡', 11),
  ('class', 'warlock', 'Warlock', '🔥', 12),
  ('class', 'warrior', 'Warrior', '🪓', 13),
  ('role', 'tank', 'Tank', '🛡️', 1),
  ('role', 'healer', 'Healer', '💚', 2),
  ('role', 'dps', 'DPS', '⚔️', 3),
  ('region', 'us', 'US', '🇺🇸', 1),
  ('region', 'eu', 'EU', '🇪🇺', 2),
  ('region', 'oce', 'OCE', '🌊', 3),
  ('region', 'latam', 'LATAM', '🌎', 4),
  ('region', 'br', 'BR', '🇧🇷', 5),
  ('region', 'kr', 'KR', '🇰🇷', 6),
  ('region', 'tw', 'TW', '🇹🇼', 7)
ON CONFLICT (pack, key) DO NOTHING;
