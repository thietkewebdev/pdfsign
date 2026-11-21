use crate::auth::{user_from_jar, OptionalUser};
use crate::crypto::verify_storage_download_sig;
use crate::error::{AppError, AppResult};
use crate::guest::guest_from_jar;
use crate::state::AppState;
use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum_extra::extract::cookie::CookieJar;
use serde::Deserialize;

#[derive(Deserialize, Default)]
pub struct StorageQuery {
    pub exp: Option<i64>,
    pub k: Option<String>,
}

/// Extract `documents/{publicId}/...` public id from a storage key.
fn public_id_from_key(key: &str) -> Option<&str> {
    let rest = key.strip_prefix("documents/")?;
    let public_id = rest.split('/').next()?;
    if public_id.is_empty() {
        None
    } else {
        Some(public_id)
    }
}

async fn authorize_storage_key(
    state: &AppState,
    jar: &CookieJar,
    _headers: &HeaderMap,
    key: &str,
    q: &StorageQuery,
) -> AppResult<()> {
    // 1) Short-lived HMAC-signed URL (used for signedDownloadUrl / e2e / share links)
    if let (Some(exp), Some(k)) = (q.exp, q.k.as_deref()) {
        if verify_storage_download_sig(&state.cfg.jwt_secret, key, exp, k) {
            return Ok(());
        }
        return Err(AppError::coded(
            StatusCode::FORBIDDEN,
            "INVALID_DOWNLOAD_SIG",
            "Link tải không hợp lệ hoặc đã hết hạn",
        ));
    }

    // 2) Owner session or guest cookie that owns the document
    let Some(public_id) = public_id_from_key(key) else {
        // Non-document keys (e.g. seals) require a signed URL
        return Err(AppError::coded(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "Không có quyền tải file này",
        ));
    };

    let row: Option<(Option<String>, Option<String>, String)> = sqlx::query_as(
        r#"SELECT user_id, guest_id, status FROM documents
           WHERE public_id = $1"#,
    )
    .bind(public_id)
    .fetch_optional(&state.db)
    .await?;

    let Some((user_id, guest_id, status)) = row else {
        return Err(AppError::not_found("File not found"));
    };
    if status == "EXPIRED" || status == "PURGED" {
        return Err(AppError::coded(
            StatusCode::GONE,
            "DOCUMENT_EXPIRED",
            "File đã hết hạn lưu và bị xóa tự động",
        ));
    }

    if let Some(u) = user_from_jar(state, jar).await? {
        if user_id.as_deref() == Some(u.id.as_str()) {
            return Ok(());
        }
        // Other logged-in user → hide existence
        return Err(AppError::not_found("File not found"));
    }

    if let Some(g) = guest_from_jar(state, jar).await? {
        if guest_id.as_deref() == Some(g.id.as_str()) {
            return Ok(());
        }
    }

    Err(AppError::coded(
        StatusCode::FORBIDDEN,
        "FORBIDDEN",
        "Không có quyền tải file này",
    ))
}

pub async fn get_file(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
    Path(key): Path<String>,
    Query(q): Query<StorageQuery>,
    _user: OptionalUser,
) -> AppResult<impl IntoResponse> {
    // Prevent path escape
    if key.contains("..") {
        return Err(AppError::bad("Invalid key"));
    }

    authorize_storage_key(&state, &jar, &headers, &key, &q).await?;

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
            (header::CACHE_CONTROL, "private, max-age=60"),
        ],
        bytes,
    ))
}
