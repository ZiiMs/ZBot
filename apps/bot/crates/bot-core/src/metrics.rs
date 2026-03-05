#[derive(Debug, Clone)]
pub struct Metrics {
    pub interactions_total: String,
    pub interaction_errors_total: String,
    pub jobs_claimed_total: String,
    pub jobs_failed_total: String,
}

impl Default for Metrics {
    fn default() -> Self {
        Self {
            interactions_total: "interactions_total".to_string(),
            interaction_errors_total: "interaction_errors_total".to_string(),
            jobs_claimed_total: "jobs_claimed_total".to_string(),
            jobs_failed_total: "jobs_failed_total".to_string(),
        }
    }
}
