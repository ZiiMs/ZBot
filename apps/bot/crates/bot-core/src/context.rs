use std::sync::Arc;

use crate::services::{JobLockRepository, ReminderRepository, RolePanelRepository};
use crate::Metrics;

#[derive(Debug, Clone)]
pub struct Config {
    pub bot_token: String,
    pub discord_client_id: String,
    pub database_url: String,
    pub log_level: String,
    pub metrics_bind_addr: String,
    pub http_bind_addr: String,
    pub scheduler_tick_seconds: u64,
    pub reminder_lease_seconds: i64,
    pub shard_total: u16,
}

#[derive(Debug, Clone, Copy)]
pub struct ShardMeta {
    pub shard_id: u16,
    pub shard_total: u16,
}

#[derive(Clone)]
pub struct ServiceRegistry {
    pub reminder_repo: Arc<dyn ReminderRepository>,
    pub job_lock_repo: Arc<dyn JobLockRepository>,
    pub role_panel_repo: Arc<dyn RolePanelRepository>,
}

#[derive(Clone)]
pub struct AppContext {
    pub config: Arc<Config>,
    pub services: Arc<ServiceRegistry>,
    pub metrics: Arc<Metrics>,
    pub shard_meta: ShardMeta,
}
