use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use uuid::Uuid;

use crate::BotError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reminder {
    pub id: Uuid,
    pub guild_id: i64,
    pub channel_id: i64,
    pub user_id: i64,
    pub payload_json: serde_json::Value,
    pub due_at: DateTime<Utc>,
    pub status: String,
    pub attempts: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RolePanelItem {
    pub id: Uuid,
    pub panel_id: Uuid,
    pub custom_id: String,
    pub label: String,
    pub emoji: Option<String>,
    pub role_id: i64,
    pub style: String,
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RolePanelMapping {
    pub panel_id: Uuid,
    pub pack: String,
    pub preset_key: String,
    pub label: String,
    pub emoji: Option<String>,
    pub role_id: i64,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RolePanelSyncTarget {
    pub panel_id: Uuid,
    pub guild_id: i64,
    pub channel_id: i64,
    pub message_id: Option<i64>,
    pub title: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WelcomeConfig {
    pub guild_id: i64,
    pub enabled: bool,
    pub channel_id: Option<i64>,
    pub template: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WelcomeRenderContext {
    pub user: String,
    pub server: String,
    pub mention: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WelcomePreviewResult {
    pub content: String,
    pub used_variables: Vec<String>,
    pub unknown_placeholders: Vec<String>,
}

pub fn render_welcome_template(
    template: &str,
    context: &WelcomeRenderContext,
) -> WelcomePreviewResult {
    let mut content = String::new();
    let mut used_variables = BTreeSet::new();
    let mut unknown_placeholders = BTreeSet::new();

    let bytes = template.as_bytes();
    let mut i = 0usize;

    while i < bytes.len() {
        if bytes[i] == b'{' {
            if let Some(offset) = template[i + 1..].find('}') {
                let end = i + 1 + offset;
                let token = &template[i + 1..end];
                if token.is_empty() {
                    content.push_str("{}");
                } else {
                    match token {
                        "user" => {
                            content.push_str(&context.user);
                            used_variables.insert("user".to_string());
                        }
                        "server" => {
                            content.push_str(&context.server);
                            used_variables.insert("server".to_string());
                        }
                        "mention" => {
                            content.push_str(&context.mention);
                            used_variables.insert("mention".to_string());
                        }
                        _ => {
                            content.push('{');
                            content.push_str(token);
                            content.push('}');
                            unknown_placeholders.insert(token.to_string());
                        }
                    }
                }
                i = end + 1;
                continue;
            }
        }

        if let Some(ch) = template[i..].chars().next() {
            content.push(ch);
            i += ch.len_utf8();
        } else {
            break;
        }
    }

    WelcomePreviewResult {
        content,
        used_variables: used_variables.into_iter().collect(),
        unknown_placeholders: unknown_placeholders.into_iter().collect(),
    }
}

#[async_trait]
pub trait ReminderRepository: Send + Sync {
    async fn create_reminder(&self, reminder: &Reminder) -> Result<(), BotError>;
    async fn claim_due_reminders(
        &self,
        now: DateTime<Utc>,
        limit: i64,
        worker_id: &str,
        lease_seconds: i64,
    ) -> Result<Vec<Reminder>, BotError>;
    async fn complete_reminder(&self, reminder_id: Uuid) -> Result<(), BotError>;
    async fn fail_reminder(
        &self,
        reminder_id: Uuid,
        err: &str,
        next_due: DateTime<Utc>,
        max_attempts: i32,
    ) -> Result<(), BotError>;
}

#[async_trait]
pub trait JobLockRepository: Send + Sync {
    async fn acquire_lock(
        &self,
        job_name: &str,
        owner_id: &str,
        lease_seconds: i64,
    ) -> Result<bool, BotError>;
    async fn release_lock(&self, job_name: &str, owner_id: &str) -> Result<(), BotError>;
}

#[async_trait]
pub trait RolePanelRepository: Send + Sync {
    async fn get_panel_item(
        &self,
        panel_id: Uuid,
        item_id: Uuid,
        custom_id: &str,
    ) -> Result<Option<RolePanelItem>, BotError>;
    async fn get_pack_mappings(
        &self,
        panel_id: Uuid,
        pack: &str,
    ) -> Result<Vec<RolePanelMapping>, BotError>;
    async fn get_all_mappings(&self, panel_id: Uuid) -> Result<Vec<RolePanelMapping>, BotError>;
    async fn get_pending_panels(&self, limit: i64) -> Result<Vec<RolePanelSyncTarget>, BotError>;
    async fn mark_synced(&self, panel_id: Uuid, message_id: i64) -> Result<(), BotError>;
    async fn mark_sync_error(&self, panel_id: Uuid, error: &str) -> Result<(), BotError>;
}

#[async_trait]
pub trait WelcomeRepository: Send + Sync {
    async fn get_welcome_config(&self, guild_id: i64) -> Result<Option<WelcomeConfig>, BotError>;
}

pub trait Clock: Send + Sync {
    fn now(&self) -> DateTime<Utc>;
}

#[derive(Debug, Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> DateTime<Utc> {
        Utc::now()
    }
}
