use crate::crypto::generate_session_token;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::StatusCode;
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use chrono::{Duration, Utc};
use rand::rngs::OsRng;
use serde::Serialize;
use sqlx::FromRow;

#[derive(Debug, Clone, FromRow, Serialize)]
pub struct UserRow {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    pub role: String,
    pub plan: String,
}

pub fn hash_password(password: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| AppError::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(hash) else {
        return false;
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

pub async fn create_session(
    state: &AppState,
    jar: CookieJar,
    user_id: &str,
) -> AppResult<CookieJar> {
    let token = generate_session_token();
    let id = crate::crypto::generate_id("ses_");
    let expires = Utc::now() + Duration::days(14);
    sqlx::query(
        r#"INSERT INTO sessions (id, session_token, user_id, expires_at)
           VALUES ($1, $2, $3, $4)"#,
    )
    .bind(&id)
    .bind(&token)
    .bind(user_id)
    .bind(expires)
    .execute(&state.db)
    .await?;

    let mut cookie = Cookie::new(state.cfg.cookie_name.clone(), token);
    cookie.set_http_only(true);
    cookie.set_path("/");
    cookie.set_same_site(SameSite::Lax);
    if state.cfg.cookie_secure {
        cookie.set_secure(true);
    }
    cookie.set_max_age(time::Duration::days(14));
    Ok(jar.add(cookie))
}

pub async fn clear_session(state: &AppState, jar: CookieJar) -> AppResult<CookieJar> {
    if let Some(c) = jar.get(&state.cfg.cookie_name) {
        let _ = sqlx::query("DELETE FROM sessions WHERE session_token = $1")
            .bind(c.value())
            .execute(&state.db)
            .await;
    }
    Ok(jar.remove(Cookie::from(state.cfg.cookie_name.clone())))
}

pub async fn user_from_jar(state: &AppState, jar: &CookieJar) -> AppResult<Option<UserRow>> {
    let Some(cookie) = jar.get(&state.cfg.cookie_name) else {
        return Ok(None);
    };
    let row = sqlx::query_as::<_, UserRow>(
        r#"SELECT u.id, u.email, u.name, u.role, u.plan
           FROM sessions s
           JOIN users u ON u.id = s.user_id
           WHERE s.session_token = $1 AND s.expires_at > NOW() AND u.is_disabled = FALSE"#,
    )
    .bind(cookie.value())
    .fetch_optional(&state.db)
    .await?;
    Ok(row)
}

pub struct AuthUser(pub UserRow);

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let jar = CookieJar::from_request_parts(parts, state)
            .await
            .map_err(|_| AppError::unauthorized("Unauthorized"))?;
        match user_from_jar(state, &jar).await? {
            Some(u) => Ok(AuthUser(u)),
            None => Err(AppError::unauthorized("Unauthorized")),
        }
    }
}

pub struct OptionalUser(pub Option<UserRow>);

impl FromRequestParts<AppState> for OptionalUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let jar = CookieJar::from_request_parts(parts, state)
            .await
            .map_err(|_| AppError::bad("cookie"))?;
        Ok(OptionalUser(user_from_jar(state, &jar).await?))
    }
}
