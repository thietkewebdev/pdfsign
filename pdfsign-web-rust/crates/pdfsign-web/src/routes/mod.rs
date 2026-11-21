pub mod auth;
pub mod documents;
pub mod health;
pub mod jobs;
pub mod storage;
pub mod uploads;
pub mod verify;

use crate::state::AppState;
use axum::routing::{get, post, put};
use axum::Router;
use tower_http::services::{ServeDir, ServeFile};

pub fn router(state: AppState) -> Router {
    let v1 = Router::new()
        .route("/health", get(health::health))
        .route("/auth/register", post(auth::register))
        .route("/auth/login", post(auth::login))
        .route("/auth/logout", post(auth::logout))
        .route("/auth/me", get(auth::me))
        .route("/documents", get(documents::list).post(documents::upload))
        .route("/documents/{public_id}", get(documents::get_one))
        .route("/documents/{public_id}/file", get(documents::file))
        .route("/uploads", post(uploads::create))
        .route("/uploads/{id}/chunks/{n}", put(uploads::put_chunk))
        .route("/uploads/{id}/finish", post(uploads::finish))
        .route("/jobs", post(jobs::create))
        .route("/jobs/{job_id}/status", get(jobs::status))
        .route("/signer/handshake", post(jobs::handshake))
        .route("/signer/job", get(jobs::signer_job))
        .route("/signer/file", get(jobs::signer_file))
        .route("/signer/complete", post(jobs::complete))
        .route("/verify", post(verify::verify_upload))
        .route("/storage/{*key}", get(storage::get_file));

    let static_dir = std::env::var("WEB_DIST").unwrap_or_else(|_| "web/dist".into());
    let index = format!("{static_dir}/index.html");

    Router::new()
        .nest("/api/v1", v1)
        // Compat alias for older local scripts during transition
        .route("/api/health", get(health::health))
        .fallback_service(ServeDir::new(&static_dir).not_found_service(ServeFile::new(index)))
        .with_state(state)
}
