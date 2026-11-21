//! Guest signing sessions: cookie + fingerprint, 2 free completed signatures.

use crate::crypto::{generate_id, generate_session_token, sha256_hex};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use axum::http::HeaderMap;
use axum::http::StatusCode;
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use chrono::{Duration, Utc};
use sqlx::FromRow;

pub const GUEST_FREE_LIMIT: i64 = 2;
pub const GUEST_COOKIE: &str = "pdfsign_guest";
pub const FP_HEADER: &str = "x-pdfsign-fingerprint";

#[derive(Debug, Clone, FromRow)]
pub struct GuestSession {
    pub id: String,
    pub guest_token: String,
    pub fingerprint_hash: Option<String>,
    pub ip_hash: Option<String>,
}

pub fn fingerprint_from_headers(headers: &HeaderMap) -> Option<String> {
    headers
        .get(FP_HEADER)
        .or_else(|| headers.get("X-Pdfsign-Fingerprint"))
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && s.len() <= 128)
}

pub fn client_ip(headers: &HeaderMap) -> String {
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| "unknown".into())
}

pub fn hash_fp(raw: &str) -> String {
    sha256_hex(&format!("fp:{raw}"))
}

pub fn hash_ip(ip: &str) -> String {
    sha256_hex(&format!("ip:{ip}"))
}

pub async fn guest_from_jar(
    state: &AppState,
    jar: &CookieJar,
) -> AppResult<Option<GuestSession>> {
    let Some(c) = jar.get(GUEST_COOKIE) else {
        return Ok(None);
    };
    let row = sqlx::query_as::<_, GuestSession>(
        r#"SELECT id, guest_token, fingerprint_hash, ip_hash
           FROM guest_sessions
           WHERE guest_token = $1 AND expires_at > NOW()"#,
    )
    .bind(c.value())
    .fetch_optional(&state.db)
    .await?;
    Ok(row)
}

pub async fn ensure_guest(
    state: &AppState,
    jar: CookieJar,
    headers: &HeaderMap,
) -> AppResult<(CookieJar, GuestSession)> {
    if let Some(g) = guest_from_jar(state, &jar).await? {
        // refresh fingerprint/ip if newly provided
        let fp = fingerprint_from_headers(headers).map(|r| hash_fp(&r));
        let ip = hash_ip(&client_ip(headers));
        if g.fingerprint_hash.is_none() && fp.is_some() {
            let _ = sqlx::query(
                "UPDATE guest_sessions SET fingerprint_hash = $2, ip_hash = $3 WHERE id = $1",
            )
            .bind(&g.id)
            .bind(fp.as_deref())
            .bind(&ip)
            .execute(&state.db)
            .await;
        }
        return Ok((jar, g));
    }

    let id = generate_id("gst_");
    let token = generate_session_token();
    let fp = fingerprint_from_headers(headers).map(|r| hash_fp(&r));
    let ip = hash_ip(&client_ip(headers));
    let expires = Utc::now() + Duration::days(30);
    sqlx::query(
        r#"INSERT INTO guest_sessions (id, guest_token, fingerprint_hash, ip_hash, expires_at)
           VALUES ($1,$2,$3,$4,$5)"#,
    )
    .bind(&id)
    .bind(&token)
    .bind(fp.as_deref())
    .bind(&ip)
    .bind(expires)
    .execute(&state.db)
    .await?;

    let mut cookie = Cookie::new(GUEST_COOKIE, token.clone());
    cookie.set_http_only(true);
    cookie.set_path("/");
    cookie.set_same_site(SameSite::Lax);
    if state.cfg.cookie_secure {
        cookie.set_secure(true);
    }
    cookie.set_max_age(time::Duration::days(30));

    Ok((
        jar.add(cookie),
        GuestSession {
            id,
            guest_token: token,
            fingerprint_hash: fp,
            ip_hash: Some(ip),
        },
    ))
}

pub async fn completed_count(
    state: &AppState,
    guest: &GuestSession,
    headers: &HeaderMap,
) -> AppResult<i64> {
    let fp = guest
        .fingerprint_hash
        .clone()
        .or_else(|| fingerprint_from_headers(headers).map(|r| hash_fp(&r)));
    let count: (i64,) = sqlx::query_as(
        r#"SELECT COUNT(*)::bigint FROM guest_completions
           WHERE guest_id = $1
              OR ($2::text IS NOT NULL AND fingerprint_hash = $2)"#,
    )
    .bind(&guest.id)
    .bind(fp.as_deref())
    .fetch_one(&state.db)
    .await?;
    Ok(count.0)
}

pub async fn assert_under_limit(
    state: &AppState,
    guest: &GuestSession,
    headers: &HeaderMap,
) -> AppResult<i64> {
    let n = completed_count(state, guest, headers).await?;
    if n >= GUEST_FREE_LIMIT {
        return Err(AppError::coded(
            StatusCode::FORBIDDEN,
            "GUEST_LIMIT_REACHED",
            format!(
                "Khách chưa đăng ký chỉ được ký thử {} file miễn phí. Đăng ký hoặc đăng nhập để tiếp tục.",
                GUEST_FREE_LIMIT
            ),
        ));
    }
    Ok(n)
}

pub async fn record_completion(
    state: &AppState,
    job_id: &str,
    document_id: &str,
) -> AppResult<()> {
    let row: Option<(Option<String>,)> =
        sqlx::query_as("SELECT guest_id FROM documents WHERE id = $1")
            .bind(document_id)
            .fetch_optional(&state.db)
            .await?;
    let Some((Some(guest_id),)) = row else {
        return Ok(());
    };
    let guest: Option<GuestSession> = sqlx::query_as(
        r#"SELECT id, guest_token, fingerprint_hash, ip_hash
           FROM guest_sessions WHERE id = $1"#,
    )
    .bind(&guest_id)
    .fetch_optional(&state.db)
    .await?;
    let Some(g) = guest else {
        return Ok(());
    };
    let id = generate_id("gsc_");
    let _ = sqlx::query(
        r#"INSERT INTO guest_completions (id, guest_id, fingerprint_hash, ip_hash, job_id)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (job_id) DO NOTHING"#,
    )
    .bind(&id)
    .bind(&g.id)
    .bind(g.fingerprint_hash.as_deref())
    .bind(g.ip_hash.as_deref())
    .bind(job_id)
    .execute(&state.db)
    .await;
    Ok(())
}

pub async fn attach_guest_docs_to_user(
    state: &AppState,
    jar: &CookieJar,
    user_id: &str,
) -> AppResult<()> {
    let Some(g) = guest_from_jar(state, jar).await? else {
        return Ok(());
    };
    sqlx::query(
        r#"UPDATE documents SET user_id = $1
           WHERE guest_id = $2 AND (user_id IS NULL OR user_id = $1)"#,
    )
    .bind(user_id)
    .bind(&g.id)
    .execute(&state.db)
    .await?;
    Ok(())
}
