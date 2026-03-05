CREATE TABLE IF NOT EXISTS welcome_configs (
  guild_id BIGINT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  channel_id BIGINT,
  template TEXT NOT NULL DEFAULT 'Welcome {mention} to **{server}**!',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_welcome_configs_enabled
  ON welcome_configs (enabled);
