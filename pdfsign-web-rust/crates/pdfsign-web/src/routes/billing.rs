use crate::auth::{AuthUser, OptionalUser};
use crate::error::AppResult;
use crate::plans::{all_plans, quota_status};
use crate::state::AppState;
use axum::extract::State;
use axum::Json;
use serde_json::{json, Value};

pub async fn plans(State(state): State<AppState>) -> AppResult<Json<Value>> {
    Ok(Json(json!({
        "vatIncluded": true,
        "lead": "Giá đã gồm VAT. Có hóa đơn điện tử.",
        "yearlyBonus": "Trả theo năm, tặng 2 tháng",
        "registeredTrialFiles": state.cfg.registered_trial_files,
        "guestFreeFiles": crate::guest::GUEST_FREE_LIMIT,
        "plans": all_plans(),
        "contact": {
            "hotline": "0984.056.777",
            "tel": "0984056777",
            "zalo": "https://zalo.me/0984056777",
        },
    })))
}

pub async fn my_quota(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    let q = quota_status(&state, &user.0.id).await?;
    Ok(Json(json!(q)))
}

pub async fn me_or_anon_quota(
    State(state): State<AppState>,
    user: OptionalUser,
) -> AppResult<Json<Value>> {
    if let Some(u) = user.0 {
        let q = quota_status(&state, &u.id).await?;
        return Ok(Json(json!(q)));
    }
    Ok(Json(json!({
        "plan": "guest",
        "canSign": true,
        "guestLimit": crate::guest::GUEST_FREE_LIMIT,
    })))
}
