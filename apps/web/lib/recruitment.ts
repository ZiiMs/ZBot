import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { ensureSchema, pool } from "./db";

export type CandidateStatus = "voting" | "accepted" | "declined";
export type VoteValue = "check" | "x";

export interface IntakePayload {
  guildId: string;
  channelId: string;
  messageId: string;
  messageUrl: string;
  authorDiscordId: string;
  forwardedMarkdown: string;
  capturedAt: string;
}

export interface CandidateRecord {
  id: string;
  status: CandidateStatus;
  sourceMarkdown: string;
  discordMessageUrl: string;
  discordChannelId: string;
  discordMessageId: string;
  submittedByDiscordId: string;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  currentRoundNumber: number | null;
  yesVotes: number;
  noVotes: number;
}

export interface SessionView {
  discordUserId: string;
  canVote: boolean;
  canModerate: boolean;
}

interface CandidateRow {
  id: string;
  status: CandidateStatus;
  source_markdown: string;
  discord_message_url: string;
  discord_channel_id: string;
  discord_message_id: string;
  submitted_by_discord_id: string;
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
  round_id: string | null;
  round_number: number | null;
}

interface VoteTallyRow {
  candidate_id: string;
  check_count: string;
  x_count: string;
}

interface ActiveRoundRow {
  id: string;
  round_number: number;
}

function mapCandidate(row: CandidateRow, tallyMap: Map<string, { check: number; x: number }>): CandidateRecord {
  const tally = tallyMap.get(row.id) ?? { check: 0, x: 0 };

  return {
    id: row.id,
    status: row.status,
    sourceMarkdown: row.source_markdown,
    discordMessageUrl: row.discord_message_url,
    discordChannelId: row.discord_channel_id,
    discordMessageId: row.discord_message_id,
    submittedByDiscordId: row.submitted_by_discord_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finalizedAt: row.finalized_at,
    currentRoundNumber: row.round_number,
    yesVotes: tally.check,
    noVotes: tally.x,
  };
}

async function loadCurrentTallies(candidateIds: string[]): Promise<Map<string, { check: number; x: number }>> {
  if (candidateIds.length === 0) {
    return new Map();
  }

  const tallies = await pool.query<VoteTallyRow>(
    `
    SELECT
      c.id AS candidate_id,
      COALESCE(SUM(CASE WHEN v.vote = 'check' THEN 1 ELSE 0 END), 0) AS check_count,
      COALESCE(SUM(CASE WHEN v.vote = 'x' THEN 1 ELSE 0 END), 0) AS x_count
    FROM candidates c
    LEFT JOIN vote_rounds vr
      ON vr.candidate_id = c.id
      AND vr.ended_at IS NULL
    LEFT JOIN votes v
      ON v.candidate_id = c.id
      AND v.vote_round_id = vr.id
    WHERE c.id = ANY($1::uuid[])
    GROUP BY c.id
  `,
    [candidateIds]
  );

  const map = new Map<string, { check: number; x: number }>();
  for (const row of tallies.rows) {
    map.set(row.candidate_id, {
      check: Number.parseInt(row.check_count, 10) || 0,
      x: Number.parseInt(row.x_count, 10) || 0,
    });
  }
  return map;
}

export async function listCandidates(): Promise<CandidateRecord[]> {
  await ensureSchema();

  const candidates = await pool.query<CandidateRow>(`
    SELECT
      c.id,
      c.status,
      c.source_markdown,
      c.discord_message_url,
      c.discord_channel_id,
      c.discord_message_id,
      c.submitted_by_discord_id,
      c.created_at,
      c.updated_at,
      c.finalized_at,
      vr.id AS round_id,
      vr.round_number
    FROM candidates c
    LEFT JOIN LATERAL (
      SELECT id, round_number
      FROM vote_rounds
      WHERE candidate_id = c.id
      AND ended_at IS NULL
      ORDER BY round_number DESC
      LIMIT 1
    ) vr ON true
    ORDER BY c.created_at DESC
  `);

  const candidateIds = candidates.rows.map((row) => row.id);
  const tallyMap = await loadCurrentTallies(candidateIds);

  return candidates.rows.map((row) => mapCandidate(row, tallyMap));
}

function assertVoteValue(value: string): VoteValue {
  if (value === "check" || value === "x") {
    return value;
  }
  throw new Error("Invalid vote value.");
}

async function getActiveRound(client: PoolClient, candidateId: string): Promise<ActiveRoundRow | null> {
  const result = await client.query<ActiveRoundRow>(
    `
    SELECT id, round_number
    FROM vote_rounds
    WHERE candidate_id = $1
      AND ended_at IS NULL
    ORDER BY round_number DESC
    LIMIT 1
    FOR UPDATE
  `,
    [candidateId]
  );
  return result.rows[0] ?? null;
}

async function insertAuditEvent(
  client: PoolClient,
  candidateId: string,
  actorDiscordId: string,
  eventType: string,
  metadata: Record<string, unknown>
): Promise<void> {
  await client.query(
    `
    INSERT INTO audit_events (id, candidate_id, actor_discord_id, event_type, metadata_json)
    VALUES ($1, $2, $3, $4, $5)
  `,
    [randomUUID(), candidateId, actorDiscordId, eventType, JSON.stringify(metadata)]
  );
}

export async function createCandidateFromIntake(payload: IntakePayload): Promise<{ created: boolean; id: string }> {
  await ensureSchema();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const insertResult = await client.query<{ id: string }>(
      `
      INSERT INTO candidates (
        id,
        status,
        source_markdown,
        discord_message_url,
        discord_channel_id,
        discord_message_id,
        submitted_by_discord_id,
        created_at,
        updated_at
      ) VALUES ($1, 'voting', $2, $3, $4, $5, $6, $7::timestamptz, NOW())
      ON CONFLICT (discord_message_id) DO NOTHING
      RETURNING id
    `,
      [
        randomUUID(),
        payload.forwardedMarkdown,
        payload.messageUrl,
        payload.channelId,
        payload.messageId,
        payload.authorDiscordId,
        payload.capturedAt,
      ]
    );

    const inserted = insertResult.rows[0];

    if (!inserted) {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM candidates WHERE discord_message_id = $1 LIMIT 1`,
        [payload.messageId]
      );

      await client.query("COMMIT");
      return {
        created: false,
        id: existing.rows[0]?.id ?? "",
      };
    }

    const voteRoundId = randomUUID();
    await client.query(
      `
      INSERT INTO vote_rounds (id, candidate_id, round_number)
      VALUES ($1, $2, 1)
    `,
      [voteRoundId, inserted.id]
    );

    await insertAuditEvent(client, inserted.id, payload.authorDiscordId, "candidate_intake_created", {
      messageId: payload.messageId,
      channelId: payload.channelId,
      messageUrl: payload.messageUrl,
    });

    await client.query("COMMIT");

    return {
      created: true,
      id: inserted.id,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function castVote(candidateId: string, voterDiscordId: string, rawVote: string): Promise<void> {
  await ensureSchema();

  const vote = assertVoteValue(rawVote);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const candidateResult = await client.query<{ status: CandidateStatus }>(
      `SELECT status FROM candidates WHERE id = $1 FOR UPDATE`,
      [candidateId]
    );

    const candidate = candidateResult.rows[0];
    if (!candidate) {
      throw new Error("Candidate not found.");
    }
    if (candidate.status !== "voting") {
      throw new Error("Voting is closed for this candidate.");
    }

    const activeRound = await getActiveRound(client, candidateId);
    if (!activeRound) {
      throw new Error("No active vote round.");
    }

    await client.query(
      `
      INSERT INTO votes (
        id,
        candidate_id,
        vote_round_id,
        voter_discord_id,
        vote,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (candidate_id, vote_round_id, voter_discord_id)
      DO UPDATE SET vote = EXCLUDED.vote, updated_at = NOW()
    `,
      [randomUUID(), candidateId, activeRound.id, voterDiscordId, vote]
    );

    await insertAuditEvent(client, candidateId, voterDiscordId, "vote_cast", {
      roundNumber: activeRound.round_number,
      vote,
    });

    const tallyResult = await client.query<{ check_count: string; x_count: string }>(
      `
      SELECT
        COALESCE(SUM(CASE WHEN vote = 'check' THEN 1 ELSE 0 END), 0) AS check_count,
        COALESCE(SUM(CASE WHEN vote = 'x' THEN 1 ELSE 0 END), 0) AS x_count
      FROM votes
      WHERE candidate_id = $1
        AND vote_round_id = $2
    `,
      [candidateId, activeRound.id]
    );

    const checkCount = Number.parseInt(tallyResult.rows[0]?.check_count ?? "0", 10) || 0;
    const xCount = Number.parseInt(tallyResult.rows[0]?.x_count ?? "0", 10) || 0;

    let finalStatus: CandidateStatus | null = null;
    if (xCount >= 1) {
      finalStatus = "declined";
    } else if (checkCount >= 3) {
      finalStatus = "accepted";
    }

    if (finalStatus) {
      await client.query(
        `
        UPDATE candidates
        SET status = $2,
            updated_at = NOW(),
            finalized_at = NOW()
        WHERE id = $1
      `,
        [candidateId, finalStatus]
      );

      await client.query(
        `
        UPDATE vote_rounds
        SET ended_at = NOW()
        WHERE id = $1
      `,
        [activeRound.id]
      );

      await insertAuditEvent(client, candidateId, voterDiscordId, "candidate_finalized", {
        roundNumber: activeRound.round_number,
        status: finalStatus,
        checkCount,
        xCount,
      });
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function restartVoting(
  candidateId: string,
  actorDiscordId: string,
  reason?: string
): Promise<void> {
  await ensureSchema();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const candidateResult = await client.query<{ id: string }>(
      `SELECT id FROM candidates WHERE id = $1 FOR UPDATE`,
      [candidateId]
    );

    if (!candidateResult.rows[0]) {
      throw new Error("Candidate not found.");
    }

    const activeRound = await getActiveRound(client, candidateId);
    if (activeRound) {
      await client.query(`UPDATE vote_rounds SET ended_at = NOW() WHERE id = $1`, [activeRound.id]);
    }

    const maxRoundResult = await client.query<{ max_round: number | null }>(
      `SELECT MAX(round_number) AS max_round FROM vote_rounds WHERE candidate_id = $1`,
      [candidateId]
    );

    const nextRound = (maxRoundResult.rows[0]?.max_round ?? 0) + 1;

    await client.query(
      `
      INSERT INTO vote_rounds (id, candidate_id, round_number, started_at, restarted_by_discord_id, reason)
      VALUES ($1, $2, $3, NOW(), $4, $5)
    `,
      [randomUUID(), candidateId, nextRound, actorDiscordId, reason ?? null]
    );

    await client.query(
      `
      UPDATE candidates
      SET status = 'voting',
          finalized_at = NULL,
          updated_at = NOW()
      WHERE id = $1
    `,
      [candidateId]
    );

    await insertAuditEvent(client, candidateId, actorDiscordId, "vote_restarted", {
      nextRound,
      reason: reason ?? null,
    });

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteCandidate(candidateId: string): Promise<void> {
  await ensureSchema();

  const result = await pool.query(`DELETE FROM candidates WHERE id = $1`, [candidateId]);
  if ((result.rowCount ?? 0) === 0) {
    throw new Error("Candidate not found.");
  }
}
