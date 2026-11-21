use crate::error::{AppError, AppResult};
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::http::header;
use axum::response::IntoResponse;

pub async fn get_file(
    State(state): State<AppState>,
    Path(key): Path<String>,
) -> AppResult<impl IntoResponse> {
    // Prevent path escape
    if key.contains("..") {
        return Err(AppError::bad("Invalid key"));
    }
    let bytes = state.storage.read(&key).await?;
    let ct = if key.ends_with(".pdf") {
        "application/pdf"
    } else if key.ends_with(".png") {
        "image/png"
    } else if key.ends_with(".jpg") || key.ends_with(".jpeg") {
        "image/jpeg"
    } else {
        "application/octet-stream"
    };
    Ok((
        [
            (header::CONTENT_TYPE, ct),
            (header::CACHE_CONTROL, "private, max-age=300"),
        ],
        bytes,
    ))
}
