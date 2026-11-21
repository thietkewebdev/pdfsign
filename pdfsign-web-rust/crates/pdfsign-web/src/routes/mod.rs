pub mod auth;
pub mod documents;
pub mod health;
pub mod jobs;
pub mod signer;
pub mod storage;
pub mod verify;

use crate::state::AppState;
use axum::routing::{get, post};
use axum::Router;
use tower_http::services::{ServeDir, ServeFile};

pub fn router(state: AppState) -> Router {
    let api = Router::new()
        .route("/health", get(health::health))
        .route("/auth/register", post(auth::register))
        .route("/auth/login", post(auth::login))
        .route("/auth/logout", post(auth::logout))
        .route("/auth/me", get(auth::me))
        .route("/documents", get(documents::list).post(documents::upload))
        .route("/documents/{public_id}", get(documents::get_one))
        .route("/documents/{public_id}/file", get(documents::file))
        .route("/jobs", post(jobs::create))
        .route("/jobs/{job_id}", get(jobs::get_job))
        .route("/jobs/{job_id}/claim", post(jobs::claim))
        .route("/jobs/{job_id}/complete", post(jobs::complete))
        .route("/jobs/{job_id}/status", get(jobs::status))
        .route("/verify", post(verify::verify_upload))
        .route("/signer/manifest", get(signer::manifest))
        .route("/signer/download", get(signer::download))
        .route("/storage/{*key}", get(storage::get_file));

    let static_dir = std::env::var("WEB_DIST").unwrap_or_else(|_| "web/dist".into());
    let index = format!("{static_dir}/index.html");

    Router::new()
        .nest("/api", api)
        .fallback_service(
            ServeDir::new(&static_dir)
                .not_found_service(ServeFile::new(index)),
        )
        .with_state(state)
}
