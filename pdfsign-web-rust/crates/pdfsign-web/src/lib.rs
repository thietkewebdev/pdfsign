pub mod auth;
pub mod config;
pub mod crypto;
pub mod error;
pub mod guest;
pub mod placement;
pub mod plans;
pub mod retention;
pub mod routes;
pub mod services;
pub mod state;
pub mod storage;

use crate::config::Config;
use crate::state::AppState;
use crate::storage::LocalStorage;
use sqlx::postgres::PgPoolOptions;
use std::path::PathBuf;

pub async fn build_state() -> anyhow::Result<AppState> {
    let cfg = Config::from_env();
    let storage = LocalStorage::new(&cfg);
    storage.ensure_root().await.map_err(|e| anyhow::anyhow!(e.message))?;
    let db = PgPoolOptions::new()
        .max_connections(10)
        .connect(&cfg.database_url)
        .await?;

    let migr_dir = find_migrations();
    tracing::info!(dir = %migr_dir.display(), "running SQL migrations");
    sqlx::migrate::Migrator::new(migr_dir)
        .await?
        .run(&db)
        .await?;

    Ok(AppState { db, cfg, storage })
}

fn find_migrations() -> PathBuf {
    // Prefer next to the binary (deploy layout), then cwd / repo paths.
    let mut candidates = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("migrations"));
            candidates.push(dir.join("../migrations"));
            candidates.push(dir.join("../share/pdfsign-web/migrations"));
        }
    }
    candidates.extend([
        PathBuf::from("migrations"),
        PathBuf::from("pdfsign-web-rust/migrations"),
        PathBuf::from("/workspace/pdfsign-web-rust/migrations"),
        PathBuf::from("/opt/pdfsign/migrations"),
    ]);
    for p in candidates {
        if p.exists() {
            return p;
        }
    }
    PathBuf::from("migrations")
}

pub fn app(state: AppState) -> axum::Router {
    use tower_http::cors::{Any, CorsLayer};
    use tower_http::limit::RequestBodyLimitLayer;
    use tower_http::trace::TraceLayer;

    routes::router(state)
        .layer(TraceLayer::new_for_http())
        .layer(RequestBodyLimitLayer::new(55 * 1024 * 1024))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
}
