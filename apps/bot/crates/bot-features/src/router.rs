use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use bot_core::{
    AppContext, BotError, CommandDefinition, CommandModule, CustomId, InteractionEvent,
    InteractionOutcome, RouteKey,
};
use tracing::{warn, Instrument};

#[derive(Clone)]
pub struct InteractionRouter {
    routes: HashMap<RouteKey, Arc<dyn CommandModule>>,
}

impl InteractionRouter {
    pub fn new(modules: &[Arc<dyn CommandModule>]) -> Self {
        let mut routes = HashMap::new();
        for module in modules {
            for def in module.register() {
                routes.insert(def.route_key, module.clone());
            }
        }
        Self { routes }
    }

    pub fn command_definitions(
        &self,
        modules: &[Arc<dyn CommandModule>],
    ) -> Vec<CommandDefinition> {
        let mut defs = Vec::new();
        for module in modules {
            defs.extend(module.register());
        }
        defs
    }

    pub async fn dispatch(
        &self,
        ctx: &AppContext,
        event: InteractionEvent,
    ) -> Result<InteractionOutcome, BotError> {
        let route_key = route_key_from_event(&event)?;
        let route_label = route_label(&route_key);

        let Some(module) = self.routes.get(&route_key) else {
            warn!(event = "interaction_unknown_route", route = route_label);
            return Ok(InteractionOutcome::ImmediateResponse {
                content: "That interaction is outdated. Please run the command again.".to_string(),
                ephemeral: true,
            });
        };

        let started = Instant::now();
        let span = tracing::info_span!(
            "interaction_dispatch",
            route = route_label,
            shard_id = ctx.shard_meta.shard_id,
            shard_total = ctx.shard_meta.shard_total
        );

        let result = module.handler().handle(ctx, event).instrument(span).await;

        let elapsed = started.elapsed().as_secs_f64();
        let _ = &ctx.metrics;
        let _ = elapsed;

        result
    }
}

fn route_key_from_event(event: &InteractionEvent) -> Result<RouteKey, BotError> {
    match event {
        InteractionEvent::SlashCommand { name } => Ok(RouteKey::Command(name.clone())),
        InteractionEvent::UserContext { name } => Ok(RouteKey::ContextUser(name.clone())),
        InteractionEvent::MessageContext { name } => Ok(RouteKey::ContextMessage(name.clone())),
        InteractionEvent::Button { custom_id } => {
            let cid = CustomId::decode(custom_id)?;
            Ok(RouteKey::Component(cid.prefix()))
        }
        InteractionEvent::ModalSubmit { custom_id } => {
            let cid = CustomId::decode(custom_id)?;
            Ok(RouteKey::Modal(cid.prefix()))
        }
    }
}

fn route_label(route: &RouteKey) -> String {
    match route {
        RouteKey::Command(v) => format!("slash:{v}"),
        RouteKey::Component(v) => format!("component:{v}"),
        RouteKey::Modal(v) => format!("modal:{v}"),
        RouteKey::ContextUser(v) => format!("context_user:{v}"),
        RouteKey::ContextMessage(v) => format!("context_message:{v}"),
    }
}
