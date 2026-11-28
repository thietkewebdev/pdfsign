//! Account plans + signing quotas. Payment is out of scope; admin sets plan.

use crate::config::Config;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use axum::http::StatusCode;
use chrono::{Datelike, TimeZone, Utc};
use serde::Serialize;

pub const PLAN_FREE: &str = "free";
pub const PLAN_PERSONAL: &str = "personal";
pub const PLAN_BUSINESS: &str = "business";
pub const PLAN_UNLIMITED: &str = "unlimited";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanDef {
    pub id: &'static str,
    pub name: &'static str,
    pub monthly_vnd: Option<i64>,
    pub yearly_vnd: Option<i64>,
    pub monthly_file_quota: Option<i32>,
    pub max_users: Option<i32>,
    pub featured: bool,
}

pub fn all_plans() -> &'static [PlanDef] {
    &[
        PlanDef {
            id: PLAN_FREE,
            name: "Miễn phí",
            monthly_vnd: Some(0),
            yearly_vnd: Some(0),
            monthly_file_quota: None,
            max_users: Some(1),
            featured: false,
        },
        PlanDef {
            id: PLAN_PERSONAL,
            name: "Cá nhân",
            monthly_vnd: Some(49_000),
            yearly_vnd: Some(490_000),
            monthly_file_quota: Some(50),
            max_users: Some(1),
            featured: false,
        },
        PlanDef {
            id: PLAN_BUSINESS,
            name: "Doanh nghiệp",
            monthly_vnd: Some(199_000),
            yearly_vnd: Some(1_990_000),
            monthly_file_quota: Some(500),
            max_users: Some(5),
            featured: true,
        },
        PlanDef {
            id: PLAN_UNLIMITED,
            name: "Không giới hạn",
            monthly_vnd: Some(499_000),
            yearly_vnd: Some(4_990_000),
            monthly_file_quota: None, // unlimited
            max_users: None,
            featured: false,
        },
    ]
}

pub fn plan_by_id(id: &str) -> Option<&'static PlanDef> {
    all_plans().iter().find(|p| p.id == id)
}

pub fn is_valid_plan(id: &str) -> bool {
    plan_by_id(id).is_some()
}

/// Period start = first day of current UTC month.
pub fn current_quota_period_start() -> chrono::DateTime<Utc> {
    let now = Utc::now();
    Utc.with_ymd_and_hms(now.year(), now.month(), 1, 0, 0, 0)
        .single()
        .unwrap_or(now)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaStatus {
    pub plan: String,
    pub plan_period: String,
    pub monthly_file_quota: Option<i32>,
    pub quota_used: i32,
    pub remaining: Option<i32>,
    pub trial_files_used: i32,
    pub trial_files_limit: i32,
    pub trial_remaining: i32,
    pub can_sign: bool,
    pub upgrade_required: bool,
}

type UserQuotaRow = (
    String,
    String,
    i32,
    i32,
    Option<chrono::DateTime<Utc>>,
);

pub async fn load_user_quota(state: &AppState, user_id: &str) -> AppResult<UserQuotaRow> {
    let row: Option<UserQuotaRow> = sqlx::query_as(
        r#"SELECT plan, plan_period, trial_files_used, quota_used, quota_period_start
           FROM users WHERE id = $1"#,
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;
    row.ok_or_else(|| AppError::not_found("Không tìm thấy người dùng"))
}

pub async fn ensure_quota_period(state: &AppState, user_id: &str) -> AppResult<()> {
    let period = current_quota_period_start();
    sqlx::query(
        r#"UPDATE users
           SET quota_period_start = $2, quota_used = 0
           WHERE id = $1
             AND (quota_period_start IS NULL OR quota_period_start < $2)"#,
    )
    .bind(user_id)
    .bind(period)
    .execute(&state.db)
    .await?;
    Ok(())
}

pub async fn quota_status(state: &AppState, user_id: &str) -> AppResult<QuotaStatus> {
    ensure_quota_period(state, user_id).await?;
    let (plan, plan_period, trial_used, quota_used, _) = load_user_quota(state, user_id).await?;
    let trial_limit = state.cfg.registered_trial_files;
    let def = plan_by_id(&plan);
    let monthly = def.and_then(|d| d.monthly_file_quota);

    let (can_sign, upgrade_required, remaining) = if plan == PLAN_FREE {
        let trial_remaining = (trial_limit - trial_used).max(0);
        (
            trial_remaining > 0,
            trial_remaining <= 0,
            Some(trial_remaining),
        )
    } else if plan == PLAN_UNLIMITED {
        (true, false, None)
    } else {
        let limit = monthly.unwrap_or(0);
        let rem = (limit - quota_used).max(0);
        (rem > 0, rem <= 0, Some(rem))
    };

    Ok(QuotaStatus {
        plan,
        plan_period,
        monthly_file_quota: monthly,
        quota_used,
        remaining,
        trial_files_used: trial_used,
        trial_files_limit: trial_limit,
        trial_remaining: (trial_limit - trial_used).max(0),
        can_sign,
        upgrade_required,
    })
}

/// Block logged-in users who exhausted trial/monthly quota.
pub async fn assert_can_sign(state: &AppState, user_id: &str) -> AppResult<QuotaStatus> {
    let q = quota_status(state, user_id).await?;
    if !q.can_sign {
        return Err(AppError::coded(
            StatusCode::PAYMENT_REQUIRED,
            "PLAN_QUOTA_REACHED",
            if q.plan == PLAN_FREE {
                format!(
                    "Đã dùng hết {} file dùng thử. Nâng cấp gói để tiếp tục.",
                    state.cfg.registered_trial_files
                )
            } else {
                "Đã hết hạn mức file tháng này. Nâng cấp gói hoặc đợi kỳ mới.".into()
            },
        ));
    }
    Ok(q)
}

/// Count a completed signature against trial or monthly quota.
pub async fn record_signed_usage(state: &AppState, user_id: &str) -> AppResult<()> {
    ensure_quota_period(state, user_id).await?;
    let (plan, _, _, _, _) = load_user_quota(state, user_id).await?;
    if plan == PLAN_FREE {
        sqlx::query(r#"UPDATE users SET trial_files_used = trial_files_used + 1 WHERE id = $1"#)
            .bind(user_id)
            .execute(&state.db)
            .await?;
    } else if plan != PLAN_UNLIMITED {
        sqlx::query(r#"UPDATE users SET quota_used = quota_used + 1 WHERE id = $1"#)
            .bind(user_id)
            .execute(&state.db)
            .await?;
    }
    Ok(())
}

pub fn retention_label(hours: i64) -> String {
    if hours % 24 == 0 {
        let days = hours / 24;
        format!("Tự xóa sau {days} ngày")
    } else {
        format!("Tự xóa sau {hours} giờ")
    }
}

pub fn expires_from_now(cfg: &Config) -> chrono::DateTime<Utc> {
    Utc::now() + chrono::Duration::hours(cfg.file_retention_hours)
}
