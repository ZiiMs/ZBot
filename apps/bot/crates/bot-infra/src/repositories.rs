use async_trait::async_trait;
use bot_core::{
    BotError, JobLockRepository, Reminder, ReminderRepository, RolePanelItem, RolePanelMapping,
    RolePanelRepository, RolePanelSyncTarget, WelcomeConfig, WelcomeRepository,
};
use chrono::{DateTime, Duration, Utc};
use sqlx::{Pool, Postgres, Row};
use uuid::Uuid;

#[derive(Clone)]
pub struct PostgresReminderRepository {
    pool: Pool<Postgres>,
}

impl PostgresReminderRepository {
    pub fn new(pool: Pool<Postgres>) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl ReminderRepository for PostgresReminderRepository {
    async fn create_reminder(&self, reminder: &Reminder) -> Result<(), BotError> {
        sqlx::query(
            "INSERT INTO reminders (id, guild_id, channel_id, user_id, payload_json, due_at, status, attempts, claimed_by, claimed_until, last_error, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL, NULL, NOW(), NOW())",
        )
        .bind(reminder.id)
        .bind(reminder.guild_id)
        .bind(reminder.channel_id)
        .bind(reminder.user_id)
        .bind(&reminder.payload_json)
        .bind(reminder.due_at)
        .bind(&reminder.status)
        .bind(reminder.attempts)
        .execute(&self.pool)
        .await
        .map_err(|e| BotError::Persistence(format!("create reminder failed: {e}")))?;
        Ok(())
    }

    async fn claim_due_reminders(
        &self,
        now: DateTime<Utc>,
        limit: i64,
        worker_id: &str,
        lease_seconds: i64,
    ) -> Result<Vec<Reminder>, BotError> {
        let lease_until = now + Duration::seconds(lease_seconds);

        let rows = sqlx::query(
            "WITH candidate AS (
              SELECT id
              FROM reminders
              WHERE status = 'pending'
                AND due_at <= $1
                AND (claimed_until IS NULL OR claimed_until < $1)
              ORDER BY due_at ASC
              LIMIT $2
              FOR UPDATE SKIP LOCKED
            )
            UPDATE reminders r
            SET claimed_by = $3,
                claimed_until = $4,
                updated_at = NOW()
            FROM candidate
            WHERE r.id = candidate.id
            RETURNING r.id, r.guild_id, r.channel_id, r.user_id, r.payload_json, r.due_at, r.status, r.attempts",
        )
        .bind(now)
        .bind(limit)
        .bind(worker_id)
        .bind(lease_until)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| BotError::Persistence(format!("claim due reminders failed: {e}")))?;

        rows.into_iter()
            .map(|row| {
                Ok(Reminder {
                    id: row
                        .try_get("id")
                        .map_err(|e| BotError::Persistence(format!("missing id: {e}")))?,
                    guild_id: row
                        .try_get("guild_id")
                        .map_err(|e| BotError::Persistence(format!("missing guild_id: {e}")))?,
                    channel_id: row
                        .try_get("channel_id")
                        .map_err(|e| BotError::Persistence(format!("missing channel_id: {e}")))?,
                    user_id: row
                        .try_get("user_id")
                        .map_err(|e| BotError::Persistence(format!("missing user_id: {e}")))?,
                    payload_json: row.try_get("payload_json").map_err(|e| {
                        BotError::Persistence(format!("missing payload_json: {e}"))
                    })?,
                    due_at: row
                        .try_get("due_at")
                        .map_err(|e| BotError::Persistence(format!("missing due_at: {e}")))?,
                    status: row
                        .try_get("status")
                        .map_err(|e| BotError::Persistence(format!("missing status: {e}")))?,
                    attempts: row
                        .try_get("attempts")
                        .map_err(|e| BotError::Persistence(format!("missing attempts: {e}")))?,
                })
            })
            .collect()
    }

    async fn complete_reminder(&self, reminder_id: Uuid) -> Result<(), BotError> {
        sqlx::query(
            "UPDATE reminders
             SET status = 'completed', claimed_by = NULL, claimed_until = NULL, updated_at = NOW()
             WHERE id = $1",
        )
        .bind(reminder_id)
        .execute(&self.pool)
        .await
        .map_err(|e| BotError::Persistence(format!("complete reminder failed: {e}")))?;
        Ok(())
    }

    async fn fail_reminder(
        &self,
        reminder_id: Uuid,
        err: &str,
        next_due: DateTime<Utc>,
        max_attempts: i32,
    ) -> Result<(), BotError> {
        sqlx::query(
            "UPDATE reminders
             SET attempts = attempts + 1,
                 due_at = $2,
                 status = CASE WHEN attempts + 1 >= $3 THEN 'dead_letter' ELSE 'pending' END,
                 claimed_by = NULL,
                 claimed_until = NULL,
                 last_error = $4,
                 updated_at = NOW()
             WHERE id = $1",
        )
        .bind(reminder_id)
        .bind(next_due)
        .bind(max_attempts)
        .bind(err)
        .execute(&self.pool)
        .await
        .map_err(|e| BotError::Persistence(format!("fail reminder failed: {e}")))?;
        Ok(())
    }
}

#[derive(Clone)]
pub struct PostgresJobLockRepository {
    pool: Pool<Postgres>,
}

impl PostgresJobLockRepository {
    pub fn new(pool: Pool<Postgres>) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl JobLockRepository for PostgresJobLockRepository {
    async fn acquire_lock(
        &self,
        job_name: &str,
        owner_id: &str,
        lease_seconds: i64,
    ) -> Result<bool, BotError> {
        let now = Utc::now();
        let lease_until = now + Duration::seconds(lease_seconds);

        sqlx::query(
            "INSERT INTO job_locks (job_name, owner_id, lease_until, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT(job_name) DO UPDATE SET
               owner_id = EXCLUDED.owner_id,
               lease_until = EXCLUDED.lease_until,
               updated_at = NOW()
             WHERE job_locks.lease_until < $4 OR job_locks.owner_id = $2",
        )
        .bind(job_name)
        .bind(owner_id)
        .bind(lease_until)
        .bind(now)
        .execute(&self.pool)
        .await
        .map_err(|e| BotError::Persistence(format!("acquire lock failed: {e}")))
        .map(|r| r.rows_affected() > 0)
    }

    async fn release_lock(&self, job_name: &str, owner_id: &str) -> Result<(), BotError> {
        sqlx::query("DELETE FROM job_locks WHERE job_name = $1 AND owner_id = $2")
            .bind(job_name)
            .bind(owner_id)
            .execute(&self.pool)
            .await
            .map_err(|e| BotError::Persistence(format!("release lock failed: {e}")))?;
        Ok(())
    }
}

#[derive(Clone)]
pub struct PostgresRolePanelRepository {
    pool: Pool<Postgres>,
}

#[derive(Clone)]
pub struct PostgresWelcomeRepository {
    pool: Pool<Postgres>,
}

impl PostgresWelcomeRepository {
    pub fn new(pool: Pool<Postgres>) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl WelcomeRepository for PostgresWelcomeRepository {
    async fn get_welcome_config(&self, guild_id: i64) -> Result<Option<WelcomeConfig>, BotError> {
        let row = sqlx::query(
            "SELECT guild_id, enabled, channel_id, template
             FROM welcome_configs
             WHERE guild_id = $1",
        )
        .bind(guild_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| BotError::Persistence(format!("get welcome config failed: {e}")))?;

        let Some(row) = row else {
            return Ok(None);
        };

        Ok(Some(WelcomeConfig {
            guild_id: row
                .try_get("guild_id")
                .map_err(|e| BotError::Persistence(format!("missing guild_id: {e}")))?,
            enabled: row
                .try_get("enabled")
                .map_err(|e| BotError::Persistence(format!("missing enabled: {e}")))?,
            channel_id: row
                .try_get("channel_id")
                .map_err(|e| BotError::Persistence(format!("missing channel_id: {e}")))?,
            template: row
                .try_get("template")
                .map_err(|e| BotError::Persistence(format!("missing template: {e}")))?,
        }))
    }
}

impl PostgresRolePanelRepository {
    pub fn new(pool: Pool<Postgres>) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl RolePanelRepository for PostgresRolePanelRepository {
    async fn get_panel_item(
        &self,
        panel_id: Uuid,
        item_id: Uuid,
        custom_id: &str,
    ) -> Result<Option<RolePanelItem>, BotError> {
        let row = sqlx::query(
            "SELECT id, panel_id, custom_id, label, emoji, role_id, style, sort_order
             FROM role_panel_items
             WHERE panel_id = $1 AND id = $2 AND custom_id = $3",
        )
        .bind(panel_id)
        .bind(item_id)
        .bind(custom_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| BotError::Persistence(format!("get panel item failed: {e}")))?;

        let Some(row) = row else {
            return Ok(None);
        };

        Ok(Some(RolePanelItem {
            id: row
                .try_get("id")
                .map_err(|e| BotError::Persistence(format!("missing id: {e}")))?,
            panel_id: row
                .try_get("panel_id")
                .map_err(|e| BotError::Persistence(format!("missing panel_id: {e}")))?,
            custom_id: row
                .try_get("custom_id")
                .map_err(|e| BotError::Persistence(format!("missing custom_id: {e}")))?,
            label: row
                .try_get("label")
                .map_err(|e| BotError::Persistence(format!("missing label: {e}")))?,
            emoji: row
                .try_get("emoji")
                .map_err(|e| BotError::Persistence(format!("missing emoji: {e}")))?,
            role_id: row
                .try_get("role_id")
                .map_err(|e| BotError::Persistence(format!("missing role_id: {e}")))?,
            style: row
                .try_get("style")
                .map_err(|e| BotError::Persistence(format!("missing style: {e}")))?,
            sort_order: row
                .try_get("sort_order")
                .map_err(|e| BotError::Persistence(format!("missing sort_order: {e}")))?,
        }))
    }

    async fn get_pack_mappings(
        &self,
        panel_id: Uuid,
        pack: &str,
    ) -> Result<Vec<RolePanelMapping>, BotError> {
        let rows = sqlx::query(
            "SELECT m.panel_id, m.pack, m.preset_key, c.label, c.emoji, m.role_id, m.enabled
             FROM role_panel_preset_mappings m
             JOIN wow_preset_catalog c ON c.pack = m.pack AND c.key = m.preset_key
             WHERE m.panel_id = $1 AND m.pack = $2 AND m.enabled = TRUE
             ORDER BY c.sort_order ASC",
        )
        .bind(panel_id)
        .bind(pack)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| BotError::Persistence(format!("get pack mappings failed: {e}")))?;

        map_role_panel_mappings(rows)
    }

    async fn get_all_mappings(&self, panel_id: Uuid) -> Result<Vec<RolePanelMapping>, BotError> {
        let rows = sqlx::query(
            "SELECT m.panel_id, m.pack, m.preset_key, c.label, c.emoji, m.role_id, m.enabled
             FROM role_panel_preset_mappings m
             JOIN wow_preset_catalog c ON c.pack = m.pack AND c.key = m.preset_key
             WHERE m.panel_id = $1 AND m.enabled = TRUE
             ORDER BY m.pack ASC, c.sort_order ASC",
        )
        .bind(panel_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| BotError::Persistence(format!("get all mappings failed: {e}")))?;

        map_role_panel_mappings(rows)
    }

    async fn get_pending_panels(&self, limit: i64) -> Result<Vec<RolePanelSyncTarget>, BotError> {
        let rows = sqlx::query(
            "SELECT id, guild_id, channel_id, message_id, title, description
             FROM role_panels
             WHERE sync_state = 'pending' AND is_active = TRUE
             ORDER BY updated_at ASC
             LIMIT $1",
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| BotError::Persistence(format!("get pending panels failed: {e}")))?;

        rows.into_iter()
            .map(|row| {
                Ok(RolePanelSyncTarget {
                    panel_id: row
                        .try_get("id")
                        .map_err(|e| BotError::Persistence(format!("missing id: {e}")))?,
                    guild_id: row
                        .try_get("guild_id")
                        .map_err(|e| BotError::Persistence(format!("missing guild_id: {e}")))?,
                    channel_id: row
                        .try_get("channel_id")
                        .map_err(|e| BotError::Persistence(format!("missing channel_id: {e}")))?,
                    message_id: row
                        .try_get("message_id")
                        .map_err(|e| BotError::Persistence(format!("missing message_id: {e}")))?,
                    title: row
                        .try_get("title")
                        .map_err(|e| BotError::Persistence(format!("missing title: {e}")))?,
                    description: row.try_get("description").map_err(|e| {
                        BotError::Persistence(format!("missing description: {e}"))
                    })?,
                })
            })
            .collect()
    }

    async fn mark_synced(&self, panel_id: Uuid, message_id: i64) -> Result<(), BotError> {
        sqlx::query(
            "UPDATE role_panels
             SET message_id = $2,
                 sync_state = 'synced',
                 last_sync_error = NULL,
                 last_synced_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1",
        )
        .bind(panel_id)
        .bind(message_id)
        .execute(&self.pool)
        .await
        .map_err(|e| BotError::Persistence(format!("mark synced failed: {e}")))?;
        Ok(())
    }

    async fn mark_sync_error(&self, panel_id: Uuid, error: &str) -> Result<(), BotError> {
        sqlx::query(
            "UPDATE role_panels
             SET sync_state = 'error',
                 last_sync_error = $2,
                 updated_at = NOW()
             WHERE id = $1",
        )
        .bind(panel_id)
        .bind(error)
        .execute(&self.pool)
        .await
        .map_err(|e| BotError::Persistence(format!("mark sync error failed: {e}")))?;
        Ok(())
    }
}

fn map_role_panel_mappings(rows: Vec<sqlx::postgres::PgRow>) -> Result<Vec<RolePanelMapping>, BotError> {
    rows.into_iter()
        .map(|row| {
            Ok(RolePanelMapping {
                panel_id: row
                    .try_get("panel_id")
                    .map_err(|e| BotError::Persistence(format!("missing panel_id: {e}")))?,
                pack: row
                    .try_get("pack")
                    .map_err(|e| BotError::Persistence(format!("missing pack: {e}")))?,
                preset_key: row
                    .try_get("preset_key")
                    .map_err(|e| BotError::Persistence(format!("missing preset_key: {e}")))?,
                label: row
                    .try_get("label")
                    .map_err(|e| BotError::Persistence(format!("missing label: {e}")))?,
                emoji: row
                    .try_get("emoji")
                    .map_err(|e| BotError::Persistence(format!("missing emoji: {e}")))?,
                role_id: row
                    .try_get("role_id")
                    .map_err(|e| BotError::Persistence(format!("missing role_id: {e}")))?,
                enabled: row
                    .try_get("enabled")
                    .map_err(|e| BotError::Persistence(format!("missing enabled: {e}")))?,
            })
        })
        .collect()
}
