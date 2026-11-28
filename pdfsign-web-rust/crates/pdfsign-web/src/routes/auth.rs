use crate::auth::{
    clear_session, create_session, hash_password, user_from_jar, verify_password, AuthUser,
};
use crate::crypto::generate_id;
use crate::error::{AppError, AppResult};
use crate::guest::attach_guest_docs_to_user;
use crate::state::AppState;
use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use axum_extra::extract::cookie::CookieJar;
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
pub struct RegisterBody {
    pub email: String,
    pub password: String,
    pub name: Option<String>,
}

#[derive(Deserialize)]
pub struct LoginBody {
    pub email: String,
    pub password: String,
}

pub async fn register(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<RegisterBody>,
) -> AppResult<(CookieJar, Json<Value>)> {
    let email = body.email.trim().to_lowercase();
    if !email.contains('@') || body.password.len() < 8 {
        return Err(AppError::bad(
            "Email hoặc mật khẩu không hợp lệ (tối thiểu 8 ký tự)",
        ));
    }
    let exists: Option<(String,)> = sqlx::query_as("SELECT id FROM users WHERE email = $1")
        .bind(&email)
        .fetch_optional(&state.db)
        .await?;
    if exists.is_some() {
        return Err(AppError::new(StatusCode::CONFLICT, "Email đã được dùng"));
    }
    let id = generate_id("usr_");
    let hash = hash_password(&body.password)?;
    sqlx::query(r#"INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)"#)
        .bind(&id)
        .bind(&email)
        .bind(body.name.as_deref())
        .bind(&hash)
        .execute(&state.db)
        .await?;

    let jar = create_session(&state, jar, &id).await?;
    attach_guest_docs_to_user(&state, &jar, &id).await?;
    Ok((
        jar,
        Json(json!({ "id": id, "email": email, "name": body.name })),
    ))
}

pub async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<LoginBody>,
) -> AppResult<(CookieJar, Json<Value>)> {
    let email = body.email.trim().to_lowercase();
    let row: Option<(String, String, Option<String>, String)> = sqlx::query_as(
        r#"SELECT id, password_hash, name, plan FROM users
           WHERE email = $1 AND is_disabled = FALSE"#,
    )
    .bind(&email)
    .fetch_optional(&state.db)
    .await?;

    let Some((id, hash, name, plan)) = row else {
        return Err(AppError::unauthorized("Email hoặc mật khẩu sai"));
    };
    if !verify_password(&body.password, &hash) {
        return Err(AppError::unauthorized("Email hoặc mật khẩu sai"));
    }
    let jar = create_session(&state, jar, &id).await?;
    attach_guest_docs_to_user(&state, &jar, &id).await?;
    Ok((
        jar,
        Json(json!({ "id": id, "email": email, "name": name, "plan": plan })),
    ))
}

pub async fn logout(
    State(state): State<AppState>,
    jar: CookieJar,
) -> AppResult<(CookieJar, Json<Value>)> {
    let jar = clear_session(&state, jar).await?;
    Ok((jar, Json(json!({ "ok": true }))))
}

pub async fn me(State(state): State<AppState>, jar: CookieJar) -> AppResult<Json<Value>> {
    match user_from_jar(&state, &jar).await? {
        Some(u) => {
            let quota = crate::plans::quota_status(&state, &u.id).await.ok();
            Ok(Json(json!({
                "id": u.id,
                "email": u.email,
                "name": u.name,
                "role": u.role,
                "plan": u.plan,
                "quota": quota,
            })))
        }
        None => Err(AppError::unauthorized("Unauthorized")),
    }
}

pub async fn _require(_user: AuthUser) {}
