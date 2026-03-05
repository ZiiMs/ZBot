use async_trait::async_trait;
use bot_core::{
    AppContext, BotError, CommandDefinition, CommandModule, InteractionEvent, InteractionHandler,
    InteractionOutcome, RouteKey,
};

pub struct PingModule;

impl CommandModule for PingModule {
    fn register(&self) -> Vec<CommandDefinition> {
        vec![
            CommandDefinition {
                name: "ping".to_string(),
                description: "Simple health ping".to_string(),
                route_key: RouteKey::Command("ping".to_string()),
            },
            CommandDefinition {
                name: "ping_user".to_string(),
                description: "User context ping".to_string(),
                route_key: RouteKey::ContextUser("ping_user".to_string()),
            },
            CommandDefinition {
                name: "ping_message".to_string(),
                description: "Message context ping".to_string(),
                route_key: RouteKey::ContextMessage("ping_message".to_string()),
            },
        ]
    }

    fn handler(&self) -> &dyn InteractionHandler {
        self
    }
}

#[async_trait]
impl InteractionHandler for PingModule {
    async fn handle(
        &self,
        _ctx: &AppContext,
        event: InteractionEvent,
    ) -> Result<InteractionOutcome, BotError> {
        match event {
            InteractionEvent::SlashCommand { .. } => Ok(InteractionOutcome::ImmediateResponse {
                content: "Pong!".to_string(),
                ephemeral: true,
            }),
            InteractionEvent::UserContext { .. } => Ok(InteractionOutcome::ImmediateResponse {
                content: "Pong from user context.".to_string(),
                ephemeral: true,
            }),
            InteractionEvent::MessageContext { .. } => Ok(InteractionOutcome::ImmediateResponse {
                content: "Pong from message context.".to_string(),
                ephemeral: true,
            }),
            _ => Ok(InteractionOutcome::Noop),
        }
    }
}
