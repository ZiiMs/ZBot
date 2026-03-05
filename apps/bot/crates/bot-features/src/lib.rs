pub mod ping;
pub mod reminders_sample;
pub mod router;

use std::sync::Arc;

use bot_core::CommandModule;

pub fn default_modules() -> Vec<Arc<dyn CommandModule>> {
    vec![
        Arc::new(ping::PingModule),
        Arc::new(reminders_sample::RemindersSampleModule),
    ]
}
