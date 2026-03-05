ALTER TABLE role_panels
  ADD COLUMN IF NOT EXISTS sync_state TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

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
