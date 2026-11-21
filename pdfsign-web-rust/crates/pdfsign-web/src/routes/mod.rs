pub mod admin;
pub mod auth;
pub mod billing;
pub mod documents;
pub mod guest;
pub mod health;
pub mod jobs;
pub mod storage;
pub mod uploads;
pub mod verify;

use crate::state::AppState;
use axum::response::IntoResponse;
use axum::routing::{get, post, put};
use axum::Router;
use tower_http::services::{ServeDir, ServeFile};

async fn spa_index(state: axum::extract::State<AppState>) -> impl IntoResponse {
    let index = state.cfg.web_dist.join("index.html");
    match tokio::fs::read(&index).await {
        Ok(bytes) => (
            [(axum::http::header::CONTENT_TYPE, "text/html; charset=utf-8")],
            bytes,
        )
            .into_response(),
        Err(_) => axum::http::StatusCode::NOT_FOUND.into_response(),
    }
}

pub fn router(state: AppState) -> Router {
    let v1 = Router::new()
        .route("/health", get(health::health))
        .route("/auth/register", post(auth::register))
        .route("/auth/login", post(auth::login))
        .route("/auth/logout", post(auth::logout))
        .route("/auth/me", get(auth::me))
        .route("/guest/quota", get(guest::quota))
        .route("/billing/plans", get(billing::plans))
        .route("/billing/quota", get(billing::my_quota))
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
        .route("/admin/users", get(admin::list_users))
        .route("/admin/users/{user_id}/plan", post(admin::set_user_plan))
        .route("/storage/{*key}", get(storage::get_file));

    let static_dir = state.cfg.web_dist.clone();
    let index = static_dir.join("index.html");
    let assets = static_dir.join("assets");

    Router::new()
        .nest("/api/v1", v1)
        .route("/api/health", get(health::health))
        .nest_service("/assets", ServeDir::new(assets))
        .route_service("/", ServeFile::new(index))
        .fallback(get(spa_index))
        .with_state(state)
}
