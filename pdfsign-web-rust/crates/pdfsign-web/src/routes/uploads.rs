use crate::auth::AuthUser;
use crate::crypto::{generate_id, generate_public_id};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use chrono::{Duration, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::fs::OpenOptions;
use tokio::io::{AsyncSeekExt, AsyncWriteExt};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUpload {
    pub title: Option<String>,
    pub total_bytes: Option<i64>,
    pub chunk_size: Option<i32>,
}

pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateUpload>,
) -> AppResult<Json<Value>> {
    let id = generate_id("upl_");
    let chunk_size = body.chunk_size.unwrap_or(1024 * 1024).clamp(64 * 1024, 8 * 1024 * 1024);
    let key = format!("uploads/{id}.part");
    let expires = Utc::now() + Duration::hours(6);
    state.storage.upload(&key, &[]).await?;
    sqlx::query(
        r#"INSERT INTO uploads (id, user_id, title, total_bytes, chunk_size, storage_key, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)"#,
    )
    .bind(&id)
    .bind(&user.0.id)
    .bind(body.title.as_deref())
    .bind(body.total_bytes)
    .bind(chunk_size)
    .bind(&key)
    .bind(expires)
    .execute(&state.db)
    .await?;
    Ok(Json(json!({
        "uploadId": id,
        "chunkSize": chunk_size,
        "expiresAt": expires.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
    })))
}

pub async fn put_chunk(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, n)): Path<(String, u32)>,
    body: Bytes,
) -> AppResult<Json<Value>> {
    let row: Option<(String, i32, String, String)> = sqlx::query_as(
        r#"SELECT storage_key, chunk_size, status, user_id FROM uploads WHERE id = $1"#,
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await?;
    let (key, chunk_size, status, owner) =
        row.ok_or_else(|| AppError::not_found("Upload not found"))?;
    if owner != user.0.id {
        return Err(AppError::unauthorized("Unauthorized"));
    }
    if status != "open" {
        return Err(AppError::bad("Upload is closed"));
    }
    if body.len() as i32 > chunk_size + 1024 {
        return Err(AppError::coded(
            StatusCode::PAYLOAD_TOO_LARGE,
            "FILE_TOO_LARGE",
            "Chunk too large",
        ));
    }
    let path = state.storage.abs_path(&key);
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .open(&path)
        .await
        .map_err(|e| AppError::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let offset = (n as u64) * (chunk_size as u64);
    file.seek(std::io::SeekFrom::Start(offset))
        .await
        .map_err(|e| AppError::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    file.write_all(&body)
        .await
        .map_err(|e| AppError::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    sqlx::query("UPDATE uploads SET received = GREATEST(received, $2) WHERE id = $1")
        .bind(&id)
        .bind((offset + body.len() as u64) as i64)
        .execute(&state.db)
        .await?;
    Ok(Json(json!({ "ok": true, "chunk": n, "bytes": body.len() })))
}

pub async fn finish(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<Value>> {
    let row: Option<(String, Option<String>, String)> =
        sqlx::query_as(r#"SELECT storage_key, title, status FROM uploads WHERE id = $1 AND user_id = $2"#)
            .bind(&id)
            .bind(&user.0.id)
            .fetch_optional(&state.db)
            .await?;
    let (part_key, title, status) = row.ok_or_else(|| AppError::not_found("Upload not found"))?;
    if status != "open" {
        return Err(AppError::bad("Upload already finished"));
    }
    let bytes = state.storage.read(&part_key).await?;
    if bytes.len() < 5 || &bytes[..4] != b"%PDF" {
        return Err(AppError::bad("Upload is not a PDF"));
    }
    let public_id = generate_public_id();
    let doc_id = generate_id("doc_");
    let ver_id = generate_id("ver_");
    let storage_key = format!("documents/{public_id}/v1.pdf");
    state.storage.upload(&storage_key, &bytes).await?;
    let title = title.unwrap_or_else(|| "Untitled".into());
    let expires_at = crate::plans::expires_from_now(&state.cfg);
    sqlx::query(
        r#"INSERT INTO documents (id, public_id, title, status, user_id, expires_at)
           VALUES ($1,$2,$3,'ACTIVE',$4,$5)"#,
    )
    .bind(&doc_id)
    .bind(&public_id)
    .bind(&title)
    .bind(&user.0.id)
    .bind(expires_at)
    .execute(&state.db)
    .await?;
    sqlx::query(
        r#"INSERT INTO document_versions (id, document_id, version, storage_key, storage_driver, size_bytes)
           VALUES ($1,$2,1,$3,'local',$4)"#,
    )
    .bind(&ver_id)
    .bind(&doc_id)
    .bind(&storage_key)
    .bind(bytes.len() as i32)
    .execute(&state.db)
    .await?;
    sqlx::query("UPDATE uploads SET status = 'finished' WHERE id = $1")
        .bind(&id)
        .execute(&state.db)
        .await?;
    Ok(Json(json!({
        "documentId": doc_id,
        "publicId": public_id,
        "title": title,
        "version": 1,
    })))
}
