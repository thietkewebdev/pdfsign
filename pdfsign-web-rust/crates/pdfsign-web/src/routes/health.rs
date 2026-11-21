use axum::Json;
use serde_json::{json, Value};

pub async fn health() -> Json<Value> {
    Json(json!({
        "ok": true,
        "service": "pdfsign-web",
        "version": env!("CARGO_PKG_VERSION"),
        "protocol": 1,
    }))
}
