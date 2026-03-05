use std::collections::HashSet;
use std::collections::{BTreeMap, BTreeSet};
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Instant;

use anyhow::Context as AnyhowContext;
use bot_core::{
    AppContext, BotError, Config, InteractionEvent, InteractionOutcome, RouteKey, ServiceRegistry,
    ShardMeta, WelcomeRenderContext, render_welcome_template,
};
use bot_features::default_modules;
use bot_features::router::InteractionRouter;
use bot_infra::http::{run_http_server, HealthState};
use bot_infra::metrics::MetricsRegistry;
use bot_infra::repositories::{
    PostgresJobLockRepository, PostgresReminderRepository, PostgresRolePanelRepository,
    PostgresWelcomeRepository,
};
use bot_infra::scheduler::Scheduler;
use serenity::all::{
    ChannelId, Command, CommandInteraction, CommandType, ComponentInteraction,
    ComponentInteractionDataKind, Context, CreateActionRow, CreateCommand, CreateMessage,
    CreateInteractionResponse, CreateInteractionResponseMessage, EventHandler, GatewayIntents,
    Interaction, Member, ModalInteraction, ReactionType, Ready, RoleId,
};
use serenity::async_trait;
use serenity::Client;
use sqlx::postgres::PgPoolOptions;
use tokio::sync::watch;
use tracing::{error, info, warn};
use uuid::Uuid;

#[derive(Clone)]
struct Handler {
    app_ctx: AppContext,
    router: InteractionRouter,
    command_defs: Arc<Vec<bot_core::CommandDefinition>>,
    metrics: Arc<MetricsRegistry>,
}

#[async_trait]
impl EventHandler for Handler {
    async fn ready(&self, ctx: Context, ready: Ready) {
        info!(event = "discord_ready", user = %ready.user.name);
        if let Err(err) = register_commands(&ctx, self.command_defs.as_slice()).await {
            error!(event = "command_registration_failed", error = %err, details = ?err);
        }
    }

    async fn interaction_create(&self, ctx: Context, interaction: Interaction) {
        let started = Instant::now();
        let outcome = match &interaction {
            Interaction::Command(cmd) => {
                let event = match cmd.data.kind {
                    CommandType::ChatInput => InteractionEvent::SlashCommand {
                        name: cmd.data.name.clone(),
                    },
                    CommandType::User => InteractionEvent::UserContext {
                        name: cmd.data.name.clone(),
                    },
                    CommandType::Message => InteractionEvent::MessageContext {
                        name: cmd.data.name.clone(),
                    },
                    _ => {
                        warn!(event = "unsupported_command_type", name = %cmd.data.name);
                        return;
                    }
                };

                self.dispatch_and_respond_command(&ctx, cmd, event).await
            }
            Interaction::Component(component) => match &component.data.kind {
                ComponentInteractionDataKind::StringSelect { values } => {
                    if component.data.custom_id.starts_with("roles:select:") {
                        handle_role_panel_select(&self.app_ctx, &ctx, component, values).await
                    } else {
                        Ok(())
                    }
                }
                ComponentInteractionDataKind::Button => {
                    if component.data.custom_id.starts_with("roles:panel:") {
                        handle_role_panel_button(&self.app_ctx, &ctx, component).await
                    } else {
                        let event = InteractionEvent::Button {
                            custom_id: component.data.custom_id.clone(),
                        };
                        self.dispatch_and_respond_component(&ctx, component, event)
                            .await
                    }
                }
                _ => Ok(()),
            },
            Interaction::Modal(modal) => {
                let event = InteractionEvent::ModalSubmit {
                    custom_id: modal.data.custom_id.clone(),
                };
                self.dispatch_and_respond_modal(&ctx, modal, event).await
            }
            _ => return,
        };

        let route = route_name_from_interaction(&interaction);
        self.metrics.inc_interaction(&route);
        self.metrics
            .observe_interaction_latency(&route, started.elapsed().as_secs_f64());

        if let Err(err) = outcome {
            self.metrics
                .inc_interaction_error(&route, &format!("{:?}", err.kind()));
            error!(event = "interaction_handle_failed", route = route, error = %err);
        }
    }

    async fn guild_member_addition(&self, ctx: Context, new_member: Member) {
        if let Err(err) = send_welcome_message(&self.app_ctx, &ctx, &new_member).await {
            warn!(
                event = "welcome_send_failed",
                guild_id = %new_member.guild_id.get(),
                user_id = %new_member.user.id.get(),
                error = %err
            );
        }
    }
}

impl Handler {
    async fn dispatch_and_respond_command(
        &self,
        ctx: &Context,
        command: &CommandInteraction,
        event: InteractionEvent,
    ) -> Result<(), BotError> {
        let outcome = self.router.dispatch(&self.app_ctx, event).await?;
        respond_command(ctx, command, outcome).await
    }

    async fn dispatch_and_respond_component(
        &self,
        ctx: &Context,
        component: &ComponentInteraction,
        event: InteractionEvent,
    ) -> Result<(), BotError> {
        let outcome = self.router.dispatch(&self.app_ctx, event).await?;
        respond_component(ctx, component, outcome).await
    }

    async fn dispatch_and_respond_modal(
        &self,
        ctx: &Context,
        modal: &ModalInteraction,
        event: InteractionEvent,
    ) -> Result<(), BotError> {
        let outcome = self.router.dispatch(&self.app_ctx, event).await?;
        respond_modal(ctx, modal, outcome).await
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();
    init_tracing();
    let config = Arc::new(load_config()?);

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&config.database_url)
        .await
        .context("failed to connect postgres")?;

    sqlx::migrate!("../../migrations")
        .run(&pool)
        .await
        .context("failed to run migrations")?;

    let reminder_repo = Arc::new(PostgresReminderRepository::new(pool.clone()));
    let job_lock_repo = Arc::new(PostgresJobLockRepository::new(pool.clone()));
    let role_panel_repo = Arc::new(PostgresRolePanelRepository::new(pool.clone()));
    let welcome_repo = Arc::new(PostgresWelcomeRepository::new(pool));
    let services = Arc::new(ServiceRegistry {
        reminder_repo,
        job_lock_repo,
        role_panel_repo,
        welcome_repo,
    });

    let metrics = Arc::new(MetricsRegistry::new().context("failed to init metrics")?);

    let app_ctx = AppContext {
        config: config.clone(),
        services,
        metrics: metrics.core_metrics(),
        shard_meta: ShardMeta {
            shard_id: 0,
            shard_total: config.shard_total,
        },
    };

    let modules = default_modules();
    let router = InteractionRouter::new(&modules);
    let command_defs = Arc::new(router.command_definitions(&modules));

    let handler = Handler {
        app_ctx: app_ctx.clone(),
        router,
        command_defs,
        metrics: metrics.clone(),
    };

    let intents = GatewayIntents::GUILD_MESSAGES
        | GatewayIntents::GUILD_MESSAGE_REACTIONS
        | GatewayIntents::GUILDS
        | GatewayIntents::GUILD_MEMBERS
        | GatewayIntents::DIRECT_MESSAGES;
    let mut client = Client::builder(&config.bot_token, intents)
        .event_handler(handler)
        .await
        .context("failed to create serenity client")?;
    let discord_http = client.http.clone();

    let http_addr: SocketAddr = config
        .http_bind_addr
        .parse()
        .context("invalid HTTP_BIND_ADDR")?;

    let health_state = HealthState {
        ready: true,
        metrics: metrics.clone(),
    };

    let (stop_tx, stop_rx) = watch::channel(false);
    let scheduler = Scheduler::new(uuid::Uuid::new_v4().to_string(), app_ctx.clone(), metrics);
    let scheduler_task = tokio::spawn(scheduler.run(stop_rx));
    let panel_sync_task = tokio::spawn(run_role_panel_sync_loop(
        app_ctx.clone(),
        discord_http,
        stop_tx.subscribe(),
    ));

    let http_task = tokio::spawn(async move {
        if let Err(err) = run_http_server(http_addr, health_state).await {
            error!(event = "http_server_failed", error = %err);
        }
    });

    let client_task = tokio::spawn(async move {
        if let Err(why) = client.start().await {
            error!(event = "discord_client_failed", error = %why);
        }
    });

    tokio::signal::ctrl_c().await?;
    info!(event = "shutdown_start");
    let _ = stop_tx.send(true);

    scheduler_task.abort();
    panel_sync_task.abort();
    http_task.abort();
    client_task.abort();

    info!(event = "shutdown_complete");
    Ok(())
}

fn init_tracing() {
    let level = env::var("LOG_LEVEL").unwrap_or_else(|_| "info".to_string());
    tracing_subscriber::fmt()
        .with_env_filter(level)
        .json()
        .init();
}

fn load_config() -> anyhow::Result<Config> {
    let bot_token = env::var("BOT_TOKEN").context("BOT_TOKEN is required")?;
    let discord_client_id =
        env::var("DISCORD_CLIENT_ID").context("DISCORD_CLIENT_ID is required")?;
    let database_url = env::var("DATABASE_URL").context("DATABASE_URL is required")?;
    let log_level = env::var("LOG_LEVEL").unwrap_or_else(|_| "info".to_string());
    let metrics_bind_addr =
        env::var("METRICS_BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:9000".to_string());
    let http_bind_addr = env::var("HTTP_BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".to_string());

    let scheduler_tick_seconds = env::var("SCHEDULER_TICK_SECONDS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(5);

    let reminder_lease_seconds = env::var("REMINDER_LEASE_SECONDS")
        .ok()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(30);

    let shard_total = env::var("SHARD_TOTAL")
        .ok()
        .and_then(|v| v.parse::<u16>().ok())
        .unwrap_or(1);

    Ok(Config {
        bot_token,
        discord_client_id,
        database_url,
        log_level,
        metrics_bind_addr,
        http_bind_addr,
        scheduler_tick_seconds,
        reminder_lease_seconds,
        shard_total,
    })
}

fn route_name_from_interaction(interaction: &Interaction) -> String {
    match interaction {
        Interaction::Command(cmd) => format!("command:{}", cmd.data.name),
        Interaction::Component(c) => {
            format!("component:{}", route_key_from_custom_id(&c.data.custom_id))
        }
        Interaction::Modal(m) => format!("modal:{}", route_key_from_custom_id(&m.data.custom_id)),
        _ => "unknown".to_string(),
    }
}

fn route_key_from_custom_id(raw: &str) -> String {
    let parts: Vec<&str> = raw.split(':').collect();
    if parts.len() >= 2 {
        format!("{}:{}", parts[0], parts[1])
    } else {
        raw.to_string()
    }
}

async fn register_commands(
    ctx: &Context,
    defs: &[bot_core::CommandDefinition],
) -> anyhow::Result<()> {
    let mut seen = HashSet::new();
    let mut commands = Vec::new();

    for def in defs {
        let (key, command) = match &def.route_key {
            RouteKey::Command(name) => (
                format!("slash:{name}"),
                CreateCommand::new(def.name.clone()).description(def.description.clone()),
            ),
            RouteKey::ContextUser(name) => (
                format!("ctx_user:{name}"),
                CreateCommand::new(def.name.clone()).kind(CommandType::User),
            ),
            RouteKey::ContextMessage(name) => (
                format!("ctx_msg:{name}"),
                CreateCommand::new(def.name.clone()).kind(CommandType::Message),
            ),
            _ => continue,
        };
        if !seen.insert(key) {
            continue;
        }

        commands.push(command);
    }

    Command::set_global_commands(&ctx.http, commands)
        .await
        .context("failed to register commands")?;

    Ok(())
}

async fn send_welcome_message(
    app_ctx: &AppContext,
    ctx: &Context,
    new_member: &Member,
) -> Result<(), BotError> {
    let guild_id = new_member.guild_id.get() as i64;
    let Some(config) = app_ctx
        .services
        .welcome_repo
        .get_welcome_config(guild_id)
        .await?
    else {
        return Ok(());
    };

    if !config.enabled {
        return Ok(());
    }

    let Some(channel_id) = config.channel_id else {
        return Ok(());
    };

    let guild_name = match new_member.guild_id.to_partial_guild(&ctx.http).await {
        Ok(guild) => guild.name,
        Err(_) => "this server".to_string(),
    };

    let display_name = new_member
        .nick
        .clone()
        .unwrap_or_else(|| new_member.user.name.clone());
    let render_context = WelcomeRenderContext {
        user: display_name,
        server: guild_name,
        mention: format!("<@{}>", new_member.user.id.get()),
    };
    let preview = render_welcome_template(&config.template, &render_context);

    ChannelId::new(channel_id as u64)
        .send_message(&ctx.http, CreateMessage::new().content(preview.content))
        .await
        .map_err(|e| BotError::DiscordApi(format!("failed to send welcome message: {e}")))?;

    Ok(())
}

async fn handle_role_panel_button(
    app_ctx: &AppContext,
    ctx: &Context,
    component: &ComponentInteraction,
) -> Result<(), BotError> {
    let Some((panel_id, item_id)) = parse_role_panel_custom_id(&component.data.custom_id) else {
        return respond_component(
            ctx,
            component,
            InteractionOutcome::ImmediateResponse {
                content: "Invalid role panel button.".to_string(),
                ephemeral: true,
            },
        )
        .await;
    };

    let item = app_ctx
        .services
        .role_panel_repo
        .get_panel_item(panel_id, item_id, &component.data.custom_id)
        .await?;

    let Some(item) = item else {
        return respond_component(
            ctx,
            component,
            InteractionOutcome::ImmediateResponse {
                content: "This role option is no longer valid.".to_string(),
                ephemeral: true,
            },
        )
        .await;
    };

    let Some(guild_id) = component.guild_id else {
        return respond_component(
            ctx,
            component,
            InteractionOutcome::ImmediateResponse {
                content: "Role buttons can only be used in servers.".to_string(),
                ephemeral: true,
            },
        )
        .await;
    };

    let member = guild_id
        .member(&ctx.http, component.user.id)
        .await
        .map_err(|e| BotError::DiscordApi(format!("failed to fetch member: {e}")))?;

    let role_id = RoleId::new(item.role_id as u64);
    enforce_role_hierarchy_checks(ctx, guild_id, &member, role_id).await?;
    let has_role = member.roles.contains(&role_id);

    if has_role {
        member
            .remove_role(&ctx.http, role_id)
            .await
            .map_err(|e| BotError::DiscordApi(format!("failed to remove role: {e}")))?;
        respond_component(
            ctx,
            component,
            InteractionOutcome::ImmediateResponse {
                content: format!("Removed role `{}`.", item.label),
                ephemeral: true,
            },
        )
        .await
    } else {
        member
            .add_role(&ctx.http, role_id)
            .await
            .map_err(|e| BotError::DiscordApi(format!("failed to add role: {e}")))?;
        respond_component(
            ctx,
            component,
            InteractionOutcome::ImmediateResponse {
                content: format!("Added role `{}`.", item.label),
                ephemeral: true,
            },
        )
        .await
    }
}

async fn handle_role_panel_select(
    app_ctx: &AppContext,
    ctx: &Context,
    component: &ComponentInteraction,
    selected_values: &[String],
) -> Result<(), BotError> {
    let Some((panel_id, pack)) = parse_role_select_custom_id(&component.data.custom_id) else {
        return respond_component(
            ctx,
            component,
            InteractionOutcome::ImmediateResponse {
                content: "Invalid select menu.".to_string(),
                ephemeral: true,
            },
        )
        .await;
    };

    let Some(guild_id) = component.guild_id else {
        return respond_component(
            ctx,
            component,
            InteractionOutcome::ImmediateResponse {
                content: "Role dropdowns can only be used in servers.".to_string(),
                ephemeral: true,
            },
        )
        .await;
    };

    let mappings = app_ctx
        .services
        .role_panel_repo
        .get_pack_mappings(panel_id, &pack)
        .await?;

    if mappings.is_empty() {
        return respond_component(
            ctx,
            component,
            InteractionOutcome::ImmediateResponse {
                content: "No configured mappings found for this dropdown.".to_string(),
                ephemeral: true,
            },
        )
        .await;
    }

    let selected: BTreeSet<&str> = selected_values.iter().map(String::as_str).collect();
    let member = guild_id
        .member(&ctx.http, component.user.id)
        .await
        .map_err(|e| BotError::DiscordApi(format!("failed to fetch member: {e}")))?;
    let mut added = Vec::new();
    let mut removed = Vec::new();

    for mapping in &mappings {
        let role_id = RoleId::new(mapping.role_id as u64);
        enforce_role_hierarchy_checks(ctx, guild_id, &member, role_id).await?;

        let has_role = member.roles.contains(&role_id);
        let should_have = selected.contains(mapping.preset_key.as_str());

        if should_have && !has_role {
            member
                .add_role(&ctx.http, role_id)
                .await
                .map_err(|e| BotError::DiscordApi(format!("failed to add role: {e}")))?;
            added.push(mapping.label.clone());
        } else if !should_have && has_role {
            member
                .remove_role(&ctx.http, role_id)
                .await
                .map_err(|e| BotError::DiscordApi(format!("failed to remove role: {e}")))?;
            removed.push(mapping.label.clone());
        }
    }

    let content = format!(
        "{} roles added, {} roles removed for `{}`.",
        added.len(),
        removed.len(),
        pack
    );
    respond_component(
        ctx,
        component,
        InteractionOutcome::ImmediateResponse {
            content,
            ephemeral: true,
        },
    )
    .await
}

async fn run_role_panel_sync_loop(
    app_ctx: AppContext,
    http: std::sync::Arc<serenity::http::Http>,
    mut stop_rx: watch::Receiver<bool>,
) {
    loop {
        tokio::select! {
            _ = stop_rx.changed() => break,
            _ = tokio::time::sleep(std::time::Duration::from_secs(15)) => {
                if let Err(err) = run_role_panel_sync_tick(&app_ctx, &http).await {
                    warn!(event = "role_panel_sync_tick_failed", error = %err);
                }
            }
        }
    }
}

async fn run_role_panel_sync_tick(
    app_ctx: &AppContext,
    http: &std::sync::Arc<serenity::http::Http>,
) -> Result<(), BotError> {
    let panels = app_ctx.services.role_panel_repo.get_pending_panels(20).await?;
    for panel in panels {
        let mappings = app_ctx
            .services
            .role_panel_repo
            .get_all_mappings(panel.panel_id)
            .await?;

        if mappings.is_empty() {
            app_ctx
                .services
                .role_panel_repo
                .mark_sync_error(panel.panel_id, "no mappings configured")
                .await?;
            continue;
        }

        let mut grouped: BTreeMap<String, Vec<bot_core::RolePanelMapping>> = BTreeMap::new();
        for mapping in mappings {
            grouped.entry(mapping.pack.clone()).or_default().push(mapping);
        }

        let mut rows = Vec::new();
        for (pack, options) in grouped {
            if options.is_empty() {
                continue;
            }
            let select_custom_id = format!("roles:select:{}:{}:v1", panel.panel_id, pack);
            let menu_options = options
                .into_iter()
                .map(|option| {
                    let mut item = serenity::all::CreateSelectMenuOption::new(
                        option.label,
                        option.preset_key,
                    );
                    if let Some(emoji) = option.emoji {
                        item = item.emoji(ReactionType::Unicode(emoji));
                    }
                    item
                })
                .collect();

            let select =
                serenity::all::CreateSelectMenu::new(
                    select_custom_id,
                    serenity::all::CreateSelectMenuKind::String { options: menu_options },
                )
                .placeholder(format!("Select {} presets", pack))
                .min_values(0)
                .max_values(25);
            rows.push(CreateActionRow::SelectMenu(select));
        }

        if rows.is_empty() {
            app_ctx
                .services
                .role_panel_repo
                .mark_sync_error(panel.panel_id, "no enabled mappings found")
                .await?;
            continue;
        }

        let content = format!("**{}**\n{}", panel.title, panel.description);
        let channel = ChannelId::new(panel.channel_id as u64);
        let result_message_id = if let Some(existing_message_id) = panel.message_id {
            channel
                .edit_message(
                    http,
                    serenity::all::MessageId::new(existing_message_id as u64),
                    serenity::all::EditMessage::new()
                        .content(content.clone())
                        .components(rows.clone()),
                )
                .await
                .map(|m| m.id.get() as i64)
                .map_err(|e| BotError::DiscordApi(format!("failed to edit panel message: {e}")))
        } else {
            channel
                .send_message(http, CreateMessage::new().content(content).components(rows))
                .await
                .map(|m| m.id.get() as i64)
                .map_err(|e| BotError::DiscordApi(format!("failed to create panel message: {e}")))
        };

        match result_message_id {
            Ok(message_id) => {
                app_ctx
                    .services
                    .role_panel_repo
                    .mark_synced(panel.panel_id, message_id)
                    .await?;
            }
            Err(err) => {
                app_ctx
                    .services
                    .role_panel_repo
                    .mark_sync_error(panel.panel_id, &err.to_string())
                    .await?;
            }
        }
    }
    Ok(())
}

async fn enforce_role_hierarchy_checks(
    ctx: &Context,
    guild_id: serenity::all::GuildId,
    invoking_member: &serenity::all::Member,
    target_role_id: RoleId,
) -> Result<(), BotError> {
    let roles = guild_id
        .roles(&ctx.http)
        .await
        .map_err(|e| BotError::DiscordApi(format!("failed to fetch guild roles: {e}")))?;
    let Some(target_role) = roles.get(&target_role_id) else {
        return Err(BotError::UserInput(
            "configured role no longer exists".to_string(),
        ));
    };
    if target_role.managed {
        return Err(BotError::UserInput(
            "managed/integration roles cannot be assigned".to_string(),
        ));
    }

    let bot_user = ctx
        .http
        .get_current_user()
        .await
        .map_err(|e| BotError::DiscordApi(format!("failed to fetch bot user: {e}")))?;
    let bot_member = guild_id
        .member(&ctx.http, bot_user.id)
        .await
        .map_err(|e| BotError::DiscordApi(format!("failed to fetch bot member: {e}")))?;

    let target_pos = i64::from(target_role.position);
    let invoking_pos = highest_role_position(invoking_member, &roles);
    let bot_pos = highest_role_position(&bot_member, &roles);

    if invoking_pos <= target_pos {
        return Err(BotError::UserInput(
            "you cannot assign/remove a role at or above your highest role".to_string(),
        ));
    }
    if bot_pos <= target_pos {
        return Err(BotError::UserInput(
            "bot cannot assign/remove this role due to role hierarchy".to_string(),
        ));
    }
    Ok(())
}

fn highest_role_position(
    member: &serenity::all::Member,
    roles: &std::collections::HashMap<RoleId, serenity::all::Role>,
) -> i64 {
    member
        .roles
        .iter()
        .filter_map(|id| roles.get(id))
        .map(|r| i64::from(r.position))
        .max()
        .unwrap_or(0)
}

fn parse_role_panel_custom_id(raw: &str) -> Option<(Uuid, Uuid)> {
    let parts: Vec<&str> = raw.split(':').collect();
    if parts.len() != 5 || parts[0] != "roles" || parts[1] != "panel" || parts[4] != "v1" {
        return None;
    }
    let panel_id = Uuid::parse_str(parts[2]).ok()?;
    let item_id = Uuid::parse_str(parts[3]).ok()?;
    Some((panel_id, item_id))
}

fn parse_role_select_custom_id(raw: &str) -> Option<(Uuid, String)> {
    let parts: Vec<&str> = raw.split(':').collect();
    if parts.len() != 5 || parts[0] != "roles" || parts[1] != "select" || parts[4] != "v1" {
        return None;
    }
    let panel_id = Uuid::parse_str(parts[2]).ok()?;
    Some((panel_id, parts[3].to_string()))
}

async fn respond_command(
    ctx: &Context,
    interaction: &CommandInteraction,
    outcome: InteractionOutcome,
) -> Result<(), BotError> {
    match outcome {
        InteractionOutcome::ImmediateResponse { content, ephemeral } => interaction
            .create_response(
                &ctx.http,
                CreateInteractionResponse::Message(
                    CreateInteractionResponseMessage::new()
                        .content(content)
                        .ephemeral(ephemeral),
                ),
            )
            .await
            .map_err(|e| BotError::DiscordApi(format!("response failed: {e}"))),
        InteractionOutcome::DeferredThenFollowup { content } => {
            interaction
                .create_response(
                    &ctx.http,
                    CreateInteractionResponse::Defer(CreateInteractionResponseMessage::new()),
                )
                .await
                .map_err(|e| BotError::DiscordApi(format!("defer failed: {e}")))?;
            interaction
                .create_followup(
                    &ctx.http,
                    serenity::builder::CreateInteractionResponseFollowup::new().content(content),
                )
                .await
                .map_err(|e| BotError::DiscordApi(format!("followup failed: {e}")))?;
            Ok(())
        }
        InteractionOutcome::Noop => Ok(()),
    }
}

async fn respond_component(
    ctx: &Context,
    interaction: &ComponentInteraction,
    outcome: InteractionOutcome,
) -> Result<(), BotError> {
    match outcome {
        InteractionOutcome::ImmediateResponse { content, ephemeral } => interaction
            .create_response(
                &ctx.http,
                CreateInteractionResponse::Message(
                    CreateInteractionResponseMessage::new()
                        .content(content)
                        .ephemeral(ephemeral),
                ),
            )
            .await
            .map_err(|e| BotError::DiscordApi(format!("component response failed: {e}"))),
        InteractionOutcome::DeferredThenFollowup { content } => {
            interaction
                .create_response(
                    &ctx.http,
                    CreateInteractionResponse::Defer(CreateInteractionResponseMessage::new()),
                )
                .await
                .map_err(|e| BotError::DiscordApi(format!("component defer failed: {e}")))?;
            interaction
                .create_followup(
                    &ctx.http,
                    serenity::builder::CreateInteractionResponseFollowup::new().content(content),
                )
                .await
                .map_err(|e| BotError::DiscordApi(format!("component followup failed: {e}")))?;
            Ok(())
        }
        InteractionOutcome::Noop => Ok(()),
    }
}

async fn respond_modal(
    ctx: &Context,
    interaction: &ModalInteraction,
    outcome: InteractionOutcome,
) -> Result<(), BotError> {
    match outcome {
        InteractionOutcome::ImmediateResponse { content, ephemeral } => interaction
            .create_response(
                &ctx.http,
                CreateInteractionResponse::Message(
                    CreateInteractionResponseMessage::new()
                        .content(content)
                        .ephemeral(ephemeral),
                ),
            )
            .await
            .map_err(|e| BotError::DiscordApi(format!("modal response failed: {e}"))),
        InteractionOutcome::DeferredThenFollowup { content } => {
            interaction
                .create_response(
                    &ctx.http,
                    CreateInteractionResponse::Defer(CreateInteractionResponseMessage::new()),
                )
                .await
                .map_err(|e| BotError::DiscordApi(format!("modal defer failed: {e}")))?;
            interaction
                .create_followup(
                    &ctx.http,
                    serenity::builder::CreateInteractionResponseFollowup::new().content(content),
                )
                .await
                .map_err(|e| BotError::DiscordApi(format!("modal followup failed: {e}")))?;
            Ok(())
        }
        InteractionOutcome::Noop => Ok(()),
    }
}
