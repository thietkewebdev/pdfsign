use axum::http::StatusCode;
use axum::Json;
use serde_json::{json, Value};
use std::path::PathBuf;

/// Mirror of WPF auto-update manifest. Prefer repo file; fall back to stub.
pub async fn manifest() -> Result<Json<Value>, StatusCode> {
    let candidates = [
        PathBuf::from("../pdfsignpro-signer-wpf/signer-manifest.json"),
        PathBuf::from("pdfsignpro-signer-wpf/signer-manifest.json"),
        PathBuf::from("/workspace/pdfsignpro-signer-wpf/signer-manifest.json"),
    ];
    for p in candidates {
        if let Ok(raw) = tokio::fs::read_to_string(&p).await {
            if let Ok(v) = serde_json::from_str::<Value>(&raw) {
                return Ok(Json(v));
            }
        }
    }
    Ok(Json(json!({
        "version": "0.0.0-dev",
        "downloadUrl": "/api/signer/download",
        "sha256": "",
        "sizeBytes": 0,
        "releaseNotes": "Dev stub — point SIGNER_DOWNLOAD_URL at a real Setup.",
        "channel": "dev"
    })))
}

pub async fn download() -> Result<Json<Value>, StatusCode> {
    if let Ok(url) = std::env::var("SIGNER_DOWNLOAD_URL") {
        return Ok(Json(json!({ "url": url })));
    }
    Err(StatusCode::NOT_FOUND)
}
