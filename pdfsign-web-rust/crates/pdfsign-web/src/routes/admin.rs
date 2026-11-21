use crate::auth::{user_from_jar, AuthUser};
use crate::error::{AppError, AppResult};
use crate::plans::{is_valid_plan, PLAN_FREE};
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use axum_extra::extract::cookie::CookieJar;
use serde::Deserialize;
use serde_json::{json, Value};

async fn require_admin(
    state: &AppState,
    jar: &CookieJar,
    headers: &HeaderMap,
) -> AppResult<()> {
    if let Some(token) = &state.cfg.admin_token {
        if let Some(auth) = headers.get(axum::http::header::AUTHORIZATION) {
            if let Ok(v) = auth.to_str() {
                if v == format!("Bearer {token}") || v == *token {
                    return Ok(());
                }
            }
        }
        if headers
            .get("X-Admin-Token")
            .and_then(|v| v.to_str().ok())
            == Some(token.as_str())
        {
            return Ok(());
        }
    }
    if let Some(u) = user_from_jar(state, jar).await? {
        if u.role.eq_ignore_ascii_case("ADMIN") {
            return Ok(());
        }
    }
    Err(AppError::new(StatusCode::FORBIDDEN, "Admin only"))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetPlanBody {
    pub plan: String,
    pub plan_period: Option<String>,
}

pub async fn set_user_plan(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
    Path(user_id): Path<String>,
    Json(body): Json<SetPlanBody>,
) -> AppResult<Json<Value>> {
    require_admin(&state, &jar, &headers).await?;
    if !is_valid_plan(&body.plan) {
        return Err(AppError::bad(format!(
            "Invalid plan (use free|personal|business|unlimited), got {}",
            body.plan
        )));
    }
    let period = body
        .plan_period
        .unwrap_or_else(|| "monthly".into())
        .to_lowercase();
    if period != "monthly" && period != "yearly" {
        return Err(AppError::bad("planPeriod must be monthly or yearly"));
    }

    let updated: Option<(String, String, String)> = sqlx::query_as(
        r#"UPDATE users
           SET plan = $2, plan_period = $3,
               quota_used = 0,
               quota_period_start = date_trunc('month', NOW())
           WHERE id = $1 OR email = $1
           RETURNING id, email, plan"#,
    )
    .bind(&user_id)
    .bind(&body.plan)
    .bind(&period)
    .fetch_optional(&state.db)
    .await?;

    let Some((id, email, plan)) = updated else {
        return Err(AppError::not_found("User not found"));
    };

    Ok(Json(json!({
        "id": id,
        "email": email,
        "plan": plan,
        "planPeriod": period,
        "ok": true,
    })))
}

pub async fn list_users(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
    _user: AuthUser,
) -> AppResult<Json<Value>> {
    require_admin(&state, &jar, &headers).await?;
    let rows: Vec<(String, String, Option<String>, String, String, i32, i32)> = sqlx::query_as(
        r#"SELECT id, email, name, plan, plan_period, trial_files_used, quota_used
           FROM users ORDER BY created_at DESC LIMIT 200"#,
    )
    .fetch_all(&state.db)
    .await?;
    let users: Vec<Value> = rows
        .into_iter()
        .map(|(id, email, name, plan, period, trial, used)| {
            json!({
                "id": id,
                "email": email,
                "name": name,
                "plan": plan,
                "planPeriod": period,
                "trialFilesUsed": trial,
                "quotaUsed": used,
            })
        })
        .collect();
    Ok(Json(json!({ "users": users, "defaultPlan": PLAN_FREE })))
}
