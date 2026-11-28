use crate::auth::OptionalUser;
use crate::crypto::{
    deep_link, file_download_sig, generate_id, generate_jti, issue_access_jwt, issue_launch_jwt,
    verify_file_download_sig,
};
use crate::error::{AppError, AppResult};
use crate::guest::{
    assert_under_limit, ensure_guest, guest_from_jar, record_completion, GUEST_FREE_LIMIT,
};
use crate::placement::Placement;
use crate::plans::{assert_can_sign, expires_from_now, record_signed_usage, retention_label};
use crate::services::verify_complete::{maybe_upgrade, verify_signed_pdf};
use crate::state::AppState;
use axum::extract::{Multipart, Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use axum_extra::extract::cookie::CookieJar;
use chrono::{Duration, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::FromRow;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateJobBody {
    pub document_id: String,
    pub template_id: Option<String>,
    pub placement: Value,
}

#[derive(FromRow)]
struct JobRow {
    id: String,
    document_id: String,
    document_version_id: String,
    status: String,
    placement_json: String,
    template_id: Option<String>,
    seal_image_key: Option<String>,
    launch_jti: String,
    launch_used_at: Option<chrono::DateTime<chrono::Utc>>,
    idempotency_key: String,
    complete_response_json: Option<String>,
    output_version_id: Option<String>,
    completed_at: Option<chrono::DateTime<chrono::Utc>>,
    expires_at: chrono::DateTime<chrono::Utc>,
}

pub async fn create(
    State(state): State<AppState>,
    user: OptionalUser,
    jar: CookieJar,
    headers: HeaderMap,
    Json(body): Json<CreateJobBody>,
) -> AppResult<(CookieJar, Json<Value>)> {
    let placement = Placement::normalize(&body.placement)?;
    let mut jar = jar;
    let mut guest_remaining = None;

    let doc: Option<(String, String, Option<String>, Option<String>)> = if let Some(u) = &user.0 {
        assert_can_sign(&state, &u.id).await?;
        // Exact ownership only — never allow foreign guest docs via user_id IS NULL.
        sqlx::query_as(
            r#"SELECT id, public_id, user_id, guest_id FROM documents
               WHERE (id = $1 OR public_id = $1)
                 AND status = 'ACTIVE' AND purged_at IS NULL
                 AND user_id = $2"#,
        )
        .bind(&body.document_id)
        .bind(&u.id)
        .fetch_optional(&state.db)
        .await?
    } else {
        let (j, guest) = ensure_guest(&state, jar, &headers).await?;
        jar = j;
        let used = assert_under_limit(&state, &guest, &headers).await?;
        guest_remaining = Some(GUEST_FREE_LIMIT - used);
        sqlx::query_as(
            r#"SELECT id, public_id, user_id, guest_id FROM documents
               WHERE (id = $1 OR public_id = $1)
                 AND status = 'ACTIVE' AND purged_at IS NULL
                 AND guest_id = $2"#,
        )
        .bind(&body.document_id)
        .bind(&guest.id)
        .fetch_optional(&state.db)
        .await?
    };
    let (doc_id, _public_id, _uid, _gid) =
        doc.ok_or_else(|| AppError::not_found("Document not found"))?;

    let ver: Option<(String,)> = sqlx::query_as(
        r#"SELECT id FROM document_versions WHERE document_id = $1
           ORDER BY version DESC LIMIT 1"#,
    )
    .bind(&doc_id)
    .fetch_optional(&state.db)
    .await?;
    let ver_id = ver.ok_or_else(|| AppError::not_found("No version"))?.0;

    let job_id = generate_id("job_");
    let jti = generate_jti();
    let idem = generate_id("idem_");
    let expires_at = Utc::now() + Duration::minutes(state.cfg.job_expires_minutes);
    let api = state.cfg.api_base();
    let launch = issue_launch_jwt(
        &state.cfg.jwt_secret,
        &job_id,
        &api,
        &jti,
        state.cfg.launch_ttl_minutes,
    )?;
    let link = deep_link(&launch);

    sqlx::query(
        r#"INSERT INTO signing_jobs (
             id, document_version_id, document_id, status, placement_json, template_id,
             launch_jti, idempotency_key, expires_at
           ) VALUES ($1,$2,$3,'READY',$4,$5,$6,$7,$8)"#,
    )
    .bind(&job_id)
    .bind(&ver_id)
    .bind(&doc_id)
    .bind(placement.to_json().to_string())
    .bind(body.template_id.as_deref())
    .bind(&jti)
    .bind(&idem)
    .bind(expires_at)
    .execute(&state.db)
    .await?;

    Ok((
        jar,
        Json(json!({
            "jobId": job_id,
            "deepLink": link,
            "protocol": 1,
            "placement": placement,
            "documentId": doc_id,
            "expiresAt": expires_at.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            "idempotencyKey": idem,
            "guestRemaining": guest_remaining,
            "guestLimit": GUEST_FREE_LIMIT,
        })),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandshakeBody {
    pub launch_token: String,
}

pub async fn handshake(
    State(state): State<AppState>,
    Json(body): Json<HandshakeBody>,
) -> AppResult<Json<Value>> {
    let claims = crate::crypto::decode_launch_jwt(&state.cfg.jwt_secret, &body.launch_token)?;
    if claims.api.trim_end_matches('/') != state.cfg.api_base() {
        // Allow host aliases in dev: still require same job binding via jti.
        tracing::debug!(claim_api = %claims.api, local = %state.cfg.api_base(), "api base mismatch (allowed)");
    }

    let job = sqlx::query_as::<_, JobRow>("SELECT * FROM signing_jobs WHERE id = $1")
        .bind(&claims.job)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::coded(StatusCode::NOT_FOUND, "JOB_NOT_FOUND", "Job not found"))?;

    if job.launch_jti != claims.jti {
        return Err(AppError::coded(
            StatusCode::UNAUTHORIZED,
            "INVALID_TOKEN",
            "Launch jti mismatch",
        ));
    }
    if job.status != "READY" {
        // After complete/expire, do not mint new access tokens from the same launch JWT.
        return Err(AppError::coded(
            StatusCode::CONFLICT,
            "LAUNCH_USED",
            "Launch token already used",
        ));
    }
    if Utc::now() > job.expires_at {
        return Err(AppError::coded(
            StatusCode::GONE,
            "JOB_EXPIRED",
            "Job has expired",
        ));
    }

    // Atomic first claim. Re-handshake is allowed while READY so PIN/network retries work
    // without forcing the browser to mint a new deep link.
    if job.launch_used_at.is_none() {
        let claimed = sqlx::query(
            r#"UPDATE signing_jobs SET launch_used_at = NOW()
               WHERE id = $1 AND launch_jti = $2 AND launch_used_at IS NULL AND status = 'READY'"#,
        )
        .bind(&job.id)
        .bind(&claims.jti)
        .execute(&state.db)
        .await?
        .rows_affected();
        if claimed == 0 {
            // Lost the race or already claimed — re-load; still READY is OK.
            let again = sqlx::query_as::<_, JobRow>("SELECT * FROM signing_jobs WHERE id = $1")
                .bind(&job.id)
                .fetch_optional(&state.db)
                .await?
                .ok_or_else(|| {
                    AppError::coded(StatusCode::NOT_FOUND, "JOB_NOT_FOUND", "Job not found")
                })?;
            if again.status != "READY" {
                return Err(AppError::coded(
                    StatusCode::CONFLICT,
                    "LAUNCH_USED",
                    "Launch token already used",
                ));
            }
        }
    }

    let remaining = (job.expires_at - Utc::now()).num_minutes().max(1);
    let (access, exp) = issue_access_jwt(&state.cfg.jwt_secret, &job.id, remaining)?;

    Ok(Json(json!({
        "accessToken": access,
        "tokenType": "Bearer",
        "expiresAt": chrono::DateTime::from_timestamp(exp, 0)
            .unwrap_or_else(Utc::now)
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        "jobId": job.id,
        "apiBase": state.cfg.api_base(),
        "protocol": 1,
    })))
}

fn bearer(headers: &HeaderMap) -> AppResult<String> {
    let raw = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| {
            AppError::coded(
                StatusCode::UNAUTHORIZED,
                "INVALID_TOKEN",
                "Missing Authorization",
            )
        })?;
    let token = raw
        .strip_prefix("Bearer ")
        .or_else(|| raw.strip_prefix("bearer "))
        .ok_or_else(|| {
            AppError::coded(
                StatusCode::UNAUTHORIZED,
                "INVALID_TOKEN",
                "Expected Bearer token",
            )
        })?;
    Ok(token.to_string())
}

async fn load_job_for_access(state: &AppState, headers: &HeaderMap) -> AppResult<JobRow> {
    let token = bearer(headers)?;
    let claims = crate::crypto::decode_access_jwt(&state.cfg.jwt_secret, &token)?;
    let job = sqlx::query_as::<_, JobRow>("SELECT * FROM signing_jobs WHERE id = $1")
        .bind(&claims.job)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::coded(StatusCode::NOT_FOUND, "JOB_NOT_FOUND", "Job not found"))?;
    if Utc::now() > job.expires_at && job.status == "READY" {
        return Err(AppError::coded(
            StatusCode::GONE,
            "JOB_EXPIRED",
            "Job has expired",
        ));
    }
    Ok(job)
}

pub async fn signer_job(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<Value>> {
    let job = load_job_for_access(&state, &headers).await?;
    if job.status != "READY" {
        return Err(AppError::coded(
            StatusCode::BAD_REQUEST,
            "JOB_NOT_READY",
            "Job is not ready for signing",
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

    let exp = Utc::now().timestamp() + 3600;
    let sig = file_download_sig(&state.cfg.jwt_secret, &job.id, exp);
    let download_url = format!(
        "{}/api/v1/signer/file?job={}&exp={exp}&k={sig}",
        state.cfg.api_base(),
        job.id
    );
    let seal_image_url = job.seal_image_key.as_ref().map(|k| {
        state
            .storage
            .signed_file_url(&state.cfg.jwt_secret, k, 3600)
    });

    Ok(Json(json!({
        "jobId": job.id,
        "status": "ready",
        "document": { "title": title, "publicId": public_id },
        "placement": placement,
        "downloadUrl": download_url,
        "storageKeyHint": storage_key,
        "sealImageUrl": seal_image_url,
        "templateId": job.template_id,
        "idempotencyKey": job.idempotency_key,
        "expiresAt": job.expires_at.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
    })))
}

#[derive(Deserialize)]
pub struct FileQuery {
    pub job: String,
    pub exp: i64,
    pub k: String,
}

pub async fn signer_file(
    State(state): State<AppState>,
    Query(q): Query<FileQuery>,
) -> AppResult<impl axum::response::IntoResponse> {
    if !verify_file_download_sig(&state.cfg.jwt_secret, &q.job, q.exp, &q.k) {
        return Err(AppError::coded(
            StatusCode::UNAUTHORIZED,
            "INVALID_TOKEN",
            "Invalid or expired download signature",
        ));
    }
    let key: Option<(String,)> = sqlx::query_as(
        r#"SELECT v.storage_key FROM signing_jobs j
           JOIN document_versions v ON v.id = j.document_version_id
           WHERE j.id = $1"#,
    )
    .bind(&q.job)
    .fetch_optional(&state.db)
    .await?;
    let key = key.ok_or_else(|| AppError::not_found("File not found"))?.0;
    let bytes = state.storage.read(&key).await?;
    Ok((
        [(axum::http::header::CONTENT_TYPE, "application/pdf")],
        bytes,
    ))
}

pub async fn complete(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> AppResult<Json<Value>> {
    let job = load_job_for_access(&state, &headers).await?;

    let idem_header = headers
        .get("idempotency-key")
        .or_else(|| headers.get("Idempotency-Key"))
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if !idem_header.is_empty() && idem_header != job.idempotency_key {
        return Err(AppError::coded(
            StatusCode::BAD_REQUEST,
            "IDEMPOTENCY_MISMATCH",
            "Idempotency-Key does not match job",
        ));
    }

    if job.status == "COMPLETED" {
        if let Some(raw) = &job.complete_response_json {
            let v: Value = serde_json::from_str(raw).unwrap_or(json!({}));
            return Ok(Json(v));
        }
    }
    if Utc::now() > job.expires_at && job.status == "READY" {
        return Err(AppError::coded(
            StatusCode::GONE,
            "JOB_EXPIRED",
            "Job has expired",
        ));
    }
    // Claim the job so concurrent completes cannot double-write versions/quota.
    let claimed = sqlx::query(
        r#"UPDATE signing_jobs SET status = 'COMPLETING'
           WHERE id = $1 AND status = 'READY'"#,
    )
    .bind(&job.id)
    .execute(&state.db)
    .await?
    .rows_affected();
    if claimed == 0 {
        let again = sqlx::query_as::<_, JobRow>("SELECT * FROM signing_jobs WHERE id = $1")
            .bind(&job.id)
            .fetch_optional(&state.db)
            .await?
            .ok_or_else(|| {
                AppError::coded(StatusCode::NOT_FOUND, "JOB_NOT_FOUND", "Job not found")
            })?;
        if again.status == "COMPLETED" {
            if let Some(raw) = &again.complete_response_json {
                let v: Value = serde_json::from_str(raw).unwrap_or(json!({}));
                return Ok(Json(v));
            }
        }
        return Err(AppError::coded(
            StatusCode::CONFLICT,
            "JOB_NOT_READY",
            "Job is not ready for signing",
        ));
    }

    async fn release_claim(state: &AppState, job_id: &str) {
        let _ = sqlx::query(
            "UPDATE signing_jobs SET status = 'READY' WHERE id = $1 AND status = 'COMPLETING'",
        )
        .bind(job_id)
        .execute(&state.db)
        .await;
    }

    let mut file_bytes: Option<Vec<u8>> = None;
    let mut cert_meta_raw: Option<String> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::coded(StatusCode::BAD_REQUEST, "INVALID_MULTIPART", e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        if name == "file" || name == "signedPdf" {
            let data = field.bytes().await.map_err(|e| {
                AppError::coded(StatusCode::BAD_REQUEST, "INVALID_MULTIPART", e.to_string())
            })?;
            if data.len() > state.cfg.max_signed_pdf_bytes {
                release_claim(&state, &job.id).await;
                return Err(AppError::coded(
                    StatusCode::PAYLOAD_TOO_LARGE,
                    "FILE_TOO_LARGE",
                    "Signed PDF exceeds 25MB",
                ));
            }
            file_bytes.replace(data.to_vec());
        } else if name == "certMeta" {
            cert_meta_raw = Some(field.text().await.unwrap_or_default());
        }
    }
    let bytes = match file_bytes {
        Some(b) => b,
        None => {
            release_claim(&state, &job.id).await;
            return Err(AppError::coded(
                StatusCode::BAD_REQUEST,
                "INVALID_MULTIPART",
                "Missing signed PDF",
            ));
        }
    };

    let cert_meta: Option<Value> = match cert_meta_raw.as_deref() {
        Some(s) if !s.trim().is_empty() => match serde_json::from_str(s) {
            Ok(v) => Some(v),
            Err(_) => {
                release_claim(&state, &job.id).await;
                return Err(AppError::coded(
                    StatusCode::BAD_REQUEST,
                    "INVALID_CERT_META",
                    "certMeta must be JSON",
                ));
            }
        },
        _ => None,
    };

    let verified = match verify_signed_pdf(&bytes, cert_meta.as_ref()) {
        Ok(v) => v,
        Err(e) => {
            release_claim(&state, &job.id).await;
            return Err(e);
        }
    };
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
    let cur_ver: i32 = sqlx::query_scalar("SELECT version FROM document_versions WHERE id = $1")
        .bind(&job.document_version_id)
        .fetch_one(&state.db)
        .await?;
    let next_version = cur_ver + 1;
    let storage_key = format!("documents/{public_id}/v{next_version}.pdf");
    state.storage.upload(&storage_key, &pdf).await?;
    let out_id = generate_id("ver_");
    sqlx::query(
        r#"INSERT INTO document_versions (id, document_id, version, storage_key, storage_driver, size_bytes)
           VALUES ($1,$2,$3,$4,'local',$5)"#,
    )
    .bind(&out_id)
    .bind(&job.document_id)
    .bind(next_version)
    .bind(&storage_key)
    .bind(pdf.len() as i32)
    .execute(&state.db)
    .await?;

    let app = state.cfg.api_base();
    let response = json!({
        "signedPublicUrl": format!("{app}/d/{public_id}"),
        "signedDownloadUrl": state.storage.signed_file_url(
            &state.cfg.jwt_secret,
            &storage_key,
            3600,
        ),
        "publicId": public_id,
        "versionNumber": next_version,
        "verify": verified.report_json,
        "idempotent": false,
    });

    sqlx::query(
        r#"UPDATE signing_jobs SET
             status = 'COMPLETED',
             output_version_id = $2,
             cert_meta_json = $3,
             verify_report_json = $4,
             complete_response_json = $5,
             completed_at = NOW()
           WHERE id = $1"#,
    )
    .bind(&job.id)
    .bind(&out_id)
    .bind(cert_meta.as_ref().map(|v| v.to_string()))
    .bind(verified.report_json.to_string())
    .bind(response.to_string())
    .execute(&state.db)
    .await?;

    record_completion(&state, &job.id, &job.document_id).await?;

    // Refresh file retention clock from sign time; count toward account quota.
    let new_expires = expires_from_now(&state.cfg);
    let _ =
        sqlx::query(r#"UPDATE documents SET expires_at = $2 WHERE id = $1 AND purged_at IS NULL"#)
            .bind(&job.document_id)
            .bind(new_expires)
            .execute(&state.db)
            .await;

    if let Some(uid) =
        sqlx::query_as::<_, (Option<String>,)>("SELECT user_id FROM documents WHERE id = $1")
            .bind(&job.document_id)
            .fetch_optional(&state.db)
            .await?
            .and_then(|r| r.0)
    {
        record_signed_usage(&state, &uid).await?;
    }

    Ok(Json(response))
}

pub async fn status(
    State(state): State<AppState>,
    user: OptionalUser,
    jar: CookieJar,
    Path(job_id): Path<String>,
) -> AppResult<Json<Value>> {
    let job = if let Some(u) = &user.0 {
        sqlx::query_as::<_, JobRow>(
            r#"SELECT j.* FROM signing_jobs j
               JOIN documents d ON d.id = j.document_id
               WHERE j.id = $1 AND d.user_id = $2"#,
        )
        .bind(&job_id)
        .bind(&u.id)
        .fetch_optional(&state.db)
        .await?
    } else if let Some(g) = guest_from_jar(&state, &jar).await? {
        sqlx::query_as::<_, JobRow>(
            r#"SELECT j.* FROM signing_jobs j
               JOIN documents d ON d.id = j.document_id
               WHERE j.id = $1 AND d.guest_id = $2"#,
        )
        .bind(&job_id)
        .bind(&g.id)
        .fetch_optional(&state.db)
        .await?
    } else {
        None
    }
    .ok_or_else(|| AppError::coded(StatusCode::NOT_FOUND, "JOB_NOT_FOUND", "Job not found"))?;

    let mut status = job.status.clone();
    if status == "READY" && Utc::now() > job.expires_at {
        status = "EXPIRED".into();
        let _ = sqlx::query("UPDATE signing_jobs SET status = 'EXPIRED' WHERE id = $1")
            .bind(&job_id)
            .execute(&state.db)
            .await;
    }

    let mut signed_download_url = None;
    if status == "COMPLETED" {
        if let Some(oid) = &job.output_version_id {
            let key: Option<(String,)> =
                sqlx::query_as("SELECT storage_key FROM document_versions WHERE id = $1")
                    .bind(oid)
                    .fetch_optional(&state.db)
                    .await?;
            if let Some((k,)) = key {
                signed_download_url = Some(state.storage.signed_file_url(
                    &state.cfg.jwt_secret,
                    &k,
                    3600,
                ));
            }
        }
    }

    let doc_exp: Option<(Option<chrono::DateTime<Utc>>,)> =
        sqlx::query_as("SELECT expires_at FROM documents WHERE id = $1")
            .bind(&job.document_id)
            .fetch_optional(&state.db)
            .await?;
    let file_expires = doc_exp.and_then(|r| r.0);
    let remaining_secs = file_expires.map(|e| (e - Utc::now()).num_seconds().max(0));

    Ok(Json(json!({
        "status": status,
        "expiresAt": job.expires_at.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        "completedAt": job.completed_at.map(|t| t.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)),
        "signedDownloadUrl": signed_download_url,
        "fileExpiresAt": file_expires.map(|t| t.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)),
        "retentionHours": state.cfg.file_retention_hours,
        "retentionLabel": retention_label(state.cfg.file_retention_hours),
        "remainingSeconds": remaining_secs,
        "protocol": 1,
    })))
}
