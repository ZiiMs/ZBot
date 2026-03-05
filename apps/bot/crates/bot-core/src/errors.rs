use thiserror::Error;

#[derive(Debug, Clone, Copy)]
pub enum BotErrorKind {
    UserInput,
    External,
    Persistence,
    DiscordApi,
    Internal,
}

#[derive(Debug, Error)]
pub enum BotError {
    #[error("user input error: {0}")]
    UserInput(String),
    #[error("external dependency error: {0}")]
    External(String),
    #[error("persistence error: {0}")]
    Persistence(String),
    #[error("discord api error: {0}")]
    DiscordApi(String),
    #[error("internal error: {0}")]
    Internal(String),
}

impl BotError {
    pub fn kind(&self) -> BotErrorKind {
        match self {
            Self::UserInput(_) => BotErrorKind::UserInput,
            Self::External(_) => BotErrorKind::External,
            Self::Persistence(_) => BotErrorKind::Persistence,
            Self::DiscordApi(_) => BotErrorKind::DiscordApi,
            Self::Internal(_) => BotErrorKind::Internal,
        }
    }
}
