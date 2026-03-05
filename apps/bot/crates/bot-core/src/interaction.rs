use async_trait::async_trait;
use base64::Engine;
use serde::{Deserialize, Serialize};

use crate::{AppContext, BotError};

#[derive(Debug, Clone, Eq, PartialEq, Hash)]
pub enum RouteKey {
    Command(String),
    Component(String),
    Modal(String),
    ContextUser(String),
    ContextMessage(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomId {
    pub feature: String,
    pub action: String,
    pub version: u8,
    pub payload: serde_json::Value,
}

impl CustomId {
    pub fn encode(&self) -> Result<String, BotError> {
        let payload = serde_json::to_vec(&self.payload)
            .map_err(|e| BotError::Internal(format!("failed to serialize payload: {e}")))?;
        let payload = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(payload);
        let encoded = format!(
            "{}:{}:{}:{}",
            self.feature, self.action, self.version, payload
        );
        if encoded.len() > 100 {
            return Err(BotError::UserInput(
                "custom id exceeded max length".to_string(),
            ));
        }
        Ok(encoded)
    }

    pub fn decode(raw: &str) -> Result<Self, BotError> {
        let parts: Vec<&str> = raw.splitn(4, ':').collect();
        if parts.len() != 4 {
            return Err(BotError::UserInput("invalid custom id".to_string()));
        }
        let version = parts[2]
            .parse::<u8>()
            .map_err(|_| BotError::UserInput("invalid custom id version".to_string()))?;
        let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(parts[3])
            .map_err(|_| BotError::UserInput("invalid custom id payload".to_string()))?;
        let payload: serde_json::Value = serde_json::from_slice(&bytes)
            .map_err(|_| BotError::UserInput("invalid custom id payload json".to_string()))?;
        Ok(Self {
            feature: parts[0].to_string(),
            action: parts[1].to_string(),
            version,
            payload,
        })
    }

    pub fn prefix(&self) -> String {
        format!("{}:{}", self.feature, self.action)
    }
}

#[derive(Debug, Clone)]
pub struct CommandDefinition {
    pub name: String,
    pub description: String,
    pub route_key: RouteKey,
}

#[derive(Debug, Clone)]
pub enum InteractionEvent {
    SlashCommand { name: String },
    UserContext { name: String },
    MessageContext { name: String },
    Button { custom_id: String },
    ModalSubmit { custom_id: String },
}

#[derive(Debug, Clone)]
pub enum InteractionOutcome {
    ImmediateResponse { content: String, ephemeral: bool },
    DeferredThenFollowup { content: String },
    Noop,
}

#[async_trait]
pub trait InteractionHandler: Send + Sync {
    async fn handle(
        &self,
        ctx: &AppContext,
        event: InteractionEvent,
    ) -> Result<InteractionOutcome, BotError>;
}

pub trait CommandModule: Send + Sync {
    fn register(&self) -> Vec<CommandDefinition>;
    fn handler(&self) -> &dyn InteractionHandler;
}
