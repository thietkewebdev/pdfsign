use crate::error::{AppError, AppResult};
use crate::services::verify_complete::verify_signed_pdf;
use axum::extract::Multipart;
use axum::Json;
use serde_json::{json, Value};

pub async fn verify_upload(mut multipart: Multipart) -> AppResult<Json<Value>> {
    let mut file_bytes: Option<Vec<u8>> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::bad(e.to_string()))?
    {
        if field.name() == Some("file") {
            file_bytes = Some(
                field
                    .bytes()
                    .await
                    .map_err(|e| AppError::bad(e.to_string()))?
                    .to_vec(),
            );
        }
    }
    let bytes = file_bytes.ok_or_else(|| AppError::bad("Missing file"))?;
    let out = verify_signed_pdf(&bytes, None)?;
    Ok(Json(json!({
        "ok": out.report.iter().any(|r| r.digest_ok && r.signature_ok),
        "signatures": out.report_json,
    })))
}
