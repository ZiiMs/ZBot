use std::sync::Arc;

use bot_core::Metrics;
use prometheus::{Encoder, HistogramOpts, HistogramVec, IntCounterVec, Registry, TextEncoder};

#[derive(Clone)]
pub struct MetricsRegistry {
    registry: Registry,
    interactions_total: IntCounterVec,
    interaction_errors_total: IntCounterVec,
    jobs_claimed_total: IntCounterVec,
    jobs_failed_total: IntCounterVec,
    interaction_latency_seconds: HistogramVec,
}

impl MetricsRegistry {
    pub fn new() -> Result<Self, prometheus::Error> {
        let registry = Registry::new();

        let interactions_total = IntCounterVec::new(
            prometheus::Opts::new("interactions_total", "Total interaction events handled"),
            &["route"],
        )?;
        let interaction_errors_total = IntCounterVec::new(
            prometheus::Opts::new(
                "interaction_errors_total",
                "Total interaction handler failures",
            ),
            &["route", "kind"],
        )?;
        let jobs_claimed_total = IntCounterVec::new(
            prometheus::Opts::new("jobs_claimed_total", "Total jobs claimed"),
            &["job"],
        )?;
        let jobs_failed_total = IntCounterVec::new(
            prometheus::Opts::new("jobs_failed_total", "Total jobs failed"),
            &["job"],
        )?;
        let interaction_latency_seconds = HistogramVec::new(
            HistogramOpts::new(
                "interaction_latency_seconds",
                "Interaction latency in seconds",
            ),
            &["route"],
        )?;

        registry.register(Box::new(interactions_total.clone()))?;
        registry.register(Box::new(interaction_errors_total.clone()))?;
        registry.register(Box::new(jobs_claimed_total.clone()))?;
        registry.register(Box::new(jobs_failed_total.clone()))?;
        registry.register(Box::new(interaction_latency_seconds.clone()))?;

        Ok(Self {
            registry,
            interactions_total,
            interaction_errors_total,
            jobs_claimed_total,
            jobs_failed_total,
            interaction_latency_seconds,
        })
    }

    pub fn core_metrics(&self) -> Arc<Metrics> {
        Arc::new(Metrics::default())
    }

    pub fn inc_interaction(&self, route: &str) {
        self.interactions_total.with_label_values(&[route]).inc();
    }

    pub fn inc_interaction_error(&self, route: &str, kind: &str) {
        self.interaction_errors_total
            .with_label_values(&[route, kind])
            .inc();
    }

    pub fn observe_interaction_latency(&self, route: &str, value_seconds: f64) {
        self.interaction_latency_seconds
            .with_label_values(&[route])
            .observe(value_seconds);
    }

    pub fn inc_jobs_claimed(&self, job: &str, count: u64) {
        self.jobs_claimed_total
            .with_label_values(&[job])
            .inc_by(count);
    }

    pub fn inc_job_failed(&self, job: &str) {
        self.jobs_failed_total.with_label_values(&[job]).inc();
    }

    pub fn gather(&self) -> Result<String, std::io::Error> {
        let metric_families = self.registry.gather();
        let encoder = TextEncoder::new();
        let mut buf = vec![];
        encoder
            .encode(&metric_families, &mut buf)
            .map_err(std::io::Error::other)?;
        String::from_utf8(buf).map_err(std::io::Error::other)
    }
}
