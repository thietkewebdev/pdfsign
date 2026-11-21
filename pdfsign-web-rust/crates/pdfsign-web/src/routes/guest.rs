use crate::error::AppResult;
use crate::guest::{
    completed_count, ensure_guest, guest_from_jar, GUEST_FREE_LIMIT,
};
use crate::state::AppState;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::Json;
use axum_extra::extract::cookie::CookieJar;
use serde_json::{json, Value};

pub async fn quota(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
) -> AppResult<(CookieJar, Json<Value>)> {
    let (jar, guest) = if let Some(g) = guest_from_jar(&state, &jar).await? {
        (jar, g)
    } else {
        ensure_guest(&state, jar, &headers).await?
    };
    let used = completed_count(&state, &guest, &headers).await?;
    Ok((
        jar,
        Json(json!({
            "limit": GUEST_FREE_LIMIT,
            "used": used,
            "remaining": (GUEST_FREE_LIMIT - used).max(0),
            "guestId": guest.id,
        })),
    ))
}
