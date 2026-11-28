pub mod auth;
pub mod config;
pub mod crypto;
pub mod error;
pub mod guest;
pub mod placement;
pub mod plans;
pub mod ratelimit;
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
    storage
        .ensure_root()
        .await
        .map_err(|e| anyhow::anyhow!(e.message))?;
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
    use axum::http::{header, HeaderName, HeaderValue, Method};
    use std::time::Duration;
    use tower_http::cors::{AllowOrigin, CorsLayer};
    use tower_http::limit::RequestBodyLimitLayer;
    use tower_http::trace::TraceLayer;

    let origins: Vec<HeaderValue> = state
        .cfg
        .cors_origins
        .iter()
        .filter_map(|o| o.parse().ok())
        .collect();
    // Credentials forbid Allow-Headers: *; list what the SPA / desktop send.
    let allow_headers = [
        header::CONTENT_TYPE,
        header::AUTHORIZATION,
        header::ACCEPT,
        HeaderName::from_static("x-pdfsign-fingerprint"),
        HeaderName::from_static("idempotency-key"),
        HeaderName::from_static("x-admin-token"),
    ];
    let methods = [
        Method::GET,
        Method::POST,
        Method::PUT,
        Method::DELETE,
        Method::OPTIONS,
    ];
    let cors = if origins.is_empty() {
        CorsLayer::new()
            .allow_origin(AllowOrigin::predicate(|_, _| true))
            .allow_methods(methods.clone())
            .allow_headers(allow_headers.clone())
            .allow_credentials(true)
    } else {
        CorsLayer::new()
            .allow_origin(AllowOrigin::list(origins))
            .allow_methods(methods)
            .allow_headers(allow_headers)
            .allow_credentials(true)
    };

    routes::router(state)
        .layer(crate::ratelimit::RateLimitLayer::new(
            120,
            Duration::from_secs(60),
        ))
        .layer(TraceLayer::new_for_http())
        .layer(RequestBodyLimitLayer::new(55 * 1024 * 1024))
        .layer(cors)
}
