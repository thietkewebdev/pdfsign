use crate::config::Config;
use crate::storage::LocalStorage;
use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub cfg: Config,
    pub storage: LocalStorage,
}
