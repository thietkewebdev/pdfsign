use crate::crypto::{
    deep_link, generate_claim_code, generate_id, generate_job_token, hash_claim_code, hash_job_token,
    verify_claim_code, verify_job_token,
};
use crate::error::{AppError, AppResult};
use crate::placement::Placement;
use crate::services::verify_complete::{maybe_upgrade, verify_signed_pdf};
use crate::state::AppState;
use axum::extract::{Multipart, Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use chrono::{Duration, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::FromRow;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateJobBody {
    pub document_id: String,
    pub template_id: Option<String>,
    pub seal_image: Option<String>,
    pub placement: Value,
}

#[derive(FromRow)]
struct JobRow {
    id: String,
    document_id: String,
    document_version_id: String,
    job_token_hash: String,
    job_token: Option<String>,
    claim_code_hash: Option<String>,
    status: String,
    placement_json: String,
    seal_image_key: Option<String>,
    output_version_id: Option<String>,
    completed_at: Option<chrono::DateTime<chrono::Utc>>,
    claimed_at: Option<chrono::DateTime<chrono::Utc>>,
    expires_at: chrono::DateTime<chrono::Utc>,
}

fn job_token_from(headers: &HeaderMap) -> AppResult<String> {
    headers
        .get("x-job-token")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .ok_or_else(|| {
            AppError::coded(
                StatusCode::UNAUTHORIZED,
                "MISSING_JOB_TOKEN",
                "Missing x-job-token header",
            )
        })
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateJobBody>,
) -> AppResult<Json<Value>> {
    let placement = Placement::normalize(&body.placement)?;
    let mut placement_val = placement.to_json();
    if let Some(t) = &body.template_id {
        if let Some(obj) = placement_val.as_object_mut() {
            obj.insert("templateId".into(), json!(t));
        }
    }

    let doc: Option<(String, String)> = sqlx::query_as(
        r#"SELECT id, public_id FROM documents WHERE id = $1 OR public_id = $1"#,
    )
    .bind(&body.document_id)
    .fetch_optional(&state.db)
    .await?;
    let (doc_id, public_id) = doc.ok_or_else(|| AppError::not_found("Document not found"))?;

    let ver: Option<(String, i32)> = sqlx::query_as(
        r#"SELECT id, version FROM document_versions
           WHERE document_id = $1 ORDER BY version DESC LIMIT 1"#,
    )
    .bind(&doc_id)
    .fetch_optional(&state.db)
    .await?;
    let (ver_id, _) = ver.ok_or_else(|| AppError::not_found("No version found for document"))?;

    let job_token = generate_job_token();
    let job_token_hash = hash_job_token(&job_token);
    let claim_code = generate_claim_code();
    let claim_code_hash = hash_claim_code(&claim_code);
    let job_id = generate_id("job_");
    let expires_at = Utc::now() + Duration::minutes(state.cfg.job_expires_minutes);

    let mut seal_image_key: Option<String> = None;
    if body.template_id.as_deref() == Some("seal") {
        if let Some(data_url) = &body.seal_image {
            if let Some((meta, b64)) = data_url.split_once(',') {
                if meta.contains("image/") {
                    use base64::Engine;
                    if let Ok(buf) = base64::engine::general_purpose::STANDARD.decode(b64) {
                        if buf.len() <= 2 * 1024 * 1024 {
                            let key = format!("documents/{public_id}/seal_{job_id}.png");
                            state.storage.upload(&key, &buf).await?;
                            seal_image_key = Some(key);
                        }
                    }
                }
            }
        }
    }

    sqlx::query(
        r#"INSERT INTO signing_jobs (
             id, document_version_id, document_id, job_token_hash, job_token,
             claim_code_hash, status, placement_json, seal_image_key, expires_at
           ) VALUES ($1,$2,$3,$4,$5,$6,'CREATED',$7,$8,$9)"#,
    )
    .bind(&job_id)
    .bind(&ver_id)
    .bind(&doc_id)
    .bind(&job_token_hash)
    .bind(&job_token)
    .bind(&claim_code_hash)
    .bind(placement_val.to_string())
    .bind(&seal_image_key)
    .bind(expires_at)
    .execute(&state.db)
    .await?;

    let link = deep_link(
        &job_id,
        &claim_code,
        &state.cfg.public_host,
        body.template_id.as_deref(),
    );

    Ok(Json(json!({
        "jobId": job_id,
        "deepLink": link,
        "placement": placement,
        "documentId": doc_id,
        "expiresAt": expires_at.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        // Dev helper (not in prod cloud response): claim code for CLI e2e without deep-link decode.
        "claimCode": claim_code,
    })))
}

pub async fn claim(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
    Json(body): Json<Value>,
) -> AppResult<Json<Value>> {
    let code = body
        .get("code")
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            AppError::coded(StatusCode::BAD_REQUEST, "INVALID_REQUEST", "Invalid request")
        })?;

    let job = sqlx::query_as::<_, JobRow>("SELECT * FROM signing_jobs WHERE id = $1")
        .bind(&job_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| {
            AppError::coded(StatusCode::NOT_FOUND, "JOB_NOT_FOUND", "Job not found")
        })?;

    if job.status != "CREATED" {
        return Err(AppError::coded(
            StatusCode::BAD_REQUEST,
            "JOB_NOT_AVAILABLE",
            "Job is not available for signing",
        ));
    }
    if Utc::now() > job.expires_at {
        return Err(AppError::coded(
            StatusCode::GONE,
            "JOB_EXPIRED",
            "Job has expired",
        ));
    }
    if job.claimed_at.is_some() {
        return Err(AppError::coded(
            StatusCode::CONFLICT,
            "CLAIM_ALREADY_USED",
            "Claim code has already been used",
        ));
    }
    let Some(hash) = job.claim_code_hash.as_deref() else {
        return Err(AppError::coded(
            StatusCode::BAD_REQUEST,
            "CLAIM_NOT_SUPPORTED",
            "Job was created before claim flow",
        ));
    };
    if !verify_claim_code(code, hash) {
        return Err(AppError::coded(
            StatusCode::UNAUTHORIZED,
            "INVALID_CLAIM_CODE",
            "Invalid claim code",
        ));
    }
    let Some(token) = job.job_token.clone() else {
        return Err(AppError::coded(
            StatusCode::BAD_REQUEST,
            "CLAIM_NOT_SUPPORTED",
            "Job was created before claim flow",
        ));
    };

    sqlx::query("UPDATE signing_jobs SET claimed_at = NOW() WHERE id = $1")
        .bind(&job_id)
        .execute(&state.db)
        .await?;

    Ok(Json(json!({
        "jobToken": token,
        "apiBaseUrl": state.cfg.public_url.trim_end_matches('/'),
    })))
}

pub async fn get_job(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
    headers: HeaderMap,
) -> AppResult<Json<Value>> {
    let token = job_token_from(&headers)?;
    let job = sqlx::query_as::<_, JobRow>("SELECT * FROM signing_jobs WHERE id = $1")
        .bind(&job_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| {
            AppError::coded(StatusCode::NOT_FOUND, "JOB_NOT_FOUND", "Job not found")
        })?;

    if !verify_job_token(&token, &job.job_token_hash) {
        return Err(AppError::coded(
            StatusCode::UNAUTHORIZED,
            "INVALID_JOB_TOKEN",
            "Invalid token",
        ));
    }
    if job.status != "CREATED" {
        return Err(AppError::coded(
            StatusCode::BAD_REQUEST,
            "JOB_NOT_AVAILABLE",
            "Job is not available for signing",
        ));
    }
    if Utc::now() > job.expires_at {
        return Err(AppError::coded(
            StatusCode::GONE,
            "JOB_EXPIRED",
            "Job has expired",
        ));
    }

    let meta: Option<(String, String, String)> = sqlx::query_as(
        r#"SELECT d.title, d.public_id, v.storage_key
           FROM documents d
           JOIN document_versions v ON v.id = $1
           WHERE d.id = $2"#,
    )
    .bind(&job.document_version_id)
    .bind(&job.document_id)
    .fetch_optional(&state.db)
    .await?;
    let (title, public_id, storage_key) =
        meta.ok_or_else(|| AppError::not_found("Document not found"))?;

    let placement: Value = serde_json::from_str(&job.placement_json).unwrap_or(json!({}));
    let placement = Placement::normalize(&placement)?.to_json();

    let input_pdf_url = state.storage.public_file_url(&storage_key);
    let seal_image_url = job
        .seal_image_key
        .as_ref()
        .map(|k| state.storage.public_file_url(k));

    Ok(Json(json!({
        "document": { "title": title, "publicId": public_id },
        "inputPdfUrl": input_pdf_url,
        "sealImageUrl": seal_image_url,
        "placement": placement,
        "status": job.status,
    })))
}

pub async fn status(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
) -> AppResult<Json<Value>> {
    let job = sqlx::query_as::<_, JobRow>("SELECT * FROM signing_jobs WHERE id = $1")
        .bind(&job_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| {
            AppError::coded(StatusCode::NOT_FOUND, "JOB_NOT_FOUND", "Job not found")
        })?;

    let mut status = job.status.clone();
    if status == "CREATED" && Utc::now() > job.expires_at {
        status = "EXPIRED".into();
        let _ = sqlx::query("UPDATE signing_jobs SET status = 'EXPIRED' WHERE id = $1")
            .bind(&job_id)
            .execute(&state.db)
            .await;
    }

    let mut signed_download_url = None;
    let mut output_version = None;
    if status == "COMPLETED" {
        if let Some(oid) = &job.output_version_id {
            let ov: Option<(i32, String)> =
                sqlx::query_as("SELECT version, storage_key FROM document_versions WHERE id = $1")
                    .bind(oid)
                    .fetch_optional(&state.db)
                    .await?;
            if let Some((version, key)) = ov {
                signed_download_url = Some(state.storage.public_file_url(&key));
                output_version = Some(json!({ "version": version, "storageKey": key }));
            }
        }
    }

    Ok(Json(json!({
        "status": status,
        "expiresAt": job.expires_at.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        "completedAt": job.completed_at.map(|t| t.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)),
        "outputVersionId": job.output_version_id,
        "outputVersion": output_version,
        "signedDownloadUrl": signed_download_url,
    })))
}

pub async fn complete(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> AppResult<Json<Value>> {
    let token = job_token_from(&headers)?;
    let job = sqlx::query_as::<_, JobRow>("SELECT * FROM signing_jobs WHERE id = $1")
        .bind(&job_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| {
            AppError::coded(StatusCode::NOT_FOUND, "JOB_NOT_FOUND", "Job not found")
        })?;

    if !verify_job_token(&token, &job.job_token_hash) {
        return Err(AppError::coded(
            StatusCode::UNAUTHORIZED,
            "INVALID_JOB_TOKEN",
            "Invalid token",
        ));
    }
    if job.status != "CREATED" {
        return Err(AppError::coded(
            StatusCode::BAD_REQUEST,
            "JOB_NOT_AVAILABLE",
            "Job is not available for signing",
        ));
    }
    if Utc::now() > job.expires_at {
        return Err(AppError::coded(
            StatusCode::GONE,
            "JOB_EXPIRED",
            "Job has expired",
        ));
    }

    let mut file_bytes: Option<Vec<u8>> = None;
    let mut cert_meta_raw: Option<String> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| {
            AppError::coded(
                StatusCode::BAD_REQUEST,
                "INVALID_MULTIPART_BODY",
                e.to_string(),
            )
        })?
    {
        let name = field.name().unwrap_or("").to_string();
        if name == "file" || name == "signedPdf" {
            let ct = field.content_type().map(|s| s.to_string());
            let data = field.bytes().await.map_err(|e| {
                AppError::coded(
                    StatusCode::BAD_REQUEST,
                    "INVALID_MULTIPART_BODY",
                    e.to_string(),
                )
            })?;
            if ct.as_deref().is_some_and(|c| c != "application/pdf") {
                // still accept if bytes look like PDF
            }
            if data.len() > state.cfg.max_signed_pdf_bytes {
                return Err(AppError::coded(
                    StatusCode::PAYLOAD_TOO_LARGE,
                    "FILE_TOO_LARGE",
                    "Signed PDF exceeds server limit (25MB)",
                ));
            }
            file_bytes = Some(data.to_vec());
        } else if name == "certMeta" {
            cert_meta_raw = Some(field.text().await.unwrap_or_default());
        }
    }

    let bytes = file_bytes.ok_or_else(|| {
        AppError::coded(
            StatusCode::BAD_REQUEST,
            "INVALID_MULTIPART_BODY",
            "Missing or invalid file (signed PDF)",
        )
    })?;

    let cert_meta: Option<Value> = match cert_meta_raw.as_deref() {
        Some(s) if !s.trim().is_empty() => {
            let v: Value = serde_json::from_str(s).map_err(|_| {
                AppError::coded(
                    StatusCode::BAD_REQUEST,
                    "INVALID_CERT_META",
                    "certMeta must be valid JSON",
                )
            })?;
            Some(v)
        }
        _ => None,
    };

    let verified = verify_signed_pdf(&bytes, cert_meta.as_ref())?;
    let mut pdf = verified.pdf;
    pdf = maybe_upgrade(
        pdf,
        state.cfg.server_upgrade_level.as_deref(),
        state.cfg.tsa_url.as_deref(),
    );

    let public_id: String = sqlx::query_scalar("SELECT public_id FROM documents WHERE id = $1")
        .bind(&job.document_id)
        .fetch_one(&state.db)
        .await?;

    let cur_ver: i32 = sqlx::query_scalar(
        "SELECT version FROM document_versions WHERE id = $1",
    )
    .bind(&job.document_version_id)
    .fetch_one(&state.db)
    .await?;
    let next_version = cur_ver + 1;
    let storage_key = format!("documents/{public_id}/v{next_version}.pdf");
    state.storage.upload(&storage_key, &pdf).await?;

    let out_id = generate_id("ver_");
    sqlx::query(
        r#"INSERT INTO document_versions (id, document_id, version, storage_key, storage_driver, size_bytes)
           VALUES ($1, $2, $3, $4, 'local', $5)"#,
    )
    .bind(&out_id)
    .bind(&job.document_id)
    .bind(next_version)
    .bind(&storage_key)
    .bind(pdf.len() as i32)
    .execute(&state.db)
    .await?;

    sqlx::query(
        r#"UPDATE signing_jobs SET
             status = 'COMPLETED',
             output_version_id = $2,
             cert_meta_json = $3,
             verify_report_json = $4,
             completed_at = NOW()
           WHERE id = $1"#,
    )
    .bind(&job_id)
    .bind(&out_id)
    .bind(cert_meta.as_ref().map(|v| v.to_string()))
    .bind(verified.report_json.to_string())
    .execute(&state.db)
    .await?;

    let app = state.cfg.public_url.trim_end_matches('/');
    Ok(Json(json!({
        "signedPublicUrl": format!("{app}/d/{public_id}"),
        "signedDownloadUrl": state.storage.public_file_url(&storage_key),
        "publicId": public_id,
        "versionNumber": next_version,
        "verify": verified.report_json,
    })))
}
