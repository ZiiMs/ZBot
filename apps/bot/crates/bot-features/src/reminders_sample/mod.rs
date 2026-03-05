use async_trait::async_trait;
use bot_core::{
    AppContext, BotError, CommandDefinition, CommandModule, CustomId, InteractionEvent,
    InteractionHandler, InteractionOutcome, Reminder, RouteKey,
};
use chrono::Duration;
use uuid::Uuid;

const FEATURE: &str = "reminders";

pub struct RemindersSampleModule;

impl CommandModule for RemindersSampleModule {
    fn register(&self) -> Vec<CommandDefinition> {
        vec![
            CommandDefinition {
                name: "remind_me".to_string(),
                description: "Create a sample reminder".to_string(),
                route_key: RouteKey::Command("remind_me".to_string()),
            },
            CommandDefinition {
                name: "reminders:create".to_string(),
                description: "Reminder create button".to_string(),
                route_key: RouteKey::Component("reminders:create".to_string()),
            },
            CommandDefinition {
                name: "reminders:create".to_string(),
                description: "Reminder create modal".to_string(),
                route_key: RouteKey::Modal("reminders:create".to_string()),
            },
        ]
    }

    fn handler(&self) -> &dyn InteractionHandler {
        self
    }
}

#[async_trait]
impl InteractionHandler for RemindersSampleModule {
    async fn handle(
        &self,
        ctx: &AppContext,
        event: InteractionEvent,
    ) -> Result<InteractionOutcome, BotError> {
        match event {
            InteractionEvent::SlashCommand { .. } => Ok(InteractionOutcome::DeferredThenFollowup {
                content:
                    "Reminder flow started. Click the create button in UI integration to continue."
                        .to_string(),
            }),
            InteractionEvent::Button { custom_id } => {
                let cid = CustomId::decode(&custom_id)?;
                if cid.feature != FEATURE || cid.action != "create" {
                    return Ok(InteractionOutcome::Noop);
                }
                Ok(InteractionOutcome::DeferredThenFollowup {
                    content: "Modal would be shown here. Submit to create reminder.".to_string(),
                })
            }
            InteractionEvent::ModalSubmit { custom_id } => {
                let cid = CustomId::decode(&custom_id)?;
                if cid.feature != FEATURE || cid.action != "create" {
                    return Ok(InteractionOutcome::Noop);
                }

                let reminder = Reminder {
                    id: Uuid::new_v4(),
                    guild_id: cid
                        .payload
                        .get("guild_id")
                        .and_then(|v| v.as_i64())
                        .unwrap_or_default(),
                    channel_id: cid
                        .payload
                        .get("channel_id")
                        .and_then(|v| v.as_i64())
                        .unwrap_or_default(),
                    user_id: cid
                        .payload
                        .get("user_id")
                        .and_then(|v| v.as_i64())
                        .unwrap_or_default(),
                    payload_json: serde_json::json!({
                        "content": cid
                            .payload
                            .get("content")
                            .and_then(|v| v.as_str())
                            .unwrap_or("sample reminder")
                    }),
                    due_at: chrono::Utc::now() + Duration::minutes(5),
                    status: "pending".to_string(),
                    attempts: 0,
                };

                ctx.services
                    .reminder_repo
                    .create_reminder(&reminder)
                    .await?;

                Ok(InteractionOutcome::ImmediateResponse {
                    content: "Reminder created and queued.".to_string(),
                    ephemeral: true,
                })
            }
            _ => Ok(InteractionOutcome::Noop),
        }
    }
}
