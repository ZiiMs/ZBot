use std::sync::Arc;
use std::time::Duration;

use bot_core::services::SystemClock;
use bot_core::{AppContext, Clock};
use chrono::Duration as ChronoDuration;
use tokio::sync::watch;
use tracing::{error, info, warn};

use crate::metrics::MetricsRegistry;

pub struct Scheduler {
    worker_id: String,
    ctx: AppContext,
    metrics: Arc<MetricsRegistry>,
    clock: Arc<dyn Clock>,
}

impl Scheduler {
    pub fn new(worker_id: String, ctx: AppContext, metrics: Arc<MetricsRegistry>) -> Self {
        Self {
            worker_id,
            ctx,
            metrics,
            clock: Arc::new(SystemClock),
        }
    }

    pub async fn run(self, mut stop_rx: watch::Receiver<bool>) {
        let tick = Duration::from_secs(self.ctx.config.scheduler_tick_seconds);
        loop {
            tokio::select! {
                _ = stop_rx.changed() => {
                    info!(event = "scheduler_stopping");
                    break;
                }
                _ = tokio::time::sleep(tick) => {
                    if let Err(err) = self.tick().await {
                        warn!(event = "scheduler_tick_failed", error = %err);
                    }
                }
            }
        }
    }

    async fn tick(&self) -> Result<(), bot_core::BotError> {
        let locked = self
            .ctx
            .services
            .job_lock_repo
            .acquire_lock(
                "reminder_dispatch",
                &self.worker_id,
                self.ctx.config.reminder_lease_seconds,
            )
            .await?;
        if !locked {
            return Ok(());
        }

        let now = self.clock.now();
        let reminders = self
            .ctx
            .services
            .reminder_repo
            .claim_due_reminders(
                now,
                20,
                &self.worker_id,
                self.ctx.config.reminder_lease_seconds,
            )
            .await?;

        if !reminders.is_empty() {
            self.metrics
                .inc_jobs_claimed("reminder_dispatch", reminders.len() as u64);
        }

        for reminder in reminders {
            let user_id = reminder.user_id;
            let content = reminder
                .payload_json
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("(empty reminder)");

            info!(
                event = "reminder_dispatch",
                reminder_id = %reminder.id,
                user_id = user_id,
                content = content
            );

            let simulated_failure = false;
            if simulated_failure {
                self.metrics.inc_job_failed("reminder_dispatch");
                let next_due = now + ChronoDuration::seconds(30);
                self.ctx
                    .services
                    .reminder_repo
                    .fail_reminder(reminder.id, "simulated dispatch failure", next_due, 5)
                    .await?;
                continue;
            }

            if let Err(err) = self
                .ctx
                .services
                .reminder_repo
                .complete_reminder(reminder.id)
                .await
            {
                error!(event = "reminder_complete_failed", reminder_id = %reminder.id, error = %err);
                self.metrics.inc_job_failed("reminder_dispatch");
            }
        }

        self.ctx
            .services
            .job_lock_repo
            .release_lock("reminder_dispatch", &self.worker_id)
            .await
    }
}
