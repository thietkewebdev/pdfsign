use crate::auth::{AuthUser, OptionalUser};
use crate::crypto::{generate_id, generate_public_id};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use axum::extract::{Multipart, Path, State};
use axum::http::{header, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use serde_json::{json, Value};
use sqlx::FromRow;

#[derive(FromRow)]
struct DocListRow {
    id: String,
    public_id: String,
    title: Option<String>,
    status: String,
    created_at: chrono::DateTime<chrono::Utc>,
    version: Option<i32>,
}

pub async fn list(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    let rows = sqlx::query_as::<_, DocListRow>(
        r#"SELECT d.id, d.public_id, d.title, d.status, d.created_at,
                  (SELECT MAX(v.version) FROM document_versions v WHERE v.document_id = d.id) AS version
           FROM documents d
           WHERE d.user_id = $1 AND d.status = 'ACTIVE'
           ORDER BY d.created_at DESC
           LIMIT 100"#,
    )
    .bind(&user.0.id)
    .fetch_all(&state.db)
    .await?;

    let docs: Vec<Value> = rows
        .into_iter()
        .map(|r| {
            json!({
                "id": r.id,
                "publicId": r.public_id,
                "title": r.title,
                "status": r.status,
                "createdAt": r.created_at,
                "version": r.version.unwrap_or(1),
            })
        })
        .collect();
    Ok(Json(json!({ "documents": docs })))
}

pub async fn upload(
    State(state): State<AppState>,
    user: OptionalUser,
    mut multipart: Multipart,
) -> AppResult<Json<Value>> {
    let mut title: Option<String> = None;
    let mut file_bytes: Option<Vec<u8>> = None;
    let mut file_name: Option<String> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::bad(e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        if name == "title" {
            title = Some(
                field
                    .text()
                    .await
                    .map_err(|e| AppError::bad(e.to_string()))?,
            );
        } else if name == "file" {
            file_name = field.file_name().map(|s| s.to_string());
            let ct = field.content_type().map(|s| s.to_string());
            let data = field
                .bytes()
                .await
                .map_err(|e| AppError::bad(e.to_string()))?;
            if ct.as_deref() != Some("application/pdf")
                && !file_name
                    .as_deref()
                    .unwrap_or("")
                    .to_lowercase()
                    .ends_with(".pdf")
            {
                return Err(AppError::bad("File must be a PDF"));
            }
            if data.len() > 50 * 1024 * 1024 {
                return Err(AppError::new(
                    StatusCode::PAYLOAD_TOO_LARGE,
                    "PDF quá lớn (tối đa 50MB)",
                ));
            }
            file_bytes = Some(data.to_vec());
        }
    }

    let bytes = file_bytes.ok_or_else(|| AppError::bad("Missing or invalid file"))?;
    let public_id = generate_public_id();
    let doc_id = generate_id("doc_");
    let ver_id = generate_id("ver_");
    let storage_key = format!("documents/{public_id}/v1.pdf");
    let title = title
        .filter(|s| !s.trim().is_empty())
        .or(file_name)
        .unwrap_or_else(|| "Untitled".into());

    state.storage.upload(&storage_key, &bytes).await?;

    let owner = user.0.as_ref().map(|u| u.id.clone());
    sqlx::query(
        r#"INSERT INTO documents (id, public_id, title, status, user_id)
           VALUES ($1, $2, $3, 'ACTIVE', $4)"#,
    )
    .bind(&doc_id)
    .bind(&public_id)
    .bind(&title)
    .bind(&owner)
    .execute(&state.db)
    .await?;

    sqlx::query(
        r#"INSERT INTO document_versions (id, document_id, version, storage_key, storage_driver, size_bytes)
           VALUES ($1, $2, 1, $3, 'local', $4)"#,
    )
    .bind(&ver_id)
    .bind(&doc_id)
    .bind(&storage_key)
    .bind(bytes.len() as i32)
    .execute(&state.db)
    .await?;

    let public_url = format!("{}/d/{}", state.cfg.public_url.trim_end_matches('/'), public_id);
    Ok(Json(json!({
        "documentId": doc_id,
        "publicId": public_id,
        "publicUrl": public_url,
        "title": title,
        "version": 1,
    })))
}

#[derive(FromRow)]
struct DocDetail {
    id: String,
    public_id: String,
    title: Option<String>,
    status: String,
    created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn get_one(
    State(state): State<AppState>,
    Path(public_id): Path<String>,
) -> AppResult<Json<Value>> {
    let doc = sqlx::query_as::<_, DocDetail>(
        r#"SELECT id, public_id, title, status, created_at FROM documents
           WHERE public_id = $1 OR id = $1"#,
    )
    .bind(&public_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::not_found("Document not found"))?;

    let version: Option<(i32, String, i32)> = sqlx::query_as(
        r#"SELECT version, storage_key, size_bytes FROM document_versions
           WHERE document_id = $1 ORDER BY version DESC LIMIT 1"#,
    )
    .bind(&doc.id)
    .fetch_optional(&state.db)
    .await?;

    let (version, size) = version
        .map(|(v, _, s)| (v, s))
        .unwrap_or((1, 0));

    let file_url = format!(
        "{}/api/documents/{}/file",
        state.cfg.public_url.trim_end_matches('/'),
        doc.public_id
    );

    Ok(Json(json!({
        "id": doc.id,
        "publicId": doc.public_id,
        "title": doc.title,
        "status": doc.status,
        "createdAt": doc.created_at,
        "version": version,
        "sizeBytes": size,
        "fileUrl": file_url,
    })))
}

pub async fn file(
    State(state): State<AppState>,
    Path(public_id): Path<String>,
) -> AppResult<impl IntoResponse> {
    let doc_id: Option<(String,)> =
        sqlx::query_as("SELECT id FROM documents WHERE public_id = $1 OR id = $1")
            .bind(&public_id)
            .fetch_optional(&state.db)
            .await?;
    let doc_id = doc_id
        .ok_or_else(|| AppError::not_found("Document not found"))?
        .0;
    let key: Option<(String,)> = sqlx::query_as(
        r#"SELECT storage_key FROM document_versions
           WHERE document_id = $1 ORDER BY version DESC LIMIT 1"#,
    )
    .bind(&doc_id)
    .fetch_optional(&state.db)
    .await?;
    let key = key
        .ok_or_else(|| AppError::not_found("No version"))?
        .0;
    let bytes = state.storage.read(&key).await?;
    Ok((
        [
            (header::CONTENT_TYPE, "application/pdf"),
            (header::CACHE_CONTROL, "private, max-age=60"),
        ],
        bytes,
    ))
}
