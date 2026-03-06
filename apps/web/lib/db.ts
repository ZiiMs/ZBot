import { Pool } from "pg";
import { getWebConfig } from "./config";

const { databaseUrl } = getWebConfig();

const globalForDb = globalThis as unknown as {
  pool?: Pool;
  schemaReady?: Promise<void>;
};

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: databaseUrl,
  });

if (!globalForDb.pool) {
  globalForDb.pool = pool;
}

async function ensureSchemaInternal(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS candidates (
      id UUID PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('voting', 'accepted', 'declined')),
      source_markdown TEXT NOT NULL,
      discord_message_url TEXT NOT NULL,
      discord_channel_id TEXT NOT NULL,
      discord_message_id TEXT NOT NULL UNIQUE,
      submitted_by_discord_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finalized_at TIMESTAMPTZ NULL
    );

    CREATE TABLE IF NOT EXISTS vote_rounds (
      id UUID PRIMARY KEY,
      candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      round_number INTEGER NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ NULL,
      restarted_by_discord_id TEXT NULL,
      reason TEXT NULL,
      UNIQUE (candidate_id, round_number)
    );

    CREATE TABLE IF NOT EXISTS votes (
      id UUID PRIMARY KEY,
      candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      vote_round_id UUID NOT NULL REFERENCES vote_rounds(id) ON DELETE CASCADE,
      voter_discord_id TEXT NOT NULL,
      vote TEXT NOT NULL CHECK (vote IN ('check', 'x', 'maybe')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (candidate_id, vote_round_id, voter_discord_id)
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id UUID PRIMARY KEY,
      candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      actor_discord_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'votes'::regclass
          AND conname = 'votes_vote_check'
      ) THEN
        ALTER TABLE votes DROP CONSTRAINT votes_vote_check;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'votes'::regclass
          AND conname = 'votes_vote_allowed'
      ) THEN
        ALTER TABLE votes
          ADD CONSTRAINT votes_vote_allowed CHECK (vote IN ('check', 'x', 'maybe'));
      END IF;
    END $$;
  `);
}

export async function ensureSchema(): Promise<void> {
  if (!globalForDb.schemaReady) {
    globalForDb.schemaReady = ensureSchemaInternal();
  }
  await globalForDb.schemaReady;
}
