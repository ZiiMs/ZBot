use std::net::SocketAddr;
use std::sync::Arc;

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;

use crate::metrics::MetricsRegistry;

#[derive(Clone)]
pub struct HealthState {
    pub ready: bool,
    pub metrics: Arc<MetricsRegistry>,
}

pub async fn run_http_server(addr: SocketAddr, state: HealthState) -> anyhow::Result<()> {
    let app = Router::new()
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .route("/metrics", get(metrics))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn live() -> impl IntoResponse {
    (StatusCode::OK, "ok")
}

async fn ready(State(state): State<HealthState>) -> impl IntoResponse {
    if state.ready {
        (StatusCode::OK, "ready")
    } else {
        (StatusCode::SERVICE_UNAVAILABLE, "not_ready")
    }
}

async fn metrics(State(state): State<HealthState>) -> impl IntoResponse {
    match state.metrics.gather() {
        Ok(payload) => (StatusCode::OK, payload),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "failed".to_string()),
    }
}
